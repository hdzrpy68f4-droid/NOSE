#!/usr/bin/env bash
# NOSE build — run before deploying.
#   1. vendors the QR library (never committed, so it cannot go stale)
#   2. re-fingerprints js/ and css/ bundles and rewrites all references
#   3. fails the build if the CSP has been loosened or inline code crept back
#   4. fails the build if an image the engine references is missing
#
# CHANGES FROM THE PREVIOUS VERSION (all documented so you can diff with confidence):
#   [FIX]  The inline-script guard matched <script type="application/ld+json">,
#          because the JSON's opening "{" satisfies the [^<] in the pattern.
#          That aborted the build with exit 1 before anything ran. JSON-LD is a
#          data block — browsers do not execute non-JS MIME type scripts and CSP
#          script-src does not govern them — so it is now excluded by type.
#          The guard still catches genuine inline <script> blocks.
#   [FIX]  Reference rewriting only touched index.html and app.html. Any other
#          static page holding a fingerprinted path kept the stale hash and
#          404'd its bundle. Now rewrites every .html in the tree.
#   [FIX]  `ls ... | head -1` could trip pipefail via SIGPIPE, and gave no useful
#          message when the glob matched nothing. Replaced with a nullglob array
#          plus an explicit error.
#   [NEW]  Verifies the six family images exist in every format the <picture>
#          element requests, plus favicon.svg. Missing images are the one class
#          of error that looks fine in the build log and broken in the browser.
#   [NEW]  Warns (does not fail) if the nose.example placeholder domain is still
#          present, so a staging deploy is still possible.
set -euo pipefail
cd "$(dirname "$0")"

# Every HTML file in the tree, excluding vendored and VCS directories.
mapfile -t HTML < <(
  find . \( -name node_modules -o -name .git -o -name vendor \) -prune \
     -o -name '*.html' -print | sort
)
[ ${#HTML[@]} -gt 0 ] || { echo "FAIL: no HTML files found"; exit 1; }
echo "==> ${#HTML[@]} HTML files in scope"

echo "==> vendoring html5-qrcode"
mkdir -p vendor
curl -fsSL https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js \
  -o vendor/html5-qrcode.min.js
test -s vendor/html5-qrcode.min.js || { echo "FAIL: QR library empty"; exit 1; }

# Content-hash a bundle and rewrite every reference to it.
#   $1 = directory ("" for repo root)   $2 = filename stem   $3 = extension
#
# Accepts the source file either un-hashed (css/hero.css — what you get after
# uploading a fresh copy) or already hashed (css/hero.a1b2c3d4.css — what is in
# the repo after a previous build). The un-hashed name wins when both exist,
# because that is the newly uploaded file; stale hashed siblings are deleted so
# orphans do not pile up.
#
# The rewrite also strips any ?v=N cache-busting query, which is no longer
# needed once the filename itself changes on every edit.
fingerprint() {
  local dir=$1 prefix=$2 ext=$3
  local base="" old new hash m
  [ -n "$dir" ] && base="$dir/"

  # NB: nullglob only drops *wildcard* patterns that match nothing, so the
  # un-hashed literal name must be tested with -f before being added.
  local matches=()
  [ -f "${base}${prefix}.${ext}" ] && matches+=("${base}${prefix}.${ext}")
  shopt -s nullglob
  matches+=("${base}${prefix}".*."${ext}")
  shopt -u nullglob
  if [ ${#matches[@]} -eq 0 ]; then
    echo "FAIL: no ${base}${prefix}.${ext} (or ${base}${prefix}.<hash>.${ext}) to fingerprint"
    exit 1
  fi

  old=${matches[0]}
  hash=$(sha256sum "$old" | cut -c1-8)
  new="${base}${prefix}.${hash}.${ext}"

  # drop any other copies (stale hashes from earlier builds)
  for m in "${matches[@]}"; do
    [ "$m" = "$old" ] && continue
    rm -f "$m"
  done

  [ "$old" != "$new" ] && mv "$old" "$new"

  # HTML: match the un-hashed name, any old hash, and any ?v=N query.
  for f in "${HTML[@]}"; do
    [ -f "$f" ] || continue
    sed -i -E "s#/${base}${prefix}(\\.[0-9a-f]+)?\\.${ext}(\\?v=[0-9]+)?#/${new}#g" "$f"
  done

  # _redirects: only ever rewrite an already-hashed target. The un-hashed
  # /js/nose.js on the left-hand side is a deliberate legacy alias — rewriting
  # it would point the redirect at itself.
  if [ -f _redirects ]; then
    sed -i -E "s#/${base}${prefix}\\.[0-9a-f]+\\.${ext}#/${new}#g" _redirects
  fi
  echo "==> $new"
}

fingerprint js  nose    js
fingerprint css shell   css
fingerprint css hero    css
fingerprint js  hero    js
fingerprint css agegate css
fingerprint js  agegate js
fingerprint ""  family  css

echo "==> sanity checks"

grep -q "script-src 'self';" _headers || { echo "FAIL: script-src loosened"; exit 1; }
grep -q "style-src 'self';"  _headers || { echo "FAIL: style-src loosened";  exit 1; }

[ "$(grep -rho 'style="' --include='*.html' . | wc -l)" -eq 0 ] \
  || { echo "FAIL: inline style attribute reintroduced"; exit 1; }
[ "$(grep -rho '<style' --include='*.html' . | wc -l)" -eq 0 ] \
  || { echo "FAIL: inline <style> reintroduced"; exit 1; }

# Executable inline scripts only. type="application/ld+json" is structured data,
# is never executed, and is not covered by script-src — see [FIX] note above.
for f in "${HTML[@]}"; do
  if grep -oE '<script[^>]*>[^<]' "$f" | grep -qv 'application/ld+json'; then
    echo "FAIL: inline script in $f"; exit 1
  fi
done

echo "==> asset checks"

# The engine builds <picture> as AVIF -> WebP -> JPEG, at 1x and 2x. A missing
# file here produces a build that passes and a page with holes in it.
fail=0
while read -r ref; do
  stem="${ref%.jpg}"
  for ext in jpg webp avif; do
    [ -f ".${stem}.${ext}" ] || { echo "FAIL: missing ${stem}.${ext}"; fail=1; }
    [ -f ".${stem}@2x.${ext}" ] \
      || echo "warn: missing ${stem}@2x.${ext} (retina will fall back to 1x)"
  done
done < <(grep -ohE '/images/families/[a-z]+\.jpg' js/nose.*.js | sort -u)

# Referenced by every page's <link rel="icon">.
[ -f "./favicon.svg" ] || { echo "FAIL: missing /favicon.svg"; fail=1; }

# Progressive enhancement — warn only.
[ -f "./images/og-card.jpg" ] \
  || echo "warn: missing /images/og-card.jpg (link previews will render bare)"
[ -f "./apple-touch-icon.png" ] \
  || echo "warn: missing /apple-touch-icon.png (iOS home-screen icon)"

[ "$fail" -eq 0 ] || exit 1

if grep -rql 'nose\.example' --include='*.html' --include='*.xml' --include='*.txt' . 2>/dev/null; then
  echo
  echo "warn: the nose.example placeholder domain is still present."
  echo "      Canonicals, Open Graph and JSON-LD will point at a domain you do not own."
  echo "      Fix with:  grep -rl 'nose.example' . | xargs sed -i 's/nose\\.example/YOURDOMAIN/g'"
  echo
fi

echo "OK — ready to deploy"

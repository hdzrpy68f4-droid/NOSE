#!/usr/bin/env bash
# NOSE — verify a directory against the deploy manifest.
#
# Aligned to build.sh (fixed version). Distinguishes:
#   MISS  = build.sh fails, or the site visibly breaks
#   warn  = build.sh warns; deploy still succeeds
#
# Usage: bash verify-manifest.sh /path/to/repo
# Exits 0 if every required file is present, 1 otherwise.

set -uo pipefail
ROOT="${1:-.}"
cd "$ROOT" || { echo "no such directory: $ROOT"; exit 1; }

missing=0; have=0; warned=0

check() { # $1=path $2=note
  if [ -e "$1" ]; then printf '  ok    %s\n' "$1"; have=$((have+1))
  else printf '  MISS  %-42s %s\n' "$1" "${2:-}"; missing=$((missing+1)); fi
}
soft() { # $1=path $2=note
  if [ -e "$1" ]; then printf '  ok    %s\n' "$1"; have=$((have+1))
  else printf '  warn  %-42s %s\n' "$1" "${2:-}"; warned=$((warned+1)); fi
}
section() { printf '\n%s\n' "$1"; }

echo "NOSE manifest check — $(pwd)"

section "Root files"
for f in index.html app.html 404.html _redirects _headers build.sh family.css \
         netlify.toml .nvmrc robots.txt sitemap.xml; do check "$f"; done
check favicon.svg "build.sh HARD FAILS without this"

section "Fingerprinted bundles — build.sh globs js/ and css/, not root"
js=$(ls js/nose.*.js 2>/dev/null | head -1)
css=$(ls css/shell.*.css 2>/dev/null | head -1)
[ -n "$js" ]  && { echo "  ok    $js"; have=$((have+1)); } \
              || { echo "  MISS  js/nose.<hash>.js      fingerprint() exits 1"; missing=$((missing+1)); }
[ -n "$css" ] && { echo "  ok    $css"; have=$((have+1)); } \
              || { echo "  MISS  css/shell.<hash>.css   fingerprint() exits 1"; missing=$((missing+1)); }

section "Static pages (12)"
for p in aromas aromas/citrus aromas/earthy aromas/spice aromas/pine \
         aromas/floral aromas/herbal learn about methodology privacy terms; do
  check "$p/index.html"
done

section "Family images — 1x required, 2x warns"
for fam in citrus earthy spice pine floral herbal; do
  for ext in jpg webp avif; do
    check "images/families/$fam.$ext"
    soft  "images/families/$fam@2x.$ext" "retina falls back to 1x"
  done
done

section "Optional assets (build.sh warns only)"
soft images/og-card.jpg   "link previews render bare"
soft apple-touch-icon.png "no iOS home-screen icon"

section "Serverless functions"
check netlify/functions/match-feedback.js "feedback votes discarded"
check netlify/functions/client-error.js   "error beacons discarded"

section "Vendored (build.sh fetches the .js — absent is fine pre-build)"
[ -s vendor/html5-qrcode.min.js ] \
  && { echo "  ok    vendor/html5-qrcode.min.js"; have=$((have+1)); } \
  || echo "  note  vendor/html5-qrcode.min.js not vendored yet — build.sh curls it"
soft vendor/README.md

section "Pre-launch"
n=$(grep -rl 'nose\.example' . 2>/dev/null | wc -l | tr -d ' ')
[ "$n" -gt 0 ] && echo "  TODO  nose.example in $n file(s) — swap for the real domain" \
               || echo "  ok    no nose.example placeholders"
grep -rq 'font-src' _headers 2>/dev/null \
  && echo "  ok    CSP has font-src" \
  || echo "  note  no font-src in CSP — self-hosted webfonts would be blocked"

printf '\n%d present, %d missing, %d warnings\n' "$have" "$missing" "$warned"
[ "$missing" -eq 0 ] || { echo "INCOMPLETE — build.sh will fail. Do not deploy."; exit 1; }
echo "Manifest complete — safe to run: bash build.sh"

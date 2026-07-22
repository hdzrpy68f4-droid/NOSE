#!/usr/bin/env bash
# NOSE build — run before deploying.
#   1. vendors the QR library (never committed, so it cannot go stale)
#   2. re-fingerprints js/ and css/ bundles and rewrites all references
#   3. fails the build if the CSP has been loosened or inline code crept back
set -euo pipefail
cd "$(dirname "$0")"

echo "==> vendoring html5-qrcode"
mkdir -p vendor
curl -fsSL https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js \
  -o vendor/html5-qrcode.min.js
test -s vendor/html5-qrcode.min.js || { echo "FAIL: QR library empty"; exit 1; }

fingerprint() { # $1=dir $2=prefix $3=ext
  local dir=$1 prefix=$2 ext=$3 old new hash
  old=$(ls "$dir/$prefix".*."$ext" | head -1)
  hash=$(sha256sum "$old" | cut -c1-8)
  new="$dir/$prefix.$hash.$ext"
  [ "$old" != "$new" ] && mv "$old" "$new"
  for f in index.html app.html _redirects; do
    sed -i -E "s#/(${dir}/)?${prefix}\.[0-9a-f]+\.${ext}#/${new}#g" "$f"
  done
  echo "==> $new"
}
fingerprint js  nose  js
fingerprint css shell css

echo "==> sanity checks"
grep -q "script-src 'self';" _headers || { echo "FAIL: script-src loosened"; exit 1; }
grep -q "style-src 'self';"  _headers || { echo "FAIL: style-src loosened";  exit 1; }
[ "$(grep -rho 'style="' --include='*.html' . | wc -l)" -eq 0 ] || { echo "FAIL: inline style attribute reintroduced"; exit 1; }
[ "$(grep -rho '<style' --include='*.html' . | wc -l)" -eq 0 ] || { echo "FAIL: inline <style> reintroduced"; exit 1; }
for f in index.html app.html; do
  grep -qE '<script[^>]*>[^<]' "$f" && { echo "FAIL: inline script in $f"; exit 1; } || true
done
echo "OK — ready to deploy"

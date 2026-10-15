# Vendored third-party scripts

## html5-qrcode@2.3.8

`html5-qrcode.min.js` is committed here, self-hosted so that no third-party
origin runs JavaScript on a page that holds camera permission. `app.html`
loads it from `/vendor/html5-qrcode.min.js`.

- **Version:** html5-qrcode 2.3.8, the npm package's `html5-qrcode.min.js`.
- **Where it came from:** jsDelivr's copy of that package,
  https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js
- **SHA-256:** `660b12437b1d747e3e68b8be0685c08cb728140110ad213f167b14b66f8b1d8e`
  (375,364 bytes). jsDelivr's own record of the file gives the same hash in
  base64, `ZgsSQ3sddH4+aLi+BoXAjLcoFAEQrSE/FnsUtm+LHY4=`, and the same size:
  https://data.jsdelivr.com/v1/packages/npm/html5-qrcode@2.3.8?structure=flat,
  entry `/html5-qrcode.min.js` (checked 2026-10-15).

`build.sh` downloads nothing. It fails unless this file exists and its SHA-256
is the pinned value, `QR_LIB_SHA256` in `build.sh`. Any other bytes - an
edit, a different version, a truncated copy - stop the build.

### If the build fails on this file

If it was changed by accident, put the committed copy back:

    git checkout -- vendor/html5-qrcode.min.js

### To upgrade

One commit changes the file and the pinned hash together.

1. Download the new version (replace `X.Y.Z`):

       curl -fsSL https://cdn.jsdelivr.net/npm/html5-qrcode@X.Y.Z/html5-qrcode.min.js \
         -o vendor/html5-qrcode.min.js

2. Check it against jsDelivr's record. Open
   `https://data.jsdelivr.com/v1/packages/npm/html5-qrcode@X.Y.Z?structure=flat`,
   find the entry `/html5-qrcode.min.js`, and compare its `hash` and `size`
   with:

       openssl dgst -sha256 -binary vendor/html5-qrcode.min.js | base64
       wc -c < vendor/html5-qrcode.min.js

   If either differs, stop: the file is not the one jsDelivr published.

3. Put the new hex hash (`sha256sum vendor/html5-qrcode.min.js`) in
   `QR_LIB_SHA256` in `build.sh`. Change the version wherever `build.sh`
   names it (`grep -n 2.3.8 build.sh`), and the version, hash, size and
   record link in this file.

4. Run `bash build.sh` and `bash scripts/gates.sh`, then commit the file,
   `build.sh` and this README together.

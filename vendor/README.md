# Vendored third-party scripts

## html5-qrcode@2.3.8
This directory must contain `html5-qrcode.min.js`, self-hosted so that no
third-party origin runs JavaScript on a page that holds camera permission.

Fetch it once at build time (the file is absent from the repo on purpose so a
stale copy can't drift):

    curl -fsSL \
      https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js \
      -o vendor/html5-qrcode.min.js

Optionally verify integrity:

    echo "EXPECTED_SHA256  vendor/html5-qrcode.min.js" | sha256sum -c -

CI note: fail the build if vendor/html5-qrcode.min.js is missing, so the
scanner can never silently ship broken.

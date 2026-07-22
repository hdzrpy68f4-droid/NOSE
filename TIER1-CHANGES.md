# Tier 1 changes — product-integrity pass

## 1. Match feedback loop restored  (the core-brand item)
The score is described on-site as "a hypothesis, not yet validated at scale."
That claim now has an instrument behind it.
- 👍/👎 on every result, with an accessible role="group" and aria-pressed states.
- Each vote posts anonymous context (score, band, palate ids, candidate id,
  timestamp — no PII) via navigator.sendBeacon, falling back to fetch(keepalive).
- Telemetry is wrapped so it can never throw into the UI; on the static
  prototype with no endpoint, votes are acknowledged and simply not persisted.
- Serverless receiver at netlify/functions/match-feedback.js (validates vote,
  clamps field lengths, 204s; persist() is stubbed to console.log with a
  Netlify Blobs example to wire up).

## 2. Static routes for /learn, /about, /methodology
Previously these existed ONLY as in-SPA hash views — unrankable, unshareable,
JS-dependent. Now real pages under their own directories, reusing the exact
copy from the SPA so nothing drifts.
- Each has: canonical, meta description, Open Graph + og:image, single <h1>,
  <main>, skip link, breadcrumb, shared static header/footer, and JSON-LD
  (TechArticle / CollectionPage / AboutPage).
- The SPA router now forwards any legacy #/methodology, #/learn, #/about,
  #/aromas to the canonical URL, so old links keep working.
- Dead in-shell views removed; shell dropped one duplicate <h1> (aromas) and
  the unreachable aromas view.

## 3. QR scanner self-hosted; CSP tightened
- Script now loads from /vendor/html5-qrcode.min.js (same-origin) instead of
  cdn.jsdelivr.net. See vendor/README.md for the one-line build fetch.
  Rationale: a third-party origin was running JS on a page holding camera
  permission. Self-hosting removes that entirely — cleaner than SRI.
- CSP script-src reduced to 'self' 'unsafe-inline' (jsdelivr removed).
- Added Permissions-Policy microphone=()/geolocation=(), X-Frame-Options: DENY,
  Cross-Origin-Opener-Policy: same-origin.

## Verified
- All 6 core-algorithm spec tests still pass (75% / 100% / THCA / LOQ /
  nerolidol / palate averaging).
- Every page parses with balanced tags, one <h1>, <main>, canonical.
- No live third-party <script src> remains.
- Feedback flow exercised under a DOM shim: button state, ack, disable, and
  beacon dispatch all fire.

## Still open (next tiers)
- Extract inline JS to /app.js and drop 'unsafe-inline' from script-src.
- Make / a lean static homepage distinct from the /app shell (they still share
  most markup; app.html only overrides title + canonical).
- Responsive images: 2x + WebP/AVIF + srcset (family JPEGs are 620px).
- px → rem for full 200%-zoom compliance.
- Wire netlify/functions/match-feedback.js persist() to a real store.

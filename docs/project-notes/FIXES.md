# NOSE — fixes applied to NOSE-netlify-final-root-fixed

## Blocking bugs fixed
1. **Mobile navigation dead-end (6 pages).** `family.css` hid every nav link
   except the CTA below 760px, but the six aroma pages ship no JS and no mobile
   menu — so on a phone they had no navigation at all. The hide rule is now
   scoped to `.site-header.has-menu` (only the SPA, which has a real menu);
   static pages wrap their links instead.
2. **THCA destroyed matches.** Cannabinoids were never excluded from the vector.
   A jar compared against itself with THCA present scored **3%**, not 100%.
   Now dropped via `sanitizeTerps()`. (Core algorithm rule 6.)
3. **No palate averaging.** `state.appPalate` was a single strain id; the core
   premise — average the normalised profiles of jars you like — was not
   implemented. Now `state.palateIds[]` + `averageProfiles()`. (Rule 2.)
4. **Saved jars were unreachable.** `renderSampleButtons()` iterated `PROFILES`
   only, so anything saved never appeared as a chip. Saved jars now render.
5. **cis/trans-nerolidol not summed** — scored 98% against its own summed
   equivalent. Now folded to one value. (Rule 6.)
6. **Below-LOQ only worked by accident** (`Number("<0.200")` → NaN). Now handled
   explicitly, including ND / BQL / ≤. (Rule 5.)
7. **Any https URL was accepted** and reported to the user as a "valid secure
   link". Added a lab domain allowlist, reused by the QR scanner.
8. **`/aromas` was a meta-refresh redirect** (WCAG 2.2.1 failure, no SEO value).
   Replaced with a real static overview page.
9. **`index.html` and `app.html` were byte-identical** with a 301 hop.
   Deduplicated intent: `/app` now 200-rewrites, each shell has its own
   canonical and title.
10. **Missing canonical URLs** on every page. Added.
11. **Images had no intrinsic dimensions** → layout shift. Added width/height
    and `decoding="async"`.

## Security note — READ BEFORE LAUNCH
`html5-qrcode` is loaded from cdn.jsdelivr.net onto a page that requests camera
access, with no Subresource Integrity. A compromised CDN would run arbitrary JS
with camera permission. Self-host it and drop the CDN from the CSP, or pin it:

    curl -s https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js \
      | openssl dgst -sha384 -binary | openssl base64 -A

A placeholder hash was deliberately NOT shipped — a wrong integrity value blocks
the script and silently kills the scanner.

## Still outstanding
- `/learn`, `/about`, `/methodology` exist only as SPA hash views. No static
  route, so they cannot rank or be shared reliably.
- Family images are 620px wide — soft on retina desktop. Need 2x + WebP/AVIF
  with `srcset`.
- The SPA shell contains 6 `<h1>` elements (one per hash view).
- `Permissions-Policy: camera=(self)` is correct, but the CSP still needs
  `'unsafe-inline'` removed for scripts once the inline bundle is extracted.

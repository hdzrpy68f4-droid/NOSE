# Tier 3 — CSP lockdown, structured data, observability, internal linking

## 7. Content-Security-Policy fully locked down
`unsafe-inline` is now gone from **both** script-src and style-src:

    default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:;
    media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:;
    frame-ancestors 'none'; base-uri 'self'; form-action 'self'

To get there:
- Extracted the 28KB inline `<style>` block — **byte-identical in both shells** —
  into `css/shell.<hash>.css`, shared and cached once.
- Converted **241 inline `style=` attributes to 0** via utility and family
  classes (`.bg-citrus`, `.famcard-pine`, `.ink-spice`, `.u-*`).
- Replaced the per-page `<style>:root{--family:…}</style>` on family pages with
  `body class="theme-<family>"`.
- Note: JS-set styles (`el.style.background = …`) are CSSOM writes and are *not*
  governed by style-src, so the dynamic aroma bars still work under this policy.

**Bug caught during this:** the bulk replacement produced **39 elements with two
`class` attributes** (e.g. `<a class="card" … class="famcard famcard-citrus">`).
Browsers silently keep the first and drop the second, so every one of those
elements would have lost its styling with no error. Detected by an attribute
audit and merged into single attributes.

## 8. One `<h1>` per document
Already resolved by the Tier 2 shell split. Verified: all 12 pages have exactly
one `<h1>`, a `<main>`, and a canonical.

## 9. Client-side observability
JS failures on real devices were previously invisible.
- `window.onerror` + `unhandledrejection` beacon reporting message, source,
  line/col, page, and truncated UA — **no PII**.
- Rate-limited to 3 reports per page load so a render loop can't spam the
  endpoint; the reporter is wrapped so it can never itself throw.
- `step()` now also reports init phases it swallows — previously those failed
  silently by design, which is exactly how the empty-family-grid bug hid.
- Receiver: `netlify/functions/client-error.js` (validates, clamps, logs).

## 10. Family pages are no longer dead ends
- Prev/next pager with `rel="prev"`/`rel="next"` plus an "All six families" link,
  cycling through the six pages.
- A closing CTA into `/app` and `/methodology/` — the journey that starts at a
  search result now leads somewhere.

## Structured data
20 JSON-LD blocks, all validated as parseable:
- `/` Organization + WebSite
- `/app` WebApplication (with free Offer, browserRequirements)
- `/aromas/` BreadcrumbList + ItemList
- `/aromas/<family>/` BreadcrumbList + Article
- `/learn/` CollectionPage, `/about/` AboutPage, `/methodology/` TechArticle

## build.sh now enforces this
The build fails if `script-src`/`style-src` are loosened, or if an inline
`<style>`, `style=` attribute, or inline `<script>` is reintroduced. It also
re-fingerprints both bundles and rewrites references.

## Payload
    original   181.8K for a two-page journey
    tier 3     first visit /  84.2K   ->  then /app  15.1K (js + css cached)

## Verified after all changes
- 6/6 core-algorithm spec tests (75% / 100% / THCA / LOQ / nerolidol / palate)
- 12/12 pages: one h1, main, canonical, balanced tags
- 20/20 JSON-LD blocks parse
- 0 inline styles, 0 inline scripts, 0 duplicate class attributes
- 16/16 Tier 3 delivery checks

## Remaining before launch
1. Run `./build.sh` — vendors the QR library (intentionally not committed).
2. Wire `persist()` in `match-feedback.js` to real storage (Netlify Blobs).
3. Point `client-error.js` at a real sink if you want retention beyond logs.
4. Re-export family photography at ~1240px and add `srcset` — the `<picture>`
   markup already accepts it. Current sources are 620px; I did not upscale.
5. Replace `curious-crumble-352160.netlify.app` with the real domain in canonicals, OG tags, JSON-LD.

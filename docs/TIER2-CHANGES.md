# Tier 2 — architecture, assets, accessibility

## 4. Inline JS extracted; shells split; CSP hardened
**Before:** one 41KB inline script duplicated inside two 91KB HTML files that had
to be edited in lockstep, with `script-src 'unsafe-inline'` making the CSP
largely decorative.

**After:**
- All JS lives in `js/nose.<hash>.js`, loaded with `defer`, shared by both
  shells and cached once. Content-hashed filename, so `immutable` caching is
  actually safe (`build.sh` re-fingerprints and rewrites references).
- **`script-src 'self'`** — `unsafe-inline` removed. Verified zero inline
  `<script>` blocks and zero inline event handlers across all 12 pages.
  (JSON-LD blocks are non-executable and unaffected.)
- Shells split by responsibility: `/` (index.html) carries only the marketing
  homepage; `/app` (app.html) carries only the matcher. Each holds exactly one
  `data-page` block. The homepage no longer downloads the QR library at all.
- This also removed the duplicate-`<h1>` problem: every page now has exactly one.

**Payload:** two-page journey went 181.8K -> 123.9K, and the second page is now
42K incremental because the bundle is already cached.

### Null-safety work this required
Splitting the shells meant half the elements are legitimately absent on any
given page. Added `$id()/on()/each()/step()` helpers, converted 22 unguarded
`getElementById(...).addEventListener` calls, made each init phase conditional
on its anchor element, and guarded the menu/modal/focus-trap functions.
Router rewritten around "what does this document own", with legacy `#/hash`
links forwarded to canonical URLs — 12 routing cases tested.

**Bug found while doing this:** `renderFamilies()` iterated
`['homeFamilyCards','allFamilyCards']` unguarded. With the aromas view removed
in Tier 1, that threw — which would have left the homepage family grid silently
empty. Now guarded, and family cards link to the real `/aromas/<family>/` pages
instead of a dead `#/aromas?family=` hash.

## 5. Responsive images
- Generated AVIF + WebP for all six family photos (**238K -> 166K, 30% smaller**).
- Family pages use `<picture>` with AVIF -> WebP -> JPEG fallback, intrinsic
  `width`/`height`, and `decoding="async"`.
- JS-rendered homepage cards emit the same `<picture>` structure, `loading="lazy"`
  with dimensions so the grid reserves space and doesn't shift.
- Added `og:image` (+ dimensions) to all six family pages for share cards.

**Honest limit:** the source files are 620px. I generated modern formats and
correct markup, but did NOT fabricate a 2x — upscaling would add bytes and no
detail. True retina requires re-exporting from the original masters at ~1240px;
the `<picture>` markup is already shaped to accept a `srcset` when you do.

## 6. 200% zoom
Converted every `font-size` to `rem`, including the min/max inside `clamp()`
(px inside clamp still ignores user font settings). **Zero px font-sizes remain**
across all HTML, CSS, and JS.

## Verified after all changes
- All 6 core-algorithm spec tests still pass (75% / 100% / THCA / LOQ /
  nerolidol / palate averaging).
- 12 router cases pass.
- All 12 pages: one `<h1>`, `<main>`, canonical, balanced tags.
- 16/17 Tier-2 checks green on first run; the one failure was a stale vendor
  comment left in the homepage, since removed.

## Remaining
- `style-src` still needs `'unsafe-inline'` (inline `style=` attributes are used
  for family colours). Moving those to CSS custom properties would let it drop.
- Wire `netlify/functions/match-feedback.js` `persist()` to real storage.
- Re-export family photography at 2x and add `srcset`.
- `vendor/html5-qrcode.min.js` must be fetched by `build.sh` before deploy.

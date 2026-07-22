# NOSE — launch checklist

## Done in this pass (category 1: launch basics)
- [x] `404.html` — branded, noindex, links onward to app / aromas / learn
- [x] `robots.txt` — allows crawl, blocks `/vendor/` and `/.netlify/`, points to sitemap
- [x] `sitemap.xml` — all 14 public URLs with lastmod/changefreq/priority
- [x] `favicon.svg` — six-family bars on the dark mark (was an open item from day one)
- [x] `/privacy/` — a real, crawlable page (replaced a modal that search engines
      could not see), written from the actual code behaviour
- [x] `/terms/` — plain-English, flagged for legal review
- [x] Footer Privacy + Terms links on every page; favicon on all 14 pages
- [x] Dead privacy-modal JS removed and the bundle re-fingerprinted

## Privacy bug found and fixed during this pass
My Tier 1 feedback beacon transmitted saved-profile ids. Those ids are built as
`saved-<slugified user name>-<timestamp>` — so naming a jar "Dads Birthday Stash"
sent that text to the server, contradicting the site's own promise that palate
data stays in the browser. Built-in sample ids (public fixtures) are still
reported; anything user-created is now reduced to the opaque token `custom`,
with a separate `palateSize` count. Verified by unit test.

The privacy page documents exactly this, including the error beacon.

## Still required before you can launch (needs you, not code)
1. **Run `./build.sh`** — vendors the QR library (deliberately uncommitted so it
   cannot go stale) and re-fingerprints bundles. The scanner is inert until then;
   it degrades to a message rather than breaking.
2. **Replace `nose.example`** — 60+ occurrences across canonicals, Open Graph,
   JSON-LD, `robots.txt` and `sitemap.xml`.
   `grep -rl 'nose.example' . | xargs sed -i 's/nose\.example/YOURDOMAIN/g'`
3. **Wire `persist()`** in `netlify/functions/match-feedback.js` to real storage.
   Until then the validation loop thanks people and discards their vote.
4. **Contact address** on `/privacy/` (deletion requests) and `/terms/`.
5. **Legal review** of `/terms/` and `/privacy/` in your operating jurisdiction.
6. **Real content**: the About origin story is still a placeholder, and `/learn/`
   is ~250 words of card blurbs, not articles. It will not earn search traffic
   as-is.
7. **Photography at ~1240px** — sources are 620px and I did not upscale. The
   `<picture>` markup already accepts a `srcset`.

## The check no automated pass can replace
Nothing in this project has ever been rendered in a browser — every verification
was static analysis and logic tests. That caught bugs a visual check would miss
(the 3% THCA score, 39 duplicate class attributes, the empty family grid). It
cannot catch a broken layout, an invisible control, or a z-index collision.

Before launch, spend 30 minutes on the deployed site, on a real phone and a real
desktop:
- [ ] Click every nav and footer link, on both mobile and desktop
- [ ] Open the mobile menu; close it with Escape; tab through it
- [ ] Run a sample match; add a second jar to the palate; confirm the score moves
- [ ] Submit a thumbs vote; confirm the acknowledgement appears
- [ ] Try the QR scanner (after `build.sh`) and the manual entry path
- [ ] Save, export, re-import, and delete a palate
- [ ] Zoom to 200% and confirm nothing is clipped or overlapping
- [ ] Tab through the whole page: every control should show a visible focus ring
- [ ] Check the browser console for CSP violations — the policy is strict now
- [ ] Confirm the sticky nav does not cover anchored section headings

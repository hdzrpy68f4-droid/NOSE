# Learn guides — September 2026

The four cards on `/learn/` linked nowhere (the one button on Guide 01 was
white text on a white card). Each card now opens a full guide:

| Guide | URL |
|---|---|
| 01 How to read a COA | `/learn/how-to-read-a-coa/` |
| 02 Why strain names drift | `/learn/why-strain-names-drift/` |
| 03 Do terpenes predict effects? | `/learn/do-terpenes-predict-effects/` |
| 04 Intensity versus character | `/learn/intensity-versus-character/` |

Plain static HTML, same header/footer as the other static pages, no inline
styles or scripts (CSP-safe), one `<h1>`, canonical, Article + Breadcrumb
JSON-LD with a `citation` list, and a numbered source list on each page.

## How the claims were checked
- Each of the 16 sources was checked against its abstract, text or a published
  summary before it was cited, and the wording stays inside what it says.
- Every statement about what NOSE does was checked against the code:
  confidence bands (`confidence()` in `js/nose.*.js`: 9+ high, 5+ moderate),
  below-LOQ → 0, cannabinoids dropped, the report reader's refusal rules
  (`netlify/functions/lib/parse-coa.js`), and the "intensity, not shape" label.
- The worked examples in Guide 04 (scores 100 / 33, palate 85–86 vs 63–98) and
  the % vs mg/g example in Guide 01 were computed by running the app's own
  `normalize()`, `cosine()` and `averageProfiles()`, not by hand.
- The example lab report in Guide 01 is labeled on the page as illustrative,
  not a real product or lab.

## Stylesheet
`family.css` gained the layout rules that learn, methodology, privacy, terms and
404 were already using but only the app shell defined (page-head, page-grid,
article-card, method-box, formula). Side effects, all fixes: those pages now
lay out as designed, the breadcrumb lines up with the content, and secondary
buttons on light backgrounds are visible (404 page, and "Forgot password" /
"Log out on every device" on `/account/`). Re-fingerprinted to
`family.dc8ed1ef.css`; `build.sh` reproduces the same hash.

## Judgment calls to review
- Guide 03 cites Spindle et al. (2024), a small human trial of vaporized
  limonene with THC. The guide describes only its design and limits, but the
  paper's own title names an effect. It is there because leaving out the one
  controlled human study would misstate the evidence. Remove it if you would
  rather the site never print that title.
- "Last reviewed September 2026" is shown on each guide. Re-check the sources
  when you change the copy, and update the date.

## Found while doing this (not changed)
- `/privacy/` says pasted lab links are "validated against a list of known
  laboratory domains". The code removed that allowlist (see the comment at the
  top of `netlify/functions/coa.js`); the page should describe the checks that
  replaced it.

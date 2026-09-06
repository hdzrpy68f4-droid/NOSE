# NOSE — COA parser handoff

Paste this into a new chat. **Attach the four files listed in §1 as file uploads**,
not pasted text — pasted text cannot be run, and reconstructing a fixture by hand
has twice produced a file that parses correctly and proves nothing.

---

## 0. What NOSE is, in one paragraph

A cannabis terpene flavour-matching app. It reads terpene profiles off lab reports
(COAs), builds a "palate" from strains a person likes, and matches new strains by
flavour similarity. **Aroma and flavour only — never effects or "the high."** That
scope restriction is the core brand differentiator, not a limitation to work
around. No claims about relaxing, energising, focus, calm or sleep. When in doubt,
cut the claim rather than soften it.

The job in this thread: keep extending the COA parser to more labs and layouts.

---

## 1. Files to attach

| File | Why |
|---|---|
| `netlify/functions/lib/parse-coa.js` | the parser, ~1000 lines |
| `netlify/functions/lib/extract-text.js` | unpdf wrapper; half the problem surface |
| `test/fixtures/coa-baseline.json` | expected values for every accepted fixture |
| the `.txt` of whichever COA is failing | from `test/fixtures/extracted/` |

**Attach the extracted `.txt`, never the PDF.** It is a fraction of the size and it
is exactly what the parser sees.

---

## 2. Current state

```
55 accepted / 3 rejected      (58 COA fixtures)
55 match / 0 differ           (extraction parity, unpdf vs pdftotext)
corpus clean                  (fixture lint)
```

Seven labs, four inhalable product classes. Kaycha, Modern Canna, ACS, ACT,
TerpLife, Method all working. Green Scientific has no working sample and is not
currently OMMU-certified.

The three rejections are all **correct**:

- `GreenRoads…` — genuinely all-ND
- `Harmony-Muscle-Rub…` — topical, prints no total
- `hemp-bombs…` — no terpene panel was run

Live scanning works end to end: camera → QR → viewer-page resolution → fetch →
unpdf → parse → confirmation card, including the warnings row, which has been
seen rendering on a real scanned jar.

All 56 source PDFs are tracked in git, so the corpus is reproducible from a clone:
`node test/extract-dump.js` regenerates `test/fixtures/extracted/` in about a
minute. This was proven the hard way when a Codespace container failed and the
whole workspace had to be rebuilt from the remote.

**Which reader serves which documents**, from `readBy`:

```
forward      43      the plain name-then-value pass
multicolumn   8      Kaycha's three-column rows
backward      2      value-before-name layouts
columnmajor   0      dead - declines on all 56, unreached on 53

Counts are of ACCEPTED fixtures (43+8+2 = 53). Rejected documents also carry a
`readBy`, so counting all 56 gives 46 forward - which is what an earlier version
of this table did, without saying so.
```

---

## 3. Where to start

Three accepted-but-wrong faults were found and fixed this session - see §11.
No lint failures remain.

1. **The column-major reader is dead.** `test/columnmajor-audit.js` shows it
declines on all 56 fixtures and is never reached on 53 - it runs only when
`rowPassLooksWrong`. Its own comment names ACS, ACT Florida and TerpLife, NOT
Modern Canna, and all three now read `forward` and accept, so the row-wise
reconciler superseded it. Keeping it costs nothing on the 53 passing fixtures.
Do not spend time trying to make it fire.
2. **`MCL-FLW-002` accepts** and reads `forward`. It warns: its full panel lists
`Ocimene, Total 0.068`, which its own headline 1.769% omits, so the rows sum to
103.8% of the printed total. Verified as the document's arithmetic, not a parse
fault - the eleven summary values sum to exactly 1.769.
3. **More fixtures.** See §10 — depth within a lab beats breadth across
   dispensaries.

**The four-readers refactor is NOT the priority it once was.** The idea was to have
each reader return a candidate and choose once at the end, instead of four stages
mutating one shared `terps` object. The motivation was that a change to stage two
once broke a lab at stage four invisibly. But `readBy` (§7) made that visible for
five lines, and the 43/8/2/0 split above means restructuring the pipeline would put
every lab at risk to tidy stages serving two documents and zero. Revisit only if a
fifth reader is ever needed.

---

## 4. Non-negotiable rules

From the algorithm spec. Getting these wrong makes the product meaningless.

- **Below-LOQ values are 0, never the printed number.** `<0.200`, `<LOQ`, `ND`,
  `BQL`, `BLQ` all resolve to `0`.
- **cis- and trans-nerolidol sum** into a single `nerolidol` value.
- **Cannabinoids are excluded** — THCA, Δ9-THC, CBD and friends never enter the
  terpene vector.
- **Total terpene % is a separate "intensity" axis**, not part of the shape
  comparison. Profiles are normalised to share-of-total before comparison.
- **Exact name matching only.** *Caryophyllene oxide is not caryophyllene.* A
  substring match silently inflates the dominant family.
- **Never silently assert scraped numbers.** Correct extraction or clear
  rejection. A believable wrong fingerprint is the one unacceptable outcome.

---

## 5. How to work — this matters more than it sounds

Three separate attempts were lost in one session by reasoning about layouts from
short probes instead of running the real file. Every fix that worked came from
having the extracted text on disk.

A later session lost six exchanges to a different version of the same mistake:
interpreting test results without confirming which version of the parser was in
the tree. A revert had been applied and forgotten, so a passing run was measuring
the unpatched file. **A test run against an unpatched file looks exactly like a
passing test run.** Confirm the change is present — `grep` for a token unique to
it — before believing any result.

Work has also been lost to a container failure with edits uncommitted. **Commit as
soon as the gates are green**, not at the end of the session.

**Verify before changing anything:**

```bash
node test/coa-gate-test.js test/fixtures/extracted netlify/functions/lib/parse-coa.js | tail -1
node test/extraction-parity.js test/fixtures/pdf 2>&1 | grep -v "^Warning:" | tail -3
node test/fixture-lint.js | tail -2
```

Expect `55 accepted / 3 rejected`, `55 match / 0 differ`, and `corpus clean`.
Also run `node test/resolver-test.js` - expect `resolver clean`.

**After every change, all four must hold:**

1. the gate count does not drop
2. parity stays at `0 differ`
3. the lint stays clean
4. the Kaycha anchors are unchanged (`KAY-CAR-001` → 4.124, `KAY-PRR-001` → 0.944)

**Anything that trades a working lab for a broken one is not a fix.** This has
happened four times. If a change costs a lab, revert rather than negotiate with it.

Parity asserts `readBy`, `productClass`, `moisture`, `waterActivity` and
`warnings` as well as the numbers, so a change that
reaches the same values by a different reader, or classifies a document
differently, now shows up as a DIFFER rather than passing silently. That is
deliberate: on this parser a changed path is news. A legitimate improvement that
changes the route will need re-baselining, and that is the point — it forces
someone to look.

### Test harnesses in `test/`

| Command | Purpose |
|---|---|
| `coa-gate-test.js <dir> <parser>` | accept/reject verdict per fixture |
| `extraction-parity.js test/fixtures/pdf` | unpdf output vs the baseline, including readBy and productClass |
| `extract-dump.js` | regenerate `test/fixtures/extracted/` from the PDFs |
| `fixture-lint.js` | corpus hygiene: control bytes, shell-hostile names, baseline arithmetic |
| `mutation-test.js <dir> <parser>` | corrupt fixtures; require identical-or-reject |
| `resolver-test.js` | viewer-page resolution, offline, against saved portal pages |
| `columnmajor-audit.js`                   | read-only: which reader serves each fixture, and whether readColumnMajor fires |

---

## 6. Parser architecture — what not to undo

Each of these exists because the obvious alternative broke a working lab.

**Reconciliation, not position.** Labs disagree on which column holds the
percentage — ACS prints `dilution | LOQ | mg/g | %`, Modern Canna prints `%` first.
Columns are chosen by which one makes the analyte values sum to the total the lab
printed itself. Same principle applied row-wise, column-wise, and across multi-
column rows.

**A verdict token pins the SIDE, not the COLUMN.** Everything before a
`TESTED`/`PASS` token is limits; everything after is results. Post-verdict cells
all become candidates and go through the reconciler. Pre-verdict cells are
discarded outright — see both §11 Kaycha entries for why each half of that
sentence is load-bearing.

**The unit cross-check is not reconciliation.** Reconciliation asks whether a
column sums to its own total — both column bugs found so far passed that test. The
cross-check asks whether the lab's two printed unit systems keep a constant ratio
across rows, which is a fact about the document rather than a parser decision. It
applies only to columns of MEASUREMENTS: a limit column repeats itself and is
skipped, or ACT's LOQ reports a misalignment that is not there. Requiring the ratio
median to look like a round factor was tried as the discriminator instead and it
silently DISABLED the check, because a badly shifted column's median is not round
either. Distinctness is the discriminator that works.

**Form beats material in product classification.** A jar printing "AIO" three
times and "Type: Distillate" once is a cart full of distillate, not a concentrate.
`CLASSES` is first-match-wins and the vape rule is deliberately first.

**An ordered pipeline, not competitive scoring.** Forward pairing → column-major
reader → backward pairing, each attempted only if the previous declined. "Before
this name" is also "after the previous name", so a one-row shift scores ~0.99
against a correct 1.00. Scoring them as equals lets a shifted reading win a
tie-break. **Do not replace this with a scoring contest** — it was tried and it
broke ACS and TerpLife.

**Fails closed.** Guards reject rather than degrade. A refusal whose reasons do not
match the document should be treated as a possible parser fault, not a lab quirk.

**`unknown` is guarded, not exempt.** Some documents genuinely cannot be
classified: ACS prints only `Derivative Products (Inhalation - Heated)`, which
covers carts and concentrates alike, and Method separates every field label from
its value so nothing is adjacent to match on. Writing patterns for those two files
would be fitting to two documents and would break on the next layout. Instead the
minimum-analyte check applies to `unknown` as well, and `TYPICAL_MAX_TOTAL` gives
it the HIGHEST ceiling — not a guess at the form, but a bound no legitimate product
of any form exceeds. Previously `unknown` had no entry and skipped both checks, so
a 30% total was rejected as flower and accepted silently as unknown.

**Two coverage figures.**
- `measuredCoverage = (mapped + unmodelled) / total` — did we read the table?
- `modelCoverage = mapped / total` — how much does the aroma model represent?

Correct COAs sit a little ABOVE 100% measured - rounding across thirty-odd
rows reaches ~1%, and `MAX_MEASURED_COVERAGE 1.01` bounds it. That holds
regardless of model coverage. A gap between
them means rows were missed, not that the lab printed a short list.

**Empirical constants.** `MIN_ROW_SHARE 0.5`, `BACKWARD_MARGIN 0.15`,
`COLUMN_TRUST_SHARE 0.95`, `MIN_MEASURED_COVERAGE 0.80`, `MAX_MEASURED_COVERAGE 1.01`,
`PLAUSIBLE_TOTAL_PERCENT 35`, `MAX_RESULT_COLUMNS 4`, `MAX_UNIT_RATIO_SPREAD 0.15`,
`MIN_COLUMN_DISTINCTNESS 0.6`, `MIN_CROSSCHECK_ROWS 4`. Each was derived from a
real failure. Changing one needs a fixture that justifies it. `LOOKAHEAD_LINES 14`
is equally load-bearing and was previously undocumented.

---

## 7. Output contract — the app reads these by name

Renaming or dropping any of these breaks the app silently:

```
lab  strain  batch  labId  harvestDate  productClass
terps  totalTerpenes  mappedTotal  unmodelledTotal
coverage  modelCoverage  measuredCoverage
unmapped  terpenesTested  layout  readBy
moisture  waterActivity  freshnessApplies
usable  rejectReasons  warnings
```

- `usable === false` triggers the refusal path and `rejectReasons` is shown
  **verbatim**. Write reasons as plain English — they get published.
- `freshnessApplies === false` makes the UI omit moisture and water activity
  entirely rather than showing them as unknown. On an extract they are
  inapplicable, which is a different statement from unknown.
- `warnings` is forwarded by the handler and rendered on the confirmation card
  below the coverage note, in the same neutral style. Warnings are **not**
  refusals: the values stand and the person is told what looks odd. Also published
  verbatim, so the sentence has to read as English to someone holding a jar —
  the internal class name must not leak into it ("unusually high for unknown" was
  a real regression).
- `readBy` names which reader produced the surviving values: `forward`,
  `multicolumn`, `backward` or `columnmajor`. Purely descriptive — nothing
  branches on it — but it is recorded in the baseline and compared by parity, so
  a change of route is reported even when the numbers agree. `layout` only
  separates column-major from everything else, which left the three row-wise
  readers indistinguishable.

---

## 8. Adding a terpene key takes TWO edits

`ANALYTE_MAP` in the parser is only half. The key also needs a family in
`js/nose.*.js`:

```js
farnesene:{name:'Farnesene',family:'herbal'}
```

Without it the compound is measured and then silently discarded by
`familyShares()`. This happened with farnesene. **Flag any new key so the app side
is updated in the same pass.**

The same failure nearly recurred with nerolidol: `TRANS-`, `CIS-`, `E-` and `Z-`
were mapped but bare `NEROLIDOL` was in `UNMODELLED`, so a lab printing one summed
row had the compound measured and then dropped from the fingerprint. Now mapped.
A document printing BOTH the summed row and its isomers double-counts, overshoots
the lab's own total, and is refused by the coverage ceiling rather than asserted.
No fixture currently uses the bare spelling.

---

## 9. Known open items

- **TerpLife moisture is unread.** Its row prints 14.2 with no unit marker
above it, so the binding rule declines. One document; not worth a fifth pattern.
- **`KAY-FLW-002` water activity reads 0.583** where sibling Kaycha files read
0.56-0.59. Plausible, unverified against the PDF.
- **Every accepted fixture now reconciles** against its own printed total.
`MCL-FLW-002` is the sole exception at 103.8%, and that is the lab's arithmetic,
not the parser's - it warns rather than refusing.
- **Two round numbers worth one look.** `TerpLife_GrpeBblGm` reads moisture
exactly 15, and `KAY-FLW-002` reads water activity exactly 0.65 - the safe
threshold itself. Both are inside the bounds and may be correct.
- **14 mutation failures** out of 371 (~4%), down from 19 - see the `gamma-`
  fault in the log below, which accounted for five. The rest are all
  `destructive/shuffleValues`, and they are a KNOWN LIMIT rather than a
  backlog item. That mutation reverses every standalone numeric line in the
  document, so the multiset of values is conserved and every sum still
  reconciles by construction - no document-internal check can see it. Four of
  the fourteen push mass onto unmodelled compounds and are caught by
  `MIN_MODEL_COVERAGE`, but a warning leaves the fingerprint unchanged, so the
  harness still counts them. Do not spend a session trying to reach zero.
- **Two fixtures classify as `unknown`** — `Method_DulceDeUva_flower` and
  `ACS-LRS-001`. This is honest: neither document states its form in text the
  parser can reach (§6). They are now guarded rather than exempt, so nothing is
  unsafe, but a future Method or ACS template might expose an adjacency worth
  matching on.
- **All 56 source PDFs are tracked in the PUBLIC NOSE repo.** A deliberate decision
  is still pending: accept it, rewrite history, or collect future COAs into a
  private repo. The Codespace token is scoped to this repo only, so creating a
  second repo needs a browser or a personal access token.
- **The allowlist question.** `nose.js` holds a hardcoded `LAB_ALLOWLIST`. Most
  COAs arrive via retailer domains (The Flowery's S3), though `MCL-FLW-005` came
  from `coa.moderncanna.com` directly. Worth deciding whether to trust parsed
  content over URL origin. **Never allowlist `amazonaws.com`** — anyone can host
  anything there.
- **7.5-second fetch budget**, deliberately under Netlify's 10s function limit.
  Parsing runs ~10 ms, so it is not the constraint.

---

## 10. Collection strategy

Collect on **lab × product class × template variant**, not per dispensary — Florida
has ~25 brands but only six certified labs, and every dispensary uses one of them.

Modern Canna alone has shown **five** flower layouts. Kaycha's have been more
consistent but the multi-column variants are still surfacing. Depth within a lab
matters more than breadth across dispensaries.

**Each new COA needs its expected values recorded by hand once**, or it tests
nothing. That is the real cost of collection, and it is linear.

Name fixtures `LAB-FORM-NNN` — `KAY-CAR-004`, `MCL-FLW-003`. Never use spaces or
colons: unquoted shell loops skip such files silently, which broke a warning scan
without failing it, and colons are illegal in filenames on Windows. `LRS` is the
generic concentrate bucket — budder, badder, wax, shatter, resin, rosin, water
hash all behave the same for our purposes. `AIO` covers disposables. Name by what
the DOCUMENT says the product is, not what the dispensary called it: one file named
"Live Rosin 1" turned out to print "Disposable" twice and was a vape.

### Triage before asking for help

1. **Looks right** — coverage 88–101%, sensible terpene count, top three match the
   PDF → record in the baseline, done.
2. **Rejected** — note the reason. Only worth raising if you expected it to work.
3. **Accepted but wrong** — plausible coverage, values do not match the PDF. **This
   is the pile that matters.** Bring these, with the extracted `.txt`.

---

## 11. Session log — bugs found, so they are not reintroduced

- **Kaycha prints TWO result cells after the verdict token, and their order varies
  by jar** — mg/unit then %, or % then mg. A verdict pins the SIDE of the row, not
  the COLUMN. `KAY-CAR-001` read 41.24% on a cart where the report says 4.124%:
  accepted, baselined and wrong by 10× for a whole session, every analyte
  internally consistent. Post-verdict cells must all become candidates and go
  through the reconciler. Taking the second cell is NOT the fix — two other Kaycha
  vapes print the opposite order.
- **Kaycha's LOD/LOQ pair is usually one mashed line but occasionally two.**
  Most rows print `0.00700 0.0200`; `BORNEOL`, which has a different LOD, prints
  `0.0130` and `0.0400` on separate lines. That row alone arrives a cell wider
  than the other 37, its stray LOQ lands at the percentage column's index, and the
  column sum overshoots the lab's own total by 4.1% — just past a 3% tolerance.
  The real column is discarded and mg/unit wins by default: a pre-roll read as
  33.1% total terpenes. **Pre-verdict cells are limits, never results, and must
  never become column candidates.**
- **ACT prints LOQ beside the percentage** — 82 ug/mL for most analytes, 247 for
  farnesene — and the unit cross-check read that as a misalignment. A limit column
  divided by a varying result scatters no matter how well the table was read.
  Distinctness of values separates a limit column from a measurement column; a
  roundness test on the ratio median does NOT, and silently disables the check
- **Product form is often printed only as an acronym.** `AIO` appeared three times
  in a document whose only Type line said "Distillate", so a cart was classified as
  a concentrate and judged against the wrong ceiling. `Full Extract Cannabis Oil`
  matched nothing at all and fell through to `unknown`, which at the time carried
  no guards whatsoever
- **Some documents separate every field label from its value.** Method prints
  `Matrix:` immediately followed by `Client:`, with the values elsewhere entirely.
  Multi-word patterns spanning a label and its value cannot match these layouts.
  Do not write per-document patterns to compensate — guard `unknown` instead
- Bare `Nerolidol` measured and then discarded from the vector — see §8
- pdftotext writes an empty text cell as a NUL byte, which makes `grep` treat the
  whole file as binary and skip it silently. Seven ACS fixtures were invisible to
  grep-based triage this way. Stripped on write in `extract-dump.js`; **do not
  remove it**
- Header interleaving on Kaycha; stop only at the next analyte row
- Number mashing: `22.8% (798 mg)` must not become 22.8798
- `PASS` is not zero — moisture and water activity read as `null` when unmeasured
- Total-label column pairing; pair positionally
- Ligatures `ﬁ` `ﬂ` normalised before matching
- Analyte names read as numbers — `3-Carene` collected as the value `3`
- Rows bleeding into the cannabinoid table; cannabinoids are the row boundary
- Chart legends (`Dominant Terpenes`) outranking real tables on first-occurrence
  dedupe
- Duplicate analytes across summary and full panel double-counting via the
  nerolidol accumulator
- `ND` not treated as a result token, so look-ahead reached the Dilution column
- Water activity overwritten by an analyst ID across a page break
- A blank result cell shifting a row: `[1, MDL, PQL]` instead of `[result, …]`
- `Math.sumPrecise` missing in Node 22/24 — pdf.js swallows the error and returns
  an empty page. Polyfilled in `extract-text.js`; **do not remove it**
- Line reconstruction must be **one text item per line**, matching `pdftotext`.
  Joining by `hasEOL` glues a whole row into `D-Limonene10.005670.473`
- A status tile matching `FULL_PANEL` case-insensitively, so a single-page COA
  skipped its only terpene table
- Value-before-name layouts, where every figure lands on the compound above it
- **ACS prints ragged rows and the reconciler read the LOQ column.** A detected
row has two cells, a `<LOQ` row has three, so one column index is the percentage
on one and the limit on the other. Share is scored bigger-is-better with no
penalty for overshoot, so the LOQ column scored 1.0229 against the correct
column's exact 1.0. Twenty-three phantom terpenes at 0.002 on ACS-FLW-002,
including terpinolene, farnesene and ocimene on rows printing non-detect. Fixed
by zeroing a row from its own printed non-detect marker. Numeric `<0.200` is
deliberately NOT included: a limit column can take that form, and a row must
never be zeroed by its own limit. **Reconciliation cannot see this class of
fault** - the LOQ column sums UNDER the total, so it passes every check in §6
- **The baseline was defending that bug.** `ACS-FLW-002` recorded
`ocimene: 0.00033`, an LOQ value snapshotted from parser output. A snapshotted
entry is a regression test, not a correctness test; only the by-hand step in §10
makes it the latter
- **Freshness signals were unbounded.** Moisture and water activity are read
from labelled rows with no reconciliation behind them, so a Dilution cell at the
label's index was asserted unchecked: `aw 1.0` on six fixtures, `aw 55` on one,
and moisture 1 on another. Water activity is a ratio bounded at 0-1, and
moisture at 1-20%. Out of range means NOT READ. (MCL-FLW-002's 2.43 looked like
a fault and is not: the four sibling Modern Canna files print their moisture in
the same slot, so it is the document's own figure. An early 3% floor nulled it.)
- **Three published fields had no regression cover.** `moisture`,
`waterActivity` and `warnings` are all in §7 and all reach the person holding
the jar. Parity compared none of them, so eight bad freshness values and three
new warnings changed without a single DIFFER. Now compared

- **Freshness signals were read by position, and no position works.** Four labs
disagree on column order and Kaycha disagrees with itself, printing PASS on
either side of the value - the same hazard as the terpene rows. Kaycha aw read
the LOD (0.01) on six files, TerpLife moisture read the action level (15),
Modern Canna read the Dilution cell. Action levels and detection limits are a
small set of constants repeated across the corpus; a real reading is not one of
them. Excluding those and bounding by physics leaves exactly one candidate on
all 34 labelled rows across four labs
- **ACS and ACT print the freshness label TWICE** - a section heading, then the
real row - and the heading comes first, so `Specimen Weight: 0.500 g` was read
as a water activity of 0.5. The authoritative row is the one preceded by a bare
unit marker. Keying on the word `Result` catches ACS and misses ACT
- **A detected row went unread across a whole lab because the diagnostic was
blind to it.** ACS prints `Total Terpineol` on all seven of its fixtures; six
read `<LOQ`, and `ACS-LRS-002` detects 0.193%, which was the entirety of its
2.5% shortfall. It also had nerolidol carrying terpineol's value. The row never
surfaced in `unmapped` because `NOT_AN_ANALYTE` matches the word `Total`, added
to keep cannabinoid totals out - so the one signal designed to find new
spellings suppressed it. A `Total` naming a compound the map does not know, and
which is not a cannabinoid, is now exempt; a `Total` naming something already
known not to be an analyte is not, or `Total Yeast/Mold` floods the diagnostic
- **The look-ahead canonicalised one side of its stop condition and not the
other.** `ANALYTE_MAP` got the canonical name, `UNMODELLED` got the raw line, so
a lab writing Greek letters as bare initials - which ACT does - stopped a row on
a mapped analyte but ran past an unmodelled one. `g-Terpineol` is the last row of
MCL-FLW-002's panel, and missing it as a boundary dropped ocimene from that
document's fingerprint. No fixture could expose it: every COA in the corpus
spells `gamma-` in full, and the mutation harness made one that does not. The
same expression appears correctly a few lines above, in the post-verdict scan
- **Model coverage was described but never checked.** Section 6 says a gap
between measured and model coverage means rows were missed; nothing tested it.
Where a shuffled table pushes mass onto compounds NOSE does not model,
`modelCoverage` falls to 0.32 against a lowest real fixture of 0.71. Floor at
0.50, as a warning - the values may be exactly as printed and only the pairing
suspect. Zero false positives across 53 fixtures

---

## 12. The fetcher — `netlify/functions/coa.js`

Everything above is the parser. This is what gets a PDF to it, and it had no
test coverage at all until `test/resolver-test.js`.

**There is deliberately NO domain allowlist.** COAs reach people through
whoever sold the jar. The SSRF guard is layered instead: https only, no
private or link-local destinations re-checked after every redirect, bounded
time and bytes, PDF magic bytes rather than a Content-Type header, and finally
the parser's own reconciliation. That last one is the real boundary — a
fabricated report on a trusted domain fails it.

**Some portals put TWO pages between the QR code and the file.** Sunburn's
codes resolve to `coaportal.com` — Method Testing Labs' portal, one path
segment per brand — where a listings page links to a report page which carries
the PDF behind `?…&pdf=<n>`. Resolution is bounded at two hops, each
re-validated, each still required to present PDF magic bytes, with a visited
set so a self-referencing page cannot loop.

**Three things that broke on that portal, all of which would break others:**

- Candidate links are matched by pattern. Neither coaportal URL ends in `.pdf`
  or says `download`, so both hops missed. The `pdf=` number is read from the
  markup, never constructed.
- The markup scan sliced at 400,000 characters. Both pages are larger — 547KB
  and 563KB — so the links sat past the cut and the scan found nothing on pages
  that plainly had them. Now 4,000,000.
- WordPress emits the zero-padded `&#038;`. The unescape helper missed it, and
  since `#` opens a fragment the resolved link refetched the page.

**The fetch budget is for the whole chain**, not per request: `TOTAL_BUDGET_MS`
is computed once and passed down, because three hops at 7.5s each would exceed
Netlify's 10s ceiling and the person would see the platform's error page rather
than ours. Not covered by any test — exercising it needs a slow server.

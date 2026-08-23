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
52 accepted / 4 rejected      (56 COA fixtures)
52 match / 0 differ           (extraction parity, unpdf vs pdftotext)
corpus clean                  (fixture lint)
```

Seven labs, four inhalable product classes. Kaycha, Modern Canna, ACS, ACT,
TerpLife, Method all working. Green Scientific has no working sample and is not
currently OMMU-certified.

The four rejections are all **correct**:

- `GreenRoads…` — genuinely all-ND
- `Harmony-Muscle-Rub…` — topical, prints no total
- `hemp-bombs…` — no terpene panel was run
- `MCL-FLW-002` — a Modern Canna layout still unread; refuses rather than guessing

Live scanning works end to end: camera → QR → viewer-page resolution → fetch →
unpdf → parse → confirmation card, including the warnings row, which has been
seen rendering on a real scanned jar.

All 56 source PDFs are tracked in git, so the corpus is reproducible from a clone:
`node test/extract-dump.js` regenerates `test/fixtures/extracted/` in about a
minute. This was proven the hard way when a Codespace container failed and the
whole workspace had to be rebuilt from the remote.

**Which reader serves which documents**, from `readBy`:

```
forward      46      the plain name-then-value pass
multicolumn   8      Kaycha's three-column rows
backward      2      value-before-name layouts
columnmajor   0      currently unexercised
```

---

## 3. Where to start

No known accepted-but-wrong fixture is outstanding, and no lint failures remain.

1. **Is the column-major reader dead, or waiting?** It serves zero fixtures. It was
   written for a Modern Canna layout, and `MCL-FLW-002` — the one document still
   unread — may be exactly what it was for. Answer that before anyone deletes it:
   if it is the intended reader for that layout, the work is to make it fire; if
   the multi-column reconciler superseded it, it is ~80 lines of untested code
   sitting in the path of every parse.
2. **`MCL-FLW-002`** itself. Rejects correctly, so this is coverage, not a bug.
3. **More fixtures.** See §10 — depth within a lab beats breadth across
   dispensaries.

**The four-readers refactor is NOT the priority it once was.** The idea was to have
each reader return a candidate and choose once at the end, instead of four stages
mutating one shared `terps` object. The motivation was that a change to stage two
once broke a lab at stage four invisibly. But `readBy` (§7) made that visible for
five lines, and the 46/8/2/0 split above means restructuring the pipeline would put
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

Expect `52 accepted / 4 rejected`, `52 match / 0 differ`, and `corpus clean`.

**After every change, all four must hold:**

1. the gate count does not drop
2. parity stays at `0 differ`
3. the lint stays clean
4. the Kaycha anchors are unchanged (`KAY-CAR-001` → 4.124, `KAY-PRR-001` → 0.944)

**Anything that trades a working lab for a broken one is not a fix.** This has
happened four times. If a change costs a lab, revert rather than negotiate with it.

Parity asserts `readBy` and `productClass` as well as the numbers, so a change that
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
| `column-probe.js <name>` | print name/value run structure of one fixture |

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

Correct COAs sit at 99–100% measured regardless of model coverage. A gap between
them means rows were missed, not that the lab printed a short list.

**Empirical constants.** `MIN_ROW_SHARE 0.5`, `BACKWARD_MARGIN 0.15`,
`COLUMN_TRUST_SHARE 0.95`, `MIN_MEASURED_COVERAGE 0.80`,
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

- **`MCL-FLW-002`** — a Modern Canna flower layout still unread. Rejects correctly.
  See §3: it may be what the column-major reader was written for.
- **The column-major reader serves zero fixtures.** Either dead code or waiting for
  the layout above.
- **18 mutation failures** out of 308 (~6%). Each is a corrupted document that
  still produced an accepted-but-different fingerprint. Documented, not urgent.
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

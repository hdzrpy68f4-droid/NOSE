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
56 accepted / 3 rejected      (59 COA fixtures)
56 match / 0 differ           (extraction parity, unpdf vs pdftotext)
corpus clean                  (fixture lint)
35 mutation failures          (mutation harness, 448 cases - see §9)
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

Expect `56 accepted / 3 rejected`, `56 match / 0 differ`, and `corpus clean`.
Also run `node test/resolver-test.js` - expect `resolver clean`, and
`bash build.sh` - expect `OK - ready to deploy`.

**Or all at once:** `bash scripts/gates.sh` runs these, the Kaycha anchors,
`novelty-test`, `coa-dates-test`, `store-test`, `probe-test`, `archive-wiring-test`,
`archive-scripts-test`, `rerun-test`, `review-queue-test`,
`analysis-test`, `duplicates-test`, `remove-copies-test`, `remove-document-test`, `b2b-coverage-test`, `b2b-store-test`, `b2b-catalog-test`, `b2b-endpoints-test`, `check-trust-test` and, after the build, `input-paths-test`.
It prints the line each gate produced and ends with `ALL GATES GREEN`. It passes
a gate only on its exact expected line, so when a session legitimately changes
a count, update the script in the same commit.

**The input-paths gate needs Playwright and its Chromium**, which are not
project dependencies. Install them once per Codespace, and again after any
`npm ci`, which removes Playwright: `npm install --no-save playwright`, then
`npx playwright install --with-deps chromium`. Without them the gate fails and
prints that command. It runs after the build, so it tests the pages as they
deploy (§13, "The input paths").

**The harnesses do not cover `build.sh`.** All five ran green through a session
in which the deploy was failing on a CSP sanity check, so every fix sat
unpublished while the tests said otherwise. Run the build before believing that
anything has shipped.

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
| `novelty-test.js` | the five `novelty` notes (§7) and the furniture the `unmapped` diagnostic skips; FAILS if an accepted fixture carries any novelty, and lists the refused ones that do, as information |
| `match-test.js` | the matching maths has one home, `js/match-math.*.js`: the app takes it from there, nothing else holds a copy, and it returns every score in `test/fixtures/match-golden.json` to the last bit; every score is shown and sent through `shownScore()`, floored (§13, "The shown score"), and the worked examples on `learn/intensity-versus-character/` are the numbers the app shows |
| `coa-dates-test.js` | `lib/coa-dates.js` and the parser's `harvestOn` / `reportOn` (§7): the three forms, the near misses, and every other field identical without it |
| `analysis-test.js` | the analysis layer (§13) on PGlite: the two views, their grants |
| `duplicates-test.js` | `duplicates.js` and `download-twice.js` (§13, "One report, many documents"): on PGlite, and on fixture PDFs behind a stand-in fetch - a PDF rebuilt between downloads, the same file twice, a text that changes, a link that fails; offline |
| `remove-copies-test.js` | `remove-copies.js` (§13, "One report, many documents - the cleanup") on PGlite: copies made by the old `save_scan`, the copies it keeps and why, a Blobs failure, a second run, no text lost, nose_writer refused; and that only it, `remove-document.js` and the probe's refusals name a DELETE; offline |
| `remove-document-test.js` | `remove-document.js` and `keep-rule.js` (§13, "What gets kept, and taking it back out") on PGlite: the probe finds the one-sign files and nothing else; dry runs change nothing; a removal takes rows, PDF and every copy of the report, records the day and the word, and withholds file and text so `save_scan` refuses them after; PDFs with no row; a Blobs failure finished by a second run; a database refusal that changes nothing; nothing private printed; offline |
| `b2b-coverage-test.js` | `scripts/b2b-coverage.js`, the dispensary coverage report (§14): the test catalog read end to end through the real chain, extractor and parser, only the network stood in for - every outcome, the three flags, the counts with their denominators, one link at a time with the pause, coa.js's own words and deadlines, a file refused for an unknown or a personal-looking column before any row is read, nothing reaching the archive, one copy of the fetch chain; offline |
| `b2b-store-test.js` | the dispensary store (§14, "Schema, role, keys and the switch") on PGlite: schema `b2b` applied after every migration (those pinned byte for byte), its tables and columns, the person rule's three lists and two bodies identical, a personal key at any depth refused in both layers with the text asserted, `nose_b2b` upserting and refused DELETE, TRUNCATE, stores, keys and schema `nose`, `nose_writer`'s grants unchanged, `probe-db.js`'s b2b audit passing and failing on eight broken grants, every fixture's reading stored as read, keys hashed, `scripts/b2b-store.js`'s five commands, `lib/b2b-flag.js`, the `nsk_` build guard; offline |
| `b2b-catalog-test.js` | the catalog upload, the batch reader and the report from the database (§14, "Catalog upload and the batch reader") on PGlite, the real function behind a stand-in `pg` that runs every statement as `nose_b2b`, the links served from fixture files: the switch, the key (one 401 for every wrong key, the hash compared in constant time), the 4 MB cap before and while reading, the coverage script's own reader and refusals, an upload as a whole snapshot (absent batches kept and marked out of stock, a refused row's batch untouched, nothing to keep changing nothing), counts-only replies, one fixed log line on failure; the reader's accepted, refused and unfetched readings, `--dry-run`, `--reread`, `--limit`, a corrected link read again, a fetch failure never replacing a reading, nothing from another batch or store; `--store` matching the CSV run row for row; schema `nose` and the archive untouched; offline |
| `b2b-endpoints-test.js` | the widget's two calls (§14, "Feed and votes") on PGlite, both functions behind a stand-in `pg` that runs every statement as `nose_b2b` and a stand-in `@netlify/blobs`: the switch; the feed byte-identical for two visitors, every batch in the window in stock or not, the prompt's fields alone, a reading's figures only when it is the current one and accepted, no lab-report link; the origin rule (a foreign, missing, `null` or other store's origin gets no CORS header and no data), a revoked key, `public, max-age=60`; a vote's six fields and nothing else, matchBand()'s four bands all stored, no time of day in key or value, keys in no arrival order, the per-store daily cap with the same reply; one fixed log line on failure; `delete-store` removing a store's votes and only its own; schema `nose`, the archive and the consumer's store untouched; offline |
| `check-trust-test.js` | `scripts/check-trust.mjs` (§13, "The trust guard") on throwaway sites: every form of the old promise fails, true sentences pass; offline |
| `input-paths-test.mjs` | the app's ways in, in headless Chromium: Scan QR (fake camera and QR image), COA link, Upload. The real `coa.js` and parser answer, with only the download and unpdf stood in for (§13, "The input paths"). Needs Playwright; a gate, run after the build |

The counts in section 2 are checked by `fixture-lint.js` against the corpus, so
a stale one fails the lint rather than misleading the next session.
| `columnmajor-audit.js`                   | read-only: which reader serves each fixture, and whether readColumnMajor fires |

### Re-run tools in `scripts/` — the archive (§13), from the Codespace

| Command | Purpose |
|---|---|
| `reparse.js --dry-run` | **run after every parser change, before trusting the gates**: which archived reports it reads differently; writes nothing. Without the flag it saves and records the run |
| `reparse.js --reextract` | only after `extract-text.js` changes: extract every stored PDF again, keep new texts, then parse (`--dry-run` works too) |
| `backfill-from-blobs.js` | a PDF with no database row (scanned while Supabase was paused or down) is extracted, parsed and saved as `backfill` |
| `export-candidate.js <sha>` | an archived report's PDF and text into the fixture folders, to name and baseline by hand (§10); never commits |
| `review-queue.js` | **what needs a look**: documents whose latest reading was refused or has `novelty` (§7), newest first, with reasons; reads only |
| `drift.js "<strain>" [--lab X] [--client Y]` | one strain's usable batches - one per sample (§13) - in date order - total terpenes, top five as share of total - and the app's own score and band between consecutive batches; undated batches apart; reads only |
| `lab-stats.js` | per lab: samples (and the documents they come from), accepted rate, median measured coverage, most common kind of warning; reads only |
| `duplicates.js [--limit N]` | the reports the archive holds as more than one document: documents sharing an extraction text (the first stored is the report, the rest copies) and documents sharing a lab and lab ID; ends `duplicates already stored: N documents`; reads only |
| `remove-copies.js [--apply]` | **admin, by hand**: removes duplicate copies of stored reports - PDF first, then rows in one transaction; a dry run without `--apply`; needs `NOSE_DB_ADMIN_URL` |
| `keep-rule.js` | new documents per UTC day by how each arrived, today against the daily cap, the withheld count, and every document whose latest reading shows fewer than two of the three signs of a lab report, with the command that takes it out; reads only |
| `remove-document.js <fingerprint> --reason <word> [--yes]` | **admin, by hand**: takes one report out on request - its rows, every copy of it, its PDF - records the day and the word (`request`, `personal`, `notreport`, `legal`) and withholds its file and text fingerprints; database first, then the PDF; a dry run without `--yes`; needs `NOSE_DB_ADMIN_URL` |
| `download-twice.js <link>...` | each link fetched as the scanner fetches it, twice, 65 seconds apart: whether the bytes and the extracted text changed, and the lines that did; writes nothing, needs no secrets |

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
usable  rejectReasons  warnings  novelty
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
- `novelty` (below) is forwarded by the handler with `usable` on every card
  reply. When `usable === true` and `novelty` is not empty, the card adds ONE
  neutral line after the warnings, published verbatim: "NOSE hasn't seen this
  lab's layout before — check the top three against the report." The top three
  are the first three rows the card lists, highest value first. The notes
  themselves are never shown - they are written for the review queue, not for
  someone holding a jar.
- `readBy` names which reader produced the surviving values: `forward`,
  `multicolumn`, `backward` or `columnmajor`. Purely descriptive — nothing
  branches on it — but it is recorded in the baseline and compared by parity, so
  a change of route is reported even when the numbers agree. `layout` only
  separates column-major from everything else, which left the three row-wise
  readers indistinguishable.

**Additive fields, for the archive (§13) — the app does not read them and
`coa.js` does not send them:**

```
reportDate  client  parserVersion  harvestOn  reportOn
```

- `reportDate` and `client` are read like `harvestDate`: a labelled row, the
  value inline or on the next line, first occurrence wins — except that the
  next line is also refused when it is itself a `Label: value` row
  (`ownValueOrNext`), so an empty `Client:` followed by `Address: …` reads
  null, not the address. Existing fields keep `valueOrNext`. Labels are exact:
  `Report Date`, `Date Reported`, `Date of Analysis`; `Client`, `Customer`,
  `Producer`. TerpLife's `Client Lic#:` is a licence number and ACS's
  `Client Information:` heads an address block — neither matches. On the corpus
  `reportDate` reads on 2 documents (TerpLife, GreenRoads) and `client` on 10
  (every Method file, plus hemp-bombs), each checked against its text. Other
  labs print `Completion Date`, `Date Analyzed` and so on, or an unlabelled
  client name; widening the labels needs a prompt that asks for it.
- `parserVersion` is the commit `build.sh` stamps (`lib/version.js`), `dev`
  when the file runs on its own. The database's `output_hash` ignores it, so a
  deploy alone never makes a new parse row.
- **`harvestOn` and `reportOn`** are `harvestDate` and `reportDate` as ISO
  days (`YYYY-MM-DD`), or null - computed by `lib/coa-dates.js` from the two
  printed fields after they are read, so the reading is untouched: with
  `coa-dates.js` unavailable, every other field of all 59 fixtures is
  identical (`test/coa-dates-test.js` proves it each run). Printed dates do
  not sort as text; ISO days do, and the archive's `harvest_on` / `report_on`
  columns read these two. Only the WHOLE value, in one of four forms a US lab
  cannot mean two ways: `MM/DD/YYYY`, `MM/DD/YY` read as 20YY (Kaycha's
  harvest dates, `"07/07/25"`; asked for on 2026-09-23), `YYYY-MM-DD`, `Mon D,
  YYYY`. Anything else is null - a one-digit month or day, a one- or
  three-digit year, a full month name, a time after the date - and so is a
  day the calendar lacks, a day after today (UTC), or one before 2014-01-01.
  With those two bounds a two-digit year reads only from 14 to the current
  year, so 20YY is never a guess between centuries. On the corpus every
  printed date reads: 19 harvest dates (3 ACS, printed ISO already; 16
  Kaycha) and 2 TerpLife report dates. Widening the forms again needs a
  prompt that asks for it.
- None is in the baseline and parity compares named fields only, so none can
  DIFFER. The mutation harness compares terpenes and total only: still 35.

**`novelty` — is this document new to the parser?** An additive `string[]`,
`[]` when nothing is new. Stored with every archived parse, so it is
queryable as `output->'novelty'` with no migration; `coa.js` sends it to the
card (above) and `scripts/review-queue.js` lists it. Computed after the
reading, from what the reading already saw, and read back by nothing in the
parser: on all 59 fixtures every other field is identical with and without it.
One note per kind, in this order:

```
lab not recognised          detectLab() matched nothing in LABS
unmapped: A, B              the unmapped diagnostic is not empty (5 names, then a count)
unit not read: "…"          a figure and a concentration unit VALUE_LINE does not accept
verdict not known: "…"      a whole-line verdict word (Complies, Conforms, OOS…) the
                            reader does not act on; N/A is not a verdict
heading not known: "…"      a column heading not in SECTION_LABELS, not stepped over by
                            SKIPPABLE_IN_ROW, and not in SEEN_HEADINGS
```

- The last three look only inside the terpene section, tracked exactly as the
  loop tracks it for `unmapped` (so the same blind spot: Method's table sits
  outside it). At most three quoted examples per note.
- **`SEEN_HEADINGS`** lists, as whole lines, the headings accepted fixtures
  print that the two vocabularies do not name - `RESULT (MG/G)`, `REG. LIMIT`,
  `(MG/UNIT) QUALIFIER` and twelve more. Without it the literal rule flagged
  about 30 of the 56 accepted fixtures, which would make the fact meaningless.
  Add a heading only when a fixture printing it is baselined;
  `test/novelty-test.js` fails if an entry is printed by no accepted fixture.
- Concentration units only: `0.500 g`, `10 ml` and `1 x` are sample details on
  known layouts. `82.4% (824 mg)` is `resultToNumber`'s documented form.
- **No accepted fixture carries novelty, and `test/novelty-test.js` fails if
  one does** (since 2026-09-24). An accepted fixture's layout is known by
  definition, and on a usable read the card would tell someone holding that
  jar the opposite. So a new fixture that brings novelty with it is baselined
  in the same commit as whatever quiets it - a `SEEN_HEADINGS` entry, a
  spelling in `ANALYTE_MAP` or `UNMODELLED`, a furniture word (below). On the
  corpus 2 of 59 have novelty, both refusals (Harmony's `Results (%)`,
  hemp-bombs' `Hemp`), which never reach the card; the test lists them as
  information.
- **Furniture the `unmapped` diagnostic skips** - `notAnAnalyteHere`, since
  2026-09-24: structure labels (bare `Moisture`, which heads ACS's moisture
  table), licence and ID labels (`License No.`: a label ending in `No.`,
  `Number` or `ID`, or a bare `License` / `Licence`), and the line after a
  `Label:` or `Label #:` with nothing after its colon, which is that label's
  value (`Lab Batch #:` then `AAGZ997-`). Until then four accepted ACS files
  carried only this furniture in `unmapped` (`Moisture` ×3, `License No.`,
  `AAGZ997-`), so each of their cards said "NOSE hasn't seen this lab's layout
  before" and "Measured but outside the six families: Moisture." (§13, "Known
  ACS layouts").
- **Only the diagnostic reads that check.** Bare `MOISTURE` stays out of
  `SECTION_LABELS`, which the look-ahead also reads (it ends rows there) and
  which names novelty's known headings. Tried on 2026-09-24: adding it there
  would change no reading on today's 59 fixtures, because the look-ahead's
  name-shaped rule, just after its `SECTION_LABELS` test, already ends a row at
  a bare "Moisture" - but a list the reader shares is the wrong home for a
  diagnostic's vocabulary, and the next layout may not be so forgiving.
  `novelty-test` parses the corpus with the check switched off: only
  `unmapped` and `novelty` differ, on those four files. Across the corpus, none
  of the 5077 lines that follow a line ending in a colon is an analyte name.

---

## 8. Adding a terpene key takes TWO edits

`ANALYTE_MAP` in the parser is only half. The key also needs a family in
`TERPENES`, which since 2026-09-23 lives in `js/match-math.*.js` - the one
home of the matching maths, shared by the app and the scripts (§13):

```js
farnesene:{name:'Farnesene',family:'herbal'}
```

Without it the compound is measured and then silently discarded by
`sanitizeTerps()` - from the score and the fingerprint bar alike. This happened
with farnesene. **Flag any new key so the app side is updated in the same
pass** - and since it changes scores, `test/fixtures/match-golden.json`
fails, on purpose: regenerate it in the same commit, saying why.

The same failure nearly recurred with nerolidol: `TRANS-`, `CIS-`, `E-` and `Z-`
were mapped but bare `NEROLIDOL` was in `UNMODELLED`, so a lab printing one summed
row had the compound measured and then dropped from the fingerprint. Now mapped.
A document printing BOTH the summed row and its isomers double-counts, overshoots
the lab's own total, and is refused by the coverage ceiling rather than asserted.
No fixture currently uses the bare spelling.

---

## 9. Known open items

- **TerpLife moisture is unread.** Its row prints 14.2 with no unit marker
above it, so the binding rule declines. Verified against the PDF: the value is
real, the layout simply does not declare itself. One document; not worth a
fifth pattern.
- **Every accepted fixture now reconciles** against its own printed total.
`MCL-FLW-002` is the sole exception at 103.8%, and that is the lab's arithmetic,
not the parser's - it warns rather than refusing.
- **35 mutation failures** out of 448 (~8%), in two unrelated groups. The
  FIRST fourteen were down from 19 - see the `gamma-`
  fault in the log below, which accounted for five. Those fourteen are all
  `destructive/shuffleValues`, and they are a KNOWN LIMIT rather than a
  backlog item. That mutation reverses every standalone numeric line in the
  document, so the multiset of values is conserved and every sum still
  reconciles by construction - no document-internal check can see it. Four of
  the fourteen push mass onto unmodelled compounds and are caught by
  `MIN_MODEL_COVERAGE`, but a warning leaves the fingerprint unchanged, so the
  harness still counts them. Do not spend a session trying to reach zero.
- **21 of the 35 are `destructive/blankNonDetects`**, added later and a
  DIFFERENT mechanism from the fourteen above. It strips every ND / BQL /
  `<LOQ` / `<0.nnn` line from the terpene section, modelling a lab that leaves
  the cell empty. Unlike `shuffleValues` this one is fixable in principle —
  see the mutation's own comment for the mechanism and the proposed
  discriminator. Deliberately NOT fixed: no lab in the corpus omits the
  marker, so no fixture justifies touching the verdict handler (§6). The 17
  that reject under it, including all seven ACS files, are behaving correctly
  — a blank cell carries no information and failing closed is the honest
  answer.
- **Two fixtures classify as `unknown`** — `Method_DulceDeUva_flower` and
  `ACS-LRS-001`. This is honest: neither document states its form in text the
  parser can reach (§6). They are now guarded rather than exempt, so nothing is
  unsafe, but a future Method or ACS template might expose an adjacency worth
  matching on.
- **All 56 source PDFs are tracked in the PUBLIC NOSE repo.** A deliberate decision
  is still pending: accept it, rewrite history, or collect future COAs into a
  private repo. The Codespace token is scoped to this repo only, so creating a
  second repo needs a browser or a personal access token. Until it is made,
  `.gitignore` keeps any NEW PDF in `test/fixtures/pdf/` out of `git add`
  (tracked ones are unaffected); `git add -f` is the deliberate override.
- **The allowlist question.** `nose.js` holds a hardcoded `LAB_ALLOWLIST`. Most
  COAs arrive via retailer domains (The Flowery's S3), though `MCL-FLW-005` came
  from `coa.moderncanna.com` directly. Worth deciding whether to trust parsed
  content over URL origin. **Never allowlist `amazonaws.com`** — anyone can host
  anything there.
- **7.5-second fetch budget**, deliberately under Netlify's 10s function limit.
  Parsing runs ~10 ms, so it is not the constraint.

- **A `Total Cannabinoids` row above a total label is unguarded.** Three
fixtures - `ACT_AppleBurst_vape`, `KF2025-046-PB-AU-COA` and
`LAB-0425BSWS-20250731` - print their terpene total as a `%` line ABOVE a bare
`Total Terpenes` label, with `Total Cannabinoids` as the nearest name above
that. On all three the parser reads them correctly. But a document ordered
`Total Cannabinoids / 85.2% / Total Terpenes / 4.53%` would set the terpene
total to 85.2 - under `PERCENT_CEILING`, so the bound does not catch it - and
then refuse on measured coverage with a reason that does not describe the
document. Fails closed, like the fault it is a variant of. **Do NOT guard it
with `TOTAL_OF_CANNABINOID`**: that fires on all three working files and breaks
them. Needs a fixture that actually shows the fault.

- **An inline total printing BOTH units still reads the wrong one.**
`INLINE_MASS_UNIT` skips a mg/g total only when no `%` appears on the line, so
`Total Terpenes: 21.5 mg/g (2.15%)` reads 21.5. No fixture does this - the one
both-units form in the corpus is `2.87% (28.7 mg)`, percentage first and no
mg/g token - so widening it now would be fitting to a document that does not
exist.

- **`ownerAboveIsAnalyte` has NEGATIVE cover only.** Ten fixtures reach that
branch and not one has a compound name above the label; the owners are all
structural text, either `Total Cannabinoids` or `TERPENES SUMMARY (Top Ten)`.
Those ten prove the guard does not break these layouts. They do NOT prove it
tells an analyte from a non-analyte, and a green gate must not be read as
though they do.

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
- **Kaycha prints results on BOTH sides of the verdict, and which side varies
  by jar.** `KAY-FLW-001` puts them after `TESTED`; `KAY-CAR-003` puts them
  before, and reaches the value-before-verdict fallback 39 times on the
  UNMUTATED file. It survives only because the multicolumn reader discards the
  row-wise pass afterwards. §11 read as though that fallback were ACT's alone;
  it is not, and it is load-bearing on three accepted fixtures (39x on
  KAY-CAR-003, 41x on ACT_AppleBurst, 42x on KF2025). Anything that disables or
  narrows it costs those three.

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

- **A total printed in mg/g was read as a percentage.**
`Total Terpenes: 21.5 mg/g` is 2.15%, and taking 21.5 asserts the whole
fingerprint 10x high - the lab's own mg/g column then reconciles perfectly
against that total, so every internal check passes. Only `TYPICAL_MAX_TOTAL`
could object, and it does not fire on a product whose real total is modest. The
same shape as the Kaycha 41.24 entry at the top of this log, reached by a
different route: there the wrong COLUMN was taken, here the right column in the
wrong UNIT. Now left unread - a missing total refuses, a wrong one is believed

- **The `%` line above a bare total label was taken unconditionally.** On
`Nerolidol | 0.217% | Total Terpenes | 4.53%` that sets the total to 0.217, and
the document refuses with reasons that have nothing to do with it - which §6
says to read as a parser fault, not a lab quirk. Now taken only when the nearest
NAME above, walking back past the row's own result cells, is not an analyte. It
shipped testing `ANALYTE_MAP` alone and was corrected in the next commit to pair
it with `UNMODELLED`, like every other name test in the file - the same
asymmetry as the look-ahead entry above, found by review rather than by a
fixture, because no fixture can currently reach it

---

## 12. The fetcher — `netlify/functions/lib/fetch-report.js`, called by `coa.js`

Everything above is the parser. This is what gets a PDF to it, and it had no
test coverage at all until `test/resolver-test.js`.

**Where it lives, since 2026-10-05.** The chain - `validateUrl`,
`isBlockedHost`, `fetchOnce`, `fetchPdf`, `isPdf`, `looksLikeHtml`,
`resolvePdfFromPage` and the five limits above them - moved from `coa.js` to
`netlify/functions/lib/fetch-report.js`, unchanged: the moved lines are
byte-identical, and `coa.js` requires them and still exports
`_resolvePdfFromPage` (the same function, not a copy). Its replies are
byte-identical too (§14). It moved so that `scripts/b2b-coverage.js` can fetch
through the same guards without loading `coa.js`, and the archive wiring with
it. `scripts/download-twice.js` still takes only the resolver, through
`coa.js`, inside its own looser loop (§13, "One report, many documents").

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

**After every parse on the production deploy, `coa.js` hands the result to the
archive (§13)**: one call site, bounded, and unable to change the reply.
`test/archive-wiring-test.js` drives the real handler to prove the last part.
- **Two dialects declare the same thing and only one was recognised.** ACS and
ACT print the unit in the header - `(aw)`, `Limit (%)` - while Kaycha names the
column `Units` and puts the `%` or `aw` in the data row. The binding rule was
derived from four labs and held for four; on the fifth it never fired, and the
fallback took a bare summary tile with no numbers under it. `KAY-FLW-002` read
null for both where the document prints moisture 14.97 and water activity
0.583. Widening the marker fixed it, and the six Kaycha files that already read
correctly returned identical values through the new path - the two agree

---

## 13. The archive — live since 2026-09-22

Every lab report the scanner fetches is kept: the PDF's fingerprint, the text
extracted from it, and every distinct parse of that text. `coa.js` calls it once
per parse. It was switched on in the same commit that dated the privacy page,
which had described it in full, marked "not switched on yet", before any of it
was connected — that page promises to change before collection does.

**The PDF itself is kept too, since 2026-09-23.** Built 2026-09-22 (US
Eastern) on branch `archive-pdf-blobs` and held off main on purpose, it
reached main with `rerun-tools` and `novelty` on 2026-09-23 (`fe0ccbe`) -
after the privacy page had described it, deployed on its own, as not
switched on yet (`e45bded`). See "Live, 2026-09-23" below. The two lines in
`app.html` changed in the same commits as the code. The parts it adds: a copy of each PDF in Netlify Blobs, the production-only switch
in `build-info.json`, the "Certificate of Analysis" rule, a 2000ms budget for
both writes together, the seed and health scripts, and the parser's
`reportDate`, `client` and `parserVersion` fields (§7).

An earlier attempt (a `public`-schema store, a `.env`-based test, and a storage
call already wired into `coa.js`) was removed in full when the database moved to
Supabase. It never held data. It lives in git history if anyone needs it.

### What exists

```
supabase/migrations/20260922180000_nose_archive.sql   the whole schema
supabase/migrations/20260923140000_nose_reparse_runs.sql   one row per real reparse run
supabase/migrations/20260923170000_nose_analysis_views.sql   latest_parses, batch_series, strain_key(): read-only
supabase/migrations/20261002180000_nose_one_document_per_text.sql   save_scan finds a document by its bytes, else its text; batch_series per sample; sample_key()
supabase/migrations/20261002230000_nose_removals_and_cap.sql   removals, withheld, the daily cap; save_scan checks both first
supabase/config.toml                                  minimal, for the CLI
netlify/functions/lib/store.js                        saveScan(payload, { client, timeoutMs }), touch()
netlify/functions/lib/supabase-ca.js                  generated; Supabase's public root CA
netlify/functions/lib/archive.js                      storeScan(): the storage path, both halves
netlify/functions/lib/coa-dates.js                    isoDate(): a printed date as an ISO day, or null (s7)
netlify/functions/lib/pdf-store.js                    Netlify Blobs, store "coa-pdf"
netlify/functions/lib/version.js                      the one version helper
netlify/functions/lib/build-info.json                 GENERATED by build.sh, gitignored
netlify/functions/coa.js                              archiveScan(): the one call site
netlify/functions/keep-awake.js                       scheduled read every 4 hours
test/store-test.js                                    PGlite, in memory, 111 checks
test/archive-wiring-test.js                           coa.js -> archive.js, offline, 54 checks
test/archive-scripts-test.js                          version, pdf-store, health, seed, rerun helper; offline, 24 checks
test/rerun-test.js                                    reparse, backfill, export on PGlite; offline, 92 checks
test/review-queue-test.js                             the review queue on PGlite; offline, 19 checks
test/analysis-test.js                                 the analysis views and scripts on PGlite; offline
test/match-test.js                                    the matching maths: one copy, the scores it gave before it moved, the numbers it shows
test/fixtures/match-golden.json                       those scores, from js/nose.81d6bb53.js at b596508
test/match-golden-make.js                             wrote them, once; never re-run to make a test pass
test/novelty-test.js                                  the parser's novelty notes (s7); fails if an accepted fixture has any
test/probe-test.js                                    the probe's pass/fail rules, offline
scripts/embed-supabase-ca.js                          writes supabase-ca.js from the download
scripts/set-writer-password.js                        rotates nose_writer, prints NOSE_DB_URL once
scripts/probe-db.js                                   checks the real project
scripts/archive-status.js                             counts and latest parses, read-only
scripts/archive-health.js                             both halves: rows, sizes, orphans, newest parse
scripts/seed-from-fixtures.js                         every fixture PDF through storeScan, context seed
scripts/reparse.js                                    every document through today's parser (--reextract: extractor too)
scripts/backfill-from-blobs.js                        PDFs with no document row get one, context backfill
scripts/export-candidate.js                           an archived report into the fixture folders, never committed
scripts/review-queue.js                               latest reading refused or new to the parser, newest first
scripts/lib/rerun.js                                  what those share: the stamp-or-refuse helper, reads, comparison
scripts/drift.js                                      one strain's batches over time, scored as the app scores a match
scripts/lab-stats.js                                  per lab: documents, accepted, median coverage, commonest warning
scripts/duplicates.js                                 reports kept as more than one document: shared texts, shared lab IDs
scripts/download-twice.js                             a link fetched twice: did the bytes or the text change?
scripts/remove-copies.js                              admin cleanup: duplicate copies removed, PDF and rows; dry run by default
test/remove-copies-test.js                            that cleanup on PGlite; offline
scripts/keep-rule.js                                  new documents per UTC day, the cap, and any document below the two-sign rule; reads only
scripts/remove-document.js                            admin: one report taken out on request, withheld after; dry run unless --yes
test/remove-document-test.js                          those two on PGlite; offline, 48 checks
test/duplicates-test.js                               those two on PGlite and fixture PDFs; offline
scripts/lib/match.js                                  loads js/match-math.<hash>.js for the scripts; no maths of its own
js/match-math.<hash>.js                               the matching maths, loaded by the app and the scripts alike
scripts/check-published.js                            run by build.sh
```

`netlify/functions/lib/parser-version.js` is gone: `build-info.json` replaced
it.

**Schema `nose`**, not `public`: `documents` (one row per distinct report:
a PDF, by the SHA-256 of its bytes - unless an earlier document already holds
its extracted text, since 2026-10-02, below "One report, many documents"),
`extractions` (one per distinct text of a document), `parses` (one per
distinct parse), the view `terpene_values`, `save_scan(payload)`, which is
the only write path for scans, and `reparse_runs` (one row per real reparse
run, inserted directly). The analysis layer adds two read-only views and one
function (below, "The analysis layer"): `latest_parses`, `batch_series` and
`strain_key()`, and `sample_key()` since 2026-10-02. Since 2026-10-02 too,
`removals` (one row per removal made by hand: a UTC day and one word),
`withheld` (the file and text fingerprints a removal took out, which
`save_scan` refuses), `daily_document_cap()` and a trigger on `reparse_runs`
(below, "What gets kept, and taking it back out"). A document is found by
its bytes, else by its text, else written; extractions are reused on conflict. A parse
is written only when its output differs from the **most recent** parse of that
extraction, so A → B → A leaves three rows with A latest. Reaching this schema
is possible only through the `pg` driver from server code or Codespace scripts:
never supabase-js, never the Data API, never from a browser.

### Three things the database guarantees by construction

1. **Append-only.** `nose_writer` has SELECT and INSERT, nothing else. It needs
EXECUTE on the helper functions too, not only on `save_scan`: Postgres checks
function privileges when a generated column or CHECK is evaluated, and without
those grants every insert fails with "permission denied for function". Any new
function on the write path needs the same explicit grant (`daily_document_cap()`
has it; a trigger function is not checked for EXECUTE when it fires - tested on
PostgreSQL 16 - so nobody holds the `reparse_runs` trigger's). On `withheld` it
has SELECT alone, because `save_scan` reads it as the caller, and on `removals`
nothing. Only the admin role deletes, and only through two scripts run by hand
from the Codespace: `remove-copies.js` and `remove-document.js`.
2. **Nothing about the person who scanned.** No column is for them - a removal
is a day and one word from a CHECKed list, so not even a name fits in its
reason, and `withheld` holds fingerprints. `holds_no_person()`
is a CHECK on `parses.output` that refuses a naming key at any depth, in any
case - keys, not content. It never reads `extractions.text`, which is the
report as printed, and reports name lab staff: 56 of the 59 fixtures name a
laboratory director (below, "Three privacy sentences"). Until 2026-10-03
this line said "Nothing identifies a person. No column can hold one", as the
privacy page did; the text column always could. `save_scan` runs the same
check first and raises a message with no data
in it, because a constraint violation echoes the whole failing row into the
Postgres log — the refused field included. `store.js` refuses the same keys
before sending anything and sends only a fixed list of payload keys, so a stray
`ip` attached by a caller never leaves the function. The test proves the
database refuses every key the JavaScript list names.
3. **Derived values cannot disagree with their source.** Every queryable parse
column, `text_sha256`, `output_hash` and the view are computed by the database.
`output_hash` hashes jsonb's own text form, which is canonical for key order at
every depth, so no caller-side sorting exists to get wrong. A column holds its
value only when the output carries the expected JSON type: right or NULL, never
a mis-cast guess.

### Decisions, and the reasons they will be questioned

- **Dates, not timestamps** (`first_fetched_on`, `created_on`, `parsed_on`).
Each is written at the moment someone scans, and Netlify keeps request logs
with IP addresses. A time of day can be matched to an IP; a date cannot, and a
date still supports tracking batches over time. `save_scan` pins
`timezone = UTC`: without it a session in Tokyo recorded "2026-09-22" as the
21st — verified, not supposed. **The order survives, though**: every `id` is
an identity column counting up in arrival order, so a day's scans keep their
sequence, and a sequence can be set against a log. Days keep the time of day
out, not the order; the privacy page says so since 2026-10-03 (below, "Three
privacy sentences").
- **`harvest_on` and `report_on` read `harvestOn` and `reportOn`** and keep
only valid ISO dates. The parser's `harvestDate` and `reportDate` are the
lab's own format (`"07/07/25"` on KAY-CAR-001, `"11/17/2025"` on TerpLife),
and as text that sorts a 2025 date before a 2024 one. Since 2026-09-23 the
parser also emits the ISO forms (§7, `lib/coa-dates.js`), so the columns fill
wherever the printed date is one of the four accepted forms - Kaycha's
two-digit years included. They fill for a stored document only once it is
read again: `node scripts/reparse.js`. The `client` column fills too.
- **No `ON DELETE CASCADE`.** Deleting a document with parses must fail loudly.
- **`reparse_runs.last_document_id` is a number, not a foreign key**, since
2026-10-02. The key refused to delete any document a reparse run had walked
last - likely to be the very scan someone asks to have removed. A `BEFORE
INSERT` trigger keeps the half that mattered (a run cannot be recorded naming
a document that does not exist); a run that walked a document since removed
keeps the number it walked to.
- **One writer at a time per extraction** (`pg_advisory_xact_lock`), so "only
if the latest differs" holds when two people scan the same jar at once. It is
transaction-scoped, which the transaction pooler allows.
- **The prompt's `outputHash` payload field was dropped**: the database
computes the hash itself, so there is one source of truth instead of two.

### Connections and secrets

- `NOSE_DB_URL` — `nose_writer.<ref>` through the **transaction** pooler (6543).
`NOSE_DB_ADMIN_URL` — `postgres.<ref>` through the **session** pooler (5432),
used for `db push` and for setting the password. Direct connections are
IPv6-only on the free plan. "Tenant or user not found" means the host or
username is wrong, not the password.
- **TLS is verified against Supabase's own root certificate**, embedded as a
string so the bundler cannot drop it. There must be no `sslmode` in either URL:
pg silently discards the `ssl` object when there is one, and `store.js` refuses
such a URL outright. Never `rejectUnauthorized: false`. Before this, `store.js`
set no TLS at all, so the earlier test connections were almost certainly
unencrypted.
- **The writer's password never reaches the server.** The script sends only a
SCRAM-SHA-256 verifier, because a plaintext `ALTER ROLE … PASSWORD` lands in the
log if statement logging is on. Verified against a real Postgres: login succeeds
with the password, fails without it.
- **Secrets live in exactly two places**: Codespaces secrets and Netlify
environment variables — never in git, a `.env`, client JS or a log. Netlify's
"Functions" scope needs a Pro plan; "Production" context works on every plan;
tick "Contains secret values" so Netlify also scans build output for the value.
- `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` — **Codespaces secrets only**, for
`archive-health.js` and `seed-from-fixtures.js`, which reach Blobs from outside
Netlify. The function needs neither: `connectLambda` hands it the Blobs context
per request. The token is a personal access token and can do anything the
account can, so it gets an expiry date and is replaced when it lapses; Netlify
answers an expired one with 401, which the health script reports as such.
`check-published.js` fails the build on any `nfp_` / `nfc_` / `nfo_` / `nfu_` /
`nfb_` token in a published or tracked file.
- `NOSE_B2B_DB_URL` — `nose_b2b.<ref>` through the **transaction** pooler, the
dispensary role (§14): a Codespaces secret since 2026-10-07, and Netlify's
Production context only once the privacy page describes the program (Prompt 8).

### How it is tested

`test/store-test.js` applies the migrations to PGlite and drives `store.js`
through the same client seam production uses: dedupe, key-order-insensitive
hashing, A → B → A, generated columns against real KAY-CAR-001 parser output
(4.124 exactly, 15 terpene rows including zeros), NUL and lone-surrogate text,
the person guard in both layers, day-only dates, and — as the roles themselves —
that `nose_writer` can save but cannot UPDATE, DELETE or TRUNCATE any table.
In the session that built it, npm was blocked, so the same 49 checks were also
run against a real Postgres 16 through psql. **Assert the error text, not "an
error"**: `UPDATE … SET id = id` fails because `id` is an identity column,
before the privilege check even runs, and a looser test passed for that reason.

`scripts/probe-db.js` covers what PGlite cannot: TLS against the real pooler,
append-only as `nose_writer`, a save rolled back so nothing survives, a grant
audit (only `postgres` and `nose_writer` hold anything; the API roles reach
nothing; PUBLIC executes nothing), the Data API refusing schema `nose`, and
whether Enforce SSL is on — tested with a deliberately wrong password, so no
working credential ever travels unencrypted. Since 2026-10-07 it checks schema
`b2b` and `nose_b2b` the same way (§14), every existing check unchanged.

**A refusal is evidence only when you know who refused.** The first Data API
check passed on any non-2xx answer. A mistyped key gets 401 "Invalid API key"
from the gateway, and a publishable key sent as `Authorization: Bearer` fails
JWT verification, so it could pass without the question ever being asked. It
now passes only on PostgREST's own "schema not exposed" (`PGRST106`), and sends
the key in `apikey` alone. Enforce SSL likewise passes only on Supavisor's "SSL
connection is required"; a timeout is inconclusive, never a pass.
`test/probe-test.js` pins these rules offline with a mocked fetch, and fails
against each of eight deliberately broken copies of the probe.

### The build guard, and what it found

`build.sh` runs `scripts/check-published.js`. Published files may not contain a
postgres URL, the pooler host, a `<ref>.supabase.co` host or `sb_secret_`; no
tracked file may contain a URL with a password in it; a `.env` holding a
database URL fails the build. Since 2026-10-07 a dispensary secret key
(`nsk_`, §14) fails it too, tracked or published.

"Published" is computed as the publish directory minus `.git`, `node_modules`
and paths blocked by a **forced** 404 in `_redirects`. Forced matters: without
the `!`, Netlify serves a file that exists and applies the rule only to paths
that do not. Every "Source, not website" rule had been missing it, so
`/package.json`, `/build.sh`, the function sources and all 59 COA PDFs under
`/test/` were downloadable from the production domain. All are forced now, with
`/test/`, `/scripts/`, `/supabase/`, `/wip/` and this file added. Delete a `!`
and the guard scans that path again.

### The trust guard

Until 2026-09-22 the About page counted among its trust claims that NOSE kept
nothing and sold nothing. `da5a6cf` replaced it before the archive was
switched on; it was the only place in this repo that said so. Since
2026-09-23 `build.sh` runs `scripts/check-trust.mjs` straight after
`check-published.js`, so it cannot come back:

- **The promise itself** - stored, store or kept, then or / nor / and / a
  comma and "nothing", then sold or sell, in either order - fails in every
  file git tracks and every published file.
- **"Nothing stored"** - and "nothing is stored", "nothing's stored", "we
  store nothing" - fails only where a visitor can read it: published files,
  and the non-comment lines under `netlify/`, whose replies the page shows.
  The Codespace scripts, the migrations, the tests and this file say it about
  one code path (a refused write, a dev build), which is true and shown to
  nobody.
- Case, line breaks, `&nbsp;` and the other space entities, ` `-style
  escapes and inline tags do not hide it, and attribute text (a meta
  description) is read as well as body text.
- "Published" is `check-published.js`'s rule, copied; `check-trust-test.js`
  fails if the two ever count differently.
- **The static preview** (not in this repo): `node scripts/check-trust.mjs
  <file>`. A file named on the command line gets both rules; a path that does
  not exist fails rather than passing unread.
- The guard and its test never spell the promise out, so neither is exempt.
  This file is tracked too: describe the promise, never quote it.

If it fails on a sentence that is scoped and true - "if the file is not a lab
report, nothing is stored", say - reword the sentence ("we keep nothing from
it"). Do not narrow the pattern.

`test/check-trust-test.js` builds a throwaway site with its own git repo for
each case: 17 checks, among them the true sentences the site says today, the
real tree, and the About page as it was before `da5a6cf`, which fails at line
102. Thirteen deliberately broken copies of the guard - either rule switched
off, tags or entities not normalised, comments not stripped, an unforced 404
counted as blocking, tracked or untracked published files skipped, a missing
file ignored, the reverse order or "nothing X, nothing Y" dropped, a PDF read
as text - each fail it.

**The wording it protects, as of 2026-09-23.** The home page's "Private by
default" row: the palate stays in the browser unless you export it or save it
to your account; lab reports read from a scan or a link are kept so batches
can be compared over time; nothing about you is kept with them - no account,
no record of who scanned what, no location - with a link to
`/privacy/#lab-reports`. It says "who scanned what" and "kept with them",
not "nothing about you is stored": with optional accounts, an email address
and any palate saved to an account ARE stored, while the archive holds
nothing about anyone. The privacy page names Supabase's East US (North
Virginia) region for the database, says your IP address never reaches the
store because the server saves reports, not the browser, that nothing from
Netlify's request logs is copied into it, where a palate saved to an account
lives (Netlify's file storage), and that a session record holds the email
address - the sentence had left it out, and says so. "Turn on sync" became
"press Save to account" on the privacy and terms pages: sync is two buttons,
and only deleting the account removes the saved copy. `/legal/privacy` and
`/legal/terms` redirect (301) to the one page each.

### How `coa.js` feeds it

`archiveScan()` is called once, right after `parseCoa`, before any refusal, so
usable reads, unusable ones and refused layouts are all kept — the refusals are
how parser faults get found (§10). The storage path itself is
`lib/archive.js`'s `storeScan()`, shared with the seed script so that a seed
run proves the same code. What it guarantees, each one pinned by
`test/archive-wiring-test.js`:

- **Production only.** `build.sh` writes `build-info.json` —
`parserVersion` (git short SHA), `extractorVersion` (short hash of
`extract-text.js` plus the INSTALLED unpdf version) and `deployContext`
(`$CONTEXT`) — and esbuild bundles it into the function. An environment
variable exported by `build.sh` never reaches a function at runtime, which is
why it is a file. `coa.js` stores nothing unless `deployContext` is exactly
`production`: deploy previews and branch deploys share the site's Blobs
store and would write into the real archive. A missing or broken file reads
as `dev` in every field, so a local run fails closed. Checked with esbuild
0.27: the file is inlined when present, and a bundle built without it loads
and reads `dev`.
- **Database first, then the PDF** (since 2026-10-02; until then the two ran
together, independently). `save_scan` says which document the scan is: new,
the same bytes, or a copy of an earlier document by its text - or, since
2026-10-02, that it keeps nothing: the file or its text is `withheld`, or a
live scan would take the day past its cap. The PDF is written unless it is a
copy, withheld or over the cap - and also when the database fails, times out
or is not configured, so `backfill-from-blobs.js` can save it later. The
database gets half the budget and the PDF the rest of it, so either can fail
or hang and the reply still comes in time, and a hung database still leaves
the PDF its half. `archive-health.js` finds a PDF without its document row,
or the reverse.
- **The reply never depends on it.** The handler's response is byte-identical
whether either write succeeds, fails, hangs, or is not configured. Every
failure is swallowed. Both writes together get at most 2s of what is left
under a 9s deadline (the 8s fetch chain plus 2s would pass Netlify's 10s) and
are skipped below 0.3s; `store.js` bounds the connection itself, and a 50ms
backstop bounds `store.js`. Awaited, not `context.waitUntil`: this is a
Lambda-style function, and Netlify freezes it the moment it returns.
- **Unset `NOSE_DB_URL` makes the database half a no-op** — `store.js` and
`pg` are never loaded. Only Netlify's Production context has the variable.
- **Nothing about the person.** `event` is not in scope in `archiveScan` or
anywhere in `lib/archive.js`, and the test fails if either names it. The one
place the event goes is `connectLambda`, which reads `event.blobs` and the
`x-nf-site-id` / `x-nf-deploy-id` headers. The stored address is origin +
path in both halves: the whole query string and fragment are dropped, which
takes every presigned-link credential (`X-Amz-*`, `Signature`, `Expires`)
with it, and the tokens order pages carry too. The cost: a portal that
identifies the file only in the query (coaportal's `?pdf=<n>`) cannot be
re-fetched from its stored address.
- **Lab reports only, by two of three signs** (since 2026-10-02; until then
any one of them): a laboratory the parser recognises, the words "Certificate
of Analysis" anywhere in the text, a terpene panel (`terpenesTested` not
null, a printed total, or at least one terpene read). `archive.labReportSigns`
is the one definition; `coa.js`, the seed and `backfill-from-blobs.js` all
keep by `looksLikeLabReport`. Anything showing fewer - a receipt or a jar
label that only names Kaycha, a letter that only mentions a certificate of
analysis, a menu - is kept nowhere, neither file nor text: it could be
someone's personal document. Every fixture counts, and which signs each
shows is pinned: 52 all three, the six ACS reports `lab + panel` (no
phrase), Harmony `lab + phrase` (no panel). Below, "What gets kept, and
taking it back out".
- **Text over 256KB is not kept.** Real reports are 2–30KB; without a cap one
12MB PDF of text could fill the free database.
- **Nothing is logged on success, and a failure logs one line with no detail
of the document.** Netlify timestamps every log line; a line naming the
report would line a stored scan up with the request logs, which the day-only
dates exist to prevent. `archive.reason()` scrubs file fingerprints,
addresses, database hosts and IP addresses out of any error it passes on. A
withheld file logs nothing at all: a line saying one was scanned again would
tie a removed report to a request in those logs. A day at its cap logs one
fixed line per refused scan, `coa: archive at its daily cap - nothing kept,
reply unaffected`, so a day the archive stopped filling can be seen.
- **Provenance**: `context` is `production`; `parser_version` and
`extractor_version` come from `build-info.json`, so neither can go stale by
hand.
- **Said where it happens.** Both ways into the archive in `app.html` — the QR
scanner and the paste-a-link panel — say in one line that the server keeps a
copy of the report and what it says, and nothing about the person, linking to
`/privacy/#lab-reports`. Since 2026-09-23 the home page's "Private by default"
row says it as well. Change what is kept, and those three change with the
privacy page.

### The PDF half — Netlify Blobs

- **One site-wide store, `coa-pdf`** (`getStore`, never `getDeployStore`: a
deploy store belongs to one deploy, so every deploy would start an empty
archive).
- **Key: the SHA-256 of the bytes** — the same fingerprint `nose.documents`
is keyed by, so the two halves join on it. Written with `onlyIfNew`: the same
file scanned again writes nothing, and a stored copy is never replaced. A
download whose text the database already holds under other bytes is not
written at all (below, "One report, many documents"), nor one the database
answers withheld or over the cap (below, "What gets kept").
- **Metadata `{ sourceUrl, fetchedAt }`, nothing else.** `sourceUrl` is the
stripped address, or null when there is none or it would pass Blobs' 2KB
metadata limit. `fetchedAt` is the UTC DAY, never a time — the database's
rule. Blobs' own storage may record when each object was written; nothing of
ours reads or copies that, and the privacy page says it exists.
- **`connectLambda(event)` first.** A function written as `exports.handler`
is not handed the Blobs context, and without it every Blobs write fails.
- **A write counts only with an ETag.** For a conditional write,
`@netlify/blobs` 10.x answers `{ modified: false }` on a 412 and
`{ modified: true }` on ANY other status — a 401, 403 or 503 included —
without throwing. `pdf-store.put()` therefore treats `modified` without an
ETag as a failure (the store returns one for every object it keeps), so an
outage is logged instead of recorded as a success. The test stand-in answers
exactly that way.
- **Deploy previews from forks.** Every deploy's functions get the site's Blobs
context, and the production-only switch lives in the deploy's own code. A
pull request from a fork could change that code, so an approved fork preview
could read or add PDFs. Netlify's default for a public repository ("Require
approval", under Project configuration → Environment variables → Site
policies) stops untrusted previews building until someone approves them:
never approve one from an outside fork. The database is not exposed that way —
`NOSE_DB_URL` exists only in the Production context.
- **Documents from before the PDF half have no PDF.** Scanning that jar again
stores it (the key is new). `archive-health.js` lists them.

### Seeding and health, from the Codespace

`node scripts/seed-from-fixtures.js` puts every PDF in `test/fixtures/pdf`
through `storeScan()`, context `seed`, no source address. It stamps
`parserVersion` from git and refuses to write while `parse-coa.js`,
`coa-dates.js` or `extract-text.js` has uncommitted changes — the stamp has
to name the code that ran. Safe to run again: it adds only what is missing. Run it once, before
any real scan depends on the PDF half: it proves both halves end to end.

`node scripts/archive-health.js` prints rows per table, the newest parse in
full, database size against the free plan's 500 MB, PDF count and bytes, and
the PDFs and documents that lack their other half. A PDF with a document row
is measured from the row — its key is the hash of those very bytes — so only
orphans are downloaded; `--verify` downloads and re-hashes every file. It
prints no text, no addresses and no secrets.

Both need three Codespaces secrets: `NOSE_DB_URL`, `NETLIFY_SITE_ID`,
`NETLIFY_AUTH_TOKEN`. A Codespace sees a secret added after it started only
once it is restarted.

`store.js`'s bounded connection is tested against pg's real semantics, read
from the 8.23.0 source: `end()` destroys the socket when a query is active, so a
hung query cannot hold the function; a client that loses its socket after we
stopped waiting emits `'error'`, which crashes the process unless something
listens — `withClient` always listens.

### Re-running the archive, from the Codespace

`reparse.js`, `backfill-from-blobs.js` and `export-candidate.js` (one line each
in §5) connect as `nose_writer`, print no report text, addresses or secrets,
and share `scripts/lib/rerun.js` with the seed: a run that writes is stamped
from git and refuses while `parse-coa.js`, `coa-dates.js` or `extract-text.js`
has uncommitted changes; `--dry-run` writes nothing and runs on anything.

- **`reparse.js`** parses each document's newest extraction again, 100 at a
time, and saves through `save_scan` with context `reparse`, so only a changed
reading adds a row. It prints each change - short fingerprint, lab, strain,
`usable` / `readBy` / `totalTerpenes` before → after, every terpene that moved
more than 0.001, and the names of any other field that changed - and ends with
`unchanged / values changed / accepted→rejected / rejected→accepted / failed`.
It compares readings as `output_hash` does (key order and version stamps
ignored), so a dry run predicts what a real run writes.
- **Every real run adds one row to `nose.reparse_runs`**, even when nothing
changed: mode, parser (and, re-extracting, extractor), the UTC day, how many
documents through which document id, and the counts. Its CHECKs refuse counts
that do not add up, a `dev` stamp, and a plain reparse claiming an extractor.
- **`--reextract`** reads each PDF back from Blobs, checked against its
fingerprint before use, and extracts it again. A text is kept only if it is new
for that document. A document with no PDF is parsed from its stored text and
counted. After `extract-text.js` is reverted, a text can equal an EARLIER
extraction, which is reused, not stored again - so the newest row stays the
reverted-away text and a plain reparse keeps reading it. The run names each one.
- **`backfill-from-blobs.js`** applies the scanner's own gates (200 characters,
a parser that does not throw, the lab-report rule - two of three signs since
2026-10-02 - and 256KB) and saves nothing withheld. The document takes
its day and address from the PDF's metadata; no valid day there, nothing stored.
- **`export-candidate.js <sha> [LAB-FORM-NNN]`** writes the PDF and today's
extraction of it into the fixture folders, prints the stored lab, strain and
batch and the LAB-FORM names in use for that lab, and refuses to overwrite a
file or reuse a name the baseline holds. The gates then count the new files and
fail until the baseline is written by hand (§10) and the counts in §2 and
`scripts/gates.sh` move.
- **`review-queue.js [--limit N] [--fixtures]`** lists every document whose
latest reading - newest extraction, latest parse, as `reparse.js` reads it - is
refused or carries `novelty`, newest first (first-fetched day, then arrival),
with `rejectReasons` and the novelty notes, and ends with the
`export-candidate.js` command. It selects no text and no address. Documents
first stored by the seed are the fixtures themselves, so they are counted, not
listed, unless `--fixtures`. A reading from before `novelty` existed is
counted with the command that fills it in (`reparse.js`). Only the newest 50
print unless `--limit` says more.
- **The first real reparse after `novelty` changes every document** and only
that: each prints `also changed: novelty (new)` (a scan read by `main`'s
parser adds `client (new)` and `reportDate (new)`), counted as `values
changed`, with `usable`, `readBy`, `totalTerpenes` and every terpene the same
before and after. Rehearsed on a local copy of the seeded archive, then run
on the real one (below, "Novelty on the real project"): 60 of 60 changed that
way both times, nothing else moved, and a second run changed nothing.
Anything else in a dry run - a terpene that moved, an accepted→rejected - is
a parser fault: stop and bring the lines.
- **The first real reparse after `harvestOn` / `reportOn` (§7) changes every
document the same way**: each prints `also changed: harvestOn (new),
reportOn (new)` and nothing else - `usable`, `readBy`, `totalTerpenes` and
every terpene the same before and after. Rehearsed on a local copy of the
seeded archive (the 59 fixtures read by `b596508`), with `MM/DD/YY` read
(`8620cd7`): the dry run and the real run both said `0 unchanged / 59 values
changed / 0 accepted→rejected / 0 rejected→accepted / 0 failed` with those two
names on all 59 and nothing else; a second run said `59 unchanged`.
`harvest_on` then held 19 dates and `report_on` 2. On the real archive,
expect every document, fixture or scan, to show that one line - anything
else is a parser fault. **If the archive was already reparsed by `635ac02`**
(before `MM/DD/YY` was read), only the Kaycha reports change, each by `also
changed: harvestOn` alone: 16 of 59 on the rehearsal, 43 unchanged.
- **The first real reparse after `notAnAnalyteHere` (§7, 2026-09-24) changes
only ACS reports**, each by `also changed: novelty, unmapped` alone: the four
ACS fixtures, and any real ACS scan whose `unmapped` held the same furniture.
Rehearsed on a local copy of the seeded archive: `55 unchanged / 4 values
changed`, then `59 unchanged`. On the real archive, run #7: `62 unchanged / 4
values changed`, the same four, then `66 unchanged` (below, "Known ACS
layouts, 2026-09-24").
- **Ids jump after a run.** `INSERT … ON CONFLICT DO NOTHING` takes an identity
number even when it conflicts, so a reparse uses up one document id and one
extraction id per document. Nothing is lost; count rows, never ids.

The table must exist before the first real run: `npx supabase db push --db-url
"$NOSE_DB_ADMIN_URL"`, then `node scripts/probe-db.js`, which now also checks
that `nose_writer` can record a run and cannot change one.

**How they were verified, 2026-09-23.** The workspace that built them had no
npm, so `store-test` and `rerun-test` ran against a real Postgres 16 through a
stand-in for `pg`, and the parser gates through a stand-in for unpdf on
pdfjs-dist 5.7.284 (they reproduced 56/3, 56/0, clean and 4.124/0.944 exactly).
Every script also ran end to end against a local Postgres as `nose_writer`,
with a file-backed stand-in for Blobs: the seed, a reparse that changed nothing,
a parser change seen by `--dry-run` and refused for real while uncommitted, an
extractor change and its revert, a backfill and an export. None has yet touched
the real project or real Blobs; the first `bash scripts/gates.sh` in the
Codespace is the first run on PGlite and the real unpdf.

### The analysis layer — read-only, from the Codespace

Two views and one function, `supabase/migrations/20260923170000_nose_analysis_views.sql`,
read by the analysis scripts. Nothing in it writes; nothing in it is UI.

- **`nose.latest_parses`** - one row per document: the latest parse of its
  NEWEST extraction, exactly the reading `reparse.js` and `review-queue.js`
  stand by. That differs from "the highest parse id" only after an extractor
  revert (an older text reused, then parsed again), and there the view agrees
  with the scripts rather than with the id. It carries the parse's columns
  and its output, and leaves out the document's address and text.
- **`nose.batch_series`** - the usable ones, ONE ROW PER SAMPLE since
  2026-10-02: `lab`, `client`, `strain_key`, `batch`, `batch_date` =
  `coalesce(harvest_on, report_on)`, `total_terpenes`, `parse_id`, `copies`.
  A sample is the lab and its lab ID where one was read, else the document
  (`nose.sample_key()`); its row is the newest document's latest reading, and
  `copies` is how many usable documents hold it - 1 when it was kept once. A
  NULL `batch_date` is an undated batch. Refused readings, and outputs with
  no boolean `usable`, are not in it.
- **`nose.strain_key(text)`** - the one rule for "same strain": lowercase,
  whitespace runs collapsed and trimmed, a leading `(I)`, `(S)` or `(H)`
  dropped (any case). Nothing else: `GMO #2` is not `GMO`. The view uses it,
  and so does `drift.js` for its argument, so the rule exists once.
- **Read-only by grant.** `security_invoker = true` on both views, like
  `terpene_values`: a role holding the views alone reaches nothing. The first
  migration's default privileges would hand `nose_writer` INSERT on any new
  relation, so the migration revokes everything and grants SELECT back;
  `strain_key` is revoked from PUBLIC and granted to `nose_writer`, so the
  grant audit stays clean. An INSERT into a joining view is refused by the
  rewriter before any privilege is checked, so the checks ask
  `has_table_privilege` instead of trying one.
- **Push it once, from the Codespace** (done 2026-09-23, below): `npx
  supabase db push --db-url "$NOSE_DB_ADMIN_URL"`, then `node
  scripts/probe-db.js` - which now also checks that `nose_writer` can read
  both views and holds nothing more on them. With `NOSE_DB_ADMIN_URL` set,
  its grant audit covers the function.
- **Tested** by `test/analysis-test.js` on PGlite: A → B → A, two extractions,
  refused and verdict-less readings, the strain key, the date fallback, a
  real ACS report (dated 2026-04-03 by its own harvest line), the columns,
  security_invoker in practice, and the grants. Rehearsed on a local copy of
  the seeded archive: 59 documents, 56 in `batch_series`, 20 of them dated,
  and `probe-db.js` against it passed every view and grant check.

**One copy of the maths: `js/match-math.<hash>.js`.** The app's `normalize`,
`cosine` and `matchBand` lived inside `js/nose.*.js`'s closure, which Node
cannot import. They moved - verbatim, 81 lines, with `TERPENES`,
`sanitizeTerps`, `averageProfiles` and the unused `total` - into one file that
the app loads before its bundle (it sets `window.NoseMatch`) and the scripts
load through `scripts/lib/match.js` (`module.exports`). Nothing else holds a
copy; `test/match-test.js` fails if anything does, apart from the unfinished
draft in `wip/`, which nothing loads. Since 2026-09-24 the file also holds
`shownScore()`, the one way a score becomes a whole number - an addition, not
a move (below, "The shown score").

- **Fingerprinted like every bundle**, because `/js/*` is cached for a year:
  `build.sh` checks its syntax, hashes it, rewrites the two pages, and fails
  the build if a page loads `js/nose` without `js/match-math` before it.
  `scripts/lib/match.js` finds it by pattern - exactly one must exist.
- **The app's scores are unchanged, proven three ways.** The removed lines
  and the moved lines are byte-identical. `test/fixtures/match-golden.json`
  holds what the pre-move bundle's own code returned - 1830 pair scores over
  the five demo profiles and the 56 accepted fixtures, 65 palates, the bands
  at every edge, `sanitizeTerps` and `coerce` on raw lab spellings - and
  `match-test.js` gets every one back to the last bit (a change of summation
  order fails it). And in headless Chromium, the old tree (b596508) and the
  new one rendered the same text for every hero pair (25) and 366 matcher
  states (palates of 1 to 6 jars against 61 candidates), with no page errors.
- **Key order.** `cosine()` sums in key order, and jsonb returns keys in its
  own order, not the order they were written in, so a score computed from
  stored terps can differ from one on the written order in the 16th decimal
  place (1.1e-16 measured) - far below anything shown.
- **A regenerated golden file means the maths changed.** Do it only with a
  change that is meant to change scores, in the same commit, saying so.

**`scripts/drift.js "<strain>" [--lab X] [--client Y]`** - one strain's
lab reports over time. The name is keyed with `nose.strain_key()` itself;
`--lab` and `--client` match a whole name, case and spacing aside, never a
substring, and list the names there are when nothing matches.

- Dated batches, oldest first: the date and whether it is the harvest or the
  report day, lab, client, batch, form, parse id, the name as printed, the
  total terpenes the report printed, and the top five terpenes as share of
  total (`normalize()`, so zeros and cannabinoids never appear).
- Then each batch against the one before: `cosine()` of the two
  share-of-total profiles, printed to three places, then as the app shows it
  (`shownScore()`, floored - `Math.round` until 2026-09-24) with
  `matchBand()`'s label and band. Batches of
  the same day have no order between them, so each is compared with every
  batch of the day before and with each other (`3a ~ 3b`).
- Undated batches are listed apart and compared with nothing.
- Notes when the series mixes labs, clients, product forms, or harvest and
  report days, or when samples under the name were refused - each is a
  reason two reports differ that is not the batch.
- One batch per sample (since 2026-10-02): a sample kept as several
  documents prints `one sample, kept as N documents` and a note says so;
  refused samples are counted by sample too.
- It says, first and last, that drift is between lab reports, not between
  experiences. `test/analysis-test.js` drives it on PGlite and fails on any
  effect wording in its output or in the layer's files.
- On the rehearsal archive 20 of the 56 usable batches are dated. "Grease
  Monkey" is a Kaycha cart and a Kaycha concentrate from one harvest day,
  2026-03-23 - `1a ~ 1b`, 0.997, shown as 99 since 2026-09-24 (100 while
  the app rounded), Close match - and a Modern Canna flower report with no
  date, listed apart.

**`scripts/lab-stats.js`** - per lab, from `latest_parses`, counted by
sample since 2026-10-02 (`nose.sample_key()`, each sample from its newest
document): samples (how many are seeded test fixtures, and the documents
they come from when that is more), accepted count and rate, the median
`measuredCoverage` over the readings that carry one (§6 - a reading without
one is left out, never counted as zero), and the most common kind of
warning with how many readings carry it. A kind is the parser's sentence
with its figures shown as `#`, so "add up to 103.8%" and "add up to 102.2%"
count as one; a tie is said, and broken alphabetically. Readings whose lab
was not recognised are a group of their own, listed last. It describes the
parser's readings, not any product. On the rehearsal archive: 7 labs, 59
documents (all fixtures), 56 accepted; Modern Canna's one warning is
MCL-FLW-002's 103.8% (§3).

**Run them, from the Codespace** (after the `db push` above; `NOSE_DB_URL`
is enough - both read only, as `nose_writer`, and print no report text,
address or secret): `node scripts/drift.js "Grease Monkey"`, `node
scripts/drift.js "Grease Monkey" --lab "Kaycha Labs"`, `node
scripts/lab-stats.js`.

**Privacy.** Nothing new is collected. `harvestOn` and `reportOn` restate
dates the stored output already held as printed, and studying the collection
"between batches, between growers, and between laboratories" is the use the
privacy page already announces. The page needs no change for this layer.

**Built 2026-09-23 in the cloud workspace, run on the real project the
same day** (below, "Live, 2026-09-23 (US Eastern): the analysis layer").
npm was blocked in the workspace, so, as for the sessions before it: the
parser gates ran on pdfjs-dist 5.7.284 standing in for unpdf (56/3, 56/0,
clean, 4.124/0.944 on the untouched `b596508` first), the PGlite tests on a
stand-in that gives each test a throwaway PostgreSQL 16 cluster, the
scripts through a stand-in `pg` over the same wire protocol, and `build.sh`
with the committed html5-qrcode in place of the jsdelivr download. The
migration, the reparse, `probe-db.js`, `drift.js` and `lab-stats.js` ran
against a local PostgreSQL 16 holding the 59 seeded fixtures, as
`nose_writer`. Then the Codespace ran all of it on the real packages and the
real project.

### Keeping the free project awake

Supabase pauses a free project after a week without enough database activity —
"a few user requests to the database each day" is what its docs call typically
enough. While paused, every archive write fails, and `coa.js` swallows those
failures by design, so the archive would stop filling without anybody seeing
it. `keep-awake.js` makes one indexed read as `nose_writer` at minute 17 of
every fourth hour, UTC — six a day. Scheduled functions run only on published
deploys and cannot be called by URL. A failure logs `[keep-awake] FAILED` and
returns 500: Netlify → Logs → Functions → `keep-awake` is where a paused or
unreachable database shows up first. "Run now" on that page tests it.

### Verified on the real project, 2026-09-22

- `probe clean`: TLS verified through Supabase Intermediate 2021 CA to the
embedded root; append-only as `nose_writer`; a rolled-back save leaves
nothing; only `postgres` and `nose_writer` hold grants; the API roles reach
nothing; the Data API answers `406 PGRST106` for schema `nose`.
- **Enforce SSL is on.** Supavisor refuses plaintext before authentication:
`(ESSLREQUIRED) SSL connection is required for user: nose_writer`.
- The Supabase CLI 2.117.0 still connects with Enforce SSL on
(`migration list` in sync). Some older CLIs failed with "SSL connection is
required"; if that returns, append `?sslmode=require` to the CLI's `--db-url`
on the command line only — never to the saved secrets, which `store.js`
refuses when they carry `sslmode`.
- The whole path — real handler, real `parseCoa`, real `store.js` — was also
run against a local Postgres 16 as `nose_writer`: one scan of `KAY-CAR-001`
wrote one row per table with `total_terpenes` 4.124 and 15 terpene rows, the
stored address had lost its query, the dates were UTC days, and a second scan
of the same file wrote nothing.

### Live, 2026-09-22 evening (US Eastern)

- The deploy bundled `pg` into `coa.js` and into the ESM `keep-awake.js`
(which imports the CommonJS `store.js`) without complaint.
- The first real scan was archived: one row per table, a Method Testing Labs
flower report, usable, context `production`, dated 2026-09-23 — the database
keeps UTC days, and it was already past midnight UTC.
- **Its parse is `#3`, not `#1`, and nothing is missing.** Each probe run makes
a save and rolls it back, and identity values are not transactional: a rolled
back insert still uses up its number. Two probe runs used 1 and 2. Expect gaps
wherever the probe has run; count rows, never trust ids to count them.
- `keep-awake` "Run now": `[keep-awake] ok { ms: 147 }` — connect, TLS and one
read from Netlify to the pooler in 147ms, so the 1.5s write budget in `coa.js`
has about ten times what it needs.
- The contact address on the privacy and terms pages is
`contact@nose-app.com`. `nose-app.com` routes mail through Cloudflare Email
Routing, so that address works only while a routing rule (or catch-all) for it
exists there.

### Novelty on the real project, 2026-09-23

Branch `novelty` at `0f18267`, from the Codespace, before any merge:

- `bash scripts/gates.sh`: ALL GATES GREEN - the first run of `novelty-test`
and `review-queue-test` on the real unpdf and PGlite.
- `reparse.js --dry-run`, then `reparse.js`: run #2, parser `0f18267`, 60
documents through document #62 - `0 unchanged / 60 values changed / 0
accepted→rejected / 0 rejected→accepted / 0 failed`. Every one changed only
by `novelty (new)`; the one production scan (a Method Testing Labs flower report, read by
`main`'s parser) also by `client (new)` and `reportDate (new)`. Every `usable`, `readBy` and `totalTerpenes` the same before and after.
- It is #2 because `probe-db.js` inserts a run and rolls it back, and
identity values are not transactional: count rows, never ids.
- `reparse.js` again: run #3, `60 unchanged`.
- `review-queue.js`: `0 documents to look at` of 60; `7 test fixtures
(seeded) are not listed` - the three refusals and the four ACS files of §7 -
and no reading predates novelty.

### Live, 2026-09-23 (US Eastern): the PDF half, the re-run tools, novelty

Strains, fingerprints and times of day of real scans stay out of this file:
it is public, and a time of day is what the archive's day-only dates exist to
keep away from the request logs. Since 2026-10-03 their ids too: an id carries
arrival order (above, "Dates, not timestamps"). The ids already in this file
stay as written.

- **The page first.** `privacy-notice` (`e45bded`) was fast-forwarded onto
`main` alone and deployed. The live `/privacy/` page then read "A third,
smaller change, not switched on yet" and "Two additions, not switched on
yet" while the site still ran the old code - checked on the live site.
- **Then the code.** `main` fast-forwarded to `novelty` (`fe0ccbe`, 31 files),
`bash scripts/gates.sh` ALL GATES GREEN in the Codespace, deployed. The live
page then read "That changed on September 23, 2026", and "not switched on
yet" appeared nowhere on it.
- **The first scan on the new deploy** - a Kaycha flower report, usable, 15
terpene values - is document #185, parse #125, context `production`, parser
`fe0ccbe`, extractor `2e793bebe82a` (the real unpdf's stamp), and its PDF
was kept: 60 files in Blobs, 48.6 MB - the 59 seeded test reports and this.
- **`archive-health.js`: ok.** 62 documents, 62 extractions, 122 parses;
11.9 MB of the free plan's 500 MB, the archive's own tables 0.8 MB of it. Two
documents have no PDF, both expected: #3, the first real scan (2026-09-22,
before PDFs were kept), and #184, a Kaycha report scanned while the old
deploy was still serving. Scanning either jar again stores its PDF.
- **`reparse.js --dry-run`, then `reparse.js`:** run #4, parser `fe0ccbe`, 62
documents through #185 - `61 unchanged / 1 values changed / 0
accepted→rejected / 0 rejected→accepted / 0 failed`. The one was #184, read
by the old parser: `client (new), novelty (new), reportDate (new)`, with
`usable`, `readBy` and `totalTerpenes` unchanged.
- **`review-queue.js`:** `0 documents to look at` of 62; the 7 seeded
fixtures counted, not listed.
- #184 and #185 follow #62 because every reparse run takes an identity number
per document (above: "Ids jump"). Count rows, never ids.

### Live, 2026-09-23 (US Eastern): the analysis layer

Built in the cloud workspace (above, "The analysis layer"), handed over as a
git bundle, and applied in the Codespace:

- **The bundle**, `git pull --ff-only`: `b596508..cc9ca3a`, a fast-forward,
  7 commits. `bash scripts/gates.sh`: ALL GATES GREEN, 16 gates - the first
  run of `coa-dates-test`, `match-test` and `analysis-test` on the real
  unpdf and PGlite.
- **`reparse.js --dry-run`, then `reparse.js`**: run #5, parser `cc9ca3a`, 62
  documents through #185 - `0 unchanged / 62 values changed / 0
  accepted→rejected / 0 rejected→accepted / 0 failed`, every one by
  `harvestOn (new), reportOn (new)` alone; no verdict, total or terpene
  moved. The dry run said the same, line for line.
- **`npx supabase db push`**: `20260923170000_nose_analysis_views.sql`
  applied. `probe-db.js`: probe clean - both new view checks, and the admin
  grant audit (only `postgres` and `nose_writer` hold grants; PUBLIC
  executes no nose function, `strain_key` included; the API roles reach
  nothing). The Data API checks were skipped: no `NOSE_PUBLISHABLE_KEY` in
  that run.
- **`lab-stats.js`**: 7 labs, 62 documents (59 fixtures, 3 scans), 59
  accepted. The 3 refusals are the fixtures refused by design; all 3 scans
  were accepted. **`drift.js "Grease Monkey"`** printed the rehearsal
  exactly: those are fixture reports.
- **`git push`**, `b596508..cc9ca3a`, deployed. `archive-health.js` ok before
  and after one scan on the new deploy: a Kaycha concentrate report, usable,
  15 terpene values, context `production`, parser `cc9ca3a`, extractor
  `2e793bebe82a`, its PDF kept - 61 files, 49.0 MB. The same two documents
  lack a PDF (#3, #184), both expected. The after-deploy checks below were
  reported passing, the home page's score and `/app`'s included - the live
  proof that `js/match-math.<hash>.js` loads.
- The scan is parse #190 and document #311, after #188 and #185: ids jump
  after every reparse run. Count rows, never ids.

### The input paths, 2026-09-23

**The COA link tab could not add a jar.** `#coaConfirm` is markup inside
`#scanPanel`, and the COA link tab hides that panel. After "Read report" the
message said "<lab> read. Check the values below, then add the jar." The card's
`hidden` attribute was removed, but the card stayed invisible inside its hidden
panel: no values, no warnings or novelty line, no Use this jar. The scanner path
showed it. The fault predated `novelty`.

- **The fix, in `js/nose.*.js`** (then `js/nose.705c9bba.js`): `placeCoaConfirm()`
  runs in `renderCoaConfirmation()` just before the card is shown. It moves the
  card into the tab panel that holds that request's message, straight after the
  message, so the card hides with its tab. A card already in that panel, as on
  every scan, stays where it is. The markup in `app.html` is unchanged.
- **Upload** says plainly, in the tab and again after a file is chosen, that
  reading an uploaded file isn't available yet, and points to Scan QR, COA link
  and Manual. `validateUpload()` still checks type and size, and nothing sends
  the file anywhere. So the privacy page's sentence ("checked for type and size
  locally, and are still not sent anywhere") stays true without a change.
  "Static preview" is gone from the page.
- **`account/index.html`** no longer says to use the export button "in the
  meantime".
- **`test/input-paths-test.mjs`** is the check: 65 checks in headless Chromium
  (66 since 2026-09-24),
  against a local copy of the site served with `_headers` (CSP included). Each
  POST to `/.netlify/functions/coa` is answered by the real `coa.js` handler and
  parser in the test's own process. Only the PDF download and unpdf are stood in
  for, and unpdf returns a fixture's extracted text. The fixtures:
  `KAY-CAR-001` (4.124, nothing extra), `MCL-FLW-002` (the 103.8% warning),
  `ACS-FLW-002` (novelty) and `GreenRoads…` (refused, with reasons). Since
  2026-09-24 ACS-FLW-002 carries no novelty, so the novelty case is ACS-FLW-002
  with one column heading added that no fixture prints, `Conc. (ug/g)`, and
  ACS-FLW-002 itself is read through the handler as a known layout (below,
  "Known ACS layouts"). Scan QR runs
  twice: by Chromium's fake camera playing `test/fixtures/qr/coa-link.png`, and by
  "Choose QR image". The test also checks that the card hides with its tab, that
  it moves to the panel of the next request, that a refused report shows no card,
  and that Upload makes no request at all. The build stamp is pinned to `dev` and
  no database address is set, so nothing reaches the archive.
- **On `1cbc198`, before the fix**, it failed 15 checks. Every failure was on
  COA link (the card, its warnings and novelty lines, its buttons) or on Upload's
  wording. Every Scan QR check passed, camera and image, warnings and novelty
  lines included. After the fix it passed 65 of 65 on every run.
- **The QR image** encodes `https://lab.example/coa/input-paths-test.pdf`, a
  reserved example domain. It was drawn with libqrencode at error correction L,
  8 pixels to a module, and read back with zbar. Redraw it the same way:
  html5-qrcode 2.3.8 does not read the same address drawn at level M, by camera
  or from a file.
- **In the Codespace, 2026-09-24** (US Eastern), on `e7d27ff`: after
  `npm install --no-save playwright` and `npx playwright install --with-deps
  chromium`, `node test/input-paths-test.mjs` ended `input-paths clean`, as
  reported. So `gates.sh` now runs it, as its last gate, after the build.
  `npm ci` removes Playwright, and the gate then fails until both commands
  run again.
- **How it was verified, 2026-09-23, in the cloud workspace.** npm was blocked
  there, so as in earlier sessions the gates ran on stand-ins: pdfjs-dist
  5.7.284 for unpdf, a throwaway PostgreSQL 16 cluster behind PGlite's API, and
  the committed html5-qrcode in place of `build.sh`'s download. ALL GATES GREEN
  on `1cbc198` before the edit and on the change after it, with `KAY-CAR-001`
  4.124 and `KAY-PRR-001` 0.944. The probe ran on Playwright 1.56.0's Chromium.
  `parse-coa.js`, `coa-dates.js` and `extract-text.js` are untouched, so no
  reparse was needed. The Codespace run on the real packages is the one that
  counts.

### The shown score, 2026-09-24

**A score shown as 75 carried the band below Good.** The app rounded a score
for display (`Math.round(score * 100)`) and banded the unrounded one, so the
home page's default pair - Lemon Tart Pucker against Cold Creek Kush, 0.7452 -
read "75 · Partial overlap", though the published method says 75 and up is
Good. The `/app` result, its summary line, the match-feedback vote and
`drift.js` did the same. Rounding put 49 of the 1964 real scores in
`match-golden.json` (pairs, self-scores, edge cases, palates) in the band
above their own.

- **The fix: one helper in `js/match-math.*.js`, `shownScore(s) =
  Math.floor(s * 100 + 1e-9)`**, used everywhere a score is shown or sent: the
  hero, the result score and its summary, and the feedback payload in
  `js/nose.*.js`, and `drift.js`. A floored number stays inside the score's
  band. `cosine()` and `matchBand()` are byte-identical, and
  `match-golden.json` was not regenerated: every score in it still comes back
  to the last bit. Flooring changes the number shown for 971 of the 1964 - by
  one, down.
- **The home page reads 74 · Partial overlap**, and so does `/app`, whose
  default is the same pair. Opening on a Good match would mean choosing a
  different default pair - a separate decision; the rounding stays. Among the
  five demo jars, Lemon Tart Pucker against Pepper Grove shows 88 · Related
  profile.
- **Why the 1e-9.** A profile scored against itself can come back a hair under
  1, which a plain floor shows as 99: 14 of the 61 golden self-scores - 12 of
  the 56 accepted fixtures (3 at 0.9999999999999998, 9 at 0.9999999999999999)
  and 2 of the demo jars. With it, all 61 show 100.
- **Its cost, pinned in `match-test.js`.** A score within 1e-11 below 0.55,
  0.75 or 0.90 is lifted to the edge while `matchBand()` gives the band below.
  No real golden score falls there; the golden file's three band-edge probes,
  one step below each edge, do, and the test lists them so any change shows.
  No constant avoids it: a self-score two steps under 1 is further from 100
  than one step under 0.75 is from 75.
- **The feedback score switched from round to floor on 2026-09-24** (US
  Eastern), with the deploy of this change. A stored vote from before carries
  `Math.round(cosine * 100)`, one from after it `shownScore()`: a Good vote at
  cosine 0.8963 was stored as 90, and now as 89. A tab opened before the deploy
  keeps its old bundle until reloaded, so the first votes after it may still be
  rounded. Each vote carries the server's `ts`, which splits them. Only Strong
  and Good votes are stored at all - see "Still open".
- **The worked examples moved too.** `learn/intensity-versus-character/` says
  its scores are exactly what NOSE's matcher returns. Floored, the palate built
  from shares scores 85 against the loud jar (the page said 86), and the palate
  of raw values 62 against the quiet jar (it said 63). The page now prints 85
  and 62, with `dateModified` and the sitemap's `lastmod` at 2026-09-24. Its
  other four numbers - 100, 33, 85, 98 - did not move.
- **`match-test.js` checks all of it**: the export list; the four places the
  app shows or sends a score, and `drift.js`, by the code that does it; no file
  in `js/` or `scripts/` rounding a score; every real golden score shown inside
  its band; the 1e-9 and its cost; the article's jars and its six numbers,
  recomputed; the hero anchor, now 74. Six deliberately broken copies each fail
  it: the hero rounding again, the vote rounding again, `drift.js` rounding
  again, a floor without the 1e-9, a `shownScore()` that rounds, and the
  article's old 86. `analysis-test.js` checks that `drift.js` prints
  `shownScore()`.
- **How it was verified, 2026-09-24, in the cloud workspace.** npm was blocked
  there, so as in earlier sessions the gates ran on stand-ins: pdfjs-dist
  5.7.284 for unpdf, a throwaway PostgreSQL 16 cluster behind PGlite's API, the
  committed html5-qrcode in place of `build.sh`'s download, and Playwright
  1.56.0's Chromium. ALL GATES GREEN on `45aa164` before the edit and on the
  change after it, with `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944. The probe
  ran first: through `scripts/lib/match.js`, the hero pair gave
  0.7452381945084086 → 75 → Partial overlap. In headless Chromium on the built
  site, before: the hero and `/app` read 75 · Partial overlap, and a vote sent
  score 75, band Moderate. After: 74 · Partial overlap, and 74. No page errors
  either time. `parse-coa.js`, `coa-dates.js` and `extract-text.js` are
  untouched, so no reparse is needed. The Codespace run on the real packages is
  the one that counts.

### Known ACS layouts, 2026-09-24

**Four accepted ACS reports told people NOSE had not seen their lab's
layout.** `ACS-FLW-002` and `ACS-PRR-001` carried `Moisture` in `unmapped`,
`ACS-LRS-002` `License No.`, and `COA_GassiusClay_…` both `Moisture` and
`AAGZ997-` - the first half of its `Lab Batch #:` value, which the extractor
split from its `25`. A usable read with novelty gets the card's novelty line
(§7), so a jar with any of those reports was told "NOSE hasn't seen this lab's
layout before - check the top three against the report", and "Measured but
outside the six families: Moisture." with it. Both were false.

- **The probe, before any edit**, on `29f2881`: `node test/novelty-test.js`
  listed exactly those four, accepted, and Harmony and hemp-bombs, refused. In
  headless Chromium the ACS-FLW-002 card showed the novelty line, on Scan QR
  and on COA link.
- **The fix, in `parse-coa.js`:** `notAnAnalyteHere(line, previous line)`, one
  more condition in front of `unmapped.add` and called nowhere else, with its
  three patterns beside `NOT_AN_ANALYTE` (§7, "Furniture the unmapped
  diagnostic skips").
- **What moved, all 59 fixtures parsed before and after, every field
  compared:** `unmapped` and `novelty` on those four files, both now `[]`, and
  nothing else. Every terpene value, total, verdict, reason, warning, `readBy`,
  class and freshness figure is the same; `unmapped` is the same on the other
  55 (hemp-bombs keeps `Hemp`), and so are Harmony's and hemp-bombs' notes.
- **`novelty-test` fails when an accepted fixture carries novelty** (§7). It
  also checks each kind of furniture on KAY-CAR-001 with lines added, that an
  unknown name straight after them still counts, that only the filter calls
  the check, and - parsing the corpus again with the call switched off - that
  nothing but `unmapped` and `novelty` differs, on those four files. Against
  the unpatched parser it fails 7 of its checks, the corpus rule among them.
- **`input-paths-test` changed with it.** Its novelty case was ACS-FLW-002,
  which has none now. The case is ACS-FLW-002 with one column heading added
  that no fixture prints, `Conc. (ug/g)` - the novelty line still shows on both
  paths - and a new check reads ACS-FLW-002 itself through the handler:
  usable, no novelty, nothing unmapped, no warning. 66 checks; against the
  unpatched parser it fails the two ACS-FLW-002 checks and nothing else.
- **The archive.** A reparse changes the stored reading of those four
  fixtures, and of any real ACS report with the same furniture, by `unmapped`
  and `novelty` alone. `review-queue.js` lists every document with novelty, so
  run it first: an ACS scan listed there with `unmapped: Moisture`,
  `License No.` or a batch-code fragment is one more expected change. Then
  `reparse.js --dry-run` prints, for each, `usable true → true   readBy forward
  → forward` and an unchanged total, then `also changed: novelty, unmapped`,
  and nothing else. The four fixtures, by the short fingerprint it prints:
  `30ec0091` SFV OG (ACS-FLW-002), `00a19f3e` Space Age Cake (ACS-LRS-002),
  `d904685d` Squirrell Thai Stick (ACS-PRR-001), `76024424` Gassius Clay. Any
  other lab, a terpene that moved, or an accepted→rejected is a fault: stop and
  bring the lines.
- **Rehearsed on a local copy of the seeded archive** (the 59 fixtures, read
  by `29f2881`, in a local PostgreSQL 16 as `nose_writer`): the dry run, then
  a real run of the change committed, both said `59 documents: 55 unchanged /
  4 values changed / 0 accepted→rejected / 0 rejected→accepted / 0 failed`,
  the four above each by `novelty, unmapped` alone. A second run said `59
  unchanged`. `review-queue.js` then counted `3 test fixtures (seeded)` where
  it had counted 7, and `--fixtures` listed the three refusals and nothing
  else.
- **How it was verified, 2026-09-24, in the cloud workspace.** npm was blocked
  there, so as in earlier sessions the gates ran on stand-ins: pdfjs-dist
  5.7.284 for unpdf, a throwaway PostgreSQL 16 cluster behind PGlite's API,
  the committed html5-qrcode in place of `build.sh`'s download, and Playwright
  1.56.0's Chromium; the rehearsal used a `pg` over the same wire protocol and
  a folder standing in for Blobs. ALL GATES GREEN on `29f2881` before the edit
  and on the change after it, with `KAY-CAR-001` 4.124 and `KAY-PRR-001`
  0.944. `build.sh` renamed nothing: no file in `js/` changed. The Codespace
  run on the real packages and the real archive is the one that counts.
- **On the real archive, 2026-09-24 (US Eastern)**, from the Codespace on
  `8a03081`, pulled from a git bundle: `reparse.js --dry-run`, then
  `reparse.js` - run #7, 66 documents through #314 - both said `62 unchanged
  / 4 values changed / 0 accepted→rejected / 0 rejected→accepted / 0 failed`.
  The four were the four fixtures above, by the same short fingerprints, each
  by `novelty, unmapped` alone, with `usable`, `readBy` and the total the same
  before and after. None of the seven documents that are not fixtures
  changed, so no real ACS scan carried the furniture. Run #8 said `66
  unchanged`. `review-queue.js`: `0 documents to look at` of 66, and `3 test
  fixtures (seeded)` counted where there had been 7 - the three refusals.
  Then `git push`, `29f2881..8a03081`.

### One report, many documents - the probe, 2026-10-01

**A document is keyed by the SHA-256 of the PDF's bytes, and Method Testing
Labs' portal builds its PDF when it is downloaded.** So every fetch of one
Method report adds a document, an extraction, a parse and, since 2026-09-23,
a PDF copy. Three consequences: the privacy page says "We do not count how
many times a report is fetched" while the archive keeps one dated row per
fetch; `batch_series`, `drift.js` and `lab-stats.js` count one sample several
times; and storage grows per scan, not per report. Prompt 4 asked for a probe
before any edit. This is the probe; the fix waits on what it finds.

- **The fixture PDFs, read offline** (`pdfinfo`, `qpdf --qdf`). All eight
  `MTL-*` PDFs (mPDF 7.0.3) were made on one of two days - five on the
  evening of 2026-07-25, three on 2026-09-06, the days they were downloaded -
  six days to seventeen months after the batch dates and sign-offs they
  print (MTL-CAR-001 and MTL-LRS-001: batch date 2/27/2025, signed
  3/3/2025). In MTL-CAR-001 the moment of making is written in five
  places and no others: `/CreationDate` and `/ModDate` in the Info
  dictionary, the `/M` of its two link annotations, and the trailer `/ID`.
  None is page content, so none should reach the extracted text - a
  prediction, which only downloading twice tests.
- **Kaycha and ACS are not proven fixed by their dates.** 24 of the 30
  Kaycha (mPDF 8.2.x) and ACS (Chromium) fixture PDFs were made on their
  printed completion day. Of the other six, two Kaycha reports were made on
  the revision day they print (KAY-FLW-003, Grease_monkey_live_resin) and
  ACS-LRS-001 the day after completion - but KAY-AIO-002, KAY-CAR-002 and
  KAY-LRS-001 print no revision and were all made on 2025-12-22, 3 to 41 days
  after completion, which is what a portal that builds a file on first
  download looks like. Modern Canna's Crystal Reports PDFs carry no creation
  date at all.
- **`scripts/duplicates.js`** - probe 1. Read-only, `NOSE_DB_URL`; with
  `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` set it also counts the copies'
  PDFs in Blobs. Documents joined by any extraction text they share are one
  report: the first stored is the report, every later one a copy (joined, not
  merely grouped, because a document extracted twice holds two texts and a
  copy may share either). Then documents whose latest readings name the same
  lab and lab ID, saying whether they share one text - two texts there are an
  amended report, a re-render that changed its text, or one ID on two
  reports. It ends `duplicates already stored: N documents`, after the
  copies by lab and the extractions, parses and PDFs they hold. Prints no
  text, no address, no full fingerprint.
- **`scripts/download-twice.js <link>...`** - probe 3. Writes nothing, needs
  no secrets. Each link is fetched as the scanner fetches it (coa.js's own
  `_resolvePdfFromPage`, up to two pages deep), every link once, then again
  after 65 seconds (`--wait`). For each pair: the SHA-256 of the bytes, the
  PDF's creation and change stamps and file ID, the SHA-256 of the text as
  the archive computes it (`extract-text.js`, then `store.js`'s cleaning),
  and the lab and lab ID read. When the texts differ it prints the differing
  lines, as extracted, with their line numbers, and exits 1. A link is
  printed as its host only.
- **`test/duplicates-test.js`**, a gate (`duplicates clean`): both scripts,
  on PGlite and on fixture PDFs behind a stand-in fetch - a coaportal report
  page whose PDF is rebuilt between downloads (`rebuilt()` rewrites every
  stamp of its making and the file ID in place; the text stays identical,
  which the test checks with the real extractor), a viewer page serving one
  file twice, a text that changes, a link that fails.
- **Rehearsed on a local copy of the seeded archive** (the 59 fixtures, read
  by `035fded`, in a local PostgreSQL 16 as `nose_writer`, a folder standing
  in for Blobs): `duplicates.js` said `59 documents hold 59 distinct reports`
  and `0 documents`. Then MTL-CAR-001, rebuilt twice with new stamps, went
  through `storeScan` as two production scans: each wrote a new document,
  extraction, parse and PDF, and `duplicates.js` said `61 documents hold 59
  distinct reports by text - 2 documents are copies`, both Method, `2 of 2
  with a PDF in Blobs`. That reproduces the mechanism. What the portals
  actually do, and what the real archive holds, only probes 1 to 3 in the
  Codespace can say.
- **On the real archive, 2026-10-02 (US Eastern)**, from the Codespace on
  `2274150`: probe 1 said `66 documents hold 66 distinct reports by text`,
  `duplicates already stored: 0 documents`. Probe 2 - one Method Testing Labs
  jar scanned twice on the live site, a minute apart - then said `68
  documents hold 67 distinct reports`: the second scan's document is a copy
  of the first, the same size, the same lab ID, one text and one reading, and
  its PDF is in Blobs. So the bytes differ and the text matches, through the
  real scanner, extractor and database. The one copy stored is the probe's
  own. Probe 3, `download-twice.js` from the Codespace on `ee9151d`, each
  link fetched twice 65 seconds apart: a Kaycha report through yourcoa's
  viewer, an ACS report through its portal, and a Modern Canna PDF - all
  three the same bytes and the same text both times, creation stamps and
  file IDs unchanged. So only Method's portal rebuilds its PDF on download.
  No Method link was run through it: the two live scans of probe 2 had
  already shown Method's case - bytes different, text identical - through
  the scanner itself.
- **How it was verified, 2026-10-01, in the cloud workspace.** npm was
  blocked there, so as in earlier sessions the gates ran on stand-ins - this
  time pdfjs-dist 6.2.108 for unpdf (it reproduced 56/3, 56/0, clean and
  4.124/0.944 exactly), a throwaway PostgreSQL 16 cluster behind PGlite's
  API, a `pg` over the same wire protocol (without TLS), a folder for Blobs,
  the committed html5-qrcode in place of `build.sh`'s download, and
  Playwright 1.56.0's Chromium. ALL GATES GREEN on `035fded` before any edit
  and with the probe added, `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944.
  `parse-coa.js`, `coa-dates.js` and `extract-text.js` are untouched, so no
  reparse is needed, and no file in `js/` changed. The Codespace run on the
  real packages is the one that counts.

### One report, many documents - the fix, 2026-10-02

Prompt 4's fix, after the probe showed bytes that differ and a text that
matches. Nothing is normalised: texts are compared whole, by the fingerprint
the archive already keeps.

- **`supabase/migrations/20261002180000_nose_one_document_per_text.sql`**
  replaces `save_scan`. It takes an advisory lock on the TEXT's hash first,
  then finds the document: the same bytes (as before - `reparse.js`,
  `--reextract` and backfill reach a document by its own fingerprint), else
  the first document holding an extraction with this text (no document row,
  the extraction reused, a parse only if the reading differs), else a new
  document. Its answer gains `matchedBy`: `new`, `bytes` or `text`. Indexed:
  `extractions(text_sha256)`. The text lock comes before the per-extraction
  lock, always, so they cannot deadlock; two scans of one report with
  different bytes at the same moment make one document - rehearsed on a local
  PostgreSQL 16 with two connections: the second waited on the first's lock,
  then joined its document. The migration also makes `batch_series` one row
  per sample with `copies` (added last, so `CREATE OR REPLACE` keeps its
  grants) and adds `nose.sample_key(lab, lab_id, document_id)`, the one rule
  for "same sample", executable by `nose_writer` only. Grants stay
  append-only; `probe-db.js` checks, in its rolled-back transaction, that a
  second fingerprint with the same text adds no row, and says to push the
  migration if the old `save_scan` answers.
- **`lib/archive.js` writes to the database first** (above, "How `coa.js`
  feeds it"). The PDF is written when the database stored a new document,
  when it matched these same bytes (`onlyIfNew` makes that a no-op, and it
  still fills in a document kept before PDFs were, as rescanning #3 or #184
  promises), and when the database failed, timed out or is not configured.
  A copy by text is not written: `pdf 'copy, not kept'`, `copyOf` the
  document. The database gets half of the 2s budget, the PDF the rest.
  `archive-wiring-test` (45 checks) fails 5 of them against the old file.
- **`backfill-from-blobs.js`** names a PDF whose text a stored document holds
  `a duplicate copy of document #N` and saves nothing for it - the one way a
  copy still reaches Blobs is a scan made while the database was down. Its
  last line counts `duplicate copies` apart from orphans saved.
- **`drift.js` and `lab-stats.js` count samples** (above, "The analysis
  layer"). `seed-from-fixtures.js` counts copies apart, and
  `archive-health.js`'s orphan note points at backfill.
- **`store-test`** gains: same text, different bytes → one document, the
  first one's extraction, no parse, nothing under the copy's bytes, the
  first address kept; different text → two documents; a copy read
  differently → a new parse on the report's extraction, still no document;
  the same bytes with a new text → a new extraction of that document; two
  documents stored with one text before the rule → each still answers to its
  own bytes, and new bytes go to the first; the index; a payload with no text
  refused plainly. Against the old migrations it fails 13 checks. A → B → A,
  the role checks and every earlier check pass unchanged (80 checks).
  `duplicates-test` saves its copies under the old `save_scan`, then
  migrates, then checks a fourth download adds nothing.
- **Rehearsed on a local copy of the seeded archive** (59 fixtures and the
  two rebuilt MTL-CAR-001 copies of the probe rehearsal), migration applied:
  three more downloads of rebuilt Method reports wrote no document,
  extraction, parse or PDF (`pdf copy, not kept`); one with the database
  down wrote its PDF, and `backfill-from-blobs.js` then said `1 duplicate
  copy`, saving nothing; `reparse.js --dry-run` said `61 unchanged`;
  `lab-stats.js` said `59 samples from 61 documents`, Method `10 from 12`;
  `drift.js FLORA` printed `one sample, kept as 3 documents`; `probe-db.js`
  passed every archive and grant check (it fails, locally, only the pooler
  address and SSL checks a local database cannot meet).
- **What it does not undo.** The copy already stored (#449, the probe's) is
  still a document with its PDF; the owner chose an admin cleanup for it
  (below). And a scan made while the database is down still leaves a dated
  PDF copy in Blobs - the price of backfill.
- **How it was verified, 2026-10-02, in the cloud workspace**, on the same
  stand-ins as the probe (pdfjs-dist 6.2.108 for unpdf, PostgreSQL 16 behind
  PGlite's API and `pg`, a folder for Blobs, the committed html5-qrcode,
  Playwright 1.56.0's Chromium): ALL GATES GREEN before and after,
  `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944. `parse-coa.js`,
  `coa-dates.js` and `extract-text.js` are untouched, so no reparse is due;
  `build.sh` renamed nothing. The migration must be pushed (`npx supabase db
  push`) and `probe-db.js` run before the deploy - the new `archive.js`
  against the old `save_scan` would still store every copy, since the old
  function never answers `matchedBy: 'text'`.

### One report, many documents - the cleanup, 2026-10-02

The owner chose an admin cleanup over a privacy-page sentence for the one
copy stored (#449), in the same push as the fix.

- **`scripts/remove-copies.js`** - the only code that deletes from the
  archive. Run by hand from the Codespace with `NOSE_DB_ADMIN_URL`, never by
  a function; it refuses to run as `nose_writer`, whose grants stay
  append-only. A dry run unless `--apply`. A copy is a document sharing an
  extracted text with an earlier one - the documents `duplicates.js` counts.
  Each is removed whole only when every text it holds an earlier document
  also holds: its PDF from Blobs first (`pdf-store.remove()`, called nowhere
  else), then its parses, extractions and document row in one transaction,
  so a failure leaves a document without a PDF that a second run finishes,
  never a PDF without its row. It keeps, and says why, a copy holding a text
  of its own, a copy whose report has no PDF while it has one (its PDF would
  be the only file), and a copy a `reparse_runs` row names as its last
  document (that record is append-only; until 2026-10-02 the foreign key would
  also have refused - it is a number now, checked when a run is recorded).
  The report is never touched. Prints no text, address or full fingerprint.
- **`test/remove-copies-test.js`**, a gate: an archive built as the real one
  was - copies saved by the old `save_scan`, then the migration - with each
  kind of copy; the dry run changes nothing; a Blobs failure leaves that
  copy's rows untouched and a second run finishes it; every text is still
  held; the reports and their PDFs are untouched; `duplicates.js` then
  counts only the copies kept; nose_writer is refused.
- **Rehearsed** on the local copy of the seeded archive: the dry run listed
  the two rebuilt MTL-CAR-001 copies (#60, #61), `--apply` removed both and
  their PDFs, `duplicates.js` then said `0 documents`, `lab-stats.js` `59
  samples`, `reparse.js --dry-run` `59 unchanged`.
- **On the real archive, 2026-10-02 (US Eastern)**, from the Codespace on
  `aeb4418`: `git push` deployed the fix; `npx supabase db push` applied
  `20261002180000_nose_one_document_per_text.sql`, and `probe-db.js` was
  reported passing (probe clean). Then `remove-copies.js` (dry run): `1 copy
  ... would remove document #449 ... a copy of document #448 - 1 extraction,
  1 parse, its PDF`, and nothing else. `--apply`: `1 copy: 1 removed (1
  PDF), 0 kept, 0 failed`. `duplicates.js`: `67 documents hold 67 distinct
  reports by text`, `0 documents`. `archive-health.js`: ok - 67 documents,
  67 extractions, 194 parses, 65 PDFs, no PDF without its row; the two
  documents without a PDF are the expected #3 and #184.
- **The privacy page is unchanged.** It says nothing in the store is edited
  or deleted by the application, and that stays true: this is a maintenance
  script removing a second copy of a report the store still holds once.

### What gets kept, and taking it back out, 2026-10-02

**A receipt that names Kaycha was kept whole, and forever.** `looksLikeLabReport()`
kept a PDF when ANY of three things held - a laboratory the parser
recognised, the words "Certificate of Analysis", a terpene read - and
`detectLab()` matches a lab's name anywhere in the text. So a dispensary
receipt or a jar label that merely names Kaycha was kept, file and text, and
nothing could take it out: `nose_writer` cannot delete, and no removal tool
existed. The endpoint is also an open, anonymous, permanent write path with
no ceiling. The any-of-three rule came from the owner's prompt.

- **The probe, before any edit**, on `035fded` and again on `2bbb62a` once
  Prompt 4 had landed. Through the real `coa.js` handler, the real parser and
  the unpdf stand-in, with only the download and the two archive halves
  stood in for: a dispensary receipt and a jar label naming Kaycha (sign:
  lab) and a letter mentioning a certificate of analysis (sign: phrase) were
  each kept, PDF and text - the receipt's stored text carried the customer's
  name, rewards number and card ending. A menu was kept nowhere. Those three
  files are now a check in `archive-wiring-test`, read by the real parser.
- **The corpus**: 52 fixtures show all three signs, the six ACS reports
  `lab + panel` (they print no "Certificate of Analysis"), Harmony
  `lab + phrase` (no terpene panel). None shows fewer than two, so requiring
  two keeps all 59.
- **The real archive**, from the Codespace on 2026-10-02 (US Eastern), before
  anything was pushed (below, "On the real archive"): the busiest UTC day had
  added 4 new documents from live scans, and no stored document shows fewer
  than two signs. So the risk was prospective - nothing to take out - and the
  cap below is 25 times the busiest day. `scripts/keep-rule.js` is that
  probe's archive half, kept: new documents per UTC day, and any document
  below two signs.

**The fix.**

- **Two of three signs** (`lib/archive.js`). `labReportSigns(output, text)`
  says which hold - `lab`, `phrase`, `panel`, where a panel is
  `terpenesTested` not null, a printed total, or at least one terpene read -
  `signsShown()` names them in that order, and `looksLikeLabReport()` keeps
  a file only when at least `MIN_SIGNS = 2` hold. No output at all shows no
  sign, whatever the text says. One definition: `coa.js` (through
  `storeScan`), the seed and `backfill-from-blobs.js` all keep by it, and
  `keep-rule.js` reads by it.
- **`supabase/migrations/20261002230000_nose_removals_and_cap.sql`**:
  - `nose.removals` - one row per removal made by hand: `removed_on`, the UTC
    day, and `reason`, CHECKed to one of `request`, `personal`, `notreport`,
    `legal`. Nothing else, and nothing about who asked: a free-text reason
    could hold a name, so it is a fixed list.
  - `nose.withheld` - `(kind, sha256)`, `kind` `file` or `text`, each row part
    of a removal. `save_scan` checks it right after its text lock, before
    either lookup and for every context, and answers `{ withheld: true }`
    with nothing written.
  - **The daily cap**: `nose.daily_document_cap()` returns 100. A live scan
    (`context` `production`) that would add a NEW document - neither the same
    bytes nor the same text as one held - while the UTC day already holds 100
    documents gets `{ capped: true }`, with nothing written. One count for the
    site, no per-person key. The count is every document first fetched that
    day, so a seed or backfill run adds to it, but only live scans are
    refused. An advisory lock per day, taken after the text lock and before
    the extraction lock, makes the 100th and 101st scans of a day queue
    rather than both pass. Indexed: `documents(first_fetched_on)`.
  - **`reparse_runs.last_document_id` is a number, not a foreign key**: the
    key would have refused to remove whichever document a reparse run had
    walked last. A `BEFORE INSERT` trigger,
    `reparse_run_document_exists()`, keeps the check that mattered: a run
    cannot be recorded naming a document that does not exist (`23503`, "is
    not in nose.documents - refused").
  - Grants: `nose_writer` SELECT on `withheld` only, nothing on `removals`,
    EXECUTE on the cap; PUBLIC executes nothing; the API roles reach none of
    it.
- **The PDF half obeys the database** (`lib/archive.js`): a `withheld` or
  `capped` answer writes no PDF, and `storeScan` returns `kept: false` with
  `reason` `withheld` or `daily cap`. The reply is byte-identical either way.
  `coa.js` logs nothing for a withheld file and one fixed line for the cap.
- **`scripts/remove-document.js <fingerprint> --reason <word> [--yes]`** -
  run by hand with `NOSE_DB_ADMIN_URL`; refuses `nose_writer`; a dry run
  unless `--yes`. The fingerprint is a document's file fingerprint, or a
  text's, 8 to 64 hex characters as every script prints them; or a PDF in
  Blobs with no document row, whose text it reads with `extract-text.js`. It
  takes the document's parses, extractions, row and PDF - and every other
  document holding one of its texts, another copy of the same report -
  records one removal, and withholds every file and text fingerprint
  involved. **Database first**: the removal, the withheld rows and the deletes
  are one transaction, and PDFs are deleted only after it commits. A PDF that
  fails to delete stays behind withheld, so no scan and no backfill can make
  it a document again, and the same command run again deletes it, as part of
  the same removal - no reason needed. (`remove-copies.js` deletes the PDF
  first because a copy has no withheld fingerprint to guard a PDF left
  behind.) A refusing database rolls back whole: no removal, nothing withheld,
  the PDF untouched. Prints no text, address, strain, client or full
  fingerprint.
- **Finding a fingerprint from what someone sends.** A file:
  `sha256sum file.pdf` is its file fingerprint. A link:
  `node scripts/download-twice.js --wait 0 <link>` fetches it as the scanner
  does and prints the short fingerprint of its bytes and of its text - and a
  Method report's text fingerprint is the one that matches, since its bytes
  change on every download. `keep-rule.js` prints the short fingerprint of
  every document below the rule.
- **`scripts/keep-rule.js`** - reads only, as `nose_writer`: new documents
  per UTC day by how each arrived (the context of its first parse), the
  busiest day of live scans, today against the cap, the withheld count, the
  signs on every document's latest reading, and each document below two
  signs with its `remove-document.js` command. It runs before the migration
  too, saying the cap is not there yet.
- **`backfill-from-blobs.js`** skips a withheld PDF ("withheld - its file was
  taken out of the archive by hand") and a PDF below two signs, each with the
  `remove-document.js` command that deletes its PDF; withheld is counted with
  the skipped, so its last line keeps its form.
- **`probe-db.js`** checks the migration is pushed, that `nose_writer` reads
  `withheld` and cannot write it or see `removals`, that `save_scan` checks
  both before writing, and prints the cap and today's count.
  `archive-health.js`'s orphan note names withheld and non-report PDFs.
- **The privacy page** (`/privacy/`): a fourth "what changed" paragraph - we
  keep less: two signs, and removals - dated "October 2026", the month,
  because the deploy day was not known when this was committed; the third
  paragraph now says the certificate rule held "until the fourth change"; the
  lab-reports paragraph states the two-sign rule, and the ceiling of 100 new
  reports from scans a UTC day; a new "Taking something back
  out" paragraph says to email `contact@nose-app.com` with the link or the
  file, that we do not need to know who is asking and nothing from the
  message is added to the store, and that a removal leaves the day, one word
  and the two kinds of fingerprint, so the same file is not stored again;
  "Records are only ever added" now says things leave the store only by hand;
  "How long we keep things" says "unless removed on request". The lines in
  `app.html` and the home page say the server keeps "a copy of the report" -
  still true, so they are unchanged. `check-trust` clean.

**What did not move.** `parse-coa.js`, `coa-dates.js` and `extract-text.js`
are untouched, so no reparse is due (the rehearsal's `reparse.js --dry-run`:
`59 unchanged`). Every fixture is still kept, and the signs each shows are
pinned. No file in `js/` changed; `build.sh` renamed nothing. ALL GATES GREEN
before and after, `KAY-CAR-001` 4.124, `KAY-PRR-001` 0.944.

**The tests.** `store-test` 111 checks (was 80): withheld by file and by
text, for a live scan and a backfill, nothing written; the reason list, the
fingerprint and kind CHECKs, the removal key; exactly the columns asked for;
the cap at 100 - the 100th kept, the 101st refused with nothing written, a
held report by bytes or text not capped, a seed not capped, withheld answered
first; the index; the trigger's refusal (`23503`); a document a run walked
last removable, the run's number kept; `nose_writer` reads withheld and the
cap, and cannot write withheld or touch removals. `archive-wiring-test` 54
(was 45): one sign of each kind kept nowhere, two of each pair kept, the
probe's three files through the real parser, withheld and the cap writing no
PDF with the same reply, the seed's skip, the rule's edge cases, and the
corpus pinned by signs. `rerun-test` 92 (was 87): backfill skips a one-sign
PDF and a withheld one by file and by text. `remove-document-test` 48 checks,
a new gate. `remove-copies-test` now expects `remove-document.js` among the
scripts that delete and call `pdfStore.remove`. Against the unpatched code
(the old `archive.js`, `coa.js` and `backfill-from-blobs.js`, no new
migration) `archive-wiring-test` fails 9 checks and the three PGlite tests
stop at the missing tables.

**Rehearsed on a local copy of the seeded archive** (a local PostgreSQL 16 as
`nose_writer`, a folder for Blobs). The 59 fixtures seeded by `2bbb62a`, then
three live scans under the old rule: a receipt and a letter, and a jar label
through the old handler. `keep-rule.js`, before the migration, listed exactly
those three below the rule, by short fingerprint. Then the migration;
`probe-db.js` passed every archive and grant check, failing only the four a
local database cannot meet (pooler user, host and port; Enforce SSL).
`remove-document.js` - without `--reason` it asked for one; the dry run
changed nothing; `--yes` removed each (`removal #1 recorded: ... notreport`,
`deleted PDF ...`), and `keep-rule.js` then said `below the rule: none`.
Through the new handler: the jar label again was kept nowhere; KAY-FLW-001,
taken out with `--reason request`, scanned again kept nothing, and nor did the
same report under other bytes; with the day filled to 100 by hand, a new
two-sign report kept nothing and logged the one line, a report already held
was answered as before, and once the day had room the same new report was
kept. With the database down, a scan of the withheld KAY-FLW-001 still wrote
its PDF; `backfill-from-blobs.js --dry-run` named it withheld with the
command, and `remove-document.js <short> --yes` deleted it as part of the
same removal. Afterwards: `reparse.js --dry-run` `59 unchanged`, backfill `0
with no document row`, `duplicates.js` `0 documents`, `archive-health.js` ok.

**How it was verified, 2026-10-02, in the cloud workspace**, on the same
stand-ins as before: pdfjs-dist 6.2.108 for unpdf, throwaway PostgreSQL 16
clusters behind PGlite's API and a `pg` over the same wire protocol (without
TLS), a folder for Blobs, the committed html5-qrcode in place of `build.sh`'s
download, Playwright 1.56.0's Chromium. The Codespace run on the real packages
and the real archive is the one that counts.

**In the Codespace, in this order** (the migration before the deploy: the new
`archive.js` against the old `save_scan` would keep working as before, but
nothing could be withheld or capped):

1. `bash scripts/gates.sh` - ALL GATES GREEN.
2. `node scripts/keep-rule.js` - the probe on the real archive (done once,
   below). A busiest day of live scans anywhere near 100 would mean stop: the
   cap was chosen against a busiest day of 4.
3. `npx supabase db push --db-url "$NOSE_DB_ADMIN_URL"`, then
   `node scripts/probe-db.js` - probe clean.
4. `git push` - deploys. Then "After a deploy", below.
5. For each document `keep-rule.js` lists below the rule (on 2026-10-02:
   none): `node scripts/remove-document.js <short> --reason notreport`, read
   the dry run, then again with `--yes`. `keep-rule.js` again: `below the
   rule: none`.

**On the real archive, 2026-10-02 (US Eastern)**, from the Codespace, before
the migration or the deploy, with the probe as first written - a one-off
`keep-probe.js`, never committed, making the same queries and the same sign
test as `scripts/keep-rule.js`:

```
1. New documents per UTC day (the day each was first fetched), by how it arrived - 67 documents

   day           production        seed    backfill    total
   2026-09-23             4          59           0       63
   2026-09-24             3           0           0        3
   2026-10-02             1           0           0        1

   production scans: 8 new documents over 3 days with any; busiest 2026-09-23 with 4; median 3 on a day with any

2. Signs of a lab report, on the latest reading of each document's newest text - 67 documents

      60  lab + phrase + panel
       1  lab + phrase
       6  lab + panel

   fewer than two signs: none
```

The 59 seeded test reports account for 52 of the 60 with all three signs, the
six `lab + panel` (ACS) and the one `lab + phrase` (Harmony), so all 8
documents from live scans show all three.

**Pushed and deployed, 2026-10-03 (US Eastern)**, from the Codespace on
`78fc4b3`, pulled from a git bundle:

- `probe-db.js` before the migration failed one check only, the new one that
  it is pushed (`probe: 1 failure`).
- `npx supabase db push --db-url "$NOSE_DB_ADMIN_URL"` applied
  `20261002230000_nose_removals_and_cap.sql`, and `git push` deployed
  `2bbb62a..78fc4b3`. The live `/privacy/` page then carried the two-sign
  paragraph and "Taking something back out" - checked from the cloud
  workspace.
- `probe-db.js`: probe clean. The migration is pushed; `nose_writer` reads
  `withheld` and cannot insert, update, delete or truncate it, nor read or
  insert into `removals`; `save_scan` checks withheld fingerprints and the
  daily cap before it writes; `daily cap: 100 new documents from live scans
  per UTC day; today so far: 0`. The admin grant audit is clean - only
  `postgres` and `nose_writer` hold any grant in schema nose, PUBLIC executes
  no nose function, `anon`, `authenticated` and `service_role` reach nothing -
  and Enforce SSL is on. The Data API checks were skipped: no
  `NOSE_PUBLISHABLE_KEY` in that run.
- `archive-health.js`: ok, with one note - 2 documents with no PDF, the two
  expected since 2026-09-23 (#3 and #184).
- `keep-rule.js`: 67 documents and the same table by day; `today
  (2026-10-03, UTC): 0 new documents of the 100 a day the cap allows from
  live scans`; `withheld - taken out by hand, never kept again: 0 file
  fingerprints, 0 text fingerprints`; 60 / 1 / 6 by signs; `below the rule:
  none`. Nothing needed taking out, so `remove-document.js` has not yet run on
  the real archive.
- The migration as applied keeps the note it was committed with on why the
  cap is 100 ("8 documents from live scans, made over 11 days"); the busiest
  day, 4, is recorded here instead, because an applied migration is not
  edited.

### Three privacy sentences, 2026-10-03

Prompt 6: three sentences on `/privacy/` claimed more than is true. The probe
ran on `6fbecdd` before any edit, and showed all three.

- **"…never the time of day, so our records cannot be lined up against the
  server logs our host keeps."** The probe: the five migrations applied to a
  local PostgreSQL 16, then three scans of three reports saved as
  `nose_writer` within one UTC day. They came back as documents 1, 2, 3,
  extractions 1, 2, 3 and parses 1, 2, 3, every one dated the same day: `id`
  is `GENERATED ALWAYS AS IDENTITY` on all three tables, so the order of a
  day's scans survives the day-only dates. The same paragraph already said
  Blobs may note when each PDF was written. Now: "never the time of day"
  stays, and the next sentence says that recording days is not enough to keep
  the records from being lined up against the host's logs, because each record
  is numbered as it arrives and an order can narrow down which request brought
  which report.
- **"…no column in the store can hold anything that identifies a person, and
  the database itself refuses any record that tries to carry one…"**
  `extractions.text` is the report as printed. In the corpus as the archive's
  own extractor reads it (`test/fixtures/extracted`), grouped by the lab the
  parser reads, every Kaycha (22), Modern Canna (13), ACS (8) and TerpLife (2)
  fixture names a director beside the title, and so do 9 of Method's 10 and 2
  of ACT's 3 - 56 of the 59; 6 of Modern Canna's 13 name a chief scientific
  officer as well. 18 fixtures print email addresses, some of
  them people's own: a laboratory's technical director, and contacts at the
  businesses that sent the samples. Through `save_scan`
  as `nose_writer`, a Modern Canna text was kept with those names in it, and
  the same payload with an `email` key in its output was refused.
  `holds_no_person()` reads the keys of `parses.output` - the 18 names of
  `PERSONAL_KEYS` - not their content, and never the text. Now: the store
  holds nothing about the person who scanned; no column is for them; the
  database refuses, before anything is written, a reading that carries a field
  for an account, an email address, an IP address, a device, a browser, a
  session, a phone number or a palate; lab reports name people - the
  laboratory director, sometimes a contact at the business that sent the
  sample - and the text is kept as printed, names and contact details
  included. **One more sentence moved with it**: "no account, no email
  address, … anywhere in it" became "no account, email address, IP address,
  device information, session or palate of yours anywhere in it" - the text
  holds email addresses, so without "of yours" it contradicted the new
  sentence.
- **Login emails** - the open item recorded on 2026-09-23. In the code:
  `auth-signup.js` calls `/signup` and `auth-reset.js` calls `/recover`,
  neither with a redirect address, and nothing on NOSE takes a token from an
  email link, so the only links that work are Supabase's default,
  `{{ .ConfirmationURL }}` - `https://<ref>.supabase.co/auth/v1/verify?…`,
  which redirects to the Site URL once it has verified. In the dashboard,
  2026-10-03 (US Eastern): Site URL `https://nose-app.com`; the template text
  was not found; whether custom SMTP is on is not known. The owner chose to
  say it on the page rather than route the links through nose-app.com. A new
  paragraph under "Who else receives your data": the browser never talks to
  Supabase while someone uses the site (true by `connect-src 'self'` and
  `netlify/lib/auth.js`); the confirmation and reset emails link to
  Supabase's own site, so a click takes the browser there first, and Supabase
  sees the IP address and browser, and may keep them in its logs, before it
  sends the person on to NOSE. **Written for Supabase's default templates**:
  if the dashboard shows the links pointing elsewhere, or a custom SMTP
  provider rewriting them, the paragraph changes (below, "Still open").
- Each corrected sentence ends by saying that an earlier version said
  otherwise, as the page already does for its corrections ("An earlier
  version of this sentence left out…").
- "We do not count how many times a report is fetched" is left to Prompt 4.
- **What did not move.** `check-trust` clean, its patterns untouched.
  `parse-coa.js`, `coa-dates.js` and `extract-text.js` are untouched, so no
  reparse is due; no file in `js/` changed, so `build.sh` renamed nothing.
  ALL GATES GREEN before (`6fbecdd`) and after, `KAY-CAR-001` 4.124 and
  `KAY-PRR-001` 0.944.
- **How it was verified, 2026-10-03, in the cloud workspace.** npm was blocked
  there, so as in earlier sessions the gates ran on stand-ins: pdfjs-dist
  6.2.108 for unpdf, a throwaway PostgreSQL 16 cluster behind PGlite's API,
  the committed html5-qrcode in place of `build.sh`'s download, and Playwright
  1.56.0's Chromium. The probe's database was a plain local PostgreSQL 16. The
  Codespace run on the real packages is the one that counts.

### After a deploy — check it

1. `node scripts/archive-health.js` in the Codespace (reads as `nose_writer`;
`archive-status.js` still works for the database half alone).
2. Scan one real jar on the live site.
3. Run it again: the newest parse is that jar, dated today (UTC), context
`production`, with the deploy's commit as its parser version, and one more PDF
than before the first time a report is seen; nothing new for the same report
again.
4. Netlify → Logs → Functions → `keep-awake` → Run now → `[keep-awake] ok`.
5. Netlify → Logs → Functions → `coa`: no `archive incomplete` line. One names
which half failed, and why, with nothing about the report. An `archive at its
daily cap` line means that UTC day reached the cap (§13, "What gets kept").
6. The home page shows a match score in its hero, and on `/app` choosing a
candidate jar shows a score. Both read their maths from
`js/match-math.<hash>.js`; an empty score means that file did not load. On
the default pair both read 74 · Partial overlap (75 before 2026-09-24).
7. `node scripts/keep-rule.js`: `below the rule: none`, and today's count
under the cap.

### Still open

- **A scan made while the database is down is neither capped nor checked
  against `withheld`**: the database answers neither, so its PDF is written,
  for backfill (§13, "What gets kept"). `backfill-from-blobs.js` then refuses
  a withheld one and names it, and `remove-document.js` deletes it.
- **The cap bounds a day, not the total.** At 100 new documents a day, the
  worst a day can add is about 25.6 MB of text to the database (256KB each;
  the free plan's 500 MB would last about 19 such days) and 1.2 GB of PDFs to
  Blobs (12 MB each). It is one number in a migration; change it with a new
  one.
- **The privacy page dates the fourth change "October 2026"**, the month,
  because the deploy day was not known when it was committed; it went live on
  2026-10-03 (US Eastern). Its sitemap `lastmod` (2026-07-20) predates every
  change on the page, the three sentences of 2026-10-03 included.
- **`remove-document.js` has not run on the real archive** - nothing needed
  taking out on 2026-10-03. Its PDF delete is the `pdf-store.remove()` that
  `remove-copies.js` used for real on 2026-10-02; its transaction, the
  withheld rows and a rescan refused afterwards have run only on PGlite and a
  local PostgreSQL 16, so its first real removal is worth a `keep-rule.js`
  and an `archive-health.js` after it.

- **The one copy stored, #449, was removed on 2026-10-02** (above, "the
  cleanup"); the archive holds no copies. Probe 3 found
  no lab whose text changes between downloads (Kaycha, ACS and Modern Canna
  serve the same file each time), so after the fix the privacy page's "We do
  not count how many times a report is fetched" holds for every lab seen,
  apart from #449 and a PDF kept while the database was down. A lab found
  later whose text changes per download would be kept once per download -
  `duplicates.js` lists it under "same lab and lab ID, different texts".
- **The static preview is not in this repo**, and cannot be: `build.sh` fails
any `.html` with inline script. The guards check only what the build sees; a
preview kept elsewhere needs `node scripts/check-published.js <file>` and
`node scripts/check-trust.mjs <file>` run on it - it may still carry the old
promise that NOSE keeps nothing.
- Supabase free projects pause after a week idle, which looks like a connection
fault. `keep-awake.js` exists to prevent it; if its log says FAILED, resume the
project from the dashboard before debugging anything else.
- **The app's alias table contradicts §4.** `TERP_ALIAS` (now in
`js/match-math.*.js`) folds `caryophyllene-oxide` into caryophyllene,
`linalool-oxide` into linalool and a bare `pinene` into α-pinene. The parser
never emits those keys, but a hand-made palate file brought in through
Import reaches them. Moved verbatim, because the scores had to stay
identical; `wip/nose-farnesene-wip.js` is an unfinished draft that removes
them. Fixing it changes scores, so it needs its own prompt and a
regenerated `match-golden.json` in the same commit.
- **Votes on a Partial overlap or Different profile match are refused.** The
  app sends `matchBand(score)[1]` as the vote's band - Strong, Good, Moderate
  or Low - and `match-feedback.js` accepts Strong, Good, Partial and Weak. So
  a vote on a Moderate or Low match gets a 400 `bad-band` and is never
  stored, and `sendBeacon` drops the answer, so nobody sees it. The default
  `/app` pair, 74 · Partial overlap, is one of them. Seen 2026-09-24 by
  running the handler with a stand-in store: Strong and Good stored, Moderate
  and Low refused. It predates the shown score. A fix changes which votes are
  stored and the band slugs in their keys - map the names in the client, or
  accept both on the server - so it waits for its own prompt. The
  dispensary's votes do not repeat it: they take matchBand()'s four names,
  read back from the maths file by their test (§14, "Feed and votes").
- **The static preview keeps its own copy of the maths** (it is not in this
  repo, §13 above). `match-test.js` cannot see it; a preview built after
  today should load `js/match-math.<hash>.js` rather than carry a copy. Its
  copy predates `shownScore()`, so until it is rebuilt that way it rounds.
- **A COA link card taken by a scan leaves its message behind.** Read a link,
leave its card open, then scan a code on Scan QR. The card moves to Scan QR with
the new report, and the COA link tab still says "<lab> read. Check the values
below, then add the jar." with nothing below it. Seen in Chromium, 2026-09-23.
The reverse cannot happen: opening Scan QR restarts the camera, which replaces
that tab's message. A fix would change what `fetchCoaReport()` says in the
panel it takes the card from, on both paths, so it waits for its own prompt.
- **The home page still offers "upload a report"** as a way to add a jar
(`index.html`, "Add a jar you liked"). The Upload tab now says that isn't
available yet.
- **`account/index.html`'s footer lists Account twice.**
- **How `novelty` was verified, 2026-09-23.** No npm here: the gates ran on
pdfjs-dist 5.7.284 standing in for unpdf (56/3, 56/0, clean, 4.124/0.944 on the
untouched branch first), PGlite's API over a throwaway Postgres 16 cluster, and
`build.sh` with the committed html5-qrcode served in place of the jsdelivr
download. Then in the Codespace on the real packages: ALL GATES GREEN, and the
real archive as recorded above.
- `pdf-store.read()` asks Blobs for `getWithMetadata`, which only a stand-in
has answered so far; the first `reparse.js --reextract --dry-run`, backfill or
export in the Codespace is its first real proof.
- The seed and the re-run tools run from the Codespace: this cloud workspace
cannot reach npm, Supabase or Netlify. Offline, `@netlify/blobs` is a stand-in
built from its published types (v10: `set` returns `{ modified }`, and
`onlyIfNew` answers a 412 with `modified: false` rather than throwing).
- The terms page's "Before launch" box still lists the operating entity's legal
name and address, a governing-law clause, an effective date, and a lawyer's
review.
- **Login emails show Supabase the clicker's IP address - said on the privacy
page since 2026-10-03, for Supabase's default templates** (above, "Three
privacy sentences"). Sign-up and password reset call Supabase's auth API from
the server (`netlify/lib/auth.js`, no forwarded address), but the emails link
to Supabase's own domain, so whoever clicks one reaches Supabase from their
own browser, and Supabase's auth logs record the address. If the accounts
share the archive's project, those logs sit in the same database - which is
why the privacy page says the IP address never reaches the *store*, not the
database. **Still to read in the dashboard**: the link in Authentication →
Emails → Templates (Confirm sign up, Reset password) - not found on
2026-10-03 - and Emails → SMTP Settings. If the links point anywhere but
Supabase's own site, the new paragraph changes. The account functions'
`SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are not described anywhere in this
file either.
- **No page finishes a password reset.** After a reset link, Supabase verifies
it and sends the browser to the Site URL (`https://nose-app.com`) with a
session in the address after `#` - Supabase's documented flow for a request
made without PKCE, as `auth-reset.js` makes it; not yet watched on the live
site. Nothing on NOSE reads it, asks for a new password, or calls Supabase to
set one - no function calls `/user`, read in the code on 2026-10-03 - so a
reset email cannot lead to a new password today. Routing the links through
nose-app.com (a landing page, and a server call that verifies the link's
`token_hash`) would fix this and the IP-address point together, and email
scanners that open links before people do are the known trap there. It needs
its own prompt.
- **Supabase's session is left in the address.** The same redirect, after a
confirmation or a reset link, puts an `access_token` and a `refresh_token`
after `#` on nose-app.com (the documented flow again; not yet watched). NOSE
never reads or clears them - the app's router reads `#` only to name a page -
so they would stay in that browser's history. Ending the redirect (the item
above) ends this too.
- **Custom SMTP: not known whether it is on.** Supabase's docs (read
2026-10-03): without it, the built-in service delivers only to the project's
team members, 2 messages an hour, so real people would get no confirmation or
reset email. With it, that company receives every address it delivers to, and
the privacy page's "Nobody else" would have to name it; and if it tracks
clicks, the email links go through its own address first.
- **The stored address keeps a link's path.** Only what follows "?" (and "#")
is dropped, so a one-off link that carries a code in its path keeps it. "The
store holds nothing about the person who scanned" relies on that being rare:
a jar's QR code is printed for the batch, not the buyer.
- **The schema still describes itself as holding nothing that identifies a
person** - the header of `20260922180000_nose_archive.sql` and its `COMMENT ON
SCHEMA nose`. An applied migration is not edited; a later one can restate the
schema comment if wanted.
- **An `npm audit` warning** was seen in the Codespace (reported 2026-09-23)
and has not been looked at: the cloud workspace cannot reach npm. Next step:
`npm audit` in the Codespace, and bring its output.

---

## 14. Dispensary integration

The dispensary (B2B) plan, built prompt by prompt; each records itself here.
Its core promise: **a shopper's purchase history never reaches NOSE.** The
dispensary's page hands the shopper's batch IDs to the shopper's own browser,
and the widget builds the palate and ranks there. B2B lives apart from
everything consumer - its own schema (`b2b`) and role (`nose_b2b`), since
2026-10-07, and its own Blobs store (`b2b-votes`) and functions (`b2b-catalog`, `b2b-feed` and `b2b-vote`), all since 2026-10-08 -
and whatever runs on Netlify stays off unless `B2B_ENABLED=1` in the
Production context and `build-info.json` says production
(`lib/b2b-flag.js`). No B2B record or log holds anything about a shopper. A batch
without an accepted read shows no terpene panel: never a guess, never a
strain-name lookup.

Each prompt's record goes above "Still open". "Later", the wanted work not
yet built, stays the last part of this section.

### The coverage report, 2026-10-05

The first thing a dispensary sees: how many of its in-stock inhalables have a
terpene panel NOSE can read, by category and by lab, and every one it can't,
with the reason. A Codespace script that writes one local folder and nothing
else - no database, no archive, no endpoint.

```
netlify/functions/lib/fetch-report.js   the fetch chain, moved out of coa.js unchanged (s12)
netlify/functions/coa.js                requires it; every export and every reply as before
scripts/b2b-coverage.js                 the report: <catalog.csv> [--out DIR] [--limit N]
docs/B2B-CATALOG-FORMAT.md              the CSV a dispensary exports
test/b2b-coverage-test.js               offline, a gate: "b2b-coverage clean"
test/fixtures/b2b/catalog.csv           25 rows, one for every case; catalog-unknown.csv, catalog-personal.csv
.gitignore                              b2b-out/, the script's default folder - and where a catalog CSV goes
```

**The probe, before any edit**, on `c337c70`:

- The chain in coa.js: the five limits (lines 47-56), then `isBlockedHost`,
  `validateUrl`, `fetchOnce`, `isPdf`, `looksLikeHtml`, `resolvePdfFromPage`
  and `fetchPdf` (93-287). The handler called `validateUrl` and `fetchPdf`.
- Tests importing coa.js: `resolver-test` and `duplicates-test`
  (`_resolvePdfFromPage`), `archive-wiring-test` (the handler, `_archiveScan`,
  `_ARCHIVE_LIMITS`), `input-paths-test` (the handler). Reading its source:
  `archive-wiring-test`'s call-site check, which names nothing in the chain,
  and the tree-wide scans (`match-test`, `remove-copies-test`, the trust
  guard), which read every file.
- Nothing outside coa.js could call the fetching functions.
  `resolvePdfFromPage` alone was reachable, as `_resolvePdfFromPage`, by those
  two tests and by `scripts/download-twice.js` - which wraps it in a looser
  loop of its own (redirects followed without a re-check, 30 s, no size cap).
  That script stays as it is (below, "Still open").

**The move.** The moved lines are byte-identical in `lib/fetch-report.js`;
coa.js gained the `require` and four header lines and lost nothing else. Its
exports are the same five, and `_resolvePdfFromPage` is the very function
`fetch-report.js` exports. Its replies were checked before and after with a
scratch harness driving the real handler through a stand-in fetch, 57 cases:
every `validateUrl` refusal (15 private-host forms among them; 172.32.0.1
correctly is not one), a network error, an abort, a 404 and a 500, every
redirect fault, three redirects followed and a fourth refused, both size
limits, under 512 bytes, neither PDF nor page, the viewer and portal pages
(yourcoa, coaportal two pages deep, a WordPress `&#038;`, `viewer.html?file=`),
a self-referencing page, accepted reads from each lab, the three refused
fixtures, an unreadable PDF, one with too little text, a request left hanging
(7.5 s) and a slow page before a hanging report (the 8 s budget) - plus 8
resolver pages and the export list. 66 lines, the same SHA-256 before and
after, the 56 requests the chain made included (address, redirect mode,
Accept header, signal). The harness is scratch, not committed, like earlier
probes.

- Netlify: a file in a subdirectory of the functions directory is a function
  only when it is named `index` or after that subdirectory
  ([Get started with functions](https://docs.netlify.com/build/functions/get-started/),
  "Create your first function", read 2026-10-05). So `lib/fetch-report.js`,
  like every other `lib/` file, is bundled into coa.js and is never a
  function of its own.

**The format** - `docs/B2B-CATALOG-FORMAT.md`: a header row, UTF-8, the
eleven columns the prompt named and no other. Decided here, where the prompt
was silent:

- Required: `product_id`, `batch_id`, `category`, `route`, `name`,
  `in_stock`. Optional, empty when unknown: `brand`, `coa_url`,
  `product_url`, `thc_percent`, `cbd_percent`. Every column must be in the
  header, in any order; column names and the three lists' values are matched
  ignoring letter case.
- One row per batch: a later row with the same `batch_id` is refused, naming
  the first. Prompt 2's `batches` key is (store_id, batch_id), so a batch
  sold as two products is listed once.
- A percent is a number from 0 to 100, `%` allowed. `ND` is refused, never
  read as 0. `product_url` must be `https`: something will link to it.
  `coa_url` is not checked by the format - the chain refuses a bad link and
  the report gives its words.
- The file is refused for a personal-looking column (checked first, so the
  reason given is the one that matters), any other column outside the format
  (by name), a missing or doubled column, not UTF-8 (a fatal decoder, never a
  guess), empty, no header, a quote never closed, or over 20 MB. A row is
  refused for a wrong number of values, an empty required value, a value off
  its list, the two above, or a repeated batch. Row numbers count the header
  as row 1, as a spreadsheet does; blank rows are skipped and counted.
- **Looks personal**: `PERSONAL_KEYS` from `lib/store.js`, and `customer`,
  `patient`, `card`, `license` (and `licence`), `dob`, `address`. With case
  and separators set aside, a word longer than three letters counts anywhere
  in the name (`Customer E-mail` holds `customer` and `email`); `ip` and
  `dob` only as a whole part of it (`clientIp`, `IP Address` - not `zip`,
  `shipping`, `description`). Every such column is outside the format anyway,
  so the rule decides the reason and the moment - before any row is parsed -
  never whether such a file is read. The refusal names the column, never a
  value.

**The script** - `node scripts/b2b-coverage.js <catalog.csv> [--out DIR] [--limit N]`.

- Each in-stock row's `coa_url` goes through `validateUrl` and `fetchPdf`
  from `lib/fetch-report.js` - coa.js's guards and deadlines, 7.5 s a request
  and 8 s a link - then `extract-text.js`, then `parseCoa`. The handler's
  steps in between are restated, because the script must not load coa.js:
  under 200 characters refused, and the handler's own sentences for an
  unreadable PDF, no text, a parse that throws and a refusal without reasons.
  The test pins each against coa.js's source, and fails if
  `UNSAFE_UNDER_UNPDF` is ever not empty: the report would then count as
  readable what the scanner refuses.
- One link at a time; a 1000 ms pause before every request but the first. A
  link `validateUrl` refuses is never requested, so nothing waits for it.
  `--limit N` tries the first N links; the rest are "not fetched (--limit)",
  counted, and the report says it is a partial run.
- It never loads coa.js, `lib/archive.js` or `lib/pdf-store.js`, and never
  calls `storeScan`, `saveScan` or `archiveScan`: no catalog's report enters
  the lab-report archive. `PERSONAL_KEYS` comes from `lib/store.js`, which
  loads nothing at all until a save.
- **report.md**: the headline (`N of M (p%) in-stock inhalables have a
  terpene panel NOSE can read`); panel NOSE can read, report refused, no
  link, link could not be fetched, overall, by category and by lab (the lab
  the parser read; a link that gave no report counts as "(no report read)"),
  every share written "n of m (p%)"; the refusal reasons - the parser's
  `rejectReasons` verbatim, or the scanner's sentence for a PDF it could not
  read - and the fetch failures in the chain's words, each with its rows; the
  three flags; every in-stock batch NOSE can't read; every batch it can; and
  the rows not read.
- **Flagged, never fixed.** The report's `productClass` is not the row's
  category family: a pre-roll is flower, as `parse-coa.js`'s CLASSES reads
  one, and `unknown` is said as the report not saying which form. The
  report's `batch` and `labId`, spaces and letter case aside (ACS prints
  `1006 1837 9110 9527`), do not contain the row's `batch_id`, or NOSE read
  neither. One link on two batches, across every row in stock or not, links
  being equal apart from `#` (never sent to a server): the case this exists
  for is an in-stock batch pointing at the last batch's report.
- **Numbers only for accepted reads**: the total terpenes the lab printed, and
  the top three as share of the modelled total through `normalize()` from
  `js/match-math.<hash>.js` (`scripts/lib/match.js`), one decimal, as
  `drift.js` shows them - with the card's notes, word for word (its novelty
  line, the parser's warnings). A refused read shows its reasons and no
  figure, not even its total.
- **report.csv**: one line per row, refused and out-of-stock rows included,
  each outcome named. UTF-8 with a byte-order mark, so a spreadsheet shows β;
  a cell starting with `=`, `+`, `-` or `@` is written after a `'`, so a name
  from a catalog, or a batch read off a report, cannot run as a formula.
- **Links by host only**, in both files: a link can carry a token.
- It writes `report.md` and `report.csv` into `--out` (default `b2b-out/` at
  the top of the repo, gitignored) and nothing else, and prints a line per
  link (row and outcome) and the summary. A refused file writes nothing and
  exits 1; a usage error exits 2.

**The test** - `test/b2b-coverage-test.js`, 61 checks, a gate after
`remove document`. The catalog has a row for each case: accepted reads
through a Kaycha viewer page, through Method's portal two pages deep, and
direct (ACS, Kaycha, Modern Canna with its warning); a pre-roll whose report
reads as flower; batch IDs found with spaces or case aside, or by lab ID; a
vape report listed as flower; a report naming another batch; a refusal
(GreenRoads, listed as a concentrate: refused, and both flags); an unreadable
PDF; no link; a 404; the cloud metadata address (never requested); a redirect
to a private address (not followed); a plain-http link; one link on two
batches, once with `#page=1`, once with the other batch out of stock; an
out-of-stock row; three refused rows (an edible on route oral, a repeated
batch, `ND`); a blank row; and a name built to break a table and run as a
formula. It checks every outcome; the counts overall, by category and by
lab; every share's denominator; the top three from `normalize()`, which on
KAY-CAR-001 are not shares of the printed total; figures on accepted lines
only; each refusal and failure in the words coa.js's own handler gives for
the same link through the same stand-in; never two requests open at once,
and each pause straight before a request; `--limit 3`; a slow page then a
hanging report ended at 8 s, not 12.5; the unknown-column and personal-column
files refused before any row (nothing fetched, nothing written, the e-mail
never echoed) and six more file refusals; `looksPersonal` on 22 personal
names and on none of the format's columns; CRLF and a byte-order mark read
as LF; the command line's exit codes; `b2b-out/` ignored by git; coa.js,
`lib/archive.js`, `lib/pdf-store.js`, `pg` and `@netlify/blobs` never loaded
during a run, the archive's stand-ins never touched, nothing written outside
the report folder; only `lib/fetch-report.js` defining the chain under
`netlify/` and `scripts/`; no effect wording in the report, the script, the
format document or the catalog; and the format document naming every
column, value and personal word the script reads.

- **Against broken copies**: 28 deliberate faults, one at a time - shares of
  the printed total, every link at once, loading coa.js, handing a reading to
  the archive, no personal rule, a pre-roll as its own family, exact batch
  comparison, no pause, a pause before refused links, figures for refused
  reads in the CSV, whole links shown, no formula guard, shares without
  denominators, `#` making a new link, out-of-stock links left out of the
  shared-link check, out-of-stock rows fetched, unknown columns ignored,
  reasons reworded, a sentence of its own for a failed fetch, a copy of
  `isBlockedHost` in another script, a text floor of 300 in coa.js, an
  unsafe rule added to coa.js, no 8 s budget, blank rows refused, a repeated
  batch accepted, the chain bypassed - each fails it. One more, figures
  computed for refused reads but never written, passes, as it should: both
  files still show none.

**The test catalog's report**: 12 of 19 (63%) in-stock inhalables have a
terpene panel NOSE can read; 2 refused, 1 with no link, 4 whose link could
not be fetched; 2 out of stock, 3 rows refused, 1 blank row skipped; flagged:
2 forms, 3 batches, 2 shared links. By lab: Kaycha 9 of 9; ACS, Method and
Modern Canna 1 of 1 each; TerpLife 0 of 1 (refused); 6 with no report read.

**How it was verified, 2026-10-05, in the cloud workspace.** npm was blocked
there (registry.npmjs.org is not on its allowlist), so as in earlier sessions
the gates ran on stand-ins: pdfjs-dist 6.2.108 for unpdf (56/3, 56/0, clean
and 4.124/0.944, as recorded), a throwaway PostgreSQL 16 cluster per test
behind PGlite's API (every PGlite gate clean on it before the edit), the
committed html5-qrcode in place of `build.sh`'s download, and Playwright
1.56.0's Chromium. ALL GATES GREEN on `c337c70` before any edit, and after it
with the new gate - 22 gates, `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944.
The new test passed on Node 20 as well. `parse-coa.js`, `coa-dates.js` and
`extract-text.js` are untouched, so no reparse is due; no file in `js/`
changed, so `build.sh` renamed nothing. Nothing ran against the network, the
database or Netlify. The Codespace run on the real packages is the one that
counts.

**Run it on a real export, from the Codespace** (the catalog is the
dispensary's file, and this repo is public: it lives in `b2b-out/`, which git
ignores):

1. `git pull`, then `bash scripts/gates.sh` - ALL GATES GREEN, `b2b coverage`
   among them.
2. `mkdir -p b2b-out/<store>`, then drag the CSV into that folder in the
   Explorer. `head -1 b2b-out/<store>/<file>.csv` shows its header.
3. A short trial: `node scripts/b2b-coverage.js b2b-out/<store>/<file>.csv
   --out b2b-out/<store> --limit 5`. A refused file says why and writes
   nothing: fix the export, never the rule.
4. The whole catalog: the same without `--limit`. Roughly 1 to 3 seconds a
   link.
5. Open `report.md` (right-click, Open Preview) and `report.csv` in that
   folder. Read the refusals and the flags before sending either: they are
   about the catalog as much as about NOSE.
6. When the report has gone, `rm -r b2b-out/<store>`: nothing else holds a
   copy.

### Schema, role, keys and the switch, 2026-10-07

A home for dispensary data that cannot mix with the archive or hold anything
about a person, and one switch that keeps every B2B function off. Nothing in
it is live: the migration is pushed by hand (below), no function uses the
store or the switch yet, and no store exists.

```
supabase/migrations/20261008020000_nose_b2b.sql   schema b2b, its four tables, role nose_b2b and its grants
netlify/functions/lib/b2b-store.js                upsertBatches, upsertRead, storeForKey; the keys; coaLink
netlify/functions/lib/b2b-flag.js                 b2bEnabled(): the one switch
scripts/b2b-store.js                              admin: create, add-origin, rotate-keys, revoke, delete-store
scripts/set-b2b-password.js                       nose_b2b's password by SCRAM verifier; prints NOSE_B2B_DB_URL once
scripts/check-published.js                        an nsk_ key fails the build, tracked or published
scripts/probe-db.js                               the b2b audit, as admin and as nose_b2b; the Data API refuses b2b
test/b2b-store-test.js                            PGlite, offline, a gate: "b2b-store clean"
test/probe-test.js                                the b2b Data API requests, offline: 26 checks (was 20)
scripts/gates.sh                                  the gate, after b2b coverage
```

**The probe, before any edit**, on `fe8d8ff`:

- `nose.holds_no_person()` and `PERSONAL_KEYS` held the same 18 keys in the
  same order. Two things kept them so: a "keep identical" comment in each,
  and one `store-test` check sending each JS key, uppercased and two deep,
  straight to `save_scan`. That proves one direction only - a key added to
  the SQL list alone passed it. B2B adds a third copy, so `b2b-store-test`
  compares all three lists as each function's own source states them, and
  the two bodies byte for byte.
- `store-test` reads every `.sql` in `supabase/migrations`, sorts by
  filename and runs each whole file through `db.exec` on one fresh PGlite,
  then drives `store.js` through the `{ client: db }` seam. Six other PGlite
  tests do the same (three in two halves around `20261002180000`), so the
  new migration runs in all seven and must run on plain PGlite.
- `nose_writer`: LOGIN, no password in any migration, no superuser,
  createrole, createdb, replication or bypassrls, a member of no role. USAGE
  on schema nose; SELECT and INSERT on documents, extractions, parses and
  reparse_runs; SELECT alone on withheld and the three views; nothing on
  removals; EXECUTE on seven functions, not the trigger's. PUBLIC: no USAGE,
  no EXECUTE. One default privilege - the admin's new tables in schema
  **nose** give nose_writer SELECT and INSERT - scoped to nose, so b2b tables
  never inherit it. All of it is unchanged, which the test proves.
- `probe-db.js` audits, as admin: the role's flags; every grantee on schema
  nose, its relations and functions must be postgres or nose_writer; PUBLIC
  executes no nose function; anon, authenticated and service_role reach
  nothing. As nose_writer it tries UPDATE, DELETE and TRUNCATE and expects
  42501, and asks `has_table_privilege` for the views.
- Tested here on PostgreSQL 16: a CHECK's function runs with the writing
  role's privileges and needs its EXECUTE (its schema's USAGE is not
  needed). So a b2b CHECK could not call `nose.holds_no_person()` without
  giving nose_b2b a grant in schema nose: b2b has its own copy.

**Two decisions the owner made, 2026-10-07**, where the prompt and the
prompts after it pulled apart:

- **`coa_url` is the whole link without its `#` part**, not origin and path
  only. Real catalog links name the report in the query - Kaycha's viewer
  `?sample=`, Method's portal `?search=`, both in the test catalog - so a
  stripped link could not be fetched by Prompt 3's reader. A catalog link is
  the store's product data, the same for every shopper; the archive strips a
  *scanned* link because its query can carry a token tied to whoever
  received it. A fragment never reaches a server, so dropping it loses
  nothing. A link with a user name or password is refused.
- **nose_b2b reads stores and store_keys and cannot write them.** Only the
  admin script makes stores and keys, so a tricked function cannot add a
  key, un-revoke one or add itself an origin. On batches and batch_reads it
  has SELECT, INSERT and UPDATE, as the prompt said.

**The schema** - `b2b`, commented column by column in the migration:

- `stores`: id, slug (`^[a-z0-9]+(-[a-z0-9]+)*$`; it will name the store in a
  vote's Blobs key, Prompt 4), display_name, allowed_origins (https origins
  as a browser sends them - scheme, lowercase host, optional port; distinct;
  at most 20: `b2b.https_origins()`), window_months (default 12, 1 to 36),
  the guardrail as `guardrail_thc_points` and `guardrail_cbd_points`
  (percentage points around the basis batches' median, Prompt 5; NULL is
  off), created_on.
- `store_keys`: store_id, kind (secret | public), key_sha256 (64 hex, the
  primary key), created_on, revoked_on. At most one working key of each kind
  per store, by a partial unique index. The key itself is nowhere in the
  database: not in a row, not in a statement.
- `batches`: the catalog's columns, list_position, first_listed_on and
  last_listed_on; primary key (store_id, batch_id). Text bounded, trimmed
  and free of control characters; NULL is "not given", never an empty string.
- `batch_reads`: one current reading per batch, its foreign key the batch -
  read_on, lab, product_class, usable, reject_reasons and warnings (text
  arrays), terps (jsonb), total_terpenes, moisture, water_activity,
  harvest_on and report_on (dates), read_by. `values_only_when_usable`: an
  accepted reading carries its terpenes and the lab's total, a refused one
  neither, nor moisture or water activity. `terps_are_terpenes`: an object of
  1 to 100 terpene keys and non-negative numbers - no sentence or name fits.
- **Nothing about a person.** No column is for a shopper, a purchase or an
  order, and every day is a `date`. `b2b.holds_no_person()` - the archive's
  function, its body and key list identical - is a CHECK on the one jsonb
  column (`terps_hold_no_person`), and a trigger,
  `b2b.refuse_personal_fields()`, runs the same check over every row of every
  table first (BEFORE INSERT OR UPDATE): a CHECK violation echoes the failing
  row into the Postgres log, while the trigger's refusal carries no data -
  `b2b: a field that identifies a person - refused, nothing written`.
- **Apart.** No foreign key or function crosses between b2b and nose.
  nose_b2b holds nothing in nose and nose_writer nothing in b2b; neither is a
  member of any role; PUBLIC executes nothing in b2b; the API roles are
  revoked from all of it; b2b has no default privileges, so a later table is
  granted nothing until its own migration says so.
- Supabase exposes only `public` to the Data API unless a schema is added to
  "Exposed schemas" ([Using Custom Schemas](https://supabase.com/docs/guides/api/using-custom-schemas));
  a custom role on the shared pooler signs in as `[ROLE].[PROJECT-REF]`, and
  transaction mode (6543) runs no prepared statements
  ([Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres)).
  Both read 2026-10-07.

**`lib/b2b-store.js`** mirrors `store.js`. `upsertBatches(storeId, rows)` is
one statement and answers counts; `upsertRead(storeId, batchId, output)`;
`storeForKey(key)`. Only `BATCH_FIELDS` and `READ_FIELDS` ever leave it. A
personal key anywhere in what a caller hands in is refused before anything
is sent, naming the key and never its value - by `store.js`'s own
`PERSONAL_KEYS` and finder, not copies. A refused reading is sent with its
reasons and no figure; an empty optional value goes as NULL; `coa_url` goes
through `coaLink()`. A fresh pg Client per call, bounded as `store.js`
bounds it, configured by `store.js`'s own `clientConfig()`: the transaction
pooler, the embedded CA, no sslmode. Without `NOSE_B2B_DB_URL` a write
answers `not configured` and `storeForKey` null, and pg is never loaded. A
database error comes back as one short message with no key, fingerprint,
address, host, IP or quoted value, with its code and constraint name -
never its detail, where Postgres puts the failing row. Nothing in it logs.

**Keys**: 32 random bytes as hex behind `nsk_` (secret: the store's server,
uploading its catalog) or `npk_` (public: named in the store's page, opening
its feed; not a secret). `keyHash()` is the SHA-256 of the whole key as
written; it is all `store_keys` holds.

**`lib/b2b-flag.js`**: `b2bEnabled()` is true only when `B2B_ENABLED` is
exactly `1` and `build-info.json` says `production`, read through
`lib/version.js` as the archive's switch reads it. A variable set in the
Netlify UI reaches functions at runtime and one in `netlify.toml` never does;
each deploy keeps the values set when it was made, so switching on or off
takes a new deploy ([Environment variables and functions](https://docs.netlify.com/build/functions/environment-variables/),
read 2026-10-07). A preview or branch deploy reads its own context from that
file, so it stays off even if the variable reached it. No function asks it
yet.

**`scripts/b2b-store.js`**, admin, with `NOSE_DB_ADMIN_URL`; it refuses to
run as nose_b2b or nose_writer.

- `create <slug> --name "…" --origin https://… [--origin …] [--window-months N] [--guardrail-thc N] [--guardrail-cbd N]`:
  the store, and its first secret and public key.
- `add-origin <slug> https://…`.
- `rotate-keys <slug> [--secret | --public]`: new keys, and the old ones stop
  working at once, in the same transaction.
- `revoke <slug> [--secret | --public]`: the working key or keys stop, with
  none to replace them.
- `delete-store <slug> [--yes]`: the end of a license - readings, batches,
  keys and the store, in one transaction; a dry run without `--yes`. The only
  code that deletes from b2b.
- A new key is printed once, after the change commits, and written nowhere
  else; the database gets its hash alone. No command shows a key again or
  prints a full fingerprint.

**`scripts/set-b2b-password.js`**: `set-writer-password.js`'s own
`scramVerifier()` and `parseAdminUrl()`, not copies. A random 64-hex
password, only its SCRAM-SHA-256 verifier sent, and a TLS-verified login as
nose_b2b through the transaction pooler before it prints `NOSE_B2B_DB_URL`
once, with where to save it: Codespaces secrets only, for now.

**`check-published.js`**: `nsk_` followed by eight or more key characters
fails the build in a tracked or a published file - a whole key, part of one,
or one glued to other text. Writing about the prefix (`nsk_ for secret`,
`nsk_…`) passes, and so does a public `npk_` key, which a store's page
carries.

**`probe-db.js`**: with `NOSE_B2B_DB_URL`, as nose_b2b - the address
(`nose_b2b.<ref>`, the pooler, 6543, the same project as `NOSE_DB_URL`),
TLS, exactly the privileges above on each table, DELETE and TRUNCATE refused
on all four, writes to stores and keys refused, schema nose refused, EXECUTE
on exactly the two checks. Every statement it tries there is one nose_b2b
must be refused, inside a transaction rolled back - so even a wrongly granted
TRUNCATE loses nothing - and a refusal counts only when it names the object
the privilege is on (`permission denied for table store_keys`). As admin:
the migration pushed, the role's flags, no membership, only postgres and
nose_b2b holding grants in b2b, PUBLIC executing nothing there, the exact
grants, no default privileges, each role out of the other's schema, the API
roles out. With the publishable key the Data API must refuse schema b2b as
`PGRST106` too. Nothing it does writes to b2b; every nose check is
unchanged.

**The test** - `test/b2b-store-test.js`, 151 checks, a gate after `b2b
coverage`. The applied migrations pinned byte for byte, and nose_writer's
grants and every grant in schema nose identical before and after the b2b
migration; the four tables and their columns, no personal column, no time
of day, the CHECK on every jsonb column and the trigger on every table,
nothing joining the schemas; the three lists and two bodies; JS and the
database agreeing on 57 keys both ways; each of the 18 keys refused by JS in
a row, deep in one, in terps, four deep and in a refusal (nothing sent), and
by the database at depth with JS bypassed, by the trigger's words with no
row in the error, and by the CHECK alone with the trigger off; nose_b2b's
upserts and the days they keep; each refusal asserted by the object it
names; `probe-db.js`'s b2b audit passing here and failing on eight broken
grants; every fixture's reading stored as the parser gave it (56 accepted,
3 refused, `KAY-CAR-001` 4.124 with 15 values); the test catalog's links
whole but for `#`; keys; all five admin commands, the dry run changing no
row of any table; the store layer's no-op, bounds, TLS config, scrubbing and
field list; the switch, pinned and read from a real `build-info.json`; the
`nsk_` guard on throwaway sites; one place deletes from b2b, and no
consumer function loads the B2B files. Against 32 deliberately broken
copies - among them the trigger or the person CHECK dropped, a 19th key in
b2b alone, DELETE granted, stores and keys writable, nose_b2b given USAGE on
nose, an applied migration edited by one space, the JS person check off,
figures kept on a refusal, detail passed on, keys left unscrubbed, the flag
on for any value or any context, check-published without its rule, a dry
run that deletes, a key stored as itself, the probe without its rollback -
each fails it.

**Rehearsed** on a local PostgreSQL 16 set up as Supabase is: a
non-superuser `postgres` with CREATEROLE ran every migration, with anon,
authenticated and service_role present and a global default privilege
handing anon SELECT on new tables, which the migration revoked. `postgres`
became a member of nose_b2b (PostgreSQL 16 gives a role's creator ADMIN on
it); nose_b2b is a member of nothing. `ALTER ROLE nose_b2b PASSWORD` with a
SCRAM verifier, as that admin, stored SCRAM; a wrong password was refused
and the right one signed in. `probe-db.js` with all three addresses passed
every check except the eight a local database cannot meet (the two roles'
`<role>.<ref>` names, the pooler host and port of each, their shared ref,
Enforce SSL), and each `b2b-store.js` command ran from the command line.

**How it was verified, 2026-10-07, in the cloud workspace.** npm was blocked
there (registry.npmjs.org answered 403), so as in earlier sessions the gates
ran on stand-ins: pdfjs-dist 6.2.108 for unpdf, a throwaway PostgreSQL 16
cluster per test behind PGlite's API, a `pg` over the same wire protocol
without TLS, the committed html5-qrcode in place of `build.sh`'s download,
and Playwright 1.56's Chromium. ALL GATES GREEN on `fe8d8ff` before any
edit, 22 gates, and after it with the new gate - 23 gates, `KAY-CAR-001`
4.124 and `KAY-PRR-001` 0.944. `parse-coa.js`, `coa-dates.js` and
`extract-text.js` are untouched, so no reparse is due; no file in `js/`
changed, so `build.sh` renamed nothing. Nothing ran against the real
database or Netlify. The Codespace run on the real packages is the one that
counts.

**In the Codespace, in this order** (nothing here writes to schema b2b: the
migration makes empty tables and a role):

1. `git pull --ff-only`, then `bash scripts/gates.sh` - ALL GATES GREEN,
   `b2b store` among them.
2. `node scripts/probe-db.js` - before the migration it fails one check
   only: "the b2b migration is pushed".
3. `npx supabase db push --db-url "$NOSE_DB_ADMIN_URL" --dry-run` - lists
   `20261008020000_nose_b2b.sql` alone; then the same without `--dry-run`.
4. `node scripts/set-b2b-password.js` - save the `NOSE_B2B_DB_URL` it prints
   as a Codespaces secret, then restart the Codespace.
5. `node scripts/probe-db.js` - probe clean, nose_b2b's checks among them.
6. `git push` - deploys; nothing B2B runs, because nothing calls it yet.

### Catalog upload and the batch reader, 2026-10-08

Prompt 3. A dispensary's server sends its catalog; NOSE keeps every batch the
store lists and reads each batch's lab report once, in stock or not, so the
widget will have values for every batch the store listed in its window - a
shopper's past purchases, usually sold out, included. Nothing in it is live:
the function answers 404 until Prompt 8's switch, and the reader and
`--store` run from the Codespace, on PGlite or a local database, until the
privacy page describes them.

```
netlify/functions/b2b-catalog.js                             the upload: POST, Bearer nsk_..., the CSV
netlify/functions/lib/b2b-catalog-format.js                  the catalog format reader, moved out of b2b-coverage.js
netlify/functions/lib/b2b-store.js                           the snapshot write, the secret key, readings with their link
supabase/migrations/20261008150000_nose_b2b_read_source.sql  five columns on batch_reads
scripts/b2b-read-catalog.js                                  the reader: --store <slug> [--limit N] [--dry-run] [--reread]
scripts/b2b-coverage.js                                      --store <slug>: the same report, from the database
scripts/probe-db.js                                          one check: the new migration is pushed
docs/B2B-CATALOG-FORMAT.md                                   what the upload also refuses; how to send a catalog
test/b2b-catalog-test.js                                     PGlite, offline, a gate: "b2b-catalog clean"
test/b2b-store-test.js                                       batch_reads' column list, five longer
scripts/gates.sh                                             the gate, after b2b store
```

**The probe, before any edit**, on `5968b6f` - ALL GATES GREEN, 23 gates:

- `palate-sync.js` reads the whole body with `request.text()`, then answers
  413 when `raw.length > 262144`: 256 KB, counted in characters, after the
  body has been read. It keeps four declared fields per profile - `id`,
  `name`, `subtitle`, `terps` - and silently drops anything else; a bad
  profile is skipped, more than 500 refused. The upload caps BYTES before it
  reads, and refuses rather than drops: the format refuses an unknown column.
- `scripts/b2b-coverage.js` on the test catalog, its links answered from the
  fixture files as `b2b-coverage-test` answers them: exactly the record above
  - 12 of 19 (63%), 2 refused, 1 no link, 4 fetch failed, 2 out of stock, 3
  rows refused, flagged 2 forms, 3 batches, 2 shared links; Kaycha 9 of 9,
  ACS, Method and Modern Canna 1 of 1, TerpLife 0 of 1, 6 with no report read.

Netlify's current docs changed one number: a function's buffered request
body is capped at 6 MB, and at about 4.5 MB when Netlify base64-encodes it
([Configuration for functions](https://docs.netlify.com/build/functions/configuration/),
Default values, read 2026-10-08). So the upload takes 4 MB, not the coverage
script's 20 MB. The same page: a function is at `/.netlify/functions/<name>`
unless `config.path` says otherwise (Routing), and a `.js` entry file in a
package without `"type": "module"` is executed as CommonJS, with no named
imports from CommonJS in an ES module (Module format).

**Two decisions the owner made, 2026-10-08**, where "Done when" - the report
from the database matching the CSV run - asked for more than Prompt 2's
`batch_reads` could hold:

- **One additive migration**, `20261008150000_nose_b2b_read_source.sql`.
  Without it a fetch failure's words, the report's batch and lab ID (the batch
  flag) and the link a reading came from were nowhere: a store correcting a
  `coa_url` would have kept the old report's numbers under the new link. The
  owner approved four facts; this session added a fifth under the same
  decision, `new_layout`, because the report's novelty line needs it on an
  accepted read.
- **A `coa_url` that is not https is refused on upload**: Prompt 2's
  https-only rule stands. So the test catalog's row 24 is a refused row on
  upload and a fetch failure in the CSV run, and the two reports differ by
  that row (below).

**The migration** adds to `b2b.batch_reads`, nothing else changing - no
column, constraint, trigger or grant; `nose_b2b`'s table grants cover the new
columns, and no name or day is about a person:

- `read_url` - the link the reading came from, as the catalog listed it,
  without `#`: the batch's `coa_url` CHECK. A reading is the batch's CURRENT
  one only while `read_url` is still its `coa_url` and the link gave a report.
- `fetched` (default true) - false when the link gave no report: refused
  before any request, unreachable, timed out, not a PDF. `reject_reasons`
  then holds the fetcher's own sentence, and `nothing_read_unless_fetched`
  keeps the rest empty: no lab, form, reader, day, identifier, note, figure.
- `report_batch`, `report_lab_id` - the parser's `batch` and `labId`, trimmed,
  a control character a space, cut at 200: identifiers, never figures, kept on
  refusals too.
- `new_layout` (default false) - the parser's `novelty` was not empty. The
  notes themselves never leave `lib/b2b-store.js`; they are for the review
  queue.

`lib/b2b-store.js`'s `READ_FIELDS` gains `batch`, `labId`, `novelty` (sent
as a boolean), and `upsertRead(..., { readUrl })` keeps the link. New:

- `batchesFromCatalog(rows)` - the format reader's rows as `BATCH_FIELDS`,
  typed (`in_stock` a boolean, a percent a number, `list_position` the row's
  number in the file, the header row 1), or refused by row and reason for
  what the database cannot hold: a `coa_url` that is not https, not a link or
  carries a password (`coaLink()`'s own words), a `product_url` with a space,
  `batch_id` or `product_id` over 200 characters, `name` or `brand` over 300,
  a link over 2048, a control character in any of them. It also returns
  every `batch_id` named on a row, refused rows included.
- `applyCatalog(storeId, batches, listed)` - ONE statement, so an upload
  lands whole or not at all: the listed batches upserted as `upsertBatches`
  does, and every other batch of the store still in stock marked out of
  stock and KEPT, with its `list_position` and `last_listed_on` - the last
  day a file listed it, which the window counts from. A batch named on a
  refused row is never marked: a typo does not take a batch out of stock.
  At least one batch, or nothing is sent.
- `storeForSecretKey(key)` - a working `secret` key only. The database is
  asked for the row of the key's SHA-256, and the hash that comes back is
  compared with the key's own by `crypto.timingSafeEqual`: the comparison
  that decides takes the same time whatever the bytes, and a lookup by hash
  can reveal nothing about the key, only about the hash of a key the caller
  already holds.
- `upsertUnfetched(storeId, batchId, readUrl, reason)` - a link that gave no
  report. It never replaces a reading the same link DID give: a `--reread` on
  a day the lab's portal is down keeps the reading.
- `storeBySlug(slug)`, `listedInWindow(storeId)` - what the reader and
  `--store` read back. `IN_WINDOW_SQL` is the window as one condition -
  `last_listed_on` no more than `window_months` ago, in UTC days - for
  Prompt 4's feed to read the same way.

**The upload** - `POST /.netlify/functions/b2b-catalog`, written as
`palate-sync.js` is: one default export taking a Request, nothing else
exported, the three `lib/` files imported whole. In order:

1. `b2bEnabled()`: off, a plain `404 Not Found`, before the method, the key or
   the body is looked at - so a dev run or a deploy preview never reaches the
   production database.
2. Not POST: 405, `Allow: POST`.
3. `Authorization: Bearer <key>` (the scheme in any case, one key): anything
   but a well-formed secret key is a 401 without a statement.
4. `Content-Length` over 4 MB: 413, the body unread.
5. No `NOSE_B2B_DB_URL`: 503. Then the key's store; none - a public, revoked,
   mistyped or never-issued key - is the same 401, `WWW-Authenticate: Bearer`,
   the body unread.
6. The body, counted as it arrives: over 4 MB, 413, cancelled.
7. `lib/b2b-catalog-format.js`'s `readCatalog()`: a refused file is 422 with
   the reader's own sentence - a personal-looking column first, an unknown
   one by name.
8. `batchesFromCatalog()`; no row to keep is 422 and nothing changes (an
   empty snapshot would mark every batch out of stock).
9. `applyCatalog()`, given 8 seconds. 200 with `received` (the rows read,
   blank rows aside), `upserted`, `markedOutOfStock`, and `refused`: each
   refused row by its number, with every reason - the coverage script's own
   words for a format refusal. Nothing else is in the reply.

It reads nothing about the caller - no address, user agent, cookie,
`context`, geography or time; the database keeps UTC days. It logs nothing
on success, and one fixed line on a failure: `no database configured -
nothing saved`, `key not checked - the database did not answer; nothing
saved`, `upload not confirmed - the database did not answer`. A write that
timed out may still have committed, so the 503 says to send the whole file
again: a whole snapshot sent twice changes nothing more. Catalog reports are
not fetched here.

**The format reader moved.** `parseCsv`, `checkHeader`, `readRows`,
`readCatalog`, `looksPersonal`, the columns, lists and personal words moved
from `scripts/b2b-coverage.js` to `lib/b2b-catalog-format.js` so the function
could read the format without loading a Codespace script. Of the 161 lines
the script lost, 158 are in the lib byte for byte and in order; the other
three are the `require` of `PERSONAL_KEYS` (now the lib's), the refused-row
outcome's name (now the lib's `ROW_REFUSED`, the same words) and a banner.
The script requires the reader back and exports the same names, and
`b2b-coverage-test` passed unchanged after the move.

**The reader** - `node scripts/b2b-read-catalog.js --store <slug> [--limit
N] [--dry-run] [--reread]`, as `nose_b2b` (`NOSE_B2B_DB_URL`; any other
role is refused before anything is read).

- Due: every batch listed within the store's window that has a `coa_url` and
  no current reading - out-of-stock batches too - in stock first, then the
  store's order; with `--reread`, every one with a link; `--limit N`, the
  first N due.
- Each is read the coverage report's way: `validateUrl`, then
  `scripts/b2b-coverage.js`'s `readFetched` (`fetchPdf`, `extract-text.js`,
  `parseCoa`, the scanner's steps between), one link at a time with 1000 ms
  before every request but the first; a link `validateUrl` refuses is never
  requested.
- Written: an accepted reading's terpenes as the parser read them and the
  lab's printed total; a refusal's reasons and no figure (the parser's, or the
  scanner's sentence - "could not be read reliably" for a refusal that came
  with none, as the report shows it); a PDF the scanner could not read, its
  sentence and nothing the parser would have said (no form, so the report
  flags it for nothing, as from the file); a link that gave no report, the
  fetcher's words with `fetched = false`, tried again on the next run.
- Each batch from its own link into its own row: two batches on one link are
  each fetched, a batch with no link is never read, no reading crosses to
  another store, and the name is never read.
- A run that writes refuses while `parse-coa.js`, `coa-dates.js` or
  `extract-text.js` has uncommitted changes (`scripts/lib/rerun.js`'s
  `stampsOrRefusal`): `batch_reads` keeps no parser version, so this is what
  ties a stored reading to committed code. `--dry-run` fetches, reads and
  writes nothing.
- It never loads `coa.js`, `lib/archive.js` or `lib/pdf-store.js`, and writes
  nothing to schema `nose` or the `coa-pdf` store. It prints a line per batch
  (its row and outcome, a failed link's host) and a summary, never a link.

**`--store <slug>`** - `scripts/b2b-coverage.js` reads `listedInWindow()` and
makes of each batch the row the report would make of it from the file: its
row is `list_position`, its outcome its current reading's, its parser output
what the reading keeps. The report's own code renders it - the same counts,
flags, figures through `normalize()` and notes - with four lines about the
file turned into lines about the store: where it was read from, the batches
in its window, out-of-stock batches kept (and how many have a panel NOSE can
read), and that a row refused on upload is never kept. A batch whose reading
is of another link, or that has none, is "not read yet", a column shown only
when one is. `--limit` and a file are refused with it. In CSV mode not one
line of the report changed.

**The test catalog, both ways.** Uploaded to PGlite: 24 rows received, 20
upserted, 4 refused - rows 19, 20 and 26 in the coverage report's own words,
and row 24, `coa_url is not an https link`. Read by the reader: 19 readings,
14 accepted (the 12 in stock and both sold-out batches), 2 refused, 3 links
that gave no report. Then `--store test-shop` against the CSV run: every one
of the 20 batches the upload kept reads identically in `report.csv` -
outcome, reason, lab, form, report batch and lab ID, total, top three and
their shares, notes, flags, host - and the only table lines that differ in
`report.md` are the ones row 24 counted in:

| | CSV run | from PGlite |
|---|---|---|
| terpene panel NOSE can read | 12 of 19 (63%) | 12 of 18 (67%) |
| report refused | 2 of 19 (11%) | 2 of 18 (11%) |
| no lab-report link | 1 of 19 (5%) | 1 of 18 (6%) |
| link could not be fetched | 4 of 19 (21%) | 3 of 18 (17%) |
| vape | 6: 3 / 1 / 0 / 2 | 5: 3 / 1 / 0 / 1 |
| (no report read) | 6: 0 / 1 / 1 / 4 | 5: 0 / 1 / 1 / 3 |

and row 24's line among the batches NOSE can't read. Every lab's row, every
flag, every refusal and every figure is the same.

**The test** - `test/b2b-catalog-test.js`, 81 checks, a gate after `b2b
store`. The function is loaded as the ES module its syntax makes it -
through a one-file `module.register` hook, on Node 20 and 22 - and driven
through its default export, with a stand-in `pg` whose every statement runs
on PGlite as `nose_b2b`. Stores and keys are made by `scripts/b2b-store.js`'s own
commands; links are answered from fixture files. It checks the switch (off:
404, no statement, nothing written or logged); every wrong key the same 401,
the body unread; the two size caps; the snapshot (a batch dropped from the
file kept and marked out of stock, the same file twice changing nothing, a
typo's batch untouched, the file again restoring it, another store's upload
touching only that store); the refused files, the reply's keys, the three
log lines and silence on success; the database refusing a failed link that
carries a lab, form, identifier or note; the reader's dry run, real run,
second run, `--reread --limit 3` with a portal down, a corrected link read
again, another store, the role and the command line; `--store` against the
CSV run as above; schema `nose`'s tables, the archive's stand-ins, `coa.js`,
`pg` and `@netlify/blobs` untouched. The migration is pinned to its first
push. Against 24 deliberately broken copies - the switch moved, a public key
accepted (in JS, or in SQL), no Content-Length check, no counted cap, the
body read before the key, a line on success, detail in a failure line, more
than counts in the reply, absent batches left in stock, a refused row not
protecting its batch, `===` for the hash, a fetch failure replacing a
reading, another link's reading current, an http link kept, `list_position`
not the row, a dry run that writes, in-stock batches only, no pause, a
reading without its link, `--store` without the report batch, in the
database's order or showing an old link's reading, and the database letting
a failed link carry a lab - each fails it.

`b2b-store-test` changed in one check, `batch_reads`' column list, five
names longer; its other 150 checks pass unchanged with the new migration
applied. `probe-db.js`'s admin audit gains "the reading-source migration is
pushed", which `b2b-store-test` runs and every broken-grant case leaves
standing.

**How it was verified, 2026-10-08, in the cloud workspace.** npm was blocked
there (registry.npmjs.org answered 403), so as before the gates ran on
stand-ins: pdfjs-dist 6.2.108 for unpdf (56/3, 56/0, clean, 4.124/0.944), a
throwaway PostgreSQL 16 cluster per PGlite instance behind PGlite's API, the
committed html5-qrcode in place of `build.sh`'s download, and Playwright
1.56.0's Chromium. ALL GATES GREEN on `5968b6f` before any edit, 23 gates,
and after it with the new gate - 24 gates, `KAY-CAR-001` 4.124 and
`KAY-PRR-001` 0.944. The three B2B gates passed on Node 20.20 as well.
`parse-coa.js`, `coa-dates.js` and `extract-text.js` are untouched, so no
reparse is due; no file in `js/` changed, so `build.sh` renamed nothing.
Nothing ran against a real database, Netlify or a lab's server. The Codespace
run on the real packages is the one that counts.

**In the Codespace, in this order** (the migration adds columns to empty
tables; nothing here writes a row to production):

1. `git pull --ff-only`, then `bash scripts/gates.sh` - ALL GATES GREEN,
   `b2b catalog` among them.
2. `node scripts/probe-db.js` - before the push it fails one check only: "the
   reading-source migration is pushed".
3. `npx supabase db push --db-url "$NOSE_DB_ADMIN_URL" --dry-run` - lists
   `20261008150000_nose_b2b_read_source.sql` alone; then the same without
   `--dry-run`.
4. `node scripts/probe-db.js` - probe clean.
5. `git push` - deploys `b2b-catalog`, which answers 404: `B2B_ENABLED` is not
   set. Netlify → Logs → Functions lists it.

### Feed and votes, 2026-10-08

Prompt 4. The widget's only two calls to NOSE: the feed, the same for every
visitor of a store, and the vote, which carries nothing about who voted.
Nothing in it is live: both functions answer 404 until Prompt 8's switch, and
the vote store holds nothing.

```
netlify/functions/b2b-feed.js       GET ?key=npk_...: every batch in the store's window, for the store's own origins
netlify/functions/b2b-vote.js       POST, text/plain JSON: six fields, one blob per vote
netlify/functions/lib/b2b-votes.js  the "b2b-votes" Blobs store: the key, the daily cap, record, delete
netlify/functions/lib/b2b-store.js  feedFor, voteTarget; the current-reading rule, now one fragment both read
scripts/b2b-store.js                delete-store deletes the store's votes too
test/b2b-endpoints-test.js          PGlite, offline, a gate: "b2b-endpoints clean"
test/b2b-store-test.js              its admin helper hands delete-store an empty vote store
scripts/gates.sh                    the gate, after b2b catalog
```

**The probe, before any edit**, on `47b7509` - ALL GATES GREEN, 24 gates:

- `match-feedback.js` takes `Strong`, `Good`, `Partial` and `Weak` (line
  26), so the app's `Moderate` and `Low` get 400 `bad-band` (§13, "Still
  open"). Its key is `votes/<band slug>/<vote>/<YYYY-MM-DD>/<HHMMSSmmm>-<rand>`
  - a time of day in the key - and its value keeps the server's `ts`, the
  client's `clientTs` and the palate list; an extra field is ignored, not
  refused; a failed write logs its band, vote and the error's message. B2B
  repeats none of it. `netlify/lib/beacon.js`'s helpers are used as they are -
  `readJsonBody`, `isInt`, `noContent`, `rejected` - and not `keySuffix`,
  `safeClientTs` or `contextHash`, which carry a time or group votes. Neither
  file changed.
- Netlify ([Caching overview](https://docs.netlify.com/build/caching/caching-overview),
  updated 2026-08-11, read 2026-10-08): a function's response is not cached
  unless it says so; for a serverless function the query string is part of
  the cache key, and so is every header a standard `Vary` names; each deploy
  clears the cache of its context. `_headers` does not apply to a function's
  response ([Custom headers](https://docs.netlify.com/manage/routing/headers/),
  Limitations). Blobs ([Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs),
  updated 2026-09-30): an added blob is available everywhere at once, updates
  and deletions within 60 seconds; strong consistency is a store option;
  `list()` gives keys and ETags only, following its pages of up to 1,000
  itself; a key may be 600 bytes; a site-wide store is shared by every deploy
  context, deploy previews included.
- Browsers: a cross-origin GET with no custom headers is a simple request -
  no preflight, `Origin` always sent, no credentials unless asked - and an
  echoed origin goes with `Vary: Origin` ([MDN, CORS](https://developer.mozilla.org/en-us/docs/web/http/access_control_cors),
  modified 2026-09-04). `sendBeacon` starts in no-cors mode and stays in it
  for a CORS-safelisted Content-Type such as `text/plain`, with credentials
  `include` ([W3C Beacon](https://www.w3.org/TR/beacon), §3.2, CRD
  2022-08-03). A no-cors POST carries `Origin: null` from a page whose
  referrer policy is `no-referrer`, or `same-origin` going cross-origin
  ([MDN, Referrer-Policy](https://developer.mozilla.org/docs/Web/HTTP/Headers/Referrer-Policy),
  "Effect on the Origin header"). An explicit `SameSite=Lax` cookie is not
  sent on a cross-site `fetch()` or POST ([MDN, Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)),
  and NOSE's one cookie, `nose_session`, is `SameSite=Lax`
  (`netlify/lib/auth.js`).
- Watched in Chromium 141 (Playwright 1.56), two local servers on two sites,
  a scratch probe not committed: the feed's GET carried the page's `Origin`
  and no cookie, was read with that origin echoed and refused (`TypeError`)
  with another; a string beacon was a POST of `text/plain;charset=UTF-8` with
  the page's `Origin`, carrying the test's `SameSite=None` cookie and not its
  `Lax` one; a JSON-typed beacon sent an `OPTIONS` preflight and, refused,
  never posted. From a page served with `Referrer-Policy: no-referrer`,
  Chromium 141 still sent the page's origin on the beacon, where MDN says the
  standard makes it `null`; a `fetch()` in cors mode with `keepalive` sent the
  origin either way, and no cookie.

**Decided here, where the prompt was silent:**

- **The feed adds the store's `window_months`** beside its guardrail: Prompt
  5's `palateFrom` skips a purchase "outside the window", which needs it.
- **`usable` is `true`, `false` or `null`.** `null` is "no reading NOSE
  stands by" - not read yet, a link that gave no report, a link since
  corrected - so Prompt 5 can tell "no read" from "refused". `lab`,
  `harvest_on` and `report_on` come from that reading whatever its verdict;
  `terps` and `total_terpenes` only when it was accepted. Every field is on
  every batch, `null` when not given.
- **The voted product must be one the store listed within its window**: a
  batch the feed holds.
- **`palateSize` is 1 to 1000**: a palate made of other purchases holds at
  least one.
- **The vote's day is the database's UTC day** (`voteTarget`): B2B keeps one
  clock, the database's.
- **The cap is 100 votes per store per UTC day** unless `B2B_VOTE_DAILY_CAP`
  is a whole number up to 100000; `0` keeps none; anything else, 100. A pilot
  store's votes are a small share of its orders, so 100 bounds a script, not
  a store's shoppers. It is counted by listing that day's eight prefixes, so
  votes arriving together can pass it by their number.
- **The band is not checked against the score**, as `match-feedback.js` does
  not: a score within 1e-11 below an edge shows as the edge while
  `matchBand()` gives the band below (§13, "The shown score"), and the
  function holds none of the maths.

**The feed** - `GET /.netlify/functions/b2b-feed?key=npk_...`, written as
`b2b-catalog.js` is: one default export taking a Request.

1. `b2bEnabled()`: off, a plain `404 Not Found`, before the method or query.
2. Not GET: 405, `Allow: GET` - an `OPTIONS` preflight too, so a widget that
   adds a header fails closed. No `Access-Control-Allow-Credentials` is ever
   sent, so one that asks for credentials fails closed as well.
3. Exactly one query parameter, `key`, a well-formed public key; else 400,
   nothing looked up. A secret key in the address is refused there.
4. No `NOSE_B2B_DB_URL`: 503 and one fixed line.
5. `feedFor(key, origin)`, one connection, two statements. `FEED_STORE_SQL`
   finds the store of a working public key - none (unknown, revoked) is 403 -
   with its origins and settings. The request's `Origin` must be one of its
   `allowed_origins`, exactly: else 403, no `Access-Control-Allow-Origin`, no
   data, and no batch read. Then `FEED_SQL`: every batch the store listed
   within its window (`IN_WINDOW_SQL`), in stock or not, in `list_position`
   order, ties by `batch_id` in byte order (`collate "C"`, the same on any
   collation). Of a batch's reading, only the current one
   (`CURRENT_READ_SQL`): its `case` expressions select nothing else, so a
   corrected link's figures never leave the database.
6. 200: `{"store":{window_months, guardrail_thc_points, guardrail_cbd_points},
   "batches":[...]}`, each batch `batch_id, product_id, list_position,
   category, route, name, brand, product_url, in_stock, thc_percent,
   cbd_percent, lab, harvest_on, report_on, usable, total_terpenes, terps`.
   No `coa_url` (a catalog link can carry a credential in its query, "Still
   open"), no sales, no quantities. Headers: `Access-Control-Allow-Origin` the
   request's origin, `Vary: Origin`, `Cache-Control: public, max-age=60`,
   `Content-Type: application/json; charset=utf-8`, `X-Content-Type-Options:
   nosniff`, and nothing else. Every other reply is `no-store`.

`CURRENT_READ_SQL` is the condition `LISTED_SQL` held inline. `LISTED_SQL`
reads it from there now and is byte-identical (SHA-256 `0f012867…` before and
after), so the rule exists once.

**The vote** - `POST /.netlify/functions/b2b-vote`, `text/plain` JSON.

1. The switch, then POST, then a `text/plain` Content-Type, parameters and
   letter case aside (anything else 415). A body over 2048 characters is
   refused, by Content-Length before reading and by `readJsonBody`'s own
   count, and `readJsonBody`'s reasons refuse an empty, broken or non-object
   body.
2. Exactly `key, candidate, score, band, palateSize, vote`: an extra field is
   400 `unknown-field`, a missing one `missing-field`; then `bad-key`,
   `bad-candidate` (as `b2b.batches` holds a product_id), `bad-score` (a whole
   number 0 to 100), `bad-band` (`Strong`, `Good`, `Moderate`, `Low` -
   `lib/b2b-votes.js`'s `BANDS`, which the test reads back from `matchBand()`
   itself), `bad-palate-size`, `bad-vote` (`up`, `down`). All before the
   database.
3. `voteTarget(key, origin, candidate)`, one statement: the store of a
   working public key (else 403), the request's `Origin` among its origins
   (else 403, nothing kept), the product among its batches in the window
   (else 400 `bad-candidate`), and today.
4. `lib/b2b-votes.js`'s `record()`: the store's count for the day - eight
   `list()` calls, a band and a vote each - against the cap, then one
   `setJSON` with `onlyIfNew`, counted only with an ETag, as `pdf-store.put()`
   counts one. Within 4 seconds, or 503.
5. 204 with the origin echoed and `Vary: Origin`, kept or dropped at the cap
   alike. 503 and one fixed line when nothing is configured, or the database
   or the vote store does not answer.

**`lib/b2b-votes.js`** - the store `b2b-votes`, site-wide, strong consistency.
Inside the function Netlify hands a Request function its Blobs context; from
the Codespace it takes `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN`. One blob
per vote, at `votes/<store slug>/<band>/<vote>/<UTC day>/<32 hex>`, the suffix
16 random bytes - no time, no counter - holding `{"candidate", "score",
"palateSize"}` and no metadata. A pilot's question, the share of up votes in
each band, is a listing of keys. Only `delete-store` deletes a vote.

**Logs.** Nothing on success. One fixed line on failure, never naming a
store: `b2b-feed: no database configured - no feed served`, `b2b-feed: the
database did not answer - no feed served`, `b2b-vote: no database configured -
vote not kept`, `b2b-vote: the database did not answer - vote not kept`,
`b2b-vote: the vote store did not answer - vote not kept`, and for each vote
over the cap `b2b-vote: a store reached its daily cap - vote dropped, reply
unaffected`. Netlify timestamps each line, so one naming the store would say
which dispensary the address in the matching request log shops at.

**`delete-store` deletes the votes too**, as "Still open" asked, so that
Prompt 8's sentence on deleting a dispensary's data is true. It needs
`NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN`, and without them refuses, changing
nothing. The dry run counts the store's votes beside its rows. `--yes` deletes
the database half first, in one transaction - so the key has stopped working
before the votes are listed - then every blob under `votes/<slug>/` (the slash
keeps `rose` from reaching `rose-city`). If Blobs stops answering part way, it
says how many went and to run the same command again; with no store row left,
that run finds the votes under the slug and deletes them. `b2b-store-test`'s
helper now hands it an empty vote store; its other checks are unchanged.

**The test** - `test/b2b-endpoints-test.js`, 91 checks, a gate after `b2b
catalog`. PGlite with every migration; stores and keys made by
`scripts/b2b-store.js`'s own commands; batches and readings written as
`nose_b2b` from the parser's own output on fixture reports - accepted, accepted
and out of stock, refused, a link that gave no report, a corrected link whose
old reading is accepted, no link, a batch last listed 400 days ago, another
store's. Both functions are loaded as the ES modules their syntax makes them
and driven through their default exports, `pg` stood in for by PGlite as
`nose_b2b` and `@netlify/blobs` by an in-memory store answering as 10.x does.
It checks the switch; the feed's request rules, nine refused origins, two
visitors byte-identical headers included, the fields and their order, each
kind of reading, no link, sale or person anywhere, a revoked and a rotated
key, the failure lines; the vote's 415s and body refusals, 32 extra fields and
every missing one, each bad value, products outside the window or another
store's, the origin rule, all four bands up and down, the key's shape and day,
the value's three fields, twenty identical votes listing in no arrival order,
the cap with its identical reply, `0`, per store, the failure lines;
`delete-store` with and without the vote store, dry run, `--yes`, a Blobs
failure part way and the second run, the command line's refusal; and that
schema `nose`, the archive, `coa.js`, `match-feedback.js` and the consumer's
store are never touched.

- **Against broken copies**: 44 deliberate faults, one at a time - `*` for the
  origin, no `Vary`, no origin check, origins compared ignoring case, a revoked
  key working, a corrected link's total or terpenes shown, a link that gave no
  report shown as refused, the window ignored, in stock first, the lab-report
  link included, a field that moves per request, a day's caching, the switch
  after the method, a line on success, detail in a failure line, the
  consumer's band names, extra fields ignored, a time of day in the key or the
  value, a counter for the suffix, the cap ignored or answered differently, a
  write without an ETag counted, any product or one outside the window taken,
  any Content-Type, a score not checked whole, a palate size of 0, a padded
  product id, a deploy store, eventual consistency, `*` on the vote, the store
  named in the cap line, votes left behind by `delete-store`, no vote store
  needed, the prefix without its slash, no second run, the command line
  without its check - each fails it. A scratch harness, not committed.

**How it was verified, 2026-10-08, in the cloud workspace.** npm was blocked
there (registry.npmjs.org answered 403), so as before the gates ran on
stand-ins: pdfjs-dist 6.2.108 for unpdf (56/3, 56/0, clean, 4.124/0.944), a
throwaway PostgreSQL 16 cluster per PGlite instance behind PGlite's API, the
committed html5-qrcode in place of `build.sh`'s download, and Playwright
1.56.0's Chromium 141. ALL GATES GREEN on `47b7509` before any edit, 24 gates,
and after it with the new gate - 25 gates, `KAY-CAR-001` 4.124 and
`KAY-PRR-001` 0.944. The three B2B PGlite gates, the new one among them, passed on Node 20.20 as well.
esbuild 0.28.2 bundled both functions as CommonJS with the packages left out:
each bundle's default export is the handler and answers the switch's 404, and
neither takes in `coa.js` or the archive. `parse-coa.js`, `coa-dates.js` and
`extract-text.js` are untouched, so no reparse is due; no file in `js/`
changed, so `build.sh` renamed nothing; no migration was added. Nothing ran
against a real database, Netlify or a lab's server. The Codespace run on the
real packages is the one that counts.

**In the Codespace, in this order** (nothing here writes anywhere: both
functions answer 404 until Prompt 8):

1. `git pull --ff-only`, then `bash scripts/gates.sh` - ALL GATES GREEN, `b2b
   endpoints` among them.
2. `git push` - deploys `b2b-feed` and `b2b-vote`. Netlify → Logs → Functions
   lists both.
3. `curl -i https://nose-app.com/.netlify/functions/b2b-feed` and `curl -i -X
   POST https://nose-app.com/.netlify/functions/b2b-vote` each answer `404`
   with `Not Found`: the switch is off.

### Still open

- `scripts/download-twice.js` keeps its own looser fetch loop. Moving it onto
  `lib/fetch-report.js` would change what it reports (redirects re-checked,
  8 s for a link it waits 30 s for today), so it waits for its own prompt.
- The guard checks host names, not the addresses they resolve to, as it
  always has in coa.js: a public name pointing at a private address passes
  `isBlockedHost`. In the Codespace the script runs by hand, on one
  dispensary's file.
- A lab NOSE does not know reads as refused or "(lab not recognised)". The
  by-lab table is the list of labs a fixture would help most (§10). A
  coverage figure is today's parser's, and moves when the parser does.
- A batch sold as several products is listed once (above). Prompt 2 kept the
  key (store_id, batch_id) as asked. If a pilot shows dispensaries need one
  batch under several product IDs, the key changes in a new migration -
  cheapest while the tables hold no data, before Prompt 8 switches anything
  on.
- **Not pushed until the walk-through above runs**: until `db push`,
  `probe-db.js` fails "the b2b migration is pushed".
- No command changes a store's window or guardrail after `create`, or removes
  an origin. A later prompt adds one if the pilot needs it.
- `rotate-keys --public` breaks the store's page until the page carries the
  new key: there is no overlap, because the partial index allows one working
  key of each kind. A change of public key without a gap needs its own
  prompt.
- `batch_reads` keeps no parser version, so a stored reading does not say
  which parser read it; `--reread` reads everything again. The reading-source
  migration (2026-10-08) added the link a reading came from, not the parser;
  instead the reader refuses to write while the parser's files have
  uncommitted changes. A column for the version is a new migration.
- `coa_url` keeps its query, so a presigned link in a catalog (`X-Amz-*`,
  `Signature`, `Expires`) would be kept with its temporary credential to the
  store's own storage. Prompt 3 neither refuses nor flags one: it waits for
  its own prompt.
- **The upload's module form is palate-sync.js's, unproven for this file on
  Netlify.** Netlify's docs say a `.js` entry file in a package without
  `"type": "module"` runs as CommonJS; this one, like `palate-sync.js`, is ES
  module syntax that the esbuild bundler compiles. After the first deploy:
  Netlify → Logs → Functions lists `b2b-catalog`, and `curl -i -X POST
  https://nose-app.com/.netlify/functions/b2b-catalog` answers `404` with
  `Not Found` - the switch is off.
- **A row refused on upload is kept nowhere**: the reply is its only record,
  and `--store` says so rather than listing it.
- **Batch IDs are matched exactly from one upload to the next**, while a
  repeat within one file is found ignoring letter case. A `batch_id` whose
  case changes between two exports becomes a new batch, and the old one is
  marked out of stock (kept, with its reading).
- **`list_position` is the row in the latest file**: removing a line moves
  every row after it up one. Only the order is used (Prompt 5's ties).
- **A link that never answers is fetched on every run**, one second after the
  last request, until the store changes it; `--limit` bounds a run.
- The upload takes 4 MB, under Netlify's buffered limit; the coverage script
  reads files of up to 20 MB from disk. A catalog between the two can be
  reported on but not uploaded.
- **The reading-source migration is not pushed until its walk-through
  runs** (above): until then `probe-db.js` fails "the reading-source
  migration is pushed", and the upload and the reader would fail on the
  missing columns against production - where nothing runs before Prompt 8.
- The secret key reaches the dispensary however the owner hands it over:
  NOSE prints it once and has no channel of its own for it.
- `NOSE_B2B_DB_URL` is a Codespaces secret only. It goes into Netlify's
  Production context with Prompt 8, not before.
- **A vote sent by `sendBeacon` from a page served with `Referrer-Policy:
  no-referrer`** (or `same-origin`) carries `Origin: null` where a browser
  follows the standard (MDN, above), and the origin rule refuses it; Chromium
  141 sent the page's origin anyway (the probe, "Feed and votes"). Prompt 6 or
  7 decides: the widget can send the vote with `fetch(url, { method: 'POST',
  mode: 'cors', keepalive: true, body })` - a string body, so still a simple
  request with no preflight, the page's origin always sent, no cookies - which
  `b2b-vote` already answers with that origin echoed; or the integration
  guide tells the store not to serve the page with those policies.
- **A beacon carries this site's cookies** (credentials `include`). NOSE's one
  cookie, `nose_session`, is `SameSite=Lax`, so it never rides along from a
  store's page, and the vote reads no cookie. A NOSE cookie ever marked
  `SameSite=None` would ride along with every vote; the `fetch` route above
  sends none.
- **The feed is cached up to 60 seconds**, by browsers and by Netlify, apart
  for each origin: a catalog upload, a revoked key or a deleted store shows
  within the minute, a deploy at once. Nothing purges it by hand.
- **The cap is counted, not locked** - eight listings a vote - so votes
  arriving together can pass it by their number. Which store reached it is not
  logged ("Logs", above). `B2B_VOTE_DAILY_CAP`, like every variable, changes
  only with a new deploy.
- **Netlify's request logs record the address and time of every feed and vote
  request**, and the feed's address names the store's public key. NOSE copies
  nothing from them. A vote's key ends in random bytes, so the store's listing
  gives no order to set against those logs; Blobs may keep its own write
  times, which nothing of ours reads (§13, "The PDF half"). Prompt 8's page
  says all of it.
- **The live vote store is unproven.** Strong consistency (which
  `match-feedback.js` uses the same way) and the conditional write have
  answered only the stand-in here; Prompt 8's first test vote is their proof,
  and `b2b-vote: the vote store did not answer` in the function's log is how a
  fault shows.
- **Both functions take `b2b-catalog.js`'s module form**, still unproven on
  Netlify (above): esbuild bundled them here, and Netlify → Logs → Functions
  listing `b2b-feed` and `b2b-vote` after the push is the first live proof.
- **A batch in the feed carries its catalog `name` and `brand`**, for the
  widget to show; Prompt 5's ranking reads neither. A product voted on is
  named by its `product_id` alone.

### Later

Wanted work, not yet built.

- Campaign palates: an email or text to opted-in shoppers when a new batch
  matches their palate. Wanted as an option after the pilot. Preferred build:
  the dispensary's server runs the ranking engine on purchase history it
  already holds, so NOSE never receives it.

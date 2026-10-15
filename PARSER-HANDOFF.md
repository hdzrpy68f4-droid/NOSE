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
- **Age never changes a jar's shape or its score.** The card shows when the
  jar was harvested, or else when its report is dated, and how long ago (§13,
  "Harvest date and age on the card"); nothing in `js/match-math.*.js` reads
  either day, and `match-test.js` checks that a profile carrying them
  normalises as one without them. A future decay curve may lower intensity -
  total terpenes - only, never the share-of-total profile. Why: a 2020
  storage study of dried flower kept up to a year at four temperatures saw
  terpenoids fall under every condition, with the lighter monoterpenes and
  the heavier sesquiterpenes on similar overall trends despite their
  different volatility - not identical at every temperature, though: the
  freezer was hardest on α-pinene (Milay et al., Frontiers in Plant Science,
  https://www.frontiersin.org/articles/10.3389/fpls.2020.583605/full, read
  2026-10-14). Hazekamp 2016 saw gamma irradiation lower some terpenes while
  the profile stayed qualitatively the same (Frontiers in Pharmacology, doi
  10.3389/fphar.2016.00108, read 2026-10-14). Loss spread broadly evenly
  across a profile makes a jar quieter, not a different smell - what both
  saw, one through storage and one through irradiation. How much quieter one
  jar has become, no report can say.

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

**Or all at once:** `bash scripts/gates.sh` (or `npm run gates`, the same
file) runs, first, `node-version-test` - the Node running the gates is
`.nvmrc`'s, 24 since 2026-10-15 (§13, "Node 24 everywhere") - then these, the Kaycha anchors,
`novelty-test`, `coa-dates-test`, `store-test`, `probe-test`, `archive-wiring-test`,
`archive-scripts-test`, `rerun-test`, `review-queue-test`, `match-test`,
`match-feedback-test`, `analysis-test`, `duplicates-test`, `remove-copies-test`, `remove-document-test`, `b2b-coverage-test`, `b2b-store-test`, `b2b-catalog-test`, `b2b-endpoints-test`, `b2b-rank-test`, `b2b-strings-test`, `b2b-pilot-test`, `check-trust-test` and, after the build, `b2b-release-test`, `input-paths-test`, `b2b-widget-test` and `b2b-compliance-kit-test`.
It prints the line each gate produced and ends with `ALL GATES GREEN`. It passes
a gate only on its exact expected line, so when a session legitimately changes
a count, update the script in the same commit.

**The input-paths, b2b-widget and b2b kit gates need Playwright and its Chromium**, which are not
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
| `node-version-test.js` | the first gate (since 2026-10-15): the running Node's major version is `.nvmrc`'s, and `package.json`'s `engines.node` and the lockfile's root entry are `"<that major>.x"`; prints e.g. `node v24.22.0, .nvmrc 24, engines 24.x`, else each mismatch and how to switch (§13, "Node 24 everywhere"); offline |
| `coa-gate-test.js <dir> <parser>` | accept/reject verdict per fixture |
| `extraction-parity.js test/fixtures/pdf` | unpdf output vs the baseline, including readBy and productClass |
| `extract-dump.js` | regenerate `test/fixtures/extracted/` from the PDFs |
| `dump-ordering.js <pdf>` | read-only, not a gate: how unpdf and pdftotext order a report's terpene table, and what the parser makes of it |
| `fixture-lint.js` | corpus hygiene: control bytes, shell-hostile names, baseline arithmetic |
| `mutation-test.js <dir> <parser>` | corrupt fixtures; require identical-or-reject |
| `resolver-test.js` | viewer-page resolution, offline, against saved portal pages |
| `novelty-test.js` | the five `novelty` notes (§7) and the furniture the `unmapped` diagnostic skips; FAILS if an accepted fixture carries any novelty, and lists the refused ones that do, as information |
| `match-test.js` | the matching maths has one home, `js/match-math.*.js`: the app takes it from there, nothing else holds a copy, and it returns every score in `test/fixtures/match-golden.json` to the last bit; every score is shown and sent through `shownScore()`, floored (§13, "The shown score"), and the worked examples on `learn/intensity-versus-character/` are the numbers the app shows; since 2026-10-14, a profile carrying `harvestOn`, `reportOn` and `totalTerpenes` normalises exactly as without them (§4) |
| `match-feedback-test.js` | the app's votes (§13, "Every vote stored"): `match-feedback.js` and `feedback-read.js` offline, `@netlify/blobs` stood in for - matchBand()'s four names each stored under its slug, every other band refused with `bad-band` and nothing stored, a score of 0 kept; the key layout, the store, the record's ten fields and anonymity unmoved; the summary, filters and CSV over the four, in matchBand()'s order, its caveat word for word; the bundle's own vote run on the default `/app` pair, 74 · Moderate, stored and counted; the question asks about smell and taste, no effect word in the block; the privacy page's sentence about votes; since 2026-10-14 the smell words (§13, "Smell words on a vote") - the bundle's `SMELL_NOTES` and the handler's `NOTES` one list, up to three distinct words stored in list order in a v 2 record, every other shape refused with `bad-notes` and nothing stored, `null` when none was sent, the CSV's notes column, no word on the list an effect word |
| `coa-dates-test.js` | `lib/coa-dates.js` and the parser's `harvestOn` / `reportOn` / `testedOn` (§7): the four forms, a one-digit month or day, a time of day, the near misses, `testedOn` on every fixture and the rule behind each lab's row, and every other field identical without it |
| `date-probe.js` | read-only, not a gate: for every accepted fixture, the lab, the dates the parser reads, and every line whose label ends in `Date:`, `Completed:` or `Created:` with the line after it; then per lab, how many are dated and on how many fixtures each label appears (`--labels`). Run it before choosing a date label for a new lab (§13, "When the lab finished") |
| `analysis-test.js` | the analysis layer (§13) on PGlite: the two views, their grants; `drift.js`, `lab-stats.js` and, since 2026-10-14, `score-spread.js` |
| `duplicates-test.js` | `duplicates.js` and `download-twice.js` (§13, "One report, many documents"): on PGlite, and on fixture PDFs behind a stand-in fetch - a PDF rebuilt between downloads, the same file twice, a text that changes, a link that fails; offline |
| `remove-copies-test.js` | `remove-copies.js` (§13, "One report, many documents - the cleanup") on PGlite: copies made by the old `save_scan`, the copies it keeps and why, a Blobs failure, a second run, no text lost, nose_writer refused; and that only it, `remove-document.js` and the probe's refusals name a DELETE; offline |
| `remove-document-test.js` | `remove-document.js` and `keep-rule.js` (§13, "What gets kept, and taking it back out") on PGlite: the probe finds the one-sign files and nothing else; dry runs change nothing; a removal takes rows, PDF and every copy of the report, records the day and the word, and withholds file and text so `save_scan` refuses them after; PDFs with no row; a Blobs failure finished by a second run; a database refusal that changes nothing; nothing private printed; offline |
| `b2b-coverage-test.js` | `scripts/b2b-coverage.js`, the dispensary coverage report (§14): the test catalog read end to end through the real chain, extractor and parser, only the network stood in for - every outcome, the three flags, the counts with their denominators, one link at a time with the pause, coa.js's own words and deadlines, a file refused for an unknown or a personal-looking column before any row is read, nothing reaching the archive, one copy of the fetch chain; offline |
| `b2b-store-test.js` | the dispensary store (§14, "Schema, role, keys and the switch") on PGlite: schema `b2b` applied after every migration (those pinned byte for byte), its tables and columns, the person rule's three lists and two bodies identical, a personal key at any depth refused in both layers with the text asserted, `nose_b2b` upserting and refused DELETE, TRUNCATE, stores, keys and schema `nose`, `nose_writer`'s grants unchanged, `probe-db.js`'s b2b audit passing and failing on eight broken grants, every fixture's reading stored as read, keys hashed, `scripts/b2b-store.js`'s five commands, `lib/b2b-flag.js`, the `nsk_` build guard; since 2026-10-14 `batch_reads.tested_on` - its migration pinned to its first push and only adding, every fixture's stored day the parser's `testedOn` (§14, "The day the lab finished, in a store's readings"); offline |
| `b2b-catalog-test.js` | the catalog upload, the batch reader and the report from the database (§14, "Catalog upload and the batch reader") on PGlite, the real function behind a stand-in `pg` that runs every statement as `nose_b2b`, the links served from fixture files: the switch, the key (one 401 for every wrong key, the hash compared in constant time), the 4 MB cap before and while reading, the coverage script's own reader and refusals, an upload as a whole snapshot (absent batches kept and marked out of stock, a refused row's batch untouched, nothing to keep changing nothing), counts-only replies, one fixed log line on failure; the reader's accepted, refused and unfetched readings, `--dry-run`, `--reread`, `--limit`, a corrected link read again, a fetch failure never replacing a reading, nothing from another batch or store; `--store` matching the CSV run row for row; since 2026-10-14 each reading's `tested_on` as the parser gives it, refused on a link that gave no report by its own CHECK, and cleared when a link that gave none replaces a dated reading; schema `nose` and the archive untouched; offline |
| `b2b-endpoints-test.js` | the widget's two calls (§14, "Feed and votes") on PGlite, both functions behind a stand-in `pg` that runs every statement as `nose_b2b` and a stand-in `@netlify/blobs`: the switch; the feed byte-identical for two visitors, every batch in the window in stock or not, the prompt's fields alone, a reading's figures only when it is the current one and accepted, no lab-report link; the origin rule (a foreign, missing, `null` or other store's origin gets no CORS header and no data), a revoked key, `public, max-age=60`; a vote's six fields and nothing else, matchBand()'s four bands all stored, no time of day in key or value, keys in no arrival order, the per-store daily cap with the same reply; one fixed log line on failure; `delete-store` removing a store's votes and only its own; since 2026-10-14 the feed's `tested_on`, after `harvest_on`, only from the current reading; schema `nose`, the archive and the consumer's store untouched; offline |
| `b2b-rank-test.js` | `js/b2b-rank.<hash>.js`, the dispensary ranking engine (§14, "The ranking engine"): one file, loaded as a page loads it and in Node; no maths of its own, every number traced to NoseMatch; the 1830 golden pairs, 61 self-scores and 65 palates through `rank()` and `palateFrom()` to the last bit; 3x the intensity the same; unread batches last, with no number; routes, category, stock and the guardrail leaving batches out and never reordering; ties by `list_position`; each skip reason, a removed batch, one count per batch, the window as PostgreSQL counts it; `soldOut()` and `voteScore()`; no name or brand read; `build.sh`'s load-order rule, its own lines, on throwaway pages; offline |
| `b2b-strings-test.js` | `js/b2b-strings.<hash>.js`, every word the dispensary widget shows (§14, "The widget"): two variants, default and florida, with the same keys and placeholders; no effect or recreational word - the prompt's list and their forms - in any string or anywhere in the file; Florida's says aroma and orders; the words shown from other files true to `matchBand()` and `renderBar()`; every key read by the widget and none written out in it; offline |
| `b2b-pilot-test.js` | the pilot's plan, sample size and report (§14, "Pilot plan and report"): `scripts/b2b-sample-size.js` against published worked examples, never its own output - two means against the NCSS PASS chapter's (Chow, Shao and Wang's 63 a group, and 107 and 151), two proportions against R's `power.prop.test` documentation; the deciding difference of two means against NIST's raw-data example, Wilson's interval against NIST's, Newcombe's against his Table II, the split check against a published example, the delta method against the mean it must equal; synthetic exports - a known difference in inhalable orders per shopper found, the plan's alpha deciding, a null read as null, the mirror read as the mirror, a short run and a run still going showing only how far short, a personal column refused before any row, an unreadable row refusing the file without its value; the plan's block and its pre-registration by git in throwaway repositories; the votes by band; the vote store only listed, no file written, the command line end to end; offline |
| `check-trust-test.js` | `scripts/check-trust.mjs` (§13, "The trust guard") on throwaway sites: every form of the old promise fails, true sentences pass; offline |
| `b2b-release-test.js` | pinned widget releases (§14, "Pinned releases"): `scripts/b2b-release.js`'s build - the same bytes from one commit and version, every time, anywhere; the five files verbatim and in order but for the widget's two stylesheet lines; the stylesheet verbatim; the bundle running as a page runs it - its refusals, its publishing to a stand-in Blobs (never overwriting, going on after a stop, an ETag or a failure, the row last), `netlify/functions/b2b-release.js` (the switch, GET and HEAD, one path shape, the bytes with exactly their five headers, a 404 nothing caches, 503 and one line), `scripts/b2b-release-check.js` against each kind of mismatch, nothing built left in the repo, no effect wording, the integration guide's names; offline, in throwaway git repos; a gate, run after the build |
| `b2b-widget-test.mjs` | `<nose-matches>` in headless Chromium (§14, "The widget"): the built files on a store's page from another origin, under the prompt's CSP, against a stand-in feed and vote; only the feed and the vote leave the page, and no request carries a purchase; consent, denied, control; each mode equal to `js/b2b-rank`'s answers; every bar `renderBar()`'s; keyboard reach; the demo page; one copy of the bar; `build.sh`'s load-order lines; since 2026-10-09 the vote by `fetch` with no cookie or referrer, and a pinned release - one tag with its hash under the integration guide's own CSP lines, the same rail and vote, its stylesheet checked by its hash, an altered file or a missing `crossorigin` refused. Needs Playwright; a gate, run after the build |
| `input-paths-test.mjs` | the app's ways in, in headless Chromium: Scan QR (fake camera and QR image), COA link, Upload. The real `coa.js` and parser answer, with only the download and unpdf stood in for (§13, "The input paths"). Since 2026-10-14 also the card's Moisture and Water activity rows on flower - below, inside, both edges (0.55 and 0.65), above and Pass only, each row's text written out (§13, "Water activity against ASTM D8197"); and the row after Batch - Harvested, else Report dated, else none - with its age and the note under it, on a frozen clock in New York's time zone (§13, "Harvest date and age on the card"); `INPUT_PATHS_SHOTS=<folder>` saves a picture of each of those cards. Since 2026-10-14 also the smell words on a vote - thirteen toggle buttons reached by Tab, a fourth refused with a note, and the vote's POST taken before it leaves the page, carrying exactly the two words picked and no other new field (§13, "Smell words on a vote"). Since 2026-10-14 (R8) also the Water activity row's link - the words it already showed, linking to `/learn/why-your-jar-is-drier-than-its-report/` in a new tab with `rel="noopener"`, the row's text unchanged, no other link on the card, and that guide served (§13, "Two guides from the research"). Needs Playwright; a gate, run after the build |
| `b2b-compliance-kit-test.mjs` | `scripts/b2b-compliance-kit.js` (§14, "The compliance kit") in throwaway git worlds, each with release 1 recorded from its own commit: the test store's kit end to end - ten screens at phone and desktop, scroll pages, README.md, strings.md (every Florida string, every screen's strings traced, "Shown in" exactly where seen or read aloud) and data.md (every paragraph of the privacy page's dispensary section and every other mention) - a store's kit against a stand-in site (one feed request, the key alone, the store's origin), the tag and CSP of the stand-in page, sixteen refusals that write nothing, no time of day, no effect wording, no database or Blobs code loaded, this repository untouched. Needs Playwright; a gate, run after the build |

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
| `score-spread.js [--class X]` | how alike the usable lab reports look to the matching maths, one per sample, scans and fixtures apart, then together: every pair in a product class scored and banded as the app does, a typical jar's share of Good or better, measured coverage and unmapped names, freshness by lab for flower; X is flower, vape or concentrate; reads only |
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

**Additive fields, for the archive (§13) — the app does not read the first
three and `coa.js` does not send them; since 2026-10-14 it sends the last
three, and the card reads them:**

```
reportDate  client  parserVersion  harvestOn  reportOn  testedOn
```

- **`coa.js` sends `harvestOn`, `testedOn` and `reportOn`** on a usable
  reply (since 2026-10-14; `testedOn` since that day's "The Tested row on
  the card"), passed through as the parser gives them - an ISO day or null,
  null when the field is absent. Nothing else in any reply changed; a refusal
  carries none of them. The confirmation card shows one of them on the row
  after Batch - the harvest day, else the day the lab finished, else the
  report day - with how long ago it was (§13, "Harvest date and age on the
  card"). Nothing scores any of them (§4).

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
  cannot mean two ways: `M/D/YYYY`, `M/D/YY` read as 20YY (Kaycha's harvest
  dates, `"07/07/25"`; asked for on 2026-09-23), `YYYY-MM-DD`, `Mon D, YYYY`.
  Since 2026-10-14 (Prompt 7) the month and day of the two slashed forms may
  have one digit (Method's `"8/27/2026"`), and any of the four may end in a
  time of day after a space or a comma - `H:MM` or `H:MM:SS`, then `AM`,
  `PM` or nothing (`", 4:00:00 AM"`, `" 11:59"`, `" 18:04"`). The time is
  checked (hour 0-23, or 1-12 before AM/PM; minutes and seconds 00-59) and
  dropped: the day is the one printed, never moved by the time. Anything
  else is null - a one- or three-digit year, a full month name, a dotted or
  day-first date, an ISO day with one digit (`2025-7-14`), a time with a
  zone, a `T`, a fraction or words after it - and so is a day the calendar
  lacks, a day after today (UTC), or one before 2014-01-01. With those two
  bounds a two-digit year reads only from 14 to the current year, so 20YY is
  never a guess between centuries. On the corpus every printed harvest and
  report date reads: 19 harvest dates (3 ACS, printed ISO already; 16
  Kaycha) and 2 TerpLife report dates - the widening moved none of them.
  Widening the forms again needs a prompt that asks for it.
- **`testedOn`** (since 2026-10-14) is the day the lab finished, as an ISO
  day or null: `lib/coa-dates.js` applied to ONE row per lab, chosen from what
  the fixtures print (`test/date-probe.js`; §13, "When the lab finished").
  There is no printed twin: `finishedOn()` reads the row and keeps only the
  day. Kaycha and Modern Canna `Completed:`, ACS `Completion Date:`, ACT
  `Report Created:` (also when the label wraps after "Report"), Method its
  sign-off - the line after "<name> - Lab Director" - and no row for
  TerpLife (its "Date Reported:" is `reportOn`), Green Scientific or an
  unrecognised lab. Colon labels only, so Modern Canna's bare "Completed"
  status tile is never read. The first row with a value is read; a later row
  never stands in for an unreadable one. Computed after the reading and read
  by nothing in the parser: with `coa-dates.js` unavailable it is null and
  every other field identical. On the corpus 54 of 59 fixtures carry one:
  every accepted fixture but Method_DulceDeUva and TerpLife's, and none of
  the three refusals. **B2B keeps it too**, since 2026-10-14: a store's
  reading holds it as `b2b.batch_reads.tested_on`, whatever the verdict, and
  the feed carries it as `tested_on`, after `harvest_on`, from the current
  reading only (§14, "The day the lab finished, in a store's readings").
  Nothing on the B2B side shows it yet.
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
- **7.5-second fetch budget** a request, inside 8s for the whole chain,
  deliberately under the 10s NOSE keeps a reply within - its own budget, not
  a Netlify limit (§12). Parsing runs ~10 ms, so it is not the constraint.

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
(8s) is computed once and passed down, because three hops at 7.5s each would
run far past the 10s NOSE keeps a reply within - its own budget, not a Netlify
limit. Netlify's "Configuration for functions" gives a synchronous function
60s, and its "Lambda compatibility for Functions" gives no limit for
`coa.js`'s `exports.handler` format, only 10s for a streamed reply (both read
2026-10-15; §13, "Comments that match the code"). A chain that runs on leaves
the person waiting, and past the platform's own limit shows them its error
page rather than ours. Not covered by any test — exercising it needs a slow server.

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
supabase/migrations/20261015000000_nose_tested_on.sql   parses.tested_on; batch_series dated by harvest, else tested, else report, and says which
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
test/store-test.js                                    PGlite, in memory, 114 checks
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
test/date-probe.js                                    read-only: the dates each accepted fixture prints, and which the parser reads
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
scripts/score-spread.js                               how alike the usable readings look to the maths: four tables, scans and fixtures apart
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
`strain_key()`, and `sample_key()` since 2026-10-02; since 2026-10-14
`parses.tested_on` and `batch_series.batch_date_from` (below, "When the lab
finished"). Since 2026-10-02 too,
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
`tested_on` (since 2026-10-14) reads `testedOn` the same way, with the same
pattern, and fills the same way: once each document is read again.
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
dispensary role (§14): a Codespaces secret since 2026-10-07, and in Netlify's
Production context since 2026-10-09, with `B2B_ENABLED=1` (§14, "Privacy page,
then switch on").

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
under a 9s deadline (the 8s fetch chain plus 2s would pass the 10s NOSE keeps
a reply within - its own budget, not a Netlify limit; §12) and are skipped
below 0.3s; `store.js` bounds the connection itself, and a 50ms
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
- **The first real reparse after `testedOn` (§7, 2026-10-14) changes every
  document the same way**: each prints `also changed: testedOn (new)` and
  nothing else - `usable`, `readBy`, `totalTerpenes` and every terpene the
  same before and after. Rehearsed on a local copy of the seeded archive (the
  59 fixtures read by `18520cc`, every migration applied): the dry run and a
  real run of the change committed both said `0 unchanged / 59 values
  changed / 0 accepted→rejected / 0 rejected→accepted / 0 failed`, with that
  one name on all 59 and nothing else; a second run said `59 unchanged`. On
  the real archive expect every document, fixture or scan, to show that one
  line. Anything else - a terpene that moved, an accepted→rejected,
  `harvestOn` or `reportOn` named beside it - is to be brought back before
  the real run (below, "When the lab finished").
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
  2026-10-02: `lab`, `client`, `strain_key`, `batch`, `batch_date`,
  `total_terpenes`, `parse_id`, `copies`, and since 2026-10-14
  `batch_date_from`. `batch_date` is `coalesce(harvest_on, tested_on,
  report_on)` since 2026-10-14 - `coalesce(harvest_on, report_on)` until
  then - and `batch_date_from` says which: `harvest`, `tested` or `report`,
  NULL for an undated batch (below, "When the lab finished"). A sample is
  the lab and its lab ID where one was read, else the document
  (`nose.sample_key()`); its row is the newest document's latest reading, and
  `copies` is how many usable documents hold it - 1 when it was kept once. A
  NULL `batch_date` is an undated batch. Refused readings, and outputs with
  no boolean `usable`, are not in it. `latest_parses` carries `tested_on`
  too, as its last column.
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
  refused and verdict-less readings, the strain key, the date fallback -
  harvest, else tested, else report, and `batch_date_from` naming each - a
  real ACS report (dated 2026-04-03 by its own harvest line, not by the
  later day the lab finished), a real Method report dated only by its
  sign-off (MTL-FLW-002, 2026-08-31), the columns, security_invoker in
  practice, and the grants. Rehearsed on a local copy of the seeded archive:
  59 documents, 56 in `batch_series`, 20 of them dated - 55 since the
  reparse after 2026-10-14 - and `probe-db.js` against it passed every view
  and grant check.

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

- Dated batches, oldest first: the date and which day it is - `harvest`,
  `tested` (the day the lab finished, since 2026-10-14) or `report`, as the
  view's `batch_date_from` names it - lab, client, batch, form, parse id, the
  name as printed, the total terpenes the report printed, and the top five
  terpenes as share of total (`normalize()`, so zeros and cannabinoids never
  appear).
- Then each batch against the one before: `cosine()` of the two
  share-of-total profiles, printed to three places, then as the app shows it
  (`shownScore()`, floored - `Math.round` until 2026-09-24) with
  `matchBand()`'s label and band. Batches of
  the same day have no order between them, so each is compared with every
  batch of the day before and with each other (`3a ~ 3b`).
- Undated batches are listed apart and compared with nothing.
- Notes when the series mixes labs, clients, product forms, or kinds of
  date (harvest days, days the lab finished testing, report days), or when
  samples under the name were refused - each is a reason two reports differ
  that is not the batch.
- One batch per sample (since 2026-10-02): a sample kept as several
  documents prints `one sample, kept as N documents` and a note says so;
  refused samples are counted by sample too.
- It says, first and last, that drift is between lab reports, not between
  experiences. `test/analysis-test.js` drives it on PGlite and fails on any
  effect wording in its output or in the layer's files.
- On the rehearsal archive 20 of the 56 usable batches were dated until
  2026-10-14, and 55 after the reparse that added `testedOn`. "Grease
  Monkey" is a Kaycha cart and a Kaycha concentrate from one harvest day,
  2026-03-23 - `1a ~ 1b`, 0.997, shown as 99 since 2026-09-24 (100 while
  the app rounded), Close match - and a Modern Canna flower report that was
  undated and listed apart until 2026-10-14. Now it is batch 2, `tested`
  2026-06-18: `1a → 2` 0.994 and `1b → 2` 0.996, both 99, Close match, and
  a note that the dates mix harvest days and days the lab finished testing.

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

**`scripts/score-spread.js [--class flower|vape|concentrate]`** (since
2026-10-14) - how alike the archive's usable readings look to the matching
maths, one per sample from `batch_series`, real scans and seeded fixtures
apart, then together: every pair inside a product class scored and banded
as the app scores a match, how many of the others a typical sample has at
Good or better, measured coverage and the unmapped names, and freshness by
lab for flower. It describes lab reports, not experiences, prints no
strain, batch or client, and changes no score (below, "Score spread,
2026-10-14").

**Run them, from the Codespace** (after the `db push` above; `NOSE_DB_URL`
is enough - all three read only, as `nose_writer`, and print no report text,
address or secret): `node scripts/drift.js "Grease Monkey"`, `node
scripts/drift.js "Grease Monkey" --lab "Kaycha Labs"`, `node
scripts/lab-stats.js`, `node scripts/score-spread.js`.

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
  (66 since 2026-09-24, 130 with water activity and 200 with the date row,
  both 2026-10-14, and 260 with the Tested row, the same day),
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
  and Good votes were stored at all until 2026-10-13 (below, "Every vote
  stored").
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

### Every vote stored, 2026-10-13

**A vote on a Partial overlap or Different profile match was refused and
lost.** The app sends `matchBand(score)[1]` as a vote's band - Strong, Good,
Moderate or Low - and `match-feedback.js` took Strong, Good, Partial and Weak,
so a Moderate or Low vote got a 400 `bad-band` that `sendBeacon` shows nobody.
The default `/app` pair, 74 · Partial overlap, was one of them. Without those
votes NOSE cannot learn whether a low score means a different flavor, which is
half of testing the hypothesis. And the question asked "Did this match reflect
your experience?", which invites an answer about effects.

```
netlify/functions/match-feedback.js  BANDS: matchBand()'s four names, to strong, good, moderate, low
netlify/functions/feedback-read.js   BAND_SLUGS: the same four, in matchBand()'s order
app.html                             the question: "Did the smell and taste match the score?"
test/match-feedback-test.js          offline, Blobs stood in for, a gate: "match-feedback clean"
scripts/gates.sh                     the gate, after match maths
```

**The probe, before any edit**, on `7150db8` - ALL GATES GREEN, 31 gates:

- `resetFeedback()` in `js/nose.bab857ad.js` sends `band: matchBand(score)[1]`
  and `score: shownScore(score)`; `sendFeedback()` posts `{...feedbackContext,
  vote}` to `/.netlify/functions/match-feedback`, by `sendBeacon` or a
  keepalive `fetch`. `BANDS` was `{ Strong, Good, Partial, Weak }` (line 26),
  `BAND_SLUGS` `{ strong, good, partial, weak }` (line 35).
- The handler offline, `@netlify/blobs` stood in for, one vote per
  matchBand() name, Moderate on the hero pair (0.7452 → 74): Strong and Good
  204 and stored, under `votes/strong/up/…` and `votes/good/up/…`; Moderate
  and Low 400 `bad-band`, nothing stored.
- The live summary from `feedback-read`, read in the Codespace on 2026-10-14
  (US Eastern) with the token kept out of the shell's history and out of the
  chat: 3 votes - Strong 1 up, Good 1 up, Partial 0, **Weak 1 down**. Not the
  Strong-and-Good-only the prompt expected, so the work stopped there. The
  three records, read the same way: Weak down, score 10, candidate
  `probe-test`; Strong up, 95, `probe-test`; Good up, 84, `cold-creek` - all
  dated 2026-08-01. No version of the app ever sent Weak: from the first
  commit with a vote (`85fec5d`, 2026-07-22) it has sent `matchBand(score)[1]`,
  whose names have always been Strong, Good, Moderate and Low. So the Weak
  key is not in use; it is one of the curl writes `feedback-read.js`'s comment
  calls synthetic. That comment names `test-do-not-count` and `probe-test`;
  the store holds two `probe-test` records and none named
  `test-do-not-count`. The owner chose to go ahead as built.
- Nothing else sends a vote. The only sender that ships is `js/nose.*.js`;
  `wip/nose-farnesene-wip.js` holds a copy, but `/wip/*` is a 404
  (`_redirects`). Partial and Weak were named as vote bands only in those two
  lines, besides the B2B mentions below.

**The fix.**

- `match-feedback.js` takes exactly `Strong`, `Good`, `Moderate` and `Low`,
  stored under `strong`, `good`, `moderate` and `low`; Partial and Weak are
  gone. A band must also be a string and one of the four as an own key: the
  plain lookup took `"constructor"` as a band, which would have filed the vote
  under the function's source text, and `["Strong"]` as Strong, storing the
  array. Nothing else in the record or its key changes.
- `feedback-read.js` reads, summarizes, filters and exports the same four, and
  the summary lists them in matchBand()'s order: Strong, Good, Moderate, Low.
  A key under any other slug is not read. Its caveat is word for word.
  **So the deploy took the summary from 3 records to 2**: the
  `probe-test` Weak vote stays in the store, untouched, under `votes/weak/`,
  and is no longer read. Nothing deletes it. The Strong `probe-test` vote is
  still counted, as before - filter on candidate id, as the comment says.
- `app.html`: "Did this match reflect your experience?" became "Did the smell
  and taste match the score?" The sentence before it, both buttons ("Matched",
  "Didn't match") and the group's spoken name ("Was this match accurate?")
  stay. A vote now says the score was right or wrong about smell and taste.

**The question changed on 2026-10-14 (US Eastern)**, with the deploy of
this change (below, "Live"). **Votes before it answered a different question** -
"Did this match reflect your experience?" - and may speak about more than
smell and taste, so analysis keeps them apart. A stored vote carries no
question version (the record's fields did not move): its server `ts` against
the deploy's time splits them. Every earlier vote is Strong or Good, since
Moderate and Low were refused until the same deploy. A tab opened before the
deploy keeps the old page until it is reloaded, and its votes reach the new
function, so the first votes after the deploy - Moderate and Low included -
may still have been asked the old question. On the live store the split is
clean: every vote before the deploy is dated 2026-08-01, and the first after
it is the deploy check.

**What did not move.** The key layout,
`votes/<slug>/<vote>/<YYYY-MM-DD>/<HHMMSSmmm>-<rand>`; the store,
`match-feedback`, strongly consistent; the record's ten fields; anonymity - no
header, cookie, account or session is read; the privacy page, whose sentence
on what a vote sends still holds word for word; every score - no file in `js/`
changed, so `build.sh` renamed nothing and `match-golden.json` is as it was;
the parser and everything B2B. `lib/b2b-votes.js`'s header still says
`match-feedback.js` accepts Partial and Weak, and so does a check label in
`b2b-endpoints-test.js`: both now describe the past, and B2B files were
outside this prompt.

**`test/match-feedback-test.js`**, a gate after `match maths`, drives both
functions through their default exports with `@netlify/blobs` stood in for:
one vote per matchBand() name - read from `js/match-math.*.js` - each stored
under its slug; Partial, Weak, `moderate`, `low`, `STRONG`, `Medium`, the two
labels, `constructor`, `toString`, an empty string, null, an array and a
number each refused with `bad-band` and nothing stored; a score of 0 kept; the
other refusals as before; the key layout, the store and the record's ten
fields; nothing about the person read. Then `feedback-read`: 503 with no
token, 401 with a wrong one, the summary over the four in matchBand()'s order
and nothing else (a hand-planted `partial` and `weak` key are not read), from
the keys alone, the caveat word for word, `?band=` for each of the four,
`?band=Low&vote=down`, the CSV's columns and rows. Then the app: the bundle's
source text sends `matchBand(score)[1]` and `shownScore(score)`; its own
`PROFILES`, `profileById`, `palateProfiles`, `palateVector`, `reportableId`,
`resetFeedback` and `sendFeedback`, run on the default pair with the maths
file, send 74 · Moderate for lemon-tart against cold-creek, and that payload is
stored under `votes/moderate/up/` and counted under Moderate; the question,
both buttons, no effect word in the block, read or spoken, and the privacy
page's sentence. With HEAD's `match-feedback.js` 16 checks fail; with HEAD's
`feedback-read.js` it stops, finding no Moderate; with HEAD's `app.html` 2
fail; with the bundle sending `matchBand(score)[0]` 3 fail. Clean on Node
22.22 and 20.20 (`.nvmrc`).

**How it was verified, 2026-10-13, in the cloud workspace.** npm and
cdn.jsdelivr.net were refused by the egress policy, so the gates ran on
stand-ins built from upstream source at the lockfile's versions: unpdf 1.8.0's
text extraction from its source over pdfjs-dist 6.2.108, with unpdf's own
eight literal PDF.js patches, every anchor matched; PGlite 0.5.8's query flow,
parsers, serializers and result rules (`base.ts`, `parse.ts`, `types.ts` and
its pg-protocol) from its source at that tag, over a throwaway PostgreSQL 16
server per instance; the committed html5-qrcode in place of `build.sh`'s
download; Playwright 1.56.0's Chromium 141. No gate needed `pg` itself. ALL
GATES GREEN on `7150db8` before any edit, 31 gates, and after it with the new
gate, 32 - `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944 each time. Two
full runs on the change failed once each, on files it does not touch: `b2b
widget` (2 checks, in headless Chromium; their lines were not kept) and `b2b
endpoints` (the stand-in PGlite connected before its server took sessions -
fixed in the stand-in, which now retries). Both passed every time after,
alone and in two more full runs, and the baseline was run again on the final
stand-ins: 31, green. `parse-coa.js`, `coa-dates.js` and `extract-text.js` are
untouched, so no reparse is due; no migration. Nothing ran against Netlify, a
real store or the live site. The Codespace run on the real packages is the one
that counts.

**Live, 2026-10-14 (US Eastern).** While this waited for the probe, another
session put `d450d70` (§14 only) on main, so the commit went in rebased on it,
as `581883b`. In the Codespace on the real packages, ALL GATES GREEN, 32
gates, `match feedback` among them, `KAY-CAR-001` 4.124 and `KAY-PRR-001`
0.944 - run on the commit before the rebase, `ad62f41`; the rebase changed
only §14's text, and the rebased commit was green in the cloud workspace.
`git push` deployed `581883b`. On `/app` in a private window the owner
pressed Matched once on the default pair. (The served page's question was
not read back in this record; a page fetch from the cloud workspace does
not show the hidden result panel.) `feedback-read` then gave Strong 1 up, Good 1 up,
**Moderate 1 up**, Low 0, total 3 - the `probe-test` Weak vote no longer read
- and the Moderate record: up, score 74, candidate `cold-creek`, palate
`lemon-tart`, `ts` 2026-10-14T12:18:23.148Z. **That vote is a deploy check,
not a person's answer**: its candidate is a real sample id, so
`feedback-read.js`'s synthetic-records comment lists it by its `ts`, beside
the two curl writes of 2026-08-01, with what the store actually holds of
those (two `probe-test` records, none named `test-do-not-count`). Real votes
to date, by that comment: one, the Good vote of 2026-08-01.

### Water activity against ASTM D8197, 2026-10-14

**The card gave water activity as a bare number, and "not printed" without
one.** Dry flower is a live complaint among Florida patients (R3 in the
2026-10-07 build prompts, from the r/FLMedicalTrees research, section 8), and
the old project spec's "water activity under 0.65" has no dry side.

```
js/nose.*.js               waterActivityText(); the Moisture and Water activity rows of renderCoaConfirmation
                           (was js/nose.bab857ad.js - build.sh renamed it; app.html, index.html, _redirects follow)
test/input-paths-test.mjs  six freshness cases, in the input-paths gate: 130 checks, 66 before
```

**The probe, before any edit**, on `3b58274` - ALL GATES GREEN, 32 gates:

- The two rows (lines 388-391), shown only when `freshnessApplies`, which the
  parser sets for `productClass === 'flower'`. Nothing else shows a reading's
  moisture or water activity to a person: `coa.js` sends them for flower only;
  the archive, its analysis view (`p.moisture`, `p.water_activity`) and the B2B
  store keep them, on no page; the widget does not read them.
  `learn/how-to-read-a-coa/` shows a made-up example (11.2 %, 0.58 aw) and
  cites D8197.
- `coa-baseline.json`: 10 flower readings carry a water activity, as the
  prompt expected. Below 0.55: TerpLife_GrpeBblGm_flower 0.49,
  KF2025-046-PB-AU-COA 0.52, ACS-FLW-002 0.53, COA_GassiusClay_… 0.54,
  KAY-PRR-001 0.54. Inside: ACS-PRR-001 0.55, KAY-FLW-001 0.56,
  external-download 0.58, KAY-FLW-002 0.583, Kush_Creek 0.59. None above. The
  other 15 flower readings carry none; 5 of them carry a moisture.
- `input-paths-test.mjs` gets each reply from `handlerReply()`: the real
  `coa.js` and parser on the fixture's extracted text, with only the download
  and unpdf stood in for; `page.route` takes the next queued fixture.

**The change.**

- **Water activity**: the value as the reply carries it, then one phrase -
  `0.54 — below ASTM D8197's 0.55–0.65 range for dried flower`, and the same
  with `inside` or `above`. Both edges are inside: below is `aw < 0.55`,
  above `aw > 0.65`. A word joiner (U+2060) follows the en dash. Unicode's
  line-breaking rules give an en dash (class BA) a break opportunity after it,
  and WJ prohibits a break before and after itself (UAX #14 revision 57, for
  Unicode 18.0.0, 2026-09-01, https://www.unicode.org/reports/tr14/, read
  2026-10-14). At 390 px Chromium broke the line as "0.55–" / "0.65" without
  it, and keeps the range whole with it (pictures taken 2026-10-14).
- **Moisture**: the value with `%`, no verdict. No published moisture range
  turned up, and the two measures disagree: KAY-FLW-002 prints 14.97 % and
  0.583.
- **Without a number**, both rows say `no number on this report` (was `not
  printed`). A report that prints only Pass (MCL-FLW-001 prints PASS for both)
  and one that prints nothing read the same to the parser, and the words are
  true of both. Total terpenes keeps its `not printed`.
- **"As printed" is the reply's number.** ACS-PRR-001 prints `0.550`; the card
  shows `0.55`, as it did. Keeping the printed form would take a parser change.
- **The range**: ASTM D8197-22, the active edition - its title gives 0.55 to
  0.65 water activity for dry cannabis flower
  (https://store.astm.org/d8197-22.html, read 2026-10-14). The card names no
  edition; D8197-21's title gives the same range.

**What did not move.** `parse-coa.js`, `coa-dates.js` and `extract-text.js`,
so no reparse is due; `coa.js` and its replies; every other card row;
`js/match-math.*.js` and `match-golden.json`; anything B2B; every gate's
expected line. The new words - the three phrases and `no number on this
report` - have no hit for the effect-word list.

**`test/input-paths-test.mjs`** reads six flower cards on COA link, each
through `cardChecks()` (the card, its panel, its message, its rows, total,
warnings and novelty), then the two rows' exact text, then Discard:
KAY-PRR-001, 0.54 below and 12%; KAY-FLW-002, 0.583 inside and 14.97%;
ACS-PRR-001, the 0.55 edge, inside and 10%; KAY-FLW-002's real reply with
only `waterActivity` set to 0.65, the other edge, inside, and set to 0.68,
above (no fixture prints either); MCL-FLW-001, Pass only, both rows `no
number on this report`. First the handler reads each real one as flower with
that water activity. `INPUT_PATHS_SHOTS=<folder>` saves a picture of each
card; unset, the test writes nothing. On the unchanged bundle the seven row
checks failed - the five water activity rows read 0.54, 0.583, 0.55, 0.65 and
0.68, MCL-FLW-001's two `not printed` - and the other 123 passed. With the
change, 130 of 130. The gate's line stays `input-paths clean`. The 0.65 case
was added on 2026-10-14 at the owner's word, after the first commit on this
branch, which had five.

**How it was verified, 2026-10-14, in the cloud workspace.** npm and
cdn.jsdelivr.net were refused by the egress policy, so the gates ran on
stand-ins: unpdf 1.8.0's `extractTextItems` and `getDocumentProxy` from its
source over pdfjs-dist 6.2.108's legacy build (parity 56 match / 0 differ
against the baseline); PGlite 0.5.8's `base.ts`, `parse.ts`, `types.ts` and
its pg-protocol from its source at that tag, over a throwaway PostgreSQL 16.15
server per instance; the committed html5-qrcode in place of `build.sh`'s
download; Playwright 1.56.0's Chromium. ALL GATES GREEN on `3b58274` before any
edit, 32 gates, and on the change, 32, with `KAY-CAR-001` 4.124 and
`KAY-PRR-001` 0.944 each time. Nothing ran against Netlify or the live site.
The Codespace run on the real packages is the one that counts.

### Harvest date and age on the card, 2026-10-14

**The card did not say how old a report was.** Patients check a report's
dates because flower dries and goes quieter after it is tested (R4 in the
2026-10-07 build prompts, from the r/FLMedicalTrees research). The parser has
read `harvestOn` and `reportOn` since 2026-09-23 (§7), but `coa.js` did not
send them and the card showed neither.

```
netlify/functions/coa.js     the usable reply adds harvestOn and reportOn (s7)
js/nose.*.js                 reportDateRow(); the row after Batch and its note, in renderCoaConfirmation
                             (was js/nose.2a816b77.js - build.sh renamed it; app.html, index.html, _redirects follow)
test/input-paths-test.mjs    seven date cases on a frozen clock, in the input-paths gate: 200 checks, 130 before
test/match-test.js           one check: harvestOn, reportOn and totalTerpenes never reach normalize()
```

**The probe, before any edit**, on `b91a2f7` - ALL GATES GREEN, 32 gates:

1. Tests that run `coa.js`'s handler and read its reply:
   `archive-wiring-test.js` compares replies whole, but each against a
   baseline from the same handler in the same run, and lists no reply's keys
   (its two key lists are the PDF's metadata and the database payload); its
   stand-in reading has no `harvestOn`, so both sides carry null.
   `input-paths-test.mjs` reads fields by name. `b2b-coverage-test.js` reads
   only `error` and `reasons`, from refusals, which do not change.
   `resolver-test.js` and `duplicates-test.js` load only
   `_resolvePdfFromPage`; `b2b-catalog`, `b2b-endpoints` and
   `b2b-compliance-kit` only check that `coa.js` is not loaded. None breaks
   on two new fields.
2. Accepted fixtures: 19 carry `harvestOn` (3 ACS, 16 Kaycha), 1 only
   `reportOn` (TerpLife_GrpeBblGm_flower), 36 neither - 20 of 56 dated, as on
   the rehearsal archive. None carries both.
3. `sanitizeTerps()` lowercases a key and keeps it only when `TERPENES` or
   `TERP_ALIAS` names it. `harveston`, `reporton` and `totalterpenes` are in
   neither and none contains `nerolidol`, so all three are dropped before
   `normalize()` sums anything: through `scripts/lib/match.js`, a profile
   with them normalised to the same object as one without.

`testedOn` (Prompt 7 of the 2026-09-23 review) does not exist - no parser
field, no reply field - so the card has no Tested row (below, "Still open").

**The change.**

- **`coa.js`**: `harvestOn: result.harvestOn ?? null` and `reportOn:
  result.reportOn ?? null` on the usable reply, after `harvestDate`. A
  refusal's reply is as it was.
- **The row**, straight after Batch: `Harvested` with `harvestOn`; else
  `Report dated` with `reportOn` - the report's day, not the harvest's; else
  no row. Its value is the day as `Mon D, YYYY`, a middle dot, and how long
  ago: `Jan 27, 2026 · 260 days ago`, `1 day ago` for one, `today` for none.
  The month names are written out in the code, not taken from the browser's
  locale, so every browser shows the same words. A value that is not an ISO
  day the calendar has shows no row: the parser never sends one, and the card
  does not guess.
- **How long ago** counts whole calendar days from that day to the person's
  own today, in their time zone - both as UTC midnights, so a daylight-saving
  change cannot make a day 23 or 25 hours. The parser refuses a day after ITS
  today, which is UTC's: from 8 pm Eastern in summer, a report dated the UTC
  today is the person's tomorrow. That day shows alone, with no "ago".
- **The note**, under the value in the same cell: "A report describes the jar
  on test day. Terpenes keep evaporating after that, so an older jar can smell
  quieter than its numbers." In the card's muted `.small` type at normal
  weight (the cell is bold), set through the element's `style` property, as
  the family panels in the same file already are: under `style-src 'self'` a
  property set that way is not blocked, while a `style` attribute or `cssText`
  would be (MDN, "CSP: style-src",
  https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy/style-src,
  read 2026-10-14). No stylesheet changed: a new rule in `css/shell.*.css`
  would rename it, and `b2b/demo/index.html` links that file.
- **Nothing is stored with a jar.** "Use this jar" saves the name and the
  rows' values, as before; the date lives on the card only. R4 settled this:
  storing it would change what `palate-sync` keeps, so the privacy page would
  come first.
- **The rule** is in §4: age never changes the shape or the score; a decay
  curve, if one is ever built, lowers intensity only.

**The strings**, shown to the owner and approved before the commit: `Harvested`, `Report
dated`, the twelve month abbreviations, `today`, `1 day ago`, `N days ago`,
the middle dot, and the note. The effect-word list (relax, calm, sleep,
energ, focus, uplift, euphor, sedat, mood, high, buzz, stoned, pain, anxiety,
stress, treat, relief, cure) finds nothing in them, nor in any line the
change adds to the bundle or to `coa.js`.

**What did not move.** `parse-coa.js`, `coa-dates.js` and `extract-text.js`,
so no reparse is due; every other card row, checked row by row on three real
reports; `js/match-math.*.js` and `match-golden.json`; the archive; anything
B2B; every gate's expected line - `match clean` and `input-paths clean` stay
their lines.

**`test/input-paths-test.mjs`** now opens its browser context in
`America/New_York` (`timezoneId`, https://playwright.dev/docs/emulation) and,
before the date cases, freezes the page's clock with
`page.clock.setFixedTime('2026-10-15T02:30:00Z')`: `Date.now()` and `new
Date()` return that time and timers keep running (https://playwright.dev/docs/clock,
and `clock.setFixedTime`, added in v1.45,
https://playwright.dev/docs/api/class-clock; both read 2026-10-14). That
instant is 22:30 on 2026-10-14 in New York, so every age counts from the
14th; counting from the UTC day would add one. Called on the open page, it
takes effect, which the test checks first. Then the handler's own replies:
KAY-FLW-001 carries `harvestOn` 2026-01-27, TerpLife_GrpeBblGm_flower
`reportOn` 2025-11-17, MCL-FLW-001 neither. Then each card on COA link,
through `cardChecks()`, then the row, then every row of the card in order,
written out: `Harvested` `Jan 27, 2026 · 260 days ago`; `Report dated` `Nov
17, 2025 · 331 days ago`; no row and no note. Then KAY-FLW-001's real reply
with one field set: a report day as well (Harvested still wins), harvested
2026-10-14 (`today`), 2026-10-13 (`1 day ago`) and 2026-10-15, the UTC today
(`Oct 15, 2026` alone). On the unchanged bundle and `coa.js` the eleven checks
that need the new fields failed - three replies, six rows, two whole cards -
and the other 189 passed; with the change, 200 of 200. `INPUT_PATHS_SHOTS`
also saves these seven cards, named `date …`.

**How it was verified, 2026-10-14, in the cloud workspace.** npm, unpkg and
cdn.jsdelivr.net were refused by the egress policy, so the gates ran on the
same kinds of stand-in as the session before: unpdf 1.8.0's
`getDocumentProxy` and `extractTextItems` from its source over pdfjs-dist
6.2.108's legacy build (parity 56 match / 0 differ); PGlite 0.5.8's
`base.ts`, `parse.ts` and `types.ts` and its pg-protocol, from their source at
that tag, driving a throwaway PostgreSQL 16.15 server per instance over a
Unix socket; the committed html5-qrcode in place of `build.sh`'s download;
Playwright 1.56.0's Chromium. ALL GATES GREEN on `b91a2f7` before any edit,
32 gates, and on the change, 32, with `KAY-CAR-001` 4.124 and `KAY-PRR-001`
0.944 each time. Nothing ran against Netlify or the live site. The Codespace
run on the real packages is the one that counts. This record closes no
"Still open" item; it adds two.

**In the Codespace and live, 2026-10-14** (US Eastern), on `5ec7d3b`: after
`npm ci` and Playwright with its Chromium installed again, `bash
scripts/gates.sh` ended ALL GATES GREEN, 32 gates, with `KAY-CAR-001` 4.124
and `KAY-PRR-001` 0.944, `match clean` and `input-paths clean` - the real
packages, no stand-ins. After Netlify deployed it, the owner scanned a Kaycha
report on the live site and the card showed the Harvested row.

### Score spread, 2026-10-14

**Do most Florida jars look alike to the maths?** That has to be known
before deciding how a score should read (the 2026-10-07 build prompts, from
the r/FLMedicalTrees research). In the 56 accepted fixtures, 202 of the 300
flower pairs (67%) score Good or better, but the fixtures are reports
collected by hand, not a market. `scripts/score-spread.js` asks the same of
the live archive. It changes no score: `js/match-math.*.js` and
`match-golden.json` are as they were.

```
scripts/score-spread.js   four tables; reads only, as nose_writer; its maths from scripts/lib/match.js
test/analysis-test.js     its checks on PGlite: 78 checks, 56 before
```

**The probe, before any edit**, on `d06995f` - ALL GATES GREEN, 32 gates:

1. `lab-stats.js` reads `nose.latest_parses` keyed by `nose.sample_key(lab,
   lab_id, document_id)`; `samplesOf()` keeps each sample's newest document,
   refused or not, and a sample is a test fixture when any of its documents
   has a parse with context `seed`. `nose.batch_series`, which `drift.js`
   reads, keeps the newest *usable* document instead. The new script reads
   `batch_series` joined to its parse, as `drift.js` does, and takes the
   fixture flag the `lab-stats.js` way.
2. `analysis-test.js`'s `EFFECT_WORDS` has `effects?` on it, and `potency`
   and `potent`; it scans `drift.js`, `lab-stats.js`, `scripts/lib/match.js`,
   `coa-dates.js`, the two analysis migrations and `js/match-math.*.js`.
   `score-spread.js` joins that list, comments included, and its output is
   checked against it too.
3. The baseline agrees with the prompt: flower is 78 Strong and 124 Good of
   300 pairs, over the 25 flower fixtures.

**What it prints.** First, that it describes lab reports, not experiences;
then the scope and the samples - one per sample, the newest usable document
of each lab and lab ID, else of each document - and how many came from scans
and how many are test fixtures. Every table has three columns, scans,
fixtures and together, and every share is printed as `N of M (P%)`.

1. **Score spread**, per product class: every pair inside the class,
   `cosine(normalize(a), normalize(b))`, banded by `matchBand()`. Its four
   bands, names and order are read from `matchBand()` itself, by walking the
   score from 1 down to 0, so no edge is written in the script. Each band's
   count and share, and Good or better's; the median and the 10th and 90th
   percentiles, linear between ranked scores - R's default, type 7
   (https://stat.ethz.ch/R-manual/R-devel/library/stats/html/quantile.html,
   read 2026-10-14) - shown through `shownScore()`. Pairs never cross a
   class. A usable reading with no terpene `normalize()` keeps is in no
   pair, and a line says how many there are.
2. **A typical jar**, per class: for each sample, how many of the others in
   its class score Good or better against it - the median, the fewest and
   the most, each over the number of others.
3. **Dropped mass**, over the readings in scope: how many carry a
   `measuredCoverage`, its median and how many fall under 95%; how many carry
   an `unmapped` list, and each name in it by how many readings carry it,
   most first.
4. **Freshness by lab**, flower only: readings, how many print a moisture
   number and how many a water activity number, and water activity below,
   inside and above 0.55-0.65, both edges inside - the card's rule (above,
   "Water activity against ASTM D8197"). Moisture is counted, never judged.
   A reading whose lab was not recognised is listed last.

`--class flower`, `vape` or `concentrate` narrows every table to that class;
table 4 then appears only for flower. The query selects no text, address,
strain, batch or client, so none can be printed.

**The rehearsal**: the 59 fixtures saved as the seed saves them, read by
today's parser, on the PGlite stand-in - 56 usable samples, all fixtures.
Flower: 202 of 300 pairs Good or better (67%), the prompt's figure; median
81, 10th percentile 49, 90th 93; a typical flower sample has 18 of its 24
others at Good or better (fewest 4, most 21). Vape: 57 of 136 (42%), median
66. Concentrate: 28 of 55 (51%), median 79. Measured coverage: median
100.0%, 3 of 56 under 95%; no accepted fixture carries an unmapped name,
since none carries novelty (§7). Water activity on 10 of the 25 flower
readings: 5 below, 5 inside, none above, as recorded above.

**`test/analysis-test.js`**, on PGlite, in one lab no other check uses and
the only concentrate readings in its database: fixtures P and P at 3x - one
sample, kept as a seeded document and a newer scan of the same lab ID - make
one Strong pair at 100; scans Q, R and U (one sample kept as two documents,
read from the newer), a refused reading, and one carrying only THCA. Tables
1 to 3 are checked cell by cell against values worked out by hand, and table
4 on six flower readings: 0.55 and 0.65 inside, 0.54 below, 0.68 above, one
with neither number, one refused. Then every share with its denominator;
scans, fixtures and together in every table; no pair crossing a class; no
hidden strain, batch, client, text, address or fingerprint printed or
selected; the quantile, the bands, the water activity edges and the
arguments; the command line refusing without `NOSE_DB_URL` and printing its
usage for a class it does not take; and `score-spread.js` in the
no-effect-wording scan. Five broken copies each fail it: refused and
repeated documents kept, a fixture judged by its newest document alone, the
0.55 edge read as below, a rounded score, nearest-rank percentiles. The
gate's line stays `analysis clean`.

**What did not move.** `js/match-math.*.js` and `match-golden.json`; the
parser - `parse-coa.js`, `coa-dates.js`, `extract-text.js` - so no reparse is
due; `drift.js`, `lab-stats.js` and what they print; the views, the
migrations and the grants - no migration; anything B2B; every gate's
expected line. Nothing here writes.

**How it was verified, 2026-10-14, in the cloud workspace.** npm, its
mirrors and cdn.jsdelivr.net were refused, so the gates ran on stand-ins:
`pg` 8.23.0 and its dependencies from their GitHub sources at their tags
(pg-protocol transpiled from its TypeScript; `pgpass` a stub that finds no
password); PGlite 0.5.8's query and exec steps and its type rules, from its
source at that tag, over a throwaway PostgreSQL 16.15 server per instance on
a Unix socket; unpdf 1.8.0's `getDocumentProxy` and `extractTextItems` from
its source over pdfjs-dist 6.2.108's legacy build (parity 56 match / 0
differ); the committed html5-qrcode in place of `build.sh`'s download;
Playwright 1.56.1's Chromium. ALL GATES GREEN on `d06995f` before any edit,
32 gates, and on the change, 32, with `KAY-CAR-001` 4.124 and `KAY-PRR-001`
0.944 each time. Nothing ran against Supabase, Netlify or the live site. The
Codespace run on the real packages, and the run on the real archive, are the
ones that count. This record closes no "Still open" item; it adds one.

**In the Codespace and on the real archive, 2026-10-14** (US Eastern), on
`d1ffb55`: `bash scripts/gates.sh` ended ALL GATES GREEN, 32 gates, with
`KAY-CAR-001` 4.124, `KAY-PRR-001` 0.944 and `analysis clean` - the real
packages, no stand-ins. Then `node scripts/score-spread.js` and `node
scripts/score-spread.js --class flower`, read only, as `nose_writer`:

- **65 usable samples: 9 from scans, 56 test fixtures.** The scans are 6
  flower, 1 vape and 2 concentrate samples.
- **Flower: 311 of 465 pairs Good or better (67%)**, 60 of 465 (13%) Low;
  median 82, 10th percentile 49, 90th 94. The 6 scanned samples alone: 9 of
  15 pairs (60%), median 83. A typical flower sample has 23 of its 30 others
  at Good or better (fewest 6, most 26).
- **Vape: 67 of 153 (44%)**, 56 of 153 (37%) Low, median 68. **Concentrate:
  36 of 78 (46%)**, median 65; the one pair of scanned concentrates is Low,
  at 51.
- **Measured coverage**: median 100.0% (the scans' 99.7%); 3 of 65 under 95%,
  all fixtures; no reading carries an unmapped name.
- **Water activity on flower**: 13 of 31 readings print a number - Kaycha 8
  of 9, ACS 3 of 4, ACT and TerpLife 1 each - 7 below 0.55, 6 inside, none
  above. The 3 Kaycha scans: 2 below, 1 inside. Method Testing Labs prints
  neither number on any of its 8 flower reports; Modern Canna prints moisture
  on 5 of 8 and water activity on none.
- **What it says, and what it does not.** On flower, two pairs in three land
  at Good or better, so Good is what an arbitrary pair of these jars usually
  scores. The scanned part is 6 flower samples - 15 pairs, and not
  independent ones, each sample sitting in 5 - so on its own it says nothing
  yet about a market; with the fixtures, it agrees with the fixtures. How a
  score should read is the next decision, made with these numbers.

### Smell words on a vote, 2026-10-14

**A vote could say a score was wrong, not which smell it missed.** R7 in the
2026-10-07 build prompts, from the r/FLMedicalTrees research: patients judge
a jar by words like gas, fuel, funk and skunk, and a lab report measures
terpenes. Skunk aroma was traced to a family of sulfur compounds, with little
sign that terpenes make it (Oswald and colleagues, ACS Omega 2021,
https://sciencedaily.com/releases/2021/12/211201085147.htm, read 2026-10-14).
A 2023 study by the same group, on 31 rosin extracts rather than flower and
funded by one of its authors' employers, Abstrax Tech, tied citrus and
tropical notes to other sulfur compounds, savory and chemical notes to
skatole and sweet notes to esters, and found terpene profiles much alike
across cultivars that smelled very different (ACS Omega 2023,
https://pmc.ncbi.nlm.nih.gov/articles/PMC10601067/, read 2026-10-14). None of
those compounds is on a terpene panel. Now a vote can carry up to three smell
words from a fixed list, so a word beside "Didn't match" says which smell
the matching missed. No score moves: `js/match-math.*.js` and
`match-golden.json` are as they were.

```
privacy/index.html                   the sentence about votes names the words; a sixth "What changed" entry, dated
app.html                             the words' group above the two buttons: question, an empty container, a status line
js/nose.*.js                         SMELL_NOTES, chosenNotes(); wireFeedback, resetFeedback and sendFeedback
                                     (was js/nose.8c910815.js - build.sh renamed it; app.html, index.html, _redirects follow)
css/shell.*.css                      the word buttons' styles (was css/shell.918a3d5e.css - renamed; app.html,
                                     index.html and b2b/demo/index.html's <link> follow)
netlify/functions/match-feedback.js  NOTES and MAX_NOTES; notes checked, stored in list order; the record v 2
netlify/functions/feedback-read.js   the CSV's notes column, last
test/match-feedback-test.js          69 checks, 42 before; the gate's line stays "match-feedback clean"
test/input-paths-test.mjs            216 checks, 200 before; the gate's line stays "input-paths clean"
```

**The probe, before any edit**, on `37b04fe` - ALL GATES GREEN, 32 gates:

1. The app sent seven fields - `score` (`shownScore()`), `band`
   (`matchBand()[1]`), `palate`, `palateSize`, `candidate`, `ts`, `vote`;
   `match-feedback.js` stored ten - `v: 1`, vote, band, score, candidate,
   palate, palateSize, `ts`, `clientTs`, `ctx` - under
   `votes/<slug>/<vote>/<YYYY-MM-DD>/<HHMMSSmmm>-<rand>`, all four bands
   (above, "Every vote stored"). R1's test is `match-feedback-test.js`. The
   privacy page's sentence listed the score, its band, the palate's size,
   the built-in sample jars and a timestamp.
2. The block: the question, then a `role="group"` named "Was this match
   accurate?" holding two native `<button type="button">` with
   `aria-pressed`, then a hidden `role="status"` line. Plain buttons in Tab
   order, pressed by Enter or Space, with the site-wide `:focus-visible`
   ring; after a vote both are disabled.
3. The block's stylesheet, `css/shell.*.css`, is linked by `app.html`,
   `index.html` and `b2b/demo/index.html`. A new rule renames it, so
   `build.sh` rewrites that one `<link>` line on the dispensary demo page -
   the only B2B line this change moves. No B2B test names the file.

**The change.**

- **Privacy first, in the same commit.** The sentence about votes now ends
  "a timestamp, and up to three smell words you picked from a fixed list."
  The sixth "What changed" entry says what the words are for, that they are
  picked with buttons and nothing typed is sent, and that the page changed
  in the same update, dated October 14, 2026 - the day this was built, on
  the understanding it goes live that day (below, "Still open").
  `check-trust` is clean: the page names what is kept.
- **The words**, in this order (slug: label): gas: Gas or fuel, skunk:
  Skunk, savory: Savory or garlic, chemical: Chemical, sweet: Sweet, fruity:
  Fruity or tropical, hay: Hay, citrus: Citrus, earthy: Earthy, spice:
  Spice, pine: Pine, floral: Floral, herbal: Herbal. They live in two
  places: `SMELL_NOTES` in the bundle (slugs and labels) and `NOTES` in
  `match-feedback.js` (slugs). The page holds an empty container and the
  bundle draws the buttons from `SMELL_NOTES`, so the list has no third copy
  in `app.html`. The test checks the two lists match, in order.
- **The block**: above the two buttons, "What did you smell? Optional, up to
  three." names a `role="group"`; then one native toggle button per word,
  `aria-pressed`, its label never changing with its state - the WAI-ARIA
  Authoring Practices' toggle button, pressed by Space or Enter
  (https://www.w3.org/WAI/ARIA/apg/patterns/button/, read 2026-10-14). A
  pressed word shows a tick (`aria-hidden`) as well as a green border, so
  colour is not the only sign. A fourth press is refused: the word stays
  unpicked, and "Up to three. Press a word you picked to remove it." appears
  in a `role="status"` line that is on the page, empty, from the start - a
  polite live region whose content changes are announced, its role in place
  before its text (MDN, "ARIA: status role",
  https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role,
  read 2026-10-14). Unpicking a word clears the note. After a vote the words
  are disabled with the buttons, showing what was sent; a new result clears
  them, as it re-enables the buttons. Nothing in the block can be typed in.
- **The payload** adds `notes`: the chosen slugs in the list's order, `[]`
  when none. Nothing else is new.
- **`match-feedback.js`**: `notes` is optional. Present, it must be an array
  of at most three distinct slugs from `NOTES` - a string, a label, another
  case, a number, `null` or a nested list each refuse the whole vote with
  `bad-notes`, and nothing is stored. Accepted words are kept in the list's
  order, whatever order they came in. The record gains `notes`, its
  eleventh field, and becomes `v: 2`. **A vote sent without `notes` is
  stored with `null`**, not `[]`: it was never asked - a tab opened before
  this deploy keeps the old bundle until it is reloaded - which is not the
  same as asked and none picked. `ctx` does not read the words, so it still
  groups votes on the same match. The key layout, the store and anonymity
  are as they were.
- **`feedback-read.js`**: the CSV gains `notes` as its last column, so every
  other column keeps its place, space-separated like `palate`; it is empty
  for a v1 record, for `null` and for `[]` - the JSON records, returned as
  stored, tell them apart (no field, `null`, `[]`). The summary is still
  read from the keys alone.

**`test/match-feedback-test.js`** adds: `NOTES` against the prompt's list,
and `MAX_NOTES` 3; votes with two words, three words out of order and none,
each stored with eleven fields, `v` 2 and its words in list order; a vote
without `notes` stored with `null`; the key layout for votes with words;
`ctx` the same with and without words; fifteen refusals with `bad-notes` and
nothing stored - an unknown word, a fourth, a duplicate, a typed string
alone and in the list, `Gas`, a label, a bare string, `null`, an object, a
number alone and in the list, a nested list, `null` in the list,
`constructor`; no slug or label matching `analysis-test.js`'s
`EFFECT_WORDS`, read from its source, nor the prompt's list; the CSV's
header and each vote's notes cell, the JSON records' notes, the summary
from keys alone with a v1 record planted; the bundle's `SMELL_NOTES` equal
to `NOTES` and the prompt's labels; its vote on the default pair sending
`notes` `[]`, Pine then Gas sending `["gas","pine"]` and stored so, and a new
result sending `[]` again; the words' question above the buttons, the empty
container, the status line, nothing to type, the note's text, no effect
word in the block, labels and note included; the privacy sentence and the
dated entry. On HEAD's `match-feedback.js`, `feedback-read.js`, bundle,
`app.html` and privacy page it fails, each; so does each of seven broken
handlers - duplicates kept, four words taken, the order kept as sent, `[]`
for a missing field, case folded, `v` left at 1, the words in `ctx`.

**`test/input-paths-test.mjs`** adds sixteen checks in headless Chromium,
after the jars the run adds: thirteen buttons, the list's words in order,
none pressed, each a button with `tabIndex` 0; the question naming the
group; Tab walking every word in order and then Matched; Space and Enter
pressing, and pressing again unpicking; a fourth refused with the note in
the status line, cleared by unpicking one; Hay then Skunk picked, Didn't
match pressed, and the POST to `match-feedback` taken by `page.route` before
it leaves the page: its body carries exactly `["skunk","hay"]` and no new
field but `notes`, sends the run's own jars as `custom` and no name typed in
the run; the words disabled after the vote, still showing what was sent; a
new candidate clearing them. Three broken bundles each fail it - the words
sent in click order, no limit, the words left live after a vote.
`INPUT_PATHS_SHOTS` also saves the block, picked and voted.

**The strings**, shown to the owner and approved before the commit: the
privacy sentence's new ending and the sixth entry; "What did you smell?
Optional, up to three."; the thirteen labels; "Up to three. Press a word
you picked to remove it."; the tick. The effect-word list (relax, calm,
sleep, energ, focus, uplift, euphor, sedat, mood, high, buzz, stoned,
pain, anxiety, stress, treat, relief, cure) finds nothing in them; across
every line the change adds, its only hits are Playwright's `page.focus()`
in the test, which is keyboard focus.

**What did not move.** R1's bands; the key layout; the store; anonymity -
no header, cookie, account or session read; every score -
`js/match-math.*.js` and `match-golden.json`; the parser - `parse-coa.js`,
`coa-dates.js`, `extract-text.js` - so no reparse is due; the archive and
its migrations; everything B2B but the one `<link>` line `build.sh`
rewrites on its demo page; every gate's expected line, still 32 gates. The
dispensary widget's votes (`lib/b2b-votes.js`) carry no words.

**How it was verified, 2026-10-14, in the cloud workspace.** npm, its
mirrors and cdn.jsdelivr.net were refused by the egress policy, so the
gates ran on stand-ins: unpdf 1.8.0's `getDocumentProxy` and
`extractTextItems` from its source over pdfjs-dist 6.2.108's legacy build
(parity 56 match / 0 differ); PGlite 0.5.8's `base.ts`, `parse.ts`,
`types.ts` and its pg-protocol from their source at that tag, driving a
throwaway PostgreSQL 16 server per instance over a Unix socket; the
committed html5-qrcode in place of `build.sh`'s download; Playwright
1.56.0's Chromium. ALL GATES GREEN on `37b04fe` before any edit, 32 gates,
and on the change, 32, with `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944
each time. The block was looked at in Chromium at 1280 and 390 px. Nothing
ran against Netlify or the live site. The Codespace run on the real
packages is the one that counts. This record closes no "Still open" item;
it adds three.

**Live, 2026-10-14 (US Eastern).** The owner merged `smell-words` into main
as a fast-forward and pushed: GitHub's main read `fd6614c` afterwards, so
the privacy page and the feature went out in one push. The live privacy
page, read from the cloud workspace, carries the new ending of the sentence
about votes and the sixth "What changed" entry, dated October 14, 2026 - the
day it went live, so that "Still open" item is gone. The owner then opened
`/app` in a private window, pressed Gas or fuel and Skunk, then Didn't
match, and read `feedback-read`'s CSV in the Codespace with the token kept
out of the shell's history and out of the chat. Its header ends
`ctx,notes`, and the vote's row reads: `ts` 2026-10-14T20:04:09.139Z,
`clientTs` 2026-10-14T20:03:35.445Z, down, Moderate, 74, `cold-creek`, 1,
`lemon-tart`, an empty `palateTruncated`, `ctx` `c1154cc3fda2`, notes `gas
skunk` - the two words, in the list's order, as the page sent them. **That
vote is a deploy check, not a person's answer**: `feedback-read.js`'s
synthetic records comment lists it by its `ts`, beside the Moderate check
of the morning, so the second "Still open" item is gone too. Real votes to
date stay at one. The Codespace's gate run was not pasted into this
session.

### Two guides from the research, 2026-10-14

**What a lab report can't smell, and why a jar is drier than its report,
said once, in two guides.** R8 in the 2026-10-07 build prompts, from the
r/FLMedicalTrees research; it takes the place of the report's #2 line under
every bar. R1, R3, R4 and R7 were live, and the guides describe what they
built. No score moves: `js/match-math.*.js` and `match-golden.json` are as
they were.

```
learn/what-a-lab-report-cant-smell/index.html           new, Guide 05
learn/why-your-jar-is-drier-than-its-report/index.html  new, Guide 06
learn/intensity-versus-character/index.html  "Why a cutoff per terpene misleads", an In short line, pager next -> 05
learn/how-to-read-a-coa/index.html           step 6 links Guide 06; ASTM D8197-21 -> D8197-22; pager prev -> 06
learn/index.html                             two cards, two hasPart entries
methodology/index.html                       two limitations link the guides; the enjoyment sentence reworded; dateModified added (it had none)
sitemap.xml                                  the two guides; lastmod 2026-10-14 on learn/, the two changed guides, methodology
js/nose.*.js                                 AW_RANGE, waterActivityLink(); the row renderer takes a link
                                             (was js/nose.489f8bb3.js - build.sh renamed it; app.html, index.html, _redirects follow)
test/input-paths-test.mjs                    229 checks, 216 before; the gate's line stays "input-paths clean"
```

**The probe, before any edit**, on `d42608a` - ALL GATES GREEN, 32 gates:

1. `learn/how-to-read-a-coa/`: canonical and `og:url` on
   `https://nose-app.com/...`, Article JSON-LD with `datePublished`,
   `dateModified` and a `citation` list, BreadcrumbList, a "Guide 01" eyebrow
   and meta line (read time, sources, last reviewed), `section.keypoints`,
   made-up example values labelled as such, numbered sources with
   `id="src-…"`, a pager cycling the guides. `learn/index.html` lists cards
   and a `hasPart` list; the sitemap one `<url>` per guide.
2. The method page's four limitations, as the prompt quotes them; step 6 and
   the other guides give Milay as "under every condition tested, on average
   by more than half within four months". The method page's JSON-LD had no
   `dateModified` - one is added.
3. `waterActivityText()`, `reportDateRow()` and `AGE_NOTE`, `SMELL_NOTES` and
   the question "Did the smell and taste match the score?" as recorded above;
   `input-paths-test.mjs` reads a row by `textContent`, so a link inside it
   leaves the text the test compares unchanged.

**What the sources say, read 2026-10-14**, and where the prompt was not
followed:

- Oswald et al. 2023 (https://pmc.ncbi.nlm.nih.gov/articles/PMC10601067/):
  31 ice hash rosin samples; tropical and citrus notes in some cultivars
  tied to 3-mercaptohexyl sulfur compounds, savory or chemical to
  **skatole**, sweet to esters, the gassy note mainly to the prenylated
  sulfur family; terpene profiles very similar across very different aromas.
  **Indole** turned up widely at low levels and the authors took it as part
  of the general cannabis smell, so the guide does not credit it with
  savory notes, as the prompt asked. 9 of 14 authors are at a company that
  sells terpene flavor blends (Food Business News, 2020-02-21,
  https://www.foodbusinessnews.net/articles/15462-abstrax-tech-debuts-functional-terpene-flavor-blends),
  which funded the work; eight authors have filed patents on the results.
  The guide names neither company nor cultivar.
- Oswald et al. 2021, through the ACS release on ScienceDaily
  (https://sciencedaily.com/releases/2021/12/211201085147.htm): skunk tied
  to prenylated volatile sulfur compounds, one most abundant in the samples
  judged most pungent; little evidence terpenes give that smell.
- "No lab measures gas" became "the reports NOSE reads don't measure it":
  the studies' own labs did. None of the 59 fixtures' extracted texts names
  a thiol, a mercapto compound, skatole, an ester or sulfur; the only
  "Indole" is Indole-3 Butyric Acid on two pesticide panels.
- ASTM D8197-22 (https://store.astm.org/d8197-22.html): active; D8197-21
  marked historical. Its summary gives the lower edge as less breakage in
  handling and storage - the guide says so beside the upper edge's mold.
  ASTM's piece (https://sn.astm.org/node/2445/printable/print): above 0.65,
  a risk of microorganism growth; below **0.50**, terpenes dry out and taste
  and smell weaken; water activity reads the free water. The guide says that
  figure is 0.50, not 0.55, and that neither source covers the gap.
- Milay et al. 2020 (frontiersin.org): the "more than 50%" is an average
  ratio across compounds and conditions at four months - the guide says so.
- Hazekamp 2016: doi.org refused with a rate limit; read at
  https://www.frontiersin.org/articles/10.3389/fphar.2016.00108/full. Four
  dried flower varieties, gamma-irradiated; some terpenes fell, the profile
  stayed qualitatively the same; the author works for the company that
  supplied the flower, which the guide says.

**The guides.** Each has an In short box, made-up values labelled as made
up, every score through `scripts/lib/match.js` (the page says so), research
linked and paraphrased with no quotation, and no product, brand, dispensary
or Reddit name.

- **Guide 05**: Jars D and E, nearly one mix, 99 · Close match; Jars F and G,
  different mixes, 46 · Different profile - then a gassy note supposed on
  one, or on both, that neither report shows. Matching should hold best
  where terpenes lead and miss most for gas, savory and sweet, in either
  direction - written as an expectation the votes test, not a finding. No
  Gas family: an estimate drawn on the bar would look like a measurement.
  The vote's question and the thirteen words as `SMELL_NOTES` has them;
  nothing typed; the privacy page linked for what a vote keeps.
- **Guide 06**: Reports X (12.8%, 0.53, below) and Y (10.4%, 0.61, inside);
  the range and its two edges; Pass-only reports and numbers on a later
  page, both read as "no number on this report"; the report as a snapshot,
  Milay and Hazekamp as above, no storage advice; what the card shows - the
  water activity verdict, moisture with no verdict, the harvest or report day
  and how long ago when NOSE can read one (it does not read a test day yet),
  none of it touching the score.
- **The cutoff section**: Jar A and Jar B from the top of the page against
  0.5% - none over against three, shares 40/30/20/10 in both, scored 100.

**The card's link.** The words the Water activity row already shows link to
Guide 06: `ASTM D8197's 0.55–⁠0.65 range for dried flower` when a number
shows (`AW_RANGE`, the same string `waterActivityText()` builds from),
`no number on this report` when none. The row is built as text, the link and
text again, so its `textContent` is exactly what it was; Moisture's
`no number on this report` stays plain. `target="_blank"`, so a card not yet
added is not lost, and `rel="noopener"`, which leaves the new page no
`window.opener` (MDN, "rel=noopener",
https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/noopener,
read 2026-10-14; MDN adds that `_blank` implies it). The link takes the
card's base `a { color: inherit }` and the browser's underline: no
stylesheet changed, so no CSS file was renamed.

**`test/input-paths-test.mjs`** adds thirteen checks: the guide served at
its path with its heading; then on each of the six freshness cards, the
Water activity row's one link - its `href`, `target="_blank"`,
`rel="noopener"` and its words - and that it is the card's only link, with
none in Moisture. The row's text is the check that was already there. On
HEAD's bundle and pages the thirteen fail and the other 216 pass; three
broken bundles each fail it - the link in the same tab (6), no `rel` (6),
words added to the row (9). With the change, 229 of 229.

**The method page's last limitation** stated as fact what is still open
for enjoyment, the question the votes test. Proposed and, at the owner's
word, changed: "Similarity does not predict medical benefit, impairment, or
subjective effect. Whether it predicts enjoyment is still an open question,
and the thumbs up and down on every result are there to test it." The rest
of the sentence stays as firm as it was.

**The strings**, shown to the owner and approved before the commit: both
guides, the section, the In short line, the step 6 sentence, the two cards,
the D8197-22 source, the method page's reworded limitation. The effect-word list (relax, calm, sleep, energ, focus,
uplift, euphor, sedat, mood, high, buzz, stoned, pain, anxiety, stress,
treat, relief, cure) finds one hit across every new word: "Two readings help
you judge the cure.", step 6's existing sentence, in the paragraph that
gained one - a plain use. "Irradiated" stands where "treated" would have hit.

**What did not move.** Every other page, but for the bundle's file name on
`app.html` and `index.html`, which `build.sh` rewrites; every card row's
text; `js/match-math.*.js` and `match-golden.json`; the parser -
`parse-coa.js`, `coa-dates.js`, `extract-text.js` - so no reparse is due;
`check-trust`'s patterns; the CSP and the no-inline-script rule; anything
B2B; every gate's expected line, still 32 gates.

**How it was verified, 2026-10-14, in the cloud workspace.** npm was
refused by the egress policy, so the gates ran on stand-ins: unpdf 1.8.0's
`getDocumentProxy` and `extractTextItems` from its source over pdfjs-dist
6.2.108's legacy build (parity 56 match / 0 differ); `pg` 8.23.0 and its
dependencies from their GitHub sources at the locked versions (pg-protocol
1.16.0 transpiled; `pgpass` a stub); PGlite 0.5.8's `base.ts`, `parse.ts`,
`types.ts`, `templating.ts` and `errors.ts` over a throwaway PostgreSQL 16
cluster per instance on a Unix socket; the committed html5-qrcode in place
of `build.sh`'s download; Playwright 1.56.0's Chromium. ALL GATES GREEN on
`d42608a` before any edit, 32 gates, and on the change, 32, with
`KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944 each time. Every new or changed
page was looked at in Chromium at 390 and 1280 px under the site's CSP: no
console error, no sideways scroll; the card at both widths. Nothing ran
against Netlify or the live site. The Codespace run on the real packages is
the one that counts. This record closes two "Still open" items -
how-to-read-a-coa's D8197-21 link, and the card's water activity row linking
to a new article (called R5 there; it is R8) - and adds three.

### When the lab finished, 2026-10-14

Prompt 7 of the 2026-09-23 review: **most reports could not be placed in
time.** `batch_series` dated a sample by its harvest day, else its report day,
and only 20 of the 56 accepted fixtures carried either - Kaycha 16 of 22, ACS
3 of 8, TerpLife 1 of 1, and none of Modern Canna's 13, Method's 9 or ACT's 3.
Every one of those labs prints when it finished. Prompt 2 had guessed the
report-date labels (`Report Date`, `Date Reported`, `Date of Analysis`),
which read on two documents; this time they were measured first.

**Built 2026-10-05, landed 2026-10-14.** The work was done on `c337c70` as
`6ab60ad` and handed over as a git bundle, which never reached main; main
went on 30 commits without it (B2B, R1 to R8). On 2026-10-14 it was brought
onto `18520cc` unchanged but for three things: this record, the counts
below, and the migration's name. `20261005150000_nose_tested_on.sql` became
**`20261015000000_nose_tested_on.sql`**: the real project has applied
`20261008020000` and `20261008150000` since, and `supabase db push` refuses a
local migration that sorts before the last one applied ("Found local
migration files to be inserted before the last migration on remote
database"; `--include-all` would push it anyway - CLI reference,
https://supabase.com/docs/reference/cli/supabase-db-push, read 2026-10-14).
A later name needs no flag. Only this file conflicted; `probe-db.js` and
`analysis-test.js` merged on their own.

- **The probe, before any edit**, on `c337c70` and again on `18520cc`:
  `test/date-probe.js` (kept; read-only, not a gate) printed, for every
  accepted fixture, the lab, `harvestDate`, `reportDate`, `harvestOn`,
  `reportOn`, and every line whose label ends in `Date:`, `Completed:` or
  `Created:` with the line after it. Both runs said `dated: 20 of 56`, split
  as above, and their fixture-by-fixture tables are identical: neither the
  parser nor the corpus changed between them. The row that says when each
  lab finished - every repeat of it inside a file agreeing with the first:

  | Lab | Row | Fixtures | As printed |
  |---|---|---|---|
  | Kaycha | `Completed:`, value on the next line | 22 of 22 | `07/11/25` |
  | Modern Canna | `Completed:`, value on the next line | 13 of 13 | `11/27/24 09:40` |
  | ACS | `Completion Date:`, value on the next line | 8 of 8 | `2026-06-24` |
  | ACT | `Report Created:`, inline; on LAB-0425BSWS the label wraps after "Report" | 3 of 3 | `02/13/2025 18:18` |
  | Method | no completion row: `Batch Date:` (inline on 8; on the ninth apart from its value), and an unlabelled sign-off on the line after "<name> - Lab Director" | sign-off 8 of 9 | `2/27/2025, 5:00:00 AM`; `3/3/2025, 7:11:00 PM` |
  | TerpLife | `Date Reported:`, already read as `reportDate` | 1 of 1 | `11/17/2025` |

- **The labels** - `FINISHED` and `finishedOn()` in `parse-coa.js`, each
  named in its comment (§7, `testedOn`): Kaycha and Modern Canna
  `Completed:`, ACS `Completion Date:`, ACT `Report Created:`, read also
  when it wraps - a line ending "Report", the next starting "Created:" - which
  is LAB-0425BSWS's layout, not another label. Colon labels only: Modern
  Canna's summary prints a bare "Completed" status tile, and with the colon
  taken off its header row nothing is read (`coa-dates-test`). A report
  revised later keeps its completion day: KAY-FLW-003 completed 10/19/24 and
  was revised 10/22/24, and `testedOn` is 2024-10-19.
- **Method: the sign-off, not "Batch Date".** `testedOn` is when the lab
  finished, and the sign-off is the only Method row that says so - the lab
  director's dated signature, the same event as the other labs' completion
  rows. "Batch Date" sits with `Batch Client #`, `Seed to Sale #` and
  `Lot ID`: the batch's date, not the lab's, 3 to 5 days before the sign-off
  on all 8 fixtures; on the older layout it is the sampling day. The
  sign-off has no label, so it is read only from the line straight after one
  ending " - Lab Director", and only as a whole date `lib/coa-dates.js`
  reads; anything else on that line is null, and no later date stands in.
  The parser never reads or keeps the name on the director's line. One
  caveat: **Method prints its times in UTC.** Every batch date is midnight
  Eastern, printed 4:00 or 5:00 AM by the season, so a sign-off after 8 PM
  Eastern (7 PM in winter) prints the next day. On the 8 fixtures the
  sign-offs fall between 2:47 and 9:46 PM UTC - the same day either way.
  Method's older layout (Method_DulceDeUva) prints its labels apart from
  their values and has no sign-off date: undated, as before.
- **Method prints no harvest date** on any current-layout fixture, nor on the
  saved portal pages (`test/fixtures/pages`), through both extractors and
  on the rendered page - including the three signed in August 2026, after
  rule 64-4.311 took effect on 2026-05-28. So the day the lab finished is the
  only date a Method jar can carry today. Two tempting stand-ins are refused
  on purpose: "Batch Date" (above), and the six digits in some clients'
  seed-to-sale codes (`FLORA-40-F-121924-FF`), which are the client's own
  unlabelled naming - a guess, however plausible.
- **TerpLife: no `testedOn` row.** Its finish row is "Date Reported:", which
  the parser already reads as `reportDate`; one row is not read into two
  fields, so its batches stay dated by `report_on`. Green Scientific (no
  working sample) and an unrecognised lab: none either.
- **`lib/coa-dates.js`**: a one-digit month or day in the slashed forms, and a
  time of day after any form (§7). Day-first, dotted and future dates are
  still null - a day-first date whose day is over 12 has no month to be, and
  one whose day is 12 or less still reads month-first, as before: that is
  what "from a US lab" means. No printed harvest or report date in the
  corpus reads differently.
- **What moved, all 59 fixtures parsed before and after, every field
  compared:** `testedOn`, new on all 59 - a day on 54, null on
  Method_DulceDeUva, TerpLife and the three refusals - and nothing else.
  Every terpene value, total, verdict, reason, warning, `readBy`, class,
  freshness figure, `harvestOn` and `reportOn` is the same. Dated accepted
  fixtures: **20 of 56 became 55 of 56** - Kaycha 22, Modern Canna 13, ACS 8,
  ACT 3, Method 8 of 9, TerpLife 1. This change does not send `testedOn` -
  every reply and the card stay as they were; the next record, "The Tested
  row on the card", sends it. B2B is unchanged too:
  `b2b-store.js` keeps the parser's fields by name, `testedOn` is not among
  them, and `b2b.batch_reads` has no column for it (below, "Still open").
- **The migration**, `20261015000000_nose_tested_on.sql`: `parses.tested_on`,
  generated from `output->'testedOn'` exactly as `harvest_on` and
  `report_on` are (an ISO day or NULL); `latest_parses` re-created with
  `tested_on` added last; `batch_series` re-created with `batch_date =
  coalesce(harvest_on, tested_on, report_on)` and `batch_date_from` added
  last. CREATE OR REPLACE keeps both views' grants (re-stated anyway);
  `nose_writer` gets nothing new, `nose_b2b` nothing at all, and the
  generated column calls no function, so no EXECUTE grant is needed. Adding
  a stored generated column rewrites `nose.parses` once, under a lock held
  for as long as a few hundred rows take. No B2B object reads either view.
- **`drift.js`** reads `batch_date_from` instead of working the kind out
  again, prints `harvest`, `tested` or `report`, and its note names
  whichever kinds a series mixes. **`probe-db.js`** checks the migration is
  pushed: `parses.tested_on`, `latest_parses.tested_on` and
  `batch_series.batch_date_from`, as `nose_writer` sees them.
- **The tests.** `coa-dates-test` 48 checks (was 25): the new forms and the
  near misses around them, `testedOn` on all 59 pinned, the rule behind each
  lab's row on its own fixture changed in one place (the tile, the wrap, the
  sign-off without its director line, the first row with a value, one row
  per lab), and every other field identical without `coa-dates.js`. Against
  main's own code it fails 21. `analysis-test` 83 (was 78): the three-way
  fallback and `batch_date_from`, a printed `testedOn` left NULL,
  `latest_parses`' new last column, ACS-FLW-002 still dated by its harvest
  day, MTL-FLW-002 dated by its sign-off, drift's `tested` label and both
  notes; without the migration it stops at the missing column. `store-test`
  114 (was 111): `tested_on` keeps an ISO `testedOn` and leaves a printed or
  non-string one NULL, and KAY-CAR-001's real harvest and finish days come
  through the columns; without the migration it stops at the missing
  column. No gate's expected line changed.
- **One B2B check changed its wording, not what it guards.**
  `b2b-catalog-test` asserted that `20261008150000_nose_b2b_read_source.sql`
  "sorts last", which any later migration breaks - this one did. It now
  asserts that it sorts straight after `20261008020000_nose_b2b.sql` and is
  byte-identical to its first push, as `b2b-store-test`'s own ordering check
  already does without "last". It still fails on a migration slipped
  between the two and on an edited pushed file (both tried), passes on
  `18520cc`'s tree, and keeps its 81 checks and `b2b-catalog clean`.
- **Rehearsed on a local copy of the seeded archive** (the 59 fixtures read
  by `18520cc`, every migration on main applied, PostgreSQL 16, as
  `nose_writer`): `reparse.js --dry-run` said `59 documents: 0 unchanged /
  59 values changed / 0 accepted→rejected / 0 rejected→accepted / 0 failed`,
  each by `also changed: testedOn (new)` alone. The migration then applied
  after the two B2B ones; `batch_series` held 19 harvest, 1 report and 36
  undated. A real run of the change committed said the same counts, a second
  run `59 unchanged`, and `batch_series` then held 19 harvest, 35 tested, 1
  report and 1 undated - every lab's batches dated but Method_DulceDeUva's.
  `probe-db.js` passed every archive, view, grant and B2B check, the new one
  and "nose_b2b holds nothing in schema nose" among them, failing only the
  four a local database cannot meet (pooler user, host and port; Enforce
  SSL). `review-queue.js`: 0 to look at; `archive-health.js` ok;
  `score-spread.js` and `lab-stats.js` ran as before; `drift.js "Grease
  Monkey"` as in "The analysis layer" above.
- **Privacy.** Nothing new is collected: `testedOn` is a day the laboratory
  printed on its own report, read from text the archive has kept in full
  since 2026-09-22, and the privacy page's list of what the parser finds
  already names "the date the laboratory reported", which is what it is. The
  page is unchanged; `check-trust` clean.
- **How it was verified, 2026-10-14, in the cloud workspace.** npm was
  blocked there (the registry answered 403), so as in earlier sessions the
  gates ran on stand-ins: pdfjs-dist 6.2.108's legacy build behind unpdf's
  two calls (the extractor stamp came out `2e793bebe82a`, the real one), a
  throwaway PostgreSQL 16 cluster behind PGlite's API, the committed
  html5-qrcode in place of `build.sh`'s download, and Playwright 1.56.0's
  Chromium; the rehearsal used a `pg` over the same wire protocol (without
  TLS) and a folder for Blobs. ALL GATES GREEN on `18520cc` before any edit,
  32 gates, and on the change, 32, with `KAY-CAR-001` 4.124 and `KAY-PRR-001`
  0.944; the mutation harness still 35. No file in `js/` changed, so
  `build.sh` renamed nothing. The Codespace run on the real packages and the
  real archive is the one that counts.
- **In the Codespace, in this order:**
  1. `bash scripts/gates.sh` - ALL GATES GREEN.
  2. `node scripts/reparse.js --dry-run` - every document `also changed:
     testedOn (new)` and nothing else; the last line `0 unchanged / N values
     changed / 0 accepted→rejected / 0 rejected→accepted / 0 failed`.
     Anything else: stop and bring the lines.
  3. `npx supabase db push --db-url "$NOSE_DB_ADMIN_URL"` - one migration,
     `20261015000000_nose_tested_on.sql` - then `node scripts/probe-db.js`:
     probe clean, the tested_on check among it.
  4. `node scripts/reparse.js` - the same counts, written; then once more -
     every document unchanged.
  5. `git push` - deploys. Then "After a deploy", below, and the next
     record's check: one Method jar scanned on the live site.

### The Tested row on the card, 2026-10-14

**A Method jar's card showed no date at all.** The card's date row (above,
"Harvest date and age on the card") showed the harvest day, else the report
day, and left room for `testedOn`. With the parser reading it (above, "When
the lab finished"), the row now shows the harvest day, else **the day the lab
finished**, else the report day.

```
netlify/functions/coa.js     the usable reply adds testedOn, between harvestOn and reportOn (s7)
js/nose.*.js                 reportDateRow(): Harvested, else Tested, else Report dated
                             (was js/nose.289536d5.js - build.sh renamed it; app.html, index.html, _redirects follow)
test/input-paths-test.mjs    the date cases: 260 checks, 229 before
```

- **The row**, straight after Batch, as before: `Harvested` with
  `harvestOn`; else **`Tested`** with `testedOn`; else `Report dated` with
  `reportOn`; else no row. The value and the note under it are R4's, unchanged:
  `Aug 31, 2026 · 44 days ago`, and "A report describes the jar on test
  day...". `Tested` is the word R4's prompt named for this row; shown to the
  owner on a Method card and approved before the commit, and the
  effect-word list finds nothing in it.
- **What it changes on the fixtures:** a date row on 55 of the 56 accepted
  fixtures, where 20 had one - every Modern Canna, ACT and Method report
  but Method_DulceDeUva now shows `Tested`, and so do the Kaycha and ACS
  reports that print no harvest day. A harvest day still wins wherever one
  is printed, and TerpLife keeps `Report dated`.
- **`test/input-paths-test.mjs`**, on the frozen clock of R4 (22:30 on
  2026-10-14 in New York): the handler's replies now carry `testedOn` too,
  checked on five fixtures; the cards for MTL-FLW-002 (`Tested`, `Aug 31,
  2026 · 44 days ago`) and MCL-FLW-001 (`Tested`, `Nov 8, 2024 · 705 days
  ago`, the "no date" case until now), every row written out; KAY-FLW-001
  still `Harvested` though it carries a finish day; TerpLife still `Report
  dated`; no row on Method_DulceDeUva_flower, the one accepted fixture with
  no readable day; and MTL-FLW-002's real reply with a report day set as
  well, still `Tested`. 260 checks, 229 before. On the parser commit alone
  (`coa.js` and the bundle unchanged) it fails 10 - the five replies and the
  five Tested cards - and passes the other 250. `INPUT_PATHS_SHOTS` saves the
  new cards as `date …` like the others.
- **What did not move.** The parser and the archive (this change reads
  nothing new); every other row of the card; `js/match-math.*.js` and
  `match-golden.json`; B2B - the widget shows no dates and reads none of this
  file; every gate's expected line.
- **How it was verified, 2026-10-14, in the cloud workspace**, on the stand-ins
  of the record above: ALL GATES GREEN, 32 gates, `KAY-CAR-001` 4.124 and
  `KAY-PRR-001` 0.944; the cards looked at in headless Chromium under the
  site's CSP. The Codespace run on the real packages is the one that counts.
- **After the deploy:** scan one Method jar on the live site. Its card shows
  `Tested`, the day its lab director signed it, and how long ago - unless the
  report is in Method's older layout, which shows no date row.

**In the Codespace and live, 2026-10-14 (US Eastern)**, on `bd4110f`, pulled
from a git bundle (`18520cc..bd4110f`, a fast-forward), every step as written
in "When the lab finished":

- `bash scripts/gates.sh`: ALL GATES GREEN, 32 gates, on the real packages -
  no stand-ins - with `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944. The first
  run's pasted output stopped after `b2b widget`; a second run showed
  `b2b kit` clean and the line.
- `reparse.js --dry-run`: `68 documents: 0 unchanged / 68 values changed / 0
  accepted→rejected / 0 rejected→accepted / 0 failed`, each by `also changed:
  testedOn (new)` alone - checked by a one-line `awk` filter that counts any
  other kind of line, and it counted none.
- `npx supabase db push --db-url "$NOSE_DB_ADMIN_URL"` (CLI 2.121.0):
  `--dry-run` listed `20261015000000_nose_tested_on.sql` alone; then it was
  applied. `probe-db.js`: probe clean - "the tested_on migration is pushed"
  among it, every B2B audit, Enforce SSL on; the Data API checks skipped, no
  `NOSE_PUBLISHABLE_KEY`.
- `reparse.js`: run #20, parser `bd4110f`, 68 documents - `0 unchanged / 68
  values changed / 0 accepted→rejected / 0 rejected→accepted / 0 failed`,
  every one by `testedOn (new)` alone, with `usable`, `readBy` and
  `totalTerpenes` the same before and after on all 68. Run #21: `68
  unchanged`.
- `git push`, `18520cc..bd4110f`, deployed. The live site serves
  `js/nose.d7c4872c.js`, whose `reportDateRow()` carries the Tested row -
  checked from the cloud workspace - and the owner read a Method report on
  the live site: its card showed `Tested`, the day, and how long ago.
- **The real archive's batches, by kind** - a read-only count of
  `nose.batch_series` as `nose_writer`, counts only: 65 usable batches, one
  per sample. The 56 test fixtures as rehearsed - harvest 19, tested 35,
  report 1, undated 1 - and the 9 from scans all dated: harvest 5, tested 4.
  By lab: ACS 8 of 8, ACT 3 of 3, Kaycha 27 of 27, Method 12 of 13, Modern
  Canna 13 of 13, TerpLife 1 of 1. The four scans dated `tested` are the
  archive's four Method scans, undated until this run; the one undated batch
  is Method_DulceDeUva. 64 of the 65 are dated; by harvest and report days
  alone, as before this change, 25 were.
- `archive-health.js`: ok, 1 note - 68 documents, 68 extractions, 263
  parses; 12.8 MB of the free plan's 500 MB, the archive's own tables 1.1 MB
  of it; 66 PDFs, 50.9 MB; the two documents without a PDF are the expected
  #3 and #184.

### npm audit, 2026-10-15

`npm audit --omit=dev` in the Codespace, on `94e7c6a`: two high advisories,
both in packages that `@netlify/blobs` 10.7.11 pulls in through
`@netlify/dev-utils` 4.4.7, its local test server:

- `@fastify/busboy` 3.2.0, through `@whatwg-node/server` and
  `@whatwg-node/node-fetch`: GHSA-xjh9-v7x6-24jw, GHSA-x8mw-p69m-v3mx,
  GHSA-gxm5-99cw-xjw9.
- `image-size` 2.0.2: GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr.

Neither reached a deployed function. The functions import `@netlify/blobs`
itself, whose built `dist/main.js` and its one chunk import only
`@netlify/runtime-utils` and `@netlify/otel`; only `dist/server.js` -
`@netlify/blobs/server`, the local Blobs server - imports
`@netlify/dev-utils`, and nothing in this repo imports that (read on
unpkg, https://unpkg.com/@netlify/blobs@10.7.11/dist/, 2026-10-15).
esbuild bundles what is imported, so neither package was in a function.

`npm audit fix`, without `--force`: both moved to patched versions inside
the ranges their parents already allowed. Only `package-lock.json` changed,
7 lines each way; `package.json`, `unpdf` and `pg` did not, so
`extractorVersion` is unchanged and no reparse is due. `npm audit
--omit=dev` then: found 0 vulnerabilities. Like `npm ci`, `npm audit fix`
removed Playwright (installed `--no-save`, §5), so the three browser gates
failed until it was installed again; then ALL GATES GREEN.

The same day's security audit, read only, is the project document
`claude/nose-security-audit-2026-10-15.md`; its other findings are not yet
in this file.

### Strict mode in the app bundle, 2026-10-15

**`js/nose.*.js` ran in sloppy mode.** Its `'use strict'` sat at line 51,
after the DOM helpers, the error reporter and `step()`, so it was an ordinary
statement, not a directive, and none of the bundle ran in strict mode. MDN
puts the exact statement "before any other statements" of a script or a
function body (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode,
read 2026-10-15). Found by the architecture review of 2026-10-15 (project
document `claude/nose-architecture-review-2026-10-15.md`); the first of its
extra-small cleanups.

```
js/nose.*.js    'use strict'; is the first statement inside the opening (() => {, line 51 is gone
                (was js/nose.d7c4872c.js - build.sh renamed it; app.html, index.html, _redirects follow)
```

- **What it changes:** an assignment to a mistyped name, or a write to a
  frozen or read-only property, now throws instead of passing silently
  (MDN, the same page). Inside a `step()` that feature is skipped with
  `[NOSE] <step> skipped` and `__noseReport` sends it; anywhere else the
  bundle's `error` listener sends it. The wrapper is an arrow function with
  no parameters, so the directive is allowed there (MDN: not in a function
  with rest, default or destructured parameters).
- **The probe, before the edit.** 1: one `'use strict'`, line 51. 2: a copy
  with `var __strictProbe = 010;` after it passed `node --check`. 3: a copy
  with the line moved to the top and the same octal line failed, "Octal
  literals are not allowed in strict mode." 4: ESLint 10.1.0, `no-undef`,
  with the browser's globals read from headless Chromium (the `globals`
  package was not at hand), found 7 - every one a read of `Html5Qrcode` (4)
  or `Html5QrcodeSupportedFormats` (3), at lines 343, 695, 716 and 784. They
  are the two top-level `var`s of `vendor/html5-qrcode.min.js`, which
  `app.html` loads before the bundle, and strict mode changes an assignment
  to an undeclared name, not a read. With those two declared: 0 findings,
  and a misspelling planted as a control still found. The prompt expected 0,
  so the work stopped there; the owner said to go on.
- **Also checked:** the bundle writes nothing into `NoseMatch` or `NoseBar`,
  both `Object.freeze`d; `this` appears only in comments and strings; no
  `arguments`, `delete` or `with`.
- **After the edit:** probe step 2 run on `js/nose.2280eec5.js` fails `node
  --check` with the octal error. `git diff -M` on the renamed file: one line
  added, one removed. Nothing else was renamed - `js/match-math`,
  `js/aroma-bar` and every other `js/` and `css/` file keep their hashes.
- **What did not move.** Every other line of the bundle; `js/match-math.*.js`
  and `match-golden.json`; every score, band and card; widget release 1,
  which does not hold this bundle; the parser, the archive and B2B; what
  NOSE keeps or sends, so the privacy page; every gate's expected line.
- **How it was verified, 2026-10-15, in the cloud workspace**, where npm's
  registry and jsDelivr were both refused: unpdf stood in for by its two
  calls over pdfjs-dist 6.2.108 (parity still `56 match / 0 differ`), and
  `build.sh`'s download by the committed `vendor/html5-qrcode.min.js`. 22 of
  the 32 gates green before and after, with `KAY-CAR-001` 4.124 and
  `KAY-PRR-001` 0.944 - match maths, match feedback, b2b coverage, build,
  b2b release, input paths, b2b widget and b2b kit among them. The other 10
  need PGlite, which could not be installed; none of them reads `js/nose`.
  The home page and `/app` in headless Chromium, before and after: the home
  page reads 74 · Partial overlap, both draw their bars, and neither logs an
  error or a "skipped" line or sends an error report. The Codespace run on
  the real packages is the one that counts.
- **After the deploy:** the home page and `/app` read 74 · Partial overlap
  and draw their bars; each page's console shows no error and no `[NOSE] …
  skipped` line; one sample jar added on `/app` shows its match.

### Leftovers at the repository root, 2026-10-15

**Four files at the root were neither the site nor its config.** Netlify
publishes the whole root (`publish = "."`), so a file left there is served
unless `_redirects` forces it to 404. The second of the architecture review's
extra-small cleanups (project document
`claude/nose-architecture-review-2026-10-15.md`).

```
brand-eq.css              deleted - linked from no page; every rule of it is css/shell.*.css's
                          "Equalizer wordmark" block; it was served at /brand-eq.css
setup.sh                  deleted - unzipped an uploaded archive into the folder, from before git
verify-manifest.sh     -> scripts/verify-manifest.sh   its usage line only
dump-ordering.js       -> test/dump-ordering.js        its requires one folder up, its usage lines
_redirects                the forced 404s for /setup.sh, /verify-manifest.sh, /dump-ordering.js gone
docs/LAUNCH-CHECKLIST.md  item 2: bash scripts/verify-manifest.sh .
```

- **The probe, before the edit.** 1: `git grep`, this file aside -
  `brand-eq` named nowhere; `setup.sh` in `_redirects` and itself;
  `verify-manifest` in `_redirects`, `setup.sh`, `docs/LAUNCH-CHECKLIST.md`
  line 31 and itself; `dump-ordering` in `_redirects` and itself. 2: comments
  and whitespace stripped, every rule of `brand-eq.css` is in
  `css/shell.d038fe79.css`. 3: the live `/brand-eq.css` served that
  stylesheet, read through WebFetch; this workspace's shell cannot reach
  nose-app.com, so the 200 itself is the Codespace's curl. 4: `bash
  verify-manifest.sh .` ended `55 present, 0 missing, 18 warnings` and
  `Manifest complete — safe to run: bash build.sh`; `node dump-ordering.js
  test/fixtures/pdf/KAY-CAR-001.pdf` read Kaycha Labs, vape, row, usable,
  4.124, coverage 0.8935499515033949, no reasons.
- **After the edit** both tools, run from the root as `bash
  scripts/verify-manifest.sh .` and `node test/dump-ordering.js …`, print
  what they printed before, every line (the whole output diffed, not only the
  tails). `verify-manifest.sh` changes into the folder it is given, so where
  it lives moves nothing it checks; `require` resolves from the file's own
  folder, hence `../netlify/functions/lib/`.
- **How Netlify treats the paths** (read 2026-10-15): a rule does not shadow
  a file that exists unless it ends in `!`, for a splat as for a single path
  (https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/,
  "Shadowing"); a splat matches anything that follows it, nested paths
  included, and a `404.html` is shown for any path that resolves to no file,
  with no rule needed
  (https://docs.netlify.com/manage/routing/redirects/redirect-options/). So
  the moved two stay 404 under `/scripts/*` and `/test/*`, both forced, and
  `/brand-eq.css`, with neither file nor rule, gets `404.html`.
- **The guards' counts moved, not their verdicts.** `check-published.js`: 72
  published files, blocked 7 dirs + 8 files before; 71, and 7 + 5, after -
  `brand-eq.css` no longer published, three file rules gone.
  `check-trust.mjs`: 72 to 71 published, 272 to 270 in git. Both pass, before
  and after.
- **What did not move.** `css/shell.d038fe79.css` and every other `js/` and
  `css/` file, so `build.sh` renamed nothing; every page; what the two tools
  print; every gate's expected line; the parser, the maths, the archive and
  B2B; what NOSE keeps or sends, so the privacy page. The root's tracked files
  go from 21 to 17.
- **How it was verified, 2026-10-15, in the cloud workspace**, where npm's
  registry, jsDelivr and nose-app.com were all refused: unpdf stood in for by
  its two calls over pdfjs-dist 6.2.108 (parity still `56 match / 0 differ`),
  `build.sh`'s download by the committed `vendor/html5-qrcode.min.js`, and
  Playwright 1.56.0 with its Chromium from the workspace. 22 of the 32 gates
  green before and after, with `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944.
  The other 10 need PGlite, which could not be installed; none of them names
  the four files, `_redirects` or the checklist, and the one that runs a guard
  on the real tree, `b2b-store`, asks only that `check-published.js` pass,
  which it does. The Codespace run on the real packages is the one that
  counts.
- **After the deploy:** `curl -s -o /dev/null -w '%{http_code}\n'
  https://nose-app.com/brand-eq.css` answers 404.

### The QR library, committed and pinned, 2026-10-15

**`build.sh` downloaded html5-qrcode on every build and checked only that
the file was not empty.** It fetched 2.3.8 from jsDelivr over the committed
`vendor/html5-qrcode.min.js`, so whatever jsDelivr served that minute was
what the page holding camera permission ran (security audit #11, project
document `claude/nose-security-audit-2026-10-15.md`). Three places said the
library was never committed; it was. The third of the architecture review's
extra-small cleanups (project document
`claude/nose-architecture-review-2026-10-15.md`).

```
build.sh                    no download: fails unless vendor/html5-qrcode.min.js exists and its
                            SHA-256 is QR_LIB_SHA256, naming that hash and vendor/README.md; header item 1
vendor/README.md            rewritten: committed, 2.3.8 from jsDelivr, its SHA-256, how to restore and upgrade
app.html                    the comment above the script tag only
scripts/verify-manifest.sh  the vendored file is required (MISS when absent), not "build.sh curls it"
scripts/gates.sh            header: no network for build.sh's QR download
docs/LAUNCH-CHECKLIST.md    item 1: build.sh checks the committed library rather than downloading it
```

- **The pin.** `QR_LIB_SHA256=660b12437b1d747e3e68b8be0685c08cb728140110ad213f167b14b66f8b1d8e`,
  one named value in the block that replaced the download. Upgrading is one
  commit that changes the file and the pin together, after checking the new
  file against jsDelivr's record (`vendor/README.md`, "To upgrade").
- **The probe, before the edit.** 1: `git ls-files vendor` lists
  `vendor/html5-qrcode.min.js`. 2: its SHA-256 is the pin and it is 375364
  bytes; in base64 the hash is `ZgsSQ3sddH4+aLi+BoXAjLcoFAEQrSE/FnsUtm+LHY4=`.
  3: jsDelivr's own record of the package
  (https://data.jsdelivr.com/v1/packages/npm/html5-qrcode@2.3.8?structure=flat,
  read 2026-10-15 through WebFetch) gives entry `/html5-qrcode.min.js` that
  hash and 375364 bytes. This workspace's shell cannot reach jsDelivr, so the
  `curl … | sha256sum` of the file itself is the Codespace's. 4: `bash
  build.sh`, its download stood in for by git's committed copy, then `git
  status --short vendor/`: nothing.
- **The guard by hand**, in a throwaway copy of the repository, not
  committed: byte 100001 of the file changed from `m` to `Z`, same size;
  `bash build.sh` stopped after "checking the committed html5-qrcode" with
  `FAIL: vendor/html5-qrcode.min.js has SHA-256 e27cdc33…432e62 - expected
  html5-qrcode 2.3.8, SHA-256 660b1243…8b1d8e (see vendor/README.md)`, exit 1.
  With the file deleted: `FAIL: vendor/html5-qrcode.min.js is missing - …`,
  exit 1. `verify-manifest.sh` on a copy without the file: `MISS`, `54
  present, 1 missing, 18 warnings`, exit 1.
- **No request.** `bash build.sh` with `curl` and `wget` replaced by
  tripwires on `PATH` and `HTTP(S)_PROXY` pointed at a closed port, in a
  workspace that refuses jsDelivr anyway: `OK — ready to deploy`, neither
  tripwire called. `build.sh` names neither command now, so a build no
  longer needs jsDelivr to be reachable.
- **What did not move.** `vendor/html5-qrcode.min.js`, byte for byte;
  `app.html`'s script tag, the CSP and `_headers`; every `js/` and `css/`
  file, so `build.sh` renamed nothing; `verify-manifest.sh`'s counts on the
  real tree (`55 present, 0 missing, 18 warnings`, only its section title
  differs); every gate's expected line, `OK — ready to deploy` among them;
  the parser, the maths, the archive and B2B; what NOSE keeps or sends, so
  the privacy page. `docs/FIXES.md` and `docs/TIER*-CHANGES.md` still
  describe the download: they are change logs, kept as history.
- **How it was verified, 2026-10-15, in the cloud workspace**, where npm's
  registry and jsDelivr were both refused: unpdf stood in for by its two
  calls over pdfjs-dist 6.2.108 (parity still `56 match / 0 differ`), the
  old `build.sh`'s download by the committed file (the new one needs none),
  and Playwright 1.56.1 with its Chromium from the workspace. 22 of the 32
  gates green before and after, with `KAY-CAR-001` 4.124 and `KAY-PRR-001`
  0.944 - build, b2b release, input paths, b2b widget and b2b kit among
  them. The other 10 need PGlite, which could not be installed; none of
  them names `build.sh`, `vendor/`, `app.html`, `gates.sh`,
  `verify-manifest.sh` or the checklist. The Codespace run on the real
  packages is the one that counts.
- **After the deploy:** `curl -s https://nose-app.com/vendor/html5-qrcode.min.js
  | sha256sum` gives the pin, and the Scan QR tab on `/app` opens the camera.

### Comments that match the code, 2026-10-15

**Four comments called 10s Netlify's limit, and `b2b-vote.js`'s header still
described the vote as it was before 2026-10-09.** Netlify's current docs give
no 10s limit for a function like `coa.js`, and since 2026-10-09 the widget
sends the vote by `fetch` (§14, "Pinned releases"), not `sendBeacon`. The
fourth of the architecture review's extra-small cleanups (project document
`claude/nose-architecture-review-2026-10-15.md`). Comments and handoff
sentences only.

```
netlify/functions/coa.js               the archive's comment: 10s is NOSE's own budget; the two docs pages
netlify/functions/lib/fetch-report.js  the chain budget's comment and TIMEOUT_MS's line-end comment, the same
netlify/functions/lib/store.js         query_timeout's comment, the same
netlify/functions/b2b-vote.js          header: the vote by fetch, palateSize counts batches, no cookie sent or read
PARSER-HANDOFF.md                      s9's fetch budget, s12's whole-chain paragraph, s13's "The reply never
                                       depends on it"; s14's found-on-the-way item
```

- **What Netlify's docs say**, read 2026-10-15 through WebFetch (this
  workspace's shell cannot reach docs.netlify.com). "Configuration for
  functions" (https://docs.netlify.com/build/functions/configuration/, last
  updated Sep 17, 2026) lists 60 seconds as the synchronous execution limit
  among the defaults every function deploys with, and names no 10s.
  "Lambda compatibility for Functions"
  (https://docs.netlify.com/functions/lambda-compatibility/, last updated
  Jun 9, 2026) gives one execution limit, 10 seconds, for a streamed reply -
  `coa.js` returns its reply whole - and none for a synchronous one. It also
  says the mode is deprecated: from July 1, 2027, deploys holding functions in
  it will no longer be accepted. So 10s is NOSE's own budget: the chain has
  8s (`TOTAL_BUDGET_MS`), one request 7.5s (`TIMEOUT_MS`), the archive at most
  2s of what is left before 9s (`ARCHIVE_DEADLINE_MS`, `ARCHIVE_BUDGET_MS`),
  and a database query 4s unless told otherwise (`query_timeout`). Every
  number stays as it was; using the time Netlify now allows needs the limit
  for this format measured, which porting `coa.js` to the current format
  settles.
- **The vote, as the widget sends it**: `fetch(ORIGIN + VOTE_PATH, { method:
  'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
  keepalive: true, body })` (`js/b2b-widget.8f17602f.js`, line 357).
  `palateSize` is `palate.basis.used.length` in `js/b2b-rank.580a8c1b.js`'s
  `voteScore()`, line 295: one entry per batch the palate used, the voted
  batch left out. The header now cites MDN's CORS guide (simple requests: a
  POST, with `text/plain` one of three Content-Types allowed;
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS, last
  modified Sep 4, 2026) and MDN's `RequestInit` (`credentials: "omit"` never
  sends credentials, cookies among them;
  https://developer.mozilla.org/en-US/docs/Web/API/RequestInit, last modified
  Jun 26, 2026), both read 2026-10-15. Neither page says which Content-Type a
  string body gets, and the Fetch Standard's page was cut off before "extract
  a body" when read, so for that the header names `b2b-widget-test.mjs`, which
  watches the vote go `text/plain;charset=utf-8` with no `OPTIONS` before it.
- **The probe, before the edit.** 1: `git grep -n "10s" -- netlify` gave
  four lines, `coa.js:53`, `fetch-report.js:32` and `:37`, `store.js:128`.
  2: the two pages, above; neither names 10s as the limit for a function
  like `coa.js`. 3: the header's lines 9-13 (the passage the prompt's 9-11
  begins), 32 and 43-49 said `sendBeacon`, a no-cors POST, the page's
  cookies (credentials `include`) and purchases; the widget's `fetch` and
  `voteScore()`'s line are above.
- **Found on the way, left as it is:** §12's "Not covered by any test" after
  the whole-chain budget. Since 2026-10-05 `b2b-coverage-test` drives a slow
  link through the chain - a page that takes 5 seconds, then a report that
  never answers - and checks it ends at `TOTAL_BUDGET_MS`, not 5 + 7.5s.
- **What did not move.** Every code line in the four files: with comments
  stripped, each is what it was. `b2b-vote.js`'s replies, its 415 sentence
  included, which still names `sendBeacon` (a reply, left for its own
  prompt); every `js/` and `css/` file, so `build.sh` renamed nothing; every
  gate's expected line; the parser, the maths, the archive and B2B; what NOSE
  keeps or sends, so the privacy page.
- **How it was verified, 2026-10-15, in the cloud workspace**, where npm's
  registry and docs.netlify.com were refused: unpdf stood in for by its two
  calls over pdfjs-dist 6.2.108 (parity still `56 match / 0 differ`), and
  Playwright 1.56.0 with its Chromium from the workspace. 22 of the 32 gates
  green before and after, with `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944 -
  archive wiring, b2b coverage, build, b2b release, b2b widget and b2b kit
  among them. The other 10 need PGlite, which could not be installed.
  `b2b-endpoints` is one of them; its checks on `b2b-vote.js`'s text - the
  source with comments stripped, and none of its listed words in the whole
  file - were run on their own with its own `codeOf` and word list, and pass.
  The Codespace run on the real packages is the one that counts.
- **After the deploy:** nothing to check. No visitor or store sees a comment.

### Node 24 everywhere, 2026-10-15

**`.nvmrc` said 20, so Netlify built on Node 20, and the gates ran on
whatever the Codespace had - 20 so far - while the functions already ran on
24.** Netlify runs functions on the build's Node only while AWS Lambda is not
retiring that runtime within two months, and AWS deprecated `nodejs20.x` on
2026-04-30, so the functions - `coa.js`, which feeds the archive, among them -
ran on Netlify's fallback, Node 24, a Node no gate had run on. `unpdf` 1.8.0
declares Node 22 or later. `package.json` was npm's template: `npm test`
exited 1 and `main` named an `index.js` that does not exist. This closes the
security audit's item 12 (project document
`claude/nose-security-audit-2026-10-15.md`); the architecture review lists the
same under "Project metadata" (`claude/nose-architecture-review-2026-10-15.md`).

```
.nvmrc                      20 -> 24
package.json                "private": true; "main" and "directories" gone; scripts build (bash build.sh),
                            gates and test (both bash scripts/gates.sh); "engines": { "node": "24.x" }
package-lock.json           the root entry only, gaining the same "engines" - 3 lines
test/node-version-test.js   new: the running Node is .nvmrc's, and both engines fields say "<it>.x"
scripts/gates.sh            'node version' first, expecting node-version clean; header: npm run gates,
                            the Node to use, how to switch the Codespace
PARSER-HANDOFF.md           s5's gate list and harness table; this record
```

- **What the docs say**, each read 2026-10-15 through WebFetch.
  Netlify, "Manage build dependencies"
  (https://docs.netlify.com/build/configure-builds/manage-dependencies/,
  last updated Oct 3, 2026): a `.node-version` or `.nvmrc` file in the
  base directory chooses the build's Node, as "any released version of
  Node.js or any valid string that nvm understands", a major version alone
  meaning that major's latest; a `NODE_VERSION` variable, `.node-version`
  or `.nvmrc` overrides the version chosen under Dependency management in
  the UI. The page does not say which of `NODE_VERSION` and `.nvmrc` wins
  when both are set. Netlify's "Optional configuration for functions"
  (https://docs.netlify.com/build/functions/optional-configuration/) now
  serves the page titled "Configuration for functions", last updated Sep
  17, 2026, the same as https://docs.netlify.com/build/functions/configuration/;
  its "Node.js version for runtime": a function deployed since 2023-05-15
  runs on the build's Node when that is an AWS Lambda Node.js runtime "that isn't
  set to be deprecated in the next two months", and otherwise on a fallback,
  Node 24. `AWS_LAMBDA_JS_RUNTIME`, set in the UI, CLI or API and never in
  `netlify.toml`, overrides that.
  AWS, "Lambda runtimes"
  (https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html, which
  shows no updated date): `nodejs20.x` deprecated Apr 30, 2026, among the
  deprecated runtimes; `nodejs22.x` Apr 30, 2027; `nodejs24.x` Apr 30, 2028,
  blocked for new functions from Jun 1, 2028 and for updates from Jul 1, 2028.
  So a build on 24 runs its functions on 24 by Netlify's own rule, until two
  months before 2028-04-30.
- **The probe, before the edit.** 1: `.nvmrc` held `20`; this workspace ran
  Node v22.22.0. 2: the three pages, above, as the prompt expected. 3: of the
  71 packages in `package-lock.json`, 49 declare `engines.node`; checked with
  npm's own `semver` at 24.0.0, 24.22.0 and 24.99.0, none excludes 24, and
  `unpdf` 1.8.0's `>=22` is the narrowest. 4: `git grep -n -E
  "nvmrc|NODE_VERSION|AWS_LAMBDA_JS_RUNTIME"`, this file aside, found only
  `scripts/verify-manifest.sh` line 31, which checks that `.nvmrc` exists.
  No `.node-version`, `.devcontainer` or `.npmrc` is tracked.
- **The lockfile, offline.** `npm install --package-lock-only --offline
  --ignore-scripts` (npm 10.9.4, here) wrote the root entry's `"engines"` and
  nothing else - first in a scratch copy holding only `package.json`,
  `package-lock.json` and `.nvmrc`, then in the tree, the two results byte
  for byte the same. No registry was reached; this workspace cannot reach
  it.
- **The new gate's refusals**, in a throwaway copy, not committed: with
  `.nvmrc`, `engines` and the lockfile all saying 22, on Node 22, `node-version
  clean`; the lockfile left at 24, `FAIL  package-lock.json's root
  engines.node is "24.x", not "22.x"` with the command that rewrites it;
  `engines` removed, both fields named; `.nvmrc` as `lts/*`, or missing,
  each refused. On the real tree under Node 22 and Node 20: `FAIL  running
  Node 22, .nvmrc says 24 - switch: nvm install, then nvm alias default 24,
  then open a new terminal` (20 likewise), exit 1.
- **What did not move.** Every dependency and its locked version; the
  lockfile's other 71 entries; `netlify.toml`, which still runs `bash
  build.sh`; the parser and `js/match-math.*.js`; every `js/` and `css/`
  file, so `build.sh` renamed nothing; every other gate's expected line;
  `extractorVersion`, which hashes `extract-text.js` and the installed
  `unpdf`'s version, not Node, so no reparse is due; what NOSE keeps or
  sends, so the privacy page. Nothing in the repository reads
  `package.json` or the lockfile apart from npm and the new test.
- **One gate more:** 33. `npm run gates` and `npm test` run `scripts/gates.sh`.
- **How it was verified, 2026-10-15, in the cloud workspace**, which has
  Node 22 and Node 20 but no Node 24, and where npm's registry and
  nodejs.org were refused: unpdf stood in for by its two calls over
  pdfjs-dist 6.2.108 (parity still `56 match / 0 differ`), and Playwright
  1.56.0 with its Chromium from the workspace. Before the edit, 22 of the 32
  gates green on Node 22, with `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944;
  after it, the same 22 of the 33, and `node version` failing as it should
  on 22. The other 10 need PGlite, which could not be installed; none of
  them reads `.nvmrc`, `package.json` or the lockfile. The Codespace run on
  Node 24, on the real packages, is the one that counts - with the extracted
  texts compared before and after the switch, so Node 24 is shown to give
  the gates the text Node 20 did.
- **After the deploy:** Netlify → Deploys → the newest → its Deploy log
  names Node 24; the home page and `/app` read 74 · Partial overlap; one COA
  link read on `/app` shows its card.

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
- **The card's word joiner after the en dash** (above, "Water activity against
  ASTM D8197") was watched in Chromium only, not Safari or Firefox. UAX #14
  says how WJ and an en dash behave, but the page read gave its class
  descriptions, not the rule lines themselves (LB11, LB21): the fetch stopped
  before its section 6.
- **Method's sign-off is a UTC day** (above, "When the lab finished"): a
  report signed after 8 PM Eastern carries the next day as its `testedOn`.
  Nothing on the 8 fixtures does. Converting it would mean guessing the
  lab's zone from its own document, so it is read as printed.
- **`testedOn` has a row for five labs, each from fixtures.** A new lab, or
  a new layout of a known one, gets one only with a fixture and
  `test/date-probe.js` - until then its batches are dated by harvest or
  report day, if it prints one the parser reads, or listed as undated.
  TerpLife's finish day is in `report_on`, not `tested_on`, by choice: a
  question about when labs finished reads `coalesce(tested_on, report_on)`.
- **Method_DulceDeUva's layout stays undated.** It prints a completion date,
  but apart from its label, among unlabelled values; matching it would be
  fitting to one document (§6, "`unknown` is guarded").
- **The date row's note was watched in Chromium only**, at 1280 and 390 px.
  Its normal weight comes from the element's `style` property, which MDN
  says `style-src` does not block; Safari and Firefox have not been looked
  at.
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
- **The word buttons were watched in Chromium only**, at 1280 and 390 px:
  their wrapping, the tick and the status line. Safari and Firefox have not
  been looked at, nor a screen reader's reading of the note.
- **The new guides' numbers are not under a gate** (§13, "Two guides from
  the research"). `match-test.js` checks the worked examples at the top of
  `learn/intensity-versus-character/` against the matcher; the cutoff
  section's 100 and shares on that page, and the 99 and 46 on
  `learn/what-a-lab-report-cant-smell/`, were computed through
  `scripts/lib/match.js` once, on 2026-10-14. Adding them to `match-test.js`
  needs its own prompt.
- **The card's guide link opens a new tab without saying so.** WAI's
  advisory technique G201 ("Giving users advanced warning when opening a new
  window", https://www.w3.org/WAI/WCAG22/Techniques/general/G201, read
  2026-10-14) suggests a warning; doing
  it would add words to the row (or an `aria-label` a screen reader reads),
  and R8 kept the row's text exactly as it was. The link was watched in
  Chromium only, at 1280 and 390 px.
- **`/app` and `/` keep their sitemap `lastmod`** (2026-07-20) although the
  bundle they load has changed again (R3, R4, R7 and R8 all left it).
- **The bundle in strict mode was run in Chromium only** (above, "Strict
  mode in the app bundle"), and its camera path only on Playwright's fake
  camera. Strict mode is part of the language, but Safari and Firefox have
  not been looked at.

---

## 14. Dispensary integration

The dispensary (B2B) plan, built prompt by prompt; each records itself here.
Its core promise: **a shopper's purchase history never reaches NOSE.** The
dispensary's page hands the shopper's batch IDs to the shopper's own browser,
and the widget builds the palate and ranks there. B2B lives apart from
everything consumer - its own schema (`b2b`) and role (`nose_b2b`), since
2026-10-07, and its own Blobs store (`b2b-votes`), functions (`b2b-catalog`, `b2b-feed` and `b2b-vote`), ranking engine (`js/b2b-rank.<hash>.js`) and widget (`js/b2b-widget.<hash>.js`, with `js/b2b-strings` and `css/b2b-widget`), which no consumer page loads, all since 2026-10-08,
and pinned releases of the widget - a second Blobs store (`b2b-releases`) and
function (`b2b-release`), since 2026-10-09 - and the pilot's plan and report
(`docs/B2B-PILOT-PLAN.md`, `docs/B2B-PILOT-EXPORT.md`,
`scripts/b2b-sample-size.js`, `scripts/b2b-pilot-report.js`), which read and
write nothing in production, since 2026-10-13, and the compliance kit
(`scripts/b2b-compliance-kit.js`), which reads a store's public feed and
nothing else, writes only under `b2b-out/`, also since 2026-10-13 -
and whatever runs on Netlify stays off unless `B2B_ENABLED=1` in the
Production context and `build-info.json` says production
(`lib/b2b-flag.js`) - on since 2026-10-09, after the privacy page described
it ("Privacy page, then switch on"). No B2B record or log holds anything about a shopper. A batch
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

### The ranking engine, 2026-10-08

Prompt 5. Every decision the widget makes, as plain functions over the feed:
no page, no network, no clock but the day each call is handed. It makes no
request and writes nowhere, so what a store's page hands it - a shopper's
purchases - stays in the shopper's browser. Nothing in it is live: no page
loads it yet (Prompt 6's widget will). Campaign palates ("Later") would run
these same functions in Node on a dispensary's server.

```
js/b2b-rank.<hash>.js      palateFrom, rank, soldOut, voteScore: window.NoseRank in a page, module.exports in Node
build.sh                   syntax-checks and fingerprints it; fails a page that loads it without js/match-math before it
test/b2b-rank-test.js      offline, a gate: "b2b-rank clean"
scripts/gates.sh           the gate, after b2b endpoints
```

**The probe, before any edit**, on `0f3252c` - ALL GATES GREEN, 25 gates:

- `js/match-math.cd934bdd.js` is a classic script: `module.exports` when
  `module` exists, else `self.NoseMatch` - ten exports, frozen.
- `test/match-test.js` finds a copy by scanning every `.js`, `.cjs` and `.mjs`
  outside `node_modules`, `.git` and `vendor` - tests included - for
  `function (cosine|normalize|matchBand|averageProfiles)` taking `(a, b)`,
  `(values)`, `(score)` or `(list)`; only `wip/nose-farnesene-wip.js` may
  match. It also wants exactly one `match-math(.<hash>).js`, and no
  `Math.round(score * 100)` in `js/` or `scripts/`.
- The app scores a candidate against a palate as `cosine(palateVec,
  normalize(b.terps))`, `palateVec = averageProfiles(palateProfiles())`,
  shown with `shownScore()` and `matchBand()` (`js/nose.593b2c1b.js`, line
  276). The palate goes first, and it matters: with the two swapped, 897 of
  the 1830 golden pairs change in the last bit.
- The feed, from `test/b2b-endpoints-test.js`: `{ store: { window_months,
  guardrail_thc_points, guardrail_cbd_points }, batches: [...] }`, each batch
  the 17 fields of "Feed and votes", in `list_position` order; `usable`
  `true`, `false` or `null`, `terps` only when `true`.

**Decided here, where the prompt was silent** (the plan, "NOSE for
Dispensaries - B2B Integration Plan", settled three of them):

- **Each call takes one options argument more, last**:
  `palateFrom(feed, purchases, removed, { today })`, `soldOut(feed,
  purchases, { removed, routes, guardrail, today })` and `voteScore(feed,
  purchases, productId, { removed, today })`. The window needs a day and the
  feed carries none; the sold-out panel ranks, which needs the shopper's
  routes; and a batch the shopper took out of the palate should define
  neither the usual nor a vote's palate. `today` is a UTC day - by the
  device's clock when left out - and purchase days are UTC days,
  `YYYY-MM-DD`.
- **Reasons are codes, never words** - the widget's strings say them (Prompt
  6) - and there are six: the prompt's five and `not inhalable`. The upload
  refuses any category or route but the four and two, so the sixth cannot
  happen through NOSE; a feed made elsewhere could. The first that holds is
  the one given, in the prompt's own order: not listed, not inhalable, no
  read, refused, outside the window, removed.
- **Each batch counts once**, however often it was bought: the plan's
  "Weighting: none", the published method. The window applies to each
  purchase, so a batch bought last month and two years ago is used once, for
  last month, and the old purchase is skipped as outside the window.
- **The palate is made in the feed's order**, not the page's: the same
  purchases make the same palate to the last bit however the page lists
  them. 32 of the 64 golden palates of two or more members change in the
  last bit when averaged in reverse.
- **The window is `IN_WINDOW_SQL`'s**: today less `window_months` as
  PostgreSQL's `date - make_interval(months => n)` counts it, a day the month
  lacks moved to its last (2026-03-31 less one month is 2026-02-28). Checked
  while building: every day of 2023 to 2029 against every window of 1 to 36
  months - 92,052 cases - through `palateFrom()` and through PostgreSQL 16,
  all agreeing. The first day is inside; a day after today is inside (two
  clocks can disagree); a day that is not a real `YYYY-MM-DD`, or a window or
  today that cannot be read, puts the purchase outside: nothing counts that
  cannot be checked.
- **No usable read**: `usable` `null` is `no read`, `false` is `refused`. An
  accepted reading with no terpene the maths models is `no read` too - never
  a score of 0, which would claim a difference nobody measured. It cannot
  come from the parser, whose terpene keys are all TERPENES' (§8), and
  golden's "only cannabinoids", "all zero" and "empty" edges show it.
- **`rank()`**: the in-stock batches of the category asked for, inside the
  routes given (a list; without one nothing is inside it), inhalable, inside
  the guardrail. Each scored by the app's own call. The largest score first -
  the score itself, not the number shown, so two batches that both show 85
  keep their scores' order; an exact tie (one report linked from two batches,
  which the coverage report flags) in `list_position` order, then the
  feed's. Then every batch with no usable read, unscored, in `list_position`
  order. A palate made of nothing ranks nothing - no history yet, so the menu
  keeps its own order (the plan) - rather than labelling every batch as having
  no panel. Each entry is `{ batch, score, shown, band, label, unscored }`:
  `batch` the feed's own object, `band` matchBand()[1] (the name a vote
  carries), `label` [0]; unscored, all four numbers are null and `unscored`
  says `no read` or `refused`.
- **The guardrail**, as the migration's comment defines it: within the store's
  points of the median of the basis batches - the batches the palate uses -
  both edges in; an even count takes the middle two's mean. It filters and
  never reorders, unscored batches included. Compared in whole millionths of
  a percentage point, so an edge holds as written: 16.1 is 5 points from
  11.1, where floating point says 5.000000000000002. It fails closed: a batch
  with no figure is out, a basis with no figure keeps everything out of that
  half, and a setting that is not a band (above 0, at most 100) keeps
  everything out. `rank()`'s `guardrail` option is `{ guardrail_thc_points,
  guardrail_cbd_points }`; left out, the store's own (`feed.store`), so the
  widget gets it without asking.
- **`soldOut()`**: the most-bought product counts purchases, not batches, of a
  listed, inhalable batch inside the window and not removed - read or not,
  since a usual is what is bought; a tie goes to the product bought most
  lately, then the store's order. null while that product has any batch in
  stock. Otherwise its latest purchased batch (on one day, a batch NOSE can
  compare first) becomes a palate of its own through `palateFrom()`, and
  `rank()` runs over that batch's category with the shopper's routes and the
  store's guardrail, centred on that batch alone. A latest batch with no
  usable read ranks nothing, and its palate's basis says why. Returns
  `{ productId, batch, palate, ranked }`.
- **`voteScore()`**: the latest purchased batch of `productId`, scored by the
  same call against `palateFrom()` of every other purchase - every purchase of
  that batch left out, another batch of the same product kept in, as it was
  in the palate before. Returns `{ batch, score, shown, band, label, palate,
  payload }`; `payload` is exactly b2b-vote's `candidate`, `score`
  (shownScore()), `band` (matchBand()[1]) and `palateSize` (batches, not
  purchases), and the widget adds `key` and `vote`. null with no usable read
  or an empty palate, so no vote can carry a `palateSize` of 0.
- **No name is read.** Of a batch the engine reads `batch_id`, `product_id`,
  `list_position`, `category`, `route`, `in_stock`, `thc_percent`,
  `cbd_percent`, `usable` and `terps` - never `name` or `brand`, nor `lab`,
  the days, the product link or the printed total - and never lists its
  fields. The test watches every read through a Proxy.
- **Loading.** A classic script, after js/match-math in a page:
  `window.NoseRank`, frozen; it refuses to load without the five functions it
  calls. In Node `require()` returns the same functions, their maths through
  `scripts/lib/match.js` - so in Node it runs from this repo's layout.
  `build.sh` syntax-checks and fingerprints it and fails a page that loads it
  without js/match-math before it: the js/nose rule, written again for it,
  which `test/b2b-rank-test.js` runs from `build.sh`'s own lines. It is
  published at `/js/b2b-rank.<hash>.js` and loaded by nothing yet.

**The test** - `test/b2b-rank-test.js`, 90 checks, a gate after `b2b
endpoints`. Every feed is built from `lib/b2b-store.js`'s own `FEED_FIELDS`
and `FEED_STORE_FIELDS`. It checks the file both ways (in Node, and in a
`vm` context as a page runs it, after js/match-math - and refused without
it); no maths defined, nothing multiplied by 100, no band named; with every
NoseMatch function wrapped and watched, that each palate is one
`averageProfiles()` returned and each score one `cosine()` returned for that
palate and `normalize()` of that batch's own terps, palate first, shown and
banded by `shownScore()` and `matchBand()`; all 1830 golden pairs and 61
self-scores through `rank()`, and the 65 golden palates through
`palateFrom()` (vectors, key order included) and `rank()`, to the last bit,
and the hero pair at 74, Partial overlap; 7442 candidates against palates
scaled 3x and not, the same number in the same band, under 1e-15 apart;
unread batches after scored ones, labelled, with no number; routes,
category, stock and the guardrail leaving batches out with the rest in the
same order and the same numbers - the guardrail on 30 palates and bands,
handed to `rank()` and set by the store, against a band computed apart, in
tenths; ties; each skip reason and its order, a removed batch's palate
equal to never buying it, one count per batch, the feed's order, the
window's edges and its unreadable cases, today by the clock; `soldOut()`'s
choices and its palate of one batch; `voteScore()` leaving out exactly the
voted batch, equal to `rank()`'s number, and its payload; the fields read;
`build.sh`'s rule on five throwaway pages; and no effect wording in the
engine, comments included.

- **Against broken copies**: 64 deliberate faults, one at a time - among them
  the cosine's arguments swapped, a rounded number, a sort by the number
  shown, ties in the array's order, unscored first or scored 0, a reading
  with nothing modelled scored, each filter dropped, the guardrail reordering,
  open on a missing figure, in floating point, by the mean or with its edges
  out, removed purchases counted, each purchase weighted, the page's order,
  the window ignored, unclamped or exclusive, the window before the read,
  case-blind batch IDs, the sold-out panel against the whole palate, on the
  earliest batch or in the page's category, the vote with its own batch in
  it or its whole product out, a palate size of purchases, a band given as a
  label, a tie broken by name, a lab name read, a copied batch, a copy of
  the maths, a band named in the code, an effect word, and six broken lines
  of `build.sh` - each fails it. A scratch harness, not committed. Its
  first run missed three (the guardrail reordering only when the store set
  it, a palate size counting purchases, a tie broken by name); the test
  gained the checks that catch them.

**How it was verified, 2026-10-08, in the cloud workspace.** npm was blocked
there (registry.npmjs.org answered 403) and so was cdn.jsdelivr.net, so as
before the gates ran on stand-ins: pdfjs-dist 6.2.108 for unpdf (56/3, 56/0,
clean, 4.124/0.944), a throwaway PostgreSQL 16 cluster per PGlite instance
behind PGlite's API, the committed html5-qrcode in place of `build.sh`'s
download, and Playwright 1.56.0's Chromium. ALL GATES GREEN on `0f3252c`
before any edit, 25 gates, and after it with the new gate - 26 gates,
`KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944. `js/match-math.cd934bdd.js` is
byte for byte as it was, and `match-test` passes with the engine beside it.
`parse-coa.js`, `coa-dates.js` and `extract-text.js` are untouched, so no
reparse is due. `build.sh` named the new file `js/b2b-rank.580a8c1b.js` and
renamed nothing else. The test ran on Node 22.22 only; the Codespace's
Node 20 (`.nvmrc`) runs it first. Nothing ran against a real database,
Netlify or a lab's server. The Codespace run on the real packages is the one
that counts.

**In the Codespace, in this order** (nothing here writes anywhere):

1. `git pull --ff-only`, then `bash scripts/gates.sh` - ALL GATES GREEN,
   `b2b rank` among them.
2. `git push` - deploys `/js/b2b-rank.<hash>.js`, which no page loads yet.

### The widget, 2026-10-08

Prompt 6. `<nose-matches>`, the element a dispensary places on its page: the
opt-in, the "closest to your usual" rail, the sold-out panel, the basis list
and the post-purchase vote, in factual, lab-data words. It builds the palate
and ranks in the shopper's browser with the ranking engine; only the feed
and a vote leave the page. Nothing in it is live: the feed and the vote
answer 404 until Prompt 8, and only the demo page loads it.

```
js/aroma-bar.<hash>.js        FAMILIES, FAMILY_ORDER, familyShares, renderBar - moved verbatim out of js/nose; window.NoseBar
js/nose.<hash>.js             reads those four from window.NoseBar; no other line changed
app.html, index.html          load js/aroma-bar between js/match-math and js/nose
js/b2b-strings.<hash>.js      every word the widget shows, default and florida; window.NoseStrings
js/b2b-widget.<hash>.js       <nose-matches>
css/b2b-widget.<hash>.css     its stylesheet, linked inside its shadow root
b2b/demo/index.html           the demo: a test store, a made-up purchase list typed in; noindex, linked from nowhere
b2b/demo/test-store.json      the test store's feed, written by scripts/b2b-demo-feed.js
js/b2b-demo.<hash>.js         the demo page's controls; css/b2b-demo.<hash>.css its layout
scripts/b2b-demo-feed.js      writes the test store from the fixtures' readings; --check
build.sh                      checks and fingerprints the six; the widget's stylesheet name; load order; family images
test/b2b-strings-test.js      offline, a gate: "b2b-strings clean"
test/b2b-widget-test.mjs      Playwright, after the build, a gate: "b2b-widget clean"
scripts/gates.sh              the two gates, after b2b rank and after input paths
```

**The probe, before any edit**, on `93a07b5` - ALL GATES GREEN, 26 gates:

- **Probe 1.** In `js/nose.593b2c1b.js`: `FAMILIES` (lines 53-60) - for each
  of the six families its label, colour and ink, and the app's family-card
  copy, image and alt text; `FAMILY_ORDER` (61), its keys; `familyShares()`
  (84), which needs `normalize()` and `TERPENES` from window.NoseMatch;
  `renderBar()` (91-111), which needs the three and `document`, and is
  called five times - the hero's two bars, the result's two, the COA card's.
  It sets each segment's width, colour and label colour through the
  element's `style` properties, and its frame comes from `shell.css`
  (`.profile-bar`, `.profile-segment`), which a shadow root cannot see.
- **Probe 2, the move.** The four moved into `js/aroma-bar.js`, a classic
  script like `js/match-math` (window.NoseBar in a page, module.exports in
  Node): 31 lines, byte for byte (SHA-256 `9b31dc3b...`, which the widget
  test pins). `js/nose` reads them back in one line where `FAMILIES` stood.
  A scratch harness, not committed, captured the whole document in headless
  Chromium, served with `_headers`, before and after: 25 hero pairs on `/`;
  on `/app`, with the 56 accepted fixtures saved as jars, palates of 1 to 6
  jars against each of 61 candidates (366 states); and 3 COA link cards from
  the real handler. Run twice on the old tree first, to show the capture
  repeats itself: 397 of 397 identical before and after, on the move and
  again on the finished tree, and each page's document differs by one line,
  the added `<script>`. No page error, no CSP message. `input-paths`,
  `match` and `b2b-rank` clean. So the move was clean, and the build went
  on.
- **Found on the way.** `build.sh`'s family-image check read
  `js/nose.*.js` for `/images/families/...`, and `FAMILIES` no longer lives
  there: the check would have found nothing and passed. It reads
  `js/aroma-bar.*.js` now and fails unless it finds the six.

**Decided here, where the prompt was silent:**

- **Two attributes more.** `strings` (`default` | `florida`) picks the
  variant. `feed` names a file on NOSE's own origin to read in place of
  b2b-feed - the demo's test store; a file on any other origin and the widget
  shows nothing, so the feed and the vote still go to NOSE alone.
- **Suggestions across forms stay off** (the plan; "Still open" asked Prompt
  6 to decide). The rail's palate is made of the shopper's purchases in the
  rail's own category, each batch looked up in the feed, and the basis line
  says so: "Based on 3 flower products you've bought since May 2026". The
  vote's palate is the voted product's category, so the vote's number is
  the one its card showed. The sold-out panel was one category already.
- **"since <month>"** is the month of the earliest purchase the palate uses,
  read from its UTC day; the twelve month names are in the strings file.
- **At most 12 cards** on the rail and the sold-out panel, in the engine's
  order: scored first, then those with no usable read.
- **The basis also says what it does not use**: each batch of the category
  with no terpene panel, by name, and every other purchase as one count -
  another category, not listed, bought before the window.
- **Removing**: kept in this browser's storage on the store's own origin
  (`nose-matches-removed`) and fired as `nose:palate-removed`; a "Put back in
  my palate" button undoes it, fired as `nose:palate-restored`. Each event
  carries `{ batchId, removed }`, the whole list. The basis stays open when
  it is drawn again, and the button that undoes the change takes the
  keyboard, so a keyboard user keeps their place.
- **The vote**: once per product in a browser (`nose-matches-voted`), its six
  fields named one by one, sent by `sendBeacon` as the prompt says.
- **The feed**: one request per page however many widgets it holds; cors
  mode, no cookies, no referrer, given up after 8 seconds. Nothing is
  fetched until consent is granted; denied and the control group show
  nothing, load nothing - not even the stylesheet - and send nothing.
- **A key that is not a public key** - a secret `nsk_` one above all - and
  nothing is sent or shown. A wrong attribute or a feed that did not come
  shows nothing, with one console line, once, without detail.
- **The no-panel sentence is "No terpene panel available for this batch"**,
  not the prompt's "No terpene panel on this batch's report". A batch NOSE
  has not read yet, or whose link gave no report, may well have a panel on
  its report, so the prompt's sentence would state something NOSE does not
  know. One line in `js/b2b-strings` changes it back.
- **The card's number** is shown with its label, "Related profile · 82", and
  read aloud as "Related profile, 82 out of 100".
- **The Florida variant** says aroma rather than flavor or taste, orders
  rather than purchases, and "dispensary" rather than store: Florida's
  advertising rule, 64ER25-6, bars marketing that depicts consumption or
  implies recreational use, must not be false or misleading, and makes a
  dispensary answer for its vendors ([state-rules.com, 64ER25-6](https://state-rules.com/florida/fac/64ER25-6/);
  [Fox Rothschild](https://www.foxrothschild.com/cannabis-law/publications/florida-severely-restricts-medical-marijuana-treatment-center-advertising-and-marketing);
  both read 2026-10-08). "Treatment center" is not used: the effect list
  catches "treat" and its forms, and the rule is to reword. Counsel reviews
  the variant before a Florida store uses it.

**What the design rests on in browsers**, read 2026-10-08:

- A style set property by property through an element's `style` is not
  blocked by a `style-src` without `'unsafe-inline'`; `setAttribute('style')`
  and `style.cssText` are ([MDN, style-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src),
  modified 2025-12-15). The shared bar sets its widths and colours that way,
  so it draws under a store's CSP unchanged; the widget sets no style of its
  own, and a broken copy that calls `setAttribute('style')` is refused by the
  store page's CSP in the test.
- `document.currentScript` is the running classic script's element while it
  first runs, not in callbacks and not for modules ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/currentScript),
  modified 2024-07-25): the widget reads NOSE's origin from it once, so a
  release (Prompt 7) must stay a classic script.
- Referrer policy nulls `Origin` only on requests that are neither GET nor
  HEAD and not in cors mode ([MDN, Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin),
  modified 2026-08-07): the feed is fetched in cors mode with
  `referrerPolicy: 'no-referrer'`, and Chromium 141 sent it with the store's
  `Origin` and no `Referer`, which b2b-feed's origin rule needs.
- A stylesheet linked inside a shadow root is scoped to it ([web.dev, Shadow
  DOM v1](https://web.dev/articles/shadowdom-v1)), and page styles do not
  reach in ([MDN, Using shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM),
  modified 2026-09-08). The test checks the card's computed radius and the
  bar's height, from `css/b2b-widget`, under the store's `style-src`.
- `noindex` works only on a page robots.txt does not block ([Google Search
  Central](https://developers.google.com/search/docs/crawling-indexing/block-indexing),
  updated 2025-12-10): the demo page carries `<meta name="robots"
  content="noindex, nofollow">`, and robots.txt is unchanged.

**`build.sh`**: syntax-checks and fingerprints `js/aroma-bar`,
`js/b2b-strings`, `js/b2b-widget`, `js/b2b-demo`, `css/b2b-widget` and
`css/b2b-demo`. The widget links its stylesheet by the name its source
carries (`STYLESHEET`), which no page names, so `build.sh` fingerprints the
stylesheet first, writes its name into the widget, then fingerprints the
widget, whose hash then covers the name; a second build changes nothing. One
block of load-order rules, which the widget test runs from its comment to
its `done`: `js/aroma-bar` after `js/match-math`; `js/nose` after
`js/aroma-bar`; `js/b2b-widget` after `js/aroma-bar`, `js/b2b-rank` and
`js/b2b-strings`. The family-image check reads `js/aroma-bar`.

**The demo page**, `/b2b/demo/`: the store's page, played by `js/b2b-demo`.
The presenter sets the mode, consent, group, words, category, product and
routes, and types the purchases - one a line, a batch ID and a day; the box
opens with a made-up list dated back from today. The widget reads the test
store, `b2b/demo/test-store.json`: 30 batches with made-up products, brands,
links, stock and THC and CBD figures, each terpene panel a real fixture's
reading by today's parser (two flower batches and one pre-roll with none:
not read, and refused). The page lists the store's batches, the events the
widget fires, and why nothing shows when nothing does. Noindex, in no
sitemap, linked from nowhere, the site's own CSP; its votes go to b2b-vote
with a made-up key - 404 until Prompt 8, then refused as no store's.

**The tests**:

- **`test/b2b-strings-test.js`**, 26 checks, a gate after `b2b rank`: the
  file both ways (Node, and as a page loads it), frozen; the two variants'
  keys, placeholders, categories and months; no effect or recreational word
  in either variant or anywhere in the file - the prompt's eighteen words
  and their forms (`EFFECT`, checked against 64 forms that must trip it and
  18 words of the store's that must not); the Florida variant's aroma and
  orders; the words shown from other files against `matchBand()` and a
  `renderBar()` run in Node; every key the widget reads, none unread, none
  written out in the widget.
- **`test/b2b-widget-test.mjs`**, 147 checks, a gate after `input paths`.
  Two local origins: NOSE, the built site with `_headers`, b2b-feed and
  b2b-vote stood in for (a feed from the test store with two pre-rolls more,
  and once with the store's guardrail set), and a store whose page loads the
  built files from NOSE under exactly `script-src 'self' <NOSE>; style-src
  'self' <NOSE>; connect-src <NOSE>`. Every request either origin receives
  is recorded, every request the browser makes watched, `getAttribute` on the
  element watched for `purchases`, and NOSE given a `SameSite=Lax` session
  cookie. It checks: no request carries a purchased batch ID, a purchase day
  or the attribute, none goes elsewhere, none to NOSE carries a cookie or
  more than the store's origin as referrer, and the secret key is sent
  nowhere; consent unknown - one button and one sentence, no feed, the
  purchases never read, Tab and Enter, `nose:consent`, the page's answer
  bringing the rail; denied and both control cases showing and loading
  nothing; eight wrong attributes; the rail, the pre-roll rail (unread and
  refused batches last, their sentence, no number, no bar; a `javascript:`
  link not linked; missing figures said), the guardrail, Florida, the sold
  out panel and its in-stock case, the vote up by Space and down by click,
  once per product, and a product with no panel - each against the engine's
  own answer for the same feed and purchases; every bar against
  `renderBar()` run in the same page; the shadow root's stylesheet applied;
  keyboard reach in each mode; every word shown traced to the strings, the
  match labels, the bar or the catalog, and none about effects; the store
  page's CSP shown in force by its own breaches while the widget caused
  none; the demo page; one copy of the bar in the repo and the moved lines'
  hash; the widget's source (no maths, rounding, band or label; one
  `fetch()`, one `sendBeacon()`, no other way out; the purchases read after
  the consent check); and `build.sh` - its lines, the order of its
  fingerprints, and its load-order rule on ten throwaway pages.
- **Against broken copies**: 38 deliberate faults, one at a time, in a copy
  of the repo - among them the purchases in the feed's address, the
  purchases read before consent, control or denied shown, the vote carrying
  the palate, the vote as JSON by `fetch` (a preflight), a rounded number, the
  feed's order, a batch with no panel scored 0, a bar of the widget's own, a
  removal not told or not kept, an inline style, a feed on any origin,
  Florida ignored, every purchase in the palate, a vote allowed twice, a
  secret key accepted, any link, twenty cards, a guess for a batch with no
  panel, the feed with credentials, the guardrail dropped, the basis
  closing, an effect word in a string, a Florida key missing, Florida saying
  flavor, the match labels listed wrongly, a word written into the widget, an
  unread string, a band missing from the stylesheet, the demo page indexed
  or linked from the home page, the test store edited by hand, `build.sh`
  without a load rule, fingerprinting the widget before its stylesheet or
  reading images from `js/nose`, and a second `renderBar` - each fails a
  test. A scratch harness, not committed. Its first run let one through, a
  Florida key missing, which only the strings test caught; the widget test
  now checks the Florida vote's thanks, and a case that stops part way is a
  failure said plainly, after which every later check still runs.

**How it was verified, 2026-10-08, in the cloud workspace.** npm was blocked
there (registry.npmjs.org answered 403) and so was cdn.jsdelivr.net, so as
before the gates ran on stand-ins: pdfjs-dist 6.2.108 for unpdf (56/3, 56/0,
clean, 4.124/0.944), a throwaway PostgreSQL 16 cluster per PGlite instance
behind PGlite's API, the committed html5-qrcode in place of `build.sh`'s
download, and Playwright 1.56.0's Chromium 141. ALL GATES GREEN on `93a07b5`
before any edit, 26 gates, and after, 28 gates, `KAY-CAR-001` 4.124 and
`KAY-PRR-001` 0.944. Both new tests passed on Node 22.22 and 20.20.
`js/match-math.cd934bdd.js` and `js/b2b-rank.580a8c1b.js` are byte for byte
as they were; `parse-coa.js`, `coa-dates.js` and `extract-text.js` are
untouched, so no reparse is due. `build.sh` renamed `js/nose.593b2c1b.js` to
`js/nose.bab857ad.js` - the four moved out - and `_redirects`' `/js/nose.js`
alias with it, and named the new files. Nothing ran against a real
database, Netlify or a lab's server. The Codespace run on the real packages
is the one that counts.

**In the Codespace, in this order** (nothing here writes anywhere; the demo
page and the widget's files go live, and the widget's two calls answer 404):

1. Bring the commit in - `git pull --ff-only`, or from the bundle - then
   `bash scripts/gates.sh`: ALL GATES GREEN, 28 gates, `b2b strings` and
   `b2b widget` among them. If `b2b widget` says Playwright is not
   installed: `npm install --no-save playwright`, then `npx playwright
   install --with-deps chromium`.
2. `git push` - deploys.
3. On the live site: the home page and `/app` read 74 · Partial overlap, and
   their bars draw (§13, "After a deploy", step 6) - the bar now comes from
   `js/aroma-bar`. Then `https://nose-app.com/b2b/demo/`: press the green
   button, and the rail shows.

### Pinned releases, 2026-10-09

Prompt 7. A dispensary pins one exact widget version with an integrity hash,
so no NOSE deploy changes its page unannounced, and git still holds one copy
of the maths. Nothing in it is live: the function answers 404 until Prompt
8's switch, and the store holds no release until the first is published from
the Codespace (below).

```
netlify/functions/lib/b2b-releases.js  the "b2b-releases" store: keys, the five headers, read, put (onlyIfNew, ETag), inventory
netlify/functions/b2b-release.js       GET /b2b/releases/<version>/nose-matches.{js,css} (config.path): the bytes, immutable, any origin
scripts/b2b-release.js                 builds a release from origin/main's newest commit and publishes it; --dry-run
scripts/b2b-release-check.js           every recorded release against git, the store and, with --site, the live site
docs/B2B-RELEASES.md                   the record: version, commit, two sha384 values - rows written by the script alone
docs/B2B-INTEGRATION.md                for a dispensary's developer
js/b2b-widget.<hash>.js                STYLESHEET_INTEGRITY; its stylesheet with no referrer; the vote by fetch (63200a61 -> 8f17602f)
test/b2b-release-test.js               offline, a gate: "b2b-release clean"
test/b2b-widget-test.mjs               the vote by fetch; a pinned release in Chromium
scripts/gates.sh                       the gate, after the build
```

**The probe, before any edit**, on `a0d433a` - ALL GATES GREEN, 28 gates:

- **Old bundles kept in `js/`**: `build.sh`'s `fingerprint()` keeps the first
  file a name matches and deletes the rest. With an older widget kept beside
  today's (`RAIL_MAX 8`, `js/b2b-widget.152014e3.js`), the build said `OK -
  ready to deploy`, deleted today's widget and rewrote the demo page to load
  the old one: whichever hash sorts first wins. Its stylesheet `sed` also
  rewrites every `js/b2b-widget.*.js`, so a kept file's bytes - and its hash
  - change. With the kept file sorting second, it was deleted instead.
- **A second `js/match-math` file**: `scripts/lib/match.js` throws
  `expected exactly one js/match-math.<hash>.js, found 2`, `match-test`
  fails `exactly one`, and `b2b-rank-test` stops on load.
- **A built release committed anywhere as `.js`**
  (`b2b/releases/1.0.0/nose-matches.js`): `match-test`'s copy scan lists it
  beside `wip/`, and so does `b2b-widget-test`'s one-copy-of-the-bar scan.
  So git cannot hold a built release.
- **Integrity across origins**, in Chromium 141 with two local origins (a
  scratch probe, not committed): integrity without `crossorigin` - blocked,
  "requires the request to be CORS enabled"; `crossorigin` without
  `Access-Control-Allow-Origin` - blocked; both with the right hash - runs,
  and `document.currentScript` still names NOSE's origin; a wrong hash -
  blocked. A CSP source with a path allows the release path and refuses
  `/js/`. A stylesheet linked inside a shadow root with integrity and
  `crossOrigin` behaves the same: applied, or refused for a wrong hash or no
  CORS header. MDN ([Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity),
  modified 2026-04-14): integrity on a cross-origin resource needs CORS, a
  `no-cors` request with integrity always fails, and `<script>` and `<link
  rel="stylesheet">` take it.
- **The vote**, the same way: from an order page
  (`/account/orders/1234?order=1234`) served with `Referrer-Policy:
  unsafe-url` or `no-referrer-when-downgrade`, the beacon carried that whole
  address as `Referer` to NOSE. A `fetch` in cors mode with keepalive,
  credentials `omit` and no referrer carried the store's origin alone, under
  every policy tried (default, `no-referrer`, `same-origin`, those two), with
  no preflight.
- **Netlify's docs**, read 2026-10-09: [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
  (updated 2026-09-30) - `onlyIfNew` writes only when the key is new; an
  added blob is available everywhere at once; `getStore` stores are shared by
  every deploy, previews included; 5 GB an object, 600-byte keys. The
  `@netlify/blobs` 10.7.11 source (`blobs-v10.7.11`): a conditional write
  answers `{ modified: true }` on any status but 412, so a write counts only
  with an ETag. [Functions configuration](https://docs.netlify.com/build/functions/configuration/)
  (updated 2026-09-17) - `config.path` takes URLPattern paths, and with one
  set the function is not at `/.netlify/functions/<name>`.
  [Caching overview](https://docs.netlify.com/build/caching/caching-overview/)
  (updated 2026-08-11) - a function's reply is cached only when it says so,
  every deploy invalidates its context's cache, the query is in a
  function's cache key. [Custom headers](https://docs.netlify.com/manage/routing/headers/)
  (updated 2025-12-01) - `_headers` does not apply to a function's reply, so
  `_headers` needs no change.
- **Simpler ways, rejected**: pinning today's `/js/<hash>` files (deleted on
  the next change, first bullet); rebuilding releases at deploy time (build
  output in the tree fails the one-copy scans unless a path is exempted, and
  it would make every deploy depend on every old commit building the same);
  a public CDN (the widget reads its origin from its own script, so its feed
  and vote would go to the CDN).

**The owner's decisions, 2026-10-09**, asked after the probe:

- **The widget checks its stylesheet's hash.** `js/b2b-widget` gains
  `STYLESHEET_INTEGRITY`, `null` as built: on NOSE's own site its stylesheet
  is asked for as before, with no CORS. A release writes the stylesheet's
  sha384 there, and the widget then sets `integrity` and `crossOrigin =
  'anonymous'` on its link. So the one hash on the store's tag pins both
  files.
- **The vote goes by `fetch`**: cors, keepalive, credentials `omit`,
  referrer policy `no-referrer`, a string body. The store's origin always
  goes, so `b2b-vote`'s origin rule holds in every browser; no cookie and no
  page address ever do. The stylesheet is asked for with no referrer too.
- **The release function obeys the switch**: 404 until Prompt 8, like every
  B2B function. So the check reads git and the store now, and the live site
  after Prompt 8.

**Decided here, where the prompt was silent:**

- **`js/b2b-strings` is in the bundle** - the prompt's list left it out, and
  the widget refuses to run without it. The order is build.sh's load order:
  match-math, b2b-rank, aroma-bar, b2b-strings, b2b-widget.
- **The widget names the release's own stylesheet**,
  `/b2b/releases/<version>/nose-matches.css`: the `/css/b2b-widget.<hash>.css`
  it names on the site is deleted by the build after the next CSS change.
- **Versions are whole numbers from 1**, one more than the record's last.
  Only origin/main's newest commit is released, so the row always goes on
  the newest record; a checkout behind it is told to pull. A commit whose six
  files are the last release's, byte for byte, is refused - nothing new.
- **The record holds the version, the commit (all 40 characters) and the two
  sha384 values**, and nothing else - no date.
- **One address per file**: `/b2b/releases/<n>/nose-matches.js` and `.css`,
  no query, not even an empty `?`. Exactly five headers on a 200; every other
  reply `no-store`, so a request made before a release exists is never cached
  as missing. No `durable` directive: each deploy clears the cache anyway.
- **Strong consistency for the scripts**, which read back what they wrote; the
  function reads as Netlify hands it, the default: a release is written once
  and is available everywhere as soon as it is added.
- **A release is a browser file** (s14, "Still open": the engine in Node).
- **`docs/` is forced 404 on the site**, so the integration guide reaches a
  dispensary from the public repository, or from the owner.

**The build** - `scripts/b2b-release.js`, reading the commit from git's
objects, never the working tree:

- `nose-matches.js`: a header naming the release, the commit and the five
  files; then each file after a `/* ---- js/<name>.<hash>.js ---- */` line,
  verbatim, but for the widget's `STYLESHEET` and `STYLESHEET_INTEGRITY`
  lines. `nose-matches.css`: `css/b2b-widget`, verbatim. Nothing else goes in
  - no time, no machine - so a commit and version always give the same bytes.
- It refuses a commit whose files are not as `build.sh` leaves them: one
  hashed file each and no unbuilt one, each named by its own SHA-256, the
  widget naming the stylesheet beside it, each file ending its last statement
  (`;` and a newline), UTF-8.
- It refuses, before building: any change in the tree, staged, unstaged or
  untracked; a fetch of origin main that fails; a HEAD that is not origin/main;
  a record it cannot read (a gap, a row out of shape, no table, no file).
- Publishing, with `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN`: the stylesheet
  first (so a script on the store never names a stylesheet that is not
  there), then the script, each `onlyIfNew` and counted only with an ETag.
  A key already there with these bytes is a run that stopped part way: it
  goes on. With other bytes it stops, overwriting nothing. Both are read back
  and compared, and only then is the row written. It prints the tag a
  store's page carries, and never a secret.

**The function** - `netlify/functions/b2b-release.js`, a default export
taking a Request, with `export const config = { path:
'/b2b/releases/:version/:file' }`: the switch first; GET and HEAD, else 405
`Allow: GET, HEAD`; the path exactly, else a plain 404; the store's bytes
with `Content-Type`, `Cache-Control: public, max-age=31536000, immutable`,
`Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy:
cross-origin` and `X-Content-Type-Options: nosniff`, and nothing else; 503 and
`b2b-release: the release store did not answer - nothing served` when the
store fails or takes 4 seconds. It reads the method and the address, nothing
else of the request; it never writes, lists or deletes. esbuild 0.28.2
bundled it as CommonJS with `@netlify/blobs` left out: `config` and `default`
exported, the switch's 404, and neither `coa.js` nor the archive in it.

**The check** - `scripts/b2b-release-check.js [--site <origin>]`: for each
row, git (the commit still on origin/main, built again, both hashes the
record's), the store (both files downloaded and hashed; any release or key
the record does not name), and with `--site` the site (200, the bytes, the
five headers; a 404 said as "not served yet"). One line a release, then
`every file of N releases matches the record` or the count of problems.
Reads only.

**The guide** - `docs/B2B-INTEGRATION.md`: what NOSE receives with each
request and what it never does; the tag (`integrity` from the record,
`crossorigin="anonymous"`, `referrerpolicy="no-referrer"`, `defer`, never a
module); the three CSP lines, path-limited, and the `default-src` trap; every
attribute; purchases only after consent, with the event and a few lines of
page code; the three events and the two lists the browser keeps; the A/B
group; routes; purchase days in UTC; the catalog and the upload call; what to
check when nothing shows.

**The tests:**

- `test/b2b-release-test.js`, 75 checks, a gate after the build, in throwaway
  git worlds with Blobs stood in for as 10.7.11 answers: the same bytes
  three ways (twice, from two clones, from a process with another zone and
  locale); the parts verbatim and in order but for the widget's two lines;
  the bundle run as a page runs it (NoseMatch, NoseRank, NoseBar,
  NoseStrings, `<nose-matches>` defined); every refusal; publishing, the
  clash, the resume, no ETag, a bad read-back, a refused token; the
  function's switch, methods, 13 wrong paths (and one the URL parser folds
  into the right one), headers, HEAD, 404, 503, a hang,
  and what it reads; the check against each kind of mismatch; nothing left
  in the repo; no effect wording; the guide's names, read from the widget,
  the strings and the catalog format.
- `test/b2b-widget-test.mjs`, 181 checks (was 147): the vote by `fetch` with
  no referrer; two `fetch()` calls and no `sendBeacon`; and a pinned release
  built from the tree - one tag under the CSP lines read out of the guide,
  the page's policy `unsafe-url`: the same rail and vote as the five files,
  its stylesheet checked by the release's hash and applied, no request with
  a referrer or a cookie; an altered stylesheet refused (cards unstyled), an
  altered script or a tag without `crossorigin` running nothing.
- **Against broken copies**: 52 deliberate faults, one at a time, in a copy
  of the tree (a scratch harness, not committed) - among them the parts out
  of order, the strings left out, a build time in the header, the widget's
  two lines left alone, the wrong hash for the stylesheet, a name not checked
  against its hash, untracked files ignored, no dirty check, no fetch, a
  checkout behind or ahead accepted, no `onlyIfNew`, a key already there
  taken unread, no ETag needed, the row first, no read-back, the script
  first, a version reused, an unchanged widget released, the token printed,
  a gap in the record; the switch after the method or gone, each of the five
  headers wrong or missing, a 404 cached, a query served, a header read, a
  line on success, version 0, no timeout, a deploy store; the check skipping
  the store, unrecorded releases, headers, a 404 or git; the guide's tag
  without `crossorigin`, an attribute or the consent words missing, its
  `connect-src` the whole origin; the vote by `sendBeacon`, with credentials
  or the page's referrer; the stylesheet with the page's referrer,
  `crossOrigin` always set, its hash never applied - each fails a test.

**Rehearsed end to end** on a throwaway clone of this tree with a bare
origin and a folder standing in for Blobs: `--dry-run` named release 1 and
its two hashes and wrote nothing; the real run wrote the stylesheet, then the
script, read both back and added the row; with the row committed and pushed,
`b2b-release-check.js` said `every file of 1 release matches the record, in
git and in the store`; a second `--dry-run` was refused - the widget's files
unchanged since release 1.

**How it was verified, 2026-10-09, in the cloud workspace.** npm was blocked
(registry.npmjs.org answered 403), so the gates ran on stand-ins, as before,
with one change: `pg` was the real 8.23.0, assembled from its git tags (the
node-postgres monorepo and its seven dependencies, each at the lockfile's
version). PGlite was a throwaway PostgreSQL 16 cluster per instance behind
PGlite's API, with its parse and serialize rules; unpdf its 1.8.0 source
over pdfjs-dist 6.2.108 (56/3, 56/0, clean, 4.124/0.944); the committed
html5-qrcode in place of `build.sh`'s download; Playwright 1.56.0's Chromium
141. ALL GATES GREEN on `a0d433a` before any edit, 28 gates, and after it
with the new gate, 29 - `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944. The
release and widget gates passed on Node 20.20 as well (`.nvmrc`).
`parse-coa.js`, `coa-dates.js` and `extract-text.js` are untouched, so no
reparse is due. `build.sh` renamed `js/b2b-widget.63200a61.js` to
`js/b2b-widget.8f17602f.js`, and the demo page with it; `js/match-math`,
`js/b2b-rank`, `js/aroma-bar`, `js/b2b-strings` and `css/b2b-widget` are byte
for byte as they were. Nothing ran against Netlify, the database or a lab's
server. The Codespace run on the real packages is the one that counts.

**In the Codespace, in this order** (the first release goes to the store;
nothing reaches a store's page until Prompt 8 and a store's tag):

1. Bring the commit in, then `bash scripts/gates.sh` - ALL GATES GREEN, 29
   gates, `b2b release` among them.
2. `git push` - deploys `b2b-release` and the renamed widget. `curl -s -o
   /dev/null -w '%{http_code} %{content_type}\n'
   https://nose-app.com/b2b/releases/1/nose-matches.js` answers `404
   text/plain; charset=utf-8`: the function's own 404, switched off. `404
   text/html` would be the site's 404 page - the route not registered.
3. `node scripts/b2b-release.js --dry-run`, then `node scripts/b2b-release.js`.
4. `git add docs/B2B-RELEASES.md && git commit -m "b2b: release 1" && git push`.
5. `node scripts/b2b-release-check.js` - `every file of 1 release matches the
   record, in git and in the store`.
6. After Prompt 8 switches B2B on: `node scripts/b2b-release-check.js --site
   https://nose-app.com` - `in git, in the store and on the site`.

**Live, 2026-10-09 (US Eastern)**, from the Codespace on `77f96a8`, pulled
from a git bundle: `bash scripts/gates.sh` ALL GATES GREEN, 29 gates - the
first run of `b2b-release-test` on the real packages. `git push` deployed
it. `node scripts/b2b-release.js` published **release 1** from `77f96a8`:
`nose-matches.js` 63,244 bytes, `sha384-suJ0VaeiOSOCl4dkl3RGcgkgkgx2Q/x2l7JZZlO6ecVdOS6DS70MTdcMolJWRW2l`;
`nose-matches.css` 5,720 bytes, `sha384-+XwTP39J7VPdIIBaJs/ypa2cFnJ3Y048Vp1faabsNCwHMkduDlB/PnOa6cD9HZhn`
- stylesheet first, both read back, the row recorded and pushed as
`86cc68a`. `node scripts/b2b-release-check.js`: `every file of 1 release
matches the record, in git and in the store`. The cloud workspace then built
release 1 again from `77f96a8` (Node 22, another machine) and got the same
63,244 bytes and the same hash. **The route is proven**: once the deploy was
published, `/b2b/releases/1/nose-matches.js` answered `404 text/plain;
charset=utf-8` - the function's own reply while switched off, so
`config.path` was read. (A first `curl` straight after the push answered
`404 text/html`: the old deploy, before the new one was published.)

**Found on the way**: `commitSource()` named a commit as it was asked for,
so a short hash put the short form in the header and built other bytes. No
caller used one - the release script and the check pass the full hash - so
release 1 is unaffected. Since `86cc68a`'s follow-up it resolves the full
hash first, and `b2b-release-test` checks a short name builds the same bytes.

### Privacy page, then switch on, 2026-10-09

Prompt 8. The privacy page describes the dispensary program in full, marked
"not switched on yet", before any of it is switched on - as it did for the
archive (§13) - and a second push switches it on: `NOSE_B2B_DB_URL` and
`B2B_ENABLED=1` in Netlify's Production context first, then a deploy whose
page drops the markers and carries the day. No code changed.

```
privacy/index.html          "Dispensaries that use NOSE" (#dispensaries); a fifth "What changed" paragraph;
                            one line under "What an account stores"; the lab-report sentence scoped to a
                            scan or a link; a line in "How long we keep things"
docs/B2B-INTEGRATION.md     the switch-on push: "Not switched on yet ... answers 404" gives the day instead
docs/B2B-CATALOG-FORMAT.md  the same
PARSER-HANDOFF.md           this record; Still open
```

**The probe, before any edit**, on `86cc68a` - ALL GATES GREEN, 29 gates:

- **Sentences the program makes untrue or incomplete**, on the four pages the
  prompt names. Privacy: the title, both descriptions and "This page lists
  everything that leaves your device" - incomplete, since a shopper's browser
  on a dispensary's page asks NOSE for code, a feed and a vote, and
  dispensaries send catalogs; "What changed", four changes; "We do not ask
  for ... anything about what you buy or consume" - true for accounts, and
  given the dispensary line the prompt asked for; "When a report is fetched,
  we keep a copy of the PDF file itself" - untrue, since a catalog's report
  is fetched and read but not kept there; the paragraph on Netlify's logs -
  incomplete, since a shopper's browser reaches nose-app.com without visiting
  it, and the feed's address names the store; "No third-party scripts running
  in your browser ... no outside code loads on this site" - true of this
  site, while on a dispensary's site NOSE's code is the outside code; "How
  long we keep things" - no line. Terms, home and app: none. Outside the four:
  the "Not switched on yet" lines of the two docs above.
- **What each B2B store holds**, read from the two migrations and the
  functions, not the plan:

| Store | Holds | Written by | Kept until |
|---|---|---|---|
| `b2b.stores` | slug, display name, up to 20 https origins, window (12 months unless set), THC and CBD guardrail, created day | `scripts/b2b-store.js` only | delete-store |
| `b2b.store_keys` | store, secret or public, the key's SHA-256 only, created and revoked days | `scripts/b2b-store.js` only | delete-store |
| `b2b.batches` | the catalog's eleven columns (`coa_url` whole but for `#`), list position, first and last listed days | the upload, as `nose_b2b`; a batch left out of an upload is kept, marked out of stock | delete-store - no expiry; the feed shows the window |
| `b2b.batch_reads` | one current reading per batch: read day, lab, form, verdict, reasons, terpenes and the lab's total and moisture and water activity only when accepted, harvest and report days, reader, warnings, the link read, whether it gave a report, the batch and lab ID printed, the new-layout flag. No PDF, no text, no strain, no client | `scripts/b2b-read-catalog.js`, as `nose_b2b`; replaced by a reread | delete-store |
| Blobs `b2b-votes` | one blob per vote: `votes/<slug>/<band>/<up\|down>/<UTC day>/<16 random bytes>`, value `{candidate, score, palateSize}`, no metadata; at most 100 per store per UTC day | `b2b-vote` | delete-store |
| Blobs `b2b-releases` | `<version>/nose-matches.js` and `.css`: code and words, the same for everyone | `scripts/b2b-release.js`, write-once | never deleted |
| the shopper's browser, on the store's origin | `nose-matches-removed` (batch IDs), `nose-matches-voted` (product IDs) | the widget | until the site's data is cleared; never sent |

- Found on the way, all left as they are: a vote's `palateSize` counts
  batches (`palate.basis.used.length`, `js/b2b-rank`'s `voteScore`), where
  `b2b-vote.js`'s header comment says purchases, and still describes
  `sendBeacon`; no code deletes a batch that has left the window; Netlify's
  documented traffic-log fields - client IP, URL, user agent, country,
  referrer, time and the request's own details - include no `Origin`
  ([Log Drains](https://docs.netlify.com/monitor-sites/log-drains), updated
  2026-09-25).
  **The header's two are fixed, 2026-10-15**: it says `fetch`, no cookie, and
  batches (§13, "Comments that match the code").

**Where each claim on the page lives.** No test reads the section - Prompt 8
adds no gate - so this table is how it stays true: change a row's code, and
the page changes in the same commit.

| The page says | From |
|---|---|
| a catalog line's eleven columns; any other column, or one that looks personal, refuses the whole file before a line is read | `lib/b2b-catalog-format.js` (`checkHeader`, `looksPersonal`), `docs/B2B-CATALOG-FORMAT.md` |
| two keys, and only a fingerprint of each kept | `scripts/b2b-store.js` create, `lib/b2b-store.js` `keyHash`, `b2b.store_keys` |
| its name, origins, window (twelve months unless agreed) and THC and CBD limit | `b2b.stores` |
| a catalog read once before signing up, writing a report and nothing else, deleted once sent | `scripts/b2b-coverage.js`; "The coverage report", step 6 |
| batches kept after they sell out or leave the catalog | `APPLY_CATALOG_SQL` |
| one reading per batch and its fields; figures only when trusted; the reason when a link gives none; replaced on a reread; no file, no text | `READ_FIELDS`, `b2b.batch_reads`, `values_only_when_usable`, `nothing_read_unless_fetched`, `scripts/b2b-read-catalog.js` |
| catalog reports never enter the lab-report store | `b2b-read-catalog.js` loads no `coa.js`, `archive.js` or `pdf-store.js` (`b2b-catalog-test`) |
| one fixed version, checked byte for byte by the browser | "Pinned releases"; `docs/B2B-INTEGRATION.md` step 1 |
| nothing but code and styles until a yes; the list after | `js/b2b-widget`'s `_render()` and `_show()` |
| the list's fields, the same for every visitor, only to the store's origins | `FEED_FIELDS`, `FEED_SQL`, `feedFor` |
| no cookie, no referrer | the widget's two `fetch()` calls and its stylesheet link |
| a vote's seven parts; the bought product and a count of batches, never which; 100 a day | `b2b-vote.js` `FIELDS`, `lib/b2b-votes.js` key and value, `voteScore`, `DEFAULT_DAILY_CAP` |
| a day and a random code, never a time | `voteKey()` |
| the browser's two lists | the widget's `REMOVED_KEY` and `VOTED_KEY` |
| the same Postgres at Supabase, a login of its own; votes and code in Netlify's file storage | `probe-db.js` (one project ref, the grants each way); `b2b-votes`, `b2b-releases` |
| kept until the license ends; the list shows the window | no B2B delete but delete-store; `IN_WINDOW_SQL` |
| deleted by hand with one command, the database first, then the votes; running it again finishes it; up to a minute in caches | delete-store (`DELETE_SQL`, then `removeStoreVotes`); b2b-feed's `public, max-age=60` |
| what Netlify's logs hold | [Log Drains](https://docs.netlify.com/monitor-sites/log-drains) |

**Decided here, where the prompt was silent:**

- **A vote's two facts about buying are said.** The question is asked only
  about a product the shopper bought, and its palate size is a count of
  their other batches: two facts about what they bought, never the list.
  "Purchases never reach NOSE" is said of the list, and the vote paragraph
  says what a vote does carry.
- **What Netlify's logs can show is said.** The feed's address names the
  store's public key, and the widget asks for it only after a yes, so a line
  there can show that someone at an IP address said yes on that store's site,
  and when. A vote keeps a day and a random code, never a time, and on a day
  with very few votes it can still be matched with its request - the
  archive's own caveat about order (§13, "Three privacy sentences"). Blobs may
  note write times; nothing of ours reads them.
- **Backups are not on the page.** Supabase's free plan has no daily backups
  ([Backups](https://supabase.com/docs/guides/platform/backups), modified
  2026-10-09: Pro keeps 7 days), and the page says nothing about backups for
  accounts or the archive either (below, Still open).
- **The coverage report is named**: a catalog read once, before signing up,
  in the Codespace, writing nothing but a report, the folder deleted once the
  report has gone.
- **The section is full width.** `.page-grid` stretches each row to its
  taller card: in a cell, the section (4659 px tall at 1280 px wide) would
  have stretched "Deleting your account" beside it to the same height. The
  first grid now closes after the lab-report card, the section follows in its
  own `.wrap` with its text in two columns of an inner `.page-grid` (one below
  760 px), and the rest is a second grid. Existing classes only (`wrap`,
  `page-grid`, `u-pt-20`): no stylesheet changed, so nothing was renamed.
- **Three markers**, "not switched on yet": the fifth "What changed"
  paragraph, the section's first line, its line in "How long". The switch-on
  commit removes all three and dates the first two, and changes the two docs'
  lines in the same push.
- **The terms are unchanged**: no sentence there becomes untrue. "NOSE is
  intended for people aged 21 or over" is true of nose-app.com; whether it
  fits a widget a medical dispensary shows to whoever it serves is for the
  counsel the plan books.
- **The test store of the first checks** is `test-shop`, origin
  `https://test-shop.example` - a name reserved for examples (RFC 2606), so no
  real page is served from it and only a request that sets the header by hand
  gets its feed. It is made after the switch-on deploy, so the page's
  "Nothing in this section was collected before that day" holds; filled with
  `test/fixtures/b2b/catalog.csv`; and removed by `delete-store` at the end,
  which is that command's first live run and the proof of the page's deletion
  paragraph.

**How it was verified, 2026-10-09, in the cloud workspace.** npm was blocked
(registry.npmjs.org answered 403), so the gates ran on stand-ins, as before:
unpdf's own 1.8.0 source, built with esbuild over pdfjs-dist 6.2.108 with
unpdf's own PDF.js patches (every anchor matched); a throwaway PostgreSQL 16
cluster per PGlite instance behind PGlite 0.5.8's API, its type and result
rules ported from its source at that tag; the real pg 8.23.0 assembled from
its git tags, pg-protocol compiled with tsc; the committed html5-qrcode in
place of `build.sh`'s download; Playwright 1.56.0's Chromium 141. ALL GATES
GREEN on `86cc68a` before any edit, 29 gates, and after it - `KAY-CAR-001`
4.124 and `KAY-PRR-001` 0.944. Main had moved on meanwhile (`f925099`, another
session's record of release 1 and its fix to `b2b-release.js`'s commit
names), so both commits were rebased onto it - the handoff the only file in
both - and the gates ran again on each: ALL GATES GREEN. `check-trust`
clean on the tree and on the page by name, its patterns untouched. The page rendered in Chromium at 1280
and 390 px: no horizontal scroll, no page error, the section in the cards' own
type. No file in `js/` or `css/` changed, so `build.sh` renamed nothing;
`parse-coa.js`, `coa-dates.js` and `extract-text.js` are untouched, so no
reparse is due. Nothing ran against the real database, Netlify or a lab's
server. The Codespace run on the real packages is the one that counts.

**In the Codespace, in this order** (part 1 deploys the page with everything
B2B still off; part 2 switches it on; part 3 is the first checks):

1. Bring both commits in, the page's first, then `bash scripts/gates.sh` -
   ALL GATES GREEN, 29 gates.
2. Push the page's commit alone. On the live site `curl -s
   https://nose-app.com/privacy/ | grep -ci "not switched on yet"` answers
   `3`, and `curl -s -o /dev/null -w '%{http_code}\n'
   https://nose-app.com/.netlify/functions/b2b-feed` still `404`.
3. `node scripts/probe-db.js` - probe clean, both B2B migrations among its
   checks; `node scripts/archive-status.js | head -1` - the archive's three
   counts, kept for step 9.
4. Netlify → Project configuration → Environment variables:
   `NOSE_B2B_DB_URL`, its value marked secret, Production only;
   `B2B_ENABLED` = `1`, Production only. A deploy uses the values set when it
   was made, so nothing changes until the next one
   ([Environment variables and functions](https://docs.netlify.com/build/functions/environment-variables),
   updated 2026-10-03).
5. Push the switch-on commit. Then `grep -ci` answers `0`, the page gives the
   day, and b2b-feed answers `400` - switched on, asked without a key.
6. `node scripts/b2b-store.js create test-shop --name "NOSE test store"
   --origin https://test-shop.example`; its two keys into the terminal with
   `read -rs`, never into a file.
7. The test catalog uploaded through b2b-catalog: `received` 24, `upserted`
   20, `markedOutOfStock` 0, rows 19, 20, 24 and 26 refused.
8. The feed: `200` with `access-control-allow-origin:
   https://test-shop.example` for that origin, 20 batches; `403` and no such
   header for another origin or none. A vote: `204`; `delete-store test-shop`,
   a dry run, then counts `1 vote`.
9. `node scripts/archive-status.js | head -1` - the counts of step 3.
   `node scripts/b2b-release-check.js --site https://nose-app.com` - in git,
   in the store and on the site.
10. `node scripts/b2b-store.js delete-store test-shop --yes`; a minute later
    the feed answers `403`.

The results go here in a handoff commit, and the items below that wait on a
live run close with them.

**Switched on, 2026-10-09 (US Eastern).** The commit after the page's takes
out its three markers and gives the day - October 9, 2026, the day the owner
switched it on - and changes the two docs' lines with it. It is pushed after
step 4, so the deploy it makes is the first with the two variables: the page
says "Switched on" in the same deploy that turns the functions on.

**Live, 2026-10-09 (US Eastern)**, from the Codespace, every step as written:

- `893aa6d` deployed: the live page carried the three markers, b2b-feed
  `404`. `probe-db.js`: probe clean. Then `NOSE_B2B_DB_URL` (secret) and
  `B2B_ENABLED=1`, Production only; `3a463ca` deployed: no marker, "Switched
  on October 9, 2026", b2b-feed `400`.
- `test-shop` made (store #1, origin `https://test-shop.example`). The test
  catalog through b2b-catalog: `received 24, upserted 20, markedOutOfStock 0`,
  rows 19, 20, 24 and 26 refused, each in the format's own words - **the
  upload's module form works on Netlify**.
- b2b-feed: `200`, `access-control-allow-origin: https://test-shop.example`,
  20 batches; another origin `403` with no such header; no origin `403`.
  b2b-vote: `204`, and `delete-store` (dry run) counted `1 vote` under
  `votes/test-shop/` - **both functions' module form, strong consistency and
  the conditional write work on the live vote store**.
- `archive-status.js`: `documents 67 extractions 67 parses 194` - the
  archive as last recorded (§13): nothing reached schema nose.
- `b2b-release-check.js --site` first failed on `cache-control` alone (above,
  "Found in the first checks"); after `134d7ea`, `every file of 1 release
  matches the record, in git, in the store and on the site`.
- `delete-store test-shop --yes`: `its 0 readings, 20 listed batches, 2 keys
  and the store itself`, then `deleted 1 vote from Netlify Blobs` - **its
  first live run**. The feed with the old key then answered `403`.
- The test store's keys were pasted into the chat with the output; they died
  with the store. Keys of a real store go only to that store, never into a
  chat or a file.

**Found in the first checks, 2026-10-09**: `b2b-release-check.js --site`
failed on both files with `cache-control is "public,max-age=31536000,immutable"`
- git ok, store ok, the bytes right. Netlify's CDN serves the function's
`public, max-age=31536000, immutable` with the spaces after the commas
dropped: the same directives (RFC 9111 allows optional whitespace around
each comma). The check now compares a header's meaning - case and the spaces
around `,` and `;` aside - not its spelling; `b2b-release-test` checks that a
compacted reply passes and still that a short cache fails, and the new check
fails against the old script. The function is unchanged.

### Pilot plan and report, 2026-10-13

Prompt 9. The pilot's test is written down before day one, and its result is
computed the same way whether the module helps or not. Nothing in it writes
anywhere: a template, a format, a sample-size calculator, and a report that
reads a plan, an export and the store's vote keys, and prints.

```
docs/B2B-PILOT-PLAN.md       the plan, a fill-in template: copied to docs/pilots/<slug>.md, committed before the first day
docs/B2B-PILOT-EXPORT.md     the CSV a store sends at the end: one row per assigned shopper, counts only
scripts/b2b-sample-size.js   --mean <orders> --sd <spread> --lift <relative>: shoppers per group, two means (the primary metric);
                             --baseline <rate> --lift <relative>: votes per band, two proportions (the band check)
scripts/b2b-pilot-report.js  <export.csv> --store <slug>: the plan, the export and the votes, read; the report, printed
test/b2b-pilot-test.js       offline, a gate: "b2b-pilot clean"
scripts/gates.sh             the gate, after b2b strings
```

**The probe, before any edit**, on `cbce6e0` - ALL GATES GREEN, 29 gates:

- `scripts/lab-stats.js` only reads: one `select` from `nose.latest_parses`
  as `nose_writer`, counts printed, nothing written; `REFUSED:` without
  `NOSE_DB_URL`, its usage for an argument. A denominator sits beside every
  share - `accepted 4 of 5 (80%)`, `most common warning 3 of 5: ...`,
  `median coverage 99.0% (5 readings carry one)` - a reading without a figure
  is left out, never counted as zero, and a share of nothing is `-`.
- `test/analysis-test.js` pins those lines exactly, with no effect wording,
  report text, address or fingerprint in any output or source file, and the
  command lines refusing with no secrets.
- The plan's "Proving it works" section (the Claude Docs page "NOSE for
  Dispensaries - B2B Integration Plan", read 2026-10-13): signed-in shoppers
  assigned at random, half and half, before any prompt; whole groups
  compared, test shoppers who never opt in included; the page assigns, so
  NOSE never learns who is in which; the sample size and stopping rule fixed
  before day one. Its metrics: primary "Orders containing an inhalable, per
  assigned shopper, over the test window"; sold-out recovery, a matched
  product bought again within 60 days (test shoppers), opt-in rate; the
  votes, which "should fall from Strong to Weak"; average order value and
  copy and route incidents as guardrails; the store "exports totals per
  group, or rows with a group label and no identity"; published: "every
  metric above including the ones that did not move, and the band-by-band
  vote table". The template follows it, in `matchBand()`'s names: the plan's
  Weak is Low.

**Decided here, where the prompt was silent or pulled two ways:**

- **The count decides** - the owner's choice, 2026-10-13. The plan's
  primary metric is a count, inhalable orders per assigned shopper; the
  prompt sized the test as a difference in two proportions. The first commit
  (`38d0f86`) made the share of shoppers with an inhalable order decide, to
  fit that sizing; asked, the owner chose the count the same day, and the
  second commit made it decide. So the result is the interval of the
  difference in two means - test minus control, each group's own spread -
  and the sample size is one for two means, which needs the spread of the
  store's past counts: `--mean`, `--sd` and `--lift`. The store works the
  two figures out from its own records, one count per signed-in shopper of
  a past period as long as the pilot, zeros included; only the two figures
  go in the plan. The share is shown beside the count, deciding nothing.
  The proportions mode stays, for the band check's votes per band.
- **The plan's numbers are one block the report reads**, ```` ```pilot ````,
  in `docs/pilots/<slug>.md`, committed to this public repository before the
  first day: that commit is the pre-registration. The report takes the first
  commit holding exactly those numbers (`git log --reverse`, each version's
  block compared value by value, so prose changed later - an incident logged
  - does not move it), and gives no result when that commit's day, UTC, by
  committer date, is on or after the first day, when the file has changes
  not committed, when the clone is shallow, or when git cannot be read. It
  runs git with `--no-optional-locks`, so not even git's index refresh is
  written.
- **No peeking.** Until the last day has passed (today, UTC, after
  `last_day`) and both groups hold `shoppers_per_group`, the report prints its
  checks, how far short each group is, and the votes by count - no rate, no
  interval, no result. After the last day a short run shows every figure and
  no result: published as short.
- **What withholds a result**, with every figure still shown: the plan not
  pre-registered; the split failing a chi-squared goodness-of-fit test
  against half and half, p below 0.001 (a sample ratio mismatch, detected as
  [Wikipedia, "Sample ratio mismatch"](https://en.wikipedia.org/wiki/Sample_ratio_mismatch)
  describes, read 2026-10-13); any control shopper with `yes` in `opted_in`,
  `bought_matched` or `bought_matched_again` - control saw nothing of the
  widget, so the groups leaked; `shoppers_per_group` below what the plan's
  own mean, sd, lift, alpha and power give.
- **The plan's alpha decides**: every figure is shown with a 95% interval,
  and the result line names the interval it used.
- **Methods.** The count per shopper, which decides: the normal interval of
  a mean, and for the difference of two, each group's own spread (the
  unequal-variance statistic, NIST/SEMATECH e-Handbook 7.3.1), read with z,
  as the sample size is planned with it: `n = 2 sd^2 (z(1 - alpha/2) +
  z(power))^2 / (mean x lift)^2`, the normal approximation for two means
  with one spread (Chow, Shao and Wang 2008, section 3.2). At a pilot's sizes
  z and t differ in the third decimal; R's `power.t.test`, on t, asks about
  one shopper more a group. A share: Wilson's score interval. A difference
  of two shares: Newcombe's hybrid score interval, his method 10. A ratio of
  sums over shoppers (sold-out visits; revenue per order): the delta method,
  each shopper one unit, since shoppers are what the page randomised. The
  votes per band: the normal approximation R's `power.prop.test` solves -
  pooled variance with no difference, unpooled under the lift, no continuity
  correction. Simulated while building (not committed): counts on 0 to 3,
  mean 0.45 and standard deviation 0.75 in control, 0.6075 and 0.75 in test,
  356 shoppers a group (the size the script gives for mean 0.45, sd 0.75,
  lift 0.35): the rule found the lift in 79.6% of 20,000 runs, and a
  difference that was not there in 4.9%. For the band check's rule, at 437
  votes a band, .30 against .39: 80.2% and 5.0% of 20,000.
- **A wider spread than planned is said.** The report sets the plan's mean
  and standard deviation beside the pilot's control mean and both groups'
  spreads, and when either group's spread is wider than the plan's it says
  the test was less likely than planned to find the lift. It decides
  nothing. No count is capped, in the export or in the past figures, so the
  plan and the result measure the same thing.
- **The band check**: the up share in each of Strong, Good, Moderate and Low,
  from the store's vote keys dated on the pilot's days, first to last -
  listed through `lib/b2b-votes.js`'s own `open()` and `storeVoteKeys()`,
  never read. The result is Strong minus Low by the same method at the plan's
  alpha, once each holds `votes_per_band` (the template sizes it with the
  same script). The four in order is shown as read, not tested; a day that
  reached the cap of 100 is named; votes on other days, and keys in another
  layout, are counted apart.
- **The export** has the prompt's columns and one more, `bought_matched`:
  the plan's repeat metric needs a denominator - of the test shoppers who
  bought a matched product, how many bought it again. NOSE cannot see which
  card a shopper opened, so the store counts a matched purchase; the template
  suggests a marker of the store's own on every catalog `product_url`
  (`?from=flavor`, the same for every shopper). The export is taken at least
  60 days after the last day, so every matched purchase has its full 60.
- **It refuses as the catalog does** - `lib/b2b-catalog-format.js`'s own
  `looksPersonal()` and `parseCsv()`, not copies - plus thirteen identity
  words matched the same way (`shopper`, `member`, `loyalty`, `name`, `birth`,
  `zip`, `zipcode`, `postal`, `postcode`, `account`, `id`, `uuid`, `guid`).
  Unlike the catalog, one unreadable row refuses the whole file - a row left
  out would change every denominator - and a refusal names the row and the
  column, never the value. A row must agree with itself (no more inhalable
  orders than orders, and so on); a control row with a sign of the widget is
  read, counted and withholds the result.

**Found on the way**: `b2b-catalog-test`'s rule that the catalog format has
one reader flags any function named `parseCsv`, `checkHeader`, `readCatalog`
or `looksPersonal` under `netlify/` and `scripts/`. The report's own header
check, for another format, first carried the name `checkHeader` and failed
that gate; it is `checkExportHeader`, and the rule is untouched.

**The references** - nothing is checked against the scripts' own output:

- [NCSS PASS, "Two-Sample Z-Tests Assuming Equal Variance"](https://www.ncss.com/wp-content/themes/ncss/pdf/Procedures/PASS/Two-Sample_Z-Tests_Assuming_Equal_Variance.pdf)
  (read 2026-10-13), for the deciding count's sample size: its Example 4
  validates against Chow, Shao and Wang (2008), pages 63-64 - alpha 0.05,
  power 0.80, sigma 0.10, delta 0.05, two-sided - "the per group sample size
  as 63", with PASS's actual power at 63, 0.8013; its Example 1 - sigma 4.5,
  means 11 and 9, power 0.90 - 107 a group at alpha 0.05 and 151 at 0.01.
  The script gives 62.79, 0.8013, 106.39 and 150.65: all four.
- [NIST/SEMATECH e-Handbook, 7.3.1](https://www.itl.nist.gov/div898/handbook/prc/section3/prc31.htm)
  (read 2026-10-13), for the deciding statistic: assembly times, 11 devices
  on the old process and 9 on the new, listed one by one - means 36.0909 and
  32.2222, standard deviations 4.9082 and 2.5386, and for unequal standard
  deviations t = 2.2694. The report's own `mean()` and `difference()`, fed
  the raw times, give all five.
- [R's `power.prop.test` documentation](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/power.prop.test.html),
  Examples (read 2026-10-13): `n = 76.7` (p1 .50, p2 .75, power .90),
  `n = 10451937` (p1 .5, p2 .501, alpha .001, power .90), `n = 73.37` (p1 .90,
  p2 1.0, power .8), `power = 0.740` (n 50, p1 .50, p2 .75). The formula was
  read from R's source, `src/library/stats/R/power.R`, its "normal case".
- The normal quantile is Wichura's AS 241 (Applied Statistics 37, 1988,
  477-484) and the distribution function Cody's (Mathematics of Computation
  23, 1969, 631-637), with the coefficients as R's `qnorm.c` and `pnorm.c`
  carry them.
- [NIST/SEMATECH e-Handbook, 7.2.4.1](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm)
  (read 2026-10-13): Wilson's interval, n 200, 0.13, one-sided 95% lower limit
  0.09577.
- Newcombe, "Interval estimation for the difference between independent
  proportions: comparison of eleven methods", Statistics in Medicine 17
  (1998), 873-890, Table II, method 10: 56/70 - 48/80, 0.0524 to 0.3339;
  9/10 - 3/10, 0.1705 to 0.8090; 6/7 - 2/7, 0.0582 to 0.8062; 5/56 - 0/29,
  -0.0381 to 0.1926. The paper is paywalled: the four were read from a
  reproduction quoting the table
  ([huggingface/lerobot #4659](https://github.com/huggingface/lerobot/pull/4659),
  read 2026-10-13). The report's interval gives all four to the four
  decimals printed.
- [Wikipedia, "Sample ratio mismatch"](https://en.wikipedia.org/wiki/Sample_ratio_mismatch):
  600 and 400 of 1000 assigned half and half, p = 2.54e-10.

**The test** - `test/b2b-pilot-test.js`, 86 checks, a gate after `b2b
strings`. The references above; the command line's sizes, in both modes,
the lines it prints to paste - as typed - and its refusals; the
export read with a byte-order mark, CRLF, letter case and a blank row; a
personal column refused before any row (its value never shown), eleven
identity columns, an unknown, missing and doubled column, the six ways a
file fails; twelve unreadable rows, each with its reason and none with its
value, and "and 5 more" past twenty; the template's block not filled in;
plan checks and block errors; pre-registration in throwaway repositories -
committed before the first day, prose changed later, numbers changed and not
committed, numbers committed late, committed on the first day, never
committed, a shallow clone, no git; synthetic pilots - a known difference
(270 inhalable orders from 450 shoppers against 198 from 440) found, its
lines checked against the textbook's one-pass sums rather than the report's
code; the plan's spread set beside the pilot's, the wider one said; the
share beside it; the count deciding where the share would not (30% of
shoppers buying in each group, test buyers ordering twice); a bound near
zero never printed as zero; a null; the outcomes swapped read as the exact
mirror; a short run and a run still going
with no `%`, interval or result anywhere; numbers committed late, a lopsided
split, three leaking control shoppers, a plan sized too small, each with its
figures and no result; average order value that fell; the plan's alpha of
0.01 deciding against the 95% shown; the votes - another store's apart, days
outside and a key of another layout counted apart, a capped day named, too
few votes, Strong against Low all three ways, the bands read from
`matchBand()` itself; the vote store asked only to list, no file written,
`pg`, `coa.js`, the archive and `@netlify/blobs` never loaded; the command
line end to end in a throwaway tree with a stand-in `@netlify/blobs`,
writing nothing; no effect wording in the four files or any output; the two
documents naming what the code reads.

- **Against broken copies**: 59 deliberate faults, one at a time - among them,
  for the count, a one-sided alpha, no factor 2, the spread not squared, no
  rounding up, the lift taken as the difference, the paste lines from the
  parsed numbers, `--baseline` with `--mean`, the spread with n, standard
  errors added, zeros dropped, the share deciding again, the plan sized as a
  share, the wider spread never or always said, the count without its
  shoppers, a group of one, a bound near zero printed as zero, the template
  back to a baseline; and, as before, the unpooled variance under no
  difference, a one-sided alpha, no rounding up and an additive lift for
  the votes, Wald for Wilson, Newcombe's limits crossed, n for
  n - 1, a one-tailed split check, the split or the leak ignored, figures
  while short or running, today ignored, the first day counted as before,
  the latest commit taken, changes not committed or a shallow clone
  accepted, a plan sized too small allowed, 95% deciding whatever the alpha,
  only "more" ever found, bad rows dropped, a value echoed, the identity words
  dropped, the personal check after the unknown one, no window, no cap, the
  band result without enough votes or without pre-registration, a
  denominator dropped, up shares while short, a file written, the vote store
  asked for more, an effect word in the plan, "published either way" gone, a
  column missing from the format, no secrets needed - each fails it. A
  scratch harness, not committed. One, any vote key counted, fails by the
  test stopping rather than by a check.

**How it was verified, 2026-10-13, in the cloud workspace.** npm was
blocked (registry.npmjs.org answered 403), so as before the gates ran on
stand-ins: unpdf 1.8.0's `getDocumentProxy` and `extractTextItems`, from its
source, over pdfjs-dist 6.2.108 (56/3, 56/0, clean, 4.124/0.944); PGlite
0.5.8's API, type and result rules, from its source at that tag, over a
throwaway PostgreSQL 16 cluster per instance; the committed html5-qrcode in
place of `build.sh`'s download; Playwright 1.56's Chromium 141. ALL GATES
GREEN on `cbce6e0` before any edit, 29 gates, and after it with the new
gate, 30; for the count's commit, ALL GATES GREEN on `38d0f86` before it and
after, 30 gates - `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944 each time.
`parse-coa.js`,
`coa-dates.js` and `extract-text.js` are untouched, so no reparse is due; no
file in `js/` changed, so `build.sh` renamed nothing; no migration. Nothing
ran against a real database, Netlify or a lab's server. The Codespace run on
the real packages is the one that counts.

**In the Codespace, in this order** (nothing here writes anywhere):

1. Bring both commits in, then `bash scripts/gates.sh` - ALL GATES GREEN, 30
   gates, `b2b pilot` among them.
2. `git push` - nothing new is served: `docs/` and `scripts/` are forced 404.
3. Before a pilot's first day: the privacy page describes the export ("Still
   open"); then `cp docs/B2B-PILOT-PLAN.md docs/pilots/<slug>.md`, fill it
   in - `node scripts/b2b-sample-size.js --mean ... --sd ... --lift ...` for
   `shoppers_per_group`, and `--baseline ... --lift ...` for
   `votes_per_band`, pasting the lines each prints - commit and push.
4. At least 60 days after its last day: the export into `b2b-out/<slug>/`,
   `node scripts/b2b-pilot-report.js b2b-out/<slug>/<file>.csv --store
   <slug>`, the report published, `rm -r b2b-out/<slug>`.

### The compliance kit, 2026-10-13

Prompt 10. Everything a Florida dispensary needs to show the Department what
NOSE's module puts on its website, made from the real widget so that it shows
exactly what ships: a PNG of every screen at phone and desktop width, every
string with where it appears and where its words come from, and the privacy
page's dispensary section as published. A Codespace script that writes one
folder under `b2b-out/` and nothing else; it reads no database and no vote.

```
scripts/b2b-compliance-kit.js       the kit: [--offline] | --store <slug> --key npk_... --origin https://...; [--release N] [--site ORIGIN] [--out DIR]
test/b2b-compliance-kit-test.mjs    Playwright, after the build, a gate: "b2b-compliance-kit clean"
scripts/gates.sh                    the gate, after b2b widget
```

**The probe, before any edit**, on `09f044b` - ALL GATES GREEN, 30 gates:

- Every mode of `/b2b/demo/` in headless Chromium with the Florida words, set
  as a presenter sets them: not asked yet, the flower rail, its basis opened,
  the pre-roll rail (a batch with no panel), the sold-out panel, the vote, the
  vote answered, denied, control - nine states, shown to the owner. Every
  visible string in the widget's shadow root - text, words read aloud only,
  `aria-label`s, tooltips - traced to a Florida template filled in, a word
  `js/b2b-strings` lists in `SHOWN_FROM_OTHER_FILES` (the match labels, the
  bar's words), or the catalog. None was untraced and none was only the
  default variant's, so the Florida variant covers every visible string, and
  the build went on.
- Ten Florida strings belong to conditions the demo's settings do not reach:
  `railEmpty`, `railNone`, `basisNone`, `removedTitle`, `putBack`,
  `putBackAria`, `notUsedOthersOne`, `thcMissing`, `soldOutNoPanel`,
  `soldOutNone`. The kit draws the six the test store can show and lists the
  other four, each exactly as written, with when it shows (below).
- On the demo page a widget kept its basis list open from one state to the
  next (`_basisOpen`), and the pointer left a hover border on a card. So the
  kit draws every screen on a fresh page, and moves the pointer off and the
  focus away before each capture.

**Read 2026-10-13, where the design depends on it:**

- Playwright locators reach into open shadow roots by default, closed ones
  and XPath aside ([Locators](https://playwright.dev/docs/locators), "Locate
  in Shadow DOM"). Whether an element taller than the viewport is captured
  whole is not documented ([Screenshots](https://playwright.dev/docs/screenshots));
  checked here: a 2000 px element in a 390 x 844 viewport at 2x came back
  4000 px tall in Chromium 141.0.7390.37. The kit captures by page
  coordinates with `fullPage` and a clip, which holds either way.
- Node's `fetch` is undici, which does not enforce the Fetch standard's
  forbidden header names ([undici](https://undici.nodejs.org/), "Forbidden
  and Safelisted Header Names"), so the kit can send a store's `Origin` with
  the feed request as a shopper's browser does - checked against a local
  server.
- Florida's emergency rule 64ER25-6, from secondary sources
  ([Fox Rothschild](https://www.foxrothschild.com/cannabis-law/publications/florida-severely-restricts-medical-marijuana-treatment-center-advertising-and-marketing);
  [Vicente LLP](https://vicentellp.com/insights/florda-mmtc-advertising-rules-2026-64er25-6/)):
  an MMTC's website and app must be approved by the Department; an MMTC
  answers for its marketing vendors; marketing may not depict consumption or
  imply recreational use; effective December 31, 2025, per Fox Rothschild.
  The rule's own text was not read: its page asked for a permission not
  given in time. The kit records what the module shows and sends; what to
  submit is for the store and its counsel, and its README says so.

**Decided here, where the prompt was silent:**

- **The pinned release, not the tree.** A store's page pins a release
  (`docs/B2B-INTEGRATION.md`), so what ships is that release's bytes. The
  kit builds the newest recorded release (or `--release N`) again from its
  commit with `scripts/b2b-release.js`'s own `build()`, refuses unless both
  files match the record's two sha384 values, and says whether this
  checkout's widget files are the release's byte for byte (for release 1
  they are). The commit must be in the clone: a shallow one is told to run
  `git fetch origin main`.
- **A blank stand-in for the store's page**: the guide's tag (the release's
  address, `integrity`, `crossorigin="anonymous"`,
  `referrerpolicy="no-referrer"`, `defer`) under the guide's three CSP lines
  with the store's own `'self'`, the attributes a store's page sets, and
  `strings="florida"`. b2b-feed and b2b-vote are stood in for on NOSE's side
  and answer as they do - the origin rule, the headers - and the release's
  files come with `lib/b2b-releases.js`'s headers. The widget takes only its
  font and text colour from the page around it (`css/b2b-widget`); the
  stand-in gives it the system sans-serif and near-black, and the README
  says a store's own page decides those two.
- **Ten screens**: the prompt's five first - 01 before a yes, 02 the rail,
  03 the sold-out panel, 04 a batch with no terpene panel, 05 the vote -
  then five that show the rest of the words: 06 the basis opened, 07 a
  product taken out of the palate, 08 the vote answered, 09 a rail with
  nothing to compare with yet, 10 a rail with nothing available (routes that
  leave its category out). Denied and control show nothing, so they are
  said, not drawn. Each screen's category, product and routes are chosen in
  the page by the release's own `NoseRank`, as the widget would choose; a
  screen a store's data cannot reach is listed with why, never faked.
- **Phone 390 x 844 and desktop 1280 x 800, both at 2x**, each PNG the widget
  with the stand-in page's 16 px margin. Where a list of cards scrolls
  sideways (screens 02 to 04) there is one more PNG per scroll until every
  card has been in view, and strings.md names the PNGs each card is in.
- **"Every visible string"** is everything a shopper sees or a screen reader
  reads: text, `aria-label`s, `title`s, the visually hidden match line, each
  with how it is presented. Strings in the closed "Based on ..." list are
  listed as there, shown and read only once it is opened - a closed
  `<details>` keeps them from screen readers too - and are never counted as
  shown.
- **It fails closed on words.** A screen with any string that is not the
  Florida variant's, a `SHOWN_FROM_OTHER_FILES` word or the catalog's stops
  the kit there, naming each such string and, where it is one, the default
  variant's key. Every key of both variants must be placed in the kit's
  `WHEN` - the sentence strings.md gives for a string no screen showed - or
  the kit refuses until it is.
- **The store's words apart.** Product names, brands and THC and CBD figures
  are listed as the store's to clear. NOSE does not review them.
- **`--store <slug> --key npk_... --origin https://...`**: the public key and
  an origin the store allows, because the feed answers only the store's
  origins and the database keeps only the key's hash. The feed is fetched
  once from `--site` (default `https://nose-app.com`) with that origin, no
  cookie, no referrer and no redirect - the list every visitor gets - and
  nothing else of the store is read. An `nsk_` key is refused before any
  request. Purchases are made up from that list by a rule after the demo's
  own: the usual (the first batch out of stock, with a panel, whose category
  has one in stock) three times, two more of its category, one refused and
  one unread of it, the first of each other category, a batch the store
  never listed, and the usual again from before the window. Such a shopper
  has an order in every category, so screen 09 hands the widget the list
  less one category's orders, and the README says so.
- **The test store** takes the demo page's own example list, read out of the
  built `js/b2b-demo` (a change of its shape refuses the kit), dated back
  from the day of the run as the demo dates it.
- **data.md**: the `#dispensaries` article as Markdown - headings,
  paragraphs, bold, links as the page writes them - and every other
  paragraph or list item of the page that names dispensaries, under its
  heading (three today). The same code converts `privacy/index.html` and
  `<site>/privacy/`, in the browser; a difference refuses the kit, and so
  does a page it cannot read, unless `--offline`, which only the test store
  takes and which data.md then states at the top.
- **What left the page**: every request either stand-in receives is checked
  after each screen - the release's two files, the feed by the key alone,
  votes of exactly six fields about that screen's product, the store's page
  and stylesheet - and anything else, a cookie, a referrer, or a purchased
  batch ID or day anywhere in a request, refuses the kit. The README
  tabulates them.
- **The folder**: under `b2b-out/` only, checked against git's own ignore
  rules; built in a staging folder beside it and moved into place whole; an
  earlier kit is replaced, anything else refused; a refused run leaves
  nothing, not even a folder it made. It prints one line a screen and the
  folder, never a whole key.

**The test store's kit**: 10 screens, 37 PNGs - for the rail and for the
sold-out panel 7 at phone width and 3 at desktop, for the batch with no
panel 2 and 1, one each otherwise; 863 strings across the ten screens. Four
Florida strings no screen showed: `soldOutNoPanel` and `soldOutNone` (the
sold-out product's latest batch has a panel, and its category has batches in
stock), `thcMissing` (every batch lists THC) and `notUsedOthersOne`. Left the
page: 21 requests for each release file, 18 feeds (every screen but the two
opt-ins) and 2 votes - `D-106`, Cold Creek Kush, score 96, Strong, a palate
of 2 batches, up.

**Found on the way:**

- **The privacy page says "flavor match" and "was its flavor close?"** about
  the dispensary program, where the Florida variant says aroma. It is NOSE's
  page, not the dispensary's, and data.md gives it as published; whether a
  Florida submission wants other words there is for counsel ("Still open").
- The test store's catalog gives a CBD figure for 5 of its 30 batches, so
  most cards say "CBD not listed", and THC for all 30, so "THC not listed"
  never shows with it.
- A first draft counted a string as shown on screen 02 when it sat in the
  closed basis list there; the test now compares every Florida key's "Shown
  in" with the screens where it is seen or read aloud.

**The test** - `test/b2b-compliance-kit-test.mjs`, 64 checks, a gate after
`b2b widget`. Every run is in a throwaway git world: this tree's built `js/`
and `css/`, the demo, the privacy page, the integration guide and
`.gitignore`, committed, with release 1 built from that commit by
`scripts/b2b-release.js` and recorded - so the kit builds from git as in the
Codespace, and this repository is never written. It checks: the kit's
`WHEN` against both variants, its own words for effect wording, the
categories and routes taken from the catalog format; the stand-in page's
CSP against the guide's lines and its one tag; the test store's kit - its
files and their names, the scroll pages, every PNG's width at 2x, README.md
(the release, its commit and hashes, an index naming every file, every PNG
in the screens table, data.md called unchecked under `--offline`, the demo's
purchases and days, the four kinds of request and their counts), strings.md
(every Florida string as written and in order, a section a screen, every
string traced and
none to the default variant, each Florida row holding its template's own
words, apart from the kit's trace, "Shown in" key by key, the four not
rendered, the closed list, the removal, the thanks, the empty rails, the
no-panel card, the catalog's words as written), data.md (every paragraph of
the section and every other mention, the `--offline` line, links as
written), no time of day, no effect wording, the world untouched outside
`b2b-out/`; a store's kit against a stand-in site - one feed request with
the key alone and the store's origin, one privacy read, the earlier kit
replaced, the made-up purchases by the rule, screen 09's shorter list and
what it shows, the comparison said, the store's names and none of the test
store's; sixteen refusals, each leaving the world as it was - a secret key,
`--offline` with a store, an origin with a path, a folder outside `b2b-out/`, a folder
holding something else, a release not recorded, a site that cannot be
reached, a feed that answers 403, a published section that differs, a
record that does not match, a commit not in the clone, `b2b-out/` not
ignored, a widget showing the default words, a widget that breaks the
store's CSP, a vote with a seventh field, a vote carrying purchase days in
its own fields; no `pg`, `@netlify/blobs`, `lib/b2b-store.js`,
`lib/archive.js`, `lib/pdf-store.js` or `coa.js` loaded; this repository's
`git status` and `b2b-out/` as they were.

- **Against broken copies**: 46 deliberate faults, one at a time, in copies
  of the repo - among them the default words, a trace that never fails or
  takes the default variant, the record not compared, a release built from
  the tree, a folder outside `b2b-out/` or a foreign one replaced, `b2b-out/`
  not ignored, a secret key or `--offline` with a store let through, the feed
  without the store's origin, with a referrer or fetched twice, the published
  page not compared or the `--offline` line dropped, the wrong section, the
  demo's purchases reversed, made up or a day off, the usual in stock, a
  closed list counted as shown or not said, the request audit or the
  purchase search off, no scroll pages, one width, the index missing PNGs, a
  key missing from `WHEN`, an effect word in a comment, the store's database
  code loaded, a staging or an empty folder left, an earlier kit refused or
  merged, the origin unsaid, the CSP dropped, its violations ignored or
  `'unsafe-inline'` added, the tag without `integrity` or `referrerpolicy`,
  the whole key printed, the not-rendered mark dropped, the other mentions
  skipped, links resolved, a time of day - each fails it. A scratch harness,
  not committed. Its first run let two through - the index listing one PNG a
  screen, and screen 09 handed a store's whole list - and the test gained the
  checks that catch them; run again on the final kit and test, 46 of 46.

**How it was verified, 2026-10-13, in the cloud workspace.** npm and
cdn.jsdelivr.net were refused by the egress policy, so the gates ran on
stand-ins built from upstream source at the lockfile's versions: pg 8.23.0
and the thirteen packages under it from their git tags, pg-protocol compiled
with tsc; unpdf 1.8.0's text extraction from its source over pdfjs-dist 6.2.108,
with unpdf's own eight literal PDF.js patches, every anchor matched; PGlite
0.5.8's parsers, serializers, result rules and query flow from its source at
that tag, over a throwaway PostgreSQL 16 server per instance; the committed
html5-qrcode in place of `build.sh`'s download; Playwright 1.56.0's Chromium
141. ALL GATES GREEN on `09f044b` before any edit, 30 gates, and after it
with the new gate, 31 - `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944. The new
test passed on Node 22.22 and 20.20 (`.nvmrc`). `parse-coa.js`, `coa-dates.js`
and `extract-text.js` are untouched, so no reparse is due; no file in `js/`
or `css/` changed, so `build.sh` renamed nothing; no migration. The
workspace's egress policy refuses nose-app.com (403), so there the kit's
comparison with the published privacy page ran only against a stand-in; its
first run online was the Codespace's (below, "Live").

**In the Codespace, in this order** (nothing here writes anywhere but
`b2b-out/`, which git ignores):

1. `git pull --ff-only`, then `bash scripts/gates.sh` - ALL GATES GREEN, 31
   gates, `b2b kit` among them. If a browser gate says Playwright is not
   installed: `npm install --no-save playwright`, then
   `npx playwright install --with-deps chromium`.
2. The test store's kit, checked against the live privacy page:
   `node scripts/b2b-compliance-kit.js` - it ends `compliance kit written:
   b2b-out/test-store/compliance-kit/ - 10 screens, 37 PNGs, README.md,
   strings.md, data.md`.
3. In the Explorer, open `b2b-out/test-store/compliance-kit/README.md`
   (right-click, Open Preview), then `strings.md`, `data.md` and the PNGs.
4. For a store: `node scripts/b2b-compliance-kit.js --store <slug> --key
   <its npk_ key> --origin <an origin it allows>`. The kit is in
   `b2b-out/<slug>/compliance-kit/`. Send that folder to the store, then
   `rm -r b2b-out/<slug>`: nothing else holds a copy.

**Live, 2026-10-13 (US Eastern)**, from the Codespace, steps 1 and 2 as
written: `git pull --ff-only` fast-forwarded `09f044b..7150db8` (4 files);
`bash scripts/gates.sh` said ALL GATES GREEN, 31 gates - the first run of
`b2b-compliance-kit-test` in the Codespace, on its own Playwright and
Chromium - with `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944. Then `node
scripts/b2b-compliance-kit.js`, without `--offline`: `compliance kit
written: b2b-out/test-store/compliance-kit/ - 10 screens, 37 PNGs,
README.md, strings.md, data.md`, with the cloud workspace's strings a
screen - 2, 200, 187, 45, 4, 200, 199, 5, 5 and 16. **The published page is
the one this checkout holds**: without `--offline` the kit reads
`https://nose-app.com/privacy/` and writes nothing unless its dispensary
section and every other mention of dispensaries on it are
`privacy/index.html`'s, word for word - the first time that comparison ran
against the real site.

### The day the lab finished, in a store's readings, 2026-10-14

**Most of a store's readings carried no date.** Since "When the lab finished"
(§13) the parser reads `testedOn`, and the archive and the card carry it;
`b2b.batch_reads` kept `harvest_on` and `report_on` only, and
`lib/b2b-store.js` keeps the parser's fields by name, so on the demo test
store 15 of its 28 readings carried no day at all. Now a store's readings and
its feed carry the day the lab finished beside the other two. This changes
data, not screens: nothing on the B2B side shows a date yet.

```
supabase/migrations/20261015010000_nose_b2b_tested_on.sql  batch_reads.tested_on, and a CHECK of its own
netlify/functions/lib/b2b-store.js   READ_FIELDS, buildRead, UPSERT_READ_SQL, UPSERT_UNFETCHED_SQL, FEED_SQL,
                                     FEED_FIELDS, feedBatch: testedOn / tested_on after the harvest day
netlify/functions/b2b-feed.js        its header's list of fields
scripts/b2b-demo-feed.js             reading() carries tested_on; b2b/demo/test-store.json rewritten with it
scripts/probe-db.js                  one admin check: "the b2b tested_on migration is pushed"
privacy/index.html                   one phrase in the dispensary section; a seventh "What changed"
test/b2b-store-test.js               155 checks (was 151)
test/b2b-catalog-test.js             90 checks (was 81)
test/b2b-endpoints-test.js           91 checks, as before: five of them check one field more
test/b2b-compliance-kit-test.mjs     one count: four other mentions of dispensaries on the privacy page, not three
```

**The probe, before any edit**, on `e496d67` - ALL GATES GREEN, 32 gates:

1. Where the parser's dates travel in B2B - `READ_FIELDS`, `buildRead`,
   `UPSERT_READ_SQL`, `UPSERT_UNFETCHED_SQL`, `FEED_SQL`, `FEED_FIELDS` and
   `feedBatch` in `lib/b2b-store.js`, the `nothing_read_unless_fetched`
   constraint, `b2b-feed.js`'s header and `reading()` in
   `scripts/b2b-demo-feed.js`: each carries the harvest and report days, and
   `testedOn` / `tested_on` is in none of them. `LISTED_SQL` (the coverage
   report's `--store`) reads no day at all.
2. What reads the feed's `harvest_on` or `report_on`: nothing in `js/`. The
   widget and the ranking engine read neither; the demo page reads, of a
   batch's reading, its `lab` and verdict only. So no screen changes, and no
   file in `js/` either.
3. The demo test store, from `b2b/demo/test-store.json` and the fixtures -
   28 readings of its 30 batches:

   | Lab | Readings | By harvest | By report alone | Neither | Neither, with a `testedOn` |
   |---|---|---|---|---|---|
   | ACS | 5 | 2 | 0 | 3 | 3 |
   | ACT | 2 | 0 | 0 | 2 | 2 |
   | Kaycha | 10 | 9 | 0 | 1 | 1 |
   | Method | 3 | 0 | 0 | 3 | 3 |
   | Modern Canna | 6 | 0 | 0 | 6 | 6 |
   | TerpLife | 2 | 0 | 2 | 0 | - |
   | **All** | **28** | **11** | **2** | **15** | **15** |

   §13's Still open item this closes ("Store catalogs carry no `testedOn`")
   named Method and Modern Canna; the gap was wider - ACT's reports too, and
   the Kaycha and ACS reports that print no harvest day.

**Read 2026-10-14, where the design depends on it.** The PostgreSQL 16.15
documentation, as installed with the workspace's PostgreSQL 16 (the same
text as https://www.postgresql.org/docs/16/sql-altertable.html and
https://www.postgresql.org/docs/16/sql-grant.html; the web pages themselves
were not fetched - the request went unanswered):

- ALTER TABLE, Notes: a column added with no DEFAULT is NULL for existing
  rows, "In neither case is a rewrite of the table required"; adding a CHECK
  scans the table to verify its rows, without a rewrite; several changes in
  one ALTER TABLE take one pass, under the strictest lock any of them needs
  (ACCESS EXCLUSIVE unless noted).
- GRANT, Notes: a role may SELECT, INSERT and so on a column "if they hold
  that privilege for either the specific column or its whole table". So
  `nose_b2b`'s table grants on `batch_reads` cover the new column with no
  GRANT - which `b2b-store-test` proves, writing every fixture's reading as
  `nose_b2b`.
- `supabase db push` refuses a local migration that sorts before the last one
  the project applied (§13, "When the lab finished", CLI reference read
  2026-10-14). The real project's last is `20261015000000_nose_tested_on.sql`,
  so this one is `20261015010000`.

**The migration** - `20261015010000_nose_b2b_tested_on.sql`, one ALTER TABLE
and a comment:

- `b2b.batch_reads.tested_on`, a `date`, NULL when the report gives none,
  commented as the day the lab finished, about the product and never a person.
- **`tested_on_only_when_fetched`**, a CHECK of its own: `fetched OR tested_on
  IS NULL`. A link that gave no report read nothing, so it holds no day the
  lab finished, as `nothing_read_unless_fetched` keeps the other two off it.
  That constraint stays as pushed - widening it would have meant dropping and
  re-adding it.
- No DROP, no GRANT or REVOKE, nothing in schema `nose`. No time of day: the
  column is a `date`, and `b2b-store-test`'s "every day is a date column"
  now lists it.

**`lib/b2b-store.js`.** `testedOn` joins `READ_FIELDS` after `harvestOn`, and
`buildRead` keeps it as it keeps the other two days, whatever the verdict - a
refusal keeps its days and no figure, as before. `UPSERT_READ_SQL` writes it
on insert and on a reread; `UPSERT_UNFETCHED_SQL` clears it with the other two
days, so a dated reading replaced by a link that gave no report keeps none
(and the CHECK would refuse the row if it did not). `FEED_SQL` selects it
from the current reading only (`case when cur.current`), so a corrected
link's old day never leaves the database; `FEED_FIELDS` and `feedBatch` carry
`tested_on` after `harvest_on`. The comments that spoke of a reading's two
days now say three; the listing days' comments keep theirs.

**The feed** gains one field, added and never renamed: `... lab, harvest_on,
tested_on, report_on, usable, ...`. Release 1 reads the feed by name and reads
none of the three days (§14, "The feed and the vote are not versioned"), so
no release is needed, and `b2b-release-check` has nothing new to compare.
`b2b-endpoints-test` pins the new list.

**The demo test store** - `node scripts/b2b-demo-feed.js` rewrote
`b2b/demo/test-store.json` with one new line per batch and nothing else (30
added, 0 removed; every other field and the store identical). Readings with
no day: 15 of 28 became 0 of 28. `tested_on` on 26 of its 30 batches - null on
TerpLife's two readings, which keep their report day, and on the two batches
with no reading. Dated readings by lab: ACS 2 to 5 of 5, ACT 0 to 2 of 2,
Kaycha 9 to 10 of 10, Method 0 to 3 of 3, Modern Canna 0 to 6 of 6, TerpLife 2
of 2.

**The reader on the test catalog** (`b2b-catalog-test`): 14 of its 19
readings carry `tested_on`, every accepted one; the refused GreenRoads report
(TerpLife, no row) and the broken PDF carry none, nor do the 3 links that
gave no report. Four accepted readings are dated for the first time, by
`tested_on` alone: KAY-AIO-001 on two batches, the Method batch read through
its portal and Modern Canna's. Its 19 readings and 14 accepted are as before.

**`probe-db.js`**, as the admin, beside the reading-source check: "the b2b
tested_on migration is pushed: b2b.batch_reads keeps the day the lab
finished" - the column, a `date`, and the CHECK by name. Rehearsed on PGlite's
stand-in: it fails before the migration, alone among the b2b admin checks,
and passes after.

**Privacy.** The dispensary section's "What we read and keep" said "the
harvest and report dates"; it now says "the harvest date, the day the
laboratory finished testing and the report date". The feed paragraph's "the
report dates" already covers every date a report gives, so it stays. "What
changed" gains a seventh change, one sentence:

> **A seventh change:** since **October 15, 2026**, a dispensary's batch
> readings also keep the day the laboratory finished testing - a date
> printed on the lab report, about the product and not about anyone.

Both names what is kept; `check-trust` clean. The compliance kit's data.md
carries both: the phrase in the section, and the seventh change as one more
paragraph outside it that names dispensaries. Both sentences were shown to
the owner before the commit.

**The tests.** Every gate keeps its expected line.

- `b2b-store-test`, 155 checks (was 151): `batch_reads`' columns end in
  `tested_on`; the date columns list it; `buildRead` keeps a refusal's three
  days and its keys are still `READ_FIELDS`, `testedOn` between `harvestOn`
  and `reportOn`; every fixture's stored `tested_on` is the parser's
  `testedOn` - 54 of the 59 carry one; the new migration sorts after
  `20261015000000_nose_tested_on.sql`, is pinned byte for byte to its first
  push, only adds (one ADD COLUMN, one ADD CONSTRAINT, a comment, no DROP,
  grant or `nose.`), and joins the no-effect-wording scan.
- `b2b-catalog-test`, 90 checks (was 81): the 15 readings the parser read
  keep its three days; MTL-FLW-002 through its portal 2026-08-31 with no
  harvest or report day; MCL-FLW-002 2021-10-05; KAY-CAR-001 2025-07-11 beside
  its harvest day 2025-07-07; 14 of 19 dated by it, every accepted one; the
  four dated by it alone; a corrected link read again carrying KAY-FLW-003's
  days, none of KAY-FLW-001's; the database refusing a link that gave no
  report with a `tested_on`, by `tested_on_only_when_fetched`, on a row
  `nothing_read_unless_fetched` passes; a dated reading replaced by a link
  that gave none keeping no day.
- `b2b-endpoints-test`, 91 checks: the pinned field list gains `tested_on`
  after `harvest_on`; the accepted reading carries 2025-07-11; the refused
  TerpLife one null; a link that gave no report, a corrected link (whose
  stored old reading still holds 2026-01-23) and no link, null.
- `b2b-compliance-kit-test`, 64 checks, as before - one count changed, in a
  file the prompt did not list: data.md gives every paragraph of the privacy
  page outside its dispensary section that names dispensaries, and the test
  pinned three. The seventh change names them, so there are four, under the
  same three headings. Found by the first full run of the gates; the kit,
  run `--offline`, wrote `10 screens, 37 PNGs` with the seventh change under
  "What changed, and when".
- **Against main's own code** the three stop: `b2b-store-test` at the missing
  migration, `b2b-catalog-test` at the missing column, `b2b-endpoints-test`
  after 3 failures. **Against 16 broken copies**, one fault each - `testedOn`
  dropped from `buildRead`, kept only on an accepted read, put after
  `reportOn`; not written on insert, not written on a reread, not cleared by
  a link that gave no report; the feed's day not limited to the current
  reading, missing from `feedBatch`, after `report_on`; the migration without
  its CHECK, edited by one space, sorting before the archive's, carrying an
  effect word, missing, or with a `text` column; the demo feed without
  `tested_on` (its `--check`, which `b2b-widget-test` runs) - each fails its
  test. A scratch harness, not committed.

**What did not move.** The parser, so no reparse; `coa.js` and its replies;
schema `nose` and the archive; every pushed migration; `nose_b2b`'s grants;
`js/match-math.*.js` and `match-golden.json`; every score, band and ranking;
every other field of the feed and of `test-store.json`; every `js/` file, so
`build.sh` renamed nothing and no release is needed; the compliance kit's 10
screens and 37 PNGs; every gate's expected line.

**How it was verified, 2026-10-14 to 15 (US Eastern), in the cloud
workspace.** npm was unreachable there (registry.npmjs.org did not resolve, cdn.jsdelivr.net
refused), so as in earlier sessions the gates ran on stand-ins built from
upstream source at the lockfile's versions: pg 8.23.0 and the packages under
it from their git tags, pg-protocol compiled with tsc; unpdf 1.8.0 built with
esbuild from its source over pdfjs-dist 6.2.108, with its own eight literal
PDF.js patches, every anchor matched; PGlite 0.5.8's type parsers and
serializers, result rules and query flow ported from its source at that tag,
over a throwaway PostgreSQL 16 server per instance; the committed
html5-qrcode in place of `build.sh`'s download; Playwright 1.56.0's Chromium.
ALL GATES GREEN on `e496d67` before any edit, 32 gates, and on the change, 32,
with `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944. Nothing ran against the real
database, Netlify or a lab's server. The Codespace run on the real packages
is the one that counts.

**In the Codespace, in this order** (the migration adds a column to a table
that should hold no row):

1. `git pull --ff-only`, then `bash scripts/gates.sh` - ALL GATES GREEN, 32
   gates.
2. A read-only count as `nose_b2b`, counts only - stores, batches and
   readings in b2b. Expect 0, 0 and 0: `test-shop` was deleted on 2026-10-09
   with no reading. Any reading: stop - it would need `--reread`, which
   fetches every report again from the labs.
3. `npx supabase db push --db-url "$NOSE_DB_ADMIN_URL"` - one migration,
   `20261015010000_nose_b2b_tested_on.sql` - then `node scripts/probe-db.js`:
   probe clean, "the b2b tested_on migration is pushed" among it. Before the
   deploy, because the feed and the reader read the new column.
4. `git push` - deploys.
5. Once the deploy is live: b2b-feed answers `400`, asked without a key; and
   `node scripts/b2b-compliance-kit.js`, without `--offline`, ends
   `compliance kit written: ... 10 screens, 37 PNGs` - it writes the kit only
   when the live privacy page matches this checkout word for word.

**Live, 2026-10-15 (US Eastern)**, from the Codespace, every step as written:

- `d72cef5` pulled from a git bundle (`e496d67..d72cef5`, a fast-forward, 12
  files). `bash scripts/gates.sh`: ALL GATES GREEN, 32 gates, on the real
  packages - no stand-ins - with `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944.
- The read-only count as `nose_b2b`, from a scratch script in `/tmp`, run and
  deleted, never committed: `0 stores, 0 batches, 0 readings`. No reading to
  read again, so no `--reread`.
- `npx supabase db push --db-url "$NOSE_DB_ADMIN_URL"`: `--dry-run` listed
  `20261015010000_nose_b2b_tested_on.sql` alone; then it was applied.
  `probe-db.js`: probe clean - "the b2b tested_on migration is pushed:
  b2b.batch_reads keeps the day the lab finished" among it, every other
  archive and B2B check as before, Enforce SSL on; the Data API checks
  skipped, no `NOSE_PUBLISHABLE_KEY`.
- `git push`, `e496d67..d72cef5`, deployed. b2b-feed answered `400`, asked
  without a key.
- `node scripts/b2b-compliance-kit.js`, without `--offline`: `compliance kit
  written: b2b-out/test-store/compliance-kit/ - 10 screens, 37 PNGs,
  README.md, strings.md, data.md`, with the strings a screen of 2026-10-13's
  live run - 2, 200, 187, 45, 4, 200, 199, 5, 5 and 16: no screen moved.
  The kit writes nothing unless the published privacy page's dispensary
  section and its other mentions of dispensaries are `privacy/index.html`'s
  word for word, so the new phrase and the seventh change are live, dated
  October 15, 2026 - the day the deploy went out.

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
- `NOSE_B2B_DB_URL` and `B2B_ENABLED=1` are in Netlify's Production context
  since 2026-10-09 (above, "Privacy page, then switch on", step 4);
  `NOSE_B2B_DB_URL` is a Codespaces secret as well.
- **Settled 2026-10-09: the vote goes by `fetch`, not `sendBeacon`**
  (above, "Pinned releases"). A beacon from a page served with
  `Referrer-Policy: no-referrer` or `same-origin` carries `Origin: null`
  where a browser follows the standard, which the origin rule refuses; it
  carries the site's cookies (credentials `include`); and from an order page
  served with `unsafe-url` or `no-referrer-when-downgrade` it carried the
  page's whole address to NOSE. The vote is now `fetch(..., { method: 'POST',
  mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
  keepalive: true, body })`: a string body, so still a simple request with no
  preflight, the store's origin always sent, no cookie, no referrer.
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
  times, which nothing of ours reads (§13, "The PDF half"). The privacy page
  says all of it since 2026-10-09 (`#dispensaries`), and two things more: on
  a day with very few votes a vote can still be matched with its request, and
  a feed request - made only after a yes - shows that someone at that address
  said yes on that store's site (above, "Privacy page, then switch on").
- **A batch in the feed carries its catalog `name` and `brand`**, and the
  widget shows them as the store wrote them; Prompt 5's ranking reads
  neither. A product voted on is named by its `product_id` alone. A store's
  own product names can hold words NOSE's strings never would - a "Cured
  Resin" - and `b2b-strings-test` reads NOSE's words,
  not a catalog's: the store's names are the store's to clear. The compliance
  kit lists them apart, as they render, since 2026-10-13.
- **Suggestions across forms stay off** (Prompt 6, "The widget"): the rail's
  palate is made of the purchases in its own category, looked up in the feed,
  and its basis line names the category. Prompt 5's `palateFrom()` takes no
  category, so a rail across forms ("vapes for a flower palate", labelled, as
  the plan keeps it for after the pilot) is the widget's choice of purchases
  and one more string, and needs its own prompt.
- **Purchase days are UTC days**, as `docs/B2B-INTEGRATION.md` tells a
  store's developer since 2026-10-09. A page that hands local days anyway
  moves a purchase near midnight by one day - one day at the window's edge.
  `today` comes from the device's clock when a call is handed none, and a
  clock that is wrong moves the window by its error: the feed carries no date.
- **A guardrail half with figures missing keeps batches out.** A store that
  sets CBD's half while leaving `cbd_percent` empty on some batches sees those
  batches left out of every list, and a shopper whose basis has no CBD figure
  gets an empty list. That is the fail-closed reading of "within
  this many points of the median"; the coverage report does not yet count
  missing THC or CBD figures, which would show a store the cost before it sets
  one.
- **In Node the engine needs this repo's layout**: `js/b2b-rank.<hash>.js` takes
  its maths through `../scripts/lib/match.js`. Decided with Prompt 7
  (2026-10-09): a release is a browser file - in Node its maths file takes
  `module.exports` and the engine then asks for `../scripts/lib/match.js` - so
  campaign palates on a dispensary's server ("Later") carry this repo's files,
  at a pinned commit, until their own prompt says otherwise.
- **The load-order rules compare line numbers.** For js/nose, js/b2b-rank,
  and since Prompt 6 js/aroma-bar and js/b2b-widget, two scripts on one line
  fail the build, and an `async` script would pass it and still run out of
  order. No page does either today.
- **The no-panel sentence is not the prompt's** (s14, "The widget"): "No
  terpene panel available for this batch", because "No terpene panel on this
  batch's report" would be untrue of a batch whose report NOSE has not read
  or could not fetch. The owner decides; one line in `js/b2b-strings` changes
  it.
- **No attribution line yet.** "Flavor match by NOSE" waits on the owner's
  choice; it goes into `js/b2b-strings`, both variants, and the strings test
  then reads it.
- **The Florida variant is NOSE's reading of 64ER25-6**, not counsel's.
  Whether the rule reaches a vendor's widget, and whether words like
  "palate" or a store's flavor-named products count, is for the
  Florida cannabis-regulatory attorney the plan books. The compliance kit
  renders the variant for the Department since 2026-10-13; counsel's review
  is still to come.
- **Two attributes and one event more than the prompt named**: `strings`
  and `feed`, and `nose:palate-restored`, documented with the rest in
  `docs/B2B-INTEGRATION.md` since 2026-10-09.
- **The widget keeps two lists in the shopper's browser**, in storage on the
  store's own origin: the batches taken out of the palate
  (`nose-matches-removed`) and the products voted on (`nose-matches-voted`).
  Neither reaches NOSE; the privacy page says they exist, and that clearing the
  site's data in the browser clears them (since 2026-10-09). The vote is once per product per
  browser, so one shopper on two devices can vote twice.
- **The widget names its stylesheet's built file**, written in by `build.sh`,
  and reads NOSE's origin from `document.currentScript`. A pinned release
  carries its own stylesheet and names it, with its hash, and stays a
  classic script (above, "Pinned releases"); the integration guide says not
  to load it as a module.
- **The demo page goes live with the next deploy**, at `/b2b/demo/`: static,
  noindex, linked from nowhere, its feed a file. Its votes reach the
  production b2b-vote, which answers 404 until Prompt 8 and then refuses the
  made-up key as no store's. Its test store is rewritten by
  `node scripts/b2b-demo-feed.js` after a parser change moves a fixture's
  reading - the widget test fails until it is.
- **At most 12 cards** on the rail and the sold-out panel, a constant in the
  widget; the rest of the menu is the store's page. The basis counts every
  purchase it does not use and names only those of the category with no
  panel.
- **`wip/nose-farnesene-wip.js` still holds an old copy of the bar**, as it
  does of the maths: an unfinished draft of the whole old bundle, loaded by
  nothing. The widget test lists it, as `match-test` does.
- **The feed and the vote are not versioned.** A release pins the widget's
  code, not what it reads: a change to `b2b-feed`'s fields or to what
  `b2b-vote` accepts changes every pinned page. `b2b-endpoints-test` pins
  both shapes; a change a released widget would not understand needs its own
  prompt - fields added, never renamed or removed, or a new endpoint.
- **Nothing withdraws a release.** Deleting its two blobs by hand would make
  every page pinning it show nothing - the fail-closed outcome - and needs
  its own prompt and a note in the record. `delete-store` deletes a store's
  data, not code it loaded.
- **Each deploy clears the CDN's copy of every release**, after which the
  function reads Blobs once per edge; browsers keep theirs a year.
- **Only Chromium has run a release** (141, Playwright 1.56). Integrity on
  `<script>` and on a shadow root's `<link>`, and CORS with `crossorigin`, are
  standard (MDN, above); `fetch` with `keepalive` has been Baseline since
  November 2024 ([MDN, Request.keepalive](https://developer.mozilla.org/en-US/docs/Web/API/Request/keepalive),
  modified 2025-03-13). The compliance kit draws in Chromium too, so Firefox
  and Safari still wait for the pilot store's own check.
- **A release request is in Netlify's request logs**, with its address and
  time, like the feed's. Netlify's documented log fields hold no `Origin`
  ([Log Drains](https://docs.netlify.com/monitor-sites/log-drains)), and a
  release's address names no store; its referrer is the store's page only
  where a store's tag leaves out `referrerpolicy="no-referrer"`, which the
  guide asks for. The privacy page says what the logs hold.
- **The privacy page and the B2B code move together.** No test reads the
  page's dispensary section (Prompt 8 adds no gate); the table in "Privacy
  page, then switch on" says where each of its claims lives. A change to what
  B2B keeps or sends - a field, a store, the default window, the vote cap
  (`B2B_VOTE_DAILY_CAP` is unset, and the page says 100) - changes that
  section in the same commit.
- **Backups.** Supabase's free plan keeps none; a paid plan's daily backups
  would keep a deleted dispensary's rows for days afterwards (7 on Pro), and a
  deleted account's or removed report's alike. The privacy page says nothing
  about backups yet, and has to before the plan changes - the move the plan
  asks for before a licensee depends on NOSE.
- **The privacy page does not describe the end-of-pilot export yet.** Its
  dispensary section lists what a dispensary sends NOSE - the catalog, and a
  catalog read once before signing up - and the integration guide says
  everything NOSE receives is set out there. A pilot export is one more
  thing a dispensary sends: one row per assigned shopper, a group label and
  counts, no identity. Before NOSE receives a first one, the section needs a
  paragraph - what the export holds, that it is read once in the maintenance
  workspace and deleted there once the report is published - and the
  sentence "Nor are we told ... which group of a test the dispensary has put
  them in" needs reconciling: an export tells NOSE the group of each row,
  never who the row is. Its own prompt; the plan template's checklist names
  it.
- **Settled 2026-10-13: the count decides** (above, "Pilot plan and
  report"), inhalable orders per assigned shopper, as the plan wrote it.
- **The plan's spread is a past period's.** If the pilot's counts spread
  wider - a rise in orders usually widens them - the test is less likely
  than planned to find the lift. The report says when that happened; it
  never changes the result. A store with few heavy buyers can set a larger
  `--sd` than its past figure, for a margin.
- **Heavy buyers are not capped.** One shopper with very many orders widens
  the interval; capping each count at a ceiling written into the plan would
  narrow it, and needs its own prompt - the export, the report and the
  template's past figures would all change together.
- **A matched purchase is the store's to count.** NOSE never sees which
  card a shopper opened. The template's marker on `product_url` is one way;
  whatever the store uses is written into the plan before the first day.
- **Pre-registration rests on git's committer date**, which a committer can
  set. Pushing the plan to GitHub before the first day is the record others
  can see; the report checks the date it is given.
- **Votes cast after the last day** - on purchases made in the pilot - are
  not counted: the band check reads the pilot's days, first to last.
- **The split check's threshold, p below 0.001, is fixed in the report** and
  stated in the template; changing it is a code change in its own commit,
  never a setting in a plan.
- **Newcombe's four values were read from a reproduction** of his Table II,
  the paper being paywalled; worth setting beside the paper itself when
  someone has it.
- **The privacy page says flavor where the Florida variant says aroma**
  ("NOSE's flavor match", "was its flavor close?"), found by the kit. It is
  NOSE's page, not a dispensary's, and data.md gives it as published.
  Whether a Florida submission wants other words there is for counsel; a
  change is its own prompt, and changes data.md with it.
- **A kit is for one release and one day.** It names the release, its
  commit and both hashes, and the day the store's feed was read; a new
  release needs a new kit - in Florida perhaps a new approval - and so may a
  catalog that changes what the screens show. Nothing ties a kit to an
  approval but the store's own record.
- **A kit's PNGs draw with the machine's fonts.** The widget takes its font
  from the store's page; the stand-in names the system sans-serif, which is
  whatever the machine has. Two machines draw the same words and layout in
  different type; strings.md is the record of the words.
- **Four Florida strings are not drawn with the test store** -
  `soldOutNoPanel`, `soldOutNone`, `thcMissing`, `notUsedOthersOne` - and
  strings.md gives each exactly as written, with when it shows. A store's
  feed that reaches one draws it.
- **The kit makes up a store's shopper by a rule** (above). A store whose
  feed has no batch out of stock with a panel gets no sold-out panel, and one
  with no in-stock batch lacking a panel among a rail's first twelve gets no
  no-panel screen; each is listed with why. A store wanting particular
  screens would need a purchase list of its own design, which no prompt has
  asked for.
- **A store's three days are carried, not shown** (above, "The day the lab
  finished, in a store's readings"). The feed has `harvest_on`, `tested_on`
  and `report_on` on every batch with a current reading; the widget, the
  ranking engine and the demo page read none of them, and nothing scores
  them (§4). Showing one is a screen change - new words in `js/b2b-strings`,
  a new release, and in Florida a new compliance kit - and needs its own
  prompt.
- **`b2b-widget-test` can fail on a slow run.** Seen once in the Codespace,
  2026-10-15, on Playwright 1.64.1: the check that the put-back button has
  the focus after the basis is drawn again (`test/b2b-widget-test.mjs`,
  line 617) reads the focus at once, without waiting. Read too early, it
  fails; the Enter after it misses, and the wait for the second event times
  out at 8 s, so "the browser cases ran to the end" fails too - 2 failures.
  The next run was clean, as were four on Playwright 1.56. Waiting for the
  focus before reading it, with the gate's line still `b2b-widget clean`,
  needs its own prompt.

### Later

Wanted work, not yet built.

- Campaign palates: an email or text to opted-in shoppers when a new batch
  matches their palate. Wanted as an option after the pilot. Preferred build:
  the dispensary's server runs the ranking engine on purchase history it
  already holds, so NOSE never receives it.

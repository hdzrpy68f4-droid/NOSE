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
70 accepted / 3 rejected      (73 COA fixtures)
70 match / 0 differ           (extraction parity, unpdf vs pdftotext)
corpus clean                  (fixture lint)
43 mutation failures          (mutation harness, 560 cases - see §9)
```

The first 14 real scans joined on 2026-11-19, each checked by hand against its
PDF: eight Kaycha, four Method, two Modern Canna. The two Modern Canna reports
were accepted but wrong, and fixed (§11, the lone `≤`).

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

All 73 source PDFs are tracked in git, so the corpus is reproducible from a clone:
`node test/extract-dump.js` regenerates `test/fixtures/extracted/` in about a
minute. This was proven the hard way when a Codespace container failed and the
whole workspace had to be rebuilt from the remote.

**Which reader serves which documents**, from `readBy`:

```
forward      52      the plain name-then-value pass
multicolumn  16      Kaycha's three-column rows
backward      2      value-before-name layouts
columnmajor   0      dead - declines on all 73, unreached on 70

Counts are of ACCEPTED fixtures (52+16+2 = 70), measured 2026-11-19. Rejected
documents also carry a `readBy`, so counting all 73 gives 55 forward. The table
before that day said 43 forward of 53 accepted, while the 56 then accepted read
46 forward: it had drifted, so re-count rather than add.
```

---

## 3. Where to start

**Read this file, then [docs/handoff/open.md](docs/handoff/open.md)** (what is
known and not yet done). Read a dated record in
[docs/handoff/13-records.md](docs/handoff/13-records.md) or
[docs/handoff/14-records.md](docs/handoff/14-records.md) only when a prompt or
a comment names it; §13 and §14 each end with an index of their records by
title and date. Split this way on 2026-11-14 (M7): the file had grown to
nearly 9,000 lines, most of them history.

Three accepted-but-wrong faults were found and fixed this session - see §11.
No lint failures remain.

1. **The column-major reader is dead.** `test/columnmajor-audit.js` shows it
declines on all 73 fixtures and is never reached on 70 - it runs only when
`rowPassLooksWrong`. Its own comment names ACS, ACT Florida and TerpLife, NOT
Modern Canna, and all three now read `forward` and accept, so the row-wise
reconciler superseded it. Keeping it costs nothing on the 70 passing fixtures.
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

**Where a change is recorded** (since 2026-11-14). A change that alters what
is true now updates the reference here, in §0-§12 or §13's reference parts.
Its dated record - what was probed, built and verified - goes at the end of
`docs/handoff/13-records.md` (the archive and the app) or
`docs/handoff/14-records.md` (dispensaries), with a line added to that
section's index here. An item it closes comes off `docs/handoff/open.md`, and
one it finds goes on, in the same commit.

**Verify before changing anything:**

```bash
node test/coa-gate-test.js test/fixtures/extracted netlify/functions/lib/parse-coa.js | tail -1
node test/extraction-parity.js test/fixtures/pdf 2>&1 | grep -v "^Warning:" | tail -3
node test/fixture-lint.js | tail -2
```

Expect `70 accepted / 3 rejected`, `70 match / 0 differ`, and `corpus clean`.
Also run `node test/resolver-test.js` - expect `resolver clean`, and
`bash build.sh` - expect `OK - ready to deploy`.

**Or all at once:** `bash scripts/gates.sh` (or `npm run gates`, the same
file) runs, first, `node-version-test` - the Node running the gates is
`.nvmrc`'s, 24 since 2026-10-15 (§13, "Node 24 everywhere") - then these, the Kaycha anchors,
`novelty-test`, `fetch-guard-test`, `coa-dates-test`, `summed-rows-test`, `shifted-rows-test`, `refusal-words-test`, `store-test`, `probe-test`, `archive-wiring-test`,
`archive-scripts-test`, `rerun-test`, `review-queue-test`, `match-test`, `match-props-test`,
`match-feedback-test`, `accounts-test`, `client-error-test`, `analysis-test`, `duplicates-test`, `remove-copies-test`, `remove-document-test`, `b2b-coverage-test`, `b2b-store-test`, `b2b-catalog-test`, `b2b-endpoints-test`, `b2b-rank-test`, `b2b-strings-test`, `b2b-pilot-test`, `check-trust-test` and, after the build, `page-chrome-test`, `colour-tokens-test`, `b2b-release-test`, `input-paths-test`, `b2b-widget-test` and `b2b-compliance-kit-test`.
It prints the line each gate produced and ends with `ALL GATES GREEN`. It passes
a gate only on its exact expected line, so when a session legitimately changes
a count, update the script in the same commit.

**GitHub runs the same file on every push to main**, and on every pull request,
since 2026-10-16 (`.github/workflows/gates.yml`): a fresh machine, no secrets,
every gate - and that run decides what deploys. Netlify builds the branch
`live`, and only a green run on a push to main moves `live` forward to that
commit; a red run moves nothing, so the site stays at the last green commit
(§13, "Every gate on every push"). A cloud session that can run only some of
the gates is checked there by all of them.

**The input-paths, b2b-widget and b2b kit gates need Playwright and its Chromium**, which are not
project dependencies. Install them once per Codespace, and again after any
`npm ci`, which removes Playwright: `npm install --no-save playwright@1.64.1`
(the version the workflow pins; change both together), then
`npx playwright install --with-deps chromium`. On the Windows desktop, in Git
Bash, the gates run the same way since 2026-11-13, with
`npx playwright install chromium` (no `--with-deps`; §13, "The Windows
desktop builds and runs the gates"). Without them the gate fails and
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
| `fetch-guard-test.js` | the fetcher's guards (§13, "Security audit items 3, 4, 6, 7, 14, 15 and 16"): 27 private host forms refused - IPv4-mapped and NAT64 IPv6, `[::]`, 100.64/10, 0/8, fec0::/10 among them - and 8 public ones passed; a body with no Content-Length past 12 MB refused, its stream cancelled; a small PDF in two pieces arrives whole |
| `novelty-test.js` | the five `novelty` notes (§7) and the furniture the `unmapped` diagnostic skips; FAILS if an accepted fixture carries any novelty, and lists the refused ones that do, as information |
| `match-test.js` | the matching maths has one home, `js/match-math.*.js`: the app takes it from there, nothing else holds a copy, and it returns every score in `test/fixtures/match-golden.json` to the last bit; every score is shown and sent through `shownScore()`, floored (§13, "The shown score"), and the worked examples on `learn/intensity-versus-character/` are the numbers the app shows; since 2026-10-14, a profile carrying `harvestOn`, `reportOn` and `totalTerpenes` normalises exactly as without them (§4) |
| `match-props-test.js` | what must always hold of the maths (§13, "The maths has a property test"): over 20,000 seeded pairs on the 15 keys - every score between 0 and 1; one jar multiplied, the pair swapped, keys or a palate's jars reordered, each moving no score by more than 1e-12 and no shown number or band; a jar against itself shows 100; a below-limit row scores as an absent one; cis- and trans-nerolidol sum; cannabinoids, a date and a total change nothing; an empty jar is skipped; the band edges at 0.55, 0.75 and 0.90. It does not assert the alias table or `coerce()` on `0,45`, which the golden file pins until their own change Since 2026-11-18 also the methodology page's two figures: among the accepted flower fixtures, the share of pairs scoring "Close match" and at least "Related profile" stays within 5 points of the page's "one time in four" and "two times in three", and the page still says them (13-records, "Three small open items closed"). |
| `match-feedback-test.js` | the app's votes (§13, "Every vote stored"): `match-feedback.js` and `feedback-read.js` offline, `@netlify/blobs` stood in for - matchBand()'s four names each stored under its slug, every other band refused with `bad-band` and nothing stored, a score of 0 kept; the key layout, the store, the record's ten fields and anonymity unmoved; the summary, filters and CSV over the four, in matchBand()'s order, its caveat word for word; the bundle's own vote run on the default `/app` pair, 74 · Moderate, stored and counted; the question asks about smell and taste, no effect word in the block; the privacy page's sentence about votes; since 2026-10-14 the smell words (§13, "Smell words on a vote") - the bundle's `SMELL_NOTES` and the handler's `NOTES` one list, up to three distinct words stored in list order in a v 2 record, every other shape refused with `bad-notes` and nothing stored, `null` when none was sent, the CSV's notes column, no word on the list an effect word |
| `accounts-test.js` | the account functions (§13, "A gate for the account system"): `auth-signup`, `auth-login`, `auth-me`, `auth-logout`, `auth-reset`, `account-delete`, `palate-sync` and `sessions-purge` offline over `netlify/lib/auth.js`, `@netlify/blobs` and Supabase (global `fetch`) stood in for - the age attestation and password length, the cookie word for word, the session record's five fields, the fixed bad-password message and the ninth try, a malformed cookie signed-out, logout here and everywhere, deletion's order and each failing step named, the palate's limits and one user never reading another's, one reset reply, the purge of expired sessions, no console line with an address or password |
| `client-error-test.js` | the app's error reports (§13, "Start-up error reports reach the server"): `client-error.js` offline, `@netlify/blobs` stood in for by `test/lib/functions-harness.js` - `error`, `unhandledrejection` and `init:<step>` stored, every name the bundle passes to `step()` accepted, every other kind refused with `bad-kind` and nothing stored, an init record's fields the same as an error record's |
| `coa-dates-test.js` | `lib/coa-dates.js` and the parser's `harvestOn` / `reportOn` / `testedOn` (§7): the four forms, a one-digit month or day, a time of day, the near misses, `testedOn` on every fixture and the rule behind each lab's row, and every other field identical without it |
| `shifted-rows-test.js` | a reading is never one row out or ten times high (§13, "The parser reviewed"): made-up reports, one cell per line - name / limit / result read forward; a name-first table under a stray figure, and a value-first one whose total is not printed value-first, refused in a plain sentence; a value-first table whose total is printed value-first read backward; a table in mg/g alone refused; an inline total in both units read from its percentage |
| `summed-rows-test.js` | a terpene printed both as a total and as its isomers (§13, "A terpene printed as a total and as its isomers"): made-up reports, one cell per line - Nerolidol beside cis- and trans-, alpha-Terpineol beside Total Terpineol, cis- and trans-Ocimene beside "Ocimene, Total" each read once and accepted with no arithmetic warning; isomers alone still sum; a summed row alone is read; a bare Ocimene beside beta-Ocimene adds as before; the two disagreeing is refused in a plain sentence |
| `refusal-words-test.js` | the sentences a refused report shows (§13, "Refusal sentences in plain words"): made-up reports, each refused for one reason - no total, nothing above the limit, more than the total, one repeated figure, a total over 100%, one or two terpenes, a total and isomers that disagree - each sentence word for word, none holding a word of the parser's own (parse fault, limit column, modelled, coverage, an internal key); one printed name for every key `ANALYTE_MAP` can give |
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
| `colour-tokens-test.js` | the six families' colours (§13, "One home for the family colours"), since 2026-10-15: one `css/tokens.<hash>.css` holding the twelve properties - `--citrus`, `--citrus-text` and so on to `--herbal-text` - in family order and nothing else; no other stylesheet or page defining one or writing a fill or ink as an opaque colour (`wip/` aside); every page outside `test/` linking the tokens once, before any other stylesheet; `js/aroma-bar`'s `FAMILIES` (loaded as Node loads it), `js/hero`'s `FILLS`, `favicon.svg`'s six bars and each aroma page's `theme-color` equal to the tokens; every ink 4.5:1 or more on white, `#F3F3EE`, its fill at 10% over white and at 11% over `#F3F3EE` (WCAG 2.2 AA); offline; a gate, run after the build |
| `b2b-release-test.js` | pinned widget releases (§14, "Pinned releases"): `scripts/b2b-release.js`'s build - the same bytes from one commit and version, every time, anywhere; the five files verbatim and in order but for the widget's two stylesheet lines; the stylesheet verbatim; the bundle running as a page runs it - its refusals, its publishing to a stand-in Blobs (never overwriting, going on after a stop, an ETag or a failure, the row last), `netlify/functions/b2b-release.js` (the switch, GET and HEAD, one path shape, the bytes with exactly their five headers, a 404 nothing caches, 503 and one line), `scripts/b2b-release-check.js` against each kind of mismatch, nothing built left in the repo, no effect wording, the integration guide's names; offline, in throwaway git repos; a gate, run after the build |
| `b2b-widget-test.mjs` | `<nose-matches>` in headless Chromium, Firefox and, on Linux, WebKit (since 2026-11-14) (§14, "The widget"): the built files on a store's page from another origin, under the prompt's CSP, against a stand-in feed and vote; only the feed and the vote leave the page, and no request carries a purchase; consent, denied, control; each mode equal to `js/b2b-rank`'s answers; every profile on the desk, saying what `renderBar()` says (the bar until 2026-11-18); NOSE's two fonts fetched by hash with no cookie or referrer, and the cream and dark (`theme="dark"`) grounds (since 2026-11-18, 14-records, "The widget in NOSE's look"); keyboard reach; the demo page; one copy of the bar; `build.sh`'s load-order lines; since 2026-10-09 the vote by `fetch` with no cookie or referrer, and a pinned release - one tag with its hash under the integration guide's own CSP lines, the same rail and vote, its stylesheet checked by its hash, an altered file or a missing `crossorigin` refused. Needs Playwright; a gate, run after the build |
| `input-paths-test.mjs` | the app's ways in, in headless Chromium, Firefox and, on Linux, WebKit (since 2026-11-14; the camera cases by QR image outside Chromium): Scan QR (fake camera and QR image), COA link, Upload. The real `coa.js` and parser answer, with only the download and unpdf stood in for (§13, "The input paths"). Since 2026-10-14 also the card's Moisture and Water activity rows on flower - below, inside, both edges (0.55 and 0.65), above and Pass only, each row's text written out (§13, "Water activity against ASTM D8197"); and the row after Batch - Harvested, else Report dated, else none - with its age and the note under it, on a frozen clock in New York's time zone (§13, "Harvest date and age on the card"); `INPUT_PATHS_SHOTS=<folder>` saves a picture of each of those cards. Since 2026-10-14 also the smell words on a vote - thirteen toggle buttons reached by Tab, a fourth refused with a note, and the vote's POST taken before it leaves the page, carrying exactly the two words picked and no other new field (§13, "Smell words on a vote"). Since 2026-10-14 (R8) also the Water activity row's link - the words it already showed, linking to `/learn/why-your-jar-is-drier-than-its-report/` in a new tab with `rel="noopener"`, the row's text unchanged, no other link on the card, and that guide served (§13, "Two guides from the research"); since 2026-11-18 the link's `aria-label` is its words plus ", opens in a new tab" (13-records, "Three small open items closed"). Needs Playwright; a gate, run after the build |
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
| `export-candidate.js <sha>` | an archived report's PDF and text into the fixture folders, to name and baseline by hand (§10); never commits. `--real`: every real scan (each document the seed did not store) into `test/fixtures/candidates/`, which the gates do not count |
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
  **verbatim**. Write reasons as plain English — they get published. Seven
  of them were reworded on 2026-11-14 (§13, "Refusal sentences in plain
  words"); a compound is named through the parser's `PRINTED_NAME`, never by
  its key, and `refusal-words-test` fails on a word of the parser's own.
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
  report date reads: 27 harvest dates (3 ACS, printed ISO already; 24
  Kaycha, eight of them since 2026-11-19) and 2 TerpLife report dates - the
  widening moved none of them.
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
fails, on purpose: regenerate it in the same commit, saying why -
`node test/extract-dump.js`, then
`node test/match-golden-make.js --why "<what changed>"` (§13, "The maths has
a property test").

The same failure nearly recurred with nerolidol: `TRANS-`, `CIS-`, `E-` and `Z-`
were mapped but bare `NEROLIDOL` was in `UNMODELLED`, so a lab printing one summed
row had the compound measured and then dropped from the fingerprint. Now mapped.
A document printing BOTH the summed row and its isomers is read once, from the
summed row, when the two agree within `RECONCILE_TOLERANCE`, and refused when
they disagree (since 2026-11-14; `SUMMED_SPELLINGS` and `ISOMER_SPELLINGS` in the
parser, §11 and §13, "A terpene printed as a total and as its isomers"). **A new
spelling that is a sum or an isomer by its own name goes into one of those two
sets as well as `ANALYTE_MAP`.** A spelling whose name does not say which it is -
a bare `OCIMENE`, `TERPINEOL` or `FARNESENE` - goes in neither. No fixture
currently uses the bare `NEROLIDOL` spelling.

---

## 9. Known open items

- **TerpLife moisture is unread.** Its row prints 14.2 with no unit marker
above it, so the binding rule declines. Verified against the PDF: the value is
real, the layout simply does not declare itself. One document; not worth a
fifth pattern.
- **Every accepted fixture now reconciles** against its own printed total.
`MCL-FLW-002` is the sole exception at 103.8%, and that is the lab's arithmetic,
not the parser's - it warns rather than refusing.
- **43 mutation failures** out of 560 (~8%), in two unrelated groups. The
  FIRST fourteen were down from 19 - see the `gamma-`
  fault in the log below, which accounted for five. A re-run on 2026-11-19
  found those fourteen are six `destructive/shuffleValues`, seven
  `cosmetic/pageNumbers` and one `destructive/glueNames` (ACS-FLW-001), not
  fourteen `shuffleValues` as this said; the same on the parser before that
  day's change, so older drift (open.md). The `shuffleValues` ones are a KNOWN
  LIMIT rather than a backlog item. That mutation reverses every standalone numeric line in the
  document, so the multiset of values is conserved and every sum still
  reconciles by construction - no document-internal check can see it. Four of
  the fourteen push mass onto unmodelled compounds and are caught by
  `MIN_MODEL_COVERAGE`, but a warning leaves the fingerprint unchanged, so the
  harness still counts them. Do not spend a session trying to reach zero.
- **29 of the 43 are `destructive/blankNonDetects`**: 21 on the first 56
  fixtures, and all eight Kaycha reports that joined on 2026-11-19. Added later
  and a DIFFERENT mechanism from the fourteen above. It strips every ND / BQL /
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
- **Decided 2026-11-19, the owner: real lab reports are public fixtures.**
  The 56 source PDFs are tracked in this PUBLIC repo, and new ones join them
  the same way. A private repo for new reports, and rewriting history to take
  the 56 out, were the other choices. Weighed: a public fixture shows which jars
  were scanned and republishes a lab's document. The rule in `.gitignore` that
  kept new PDFs out of `git add` went that day. `export-candidate.js --real`
  exports every real scan into `test/fixtures/candidates/` for the hand check
  (13-records, "Real reports become public fixtures").
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

- **A summed row plus its isomers was read doubled, and the comments said it
  was refused** (found 2026-11-12, fixed 2026-11-14). `ANALYTE_MAP`'s comments
  and §8 said a report printing both `Nerolidol` and its cis- and trans- rows
  "overshoots the lab's own total, and is refused by the coverage ceiling".
  The ceiling is 5%, so that held only when the doubled terpene was more than
  about 5% of the total. On a made-up 12-terpene report, Nerolidol 0.030
  beside cis- 0.012 and trans- 0.018 was accepted with nerolidol 0.060;
  alpha-Terpineol beside Total Terpineol with terpineol 0.070; cis- and
  trans-Ocimene beside "Ocimene, Total" with ocimene 0.080 - each with only
  the warning that the report's own arithmetic does not close, which blamed
  the lab. A believable fingerprint with one family inflated. No fixture
  prints both, so nothing in the corpus could show it. **A comment that says
  another check catches a case is a claim; test it with a made-up report.**

- **Refusal sentences carried the parser's own words** (found 2026-11-12,
  reworded 2026-11-14). §7 has said since the start that reasons are shown
  verbatim and must be plain English. The warnings were rewritten for that;
  seven refusals were not, and a person could read "coverage 141.1% exceeds
  the lab total — parse fault, not a lab finding" or a list of internal keys.
  A new reason goes through `refusal-words-test`'s word list.

- **A below-limit sign printed as its own text item read as a measurement**
  (found and fixed 2026-11-19, the first hand check of real scans). Modern
  Canna's November 2026 flower template sets `≤` apart from its number, so
  the extracted text has `≤` on one line and `0.00492` on the next.
  `resultToNumber` reads a sign only at the start of a token, so the bare
  number became a result: 0.00492 on every row below the limit. On
  `MCL-FLW-006` cis-nerolidol joined trans (0.10692 for 0.102); on
  `MCL-FLW-007` also a phantom ocimene; on both, the warning that "the
  report's own arithmetic does not close" (104.6%, 104.0%) on reports whose
  rows add up to the printed total. Accepted, plausible, and blaming the lab.
  `normalize()` now glues a lone `<` or `≤` to the number on the next line.
  No earlier fixture has a lone sign, and the first 59 read the same.
  **A sign the extractor splits off is still a sign.**

## 12. The fetcher — `netlify/functions/lib/fetch-report.js`, called by `coa.js`

Everything above is the parser. This is what gets a PDF to it, and it had no
test coverage at all until `test/resolver-test.js`.

**Where it lives, since 2026-10-05.** The chain - `validateUrl`,
`isBlockedHost`, `fetchOnce`, `fetchPdf`, `isPdf`, `looksLikeHtml`,
`resolvePdfFromPage` and the five limits above them - moved from `coa.js` to
`netlify/functions/lib/fetch-report.js`, unchanged: the moved lines are
byte-identical, and `coa.js` required them and exported
`_resolvePdfFromPage` (the same function, not a copy) until 2026-10-16. Its
replies are byte-identical too (§14). It moved so that
`scripts/b2b-coverage.js` can fetch through the same guards without loading
`coa.js`, and the archive wiring with it. `scripts/download-twice.js` takes
only the resolver, inside its own looser loop (§13, "One report, many
documents") - from `lib/fetch-report.js` itself since 2026-10-16, as
`test/resolver-test.js` and `test/duplicates-test.js` do.

**`coa.js` is in Netlify's current function format, since 2026-10-16**: one
default export, taking a Request and returning a Response, and nothing else
exported - as the other 16 functions are. It reads the request's method and
body and nothing else, takes no Context, and reads the chain only through
`lib/read-report.js`. Until then it was the one `exports.handler` function,
Netlify's deprecated Lambda compatibility format (§13, "coa.js in the current
format").

**One path from a link to a verdict, since 2026-10-16:
`netlify/functions/lib/read-report.js`.** `readReport(link)` runs the steps
once, in order - `validateUrl`, `fetchPdf`, the text, the 200-character
floor, `parseCoa`, the unsafe-layout check - and says where it stopped:
`link`, `fetch`, `extract`, `text` or `parse`, or once parsed `unsafe`,
`refused` or `accepted`, with the person's sentence or the parser's reasons
and the pieces a caller needs. The four sentences, `MIN_TEXT` and
`UNSAFE_UNDER_UNPDF` (still empty) are its own. `coa.js` turns each stage
into its reply and keeps the archive call where it was, between the parse
and the refusals; `scripts/b2b-coverage.js`'s `readFetched()`, and through
it `scripts/b2b-read-catalog.js`, turns each into an outcome. It loads
neither `lib/archive.js` nor `lib/pdf-store.js`. A sentence changed there
reaches the scanner and the dispensary reports together (§13, "One way to
read a report").

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
60s (read 2026-10-15 and again 2026-10-16; §13, "Comments that match the
code") - the limit `coa.js` runs under since it took the current format on
2026-10-16; the Lambda compatibility page gave none for the old one. A chain
that runs on leaves
the person waiting, and past the platform's own limit shows them its error
page rather than ours. Not covered by any test — exercising it needs a slow server.

**After every parse on the production deploy, `coa.js` hands the result to the
archive (§13)**: one call site, bounded, and unable to change the reply.
`test/archive-wiring-test.js` drives the real handler - its default export,
with a Request and a Context it never reads - to prove the last part.
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

**Records live beside this file since 2026-11-14.** This section keeps what is true now. Every dated record - how a change was probed, built and verified - is in [docs/handoff/13-records.md](docs/handoff/13-records.md), in date order; the list below names each one. What is still open is in [docs/handoff/open.md](docs/handoff/open.md). A citation "§13, "<title>"" means the record of that title.

### What exists

```
supabase/migrations/20260922180000_nose_archive.sql   the whole schema
supabase/migrations/20260923140000_nose_reparse_runs.sql   one row per real reparse run
supabase/migrations/20260923170000_nose_analysis_views.sql   latest_parses, batch_series, strain_key(): read-only
supabase/migrations/20261002180000_nose_one_document_per_text.sql   save_scan finds a document by its bytes, else its text; batch_series per sample; sample_key()
supabase/migrations/20261002230000_nose_removals_and_cap.sql   removals, withheld, the daily cap; save_scan checks both first
supabase/migrations/20261015000000_nose_tested_on.sql   parses.tested_on; batch_series dated by harvest, else tested, else report, and says which
supabase/config.toml                                  minimal, for the CLI
netlify/functions/lib/store.js                        saveScan(payload, { client, timeoutMs }); clientConfig re-exported from db.js
netlify/functions/lib/db.js                           withClient(), clientConfig(), checkUrl(), scrub(): one copy, shared with the dispensary store (since 2026-10-16)
netlify/functions/lib/supabase-ca.js                  generated; Supabase's public root CA
netlify/functions/lib/archive.js                      storeScan(): the storage path, both halves; archiveScan(), archiveOn() and the limits, coa.js's call
netlify/functions/lib/coa-dates.js                    isoDate(): a printed date as an ISO day, or null (s7)
netlify/functions/lib/pdf-store.js                    Netlify Blobs, store "coa-pdf"
netlify/functions/lib/version.js                      the one version helper
netlify/functions/lib/build-info.json                 GENERATED by build.sh, gitignored
netlify/functions/coa.js                              the scanner: a default export of the Request; the one archiveScan() call
netlify/functions/keep-awake.js                       removed 2026-11-15 (paid projects do not pause)
test/store-test.js                                    PGlite, in memory, 116 checks
test/archive-wiring-test.js                           coa.js -> archive.js, offline, 60 checks
test/archive-scripts-test.js                          version, pdf-store, health, seed, rerun helper; offline, 24 checks
test/rerun-test.js                                    reparse, backfill, export on PGlite; offline, 92 checks
test/review-queue-test.js                             the review queue on PGlite; offline, 19 checks
test/analysis-test.js                                 the analysis views and scripts on PGlite; offline
test/match-test.js                                    the matching maths: one copy, the scores it gave before it moved, the numbers it shows
test/fixtures/match-golden.json                       those scores, from js/nose.81d6bb53.js at b596508
test/match-golden-make.js                             wrote them; since 2026-11-14 writes them again from today's maths, --why for a change meant to move scores
test/match-props-test.js                              what must always hold of the maths, over 20,000 seeded pairs
test/novelty-test.js                                  the parser's novelty notes (s7); fails if an accepted fixture has any
test/probe-test.js                                    the probe's pass/fail rules, offline
test/date-probe.js                                    read-only: the dates each accepted fixture prints, and which the parser reads
scripts/embed-supabase-ca.js                          writes supabase-ca.js from the download
scripts/set-writer-password.js                        rotates nose_writer, prints NOSE_DB_URL once
scripts/probe-db.js                                   checks the real project
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
Netlify. The function needs neither: Netlify hands a function written as a
default export its Blobs context per request (until 2026-10-16 `coa.js` was
not one, and `connectLambda` did). The token is a personal access token and can do anything the
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

Since 2026-11-14 a third check: every top-level file and folder git tracks
must be on the guard's own list of what the site serves, a name Netlify reads
and does not serve (`_headers`, `_redirects`, `netlify.toml`), a name starting
with a dot, or blocked by a forced 404. Anything else fails the build and is
named (§13, "The site stops serving stray root files").

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

`archiveScan()` - `lib/archive.js`'s since 2026-10-16, with `archiveOn()` and
its three limits - is called once by `coa.js`, right after `parseCoa`, before
any refusal, so usable reads, unusable ones and refused layouts are all kept —
the refusals are how parser faults get found (§10). The storage path itself is
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
backstop bounds `store.js`. Awaited before the reply, not handed to
`context.waitUntil`: the Functions API's `waitUntil` would let the writes run
on after the reply, but it comes on the Context, which carries the caller's
IP address, location and cookies, and `coa.js` takes no Context at all - one
default export of the Request since 2026-10-16. Awaiting keeps the writes
inside the reply's budget and the reply after them, as before, when `coa.js`
was a Lambda-style function that Netlify froze the moment it returned.
- **Unset `NOSE_DB_URL` makes the database half a no-op** — `store.js` and
`pg` are never loaded. Only Netlify's Production context has the variable.
- **Nothing about the person.** Neither the request nor Netlify's Context
reaches the archive: `coa.js` takes the request alone, reads its method and
body, and hands `archiveScan` what was read - the bytes, the address, the
text, the parser's output - and the deadline. The test drives the handler
with a Context whose every read is recorded, and fails on any; it fails if a
function in `lib/archive.js` takes an `event`, a `request`, a `req`, a
`context` or a `ctx`, if the file names `event`, `request`, `req` or `ctx` at
all, or if it reads anything off a `context` - a scan's own `context` field,
the deploy context, is the one use of the word there. Until 2026-10-16 the
event went to `connectLambda` alone, which read `event.blobs` and the
`x-nf-site-id` / `x-nf-deploy-id` headers; nothing connects now. The stored
address is origin + path in both halves: the whole query string and fragment
are dropped, which
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
addresses, database hosts and IP addresses out of any error it passes on -
and, since 2026-10-16, keys and quoted values too: it is `lib/db.js`'s
`scrub()`, the dispensary store's (below, "One set of server helpers"). A
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
- **No connect step, since 2026-10-16.** A function written as a default
export taking a Request is handed its Blobs context by Netlify, as
`b2b-vote` has been since 2026-10-09 (§14, "Privacy page, then switch on").
Until then `coa.js` was written as `exports.handler`, which is not handed it,
and `pdf-store.connect()` passed its event to `connectLambda` first; both went
with the port (below, "coa.js in the current format").
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
full, database size against the 8 GB of disk the Pro plan includes (500 MB on the
free plan, until 2026-11-15), PDF count and bytes, and
the PDFs and documents that lack their other half. A PDF with a document row
is measured from the row — its key is the hash of those very bytes — so only
orphans are downloaded; `--verify` downloads and re-hashes every file. It
prints no text, no addresses and no secrets.

Both need three Codespaces secrets: `NOSE_DB_URL`, `NETLIFY_SITE_ID`,
`NETLIFY_AUTH_TOKEN`. A Codespace sees a secret added after it started only
once it is restarted.

`store.js`'s bounded connection - `lib/db.js`'s `withClient()` since
2026-10-16, the dispensary store's too - is tested against pg's real
semantics, read from the 8.23.0 source: `end()` destroys the socket when a query is active, so a
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

**Since 2026-11-15 there is nothing to keep awake:** both Supabase projects are
on the Pro plan, whose projects "are not paused for inactivity", and
`keep-awake.js` is removed (13-records, "Five rate limits on Netlify Pro").
What follows is how it was.

Supabase pauses a free project after a week without enough database activity —
"a few user requests to the database each day" is what its docs call typically
enough. While paused, every archive write fails, and `coa.js` swallows those
failures by design, so the archive would stop filling without anybody seeing
it. `keep-awake.js` makes one indexed read as `nose_writer` at minute 17 of
every fourth hour, UTC — six a day. Scheduled functions run only on published
deploys and cannot be called by URL. A failure logs `[keep-awake] FAILED` and
returns 500: Netlify → Logs → Functions → `keep-awake` is where a paused or
unreachable database shows up first. "Run now" on that page tests it.

### After a deploy — check it

Since 2026-11-14 the workflow's third job, `live-check`, does the first part
of this: after promote it runs `bash scripts/live-check.sh https://nose-app.com
<commit>` and goes red if the site is not serving that commit within 10
minutes, or a page, the `coa` function or the `b2b-feed` function does not
answer as it should ("The live site is checked after every deploy", above).
A red `live-check` moves nothing back. The checks below are the ones only a
person can do.

First, the run on GitHub is green and `live` has moved: Actions → gates → the
newest run shows both jobs, gates and promote, green; the Code tab's branch
menu lists `live`, at that commit. Netlify then builds `live` by itself, and
its deploy log names the branch `live` (§13, "Every gate on every push").
Since 2026-11-16 a push that changes only notes and tests does not move
`live`, and there is nothing to check ("After the review").
Then:

1. `node scripts/archive-health.js` in the Codespace (reads as `nose_writer`).
2. Scan one real jar on the live site.
3. Run it again: the newest parse is that jar, dated today (UTC), context
`production`, with the deploy's commit as its parser version, and one more PDF
than before the first time a report is seen; nothing new for the same report
again.
4. (Until 2026-11-15 this step ran `keep-awake` by hand. The function is
removed; there is nothing to run. Step 1 is the check that the database
answers.)
5. Netlify → Logs → Functions → `coa`: no `archive incomplete` line. One names
which half failed, and why, with nothing about the report. An `archive at its
daily cap` line means that UTC day reached the cap (§13, "What gets kept").
A `the report reader failed` line means a request got the fixed 500, with
nothing about it logged (§13, "coa.js in the current format").
6. The home page shows a match score in its hero, and on `/app` choosing a
candidate jar shows a score. Both read their maths from
`js/match-math.<hash>.js`; an empty score means that file did not load. On
the default pair both read 74 · Partial overlap (75 before 2026-09-24).
7. `node scripts/keep-rule.js`: `below the rule: none`, and today's count
under the cap.

### The records, by date

- [Verified on the real project, 2026-09-22](docs/handoff/13-records.md#verified-on-the-real-project-2026-09-22)
- [Live, 2026-09-22 evening (US Eastern)](docs/handoff/13-records.md#live-2026-09-22-evening-us-eastern)
- [Novelty on the real project, 2026-09-23](docs/handoff/13-records.md#novelty-on-the-real-project-2026-09-23)
- [Live, 2026-09-23 (US Eastern): the PDF half, the re-run tools, novelty](docs/handoff/13-records.md#live-2026-09-23-us-eastern-the-pdf-half-the-re-run-tools-novelty)
- [Live, 2026-09-23 (US Eastern): the analysis layer](docs/handoff/13-records.md#live-2026-09-23-us-eastern-the-analysis-layer)
- [The input paths, 2026-09-23](docs/handoff/13-records.md#the-input-paths-2026-09-23)
- [The shown score, 2026-09-24](docs/handoff/13-records.md#the-shown-score-2026-09-24)
- [Known ACS layouts, 2026-09-24](docs/handoff/13-records.md#known-acs-layouts-2026-09-24)
- [One report, many documents - the probe, 2026-10-01](docs/handoff/13-records.md#one-report-many-documents---the-probe-2026-10-01)
- [One report, many documents - the fix, 2026-10-02](docs/handoff/13-records.md#one-report-many-documents---the-fix-2026-10-02)
- [One report, many documents - the cleanup, 2026-10-02](docs/handoff/13-records.md#one-report-many-documents---the-cleanup-2026-10-02)
- [What gets kept, and taking it back out, 2026-10-02](docs/handoff/13-records.md#what-gets-kept-and-taking-it-back-out-2026-10-02)
- [Three privacy sentences, 2026-10-03](docs/handoff/13-records.md#three-privacy-sentences-2026-10-03)
- [Every vote stored, 2026-10-13](docs/handoff/13-records.md#every-vote-stored-2026-10-13)
- [Water activity against ASTM D8197, 2026-10-14](docs/handoff/13-records.md#water-activity-against-astm-d8197-2026-10-14)
- [Harvest date and age on the card, 2026-10-14](docs/handoff/13-records.md#harvest-date-and-age-on-the-card-2026-10-14)
- [Score spread, 2026-10-14](docs/handoff/13-records.md#score-spread-2026-10-14)
- [Smell words on a vote, 2026-10-14](docs/handoff/13-records.md#smell-words-on-a-vote-2026-10-14)
- [Two guides from the research, 2026-10-14](docs/handoff/13-records.md#two-guides-from-the-research-2026-10-14)
- [When the lab finished, 2026-10-14](docs/handoff/13-records.md#when-the-lab-finished-2026-10-14)
- [The Tested row on the card, 2026-10-14](docs/handoff/13-records.md#the-tested-row-on-the-card-2026-10-14)
- [npm audit, 2026-10-15](docs/handoff/13-records.md#npm-audit-2026-10-15)
- [Strict mode in the app bundle, 2026-10-15](docs/handoff/13-records.md#strict-mode-in-the-app-bundle-2026-10-15)
- [Leftovers at the repository root, 2026-10-15](docs/handoff/13-records.md#leftovers-at-the-repository-root-2026-10-15)
- [The QR library, committed and pinned, 2026-10-15](docs/handoff/13-records.md#the-qr-library-committed-and-pinned-2026-10-15)
- [Comments that match the code, 2026-10-15](docs/handoff/13-records.md#comments-that-match-the-code-2026-10-15)
- [Node 24 everywhere, 2026-10-15](docs/handoff/13-records.md#node-24-everywhere-2026-10-15)
- [One home for the family colours, 2026-10-15](docs/handoff/13-records.md#one-home-for-the-family-colours-2026-10-15)
- [Every gate on every push, 2026-10-16](docs/handoff/13-records.md#every-gate-on-every-push-2026-10-16)
- [One way to read a report, 2026-10-16](docs/handoff/13-records.md#one-way-to-read-a-report-2026-10-16)
- [coa.js in the current format, 2026-10-16](docs/handoff/13-records.md#coajs-in-the-current-format-2026-10-16)
- [One set of server helpers, 2026-10-16](docs/handoff/13-records.md#one-set-of-server-helpers-2026-10-16)
- [The Windows desktop builds and runs the gates, 2026-11-13](docs/handoff/13-records.md#the-windows-desktop-builds-and-runs-the-gates-2026-11-13)
- [The site stops serving stray root files, 2026-11-14](docs/handoff/13-records.md#the-site-stops-serving-stray-root-files-2026-11-14)
- [A jar that is gone is never replaced by another, 2026-11-14](docs/handoff/13-records.md#a-jar-that-is-gone-is-never-replaced-by-another-2026-11-14)
- [Start-up error reports reach the server, 2026-11-14](docs/handoff/13-records.md#start-up-error-reports-reach-the-server-2026-11-14)
- [A gate for the account system, 2026-11-14](docs/handoff/13-records.md#a-gate-for-the-account-system-2026-11-14)
- [Sessions end when the privacy page says, 2026-11-14](docs/handoff/13-records.md#sessions-end-when-the-privacy-page-says-2026-11-14)
- [Four sentences made true, 2026-11-14](docs/handoff/13-records.md#four-sentences-made-true-2026-11-14)
- [The maths has a property test, and its golden file can be made again, 2026-11-14](docs/handoff/13-records.md#the-maths-has-a-property-test-and-its-golden-file-can-be-made-again-2026-11-14)
- [The method page says what the code does, 2026-11-14](docs/handoff/13-records.md#the-method-page-says-what-the-code-does-2026-11-14)
- [Focus you can see, messages you can hear, tabs that take arrow keys, 2026-11-14](docs/handoff/13-records.md#focus-you-can-see-messages-you-can-hear-tabs-that-take-arrow-keys-2026-11-14)
- [The live site is checked after every deploy, 2026-11-14](docs/handoff/13-records.md#the-live-site-is-checked-after-every-deploy-2026-11-14)
- [Dependency alerts, and the QR library's licence, 2026-11-14](docs/handoff/13-records.md#dependency-alerts-and-the-qr-librarys-licence-2026-11-14)
- [Docs that say what is true, and a README, 2026-11-14](docs/handoff/13-records.md#docs-that-say-what-is-true-and-a-readme-2026-11-14)
- [The review's decisions, as taken on 2026-11-14](docs/handoff/13-records.md#the-reviews-decisions-as-taken-on-2026-11-14)
- [A terpene printed as a total and as its isomers counts once, 2026-11-14](docs/handoff/13-records.md#a-terpene-printed-as-a-total-and-as-its-isomers-counts-once-2026-11-14)
- [Refusal sentences in plain words, 2026-11-14](docs/handoff/13-records.md#refusal-sentences-in-plain-words-2026-11-14)
- [The review's fixes, live, 2026-11-14](docs/handoff/13-records.md#the-reviews-fixes-live-2026-11-14)
- [The real reparse after the review's parser changes, 2026-11-14](docs/handoff/13-records.md#the-real-reparse-after-the-reviews-parser-changes-2026-11-14)
- [The handoff split into what is and what happened, 2026-11-14](docs/handoff/13-records.md#the-handoff-split-into-what-is-and-what-happened-2026-11-14)
- [Rate limits at Netlify's edge, 2026-11-14](docs/handoff/13-records.md#rate-limits-at-netlifys-edge-2026-11-14)
- [Security audit items 3, 4, 6, 7, 14, 15 and 16, 2026-11-14](docs/handoff/13-records.md#security-audit-items-3-4-6-7-14-15-and-16-2026-11-14)
- [Rate limits need a path: coa and match-feedback move to /api/, 2026-11-14](docs/handoff/13-records.md#rate-limits-need-a-path-coa-and-match-feedback-move-to-api-2026-11-14)
- [The app's alias table, and coerce(), 2026-11-14](docs/handoff/13-records.md#the-apps-alias-table-and-coerce-2026-11-14)
- [Votes and error reports keep the day, not the time, 2026-11-14](docs/handoff/13-records.md#votes-and-error-reports-keep-the-day-not-the-time-2026-11-14)
- [WebKit and Firefox in the tests, 2026-11-14](docs/handoff/13-records.md#webkit-and-firefox-in-the-tests-2026-11-14)
- [One header and one footer, 2026-11-14](docs/handoff/13-records.md#one-header-and-one-footer-2026-11-14)
- [The stored votes and error reports rewritten without a time, 2026-11-15](docs/handoff/13-records.md#the-stored-votes-and-error-reports-rewritten-without-a-time-2026-11-15)
- [A password reset that finishes, 2026-11-14](docs/handoff/13-records.md#a-password-reset-that-finishes-2026-11-14)
- [The reset page works with Supabase's default email, 2026-11-15](docs/handoff/13-records.md#the-reset-page-works-with-supabases-default-email-2026-11-15)
- [Backups on the privacy page, before any exist, 2026-11-15](docs/handoff/13-records.md#backups-on-the-privacy-page-before-any-exist-2026-11-15)
- [Account emails through Resend: the privacy page first, 2026-11-15](docs/handoff/13-records.md#account-emails-through-resend-the-privacy-page-first-2026-11-15)
- [Five rate limits on Netlify Pro, and keep-awake removed, 2026-11-15](docs/handoff/13-records.md#five-rate-limits-on-netlify-pro-and-keep-awake-removed-2026-11-15)
- [Backups were already there, 2026-11-15](docs/handoff/13-records.md#backups-were-already-there-2026-11-15)
- [Account emails switched on through Resend, 2026-11-15](docs/handoff/13-records.md#account-emails-switched-on-through-resend-2026-11-15)
- [Reset tested on the live site, 2026-11-15](docs/handoff/13-records.md#reset-tested-on-the-live-site-2026-11-15)
- [A confirmation page, 2026-11-15](docs/handoff/13-records.md#a-confirmation-page-2026-11-15)
- [After the review: notes-only pushes do not deploy, 2026-11-16](docs/handoff/13-records.md#after-the-review-notes-only-pushes-do-not-deploy-2026-11-16)
- [A sign-up tested on the live site, 2026-11-16](docs/handoff/13-records.md#a-sign-up-tested-on-the-live-site-2026-11-16)
- [Email links that come to NOSE, 2026-11-16](docs/handoff/13-records.md#email-links-that-come-to-nose-2026-11-16)
- [An audit for dead weight: five small removals, 2026-11-16](docs/handoff/13-records.md#an-audit-for-dead-weight-five-small-removals-2026-11-16)
- [The parser reviewed: shifted rows and weight units, 2026-11-16](docs/handoff/13-records.md#the-parser-reviewed-shifted-rows-and-weight-units-2026-11-16)
- [Security items 8, 9, 10 and the keyed fingerprint, 2026-11-16](docs/handoff/13-records.md#security-items-8-9-10-and-the-keyed-fingerprint-2026-11-16)
- [The methodology page says how often unrelated jars earn a label, 2026-11-16](docs/handoff/13-records.md#the-methodology-page-says-how-often-unrelated-jars-earn-a-label-2026-11-16)
- [A pilot walked through on a made-up store, 2026-11-16](docs/handoff/13-records.md#a-pilot-walked-through-on-a-made-up-store-2026-11-16)
- [A name that resolves to a private address, 2026-11-16](docs/handoff/13-records.md#a-name-that-resolves-to-a-private-address-2026-11-16)
- [Total tiles, and the open list tidied, 2026-11-16](docs/handoff/13-records.md#total-tiles-and-the-open-list-tidied-2026-11-16)
- [A result across product forms says so, 2026-11-16](docs/handoff/13-records.md#a-result-across-product-forms-says-so-2026-11-16)
- [The publishable key switched on, 2026-11-16](docs/handoff/13-records.md#the-publishable-key-switched-on-2026-11-16)
- [The real archive after the parser review, 2026-11-16](docs/handoff/13-records.md#the-real-archive-after-the-parser-review-2026-11-16)
- [The keyed fingerprint switched on, 2026-11-17](docs/handoff/13-records.md#the-keyed-fingerprint-switched-on-2026-11-17)
- [The new look went live, 2026-11-17](docs/handoff/13-records.md#the-new-look-went-live-2026-11-17)
- [The account pages, 404 and the demo rebuilt, 2026-11-17](docs/handoff/13-records.md#the-account-pages-404-and-the-demo-rebuilt-2026-11-17)
- [Two small open items closed, 2026-11-17](docs/handoff/13-records.md#two-small-open-items-closed-2026-11-17)
- [Scan QR first, and no Upload tab, 2026-11-17](docs/handoff/13-records.md#scan-qr-first-and-no-upload-tab-2026-11-17)
- [The camera fills its box, and leaving it while it starts, 2026-11-17](docs/handoff/13-records.md#the-camera-fills-its-box-and-leaving-it-while-it-starts-2026-11-17)
- [A message left over nothing, and one text floor, 2026-11-17](docs/handoff/13-records.md#a-message-left-over-nothing-and-one-text-floor-2026-11-17)
- [The fetcher's connection pinned, 2026-11-17](docs/handoff/13-records.md#the-fetchers-connection-pinned-2026-11-17)
- [The preview takes the camera's shape, and the card's fingerprint on the desk, 2026-11-17](docs/handoff/13-records.md#the-preview-takes-the-cameras-shape-and-the-cards-fingerprint-on-the-desk-2026-11-17)
- [The iPhone's camera layer laid out again, and the card's buttons apart, 2026-11-17](docs/handoff/13-records.md#the-iphones-camera-layer-laid-out-again-and-the-cards-buttons-apart-2026-11-17)
- [A readout of the camera on the iPhone, and a test that tested nothing, 2026-11-17](docs/handoff/13-records.md#a-readout-of-the-camera-on-the-iphone-and-a-test-that-tested-nothing-2026-11-17)
- [The camera box is square: what the iPhone's readout showed, 2026-11-17](docs/handoff/13-records.md#the-camera-box-is-square-what-the-iphones-readout-showed-2026-11-17)
- [iOS draws the camera fitted whole: the picture scaled to fill, 2026-11-17](docs/handoff/13-records.md#ios-draws-the-camera-fitted-whole-the-picture-scaled-to-fill-2026-11-17)
- [The camera goes dark at times: the readout widened, 2026-11-17](docs/handoff/13-records.md#the-camera-goes-dark-at-times-the-readout-widened-2026-11-17)
- ["Start camera" asked for the click as a camera, and the video made a covering square, 2026-11-17](docs/handoff/13-records.md#start-camera-asked-for-the-click-as-a-camera-and-the-video-made-a-covering-square-2026-11-17)
- [The camera works on the owner's iPhone, and the readout comes out, 2026-11-17](docs/handoff/13-records.md#the-camera-works-on-the-owners-iphone-and-the-readout-comes-out-2026-11-17)
- [Three small open items closed, 2026-11-18](docs/handoff/13-records.md#three-small-open-items-closed-2026-11-18)
- [The intensity guide's three jars are on the desk, 2026-11-18](docs/handoff/13-records.md#the-intensity-guides-three-jars-are-on-the-desk-2026-11-18)
- [The guides' last numbers under a gate, and the app's dead hero rules gone, 2026-11-18](docs/handoff/13-records.md#the-guides-last-numbers-under-a-gate-and-the-apps-dead-hero-rules-gone-2026-11-18)
- [family.css goes: the reading pages keep only what they use, 2026-11-18](docs/handoff/13-records.md#familycss-goes-the-reading-pages-keep-only-what-they-use-2026-11-18)
- [The reading pages rebuilt: css/legacy and css/read go, 2026-11-18](docs/handoff/13-records.md#the-reading-pages-rebuilt-csslegacy-and-cssread-go-2026-11-18)
- [The reading pages after the rebuild: underline, other browsers, keyboard, 2026-11-18](docs/handoff/13-records.md#the-reading-pages-after-the-rebuild-underline-other-browsers-keyboard-2026-11-18)
- [/app leaves css/shell, and css/world's section for pages not yet rebuilt goes, 2026-11-18](docs/handoff/13-records.md#app-leaves-cssshell-and-cssworlds-section-for-pages-not-yet-rebuilt-goes-2026-11-18)
- [A scanned jar is compared with the palate, and the palate is every saved jar, 2026-11-19](docs/handoff/13-records.md#a-scanned-jar-is-compared-with-the-palate-and-the-palate-is-every-saved-jar-2026-11-19)
- [After Compare the page goes to the result, and the new jar's bars carry its name, 2026-11-19](docs/handoff/13-records.md#after-compare-the-page-goes-to-the-result-and-the-new-jars-bars-carry-its-name-2026-11-19)
- [On a phone, COA link goes to its panel, the link box stays above the keyboard, and the family table fits, 2026-11-19](docs/handoff/13-records.md#on-a-phone-coa-link-goes-to-its-panel-the-link-box-stays-above-the-keyboard-and-the-family-table-fits-2026-11-19)
- [After Compare, the result offers "Add to my palate", 2026-11-19](docs/handoff/13-records.md#after-compare-the-result-offers-add-to-my-palate-2026-11-19)
- [/app's focus rings, colours, faces and header follow DESIGN.md, 2026-11-19](docs/handoff/13-records.md#apps-focus-rings-colours-faces-and-header-follow-designmd-2026-11-19)
- [The labels above /app's headings go, and the result's three boxes become readouts, 2026-11-19](docs/handoff/13-records.md#the-labels-above-apps-headings-go-and-the-results-three-boxes-become-readouts-2026-11-19)
- [/app's panels lose their boxes, 2026-11-19](docs/handoff/13-records.md#apps-panels-lose-their-boxes-2026-11-19)
- [/app's last departures from DESIGN.md go, 2026-11-19](docs/handoff/13-records.md#apps-last-departures-from-designmd-go-2026-11-19)
- [Every page gets the phone menu, 2026-11-19](docs/handoff/13-records.md#every-page-gets-the-phone-menu-2026-11-19)
- [Real reports become public fixtures, and every real scan can be exported at once, 2026-11-19](docs/handoff/13-records.md#real-reports-become-public-fixtures-and-every-real-scan-can-be-exported-at-once-2026-11-19)
- [The first 14 real scans become fixtures, and a below-limit sign printed apart reads as 0, 2026-11-19](docs/handoff/13-records.md#the-first-14-real-scans-become-fixtures-and-a-below-limit-sign-printed-apart-reads-as-0-2026-11-19)

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

Each prompt's record goes at the end of [docs/handoff/14-records.md](docs/handoff/14-records.md); "Still open" and "Later" are in [docs/handoff/open.md](docs/handoff/open.md) (since 2026-11-14).

### What exists

Compiled 2026-11-14 from the file list each record opens with, in date order; each list names its record, which says more.

From "The coverage report, 2026-10-05":

```
netlify/functions/lib/fetch-report.js   the fetch chain, moved out of coa.js unchanged (s12)
netlify/functions/coa.js                requires it; every export and every reply as before
scripts/b2b-coverage.js                 the report: <catalog.csv> [--out DIR] [--limit N]
docs/B2B-CATALOG-FORMAT.md              the CSV a dispensary exports
test/b2b-coverage-test.js               offline, a gate: "b2b-coverage clean"
test/fixtures/b2b/catalog.csv           25 rows, one for every case; catalog-unknown.csv, catalog-personal.csv
.gitignore                              b2b-out/, the script's default folder - and where a catalog CSV goes
```

From "Schema, role, keys and the switch, 2026-10-07":

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

From "Catalog upload and the batch reader, 2026-10-08":

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

From "Feed and votes, 2026-10-08":

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

From "The ranking engine, 2026-10-08":

```
js/b2b-rank.<hash>.js      palateFrom, rank, soldOut, voteScore: window.NoseRank in a page, module.exports in Node
build.sh                   syntax-checks and fingerprints it; fails a page that loads it without js/match-math before it
test/b2b-rank-test.js      offline, a gate: "b2b-rank clean"
scripts/gates.sh           the gate, after b2b endpoints
```

From "The widget, 2026-10-08":

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

From "Pinned releases, 2026-10-09":

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

From "Privacy page, then switch on, 2026-10-09":

```
privacy/index.html          "Dispensaries that use NOSE" (#dispensaries); a fifth "What changed" paragraph;
                            one line under "What an account stores"; the lab-report sentence scoped to a
                            scan or a link; a line in "How long we keep things"
docs/B2B-INTEGRATION.md     the switch-on push: "Not switched on yet ... answers 404" gives the day instead
docs/B2B-CATALOG-FORMAT.md  the same
PARSER-HANDOFF.md           this record; Still open
```

From "Pilot plan and report, 2026-10-13":

```
docs/B2B-PILOT-PLAN.md       the plan, a fill-in template: copied to docs/pilots/<slug>.md, committed before the first day
docs/B2B-PILOT-EXPORT.md     the CSV a store sends at the end: one row per assigned shopper, counts only
scripts/b2b-sample-size.js   --mean <orders> --sd <spread> --lift <relative>: shoppers per group, two means (the primary metric);
                             --baseline <rate> --lift <relative>: votes per band, two proportions (the band check)
scripts/b2b-pilot-report.js  <export.csv> --store <slug>: the plan, the export and the votes, read; the report, printed
test/b2b-pilot-test.js       offline, a gate: "b2b-pilot clean"
scripts/gates.sh             the gate, after b2b strings
```

From "The compliance kit, 2026-10-13":

```
scripts/b2b-compliance-kit.js       the kit: [--offline] | --store <slug> --key npk_... --origin https://...; [--release N] [--site ORIGIN] [--out DIR]
test/b2b-compliance-kit-test.mjs    Playwright, after the build, a gate: "b2b-compliance-kit clean"
scripts/gates.sh                    the gate, after b2b widget
```

From "The day the lab finished, in a store's readings, 2026-10-14":

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

### The records, by date

- [The coverage report, 2026-10-05](docs/handoff/14-records.md#the-coverage-report-2026-10-05)
- [Schema, role, keys and the switch, 2026-10-07](docs/handoff/14-records.md#schema-role-keys-and-the-switch-2026-10-07)
- [Catalog upload and the batch reader, 2026-10-08](docs/handoff/14-records.md#catalog-upload-and-the-batch-reader-2026-10-08)
- [Feed and votes, 2026-10-08](docs/handoff/14-records.md#feed-and-votes-2026-10-08)
- [The ranking engine, 2026-10-08](docs/handoff/14-records.md#the-ranking-engine-2026-10-08)
- [The widget, 2026-10-08](docs/handoff/14-records.md#the-widget-2026-10-08)
- [Pinned releases, 2026-10-09](docs/handoff/14-records.md#pinned-releases-2026-10-09)
- [Privacy page, then switch on, 2026-10-09](docs/handoff/14-records.md#privacy-page-then-switch-on-2026-10-09)
- [Pilot plan and report, 2026-10-13](docs/handoff/14-records.md#pilot-plan-and-report-2026-10-13)
- [The compliance kit, 2026-10-13](docs/handoff/14-records.md#the-compliance-kit-2026-10-13)
- [The day the lab finished, in a store's readings, 2026-10-14](docs/handoff/14-records.md#the-day-the-lab-finished-in-a-stores-readings-2026-10-14)
- [A front door for dispensaries, 2026-11-15](docs/handoff/14-records.md#a-front-door-for-dispensaries-2026-11-15)
- [How a flower score reads, 2026-11-15](docs/handoff/14-records.md#how-a-flower-score-reads-2026-11-15)
- [Release 2 published, 2026-11-15](docs/handoff/14-records.md#release-2-published-2026-11-15)
- [The dispensary code read against the privacy page, 2026-11-16](docs/handoff/14-records.md#the-dispensary-code-read-against-the-privacy-page-2026-11-16)
- [The vote asks before it tells, 2026-11-16](docs/handoff/14-records.md#the-vote-asks-before-it-tells-2026-11-16)
- [Release 3 published, 2026-11-17](docs/handoff/14-records.md#release-3-published-2026-11-17)
- [A signed coa_url is refused on upload, 2026-11-18](docs/handoff/14-records.md#a-signed-coa_url-is-refused-on-upload-2026-11-18)
- [The widget in NOSE's look: two grounds, NOSE's type and the desk, 2026-11-18](docs/handoff/14-records.md#the-widget-in-noses-look-two-grounds-noses-type-and-the-desk-2026-11-18)
- [The dispensaries page's pictures retaken, and the desk's names apart, 2026-11-18](docs/handoff/14-records.md#the-dispensaries-pages-pictures-retaken-and-the-desks-names-apart-2026-11-18)
- [The privacy page describes the end-of-pilot export, 2026-11-18](docs/handoff/14-records.md#the-privacy-page-describes-the-end-of-pilot-export-2026-11-18)

# §13 records

The dated records of PARSER-HANDOFF.md §13, moved here whole and unchanged on 2026-11-14 (M7), in date order. A new record is added at the end of this file.

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

### One home for the family colours, 2026-10-15

**Each family's fill and ink were written out in four stylesheets and two
scripts, and three different sets of inks reached a screen.** The six fills
agreed everywhere; the inks did not - the home page's family cards
(`js/aroma-bar`'s `FAMILIES.text`), the six aroma pages (`body.theme-*`) and
the cards on `/aromas/` (`.famcard-*`) each had their own, `css/shell` defined
two more that nothing read, and no check held any of them equal. The
architecture review proposed a home in `shell.css`, which cannot work: a page
loads `shell.css` or `family.css`, never both. So the twelve colours now live
in a stylesheet of their own that every page links first, and the copies that
cannot read it are held to it by a new gate. The inks are the aroma pages'
set, the highest-contrast of the three. The second of the architecture
review's small cleanups (project document
`claude/nose-s-cleanup-prompts-2026-10-15.md`, Prompt 2).

```
css/tokens.8fb6b363.css     new: one :root block - --citrus, --citrus-text ... --herbal-text - and a header
                            naming the copies that cannot read it and the test that holds them to it
all 23 pages                one <link rel="stylesheet" href="/css/tokens.<hash>.css"> before any other stylesheet
build.sh                    fingerprint css tokens css, beside the other css lines
css/shell.a26570a7.css      the twelve family lines out of its first :root; the second :root (one line) gone;
                            .bg-* and .fam-* read the variables (was shell.d038fe79)
family.8e3469b6.css         .famcard-*, .sw-*, .ink-*, body.theme-* and the wordmark's .bg-* read them (was dc8ed1ef)
css/agegate.67a4ad39.css    the gradient and the six bars read them (was 451aca9a)
css/account.0a470861.css    the error message's border reads --spice (was e3c8acd9)
js/aroma-bar.4c8dc6b3.js    FAMILIES' earthy, spice, pine, floral and herbal text become the tokens' inks;
                            color untouched; four header lines say it is a checked copy (was 94a27874)
test/colour-tokens-test.js  new: the 'colour tokens' gate, after the build
test/b2b-widget-test.mjs    the 31 moved lines' check pins their new SHA-256; its name says why
scripts/verify-manifest.sh  css/tokens.<hash>.css required
scripts/gates.sh            'colour tokens', expecting colour-tokens clean, after 'build'
PARSER-HANDOFF.md           s5's gate list and harness table; this record; two Still open items
```

```
            citrus   earthy   spice    pine     floral   herbal   lowest
fill        #D19412  #9C6B3F  #C25B2E  #3E7A54  #8A6BBE  #4E8D99
ink before, home cards (A)
            #654700  #68431F  #833817  #28583A  #5B4386  #2E6671  5.18
ink before, aroma pages (B) = every ink now
            #654700  #5C3B20  #7E3417  #2A5439  #4E3878  #2C565E  6.49
ink before, /aromas/ cards (C)
            #7A5A0E  #6E4A2B  #8A3B1D  #2F5D40  #563F86  #316068  5.25
```

- **What WCAG 2.2 says**, read 2026-10-15 through WebFetch. The
  Recommendation (https://www.w3.org/TR/WCAG22/, W3C Recommendation 12
  December 2024): SC 1.4.3 Contrast (Minimum), Level AA, asks text for a
  contrast ratio of at least 4.5:1, large text 3:1. Its glossary lies past the
  part of the page WebFetch returns, so the two definitions were read in
  "Understanding SC 1.4.3"
  (https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html, updated
  06 September 2026), whose Key Terms give them: contrast ratio
  `(L1 + 0.05) / (L2 + 0.05)`, L1 the lighter colour's relative luminance;
  relative luminance `L = 0.2126 R + 0.7152 G + 0.0722 B`, each channel
  `c/12.92` when its sRGB value is at most 0.04045, else
  `((c + 0.055)/1.055)^2.4`. The page notes the threshold was 0.03928 before
  May 2021 and that the change makes no practical difference here.
- **The probe, before the edit.** 1: 23 pages outside `test/`; 3 load
  `css/shell` (`index.html`, `app.html`, `b2b/demo/`), 20 `family.css`, none
  both; 20 load `css/agegate`, all but account, privacy and terms. 2: the six
  fills, the same everywhere: `shell.css` (its two `:root` blocks, `.bg-*`,
  `.fam-*`), `family.css` (`.famcard-*`, `.sw-*`, `body.theme-*`, the
  wordmark's `.bg-*`), `agegate.css` (the gradient, six bars), `account.css`
  (one border), `js/aroma-bar`'s `FAMILIES`, `js/hero`'s `FILLS`,
  `favicon.svg`, the six aroma pages' `theme-color`, and `wip/`'s stale draft.
  Translucent tints of the fills also exist (below, "Found on the way").
  3: three sets on screen, as expected - with one difference in how. On the
  home page `js/nose`'s `makeCard()` colours each "Learn more" with
  `FAMILIES.text` (the cards' other `family.text` reads are for
  `familyDetails`, an id on no page); the aroma pages' eyebrow, note pills and
  pager read `body.theme-*`'s `--family-text`. On `/aromas/` the set reaches
  the screen through each card's "Read the ... page" pill, a `.note` reading
  `.famcard-*`'s `--family-text`: the `.ink-*` rules lose to `.card p`, so the
  anchor-terpene line is `--muted`, `rgb(83, 96, 87)` in Chromium's computed
  style, before and after (Still open). Nothing reads `shell.css`'s
  `--<family>-text`, and no page or script uses `.fam-*`. 4: the table above,
  each set's lowest over white, `#F3F3EE`, the fill at 10% over white (the
  pills) and at 11% over `#F3F3EE` (the aroma page header) - every lowest on
  that header, herbal for A and B, citrus for C. The prompt's 5.18, 6.49 and
  5.25 come out when a mixed background's channels are rounded to whole
  numbers, as a screen paints them: the header and pill pixels Chromium
  painted on the six aroma pages, read from screenshots, are those whole
  numbers. Unrounded, the three are 5.17, 6.48 and 5.23.
- **The new gate's refusals**, in a scratch harness, not committed, each in a
  fresh copy of the built tree: an ink changed in `js/aroma-bar` alone; a fill
  hardcoded back into `family.css`; a page without the link; a page with it
  after `shell.css`; a second `:root` defining `--pine`; an ink below 4.5:1
  with the tokens and every copy agreeing (2.53:1); an ink written as an
  opaque `rgb()`; a second tokens file; a thirteenth property; two families
  swapped; a fill changed in `js/hero`, in `favicon.svg`, in one aroma page's
  `theme-color`, or in the tokens alone. Each fails it, naming the file and
  line; the unbroken copy prints `colour-tokens clean`. It scores a mixed
  background both unrounded and rounded and keeps the lower, so on the tree
  it reports 6.48:1, herbal on its header.
- **The widget test's pin.** The check of the 31 lines moved into
  `js/aroma-bar` on 2026-10-08 now pins
  `3efc9c39d77fbbe4f8b0d42074f25a25a523ca084728287883cad0b827627f05`, was
  `9b31dc3bb29040d768b978706546f690abcb88f8c977e03b784dc0b925301f81`; the only
  difference is the five `text` values. Its name says so; its gate line is
  still `b2b-widget clean`. The 2026-10-08 record (s14, "The widget") still
  quotes the old hash as the one pinned; it is history.
- **Pictures**, in headless Chromium at 1280 and 390 px, the age gate answered,
  reduced motion on and the hero's `Math.random` seeded so two runs of one
  tree match: every page outside `test/`, before and after, compared pixel by
  pixel. Identical but for the home page's family cards (five "Learn more"
  links, 2209 pixels at 1280), `/aromas/` (its six pills, 5576 pixels) and 14
  pixels on `b2b/demo/` at 1280 that also differ between two runs of the old
  tree. `/aromas/earthy/` and the other five aroma pages: identical. The age
  gate on `/` and `/about/`: identical. The account error message's border:
  `rgb(194, 91, 46)` before and after.
- **What did not move.** Every fill; every aroma bar (`renderBar()` reads
  `color`, never `text`); the widget, its stylesheet and release 1 - no
  release cut; every score and band; every page's text and layout; the
  privacy page's words (its only change is the one `<link>`); `js/nose`,
  `js/hero` and `js/match-math`, so `build.sh` renamed only the four
  stylesheets and `js/aroma-bar`; every other gate's expected line; the
  parser, the maths, both schemas; what NOSE keeps or sends.
- **Found on the way, left as it is.** Three translucent tints of the fills
  are written as `rgba()`: `account.css`'s error message (spice at .1) and
  danger zone border (spice at .4), and `shell.css`'s `.hero:before` glow
  (all six at .10 to .16). A tint is a different colour, so the gate does not count it,
  and reading the tokens there needs `color-mix()`, a changed rule (Still
  open).
- **One gate more:** 34. Each page makes one more stylesheet request, cached
  for a year by `_headers`' `/css/*` rule.
- **How it was verified, 2026-10-15, in the cloud workspace**, Node 22, where
  npm's registry was refused: unpdf stood in for by its two calls over
  pdfjs-dist 6.2.108 (parity still `56 match / 0 differ`), and Playwright
  1.56.0 with its Chromium from the workspace. Before the edit 22 of the 33
  gates green, after it 23 of the 34 - `colour tokens` the new one - with
  `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944; `node version` fails on Node
  22 as it should, and the other 10 need PGlite, which could not be
  installed; none of them reads a stylesheet, a page or `js/aroma-bar`. The
  Codespace run on Node 24 is the one that counts.
- **After the deploy:** the home page's family cards, `/aromas/` and
  `/aromas/earthy/` look as in the after pictures, with no console error;
  `curl -s https://nose-app.com/ | grep -o '/css/tokens\.[0-9a-f]*\.css'`
  prints one name.

### Every gate on every push, 2026-10-16

**The gates ran only when someone ran them, a cloud session could run 23 of
the 34, and Netlify deployed whatever reached main.** Now GitHub runs every
gate on every push to main and every pull request, on a fresh machine with no
secrets, and the site deploys a branch, `live`, that only a green run on a
push to main moves forward. A red commit stays on main and reaches the site
only through a later green commit that carries its fix. The third of the
architecture review's small cleanups (project document
`claude/nose-s-cleanup-prompts-2026-10-15.md`, Prompt 3).

```
.github/workflows/gates.yml  new: job gates - every gate on a fresh ubuntu-latest, then check-trust-test's
                             history and a clean tree; job promote - on a green push to main, live
                             fast-forwarded to that commit
test/b2b-widget-test.mjs     three waits, each at most 2 s, in the rail case: for the basis's toggle event after
                             Enter opens it, and for the focus before each of the two checks after a redraw;
                             FOCUSED is deepFocus()'s in-page test, read by both
_redirects                   /.github/* forced 404
scripts/gates.sh             header: GitHub runs this file; a red run keeps the site at the last green commit;
                             the Playwright install line names 1.64.1
PARSER-HANDOFF.md            s5; this record; "After a deploy" starts with the run; Still open here and in s14
```

```
on          a push to main, any pull request, workflow_dispatch (by hand: Actions -> gates -> Run workflow)
concurrency one run per branch - ${{ github.workflow }}-${{ github.ref }}; a newer push cancels the older run
gates       ubuntu-latest, 30 minutes, contents: read. Checkout with the whole history and
            persist-credentials: false; Node from .nvmrc with npm's cache; npm ci; npm install --no-save playwright@1.64.1;
            npx playwright install --with-deps chromium; node test/extract-dump.js; bash scripts/gates.sh;
            check-trust-test must print "(history checked)"; git status --porcelain must list nothing
promote     after gates, on a push to main only, contents: write. Checkout with the whole history. If live
            already holds the commit, it says so and stops; else git push origin <sha>:refs/heads/live,
            never forced - a live that is not behind the commit refuses it, the job fails, nothing moves
pins        actions/checkout   3d3c42e5aac5ba805825da76410c181273ba90b1  v7.0.1
            actions/setup-node 820762786026740c76f36085b0efc47a31fe5020  v7.0.0
```

- **What the docs say**, each read through WebFetch on the day given, US
  Eastern; GitHub's pages show no date of their own.
  GitHub, "GitHub Actions billing"
  (https://docs.github.com/en/billing/concepts/product-billing/github-actions,
  read 2026-10-15): "GitHub Actions usage is free for self-hosted runners and
  for public repositories that use standard GitHub-hosted runners."
  GitHub, "GITHUB_TOKEN"
  (https://docs.github.com/en/actions/concepts/security/github_token, read
  2026-10-15), and "Triggering a workflow" in the same words
  (https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow):
  "events triggered by the `GITHUB_TOKEN` will not create a new workflow
  run", except that "`workflow_dispatch` and `repository_dispatch` events
  always create workflow runs" - because "this behavior prevents you from
  accidentally creating recursive workflow runs". So promote's push to `live`
  starts no run. Neither page says whether other apps, Netlify's among them,
  still hear of such a push; step 5 below is where that shows.
  GitHub, "Workflow syntax for GitHub Actions"
  (https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax,
  read 2026-10-15, its last part 2026-10-16): `permissions` at the top or
  per job, and "If you specify the access for any of these permissions, all
  of those that are not specified are set to none"; "contents: read permits
  an action to list the commits"; the list of permissions names no
  `workflows`. `concurrency`: "there can be at most one running job or
  workflow in a concurrency group at any time", and `cancel-in-progress:
  true` cancels the one running; its example group is `${{ github.workflow
  }}-${{ github.ref }}`. `timeout-minutes`: "The maximum number of minutes
  to let a job run before GitHub automatically cancels it", 360 if unset.
  `shell: bash` runs `bash --noprofile --norc -eo pipefail {0}`; with no
  shell named it is `bash -e {0}`, without pipefail - so the workflow names
  bash.
  actions/checkout v7.0.1, its README, read from the release's own files
  (2026-10-15): "Only a single commit is fetched by default ... Set
  `fetch-depth: 0` to fetch all history for all branches and tags"; its
  source fetches `+refs/heads/*:refs/remotes/origin/*` then, so promote sees
  `origin/live`. "The auth token is persisted in the local git config ...
  Set `persist-credentials: false` to opt-out": gates opts out, promote keeps
  it to push.
  actions/setup-node v7.0.0, `docs/advanced-usage.md`, from the release's
  own files (2026-10-16): "The `node-version-file` input accepts a path to a
  file containing the version of Node.js to be used by a project, for
  example `.nvmrc`"; `cache`: "Supported values: npm, yarn, pnpm."
  Playwright, "Continuous Integration" (https://playwright.dev/docs/ci,
  read 2026-10-15): its GitHub Actions example, on `ubuntu-latest`, runs `npx
  playwright install --with-deps`, "Install Playwright browsers and
  dependencies". The page does not show the one-browser form the gates have
  always used, `install --with-deps chromium`.
  Netlify, "Deploy overview" (https://docs.netlify.com/deploy/deploy-overview,
  last updated Oct 8, 2026, read 2026-10-15): "To change the production
  branch name, go to Project configuration > Developer settings > Continuous
  deployment > Branches and deploy contexts, and select Configure"; "By
  default, Netlify will not generate a branch deploy unless a Developer or
  Owner has set up branch deploys for your site", and None under Branch
  deploys turns them off; "By default, Netlify deploys your site's
  production branch after every merge to the production branch." Netlify,
  "Manage deploys"
  (https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/,
  last updated Sep 30, 2026, read 2026-10-16): "To trigger a deploy at will
  on your production branch, go to your site's Deploys page and select
  Trigger deploy".
  GitHub, "About rulesets"
  (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets,
  read 2026-10-15): "Rulesets are available in public repositories with
  GitHub Free and GitHub Free for organizations". "Available rules for
  rulesets" (same folder, `available-rules-for-rulesets`, read 2026-10-16):
  Restrict deletions - "only users with bypass permissions can delete
  branches or tags whose name matches the pattern you specify", and "This
  rule is selected by default"; Block force pushes "is enabled by default".
  "Creating rulesets for a repository" (same folder, read 2026-10-16):
  Settings, then Rules and Rulesets in the sidebar, New ruleset, New branch
  ruleset; Enforcement status; Target branches, Add a target; Create.
  The releases pages (https://github.com/actions/checkout/releases and
  https://github.com/actions/setup-node/releases, read 2026-10-16):
  checkout's Latest is v7.0.1, commit
  `3d3c42e5aac5ba805825da76410c181273ba90b1`; setup-node's Latest is v7.0.0,
  `8207627` on the page, `820762786026740c76f36085b0efc47a31fe5020` by `git
  ls-remote`. A `v7.1.0` tag of setup-node exists (`949feb2`, 2026-10-07)
  with no release marked Latest; the pin is the release.
  npm 10.9.4's own `docs/content/using-npm/config.md`, `save`: "Will also
  prevent writing to `package-lock.json` if set to `false`" - so `--no-save`
  leaves the lockfile as committed, and the clean-tree step can hold.
  GitHub, "Security in GitHub Codespaces"
  (https://docs.github.com/en/codespaces/reference/security-in-github-codespaces,
  read 2026-10-16): a codespace's token is "scoped for read/write access to
  the repository". Neither it nor "Troubleshooting authentication to a
  repository" says anything about pushing a file under `.github/workflows/`
  (below, Still open).
- **The probe, before the edit.** 1: the two reads, at lines 618 and 627,
  as the prompt said; the widget gate 10 of 10 clean here, on Playwright
  1.56.0. 2: a fresh machine needs `npm ci` (unpdf, PGlite, pg, Blobs),
  Playwright with its Chromium, and `test/fixtures/extracted` written by
  `test/extract-dump.js`. No gate reads a secret: every secret-named
  variable a test names (`NOSE_DB_URL`, `NOSE_DB_ADMIN_URL`,
  `NOSE_B2B_DB_URL`, `NOSE_PUBLISHABLE_KEY`, `FEEDBACK_READ_TOKEN`,
  `NETLIFY_SITE_ID`, `NETLIFY_AUTH_TOKEN`) is deleted at its top or set to
  a stand-in. None reaches the network: `build.sh` downloads nothing since
  b4b2356, and git runs in throwaway repositories that set their own
  identity, or reads this checkout. 3: on the full clone `check-trust: 17
  checks (history checked)`; on `git clone --depth 1`, `check-trust: 17
  checks (history skipped: da5a6cf is not in this clone)`, then `check-trust
  clean`, exit 0. 4: the pages above, none saying otherwise. 5: the
  Codespace runs Playwright 1.64.1.
- **The flake had two causes.** The first is the one Still open named: after
  a remove or a put-back the widget gives the focus back when it has drawn
  again, and the test read it at once. With the widget's `focus()` delayed
  600 ms in a scratch copy, the old test failed exactly as the Codespace
  run did (the same two failures) and the new one passed; with the
  `focus()` taken out, the new one still failed. With the two waits in, 20
  runs in a row on an idle machine were clean, but in two loops run while
  other work went on, 3 of 32 failed, the focus on the page's body for the
  whole 2 s. A trace taken from the test alone,
  the widget untouched, showed why: the widget learns that the shopper
  opened the basis from its `toggle` event (`_basisOpen`), which Chromium
  fired about 11 ms after the click, around the next frame, while the test
  tabbed three times and pressed Remove within 24 ms. When Remove came
  first, the redraw drew the basis closed - `open: false`, the put-back
  button inside it - and a button in a closed `<details>` cannot have the
  focus. No shopper presses keys that fast, so the widget stays as it is
  (s14, Still open); the third wait holds the test to a shopper's pace. The
  prompt named two waits; the owner chose the third on 2026-10-16.
  Each wait gives up at 2 s without failing, and the check after it decides,
  as before; any other error is thrown. A string predicate is no use here:
  Playwright evaluates it, and the store's CSP refuses eval, so `FOCUSED` is
  passed as a function, which it allows. The gate's line is still
  `b2b-widget clean`, its 181 checks the same, by name and in order.
- **Promote, rehearsed** in throwaway repositories with promote's own
  script, read out of the YAML: no `live` - made at the commit; the same
  commit again - "live already contains ..."; main one commit on - `live`
  fast-forwarded; a run for an older commit after `live` moved on -
  "already contains"; a commit `live` is not behind - `! [rejected] ...
  (non-fast-forward)`, exit 1, `live` where it was. The history step fails
  on a shallow clone with its own message and passes on the full one; the
  tree step lists a rename left uncommitted and fails, and passes on a clean
  tree.
- **Lint:** actionlint 1.7.12, its release file checked against the
  release's published SHA-256, with ShellCheck 0.11.0 reading the `run:`
  scripts - 0 errors. Read as YAML by Python: two jobs, gates and promote.
- **What did not move.** Every gate's expected line, and their number, 34.
  Every other check in `b2b-widget-test`. The site: `_redirects` gains one
  forced 404, for a folder that did not exist before this commit -
  `check-published.js` counts 72 published files with it, 73 without. Netlify's
  environment variables and their Production context, which apply to builds
  of `live` once it is the production branch - `B2B_ENABLED`, `NOSE_DB_URL`
  and the rest - and `build-info.json`'s `deployContext`, which is Netlify's
  `$CONTEXT`, `production` for the production branch whatever its name.
  `scripts/b2b-release.js` and the pilot report, which read `origin/main`.
  No `js/` or `css/` file, so `build.sh` renamed nothing. The parser, the
  maths, both schemas; what NOSE keeps or sends, so the privacy page.
- **What changes.** A push to main reaches the site only after its gates
  pass on GitHub, some minutes later (here the gates took about 4 minutes,
  before any install). A run by hand, or for a pull request, never moves
  `live`. Branch deploys are None, so no other branch builds a site.
- **How it was verified, 2026-10-16, in the cloud workspace**, Node 22,
  where npm's registry was refused: unpdf stood in for by its two calls over
  pdfjs-dist 6.2.108 (parity still `56 match / 0 differ`), and Playwright
  1.56.0 with its Chromium from the workspace. Before the edit 23 of the 34
  gates green, with `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944; after it,
  the same 23 - `node version` failing on Node 22 as it should, the other 10
  needing PGlite. The widget gate with all three waits: 20 of 20 clean
  while a second copy ran beside it, and that copy 20 of 20 too, its
  `toggle` as late as 23 ms after the click; with two waits, in like
  conditions, 3 of 32 had failed. The first run on
  GitHub, on Node 24 and the real packages, is the one that counts, and from
  now on it is every push's.
- **In the Codespace, then on GitHub and Netlify, in this order:**
  1. `git pull --ff-only`, then `npm run gates` - ALL GATES GREEN, 34 gates.
     Then `node test/b2b-widget-test.mjs | tail -1` five times - `b2b-widget
     clean` each time.
  2. `git push`. On GitHub: the repository, then Actions, then gates, then
     the newest run; both jobs green. The Code tab's branch menu lists
     `live`.
  3. Netlify: Project configuration → Developer settings → Continuous
     deployment → Branches and deploy contexts → Configure; production
     branch `live`, branch deploys None; Save. Then Deploys → Trigger deploy
     → Deploy project. The deploy log names the branch `live`; the home page
     still reads 74 · Partial overlap.
  4. GitHub: Settings → Rules → Rulesets → New ruleset → New branch ruleset.
     Name `protect`, enforcement Active, targets `main` and `live`; Restrict
     deletions and Block force pushes on (both are by default) and nothing
     else; Create.
  5. The next push - the Live record for this one - is the real test: its run
     goes green, `live` moves, and Netlify starts a production deploy from
     `live` with nobody pressing a button. If none starts within a few
     minutes of `live` moving: stop and bring it.
  6. A red run, ever: the site stays as it was. The run's gates step holds
     the failing gate's lines; fix it on main and push again.
- **Live, 2026-10-16 (US Eastern): steps 1 to 4.** The Codespace's `git
  push` of `4a6e081`, the workflow file in it, was accepted. Its run, the
  workflow's first (38900014267), read through GitHub's API: gates from
  12:22:11 to 12:26:24 UTC, every step green - `npm ci` 3 s, Chromium 21 s,
  `extract-dump.js` 7 s, `gates.sh` 3 min 34 s, then the history and the
  clean tree; promote 6 s, making `live` at `4a6e081`. So GitHub took a push
  by its own token that made `live` at a commit adding the workflow file
  (below, Still open: moving `live` across a later change to it is
  untried). The job logs sit on a storage host the cloud workspace cannot
  reach, so the gate lines themselves were not read here. Netlify's
  production branch is `live` and branch deploys are None, set by the owner
  with a deploy by hand after (step 3). The ruleset, read through GitHub's
  API: `protect`, active, on `refs/heads/main` and `refs/heads/live`, its
  rules `deletion` and `non_fast_forward` alone, nobody to bypass it. This
  record's own push is step 5: its run green, `live` moved on, and a
  production deploy that Netlify starts by itself.
- **Live, 2026-10-16 (US Eastern): step 5.** The push of `34a246e` started
  run 38903503722 at 12:51:35 UTC; both jobs green, and promote moved `live`
  from `4a6e081` to `34a246e`, a fast-forward, by 12:55:58 UTC. Netlify then
  started a production deploy of `live` at `34a246e` with nobody pressing a
  button, and the home page read 74 · Partial overlap - both seen by the
  owner. So a push by GitHub's token reaches Netlify even though it starts
  no workflow run (Still open, below, no longer asks).

### One way to read a report, 2026-10-16

**The steps from a link to a verdict were written twice**: in `coa.js`'s
handler, and again in `scripts/b2b-coverage.js`'s `readFetched()`, with the
handler's four sentences copied in - and `scripts/b2b-read-catalog.js` writes
a store's production readings through that report script. A test kept the
two aligned by reading `coa.js` as text. Now the steps are written once,
`netlify/functions/lib/read-report.js` (§12), and both read by it. The first
of the architecture review's medium cleanups (project document
`claude/nose-m-cleanup-prompts-2026-10-15.md`, M1).

```
netlify/functions/lib/read-report.js  new: readReport(link, { fetch, extract, parse }) and STAGES; SCANNER (the four
                                      sentences), MIN_TEXT 200, UNSAFE_UNDER_UNPDF (empty) and the unsafe sentence
netlify/functions/coa.js              the handler reads through it; each stage its reply, as before; the archive call
                                      where it was, after the parse and before the refusals, the same values
scripts/b2b-coverage.js               readFetched() a thin wrapper, its name and { outcome, reasons, output } kept;
                                      SCANNER and MIN_TEXT read-report's own, re-exported
scripts/b2b-read-catalog.js           unchanged: it reads through readFetched(), and takes OUTCOMES and PAUSE_MS from
                                      the report script, as before
test/b2b-coverage-test.js             the source check re-pointed: both files read by read-report, neither restating a
                                      sentence, the floor or the list; read-report keeps out of the archive; 61 -> 62 checks
test/archive-wiring-test.js           the call-site check re-pointed to coa.js's new lines and read-report's order; 54 checks
PARSER-HANDOFF.md                     s12; this record; one line in s14's coverage report; Still open
```

- **The probe, before the edit**, on `cfc292e`. 1: the two copies side by
  side - the same order, the same 200-character floor, the same four
  sentences, and the one difference the prompt named: `coa.js` hands the
  report to the archive between the parse and the refusals, `readFetched()`
  keeps nothing. Four smaller ones, none of which any input reached: (a)
  `readFetched()` starts after `validateUrl`, because its two callers check
  the link first, so that a refused link is never paused for; (b) it had no
  unsafe-layout check - the test pinned the list empty instead; (c) it
  accepted on `usable === true`, where `coa.js` refused on `!usable`, the
  same on every parser output, a boolean; (d) a refusal with no reasons
  gives the report the sentence as its reason, where `coa.js` sends the
  reasons as they are. 2: as the prompt listed - `b2b-coverage-test` reads
  the source (517-521) and calls the handler with the same links (390-406);
  `archive-wiring-test` reads it (586-597) and calls the handler throughout;
  `input-paths-test` calls the handler; `resolver-test`, `duplicates-test`
  and `scripts/download-twice.js` take `_resolvePdfFromPage`. Three more
  name it only to check it is never loaded: `b2b-catalog-test`,
  `b2b-endpoints-test`, `b2b-compliance-kit-test`. 3: the before-run, below.
- **What `readReport` returns**: `stage` - `link`, `fetch`, `extract`,
  `text` or `parse` for a step that failed; once parsed, `unsafe`, `refused`
  or `accepted` - and `parsed`, `sentence`, `reasons` (the parser's, on
  `refused`), `url`, `buffer`, `finalUrl`, `viaPage`, `text`, `output`,
  every field present. Accepted means `usable === true`, the stricter of the
  two rules: fails closed (§6). `readFetched()` turns `link` and `fetch` into
  "fetch failed", `accepted` and `refused` into theirs as before, and the
  scanner's own refusals - `extract`, `text`, `parse` and, were the list
  ever not empty, `unsafe` - into "refused" with the sentence and no
  reading, so the reader would store such a batch as refused with no
  figure. It passes the link already checked, and read-report checks it
  again: `validateUrl` is pure and asks no server anything.
- **Before and after, line for line**, with a scratch harness (not
  committed, like earlier probes) run on `cfc292e` and on the edit, the
  real extractor and parser behind the coverage test's own stand-in fetch:
  the coverage report on the test catalog whole, with `--limit 3`, and on
  the slow link (8 s) - every printed line, `report.md` (121 lines) and
  `report.csv` (26), the requests and the pauses; `coa.js`'s handler on 45
  cases - every address either test serves or refuses, a page with no
  report, not a PDF, `localhost`, `10.1.2.3`, `[fd00::1]`, `ftp:`, not a
  link, and OPTIONS, GET, not JSON, no body, `{}`, a string, a number, an
  array, `null` (a TypeError on `.url`, before and after), a number and an
  object as `url` - status, headers and body, and the 31 requests made;
  `readFetched()` on the same links and on ten stand-in extracts and parses;
  and `readStore()` over the test catalog with the store stood in - "read
  19: 14 accepted, 2 refused, 3 gave no report", "written: 19 readings",
  every write's arguments. All identical (SHA-256 of each, before and
  after: `7ae44c04…`, `cdea980a…`, `5d1943cd…`, `fb86672d…`, `a140b2ea…`,
  `faecd02f…`). With the archive-wiring test's stand-ins, in production, 19
  more cases: 17 identical, reply and archive call alike - usable, refused
  with reasons, with none, without the field, not a report, the extractor
  throwing, a bare string, no text, 199 and 200 characters, the parser
  throwing, dev and a deploy preview (no archive), a private and a plain
  link. Every archive call identical in all 19: its arguments, its timeout,
  after the parse and before the reply, `connectLambda` first. Two replies
  differ, on outputs `parseCoa` cannot give - it returns one object, with
  `usable: rejectReasons.length === 0`: a parse returning `null` still
  throws after the archive, its TypeError naming `lab` rather than
  `usable`; and `usable: 1` is now refused, where it was shown.
- **Against broken copies**, one at a time in a throwaway copy, each fails
  its test: the old `coa.js` and the old script (2 checks); read-report
  requiring `lib/archive.js`; the archive call moved above `if
  (!read.parsed)`; a refusal replied to before the archive (4 checks of the
  wiring test); a sentence written into `coa.js`; the script's own `MIN_TEXT
  = 200`; `parsed` set before `parseCoa` runs; the floor at 300 in
  read-report. And with `SCANNER.unreadable` edited in read-report alone,
  the scanner's reply, the coverage report's row 9 and the reader's stored
  reading all carried the new sentence.
- **Netlify**: "Get started with functions"
  (https://docs.netlify.com/build/functions/get-started/, last updated May
  31, 2026, read 2026-10-16): "if you use a subdirectory, the entry file
  must be named `index` or match the subdirectory name". So
  `lib/read-report.js`, like every `lib/` file, is never a function of its
  own. "Functions configuration"
  (https://docs.netlify.com/build/functions/configuration/, last updated
  Sep 17, 2026, read 2026-10-16) names `node_bundler = "esbuild"` and does
  not say how a required file is followed; `coa.js` requires read-report at
  its top, as it requires `lib/fetch-report.js`, the way every `lib/` file
  reaches a function today. Step 3 below is where that shows.
- **What did not move.** Every reply above; every line of the coverage
  report; the reader's 19 readings and 14 accepted; the archive's call site,
  its arguments, its 9 s deadline, 2 s budget and 300 ms floor;
  `lib/fetch-report.js`, the parser and the maths; every `js/` and `css/`
  file, so `build.sh` renamed nothing; every gate's expected line, and their
  number, 34; what NOSE keeps or sends, so the privacy page.
- **How it was verified, 2026-10-16, in the cloud workspace**, Node 22,
  where npm's registry was refused: unpdf stood in for by its two calls
  over pdfjs-dist 6.2.108 (parity still `56 match / 0 differ`), Playwright
  1.56.0 with its Chromium. Before the edit 23 of the 34 gates green, with
  `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944; after it, the same 23 with
  the same lines - `node version` failing on Node 22 as it should, the other
  10 needing PGlite, `b2b catalog` among them (its 19 and 14 checked by the
  harness instead). The Codespace run on Node 24 and the real packages is
  the one that counts, then GitHub's.
- **In the Codespace, then on GitHub and the live site:**
  1. `git pull --ff-only` from the bundle, then `npm run gates` - ALL
     GATES GREEN, 34 gates.
  2. `git push`; on GitHub, Actions → gates → the newest run, both jobs
     green, and `live` at the commit.
  3. Once Netlify's deploy of `live` is done: on `/app`, COA link, read one
     report - its card shows as before.
- **Live, 2026-10-16 (US Eastern).** `816b510` pulled from a git bundle
  into the Codespace (`cfc292e..816b510`, a fast-forward). The link read on
  both sides of the deploy was Method Testing Labs' Purple Push Pop report on
  `coaportal.com` (the report behind `MTL-FLW-002`), its `pdf=` address. Read
  on `/app` while the site still ran `cfc292e`, its card was the fixture's:
  Method Testing Labs, Purple Push Pop, flower, 3.7% total, caryophyllene,
  limonene and myrcene on top. The Codespace's `git push` (`cfc292e..816b510
  main -> main`, about 14:40 UTC) started the run; promote moved `live` from
  `cfc292e` to `816b510` by 14:45:08 UTC - seen through `git ls-remote` from
  the cloud workspace, every 30 s, since GitHub's API refused it there, so
  the run's own page was not read here. Promote moves `live` only after the
  gates job passes, so every gate, on Node 24 and the real packages, was
  green. Netlify then deployed `live` by itself, and the same link read on
  `/app` gave the same card - checked by the owner.

### coa.js in the current format, 2026-10-16

**`coa.js` was the one function still written as `exports.handler`**,
Netlify's Lambda compatibility format, whose deploys Netlify stops accepting
on July 1, 2027. Two crashes went with it: a body of `null` threw on `.url`,
and so would anything else unexpected, and Netlify answered either with its
crash page - the error and its stack trace (security audit #5). Now it is
written as the other 16 functions are, one default export taking a Request
and returning a Response with nothing else exported, and a request it cannot
read gets a 400, anything else a fixed 500. The second of the architecture
review's medium cleanups (project document
`claude/nose-m-cleanup-prompts-2026-10-15.md`, M2).

```
netlify/functions/coa.js              export default async (request) => Response, nothing else exported; imports
                                      lib/read-report.js and lib/archive.js whole; null, an array, a string, a number
                                      or true gets the not-JSON 400; any throw the fixed 500 and one fixed line; takes
                                      no Context; the archive deadline its first statement
netlify/functions/lib/archive.js      archiveScan(), archiveOn() and ARCHIVE_LIMITS (9000, 2000, 300), moved from coa.js
                                      unchanged, their comments with them; requires lib/version.js for buildInfo()
netlify/functions/lib/pdf-store.js    connect() gone; open()'s comment says why nothing connects
netlify/functions/lib/fetch-report.js two comments: its coa.js line, and the 60s; the code hash-identical
test/archive-wiring-test.js           the default export, with a Request and a Context whose every read is recorded;
                                      the Lambda check flipped; the person rule over the request and the Context; the
                                      probe's bodies; two forced throws; no connect step; 54 -> 58 checks
test/input-paths-test.mjs             the default export, through the same one-file hook
test/b2b-coverage-test.js             the default export; _resolvePdfFromPage's check replaced (coa.js names none of
                                      the chain, its three other callers take it from fetch-report.js); read-report's
                                      import; 62 checks
test/archive-scripts-test.js          connect()'s check flipped: no connect(), and no file under netlify/ names
                                      connectLambda or exports a handler; 24 checks
test/resolver-test.js                 resolvePdfFromPage from lib/fetch-report.js
test/duplicates-test.js               the same, and its header
scripts/download-twice.js             the same, and its header
PARSER-HANDOFF.md                     s12; s13's table, "Connections and secrets", "How coa.js feeds it", "The PDF
                                      half"; this record; "After a deploy" step 5; Still open
```

- **What Netlify's docs say**, each read 2026-10-16 (US Eastern) through
  WebFetch, as markdown (this workspace's shell cannot reach
  docs.netlify.com). "Lambda compatibility for Functions"
  (https://docs.netlify.com/build/functions/lambda-compatibility/, last
  updated Jun 9, 2026): the mode is deprecated, and as of July 1, 2027
  "deploys containing functions in this mode will no longer be accepted".
  It points to the modern Functions API, or a package that keeps the old
  signature on the new runtime; NOSE ports instead. The deprecation
  announcement it links (Netlify Support Forums, "Deprecating Lambda
  compatibility mode", posted 2026-05-27) gives other dates: new deploys
  holding such functions fail from June 1, 2027, and ones already deployed
  stop answering on December 31, 2027. Neither date reaches NOSE now.
  "Get started with functions"
  (https://docs.netlify.com/build/functions/get-started/): a function file's
  default export receives a web Request and a Netlify `context` and returns
  a web Response. "Functions API reference"
  (https://docs.netlify.com/build/functions/api/): the Context exposes
  `account`, `cookies`, `deploy`, `geo` (city, country, subdivision,
  latitude, longitude, time zone, postal code), `ip` - "a string containing
  the client IP address" - `params`, `requestId`, `server`, `site`, `user`
  and `waitUntil`, which keeps a function running until a promise settles
  without holding back the reply, that time counting toward the execution
  limit. "Configuration for functions"
  (https://docs.netlify.com/build/functions/configuration/), Module format:
  a `.js` file runs as CommonJS unless the closest `package.json` says
  `"type": "module"`, and an ES module function "cannot use named imports
  for npm packages written in CommonJS"; Default values: 60 seconds for a
  synchronous function; Routing: every function at
  `/.netlify/functions/<name>` unless its `config` sets a `path`. So the
  other 16 are ES module syntax in a CommonJS package, compiled by esbuild
  (`netlify.toml`, `node_bundler`) into CommonJS that runs as CommonJS -
  and so is `coa.js` now. Checked here with esbuild 0.28.2: `coa.js`
  bundled as CommonJS for Node 24 exports `default` alone, a function of
  one argument, answers `null`, `{}`, OPTIONS and GET as the source does,
  and carries `build-info.json` inlined. No page said otherwise.
- **The probe, before the edit**, on `816b510`. 1: the docs, above. 2: §14's
  "Feed and votes" says Netlify hands a Request function its Blobs context,
  and "Privacy page, then switch on" records `b2b-vote`'s 204 and the vote it
  stored live on 2026-10-09; no function but `coa.js` named `connectLambda`.
  3: the handler as it was, given each body as JSON - `null` threw
  `TypeError: Cannot read properties of null (reading 'url')`; `[]`,
  `"a bare string"` and `{}` each `400 {"error":"That is not a valid web
  address."}`; `https://coa.example/kaycha/KAY-PRR-001.pdf`, KAY-PRR-001's
  own PDF behind the coverage test's stand-in fetch, `200`, 853 bytes,
  Kaycha Labs, `(I) Indica Blend`. 4: as the prompt listed -
  `archive-wiring-test` (the handler throughout, `_archiveScan` eight times
  and its source, `_archiveOn`, `_ARCHIVE_LIMITS`, the `exports.handler`
  check, `connectLambda` first, the rule that `archiveScan` never names
  `event`), `input-paths-test` and `b2b-coverage-test` (the handler; the
  coverage test also `_resolvePdfFromPage`'s identity and the source's
  `require('./lib/read-report')`), and the three `_resolvePdfFromPage`
  callers. Three things the list did not name, all forced by the port:
  `archive-scripts-test` checks `pdf-store.connect()`; two comments in
  `lib/fetch-report.js` describe `coa.js`'s old export and format; and
  `lib/archive.js` already says `context` - the deploy context a scan
  carries. Three tests name `coa.js` only to check it is never loaded -
  `b2b-catalog`, `b2b-endpoints`, `b2b-compliance-kit` - through
  `Module._load`, which still records a `require` of it (one would now throw
  besides): left as they are.
- **After, the probe's bodies**: `null`, `[]` and `"a bare string"` each
  `400 {"error":"Could not read that request."}`, and so do `42`, `true` and
  an array holding a url; `{}` still `400 {"error":"That is not a valid web
  address."}`; the link the same 200, byte for byte (SHA-256 `01b5e13dbb48…`
  before and after).
- **Before and after, line for line**, with two scratch harnesses (not
  committed, like earlier probes), the real extractor and parser behind the
  coverage test's stand-in fetch, in dev: 54 requests - every address the
  coverage test serves or redirects, Harmony, a Method report, a PDF with no
  text, a page with no report, a text file, a 404, plain http, the metadata
  address, `localhost`, `10.1.2.3`, `[fd00::1]`, `ftp:`, not a link, an
  empty link, a number, an object and `null` as `url`, OPTIONS, GET, PUT,
  DELETE, HEAD, not JSON, no body, an empty body, and the probe's bodies with
  `42`, `true` and an array holding a url - status, headers and body, every
  line logged and every request made. 48 identical; the six that differ are
  the six bodies that are not an object, as the prompt asks. In production,
  with the archive's two halves stood in for as `archive-wiring-test` stands
  them in, 13 cases - KAY-CAR-001 with both writes, the PDF failing, the
  database failing, a copy by text, withheld, the daily cap and the PDF
  hanging; GreenRoads, hemp-bombs, Harmony, ACS-FLW-002, the broken PDF and
  a presigned S3 link - every reply, every PDF write and save with all their
  arguments, and every log line identical.
- **Against broken copies**, each in a throwaway copy with its `.git`, each
  failing its test: the old `coa.js` (wiring, scripts and coverage tests); a
  second export; the handler taking the Context and reading its `ip`; the
  plain-object check removed; the try removed; the error's message on the
  failure line; a detail added to the 500; the deadline no longer taken at
  the start; `archiveScan` handed the request too; `storeScan` taking a
  `context` argument; `archiveScan` reading a `ctx`; a second archive call
  before the parse check; the sentence changed (the wiring test); `connect()`
  back in `pdf-store`, and another function written as `exports.handler`
  (the scripts test); `resolver-test` and `download-twice.js` back on
  `coa.js`, and `coa.js` importing `fetch-report.js` (the coverage test, and
  the resolver test for its own). An unchanged copy passes all four.
- **Decided here, where the prompt was silent:**
  - `archive-scripts-test`'s `connect()` check is flipped, not dropped: no
    `connect()`, and no file under `netlify/` names `connectLambda` or
    exports a handler - the prompt's "no function in the old format is left",
    as a gate.
  - `lib/fetch-report.js`: two comments only, made true - `coa.js` no longer
    exports `_resolvePdfFromPage`, and its format is no longer
    `exports.handler`. Its code, comments taken out, hashes the same.
  - The person rule's `context`: `lib/archive.js` keeps a scan's `context`
    field, the deploy context the database stores. So the rule is about
    Netlify's Context, not the word: no function there takes a `context` or
    `ctx`, nothing is read off one, `event`, `request`, `req` and `ctx` never
    appear; `archiveScan`'s own source names `context` only in
    `context: 'production'`; and the handler runs with a recorded Context
    nothing may read.
  - The forced throws are two: a parse whose `usable` throws, inside
    read-report before the archive, and a parse returning `null`, in
    `coa.js` after the archive (which keeps nothing of it, no sign shown).
    Both the fixed 500 and the one line; nothing of the error in either.
  - `true`, like `42`, is not a plain object: the same 400. A body that
    cannot be read at all - the Request's `text()` failing - is the not-JSON
    400 as well, being a request this cannot read; not reachable offline.
  - The failure line: `coa: the report reader failed - a fixed 500 sent, no
    detail logged`. The archive's lines keep their words and their `coa:`.
  - The deadline is the default export's first statement, before the method
    is looked at; until now it was taken after the method checks, a
    difference of nothing measurable. `archiveScan`'s signature is unchanged.
  - `context.waitUntil` is not used (above, "How `coa.js` feeds it").
  - Not checked: under the old format Netlify base64-encodes a body it treats
    as binary, which then failed `JSON.parse`; a Request's `text()` is the
    body as sent. The app sends `application/json` either way.
- **What did not move.** Every other reply, byte for byte, in both runs
  above, and the cases `archive-wiring-test` and `input-paths-test` drive;
  the archive's deadline, 2 s budget and 300 ms floor, database first,
  production only, and its log lines; the fetch chain, read-report (M1) and
  the parser; the address, `/.netlify/functions/coa`, with no `config.path`;
  every `js/` and `css/` file, so `build.sh` renamed nothing; every gate's
  expected line, and their number, 34; what NOSE keeps or sends, so the
  privacy page and the app's two lines about keeping.
- **How it was verified, 2026-10-16, in the cloud workspace**, on Node
  24.22.0 (GitHub's own build of it, from `actions/node-versions`), where
  npm's registry was refused: unpdf stood in for by its two calls over
  pdfjs-dist 6.2.108 (parity still `56 match / 0 differ`), Playwright 1.56.0
  with its Chromium. Before the edit 24 of the 34 gates green, `node
  version` among them, with `KAY-CAR-001` 4.124 and `KAY-PRR-001` 0.944;
  after it the same 24 with the same lines. The other 10 need PGlite,
  `duplicates` among them: its new import is checked by the coverage test's
  caller check, and `download-twice` ran offline with the resolver from
  `fetch-report.js` - the report page to its `&pdf=6` file, the same bytes
  and text twice, the 404 failed. The Codespace run on the real packages is
  the one that counts, then GitHub's.
- **In the Codespace, then on GitHub and the live site:**
  1. `git pull --ff-only` from the bundle, then `npm run gates` - ALL
     GATES GREEN, 34 gates.
  2. `git push`; on GitHub, Actions → gates → the newest run, both jobs
     green, and `live` at the commit.
  3. Once Netlify's deploy of `live` is done: on `/app`, COA link, read one
     report - its card shows as before. `curl -si -X POST
     https://nose-app.com/.netlify/functions/coa -H 'content-type:
     application/json' --data 'null'; echo` answers `HTTP/2 400` and
     `{"error":"Could not read that request."}`. The `echo` matters: the
     body ends without a newline, and with `-s` alone the Codespace's next
     prompt drew over it, so the first run looked empty.
  4. `node scripts/archive-health.js`: ok, the newest parse that report,
     dated today (UTC), context `production` - the archive written by the
     new format, with no `connectLambda`. Read a jar the archive has not
     seen: the same report again adds no parse.
- **Live, 2026-10-16 (US Eastern).** `c05a98f` pulled from a git bundle
  into the Codespace (`bacc758..c05a98f`, a fast-forward). `npm run gates`:
  ALL GATES GREEN, 34 gates, on Node 24 and the real packages - the ten
  this workspace could not run among them, `duplicates`, `b2b catalog` and
  `b2b endpoints` included. The Codespace's `git push` (`bacc758..c05a98f
  main -> main`) started the run; promote moved `live` from `bacc758` to
  `c05a98f` by 17:05:25 UTC, seen through `git ls-remote` from the cloud
  workspace every 30 s. Netlify then deployed `live` by itself. On `/app` a
  Kaycha Labs report read through the COA link showed its card - checked
  by the owner. `archive-health.js`: ok; newest parse #281, 2026-10-16,
  `production`, Kaycha Labs, GELATO #43, flower, usable, total 2.11%, 15
  terpene values, document #463, parser `c05a98f`, extractor `2e793bebe82a`
  - the archive written by the current format; no PDF without its row, and
  the only documents without a PDF still #3 and #184, kept on 2026-09-23
  before PDFs were, so #463's PDF was written with no `connectLambda`. The
  `null` request (step 3, with `-i`) at 17:12:45 UTC: `HTTP/2 400`,
  `cache-control: no-store`, `content-type: application/json`,
  `x-content-type-options: nosniff`, `{"error":"Could not read that
  request."}` - where the same request had crashed the function until this
  deploy.

### One set of server helpers, 2026-10-16

**The server's plumbing was written more than once**: a bounded connection
in `lib/store.js` and again in `lib/b2b-store.js`, an error scrubber in
`lib/archive.js` (`reason()`) and a stricter one in `lib/b2b-store.js`, a
body reader in `netlify/lib/auth.js` and another in `netlify/lib/beacon.js`,
and replies, a 404 and a time limit in each function that needed one. Now
`netlify/functions/lib/db.js` holds the connection and the scrubber, and
`netlify/lib/http.js` the body reader, the shared replies and the time
limit; everything that had a copy uses them. The third of the architecture
review's medium cleanups (project document
`claude/nose-m-cleanup-prompts-2026-10-15.md`, M3): the first four rows of
the review's DRY table - `withClient`, the scrubber, `readJsonBody` and the
response helpers (`claude/nose-architecture-review-2026-10-15.md`, section
2) - are closed.

```
netlify/functions/lib/db.js           new, CommonJS: withClient(fn, { urlEnv, name, timeoutMs, _Client }) with store.js's
                                      bounds, error listener and unawaited end(); clientConfig() and checkUrl(), moved from
                                      store.js; scrub(), the dispensary store's rules
netlify/lib/http.js                   new, ES module: readJsonBody(request, { limit }), json(data, status, headers, { space }),
                                      JSON_UTF8, notFound(), methodNotAllowed(allow), within(promise, ms)
netlify/functions/lib/store.js        withClient, clientConfig, checkUrl and the CA loader gone to db.js; clientConfig
                                      re-exported for the scripts; clean and findPersonalKey public; _checkUrl gone
netlify/functions/lib/b2b-store.js    db.js's withClient and scrub; scrub public; _scrub and _withClient gone
netlify/functions/lib/archive.js      reason() gone: db.js's scrub(), still exported as reason for its callers
netlify/lib/auth.js                   readJsonBody is http.js's at 4096; json and methodNotAllowed gone to http.js
netlify/lib/beacon.js                 readJsonBody is http.js's at 16384
netlify/functions/*.js                15 of the 17 take their replies, 404, 405 and time limit from http.js - b2b-vote its
                                      body reader too, at 2048; errors-purge and keep-awake unchanged
scripts/b2b-store.js                  b2b.scrub(e) for b2b._scrub(e); so do b2b-coverage.js and b2b-read-catalog.js
scripts/lib/rerun.js                  store.clean for store._clean; one comment
test/store-test.js                    db.checkUrl for store._checkUrl; clientConfig one function; urlEnv required; 114 -> 116
test/archive-wiring-test.js           the hook loads http.js; coa.js's call-site and import pins re-pointed; the parameter
                                      scan's "err" now "work"; findPersonalKey; reason is scrub, keys and quoted values out;
                                      one copy of each helper under netlify/; 58 -> 60 checks
test/b2b-store-test.js                findPersonalKey, db.checkUrl; one scrubber, no _scrub or _withClient; 155 -> 156
test/b2b-endpoints-test.js            the hook loads http.js; the feed's and the vote's import pins; findPersonalKey;
                                      http.js reads no clock, header or cookie; 91 -> 92
test/match-feedback-test.js           the hook loads http.js; the vote's import pin, its one http.js helper; 69 -> 70
test/b2b-catalog-test.js              the hook loads http.js; the import pin; 90 checks
test/b2b-release-test.js              the hook loads http.js; the import pin; 77 checks
test/b2b-coverage-test.js             the hook loads http.js; 62 checks
test/input-paths-test.mjs             the hook loads http.js
test/b2b-pilot-test.js                db.js copied into its throwaway tree, beside store.js
PARSER-HANDOFF.md                     s13: "What exists", "How coa.js feeds it", "Seeding and health"; this record; Still open
```

- **The probe, before the edit**, on `6bd72d6`. 1: each pair side by side.
  `withClient`: the variable (`NOSE_DB_URL`, `NOSE_B2B_DB_URL` with `name:`
  as well), the default written `4000` and `DEFAULT_TIMEOUT_MS` (4000), and
  one comment; nothing else. The scrubber: `b2b-store`'s is `reason()` plus
  `n[sp]k_...` to `<key>`, first, and `:\s*"..."` to `: <value>`, before the
  whitespace fold; the same 160-character cut. `readJsonBody`: 4096 and
  16384, and auth checks empty before too large where beacon checks too large
  first - an order no input can tell apart, since an empty body is never over
  a limit of 0 or more; the same five reasons. The replies: `headers`,
  `reply` and `notFound` byte-identical in b2b-catalog, b2b-feed and b2b-vote,
  `unavailable` the same shape with each function's own sentence;
  b2b-release's `notFound` the same two headers; `within()` rejecting "gave
  up after Nms" in b2b-vote and "timed out" in b2b-release, neither message
  reaching a reply or a log; `json()` as auth's `(data, status, extra)`,
  coa's `(status, body)` - the arguments the other way round, its header
  names capitalised, plus `X-Content-Type-Options` - and feedback-read's,
  always 200 and indented by 2. Not in the prompt: `Method Not Allowed`
  written out in client-error, match-feedback, feedback-read and palate-sync,
  byte for byte auth's `methodNotAllowed`. 2: the harness, below. 3: callers -
  `_clean` b2b-store.js and scripts/lib/rerun.js (twice); `_findPersonalKey`
  b2b-store.js, archive-wiring-test, b2b-store-test, b2b-endpoints-test;
  `_scrub` scripts/b2b-store.js (three), b2b-coverage.js, b2b-read-catalog.js
  (two); `_withClient` none; `archive.reason` archive.js itself (three),
  archive-health, reparse, remove-copies, seed-from-fixtures,
  scripts/lib/rerun.js, download-twice, backfill-from-blobs and
  archive-wiring-test. `clientConfig` is taken from store.js by eleven
  scripts, as the prompt said; none changed.
- **Before and after, reply for reply**, with a scratch harness (not
  committed, like earlier probes): every gate's test run under a recorder
  that logs each reply a function returns - status, every header, the body's
  bytes - each message either scrubber produces, with what it was given, and
  each console line from a file under `netlify/` or `scripts/`; and a script
  driving the functions no gate drives - the five auth functions,
  account-delete, palate-sync, client-error, errors-purge and keep-awake,
  with match-feedback's and feedback-read's body edges - on a fixed clock,
  with Blobs and Supabase stood in, every Blobs call and Supabase request
  recorded. Two runs on `6bd72d6`: 557 replies, 39 scrubbed messages (26
  archive, 13 dispensary), 63 log lines, 155 Blobs records, 37 Supabase
  requests and 148 cases, identical once seven listed values made fresh by
  each run are masked - a `mkdtemp` folder, a minted key and its prefix, a
  throwaway repository's commit, a real clock's time left and time stamp,
  and beacon.js's `Math.random()` suffix (unmasked, 544 of the 557 replies
  already matched). On the edit, against the first run: **all 557 replies
  identical** (by function: account-delete 6, auth-login 40, auth-logout 5,
  auth-me 7, auth-reset 12, auth-signup 26, b2b-catalog 32, b2b-feed 36,
  b2b-release 37, b2b-vote 154, client-error 23, coa 87, errors-purge 2,
  feedback-read 15, keep-awake 3, match-feedback 59, palate-sync 13); **all
  39 scrubbed messages identical** - no message a test produces carries a key
  or a quoted value, so the archive's taking up the stricter rules changed
  none of them, and the one more is the new check's own, `invalid input
  syntax for type json: <value> near <key>`; the 155 Blobs records, 37
  requests and 148 cases identical; and 62 of 63 log lines, the one that
  differs `check-trust.mjs`'s own count of what it read - 277 files in git
  and 37 server files where it had 275 and 35: the two new ones. A second run
  on the edit gave the same.
- **What changes in a log, then**: only the archive's own failure lines and
  the scripts that print `archive.reason()` - reparse, backfill, the seed,
  archive-health, remove-copies, download-twice and the re-run helper - and
  only when an error's message holds an `nsk_` or `npk_` key or a quoted
  value, as Postgres quotes a value it could not read. Those now read `<key>`
  and `: <value>`, as the dispensary store's always have.
- **Decided here, where the prompt was silent:**
  - `withClient` has no default variable: a call without `urlEnv` is a
    TypeError, so nothing can reach the archive by leaving it out. `name`
    defaults to `urlEnv`. b2b-store passes its `DEFAULT_TIMEOUT_MS` when a
    caller gives no `timeoutMs`, exactly as its own default did, `null`
    included.
  - `readJsonBody`'s limit is required, in characters as before; the empty
    check comes first, as auth's did.
  - `json()` sets each header through `Headers.set`, so `headers` replaces
    one of the two defaults by name in any case - coa's `Content-Type` was
    always the same header as `content-type`. Its fourth argument,
    `{ space }`, keeps feedback-read's indented replies; `JSON_UTF8` is the
    dispensary functions' `application/json; charset=utf-8`.
  - The four inline 405s became `methodNotAllowed()`, the same bytes.
    b2b-release keeps its `plain()` for its 405 and 503, which carry
    `cache-control` and their own Content-Type, so are not that reply.
  - `unavailable`, `forbidden` and `unauthorized` stay one line each in their
    function, over `json()`: each says that function's own sentence.
    coa.js's `function reply(request, deadline)` is its handler's body, not a
    helper, and keeps its name.
  - `within()` rejects with "gave up after Nms", b2b-vote's words.
  - `_checkUrl` went with the function to db.js: the two tests that used it
    call `db.checkUrl`. `_buildPayload`, `_buildBatchRows` and `_buildRead`
    are used by tests alone and stay.
  - `query_timeout`'s comment, moved to db.js, now says `lib/archive.js` says
    more, where M2 put it; that Still open item is gone.
  - store.js and db.js name the dispensary store in words, not by its file
    name: b2b-store-test's check that no consumer file loads it reads their
    text.
- **Forced, not in the prompt's list of tests**: every test that loads a
  function through a one-file hook loads `http.js` with it, as a module
  (archive-wiring, b2b-catalog, b2b-coverage, b2b-endpoints, b2b-release,
  match-feedback, input-paths); b2b-catalog, b2b-release and match-feedback
  pin their function's import lines, and archive-wiring coa.js's and a
  `json(422, ...)` call site; archive-wiring's parameter scan of archive.js
  expected `err`, which was `reason()`'s; and b2b-pilot-test copies the files
  `scripts/b2b-pilot-report.js` loads into a throwaway tree, so db.js joins
  store.js there. Each keeps its check and its gate line.
- **New checks**, in existing gates: store.js's `clientConfig` is db.js's and
  it defines no connection helper of its own; `withClient` refuses a call
  that names no variable; `archive.reason`, `b2b.scrub` and db.js's `scrub`
  are one function, and b2b-store exports no `_scrub` or `_withClient`; the
  archive's reason takes out a key and a quoted value; http.js reads no
  clock, header or cookie; and one copy of each helper under `netlify/` - a
  connection helper only in db.js, the scrubber's rules only there, `function
  readJsonBody`, `json`, `reply`, `notFound`, `methodNotAllowed` and
  `within` only in http.js, a written-out 404 only there and a 405 only there
  and in b2b-release.
- **Netlify**, read 2026-10-16 (US Eastern) through WebFetch. "Get started
  with functions" (https://docs.netlify.com/build/functions/get-started/,
  last updated May 31, 2026): a file in a subdirectory of the functions
  folder is a function only when named `index` or after the subdirectory, so
  `lib/db.js` is none. "Configuration for functions"
  (https://docs.netlify.com/build/functions/configuration/, last updated Sep
  17, 2026): a `.js` file runs as CommonJS without `"type": "module"`; an ES
  module function cannot take named imports from an npm package written in
  CommonJS; `node_bundler = "esbuild"`. Neither page says how a relative
  import outside the functions folder is followed. `http.js` is reached as
  `auth.js` and `beacon.js` have been since before 2026-10-09 - a named
  import of a relative ES module, which b2b-vote has made live since then -
  and esbuild 0.28.2 here bundles all 17 functions with it inlined, each
  exporting what it did (`default`, and `config` or `resolveEntitlement`
  where it had them); the bundles answered coa's `null`, `{}` and GET, the
  dispensary 404s, login's 405 and empty body, palate-sync without a
  session, feedback-read's 405 and client-error's 16385 characters with the
  same status, headers and body as the source. `/netlify/*` is a forced 404
  in `_redirects`, so neither new file is served.
- **What did not move.** Every reply above, byte for byte; every log line,
  in the harness's runs, but check-trust's own count; the person-key lists
  and the two `holds_no_person()` bodies (b2b-store-test); every function's
  address, `config` and switch; the parser, the maths and every `js/` and
  `css/` file, so `build.sh` renamed nothing; the eleven scripts'
  `clientConfig`; every gate's expected line, and their number, 34; what NOSE
  keeps or sends, so the privacy page.
- **How it was verified, 2026-10-16, in the cloud workspace**, on Node
  22.22.0, where npm's registry was refused: pg 8.23.0 built from its own
  repository's tags on GitHub (pg-protocol compiled from its TypeScript),
  PGlite stood in for by its three calls over a throwaway PostgreSQL 16
  cluster through that pg, unpdf by its two calls over pdfjs-dist 6.2.108
  (parity still `56 match / 0 differ`), Playwright 1.56.0 with its
  Chromium. Before the edit 33 of the 34 gates green, with `KAY-CAR-001`
  4.124 and `KAY-PRR-001` 0.944; after it the same 33 with the same lines,
  the PGlite ten among them; `node version` failing on Node 22, as it
  should. The stand-in is PostgreSQL 16, PGlite another build of Postgres,
  so the Codespace run on Node 24 and the real packages is the one that
  counts, then GitHub's.
- **In the Codespace, then on GitHub and the live site:**
  1. `git pull --ff-only`, then `npm run gates` - ALL GATES GREEN, 34
     gates.
  2. `git push`; on GitHub, Actions → gates → the newest run, both jobs
     green, and `live` at the commit.
  3. Once Netlify's deploy of `live` is done: on `/app`, COA link, read one
     report - its card shows as before; on `/account`, sign in, then sign
     out. Then `node scripts/probe-db.js`: probe clean - TLS, the roles and
     the grants, through the `clientConfig()` that is db.js's now, as
     nose_writer and, with `NOSE_B2B_DB_URL`, nose_b2b.

### The Windows desktop builds and runs the gates, 2026-11-13

From the whole-repo review of 2026-11-12 (finding 3, prompt P3). The work
moved to a Windows 10 desktop on 2026-11-11, and that checkout could not run
anything.

- **Line endings.** There was no `.gitattributes`, and Git for Windows sets
  `core.autocrlf=true`, so 196 tracked files were checked out with CRLF.
  bash could not run `build.sh` or `scripts/gates.sh`, and a bundle hashed
  over CRLF bytes would get another name than GitHub computes.
  `.gitattributes` now says `* text=auto eol=lf`, with pdf, png, jpg, avif
  and webp binary. `git add --renormalize .` staged nothing else: git
  already stored every file with LF. The working folder was then rewritten
  with `git rm --cached -r -q . && git reset --hard -q`, which leaves
  untracked and ignored files alone; `git ls-files --eol | grep -c w/crlf`
  prints 0.
- **Node.** Node 24.22.1, installed with winget (`OpenJS.NodeJS.LTS`, version
  24.22.1). winget's LTS package is at Node 26, so the version is named.
- **The first gate run, sorted.** Pile one, a test or script that assumed `/`
  in a path: match maths, remove copies, b2b coverage, b2b store, b2b
  catalog, b2b endpoints - the six the review named. In b2b store,
  `scripts/check-published.js` itself printed a tracked file's path with `\`.
  Pile two, anything else: empty. The three browser gates failed only until
  Chromium was installed.
- **The fix.** Where one of those six tests, or `check-published.js`, builds
  a path to compare or print, it writes `/` on every system
  (`p.split(path.sep).join('/')`). No check is loosened and no expected value
  changed.
- **`node-version-test.js`** gains one check: `build.sh`, as it sits in the
  working folder, holds no carriage return. It fails with "this checkout has
  CRLF line endings - see CLAUDE.md, Windows".
- `CLAUDE.md` has a "Windows" section under "Commands". Playwright on Windows
  installs without `--with-deps`.
- **The Codespace needs nothing.** Its files were already LF, and
  `path.sep` is `/` there, so each changed line does what it did.

### The site stops serving stray root files, 2026-11-14

From the review of 2026-11-12 (finding 1, prompt P1). `netlify.toml`
publishes the repository root and `_redirects` hides source by a list of
names, so a new top-level file is public until someone adds a rule. Two were
added on 2026-11-11 and were on no list.

- **Seen on the live site, 2026-11-14, before this change:**
  `curl -s -o /dev/null -w '%{http_code} %{size_download}\n' https://nose-app.com/dry-run.txt`
  answered `200 11785`, and the same for `/CLAUDE.md` answered `200 9546`.
  `/netlify.toml`, `/_headers`, `/_redirects`, `/package.json`,
  `/PARSER-HANDOFF.md`, `/.gitignore` and `/.nvmrc` each answered 404.
- `dry-run.txt` is deleted from the tree. It was the output of
  `reparse.js --dry-run` on the real archive: 68 documents by the start of
  their file hash, lab and strain name. It stays in git history (`dbd1d8c`);
  it names labs and strains, not people.
- `_redirects` forces a 404 for `/CLAUDE.md`. The file stays at the root,
  where Claude Code reads it.
- `scripts/check-published.js` has a third check (§13, "The build guard, and
  what it found"). It reads tracked names only: Netlify builds from a git
  checkout, so an untracked file is never deployed. A new page or folder is
  added to the list in the script on purpose.
- `test/b2b-store-test.js` checks it on scratch sites: a tracked top-level
  file or folder fails and is named; a forced 404 passes it and an unforced
  one does not; dot names, Netlify's own three files and the served names
  pass. Same gate line.
- **Not yet checked on the live site:** that both addresses answer 404. That
  waits for this commit's deploy.

### A jar that is gone is never replaced by another, 2026-11-14

From the review of 2026-11-12 (finding 2, prompt P2). In `js/nose`,
`profileById()` answered the first sample, Lemon Tart Pucker, for any id it
could not find. Delete, Import, Remove and "Load from account" each left ids
of jars that were gone in the palate or as the compared jar, so a score could
be computed from Lemon Tart Pucker's numbers under a jar the person had
deleted.

- **Votes before this day.** A vote cast after one of those four actions,
  before this change deployed, may hold `palate: ["lemon-tart"]` (or
  `lemon-tart` repeated) for a pair nobody compared. Nothing in a vote tells
  those apart from a real Lemon Tart Pucker palate, so read votes dated
  before 2026-11-14 with that in mind.
- `profileById()` answers undefined for an id that is neither a sample nor a
  saved jar. The hero asks only for sample ids.
- `dropMissingJars()` runs after each of the four: the palate keeps only ids
  that exist, a compared jar that is gone becomes the default sample
  (`cold-creek`), and the chips and the result are drawn again. "Load from
  account" no longer empties the palate; it drops only what is gone.
- `updateFullResult()` with an empty palate hides `#fullResult` and clears
  the feedback context, so no vote is sent for a result not on screen.
- Import asks first when jars are saved: "Replace the N jars in this browser
  with M from this file? What is here now will be lost." Cancel changes
  nothing. The file input is cleared, so the same file can be chosen again.
- The unused `LAB_ALLOWLIST` constant and its comment are deleted.
- `test/input-paths-test.mjs` runs the four actions in a second browser
  context: 12 checks, each of which failed before the change. Same gate line.
- Bundle: `js/nose.2280eec5.js` became `js/nose.e69ed548.js`.

### Start-up error reports reach the server, 2026-11-14

From the review of 2026-11-12 (finding 7, prompt P7). `js/nose`'s `step()`
catches a failure in a start-up phase and reports it with kind
`init:<step>`. `client-error.js` took only `error` and `unhandledrejection`,
so each such report was answered `400 bad-kind` and dropped - and because
`step()` catches the error, the browser's own error event never fires for it.

- `client-error.js` accepts `error`, `unhandledrejection`, or `init:`
  followed by 1 to 40 lower-case letters and spaces. The stored record has
  the same fields; the kind is stored as sent. For an init report, `source`
  is the first 200 characters of the stack and `line` and `col` are null.
- `test/client-error-test.js`, a new gate `client errors` after `match
  feedback` (35 gates now): the four kinds stored, every name the bundle
  passes to `step()` accepted, six other kinds refused and nothing stored.
  It failed on the unchanged function.
- `test/lib/functions-harness.js` is the stand-in for `@netlify/blobs` and
  the module hook, shared with `accounts-test`.
- The privacy page's sentence ("the error message, the script and line it
  came from") is unchanged: a stack names scripts and lines and nothing else.
- **Not yet done:** the one synthetic report to the live site (P7's last
  step), which waits for the deploy.

### A gate for the account system, 2026-11-14

From the review of 2026-11-12 (finding 4, prompt P4). No test loaded
`auth-login`, `auth-logout`, `auth-me`, `auth-reset`, `auth-signup`,
`account-delete` or `palate-sync`, and nothing loaded `netlify/lib/auth.js`.

- `test/accounts-test.js`, a new gate `accounts` after `match feedback` (36
  gates with `client errors`). Offline: `@netlify/blobs` is stood in for by
  `test/lib/functions-harness.js`, and global `fetch` - the one way
  `gotrue()` reaches Supabase - by a made-up user list that records every
  call. 60 checks; §5's table says what they cover.
- Checked against four broken copies, not committed: the cookie without
  `HttpOnly`, `account-delete` not naming a failed palate step, a console
  line printing the address (each one failing check), and `palate-sync`
  using one key for everyone (the run stops before its last check, which
  fails the gate).
- **One fault it found, fixed in the same commit:** a request whose cookie
  was `nose_session=%` made `readCookie()` throw in `decodeURIComponent`,
  and with it every function that reads a session, where `readSession()`'s
  comment says it never throws on a bad cookie. `readCookie()` now answers
  null for a value that is not valid percent-encoding.
- P4 and P5 were run in one session, so the two checks P4 was to pin "as it
  stands" were written once, in the form P5 leaves them.

### Sessions end when the privacy page says, 2026-11-14

From the same review (finding 5, prompt P5). A session record holds the
person's email address. An expired one was deleted only when its cookie came
back, and the browser drops the cookie at 14 days, so most expired records
stayed in Blobs with no end date. `destroyAllSessions()` answered 0 when its
listing failed, so `account-delete` reported no failure.

- `auth.js` gains `purgeExpiredSessions(now)`: it lists `sessions/` page by
  page and deletes each record whose `expiresAt` has passed, with its
  `by-user/<userId>/<id>` entry, and each record that cannot be read as a
  session. It returns counts only.
- `netlify/functions/sessions-purge.js`, scheduled `@daily` as
  `errors-purge.js` is, calls it and logs one line: scanned, deleted,
  failed. Never an id or an address.
- `destroyAllSessions()` throws when its listing fails. `account-delete`
  then answers 500 `partial` with `failed: ["sessions"]`; `auth-logout`'s
  "everywhere" logs one line and still clears the cookie, as its existing
  catch did.
- The session cookie and the key layout are unchanged, so the deploy signs
  nobody out.
- The privacy page, "How long we keep things": "Sessions: fourteen days, or
  until you log out; an expired session's record is removed within a day."
  "What changed" gains no entry: nothing new is collected.
- The security audit's item 14 (throttle records with no end date) stays
  open and is not touched here.
- **Not yet checked:** the first daily run in Netlify's function log.

### Four sentences made true, 2026-11-14

From the review of 2026-11-12 (finding 6, prompt P6). Four public sentences
said more than the code does. No code changed; `coa.js`'s header comment did.

- **Privacy, the cookie.** It said the cookie "is not sent when another site
  links to us". `auth.js` sets `SameSite=Lax`, chosen so that it is sent when
  someone follows a link to NOSE. Now: "The cookie cannot be read by
  JavaScript and is only sent over HTTPS. It is sent when you follow a link
  to NOSE, so you arrive signed in, and it is not sent with requests another
  site makes in the background. An earlier version of this sentence said it
  was not sent when another site links to us."
- **Privacy, the report check.** It said "A fabricated report fails that
  test whatever address it arrived from." The test is arithmetic. Now: "...
  the figures inside it must add up to the total the report itself prints.
  That catches a report we misread. It does not prove a report is genuine: a
  made-up document whose numbers add up would pass. An earlier version of
  this paragraph said a fabricated report fails that test."
- **The guide** (`learn/how-to-read-a-coa/`). It said NOSE accepts a report
  only with "a lab layout it recognizes". Now: "NOSE fetches the PDF and only
  accepts it if the terpene values reconcile with the total the report
  prints. If the lab or the layout is one NOSE has not seen before, the card
  says so." `dateModified` is 2026-11-14.
- **Terms.** It told a person to change their password, which no page does.
  Now: "If you think someone else has access, use Log out on every device on
  your account page and email us. Changing a password from the site is not
  available yet."
- **The decision behind the second and third** (review, decision 2): a
  report from a lab the parser has not seen stays accepted when its numbers
  reconcile, with the card's novelty line. Refusing unknown labs would turn
  away real reports. The probe, a made-up 12-terpene report from "Some New
  Lab LLC", printed `true null unknown 1`: usable, no lab, product unknown,
  one novelty note.
- `sitemap.xml`: lastmod 2026-11-14 for the three pages.

### The maths has a property test, and its golden file can be made again, 2026-11-14

From the review of 2026-11-12 (finding 10, prompt P10). No score changed.

- **`test/match-props-test.js`**, a new gate `match props` after `match
  maths` (37 gates). It states properties where `match-test.js` compares
  recorded scores; §5's table lists them. A seeded generator, no
  `Math.random`. Checked against four broken copies of the maths, not
  committed, each of which failed it: `normalize()` returning raw values,
  `cosine()` over one profile's keys, `<` no longer read as zero, and
  `matchBand()` cutting at 0.76.
- **`test/match-golden-make.js`** could not do what `CLAUDE.md` and §8 told
  a reader to do with it: it read the maths out of the old bundle
  `js/nose.81d6bb53.js` and refused any other file. With no argument it now
  takes the maths from `scripts/lib/match.js` and the demo profiles from
  `js/nose`'s `PROFILES`, and writes the same structure in the same order.
  Given a bundle's path it does what it did. With `--why "<reason>"` it
  writes the reason and today's commit into `about` and `source`; without
  it, those two strings are kept.
- **The proof that nothing moved:** `sha256sum
  test/fixtures/match-golden.json` printed
  `2a7e6cce2a78491e2422f9fa977e8b40edb601e8363afedffbf418f6529258eb` before,
  and the same after `node test/match-golden-make.js`; `git status` showed no
  change to the file.
- For a change that is meant to move scores: `node test/extract-dump.js`,
  then `node test/match-golden-make.js --why "<what changed>"`, in the same
  commit. `CLAUDE.md` and §8 now give that command.

### The method page says what the code does, 2026-11-14

From the review of 2026-11-12 (finding 8, prompt P8). The methodology page
named no label and no threshold, though the code and its tests call 90, 75
and 55 "the published method"; its confidence step named a rule the code
does not have; and the result's summary line showed the internal band name
as a "confidence band".

- **The page** (`methodology/index.html`, `dateModified` 2026-11-14) gains:
  the 15 compounds by family, and that anything else is left out with the
  card saying how much; the two reading rules (below the reporting limit is
  zero; cis- and trans-nerolidol are added together); that a palate is the
  average of its jars' shares; a step "4. Name the result" with a table of
  the four labels (Close match 90 and up, Related profile 75 to 89, Partial
  overlap 55 to 74, Different profile below 55), that the number is rounded
  down so a 74.9 shows 74, and that the cut-offs are ones NOSE chose, tested
  by the votes; and step 5, confidence as coded.
- **One change in the code:** `confidence()` in `js/nose` takes the smallest
  count of the 15 compounds among the jars compared - each jar in the palate
  and the new jar. It counted the averaged palate, the union across its
  jars, so jars with few compounds each could read High. The three sentences
  it returns are unchanged. No score, band or threshold changed.
- **The summary line** reads "74% aroma similarity", with no band word. The
  badge above it shows the label.
- **Privacy page:** a vote sends "its match band", where the page said "its
  confidence band". The vote's fields are unchanged.
- `match-test.js` reads each label and the score it starts at from
  `matchBand()` and fails if the page's table differs. `input-paths-test`
  checks a palate of two four-compound jars reads Low, and the summary line.
- Bundle: `js/nose.e69ed548.js` became `js/nose.b7f83949.js`.

### Focus you can see, messages you can hear, tabs that take arrow keys, 2026-11-14

From the review of 2026-11-12 (finding 12, prompt P12).

- **The focus ring** was `rgba(47,97,68,.38)` in `css/shell` (two rules) and
  `family.css` (two rules; the review named one). By WCAG 2.2's relative
  luminance and contrast ratio it reached 1.81:1 over the page `#F3F3EE`,
  1.85:1 over white and 1.34:1 over the footer `#0F150F`; SC 1.4.11 asks
  3:1. It is now solid `#2F6144` (6.47:1 on the page, 7.21:1 on white), and
  inside `.footer` `#82C59A` (9.17:1; the page green would reach 2.57:1
  there). The review computed the footer as `#18211B`; the stylesheets say
  `#0F150F`. Offsets are unchanged.
- **Three messages are announced:** `urlMessage`, `uploadMessage` and
  `manualMessage` in `app.html` have `role="status"`.
- **The five tabs follow the tabs pattern:** the selected tab has tabindex
  0 and the others -1; Left and Right move focus and selection and wrap;
  Home and End go to the ends. Scan QR still starts the camera only when it
  is chosen.
- A manual row's remove button is renamed when the row's compound changes.
- **Two sentences:** a refused camera says "Camera permission was denied.
  Allow camera access for this site in your browser's settings, then try
  again." (it named Safari in every browser). After a vote: "Sent — thank
  you." where it said "Logged", since the page does not know the vote was
  stored.
- `colour-tokens-test` gains check 6: no stylesheet of the site draws an
  outline in a translucent colour, and the two rings reach 3:1.
  `input-paths-test` checks the keys, the status role and the remove label.
- Bundles: `js/nose.b7f83949.js` became `js/nose.81127089.js`,
  `css/shell.a26570a7.css` became `css/shell.99ebd527.css`,
  `family.8e3469b6.css` became `family.f334208a.css`.
- **Not done:** no before-and-after pictures were taken, and nobody has
  listened with VoiceOver or TalkBack. The live-region and key behaviour is
  checked in headless Chromium only.

### The live site is checked after every deploy, 2026-11-14

From the review of 2026-11-12 (finding 13, prompt P13). The workflow ended
when promote pushed `live`. The gates load each function's source in Node;
Netlify's bundling and runtime ran only on Netlify, so a function that did
not start there, a failed Netlify build, a paused site or an expiring
certificate waited for whoever next opened the site.

- **`scripts/live-check.sh <site> [<commit>]`**, bash, curl, git and
  openssl. It reads only: no vote, no error report, no link to a report, no
  secret. One line per check, then `live-check clean`, or exit 1 naming the
  first failure. It checks:
  - with a commit: within 10 minutes, the home page and `/app` link the
    same fingerprinted files as that commit's `index.html` and `app.html`.
    A commit that renamed none of those files looks like the one before it,
    so for such a commit this shows the site is up, not that the deploy
    arrived
  - `/`, `/app`, `/privacy/` and `/methodology/` answer 200
  - `coa` answers a body of `null` with `{"error":"Could not read that
    request."}`
  - `b2b-feed` with no key answers 400 (the module on) or 404 (off)
  - `/PARSER-HANDOFF.md`, `/CLAUDE.md`, `/package.json` and `/README.md`
    answer 404
  - the certificate has more than 14 days left
- **`.github/workflows/gates.yml`** gains `live-check` (needs promote, runs
  only when promote succeeded, 15-minute limit, `contents: read`) and
  `weekly-live-check` (Mondays 09:17 UTC and "Run workflow", needing neither
  gates nor promote). The gates and promote jobs are unchanged line for
  line. On the weekly schedule the gates job runs too; promote does not.
- **Checked:** the workflow parses as YAML (js-yaml, in a scratch folder),
  with four jobs. `actionlint` was not run. On 2026-11-14, from the Windows
  desktop, `bash scripts/live-check.sh https://nose-app.com` ended
  `live-check clean`, and with `origin/live` (`530c466`) as the commit it
  passed too. `b2b-feed` with no key answered 400 that day; the certificate
  ends 2027-01-25.
- **This is the first push since 2026-10-16 that changes the workflow
  file.** If promote fails with "refusing to allow a GitHub App to create or
  update workflow", the site has not moved: Still open has the steps.

### Dependency alerts, and the QR library's licence, 2026-11-14

From the review of 2026-11-12 (finding 14, prompt P14).

- **`.github/dependabot.yml`:** weekly, for npm (at most 3 open pull
  requests, minor and patch updates in one group) and for github-actions.
  Each pull request runs every gate; merging one is a push to main.
  Written from memory of GitHub's format and parsed as YAML; GitHub's page
  was not read in this session. Insights, then Dependency graph, then
  Dependabot shows whether GitHub accepted it.
- **The licence of html5-qrcode 2.3.8 is Apache-2.0:** its `package.json` at
  https://unpkg.com/html5-qrcode@2.3.8/package.json says so, and its
  `LICENSE` there is byte for byte the one at the repository's tag `v2.3.8`
  (SHA-256 `306bc450...2338c612`), both read 2026-11-14. That text is now
  `vendor/LICENSE-html5-qrcode.txt`, served beside the library. The package
  ships no NOTICE file.
- **Not established:** the minified file bundles a copy of zxing-js.
  `@zxing/library` 0.19.1 on npm says MIT; which version is bundled was not
  found, so no second licence file was added. `vendor/README.md` says so.
- **Licences of what is installed for production** (from
  `package-lock.json`): 46 MIT, 15 Apache-2.0, 5 ISC, 1 BSD-3-Clause
  (`jpeg-js`), 1 0BSD (`tslib`), 1 MIT OR CC0-1.0 (`type-fest`), and 1 with
  no licence field, `callsite`.
- **For a person, on GitHub:** Settings, then Code security: switch on
  Dependabot alerts. Not confirmed either way.

### Docs that say what is true, and a README, 2026-11-14

From the review of 2026-11-12 (finding 15, prompt P15), and what the day's
other changes made untrue.

- `CLAUDE.md`: the wip file is called what it is, a stale draft of the old
  app bundle, with farnesene done; the bundle example no longer names a
  hash that has since changed; the golden-file command is the one that
  works; the functions list names the two purges and `accounts-test`; the
  deploy paragraph names `live-check`.
- `README.md`, new: what NOSE is, that the score is an unvalidated
  hypothesis, where to read next, the four commands, and a licence
  paragraph that grants nothing - "No licence has been chosen yet" - because
  none has. `_redirects` forces a 404 for `/README.md`, which the build
  guard asks for.
- **P1's last step, done 2026-11-14:** after the deploy of `530c466`,
  `https://nose-app.com/dry-run.txt` and `/CLAUDE.md` each answered 404.

### The review's decisions, as taken on 2026-11-14

The review of 2026-11-12 listed eight decisions for a person. The owner
asked for the recommended choice on each. What was done:

1. **The dispensary rail and a shopper's own purchases:** not changed. It
   changes the widget, which means a new pinned release, and B4 is not
   scheduled. Recommended when that release is cut: score a purchased batch
   against the rest of the palate, as `voteScore()` already does. Until
   then, B4's count of "Close match" cards includes the shopper's own
   purchases.
2. **A report from a lab the parser has not seen:** still accepted when its
   numbers reconcile; the pages were changed to say so ("Four sentences made
   true").
3. **A summed row with its isomers:** fixed in the parser on made-up reports
   ("A terpene printed as a total and as its isomers counts once", below),
   since the wrong reading is a believable fingerprint and the change moves
   no real fixture.
4. **"Your high" on the home page:** left. Both sentences refuse a claim.
   `CLAUDE.md`'s scope rule is about claiming or implying; a sentence that
   says NOSE will not predict it is the brand's own position.
5. **`dry-run.txt` in public history:** left. It names labs and strains, not
   people, and rewriting history needs a force push the ruleset blocks.
6. **Who can move `live`:** left. The hand-push fallback is still the
   documented way out when promote fails.
7. **Two dashboard checks**, done 2026-11-14. Dependabot alerts are on
   (the owner switched them on). Netlify builds Deploy Previews only for pull
   requests against `live`. `NOSE_DB_URL` and `NOSE_B2B_DB_URL` were already
   Production-only; `SUPABASE_SERVICE_KEY` and `FEEDBACK_READ_TOKEN` held the
   production value in Deploy Previews, Branch deploys and Preview Server &
   Agent Runners too, and are now Production-only. The live site was
   unaffected (`live-check clean` afterwards).
8. **Row-level security:** not enabled. The rule is written here instead:
   **no page talks to Supabase directly.** Every query runs in a Netlify
   function as `nose_writer` or `nose_b2b`. The day a browser-side Supabase
   client is wanted, row-level security comes first.

### A terpene printed as a total and as its isomers counts once, 2026-11-14

From the review of 2026-11-12 (finding 9, prompt P9; decision 3). §11 has the
bug. No real report with this layout has been seen: the change rests on
made-up reports, and it was made because the wrong reading is a believable
fingerprint, which is the one outcome the parser's rules rule out.

- **The probe, before the change** (`test/summed-rows-test.js` against the
  old parser, 10 of 14 checks failing), on a made-up 12-terpene report:

  | Rows printed | True value | Read as | Verdict |
  |---|---|---|---|
  | Nerolidol 0.030, cis- 0.012, trans- 0.018 | 0.030 | 0.060 | accepted |
  | alpha-Terpineol 0.035, Total Terpineol 0.035 | 0.035 | 0.070 | accepted |
  | cis-Ocimene 0.015, trans- 0.025, "Ocimene, Total" 0.040 | 0.040 | 0.080 | accepted |
  | Nerolidol 0.120, cis- 0.050, trans- 0.070 (5.4% of the total) | 0.120 | 0.240 | refused, coverage 105.4% |

- **No fixture prints both.** Of the 59 extracted texts, none names one
  terpene by a summed spelling and an isomer spelling. 37 print cis- and
  trans-Nerolidol, 3 print E- and Z-Nerolidol, 1 prints cis- and
  trans-b-Ocimene. Bare `FARNESENE` is in 33, bare `OCIMENE` in 30 and bare
  `TERPINEOL` in 12; those three are placed in neither set.
- **The change** (`parse-coa.js`): `SUMMED_SPELLINGS` (NEROLIDOL, TOTAL
  TERPINEOL, "OCIMENE, TOTAL", OCIMENES) and `ISOMER_SPELLINGS` (the cis-,
  trans-, E-, Z-, alpha- and beta- forms of nerolidol, terpineol, ocimene
  and farnesene). Each of the four readers - forward, multicolumn, backward,
  column-major - notes what each kind contributed to a key. When both fed
  one key: if they agree within `RECONCILE_TOLERANCE` of the summed row the
  key takes the summed row alone; otherwise the report is refused with "this
  report lists <key> both as a total and as separate rows, and the two
  disagree, so NOSE cannot tell which to use". The forward, multicolumn and
  column-major choosers leave such an isomer row out of the sums they
  compare with the lab's total. No constant changed. On a report with one
  kind only, nothing here does anything.
- **After:** the four rows of the table read 0.030, 0.035, 0.040 and 0.120,
  each accepted with no arithmetic warning.
- **Nothing moved on the corpus:** `56 accepted / 3 rejected`; `56 match / 0
  differ / 3 no-baseline / 0 threw`; `test/mutation-test.js` printed `262
  absorbed / 151 rejected / 35 SILENTLY CHANGED` before and after;
  `KAY-CAR-001 4.124 KAY-PRR-001 0.944`.
- **Not run:** `node scripts/reparse.js --dry-run`. It needs the archive's
  database address, which the Windows desktop does not hold. Run it in the
  Codespace before the real reparse. If any document changes, it is a real
  report with this layout, and it becomes the fixture this change lacked.
- **A limit worth knowing:** the 3% is of the summed row, so on small values
  a lab's own rounding can exceed it (0.012 + 0.019 against a printed 0.030
  is 3.3% apart) and the report is refused. That is the fail-closed side; a
  real report refused this way is the evidence for an allowance.
- New gate `summed rows`, after `coa dates`: 38 gates.

### Refusal sentences in plain words, 2026-11-14

From the review of 2026-11-12 (finding 11, prompt P11). The app prints
`rejectReasons` word for word after "That report could not be read
reliably." Only words changed: no rule, threshold or verdict.

| Reason | Until 2026-11-14 | Now |
|---|---|---|
| more than the total | coverage 141.1% exceeds the lab total — parse fault, not a lab finding | the terpene figures NOSE read add up to more than the total this report prints (141.1%), so the table was probably misread |
| one repeated value | 12 terpenes across only 1 distinct value — that is a limit column, not a measurement | every terpene read as the same figure, which is what a report's limits column looks like, not its results (or "one of only 2 different figures") |
| a value over 100% | pinene_a, myrcene above 100% — wrong column read | α-pinene, myrcene read above 100%, which is not possible, so the wrong column was read |
| a total over 100% | total of 500% is not a possible percentage — wrong column read | a total of 500% is not possible, so the wrong column was read |
| nothing above the limit | no modelled terpene measured above the limit of quantitation | none of the terpenes NOSE compares was found above the lab's reporting limit |
| no total | no total terpene figure printed, so coverage cannot be known | this report prints no total terpene figure NOSE can read, so NOSE cannot check its own reading |
| one or two terpenes | only 2 terpenes found on an inhalable product — implausible, so the panel was probably misread | only 2 terpenes were found, too few for this kind of product, so the panel was probably misread |

- **Names:** `PRINTED_NAME` in the parser gives each key the name a person
  reads (α-pinene for `pinene_a`); the over-100% sentence and P9's
  disagreement sentence use it. The parser does not load `js/match-math`.
- **Left as they were:** "the lab did not run a terpene panel on this
  sample", "lab reported a total of zero terpenes", "only X% of the lab's
  own terpene total was recovered — the table was not read completely", and
  every warning. One warning says "compounds NOSE does not model"; it was
  left because warnings are compared by parity and that sentence is on no
  fixture's baseline to check a rewording against.
- **`test/fixtures/coa-baseline.json` did not change.** The three rejected
  fixtures have no baseline, and the only text it holds is MCL-FLW-002's
  warning, which was not reworded. Parity: `56 match / 0 differ`.
- **Nothing matches on the old words.** `scripts/b2b-coverage.js` and
  `scripts/drift.js` print "no modelled terpene above zero", a sentence of
  their own for operators, not the parser's. `review-queue-test` uses an old
  sentence as stored sample data, which is what the archive holds.
- **Stored readings keep the old words** until they are read again: the
  archive's parses, and each dispensary batch reading. A reparse lists them
  as changed in `rejectReasons` only. `node scripts/reparse.js --dry-run`
  was not run here: it needs the database address the Windows desktop does
  not hold.
- New gate `refusal words`, after `summed rows`: 39 gates.

### The review's fixes, live, 2026-11-14

`main` was fast-forwarded to `d7e3021` (P2 to P15, P9 and P11). The run on
GitHub was green in all three jobs: gates, promote and, for the first time,
`live-check`. Promote moved `live` across this first change to the workflow
file since 2026-10-16 without the refusal Still open warns of. Checked on the
live site afterwards: `/README.md` answers 404; `/methodology/` shows the
labels table; the privacy page says an expired session's record is removed
within a day; `/app` has six `role="status"` regions.

- **One synthetic error report is stored**, sent 2026-11-14 by P7's last
  step: kind `init:deploy check`, message "synthetic - deploy check", ua
  `curl`. It answered 204. Ignore it when reading error reports; it is
  purged after 90 days with the rest.
- Still to check by a person: the first `sessions-purge` run in Netlify's
  function log, and the first Dependabot pull requests.

### The real reparse after the review's parser changes, 2026-11-14

Run in the Codespace once it had pulled `da2f083` (its first dry run used
`dbd1d8c`, the checkout from 2026-11-11, and showed nothing: check the
`parser` line before reading a dry run's counts).

- `node scripts/reparse.js --dry-run` with parser `da2f083`: 69 documents,
  66 unchanged, 3 "values changed", 0 either way between accepted and
  refused. The three - a TerpLife, a Green Scientific and a Method report -
  were refused before and after, with the same reader and total: "also
  changed: rejectReasons", the plain-words rewording alone. **No archived
  report prints a terpene both as a total and as its isomers.**
- The real run is recorded as run #24: parser `da2f083` checked 69
  documents through document #463.
- `node scripts/archive-health.js` first failed on the PDF store: the
  Codespace's `NETLIFY_AUTH_TOKEN`, a personal access token made 2026-09-23,
  had expired on 2026-10-23. A new one, "NOSE Codespace scripts", was made
  2026-11-14 with a 90-day expiry (so it ends about 2027-02-12) and put in
  the repository's Codespaces secret. Then: database ok, 69 documents, 69
  extractions, 267 parses, 13.0 MB of the free plan's 500 MB; 67 PDFs, 51.3
  MB; 2 documents with no PDF (#3 and #184, both first fetched 2026-09-23,
  before PDFs were kept). `archive-health: ok, 1 note(s)`.

### The handoff split into what is and what happened, 2026-11-14

M7 from `docs/project-notes/nose-m-cleanup-prompts-2026-10-15.md`.
`PARSER-HANDOFF.md` had grown to 8,978 lines; §13 and §14 were 7,970 of them,
mostly dated records, and every prompt asked a session to read them first.

- **`PARSER-HANDOFF.md`** (2,004 lines) keeps §0-§12, §13's opening and its
  14 reference subsections ("What exists" to "Keeping the free project
  awake", and "After a deploy — check it"), §14's opening, a §14 "What
  exists" compiled from the file list each record opens with, and for each
  of §13 and §14 an index of its records by title and date, linking each.
- **`docs/handoff/13-records.md`** holds §13's 50 dated records and
  **`14-records.md`** §14's 11, whole and unchanged, in date order. A new
  record goes at the end of its file.
- **`docs/handoff/open.md`** holds §13's Still open, §14's Still open and
  §14's Later, unchanged.
- §3 says to read this file and `open.md` first, and a record only when it
  is named; §5 says where a change is recorded. `CLAUDE.md` says the same.
- **The check**, a scratch script not committed: of the old file's 8,324
  non-blank lines, every one appears in the new files at least as often,
  except four headings (`### Still open` twice, `### Later`, which became
  `open.md`'s headings) and the two-line sentence in §14's opening saying
  where records went, rewritten. Added: 61 index lines, 9 headings, the
  §14 "What exists" lists (copies of lines in the records), and four
  sentences explaining the layout.
- **Nothing else moved.** Only `test/fixture-lint.js` reads the file, for
  figures in §2 and §9, which did not move (`corpus clean`). No code
  comment, test or script changed: the 117 files that cite the handoff do
  so by section and record title, and the index carries a title to its
  file. `/docs/*` is already a forced 404 on the site.

### Rate limits at Netlify's edge, 2026-11-14

M4 from `docs/project-notes/nose-m-cleanup-prompts-2026-10-15.md`; security
audit item 1, in part.

- **The plan:** the team is on Netlify's Personal plan (Usage & billing,
  read 2026-11-14), which allows **two** rate-limit rules per project.
  Netlify, "Rate limiting"
  (https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/,
  last updated 2026-09-17, read 2026-11-14): "2 per project" on Free,
  Starter and Personal, 5 on Pro; a limited request is blocked "returns
  HTTP status `429`"; `windowSize` "Maximum is 180"; "rate limits for
  functions cannot be defined in the `netlify.toml` configuration file".
- **The two rules**, each `aggregateBy: ['ip', 'domain']` over 60 seconds,
  as each function's `config.rateLimit`:
  - `coa`: 12 a minute. A slow server could make each call run about eight
    seconds.
  - `match-feedback`: 30 a minute.
  Nothing else in either function changed.
- **Cost of a blocked request:** "How credits work" (last updated
  2026-08-12, read 2026-11-14) prices web requests at "2 credits per 10,000
  requests" and does not say whether a blocked one counts. At most it costs
  a web request, where an unblocked `coa` call costs compute.
- **The app:** a 429 from `coa` now says "Too many reports read from this
  connection in the last minute. Wait a minute, then try again." It said
  "Could not reach the report reader", because Netlify's 429 body is not
  JSON. The vote and error beacons ignore the reply, as before. The account
  page is unchanged: no account function has an edge rule on this plan, and
  `auth.js`'s own `tooMany()` is already JSON.
- **Privacy page**, in the Netlify paragraph: "To slow down floods, Netlify
  also counts the recent requests from each IP address to two of our server
  functions, the lab-report reader and the match feedback, a minute at a
  time, and turns away any over the limit. We never receive those counts."
  No "What changed" entry: NOSE collects nothing new. The dispensary
  section's logs paragraph is unchanged, since no dispensary function is
  limited.
- **Tests:** `archive-wiring-test` and `b2b-coverage-test` pin `coa.js`'s exports to the handler and
  its config, and the rule; `match-feedback-test` pins its rule and that
  exactly two functions carry one; `input-paths-test` checks the 429
  sentence. Same gate lines. The privacy scan of `match-feedback.js` skips
  the config block, which names `'ip'` as what Netlify counts by.
- Bundle: `js/nose.81127089.js` became `js/nose.3c9d05e1.js`.
- **Not yet checked live:** 15 quick POSTs to `coa` answer 400, then 429
  from about the 13th, then 400 again after a minute.

### Security audit items 3, 4, 6, 7, 14, 15 and 16, 2026-11-14

From `docs/project-notes/nose-security-audit-2026-10-15.md` (kept off GitHub).
Items 1 (in part, "Rate limits at Netlify's edge"), 5, 11, 12 and 17 were
closed earlier. Still open: 2 (M5), 8, 9, 10 and 13.

- **3, paid status.** `auth-me` reads `subscription` from `app_metadata`,
  which only the service key can write. It read `user_metadata`, which
  Supabase lets a signed-in user change with their own token. `auth-signup`
  no longer writes `subscription: 'free'` into `user_metadata`; absent means
  free. Nothing is gated yet, so nobody's reply changes. When billing comes,
  the paid flag goes into `app_metadata` by the service key.
- **4, login CSRF.** `fromThisSite()` in `auth.js`: a request must declare
  `application/json`, which no plain HTML form can send, and its browser's
  `Sec-Fetch-Site` must say `same-origin`, or, with no `Sec-Fetch-Site`, its
  `Origin` must be this request's own. `auth-login`, `auth-signup`,
  `auth-logout`, `auth-reset`, `account-delete` and `palate-sync`'s PUT ask
  first and answer `403 {"error":"cross-site"}`. `palate-sync`'s DELETE has
  no body, so it skips only the JSON check. GETs are unguarded: they change
  nothing, and another site cannot read their reply. The account page and
  the app already send JSON from the same origin.
- **6, private addresses.** `fetch-report.js` checks an address written as
  the host against a `net.BlockList` of the special-purpose ranges, IPv4 and
  IPv6, and checks an IPv4 address carried in IPv6 (`::ffff:`, NAT64
  `64:ff9b::`) as the IPv4 address it names. The seven forms the audit found
  passing are refused. **Not closed:** a public name that resolves to a
  private address. That needs the connection pinned to a checked address
  (`docs/handoff/open.md`).
- **7, memory.** The fetcher reads the body with a running count and cancels
  past 12 MB; a body with no Content-Length was read whole first.
- **14, throttle records.** `purgeExpiredThrottles()` deletes each record
  past its window (15 minutes for login, an hour for sign-up and reset) and
  each unreadable one; `sessions-purge` runs it daily and logs both counts.
  `account-delete` deletes the address's three records after the identity,
  naming `throttle` in a `partial` reply if it cannot. **Not done:** keying
  the hash with a secret (HMAC), which needs a new secret in Netlify.
- **The privacy page**, "What an account stores", gains: "To slow down
  password guessing, a count of recent attempts for each email address that
  tries to sign in, sign up or reset a password, whether or not it has an
  account. It is kept under a fingerprint of the address (a SHA-256 hash)
  rather than the address itself; anyone who already knows an address could
  compute the same fingerprint. An earlier version of this page did not
  mention these counts." "How long we keep things" gains: "Sign-in attempt
  counts: each covers fifteen minutes or an hour, and is removed within a
  day after that. Deleting your account deletes your address's counts at
  once." Nothing new is collected, so no "What changed" entry.
- **15, HSTS.** Netlify already sent `Strict-Transport-Security:
  max-age=31536000` (checked live 2026-11-14). `_headers` now says so too,
  so it does not rest on Netlify's default. No `preload`.
- **16, the build guard** refuses a JWT whose payload says
  `"role":"service_role"`, the legacy form of the Supabase service key, in a
  published file or anywhere in git. The public anon key, a JWT with
  `"role":"anon"`, passes.
- **Tests.** `accounts-test`: five cross-site forms refused by all six
  functions before Supabase is asked, an `Origin` from this site accepted,
  `user_metadata` "active" not believed, throttle records purged by window
  and deleted with the account. `b2b-store-test`: the JWT rule.
  `fetch-guard-test`, a new gate after `resolver` (40 gates): 27 private
  forms refused and 8 public passed, the stream cancelled past the cap. It
  failed on the old fetcher on both counts.

### Rate limits need a path: coa and match-feedback move to /api/, 2026-11-14

The same day as "Rate limits at Netlify's edge", and correcting it. After
that deploy, 21 quick POSTs to `/.netlify/functions/coa` all answered 400;
none was limited.

- **Why:** Netlify, "Rate limiting" (read again 2026-11-14): "Limits for
  Netlify functions and edge functions are defined in the exported `config`
  object of your function file. You must also have a `path` for the function
  defined in this object." Netlify, "Functions configuration" (last updated
  2026-09-17, read 2026-11-14): "When you set a custom `path`, the function
  is only available at that path — not at the default
  `/.netlify/functions/<name>` URL." M4's prompt said "No path change"; that
  could not work. A rule that does not apply fails no deploy, so nothing
  said so but the live test.
- **The move:** `coa` is at `/api/coa` and `match-feedback` at
  `/api/match-feedback`, each set as `config.path` beside its rule. The old
  addresses answer 404 from this deploy on. The app (`js/nose`) calls the
  new ones; a tab opened before the deploy and not reloaded calls the old
  ones until it is.
- `scripts/live-check.sh` asks `/api/coa`; the tests that route, pin or
  count the two addresses use the new ones. `/api/` is not a folder in the
  tree, so the build guard has nothing to add.
- Bundle: `js/nose.3c9d05e1.js` became `js/nose.35f66604.js`.
- **Checked live, 2026-11-14:** 20 POSTs to `/api/coa` a third of a second apart answered 400 fourteen times, then 429; five more after 12 seconds, 429; 70 seconds later, 400 again. The old `/.netlify/functions/coa` answers 404. (Netlify: blocking can start "up to 10 seconds" after the threshold.)

### The app's alias table, and coerce(), 2026-11-14

The readiness audit's code findings 7 and 8 (2026-10-26), and the review's
note that the app drops spellings the parser accepts. Scores change on
purpose, for made-up inputs only.

- **The folds are gone.** `TERP_ALIAS` folded `caryophyllene-oxide` into
  caryophyllene, `linalool-oxide` into linalool and a bare `pinene` into
  alpha-pinene, against §4's rule that names match exactly. Each is now
  dropped, as any compound outside the 15 is.
- **Every parser spelling reaches the app.** Eighteen of the 48 spellings in
  the parser's `ANALYTE_MAP` were dropped by `sanitizeTerps()` -
  `E-Caryophyllene`, `Fenchyl Alcohol`, `Ocimene, Total` and fifteen
  more. Each is now in `TERP_ALIAS`. The parser never sends the app a
  spelling, only its keys, so this reaches only a hand-made Import file.
- **`coerce()` reads a plain number** - digits, an optional decimal point,
  an optional exponent, an optional trailing % - and anything else as 0. It
  stripped every non-digit first, so "0,45" read 45 and "1.5e-2" read 1.52;
  "1,234.5" read 1234.5 and now reads 0.
- **The golden file**, regenerated with `node test/match-golden-make.js --why
  "..."`, the first regeneration since 2026-09-23. Compared with the old one:
  `about` and `source` say why; one edge profile ("aliases the app folds")
  changed in `normalized`, `totals`, `sanitized`, `edgeScores` and one
  band; one `coerce` case ("1,234.5"). **No pair, self-score or palate
  changed:** no real report, and no demo jar, scores differently.
- `match-props-test` states it: every `ANALYTE_MAP` spelling reaches its
  key, the three folds are dropped, and 14 `coerce()` cases. Its header no
  longer says it leaves these out.
- Bundle: `js/match-math.cd934bdd.js` became `js/match-math.65bb9941.js`. A pinned widget
  release keeps its own copy and does not change.
- **Not done here:** `wip/nose-farnesene-wip.js`, the stale draft that
  removed these folds, is deleted once "WebKit and Firefox in the tests"
  reaches main, since both change `b2b-widget-test`.

### Votes and error reports keep the day, not the time, 2026-11-14

M5 from `docs/project-notes/nose-m-cleanup-prompts-2026-10-15.md`; security
audit item 2. Follows "Every vote stored" (2026-10-13) and "Smell words on a
vote" (2026-10-14), which kept the time.

- **Before:** a vote kept `ts` (the server's time to the millisecond) and
  `clientTs` (the device's), under `votes/<band>/<vote>/<day>/<HHMMSSmmm>-<6
  random characters>`; an error report the same, under
  `errors/<day>/<ctx>/<HHMMSSmmm>-...`, beside the browser string and the
  page. Netlify's request logs hold each request's address and time, so a
  stored time could be lined up with an address. The privacy page said
  nothing in a vote "can be traced back to you".
- **The privacy page, changed first in the same commit:** a vote and an
  error report send "the day (not the time)"; a new paragraph says a vote is
  filed under its day and a random code, never a time, that on a day with
  very few votes one could still be matched with its request in the host's
  logs, and that the file storage may note when each was saved and NOSE
  never reads that time - as the dispensary section says of its votes; the
  "traced back" sentence now says "Nothing in a vote names you or links it to
  your account" and that an earlier version claimed more; an error report is
  filed the same way; "What changed" gains an eighth change, dated November
  14, 2026 (it does not compare them with dispensary votes: the compliance kit
  counts every paragraph of the page that names dispensaries), saying older records are rewritten by a one-off script "and we
  say so here once it has run".
- **`beacon.js`:** `keySuffix()` is 16 random bytes as hex, with no time;
  `utcDay()` gives the UTC day; `safeClientTs()` is gone.
- **`match-feedback.js`:** the value keeps `day`, not `ts` or `clientTs`, and
  is v 3; the key is `votes/<band>/<vote>/<day>/<32 hex>`. `ctx` is
  unchanged. The page still sends its own `ts`, and it is ignored.
- **`client-error.js`:** the same; the value is v 2; the key
  `errors/<day>/<ctx>/<32 hex>`. `errors-purge.js` is unchanged and still
  deletes by the day in the key.
- **`feedback-read.js`** reads v1, v2 (with `ts`) and v3 (with `day`). The
  CSV's first column is `day` (for an older record, the first ten
  characters of its `ts`), and `clientTs` is gone. The caveat adds that
  votes have no order within a day. The two synthetic records are named by
  day.
- **`scripts/blobs-to-days.js`**, from the Codespace with `NETLIFY_SITE_ID`
  and `NETLIFY_AUTH_TOKEN`: a dry run by default; with `--yes` each record
  still keeping a time is written under its new key without it, read back
  and compared, and only then is the old key deleted. A run that stops part
  way is finished by a second, which deletes an old key whose copy is
  already there rather than copying it again. It prints counts only.
- **Tests:** `match-feedback-test` (the new key and value, no time anywhere,
  v1, v2 and v3 read, the CSV's columns); `client-error-test` (the report's
  key and value, `errors-purge` by day on old and new keys, and the script
  against stand-in stores: a dry run, `--yes` stopped part way and finished
  by a second run, then 0 to rewrite, counts only). Writing that test found
  two faults in the script before it ran anywhere: the error report's day
  went where its ctx belongs, and a stopped run would have copied a record
  twice.
- **Done 2026-11-15:** the script ran on the real stores ("The stored votes
  and error reports rewritten without a time").

### WebKit and Firefox in the tests, 2026-11-14

B5 from `docs/project-notes/nose-blocker-prompts-FULL-2026-10-27.md`. Until
now `b2b-widget-test` and `input-paths-test` launched Chromium alone, and
the workflow installed Chromium alone.

- **Each runs its browser cases in Chromium, WebKit and Firefox in turn,**
  through one loop. A failure names its engine; the gate's line prints only
  when every engine passes; a closing check says which engines ran.
  `NOSE_ENGINES=firefox` (say) runs fewer, by hand.
- **WebKit runs on Linux only** (GitHub's runner, the Codespace). On the
  Windows desktop Playwright's WebKit build sent a SameSite=Lax cookie on
  requests made with `credentials: 'omit'` and on a `crossorigin`
  release, skipped links on Tab, and drew `<select>` menus with inline
  styles. Those are faults of that build, not of NOSE: Linux WebKit passed
  the same cookie checks. On Windows both tests say so and run two engines.
- **Camera cases:** only Chromium can play a file as a fake camera, so in
  Firefox and WebKit the two camera cases take the same steps with "Choose QR
  image", and each run says so.
- **What each engine needed of the tests** (none a change to the widget):
  Firefox makes the rail's scrolling list a Tab stop of its own, before its
  links, so the keyboard checks step past it. WebKit draws a `<select>`
  with inline styles and reports them as style-src-attr violations: on the
  demo page those (a SELECT, that directive, in WebKit) are left out, and
  anything else still counts. Playwright hands a route WebKit's sendBeacon
  request with an empty body, so a test-only recorder keeps each beacon's
  text and a route that finds no body reads it there; the page still sends
  by sendBeacon.
- **One real fault, in the app, found by Firefox:** opening Scan QR starts
  the camera; choosing a QR image while that start was still pending or
  failing let the camera's late "The rear camera could not be started"
  replace the newer "<lab> read" message over the card. It failed three of
  four Firefox runs. `js/nose` now numbers each scan attempt, and a camera
  start that finishes after a newer attempt says nothing (and stops itself
  if it did start). Then four of four passed.
- **CI:** `gates.yml` and `gates.sh`'s header install `chromium webkit
  firefox` with `--with-deps`. GitHub's run on branch `b5-engines`
  (run 28): the install took 45 s and `gates.sh` 5 min 16 s, within the
  job's 30 minutes. The first two runs there failed and showed what the
  bullets above fix; a temporary step printed their failing checks and was
  removed before merging.
- A cold Firefox or WebKit can take longer than 8 s over its first page (one
  widget run in four timed out there), so their waits are 15 s; Chromium's stay 8.
- The compliance kit stays on Chromium: it is a record of the screens.
- **`wip/nose-farnesene-wip.js` is deleted**, as "The app's alias table,
  and coerce()" said it would be once this reached main. `match-test` and
  `b2b-widget-test` now expect no stale copy at all; `/wip/` stays a
  forced 404.
- Bundle: `js/nose` became `js/nose.0f989888.js`.
- **Not done:** a five-minute check on a real iPhone in Safari - /app (a
  sample match, the COA link tab, the camera prompt) and /b2b/demo/ (the
  consent button, the cards, removing and putting back a purchase, a vote).

### One header and one footer, 2026-11-14

M6 from `docs/project-notes/nose-m-cleanup-prompts-2026-10-15.md`.

- **Before:** the header and footer were copied by hand into 23 pages. Three
  header forms: 19 static pages, `/aromas/` without the brand link's label
  or the bars' `aria-hidden`, and the home page and `/app` with a mobile
  menu and Account after Start matching. Seven footer forms: typography
  varying (' and ’, `&middot;` and ·); `/account/` listing Account twice;
  the home page and `/app` making the tagline an `h2` with `route-link`
  classes nothing reads; `/aromas/` and its six family pages with a short
  footer, no Privacy or Terms link. The family pages marked "Aroma families"
  `aria-current="page"` though they sit below it; `/account/` marked none.
- **`partials/`**: `header.html` (static), `header-app.html` (the home page
  and `/app`, with the mobile menu `js/nose` drives) and `footer.html` (the
  full footer, Privacy and Terms, the tagline as a paragraph, ’ and ·, no
  `route-link`). One nav order everywhere, the mobile menu included: Aroma
  families, Learn, Methodology, About, Account, Start matching.
- **`scripts/stamp-chrome.js`**, run by `build.sh` before the fingerprints:
  each page carries `<!-- nose:header static|app -->` ...
  `<!-- /nose:header -->` and `<!-- nose:footer -->` ...
  `<!-- /nose:footer -->`, and what is between them becomes the partial. On
  the static header it sets `aria-current`: "page" on the page's own link,
  "true" on its section's (Learn on a guide, Aroma families on a family
  page). A marker missing, doubled or unclosed fails the build. `b2b/demo`
  has its own head and none. The stamped pages are committed.
- `_redirects` forces a 404 for `/partials/*`; the build guard requires it.
- **`test/page-chrome-test.js`**, a new gate after the build (41 gates): both
  markers once on every page but the demo, exactly the partial between them,
  `aria-current` right for each address, Privacy and Terms in every footer,
  one nav order, and, in a scratch tree, a missing, doubled or unclosed
  marker refused and a page edited between its markers caught by `--check`.
- **Seen in Chromium** at 390 and 1280 px: the home page, `/aromas/earthy/`
  and `/account/` with the new footer and header. The home page's tagline,
  an `h2` until now, is the smaller paragraph the other 15 footers already
  used; no stylesheet rule was added. No "before" pictures were taken.
- No `js/` or `css/` file changed. `js/nose` still finds `menuButton` and
  `mobileMenu` and sets `aria-current` on the app header by path.

### The stored votes and error reports rewritten without a time, 2026-11-15

The last step of "Votes and error reports keep the day, not the time". Run in
the Codespace once `8e1533f` was live:

- `node scripts/blobs-to-days.js`: votes 5 scanned, 5 still keeping a time;
  error reports 1 scanned, 1.
- `node scripts/blobs-to-days.js --yes`: 5 votes and 1 error report rewritten
  without a time, 0 failed.
- The dry run again: 0 to rewrite in each store.

The privacy page's eighth change now says so: "Those kept before then were
rewritten the same way on November 15, 2026, so no stored vote or error
report holds a time of day." It said the script would run "and we say so here
once it has run".

The two synthetic votes `feedback-read.js` names (2026-10-14) are among the
five, and keep their day and notes; filter them by those.

### A password reset that finishes, 2026-11-14

Security audit item 13; the open items "No page finishes a password reset"
and "Supabase's session is left in the address". The owner chose to build
the page (2026-11-15).

- **`/account/reset/`**, a new page (noindex, no referrer, the account
  page's stylesheet and script). The reset email's link carries
  `?token_hash=...&type=recovery`. `js/account` reads the code once and
  takes it out of the address at once; it asks for the new password and
  sends the code only when the button is pressed, so an email scanner that
  opens the link first does not use it up. Opened without a code, it says
  the reset email's link is needed.
- **`netlify/functions/auth-reset-finish.js`**: refuses a cross-site request
  and a password under 10 characters before anything else; Supabase checks
  the code (`POST /verify`, type recovery); with the session that answer
  carries the password is set (`PUT /user`); that session is ended (`POST
  /logout?scope=global`) and every NOSE session of the account destroyed.
  A used, expired or made-up code gets one sentence: "This reset link has
  expired or was already used. Ask for a new one on the account page." It
  keeps nothing and logs no address, password or code.
- **Terms:** "If you think someone else has access, reset your password from
  the account page, which signs every device out, and email us." It said
  changing a password was not available yet.
- **Tests:** `accounts-test` (a stand-in Supabase that knows `/verify`, `PUT
  /user` and `/logout`): short password refused first, unknown, malformed and
  reused codes refused, cross-site refused without using the code, the three
  calls in order, the new password signing in and the old not, both earlier
  NOSE sessions gone, nothing logged. `input-paths-test`: the code leaves the
  address at once, nothing is sent before the button, the button sends code
  and password once, the page without a code shows no form. `page-chrome`:
  24 pages.
- **Not done, and needed before it works:** Supabase's "Reset password"
  email template still sends people to the Site URL with tokens after `#`.
  It has to link to
  `https://nose-app.com/account/reset/?token_hash={{ .TokenHash }}&type=recovery`
  (Supabase → Authentication → Emails → Reset password). Until then the page
  is built but no email leads to it. Also not known: whether custom SMTP is
  on (`docs/handoff/open.md`).

### The reset page works with Supabase's default email, 2026-11-15

Follows "A password reset that finishes". The plan was to point Supabase's
"Reset password" template at `/account/reset/?token_hash=...`. In the
dashboard on 2026-11-15 (accounts project, Authentication → Emails), the
templates cannot be edited: "Set up custom SMTP to edit templates. Emails
will be sent using the default templates."

- **Two Supabase projects, read in the dashboard 2026-11-15:** the accounts
  are in "hdzrpy68f4-droid's Project" (Canada Central, ca-central-1; its Site
  URL is `https://curious-crumble-352160.netlify.app/`, and it has no
  redirect URLs); the archive and the dispensary tables are in "nose" (East
  US, us-east-1, as the privacy page says). Both are on the free plan, in one
  organization, "NOSE".
- **The default email works too.** `auth-reset.js` now asks Supabase to send
  the link back to `https://nose-app.com/account/reset/`
  (`/recover?redirect_to=...`). Supabase checks the link and lands on the
  page with a recovery session after `#`. The page takes it out of the
  address at once and sends only the access token with the new password;
  `auth-reset-finish.js` sets the password with it (no `/verify`), ends that
  session and signs every NOSE session of the account out. A session
  Supabase does not know gets the same "expired or already used" sentence.
  The `token_hash` path stays, for a custom template later.
- Supabase only sends a link back to an address on the project's Redirect
  URLs list; until it is there, it falls back to the Site URL, as before.
- **Tests:** `accounts-test` checks the reset request names the page, and the
  session path end to end (password set with no `/verify`, the old NOSE
  session gone, an unknown or malformed session refused);
  `input-paths-test` checks the page reads the `#` session, clears the
  address and sends the access token, never the refresh token.
- **The limit that matters most:** without custom SMTP, Supabase's built-in
  sender delivers only to the project's team members, about two emails an
  hour (`docs/handoff/open.md`). So no one but the owner gets a sign-up
  confirmation or a reset email today, and the reset page cannot help anyone
  else until an email service is set up.

### Backups on the privacy page, before any exist, 2026-11-15

B6 from `docs/project-notes/nose-blocker-prompts-FULL-2026-10-27.md`, its
first half. The owner confirmed (2026-11-15) Supabase Pro for the
organization and Netlify Pro, about $55 a month before usage: Supabase Pro
"from $25/month" with "$10/month in compute credits" covering one project on
Micro (the second project, the accounts, adds its own compute), and Netlify
Pro "$20/month" with 3,000 credits (both pricing pages read 2026-11-15).

- **What the docs say** (read 2026-11-15): Supabase backups - "We
  automatically back up all Pro, Team, and Enterprise Plan projects on a
  daily basis", "Pro Plan projects can access the last 7 days of daily
  backups"; free projects get none; restoring an earlier backup loses what
  came after it. Supabase pricing: "Projects on paid plans are not paused
  for inactivity"; "Spend caps are on by default on the Pro Plan". Netlify
  Blobs (last updated 2026-10-16): no backup, version or recovery of a
  deleted blob is described.
- **The privacy page**, before the plan changes:
  - "How long we keep things" gains "Backups": the databases are kept by
    Supabase, which on the paid plan backs each up daily and keeps each
    backup seven days, so a deleted record can remain in those backups for
    up to seven days; a backup would only be restored to recover from a
    failure, restoring one would bring back what was deleted after it, and
    any restore will be said on the page with the backup's date; Netlify's
    file storage (synced palates, sessions, votes, error reports, PDFs) has
    no backup described in Netlify's documentation, "we have not had that
    confirmed by Netlify".
  - Beside each deletion - the account, a removed lab report, a dispensary
    leaving - one sentence on the seven days in Supabase's backups, and that
    the file-storage part has no backup Netlify describes.
  - "What changed" gains a ninth change, dated November 15, 2026.
- **Not promised:** that a restore would delete again what was deleted after
  the backup. Nothing records a deleted account's identity to do that with,
  so the page promises only to say so if a backup is ever restored.
- **The two Supabase projects:** accounts in "hdzrpy68f4-droid's Project"
  (Canada Central) and the archive and dispensary tables in "nose" (East US).
  On 2026-11-15 the owner set the accounts project's Site URL to
  `https://nose-app.com` and added `https://nose-app.com/account/reset/` to
  its Redirect URLs, as "The reset page works with Supabase's default email"
  needs. The owner confirmed mail to contact@nose-app.com arrives.
- **Next, once this page is live:** the owner's clicks - Supabase Pro with its
  spend cap on, daily backups shown for both projects; Netlify Pro and a
  usage notification; then the three more rate-limit rules Pro allows.

### Account emails through Resend: the privacy page first, 2026-11-15

The owner asked for a recommendation; Resend was chosen. Read 2026-11-15:
Supabase's custom SMTP guide - without it, "Supabase Auth will refuse to
deliver messages to addresses that are not part of the project's team", "2
messages per hour"; with it, mail goes to anyone, "a low rate-limit of 30
messages per hour", adjustable; Resend is among the providers it names.
Resend's pricing: free, "3,000" a month, "100 emails per day", "3 domains";
"Open and click tracking is a per-domain setting available on every plan".
Postmark's free plan is "100 emails/month".

- **The privacy page**, before anything is switched on: under "Who else
  receives your data", account emails "are to be sent for us by Resend";
  "Not switched on yet: until it is, Supabase sends them itself, and only to
  people on our own team"; once on, Resend receives the address and the
  message, link included, and keeps delivery records under its own policy;
  open and click tracking switched off. "What changed" gains a tenth change,
  "not switched on yet".
- **Still to do:** the owner makes a Resend account, adds its DNS records for
  nose-app.com, turns tracking off, and enters its SMTP settings in the
  accounts project (Authentication → Emails → SMTP Settings). Then the page
  gives the day, and a real address gets a reset email end to end.

### Five rate limits on Netlify Pro, and keep-awake removed, 2026-11-15

B6's second half. The owner moved the Netlify team to Pro and the Supabase
organization to Pro on 2026-11-15 (both projects).

- **Three more rate limits**, per IP address over 60 seconds, each with a
  path of its own as Netlify requires: `auth-login` 10 a minute at
  `/api/auth-login`, `auth-signup` 10 at `/api/auth-signup`, `client-error`
  15 at `/api/client-error`. With `coa` 12 and `match-feedback` 30, that is
  Pro's five.
- **Not `b2b-vote`**, M4's planned third: pinned releases 1 and 2 call it at
  `/.netlify/functions/b2b-vote` and never change, and a rule needs a path,
  which would move it away from them. Its per-store daily cap stays (open).
- `js/account` posts sign-in and sign-up to the new addresses; `js/nose`
  sends error reports to `/api/client-error`. A page opened before the
  deploy and not reloaded calls the old addresses until it is.
- **Privacy page:** Netlify counts requests to "five of our server functions
  - the lab-report reader, match feedback, error reports, sign-in and
  sign-up". Nothing new is collected.
- **`keep-awake.js` removed:** paid projects "are not paused for inactivity"
  (Supabase pricing, read 2026-11-15). `store.touch()` stays, with its
  tests. `archive-wiring-test` checks the function is gone.
- `match-feedback-test` pins the five functions, their addresses and numbers.
- **Not done:** a Netlify usage notification. Its place in the dashboard was
  not confirmed in Netlify's docs; the owner sets it.

### Backups were already there, 2026-11-15

Checked in the Supabase dashboard (Database → Backups) after the upgrade:
the accounts project lists daily physical backups from 12 November, and
"nose" from 9 November - seven days, before the move to Pro. The ninth
change had said "Until that plan is in place, Supabase keeps no backups of
them": wrong. It now says Supabase was already keeping seven days of daily
backups before the paid plan, that the page should have said so earlier,
and that a first version of the note was wrong. "Backups" under "How long
we keep things" drops "on the paid plan we use". Organization "NOSE" shows
"Pro Plan · 2 projects"; "nose" shows nano compute.

Netlify, read the same day: team on Pro (3,000 credits a month, expiring
December 15), auto recharge disabled - nothing is bought past the monthly
credits without the owner - and no separate usage alert setting found on
Usage & billing. A production deploy costs 15 credits: about 200 a month.

### Account emails switched on through Resend, 2026-11-15

- **Resend:** domain nose-app.com, region North Virginia (us-east-1), click
  and open tracking off (the defaults, left unticked). DNS records added by
  hand in Cloudflare (not Resend's "Auto configure", which would have been
  given access to the Cloudflare account): CNAME `send` →
  `send.forge.rmta.net` and `rsend` → `rsend.forge.rmta.net` (DNS only), TXT
  `resend._domainkey` (Resend's public DKIM key), TXT `_dmarc`
  `v=DMARC1; p=none;`. None of the four names existed before; the root
  MX/SPF for Cloudflare Email Routing (contact@) is unchanged. Resend:
  "Domain verified".
- **Supabase**, accounts project, Authentication → Emails → SMTP Settings:
  custom SMTP on - sender `no-reply@nose-app.com`, name `NOSE`, host
  `smtp.resend.com`, port 465, username `resend`, the password a Resend
  sending-access key the owner made and pasted (never seen here). Supabase
  now caps auth email at 30 an hour (Authentication → Rate Limits).
- **Privacy page:** the Resend paragraph now says "Since November 15,
  2026", from no-reply@nose-app.com; the tenth change loses "not switched on
  yet".

### Reset tested on the live site, 2026-11-15

The owner asked for a password reset for their own account on
nose-app.com/account/: the email arrived (from NOSE <no-reply@nose-app.com>,
through Resend), and its link loaded `/account/reset/`, where the new
password was set. `open.md` loses "No page finishes a password reset" and
both custom-SMTP items; "Supabase's session is left in the address" narrows
to sign-up confirmations, which still land on the Site URL with tokens after
`#`.

### A confirmation page, 2026-11-15

A sign-up confirmation link passed through Supabase and landed on the Site
URL with Supabase's `access_token` and `refresh_token` after `#`, which
nothing read or cleared, so they stayed in the browser's history.

- `auth-signup` asks Supabase for `/signup?redirect_to=https://nose-app.com/account/confirmed/`.
  The address must be in the accounts project's Redirect URLs; until it is,
  Supabase falls back to the Site URL, as before.
- **`/account/confirmed/`** (new, noindex, no-referrer): `initConfirmed()`
  in `js/account` reads the address once and takes it out at once with
  `history.replaceState`. It says "Your email address is confirmed" for
  `type=signup` with an `access_token`; that the link "has expired or was
  already used" for an `error` or `error_code`; otherwise that it needs the
  email's link. Nothing from the address is kept or sent: NOSE signs people
  in with its own sessions, so Supabase's session has no use here.
- Tests: `accounts-test` pins the signup call's `redirect_to`;
  `input-paths-test` opens the page from a confirmation, an expired link and
  no link, and checks the address is cleared and no request is made
  (Chromium and Firefox here; WebKit on CI); `page-chrome-test` counts 26
  pages.
- `open.md` loses "A sign-up confirmation still leaves Supabase's session in
  the address".

### After the review: notes-only pushes do not deploy, 2026-11-16

The owner asked for a review of the B4-B6 work, then for what could be done
from it.

- **A push that changes only notes and tests leaves `live` where it is.**
  `promote` compares everything `live` does not have yet with the commit; if
  every file is under `docs/` or `test/`, or is a `.md` at the top, it moves
  nothing and Netlify builds nothing. None of those is on the site: `/README.md`,
  `/CLAUDE.md`, `/PARSER-HANDOFF.md`, `/test/match-test.js` and
  `/docs/B2B-RELEASES.md` each answered 404 on 2026-11-16. Why: a production
  deploy costs 15 of Pro's 3,000 monthly credits, and November had 48
  commits. `live-check` runs only when `promote` moved `live` (its output
  `moved`), since otherwise the site rightly serves an older commit. The next
  push that changes anything else carries the notes along. **Not yet seen on
  GitHub when this was written**: the first notes-only push after this one is
  its proof - promote's log says "only notes and tests differ from live".
- **The confirmation page reads a failed link's error after "?" as well as
  after "#".** Supabase's redirect writes it after "#"; some versions write
  it in both places. `input-paths-test` has a fourth check for the page.
- **`store.touch()` is removed**, with its test: keep-awake was its only
  caller. `archive-wiring-test` checks it is gone.
- **Not done, and why: edge rate limits for `auth-reset` and
  `auth-reset-finish`.** The review suggested them; Pro allows five rules
  and all five are in use ("Five rate limits on Netlify Pro"). The per-email
  throttle stays (3 an hour for a reset). Giving one a rule means taking it
  from `client-error`, or serving two functions from one path - its own
  prompt.
- Three notes corrected the same day (commit 499b6f6): the after-deploy list
  no longer runs keep-awake, and two open items say what is true now.

### A sign-up tested on the live site, 2026-11-16

The owner signed up at nose-app.com/account/ with a second address of their
own. The confirmation email arrived through Resend, **in the junk folder**;
its link landed on `/account/confirmed/`, which said the address was
confirmed and left nothing after the path; signing in with the new address
and password worked. That is the first real proof of the sign-up email and
the confirmation page ("A confirmation page").

Junk is open (open.md): the sending domain is a day old, and the email's one
link points at Supabase's domain, not nose-app.com.

### Email links that come to NOSE, 2026-11-16

After the first real sign-up's email went to junk, the owner asked for the
emails' links to point at nose-app.com (commit 6839021).

- **Templates, accounts project (Authentication → Emails → Templates), saved
  2026-11-16 and read back after a reload.** Only the links changed:
  - Confirm sign up: `{{ .SiteURL }}/account/confirmed/#token_hash={{ .TokenHash }}&type=signup`
  - Reset password: `{{ .SiteURL }}/account/reset/#token_hash={{ .TokenHash }}&type=recovery`

  Site URL is `https://nose-app.com`. Before, each was
  `{{ .ConfirmationURL }}`, Supabase's own site. "Reset template" on each
  page puts that back.
- **The code is after "#"**, which a browser sends to no server, so it is in
  no request log - Netlify's included. Both pages read it, take it out of
  the address at once, and send it only when the button is pressed, so an
  email scanner that opens the link does not use it up. Both still read a
  code after "?", and the session after "#" that an email sent before the
  change comes back with.
- **`auth-confirm.js`** (new): POST `{ token_hash }` → Supabase `/verify`,
  type `signup` → the session Supabase answers with is ended at once
  (`/logout`, scope global). No cookie; the person signs in with their
  password. A used, expired or wrong-shaped code gets one plain sentence; a
  reset code is not accepted. It has no edge rate limit (Pro's five are in
  use) and no throttle of its own: a code is unguessable, and a wrong shape
  never reaches Supabase.
- **`/account/confirmed/`** shows a button, "Confirm email address", when it
  is opened with a code. `auth-reset-finish.js` is unchanged: it already took
  a `token_hash`.
- **Privacy page**, wording approved by the owner: since November 16 the
  link points at this site and Supabase no longer sees the clicker's IP
  address; a link from an earlier email still goes to Supabase first. An
  eleventh change says so.
- **Tests:** `accounts-test` runs `auth-confirm` offline (eight checks);
  `input-paths-test` opens the confirmation page with a code after "#" and
  after "?", presses the button, and tries a used code and a reset code; and
  opens the reset page with a code after "#".
- **Seen live:** the page serves the button, and `auth-confirm` answers a
  made-up code with 400. **Not yet seen:** a real email with the new link.
  The owner tries one; whether it still lands in junk is open.
- `auth-signup` and `auth-reset` still pass `redirect_to`; the new templates
  do not use it. Left in place: it is what makes "Reset template" safe.

### An audit for dead weight: five small removals, 2026-11-16

The owner asked for an audit of unnecessary complexity, duplicated logic and
assumptions that no longer hold, then for the smallest changes, with no
history lost from the project notes. Nothing the site serves changes.

- **`archive-health.js` measures against the plan the projects are on**: 8 GB
  of disk included for a Pro project ("8 GB disk size per project included,
  then $0.125 per GB", supabase.com/pricing, read 2026-11-16), where it
  measured against the free plan's 500 MB. The share prints to two decimals.
- **`scripts/blobs-to-days.js` is removed**, with its checks in
  `client-error-test`. Its job ended on 2026-11-15, when the dry run after
  `--yes` found 0 to rewrite in each store ("The stored votes and error
  reports rewritten"). Commit 9a78e47 is the last that has it.
  `feedback-read.js` still reads a record that keeps `ts`: one expression,
  kept so a record restored from before then still has a day, and
  `match-feedback-test` still gives it one.
- **`TOKEN_HASH` has one home**, `netlify/lib/auth.js`; `auth-confirm.js` and
  `auth-reset-finish.js` each had a copy.
- **`scripts/archive-status.js` is removed**: `archive-health.js` prints the
  rows per table and the newest parse, and no test or gate ran the smaller
  script. Commit 9a78e47 is the last that has it.
- **Five dated documents moved, whole, to `docs/project-notes/`**:
  `FIXES.md`, `TIER1-`, `TIER2-`, `TIER3-CHANGES.md` and
  `LAUNCH-CHECKLIST.md` (`git mv`, not a byte changed). They describe the
  site as it was before 2026-10-15; that folder's README says so. Older
  notes that name them by `docs/<name>` mean these files.
- **Looked at and left:**
  - the old email-link route (the session after "#" on both account pages,
    `access_token` in `auth-reset-finish`, `redirect_to` in `auth-signup` and
    `auth-reset`): "Reset template" in Supabase would need it again;
  - `set-writer-password.js` and `set-b2b-password.js`, about a third alike:
    run rarely, by hand, on credentials;
  - `css/shell` and `family.css`, 79 selectors in common: merging them
    changes every page's bytes, so it is its own prompt;
  - the rate-limit comment repeated in five functions.
- **Not audited:** `parse-coa.js`, the dispensary code beyond which scripts
  a test or gate runs, and the tests' own repetition.

### The parser reviewed: shifted rows and weight units, 2026-11-16

The owner asked for a deep review of `parse-coa.js`, looking for inputs that
give a believable wrong fingerprint. Method: the whole file read, then
made-up reports in layouts no fixture has, one cell per line, each compared
value by value with what it printed. Four were accepted wrong; each is
fixed, and `test/shifted-rows-test.js` (the gate `shifted rows`) holds them -
it fails 11 checks on the parser as it was at 6fc8f7b.

- **Name / limit / result, an inline total, no verdict column: every value
  one row out, accepted with no warning.** The backward reader's margin
  compared its share with the FIRST cell after each name. On this layout
  those are the limits, so "each name takes the result of the row above"
  won. It now compares with the forward reading as committed (the larger of
  that and the first cells, so it wins no more often than before).
- **Name / result under a small stray figure, the last row without a result
  (N/A, NT, a dash): the same shift**, through the edge test. Cell for cell
  that sequence IS a value-first table, and the two sum alike. The edge test
  now needs the document to have printed its TOTAL value-first too ("2.24%"
  then "Total Terpenes"), as both fixtures read backward do (MCL-FLW-003,
  -005). The same edges without it are refused: "NOSE cannot tell whether
  this report prints each figure before or after the name of its terpene, so
  it cannot be sure which figure belongs to which". **A cost:** a
  value-first table in no particular order whose total is printed label
  first was read correctly before and is refused now. No fixture is one.
- **A table in mg/g alone read as percentages, ten times high** - silently
  for a cartridge, whose typical ceiling is 20. Refused now: "this report
  gives its terpene figures by weight (such as mg/g), not as percentages,
  and NOSE reads percentages only". The test is the document's own: across
  the rows read and 15 lines either side, a mass unit is printed and a
  percent sign is not. All 56 accepted fixtures print a percent sign there
  (43 beside a mass unit, 13 without one).
- **"Total Terpenes: 20.00 mg/g (2.000%)" read 20**, and rows printing mg/g
  beside % then reconciled in mg/g. It reads the figure its percent sign
  follows. The comment in the file had named this as unhandled.

**Nothing in the corpus moves:** 56 accepted / 3 rejected, parity 56 / 0,
both backward fixtures still backward, the Kaycha anchors untouched (the
gates pin them). **Not done from here:** `node scripts/reparse.js --dry-run`
against the real archive, which needs the Codespace. Expect no reading to
change; a report it newly refuses is one of the four layouts above.

**Probed and left as they are** (each a refusal or a warning, never a silent
wrong value):
- A bare "Ocimene" beside its isomers adds, with the arithmetic warning past
  1% (`summed-rows-test` holds this on purpose).
- "Total THC / 24.1% / Total Terpenes / 2.0%" as label-then-value tiles
  takes 24.1 as the total and refuses for coverage: a correct report
  refused for the wrong reason. Its own prompt, with a real document.
- A name and its figure on one line, figures in ppm, a decimal comma: all
  refused.
- Also read and probed without a finding: totals above, below and beside
  the table, a panel printed twice, cannabinoid rows inside the table,
  caryophyllene oxide, uncertainty cells, percent signs on values.

### Security items 8, 9, 10 and the keyed fingerprint, 2026-11-16

The owner asked for what was left of the security audit: items 8, 9 and 10,
and the HMAC from item 14. Two are code, each switched on by an environment
variable the owner sets in Netlify; until it is set, nothing changes.

- **Item 10, the two keys.** `gotrue()` in `netlify/lib/auth.js` gives the
  service key only to `/admin/*` calls. Every other call - sign-up, sign-in,
  reset, a link's code, a user's own session and its logout - carries
  `SUPABASE_PUBLISHABLE_KEY` when that is set, and the service key, as
  always, when it is not. **To switch on:** in Netlify, add
  `SUPABASE_PUBLISHABLE_KEY` (the accounts project's publishable or anon
  key, Supabase → Project Settings → API Keys), then sign in once on the
  live site. That key is public by design; it is still the owner who types
  it.
- **Item 14's last part, a keyed fingerprint.** A throttle record's key is
  an HMAC-SHA-256 of the address once `NOSE_THROTTLE_SECRET` is set, and
  the plain SHA-256, as before, until then. Setting it starts every window
  again, once (a window is at most an hour). Deleting an account deletes
  the address's records under both fingerprints. **To switch on:** a long
  random value in Netlify's Production context, AND the privacy page's
  sentence about these counts in the same hour - it says "a SHA-256 hash ...
  anyone who already knows an address could compute the same fingerprint",
  which stops being true. Wording to be approved first.
- **Item 9, what is left.** Sign-in and sign-up have Netlify's per-address
  limit since 2026-11-15. `auth-reset`, `auth-reset-finish` and
  `auth-confirm` do not: Pro's five rules are in use. Their per-email
  throttle stays (3 resets an hour). That anyone can use up a known
  address's eight sign-ins in 15 minutes is the cost of a per-email
  throttle, and stays.
- **Item 8, what is left.** The pilot report already names the days that
  reached the vote cap (`b2b-pilot-report.js`, "Days that reached the daily
  cap"). An edge limit is not possible while pinned releases call
  `/.netlify/functions/b2b-vote`. The report compares against the default
  cap of 100, not `B2B_VOTE_DAILY_CAP`: if that variable is ever set, the
  report needs it too.
- `accounts-test`: with a publishable key set, only `/admin/` calls carry
  the service key; with a secret set, the record is under the keyed
  fingerprint, the throttle still counts, and account deletion clears both.
  Its stand-in for Supabase's sign-up keeps no user since the call gained
  `redirect_to` on 2026-11-15; the new checks add theirs directly.

### The methodology page says how often unrelated jars earn a label, 2026-11-16

The maths critique's second proposal (local only,
`docs/reviews/matching-maths-critique-2026-11-16.md`). Under "4. Name the
result", after the sentence that the cut-offs are ones NOSE chose, the page
now says: among the lab reports the reader is tested with, two flower jars
chosen without regard to each other score "Close match" about one time in
four and at least "Related profile" about two times in three; that a label
says how two profiles compare, not that the match is rare; and that the set
is small and the figures will change.

- **The figures:** 26% and 67% of the 300 pairs of flower jars among the
  accepted fixtures, by `cosine()` on `normalize()`d readings.
- **The page does not say how many reports that is**, at the owner's word.
- **Not under a gate.** If the fixture corpus or the maths changes, these two
  fractions are recomputed by hand; `open.md` says so.
- The sitemap's `lastmod` for the page moves to 2026-11-16.

### A pilot walked through on a made-up store, 2026-11-16

The owner asked for a dry run of the whole pilot before a real store does
one. Done in a scratch clone, nothing kept: the sample size, a plan made from
the template and committed, an export of 489 made-up shoppers with a real 30%
lift, and the report - its votes from a stand-in store, since the real ones
need the Codespace's secrets.

**What ran as written:** both sample-size modes; the plan's `pilot` block
read back; every check in the report (committed before the first day, ended,
both groups full, the size it needed, the split, no leak from control); the
primary result with its interval ("more inhalable orders ... wholly above
zero" on a made-up 30% lift); the secondary figures, the guardrail, the band
table, the days at the cap; and refusals for a shopper column, a currency
sign and TRUE/FALSE. Without the two Netlify secrets it refuses and says
which.

**Three small things fixed:**
- **An export saved with semicolons or tabs was refused as "a column outside
  the format"**, naming the whole first line as that column. It now says its
  values are separated by semicolons (or tabs), not commas, and how to save
  it. The catalog reader shares the check (`wrongSeparator`,
  `lib/b2b-catalog-format.js`).
- **"A wider spread than planned" was said when only one group's was.** The
  dry run printed it beside a control spread narrower than the plan's. It
  now names the group: in both groups, in the test group, or in the control
  group.
- **The plan's date check trusts the date git shows, which the committer
  sets.** The dry run's plan was "committed on 2026-05-20" on 2026-11-16 and
  passed. The template's checklist now asks for the address of that push's
  gates run on GitHub, whose time is GitHub's clock - what a reader outside
  NOSE can check. The script still reads git; the proof is the public run.

**What the numbers say about a first pilot, not fixed by code:**
- A past mean of 1.8 inhalable orders a shopper with a spread of 2.1 needs
  **2,137 shoppers in each group** to find a 10% lift (238 for a 30% lift).
  A store's own mean and spread decide it; ask for them early.
- The band check needs the same number of votes in Strong AND Low (170 each
  at a 50% up share in Low and a 30% relative rise). Votes are asked about
  products a shopper bought, so Low will be rare; with the cap of 100 a day,
  a pilot can end with no result for the band check. The report says so
  plainly ("RESULT: none - Strong has 212 and Low 20 of the 170").

**Not walked, and why:** `b2b-store.js create`, the catalog upload,
`b2b-read-catalog.js` and the coverage report against real links need the
database, the Codespace's secrets and a store's real catalog. The gates run
each against stand-ins; the first real run is still the first real run.

### A name that resolves to a private address, 2026-11-16

Security audit item 6, the part left. Before each request - the first, and
every redirect and page hop - `fetch-report.js` looks the host's name up and
holds every address it gives to the same list a written-out address is held
to; one private address refuses the link, with the sentence a private
address already gets ("That link redirects somewhere it should not" on a
later hop).

- **Not a pin.** `fetch()` looks the name up again for itself, so a name
  server that answers the two lookups differently still gets through.
  Closing that needs the request made on the checked address, which Node's
  fetch cannot do without the `undici` package. https and its certificate
  check remain the guard: a private machine would need a certificate for
  the public name.
- A lookup that fails, or runs past 1.5 seconds, decides nothing: the
  request goes on as before. An address written as the host is not looked
  up.
- `fetch-guard-test`: a name resolving to 10.0.0.5, one private address
  among several, a redirect to such a name, a failed lookup, one that never
  answers - each with a stand-in lookup. The other tests name hosts that do
  not exist; their lookups fail in tens of milliseconds, and the gates take
  as long as before.

### Total tiles, and the open list tidied, 2026-11-16

- **"Total THC / 24.1% / Total Terpenes / 2.0%" read 24.1 as the terpene
  total** and refused a correctly printed report for recovering 8% of it
  (left open by "The parser reviewed", the same day). The figure above a
  bare "Total Terpenes" label is now left alone when the nearest name above
  it is a cannabinoid or a cannabinoid total AND the line below the label is
  itself a percentage - the label's own figure. A value-first run, Modern
  Canna's summary, has a heading below the label and reads as it did.
  `shifted-rows-test` has both, and a single cannabinoid's tile. 56 accepted
  / 3 rejected and parity 56 / 0, unmoved.
- **`open.md`: four items taken off, three reworded, four moved.** Off: the
  login emails as they were before 2026-11-16 and the password reset
  "working" (both closed by "Email links that come to NOSE"), the guard that
  checked host names only (closed by "A name that resolves to a private
  address"), and the `wip/` draft (deleted 2026-11-14). Reworded to what is
  true now: the vote cap, pre-registration's date, the demo page. Moved out
  from under "§14: later", where four of 2026-11-16's items had been
  appended by mistake.
- **Looked at and left open, not verified from here:** the two "not pushed
  until the walk-through runs" items in §14 need the database to check; the
  home page still says "upload a report" (`index.html`), public wording; the
  sitemap's `lastmod` for `/` and `/app` is still 2026-07-20.
- **Two things measured and filed in the local critique, changing nothing:**
  the consumer app keeps no product form with a saved jar, so it compares
  across forms and cannot say so; and a "closest liked jar" score against
  the averaged palate (the critique's addendum has the table).

### A result across product forms says so, 2026-11-16

The maths critique found that two thirds of "Close match" pairs among the
fixtures are across product forms, and that the app could not know: a saved
jar held its name, a subtitle and its terpenes. The owner left the choice to
the session ("do what you think is best").

- **A jar added from a lab report keeps the report's product form in this
  browser** - `form`: flower, vape or concentrate, the parser's own names,
  and nothing for any other. A sample jar, a jar entered by hand and a jar
  saved before today have none.
- **The result says one sentence when the compared jar and a palate jar
  each carry a form and the two differ**: "These are different kinds of
  product: flower and a vape. The score compares the shape of their terpene
  profiles, not their intensity." (`#resultFormNote`, under the result's
  explanation.) No score, label or band changes.
- **It never reaches the account.** A backup sends the four fields
  `palate-sync.js` keeps and no other, and that function drops any other, so a palate loaded back from the account has
  no forms and shows no note. The privacy page's description of a synced
  palate is unchanged; what the browser keeps is the person's own.
- `input-paths-test`: flower against a vape shows the sentence beside
  "Close match"; flower against flower, and a jar with no form on either
  side, show none.
- **Decided against, the same day: scoring by the closest liked jar instead
  of the averaged palate.** It finds jars like the ones a person named far
  better (a re-measured liked jar ranks 2nd, against about 11th), and hands
  out three times the "Close match" labels for unlike jars. It changes every
  score ahead of a pilot whose votes are the only evidence of what
  people enjoy; the method is revised on that evidence, as the plan says.
  The table is in the local critique.

### The publishable key switched on, 2026-11-16

Security audit item 10, finished. The owner copied the accounts project's
publishable key (Supabase → Settings → API Keys, the `default` key under
"Publishable key") into Netlify as `SUPABASE_PUBLISHABLE_KEY`, Production
context only, as the other keys are. A deploy was started by hand from
Netlify's Deploys page (Trigger deploy → Deploy project, 26 seconds): a
variable reaches the functions only with a new deploy, and no push was due.

- **Seen:** `live-check.sh` clean; a made-up address gets the fixed
  "Email or password is incorrect"; a made-up code gets the confirmation
  page's "expired" sentence; and **the owner signed in on the live site** -
  the proof that Supabase takes the new key, since a refused key and a wrong
  password get the same reply by design.
- From now the service key is sent only on `/admin/*` calls: reading a
  user for the account page, and deleting an account.
- **To undo:** delete the variable in Netlify and deploy again; every call
  carries the service key as before.

### The real archive after the parser review, 2026-11-16

The step "The parser reviewed" and "Total tiles" left for the Codespace. Run
by the owner there, at `c0ff192`, which holds every parser change of the day:

```
reparse --dry-run: parser c0ff192
dry run - nothing was written
69 documents: 69 unchanged / 0 values changed / 0 accepted→rejected / 0 rejected→accepted / 0 failed
```

No archived report reads differently, and none is newly refused. A first run
the same hour printed `parser d8c19b7`: the Codespace had not pulled, so it
compared the old parser with itself and showed nothing; the line naming the
parser is what to read first.

### The keyed fingerprint switched on, 2026-11-17

Security audit item 14's last part, finished. The owner made a random value
in the Codespace (`openssl rand -hex 32`) and saved it in Netlify as
`NOSE_THROTTLE_SECRET`: a secret value, Production context only, scoped to
Builds, Functions and Runtime as the other secrets are, on 2026-11-16. A
saved variable reaches the functions only at the next deploy: this commit's,
on 2026-11-17, so that is the date the page gives.

- A throttle record's key is now an HMAC-SHA-256 of the address with that
  secret (`netlify/lib/auth.js`, `throttleDigest`). Every window started
  again once; a record written before is under the plain SHA-256 until its
  window ends, an hour at most, and the daily purge removes it.
- **The privacy page**, the sentence the owner approved on 2026-11-16, with
  the deploy's date in it: "It is kept under a fingerprint of the address
  rather than the address itself. Since November 17, 2026, the fingerprint is made with a secret key that
  only our server holds, so knowing an address is not enough to compute it.
  Before that date it was a plain SHA-256 hash, which anyone who knew an
  address could compute." No entry was added to the page's list of changes:
  its wording has not been shown to the owner.
- **Losing the secret, or changing it, starts every window again** and
  nothing else: no account, session or palate depends on it.

### The new look went live, 2026-11-17

The site's redesign, built on the branch `redesign` from 2026-11-16 and
merged to `main` as `5dbf3f1` on 2026-11-17, without a Netlify preview
(deploy previews are off). The direction and its rules are in `DESIGN.md`;
who the site is for, and that no proof may be invented, in `PRODUCT.md`;
the site before it, in `docs/design/baseline.md` and its screenshots.

- **What changed for everyone**: a forest field (`#0E1410`), Fraunces and
  Hanken Grotesk (self-hosted under `css/fonts`, since the CSP allows only
  `'self'`), and the equalizer - six channels lit to a profile's families -
  on the home page, in "See the match" and in the matcher's result
  (`js/hero`, which is `window.NoseDesk`; it loads before `js/nose` on both
  pages). The header says "Match a jar". The widget and the matcher's
  report-confirmation card keep their bars.
- **Rebuilt**: home (`css/home`), dispensaries (`css/dispensaries`, the
  widget's views on their own white ground), the seven aroma pages
  (`css/aroma`, no `family.css`). **Laid out anew on their old markup**:
  `/learn/` and its guides, `/methodology/`, `/about/`, `/privacy/` and
  `/terms/` (`css/read`); no word or test-read element changed.
  **Re-skinned only**: account, 404 and the b2b demo (`open.md`).
- **After the merge, the same day**: `d724a0a` (closing the age gate no
  longer scrolls the page in Safari), `2e8f299` (a compact phone footer; the
  matcher's camera preview pinned to the scanner box, which Safari had left
  at its starting size), `43699d6` (the match label centred; guide titles on
  `/learn/` underlined) and `8889038` (the header's six bars move like a level
  meter again, still for reduced motion). CI's gates, promote and live-check
  passed on `8889038`, and the privacy page's November 17 sentence
  (`a429e24`) is still on the live page.
- **The scoring did not change**: `js/match-math` is untouched, and
  `js/nose` changed only in what it draws - the desk in place of the bar
  (it falls back to the bar without `NoseDesk`), the family cards' text no
  longer in each family's colour, and "Learn more →" without its arrow.
- **To undo it**: `git revert -m 1 5dbf3f1`, then the four commits after it.

### The account pages, 404 and the demo rebuilt, 2026-11-17

The three pages "The new look went live" left re-skinned, rebuilt to
`DESIGN.md`. No sentence changed; three labels did, below.

- **A new stylesheet, `css/page`** (fingerprinted in `build.sh` after
  `css/read`): the breadcrumb, the page head, a row of buttons and a list set
  on rules, for pages that have no stylesheet of their own. `404.html` and
  the three account pages link `css/tokens`, `css/world`, `css/page` (and the
  account pages `css/account`), and no longer `family.css`.
- **`404.html`**: its three boxed cards are rows on rules, the heading on the
  left, as on `/learn/`. Its "404" label above the heading is gone (no label
  above a heading), and its first button says "Match a jar", as the header
  does, in place of "Start matching".
- **The account pages**: `css/account` rewritten. The forms stand on the
  field, each part of the page under a hairline, aligned with the heading
  rather than centred in a box; sign-in and sign-up are two tabs on a
  hairline; the account's details are readouts on rules; field labels and
  hints are 15px, from 11 and 13. **No family colour marks a state any
  more**: the delete heading was spice-coloured and its button a salmon
  fill, and an error message had a spice border and tint - each is now ink,
  and an error is set in 600 weight. The "Account" label above each heading
  is gone. Every id the account script reads is unchanged; it reads no class.
- **`/b2b/demo/`**: `css/b2b-demo` rewritten so the page no longer links
  `css/shell`: the controls a raised panel (the page's tool), the batch table
  on rules, nothing under 14px. Its label "For dispensaries · demo" became a
  breadcrumb, "For dispensaries / Demo", the first part a link to
  `/dispensaries/`. The widget and its white ground are untouched, and the
  compliance kit's pictures are of the widget, not the page.
- Checked in Chromium at 390 and 1280 (signed out, signed in, reset,
  confirmed, 404, the demo), before and after; all gates green. Safari not
  looked at.

### Two small open items closed, 2026-11-17

- **The sitemap's dates**: each page's `lastmod` in `sitemap.xml` is now the
  day its file last changed in git (`git log -1 --format=%cs -- <file>`).
  All 21 read 2026-11-17, since the redesign changed every page that day;
  `/` and `/app` had kept 2026-07-20 through R3 to R8, and `/privacy/` read
  2026-11-14 though its throttle sentence changed on 2026-11-17. Nothing
  keeps the dates true by itself: a page whose words change should have its
  line changed in the same commit.
- **`lib/fetch-report.js`'s header** names its real callers: `lib/read-report.js`
  (validateUrl and fetchPdf, for `coa.js`), the two dispensary scripts that
  check catalog links with validateUrl, `scripts/download-twice.js`
  (resolvePdfFromPage), and the three tests. A comment only; no code changed.

### Scan QR first, and no Upload tab, 2026-11-17

The owner, shown the Upload tab on a phone: hide it, and put the focus on
scanning the jar, the easiest way for most people.

- **The Upload tab, its panel and its handler are gone** (`app.html`,
  `js/nose`'s `validateUpload`). Reading an uploaded file was never built:
  the tab offered a file picker that only checked a file's type and size and
  said reading it "isn't available yet". Bringing it back is
  `git revert` of this commit's `app.html` and `js/nose` parts.
- **The matcher opens on Scan QR**, first of four tabs (Scan QR, Samples,
  COA link, Manual), with the camera off: it still starts only when a person
  presses the button, which says "Start camera" until the camera has run and
  "Restart camera" after (`setScannerButtons`). Pressing the Scan QR tab
  itself still starts it, as before.
- **The home page's first step**, the owner's wording asked for: "Scan the QR
  code on the jar's label. No code to scan? Paste a COA link, try a sample,
  or enter terpene values manually." in place of "Use a sample, paste a COA
  link, upload a report, or enter terpene values manually."
- **`input-paths-test`**: a check that the matcher opens on Scan QR with
  "Start camera"; the Upload checks replaced by one that no Upload tab, panel
  or file input exists; the tab-key checks in the new order. Home and the
  wrap now land on Scan QR, which starts the camera, so the test waits for
  it to settle before leaving: leaving at once let Chromium report "The
  play() request was interrupted because the media was removed from the
  document" as an uncaught error, once in three runs.

### The camera fills its box, and leaving it while it starts, 2026-11-17

The owner, on an iPhone: the camera's picture did not fill the preview's box
(a narrower picture centred in the 4:3 box, dark bands either side); and fix
the race noted that morning.

- **The preview is sized in `js/nose`** (`coverPreview`): on a phone (720px
  and under) the video is set to cover the box at its own proportions,
  centred, the overflow cut off by the box. css/world asked for
  `object-fit: cover`, which Chromium applies, but the iPhone showed the
  picture letterboxed; object-fit has not always been applied to a live
  camera in Safari. It runs when the scanner starts, when the stream's size
  changes (`loadedmetadata`, `resize`) and when the window does; wider
  screens are left as they were. What is cut off is still read: the scanner
  reads the camera's own frames. In Chromium, with a fake 640x480 camera the
  video is the box (316x237); with a 3:4 one (360x480) it is 316x421, 92px
  above and below cut off, nothing stretched.
- **Leaving Scan QR while its camera was starting broke the camera**, not only
  the console. Reproduced in Chromium with a fake camera, pressing Start
  camera then COA link after 0 to 800ms, twice each: at 0 and 20ms the
  library's `stop()` removed the video before its `play()` had finished,
  threw, and was left sure it was still scanning, so it refused every later
  start - the camera would not come back on returning to Scan QR (8 problems
  in 20 tries). Now:
  - every start goes through `libStart`, remembered until the video is really
    playing (its `playing` event; `paused` turns false as soon as play() is
    asked) or two seconds pass, and `stopQrScanner` waits for it;
  - a stop counts as superseding a start in progress (`scanAttempt`), so a
    start that has not reached the camera yet stops there, and a failed first
    start is not retried;
  - the stop asks the library's own state (`getState() === 2`, scanning),
    since a start that has just finished may not have said so yet;
  - if the library's stop fails anyway, its camera tracks are stopped, the
    box emptied and a new scanner made at the next start.
  The same 20 tries twice: no problem. `input-paths-test` gained a check
  (Chromium, with the fake camera): left at 0, 15 and 40ms, the camera starts
  again on coming back each time, with no uncaught error.
- Watched in Chromium; then the owner, on an iPhone in Safari the same day, reported the picture fills the box.

### A message left over nothing, and one text floor, 2026-11-17

Two open items, taken up once Scan QR became the first way in.

- **A card taken by a read in another tab takes its message with it.** Read a
  link, leave its card open, then scan a code: the card moved to Scan QR with
  the new report, and the COA link tab still said "<lab> read. Check the
  values below, then add the jar." over nothing (seen 2026-09-23).
  `fetchCoaReport()` now hides the message of the read whose card it takes,
  when that read was in another tab, before it starts; the same holds the
  other way. No new words. `input-paths-test` checks the COA link tab's
  message is gone after the scan; without the fix that check fails with the
  very sentence, in Chromium and Firefox.
- **The re-run tools' text floor is the scanner's constant.**
  `scripts/lib/rerun.js` had its own `MIN_TEXT = 200`; it now takes
  `MIN_TEXT` from `lib/read-report.js`, as `b2b-coverage.js` already did -
  through a getter, read when asked for, since requiring the reader when
  `rerun.js` loads broke `b2b-pilot-test`, whose copied tree holds `rerun.js`
  for the pilot report but not the reader the report never uses - so
  `reparse.js`, `backfill-from-blobs.js` and `seed-from-fixtures.js` refuse
  below the very number the scanner does. `rerun-test` checks the two are
  one and that `rerun.js` writes no number of its own.

### The fetcher's connection pinned, 2026-11-17

Security audit item 6, its last part, with the owner's agreement to add one
dependency: `undici` 7.30.1, exact, the version Node 24's own fetch runs on
(`process.versions.undici`), from the Node.js project. The owner asked for
the install in chat after the session's permission check had refused it.

- **Every request the fetcher makes goes through `PINNED`**, an undici
  `Agent` passed to the global `fetch` as its `dispatcher`, whose connect
  step looks the name up with `guardedLookup`: the same resolver as the
  early check, every address held to `isBlockedAddress`, and only checked
  addresses handed to the socket (one, or all when the connector asks for
  all). A private one is refused with `NOSE_PRIVATE_ADDRESS`, which
  `fetchOnce` turns into the private-network sentence (or the redirect one,
  after a hop). The early lookup (2026-11-16) stays, for its sentence before
  any request; https and its certificate check stay.
- The global `fetch` is still the one called, so the tests' stand-ins work as
  before and ignore the dispatcher.
- **`fetch-guard-test`**: the connect-time lookup alone (public handed over,
  one or all; private refused; none is "not found"), and the attack itself
  through the real fetch and Agent: a name answering public to the early
  check and 127.0.0.1 at connect is refused with the private-network
  sentence, before any socket opens. With `dispatcher: PINNED` taken out, that
  check fails ("Could not reach that address."), so it tests the pin.
- By hand, on this machine: a public PDF (w3.org's dummy.pdf, 13,264 bytes)
  fetched through the pinned agent; `localtest.me`, a public name for
  127.0.0.1, refused with the private-network sentence.
- esbuild, which Netlify bundles the functions with, was not run here;
  `undici` is plain JavaScript. The deploy's live-check calls `coa`.
- **`npm install <package>` removes Playwright**: it was installed with
  `--no-save`, and npm prunes what `package.json` does not list, so the three
  browser gates failed "Playwright is not installed" until
  `npm install --no-save playwright@1.64.1` put it back (the browsers stay
  downloaded). The same holds after any `npm ci`, as CLAUDE.md says.

### The preview takes the camera's shape, and the card's fingerprint on the desk, 2026-11-17

The owner scanned a new jar on an iPhone: the camera's picture looked widened
and the code took longer to read; and the card's "Aroma fingerprint" should
be the equalizer.

- **The preview box takes the camera's own shape on a phone**
  (`coverPreview` in `js/nose`, rewritten): its `aspect-ratio` is set from
  the stream's `videoWidth / videoHeight` whenever they are known or change,
  and its 360px height cap is lifted, so the whole picture shows, neither
  cropped nor stretched. The cover sizing of the same morning ("The camera
  fills its box") zoomed the picture to fill a 4:3 box, cutting off its
  edges, and drew it with `object-fit: fill`, which stretches it if the size
  the browser reports is not the size it draws - a likely cause of the
  widened picture and of the slower aim. In Chromium: a 3:4 camera (360x480)
  gives a 316x421 box, a 4:3 one a 316x237 box. Wider screens unchanged.
- **The confirmation card's fingerprint is on the desk** (`renderDesk` in
  place of `renderBar` for `coaConfirmBar`), with the six family names under
  it as on the match result, and the bar as its fallback without
  `NoseDesk`. The desk re-measures when the card is shown (its
  ResizeObserver), so it is drawn at the card's width.
- Watched in Chromium, `input-paths-test` clean (its card pictures show the
  desk). How the preview looks on the iPhone is the owner's to see.

### The iPhone's camera layer laid out again, and the card's buttons apart, 2026-11-17

The owner, scanning again on an iPhone: the box now had the picture's shape
(portrait) but the picture was drawn smaller, centred inside it; and
"Discard" touched "Use this jar" and the row above.

- **Every iPhone screenshot showed the picture at the same size**, whatever
  the box or the CSS did - letterboxed in the 4:3 box, unmoved by the cover
  sizing, small in the portrait box. In WebKit on Windows (no live camera
  there: no `canvas.captureStream`), a video in the box measured 314x419,
  filling it, as in Chromium: the element is sized right, and the picture
  is not. iOS Safari draws a live camera on a layer of its own, which keeps
  the size the video had when the camera started. `coverPreview` now, once
  the box takes a new shape, lays the video out again (hidden, a reflow,
  shown) and plays it on, in the next frame. Not seen on an iPhone yet.
- **The card's buttons**: `.buttons` is `family.css`'s, which `/app` does not
  load, so the two sat flush; `css/shell` now gives the card's row a 10px gap
  and 24px above it.

### A readout of the camera on the iPhone, and a test that tested nothing, 2026-11-17

- **`?camdebug=1` on `/app`** (TEMPORARY, `js/nose`'s `camDebug`): every
  second, under the preview, the viewport, the box's size, display, position
  and aspect-ratio, and each child's size, place, display, position, width,
  height, object-fit and transform, with the video's stream size, inline
  style and attributes. Shown only with that parameter. It is there because
  two fixes for the iPhone's small camera picture were guesses, and the
  layout measures right in Chromium and WebKit; to be removed once the
  owner's readout shows the cause.
- **`rerun-test`'s check that `rerun.js` writes no `MIN_TEXT` number of its
  own tested nothing**: written through a shell here-document, its `\b`
  became a backspace character, so the pattern looked for a backspace before
  `MIN_TEXT` and never matched. Fixed; it now fails when a `const MIN_TEXT =
  200;` is put back in `rerun.js`, and passes without it. The readout's first
  version had the same fault (no readout appeared). A search of every tracked
  source file for control characters finds none left but the vendored
  `html5-qrcode`'s own.

### The camera box is square: what the iPhone's readout showed, 2026-11-17

The owner opened `/app?camdebug=1` on an iPhone (viewport 430x815, dpr 3,
Private browsing) and started the camera. The readout: box 356x267 (4:3),
video 354x265 filling it, object-fit cover, no transform - and stream 0x0,
with nothing drawn.

- **The element was right; the picture was turned.** In every earlier iPhone
  screenshot the picture measured about 265x354 css px: the video element's
  354x265, on its side, centred. iOS Safari draws a live camera on a layer
  it rotates to portrait, and the layer's size turns with it. In the 4:3 box
  the 265x354 strip was clipped to the box's 265 height and showed as a
  265x265 square ("doesn't fit the square"); in the portrait box of
  "The preview takes the camera's shape" it showed whole, small and centred.
  The cover sizing of "The camera fills its box" changed the element, not
  the turned layer, so it looked widened.
- **Stream 0x0 was the morning's re-layout step** ("The iPhone's camera layer
  laid out again"): hiding and showing a playing camera video on iOS left it
  with no frames. Removed.
- **The fix: a square box on a phone** (`css/world`, `[data-page="app"]
  .scanner-reader`, `aspect-ratio: 1 / 1`, no height cap), from the start, so
  nothing resizes once the camera runs. A square turned is the same square,
  and the picture covers it. `coverPreview`, which reshaped the box from the
  stream's size, is gone. In Chromium: a 316x316 box, the video 314x314.
- `?camdebug=1` stays until the owner's iPhone shows the picture filling the
  square.

### iOS draws the camera fitted whole: the picture scaled to fill, 2026-11-17

The owner's readout from a normal tab (the three black ones had all been in
Private browsing, where the stream stayed 0x0): box 356x356, video 354x354,
stream 480x640, object-fit computed as cover - and the picture drawn 265x354,
the whole portrait frame fitted inside the square with bands either side.

- **iOS Safari ignores object-fit for a live camera and fits it whole**
  (contain). So `css/world` now asks every browser for `contain`, and
  `fillPreview` in `js/nose` scales the video from its centre by
  max(box / fitted picture) - 1.3333 for a 3:4 or 4:3 camera in the square -
  so the fitted picture covers the box, which clips the rest. Chromium,
  which honoured cover, now draws the same way. It runs when the camera
  starts, when the stream's size changes and when the window does; wider
  screens are left alone. The scanner reads the camera's frames, not the
  drawing. In Chromium, a 360x480 camera: the video drawn 418.7x418.7 from
  -51.3,-51.3 in the 316x316 box, filled, nothing stretched.
- **The rotated-layer reading of the same day was half right**: the square box
  stays (it is what made the iPhone's picture whole and upright), but what
  left bands was the fitting, not a turned layer.
- **Private browsing gave no frames at all** on the owner's iPhone (stream
  0x0, the camera light on) - before and after the day's changes. Not looked
  into further (`open.md`).

### The camera goes dark at times: the readout widened, 2026-11-17

The owner's next readout, in a normal tab: the square box, the video scaled
1.3333 - so the stream's size had been known - and then stream 0x0 and a
black box. Over the day the picture showed at 5:18 and 7:51 and was black at
5:50, 6:53, 7:38 and 8:38, in normal and Private tabs alike: something cuts
the camera off after it starts, at times. The Private-browsing reading in
"iOS draws the camera fitted whole" is not supported by this.

- `?camdebug=1` now also shows the video's readyState, paused and whether
  its stream is active; the track's readyState, muted, enabled, size, zoom
  and focus mode; and the last 14 events, timed from page load: the
  library's start, the track's label and state, the video's
  loadedmetadata, playing, pause, emptied, stalled, suspend, waiting, ended
  and error, the track's ended, mute and unmute, `improveCameraFocus`'s
  `applyConstraints` (focus continuous, zoom 1.5) and its outcome, and each
  stop. Still TEMPORARY.

### "Start camera" asked for the click as a camera, and the video made a covering square, 2026-11-17

The owner noticed the pattern: the picture went dark after pressing
"Restart camera" (or "Start camera"), and showed when the camera was started
from the Scan QR tab.

- **The button handed `startQrScanner` its click event as the camera id.**
  It was wired as `on('startScannerButton','click',startQrScanner)`, so the
  event arrived as `cameraId` and the page asked for `{deviceId: {exact:
  <the event>}}`. In Chromium the library refused it and the page fell back
  to any rear camera (the OverconstrainedError in the race trace of the
  same day); on the owner's iPhone it left a stream with no picture. The
  tab calls `startQrScanner()` with nothing. Old, but rarely met while the
  camera started from the tab; once the matcher opened on Scan QR with
  "Start camera" under the box, it was the way most starts went. Now
  `()=>startQrScanner()`, and the stop button likewise. `input-paths-test`
  checks that pressing "Start camera" asks for the chosen camera by its id;
  with the old wiring that check fails, its requests reading
  `["none","object","none","none"]`.
- **The scaled video did not change the iPhone's picture**: the readout of
  the same start (from the tab) showed the video at 472x472 under its
  `scale(1.3333)` and the picture still 265x354. Across every readout and
  screenshot of the day the picture was a 480x640 frame fitted whole in a
  square as wide as the video's own width - the 4:3 box clipping it to
  265x265, the portrait box showing it whole, the square box with bands.
  `fillPreview` now makes the video itself a square wide enough that the
  picture fitted in it covers the box (`side = max(box width x long / stream
  width, box height x long / stream height)`), centred, clipped by the box;
  no transform. In Chromium, a 360x480 camera in the 316px box: a 419px
  square at -52,-52, filling it.
- The readout stays until the owner's iPhone shows the picture filling the
  square from "Start camera".

### The camera works on the owner's iPhone, and the readout comes out, 2026-11-17

The owner's readout after the last two fixes, from "Start camera" in a
normal tab: box 356x356, video a 472x472 square at -58,-58, stream 480x640,
track live and playing, the 1.5 zoom applied - and the picture filling the
square edge to edge. Both fixes of "'Start camera' asked for the click as a
camera" hold on the phone.

- **The `?camdebug=1` readout is removed** (`camDebug`, its event log and
  the notes in `libStart`, `improveCameraFocus` and `stopQrScanner`);
  `improveCameraFocus` is back to its plain form. `fillPreview`'s comment
  names the measurements without pointing at the readout, and `css/world`'s
  says "makes it a square" where it said "scales".
- **What the scanner decodes follows the video's size on the page.** The
  library sizes its decode canvas from the video's clientWidth and
  clientHeight when the video starts playing (`onRenderSurfaceReady`), and
  copies the whole frame into it each scan (`foreverScan`). `fillPreview`
  runs on `loadedmetadata`, which comes before `playing`, so the square is
  set first and the whole frame is read, squashed to the square. Resizing
  the video after it plays would leave the scanner reading only part of the
  frame; the comment says so.
- **Measured in Chromium at 390 wide** (a fake camera playing the test's QR
  code, three or four tries each): with `fillPreview`, a 640x480 and a
  480x640 camera were each read in about 0.2 s, as at 1280 wide; with it
  switched off (the video at the box's 314px), the 640x480 camera's code
  was never read in 15 s, while the 480x640 one still was. So the larger
  square also gives the scanner a sharper copy.
- **`input-paths-test`, at 390 wide** (Chromium, the fake 640x480 camera):
  the box square, the video a larger square, and "Start camera" reading the
  code; the sizes are written down in the page at `playing`, since the code
  is read in about 0.2 s and the scanner then takes the video away. With
  `fillPreview` switched off the check fails ("box and video
  [314,314,314,314], read never"). The gates had no camera scan at phone
  width before; the "passes at 390 wide" of the morning's `2e8f299` was
  checked by hand.
- Private browsing on the owner's iPhone: the black pictures there came at
  the same times as in normal tabs, before the button was fixed; not
  retried since.

### Three small open items closed, 2026-11-18

Three entries of `open.md`'s §13 list, taken in turn at the owner's word.

- **The card's guide link says it opens a new tab.** The Water activity
  row's link (R8) keeps its words and the row's visible text; its
  `aria-label` is now those words plus ", opens in a new tab", so a screen
  reader announces it (WAI's advisory technique G201,
  https://www.w3.org/WAI/WCAG22/Techniques/general/G201). The name begins
  with the words shown, so speaking the visible words still reaches the link
  (WCAG 2.5.3, Label in Name). `input-paths-test` checks the label with the
  href, target and rel. Seen in Chromium and Firefox on Windows; WebKit runs
  in CI.
- **The methodology page's figures are under a gate.** `match-props-test`
  recomputes them as the 2026-11-16 record did: every pair among the
  accepted flower fixtures (25 jars, 300 pairs), `cosine()` on
  `normalize()`d readings, banded by `matchBand()`. Today 78 pairs (26%)
  are "Close match" and 202 (67%) at least "Related profile". The check
  fails if either share moves more than 5 points from what the page says
  (1/4, 2/3), or if the page stops saying it, so that the sentence and the
  test change together. Moving "one time in four" to "one time in five" on a
  scratch copy failed it.
- **"Strict mode was run in Chromium only" is no longer true, and comes off
  the list.** Since 2026-11-14 `input-paths-test` loads the app, strict
  bundle and all, in WebKit and Firefox as well as Chromium, and fails on
  any page error; and on 2026-11-17 the camera path ran on the owner's
  iPhone in Safari ("The camera works on the owner's iPhone, and the
  readout comes out").

### The intensity guide's three jars are on the desk, 2026-11-18

The owner found a fingerprint bar left on
`/learn/intensity-versus-character/`: the worked example's Jars A, B and C.
Each is now a desk, as on the match result.

- **`js/hero` draws a page's worked examples**: every `canvas.result-eq`
  with `data-shares` (six whole percents in family order) gets a desk, lit
  as the matcher's result is, full at 60%. The guide loads `js/hero`; it
  needs neither `js/nose` nor `js/match-math`, since its shares are written
  in the page.
- **The guide's markup**: each bar and its legend became a `.fp-desk`
  (`role="img"`, the same `aria-label` as the bar had) holding the canvas,
  with the six family names and each share under it (`.desk-channels`). The
  intensity meter beside it is unchanged. "How NOSE shows both" now calls
  character the equalizer, each channel lit to its family's share.
- **Under a gate**: `match-test` checks the three `data-shares` equal the
  family shares of the jars the caption describes (30,40,20,0,10,0 twice;
  20,10,0,40,0,30).
- **Gone from `family.css`**: `.fp-bar`, `.fp-mix-a`, `.fp-mix-c` and
  `.fp-legend`, which no page uses now.
- Not seen in a browser in this session; the owner looks at the live page.

### The guides' last numbers under a gate, and the app's dead hero rules gone, 2026-11-18

- **`match-test` now holds every number on the two research guides**: on
  `learn/intensity-versus-character/`, the 0.5% cutoff table (each value,
  which are over, each share, "none" and "three") and its two sentences
  ("has three", "scores the pair 100"); on
  `learn/what-a-lab-report-cant-smell/`, jars D to G as the page gives them,
  and the table's and sentences' 99 (Close match) and 46 (Different
  profile), from `cosine()`, `shownScore()` and `matchBand()`. Changing the
  99 to 98 on a scratch copy failed it.
- **`css/shell`'s `.hero` rules are gone** (the glow, the grid, the heading,
  the copy, the note, and their lines in the two media queries): `/app`,
  the one page that links `css/shell`, has no `.hero`, and no script sets
  one.

### family.css goes: the reading pages keep only what they use, 2026-11-18

The eleven reading pages (`/about/`, `/privacy/`, `/terms/`, `/methodology/`,
`/learn/` and the six guides) were the last to link `family.css`. With it
switched off, about 7,700 element-and-property pairs changed across them:
it still laid most of them out, under `css/read`'s thin layer.

- **`css/legacy`** holds the 187 of its 287 rules that reach an element on
  one of those pages (any selector, pseudo-classes and pseudo-elements set
  aside, in any media query), as written, with the old colour names written
  as the new ones; its `:root` keeps only `--max` and `--family`. The pages
  link it where they linked `family.css`, so the cascade is unchanged.
  `family.css` is deleted; `build.sh` fingerprints `css/legacy` in its place,
  and `_headers`, `verify-manifest.sh` and `live-check.sh` follow.
- **Checked by computed style**: every element of the eleven pages, with its
  `::before`, `::after` and `::marker`, at 1280, 760 and 390px in headless
  Chromium - every property and each element's box - before and after: 0
  differences.
- **Tried first, and dropped**: folding the rules into `css/read`, which loads
  after `css/world`. In a cascade layer, rules that had beaten `css/world` by
  specificity lost (41,107 differences); unlayered, ties flipped (90,540);
  dropping the declarations `css/world` sets for the same selector still left
  47,924, and hover states cannot be measured that way. A file of its own in
  `family.css`'s place keeps the cascade exactly.
- **Still open**: `css/world`'s old-names section stays, since `/app` links
  `css/shell`, which uses those names too. A redesign of the reading pages
  in the new look would drop `css/legacy`.

### The reading pages rebuilt: css/legacy and css/read go, 2026-11-18

The eleven reading pages (`/about/`, `/privacy/`, `/terms/`, `/methodology/`,
`/learn/` and the six guides) were the old layout dressed in the new look:
`css/legacy` (what they kept of `family.css`), `css/world`'s old-names
section, then `css/read` rearranging the card grids. They are rebuilt the way
the aroma pages and `/dispensaries/` were.

- **One stylesheet, `css/reading`**, linked after `css/world` (and
  `css/agegate` where a page had it), with no older sheet. The markup uses its
  own `r-` class names, so none of `css/world`'s old names reach these pages
  any more. `css/legacy` and `css/read` are deleted; `build.sh` fingerprints
  `css/reading` in their place and `verify-manifest.sh` checks for it.
  `css/world`'s old-names section stays: `/app` still links `css/shell`.
- **A guide** (intensity-versus-character was the template, approved by the
  owner at 390 and 1280px): one centred column, text at the 33em measure,
  figures, tables and sources to 46em. The worked jars are rows on rules with
  the desk; tables are hairlines without a box, figures in tabular numerals;
  the pager loops through the guides; the closing invitation is centred,
  unboxed. The "In short" points stay boxed, a raised panel on a hairline
  (the owner's call). The example lab report on how-to-read-a-coa is a sheet
  in the site's tones with square numbered markers.
- **The plain pages** (`/learn/`, `/methodology/`, `/about/`, `/privacy/`,
  `/terms/`) are rows on rules, heading left and words right, as `css/page`
  lays out 404 and the account pages. `/learn/` is a list of guides whose
  titles link the whole row. Privacy's dispensary section takes the full
  width, its two columns side by side. The old 4px-striped note boxes are a
  raised panel on a hairline.
- **Every word kept**: each page was rewritten by a script that compared the
  sorted list of words in the file before and after and refused any change.
  The tables' inner markup, which `match-test` reads, is byte for byte as it
  was. Labels that sat above a heading (DESIGN.md bans them) moved without a
  word changing: "Guide 04" leads a guide's meta line, a page head's label
  sits under its lede, and `/about/`'s section labels sit under their
  statements. The "Read the guide →" lines on `/learn/` stay in the markup and
  stay hidden, as they were.
- **Checked**: every page at 390 and 1280px in headless Chromium, rendered
  from its own HTML on a local server with the age-gate script stubbed out
  (the real page was not touched), no sideways overflow at either width;
  `bash build.sh`; `bash scripts/gates.sh`. Safari and Firefox not looked at,
  nor keyboard focus or a screen reader's reading of the new structure.
- **Noticed, not changed**: `/learn/` gives intensity-versus-character as
  "5 min read" and the guide itself says "6 min read".

### The reading pages after the rebuild: underline, other browsers, keyboard, 2026-11-18

Follow-ups to "The reading pages rebuilt" above, the same day.

- **Guide titles on `/learn/` read as links** (4608bd3): their underline was
  1px in the hairline colour and all but vanished on the dark field, so it is
  2px in the secondary-text colour, turning ink on hover (the owner's call,
  from a phone). Its first CI run timed out after 30 minutes inside
  `npx playwright install` and was cancelled before any gate ran; the owner
  re-ran it and it went live.
- **Other browsers**: all eleven pages rendered at 390 and 1280px in
  Playwright 1.64.1's Chromium, Firefox and WebKit, from their own HTML with
  the age-gate script stubbed out. Same elements in all three, nothing wider
  than the screen, no script errors; Firefox's key points, desk, tables and
  COA sheet look as Chromium draws them, text wrapping a word earlier or later
  here and there. Playwright's WebKit on Windows draws Fraunces at the wrong
  weight (300 as heavy as 400) and ignores its optical size, so its headings
  look near-black and wrap differently; the owner's iPhone Safari draws them
  correctly (their screenshot of `/learn/` that day), so that is the test
  browser, as CLAUDE.md's Windows notes warn.
- **Keyboard**: a script tabbed through every page in Chromium and Firefox at
  both widths. "Skip to content" is the first stop everywhere, every stop shows
  a focus style and is on screen when reached. One fault: on phones the guide
  pager moved "All guides" to a row below the previous and next links, so Tab
  went down to it and back up. Under 900px the pager is now one column in page
  order (previous, all guides, next), all left-aligned; the desktop pager is
  unchanged and the markup untouched.
- **Reading time**: `/learn/` now gives intensity-versus-character as
  "6 min read", as the guide itself does (1,360 words; the owner's call). The
  only word changed on these pages since the rebuild.
- **Checked**: the tab script again after the pager change, both engines and
  widths, no stop moving backwards; `bash build.sh`; `bash scripts/gates.sh`.
  Not checked: real desktop Safari, a screen reader.

### /app leaves css/shell, and css/world's section for pages not yet rebuilt goes, 2026-11-18

`/app` was the last page on `css/shell`, the old light stylesheet, repainted
by `css/world`'s section for pages not yet rebuilt. It now links a sheet of
its own, `css/app`, after `css/world`, as every other page does; `css/shell`
and that section are gone. The owner asked for no visible change first, with
design changes after as steps of their own, and for every push, a revert
included, to wait for their OK.

- **`css/app`** holds every value `/app` showed, written in `css/world`'s
  names. Much of `css/shell` styled things `/app` no longer has (the old home
  page's trust strip, steps, family cards and positions, the reading pages'
  cards and boxes, modals, the old profile bar), and most of the rest lost to
  `css/world` - its colours, header, footer, buttons and links - and goes.
  Found dead by reading the cascade: `.button-secondary` and `.button-quiet`
  lost every property to `css/world`'s `.button`; the 720px "QR scan region"
  fix lost to the `[data-page="app"]` rules above it, as did the 520px
  minimum height; `css/shell`'s `.wrap`, footer and menu button rules. What
  `/app` had that other pages do not is kept, and named in `css/app`: header
  and menu links at 650, the call to action 42px tall, the footer headings at
  a 1.2 line height, a skip link that slides in, the 1160px measure.
- **The camera** is one block: the dashed 280px box on wider screens, and
  under 720px the square box with the video pinned in it, which js/nose's
  `fillPreview` sizes with inline `!important` values. Its comment now says
  720px is js/nose's `PHONE`, to be changed together.
- **`css/world`** keeps, in its main body, what every page took from the
  section: the desk (`.result-eq`, `.desk-channels`), the compact phone
  footer, the wordmark's meter, the footer's secondary-text colour, and 3px
  corners on inputs, selects, textareas and tables. Three pages had leaned on
  the section for rules of their own, now in their own sheets: the home
  page's family pictures, swatches and position rows (3px corners) and its
  hero score (weight 400); the B2B demo's light store; the account page's
  detail values (.9375rem) and note corners. `css/agegate`'s "No" hover took
  the section's `--surface-2`: it says `#1B241E`. `css/tokens`' comment no
  longer names `css/shell` and family.css.
- **Checked by computed style**: a script served the commit before (9b53378,
  from a git worktree) and this tree side by side and compared every
  element's computed style, with `::before`, `::after`, `::marker` and
  `::placeholder`, and its box. `/app` in 15 states - the four tabs, a link
  refused as not HTTPS, three cards from the real handler's replies
  (KAY-FLW-002; KAY-CAR-001, a partial panel; MCL-FLW-002, a warning), a
  refused report, a card from "Choose QR image", a saved jar, manual rows
  with an error, smell words and a vote, the word limit, the phone menu, the
  saved block closed, the account message - at 11 widths, either side of
  every breakpoint; the camera running on Chromium's fake camera at 7 widths,
  each from a fresh start, and once resized while running (the box 316px
  square at 390, the video a 419px square at -51,-51, before and after);
  2,454 hover targets and 1,099 keyboard stops; reduced motion; the other 25
  pages at 6 widths; the age gate shown on four pages. In Chromium, Firefox
  and Playwright's WebKit: 4,541 comparisons, no difference in Chromium or
  Firefox. WebKit's three were a sample chip's box when Tab reached it, its
  sideways row scrolled differently; two copies of the commit before do the
  same, at different chips from run to run, so that is WebKit's focus
  scrolling. Set aside and read: the "Add a report" intro line, hidden under
  720px, whose margin there went from 13px to 14px; and the tab row's and
  sample rows' grid columns under 720px, where they are flex rows. Two
  copies of the same commit compared as identical first. Then `bash
  build.sh`; `bash scripts/gates.sh`.
- **A gate follows**: `colour-tokens-test`'s focus-ring check (since
  2026-11-14, "Focus you can see") read `css/shell`'s ring, `#2F6144` on
  `#F3F3EE`, white and the old footer - a ring `css/world` had drawn over
  since the redesign. It reads `css/world`'s now: `--ink` `#F4F1EA`, 16.53:1
  on the field and 15.54:1 on a raised panel. It does not read `css/app`'s
  two green rings, which stay under 3:1 until the design work below.
- **Smaller**: `/app` loads 24.9 KB of CSS where it loaded 49.1 KB (7.8 KB
  compressed, from 12.7); every page loads `css/world` at 8.2 KB, from 12.8
  (2.9 KB compressed, from 4.4).
- **Kept as they were, for design work after** (open.md): the focus rings on
  the card's two inputs and the saved jars' Remove button are `css/shell`'s
  green `#2F6144`, 2.43:1 on the raised panel, under the 3:1 a focus
  indicator needs; that button's hover text is `css/shell`'s rust `#93401F`,
  2.50:1; the vote buttons, the smell words and "Saved palate" name Inter,
  which is not loaded, so they draw in the system face; `#1B241E` and
  `#46554A` are not DESIGN.md's; the labels above two headings ("Palate
  matcher", "Match result"), the boxed panels and three stat boxes, the vote
  emoji, and the result table's sideways scroll on a phone.
- **Not checked before the deploy**: the camera on a real phone -
  Playwright's WebKit on Windows is not Safari, a camera needs HTTPS, and
  there is no preview site. After it (3b753d5, deployed 2026-11-19, CI's
  live-check green) the owner tried their iPhone: the camera works, and
  they scanned a new jar. Still not checked: real desktop Safari.

### A scanned jar is compared with the palate, and the palate is every saved jar, 2026-11-19

The owner scanned a new jar on their iPhone, and the result read "Lemon Tart
Pucker + OG KUSH STORY: JOSH D OG compared with Cold Creek Kush". "Use this
jar" had put the scanned jar into the palate, and the jar compared was still
the default sample. The owner's rule: the palate is the mix of every jar in
Saved palate, and a new jar is compared with it. Asked how a jar now gets into
the palate, they chose two buttons on the card.

- **Two buttons, on the card and in Manual** (js/nose's `useJar`). "Compare
  with my palate" (the primary) makes the jar the new jar for this visit: it
  is kept in `state.compared` and never saved. "Add to my palate" saves it to
  Saved palate, as "Use this jar" and "Save to palate" did. The card's title is
  now "Check this before you use it", its lead "Nothing is added to your palate
  unless you choose to", and the read message "Check the values below, then
  compare or add the jar."
- **The palate is every saved jar** (`savedPalate()`), and the sample, Lemon
  Tart Pucker, only while nothing is saved. That holds on every visit (until
  now each visit opened on the sample alone, and saved jars had to be picked in
  Samples) and after "Add to my palate" (the sample is no longer mixed in). It
  also holds after Delete, Import, Remove and Load from account, which until
  now kept the palate's old picks and left imported or loaded jars out of it.
  The Samples tab's chips still change the palate for the visit.
- **The tests follow the rule.**
  - `input-paths-test` compares the camera's jar (the result reads the sample
    against it, and nothing is saved) and adds the image's and the link's (the
    result reads the saved jars against the camera's jar). It also compares a
    jar from Manual, and opens a new visit (the palate is the two saved jars).
  - Its "jar that is gone" checks now expect the sample after Delete, not an
    empty palate, and the jars brought in after Import and Load from account.
  - `match-feedback-test`'s stand-in state has `compared`.
  - input-paths is clean in Chromium and Firefox, and match-feedback is clean.
  - Rendered at 390px: the card's three buttons stack, then the result and
    Manual's buttons.
- **On the owner's phone**: OG KUSH STORY was saved by the old button, so from
  the deploy it is in the palate; Remove in Saved palate takes it out.
- **CI's first run failed** on 629fad2, so nothing was deployed. Windows skips
  WebKit, and CI's WebKit failed "after Remove, a vote names only the jars on
  screen" with the vote before, the new after-Delete one on Violet Hour.
  WebKit gives a beacon's request no body, so `bodyOf` reads the page's copy,
  and it took the newest, which was the vote before whenever this one's copy
  was not yet kept. The old checks hid this, because their two votes in a row
  had the same jars. adca6aa takes the oldest copy and removes it. WebKit was
  then clean three times on Windows (`NOSE_ENGINES=webkit node
  test/input-paths-test.mjs`, which runs WebKit there), CI was green, and the
  change was deployed on 2026-11-19. On Windows, b2b-widget fails 25 checks in
  WebKit (request headers, Tab order) whatever the change: that is why it
  skips WebKit there.
- **Not checked**: a real phone before the deploy.

### After Compare the page goes to the result, and the new jar's bars carry its name, 2026-11-19

The owner tried "Compare with my palate" on their iPhone once it was live.
The page landed far down, and the second set of bars was labelled "New jar"
rather than with the jar's name. They also asked why Herbal showed nothing for
their new jar.

- **Why the page landed low**: the card is long, and closing it shortened the
  page. The browser kept the scroll offset, which then fell near the footer.
  "Add to my palate" and "Discard" did the same.
- **Now**: Compare focuses "Aroma similarity" (`tabindex="-1"`, focused
  without scrolling, so a screen reader hears where the result is). It then
  scrolls the result to 16px under the 65px sticky header, using `css/app`'s
  `scroll-margin-top:81px` on `#fullResult` and `.inline-message`. Add and
  Discard scroll their message into view the same way.
- **The bars' label** (`#resultCandidateLabel`) is the compared jar's name.
  The markup keeps "New jar" as the default. The family table's column still
  says "New jar", to keep the table narrow.
- **Herbal** is terpinolene, ocimene and farnesene. The result's desk lights
  a whole column at a 60% share (`DESK_FULL`). On a phone a column is 17
  blocks (104px), so a block is about 3.5% of a jar's terpenes, and a family
  under about 1.8% lights none. The table under the result gives the shares
  rounded to 1%. Nothing was changed there.
- **Tests**: after Compare, `input-paths-test` checks that the heading is
  focused and under the header and that the label is the jar's name. After
  every Add or Discard, it checks that the message is in view under the
  header. Clean in Chromium, Firefox and, on Windows with
  `NOSE_ENGINES=webkit`, WebKit. The 390px render after Compare shows the
  result's top under the header.
- **Not checked before the deploy**: a real phone. After it (9690117, CI run
  115 green), the owner tried it on their iPhone: "These changes worked
  great."

### On a phone, COA link goes to its panel, the link box stays above the keyboard, and the family table fits, 2026-11-19

The owner confirmed the scroll to the result and the jar's name work on their
iPhone. Then they used a COA link instead of a scan, and found three problems.
Choosing COA link changed nothing they could see, because the panels sit below
the tab list and Saved palate, which on their phone holds 16 jars. When they
tapped the link box, the keyboard covered it, so pasting was hard. And the
family table under the result needed a sideways scroll.

- **A chosen tab's panel comes up** (js/nose's `revealPanel`, on phones only,
  720px wide or less, as `PHONE`). COA link, Samples and Manual scroll their
  panel to 16px under the sticky header, using `css/app`'s
  `scroll-margin-top`, which now covers `.input-panel` too. Scan QR keeps
  `revealScanner`, which waits for the camera.
- **The link box**: when it is focused on a phone, its panel goes up at once
  (`behavior:'instant'`, so it does not race the keyboard's own scroll). The
  box then sits at about 270px down a 932px screen, above where the keyboard
  opens. This has not been seen on an iPhone, because a test browser cannot
  show the keyboard.
- **The family table** had `min-width:560px`, from `css/shell`. That is gone,
  and on a phone its cells have 8px sides. It now fits at 320, 390 and 430px
  with no sideways scroll. Its column still says "New jar".
- **Tests**: `input-paths-test`'s phone block saves 16 jars. It checks that
  the panel lands under the header after COA link is chosen and after the box
  is focused. It also checks that the table is no wider than its box at 390
  and 320px. Clean in Chromium, Firefox and WebKit. Rendered at 430px: the
  panel under the header, and the table whole.
- **Not checked before the deploy**: a real iPhone, its keyboard above all.
  After it (081cde9 with bf00ca8, CI run 116 green), the owner tried COA
  link on their iPhone: "It works great."

### After Compare, the result offers "Add to my palate", 2026-11-19

The owner reported that the COA link fixes work on their iPhone. They found
one gap: after Compare there was no way to keep the jar they had just
compared.

- **The button** (`#resultAddButton`, primary) sits under the score's
  explanation. It shows only while the jar being compared came through
  Compare and is not saved (`state.compared`). A sample or a saved jar being
  compared gets no button.
- **Pressed** (js/nose's `addComparedJar`): the jar joins Saved palate
  (`nose-palate-v1`), and the palate becomes every saved jar. A message
  replaces the button (`#resultAddMessage`, `tabindex="-1"`) and is focused,
  so a screen reader reads it. The comparison stays on screen as it was made,
  and the next comparison counts the jar in the palate. Until then the jar
  being compared is the default sample. That way a later redraw (a chip,
  Remove, an Add from the card) does not score the jar against a palate that
  now holds it.
- **Tests** (`input-paths-test`):
  - no button while a sample is being compared, and a button after a Manual
    Compare;
  - pressing it saves the jar, says so, focuses the message, and keeps the
    result's names;
  - the next Compare reads "Liked jar compared with Next jar", with the
    button back and the message gone.

  Clean in Chromium, Firefox and WebKit. Rendered at 390px before and after
  the press.
- **Not checked before the deploy**: a real phone. After it (0ca36b0,
  deployed 2026-11-19, CI's live-check green), the owner tried their iPhone
  and reported that everything works as intended. That covers both
  "Compare" and "Add" buttons, the result's "Add to my palate", and the
  fixes recorded above it.

### /app's focus rings, colours, faces and header follow DESIGN.md, 2026-11-19

The owner asked for items 1 to 5 of the list kept when `/app` left
`css/shell` (open.md).

- **Focus**: the card's two kinds of field and Saved palate's Remove button
  lose `css/shell`'s green ring (`#2F6144`, 2.43:1 on raised). They take
  `css/world`'s instead: 3px ink, offset 3px, 15.54:1.
- **Remove's hover** turns ink instead of rust (`#93401F`, 2.50:1).
- **Faces**: the vote buttons, the smell words and "Saved palate" named
  Inter, which the site does not load, so they drew in the system face. They
  now use the body face, Hanken Grotesk, at the same weights (600, 650, 650).
- **Colours**: every colour in `css/app` is now one of `css/world`'s tokens.
  - **Form fields** take a soft border. This was the owner's choice when
    asked: rule would be 1.5:1 on raised, the old `#46554A` was 2.22:1, and
    soft is 7.91:1. It covers every select, input and textarea, the camera
    picker, and the jar name and the card's value boxes, which had rule.
    DESIGN.md now says so.
  - The smell words and the camera box's dashed outline take rule.
  - The fills that were `#1B241E` (messages, the three stat boxes, the
    coverage line, the camera box) take field.
  - A pressed sample chip on a phone takes raised, and a hovered chip gains a
    soft border instead of a fill.
  - The age gate's "No" button takes field on hover, which is DESIGN.md's fill
    for a secondary button.
  - The old green's faint glow on a pressed sample chip is gone. So is the
    partial-coverage outline's `#8A8377`, now soft at 45%.
- **Header**: `/app`'s links at 650 and its 42px call to action are gone.
  The computed weight, size and height now match the home page's: links at
  450, 15px and 44px, the call to action at 600, and phone menu links at 450,
  17px and 48px.
- **Checked**:
  - The computed style of every element was compared before and after in
    Chromium: `/app` in its states, its hovers and keyboard stops, and the age
    gate on four pages. That is 1,057 comparisons.
  - Every difference falls under the changes above: border and background
    colours, the font family (and the widths, heights and origins that follow
    from the new face), the header links' weight, the call to action's height,
    the Remove button's focus outline and hover colour, the chip and coverage
    box shadows, and the layout below them moving by a few pixels (the app
    grid's rows, the footer).
  - The gate itself shows no difference.
  - The focus ring on the card's fields, which the keyboard pass does not
    reach, was rendered at 390px.
  - colour-tokens, page-chrome and input-paths are clean.
- **Left for design work**, in open.md:
  - the labels above two headings, the boxed panels and the vote emoji;
  - two things found while doing this: success and error messages are
    bordered in pine and spice, which DESIGN.md keeps for families, and the
    form fields on the account page and the dispensary demo still have rule
    borders.
- **Deployed**: cfeb125, CI run 118 green (gates, promote, live-check).

### The labels above /app's headings go, and the result's three boxes become readouts, 2026-11-19

The owner took items 6 to 8 of that list as suggested, except the vote emoji,
which stay.

- **The labels above headings**: "Palate matcher" over "Compare the profile,
  not the name." and "Match result" over "Aroma similarity" are gone, and so
  are their `.eyebrow` rules. DESIGN.md says "no eyebrow above a heading", and
  no other page had one. Each heading already says what its section is.
- **The three stat boxes** (Shared backbone, Biggest difference, Confidence)
  are now readouts, as DESIGN.md describes them: a plain label and its value,
  on a hairline, with no fill.
  - The label is soft at 13px (it was 11px, under DESIGN.md's floor) and the
    value is at 650.
  - Label and value sit side by side, the label in a 10.5rem column. At 520px
    wide and under, the label sits over the value, as on the card's readouts.
  - The ids are unchanged, so the tests that read them still pass.
- **The vote emoji** stay, the owner's call. DESIGN.md now says so, as the
  one colour outside the six families.
- **The boxed panels** are not changed. A 390px mock shows them unboxed: the
  left column, each tab's panel and the result as sections on the field,
  opened by a hairline, with the saved jars still boxed as jars. The owner is
  to choose.
- **Found**: text under DESIGN.md's 13px, listed in open.md: the tabs, the two
  tables' headings, the card's labels, the chips' second lines, Remove and the
  scanner note.
- **Checked**: colour-tokens, page-chrome and input-paths are clean. Before
  and after were rendered at 390px (the top of the page, and the result) and
  at 1280px (the readouts side by side).
- **Deployed**: 2b7f9ca, CI run 119 green (gates, promote, live-check).

### /app's panels lose their boxes, 2026-11-19

The owner chose the unboxed panels from the mock, and asked to see pictures
of the build before it was pushed.

- **The six boxes** (the left column, the four tabs' panels and the result)
  lose their border, fill and corners. Each is now a section on the field,
  opened by a hairline (`.card{border-top:1px solid var(--rule)}`), with no
  side padding, so its content lines up with the page title. On a phone that
  gives about 30px of width: the four tabs fit on one row and the bars widen.
- **Space**: on a desktop the two columns are 56px apart (they were 24px). The
  sections stack 32px apart under 900px wide and 28px apart on a phone. The
  result opens 40px below its panel (28px on a phone). The input panel's
  465px minimum height went, since without a box it left an empty gap.
- **Fills that sat on a raised box and now sit on the field**: messages and
  the camera box take raised, so they still stand apart from the page.
- **Still boxed**, as DESIGN.md allows for "a jar" and "a report": the saved
  jars, the report card ("Check this before you use it", raised on the
  field) and the coverage line inside it.
- **Found**: the tab buttons carry an arrow on wider screens, and DESIGN.md
  says no arrows in button text. It is in open.md.
- **Checked**: colour-tokens, page-chrome and input-paths are clean in
  Chromium, Firefox and WebKit, the phone checks included (a tab's panel and
  the link box under the header, the table fitting). Before and after were
  rendered at 390px (the top, the result, the COA link panel with its message
  and the report card) and at 1280px (the top and the result).
- **Deployed**: 4c23538, CI run 120 green (gates, promote, live-check).

### /app's last departures from DESIGN.md go, 2026-11-19

The owner said to continue with the rest of the list in open.md.

- **Tab arrows**: the four tabs lose their "→" (shown on wider screens,
  hidden on a phone). DESIGN.md says no arrows in button text.
- **Messages**: success and error messages were bordered in pine and spice,
  and DESIGN.md says no family colour marks a status. An error now has an
  ink border and a success a soft one; the words say what happened.
  DESIGN.md has a line on messages now. No other page used a family colour
  as a status.
- **Form fields elsewhere**: the account page's fields and the dispensary
  demo's selects and textarea take the soft border DESIGN.md now gives form
  fields, and turn ink on hover (they were rule, turning soft).
- **Text under 13px** is raised to 13px: the tabs under 900px wide, both
  tables' headings (11px), the card's labels, the sample chips' second lines,
  Remove and the scanner note (12px). On a phone the tabs' sides go from 14px
  to 12px so the four still fit one row at 390px. At 390px wide and under,
  the family table's cells go to 6px sides so it still fits 320px.
- **The family table**: a rise in the Difference column carries its "+"
  (js/nose's `signedPoints`), and the jar's name heads its column
  (`#resultCandidateHead`), as over its bars.
- **Found**: only the home page and `/app` have the phone menu button. The
  other pages' header shows its links in a row that runs off a phone's
  screen. It is in open.md, not changed.
- **Checked**: match-feedback, colour-tokens, page-chrome and input-paths are
  clean, input-paths's phone block included (the table no wider than its box
  at 390 and 320px). Rendered before and after at 390px: the top (four tabs on
  one row), the result's table, the COA link message and card, and the
  account page's fields. Also rendered at 1280px.
- **Deployed**: 8bb8f67, CI run 121 green (gates, promote, live-check).

### Every page gets the phone menu, 2026-11-19

Only the home page and `/app` had DESIGN.md's bordered menu button on a
phone. The other 23 pages, stamped from `partials/header.html`, showed their
links as a second row under the logo that scrolled sideways. At 430px it cut
off at Account, and "Match a jar" sat beyond the edge until swiped. Shown
pictures of both, the owner chose the menu button everywhere.

- **`partials/header.html`** now carries `has-menu`, the menu button and
  `#mobileMenu`, the same markup as `partials/header-app.html`.
  `scripts/stamp-chrome.js` marks `aria-current` on both sets of links, the
  row and the menu, so a page's own link is marked in the menu too. The two
  partials stay separate because `/app`'s links are still marked by js/nose,
  by path.
- **js/menu** (new, fingerprinted by build.sh and syntax-checked with the
  rest) opens and closes the menu on every page with the header. Focus goes
  to the first link, Tab stays in the menu while it is open, Escape closes it
  and gives focus back to the button (new: focus used to stay on a hidden
  link), and a route change in `/app` closes it.
- The same code left js/nose (`toggleMenu`, `closeMenu`, `trapOpenFocus`, its
  keydown listener), so the menu has one home. Every page with the header
  loads js/menu, deferred, just before `</body>`. b2b/demo has no header and
  no js/menu.
- **css/world** drops the swipe row's rules (`.site-header:not(.has-menu)`).
  No page has that header now.
- **Tests**: `page-chrome-test` expects both headers to carry the menu, each
  page's `aria-current` twice (the row and the menu), one nav order in both
  phone menus, and js/menu on every page with the header. `input-paths-test`'s
  phone block opens `/learn/`: the links row is hidden, the button opens the
  menu with focus on Aroma families, and Escape closes it back to the button.
  Clean in Chromium, Firefox and WebKit.
- **Rendered** at 430px: `/account/`, `/learn/` and `/aromas/citrus/`, closed
  and open, with no page errors.
- **Not checked**: a real phone.
- **Deployed**: d0908ab, CI run 122 green (gates, promote, live-check).

### Real reports become public fixtures, and every real scan can be exported at once, 2026-11-19

The owner chose to check the parser against the real scans. The archive held
75 documents: 59 seeded fixtures and 16 real scans. No real scan had ever
become a fixture; the last fixture was added on 2026-09-06.

- **PARSER-HANDOFF §9, decided by the owner**: real lab reports join this
  public repo as fixtures, as the first 56 did. A private repo for new
  reports, and rewriting history to take the 56 out, were offered. Weighed: a
  public fixture shows which jars were scanned and republishes a lab's
  document. The `.gitignore` rule that kept new PDFs out of `git add` is gone,
  and CLAUDE.md says so.
- **`export-candidate.js --real`** exports every document the seed did not
  store (`nose.parses.context` never `seed`: the live site's scans, and any
  backfill) as `candidate-<first 8>`. Each gets a PDF and today's extracted
  text, in `test/fixtures/candidates/`.
  - The gates count only `test/fixtures/pdf/`, so a candidate waiting for its
    hand check fails nothing.
  - One already exported is left as it is; one with no PDF is named and
    skipped.
  - Until now each was exported by fingerprint, and none ever was. The review
    queue lists only refused or novel readings, so a real scan read quietly,
    right or wrong, never came up. Those are the "accepted but wrong" pile §10
    says matters.
  - The per-report hint now points a named fixture at `test/fixtures/pdf/`,
    wherever the candidate was written.
- **`rerun-test`**: a live-site scan beside the seeded ones; `--real` exports
  only it, into the candidates folder, and a second run leaves it as it is.
- **Next**: the export runs in the owner's Codespace, which holds the
  archive's secrets, and the candidates come here on a branch. Each is
  compared with its PDF, sorted (looks right, refused, accepted but wrong),
  named `LAB-FORM-NNN`, and its expected values are written by hand (§10).

### The first 14 real scans become fixtures, and a below-limit sign printed apart reads as 0, 2026-11-19

Run from the owner's Codespace, through the browser: `git pull`, then
`export-candidate.js --real`. Of 16 real scans, 14 were exported and 2 were
skipped: documents #3 and #184 have no PDF in Blobs. The 14 came here on a
branch, `real-scans`, which carries them only and is never merged.

- **The hand check.** Each PDF was read page by page beside the parser's
  reading: every terpene row, the printed total, strain, batch, lab ID,
  product class, moisture and water activity.
  - Looks right, 12: eight Kaycha (six flower, a live badder, a live sauce)
    and four Method (three flower, a live rosin cartridge).
  - Refused: none.
  - Accepted but wrong, 2: both Modern Canna flower. Their template prints
    the below-limit sign apart from its number, and the parser read the
    number (§11, "A below-limit sign printed as its own text item"). On
    E85, nerolidol 0.10692 where the report says 0.102; on Nirvana #6,
    nerolidol 0.08542 for 0.0805 and ocimene 0.00492 for below the limit.
    Both carried the warning that the report's arithmetic does not close
    (104.6%, 104.0%); their rows add up to the printed total.
- **Names**, in document order: `KAY-FLW-004` to `-009`, `KAY-LRS-007` and
  `-008`, `MTL-FLW-005` to `-007`, `MTL-CAR-002`, `MCL-FLW-006` and `-007`.
  Each baseline was typed from the PDF, and a script only added the figures
  up. Two of the typed figures were a digit out, both in rows outside the
  model (a fenchone, a geraniol), and the mg column settled both for the
  parser.
- **The fix**: `normalize()` glues a lone `<` or `≤` to the number on the
  next line. No earlier fixture has a lone sign. The first 59 read the same
  before and after: the gate, parity, and the mutation harness (262 absorbed,
  151 rejected, 35 changed on both parsers).
- **`reparse.js --dry-run`** in the Codespace, with the change applied as an
  uncommitted patch: 75 documents, 73 unchanged, 2 values changed (the two
  Modern Canna), 0 accepted to rejected, 0 rejected to accepted. The
  Codespace's packages predate `undici` (in the lockfile since 2026-11-17),
  so that run took it from a folder in `/tmp`. Its own `node_modules` were
  left alone, because `npm ci` would remove its Playwright.
- **Counts**: 70 accepted / 3 rejected of 73 fixtures, 70 match / 0 differ,
  43 mutation failures of 560 cases. All 8 new failures are
  `blankNonDetects` on the eight Kaycha reports. `gates.sh`, CLAUDE.md and §2
  carry the new counts, and §2's `readBy` table was counted again, since it
  had drifted.
- **Three tests pin facts per fixture** and each took the 14:
  - `coa-dates-test`: each report's finish day, and the Kaycha eight's
    harvest day from their Harvest/Lot ID, typed from the PDFs.
  - `archive-wiring-test`: 66 of 73 show all three signs of a lab report,
    the 14 among them.
  - `b2b-store-test`: 70 accepted stored as read, 68 of 73 with a finish day.
- **Not done**: water activity on Modern Canna is still not read (printed
  0.54 and 0.51; the parser leaves that row alone by design). §9's fourteen
  other mutation failures are 6 `shuffleValues`, 7 `pageNumbers` and 1
  `glueNames`, not 14 `shuffleValues`. Both are in open.md.
- **After the push** (gates, promote and live-check green; `live` at
  `8989f8c`), the Codespace's packages were brought up to date at the owner's
  word (`npm ci`, then CLAUDE.md's Playwright line), and `reparse.js` ran for
  real: run #25, parser `8989f8c`, 2026-11-20 (UTC). 75 documents: 73
  unchanged, 2 values changed (E85 and Nirvana #6, as the dry run said), 0
  accepted to rejected, 0 rejected to accepted, 0 failed.

### Reports from The Flowery's site become fixtures, from 73 to 100, and a new lab, 2026-11-23

The owner asked for at least 27 more real reports, flower and extracts, from
The Flowery's own site (theflowery.co), and for the parser to be fixed wherever
one read wrong: the loop of "The first 14 real scans become fixtures", with the
site as the source. Run from 2026-11-20 to 2026-11-23 on the owner's PC, the
dry runs in the Codespace through the browser.

- **The site**: robots.txt (it disallows only /cart, /verify, /checkout,
  /profile/ and /age-gate) and the terms read first; the terms sit behind the
  age gate, which the owner allowed, and speak to Florida patients, which the
  owner read and said to continue. Products come from the site's own catalog
  route, each product page names its report, and the PDFs sit on the
  platform's public S3 bucket - fetched by name only, never by walking ids,
  since the bucket holds other dispensaries' files. One request at a time, a
  generic user agent, curl at most 50 a minute. The inventory and the PDFs not
  chosen stay in a folder outside the repo, for later batches.
- **The survey**: 1,807 files, of which 34 are ZIP archives under a `.pdf`
  name (left unopened) and 1,773 are reports, every one with a terpene panel:
  Kaycha 1,635 (AIO 36, cartridge and pod 432, flower 440, concentrate 630,
  pre-roll 92, five unclassed), Modern Canna 132 (flower 96, pre-roll 23,
  concentrate 5, pod 2, six unclassed) and CTND 6. No Method, ACS or TerpLife:
  The Flowery sends its jars to Kaycha and Modern Canna, and sent six to CTND
  in December 2023. 14 were already fixtures, byte for byte.
- **Chosen, 27**, each hand-checked against its PDF (every terpene row, the
  total, strain, batch, lab ID, class, moisture, water activity), its baseline
  typed from that reading, readBy and warnings taken from the parser only
  after checking them:
  - batch 1 (`b642c8e`): `KAY-PRR-002`, `-003`, `KAY-AIO-005` to `-007`,
    `KAY-CAR-005` to `-007`, `KAY-LRS-009`, `-010` - Kaycha 2026 templates;
  - batch 2 (`7c05f71`): `MCL-PRR-001`, `-002` (the first Modern Canna
    pre-rolls), `MCL-FLW-008` (juniors), `KAY-LRS-011` (a sauce);
  - batch 3 (`3be629e`): `KAY-FLW-010`, `-011`, `KAY-LRS-012`, `-013`,
    `KAY-CAR-008` (Kaycha's Davie licence, 2023-2025), `MCL-LRS-002`
    (Modern Canna 2023);
  - batch 4 (this commit): `CTN-LRS-001` to `-003`, `CTN-CAR-001`,
    `CTN-FLW-001` (CTND, a new lab code), `MCL-CAR-003` (a 2023 Modern
    Canna pod), `KAY-CAR-009` (a December 2022 Kaycha pod, the oldest).
- **Parser changes**, each in §11, every earlier fixture reading as before:
  a total that counts only the quantified rows, read ten times high, and a
  refusal when two unit columns each fail to close; a pen and a pod read as
  concentrates; a sauce and flower juniors read as `unknown`; a figure above
  100 slid a row out of its column (and `KF2025-046-PB-AU-COA`'s baseline
  had lacked farnesene, typed again); CTND's top-five summary won over its
  panel, with three spellings and its sign-off date. Five reports were
  accepted but wrong before these: `KAY-PRR-002`, the pen, the pod,
  `CTN-LRS-001`, and `KF2025` already in the corpus.
- **Counts**: 97 accepted / 3 rejected of 100, 97 match / 0 differ, corpus
  clean, 61 mutation failures of 776 (the 18 new since 2026-11-19 are three
  `pageNumbers` and fifteen `blankNonDetects`); the methodology page's
  "Close match" share moved to about three times in ten (batch 2).
- **Dry runs**: batch 1 and batch 2 each 75 documents, 75 unchanged, before
  their pushes. The real `reparse.js` for them waits for the owner's word,
  and batches 3 and 4 wait for their own dry run and push.
- **Skipped or left**: a Kaycha row with a blank LOD cell (12837, farnesene
  0.011) - reading it cost five mutation verdicts, reverted; 11315, correctly
  refused (its rows reach 76.5% of its total) but with a sentence that blames
  the reading; the second CTND Persy Sauce (adds nothing); CTND moisture
  (limit and result both in range, left null) and its strain, batch and
  sample-ID labels; Kaycha's J-flagged rows read as values against rule 5,
  for the owner. All in open.md. About 1,730 reports remain in the
  inventory, mostly Kaycha templates the corpus already has.

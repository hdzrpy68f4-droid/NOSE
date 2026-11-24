# Open items

What is known and not yet done, moved here from PARSER-HANDOFF.md on 2026-11-14 (M7), unchanged: §13's and §14's Still open lists, then §14's Later. A closed item comes off this file in the same commit that closes it.

## Reports from the St. Petersburg stores: what is left (2026-11-24)

A local read of 26 reports from five stores refused 12; the fixes and the
three fixtures are in PARSER-HANDOFF.md §11, "Twelve refused reports, three
faults". The PDFs are in `coa-crawl-out\` (git-ignored); only `01`, `08` and
`19` became fixtures (`MTL-FLW-008`, `MTL-AIO-001`, `TLL-FLW-001`); `02`, `06`,
`07`, `09`, `10`, `16`-`18` and `20` print the same layouts and now read.

- **Live, reparsed.** On `main` as `9518bc8` (CI, promote and live-check
  green); reparse run #27 at that parser, 2026-11-24: 75 documents, 75
  unchanged, 0 failed - the archive holds no Method six-page or TerpLife report
  of these kinds, so it proves only that no other reading moved. The first
  Method autumn 2026 or TerpLife scan that arrives is the live check.
- **Method's J rows are not read; Kaycha's are.** A cell such as `0.00300 J`
  (detected between the limit of detection and of quantitation) is not a
  result token in the forward look-ahead: the same made-up row reads 0.003
  without the J and is dropped with it. Kaycha's J rows are read as printed
  (the item below, the owner's call). `MTL-AIO-001` pins the Method side:
  its alpha-Humulene (0.00300 J) is absent, and the reading closes at 99.8%
  of 4.46. Deciding the Kaycha item decides this one too.
- **Method's autumn 2026 finish day is printed and not read.** Its
  "Completion Date:" label sits apart from its value, and the sign-off is a
  name, a date and "Lab Director" on separate lines, not the one-line
  "name - Lab Director" the rule reads. `testedOn` is null on `MTL-FLW-008`
  and `MTL-AIO-001`; so are strain, batch and lab ID (labels apart from their
  values, as on `Method_DulceDeUva_flower`). Reading them needs
  `test/date-probe.js` and its own change.
- **Method's six-page reports are read from the top ten.** The full panel is
  cut (§6); the summary reads at 95.5-99.8% of the printed total on the seven
  reports. The panel's smaller rows are not in the fingerprint.
- **Trulieve's kief reads as flower** (a Modern Canna report whose
  "Sample Matrix: Kief" sits over "Testing Matrix: Usable Whole Flower
  Marijuana"; the flower rule matches the second). Recorded, not changed: no
  fixture and none of 1,773 saved reports mentions kief, and the report's own
  testing matrix says flower. `Matrix:\s*Kief\b` as a concentrate word would
  fix it if a second report shows up.
- **A refusal sentence that says more than it knows.** A stray figure above a
  colon "Total Terpenes:" with no total printed anywhere (made up, not seen)
  is joined as the total and then refused for adding up to "more than the
  total this report prints". It fails closed; only the wording is off.
- **TerpLife's moisture** is still unread (§9): `TLL-FLW-001` prints 13.1 and
  reads null.

## Reports from The Flowery's site: what is left (2026-11-23)

The loop is done: 27 reports joined from theflowery.co between 2026-11-20 and
2026-11-23, the corpus is 100 (97 accepted), and the record is 13-records,
"Reports from The Flowery's site become fixtures, from 73 to 100, and a new
lab". What remains:

- **Deployed and reparsed.** All four batches are live (`b642c8e`,
  `7c05f71`, `3be629e`, `b11353c`; CI, promote and live-check green), each
  pushed after a dry run. The real `reparse.js` ran once at the end, at the
  owner's word: run #26, parser `b11353c`, 2026-11-24 (UTC), 75 documents,
  73 unchanged, 2 values changed (ACT's Purple Brulee gained its farnesene,
  0.2284, total unchanged - the scan behind `KF2025`; ACT's Apple Burst now
  reads `multicolumn`, values unchanged), 0 accepted to rejected, 0 rejected
  to accepted, 0 failed. Nothing is left to deploy from this loop.
- **Where things are**, outside the repo: `C:\Users\chris\Documents\flowery-coas\`
  - `pdf/<S3 id>.pdf` as downloaded (never edited), `text/`, `inventory.tsv`
  (1,807 rows: URL, SHA-256, lab, class, strain, batch, dates, the parser's
  reading, duplicates), `tools/` (the scripts, and the hand readings in
  `tools/hand/`). Never commit the inventory or a PDF not chosen. 34 of the
  files are ZIP archives under a `.pdf` name: left unopened, never run.
- **The site route**, if more are wanted: the age gate passed in Chrome with
  the owner's permission (robots.txt keeps crawlers off `/age-gate` itself);
  the terms are for Florida patients, which the owner read. The catalog is the
  site's own `/api/platform/products?page_size=150`; older products only from
  their pages, crawled in the browser (`tools/crawl-slugs.txt`, results in
  that tab's `localStorage` key `__crawl_results`). PDFs sit on Salve's public
  S3 bucket: fetch by name, never enumerate ids - it holds other
  dispensaries' files. One request at a time, a generic user agent.
- **About 1,730 reports remain**, all Kaycha or Modern Canna except one
  CTND (a second Persy Sauce, left as adding nothing), mostly templates the
  corpus has. No Method, ACS or TerpLife report is on the site.
- **Kaycha's J rows and rule 5.** §4 says a value below the limit of
  quantitation is 0. Since July 2026 Kaycha prints a figure with the qualifier
  J for rows between the two limits, and the parser reads it as a value; the
  baselines typed on 2026-11-19 (`KAY-FLW-004` to `-009`) and since keep
  them, as printed. Reading them as 0 would change those fixtures and is the
  owner's call.
- **A late-July 2026 Kaycha report says its arithmetic does not close**
  (`KAY-PRR-002` 110.1%, `KAY-AIO-007` 102.8%). Under the lab's rule for those
  weeks - the total counts only the quantified rows - it does close. The
  warning is literally true; a sentence for this case is its own change.
- **Known and left in the parser**: a Kaycha row with a blank LOD cell is lost
  by the multicolumn reader (12837, a 2023 pre-roll, farnesene 0.011); lining
  short rows up from the right fixed it and cost five mutation verdicts, so it
  was reverted. 11315 (Kaycha 2023 flower) is refused correctly - its own rows
  add up to 76.5% of its printed total - but the sentence says the table "was
  not read completely". CTND's moisture ("Moisture / 15 % / 11.8 %", limit
  then result, both in range) reads null on purpose, and its "Cultivar(s):",
  "Batch No.:" and "Sample ID:" labels are not read.
- **`archive-wiring-test`'s "both writes hang" check** failed on this PC on
  2026-11-20 whenever `parse-coa.js` differed from the last commit (about
  2,900 ms against 2,400), and on 2026-11-23 the same tree passed it and all
  the gates: it tracks the state of this PC, not the code. Cause not found.
  Watch it in the gates; CI runs Linux.

## §13, the archive and the app: still open

- **A scan made while the database is down is neither capped nor checked
  against `withheld`**: the database answers neither, so its PDF is written,
  for backfill (§13, "What gets kept"). `backfill-from-blobs.js` then refuses
  a withheld one and names it, and `remove-document.js` deletes it.
- **The cap bounds a day, not the total.** At 100 new documents a day, the
  worst a day can add is about 25.6 MB of text to the database (256KB each;
  the free plan's 500 MB would have lasted about 19 such days; Pro, since
  2026-11-15, includes more - read the project's Usage page for the figure) and 1.2 GB of PDFs to
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
- **The static preview keeps its own copy of the maths** (it is not in this
  repo, §13 above). `match-test.js` cannot see it; a preview built after
  today should load `js/match-math.<hash>.js` rather than carry a copy. Its
  copy predates `shownScore()`, so until it is rebuilt that way it rounds.
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
- **Rotating the phone after the camera starts leaves the scanner reading
  part of the frame** (13-records, "The camera works on the owner's iPhone",
  2026-11-17): the library measures the video once, when it starts playing;
  `fillPreview` resizes it on a window resize, after that. Pressing "Restart
  camera" measures again. Not seen; follows from the library's code.
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
- **The rebuilt reading pages have not been seen in real desktop Safari, nor
  read by a screen reader.** Chromium, Firefox, Playwright's WebKit, the
  owner's iPhone and a keyboard pass have been (13-records, "The reading pages
  after the rebuild"). Playwright's WebKit on Windows draws Fraunces wrongly,
  so it cannot stand in for Safari's look.
- **The Codespace's Netlify token expires about 2027-02-12** (made
  2026-11-14, 90 days). `archive-health` and `reparse --reextract` then fail
  with a 401: make a new personal access token in Netlify (User settings,
  Applications) and update the repository's Codespaces secret
  `NETLIFY_AUTH_TOKEN`, then restart the Codespace.
- **The weekly live check stops after 60 days without repository activity.**
  GitHub switches off a scheduled workflow in a public repository then, and
  emails the owner first; "Enable workflow" under Actions turns it back on.
  Not read from GitHub's page in this session: confirm the wording there.
- **A push that changes `.github/workflows/` may stop promote** (above,
  "Every gate on every push"). GitHub's token takes no `workflows`
  permission - the workflow syntax page lists none - and two reports show
  GitHub refusing a push by an app's token that brings in a change to a
  workflow file: "refusing to allow a GitHub App to create or update workflow
  `.github/workflows/release.yml` without `workflows` permission" (Panther's
  help centre, "When trying to sync panther-analysis, I see the Github error
  'Failed to push some refs'"), and a MongoDB ticket of 2026-09-03, PYTHON-6076,
  fixed by giving its token that permission (both read 2026-10-15). GitHub's
  own pages do not say which pushes it checks. Making `live` at `4a6e081`,
  the commit that adds the workflow, was accepted on 2026-10-16 (above,
  "Live"); moving `live` forward across a later change to it has not been
  tried. If promote fails that way, the
  site stays where it was; after a green run, move `live` by hand from the
  Codespace - `git fetch origin`, then `git push origin origin/main:live` -
  a fast-forward the ruleset allows. A token that can do it is a secret,
  which this workflow has none of: its own prompt.
- **That Netlify hears a push made by GitHub's token is seen, not
  documented.** GitHub's pages say such a push starts no workflow run, and
  nothing about other apps; on 2026-10-16 Netlify deployed `live` by itself
  after promote moved it (above, "Live ... step 5"). If a later green run
  moves `live` and no deploy follows, that has changed: Deploys → Trigger
  deploy → Deploy project builds `live` by hand meanwhile.
- **The actions are pinned to commits, and Dependabot proposes newer ones**
  since 2026-11-14 (`.github/dependabot.yml`: weekly, npm and
  github-actions). A pull request of its that moves a pin changes the
  workflow file, so the promote item above applies to it. Whether Dependabot
  alerts are switched on is a repository setting nobody has confirmed:
  Settings, then Code security.
- **The fixed 500 has not been seen live.** Offline, two forced throws give
  it (above, "coa.js in the current format"); live, nothing is known to
  throw, and making one would mean shipping a fault. The `null` curl shows
  the 400 live.
- **Two time limits are left, one per library folder.** `lib/archive.js`'s
  `bounded(work, ms, label)` is CommonJS and puts its label in the message
  the archive logs ("pdf write timed out after ...ms"); `netlify/lib/http.js`'s
  `within(promise, ms)` is an ES module, and its message reaches no reply or
  log. M3 named only the two `within()` copies; one helper for both needs the
  folders merged, which is its own prompt (above, "One set of server
  helpers").
- **Three body readers are not `readJsonBody`, on purpose.** `coa.js` reads
  an empty body as `{}` and answers with its own sentence; `palate-sync.js`
  allows 262144 characters and answers 413 with a message; `b2b-catalog.js`
  counts bytes while reading and never holds more than 4 MB. Each has its own
  replies, so none was moved; the one-copy check in
  `test/archive-wiring-test.js` looks for a second `function readJsonBody`.
- **The 60s Netlify gives a synchronous function is not used.** NOSE's own
  10s budget, the chain's 8s and the archive's 2s stay as they were; using
  more is its own decision, and the documented limit is now the one that
  applies to `coa.js` (above, "Comments that match the code").
- **The first confirmation email went to junk** (2026-11-16, the owner's
  second address; 13-records, "A sign-up tested on the live site"). SPF, DKIM
  and DMARC (`p=none`) are in place, and since the same day the email's
  link points at nose-app.com, not Supabase ("Email links that come to
  NOSE"). Whether that is enough is not known: the sending domain is days
  old, and a mail provider's trust in one grows with mail that is opened.
  The reset email with the new link arrived in the **inbox** on 2026-11-16
  and its link set a new password (the owner's test). A sign-up
  email with the new link followed the same day: its link opened the
  confirmation page and the button confirmed the address (the owner's test).
  It landed in the inbox too. Both links are proven; what
  stays open is only whether mail keeps reaching the inbox as more is sent.
- **Since 2026-11-16 the login emails no longer show Supabase the clicker's
  IP address** (13-records, "Email links that come to NOSE"): the two
  templates link to this site. It holds only while the templates do: "Reset
  template" in the dashboard, or a new template (invite, magic link, email
  change - none is used), puts Supabase's own link back, and the privacy
  page would then be wrong.
- **Two real scans have no PDF** (documents #3 and #184, found 2026-11-19 by
  `export-candidate.js --real`): kept before PDFs were, or their PDF write
  failed. Neither can be checked by hand or become a fixture unless its jar
  is scanned again.
- **`export-candidate.js --real` would export the first 14 again.** It skips
  a scan only when its `candidate-<first 8>` files exist, and those 14 now
  live in `test/fixtures/pdf/` under their fixture names. Each fixture PDF is
  byte for byte its archived document (same SHA-256), so skipping a document
  whose fingerprint matches a fixture PDF would end it. Until then, ignore a
  candidate whose first 8 match a fixture's SHA-256.
- **Modern Canna's water activity is never read** (13-records, "The first 14
  real scans become fixtures"). `parse-coa.js` leaves the "Activity of Water
  (Aw)" row alone on purpose: an older template printed the figure three
  lines after the label, behind an SOP row, and matching the label read the
  dilution, 1. The November 2026 template prints the figure first (0.54 on
  `MCL-FLW-006`, 0.51 on `MCL-FLW-007`), but its detection limits (0.040)
  pass the same range check, so reading it takes a change of its own; until
  then null, honestly "not read".
- **The mutation harness's `cosmetic/pageNumbers` silently changes ten
  fixtures** (found 2026-11-19, seven then; `KAY-LRS-010`, `KAY-LRS-011` and
  `MCL-FLW-008` joined 2026-11-20; §9 had them down as `shuffleValues`): a
  page-number line moves one value - `KAY-LRS-006` limonene 1.22 to 0.02,
  `KAY-CAR-001` terpineol and alpha-pinene to 0, nerolidol on `KAY-FLW-001`
  and `Kush_Creek`, and three more. The same on the parser before that day.
  The mutation copies a real fault: "1 of 6" was once read as a terpene
  value.

---

- **`b2b-vote` has no edge rate limit** (since 2026-11-15, "Five rate limits on
  Netlify Pro"): a pinned release calls it at `/.netlify/functions/b2b-vote`
  and never changes, and a rule needs a path of its own; its per-store daily
  cap stays its guard (security audit item 8). A flood from many addresses
  passes any per-address rule, and a shared address can reach a limit.

- **`auth-reset`, `auth-reset-finish` and `auth-confirm` have no edge rate
  limit** (security audit item 9, the part left): Pro's five rules are in
  use.

## §14, dispensary integration: still open

- **The pilot agreement (B2.1) waits for NOSE's registration (B1).** Facts
  given 2026-11-15: no fee for the pilot; Chris Carreon signs for NOSE. B1
  (the Terms page's legal name, entity, state, address, governing law) waits
  until the business is registered, expected within a month. The draft goes
  to counsel and never into this public repository.

- `scripts/download-twice.js` keeps its own looser fetch loop. Moving it onto
  `lib/fetch-report.js` would change what it reports (redirects re-checked,
  8 s for a link it waits 30 s for today), so it waits for its own prompt.
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
- **The cap is counted, not locked**: the day is counted before a vote is
  kept and again after, 16 listings a vote, and a vote that finds the day
  over its cap takes itself back out (14-records, "The dispensary code read
  against the privacy page", 2026-11-16). Two that land together may both
  go, leaving the day one short; never over. Which store reached it is not
  logged ("Logs", above). `B2B_VOTE_DAILY_CAP`, like every variable, changes
  only with a new deploy, and the pilot report compares against the default
  100, not that variable.
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
- **Settled 2026-11-17: the no-panel sentence stays** "No terpene panel
  available for this batch" (s14, "The widget"), not the prompt's "No terpene
  panel on this batch's report": the owner agreed it is true whether the
  batch has no report, a report NOSE could not fetch or read, or one with no
  panel, blames neither store nor lab, matches its two sibling strings, and
  changing it would need a new release and compliance kit.
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
- **The demo page is live at `/b2b/demo/`**: static, noindex, linked only
  from /dispensaries/ (its pitch view, since 2026-11-15), its feed a file.
  Its votes reach the production b2b-vote, which refuses the made-up key as
  no store's. Its test store is rewritten by `node scripts/b2b-demo-feed.js`
  after a parser change moves a fixture's reading - the widget test fails
  until it is.
- **At most 12 cards** on the rail and the sold-out panel, a constant in the
  widget; the rest of the menu is the store's page. The basis counts every
  purchase it does not use and names only those of the category with no
  panel.
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
- **WebKit and Firefox run in the gates; a real iPhone is still the pilot
  store's check** (since 2026-11-14, "WebKit and Firefox in the tests"). The
  gates drive Playwright's Linux WebKit, Safari's engine but not iOS Safari,
  and leave it out on Windows, whose build behaves unlike Safari. The
  compliance kit still draws in Chromium alone, as a record of the screens.
  On 2026-11-16 the owner opened nose-app.com in Safari on an iPhone and
  everything looked right. That was the site itself; the widget on a
  store's own page in iOS Safari is still the pilot store's check.
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
- **Backups: said on the privacy page since 2026-11-15, and both projects
  are on Pro** (13-records, "Backups on the privacy page" and "Backups were
  already there"). Each project is backed up daily and a backup is kept seven
  days, so a deleted row can remain that long. What is still open: nobody has
  restored one. A restore replaces the whole project, so a first trial
  belongs before a licensee depends on NOSE, not after.
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
  set: a dry run on 2026-11-16 passed with a date six months back. The
  report still reads git. The record others can check is the push's gates
  run on GitHub, dated by GitHub's clock; the plan template's checklist asks
  for its address since 2026-11-16.
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
- **The widget learns that the basis is open from its `toggle` event**
  (`_basisOpen`), which the browser fires a little after the click - about
  11 ms, around the next frame, in Chromium on 2026-10-16 (§13, "Every gate
  on every push"). A remove or put-back pressed before then draws the basis
  closed, so its button cannot have the keyboard focus. That is faster than
  any shopper; `b2b-widget-test` now waits for the event before tabbing on.
  Reading the open state from the page when drawing again would end it, but
  that changes `js/b2b-widget` - a new file, and a new release for a pinned
  page - so it needs its own prompt.
- **A first pilot may be too small to decide** (13-records, "A pilot walked
  through on a made-up store", 2026-11-16): a 10% lift at a mean of 1.8 and
  a spread of 2.1 needs 2,137 shoppers a group, and the band check needs as
  many Low votes as Strong ones. Ask a store for its mean and spread before
  agreeing dates.

## §14: later

Wanted work, not yet built.

- Campaign palates: an email or text to opted-in shoppers when a new batch
  matches their palate. Wanted as an option after the pilot. Preferred build:
  the dispensary's server runs the ranking engine on purchase history it
  already holds, so NOSE never receives it.

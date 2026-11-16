# §14 records

The dated records of PARSER-HANDOFF.md §14, moved here whole and unchanged on 2026-11-14 (M7), in date order. A new record is added at the end of this file.

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
  **Since 2026-10-16 they are not restated**: both read by
  `lib/read-report.js` (§12; §13, "One way to read a report").
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

### A front door for dispensaries, 2026-11-15

B7 from `docs/project-notes/nose-blocker-prompts-FULL-2026-10-27.md`. Facts
given 2026-11-15: the About story is true as written and keeps "we"; the
name shown is Chris Carreon; the contact is contact@nose-app.com; no price.

- **`/dispensaries/`**, a new page (indexed, in the sitemap). What shoppers
  see, with three screenshots of the widget on the demo's made-up test store
  (`images/dispensaries/rail.png`, `sold-out.png`, `vote.png`, each with
  alt text); that purchase history never reaches NOSE; what a store's web
  team does; the coverage report first; compliance; the pilot; what NOSE
  won't do; and contact. Every claim has an HTML comment naming the file it
  rests on: `docs/B2B-INTEGRATION.md` (the opening, the core promise,
  sections 1-4 and 7), `scripts/b2b-coverage.js` and
  `docs/B2B-CATALOG-FORMAT.md`, `js/b2b-strings.*.js` (default and Florida
  wording, and the "still being tested" line), `scripts/b2b-compliance-kit.js`,
  `docs/B2B-RELEASES.md`, `docs/B2B-PILOT-PLAN.md` (sections 2, 3 and 10),
  `js/b2b-rank.*.js` and `privacy/index.html#dispensaries`. No client name,
  count, testimonial, uptime promise or price. It does not say "reviewed by
  counsel". One draft sentence said every view says the score is untested;
  the vote view does not, so it says the widget says so under its matches.
- **The demo's pitch view**, `/b2b/demo/?view=pitch`: the widget first, its
  consent prompt ready, the example purchases loaded, one line saying the
  store and purchases are made up; "Show the developer controls" reveals the
  form and the batch list. Without the parameter the page is as before. It
  stays noindex and out of the sitemap.
- **About:** the story as written, plus "Who runs NOSE": "NOSE is run by
  Chris Carreon. Questions, corrections and dispensaries:
  contact@nose-app.com." The Organization JSON-LD names him as founder and
  gives the email.
- **Links:** "For dispensaries" in the shared footer (Explore) and a line
  under the home page's closing button.
- `family.css` gains one rule so the screenshots fit their cards;
  `check-published` serves `dispensaries/`.
- **Tests:** `b2b-widget-test` checks the pitch view (widget first, consent
  ready, one tap brings the rail for the 11 example purchases, the button
  reveals and hides the controls), that the plain demo is unchanged, and that
  only `/dispensaries/` links the demo, by its pitch view. `page-chrome`: 25
  pages. Seen in Chromium at 390 and 1280 px.
- **Not checked:** that mail to contact@nose-app.com reaches anyone.

### How a flower score reads, 2026-11-15

B4 from `docs/project-notes/nose-blocker-prompts-FULL-2026-10-27.md`. The
owner chose option D (label plus place) and the attribution line "Flavor
match by NOSE".

- **The probe:** on the demo store, for the demo's example purchases, the
  flower rail scored 15 in-stock cards; the first 8 all said "Close match"
  (97 down to 93), 9 of the 15 did, 5 said "Related profile", 1 "Partial
  overlap". Every flower pair in the test store: 136 pairs from 17 flower
  batches with a panel - 44 Close match, 59 Related profile, 21 Partial
  overlap, 12 Different profile; median 84.
- **The options shown** on those first 8 cards: A, place only; B, a label
  relative to this menu (advised against: its cut-offs would be invented);
  C, the label plus how many share it ("9 of 15 in stock are this close");
  D, the label plus the card's place.
- **Built (D):** a scored card reads "Close match · 97 · closest of 15 in
  stock", then "Close match · 96 · 2nd closest of 15", and a screen reader
  hears "Close match, 97 out of 100, closest of 15 in stock". The place is
  among the in-stock batches with a panel the card was ranked with, shown or
  not, in the rail and the sold-out panel alike. matchBand()'s label is
  unchanged, so `docs/B2B-PILOT-PLAN.md` section 5 ("the band the shopper
  was shown") still holds, and the vote still sends the score and band.
- **New strings**, both variants with the same keys: `placeFirst` ("closest
  of {n} in stock"), `placeNth` ("{ord} closest of {n}"), and `attribution`:
  "Flavor match by NOSE", and "Aroma match by NOSE" in the Florida wording,
  which says aroma throughout (its vote asks "Was the aroma close?"). The
  attribution line sits under the method line on the rail and the sold-out
  panel. `css/b2b-widget` gains its one rule.
- **The compliance kit** places the three new strings and reads a card's place.
- **Tests:** `b2b-strings-test` allows `{place}` and `{ord}`; `b2b-widget-test`
  expects each card's place and checks the attribution line; its word list
  knows the endings of 2nd, 3rd and 4th. Same gate lines.
- No change to `js/match-math`, the app, the golden file or the methodology
  page. Release 1's bytes are untouched.
- **Done 2026-11-15 ("Release 2 published"):** publish release 2
  (`node scripts/b2b-release.js --dry-run`, then the release, then its
  `docs/B2B-RELEASES.md` row committed on its own, then `node
  scripts/b2b-release-check.js --site https://nose-app.com`), and the
  compliance kit for it (`node scripts/b2b-compliance-kit.js --release 2`).

### Release 2 published, 2026-11-15

The last steps of "How a flower score reads", run in the Codespace.

- `node scripts/b2b-release.js` (after a dry run, and after `git checkout --
  package-lock.json`: a Playwright install had left it changed, and the
  script refuses a tree with any change): release 2 from commit `c96b15a`,
  `nose-matches.js` 66,645 bytes,
  `sha384-ria5Ei+NaS29qm0wrTCxfib/zOXnVZvEeAwaKZBRnHYcfTKIYBaFMkVUs/ZgAUa8`;
  `nose-matches.css` 5,788 bytes,
  `sha384-R2Sxy67O6gPnbBB7Gx4hwPTj/C85nqi1xO/mthRYsfhTTYCfCtkAk+5tc5nVWLNW`.
  Both written, read back and matched; the row committed on its own as
  `d8c19b7`.
- `node scripts/b2b-release-check.js --site https://nose-app.com`: releases 1
  (`77f96a8`) and 2 (`c96b15a`) each "git ok store ok site ok".
- `node scripts/b2b-compliance-kit.js --release 2`: 10 screens, 37 PNGs,
  README.md, strings.md and data.md under
  `b2b-out/test-store/compliance-kit/` (gitignored), the rail and the
  sold-out panel at 201 and 188 strings. It needed Playwright installed in
  the Codespace first; the lock file was put back afterwards.
- A store on release 1 sees no change until its page carries release 2's
  tag, given in `docs/B2B-RELEASES.md` and `docs/B2B-INTEGRATION.md`.

### The dispensary code read against the privacy page, 2026-11-16

The owner asked for the dispensary code checked line by line against what
the privacy page promises ("Dispensaries that use NOSE"). Read whole:
`js/b2b-widget`, `b2b-vote.js`, `b2b-feed.js`, `lib/b2b-votes.js`; the keys,
readings, feed and vote parts of `lib/b2b-store.js`; the header check in
`lib/b2b-catalog-format.js`; the grants in the b2b migration; and
`delete-store`. Every network and storage call in the dispensary bundles was
listed: two `fetch` calls and one `localStorage` pair in the widget, one
`console.warn`, nothing else.

**One promise the code did not keep, fixed:**
- "At most 100 votes a day are kept from one dispensary." `record()` counted
  the day, then wrote. Votes arriving together each saw room before any had
  landed, so a day one short of its cap kept all of them. It now counts
  again once the vote is in, and a vote that finds the day over its cap
  takes itself back out. Two landing together may both go, leaving the day
  one short; never over. `b2b-endpoints-test` sends six together at a day
  one short of a cap of 5; it fails on the library as it was.
  A vote now costs two counts of the day (16 listings) where it cost one.

**Held, each against the code:**
- Before a shopper says yes: nothing is asked for but the code and, when
  the button is shown, the stylesheet. A control-group or denied widget
  shows and loads nothing.
- After: one GET of the feed naming the public key and nothing else, and a
  vote of exactly six fields. Neither carries a purchase; `purchases` is
  read only when consent is granted, and only in the browser.
- No cookie and no referrer: `credentials: "omit"` and `no-referrer` on
  both requests, `no-referrer` on the stylesheet, and a release's
  stylesheet asked for anonymously.
- The vote function reads the Origin header and the body, nothing else, and
  logs fixed lines only. The key is day and 16 random bytes; the value is
  candidate, score and palate size.
- The feed selects no field the page does not list, and terpenes only for
  an accepted reading of the batch's own link. Its reply varies by Origin
  in Netlify's cache ("values ... sent with the standard `Vary` HTTP
  response header are factored into cache keys", Netlify's caching
  overview, read 2026-11-16).
- Keys are kept as SHA-256 only; `nose_b2b` is granted nothing in schema
  `nose`; a catalog with a column outside the format, or one that looks
  like it is about a person, is refused before a row is read; no catalog
  path loads `coa.js`, `lib/archive.js` or `lib/pdf-store.js`;
  `delete-store` deletes readings, batches, keys and the store, then votes.

**Small things, left:**
- The page's list of what the feed holds leaves out `list_position`, where
  the batch came in the catalog. It names it under what is kept.
- The Origin rule is a browser's rule: a request made outside a browser can
  say any Origin. The page says "requests that say they come from", which
  is exact. The feed holds a store's public menu and readings, nothing
  about a shopper.
- Not read line by line: `js/b2b-rank` (the maths runs in the browser and
  makes no request - checked by listing its calls), the pilot scripts, the
  catalog reader beyond its imports.

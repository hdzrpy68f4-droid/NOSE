# NOSE architecture review — 2026-10-15

Read-only review of `hdzrpy68f4-droid/NOSE` at `14bb238`. Nothing was edited or committed, so no gates were run. Counts come from the source. Platform limits come from the current Netlify and Supabase docs (Sources). Security findings are in `claude/nose-security-audit-2026-10-15.md`; this report refers to them as "audit #n" and does not repeat them.

## Summary

- **The domain core is well factored.** The parser, the maths, the fetcher and the storage path are separate modules with injected dependencies. The dispensary (B2B) program is a real bounded context. Data rules live in Postgres, where every function instance obeys them.
- **The debt is at the edges.** Three modules each do too many jobs. Shared plumbing is copied rather than shared. About a dozen parallel lists are kept equal by tests rather than by having one home, and two of them (design colours, page chrome) have already drifted.
- **The build and delivery pipeline is the weakest layer.** `build.sh` rewrites tracked source on every build. The site publishes the repository root and hides source by deny-list. No CI runs the 32 gates before Netlify deploys.
- **Horizontal scaling.** The functions are stateless, so nothing in-process blocks running more of them. The ceilings are external:
  - a new Postgres connection on every call, against 200 pooler clients on the free compute
  - a synchronous fetch-and-parse on every scan, repeated for the same report
  - Blobs used as a counter and an event log
  - a batch reader that one person runs by hand
- **One dated item.** Netlify will refuse deploys containing Lambda-compatibility functions from **July 1, 2027**. `coa.js`, the product's core endpoint, is the only one.

## 1. Separation of concerns and modularity

### What succeeds

| Module | Why it works |
|---|---|
| `netlify/functions/lib/parse-coa.js` | Takes text and returns the §7 output contract. It makes no network or database call, so 59 fixtures, parity and the mutation harness can pin it. |
| `lib/fetch-report.js` → `lib/extract-text.js` → `parse-coa.js` → `lib/archive.js` → `lib/store.js` / `lib/pdf-store.js` | Each does one job. `storeScan()` takes `openPdfStore` and `saveScan` as options, and `store.js` takes a `client`. So the tests run the real code on PGlite and stand-ins. |
| `js/match-math.*.js` | The one copy of the maths, shared by the app, the widget engine and the scripts. It loads as a script tag or through `require`, and 1,830 recorded scores pin it. |
| B2B: schema `b2b`, role `nose_b2b`, the `b2b-*` functions, its own Blobs stores, `lib/b2b-flag.js` | Its own storage, credentials and single switch. No consumer page loads its files, and no foreign key or function crosses into schema `nose`. |
| `js/b2b-rank`, `js/b2b-strings`, `js/b2b-widget` | Decisions are pure functions, every word is in one file (two variants), and drawing is a Web Component with a stylesheet scoped to it. |
| `supabase/migrations/` | Append-only roles, the person-key checks and triggers, `save_scan` as the only write path and an advisory lock are enforced in one place, whatever calls. |

### What fails

| Where | Evidence | Consequence |
|---|---|---|
| `js/nose.d7c4872c.js` | 1,061 lines in one IIFE: error reporting, DOM helpers, palate state, matching UI, votes, about 517 lines of COA reading and QR scanning, the router and account sync. The home page loads all of it to draw the hero. | A change to any feature re-hashes and re-tests the whole app. There is no seam smaller than "drive it in Chromium". |
| `netlify/functions/lib/b2b-store.js` | 742 lines, 44 exports: key minting and hashing, catalog validation, 11 SQL statements and 2 shared fragments, connection handling, error scrubbing, feed shaping and vote targeting. | Prompts 2, 3 and 4 and the tested_on change each had to edit it. |
| The "read a report" use case | `coa.js:165–226` holds the steps. `scripts/b2b-coverage.js:147` (`readFetched`) restates them, with the handler's four sentences copied at lines 82–85. `scripts/b2b-read-catalog.js:58` imports that report script for its production writes. A test keeps the two aligned by reading `coa.js` as text. | The scanner and the dispensary reader can drift apart, and a production data path depends on a reporting CLI. |
| Two server library folders | `netlify/lib/` holds ES modules (auth, beacon). `netlify/functions/lib/` holds CommonJS (everything else). `auth.js` says its code must live outside `functions/` or Netlify may register it as a function. §14 cites Netlify's docs: a file in a subfolder is a function only when named `index` or after its folder. | Two homes, two module systems, and a stated reason the docs no longer support. |
| The whole repository is published (`netlify.toml`: `publish = "."`) | 15 forced-404 rules in `_redirects` hide source paths. `brand-eq.css` at the root is referenced by nothing and is served. | A deny-list: every new top-level file is public until someone adds a rule. |
| Browser code depends on the scripts folder | `js/aroma-bar.*.js:30` and `js/b2b-rank.*.js:45` call `require('../scripts/lib/match.js')` when run in Node. `scripts/lib/match.js` finds the maths by matching the hashed file name in `js/`. | The published folder depends on the tooling folder. A second hashed copy breaks every script (§14, "Pinned releases" probe). |

## 2. Clean coding practices

### DRY: copies kept equal by tests, not by structure

| What | Copies | Kept equal by |
|---|---|---|
| Bounded pg connection, `withClient` | `store.js:156–176` and `b2b-store.js:444–464`; only the environment variable differs | nothing |
| Error scrubber | `archive.js` `reason()` 120–129 and `b2b-store.js` `scrub()` 418–429 | nothing |
| `readJsonBody` | `netlify/lib/auth.js` and `netlify/lib/beacon.js`, with the checks in a different order | nothing |
| Response helpers | `reply`, `notFound` and `unavailable` in b2b-catalog, b2b-feed and b2b-vote; `within()` in b2b-release and b2b-vote; `json()` in coa.js, auth.js and feedback-read.js | nothing |
| Person keys | `store.js` `PERSONAL_KEYS`, `nose.holds_no_person()`, `b2b.holds_no_person()` | b2b-store-test |
| Band names | `matchBand()`, `match-feedback.js` `BANDS`, `lib/b2b-votes.js` `BANDS` | two tests |
| Smell words | js/nose `SMELL_NOTES` and `match-feedback.js` `NOTES` | match-feedback-test |
| Terpene keys | parse-coa `ANALYTE_MAP` and match-math `TERPENES` (§8, "takes TWO edits") | the golden test, after the fact |
| The scanner's sentences | coa.js and b2b-coverage.js | b2b-coverage-test reads coa.js |
| Family colours | `shell.css` (two `:root` blocks, lines 14–25 and 659), `family.css`, `agegate.css`, `js/aroma-bar`, `js/hero`, `favicon.svg`, `aromas/citrus/` | nothing, and they now differ. Earthy ink is `#68431F` in shell.css:17 and aroma-bar, `#5C3B20` in shell.css:659 (which wins the cascade), and `#6E4A2B` in family.css:20. |
| Page header and footer | Copied by hand into 23 HTML pages: 10 header variants, 7 footer variants | nothing, and they now differ. `account/index.html` lists Account twice; the footer tagline is an `<h2>` on some pages and a `<p>` on others. |
| Vote storage policy | Consumer votes keep the time to the millisecond (`beacon.js` `keySuffix`); B2B votes keep the day only (`b2b-votes.js`) | nothing (audit #2) |

### SOLID

- **Single responsibility.** The three modules in section 1 break it, and so does `parseCoa()` itself: one function spanning lines 468–1318 (851 lines), with 38 `let` declarations of state shared across its phases. The ordered pipeline in §6 is the right design; it just isn't expressed as functions, so no stage can be named, tested or reviewed on its own. Parity and the mutation harness are what keep it safe today.
- **Open–closed.** A new lab means editing `LABS`, `CLASSES` and `FINISHED`, and often a reader inside `parseCoa()`. The tables help; the readers are not pluggable. That is acceptable for a parser that must fail closed, but each new lab is a code change, a deploy and a fixture.
- **Dependency inversion.** Mostly good: `storeScan`, `saveScan` and `withClient` take their dependencies as options (`openPdfStore`, `saveScan`, `client`, `_Client`). Underscore-prefixed exports used as production API weaken it: `b2b-store.js:78` imports `_clean` and `_findPersonalKey` from store.js, and `b2b-coverage.js:609` calls `_scrub`.

### Conventions

- **Module formats.** `package.json` says `"type": "commonjs"`. 16 of the 17 functions are written as ES modules (`export default`) that import CommonJS libraries whole. `coa.js` is the only Lambda-style `exports.handler`, the format Netlify has deprecated.
- **Strict mode is off in the main bundle.** At `js/nose.*.js:51`, `'use strict'` comes after other statements, so it is not a directive: the 1,061-line bundle runs in sloppy mode. A reduced case in Node confirms this. The UMD files (match-math, aroma-bar, b2b-rank) place it correctly.
- **The time budget is spread across three files.** `coa.js:52–59`, `fetch-report.js:31–37` and `store.js:128` are all designed around a 10-second ceiling. Netlify's configuration page now lists 60 seconds for synchronous functions and does not mention 10. Its Lambda-compatibility page states no limit for that format, so measure on a deploy before relying on more time.
- **Project metadata.** In `package.json`, `test` is npm's placeholder, `main: index.js` names a file that doesn't exist, and there is no `engines` field. There is no lint, format or CI configuration. `.nvmrc` pins Node 20 while production runs Node 24 (audit #12).
- **Comments carry history.** They are full of dates and prompt numbers (b2b-store.js cites them 15 times), and code, tests and SQL refer to PARSER-HANDOFF sections 146 times. Some have gone stale:
  - `b2b-vote.js`'s header still explains `sendBeacon`, though the vote has gone by `fetch` since 2026-10-09.
  - `build.sh` and `vendor/README.md` say the QR library is never committed, and it is.
- **Tests.** 14,240 lines across 38 files, beside about 20,000 lines of source: strong coverage. Three habits make refactoring expensive:
  - 22 files each define their own `check()` harness.
  - `gates.sh` passes a gate on a free-text line.
  - At least 9 test files read source as text: `build.sh` lines run "from its comment to its done", byte-for-byte pins, string searches.

  Pinning applied migrations byte for byte is worth keeping. Pinning shell line ranges and comments is not.
- **Docs.** `PARSER-HANDOFF.md` is 458 KB and 6,874 lines: spec, decision records, runbooks, changelog and open items in one file. §14's Still open list alone runs about 270 lines.

## 3. Horizontal scaling

**What already scales:**

- The functions keep no state between requests.
- Postgres enforces every invariant behind an advisory lock, so any number of instances can't race the archive.
- Widget releases are immutable and cached for a year.
- The B2B feed is CDN-cached for 60 seconds per origin.

**Bottlenecks, in the order they would bite:**

1. **A new Postgres connection on every call.** `store.js` and `b2b-store.js` open a TLS connection, log in, run one statement and close it, for every scan, every feed cache miss and every vote. Supabase's free compute (Nano) allows 200 pooler clients, 60 direct connections and 500 MB of data.
   - More than about 200 calls in flight at once are refused.
   - Every call pays for TLS and login before its query.
   - The free project also pauses after a week idle, which is why `keep-awake.js` exists.
2. **Fetch, extract and parse inside the request.** `coa.js` downloads the PDF (up to 8 s), runs pdf.js and the parser, then waits for the archive (up to 2 s), on every scan.
   - A second scan of the same jar repeats all of it: the archive deduplicates only after the work is done.
   - Requests to lab portals grow one for one with scans.
   - It is unthrottled (audit #1).
3. **The archive's daily cap.** `daily_document_cap()` allows 100 new documents a UTC day, a single number in a migration. Past it the archive keeps nothing, while the reply is unaffected. That suits the free plan, but at scale it is a hard ceiling on the data collected.
4. **Blobs used as counters and an event log.** Netlify describes Blobs as optimized for frequent reads and infrequent writes, with no concurrency control.
   - `auth.js` `rateLimit()` reads, modifies and writes, so it under-counts under concurrency, as its own comment says.
   - Each B2B vote makes 8 `list()` calls to count the day's votes (`b2b-votes.js:104–115`).
   - `feedback-read.js` lists every vote key on each call; its records and CSV views then fetch up to 1,000 blobs at once (`feedback-read.js:109`).
   - Every signed-in request makes a strongly consistent session read, which the docs call slower.
5. **The B2B batch reader is a person.** `scripts/b2b-read-catalog.js` runs by hand in one Codespace, one link at a time, a second apart. At 1–3 s a link, a 2,000-batch catalog takes roughly 35–100 minutes per store. Netlify's background functions stop at 15 minutes, so moving the reader there needs chunks. The reader's "due" query and `--limit` already make it resumable.
6. **The feed grows with the catalog.** `b2b-feed` returns every batch in the store's window, sold-out ones included, with their terpenes, and the widget ranks on the shopper's device. The test store's 30 batches come to 23 KB, so a 2,000-batch window would be about 1.5 MB before compression. This is the privacy design (purchases never leave the browser), and the CDN cache absorbs repeat reads. So the limit is payload size and the phone, not servers.
7. **Operations run through one Codespace.** Creating stores, rotating keys, reading catalogs, publishing releases, deleting stores and building compliance kits all run from it, with its secrets. This scales with people, not machines.

## Refactoring Roadmap (easiest to highest effort)

Effort is rough: **XS** a few hours, **S** a day, **M** 2–4 days, **L** a week or more, **XL** several weeks. Each item is its own prompt, under the usual rules:

- `bash scripts/gates.sh` green before and after, with every gate's expected line kept.
- The parser and the maths stay untouched unless the item says otherwise.
- Privacy-page wording is shown before it is committed.
- A new migration sorts after `20261015010000`.

- **XS:** Move `'use strict'` to the first line of js/nose's IIFE. Run the input-paths and match gates, because strict mode can expose an implicit global. Commit the renamed bundle.
- **XS:** Remove or relocate the root-level leftovers: delete `brand-eq.css` (unreferenced, and served); move `setup.sh`, `verify-manifest.sh` and `dump-ordering.js` into `scripts/`. Settle `vendor/README.md` against the committed file by pinning a hash (audit #11).
- **XS:** Fix the stale comments: the 10-second ceiling, after a measured deploy, and `sendBeacon` in `b2b-vote.js`.
- **S:** Give `package.json` real `gates` and `build` scripts and an `engines` field, and drop `main`. Align `.nvmrc` with production's Node version (audit #12).
- **S:** Keep one `:root` colour block in `shell.css`, and make `family.css` and `agegate.css` use its variables. The owner picks the ink values first: they differ today, and the change will be visible.
- **S:** Add CI: a GitHub Actions job runs `gates.sh` (with Playwright installed) on every pull request. Work reaches main only through pull requests, with the gates as a required check, so Netlify only ever builds a green commit.
- **M:** Build a shared server kit:
  - one `lib/db.js` holding `withClient(urlVariable)` and `scrub`
  - one `readJsonBody`
  - one set of response and timeout helpers
  - public names for `_clean`, `_findPersonalKey` and `_scrub`

  Several tests pin source text, so expect test edits with unchanged gate lines.
- **M:** Add `lib/read-report.js`: validate, fetch, extract, apply the text floor, parse and decide, with the person-facing sentences. `coa.js`, `b2b-coverage.js` and `b2b-read-catalog.js` would all use it, which retires the test that reads `coa.js` as text. The parser itself is untouched.
- **M:** Port `coa.js` to the Request/Response format before 2027-07-01. This also makes `config.rateLimit` available (audit #1). The archive-wiring and input-paths gates drive the handler.
- **M:** Stamp the header and footer into the 23 pages at build from one copy. This fixes the doubled Account link and the heading drift in one place.
- **M:** Store consumer votes the way B2B votes are stored (the UTC day and a random suffix), with the privacy page first (audit #2).
- **M:** Move counters off Blobs: Netlify edge rate limits for auth and votes (audit #1, #8, #9), and a daily summary for `feedback-read` instead of a full scan.
- **M:** Split `PARSER-HANDOFF.md` into `docs/adr/`, `docs/runbooks/`, a changelog and an open-items list. Keep the section names as anchors so the 146 references still resolve, or rewrite them once.
- **L:** Split `b2b-store.js` into keys, catalog validation, a SQL repository and feed shaping, keeping one export surface for callers.
- **L:** Run the batch reader as a scheduled background function that reads N due batches per run, inside 15 minutes, so onboarding a store doesn't wait on a person. The privacy page then says where reading happens.
- **L:** Measure pooler use, then choose among three options:
  - reusing a client within a warm instance
  - a compute upgrade before about 200 concurrent calls
  - caching parse results under a keyed hash of the link (never the link itself, whose query can carry a token)
- **L:** Build into `dist/` and publish only that (an allow-list), keeping source unhashed in git. This ends the rename commits and the 404 deny-list. It touches `build.sh`, `check-published.js`, `check-trust.mjs` and `scripts/lib/match.js`. `b2b-release.js` and the compliance kit build releases from committed hashed files, so they would need to build from a commit instead.
- **XL:** Split `js/nose.*.js` by feature: palate, COA reading, scanner, votes, router and sync. Check it with a before-and-after capture, as the aroma-bar move did (397 of 397 states identical).
- **XL:** Break `parseCoa()` into named stages with explicit intermediate results, keeping the ordered pipeline (§6) and every constant. The bar to pass:
  - parity at 56 match / 0 differ
  - the mutation harness at 35
  - the Kaycha anchors unchanged
  - `reparse.js --dry-run` reporting nothing changed

  This one needs its own prompt.

## Sources

- [Netlify: Lambda compatibility](https://docs.netlify.com/build/functions/lambda-compatibility/) (updated 2026-06-09): deprecated; deploys with it refused from July 1, 2027
- [Netlify: Configuration for functions](https://docs.netlify.com/build/functions/configuration/) (updated 2026-09-17): 60 s synchronous, 30 s scheduled, 15 min background, 6 MB buffered payload
- [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/) (updated 2026-10-09): pages of 1,000 keys, no concurrency control, strong consistency gives slower reads, "frequent reads and infrequent writes"
- [Supabase: Compute and disk](https://supabase.com/docs/guides/platform/compute-and-disk) (modified 2026-10-14): Nano gives 60 direct connections and 200 pooler clients; 500 MB recommended maximum
- `claude/nose-security-audit-2026-10-15.md`, the audit findings cited above

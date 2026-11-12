# NOSE: the medium cleanups (prompts, 2026-10-15)

Seven prompts for the M items in `claude/nose-architecture-review-2026-10-15.md`, written at `c5e0882`, with S1 and S2 landed and S3 (CI) being finished. Each prompt is one commit, sometimes plus a short "Live" record afterwards. They assume S3 is in: a push to `main` reaches the site only after its run on GitHub goes green and `live` moves.

**Order.** M1, then M2, then M3: all three change `coa.js`, and each is smaller with the one before it done. M4 needs M2, because Netlify's rate limits only work in the current function format. M5 and M6 can go any time. M7 goes last: it moves where every later prompt writes its record.

What turned up while writing them, checked at `c5e0882`:

- **Two of the review's M items needed correcting.**
  - "Move counters off Blobs" can't be done as written. Netlify's rate limits count by IP address only, so the per-email login throttle and the per-store daily vote cap have to stay in Blobs. M4 adds Netlify's per-IP limits beside them.
  - Netlify allows 2 rate-limit rules per project on the Free and Personal plans, and 5 on Pro. Which plan the site is on decides what M4 covers, so M4 starts by asking.
- **Seven pages have no Privacy or Terms link.** `/aromas/` and its six family pages use a short footer with neither. The account page lists Account twice in its footer. `/aromas/` has lost its brand link's label for screen readers. The six family pages mark "Aroma families" as the current page although they sit below it. M6 fixes all of it.
- **Error reports have the votes' problem.** Both keep the server's time to the millisecond and the device's own time. Error reports add a browser string and the page. Any of those can be lined up with Netlify's request logs, which hold IP addresses. The privacy page says a vote can't be traced back to you. M5 makes both keep the day only.
- **`coa.js` is the only function in the old format.** Netlify stops accepting deploys that contain one on July 1, 2027. Two tests and one script take `_resolvePdfFromPage` from it, though that function lives in `lib/fetch-report.js`. The current format gives a function the visitor's IP address and location (`context.ip`, `context.geo`), so the port has to keep both away from the archive, as the old code kept `event` away.
- **The handoff is 7,422 lines,** and 6,560 of them are §13 and §14, mostly dated records. Code comments cite it 162 times across 91 files, almost all by section and record title. Only `test/fixture-lint.js` reads the file, for figures in §2 and §9. So M7 can split it without editing a single comment.

## Settled before you paste

Each prompt assumes these. If you decide otherwise, change the named line before pasting, or ask me for the other version.

- **M1:** the steps from link to verdict move to `lib/read-report.js`, with the four sentences people see and the list of unsafe layouts. It loads neither the archive nor the PDF store, and nothing in it decides whether a report is kept.
- **M2:** the port changes no reply, with two exceptions. A request whose body isn't a JSON object gets the existing 400 instead of crashing, and any other unexpected error gets a fixed 500 instead of Netlify's crash page, which shows the error and its stack (security audit #5). The archive is still awaited before the reply, as now; replying first and keeping the report in the background (`context.waitUntil`) is its own prompt.
- **M3:** the shared helpers live in two files:
  - `netlify/functions/lib/db.js` holds connections and error scrubbing. Everywhere uses the stricter scrubber, the dispensary one.
  - `netlify/lib/http.js` holds request bodies, replies and time limits.

  The two library folders stay two for now; merging them is its own prompt.
- **M4, the rules** (each counts per IP address over 60 seconds; change the numbers if you like):
  - On Free or Personal, 2 rules: `coa` 12 requests, `match-feedback` 30.
  - On Pro, those two plus `b2b-vote` 30, `auth-login` 10 and `client-error` 15.
  - A limited request gets Netlify's 429. The app and the account page show a plain sentence for it.
- **M5:** votes and error reports both keep the UTC day and a random code, never a time, as dispensary votes already do. A script rewrites the ones already stored, with a dry run first. The privacy page changes before the code does.
- **M6:** two headers and one footer, stamped into every page by `build.sh` from `partials/`:
  - The app header (home page and `/app`) keeps its mobile menu.
  - The static header serves the other 20 pages.
  - Every page gets the full footer, Privacy and Terms included.

  The nav puts Account before Start matching everywhere. The footer's tagline is a paragraph, not a heading. The stamped pages are committed, so the repository holds what deploys.
- **M7:** `PARSER-HANDOFF.md` keeps §0–§12 and §13's reference parts.
  - The dated records move to `docs/handoff/13-records.md` and `docs/handoff/14-records.md`, in date order.
  - Both Still open lists move to `docs/handoff/open.md`.
  - An index in `PARSER-HANDOFF.md` lists every record by title and date.
  - No line is lost, which is checked by machine, and no code comment changes.

## Preamble (paste first)
```
Repo: https://github.com/hdzrpy68f4-droid/NOSE. Read PARSER-HANDOFF.md §4–§7 and §13 first, and §14 when the prompt touches B2B. Aroma only, no effect claims; never assert scraped numbers; the archive keeps nothing about the person who scanned. I'm a beginner in Codespaces: step-by-step commands, short explanations.
- These are the medium cleanups from the architecture review of 2026-10-15 (project doc claude/nose-architecture-review-2026-10-15.md). Do only what the prompt says. If the fix grows past it, stop and tell me.
- Run the prompt's probe BEFORE editing. If it doesn't show what the prompt expects, stop and tell me.
- bash scripts/gates.sh must say ALL GATES GREEN before and after. KAY-CAR-001 4.124 and KAY-PRR-001 0.944 unchanged. A changed test keeps its gate's exact expected line; a new gate goes into gates.sh and §5 in the same commit.
- Don't touch the parser (parse-coa.js, coa-dates.js, extract-text.js), the maths (js/match-math.*.js), schema nose, schema b2b or any migration. If the prompt seems to need one, stop and tell me.
- No B2B record or log holds anything about a shopper; the archive and the consumer's stores hold nothing about the person using the site. Nothing here may add a field, a log line or a stored value about a person.
- The privacy page and the code move together. If a prompt changes what NOSE keeps or sends, show me every new or changed sentence before committing. Name what is kept; never write that nothing is (check-trust will catch it: reword, don't narrow).
- build.sh renames a changed js/ or css/ file; commit the renamed file. Each prompt says which it expects.
- Where a change depends on how Netlify, GitHub, Supabase or a browser behaves, check the current docs and cite the page with the day you read it. Don't rely on memory.
- When I have to change a setting on GitHub or Netlify, give me the clicks one at a time.
- After git push, the run on GitHub has to go green and live has to move before the live site shows the change. Every "once the deploy is live" step waits for that.
- New words in comments and docs: no effect wording ("effect" itself is on the tests' word list).
- Record what you did in PARSER-HANDOFF.md where the prompt says, above that section's Still open list, in the same commit. Commit when green.
```

## M1: one way to read a report
```
Goal: the steps from a link to a verdict exist once. Today coa.js's handler holds them: validate the link, fetch the PDF, extract its text, refuse under 200 characters, parse, refuse an unsafe layout, then decide. scripts/b2b-coverage.js restates them in readFetched(), with coa.js's four sentences copied in (lines 82-85). scripts/b2b-read-catalog.js writes production readings through that report script's readFetched(). test/b2b-coverage-test.js keeps them aligned by reading coa.js's source as text (line 518).

Where: netlify/functions/lib/read-report.js (new); netlify/functions/coa.js; scripts/b2b-coverage.js; scripts/b2b-read-catalog.js; test/b2b-coverage-test.js and test/archive-wiring-test.js (checks re-pointed, gate lines kept); PARSER-HANDOFF.md §12 and §13.

Probe, before editing:
1. Show me the steps in coa.js's handler (lines 157-235) and in b2b-coverage.js's readFetched() (around line 147) side by side. Expect the same order, the same 200-character floor and the same four sentences. One difference: coa.js keeps the report in the archive between the parse and the refusals, and readFetched() keeps nothing.
2. Show me every test and script that reads coa.js as text or calls its handler. Expect:
   - b2b-coverage-test: reads the source at line 518, and calls the handler with the same links
   - archive-wiring-test: reads the source in its call-site check, line 586
   - input-paths-test: calls the handler
   - resolver-test, duplicates-test and scripts/download-twice.js: take _resolvePdfFromPage
3. Run the coverage report on the test catalog as b2b-coverage-test does, and coa.js's handler on the same links. Note every outcome and sentence: the after-run must match it line for line.

Build:
1. lib/read-report.js, CommonJS like the other lib files:
   - The steps once: validateUrl, fetchPdf, extract, the 200-character floor, parseCoa, the unsafe-layout check.
   - It returns a plain result: the stage it stopped at; the person-facing sentence, or the parser's reasons; and the pieces a caller may need (the bytes, the final link, the page it came through, the text, the parser's output).
   - The four sentences and UNSAFE_UNDER_UNPDF (still empty) live here, exported.
   - extract, parse and fetch are passable as options, as readFetched() allows today.
   - It loads neither lib/archive.js nor lib/pdf-store.js, and it decides nothing about keeping.
2. coa.js uses it. The archive call stays exactly where it is: after the parse, before the refusals, with the same arguments, so refused reports are still kept. Every reply stays as it is, status, headers and body.
3. b2b-coverage.js: readFetched() becomes a thin wrapper over read-report, keeping its name and its { outcome, reasons, output } shape. SCANNER and MIN_TEXT become read-report's own, re-exported. b2b-read-catalog.js is unchanged, or imports from read-report directly if that's simpler; say which.
4. Tests:
   - b2b-coverage-test's source-reading check (line 518) becomes: coa.js and b2b-coverage.js both use lib/read-report.js, and neither restates a sentence. Its run of the same links through coa.js's handler stays: that is the proof.
   - archive-wiring-test's call-site check (line 586) still proves the archive is called once, after the parse and before the refusals, in production only; re-point its string matches to coa.js's new lines.
   Same gate lines.
5. PARSER-HANDOFF.md: §12 names read-report as the one path from link to verdict, and the record goes in §13. The coverage report's "steps restated" note in §14 ("The coverage report") gets one line saying they no longer are, with the day.

Must not move: every reply coa.js gives, compared before and after over every link the two tests use; every line of the coverage report on the test catalog; the reader's 19 readings and 14 accepted; the archive's call site and budget; lib/fetch-report.js and the parser; every js/ and css/ file; every gate's expected line; what NOSE keeps or sends.

Should change: one copy of the steps and sentences. A sentence edited in read-report reaches the scanner and the dispensary reports together.

Done when: ALL GATES GREEN; you've shown me the before-and-after comparison of replies and report lines; and you've walked me through, one step at a time:
1. In the Codespace: git pull --ff-only, then npm run gates.
2. git push, then wait for the run on GitHub to go green and live to move.
3. On the live site, read one COA link on /app; its card shows as before.
```

## M2: coa.js in Netlify's current function format
```
Goal: coa.js is written as every other function is, a default export taking a Request and returning a Response, before Netlify stops accepting the old format on July 1, 2027. Today it is the only exports.handler function. Two crashes go with the port:
- a body of null throws, and Netlify shows its crash page, with the error and its stack trace
- any other unexpected throw does the same
Both now get fixed replies (security audit #5).

Where: netlify/functions/coa.js; netlify/functions/lib/archive.js (archiveScan and its three limits move here); netlify/functions/lib/pdf-store.js (connect() goes); test/resolver-test.js, test/duplicates-test.js and scripts/download-twice.js (they take resolvePdfFromPage from lib/fetch-report.js); test/archive-wiring-test.js, test/input-paths-test.mjs and test/b2b-coverage-test.js (they drive the default export); PARSER-HANDOFF.md §13.

Probe, before editing:
1. Read and quote, each with its date and the day you read it:
   - Netlify, "Lambda compatibility": deprecated, and deploys holding such functions refused from July 1, 2027
   - Netlify, "Get started with functions" and the "Functions API" reference: the default export, what the Context object exposes (ip and geo among it) and context.waitUntil
   - Netlify, "Configuration for functions": the module format for a .js file under "type": "commonjs", which the other 16 functions already rely on
   If any says otherwise, stop.
2. Confirm from §14 ("Feed and votes", "Privacy page, then switch on") that a function in the current format gets its Blobs context with no connectLambda: b2b-vote has written votes live since 2026-10-09.
3. Send coa.js's handler, as it is, these bodies and show me the replies:
   - null
   - [] and a bare string
   - {} (no url)
   - a valid link from the test fixtures
   Expect null to throw (the crash), the others to get their 400s, and the link its 200.
4. Show me the tests and the script that reach into coa.js: archive-wiring-test (handler, _archiveScan, _archiveOn, _ARCHIVE_LIMITS, its "no longer a Lambda-style handler" check and the rule that archiveScan never names event), input-paths-test and b2b-coverage-test (handler), and the three _resolvePdfFromPage callers.

Build:
1. coa.js becomes export default async (request) => Response, with ES module imports as b2b-catalog.js has them, and nothing else exported.
   - The context argument is not taken at all: the scanner reads no IP, location or cookie, and the archive is never handed the request.
   - OPTIONS 204 with Allow: POST; other methods 405, with the same sentence as now.
   - Every reply keeps its status, its three headers (Content-Type: application/json, Cache-Control: no-store, X-Content-Type-Options: nosniff) and its body, byte for byte.
2. The body:
   - Not JSON: 400 "Could not read that request.", as now.
   - JSON but not a plain object (null, an array, a string, a number): the same 400.
   - Any other throw, anywhere in the handler: a fixed 500 { "error": "The report reader failed. Try again, or enter the values manually." }, with one fixed log line and no detail of the request or the error.
3. archiveScan, archiveOn and the three limits move to lib/archive.js, unchanged in behaviour. The 9 s deadline is still measured from the handler's start and still awaited before the reply. pdf-store's connect() and coa.js's connectBlobs() go: the current format hands Blobs its context.
4. resolver-test, duplicates-test and scripts/download-twice.js take resolvePdfFromPage from lib/fetch-report.js.
5. The three tests drive the default export with a Request, loaded as the other ES-module functions are in tests (b2b-catalog-test's module.register hook). archive-wiring-test:
   - its Lambda check flips: coa.js has one default export and nothing else
   - its rule that the archive never sees the person now covers request and context as well as event
   - it gains the four probe-3 bodies, null's 400 among them, and a forced throw's fixed 500 with nothing of the error in it
   Same gate lines.
6. PARSER-HANDOFF.md: the record goes in §13, with the docs quoted. §13's "How coa.js feeds it" changes from "Lambda-style function... Netlify freezes it" to the current wording. §12's fetcher section says coa.js is in the current format.

Must not move: every other reply, byte for byte, over every case archive-wiring-test and input-paths-test already drive; the archive's budget, order and production-only switch; the fetch chain, read-report (M1) and the parser; the endpoint's address, /.netlify/functions/coa; js/nose and every other js/ and css/ file; every gate's expected line; what NOSE keeps or sends.

Should change: no function in the old format is left, so the July 2027 cut-off no longer affects NOSE. A malformed request gets a 400 or a fixed 500, never a stack trace.

Done when: ALL GATES GREEN; you've shown me the probe-3 replies before and after; and you've walked me through, one step at a time:
1. In the Codespace: git pull --ff-only, then npm run gates.
2. git push, then wait for the run on GitHub to go green and live to move.
3. On the live site:
   - Read one COA link on /app: its card shows.
   - curl -s -X POST https://nose-app.com/.netlify/functions/coa -H 'content-type: application/json' --data 'null' answers {"error":"Could not read that request."}.
4. node scripts/archive-health.js: ok, and the newest parse is the jar you just read, dated today, context production.
```

## M3: one set of server helpers
```
Goal: the server code shares one connection helper, one error scrubber, one body reader and one set of reply and time-limit helpers, instead of copies:
- withClient() exists twice: lib/store.js lines 158-178 and lib/b2b-store.js lines 444-464, differing only in which variable names the database.
- The scrubber exists twice: lib/archive.js reason() and lib/b2b-store.js scrub(), the second stricter (keys, quoted values).
- readJsonBody exists twice: netlify/lib/auth.js and netlify/lib/beacon.js, with different size caps and checks in a different order.
- Replies: b2b-catalog, b2b-feed and b2b-vote each define reply/notFound/unavailable; b2b-release and b2b-vote each define within(); json() is in coa.js, auth.js and feedback-read.js.
- Helpers marked private are used as public ones: _clean and _findPersonalKey (lib/store.js) by b2b-store.js and scripts/lib/rerun.js; _scrub (b2b-store.js) by three scripts.

Where: netlify/functions/lib/db.js (new, CommonJS); netlify/lib/http.js (new, ES module); lib/store.js, lib/b2b-store.js, lib/archive.js; netlify/lib/auth.js and beacon.js; every function in netlify/functions; the scripts that call the underscore names; the tests that name them (b2b-store-test, archive-wiring-test, b2b-endpoints-test, store-test); PARSER-HANDOFF.md §13.

Probe, before editing:
1. Show me each pair of copies side by side and every difference, however small: limits, check order, the regexes, header spelling.
2. Write a scratch harness, not committed, that records every reply of every function for its tests' cases (status, every header, body) and every scrubbed message the tests produce. Run it on the tree as it is, twice, and show the two runs are identical. It is the before picture.
3. List every caller of _clean, _findPersonalKey, _scrub, _withClient and archive.reason.

Build:
1. lib/db.js:
   - withClient(fn, { urlEnv, name, timeoutMs, _Client }), with the bounds, the error listener and the unawaited end() as store.js has them
   - clientConfig, moved from store.js; store.js re-exports it so the eleven scripts that use it don't change
   - scrub(err): b2b-store's stricter rules, one function
   store.js and b2b-store.js use these. archive.reason() becomes scrub, under its old name for its callers.
2. netlify/lib/http.js:
   - readJsonBody(request, { limit }), refusing with the same reason names as today; each caller keeps its own limit (auth 4096, beacons 16384, b2b-vote 2048)
   - json(data, status, headers), notFound(), methodNotAllowed(allow) and within(promise, ms)
   auth.js and beacon.js take readJsonBody from it; the functions take the rest. A reply that sets its own headers keeps them exactly: b2b-feed's five, b2b-release's five, coa's three.
3. Public names: clean, findPersonalKey, scrub. Every caller moves to them, and the underscore names go.
4. Tests keep every check, re-pointed where they named an underscore or pinned an import line (b2b-endpoints-test pins b2b-vote's import from beacon.js). Same gate lines.
5. Run the harness from probe 2 on the new tree. Every reply identical. Every scrubbed message identical, or scrubbed more where the archive's took up the stricter rules: list each one that changed.
6. PARSER-HANDOFF.md: the record in §13, with the harness's counts.

Must not move: every reply of every function, byte for byte; every log line, except archive failure lines now scrubbed by the stricter rules; the person-key lists and their two database bodies; every function's address and switch; the parser, the maths and every js/ and css/ file; every gate's expected line; what NOSE keeps or sends.

Should change: one copy of each helper. The review's DRY table loses its first four rows.

Done when: ALL GATES GREEN; you've shown me the harness's before-and-after result; and you've walked me through, one step at a time:
1. In the Codespace: git pull --ff-only, then npm run gates.
2. git push, then wait for the run on GitHub to go green and live to move.
3. On the live site: one COA link read on /app; on /account, sign in and out. Then node scripts/probe-db.js: probe clean.
```

## M4: rate limits at Netlify's edge
```
Goal: no one address can run up NOSE's Netlify bill or flood its stores (security audit #1, #8, #9). The functions anyone can call take unlimited requests today:
- coa fetches any https link and parses it; a slow server makes each call bill about 8 seconds.
- match-feedback and client-error take unlimited writes; their 3-a-page cap is in the page.
- b2b-vote's daily cap of 100 can be filled by anyone with the store's public key.
- The login throttle counts per email only.
Netlify's code-based rate limits count requests per IP address at its edge, so NOSE stores no address.

The Blobs counters stay: Netlify counts only by IP, so the per-email login throttle (auth.js rateLimit) and the per-store daily vote cap (b2b-votes.js) have to stay where they are. This adds the per-IP layer beside them.

The rules, per plan (60-second windows, counted per IP):
  Free or Personal (2 rules): coa 12, match-feedback 30.
  Pro (5 rules):              coa 12, match-feedback 30, b2b-vote 30, auth-login 10, client-error 15.

Where: the config export of each function named above; js/nose.*.js and js/account.*.js (what each page says on a 429); privacy/index.html; scripts/gates.sh (if a new gate); PARSER-HANDOFF.md §13 and §14.

Probe, before editing:
1. Ask me which Netlify plan the site is on: Netlify → the team → Billing, the plan's name. The rules above follow from it.
2. M2 has landed: coa.js has a default export. If not, stop: rate limits work only in the current format.
3. Read and quote, with dates:
   - Netlify, "Rate limiting": rules per plan, the rateLimit config (windowLimit, windowSize at most 180, aggregateBy), a limited request blocked with 429, rules not settable in netlify.toml
   - Netlify, "How credits work": whether a blocked request is billed
   If either says otherwise, stop.
4. Show me what each page does today with a 429 whose body isn't JSON:
   - js/nose's COA reader, around line 399: res.json() fails, so it says "Could not reach the report reader"
   - js/account's sign-in
   - the vote and error beacons (they ignore the reply)

Build:
1. Each function on the plan's list exports its rule: config.rateLimit, windowLimit as above, windowSize 60, aggregateBy ["ip", "domain"]. No path change. Nothing else in the functions changes.
2. js/nose: a 429 from coa says "Too many reports read from this connection in the last minute. Wait a minute, then try again." js/account: a 429 says the same as its own tooMany() reply, "Too many attempts. Wait a few minutes and try again." Nothing else changes in either.
3. The privacy page, in "What Netlify's logs hold" and the dispensary section's logs paragraph: Netlify counts recent requests from each address at its edge to slow down floods, a few minutes at a time, and NOSE never receives those counts. Show me every new or changed sentence before committing. A "What changed" entry only if the sentences say something new about what is collected; say which.
4. Tests: wherever a test reads a function's exports or source, it gets the config, so check that every limited function exports exactly its rule; every other gate as before. A new gate only if no existing test is a sensible home for that check.
5. PARSER-HANDOFF.md: the record in §13, the rules table in §14 for b2b-vote, and §13's Still open gains what is left - auth-signup and auth-reset when only 2 rules are allowed, a distributed flood, and a shared address (a dispensary's wifi) reaching a limit.

Must not move: every reply below the limit, byte for byte; the Blobs throttle and caps; what NOSE stores; the parser, the maths and every other js/ and css/ file; every gate's expected line.

Should change: one address sending more than a rule allows in a minute gets 429s until the minute passes, and the page says so plainly.

Done when: ALL GATES GREEN; you've shown me the privacy sentences before committing; and you've walked me through, one step at a time:
1. In the Codespace: git pull --ff-only, then npm run gates.
2. git push, then wait for the run on GitHub to go green and live to move.
3. A short loop you give me, from the Codespace: 15 POSTs to coa with a body of {} in under a minute. Expect 400s, then 429s from about the 13th, then 400s again after a minute.
4. On /app, one COA link reads as before.
```

## M5: votes and error reports keep the day, not the time
```
Goal: a match vote and an error report keep the UTC day and a random code, never a time, as dispensary votes do since 2026-10-08.
- Today match-feedback.js keeps ts (the server's time, to the millisecond), clientTs (the device's), and a key ending HHMMSSmmm-<6 random characters> (netlify/lib/beacon.js keySuffix()). client-error.js does the same, with the browser string and page beside it.
- Netlify's request logs hold each request's address and time, so a stored time can be lined up with an address.
- The privacy page says of votes that "nothing in them identifies you or can be traced back to you" (around line 105). That claims more than is true (security audit #2).

Where: privacy/index.html (first); netlify/lib/beacon.js; netlify/functions/match-feedback.js, client-error.js and feedback-read.js; scripts/blobs-to-days.js (new: rewrites what is already stored); test/match-feedback-test.js; a test for client-error and errors-purge, new or in an existing gate; PARSER-HANDOFF.md §13.

Probe, before editing:
1. Show me:
   - the vote's key and value (match-feedback.js) and the error report's (client-error.js)
   - keySuffix(), safeClientTs() and contextHash() in beacon.js
   - feedback-read.js's key parser, its newest-first sort and its CSV columns (ts and clientTs among them)
   - errors-purge.js, which reads the day from the key
2. Show me the privacy page's paragraphs on votes ("Match feedback stays anonymous") and error reports, and the dispensary section's sentence on how its votes are filed, which this follows.
3. Show me match-feedback-test's checks that pin the key layout and the record's ten fields. Confirm no test covers client-error or errors-purge.

Build:
1. The privacy page, before any code:
   - Votes and error reports: "a timestamp" becomes the day.
   - The vote paragraph says what the dispensary section says of its votes: filed under the day and a random code, never a time, so they can't be put back in arrival order; on a day with very few votes one could still be matched with its request in our host's logs; the file storage may note when each was saved, and we never read that time.
   - The sentence about "can be traced back to you" is reworded to what is true, and ends by saying an earlier version said more, as the page does for its other corrections.
   - "What changed" gains an eighth change, dated the day it goes live.
   Show me every sentence before going on.
2. beacon.js: the key suffix is 16 random bytes as hex, as lib/b2b-votes.js's is, with no time. safeClientTs() goes when nothing uses it.
3. match-feedback.js:
   - The value keeps day (YYYY-MM-DD, UTC) instead of ts, and no clientTs. The schema version becomes 3. ctx is unchanged: it holds no time.
   - The key is votes/<band>/<vote>/<day>/<32 hex>.
   - The repeat-votes comment says duplicates can no longer be told apart by time.
4. client-error.js: the same, keeping its key's day and ctx: errors/<day>/<ctx>/<32 hex>, the value with day and no ts or clientTs. errors-purge.js is unchanged in behaviour; its test proves it.
5. feedback-read.js reads all three layouts: v1 and v2 records with ts, which the script below removes, and v3 with day. The CSV puts day where ts was and drops clientTs; its caveat says the corpus has no order within a day. The synthetic-records comment names its records by day, not time.
6. scripts/blobs-to-days.js, from the Codespace with NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN:
   - A dry run by default, counting what it would rewrite in each store.
   - With --yes, every record still holding a time gets written under its new key without its time fields, read back, and only then is the old key deleted. Votes keep their band, vote and day; error reports keep their day and ctx.
   - A run that stops part way finishes on a second run. It prints counts only, never a record.
   It refuses without the two variables.
7. Tests:
   - match-feedback-test: the new key and value, no time anywhere, all three layouts read by feedback-read, the CSV's columns.
   - The new test: client-error's key and value; errors-purge still deleting by day.
   - The script, against a stand-in Blobs store: dry run, --yes, a stop part way and the second run, nothing printed but counts.
   Same gate lines for existing gates.
8. PARSER-HANDOFF.md: the record in §13 ("Every vote stored" gets a line pointing to it), and the audit's item 2 closed.

Must not move: what a vote and an error report say apart from the time (band, vote, score, candidate, palate, palate size, smell words, ctx; kind, message, source, line, column, page, browser string); the summary feedback-read gives by band; the 90-day purge; B2B and its vote store; the parser, the maths and every js/ and css/ file (the app sends ts as before and the function ignores it); every other gate's expected line.

Should change: no stored vote or error report holds a time of day, once the script has run.

Done when: ALL GATES GREEN; you've shown me the privacy sentences before committing; and you've walked me through, one step at a time:
1. In the Codespace: git pull --ff-only, then npm run gates.
2. git push, then wait for the run on GitHub to go green and live to move. New votes and reports are written without a time from then on.
3. node scripts/blobs-to-days.js: the dry run's counts. Then node scripts/blobs-to-days.js --yes, then the dry run again: 0 to rewrite.
4. Press "Matched" on one result on /app, then curl feedback-read with your token, as its header shows: the newest vote has a day and no time.
5. The live privacy page shows the new sentences and the eighth change.
```

## M6: one header and one footer
```
Goal: the site header and footer exist once, and build.sh stamps them into every page. Today they are copied by hand into 23 pages and have drifted:
- The static header is the same on 19 pages apart from which link is current. /aromas/ has lost its brand link's aria-label and the bars' aria-hidden. The six family pages mark "Aroma families" with aria-current="page" though they sit below it; the guides use "true" for the same.
- The home page and /app use a second header, with the mobile menu js/nose drives. It puts Account after Start matching; the static one puts it before.
- The full footer, on 15 pages, varies in typography (' and ’, &middot; and ·).
- account/index.html's footer lists Account twice. The home page and /app make the footer's tagline an h2 and add route-link classes, which no script or stylesheet reads.
- /aromas/ and its six family pages have a short footer with no Privacy or Terms link.

Where: partials/header.html, partials/header-app.html and partials/footer.html (new); build.sh (a stamping step, before the fingerprints); all 23 pages (markers, and the stamped result); _redirects (/partials/* forced 404); css/shell.*.css and family.*.css (only if the footer's tagline needs one rule to look as it does now); test/page-chrome-test.js (new) and scripts/gates.sh; PARSER-HANDOFF.md §13.

Probe, before editing:
1. Group the pages by site header (the first <header class="site-header">) with aria-current set aside. Expect 19 static pages identical, /aromas/ differing as above, index.html and app.html alike, and b2b/demo with none.
2. Group them by footer. Expect the differences above, and b2b/demo with none.
3. Confirm route-link is read by no script and styled by no stylesheet, and show me what js/nose does with the header: menuButton, mobileMenu, and setting aria-current by path.
4. Take pictures of the home page, /app, /learn/, one guide, /aromas/, /aromas/earthy/ and /account/ at 1280 and 390 px wide. They are the before set.

Build:
1. The partials:
   - header.html is the static header.
   - header-app.html is the app header, with its mobile menu.
   - footer.html is the full footer, with Privacy and Terms, the tagline as a paragraph, one typography (’ and ·), and no route-link class.
   - The nav order everywhere is: Aroma families, Learn, Methodology, About, Account, then Start matching.
2. build.sh, before the fingerprints:
   - Each page carries markers: <!-- nose:header static|app --> … <!-- /nose:header --> and <!-- nose:footer --> … <!-- /nose:footer -->.
   - The step replaces what is between them with the partial, and sets aria-current on the static header: "page" on the link to the page itself, "true" on the link above it.
   - A page with a marker missing, doubled or unclosed fails the build. b2b/demo gets no markers.
   - The step writes the pages in place, as the fingerprints do. The stamped result is committed, and CI's clean-tree check catches a page that wasn't.
3. The stylesheets: only if a picture shows the footer's tagline changed when it became a paragraph, one rule in the stylesheet that page loads. Nothing else.
4. _redirects: /partials/*  /404.html  404!
5. test/page-chrome-test.js, offline, a gate after the build ('page chrome', 'page-chrome clean'). It checks:
   - every page but b2b/demo has both markers once
   - between the markers sits exactly the partial, aria-current aside
   - aria-current is right for each page's address
   - every footer links Privacy and Terms
   - b2b/demo has neither marker
   Against broken copies (scratch), each must fail it: a page edited by hand between markers, a marker missing, a wrong aria-current, Privacy dropped from the partial.
6. Pictures again, the same set. Show me before and after side by side before committing.
7. PARSER-HANDOFF.md: the record in §13; §13's Still open loses the account footer item ("Account twice").

Must not move:
- every page's own content outside the header and footer
- js/nose's mobile menu and aria-current behaviour on the home page and /app, and every js/ file, so build.sh renames none
- the CSP and _headers; check-published and check-trust passing
- the demo page
- every other gate's expected line
- what NOSE keeps or sends

Should change:
- Privacy and Terms links on every page.
- One header per kind and one footer.
- The nav in one order.
- A page's chrome is changed in one place.

Done when: ALL GATES GREEN; you've shown me the pictures; and you've walked me through, one step at a time:
1. In the Codespace: git pull --ff-only, then npm run gates.
2. git push, then wait for the run on GitHub to go green and live to move.
3. On the live site, at phone width:
   - /aromas/earthy/ shows the full footer with Privacy and Terms.
   - The home page's menu opens and closes.
   - /account/ lists Account once.
   - Each page's console shows no error.
```

## M7: the handoff split into what is and what happened
```
Goal: a session can read what NOSE is now without reading its history. PARSER-HANDOFF.md is 7,422 lines. §13 (3,518) and §14 (3,042) are mostly dated records: how each change was probed, built and verified. Every prompt's preamble asks a session to read them first. Split, nothing is lost:
- PARSER-HANDOFF.md keeps the reference.
- The records move to their own files, in date order.
- The two Still open lists become one file.

Where: PARSER-HANDOFF.md; docs/handoff/13-records.md, docs/handoff/14-records.md and docs/handoff/open.md (new); test/fixture-lint.js only if a figure it reads moves (it should not); PARSER-HANDOFF.md §3 and §5 (where records go from now on).

Probe, before editing:
1. List §13's and §14's subsections with their lengths, and sort each into one of three kinds:
   - reference: §13's subsections from "What exists" to "Keeping the free project awake", and "After a deploy - check it"
   - a dated record: every heading ending in a date, and §13's "Verified..." and "Live..." entries
   - Still open, or §14's Later
   Expect §14 to have no reference subsections: its records hold its reference.
2. Show me every place code or tests read the file, as opposed to citing it. Expect test/fixture-lint.js alone, reading figures in §2 and §9.
3. Count the citations: expect 162 mentions of PARSER-HANDOFF in 91 files outside it, nearly all by section number and record title. Show me any that cite a line number or anything a move would break.

Build:
1. PARSER-HANDOFF.md keeps:
   - §0–§12 as they are
   - §13's reference subsections
   - §14's opening paragraphs, plus a new "What exists" list compiled from the file blocks its records already open with, each line naming the record it comes from
   - for each of §13 and §14, an index of its records: title, date, and the file it now lives in
2. docs/handoff/13-records.md and 14-records.md: every dated record, whole and in date order, under its own heading, unchanged. A one-line header says what the file is and that new records are added at its end.
3. docs/handoff/open.md: §13's and §14's Still open lists under those two headings, and §14's Later, unchanged.
4. §3 "Where to start" and §5 "How to work": read PARSER-HANDOFF.md and open.md first, and a record only when a prompt names it. A new record goes at the end of its section's records file. A closed item comes off open.md in the same commit.
5. The check, in a scratch script, not committed: every line of the old file appears in the new files the same number of times, apart from headings and the index lines you added; list those. Show me the counts.
6. Nothing else moves: no code comment, test or script changes. The 162 citations keep working through the index: a section number leads to PARSER-HANDOFF.md, and a record title to its file.

Must not move: every line of the old file's text, as checked; §2's and §9's figures where fixture-lint reads them; every gate's expected line (fixture lint among them); docs/ and PARSER-HANDOFF.md forced 404 on the site; what NOSE keeps or sends.

Should change: PARSER-HANDOFF.md becomes roughly 1,700 lines a session can read first; the history stays whole beside it.

Done when: ALL GATES GREEN; you've shown me the line-count check; and you've walked me through, one step at a time:
1. In the Codespace: git pull --ff-only, then npm run gates.
2. git push, then wait for the run on GitHub to go green.
3. Open PARSER-HANDOFF.md and docs/handoff/open.md in the Explorer (right-click, Open Preview) and check the index links open the records.
Then give me the new preamble line, the one future prompts use in place of "Read PARSER-HANDOFF.md §4–§7, §13 and §14 first", and where records now go.
```

## Left alone on purpose

- **Replying before the archive write.** The current format offers `context.waitUntil`, so `coa.js` could reply first and keep the report in the background. That changes the archive's timing and its tests' budget logic, so it's its own prompt after M2.
- **One folder for server libraries.** `netlify/lib/` (ES modules) and `netlify/functions/lib/` (CommonJS) stay two. M3 gives each one shared file; merging the folders touches every function's imports, so it's its own prompt.
- **The scripts' own connections.** Eleven Codespace scripts open a long-lived connection through `clientConfig()`, which they already share. M3 leaves them as they are.
- **`feedback-read`'s full listing.** It lists every vote key on each call. That's fine at today's handful of votes; a daily summary waits until the corpus is large enough to need it.
- **Rate limits for `auth-signup` and `auth-reset`.** These two get no rule on any plan, because the rule budget goes first to the functions that cost money or take writes. Their per-email throttle in Blobs and Supabase's own limits stay.
- **The vote's dedupe by time.** Once votes keep no time, a reload-and-revote can no longer be told apart from two people voting on the same pair. `ctx` still groups them. The corpus counts votes, not voters, as its own comment already says.
- **Decision records (ADRs).** M7 moves records as they are; it doesn't rewrite them into a new form. Pulling the decisions out of the records into short files is a later choice, once the split has settled.

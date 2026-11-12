# NOSE: the extra-small cleanups (prompts, 2026-10-15)

Four prompts for the XS items in `claude/nose-architecture-review-2026-10-15.md`. The review listed three; the root-leftovers item is split in two here, because pinning the QR library changes what the build does and moving files doesn't. Each prompt is one commit. Paste the preamble once at the start of a session, then one prompt, and wait for its commit before the next. Any order works, except that Prompt 3 edits a file Prompt 2 moves, so run 2 before 3.

What turned up while writing them, checked at `14bb238`:

- **Strict mode should change nothing a visitor sees.** I linted a strict-mode copy of `js/nose.d7c4872c.js` in the cloud workspace (ESLint 10, `no-undef`) and found no undeclared names. Nothing in the file writes to the frozen `NoseMatch` / `NoseBar` objects or to a read-only browser property. The browser gates are the proof.
- **The QR library in git is exactly jsDelivr's.** `vendor/html5-qrcode.min.js` is 375,364 bytes with SHA-256 `660b1243…8b1d8e`, the hash jsDelivr publishes for `html5-qrcode@2.3.8/html5-qrcode.min.js`. So each build's download has rewritten the same bytes, and the "never committed" lines in `build.sh`, `vendor/README.md` and the launch checklist are wrong.
- **`brand-eq.css` is a leftover copy.** Comments and spacing aside, every rule in it is already in `css/shell.*.css`'s "Equalizer wordmark" block. Nothing links it, but the site serves it.
- **The 10-second figure isn't in Netlify's docs any more.** The configuration page lists 60 s for synchronous functions. The Lambda-compatibility page gives no limit for that format, and says such functions stop being deployable on July 1, 2027. So Prompt 4 rewords the comments and leaves every time budget as it is.

## Settled before you paste

Each prompt assumes these. If you decide otherwise, change the named line before pasting.

- **Prompt 2:** `brand-eq.css` and `setup.sh` are deleted. `setup.sh` unzips an uploaded archive, a step from before the repo was in git. `verify-manifest.sh` moves to `scripts/`, and `dump-ordering.js` moves to `test/`, beside the other read-only parser diagnostics (`columnmajor-audit.js`, `date-probe.js`). Build steps 1–3.
- **Prompt 3:** the build stops downloading the QR library and checks the committed copy's hash instead. Nothing new could arrive anyway, because the version is pinned, and the build stops depending on jsDelivr. The other way is to download and check the hash; if you want that, change Build step 1.
- **Prompt 4:** only comments and handoff sentences change; every constant stays. The 10 s becomes NOSE's own stated budget, not a platform limit. Build steps 1–3.

## Preamble (paste first)
```
Repo: https://github.com/hdzrpy68f4-droid/NOSE. Read PARSER-HANDOFF.md §4–§7 and §13 first, and §14 when the prompt touches B2B. Aroma only, no effect claims; never assert scraped numbers; the archive keeps nothing about the person who scanned. I'm a beginner in Codespaces: step-by-step commands, short explanations.
- These are small cleanups from the architecture review of 2026-10-15 (project doc claude/nose-architecture-review-2026-10-15.md). Do only what the prompt says. If the fix grows past it, stop and tell me.
- Run the prompt's probe BEFORE editing. If it doesn't show what the prompt expects, stop and tell me.
- bash scripts/gates.sh must say ALL GATES GREEN before and after. KAY-CAR-001 4.124 and KAY-PRR-001 0.944 unchanged. A changed test keeps its gate's exact expected line.
- Don't touch the parser (parse-coa.js, coa-dates.js, extract-text.js), the maths (js/match-math.*.js), schema nose, schema b2b or any migration. If the prompt seems to need one, stop and tell me.
- None of these prompts changes what NOSE keeps or sends, so the privacy page doesn't move. If one seems to, stop and tell me.
- build.sh renames a changed js/ or css/ file; commit the renamed file. Each prompt says whether it expects one.
- Where a change depends on how Netlify, Supabase or a browser behaves, check the current docs and cite the page with the day you read it. Don't rely on memory.
- New words in comments and docs: no effect wording ("effect" itself is on the tests' word list), and never a sentence saying nothing is stored or kept (check-trust).
- Record what you did in PARSER-HANDOFF.md where the prompt says, above that section's Still open list, in the same commit. Commit when green.
```

## Prompt 1: strict mode in the app bundle
```
Goal: js/nose.<hash>.js runs in strict mode, as every other bundle does. Its 'use strict' sits at line 51, after other statements, so it is not a directive and the whole bundle runs in sloppy mode. In strict mode, a mistyped variable or a write to a frozen object throws, and the bundle's error reporter sends it, instead of passing silently.

Where: js/nose.*.js (two lines). build.sh renames it and rewrites the references in app.html, index.html and _redirects. PARSER-HANDOFF.md §13.

Probe, before editing:
1. grep -n "'use strict'" js/nose.*.js. Expect one line, 51, after the DOM helpers, the error-reporting block and step().
2. Copy the bundle to /tmp. Add the line  var __strictProbe = 010;  straight after the line holding 'use strict', and run node --check on the copy. Expect it to pass: an old-style octal literal is allowed only in sloppy mode.
3. Make a second copy with 'use strict' moved to the first line inside the opening (() => {, and the same octal line added straight after it. node --check must fail with "Octal literals are not allowed in strict mode." That shows the move is what switches strict mode on.
4. If ESLint is at hand, lint that second copy without the octal line, with no-undef and browser globals. Expect 0 findings.
If 2 fails, 3 passes, or 4 finds anything, stop and tell me.

Build:
1. Delete line 51. Put 'use strict'; as the first statement inside the opening (() => {, before the DOM helpers' comment. Change nothing else in the file.
2. bash build.sh. It renames the bundle and rewrites its three references. Commit the renamed file, app.html, index.html and _redirects.
3. PARSER-HANDOFF.md: the record in §13.

Must not move: every other line of the bundle (git diff -M on the renamed file shows one line removed and one added). js/match-math, js/aroma-bar and every other js/ and css/ file, so nothing else is renamed. Release 1, which doesn't contain this bundle. Every score, band and card. Every gate's expected line.

Should change: the bundle's hash and its three references. Nothing a visitor sees.

Done when: ALL GATES GREEN; probe step 2 run on the new bundle fails node --check with the octal error; and you've walked me through, one step at a time:
1. git pull --ff-only, then bash scripts/gates.sh.
2. git push.
3. Once the deploy is live: the home page and /app both read 74 · Partial overlap and their bars draw. On each page the browser console (Chrome: right-click, Inspect, Console) shows no error and no "[NOSE] ... skipped" line. Add one sample jar on /app and read its match.
```

## Prompt 2: leftovers at the repository root
```
Goal: the repository root holds the site and its config, nothing else. Four files there are leftovers:
- brand-eq.css: linked from no page; every rule of it is already in css/shell.*.css (its "Equalizer wordmark" block); served at /brand-eq.css because the whole root is published.
- setup.sh: unzips an uploaded archive into the folder, from before the repo was in git.
- verify-manifest.sh: a file check that still runs, named in docs/LAUNCH-CHECKLIST.md.
- dump-ordering.js: a read-only parser diagnostic, like test/columnmajor-audit.js.

Where: brand-eq.css and setup.sh (deleted); verify-manifest.sh to scripts/verify-manifest.sh; dump-ordering.js to test/dump-ordering.js; _redirects; docs/LAUNCH-CHECKLIST.md; PARSER-HANDOFF.md §5 and §13.

Probe, before editing:
1. git grep -n for each name, PARSER-HANDOFF.md aside. Expect:
   - brand-eq: nothing
   - setup.sh: _redirects and itself
   - verify-manifest: _redirects, setup.sh, docs/LAUNCH-CHECKLIST.md line 31 and itself
   - dump-ordering: _redirects and itself
2. Strip comments and whitespace from brand-eq.css and from css/shell.<hash>.css, and check the first is wholly inside the second:
   node -e 'const fs=require("fs");const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\s+/g,"");const a=strip(fs.readFileSync("brand-eq.css","utf8"));const f=fs.readdirSync("css").find(n=>/^shell\.[0-9a-f]{8}\.css$/.test(n));console.log(strip(fs.readFileSync("css/"+f,"utf8")).includes(a)?"every rule of brand-eq.css is in css/"+f:"brand-eq.css has rules shell.css lacks")'
   Expect "every rule of brand-eq.css is in css/shell.<hash>.css".
3. curl -s -o /dev/null -w '%{http_code}\n' https://nose-app.com/brand-eq.css. Expect 200.
4. bash verify-manifest.sh . and note its last two lines (the counts, then "Manifest complete — safe to run: bash build.sh"). Then node dump-ordering.js test/fixtures/pdf/KAY-CAR-001.pdf | tail -12 and note the parser result.
If 1 finds another reference or 2 says shell.css lacks a rule, stop and tell me.

Build:
1. git rm brand-eq.css setup.sh.
2. git mv verify-manifest.sh scripts/verify-manifest.sh. Its usage line becomes  bash scripts/verify-manifest.sh .  Nothing else in it changes.
3. git mv dump-ordering.js test/dump-ordering.js. Its two require paths become ../netlify/functions/lib/..., and its usage lines name test/dump-ordering.js. Nothing else changes.
4. _redirects: remove the rules for /setup.sh, /verify-manifest.sh and /dump-ordering.js. The files are gone from the root, and /scripts/* and /test/* are already forced 404. Every other rule stays, each with its "!".
5. docs/LAUNCH-CHECKLIST.md line 31: bash scripts/verify-manifest.sh . (that line only).
6. PARSER-HANDOFF.md: §5's harness table gains a row for test/dump-ordering.js (read-only, not a gate: how unpdf and pdftotext order a report's terpene table, and what the parser makes of it). The record goes in §13.

Must not move: css/shell.*.css and every other js/ and css/ file, so build.sh renames nothing; every page; what the two moved tools print; check-published's verdict; every gate's expected line.

Should change: /brand-eq.css answers 404 once deployed. The root loses four files and _redirects three lines.

Done when: ALL GATES GREEN, and you've walked me through, one step at a time:
1. git pull --ff-only, then bash scripts/gates.sh.
2. bash scripts/verify-manifest.sh . shows the same last two lines as probe step 4.
3. node test/dump-ordering.js test/fixtures/pdf/KAY-CAR-001.pdf | tail -12 shows the same parser result as probe step 4.
4. git push. Once the deploy is live, the curl from probe step 3 answers 404.
```

## Prompt 3: the QR library, committed and pinned
```
Goal: the build uses the QR library git already holds and fails unless its bytes are the pinned ones. Today build.sh downloads html5-qrcode 2.3.8 from jsDelivr on every build, checks only that the file isn't empty, and overwrites the committed copy. That file runs on the page that holds camera permission, so no build should ship bytes nobody checked (security audit #11). Three places say the library is never committed, and it is.

Where: build.sh (its download step and header); vendor/README.md; app.html (the HTML comment above the script tag); scripts/verify-manifest.sh (its "Vendored" section; at the root if Prompt 2 hasn't run); scripts/gates.sh (its header comment); docs/LAUNCH-CHECKLIST.md item 1; PARSER-HANDOFF.md §13.

Probe, before editing:
1. git ls-files vendor lists vendor/html5-qrcode.min.js: it is committed.
2. sha256sum vendor/html5-qrcode.min.js and wc -c. Expect 660b12437b1d747e3e68b8be0685c08cb728140110ad213f167b14b66f8b1d8e and 375364.
3. jsDelivr's own record of the file: https://data.jsdelivr.com/v1/packages/npm/html5-qrcode@2.3.8?structure=flat, entry "/html5-qrcode.min.js". Expect hash ZgsSQ3sddH4+aLi+BoXAjLcoFAEQrSE/FnsUtm+LHY4= (the same SHA-256, in base64) and size 375364. In the Codespace, also: curl -fsSL https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js | sha256sum gives the same hash.
4. bash build.sh, then git status --short vendor/. Expect nothing: the download wrote the same bytes.
If any hash or size differs, stop and tell me: the committed file is not jsDelivr's 2.3.8.

Build:
1. build.sh: no download. In its place, the build fails, with a message naming the expected hash and pointing to vendor/README.md, unless vendor/html5-qrcode.min.js exists and its SHA-256 is the pinned value, kept as one named value in that block. The header's item 1 says what the step does now.
2. vendor/README.md, true as it stands: the file is committed; the version (2.3.8) and where it came from; its SHA-256; build.sh fails on any other bytes; and to upgrade, download the new version, check its hash against jsDelivr's record, then change the file and the pinned hash in one commit.
3. The app.html comment says the file is committed and build.sh checks its hash. The script tag and everything else on the page stay as they are.
4. scripts/verify-manifest.sh: the vendored file is required (a MISS when absent), and its notes stop saying build.sh fetches it.
5. scripts/gates.sh: its header stops listing network for build.sh's QR download.
6. docs/LAUNCH-CHECKLIST.md item 1: build.sh checks the committed QR library rather than downloading it.
7. Check the guard by hand, without committing: in a throwaway copy of the repo, change one byte of the QR file and run bash build.sh. It must fail with your message. Show me its output.
8. PARSER-HANDOFF.md: the record in §13.

Must not move: vendor/html5-qrcode.min.js, byte for byte; app.html's script tag, the CSP and _headers; every js/ and css/ file, so build.sh renames nothing; every gate's expected line, "OK — ready to deploy" among them.

Should change: the build makes no network request for the QR library, so it no longer needs jsDelivr to be reachable.

Done when: ALL GATES GREEN; you've shown me the probe's hashes and the throwaway build's failure; and you've walked me through, one step at a time:
1. git pull --ff-only, then bash scripts/gates.sh.
2. bash build.sh, then git status --short. Expect no change to vendor/.
3. git push. Once the deploy is live, curl -s https://nose-app.com/vendor/html5-qrcode.min.js | sha256sum gives the pinned hash, and the Scan QR tab on /app opens the camera.
```

## Prompt 4: comments that no longer match the code
```
Goal: comments describe the code as it is. Two sets don't:
- coa.js, lib/fetch-report.js and lib/store.js each call 10 s Netlify's function limit, and three handoff sentences say the same. Netlify's current docs don't give 10 s as the limit for these functions.
- netlify/functions/b2b-vote.js's header describes the widget's vote as a sendBeacon call, with the page's cookies, and palateSize as a count of purchases. Since 2026-10-09 the widget sends the vote with fetch (cors, credentials omit, no referrer, keepalive), and palateSize counts the batches the palate used (js/b2b-rank voteScore(): palate.basis.used.length). §14 found both and left them.
Comments and handoff sentences only: no constant, code line or reply changes.

Where: netlify/functions/coa.js (lines 52–56); netlify/functions/lib/fetch-report.js (31–37, including the comment at the end of the TIMEOUT_MS line); netlify/functions/lib/store.js (128); netlify/functions/b2b-vote.js (header lines 9–11, 32 and 43–49); PARSER-HANDOFF.md §9 ("7.5-second fetch budget"), §12 and §13 ("How coa.js feeds it") and the record in §13.

Probe, before editing:
1. git grep -n "10s" -- netlify. Expect four lines: coa.js:53, fetch-report.js:32 and :37, store.js:128.
2. Read Netlify's "Configuration for functions" and "Lambda compatibility" pages and quote what each says about the execution limit, with the page's updated date and the day you read it. Expect 60 s for synchronous functions on the first, and on the second no figure for this format beyond 10 s for streamed replies (coa.js doesn't stream), plus the July 1, 2027 deprecation. If either names 10 s as the limit for a function like coa.js, stop and tell me: the comments are right.
3. Show me b2b-vote.js's header lines 9–11, 32 and 43–49; the vote's fetch() in js/b2b-widget.*.js; and palateSize in js/b2b-rank.*.js's voteScore().

Build:
1. The 10 s lines: say that NOSE keeps a reply within 10 s as its own budget, so the fetch chain has 8 s and the archive what's left before 9 s. Name the two docs pages and the day you read them, and say that the Lambda-compatibility page gives no limit for this format. Keep each comment's other reasoning. Every number in the code stays as it is.
2. b2b-vote.js's header:
   - Lines 9–11: the widget sends the string by fetch (cors, credentials omit, no referrer, keepalive). A text/plain body keeps it a simple request with no preflight, and any other Content-Type is refused.
   - Line 32: palateSize is how many batches made the palate, 1 to 1000.
   - Lines 43–49: no cookie is sent and none is read, and a valid vote is answered 204 with the origin echoed.
   Cite the docs you read, as the file already does.
3. PARSER-HANDOFF.md: the three handoff sentences say what the comments say. §14's "Found on the way" item about this header gets one line saying it is fixed, with the day. The record goes in §13.

Must not move: every code line in the four files, so git diff changes only comments and handoff text; b2b-vote.js's replies, its 415 sentence included; every js/ and css/ file, so build.sh renames nothing; every gate's expected line, archive-wiring, b2b-coverage and b2b-endpoints among them.

Should change: comments and handoff text only.

Done when: ALL GATES GREEN; you've shown me each reworded comment before committing; and you've walked me through, one step at a time:
1. git pull --ff-only, then bash scripts/gates.sh.
2. git push. Nothing a visitor or a store sees changes.
```

## Left alone on purpose

- **b2b-vote.js's 415 reply** ("Send the vote as a text/plain body, as navigator.sendBeacon sends a string.") still names sendBeacon. It's a reply rather than a comment, and the vote test's check names use the same words; changing it is its own small prompt.
- **`docs/LAUNCH-CHECKLIST.md` is stale beyond its two lines.** Item 3 says votes are discarded, though they have been stored since 2026-10-13, and it still says nothing has been rendered in a browser. A refresh is its own prompt.
- **`docs/FIXES.md` and `docs/TIER*-CHANGES.md`** describe the QR library as it was. They're change logs, so they stay as history.
- **`scripts/verify-manifest.sh`'s other stale lines** ("Static pages (16)", two functions listed) move with it unchanged; only the vendored section changes, in Prompt 3.
- **Using the time Netlify now allows.** That needs the limit for this format measured. Porting `coa.js` to the current function format (the M item, before July 1, 2027) settles it.

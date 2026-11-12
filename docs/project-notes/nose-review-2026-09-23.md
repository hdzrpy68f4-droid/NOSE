# NOSE storage build: review and follow-up prompts (2026-09-23)

Reviewed at commit 1cbc198. All six storage prompts were built, and much of the work goes beyond what was asked. The main gap is the goal behind them: only 20 of the 56 accepted reports get a date, so most can't be placed in a series over time.

## Prompt by prompt
1. Schema, role, store: met. Re-checked on PostgreSQL 16 as nose_writer: A → B → A keeps three rows with A latest; reordered keys add no row; UPDATE, DELETE and TRUNCATE are refused; a nested "Email" key is refused.
2. Write path: met. Only production stores anything, and both writes are time-bounded. The builder also found that the live site was serving the COA PDFs and the function source, and blocked both.
3. Re-run tools: met, plus a log of every run. Reading a PDF back from Blobs has only been tried against a stand-in.
4. Novelty: met, but it fires falsely on 4 of the 8 accepted ACS reports, and its card never appears on the paste-a-link path.
5. Analysis: met. The matching maths lives in one file, checked against 1,830 recorded scores. The gap is dates.
6. Privacy copy: met, and the build guards against the old keep-nothing promise. Three sentences still claim more than is true.

Gates: 13 of 17 were green here, using pdf.js in place of unpdf and the committed QR file in place of the blocked download. The 4 PGlite gates can't run here because the package registry refused the install. Their code hasn't changed since the Codespace's all-green run at cc9ca3a, and the SQL they cover was checked directly.

Three of the gaps came from the prompts themselves, not from the build:
- The PDF's bytes were made its identity, but Method's portal rebuilds the file on every download.
- The report-date labels were guessed, not measured.
- Any one of three signals marks a file as a lab report.

## Preamble (paste first)
```
Repo: https://github.com/hdzrpy68f4-droid/NOSE. Read PARSER-HANDOFF.md §4–§7 and §13 first. Aroma only, no effect claims; never assert scraped numbers; the archive keeps nothing about the person who scanned. I'm a beginner in Codespaces: step-by-step commands, short explanations.
- Run the prompt's probe BEFORE editing. If it doesn't show the problem, stop and tell me.
- bash scripts/gates.sh must say ALL GATES GREEN before and after. KAY-CAR-001 4.124 and KAY-PRR-001 0.944 unchanged.
- If parse-coa.js, coa-dates.js or extract-text.js changes: node scripts/reparse.js --dry-run must show only the changes the prompt predicts. Anything else: stop and show me.
- build.sh renames a changed js/ file; commit the renamed file.
- Update PARSER-HANDOFF.md in the same commit. Commit when green.
```

## Prompt 1 — The COA link tab can't add a jar (confirmed)
```
Problem: #coaConfirm sits inside #scanPanel in app.html. The COA link tab hides that panel, so after "Read report" the message says "<lab> read. Check the values below, then add the jar." and nothing is below. Reproduced in headless Chromium with a stubbed reply: the message shows and the card's hidden attribute is removed, but the card stays invisible. The Upload tab is a dead end too: picking a file says it "remains local in this static preview", and nothing else happens. account/index.html still says to use the export button "in the meantime".
Where: renderCoaConfirmation() and validateUpload() in js/nose.*.js; app.html; account/index.html.
Probe: a Playwright script with POST /.netlify/functions/coa stubbed to return a real parser output. COA link → Read report → #coaConfirm must be visible. It must FAIL today, while the scanner path passes.
Fix: before showing the card, move it into the tab panel that holds that request's message element, so it hides with its tab. Upload tab: say plainly that reading an uploaded file isn't available yet, and point to Scan QR, COA link or Manual. The file still goes nowhere, as the privacy page says. Account page: remove the stale sentence.
Must not move: every gate; the scanner path; the warnings and novelty lines on both paths; the privacy page.
Keep the check as test/input-paths-test.mjs. Add it to gates.sh only if it runs in the Codespace; otherwise document how to run it.
```

## Prompt 2 — A score shown as 75 carries the band below Good (confirmed)
```
Problem: the home page's default pair (Lemon Tart Pucker vs Cold Creek Kush) scores 0.7452. The page shows Math.round → "75" with matchBand(0.7452) → "Partial overlap", but the published method says 75 and up is Good. The display rounds up past a band edge. The same thing happens in the result score and summary, in the match-feedback payload (a rounded score beside a band taken from the unrounded one), and in scripts/drift.js.
Where: js/nose.*.js (heroScore, resultScore, resultSummary, the feedback payload), scripts/drift.js, js/match-math.*.js.
Probe: through scripts/lib/match.js, the hero pair gives 0.7452 → 75 → Partial overlap.
Fix: add one helper to match-math, shownScore(s) = Math.floor(s * 100 + 1e-9), and use it everywhere a score is shown or sent. Flooring means a shown number never sits above its band. The 1e-9 is required: 12 of the 56 accepted fixtures, scored against themselves, give 0.9999999999999998, which a plain floor shows as 99.
Must not move: cosine() and matchBand(). Do NOT regenerate match-golden.json. match-test clean; every gate green.
Should change: the hero reads 74 · Partial overlap. If the landing page should show a Good match, choose a different default pair; don't change the rounding. Record in the handoff the date the feedback score switched from round to floor.
```

## Prompt 3 — Known ACS reports are told "NOSE hasn't seen this lab's layout before" (confirmed)
```
Problem: 4 of the 8 accepted ACS fixtures carry novelty, all from furniture in `unmapped`: ACS-FLW-002 and ACS-PRR-001 ("Moisture"), ACS-LRS-002 ("License No."), and COA_GassiusClay_… ("Moisture", plus "AAGZ997-", part of a "Lab Batch #:" value). The card shows the novelty sentence whenever a usable read carries novelty, so these scans tell people something false.
Where: parse-coa.js, the filter in front of unmapped.add (~line 567).
Probe: node test/novelty-test.js lists those four, plus Harmony and hemp-bombs.
Fix: keep three things out of `unmapped`: structure labels, licence and ID labels, and the value on the line after a "Label:" or "Label #:". Do NOT add bare MOISTURE to SECTION_LABELS: that regex also ends rows in the look-ahead (~line 649) and would change readings. Use a check that only the diagnostic reads. Then make novelty-test FAIL when an accepted fixture carries novelty, because an accepted fixture's layout is known by definition.
Must not move: every terpene value, verdict and warning; `unmapped` on every other fixture. Harmony and hemp-bombs keep their notes, since both are refused.
Should change: only those four fixtures' unmapped and novelty. reparse.js --dry-run must show only ACS documents changing, each by "unmapped, novelty" alone. Then run it for real.
```

## Prompt 4 — One Method report is stored again on every download (re-rendering: confirmed; live duplicates: probe)
```
Problem: a document is keyed by the SHA-256 of the PDF's bytes, but Method Testing Labs' portal builds the PDF when it is downloaded. MTL-CAR-001 and MTL-LRS-001 print a batch date of 2/27/2025 and sign-offs of 3/3/2025, yet their PDFs were created on 2026-07-25 at 18:22 and 21:29 EDT, the same evening as three other Method downloads. So every fetch of one Method report adds a document, a PDF copy, an extraction and a parse. Three consequences:
- the privacy page says "We do not count how many times a report is fetched", but the archive keeps one dated row per fetch;
- batch_series, drift and lab-stats count one sample several times;
- storage grows per scan, not per report.
Kaycha and ACS PDFs look fixed: each was created on its printed completion day. Modern Canna's carry no creation date.
Probe, before editing:
1. A read-only script: documents sharing (lab, lab_id), and extraction text hashes shared across documents.
2. Scan one Method jar twice on the live site, a minute apart, then run 1 again.
3. Download the same PDF twice each from coaportal, yourcoa, ACS and Modern Canna; compare the SHA-256 of the bytes and of the extracted text.
If the text also differs between downloads, stop and show me the differing lines. Don't normalise text by guesswork.
Fix, if the bytes differ and the text matches:
- A new migration replaces save_scan: when a text is already stored for any document, reuse that document and write no new document row. Index extractions(text_sha256), and take the advisory lock on the text hash before the lookup.
- archive.js writes to the database first. It writes the PDF only when the database stored a new document, or when the database is down or not configured, so backfill still works.
- backfill reports a PDF whose text matches a stored document as a duplicate copy, not an orphan.
- batch_series becomes one row per sample, keyed on (lab, lab_id) where lab_id exists, with a copies count; drift and lab-stats count samples.
- Count the duplicates already stored and bring me the number. I'll choose between an admin cleanup and a privacy-page sentence, and that choice ships in the same push.
Must not move: A → B → A, the append-only grants, probe-db clean, every gate. store-test gains: same text with different bytes → one document; different text → two.
```

## Prompt 5 — What gets kept, and how to take something back out (rule: confirmed; risk: prospective)
```
Problem: looksLikeLabReport() keeps a PDF if ANY of three things holds: a recognised lab, the phrase "Certificate of Analysis", or a terpene read. detectLab() matches a lab's name anywhere in the text, so a receipt or product label that merely names Kaycha is kept whole and forever: nose_writer can't delete, and no removal tool exists. The endpoint is also an open, anonymous, permanent write path with no ceiling. The any-of-three rule came from my prompt.
Evidence: every fixture carries at least two of the three signals. 52 carry all three, the 6 ACS files lack the phrase, and Harmony lacks a terpene panel. Requiring two keeps the whole corpus.
Probe: new documents per UTC day so far, and any stored document that carries only one signal.
Fix:
1. Keep a PDF only when two signals hold: a recognised lab; the phrase; a terpene panel (terpenesTested not null, a printed total, or at least one terpene read). Apply the same rule in coa.js and backfill.
2. scripts/remove-document.js <sha>: admin URL only, a dry run unless --yes. It removes one document's parses, extractions, document row and PDF. It records the day and a one-word reason in nose.removals. It adds the file and text hashes to nose.withheld, which save_scan checks so the next scan doesn't store the file again. The PDF half must obey the database's answer (Prompt 4's database-first order).
3. Only if the probe shows daily volume far below it: a global cap on new documents per UTC day, checked in save_scan, with no per-person key. Above the cap the scan still works and nothing is kept.
Update the privacy page's "not a lab report" paragraph to the two-signal rule, and say how to ask for a removal.
Must not move: every fixture still kept (archive-wiring-test); every gate.
```

## Prompt 6 — Three privacy sentences claim more than is true (wording: confirmed; email links: dashboard check)
```
1. "never the time of day, so our records cannot be lined up against the server logs our host keeps." Row ids count up in arrival order, so the order of a day's scans survives. The page itself also says Blobs may note write times. Keep "never the time of day"; drop or qualify the rest.
2. "no column in the store can hold anything that identifies a person." The stored report text names lab staff; Modern Canna reports print the laboratory director's name. Say instead that it holds nothing about the person who scanned.
3. The handoff's open item: Supabase's sign-up and reset emails probably link to Supabase's own domain, so clicking one shows Supabase the person's IP address. Walk me through checking Authentication → Email Templates and URL Configuration in the Supabase dashboard. Then either route the links through nose-app.com or say it on the page.
Leave the "we do not count fetches" sentence to Prompt 4.
Must not move: check-trust clean; don't narrow its patterns. Show me each sentence before and after.
```

## Prompt 7 — Most reports can't be placed in time (confirmed)
```
Problem: batch_date is the harvest date, or else the report date. Only 20 of the 56 accepted fixtures get one: Kaycha 16 of 22, ACS 3 of 8, TerpLife 1 of 1. Modern Canna (0 of 13), Method (0 of 9) and ACT (0 of 3) get none. Yet all of them print a date: Modern Canna "Completed: 11/08/24 11:59", ACT "Report Created: 07/29/2025 18:04", Method "Batch Date: 8/27/2026, 4:00:00 AM". Kaycha and ACS print completion dates too ("Completed: 06/15/24", "Completion Date: 2026-06-24"). My Prompt 2 guessed the report-date labels instead of measuring them.
Probe: for every accepted fixture, print lab, harvestDate, reportDate, harvestOn and reportOn, plus every line ending in "Date:", "Completed:" or "Created:" with the line after it. Bring me the table before choosing labels.
Fix:
- Add testedOn (ISO), a new field, read from the row that says when the lab finished. Choose one label per lab from the probe table and name it in a comment. Use colon labels only: Modern Canna also prints a bare "Completed" status tile. Method prints no completion row, so choose deliberately between its "Batch Date" and its sign-off, and record why.
- coa-dates.js: also accept a one-digit month or day, and a trailing time (", 4:00:00 AM", " 11:59"). Both are unambiguous from a US lab. Keep refusing day-first, dotted and future dates.
- A new migration replaces batch_series: batch_date = coalesce(harvest_on, tested_on, report_on), plus a column saying which it is.
Must not move: every terpene value and verdict; every harvestOn value; every gate.
Should change: dated accepted fixtures rise from 20 toward 56, and coa-dates-test gains the new forms. reparse.js --dry-run: every document changes by "testedOn (new)" alone.
```

## Prompt 8 — Failures nobody sees, a restore never tried, reparse from unpushed code (from the handoff and the code)
```
1. pdf-store.read() has only ever answered a stand-in, and the PDF copies are the database's only backup on the free plan. Run node scripts/reparse.js --reextract --dry-run once against the real archive, and record the result in the handoff.
2. keep-awake failures and "archive incomplete" lines go to Netlify logs nobody reads. Add a weekly GitHub Action that runs a quiet check as nose_writer: connect, one read, then print only ok or FAIL with a reason. Print no lab, strain, text or address, because Actions logs on a public repo are public. Put only NOSE_DB_URL in as a repository secret, never the Netlify token, which can do anything the account can. GitHub emails when a scheduled run fails, and it pauses schedules after 60 days without repository activity; say both in the handoff.
3. A real reparse from a commit that isn't on main writes readings production never ran, and they become "latest": runs #2 and #5 were written before their commits deployed. Refuse a real run unless HEAD is on origin/main after git fetch. The handoff order becomes: push, deploy, then reparse.
Must not move: every gate; --dry-run still runs on anything.
```

## Left alone on purpose
- TERP_ALIAS folding caryophyllene oxide into caryophyllene is reachable only by importing a hand-made file, and fixing it changes scores.
- The npm audit warning hasn't been read.
- The terms page still has legal placeholders.
- The project notes say two real strains score 75 (Good), but the home page's pair scores 0.745, which the app bands Partial overlap.

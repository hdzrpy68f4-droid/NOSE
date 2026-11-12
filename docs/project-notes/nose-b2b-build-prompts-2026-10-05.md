# NOSE B2B build: prompts (2026-10-05)

Ten prompts build the dispensary plan in order, each ending green and committed. Prompt 1 alone gives you a sales tool: a coverage report on a dispensary's real catalog, with nothing stored anywhere.

The plan is your Claude Docs page "NOSE for Dispensaries — B2B Integration Plan". These prompts follow it as written, plus one correction made today: the widget's feed carries every batch a store has listed in its window, in stock or not. A shopper's past purchases are usually sold out, so without them the browser would have to ask NOSE for those batches and, in asking, say what the shopper bought.

Updated 2026-10-06: campaign palates are recorded as a later option, at the end of this file. The preamble and Prompt 5 each gained a line for them; if you copied either before today, copy it again.

## Settled before you paste

The prompts assume these. If you decide otherwise, change the named line before pasting.

- Palates are built in the shopper's browser; NOSE never holds purchase history. Decided 2026-10-06, with campaign palates kept as a later option.
- Catalog reports do not enter the lab-report archive: Prompt 3, item 3.
- Opt-in, one tap: Prompt 6, item 2.
- Attribution ("Flavor match by NOSE") is not in these prompts. Add it to Prompt 6's strings once you choose.

## Order

| # | Builds | Needs | New gate |
|---|---|---|---|
| 1 | Coverage report, local only | — | b2b-coverage clean |
| 2 | Schema, role, keys, the switch | — | b2b-store clean |
| 3 | Catalog upload, batch reader | 1, 2 | b2b-catalog clean |
| 4 | Feed and votes | 3 | b2b-endpoints clean |
| 5 | Ranking engine | 4 | b2b-rank clean |
| 6 | The widget and a demo page | 5 | b2b-strings clean, b2b-widget clean |
| 7 | Pinned releases, integration guide | 6 | b2b-release clean |
| 8 | Privacy page, then switch on | 2–7 | — |
| 9 | Pilot plan and report | 4 | b2b-pilot clean |
| 10 | Department submission kit | 6 | — |

## Preamble (paste first)
```
Repo: https://github.com/hdzrpy68f4-droid/NOSE. Read PARSER-HANDOFF.md §4–§7 and §13 first. Aroma only, no effect claims; never assert scraped numbers; the archive keeps nothing about the person who scanned. I'm a beginner in Codespaces: step-by-step commands, short explanations.
- These prompts build the dispensary (B2B) plan; I can paste any part of it you need. Its core promise: a shopper's purchase history never reaches NOSE. The dispensary's page hands the shopper's batch IDs to the shopper's own browser, and the widget builds the palate and ranks there.
- Run the prompt's probe BEFORE editing. If it doesn't show what the prompt expects, stop and tell me.
- bash scripts/gates.sh must say ALL GATES GREEN before and after. KAY-CAR-001 4.124 and KAY-PRR-001 0.944 unchanged. Each new test becomes a gate on its exact expected line, in the same commit.
- The maths has one home, js/match-math.*.js. Load it (window.NoseMatch in a page, scripts/lib/match.js in Node); never copy, re-implement or "improve" it. Scores show through shownScore() and bands through matchBand(), with matchBand()'s own names.
- B2B lives apart from everything consumer: schema b2b, role nose_b2b, its own Blobs stores and functions. Don't touch match-feedback.js, palate-sync.js or schema nose unless the prompt says so.
- No B2B record or log holds anything about a shopper: no name, contact, ID, purchase list, IP, user agent or time of day. Dates are UTC days. Logs say nothing on success and one line without detail on failure.
- Never estimate a terpene profile. A batch without an accepted read shows as having no terpene panel: never a guess, never a strain-name lookup.
- Everything B2B is off unless B2B_ENABLED=1 in Netlify's Production context and build-info.json says production. Dev and deploy previews never write to production, and nothing runs against the production database before the privacy page describes it (Prompt 8).
- If parse-coa.js, coa-dates.js or extract-text.js changes: node scripts/reparse.js --dry-run must show only the changes the prompt predicts. These prompts should not need to change them.
- build.sh renames a changed js/ file; commit the renamed file.
- Where a design depends on how Netlify, Supabase or browsers behave, check the current docs and cite the page. Don't rely on memory.
- Record what you built in PARSER-HANDOFF.md §14, "Dispensary integration", in the same commit. Commit when green.
- §14 ends with a "Later" list of wanted work not yet built. If campaign palates isn't on it, add: "Campaign palates: an email or text to opted-in shoppers when a new batch matches their palate. Wanted as an option after the pilot. Preferred build: the dispensary's server runs the ranking engine on purchase history it already holds, so NOSE never receives it."
```

## Prompt 1 — The coverage report, local only
```
Goal: the first thing a dispensary sees is its own coverage report: how many of its in-stock inhalables have a terpene panel NOSE can read, by category and by lab, and every one it can't, with the reason. Build it as a Codespace script that writes nothing except a local folder: no database, no archive, no endpoint.

Where: new netlify/functions/lib/fetch-report.js; netlify/functions/coa.js; new scripts/b2b-coverage.js; new docs/B2B-CATALOG-FORMAT.md; new test/b2b-coverage-test.js and test/fixtures/b2b/; scripts/gates.sh; .gitignore.

Probe, before editing:
1. Show me coa.js's fetch chain (validateUrl, isBlockedHost, fetchOnce, fetchPdf, looksLikeHtml, resolvePdfFromPage), every test that imports from coa.js, and every test that reads coa.js's source text.
2. Confirm nothing outside coa.js can reach that chain today.

Build:
1. Move the chain into lib/fetch-report.js unchanged. coa.js requires it, keeps every export it has today (_resolvePdfFromPage included), and its replies stay byte-identical. Update §12 where it says where the fetcher lives.
2. docs/B2B-CATALOG-FORMAT.md, the CSV a dispensary exports, one row per listed batch: product_id, batch_id, category (flower | pre-roll | vape | concentrate), route (smoking | inhalation), name, brand, coa_url, in_stock (yes | no), product_url, thc_percent, cbd_percent. Header row, UTF-8. Any other column refuses the file, by name. A column whose name looks personal (PERSONAL_KEYS from lib/store.js, plus customer, patient, card, license, dob, address) refuses the whole file, so a wrong export is never read.
3. scripts/b2b-coverage.js <catalog.csv> [--out dir] [--limit N]: each in-stock row's coa_url fetched through fetch-report.js, one at a time with a pause between, under coa.js's deadlines; extracted with extract-text.js; parsed with parseCoa. It never calls archiveScan or storeScan.
4. The report: counts of in-stock inhalables, accepted reads, refused reads (rejectReasons verbatim), no link and fetch failed, by category and by lab, with the denominator beside every share. Flagged, never fixed: a productClass that isn't the row's category family (pre-roll counts as flower); a report whose batch and labId don't contain the row's batch_id; one coa_url on two batches. Numbers appear only for accepted reads: totalTerpenes, and the top three as share of total through normalize() loaded by scripts/lib/match.js. Writes report.md and report.csv to --out (default b2b-out/, added to .gitignore) and prints the summary.
5. test/b2b-coverage-test.js, offline: a catalog in test/fixtures/b2b/ whose links a stand-in fetch serves from already-tracked fixture PDFs, as test/duplicates-test.js does. Cover an accepted read, a refusal, a missing link, a failed fetch, a category mismatch, an unknown column, a personal column, and storeScan never reached. Prints "b2b-coverage clean". Add the gate.

Must not move: coa.js's replies; the input-paths, resolver and archive-wiring gates; the archive, which nothing here writes to; every gate.

Done when: ALL GATES GREEN with the new gate, you've shown me the test catalog's report, and you've walked me through running it on a real export.
```

## Prompt 2 — Schema, role, keys and the switch
```
Goal: a home for dispensary data that cannot mix with the archive or hold anything about a person: its own schema and role, stores with keys, and one switch that keeps every B2B function off.

Where: new supabase/migrations/<timestamp>_nose_b2b.sql; new netlify/functions/lib/b2b-store.js and lib/b2b-flag.js; new scripts/b2b-store.js; the password script for the new role; scripts/check-published.js; scripts/probe-db.js; new test/b2b-store-test.js; scripts/gates.sh.

Probe, before editing:
1. Show me how nose.holds_no_person() and lib/store.js's PERSONAL_KEYS are kept identical, and how test/store-test.js applies the migrations on PGlite.
2. Show me nose_writer's grants and how probe-db.js audits grants.

Build:
1. Schema b2b, never public, reachable only through pg from server code and Codespace scripts:
   - stores: id, slug, display_name, allowed_origins (https only), window_months (default 12), guardrail settings, created_on.
   - store_keys: store_id, kind (secret | public), key_sha256, created_on, revoked_on. A key is 32 random bytes with a visible prefix, nsk_ for secret and npk_ for public; only its hash is stored.
   - batches: one row per batch a store has listed, so past purchases stay findable: store_id, batch_id, product_id, list_position, category, route, name, brand, coa_url (origin and path only; query and fragment dropped, as the archive does), product_url, in_stock, thc_percent, cbd_percent, first_listed_on, last_listed_on. Primary key (store_id, batch_id).
   - batch_reads: one current read per (store_id, batch_id): read_on, lab, product_class, usable, reject_reasons, terps (as the parser read them, only when usable), total_terpenes, moisture, water_activity, harvest_on, report_on, read_by, warnings.
   - No column for a shopper, a purchase or an order, anywhere. holds_no_person() as a CHECK on every jsonb column.
2. Role nose_b2b: SELECT, INSERT and UPDATE on b2b tables; no DELETE, no TRUNCATE, nothing in schema nose. NOSE_B2B_DB_URL uses the transaction pooler, the embedded CA and no sslmode, exactly like NOSE_DB_URL. Its password is set by SCRAM verifier only, like set-writer-password.js.
3. lib/b2b-store.js mirrors lib/store.js: a fixed field list per write, person keys refused before anything is sent, bounded connections, a no-op without NOSE_B2B_DB_URL, scrubbed errors.
4. lib/b2b-flag.js: b2bEnabled() is true only when B2B_ENABLED === '1' and build-info.json's deployContext is 'production'.
5. scripts/b2b-store.js, admin, with NOSE_DB_ADMIN_URL: create <slug> --name --origin; add-origin; rotate-keys (prints the new keys once and logs nothing); revoke; delete-store <slug> [--yes] for the end of a license, a dry run without --yes.
6. check-published.js fails the build on any nsk_ string in a tracked or published file.
7. test/b2b-store-test.js on PGlite: applies after every existing migration; nose_b2b can upsert but cannot DELETE, TRUNCATE or read schema nose; a personal key at any depth is refused in both layers, asserting the error text; key hashing; a delete-store dry run changes nothing. Prints "b2b-store clean". Add the gate. Extend probe-db.js's grant audit to nose_b2b without loosening any existing check.

Must not move: existing migrations (add a new one only); nose_writer's grants; the archive; every gate.

Done when: ALL GATES GREEN with the new gate, and you've walked me through supabase db push, setting nose_b2b's password, and adding NOSE_B2B_DB_URL as a Codespaces secret. Not in Netlify yet.
```

## Prompt 3 — Catalog upload and the batch reader
```
Goal: a dispensary sends its catalog, and NOSE reads each listed batch's report once. The widget then has values for every batch the store listed in its window, not only today's stock.

Where: new netlify/functions/b2b-catalog.js, a (Request) function as palate-sync.js is; new scripts/b2b-read-catalog.js; scripts/b2b-coverage.js gains --store <slug>; lib/b2b-store.js; new test/b2b-catalog-test.js; scripts/gates.sh.

Probe, before editing:
1. Show me how palate-sync.js caps its body and keeps only declared fields.
2. Run node scripts/b2b-coverage.js on the test catalog: the reader this prompt reuses.

Build:
1. POST /.netlify/functions/b2b-catalog with Authorization: Bearer nsk_…, compared by hash in constant time. The body is the CSV from docs/B2B-CATALOG-FORMAT.md, size-capped, refused on the same columns as the coverage script. Each upload is a whole snapshot: listed batches upsert with their list_position, and batches absent from the file become in_stock = false and are kept. The reply holds counts only: received, upserted, marked out of stock, and refused rows by row number and reason. 404 unless b2bEnabled().
2. scripts/b2b-read-catalog.js --store <slug> [--limit N] [--dry-run] [--reread]: every listed batch with a coa_url and no current read, through the coverage script's fetch, extract and parse; writes batch_reads. Terpene values are stored only for usable reads; a refusal keeps its reasons and no values. Never fill a batch from another batch, another store or a strain name.
3. Catalog reports do not enter the archive: nothing here writes to schema nose or the coa-pdf store.
4. scripts/b2b-coverage.js --store <slug> prints the same report from the database.
5. Until Prompt 8's privacy section is live, run these only on PGlite, a local database or --dry-run.
6. test/b2b-catalog-test.js on PGlite with a stand-in fetch: an upload; a re-upload without one batch (out of stock, row kept); refused files; wrong, missing and revoked keys; flag off answers 404; the reader's accepted and refused reads; --dry-run writes nothing; schema nose untouched. Prints "b2b-catalog clean". Add the gate.

Must not move: coa.js, the archive and their tests; every gate.

Done when: ALL GATES GREEN with the new gate, and you've shown me the coverage report from PGlite matching the CSV run.
```

## Prompt 4 — Feed and votes
```
Goal: the widget's only two calls to NOSE. The feed is the same for every visitor of a store; a vote carries nothing about who voted.

Where: new netlify/functions/b2b-feed.js and b2b-vote.js; netlify/lib/beacon.js (reuse its helpers, change none of their behavior); new test/b2b-endpoints-test.js; scripts/gates.sh.

Probe, before editing:
1. Show me match-feedback.js's validation and key layout, and §13's "Still open" note: the app sends matchBand()[1] (Strong, Good, Moderate, Low), and match-feedback.js refuses Moderate and Low. B2B must not repeat it.
2. How Netlify caches a function's response, and the CORS rules for a cross-origin GET and for sendBeacon with a text/plain body. Check the current docs and cite them.

Build:
1. GET /.netlify/functions/b2b-feed?key=npk_…: the public key names a store and is not a secret. The request's Origin must be in that store's allowed_origins; the reply echoes that origin in Access-Control-Allow-Origin with Vary: Origin, and no other origin gets data. One reply for every visitor: every batch listed within the store's window, each with batch_id, product_id, list_position, category, route, name, brand, product_url, in_stock, thc_percent, cbd_percent, lab, harvest_on, report_on, usable, total_terpenes and terps (only when usable), plus the store's guardrail settings. No sales, no quantities. Briefly cacheable.
2. POST /.netlify/functions/b2b-vote, text/plain JSON so sendBeacon needs no preflight: key, candidate (a product_id in that store), score (integer 0 to 100, from shownScore), band (exactly one of Strong, Good, Moderate, Low), palateSize, vote (up | down). Nothing else is accepted: no palate list, no shopper ID, no client time. A new Blobs store, b2b-votes, one blob per vote, keyed votes/<store slug>/<band>/<vote>/<UTC day>/<random>. No time of day in the key or the value. A per-store daily cap from an env var, with a conservative default you state; over it, the vote is dropped and the reply is the same. The same origin rule. 204 on valid input.
3. Both answer 404 unless b2bEnabled().
4. test/b2b-endpoints-test.js: two visitors get byte-identical feeds; a foreign origin gets no CORS header and no data; a revoked key; one vote per band, all four stored; every extra field refused; no time of day in a stored vote; the cap. Prints "b2b-endpoints clean". Add the gate.

Must not move: match-feedback.js and its store; palate-sync.js; every gate.

Done when: ALL GATES GREEN with the new gate.
```

## Prompt 5 — The ranking engine
```
Goal: every decision the widget makes, as plain functions with no page and no network, scoring exactly as the app scores. Keep it free of the page: campaign palates, a later option, would run this same file on a dispensary's server.

Where: new js/b2b-rank.js, a classic script like match-math (window.NoseRank in a page, module.exports in Node); build.sh (syntax check, fingerprint, and a page that loads it must load js/match-math first); new test/b2b-rank-test.js; scripts/gates.sh.

Probe, before editing:
1. Show me how js/match-math.*.js exposes itself, the pattern test/match-test.js uses to find a copy of the maths, and the call js/nose.*.js makes to score a candidate against a palate.
2. Show me the feed shape from Prompt 4's test.

Build. This file holds no maths: every number comes from NoseMatch.
1. palateFrom(feed, purchases, removed): purchases are [{batchId, day}] from the page. Keep batches that are in the feed, inhalable, usable, inside the store's window and not removed by the shopper; the palate is averageProfiles() of their terps. Return the basis too: the batches used, and for every other purchase why it was skipped (not listed, no read, refused, outside the window, removed).
2. rank(feed, palate, {category, routes, guardrail}): in-stock batches of that category, inside the shopper's routes. The guardrail, when the store sets it, keeps THC and CBD within the store's band around the basis batches' median: it filters and never reorders. Score each batch with the same call the app makes, show it with shownScore() and matchBand(). Scored batches by score, ties in list_position order; then batches with no usable read, unscored and labeled. No name field is ever read.
3. soldOut(feed, purchases): if the shopper's most-bought product has no batch in stock, rank against that product's latest purchased batch alone.
4. voteScore(feed, purchases, productId): the bought product scored against the palate of the other purchases, for the post-purchase vote.
5. test/b2b-rank-test.js: every pair in test/fixtures/match-golden.json scores through rank() exactly as match-math scores it; a profile scaled 3x scores the same; unread batches come after scored ones and carry no number; routes and guardrail exclude and never reorder; ties keep list_position; a removed batch leaves the palate; voteScore leaves out the voted batch; no name field is read. Prints "b2b-rank clean". Add the gate.

Must not move: js/match-math.*.js, not one byte; match-test; every gate.

Done when: ALL GATES GREEN with the new gate.
```

## Prompt 6 — The widget and a demo page
```
Goal: <nose-matches>, the element a dispensary places on its page: the opt-in, the "closest to your usual" rail, the sold-out panel, the basis list and the post-purchase vote, all in factual, lab-data words.

Where: new js/b2b-widget.js and css/b2b-widget.css; a shared bar file (Probe 2); new b2b/demo/index.html; new test/b2b-strings-test.js and test/b2b-widget-test.mjs (Playwright, after the build, like input-paths); build.sh; scripts/gates.sh.

Probe, before editing:
1. Show me renderBar(), familyShares(), FAMILIES and FAMILY_ORDER in js/nose.*.js and what they depend on.
2. Propose how the widget gets the same bar with no second copy: move them to one js/ file that both load, proving the app's DOM is unchanged (the input-paths gate plus a DOM snapshot of /app before and after). If that isn't clean, stop and show me the options.

Build:
1. A custom element in a shadow root, styled by its own stylesheet file. No inline script, no inline style, no eval: it must run under a CSP of script-src 'self' <NOSE origin>; style-src 'self' <NOSE origin>; connect-src <NOSE origin>. Attributes: key, category, purchases (JSON), routes (JSON), consent (granted | denied | unknown), group (test | control), mode (rail | sold-out | vote), product (vote mode).
2. Unless consent is granted, purchases are ignored entirely. consent=unknown shows one sentence and one button: "Sort by flavor using what I've bought here. My purchases stay with this store." The button fires a nose:consent event; the page records consent and sets the attribute. NOSE records nothing. group=control renders nothing.
3. Each card: name, brand, matchBand()'s label with shownScore(), the shared bar, and THC and CBD as plain facts. A batch without a usable read says "No terpene panel on this batch's report". Cards link to product_url; the widget never adds to a cart.
4. The basis list: "Based on N products you've bought since <month>", each with "Remove from my palate", kept in the browser and fired as nose:palate-removed so the page can keep it.
5. mode=vote, on order history: "Was the flavor close?" with up and down for a matched product the shopper bought, sent by sendBeacon to b2b-vote with Prompt 4's fields only.
6. One strings file holds every visible word, with a Florida variant, so a compliance team can read it whole. test/b2b-strings-test.js fails on any effect or recreational word (relax, calm, sleep, energ, focus, uplift, euphor, sedat, mood, high, buzz, stoned, pain, anxiety, stress, treat, relief, cure, and their forms). If a string trips it, reword the string; never narrow the list.
7. Only two kinds of request leave the page: the feed and the vote. b2b-widget-test.mjs intercepts every request and fails if one carries a purchased batch ID or anything from the purchases attribute. It also renders each mode against a stand-in feed and checks keyboard reach and the bar's role and label.
8. b2b/demo/index.html: the widget against a test store, with a made-up purchase list the presenter types in, never a real shopper's. Noindex, not linked from the site, and it passes build.sh's CSP and inline checks.

Must not move: the app's look and behavior (input-paths gate, your DOM snapshot); match-math; every gate.

Done when: ALL GATES GREEN with "b2b-strings clean" and "b2b-widget clean", and you've shown me a screenshot of every mode from the demo.
```

## Prompt 7 — Pinned releases and the integration guide
```
Goal: a dispensary pins one exact widget version with an integrity hash, so no NOSE deploy changes its page unannounced, and git still holds one copy of the maths.

Where: new scripts/b2b-release.js and scripts/b2b-release-check.js; whatever serves releases (Probe 2); _headers if needed; new docs/B2B-INTEGRATION.md and docs/B2B-RELEASES.md; tests; scripts/gates.sh.

Probe, before editing:
1. Show me why the obvious answers fail: build.sh deletes stale hashed bundles; scripts/lib/match.js and match-test expect exactly one js/match-math file; match-test fails on any other file holding the maths; a cross-origin script with integrity needs crossorigin="anonymous" and an Access-Control-Allow-Origin header.
2. Check this direction against current Netlify docs before agreeing to it. scripts/b2b-release.js refuses a dirty tree or a commit not on origin/main; builds one file from that commit (match-math, b2b-rank, the bar, the widget, in that order) plus the stylesheet; uploads both to a Blobs store, b2b-releases, under a new version, never overwriting one; and records only the version, commit and sha384 values in docs/B2B-RELEASES.md. A function serves a version with Cache-Control immutable, Access-Control-Allow-Origin: *, Cross-Origin-Resource-Policy: cross-origin and the right content type. b2b-release-check.js downloads every version and checks it against the doc. If you see a simpler way that keeps both guarantees, show me first.

Build: what we agree on, with an offline test of the builder as a gate (same inputs give the same bytes; a dirty tree is refused), printing "b2b-release clean". Then docs/B2B-INTEGRATION.md for a dispensary's developer: the snippet with integrity and crossorigin; the CSP lines to add; render the purchases attribute only after consent; the consent and palate events; group for the A/B test; the catalog CSV and the upload call; routes; and what NOSE never receives.

Must not move: match-test's one-copy rule, with no path exempted; the app's bundles; every gate.

Done when: ALL GATES GREEN with the new gate, and a first release published from the Codespace and checked by b2b-release-check.js, with each step walked through.
```

## Prompt 8 — Privacy page, then switch on
```
Goal: the privacy page describes the dispensary program in full before any of it is switched on, as it did for the archive. Then switch it on.

Where: privacy/index.html (a new section and a "What changed" entry); terms/index.html only where a sentence would become untrue; PARSER-HANDOFF.md §14.

Probe, before editing:
1. List every sentence on the privacy, terms, home and app pages that the program would make untrue or incomplete. "We do not ask for … anything about what you buy or consume" stays true for nose-app.com accounts, but needs a line saying a dispensary shopper's purchases never reach NOSE.
2. Show me what each B2B store holds, read from the migration and the functions, not from the plan or these prompts.

Build: a section, "Dispensaries that use NOSE", naming specifically: what a licensed dispensary sends (catalog fields, COA links); what NOSE reads and keeps (each listed batch's reading, and that catalog reports do not enter the lab-report store, per Prompt 3); what the widget fetches (one feed, the same for every visitor); what a vote holds (store, product, score, band, palate size, the day) and what it never holds; that a shopper's purchases go from the dispensary to the shopper's own browser and never to NOSE; where each store lives and for how long; and how a dispensary's data is deleted when its license ends. Marked "not switched on yet" until the switch. Name what is kept; never write that nothing is (check-trust will catch it: reword, don't narrow).

Then walk me through, one step at a time: deploy with the page; check it live; add NOSE_B2B_DB_URL and B2B_ENABLED=1 in Netlify's Production context; redeploy with "not switched on yet" removed and the date added, in one push; then the first checks: the feed answers the test store's origin and refuses others, a test vote lands, and nothing reached schema nose.

Must not move: every true sentence on those pages; check-trust's patterns; every gate.

Done when: ALL GATES GREEN, the section is live, and the switch is on.
```

## Prompt 9 — Pilot plan and report
```
Goal: the pilot's test is written down before day one, and its result is computed the same way whether the module helps or not.

Where: new docs/B2B-PILOT-PLAN.md and docs/B2B-PILOT-EXPORT.md; new scripts/b2b-sample-size.js and scripts/b2b-pilot-report.js; new test/b2b-pilot-test.js; scripts/gates.sh.

Probe, before editing: show me scripts/lab-stats.js and test/analysis-test.js, so the report keeps the analysis layer's habits: it only reads, and a denominator sits beside every share.

Build:
1. docs/B2B-PILOT-PLAN.md, a fill-in template: store and dates; how the page assigns groups (NOSE never learns who is in which); the primary metric (inhalable orders per assigned shopper); secondary metrics (sold-out recovery, a matched product bought again within 60 days, opt-in rate); the hypothesis check (up-vote share by band, Strong down to Low); guardrails (average order value, copy and route incidents); sample size and stopping rule; and the line "published either way".
2. scripts/b2b-sample-size.js --baseline <rate> --lift <relative> [--alpha 0.05] [--power 0.8]: shoppers per group for a difference in proportions. Test it against worked examples from a cited reference, never against its own output.
3. docs/B2B-PILOT-EXPORT.md: what the dispensary exports at the end, one row per assigned shopper, counts only: group, orders, orders with an inhalable, revenue, sold-out sessions and how many ended in an order, opted in, bought a matched product again. No identity column; a personal column refuses the file, as the catalog does.
4. scripts/b2b-pilot-report.js <export.csv> --store <slug>: each metric per group with counts beside rates and a 95% interval, and the band table from b2b-votes. Before the pre-registered sample size it gives no verdict, only how far short the run is.
5. test/b2b-pilot-test.js with synthetic exports: a known difference is found, a null reads as null, a personal column is refused, a short run says so. Prints "b2b-pilot clean". Add the gate.

Must not move: every gate. Nothing here writes anywhere.

Done when: ALL GATES GREEN with the new gate, and you've walked me through the template.
```

## Prompt 10 — Department submission kit
```
Goal: everything a Florida partner needs to submit the module for Department approval, generated from the real widget, so the submission shows exactly what ships.

Where: new scripts/b2b-compliance-kit.js (Playwright, like input-paths); output to b2b-out/; PARSER-HANDOFF.md §14.

Probe, before editing: render every mode in b2b/demo/ and show me; confirm the strings file's Florida variant covers every visible string.

Build: render each mode and state (consent unknown, rail, sold-out, a batch with no panel, vote) with the Florida strings, at phone and desktop widths; save PNGs; write strings.md (every visible string and where it appears) and data.md (the privacy page's dispensary section as published). It uses the demo's made-up purchases unless I pass --store, and then only that store's public feed.

Must not move: every gate. Nothing here writes outside b2b-out/.

Done when: you've shown me the folder for the test store.
```

## Not prompts: do these yourself

- Book a Florida cannabis-regulatory attorney for the license, the data terms, and how the advertising rule (64ER25-6, and Rule 64-4.227 if adopted) applies to a vendor's module.
- Ask your payment processor, in writing, whether it accepts MMTCs as customers of a software vendor.
- Move Supabase and Netlify to paid plans with backups before a licensee depends on them.
- The Department submission is the partner's to make; Prompt 10 builds its kit.

## Left alone on purpose

- The consumer app's refused Moderate and Low votes (§13, "Still open"). It needs its own prompt; Prompt 4 only keeps B2B from repeating it.
- POS and menu-platform connectors: after the pilot, one platform at a time.
- A "For dispensaries" page on the site: write it once the pilot has results to describe.

## Later: campaign palates (wanted, not built yet)

An email or text to opted-in shoppers when a new batch matches their palate. You want it as an option. It waits for the pilot, because the message rests on the match score and the pilot is what tests the score.

- **Preferred build:** the dispensary's server runs the ranking engine (Prompt 5's file, in Node) on purchase history it already holds, so NOSE never receives it. Prompt 5 keeps the engine free of the page for this.
- **The alternative:** NOSE stores palates under an ID the dispensary assigns. NOSE then holds patient-linked data, so the privacy page, data terms and security review change before it ships.
- **Either way:** its own opt-in, separate from the menu's. The dispensary sends the messages; NOSE never receives a phone number or email. Counsel checks the consent rules for texts and email, and whether the templates need Department approval.
- **In the repo:** the preamble has each build session keep it on PARSER-HANDOFF.md §14's "Later" list.
- **When it's time:** ask for a Prompt 11, written against what Prompts 1–10 actually built.

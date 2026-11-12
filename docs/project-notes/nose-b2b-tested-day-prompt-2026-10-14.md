# NOSE dispensary catalogs: the tested day (prompt, 2026-10-14)

This is one prompt. It carries `testedOn` into the dispensary side, so each catalog batch's stored reading and each store's feed get it. `testedOn` is the day the lab finished. The parser has read it since 2026-10-14, and the archive and the card use it, but b2b keeps only the harvest and report days. The prompt closes "Store catalogs carry no `testedOn`" on the Still open list in PARSER-HANDOFF §13.

Three things turned up while writing it:

- **It changes data, not screens.** Nothing on the B2B side shows a date today: the widget, the ranking engine and the demo page read neither `harvest_on` nor `report_on`. A shopper sees nothing new. What it buys is a feed that dates batches the way the card does, so a date on the widget's cards later needs no database change.
- **Now is the cheap time.** b2b holds no reading yet. The only store so far, `test-shop`, was deleted on October 9 with none. Done now, nothing has to be fetched from a lab a second time.
- **The gap is wider than the handoff line says.** That line names Method and Modern Canna. On the demo test store, 15 of 28 readings carry no date: every Method, Modern Canna and ACT batch, 3 of ACS's 5 and 1 of Kaycha's 10.

## Settled before you paste

The prompt assumes these. If you decide otherwise, change the named line before pasting.

- Data only: no date on the widget's cards. See "Left alone on purpose", below.
- `tested_on` is kept the way `harvest_on` and `report_on` are. It is kept whatever the verdict and never for a link that gave no report. The feed takes it only from the reading NOSE stands by. Build 1 and 2.
- The feed's new field comes after `harvest_on`: harvest, tested, report, the order `coa.js` sends them in. The pinned widget reads fields by name and ignores one it doesn't know, so no new release is needed. Build 2.
- The privacy page says it twice. The dispensary section names the new day, and a one-sentence seventh entry in "What changed" says when it was added. The third entry did the same in September for two fields read from each report. Build 5.
- No live store run. Every link in the test catalog but two points at a made-up host or a private address, so a live read would mostly record failed fetches. The gates run every new statement against every migration, and the first real store's reader run will be the first live one. "Done when".

## Preamble (paste first)
```
Repo: https://github.com/hdzrpy68f4-droid/NOSE. Read PARSER-HANDOFF.md §4–§7, §13 and §14 first. Aroma only, no effect claims; never assert scraped numbers; the archive keeps nothing about the person who scanned. I'm a beginner in Codespaces: step-by-step commands, short explanations.
- Run the prompt's probe BEFORE editing. If it doesn't show what the prompt expects, stop and tell me.
- bash scripts/gates.sh must say ALL GATES GREEN before and after. KAY-CAR-001 4.124 and KAY-PRR-001 0.944 unchanged. A changed test keeps its gate's exact expected line.
- B2B lives apart from everything consumer: schema b2b, role nose_b2b, its own functions and stores. Don't touch coa.js, match-feedback.js, palate-sync.js or schema nose.
- No B2B record or log holds anything about a shopper. A batch without an accepted read shows no terpene panel: never a guess, never a strain-name lookup.
- Don't touch the parser (parse-coa.js, coa-dates.js, extract-text.js) or the maths (js/match-math.*.js). If the prompt seems to need either, stop and tell me.
- A pushed migration is never edited. A new one is named to sort after every file in supabase/migrations: db push refuses one that sorts before the last it applied (§13, "When the lab finished").
- The privacy page and the B2B code move together (§14, Still open). Show me every new or changed sentence before committing. Name what is kept; never write that nothing is (check-trust will catch it: reword, don't narrow).
- build.sh renames a changed js/ file; commit the renamed file. This prompt should change none.
- Where a design depends on how Supabase, Postgres or Netlify behave, check the current docs and cite the page. Don't rely on memory.
- Record what you built in PARSER-HANDOFF.md §14, above its Still open list, in the same commit, and take any Still open item it closes off its list. Commit when green.
```

## The tested day in dispensary catalogs
```
Goal: a dispensary's batch readings and its feed carry the day the lab finished (testedOn) beside the harvest and report days, as the archive and the card have since 2026-10-14. Today b2b keeps only those two, so most readings carry no date: 15 of 28 on the demo test store. This changes data, not screens: nothing on the B2B side shows a date yet.

Where: new supabase/migrations/<timestamp>_nose_b2b_tested_on.sql; netlify/functions/lib/b2b-store.js; netlify/functions/b2b-feed.js (its header); scripts/b2b-demo-feed.js and b2b/demo/test-store.json; scripts/probe-db.js; test/b2b-store-test.js, test/b2b-catalog-test.js and test/b2b-endpoints-test.js; privacy/index.html; PARSER-HANDOFF.md §7, §13 and §14.

Probe, before editing:
1. Show me every place the parser's dates travel in B2B: READ_FIELDS, buildRead, UPSERT_READ_SQL, UPSERT_UNFETCHED_SQL, FEED_SQL, FEED_FIELDS and feedBatch in lib/b2b-store.js; the nothing_read_unless_fetched constraint; b2b-feed.js's header; reading() in scripts/b2b-demo-feed.js. Expect testedOn and tested_on in none of them.
2. Show me everything that reads the feed's harvest_on or report_on. Expect nothing in js/: the widget, the ranking engine and the demo page show no date. If something does, stop and tell me: this prompt would then change a screen.
3. On the demo test store (b2b/demo/test-store.json, read from the fixtures), by lab: readings dated by harvest_on, by report_on alone, and by neither; and for each with neither, the parser's testedOn today. Expect 28 readings: 11 by harvest, 2 by report, 15 by neither (ACS 3 of 5, ACT 2 of 2, Kaycha 1 of 10, Method 3 of 3, Modern Canna 6 of 6), and a testedOn on all 15.

Build:
1. The migration, named to sort after every file in supabase/migrations (today the last is 20261015000000_nose_tested_on.sql). b2b.batch_reads gains tested_on, a date, NULL when the report gives none, with a comment; and a CHECK of its own, so a reading from a link that gave no report holds no tested_on. nothing_read_unless_fetched stays as pushed. Nothing else: no DROP, no GRANT or REVOKE (nose_b2b's table grants cover a new column), nothing in schema nose.
2. lib/b2b-store.js. testedOn joins READ_FIELDS after harvestOn, and buildRead keeps it as it keeps harvestOn and reportOn, whatever the verdict. UPSERT_READ_SQL writes it; UPSERT_UNFETCHED_SQL clears it with the other two days. FEED_SQL selects it from the current reading only, as it does the other two; FEED_FIELDS and feedBatch gain tested_on after harvest_on. Update the comments that speak of a reading's two days, as feedBatch's does (not the listing days, which keep theirs), and b2b-feed.js's list of fields.
3. scripts/b2b-demo-feed.js carries tested_on. Rewrite b2b/demo/test-store.json with it and commit the file.
4. scripts/probe-db.js, beside the reading-source check and as the admin: "the b2b tested_on migration is pushed: b2b.batch_reads keeps the day the lab finished".
5. privacy/index.html. In the dispensary section's "What we read and keep", "the harvest and report dates" becomes "the harvest date, the day the laboratory finished testing and the report date". The feed paragraph's "the report dates" already covers every date a report gives, so it stays. "What changed" gains a seventh change, one sentence, dated the day it goes live: a dispensary's batch readings now also keep the day the laboratory finished testing, a date printed on the report, about the product and not about anyone. Show me both before committing.
6. Tests. Every gate keeps its expected line.
   - b2b-store-test: batch_reads' columns end in tested_on; the list of date columns gains it; buildRead keeps a refusal's testedOn, and its keys are still READ_FIELDS; every fixture's stored tested_on is the parser's testedOn (54 of the 59 carry one). The new migration only adds (one ADD COLUMN, one ADD CONSTRAINT, comments), sorts after 20261015000000_nose_tested_on.sql, is pinned byte for byte to its first push as b2b-catalog-test pins the reading-source one, and joins the no-effect-wording scan ("effect" itself is on that list).
   - b2b-catalog-test: the reader keeps each reading's tested_on as the parser gives it. The Method batch read through its portal (5637041429622699, MTL-FLW-002): 2026-08-31, with no harvest or report day. Modern Canna's (FJ02002-08, MCL-FLW-002): 2021-10-05. KAY-CAR-001's: 2025-07-11, beside its harvest day 2025-07-07. The database refuses a reading from a link that gave no report with a tested_on, by the new CHECK's name, and a dated reading replaced by one keeps none.
   - b2b-endpoints-test: the pinned field list gains tested_on after harvest_on. The accepted reading carries 2025-07-11; the refused TerpLife one null (TerpLife has no row); a link that gave no report, a corrected link and no link, null.
7. PARSER-HANDOFF.md: the record in §14. Take "Store catalogs carry no testedOn" off §13's Still open, noting that the probe found the gap wider than it named. §7's testedOn paragraph says b2b keeps it too.

Must not move: the parser, so no reparse; coa.js and its replies; schema nose and the archive; every pushed migration; nose_b2b's grants; match-math and match-golden.json; every score, band and ranking; every other field of the feed and of test-store.json; the reader's 19 readings and 14 accepted on the test catalog; every js/ file, so build.sh renames nothing and no release is needed (release 1 reads the feed by name: §14, "The feed and the vote are not versioned"); the compliance kit's 10 screens and 37 PNGs; every gate's expected line.

Should change:
- The demo test store: readings with no date, 15 of 28 to 0 of 28. tested_on on 26 of its 30 batches: null on TerpLife's two readings, which keep their report day, and on the two batches with no reading. Dated, by lab: ACS 2 to 5 of 5, ACT 0 to 2 of 2, Kaycha 9 to 10 of 10, Method 0 to 3 of 3, Modern Canna 0 to 6 of 6, TerpLife 2 of 2. In test-store.json, one new line per batch and nothing else.
- The reader on the test catalog: 14 of its 19 readings carry tested_on, every accepted one. Four accepted readings get their first date: KAY-AIO-001 on two batches, the Method batch and Modern Canna's.
- probe-db: one more check. The privacy page: one phrase and one sentence; the kit's data.md carries both.

Done when: ALL GATES GREEN; you've shown me the probe's counts and both privacy sentences before committing; and you've walked me through, one step at a time:
1. bash scripts/gates.sh.
2. A read-only count as nose_b2b, from a scratch script you give me and don't commit, counts only: how many stores, batches and readings b2b holds. Expect 0, 0 and 0 (test-shop was deleted on 2026-10-09 with no reading). If it shows any reading, stop: it would need --reread, which fetches every report again from the labs.
3. npx supabase db push --db-url "$NOSE_DB_ADMIN_URL" (one migration), then node scripts/probe-db.js: probe clean, the new check among it. This comes before the deploy, because the feed and the reader read the new column.
4. git push.
5. Once the deploy is live: b2b-feed answers 400, asked without a key; and node scripts/b2b-compliance-kit.js, without --offline, ends "compliance kit written: ... 10 screens, 37 PNGs". It writes the kit only when the live privacy page matches this checkout word for word.
```

## Left alone on purpose

- **A date on the widget's cards.** It needs new strings in both variants, which the strings test reads; new compliance-kit screens; a new release that each store chooses to pin; and in Florida perhaps the Department's approval of the new screens (§14, "A kit is for one release and one day"). That's its own prompt, if the pilot wants it.
- **A date in the coverage report.** The report shows none today. A "dated by" column would be its own prompt.
- **Method's sign-off is a UTC day.** It's read as printed, as in the archive (§13, Still open).
- **A parser version on each reading** (§14, Still open). Separate, and still open.

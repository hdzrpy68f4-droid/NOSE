# NOSE research build: prompts (2026-10-07)

Six prompts turn the r/FLMedicalTrees research into builds. They follow the report "r/FLMedicalTrees on terpenes and flavor: findings for NOSE" in this project, with one change you made today: #2 is an article in R8, not a line under every bar. Prompts are named by the report's numbers (R1 is #1), so #2 and #6 have none.

Updated 2026-10-14: R1, R3, R4, R5 and R7 are live, so R8 now describes what they built: the smell words, the water-activity verdict, the date row. R8 also corrects two research details: ASTM's piece ties terpene loss to water activity below 0.50, not to the 0.55 edge, and the storage study's "more than half" is an average across conditions. If you copied R8 before today, copy it again.

## Settled before you paste

The prompts assume these. If you decide otherwise, change the named line before pasting.

- #2 is an article (R8, Build 1), not a line under every bar.
- The vote server takes matchBand()'s own four names, the same four the B2B votes will use: R1, Build 1.
- The vote question becomes "Did the smell and taste match the score?": R1, Build 3.
- Only water activity gets a verdict. Moisture stays a plain number: no published moisture range turned up, and the two disagree on real reports. R3, Build 2.
- Dates show on the card at scan time; nothing new is stored with a jar: R4.
- The smell-word list is written out in R7. Edit it before pasting.
- Examples use made-up values, as the existing articles do, and name no product, brand or Reddit post: R8.

## Order

| # | Builds | Needs | Gate |
|---|---|---|---|
| R1 | All four bands stored; the question asks about smell and taste | — | match-feedback clean (new) |
| R3 | A water-activity verdict on the card | — | input-paths clean |
| R4 | Harvest date and age on the card; age never touches the score | R3 (same card) | input-paths clean, match clean |
| R5 | Score spread, dropped mass, freshness by lab (read only) | — | analysis clean |
| R7 | Up to three smell words on a vote | R1 | match-feedback clean, input-paths clean |
| R8 | Two new articles, one new section, the links (includes #2) | R3, R4 and R7 (all live 2026-10-14) | build, trust guard, input-paths clean |

These touch none of the B2B files, so they can run before or between the B2B prompts, one prompt at a time. B2B Prompt 1 keeps coa.js's replies byte-identical to whatever main holds when it starts, so R4's two new reply fields don't conflict with it.

## Preamble (paste first)
```
Repo: https://github.com/hdzrpy68f4-droid/NOSE. Read PARSER-HANDOFF.md §4–§7 and §13 first. Aroma only, no effect claims; never assert scraped numbers; the archive keeps nothing about the person who scanned. I'm a beginner in Codespaces: step-by-step commands, short explanations.
- These prompts come from a research report on r/FLMedicalTrees (2026-10-07); I can paste any part of it.
- Run the prompt's probe BEFORE editing. If it doesn't show what the prompt expects, stop and tell me.
- bash scripts/gates.sh must say ALL GATES GREEN before and after. KAY-CAR-001 4.124 and KAY-PRR-001 0.944 unchanged. Each new test becomes a gate on its exact expected line, in the same commit.
- The maths has one home, js/match-math.*.js. Load it (window.NoseMatch in a page, scripts/lib/match.js in Node); never copy, re-implement or "improve" it. Scores show through shownScore() and bands through matchBand(), with matchBand()'s own names. None of these prompts changes a score: match-golden.json stays as it is.
- Don't touch the parser (parse-coa.js, coa-dates.js, extract-text.js) or anything B2B (schema b2b, b2b-* files). If a prompt seems to need either, stop and tell me.
- Every new word a person sees: show it to me before committing. Grep it for relax, calm, sleep, energ, focus, uplift, euphor, sedat, mood, high, buzz, stoned, pain, anxiety, stress, treat, relief, cure, and show me each hit with its sentence. Reword any that speaks about effects; a plain use like "high water activity" or "curing" can stay. No invented numbers. Research is linked and paraphrased, never quoted at length.
- build.sh renames a changed js/ file; commit the renamed file.
- Where a design depends on how Netlify, Supabase or browsers behave, check the current docs and cite the page. Don't rely on memory.
- Record what you built in PARSER-HANDOFF.md §13 in the same commit, and take any "Still open" item it closes off that list. Commit when green.
```

## R1 — Every vote stored, and the question asks about smell and taste
```
Goal: every vote the app sends is stored, and the question asks about smell and taste. Today match-feedback.js accepts Strong, Good, Partial and Weak, while the app sends matchBand()[1] (Strong, Good, Moderate, Low), so every vote on a Partial overlap or Different profile match is refused and lost (§13, "Still open"). Without those votes NOSE can't learn whether a low score means a different flavor, which is half of testing the hypothesis.

Where: netlify/functions/match-feedback.js; netlify/functions/feedback-read.js; app.html (the feedback question); new test/match-feedback-test.js; scripts/gates.sh; PARSER-HANDOFF.md §13.

Probe, before editing:
1. Show me resetFeedback() and sendFeedback() in js/nose.*.js, BANDS in match-feedback.js and BAND_SLUGS in feedback-read.js.
2. Run the handler offline with a stand-in for @netlify/blobs, the way the 2026-09-24 check in §13 did, and post one vote per matchBand() name. Expect Strong and Good stored, Moderate and Low refused with bad-band.
3. Walk me through reading the live summary from feedback-read, keeping FEEDBACK_READ_TOKEN out of logs and out of this chat. Expect counts under Strong and Good only. If the token isn't set in Netlify, say so and skip this. If any partial or weak keys exist, stop and tell me how many.
4. Search the repo for anything else that sends a vote, or names Partial or Weak as a vote band.

Build:
1. match-feedback.js accepts exactly matchBand()'s four names, Strong, Good, Moderate and Low, stored under strong, good, moderate and low. Partial and Weak go, unless the probe found them in use.
2. feedback-read.js reads, summarizes and exports the same four, in matchBand()'s order. Its caveat stays.
3. In app.html, "Did this match reflect your experience?" becomes "Did the smell and taste match the score?" Keep the sentence before it and both buttons. A vote must mean the score was right or wrong about smell and taste; "your experience" invites an answer about effects.
4. test/match-feedback-test.js, offline with the stand-in: one vote per band, all four stored under their slugs; Partial, Weak, a lowercase name and an unknown name each refused with bad-band and nothing stored; a score of 0 accepted; feedback-read's summary counts all four; the app's vote takes its band from matchBand()[1], read from the bundle's source text. Prints "match-feedback clean". Add the gate.
5. In §13, take the item off "Still open" and record the day the question changed: votes before it answered a different question.

Must not move: the key layout; the record's fields; anonymity (no account id, no session cookie read); the privacy page, whose sentence about votes still holds; every gate.

Done when: ALL GATES GREEN with the new gate, and after the deploy you've walked me through one vote on the default /app pair (74 · Partial overlap) and seeing it counted under Moderate in feedback-read.
```

## R3 — A water-activity verdict on the card
```
Goal: the confirmation card says whether a jar's water activity sits inside the range ASTM D8197 sets for dried flower, 0.55–0.65, instead of showing a bare number. Dry flower is a live complaint among Florida patients, and the card has no "too dry" side today.

Where: js/nose.*.js (renderCoaConfirmation's moisture and water-activity rows); test/input-paths-test.mjs; PARSER-HANDOFF.md §13.

Probe, before editing:
1. Show me the two rows in renderCoaConfirmation, and every other place a reading's moisture or water activity is shown.
2. From test/fixtures/coa-baseline.json, list the flower-class readings with water activity. Expect 10: five below 0.55 (TerpLife_GrpeBblGm_flower 0.49, KF2025-046-PB-AU-COA 0.52, ACS-FLW-002 0.53, COA_GassiusClay_3_5gWF_4793_1807_7220_8969 0.54, KAY-PRR-001 0.54), five inside, none above.
3. Show me how input-paths-test.mjs gets the reply for a case, so new cases follow it.

Build:
1. Water activity: the value as printed, then one phrase. Both edges count as inside. Show me the strings first; my proposal:
   "0.58 — inside ASTM D8197's 0.55–0.65 range for dried flower"
   "0.52 — below ASTM D8197's 0.55–0.65 range for dried flower"
   "0.68 — above ASTM D8197's 0.55–0.65 range for dried flower"
2. Moisture: the value as printed, with no verdict. No published moisture range turned up, and the two measures disagree: KAY-FLW-002 prints 14.97% moisture and 0.583 water activity.
3. In both rows, "not printed" becomes "no number on this report". A report that prints only Pass and one that prints nothing look the same to the parser, and that wording is true of both.
4. input-paths-test.mjs gains a case each for below, inside and the 0.55 edge (real fixtures; ACS-PRR-001 is the edge), above (a copy of a real reply with only waterActivity changed, since no fixture has one), and no number. Each checks the row's text.

Must not move: the parser; coa.js and its replies; every other card row; match-math; every gate.

Done when: ALL GATES GREEN, and you've shown me a screenshot of the card for each case.
```

## R4 — Harvest date and age on the card; age never touches the score
```
Goal: the card shows when the jar was harvested and how long ago, and a written rule keeps age out of the score. Patients check report dates because older flower is drier and quieter than its report. The parser already reads harvestOn and reportOn, but coa.js doesn't send them and the card doesn't show them.

Where: netlify/functions/coa.js (the reply); js/nose.*.js (the card); test/input-paths-test.mjs; test/match-test.js; PARSER-HANDOFF.md §4, §7 and §13.

Probe, before editing:
1. List every test that reads coa.js's reply fields or compares a reply whole, and say whether two new fields break any.
2. Among the accepted fixtures, count the readings that carry harvestOn, those with only reportOn, and those with neither. On the rehearsal archive 20 of 56 usable batches were dated (§13).
3. Show me that normalize() ignores harvestOn, reportOn and totalTerpenes keys in a profile (sanitizeTerps drops them).

Build:
1. coa.js's reply adds harvestOn and reportOn, passed through from the parser, ISO or null. Nothing else in the reply changes. Update §7.
2. One card row after Batch. If harvestOn: "Harvested", then "Aug 10, 2026 · 58 days ago". Else, if testedOn exists (Prompt 7 of the 2026-09-23 review) and is set: "Tested", the same form. Else, if reportOn: "Report dated", the same form, because it is the report's date, not the harvest's. Else, no row. Count whole days from that date to the person's today, and say "today" for 0.
3. Under the row, when it shows: "A report describes the jar on test day. Terpenes keep evaporating after that, so an older jar can smell quieter than its numbers." Show me the strings first.
4. Add the rule to §4: age never changes a jar's shape or its score, and a future decay curve may lower intensity (total terpenes) only. Cite why: a 2020 storage study (https://www.frontiersin.org/articles/10.3389/fpls.2020.583605/full) saw lighter and heavier terpenes decline on similar trends, and Hazekamp 2016 (doi 10.3389/fphar.2016.00108) saw irradiation lower some terpenes but keep the profile's character.
5. match-test.js gains one check: a profile carrying harvestOn, reportOn and totalTerpenes normalizes exactly as it does without them. "match clean" stays its line.
6. input-paths-test.mjs freezes the page's clock (Playwright's clock API; check the current docs and cite them) and checks the row on a fixture with harvestOn, one with only reportOn, and one with neither.

Must not move: the parser; match-math and match-golden.json; every other card row; the archive; every gate.

Done when: ALL GATES GREEN, and you've shown me the card for each of the three cases.
```

## R5 — Score spread on the live archive (read only)
```
Goal: find out from the live archive whether most Florida jars look alike to the maths, before deciding how a score should read. In the 56 fixtures, 202 of 300 flower pairs (67%) score Good or better, but the fixtures are a sample I collected, not a market.

Where: new scripts/score-spread.js; test/analysis-test.js; PARSER-HANDOFF.md §13 (the analysis layer).

Probe, before editing:
1. Show me how scripts/lab-stats.js reads nose.latest_parses one row per sample (nose.sample_key()) and tells seeded fixtures from real scans.
2. Show me analysis-test.js's EFFECT_WORDS and the list of files it scans. The new script and everything it prints must pass it, comments included. "effect" itself is on that list.

Build: node scripts/score-spread.js [--class flower|vape|concentrate], read only, as nose_writer through NOSE_DB_URL, like lab-stats.js. Usable readings, one per sample. Real scans and seeded fixtures are reported apart, then together. Four tables, with a denominator beside every share:
1. Score spread, per product class: every pair of samples, scored with cosine(normalize(a), normalize(b)) and banded with matchBand(), both from scripts/lib/match.js. The number of pairs; each band's count and share; the median and the 10th and 90th percentiles, shown with shownScore().
2. A typical jar, per class: for each sample, the share of the other samples in its class that score Good or better against it; the median and the range.
3. Dropped mass: measuredCoverage (the median, and how many readings fall under 95%), and the unmapped compound names by how many readings carry each.
4. Freshness by lab, flower only: how many readings print a moisture number and how many a water-activity number, each over its readings; and water activity below, inside and above 0.55–0.65.
It prints no report text, address, strain, batch or client, and its first line says it describes lab reports, not experiences.

test/analysis-test.js on PGlite: seeded readings with known pairs (a profile and the same profile scaled 3× make one Strong pair at 100); a refused reading left out; two documents of one sample counted once; the fixture split; every denominator; the new file in the no-effect-wording scan. "analysis clean" stays its line.

Must not move: everything the analysis layer already prints; the views and grants; every gate. Nothing here writes.

Done when: ALL GATES GREEN, you've walked me through running it on the real archive, and I have the four tables. How a score should read waits for them.
```

## R7 — Up to three smell words on a vote
```
Goal: a vote can carry up to three smell words from a fixed list, so NOSE learns which smells its lab-report matching misses. Research ties gas, skunk, savory and many sweet notes to compounds terpene panels don't include; a word beside "Didn't match" says which.

Needs: R1 (all four bands stored, and its test).

Where: privacy/index.html (the sentence about votes, and a "What changed" entry); app.html (the feedback block); js/nose.*.js (resetFeedback, sendFeedback, the word buttons); the stylesheet the feedback block uses; netlify/functions/match-feedback.js; netlify/functions/feedback-read.js; test/match-feedback-test.js; test/input-paths-test.mjs; PARSER-HANDOFF.md §13.

The list, in this order (slug: label):
gas: Gas or fuel · skunk: Skunk · savory: Savory or garlic · chemical: Chemical · sweet: Sweet · fruity: Fruity or tropical · hay: Hay · citrus: Citrus · earthy: Earthy · spice: Spice · pine: Pine · floral: Floral · herbal: Herbal

Probe, before editing:
1. Show me the vote's fields today, R1's test, and the privacy page's sentence about votes.
2. Show me the feedback block's markup and how it is reached by keyboard.

Build:
1. Privacy first. The sentence about votes adds "and up to three smell words you picked from a fixed list", with a dated "What changed" entry. It ships in the same push as the feature, never after it. Name what is kept; never write that nothing is (check-trust will catch it: reword, don't narrow).
2. Above the two buttons: "What did you smell? Optional, up to three." and one toggle button per word (aria-pressed, reachable by keyboard). A fourth choice is refused with a short note on the page. Nothing typed is ever sent.
3. The payload adds notes: the chosen slugs in list order, [] when none. The list lives as one constant in js/nose.*.js and one in match-feedback.js, with a test that the two match.
4. match-feedback.js: notes is optional. When present it must be an array of at most three distinct slugs from the list; anything else is refused with bad-notes and nothing is stored. The record gains notes and becomes v: 2. The key layout doesn't change.
5. feedback-read.js: the CSV gains a notes column and JSON records carry it. The summary stays keys-only.
6. match-feedback-test.js: notes stored; an unknown word, a fourth word, a duplicate and a typed string each refused; no word on the list matches analysis-test's EFFECT_WORDS. input-paths-test.mjs: pick two words, vote, intercept the POST, and check its body carries exactly those two slugs and no other new field.

Must not move: R1's bands; the key layout; anonymity; every gate.

Done when: ALL GATES GREEN, the privacy change and the feature went live together, and you've walked me through one vote with words and reading it back in feedback-read's CSV.
```

## R8 — Two new articles, one new section, the links (includes #2)
```
Goal: two new articles and one new section, from the research. They take the place of the report's #2 line under every bar: the site says what a lab report can't smell in an article, not on every result. R1, R3, R4 and R7 are live (2026-10-14), and the articles describe what they built.

Where: new learn/what-a-lab-report-cant-smell/index.html; new learn/why-your-jar-is-drier-than-its-report/index.html; learn/intensity-versus-character/index.html; learn/index.html; sitemap.xml; methodology/index.html; learn/how-to-read-a-coa/index.html; js/nose.*.js (one link on the water-activity row); test/input-paths-test.mjs; PARSER-HANDOFF.md §13.

Probe, before editing:
1. Show me how learn/how-to-read-a-coa/index.html is put together: the head (title, description, canonical, Open Graph, Article JSON-LD with its dates), the breadcrumbs, the In short box, figures and tables, and Sources. And how learn/index.html and sitemap.xml list articles.
2. Show me the method page's "Important limitations" list, how-to-read-a-coa's step 6, and the sentences the existing articles use for the 2020 storage study.
3. Show me what the articles will describe, as built: waterActivityText(), reportDateRow() and AGE_NOTE, SMELL_NOTES, and the vote question in app.html. And how input-paths-test.mjs reads the water-activity row.

House style for all three: an In short box; made-up values, labeled as made up, as the existing articles do; every score computed with NOSE's matcher through scripts/lib/match.js, and the page says so; research linked in Sources and paraphrased; no product, brand, dispensary or Reddit name, and nothing quoted from a post; canonical and og:url on the same domain the other articles use.

Build:
1. "What a lab report can't smell" (new). Terpenes are most of what a lab measures, not everything you smell. Research traced skunk aroma to a family of sulfur compounds (Oswald and colleagues, ACS Omega 2021; https://sciencedaily.com/releases/2021/12/211201085147.htm). A 2023 study by the same group (https://pmc.ncbi.nlm.nih.gov/articles/PMC10601067/) traced tropical and citrus notes in some cultivars to other sulfur compounds, savory and chemical notes to skatole and indole, and sweet notes to esters, and found terpene profiles very similar across cultivars that smelled very different. Say plainly that the 2023 work studied rosin, not flower, and that most of its authors work for a company that sells flavor compounds. What it means: NOSE compares only what the report measured, so matching should hold best where terpenes lead (citrus, pine, herbal) and fail most for gas, savory and sweet jars, in either direction. Say that this is an expectation the votes test, not a finding. Why there is no Gas family: no lab measures it, and showing it would be a guess. How the votes help: the question asks whether the smell and taste matched the score, and a vote can carry up to three words from a fixed list (list them as SMELL_NOTES has them), so a "Didn't match" beside "Gas or fuel" says which smell the report missed.
2. "Why your jar is drier than its report" (new). Moisture and water activity measure different things; show a made-up pair where they disagree. The range: 0.55–0.65 for dried flower, from ASTM D8197-22, the active edition (https://store.astm.org/d8197-22.html). Why it matters, from ASTM's own news piece (https://sn.astm.org/node/2445/printable/print): above 0.65, a risk of microorganism growth; below 0.50, terpenes dry out and taste and smell weaken. It names 0.50, not the range's 0.55 edge; don't stretch it. Reports that print only Pass, and numbers on a later page. The report as a snapshot: harvest and test dates; the 2020 storage study (https://www.frontiersin.org/articles/10.3389/fpls.2020.583605/full), described as the existing articles already describe it: terpenes fell under every condition tried, by more than half on average within four months, not by half under each one; an irradiation study (Hazekamp 2016, doi 10.3389/fphar.2016.00108) in which some terpenes fell and the profile's character held. What NOSE shows, as built: the water-activity verdict; moisture as a plain number; the harvest or report day and how long ago, when NOSE can read one (many reports give it none yet). No storage advice beyond what the studies found.
3. intensity-versus-character gains a section, "Why a cutoff per terpene misleads". Some guides read each terpene's percentage against a fixed cutoff, such as half a percent. Use a made-up quiet jar and the same jar three times louder: the loud one has more terpenes over the cutoff, the shares are identical, and NOSE scores the pair 100. The cutoff measures loudness, not character.
4. Links. On the method page, "Terpene panels do not capture every volatile compound involved in aroma." links to article 1, and "Storage, age, moisture, and packaging can change what reaches your nose." links to article 2. how-to-read-a-coa's step 6 links to article 2, and its ASTM source moves from D8197-21, now marked historical, to D8197-22, which gives the same range. On the card's water-activity row, the words already there become a link to article 2: the range phrase when a number shows, "no number on this report" when none. The row's text stays exactly the same, and the link opens in a new tab (rel="noopener"), so an unsaved card isn't lost. learn/index.html lists both new articles, and sitemap.xml gains both. Update dateModified on every page that changed.
5. input-paths-test.mjs checks the new link: its href, that it opens in a new tab, and that the row's text is unchanged. "input-paths clean" stays its line.
6. Show me, and change only if I agree: the method page's "Similarity does not predict enjoyment, medical benefit, impairment, or subjective effect." states as fact what is still an open question for enjoyment, the question the votes test. Propose a rewording that keeps the rest of the sentence firm.
7. In §13, take two items off "Still open": how-to-read-a-coa's D8197-21 link, and the one that says the card's water-activity row will link to a new article (it calls this prompt R5; it is R8).

Must not move: every other page; every card row's text; match-math; check-trust's patterns; the CSP and the no-inline-script rule; every gate.

Done when: ALL GATES GREEN, and you've shown me each new or changed page at phone and desktop widths, and the card with its new link.
```

## Not prompts: do these yourself

- Update the project instructions, which new sessions read first. Four lines there are out of date: the fetcher has no domain allowlist (handoff §12); the bands are Strong, Good, Moderate and Low, shown as Close match, Related profile, Partial overlap and Different profile; freshness should follow R3 (water activity 0.55–0.65, no moisture verdict); and the site is static pages with Netlify Functions, not Next.js.
- After R1 goes live, note the date somewhere you'll find it: votes before it answered "your experience", not smell and taste.

## Left alone on purpose

- A line under every bar (#2): it's an article now (R8), as you chose.
- #6, the screenshot and bag-label check: left out, as you chose.
- Storing harvest dates with saved jars: it changes what palate-sync keeps, so the privacy page would come first. Its own prompt, if you want it.
- testedOn, Prompt 7 of the 2026-09-23 review: the parser work that would date most reports. R4 uses it if it exists.
- Smell words on B2B votes: B2B Prompt 4 fixes that vote's fields. Add them there in a prompt of their own once R7 shows they're useful.
- Changing how a score reads: waits for R5's tables.
- Modelling more compounds: the report found little dropped mass, and R5's table 3 says whether the archive agrees.

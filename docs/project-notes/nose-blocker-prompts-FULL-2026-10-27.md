# NOSE — Opus Prompts for the Seven Pitch Blockers

Oct 27, 2026 · @Christopher Carreon

## How to use these

**Eight prompts cover the seven blockers from the 2026-10-26 audit. Three prompts from the earlier set are part of this work too.** That earlier set is in the project doc `claude/nose-m-cleanup-prompts-2026-10-15.md`. Its M4 (rate limits) is half of blocker 6, M5 (votes keep the day, not the time) makes the privacy page true, and M6 (one header and footer) gives blocker 7's page a footer link. None of M4–M7 has run: the repo's newest commit is still `6f8d83e`, from 2026-10-16.

Each prompt goes into a new Opus chat: the preamble first, then the prompt. They follow the M-prompts' shape: goal, where, a probe before any edit, build, what must not move, and Codespace steps at the end. B2.1 and B3 produce documents for a lawyer, so they commit nothing.

**Run them in this order:**

1. **M4, then B6.** These protect the site first, and are mostly settings.
2. **M5.** Votes stop keeping a time, so the privacy page's vote sentence becomes true.
3. **B5.** Safari's engine and Firefox join the tests, so release 2 is tested in them.
4. **B4.** The new flower score wording, shipped as widget release 2.
5. **M6, then B7.** The dispensary page, the demo's pitch view, and the About page.
6. **B1, then B2.1 and B2.2.** These need your legal facts.
7. **B3, last.** It bundles the final wording and the drafts for counsel.

M7 (splitting the handoff) can run before everything or after everything, not in between. If you run it first, swap the preamble's first line for the line M7 hands you.

**Have these ready.** The prompts ask for them and won't invent them:

| Prompt | You provide |
| --- | --- |
| B1 | Legal name and entity type, state of registration, a mailing address you're willing to publish, governing-law state, and a contact email you actually read |
| B2.1 | The pilot fee (or "none"), and who signs for NOSE |
| B4 | Which wording option (the prompt shows you the choices), and the attribution line, if any, e.g. "Flavor match by NOSE" |
| B6 | Your Netlify plan, your Supabase plan, and the monthly spend you'll accept |
| B7 | Whether the About story is true (and the true one if not), the name(s) to show, a contact for dispensaries, and whether to show a price |

### Preamble (paste first, every time)

```text
Repo: https://github.com/hdzrpy68f4-droid/NOSE. Read PARSER-HANDOFF.md §4–§7 and §13 first, and §14 for anything B2B. Aroma only, no effect claims; never assert scraped numbers; nothing about the person using the site, and nothing about a shopper, is kept. I'm a beginner in Codespaces: step-by-step commands, short explanations.
- These prompts fix the pitch blockers from the audit of 2026-10-26 (project doc claude/nose-b2b-readiness-audit-2026-10-26.md). Do only what the prompt says. If the fix grows past it, stop and tell me.
- Never invent a fact about NOSE or me: no legal name, address, person, origin story, price, client, statistic, testimonial, credential or date. If a prompt needs one I haven't given, ask.
- Anything legal is a draft for a lawyer, labelled as one. Quote rules and docs exactly, with the URL and the day you read them. An interpretation is a question for counsel, not an answer.
- The repository is public. Never commit a dispensary's name, catalog, keys or emails, or anything about a shopper or patient. Drafts for counsel and agreements stay out of it.
- Run the prompt's probe BEFORE editing. If it doesn't show what the prompt expects, stop and tell me.
- bash scripts/gates.sh must say ALL GATES GREEN before and after. KAY-CAR-001 4.124 and KAY-PRR-001 0.944 unchanged. A changed test keeps its gate's exact expected line; a new gate goes into gates.sh and §5 in the same commit.
- Don't touch the parser (parse-coa.js, coa-dates.js, extract-text.js), the maths (js/match-math.*.js), schema nose, schema b2b or any migration unless the prompt says to. If it seems to need one, stop and tell me.
- The privacy page and the code move together. If a prompt changes what NOSE keeps or sends, or what the page says about it, show me every new or changed sentence before committing. Name what is kept; never write that nothing is (check-trust will catch it: reword, don't narrow).
- A pinned widget release never changes. A change to js/b2b-widget, js/b2b-strings, js/b2b-rank, js/aroma-bar or css/b2b-widget reaches a store only through a new release, and only when the prompt says to make one.
- build.sh renames a changed js/ or css/ file; commit the renamed file.
- Where a change depends on how Netlify, GitHub, Supabase, Playwright or a browser behaves, read the current docs and cite the page with the day you read it. Don't rely on memory.
- When I have to change a setting on GitHub, Netlify or Supabase, give me the clicks one at a time.
- After git push, the run on GitHub has to go green and live has to move before the live site shows the change. Every "once it's live" step waits for that.
- New words in pages, comments and docs: no effect wording.
- Record what you did in PARSER-HANDOFF.md, above the right section's Still open list, in the same commit, and take closed items off Still open. Commit when green.
```

## B1: the terms page, finished

This takes down the public "Before launch" box and says who runs NOSE. Fill in the five blanks before you paste.

```text
Goal: /terms/ stops showing its "Before launch" box and says who runs NOSE. Today terms/index.html (lines 102-108) shows four unfinished items on the live page: a lawyer's review, the operating entity's legal name and address, a governing-law clause and effective date, and paid-subscription terms. A dispensary's compliance team reads this page first. It also says nothing about business customers.

My facts (if any is blank, ask me; never invent one):
- Legal name and entity type: ____
- State of registration: ____
- Mailing address to publish (a registered agent's or a PO box is fine): ____
- Governing law (state): ____
- Contact email I read: ____ (today both pages say contact@nose-app.com)

Where: terms/index.html; privacy/index.html (who "we" are, once); the Organization JSON-LD on every page that has it; sitemap.xml (lastmod for /terms/ and /privacy/); PARSER-HANDOFF.md §13 (the record, and the Still open item "The terms page's 'Before launch' box").

Probe, before editing:
1. Show me the terms page's sections in order, and the "Before launch" box whole.
2. Show me every place the site names who runs NOSE: terms, privacy, about, the JSON-LD. Expect "NOSE" alone everywhere.
3. Show me which of the build's checks read these two pages (check-trust, check-published, colour-tokens and any other), so the new words pass them.

Build:
1. Terms:
   - "Who we are", first section: the legal name, entity type, state, mailing address and contact email, as I gave them.
   - "Governing law": one plain sentence naming the state. No venue, arbitration or class-action wording: those are counsel's to add.
   - "Effective date": the day this goes live. Ask me for it at push time.
   - "Business customers": dispensaries use NOSE under a separate written agreement; these terms cover people using nose-app.com; where the two differ for a dispensary, its agreement governs. Link /privacy/#dispensaries.
   - Paid plans: one sentence in "Accounts": none are offered, and these terms will set out price, billing, renewal, cancellation and refunds before any are.
   - The "Before launch" box goes. In its place, one honest line at the end: these terms have not yet been reviewed by a lawyer. It stays until I tell you they have been. Show me the wording.
2. Privacy: the operator named once, where the page first says "we", linking the terms' "Who we are". Nothing else on the privacy page changes.
3. JSON-LD Organization: legalName, plus the address only if I gave a street address.
4. sitemap.xml: today's lastmod for /terms/ and /privacy/.
5. PARSER-HANDOFF.md: the record in §13; the box item comes off Still open.

Must not move: every other sentence on both pages; what NOSE keeps or sends; every js/ and css/ file; every gate's expected line.

Should change: no unfinished checklist on a public page; a reader can tell which company runs NOSE, under which state's law, and how to reach it.

Done when: ALL GATES GREEN; you've shown me every new sentence before committing; and you've walked me through, one step at a time:
1. In the Codespace: git pull --ff-only, then npm run gates.
2. git push, then wait for the run on GitHub to go green and live to move.
3. On my phone: /terms/ shows "Who we are" and no "Before launch" box; /privacy/ names the operator once.
```

## B2: the dispensary agreement, and the pilot export on the privacy page

Two prompts. B2.1 drafts the agreement for your lawyer and commits nothing. B2.2 adds the pilot-export paragraph the privacy page must carry before any store sends you an export. Run B1 first so the agreement can name NOSE's legal entity.

### B2.1: the pilot agreement, a draft for counsel

```text
Goal: a first draft of the agreement a dispensary signs before a pilot, written from what NOSE actually does, for a Florida cannabis-regulatory attorney to correct. Today none exists: the privacy page speaks of a dispensary's "license to use NOSE" and docs/B2B-PILOT-PLAN.md's checklist needs "the store's data terms with NOSE". This is not legal advice and must say so at the top. Nothing goes in the repository: it is public.

Output: a document (Claude Docs if you have it, otherwise a .docx) titled "NOSE dispensary pilot agreement - DRAFT for counsel review", and a cover note listing every point you were unsure of.

Read first: docs/B2B-INTEGRATION.md, docs/B2B-CATALOG-FORMAT.md, docs/B2B-PILOT-PLAN.md, docs/B2B-PILOT-EXPORT.md, docs/B2B-RELEASES.md, privacy/index.html (#dispensaries and "How long we keep things"), terms/index.html, and PARSER-HANDOFF.md §14 "Still open".

My facts (if any is blank, ask me; never invent one):
- NOSE's legal name, entity type, state and address: ____ (as on /terms/ after B1)
- Pilot fee: ____ (e.g., none for the pilot)
- Who signs for NOSE: ____
- Governing law: ____ (as on /terms/)

Sections, each in plain English first, formal wording only where counsel will want it:
1. Parties, and what the dispensary gets: the widget as pinned releases, the catalog feed, the coverage report, the compliance kit, and the pilot report.
2. What the dispensary sends, and what it never sends: the catalog CSV and its columns; the secret key kept on its server only; no shopper or patient data ever, the purchase list going only to the shopper's own browser. The pilot export: one row per assigned shopper, a group label and counts, no identity (B2B-PILOT-EXPORT.md); read once; deleted once the report is published.
3. What NOSE keeps, and for how long: the privacy page's dispensary section, restated. No new promise.
4. Compliance: the dispensary decides whether and where to use the widget, and is responsible for its own regulatory approvals (in Florida, the Department's approval of website changes). NOSE supplies the strings file and the compliance kit. NOSE never changes a pinned release; moving to a new release is the store's choice.
5. Words: neither party presents NOSE or the widget as describing effects. The store's own product names and brands are the store's to clear.
6. The pilot: the plan is committed before day one; the result is published either way (plan §10); what is published, and the store's say over whether its name appears.
7. Fees, term and termination. On termination, NOSE deletes the store's records as the privacy page describes, and the store removes the tag.
8. No warranty on match quality (the score is a hypothesis the pilot tests); no uptime promise during the pilot; limitation of liability; confidentiality of keys and of the store's non-public data; each side keeps its own IP (NOSE its code, the store its catalog).
9. Governing law; venue left for counsel.

Rules:
- No clause may promise something the code doesn't do. Beside each data promise, a margin note names the file or privacy-page sentence it rests on.
- Every place a Florida rule may matter is a question for counsel in the cover note, never an answer in the draft.

Done when: the draft and its cover note are ready, and you've listed every privacy-page sentence the agreement relies on, so the two can't drift apart unnoticed.
```

### B2.2: the privacy page describes the pilot export

```text
Goal: before NOSE receives any dispensary's end-of-pilot export, the privacy page says what the export holds, where it is read and when it is deleted. Three places already say it must: PARSER-HANDOFF.md §14 Still open ("The privacy page does not describe the end-of-pilot export yet"), docs/B2B-PILOT-EXPORT.md ("Not received yet"), and the plan template's checklist. The page's sentence "Nor are we told ... which group of a test the dispensary has put them in" is reconciled too: an export tells NOSE each row's group, never who the row is.

Where: privacy/index.html (#dispensaries, "How long we keep things", a "What changed" entry); docs/B2B-PILOT-EXPORT.md; docs/B2B-PILOT-PLAN.md (the checklist line names the page section); any test that reads the privacy page's text; PARSER-HANDOFF.md §14.

Probe, before editing:
1. Quote the dispensary section whole, and the groups sentence.
2. Quote B2B-PILOT-EXPORT.md's columns and refusal rules, and show how scripts/b2b-pilot-report.js reads the file: where it runs, and whether it writes anything.
3. Show me every test that reads privacy/index.html's text and what it counts. Expect test/b2b-compliance-kit-test.mjs to count the page's mentions of dispensaries.

Build:
1. A paragraph in #dispensaries, "At the end of a pilot": one row per shopper the dispensary put in the test, with the group and counts; no name, account, email, card or address (a file with such a column is refused whole); read once in NOSE's maintenance workspace by the report script; deleted there when the report is published; the published report holds only per-group totals. Show me every sentence first.
2. The groups sentence, reworded to what is true.
3. "How long we keep things": one line for the export.
4. "What changed": a new entry, dated the day it goes live.
5. B2B-PILOT-EXPORT.md: "Not received yet" now says the privacy page describes it, naming the section. The plan template stays a template; its checklist line names the section.
6. Tests: any count the new paragraph changes is updated, with the same gate lines.
7. PARSER-HANDOFF.md: the record in §14; the item comes off Still open.

Must not move: what any code keeps, reads or sends; every js/ and css/ file; every other sentence on the page; every gate's expected line.

Should change: a dispensary can read, before signing, exactly what happens to its export.

Done when: ALL GATES GREEN; you've shown me the sentences before committing; and you've walked me through, one step at a time:
1. In the Codespace: git pull --ff-only, then npm run gates.
2. git push, then wait for the run on GitHub to go green and live to move.
3. On the live site: /privacy/#dispensaries shows "At the end of a pilot" and the new "What changed" entry.
```

## B3: the packet for Florida counsel

Opus can't give the legal sign-off, but it can make one meeting with a lawyer enough. This prompt builds the packet: the rule as it stands, every Florida word with screenshots, and the questions to ask. Run it last, so counsel reads the final wording and the B1 and B2 drafts.

```text
Goal: everything a Florida cannabis-regulatory attorney needs to answer, in one sitting, whether a Florida MMTC can put NOSE's widget on its website, and on what conditions. Today the Florida wording (js/b2b-strings, variant florida) is NOSE's own reading of emergency rule 64ER25-6, and no lawyer has read it (PARSER-HANDOFF.md §14 Still open, "The Florida variant is NOSE's reading of 64ER25-6"). Nothing in the repository changes.

Output: a document (Claude Docs if you have it, otherwise a .docx) titled "NOSE - Florida regulatory review packet", plus a separate list of firms.

Steps:
1. The rules as they stand today. Find the current text of 64ER25-6, and the status of Rule 64-4.227 ("MMTC Advertising and Marketing", a nonemergency rule workshopped on 2026-06-24 to replace an emergency rule), on flrules.org, the Florida Administrative Register and the Department's OMMU pages. Quote the parts on websites, prior approval, vendors and third parties, depictions, internet advertising and opt-in email, each with the URL and the day read. Say plainly what you could not find. Law-firm summaries may point you to the text, but only the text is quoted as the rule.
2. The compliance kit. Walk me through running it, one step at a time, in the Codespace: node scripts/b2b-compliance-kit.js (the test store, the newest release). Then tell me exactly which files under b2b-out/test-store/compliance-kit/ to attach back to you: strings.md, data.md, README.md and the PNGs.
3. The packet:
   a. One page: what NOSE is; what the widget shows and where (the rail on category pages, the sold-out panel, the vote on order history); what it never says (anything about effects).
   b. The data flow, from docs/B2B-INTEGRATION.md's table: what reaches NOSE, and what never does.
   c. Every Florida string, verbatim, with when it shows (strings.md), and the words that come from elsewhere: the match labels from matchBand() and the six family names from the bar.
   d. The screenshots, phone and desktop, captioned.
   e. Questions, each tied to a quoted rule line:
      - Is a vendor's widget on an approved website part of what the Department approves? Does each new pinned release need approval again?
      - Are "aroma", "flavor", "palate", "close match", "closest to your usual" and the six family names (Citrus, Earthy, Spice, Pine, Floral, Herbal) acceptable on an MMTC's site?
      - Product names come from the store's catalog. Confirm they are the store's to clear, not NOSE's.
      - Is ranking in-stock products by similarity to a patient's past orders advertising or marketing under the rule, and is anything about it barred?
      - The vote after an order ("Was the flavor close?" and its Florida wording): any issue?
      - The one-button opt-in: does the MMTC need to record anything beyond what it already records?
      - A later email or text when a new batch matches (§14 "Later"): allowed under the opt-in email rules?
      - The pilot's random split of signed-in patients into two groups, and the end-of-pilot export of counts per patient with no identity: any patient-privacy issue under Florida law, and does HIPAA reach an MMTC's records here?
      - Please review the terms (B1) and the draft agreement (B2.1), attached.
   f. What NOSE changes on counsel's word: the strings file, a new pinned release, a new compliance kit.
4. Firms: 5 to 8 Florida firms or lawyers with a cannabis regulatory practice, each from its own website, linked, with the day read and one line on why it fits. No ranking: I choose.

Rules: quote rules exactly. Never describe a rule beyond its text. Every interpretation is a question for counsel.

Done when: the packet and the firm list are ready, with a short list of everything you could not verify.
```

## B4: how a flower score reads, shipped as release 2

This prompt measures first, shows you four wording options on the demo's real cards, and waits for you to pick one. It changes only the widget, never the matching math or the consumer app, so `/app` and the published method stay as they are.

```text
Goal: on a dispensary's flower rail, the words beside a score tell a shopper something. Today 311 of 465 flower pairs (67%) score Good or better, median 82 (PARSER-HANDOFF.md §13, "Score spread"), and on the demo store 7 of the rail's first 8 cards say "Close match". A buyer will notice that every card says close. Measure it, let me choose the wording, then ship it in the widget alone as pinned release 2.

Out of scope: js/match-math (matchBand, the band edges, shownScore), the consumer app, test/fixtures/match-golden.json and the methodology page's bands. If the best option needs any of them, stop and tell me: that is a separate decision about /app and the published method.

Where: js/b2b-widget.*.js and js/b2b-strings.*.js (both variants); test/b2b-strings-test.js and test/b2b-widget-test.mjs; docs/B2B-PILOT-PLAN.md §5; docs/B2B-INTEGRATION.md if anything a store's developer sees changes; docs/B2B-RELEASES.md (written by the release script); PARSER-HANDOFF.md §14.

Probe, before editing:
1. The spread on the demo store (b2b/demo/test-store.json): the flower rail's 12 cards, each card's score and band, for the demo's example purchases (js/b2b-demo) and for five made-up palates of one to five flower batches. Then every flower pair in the test store, banded. Show me the tables.
2. Where a score becomes words: js/b2b-widget (the match line, its aria text, dataset.band); js/b2b-strings matchLine, matchAria and voteMatched in both variants; SHOWN_FROM_OTHER_FILES.
3. What the vote and the pilot depend on: b2b-vote accepts a band only if it is one of matchBand()'s four (line 114) and keys votes by it; docs/B2B-PILOT-PLAN.md §5 says votes are kept under "the band the shopper was shown"; scripts/b2b-pilot-report.js splits votes by matchBand()'s bands.
4. Confirm the demo page loads the build's bundles (js/b2b-widget.<hash>.js and the rest), not a release, so a change shows there with the next deploy.

Options. For each, show me what the demo's first 8 cards would say, then ask me to choose:
A. Place, not band: "2nd closest of 30 in-stock flowers · 94"; no band word on the card.
B. A label relative to this menu, from where the score sits among this rail's in-stock scores (e.g., "Closest on this menu" for the top few).
C. matchBand()'s label plus context: "Close match · 96 · 7 of 30 in stock are this close".
D. Your own recommendation, if it beats these.
For each, say: is it honest (nothing rounded up)? does the pilot's band check still work? which new strings does it need, in both variants? what does a screen reader hear?

Build, after I choose:
1. js/b2b-widget and js/b2b-strings only, both variants with the same keys and {placeholders}. The vote payload does not change: the widget keeps sending the score and matchBand()'s band for it, because the feed and the vote are not versioned (§14 Still open) and a pinned release 1 still sends them.
2. If the card no longer shows matchBand()'s label, docs/B2B-PILOT-PLAN.md §5 changes "the band the shopper was shown" to "the band matchBand() gives the score the shopper was shown". Show me the sentence.
3. The attribution line, if I give one: ____ (both variants; b2b-strings-test then reads it, and §14's "No attribution line yet" closes).
4. Tests: b2b-strings-test reads every new string and refuses effect words as before; b2b-widget-test checks the new card line and its aria text. Same gate lines.
5. Commit, push, and wait for the run to go green and live to move. Then release 2 from the Codespace, as scripts/b2b-release.js's header says: the dry run, the release, the docs/B2B-RELEASES.md row committed on its own, then node scripts/b2b-release-check.js --site https://nose-app.com.
6. The compliance kit again for release 2: node scripts/b2b-compliance-kit.js --release 2.
7. PARSER-HANDOFF.md: the record in §14; §13's "How a score should read is the next decision" gets one line pointing to it.

Must not move: js/match-math and every consumer page; release 1's bytes (a release is never rewritten); the feed's and the vote's shapes; what NOSE keeps or sends; every other gate's expected line.

Should change: a flower rail no longer calls nearly every card a close match, and the words say no more than the numbers support.

Done when: ALL GATES GREEN; you've shown me the probe tables and the options with my choice; release 2 is recorded and checked; and you've walked me through, one step at a time:
1. In the Codespace: git pull --ff-only, then npm run gates.
2. git push, then wait for the run on GitHub to go green and live to move.
3. The release commands in step 5, one at a time, and what each should print.
4. On my phone: /b2b/demo/, tap the consent button, and read the new card lines.
```

## B5: Safari's engine and Firefox in the tests

Playwright, which the tests already use, can drive WebKit (Safari's engine) and Firefox as well as Chromium. After this prompt every push is tested in all three. WebKit on Linux is close to an iPhone, not the same thing, so the prompt ends with a short check for you to do on your own phone.

```text
Goal: the widget and the app are tested in WebKit (Safari's engine) and Firefox on every push, not only in Chromium. Today test/b2b-widget-test.mjs (line 348) and test/input-paths-test.mjs (line 416, with Chromium's fake-camera flags) launch Chromium only, and .github/workflows/gates.yml installs Chromium only. PARSER-HANDOFF.md §14 Still open: "Only Chromium has run a release". Many of a dispensary's shoppers will be on iPhones.

Where: test/b2b-widget-test.mjs; test/input-paths-test.mjs; .github/workflows/gates.yml and scripts/gates.sh's header (the install line, changed together); PARSER-HANDOFF.md §13 (the record), §5 (the test table) and §14 (the Still open item).

Probe, before editing:
1. Read Playwright's docs for the version the workflow pins (1.64.1): the browsers it ships, what its WebKit build on Linux is and is not (not iOS Safari), installing them with --with-deps, and how each engine can fake a camera. Quote each with the day read.
2. Run b2b-widget-test and input-paths-test once each under webkit and under firefox as they stand, by a scratch change to the launch line that you don't commit. Show me every failure, sorted into two piles: a real fault in NOSE's js/ or css/, or a test assumption (a Chromium-only flag, timing, focus order).
3. Expect the camera cases in input-paths-test to be Chromium-only, because of their fake-video flags. Say what each engine can test instead (the QR-image path, say).

Build:
1. Each test runs its browser cases on chromium, webkit and firefox in turn, through one loop. Its gate line stays exactly as it is and prints only when all three pass; a failure names the engine.
2. Camera cases run on every engine that can fake a camera. On the others they are skipped with a printed note, and the QR-image path covers that engine. Nothing is skipped silently.
3. A real fault in js/ or css/: stop and show me before fixing it. A widget fix means a renamed file and a new pinned release, which is its own step: say whether it should wait for B4's release 2.
4. CI and the Codespace: install chromium, webkit and firefox with --with-deps, in gates.yml and in gates.sh's header together. The job's 30-minute limit stays; tell me how long the run takes.
5. The compliance kit stays on Chromium: it is a record of the screens, not a test.
6. PARSER-HANDOFF.md: the record in §13; §5's table names the three engines; §14's item becomes "WebKit and Firefox run in the gates; a real iPhone is still the pilot store's check".

Must not move: every gate's expected line; every js/ and css/ file unless I approve a fix; what NOSE keeps or sends.

Should change: a change that breaks the widget or the scanner in Safari's engine or Firefox turns the run red, and the site keeps its last green commit.

Done when: ALL GATES GREEN in the Codespace and on GitHub with all three engines; you've shown me the probe's two piles; and you've walked me through, one step at a time:
1. In the Codespace: git pull --ff-only, then the new install line, then npm run gates.
2. git push, then wait for the run on GitHub to go green and live to move.
3. A five-minute check on my own iPhone, in Safari: /app (a sample match, the COA link tab, the scanner's camera prompt) and /b2b/demo/ (the consent button, swiping the cards, removing a purchase and putting it back, a vote). What to screenshot if anything looks wrong.
```

## B6: hosting a store can lean on

Run M4 ("Rate limits at Netlify's edge") first, as written in `claude/nose-m-cleanup-prompts-2026-10-15.md`: it adds the per-IP limits. This prompt does the rest. The privacy page gets its backups paragraph before any backups exist, then you move to paid plans and set a spending alert, click by click.

```text
Goal: a dispensary's pages can't go blank because NOSE ran out of Netlify credits or its database paused, and the privacy page says how long deleted data can live on in backups before any backup exists. M4 has added Netlify's per-IP rate limits; check that it landed. What is left:
- Supabase's free plan keeps no backups and pauses a project after a week idle; netlify/functions/keep-awake.js exists to stop that (PARSER-HANDOFF.md §13 Still open).
- §14 Still open, "Backups": a paid plan's daily backups would keep a deleted dispensary's rows for days afterwards, and a deleted account's or a removed report's alike. The privacy page says nothing about backups, and has to before the plan changes.
- Nothing alerts me before NOSE's Netlify usage runs out.

Where: privacy/index.html (every passage that says something is deleted: "Deleting your account", "How long we keep things", the lab-report removals, #dispensaries "When a dispensary stops using NOSE"; and a "What changed" entry); PARSER-HANDOFF.md §13 and §14; settings on Supabase and Netlify, which I change with your clicks.

Probe, before editing:
1. Confirm M4 landed: the functions it names export config.rateLimit. If not, stop.
2. Ask me: my Netlify plan (the team, then Billing); my Supabase plan (the organization, then Billing); and whether the accounts, the archive and the dispensary tables all live in one Supabase project (Project Settings, then General). The privacy page says the archive and b2b share one database; it doesn't say where accounts are.
3. Read and quote, each with the day read:
   - Supabase: database backups (how often on the plan I'll move to, how many days kept, point-in-time recovery as an add-on, what a restore does); whether paid projects pause; the Pro plan's price and its spend cap.
   - Netlify: credits and usage on my plan, what happens at the limit, and how to get a usage notification before it.
   - Netlify Blobs: whether it keeps any backup or earlier version of a deleted blob.
4. Quote every privacy-page sentence that says something is deleted, and when.

Build:
1. The privacy page, before any plan changes. Beside each deletion, say how long a copy can remain in the database's backups on the plan I'm moving to, using the docs' number, and that the backups are kept by Supabase. Say that if a backup were ever restored, anything deleted since is deleted again. Say what Blobs does from its docs: if it keeps no copies, the file storage keeps none. Show me every sentence first. Then a "What changed" entry, dated the day it goes live.
2. Commit, push, and wait until the new sentences are on the live page. Only then:
3. My clicks, one at a time:
   - Supabase: move to the plan we agreed; confirm daily backups show as on; set the spend cap the way I choose.
   - Netlify: a usage notification at the level I choose. If I'm on Free or Personal, ask whether to move to Pro, so all five of M4's rules can apply, and if I do, how to add the other three (M4's own table).
4. keep-awake.js: ask me whether to keep it once the project can't pause. If I say remove it, that's its own commit, with its schedule and tests.
5. PARSER-HANDOFF.md: the record in §13; §14's "Backups" closes; §13's free-project pause item is updated.

Must not move: what NOSE collects or sends; every js/ and css/ file; every gate's expected line.

Should change: the site survives a flood and a quiet week, and the privacy page tells the truth about copies in backups before any exist.

Done when: ALL GATES GREEN; the privacy sentences are approved and live before the plan changed; the plan and alert are set; and you've given me the monthly cost of what I chose, from the pricing pages, cited with the day read.
```

## B7: a page for dispensaries, a pitch view of the demo, a true About

Run M6 ("One header and one footer") first, so the new page's link goes into one footer instead of 23 copies. This prompt builds `/dispensaries/` from claims that are true today, adds a pitch view of the demo that opens on the widget, and rewrites About with your real story.

```text
Goal: a dispensary buyer who visits nose-app.com finds what NOSE offers them, can try the widget in one tap, and can see who is behind it. Today nothing on the site mentions dispensaries. /b2b/demo/ is noindex, linked from nowhere, and opens on a developer form (Mode, Consent, Group, Words), with the widget below the fold on a phone. The About page tells a two-person, twenty-year origin story ("Between us...") that has never been confirmed, and it names no one.

My facts (if any is blank, ask me; never invent one):
- Is the About story true as written? ____ If not, the true one, in my words: ____
- Name(s) to show, or "company only": ____
- Contact for dispensaries: ____
- A price on the page, or none: ____

Where: dispensaries/index.html (new); b2b/demo/index.html and js/b2b-demo.*.js (the pitch view); one stylesheet only if the page needs it; about/index.html; the footer (partials/footer.html if M6 has landed; if not, stop and ask me); the home page's closing section; sitemap.xml; test/b2b-widget-test.mjs, or whichever test covers the demo; PARSER-HANDOFF.md §14.

Probe, before editing:
1. Show me the demo page's structure, what js/b2b-demo does on load, and which bundles it loads (expect the build's own js/b2b-widget.<hash>.js, not a release).
2. Show me what a new page needs to pass the build: the CSP (no inline script or style), fingerprinting, check-published, check-trust and colour-tokens.
3. Quote the About page's origin section, and every trust claim on it.

Build:
1. /dispensaries/. Every claim is true today, with the file it rests on in an HTML comment beside it:
   - What shoppers see: the rail, the sold-out panel and the vote, one screenshot each (from the compliance kit or the demo), each with alt text.
   - The promise: a shopper's purchase history never reaches NOSE, because the shopper's own browser does the ranking. What NOSE does receive: the store's catalog, and votes that carry no identity.
   - What a store's web team does: one script tag with a pinned hash, three CSP lines, one element, and a catalog upload from the store's server (docs/B2B-INTEGRATION.md).
   - What we do first: a coverage report on your menu, i.e. how many of your in-stock inhalables have a terpene panel NOSE can read.
   - Compliance: every word the widget shows in one file; the compliance kit for the Department; the Florida wording. Say "reviewed by counsel" only once I tell you it has been.
   - The pilot: one store; half of signed-in patients see the widget; one metric; read once; published whatever it shows.
   - What NOSE won't do: anything about effects; guesses from strain names; scores for batches without a panel.
   - Contact, and a link to the pitch demo.
   Never: client names or logos, user counts, testimonials, "trusted by", uptime promises, invented numbers or cannabis-leaf images. It is read in Florida: no consumption imagery, nothing recreational.
2. The demo's pitch view: /b2b/demo/?view=pitch opens on the widget, with the consent prompt ready and the example purchases loaded, plus one line saying the store and products are made up. A "Show the developer controls" button reveals today's form. Without the parameter, the page behaves exactly as now. It stays noindex. The test that covers the demo checks both views, with the same gate line.
3. About: the true story, tightened, in my words, with no invented detail; the name(s) as I gave them. Add a founder to the Organization JSON-LD only if I named someone.
4. Links: "For dispensaries" in the footer and in the home page's closing section; /dispensaries/ in sitemap.xml.
5. PARSER-HANDOFF.md: the record in §14; the Still open note that the demo is "linked from nowhere" is updated.

Must not move: the widget's files and every release; js/match-math; what NOSE keeps or sends; the consumer pages beyond the two links and About; every gate's expected line.

Should change: nose-app.com has a front door for dispensaries, the demo makes its point in one tap on a phone, and the About page is true.

Done when: ALL GATES GREEN; you've shown me /dispensaries/ and the pitch view at 390 and 1280 px wide; you've listed every claim on the new page beside the file it rests on; and you've walked me through, one step at a time:
1. In the Codespace: git pull --ff-only, then npm run gates.
2. git push, then wait for the run on GitHub to go green and live to move.
3. On my phone: /dispensaries/, then its demo link, then tap the consent button.
```

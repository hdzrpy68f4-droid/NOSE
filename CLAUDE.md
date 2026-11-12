# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

NOSE (nose-app.com) is a cannabis terpene **aroma** matcher. It reads the terpene panel off a lab report (COA, certificate of analysis), builds a "palate" from jars a person likes, and scores other jars by how alike they smell. It also has a dispensary (B2B) module: an embeddable `<nose-matches>` widget, a catalog upload, a feed, votes, pinned releases and a pilot report.

**Scope rule, enforced by tests:** aroma and flavour only, never effects. No words about relaxing, energising, focus, calm, sleep or "the high", anywhere: strings, pages, warnings or refusal reasons. If in doubt, cut the claim. `b2b-strings-test`, `match-feedback-test` and others fail on effect words.

`PARSER-HANDOFF.md` (~8,400 lines) is the project's authoritative record. Its sections: §2 current counts, §4 non-negotiable rules, §5 how to work, §6 parser architecture, §7 output contract, §8 adding a terpene, §11 bug log, §13 archive and app, §14 dispensary. Read the relevant section before changing a subsystem. When a change alters behaviour it records, update it in the same commit. The `docs/` folder has the B2B integration, catalog format and pilot docs.

## Brand rules

**Priorities, in order:** the matching maths is correct, then the brand rules hold, then polish.

- **Never claim or imply effects.** No relaxing, energizing, focus, calming. Aroma and flavor only.
- **Nothing made up:** no fabricated statistics, testimonials or credentials.
- **Say uncertainty out loud.** The match score is a hypothesis that has not been validated at scale.
- **Strain names are unreliable.** The only thing trusted is the lab report for that jar.
- **AI-generated imagery:** no cannabis leaves, and no text baked into the image.
- **Match bands** (`matchBand()` in `js/match-math.*.js`): the internal names are Strong, Good, Moderate, Low. Users see them as Close match, Related profile, Partial overlap, Different profile. The thresholds are ≥ 0.90, ≥ 0.75, ≥ 0.55, below that.
- **`PARSER-HANDOFF.md` is the source of truth** for the algorithm, the bands and the freshness rules. If it and this file disagree, it wins.

## Working with the user

Give terminal and Git instructions as beginner-friendly numbered steps with exact commands and minimal explanation.

## Commands

The project ran in a GitHub Codespace (Linux). Every script is bash and Node 24 (`.nvmrc`), so on Windows use Git Bash.

```bash
npm ci
node test/extract-dump.js            # regenerate test/fixtures/extracted/*.txt from the PDFs (gitignored; gates need it)
npm install --no-save playwright@1.64.1 && npx playwright install --with-deps chromium   # for the 3 browser gates; redo after any npm ci
bash scripts/gates.sh                # every gate; must end "ALL GATES GREEN" (npm test / npm run gates are the same)
bash build.sh                        # must end "OK — ready to deploy"
```

There is no test framework. Each test is a plain Node script, so run one by itself with `node test/<name>-test.js` (or `.mjs`). Each prints one exact success line, usually `<name> clean`. `gates.sh` passes a gate only on that exact line, and the expected counts are hard-coded there. The core parser checks:

```bash
node test/coa-gate-test.js test/fixtures/extracted netlify/functions/lib/parse-coa.js | tail -1   # 56 accepted / 3 rejected
node test/extraction-parity.js test/fixtures/pdf                                                 # 56 match / 0 differ
node test/fixture-lint.js                                                                        # corpus clean
```

After any parser change, the Kaycha anchors must not move: `KAY-CAR-001` → 4.124 and `KAY-PRR-001` → 0.944. With database access, `node scripts/reparse.js --dry-run` shows which archived reports would now read differently.

## Deploy model

There's no manual deploy. On every push to `main`, `.github/workflows/gates.yml` runs `gates.sh` on a fresh machine with no secrets. If the run is green, the `promote` job fast-forwards the branch `live`, and Netlify builds `live`. CI also fails if the gates leave the tree changed. So after editing a bundle, run `bash build.sh` and commit the renamed files. The steps to check a deploy are in PARSER-HANDOFF §13, "After a deploy — check it".

## Architecture

**Static site at the repo root** (Netlify publishes `.`). It has no framework or bundler. Pages are hand-written HTML, and `js/` and `css/` hold bundles whose names carry a content hash (`js/nose.2280eec5.js`). **Edit the hashed file, then run `build.sh`.** The build renames it to a new hash, rewrites references in every `.html`, and also:
- checks the committed `vendor/html5-qrcode.min.js` against its pinned SHA-256
- refuses inline scripts and a loosened CSP (`_headers`)
- checks script load order: `match-math` before `aroma-bar`, then `nose` / `b2b-rank` / `b2b-widget`
- runs `scripts/check-trust.mjs` and `check-published.js`

Shared front-end modules, each with one home:
- `js/match-math.*.js`: **all the matching maths** (`window.NoseMatch`, the `TERPENES` → family map, `matchBand()`, `shownScore()`). The app, the B2B ranker (`b2b-rank`) and the Node scripts (`scripts/lib/match.js`) all read it, and `match-test.js` fails if another copy appears. Scores are pinned bit for bit in `test/fixtures/match-golden.json`. If a change alters scores, regenerate it with `test/match-golden-make.js` in the same commit and say why.
- `js/aroma-bar.*.js`: the six-family bar (citrus, earthy, floral, herbal, pine, spice), shared by the app and the widget.
- `css/tokens.*.css`: the only place the family colours are defined. `colour-tokens-test` checks every copy against it.

**Netlify Functions** (`netlify/functions/`, esbuild, Node 24). The main path is `coa.js`, a default-export `Request` handler: `lib/fetch-report.js` resolves a QR link or viewer page and downloads the PDF, `lib/extract-text.js` extracts the text with unpdf, `lib/parse-coa.js` parses it, then the card reply goes out and `lib/archive.js` saves to Postgres plus Netlify Blobs (the PDF). Shared plumbing lives in `netlify/functions/lib/db.js` (`withClient`, `scrub`) and `netlify/lib/http.js` (`readJsonBody`, `json`, `notFound`, `within`). Use these rather than writing new ones. Other functions handle auth and accounts, `palate-sync`, `match-feedback` votes (to Blobs), client error beacons, and the `b2b-*` endpoints, which are behind `B2B_ENABLED` (`lib/b2b-flag.js`).

**Database:** Supabase Postgres, schema in `supabase/migrations/`. Schema `nose` is the archive, written by role `nose_writer` (`NOSE_DB_URL`). Schema `b2b` is the dispensary data, role `nose_b2b` (`NOSE_B2B_DB_URL`). Admin scripts use `NOSE_DB_ADMIN_URL`. TLS is verified against an embedded Supabase CA (`lib/supabase-ca.js`): never put `sslmode` in a URL, never set `rejectUnauthorized: false`. Tests run offline against PGlite with stand-ins for `pg`, `@netlify/blobs` and fetch. No gate needs secrets. Secrets live only in Codespaces secrets and Netlify env vars.

**`scripts/`** holds operator tools run by hand: archive reparse, backfill, review queue, drift and lab stats, duplicate and removal admin, and B2B store, catalog, release and pilot tools. PARSER-HANDOFF §5 has a table of them.

## The COA parser: rules that must hold

`netlify/functions/lib/parse-coa.js` is the riskiest file. From PARSER-HANDOFF §4–§8:

- Below-LOQ values (`<LOQ`, `ND`, `BQL`, `<0.200`) are **0**. cis- and trans-nerolidol are summed. Cannabinoids never enter the terpene vector. Total terpenes is a separate intensity axis; profiles are compared as share of total. **Names match exactly** (caryophyllene oxide ≠ caryophyllene).
- **Fail closed:** a correct reading or a clear refusal, never a believable wrong fingerprint.
- Columns are chosen by **reconciliation** (which column sums to the lab's own printed total), not by position. The readers form an **ordered pipeline** (forward → column-major → backward), not a scoring contest; a contest was tried and broke ACS and TerpLife. The empirical constants each come from a real failure, so changing one needs a fixture that justifies it.
- **A change that fixes one lab and breaks another is not a fix.** Revert it. Parity also compares `readBy`, `productClass`, `moisture`, `waterActivity` and `warnings`, so a change of route shows up as DIFFER and needs deliberate re-baselining in `test/fixtures/coa-baseline.json`.
- The output field names (§7) are read by the app by name; renaming one breaks it silently. `rejectReasons` and `warnings` are shown to users **verbatim**, so write them as plain English with no internal class names.
- **A new terpene key takes two edits:** `ANALYTE_MAP` in the parser **and** `TERPENES` in `js/match-math.*.js`. Otherwise `sanitizeTerps()` silently drops it. It changes scores, so regenerate the golden file. `wip/nose-farnesene-wip.js` is unfinished work on exactly this.
- Before trusting a test result, confirm your change is in the tree (grep for a token unique to it). A run against an unpatched file looks like a pass.

## Repository hygiene

This repository is **public**. New fixture PDFs are gitignored (`test/fixtures/pdf/*.pdf`) until the §9 decision is made, and `git add -f` is the deliberate override. Never commit dispensary catalogs or reports (`b2b-out/`), shopper data, `.env` or `netlify/functions/lib/build-info.json`. Commit messages follow the form `<area>: <what changed - why>`.

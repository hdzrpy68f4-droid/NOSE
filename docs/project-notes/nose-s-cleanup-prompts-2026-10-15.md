# NOSE: the small cleanups (prompts, 2026-10-15)

Three prompts for the S items in `claude/nose-architecture-review-2026-10-15.md`, written after the four XS prompts landed (`c1f04fe`). Each is one commit. Paste the preamble once at the start of a session, then one prompt, and wait for its commit before the next. Run Prompt 1 before Prompt 3, because the CI reads its Node version from `.nvmrc`. Prompt 2 can go any time.

What turned up while writing them, checked at `c1f04fe`:

- **Production already runs Node 24; the gates don't.** `.nvmrc` says 20, so Netlify builds on 20. Netlify runs functions on the build's Node only if AWS isn't about to retire it, otherwise on Node 24. AWS deprecated Node 20 on April 30, 2026, so the scanner and the archive already run on 24, while the Codespace runs the gates on 20. Node 22 isn't a good middle step: AWS retires it on April 30, 2027, and Netlify would fall back to 24 from about March. `unpdf` 1.8.0 needs Node 22 or later.
- **The review's colour fix wouldn't have worked.** Of the 23 pages, 3 load `shell.css` and 20 load `family.css`, and none loads both. So `family.css` can't read variables kept in `shell.css`; one home for the colours has to be a new stylesheet that every page loads.
- **Only the inks have drifted.** The six fills match everywhere. Three different ink sets reach a screen: the home page's family cards, the six aroma pages, and the cards on `/aromas/`. `shell.css` defines two more sets and uses neither.
- **The project's own colour table fails contrast.** Its citrus ink reaches only 4.42:1 on the aroma pages' tinted header, below the 4.5:1 that WCAG AA asks of small text. So that set isn't on offer below.
- **CI is free here and needs no secrets.** GitHub Actions costs nothing for a public repository. Since the QR library is pinned, no gate needs the network. Three catches:
  - A shallow checkout quietly skips the trust guard's history check and still passes.
  - The widget test's known flake would make CI fail at random, so Prompt 3 fixes it first.
  - Cloud sessions run 22 of the 32 gates; CI would run all of them on every push.

## Settled before you paste

Each prompt assumes these. If you decide otherwise, change the named line before pasting, or ask me for the other version.

- **Prompt 1: Node 24 everywhere.** That means `.nvmrc`, `package.json`'s `engines`, the Codespace, and the CI that reads `.nvmrc`. A new first gate fails when the Node running the gates isn't the one `.nvmrc` names. Build steps 1–4.
- **Prompt 2: the inks are set B,** the six aroma pages' set. It has the highest contrast of the three on screen today, at 6.49:1 or more everywhere an ink appears, against 4.5:1 required:

  | Family | A: home cards | **B: aroma pages** | C: `/aromas/` cards |
  |---|---|---|---|
  | Citrus | `#654700` | **`#654700`** | `#7A5A0E` |
  | Earthy | `#68431F` | **`#5C3B20`** | `#6E4A2B` |
  | Spice | `#833817` | **`#7E3417`** | `#8A3B1D` |
  | Pine | `#28583A` | **`#2A5439`** | `#2F5D40` |
  | Floral | `#5B4386` | **`#4E3878`** | `#563F86` |
  | Herbal | `#2E6671` | **`#2C565E`** | `#316068` |
  | Lowest contrast | 5.18 | **6.49** | 5.25 |

  With B, five of the home page's six inks darken, all six on `/aromas/` change, and the aroma pages stay as they are. Set A is the one choice that changes no file in `js/`. To use A or C, change the table in the prompt's first line.
- **Prompt 3: you keep pushing to `main`, and only a green commit reaches the site.** A workflow on GitHub runs every gate on each push to `main`. When they pass, it moves a branch named `live` to that commit, and Netlify deploys `live` instead of `main`. A red commit stays on `main` and never reaches the site. The alternative is GitHub's usual pull-request flow with a required check, which adds five or so commands to every change. If you want that, ask me for that version.
- **Prompt 3: Playwright is pinned** to the version your Codespace runs, in both the workflow and `gates.sh`, so CI and the Codespace test with the same browser.

## Preamble (paste first)
```
Repo: https://github.com/hdzrpy68f4-droid/NOSE. Read PARSER-HANDOFF.md §4–§7 and §13 first, and §14 when the prompt touches B2B. Aroma only, no effect claims; never assert scraped numbers; the archive keeps nothing about the person who scanned. I'm a beginner in Codespaces: step-by-step commands, short explanations.
- These are the small cleanups from the architecture review of 2026-10-15 (project doc claude/nose-architecture-review-2026-10-15.md). Do only what the prompt says. If the fix grows past it, stop and tell me.
- Run the prompt's probe BEFORE editing. If it doesn't show what the prompt expects, stop and tell me.
- bash scripts/gates.sh must say ALL GATES GREEN before and after. KAY-CAR-001 4.124 and KAY-PRR-001 0.944 unchanged. A changed test keeps its gate's exact expected line; a new gate goes into gates.sh and §5 in the same commit.
- Don't touch the parser (parse-coa.js, coa-dates.js, extract-text.js), the maths (js/match-math.*.js), schema nose, schema b2b or any migration. If the prompt seems to need one, stop and tell me.
- None of these prompts changes what NOSE keeps or sends, so the privacy page doesn't move. If one seems to, stop and tell me.
- build.sh renames a changed js/ or css/ file; commit the renamed file. Each prompt says which it expects.
- Where a change depends on how Netlify, GitHub, Supabase or a browser behaves, check the current docs and cite the page with the day you read it. Don't rely on memory.
- When I have to change a setting on GitHub or Netlify, give me the clicks one at a time; don't assume I know where a setting lives.
- New words in comments and docs: no effect wording ("effect" itself is on the tests' word list), and never a sentence saying nothing is stored or kept (check-trust).
- Record what you did in PARSER-HANDOFF.md where the prompt says, above that section's Still open list, in the same commit. Commit when green.
```

## Prompt 1: Node 24, and a package.json that says what the project is
```
Goal: the build, the functions, the Codespace and the gates all run Node 24, and package.json stops being npm's template.
- .nvmrc says 20, so Netlify builds on 20. Functions run on the build's Node only when AWS isn't retiring that runtime within two months. AWS deprecated Node 20 on 2026-04-30, so the functions, coa.js and the archive among them, already run on Netlify's fallback, Node 24.
- The gates run on whatever the Codespace has: 20 so far. unpdf 1.8.0 declares Node 22 or later.
- In package.json, "test" is npm's placeholder that exits 1, and "main" names an index.js that doesn't exist.

Where: .nvmrc; package.json; package-lock.json (its root entry only); test/node-version-test.js (new); scripts/gates.sh; PARSER-HANDOFF.md §5 and §13.

Probe, before editing:
1. cat .nvmrc: expect 20. Note node --version in your workspace.
2. Read and quote, each with its updated date and the day you read it:
   - Netlify, "Manage build dependencies" (Node.js version for builds): the build reads .nvmrc.
   - Netlify, "Optional configuration for functions" ("Node.js version for runtime"): functions run on the build's Node if it's a Lambda runtime not deprecated within the next two months; otherwise on Node 24.
   - AWS Lambda's runtimes page: nodejs20.x deprecated 2026-04-30, nodejs22.x on 2027-04-30, nodejs24.x on 2028-04-30.
   If any says otherwise, stop and tell me.
3. From package-lock.json: every locked package whose engines.node Node 24 would not meet. Expect none; unpdf 1.8.0 asks >=22.
4. git grep -n -E "nvmrc|NODE_VERSION|AWS_LAMBDA_JS_RUNTIME" -- . ':!PARSER-HANDOFF.md'. Expect scripts/verify-manifest.sh alone, which checks the file exists.

Build:
1. .nvmrc: 24.
2. package.json:
   - add "private": true
   - remove "main" and "directories"
   - "scripts": "build" is "bash build.sh"; "gates" and "test" are both "bash scripts/gates.sh"
   - add "engines": { "node": "24.x" }
   Nothing else; every dependency stays as it is. netlify.toml keeps "bash build.sh".
3. package-lock.json: npm install --package-lock-only --offline --ignore-scripts. Every package is already locked, so this needs no registry. Expect only the root entry to change, gaining the same "engines": git diff shows those lines and nothing else. Anything more: stop.
4. test/node-version-test.js, offline, checks three things:
   - the running Node's major version is .nvmrc's
   - package.json's engines.node is "<that major>.x"
   - the lockfile's root engines.node is the same
   It prints one line such as "node v24.22.0, .nvmrc 24, engines 24.x", then "node-version clean". Otherwise it prints the mismatch and exits 1. It becomes the FIRST gate in gates.sh: 'node version', 'node-version clean'.
5. gates.sh's header: npm run gates runs the same file; the Node to use is .nvmrc's; how to switch the Codespace to it (nvm install, then nvm alias default <n>).
6. PARSER-HANDOFF.md: §5's harness table and gate list gain the new test. The record goes in §13: the docs quoted, what moved, and that this closes the security audit's item 12 (project doc claude/nose-security-audit-2026-10-15.md).

Must not move: every dependency and its locked version; netlify.toml; the parser and the maths; every js/ and css/ file, so build.sh renames nothing; every other gate's expected line; build-info.json's extractorVersion (it hashes extract-text.js and the installed unpdf, not Node), so no reparse is due; what NOSE keeps or sends.

Should change:
- Netlify builds on 24, and the functions run on 24 by Netlify's own rule rather than its fallback.
- The Codespace runs the gates on 24.
- On any other Node, the first gate says so.
- One gate more than before.

Done when: ALL GATES GREEN on Node 24. If this workspace has no Node 24, every gate but 'node version' is as before; say which version ran. Then walk me through, one step at a time:
1. In Netlify: Project configuration → Environment variables. Tell me whether NODE_VERSION or AWS_LAMBDA_JS_RUNTIME is set. If either is, stop: it overrides .nvmrc.
2. In the Codespace: git pull --ff-only, then npx playwright --version, and note the version it prints.
3. nvm install (it reads .nvmrc), nvm alias default 24, open a new terminal, node --version: v24.
4. cp -r test/fixtures/extracted /tmp/extracted-node20, then npm ci, then Playwright again at the noted version: npm install --no-save playwright@<version>, then npx playwright install --with-deps chromium.
5. node test/extract-dump.js, then diff -r /tmp/extracted-node20 test/fixtures/extracted. Expect no difference: Node 24 extracts the same text the gates used on 20. If any file differs, stop and bring me the diff.
6. npm run gates: ALL GATES GREEN, 'node version' first.
7. node scripts/reparse.js --dry-run: every document unchanged. It only reads.
8. git push. Once the deploy is live:
   - Netlify → Deploys → the newest → Deploy log says it is using Node 24.
   - The home page and /app read 74 · Partial overlap.
   - One COA link read on /app shows its card.
```

## Prompt 2: one home for the family colours
```
Goal: each aroma family's fill and ink is defined once, in a stylesheet every page loads, and every copy that can't read that stylesheet is checked against it.
- The six fills already agree everywhere. Three different sets of inks reach a screen: the home page's family cards, the six aroma pages, and the cards on /aromas/. shell.css defines two more sets and reads neither, and nothing keeps any of them equal.
- The review proposed keeping them in shell.css. That can't work: a page loads shell.css or family.css, never both.

The inks (everything below uses them; the fills don't change):
  citrus #654700   earthy #5C3B20   spice #7E3417   pine #2A5439   floral #4E3878   herbal #2C565E

Where: css/tokens.css (new); css/shell.*.css; family.*.css; css/agegate.*.css; css/account.*.css; all 23 pages (one <link> each); build.sh (one fingerprint line); js/aroma-bar.*.js (FAMILIES' text values, only if they differ from the inks above); scripts/verify-manifest.sh; test/colour-tokens-test.js (new) and scripts/gates.sh; test/b2b-widget-test.mjs (only if js/aroma-bar changes); PARSER-HANDOFF.md §13.

Probe, before editing:
1. For every tracked page outside test/, the stylesheets it loads. Expect 23 pages:
   - 3 load css/shell (index.html, app.html, b2b/demo)
   - 20 load family.css
   - none loads both
   - 20 load css/agegate (all but account, privacy and terms)
2. Every place a family fill or ink is written as a colour, file by file:
   - shell.css: two :root blocks, .bg-*, .fam-*
   - family.css: .famcard-*, .sw-*, .ink-*, body.theme-* and the swatch rules near its end
   - agegate.css: the gradient and six bars
   - account.css: one border
   - js/aroma-bar's FAMILIES (color and text)
   - js/hero's FILLS
   - favicon.svg
   - the six aroma pages' theme-color
   Expect the same six fills everywhere.
3. Which inks reach a screen:
   - js/nose's family cards on the home page read FAMILIES.text
   - the six aroma pages read body.theme-*
   - /aromas/ reads .famcard-* and .ink-*
   - nothing reads shell.css's --<family>-text or .fam-*'s --family-text
   Expect three different sets.
4. WCAG contrast of each set, taking the worst of four backgrounds: white, #F3F3EE, the family's fill at 10% over white (the note pills), and at 11% over #F3F3EE (the aroma page header). Cite WCAG 2.2's contrast ratio and relative luminance definitions. Expect lowest values of 5.18 for the home cards' set, 6.49 for the aroma pages' (the inks above) and 5.25 for /aromas/'. If the numbers differ, stop and tell me.

Build:
1. css/tokens.css holds one :root block and nothing else:
   - --citrus, --citrus-text and so on through --herbal-text, in family order: the fills as today, the inks above
   - a header comment naming the copies that can't read it and the test that holds them to it
2. Every page links /css/tokens.css before any other stylesheet. build.sh fingerprints it, with one line beside the other css lines, and rewrites the links like every other.
3. Point every colour at the variables:
   - shell.css: the twelve family lines leave its first :root, and the second :root (the one-line block near line 659) goes; .bg-* and .fam-* use the variables.
   - family.css: .famcard-*, .sw-*, .ink-*, body.theme-* and the swatch rules use the variables.
   - agegate.css and account.css: the same.
   No other rule changes.
4. js/aroma-bar's FAMILIES: each text value becomes the ink above where it differs, and color stays. js/aroma-bar also runs on a store's page inside the widget, where no tokens.css exists, so it stays a copy. js/hero's FILLS, favicon.svg and the theme-color metas stay as they are.
5. test/colour-tokens-test.js, offline, a gate after the build: 'colour tokens', 'colour-tokens clean'. It checks:
   - exactly one tokens file, holding the twelve properties in family order and nothing else
   - no other tracked stylesheet or page defines any of the twelve, or writes any of the six fills or six inks as a colour (wip/ aside, a stale draft loaded by nothing)
   - every page outside test/ links tokens before its other stylesheets
   - js/aroma-bar's FAMILIES (loaded as Node loads it), js/hero's FILLS, favicon.svg and each aroma page's theme-color equal the tokens
   - every ink reaches 4.5:1 on the four backgrounds of probe 4, WCAG AA for text
   Against broken copies, in a scratch harness not committed, each of these must fail it:
   - an ink changed in js/aroma-bar alone
   - a fill hardcoded back into family.css
   - a page without the link, or with it after shell.css
   - a second :root defining --pine
   - an ink below 4.5:1
6. If js/aroma-bar changed: b2b-widget-test's check of the 31 lines moved there on 2026-10-08 pins their new SHA-256. Its name says the inks changed on the day you commit, and the record gives the old and new hash. Its gate line stays b2b-widget clean.
7. scripts/verify-manifest.sh: css/tokens.<hash>.css is required.
8. Take pictures of the home page's family cards, /aromas/ and /aromas/earthy/, at 1280 and 390 px wide, before and after the change. Show me them before committing.

Must not move:
- every fill; every aroma bar (renderBar reads color, never text, and sets its own label colours)
- the widget and its stylesheet, which name no family colour; release 1, and no new release is cut
- every score and band; every page's text and layout; the privacy page
- every other gate's expected line
- js/nose, js/hero and js/match-math. Only js/aroma-bar may be renamed, and only if its inks change.

Should change:
- With the inks above: the home page's "Learn more" links darken in five families (citrus stays), the /aromas/ cards' inks change in all six, and the aroma pages look as they do now.
- Each page makes one more stylesheet request, cached for a year (_headers, /css/*).
- One gate more than before.

Done when: ALL GATES GREEN; you've shown me the pictures before committing; and you've walked me through, one step at a time:
1. In the Codespace: git pull --ff-only, then npm run gates (bash scripts/gates.sh if Prompt 1 hasn't run).
2. git push.
3. Once the deploy is live:
   - The home page's family cards, /aromas/ and /aromas/earthy/ look as in your after pictures.
   - The browser console (right-click, Inspect, Console) shows no error on each.
   - curl -s https://nose-app.com/ | grep -o '/css/tokens\.[0-9a-f]*\.css' prints one name.
```

## Prompt 3: CI on GitHub, and only green commits deploy
```
Goal: every push to main runs every gate on GitHub's machines, with no secrets, and the live site only ever gets a commit whose gates passed. Today the gates run only when someone runs them, cloud sessions can run 22 of the 32, and Netlify deploys whatever reaches main.

The design:
- I keep pushing to main as today.
- A workflow runs the gates. When they pass on main, it fast-forwards a branch named live to that commit, and Netlify's production branch becomes live.
- A red commit stays on main and reaches the site only through a later green commit that contains its fix.

Where: test/b2b-widget-test.mjs (two waits); .github/workflows/gates.yml (new); _redirects (one forced 404); scripts/gates.sh (header); PARSER-HANDOFF.md §5, §13 ("After a deploy" and the record) and §14 (Still open). Then two settings I change by hand, one on GitHub and one on Netlify.

Probe, before editing:
1. The flake (§14 Still open, "b2b-widget-test can fail on a slow run"): test/b2b-widget-test.mjs reads the focus with deepFocus() straight after the basis is drawn again, near line 618, and again after the put-back, near line 627, without waiting for it. Show me both. Run the widget gate 10 times and report how many pass.
2. What a fresh machine needs before the gates can run, read from gates.sh and the tests: npm ci, Playwright with its Chromium, and test/fixtures/extracted written by test/extract-dump.js. List any gate that reads a secret or the network. Expect none: build.sh no longer downloads anything since b4b2356. Tests that commit in throwaway repositories set their own git identity.
3. History: check-trust-test reads commit da5a6cf from this repository's history. When that commit isn't there, as on a shallow checkout, it prints "history skipped" and the gate still passes. Show me that line.
4. Read and quote, each with its date and the day you read it:
   - GitHub, Actions billing: free for public repositories on standard GitHub-hosted runners
   - GitHub, GITHUB_TOKEN: a push made with it starts no workflow run
   - GitHub, workflow syntax: permissions and concurrency
   - actions/checkout: fetch-depth 0 fetches the whole history
   - actions/setup-node: node-version-file
   - Playwright's CI page: install --with-deps
   - Netlify, Deploy overview: the production branch is set under Branches and deploy contexts, and there are no branch deploys unless someone sets them up
   - GitHub, About rulesets: available for public repositories with GitHub Free
   If any says otherwise, stop and tell me.
5. Ask me for the Playwright version my Codespace runs (npx playwright --version). That is the version the workflow pins.

Build:
1. The flake: before each of those two focus reads, wait for the focus to land with page.waitForFunction on the same deep-focus test, for at most 2 seconds, then check as today. A focus that never lands still fails. The same checks, the same names, and the gate line stays b2b-widget clean. Run the widget gate 20 times: expect 20 clean.
2. .github/workflows/gates.yml:
   - Runs on: a push to main, any pull request, and by hand (workflow_dispatch).
   - Concurrency: one run per branch at a time; a newer push cancels an older run.
   - Job "gates": ubuntu-latest, a 30-minute timeout, permissions contents: read. Steps, in order:
     - check out with the whole history
     - set up Node from .nvmrc, with npm's cache
     - npm ci
     - npm install --no-save playwright@<the pinned version>
     - npx playwright install --with-deps chromium
     - node test/extract-dump.js
     - bash scripts/gates.sh
     - node test/check-trust-test.js, failing unless it prints "history checked"
     - fail if git status --porcelain lists anything: the commit must already be as build.sh leaves it
   - Job "promote": runs after "gates", only on a push to main, with permissions contents: write.
     - Check out with the whole history.
     - If live already contains this commit, say so and stop.
     - Otherwise run git push origin <this commit>:refs/heads/live, never forced. If git refuses because live isn't behind this commit, the job fails and moves nothing.
   - Pin every action to the full commit SHA of its current release, with the version in a comment, read from its releases page that day.
   - No secrets, no pull_request_target, and nothing written anywhere but live.
3. _redirects: /.github/*  /404.html  404!  (the whole root is published).
4. scripts/gates.sh's header:
   - the Playwright install line names the pinned version, the same as the workflow
   - this file is what GitHub runs on every push to main
   - a red run keeps the site at the last green commit
5. Lint the workflow with actionlint if you can get it; otherwise parse it as YAML. Show me the result.
6. PARSER-HANDOFF.md:
   - §5 says the gates also run on GitHub for every push to main and decide what deploys.
   - §13's "After a deploy" starts with: the run on GitHub is green and live has moved.
   - The record goes in §13.
   - §14's flake item comes off Still open.

Must not move:
- every gate's expected line and the number of gates
- every other check in b2b-widget-test
- the site itself
- Netlify's environment variables and their Production context, which now apply to builds of live: B2B_ENABLED, NOSE_DB_URL and the rest
- scripts/b2b-release.js and the pilot report, which read origin/main
- what NOSE keeps or sends

Should change: a push to main reaches the site only after its gates pass on GitHub, some minutes later. A cloud session's work is then checked by every gate, not 22.

Done when: the gates run as far as this workspace allows, the workflow is linted, and you've walked me through, one step at a time:
1. In the Codespace: git pull --ff-only, then npm run gates: ALL GATES GREEN. Then run node test/b2b-widget-test.mjs | tail -1 five times; expect b2b-widget clean each time.
2. git push. On GitHub, open the repository, then Actions, then gates, then the newest run. Wait until both jobs are green. Branches now lists live.
3. In Netlify:
   - Project configuration → Developer settings → Continuous deployment → Branches and deploy contexts → Configure.
   - Set the production branch to live and branch deploys to None, then save.
   - Deploys → Trigger deploy → Deploy project.
   The deploy log names the branch live, and the home page still reads 74 · Partial overlap.
4. On GitHub: Settings → Rules → Rulesets → New ruleset → New branch ruleset.
   - Name it protect, set enforcement to Active, and target main and live.
   - Turn on Restrict deletions and Block force pushes, and nothing else. Save.
5. The next push, this prompt's Live record, is the real test. Its run goes green, live moves, and Netlify starts a production deploy from live with nobody pressing a button. If no deploy starts within a few minutes of live moving, stop and tell me.
6. If a run is ever red: the site stays as it was. Open the run; the failing gate's lines are in the gates step. Fix it on main and push again.
```

## Left alone on purpose

- **Pull requests with a required check.** Prompt 3 assumes pushes to `main`, as today. Protecting `main` itself means a branch, a pull request and a merge for every change; that version is its own prompt.
- **Playwright as a dev dependency.** It would end `npm ci` deleting it, but adding it means locking new packages, which needs npm's registry. A cloud session can't reach it, so for now the version is pinned in two places instead.
- **The aroma bar's label contrast.** The labels are 10 px bold white text on the fills. They reach 3.75:1 on herbal, 4.26 on floral and 4.35 on spice, below the 4.5:1 WCAG AA asks of small text. The bar has a full `aria-label`, but sighted readers see the labels. A fix changes what every bar looks like, in the app and in the widget's next release, so it's its own prompt.
- **The neutral colours** (paper, ink, green) are also defined in both `shell.css` and `family.css`. Prompt 2's stylesheet holds only the family colours; the neutrals could move there later.
- **The project instructions' colour table.** Its inks match no file and fail AA for citrus, so it's worth updating to the inks Prompt 2 settles on. That's your project reference to edit, not the repository.
- **`package.json`'s `"license": "ISC"`** is npm's default, and the repository has no licence file. Which licence applies, if any, is your call; Prompt 1 leaves the field as it is.
- **Deprecation warnings on Node 24.** If a test prints one (`b2b-catalog-test` uses `module.register`), Prompt 1 lists it in the record without fixing it.

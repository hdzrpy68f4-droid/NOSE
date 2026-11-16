# Open items

What is known and not yet done, moved here from PARSER-HANDOFF.md on 2026-11-14 (M7), unchanged: §13's and §14's Still open lists, then §14's Later. A closed item comes off this file in the same commit that closes it.

## §13, the archive and the app: still open

- **A scan made while the database is down is neither capped nor checked
  against `withheld`**: the database answers neither, so its PDF is written,
  for backfill (§13, "What gets kept"). `backfill-from-blobs.js` then refuses
  a withheld one and names it, and `remove-document.js` deletes it.
- **The cap bounds a day, not the total.** At 100 new documents a day, the
  worst a day can add is about 25.6 MB of text to the database (256KB each;
  the free plan's 500 MB would last about 19 such days) and 1.2 GB of PDFs to
  Blobs (12 MB each). It is one number in a migration; change it with a new
  one.
- **The privacy page dates the fourth change "October 2026"**, the month,
  because the deploy day was not known when it was committed; it went live on
  2026-10-03 (US Eastern). Its sitemap `lastmod` (2026-07-20) predates every
  change on the page, the three sentences of 2026-10-03 included.
- **`remove-document.js` has not run on the real archive** - nothing needed
  taking out on 2026-10-03. Its PDF delete is the `pdf-store.remove()` that
  `remove-copies.js` used for real on 2026-10-02; its transaction, the
  withheld rows and a rescan refused afterwards have run only on PGlite and a
  local PostgreSQL 16, so its first real removal is worth a `keep-rule.js`
  and an `archive-health.js` after it.

- **The one copy stored, #449, was removed on 2026-10-02** (above, "the
  cleanup"); the archive holds no copies. Probe 3 found
  no lab whose text changes between downloads (Kaycha, ACS and Modern Canna
  serve the same file each time), so after the fix the privacy page's "We do
  not count how many times a report is fetched" holds for every lab seen,
  apart from #449 and a PDF kept while the database was down. A lab found
  later whose text changes per download would be kept once per download -
  `duplicates.js` lists it under "same lab and lab ID, different texts".
- **The static preview is not in this repo**, and cannot be: `build.sh` fails
any `.html` with inline script. The guards check only what the build sees; a
preview kept elsewhere needs `node scripts/check-published.js <file>` and
`node scripts/check-trust.mjs <file>` run on it - it may still carry the old
promise that NOSE keeps nothing.
- **The static preview keeps its own copy of the maths** (it is not in this
  repo, §13 above). `match-test.js` cannot see it; a preview built after
  today should load `js/match-math.<hash>.js` rather than carry a copy. Its
  copy predates `shownScore()`, so until it is rebuilt that way it rounds.
- **A COA link card taken by a scan leaves its message behind.** Read a link,
leave its card open, then scan a code on Scan QR. The card moves to Scan QR with
the new report, and the COA link tab still says "<lab> read. Check the values
below, then add the jar." with nothing below it. Seen in Chromium, 2026-09-23.
The reverse cannot happen: opening Scan QR restarts the camera, which replaces
that tab's message. A fix would change what `fetchCoaReport()` says in the
panel it takes the card from, on both paths, so it waits for its own prompt.
- **The card's word joiner after the en dash** (above, "Water activity against
  ASTM D8197") was watched in Chromium only, not Safari or Firefox. UAX #14
  says how WJ and an en dash behave, but the page read gave its class
  descriptions, not the rule lines themselves (LB11, LB21): the fetch stopped
  before its section 6.
- **Method's sign-off is a UTC day** (above, "When the lab finished"): a
  report signed after 8 PM Eastern carries the next day as its `testedOn`.
  Nothing on the 8 fixtures does. Converting it would mean guessing the
  lab's zone from its own document, so it is read as printed.
- **`testedOn` has a row for five labs, each from fixtures.** A new lab, or
  a new layout of a known one, gets one only with a fixture and
  `test/date-probe.js` - until then its batches are dated by harvest or
  report day, if it prints one the parser reads, or listed as undated.
  TerpLife's finish day is in `report_on`, not `tested_on`, by choice: a
  question about when labs finished reads `coalesce(tested_on, report_on)`.
- **Method_DulceDeUva's layout stays undated.** It prints a completion date,
  but apart from its label, among unlabelled values; matching it would be
  fitting to one document (§6, "`unknown` is guarded").
- **The date row's note was watched in Chromium only**, at 1280 and 390 px.
  Its normal weight comes from the element's `style` property, which MDN
  says `style-src` does not block; Safari and Firefox have not been looked
  at.
- **The home page still offers "upload a report"** as a way to add a jar
(`index.html`, "Add a jar you liked"). The Upload tab now says that isn't
available yet.
- **How `novelty` was verified, 2026-09-23.** No npm here: the gates ran on
pdfjs-dist 5.7.284 standing in for unpdf (56/3, 56/0, clean, 4.124/0.944 on the
untouched branch first), PGlite's API over a throwaway Postgres 16 cluster, and
`build.sh` with the committed html5-qrcode served in place of the jsdelivr
download. Then in the Codespace on the real packages: ALL GATES GREEN, and the
real archive as recorded above.
- `pdf-store.read()` asks Blobs for `getWithMetadata`, which only a stand-in
has answered so far; the first `reparse.js --reextract --dry-run`, backfill or
export in the Codespace is its first real proof.
- The seed and the re-run tools run from the Codespace: this cloud workspace
cannot reach npm, Supabase or Netlify. Offline, `@netlify/blobs` is a stand-in
built from its published types (v10: `set` returns `{ modified }`, and
`onlyIfNew` answers a 412 with `modified: false` rather than throwing).
- The terms page's "Before launch" box still lists the operating entity's legal
name and address, a governing-law clause, an effective date, and a lawyer's
review.
- **Login emails show Supabase the clicker's IP address - said on the privacy
page since 2026-10-03, for Supabase's default templates** (above, "Three
privacy sentences"). Sign-up and password reset call Supabase's auth API from
the server (`netlify/lib/auth.js`, no forwarded address), but the emails link
to Supabase's own domain, so whoever clicks one reaches Supabase from their
own browser, and Supabase's auth logs record the address. If the accounts
share the archive's project, those logs sit in the same database - which is
why the privacy page says the IP address never reaches the *store*, not the
database. **Still to read in the dashboard**: the link in Authentication →
Emails → Templates (Confirm sign up, Reset password) - not found on
2026-10-03 - and Emails → SMTP Settings. If the links point anywhere but
Supabase's own site, the new paragraph changes. The account functions'
`SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are not described anywhere in this
file either.
- **No page finishes a password reset.** After a reset link, Supabase verifies
it and sends the browser to the Site URL (`https://nose-app.com`) with a
session in the address after `#` - Supabase's documented flow for a request
made without PKCE, as `auth-reset.js` makes it; not yet watched on the live
site. Nothing on NOSE reads it, asks for a new password, or calls Supabase to
set one - no function calls `/user`, read in the code on 2026-10-03 - so a
reset email cannot lead to a new password today. Routing the links through
nose-app.com (a landing page, and a server call that verifies the link's
`token_hash`) would fix this and the IP-address point together, and email
scanners that open links before people do are the known trap there. It needs
its own prompt.
- **Supabase's session is left in the address.** The same redirect, after a
confirmation or a reset link, puts an `access_token` and a `refresh_token`
after `#` on nose-app.com (the documented flow again; not yet watched). NOSE
never reads or clears them - the app's router reads `#` only to name a page -
so they would stay in that browser's history. Ending the redirect (the item
above) ends this too.
- **Custom SMTP is not set up (seen in the dashboard 2026-11-15), so account
  emails reach no one but the owner.** The accounts project says "Set up
  custom SMTP to edit templates". Needs an email service, its sender domain
  checked, and the privacy page naming it before it is switched on.
- **(Earlier note) Custom SMTP: not known whether it is on.** Supabase's docs (read
2026-10-03): without it, the built-in service delivers only to the project's
team members, 2 messages an hour, so real people would get no confirmation or
reset email. With it, that company receives every address it delivers to, and
the privacy page's "Nobody else" would have to name it; and if it tracks
clicks, the email links go through its own address first.
- **The stored address keeps a link's path.** Only what follows "?" (and "#")
is dropped, so a one-off link that carries a code in its path keeps it. "The
store holds nothing about the person who scanned" relies on that being rare:
a jar's QR code is printed for the batch, not the buyer.
- **The schema still describes itself as holding nothing that identifies a
person** - the header of `20260922180000_nose_archive.sql` and its `COMMENT ON
SCHEMA nose`. An applied migration is not edited; a later one can restate the
schema comment if wanted.
- **The word buttons were watched in Chromium only**, at 1280 and 390 px:
  their wrapping, the tick and the status line. Safari and Firefox have not
  been looked at, nor a screen reader's reading of the note.
- **The new guides' numbers are not under a gate** (§13, "Two guides from
  the research"). `match-test.js` checks the worked examples at the top of
  `learn/intensity-versus-character/` against the matcher; the cutoff
  section's 100 and shares on that page, and the 99 and 46 on
  `learn/what-a-lab-report-cant-smell/`, were computed through
  `scripts/lib/match.js` once, on 2026-10-14. Adding them to `match-test.js`
  needs its own prompt.
- **The card's guide link opens a new tab without saying so.** WAI's
  advisory technique G201 ("Giving users advanced warning when opening a new
  window", https://www.w3.org/WAI/WCAG22/Techniques/general/G201, read
  2026-10-14) suggests a warning; doing
  it would add words to the row (or an `aria-label` a screen reader reads),
  and R8 kept the row's text exactly as it was. The link was watched in
  Chromium only, at 1280 and 390 px.
- **`/app` and `/` keep their sitemap `lastmod`** (2026-07-20) although the
  bundle they load has changed again (R3, R4, R7 and R8 all left it).
- **The bundle in strict mode was run in Chromium only** (above, "Strict
  mode in the app bundle"), and its camera path only on Playwright's fake
  camera. Strict mode is part of the language, but Safari and Firefox have
  not been looked at.
- **The `/aromas/` cards' anchor-terpene line is grey, not its family's
  ink** (above, "One home for the family colours"). `.ink-<family>` sets the
  colour, but `.card p` in `family.css` is more specific, so "Limonene" and
  the rest show `--muted`. Letting the ink win changes how six lines look, so
  it needs its own prompt.
- **Three translucent tints of the fills do not read the tokens**:
  `account.css`'s error message (spice at .1) and danger zone border (spice
  at .4), and `shell.css`'s `.hero:before` glow (all six at .10 to .16), each written as
  `rgba()`. Pointing them at the tokens means `color-mix()`, and the gate
  does not count a tint as the colour.
- **The Codespace's Netlify token expires about 2027-02-12** (made
  2026-11-14, 90 days). `archive-health` and `reparse --reextract` then fail
  with a 401: make a new personal access token in Netlify (User settings,
  Applications) and update the repository's Codespaces secret
  `NETLIFY_AUTH_TOKEN`, then restart the Codespace.
- **The weekly live check stops after 60 days without repository activity.**
  GitHub switches off a scheduled workflow in a public repository then, and
  emails the owner first; "Enable workflow" under Actions turns it back on.
  Not read from GitHub's page in this session: confirm the wording there.
- **A push that changes `.github/workflows/` may stop promote** (above,
  "Every gate on every push"). GitHub's token takes no `workflows`
  permission - the workflow syntax page lists none - and two reports show
  GitHub refusing a push by an app's token that brings in a change to a
  workflow file: "refusing to allow a GitHub App to create or update workflow
  `.github/workflows/release.yml` without `workflows` permission" (Panther's
  help centre, "When trying to sync panther-analysis, I see the Github error
  'Failed to push some refs'"), and a MongoDB ticket of 2026-09-03, PYTHON-6076,
  fixed by giving its token that permission (both read 2026-10-15). GitHub's
  own pages do not say which pushes it checks. Making `live` at `4a6e081`,
  the commit that adds the workflow, was accepted on 2026-10-16 (above,
  "Live"); moving `live` forward across a later change to it has not been
  tried. If promote fails that way, the
  site stays where it was; after a green run, move `live` by hand from the
  Codespace - `git fetch origin`, then `git push origin origin/main:live` -
  a fast-forward the ruleset allows. A token that can do it is a secret,
  which this workflow has none of: its own prompt.
- **That Netlify hears a push made by GitHub's token is seen, not
  documented.** GitHub's pages say such a push starts no workflow run, and
  nothing about other apps; on 2026-10-16 Netlify deployed `live` by itself
  after promote moved it (above, "Live ... step 5"). If a later green run
  moves `live` and no deploy follows, that has changed: Deploys → Trigger
  deploy → Deploy project builds `live` by hand meanwhile.
- **The actions are pinned to commits, and Dependabot proposes newer ones**
  since 2026-11-14 (`.github/dependabot.yml`: weekly, npm and
  github-actions). A pull request of its that moves a pin changes the
  workflow file, so the promote item above applies to it. Whether Dependabot
  alerts are switched on is a repository setting nobody has confirmed:
  Settings, then Code security.
- **The archive's re-run tools keep their own text floor**: `scripts/lib/rerun.js`
  has `MIN_TEXT = 200`, its comment saying `coa.js` refuses below it, and
  `reparse.js`, `backfill-from-blobs.js` and `seed-from-fixtures.js` read it
  (above, "One way to read a report"). The same number as
  `lib/read-report.js`'s, not the same constant; M1 named only `coa.js` and
  the coverage report, so it waits for its own prompt.
- **`lib/fetch-report.js`'s header still names its callers as `coa.js` and
  `scripts/b2b-coverage.js`**; since 2026-10-16 `fetchPdf` is called from
  `lib/read-report.js` alone, `validateUrl` from it and from the two
  dispensary scripts, and the resolver from `test/resolver-test.js`,
  `test/duplicates-test.js` and `scripts/download-twice.js`. M1 kept that
  file unchanged, comment and all; M2 made its `coa.js` line true (through
  read-report, no `_resolvePdfFromPage`) and left the list for its own
  prompt.
- **The fixed 500 has not been seen live.** Offline, two forced throws give
  it (above, "coa.js in the current format"); live, nothing is known to
  throw, and making one would mean shipping a fault. The `null` curl shows
  the 400 live.
- **Two time limits are left, one per library folder.** `lib/archive.js`'s
  `bounded(work, ms, label)` is CommonJS and puts its label in the message
  the archive logs ("pdf write timed out after ...ms"); `netlify/lib/http.js`'s
  `within(promise, ms)` is an ES module, and its message reaches no reply or
  log. M3 named only the two `within()` copies; one helper for both needs the
  folders merged, which is its own prompt (above, "One set of server
  helpers").
- **Three body readers are not `readJsonBody`, on purpose.** `coa.js` reads
  an empty body as `{}` and answers with its own sentence; `palate-sync.js`
  allows 262144 characters and answers 413 with a message; `b2b-catalog.js`
  counts bytes while reading and never holds more than 4 MB. Each has its own
  replies, so none was moved; the one-copy check in
  `test/archive-wiring-test.js` looks for a second `function readJsonBody`.
- **The 60s Netlify gives a synchronous function is not used.** NOSE's own
  10s budget, the chain's 8s and the archive's 2s stay as they were; using
  more is its own decision, and the documented limit is now the one that
  applies to `coa.js` (above, "Comments that match the code").

---

- **`b2b-vote` has no edge rate limit** (since 2026-11-15, "Five rate limits on
  Netlify Pro"): a pinned release calls it at `/.netlify/functions/b2b-vote`
  and never changes, and a rule needs a path of its own; its per-store daily
  cap stays its guard (security audit item 8). A flood from many addresses
  passes any per-address rule, and a shared address can reach a limit.

- **A public name that resolves to a private address still passes the
  fetcher** (security audit item 6, the part left on 2026-11-14). An address
  written as the host is checked; closing this needs the connection pinned to
  an address checked after DNS lookup.
- **Throttle records are an unkeyed SHA-256 of the address** (security audit
  item 14, the part left): keying it (HMAC) needs a secret in Netlify's
  Production context.

## §14, dispensary integration: still open

- **The pilot agreement (B2.1) waits for NOSE's registration (B1).** Facts
  given 2026-11-15: no fee for the pilot; Chris Carreon signs for NOSE. B1
  (the Terms page's legal name, entity, state, address, governing law) waits
  until the business is registered, expected within a month. The draft goes
  to counsel and never into this public repository.

- `scripts/download-twice.js` keeps its own looser fetch loop. Moving it onto
  `lib/fetch-report.js` would change what it reports (redirects re-checked,
  8 s for a link it waits 30 s for today), so it waits for its own prompt.
- The guard checks host names, not the addresses they resolve to, as it
  always has in coa.js: a public name pointing at a private address passes
  `isBlockedHost`. In the Codespace the script runs by hand, on one
  dispensary's file.
- A lab NOSE does not know reads as refused or "(lab not recognised)". The
  by-lab table is the list of labs a fixture would help most (§10). A
  coverage figure is today's parser's, and moves when the parser does.
- A batch sold as several products is listed once (above). Prompt 2 kept the
  key (store_id, batch_id) as asked. If a pilot shows dispensaries need one
  batch under several product IDs, the key changes in a new migration -
  cheapest while the tables hold no data, before Prompt 8 switches anything
  on.
- **Not pushed until the walk-through above runs**: until `db push`,
  `probe-db.js` fails "the b2b migration is pushed".
- No command changes a store's window or guardrail after `create`, or removes
  an origin. A later prompt adds one if the pilot needs it.
- `rotate-keys --public` breaks the store's page until the page carries the
  new key: there is no overlap, because the partial index allows one working
  key of each kind. A change of public key without a gap needs its own
  prompt.
- `batch_reads` keeps no parser version, so a stored reading does not say
  which parser read it; `--reread` reads everything again. The reading-source
  migration (2026-10-08) added the link a reading came from, not the parser;
  instead the reader refuses to write while the parser's files have
  uncommitted changes. A column for the version is a new migration.
- `coa_url` keeps its query, so a presigned link in a catalog (`X-Amz-*`,
  `Signature`, `Expires`) would be kept with its temporary credential to the
  store's own storage. Prompt 3 neither refuses nor flags one: it waits for
  its own prompt.
- **A row refused on upload is kept nowhere**: the reply is its only record,
  and `--store` says so rather than listing it.
- **Batch IDs are matched exactly from one upload to the next**, while a
  repeat within one file is found ignoring letter case. A `batch_id` whose
  case changes between two exports becomes a new batch, and the old one is
  marked out of stock (kept, with its reading).
- **`list_position` is the row in the latest file**: removing a line moves
  every row after it up one. Only the order is used (Prompt 5's ties).
- **A link that never answers is fetched on every run**, one second after the
  last request, until the store changes it; `--limit` bounds a run.
- The upload takes 4 MB, under Netlify's buffered limit; the coverage script
  reads files of up to 20 MB from disk. A catalog between the two can be
  reported on but not uploaded.
- **The reading-source migration is not pushed until its walk-through
  runs** (above): until then `probe-db.js` fails "the reading-source
  migration is pushed", and the upload and the reader would fail on the
  missing columns against production - where nothing runs before Prompt 8.
- The secret key reaches the dispensary however the owner hands it over:
  NOSE prints it once and has no channel of its own for it.
- `NOSE_B2B_DB_URL` and `B2B_ENABLED=1` are in Netlify's Production context
  since 2026-10-09 (above, "Privacy page, then switch on", step 4);
  `NOSE_B2B_DB_URL` is a Codespaces secret as well.
- **Settled 2026-10-09: the vote goes by `fetch`, not `sendBeacon`**
  (above, "Pinned releases"). A beacon from a page served with
  `Referrer-Policy: no-referrer` or `same-origin` carries `Origin: null`
  where a browser follows the standard, which the origin rule refuses; it
  carries the site's cookies (credentials `include`); and from an order page
  served with `unsafe-url` or `no-referrer-when-downgrade` it carried the
  page's whole address to NOSE. The vote is now `fetch(..., { method: 'POST',
  mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
  keepalive: true, body })`: a string body, so still a simple request with no
  preflight, the store's origin always sent, no cookie, no referrer.
- **The feed is cached up to 60 seconds**, by browsers and by Netlify, apart
  for each origin: a catalog upload, a revoked key or a deleted store shows
  within the minute, a deploy at once. Nothing purges it by hand.
- **The cap is counted, not locked** - eight listings a vote - so votes
  arriving together can pass it by their number. Which store reached it is not
  logged ("Logs", above). `B2B_VOTE_DAILY_CAP`, like every variable, changes
  only with a new deploy.
- **Netlify's request logs record the address and time of every feed and vote
  request**, and the feed's address names the store's public key. NOSE copies
  nothing from them. A vote's key ends in random bytes, so the store's listing
  gives no order to set against those logs; Blobs may keep its own write
  times, which nothing of ours reads (§13, "The PDF half"). The privacy page
  says all of it since 2026-10-09 (`#dispensaries`), and two things more: on
  a day with very few votes a vote can still be matched with its request, and
  a feed request - made only after a yes - shows that someone at that address
  said yes on that store's site (above, "Privacy page, then switch on").
- **A batch in the feed carries its catalog `name` and `brand`**, and the
  widget shows them as the store wrote them; Prompt 5's ranking reads
  neither. A product voted on is named by its `product_id` alone. A store's
  own product names can hold words NOSE's strings never would - a "Cured
  Resin" - and `b2b-strings-test` reads NOSE's words,
  not a catalog's: the store's names are the store's to clear. The compliance
  kit lists them apart, as they render, since 2026-10-13.
- **Suggestions across forms stay off** (Prompt 6, "The widget"): the rail's
  palate is made of the purchases in its own category, looked up in the feed,
  and its basis line names the category. Prompt 5's `palateFrom()` takes no
  category, so a rail across forms ("vapes for a flower palate", labelled, as
  the plan keeps it for after the pilot) is the widget's choice of purchases
  and one more string, and needs its own prompt.
- **Purchase days are UTC days**, as `docs/B2B-INTEGRATION.md` tells a
  store's developer since 2026-10-09. A page that hands local days anyway
  moves a purchase near midnight by one day - one day at the window's edge.
  `today` comes from the device's clock when a call is handed none, and a
  clock that is wrong moves the window by its error: the feed carries no date.
- **A guardrail half with figures missing keeps batches out.** A store that
  sets CBD's half while leaving `cbd_percent` empty on some batches sees those
  batches left out of every list, and a shopper whose basis has no CBD figure
  gets an empty list. That is the fail-closed reading of "within
  this many points of the median"; the coverage report does not yet count
  missing THC or CBD figures, which would show a store the cost before it sets
  one.
- **In Node the engine needs this repo's layout**: `js/b2b-rank.<hash>.js` takes
  its maths through `../scripts/lib/match.js`. Decided with Prompt 7
  (2026-10-09): a release is a browser file - in Node its maths file takes
  `module.exports` and the engine then asks for `../scripts/lib/match.js` - so
  campaign palates on a dispensary's server ("Later") carry this repo's files,
  at a pinned commit, until their own prompt says otherwise.
- **The load-order rules compare line numbers.** For js/nose, js/b2b-rank,
  and since Prompt 6 js/aroma-bar and js/b2b-widget, two scripts on one line
  fail the build, and an `async` script would pass it and still run out of
  order. No page does either today.
- **The no-panel sentence is not the prompt's** (s14, "The widget"): "No
  terpene panel available for this batch", because "No terpene panel on this
  batch's report" would be untrue of a batch whose report NOSE has not read
  or could not fetch. The owner decides; one line in `js/b2b-strings` changes
  it.
- **The Florida variant is NOSE's reading of 64ER25-6**, not counsel's.
  Whether the rule reaches a vendor's widget, and whether words like
  "palate" or a store's flavor-named products count, is for the
  Florida cannabis-regulatory attorney the plan books. The compliance kit
  renders the variant for the Department since 2026-10-13; counsel's review
  is still to come.
- **Two attributes and one event more than the prompt named**: `strings`
  and `feed`, and `nose:palate-restored`, documented with the rest in
  `docs/B2B-INTEGRATION.md` since 2026-10-09.
- **The widget keeps two lists in the shopper's browser**, in storage on the
  store's own origin: the batches taken out of the palate
  (`nose-matches-removed`) and the products voted on (`nose-matches-voted`).
  Neither reaches NOSE; the privacy page says they exist, and that clearing the
  site's data in the browser clears them (since 2026-10-09). The vote is once per product per
  browser, so one shopper on two devices can vote twice.
- **The widget names its stylesheet's built file**, written in by `build.sh`,
  and reads NOSE's origin from `document.currentScript`. A pinned release
  carries its own stylesheet and names it, with its hash, and stays a
  classic script (above, "Pinned releases"); the integration guide says not
  to load it as a module.
- **The demo page goes live with the next deploy**, at `/b2b/demo/`: static,
  noindex, linked only from /dispensaries/ (its pitch view, since 2026-11-15), its feed a file. Its votes reach the
  production b2b-vote, which answers 404 until Prompt 8 and then refuses the
  made-up key as no store's. Its test store is rewritten by
  `node scripts/b2b-demo-feed.js` after a parser change moves a fixture's
  reading - the widget test fails until it is.
- **At most 12 cards** on the rail and the sold-out panel, a constant in the
  widget; the rest of the menu is the store's page. The basis counts every
  purchase it does not use and names only those of the category with no
  panel.
- **`wip/nose-farnesene-wip.js` still holds an old copy of the bar**, as it
  does of the maths: an unfinished draft of the whole old bundle, loaded by
  nothing. The widget test lists it, as `match-test` does.
- **The feed and the vote are not versioned.** A release pins the widget's
  code, not what it reads: a change to `b2b-feed`'s fields or to what
  `b2b-vote` accepts changes every pinned page. `b2b-endpoints-test` pins
  both shapes; a change a released widget would not understand needs its own
  prompt - fields added, never renamed or removed, or a new endpoint.
- **Nothing withdraws a release.** Deleting its two blobs by hand would make
  every page pinning it show nothing - the fail-closed outcome - and needs
  its own prompt and a note in the record. `delete-store` deletes a store's
  data, not code it loaded.
- **Each deploy clears the CDN's copy of every release**, after which the
  function reads Blobs once per edge; browsers keep theirs a year.
- **WebKit and Firefox run in the gates; a real iPhone is still the pilot
  store's check** (since 2026-11-14, "WebKit and Firefox in the tests"). The
  gates drive Playwright's Linux WebKit, Safari's engine but not iOS Safari,
  and leave it out on Windows, whose build behaves unlike Safari. The
  compliance kit still draws in Chromium alone, as a record of the screens.
- **A release request is in Netlify's request logs**, with its address and
  time, like the feed's. Netlify's documented log fields hold no `Origin`
  ([Log Drains](https://docs.netlify.com/monitor-sites/log-drains)), and a
  release's address names no store; its referrer is the store's page only
  where a store's tag leaves out `referrerpolicy="no-referrer"`, which the
  guide asks for. The privacy page says what the logs hold.
- **The privacy page and the B2B code move together.** No test reads the
  page's dispensary section (Prompt 8 adds no gate); the table in "Privacy
  page, then switch on" says where each of its claims lives. A change to what
  B2B keeps or sends - a field, a store, the default window, the vote cap
  (`B2B_VOTE_DAILY_CAP` is unset, and the page says 100) - changes that
  section in the same commit.
- **Backups.** Supabase's free plan keeps none; a paid plan's daily backups
  would keep a deleted dispensary's rows for days afterwards (7 on Pro), and a
  deleted account's or removed report's alike. The privacy page says nothing
  about backups yet, and has to before the plan changes - the move the plan
  asks for before a licensee depends on NOSE.
- **The privacy page does not describe the end-of-pilot export yet.** Its
  dispensary section lists what a dispensary sends NOSE - the catalog, and a
  catalog read once before signing up - and the integration guide says
  everything NOSE receives is set out there. A pilot export is one more
  thing a dispensary sends: one row per assigned shopper, a group label and
  counts, no identity. Before NOSE receives a first one, the section needs a
  paragraph - what the export holds, that it is read once in the maintenance
  workspace and deleted there once the report is published - and the
  sentence "Nor are we told ... which group of a test the dispensary has put
  them in" needs reconciling: an export tells NOSE the group of each row,
  never who the row is. Its own prompt; the plan template's checklist names
  it.
- **Settled 2026-10-13: the count decides** (above, "Pilot plan and
  report"), inhalable orders per assigned shopper, as the plan wrote it.
- **The plan's spread is a past period's.** If the pilot's counts spread
  wider - a rise in orders usually widens them - the test is less likely
  than planned to find the lift. The report says when that happened; it
  never changes the result. A store with few heavy buyers can set a larger
  `--sd` than its past figure, for a margin.
- **Heavy buyers are not capped.** One shopper with very many orders widens
  the interval; capping each count at a ceiling written into the plan would
  narrow it, and needs its own prompt - the export, the report and the
  template's past figures would all change together.
- **A matched purchase is the store's to count.** NOSE never sees which
  card a shopper opened. The template's marker on `product_url` is one way;
  whatever the store uses is written into the plan before the first day.
- **Pre-registration rests on git's committer date**, which a committer can
  set. Pushing the plan to GitHub before the first day is the record others
  can see; the report checks the date it is given.
- **Votes cast after the last day** - on purchases made in the pilot - are
  not counted: the band check reads the pilot's days, first to last.
- **The split check's threshold, p below 0.001, is fixed in the report** and
  stated in the template; changing it is a code change in its own commit,
  never a setting in a plan.
- **Newcombe's four values were read from a reproduction** of his Table II,
  the paper being paywalled; worth setting beside the paper itself when
  someone has it.
- **The privacy page says flavor where the Florida variant says aroma**
  ("NOSE's flavor match", "was its flavor close?"), found by the kit. It is
  NOSE's page, not a dispensary's, and data.md gives it as published.
  Whether a Florida submission wants other words there is for counsel; a
  change is its own prompt, and changes data.md with it.
- **A kit is for one release and one day.** It names the release, its
  commit and both hashes, and the day the store's feed was read; a new
  release needs a new kit - in Florida perhaps a new approval - and so may a
  catalog that changes what the screens show. Nothing ties a kit to an
  approval but the store's own record.
- **A kit's PNGs draw with the machine's fonts.** The widget takes its font
  from the store's page; the stand-in names the system sans-serif, which is
  whatever the machine has. Two machines draw the same words and layout in
  different type; strings.md is the record of the words.
- **Four Florida strings are not drawn with the test store** -
  `soldOutNoPanel`, `soldOutNone`, `thcMissing`, `notUsedOthersOne` - and
  strings.md gives each exactly as written, with when it shows. A store's
  feed that reaches one draws it.
- **The kit makes up a store's shopper by a rule** (above). A store whose
  feed has no batch out of stock with a panel gets no sold-out panel, and one
  with no in-stock batch lacking a panel among a rail's first twelve gets no
  no-panel screen; each is listed with why. A store wanting particular
  screens would need a purchase list of its own design, which no prompt has
  asked for.
- **A store's three days are carried, not shown** (above, "The day the lab
  finished, in a store's readings"). The feed has `harvest_on`, `tested_on`
  and `report_on` on every batch with a current reading; the widget, the
  ranking engine and the demo page read none of them, and nothing scores
  them (§4). Showing one is a screen change - new words in `js/b2b-strings`,
  a new release, and in Florida a new compliance kit - and needs its own
  prompt.
- **The widget learns that the basis is open from its `toggle` event**
  (`_basisOpen`), which the browser fires a little after the click - about
  11 ms, around the next frame, in Chromium on 2026-10-16 (§13, "Every gate
  on every push"). A remove or put-back pressed before then draws the basis
  closed, so its button cannot have the keyboard focus. That is faster than
  any shopper; `b2b-widget-test` now waits for the event before tabbing on.
  Reading the open state from the page when drawing again would end it, but
  that changes `js/b2b-widget` - a new file, and a new release for a pinned
  page - so it needs its own prompt.

## §14: later

Wanted work, not yet built.

- Campaign palates: an email or text to opted-in shoppers when a new batch
  matches their palate. Wanted as an option after the pilot. Preferred build:
  the dispensary's server runs the ranking engine on purchase history it
  already holds, so NOSE never receives it.

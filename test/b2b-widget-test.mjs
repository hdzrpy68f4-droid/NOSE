#!/usr/bin/env node
/* NOSE - <nose-matches>, the dispensary widget, in a real browser.
 *
 *   node test/b2b-widget-test.mjs        expect: b2b-widget clean
 *
 * After the build, like input-paths: it reads the fingerprinted files as they
 * deploy. Two local origins in headless Chromium: NOSE, the built site
 * served with _headers, its two B2B functions stood in for - a feed served
 * from the demo's test store (scripts/b2b-demo-feed.js) with a few batches
 * more, and a vote that records what it is sent - and a store, whose page
 * loads the widget from NOSE under the prompt's CSP, exactly:
 *   script-src 'self' <NOSE>; style-src 'self' <NOSE>; connect-src <NOSE>
 * Every request either origin receives is recorded, and every one the
 * browser makes is watched. What it pins down (PARSER-HANDOFF s14, "The
 * widget"):
 *   - only two kinds of request leave the page from the widget: the feed (the
 *     store's public key and nothing else - no cookie, no referrer) and the
 *     vote (six fields, text/plain, by fetch in cors mode: no preflight, no
 *     cookie, no referrer). Besides them only the page's own script tags and
 *     the widget's stylesheet reach NOSE, the stylesheet with no referrer. No
 *     request anywhere carries a purchased batch ID, a purchase day or the
 *     purchases attribute; a secret key is never sent; nothing goes to any
 *     other origin
 *   - a pinned release (scripts/b2b-release.js, built from these files): one
 *     tag with its integrity hash, crossorigin and no referrer, under the
 *     integration guide's own CSP lines, read out of docs/B2B-INTEGRATION.md
 *     - the same rail and vote as the five files, its stylesheet checked by
 *     the hash the release names, and no request carrying the page's address
 *     though the page's policy is unsafe-url. An altered stylesheet is
 *     refused and the widget shows unstyled; an altered script, or the tag
 *     without crossorigin, runs nothing and asks for nothing
 *   - consent: unknown shows one button and one sentence and never reads the
 *     purchases (getAttribute is watched); its button fires nose:consent and
 *     the page's answer brings the rail. Denied and the control group show
 *     nothing, load nothing and send nothing
 *   - each mode against the stand-in feed: the rail, the sold-out panel and
 *     the vote equal js/b2b-rank's own answers for the same feed and
 *     purchases - order, label, number and band; unread and refused batches
 *     last, saying "No terpene panel available for this batch", with no
 *     number and no bar; the store's guardrail applied; Florida's words
 *   - every bar is js/aroma-bar's renderBar() for that batch, byte for byte,
 *     role="img" with the profile in its aria-label; one copy of the bar in
 *     the repo, moved verbatim out of js/nose
 *   - the basis list, removing and putting back, kept in the browser and told
 *     to the page; the vote once per product in a browser
 *   - keyboard: every link and button reachable by Tab and working by key
 *   - no CSP violation from the widget, under a CSP shown to be in force
 *   - every word shown comes from js/b2b-strings, matchBand(), the bar or the
 *     store's catalog, and none is about effects
 *   - the demo page: noindex, linked from nowhere, its test store the
 *     generator's, working under the site's own CSP
 *   - build.sh's load-order rule for the shared files, its own lines, on
 *     throwaway pages, and the widget carrying its stylesheet's built name
 *
 * Needs Playwright with its Chromium (as input-paths does) and
 * test/fixtures/extracted (node test/extract-dump.js).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) {
    process.stderr.write('b2b-widget: stopped before the last check - NOT clean\n');
    process.exitCode = 1;
  }
});

let failures = 0;
function check(name, ok, detail) {
  if (ok) { console.log(`ok    ${name}`); return; }
  failures++;
  console.log(`FAIL  ${name}${detail ? `\n      ${String(detail).slice(0, 900)}` : ''}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const differs = (a, b) => `expected ${JSON.stringify(b).slice(0, 420)}\n      actual   ${JSON.stringify(a).slice(0, 420)}`;

function loadPlaywright() {
  for (const id of ['playwright', '@playwright/test']) {
    try { return require(id); } catch {}
  }
  try {
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return require(path.join(root, 'playwright'));
  } catch {}
  return null;
}
const playwright = loadPlaywright();
if (!playwright) {
  console.error('FAIL: Playwright is not installed - run: npm install --no-save playwright && npx playwright install --with-deps chromium');
  process.exit(1);
}

/* --- the built files ------------------------------------------------------ */

function built(dir, stem, ext) {
  const all = fs.readdirSync(path.join(ROOT, dir)).filter(f => new RegExp(`^${stem}(\\.[0-9a-f]{8})?\\.${ext}$`).test(f));
  const hashed = all.filter(f => /\.[0-9a-f]{8}\./.test(f));
  if (all.length !== 1 || hashed.length !== 1) {
    console.error(`FAIL: expected one built ${dir}/${stem}.<hash>.${ext}, found ${all.length ? all.join(', ') : 'none'} - run: bash build.sh`);
    process.exit(1);
  }
  return hashed[0];
}
const F = {
  math: built('js', 'match-math', 'js'), bar: built('js', 'aroma-bar', 'js'), rank: built('js', 'b2b-rank', 'js'),
  strings: built('js', 'b2b-strings', 'js'), widget: built('js', 'b2b-widget', 'js'), css: built('css', 'b2b-widget', 'css'),
  nose: built('js', 'nose', 'js')
};
const SRC = Object.fromEntries(Object.entries(F).map(([k, f]) => [k, fs.readFileSync(path.join(ROOT, k === 'css' ? 'css' : 'js', f), 'utf8')]));
const S = require(path.join(ROOT, 'js', F.strings));
const R = require(path.join(ROOT, 'js', F.rank));
const M = require(path.join(ROOT, 'scripts/lib/match.js')).load();
const { EFFECT, effectWords } = require(path.join(ROOT, 'test/b2b-strings-test.js'));
const demoFeed = require(path.join(ROOT, 'scripts/b2b-demo-feed.js'));
/* What a person reads in a source file: its comments and its quoted text -
   the API's own names (a button's focus(), CSS's :focus-visible) aside. */
const prose = src => [...src.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map(m => m[0]).join('\n');
const { FEED_FIELDS } = require(path.join(ROOT, 'netlify/functions/lib/b2b-store.js'));
const rel = require(path.join(ROOT, 'scripts/b2b-release.js'));
const releases = require(path.join(ROOT, 'netlify/functions/lib/b2b-releases.js'));

/* --- a pinned release, as scripts/b2b-release.js builds it from these files --- */

/* Release 1 as built; 2 with one byte added to its stylesheet as served; 3
   with one byte of its script changed as served. The store's page names each
   one's true hash, as a page names a release's. */
const RELEASE = rel.build({ version: 1, source: rel.treeSource(ROOT) });
const ALTERED_CSS = rel.build({ version: 2, source: rel.treeSource(ROOT) });
const ALTERED_JS = rel.build({ version: 3, source: rel.treeSource(ROOT) });
const SERVED = {
  '1/nose-matches.js': RELEASE.js, '1/nose-matches.css': RELEASE.css,
  '2/nose-matches.js': ALTERED_CSS.js, '2/nose-matches.css': Buffer.concat([ALTERED_CSS.css, Buffer.from(' ')]),
  '3/nose-matches.js': Buffer.from(ALTERED_JS.js.toString('utf8').replace('Aroma and flavour only.', 'Aroma and flavour ONLY.')),
  '3/nose-matches.css': ALTERED_JS.css
};
const PINNED = { 1: RELEASE.sri.js, 2: ALTERED_CSS.sri.js, 3: ALTERED_JS.sri.js };
check('the altered releases differ from what their pages pin by the one change each, and release 1 is served as built',
  releases.sri(SERVED['2/nose-matches.css']) !== ALTERED_CSS.sri.css && releases.sri(SERVED['3/nose-matches.js']) !== PINNED[3]
    && SERVED['3/nose-matches.js'].length === ALTERED_JS.js.length && releases.sri(SERVED['1/nose-matches.js']) === PINNED[1]);

/* The CSP lines docs/B2B-INTEGRATION.md tells a store to add, read out of the
   guide itself, so the policy tested is the one it gives - with the store's
   own 'self' beside them, as a store's policy has it. */
const GUIDE = fs.readFileSync(path.join(ROOT, 'docs/B2B-INTEGRATION.md'), 'utf8');
const GUIDE_CSP_LINES = [...GUIDE.matchAll(/^(script-src|style-src|connect-src) +(.+)$/gm)].map(m => [m[1], m[2].trim().split(/ +/)]);

/* --- the stand-in feeds ---------------------------------------------------- */

const hex = n => crypto.randomBytes(n).toString('hex');
const KEY = `npk_${hex(32)}`;          // the test store's public key
const KEY_GUARD = `npk_${hex(32)}`;    // the same store with its guardrail set
const SECRET = `nsk_${hex(32)}`;       // a secret key, wrongly put in a page

const committed = fs.readFileSync(demoFeed.OUT, 'utf8');
check('the demo\'s test store, b2b/demo/test-store.json, is what scripts/b2b-demo-feed.js writes from the fixtures',
  committed === demoFeed.build());
const DEMO = JSON.parse(committed);
const extra = (fields) => Object.fromEntries(FEED_FIELDS.map(f => [f, fields[f] === undefined ? null : fields[f]]));
const FEED = {
  store: { ...DEMO.store },
  batches: [...DEMO.batches,
    extra({ batch_id: 'T-PRE-NULL', product_id: 'T-150', list_position: 40, category: 'pre-roll', route: 'smoking',
            name: 'Unread Pre-Roll', in_stock: true, usable: null }),
    extra({ batch_id: 'T-PRE-REF', product_id: 'T-151', list_position: 41, category: 'pre-roll', route: 'smoking',
            name: 'Refused Pre-Roll', brand: 'Test Brand E', product_url: 'javascript:alert(1)', in_stock: true,
            thc_percent: 17.5, cbd_percent: 0.4, lab: 'TerpLife Labs', usable: false })]
};
const FEED_GUARD = { ...FEED, store: { ...FEED.store, guardrail_thc_points: 2 } };
const FEEDS = { [KEY]: FEED, [KEY_GUARD]: FEED_GUARD };

/* Purchases, made up, dated back from today (UTC) so they stay inside the
   store's twelve-month window: the usual three times, now sold out; two more
   flower; a refused flower report and an unread one; a vape; a batch the
   store never listed; one from before the window; two pre-rolls. */
const day = back => new Date(Date.now() - back * 86400000).toISOString().slice(0, 10);
const PURCHASES = [['DB-1106', 11], ['DB-1106', 40], ['DB-1106', 75], ['DB-1115', 117], ['DB-1103', 152], ['DB-1119', 173],
  ['DB-1130', 215], ['DB-1118', 236], ['DB-9999', 271], ['DB-1112', 432], ['DB-1120', 20], ['T-PRE-REF', 30]]
  .map(([batchId, back]) => ({ batchId, day: day(back) }));
const PURCHASES_JSON = JSON.stringify(PURCHASES);
const NEEDLES = [...new Set([...PURCHASES.map(p => p.batchId), ...PURCHASES.map(p => p.day), PURCHASES_JSON])];
const ROUTES = ['smoking', 'inhalation'];

/* --- what js/b2b-rank says, for the same feed and purchases ----------------- */

const fill = (t, v) => t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
function split(feed, purchases, category) {
  const index = new Map();
  for (const b of feed.batches) if (!index.has(b.batch_id)) index.set(b.batch_id, b);
  const mine = [], others = [];
  for (const p of purchases) { const b = index.get(p.batchId); (b && b.category === category ? mine : others).push(p); }
  return { mine, others };
}
function expectRail(feed, purchases, removed, category, routes = ROUTES) {
  const { mine, others } = split(feed, purchases, category);
  const palate = R.palateFrom(feed, mine, removed);
  return { palate, others, ranked: R.rank(feed, palate, { category, routes }).slice(0, 12) };
}
const httpsOnly = u => { try { return new URL(u).protocol === 'https:' ? new URL(u).href : null; } catch { return null; } };
const expectCard = (V, e) => ({
  name: e.batch.name, href: httpsOnly(e.batch.product_url), brand: e.batch.brand || null,
  match: e.unscored ? null : fill(V.matchLine, { label: e.label, shown: e.shown }),
  sr: e.unscored ? null : fill(V.matchAria, { label: e.label, shown: e.shown }),
  band: e.unscored ? null : e.band, nopanel: e.unscored ? V.noPanel : null,
  facts: [typeof e.batch.thc_percent === 'number' ? fill(V.thc, { value: e.batch.thc_percent }) : V.thcMissing,
          typeof e.batch.cbd_percent === 'number' ? fill(V.cbd, { value: e.batch.cbd_percent }) : V.cbdMissing]
});
const monthOf = (V, d) => `${V.months[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
function expectSummary(V, palate, category) {
  const used = palate.basis.used;
  if (!used.length) return V.basisNone;
  return fill(used.length === 1 ? V.basisOne : V.basisMany,
    { n: used.length, category: V.categories[category], month: monthOf(V, used.map(u => u.days[0]).sort()[0]) });
}

/* --- the two origins -------------------------------------------------------- */

function siteHeaders() {
  const out = {};
  let all = false;
  for (const line of fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').split('\n')) {
    if (/^\S/.test(line)) { all = line.trim() === '/*'; continue; }
    const m = /^\s+([^:\s][^:]*):\s*(.*)$/.exec(line);
    if (all && m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}
const HEADERS = siteHeaders();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
const SOURCE_ONLY = /^\/(netlify|node_modules|docs|test|scripts|supabase|wip)\//;
const FEED_PATH = '/.netlify/functions/b2b-feed';
const VOTE_PATH = '/.netlify/functions/b2b-vote';
const RELEASE_HEADERS = file => releases.headers(file);

const received = [];            // every request either origin receives
let STORE = null, NOSE = null;
function listen(handler) {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const r = { origin: handler.name, method: req.method, url: req.url, headers: req.headers, body };
      received.push(r);
      handler(req, res, r);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const noseServer = await listen(function nose(req, res, r) {
  const u = new URL(req.url, 'http://x');
  const origin = req.headers.origin;
  if (u.pathname === FEED_PATH) {
    const params = [...u.searchParams];
    const feed = req.method === 'GET' && params.length === 1 && params[0][0] === 'key' ? FEEDS[params[0][1]] : null;
    if (!feed) { res.writeHead(req.method === 'GET' ? 403 : 405, { 'Cache-Control': 'no-store' }); res.end(); return; }
    if (origin !== STORE && origin !== NOSE) { res.writeHead(403, { 'Cache-Control': 'no-store' }); res.end(); return; }
    res.writeHead(200, { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'public, max-age=60',
                         'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(feed));
    return;
  }
  if (u.pathname === VOTE_PATH) {
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); res.end(); return; }
    res.writeHead(204, origin === STORE || origin === NOSE ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {});
    res.end();
    return;
  }
  /* A release, as netlify/functions/b2b-release.js serves one: its bytes and
     lib/b2b-releases.js's headers, or a plain 404. */
  const wanted = releases.parsePath(u.pathname);
  if (wanted) {
    const bytes = !u.search && (req.method === 'GET' || req.method === 'HEAD') ? SERVED[`${wanted.version}/${wanted.file}`] : null;
    if (!bytes) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('Not Found'); return; }
    res.writeHead(200, RELEASE_HEADERS(wanted.file));
    res.end(req.method === 'HEAD' ? undefined : bytes);
    return;
  }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  const ok = (req.method === 'GET' || req.method === 'HEAD') && file.startsWith(ROOT + path.sep) && !SOURCE_ONLY.test(p)
    && fs.existsSync(file) && fs.statSync(file).isFile();
  if (!ok) { res.writeHead(404, HEADERS); res.end(); return; }
  res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(file));
});
NOSE = `http://127.0.0.1:${noseServer.address().port}`;

/* The store: its own page and script, under the prompt's CSP. Each case's
   attributes are in the page as it is served, as a store's server writes
   them, so the widget sees them from its first moment. */
const CASES = {};
const PAGES = {};               // a case's page: { release, crossorigin, policy }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const CSP = () => `script-src 'self' ${NOSE}; style-src 'self' ${NOSE}; connect-src ${NOSE}`;
const GUIDE_CSP = () => GUIDE_CSP_LINES.map(([d, sources]) =>
  [d, ...(d === 'connect-src' ? [] : ["'self'"]), ...sources.map(x => x.replace('https://nose-app.com', NOSE))].join(' ')).join('; ');
const SHOP_JS = `(function () {
  window.__events = [];
  var w = document.getElementById('w');
  if (w) {
    w.addEventListener('nose:consent', function (e) { window.__events.push(['nose:consent', e.detail]); w.setAttribute('consent', 'granted'); });
    w.addEventListener('nose:palate-removed', function (e) { window.__events.push(['nose:palate-removed', e.detail]); });
    w.addEventListener('nose:palate-restored', function (e) { window.__events.push(['nose:palate-restored', e.detail]); });
  }
  var probe = document.getElementById('probe');
  if (probe) probe.addEventListener('click', function () {
    var s = document.createElement('style'); s.textContent = 'p { color: red }'; document.head.appendChild(s);
    try { new Function('return 1')(); } catch (e) {}
    try { fetch('https://csp-probe.invalid/').catch(function () {}); } catch (e) {}
  });
})();`;
const storeServer = await listen(function store(req, res) {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/shop.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); res.end(SHOP_JS); return; }
  if (u.pathname !== '/shop.html' || !CASES[u.searchParams.get('case')]) { res.writeHead(404); res.end(); return; }
  const attrs = Object.entries(CASES[u.searchParams.get('case')]).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  const pg = PAGES[u.searchParams.get('case')] || {};
  const scripts = pg.release
    ? `<script src="${NOSE}${releases.releasePath(pg.release, releases.JS)}" integrity="${PINNED[pg.release]}"${pg.crossorigin === false ? '' : ' crossorigin="anonymous"'} referrerpolicy="no-referrer" defer></script>`
    : [F.math, F.bar, F.rank, F.strings, F.widget].map(f => `<script src="${NOSE}/js/${f}" defer></script>`).join('\n');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': pg.release ? GUIDE_CSP() : CSP(),
                       ...(pg.policy ? { 'Referrer-Policy': pg.policy } : {}) });
  res.end(`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>A test store</title></head>\n<body>\n<h1>A test store</h1>\n<nose-matches id="w"${attrs}></nose-matches>\n<button id="probe" type="button" hidden>probe</button>\n<script src="/shop.js" defer></script>\n${scripts}\n</body></html>\n`);
});
STORE = `http://localhost:${storeServer.address().port}`;

/* The demo page and its script, as the build left them. */
const DEMO_SRC = { html: fs.readFileSync(path.join(ROOT, 'b2b/demo/index.html'), 'utf8'),
                   js: fs.readFileSync(path.join(ROOT, 'js', built('js', 'b2b-demo', 'js')), 'utf8') };

/* --- the browser ------------------------------------------------------------- */

const browser = await playwright.chromium.launch();
const shadowState = page => page.evaluate(() => {
  const r = document.querySelector('nose-matches').shadowRoot;
  return { text: r ? r.textContent.trim() : '', links: r ? r.querySelectorAll('link').length : 0 };
});

async function open(name, attrs, { origin = 'store', path: at, page: pg } = {}) {
  CASES[name] = attrs;
  if (pg) PAGES[name] = pg;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: 'nose_session', value: 'widget-test-session', url: NOSE, sameSite: 'Lax', httpOnly: true }]);
  await context.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', e => window.__violations.push(e.effectiveDirective || e.violatedDirective));
    window.__purchaseReads = 0;
    const get = Element.prototype.getAttribute;
    Element.prototype.getAttribute = function (n) {
      if (n === 'purchases' && this.localName === 'nose-matches') window.__purchaseReads++;
      return get.apply(this, arguments);
    };
    try { localStorage.setItem('nose-age-ok', '1'); } catch (e) {}
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const c = { name, context, page, errors: [], warnings: [], elsewhere: [], mark: received.length };
  page.on('pageerror', e => c.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') c.errors.push(m.text()); if (m.type() === 'warning') c.warnings.push(m.text()); });
  context.on('request', r => { const o = new URL(r.url()).origin; if (o !== NOSE && o !== STORE) c.elsewhere.push(r.url()); });
  await page.goto(origin === 'store' ? `${STORE}/shop.html?case=${name}` : `${NOSE}${at}`);
  await page.waitForLoadState('networkidle');
  return c;
}
const since = c => received.slice(c.mark);
const SCRIPTS = new Set([F.math, F.bar, F.rank, F.strings, F.widget].map(f => `/js/${f}`));
function kind(r) {
  const u = new URL(r.url, 'http://x');
  if (r.origin === 'store') return ['/shop.js', '/favicon.ico'].includes(u.pathname) || u.pathname === '/shop.html' ? 'store page' : 'other';
  if (r.method === 'GET' && SCRIPTS.has(u.pathname) && !u.search) return 'script';
  if (r.method === 'GET' && u.pathname === `/css/${F.css}` && !u.search) return 'stylesheet';
  const rp = releases.parsePath(u.pathname);
  if (r.method === 'GET' && rp && !u.search) return rp.file === releases.JS ? 'script' : 'stylesheet';
  if (r.method === 'GET' && u.pathname === FEED_PATH && /^\?key=npk_[0-9a-f]{64}$/.test(u.search)) return 'feed';
  if (r.method === 'POST' && u.pathname === VOTE_PATH && !u.search) return 'vote';
  return 'other';
}
const kinds = c => since(c).map(kind).filter(k => k !== 'script' && k !== 'store page');

/* After each case: nothing carried, nothing elsewhere, no violation, no error. */
async function close(c, { quietWarnings = false, allowErrors = null } = {}) {
  const reqs = since(c);
  const leaks = reqs.filter(r => NEEDLES.some(n => `${r.method} ${r.url} ${JSON.stringify(r.headers)} ${r.body}`.includes(n)));
  check(`${c.name}: no request carries a purchased batch ID, a purchase day or the purchases attribute (${reqs.length} requests)`,
    !leaks.length, leaks.map(r => `${r.method} ${r.url} ${r.body}`).join(' | '));
  check(`${c.name}: no request is of any other kind, and none goes to another origin`,
    !reqs.some(r => kind(r) === 'other') && !c.elsewhere.length,
    JSON.stringify([...reqs.filter(r => kind(r) === 'other').map(r => `${r.origin} ${r.method} ${r.url}`), ...c.elsewhere]));
  check(`${c.name}: no request to NOSE carries a cookie or the page's address`,
    reqs.filter(r => r.origin === 'nose').every(r => !r.headers.cookie && (!r.headers.referer || r.headers.referer === `${STORE}/`)),
    JSON.stringify(reqs.filter(r => r.origin === 'nose').map(r => [r.url, r.headers.cookie, r.headers.referer])));
  const violations = await c.page.evaluate(() => window.__violations.slice());
  const errors = allowErrors ? c.errors.filter(e => !allowErrors.test(e)) : c.errors;
  check(`${c.name}: no CSP violation, no page error${allowErrors ? ' but the one expected' : ''}${quietWarnings ? '' : ', no console warning'}`,
    !violations.length && !errors.length && (quietWarnings || !c.warnings.length),
    JSON.stringify({ violations, errors: c.errors, warnings: c.warnings }));
  await c.context.close();
}

/* The widget's cards, read out of its shadow root. */
const readCards = page => page.evaluate(() => [...document.querySelector('nose-matches').shadowRoot.querySelectorAll('.nm-card')].map(card => {
  const q = s => card.querySelector(s);
  const t = s => (q(s) ? q(s).textContent : null);
  return { name: t('.nm-name'), href: q('.nm-name a') ? q('.nm-name a').getAttribute('href') : null, brand: t('.nm-brand'),
           match: t('.nm-match [aria-hidden="true"]'), sr: t('.nm-match .nm-sr'), band: q('.nm-match') ? q('.nm-match').dataset.band : null,
           nopanel: t('.nm-nopanel'), facts: [...card.querySelectorAll('.nm-facts span')].map(s => s.textContent),
           bar: q('.nm-bar') ? q('.nm-bar').innerHTML : null };
}));
/* renderBar()'s own drawing of each batch, made in the same page from window.NoseBar. */
const drawBars = (page, list) => page.evaluate(list => list.map(terps => {
  if (!terps) return null;
  const d = document.createElement('div');
  window.NoseBar.renderBar(d, terps);
  return d.innerHTML;
}), list);
const barsOk = page => page.evaluate(prefix => [...document.querySelector('nose-matches').shadowRoot.querySelectorAll('.profile-bar')]
  .map(b => b.getAttribute('role') === 'img' && b.getAttribute('aria-label').startsWith(prefix) && b.getAttribute('aria-label').length > prefix.length),
  S.SHOWN_FROM_OTHER_FILES.barPrefix);
const deepFocus = page => page.evaluate(() => {
  let a = document.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  if (!a || a === document.body) return null;
  return `${a.localName}${a.getAttribute('href') ? ` ${a.getAttribute('href')}` : ''}|${(a.getAttribute('aria-label') || a.textContent).trim()}`;
});
const stops = page => page.evaluate(() => [...document.querySelector('nose-matches').shadowRoot.querySelectorAll('a[href], button:not([disabled]), summary')]
  .filter(n => n.getClientRects().length && (n.localName === 'summary' || !n.closest('details:not([open])')))
  .map(a => `${a.localName}${a.getAttribute('href') ? ` ${a.getAttribute('href')}` : ''}|${(a.getAttribute('aria-label') || a.textContent).trim()}`));
async function tabThrough(page, n) {
  const seen = [];
  for (let i = 0; i < n; i++) { await page.keyboard.press('Tab'); seen.push(await deepFocus(page)); }
  return seen;
}

/* Every word in the widget's shadow root - text, aria-labels, tooltips. */
const shownWords = page => page.evaluate(() => {
  const out = [];
  const walk = n => {
    if (n.nodeType === 3) out.push(n.textContent);
    else if (n.nodeType === 1) {
      for (const a of ['aria-label', 'title', 'alt', 'placeholder']) if (n.hasAttribute(a)) out.push(n.getAttribute(a));
      n.childNodes.forEach(walk);
    }
  };
  document.querySelector('nose-matches').shadowRoot.childNodes.forEach(walk);
  return out.join(' ');
});
const words = s => (String(s).match(/[A-Za-z]+/g) || []).map(w => w.toLowerCase());
const VOCAB = new Set([
  ...[S.default, S.florida].flatMap(v => Object.values(v).flatMap(x => (typeof x === 'string' ? [x] : Object.values(x)))).flatMap(s => words(s.replace(/\{\w+\}/g, ' '))),
  ...words(JSON.stringify(S.SHOWN_FROM_OTHER_FILES)),
  ...FEED.batches.flatMap(b => words(`${b.name} ${b.brand || ''}`))
]);
async function wordsCheck(c, what) {
  const text = await shownWords(c.page);
  const unknown = [...new Set(words(text).filter(w => !VOCAB.has(w)))];
  check(`${c.name}: every word ${what} is js/b2b-strings', matchBand()'s, the bar's or the catalog's - and none is about effects`,
    text.trim().length > 0 && !unknown.length && !effectWords(text).length, `unknown ${JSON.stringify(unknown)}; effect ${JSON.stringify(effectWords(text))}`);
}

try {
  /* ==================================================== consent: unknown */
  {
    const c = await open('consent unknown', { key: KEY, mode: 'rail', category: 'flower', routes: JSON.stringify(ROUTES),
      purchases: PURCHASES_JSON, consent: 'unknown', group: 'test' });
    const { page } = c;
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-consent'));
    const shown = await page.evaluate(() => {
      const r = document.querySelector('nose-matches').shadowRoot;
      return { buttons: [...r.querySelectorAll('button')].map(b => b.textContent), paragraphs: [...r.querySelectorAll('p')].map(p => p.textContent),
               describedBy: r.querySelector('button').getAttribute('aria-describedby') === r.querySelector('p').id,
               other: r.querySelectorAll('.nm-card, .nm-basis, section').length };
    });
    check('consent unknown: one button and one sentence, the plan\'s words, and nothing else',
      same(shown, { buttons: [S.default.consentButton], paragraphs: [S.default.consentNote], describedBy: true, other: 0 }), differs(shown, {}));
    check('consent unknown: the purchases are never read, and no feed is asked for',
      (await page.evaluate(() => window.__purchaseReads)) === 0 && !kinds(c).includes('feed'), JSON.stringify(kinds(c)));
    await wordsCheck(c, 'it shows');
    check('consent unknown: Tab reaches the button first', (await tabThrough(page, 1))[0] === `button|${S.default.consentButton}`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelectorAll('.nm-card').length);
    const events = await page.evaluate(() => window.__events);
    check('...and Enter fires nose:consent once, { consent: "granted" }; the page records it and sets the attribute; the rail follows',
      same(events, [['nose:consent', { consent: 'granted' }]]) && (await page.getAttribute('nose-matches', 'consent')) === 'granted',
      JSON.stringify(events));
    check('...with one feed request, the key alone, carrying the store\'s Origin', kinds(c).filter(k => k === 'feed').length === 1
      && since(c).filter(r => kind(r) === 'feed').every(r => r.url === `${FEED_PATH}?key=${KEY}` && r.headers.origin === STORE),
      JSON.stringify(since(c).filter(r => kind(r) === 'feed').map(r => [r.url, r.headers.origin])));
    await close(c);
  }

  /* ================================================ denied, control, and wrong */
  for (const [name, attrs] of [
    ['consent denied', { consent: 'denied', group: 'test' }],
    ['control group', { consent: 'granted', group: 'control' }],
    ['control group, consent unknown', { consent: 'unknown', group: 'control' }]]) {
    const c = await open(name, { key: KEY, mode: 'rail', category: 'flower', routes: JSON.stringify(ROUTES), purchases: PURCHASES_JSON, ...attrs });
    await c.page.waitForTimeout(400);
    const out = await shadowState(c.page);
    check(`${name}: shows nothing, loads nothing - no stylesheet, no feed - and never reads the purchases`,
      out.text === '' && out.links === 0 && !kinds(c).length && (await c.page.evaluate(() => window.__purchaseReads)) === 0,
      JSON.stringify({ ...out, requests: kinds(c) }));
    await close(c);
  }
  {
    const base = { key: KEY, mode: 'rail', category: 'flower', routes: JSON.stringify(ROUTES), purchases: PURCHASES_JSON, consent: 'granted' };
    const c = await open('wrong attributes', { ...base, key: SECRET });
    const { page } = c;
    const attempts = [['a secret key', { key: SECRET }], ['a key cut short', { key: 'npk_1234' }],
      ['a feed on another origin', { feed: 'https://elsewhere.example/feed.json' }], ['an unknown mode', { mode: 'grid' }],
      ['no routes', { routes: null }], ['routes that are not a list', { routes: '"smoking"' }],
      ['an unknown category', { category: 'edible' }], ['a vote with no product', { mode: 'vote' }]];
    const results = [];
    for (const [what, set] of attempts) {
      await page.evaluate(all => {
        const w = document.querySelector('nose-matches');
        for (const a of [...w.attributes].map(x => x.name)) if (a !== 'id') w.removeAttribute(a);
        for (const [k, v] of Object.entries(all)) if (v !== null) w.setAttribute(k, v);
      }, { ...base, ...set });
      await page.waitForTimeout(150);
      results.push([what, (await shadowState(page)).text]);
    }
    check(`wrong attributes: each shows nothing (${attempts.map(a => a[0]).join(', ')})`, results.every(([, t]) => t === ''), JSON.stringify(results));
    check('wrong attributes: nothing is asked for, the secret key is sent nowhere, and the console gets one line, without detail',
      !kinds(c).length && !since(c).some(r => JSON.stringify(r).includes(SECRET)) && c.warnings.length === 1
        && /^nose-matches: nothing to show/.test(c.warnings[0]),
      JSON.stringify({ requests: kinds(c), warnings: c.warnings }));
    await close(c, { quietWarnings: true });
  }

  /* ================================================================= rail */
  {
    const c = await open('rail', { key: KEY, mode: 'rail', category: 'flower', routes: JSON.stringify(ROUTES), purchases: PURCHASES_JSON, consent: 'granted' });
    const { page } = c;
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelectorAll('.nm-card').length);
    const want = expectRail(FEED, PURCHASES, [], 'flower');
    const cards = await readCards(page);
    const bars = await drawBars(page, want.ranked.map(e => (e.unscored ? null : e.batch.terps)));
    check(`rail: ${cards.length} cards, js/b2b-rank's order - label, number and band each its own, through shownScore() and matchBand()`,
      same(cards.map(({ bar, ...k }) => k), want.ranked.map(e => expectCard(S.default, e))), differs(cards.map(({ bar, ...k }) => k), want.ranked.map(e => expectCard(S.default, e))));
    check('rail: at most twelve cards, the palate built from this category\'s purchases only - suggestions across forms stay off',
      cards.length === 12 && want.palate.basis.used.every(u => u.batch.category === 'flower') && want.palate.basis.used.length === 3);
    check('rail: every bar is js/aroma-bar\'s renderBar() for that batch, byte for byte', same(cards.map(k => k.bar), bars),
      differs(cards.map(k => k.bar), bars));
    check('rail: each bar is role="img" with the profile in its aria-label', (await barsOk(page)).every(Boolean) && (await barsOk(page)).length === 12);
    const styled = await page.evaluate(() => {
      const r = document.querySelector('nose-matches').shadowRoot;
      const link = r.querySelector('link[rel="stylesheet"]');
      return [link && link.getAttribute('href'), getComputedStyle(r.querySelector('.nm-card')).borderTopLeftRadius,
              getComputedStyle(r.querySelector('.profile-bar')).height, r.querySelector('.nm').hidden,
              getComputedStyle(r.querySelector('.profile-segment')).width !== 'auto'];
    });
    check('rail: styled by its own stylesheet, linked in its shadow root from NOSE under the store\'s style-src; the bar\'s widths are set as the app sets them',
      same(styled, [`${NOSE}/css/${F.css}`, '12px', '22px', false, true]), JSON.stringify(styled));
    check('rail: each card links to the store\'s product page, and nothing in it adds to a cart',
      cards.every(k => k.href && k.href.startsWith('https://shop.example/p/'))
        && (await page.evaluate(() => document.querySelector('nose-matches').shadowRoot.querySelectorAll('.nm-card button, form, input').length)) === 0);
    const summary = await page.evaluate(() => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-basis summary').textContent);
    check(`rail: the basis says "${expectSummary(S.default, want.palate, 'flower')}"`, summary === expectSummary(S.default, want.palate, 'flower'), summary);
    const method = await page.evaluate(() => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-method').textContent);
    check('rail: the method line is the strings file\'s', method === S.default.method);

    /* keyboard: every card link, then the basis, then its buttons */
    const linkStops = (await stops(page));
    const tabbed = await tabThrough(page, linkStops.length);
    check(`rail: Tab reaches every link and the basis, in order (${linkStops.length} stops)`, same(tabbed, linkStops), differs(tabbed, linkStops));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-basis').open);
    const basis = await page.evaluate(() => {
      const r = document.querySelector('nose-matches').shadowRoot;
      return [...r.querySelectorAll('.nm-basis-item')].map(li => [li.querySelector('.nm-basis-name').textContent, li.querySelector('button') ? li.querySelector('button').getAttribute('aria-label') : null]);
    });
    const used = want.palate.basis.used.map(u => [`${u.batch.name} · ${u.batch.brand}`, fill(S.default.removeAria, { name: u.batch.name })]);
    const noPanel = ['House Blend', 'Sunset Haze'].map(n => [fill(S.default.notUsedPanel, { name: n }), null]);
    const others = PURCHASES.length - want.palate.basis.used.reduce((n, u) => n + u.days.length, 0) - 2;
    check('rail: Enter opens the basis - the batches used, each with its remove button; those without a panel; how many others',
      same(basis, [...used, ...noPanel, [fill(S.default.notUsedOthersMany, { n: others }), null]]), differs(basis, [...used, ...noPanel]));
    const buttonStops = (await stops(page)).filter(s => s.startsWith('button'));
    const tabbed2 = await tabThrough(page, buttonStops.length);
    check('rail: Tab then reaches each remove button', same(tabbed2, buttonStops), differs(tabbed2, buttonStops));
    const wanted = `button|${fill(S.default.removeAria, { name: 'Cold Creek Kush' })}`;
    for (let i = buttonStops.length - 1; i > buttonStops.indexOf(wanted) && i >= 0; i--) await page.keyboard.press('Shift+Tab');
    const target = await deepFocus(page);
    check('...and Shift+Tab back to the one for Cold Creek Kush', target === wanted, target);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__events.length);
    const removedEvent = await page.evaluate(() => window.__events);
    const kept = await page.evaluate(() => localStorage.getItem('nose-matches-removed'));
    check('rail: removing it fires nose:palate-removed { batchId, removed } and keeps it in this browser, on the store\'s origin',
      same(removedEvent, [['nose:palate-removed', { batchId: 'DB-1106', removed: ['DB-1106'] }]]) && kept === '["DB-1106"]', JSON.stringify([removedEvent, kept]));
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-basis-title'));
    const after = expectRail(FEED, PURCHASES, ['DB-1106'], 'flower');
    const cards2 = await readCards(page);
    check('...and the rail is js/b2b-rank\'s for the palate without it', same(cards2.map(({ bar, ...k }) => k), after.ranked.map(e => expectCard(S.default, e)))
      && !same(cards2.map(k => k.name), cards.map(k => k.name)), differs(cards2.map(k => k.name), after.ranked.map(e => e.batch.name)));
    const putBack = await page.evaluate(() => {
      const r = document.querySelector('nose-matches').shadowRoot;
      return [...r.querySelectorAll('.nm-basis-title')].map(t => t.textContent).concat(r.querySelector('.nm-basis summary').textContent);
    });
    check('...the basis lists it as taken out, with its put-back button, and counts two products',
      same(putBack, [S.default.removedTitle, S.default.notUsedTitle, expectSummary(S.default, after.palate, 'flower')]), JSON.stringify(putBack));
    const putBackStop = `button|${fill(S.default.putBackAria, { name: 'Cold Creek Kush' })}`;
    check('...drawn again, the basis is still open and its put-back button has the focus, so the keyboard keeps its place',
      (await page.evaluate(() => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-basis').open)) && (await deepFocus(page)) === putBackStop,
      await deepFocus(page));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__events.length === 2);
    const restored = await page.evaluate(() => [window.__events[1], localStorage.getItem('nose-matches-removed')]);
    await page.waitForFunction(n => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-basis summary').textContent === n,
      expectSummary(S.default, want.palate, 'flower'));
    check('rail: putting it back, by Enter, fires nose:palate-restored, empties the list, and the rail is as before - its remove button focused',
      same(restored, [['nose:palate-restored', { batchId: 'DB-1106', removed: [] }], '[]'])
        && same((await readCards(page)).map(k => k.name), cards.map(k => k.name)) && (await deepFocus(page)) === wanted,
      JSON.stringify([restored, await deepFocus(page)]));
    await wordsCheck(c, 'the rail and its basis show');
    check('rail: the feed was asked for once, though the rail was drawn again after each change', kinds(c).filter(k => k === 'feed').length === 1, JSON.stringify(kinds(c)));
    check('rail: the purchases were read only with consent granted', (await page.evaluate(() => window.__purchaseReads)) > 0);
    await close(c);
  }

  /* ===================================== rail: no panel, the guardrail, Florida */
  {
    const c = await open('rail, pre-rolls', { key: KEY, mode: 'rail', category: 'pre-roll', routes: JSON.stringify(ROUTES), purchases: PURCHASES_JSON, consent: 'granted' });
    const { page } = c;
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelectorAll('.nm-card').length);
    const want = expectRail(FEED, PURCHASES, [], 'pre-roll');
    const cards = await readCards(page);
    check('rail, pre-rolls: scored batches first, then those with no usable read - two unread, then one refused - in the store\'s order',
      same(cards.map(({ bar, ...k }) => k), want.ranked.map(e => expectCard(S.default, e)))
        && same(cards.map(k => k.name), ['Indica Blend Pre-Roll', 'Squirrell Thai Stick Pre-Roll', 'Sunset Haze Pre-Roll', 'Unread Pre-Roll', 'Refused Pre-Roll']),
      differs(cards.map(({ bar, ...k }) => k), want.ranked.map(e => expectCard(S.default, e))));
    check('...each of those three says "No terpene panel available for this batch", with no number, no label and no bar',
      cards.slice(2).every(k => k.nopanel === S.default.noPanel && k.match === null && k.sr === null && k.bar === null));
    check('...a link that is not https is no link, and a missing brand or figure is said, not invented',
      cards[4].href === null && cards[3].brand === null && same(cards[3].facts, [S.default.thcMissing, S.default.cbdMissing])
        && same(cards[4].facts, ['THC 17.5%', 'CBD 0.4%']));
    check('...and a pre-roll palate of one, the refused one not used', want.palate.basis.used.length === 1
      && (await page.evaluate(() => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-basis summary').textContent)) === expectSummary(S.default, want.palate, 'pre-roll'));
    await wordsCheck(c, 'the pre-roll rail shows');
    await close(c);
  }
  {
    const c = await open('rail, guardrail', { key: KEY_GUARD, mode: 'rail', category: 'flower', routes: JSON.stringify(ROUTES), purchases: PURCHASES_JSON, consent: 'granted' });
    await c.page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelectorAll('.nm-card').length);
    const want = expectRail(FEED_GUARD, PURCHASES, [], 'flower');
    const { mine } = split(FEED, PURCHASES, 'flower');
    const palate = R.palateFrom(FEED, mine, []);
    const guarded = R.rank(FEED_GUARD, palate, { category: 'flower', routes: ROUTES }).map(e => e.batch.name);
    const unguarded = R.rank(FEED, palate, { category: 'flower', routes: ROUTES }).map(e => e.batch.name);
    const inOrder = guarded.every((n, i) => i === 0 || unguarded.indexOf(n) > unguarded.indexOf(guarded[i - 1]));
    const cards = await readCards(c.page);
    check(`rail, guardrail: the store's guardrail, read from its feed, leaves out what js/b2b-rank leaves out (${unguarded.length - guarded.length} of ${unguarded.length}) and reorders nothing`,
      same(cards.map(k => k.name), want.ranked.map(e => e.batch.name)) && guarded.length < unguarded.length && inOrder,
      differs(cards.map(k => k.name), want.ranked.map(e => e.batch.name)));
    await close(c);
  }
  {
    const c = await open('rail, Florida', { key: KEY, mode: 'rail', category: 'flower', routes: JSON.stringify(ROUTES), purchases: PURCHASES_JSON,
      consent: 'granted', strings: 'florida' });
    const { page } = c;
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelectorAll('.nm-card').length);
    const want = expectRail(FEED, PURCHASES, [], 'flower');
    const seen = await page.evaluate(() => {
      const r = document.querySelector('nose-matches').shadowRoot;
      return [r.querySelector('.nm-title').textContent, r.querySelector('.nm-basis summary').textContent, r.querySelector('.nm-method').textContent];
    });
    check('rail, Florida: the Florida variant\'s title, basis and method line', same(seen, [S.florida.railTitle, expectSummary(S.florida, want.palate, 'flower'), S.florida.method]), JSON.stringify(seen));
    check('...the same cards, in Florida\'s words', same((await readCards(page)).map(({ bar, ...k }) => k), want.ranked.map(e => expectCard(S.florida, e))));
    const text = await shownWords(page);
    check('...and none of the default variant\'s flavor or purchase words', !/\b(flavou?r|bought|purchase)/i.test(text), text.slice(0, 200));
    await wordsCheck(c, 'the Florida rail shows');
    await close(c);
  }

  /* ============================================================ sold out */
  {
    const c = await open('sold out', { key: KEY, mode: 'sold-out', routes: JSON.stringify(ROUTES), purchases: PURCHASES_JSON, consent: 'granted' });
    const { page } = c;
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelectorAll('.nm-card').length);
    const found = R.soldOut(FEED, PURCHASES, { removed: [], routes: ROUTES });
    const cards = await readCards(page);
    const head = await page.evaluate(() => { const r = document.querySelector('nose-matches').shadowRoot; return [r.querySelector('.nm-title').textContent, r.querySelector('.nm-lead').textContent]; });
    check('sold out: the panel names the usual, sold out, and leads into what is closest to its last batch',
      found && found.productId === 'D-106' && same(head, [fill(S.default.soldOutTitle, { name: 'Cold Creek Kush' }), S.default.soldOutLead]), JSON.stringify(head));
    check('sold out: the cards are js/b2b-rank\'s soldOut() ranking, in its order, with its numbers',
      same(cards.map(({ bar, ...k }) => k), found.ranked.slice(0, 12).map(e => expectCard(S.default, e))),
      differs(cards.map(({ bar, ...k }) => k), found.ranked.slice(0, 12).map(e => expectCard(S.default, e))));
    check('sold out: every bar is renderBar()\'s, role="img" and labelled',
      same(cards.map(k => k.bar), await drawBars(page, found.ranked.slice(0, 12).map(e => (e.unscored ? null : e.batch.terps))))
        && (await barsOk(page)).every(Boolean));
    const linkStops = await stops(page);
    check(`sold out: Tab reaches every card's link (${linkStops.length})`, same(await tabThrough(page, linkStops.length), linkStops));
    await wordsCheck(c, 'the sold-out panel shows');
    await close(c);
  }
  {
    const usualInStock = [['DB-1103', 10], ['DB-1103', 40], ['DB-1106', 70]].map(([batchId, back]) => ({ batchId, day: day(back) }));
    const c = await open('sold out, usual in stock', { key: KEY, mode: 'sold-out', routes: JSON.stringify(ROUTES), purchases: JSON.stringify(usualInStock), consent: 'granted' });
    await c.page.waitForTimeout(400);
    check('sold out: nothing at all while the product bought most has a batch in stock',
      R.soldOut(FEED, usualInStock, { removed: [], routes: ROUTES }) === null
        && (await c.page.evaluate(() => document.querySelector('nose-matches').shadowRoot.textContent.trim())) === '');
    await close(c);
  }

  /* ================================================================ vote */
  {
    const c = await open('vote', { key: KEY, mode: 'vote', product: 'D-103', purchases: PURCHASES_JSON, consent: 'granted' });
    const { page } = c;
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-vote'));
    const { mine } = split(FEED, PURCHASES, 'flower');
    const v = R.voteScore(FEED, mine, 'D-103', { removed: [] });
    const shown = await page.evaluate(() => { const r = document.querySelector('nose-matches').shadowRoot; return [r.querySelector('.nm-question').textContent, r.querySelector('.nm-lead').textContent, [...r.querySelectorAll('button')].map(b => b.textContent)]; });
    check('vote: "Was the flavor close?", the match it is about, and up and down',
      same(shown, [S.default.voteQuestion, fill(S.default.voteMatched, { label: v.label, shown: v.shown }), [S.default.voteUp, S.default.voteDown]]), JSON.stringify(shown));
    await wordsCheck(c, 'the vote shows');
    const tabbed = await tabThrough(page, 2);
    check('vote: Tab reaches up, then down', same(tabbed, [`button|${S.default.voteUp}`, `button|${S.default.voteDown}`]), JSON.stringify(tabbed));
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press(' ');
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-thanks').textContent);
    await page.waitForTimeout(300);
    const votes = since(c).filter(r => kind(r) === 'vote');
    const body = votes.length === 1 ? JSON.parse(votes[0].body) : null;
    const BANDS = [1, 0.8, 0.6, 0].map(s => M.matchBand(s)[1]);
    check('vote: Space on up sends one vote by fetch: text/plain, the store\'s Origin, no cookie, no referrer, no preflight',
      votes.length === 1 && /^text\/plain;charset=utf-8$/i.test(votes[0].headers['content-type']) && votes[0].headers.origin === STORE
        && !votes[0].headers.cookie && !votes[0].headers.referer && !since(c).some(r => r.method === 'OPTIONS'),
      JSON.stringify(votes.map(r => r.headers)));
    check('vote: exactly b2b-vote\'s six fields - key, candidate, score, band, palateSize, vote - and js/b2b-rank\'s values in them',
      body && same(Object.keys(body).sort(), ['band', 'candidate', 'key', 'palateSize', 'score', 'vote'])
        && same(body, { key: KEY, candidate: 'D-103', score: v.payload.score, band: v.payload.band, palateSize: v.payload.palateSize, vote: 'up' })
        && BANDS.includes(body.band) && body.score === M.shownScore(v.score),
      JSON.stringify(body));
    const after = await page.evaluate(() => { const r = document.querySelector('nose-matches').shadowRoot; return [[...r.querySelectorAll('button')].map(b => [b.disabled, b.getAttribute('aria-pressed')]), r.querySelector('.nm-thanks').textContent, r.querySelector('.nm-thanks').getAttribute('role')]; });
    check('vote: both buttons off, up pressed, the thanks said as a status', same(after, [[[true, 'true'], [true, 'false']], S.default.voteThanks, 'status']), JSON.stringify(after));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-thanks'));
    await page.waitForTimeout(300);
    check('vote: once per product in this browser - reloaded, it thanks and offers no buttons, and sends nothing',
      (await page.evaluate(() => document.querySelector('nose-matches').shadowRoot.querySelectorAll('button').length)) === 0
        && since(c).filter(r => kind(r) === 'vote').length === 1);
    await close(c);
  }
  {
    const c = await open('vote, down, Florida', { key: KEY, mode: 'vote', product: 'D-103', purchases: PURCHASES_JSON, consent: 'granted', strings: 'florida' });
    const { page } = c;
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-vote'));
    check('vote, Florida: "Was the aroma close?"', (await page.evaluate(() => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-question').textContent)) === S.florida.voteQuestion);
    await page.locator('nose-matches').locator('button[data-vote="down"]').click();
    await page.waitForTimeout(300);
    const votes = since(c).filter(r => kind(r) === 'vote');
    check('vote, Florida: a click on down sends vote "down", the same six fields', votes.length === 1 && JSON.parse(votes[0].body).vote === 'down'
      && same(Object.keys(JSON.parse(votes[0].body)).sort(), ['band', 'candidate', 'key', 'palateSize', 'score', 'vote']));
    const thanks = await page.evaluate(() => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-thanks').textContent);
    check('vote, Florida: thanked in Florida\'s words', thanks === S.florida.voteThanks, thanks);
    await wordsCheck(c, 'the Florida vote shows');
    await close(c);
  }
  {
    const c = await open('vote, nothing to score', { key: KEY, mode: 'vote', product: 'D-119', purchases: PURCHASES_JSON, consent: 'granted' });
    await c.page.waitForTimeout(400);
    check('vote: nothing at all for a product whose batch has no terpene panel available',
      (await c.page.evaluate(() => document.querySelector('nose-matches').shadowRoot.textContent.trim())) === '' && !kinds(c).includes('vote'));
    await close(c);
  }

  /* ===================================================== a pinned release */
  check('the integration guide gives three CSP lines - script-src and style-src under /b2b/releases/, connect-src the feed and the vote alone',
    same(GUIDE_CSP_LINES, [['script-src', ['https://nose-app.com/b2b/releases/']], ['style-src', ['https://nose-app.com/b2b/releases/']],
      ['connect-src', [`https://nose-app.com${FEED_PATH}`, `https://nose-app.com${VOTE_PATH}`]]]), JSON.stringify(GUIDE_CSP_LINES));
  {
    const c = await open('release, rail', { key: KEY, mode: 'rail', category: 'flower', routes: JSON.stringify(ROUTES), purchases: PURCHASES_JSON, consent: 'granted' },
      { page: { release: 1, policy: 'unsafe-url' } });
    const { page } = c;
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelectorAll('.nm-card').length);
    const want = expectRail(FEED, PURCHASES, [], 'flower');
    const cards = await readCards(page);
    check('release, rail: one tag, its integrity and crossorigin, under the guide\'s CSP - the same cards as the five files give, js/b2b-rank\'s',
      same(cards.map(({ bar, ...k }) => k), want.ranked.map(e => expectCard(S.default, e))), differs(cards.map(({ bar, ...k }) => k), want.ranked.map(e => expectCard(S.default, e))));
    check('release, rail: every bar renderBar()\'s - the release\'s own copy, from js/aroma-bar verbatim',
      same(cards.map(k => k.bar), await drawBars(page, want.ranked.map(e => (e.unscored ? null : e.batch.terps)))));
    const styled = await page.evaluate(() => {
      const r = document.querySelector('nose-matches').shadowRoot;
      const link = r.querySelector('link[rel="stylesheet"]');
      return [link.getAttribute('href'), link.integrity, link.crossOrigin, link.referrerPolicy,
              getComputedStyle(r.querySelector('.nm-card')).borderTopLeftRadius, getComputedStyle(r.querySelector('.profile-bar')).height];
    });
    check('release, rail: its stylesheet is the release\'s own, checked by the sha384 the release names, with no referrer - and applied',
      same(styled, [`${NOSE}${releases.releasePath(1, releases.CSS)}`, RELEASE.sri.css, 'anonymous', 'no-referrer', '12px', '22px']), JSON.stringify(styled));
    const toNose = since(c).filter(r => r.origin === 'nose');
    check('release, rail: NOSE is asked for the release\'s two files and the feed alone - nothing from /js/ or /css/',
      same(toNose.map(r => new URL(r.url, 'http://x').pathname).sort(),
        [FEED_PATH, releases.releasePath(1, releases.CSS), releases.releasePath(1, releases.JS)].sort()), JSON.stringify(toNose.map(r => r.url)));
    check('release, rail: none of them carries a cookie or any referrer, though the page\'s policy is unsafe-url; each carries the store\'s Origin',
      toNose.every(r => !r.headers.cookie && !r.headers.referer && r.headers.origin === STORE), JSON.stringify(toNose.map(r => [r.url, r.headers.origin, r.headers.referer, r.headers.cookie])));
    await close(c);
  }
  {
    const c = await open('release, vote', { key: KEY, mode: 'vote', product: 'D-103', purchases: PURCHASES_JSON, consent: 'granted' },
      { page: { release: 1, policy: 'unsafe-url' } });
    const { page } = c;
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-vote'));
    await page.locator('nose-matches').locator('button[data-vote="up"]').click();
    await page.waitForTimeout(300);
    const votes = since(c).filter(r => kind(r) === 'vote');
    const { mine } = split(FEED, PURCHASES, 'flower');
    const v = R.voteScore(FEED, mine, 'D-103', { removed: [] });
    check('release, vote: one vote by fetch - text/plain, the store\'s Origin, no cookie, no referrer though the page\'s policy is unsafe-url, no preflight',
      votes.length === 1 && /^text\/plain;charset=utf-8$/i.test(votes[0].headers['content-type']) && votes[0].headers.origin === STORE
        && !votes[0].headers.cookie && !votes[0].headers.referer && !since(c).some(r => r.method === 'OPTIONS'),
      JSON.stringify(votes.map(r => r.headers)));
    check('release, vote: b2b-vote\'s six fields and js/b2b-rank\'s values in them',
      votes.length === 1 && same(JSON.parse(votes[0].body), { key: KEY, candidate: 'D-103', score: v.payload.score, band: v.payload.band, palateSize: v.payload.palateSize, vote: 'up' }),
      votes.length ? votes[0].body : 'no vote');
    await close(c);
  }
  {
    const c = await open('release, stylesheet altered', { key: KEY, mode: 'rail', category: 'flower', routes: JSON.stringify(ROUTES), purchases: PURCHASES_JSON, consent: 'granted' },
      { page: { release: 2 } });
    const { page } = c;
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelectorAll('.nm-card').length);
    await page.waitForTimeout(200);
    const shown = await page.evaluate(() => {
      const r = document.querySelector('nose-matches').shadowRoot;
      return [r.querySelector('.nm').hidden, getComputedStyle(r.querySelector('.nm-card')).borderTopLeftRadius, r.querySelectorAll('.nm-card').length];
    });
    check('release, stylesheet altered: the browser refuses the stylesheet by the hash the release names - the cards show, unstyled',
      shown[0] === false && shown[1] !== '12px' && shown[2] === 12 && c.errors.some(e => /integrity/i.test(e) && e.includes(releases.releasePath(2, releases.CSS))),
      JSON.stringify({ shown, errors: c.errors }));
    await close(c, { allowErrors: /integrity/i });
  }
  for (const [name, pg, needle] of [
    ['release, script altered', { release: 3 }, /integrity/i],
    ['release, no crossorigin', { release: 1, crossorigin: false }, /CORS enabled|integrity/i]]) {
    const c = await open(name, { key: KEY, mode: 'rail', category: 'flower', routes: JSON.stringify(ROUTES), purchases: PURCHASES_JSON, consent: 'granted' }, { page: pg });
    await c.page.waitForTimeout(400);
    const defined = await c.page.evaluate(() => !!window.customElements.get('nose-matches'));
    check(`${name}: the browser runs none of it - no element defined, nothing shown, no feed asked for`,
      !defined && !(await c.page.evaluate(() => !!document.querySelector('nose-matches').shadowRoot)) && !kinds(c).includes('feed')
        && c.errors.some(e => needle.test(e)),
      JSON.stringify({ defined, kinds: kinds(c), errors: c.errors }));
    await close(c, { allowErrors: needle });
  }

  /* ============================================== the CSP is in force */
  {
    const c = await open('the CSP', { key: KEY, mode: 'rail', category: 'flower', routes: JSON.stringify(ROUTES), purchases: PURCHASES_JSON, consent: 'granted' });
    const { page } = c;
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelectorAll('.nm-card').length);
    const before = await page.evaluate(() => window.__violations.length);
    await page.evaluate(() => { const b = document.getElementById('probe'); b.hidden = false; });
    await page.click('#probe');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.__violations.slice());
    check('the CSP: the store page\'s CSP is in force - its own inline style, eval and a request to another origin are each refused - while the widget, drawn, caused none',
      before === 0 && ['style-src-elem', 'script-src', 'connect-src'].every(d => after.includes(d)), JSON.stringify({ before, after }));
    /* The probe's own refusals are not the widget's: cleared before the case closes. */
    c.errors.length = 0;
    c.elsewhere.length = 0;
    await page.evaluate(() => { window.__violations.length = 0; });
    await close(c);
  }

  /* ========================================================= the demo page */
  {
    const c = await open('demo page', {}, { origin: 'nose', path: '/b2b/demo/' });
    const { page } = c;
    const meta = await page.evaluate(() => [document.querySelector('meta[name="robots"]')?.content, document.querySelector('nose-matches').getAttribute('feed'),
      document.querySelector('link[rel="canonical"]'), [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'))]);
    check('demo page: noindex, its feed the test store\'s file on NOSE\'s own origin, no canonical, its scripts from the site',
      meta[0] === 'noindex, nofollow' && meta[1] === '/b2b/demo/test-store.json' && meta[2] === null && meta[3].every(s => s.startsWith('/js/')), JSON.stringify(meta));
    await page.locator('nose-matches').locator('button.nm-primary').click();
    await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelectorAll('.nm-card').length);
    const purchases = await page.evaluate(() => JSON.parse(document.querySelector('nose-matches').getAttribute('purchases')));
    const want = expectRail(DEMO, purchases, [], 'flower');
    check('demo page: its consent button brings the rail, js/b2b-rank\'s for the made-up purchases typed in',
      same((await readCards(page)).map(k => k.name), want.ranked.map(e => e.batch.name)) && purchases.length === 11);
    for (const [mode, sel] of [['sold-out', '.nm-soldout'], ['vote', '.nm-vote'], ['rail', '.nm-rail']]) {
      await page.selectOption('#demoMode', mode);
      await page.waitForFunction(s => document.querySelector('nose-matches').shadowRoot.querySelector(s), sel);
    }
    check('demo page: it shows each mode - rail, sold-out panel and vote - from its own controls', true);
    const text = await page.evaluate(() => document.body.innerText);
    check('demo page: no effect wording on it, nor in its script or page source',
      !effectWords(text).length && !effectWords(prose(DEMO_SRC.js)).length && !effectWords(DEMO_SRC.html).length,
      JSON.stringify([effectWords(text), effectWords(prose(DEMO_SRC.js)), effectWords(DEMO_SRC.html)]));
    const reqs = since(c).filter(r => r.origin === 'nose');
    check('demo page: everything it asks for is on NOSE\'s own origin, and nothing goes elsewhere', !c.elsewhere.length && reqs.every(r => r.method === 'GET'),
      JSON.stringify(reqs.filter(r => r.method !== 'GET').map(r => r.url)));
    const violations = await page.evaluate(() => window.__violations.slice());
    check('demo page: no CSP violation under the site\'s own CSP, no page error', !violations.length && !c.errors.length,
      JSON.stringify({ violations, errors: c.errors }));
    await c.context.close();
  }
} catch (e) {
  /* A case that stops part way - an element that never comes, a page that
     went elsewhere - is a failure, said plainly; the checks below still run. */
  check('the browser cases ran to the end', false, e && e.message ? e.message.split('\n')[0] : String(e));
} finally {
  await browser.close();
  noseServer.close();
  storeServer.close();
}

{
  const leaks = received.filter(r => NEEDLES.some(n => `${r.method} ${r.url} ${JSON.stringify(r.headers)} ${r.body}`.includes(n)));
  check(`across every case, none of the ${received.length} requests either origin received carries a purchased batch ID, a purchase day or the purchases attribute`,
    received.length > 0 && !leaks.length, leaks.map(r => `${r.method} ${r.url}`).join(' | '));
}

/* ================================================ the demo page, in the tree */

const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'vendor', 'test'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) pages.push(p);
  }
})(ROOT);
check('the demo page is linked from no other page, nor from the sitemap or robots.txt',
  pages.filter(p => !p.endsWith(path.join('b2b', 'demo', 'index.html')) && /\/b2b\//.test(fs.readFileSync(p, 'utf8'))).length === 0
    && !/b2b/.test(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8')) && !/b2b/.test(fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8')));
check('the demo page holds no inline script or style, so build.sh\'s checks pass it',
  !/style="|<style/.test(DEMO_SRC.html) && !(DEMO_SRC.html.match(/<script[^>]*>[^<]/g) || []).length);

/* ============================================================ one bar */

/* A definition, as code: at the start of a line, not quoted in a test. */
const BAR_DEFS = /^\s*(?:function\s+(?:renderBar|familyShares)\s*\(|const\s+(?:FAMILIES|FAMILY_ORDER)\s*=)/m;
const holders = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'vendor'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(c|m)?js$/.test(e.name) && BAR_DEFS.test(fs.readFileSync(p, 'utf8'))) holders.push(path.relative(ROOT, p));
  }
})(ROOT);
check('one copy of the bar: only js/aroma-bar defines FAMILIES, FAMILY_ORDER, familyShares and renderBar (wip/ is a stale draft, loaded by nothing)',
  same(holders.sort(), [`js/${F.bar}`, 'wip/nose-farnesene-wip.js']), JSON.stringify(holders));
{
  const lines = SRC.bar.split('\n');
  const from = lines.indexOf('    const FAMILIES = {');
  const order = lines.indexOf('    const FAMILY_ORDER = Object.keys(FAMILIES);');
  const shares = lines.findIndex(l => l.startsWith('    function familyShares(values){'));
  const bar = lines.indexOf('    function renderBar(target,values){');
  let end = bar; while (end >= 0 && end < lines.length && lines[end] !== '    }') end++;
  const moved = [...lines.slice(from, order + 1), lines[shares], ...lines.slice(bar, end + 1)].join('\n');
  check('...moved there verbatim: its 31 lines are, byte for byte, the ones js/nose.593b2c1b.js held (SHA-256 9b31dc3b...)',
    from >= 0 && crypto.createHash('sha256').update(moved).digest('hex') === '9b31dc3bb29040d768b978706546f690abcb88f8c977e03b784dc0b925301f81');
}
check('...js/nose reads all four from window.NoseBar, and the widget draws with NoseBar.renderBar',
  /const \{ FAMILIES, FAMILY_ORDER, familyShares, renderBar \} = window\.NoseBar;/.test(SRC.nose) && /BAR\.renderBar\(bar, b\.terps\)/.test(SRC.widget)
    && /const BAR = window\.NoseBar/.test(SRC.widget));
for (const p of ['app.html', 'index.html']) {
  const s = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const at = f => s.indexOf(`/js/${f}"`);
  check(`${p} loads js/match-math, then js/aroma-bar, then js/nose, from the same build`, at(F.math) >= 0 && at(F.math) < at(F.bar) && at(F.bar) < at(F.nose));
}

/* ========================================================= the widget file */

check('the widget holds no maths, no rounding, no band and no label of its own',
  !/\bfunction\s+(cosine|normalize|matchBand|shownScore|averageProfiles)\s*\(|Math\.(round|floor|ceil)|\*\s*100\b|'(Strong|Good|Moderate|Low)'/.test(SRC.widget)
    && !S.SHOWN_FROM_OTHER_FILES.matchLabels.some(l => SRC.widget.includes(l)));
check('...asks for nothing but the feed and the vote: two fetch() - the feed\'s and the vote\'s - no sendBeacon(), no other way out',
  (SRC.widget.match(/\bfetch\(/g) || []).length === 2 && !/\bsendBeacon\b/.test(SRC.widget)
    && !/XMLHttpRequest|WebSocket|EventSource|new Image|import\(|\beval\(|new Function|innerHTML|document\.cookie|\.style\.|setAttribute\('style'/.test(SRC.widget),
  JSON.stringify([(SRC.widget.match(/\bfetch\(/g) || []).length, (SRC.widget.match(/\bsendBeacon\b/g) || []).length]));
check('...each in cors mode, with no cookie and no referrer; the vote kept alive',
  /fetch\(url, \{ method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl\.signal \}\)/.test(SRC.widget)
    && /fetch\(ORIGIN \+ VOTE_PATH, \{ method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true, body \}\)/.test(SRC.widget));
check('...its stylesheet asked for with no referrer, and by its hash only when a release names one - null as built, so the site\'s own stylesheet needs no CORS',
  /link\.referrerPolicy = 'no-referrer';/.test(SRC.widget) && /^ {2}const STYLESHEET_INTEGRITY = null;$/m.test(SRC.widget)
    && /if \(STYLESHEET_INTEGRITY\) \{ link\.integrity = STYLESHEET_INTEGRITY; link\.crossOrigin = 'anonymous'; \}/.test(SRC.widget)
    && SRC.widget.indexOf('link.referrerPolicy') < SRC.widget.indexOf('link.href ='));
check('...and reads the purchases only after consent is granted',
  SRC.widget.indexOf("getAttribute('purchases')") > SRC.widget.indexOf("if (consent !== 'granted')") && SRC.widget.indexOf("if (consent !== 'granted')") > 0);
check('no effect wording in the widget\'s comments and text, nor anywhere in the strings or the bar; the stylesheet shows no words',
  !effectWords(prose(SRC.widget)).length && ![SRC.strings, SRC.bar].some(s => effectWords(s).length) && !/content:\s*"[^"]*[A-Za-z]/.test(SRC.css),
  JSON.stringify([effectWords(prose(SRC.widget)), effectWords(SRC.strings), effectWords(SRC.bar)]));
check('the stylesheet colours the four bands by matchBand()\'s own names, and no others',
  same([...SRC.css.matchAll(/data-band="(\w+)"/g)].map(m => m[1]), [1, 0.8, 0.6, 0].map(s => M.matchBand(s)[1])));

/* ============================================================== build.sh */

{
  const build = fs.readFileSync(path.join(ROOT, 'build.sh'), 'utf8');
  const forLine = build.split('\n').find(l => l.startsWith('for f in js/nose*.js'));
  check('build.sh syntax-checks the shared bar, the strings, the widget and the demo script, and fingerprints them and both stylesheets',
    ['js/aroma-bar*.js', 'js/b2b-strings*.js', 'js/b2b-widget*.js', 'js/b2b-demo*.js'].every(g => forLine.includes(` ${g} `))
      && ['js  aroma-bar js', 'js  b2b-strings js', 'css b2b-widget css', 'js  b2b-widget js', 'js  b2b-demo js', 'css b2b-demo css']
        .every(f => new RegExp(`^fingerprint ${f.replace(/ /g, ' +')}$`, 'm').test(build)));
  const at = s => build.indexOf(s);
  check('...the widget\'s stylesheet first, its name written into the widget, then the widget - so the widget\'s hash covers it',
    at('fingerprint css b2b-widget css') < at("sed -i -E \"s#'/css/b2b-widget") && at("sed -i -E \"s#'/css/b2b-widget") < at('fingerprint js  b2b-widget js'));
  check(`...and the built widget names the built stylesheet, /css/${F.css}`, SRC.widget.includes(`'/css/${F.css}'`) && (SRC.widget.match(/\/css\/b2b-widget[^']*\.css/g) || []).length === 1);
  check('the family-image check reads js/aroma-bar, where FAMILIES lives, and fails unless it finds the six',
    /grep -ohE '\/images\/families\/\[a-z\]\+\\\.jpg' js\/aroma-bar\.\*\.js/.test(build) && /-eq 6 \]/.test(build));

  const lines = build.split('\n');
  const from = lines.findIndex(l => l.startsWith('# The shared files, in the order they read each other'));
  const to = from < 0 ? -1 : lines.findIndex((l, i) => i > from && l === 'done');
  const rule = from >= 0 && to > from ? lines.slice(from, to + 1).join('\n') : null;
  check('build.sh holds the load-order rule for the shared files, from its comment to its "done"', rule !== null && rule.includes('b2b-widget:b2b-strings'));
  const run = html => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2b-widget-rule-'));
    fs.writeFileSync(path.join(dir, 'page.html'), html);
    const r = spawnSync('bash', ['-c', `set -euo pipefail\ncd '${dir}'\nHTML=(./page.html)\n${rule}\necho 'load order ok'`], { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    return [r.status, `${r.stdout}${r.stderr}`.trim()];
  };
  const tag = n => `<script defer src="/js/${n}.0a1b2c3d.js"></script>`;
  const page = (...names) => names.map(tag).join('\n') + '\n';
  const fail = (later, earlier) => [1, `FAIL: ./page.html loads js/${later} without js/${earlier} before it`];
  const OK = [0, 'load order ok'];
  const cases = [
    [page('match-math', 'aroma-bar', 'b2b-rank', 'b2b-strings', 'b2b-widget'), OK],
    [page('match-math', 'aroma-bar', 'nose'), OK],
    [page('match-math', 'b2b-rank', 'b2b-strings', 'b2b-widget'), fail('b2b-widget', 'aroma-bar')],
    [page('match-math', 'aroma-bar', 'b2b-strings', 'b2b-widget'), fail('b2b-widget', 'b2b-rank')],
    [page('match-math', 'aroma-bar', 'b2b-rank', 'b2b-widget'), fail('b2b-widget', 'b2b-strings')],
    [page('match-math', 'aroma-bar', 'b2b-rank', 'b2b-widget', 'b2b-strings'), fail('b2b-widget', 'b2b-strings')],
    [page('match-math', 'nose', 'aroma-bar'), fail('nose', 'aroma-bar')],
    [page('aroma-bar', 'match-math'), fail('aroma-bar', 'match-math')],
    [`${tag('match-math')}${tag('aroma-bar')}\n`, fail('aroma-bar', 'match-math')],
    ['<p>no scripts</p>\n', OK]];
  const got = rule === null ? null : cases.map(([html]) => run(html));
  check(`...its own lines, run on ${cases.length} throwaway pages: each file after the ones it reads passes; one before, missing or on its line fails the build`,
    same(got, cases.map(([, w]) => w)), differs(got, cases.map(([, w]) => w)));
  const loaders = pages.filter(p => /\/js\/b2b-widget(\.[0-9a-f]{8})?\.js/.test(fs.readFileSync(p, 'utf8')));
  check(`...and every page in the tree that loads js/b2b-widget loads the four it reads first, from the same build (${loaders.length}: the demo)`,
    loaders.length === 1 && loaders.every(p => {
      const s = fs.readFileSync(p, 'utf8');
      const i = f => s.indexOf(`/js/${f}"`);
      return [F.math, F.bar, F.rank, F.strings].every(f => i(f) >= 0 && i(f) < i(F.widget));
    }));
}

finished = true;
if (failures) {
  console.error(`\nb2b-widget-test: ${failures} failure${failures === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('\nb2b-widget clean');

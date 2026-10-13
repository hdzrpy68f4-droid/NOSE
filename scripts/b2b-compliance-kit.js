#!/usr/bin/env node
'use strict';
/* NOSE for dispensaries - the compliance kit, from the Codespace.
 * PARSER-HANDOFF s14, "The compliance kit".
 *
 *   node scripts/b2b-compliance-kit.js
 *       the test store: b2b/demo/test-store.json, and the demo page's own
 *       made-up purchases (js/b2b-demo's example list)
 *   node scripts/b2b-compliance-kit.js --store <slug> --key npk_... --origin https://...
 *       a store: its public feed, the list every visitor's browser is given,
 *       and purchases made up from that list - never a shopper's
 *
 *   --release N    a release docs/B2B-RELEASES.md records (default: the newest)
 *   --site ORIGIN  where the store's feed and the published privacy page are
 *                  read (default https://nose-app.com)
 *   --out DIR      a folder under b2b-out/ (default b2b-out/<slug>/compliance-kit;
 *                  the test store's slug is test-store)
 *   --offline      the test store only: data.md from this checkout's privacy
 *                  page, saying it was not compared with the published one
 *
 * What a Florida dispensary needs to show the Department what NOSE's module
 * puts on its website, made from the real thing so it shows exactly what
 * ships:
 *
 *   - the PINNED RELEASE a store's page loads, built again from its commit by
 *     scripts/b2b-release.js's own build() and refused unless both files match
 *     the hashes docs/B2B-RELEASES.md records - the bytes a browser on the
 *     store's page accepts, and no others
 *   - in headless Chromium, on a blank stand-in for the store's page: the tag
 *     and the three CSP lines of docs/B2B-INTEGRATION.md, the attributes a
 *     store's page sets, strings="florida", and b2b-feed and b2b-vote stood
 *     in for on NOSE's side, answering as they do
 *   - every state - before a yes, the rail, the sold-out panel, a batch with
 *     no terpene panel, the vote, and the states that show the rest of the
 *     words - at phone and desktop widths, as PNGs of the widget alone, and
 *     a rail that scrolls sideways once more for each scroll until every
 *     card has been in view
 *   - strings.md: every string the widget showed - text, words read aloud,
 *     tooltips - with where it appears and where it comes from; every Florida
 *     string, rendered or not, with when the widget shows it; the store's
 *     own words apart, as the store's to clear
 *   - data.md: the privacy page's dispensary section as published, compared
 *     word for word with the page this checkout deploys
 *   - README.md: the index - what was rendered, from what, and what left the
 *     page while it ran
 *
 * IT REFUSES, and writes nothing, when:
 *   - a string on any screen comes from neither the Florida variant, nor the
 *     match labels and bar words js/b2b-strings lists as shown from other
 *     files, nor the store's catalog: a kit must account for every word
 *   - a release does not build to its recorded hashes, or its commit is not
 *     in this clone
 *   - the widget asks NOSE for anything but its script, its stylesheet, the
 *     feed and a vote; a request carries a purchased batch ID or day; the
 *     browser reaches any other origin; the store page's CSP is breached; a
 *     page error; the release's stylesheet does not apply
 *   - the published privacy section is not this checkout's, or cannot be
 *     read (unless --offline)
 *   - the folder is outside b2b-out/, b2b-out/ is not ignored by git, or the
 *     folder holds anything but an earlier kit, which it replaces
 *   - a secret key (nsk_) is given: the kit needs the public one
 *
 * NOTHING ABOUT A SHOPPER: the purchases are made up, and listed in the kit
 * as made up. It reads no database and no vote: a store's data enters only
 * as its public feed, fetched once with the store's own origin, as a
 * shopper's browser fetches it. It writes nothing in the repository outside
 * the kit's folder under b2b-out/, which git ignores - a store's kit is the
 * store's, and this repository is public. Prints the folder and one line a
 * screen, never a key in full.
 *
 * Needs Playwright with its Chromium, as the browser tests do:
 *   npm install --no-save playwright
 *   npx playwright install --with-deps chromium
 *
 * Aroma and flavour only.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const rel = require('./b2b-release.js');
const releases = require('../netlify/functions/lib/b2b-releases.js');
const { CATEGORIES, ROUTES } = require('../netlify/functions/lib/b2b-catalog-format.js');

const ROOT = path.resolve(__dirname, '..');
const USAGE = [
  'usage: node scripts/b2b-compliance-kit.js [--offline] [--release N] [--site ORIGIN] [--out DIR]',
  '       node scripts/b2b-compliance-kit.js --store <slug> --key npk_... --origin https://... [--release N] [--site ORIGIN] [--out DIR]'
].join('\n');
const SITE = 'https://nose-app.com';
const DEMO_SLUG = 'test-store';
const KIT_TITLE = '# Compliance kit';
const PUBLIC_KEY = /^npk_[0-9a-f]{64}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FEED_PATH = '/.netlify/functions/b2b-feed';
const VOTE_PATH = '/.netlify/functions/b2b-vote';
const VOTE_FIELDS = ['key', 'candidate', 'score', 'band', 'palateSize', 'vote'];
const CARDS_SHOWN = 12;   // the widget's RAIL_MAX
const HIDDEN_SHOWN = 'in the list that line opens - shown once it is opened';
const HIDDEN_READ = 'in the list that line opens - read aloud once it is opened';
const MARGIN = 16;        // the stand-in page's own padding, kept round each PNG
const TIMEOUT_MS = 15000;
const WIDTHS = Object.freeze({
  phone: Object.freeze({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }),
  desktop: Object.freeze({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
});
/* The stand-in store page: blank but for the widget. The widget takes its
   font and text colour from the page around it (css/b2b-widget); everything
   else it draws is its own. */
const STORE_CSS = 'html { background: #FFFFFF; }\n' +
  'body { margin: 0; color: #1D1D1F; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }\n' +
  'main { max-width: 1200px; margin: 0 auto; padding: 16px; }\n';

class Refusal extends Error {}
class Usage extends Error {}
const refuse = m => { throw new Refusal(m); };

/* Where each Florida string is shown - the condition, in the kit's words, so
   strings.md can say it for a string no screen of this store showed. Every
   key of js/b2b-strings' variants is here; the kit refuses a strings file
   with a key it cannot place. */
const WHEN = Object.freeze({
  consentButton: 'the opt-in, before the shopper has said yes: its one button',
  consentNote: 'the opt-in: the sentence under its button',
  railTitle: 'the rail: its heading, and the label of its list of cards',
  railEmpty: 'the rail, in place of cards, when no order in its category can be compared',
  railNone: 'the rail, in place of cards, when nothing available in its category can be compared with',
  soldOutTitle: 'the sold-out panel: its heading, naming the product the shopper orders most',
  soldOutLead: 'the sold-out panel: the line above its cards',
  soldOutNoPanel: 'the sold-out panel, in place of cards, when that product\'s most recent batch has no terpene panel available',
  soldOutNone: 'the sold-out panel, in place of cards, when nothing available can be compared with it',
  matchLine: 'each card of a batch with a terpene panel: its match label and number',
  matchAria: 'the same match, as it is read aloud',
  noPanel: 'a card of a batch with no terpene panel available, in place of a match and a bar',
  thc: 'each card: the catalog\'s THC figure',
  cbd: 'each card: the catalog\'s CBD figure',
  thcMissing: 'a card whose catalog line gives no THC figure',
  cbdMissing: 'a card whose catalog line gives no CBD figure',
  basisOne: 'the rail: the line that opens what it is based on, when that is one product',
  basisMany: 'the rail: the line that opens what it is based on, when that is several products',
  basisNone: 'the rail: that line, when no order in its category can be used',
  remove: 'what the rail is based on: the button beside each product used',
  removeAria: 'that button, as it is read aloud',
  removedTitle: 'what the rail is based on: the heading over products taken out of the palate',
  putBack: 'what the rail is based on: the button beside each product taken out',
  putBackAria: 'that button, as it is read aloud',
  notUsedTitle: 'what the rail is based on: the heading over orders not used',
  notUsedPanel: 'what the rail is based on: an order whose batch has no terpene panel available',
  notUsedOthersOne: 'what the rail is based on: one other order item not used',
  notUsedOthersMany: 'what the rail is based on: other order items not used, counted',
  method: 'under the rail\'s and the sold-out panel\'s cards',
  voteQuestion: 'the vote, after an order: its question',
  voteMatched: 'the vote: the match it asks about',
  voteUp: 'the vote: its first button',
  voteDown: 'the vote: its second button',
  voteThanks: 'the vote, once answered',
  categories: 'the line that opens what the rail is based on: the category, as {category}',
  months: 'that line: the month of the earliest order used, as {month}'
});

/* ------------------------------------------------------------- arguments */

function parseArgs(argv) {
  const o = { offline: false };
  const takes = new Set(['--store', '--key', '--origin', '--release', '--site', '--out']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--offline') { o.offline = true; continue; }
    if (!takes.has(a)) throw new Usage(`unknown argument: ${a}`);
    const v = argv[++i];
    if (v === undefined || v.startsWith('--')) throw new Usage(`${a} needs a value`);
    const k = a.slice(2);
    if (k in o) throw new Usage(`${a} given twice`);
    o[k] = v;
  }
  if (o.store === undefined && (o.key !== undefined || o.origin !== undefined)) throw new Usage('--key and --origin go with --store');
  if (o.store !== undefined) {
    if (o.key === undefined || o.origin === undefined) throw new Usage('--store needs --key (its public key) and --origin (an origin it allows)');
    if (o.offline) throw new Usage('--offline is for the test store: a store\'s feed is read from the site');
    if (!SLUG.test(o.store)) throw new Usage(`--store: "${o.store}" is not a store slug (lowercase letters, digits and single hyphens)`);
    if (/^nsk_/.test(o.key)) refuse('that is a secret key (nsk_): it goes nowhere but the store\'s own server. The kit needs the store\'s public key, npk_..., the one its page carries');
    if (!PUBLIC_KEY.test(o.key)) throw new Usage('--key: not a public key - npk_ and 64 hex characters');
    o.origin = httpsOrigin(o.origin, '--origin', false);
  }
  if (o.release !== undefined && !/^[1-9][0-9]{0,5}$/.test(o.release)) throw new Usage('--release: a release number, 1 or more');
  o.site = o.site === undefined ? SITE : httpsOrigin(o.site, '--site', true);
  o.slug = o.store === undefined ? DEMO_SLUG : o.store;
  return o;
}

/* An origin exactly as a browser sends one: https, a host, a port if any -
   nothing else. --site may also be a loopback http origin, for the tests. */
function httpsOrigin(v, flag, loopback) {
  let u;
  try { u = new URL(v); } catch { throw new Usage(`${flag}: not an address`); }
  const local = loopback && u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname);
  if ((u.protocol !== 'https:' && !local) || u.origin !== v) throw new Usage(`${flag}: an origin as a browser sends it, like https://shop.example - scheme and host only`);
  return u.origin;
}

/* ---------------------------------------------------------------- folder */

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function kitFolder(root, opts) {
  const base = path.join(root, 'b2b-out');
  const dir = path.resolve(root, opts.out === undefined ? path.join('b2b-out', opts.slug, 'compliance-kit') : opts.out);
  const r = path.relative(base, dir);
  if (!r || r.startsWith('..') || path.isAbsolute(r)) refuse(`the kit writes only under b2b-out/, which git ignores - not ${path.relative(root, dir) || '.'}`);
  try { git(root, ['check-ignore', '-q', path.relative(root, path.join(dir, 'README.md'))]); }
  catch { refuse('b2b-out/ is not ignored by git here: a store\'s kit is the store\'s, and this repository is public'); }
  if (fs.existsSync(dir)) {
    const entries = fs.readdirSync(dir);
    const readme = path.join(dir, 'README.md');
    const isKit = fs.existsSync(readme) && fs.readFileSync(readme, 'utf8').startsWith(KIT_TITLE)
      && entries.every(f => /^[0-9A-Za-z-]+\.(md|png)$/.test(f) && fs.statSync(path.join(dir, f)).isFile());
    if (!isKit) refuse(`${path.relative(root, dir)} already holds something that is not an earlier kit - move it, or name another folder with --out`);
  }
  return dir;
}

/* ---------------------------------------------------------------- release */

function releaseOf(root, wanted) {
  let rows;
  try { rows = rel.readRecord(root); } catch (e) { if (e instanceof rel.Refusal) refuse(e.message); throw e; }
  if (!rows.length) refuse(`${rel.DOC} records no release yet - a store's page pins one, so there is nothing to show`);
  const row = wanted === undefined ? rows[rows.length - 1] : rows.find(r => r.version === wanted);
  if (!row) refuse(`${rel.DOC} records no release ${wanted} - it records ${rows.map(r => r.version).join(', ')}`);
  let source;
  try { source = rel.commitSource(row.commit, root); }
  catch { refuse(`release ${row.version}'s commit ${row.commit.slice(0, 7)} is not in this clone - run: git fetch origin main`); }
  let built;
  try { built = rel.build({ version: row.version, source }); } catch (e) { if (e instanceof rel.Refusal) refuse(`release ${row.version}: ${e.message}`); throw e; }
  if (built.sri.js !== row.js || built.sri.css !== row.css) {
    refuse(`release ${row.version}, built again from ${row.commit.slice(0, 7)}, does not match ${rel.DOC}: a browser on a store's page would refuse these bytes`);
  }
  let sameAsTree = false;
  try { sameAsTree = rel.sameFiles(built, rel.treeSource(root)); } catch {}
  return { row, built, newest: row === rows[rows.length - 1], sameAsTree };
}

/* ------------------------------------------------------------- the store */

function demoFeed(root) {
  const file = path.join(root, 'b2b/demo/test-store.json');
  let feed;
  try { feed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { refuse('b2b/demo/test-store.json is missing or not JSON - run: node scripts/b2b-demo-feed.js'); }
  return feedShape(feed, 'b2b/demo/test-store.json');
}
function demoKey(root) {
  const m = /<nose-matches\b[^>]*\bkey="(npk_[0-9a-f]{64})"/.exec(fs.readFileSync(path.join(root, 'b2b/demo/index.html'), 'utf8'));
  if (!m) refuse('b2b/demo/index.html carries no public key on its <nose-matches>');
  return m[1];
}
function feedShape(feed, from) {
  const ok = feed && typeof feed === 'object' && feed.store && typeof feed.store === 'object' && Array.isArray(feed.batches)
    && feed.batches.length > 0 && feed.batches.every(b => b && typeof b === 'object' && typeof b.batch_id === 'string' && typeof b.product_id === 'string');
  if (!ok) refuse(`${from} is not a feed with batches - nothing to show`);
  return feed;
}

/* The store's feed, as a shopper's browser fetches it: the public key alone,
   and the store's own origin. No cookie, no referrer, no redirect. */
async function storeFeed(opts, fetchImpl) {
  const url = `${opts.site}${FEED_PATH}?key=${opts.key}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res, text;
  try {
    res = await fetchImpl(url, { method: 'GET', headers: { Origin: opts.origin, Accept: 'application/json' }, redirect: 'error', signal: ctl.signal });
    text = await res.text();
  } catch { refuse(`could not read the store's feed from ${opts.site} - check the connection, then run again`); }
  finally { clearTimeout(timer); }
  if (res.status !== 200) {
    refuse(`the store's feed answered ${res.status}` + (res.status === 403 ? ': the key is not working, or that origin is not one of the store\'s' : res.status === 404 ? ': B2B is switched off on that site' : ''));
  }
  let feed;
  try { feed = JSON.parse(text); } catch { refuse('the store\'s feed is not JSON'); }
  return feedShape(feed, 'the store\'s feed');
}

/* The demo page's own example list, [batch ID, days back], read out of the
   built js/b2b-demo so the kit uses the very purchases the demo types in. */
function demoPurchases(root) {
  const files = fs.readdirSync(path.join(root, 'js')).filter(f => /^b2b-demo\.[0-9a-f]{8}\.js$/.test(f));
  if (files.length !== 1) refuse(`expected one built js/b2b-demo.<hash>.js, found ${files.length} - run: bash build.sh`);
  const m = /const EXAMPLE = (\[[\s\S]*?\]);/.exec(fs.readFileSync(path.join(root, 'js', files[0]), 'utf8'));
  let list;
  try { list = JSON.parse(m[1].replace(/'/g, '"')); } catch { list = null; }
  if (!Array.isArray(list) || !list.length || !list.every(x => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && Number.isInteger(x[1]) && x[1] >= 0)) {
    refuse(`js/${files[0]} no longer holds the example purchase list in the shape the kit reads`);
  }
  return { list, from: `js/${files[0]}` };
}

/* Purchases made up from a store's own list, by the demo's pattern: the
   shopper's usual, ordered three times and now out of stock; two more of its
   category; one of that category refused, and one with no reading; the first
   of each other category; a batch the store never listed; and the usual again
   from before the window. Days back from today, as the demo dates its list.
   Never a shopper's: a rule over the feed every visitor is given. */
function madeUpPurchases(feed) {
  const listed = feed.batches.filter(b => CATEGORIES.includes(b.category) && ROUTES.includes(b.route));
  const readable = b => b.usable === true && b.terps && typeof b.terps === 'object' && Object.keys(b.terps).length > 0;
  const usual = listed.find(b => !b.in_stock && readable(b) && listed.some(x => x.category === b.category && x.in_stock && readable(x)))
    || listed.find(b => b.in_stock && readable(b)) || listed.find(readable);
  if (!usual) refuse('the store\'s feed has no batch with a terpene panel NOSE read - the widget would compare nothing');
  const out = [[usual.batch_id, 11], [usual.batch_id, 40], [usual.batch_id, 75]];
  const same = listed.filter(b => b.category === usual.category && b.product_id !== usual.product_id);
  same.filter(readable).slice(0, 2).forEach((b, i) => out.push([b.batch_id, [117, 152][i]]));
  const refused = same.find(b => b.usable === false);
  if (refused) out.push([refused.batch_id, 173]);
  const unread = same.find(b => b.usable === null);
  if (unread) out.push([unread.batch_id, 236]);
  CATEGORIES.filter(c => c !== usual.category).forEach((c, i) => {
    const b = listed.find(x => x.category === c && readable(x));
    if (b) out.push([b.batch_id, [20, 215, 250][i]]);
  });
  let missing = 'NOT-LISTED';
  while (feed.batches.some(b => b.batch_id === missing)) missing += '-X';
  out.push([missing, 271]);
  const months = Number.isInteger(feed.store.window_months) ? feed.store.window_months : 12;
  out.push([usual.batch_id, months * 31 + 60]);
  return out;
}

const dayBack = (now, back) => new Date(now.getTime() - back * 86400000).toISOString().slice(0, 10);

/* --------------------------------------------------- the two stand-ins */

function listen(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => handler(req, res, Buffer.concat(chunks).toString('utf8')));
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/* The stand-in store page: the integration guide's tag for the release, the
   element with a store's attributes, and nothing else; and its CSP, the
   guide's three lines with NOSE's origin for nose-app.com's and the store's
   own 'self' for its stylesheet. */
function storePage(attrs, { nose, version, integrity }) {
  const value = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n` +
    `<title>A dispensary's page - a stand-in</title><link rel="stylesheet" href="/store.css"></head>\n<body><main>\n` +
    `<nose-matches${Object.entries(attrs).map(([k, v]) => ` ${k}="${value(v)}"`).join('')}></nose-matches>\n</main>\n` +
    `<script src="${nose}${releases.releasePath(version, releases.JS)}" integrity="${integrity}" crossorigin="anonymous" referrerpolicy="no-referrer" defer></script>\n` +
    '</body></html>\n';
}
function storeCsp(guide, nose) {
  const lines = [...guide.matchAll(/^(script-src|style-src|connect-src) +(.+)$/gm)].map(m => [m[1], m[2].trim().split(/ +/)]);
  if (lines.length !== 3) refuse('docs/B2B-INTEGRATION.md no longer gives its three CSP lines in the form the kit reads');
  return lines.map(([d, src]) => [d, ...(d === 'connect-src' ? [] : ["'self'"]), ...src.map(x => x.replace(SITE, nose))].join(' ')).join('; ');
}

/* --------------------------------------------- what runs in the page */

/* Which store page shows which state, decided by the release's own engine
   (window.NoseRank), as the widget would decide it. Runs in the page. */
function chooseInPage({ feed, purchases, categories, routes, cards }) {
  const R = window.NoseRank;
  const index = new Map();
  for (const b of feed.batches) if (b && typeof b.batch_id === 'string' && !index.has(b.batch_id)) index.set(b.batch_id, b);
  const mine = c => purchases.filter(p => { const b = index.get(p.batchId); return b && b.category === c; });
  const rail = (c, rts) => {
    const palate = R.palateFrom(feed, mine(c), []);
    return { used: palate.basis.used.length, ranked: R.rank(feed, palate, { category: c, routes: rts }).slice(0, cards) };
  };
  let railCat = null, most = 0;
  for (const c of categories) { const n = mine(c).length; if (n > most && rail(c, routes).used > 0) { most = n; railCat = c; } }
  const noPanelCat = categories.find(c => { const r = rail(c, routes); return r.used > 0 && r.ranked.some(e => e.unscored); }) || null;
  /* A category in stock with no order in it - or, when the shopper has an
     order in every one, the last in stock but the rail's, its orders left
     out of that screen's list */
  const stocked = categories.filter(c => feed.batches.some(b => b.category === c && b.in_stock));
  let emptyCat = stocked.find(c => mine(c).length === 0) || null, emptyDrops = false;
  if (!emptyCat) { emptyCat = [...stocked].reverse().find(c => c !== railCat) || null; emptyDrops = !!emptyCat; }
  let noneRoutes = null;
  if (railCat) {
    const own = new Set(feed.batches.filter(b => b.category === railCat).map(b => b.route));
    const rest = routes.filter(r => !own.has(r));
    if (rest.length < routes.length && rail(railCat, rest).ranked.length === 0) noneRoutes = rest;
  }
  const sold = R.soldOut(feed, purchases, { removed: [], routes });
  const order = purchases.map((p, i) => ({ p, i })).filter(x => index.has(x.p.batchId))
    .sort((a, b) => (a.p.day < b.p.day ? 1 : a.p.day > b.p.day ? -1 : a.i - b.i));
  let vote = null;
  for (const { p } of order) {
    const listed = feed.batches.find(b => b && b.product_id === index.get(p.batchId).product_id);
    if (R.voteScore(feed, mine(listed.category), listed.product_id, { removed: [] })) { vote = { product: listed.product_id, name: listed.name }; break; }
  }
  return { railCat, noPanelCat, emptyCat, emptyDrops, noneRoutes, soldOut: sold ? sold.batch.name : null, vote };
}

/* Every string in the widget's shadow root - text, labels read aloud,
   tooltips - with how it is presented and where. Runs in the page. */
function stringsInPage({ HIDDEN_SHOWN, HIDDEN_READ }) {
  const host = document.querySelector('nose-matches');
  const root = host && host.shadowRoot;
  if (!root) return [];
  const cards = [...root.querySelectorAll('.nm-card')];
  const where = el => {
    const card = el.closest('.nm-card');
    const pre = card ? `card ${cards.indexOf(card) + 1}: ` : '';
    if (el.closest('.nm-consent')) return el.closest('button') ? 'the opt-in button' : 'the opt-in, under its button';
    if (el.closest('.profile-segment')) return `${pre}the aroma bar, one family's segment`;
    if (el.closest('.profile-bar')) return `${pre}the aroma bar`;
    if (el.closest('.nm-name')) return `${pre}product name${el.closest('a') ? ', linked to the store\'s product page' : ''}`;
    if (el.closest('.nm-brand')) return `${pre}brand`;
    if (el.closest('.nm-match')) return `${pre}match`;
    if (el.closest('.nm-nopanel')) return `${pre}in place of a match and a bar`;
    if (el.closest('.nm-facts')) return `${pre}THC and CBD`;
    if (el.closest('.nm-cards')) return 'the list of cards';
    if (el.closest('.nm-basis summary')) return 'the line that opens what it is based on';
    if (el.closest('.nm-basis-title')) return 'what it is based on: a heading';
    if (el.closest('.nm-basis button')) return 'what it is based on: a button';
    if (el.closest('.nm-basis-name')) return 'what it is based on: an order';
    if (el.closest('.nm-title')) return 'the heading';
    if (el.closest('.nm-question')) return 'the vote: its question';
    if (el.closest('.nm-vote-buttons')) return 'the vote: a button';
    if (el.closest('.nm-thanks')) return 'the vote, once answered';
    if (el.closest('.nm-vote .nm-lead')) return 'the vote: the match it asks about';
    if (el.closest('.nm-lead')) return 'the line above the cards';
    if (el.closest('.nm-empty')) return 'in place of cards';
    if (el.closest('.nm-method')) return 'the note under the cards';
    return el.localName;
  };
  /* A closed <details> keeps its contents from sight and from screen
     readers alike, so the list behind "Based on ..." is said first. */
  const how = (el, attr) => {
    const d = el.closest('details');
    if (d && !d.open && !el.closest('summary')) return attr ? HIDDEN_READ : HIDDEN_SHOWN;
    if (attr === 'title') return 'tooltip';
    if (attr) return 'read aloud, as its label';
    if (el.closest('.nm-sr')) return 'read aloud only';
    if (el.closest('[aria-hidden="true"]') || el.closest('[role="img"]')) return 'shown, not read aloud';
    return 'shown';
  };
  const out = [];
  const card = el => { const c = el.closest('.nm-card'); return c ? cards.indexOf(c) + 1 : null; };
  const walk = n => {
    if (n.nodeType === 3) {
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (t) out.push({ text: t, how: how(n.parentElement), where: where(n.parentElement), card: card(n.parentElement) });
      return;
    }
    if (n.nodeType !== 1 || n.localName === 'link' || n.localName === 'style') return;
    for (const a of ['aria-label', 'title', 'alt', 'placeholder']) {
      if (n.hasAttribute(a)) out.push({ text: n.getAttribute(a).replace(/\s+/g, ' ').trim(), how: how(n, a), where: where(n), card: card(n) });
    }
    n.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return out;
}

/* The first list of cards: how far it scrolls, and which cards are at least
   half in view. Runs in the page. */
function cardsInViewInPage() {
  const root = document.querySelector('nose-matches').shadowRoot;
  const list = root.querySelector('.nm-cards');
  if (!list) return null;
  const box = list.getBoundingClientRect();
  const inView = [...list.querySelectorAll('.nm-card')].map((c, i) => {
    const r = c.getBoundingClientRect();
    const seen = Math.max(0, Math.min(r.right, box.right) - Math.max(r.left, box.left));
    return seen >= r.width / 2 ? i + 1 : null;
  }).filter(Boolean);
  return { left: list.scrollLeft, max: list.scrollWidth - list.clientWidth, step: list.clientWidth, inView };
}

/* A section of the privacy page as Markdown, the same rules for the copy
   this checkout deploys and the published one. Runs in the page. */
function privacyInPage(base) {
  const art = document.getElementById('dispensaries');
  if (!art) return null;
  const esc = s => s.replace(/([\\`*[\]<>])/g, '\\$1');
  const inline = n => {
    if (n.nodeType === 3) return esc(n.textContent.replace(/\s+/g, ' '));
    if (n.nodeType !== 1) return '';
    const inner = () => [...n.childNodes].map(inline).join('');
    switch (n.localName) {
      case 'strong': case 'b': return `**${inner().trim()}**`;
      case 'em': case 'i': return `*${inner().trim()}*`;
      case 'code': return '`' + n.textContent + '`';
      case 'br': return '  \n';
      case 'a': {
        const href = n.getAttribute('href');
        return `[${inner().trim()}](${/^[a-z][a-z0-9+.-]*:/i.test(href) ? href : new URL(href, base).href})`;
      }
      default: return inner();
    }
  };
  const tidy = s => s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
  const blocks = n => {
    const out = [];
    for (const c of n.children) {
      const tag = c.localName;
      if (/^h[1-6]$/.test(tag)) out.push(`${'#'.repeat(Number(tag[1]))} ${tidy(inline(c))}`);
      else if (tag === 'p') out.push(tidy(inline(c)));
      else if (tag === 'ul' || tag === 'ol') out.push([...c.children].map((li, i) => `${tag === 'ul' ? '-' : `${i + 1}.`} ${tidy(inline(li))}`).join('\n'));
      else if (['div', 'section', 'article', 'header', 'footer'].includes(tag)) out.push(...blocks(c));
      else if (tidy(inline(c))) out.push(tidy(inline(c)));
    }
    return out.filter(Boolean);
  };
  const section = blocks(art);
  const elsewhere = [];
  for (const n of document.querySelectorAll('main p, main li')) {
    if (art.contains(n) || !/dispensar/i.test(n.textContent)) continue;
    const a = n.closest('article, section');
    const h = a && a.querySelector('h2');
    elsewhere.push({ heading: h ? tidy(inline(h)) : '', text: (n.localName === 'li' ? '- ' : '') + tidy(inline(n)) });
  }
  return { section, elsewhere };
}

/* --------------------------------------------------------------- tracing */

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = list => `(?:${[...new Set(list)].sort((a, b) => b.length - a.length).map(reEsc).join('|')})`;

/* Each string traced to where its words come from: the Florida variant, the
   words js/b2b-strings lists as shown from other files, or the catalog. */
function tracer(S, feed) {
  const F = S.florida, O = S.SHOWN_FROM_OTHER_FILES;
  const names = feed.batches.map(b => b.name).filter(x => typeof x === 'string' && x);
  const brands = feed.batches.map(b => b.brand).filter(x => typeof x === 'string' && x);
  const figures = feed.batches.flatMap(b => [b.thc_percent, b.cbd_percent]).filter(v => typeof v === 'number' && Number.isFinite(v)).map(String);
  const ph = {
    label: alt(O.matchLabels), shown: '(?:100|[1-9]?[0-9])', n: '[1-9][0-9]*',
    name: names.length ? alt(names) : '(?!)', category: alt(Object.values(F.categories)),
    month: `${alt(F.months)} [0-9]{4}`, value: figures.length ? alt(figures) : '(?!)'
  };
  const asRe = t => new RegExp('^' + t.split(/(\{\w+\})/).map(x => (/^\{\w+\}$/.test(x) ? (ph[x.slice(1, -1)] || '(?!)') : reEsc(x))).join('') + '$');
  const fl = Object.entries(F).filter(([, t]) => typeof t === 'string').map(([key, t]) => ({ key, re: asRe(t) }));
  const df = Object.entries(S.default).filter(([, t]) => typeof t === 'string').map(([key, t]) => ({ key, re: asRe(t) }));
  const fam = `${alt(O.familyLabels)} [0-9]{1,3}%`;
  const other = [
    { from: 'matchBand()', re: new RegExp(`^${alt(O.matchLabels)}$`) },
    { from: 'the aroma bar', re: new RegExp(`^${reEsc(O.barPrefix)}(?:${fam}(?:, ${fam})*|${reEsc(O.barNone)})$`) },
    { from: 'the aroma bar', re: new RegExp(`^${fam}$`) },
    { from: 'the aroma bar', re: new RegExp(`^${alt(O.familyLabels)}$`) },
    { from: 'the catalog', re: new RegExp(`^${alt([...names, ...brands])}$`) },
    { from: 'the catalog', re: new RegExp(`^${names.length ? alt(names) : '(?!)'} · ${alt([...names, ...brands])}$`) }
  ];
  return text => {
    const f = fl.find(t => t.re.test(text));
    if (f) return { from: `florida.${f.key}`, key: f.key };
    const o = other.find(t => t.re.test(text));
    if (o) return { from: o.from };
    const d = df.find(t => t.re.test(text));
    return { from: null, defaultKey: d ? d.key : null };
  };
}

/* --------------------------------------------------------------- writing */

const cell = s => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const code = s => '`' + String(s).replace(/`/g, '\'') + '`';
const pad = n => String(n).padStart(2, '0');
const human = list => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
const NOT_RENDERED = '**not rendered with this store**';
const screens = set => (set && set.size ? [...set].sort((a, b) => a - b).map(pad).join(', ') : NOT_RENDERED);

function provenance(k) {
  return [
    `Release ${k.release.row.version} of NOSE's dispensary widget, \`<nose-matches>\` - the version a store's page pins: ` +
      `\`nose-matches.js\` ${code(k.release.row.js)} and \`nose-matches.css\` ${code(k.release.row.css)}, built again from commit ` +
      `${code(k.release.row.commit)} and checked against \`docs/B2B-RELEASES.md\`.`,
    `Words: the Florida variant, \`strings="florida"\`. Store: ${k.storeLine}.`,
    `Made ${k.day} (UTC) in Chromium ${k.chromium} by \`scripts/b2b-compliance-kit.js\` at NOSE commit ${code(k.head)}.`
  ].join('\n');
}

function readme(k) {
  const L = [];
  L.push(`${KIT_TITLE} - ${k.storeName}, Florida words`, '');
  L.push(provenance(k), '');
  L.push('Prepared for a Florida dispensary (an MMTC) to show the Florida Department of Health\'s Office of Medical Marijuana Use what NOSE\'s module puts on its website. ' +
    'It records what the module shows and what it sends; it is not legal advice. The dispensary and its counsel decide what to submit.', '');
  L.push('## What is in this folder', '');
  L.push('| File | What it is |', '|---|---|');
  L.push('| `README.md` | this index |');
  L.push('| `strings.md` | every string the widget showed, where it appears and where its words come from; every Florida string, with when the widget shows it; the store\'s own words apart |');
  L.push(`| \`data.md\` | the privacy page's dispensary section, ${k.offline ? 'as this checkout deploys it - not compared with the published page (`--offline`)' : 'as published'} |`);
  for (const s of k.states.filter(x => x.rendered)) L.push(`| ${s.files.map(code).join(', ')} | ${cell(s.title)} |`);
  L.push('');
  L.push('## The screens', '');
  L.push('Each PNG is the widget alone, as the browser drew it, at 2x: phone 390 px wide, desktop 1280 px. ' +
    'Where a list of cards scrolls sideways, the numbered PNGs after the first show it scrolled on, until every card has been in view.', '');
  L.push('| # | State | What the store\'s page set | Phone | Desktop |', '|---|---|---|---|---|');
  for (const s of k.states) {
    if (!s.rendered) { L.push(`| ${pad(s.n)} | ${cell(s.title)} | not shown with this store: ${cell(s.why)} | - | - |`); continue; }
    L.push(`| ${pad(s.n)} | ${cell(s.title)} | ${cell(s.set)} | ${s.byWidth.phone.map(code).join(' ')} | ${s.byWidth.desktop.map(code).join(' ')} |`);
  }
  L.push('');
  L.push('Not drawn, because the widget shows nothing: a shopper who said no (`consent="denied"`), and the control group of a pilot (`group="control"`). ' +
    'In both it loads nothing, asks NOSE for nothing and sends nothing.', '');
  L.push('## What the widget was given', '');
  L.push(`- **The release**: ${k.release.newest ? 'the newest recorded' : `release ${k.release.row.version}, chosen with --release`}. ` +
    (k.release.sameAsTree ? 'The widget files in this checkout are the release\'s, byte for byte.' :
      `The widget files in this checkout differ from the release's: what reaches a store's page pinning release ${k.release.row.version} is the release, shown here; a change reaches it only in a new release.`));
  L.push(`- **The store's page**: a blank stand-in carrying the integration guide's tag - the release's address, its \`integrity\` hash, \`crossorigin="anonymous"\`, \`referrerpolicy="no-referrer"\`, \`defer\` - under the guide's three CSP lines. ` +
    'The widget takes its font and text colour from the page around it; here that is the system sans-serif and near-black. Its layout, colours and words are its own.');
  L.push(`- **The store**: ${k.storeLine}.`);
  L.push(`- **The purchases**: made up, never a shopper's - ${k.purchaseSource}. Each is a batch ID and a day, UTC, counted back from ${k.day}:`, '');
  L.push('| Batch ID | Day | Product |', '|---|---|---|');
  for (const p of k.purchases) L.push(`| ${code(p.batchId)} | ${p.day} | ${cell(k.nameOf(p.batchId))} |`);
  L.push('');
  L.push(`- **The shopper's routes**: ${human(ROUTES.map(code))}, unless a screen says otherwise.`, '');
  L.push('## What left the page', '');
  L.push('Every request the widget made, recorded by the stand-ins of NOSE\'s functions. A vote names the one product its question was about, as the privacy page says; ' +
    'beyond that, no request carried anything from the purchase list - no batch ID, no day - and none carried a cookie or the page\'s address. The browser reached no other origin.', '');
  L.push('| Request | How many | What it carried |', '|---|---|---|');
  for (const r of k.requests) L.push(`| ${cell(r.what)} | ${r.count} | ${cell(r.carried)} |`);
  L.push('');
  L.push('`data.md` sets out what NOSE keeps of these, in the privacy page\'s own words.');
  return L.join('\n') + '\n';
}

function stringsDoc(k) {
  const L = [];
  L.push('# Every string the widget shows - Florida words', '');
  L.push(provenance(k), '');
  L.push('"Shown in" names the screens of `README.md` by number. "How": shown, read aloud only (to a screen reader), read aloud as an element\'s label, a tooltip, or shown but not read aloud (the screen reader is given the fuller version instead).', '');

  L.push('## 1. NOSE\'s words: the Florida variant of `js/b2b-strings`', '');
  L.push('Every string of the variant, in the file\'s order, as the release carries it. `{placeholders}`: `{name}` a product name from the catalog, `{value}` a THC or CBD figure from the catalog, `{label}` a match label (section 2) and `{shown}` its number, 0 to 100, `{n}` a count, `{category}` and `{month}` the words below the table.', '');
  L.push('| Key | As written | Shown in | Where the widget shows it |', '|---|---|---|---|');
  for (const [key, t] of Object.entries(k.S.florida)) {
    if (typeof t !== 'string') continue;
    const seen = k.keySeen.get(key);
    L.push(`| ${code(key)} | ${cell(t)} | ${screens(seen)} | ${cell(WHEN[key])} |`);
  }
  const basis = new Set([...(k.keySeen.get('basisOne') || []), ...(k.keySeen.get('basisMany') || [])]);
  L.push(`| ${code('categories')} | ${cell(Object.values(k.S.florida.categories).join(', '))} | ${screens(basis)} | ${cell(WHEN.categories)} |`);
  L.push(`| ${code('months')} | ${cell(k.S.florida.months.join(', '))} | ${screens(basis)} | ${cell(WHEN.months)} |`);
  L.push('');
  const unseen = Object.entries(k.S.florida).filter(([key, t]) => typeof t === 'string' && !k.keySeen.has(key)).map(([key]) => key);
  if (unseen.length) L.push(`${unseen.length} of these strings no screen of this store showed: ${human(unseen.map(code))}. The widget shows each only in the condition its row gives; the words are exactly as written here.`, '');

  L.push('## 2. NOSE\'s words from its other files', '');
  L.push('`js/b2b-strings` lists these as shown by the widget and decided elsewhere, the same in both variants.', '');
  L.push('| Words | From | How | Shown in |', '|---|---|---|---|');
  const O = k.S.SHOWN_FROM_OTHER_FILES;
  for (const label of O.matchLabels) L.push(`| ${cell(label)} | the match label, \`matchBand()\` in \`js/match-math\` - inside \`matchLine\`, \`matchAria\` and \`voteMatched\` | shown and read aloud | ${screens(k.labelSeen.get(label))} |`);
  L.push(`| ${cell(O.barPrefix)}<family> <share>%, ... | the aroma bar, \`renderBar()\` in \`js/aroma-bar\` - each family over 0.1% and its share of the profile | read aloud, as the bar's label | ${screens(k.barSeen)} |`);
  L.push(`| ${cell(O.barPrefix + O.barNone)} | the same, for a profile with no values: the widget draws a bar only for a batch with a terpene panel | read aloud, as the bar's label | ${NOT_RENDERED} |`);
  L.push(`| <family> <share>% | the same: each segment | tooltip | ${screens(k.barSeen)} |`);
  L.push(`| ${cell(O.familyLabels.join(', '))} | the same: a segment wide enough shows its family | shown, not read aloud | ${screens(k.barSeen)} |`);
  L.push(`| \` · \` | the widget, joining a product's name and brand in what the rail is based on | shown | ${screens(k.joinSeen)} |`);
  L.push('');

  L.push('## 3. The store\'s words: its catalog', '');
  L.push('Product names, brands and THC and CBD figures, as the store\'s catalog gives them. NOSE shows them as written and does not review them: they are the store\'s to clear. Every product the widget showed:', '');
  L.push('| Batch | Name | Brand | THC | CBD | Shown in |', '|---|---|---|---|---|---|');
  for (const b of k.feed.batches) {
    const seen = k.batchSeen.get(b.batch_id);
    if (!seen) continue;
    const fig = v => (typeof v === 'number' ? `${v}%` : 'not listed');
    L.push(`| ${code(b.batch_id)} | ${cell(b.name)} | ${cell(b.brand || '-')} | ${fig(b.thc_percent)} | ${fig(b.cbd_percent)} | ${screens(seen)} |`);
  }
  L.push('');

  L.push('## 4. Screen by screen', '');
  L.push('Every string on each screen, in the order the page holds it. The phone and desktop screens hold the same strings; a card\'s row names the PNGs that show that card.', '');
  for (const s of k.states.filter(x => x.rendered)) {
    L.push(`### ${pad(s.n)} · ${s.title}`, '');
    L.push(`${cell(s.set)}. ${s.files.map(code).join(', ')}`, '');
    L.push('| # | Text | How | Where | From |', '|---|---|---|---|---|');
    s.strings.forEach((x, i) => {
      const files = x.card ? [...(s.cardFiles.phone[x.card] || []), ...(s.cardFiles.desktop[x.card] || [])] : [];
      L.push(`| ${i + 1} | ${cell(x.text)} | ${cell(x.how)} | ${cell(x.where)}${files.length ? ` (${files.map(code).join(', ')})` : ''} | ${cell(x.from)} |`);
    });
    L.push('');
  }

  L.push('## 5. Not shown', '');
  L.push('- A shopper who said no, and a pilot\'s control group: the widget shows nothing, so there is no string to list.');
  for (const s of k.states.filter(x => !x.rendered)) L.push(`- Screen ${pad(s.n)}, ${s.title.toLowerCase()}: not with this store - ${s.why}.`);
  return L.join('\n') + '\n';
}

function dataDoc(k) {
  const L = [];
  L.push('# The privacy page\'s dispensary section, as published', '');
  L.push(k.privacy.how, '');
  L.push(`Its text follows, converted to Markdown and otherwise as the page has it: headings, paragraphs, bold and links. Links point where the page's do, on ${k.site}.`, '');
  L.push('---', '');
  L.push(k.privacy.section.join('\n\n'), '');
  L.push('---', '');
  L.push('## Elsewhere on the same page', '');
  L.push('Every other paragraph or list item of the page that names dispensaries, under the heading of its part of the page.', '');
  let last = null;
  for (const e of k.privacy.elsewhere) {
    if (e.heading !== last) { L.push(`### ${e.heading}`, ''); last = e.heading; }
    L.push(e.text, '');
  }
  return L.join('\n').replace(/\n+$/, '\n');
}

/* ------------------------------------------------------------------ main */

function loadPlaywright(root) {
  for (const id of ['playwright', '@playwright/test']) {
    try { return require(require.resolve(id, { paths: [root, ROOT] })); } catch {}
  }
  try {
    const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return require(path.join(g, 'playwright'));
  } catch {}
  refuse('Playwright is not installed - run: npm install --no-save playwright && npx playwright install --with-deps chromium');
}

async function main(argv = process.argv.slice(2), { root = ROOT, out = console.log, err = console.error, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) {
    if (e instanceof Usage) { err(e.message); err(USAGE); return 2; }
    if (e instanceof Refusal) { err(`REFUSED - ${e.message}`); return 1; }
    throw e;
  }
  let browser = null, staging = null;
  const servers = [], made = [];
  try {
    const target = kitFolder(root, opts);
    const release = releaseOf(root, opts.release);
    const playwright = loadPlaywright(root);
    const day = now.toISOString().slice(0, 10);
    let head = git(root, ['rev-parse', '--short=7', 'HEAD']).trim();
    if (git(root, ['status', '--porcelain']).trim()) head += ', with changes not committed';

    /* the store, its key and the made-up shopper */
    let feed, key, storeName, storeLine, list, purchaseSource;
    if (opts.store === undefined) {
      feed = demoFeed(root);
      key = demoKey(root);
      const demo = demoPurchases(root);
      list = demo.list;
      storeName = 'the NOSE test store';
      storeLine = `the demo's test store, \`b2b/demo/test-store.json\` - made-up products, brands, links, stock and THC and CBD figures, each terpene panel a real lab report's as NOSE read it; ${feed.batches.length} batches`;
      purchaseSource = `the demo page's own example list (\`${demo.from}\`)`;
    } else {
      feed = await storeFeed(opts, fetchImpl);
      key = opts.key;
      list = madeUpPurchases(feed);
      storeName = `store ${opts.store}`;
      storeLine = `\`${opts.store}\`'s public feed, the list every visitor's browser is given, read ${day} from ${opts.site} with the store's origin ${opts.origin}; ${feed.batches.length} batches`;
      purchaseSource = 'made up from the store\'s own list by the kit\'s rule (the demo\'s pattern: a usual ordered three times, more of its category, one of each other category, a batch the store never listed and one from before the window)';
    }
    const purchases = list.map(([batchId, back]) => ({ batchId, day: dayBack(now, back) }));
    const byId = new Map();   // the first of a batch ID listed twice, as the widget takes it
    for (const b of feed.batches) if (!byId.has(b.batch_id)) byId.set(b.batch_id, b);
    const nameOf = id => (byId.has(id) ? byId.get(id).name : 'not in the store\'s list');

    /* NOSE's side: the release, the feed and the vote, as the functions answer */
    let STORE = null;
    const seen = [];
    const votes = [];
    const nose = await listen((req, res, body) => {
      const u = new URL(req.url, 'http://x');
      seen.push({ side: 'nose', method: req.method, url: req.url, headers: req.headers, body });
      const origin = req.headers.origin;
      const file = releases.parsePath(u.pathname);
      if (file && file.version === release.row.version && !u.search && (req.method === 'GET' || req.method === 'HEAD')) {
        res.writeHead(200, releases.headers(file.file));
        res.end(req.method === 'HEAD' ? undefined : file.file === releases.JS ? release.built.js : release.built.css);
        return;
      }
      if (u.pathname === FEED_PATH && req.method === 'GET' && u.search === `?key=${key}` && origin === STORE) {
        res.writeHead(200, { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'public, max-age=60',
          'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
        res.end(JSON.stringify(feed));
        return;
      }
      if (u.pathname === VOTE_PATH && req.method === 'POST' && !u.search && origin === STORE) {
        votes.push(body);
        res.writeHead(204, { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });
        res.end();
        return;
      }
      res.writeHead(404, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    });
    servers.push(nose);
    const NOSE = `http://127.0.0.1:${nose.address().port}`;

    /* the store's side: a blank page, the guide's tag, the guide's CSP */
    const csp = storeCsp(fs.readFileSync(path.join(root, 'docs/B2B-INTEGRATION.md'), 'utf8'), NOSE);
    const pages = new Map();
    const store = await listen((req, res) => {
      const u = new URL(req.url, 'http://x');
      seen.push({ side: 'store', method: req.method, url: req.url, headers: req.headers });
      if (u.pathname === '/store.css') { res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' }); res.end(STORE_CSS); return; }
      const attrs = pages.get(u.pathname);
      if (!attrs) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp });
      res.end(storePage(attrs, { nose: NOSE, version: release.row.version, integrity: release.row.js }));
    });
    servers.push(store);
    STORE = `http://localhost:${store.address().port}`;

    browser = await playwright.chromium.launch();
    const chromium = browser.version();
    const elsewhere = [];
    const newContext = async opts2 => {
      const context = await browser.newContext({ ...opts2, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', reducedMotion: 'reduce' });
      context.on('request', r => { const o = new URL(r.url()).origin; if (o !== NOSE && o !== STORE) elsewhere.push(r.url()); });
      return context;
    };

    /* data.md: this checkout's privacy page, and the published one */
    const privacyOf = async html => {
      const context = await browser.newContext({ javaScriptEnabled: true });
      await context.route('**/*', r => r.abort());
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const got = await page.evaluate(privacyInPage, `${opts.site}/privacy/`);
      await context.close();
      return got;
    };
    const mine = await privacyOf(fs.readFileSync(path.join(root, 'privacy/index.html'), 'utf8'));
    if (!mine) refuse('privacy/index.html has no section with id "dispensaries"');
    let how;
    if (opts.offline) {
      how = `From \`privacy/index.html\` at NOSE commit ${code(head)}, the page this checkout deploys. **Not compared with the published page** (\`--offline\`): run the kit without \`--offline\` to check it against ${opts.site}/privacy/.`;
    } else {
      let html;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      try {
        const r = await fetchImpl(`${opts.site}/privacy/`, { redirect: 'error', signal: ctl.signal });
        if (r.status !== 200) throw new Error(String(r.status));
        html = await r.text();
      } catch { refuse(`could not read the published privacy page at ${opts.site}/privacy/` + (opts.store === undefined ? ' - for the test store, --offline writes data.md from this checkout and says so' : '')); }
      finally { clearTimeout(timer); }
      const published = await privacyOf(html);
      if (!published || JSON.stringify(published) !== JSON.stringify(mine)) {
        refuse(`the dispensary section published at ${opts.site}/privacy/ is not the one this checkout holds (privacy/index.html): the kit would describe a page nobody reads - deploy this checkout, or check out the commit the site was built from`);
      }
      how = `From ${opts.site}/privacy/#dispensaries, read ${day} (UTC) - word for word the section of \`privacy/index.html\` at NOSE commit ${code(head)}.`;
    }

    /* the release's own words and engine, from a page that has loaded it */
    pages.set('/kit/choose', { key, mode: 'rail', category: CATEGORIES[0], consent: 'unknown', strings: 'florida', routes: JSON.stringify(ROUTES) });
    let S, choice;
    {
      const context = await newContext(WIDTHS.desktop);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${STORE}/kit/choose`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.NoseRank && window.NoseStrings && window.customElements.get('nose-matches'), null, { timeout: TIMEOUT_MS })
        .catch(() => refuse(`release ${release.row.version} did not run on the stand-in store page${errors.length ? `: ${errors[0]}` : ''}`));
      S = await page.evaluate(() => JSON.parse(JSON.stringify(window.NoseStrings)));
      choice = await page.evaluate(chooseInPage, { feed, purchases, categories: [...CATEGORIES], routes: [...ROUTES], cards: CARDS_SHOWN });
      await context.close();
    }
    const missingWhen = [...new Set([...Object.keys(S.florida), ...Object.keys(S.default)])].filter(x => !(x in WHEN));
    if (missingWhen.length) refuse(`js/b2b-strings has strings the kit cannot place: ${missingWhen.join(', ')} - add them to the kit's WHEN`);
    const trace = tracer(S, feed);

    /* the screens */
    const given = { key, strings: 'florida' };
    const granted = { ...given, consent: 'granted', purchases: JSON.stringify(purchases) };
    const routesJson = JSON.stringify(ROUTES);
    const states = [
      { n: 1, id: 'consent', title: 'Before the shopper says yes', need: true,
        attrs: { ...given, mode: 'rail', category: choice.railCat || CATEGORIES[0], routes: routesJson, consent: 'unknown' },
        set: `\`consent="unknown"\`, the rail's attributes and no purchases - a store's page hands the widget the purchases only after a yes`, why: '' },
      { n: 2, id: 'rail', title: 'The rail: closest in aroma to past orders', need: choice.railCat, scroll: true,
        attrs: { ...granted, mode: 'rail', category: choice.railCat, routes: routesJson },
        set: `\`mode="rail"\`, \`category="${choice.railCat}"\`, consent granted, the purchases`, why: 'no order in any category can be compared' },
      { n: 3, id: 'sold-out', title: 'The sold-out panel', need: choice.soldOut, scroll: true,
        attrs: { ...granted, mode: 'sold-out', routes: routesJson },
        set: `\`mode="sold-out"\`, consent granted, the purchases - the product ordered most, ${choice.soldOut}, has no batch in stock`,
        why: 'the product ordered most has a batch in stock, so the panel shows nothing' },
      { n: 4, id: 'no-panel', title: 'A batch with no terpene panel', need: choice.noPanelCat, scroll: true,
        attrs: { ...granted, mode: 'rail', category: choice.noPanelCat, routes: routesJson },
        set: `\`mode="rail"\`, \`category="${choice.noPanelCat}"\`, consent granted, the purchases`,
        why: 'no rail of these purchases lists, among its first 12 cards, a batch without a terpene panel' },
      { n: 5, id: 'vote', title: 'The vote, after an order', need: choice.vote,
        attrs: { ...granted, mode: 'vote', product: choice.vote && choice.vote.product },
        set: `\`mode="vote"\`, \`product="${choice.vote && choice.vote.product}"\` (${choice.vote && choice.vote.name}), consent granted, the purchases`,
        why: 'no product ordered can be compared with the rest of the orders in its category' },
      { n: 6, id: 'rail-basis', title: 'What the rail is based on, opened', need: choice.railCat, action: 'open',
        attrs: { ...granted, mode: 'rail', category: choice.railCat, routes: routesJson },
        set: `as screen 02, then the "${S.florida.basisMany.split('{')[0].trim()} ..." line under the cards pressed`, why: 'no order in any category can be compared' },
      { n: 7, id: 'rail-removed', title: 'A product taken out of the palate', need: choice.railCat, action: 'remove',
        attrs: { ...granted, mode: 'rail', category: choice.railCat, routes: routesJson },
        set: `as screen 06, then "${S.florida.remove}" pressed on the first product`, why: 'no order in any category can be compared' },
      { n: 8, id: 'vote-answered', title: 'The vote, answered', need: choice.vote, action: 'vote',
        attrs: { ...granted, mode: 'vote', product: choice.vote && choice.vote.product },
        set: `as screen 05, then "${S.florida.voteUp}" pressed`, why: 'no product ordered can be compared with the rest of the orders in its category' },
      { n: 9, id: 'rail-nothing-yet', title: 'A rail with nothing to compare with yet', need: choice.emptyCat,
        attrs: { ...granted, mode: 'rail', category: choice.emptyCat, routes: routesJson,
          purchases: JSON.stringify(choice.emptyDrops ? purchases.filter(p => !byId.has(p.batchId) || byId.get(p.batchId).category !== choice.emptyCat) : purchases) },
        set: `\`mode="rail"\`, \`category="${choice.emptyCat}"\` - a category with no orders - consent granted, ` +
          (choice.emptyDrops ? `the purchases less those in ${choice.emptyCat}, a shopper with no order there` : 'the purchases'),
        why: 'the store has no category in stock but the rail\'s' },
      { n: 10, id: 'rail-none-available', title: 'A rail with nothing available to compare with', need: choice.noneRoutes,
        attrs: { ...granted, mode: 'rail', category: choice.railCat, routes: JSON.stringify(choice.noneRoutes || []) },
        set: `\`mode="rail"\`, \`category="${choice.railCat}"\`, \`routes='${JSON.stringify(choice.noneRoutes || [])}'\` - a shopper whose routes leave that category out - consent granted, the purchases`,
        why: 'every route the shopper may have reaches that category' }
    ];

    /* Every request the widget made, by kind, checked after each screen:
       anything else refuses the kit. The purchases are looked for too -
       batch IDs of 6 characters or more, every day, the list itself: a
       shorter ID could match a header by chance, and the shapes checked
       leave nothing free-form for one to ride in. A vote's product is its
       question's, as the privacy page says, so it is set aside first. */
    const needles = [...new Set([...purchases.map(p => p.batchId).filter(id => id.length >= 6), ...purchases.map(p => p.day), JSON.stringify(purchases)])];
    const kinds = new Map();
    const tally = (what, carried) => { const r = kinds.get(what) || { what, count: 0, carried }; r.count++; kinds.set(what, r); };
    let audited = 0;
    const audit = () => {
      for (const r of seen.slice(audited)) {
        const u = new URL(r.url, 'http://x');
        if (r.headers.cookie) refuse(`a request to the ${r.side === 'nose' ? 'NOSE' : 'store'} stand-in carried a cookie: ${u.pathname}`);
        if (r.side === 'store') {
          if (r.method === 'GET' && (pages.has(u.pathname) || ['/store.css', '/favicon.ico'].includes(u.pathname))) continue;
          refuse(`the store page was asked for ${r.method} ${u.pathname}`);
        }
        if (r.headers.referer) refuse(`a request to NOSE carried the page's address as its referrer: ${u.pathname}`);
        const file = releases.parsePath(u.pathname);
        let body = r.body || '';
        if (u.pathname === VOTE_PATH && r.method === 'POST' && !u.search) {
          let v;
          try { v = JSON.parse(body); } catch { refuse('a vote that is not JSON'); }
          if (JSON.stringify(Object.keys(v).sort()) !== JSON.stringify([...VOTE_FIELDS].sort())) refuse(`a vote with fields ${Object.keys(v).join(', ')}`);
          if (!choice.vote || v.candidate !== choice.vote.product || v.key !== key) refuse('a vote about another product, or with another key');
          body = JSON.stringify({ ...v, candidate: '' });
          tally(`POST ${VOTE_PATH}`, `text/plain, no cookie, no referrer: ${VOTE_FIELDS.map(f => `${f} ${f === 'key' ? `${v.key.slice(0, 8)}...` : JSON.stringify(v[f])}`).join(', ')} - the product voted on, never the list`);
        } else if (u.pathname === FEED_PATH && r.method === 'GET' && u.search === `?key=${key}` && !body) {
          tally(`GET ${FEED_PATH}?key=${key.slice(0, 8)}...`, 'the store\'s public key alone - no cookie, no referrer; the reply is the same list for every visitor');
        } else if (file && r.method === 'GET' && !u.search && !body) {
          tally(`GET ${u.pathname}`, file.file === releases.JS ? 'nothing - the release\'s script, checked by its integrity hash' : 'nothing - the release\'s stylesheet, checked by the hash the script names');
        } else {
          refuse(`the widget asked NOSE for something the kit does not know: ${r.method} ${u.pathname}`);
        }
        const all = `${r.method} ${r.url} ${JSON.stringify(r.headers)} ${body}`;
        if (needles.some(n => all.includes(n))) refuse(`a request to NOSE carried a purchase (${u.pathname})`);
      }
      audited = seen.length;
    };

    const parent = path.dirname(target);
    for (let d = parent; !fs.existsSync(d); d = path.dirname(d)) made.unshift(d);
    fs.mkdirSync(parent, { recursive: true });
    staging = fs.mkdtempSync(path.join(parent, '.compliance-kit-'));
    for (const s of states) {
      if (!s.need) { s.rendered = false; out(`${pad(s.n)} ${s.id}: not with this store - ${s.why}`); continue; }
      s.rendered = true;
      s.files = [];
      s.byWidth = {};
      s.cardFiles = {};
      const at = `/kit/${pad(s.n)}-${s.id}`;
      pages.set(at, s.attrs);
      const texts = {};
      for (const [width, w] of Object.entries(WIDTHS)) {
        const context = await newContext(w);
        await context.addInitScript(() => {
          window.__violations = [];
          document.addEventListener('securitypolicyviolation', e => window.__violations.push(e.effectiveDirective || e.violatedDirective));
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(`${STORE}${at}`, { waitUntil: 'networkidle' });
        const ready = () => page.waitForFunction(() => {
          const r = document.querySelector('nose-matches') && document.querySelector('nose-matches').shadowRoot;
          const v = r && r.querySelector('.nm');
          return v && !v.hidden && v.childElementCount > 0;
        }, null, { timeout: TIMEOUT_MS });
        await ready().catch(() => refuse(`screen ${pad(s.n)} (${width}): the widget showed nothing${errors.length ? ` - ${errors[0]}` : ''}`));
        const styled = await page.evaluate(() => { const l = document.querySelector('nose-matches').shadowRoot.querySelector('link'); return !!(l && l.sheet); });
        if (!styled) refuse(`screen ${pad(s.n)} (${width}): the release's stylesheet did not apply - its hash or its CORS reply`);
        if (s.action === 'open' || s.action === 'remove') {
          await page.locator('nose-matches summary').first().click();
          await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelector('details').open);
        }
        if (s.action === 'remove') {
          await page.locator('nose-matches button[data-action="remove"]').first().click();
          await page.waitForFunction(() => !!document.querySelector('nose-matches').shadowRoot.querySelector('button[data-action="restore"]'), null, { timeout: TIMEOUT_MS });
        }
        if (s.action === 'vote') {
          const before = votes.length;
          await page.locator('nose-matches button[data-vote="up"]').click();
          await page.waitForFunction(() => document.querySelector('nose-matches').shadowRoot.querySelector('.nm-thanks').textContent.trim() !== '');
          const deadline = Date.now() + TIMEOUT_MS;
          while (votes.length === before && Date.now() < deadline) await new Promise(r => setTimeout(r, 25));
          if (votes.length === before) refuse(`screen ${pad(s.n)} (${width}): the vote never reached NOSE's side`);
        }
        await page.mouse.move(0, 0);
        await page.evaluate(() => { let a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; if (a && a.blur) a.blur(); });
        await page.evaluate(() => document.fonts.ready);
        const shot = async name => {
          const b = await page.evaluate(() => { const r = document.querySelector('nose-matches').getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; });
          const x = Math.max(0, b.x - MARGIN), y = Math.max(0, b.y - MARGIN);
          await page.screenshot({ path: path.join(staging, name), fullPage: true, animations: 'disabled', caret: 'hide',
            clip: { x, y, width: b.w + (b.x - x) + MARGIN, height: b.h + (b.y - y) + MARGIN } });
          s.files.push(name);
          (s.byWidth[width] = s.byWidth[width] || []).push(name);
          const v = await page.evaluate(cardsInViewInPage);
          if (v) for (const c of v.inView) (s.cardFiles[width] = s.cardFiles[width] || {}, s.cardFiles[width][c] = s.cardFiles[width][c] || []).push(name);
          return v;
        };
        let v = await shot(`${pad(s.n)}-${s.id}-${width}.png`);
        for (let k2 = 2; s.scroll && v && v.left < v.max - 1 && k2 <= 40; k2++) {
          await page.evaluate(step => { const l = document.querySelector('nose-matches').shadowRoot.querySelector('.nm-cards'); l.scrollTo({ left: Math.min(l.scrollLeft + step, l.scrollWidth - l.clientWidth), behavior: 'instant' }); }, v.step);
          await page.waitForTimeout(150);
          const before = v.left;
          v = await shot(`${pad(s.n)}-${s.id}-${width}-${k2}.png`);
          if (v.left <= before) break;
        }
        s.cardFiles[width] = s.cardFiles[width] || {};
        texts[width] = await page.evaluate(stringsInPage, { HIDDEN_SHOWN, HIDDEN_READ });
        const violations = await page.evaluate(() => window.__violations.slice());
        if (violations.length) refuse(`screen ${pad(s.n)} (${width}): the store page's CSP was breached (${violations.join(', ')})`);
        if (errors.length) refuse(`screen ${pad(s.n)} (${width}): a page error - ${errors[0]}`);
        await context.close();
      }
      if (JSON.stringify(texts.phone) !== JSON.stringify(texts.desktop)) refuse(`screen ${pad(s.n)}: the phone and desktop screens hold different strings`);
      s.strings = texts.phone.map(x => ({ ...x, ...trace(x.text) }));
      const problems = s.strings.filter(x => !x.from).map(x => `"${x.text}" (${x.where})${x.defaultKey ? ` - the default variant's ${x.defaultKey}` : ''}`);
      if (problems.length) {
        refuse(`screen ${pad(s.n)}: not every string is the Florida variant's, a word js/b2b-strings lists, or the catalog's - a kit must account for every word:\n  ` +
          `${problems.slice(0, 20).join('\n  ')}${problems.length > 20 ? `\n  and ${problems.length - 20} more` : ''}`);
      }
      if (elsewhere.length) refuse(`screen ${pad(s.n)}: the browser reached another origin, ${new URL(elsewhere[0]).origin}`);
      audit();
      out(`${pad(s.n)} ${s.id}: ${s.files.length} PNG${s.files.length === 1 ? '' : 's'}, ${s.strings.length} strings`);
    }

    /* what each source showed, for strings.md - counting a string only on a
       screen where it is seen or read aloud, not in a list still closed */
    const add = (map, k2, n) => { if (!map.has(k2)) map.set(k2, new Set()); map.get(k2).add(n); };
    const keySeen = new Map(), labelSeen = new Map(), batchSeen = new Map(), barSeen = new Set(), joinSeen = new Set();
    for (const s of states.filter(x => x.rendered)) {
      const open = s.strings.filter(x => x.how !== HIDDEN_SHOWN && x.how !== HIDDEN_READ);
      for (const x of open) {
        if (x.key) add(keySeen, x.key, s.n);
        if (['matchLine', 'matchAria', 'voteMatched'].includes(x.key)) {
          const label = S.SHOWN_FROM_OTHER_FILES.matchLabels.find(l => x.text.includes(l));
          if (label) add(labelSeen, label, s.n);
        }
        if (x.from === 'the aroma bar') barSeen.add(s.n);
        if (x.from === 'the catalog' && x.text.includes(' · ')) joinSeen.add(s.n);
      }
      const named = open.filter(x => x.where.includes('product name') || x.where === 'what it is based on: an order' || x.where === 'the heading').map(x => x.text);
      for (const b of feed.batches) {
        if (named.some(t => t === b.name || t.startsWith(`${b.name} · `) || t === S.florida.notUsedPanel.replace('{name}', b.name)
          || t === S.florida.soldOutTitle.replace('{name}', b.name))) add(batchSeen, b.batch_id, s.n);
      }
    }
    const requests = [...kinds.values()];
    const k = { release, day, chromium, head, storeName, storeLine, purchaseSource, purchases, nameOf, states, requests, S, feed,
      keySeen, labelSeen, batchSeen, barSeen, joinSeen, site: opts.site, offline: opts.offline, privacy: { ...mine, how } };
    fs.writeFileSync(path.join(staging, 'README.md'), readme(k));
    fs.writeFileSync(path.join(staging, 'strings.md'), stringsDoc(k));
    fs.writeFileSync(path.join(staging, 'data.md'), dataDoc(k));
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(staging, target);
    staging = null;
    made.length = 0;
    const pngs = states.filter(x => x.rendered).reduce((n, s) => n + s.files.length, 0);
    out(`compliance kit written: ${path.relative(root, target)}/ - ${states.filter(x => x.rendered).length} screens, ${pngs} PNGs, README.md, strings.md, data.md`);
    return 0;
  } catch (e) {
    if (e instanceof Refusal) { err(`REFUSED - ${e.message}`); return 1; }
    throw e;
  } finally {
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
    /* and any folder made for it, when nothing was written there */
    for (const d of made.reverse()) { try { fs.rmdirSync(d); } catch {} }
    if (browser) await browser.close().catch(() => {});
    for (const s of servers) s.close();
  }
}

module.exports = { main, parseArgs, madeUpPurchases, tracer, storePage, storeCsp, WHEN, WIDTHS, KIT_TITLE, USAGE, Refusal, Usage };

if (require.main === module) {
  main().then(code => { process.exitCode = code; }, e => { console.error(e && e.stack ? e.stack : e); process.exitCode = 1; });
}

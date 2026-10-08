#!/usr/bin/env node
'use strict';
/* NOSE - the widget's only two calls to NOSE: the feed
 * (netlify/functions/b2b-feed.js) and the vote (netlify/functions/b2b-vote.js),
 * offline. PARSER-HANDOFF s14, "Feed and votes".
 *
 *   node test/b2b-endpoints-test.js     -> "b2b-endpoints clean", or FAIL lines and exit 1
 *
 * On PGlite: every migration applied in filename order, stores made by the
 * admin script, batches and readings written as nose_b2b through
 * lib/b2b-store.js, readings from the parser's own output on fixture reports.
 * Both functions are driven through their default exports, with a stand-in
 * for pg that runs each statement on PGlite AS nose_b2b, and a stand-in for
 * @netlify/blobs that answers as 10.x does - list(), setJSON() with
 * onlyIfNew, delete().
 *
 * What it pins down:
 *   - the switch: off, a plain 404 before anything else, no statement, no blob
 *   - the feed is the same for every visitor: two visitors - other cookies,
 *     browsers, addresses - get byte-identical replies; it lists every batch
 *     the store listed in its window, in stock or not, with exactly the
 *     prompt's fields, and of a reading only the one NOSE stands by: terps and
 *     the total only when it was accepted, nothing from a corrected link or a
 *     link that gave no report; no lab-report link, no sales, no quantities
 *   - the origin rule: the store's own origins get the feed with that origin
 *     echoed and Vary: Origin; any other - missing, "null", foreign, another
 *     store's - gets no CORS header and no data; a revoked key, a 403
 *   - briefly cacheable: public, max-age=60 on the feed, no-store on the rest
 *   - a vote is exactly six fields: every extra field refused, every missing
 *     one, every bad value; one vote per band, all four of matchBand()'s
 *     names stored - the consumer's Moderate and Low refusal not repeated
 *   - no time of day in a stored vote's key or value; the day is the
 *     database's UTC day; the keys list in no arrival order
 *   - the daily cap, per store: over it a vote is dropped and the reply is
 *     byte-identical to a kept one; the default and the variable's rules
 *   - logs: nothing on success, one fixed line without detail on a failure
 *   - delete-store deletes a store's votes with its database half, and only
 *     its own; a Blobs failure part way is finished by a second run
 *   - the consumer's store, schema nose and the archive never touched
 *
 * Needs `npm install` (PGlite) and test/fixtures/extracted (test/extract-dump.js).
 * Nothing it does reaches the network, a real database or Netlify. No key is
 * written in this file: every one is made when the test runs.
 */

for (const k of ['NOSE_DB_URL', 'NOSE_DB_ADMIN_URL', 'NOSE_B2B_DB_URL', 'B2B_ENABLED', 'B2B_VOTE_DAILY_CAP',
                 'NETLIFY_SITE_ID', 'NETLIFY_AUTH_TOKEN']) delete process.env[k];

const crypto = require('crypto');
const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify/functions/lib');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const FEED = path.join(ROOT, 'netlify/functions/b2b-feed.js');
const VOTE = path.join(ROOT, 'netlify/functions/b2b-vote.js');
const BEACON = path.join(ROOT, 'netlify/lib/beacon.js');
const VOTES_LIB = path.join(LIB, 'b2b-votes.js');
const STORE_LIB = path.join(LIB, 'b2b-store.js');
const ADMIN = path.join(ROOT, 'scripts/b2b-store.js');
const COA = path.join(ROOT, 'netlify/functions/coa.js');
const ARCHIVE = path.join(LIB, 'archive.js');
const PDF_STORE = path.join(LIB, 'pdf-store.js');
const EXTRACTED = path.join(ROOT, 'test/fixtures/extracted');

/* A run that stops on a promise nothing keeps alive exits 0 quietly. Only
 * reaching the end counts. */
let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) {
    process.stderr.write('b2b-endpoints: stopped before the last check - NOT clean\n');
    process.exitCode = 1;
  }
});

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
}
const codeOf = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sorted = o => (o && typeof o === 'object' && !Array.isArray(o)
  ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sorted(o[k])])) : o);
const EFFECT_WORDS = /\b(effects?|high|stoned|buzz\w*|relax\w*|energ\w*|calm\w*|focus\w*|sleep\w*|sedat\w*|uplift\w*|euphori\w*|mood\w*|potency|potent|strong(?:er)? hit)\b/i;

/* ------------------------------------------- before anything B2B loads */

/* The archive's two halves, as recorders: anything that touches them is
   recorded, and nothing here may. */
const archiveCalls = [];
function recorder(name) {
  return new Proxy({}, { get: (_, key) => {
    archiveCalls.push(`${name}.${String(key)}`);
    return () => { archiveCalls.push(`${name}.${String(key)}()`); return Promise.resolve({ kept: false }); };
  } });
}
function install(file, exports) {
  const m = new Module(file, module);
  m.filename = file;
  m.loaded = true;
  m.exports = exports;
  require.cache[file] = m;
}
install(ARCHIVE, recorder('archive'));
install(PDF_STORE, recorder('pdf-store'));

/* pg, stood in for: each Client runs its statements on PGlite as nose_b2b -
   the role NOSE_B2B_DB_URL names - and every statement is counted. */
let pglite = null;
const pgLog = [];
let pgFails = null;            // null | 'connect' | the SQL to fail
class FakeClient extends EventEmitter {
  constructor(config) { super(); this.config = config; }
  async connect() { if (pgFails === 'connect') throw new Error('connect ECONNREFUSED 203.0.113.9:6543 db.abcdefghijklmnopqrst.supabase.co'); }
  async query(sql, params) {
    pgLog.push(sql);
    if (pgFails && pgFails === sql) throw Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
    await pglite.exec('set role nose_b2b');
    try { return await pglite.query(sql, params); } finally { await pglite.exec('reset role'); }
  }
  async end() {}
}
const FAKE_PG = path.join(ROOT, 'test', '.b2b-endpoints-test-pg.js');
install(FAKE_PG, { Client: FakeClient });

/* Netlify Blobs, as @netlify/blobs 10.x answers: list() (every page, keys and
   ETags), setJSON() - { modified: false } on onlyIfNew when the key exists,
   else { modified: true, etag } - and delete(). Every call is recorded. */
const blobs = { stores: new Map(), opened: [], calls: [], fail: null, noEtag: false, deletesLeft: Infinity };
function storeNamed(name) {
  if (!blobs.stores.has(name)) blobs.stores.set(name, new Map());
  const m = blobs.stores.get(name);
  return {
    async list({ prefix = '' } = {}) {
      blobs.calls.push(['list', name, prefix]);
      if (blobs.fail === 'list') throw new Error('Netlify Blobs has generated an internal error (503) at 198.51.100.4');
      const keys = [...m.keys()].filter(k => k.startsWith(prefix)).sort();
      return { blobs: keys.map(key => ({ key, etag: m.get(key).etag })), directories: [] };
    },
    async setJSON(key, value, opts = {}) {
      blobs.calls.push(['setJSON', name, key]);
      if (blobs.fail === 'set') throw new Error('Netlify Blobs has generated an internal error (503)');
      if (opts.onlyIfNew && m.has(key)) return { modified: false };
      if (blobs.noEtag) return { modified: true };
      const etag = `"${crypto.randomBytes(8).toString('hex')}"`;
      m.set(key, { text: JSON.stringify(value), etag, metadata: opts.metadata === undefined ? null : opts.metadata, opts: Object.keys(opts).sort() });
      return { modified: true, etag };
    },
    async get(key) { blobs.calls.push(['get', name, key]); return m.has(key) ? JSON.parse(m.get(key).text) : null; },
    async delete(key) {
      blobs.calls.push(['delete', name, key]);
      if (blobs.deletesLeft <= 0) throw new Error('Netlify Blobs has generated an internal error (503)');
      blobs.deletesLeft--;
      m.delete(key);
    }
  };
}
const fakeBlobs = {
  getStore(opts) {
    const o = typeof opts === 'string' ? { name: opts } : { ...opts };
    blobs.opened.push(o);
    return storeNamed(o.name);
  },
  getDeployStore() { blobs.calls.push(['getDeployStore']); throw new Error('a deploy store'); },
  connectLambda() { blobs.calls.push(['connectLambda']); }
};
const FAKE_BLOBS = path.join(ROOT, 'test', '.b2b-endpoints-test-blobs.js');
install(FAKE_BLOBS, fakeBlobs);

const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'pg') return FAKE_PG;
  if (request === '@netlify/blobs') return FAKE_BLOBS;
  return resolve.call(this, request, ...rest);
};

/* Every module anything asks for, from here on. */
const loads = [];
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  try { loads.push(Module._resolveFilename(request, parent, isMain)); } catch { loads.push(request); }
  return originalLoad.apply(this, arguments);
};

const version = require(path.join(LIB, 'version.js'));
const b2b = require(STORE_LIB);
const votesLib = require(VOTES_LIB);
const admin = require(ADMIN);
const { parseCoa } = require(path.join(LIB, 'parse-coa.js'));
const { _findPersonalKey: findPersonalKey } = require(path.join(LIB, 'store.js'));
const M = require(path.join(ROOT, 'scripts/lib/match.js')).load();

/* A fake address for NOSE_B2B_DB_URL, built so that no password-bearing URL is
   ever written in this file (check-published.js refuses one in git). */
function fakeB2bUrl() {
  const u = new URL('postgresql://aws-0-us-east-1.pooler.supabase.com');
  u.username = 'nose_b2b.abcdefghijklmnopqrst';
  u.password = 'not-a-real-password';
  u.port = '6543';
  u.pathname = '/postgres';
  return u.toString();
}

/* Both functions are ES module syntax in a CommonJS package, as palate-sync.js
   is, and so is netlify/lib/beacon.js, which the vote imports; Netlify's
   esbuild bundler compiles them (netlify.toml, node_bundler). Node has to be
   told, so a one-file hook loads those three as modules. Their lib/ imports
   are the same CommonJS modules this test holds. */
async function loadFunctions() {
  const urls = [FEED, VOTE, BEACON].map(f => pathToFileURL(f).href);
  Module.register('data:text/javascript,' + encodeURIComponent(`
    const URLS = new Set(${JSON.stringify(urls)});
    export async function load(url, context, next) {
      if (URLS.has(url)) {
        const r = await next(url, { ...context, format: 'module' });
        return { ...r, format: 'module', shortCircuit: true };
      }
      return next(url, context);
    }`));
  return { feed: (await import(urls[0])).default, vote: (await import(urls[1])).default };
}

/* What the functions print. */
const CONSOLE = ['log', 'info', 'warn', 'error', 'debug'];
async function quietly(fn) {
  const lines = [];
  const saved = CONSOLE.map(k => console[k]);
  CONSOLE.forEach(k => { console[k] = (...a) => lines.push(`${k}: ${a.map(String).join(' ')}`); });
  try { return { value: await fn(), lines }; } finally { CONSOLE.forEach((k, i) => { console[k] = saved[i]; }); }
}

const reading = id => parseCoa(fs.readFileSync(path.join(EXTRACTED, `${id}.txt`), 'utf8'));

async function main() {
  let PGlite;
  try { ({ PGlite } = await import('@electric-sql/pglite')); }
  catch { console.error('FAIL: @electric-sql/pglite is not installed - run: npm install --save-dev @electric-sql/pglite'); process.exit(1); }
  if (!fs.existsSync(path.join(EXTRACTED, 'KAY-CAR-001.txt'))) {
    console.error('FAIL: test/fixtures/extracted is missing - run: node test/extract-dump.js');
    process.exit(1);
  }

  /* ============================================================ the code */

  const feedCode = codeOf(fs.readFileSync(FEED, 'utf8'));
  const voteCode = codeOf(fs.readFileSync(VOTE, 'utf8'));
  const votesLibCode = codeOf(fs.readFileSync(VOTES_LIB, 'utf8'));
  for (const [name, code] of [['feed', feedCode], ['vote', voteCode]]) {
    check(`the ${name} is a Request function, as b2b-catalog.js is: one default export, and nothing else exported`,
      [(code.match(/^export /gm) || []).length, /^export default async \(request\) => \{$/m.test(code)], [1, true]);
    check(`...it asks the switch first, before the method, the key or the body`,
      code.split('\n')[code.split('\n').findIndex(l => l.startsWith('export default')) + 1].trim(), 'if (!flag.b2bEnabled()) return notFound();');
    check(`...it reads nothing about the caller but the Origin header: no address, user agent, cookie, context, geography or time - and logs only by console.error`,
      /x-forwarded|client-ip|connection-ip|user-agent|cookie|\bcontext\b|\bgeo\b|Date\.now|new Date|toISOString|console\.(log|info|warn|debug)/i.test(code), false);
    check(`...the only request header it reads is Origin${name === 'vote' ? ', besides the body\'s Content-Type and Content-Length' : ''}`,
      [...code.matchAll(/headers\.get\('([^']+)'\)/g)].map(m => m[1]).sort(),
      name === 'vote' ? ['content-length', 'content-type', 'origin'] : ['origin']);
  }
  check('the feed imports the switch and the store layer, whole, and nothing else',
    feedCode.match(/^import .*$/gm), ["import flag from './lib/b2b-flag.js';", "import b2b from './lib/b2b-store.js';"]);
  check('the vote imports the switch, the store layer and the votes, whole - and from netlify/lib/beacon.js four helpers, none that carries a time',
    voteCode.match(/^import .*$/gm), ["import flag from './lib/b2b-flag.js';", "import b2b from './lib/b2b-store.js';",
                                      "import votes from './lib/b2b-votes.js';",
                                      "import { readJsonBody, isInt, noContent, rejected } from '../lib/beacon.js';"]);
  check('...nothing of the consumer\'s: not its store (VOTES_STORE, match-feedback), not keySuffix, safeClientTs or contextHash, which carry a time or group votes',
    [voteCode, votesLibCode].map(c => /VOTES_STORE|match-feedback|keySuffix|safeClientTs|contextHash/.test(c)), [false, false]);
  check('the votes module keeps the day it is given and no time: no clock, no toISOString, no counter, a random suffix',
    [/Date\.now|new Date|toISOString|getHours|getTime|performance\.now|process\.hrtime/.test(votesLibCode),
     /crypto\.randomBytes\(16\)\.toString\('hex'\)/.test(votesLibCode)], [false, true]);
  check('its store is "b2b-votes", site-wide (getStore, never getDeployStore), and only it loads @netlify/blobs for B2B',
    [votesLib.STORE_NAME, /getDeployStore/.test(votesLibCode), /@netlify\/blobs/.test(voteCode), /@netlify\/blobs/.test(feedCode)],
    ['b2b-votes', false, false, false]);

  /* matchBand()'s own names, read from js/match-math.*.js: the vote takes
     exactly these, as the app sends matchBand(score)[1]. */
  const grid = Array.from({ length: 10001 }, (_, i) => i / 10000);
  const bandNames = [...new Set(grid.map(s => M.matchBand(s)[1]))].reverse();
  check('the vote\'s bands are matchBand()\'s own four names, from the maths file itself, strongest first',
    [votesLib.BANDS, bandNames], [bandNames, ['Strong', 'Good', 'Moderate', 'Low']]);
  check('...so a vote on a Partial overlap or a Different profile match is taken - match-feedback.js\'s refusal of Moderate and Low is not repeated',
    ['Moderate', 'Low'].every(b => votesLib.BANDS.includes(b)), true);

  const mine = ['netlify/functions/b2b-feed.js', 'netlify/functions/b2b-vote.js', 'netlify/functions/lib/b2b-votes.js'];
  check('no effect wording in the feed, the vote or the votes module', mine.filter(f => EFFECT_WORDS.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))), []);
  const storeLibCode = codeOf(fs.readFileSync(STORE_LIB, 'utf8'));
  check('the reading NOSE stands by has one rule and the window one condition, each in one place: the listing and the feed read the same two',
    [b2b.LISTED_SQL.includes(`${b2b.CURRENT_READ_SQL} as current`), b2b.FEED_SQL.includes(b2b.CURRENT_READ_SQL),
     b2b.FEED_SQL.includes(b2b.IN_WINDOW_SQL), b2b.VOTE_TARGET_SQL.includes(b2b.IN_WINDOW_SQL),
     (storeLibCode.match(/r\.fetched and r\.read_url = b\.coa_url/g) || []).length], [true, true, true, true, 1]);
  check('the feed selects no lab-report link, no sale, no quantity, no reason, warning, form or freshness figure',
    /coa_url[^=]|read_url\b(?! = b)|reject|warning|moisture|water_activity|product_class|read_by|quantit|sales?\b|price/i
      .test(b2b.FEED_SQL.replace(/r\.read_url = b\.coa_url/, '')), false);

  /* ======================================================= the database */

  pglite = new PGlite();
  const migrationFiles = fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();
  for (const f of migrationFiles) await pglite.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  const rows = async (sql, params) => (await pglite.query(sql, params)).rows;
  const one = async (sql, params) => (await rows(sql, params))[0];
  const adminDb = { query: (sql, params) => pglite.query(sql, params) };
  const asB2b = { query: async (sql, params) => {
    await pglite.exec('set role nose_b2b');
    try { return await pglite.query(sql, params); } finally { await pglite.exec('reset role'); }
  } };
  /* As delete-store opens it from the Codespace: the site's ID and a token. */
  const voteStore = () => votesLib.open({ siteID: 'site-id-of-the-test', token: 'token-of-the-test' });
  const say = () => { const lines = []; return { lines, log: l => lines.push(String(l)) }; };
  const adminCmd = async (argv, opts = {}) => {
    const out = say();
    const r = await admin.runCommand(admin.parseArgs(argv), { db: adminDb, votes: voteStore(), log: out.log, ...opts });
    return { r, text: out.lines.join('\n'), lines: out.lines };
  };
  const keysIn = text => [...text.matchAll(/n[sp]k_[0-9a-f]{64}/g)].map(m => m[0]);

  const SHOP = 'https://shop.example';
  const MENU = 'https://menu.shop.example';
  const OTHER = 'https://other.example';
  let publicKey = keysIn((await adminCmd(['create', 'test-shop', '--name', 'Test Shop', '--origin', SHOP, '--origin', MENU,
                                          '--guardrail-thc', '5'])).text).find(k => k.startsWith('npk_'));
  const otherKeys = keysIn((await adminCmd(['create', 'other-shop', '--name', 'Other Shop', '--origin', OTHER])).text);
  const otherPublic = otherKeys.find(k => k.startsWith('npk_'));
  const otherSecret = otherKeys.find(k => k.startsWith('nsk_'));
  const storeId = (await one(`select id::text as id from b2b.stores where slug = 'test-shop'`)).id;
  const otherId = (await one(`select id::text as id from b2b.stores where slug = 'other-shop'`)).id;

  const KAY_CAR = reading('KAY-CAR-001');
  const KAY_PRR = reading('KAY-PRR-001');
  const ACS = reading('ACS-FLW-002');
  const MCL = reading('MCL-FLW-002');
  const GREENROADS = reading('GreenRoadsFullSpectrumCBDOil750mgLot24007');
  const LINK = {
    acc: 'https://coa.example/kaycha/KAY-CAR-001.pdf',
    accOld: 'https://coa.example/acs/ACS-FLW-002.pdf',
    ref: 'https://coa.example/terplife/GreenRoads.pdf',
    unf: 'https://coa.example/down.pdf',
    oldNew: 'https://coa.example/kaycha/corrected.pdf',
    oldOld: 'https://coa.example/kaycha/before-correction.pdf',
    sold: 'https://coa.example/kaycha/viewer?sample=MI60617015-004&expires=1767225600',
    gone: 'https://coa.example/kaycha/KAY-PRR-001.pdf',
    other: 'https://coa.example/moderncanna/MCL-FLW-002.pdf'
  };
  const row = (batch_id, product_id, list_position, category, route, extra = {}) => ({
    batch_id, product_id, list_position, category, route, name: `Name of ${batch_id}`, brand: 'House Brand', coa_url: null,
    product_url: `${SHOP}/menu/${product_id}`, in_stock: true, thc_percent: null, cbd_percent: null, ...extra
  });
  await b2b.upsertBatches(storeId, [
    row('B-GONE', 'P-GONE', 0, 'flower', 'smoking', { coa_url: LINK.gone }),
    row('B-ACC-OLD', 'P-ACC', 1, 'vape', 'inhalation', { coa_url: LINK.accOld, in_stock: false, thc_percent: 84.2 }),
    row('B-ACC', 'P-ACC', 2, 'vape', 'inhalation', { coa_url: LINK.acc, thc_percent: 21.5, cbd_percent: 0.4 }),
    row('B-REF', 'P-REF', 3, 'vape', 'inhalation', { coa_url: LINK.ref, thc_percent: 80 }),
    row('B-UNF', 'P-UNF', 4, 'concentrate', 'inhalation', { coa_url: LINK.unf }),
    row('B-OLD', 'P-OLD', 5, 'flower', 'smoking', { coa_url: LINK.oldNew, in_stock: false }),
    row('B-NOLINK', 'P-NOLINK', 6, 'pre-roll', 'smoking', { brand: null, product_url: null }),
    row('B-SOLD', 'P-SOLD', 7, 'flower', 'smoking', { coa_url: LINK.sold, in_stock: false, thc_percent: 19, cbd_percent: 0 })
  ], { client: asB2b });
  await b2b.upsertBatches(otherId, [row('O-1', 'P-O1', 0, 'flower', 'smoking', { coa_url: LINK.other, product_url: `${OTHER}/p/1` })], { client: asB2b });
  await b2b.upsertRead(storeId, 'B-GONE', KAY_PRR, { client: asB2b, readUrl: LINK.gone });
  await b2b.upsertRead(storeId, 'B-ACC-OLD', ACS, { client: asB2b, readUrl: LINK.accOld });
  await b2b.upsertRead(storeId, 'B-ACC', KAY_CAR, { client: asB2b, readUrl: LINK.acc });
  await b2b.upsertRead(storeId, 'B-REF', GREENROADS, { client: asB2b, readUrl: LINK.ref });
  await b2b.upsertUnfetched(storeId, 'B-UNF', LINK.unf, 'The lab server returned 503 for that link.', { client: asB2b });
  await b2b.upsertRead(storeId, 'B-OLD', KAY_PRR, { client: asB2b, readUrl: LINK.oldOld });
  await b2b.upsertRead(storeId, 'B-SOLD', KAY_PRR, { client: asB2b, readUrl: LINK.sold });
  await b2b.upsertRead(otherId, 'O-1', MCL, { client: asB2b, readUrl: LINK.other });
  /* B-GONE was last listed 400 days ago: outside the store's 12-month window. */
  await pglite.query(`update b2b.batches set first_listed_on = ((now() at time zone 'UTC')::date - 400),
                             last_listed_on = ((now() at time zone 'UTC')::date - 400) where batch_id = 'B-GONE'`);
  const today = (await one(`select ((now() at time zone 'UTC')::date)::text as d`)).d;

  const NOSE_TABLES = ['documents', 'extractions', 'parses', 'reparse_runs', 'removals', 'withheld'];
  const noseCounts = async () => Promise.all(NOSE_TABLES.map(async t => (await one(`select count(*)::int as n from nose.${t}`)).n));
  const noseBefore = await noseCounts();

  /* ======================================================= the functions */

  process.env.NOSE_B2B_DB_URL = fakeB2bUrl();
  const { feed, vote } = await loadFunctions();
  const PROD = { parserVersion: 'abc1234', extractorVersion: 'abc123456789', deployContext: 'production' };
  const ON = () => { process.env.B2B_ENABLED = '1'; version.pin(PROD); };
  const successLines = [];

  const FEED_URL = 'https://nose-app.com/.netlify/functions/b2b-feed';
  const feedUrl = key => `${FEED_URL}?key=${key}`;
  const getFeed = async (url, { origin = SHOP, headers = {}, method = 'GET' } = {}) => {
    const h = { ...headers };
    if (origin !== null) h.origin = origin;
    const { value: res, lines } = await quietly(() => feed(new Request(url, { method, headers: h })));
    const bytes = Buffer.from(await res.arrayBuffer());
    let json = null;
    try { json = JSON.parse(bytes.toString('utf8')); } catch { /* a plain body */ }
    if (res.status === 200) successLines.push(...lines);
    return { status: res.status, headerList: [...res.headers], headers: Object.fromEntries(res.headers), bytes, text: bytes.toString('utf8'), json, lines };
  };
  const VOTE_URL = 'https://nose-app.com/.netlify/functions/b2b-vote';
  const sendVote = async (payload, { origin = SHOP, contentType = 'text/plain;charset=UTF-8', headers = {}, method = 'POST', raw } = {}) => {
    const h = { ...headers };
    if (origin !== null) h.origin = origin;
    if (contentType !== null) h['content-type'] = contentType;
    const init = { method, headers: h };
    /* A string body is given text/plain;charset=UTF-8 by fetch itself, as
       sendBeacon's is; bytes are given no type, so a body with no
       Content-Type is sent as bytes. */
    const body = raw !== undefined ? raw : JSON.stringify(payload);
    if (method !== 'GET' && method !== 'HEAD') init.body = contentType === null ? new TextEncoder().encode(body) : body;
    const { value: res, lines } = await quietly(() => vote(new Request(VOTE_URL, init)));
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* none */ }
    if (res.status === 204) successLines.push(...lines.filter(l => !l.includes('daily cap')));
    return { status: res.status, headerList: [...res.headers], headers: Object.fromEntries(res.headers), text, json, lines };
  };
  const voteKeys = () => [...(blobs.stores.get('b2b-votes') || new Map()).keys()].sort();
  const valueOf = key => blobs.stores.get('b2b-votes').get(key);
  const bandVote = cosine => ({ score: M.shownScore(cosine), band: M.matchBand(cosine)[1] });
  const ballot = (extra = {}) => ({ key: publicKey, candidate: 'P-ACC', ...bandVote(0.8), palateSize: 3, vote: 'up', ...extra });

  /* --- the switch ---------------------------------------------------------- */
  version.pin(PROD);
  const q0 = pgLog.length;
  const c0 = blobs.calls.length;
  const offFeed = await getFeed(feedUrl(publicKey));
  const offVote = await sendVote(ballot());
  process.env.B2B_ENABLED = '1';
  version.pin({ ...PROD, deployContext: 'deploy-preview' });
  const offFeedPreview = await getFeed(feedUrl(publicKey));
  const offVotePreview = await sendVote(ballot());
  process.env.B2B_ENABLED = 'true';
  version.pin(PROD);
  const offTrue = await getFeed(feedUrl(publicKey));
  const offs = [offFeed, offVote, offFeedPreview, offVotePreview, offTrue];
  check('off - no B2B_ENABLED, a deploy preview with it, or B2B_ENABLED=true - the feed and the vote are the same plain 404',
    [offs.map(r => r.status), new Set(offs.map(r => r.text)).size, offFeed.text, offFeed.headers['content-type'], offFeed.headers['access-control-allow-origin']],
    [[404, 404, 404, 404, 404], 1, 'Not Found', 'text/plain; charset=utf-8', undefined]);
  check('...before anything is touched: no statement, no blob, nothing logged',
    [pgLog.length - q0, blobs.calls.length - c0, offs.flatMap(r => r.lines)], [0, 0, []]);

  ON();

  /* --- the feed: the request ------------------------------------------------ */
  const q1 = pgLog.length;
  /* One at a time: quietly() swaps console out and back, so calls never overlap. */
  const wrongMethods = [];
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) wrongMethods.push(await getFeed(feedUrl(publicKey), { method }));
  check('the feed answers GET alone: anything else is 405, Allow: GET - an OPTIONS preflight too, so a widget that adds a header fails closed',
    [wrongMethods.map(r => r.status), wrongMethods.map(r => r.headers.allow), wrongMethods.map(r => r.headers['access-control-allow-origin'])],
    [[405, 405, 405, 405], ['GET', 'GET', 'GET', 'GET'], [undefined, undefined, undefined, undefined]]);
  const badQueries = [FEED_URL, `${FEED_URL}?key=`, `${FEED_URL}?key=${publicKey}&key=${publicKey}`, `${feedUrl(publicKey)}&v=2`,
                      `${FEED_URL}?k=${publicKey}`, feedUrl(publicKey.toUpperCase()), feedUrl(publicKey.slice(0, -1)),
                      feedUrl(otherSecret), `${feedUrl(publicKey)}%20`];
  const badQ = [];
  for (const u of badQueries) badQ.push(await getFeed(u));
  check('no key, an empty one, two, another parameter, a misnamed one, a malformed key, a SECRET key: 400, nothing looked up',
    [badQ.map(r => r.status), badQ.every(r => r.json && r.json.error === 'bad-request'), pgLog.length - q1],
    [badQueries.map(() => 400), true, 0]);
  delete process.env.NOSE_B2B_DB_URL;
  const noDb = await getFeed(feedUrl(publicKey));
  process.env.NOSE_B2B_DB_URL = fakeB2bUrl();
  check('no database configured: 503, and one fixed line', [noDb.status, noDb.lines], [503, ['error: b2b-feed: no database configured - no feed served']]);

  /* --- the feed: the origin rule ------------------------------------------- */
  const q2 = pgLog.length;
  const foreign = [null, 'null', 'https://evil.example', 'https://shop.example.evil.example', 'http://shop.example', 'https://shop.example/',
                   'https://shop.example:8443', 'https://SHOP.example', OTHER];
  const refusedOrigins = [];
  for (const origin of foreign) refusedOrigins.push(await getFeed(feedUrl(publicKey), { origin }));
  check('a foreign origin gets no CORS header and no data: none, "null", a look-alike, http, a slash, a port, other letter case, another store\'s - 403',
    [refusedOrigins.map(r => r.status), refusedOrigins.map(r => r.headers['access-control-allow-origin'] === undefined),
     refusedOrigins.map(r => r.json && Object.keys(r.json).sort().join(','))],
    [foreign.map(() => 403), foreign.map(() => true), foreign.map(() => 'error,reason')]);
  check('...nothing of the store in the reply, and no batch read for it: the store\'s settings only, one statement each',
    [refusedOrigins.every(r => !/B-ACC|P-ACC|House Brand|window|guardrail|batch/.test(r.text)), refusedOrigins.every(r => r.headers['cache-control'] === 'no-store'),
     pgLog.slice(q2).every(s => s === b2b.FEED_STORE_SQL), pgLog.length - q2], [true, true, true, foreign.length]);
  const otherStoresPage = await getFeed(feedUrl(otherPublic), { origin: SHOP });
  check('...and another store\'s key from this store\'s page is refused too: its own origins, not any store\'s', otherStoresPage.status, 403);

  /* --- the feed: one reply for every visitor -------------------------------- */
  const visitorA = await getFeed(feedUrl(publicKey), { headers: { cookie: 'nose_session=abc; other=1', 'user-agent': 'Mozilla/5.0 (Macintosh)',
    'x-forwarded-for': '198.51.100.7', 'x-nf-client-connection-ip': '198.51.100.7', 'accept-language': 'en-US', referer: `${SHOP}/order/12345` } });
  const visitorB = await getFeed(feedUrl(publicKey), { headers: { 'user-agent': 'Mozilla/5.0 (iPhone)', 'x-forwarded-for': '203.0.113.50',
    'x-nf-client-connection-ip': '203.0.113.50', 'accept-language': 'es-US', referer: `${SHOP}/order/99999` } });
  check('two visitors - other cookies, browsers, addresses, languages, pages - get byte-identical replies, headers included',
    [visitorA.status, visitorB.status, visitorA.bytes.equals(visitorB.bytes), JSON.stringify(visitorA.headerList) === JSON.stringify(visitorB.headerList)],
    [200, 200, true, true]);
  check('...the store\'s origin echoed with Vary: Origin, briefly cacheable, JSON, nosniff - and no other header',
    visitorA.headers, { 'access-control-allow-origin': SHOP, 'cache-control': 'public, max-age=60', 'content-type': 'application/json; charset=utf-8',
                        vary: 'Origin', 'x-content-type-options': 'nosniff' });
  const fromMenu = await getFeed(feedUrl(publicKey), { origin: MENU });
  check('...its other origin gets the same bytes, with that origin echoed',
    [fromMenu.status, fromMenu.bytes.equals(visitorA.bytes), fromMenu.headers['access-control-allow-origin']], [200, true, MENU]);
  const later = await getFeed(feedUrl(publicKey));
  check('...and a moment later the same bytes again: nothing in it moves per request', later.bytes.equals(visitorA.bytes), true);

  /* --- the feed: what it holds --------------------------------------------- */
  const F = visitorA.json;
  check('the reply is the store and its batches', Object.keys(F), ['store', 'batches']);
  check('...the store: its window and its guardrail, as set - and nothing else of it', F.store,
    { window_months: 12, guardrail_thc_points: 5, guardrail_cbd_points: null });
  check('...each batch: exactly the prompt\'s fields, in its order', [...new Set(F.batches.map(b => Object.keys(b).join(',')))],
    [b2b.FEED_FIELDS.join(',')]);
  check('...those fields are batch_id, product_id, list_position, category, route, name, brand, product_url, in_stock, thc_percent, cbd_percent, lab, harvest_on, report_on, usable, total_terpenes and terps',
    b2b.FEED_FIELDS, ['batch_id', 'product_id', 'list_position', 'category', 'route', 'name', 'brand', 'product_url', 'in_stock',
                      'thc_percent', 'cbd_percent', 'lab', 'harvest_on', 'report_on', 'usable', 'total_terpenes', 'terps']);
  check('every batch the store listed within its window, in stock or not, in the store\'s order - not the one listed 400 days ago, nothing of another store',
    F.batches.map(b => [b.list_position, b.batch_id, b.in_stock]),
    [[1, 'B-ACC-OLD', false], [2, 'B-ACC', true], [3, 'B-REF', true], [4, 'B-UNF', true], [5, 'B-OLD', false], [6, 'B-NOLINK', true], [7, 'B-SOLD', false]]);
  const by = id => F.batches.find(b => b.batch_id === id);
  check('...the catalog\'s own fields as the store sent them: product, category, route, name, brand, link to the product, THC and CBD',
    ['B-ACC', 'B-NOLINK', 'B-SOLD'].map(id => { const b = by(id); return [b.product_id, b.category, b.route, b.name, b.brand, b.product_url, b.thc_percent, b.cbd_percent]; }),
    [['P-ACC', 'vape', 'inhalation', 'Name of B-ACC', 'House Brand', `${SHOP}/menu/P-ACC`, 21.5, 0.4],
     ['P-NOLINK', 'pre-roll', 'smoking', 'Name of B-NOLINK', null, null, null, null],
     ['P-SOLD', 'flower', 'smoking', 'Name of B-SOLD', 'House Brand', `${SHOP}/menu/P-SOLD`, 19, 0]]);
  const acc = by('B-ACC');
  check('an accepted reading: usable, its lab and days, the total the lab printed, and the terpenes exactly as the parser read them',
    [acc.usable, acc.lab, acc.harvest_on, acc.report_on, acc.total_terpenes, JSON.stringify(sorted(acc.terps)) === JSON.stringify(sorted(KAY_CAR.terps)),
     Object.keys(acc.terps).length],
    [true, 'Kaycha Labs', '2025-07-07', null, 4.124, true, 15]);
  check('...out of stock too - a past purchase is still found: the earlier batch of the same product, and a batch long out of stock',
    [by('B-ACC-OLD').usable, by('B-ACC-OLD').total_terpenes, by('B-ACC-OLD').lab, by('B-SOLD').usable, by('B-SOLD').total_terpenes,
     JSON.stringify(sorted(by('B-SOLD').terps)) === JSON.stringify(sorted(KAY_PRR.terps))],
    [true, 2.008, 'ACS Laboratory', true, 0.944, true]);
  const ref = by('B-REF');
  check('a refused reading: usable false, its lab and days, and no terpenes and no total - never a guess',
    [ref.usable, ref.lab, ref.harvest_on, ref.report_on, ref.terps, ref.total_terpenes], [false, 'TerpLife Labs', null, '2024-11-11', null, null]);
  const NOTHING = { lab: null, harvest_on: null, report_on: null, usable: null, total_terpenes: null, terps: null };
  const readOf = b => ({ lab: b.lab, harvest_on: b.harvest_on, report_on: b.report_on, usable: b.usable, total_terpenes: b.total_terpenes, terps: b.terps });
  check('no reading NOSE stands by - a link that gave no report, a link the store has since corrected, no link at all: usable null, and nothing read',
    ['B-UNF', 'B-OLD', 'B-NOLINK'].map(id => readOf(by(id))), [NOTHING, NOTHING, NOTHING]);
  const stale = await one(`select usable, total_terpenes::text as t, lab from b2b.batch_reads where batch_id = 'B-OLD'`);
  check('...though the corrected batch\'s old reading is still held - accepted, with numbers - none of it reaches the feed',
    [stale.usable, stale.t, stale.lab, by('B-OLD').total_terpenes, visitorA.text.includes('0.944') && by('B-SOLD').total_terpenes === 0.944],
    [true, '0.944', 'Kaycha Labs', null, true]);
  check('no lab-report link, no query from one, no sale, quantity, reason, warning, form or freshness figure anywhere in the reply',
    /coa\.example|sample=|expires=|coa_url|read_url|reject|warning|moisture|water|product_class|read_by|read_on|listed_on|quantit|sales?\b|price|stock_level/i.test(visitorA.text),
    false);
  check('...and no field that names a person, at any depth', findPersonalKey(F), null);
  check('...nothing logged on success', successLines, []);

  /* --- the feed: a revoked key, a new one ---------------------------------- */
  await adminCmd(['revoke', 'test-shop', '--public']);
  const revoked = await getFeed(feedUrl(publicKey));
  check('a revoked key: 403, no CORS header, no data', [revoked.status, revoked.headers['access-control-allow-origin'], revoked.json && revoked.json.error,
    /B-ACC|batch/.test(revoked.text)], [403, undefined, 'forbidden', false]);
  const rotated = keysIn((await adminCmd(['rotate-keys', 'test-shop', '--public'])).text).find(k => k.startsWith('npk_'));
  const stillRevoked = await getFeed(feedUrl(publicKey));
  const withNew = await getFeed(feedUrl(rotated));
  check('...the new key opens the same feed, byte for byte; the old one stays refused',
    [stillRevoked.status, withNew.status, withNew.bytes.equals(visitorA.bytes)], [403, 200, true]);
  const revokedVote = await sendVote(ballot());
  check('...and a vote with the revoked key is refused, nothing kept', [revokedVote.status, voteKeys()], [403, []]);
  publicKey = rotated;

  /* --- the feed: the database failing --------------------------------------- */
  pgFails = 'connect';
  const downConnect = await getFeed(feedUrl(publicKey));
  pgFails = b2b.FEED_SQL;
  const downFeedSql = await getFeed(feedUrl(publicKey));
  pgFails = null;
  check('the database failing - no connection, a statement timing out: 503 and one fixed line, without detail',
    [downConnect.status, downConnect.lines, downFeedSql.status, downFeedSql.lines, downConnect.headers['access-control-allow-origin']],
    [503, ['error: b2b-feed: the database did not answer - no feed served'], 503, ['error: b2b-feed: the database did not answer - no feed served'], undefined]);

  /* --- the vote: the request ------------------------------------------------- */
  const q3 = pgLog.length;
  const c3 = blobs.calls.length;
  const getVote = await sendVote(null, { method: 'GET' });
  check('the vote answers POST alone: 405, Allow: POST', [getVote.status, getVote.headers.allow], [405, 'POST']);
  const types = [];
  for (const contentType of [null, 'application/json', 'text/csv', 'multipart/form-data; boundary=x', 'text/plainx']) types.push((await sendVote(ballot(), { contentType })).status);
  check('...a body that is not text/plain, or has no type, is refused, 415 - from a page it would have needed a preflight', types, [415, 415, 415, 415, 415]);
  check('...fetch gives a string body text/plain;charset=UTF-8 itself, as sendBeacon does: what the vote takes',
    new Request(VOTE_URL, { method: 'POST', body: '{}' }).headers.get('content-type'), 'text/plain;charset=UTF-8');
  const plainOk = [];
  for (const contentType of ['text/plain;charset=UTF-8', 'text/plain', 'Text/Plain; charset=utf-8']) plainOk.push((await sendVote(ballot(), { contentType })).status);
  check('...text/plain is taken as sendBeacon sends a string, parameters and letter case aside', plainOk, [204, 204, 204]);
  const ballots = voteKeys().length;
  const bodies = [['', 'empty-body'], ['not json', 'invalid-json'], ['[]', 'not-an-object'], ['"vote"', 'not-an-object'], ['null', 'not-an-object'],
                  [JSON.stringify({ ...ballot(), candidate: 'x'.repeat(3000) }), 'body-too-large']];
  const badBodies = [];
  for (const [raw] of bodies) badBodies.push(await sendVote(null, { raw }));
  check('a body that is empty, not JSON, not an object, or over 2 KB: 400 with beacon.js\'s own reason',
    badBodies.map(r => [r.status, r.json && r.json.reason]), bodies.map(([, reason]) => [400, reason]));
  const declared = await sendVote(ballot(), { headers: { 'content-length': '999999' } });
  check('...a declared length over the cap is refused before the body is read', [declared.status, declared.json && declared.json.reason], [400, 'body-too-large']);

  const EXTRA = ['palate', 'palateIds', 'purchases', 'batchIds', 'batchId', 'shopper', 'shopperId', 'userId', 'user_id', 'sessionId', 'deviceId',
                 'email', 'phone', 'ip', 'userAgent', 'ts', 'clientTs', 'time', 'timestamp', 'day', 'date', 'store', 'slug', 'origin',
                 'name', 'strain', 'terps', 'group', 'consent', 'x', '__proto__', 'constructor'];
  const extras = [];
  for (const field of EXTRA) extras.push(await sendVote(null, { raw: JSON.stringify(ballot()).replace(/^\{/, `{${JSON.stringify(field)}:1,`) }));
  check(`every extra field refused - ${EXTRA.length} of them, a palate list, a shopper or session ID and a client time among them: 400 unknown-field`,
    [...new Set(extras.map(r => `${r.status} ${r.json && r.json.reason}`))], ['400 unknown-field']);
  const missing = [];
  for (const field of ['key', 'candidate', 'score', 'band', 'palateSize', 'vote']) {
    const b = ballot();
    delete b[field];
    missing.push(await sendVote(b));
  }
  check('...and every missing one: 400 missing-field', [...new Set(missing.map(r => `${r.status} ${r.json && r.json.reason}`))], ['400 missing-field']);
  const BAD = [
    ['key', [otherSecret, 'npk_short', '', null, 7], 'bad-key'],
    ['candidate', ['', ' P-ACC', 'P-ACC ', 'P\nACC', 'x'.repeat(201), 12, null, ['P-ACC']], 'bad-candidate'],
    ['score', [-1, 101, 74.5, '74', null, true], 'bad-score'],
    ['band', ['strong', 'STRONG', 'Partial', 'Weak', 'Close match', 'High', '', null], 'bad-band'],
    ['palateSize', [0, 1001, 2.5, '3', -1, null], 'bad-palate-size'],
    ['vote', ['yes', 'Up', true, '', null], 'bad-vote']
  ];
  const badValues = [];
  for (const [field, values, reason] of BAD) {
    for (const value of values) {
      const r = await sendVote(ballot({ [field]: value }));
      badValues.push([field, JSON.stringify(value), r.status, r.json && r.json.reason === reason]);
    }
  }
  check('each bad value refused with its reason: a secret or malformed key, a padded or overlong product, a score off 0-100 or not whole, a band matchBand() never gives (Partial, Weak), a palate size off 1-1000, a vote neither up nor down',
    badValues.filter(([, , status, ok]) => status !== 400 || !ok), []);
  check('...and none of those reached the database or the vote store', [pgLog.length - q3 - plainOk.length, voteKeys().length - ballots,
    blobs.calls.slice(c3).filter(c => c[0] === 'setJSON').length - plainOk.length], [0, 0, 0]);

  /* --- the vote: where it goes ----------------------------------------------- */
  const beforeTargets = voteKeys().length;
  const notListed = [];
  for (const candidate of ['P-GONE', 'P-O1', 'P-NONE', 'p-acc']) notListed.push(await sendVote(ballot({ candidate })));
  check('a product the store did not list in its window - one listed 400 days ago, another store\'s, one never listed, another letter case: 400, nothing kept',
    [notListed.map(r => `${r.status} ${r.json && r.json.reason}`), voteKeys().length - beforeTargets],
    [['400 bad-candidate', '400 bad-candidate', '400 bad-candidate', '400 bad-candidate'], 0]);
  const voteOrigins = [];
  for (const origin of foreign) voteOrigins.push(await sendVote(ballot(), { origin }));
  check('the feed\'s origin rule: from any origin but the store\'s own, 403 and nothing kept, no CORS header',
    [voteOrigins.map(r => r.status), voteOrigins.every(r => r.headers['access-control-allow-origin'] === undefined), voteKeys().length - beforeTargets],
    [foreign.map(() => 403), true, 0]);
  const otherKeyHere = await sendVote(ballot({ key: otherPublic, candidate: 'P-O1' }));
  check('...another store\'s key from this store\'s page: refused', otherKeyHere.status, 403);

  /* One vote per band, both ways: the score and band the app would send. */
  const COSINES = { Strong: 0.95, Good: 0.8, Moderate: 0.6, Low: 0.3 };
  const cast = [];
  for (const band of votesLib.BANDS) {
    for (const way of ['up', 'down']) {
      const sent = { ...ballot({ candidate: 'P-SOLD', vote: way, palateSize: 4 }), ...bandVote(COSINES[band]) };
      cast.push({ band, way, sent, res: await sendVote(sent, { origin: MENU }) });
    }
  }
  check('one vote per band, up and down, each with the score shownScore() gives and matchBand()\'s band: 204 every time',
    cast.map(c => [c.sent.band, c.sent.score, c.res.status]),
    [['Strong', 95, 204], ['Strong', 95, 204], ['Good', 80, 204], ['Good', 80, 204], ['Moderate', 60, 204], ['Moderate', 60, 204], ['Low', 30, 204], ['Low', 30, 204]]);
  check('...each reply a bare 204 with the page\'s origin echoed and Vary: Origin', [...new Set(cast.map(c => JSON.stringify([c.res.text, c.res.headers])))],
    [JSON.stringify(['', { 'access-control-allow-origin': MENU, 'cache-control': 'no-store', vary: 'Origin' }])]);
  const KEY_SHAPE = /^votes\/test-shop\/(Strong|Good|Moderate|Low)\/(up|down)\/(\d{4}-\d{2}-\d{2})\/([0-9a-f]{32})$/;
  const allKeys = voteKeys();
  const byBand = votesLib.BANDS.map(band => votesLib.VOTES.map(way => allKeys.filter(k => k.startsWith(`votes/test-shop/${band}/${way}/`)).length));
  check('all four bands stored, up and down: one blob per vote under votes/<store slug>/<band>/<vote>/<UTC day>/<random>',
    [byBand.map(([up, down]) => up >= 1 && down >= 1), allKeys.every(k => KEY_SHAPE.test(k))], [[true, true, true, true], true]);
  const castKeys = allKeys.filter(k => !/\/Good\/up\//.test(k));
  check('...the Moderate and Low votes among them, which the consumer\'s endpoint refuses',
    ['Moderate', 'Low'].map(b => castKeys.filter(k => k.includes(`/${b}/`)).length), [2, 2]);
  check('...the day is the database\'s UTC day, and the key holds nothing else of time',
    [...new Set(allKeys.map(k => KEY_SHAPE.exec(k)[3]))], [today]);
  const values = allKeys.map(valueOf);
  check('...the value is { candidate, score, palateSize } and nothing else - no time, no metadata, no other field',
    [[...new Set(values.map(v => Object.keys(JSON.parse(v.text)).join(',')))], [...new Set(values.map(v => v.metadata))],
     [...new Set(values.map(v => v.opts.join(',')))]], [['candidate,score,palateSize'], [null], ['onlyIfNew']]);
  const strongUp = allKeys.find(k => k.includes('/Strong/up/'));
  check('...as sent: a Strong vote keeps its product, its score and its palate size', JSON.parse(valueOf(strongUp).text),
    { candidate: 'P-SOLD', score: 95, palateSize: 4 });
  const TIME = /\d{2}:\d{2}|T\d{2}|\d{9,}|Z\b/;
  check('no time of day anywhere in a stored vote, key or value', allKeys.filter(k => TIME.test(k.replace(KEY_SHAPE, '$1/$2/$3')) || TIME.test(valueOf(k).text)), []);
  /* Twenty identical votes, in order: keys that held a time or a counter would
     list in that order. */
  const arrival = [];
  for (let i = 0; i < 20; i++) {
    const before = new Set(voteKeys());
    await sendVote(ballot({ candidate: 'P-REF', band: 'Low', score: 12, vote: 'down', palateSize: 2 }));
    arrival.push(voteKeys().find(k => !before.has(k)));
  }
  const listed = voteKeys().filter(k => arrival.includes(k));
  check('...twenty identical votes are twenty blobs, whose keys list in no order they arrived in',
    [new Set(arrival).size, listed.length, JSON.stringify(listed) === JSON.stringify(arrival)], [20, 20, false]);
  check('nothing logged on success, and nothing but the "b2b-votes" store ever opened - never the consumer\'s "match-feedback"',
    [successLines, [...new Set(blobs.opened.map(o => o.name))], [...new Set(blobs.opened.map(o => o.consistency))]],
    [[], ['b2b-votes'], ['strong']]);
  check('...the function opens it as Netlify hands a Request function its Blobs context: a name and strong consistency, no credentials of its own',
    [...new Set(blobs.opened.filter(o => !o.siteID).map(o => JSON.stringify(o)))], ['{"name":"b2b-votes","consistency":"strong"}']);

  /* --- the vote: the daily cap ------------------------------------------- */
  check('the cap: 100 votes a store a UTC day unless B2B_VOTE_DAILY_CAP says otherwise - a whole number up to 100000, 0 keeping none',
    [undefined, '', 'abc', '-1', '1e3', ' 5', '5 ', '3.5', '0', '7', '100000', '100001', '1234567']
      .map(v => votesLib.dailyCap(v === undefined ? {} : { B2B_VOTE_DAILY_CAP: v })),
    [100, 100, 100, 100, 100, 100, 100, 100, 0, 7, 100000, 100, 100]);
  const heldToday = (await Promise.all(votesLib.BANDS.flatMap(b => votesLib.VOTES.map(w =>
    voteStore().list({ prefix: `votes/test-shop/${b}/${w}/${today}/` }))))).reduce((n, l) => n + l.blobs.length, 0);
  process.env.B2B_VOTE_DAILY_CAP = String(heldToday + 2);
  const keptAtCap = [];
  for (let i = 0; i < 2; i++) keptAtCap.push(await sendVote(ballot({ band: 'Strong', score: 91, vote: 'up' })));
  const nCapped = voteKeys().length;
  const capped = [];
  for (const band of votesLib.BANDS) capped.push(await sendVote(ballot({ ...bandVote(COSINES[band]), vote: 'down' })));
  check(`the store's day at its cap (${heldToday + 2}): the next votes, any band, are dropped - nothing kept`,
    [keptAtCap.map(r => r.status), voteKeys().length - nCapped], [[204, 204], 0]);
  check('...and the reply is the same as a kept vote\'s, byte for byte: status, headers, body',
    [...new Set([...keptAtCap, ...capped].map(r => JSON.stringify([r.status, r.headerList, r.text])))].length, 1);
  check('...one fixed line for each, naming no store', capped.map(r => r.lines),
    capped.map(() => ['error: b2b-vote: a store reached its daily cap - vote dropped, reply unaffected']));
  const otherVote = await sendVote(ballot({ key: otherPublic, candidate: 'P-O1' }), { origin: OTHER });
  check('...per store: another store\'s first vote that day is kept', [otherVote.status, voteKeys().filter(k => k.startsWith('votes/other-shop/')).length], [204, 1]);
  process.env.B2B_VOTE_DAILY_CAP = '0';
  const none = await sendVote(ballot({ key: otherPublic, candidate: 'P-O1' }), { origin: OTHER });
  check('...a cap of 0 keeps no vote at all, with the same reply', [none.status, voteKeys().filter(k => k.startsWith('votes/other-shop/')).length], [204, 1]);
  delete process.env.B2B_VOTE_DAILY_CAP;

  /* --- the vote: failures -------------------------------------------------- */
  const n0 = voteKeys().length;
  delete process.env.NOSE_B2B_DB_URL;
  const noDbVote = await sendVote(ballot());
  process.env.NOSE_B2B_DB_URL = fakeB2bUrl();
  pgFails = 'connect';
  const dbDown = await sendVote(ballot());
  pgFails = b2b.VOTE_TARGET_SQL;
  const dbSlow = await sendVote(ballot());
  pgFails = null;
  blobs.fail = 'list';
  const listDown = await sendVote(ballot());
  blobs.fail = 'set';
  const setDown = await sendVote(ballot());
  blobs.fail = null;
  blobs.noEtag = true;
  const noEtag = await sendVote(ballot());
  blobs.noEtag = false;
  check('failures: no database configured, the database or the vote store not answering, a write Blobs does not confirm with an ETag - 503, one fixed line each, without detail',
    [[noDbVote, dbDown, dbSlow, listDown, setDown, noEtag].map(r => [r.status, r.lines]), voteKeys().length - n0],
    [[[503, ['error: b2b-vote: no database configured - vote not kept']], [503, ['error: b2b-vote: the database did not answer - vote not kept']],
      [503, ['error: b2b-vote: the database did not answer - vote not kept']], [503, ['error: b2b-vote: the vote store did not answer - vote not kept']],
      [503, ['error: b2b-vote: the vote store did not answer - vote not kept']], [503, ['error: b2b-vote: the vote store did not answer - vote not kept']]], 0]);

  /* --- delete-store: the votes go with the store ---------------------------- */
  const otherVotes = () => voteKeys().filter(k => k.startsWith('votes/other-shop/'));
  const shopVotes = voteKeys().filter(k => k.startsWith('votes/test-shop/'));
  const noVoteStore = await (async () => { try { await adminCmd(['delete-store', 'other-shop', '--yes'], { votes: null }); return null; } catch (e) { return e; } })();
  check('delete-store without the vote store changes nothing, and says why',
    [noVoteStore instanceof admin.Refusal, noVoteStore && noVoteStore.message, otherVotes().length, !!(await one(`select 1 as x from b2b.stores where slug = 'other-shop'`))],
    [true, 'delete-store also deletes the store\'s votes from Netlify Blobs, and no vote store was given - nothing was changed', 1, true]);
  const dry = await adminCmd(['delete-store', 'other-shop']);
  check('delete-store, dry run: it counts the store\'s votes with its rows, and changes nothing',
    [dry.lines.some(l => l === '  1 vote in Netlify Blobs (store b2b-votes, under votes/other-shop/)'), dry.lines[dry.lines.length - 1], otherVotes().length],
    [true, 'dry run - nothing was changed; --yes deletes all of it', 1]);
  const gone = await adminCmd(['delete-store', 'other-shop', '--yes']);
  check('delete-store --yes: the store\'s rows and its votes are gone - and every other store\'s votes are as they were',
    [!!(await one(`select 1 as x from b2b.stores where slug = 'other-shop'`)), otherVotes().length, gone.r.votes,
     JSON.stringify(voteKeys().filter(k => k.startsWith('votes/test-shop/'))) === JSON.stringify(shopVotes), gone.lines[gone.lines.length - 1]],
    [false, 0, 1, true, 'deleted 1 vote from Netlify Blobs']);
  const thirdKeys = keysIn((await adminCmd(['create', 'third-shop', '--name', 'Third Shop', '--origin', 'https://third.example'])).text);
  const thirdId = (await one(`select id::text as id from b2b.stores where slug = 'third-shop'`)).id;
  await b2b.upsertBatches(thirdId, [row('T-1', 'P-T1', 0, 'flower', 'smoking')], { client: asB2b });
  for (let i = 0; i < 3; i++) await sendVote(ballot({ key: thirdKeys.find(k => k.startsWith('npk_')), candidate: 'P-T1' }), { origin: 'https://third.example' });
  const thirdVotes = () => voteKeys().filter(k => k.startsWith('votes/third-shop/'));
  const three = thirdVotes().length;
  blobs.deletesLeft = 1;
  const partway = await (async () => { try { await adminCmd(['delete-store', 'third-shop', '--yes']); return null; } catch (e) { return e; } })();
  blobs.deletesLeft = Infinity;
  check('Blobs failing part way: the database half is deleted, one vote of three, and it says to run the same command again',
    [three, partway instanceof admin.Refusal, partway && partway.message, !!(await one(`select 1 as x from b2b.stores where slug = 'third-shop'`)), thirdVotes().length],
    [3, true, 'the database half is deleted, but Netlify Blobs stopped answering after 1 vote - run the same command again: it deletes the votes left', false, 2]);
  const again = await adminCmd(['delete-store', 'third-shop']);
  const finish = await adminCmd(['delete-store', 'third-shop', '--yes']);
  check('...run again: with no store row left it finds the votes under its name, a dry run deletes nothing, --yes deletes the rest',
    [again.lines[0], again.lines[1], finish.lines[finish.lines.length - 1], thirdVotes().length],
    ['delete-store (dry run): no store called "third-shop" is left in the database - only votes under its name, which an earlier delete-store did not finish deleting',
     '  2 votes in Netlify Blobs (store b2b-votes, under votes/third-shop/)', 'deleted 2 votes from Netlify Blobs', 0]);
  const nothingLeft = await (async () => { try { await adminCmd(['delete-store', 'third-shop']); return null; } catch (e) { return e; } })();
  check('...and once nothing is left, the store is refused as before', nothingLeft && nothingLeft.message, 'no store called "third-shop" - nothing was changed');
  check('a slug\'s votes only: deleting "test" would not reach "test-shop" - the prefix ends with a slash', votesLib.storePrefix('test'), 'votes/test/');
  const cli = spawnSync(process.execPath, [ADMIN, 'delete-store', 'test-shop', '--yes'],
    { env: { PATH: process.env.PATH, HOME: process.env.HOME || os.tmpdir(), NOSE_DB_ADMIN_URL: 'postgresql://postgres.abcdefghijklmnopqrst@localhost:1/postgres' },
      encoding: 'utf8', timeout: 20000 });
  check('from the command line, delete-store without NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN refuses before it connects (exit 1)',
    [cli.status, /^REFUSED: delete-store also deletes the store's votes from Netlify Blobs - it needs NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN/.test(cli.stderr), cli.stdout],
    [1, true, '']);
  const callers = [];
  for (const dir of ['netlify', 'scripts']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir), { recursive: true }).map(String)) {
      const p = path.join(ROOT, dir, f);
      if (/\.(c|m)?js$/.test(f) && !f.split(path.sep).includes('node_modules') && /removeStoreVotes\(/.test(codeOf(fs.readFileSync(p, 'utf8')))) callers.push(path.relative(ROOT, p));
    }
  }
  check('only delete-store deletes votes: scripts/b2b-store.js and the votes module itself, no function', callers.sort(),
    ['netlify/functions/lib/b2b-votes.js', 'scripts/b2b-store.js']);

  /* --- nothing consumer, nothing archive ------------------------------------- */
  check('the b2b tables changed only as this test changed them: no function wrote a row',
    pgLog.filter(s => /^\s*(insert|update|delete)\b/i.test(s)).length, 0);
  check('schema nose untouched, the archive never reached: storeScan, saveScan, archiveScan, the coa-pdf store - their stand-ins never touched',
    [await noseCounts(), archiveCalls, [...new Set(blobs.opened.map(o => o.name))]], [noseBefore, [], ['b2b-votes']]);
  check('...coa.js, lib/archive.js, lib/pdf-store.js, match-feedback.js and pg itself never loaded',
    [COA, ARCHIVE, PDF_STORE, path.join(ROOT, 'netlify/functions/match-feedback.js')].map(f => loads.includes(f))
      .concat(loads.some(f => /[\\/]node_modules[\\/]pg[\\/]/.test(f))), [false, false, false, false, false]);

  await pglite.close();
  finished = true;
  if (failures) {
    console.error(`\nb2b-endpoints-test: ${failures} failure${failures === 1 ? '' : 's'}`);
    process.exit(1);
  }
  console.log('\nb2b-endpoints clean');
}

main().catch(async e => {
  console.error('b2b-endpoints-test threw:', e && e.stack);
  try { if (pglite) await pglite.close(); } catch { /* exiting */ }
  process.exit(1);
});

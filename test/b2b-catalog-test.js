#!/usr/bin/env node
'use strict';
/* NOSE - the catalog upload (netlify/functions/b2b-catalog.js), the batch
 * reader (scripts/b2b-read-catalog.js) and the coverage report read from the
 * database (scripts/b2b-coverage.js --store), offline. PARSER-HANDOFF s14.
 *
 *   node test/b2b-catalog-test.js     -> "b2b-catalog clean", or FAIL lines and exit 1
 *
 * On PGlite: every migration applied in filename order, and stores made by
 * the admin script. The function is driven through its own default export,
 * with a stand-in for pg that runs each statement on PGlite AS nose_b2b. The
 * catalog's links are answered by a stand-in fetch from fixture PDFs and
 * portal pages git already tracks, exactly as test/b2b-coverage-test.js
 * answers them - only the network is stood in for.
 *
 * What it pins down:
 *   - the switch: off, a plain 404 before anything else, no database touched
 *   - the key: the store's working secret key alone; a public, unknown,
 *     revoked, malformed or missing key gets one and the same 401; the hash
 *     compared in constant time
 *   - the body: at most 4 MB, by Content-Length before it is read and counted
 *     while it is read; refused on the coverage script's own columns, by the
 *     coverage script's own reader
 *   - an upload is a whole snapshot: listed batches upserted with their row
 *     number as list_position, every other batch kept and marked out of
 *     stock, a refused row's batch left as it was, an upload with nothing to
 *     keep changing nothing; the reply counts only, plus refused rows by row
 *     and reason
 *   - logs: nothing on success, one fixed line without detail on failure
 *   - the reader: every listed batch with a link and no current reading, in
 *     stock or not; an accepted read keeps the parser's terpenes and total, a
 *     refusal its reasons and no figure, a link that gives no report the
 *     fetcher's words, tried again next run; --dry-run writes nothing;
 *     --reread, --limit; a corrected link read again; a fetch failure never
 *     replaces a reading; never from another batch, store or strain name
 *   - --store: the report from the database matches the CSV run on every
 *     batch the upload kept - outcome, reasons, lab, figures, flags - and its
 *     counts differ from the CSV run's by exactly the rows the upload refused
 *   - schema nose untouched; coa.js, lib/archive.js and lib/pdf-store.js never
 *     loaded, the archive never reached
 *
 * Needs `npm install` (unpdf, PGlite) and the committed fixture PDFs. Nothing
 * it does reaches the network, a real database or Netlify. No key is written
 * in this file: every one is made when the test runs.
 */

for (const k of ['NOSE_DB_URL', 'NOSE_DB_ADMIN_URL', 'NOSE_B2B_DB_URL', 'B2B_ENABLED']) delete process.env[k];

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
const FUNCTION = path.join(ROOT, 'netlify/functions/b2b-catalog.js');
const READER = path.join(ROOT, 'scripts/b2b-read-catalog.js');
const COVERAGE = path.join(ROOT, 'scripts/b2b-coverage.js');
const FORMAT = path.join(LIB, 'b2b-catalog-format.js');
const STORE_LIB = path.join(LIB, 'b2b-store.js');
const COA = path.join(ROOT, 'netlify/functions/coa.js');
const ARCHIVE = path.join(LIB, 'archive.js');
const PDF_STORE = path.join(LIB, 'pdf-store.js');
const FIX = path.join(ROOT, 'test/fixtures/b2b');
const CATALOG = path.join(FIX, 'catalog.csv');
const READ_SOURCE_MIGRATION = '20261008150000_nose_b2b_read_source.sql';
/* As committed for its first push. An applied migration is never edited. */
const READ_SOURCE_SHA256 = 'cbbc5a56305a52024da258c79b2218fe3af8e7e7c2afaa8b1cf0b677427df328';

/* A run that stops on a promise nothing keeps alive exits 0 quietly. Only
 * reaching the end counts. */
let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) {
    process.stderr.write('b2b-catalog: stopped before the last check - NOT clean\n');
    process.exitCode = 1;
  }
});

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
}
const has = (s, part) => typeof s === 'string' && s.includes(part);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const codeOf = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const EFFECT_WORDS = /\b(effects?|high|stoned|buzz\w*|relax\w*|energ\w*|calm\w*|focus\w*|sleep\w*|sedat\w*|uplift\w*|euphori\w*|mood\w*|potency|potent|strong(?:er)? hit)\b/i;

/* ------------------------------------------- before anything B2B loads */

/* The archive's two halves, as recorders: anything that touches them is
   recorded, and nothing here may. */
const archiveCalls = [];
function recorder(name) {
  return new Proxy({}, { get: (_, key) => {
    archiveCalls.push(`${name}.${String(key)}`);
    return (...args) => { archiveCalls.push(`${name}.${String(key)}()`); return Promise.resolve({ kept: false, args: args.length }); };
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
const store = require(path.join(LIB, 'store.js'));
const realSaveScan = store.saveScan;
store.saveScan = (...a) => { archiveCalls.push('store.saveScan()'); return realSaveScan(...a); };

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
const FAKE_PG = path.join(ROOT, 'test', '.b2b-catalog-test-pg.js');
install(FAKE_PG, { Client: FakeClient });
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === 'pg' ? FAKE_PG : resolve.call(this, request, ...rest);
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
const format = require(FORMAT);
const cov = require(COVERAGE);
const reader = require(READER);
const admin = require(path.join(ROOT, 'scripts/b2b-store.js'));

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

/* The function is ES module syntax in a CommonJS package, as palate-sync.js
   is; Netlify's esbuild bundler compiles it (netlify.toml, node_bundler). Node
   has to be told, so a one-file hook loads it as a module. Its lib/ imports
   are the same CommonJS modules this test holds. */
async function loadFunction() {
  const url = pathToFileURL(FUNCTION).href;
  Module.register('data:text/javascript,' + encodeURIComponent(`
    export async function load(url, context, next) {
      if (url === ${JSON.stringify(url)}) {
        const r = await next(url, { ...context, format: 'module' });
        return { ...r, format: 'module', shortCircuit: true };
      }
      return next(url, context);
    }`));
  return (await import(url)).default;
}

/* --- the network, stood in for, as test/b2b-coverage-test.js has it ------- */

const pdf = n => fs.readFileSync(path.join(ROOT, 'test/fixtures/pdf', `${n}.pdf`));
const page = n => fs.readFileSync(path.join(ROOT, 'test/fixtures/pages', n));
const html = s => Buffer.from(`<!doctype html><html><body>${s}</body></html>${' '.repeat(600)}`);
const BROKEN = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(900, 0x41)]);
const LISTINGS = 'https://coaportal.com/sunburn/listings/?search=5637041429622699';
const REPORT = 'https://coaportal.com/sunburn/report/?search=Sunburn-5637041429622699-2608CBR0160-002';
const VIEWER = 'https://yourcoa.com/coa/coa-view?sample=MI60617015-004';
const SERVED = {
  [VIEWER]: () => html('<iframe src="/pdfjs/web/viewer.html"></iframe>'),
  'https://yourcoa.com/coa/coa-download/MI60617015-004?wl_id=0&mrk=0&is_view=1': () => pdf('Grease_Monkey_cart'),
  'https://coa.example/acs/ACS-FLW-002.pdf': () => pdf('ACS-FLW-002'),
  'https://coa.example/kaycha/KAY-PRR-001.pdf': () => pdf('KAY-PRR-001'),
  'https://coa.example/kaycha/KAY-LRS-002.pdf': () => pdf('KAY-LRS-002'),
  'https://coa.example/kaycha/KAY-CAR-001.pdf': () => pdf('KAY-CAR-001'),
  'https://coa.example/kaycha/KAY-FLW-001.pdf': () => pdf('KAY-FLW-001'),
  'https://coa.example/kaycha/KAY-FLW-003.pdf': () => pdf('KAY-FLW-003'),
  'https://coa.example/terplife/GreenRoads.pdf': () => pdf('GreenRoadsFullSpectrumCBDOil750mgLot24007'),
  'https://coa.example/broken.pdf': () => BROKEN,
  'https://coa.example/kaycha/KAY-AIO-001.pdf': () => pdf('KAY-AIO-001'),
  'https://coa.example/kaycha/KAY-AIO-001.pdf#page=1': () => pdf('KAY-AIO-001'),
  'https://coa.example/kaycha/KAY-LRS-001.pdf': () => pdf('KAY-LRS-001'),
  'https://coa.example/kaycha/Kush_Creek.pdf': () => pdf('Kush_Creek'),
  'https://coa.example/hemp-bombs.pdf': () => pdf('hemp-bombs-cbd-gummies-50-count-750mg-of-cbd-COA'),
  'https://coa.example/kaycha/external-download.pdf': () => pdf('external-download'),
  'https://coa.example/moderncanna/MCL-FLW-002.pdf': () => pdf('MCL-FLW-002'),
  [LISTINGS]: () => page('coaportal-listings.html'),
  [REPORT]: () => page('coaportal-report.html'),
  [`${REPORT}&pdf=6`]: () => pdf('MTL-FLW-002')
};
const REDIRECTS = { 'https://coa.example/redirect-inside': 'http://10.0.0.7/report.pdf' };
const DOWN = new Set();         // links answering 503, for a run on a bad day
const requests = [];
let open = 0;
let mostAtOnce = 0;
async function standInFetch(url) {
  requests.push(String(url));
  open++;
  mostAtOnce = Math.max(mostAtOnce, open);
  try {
    await new Promise(r => setImmediate(r));
    if (DOWN.has(String(url))) return new Response('down', { status: 503 });
    if (REDIRECTS[url]) return new Response(null, { status: 302, headers: { location: REDIRECTS[url] } });
    const body = SERVED[url];
    return body ? new Response(body(), { status: 200 }) : new Response('nothing here', { status: 404 });
  } finally {
    open--;
  }
}
async function withFetch(fn) {
  const saved = globalThis.fetch;
  globalThis.fetch = standInFetch;
  try { return await fn(); } finally { globalThis.fetch = saved; }
}

/* --- what the function and the scripts print ----------------------------- */

const CONSOLE = ['log', 'info', 'warn', 'error', 'debug'];
async function quietly(fn) {
  const lines = [];
  const saved = CONSOLE.map(k => console[k]);
  CONSOLE.forEach(k => { console[k] = (...a) => lines.push(`${k}: ${a.map(String).join(' ')}`); });
  try { return { value: await fn(), lines }; } finally { CONSOLE.forEach((k, i) => { console[k] = saved[i]; }); }
}

async function main() {
  const v = version.fromCheckout();
  if (!v.unpdf) { console.error('FAIL: unpdf is not installed - run: npm install'); process.exit(1); }
  let PGlite;
  try { ({ PGlite } = await import('@electric-sql/pglite')); }
  catch { console.error('FAIL: @electric-sql/pglite is not installed - run: npm install --save-dev @electric-sql/pglite'); process.exit(1); }

  /* ============================================================ the code */

  const fnSrc = fs.readFileSync(FUNCTION, 'utf8');
  const fnCode = codeOf(fnSrc);
  check('the function is a Request function, as palate-sync.js is: one default export, and nothing else exported',
    [(fnCode.match(/^export /gm) || []).length, /^export default async \(request\) => \{$/m.test(fnCode)], [1, true]);
  check('...it asks the switch first, before the method, the key or the body',
    fnCode.split('\n')[fnCode.split('\n').findIndex(l => l.startsWith('export default')) + 1].trim(), 'if (!flag.b2bEnabled()) return notFound();');
  check('...it imports the switch, the store layer and the format reader, whole, and nothing else',
    (fnCode.match(/^import .*$/gm) || []), ["import flag from './lib/b2b-flag.js';", "import b2b from './lib/b2b-store.js';",
                                              "import format from './lib/b2b-catalog-format.js';"]);
  check('...it reads nothing about the caller: no address, user agent, cookie, context, geography or time - and logs only by console.error',
    /x-forwarded|client-ip|connection-ip|user-agent|cookie|\bcontext\b|\bgeo\b|Date\.now|new Date|console\.(log|info|warn|debug)/i.test(fnCode), false);
  const storeSrc = codeOf(fs.readFileSync(STORE_LIB, 'utf8'));
  const secretFn = storeSrc.slice(storeSrc.indexOf('async function storeForSecretKey'), storeSrc.indexOf('async function storeBySlug'));
  check('...the key is found by its SHA-256, and the hash compared in constant time (crypto.timingSafeEqual) - a secret key only',
    [/keyKind\(key\) !== 'secret'/.test(secretFn), /keyHash\(key\)/.test(secretFn), /crypto\.timingSafeEqual\(/.test(secretFn),
     /k\.kind = 'secret' and k\.revoked_on is null/.test(b2b.SECRET_KEY_SQL)], [true, true, true, true]);

  /* One reader of the format, shared. */
  /* readRows is left out: scripts/lib/rerun.js has its own, for the archive's documents. */
  const READER_FN = /\bfunction\s+(parseCsv|checkHeader|readCatalog|looksPersonal)\s*\(/;
  const holders = [];
  for (const dir of ['netlify', 'scripts']) {
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
        else if (/\.(c|m)?js$/.test(e.name) && READER_FN.test(fs.readFileSync(p, 'utf8'))) holders.push(path.relative(ROOT, p));
      }
    })(path.join(ROOT, dir));
  }
  check('the catalog format has one reader: only lib/b2b-catalog-format.js defines it, under netlify/ and scripts/', holders,
    ['netlify/functions/lib/b2b-catalog-format.js']);
  check('...and the coverage script reads with it: the very functions, not copies',
    [cov.readCatalog === format.readCatalog, cov.parseCsv === format.parseCsv, cov.looksPersonal === format.looksPersonal,
     cov.COLUMNS === format.COLUMNS, cov.PERSONAL_WORDS === format.PERSONAL_WORDS, cov.OUTCOMES.rowRefused === format.ROW_REFUSED],
    [true, true, true, true, true, true]);
  const readerCode = codeOf(fs.readFileSync(READER, 'utf8'));
  check('the reader reads through the coverage script\'s own fetch, extract and parse: validateUrl, then readFetched',
    [/require\(path\.join\(LIB, 'fetch-report\.js'\)\)/.test(readerCode), /cov\.readFetched\(checked\.url/.test(readerCode),
     /function\s+(fetchPdf|readFetched|validateUrl)\s*\(/.test(readerCode)], [true, true, false]);
  const readStoreCode = readerCode.slice(readerCode.indexOf('async function readStore'), readerCode.indexOf('function summaryLines'));
  check('...never from a strain name: it reads a batch\'s link, never its name',
    /\bb\.name\b|strain/i.test(readStoreCode), false);
  check('...and names no archive: storeScan, saveScan, archiveScan, coa.js, archive.js, pdf-store, NOSE_DB_URL, schema nose',
    [readerCode, fnCode, codeOf(fs.readFileSync(FORMAT, 'utf8'))].map(c =>
      /storeScan|saveScan|archiveScan|(?<![-\w])coa\.js|(?<![-\w])archive\.js|pdf-store|NOSE_DB_URL|\bnose\.[a-z_]+/i.test(c)), [false, false, false]);
  const mine = ['netlify/functions/b2b-catalog.js', 'netlify/functions/lib/b2b-catalog-format.js', 'scripts/b2b-read-catalog.js',
                `supabase/migrations/${READ_SOURCE_MIGRATION}`, 'docs/B2B-CATALOG-FORMAT.md'];
  check('no effect wording in the upload, the format reader, the reader, the migration or the format document',
    mine.filter(f => EFFECT_WORDS.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))), []);

  /* The migration: additive, and immutable once pushed. */
  const migrationFiles = fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();
  const sourceSql = fs.readFileSync(path.join(MIGRATIONS, READ_SOURCE_MIGRATION), 'utf8');
  check('the reading-source migration sorts last, after the b2b one, and is byte-identical to its first push',
    [migrationFiles[migrationFiles.length - 1], migrationFiles.indexOf('20261008020000_nose_b2b.sql') === migrationFiles.length - 2,
     sha(sourceSql)], [READ_SOURCE_MIGRATION, true, READ_SOURCE_SHA256]);
  check('...it only adds: five columns, one CHECK and comments - no DROP, no grant, nothing in schema nose',
    [(sourceSql.match(/ADD COLUMN/g) || []).length, (sourceSql.match(/ADD CONSTRAINT/g) || []).length,
     /\b(DROP|GRANT|REVOKE|CREATE ROLE|ALTER ROLE)\b/.test(codeOf(sourceSql).replace(/--.*$/gm, '')), /\bnose\./.test(sourceSql)],
    [5, 1, false, false]);

  /* ======================================================= the database */

  pglite = new PGlite();
  for (const f of migrationFiles) await pglite.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  const rows = async (sql, params) => (await pglite.query(sql, params)).rows;
  const one = async (sql, params) => (await rows(sql, params))[0];
  const adminDb = { query: (sql, params) => pglite.query(sql, params) };
  const asB2b = { query: async (sql, params) => {
    await pglite.exec('set role nose_b2b');
    try { return await pglite.query(sql, params); } finally { await pglite.exec('reset role'); }
  } };
  const say = () => { const lines = []; return { lines, log: l => lines.push(String(l)) }; };
  const adminCmd = async argv => { const out = say(); await admin.runCommand(admin.parseArgs(argv), { db: adminDb, log: out.log }); return out.lines.join('\n'); };
  const keysIn = text => [...text.matchAll(/n[sp]k_[0-9a-f]{64}/g)].map(m => m[0]);

  const made = keysIn(await adminCmd(['create', 'test-shop', '--name', 'Test Shop', '--origin', 'https://shop.example']));
  let secret = made.find(k => k.startsWith('nsk_'));
  const publicKey = made.find(k => k.startsWith('npk_'));
  const otherSecret = keysIn(await adminCmd(['create', 'other-shop', '--name', 'Other Shop', '--origin', 'https://other.example']))
    .find(k => k.startsWith('nsk_'));
  const storeId = (await one(`select id::text as id from b2b.stores where slug = 'test-shop'`)).id;
  const otherId = (await one(`select id::text as id from b2b.stores where slug = 'other-shop'`)).id;

  const NOSE_TABLES = ['documents', 'extractions', 'parses', 'reparse_runs', 'removals', 'withheld'];
  const noseCounts = async () => Promise.all(NOSE_TABLES.map(async t => (await one(`select count(*)::int as n from nose.${t}`)).n));
  const noseBefore = await noseCounts();
  const everything = async () => JSON.stringify(await Promise.all(['stores', 'store_keys', 'batches', 'batch_reads']
    .map(t => rows(`select to_jsonb(x) as r from b2b.${t} x order by to_jsonb(x)::text`))));
  const batchesOf = async id => rows(`select batch_id, product_id, list_position, category, route, name, brand, coa_url, product_url,
                                             in_stock, thc_percent::text as thc, cbd_percent::text as cbd,
                                             first_listed_on::text as first, last_listed_on::text as last
                                        from b2b.batches where store_id = $1::bigint order by list_position, batch_id`, [id]);
  const readsOf = async id => rows(`select batch_id, read_url, fetched, usable, lab, product_class, to_json(reject_reasons) as reasons,
                                           terps, total_terpenes::text as total, report_batch, report_lab_id, new_layout, read_by
                                      from b2b.batch_reads where store_id = $1::bigint order by batch_id`, [id]);

  /* ======================================================== the function */

  process.env.NOSE_B2B_DB_URL = fakeB2bUrl();
  const handler = await loadFunction();
  const csvBytes = fs.readFileSync(CATALOG);
  const csvText = csvBytes.toString('utf8');
  const header = format.COLUMNS.join(',');
  const ENDPOINT = 'https://nose-app.com/.netlify/functions/b2b-catalog';
  const successLines = [];
  const post = async (body, { key = secret, method = 'POST', headers = {}, keep } = {}) => {
    const h = { 'content-type': 'text/csv; charset=utf-8', ...headers };
    if (key !== null) h.authorization = `Bearer ${key}`;
    const init = { method, headers: h };
    if (body !== undefined && method !== 'GET') { init.body = body; init.duplex = 'half'; }
    const req = new Request(ENDPOINT, init);
    if (keep) keep.request = req;
    const { value: res, lines } = await quietly(() => handler(req));
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* a plain body */ }
    if (res.status === 200) successLines.push(...lines);
    return { status: res.status, headers: Object.fromEntries(res.headers), text, json, lines };
  };
  const ON = () => { process.env.B2B_ENABLED = '1'; version.pin({ parserVersion: 'abc1234', extractorVersion: 'abc123456789', deployContext: 'production' }); };

  /* --- the switch ---------------------------------------------------------- */
  version.pin({ parserVersion: 'abc1234', extractorVersion: 'abc123456789', deployContext: 'production' });
  const before0 = await everything();
  const q0 = pgLog.length;
  const offNoVar = await post(csvBytes);
  process.env.B2B_ENABLED = '1';
  version.pin({ parserVersion: 'abc1234', extractorVersion: 'abc123456789', deployContext: 'deploy-preview' });
  const offPreview = await post(csvBytes);
  const offGet = await post(undefined, { method: 'GET', key: null });
  check('off - no B2B_ENABLED, or a deploy preview with it - every request is the same plain 404',
    [offNoVar.status, offNoVar.text, offPreview.status, offPreview.text, offGet.status, offGet.text, offNoVar.headers['content-type']],
    [404, 'Not Found', 404, 'Not Found', 404, 'Not Found', 'text/plain; charset=utf-8']);
  check('...before the database is touched: no statement made, nothing written, nothing logged',
    [pgLog.length - q0, await everything() === before0, [...offNoVar.lines, ...offPreview.lines, ...offGet.lines]], [0, true, []]);

  ON();
  const gotGet = await post(undefined, { method: 'GET' });
  check('on: anything but POST is 405, Allow: POST, with no statement made',
    [gotGet.status, gotGet.headers.allow, gotGet.json && gotGet.json.error, pgLog.length - q0], [405, 'POST', 'method-not-allowed', 0]);

  /* --- the key ------------------------------------------------------------- */
  const noKey = await post(csvBytes, { key: null });
  const basic = await post(csvBytes, { key: null, headers: { authorization: `Basic ${Buffer.from(`x:${secret}`).toString('base64')}` } });
  const asPublic = await post(csvBytes, { key: publicKey });
  const shortKey = await post(csvBytes, { key: 'nsk_1234' });
  const qBeforeUnknown = pgLog.length;
  const unknownReq = {};
  const unknown = await post(csvBytes, { key: b2b.newKey('secret'), keep: unknownReq });
  const lookedUp = pgLog.length - qBeforeUnknown;
  const twoKeys = await post(csvBytes, { key: `${secret} ${secret}` });
  const unauthorized = [noKey, basic, asPublic, shortKey, unknown, twoKeys];
  check('no key, a Basic header, the PUBLIC key, a malformed key, a key never issued, two keys: one and the same 401',
    [unauthorized.map(r => r.status), new Set(unauthorized.map(r => r.text)).size, noKey.headers['www-authenticate'], noKey.json],
    [[401, 401, 401, 401, 401, 401], 1, 'Bearer',
     { error: 'unauthorized', reason: 'This needs the store\'s working secret key, sent as: Authorization: Bearer nsk_... Nothing was changed.' }]);
  check('...a key that is not a secret key is never looked up; one that is takes one statement, by its hash alone',
    [lookedUp, pgLog.slice(qBeforeUnknown, qBeforeUnknown + 1)[0] === b2b.SECRET_KEY_SQL], [1, true]);
  check('...and nothing was written, or logged - nor the body of a request with no working key even read',
    [await everything() === before0, unauthorized.flatMap(r => r.lines), unknownReq.request.bodyUsed], [true, [], false]);
  check('the scheme is read in any case, and spaces around the key are not part of it',
    [(await post(Buffer.from(`${header}\n`), { key: null, headers: { authorization: `bearer  ${secret} ` } })).status], [422]);

  /* --- the test catalog, uploaded ---------------------------------------- */
  const covRead = cov.readCatalog(csvBytes);
  const reasonsOf = row => covRead.rows.find(r => r.row === row).reasons;
  const first = await post(csvBytes);
  check('the test catalog: 200, and the reply holds counts and refused rows only',
    [first.status, Object.keys(first.json), (first.json.refused || []).every(r => JSON.stringify(Object.keys(r)) === '["row","reasons"]')],
    [200, ['received', 'upserted', 'markedOutOfStock', 'refused'], true]);
  check('...24 rows received (the blank row skipped), 20 upserted, none to take out of stock on a first upload',
    [first.json.received, first.json.upserted, first.json.markedOutOfStock], [24, 20, 0]);
  check('...refused: rows 19, 20 and 26 for the coverage report\'s own reasons, word for word - and row 24, whose http link the database cannot hold',
    first.json.refused, [{ row: 19, reasons: reasonsOf(19) }, { row: 20, reasons: reasonsOf(20) },
                         { row: 24, reasons: ['coa_url is not an https link'] }, { row: 26, reasons: reasonsOf(26) }]);
  const stored = await batchesOf(storeId);
  const listedRows = covRead.rows.filter(r => r.outcome === null && r.row !== 24);
  check('...each kept batch as its row says: list_position its row number, yes/no a boolean, a percent a number, the link whole but for "#"',
    stored.map(b => [b.list_position, b.batch_id, b.product_id, b.category, b.route, b.name, b.brand, b.coa_url, b.product_url, b.in_stock, b.thc, b.cbd]),
    listedRows.map(r => [r.row, r.batch_id, r.product_id, r.category, r.route, r.name, r.brand || null, r.coa_url ? r.coa_url.split('#')[0] : null,
                         r.product_url || null, r.in_stock === 'yes', r.thc_percent === '' ? null : String(Number(r.thc_percent.replace('%', ''))),
                         r.cbd_percent === '' ? null : String(Number(r.cbd_percent.replace('%', '')))]));
  const today = new Date().toISOString().slice(0, 10);
  check('...days, not times: first and last listed today (UTC)', [...new Set(stored.map(b => `${b.first} ${b.last}`))], [`${today} ${today}`]);

  /* --- a whole snapshot ---------------------------------------------------- */
  const purple = '5637041429622699';
  const withoutPurple = csvText.split('\n').filter(l => !l.startsWith('P-121,')).join('\n');
  const second = await post(Buffer.from(withoutPurple));
  const afterSecond = await batchesOf(storeId);
  const p2 = afterSecond.find(b => b.batch_id === purple);
  const p1 = stored.find(b => b.batch_id === purple);
  check('a re-upload without one in-stock batch: that batch marked out of stock, and KEPT - the rest upserted',
    [second.status, second.json.received, second.json.upserted, second.json.markedOutOfStock, afterSecond.length, p2.in_stock],
    [200, 23, 19, 1, 20, false]);
  check('...kept as it was apart from being out of stock: its row, its link, its days',
    { ...p2, in_stock: true }, p1);
  const third = await post(Buffer.from(withoutPurple));
  check('...the same file again changes nothing more: none marked, every row as it was',
    [third.json.markedOutOfStock, third.json.upserted, JSON.stringify(await batchesOf(storeId)) === JSON.stringify(afterSecond)], [0, 19, true]);
  const typo = csvText.replace('P-122,FJ02002-08,flower,smoking,Sherbet Cake,Test Brand G,https://coa.example/moderncanna/MCL-FLW-002.pdf,yes,,26,',
                               'P-122,FJ02002-08,flower,smoking,Sherbet Cake,Test Brand G,https://coa.example/moderncanna/MCL-FLW-002.pdf,maybe,,26,');
  const beforeTypo = (await batchesOf(storeId)).find(b => b.batch_id === 'FJ02002-08');
  const fourth = await post(Buffer.from(typo));
  const afterTypo = await batchesOf(storeId);
  /* Its row as the last file left it: row 22 there, the line above it gone. */
  check('a row refused for a typo leaves its batch exactly as it was: still in stock, not upserted, not marked',
    [typo !== csvText, (fourth.json.refused || []).map(r => r.row), fourth.json.upserted, fourth.json.markedOutOfStock, beforeTypo.list_position,
     JSON.stringify(afterTypo.find(b => b.batch_id === 'FJ02002-08')) === JSON.stringify(beforeTypo)],
    [true, [19, 20, 23, 24, 26], 19, 0, 22, true]);
  check('...and a batch listed again is back in stock', afterTypo.find(b => b.batch_id === purple).in_stock, true);
  const fifth = await post(csvBytes);
  check('the test catalog again: 20 upserted, none marked, every row as on the first upload',
    [fifth.json.upserted, fifth.json.markedOutOfStock, JSON.stringify(await batchesOf(storeId)) === JSON.stringify(stored)], [20, 0, true]);
  check('...and nothing about any of it was logged', successLines, []);

  /* --- refused files: nothing changed ------------------------------------ */
  const beforeRefusals = await everything();
  const refusedBy = async body => { const r = await post(body); return [r.status, r.json && r.json.error, r.json && r.json.reason, r.lines]; };
  const unknownCol = await refusedBy(fs.readFileSync(path.join(FIX, 'catalog-unknown.csv')));
  const personalCol = await post(fs.readFileSync(path.join(FIX, 'catalog-personal.csv')));
  check('an unknown column refuses the file by name, in the coverage report\'s own words: 422, nothing changed',
    unknownCol, [422, 'refused', cov.readCatalog(fs.readFileSync(path.join(FIX, 'catalog-unknown.csv'))).refusal, []]);
  check('a column that looks personal refuses the whole file before any row is read - named, its values never echoed',
    [personalCol.status, has(personalCol.json.reason, '"Customer E-mail"'), has(personalCol.json.reason, 'so none of its rows was read'),
     /pat\.example|example\.com|Cold Creek/.test(personalCol.text)], [422, true, true, false]);
  const notUtf8 = await refusedBy(Buffer.concat([Buffer.from(`${header}\nP-1,B-1,flower,smoking,Caf`), Buffer.from([0xE9]), Buffer.from(',Brand,,yes,,,\n')]));
  const emptyBody = await refusedBy(Buffer.alloc(0));
  const headerOnly = await post(Buffer.from(`${header}\n`));
  const allRefused = await post(Buffer.from(`${header}\nP-1,B-1,edible,oral,Gummies,,,yes,,,\nP-2,B-2,flower,smoking,Flower,,http://lab.example/r.pdf,yes,,,\n`));
  check('not UTF-8, or an empty body: refused whole, in the reader\'s words',
    [notUtf8[0], has(notUtf8[2], 'the file is not UTF-8 text'), emptyBody[0], has(emptyBody[2], 'refused: the file is empty')], [422, true, 422, true]);
  check('a header and no row, or no row NOSE can keep: refused, nothing changed - an empty snapshot would take every batch out of stock',
    [headerOnly.status, headerOnly.json, allRefused.status, allRefused.json.received, (allRefused.json.refused || []).map(r => [r.row, r.reasons.length]),
     allRefused.json.reason],
    [422, { error: 'refused', reason: allRefused.json.reason, received: 0, refused: [] }, 422, 2, [[2, 2], [3, 1]],
     'refused: no row of the file can be kept, so nothing was changed. An upload is the whole catalog: an empty one would mark every batch out of stock.']);
  check('...every refused file changed nothing in b2b', await everything(), beforeRefusals);

  /* --- the size cap -------------------------------------------------------- */
  const LIMIT = 4 * 1024 * 1024;
  const keep = {};
  const qBig = pgLog.length;
  const declaredBig = await post(Buffer.from('x'), { headers: { 'content-length': String(LIMIT + 1) }, keep });
  check('a Content-Length over 4 MB: 413 before the body is read or the key looked up',
    [declaredBig.status, declaredBig.json, keep.request.bodyUsed, pgLog.length - qBig],
    [413, { error: 'too-large', reason: 'The file is larger than 4 MB. Nothing was changed.' }, false, 0]);
  let pulled = 0;
  const flood = new ReadableStream({ pull(c) { pulled += 1024 * 1024; c.enqueue(new Uint8Array(1024 * 1024).fill(0x41)); if (pulled > 9 * 1024 * 1024) c.close(); } });
  const streamedBig = await post(flood);
  check('a body over 4 MB with no Content-Length: counted while it is read, 413, and never held whole',
    [streamedBig.status, streamedBig.json.error, pulled <= LIMIT + 2 * 1024 * 1024], [413, 'too-large', true]);
  const atLimit = Buffer.concat([Buffer.from(`${header}\n`), Buffer.alloc(LIMIT - header.length - 1, 0x0a)]);
  check('...a file of exactly 4 MB is read (all blank rows here, so refused for having none)', [atLimit.length, (await post(atLimit)).status], [LIMIT, 422]);
  check('...nothing changed', await everything(), beforeRefusals);

  /* --- keys revoked and rotated ------------------------------------------ */
  await adminCmd(['revoke', 'test-shop', '--secret']);
  const beforeRevoked = await everything();
  const revoked = await post(csvBytes);
  check('a revoked key: the same 401, nothing changed', [revoked.status, revoked.text === noKey.text, await everything() === beforeRevoked], [401, true, true]);
  secret = keysIn(await adminCmd(['rotate-keys', 'test-shop', '--secret']))[0];
  const rotated = await post(csvBytes);
  check('...a rotated key works: 200, nothing new to mark', [rotated.status, rotated.json.upserted, rotated.json.markedOutOfStock], [200, 20, 0]);
  const otherFirst = await post(csvBytes, { key: otherSecret });
  check('another store\'s key uploads to that store alone: the same batch IDs, its own rows',
    [otherFirst.status, (await batchesOf(otherId)).length, JSON.stringify(await batchesOf(storeId)) === JSON.stringify(stored)], [200, 20, true]);

  /* --- failures: one fixed line, no detail ---------------------------------- */
  const beforeFailures = await everything();
  delete process.env.NOSE_B2B_DB_URL;
  const unconfigured = await post(csvBytes);
  process.env.NOSE_B2B_DB_URL = fakeB2bUrl();
  pgFails = 'connect';
  const down = await post(csvBytes);
  pgFails = b2b.APPLY_CATALOG_SQL;
  const timedOut = await post(csvBytes);
  pgFails = null;
  const UNAVAILABLE = { error: 'unavailable', reason: 'The catalog could not be saved just now. Send the whole file again later: an upload is a whole snapshot, so sending the same file twice changes nothing more.' };
  check('no database configured, the database down, or the write not confirmed: 503, the same words',
    [unconfigured.status, unconfigured.json, down.status, down.json, timedOut.status, timedOut.json], [503, UNAVAILABLE, 503, UNAVAILABLE, 503, UNAVAILABLE]);
  check('...each logs one fixed line and nothing else: no host, address, key, SQL or row',
    [unconfigured.lines, down.lines, timedOut.lines],
    [['error: b2b-catalog: no database configured - nothing saved'], ['error: b2b-catalog: key not checked - the database did not answer; nothing saved'],
     ['error: b2b-catalog: upload not confirmed - the database did not answer']]);
  check('...and nothing changed', await everything(), beforeFailures);
  check('pg itself was never loaded: every connection went through the stand-in', loads.some(f => /[\\/]node_modules[\\/]pg[\\/]/.test(f)), false);

  /* ========================================================== the reader */

  const pauses = [];
  const instant = async ms => { pauses.push(ms); };
  const runReader = async (argv, extra = {}) => {
    const out = [];
    const err = [];
    const code = await withFetch(() => reader.main(argv, { client: asB2b, stamps: { stamps: {} }, log: l => out.push(l), error: l => err.push(l), wait: instant, ...extra }));
    return { code, out: out.join('\n'), err: err.join('\n') };
  };
  const { extractCoaText } = require(path.join(LIB, 'extract-text.js'));
  const { parseCoa } = require(path.join(LIB, 'parse-coa.js'));
  const parsed = async name => parseCoa((await extractCoaText(pdf(name))).text);

  /* --dry-run first: everything read, nothing written. */
  const beforeDry = await everything();
  requests.length = 0;
  mostAtOnce = 0;
  pauses.length = 0;
  const dry = await runReader(['--store', 'test-shop', '--dry-run']);
  const dryRequests = [...requests];
  check('--dry-run: reads every listed batch with a link - 17 in stock, and the 2 out of stock, for past purchases - and writes nothing',
    [dry.code, has(dry.out, 'read 19: 14 accepted, 2 refused, 3 gave no report'), has(dry.out, '--dry-run: nothing was written'),
     await everything() === beforeDry], [0, true, true, true]);
  /* 19 links, 18 of them requested - validateUrl refuses the private address
     unasked - so 17 pauses, each straight before a request. */
  check('...one link at a time, a pause before every request but the first, and the private address never requested',
    [mostAtOnce, pauses.length, pauses.every(ms => ms === cov.PAUSE_MS), dryRequests.some(u => /169\.254|10\.0\.0\.7|^http:/.test(u))],
    [1, 17, true, false]);

  /* The real run. */
  requests.length = 0;
  pauses.length = 0;
  const real = await runReader(['--store', 'test-shop']);
  const reads = await readsOf(storeId);
  const byBatch = new Map(reads.map(r => [r.batch_id, r]));
  check('the run: 19 readings written - every listed batch with a link, none without one, none of another store',
    [real.code, has(real.out, 'written: 19 readings'), reads.length, byBatch.has('B-NOLINK-1'), (await readsOf(otherId)).length], [0, true, 19, false, 0]);
  check('...two batches on one link are each fetched: KAY-AIO-001 twice, Kush_Creek twice (one in stock, one sold out)',
    [requests.filter(u => u === 'https://coa.example/kaycha/KAY-AIO-001.pdf').length, requests.filter(u => u === 'https://coa.example/kaycha/Kush_Creek.pdf').length], [2, 2]);
  const car = byBatch.get('ID1600SPNPCRT1');
  const carParsed = await parsed('KAY-CAR-001');
  check('an accepted reading keeps the parser\'s terpenes and the total the lab printed: KAY-CAR-001, 4.124 exactly, 15 values',
    [car.usable, car.fetched, car.total, Object.keys(car.terps).length, JSON.stringify(Object.keys(car.terps).sort().map(k => [k, car.terps[k]])),
     car.read_url, car.report_batch, car.report_lab_id, car.product_class],
    [true, true, '4.124', 15, JSON.stringify(Object.keys(carParsed.terps).sort().map(k => [k, carParsed.terps[k]])),
     'https://coa.example/kaycha/KAY-CAR-001.pdf', carParsed.batch, null, 'vape']);
  const accepted = reads.filter(r => r.usable).map(r => r.batch_id).sort();
  check('...14 accepted, sold-out batches among them: what a shopper bought last month has values too',
    [accepted.length, accepted.includes('DA51107019-007'), accepted.includes('MI60618012-001')], [14, true, true]);
  const green = byBatch.get('GR-24007');
  const greenParsed = await parsed('GreenRoadsFullSpectrumCBDOil750mgLot24007');
  check('a refusal keeps the parser\'s reasons word for word and no figure at all',
    [green.usable, green.fetched, green.reasons, green.terps, green.total, green.lab, green.product_class],
    [false, true, greenParsed.rejectReasons, null, null, 'TerpLife Labs', 'tincture']);
  const broken = byBatch.get('B-BROKEN-1');
  check('...a PDF the scanner cannot read keeps the scanner\'s own sentence, and nothing the parser would have said',
    [broken.usable, broken.fetched, broken.reasons, broken.product_class, broken.read_by, broken.lab], [false, true, [cov.SCANNER.unreadable], null, null, null]);
  check('a link that gave no report keeps the fetcher\'s words, marked as not fetched: the 404, the private address, the redirect',
    ['B-404-1', 'B-METADATA-1', 'B-REDIRECT-1'].map(b => [byBatch.get(b).fetched, byBatch.get(b).reasons, byBatch.get(b).usable, byBatch.get(b).lab]),
    [[false, ['The lab server returned 404 for that link.'], false, null],
     [false, ['That address points to a private network, not a public lab report.'], false, null],
     [false, ['That link redirects somewhere it should not.'], false, null]]);
  check('every reading names the link it came from: the batch\'s own coa_url',
    reads.every(r => r.read_url === stored.find(b => b.batch_id === r.batch_id).coa_url), true);
  check('values only for accepted readings: no refused or unfetched one carries terpenes or a total',
    reads.filter(r => !r.usable && (r.terps !== null || r.total !== null)).length, 0);
  const unfetchedRow = (cols, vals) => asB2b.query(`insert into b2b.batch_reads (store_id, batch_id, usable, fetched, reject_reasons, ${cols})
                                                   values ($1::bigint, 'B-NOLINK-1', false, false, '{"The lab server returned 404 for that link."}', ${vals})`, [storeId])
    .then(() => 'written', e => (/"nothing_read_unless_fetched"/.test(e.message) ? 'refused' : e.message));
  check('the database holds a link that gave no report to that: its link, one sentence, and nothing read - no lab, form, identifier or note',
    [await unfetchedRow('read_url, lab', `'https://coa.example/x.pdf', 'Kaycha Labs'`), await unfetchedRow('read_url, product_class', `'https://coa.example/x.pdf', 'flower'`),
     await unfetchedRow('read_url, report_batch', `'https://coa.example/x.pdf', 'B-1'`), await unfetchedRow('read_url, new_layout', `'https://coa.example/x.pdf', true`),
     await unfetchedRow('lab', 'null')],
    ['refused', 'refused', 'refused', 'refused', 'refused']);

  /* A second run: only what gave no report is tried again. */
  const readsAfterFirst = JSON.stringify(reads.filter(r => r.fetched));
  requests.length = 0;
  const again = await runReader(['--store', 'test-shop']);
  check('a second run tries again only the 3 links that gave no report; every reading the links gave stands',
    [has(again.out, 'with no current reading'), has(again.out, 'read 3: 0 accepted, 0 refused, 3 gave no report'),
     JSON.stringify((await readsOf(storeId)).filter(r => r.fetched)) === readsAfterFirst], [true, true, true]);

  /* --reread on a bad day: a fetch that failed never replaces a reading. */
  DOWN.add(VIEWER);
  const reread = await runReader(['--store', 'test-shop', '--reread', '--limit', '3']);
  DOWN.clear();
  const grease = (await readsOf(storeId)).find(r => r.batch_id === '6650039866516120');
  check('--reread --limit 3: three read again; the one whose portal is down keeps the reading it gave before',
    [reread.code, has(reread.out, 'read 3: 2 accepted, 0 refused, 1 gave no report'), has(reread.out, 'kept the earlier reading'),
     has(reread.out, 'written: 2 readings; 1 earlier reading kept'), grease.usable, grease.fetched, has(reread.out, 'a partial run: --limit 3')],
    [0, true, true, true, true, true, true]);
  check('...and nothing the reader printed holds a link\'s path, query or token',
    [dry.out, real.out, again.out, reread.out].some(o => /coa-view|sample=|\/kaycha\/|meta-data|redirect-inside|search=|\.pdf/.test(o)), false);

  /* ============================== the coverage report, from the database */

  const covDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2b-catalog-test-'));
  const csvRun = await withFetch(() => cov.main([CATALOG, '--out', path.join(covDir, 'csv')], { log: () => {}, error: () => {}, wait: instant }));
  const storeOut = [];
  const storeRun = await cov.main(['--store', 'test-shop', '--out', path.join(covDir, 'store')], { client: asB2b, log: l => storeOut.push(l), error: l => storeOut.push(l) });
  const readCsv = dir => {
    const recs = cov.parseCsv(fs.readFileSync(path.join(dir, 'report.csv'), 'utf8').slice(1)).records.filter(x => x.length > 1);
    return new Map(recs.slice(1).map(x => [x[0], Object.fromEntries(recs[0].map((h, i) => [h, x[i]]))]));
  };
  const fromFile = readCsv(path.join(covDir, 'csv'));
  const fromDb = readCsv(path.join(covDir, 'store'));
  check('--store: the report from the database, written as report.md and report.csv, as the file\'s is',
    [csvRun, storeRun, fs.readdirSync(path.join(covDir, 'store')).sort()], [0, 0, ['report.csv', 'report.md']]);
  check('...the batches it holds are the file\'s rows but the four refused on upload: 19, 20 and 26 (format) and 24 (http)',
    [...fromFile.keys()].filter(k => !fromDb.has(k)), ['19', '20', '24', '26']);
  const differ = [...fromDb.entries()].filter(([k, r]) => JSON.stringify(r) !== JSON.stringify(fromFile.get(k))).map(([k]) => k);
  check('...and every batch reads exactly as the CSV run read it: outcome, reasons, lab, form, batch and lab ID, total, top three and shares, notes, flags, host',
    differ, []);
  const mdFile = fs.readFileSync(path.join(covDir, 'csv', 'report.md'), 'utf8');
  const mdDb = fs.readFileSync(path.join(covDir, 'store', 'report.md'), 'utf8');
  const tableLines = t => t.split('\n').filter(l => l.startsWith('| '));
  const onlyIn = (a, b) => tableLines(a).filter(l => !tableLines(b).includes(l));
  check('...every table line is the same but those row 24 counted in: the shares over 19, the vape row, the "(no report read)" row, row 24 itself',
    [onlyIn(mdFile, mdDb), onlyIn(mdDb, mdFile)],
    [['| terpene panel NOSE can read | 12 of 19 (63%) |', '| report refused | 2 of 19 (11%) |', '| no lab-report link in the catalog | 1 of 19 (5%) |',
      '| link could not be fetched | 4 of 19 (21%) |', '| vape | 6 | 3 of 6 (50%) | 1 of 6 (17%) | 0 of 6 (0%) | 2 of 6 (33%) |',
      '| (no report read) | 6 | 0 of 6 (0%) | 1 of 6 (17%) | 1 of 6 (17%) | 4 of 6 (67%) |',
      '| 24 | P-123 | B-HTTP-1 | vape | Plain Link Cart | Test Brand A | link could not be fetched: Only secure https links can be fetched. | coa.example |'],
     ['| terpene panel NOSE can read | 12 of 18 (67%) |', '| report refused | 2 of 18 (11%) |', '| no lab-report link in the catalog | 1 of 18 (6%) |',
      '| link could not be fetched | 3 of 18 (17%) |', '| vape | 5 | 3 of 5 (60%) | 1 of 5 (20%) | 0 of 5 (0%) | 1 of 5 (20%) |',
      '| (no report read) | 5 | 0 of 5 (0%) | 1 of 5 (20%) | 1 of 5 (20%) | 3 of 5 (60%) |']]);
  check('...its own lines say where it came from: the store, its window, out-of-stock batches kept and read, refused rows never kept',
    [has(mdDb, '# Terpene panel coverage: store test-shop'), has(mdDb, 'Read from the database on'),
     has(mdDb, 'The store lists 20 batches in its 12-month window: 18 in-stock batches and 2 out of stock (kept for past purchases).'),
     has(mdDb, '- Out of stock: 2. Kept so a shopper\'s past purchases are still found; 2 of 2 (100%) have a terpene panel NOSE can read.'),
     has(mdDb, '- Refused rows: never kept. The upload\'s reply lists each, by row number and reason.')], [true, true, true, true, true]);
  const line = (what, n) => `  ${what.padEnd(34)} ${n}`;
  check('...and its summary, as printed', storeOut.slice(0, 9), ['', 'b2b-coverage: store test-shop', '',
    '12 of 18 (67%) in-stock inhalables have a terpene panel NOSE can read', line('report refused', '2 of 18 (11%)'),
    line('no lab-report link in the catalog', '1 of 18 (6%)'), line('link could not be fetched', '3 of 18 (17%)'), line('out of stock, kept', 2),
    'flagged: form not the category 2, batch not named 3, one link on several batches 2']);
  console.log('\n        the CSV run, as the coverage report printed it:');
  for (const l of tableLines(mdFile).slice(0, 6)) console.log(`          ${l}`);
  console.log('        the same catalog from PGlite (--store test-shop):');
  for (const l of tableLines(mdDb).slice(0, 6)) console.log(`          ${l}`);
  console.log('');

  /* A batch not read yet, and a link the store corrects. */
  const fixed = csvText.replace('https://coa.example/kaycha/KAY-FLW-001.pdf', 'https://coa.example/kaycha/KAY-FLW-003.pdf');
  const corrected = await post(Buffer.from(fixed));
  const notYet = [];
  await cov.main(['--store', 'test-shop', '--out', path.join(covDir, 'not-yet')], { client: asB2b, log: l => notYet.push(l), error: l => notYet.push(l) });
  const notYetRows = readCsv(path.join(covDir, 'not-yet'));
  check('a link the store corrects: the old report\'s reading is no longer current - the report says "not read yet", with no figure',
    [corrected.status, notYetRows.get('7').outcome, notYetRows.get('7').total_terpenes_percent, notYetRows.get('7').top_1,
     notYet.includes(line('not read yet', '1 of 18 (6%)'))], [200, 'not read yet', '', '', true]);
  requests.length = 0;
  const afterFix = await runReader(['--store', 'test-shop']);
  const flw3 = await parsed('KAY-FLW-003');
  const banana = (await readsOf(storeId)).find(r => r.batch_id === 'TLGF0127202699HS');
  check('...the reader reads it again, from its new link: KAY-FLW-003\'s values, not KAY-FLW-001\'s - plus the three that gave no report',
    [has(afterFix.out, 'read 4:'), requests.includes('https://coa.example/kaycha/KAY-FLW-003.pdf'), requests.includes('https://coa.example/kaycha/KAY-FLW-001.pdf'),
     banana.read_url, banana.total, banana.report_batch],
    [true, true, false, 'https://coa.example/kaycha/KAY-FLW-003.pdf', String(flw3.totalTerpenes), flw3.batch]);

  /* Never from another store. */
  check('another store with the same batch IDs and links has no reading of its own until its own run - none copied across',
    (await readsOf(otherId)).length, 0);
  requests.length = 0;
  const other = await runReader(['--store', 'other-shop', '--limit', '2']);
  check('...its own run fetches its own links and writes its own rows',
    [other.code, requests.length >= 2, (await readsOf(otherId)).length, (await readsOf(otherId)).every(r => r.read_url)], [0, true, 2, true]);

  /* The command line, and the role. */
  const errs = [];
  requests.length = 0;
  const roleCode = await withFetch(() => reader.main(['--store', 'test-shop'], { client: adminDb, stamps: { stamps: {} }, log: () => {}, error: l => errs.push(l), wait: instant }));
  check('connected as anything but nose_b2b, the reader refuses before it reads anything',
    [roleCode, errs, requests.length],
    [1, ['REFUSED: NOSE_B2B_DB_URL connects as "postgres", not nose_b2b - this script writes readings as the dispensary role and nothing else'], 0]);
  const noStore = await runReader(['--store', 'no-such-shop', '--dry-run']);
  check('...and a store that does not exist is refused, nothing read', [noStore.code, noStore.err], [1, 'REFUSED: no store called "no-such-shop" - nothing was read']);
  const bare = { PATH: process.env.PATH, HOME: process.env.HOME || os.tmpdir() };
  const cli = (script, args) => spawnSync(process.execPath, [script, ...args], { env: bare, encoding: 'utf8', timeout: 30000, cwd: ROOT });
  const usage = [[], ['--store'], ['--store', 'x', '--limit', '0'], ['--store', 'x', '--everything']].map(a => cli(READER, a));
  check('the reader\'s command line: usage errors exit 2 with the usage line',
    usage.map(u => [u.status, has(u.stderr, reader.USAGE)]), usage.map(() => [2, true]));
  const noSecret = cli(READER, ['--store', 'test-shop']);
  const covNoSecret = cli(COVERAGE, ['--store', 'test-shop', '--out', path.join(covDir, 'never')]);
  check('...without NOSE_B2B_DB_URL the reader and --store refuse, exit 1, and write nothing',
    [noSecret.status, /^REFUSED: NOSE_B2B_DB_URL is not set/.test(noSecret.stderr), covNoSecret.status,
     has(covNoSecret.stderr, 'NOSE_B2B_DB_URL is not set'), fs.existsSync(path.join(covDir, 'never'))], [1, true, 1, true, false]);
  const covUsage = [['--store'], ['--store', 'x', 'catalog.csv'], ['--store', 'x', '--limit', '3']].map(a => cli(COVERAGE, a));
  check('...and the coverage script: --store takes a slug, and neither a file nor --limit with it',
    covUsage.map(u => [u.status, has(u.stderr, cov.USAGE)]), covUsage.map(() => [2, true]));
  fs.rmSync(covDir, { recursive: true, force: true });

  /* ===================================================== nothing else */

  check('schema nose untouched: every archive table holds what it held before', await noseCounts(), noseBefore);
  check('the archive never reached: storeScan, saveScan, archiveScan - its stand-ins never touched', archiveCalls, []);
  check('coa.js, lib/archive.js and lib/pdf-store.js never loaded, and no coa-pdf store opened',
    [loads.filter(f => f === COA).length, Object.keys(require.cache).includes(COA),
     loads.some(f => /[\\/]node_modules[\\/]@netlify[\\/]blobs[\\/]/.test(f))], [0, false, false]);

  await pglite.close();
  finished = true;
  if (failures) {
    console.log(`\n${failures} check${failures === 1 ? '' : 's'} failed - b2b-catalog NOT clean`);
    process.exitCode = 1;
  } else {
    console.log('\nb2b-catalog clean');
  }
}

main().catch(async e => {
  finished = true;
  console.error('b2b-catalog-test threw:', e && e.stack);
  if (pglite) await pglite.close().catch(() => {});
  process.exitCode = 1;
});

#!/usr/bin/env node
'use strict';
/* The path from a scan to the archive, offline - no network, no database, no
 * Netlify.
 *
 *   node test/archive-wiring-test.js       expect: archive-wiring clean
 *
 * What it pins down:
 *   - only the production deploy stores anything; dev, deploy previews and
 *     branch deploys load none of the storage code
 *   - the reply never depends on the archive: the handler's response is
 *     identical whether either write succeeds, fails, hangs, or is not
 *     configured
 *   - the PDF write and the database write are independent: either one
 *     failing or hanging leaves the other done, within the 2000ms budget
 *   - exactly what is sent: the PDF under its SHA-256 with { sourceUrl,
 *     fetchedAt } and nothing else, the fixed database payload keys, the
 *     address without its query string, a UTC day and never a time, context
 *     "production", nothing from the request or Netlify's Context, and
 *     nothing logged on success
 *   - coa.js is one default export taking a Request (since 2026-10-16), and
 *     nothing else: driven here as Netlify calls it, with a Request and a
 *     Context it must never read; the archive is handed neither; a body that
 *     is not a JSON object gets the 400, and a throw the fixed 500, with
 *     nothing of the error in the reply or the one log line
 *   - only lab reports are kept - two of their three signs, never one - and
 *     every real report in the corpus counts, by the signs pinned for it
 *   - the PDF obeys the database: nothing is written for a withheld file or
 *     above the daily cap, and only the cap logs (one fixed line)
 *   - store.js bounds a write end to end, and survives the failures that
 *     arrive after it stopped waiting - the ones that crash a function later
 *   - keep-awake runs often enough to keep a free project awake
 */

delete process.env.NOSE_DB_URL;
delete process.env.NOSE_DB_ADMIN_URL;

const assert = require('assert');
const crypto = require('crypto');
const EventEmitter = require('events');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const FN = path.join(ROOT, 'netlify/functions');
const STORE = path.join(FN, 'lib/store.js');
const PDF_STORE = path.join(FN, 'lib/pdf-store.js');
const EXTRACT = path.join(FN, 'lib/extract-text.js');
const PARSE = path.join(FN, 'lib/parse-coa.js');

/* Swap a module for a stand-in before anything requires it. */
function install(file, exports) {
  const m = new Module(file, module);
  m.filename = file;
  m.loaded = true;
  m.exports = exports;
  require.cache[file] = m;
}

/* A test that hangs on a promise nothing keeps alive lets Node exit quietly,
 * with code 0. Only reaching the end counts. */
let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) {
    /* stderr directly: console may be captured by quietly() at this moment */
    process.stderr.write('archive-wiring: stopped before the last check - NOT clean\n');
    process.exitCode = 1;
  }
});
const unhandled = [];
process.on('unhandledRejection', e => unhandled.push(e));

let passed = 0;
const failed = [];
async function test(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failed.push(`FAIL  ${name}\n      ${e && e.message}`); }
}
const tick = () => new Promise(r => setImmediate(r));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Console output during a call, captured so it can be asserted on - and the
 * call itself bounded, so a reply that never comes is a FAIL, not a hang. */
async function quietly(fn, limitMs = 10000) {
  const lines = [];
  const saved = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(saved)) console[k] = (...a) => lines.push(a.map(String).join(' '));
  let timer;
  try {
    const value = await Promise.race([Promise.resolve().then(fn), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no reply after ${limitMs}ms`)), limitMs);
    })]);
    return { value, lines };
  } finally {
    clearTimeout(timer);
    Object.assign(console, saved);
  }
}

const loaded = part => Object.keys(require.cache).some(k => k.includes(`${path.sep}node_modules${path.sep}${part}${path.sep}`));
const utcDay = () => new Date().toISOString().slice(0, 10);

/* --- the scan the handler will see ------------------------------------------ */

const realParseCoa = require(PARSE).parseCoa;   // kept for the corpus check
const version = require(path.join(FN, 'lib/version.js'));
const archive = require(path.join(FN, 'lib/archive.js'));
const { ARCHIVE_DEADLINE_MS, ARCHIVE_BUDGET_MS, ARCHIVE_MIN_MS } = archive.ARCHIVE_LIMITS;

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(700, 0x20)]);
const PDF_SHA = crypto.createHash('sha256').update(PDF).digest('hex');
const TEXT = 'KAYCHA LABS CERTIFICATE OF ANALYSIS - offline wiring test text. '.repeat(6);
const NOT_A_REPORT_TEXT = 'Dinner menu. Soup of the day, bread, a glass of water. '.repeat(6);
const PHRASE_ONLY_TEXT = 'CERTIFICATE OF ANALYSIS - offline wiring test text, no laboratory named. '.repeat(6);
const SOURCE = 'https://lab.example.com/reports/KAY-TEST-001.pdf?token=abc123&order=98765#page=2';
const STRIPPED = 'https://lab.example.com/reports/KAY-TEST-001.pdf';
/* What Netlify hands a function about the person: the request's headers,
   and a Context carrying their IP address, location and cookies. */
const REQUEST_HEADERS = { 'content-type': 'application/json', 'x-nf-client-connection-ip': '203.0.113.9',
                          'user-agent': 'WiringTestAgent/1.0', cookie: 'nose_session=s3ss10n' };
const FROM_REQUEST = ['203.0.113.9', 'WiringTestAgent', 's3ss10n', 'abc123', '98765', '198.51.100.24', 'Exampleton', 'c00k1e'];
/* A Context as Netlify hands one, every property read recorded: the handler
   takes the request alone, so nothing may ever read it. */
const contextReads = [];
const CONTEXT = new Proxy({
  ip: '198.51.100.24', geo: { city: 'Exampleton', country: { code: 'US' } }, requestId: '01REQUEST',
  cookies: { get: () => 'c00k1e' }, waitUntil: () => {}, site: { id: 'site-id' }, deploy: { context: 'production' }
}, { get: (t, k) => { contextReads.push(String(k)); return t[k]; }, has: (t, k) => { contextReads.push(String(k)); return k in t; } });
const USABLE = {
  lab: 'Kaycha Labs', strain: 'Test Strain', batch: 'B-1', labId: 'L-1', harvestDate: null,
  productClass: 'flower', totalTerpenes: 2.1, moisture: 11.2, waterActivity: 0.55, freshnessApplies: true,
  terps: { limonene: 0.8, myrcene: 0.6 }, mappedTotal: 1.4, unmodelledTotal: 0.7, coverage: 0.67,
  modelCoverage: 0.9, measuredCoverage: 0.9, layout: 'row', readBy: 'rowwise', unmapped: [],
  terpenesTested: 20, usable: true, rejectReasons: [], warnings: [],
  reportDate: '07/11/25', client: 'Test Client', parserVersion: 'c0ffee1'
};
const UNUSABLE = { ...USABLE, usable: false, rejectReasons: ['coverage too low'] };
const NOT_A_REPORT = { ...USABLE, lab: null, terps: {}, totalTerpenes: null, terpenesTested: null, usable: false };

let parseResult = USABLE;
let textResult = TEXT;
let fetchUrl = null;
install(EXTRACT, { extractCoaText: async () => ({ text: textResult, pages: 1 }) });
install(PARSE, { parseCoa: () => parseResult });
globalThis.fetch = async (url) => { fetchUrl = url; return new Response(PDF, { status: 200, headers: { 'content-type': 'application/pdf' } }); };

const PRODUCTION = { parserVersion: 'c0ffee1', extractorVersion: '0123456789ab', deployContext: 'production' };
version.pin({ ...PRODUCTION, deployContext: 'dev' });

/* coa.js is ES module syntax in a CommonJS package, as every other function
   is; Netlify's esbuild bundler compiles it (netlify.toml, node_bundler).
   Node has to be told, so a one-file hook loads it as a module, as
   b2b-catalog-test loads b2b-catalog.js. Its lib/ imports are the same
   CommonJS modules this test holds, stand-ins included. */
const COA = path.join(FN, 'coa.js');
/* Its replies come from netlify/lib/http.js since 2026-10-16, an ES module
   too, so the hook loads that file as a module as well. */
const HTTP = path.join(ROOT, 'netlify/lib/http.js');
let coaModule = null;
let handler = null;
async function loadCoa() {
  const url = pathToFileURL(COA).href;
  const urls = [url, pathToFileURL(HTTP).href];
  Module.register('data:text/javascript,' + encodeURIComponent(`
    const URLS = new Set(${JSON.stringify(urls)});
    export async function load(url, context, next) {
      if (URLS.has(url)) {
        const r = await next(url, { ...context, format: 'module' });
        return { ...r, format: 'module', shortCircuit: true };
      }
      return next(url, context);
    }`));
  coaModule = await import(url);
  handler = coaModule.default;
}

/* One request as Netlify sends it - a Request, and the Context - and the
   reply as plain data, so two replies compare whole: status, headers, body. */
const requestFor = (body, method = 'POST') =>
  new Request('https://nose-app.com/.netlify/functions/coa',
              { method, headers: REQUEST_HEADERS, ...(body === undefined ? {} : { body }) });
async function send(body, method) {
  const res = await handler(requestFor(body, method), CONTEXT);
  return { status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() };
}
const scan = () => send(JSON.stringify({ url: SOURCE }));
const scanOf = url => send(JSON.stringify({ url }));

/* Stand-ins that record every call. The PDF store has only what the real one
   has; anything else asked of it - a connect() the old format needed - is
   recorded, and nothing may ask. */
const pdfCalls = [];
const pdfStoreOther = [];
let pdfBehaviour = () => Promise.resolve({ written: true });
const fakePdfStore = new Proxy({
  STORE_NAME: 'coa-pdf',
  open: () => ({ fakeBlobStore: true }),
  put: (store, sha256, bytes, meta) => { pdfCalls.push({ store, sha256, bytes, meta }); return pdfBehaviour(); }
}, { get: (t, k) => { if (!(k in t) && typeof k === 'string') pdfStoreOther.push(k); return t[k]; } });
const calls = [];
let saveBehaviour = () => Promise.resolve({ parseWritten: true });
const fakeStore = { saveScan: (payload, opts) => { calls.push({ payload, opts }); return saveBehaviour(); } };

const reset = () => {
  pdfCalls.length = 0; calls.length = 0;
  pdfBehaviour = () => Promise.resolve({ written: true });
  saveBehaviour = () => Promise.resolve({ parseWritten: true });
};

/* The three headers every JSON reply carries, and the two fixed bodies. */
const JSON_HEADERS = { 'cache-control': 'no-store', 'content-type': 'application/json', 'x-content-type-options': 'nosniff' };
const UNREADABLE = { status: 400, headers: JSON_HEADERS, body: '{"error":"Could not read that request."}' };
const FAILED = { status: 500, headers: JSON_HEADERS, body: '{"error":"The report reader failed. Try again, or enter the values manually."}' };
const FAILED_LINE = 'coa: the report reader failed - a fixed 500 sent, no detail logged';

async function main() {
  await loadCoa();

  /* --- only production stores anything ------------------------------------- */

  let baseline, baselineUnusable;

  /* 'dev' is pinned here; test/archive-scripts-test.js proves that a missing
     or broken build-info.json reads as 'dev' in the first place. */
  await test('dev context: a normal reply, nothing stored, no storage code loaded, nothing logged', async () => {
    const { value, lines } = await quietly(() => scan());
    baseline = value;
    assert.strictEqual(value.status, 200);
    assert.deepStrictEqual(value.headers, JSON_HEADERS);
    assert.strictEqual(archive.archiveOn(), false);
    assert.ok(!(PDF_STORE in require.cache), 'pdf-store.js was loaded');
    assert.ok(!(STORE in require.cache), 'store.js was loaded');
    assert.ok(!loaded('pg'), 'pg was loaded');
    assert.ok(!loaded(path.join('@netlify', 'blobs')), '@netlify/blobs was loaded');
    assert.deepStrictEqual(lines, []);
    parseResult = UNUSABLE;
    baselineUnusable = (await quietly(() => scan())).value;
    parseResult = USABLE;
    assert.strictEqual(baselineUnusable.status, 422);
  });

  await test('deploy previews and branch deploys store nothing - they share the site\'s Blobs store', async () => {
    for (const deployContext of ['deploy-preview', 'branch-deploy']) {
      version.pin({ ...PRODUCTION, deployContext });
      const { value, lines } = await quietly(() => scan());
      assert.deepStrictEqual(value, baseline, deployContext);
      assert.strictEqual(archive.archiveOn(), false, deployContext);
      assert.deepStrictEqual(lines, [], deployContext);
    }
    assert.ok(!(PDF_STORE in require.cache) && !(STORE in require.cache), 'storage code was loaded');
  });

  install(PDF_STORE, fakePdfStore);
  version.pin(PRODUCTION);

  await test('production without NOSE_DB_URL: the PDF is kept, the database half is a no-op, store.js never loads', async () => {
    reset();
    const { value, lines } = await quietly(() => scan());
    assert.deepStrictEqual(value, baseline);
    assert.strictEqual(pdfCalls.length, 1);
    assert.ok(!(STORE in require.cache), 'store.js was loaded');
    assert.ok(!loaded('pg'), 'pg was loaded');
    assert.deepStrictEqual(lines, [], 'a database that is not configured is not a failure');
  });

  install(STORE, fakeStore);
  const fakeUrl = new URL('postgresql://aws-0-us-east-1.pooler.supabase.com');
  fakeUrl.username = 'nose_writer.abcdefghijklmnopqrst';
  fakeUrl.password = 'not-a-real-password';
  fakeUrl.port = '6543';
  fakeUrl.pathname = '/postgres';
  process.env.NOSE_DB_URL = fakeUrl.toString();

  let pdfSent, sent;
  await test('both writes succeed: the same reply, one PDF write, one save, no connect step, nothing logged', async () => {
    reset();
    const { value, lines } = await quietly(() => scan());
    assert.deepStrictEqual(value, baseline);
    assert.strictEqual(pdfCalls.length, 1);
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(pdfStoreOther, [], 'the PDF store was asked for more than open and put');
    assert.deepStrictEqual(lines, [], 'a successful write logged something');
    pdfSent = pdfCalls[0];
    sent = calls[0];
  });

  await test('the PDF: keyed by the SHA-256 of its bytes, stored whole, metadata { sourceUrl, fetchedAt } only', async () => {
    assert.strictEqual(pdfSent.sha256, PDF_SHA);
    assert.ok(Buffer.isBuffer(pdfSent.bytes) && pdfSent.bytes.equals(PDF), 'the bytes differ');
    assert.deepStrictEqual(Object.keys(pdfSent.meta).sort(), ['fetchedAt', 'sourceUrl']);
    assert.strictEqual(pdfSent.meta.sourceUrl, STRIPPED);
    assert.match(pdfSent.meta.fetchedAt, /^\d{4}-\d{2}-\d{2}$/, 'fetchedAt is not a bare day');
    const d = new Date(`${pdfSent.meta.fetchedAt}T00:00:00Z`).getTime();
    assert.ok(Math.abs(Date.now() - d) < 2 * 86400000, 'fetchedAt is not today (UTC)');
  });

  await test('the database payload: fixed keys, the same fingerprint, no query, no time, production, build-info stamps', async () => {
    const p = sent.payload;
    assert.deepStrictEqual(Object.keys(p).sort(),
      ['byteSize', 'context', 'extractorVersion', 'fetchedAt', 'output', 'parserVersion', 'sha256', 'sourceUrl', 'text']);
    assert.strictEqual(p.sha256, PDF_SHA);
    assert.strictEqual(p.byteSize, PDF.length);
    assert.strictEqual(p.sourceUrl, STRIPPED);
    assert.strictEqual(p.fetchedAt, null, 'a time of day was sent');
    assert.strictEqual(p.context, 'production');
    assert.strictEqual(p.text, TEXT);
    assert.strictEqual(p.output, USABLE);
    assert.strictEqual(p.parserVersion, PRODUCTION.parserVersion);
    assert.strictEqual(p.extractorVersion, PRODUCTION.extractorVersion);
    assert.ok(sent.opts.timeoutMs > 0 && sent.opts.timeoutMs <= ARCHIVE_BUDGET_MS, `timeoutMs ${sent.opts.timeoutMs}`);
    assert.strictEqual(ARCHIVE_BUDGET_MS, 2000);
  });

  /* The archive never sees the person: not the old format's `event`, and,
     since 2026-10-16, not the request and not Netlify's Context either. A
     scan's own `context` field is the deploy context, 'production' here, and
     the one way the word may appear in lib/archive.js: as a field, never a
     parameter, never something read from. */
  await test('nothing from the request or the Context reaches either write; the archive is handed neither, and never names the event', async () => {
    const all = JSON.stringify({ pdf: { ...pdfSent, bytes: undefined }, db: sent });
    for (const s of FROM_REQUEST) assert.ok(!all.includes(s), `"${s}" was sent`);
    const src = archive.archiveScan.toString();
    assert.match(src, /^async function archiveScan\(buffer, finalUrl, text, result, deadline\)\{/, 'archiveScan takes something new');
    assert.ok(!/\b(event|request|req|ctx)\b/.test(src), 'archiveScan names the event or the request');
    assert.ok(!/\bcontext\b/.test(src.replace("context: 'production'", '')), 'archiveScan names a context other than its field');
    assert.ok(!/headers|cookie|user-?agent|\bgeo\b|\.ip\b|waitUntil/i.test(src), 'archiveScan reads request details');
    const lib = fs.readFileSync(path.join(FN, 'lib/archive.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/\b(event|request|req|ctx)\b|headers|cookie|user-?agent|\bgeo\b|\.ip\b|waitUntil/i.test(lib), 'lib/archive.js reads request details');
    assert.ok(!/\bcontext\s*[.[(]|\[\s*['"]context/.test(lib), 'lib/archive.js reads something off a context');
    const params = [];
    for (const m of lib.matchAll(/\bfunction\s*\w*\s*\(([^)]*)\)/g)) params.push(...m[1].split(','));
    for (const m of lib.matchAll(/(?:^|[=(,:]\s*)(?:async\s*)?\(([^()]*)\)\s*=>/gm)) params.push(...m[1].split(','));
    for (const m of lib.matchAll(/(?:^|[=(,:]\s*)(?:async\s+)?(\w+)\s*=>/gm)) params.push(m[1]);
    const names = params.map(p => p.replace(/[{}[\]]/g, '').split('=')[0].trim()).filter(Boolean);
    /* 'work' since 2026-10-16: 'err' was reason()'s, now lib/db.js's scrub(). */
    for (const n of ['buffer', 'finalUrl', 'deadline', 'output', 'work', 'signs']) assert.ok(names.includes(n), `the parameter scan missed "${n}"`);
    assert.deepStrictEqual(names.filter(n => /^(event|request|req|context|ctx)$/.test(n)), [], 'a function in lib/archive.js takes the person\'s request or context');
    assert.deepStrictEqual(contextReads, [], `the Context was read: ${contextReads.join(', ')}`);
  });

  await test('a presigned link: X-Amz-*, Signature and Expires are gone from both writes', async () => {
    const signed = [
      'https://bucket.s3.amazonaws.com/r/KAY-TEST-001.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAEXAMPLE%2F20260922%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260922T120000Z' +
        '&X-Amz-Expires=300&X-Amz-SignedHeaders=host&X-Amz-Signature=deadbeefcafe',
      'https://d111111abcdef8.cloudfront.net/r/KAY-TEST-001.pdf?Expires=1790000000&Signature=Zm9vYmFy~&Key-Pair-Id=K2JCJMDEHXQW5F'
    ];
    for (const url of signed) {
      reset();
      await quietly(() => scanOf(url));
      assert.strictEqual(fetchUrl, url, 'the fetch itself must use the full link');
      const u = new URL(url);
      assert.strictEqual(pdfCalls[0].meta.sourceUrl, u.origin + u.pathname);
      assert.strictEqual(calls[0].payload.sourceUrl, u.origin + u.pathname);
      const all = JSON.stringify({ meta: pdfCalls[0].meta, payload: calls[0].payload });
      for (const s of ['X-Amz', 'Signature', 'Expires', 'AKIAEXAMPLE', 'deadbeefcafe', 'Key-Pair-Id', 'Zm9vYmFy']) {
        assert.ok(!all.includes(s), `"${s}" survived from ${u.hostname}`);
      }
    }
  });

  const noDetail = line => {
    for (const s of ['lab.example.com', 'KAY-TEST-001', PDF_SHA, 'KAYCHA LABS', 'pooler.supabase.com', ...FROM_REQUEST]) {
      assert.ok(!line.includes(s), `the log line names "${s}"`);
    }
  };

  await test('the PDF write fails: the same reply, the database write still made, one log line with no detail', async () => {
    reset();
    pdfBehaviour = () => Promise.reject(new Error(`Netlify Blobs refused ${PDF_SHA} from ${SOURCE}`));
    const { value, lines } = await quietly(() => scan());
    assert.deepStrictEqual(value, baseline);
    assert.strictEqual(calls.length, 1, 'the database write depended on the PDF write');
    assert.strictEqual(lines.length, 1, `logged: ${JSON.stringify(lines)}`);
    assert.match(lines[0], /pdf:/);
    noDetail(lines[0]);
  });

  await test('the database write fails: the same reply, the PDF still kept, one log line with no detail', async () => {
    reset();
    saveBehaviour = () => Promise.reject(new Error('connect ECONNREFUSED 10.1.2.3:6543 aws-0-us-east-1.pooler.supabase.com'));
    const { value, lines } = await quietly(() => scan());
    assert.deepStrictEqual(value, baseline);
    assert.strictEqual(pdfCalls.length, 1, 'the PDF write depended on the database write');
    assert.strictEqual(lines.length, 1, `logged: ${JSON.stringify(lines)}`);
    assert.match(lines[0], /database:/);
    assert.ok(!/10\.1\.2\.3/.test(lines[0]), 'an IP address was logged');
    noDetail(lines[0]);
  });

  await test('both fail: the same reply, still one log line', async () => {
    reset();
    pdfBehaviour = () => Promise.reject(new Error('blobs down'));
    saveBehaviour = () => Promise.reject(new Error('database down'));
    const { value, lines } = await quietly(() => scan());
    assert.deepStrictEqual(value, baseline);
    assert.strictEqual(lines.length, 1, `logged: ${JSON.stringify(lines)}`);
    assert.match(lines[0], /pdf:.*database:/);
  });

  for (const [which, hangPdf] of [['PDF', true], ['database', false]]) {
    await test(`the ${which} write hangs: the same reply within the ${ARCHIVE_BUDGET_MS}ms budget, the other write done`, async () => {
      reset();
      let otherDone = false;
      if (hangPdf) {
        pdfBehaviour = () => new Promise(() => {});
        saveBehaviour = () => Promise.resolve({ parseWritten: true }).then(r => { otherDone = true; return r; });
      } else {
        saveBehaviour = () => new Promise(() => {});
        pdfBehaviour = () => Promise.resolve({ written: true }).then(r => { otherDone = true; return r; });
      }
      const t0 = Date.now();
      const { value, lines } = await quietly(() => scan(), ARCHIVE_BUDGET_MS + 1500);
      const took = Date.now() - t0;
      assert.deepStrictEqual(value, baseline);
      assert.ok(took < ARCHIVE_BUDGET_MS + 400, `the reply took ${took}ms`);
      assert.ok(otherDone, `the other write did not finish while the ${which} write hung`);
      assert.strictEqual(lines.length, 1);
      assert.match(lines[0], /timed out/);
    });
  }

  await test(`both writes hang: the same reply within the ${ARCHIVE_BUDGET_MS}ms budget - they run together, not in turn`, async () => {
    reset();
    pdfBehaviour = () => new Promise(() => {});
    saveBehaviour = () => new Promise(() => {});
    const t0 = Date.now();
    const { value, lines } = await quietly(() => scan(), 2 * ARCHIVE_BUDGET_MS + 1500);
    const took = Date.now() - t0;
    assert.deepStrictEqual(value, baseline);
    assert.ok(took < ARCHIVE_BUDGET_MS + 400, `the reply took ${took}ms - were the writes run one after the other?`);
    assert.strictEqual(lines.length, 1);
  });

  await test('late in the request, the writes get only what is left before the deadline', async () => {
    reset();
    pdfBehaviour = () => new Promise(() => {});
    saveBehaviour = () => new Promise(() => {});
    const t0 = Date.now();
    const { value } = await quietly(() => archive.archiveScan(PDF, SOURCE, TEXT, USABLE, t0 + 800), 3000);
    const took = Date.now() - t0;
    assert.ok(took < 800 + 300, `took ${took}ms with 800ms left`);
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].opts.timeoutMs <= 800, `timeoutMs ${calls[0].opts.timeoutMs} with 800ms left`);
    assert.strictEqual(value.kept, false);
  });

  await test('a PDF already stored is not rewritten, and that is not a failure', async () => {
    reset();
    pdfBehaviour = () => Promise.resolve({ written: false });
    saveBehaviour = () => Promise.resolve({ parseWritten: false });
    const { value, lines } = await quietly(() => scan());
    assert.deepStrictEqual(value, baseline);
    assert.deepStrictEqual(lines, []);
  });

  /* --- database first: one report, one PDF (PARSER-HANDOFF s13) -------------- */

  await test('database first: the PDF write starts only once the database has answered', async () => {
    reset();
    let answered = false;
    saveBehaviour = () => new Promise(r => setTimeout(() => { answered = true; r({ documentId: 5, documentWritten: true, matchedBy: 'new', parseWritten: true }); }, 40));
    let answeredAtPut = null;
    pdfBehaviour = () => { answeredAtPut = answered; return Promise.resolve({ written: true }); };
    const { value, lines } = await quietly(() => scan());
    assert.deepStrictEqual(value, baseline);
    assert.strictEqual(answeredAtPut, true, 'the PDF write started before the database answered');
    assert.deepStrictEqual(lines, []);
  });

  await test('a copy - the database matched an earlier document by its text: no PDF written, the same reply, nothing logged', async () => {
    reset();
    saveBehaviour = () => Promise.resolve({ documentId: 7, documentWritten: false, matchedBy: 'text', parseWritten: false });
    const { value, lines } = await quietly(() => scan());
    assert.deepStrictEqual(value, baseline);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(pdfCalls.length, 0, 'the copy\'s PDF was kept');
    assert.deepStrictEqual(lines, [], 'a copy is not a failure');
    const out = (await quietly(() => archive.archiveScan(PDF, SOURCE, TEXT, USABLE, Date.now() + 5000))).value;
    assert.deepStrictEqual([out.kept, out.pdf, out.db, out.copyOf, out.failed], [true, 'copy, not kept', 'copy, nothing new', 7, []]);
  });

  for (const [what, answer] of [
    ['a new document', { documentId: 8, documentWritten: true, matchedBy: 'new', parseWritten: true }],
    ['the same bytes - a document kept before PDFs were gets its PDF', { documentId: 3, documentWritten: false, matchedBy: 'bytes', parseWritten: false }]
  ]) {
    await test(`the database stored ${what}: the PDF is written`, async () => {
      reset();
      saveBehaviour = () => Promise.resolve(answer);
      const out = (await quietly(() => archive.archiveScan(PDF, SOURCE, TEXT, USABLE, Date.now() + 5000))).value;
      assert.strictEqual(pdfCalls.length, 1);
      assert.strictEqual(pdfCalls[0].sha256, PDF_SHA);
      assert.deepStrictEqual([out.pdf, out.copyOf, out.failed], ['written', null, []]);
    });
  }

  await test('the database down: the PDF is still written, for backfill to save later', async () => {
    reset();
    saveBehaviour = () => Promise.reject(new Error('database down'));
    const out = (await quietly(() => archive.archiveScan(PDF, SOURCE, TEXT, USABLE, Date.now() + 5000))).value;
    assert.strictEqual(pdfCalls.length, 1);
    assert.deepStrictEqual([out.kept, out.pdf, out.db], [true, 'written', 'failed']);
  });

  await test('the database gets half the budget; a hung database leaves the PDF the other half', async () => {
    reset();
    saveBehaviour = () => new Promise(() => {});
    const t0 = Date.now();
    let startedAt = null;
    pdfBehaviour = () => { startedAt = Date.now() - t0; return Promise.resolve({ written: true }); };
    const out = (await quietly(() => archive.archiveScan(PDF, SOURCE, TEXT, USABLE, t0 + 5000))).value;
    assert.ok(calls[0].opts.timeoutMs === ARCHIVE_BUDGET_MS * archive.DATABASE_SHARE, `database timeoutMs ${calls[0].opts.timeoutMs}`);
    assert.ok(startedAt !== null && startedAt < ARCHIVE_BUDGET_MS * archive.DATABASE_SHARE + 150, `the PDF write started at ${startedAt}ms`);
    assert.deepStrictEqual([out.pdf, out.db], ['written', 'failed']);
  });

  await test('no connect step: a production scan asks the PDF store for open and put alone, the database write as before', async () => {
    reset();
    const { value } = await quietly(() => scan());
    assert.deepStrictEqual(value, baseline);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(pdfCalls.length, 1);
    assert.deepStrictEqual(pdfStoreOther, [], `the PDF store was asked for ${pdfStoreOther.join(', ')}`);
    assert.ok(!('connect' in require(PDF_STORE)), 'the stand-in grew a connect()');
  });

  await test('an unusable read is still kept in both places, and its reply is unchanged', async () => {
    reset();
    parseResult = UNUSABLE;
    const { value } = await quietly(() => scan());
    parseResult = USABLE;
    assert.deepStrictEqual(value, baselineUnusable);
    assert.strictEqual(pdfCalls.length, 1);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].payload.output, UNUSABLE);
  });

  await test('a usable reply carries usable and novelty - all the card needs for its novelty line', async () => {
    reset();
    const plain = JSON.parse(baseline.body);
    assert.strictEqual(plain.usable, true);
    assert.deepStrictEqual(plain.novelty, [], 'a result with no novelty field must reply []');
    parseResult = { ...USABLE, novelty: ['heading not known: "Conc."'] };
    const { value } = await quietly(() => scan());
    parseResult = USABLE;
    assert.deepStrictEqual(JSON.parse(value.body).novelty, ['heading not known: "Conc."']);
    assert.ok(!('novelty' in JSON.parse(baselineUnusable.body)), 'a refusal is not a card, so it carries no novelty');
  });

  await test('a PDF that is not a lab report is kept nowhere', async () => {
    reset();
    parseResult = NOT_A_REPORT;
    textResult = NOT_A_REPORT_TEXT;
    await quietly(() => scan());
    parseResult = USABLE;
    textResult = TEXT;
    assert.strictEqual(pdfCalls.length, 0, 'the PDF was kept');
    assert.strictEqual(calls.length, 0, 'the parse was kept');
  });

  /* Two of three signs keep a file (PARSER-HANDOFF s13, "What gets kept, and
     taking it back out"); until 2026-10-02 any one did. */
  const ONE_SIGN = [
    ['the words "Certificate of Analysis" alone', NOT_A_REPORT, PHRASE_ONLY_TEXT],
    ['a laboratory\'s name alone', { ...NOT_A_REPORT, lab: 'Kaycha Labs' }, NOT_A_REPORT_TEXT],
    ['a terpene panel alone', { ...NOT_A_REPORT, terps: { limonene: 0.2 } }, NOT_A_REPORT_TEXT]
  ];
  for (const [what, output, text] of ONE_SIGN) {
    await test(`one sign is not enough - ${what}: kept nowhere, nothing logged`, async () => {
      reset();
      parseResult = output;
      textResult = text;
      const { lines } = await quietly(() => scan());
      parseResult = USABLE;
      textResult = TEXT;
      assert.strictEqual(pdfCalls.length, 0, 'the PDF was kept');
      assert.strictEqual(calls.length, 0, 'the parse was kept');
      assert.deepStrictEqual(lines, []);
    });
  }

  for (const [what, output, text] of [
    ['a laboratory and the words, no terpene panel (Harmony\'s topical)', { ...NOT_A_REPORT, lab: 'Green Scientific Labs' }, TEXT],
    ['a laboratory and a panel, no "Certificate of Analysis" (the six ACS reports)', { ...NOT_A_REPORT, lab: 'ACS Laboratory', totalTerpenes: 2.008 }, NOT_A_REPORT_TEXT],
    ['the words and a panel, no laboratory the parser knows', { ...NOT_A_REPORT, terpenesTested: false }, PHRASE_ONLY_TEXT]
  ]) {
    await test(`two signs are enough - ${what}: kept in both places`, async () => {
      reset();
      parseResult = output;
      textResult = text;
      await quietly(() => scan());
      parseResult = USABLE;
      textResult = TEXT;
      assert.strictEqual(pdfCalls.length, 1);
      assert.strictEqual(calls.length, 1);
    });
  }

  await test('the probe\'s files, read by the real parser: a receipt and a jar label naming Kaycha, a letter naming a certificate - one sign each, kept nowhere', async () => {
    reset();
    const docs = {
      receipt: ['GREEN LEAF DISPENSARY', '123 Example Ave, Clearwater FL 33755', 'Order #48213    10/01/2026 2:32 PM',
                'Customer: Jane Example', 'Rewards #: 5550 1234', 'Item    Qty    Price', 'Sunset Sherbet 3.5g Flower    1    $35.00',
                'Batch: SS-0925    Tested by Kaycha Labs', 'Subtotal    $35.00', 'Total    $35.00', 'Paid: VISA ending 4821'],
      label: ['SUNSET SHERBET', 'Flower - 3.5 g', 'THC 24.1%    CBD <0.1%', 'Batch SS-0925    Harvested 09/10/2026',
              'Lab tested by Kaycha Labs - scan the code for the full report', 'Packaged by Example Farms LLC, Florida.'],
      letter: ['Dear Jane,', 'Thank you for your message. We have attached the certificate of analysis you asked for,',
               'and your order 48213 will ship to 22 Example Street on Monday.', 'Kind regards, The Example Farms team']
    };
    const want = { receipt: ['lab'], label: ['lab'], letter: ['phrase'] };
    for (const [name, lines] of Object.entries(docs)) {
      const text = lines.join('\n');
      const out = realParseCoa(text);
      assert.deepStrictEqual(archive.signsShown(archive.labReportSigns(out, text)), want[name], name);
      const r = await archive.storeScan({ buffer: PDF, finalUrl: SOURCE, text, output: out, context: 'production',
                                          parserVersion: 'a', extractorVersion: 'b' });
      assert.deepStrictEqual(r, { kept: false, reason: 'not a lab report' }, name);
    }
    assert.strictEqual(pdfCalls.length + calls.length, 0);
  });

  await test('withheld - the database says the file was taken out by hand: no PDF written, the same reply, nothing logged', async () => {
    reset();
    saveBehaviour = () => Promise.resolve({ withheld: true, documentId: null, documentWritten: false, matchedBy: null,
                                            extractionId: null, extractionWritten: false, parseId: null, parseWritten: false });
    const { value, lines } = await quietly(() => scan());
    assert.deepStrictEqual(value, baseline);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(pdfCalls.length, 0, 'the PDF of a withheld file was written');
    assert.deepStrictEqual(lines, [], 'a withheld file was logged - that would tie a removed report to a request');
    const out = (await quietly(() => archive.archiveScan(PDF, SOURCE, TEXT, USABLE, Date.now() + 5000))).value;
    assert.deepStrictEqual([out.kept, out.reason, out.pdf, out.db, out.copyOf, out.failed], [false, 'withheld', 'not kept', 'withheld', null, []]);
  });

  await test('the daily cap - the database kept nothing: no PDF written, the same reply, one fixed log line', async () => {
    reset();
    saveBehaviour = () => Promise.resolve({ capped: true, documentId: null, documentWritten: false, matchedBy: null,
                                            extractionId: null, extractionWritten: false, parseId: null, parseWritten: false });
    const { value, lines } = await quietly(() => scan());
    assert.deepStrictEqual(value, baseline);
    assert.strictEqual(pdfCalls.length, 0, 'the PDF was written above the cap');
    assert.deepStrictEqual(lines, ['coa: archive at its daily cap - nothing kept, reply unaffected']);
    noDetail(lines[0]);
    const out = (await quietly(() => archive.archiveScan(PDF, SOURCE, TEXT, USABLE, Date.now() + 5000))).value;
    assert.deepStrictEqual([out.kept, out.reason, out.pdf, out.db, out.failed], [false, 'daily cap', 'not kept', 'daily cap', []]);
  });

  await test('the seed path: a withheld fixture is skipped with its reason, as a non-report is', async () => {
    reset();
    const base = { buffer: PDF, finalUrl: null, text: TEXT, output: USABLE, context: 'seed', parserVersion: 'a', extractorVersion: 'b' };
    const r = await archive.storeScan(base, { saveScan: async () => ({ withheld: true }), openPdfStore: () => ({}) });
    assert.deepStrictEqual([r.kept, r.reason], [false, 'withheld']);
    assert.strictEqual(pdfCalls.length, 0);
  });

  await test('the call site: after parseCoa, before the refusals, production only, once, the deadline from the handler\'s start', async () => {
    /* Since 2026-10-16 the steps up to the verdict are lib/read-report.js,
       where `parsed` turns true only once parseCoa has returned, before the
       unsafe-layout check; coa.js returns before the archive unless it did,
       and replies with a refusal only after it. archiveScan, archiveOn and
       their limits are lib/archive.js's since the same day. */
    const rr = fs.readFileSync(path.join(FN, 'lib/read-report.js'), 'utf8');
    const rrParse = rr.indexOf('output = parse(text);');
    const rrParsed = rr.indexOf('read.parsed = true;');
    const rrUnsafe = rr.indexOf('const unsafe = UNSAFE_UNDER_UNPDF');
    assert.ok(rrParse > 0 && rrParsed > rrParse && rrUnsafe > rrParsed,
      `read-report: parse ${rrParse}, parsed ${rrParsed}, unsafe ${rrUnsafe}`);
    assert.ok(!/archiveScan|storeScan|lib\/archive|pdf-store/.test(rr.replace(/\/\*[\s\S]*?\*\//g, '')), 'read-report reaches the archive');
    const src = fs.readFileSync(COA, 'utf8');
    const start = src.indexOf('export default async (request) => {\n  const archiveDeadline = Date.now() + ARCHIVE_DEADLINE_MS;\n  try {\n    return await reply(request, archiveDeadline);');
    const read = src.indexOf('const read = await readReport(payload.url);');
    const parsed = src.indexOf('if (!read.parsed) return json({ error: read.sentence }, 422, NOSNIFF);', read);
    const gate = src.indexOf('if (archive.archiveOn())', parsed);
    const call = src.indexOf('await archive.archiveScan(read.buffer, read.finalUrl, read.text, result, archiveDeadline);', gate);
    const refusals = src.indexOf('if (read.stage === STAGES.unsafe){');
    assert.ok(start > 0 && read > 0 && parsed > read && gate > parsed && call > gate && refusals > call,
      `start ${start}, read ${read}, parsed ${parsed}, gate ${gate}, call ${call}, refusals ${refusals}`);
    assert.strictEqual(src.split('readReport(').length - 1, 1, 'more than one read');
    assert.strictEqual(src.split('archiveScan(').length - 1, 1, 'more than one call site');
    assert.strictEqual(ARCHIVE_DEADLINE_MS, 9000);
    assert.strictEqual(ARCHIVE_MIN_MS, 300);
    const lib = fs.readFileSync(path.join(FN, 'lib/archive.js'), 'utf8');
    assert.ok(/const archiveOn = \(\) => buildInfo\(\)\.deployContext === 'production';/.test(lib), 'the production gate changed');
  });

  /* Until 2026-10-16 this checked the opposite: that coa.js was still an
     exports.handler function, the format Netlify stops accepting on July 1,
     2027 (PARSER-HANDOFF s13, "coa.js in the current format"). */
  await test('coa.js has one default export and nothing else: a function of the request alone, in the current format', async () => {
    assert.deepStrictEqual(Object.keys(coaModule), ['default']);
    assert.strictEqual(typeof handler, 'function');
    assert.strictEqual(handler.length, 1, 'the handler takes a second argument - the Context');
    const code = fs.readFileSync(COA, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.strictEqual(code.split(/\bexport\b/).length - 1, 1, 'more than one export');
    assert.ok(code.includes('export default async (request) => {'), 'not a default export of the request');
    assert.ok(!/\bexports\b|\bmodule\b|\brequire\(|connectLambda|connectBlobs|\bevent\b/.test(code), 'something of the old format is left');
    assert.ok(!/\bcontext\b|\bctx\b|request\.(headers|url|signal)|headers\.get|cookie|user-?agent|\bgeo\b|\.ip\b|x-nf-|waitUntil/i.test(code),
      'coa.js reads something about the caller');
    /* Every import line, since 2026-10-16: the two lib/ files whole, and
       netlify/lib/http.js's json() by name. */
    assert.deepStrictEqual([...code.matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]),
      ['./lib/read-report.js', './lib/archive.js', '../lib/http.js'], 'its imports changed');
    assert.deepStrictEqual([...code.matchAll(/^import (.*) from /gm)].map(m => m[1]), ['report', 'archive', '{ json }'], 'it imports something new');
    assert.deepStrictEqual(contextReads, [], `the Context was read: ${contextReads.join(', ')}`);
  });

  /* --- requests it cannot read, and a failure (security audit #5) --------------- */

  await test('a body that is not a JSON object - null, an array, a string, a number, true - gets the same 400 as one that is not JSON', async () => {
    reset();
    fetchUrl = null;
    for (const body of ['null', '[]', '"a bare string"', '42', 'true', '[{"url":"https://lab.example.com/r.pdf"}]', '{url: nope']) {
      const { value, lines } = await quietly(() => send(body));
      assert.deepStrictEqual(value, UNREADABLE, body);
      assert.deepStrictEqual(lines, [], body);
    }
    assert.deepStrictEqual([fetchUrl, pdfCalls.length, calls.length], [null, 0, 0], 'an unreadable request was fetched or kept');
  });

  await test('{} - no url - still gets the link sentence; a link its 200, as before; OPTIONS 204 with Allow: POST; GET 405', async () => {
    reset();
    const none = (await quietly(() => send('{}'))).value;
    assert.deepStrictEqual(none, { status: 400, headers: JSON_HEADERS, body: '{"error":"That is not a valid web address."}' });
    assert.deepStrictEqual((await quietly(() => scan())).value, baseline);
    const options = (await quietly(() => send(undefined, 'OPTIONS'))).value;
    assert.deepStrictEqual(options, { status: 204, headers: { allow: 'POST' }, body: '' });
    const get = (await quietly(() => send(undefined, 'GET'))).value;
    assert.deepStrictEqual(get, { status: 405, headers: JSON_HEADERS, body: '{"error":"Send a POST request with a url."}' });
  });

  await test('a throw anywhere - in the read, or after the archive - is the fixed 500 and one fixed line, nothing of the error in either', async () => {
    const SECRET = `boom ${SOURCE} ${PDF_SHA} 203.0.113.9 Kaycha`;
    const throwing = [
      ['inside the read, before the archive', { get usable() { throw new Error(SECRET); }, lab: 'Kaycha Labs', terps: {} }],
      ['after the archive, building the reply', null]
    ];
    version.pin({ ...PRODUCTION, deployContext: 'dev' });
    for (const [where, output] of throwing) {
      reset();
      parseResult = output;
      const { value, lines } = await quietly(() => scan());
      parseResult = USABLE;
      assert.deepStrictEqual(value, FAILED, where);
      assert.deepStrictEqual(lines, [FAILED_LINE], where);
      const said = value.body + lines.join('\n');
      for (const s of ['boom', 'lab.example.com', 'KAY-TEST-001', PDF_SHA, '203.0.113.9', 'TypeError', 'null', 'Kaycha', 'at '])
        assert.ok(!said.includes(s), `${where}: "${s}" in the reply or the line`);
    }
    /* In production the second one reaches the archive first, as every
       parsed read does, and nothing is kept: a null reading shows no sign. */
    version.pin(PRODUCTION);
    reset();
    parseResult = null;
    const { value, lines } = await quietly(() => scan());
    parseResult = USABLE;
    assert.deepStrictEqual([value, lines, pdfCalls.length, calls.length], [FAILED, [FAILED_LINE], 0, 0]);
  });

  /* --- the guards -------------------------------------------------------------- */

  await test('too little time left: skipped without touching either store', async () => {
    reset();
    const r = await archive.archiveScan(PDF, SOURCE, TEXT, USABLE, Date.now() + ARCHIVE_MIN_MS - 50);
    assert.deepStrictEqual(r, { kept: false, reason: 'no time left' });
    assert.strictEqual(pdfCalls.length + calls.length, 0);
  });

  await test('oversized text, or no bytes: skipped', async () => {
    reset();
    const base = { buffer: PDF, finalUrl: SOURCE, text: TEXT, output: USABLE, context: 'production', parserVersion: 'a', extractorVersion: 'b' };
    assert.strictEqual((await archive.storeScan({ ...base, text: 'x'.repeat(archive.MAX_TEXT + 1) })).reason, 'text too large');
    assert.strictEqual((await archive.storeScan({ ...base, buffer: Buffer.alloc(0) })).reason, 'no file');
    assert.strictEqual(pdfCalls.length + calls.length, 0);
  });

  await test('what counts as a lab report: two of three signs', async () => {
    const is = archive.looksLikeLabReport;
    const signs = archive.labReportSigns;
    const none = { lab: null, terps: {}, totalTerpenes: null, terpenesTested: null };
    assert.strictEqual(archive.MIN_SIGNS, 2);
    assert.deepStrictEqual(signs(USABLE, ''), { lab: true, phrase: false, panel: true }, 'signs are booleans, every one');
    assert.strictEqual(is(USABLE, ''), true, 'a laboratory and a panel');
    assert.strictEqual(is({ ...none, lab: 'Kaycha Labs' }, ''), false, 'a laboratory alone');
    assert.strictEqual(is({ ...none, terps: { limonene: 0.2 } }, ''), false, 'one terpene alone');
    assert.strictEqual(is(none, 'CERTIFICATE OF ANALYSIS'), false, 'the words alone');
    assert.strictEqual(is({ ...none, lab: 'Kaycha Labs' }, 'Certificate\nof Analysis'), true, 'a laboratory and the words, across lines');
    assert.strictEqual(is({ ...none, totalTerpenes: 0 }, 'Certificate of Analysis'), true, 'a printed total of zero is a panel (GreenRoads)');
    assert.strictEqual(is({ ...none, terpenesTested: false }, 'Certificate of Analysis'), true, '"terpenes not tested" is a panel too (hemp-bombs)');
    assert.strictEqual(is({ ...none, terps: { limonene: 0 } }, 'Certificate of Analysis'), true, 'a terpene read as zero is still read');
    assert.strictEqual(is({ ...none, totalTerpenes: NaN }, 'Certificate of Analysis'), false, 'a total that is not a number is not one');
    assert.strictEqual(is(none, 'an invoice, a letter, a menu'), false);
    assert.strictEqual(is(none, ''), false);
    assert.strictEqual(is(null, 'Certificate of Analysis'), false, 'no parse at all shows no sign, whatever the text');
    assert.deepStrictEqual(signs(null, 'Certificate of Analysis'), { lab: false, phrase: false, panel: false });
    assert.deepStrictEqual(archive.signsShown({ panel: true, lab: true, phrase: false }), ['lab', 'panel'], 'always in one order');
  });

  await test('the stored address drops query, fragment and credentials; only https', async () => {
    const a = archive.sourceAddress;
    assert.strictEqual(a('https://b.example/x/y.pdf?X-Amz-Signature=abc&X-Amz-Credential=k#f'), 'https://b.example/x/y.pdf');
    assert.strictEqual(a('https://b.example/y.pdf?Expires=1&Signature=s&Key-Pair-Id=k'), 'https://b.example/y.pdf');
    assert.strictEqual(a('https://someone:secret@b.example/y.pdf'), 'https://b.example/y.pdf');
    assert.strictEqual(a('https://b.example:8443/y.pdf'), 'https://b.example:8443/y.pdf');
    assert.strictEqual(a('http://b.example/y.pdf'), null);
    assert.strictEqual(a('not a url'), null);
    assert.strictEqual(a(null), null);
  });

  await test('a failure reason carries no fingerprint, address, database host or IP', async () => {
    const r = archive.reason(new Error(`x ${PDF_SHA} at https://b.example/y.pdf?t=1 via ` +
      'db.abcdefghijklmnopqrst.supabase.co:5432 and aws-0-us-east-1.pooler.supabase.com from 203.0.113.9:443 or 2001:db8::1'));
    for (const s of [PDF_SHA, 'b.example', 'supabase', '203.0.113.9', '2001:db8']) assert.ok(!r.includes(s), `"${s}" survived: ${r}`);
  });

  /* One copy of each server helper, since 2026-10-16 (PARSER-HANDOFF s13,
     "One set of server helpers"): lib/db.js connects and scrubs, for the
     archive and the dispensary store alike, and netlify/lib/http.js reads
     request bodies and builds the replies every function shares. */
  await test('...and it is the dispensary store\'s scrubber, lib/db.js\'s scrub(): no key and no quoted value either', async () => {
    const db = require(path.join(FN, 'lib/db.js'));
    assert.strictEqual(archive.reason, db.scrub, 'archive.reason is a scrubber of its own');
    const key = 'nsk_' + 'b'.repeat(64);
    const r = archive.reason(new Error(`invalid input syntax for type json: "jane@example.org" near ${key}`));
    assert.strictEqual(r, 'invalid input syntax for type json: <value> near <key>');
  });

  await test('one copy of each server helper: connections and the scrubber in lib/db.js, bodies and replies in netlify/lib/http.js', async () => {
    const files = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (/\.m?js$/.test(e.name)) files.push(p);
      }
    })(path.join(ROOT, 'netlify'));
    const code = f => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const holders = re => files.filter(f => re.test(code(f))).map(f => path.relative(ROOT, f).split(path.sep).join('/')).sort();
    assert.deepStrictEqual(holders(/\bfunction\s+(withClient|clientConfig|checkUrl|loadCa)\s*\(|\bwithClient\s*=/),
      ['netlify/functions/lib/db.js'], 'a second connection helper');
    assert.deepStrictEqual(holders(/\.replace\(\/\[0-9a-f\]\{64\}\/gi?, '<sha256>'\)/), ['netlify/functions/lib/db.js'], 'a second scrubber');
    assert.deepStrictEqual(holders(/\bfunction\s+readJsonBody\s*\(/), ['netlify/lib/http.js'], 'a second body reader');
    /* coa.js's own function reply(request, deadline) is its handler's body, not a helper. */
    assert.deepStrictEqual(holders(/\bfunction\s+(json|within)\s*\(|\bconst\s+(json|reply|notFound|methodNotAllowed|within)\s*=/),
      ['netlify/lib/http.js'], 'a second reply or time-limit helper');
    assert.deepStrictEqual(holders(/new Response\('Not Found'/), ['netlify/lib/http.js'], 'a 404 written out again');
    /* b2b-release's 405 carries its own two headers (plain(), kept there). */
    assert.deepStrictEqual(holders(/'Method Not Allowed'/), ['netlify/functions/b2b-release.js', 'netlify/lib/http.js'],
      'a 405 written out again');
  });

  /* --- store.js: the bounded connection --------------------------------------- */

  delete require.cache[STORE];
  const store = require(STORE);

  class FakeClient extends EventEmitter {
    constructor(config) { super(); this.config = config; this.ended = 0; FakeClient.made.push(this); }
    connect() { return FakeClient.behaviour.connect(this); }
    query(sql, params) { this.sql = sql; this.params = params; return FakeClient.behaviour.query(this); }
    end() { this.ended++; return FakeClient.behaviour.end ? FakeClient.behaviour.end(this) : Promise.resolve(); }
  }
  FakeClient.made = [];
  const behave = (connect, query, end) => { FakeClient.behaviour = { connect, query, end }; };
  const ok = () => Promise.resolve();
  const hang = () => new Promise(() => {});
  const saveRow = () => Promise.resolve({ rows: [{ result: { parseWritten: true, parseId: 7 } }] });
  const payload = () => ({
    sha256: 'a'.repeat(64), byteSize: 1, sourceUrl: null, fetchedAt: null,
    extractorVersion: 'test', text: 'text', parserVersion: 'test', context: 'seed', output: { lab: 'x' }
  });

  await test('saveScan: connects with the verified-TLS config, one query, closes, answers', async () => {
    behave(ok, saveRow);
    const r = await store.saveScan(payload(), { timeoutMs: 200, _Client: FakeClient });
    const c = FakeClient.made.at(-1);
    await tick();
    assert.deepStrictEqual(r, { parseWritten: true, parseId: 7 });
    assert.strictEqual(c.config.connectionString, process.env.NOSE_DB_URL);
    assert.ok(c.config.ssl && /BEGIN CERTIFICATE/.test(c.config.ssl.ca), 'TLS is not verified against the CA');
    assert.strictEqual(c.config.connectionTimeoutMillis, 200);
    assert.strictEqual(c.config.query_timeout, 200);
    assert.strictEqual(c.sql, 'select nose.save_scan($1::jsonb) as result');
    assert.strictEqual(JSON.parse(c.params[0]).sha256, 'a'.repeat(64));
    assert.ok(c.listenerCount('error') >= 1, 'no error listener');
    assert.strictEqual(c.ended, 1);
  });

  for (const [what, connect, query] of [['connect', hang, saveRow], ['query', ok, hang]]) {
    await test(`saveScan: a hung ${what} is abandoned at the budget and the client closed`, async () => {
      behave(connect, query);
      const t0 = Date.now();
      await assert.rejects(store.saveScan(payload(), { timeoutMs: 60, _Client: FakeClient }), /gave up after 60ms/);
      const took = Date.now() - t0;
      await tick();
      assert.ok(took >= 55 && took < 400, `took ${took}ms`);
      assert.strictEqual(FakeClient.made.at(-1).ended, 1);
    });
  }

  await test('saveScan: a refused connection rejects with its reason and closes', async () => {
    behave(() => Promise.reject(new Error('self-signed certificate in certificate chain')), saveRow);
    await assert.rejects(store.saveScan(payload(), { timeoutMs: 200, _Client: FakeClient }), /self-signed/);
    await tick();
    assert.strictEqual(FakeClient.made.at(-1).ended, 1);
  });

  await test('failures after giving up do not crash: a late socket error, a late rejection', async () => {
    let rejectLate;
    behave(() => new Promise((_, rej) => { rejectLate = rej; }), saveRow);
    await assert.rejects(store.saveScan(payload(), { timeoutMs: 30, _Client: FakeClient }), /gave up/);
    const c = FakeClient.made.at(-1);
    c.emit('error', new Error('socket hang up'));      // throws if nobody listens
    rejectLate(new Error('Connection terminated'));
    await sleep(20);
    assert.strictEqual(unhandled.length, 0, `unhandled: ${unhandled.map(e => e && e.message)}`);
  });

  await test('an end() that throws does not spoil a saved result', async () => {
    behave(ok, saveRow, () => { throw new Error('end blew up'); });
    const r = await store.saveScan(payload(), { timeoutMs: 200, _Client: FakeClient });
    await sleep(10);
    assert.strictEqual(r.parseWritten, true);
    assert.strictEqual(unhandled.length, 0);
  });

  await test('no address, or one with sslmode: refused before any client exists', async () => {
    behave(ok, saveRow);
    const before = FakeClient.made.length;
    const url = process.env.NOSE_DB_URL;
    delete process.env.NOSE_DB_URL;
    await assert.rejects(store.saveScan(payload(), { _Client: FakeClient }), /NOSE_DB_URL is not set/);
    process.env.NOSE_DB_URL = url + '?sslmode=require';
    await assert.rejects(store.saveScan(payload(), { _Client: FakeClient }), /sslmode/);
    process.env.NOSE_DB_URL = url;
    assert.strictEqual(FakeClient.made.length, before);
  });

  await test('a client passed in is used as given, and no connection is made', async () => {
    const before = FakeClient.made.length;
    let seen;
    const r = await store.saveScan(payload(), { client: { query: (sql) => { seen = sql; return saveRow(); } } });
    assert.strictEqual(r.parseWritten, true);
    assert.strictEqual(seen, 'select nose.save_scan($1::jsonb) as result');
    assert.strictEqual(FakeClient.made.length, before);
  });

  await test('touch: one indexed read of a real table, bounded, closed', async () => {
    behave(ok, () => Promise.resolve({ rows: [] }));
    assert.strictEqual(await store.touch({ timeoutMs: 200, _Client: FakeClient }), true);
    const c = FakeClient.made.at(-1);
    await tick();
    assert.strictEqual(c.sql, store.TOUCH_SQL);
    assert.match(c.sql, /from nose\.documents order by id desc limit 1/);
    assert.strictEqual(c.ended, 1);
    behave(ok, hang);
    await assert.rejects(store.touch({ timeoutMs: 40, _Client: FakeClient }), /gave up/);
  });

  /* --- keep-awake --------------------------------------------------------- */

  await test('keep-awake: scheduled at least four times a day, reads through store.touch', async () => {
    const src = fs.readFileSync(path.join(FN, 'keep-awake.js'), 'utf8');
    assert.match(src, /import store from '\.\/lib\/store\.js';/);
    assert.match(src, /await store\.touch\(/);
    assert.match(src, /if \(!process\.env\.NOSE_DB_URL\)/);
    const m = /export const config = \{ schedule: '([^']+)' \};/.exec(src);
    assert.ok(m, 'no schedule');
    const [minute, hour, dom, month, dow] = m[1].trim().split(/\s+/);
    assert.ok(/^\d+$/.test(minute) && +minute < 60, `minute "${minute}"`);
    assert.deepStrictEqual([dom, month, dow], ['*', '*', '*']);
    let hours;
    if (hour === '*') hours = 24;
    else if (/^\*\/\d+$/.test(hour)) hours = Math.ceil(24 / +hour.slice(2));
    else hours = hour.split(',').length;
    assert.ok(hours >= 4 && hours <= 24, `${hours} runs a day`);
  });


  /* --- the real corpus ------------------------------------------------------ */

  const dir = path.join(ROOT, 'test/fixtures/extracted');
  const texts = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.txt')) : [];
  /* Every fixture is kept, by at least two signs - and which two is pinned,
     so a parser or rule change that leaves a report one sign from refusal
     shows here: 52 show all three, the six ACS reports print no "Certificate
     of Analysis", and Harmony's topical runs no terpene panel. */
  await test(`every real report shows at least two signs, and none carries a personal key (${texts.length} fixtures)`, async () => {
    if (!texts.length) { console.log('note  no extracted fixtures - run: node test/extract-dump.js'); return; }
    const bySigns = {};
    for (const f of texts) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const out = realParseCoa(text);
      assert.ok(archive.looksLikeLabReport(out, text), `${f} would not be archived`);
      const shown = archive.signsShown(archive.labReportSigns(out, text)).join(' + ');
      (bySigns[shown] = bySigns[shown] || []).push(f.replace(/\.txt$/, ''));
      assert.strictEqual(store.findPersonalKey(out), null, `${f} output carries a personal key`);
    }
    for (const k of Object.keys(bySigns)) bySigns[k].sort();
    assert.deepStrictEqual(Object.keys(bySigns).sort(), ['lab + panel', 'lab + phrase', 'lab + phrase + panel']);
    assert.strictEqual(bySigns['lab + phrase + panel'].length, 52);
    assert.deepStrictEqual(bySigns['lab + panel'], ['ACS-CAR-001', 'ACS-CAR-002', 'ACS-FLW-002', 'ACS-LRS-001', 'ACS-LRS-002', 'ACS-PRR-001']);
    assert.deepStrictEqual(bySigns['lab + phrase'], ['Harmony-Muscle-Rub-COA-PHRO1']);
  });

  await test('no unhandled rejection anywhere in the run, and the Context never read by any request of it', async () => {
    await sleep(20);
    assert.strictEqual(unhandled.length, 0, `unhandled: ${unhandled.map(e => e && e.message)}`);
    assert.deepStrictEqual(contextReads, [], `the Context was read: ${contextReads.join(', ')}`);
  });

  finished = true;
  for (const f of failed) console.error(f);
  if (failed.length) {
    console.error(`\narchive-wiring: ${failed.length} failure${failed.length === 1 ? '' : 's'} (${passed} passed)`);
    process.exit(1);
  }
  console.log(`archive-wiring: ${passed} checks\narchive-wiring clean`);
  process.exit(0);
}

main().catch(e => { console.error('archive-wiring threw:', e && e.stack); process.exit(1); });

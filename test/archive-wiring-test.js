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
 *   - connectLambda runs before the PDF write
 *   - exactly what is sent: the PDF under its SHA-256 with { sourceUrl,
 *     fetchedAt } and nothing else, the fixed database payload keys, the
 *     address without its query string, a UTC day and never a time, context
 *     "production", nothing from the request, and nothing logged on success
 *   - only lab reports are kept, and every real report in the corpus counts
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

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(700, 0x20)]);
const PDF_SHA = crypto.createHash('sha256').update(PDF).digest('hex');
const TEXT = 'KAYCHA LABS CERTIFICATE OF ANALYSIS - offline wiring test text. '.repeat(6);
const NOT_A_REPORT_TEXT = 'Dinner menu. Soup of the day, bread, a glass of water. '.repeat(6);
const SOURCE = 'https://lab.example.com/reports/KAY-TEST-001.pdf?token=abc123&order=98765#page=2';
const STRIPPED = 'https://lab.example.com/reports/KAY-TEST-001.pdf';
const EVENT = {
  httpMethod: 'POST',
  body: JSON.stringify({ url: SOURCE }),
  headers: { 'x-nf-client-connection-ip': '203.0.113.9', 'user-agent': 'WiringTestAgent/1.0', cookie: 'nose_session=s3ss10n' }
};
const FROM_REQUEST = ['203.0.113.9', 'WiringTestAgent', 's3ss10n', 'abc123', '98765'];
const USABLE = {
  lab: 'Kaycha Labs', strain: 'Test Strain', batch: 'B-1', labId: 'L-1', harvestDate: null,
  productClass: 'flower', totalTerpenes: 2.1, moisture: 11.2, waterActivity: 0.55, freshnessApplies: true,
  terps: { limonene: 0.8, myrcene: 0.6 }, mappedTotal: 1.4, unmodelledTotal: 0.7, coverage: 0.67,
  modelCoverage: 0.9, measuredCoverage: 0.9, layout: 'row', readBy: 'rowwise', unmapped: [],
  terpenesTested: 20, usable: true, rejectReasons: [], warnings: [],
  reportDate: '07/11/25', client: 'Test Client', parserVersion: 'c0ffee1'
};
const UNUSABLE = { ...USABLE, usable: false, rejectReasons: ['coverage too low'] };
const NOT_A_REPORT = { ...USABLE, lab: null, terps: {}, usable: false };

let parseResult = USABLE;
let textResult = TEXT;
let fetchUrl = null;
install(EXTRACT, { extractCoaText: async () => ({ text: textResult, pages: 1 }) });
install(PARSE, { parseCoa: () => parseResult });
globalThis.fetch = async (url) => { fetchUrl = url; return new Response(PDF, { status: 200, headers: { 'content-type': 'application/pdf' } }); };

const PRODUCTION = { parserVersion: 'c0ffee1', extractorVersion: '0123456789ab', deployContext: 'production' };
version.pin({ ...PRODUCTION, deployContext: 'dev' });

const coa = require(path.join(FN, 'coa.js'));
const { ARCHIVE_BUDGET_MS, ARCHIVE_MIN_MS } = coa._ARCHIVE_LIMITS;
const eventFor = url => ({ ...EVENT, body: JSON.stringify({ url }) });

/* Stand-ins that record every call. */
const pdfCalls = [];
const connects = [];
let pdfBehaviour = () => Promise.resolve({ written: true });
let connectBehaviour = () => {};
const fakePdfStore = {
  STORE_NAME: 'coa-pdf',
  connect: event => { connects.push({ event, pdfCallsBefore: pdfCalls.length }); connectBehaviour(event); },
  open: () => ({ fakeBlobStore: true }),
  put: (store, sha256, bytes, meta) => { pdfCalls.push({ store, sha256, bytes, meta, connectsBefore: connects.length }); return pdfBehaviour(); }
};
const calls = [];
let saveBehaviour = () => Promise.resolve({ parseWritten: true });
const fakeStore = { saveScan: (payload, opts) => { calls.push({ payload, opts }); return saveBehaviour(); } };

const reset = () => {
  pdfCalls.length = 0; connects.length = 0; calls.length = 0;
  pdfBehaviour = () => Promise.resolve({ written: true });
  connectBehaviour = () => {};
  saveBehaviour = () => Promise.resolve({ parseWritten: true });
};

async function main() {
  /* --- only production stores anything ------------------------------------- */

  let baseline, baselineUnusable;

  /* 'dev' is pinned here; test/archive-scripts-test.js proves that a missing
     or broken build-info.json reads as 'dev' in the first place. */
  await test('dev context: a normal reply, nothing stored, no storage code loaded, nothing logged', async () => {
    const { value, lines } = await quietly(() => coa.handler(EVENT));
    baseline = value;
    assert.strictEqual(value.statusCode, 200);
    assert.strictEqual(coa._archiveOn(), false);
    assert.ok(!(PDF_STORE in require.cache), 'pdf-store.js was loaded');
    assert.ok(!(STORE in require.cache), 'store.js was loaded');
    assert.ok(!loaded('pg'), 'pg was loaded');
    assert.ok(!loaded(path.join('@netlify', 'blobs')), '@netlify/blobs was loaded');
    assert.deepStrictEqual(lines, []);
    parseResult = UNUSABLE;
    baselineUnusable = (await quietly(() => coa.handler(EVENT))).value;
    parseResult = USABLE;
    assert.strictEqual(baselineUnusable.statusCode, 422);
  });

  await test('deploy previews and branch deploys store nothing - they share the site\'s Blobs store', async () => {
    for (const deployContext of ['deploy-preview', 'branch-deploy']) {
      version.pin({ ...PRODUCTION, deployContext });
      const { value, lines } = await quietly(() => coa.handler(EVENT));
      assert.deepStrictEqual(value, baseline, deployContext);
      assert.strictEqual(coa._archiveOn(), false, deployContext);
      assert.deepStrictEqual(lines, [], deployContext);
    }
    assert.ok(!(PDF_STORE in require.cache) && !(STORE in require.cache), 'storage code was loaded');
  });

  install(PDF_STORE, fakePdfStore);
  version.pin(PRODUCTION);

  await test('production without NOSE_DB_URL: the PDF is kept, the database half is a no-op, store.js never loads', async () => {
    reset();
    const { value, lines } = await quietly(() => coa.handler(EVENT));
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
  await test('both writes succeed: the same reply, one PDF write, one save, connectLambda first, nothing logged', async () => {
    reset();
    const { value, lines } = await quietly(() => coa.handler(EVENT));
    assert.deepStrictEqual(value, baseline);
    assert.strictEqual(pdfCalls.length, 1);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(connects.length, 1);
    assert.strictEqual(connects[0].pdfCallsBefore, 0, 'the PDF write started before connectLambda');
    assert.strictEqual(pdfCalls[0].connectsBefore, 1);
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

  await test('nothing from the request reaches either write; only connectLambda sees the event', async () => {
    const all = JSON.stringify({ pdf: { ...pdfSent, bytes: undefined }, db: sent });
    for (const s of FROM_REQUEST) assert.ok(!all.includes(s), `"${s}" was sent`);
    assert.strictEqual(connects[0].event, EVENT, 'connectLambda did not get the event');
    const src = coa._archiveScan.toString();
    assert.ok(!/\bevent\b/.test(src), 'archiveScan names `event`');
    assert.ok(!/headers|cookie|user-?agent/i.test(src), 'archiveScan reads request details');
    const lib = fs.readFileSync(path.join(FN, 'lib/archive.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/\bevent\b|headers|cookie|user-?agent/i.test(lib), 'lib/archive.js reads request details');
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
      await quietly(() => coa.handler(eventFor(url)));
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
    const { value, lines } = await quietly(() => coa.handler(EVENT));
    assert.deepStrictEqual(value, baseline);
    assert.strictEqual(calls.length, 1, 'the database write depended on the PDF write');
    assert.strictEqual(lines.length, 1, `logged: ${JSON.stringify(lines)}`);
    assert.match(lines[0], /pdf:/);
    noDetail(lines[0]);
  });

  await test('the database write fails: the same reply, the PDF still kept, one log line with no detail', async () => {
    reset();
    saveBehaviour = () => Promise.reject(new Error('connect ECONNREFUSED 10.1.2.3:6543 aws-0-us-east-1.pooler.supabase.com'));
    const { value, lines } = await quietly(() => coa.handler(EVENT));
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
    const { value, lines } = await quietly(() => coa.handler(EVENT));
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
      const { value, lines } = await quietly(() => coa.handler(EVENT), ARCHIVE_BUDGET_MS + 1500);
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
    const { value, lines } = await quietly(() => coa.handler(EVENT), 2 * ARCHIVE_BUDGET_MS + 1500);
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
    const { value } = await quietly(() => coa._archiveScan(PDF, SOURCE, TEXT, USABLE, t0 + 800), 3000);
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
    const { value, lines } = await quietly(() => coa.handler(EVENT));
    assert.deepStrictEqual(value, baseline);
    assert.deepStrictEqual(lines, []);
  });

  await test('connectLambda throwing does not stop the database write or change the reply', async () => {
    reset();
    connectBehaviour = () => { throw new Error('no blobs context in this event'); };
    const { value } = await quietly(() => coa.handler(EVENT));
    assert.deepStrictEqual(value, baseline);
    assert.strictEqual(calls.length, 1);
  });

  await test('an unusable read is still kept in both places, and its reply is unchanged', async () => {
    reset();
    parseResult = UNUSABLE;
    const { value } = await quietly(() => coa.handler(EVENT));
    parseResult = USABLE;
    assert.deepStrictEqual(value, baselineUnusable);
    assert.strictEqual(pdfCalls.length, 1);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].payload.output, UNUSABLE);
  });

  await test('a PDF that is not a lab report is kept nowhere', async () => {
    reset();
    parseResult = NOT_A_REPORT;
    textResult = NOT_A_REPORT_TEXT;
    await quietly(() => coa.handler(EVENT));
    parseResult = USABLE;
    textResult = TEXT;
    assert.strictEqual(pdfCalls.length, 0, 'the PDF was kept');
    assert.strictEqual(calls.length, 0, 'the parse was kept');
  });

  await test('"Certificate of Analysis" in the text is enough: no lab, no terpenes, still kept', async () => {
    reset();
    parseResult = NOT_A_REPORT;
    await quietly(() => coa.handler(EVENT));
    parseResult = USABLE;
    assert.strictEqual(pdfCalls.length, 1);
    assert.strictEqual(calls.length, 1);
  });

  await test('the call site: after parseCoa, before the refusals, production only, connectBlobs first, once', async () => {
    const src = fs.readFileSync(path.join(FN, 'coa.js'), 'utf8');
    const parsed = src.indexOf('result = parseCoa(text)');
    const gate = src.indexOf('if (archiveOn()){');
    const connect = src.indexOf('connectBlobs(event);', gate);
    const call = src.indexOf('await archiveScan(fetched.buffer, fetched.finalUrl, text, result, archiveDeadline);');
    const refusals = src.indexOf('const unsafe = UNSAFE_UNDER_UNPDF');
    assert.ok(parsed > 0 && gate > parsed && connect > gate && call > connect && refusals > call,
      `parse ${parsed}, gate ${gate}, connect ${connect}, call ${call}, refusals ${refusals}`);
    assert.strictEqual(src.split('await archiveScan(').length - 1, 1, 'more than one call site');
    assert.ok(/const archiveOn = \(\) => buildInfo\(\)\.deployContext === 'production';/.test(src), 'the production gate changed');
    assert.ok(/exports\.handler = async function\(event\)/.test(src), 'coa.js is no longer a Lambda-style handler');
  });

  /* --- the guards -------------------------------------------------------------- */

  await test('too little time left: skipped without touching either store', async () => {
    reset();
    const r = await coa._archiveScan(PDF, SOURCE, TEXT, USABLE, Date.now() + ARCHIVE_MIN_MS - 50);
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

  await test('what counts as a lab report', async () => {
    const is = archive.looksLikeLabReport;
    assert.strictEqual(is(USABLE, ''), true, 'a named laboratory');
    assert.strictEqual(is({ lab: null, terps: { limonene: 0.2 } }, ''), true, 'one terpene');
    assert.strictEqual(is({ lab: null, terps: {} }, 'CERTIFICATE OF ANALYSIS'), true, 'the heading');
    assert.strictEqual(is({ lab: null, terps: {} }, 'Certificate\nof Analysis'), true, 'the heading across lines');
    assert.strictEqual(is({ lab: null, terps: {} }, 'an invoice, a letter, a menu'), false);
    assert.strictEqual(is({ lab: null, terps: {} }, ''), false);
    assert.strictEqual(is(null, 'Certificate of Analysis'), false, 'no parse at all');
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
  await test(`every real report counts as one, and none carries a personal key (${texts.length} fixtures)`, async () => {
    if (!texts.length) { console.log('note  no extracted fixtures - run: node test/extract-dump.js'); return; }
    for (const f of texts) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const out = realParseCoa(text);
      assert.ok(archive.looksLikeLabReport(out, text), `${f} would not be archived`);
      assert.ok(archive.looksLikeLabReport(out, ''), `${f} counts only because of its heading`);
      assert.strictEqual(store._findPersonalKey(out), null, `${f} output carries a personal key`);
    }
  });

  await test('no unhandled rejection anywhere in the run', async () => {
    await sleep(20);
    assert.strictEqual(unhandled.length, 0, `unhandled: ${unhandled.map(e => e && e.message)}`);
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

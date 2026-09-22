#!/usr/bin/env node
'use strict';
/* The path from a scan to the archive, offline - no network, no database.
 *
 *   node test/archive-wiring-test.js       expect: archive-wiring clean
 *
 * What it pins down:
 *   - the reply never depends on the archive: the handler's response is
 *     identical whether the write succeeds, fails, hangs, or is not configured
 *   - unset NOSE_DB_URL never loads store.js or pg
 *   - exactly what is sent: the fixed payload keys, the address without its
 *     query string, no time of day, context "production", nothing from the
 *     request, and nothing logged on success
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

/* --- the scan the handler will see ------------------------------------------ */

const realParseCoa = require(PARSE).parseCoa;   // kept for the corpus check

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(700, 0x20)]);
const TEXT = 'KAYCHA LABS CERTIFICATE OF ANALYSIS - offline wiring test text. '.repeat(6);
const SOURCE = 'https://lab.example.com/reports/KAY-TEST-001.pdf?token=abc123&order=98765#page=2';
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
  terpenesTested: 20, usable: true, rejectReasons: [], warnings: []
};
const UNUSABLE = { ...USABLE, usable: false, rejectReasons: ['coverage too low'] };
const NOT_A_REPORT = { ...USABLE, lab: null, terps: {}, usable: false };

let parseResult = USABLE;
install(EXTRACT, { extractCoaText: async () => ({ text: TEXT, pages: 1 }) });
install(PARSE, { parseCoa: () => parseResult });
globalThis.fetch = async () => new Response(PDF, { status: 200, headers: { 'content-type': 'application/pdf' } });

const coa = require(path.join(FN, 'coa.js'));
const { ARCHIVE_BUDGET_MS, ARCHIVE_MIN_MS, ARCHIVE_MAX_TEXT } = coa._ARCHIVE_LIMITS;

/* A stand-in store that records every call. */
const calls = [];
let saveBehaviour = () => Promise.resolve({ parseWritten: true });
const fakeStore = { saveScan: (payload, opts) => { calls.push({ payload, opts }); return saveBehaviour(); } };

const pgLoaded = () => Object.keys(require.cache).some(k => k.includes(`${path.sep}node_modules${path.sep}pg${path.sep}`));

async function main() {
  /* --- the reply never depends on the archive ----------------------------- */

  let baseline, baselineUnusable;

  await test('unset NOSE_DB_URL: a normal reply, and neither store.js nor pg is loaded', async () => {
    const { value, lines } = await quietly(() => coa.handler(EVENT));
    baseline = value;
    assert.strictEqual(value.statusCode, 200);
    assert.ok(!(STORE in require.cache), 'store.js was loaded');
    assert.ok(!pgLoaded(), 'pg was loaded');
    assert.deepStrictEqual(lines, []);
    parseResult = UNUSABLE;
    baselineUnusable = (await quietly(() => coa.handler(EVENT))).value;
    parseResult = USABLE;
    assert.strictEqual(baselineUnusable.statusCode, 422);
  });

  install(STORE, fakeStore);
  const fakeUrl = new URL('postgresql://aws-0-us-east-1.pooler.supabase.com');
  fakeUrl.username = 'nose_writer.abcdefghijklmnopqrst';
  fakeUrl.password = 'not-a-real-password';
  fakeUrl.port = '6543';
  fakeUrl.pathname = '/postgres';
  process.env.NOSE_DB_URL = fakeUrl.toString();

  let sent;
  await test('write succeeds: the same reply, one save, nothing logged', async () => {
    calls.length = 0;
    saveBehaviour = () => Promise.resolve({ parseWritten: true });
    const { value, lines } = await quietly(() => coa.handler(EVENT));
    assert.deepStrictEqual(value, baseline);
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(lines, [], 'a successful write logged something');
    sent = calls[0];
  });

  await test('the payload: fixed keys, file fingerprint, address without query, day-only, production', async () => {
    const p = sent.payload;
    assert.deepStrictEqual(Object.keys(p).sort(),
      ['byteSize', 'context', 'extractorVersion', 'fetchedAt', 'output', 'parserVersion', 'sha256', 'sourceUrl', 'text']);
    assert.strictEqual(p.sha256, crypto.createHash('sha256').update(PDF).digest('hex'));
    assert.strictEqual(p.byteSize, PDF.length);
    assert.strictEqual(p.sourceUrl, 'https://lab.example.com/reports/KAY-TEST-001.pdf');
    assert.strictEqual(p.fetchedAt, null, 'a time of day was sent');
    assert.strictEqual(p.context, 'production');
    assert.strictEqual(p.text, TEXT);
    assert.strictEqual(p.output, USABLE);
    assert.ok(typeof p.parserVersion === 'string' && p.parserVersion.length > 0);
    assert.strictEqual(p.extractorVersion, coa._EXTRACTOR_VERSION);
    assert.ok(sent.opts.timeoutMs > 0 && sent.opts.timeoutMs <= ARCHIVE_BUDGET_MS, `timeoutMs ${sent.opts.timeoutMs}`);
  });

  await test('nothing from the request reaches the archive', async () => {
    const all = JSON.stringify(sent);
    for (const s of FROM_REQUEST) assert.ok(!all.includes(s), `"${s}" was sent`);
    const src = coa._archiveScan.toString();
    assert.ok(!/\bevent\b/.test(src), 'archiveScan names `event`');
    assert.ok(!/headers|cookie|user-?agent/i.test(src), 'archiveScan reads request details');
  });

  await test('write fails: the same reply, one log line with no detail of the document', async () => {
    calls.length = 0;
    saveBehaviour = () => Promise.reject(new Error('connect ECONNREFUSED'));
    const { value, lines } = await quietly(() => coa.handler(EVENT));
    assert.deepStrictEqual(value, baseline);
    assert.strictEqual(lines.length, 1, `logged: ${JSON.stringify(lines)}`);
    const sha = crypto.createHash('sha256').update(PDF).digest('hex');
    for (const s of ['lab.example.com', 'KAY-TEST-001', sha, 'KAYCHA LABS', ...FROM_REQUEST]) {
      assert.ok(!lines[0].includes(s), `the log line names "${s}"`);
    }
  });

  await test(`write hangs: the same reply, within the ${ARCHIVE_BUDGET_MS}ms budget`, async () => {
    saveBehaviour = () => new Promise(() => {});
    const t0 = Date.now();
    const { value, lines } = await quietly(() => coa.handler(EVENT), ARCHIVE_BUDGET_MS + 1000);
    const took = Date.now() - t0;
    assert.deepStrictEqual(value, baseline);
    assert.ok(took < ARCHIVE_BUDGET_MS + 400, `the reply took ${took}ms`);
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], /timed out/);
  });

  await test('an unusable read is still archived, and its reply is unchanged', async () => {
    calls.length = 0;
    saveBehaviour = () => Promise.resolve({ parseWritten: true });
    parseResult = UNUSABLE;
    const { value } = await quietly(() => coa.handler(EVENT));
    parseResult = USABLE;
    assert.deepStrictEqual(value, baselineUnusable);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].payload.output, UNUSABLE);
  });

  await test('a document that is not a lab report is not kept', async () => {
    calls.length = 0;
    parseResult = NOT_A_REPORT;
    await quietly(() => coa.handler(EVENT));
    parseResult = USABLE;
    assert.strictEqual(calls.length, 0);
  });

  await test('the call site: after parseCoa, before the refusals, with exactly these arguments', async () => {
    const src = fs.readFileSync(path.join(FN, 'coa.js'), 'utf8');
    const parsed = src.indexOf('result = parseCoa(text)');
    const call = src.indexOf('await archiveScan(fetched.buffer, fetched.finalUrl, text, result, archiveDeadline);');
    const refusals = src.indexOf('const unsafe = UNSAFE_UNDER_UNPDF');
    assert.ok(parsed > 0 && call > parsed && refusals > call, `parse ${parsed}, call ${call}, refusals ${refusals}`);
    assert.strictEqual(src.split('await archiveScan(').length - 1, 1, 'more than one call site');
  });

  /* --- archiveScan's own guards --------------------------------------------- */

  await test('too little time left: skipped without touching the store', async () => {
    calls.length = 0;
    const r = await coa._archiveScan(PDF, SOURCE, TEXT, USABLE, Date.now() + ARCHIVE_MIN_MS - 50);
    assert.deepStrictEqual(r, { stored: false, reason: 'no time left' });
    assert.strictEqual(calls.length, 0);
  });

  await test('oversized text: skipped', async () => {
    calls.length = 0;
    const r = await coa._archiveScan(PDF, SOURCE, 'x'.repeat(ARCHIVE_MAX_TEXT + 1), USABLE, Date.now() + 5000);
    assert.strictEqual(r.reason, 'text too large');
    assert.strictEqual(calls.length, 0);
  });

  await test('what counts as a lab report', async () => {
    assert.strictEqual(coa._isLabReport(USABLE), true);
    assert.strictEqual(coa._isLabReport({ lab: null, terps: { limonene: 0.2 } }), true);
    assert.strictEqual(coa._isLabReport({ lab: null, terps: {} }), false);
    assert.strictEqual(coa._isLabReport(null), false);
  });

  await test('the stored address drops query, fragment and credentials; only https', async () => {
    const a = coa._sourceAddress;
    assert.strictEqual(a('https://b.example/x/y.pdf?X-Amz-Signature=abc&X-Amz-Credential=k#f'), 'https://b.example/x/y.pdf');
    assert.strictEqual(a('https://someone:secret@b.example/y.pdf'), 'https://b.example/y.pdf');
    assert.strictEqual(a('https://b.example:8443/y.pdf'), 'https://b.example:8443/y.pdf');
    assert.strictEqual(a('http://b.example/y.pdf'), null);
    assert.strictEqual(a('not a url'), null);
  });

  await test('EXTRACTOR_VERSION names the unpdf that package-lock.json installs', async () => {
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
    const v = lock.packages && lock.packages['node_modules/unpdf'] && lock.packages['node_modules/unpdf'].version;
    assert.strictEqual(coa._EXTRACTOR_VERSION, `unpdf@${v}`,
      'unpdf moved - update EXTRACTOR_VERSION in coa.js to match');
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
      const out = realParseCoa(fs.readFileSync(path.join(dir, f), 'utf8'));
      assert.ok(coa._isLabReport(out), `${f} would not be archived`);
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

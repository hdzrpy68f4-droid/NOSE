#!/usr/bin/env node
'use strict';
/* The pieces around the archive's storage path, offline - no network, no
 * database, no Netlify, no secrets.
 *
 *   node test/archive-scripts-test.js      expect: archive-scripts clean
 *
 * What it pins down:
 *   - lib/version.js: a missing or broken build-info.json reads as 'dev'; the
 *     stamps build.sh writes; the extractor stamp moves with extract-text.js
 *     and with the installed unpdf; uncommitted files are seen; pin() wins
 *   - lib/pdf-store.js, against a stand-in @netlify/blobs: the site-wide store
 *     "coa-pdf" and never a deploy store, connectLambda given the event,
 *     onlyIfNew, the exact bytes, and metadata { sourceUrl, fetchedAt } only
 *   - scripts/archive-health.js: the report it prints, and that its SQL never
 *     reads report text or addresses
 *   - scripts/seed-from-fixtures.js: refuses without its secrets, and refuses
 *     while the parser or extractor has uncommitted changes
 *   - scripts/check-published.js: a Netlify token fails the build
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify/functions/lib');

let passed = 0;
const failed = [];
async function test(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failed.push(`FAIL  ${name}\n      ${e && e.message}`); }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nose-archive-scripts-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const gitIn = (cwd, ...args) => sh('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid',
                                           '-c', 'commit.gpgsign=false', ...args], cwd);

/* A throwaway checkout with just the files the version helper looks at. */
function makeCheckout(name, { unpdf = '1.8.0', extractor = '// extractor v1\n' } = {}) {
  const root = path.join(TMP, name);
  fs.mkdirSync(path.join(root, 'netlify/functions/lib'), { recursive: true });
  fs.copyFileSync(path.join(LIB, 'version.js'), path.join(root, 'netlify/functions/lib/version.js'));
  fs.writeFileSync(path.join(root, 'netlify/functions/lib/extract-text.js'), extractor);
  fs.writeFileSync(path.join(root, 'netlify/functions/lib/parse-coa.js'), '// parser\n');
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\nnetlify/functions/lib/build-info.json\n');
  if (unpdf) {
    fs.mkdirSync(path.join(root, 'node_modules/unpdf'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules/unpdf/package.json'), JSON.stringify({ name: 'unpdf', version: unpdf }));
  }
  gitIn(root, 'init', '-q');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-q', '-m', 'fixture');
  return root;
}
/* A fresh copy of version.js from a checkout, so each load reads its own build-info.json. */
const loadVersion = root => {
  const file = path.join(root, 'netlify/functions/lib/version.js');
  delete require.cache[file];
  delete require.cache[path.join(root, 'netlify/functions/lib/build-info.json')];
  return require(file);
};

async function main() {
  /* --- lib/version.js ------------------------------------------------------- */

  const co = makeCheckout('checkout');
  const head = gitIn(co, 'rev-parse', '--short', 'HEAD').trim();
  const infoFile = path.join(co, 'netlify/functions/lib/build-info.json');

  await test('version: no build-info.json reads as dev in every field', async () => {
    assert.deepStrictEqual(loadVersion(co).buildInfo(), { parserVersion: 'dev', extractorVersion: 'dev', deployContext: 'dev' });
  });

  await test('version: build.sh\'s --write records the commit, the extractor and $CONTEXT', async () => {
    sh(process.execPath, ['netlify/functions/lib/version.js', '--write'], co);
    const dev = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
    assert.deepStrictEqual(Object.keys(dev).sort(), ['deployContext', 'extractorVersion', 'parserVersion']);
    assert.strictEqual(dev.parserVersion, head);
    assert.match(dev.extractorVersion, /^[0-9a-f]{12}$/);
    assert.strictEqual(dev.deployContext, 'dev', 'no CONTEXT should record dev');
    execFileSync(process.execPath, ['netlify/functions/lib/version.js', '--write'],
      { cwd: co, env: { ...process.env, CONTEXT: 'production' }, stdio: 'ignore' });
    assert.deepStrictEqual(loadVersion(co).buildInfo(), { ...dev, deployContext: 'production' });
    assert.strictEqual(gitIn(co, 'status', '--porcelain').trim(), '', 'build-info.json is not ignored');
  });

  await test('version: a broken or hostile build-info.json never becomes a stamp', async () => {
    fs.writeFileSync(infoFile, '{ not json');
    assert.deepStrictEqual(loadVersion(co).buildInfo(), { parserVersion: 'dev', extractorVersion: 'dev', deployContext: 'dev' });
    fs.writeFileSync(infoFile, JSON.stringify({ parserVersion: 'ab12cd3', extractorVersion: 'x'.repeat(200), deployContext: 'production; drop table' }));
    assert.deepStrictEqual(loadVersion(co).buildInfo(), { parserVersion: 'ab12cd3', extractorVersion: 'dev', deployContext: 'dev' });
    fs.writeFileSync(infoFile, '"production"');
    assert.strictEqual(loadVersion(co).buildInfo().deployContext, 'dev');
    fs.rmSync(infoFile);
  });

  await test('version: the extractor stamp moves with extract-text.js and with the installed unpdf', async () => {
    const v = loadVersion(co);
    const a = v.fromCheckout(co).extractorVersion;
    fs.writeFileSync(path.join(co, 'netlify/functions/lib/extract-text.js'), '// extractor v2\n');
    const b = v.fromCheckout(co).extractorVersion;
    fs.writeFileSync(path.join(co, 'node_modules/unpdf/package.json'), JSON.stringify({ version: '1.9.0' }));
    const c = v.fromCheckout(co).extractorVersion;
    assert.ok(a !== b && b !== c && a !== c, `${a} ${b} ${c}`);
    fs.rmSync(path.join(co, 'node_modules/unpdf'), { recursive: true });
    assert.strictEqual(v.fromCheckout(co).extractorVersion, 'dev', 'no unpdf installed must not produce a stamp');
    assert.strictEqual(v.fromCheckout(co).parserVersion, head);
  });

  await test('version: uncommitted() sees modified and untracked files, and only the ones asked about', async () => {
    const v = loadVersion(co);
    const files = ['netlify/functions/lib/parse-coa.js', 'netlify/functions/lib/extract-text.js'];
    assert.deepStrictEqual(v.uncommitted(files, co), ['netlify/functions/lib/extract-text.js']);   // modified above
    gitIn(co, 'checkout', '-q', '--', 'netlify/functions/lib/extract-text.js');
    assert.deepStrictEqual(v.uncommitted(files, co), []);
    fs.appendFileSync(path.join(co, 'netlify/functions/lib/parse-coa.js'), '// edit\n');
    assert.deepStrictEqual(v.uncommitted(files, co), ['netlify/functions/lib/parse-coa.js']);
    gitIn(co, 'add', 'netlify/functions/lib/parse-coa.js');
    assert.deepStrictEqual(v.uncommitted(files, co), ['netlify/functions/lib/parse-coa.js'], 'staged is still uncommitted');
    gitIn(co, 'commit', '-q', '-m', 'edit');
    fs.writeFileSync(path.join(co, 'other.txt'), 'x');
    assert.deepStrictEqual(v.uncommitted(files, co), []);
  });

  await test('version: pin() wins over build-info.json, and cleans what it is given', async () => {
    const v = loadVersion(co);
    v.pin({ parserVersion: 'abc1234', extractorVersion: '0123456789ab', deployContext: 'production' });
    assert.deepStrictEqual(v.buildInfo(), { parserVersion: 'abc1234', extractorVersion: '0123456789ab', deployContext: 'production' });
    v.pin({ parserVersion: 'has space' });
    assert.deepStrictEqual(v.buildInfo(), { parserVersion: 'dev', extractorVersion: 'dev', deployContext: 'dev' });
  });

  await test('version: the real build-info.json is gitignored, and none is committed', async () => {
    sh('git', ['check-ignore', '-q', 'netlify/functions/lib/build-info.json'], ROOT);
    assert.strictEqual(sh('git', ['ls-files', 'netlify/functions/lib/build-info.json', 'netlify/functions/lib/parser-version.js'], ROOT).trim(), '');
  });

  /* --- lib/pdf-store.js, against a stand-in @netlify/blobs ------------------- */

  const FAKE_BLOBS = path.join(TMP, 'fake-netlify-blobs.js');
  const blobCalls = [];
  const stored = new Map();
  let failWith = null;   // an HTTP status the stand-in answers every write with
  /* Answers as @netlify/blobs 10.x does: a conditional write gets
     { modified: false } on a 412 and { modified: true } on ANY other status,
     failures included - with an ETag only when the object was really stored. */
  const fakeStoreObject = name => ({
    name,
    async set(key, data, opts) {
      blobCalls.push({ fn: 'set', key, data, opts });
      if (opts && opts.onlyIfNew && stored.has(key)) return { modified: false };
      if (failWith) return { modified: true, etag: '' };
      stored.set(key, Buffer.from(data));
      return { modified: true, etag: '"e"' };
    },
    async list() { return { blobs: [...stored.keys()].map(key => ({ key, etag: '"e"' })), directories: [] }; },
    async get(key, opts) {
      if (!stored.has(key)) return null;
      assert.strictEqual(opts && opts.type, 'arrayBuffer');
      const b = stored.get(key);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    }
  });
  const fakeBlobs = {
    connectLambda: event => blobCalls.push({ fn: 'connectLambda', event }),
    getStore: arg => { blobCalls.push({ fn: 'getStore', arg }); return fakeStoreObject(typeof arg === 'string' ? arg : arg.name); },
    getDeployStore: arg => { blobCalls.push({ fn: 'getDeployStore', arg }); throw new Error('a deploy store was asked for'); }
  };
  const m = new Module(FAKE_BLOBS, module);
  m.filename = FAKE_BLOBS; m.loaded = true; m.exports = fakeBlobs;
  require.cache[FAKE_BLOBS] = m;
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    return request === '@netlify/blobs' ? FAKE_BLOBS : resolve.call(this, request, ...rest);
  };

  delete require.cache[path.join(LIB, 'pdf-store.js')];
  const pdfStore = require(path.join(LIB, 'pdf-store.js'));
  const sha = b => crypto.createHash('sha256').update(b).digest('hex');

  await test('pdf-store: the site-wide store "coa-pdf", never a deploy store', async () => {
    blobCalls.length = 0;
    pdfStore.open();
    pdfStore.open({ siteID: 'site-123', token: 'nfp_notarealtoken' });
    assert.deepStrictEqual(blobCalls.map(c => c.fn), ['getStore', 'getStore']);
    assert.strictEqual(blobCalls[0].arg, 'coa-pdf');
    assert.deepStrictEqual(blobCalls[1].arg, { name: 'coa-pdf', siteID: 'site-123', token: 'nfp_notarealtoken' });
    assert.throws(() => pdfStore.open({ siteID: 'site-123' }), /both a site ID and a token/);
    const src = fs.readFileSync(path.join(LIB, 'pdf-store.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/getDeployStore/.test(src), 'pdf-store.js calls getDeployStore');
  });

  await test('pdf-store: connect() hands the event to connectLambda, untouched', async () => {
    blobCalls.length = 0;
    const event = { blobs: 'e30=', headers: { 'x-nf-site-id': 's', 'x-nf-deploy-id': 'd' } };
    pdfStore.connect(event);
    assert.strictEqual(blobCalls.length, 1);
    assert.strictEqual(blobCalls[0].event, event);
  });

  await test('pdf-store: put() writes the exact bytes, only if new, with { sourceUrl, fetchedAt } only', async () => {
    blobCalls.length = 0;
    const store = pdfStore.open();
    /* A view into a larger buffer, as Node's pool hands out: only its own bytes may be stored. */
    const pool = Buffer.from('xxxx%PDF-1.4 a real-looking report yyyy');
    const bytes = pool.subarray(4, pool.length - 4);
    const key = sha(bytes);
    const first = await pdfStore.put(store, key, bytes, { sourceUrl: 'https://lab.example/r.pdf', fetchedAt: '2026-09-22', extra: 'dropped' });
    const again = await pdfStore.put(store, key, bytes, { sourceUrl: 'https://lab.example/r.pdf', fetchedAt: '2026-09-23' });
    assert.deepStrictEqual(first, { written: true });
    assert.deepStrictEqual(again, { written: false });
    const set = blobCalls.find(c => c.fn === 'set');
    assert.strictEqual(set.key, key);
    assert.ok(set.data instanceof ArrayBuffer, 'set() was not given an ArrayBuffer');
    assert.ok(Buffer.from(set.data).equals(bytes), 'the stored bytes differ from the file');
    assert.deepStrictEqual(set.opts, { metadata: { sourceUrl: 'https://lab.example/r.pdf', fetchedAt: '2026-09-22' }, onlyIfNew: true });
    assert.strictEqual(stored.get(key).length, bytes.length);
    await assert.rejects(pdfStore.put(store, 'not-a-sha', bytes, {}), /SHA-256/);
    await assert.rejects(pdfStore.put(store, key, Buffer.alloc(0), {}), /no bytes/);
  });

  await test('pdf-store: a write Blobs did not confirm is a failure, not a success', async () => {
    const store = pdfStore.open();
    const bytes = Buffer.from('%PDF-1.4 a report the store refused');
    for (const status of [401, 403, 503]) {
      failWith = status;
      await assert.rejects(pdfStore.put(store, sha(bytes), bytes, {}), /did not confirm the write/, String(status));
    }
    failWith = null;
    assert.ok(!stored.has(sha(bytes)));
    assert.deepStrictEqual(await pdfStore.put(store, sha(bytes), bytes, {}), { written: true });
  });

  await test('pdf-store: metadata keeps an https address that fits and a bare day, nothing else', async () => {
    const md = pdfStore.metadataFor;
    assert.deepStrictEqual(md({ sourceUrl: 'http://lab.example/r.pdf', fetchedAt: '2026-09-22T14:05:09.123Z' }), { sourceUrl: null, fetchedAt: null });
    assert.deepStrictEqual(md({ sourceUrl: `https://lab.example/${'a'.repeat(1100)}.pdf`, fetchedAt: '2026-13-01' }), { sourceUrl: null, fetchedAt: null });
    assert.deepStrictEqual(md({}), { sourceUrl: null, fetchedAt: null });
    assert.deepStrictEqual(md({ sourceUrl: 'https://lab.example/r.pdf', fetchedAt: '2026-09-22' }), { sourceUrl: 'https://lab.example/r.pdf', fetchedAt: '2026-09-22' });
  });

  await test('pdf-store: keys() lists every key; measure() downloads, counts and re-hashes', async () => {
    const store = pdfStore.open();
    const ks = await pdfStore.keys(store);
    assert.ok(ks.length >= 1);
    const m1 = await pdfStore.measure(store, ks[0]);
    assert.strictEqual(m1.sha256, ks[0]);
    assert.strictEqual(m1.bytes, stored.get(ks[0]).length);
    assert.strictEqual(await pdfStore.measure(store, 'f'.repeat(64)), null);
  });

  Module._resolveFilename = resolve;

  /* --- scripts/archive-health.js -------------------------------------------- */

  const health = require(path.join(ROOT, 'scripts/archive-health.js'));
  const A = 'a'.repeat(64), B = 'b'.repeat(64), C = 'c'.repeat(64);
  const db = {
    counts: { documents: 2, extractions: 2, parses: 3, db_bytes: '12000000', nose_bytes: '300000' },
    newest: { id: 7, day: '2026-09-23', context: 'production', usable: true, lab: 'Kaycha Labs', strain: 'Test',
              client: null, product_class: 'flower', total: '2.1', report_date: null, parser_version: 'abc1234',
              extractor_version: '0123456789ab', document_id: 2, terpenes: 12 },
    documents: [{ id: 1, sha256: A, byte_size: 1000000, day: '2026-09-23' }, { id: 2, sha256: B, byte_size: 500000, day: '2026-09-23' }]
  };

  await test('health: a healthy archive - counts, the newest parse, sizes from the rows, nothing to look at', async () => {
    const { lines, failed: bad } = health.report({ db, blobKeys: [A, B] });
    const out = lines.join('\n');
    assert.strictEqual(bad, false);
    assert.match(out, /documents\s+2\b/);
    assert.match(out, /parses\s+3\b/);
    assert.match(out, /12\.0 MB of the free plan's 500 MB \(2\.4%\)/);
    assert.match(out, /newest parse\s+#7\s+2026-09-23\s+production/);
    assert.match(out, /parser abc1234 \| extractor 0123456789ab/);
    assert.match(out, /files\s+2\b/);
    assert.match(out, /bytes\s+1\.5 MB/);
    assert.match(out, /PDFs with no document row\s+0/);
    assert.match(out, /documents with no PDF\s+0/);
    assert.strictEqual(lines.at(-1), 'archive-health: ok');
  });

  await test('health: a PDF with no row and a document with no PDF are both named, as notes', async () => {
    const measured = new Map([[C, { bytes: 250000, sha256: C }]]);
    const { lines, failed: bad } = health.report({ db, blobKeys: [A, C], measured });
    const out = lines.join('\n');
    assert.strictEqual(bad, false);
    assert.match(out, /PDFs with no document row\s+1\n\s+cccccccccccc\.\.\./);
    assert.match(out, /documents with no PDF\s+1\n\s+document #2\s+first fetched 2026-09-23\s+bbbbbbbbbbbb\.\.\./);
    assert.match(out, /bytes\s+1\.3 MB/);
    assert.strictEqual(lines.at(-1), 'archive-health: ok, 2 note(s)');
  });

  await test('health: a stored PDF that does not match its key fails, and so does an unreachable half', async () => {
    const bad = health.report({ db, blobKeys: [A, B], measured: new Map([[A, { bytes: 1000000, sha256: C }]]), verify: true });
    assert.strictEqual(bad.failed, true);
    assert.match(bad.lines.join('\n'), /does not match its key/);
    assert.strictEqual(health.report({ dbError: 'could not read the database: x', blobKeys: [A] }).failed, true);
    assert.strictEqual(health.report({ db, blobError: 'Netlify refused the token' }).failed, true);
  });

  await test('health: its SQL reads no report text, no addresses, no whole outputs', async () => {
    const sql = [health.COUNTS_SQL, health.NEWEST_SQL, health.DOCUMENTS_SQL].join('\n');
    assert.ok(!/first_source_url/.test(sql), 'reads the source address');
    assert.ok(!/\b(e|x)\.text\b|\bselect\s+text\b|,\s*text\b/i.test(sql), 'reads the extracted text');
    assert.ok(!/output\s*(,|from)/i.test(sql), 'reads a whole output');
    assert.ok(!/\b(update|insert|delete|truncate)\b/i.test(sql), 'writes');
  });

  /* --- scripts/seed-from-fixtures.js ---------------------------------------- */

  const seed = require(path.join(ROOT, 'scripts/seed-from-fixtures.js'));
  const SECRETS = { NOSE_DB_URL: 'x', NETLIFY_SITE_ID: 'y', NETLIFY_AUTH_TOKEN: 'z' };

  await test('seed: refuses without its three secrets, naming them and never their values', async () => {
    const { refusal } = seed.stampsOrRefusal({ root: co, env: { NOSE_DB_URL: 'postgresql://secret-value' } });
    assert.match(refusal, /NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN are not set/);
    assert.ok(!/secret-value/.test(refusal));
  });

  await test('seed: refuses while parse-coa.js or extract-text.js has uncommitted changes', async () => {
    const s = makeCheckout('seed-checkout');
    const sHead = gitIn(s, 'rev-parse', '--short', 'HEAD').trim();
    assert.deepStrictEqual(seed.STAMPED_FILES, ['netlify/functions/lib/parse-coa.js', 'netlify/functions/lib/extract-text.js']);
    for (const f of seed.STAMPED_FILES) {
      fs.appendFileSync(path.join(s, f), '// uncommitted\n');
      const { refusal } = seed.stampsOrRefusal({ root: s, env: SECRETS });
      assert.match(refusal || '', /uncommitted changes in .*commit them first/, f);
      gitIn(s, 'checkout', '-q', '--', f);
    }
    const ok = seed.stampsOrRefusal({ root: s, env: SECRETS });
    assert.ok(ok.stamps, ok.refusal);
    assert.strictEqual(ok.stamps.parserVersion, sHead);
    assert.match(ok.stamps.extractorVersion, /^[0-9a-f]{12}$/);
    fs.rmSync(path.join(s, 'node_modules/unpdf'), { recursive: true });
    assert.match(seed.stampsOrRefusal({ root: s, env: SECRETS }).refusal, /unpdf is not installed/);
  });

  /* --- scripts/check-published.js ------------------------------------------- */

  await test('check-published: a Netlify token in a published file fails the build', async () => {
    const leak = path.join(TMP, 'leak.html');
    fs.writeFileSync(leak, `<p>token nfp_${'A1b2C3d4'.repeat(5)}</p>`);
    let failedRun = false, out = '';
    try { sh(process.execPath, ['scripts/check-published.js', leak], ROOT); }
    catch (e) { failedRun = true; out = String(e.stdout); }
    assert.ok(failedRun, 'the build passed with a Netlify token in it');
    assert.match(out, /a Netlify access token/);
    const clean = path.join(TMP, 'clean.html');
    fs.writeFileSync(clean, '<p>nothing secret here</p>');
    sh(process.execPath, ['scripts/check-published.js', clean], ROOT);
  });

  for (const f of failed) console.error(f);
  if (failed.length) {
    console.error(`\narchive-scripts: ${failed.length} failure${failed.length === 1 ? '' : 's'} (${passed} passed)`);
    process.exit(1);
  }
  console.log(`archive-scripts: ${passed} checks\narchive-scripts clean`);
}

main().catch(e => { console.error('archive-scripts threw:', e && e.stack); process.exit(1); });

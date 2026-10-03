'use strict';
/* NOSE - scripts/remove-copies.js, the admin cleanup, against real Postgres
 * semantics, offline.
 *
 *   node test/remove-copies-test.js      -> "remove-copies clean", or FAIL lines and exit 1
 *
 * The archive is built as the real one was: documents saved by the old
 * save_scan, which kept one per download, then the 2026-10-02 migration.
 * Among them: a Method report scanned three times, a fixture scanned again,
 * a copy whose report has no PDF, a copy a reparse run names, a document
 * that shares one text with an earlier one but holds a text of its own, and
 * an amended report under the same lab ID. Then the dry run, a Blobs
 * failure, the real run and a second run - checking each time what is
 * removed, what is kept and why, that no report and no text is lost, and
 * that nose_writer is refused.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const store = require(path.join(ROOT, 'netlify/functions/lib/store.js'));
const { removeCopies } = require(path.join(ROOT, 'scripts/remove-copies.js'));
const { duplicates } = require(path.join(ROOT, 'scripts/duplicates.js'));

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const SECRET_TEXT = 'PRIVATE-REPORT-TEXT-MARKER';
const ADDRESS = 'https://example.org/coa/secret-report.pdf';

/* Netlify Blobs as @netlify/blobs 10.x answers list() and delete(). */
function standInBlobs(keys) {
  const objects = new Set(keys);
  const deleted = [];
  let failFor = null;
  return {
    objects, deleted,
    failOn(key) { failFor = key; },
    async list() { return { blobs: [...objects].map(key => ({ key, etag: '"e"' })), directories: [] }; },
    async delete(key) {
      if (key === failFor) throw new Error('Netlify Blobs has generated an internal error (503 status code)');
      deleted.push(key);
      objects.delete(key);
    }
  };
}

async function run(db, log = console.log) {
  let failures = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
  };
  const rows = async (sql, params) => (await db.query(sql, params)).rows;
  const rejects = async fn => { try { await fn(); return null; } catch (e) { return e; } };

  const dir = path.join(ROOT, 'supabase/migrations');
  const ONE_PER_TEXT = '20261002180000_nose_one_document_per_text.sql';
  const migrations = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of migrations.filter(f => f < ONE_PER_TEXT)) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));

  const reading = (lab, strain, labId, extra = {}) => ({
    lab, strain, labId, productClass: 'flower', readBy: 'forward', usable: true, totalTerpenes: 1.5,
    terps: { limonene: 0.7 }, warnings: [], rejectReasons: [], novelty: [], ...extra
  });
  const save = (name, output, { day, context = 'production', text }) => store.saveScan({
    sha256: sha(name), byteSize: 1000, sourceUrl: context === 'production' ? ADDRESS : null,
    fetchedAt: `${day}T12:00:00Z`, extractorVersion: 'x1', text: `${text} ${SECRET_TEXT}`,
    parserVersion: 'abc1234', context, output
  }, { client: db });

  /* Under the old save_scan: one document per download. */
  const M = reading('Method Testing Labs', 'Banana Cough', '2609CBR0139-007');
  await save('mtl-1', M, { day: '2026-10-02', text: 'method report' });
  await save('mtl-2', M, { day: '2026-10-02', text: 'method report' });
  await save('mtl-3', M, { day: '2026-10-02', text: 'method report' });
  await save('fixture', reading('Modern Canna', null, 'IK06001-01'), { day: '2026-09-22', context: 'seed', text: 'modern canna report' });
  await save('fixture-scan', reading('Modern Canna', null, 'IK06001-01'), { day: '2026-09-26', text: 'modern canna report' });
  await save('no-pdf', reading('Kaycha Labs', 'Early', 'MI1'), { day: '2026-09-22', text: 'early kaycha report' });
  await save('no-pdf-copy', reading('Kaycha Labs', 'Early', 'MI1'), { day: '2026-09-30', text: 'early kaycha report' });
  await save('named', reading('ACS Laboratory', 'Named', null), { day: '2026-09-23', text: 'acs report' });
  await save('named-copy', reading('ACS Laboratory', 'Named', null), { day: '2026-09-24', text: 'acs report' });
  await save('own-text', reading('TerpLife Labs', 'Own', null), { day: '2026-09-23', text: 'terplife report' });
  await save('own-text-copy', reading('TerpLife Labs', 'Own', null), { day: '2026-09-24', text: 'terplife report' });
  await save('own-text-copy', reading('TerpLife Labs', 'Own', null), { day: '2026-09-24', context: 'reparse', text: 'terplife report, extracted again' });
  await save('amended', reading('Method Testing Labs', 'Banana Cough', '2609CBR0139-007', { totalTerpenes: 2 }), { day: '2026-10-01', text: 'method report, amended' });
  for (const f of migrations.filter(f => f >= ONE_PER_TEXT)) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));

  const id = async n => (await rows('select id::text as id from nose.documents where sha256 = $1', [sha(n)]))[0]?.id || null;
  const ids = {};
  for (const n of ['mtl-1', 'mtl-2', 'mtl-3', 'fixture', 'fixture-scan', 'no-pdf', 'no-pdf-copy', 'named', 'named-copy', 'own-text', 'own-text-copy', 'amended']) ids[n] = await id(n);
  /* A reparse run that walked the archive as far as named-copy. */
  await db.query(`insert into nose.reparse_runs (mode, parser_version, documents, last_document_id, unchanged, values_changed,
                    accepted_to_rejected, rejected_to_accepted, failed) values ('reparse', 'abc1234', 1, $1, 1, 0, 0, 0, 0)`, [ids['named-copy']]);

  const allBlobs = ['mtl-1', 'mtl-2', 'mtl-3', 'fixture', 'fixture-scan', 'no-pdf-copy', 'named', 'named-copy', 'own-text', 'own-text-copy', 'amended'].map(sha);
  const counts = async () => (await rows(`select (select count(*) from nose.documents)::int as d, (select count(*) from nose.extractions)::int as e,
                                                 (select count(*) from nose.parses)::int as p`))[0];
  const texts = async () => (await rows('select distinct text_sha256 from nose.extractions order by 1')).map(r => r.text_sha256);
  const before = await counts();
  const textsBefore = await texts();
  const runOnce = async (blobs, apply) => { const lines = []; const res = await removeCopies({ db, blobs, apply, log: l => lines.push(l) }); return { lines, res, text: lines.join('\n') }; };
  const lineFor = (lines, n) => lines.find(l => l.includes(`document #${ids[n]} `));
  const reasonAfter = (lines, n) => lines[lines.indexOf(lineFor(lines, n)) + 1].trim();

  /* --- the dry run ---------------------------------------------------------- */
  const blobs = standInBlobs(allBlobs);
  const dry = await runOnce(blobs, false);
  check('dry run: six copies - the ones duplicates.js counts - three removable, three kept', [dry.res.candidates, dry.res.removed, dry.res.kept, dry.res.failed], [6, 3, 3, 0]);
  check('...the two later Method downloads and the fixture scanned again would go, each a copy of its first document',
    ['mtl-2', 'mtl-3', 'fixture-scan'].map(n => (lineFor(dry.lines, n) || '').replace(/\s+/g, ' ').replace(/ \d{4}-\d\d-\d\d [0-9a-f]{8} /, ' ')),
    [`would remove document #${ids['mtl-2']} Method Testing Labs | Banana Cough | lab ID 2609CBR0139-007 - a copy of document #${ids['mtl-1']}`,
     `would remove document #${ids['mtl-3']} Method Testing Labs | Banana Cough | lab ID 2609CBR0139-007 - a copy of document #${ids['mtl-1']}`,
     `would remove document #${ids['fixture-scan']} Modern Canna | (no strain) | lab ID IK06001-01 - a copy of document #${ids.fixture}`]);
  check('...and says what each holds', reasonAfter(dry.lines, 'mtl-2'), '1 extraction, 1 parse, its PDF');
  check('...a copy whose report has no PDF is kept: its PDF is the only file of that report',
    [/^keep /.test(lineFor(dry.lines, 'no-pdf-copy')), reasonAfter(dry.lines, 'no-pdf-copy')],
    [true, 'its report has no PDF in Blobs, so this copy\'s PDF is the only file of it']);
  check('...a copy a reparse run names is kept: that record is append-only',
    [/^keep /.test(lineFor(dry.lines, 'named-copy')), reasonAfter(dry.lines, 'named-copy')],
    [true, 'a reparse run names it as the last document it walked, and that record is append-only']);
  check('...a copy that also holds a text of its own is kept: removing it would lose that text',
    [/^keep /.test(lineFor(dry.lines, 'own-text-copy')), reasonAfter(dry.lines, 'own-text-copy')],
    [true, 'it also holds a text no earlier document holds (it was extracted again), and removing it would lose that text']);
  check('...never a report, nor an amended report',
    ['mtl-1', 'fixture', 'no-pdf', 'named', 'own-text', 'amended'].filter(n => lineFor(dry.lines, n)), []);
  check('...changes nothing, here or in Blobs', [await counts(), blobs.deleted, dry.lines.includes('dry run - nothing was changed; --apply removes it')],
    [before, [], true]);
  check('...and prints no text, no address, no full fingerprint',
    [dry.text.includes(SECRET_TEXT), dry.text.includes('example.org'), Object.keys(ids).some(n => dry.text.includes(sha(n)))], [false, false, false]);

  /* --- Blobs fails on one: its rows are not touched ------------------------- */
  blobs.failOn(sha('mtl-3'));
  const half = await runOnce(blobs, true);
  check('apply, Blobs failing on one: the other two removed, that one failed and untouched',
    [half.res.removed, half.res.failed, await id('mtl-2'), await id('mtl-3'), await id('fixture-scan')], [2, 1, null, ids['mtl-3'], null]);
  check('...and it says nothing in the database was touched',
    reasonAfter(half.lines, 'mtl-3'), 'its PDF could not be deleted (Netlify Blobs has generated an internal error (503 status code)) - nothing in the database was touched');
  check('...each removed copy loses its PDF too', [blobs.objects.has(sha('mtl-2')), blobs.objects.has(sha('fixture-scan'))], [false, false]);

  /* --- run again ------------------------------------------------------------ */
  blobs.failOn(null);
  const again = await runOnce(blobs, true);
  check('a second run finishes it: the third download removed, the three kept still kept', [again.res.removed, again.res.kept, await id('mtl-3')], [1, 3, null]);
  const after = await counts();
  check('three documents, three extractions, three parses fewer', [before.d - after.d, before.e - after.e, before.p - after.p], [3, 3, 3]);
  check('every text the archive held is still held', await texts(), textsBefore);
  check('the reports and their PDFs are untouched',
    [await id('mtl-1'), await id('fixture'), blobs.objects.has(sha('mtl-1')), blobs.objects.has(sha('fixture'))], [ids['mtl-1'], ids.fixture, true, true]);
  check('only the copies\' PDFs were deleted', blobs.deleted.sort(), [sha('mtl-2'), sha('mtl-3'), sha('fixture-scan')].sort());
  const third = await runOnce(blobs, true);
  check('a third run finds only the three it keeps', [third.res.candidates, third.res.removed, third.res.kept], [3, 0, 3]);

  const dups = [];
  await duplicates({ db, log: l => dups.push(l) });
  check('duplicates.js then counts exactly the three kept', dups[dups.length - 1], 'duplicates already stored: 3 documents');
  check('the analysis views still read: the Method sample, its amended report and the first download',
    (await rows(`select copies from nose.batch_series where strain_key = 'banana cough'`)).map(r => r.copies), [2]);
  const writer = await rows('select count(*)::int as n from nose.reparse_runs where last_document_id = $1', [ids['named-copy']]);
  check('the reparse run\'s record is intact', writer[0].n, 1);

  /* --- refusals ------------------------------------------------------------- */
  await db.exec('set role nose_writer');
  let asWriter;
  try { asWriter = await rejects(() => removeCopies({ db, blobs, apply: true, log: () => {} })); }
  finally { await db.exec('reset role'); }
  check('as nose_writer it refuses before reading anything', !!asWriter && /connected as nose_writer, which can only read and insert/.test(asWriter.message), true);

  const bare = { PATH: process.env.PATH, HOME: process.env.HOME || os.tmpdir() };
  const cli = args => spawnSync(process.execPath, [path.join(ROOT, 'scripts/remove-copies.js'), ...args], { env: bare, encoding: 'utf8', timeout: 20000 });
  const noSecrets = cli(['--apply']);
  check('with no secrets it refuses', noSecrets.status === 1 && /^REFUSED: NOSE_DB_ADMIN_URL, NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN are not set/.test(noSecrets.stderr), true);
  const unknown = cli(['--force']);
  check('an unknown option prints its usage', unknown.status === 2 && /usage: node scripts\/remove-copies\.js/.test(unknown.stderr), true);

  /* probe-db.js names DELETE only to prove nose_writer is refused it. Since
     2026-10-02 scripts/remove-document.js deletes too: a report taken out on
     request (test/remove-document-test.js). */
  check('the only code that deletes from the archive is this script and remove-document.js (and the probe, proving the writer cannot)',
    ['netlify', 'scripts'].flatMap(d => fs.readdirSync(path.join(ROOT, d), { recursive: true }).map(f => path.join(d, String(f))))
      .filter(f => /\.(js|mjs)$/.test(f))
      .filter(f => /delete\s+from\s+nose\./i.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))).sort(),
    ['scripts/probe-db.js', 'scripts/remove-copies.js', 'scripts/remove-document.js']);
  check('...and in the probe only inside expectDenied',
    fs.readFileSync(path.join(ROOT, 'scripts/probe-db.js'), 'utf8').split('\n').filter(l => /delete\s+from\s+nose\./i.test(l)).every(l => /expectDenied\(/.test(l)), true);
  check('pdf-store.remove is called by this script and remove-document.js alone',
    ['netlify', 'scripts'].flatMap(d => fs.readdirSync(path.join(ROOT, d), { recursive: true }).map(f => path.join(d, String(f))))
      .filter(f => /\.(js|mjs)$/.test(f) && f !== 'netlify/functions/lib/pdf-store.js')
      .filter(f => /pdfStore\.remove\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))).sort(),
    ['scripts/remove-copies.js', 'scripts/remove-document.js']);
  return failures;
}

async function main() {
  let PGlite;
  try { ({ PGlite } = await import('@electric-sql/pglite')); }
  catch {
    console.error('FAIL: @electric-sql/pglite is not installed - run: npm install');
    process.exit(1);
  }
  const pg = new PGlite();
  const db = { exec: sql => pg.exec(sql), query: (sql, params) => pg.query(sql, params) };
  let failures;
  try { failures = await run(db); }
  catch (e) { console.error('remove-copies-test threw:', e && e.stack); await pg.close(); process.exit(1); }
  await pg.close();
  if (failures) {
    console.error(`\nremove-copies-test: ${failures} failure${failures === 1 ? '' : 's'}`);
    process.exit(1);
  }
  console.log('\nremove-copies clean');
}

module.exports = { run };
if (require.main === module) main();

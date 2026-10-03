'use strict';
/* NOSE - scripts/remove-document.js and scripts/keep-rule.js, against real
 * Postgres semantics, offline.
 *
 *   node test/remove-document-test.js      -> "remove-document clean", or FAIL lines and exit 1
 *
 * The archive is built as the real one could be on 2026-10-02: two seeded
 * fixtures; live scans of a report, of a receipt that only names a lab and
 * of a letter that only mentions a certificate of analysis (both kept under
 * the old one-sign rule); a Method report kept twice under other bytes by
 * the old save_scan; a document a reparse run names; a document from before
 * PDFs were kept; and two PDFs in Blobs with no row. Then keep-rule.js, which
 * must find the receipt and the letter and nothing else, and remove-document.js
 * on each kind - dry runs that change nothing, real runs, a Blobs failure
 * finished by a second run, a database refusal that changes nothing - with
 * save_scan refusing every removed file, and its text under other bytes,
 * afterwards. Nothing printed may hold report text, an address, a strain, a
 * client or a full fingerprint.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const store = require(path.join(ROOT, 'netlify/functions/lib/store.js'));
const rerun = require(path.join(ROOT, 'scripts/lib/rerun.js'));
const { removeDocument, parseArgs, UsageError, Refusal } = require(path.join(ROOT, 'scripts/remove-document.js'));
const { keepRule } = require(path.join(ROOT, 'scripts/keep-rule.js'));

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const SECRET_TEXT = 'PRIVATE-REPORT-TEXT-MARKER';
const ADDRESS = 'https://example.org/coa/secret-report.pdf';
const PRIVATE = [SECRET_TEXT, 'example.org', 'Jane Example', 'Sunset Sherbet', 'Secret Strain', 'Secret Client'];

/* Netlify Blobs as @netlify/blobs 10.x answers list(), getWithMetadata() and delete(). */
function standInBlobs() {
  const objects = new Map();
  const deleted = [];
  let failFor = null;
  return {
    objects, deleted,
    failOn(key) { failFor = key; },
    put(key, data, metadata = {}) { objects.set(key, { data: Buffer.from(data), metadata }); },
    async list() { return { blobs: [...objects.keys()].map(key => ({ key, etag: '"e"' })), directories: [] }; },
    async getWithMetadata(key, opts) {
      if (!opts || opts.type !== 'arrayBuffer') throw new Error('stand-in: only arrayBuffer is asked for');
      const o = objects.get(key);
      if (!o) return null;
      return { data: o.data.buffer.slice(o.data.byteOffset, o.data.byteOffset + o.data.length), etag: '"e"', metadata: o.metadata };
    },
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
  const count = async sql => (await rows(sql))[0].n;
  const rejects = async fn => { try { await fn(); return null; } catch (e) { return e; } };
  const printed = [];
  const capture = () => { const lines = []; return { lines, log: l => { lines.push(l); printed.push(l); } }; };
  const today = new Date().toISOString().slice(0, 10);

  const dir = path.join(ROOT, 'supabase/migrations');
  const ONE_PER_TEXT = '20261002180000_nose_one_document_per_text.sql';
  const migrations = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of migrations.filter(f => f < ONE_PER_TEXT)) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));

  /* --- the archive, as it could stand ------------------------------------- */
  const blobs = standInBlobs();
  const bytesOf = name => Buffer.from(`%PDF-1.4 stand-in ${name}`);
  const texts = {};
  const report = (lab, extra = {}) => ({ lab, strain: 'Secret Strain', client: 'Secret Client', productClass: 'flower', readBy: 'forward',
    usable: true, totalTerpenes: 1.5, terpenesTested: true, terps: { limonene: 0.7, myrcene: 0.4 }, warnings: [], rejectReasons: [], novelty: [], ...extra });
  const notReport = extra => ({ lab: null, strain: 'Sunset Sherbet', client: 'Jane Example', usable: false, totalTerpenes: null,
    terpenesTested: null, terps: {}, warnings: [], rejectReasons: ['no terpene panel'], novelty: [], ...extra });
  const save = async (name, output, { day, context = 'production', text, pdf = true }) => {
    texts[name] = `${text}\n${SECRET_TEXT}`;
    const bytes = bytesOf(name);
    await store.saveScan({ sha256: sha(bytes), byteSize: bytes.length, sourceUrl: context === 'production' ? ADDRESS : null,
                           fetchedAt: `${day}T12:00:00Z`, extractorVersion: 'x1', text: texts[name], parserVersion: 'abc1234',
                           context, output }, { client: db });
    if (pdf) blobs.put(sha(bytes), bytes, { sourceUrl: null, fetchedAt: day });
    return sha(bytes);
  };
  const S = {};
  S.fixture1 = await save('fixture-1', report('Modern Canna'), { day: '2026-09-22', context: 'seed', text: 'MODERN CANNA Certificate of Analysis one' });
  S.fixture2 = await save('fixture-2', report('ACS Laboratory'), { day: '2026-09-22', context: 'seed', text: 'ACS LABORATORY two' });
  S.noPdf = await save('no-pdf', report('Method Testing Labs'), { day: '2026-09-22', text: 'METHOD Certificate of Analysis kept before PDFs', pdf: false });
  S.named = await save('named', report('Kaycha Labs'), { day: '2026-09-23', text: 'KAYCHA Certificate of Analysis walked last' });
  S.report = await save('report-a', report('Kaycha Labs'), { day: '2026-09-25', text: 'KAYCHA Certificate of Analysis report a' });
  S.receipt = await save('receipt', notReport({ lab: 'Kaycha Labs' }), { day: '2026-09-29', text: 'GREEN LEAF DISPENSARY Customer: Jane Example Tested by Kaycha Labs' });
  S.letter = await save('letter', notReport(), { day: '2026-10-01', text: 'Dear Jane, the certificate of analysis you asked for' });
  /* Under the old save_scan: one Method report, two downloads, two documents. */
  S.method1 = await save('method-1', report('Method Testing Labs', { labId: 'M-1' }), { day: '2026-09-30', text: 'METHOD Certificate of Analysis built on download' });
  S.method2 = await save('method-2', report('Method Testing Labs', { labId: 'M-1' }), { day: '2026-09-30', text: 'METHOD Certificate of Analysis built on download' });
  for (const f of migrations.filter(f => f >= ONE_PER_TEXT)) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));

  const idOf = async key => ((await rows('select id::text as id from nose.documents where sha256 = $1', [key]))[0] || {}).id || null;
  const ids = {};
  for (const [k, v] of Object.entries(S)) ids[k] = await idOf(v);
  await db.query(`insert into nose.reparse_runs (mode, parser_version, documents, last_document_id, unchanged, values_changed,
                    accepted_to_rejected, rejected_to_accepted, failed) values ('reparse', 'abc1234', 1, $1, 1, 0, 0, 0, 0)`, [ids.named]);

  /* Two PDFs with no row, as a scan made while the database was down leaves
     them: another receipt, and the Method report under a third set of bytes. */
  const orphanTexts = {
    'orphan-receipt': `ANOTHER RECEIPT Tested by ACS Laboratory\n${SECRET_TEXT}`,
    'orphan-of-method': texts['method-1'],
    'orphan-unreadable': null
  };
  for (const n of Object.keys(orphanTexts)) blobs.put(sha(bytesOf(n)), bytesOf(n), { sourceUrl: null, fetchedAt: '2026-10-01' });
  const O = { receipt: sha(bytesOf('orphan-receipt')), method: sha(bytesOf('orphan-of-method')), unreadable: sha(bytesOf('orphan-unreadable')) };
  const extract = async bytes => {
    const n = /stand-in (\S+)/.exec(Buffer.from(bytes).toString())[1];
    if (orphanTexts[n] === null) throw new Error('stand-in extractor: no text layer');
    return { text: orphanTexts[n] ?? texts[n], pages: 1 };
  };

  const counts = async () => (await rows(`select (select count(*) from nose.documents)::int as d, (select count(*) from nose.extractions)::int as e,
                                                 (select count(*) from nose.parses)::int as p, (select count(*) from nose.removals)::int as r,
                                                 (select count(*) from nose.withheld)::int as w`))[0];
  const held = async () => (await rows(`select kind, sha256, removal_id::text as removal from nose.withheld order by removal_id, kind, sha256`));
  const live = (key, text) => store.saveScan({ sha256: key, byteSize: 1, sourceUrl: null, fetchedAt: null, extractorVersion: 'x1', text,
                                               parserVersion: 'abc1234', context: 'production', output: report('Kaycha Labs') }, { client: db });
  const remove = async (fingerprint, opts = {}) => {
    const c = capture();
    const res = await removeDocument({ db, blobs, fingerprint, extract, log: c.log, ...opts });
    return { res, lines: c.lines, text: c.lines.join('\n') };
  };

  /* --- keep-rule.js: the probe ------------------------------------------- */
  const k1 = capture();
  const kr = await keepRule({ db, log: k1.log });
  const kt = k1.lines.join('\n');
  check('keep-rule: new documents per UTC day, by how each arrived',
    ['2026-09-22', '2026-09-23', '2026-09-25', '2026-09-29', '2026-09-30', '2026-10-01']
      .map(d => (k1.lines.find(l => l.trim().startsWith(d)) || '').trim().split(/\s+/).join(' ')),
    ['2026-09-22 1 2 0 3', '2026-09-23 1 0 0 1', '2026-09-25 1 0 0 1', '2026-09-29 1 0 0 1', '2026-09-30 2 0 0 2', '2026-10-01 1 0 0 1']);
  check('...the live scans in one line: how many, the busiest day, the median',
    k1.lines.some(l => l.trim() === 'live scans: 7 new documents over 6 days with any; busiest 2026-09-30 with 2; median 1 on a day with any'), true);
  check('...today against the daily cap', k1.lines.some(l => l.trim() === `today (${today}, UTC): 0 new documents of the 100 a day the cap allows from live scans`), true);
  check('...nothing withheld yet', k1.lines.some(l => l.trim() === 'withheld - taken out by hand, never kept again: 0 file fingerprints, 0 text fingerprints'), true);
  check('...the signs on each latest reading',
    ['lab + phrase + panel', 'lab + panel', 'lab', 'phrase'].map(k => (k1.lines.find(l => l.trim().endsWith(`  ${k}`)) || '').trim()),
    ['6  lab + phrase + panel', '1  lab + panel', '1  lab', '1  phrase']);
  check('...below the rule: the receipt and the letter, nothing else', [kr.below, kt.includes('below the rule: 2')], [2, true]);
  check('...each with the day, how it arrived, its lab and its signs',
    [k1.lines.some(l => l.trim() === `${S.receipt.slice(0, 8)}  first fetched 2026-09-29  arrived as production  Kaycha Labs  signs: lab`),
     k1.lines.some(l => l.trim() === `${S.letter.slice(0, 8)}  first fetched 2026-10-01  arrived as production  (no lab)  signs: phrase`)], [true, true]);
  check('...and the command that takes it out',
    k1.lines.some(l => l.trim() === `node scripts/remove-document.js ${S.receipt.slice(0, 8)} --reason notreport`), true);

  /* --- refusals before anything is touched --------------------------------- */
  const before = await counts();
  await db.exec('set role nose_writer');
  let asWriter;
  try { asWriter = await rejects(() => remove(S.receipt.slice(0, 8), { reason: 'notreport', yes: true })); }
  finally { await db.exec('reset role'); }
  check('as nose_writer it refuses before reading anything', !!asWriter && asWriter instanceof Refusal && /connected as nose_writer/.test(asWriter.message), true);
  const noMigration = { query: (sql, p) => (/to_regclass\('nose\.withheld'\)/.test(sql) ? Promise.resolve({ rows: [{ ok: false }] }) : db.query(sql, p)) };
  const unpushed = await rejects(() => removeDocument({ db: noMigration, blobs, fingerprint: S.receipt.slice(0, 8), reason: 'notreport', log: () => {} }));
  check('before the migration it says to push it', !!unpushed && /push the migration first/.test(unpushed.message), true);
  const nothing = await rejects(() => remove('0123456789abcdef', { reason: 'request' }));
  check('a fingerprint nothing begins with is refused', !!nothing && /no document, text, PDF or withheld fingerprint begins with 0123456789abcdef/.test(nothing.message), true);
  await db.exec(`insert into nose.documents (sha256, byte_size, first_fetched_on)
                 values ('abcdef01${'1'.repeat(56)}', 1, '2026-09-30'), ('abcdef01${'2'.repeat(56)}', 1, '2026-09-30')`);
  const twice = await rejects(() => remove('abcdef01', { reason: 'request' }));
  check('a prefix two fingerprints begin with is refused', !!twice && twice instanceof Refusal && /begins more than one fingerprint/.test(twice.message), true);
  await db.exec(`delete from nose.documents where sha256 like 'abcdef01%'`);
  const noReason = await rejects(() => remove(S.receipt.slice(0, 8)));
  check('a new removal needs its reason', !!noReason && noReason instanceof UsageError && /say why it goes/.test(noReason.message), true);
  check('parseArgs: the fixed reasons only, 8 to 64 hex characters, one fingerprint',
    ['x --reason maybe', 'abc', 'zzzzzzzz', `${S.receipt.slice(0, 8)} ${S.letter.slice(0, 8)}`, '--force']
      .map(a => { try { parseArgs(a.split(' ')); return 'accepted'; } catch (e) { return e instanceof UsageError ? 'usage' : e.message; } }),
    ['usage', 'usage', 'usage', 'usage', 'usage']);
  check('...and reads a good line', parseArgs([S.receipt.slice(0, 10).toUpperCase(), '--reason', 'personal', '--yes']),
    { fingerprint: S.receipt.slice(0, 10), reason: 'personal', yes: true });
  check('none of that changed anything', [await counts(), blobs.deleted], [before, []]);

  /* --- the receipt: dry run, then for real ---------------------------------- */
  const dry = await remove(S.receipt.slice(0, 8), { reason: 'notreport' });
  check('dry run: the receipt, its rows and its PDF, by its short fingerprint',
    dry.lines.filter(l => /^(document|would|dry run)|^ {10}\d/.test(l)),
    [`document #${ids.receipt}  first fetched 2026-09-29  ${S.receipt.slice(0, 8)}  Kaycha Labs  refused by the parser`,
     '          1 extraction, 1 parse, its PDF',
     `would record: a removal on ${today} (UTC), reason notreport`,
     'would withhold: 1 file fingerprint and 1 text fingerprint - the same file, or any file with the same text, is not kept again',
     'would delete: 1 document (1 extraction, 1 parse) and 1 PDF',
     'dry run - nothing was changed; --yes removes it']);
  check('...and changes nothing, here or in Blobs', [await counts(), blobs.deleted], [before, []]);

  const real = await remove(S.receipt.slice(0, 8), { reason: 'notreport', yes: true });
  const removal = (await rows('select id::text as id, removed_on::text as day, reason from nose.removals order by id desc limit 1'))[0];
  check('--yes: the receipt\'s document, extraction and parse are gone, and its PDF',
    [await idOf(S.receipt), (await counts()).d, blobs.objects.has(S.receipt), real.res.failed], [null, before.d - 1, false, 0]);
  check('...one removal recorded: the UTC day and the word, nothing else',
    [removal.day === (await rows(`select ((now() at time zone 'UTC')::date)::text as d`))[0].d, removal.reason], [true, 'notreport']);
  check('...its file and its text withheld, under that removal',
    (await held()).map(h => [h.kind, h.sha256, h.removal]), [['file', S.receipt, removal.id], ['text', rerun.textSha(texts.receipt), removal.id]]);
  check('...and it says so', [real.lines.includes(`removal #${removal.id} recorded: ${removal.day}, notreport`),
                              real.lines.includes(`deleted PDF ${S.receipt.slice(0, 8)}`),
                              real.lines[real.lines.length - 1]], [true, true, 'done: 1 document and 1 PDF removed, 0 failed']);
  const again1 = await live(S.receipt, texts.receipt);
  const again2 = await live(sha('the receipt, downloaded again'), texts.receipt);
  check('the same file scanned again keeps nothing; nor its text under other bytes',
    [again1.withheld, again2.withheld, await idOf(S.receipt), (await counts()).d], [true, true, null, before.d - 1]);

  /* --- the letter, named by its TEXT fingerprint ----------------------------- */
  const letterText = rerun.textSha(texts.letter);
  const byText = await remove(letterText.slice(0, 12), { reason: 'notreport', yes: true });
  check('a text fingerprint names the documents holding it', [byText.lines[1], await idOf(S.letter), blobs.objects.has(S.letter)],
    [`the text ${letterText.slice(0, 8)} is held by 1 document`, null, false]);

  /* --- the Method report, kept twice: one removal takes both ----------------- */
  const m = await remove(S.method1.slice(0, 8), { reason: 'request', yes: true });
  const mRemoval = (await rows('select id::text as id from nose.removals order by id desc limit 1'))[0].id;
  check('a copy by its text goes with the report: both documents, both PDFs',
    [await idOf(S.method1), await idOf(S.method2), blobs.objects.has(S.method1), blobs.objects.has(S.method2), m.res.documents, m.res.pdfs],
    [null, null, false, false, 2, 2]);
  check('...and says why the second goes',
    m.lines[m.lines.indexOf(m.lines.find(l => l.startsWith(`document #${ids.method2} `))) + 2],
    '          it holds one of the same texts: another copy of the same report, so it goes too');
  check('...two file fingerprints, one text, one removal', (await held()).filter(h => h.removal === mRemoval).map(h => h.kind), ['file', 'file', 'text']);

  /* --- a PDF with no row, from a scan while the database was down ------------ */
  const oDry = await remove(O.method.slice(0, 8));
  check('a PDF of a removed report under other bytes: its text is read, it joins that removal - no reason needed',
    [oDry.lines.some(l => l === `PDF with no document row  ${O.method.slice(0, 8)}  first fetched 2026-10-01`),
     oDry.lines.some(l => l.startsWith(`part of removal #${mRemoval} (`)), oDry.lines.some(l => l === 'would withhold: 1 file fingerprint and 0 text fingerprints - the same file, or any file with the same text, is not kept again')],
    [true, true, true]);
  const o = await remove(O.method.slice(0, 8), { yes: true });
  check('...--yes deletes it and withholds its file under the same removal',
    [blobs.objects.has(O.method), (await held()).some(h => h.sha256 === O.method && h.removal === mRemoval), o.res.failed], [false, true, 0]);

  const r2 = await remove(O.receipt.slice(0, 8), { reason: 'personal', yes: true });
  check('a PDF with no row and nothing withheld: a removal of its own, its file and its text withheld',
    [blobs.objects.has(O.receipt), (await held()).filter(h => h.sha256 === O.receipt || h.sha256 === rerun.textSha(orphanTexts['orphan-receipt'])).length, r2.res.removal !== null],
    [false, 2, true]);
  const r3 = await remove(O.unreadable.slice(0, 8), { reason: 'personal', yes: true });
  check('...one whose text cannot be read: only its file is withheld, and it says so',
    [blobs.objects.has(O.unreadable), r3.lines.some(l => /its text could not be read \(stand-in extractor: no text layer\) - only the file will be withheld/.test(l)),
     r3.res.withheldFiles, r3.res.withheldTexts], [false, true, 1, 0]);

  /* --- a document a reparse run walked last --------------------------------- */
  const n = await remove(S.named.slice(0, 8), { reason: 'request', yes: true });
  check('a document a reparse run walked last can be removed, and the run keeps its number',
    [await idOf(S.named), (await rows('select count(*)::int as n from nose.reparse_runs where last_document_id = $1', [ids.named]))[0].n,
     n.lines.includes('          a reparse run names it as the last document it walked; that record keeps the number')], [null, 1, true]);

  /* --- a document kept before PDFs were -------------------------------------- */
  const np = await remove(S.noPdf.slice(0, 8), { reason: 'request', yes: true });
  check('a document with no PDF: its rows go, no PDF is asked for', [await idOf(S.noPdf), np.res.pdfs, np.lines.includes('          1 extraction, 1 parse, no PDF')], [null, 0, true]);

  /* --- Blobs fails: the database half is done, the PDF is finished later ----- */
  blobs.failOn(S.report);
  const half = await remove(S.report.slice(0, 8), { reason: 'request', yes: true });
  check('Blobs failing: the rows are gone and withheld, the PDF stays, and it says to run again',
    [await idOf(S.report), blobs.objects.has(S.report), half.res.failed,
     half.lines.some(l => l.startsWith(`FAIL  PDF ${S.report.slice(0, 8)} is still in Blobs`) && l.endsWith('run the same command again to delete it'))],
    [null, true, 1, true]);
  const withheldNow = (await counts()).w;
  check('...a scan of it meanwhile keeps nothing', (await live(S.report, texts['report-a'])).withheld, true);
  blobs.failOn(null);
  const finish = await remove(S.report.slice(0, 8), { yes: true });
  check('...the same command again deletes the PDF, under the same removal - no reason needed, no new rows',
    [blobs.objects.has(S.report), finish.res.failed, (await counts()).w,
     finish.lines.includes('          withheld already - left behind when its deletion failed, or by a scan made while the database was down'),
     finish.lines.some(l => /^part of removal #\d+ \(\d{4}-\d\d-\d\d, request\) - no new removal is recorded$/.test(l))],
    [false, 0, withheldNow, true, true]);
  const third = await remove(S.report.slice(0, 8), { yes: true });
  check('...and a third time there is nothing left to do',
    [third.lines.some(l => /^already taken out: removal #\d+ on \d{4}-\d\d-\d\d, request - its file fingerprint begins /.test(l)), third.lines[third.lines.length - 1]],
    [true, 'nothing of it is left in the database or in Blobs - nothing to do']);

  /* --- the database refuses: nothing changes, the PDF stays ------------------ */
  const beforeRefusal = await counts();
  const refusing = { query: (sql, p) => (/^delete from nose\.documents/.test(sql) ? Promise.reject(new Error('stand-in: the database refused')) : db.query(sql, p)) };
  const refused = await removeDocument({ db: refusing, blobs, fingerprint: S.fixture2.slice(0, 8), reason: 'legal', yes: true, extract, log: l => printed.push(l) });
  check('a refusing database: rolled back whole - no removal, nothing withheld, the document and its PDF still there',
    [refused.failed, await counts(), await idOf(S.fixture2) !== null, blobs.objects.has(S.fixture2)], [1, beforeRefusal, true, true]);

  /* --- afterwards ------------------------------------------------------------ */
  const k2 = capture();
  const kr2 = await keepRule({ db, log: k2.log });
  check('keep-rule afterwards: nothing below the rule', [kr2.below, k2.lines.some(l => l.trim() === 'below the rule: none')], [0, true]);
  check('...and the withheld fingerprints counted',
    k2.lines.some(l => /withheld - taken out by hand, never kept again: \d+ file fingerprints, \d+ text fingerprints/.test(l.trim())), true);
  check('the fixtures nobody named are untouched', [await idOf(S.fixture1) !== null, blobs.objects.has(S.fixture1), await idOf(S.fixture2) !== null], [true, true, true]);
  check('every PDF deleted was one asked for',
    blobs.deleted.sort(), [S.receipt, S.letter, S.method1, S.method2, O.method, O.receipt, O.unreadable, S.named, S.report].sort());

  const all = printed.join('\n');
  check('nothing printed holds report text, an address, a strain, a client or a full fingerprint',
    [PRIVATE.filter(s => all.includes(s)), Object.values(S).concat(Object.values(O)).filter(h => all.includes(h)).length], [[], 0]);

  /* --- the command line ------------------------------------------------------ */
  const bare = { PATH: process.env.PATH, HOME: process.env.HOME || os.tmpdir() };
  const cli = (script, args) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], { env: bare, encoding: 'utf8', timeout: 20000 });
  const noSecrets = cli('remove-document.js', ['abcdef0123', '--reason', 'request', '--yes']);
  check('remove-document.js with no secrets refuses',
    noSecrets.status === 1 && /^REFUSED: NOSE_DB_ADMIN_URL, NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN are not set/.test(noSecrets.stderr), true);
  const usage = cli('remove-document.js', ['--force']);
  check('...an unknown option prints its usage', usage.status === 2 && /usage: node scripts\/remove-document\.js/.test(usage.stderr), true);
  const badReason = cli('remove-document.js', ['abcdef0123', '--reason', 'Jane']);
  check('...a reason off the list is refused before connecting', badReason.status === 2 && /--reason must be one of: request, personal, notreport, legal/.test(badReason.stderr), true);
  const keepNoSecrets = cli('keep-rule.js', []);
  check('keep-rule.js with no secrets refuses', keepNoSecrets.status === 1 && /^REFUSED: NOSE_DB_URL is not set/.test(keepNoSecrets.stderr), true);
  check('keep-rule.js writes nothing: no insert, update, delete, storeScan or saveScan in it',
    /\b(insert|update|delete)\s|storeScan|saveScan|save_scan/i.test(fs.readFileSync(path.join(ROOT, 'scripts/keep-rule.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')), false);
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
  catch (e) { console.error('remove-document-test threw:', e && e.stack); await pg.close(); process.exit(1); }
  await pg.close();
  if (failures) {
    console.error(`\nremove-document-test: ${failures} failure${failures === 1 ? '' : 's'}`);
    process.exit(1);
  }
  console.log('\nremove-document clean');
}

module.exports = { run };
if (require.main === module) main();

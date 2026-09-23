'use strict';
/* NOSE - the re-run tools, against real Postgres semantics, offline.
 *
 *   node test/rerun-test.js      -> "rerun clean", or FAIL lines and exit 1
 *
 * Drives scripts/reparse.js, backfill-from-blobs.js and export-candidate.js
 * through the functions they export, on PGlite with every migration applied,
 * and with stand-ins for the parser, the extractor and Netlify Blobs: no
 * network, no secrets, no real PDF. As in test/store-test.js the assertions
 * live in run(db), so they can be pointed at any Postgres that offers exec()
 * and query(). The command-line refusals are checked by running each script
 * with its secrets removed.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const store = require(path.join(ROOT, 'netlify/functions/lib/store.js'));
const rerun = require(path.join(ROOT, 'scripts/lib/rerun.js'));
const { reparse } = require(path.join(ROOT, 'scripts/reparse.js'));
const { backfill } = require(path.join(ROOT, 'scripts/backfill-from-blobs.js'));
const { exportCandidate, namesInUse, UsageError, Refusal } = require(path.join(ROOT, 'scripts/export-candidate.js'));

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const FILLER = 'Terpene profile by GC-MS. Values are percent by weight. '.repeat(5);
const textFor = (name, variant) => `DOC:${name}:${variant}\nCertificate of Analysis\n${FILLER}\n`;

/* Netlify Blobs as @netlify/blobs 10.x answers list() and getWithMetadata(). */
function standInBlobs() {
  const objects = new Map();
  return {
    objects,
    put(key, data, metadata = {}) { objects.set(key, { data: Buffer.from(data), metadata }); },
    async list() { return { blobs: [...objects.keys()].map(key => ({ key, etag: '"e"' })), directories: [] }; },
    async getWithMetadata(key, opts) {
      if (!opts || opts.type !== 'arrayBuffer') throw new Error('stand-in: only arrayBuffer is asked for');
      const o = objects.get(key);
      if (!o) return null;
      return { data: o.data.buffer.slice(o.data.byteOffset, o.data.byteOffset + o.data.length), etag: '"e"', metadata: o.metadata };
    }
  };
}

async function run(db, log = console.log) {
  let failures = 0;
  const check = (label, actual, expected) => {
    const ok = Object.is(actual, expected);
    if (!ok) failures++;
    log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
  };
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const count = async table => (await one(`select count(*)::int as n from nose.${table}`)).n;
  const rejects = async fn => { try { await fn(); return null; } catch (e) { return e; } };
  const has = (lines, re) => lines.some(l => re.test(l));
  const lastRun = async () => (await one(`
    select mode, parser_version, extractor_version, documents, last_document_id::text as last, unchanged,
           values_changed, accepted_to_rejected as a2r, rejected_to_accepted as r2a, failed, new_texts, no_pdf
      from nose.reparse_runs order by id desc limit 1`)) || {};

  /* --- the migrations, in order ------------------------------------------ */
  const dir = path.join(ROOT, 'supabase/migrations');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  }

  /* --- five documents, as the seed or a scan leaves them ------------------ */
  let readings = {
    A: { lab: 'Kaycha Labs', strain: 'Alpha', readBy: 'forward', usable: true, totalTerpenes: 2,
         terps: { limonene: 0.8, myrcene: 0.5, pinene: 0 }, warnings: [], rejectReasons: [] },
    B: { lab: 'Modern Canna', strain: 'Bravo', readBy: 'forward', usable: true, totalTerpenes: 1.5,
         terps: { limonene: 0.7 }, warnings: [], rejectReasons: [] },
    C: { lab: 'ACS Laboratory', strain: 'Charlie', readBy: 'backward', usable: false, totalTerpenes: null,
         terps: {}, warnings: [], rejectReasons: ['no total printed'] },
    D: { lab: 'Kaycha Labs', strain: 'Delta', readBy: 'multicolumn', usable: true, totalTerpenes: 3.1,
         terps: { myrcene: 1.2 }, warnings: [], rejectReasons: [] },
    E: { lab: 'Method Testing Labs', strain: 'Echo', readBy: 'forward', usable: true, totalTerpenes: 1.1,
         terps: { linalool: 0.3 }, warnings: [], rejectReasons: [] }
  };
  let stamp = 'abc1234';
  let throwFor = new Set();
  const parse = text => {
    const m = /^DOC:(\w+):/.exec(text);
    if (!m) return { lab: null, strain: null, usable: false, terps: {}, rejectReasons: ['not a report'], parserVersion: stamp };
    if (throwFor.has(m[1])) throw new Error('stand-in parser threw');
    return { ...readings[m[1]], parserVersion: stamp };
  };
  const variant = { A: 'v1', B: 'v1', C: 'v1', D: 'v1' };
  const nameOf = bytes => /stand-in (\w+)/.exec(Buffer.from(bytes).toString())[1];
  const extract = async bytes => {
    const n = nameOf(bytes);
    if (variant[n] === 'short') return { text: 'too short', pages: 1 };
    if (variant[n] === 'none') return { text: 'no marker here, and nothing that looks like a report at all. '.repeat(5), pages: 1 };
    return { text: textFor(n, variant[n] || 'v1'), pages: 1 };
  };

  const blobs = standInBlobs();
  const docs = {};
  for (const n of ['A', 'B', 'C', 'D', 'E']) {
    const bytes = Buffer.from(`%PDF-1.4 stand-in ${n}`);
    docs[n] = sha(bytes);
    await store.saveScan({ sha256: docs[n], byteSize: bytes.length, sourceUrl: null, fetchedAt: '2026-09-22',
                           extractorVersion: '111111111111', text: textFor(n, 'v1'), parserVersion: 'abc1234',
                           context: 'seed', output: { ...readings[n], parserVersion: 'abc1234' } }, { client: db });
    if (n !== 'E') blobs.put(docs[n], bytes, { sourceUrl: null, fetchedAt: '2026-09-22' });   // E: kept before PDFs were
  }
  const lastId = (await one('select max(id)::text as id from nose.documents')).id;

  const stampsAt = (parserVersion, extractorVersion = '0123456789ab') => ({ parserVersion, extractorVersion, unpdf: '1.8.0', dirty: [] });
  const go = async (opts = {}) => {
    const lines = [];
    const pages = [];
    const r = await reparse({ db, parse, extract, blobs, stamps: stampsAt(stamp), pageSize: 2,
                              log: l => lines.push(l), progress: n => pages.push(n), ...opts });
    return { ...r, lines, pages };
  };

  /* --- nothing changed ----------------------------------------------------- */
  let parses = await count('parses');
  const dry0 = await go({ dryRun: true });
  check('dry run: all five documents read, two to a page', dry0.pages.join(','), '2,4,5');
  check('dry run: all five unchanged', dry0.counts.unchanged, 5);
  check('dry run: writes no parse', await count('parses'), parses);
  check('dry run: records no run', await count('reparse_runs'), 0);
  check('dry run: says so, and ends with the counts', dry0.lines.slice(-2).join(' | '),
    'dry run - nothing was written | 5 documents: 5 unchanged / 0 values changed / 0 accepted→rejected / 0 rejected→accepted / 0 failed');

  const real0 = await go();
  check('a run that changes nothing writes no parse', await count('parses'), parses);
  let r = await lastRun();
  check('...but is on record: mode, parser, no extractor', `${r.mode} ${r.parser_version} ${r.extractor_version}`, 'reparse abc1234 null');
  check('...every document counted, through the last', `${r.documents} ${r.unchanged} ${r.failed} ${r.last}`, `5 5 0 ${lastId}`);
  check('...and it says which run', has(real0.lines, new RegExp(`^run #\\d+ recorded: parser abc1234 checked 5 documents \\(through document #${lastId}\\) on \\d{4}-\\d\\d-\\d\\d \\(UTC\\)$`)), true);

  /* --- a parser change ---------------------------------------------------- */
  readings = JSON.parse(JSON.stringify(readings));
  readings.A.terps = { limonene: 0.85, myrcene: 0.5005, pinene: 0 };   // one move over 0.001, one under
  readings.A.totalTerpenes = 2.05;
  Object.assign(readings.B, { usable: false, rejectReasons: ['measured coverage too low'] });
  Object.assign(readings.C, { usable: true, rejectReasons: [], totalTerpenes: 0.9, terps: { limonene: 0.4 } });
  readings.D.warnings = ['moisture reads unusually low'];
  stamp = 'def5678';

  const dry1 = await go({ dryRun: true });
  const c1 = dry1.counts;
  check('parser change, dry run: 1 unchanged / 2 values changed / 1 accepted→rejected / 1 rejected→accepted',
    `${c1.unchanged}/${c1['values changed']}/${c1['accepted→rejected']}/${c1['rejected→accepted']}`, '1/2/1/1');
  check('...short sha, lab and strain head each change', has(dry1.lines, new RegExp(`^${docs.A.slice(0, 8)}  Kaycha Labs \\| Alpha$`)), true);
  check('...usable, readBy and totalTerpenes, before → after',
    has(dry1.lines, /^ {10}usable true → true {3}readBy forward → forward {3}totalTerpenes 2 → 2\.05$/), true);
  check('...a terpene that moved more than 0.001 is printed', has(dry1.lines, /^ {10}limonene 0\.8 → 0\.85$/), true);
  check('...one that moved less is not', has(dry1.lines, /myrcene/), false);
  check('...accepted→rejected shows usable true → false', has(dry1.lines, /usable true → false/), true);
  check('...anything else that changed is named', has(dry1.lines, /also changed: warnings$/), true);
  check('...an unchanged document prints nothing', has(dry1.lines, new RegExp(docs.E.slice(0, 8))), false);
  check('...and nothing is written', `${await count('parses')} ${await count('reparse_runs')}`, `${parses} 1`);

  await go();
  check('parser change, real run: one parse per changed reading', await count('parses'), parses + 4);
  const newParses = await one(`select count(*)::int as n from nose.parses
                                where context = 'reparse' and parser_version = 'def5678'`);
  check('...context reparse, stamped with the commit', newParses.n, 4);
  r = await lastRun();
  check('...and the run records the same counts', `${r.unchanged}/${r.values_changed}/${r.a2r}/${r.r2a}/${r.failed}`, '1/2/1/1/0');
  parses = await count('parses');
  const again = await go();
  check('the same parser again: nothing written, everything unchanged',
    `${await count('parses') - parses} ${again.counts.unchanged}`, '0 5');
  check('...and still on record', (await lastRun()).unchanged, 5);

  /* --- small moves, exactly --------------------------------------------- */
  const at = (a, b) => rerun.describe('f'.repeat(64), { terps: { x: a } }, { terps: { x: b } });
  check('a move of exactly 0.001 is not "more than 0.001"', has(at(0.822, 0.823), /x 0\.822/), false);
  check('...it is still named as a change', has(at(0.822, 0.823), /terpenes \(none moved more than 0\.001\)/), true);
  check('a move of 0.0011 is printed', has(at(0.8221, 0.8232), /x 0\.8221 → 0\.8232/), true);
  check('a terpene that disappears is printed with a dash', has(at(0.5, undefined), /x 0\.5 → -/), true);
  check('key order and version stamps are not a change',
    rerun.sameReading({ a: 1, b: { c: 2, d: 3 }, parserVersion: 'x' }, { b: { d: 3, c: 2 }, a: 1, parserVersion: 'y' }), true);
  const older = { lab: 'L', usable: true, terps: {} };
  const newer = { ...older, reportDate: null, client: null };
  check('a field that is new, even as null, is a change', rerun.classify(older, newer), 'values changed');
  check('...and is named as new', has(rerun.describe('f'.repeat(64), older, newer), /also changed: client \(new\), reportDate \(new\)$/), true);

  /* --- failures are counted, and do not stop the run ------------------------ */
  throwFor = new Set(['B']);
  const failing = await go();
  check('a parser that throws on one document fails that one only',
    `${failing.counts.failed} ${failing.counts.documents}`, '1 5');
  check('...naming it', has(failing.lines, new RegExp(`^${docs.B.slice(0, 8)}  Modern Canna \\| Bravo  FAILED: the parser threw`)), true);
  check('...and the run is recorded with it', (await lastRun()).failed, 1);
  throwFor = new Set();

  readings.D = { ...readings.D, warnings: [] };   // a change a real run would save
  const parsesNow = await count('parses');
  const noTable = { query: (sql, params) => (/from nose\.reparse_runs limit 0/.test(sql)
    ? Promise.reject(new Error('relation "nose.reparse_runs" does not exist')) : db.query(sql, params)) };
  const missing = await rejects(() => go({ db: noTable }));
  check('a real run without the reparse_runs table stops before saving anything',
    !!missing && /push the migration first/.test(missing.message) && await count('parses') === parsesNow, true);
  check('...while a dry run needs no table', (await go({ db: noTable, dryRun: true })).counts['values changed'], 1);
  const asAdmin = await rejects(() => rerun.connectAsWriter({ connect: async () => {}, query: async () => ({ rows: [{ u: 'postgres' }] }) }));
  check('a connection as any role but nose_writer is refused', !!asAdmin && /not nose_writer/.test(asAdmin.message), true);
  await go();   // save D's change, so what follows starts level

  const runsBefore = await count('reparse_runs');
  const badStamp = await rejects(() => go({ stamps: stampsAt('0000000') }));
  check('a parse stamped with another commit stops the run', !!badStamp && /did not load/.test(badStamp.message), true);
  check('...and records nothing', await count('reparse_runs'), runsBefore);

  /* --- re-extract ------------------------------------------------------- */
  variant.A = 'v2';        // the extractor now reads A differently
  variant.C = 'short';     // and reads almost nothing from C
  const extractions = await count('extractions');
  const rdry = await go({ reextract: true, dryRun: true });
  check('re-extract, dry run: A would get a new text; E has no PDF; C fails',
    `${rdry.counts.newTexts} ${rdry.counts.noPdf} ${rdry.counts.failed}`, '1 1 1');
  check('...C is named with its reason', has(rdry.lines, /FAILED: the extractor read under 200 characters/), true);
  check('...E is parsed from its stored text, and says so', has(rdry.lines, /no PDF in Blobs - parsed from its stored text/), true);
  check('...nothing written', await count('extractions'), extractions);

  await go({ reextract: true, stamps: stampsAt(stamp, 'fedcba987654') });
  check('re-extract: exactly one new text kept', await count('extractions'), extractions + 1);
  const newest = await one(`select e.extractor_version, left(e.text, 9) as head from nose.extractions e
                              where e.document_id = (select id from nose.documents where sha256 = $1)
                              order by e.id desc limit 1`, [docs.A]);
  check('...A\'s newest text is the new one, by the new extractor', `${newest.head} ${newest.extractor_version}`, 'DOC:A:v2\n fedcba987654');
  r = await lastRun();
  check('...the run records the extractor, new texts, no-PDF and failures',
    `${r.mode} ${r.extractor_version} ${r.new_texts} ${r.no_pdf} ${r.failed}`, 'reextract fedcba987654 1 1 1');
  const plainAfter = await go();
  check('a plain reparse then reads the newest text, and finds nothing to change',
    `${plainAfter.counts.unchanged} ${plainAfter.counts.failed}`, '5 0');

  const runsNow = await count('reparse_runs');
  const refusedBlobs = { list: async () => { throw new Error('Netlify Blobs has generated an internal error (401 status code)'); } };
  const stopped = await rejects(() => go({ reextract: true, blobs: refusedBlobs, stamps: stampsAt(stamp, 'fedcba987654') }));
  check('re-extract with a refused token stops before counting anything', !!stopped && /401/.test(stopped.message), true);
  check('...and records no run', await count('reparse_runs'), runsNow);
  check('...explained as a token to replace', /NETLIFY_AUTH_TOKEN/.test(rerun.explain(stopped)), true);

  variant.A = 'v1';        // extract-text.js reverted
  variant.C = 'v1';
  const reverted = await go({ reextract: true, stamps: stampsAt(stamp, 'fedcba987654') });
  check('a reverted extractor stores no text twice', await count('extractions'), extractions + 1);
  check('...and says the text equals an earlier extraction', has(reverted.lines, /equals an earlier extraction \(#\d+\), not the newest/), true);

  /* --- backfill ------------------------------------------------------------ */
  const orphan = (name, meta, bytes = Buffer.from(`%PDF-1.4 stand-in ${name}`)) => {
    const key = sha(bytes);
    blobs.put(key, bytes, meta);
    return key;
  };
  readings.F = { lab: 'Kaycha Labs', strain: 'Foxtrot', readBy: 'forward', usable: true, totalTerpenes: 1.9,
                 terps: { limonene: 0.6 }, warnings: [], rejectReasons: [] };
  const F = orphan('F', { sourceUrl: 'https://lab.example/f.pdf?X-Amz-Signature=abc', fetchedAt: '2026-09-20' });
  variant.G = 'none';
  const G = orphan('G', { sourceUrl: null, fetchedAt: '2026-09-20' });
  readings.H = { ...readings.F, strain: 'Hotel' };
  const H = orphan('H', { sourceUrl: null });
  variant.J = 'short';
  const J = orphan('J', { sourceUrl: null, fetchedAt: '2026-09-21' });
  const I = sha(Buffer.from('the bytes it was stored under'));
  blobs.put(I, Buffer.from('%PDF-1.4 stand-in I - not those bytes'), { fetchedAt: '2026-09-21' });

  const documents = await count('documents');
  const bLines = [];
  const bdry = await backfill({ db, blobs, parse, extract, dryRun: true, stamps: stampsAt(stamp), log: l => bLines.push(l) });
  check('backfill, dry run: 5 orphans - 1 would be saved, 3 skipped, 1 failed',
    `${bdry.orphans} ${bdry.saved} ${bdry.skipped} ${bdry.failed}`, '5 1 3 1');
  check('...nothing written', await count('documents'), documents);
  check('...a copy that does not match its key fails', has(bLines, new RegExp(`^FAIL  ${I.slice(0, 8)}  could not read the PDF: .*does not match its key`)), true);
  check('...no fetch day is not guessed', has(bLines, new RegExp(`^skip  ${H.slice(0, 8)}  its metadata holds no valid fetch day`)), true);
  check('...not a lab report is not stored', has(bLines, new RegExp(`^skip  ${G.slice(0, 8)}  not a lab report`)), true);
  check('...too little text is not stored', has(bLines, new RegExp(`^skip  ${J.slice(0, 8)}  under 200 characters`)), true);

  const bLines2 = [];
  const breal = await backfill({ db, blobs, parse, extract, stamps: stampsAt(stamp), log: l => bLines2.push(l) });
  check('backfill: one document saved', `${breal.saved} ${await count('documents')}`, `1 ${documents + 1}`);
  const f = await one(`select d.first_fetched_on::text as day, d.first_source_url as url, p.context, p.parser_version,
                              e.extractor_version, p.strain
                         from nose.documents d join nose.extractions e on e.document_id = d.id
                         join nose.parses p on p.extraction_id = e.id where d.sha256 = $1`, [F]);
  check('...dated by the PDF\'s own metadata, not today', f.day, '2026-09-20');
  check('...its address without the query', f.url, 'https://lab.example/f.pdf');
  check('...context backfill, stamped parser and extractor', `${f.context} ${f.parser_version} ${f.extractor_version}`, `backfill ${stamp} 0123456789ab`);
  const breal2 = await backfill({ db, blobs, parse, extract, stamps: stampsAt(stamp), log: () => {} });
  check('backfill again: F is no longer an orphan', `${breal2.orphans} ${breal2.saved}`, '4 0');

  /* --- export-candidate ---------------------------------------------------- */
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nose-rerun-'));
  try {
    const pdfDir = path.join(TMP, 'pdf');
    const textDir = path.join(TMP, 'extracted');
    const baseline = { 'KAY-FLW-003': { lab: 'Kaycha Labs' }, 'KAY-FLW-001': { lab: 'Kaycha Labs' },
                       'KAY-CAR-004': { lab: 'Kaycha Labs' }, 'MCL-FLW-002': { lab: 'Modern Canna' }, Kush_Creek: { lab: 'Kaycha Labs' } };
    const eLines = [];
    const ex = await exportCandidate({ db, blobs, extract, prefix: docs.A.slice(0, 8).toUpperCase(), pdfDir, textDir,
                                       baseline, log: l => eLines.push(l) });
    const base = `candidate-${docs.A.slice(0, 8)}`;
    check('export: the PDF, byte for byte', fs.readFileSync(path.join(pdfDir, `${base}.pdf`)).equals(Buffer.from('%PDF-1.4 stand-in A')), true);
    check('...the text, as extract-dump writes it', fs.readFileSync(path.join(textDir, `${base}.txt`), 'utf8'), textFor('A', 'v1'));
    check('...the stored lab, strain and batch are printed',
      has(eLines, /^ {2}lab {6}Kaycha Labs$/) && has(eLines, /^ {2}strain {3}Alpha$/) && has(eLines, /^ {2}batch {4}-$/), true);
    check('...and the names in use for that lab', has(eLines, /Kaycha Labs so far: KAY-CAR-004  KAY-FLW-003$/), true);
    check('...the text is today\'s, and it says whether the archive holds the same', ex.sameText, false);
    check('...by-hand baseline is asked for', has(eLines, /BY HAND/), true);
    const twice = await rejects(() => exportCandidate({ db, blobs, extract, prefix: docs.A.slice(0, 8), pdfDir, textDir, baseline, log: () => {} }));
    check('export again: an existing file is never overwritten', twice instanceof Refusal && /already exists/.test(twice.message), true);
    const named = await exportCandidate({ db, blobs, extract, prefix: docs.D, name: 'KAY-FLW-004', pdfDir, textDir, baseline, log: () => {} });
    check('export with a name: the files take it', fs.existsSync(named.pdfPath) && named.textPath.endsWith('KAY-FLW-004.txt'), true);
    const taken = await rejects(() => exportCandidate({ db, blobs, extract, prefix: docs.B, name: 'KAY-FLW-003', pdfDir, textDir, baseline, log: () => {} }));
    check('...a name the baseline already uses is refused', taken instanceof Refusal && /baseline entry/.test(taken.message), true);
    const badName = await rejects(() => exportCandidate({ db, blobs, extract, prefix: docs.B, name: 'my file', pdfDir, textDir, baseline, log: () => {} }));
    check('...a name that is not LAB-FORM-NNN is refused', badName instanceof UsageError, true);
    const noPdf = await rejects(() => exportCandidate({ db, blobs, extract, prefix: docs.E, pdfDir, textDir, baseline, log: () => {} }));
    check('export: a document with no PDF writes nothing', noPdf instanceof Refusal && /no PDF in Blobs/.test(noPdf.message)
      && !fs.existsSync(path.join(textDir, `candidate-${docs.E.slice(0, 8)}.txt`)), true);
    for (const s of ['abcdef01' + '0'.repeat(56), 'abcdef02' + '0'.repeat(56)]) {
      await store.saveScan({ sha256: s, byteSize: 1, sourceUrl: null, fetchedAt: null, extractorVersion: 'x',
                             text: `text ${s}`, parserVersion: 'x', context: 'seed', output: { lab: 'x' } }, { client: db });
    }
    const ambiguous = await rejects(() => exportCandidate({ db, blobs, extract, prefix: 'abcdef0', pdfDir, textDir, baseline, log: () => {} }));
    check('export: a prefix matching two documents is refused', ambiguous instanceof Refusal && /more than one document/.test(ambiguous.message), true);
    const none = await rejects(() => exportCandidate({ db, blobs, extract, prefix: '0123456', pdfDir, textDir, baseline, log: () => {} }));
    check('...one matching none is refused', none instanceof Refusal && /starts with 0123456/.test(none.message), true);
    const short = await rejects(() => exportCandidate({ db, blobs, extract, prefix: 'abc', pdfDir, textDir, baseline, log: () => {} }));
    check('...under 7 characters is a usage error', short instanceof UsageError, true);
    check('namesInUse: highest number per LAB-FORM for that lab only', namesInUse(baseline, 'Modern Canna').join(' '), 'MCL-FLW-002');
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }

  /* --- what is printed ------------------------------------------------- */
  const printed = [dry0, dry1, real0, failing, rdry, reverted].flatMap(x => x.lines).concat(bLines, bLines2);
  check('nothing printed holds an address', printed.some(l => /https?:\/\//.test(l)), false);
  check('nothing printed holds report text', printed.some(l => /Certificate of Analysis|DOC:/.test(l)), false);

  /* --- the command line refuses before touching anything -------------------- */
  const bare = { PATH: process.env.PATH, HOME: process.env.HOME || os.tmpdir() };
  const cli = (script, args) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args],
                                          { env: bare, encoding: 'utf8', timeout: 20000 });
  for (const [script, args] of [['reparse.js', []], ['reparse.js', ['--dry-run']], ['reparse.js', ['--reextract']],
                                ['backfill-from-blobs.js', []], ['export-candidate.js', ['abcdef1']]]) {
    const res = cli(script, args);
    check(`${script} ${args.join(' ')} with no secrets refuses`.replace(/ +with/, ' with'),
      res.status === 1 && /^REFUSED: NOSE_DB_URL.* not set/.test(res.stderr), true);
  }
  const usage = cli('reparse.js', ['--everything']);
  check('reparse.js with an unknown option prints its usage', usage.status === 2 && /usage: node scripts\/reparse\.js/.test(usage.stderr), true);

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
  catch (e) { console.error('rerun-test threw:', e && e.stack); process.exit(1); }
  finally { await pg.close(); }
  if (failures) {
    console.error(`\nrerun-test: ${failures} failure${failures === 1 ? '' : 's'}`);
    process.exit(1);
  }
  console.log('\nrerun clean');
}

module.exports = { run };
if (require.main === module) main();

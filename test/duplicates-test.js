'use strict';
/* NOSE - scripts/duplicates.js and scripts/download-twice.js, offline.
 *
 *   node test/duplicates-test.js      -> "duplicates clean", or FAIL lines and exit 1
 *
 * duplicates.js: documents are saved through store.js exactly as scans, the
 * seed and a reparse save them, on PGlite with every migration applied - one
 * report saved under three fingerprints (a portal that rebuilds its PDF on
 * download), a fixture scanned again, an amended report under the same lab
 * ID, a document extracted twice - then its groups, counts and lines are
 * read back, and checked for report text, addresses and full fingerprints.
 *
 * download-twice.js: real fixture PDFs, the real extractor and parser, coa.js's
 * own page resolver, behind a stand-in fetch - a coaportal report page whose
 * PDF is rebuilt between downloads (every stamp of its making changed, as
 * Method's are), a viewer page whose PDF is the same file twice, a report
 * whose text changes, and a link that fails. No network, no waiting.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify/functions/lib');
const store = require(path.join(LIB, 'store.js'));
const { duplicates, groupByText, parseArgs: dupArgs, UsageError: DupUsage } = require(path.join(ROOT, 'scripts/duplicates.js'));
const twice = require(path.join(ROOT, 'scripts/download-twice.js'));

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const SECRET_TEXT = 'PRIVATE-REPORT-TEXT-MARKER';
const ADDRESS = 'https://example.org/coa/secret-report.pdf';

/* A PDF as a portal would build it again at another moment: every occurrence
   of the 14-digit stamp of its making, and its file ID, changed - nothing else. */
function rebuilt(buf, when = '20261001221503') {
  let s = buf.toString('latin1');
  const m = /\/CreationDate \((?:D:)?(\d{14})/.exec(s);
  if (!m) throw new Error('no plain creation stamp in this PDF');
  s = s.split(m[1]).join(when);
  const flip = hex => hex.replace(/[0-9a-f]/gi, c => ((parseInt(c, 16) + 1) % 16).toString(16));
  s = s.replace(/\/ID ?\[ ?<([0-9a-f]+)> ?<([0-9a-f]+)> ?\]/i, all => all.replace(/<([0-9a-f]+)>/gi, (_, h) => `<${flip(h)}>`));
  return Buffer.from(s, 'latin1');
}

async function run(db, log = console.log) {
  let failures = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
  };

  const dir = path.join(ROOT, 'supabase/migrations');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  }

  /* ======================================================== duplicates.js */
  const reading = (lab, strain, labId, extra = {}) => ({
    lab, strain, labId, productClass: 'flower', readBy: 'forward', usable: true, totalTerpenes: 1.5,
    terps: { limonene: 0.7 }, warnings: [], rejectReasons: [], novelty: [], ...extra
  });
  const save = (name, output, { day, context = 'production', text }) => store.saveScan({
    sha256: sha(name), byteSize: 1000 + name.length, sourceUrl: context === 'production' ? ADDRESS : null,
    fetchedAt: `${day}T12:00:00Z`, extractorVersion: 'x1', text: `${text} ${SECRET_TEXT}`,
    parserVersion: 'abc1234', context, output
  }, { client: db });
  const idOf = async name => (await db.query('select id::text as id from nose.documents where sha256 = $1', [sha(name)])).rows[0].id;

  const M = reading('Method Testing Labs', 'FLORA', '2502CBR0160-007');
  await save('fixture', reading('Modern Canna', null, 'IK06001-01'), { day: '2026-09-22', context: 'seed', text: 'modern canna report' });
  await save('mtl-1', M, { day: '2026-09-23', text: 'method report' });
  await save('kay', reading('Kaycha Labs', 'GREASE MONKEY', 'MI60617015-004'), { day: '2026-09-24', text: 'kaycha report' });
  await save('kay', reading('Kaycha Labs', 'GREASE MONKEY', 'MI60617015-004'), { day: '2026-09-30', text: 'kaycha report' });
  await save('kay-amended', reading('Kaycha Labs', 'GREASE MONKEY', 'MI60617015-004', { totalTerpenes: 2 }),
             { day: '2026-09-25', text: 'kaycha report, revised' });
  await save('fixture-scan', reading('Modern Canna', null, 'IK06001-01'), { day: '2026-09-26', text: 'modern canna report' });
  await save('acs', reading('ACS Laboratory', 'SFV OG', null), { day: '2026-09-26', text: 'acs report' });
  await save('old', reading('TerpLife Labs', 'GrpeBblGm', null), { day: '2026-09-27', context: 'seed', text: 'terplife first text' });
  await save('old', reading('TerpLife Labs', 'GrpeBblGm', null, { novelty: [] }), { day: '2026-09-27', context: 'reparse', text: 'terplife second text' });
  await save('old-copy', reading('TerpLife Labs', 'GrpeBblGm', null, { totalTerpenes: 1.6 }), { day: '2026-09-28', text: 'terplife second text' });
  await save('mtl-2', M, { day: '2026-10-01', text: 'method report' });
  await save('mtl-3', M, { day: '2026-10-01', text: 'method report' });

  const blobs = { async list() { return { blobs: [sha('mtl-1'), sha('mtl-2'), sha('fixture-scan'), sha('kay')].map(key => ({ key, etag: '"e"' })), directories: [] }; } };
  const lines = [];
  const res = await duplicates({ db, blobs, log: l => lines.push(l) });
  const text = lines.join('\n');
  const ids = Object.fromEntries(await Promise.all(['fixture', 'mtl-1', 'mtl-2', 'mtl-3', 'kay', 'kay-amended', 'fixture-scan', 'acs', 'old', 'old-copy']
    .map(async n => [n, await idOf(n)])));

  check('duplicates: 10 documents, 6 reports by text, 4 copies', [res.documents, res.reports, res.copies.length], [10, 6, 4]);
  check('...the copies are the later documents of each report, the first stored stays the report',
    res.copies, [ids['fixture-scan'], ids['old-copy'], ids['mtl-2'], ids['mtl-3']].sort((a, b) => a - b));
  check('...a document extracted twice joins a copy of its newer text',
    res.repeated.find(g => g.includes(ids.old)), [ids.old, ids['old-copy']]);
  check('the first line says it all',
    lines[0], 'duplicates: 10 documents hold 6 distinct reports by text - 4 documents are copies of an earlier one');
  const at = needle => lines.findIndex(l => l.includes(needle));
  check('a report and its copies: name, count, one reading; first, then copies, with day, arrival, short fingerprint, size',
    lines.slice(at('Method Testing Labs | FLORA'), at('Method Testing Labs | FLORA') + 4).map(l => l.replace(/\s+/g, ' ').trim()), [
      'Method Testing Labs | FLORA | lab ID 2502CBR0160-007 3 documents, one reading',
      `#${ids['mtl-1']} 2026-09-23 production ${sha('mtl-1').slice(0, 8)} 1005 bytes first`,
      `#${ids['mtl-2']} 2026-10-01 production ${sha('mtl-2').slice(0, 8)} 1005 bytes copy`,
      `#${ids['mtl-3']} 2026-10-01 production ${sha('mtl-3').slice(0, 8)} 1005 bytes copy`]);
  const mc = at('Modern Canna | (no strain)');
  check('a fixture scanned again: the seeded document is the report, the scan its copy',
    [/ seed .* first$/.test(lines[mc + 1]), / production .* copy$/.test(lines[mc + 2])], [true, true]);
  check('copies whose readings differ say so',
    lines.some(l => l.includes('TerpLife Labs | GrpeBblGm') && l.includes("2 different readings - not all read by today's parser? run reparse.js")), true);
  check('same lab ID, one text: pointed back at the copies',
    lines.filter(l => /one text - the copies above$/.test(l)).map(l => l.trim().split(/\s{2,}/)[0]), ['Modern Canna', 'Method Testing Labs']);
  const amended = at('MI60617015-004   2 documents, 2 different texts');
  check('same lab ID, two texts: both listed, each with its text, verdict and total',
    [amended > 0, lines.slice(amended + 1, amended + 3).map(l => l.trim().split(/\s+/).slice(-5))],
    [true, [['text', 'A', 'usable', 'total', '1.5%'], ['text', 'B', 'usable', 'total', '2%']]]);
  check('a document saved twice with the same bytes is one document, never a copy',
    res.repeated.some(g => g.includes(ids.kay)), false);
  check('copies by lab, most first',
    lines.slice(at('Copies by lab:') + 1, at('Copies by lab:') + 4).map(l => l.trim().split(/\s{2,}/)), [['Method Testing Labs', '2'], ['Modern Canna', '1'], ['TerpLife Labs', '1']]);
  check('what the copies hold, rows and PDFs in Blobs',
    lines.find(l => l.startsWith('What the copies hold')), 'What the copies hold: 4 documents, 4 extractions, 4 parses - and 2 of 4 with a PDF in Blobs');
  check('it ends with the number', lines[lines.length - 1], 'duplicates already stored: 4 documents');
  check('no report text, no address, no full fingerprint',
    [text.includes(SECRET_TEXT), text.includes('example.org'), Object.keys(ids).some(n => text.includes(sha(n)))], [false, false, false]);

  const noBlobs = [];
  await duplicates({ db, log: l => noBlobs.push(l) });
  check('without the Netlify secrets the PDFs are not checked, and it says so',
    noBlobs.find(l => l.startsWith('What the copies hold')).endsWith('their PDFs in Blobs: not checked (needs NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN)'), true);
  const refusedBlobs = [];
  const refusedRes = await duplicates({ db, blobs: { list: async () => { throw new Error('Netlify Blobs has generated an internal error (401 status code)'); } },
                                        log: l => refusedBlobs.push(l) });
  check('Blobs refusing does not take the database\'s answer away: the count stands, the PDFs say why',
    [refusedRes.copies.length, /their PDFs in Blobs: could not be checked - Netlify refused the token/.test(refusedBlobs.find(l => l.startsWith('What the copies hold'))),
     refusedBlobs[refusedBlobs.length - 1]], [4, true, 'duplicates already stored: 4 documents']);
  const one = [];
  await duplicates({ db, limit: 1, log: l => one.push(l) });
  check('--limit lists that many of each kind, and says how many more',
    one.filter(l => /^\s+\.\.\. and \d+ more/.test(l)).map(l => l.trim()), ['... and 2 more - add --limit 3', '... and 2 more - add --limit 3']);

  check('groupByText: unshared documents stand alone, shared texts join, in id order',
    groupByText(['1', '2', '3', '10'], [{ id: '10', text_sha256: 'a' }, { id: '2', text_sha256: 'b' }, { id: '1', text_sha256: 'a' },
                                         { id: '3', text_sha256: 'c' }, { id: '3', text_sha256: 'b' }]), [['1', '10'], ['2', '3']]);

  /* An empty archive. */
  const empty = [];
  const emptyRes = await duplicates({ db: { query: async () => ({ rows: [] }) }, log: l => empty.push(l) });
  check('an archive with nothing in it says none, and 0',
    [emptyRes.copies.length, empty.filter(l => /: none\.$/.test(l)).length, empty[empty.length - 1]], [0, 2, 'duplicates already stored: 0 documents']);

  const usage = argv => { try { dupArgs(argv); return null; } catch (e) { return e instanceof DupUsage; } };
  check('duplicates arguments', [dupArgs([]), dupArgs(['--limit', '9']), usage(['--limit']), usage(['--limit', '0']), usage(['x'])],
    [{ limit: 50 }, { limit: 9 }, true, true, true]);

  /* ==================================================== download-twice.js */
  const { extractCoaText } = require(path.join(LIB, 'extract-text.js'));
  const { parseCoa } = require(path.join(LIB, 'parse-coa.js'));
  const { _resolvePdfFromPage } = require(path.join(ROOT, 'netlify/functions/coa.js'));
  const pdf = n => fs.readFileSync(path.join(ROOT, 'test/fixtures/pdf', `${n}.pdf`));
  const page = n => fs.readFileSync(path.join(ROOT, 'test/fixtures/pages', n));

  const method = pdf('MTL-FLW-002');
  const methodAgain = rebuilt(method);
  const kaycha = pdf('Grease_Monkey_cart');
  const changing = pdf('KAY-FLW-001');
  const changingAgain = rebuilt(changing, '20261001221530');
  const viewer = Buffer.from('<!doctype html><html><body><iframe src="/pdfjs/web/viewer.html"></iframe></body></html>');

  const REPORT_PAGE = 'https://coaportal.com/sunburn/report/?search=Sunburn-5637041429622699-2608CBR0160-002';
  const links = [REPORT_PAGE, 'https://yourcoa.com/coa/coa-view?sample=MI60617015-004',
                 'https://lab.example/reports/KAY-FLW-001.pdf?token=SECRET-TOKEN', 'https://down.example/gone.pdf'];
  const served = {};
  const answers = {
    [REPORT_PAGE]: () => page('coaportal-report.html'),
    [`${REPORT_PAGE}&pdf=6`]: n => (n === 1 ? method : methodAgain),
    'https://yourcoa.com/coa/coa-view?sample=MI60617015-004': () => viewer,
    'https://yourcoa.com/coa/coa-download/MI60617015-004?wl_id=0&mrk=0&is_view=1': () => kaycha,
    'https://lab.example/reports/KAY-FLW-001.pdf?token=SECRET-TOKEN': n => (n === 1 ? changing : changingAgain)
  };
  const fetch = async url => {
    served[url] = (served[url] || 0) + 1;
    const answer = answers[url];
    if (!answer) return new Response('not here', { status: 404 });
    return Object.assign(new Response(answer(served[url]), { status: 200 }), {});
  };
  const CHANGED_LINE = 'Completed:';
  const extract = async buf => {
    const got = await extractCoaText(buf);
    if (Buffer.compare(buf, changingAgain) === 0) got.text = got.text.replace(`\n${CHANGED_LINE}\n`, `\n${CHANGED_LINE} 10/01/26 6:15 PM\n`);
    return got;
  };
  let waited = null;
  const out = [];
  const tally = await twice.downloadTwice({ links, resolvePage: _resolvePdfFromPage, extract, parse: parseCoa, fetch,
                                            sleep: async ms => { waited = ms; }, log: l => out.push(l) });
  const said = out.join('\n');
  const block = n => {
    const start = out.findIndex(l => l.startsWith(`${n}. `));
    const next = out.findIndex(l => l.startsWith(`${n + 1}. `));
    return out.slice(start, next >= 0 ? next : out.length - 2).filter(l => l !== '');
  };

  check('download-twice: every link once, one wait of 65 seconds, then the second downloads',
    [waited, served[`${REPORT_PAGE}&pdf=6`], served['https://down.example/gone.pdf']], [65000, 2, 1]);
  check('the counts', tally, { links: 4, bytesDiffer: 2, textDiffers: 1, failed: 1 });
  const b1 = block(1);
  check('a rebuilt Method PDF: found through the report page, bytes differ, its stamps and file ID moved, the text is the same',
    [b1[0], /^ {3}bytes {3}DIFFERENT/.test(b1[1]), b1.some(l => /^ {3}created {2}.*20260906154258.*→.*20261001221503/.test(l)),
     b1.some(l => /^ {3}file ID .*→/.test(l) && !/\(same\)$/.test(l)), /^ {3}text {4}SAME/.test(b1.find(l => /^ {3}text/.test(l)))],
    ['1. coaportal.com   Method Testing Labs   lab ID 2608CBR0160-002', true, true, true, true]);
  check('...and what that means for the archive today',
    b1[b1.length - 1], '   so      rebuilt on download, same text: today every download is stored as a new document');
  const b2 = block(2);
  check('a viewer page whose PDF is the same file twice: the same bytes, the same text',
    [b2[0], /^ {3}bytes {3}SAME/.test(b2[1]), b2[b2.length - 1]],
    ['2. yourcoa.com   Kaycha Labs   lab ID MI60617015-004', true, '   so      the same file both times: one document per report, as the archive is keyed today']);
  const b3 = block(3);
  const differing = b3.map(l => /^ {5}([-+]) +(\d+) {2}(.*)$/.exec(l)).filter(Boolean);
  check('a text that changes: the differing lines, as extracted, at one line number - and nothing else',
    [differing.map(m => [m[1], m[3]]), differing.length === 2 && differing[0][2] === differing[1][2]],
    [[['-', CHANGED_LINE], ['+', `${CHANGED_LINE} 10/01/26 6:15 PM`]], true]);
  check('...and the verdict for it', b3[b3.length - 1], '   so      rebuilt on download AND the text changed: its copies cannot be recognised by their text');
  check('a link that fails says so and is counted', block(4)[0], '4. down.example   FAILED on the first download: the server answered 404');
  check('it ends with the tally and STOP when a text changed',
    out.slice(-2), ['4 links: bytes differed for 2, text differed for 1, 1 failed', 'STOP: a text changed between downloads - bring the lines above.']);
  check('a link is printed as its host only - never its path or query, never a full fingerprint',
    [said.includes('SECRET-TOKEN'), said.includes('/reports/'), said.includes('sample='), said.includes(crypto.createHash('sha256').update(method).digest('hex'))],
    [false, false, false, false]);

  check('rebuilt(): a Method PDF made again reads exactly as before',
    [(await extractCoaText(method)).text === (await extractCoaText(methodAgain)).text, method.length === methodAgain.length,
     Buffer.compare(method, methodAgain) !== 0], [true, true, true]);
  check('diffLines: same, one changed, one added, one removed', [
    twice.diffLines(['a', 'b'], ['a', 'b']),
    twice.diffLines(['a', 'b', 'c'], ['a', 'x', 'c']),
    twice.diffLines(['a', 'c'], ['a', 'b', 'c']),
    twice.diffLines(['a', 'b', 'c'], ['a', 'c'])
  ], [[], [{ side: '-', n: 2, line: 'b' }, { side: '+', n: 2, line: 'x' }], [{ side: '+', n: 2, line: 'b' }], [{ side: '-', n: 2, line: 'b' }]]);

  const tUsage = argv => { try { twice.parseArgs(argv); return null; } catch (e) { return e instanceof twice.UsageError; } };
  check('download-twice arguments', [twice.parseArgs(['https://a.example/x.pdf']), twice.parseArgs(['--wait', '5', 'https://a.example/x.pdf', 'https://b.example/']),
    tUsage([]), tUsage(['--wait']), tUsage(['--wait', 'x', 'https://a.example/']), tUsage(['http://a.example/x.pdf']), tUsage(['not a link']), tUsage(['--fast', 'https://a.example/'])],
    [{ wait: 65, links: ['https://a.example/x.pdf'] }, { wait: 5, links: ['https://a.example/x.pdf', 'https://b.example/'] }, true, true, true, true, true, true]);

  /* The command lines refuse before touching anything. */
  const bare = { PATH: process.env.PATH, HOME: process.env.HOME || os.tmpdir() };
  const cli = (script, args) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], { env: bare, encoding: 'utf8', timeout: 20000 });
  const refused = cli('duplicates.js', []);
  check('duplicates.js with no secrets refuses', refused.status === 1 && /^REFUSED: NOSE_DB_URL.* not set/.test(refused.stderr), true);
  const badDup = cli('duplicates.js', ['--everything']);
  check('duplicates.js with an unknown option prints its usage', badDup.status === 2 && /usage: node scripts\/duplicates\.js/.test(badDup.stderr), true);
  const badTwice = cli('download-twice.js', []);
  check('download-twice.js with no link prints its usage', badTwice.status === 2 && /usage: node scripts\/download-twice\.js/.test(badTwice.stderr), true);

  check('neither script writes: no insert, update, delete, storeScan or saveScan in either',
    ['scripts/duplicates.js', 'scripts/download-twice.js'].filter(f => /\b(insert|update|delete)\s|storeScan|saveScan|save_scan/i
      .test(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))), []);

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
  catch (e) { console.error('duplicates-test threw:', e && e.stack); await pg.close(); process.exit(1); }
  await pg.close();
  if (failures) {
    console.error(`\nduplicates-test: ${failures} failure${failures === 1 ? '' : 's'}`);
    process.exit(1);
  }
  console.log('\nduplicates clean');
}

module.exports = { run, rebuilt };
if (require.main === module) main();

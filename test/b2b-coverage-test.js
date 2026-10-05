#!/usr/bin/env node
'use strict';
/* NOSE - scripts/b2b-coverage.js, the dispensary coverage report, offline.
 *
 *   node test/b2b-coverage-test.js      -> "b2b-coverage clean", or FAIL lines and exit 1
 *
 * The catalog in test/fixtures/b2b/catalog.csv is read end to end: its links
 * are answered by a stand-in fetch from fixture PDFs and portal pages that git
 * already tracks, through the real chain (lib/fetch-report.js), the real
 * extractor and the real parser - only the network is stood in for, as in
 * test/duplicates-test.js. Then the report it writes is read back.
 *
 * What it pins down:
 *   - an accepted read, with its total and top three as share of total
 *     through normalize(), and numbers for accepted reads only
 *   - a refusal, with the parser's rejectReasons verbatim; a PDF that cannot
 *     be read, with the scanner's sentence
 *   - a missing link, and failed fetches: a 404, a private address (never
 *     requested), a redirect to one, a plain-http link, a link that hangs
 *     until coa.js's deadline - each in the words coa.js's handler gives for
 *     the same link
 *   - the three flags, never fixes: a category mismatch (and a pre-roll that
 *     is flower to the parser, not flagged), a batch the report does not name
 *     (spaces and letter case aside), one link on two batches (out of stock
 *     too)
 *   - counts by category and by lab with the denominator beside every share;
 *     out-of-stock rows and refused rows never fetched; --limit
 *   - one link at a time, with the pause between
 *   - a file refused, before any row is read, for an unknown column (by
 *     name), a personal-looking column, and the other ways a file fails
 *   - storeScan, saveScan and archiveScan never reached; coa.js, lib/archive.js,
 *     lib/pdf-store.js, pg and @netlify/blobs never loaded; nothing written
 *     outside the report folder
 *   - one copy of the fetch chain, and the scanner's steps restated in the
 *     script still matching coa.js
 *
 * Needs `npm install` (unpdf) and the committed fixture PDFs. Nothing it does
 * reaches the network, a database or Netlify.
 */

delete process.env.NOSE_DB_URL;
delete process.env.NOSE_DB_ADMIN_URL;

const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify/functions/lib');
const FIX = path.join(ROOT, 'test/fixtures/b2b');
const SCRIPT = path.join(ROOT, 'scripts/b2b-coverage.js');
const COA = path.join(ROOT, 'netlify/functions/coa.js');
const ARCHIVE = path.join(LIB, 'archive.js');
const PDF_STORE = path.join(LIB, 'pdf-store.js');
const STORE = path.join(LIB, 'store.js');
const FETCH_REPORT = path.join(LIB, 'fetch-report.js');

/* A run that stops on a promise nothing keeps alive exits 0 quietly. Only
 * reaching the end counts. */
let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) {
    process.stderr.write('b2b-coverage: stopped before the last check - NOT clean\n');
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

/* --- before the script loads: stand-ins that record any use of the archive -- */

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
const store = require(STORE);
const realSaveScan = store.saveScan;
store.saveScan = (...a) => { archiveCalls.push('store.saveScan()'); return realSaveScan(...a); };

/* Every module anything asks for while the script runs. */
const loads = [];
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  try { loads.push(Module._resolveFilename(request, parent, isMain)); } catch { loads.push(request); }
  return originalLoad.apply(this, arguments);
};

const cov = require(SCRIPT);
const version = require(path.join(LIB, 'version.js'));

/* --- the network, stood in for ------------------------------------------- */

const pdf = n => fs.readFileSync(path.join(ROOT, 'test/fixtures/pdf', `${n}.pdf`));
const page = n => fs.readFileSync(path.join(ROOT, 'test/fixtures/pages', n));
const html = s => Buffer.from(`<!doctype html><html><body>${s}</body></html>${' '.repeat(600)}`);
const BROKEN = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(900, 0x41)]);
const LISTINGS = 'https://coaportal.com/sunburn/listings/?search=5637041429622699';
const REPORT = 'https://coaportal.com/sunburn/report/?search=Sunburn-5637041429622699-2608CBR0160-002';
const SERVED = {
  'https://yourcoa.com/coa/coa-view?sample=MI60617015-004': () => html('<iframe src="/pdfjs/web/viewer.html"></iframe>'),
  'https://yourcoa.com/coa/coa-download/MI60617015-004?wl_id=0&mrk=0&is_view=1': () => pdf('Grease_Monkey_cart'),
  'https://coa.example/acs/ACS-FLW-002.pdf': () => pdf('ACS-FLW-002'),
  'https://coa.example/kaycha/KAY-PRR-001.pdf': () => pdf('KAY-PRR-001'),
  'https://coa.example/kaycha/KAY-LRS-002.pdf': () => pdf('KAY-LRS-002'),
  'https://coa.example/kaycha/KAY-CAR-001.pdf': () => pdf('KAY-CAR-001'),
  'https://coa.example/kaycha/KAY-FLW-001.pdf': () => pdf('KAY-FLW-001'),
  'https://coa.example/terplife/GreenRoads.pdf': () => pdf('GreenRoadsFullSpectrumCBDOil750mgLot24007'),
  'https://coa.example/broken.pdf': () => BROKEN,
  'https://coa.example/kaycha/KAY-AIO-001.pdf': () => pdf('KAY-AIO-001'),
  /* fetch is handed the URL with its fragment; a real one sends none of it */
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
const HANGS = new Set(['https://coa.example/hangs.pdf']);
/* A viewer page that answers after 5 seconds, whose report never answers:
   the link's 8-second budget ends it 3 seconds into the second request. */
const SLOW = { 'https://coa.example/slow-page': 5000 };
const SLOW_PAGE = () => html('<a href="/hangs.pdf">the report</a>');

const timeline = [];
let active = 0;
let mostAtOnce = 0;
async function standInFetch(url, opts = {}) {
  timeline.push(`fetch ${url}`);
  active++;
  mostAtOnce = Math.max(mostAtOnce, active);
  try {
    await new Promise(r => setImmediate(r));
    if (SLOW[url]) {
      return await new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve(new Response(SLOW_PAGE(), { status: 200 })), SLOW[url]);
        opts.signal.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })); });
      });
    }
    if (HANGS.has(url)) {
      return await new Promise((_, reject) => opts.signal.addEventListener('abort',
        () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }))));
    }
    if (REDIRECTS[url]) return new Response(null, { status: 302, headers: { location: REDIRECTS[url] } });
    const body = SERVED[url];
    return body ? new Response(body(), { status: 200 }) : new Response('nothing here', { status: 404 });
  } finally {
    active--;
  }
}
const requested = () => timeline.filter(t => t.startsWith('fetch ')).map(t => t.slice(6));

/* --- what the script writes, and where ------------------------------------ */

const WRITERS = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'rmdirSync', 'unlinkSync', 'renameSync',
                 'copyFileSync', 'createWriteStream', 'symlinkSync', 'truncateSync', 'mkdtempSync'];
const PROMISE_WRITERS = ['writeFile', 'appendFile', 'mkdir', 'rm', 'rmdir', 'unlink', 'rename', 'copyFile', 'truncate', 'mkdtemp'];
function watchWrites() {
  const written = [];
  const saved = [];
  const wrap = (obj, name) => {
    const orig = obj[name];
    if (typeof orig !== 'function') return;
    saved.push([obj, name, orig]);
    obj[name] = function (p, ...rest) { written.push(String(p)); return orig.call(this, p, ...rest); };
  };
  for (const n of WRITERS) wrap(fs, n);
  for (const n of PROMISE_WRITERS) wrap(fs.promises, n);
  const origOpen = fs.openSync;
  saved.push([fs, 'openSync', origOpen]);
  fs.openSync = function (p, flags, ...rest) {
    if (flags && /[wa+]/.test(String(flags))) written.push(String(p));
    return origOpen.call(this, p, flags, ...rest);
  };
  return { written, stop: () => { for (const [obj, name, orig] of saved) obj[name] = orig; } };
}

/* --- one run of the script, as the command line runs it ------------------- */

async function run(argv) {
  const out = [];
  const err = [];
  const pauses = [];
  const savedFetch = globalThis.fetch;
  globalThis.fetch = standInFetch;
  timeline.length = 0;
  const watch = watchWrites();
  let code;
  try {
    code = await cov.main(argv, {
      log: line => { out.push(line); timeline.push(`log ${line}`); },
      error: line => err.push(line),
      wait: async ms => { pauses.push(ms); timeline.push(`pause ${ms}`); }
    });
  } finally {
    watch.stop();
    globalThis.fetch = savedFetch;
  }
  return { code, out: out.join('\n'), err: err.join('\n'), pauses, written: watch.written, requests: requested(), timeline: [...timeline] };
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'b2b-coverage-test-'));
const inside = (dir, p) => { const r = path.relative(dir, path.resolve(p)); return !r.startsWith('..') && !path.isAbsolute(r); };
const EFFECT_WORDS = /\b(effects?|high|stoned|buzz\w*|relax\w*|energ\w*|calm\w*|focus\w*|sleep\w*|sedat\w*|uplift\w*|euphori\w*|mood\w*|potency|potent|strong(?:er)? hit)\b/i;

async function main() {
  const v = version.fromCheckout();
  if (!v.unpdf) {
    console.error('FAIL: unpdf is not installed - run: npm install');
    process.exit(1);
  }

  /* ================================================== the test catalog, whole */
  const outDir = tmp();
  const catalog = path.join(FIX, 'catalog.csv');
  const loadsBefore = loads.length;
  const r = await run([catalog, '--out', outDir]);
  const loadedDuring = loads.slice(loadsBefore);

  check('the run ends 0 and writes report.md and report.csv, nothing else, nowhere else',
    [r.code, fs.readdirSync(outDir).sort(), r.written.filter(p => !inside(outDir, p))], [0, ['report.csv', 'report.md'], []]);

  const md = fs.readFileSync(path.join(outDir, 'report.md'), 'utf8');
  const csvText = fs.readFileSync(path.join(outDir, 'report.csv'), 'utf8');
  check('report.csv starts with a byte-order mark and parses as CSV', [csvText.charCodeAt(0), !cov.parseCsv(csvText.slice(1)).error], [0xFEFF, true]);
  const recs = cov.parseCsv(csvText.slice(1)).records.filter(x => x.length > 1);
  const head = recs[0];
  const rows = Object.fromEntries(recs.slice(1).map(x => [x[0], Object.fromEntries(head.map((h, i) => [h, x[i]]))]));

  /* Every row of the file but the blank one, with what became of it. */
  const EXPECT = {
    2: 'accepted', 3: 'accepted', 4: 'accepted', 5: 'accepted', 6: 'accepted', 7: 'accepted', 8: 'refused', 9: 'refused',
    10: 'no link', 11: 'fetch failed', 12: 'fetch failed', 13: 'fetch failed', 14: 'accepted', 15: 'accepted',
    16: 'out of stock', 17: 'out of stock', 18: 'accepted', 19: 'row refused', 20: 'row refused', 21: 'accepted',
    22: 'accepted', 23: 'accepted', 24: 'fetch failed', 26: 'row refused'
  };
  check('report.csv: one line per row, the header counted as row 1, the blank row 25 left out, each row\'s outcome',
    Object.fromEntries(Object.entries(rows).map(([k, x]) => [k, x.outcome])), Object.fromEntries(Object.entries(EXPECT).map(([k, o]) => [k, o])));

  /* The counts, and a denominator beside every share. */
  check('the summary line: 12 of 19 in stock can be read',
    has(md, '**12 of 19 (63%)** in-stock inhalables have a terpene panel NOSE can read.') &&
    has(r.out, '12 of 19 (63%) in-stock inhalables have a terpene panel NOSE can read'), true);
  check('the summary table: refused, no link, fetch failed, each over the 19',
    ['| report refused | 2 of 19 (11%) |', '| no lab-report link in the catalog | 1 of 19 (5%) |', '| link could not be fetched | 4 of 19 (21%) |']
      .map(l => md.includes(l)), [true, true, true]);
  check('the rows the file holds: 25 after the header - 19 in stock, 2 out of stock, 3 refused, 1 blank',
    has(md, 'The file has 25 rows after its header: 19 in-stock batches, 2 out of stock (not fetched), 3 rows refused (listed at the end), and 1 blank row skipped.'), true);
  check('by category, each share over that category\'s batches (a pre-roll is its own row)', [
    '| flower | 9 | 7 of 9 (78%) | 0 of 9 (0%) | 1 of 9 (11%) | 1 of 9 (11%) |',
    '| pre-roll | 1 | 1 of 1 (100%) | 0 of 1 (0%) | 0 of 1 (0%) | 0 of 1 (0%) |',
    '| vape | 6 | 3 of 6 (50%) | 1 of 6 (17%) | 0 of 6 (0%) | 2 of 6 (33%) |',
    '| concentrate | 3 | 1 of 3 (33%) | 1 of 3 (33%) | 0 of 3 (0%) | 1 of 3 (33%) |'].map(l => md.includes(l)), [true, true, true, true]);
  check('by lab, as the parser read the lab; a link that gave no report counted apart, last', [
    '| Kaycha Labs | 9 | 9 of 9 (100%) |', '| ACS Laboratory | 1 | 1 of 1 (100%) |', '| Method Testing Labs | 1 | 1 of 1 (100%) |',
    '| Modern Canna | 1 | 1 of 1 (100%) |', '| TerpLife Labs | 1 | 0 of 1 (0%) | 1 of 1 (100%) |',
    '| (no report read) | 6 | 0 of 6 (0%) | 1 of 6 (17%) | 1 of 6 (17%) | 4 of 6 (67%) |'].map(l => md.includes(l)),
    [true, true, true, true, true, true]);
  const labOrder = md.split('\n').filter(l => /^\| (Kaycha|ACS|Method|Modern|TerpLife|\(no report)/.test(l)).map(l => l.split(' | ')[0].slice(2));
  check('labs by batches, then by name', labOrder,
    ['Kaycha Labs', 'ACS Laboratory', 'Method Testing Labs', 'Modern Canna', 'TerpLife Labs', '(no report read)']);
  const unpaired = md.replace(/\b\d+ of \d+ \(\d+%\)/g, '').match(/\(\d+%\)/g);
  check('every count share in report.md carries its denominator ("n of m (p%)")', unpaired, null);

  /* An accepted read: its numbers, through the app's own maths. */
  const { extractCoaText } = require(path.join(LIB, 'extract-text.js'));
  const { parseCoa } = require(path.join(LIB, 'parse-coa.js'));
  const M = require(path.join(ROOT, 'scripts/lib/match.js')).load();
  const readFixture = async n => parseCoa((await extractCoaText(pdf(n))).text);
  const car = await readFixture('KAY-CAR-001');
  const top = Object.entries(M.normalize(car.terps)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3);
  check('accepted (row 6, KAY-CAR-001): the lab\'s printed total and the top three as share of total, from normalize()',
    [rows[6].lab, rows[6].total_terpenes_percent, rows[6].top_1, rows[6].top_1_share, rows[6].top_2, rows[6].top_2_share, rows[6].top_3, rows[6].top_3_share],
    ['Kaycha Labs', '4.124', ...top.flatMap(([k, s]) => [M.TERPENES[k].name, `${(s * 100).toFixed(1)}%`])]);
  const [k1, s1] = top[0];
  check('...a share of the modelled terpenes, not of the printed total: they differ on this report',
    rows[6].top_1_share !== `${((car.terps[k1] / car.totalTerpenes) * 100).toFixed(1)}%` && Math.abs(s1 - car.terps[k1] / car.totalTerpenes) > 0.001, true);
  check('the accepted rows: the viewer page (Kaycha), the portal two pages deep (Method), every lab read',
    [rows[2].lab, rows[2].report_lab_id, rows[22].lab, rows[22].report_lab_id, rows[23].lab],
    ['Kaycha Labs', 'MI60617015-004', 'Method Testing Labs', '2608CBR0160-002', 'Modern Canna']);
  const mcl = await readFixture('MCL-FLW-002');
  check('an accepted read keeps the card\'s notes: MCL-FLW-002\'s warning, word for word', [rows[23].notes, mcl.warnings.length], [mcl.warnings.join(' '), 1]);
  check('numbers only for accepted reads: no total and no share on any other row',
    Object.values(rows).filter(x => x.outcome !== 'accepted' && (x.total_terpenes_percent || x.top_1 || x.top_1_share || x.notes)).map(x => x.row), []);
  const terpeneNames = Object.values(M.TERPENES).map(t => t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const numberLines = md.split('\n').filter(l => new RegExp(`(${terpeneNames.join('|')}) \\d`).test(l));
  const acceptedRows = Object.keys(EXPECT).filter(k => EXPECT[k] === 'accepted');
  check('report.md: terpene figures appear only on the lines of accepted rows, one line each',
    numberLines.map(l => l.split(' | ')[0].slice(2)).sort(), [...acceptedRows].sort());

  /* A refusal, verbatim; a PDF that cannot be read, in the scanner's words. */
  const green = await readFixture('GreenRoadsFullSpectrumCBDOil750mgLot24007');
  check('refused (row 8): the parser\'s rejectReasons, verbatim, in report.csv and report.md',
    [rows[8].reason, green.rejectReasons.length > 0, green.rejectReasons.every(x => md.includes(`- ${x} - 1 batch: row 8`))],
    [green.rejectReasons.join('; '), true, true]);
  check('refused (row 9): a PDF that cannot be read, in the scanner\'s own sentence, with no lab',
    [rows[9].reason, rows[9].lab], [cov.SCANNER.unreadable, '']);

  /* No link; failed fetches. */
  check('no link (row 10): counted, nothing requested', [rows[10].outcome, rows[10].link_host], ['no link', '']);
  check('fetch failed: the 404, the private address, the redirect to one, the plain-http link',
    [rows[11].reason, rows[12].reason, rows[13].reason, rows[24].reason],
    ['The lab server returned 404 for that link.', 'That address points to a private network, not a public lab report.',
     'That link redirects somewhere it should not.', 'Only secure https links can be fetched.']);
  check('the private address and the plain-http link were never requested; the redirect was not followed',
    r.requests.filter(u => /169\.254|10\.0\.0\.7|^http:/.test(u)), []);

  /* Flagged, never fixed. */
  const flags = x => x.flags;
  check('category: a vape report listed as flower, and a tincture listed as concentrate, flagged', [flags(rows[6]), has(flags(rows[8]), 'the report reads as tincture; the catalog says concentrate')],
    ['the report reads as vape; the catalog says flower', true]);
  check('category: a pre-roll whose report reads as flower is not flagged; nor are the matching rows',
    [2, 3, 4, 5, 7, 14, 18, 21, 22, 23].filter(k => /the report reads as|which form/.test(flags(rows[k]))), []);
  check('batch: the report names another batch (row 7), names none (row 8), or another lab ID (row 15)',
    [has(flags(rows[7]), 'do not contain "TLGF0127202699HS"'), has(flags(rows[8]), 'NOSE read no batch or lab ID on the report'),
     has(flags(rows[15]), 'lab ID "MI60403006-004" do not contain "MI60403006-005"')], [true, true, true]);
  check('batch: spaces and letter case aside (rows 3 and 5), or the lab ID (row 4), names the batch - not flagged',
    [3, 4, 5].filter(k => /contain|no batch or lab ID/.test(flags(rows[k]))), []);
  check('one link on two batches: rows 14 and 15 (the same link with "#page=1"), rows 17 (out of stock) and 18',
    [has(flags(rows[14]), 'row 15 (batch "MI60403006-005")'), has(flags(rows[15]), 'row 14 (batch "MI60403006-004")'),
     has(flags(rows[18]), 'row 17 (batch "MI60618012-001", out of stock)'), has(flags(rows[17]), 'row 18 (batch "MI60618012-002")'),
     has(md, '### One link on more than one batch: 2')], [true, true, true, true, true]);
  check('flags are counted in report.md',
    [has(md, '### The report\'s form is not the catalog\'s category: 2'), has(md, '### The report does not name the batch: 3')], [true, true]);

  /* What is never fetched, and how the rest is. */
  check('out-of-stock rows and refused rows are never fetched',
    r.requests.filter(u => /KAY-LRS-001|hemp-bombs/.test(u)).length + r.requests.filter(u => u === 'https://coa.example/kaycha/Kush_Creek.pdf').length, 1);
  check('refused rows: listed with every reason, counted apart', [
    has(md, 'row 19 (batch "B-EDIBLE-1"): category "edible" is not flower, pre-roll, vape or concentrate; route "oral" is not smoking or inhalation'),
    has(md, 'row 20 (batch "1006183791109527"): batch_id is already on row 3 - one row per batch'),
    has(md, 'row 26 (batch "MI60618012-003"): cbd_percent "ND" is not a number from 0 to 100')], [true, true, true]);
  const progress = r.timeline.filter(t => t.startsWith('log ') && / row \d+ /.test(t)).length;
  check('one link at a time: never two requests open together', mostAtOnce, 1);
  /* 18 links tried; 16 of them requested - validateUrl refuses rows 12 and 24
     unasked - so 15 pauses, each straight before a request. */
  const types = r.timeline.map(t => t.split(' ')[0]);
  check(`a ${cov.PAUSE_MS}ms pause before every request but the first, and nowhere else`,
    [progress, r.pauses.length, r.pauses.every(ms => ms === cov.PAUSE_MS), types[0],
     types.every((t, i) => t !== 'pause' || types[i + 1] === 'fetch')], [18, 15, true, 'fetch', true]);

  /* Spreadsheet safety, and nothing an address could leak. */
  check('a name that would run as a spreadsheet formula is written as text; the pipe and quotes are kept',
    [rows[21].name, has(md, '| 21 | 9944038602845567 | flower | =1+1 Lemon \\| "Tart", Pucker |')], ['\'=1+1 Lemon | "Tart", Pucker', true]);
  check('links are shown by host only: no path, query or token from any link in either file',
    [/coa-view\?sample|\/kaycha\/|meta-data|redirect-inside|\?search=/.test(md + csvText), rows[2].link_host, rows[12].link_host],
    [false, 'yourcoa.com', '169.254.169.254']);
  check('no effect wording in the report, the script, the format document or this catalog',
    [md, csvText, fs.readFileSync(SCRIPT, 'utf8'), fs.readFileSync(path.join(ROOT, 'docs/B2B-CATALOG-FORMAT.md'), 'utf8'),
     fs.readFileSync(catalog, 'utf8')].map(t => EFFECT_WORDS.test(t)), [false, false, false, false, false]);

  /* Nothing reached the archive. */
  check('storeScan, saveScan, archiveScan: never reached; the archive stand-ins were never touched', archiveCalls, []);
  check('coa.js, lib/archive.js, lib/pdf-store.js, pg and @netlify/blobs: never loaded while the report ran',
    loadedDuring.filter(f => [COA, ARCHIVE, PDF_STORE].includes(f) || /node_modules[\\/](pg|@netlify[\\/]blobs)[\\/]/.test(f)), []);
  check('...and the fetch went through lib/fetch-report.js, required by the script', require.cache[FETCH_REPORT] !== undefined
    && Object.keys(require.cache).filter(f => f === COA).length === 0, true);
  fs.rmSync(outDir, { recursive: true, force: true });

  /* ============================================== the same links through coa.js */
  /* The scanner itself, given the same links by the same stand-in fetch, says
     the same words. coa.js is loaded only now, with the real archive module,
     pinned to dev so nothing is stored. */
  delete require.cache[ARCHIVE];
  delete require.cache[PDF_STORE];
  version.pin({ parserVersion: 'dev', extractorVersion: 'dev', deployContext: 'dev' });
  const coa = require(COA);
  const handlerSays = async url => {
    const saved = globalThis.fetch;
    globalThis.fetch = standInFetch;
    try {
      const reply = await coa.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ url }) });
      return JSON.parse(reply.body);
    } finally { globalThis.fetch = saved; }
  };
  const said = {};
  for (const [row, url] of [[11, 'https://coa.example/gone.pdf'], [12, 'https://169.254.169.254/latest/meta-data/'],
                            [13, 'https://coa.example/redirect-inside'], [24, 'http://coa.example/kaycha/KAY-CAR-002.pdf'],
                            [9, 'https://coa.example/broken.pdf']]) said[row] = (await handlerSays(url)).error;
  const greenReply = await handlerSays('https://coa.example/terplife/GreenRoads.pdf');
  check('coa.js\'s handler gives the same words for the same links: every failed fetch, the unreadable PDF',
    [11, 12, 13, 24, 9].map(k => said[k] === rows[k].reason), [true, true, true, true, true]);
  check('...and the same reasons for the refused report', greenReply.reasons.join('; '), rows[8].reason);

  /* =========================================================== --limit */
  const limitDir = tmp();
  const lim = await run([catalog, '--out', limitDir, '--limit', '3']);
  const limMd = fs.readFileSync(path.join(limitDir, 'report.md'), 'utf8');
  const limRows = cov.parseCsv(fs.readFileSync(path.join(limitDir, 'report.csv'), 'utf8').slice(1)).records.slice(1).filter(x => x.length > 1);
  check('--limit 3: three links fetched, the other 15 in-stock batches with a link not fetched, and the report says so',
    [lim.code, limRows.filter(x => x[8] === 'accepted').length, limRows.filter(x => x[8] === 'not fetched').length,
     has(limMd, '**A partial run.** `--limit 3` tried the first 3 links; 15 in-stock batches with a link were not fetched'),
     has(limMd, '| not fetched (--limit) | 15 of 19 (79%) |'), lim.pauses.length],
    [0, 3, 15, true, true, 2]);
  fs.rmSync(limitDir, { recursive: true, force: true });

  /* ===================================== a slow link: coa.js's deadlines */
  /* One budget for the whole link, not per request: a page that takes 5
     seconds, then a report that never answers, ends 8 seconds in - not 5 + 7.5. */
  const slowDir = tmp();
  const slowCsv = path.join(slowDir, 'slow.csv');
  fs.writeFileSync(slowCsv, `${cov.COLUMNS.join(',')}\nP-1,B-1,vape,inhalation,Slow Cart,Brand,https://coa.example/slow-page,yes,,,\n`);
  const t0 = Date.now();
  const slow = await run([slowCsv, '--out', path.join(slowDir, 'out')]);
  const took = Date.now() - t0;
  const { LIMITS } = require(FETCH_REPORT);
  const slowRow = cov.parseCsv(fs.readFileSync(path.join(slowDir, 'out/report.csv'), 'utf8').slice(1)).records[1];
  check(`a slow link ends within coa.js's own budget (${LIMITS.TOTAL_BUDGET_MS}ms a link, ${LIMITS.TIMEOUT_MS}ms a request), in its words`,
    [slow.code, slow.requests, slowRow[8], slowRow[9], took >= LIMITS.TOTAL_BUDGET_MS - 100 && took < LIMITS.TOTAL_BUDGET_MS + 1500],
    [0, ['https://coa.example/slow-page', 'https://coa.example/hangs.pdf'], 'fetch failed', 'The lab server took too long to respond.', true]);
  fs.rmSync(slowDir, { recursive: true, force: true });

  /* ======================================== files refused before any row */
  const refusedRun = async (file, outDir) => {
    const x = await run([file, '--out', outDir]);
    return { ...x, made: fs.existsSync(outDir) };
  };
  const nowhere = path.join(os.tmpdir(), `b2b-coverage-test-never-${process.pid}`);
  const unknown = await refusedRun(path.join(FIX, 'catalog-unknown.csv'), nowhere);
  check('an unknown column refuses the file, by name: nothing fetched, nothing written',
    [unknown.code, has(unknown.err, 'refused: a column outside the format: "size"'), unknown.requests.length, unknown.made, unknown.written.length],
    [1, true, 0, false, 0]);
  const personal = await refusedRun(path.join(FIX, 'catalog-personal.csv'), nowhere);
  check('a column that looks personal refuses the whole file before any row is read - named, its values never shown',
    [personal.code, has(personal.err, '"Customer E-mail"'), has(personal.err, 'so none of its rows was read'),
     /pat\.example|example\.com|Cold Creek/.test(personal.err + personal.out), personal.requests.length, personal.made, personal.written.length],
    [1, true, true, false, 0, false, 0]);

  const header = cov.COLUMNS.join(',');
  const row1 = 'P-1,B-1,flower,smoking,Name,Brand,https://coa.example/kaycha/Kush_Creek.pdf,yes,,,';
  const refusalOf = text => cov.readCatalog(Buffer.isBuffer(text) ? text : Buffer.from(text)).refusal || null;
  check('other files refused whole: not UTF-8, a missing column, a column twice, empty, no header, a quote never closed', [
    refusalOf(Buffer.concat([Buffer.from(`${header}\nP-1,B-1,flower,smoking,Caf`), Buffer.from([0xE9]), Buffer.from(',Brand,,yes,,,\n')])),
    refusalOf(`${header.replace(',route', '')}\n`), refusalOf(`${header},name\n`), refusalOf(''), refusalOf(`\n${header}\n${row1}\n`),
    refusalOf(`${header}\n${row1.replace('Name', '"Name')}\n`)].map(x => (x || '').replace(/ Nothing in the file was used\..*$/, '')), [
    'refused: the file is not UTF-8 text - save it as "CSV UTF-8".', 'refused: a column is missing: "route".',
    'refused: a column appears more than once: "name".', 'refused: the file is empty.', 'refused: the first line is not a header row.',
    'refused: the file ends inside a quoted value - a double quote is never closed.']);
  check('a refusal names the format document and says nothing in the file was used',
    has(refusalOf(`${header},size\n`), 'Nothing in the file was used. The format is docs/B2B-CATALOG-FORMAT.md.'), true);

  check('looks personal: the store\'s keys and the seven words, in any case or spelling, as a part or the whole', [
    'customer_id', 'CustomerName', 'Patient', 'patient_dob', 'DOB', 'card_number', 'Loyalty Card', 'Driver License', 'licence no',
    'Mailing Address', 'IP', 'clientIp', 'ip address', 'user-agent', 'E-mail', 'email_address', 'Phone Number', 'palate',
    'session id', 'deviceID', 'Account_ID', 'userid'].filter(n => !cov.looksPersonal(n)), []);
  check('...and not: zip, shipping, description, a dob-like word, or any column of the format',
    ['zip', 'shipping', 'description', 'adobe', 'tip', ...cov.COLUMNS].filter(n => cov.looksPersonal(n)), []);
  check('every word the store refuses is one this script refuses', require(STORE).PERSONAL_KEYS.filter(k => !cov.PERSONAL_WORDS.includes(k)), []);

  /* ===================================================== reading the file */
  const lf = fs.readFileSync(catalog);
  const crlf = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(lf.toString('utf8').replace(/\n/g, '\r\n'))]);
  check('CRLF and a byte-order mark read exactly as LF does', JSON.stringify(cov.readCatalog(crlf)), JSON.stringify(cov.readCatalog(lf)));
  check('header names: letter case and spaces around them aside', !cov.readCatalog(Buffer.from(
    `${cov.COLUMNS.map(c => ` ${c.toUpperCase()} `).join(',')}\n${row1}\n`)).refusal, true);
  check('CSV: quoted commas, doubled quotes, a line break inside quotes, and a trailing comma',
    cov.parseCsv('a,"b, c","d ""e""","f\ng",\r\nh'), { records: [['a', 'b, c', 'd "e"', 'f\ng', ''], ['h']] });
  const odd = cov.readCatalog(Buffer.from(`${header}\nP-1,B-1,Flower,SMOKING,Name,,,YES,http://shop.example/x,101,5\nP-2,B-2\n`));
  check('row checks: case aside in the three lists; a plain-http product_url, a percent over 100, too few values',
    odd.rows.map(x => [x.row, x.reasons]), [[2, ['product_url is not an https address', 'thc_percent "101" is not a number from 0 to 100']],
      [3, ['has 2 values; the header has 11']]]);

  /* ======================================================= the command line */
  const bare = { PATH: process.env.PATH, HOME: process.env.HOME || os.tmpdir() };
  const cli = args => spawnSync(process.execPath, [SCRIPT, ...args], { env: bare, encoding: 'utf8', timeout: 30000, cwd: ROOT });
  const usage = [[], ['--limit', '0', 'x.csv'], ['--limit'], ['x.csv', '--out'], ['--everything', 'x.csv'], ['a.csv', 'b.csv']].map(cli);
  check('usage errors exit 2 with the usage line', usage.map(u => [u.status, has(u.stderr, cov.USAGE)]), usage.map(() => [2, true]));
  const cliRefused = cli([path.join(FIX, 'catalog-personal.csv'), '--out', nowhere]);
  check('from the command line: a refused file exits 1, says why, writes nothing',
    [cliRefused.status, has(cliRefused.stderr, 'looks like it is about a person'), fs.existsSync(nowhere)], [1, true, false]);
  check('the default folder is b2b-out/ at the top of the repo, and git ignores it',
    [cov.DEFAULT_OUT, spawnSync('git', ['check-ignore', '-q', 'b2b-out/report.md'], { cwd: ROOT }).status], [path.join(ROOT, 'b2b-out'), 0]);

  /* ===================================== one chain, and the scanner's steps */
  const fr = require(FETCH_REPORT);
  check('coa.js\'s _resolvePdfFromPage is fetch-report.js\'s own function, not a copy', coa._resolvePdfFromPage === fr.resolvePdfFromPage, true);
  const CHAIN = /\bfunction\s+(validateUrl|isBlockedHost|fetchOnce|fetchPdf|resolvePdfFromPage)\s*\(/;
  const holders = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(c|m)?js$/.test(e.name) && CHAIN.test(fs.readFileSync(p, 'utf8'))) holders.push(path.relative(ROOT, p));
    }
  })(path.join(ROOT, 'netlify'));
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(c|m)?js$/.test(e.name) && CHAIN.test(fs.readFileSync(p, 'utf8'))) holders.push(path.relative(ROOT, p));
    }
  })(path.join(ROOT, 'scripts'));
  check('the fetch chain has one home: only lib/fetch-report.js defines it, under netlify/ and scripts/', holders, ['netlify/functions/lib/fetch-report.js']);
  const coaSrc = fs.readFileSync(COA, 'utf8');
  check('coa.js requires the chain, and still applies the steps this script restates: the 200-character floor, the three sentences, an empty UNSAFE_UNDER_UNPDF',
    [/require\('\.\/lib\/fetch-report'\)/.test(coaSrc), coaSrc.includes(`text.length < ${cov.MIN_TEXT})`),
     [cov.SCANNER.unreadable, cov.SCANNER.noText, cov.SCANNER.unparsed, cov.SCANNER.refused].every(s => coaSrc.includes(`'${s}'`)),
     /const UNSAFE_UNDER_UNPDF = \[\s*\];/.test(coaSrc)], [true, true, true, true]);
  const bundle = fs.readdirSync(path.join(ROOT, 'js')).filter(f => /^nose\.[0-9a-f]{8}\.js$/.test(f));
  check('the novelty line is the one the app\'s card publishes', bundle.length === 1 &&
    fs.readFileSync(path.join(ROOT, 'js', bundle[0]), 'utf8').includes(cov.NOVELTY_LINE.replace(/'/g, '\\\'')), true);
  const code = fs.readFileSync(SCRIPT, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('the script names no archive, store or database: storeScan, saveScan, archiveScan, coa.js, archive.js, pdf-store, NOSE_DB_URL, SQL writes',
    /storeScan|saveScan|archiveScan|(?<![-\w])coa\.js|(?<![-\w])archive\.js|pdf-store|NOSE_DB|\b(insert|update|delete)\s+(into|from|nose)/i.test(code), false);

  /* ================================================ the format document */
  const doc = fs.readFileSync(path.join(ROOT, 'docs/B2B-CATALOG-FORMAT.md'), 'utf8');
  check('the format document names every column, every value list and every personal word, as the script reads them', [
    cov.COLUMNS.filter(c => !doc.includes(`| \`${c}\` | ${cov.REQUIRED.includes(c) ? 'yes' : 'no'} |`)),
    cov.CATEGORIES.filter(c => !doc.includes(`\`${c}\``)), ['smoking', 'inhalation', 'yes', 'no'].filter(c => !doc.includes(`\`${c}\``)),
    cov.PERSONAL_WORDS.filter(w => !doc.includes(`\`${w}\``))], [[], [], [], []]);

  finished = true;
  if (failures) {
    console.log(`\n${failures} check${failures === 1 ? '' : 's'} failed - b2b-coverage NOT clean`);
    process.exitCode = 1;
  } else {
    console.log('\nb2b-coverage clean');
  }
}

main().catch(e => {
  finished = true;
  console.error('b2b-coverage-test threw:', e && e.stack);
  process.exitCode = 1;
});

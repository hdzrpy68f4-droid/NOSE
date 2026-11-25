#!/usr/bin/env node
'use strict';
/* NOSE - a reading is never one row out, and never ten times high.
 * PARSER-HANDOFF s13, "The parser reviewed: shifted rows and weight units".
 *
 *   node test/shifted-rows-test.js    -> "shifted-rows clean", or FAIL lines and exit 1
 *
 * Four ways the parser accepted a believable wrong reading until 2026-11-16,
 * each found on made-up reports - no fixture has any of these layouts:
 *
 *   1. name / limit / result, an inline total, no verdict column. The backward
 *      reader compared itself with the FIRST cell after each name - the
 *      limits, which sum to almost nothing - won by the margin, and gave each
 *      terpene the result of the row above it.
 *   2. name / result under a small stray figure, the last row without a
 *      result. Cell for cell that is a value-first table, and the edge test
 *      read it backward: every value one row out.
 *   3. a table printed in mg/g alone. It reconciles against its own mg/g
 *      total and read as percentages, ten times high.
 *   4. an inline total printing both units, "20.00 mg/g (2.000%)", over rows
 *      of mg/g then %. The total read 20, and the mg/g column reconciled.
 *
 * One cell per line, as test/summed-rows-test.js writes its reports. Eleven
 * rows summing to 2.000%.
 */
const path = require('path');
const { parseCoa } = require(path.join(__dirname, '..', 'netlify/functions/lib/parse-coa.js'));

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
}

const DESC = [
  ['beta-Myrcene', 0.612, 'myrcene'], ['Limonene', 0.431, 'limonene'], ['beta-Caryophyllene', 0.352, 'caryophyllene'],
  ['Linalool', 0.188, 'linalool'], ['alpha-Pinene', 0.121, 'pinene_a'], ['beta-Pinene', 0.094, 'pinene_b'],
  ['alpha-Humulene', 0.087, 'humulene'], ['Terpinolene', 0.041, 'terpinolene'], ['alpha-Bisabolol', 0.036, 'bisabolol'],
  ['Guaiol', 0.026, null], ['Camphene', 0.012, 'camphene'],
];
const ALPHA = DESC.slice().sort((a, b) => a[0].localeCompare(b[0]));
const f = v => v.toFixed(3);
const TOTAL = f(DESC.reduce((a, [, v]) => a + v, 0));   // 2.000
const HEAD = ['Some New Lab LLC', 'Certificate of Analysis', 'Matrix: Flower', 'Terpenes', 'Tested'];
const ORDER = 'NOSE cannot tell whether this report prints each figure before or after the name of its terpene, so it cannot be sure which figure belongs to which';
const WEIGHT = 'this report gives its terpene figures by weight (such as mg/g), not as percentages, and NOSE reads percentages only';

/* How many of the printed values the reading has wrong, or 'refused'. */
function read(lines, rows = DESC, scale = 1) {
  const r = parseCoa(lines.join('\n'));
  const wrong = rows.filter(([, v, k]) => k && (r.terps[k] == null || Math.abs(r.terps[k] - v * scale) > 1e-6)).length;
  return { r, wrong, state: r.usable ? (wrong ? `accepted with ${wrong} wrong` : 'correct') : 'refused' };
}
const cells = (rows, make) => rows.flatMap(make);

/* --- 1. name / limit / result ------------------------------------------- */
let x = read([...HEAD, 'Analyte', 'LOQ', 'Result', ...cells(DESC, ([n, v]) => [n, '0.010', f(v)]), `Total Terpenes: ${TOTAL}%`]);
check('name / limit / result with an inline total: every value on its own terpene, read forward',
  [x.state, x.r.readBy, x.r.totalTerpenes], ['correct', 'forward', 2]);
x = read([...HEAD, ...cells(DESC, ([n, v], i) => [n, f(0.010 + (i % 3) * 0.001), f(v)]), `Total Terpenes: ${TOTAL}%`]);
check('...with limits that differ by row', [x.state, x.r.readBy], ['correct', 'forward']);
x = read([...HEAD, ...cells(DESC, ([n, v]) => [n, '0.003', '0.010', f(v)]), `Total Terpenes: ${TOTAL}%`]);
check('name / LOD / LOQ / result', [x.state, x.r.readBy], ['correct', 'forward']);
x = read([...HEAD, ...cells(DESC, ([n, v]) => [n, f(v), '0.010']), `Total Terpenes: ${TOTAL}%`]);
check('name / result / limit', [x.state, x.r.readBy], ['correct', 'forward']);
x = read([...HEAD, ...cells(DESC, ([n, v]) => [n, '0.010', f(v)]), 'Nerolidol', '0.010', '<LOQ', 'Fenchol', '0.010', '<LOQ', `Total Terpenes: ${TOTAL}%`]);
check('name / limit / result with rows below the limit', [x.state, x.r.readBy], ['correct', 'forward']);

/* --- 2. a stray figure above, no result on the last row -------------------- */
const lastBlank = (rows, blank, make) => rows.flatMap((row, i) => (i === rows.length - 1 ? [row[0], blank] : make(row)));
const lessLast = rows => f(Number(TOTAL) - rows[rows.length - 1][1]);
for (const blank of ['N/A', 'NT', '-']) {
  x = read([...HEAD, 'LOQ', '0.010', ...lastBlank(DESC, blank, ([n, v]) => [n, f(v)]), `Total Terpenes: ${lessLast(DESC)}%`], DESC.slice(0, -1));
  check(`name / result under a stray 0.010, the last row "${blank}": never accepted one row out`,
    [x.state, x.r.rejectReasons.includes(ORDER)], ['refused', true]);
}
x = read([...HEAD, 'LOQ', '0.010', ...lastBlank(DESC, 'N/A', ([n, v]) => [n, '0.010', f(v)]), `Total Terpenes: ${lessLast(DESC)}%`], DESC.slice(0, -1));
check('name / limit / result under the same stray figure: refused the same way', [x.state, x.r.rejectReasons.includes(ORDER)], ['refused', true]);
x = read([...HEAD, ...cells(ALPHA, ([n, v]) => [f(v), n]), `Total Terpenes: ${TOTAL}%`], ALPHA);
check('a value-first table in alphabetical order whose total is NOT printed value-first: refused, not guessed',
  [x.state, x.r.rejectReasons.includes(ORDER)], ['refused', true]);

/* --- what must not change -------------------------------------------------- */
x = read([...HEAD, `${TOTAL}%`, 'Total Terpenes', 'Analyte', '%', ...cells(ALPHA, ([n, v]) => [f(v), n])], ALPHA);
check('a value-first table whose total is printed value-first too (Modern Canna\'s hand-roll layout): read backward, correct',
  [x.state, x.r.readBy], ['correct', 'backward']);
x = read([...HEAD, ...cells(DESC, ([n, v]) => [f(v), n]), `Total Terpenes: ${TOTAL}%`]);
check('a value-first table sorted largest first still wins by the margin', [x.state, x.r.readBy], ['correct', 'backward']);
x = read([...HEAD, ...cells(ALPHA, ([n, v]) => [n, f(v)]), `Total Terpenes: ${TOTAL}%`], ALPHA);
check('a plain name / result table is read forward', [x.state, x.r.readBy, x.r.rejectReasons], ['correct', 'forward', []]);
x = read([...HEAD, `Total Terpenes: ${TOTAL}%`, ...cells(ALPHA, ([n, v]) => [n, f(v)]), 'Cannabinoids', 'THCA', '24.1', 'CBDA', '0.05'], ALPHA);
check('...and with another table after it', [x.state, x.r.readBy], ['correct', 'forward']);

/* --- 3. a table in mg/g alone ---------------------------------------------- */
x = read(['Some New Lab LLC', 'Vape Cartridge', 'Terpenes', 'Tested', 'Analyte', 'Result (mg/g)',
  ...cells(DESC, ([n, v]) => [n, (v * 10).toFixed(2)]), 'Total Terpenes', (Number(TOTAL) * 10).toFixed(2)], DESC, 10);
check('a cartridge\'s table in mg/g alone, total 20.00: refused in a plain sentence, not read as 20%',
  [x.r.usable, x.r.rejectReasons], [false, [WEIGHT]]);
x = read([...HEAD, 'Analyte', 'mg/g', '%', ...cells(DESC, ([n, v]) => [n, (v * 10).toFixed(2), f(v)]), `Total Terpenes: ${TOTAL}%`]);
check('mg/g beside %: read, from the % column', [x.state, x.r.totalTerpenes], ['correct', 2]);
x = read([...HEAD, 'Analyte', '%', 'mg/g', ...cells(DESC, ([n, v]) => [n, f(v), (v * 10).toFixed(2)]), `Total Terpenes: ${TOTAL}%`]);
check('% beside mg/g: read, from the % column', [x.state, x.r.totalTerpenes], ['correct', 2]);

/* --- 4. an inline total in both units --------------------------------------- */
x = read([...HEAD, 'Analyte', 'mg/g', '%', ...cells(DESC, ([n, v]) => [n, (v * 10).toFixed(2), f(v)]),
  `Total Terpenes: ${(Number(TOTAL) * 10).toFixed(2)} mg/g (${TOTAL}%)`]);
check('"Total Terpenes: 20.00 mg/g (2.000%)" reads 2, and the rows their percentages',
  [x.state, x.r.totalTerpenes, x.r.warnings], ['correct', 2, []]);
x = read([...HEAD, ...cells(DESC, ([n, v]) => [n, f(v)]), `Total Terpenes: ${TOTAL}% (${(Number(TOTAL) * 10).toFixed(2)} mg/g)`]);
check('...and with the percentage printed first', [x.state, x.r.totalTerpenes], ['correct', 2]);
x = read([...HEAD, ...cells(DESC, ([n, v]) => [n, f(v)]), `Total Terpenes: ${(Number(TOTAL) * 10).toFixed(2)} mg/g`]);
check('a total in mg/g alone is still left unread, and the report refused',
  [x.r.usable, x.r.totalTerpenes], [false, null]);

/* --- 5. totals printed as tiles ---------------------------------------------- */
const TABLE = cells(DESC, ([n, v]) => [n, f(v)]);
x = read(['Some New Lab LLC', 'Matrix: Flower', 'Total THC', '24.1%', 'Total Terpenes', `${TOTAL}%`, 'Terpenes', 'Tested', ...TABLE]);
check('label-then-value tiles, "Total THC / 24.1% / Total Terpenes / 2.000%": the terpene total is its own figure, not the one above',
  [x.state, x.r.totalTerpenes], ['correct', 2]);
x = read(['Some New Lab LLC', 'Matrix: Flower', 'THCA', '27.3%', 'Total Terpenes', `${TOTAL}%`, 'Terpenes', 'Tested', ...TABLE]);
check('...and under a single cannabinoid\'s tile', [x.state, x.r.totalTerpenes], ['correct', 2]);
x = read(['Some New Lab LLC', 'Matrix: Flower', '24.1%', 'Total THC', `${TOTAL}%`, 'Total Terpenes', 'Analyte', '%', ...cells(ALPHA, ([n, v]) => [f(v), n])], ALPHA);
check('value-then-label tiles over a value-first table (Modern Canna\'s summary) read as before: the figure above the label',
  [x.state, x.r.totalTerpenes, x.r.readBy], ['correct', 2, 'backward']);

/* --- 6. a total that counts only the quantified rows (2026-11-20) ------------ */
/* Kaycha's template of late July 2026, as a real pre-roll prints it (KAY-PRR-002):
   each row WEIGHT / VOLUME / DILUTION / LOD / LOQ / % / mg per unit / [J] /
   TESTED, a figure for rows between the two limits (qualifier J), and TOTAL
   TERPENES leaving those rows out. On a 1 g unit the mg column is ten times
   the %. Until 2026-11-20 no column reconciled, the forward reading kept the
   figure printed last before TESTED, and every value read ten times high. */
const QUANT = [
  ['BETA-CARYOPHYLLENE', 0.391, 'caryophyllene'], ['LINALOOL', 0.239, 'linalool'], ['LIMONENE', 0.197, 'limonene'],
  ['ALPHA-HUMULENE', 0.129, 'humulene'], ['BETA-MYRCENE', 0.109, 'myrcene'], ['ALPHA-BISABOLOL', 0.087, 'bisabolol'],
  ['ALPHA-TERPINEOL', 0.063, 'terpineol'], ['FENCHYL ALCOHOL', 0.060, 'fenchol'], ['BETA-PINENE', 0.030, 'pinene_b'],
];   // 1.305, printed as 1.30
const BELOW = [   // between the limits: LOQ 0.0200, Borneol 0.0400
  ['BORNEOL', 0.021, null, '0.0400'], ['OCIMENE', 0.014, 'ocimene'], ['ALPHA-PINENE', 0.013, 'pinene_a'],
  ['TRANS-NEROLIDOL', 0.012, 'nerolidol'], ['ALPHA-TERPINOLENE', 0.008, 'terpinolene'], ['CAMPHENE', 0.007, 'camphene'],
];   // 0.075
const UNITS = 'this report prints two figures for each terpene, in two units, and neither set adds up to its own printed total, so NOSE cannot tell which figures are the percentages';
const kRow = ([n, v, , loq = '0.0200'], q) => [n, '1.000 g', '10 ml', '1 x', '0.00700', loq, f(v), (v * 10).toFixed(2), ...(q ? [q] : []), 'TESTED'];
const kaycha = (total, rows, below) => ['Some New Lab LLC', 'Certificate of Analysis', 'Matrix: Usable Whole Flower Marijuana', 'Type: Preroll',
  'Terpenes', 'TESTED', 'ANALYTES', 'WEIGHT VOLUME DILUTION LIMIT LOD', 'LOQ', 'RESULT(%) (MG/UNIT) QUALIFIER PASS/FAIL',
  'TOTAL TERPENES', '1.000 g', '10 ml', '1 x', '0.00700', '0.0200', total.toFixed(2), (total * 10).toFixed(1), 'TESTED',
  ...rows.flatMap(r => kRow(r)), ...below.flatMap(r => kRow(r, 'J')),
  'CAMPHOR', '1.000 g', '10 ml', '1 x', '0.00700', '0.0200', '<0.00700', '<0.200', 'TESTED'];
x = read(kaycha(1.30, QUANT, BELOW), [...QUANT, ...BELOW]);
check('LOD / LOQ / % / mg before TESTED, the total counting only rows at or above their LOQ: read from the % column, the J rows as printed',
  [x.state, x.r.readBy, x.r.totalTerpenes], ['correct', 'multicolumn', 1.3]);
x = read(kaycha(1.38, QUANT, BELOW), [...QUANT, ...BELOW]);
check('...and the September form, the total counting every row, reads as it did', [x.state, x.r.readBy, x.r.totalTerpenes], ['correct', 'multicolumn', 1.38]);
x = read(kaycha(1.30, [...QUANT, ['GUAIOL', 0.060, null], ['CARYOPHYLLENE OXIDE', 0.050, null]], []));
check('rows above every limit that add up to neither printed total: refused in a plain sentence, not read in mg per unit',
  [x.state, x.r.rejectReasons], ['refused', [UNITS]]);

/* --- 7. a total drawn before its colon label; a two-up panel (2026-11-24) ----
 * Method's autumn 2026 summary writes "1.63%" and then "Total Terpenes:" (one
 * line on the page, the figure drawn first), and its full panel is two
 * half-tables a row of each across the page. Both are read from real reports
 * (MTL-FLW-008, MTL-AIO-001); these made-up cases isolate each guard, so that
 * taking one away fails here and not only on a report nobody has yet. */
const URATE = ([n, v]) => [n, f(v), String(Math.round(v * 10000))];
const SUMMARY = ['Some New Lab LLC', 'Certificate of Analysis', 'Matrix: Flower', 'TERPENES SUMMARY', 'Analyte', 'Result', 'Result'];
x = read([...SUMMARY, ...cells(DESC, URATE), TOTAL + '%', 'Total Terpenes:', 'Sampling Date:']);
check('a total drawn before its colon label, nothing figure-like after it: read from the figure, as an inline total',
  [x.state, x.r.readBy, x.r.totalTerpenes], ['correct', 'forward', 2]);
x = read([...SUMMARY, ...cells(DESC, URATE), 'Total THC:', '24.1%', 'Total Terpenes:', TOTAL + '%']);
check('...a run of colon tiles, a figure below the label: the cannabinoid figure is not the terpene total',
  [x.state, x.r.totalTerpenes], ['refused', null]);
x = read([...SUMMARY, ...cells(DESC, URATE), 'Total THC:', '24.1%', 'Total Terpenes:', 'Sampling Date:']);
check('...a cannabinoid total above the label and nothing below it: not taken as the terpene total either',
  [x.state, x.r.totalTerpenes], ['refused', null]);
x = read([...SUMMARY, ...cells(DESC, URATE), 'Nerolidol', '0.217%', 'Total Terpenes:', '4.530%']);
check('...an analyte figure above the label and a figure below it: the analyte figure is not the total',
  [x.state, x.r.totalTerpenes], ['refused', null]);
x = read([...SUMMARY, ...cells(DESC, URATE), 'Nerolidol', '0.217%', 'Total Terpenes:', 'Sampling Date:']);
check('...the last analyte figure above the label, no total printed: refused, never read as the total',
  [x.state], ['refused']);
x = read([...SUMMARY.slice(0, 3), 'TERPENES', 'TESTED', 'Analyte', 'Analyte', 'Pesticides', ...cells(DESC, URATE), 'Total Terpenes', TOTAL]);
check('two Analyte headings after TERPENES and TESTED, but another section opens before the total: nothing is cut',
  [x.state, x.r.totalTerpenes], ['correct', 2]);
x = read([...SUMMARY.slice(0, 3), 'Terpenes', 'Analyte', 'Analyte', ...cells(DESC, URATE), 'Total Terpenes', TOTAL]);
check('two Analyte headings with no TERPENES and TESTED above them: nothing is cut',
  [x.state, x.r.totalTerpenes], ['correct', 2]);

/* --- 8. a flower that says so only in its product line (2026-11-24) ----------
 * Method's one-page report with an empty Matrix cell prints "CANNABIS FLOWER"
 * in its product lines and no "Usable Whole Flower" (MTL-FLW-010); it read
 * 'unknown' and the card left out moisture and water activity. The phrase is
 * the flower row's last words, so any other form that says it still wins. */
const NOMATRIX = ['Some New Lab LLC', 'Certificate of Analysis', 'TERPENES SUMMARY', 'Analyte', 'Result', 'Result'];
const classOf = extra => read([...NOMATRIX, ...cells(DESC, URATE), `Total Terpenes: ${TOTAL}%`, ...extra]).r.productClass;
check('"CANNABIS FLOWER" in a product line, no matrix text: a flower, not unknown',
  [classOf(['FT - CANNABIS FLOWER - 3.5G - GRZ - HYB']), classOf(['Float - Georgia Runtz'])], ['flower', 'unknown']);
check('...but a vape or a concentrate that says it is still that form',
  [classOf(['FT - CANNABIS FLOWER - VAPE CART - 1G']), classOf(['FT - CANNABIS FLOWER - LIVE ROSIN - 1G'])], ['vape', 'concentrate']);

/* --- 9. a water activity at its action level (2026-11-24) -----------------
 * Method's "Water Activity | Pass | 0.65 | 0.65" (MTL-FLW-009) prints the
 * limit and a result of exactly the same number, and freshValue threw both
 * away as limits. The result is read when the same action level stands twice,
 * nothing else but known limit cells beside it, and a Pass; each condition is
 * one case here that fails without it. */
const AWHEAD = ['Some New Lab LLC', 'Certificate of Analysis', 'Matrix: Flower', 'TERPENES SUMMARY', 'Analyte', 'Result', 'Result'];
const awOf = row => read([...AWHEAD, ...cells(DESC, URATE), `Total Terpenes: ${TOTAL}%`, 'Limit', '(aw)', 'Result', '(aw)', 'Water Activity', ...row, 'Batch Reviewed By:']).r.waterActivity;
check('the limit 0.65 and a result of 0.65 under a Pass: read as 0.65; 0.85 the same',
  [awOf(['Pass', '0.65', '0.65']), awOf(['Pass', '0.85', '0.85'])], [0.65, 0.85]);
check('...a limit and a different result: the result, as before',
  [awOf(['Pass', '0.65', '0.58']), awOf(['Pass', '0.85', '0.52'])], [0.58, 0.52]);
check('...the limit once, with no result: still not read',
  [awOf(['Pass', '0.65'])], [null]);
check('...the same figure three times: a row this does not know, not read',
  [awOf(['Pass', '0.65', '0.65', '0.65'])], [null]);
check('...no Pass beside two equal figures: not read',
  [awOf(['0.65', '0.65'])], [null]);
check('...a different figure beside the pair: that one is the result',
  [awOf(['Pass', '0.65', '0.65', '0.52'])], [0.52]);
check('...two different figures beside the pair: which is the result is not known, not read',
  [awOf(['Pass', '0.65', '0.65', '0.52', '0.58'])], [null]);

/* --- 10. Method's full panel, read whole (2026-11-25) ------------------------
 * The six-page reports' two half-tables alternate in the text: left rows
 * %, LOQ, LOD, name, ug/g and right rows ug/g, %, name, LOQ, LOD
 * (MTL-AIO-001, -FLW-009, -011). Made-up values; each condition of the reader
 * is one case here that fails without it. The top ten above holds the first
 * seven rows, so a reading that fell back to it has no camphene. */
const PHEAD = ['Analyte', 'Analyte', 'LOQ', 'LOD', 'Result', 'Result', '(ug/g)', '%', '(ug/g)', '(ug/g)', '%',
  '(ug/g)', '(ug/g)', '(ug/g)', 'Result', 'Result', 'LOQ', 'LOD'];
const LISTED = DESC.map(([n, v]) => [n, v]);
const pct = (v, j) => (j ? v.toFixed(5) + ' J' : v > 0 ? f(v) : '<LOD');
const ugg = (v, j) => (j ? (v * 10000).toFixed(1) + ' J' : v > 0 ? String(Math.round(v * 10000)) : '<LOD');
const panelCells = rows => rows.flatMap(([n, v, j, loq = '50.0', mass = ugg(v, j)], i) =>
  (i % 2 ? [mass, pct(v, j), n, loq, '15.0'] : [pct(v, j), loq, '15.0', n, mass]));
const topRows = rows => rows.flatMap(([n, v, j]) => [n, ugg(v, j), pct(v, j)]);
const PANEL = [...LISTED, ['Terpineol', 0.004, true], ['Ocimenes', 0]];
const report = ({ top = LISTED.slice(0, 7), rows = PANEL, total = TOTAL, head = PHEAD, cut = c => c } = {}) => read([
  'Some New Lab LLC', 'Certificate of Analysis', 'Matrix: Flower', 'TERPENES SUMMARY', 'Analyte', 'Result', 'Result',
  ...topRows(top), `Total Terpenes: ${total}%`, 'TERPENES', 'TESTED', ...head, ...cut(panelCells(rows)), 'Total Terpenes:', total + ' %']).r;
const row = (name, change) => PANEL.map(r => (r[0] === name ? change(r) : r));
const fellBack = r => [r.readBy, r.usable, r.terps.camphene === undefined];
const TOPTEN = ['forward', true, true];

let p = report();
check('the whole panel reads: its smaller rows and its J row are in, with no warning',
  [p.readBy, p.usable, p.terps.camphene, p.terps.terpineol, p.terps.ocimene, p.warnings], ['panel', true, 0.012, 0.004, 0, []]);
p = report({ rows: [...LISTED, ['Terpineol', 0.08, true], ['Fenchyl Alcohol', 0.08, true]] });
check('...J rows the total leaves out, 8% of it: still accepted, and no sum is said not to close',
  [p.readBy, p.usable, p.warnings], ['panel', true, []]);
p = report({ total: '1.960' });
check('...rows the total does count, 2% over it: read, and the warning stands',
  [p.readBy, p.warnings.length, /add up to/.test(p.warnings[0] || '')], ['panel', 1, true]);
check('a heading the panel does not have: the top ten is read',
  fellBack(report({ head: PHEAD.map((h, i) => (i === 6 ? '(mg/g)' : h)) })), TOPTEN);
check('...a stray line between two rows: the top ten',
  fellBack(report({ cut: c => [...c.slice(0, 20), 'Page 2', ...c.slice(20)] })), TOPTEN);
check('...a row whose two result figures disagree: the top ten',
  fellBack(report({ rows: row('Camphene', ([n, v]) => [n, v, false, '50.0', '900']) })), TOPTEN);
check('...a row whose LOD is not below its LOQ: the top ten',
  fellBack(report({ rows: row('Guaiol', ([n, v]) => [n, v, false, '10.0']) })), TOPTEN);
check('...a name nobody knows: the top ten',
  fellBack(report({ rows: [...PANEL, ['Madeupene', 0]] })), TOPTEN);
check('...a name twice: the top ten',
  fellBack(report({ rows: [...PANEL, ['Ocimenes', 0]] })), TOPTEN);
check('...a terpene as a total and as an isomer: the top ten',
  fellBack(report({ rows: [...PANEL, ['Nerolidol', 0], ['E-Nerolidol', 0]] })), TOPTEN);
check('...rows that miss the printed total by 9%: the top ten',
  fellBack(report({ total: '2.200' })), TOPTEN);
check('...a figure that differs from the top ten above: the top ten',
  fellBack(report({ rows: row('Limonene', ([n]) => [n, 0.413]) })), TOPTEN);
p = report({ top: LISTED.slice(0, 2) });
check('...a top ten of two terpenes checks too little: it is read, and refused as before',
  [p.readBy, p.usable], ['forward', false]);
p = read(['Some New Lab LLC', 'Certificate of Analysis', 'Matrix: Flower', 'TERPENES SUMMARY', 'Analyte', 'Result', 'Result',
  ...topRows([...LISTED, ['Terpineol', 0.003, true]]), `Total Terpenes: ${TOTAL}%`]).r;
check('a J figure in a top ten, "30.0 J" and "0.00300 J": read, from the % column',
  [p.readBy, p.usable, p.terps.terpineol], ['forward', true, 0.003]);

if (failures) { console.log(`\nshifted-rows: ${failures} failure${failures === 1 ? '' : 's'}`); process.exit(1); }
console.log('\nshifted-rows clean');

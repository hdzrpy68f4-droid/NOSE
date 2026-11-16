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

if (failures) { console.log(`\nshifted-rows: ${failures} failure${failures === 1 ? '' : 's'}`); process.exit(1); }
console.log('\nshifted-rows clean');

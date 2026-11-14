#!/usr/bin/env node
'use strict';
/* NOSE - a terpene printed both as a total and as its isomers counts once.
 * PARSER-HANDOFF s13, "A terpene printed as a total and as its isomers".
 *
 *   node test/summed-rows-test.js     -> "summed-rows clean", or FAIL lines and exit 1
 *
 * Some labs print one summed row for a terpene (Nerolidol, Total Terpineol,
 * "Ocimene, Total"); others print its isomers (cis- and trans-Nerolidol,
 * alpha-Terpineol). Both map to one key, and the parser adds every row that
 * maps to a key. Until 2026-11-14 a report printing BOTH was read with that
 * terpene doubled, and accepted whenever the doubled part stayed under the
 * 5% coverage ceiling.
 *
 * No real report in the corpus prints both, so these are made-up reports, in
 * the one-cell-per-line layout test/distinctness-test.js uses: a name, then
 * its value. Twelve terpenes summing to 2.116%, plus the rows each case adds.
 */
const path = require('path');
const { parseCoa } = require(path.join(__dirname, '..', 'netlify/functions/lib/parse-coa.js'));

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
}

const BASE = [['Limonene', 0.612], ['beta-Myrcene', 0.481], ['beta-Caryophyllene', 0.352], ['Linalool', 0.214], ['alpha-Humulene', 0.121],
  ['beta-Pinene', 0.098], ['alpha-Pinene', 0.077], ['alpha-Bisabolol', 0.064], ['Fenchol', 0.041], ['alpha-Terpineol', 0.035],
  ['Camphene', 0.012], ['Terpinolene', 0.009]];
const BASE_TOTAL = 2.116;
/* extra rows, and what the lab's own total would be: the base plus `adds` */
function report(extra, adds) {
  const rows = [...BASE, ...extra].map(([name, v]) => `${name}\n${typeof v === 'number' ? v.toFixed(3) : v}`);
  return ['Some New Lab LLC', 'Certificate of Analysis', 'Matrix: Flower', 'Terpenes', `Total Terpenes: ${(BASE_TOTAL + adds).toFixed(3)}%`, ...rows].join('\n');
}
const read = (extra, adds) => {
  const r = parseCoa(report(extra, adds));
  return { r, closes: !r.warnings.some(w => /does not close|add up to/.test(w)) };
};
const DISAGREE = name => `this report lists ${name} both as a total and as separate rows, and the two disagree, so NOSE cannot tell which to use`;

/* --- the three layouts the review made up -------------------------------- */
let x = read([['cis-Nerolidol', 0.012], ['trans-Nerolidol', 0.018], ['Nerolidol', 0.030]], 0.030);
check('Nerolidol 0.030 beside cis- 0.012 and trans- 0.018: accepted, nerolidol read once, no arithmetic warning',
  [x.r.usable, x.r.terps.nerolidol, x.closes, x.r.rejectReasons], [true, 0.03, true, []]);
check('...and the coverage figure sees the corrected value', Math.round(x.r.coverage * 1000) / 1000, 1);

x = read([['Total Terpineol', 0.035]], 0);
check('alpha-Terpineol 0.035 beside Total Terpineol 0.035: accepted, terpineol read once',
  [x.r.usable, x.r.terps.terpineol, x.closes], [true, 0.035, true]);

x = read([['cis-Ocimene', 0.015], ['trans-Ocimene', 0.025], ['Ocimene, Total', 0.040]], 0.040);
check('cis- 0.015 and trans-Ocimene 0.025 beside "Ocimene, Total" 0.040: accepted, ocimene read once',
  [x.r.usable, x.r.terps.ocimene, x.closes], [true, 0.04, true]);

x = read([['Nerolidol', 0.030], ['cis-Nerolidol', 0.012], ['trans-Nerolidol', 0.018]], 0.030);
check('the summed row printed first, its isomers after: the same reading', [x.r.usable, x.r.terps.nerolidol], [true, 0.03]);

/* --- the case the coverage ceiling used to catch -------------------------- */
x = read([['cis-Nerolidol', 0.050], ['trans-Nerolidol', 0.070], ['Nerolidol', 0.120]], 0.120);
check('a doubled terpene worth 5.4% of the total, refused until 2026-11-14, is accepted at its true value',
  [x.r.usable, x.r.terps.nerolidol, x.closes, x.r.rejectReasons], [true, 0.12, true, []]);

/* --- what must not change -------------------------------------------------- */
x = read([['cis-Nerolidol', 0.012], ['trans-Nerolidol', 0.018]], 0.030);
check('isomers alone still sum', [x.r.usable, x.r.terps.nerolidol, x.closes], [true, 0.03, true]);
x = read([['Nerolidol', 0.030]], 0.030);
check('a summed row alone is read', [x.r.usable, x.r.terps.nerolidol, x.closes], [true, 0.03, true]);
x = read([['Ocimene', 0.020], ['beta-Ocimene', 0.020]], 0.040);
check('a bare "Ocimene" is neither a total nor an isomer by its name: beside beta-Ocimene the two add, as before',
  [x.r.usable, x.r.terps.ocimene], [true, 0.04]);
x = read([['Nerolidol', '<LOQ'], ['cis-Nerolidol', '<LOQ'], ['trans-Nerolidol', 'ND']], 0);
check('a total and its isomers all below the limit: accepted, nerolidol zero or absent',
  [x.r.usable, x.r.terps.nerolidol || 0], [true, 0]);

/* --- the two disagree: refused, in a plain sentence ----------------------- */
x = read([['cis-Nerolidol', 0.012], ['trans-Nerolidol', 0.030], ['Nerolidol', 0.030]], 0.030);
check('Nerolidol 0.030 beside isomers that sum to 0.042: refused, saying so',
  [x.r.usable, x.r.rejectReasons.includes(DISAGREE('nerolidol'))], [false, true]);
x = read([['Total Terpineol', 0.060]], 0.025);
check('Total Terpineol 0.060 beside alpha-Terpineol 0.035: refused, saying so',
  [x.r.usable, x.r.rejectReasons.includes(DISAGREE('terpineol'))], [false, true]);
x = read([['cis-Nerolidol', 0.012], ['trans-Nerolidol', 0.018], ['Nerolidol', '<LOQ']], 0.030);
check('a total below the limit beside measured isomers: refused, saying so',
  [x.r.usable, x.r.rejectReasons.includes(DISAGREE('nerolidol'))], [false, true]);
x = read([['cis-Nerolidol', 0.0145], ['trans-Nerolidol', 0.0150], ['Nerolidol', 0.030]], 0.030);
check('agreement is within the parser\'s 3% tolerance of the summed row: 0.0295 against 0.030 is read as 0.030',
  [x.r.usable, x.r.terps.nerolidol], [true, 0.03]);

if (failures) { console.log(`\nsummed-rows: ${failures} failure${failures === 1 ? '' : 's'}`); process.exit(1); }
console.log('\nsummed-rows clean');

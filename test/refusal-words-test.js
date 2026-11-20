#!/usr/bin/env node
'use strict';
/* NOSE - the sentences a refused report shows a person are plain English.
 * PARSER-HANDOFF s13, "Refusal sentences in plain words".
 *
 *   node test/refusal-words-test.js     -> "refusal-words clean", or FAIL lines and exit 1
 *
 * The app prints the parser's rejectReasons word for word after "That report
 * could not be read reliably." Until 2026-11-14 seven of them carried the
 * parser's own vocabulary: "parse fault", "limit column", "modelled",
 * "coverage", "wrong column read", and internal keys such as pinene_a.
 * Only the words changed; no rule, threshold or verdict did.
 *
 * Made-up reports, one cell per line (a name, then its value), each built to
 * be refused for one reason. Offline.
 */
const fs = require('fs');
const path = require('path');
const PARSER = path.join(__dirname, '..', 'netlify/functions/lib/parse-coa.js');
const P = require(PARSER);

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
}

const BASE = [['Limonene', 0.612], ['beta-Myrcene', 0.481], ['beta-Caryophyllene', 0.352], ['Linalool', 0.214], ['alpha-Humulene', 0.121],
  ['beta-Pinene', 0.098], ['alpha-Pinene', 0.077], ['alpha-Bisabolol', 0.064], ['Fenchol', 0.041], ['alpha-Terpineol', 0.035],
  ['Camphene', 0.012], ['Terpinolene', 0.009]];
function report(rows, total) {
  const head = ['Some New Lab LLC', 'Certificate of Analysis', 'Matrix: Flower', 'Terpenes'];
  if (total != null) head.push(`Total Terpenes: ${total}%`);
  return [...head, ...rows.map(([name, v]) => `${name}\n${typeof v === 'number' ? v.toFixed(3) : v}`)].join('\n');
}
const reasons = (rows, total) => P.parseCoa(report(rows, total)).rejectReasons;

/* Words that belong to the parser, not to a person holding a jar. */
const INTERNAL = /parse fault|limit column|modell?ed|coverage|wrong column read|inhalable|quantitation|distinct value|[a-z]_[a-z]/;
const seen = [];
function refused(label, got, sentence) {
  seen.push(...got);
  check(label, got.includes(sentence) ? sentence : got, sentence);
}

check('the made-up report is accepted as it stands', reasons(BASE, '2.116'), []);

refused('no total printed', reasons(BASE, null),
  'this report prints no total terpene figure NOSE can read, so NOSE cannot check its own reading');
refused('every row below the lab\'s limit', reasons(BASE.map(([n]) => [n, '<LOQ']), '2.116'),
  'none of the terpenes NOSE compares was found above the lab\'s reporting limit');
refused('the rows add up to twice the printed total', reasons(BASE, '1.058'),
  'the terpene figures NOSE read add up to more than the total this report prints (200.0%), so the table was probably misread');
refused('every row the same figure', reasons(BASE.map(([n]) => [n, 0.02]), '0.240'),
  'every terpene read as the same figure, which is what a report\'s limits column looks like, not its results');
refused('two figures only', reasons(BASE.map(([n], i) => [n, i % 2 ? 0.02 : 0.03]), '0.300'),
  'every terpene read as one of only 2 different figures, which is what a report\'s limits column looks like, not its results');
refused('a total over 100%', reasons(BASE, '500'),
  'a total of 500% is not possible, so the wrong column was read');
refused('one terpene on flower', reasons([['Limonene', 0.612], ['beta-Myrcene', '<LOQ'], ['Linalool', 'ND']], '0.612'),
  'only 1 terpene was found, too few for this kind of product, so the panel was probably misread');
refused('two terpenes on flower', reasons([['Limonene', 0.612], ['beta-Myrcene', 0.481], ['Linalool', 'ND']], '1.093'),
  'only 2 terpenes were found, too few for this kind of product, so the panel was probably misread');
refused('a total and its isomers that disagree', reasons([...BASE, ['Total Terpineol', 0.060]], '2.141'),
  'this report lists terpineol both as a total and as separate rows, and the two disagree, so NOSE cannot tell which to use');
/* Kaycha's row shape - limits, %, mg per unit, then TESTED - with rows that add
   up to neither printed total (since 2026-11-20; test/shifted-rows-test.js). */
const twoUnits = (rows, total) => ['Some New Lab LLC', 'Certificate of Analysis', 'Type: Preroll', 'Terpenes', 'TESTED',
  'TOTAL TERPENES', '0.00700', '0.0200', total.toFixed(2), (total * 10).toFixed(1), 'TESTED',
  ...rows.flatMap(([name, v]) => [name.toUpperCase(), '0.00700', '0.0200', v.toFixed(3), (v * 10).toFixed(2), 'TESTED'])].join('\n');
refused('two figures a row, adding up to neither total', P.parseCoa(twoUnits(BASE, 1.90)).rejectReasons,
  'this report prints two figures for each terpene, in two units, and neither set adds up to its own printed total, so NOSE cannot tell which figures are the percentages');

check('no sentence shown for those reports holds a word of the parser\'s own', seen.filter(s => INTERNAL.test(s)), []);
check('...and each is one clause a person can read after "That report could not be read reliably."',
  seen.filter(s => !/^[a-z0-9]/.test(s) || /[.;]$/.test(s)), []);

/* A figure above 100% cannot be made by a report in this layout - the readers
   set such a cell aside - so the sentence is checked in the parser's text,
   and its names in the table it reads them from. */
const src = fs.readFileSync(PARSER, 'utf8');
check('a value above 100% is named as a person reads it, through printedName()',
  src.includes('${overPercent.map(([k]) => printedName(k)).join(\', \')} read above 100%, which is not possible, so the wrong column was read'), true);
const { PRINTED_NAME, keys } = P._printedNames;
check('one printed name for every key ANALYTE_MAP can give, and no other',
  [keys.filter(k => !PRINTED_NAME[k]), Object.keys(PRINTED_NAME).filter(k => !keys.includes(k))], [[], []]);
check('no printed name is an internal key', Object.values(PRINTED_NAME).filter(n => /_/.test(n)), []);
const old = ['parse fault, not a lab finding', 'that is a limit column, not a measurement', 'wrong column read`', 'no modelled terpene measured',
  'so coverage cannot be known', 'found on an inhalable product'];
check('none of the old sentences is still pushed', old.filter(s => src.split('\n').some(l => /rejectReasons\.push/.test(l) && l.includes(s))), []);

if (failures) { console.log(`\nrefusal-words: ${failures} failure${failures === 1 ? '' : 's'}`); process.exit(1); }
console.log('\nrefusal-words clean');

'use strict';
/* NOSE - the parser's `novelty` field (PARSER-HANDOFF s7), offline.
 *
 *   node test/novelty-test.js      -> "novelty clean", or FAIL lines and exit 1
 *
 * Checks each of the five notes on a real fixture with one line added, that
 * what the fixtures already print stays quiet, that the section tracking is
 * the reading loop's own, and that every SEEN_HEADINGS entry is still printed
 * by an accepted fixture. Then LISTS the fixtures whose novelty is not empty -
 * information, never a failure: a new fixture may well be new to the parser.
 *
 * Needs test/fixtures/extracted (node test/extract-dump.js).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PARSER = path.join(ROOT, 'netlify/functions/lib/parse-coa.js');
const EXTRACTED = path.join(ROOT, 'test/fixtures/extracted');
const BASELINE = path.join(ROOT, 'test/fixtures/coa-baseline.json');
const { parseCoa, _novelty: N } = require(PARSER);

let failures = 0;
let checks = 0;
const check = (label, actual, expected) => {
  checks++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
};

if (!fs.existsSync(EXTRACTED)) {
  console.error('FAIL: test/fixtures/extracted is missing - run: node test/extract-dump.js');
  process.exit(1);
}
const text = name => fs.readFileSync(path.join(EXTRACTED, `${name}.txt`), 'utf8');
const novelty = t => parseCoa(t).novelty;

/* --- the section is the reading loop's section ----------------------------- */
{
  const src = fs.readFileSync(PARSER, 'utf8');
  const open = src.match(/if \((\/.+\/i)\.test\(line\)\)\s*\n\s*inTerpeneSection = true;/);
  const close = src.match(/else if \((\/.+\/i)\.test\(line\)\)\s*\n\s*inTerpeneSection = false;/);
  check('the loop still opens its terpene section where novelty does',
    open && open[1], String(N.NOVELTY_SECTION_OPEN));
  check('...and closes it where novelty does',
    close && close[1], String(N.NOVELTY_SECTION_CLOSE));
}

/* --- one line added to a real, quiet document -------------------------------- */
const QUIET = 'KAY-CAR-001';
const base = text(QUIET);
check(`${QUIET} is new in nothing`, novelty(base), []);
check('every parse carries novelty as an array of strings, the same each time',
  [Array.isArray(novelty(base)), JSON.stringify(novelty(base)) === JSON.stringify(novelty(base))], [true, true]);

const opener = base.split('\n').find(l => N.NOVELTY_SECTION_OPEN.test(l.trim()));
const inside = (...added) => base.replace(opener, [opener, ...added].join('\n'));
const before = (...added) => [...added, base].join('\n');

check('an unrecognised lab', novelty(base.replace(/kaycha/gi, 'Acme')), ['lab not recognised']);
check('a name the map does not know, followed by a result',
  novelty(inside('Terpinen-4-ol', '0.012')), ['unmapped: Terpinen-4-ol']);
check('a figure in a unit VALUE_LINE does not read',
  novelty(inside('0.012 mg/mL')), ['unit not read: "0.012 mg/mL"']);
check('...a micro sign, a w/w, an uncertainty',
  novelty(inside('0.5 µg/g', '0.084 %w/w', '1.2 ± 0.1 %')),
  ['unit not read: "0.5 µg/g", "0.084 %w/w", "1.2 ± 0.1 %"']);
check('a verdict word the reader does not act on',
  novelty(inside('Complies')), ['verdict not known: "Complies"']);
check('a column heading nobody has printed yet',
  novelty(inside('Conc. (ug/g)')), ['heading not known: "Conc. (ug/g)"']);
check('a heading that only shares words with a seen one is still new',
  novelty(inside('Reg. Limit (%)')), ['heading not known: "Reg. Limit (%)"']);
check('all five at once, in a fixed order',
  novelty(inside('Complies', 'Conc. (ug/g)', '0.012 mg/mL', 'Terpinen-4-ol', '0.012').replace(/kaycha/gi, 'Acme')),
  ['lab not recognised', 'unmapped: Terpinen-4-ol', 'unit not read: "0.012 mg/mL"',
   'verdict not known: "Complies"', 'heading not known: "Conc. (ug/g)"']);
check('at most three examples, then a count',
  novelty(inside('1 mg/mL', '2 mg/mL', '3 mg/mL', '4 mg/mL', 'Concentration Result Amount Flags Spec')),
  ['unit not read: "1 mg/mL", "2 mg/mL", "3 mg/mL" (+1 more)',
   'heading not known: "Concentration Result Amount Flags Spec"']);
check('a line longer than any heading is not one',
  novelty(inside('Analyte Concentration Specification Flags')), []);
check('outside the terpene section nothing counts', novelty(before('Complies', 'Conc. (ug/g)', '0.012 mg/mL')), []);

/* --- what the fixtures already print stays quiet ----------------------------- */
check('known cells, verdicts, headings and footnotes: nothing new',
  novelty(inside('0.500 g', '10 ml', '1 x', '0.2241g', '82.4% (824 mg)', '30.4% (1,060 mg)', '14.2 %',
                 'N/A', 'Tested', 'Passed', 'Not Tested', 'Completed', 'P A S S E D',
                 'RESULT (%)', '(%)', 'PASS/FAIL', 'Reg. Limit', 'Result (mg/g)', 'Total (%)', 'mg/unit',
                 '(ppm) =', 'moisture concentration.', 'Terpenes % is dry-weight corrected.',
                 'Batch Date:', '< LOQ', 'ND')),
  []);

/* --- SEEN_HEADINGS holds only what accepted fixtures print -------------------- */
const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const files = fs.readdirSync(EXTRACTED).filter(f => f.endsWith('.txt')).map(f => f.replace(/\.txt$/, '')).sort();
{
  const seen = [...N.SEEN_HEADINGS];
  const printed = new Set();
  for (const name of files.filter(n => baseline[n])) {
    let on = false;
    for (const raw of text(name).split('\n')) {
      const line = raw.trim();
      if (N.NOVELTY_SECTION_OPEN.test(line)) on = true;
      else if (N.NOVELTY_SECTION_CLOSE.test(line)) on = false;
      if (on && N.isHeadingLine(line)) printed.add(line.toUpperCase().replace(/\s+/g, ' '));
    }
  }
  check('every SEEN_HEADINGS entry is printed by an accepted fixture', seen.filter(h => !printed.has(h)), []);
}

/* --- the corpus: information, not a failure ---------------------------------- */
const novel = [];
for (const name of files) {
  const r = parseCoa(text(name));
  if (r.novelty.length) novel.push({ name, usable: r.usable, notes: r.novelty });
}
console.log(`\nnovelty-test: ${checks} checks`);
console.log(`\nfixtures with novelty (information, not a failure): ${novel.length} of ${files.length}`);
for (const n of novel) {
  console.log(`  ${n.usable ? 'accepted' : 'refused '}  ${n.name}`);
  for (const note of n.notes) console.log(`              ${note}`);
}

if (failures) {
  console.error(`\nnovelty-test: ${failures} failure${failures === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('\nnovelty clean');

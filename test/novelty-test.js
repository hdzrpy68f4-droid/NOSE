'use strict';
/* NOSE - the parser's `novelty` field (PARSER-HANDOFF s7), offline.
 *
 *   node test/novelty-test.js      -> "novelty clean", or FAIL lines and exit 1
 *
 * Checks each of the five notes on a real fixture with one line added, that
 * what the fixtures already print stays quiet, that the section tracking is
 * the reading loop's own, and that every SEEN_HEADINGS entry is still printed
 * by an accepted fixture. Then FAILS if any accepted fixture carries novelty:
 * an accepted fixture's layout is known by definition, and on a usable read
 * the card would tell someone holding that jar the opposite. Refused fixtures
 * with novelty are LISTED - information, never a failure: a refusal never
 * reaches the card, and the review queue is where it is read.
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
const src = fs.readFileSync(PARSER, 'utf8');
{
  const open = src.match(/if \((\/.+\/i)\.test\(line\)\)\s*\n\s*inTerpeneSection = true;/);
  const close = src.match(/else if \((\/.+\/i)\.test\(line\)\)\s*\n\s*inTerpeneSection = false;/);
  check('the loop still opens its terpene section where novelty does',
    open && open[1], String(N.NOVELTY_SECTION_OPEN));
  check('...and closes it where novelty does',
    close && close[1], String(N.NOVELTY_SECTION_CLOSE));
}

/* --- the furniture check is the diagnostic's alone --------------------------- */
/* notAnAnalyteHere keeps structure labels, licence and ID labels, and a
   label's value out of `unmapped` (s7). It is called in one place - the
   condition in front of unmapped.add - and its three patterns are read only
   inside it. Below, the corpus is parsed once more with the call switched
   off, and nothing but `unmapped` and `novelty` may differ. */
const FURNITURE_CALL = '!notAnAnalyteHere(line, lines[i - 1])';
check('the furniture check is called once, by the unmapped filter, and its patterns are tested only inside it',
  [FURNITURE_CALL, 'notAnAnalyteHere(', 'STRUCTURE_LABEL.test(', 'ID_LABEL.test(', 'LABEL_ALONE.test(']
    .map(s => src.split(s).length - 1), [1, 1, 1, 1, 1]);
let withoutFurniture = null;
if (src.split(FURNITURE_CALL).length === 2) {
  const Module = require('module');
  const m = new Module(PARSER, module);
  m.filename = PARSER;
  m.paths = Module._nodeModulePaths(path.dirname(PARSER));
  m._compile(src.replace(FURNITURE_CALL, 'true'), PARSER);
  withoutFurniture = m.exports;
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

/* --- furniture a known layout prints is not new (PARSER-HANDOFF s7) ---------- */
check('a structure label with its figures - "Moisture", limit, result - is not new',
  novelty(inside('Moisture', '15', '12.8')), []);
check('a licence or ID label followed by its number is not new',
  novelty(inside('License No.', '800025015', 'Sample ID', '1006', 'Licence', '42', 'Lot Number', '7')), []);
check('the value on the line after a "Label:" or "Label #:" is not new',
  novelty(inside('Lab Batch #:', 'AAGZ997-', '25', 'Client:', 'Tavares', '12')), []);
check('...only that one line: a name the map does not know, after the value, still is',
  novelty(inside('Lab Batch #:', 'AAGZ997-', '25', 'Terpinen-4-ol', '0.012')), ['unmapped: Terpinen-4-ol']);
check('...and after a structure label',
  novelty(inside('Moisture', '15', '12.8', 'Citronellol', '0.02')), ['unmapped: Citronellol']);

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

/* --- the furniture check moves unmapped and novelty, and no reading ---------- */
if (withoutFurniture) {
  const rest = o => { const { unmapped, novelty, ...others } = o; return JSON.stringify(others); };
  const readingMoved = [], diagnosticMoved = [];
  for (const name of files) {
    const t = text(name);
    const on = parseCoa(t), off = withoutFurniture.parseCoa(t);
    if (rest(on) !== rest(off)) readingMoved.push(name);
    else if (JSON.stringify([on.unmapped, on.novelty]) !== JSON.stringify([off.unmapped, off.novelty])) diagnosticMoved.push(name);
  }
  check('with the furniture check switched off, every other field of every fixture is the same', readingMoved, []);
  check('...and only the four accepted ACS reports it was written for gain unmapped furniture again',
    diagnosticMoved, ['ACS-FLW-002', 'ACS-LRS-002', 'ACS-PRR-001', 'COA_GassiusClay_3_5gWF_4793_1807_7220_8969']);
}

/* --- the corpus: an accepted fixture's layout is known ------------------------ */
const novel = [];
let refusedCount = 0;
for (const name of files) {
  const r = parseCoa(text(name));
  if (r.usable !== true) refusedCount++;
  if (r.novelty.length) novel.push({ name, usable: r.usable === true, notes: r.novelty });
}
const acceptedNovel = novel.filter(n => n.usable);
check('no accepted fixture carries novelty - its layout is known by definition',
  acceptedNovel.map(n => n.name), []);
for (const n of acceptedNovel) for (const note of n.notes) console.log(`        ${n.name}: ${note}`);

const refusedNovel = novel.filter(n => !n.usable);
console.log(`\nnovelty-test: ${checks} checks`);
console.log(`\nrefused fixtures with novelty (information, not a failure - a refusal never reaches the card): ` +
            `${refusedNovel.length} of ${refusedCount}`);
for (const n of refusedNovel) {
  console.log(`  refused   ${n.name}`);
  for (const note of n.notes) console.log(`              ${note}`);
}

if (failures) {
  console.error(`\nnovelty-test: ${failures} failure${failures === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('\nnovelty clean');

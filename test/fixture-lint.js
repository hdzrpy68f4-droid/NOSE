'use strict';
/* NOSE — fixture corpus hygiene.
 *
 *   node test/fixture-lint.js
 *
 * The gate and the parity test check what the parser DOES. This checks that the
 * corpus is legible to the tools used to investigate it. Two real incidents:
 * seven ACS fixtures contain bytes that make grep treat them as binary, so they
 * are silently skipped by every grep-based triage; and five fixtures have spaces
 * or colons in their names, which broke a warning scan without failing it. Both
 * make an investigation look complete when it is not. */
const fs = require('fs');
const path = require('path');

const EXTRACTED = 'test/fixtures/extracted';
const PDFDIR    = 'test/fixtures/pdf';
const BASELINE  = 'test/fixtures/coa-baseline.json';

/* Documents that are correctly REFUSED by the parser. They have no baseline
   because there is no correct fingerprint to record - the right outcome is the
   refusal itself, which coa-gate-test.js asserts. Listed here so that a
   fixture missing its baseline by accident is still an error. */
const EXPECTED_NO_BASELINE = new Set([
  'GreenRoadsFullSpectrumCBDOil750mgLot24007',
  'Harmony-Muscle-Rub-COA-PHRO1',
  'hemp-bombs-cbd-gummies-50-count-750mg-of-cbd-COA'
]);

const problems = [];
const note = (kind, name, msg) => problems.push({ kind, name, msg });

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const files = fs.readdirSync(EXTRACTED).filter(f => /\.txt$/.test(f));

for (const f of files){
  const name = f.replace(/\.txt$/, '');
  const full = path.join(EXTRACTED, f);

  /* A name that needs quoting is a name that will eventually be used unquoted
     in a shell loop, and the file will be skipped rather than reported. */
  if (/[^A-Za-z0-9._-]/.test(name))
    note('name', name, 'filename has characters that need shell quoting');

  const buf = fs.readFileSync(full);
  const bad = new Set();
  for (const b of buf)
    if (b === 0 || (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d)) bad.add(b);
  if (bad.size)
    note('bytes', name, `control bytes present: ${[...bad].map(b => '0x' + b.toString(16)).join(' ')} — grep treats this file as binary`);

  if (!buf.toString('utf8').length)
    note('empty', name, 'fixture is empty');

  if (!baseline[name] && !EXPECTED_NO_BASELINE.has(name))
    note('baseline', name, 'no baseline entry, and not in the expected-refusal list');
}

for (const k of Object.keys(baseline))
  if (!files.includes(k + '.txt'))
    note('orphan', k, 'baseline entry with no fixture');

for (const k of EXPECTED_NO_BASELINE)
  if (!files.includes(k + '.txt'))
    note('stale', k, 'listed as an expected refusal but the fixture is gone');

if (fs.existsSync(PDFDIR)){
  const pdfs = new Set(fs.readdirSync(PDFDIR).filter(f => /\.pdf$/i.test(f)).map(f => f.replace(/\.pdf$/i, '')));
  for (const f of files){
    const name = f.replace(/\.txt$/, '');
    if (!pdfs.has(name)) note('nopdf', name, 'extracted text with no source PDF — cannot be regenerated or parity-checked');
  }
}

/* The handoff's headline counts drifted five times in one session, and a stale
   one cost real time at the start of the next: it claimed 52/4 when the tree
   held 53/3, so the first hypotheses were built on a number that was wrong.
   The counts are facts about this directory, so check them here rather than
   remembering to hand-edit. This couples the lint to the document's wording -
   if section 2 is reformatted, fix the regexes below rather than deleting
   the check. */
const HANDOFF = path.join(__dirname, '..', 'PARSER-HANDOFF.md');
if (fs.existsSync(HANDOFF)){
  const doc = fs.readFileSync(HANDOFF, 'utf8');
  const claim = (re, what) => {
    const m = doc.match(re);
    if (!m) note('handoff', what, 'no count found in PARSER-HANDOFF.md - was section 2 reformatted?');
    return m;
  };
  const acc = claim(/(\d+) accepted \/ (\d+) rejected\s+\((\d+) COA fixtures\)/, 'gate line');
  const par = claim(/(\d+) match \/ 0 differ\s+\(extraction parity/, 'parity line');
  const nBase = Object.keys(baseline).length;
  if (acc){
    if (+acc[3] !== files.length)
      note('handoff', 'fixture count', `says ${acc[3]} fixtures, directory holds ${files.length}`);
    if (+acc[1] !== nBase)
      note('handoff', 'accepted count', `says ${acc[1]} accepted, baseline holds ${nBase}`);
    if (+acc[2] !== EXPECTED_NO_BASELINE.size)
      note('handoff', 'rejected count', `says ${acc[2]} rejected, ${EXPECTED_NO_BASELINE.size} expected refusals`);
  }
  if (par && +par[1] !== nBase)
    note('handoff', 'parity count', `says ${par[1]} match, baseline holds ${nBase}`);

  /* The mutation figure is the same class of fact as the counts above and had
     no check at all, so it can drift exactly the way section 2's counts did. It
     is stated in THREE places - the section 2 block, the section 9 headline,
     and the blankNonDetects split inside section 9 - and the failure that
     actually happens is one of them being updated while the others are left
     stale. That is what this catches.

     INTERNAL consistency only. Running the mutation harness here would take
     longer than the whole rest of the lint, and a figure that drifts in all
     three places together is still only catchable by a real run. Same coupling
     to the document's wording as the checks above: if section 9 is reformatted,
     fix these regexes rather than deleting the check. */
  const find = (re, what) => {
    const m = doc.match(re);
    if (!m) note('handoff', what,
      'no figure found in PARSER-HANDOFF.md - was it reformatted? Fix the regex rather than deleting the check.');
    return m;
  };
  const m2 = find(/(\d+) mutation failures\s+\(mutation harness, (\d+) cases/, 'mutation line (section 2)');
  const m9 = find(/\*\*(\d+) mutation failures\*\* out of (\d+)/, 'mutation line (section 9)');
  const msplit = find(/\*\*(\d+) of the (\d+) are `destructive\/blankNonDetects`\*\*/, 'mutation split (section 9)');
  if (m2 && m9){
    if (m2[1] !== m9[1])
      note('handoff', 'mutation failures', `section 2 says ${m2[1]}, section 9 says ${m9[1]}`);
    if (m2[2] !== m9[2])
      note('handoff', 'mutation cases', `section 2 says ${m2[2]} cases, section 9 says ${m9[2]}`);
  }
  if (m9 && msplit){
    if (msplit[2] !== m9[1])
      note('handoff', 'mutation split', `the split is stated against ${msplit[2]}, but the section 9 headline says ${m9[1]}`);
    if (+msplit[1] >= +m9[1])
      note('handoff', 'mutation split', `${msplit[1]} blankNonDetects cannot be part of ${m9[1]} failures`);
  }
}

const counts = {};
problems.forEach(p => { counts[p.kind] = (counts[p.kind] || 0) + 1; });
problems.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
        .forEach(p => console.log(`${p.kind.toUpperCase().padEnd(9)} ${p.name}\n           - ${p.msg}`));

console.log(`\n${files.length} fixtures / ${Object.keys(baseline).length} baselines / ${EXPECTED_NO_BASELINE.size} expected refusals`);
console.log(problems.length ? `${problems.length} problem(s): ${JSON.stringify(counts)}` : 'corpus clean');
process.exit(problems.length ? 1 : 0);

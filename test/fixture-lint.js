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
  'MCL-FLW-002',
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

const counts = {};
problems.forEach(p => { counts[p.kind] = (counts[p.kind] || 0) + 1; });
problems.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
        .forEach(p => console.log(`${p.kind.toUpperCase().padEnd(9)} ${p.name}\n           - ${p.msg}`));

console.log(`\n${files.length} fixtures / ${Object.keys(baseline).length} baselines / ${EXPECTED_NO_BASELINE.size} expected refusals`);
console.log(problems.length ? `${problems.length} problem(s): ${JSON.stringify(counts)}` : 'corpus clean');
process.exit(problems.length ? 1 : 0);

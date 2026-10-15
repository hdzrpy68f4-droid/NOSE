'use strict';
/* NOSE - which dates each accepted fixture prints, and which the parser reads.
 *
 *   node test/date-probe.js            the table, then a count per lab
 *   node test/date-probe.js --labels   only the count per lab and label
 *
 * Read-only, offline, not a gate. Written for Prompt 7 (PARSER-HANDOFF s13,
 * "When the lab finished"): the report-date labels of Prompt 2 were guessed,
 * so this measures them. For every ACCEPTED fixture it prints the lab and
 * what the parser reads - harvestDate, reportDate, harvestOn, reportOn and,
 * where the parser has it, testedOn - then every line whose label ends in
 * "Date:", "Completed:" or "Created:", with the line after it. A label is
 * matched with or without a value after it on the same line, so both
 * "Completed: 11/08/24 11:59" and "Completed:" followed by its value show.
 * Then, per lab: how many fixtures are dated (harvestOn or reportOn, and
 * testedOn when present), and on how many fixtures each label appears.
 *
 * Lines are split as the parser splits them (trimmed, blank lines dropped).
 * Prints only what the fixtures print: no secrets, nothing from the archive.
 *
 * Needs test/fixtures/extracted (node test/extract-dump.js).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXTRACTED = path.join(ROOT, 'test/fixtures/extracted');
const { parseCoa } = require(path.join(ROOT, 'netlify/functions/lib/parse-coa.js'));

const LABEL = /(?:^|[^A-Za-z])((?:[A-Za-z][A-Za-z/&().'-]*\s+){0,4}(?:Date|Completed|Created))\s*:/gi;
const onlyLabels = process.argv.includes('--labels');

if (!fs.existsSync(EXTRACTED)) {
  console.error('FAIL: test/fixtures/extracted is missing - run: node test/extract-dump.js');
  process.exit(1);
}

const lines = text => String(text).replace(/\u00A0/g, ' ').split('\n').map(l => l.trim()).filter(Boolean);
const shown = v => (v === null || v === undefined ? '-' : JSON.stringify(v));

const names = fs.readdirSync(EXTRACTED).filter(f => f.endsWith('.txt')).map(f => f.slice(0, -4)).sort();
const byLab = new Map();
let accepted = 0, refused = 0;

for (const name of names) {
  const text = fs.readFileSync(path.join(EXTRACTED, `${name}.txt`), 'utf8');
  const out = parseCoa(text);
  if (!out.usable) { refused++; continue; }
  accepted++;
  const lab = out.lab || '(lab not recognised)';
  if (!byLab.has(lab)) byLab.set(lab, { fixtures: 0, dated: 0, datedWithTested: 0, labels: new Map(), example: new Map() });
  const L = byLab.get(lab);
  L.fixtures++;
  if (out.harvestOn || out.reportOn) L.dated++;
  if (out.harvestOn || out.testedOn || out.reportOn) L.datedWithTested++;

  const ls = lines(text);
  const found = [];
  const seenHere = new Set();
  ls.forEach((line, i) => {
    LABEL.lastIndex = 0;
    let m;
    const labels = [];
    while ((m = LABEL.exec(line))) labels.push(m[1].replace(/\s+/g, ' '));
    if (!labels.length) return;
    const endsWithLabel = /:\s*$/.test(line);
    const next = endsWithLabel ? (ls[i + 1] ?? '(end of text)') : null;
    found.push({ n: i + 1, line, next });
    for (const l of labels) {
      seenHere.add(`${l}:`);
      if (!L.example.has(`${l}:`)) L.example.set(`${l}:`, `${name}: ${JSON.stringify(next === null ? line : `${line} / ${next}`)}`);
    }
  });
  for (const l of seenHere) L.labels.set(l, (L.labels.get(l) || 0) + 1);

  if (onlyLabels) continue;
  console.log(`\n${name}  |  ${lab}  |  ${out.productClass}`);
  console.log(`  harvestDate ${shown(out.harvestDate)}   reportDate ${shown(out.reportDate)}   ` +
              `harvestOn ${shown(out.harvestOn)}   reportOn ${shown(out.reportOn)}` +
              ('testedOn' in out ? `   testedOn ${shown(out.testedOn)}` : ''));
  if (!found.length) console.log('  (no line with a Date:, Completed: or Created: label)');
  for (const f of found) {
    console.log(`  ${String(f.n).padStart(4)}  ${f.line}`);
    if (f.next !== null) console.log(`        -> ${f.next}`);
  }
}

console.log(`\n${accepted} accepted fixtures (${refused} refused, not shown), by lab:`);
const hasTested = names.length && 'testedOn' in parseCoa(fs.readFileSync(path.join(EXTRACTED, `${names[0]}.txt`), 'utf8'));
let dated = 0, datedT = 0;
for (const [lab, L] of [...byLab].sort((a, b) => a[0].localeCompare(b[0]))) {
  dated += L.dated; datedT += L.datedWithTested;
  console.log(`\n  ${lab}: ${L.fixtures} accepted, ${L.dated} dated by harvestOn or reportOn` +
              (hasTested ? `, ${L.datedWithTested} by harvestOn, testedOn or reportOn` : ''));
  for (const [label, n] of [...L.labels].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`      ${String(n).padStart(2)} of ${L.fixtures}  ${label.padEnd(22)} first seen ${L.example.get(label)}`);
  }
}
console.log(`\ndated: ${dated} of ${accepted} by harvestOn or reportOn` +
            (hasTested ? `; ${datedT} of ${accepted} by harvestOn, testedOn or reportOn` : ''));

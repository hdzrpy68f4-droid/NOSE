'use strict';
/* NOSE — extraction diagnostic.
 *
 *   node test/extraction-diff.js <name> [lines]
 *
 * e.g.  node test/extraction-diff.js Kush_Creek
 *
 * Prints, side by side, what pdftotext produced (the committed fixture) and
 * what the production extractor produces, around the terpene table. Use this
 * instead of guessing when a lab shows up as DIFFER: the shape of the two
 * outputs tells you immediately whether the problem is line reconstruction,
 * ordering, or a genuinely different table layout.
 */
const fs = require('fs');
const path = require('path');

const name  = process.argv[2];
const count = Number(process.argv[3] || 30);
if (!name){
  console.error('usage: node test/extraction-diff.js <fixture-name> [lines]');
  console.error('       (name without .pdf/.txt, e.g. Kush_Creek)');
  process.exit(1);
}

const txtFp = path.resolve('test/fixtures/coa', name + '.txt');
const pdfFp = path.resolve('test/fixtures/pdf', name + '.pdf');
for (const fp of [txtFp, pdfFp])
  if (!fs.existsSync(fp)){ console.error('not found: ' + fp); process.exit(1); }

const { extractCoaText } = require(path.resolve('netlify/functions/lib/extract-text.js'));

/* Anchor on the terpene table rather than the top of the document, since the
   first page is mostly letterhead in both extractions. */
function windowAround(lines){
  const i = lines.findIndex(l => /^(TERPENES?|Terpenes Summary|TERPENES SUMMARY|Terpene Screen by GC\/MS)/i.test(l));
  const from = i < 0 ? 0 : i;
  return lines.slice(from, from + count);
}

(async () => {
  const txtLines = fs.readFileSync(txtFp, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
  const { text } = await extractCoaText(fs.readFileSync(pdfFp));
  const pdfLines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const a = windowAround(txtLines), b = windowAround(pdfLines);
  console.log(`\n${name}   pdftotext: ${txtLines.length} lines | extractor: ${pdfLines.length} lines\n`);
  console.log('  ' + 'pdftotext (fixture)'.padEnd(40) + '| extractor (production)');
  console.log('  ' + '-'.repeat(40) + '+' + '-'.repeat(40));
  for (let i = 0; i < Math.max(a.length, b.length); i++){
    const L = (a[i] || '').slice(0, 38).padEnd(40);
    const R = (b[i] || '').slice(0, 38);
    console.log('  ' + L + '| ' + R);
  }
  console.log('\nIf the right column packs several cells onto one line, line');
  console.log('reconstruction is wrong. If the cells are there but in a different');
  console.log('order, it is an ordering difference and needs a parser handler.');
})();

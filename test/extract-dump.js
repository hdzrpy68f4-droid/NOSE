'use strict';
/* NOSE — dump the production extraction of every fixture PDF.
 *
 *   node test/extract-dump.js [pdf-dir] [out-dir]
 *
 * Writes one .txt per PDF using the SAME extractor the Netlify function will
 * use. Two uses:
 *
 *   1. Feed the gate harness the production text instead of the pdftotext
 *      fixtures, so parser fixes can be checked against what production
 *      actually sees:
 *        node test/coa-gate-test.js test/fixtures/extracted \
 *             netlify/functions/lib/parse-coa.js
 *
 *   2. Share the output, so parser work can happen without an unpdf install.
 *
 * These files are DERIVED - regenerate rather than hand-edit, and keep them out
 * of git alongside the COA fixtures themselves.
 */
const fs = require('fs');
const path = require('path');

const pdfDir = path.resolve(process.argv[2] || 'test/fixtures/pdf');
const outDir = path.resolve(process.argv[3] || 'test/fixtures/extracted');
const { extractCoaText } = require(path.resolve('netlify/functions/lib/extract-text.js'));

if (!fs.existsSync(pdfDir)){
  console.error(`ERROR: no PDF directory at ${pdfDir}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const pdfs = fs.readdirSync(pdfDir).filter(f => /\.pdf$/i.test(f)).sort();
  if (!pdfs.length){ console.error(`ERROR: no PDFs in ${pdfDir}`); process.exit(1); }

  let ok = 0;
  for (const f of pdfs){
    const name = f.replace(/\.pdf$/i, '');
    try {
      const { text, pages } = await extractCoaText(fs.readFileSync(path.join(pdfDir, f)));
      fs.writeFileSync(path.join(outDir, name + '.txt'), text);
      const lines = text.split('\n').filter(l => l.trim()).length;
      console.log(`${String(pages).padStart(2)}pp  ${String(lines).padStart(5)} lines  ${name}`);
      ok++;
    } catch (e){
      console.log(`FAILED  ${name}: ${e.message}`);
    }
  }
  console.log(`\n${ok}/${pdfs.length} extracted to ${path.relative(process.cwd(), outDir)}`);
})();

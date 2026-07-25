'use strict';
/* NOSE — extraction parity test.
 *
 *   node test/extraction-parity.js <pdf-dir> [baseline.json] [parser] [extractor]
 *
 * The 16 committed fixtures were extracted with poppler's `pdftotext`, which
 * will not exist in a Netlify function. Production will use unpdf (pdf.js), and
 * pdf.js decides line breaks with a DIFFERENT algorithm. Line order is the one
 * thing parse-coa.js completely depends on.
 *
 * So this compares the parser's OUTPUT — not the extracted text, which will
 * legitimately differ. If a lab's numbers survive the change of extractor, that
 * lab is safe in production. If they do not, this says which lab and by how
 * much, rather than leaving it to be discovered by a user.
 */
const fs = require('fs');
const path = require('path');

const pdfDir     = path.resolve(process.argv[2] || 'test/fixtures/pdf');
const baselineFp = path.resolve(process.argv[3] || 'test/fixtures/coa-baseline.json');
const parserFp   = path.resolve(process.argv[4] || 'netlify/functions/lib/parse-coa.js');
const extractFp  = path.resolve(process.argv[5] || 'netlify/functions/lib/extract-text.js');

function die(msg, hint){
  console.error(`\nERROR: ${msg}`);
  if (hint) console.error(hint);
  process.exit(1);
}

for (const [label, fp] of [['baseline', baselineFp], ['parser', parserFp], ['extractor', extractFp]])
  if (!fs.existsSync(fp)) die(`${label} not found at ${fp}`);
if (!fs.existsSync(pdfDir))
  die(`PDF directory not found: ${pdfDir}`,
      'This test needs the original PDFs, not the .txt fixtures.');

const baseline = JSON.parse(fs.readFileSync(baselineFp, 'utf8'));
const { parseCoa } = require(parserFp);
const { extractCoaText } = require(extractFp);

/* Percentage-point tolerance on coverage. Extractors may differ on whether a
   trailing unit token lands on its own line, which can shift coverage a hair
   without changing the fingerprint. Anything larger is a real divergence. */
const COVERAGE_TOLERANCE = 0.2;

(async () => {
  const pdfs = fs.readdirSync(pdfDir).filter(f => /\.pdf$/i.test(f)).sort();
  if (!pdfs.length) die(`no PDFs found in ${pdfDir}`);

  let match = 0, differ = 0, missing = 0, threw = 0;

  for (const f of pdfs){
    const name = f.replace(/\.pdf$/i, '');
    const want = baseline[name];
    if (!want){ missing++; console.log(`NO BASE  ${name}`); continue; }

    let got;
    try {
      const { text } = await extractCoaText(fs.readFileSync(path.join(pdfDir, f)));
      got = parseCoa(text);
    } catch (e){
      threw++; console.log(`THREW    ${name}\n           - ${e.message}`); continue;
    }

    const problems = [];
    if (got.usable !== want.usable)
      problems.push(`usable ${want.usable} -> ${got.usable}`);

    /* If the COA is refused under BOTH extractors the decision agrees, and that
       is the whole contract for a rejected document: its numbers never reach a
       palate. Comparing them anyway reports differences in values nobody will
       ever use, which buries the real divergences. */
    if (!want.usable && !got.usable){
      match++;
      console.log(`AGREE    ${name}  [${want.lab}]  (refused by both)`);
      continue;
    }

    if (got.totalTerpenes !== want.totalTerpenes)
      problems.push(`total ${want.totalTerpenes} -> ${got.totalTerpenes}`);
    if (Object.values(got.terps).filter(v => v > 0).length !== want.nonZeroTerps)
      problems.push(`terpene count ${want.nonZeroTerps} -> ${Object.values(got.terps).filter(v => v > 0).length}`);

    const gotCov = got.coverage == null ? null : Number((got.coverage * 100).toFixed(1));
    if ((gotCov == null) !== (want.coverage == null))
      problems.push(`coverage ${want.coverage} -> ${gotCov}`);
    else if (gotCov != null && Math.abs(gotCov - want.coverage) > COVERAGE_TOLERANCE)
      problems.push(`coverage ${want.coverage}% -> ${gotCov}%`);

    /* The fingerprint itself is what feeds the palate, so compare every key. */
    for (const k of new Set([...Object.keys(want.terps), ...Object.keys(got.terps)])){
      const a = want.terps[k] ?? 0, b = got.terps[k] ?? 0;
      if (Math.abs(a - b) > 1e-6) problems.push(`${k} ${a} -> ${b}`);
    }

    if (problems.length){
      differ++;
      console.log(`DIFFER   ${name}  [${want.lab}]`);
      problems.forEach(p => console.log(`           - ${p}`));
    } else {
      match++;
      console.log(`MATCH    ${name}  [${want.lab}]`);
    }
  }

  console.log(`\n${match} match / ${differ} differ / ${missing} no-baseline / ${threw} threw`);
  if (differ || threw){
    console.log('\nA DIFFER means unpdf orders that lab\'s text differently from pdftotext.');
    console.log('The parser needs a handler for the unpdf ordering before that lab is');
    console.log('safe in production. Until then it should stay on the reject side.');
    process.exit(1);
  }
  console.log('\nExtraction parity holds: every lab yields the same fingerprint under unpdf.');
})();

'use strict';
/* NOSE — PDF text extraction for the COA parser.
 *
 *   npm install unpdf
 *
 * WHY unpdf: it ships a serverless build of Mozilla's PDF.js with no native
 * dependencies. pdf-parse pulls in `canvas` (via pdfjs-dist) which needs
 * node-gyp and a C++ toolchain that serverless runtimes cannot compile.
 *
 * WHY extractTextItems rather than extractText: parse-coa.js reads the raw text
 * LAYER and depends on line boundaries — one analyte per line. The row-wise
 * look-ahead, the column-run detection and the analyte un-gluing all rely on
 * it. extractText returns an opaque string; extractTextItems returns positioned
 * items with an explicit `hasEOL` flag, so line breaks are ours to control
 * rather than something we hope the library got right.
 *
 * IMPORTANT: pdf.js decides line breaks with a different algorithm from
 * poppler's `pdftotext`, which is what the committed fixtures were made with.
 * Run test/extraction-parity.js before trusting this in production — it checks
 * the parser's OUTPUT against coa-baseline.json rather than comparing text,
 * which is the thing that actually has to hold.
 */

/* Current pdf.js calls Math.sumPrecise, a recent TC39 addition that is absent
   from Node 22 and 24 builds still in wide use. Missing, it throws inside
   pdf.js's text layer, which swallows the error as a warning and returns an
   empty page - so extraction "succeeds" while yielding nothing. Install it
   before unpdf loads. Neumaier compensated summation, matching the spec's
   exactness (a naive sum of [1e100, 1, -1e100, 1] gives 1, not 2). */
if (typeof Math.sumPrecise !== 'function'){
  Math.sumPrecise = function sumPrecise(values){
    let sum = 0, comp = 0;
    for (const v of values){
      const x = Number(v);
      const t = sum + x;
      comp += Math.abs(sum) >= Math.abs(x) ? (sum - t) + x : (x - t) + sum;
      sum = t;
    }
    const r = sum + comp;
    return Number.isNaN(r) ? r : (r === 0 ? -0 : r);
  };
}

const MAX_PAGES = 40;   // a Florida COA runs 1-11 pages; beyond this is not a COA

/* One text item per line.
 *
 * This is the whole contract with parse-coa.js. Poppler's `pdftotext` (no
 * -layout), which every committed fixture was made with, emits each cell of a
 * table on its own line:
 *
 *     TOTAL TERPENES
 *     0.00700
 *     0.0200
 *
 * pdf.js text items correspond to the PDF's own draw operations, which in these
 * lab-generated documents are one per cell - so item-per-line reproduces that
 * shape. The parser then reads a name and looks AHEAD for its value.
 *
 * Do NOT join items by line (grouping on hasEOL or on y) even though that reads
 * more naturally. It glues a whole row into "D-Limonene10.005670.473", which
 * matches no analyte name, and the table silently yields nothing while isolated
 * labels elsewhere on the page still parse - so it fails looking like a layout
 * problem rather than an extraction one.
 *
 * hasEOL and the coordinates are deliberately unused here. They are kept in the
 * item stream for the caller because a future column-major heuristic may want
 * them, but line reconstruction must not depend on them. */
function itemsToLines(items){
  const lines = [];
  for (const it of items){
    const s = (it.str || '').trim();
    if (s) lines.push(s);
  }
  return lines;
}

/**
 * Extract the text layer of a COA PDF.
 * @param {Buffer|Uint8Array} data raw PDF bytes
 * @returns {Promise<{text: string, pages: number}>}
 */
async function extractCoaText(data){
  const { extractTextItems, getDocumentProxy } = await import('unpdf');

  const pdf = await getDocumentProxy(new Uint8Array(data));
  try {
    if (pdf.numPages > MAX_PAGES)
      throw new Error(`refusing to parse a ${pdf.numPages}-page document as a COA`);

    const { items } = await extractTextItems(pdf, { mergePages: false });
    /* mergePages: false yields one array per page; concatenate in page order so
       a section split across a page break still reads in sequence. Kaycha does
       exactly this — a terpene table continuing onto the next page. */
    const pages = Array.isArray(items[0]) ? items : [items];
    const text = pages.map(pageItems => itemsToLines(pageItems).join('\n')).join('\n');

    return { text, pages: pdf.numPages };
  } finally {
    /* pdf.js holds the document in memory until released. In a warm serverless
       container, skipping this leaks across invocations. */
    if (typeof pdf.destroy === 'function') await pdf.destroy();
  }
}

module.exports = { extractCoaText, itemsToLines };

'use strict';
/* NOSE — COA parser.
 *
 * Reads the terpene panel off a Florida CMTL certificate of analysis and
 * returns a fingerprint plus an honest account of how complete it is.
 *
 * SCOPE: aroma and flavour only. Nothing here infers, ranks or describes
 * effects, and nothing should be added that does.
 *
 * Works on the RAW text layer (the order a JS PDF library yields), not layout
 * mode, because it has to run inside a Netlify function where `pdftotext
 * -layout` is unavailable.
 *
 * Verified against 13 real COAs from 7 laboratories. Templates currently
 * handled end-to-end: Kaycha Labs (flower + derivative) and Modern Canna
 * (flower + pod). ACS, ACT and TerpLife are column-major or verdict-after-
 * value layouts that are NOT yet handled — they are caught by the coverage
 * guard below and rejected rather than silently mis-parsed.
 */

/* ---------------------------------------------------------------- constants */

const LOOKAHEAD_LINES = 14;   // how far past an analyte name a result may sit
const COVERAGE_CEILING = 1.05; // mapped mass cannot exceed the lab's own total
const PERCENT_CEILING = 100;   // every terpene figure is a percentage of mass
const PRECISION = 6;          // lab data is ~3 sig figs; kill float noise

/* Lab analyte name -> NOSE terpene key. EXACT matching only: a substring match
   would fold "Caryophyllene oxide" into caryophyllene and silently inflate the
   dominant family. Every spelling below was observed on a real certificate. */
const ANALYTE_MAP = {
  // --- citrus
  'LIMONENE': 'limonene',
  'D-LIMONENE': 'limonene',
  '(R)-(+)-LIMONENE': 'limonene',      // ACS
  // --- earthy
  'MYRCENE': 'myrcene',
  'BETA-MYRCENE': 'myrcene',
  // --- spice
  'CARYOPHYLLENE': 'caryophyllene',
  'BETA-CARYOPHYLLENE': 'caryophyllene',
  'TRANS-CARYOPHYLLENE': 'caryophyllene',   // ACS
  'E-CARYOPHYLLENE': 'caryophyllene',       // TerpLife / Method
  'HUMULENE': 'humulene',
  'ALPHA-HUMULENE': 'humulene',
  // --- pine
  'ALPHA-PINENE': 'pinene_a',
  'BETA-PINENE': 'pinene_b',
  'FENCHOL': 'fenchol',
  'FENCHYL ALCOHOL': 'fenchol',             // same compound as fenchol
  'ENDO-FENCHYL ALCOHOL': 'fenchol',        // Method
  'ALPHA-FENCHYL ALCOHOL, (+)-': 'fenchol', // TerpLife
  'ALPHA-FENCHYL ALCOHOL, (+)': 'fenchol',  // ...as left by the glue split
  'CAMPHENE': 'camphene',
  // --- floral
  'LINALOOL': 'linalool',
  'BISABOLOL': 'bisabolol',
  'ALPHA-BISABOLOL': 'bisabolol',
  'ALPHA BISABOLOL, L': 'bisabolol',         // TerpLife (space, not hyphen)
  'TERPINEOL': 'terpineol',
  'ALPHA-TERPINEOL': 'terpineol',
  'TRANS-NEROLIDOL': 'nerolidol',           // cis + trans are summed (rule 6)
  'CIS-NEROLIDOL': 'nerolidol',
  'E-NEROLIDOL': 'nerolidol',
  'Z-NEROLIDOL': 'nerolidol',
  // --- herbal
  'TERPINOLENE': 'terpinolene',
  'ALPHA-TERPINOLENE': 'terpinolene',
  'OCIMENE': 'ocimene',
  'OCIMENE, TOTAL': 'ocimene',              // Modern Canna flower
  'OCIMENES': 'ocimene',                    // Method
  'BETA-OCIMENE': 'ocimene',
  'TRANS-OCIMENE': 'ocimene',
  'CIS-OCIMENE': 'ocimene',
  'TRANS-B-OCIMENE': 'ocimene',             // ACT
  'CIS-B-OCIMENE': 'ocimene',
  'FARNESENE': 'farnesene',                 // acyclic sesquiterpene homolog of
  'ALPHA-FARNESENE': 'farnesene',           // ocimene; isomers sum like nerolidol
  'BETA-FARNESENE': 'farnesene',
  'TRANS-FARNESENE': 'farnesene',
  'CIS-FARNESENE': 'farnesene',
  'TRANS-BETA-FARNESENE': 'farnesene',      // Modern Canna
  'TRANS-B-FARNESENE': 'farnesene'          // ACT
};

/* Terpenes a lab may report that NOSE does not model. Tracked only so we can
   tell the user how much of the measured mass the fingerprint represents.
   Caryophyllene OXIDE is deliberately here and NOT mapped to caryophyllene. */
const UNMODELLED = /^(GUAIOL|\(\+\/-\)-BORNEOL|BORNEOL|ISOBORNEOL|CARYOPHYLLENE OXIDE|CAMPHOR|CAMPHORS|\[\+\/-\]-CAMPHOR|CEDROL|\(\+\)-CEDROL|EUCALYPTOL|1,8-CINEOLE \(EUCALYPTOL\)|GERANIOL|GERANYL ACETATE|HEXAHYDROTHYMOL|ISOPULEGOL|MENTHOL|DL-MENTHOL|NEROL|P-CYMENE|PULEGONE|\(\+\)-PULEGONE|SABINENE|SABINENE HYDRATE|VALENCENE|ALPHA-CEDRENE|ALPHA-PHELLANDRENE|ALPHA-TERPINENE|GAMMA-TERPINENE|GAMMA-TERPINEOL|3-CARENE|3-CARENE \(\+\)-?|3-CARENE \(\+\)-|DELTA-3-CARENE|D-3-CARENE|FENCHONE|\(\+\/-\)-FENCHONE|NEROLIDOL)$/i;

/* Row labels that are structure, not analytes — used to stop the look-ahead
   and to keep them out of the unrecognised-name diagnostic. */
const SECTION_LABELS = /^(TOTAL TERPENES|MOISTURE CONTENT|WATER ACTIVITY|ACTIVITY OF WATER \(AW\)|PERCENT MOISTURE|ANALYTE|ANALYTES|RESULT|RESULTS|LOD|LOQ|MDL|PQL|LIMIT|DILUTION|DILN|STATUS|QUALIFIER|UNIT|%|MG\/G|MG\/UNIT|TESTED|PASS|PASSED|FAIL|NOT TESTED|COMPLETED)$/i;

/* Things that sit inside a terpene table but are not analytes. Without this
   the diagnostic below fills with cannabinoids, addresses and accreditation
   strings and the one real signal — a lab's unfamiliar spellings — gets lost. */
const NOT_AN_ANALYTE = /\b(CBD|CBDA|CBDV|CBG|CBGA|CBN|CBC|THC|THCA|THCV|THCVA|Total|Unit|Labs?|Laboratories|Laboratory|Accreditation|Director|LLC|Inc|PJLA|CMTL|SOP|Batch|Florida|Others|Reg\.|Limit|Widget|cfu|ppm|ppb|Absence|Coli|Salmonella|Aspergillus|Aflatoxin|Yeast|Mold)\b/i;

/* ACT writes Greek letters as bare initials: a-Pinene, b-Myrcene, g-Terpinene.
   This is notation, not chemistry - the same class as beta/β - so expanding it
   is safe and keeps ANALYTE_MAP from doubling in size. `d-` is deliberately
   NOT expanded: d-Limonene means dextrorotatory, not delta. */
function canonicalAnalyte(name){
  return name.toUpperCase()
    .replace(/^A-(?=[A-Z])/, 'ALPHA-')
    .replace(/^B-(?=[A-Z])/, 'BETA-')
    .replace(/^G-(?=[A-Z])/, 'GAMMA-');
}

/* --------------------------------------------------------------- primitives */

const round = n => (n == null ? n : Number(n.toFixed(PRECISION)));

function normalize(text){
  return String(text)
    .replace(/\uFB01/g, 'fi').replace(/\uFB02/g, 'fl')   // ligatures
    .replace(/\u00A0/g, ' ')
    .split('\n').map(l => l.trim()).filter(Boolean);
}

/* Spec rule 5: a printed "<0.0200" is below the limit of quantitation, which
   means 0 — never the printed number. A verdict like "PASS" carries no figure
   and must read as null (unknown), never 0: a water activity of 0 would look
   reassuringly safe when it was never measured. */
function resultToNumber(token, takeLast){
  if (token == null) return null;
  const t = String(token).trim();
  if (/^(ND|N\/D|NOT DETECTED|BQL|BLQ|ABSENT)$/i.test(t)) return 0;
  if (/^[<\u2264]/.test(t)) return 0;
  /* First number only, but tolerate thousands separators: stripping all
     non-digits turns "22.8% (798 mg)" into 22.8798, while ignoring commas
     turns "115,000" into 115. */
  const all = t.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g);
  if (!all) return null;
  /* Which end holds the value depends on where the row's verdict sits.
     Kaycha prints RESULT after the verdict, so trailing text is units and the
     FIRST number wins ("22.8% (798 mg)" must not become 22.8798). ACT prints
     the result immediately BEFORE the verdict, and when two columns collide
     ("115,000 1.8556" = LOQ + result) the rightmost is the value. */
  return Number(takeLast ? all[all.length - 1] : all[0]);
}

/* A value line is one or more numbers, optionally with a unit or a rendering
   artefact (TerpLife appends bar-chart glyphs after the figure). It must NOT
   accept arbitrary text that merely begins with a digit: "3-Carene" is an
   analyte, "1 of 6" is a page footer and "16 Corporate Drive" is the lab's
   address, and all three were being read as terpene values. */
const VALUE_LINE = /^[<\u2264]?\s*\d[\d.,]*(?:\s+[<\u2264]?\d[\d.,]*)*\s*(?:%|mg|mg\/g|mg\/unit|ug\/g|ug\/ml|ppm|ppb|aw)?\s*[^\w]*$/i;
const isNumberish = t => VALUE_LINE.test(String(t).trim());

/* Cannabinoid names, in the spellings observed across the seven labs. Never
   mapped into the vector (spec rule: cannabinoids are excluded) and used as a
   row boundary. */
const CANNABINOID = /^(?:(?:DELTA|D|\u0394)[\s-]?(?:8|9|10)[\s-]?)?(?:THC|CBD|CBG|CBN|CBC|CBL|CBT)[AV]?A?$|^(?:D|DELTA|\u0394)[\s-]?(?:8|9|10)[\s-]?THC[AV]?$|^THC[AV]A?$|^CBD[AV]A?$|^TOTAL\s+(?:THC|CBD|CANNABINOIDS?|ACTIVE\s+\w+)$|^\(6AR,9[SR]\)-D10-THC$/i;

/* Column headings and unit rows that Kaycha interleaves into the FIRST data row
   of each table. These must be stepped over rather than ending the row - the
   original bug was a look-ahead that stopped here and never reached the value. */
const SKIPPABLE_IN_ROW = /^(LIMIT|UNIT|UNITS|LOD|LOQ|MDL|PQL|DILUTION|DILN|STATUS|QUALIFIER|RESULT|RESULTS|ANALYTE|ANALYTES|PASS\/FAIL.*|RESULT \(%\)|\(?%\)?|\((?:MG\/G|MG\/UNIT|UG\/G|UG\/ML|NG\/G|PPM|PPB|AW|1:N)\)|MG\/G|MG\/UNIT|UG\/G|PPM|PPB|AW)$/i;
/* ND / BQL / <LOQ ARE results (=0), not blanks. Treating them as gaps let the
   look-ahead run past into the Dilution column and read "1" as a terpene. */
const isResultToken = t =>
  isNumberish(t) || /^(ND|N\/D|NOT DETECTED|BQL|BLQ|<\s*LOQ)$/i.test(String(t).trim());

/* ------------------------------------------------------- document metadata */

const LABS = [
  [/kaycha/i,                         'Kaycha Labs'],
  [/modern\s*canna/i,                 'Modern Canna'],
  [/ACS Laboratory|acslab/i,          'ACS Laboratory'],
  [/ACT Lab|actlab/i,                 'ACT Laboratories'],
  [/terplife|TL Laboratories/i,       'TerpLife Labs'],
  [/method testing/i,                 'Method Testing Labs'],
  [/green scientific/i,               'Green Scientific Labs']
];

/* Product class drives three things that are NOT comparable across forms:
   the intensity axis (flower runs ~1-3% total, concentrates 3-9%), whether
   the freshness signals apply at all, and whether terpene origin can be
   asserted. It never touches the aroma vector — normalising to share-of-total
   already makes the shape scale-invariant. Ordered: most specific first. */
const CLASSES = [
  [/all[- ]?in[- ]?one vape|\bvape\b|\bcart(ridge)?\b|Sample Matrix:\s*Pod|^Pod$/im, 'vape'],
  [/live resin|live sauce|\brosin\b|shatter|badder|distillate|Derivative Product Intended for Inhalation/i, 'concentrate'],
  [/edible gummy|\bgummy\b|Ingestible, Beverage/i, 'edible'],
  [/\btincture\b/i, 'tincture'],
  [/topical|muscle rub|roll[- ]?on|Derivative Non-inhalable/i, 'topical'],
  [/Usable Whole Flower|Whole Flower|Flower Inhalable|Matrix:\s*Flower\b|Flower\s*-?\s*Cured|Flower & Plants|Plant, Flower/i, 'flower']
];

function detectLab(text){
  for (const [re, name] of LABS) if (re.test(text)) return name;
  return null;
}

function detectProductClass(text){
  for (const [re, cls] of CLASSES) if (re.test(text)) return cls;
  return 'unknown';
}

/* Did the lab actually run the terpene panel? Method Testing Labs prints the
   full analyte list with EMPTY value columns under a NOT TESTED banner, which
   previously produced a terpene out of an empty table. Matching is tight on
   purpose: a loose search false-positives on Modern Canna flower, which prints
   "Potency Completed Homogeneity Not Tested Terpenes Completed" on ONE line. */
function terpenesWereTested(lines){
  const NOT = /^NOT\s*TESTED$/i;
  const OK  = /^(TESTED|COMPLETED|PASS|PASSED)$/i;
  let sawPositive = false, sawNegative = false;
  for (let i = 0; i < lines.length; i++){
    if (/^Terpenes\s+Not\s+Tested$/i.test(lines[i])){ sawNegative = true; continue; }
    if (!/^TERPENES$/i.test(lines[i])) continue;
    const nxt = lines[i + 1];
    if (nxt && NOT.test(nxt)) sawNegative = true;
    if (nxt && OK.test(nxt)) sawPositive = true;
  }
  /* A positive verdict outranks a negative one. In a column-major summary the
     tiles interleave, so a bare "Terpenes" can land next to the "Not Tested"
     belonging to a NEIGHBOURING tile — seen on ACT, where the real verdict
     ("Terpenes / Pass") appears later beside the actual results table. A COA
     that genuinely skipped the panel never states a positive anywhere. */
  if (sawPositive) return true;
  if (sawNegative) return false;
  return null;
}

function cleanStrain(value){
  if (!value) return null;
  /* ACT appends other fields to the same line:
     "Purple Brulee, Unit Weight: 28.0000g" */
  return String(value).split(/,\s*(?=(?:[A-Z][A-Za-z]*\s+)*[A-Z][A-Za-z]*\s*[:#])/)[0]
    .replace(/\s{2,}/g, ' ').trim() || null;
}

/* ------------------------------------------------------------------- parser */

function parseCoa(text){
  const lines = normalize(text);
  const terps = {};
  const unmapped = new Set();      // diagnostic only — never enters the vector
  let unmodelledTotal = 0;
  let totalTerpenes = null, moisture = null, waterActivity = null;
  let strain = null, harvestDate = null, batch = null, labId = null;

  /* Several labs print the SAME analyte twice — a page-1 "top ten" summary and
     the full screen further in (Modern Canna flower, ACS, ACT). The accumulator
     below exists to sum cis- + trans-nerolidol, so a repeated row silently
     DOUBLES that terpene. Dedupe on the exact printed name: genuine isomer
     pairs have different names and still accumulate correctly. */
  const seenAnalyte = new Set();
  let inTerpeneSection = false;
  /* Analyte rows are collected with ALL their numeric candidates and resolved
     after the scan. Labs disagree on which column holds the percentage - ACS
     prints dilution, LOQ, mg/g then %, while Modern Canna prints % first and
     the limits after - so no fixed position works for both. The column is
     chosen instead by which one makes the table reconcile with the total the
     lab printed itself. Same principle as readColumnMajor, applied row-wise. */
  const analyteRows = [];

  for (let i = 0; i < lines.length; i++){
    const line = lines[i];

    if (!strain && /^(Strain|Cultivar):\s*/i.test(line))
      strain = cleanStrain(line.replace(/^(Strain|Cultivar):\s*/i, '').trim() || lines[i+1]);
    if (!harvestDate && /^Harvest Date:/i.test(line))
      harvestDate = (line.split(':')[1] || '').trim() || lines[i+1];
    if (!batch && /^Batch #:/i.test(line))  batch  = (line.split(':')[1] || '').trim() || lines[i+1];
    if (!labId && /^Lab ID:/i.test(line))   labId  = (line.split(':')[1] || '').trim() || lines[i+1];

    /* Track whether we are inside a terpene table, so unrecognised analyte
       names can be reported without dragging in every stray line of the
       pesticide panel. */
    if (/^(TERPENES?|Terpene Screen by GC\/MS|Terpenes Summary|TERPENES SUMMARY.*)$/i.test(line))
      inTerpeneSection = true;
    else if (/^(Pesticides?|Heavy Metals|Microbials?|Mycotoxins|Residual Solvents|Potency|Cannabinoids?|Filth\/Foreign Material|Foreign Matter|Microbial)$/i.test(line))
      inTerpeneSection = false;

    /* Modern Canna prints the total inline: "Total Terpenes: 3.73%", so an
       exact-match label test never fires and coverage silently comes back
       null. Kaycha prints a BARE label with the value in a later column. */
    const inlineTotal = line.match(/^Total\s+Terpenes\s*[:\u2013-]\s*(.+)$/i);
    if (inlineTotal){ totalTerpenes = resultToNumber(inlineTotal[1]); continue; }

    const upper = canonicalAnalyte(line);
    const key = ANALYTE_MAP[upper];
    const isUnmodelled = UNMODELLED.test(upper);
    const isTotal    = /^TOTAL TERPENES$/i.test(line);
    /* Bare "Moisture" is NOT matched: ACT uses it as a summary tile label on
       three separate pages before the actual result row, and the column-major
       page-1 block yields 2 where the truth is 8.5. Over-reading a freshness
       signal is worse than leaving it null, which honestly means "not read". */
    const isMoisture = /^(MOISTURE CONTENT|PERCENT MOISTURE)$/i.test(line);
    /* Modern Canna labels this "Activity of Water (Aw)" but prints the figure
       three lines later, behind an intervening SOP row, with the Dilution
       column in between — matching the label yields 1, not 0.53. Reading it
       needs the column-major handler, so we leave it unread rather than
       assert a wrong water activity. Null means "not read", which is true. */
    const isWater    = /^WATER ACTIVITY$/i.test(line);

    if (!key && !isUnmodelled && !isTotal && !isMoisture && !isWater){
      /* Unrecognised name inside a terpene table, followed by a result: almost
         certainly an analyte spelling we do not know yet. Surfacing these is
         how new lab vocabularies get found without opening the PDF by hand. */
      if (inTerpeneSection && !SECTION_LABELS.test(upper) && !NOT_AN_ANALYTE.test(line) &&
          /^[A-Za-z0-9(][A-Za-z0-9()+\-\/. ]{2,29}$/.test(line) &&
          /[A-Za-z]{3}/.test(line) &&              // must be a name, not a figure
          (line.match(/ /g) || []).length <= 1 &&
          lines[i+1] && isResultToken(lines[i+1]))
        unmapped.add(line);
      continue;
    }

    /* Look ahead for the verdict token, then take the value after it. Column
       headers get interleaved into the first data row of each table, so we
       cannot stop at "unexpected" tokens — only when the NEXT analyte begins. */
    let value = null, verdictValue = null;
    const numerics = [];
    for (let j = i + 1; j < Math.min(i + LOOKAHEAD_LINES, lines.length); j++){
      const nxt = lines[j].toUpperCase();
      if (/^(TESTED|PASSED|PASS|FAIL|FAILED)$/i.test(nxt)){
        /* Both Kaycha and ACT put a verdict in the row, on opposite sides of
           the result. Decide by looking at what follows the verdict: if it is
           a result token the value comes AFTER (Kaycha); if it is the next
           analyte name the value came BEFORE (ACT). No lab detection needed. */
        const after = lines[j + 1];
        if (after && isResultToken(after)) value = resultToNumber(after);
        else if (j - 1 > i)               value = resultToNumber(lines[j - 1], true);
        verdictValue = value;   // a verdict column pins the value; no guessing needed
        break;
      }
      /* Stop BEFORE considering the line as a value. Some analyte names begin
         with a digit - "3-Carene" - so isResultToken() accepts them and the
         name would be collected as the number 3. Harmless while the first
         candidate was taken, wrong the moment position matters. */
      if (ANALYTE_MAP[canonicalAnalyte(lines[j])] || UNMODELLED.test(nxt) ||
          /^(TOTAL TERPENES|MOISTURE CONTENT|WATER ACTIVITY)$/i.test(nxt)) break;
      /* Cannabinoids end the row. Modern Canna interleaves the two tables in
         its page-one summary, so the scan otherwise walks past "CBGa" and
         collects the cannabinoid's figure as a terpene value. Cannabinoids are
         excluded from the vector by spec, which makes this the natural boundary
         - and far more robust than enumerating each lab's column headings. */
      if (CANNABINOID.test(nxt)) break;
      if (isResultToken(nxt)) numerics.push(resultToNumber(lines[j]));
    }
    /* No verdict column: the value sits after the name (Modern Canna). Method
       prints TWO result columns, ug/g then %, so the first number in the row
       is 5841.48 where the answer is 0.584. Terpene figures are percentages of
       mass, so any candidate above 100 cannot be the percentage column - skip
       past it rather than trust position. Moisture and the totals are exempt:
       those are read from their own labelled rows. */
    if (value === null && numerics.length){
      /* Take the LAST plausible candidate in the row, not the first. Labs put
         the percentage in the rightmost result column, behind anything from a
         dilution factor to an LOQ to a mg/g figure:

           (R)-(+)-Limonene | 30.000 | 0.002 | 6.92 | 0.692
                              dilution  LOQ    mg/g    %

         Reading first-plausible returns the dilution factor. Percentages are
         also filtered to <= 100, which drops obviously-wrong units (Method
         prints ug/g at 5841.48 beside 0.584) before position is considered.
         Moisture, water activity and the TOTAL row are exempt. Each is read
         from its own labelled row with no competing result columns, and the
         total in particular feeds the column reader's checksum - taking the
         wrong number there breaks reconciliation for every column-major lab. */
      const isAnalyteRow = !isMoisture && !isWater && !isTotal;
      const usable = numerics.filter(n => n != null && n <= PERCENT_CEILING);
      value = (isAnalyteRow && usable.length) ? usable[0] : numerics[0];
    }
    if (value === null || value === undefined) continue;

    if (!isTotal && !isMoisture && !isWater){
      if (seenAnalyte.has(upper)) continue;          // repeat of a row already taken
      seenAnalyte.add(upper);
    }

    if (isTotal) totalTerpenes = value;              // may be corrected below
    else if (isMoisture){ if (moisture === null) moisture = value; }
    else if (isWater){ if (waterActivity === null) waterActivity = value; }
    else analyteRows.push({ key, isUnmodelled, verdictValue, candidates: numerics.slice() });
  }

  /* Some COAs print a row of "Total CBD / Total THC / Total Cannabinoids /
     Total Terpenes" headings then a matching row of values, so a naive
     look-ahead lands on Total THC. Pair them positionally instead. */
  const TOTAL_LABEL = /^Total (CBD|THC|Cannabinoids|Terpenes)$/i;
  for (let i = 0; i < lines.length; i++){
    if (!/^Total Terpenes$/i.test(lines[i])) continue;
    let start = i; while (start > 0 && TOTAL_LABEL.test(lines[start - 1])) start--;
    let end = i;   while (end + 1 < lines.length && TOTAL_LABEL.test(lines[end + 1])) end++;
    if (end === start) continue;
    const position = i - start;
    const values = [];
    for (let j = end + 1; j < Math.min(end + 2 + (end - start) * 2, lines.length); j++){
      if (/\d/.test(lines[j])) values.push(resultToNumber(lines[j]));
    }
    if (values[position] != null) totalTerpenes = values[position];
    break;
  }

  /* Resolve which candidate column holds the percentage.
   *
   * Rows that carried a verdict token are already pinned - Kaycha and ACT put
   * the result adjacent to TESTED/Passed, which removes the ambiguity. For the
   * rest, try each column position from the left AND from the right (tables are
   * ragged: a below-LOQ row prints fewer cells than a detected one), and keep
   * the position whose column accounts for the most of the printed total
   * without exceeding it. Exceeding is impossible; falling short is normal on a
   * top-ten panel. If nothing reconciles, fall back to the first plausible
   * value per row so behaviour degrades rather than disappears. */
  {
    const pinned = analyteRows.filter(r => r.verdictValue !== null);
    const loose  = analyteRows.filter(r => r.verdictValue === null);
    const pinnedSum = pinned.reduce((a, r) => a + (r.verdictValue || 0), 0);

    const valueAt = (r, dir, idx) => {
      const c = r.candidates.filter(n => n != null && n <= PERCENT_CEILING);
      if (!c.length) return null;
      return dir === 'L' ? (idx < c.length ? c[idx] : null)
                         : (idx < c.length ? c[c.length - 1 - idx] : null);
    };

    let choice = null;
    if (loose.length && totalTerpenes > 0){
      const maxLen = Math.max(...loose.map(r => r.candidates.length), 0);
      for (const dir of ['L', 'R']){
        for (let idx = 0; idx < maxLen; idx++){
          let sum = pinnedSum, filled = 0;
          for (const r of loose){
            const v = valueAt(r, dir, idx);
            if (v != null){ sum += v; filled++; }
          }
          if (!filled) continue;
          if (sum > totalTerpenes * (1 + RECONCILE_TOLERANCE)) continue;
          const share = sum / totalTerpenes;
          /* Only trust a column that accounts for most of the total. A weak
             match means the document is not really row-wise (ACS under poppler
             is column-major, where the best row-wise column reaches 39%), and
             accepting it would block the column reader with a plausible but
             wrong answer instead of letting the stronger reading win. */
          if (share < MIN_ROW_SHARE) continue;
          if (!choice || share > choice.share + 1e-9
              || (Math.abs(share - choice.share) < 1e-9 && dir === 'R' && choice.dir === 'L'))
            choice = { dir, idx, share };
        }
      }
    }

    for (const r of analyteRows){
      let v = r.verdictValue;
      if (v === null){
        if (choice){
          /* Absent at the chosen position means this row has fewer cells - a
             below-LOQ row on ACS prints one result where a detected row prints
             two. Contribute nothing rather than guess; guessing here reaches
             for the dilution factor. */
          v = valueAt(r, choice.dir, choice.idx);
        } else {
          const c = r.candidates.filter(n => n != null && n <= PERCENT_CEILING);
          v = c.length ? c[0] : (r.candidates.length ? r.candidates[0] : null);
        }
      }
      if (v === null || v === undefined) continue;
      if (r.isUnmodelled) unmodelledTotal += v;
      else terps[r.key] = (terps[r.key] || 0) + v;   // cis+trans nerolidol accumulate
    }
  }

  Object.keys(terps).forEach(k => { terps[k] = round(terps[k]); });
  unmodelledTotal = round(unmodelledTotal);

  let mappedTotal = round(Object.values(terps).reduce((a, b) => a + b, 0));
  let layout = 'row';

  /* If the row-wise pass produced more mass than the lab's own total, the
     document is not row-wise at all — it is column-major and we have been
     reading across columns. Retry with the column reader, which only returns
     a result if it reconciles against the printed total. */
  /* Attempt the column reader whenever the row pass looks wrong: nothing mapped,
     no total, or more mass than the lab's own total. It is self-validating - it
     returns null unless the column reconciles - so trying it more often costs
     nothing and catches documents where the row pass finds no analyte at all. */
  const rowPassLooksWrong = mappedTotal === 0 || !(totalTerpenes > 0)
    || mappedTotal > totalTerpenes * COVERAGE_CEILING;
  if (rowPassLooksWrong){
    const col = readColumnMajor(lines, totalTerpenes);
    if (col){
      totalTerpenes = col.totalTerpenes;
      Object.keys(terps).forEach(k => delete terps[k]);
      Object.assign(terps, col.terps);
      unmodelledTotal = col.unmodelledTotal;
      mappedTotal = col.mappedTotal;
      layout = 'column';
    }
  }
  const coverage = totalTerpenes > 0 ? mappedTotal / totalTerpenes : null;
  const terpenesTested = terpenesWereTested(lines);
  const lab = detectLab(text);
  const productClass = detectProductClass(text);

  /* The parser must never silently assert a scraped fingerprint. A profile may
     only become a palate entry when every check below passes; otherwise the
     extraction is still returned for display, flagged, so the person sees what
     was read AND why it was not accepted. */
  const rejectReasons = [];
  const nonZero = Object.values(terps).filter(v => v > 0).length;

  if (terpenesTested === false)
    rejectReasons.push('the lab did not run a terpene panel on this sample');
  if (totalTerpenes == null)
    rejectReasons.push('no total terpene figure printed, so coverage cannot be known');
  else if (!(totalTerpenes > 0))
    rejectReasons.push('lab reported a total of zero terpenes');
  if (nonZero === 0)
    rejectReasons.push('no modelled terpene measured above the limit of quantitation');
  if (coverage != null && coverage > COVERAGE_CEILING)
    rejectReasons.push(`coverage ${(coverage * 100).toFixed(1)}% exceeds the lab total — parse fault, not a lab finding`);
  /* Coverage alone is only an INTERNAL consistency check: it compares two
     numbers that can both be wrong. Terpene figures are percentages of mass,
     so anything above 100 means we are reading the wrong column entirely —
     a physical check that does not depend on the total being right. */
  const overPercent = Object.entries(terps).filter(([, v]) => v > PERCENT_CEILING);
  if (totalTerpenes != null && totalTerpenes > PERCENT_CEILING)
    rejectReasons.push(`total of ${totalTerpenes}% is not a possible percentage — wrong column read`);
  if (overPercent.length)
    rejectReasons.push(`${overPercent.map(([k]) => k).join(', ')} above 100% — wrong column read`);

  /* Freshness signals (moisture 9-13%, water activity < 0.65) describe the
     cure of plant material. On an extract they are not unknown, they are
     inapplicable — a different statement, and the honest one. */
  const freshnessApplies = productClass === 'flower';

  return {
    lab, strain, batch, labId, harvestDate, productClass,
    totalTerpenes, moisture, waterActivity, freshnessApplies,
    terps, mappedTotal, unmodelledTotal, coverage, layout,
    unmapped: [...unmapped].sort(),
    terpenesTested,
    usable: rejectReasons.length === 0,
    rejectReasons
  };
}

module.exports = {
  parseCoa,
  parseKaychaCoa: parseCoa,   // back-compat: the parser outgrew the name
  resultToNumber, detectProductClass, detectLab,
  ANALYTE_MAP, UNMODELLED
};

/* ------------------------------------------------- column-major fallback --
 * Some labs (ACS, ACT Florida, TerpLife) emit the terpene table COLUMN by
 * column rather than row by row: every analyte name in one run, then the LOQ
 * column, then the result column. Row-wise look-ahead cannot read this.
 *
 * The danger is picking the wrong column. On an ACS COA the LOQ run is exactly
 * as long as the name run, so positional pairing alone would happily return
 * a full set of limit values as if they were results — plausible, and silent.
 *
 * So the column is chosen by RECONCILIATION, not position: pair the names
 * against each candidate run, and keep the one whose summed mass matches the
 * total terpene figure the lab itself printed. A candidate that cannot
 * reconcile is not used at all. That makes the reader self-checking — it
 * either agrees with the lab's own arithmetic or it declines to answer.
 */
const RECONCILE_TOLERANCE = 0.03;   // 3% of the printed total
const MIN_ROW_SHARE = 0.5;          // a row-wise column must explain half the total

/* Some labs emit two adjacent analyte names as ONE line when the first ends
   in a stereochemistry marker: TerpLife yields
     "alpha-Fenchyl alcohol, (+)alpha Bisabolol, L"
   which is two analytes. Left glued, positional pairing shifts every value
   after that point by one - silent, and wrong for the whole rest of the
   table. Split after the marker, before any counting happens. */
function ungluAnalyteNames(lines){
  const out = [];
  for (const l of lines){
    if (/\(\+\)(?=[A-Za-z])/.test(l))
      l.split(/(?<=\(\+\))(?=[A-Za-z])/).forEach(x => out.push(x.trim()));
    else out.push(l);
  }
  return out;
}

function readColumnMajor(rawLines, printedTotal){
  const lines = ungluAnalyteNames(rawLines);

  const TOTAL_ROW = /^TOTAL TERPENES$/i;
  const isName = l => {
    const u = canonicalAnalyte(l);
    return Boolean(ANALYTE_MAP[u]) || UNMODELLED.test(u) || TOTAL_ROW.test(l);
  };

  // Runs of >=4 consecutive analyte names, and runs of >=4 consecutive results.
  const nameRuns = [], valueRuns = [];
  for (let i = 0; i < lines.length; i++){
    let j = i; while (j < lines.length && isName(lines[j])) j++;
    if (j - i >= 4){ nameRuns.push({ start: i, items: lines.slice(i, j) }); i = j - 1; continue; }
    j = i; while (j < lines.length && isResultToken(lines[j]) && !isName(lines[j])) j++;
    if (j - i >= 4){ valueRuns.push({ start: i, items: lines.slice(i, j) }); i = j - 1; }
  }
  if (!nameRuns.length || !valueRuns.length) return null;

  let bestOverall = null;

  for (const names of nameRuns){
    const totalIdx = names.items.findIndex(n => TOTAL_ROW.test(n));
    /* A value run may carry trailing extras the name column has no row for -
       TerpLife appends "75.25 mg/Unit" after the total. Accept runs at least
       as long as the name column and try both the leading and trailing
       alignment; the checksum below decides which (if either) is real. */
    const cands = [];
    for (const v of valueRuns){
      if (v.start <= names.start || v.items.length < names.items.length) continue;
      const n = names.items.length;
      cands.push({ items: v.items.slice(0, n) });
      if (v.items.length > n) cands.push({ items: v.items.slice(-n) });
    }

    for (const c of cands){
      /* The column carries its own checksum when the table includes a Total
         Terpenes row: the analyte values must sum to the figure sitting in
         that same column. Where the table has no total row we fall back to
         the one printed elsewhere on the certificate. */
      const declared = totalIdx >= 0 ? resultToNumber(c.items[totalIdx]) : printedTotal;
      if (!(declared > 0)) continue;

      let sum = 0;
      c.items.forEach((t, k) => { if (k !== totalIdx) sum += (resultToNumber(t) || 0); });

      /* One-sided on purpose. A column can never sum to MORE than the lab's own
         total - that means we are reading the wrong units (Method prints ug/g
         beside %, and the ug/g column sums to 23508 against a total of 2.52).
         But summing to LESS is legitimate and common: a "top ten" panel prints
         only part of the measured mass. Rejecting a shortfall would throw away
         exactly the partial profiles the coverage figure exists to disclose. */
      if (sum > declared * (1 + RECONCILE_TOLERANCE)) continue;

      /* Score by the SHARE of the declared total the column accounts for, not
         by raw sum. Raw sum is misleading: a misaligned slice can pick up a
         larger absolute figure while pairing every value to the wrong analyte
         (seen on TerpLife, where the trailing alignment stole the total row as
         a terpene and read the mg/Unit figure as the total). Share is bounded
         and comparable, so the honest column wins even against a bigger wrong
         one. Ties go to the more complete table. */
      const share = sum / declared;
      const better = !bestOverall
        || share > bestOverall.share + 1e-9
        || (Math.abs(share - bestOverall.share) < 1e-9
            && names.items.length > bestOverall.names.items.length);
      if (better) bestOverall = { names, run: c, totalIdx, declared, sum, share };
    }
  }
  if (!bestOverall) return null;

  const terps = {}, seen = new Set();
  let unmodelled = 0;
  bestOverall.names.items.forEach((name, k) => {
    if (k === bestOverall.totalIdx) return;
    const u = canonicalAnalyte(name);
    if (seen.has(u)) return;
    seen.add(u);
    const v = resultToNumber(bestOverall.run.items[k]);
    if (v == null) return;
    const key = ANALYTE_MAP[u];
    if (key) terps[key] = round((terps[key] || 0) + v);
    else if (UNMODELLED.test(u)) unmodelled = round(unmodelled + v);
  });

  const mapped = round(Object.values(terps).reduce((a, b) => a + b, 0));
  return { terps, unmodelledTotal: unmodelled, mappedTotal: mapped, totalTerpenes: bestOverall.declared };
}

module.exports.readColumnMajor = readColumnMajor;

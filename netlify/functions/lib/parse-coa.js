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

/* Which code produced a reading: the commit build.sh stamps (lib/version.js,
   PARSER-HANDOFF s13). Output only - nothing here branches on it. Guarded, so
   this file still runs on its own, as it does when attached to a parser
   session by itself (s1); it then reads 'dev'. */
let currentParserVersion = () => 'dev';
try {
  const version = require('./version');
  currentParserVersion = () => version.buildInfo().parserVersion;
} catch { /* running without lib/version.js */ }

/* harvestDate and reportDate as ISO days, for the archive (s7): lib/coa-dates.js.
   Output only, computed from the two fields after they are read - nothing here
   branches on it - and testedOn the same way (finishedOn, below). Guarded like
   version.js, so this file still runs on its own; all three then read null. */
let isoDate = () => null;
try { ({ isoDate } = require('./coa-dates')); } catch { /* running without lib/coa-dates.js */ }

/* ---------------------------------------------------------------- constants */

const LOOKAHEAD_LINES = 14;   // how far past an analyte name a result may sit
const COVERAGE_CEILING = 1.05; // mapped mass cannot exceed the lab's own total
const PERCENT_CEILING = 100;   // every terpene figure is a percentage of mass
const PRECISION = 6;          // lab data is ~3 sig figs; kill float noise
/* How many result cells may follow a verdict token. Kaycha prints two (mg and
   %); the bound stops the scan walking into the next row when a table ends. */
const MAX_RESULT_COLUMNS = 4;

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
  /* ACS prints a summed terpineol row on all seven of its fixtures, the way
     Modern Canna prints "Ocimene, Total". Six read <LOQ and zero out; ACS-LRS-002
     detects 0.193%, which was the whole of its 2.5% coverage shortfall. A
     document printing BOTH this and alpha-terpineol is read once, from this
     row, or refused if the two disagree (SUMMED_SPELLINGS, below). */
  'TOTAL TERPINEOL': 'terpineol',
  'TRANS-NEROLIDOL': 'nerolidol',           // cis + trans are summed (rule 6)
  'CIS-NEROLIDOL': 'nerolidol',
  /* Some labs print one summed Nerolidol row instead of the isomers. Left
     unmodelled it was measured and then dropped from the vector - the compound
     vanished from the fingerprint while coverage still looked healthy, the same
     way farnesene did. A document printing BOTH the summed row and its isomers
     is read once, from the summed row, or refused if the two disagree
     (SUMMED_SPELLINGS, below). */
  'NEROLIDOL': 'nerolidol',
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

/* Each key as a person reads it, for the sentences in rejectReasons - shown
   word for word, so never an internal key such as pinene_a. One name for
   every key ANALYTE_MAP can give; test/summed-rows-test.js checks that. The
   app's own names are in js/match-math, which the parser does not load. */
const PRINTED_NAME = {
  limonene: 'limonene', myrcene: 'myrcene', caryophyllene: 'β-caryophyllene', humulene: 'α-humulene',
  pinene_a: 'α-pinene', pinene_b: 'β-pinene', fenchol: 'fenchol', camphene: 'camphene',
  linalool: 'linalool', bisabolol: 'α-bisabolol', terpineol: 'terpineol', nerolidol: 'nerolidol',
  terpinolene: 'terpinolene', farnesene: 'farnesene', ocimene: 'ocimene'
};
const printedName = key => PRINTED_NAME[key] || String(key).replace(/_/g, ' ');

/* A terpene printed both as a total and as its isomers counts once.
 *
 * Several spellings above map to one key, and every reader adds each row that
 * maps to a key - that is how cis- and trans-nerolidol sum. A report that
 * prints BOTH a summed row and the isomer rows for one terpene was therefore
 * read with that terpene doubled. The comments here said the coverage ceiling
 * refused such a report; it did only when the doubled terpene was more than
 * about 5% of the total (COVERAGE_CEILING), and a smaller one was accepted
 * with one family inflated. Found 2026-11-12 on made-up reports
 * (test/summed-rows-test.js); no fixture prints both (PARSER-HANDOFF s11).
 *
 * Each spelling that is a sum by its own name is in SUMMED_SPELLINGS, each
 * that is one isomer by its own name in ISOMER_SPELLINGS. A bare OCIMENE,
 * TERPINEOL or FARNESENE is in neither - its name does not say which it is -
 * and behaves as it always has. When one read has both kinds for a key:
 *   - the two agree within RECONCILE_TOLERANCE of the summed row: the key
 *     takes the summed row alone
 *   - otherwise the report is refused, naming the terpene
 * The column choosers leave such an isomer row out of the sums they compare
 * with the lab's total, so the choice of column sees the corrected value too.
 * On a report with only one kind - every fixture - nothing here does anything. */
const SUMMED_SPELLINGS = new Set(['NEROLIDOL', 'TOTAL TERPINEOL', 'OCIMENE, TOTAL', 'OCIMENES']);
const ISOMER_SPELLINGS = new Set([
  'TRANS-NEROLIDOL', 'CIS-NEROLIDOL', 'E-NEROLIDOL', 'Z-NEROLIDOL',
  'ALPHA-TERPINEOL',
  'BETA-OCIMENE', 'TRANS-OCIMENE', 'CIS-OCIMENE', 'TRANS-B-OCIMENE', 'CIS-B-OCIMENE',
  'ALPHA-FARNESENE', 'BETA-FARNESENE', 'TRANS-FARNESENE', 'CIS-FARNESENE', 'TRANS-BETA-FARNESENE', 'TRANS-B-FARNESENE'
]);
/* The keys, among these rows, that both a summed spelling and an isomer
   spelling feed. Rows are { key, upper }. */
function keysPrintedBothWays(rows){
  const summed = new Set(), isomer = new Set();
  for (const r of rows){
    if (!r || !r.key) continue;
    if (SUMMED_SPELLINGS.has(r.upper)) summed.add(r.key);
    else if (ISOMER_SPELLINGS.has(r.upper)) isomer.add(r.key);
  }
  return new Set([...summed].filter(k => isomer.has(k)));
}
/* What a reader keeps while it adds rows to keys: per key, how much came from
   summed rows and how much from isomer rows. */
function summedTally(){
  const parts = {};
  return {
    note(key, upper, v){
      const kind = SUMMED_SPELLINGS.has(upper) ? 'summed' : ISOMER_SPELLINGS.has(upper) ? 'isomer' : null;
      if (!kind || !key) return;
      const p = parts[key] || (parts[key] = { summed: 0, isomer: 0, hasSummed: false, hasIsomer: false });
      p[kind] += v;
      p[kind === 'summed' ? 'hasSummed' : 'hasIsomer'] = true;
    },
    reset(){ Object.keys(parts).forEach(k => delete parts[k]); },
    /* Take the isomers back out of each key printed both ways, or name the
       key when the two disagree. Changes terps in place; returns the keys
       that disagree. */
    settle(terps){
      const disagree = [];
      for (const [key, p] of Object.entries(parts)){
        if (!p.hasSummed || !p.hasIsomer) continue;
        if (Math.abs(p.summed - p.isomer) <= RECONCILE_TOLERANCE * p.summed + 1e-9) terps[key] = round((terps[key] || 0) - p.isomer);
        else disagree.push(key);
      }
      return disagree;
    }
  };
}

/* Terpenes a lab may report that NOSE does not model. Tracked only so we can
   tell the user how much of the measured mass the fingerprint represents.
   Caryophyllene OXIDE is deliberately here and NOT mapped to caryophyllene. */
const UNMODELLED = /^(GUAIOL|\(\+\/-\)-BORNEOL|BORNEOL|ISOBORNEOL|CARYOPHYLLENE OXIDE|CAMPHOR|CAMPHORS|\[\+\/-\]-CAMPHOR|CEDROL|\(\+\)-CEDROL|EUCALYPTOL|1,8-CINEOLE \(EUCALYPTOL\)|GERANIOL|GERANYL ACETATE|HEXAHYDROTHYMOL|ISOPULEGOL|MENTHOL|DL-MENTHOL|NEROL|P-CYMENE|PULEGONE|\(\+\)-PULEGONE|SABINENE|SABINENE HYDRATE|VALENCENE|ALPHA-CEDRENE|ALPHA-PHELLANDRENE|ALPHA-TERPINENE|GAMMA-TERPINENE|GAMMA-TERPINEOL|3-CARENE|3-CARENE \(\+\)-?|3-CARENE \(\+\)-|DELTA-3-CARENE|D-3-CARENE|FENCHONE|\(\+\/-\)-FENCHONE)$/i;

/* Row labels that are structure, not analytes — used to stop the look-ahead
   and to keep them out of the unrecognised-name diagnostic. */
const SECTION_LABELS = /^(TOTAL TERPENES|MOISTURE CONTENT|WATER ACTIVITY|ACTIVITY OF WATER \(AW\)|PERCENT MOISTURE|ANALYTE|ANALYTES|RESULT|RESULTS|LOD|LOQ|MDL|PQL|LIMIT|DILUTION|DILN|STATUS|QUALIFIER|UNIT|%|MG\/G|MG\/UNIT|TESTED|PASS|PASSED|FAIL|NOT TESTED|COMPLETED)$/i;

/* Things that sit inside a terpene table but are not analytes. Without this
   the diagnostic below fills with cannabinoids, addresses and accreditation
   strings and the one real signal — a lab's unfamiliar spellings — gets lost. */
/* "Total" is here to keep cannabinoid totals out of the diagnostic, but it also
   suppressed the one signal designed to find new spellings: "Total Terpineol" was
   filtered as structure on seven ACS files and never surfaced, so a detected row
   went unread across a whole lab. Exempt a Total that names a compound the map
   does not know but which is not a cannabinoid - that is precisely the case
   `unmapped` exists to report. */
const TOTAL_OF_CANNABINOID = /^Total\s+(THC|CBD|CBG|CBN|CBC|CBL|CBT|Cannabinoids?|Active)/i;
const NOT_AN_ANALYTE = /\b(CBD|CBDA|CBDV|CBG|CBGA|CBN|CBC|THC|THCA|THCV|THCVA|Total|Unit|Labs?|Laboratories|Laboratory|Accreditation|Director|LLC|Inc|PJLA|CMTL|SOP|Batch|Florida|Others|Reg\.|Limit|Widget|cfu|ppm|ppb|Absence|Coli|Salmonella|Aspergillus|Aflatoxin|Yeast|Mold)\b/i;

/* Three more kinds of line that are not analytes - read by the unmapped
   diagnostic ALONE (notAnAnalyteHere, below). Nothing that reads a value sees
   them, so they move `unmapped` and `novelty` and never a reading. All three
   are furniture that four accepted ACS reports put in `unmapped`, and the card
   then told someone holding a jar from a known lab "NOSE hasn't seen this
   lab's layout before" (PARSER-HANDOFF s7).

   STRUCTURE_LABEL  a row label that is structure. Bare "Moisture" heads ACS's
                    moisture table - "Moisture / 15 / 12.8", limit then result
                    - and the freshness reader further down reads that very
                    row as the moisture figure. It stays OUT of SECTION_LABELS
                    on purpose: that list is also read by the look-ahead, where
                    it ends rows, and by novelty's known headings.
   ID_LABEL         a licence or identifier label. "License No." heads the
                    licence number on every ACS page. A label ending in No.,
                    Number or ID, or a bare License / Licence; no analyte name
                    ends that way.
   LABEL_ALONE      a "Label:" or "Label #:" with nothing after the colon. The
                    line after it is that label's value, however name-shaped:
                    "Lab Batch #:" then "AAGZ997-", the first half of a batch
                    code the extractor split from its "25". On the corpus, every
                    line after such a label inside a terpene section is a value
                    - a strain, a facility, a batch code, an instrument - and
                    none is an analyte. */
const STRUCTURE_LABEL = /^MOISTURE$/i;
const ID_LABEL = /^(?:[A-Za-z.]+ )?(?:No\.?|Number|ID)$|^Licen[cs]e$/i;
const LABEL_ALONE = /:$/;
const notAnAnalyteHere = (line, prev) =>
  STRUCTURE_LABEL.test(line) || ID_LABEL.test(line) || (prev != null && LABEL_ALONE.test(prev));

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
    /* Greek prefixes to ASCII before canonicalAnalyte ever sees the line. The
       trailing hyphen is consumed, so a beta-Myrcene written with the Greek
       letter becomes BETA-Myrcene rather than BETA--Myrcene, which would match
       no ANALYTE_MAP key. Only these three expand: \u03BC is micro and lives
       inside "(\u03BCg/g) = Micrograms per gram", present in eight fixtures,
       and \u0394 is already handled by CANNABINOID - a blanket \u03B1-\u03C9
       sweep would destroy both. [ \t] rather than \s because this runs BEFORE
       the split, and \s matches a newline: a Greek letter ending a line would
       glue that line to the next one. */
    .replace(/\u03B1[ \t]*-?[ \t]*/g, 'ALPHA-')
    .replace(/\u03B2[ \t]*-?[ \t]*/g, 'BETA-')
    .replace(/\u03B3[ \t]*-?[ \t]*/g, 'GAMMA-')
    .split('\n').map(l => l.trim()).filter(Boolean)
    /* Modern Canna's November 2026 flower template sets its below-limit sign
       (less-than-or-equal, U+2264) as a text item of its own: the sign on one
       line, "0.00492" on the next. Read apart, the bare number was a
       measurement: 0.00492 on every row below the limit, a cis-nerolidol added
       to trans, and a false "rows add up to 104%" warning on reports whose
       arithmetic closes (MCL-FLW-006, -007). Glued back on, resultToNumber sees
       one token starting with the sign and reads 0, as it does for Kaycha's
       "<0.00700". */
    .reduce((out, l) => {
      if (/^\d/.test(l) && /^[<\u2264]$/.test(out[out.length - 1])) out[out.length - 1] += l;
      else out.push(l);
      return out;
    }, []);
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
/* A "Dominant Terpenes" donut legend is a rounded summary with an "Others"
   bucket, never the authoritative table - ACT prints one on page 1 and the real
   panel later. Left alone it wins on first-occurrence dedupe and, because
   "Others" is not an analyte name, the preceding row runs on and collects the
   Others figure as its own value. Skip the block. Bounded by the next section
   heading, or a fixed window if none appears. */
const CHART_LEGEND_START = /^Dominant Terpenes$/i;

/* A page-one "top ten" summary, where the document ALSO carries a full panel
   later. The summary is a subset by definition, and under pdf.js Modern Canna
   emits it value-before-name, so read row-wise every figure lands on the
   compound above it - a fingerprint that looks entirely plausible and is
   entirely wrong. The full screen is authoritative and reads name-first, so the
   summary is skipped whenever a detailed panel is present. */
const TOPTEN_START = /^TERPENES SUMMARY \(Top Ten\)$/i;
/* Only a real detailed panel counts as the alternative to a top-ten summary.
   A bare "Terpenes" was matched here too, but that string is also the ANALYSIS
   SUMMARY status tile - so on a single-page COA the parser believed a fuller
   table existed later, skipped the only terpene table in the document, and
   reported that no terpene was measured. Modern Canna issues single-page
   reports for hand-rolls, where the summary IS the panel. */
const FULL_PANEL = /^(Terpene Screen by GC\/MS|TERPENE SCREEN.*|TERPENES)$/;
const TOPTEN_MAX = 60;
const CHART_LEGEND_END = /^(Cannabinoids?|Terpenes?|Potency|Microbials?|Mycotoxins|Pesticides|Heavy Metals|Residual Solvents|Water Activity|Moisture|Foreign Matt?er|Tests? Summary|Analysis Summary|Results?|Total Terpenes)$/i;
const CHART_LEGEND_MAX = 40;

const CANNABINOID = /^(?:(?:DELTA|D|\u0394)[\s-]?(?:8|9|10)[\s-]?)?(?:THC|CBD|CBG|CBN|CBC|CBL|CBT)[AV]?A?$|^(?:D|DELTA|\u0394)[\s-]?(?:8|9|10)[\s-]?THC[AV]?$|^THC[AV]A?$|^CBD[AV]A?$|^TOTAL\s+(?:THC|CBD|CANNABINOIDS?|ACTIVE\s+\w+)$|^\(6AR,9[SR]\)-D10-THC$/i;

/* Column headings and unit rows that Kaycha interleaves into the FIRST data row
   of each table. These must be stepped over rather than ending the row - the
   original bug was a look-ahead that stopped here and never reached the value. */
const SKIPPABLE_IN_ROW = /^(LIMIT|UNIT|UNITS|LOD|LOQ|MDL|PQL|DILUTION|DILN|STATUS|QUALIFIER|RESULT|RESULTS|ANALYTE|ANALYTES|PASS\/FAIL.*|RESULT \(%\)|\(?%\)?|\((?:MG\/G|MG\/UNIT|UG\/G|UG\/ML|NG\/G|PPM|PPB|AW|1:N)\)|MG\/G|MG\/UNIT|UG\/G|PPM|PPB|AW)$/i;
/* ND / BQL / <LOQ ARE results (=0), not blanks. Treating them as gaps let the
   look-ahead run past into the Dilution column and read "1" as a terpene. */
const isResultToken = t =>
  isNumberish(t) || /^(ND|N\/D|NOT DETECTED|BQL|BLQ|<\s*LOQ)$/i.test(String(t).trim());

/* An explicit non-detect marker is a RESULT cell, and rule 5 makes it 0. Only
   the non-numeric spellings count: "<0.200" is also below the LOQ, but it is a
   form a LIMIT column can take, and a row must never be zeroed by its own limit. */
const NON_DETECT = /^(ND|N\/D|NOT DETECTED|BQL|BLQ|ABSENT|<\s*LOQ)$/i;

/* A total printed in mass-per-mass units is not a percentage. "Total Terpenes:
   21.5 mg/g" is 2.15%, and reading it as 21.5 asserts the whole fingerprint an
   order of magnitude high - the lab's own mg/g column then reconciles perfectly
   against that total, so every internal check passes and only TYPICAL_MAX_TOTAL
   can object, which it will not do on any product whose real total is modest.
   mg/unit cannot be converted at all without knowing the unit's mass. Leave the
   total unread rather than assert it: a missing total refuses, a wrong one is
   believed. A line printing BOTH units ("21.5 mg/g (2.15%)") reads the figure
   its percent sign follows (since 2026-11-16; it read the first number, and a
   table printing mg/g beside % then reconciled in mg/g, ten times high, with
   only a warning). No fixture prints both; test/shifted-rows-test.js does. */
const INLINE_MASS_UNIT = /(?:^|[^A-Za-z])(?:mg\s*\/\s*g|mg\s*\/\s*unit|(?:u|\u00B5)g\s*\/\s*g)(?![A-Za-z])/i;

/* A line shaped like a compound name rather than a table cell: three or more
   letters, at most one space. Only ever used as a row boundary - never to
   decide what something IS, only that it is not part of the row above. */
const isNameShaped = t => {
  const s = String(t).trim();
  return (s.match(/[A-Za-z]/g) || []).length >= 3 && (s.match(/ /g) || []).length <= 1;
};

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
  /* Form beats material, and the form word is often only an acronym: a jar
     printing "AIO" three times and "Type: Distillate" once is a cart full of
     distillate, not a concentrate, and was read as one until AIO was listed. */
  /* A pen and a pod are vapes too. Kaycha names them only in the product line,
     "PW DISTILLATE PEN - BLACK BOX - ..." and "710 POD - PERSY ROSIN ...",
     over "Type: Distillate" and "Type: Rosin", so the material rule below
     made concentrates of them (KAY-AIO-005, KAY-CAR-005; 2026-11-20). Whole
     words only: the corpus and the 439 reports The Flowery listed that day
     print pen or pod nowhere else, and Modern Canna's bare "Pod" matrix line
     is the same word. */
  [/all[- ]?in[- ]?one vape|\bAIO\b|\bvape\b|\bcart(ridge)?\b|disposable|\bpens?\b|\bpods?\b/im, 'vape'],
  /* One bucket for every concentrate form. Labs name the texture rather than
     the category - budder, badder, wax, shatter, resin, rosin, water hash - and
     they all behave the same for our purposes. "Full Extract Cannabis Oil"
     matched nothing at all, so a FECO jar fell through to 'unknown', which
     carries NO plausibility ceiling and NO minimum-analyte check. Sauce is a
     texture too: Kaycha's spring 2026 sauces print only "Type: Sauce" under
     "Classification: High THC", and "live sauce" alone left them 'unknown'
     (KAY-LRS-011, 2026-11-20). Every report printing the word, in the corpus
     and among the 1,005 from The Flowery's site, is a concentrate. */
  [/live resin|\bsauce\b|\brosin\b|shatter|badder|budder|\bwax\b|water hash|bubble hash|\bhash\b|\bcrumble\b|\bsugar\b|\bdiamonds?\b|full extract cannabis oil|\bFECO\b|distillate|Derivative Product Intended for Inhalation/i, 'concentrate'],
  [/edible gummy|\bgummy\b|Ingestible, Beverage/i, 'edible'],
  [/\btincture\b/i, 'tincture'],
  [/topical|muscle rub|roll[- ]?on|Derivative Non-inhalable/i, 'topical'],
  /* Modern Canna's April 2026 juniors print "Product Name: FLOWER JUNIORS" over
     "Sample Matrix: Juniors" and no "Testing Matrix" row, so they read
     'unknown' (MCL-FLW-008, 2026-11-20); the November template adds "Testing
     Matrix: Usable Whole Flower Marijuana". The words appear in no other kind
     of report in the corpus or among the 1,005. */
  [/hand[- ]?roll|pre[- ]?roll|\bjoint\b|Usable Whole Flower|Whole Flower|Flower Inhalable|Matrix:\s*Flower\b|Flower\s*-?\s*Cured|Flower & Plants|Plant, Flower|\bflower juniors\b/i, 'flower']
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
    /* Look both ways. Modern Canna's ANALYSIS SUMMARY is emitted value-before-
       label under pdf.js, so "Terpenes / Completed" arrives as "Completed /
       Terpenes" and the token AFTER the label belongs to the next tile - which
       is how a fully-parsed report came back as "the lab did not run a terpene
       panel". A verdict on either side counts. */
    const nxt = lines[i + 1], prv = i > 0 ? lines[i - 1] : null;
    if (nxt && OK.test(nxt)) sawPositive = true;
    else if (prv && OK.test(prv)) sawPositive = true;
    else if (nxt && NOT.test(nxt)) sawNegative = true;
    else if (prv && NOT.test(prv)) sawNegative = true;
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

/* A metadata value may sit on the line after its label, but on documents that
   separate every label from its value the NEXT LINE IS ANOTHER LABEL - and was
   being taken as the value, so batch read "Batch Date:" and strain read
   "Processing Facility:". A trailing colon or a bare "#" means a label, never a
   value. */
const LOOKS_LIKE_LABEL = /[:#]\s*$/;
const valueOrNext = (inline, next) => {
  const v = String(inline || '').trim();
  if (v) return v;
  return (next && !LOOKS_LIKE_LABEL.test(next)) ? next : null;
};

/* The additive fields (s7) are stricter about the next line: after an empty
   "Client:", a line like "Address: 25548 County Rd" is another field with its
   value, not the client. A next line shaped "Label: value" - a label with no
   digits in it - is refused as well. Existing fields keep valueOrNext. */
const LABELLED_ROW = /^[A-Za-z][A-Za-z .#/()&'-]{0,40}:\s*\S/;
const ownValueOrNext = (inline, next) => {
  const v = String(inline || '').trim();
  if (v) return v;
  return (next && !LOOKS_LIKE_LABEL.test(next) && !LABELLED_ROW.test(next)) ? next : null;
};

/* When the lab finished: testedOn (additive, s7), the ISO day of ONE row per
   lab. The rows were measured, not guessed - test/date-probe.js over the 56
   accepted fixtures, 2026-10-05 (PARSER-HANDOFF s13, "When the lab
   finished") - after Prompt 2's report-date labels turned out to match two
   documents:

     Kaycha Labs          "Completed:", the value on the next line,
                          "07/11/25" - 22 of 22
     Modern Canna         "Completed:", the value on the next line,
                          "11/27/24 09:40" - 13 of 13. Colon labels only: its
                          summary also prints a bare "Completed" status tile
     ACS Laboratory       "Completion Date:", then "2026-06-24" - 8 of 8
     ACT Laboratories     "Report Created: 02/13/2025 18:18" - 3 of 3. One
                          layout wraps the label: a line ending "..., Report",
                          the next starting "Created: 07/31/2025 14:10". That
                          is the same label, and is read as it
     Method Testing Labs  no completion row, so the sign-off: the line after
                          "<name> - Lab Director", "3/3/2025, 7:11:00 PM" - 8
                          of 9; the older layout, which prints its labels
                          apart from their values, has none. Not "Batch Date:",
                          which sits with the client's batch number,
                          seed-to-sale number and lot ID - the batch's date,
                          not the lab's - and falls 3 to 5 days before the
                          sign-off on all 8. Method prints its times in UTC
                          (every batch date is midnight Eastern, shown as 4:00
                          or 5:00 AM), so a sign-off after 8 PM Eastern prints
                          the next day; on the 8 it is 2:47 to 9:46 PM UTC
     TerpLife Labs        none: its finish row is "Date Reported:", already
                          read as reportDate, and one row is not read twice

   Any other lab, or none recognised: null. The first row with a value is
   read, as the other metadata fields are, and that value is a date
   lib/coa-dates.js reads, or null - a later row never stands in for it.
   Computed after the reading, from the lines it saw; nothing branches on it. */
const FINISHED = {
  'Kaycha Labs':         { label: /^Completed\s*:\s*(.*)$/i },
  'Modern Canna':        { label: /^Completed\s*:\s*(.*)$/i },
  'ACS Laboratory':      { label: /^Completion Date\s*:\s*(.*)$/i },
  'ACT Laboratories':    { label: /^Report Created\s*:\s*(.*)$/i,
                           wrapped: { before: /(?:^|[\s,])Report$/i, label: /^Created\s*:\s*(.*)$/i } },
  'Method Testing Labs': { signedAfter: /\s-\sLab Director$/i }
};

function finishedOn(lines, lab){
  const rule = Object.prototype.hasOwnProperty.call(FINISHED, lab) ? FINISHED[lab] : null;
  if (!rule) return null;
  for (let i = 0; i < lines.length; i++){
    if (rule.signedAfter){
      if (i > 0 && rule.signedAfter.test(lines[i - 1])) return isoDate(lines[i]);
      continue;
    }
    const m = rule.label.exec(lines[i]) ||
              (rule.wrapped && i > 0 && rule.wrapped.before.test(lines[i - 1]) ? rule.wrapped.label.exec(lines[i]) : null);
    if (!m) continue;
    const value = ownValueOrNext(m[1], lines[i + 1]);
    if (value) return isoDate(value);
  }
  return null;
}

/* ------------------------------------------------------------------- parser */

function parseCoa(text){
  const lines = normalize(text);
  const terps = {};
  const unmapped = new Set();      // diagnostic only — never enters the vector
  let unmodelledTotal = 0;
  let totalTerpenes = null, moisture = null, waterActivity = null;
  let strain = null, harvestDate = null, batch = null, labId = null;
  let reportDate = null, client = null;   // additive output, s7

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
  /* Per key, what summed rows and isomer rows contributed to the reading
     that stands (SUMMED_SPELLINGS, above). Reset wherever terps is. */
  const tally = summedTally();
  let summedDisagree = [];
  let legendUntil = -1;   // index before which analyte rows are chart legend
  let totalPinned = false;
  /* The total's figure was printed BEFORE its label ("2.24%" then "Total
     Terpenes"): the document's own sign that it prints values ahead of
     names. Read by the backward reader's edge test alone. */
  let totalBeforeLabel = false;
  let totalCandidates = [];
  /* Set when a multi-column row layout has been resolved by reconciliation.
     The backward reader must not then re-pair the table: this document is
     name-first, and "before this name" is the previous row's result column. */
  /* Set by the unit-ratio cross-check further down, which runs before the
     warnings array exists. Merged in with the other warnings at the end. */
  let columnCrossCheck = null;
  /* Set by the column chooser when the total row prints two figures that
     could each be a percentage and no column reconciles with either. The
     forward reading would then be a guess between units. Refused further
     down while that reading stands. */
  let unitsUndecided = false;
  /* Set by the backward reader's decision when the table reads equally well
     with each figure before its name and after it, and nothing on the
     document says which. Refused further down. */
  let orderUndecided = false;
  /* Which reader produced the values that survive. `layout` only separates
     column-major from everything else, so the three row-wise readers are
     indistinguishable in the output - and "which stage read this?" was
     unanswerable without instrumenting the file by hand, which is how the
     BORNEOL column bug had to be found. Purely descriptive: nothing branches
     on it. */
  let readBy = 'forward';
  let columnResolved = false;// headline total taken from a skipped summary block
  /* Parallel record of each analyte row's value read forwards and backwards, so
     the correct side can be chosen after the whole table is known. */
  const beforeByRow = [], afterByRow = [], rowKeys = [];

  const isAnalyteRowForPairing = (t, m, w) => !t && !m && !w;

  /* Is the percentage above a bare "Total Terpenes" label already spoken for?
     On a run like

       Nerolidol | 0.217% | Total Terpenes | 4.53%

     lines[i-1] is Nerolidol's own result. Taking it unconditionally set the
     total to 0.217, and the coverage guard then refused the document with
     reasons that had nothing to do with it - which section 6 says to read as a
     parser fault, not a lab quirk. Walk back past the row's own result cells to
     the nearest NAME: if the map knows it, the percentage belongs to that
     analyte and not to this label. Canonicalised, like every other name test
     here, and paired with UNMODELLED like every other name test in this file.
     The same fault is possible above a Guaiol row, and an asymmetric name test
     is precisely the look-ahead bug in section 11 - ANALYTE_MAP canonicalised,
     UNMODELLED not, one row's boundary missed, one document's fingerprint
     changed, and no fixture able to expose it. Verified a no-op: no fixture has
     a compound name of either kind above a total label. */
  const ownerAboveIsAnalyte = (idx) => {
    for (let k = idx - 1; k >= 0 && k >= idx - LOOKAHEAD_LINES; k--){
      if (isResultToken(lines[k])) continue;
      const u = canonicalAnalyte(lines[k]);
      return Boolean(ANALYTE_MAP[u]) || UNMODELLED.test(u);
    }
    return false;
  };

  /* Is the percentage above a bare "Total Terpenes" label the figure of a
     cannabinoid tile, with this label's own figure below it? On a run of
     label-then-value tiles

       Total THC | 24.1% | Total Terpenes | 2.0%

     lines[i-1] is Total THC's figure. Taken as the terpene total it refused
     a correctly printed report for recovering 8% of "the lab's total"
     (found 2026-11-16 on a made-up report; no fixture prints tiles this
     way). Both halves must hold - the nearest name above is a cannabinoid
     or a cannabinoid total, AND the line below the label is itself a
     percentage - so a value-first run ("24.1% | Total THC | 2.24% | Total
     Terpenes | Analyte", Modern Canna's summary) reads as it always has:
     there the line below is a heading. */
  const aboveIsCannabinoidTile = (idx) => {
    const below = lines[idx + 1];
    if (!below || !/%\s*$/.test(below) || !isResultToken(below)) return false;
    for (let k = idx - 1; k >= 0 && k >= idx - LOOKAHEAD_LINES; k--){
      if (isResultToken(lines[k])) continue;
      return CANNABINOID.test(lines[k].toUpperCase()) || TOTAL_OF_CANNABINOID.test(lines[k]);
    }
    return false;
  };

  for (let i = 0; i < lines.length; i++){
    const line = lines[i];

    /* Method writes "Cultivars:" plural, and labels the batch "Batch Client #"
       and the lab id "Sample MTL #:" - a word between the label and the number,
       and no colon on the batch. All three sit inline with their values, so
       widening the labels is enough; this is not the separated-label case. */
    if (!strain && /^(Strains?|Cultivars?):\s*/i.test(line))
      strain = cleanStrain(valueOrNext(line.replace(/^(Strains?|Cultivars?):\s*/i, ''), lines[i+1]));
    if (!harvestDate && /^Harvest Date:/i.test(line))
      harvestDate = valueOrNext(line.split(':')[1], lines[i+1]);
    const batchLabel = line.match(/^Batch(?:\s+Client)?\s*#:?\s*(.*)$/i);
    if (!batch && batchLabel) batch = valueOrNext(batchLabel[1], lines[i+1]);
    const idLabel = line.match(/^(?:Lab ID|Sample\s+\w+\s*#):?\s*(.*)$/i);
    if (!labId && idLabel) labId = valueOrNext(idLabel[1], lines[i+1]);

    /* Additive output (s7), read like harvestDate: a labelled row, the value
       inline or on the next line, first occurrence wins, and nothing branches
       on either. The whole remainder is taken rather than split on ':' - a
       report date may carry a time. Labels must match exactly: TerpLife's
       "Client Lic#:" is a licence number and ACS's "Client Information:" heads
       an address block, and neither is read as the client. cleanStrain drops
       the "Field: value" tail some labs append on the same line. */
    const reportLabel = line.match(/^(?:Report\s+Date|Date\s+Reported|Date\s+of\s+Analysis)\s*:\s*(.*)$/i);
    if (!reportDate && reportLabel) reportDate = cleanStrain(ownValueOrNext(reportLabel[1], lines[i+1]));
    const clientLabel = line.match(/^(?:Client|Customer|Producer)\s*:\s*(.*)$/i);
    if (!client && clientLabel) client = cleanStrain(ownValueOrNext(clientLabel[1], lines[i+1]));

    /* Track whether we are inside a terpene table, so unrecognised analyte
       names can be reported without dragging in every stray line of the
       pesticide panel. */
    if (/^(TERPENES?|Terpene Screen by GC\/MS|Terpenes Summary|TERPENES SUMMARY.*)$/i.test(line))
      inTerpeneSection = true;
    /* The CLOSER is deliberately prefix-matched while the opener above stays
       exact. ACS suffixes its section headers - "Heavy Metals Florida",
       "Pesticides FL", "Residual Solvents - FL", "Filth and Foreign Material" -
       so anchored patterns never fired and the terpene section, reopened by a
       "Terpenes" header on page 2, stayed open across the whole contaminant
       panel. Seventy pesticides and four heavy metals ended up in `unmapped`,
       which exists to surface unknown TERPENE spellings and was useless buried
       under them. Closing early only costs a diagnostic hint; opening loosely
       would pull foreign tables into terpene READING, so that stays strict. */
    else if (/^(Pesticides?|Heavy Metals|Microbials?|Mycotoxins|Residual Solvents|Potency|Cannabinoids?|Filth[\/ ](and )?Foreign|Foreign Matter|Microbial)\b/i.test(line))
      inTerpeneSection = false;

    /* Modern Canna prints the total inline: "Total Terpenes: 3.73%", so an
       exact-match label test never fires and coverage silently comes back
       null. Kaycha prints a BARE label with the value in a later column. */
    const inlineTotal = line.match(/^Total\s+Terpenes\s*[:\u2013-]\s*(.+)$/i);
    if (inlineTotal){
      /* ...and only when the figure is a percentage - see INLINE_MASS_UNIT. */
      const inlineText = inlineTotal[1];
      if (!(INLINE_MASS_UNIT.test(inlineText) && inlineText.indexOf('%') < 0)){
        const beforePercent = INLINE_MASS_UNIT.test(inlineText) ? inlineText.match(/(\d[\d.,]*)\s*%/) : null;
        totalTerpenes = resultToNumber(beforePercent ? beforePercent[1] : inlineText);
      }
      continue;
    }

    /* Skip a "top ten" summary ONLY when a full panel exists later to read
       instead. Single-page COAs - Modern Canna issues them for hand-rolls -
       carry the summary and nothing else, so skipping it discards the entire
       terpene table and the report reads as though no terpene was measured. */
    if (TOPTEN_START.test(line) && lines.some((l, k) => k > i && FULL_PANEL.test(l))){
      legendUntil = Math.min(i + TOPTEN_MAX, lines.length);
      /* Bounded only by the full panel itself. The summary's own "Total
         Terpenes" label sits inside the block, so stopping at a generic section
         heading would end the skip after one line and leave the shifted rows in
         play. The printed total is recovered from the full panel's page. */
      for (let k = i + 1; k < legendUntil; k++)
        if (FULL_PANEL.test(lines[k])){ legendUntil = k; break; }
      /* The printed total lives INSIDE the skipped block - it is the summary's
         headline figure and the only place the document states it. Take it here,
         before skipping, or the panel has nothing to reconcile against. The
         value precedes its label in this layout, hence the backward look. */
      for (let k = i + 1; k < legendUntil && k < i + 4; k++){
        if (!/^TOTAL TERPENES$/i.test(lines[k])) continue;
        const pv = resultToNumber(lines[k - 1]);
        if (pv != null && pv > 0 && pv <= PERCENT_CEILING){ totalTerpenes = pv; totalPinned = true; totalBeforeLabel = true; }
        break;
      }
      continue;
    }

    if (CHART_LEGEND_START.test(line)){
      legendUntil = Math.min(i + CHART_LEGEND_MAX, lines.length);
      for (let k = i + 1; k < legendUntil; k++)
        if (CHART_LEGEND_END.test(lines[k])){ legendUntil = k; break; }
      continue;
    }

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
      /* Exempt a Total only when what follows it is not itself something we
         already know is not an analyte. "Total Terpineol" qualifies; "Total
         Yeast/Mold" does not, and letting it through put a microbial in the
         diagnostic on six files. The signal is only useful while it stays
         readable - see the pesticide flood in the session log. */
      const totalOfUnknown = /^Total\s+\S/i.test(line) && !TOTAL_OF_CANNABINOID.test(line)
        && !/^TOTAL TERPENES$/i.test(line)
        && !NOT_AN_ANALYTE.test(line.replace(/^Total\s+/i, ''));
      if (inTerpeneSection && !SECTION_LABELS.test(upper)
          && !notAnAnalyteHere(line, lines[i - 1])
          && (totalOfUnknown || !NOT_AN_ANALYTE.test(line)) &&
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
    let sawNonDetect = false;
    for (let j = i + 1; j < Math.min(i + LOOKAHEAD_LINES, lines.length); j++){
      const nxt = lines[j].toUpperCase();
      if (/^(TESTED|PASSED|PASS|FAIL|FAILED)$/i.test(nxt)){
        /* Both Kaycha and ACT put a verdict in the row, on opposite sides of
           the result. Decide by looking at what follows the verdict: if it is
           a result token the value comes AFTER (Kaycha); if it is the next
           analyte name the value came BEFORE (ACT). No lab detection needed. */
        const after = lines[j + 1];
        if (after && isResultToken(after)){
          value = resultToNumber(after);
          /* A verdict pins the SIDE, not the COLUMN. Kaycha prints two result
             cells after the verdict and their order is not fixed:

               TOTAL TERPENES | 0.007 | TESTED | 41.24 | 4.124   <- mg/unit, %
               TOTAL TERPENES | 0.007 | TESTED |  8.33 |  83.3   <- %, mg/g

             Taking the first read KAY-CAR-001 as a 41.24% cart when the report
             says 4.124% - every analyte 10x out, internally consistent, and no
             guard could see it. So collect each post-verdict cell as a
             candidate and let the column reconciler below decide, on the same
             principle used everywhere else: the column that reconciles against
             the lab's own total AND is a possible percentage. */
          numerics.length = 0;
          for (let k = j + 1; k < Math.min(j + 1 + MAX_RESULT_COLUMNS, lines.length); k++){
            const cell = lines[k];
            if (!isResultToken(cell)) break;
            if (ANALYTE_MAP[canonicalAnalyte(cell)] || UNMODELLED.test(canonicalAnalyte(cell))) break;
            if (CANNABINOID.test(cell.toUpperCase())) break;
            numerics.push(resultToNumber(cell));
          }
        }
        else if (j - 1 > i)               value = resultToNumber(lines[j - 1], true);
        verdictValue = value;   // a verdict column pins the value; no guessing needed
        break;
      }
      /* Stop BEFORE considering the line as a value. Some analyte names begin
         with a digit - "3-Carene" - so isResultToken() accepts them and the
         name would be collected as the number 3. Harmless while the first
         candidate was taken, wrong the moment position matters. */
      /* UNMODELLED must see the CANONICAL name, not the raw line. ANALYTE_MAP
         was already canonicalised here and UNMODELLED was not, so a lab writing
         Greek letters as bare initials - which ACT does - stopped the row on a
         mapped analyte but ran straight past an unmodelled one. g-Terpineol is
         the last row of MCL-FLW-002's panel; missing it as a boundary changed
         that document's fingerprint. */
      if (ANALYTE_MAP[canonicalAnalyte(lines[j])] || UNMODELLED.test(canonicalAnalyte(lines[j])) ||
          /^(TOTAL TERPENES|MOISTURE CONTENT|WATER ACTIVITY)$/i.test(nxt)) break;
      /* Cannabinoids end the row. Modern Canna interleaves the two tables in
         its page-one summary, so the scan otherwise walks past "CBGa" and
         collects the cannabinoid's figure as a terpene value. Cannabinoids are
         excluded from the vector by spec, which makes this the natural boundary
         - and far more robust than enumerating each lab's column headings. */
      if (CANNABINOID.test(nxt)) break;
      /* A NEW TABLE ends the row. The last analyte of a table has no following
         name to stop it, so it runs the full look-ahead into whatever comes
         next: gamma-Terpineol, last in MCL-FLW-002's panel and followed by
         "Result / Analyte / Reg. Limit", collected a fifth cell and took the
         Diln column's 1 as its value. That single wrong value poisoned
         pinnedSum, which made every candidate column overshoot the printed
         total, which discarded all ELEVEN correctly-read summary rows - and the
         document refused for "only 1 terpene found".

         Gated on having already collected a value, which is what distinguishes
         a new table's header from the column headers labs interleave INTO the
         first data row. Those arrive before any number and must not stop the
         scan; the comment above this loop is about exactly that case. */
      if (numerics.length && SECTION_LABELS.test(nxt)) break;
      /* Any other name-shaped line ends the row: an unmapped analyte
         (Terpinen-4-ol, Citronellol) or plain document furniture. Bare
         "Moisture" is the live case - SECTION_LABELS carries MOISTURE CONTENT
         and PERCENT MOISTURE but not the bare word, on purpose, so the last
         analyte before a moisture tile walked through it and collected its
         figure as a candidate. On a right-indexed table that hands the analyte
         the wrong number, and an ND anywhere in the window sets sawNonDetect
         for a row that was actually detected.

         Gated on numerics.length for the same reason as the SECTION_LABELS
         break above: headings interleaved into the first data row arrive
         BEFORE any number and must not stop the scan. Result tokens are exempt
         because "Not Detected" and "BQL" are name-shaped but ARE results. */
      if (numerics.length && !isResultToken(lines[j]) && isNameShaped(lines[j])
          && !SECTION_LABELS.test(nxt) && !SKIPPABLE_IN_ROW.test(nxt)) break;
      /* ACS prints ragged rows: a detected row has two cells, a below-LOQ row
         has three, so one column index is the percentage on one and the LOQ on
         the other. Reading the LOQ gave 23 phantom terpenes at 0.002. */
      if (NON_DETECT.test(nxt)) sawNonDetect = true;
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

    /* Some layouts print the figure BEFORE its label. Modern Canna does this in
       the top-ten summary, and on a single-page report - a hand-roll - there is
       no full panel to fall back on, so the shifted reading is all there is.
       Collect the preceding value too; which side is real is decided after the
       scan, by whichever reconciles against the printed total. */
    if (isAnalyteRowForPairing(isTotal, isMoisture, isWater)){
      const prv = i > 0 ? lines[i - 1] : null;
      const pv = prv && isResultToken(prv) ? resultToNumber(prv) : null;
      if (pv != null && pv >= 0 && pv <= PERCENT_CEILING) beforeByRow.push(pv);
      else beforeByRow.push(null);
      afterByRow.push(value);
      /* Candidates ride ON the row record. A parallel array drifted out of
         step, because total/moisture rows reach the value logic but never
         become a row - so index n meant different rows in the two arrays and
         every value landed one analyte off. */
      rowKeys.push({ key, isUnmodelled, upper, index: i,
                     candidates: numerics.filter(n => n != null && n <= PERCENT_CEILING),
                     /* Every figure, as the total row keeps its own (totalCandidates):
                        the column chooser below pairs the two by position. */
                     cells: numerics.filter(n => n != null) });
    }

    if (value === null || value === undefined) continue;

    if (!isTotal && !isMoisture && !isWater && i >= legendUntil){
      if (seenAnalyte.has(upper)) continue;          // repeat of a row already taken
      seenAnalyte.add(upper);
    }

    if (isTotal){
      /* The figure can precede its label ("2.15%" then "Total Terpenes"), in
         which case a forward read takes the first analyte's value as the total
         and every reconciliation downstream is measured against the wrong
         denominator. Prefer an immediately preceding percentage. */
      if (!totalPinned){
        const prv = i > 0 ? lines[i - 1] : null;
        const pv = prv && /%\s*$/.test(prv) && !ownerAboveIsAnalyte(i) && !aboveIsCannabinoidTile(i)
          ? resultToNumber(prv) : null;
        totalTerpenes = (pv != null && pv > 0 && pv <= PERCENT_CEILING) ? pv : value;
        if (totalTerpenes === pv && pv != null) totalBeforeLabel = true;
        /* Kept UNFILTERED. A mg/g total legitimately exceeds 100 (221.34 on a
           live resin), and dropping it here left too few candidates for the
           column selector to run at all - so the whole table fell back to the
           detection-limit column. The plausibility limit belongs on the value
           finally chosen, not on the candidates being compared. */
        totalCandidates = numerics.filter(n => n != null);
      }
    }
    else if (isMoisture){ if (moisture === null) moisture = value; }
    else if (isWater){ if (waterActivity === null) waterActivity = value; }
    else if (i < legendUntil){ /* inside a chart legend - not authoritative */ }
    else analyteRows.push({ key, upper, isUnmodelled, verdictValue, candidates: numerics.slice(), nonDetect: sawNonDetect });
  }

  /* Some COAs print a row of "Total CBD / Total THC / Total Cannabinoids /
     Total Terpenes" headings then a matching row of values, so a naive
     look-ahead lands on Total THC. Pair them positionally instead. */
  const TOTAL_LABEL = /^Total (CBD|THC|Cannabinoids|Terpenes)$/i;
  for (let i = 0; !totalPinned && i < lines.length; i++){
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
    /* An isomer row of a terpene this report also prints as a total stays
       out of the sums compared with the lab's total (SUMMED_SPELLINGS). */
    const bothWays = keysPrintedBothWays(analyteRows);
    const shadowed = r => bothWays.size > 0 && bothWays.has(r.key) && ISOMER_SPELLINGS.has(r.upper);
    const pinnedSum = pinned.reduce((a, r) => a + (shadowed(r) ? 0 : (r.verdictValue || 0)), 0);

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
          let sum = pinnedSum, filled = 0, measured = 0;
          const columnValues = new Set();
          for (const r of loose){
            const v = valueAt(r, dir, idx);
            if (v != null){
              if (!shadowed(r)) sum += v;
              filled++;
              if (v > 0){ measured++; columnValues.add(v); }
            }
          }
          if (!filled) continue;
          /* A limit column is uniform where a measurement column is not - the same
             discriminator the cross-check applies to ACT, applied here, where most
             of the corpus is actually read. An LOQ run of 35 rows at 0.02 sums to
             0.7, which reconciles against a 0.5-0.9% flower whenever the real
             column overshoots or the panel is partial. The arithmetic is identical
             either way, so reconciliation alone can never separate them. Zeros are
             excluded: a real column is full of them (a below-LOQ row reads 0 by
             rule 5) and they say nothing about whether the column was measured. */
          if (measured >= MIN_DISTINCTNESS_SAMPLE
              && columnValues.size / measured < MIN_COLUMN_DISTINCTNESS) continue;
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
      if (v === null && r.nonDetect) v = 0;
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
      else { terps[r.key] = (terps[r.key] || 0) + v; tally.note(r.key, r.upper, v); }   // cis+trans nerolidol accumulate
    }
  }

  /* Choose the RESULT COLUMN when a row carries several.
   *
   * Kaycha issues some reports with three numeric columns per row:
   *
   *     TOTAL TERPENES | 0.007 | 69.72 | 1.992
   *                       LOD    mg/g      %
   *
   * Taking the first plausible number gives every analyte its detection limit -
   * fifteen identical 0.007s and a total of 0.007, which the ceiling catches but
   * only after the fingerprint is already meaningless. Position cannot decide
   * this: other labs put the percentage first. So try each column index and keep
   * the one whose analyte values sum to the total in that SAME column, which is
   * the document's own internal check. */
  if (rowKeys.length >= 4 && totalCandidates.length > 1){
    /* By position against the total row, so every figure stays in its place.
       The rows once came here with figures above 100 taken out while the total
       row kept all of its own: on a 14 g jar printing LOD | mg | %, limonene's
       111.86 mg went, its % slid one place left, and the chosen column found
       nothing there - limonene lost, 73% of the total recovered, refused (four
       Kaycha flower and concentrate reports of 2023 and 2025 on The Flowery's
       site; KAY-FLW-010, 2026-11-20). A figure above 100 cannot be chosen:
       the column taken sums to a total of at most PLAUSIBLE_TOTAL_PERCENT. */
    const rows = rowKeys.map(r => ({ r, c: r.cells || r.candidates || [] }));
    const bothWays = keysPrintedBothWays(rowKeys);
    const shadowed = r => bothWays.size > 0 && bothWays.has(r.key) && ISOMER_SPELLINGS.has(r.upper);
    const width = Math.max(...rows.map(x => x.c.length), totalCandidates.length);
    let best = null;
    for (let idx = 0; idx < width; idx++){
      const declared = totalCandidates[idx];
      if (!(declared > 0)) continue;
      let sum = 0, filled = 0, quantified = 0;
      rows.forEach(x => {
        const v = x.c[idx];
        if (v == null) return;
        filled++;
        if (shadowed(x.r)) return;
        sum += v;
        /* A row counts as quantified unless its figure is below the cell
           printed just before it, which on these rows is its own limit of
           quantitation (see the next comment). */
        const limit = idx > 0 ? x.c[idx - 1] : null;
        if (!(limit > 0 && v < limit)) quantified += v;
      });
      if (filled < rows.length * 0.5) continue;
      /* The lab's total may count only the rows it quantified. Kaycha's
         template of late July 2026 prints each row as LOD | LOQ | % | mg per
         unit, gives a figure for rows between the two limits (often with a
         J qualifier), and leaves those rows out of TOTAL TERPENES; from
         September the same template counts them. On a pre-roll of 1.30%
         (2 x 0.5 g) the rows below the limit came to 0.126%, so every column
         overshot its total by 10%, no column was chosen here, and the forward
         reading stood with the figure printed last before TESTED: mg per unit,
         every value and the total ten times high, accepted (PARSER-HANDOFF
         s11, "A total that counts only the quantified rows"). So a column
         also reconciles when its quantified rows alone come within the
         tolerance of the total. Its values are then read for every row, as
         printed, the way KAY-FLW-004 to -009 read their J rows. The cell
         before the result is the limit only on this layout; on the others it
         is a mass column (larger, so no row counts and this path closes
         nothing) or a limit of detection (larger only where the row reads
         0), and the first column has no cell before it. */
      const sumCloses = sum <= declared * (1 + RECONCILE_TOLERANCE);
      const quantifiedCloses = Math.abs(quantified - declared) <= declared * RECONCILE_TOLERANCE;
      if (!sumCloses && !quantifiedCloses) continue;
      const share = (sumCloses ? sum : quantified) / declared;
      if (share < MIN_ROW_SHARE) continue;
      /* Several columns can reconcile: a mg/g column is internally consistent
         with its own mg/g total just as the % column is with the % total. They
         are distinguished by magnitude - terpene percentages of mass sit in
         single digits, while the same figures in mg/g are ten times larger.
         Prefer the smallest reconciling total that is still a plausible
         percentage, which is the % column by construction. */
      if (declared > PLAUSIBLE_TOTAL_PERCENT) continue;
      if (!best || declared < best.declared) best = { idx, share, declared };
    }
    /* No column reconciles, yet the total row printed two figures that could
       each be a percentage total, over two columns of measurements (a limit
       column repeats itself and is not counted). The reading that stands is
       then the forward one, whose verdict took a cell by POSITION: the last
       before TESTED, or the first after it, and the order of Kaycha's two
       result cells varies by jar (s11). That is a guess between the
       percentage and a mass figure ten or more times larger, so it is
       refused below rather than asserted. No accepted fixture is in this
       state; a pre-roll was, before the quantified-rows rule above. */
    if (!best){
      let measuredTotals = 0;
      for (let idx = 0; idx < width; idx++){
        const declared = totalCandidates[idx];
        if (!(declared > 0) || declared > PLAUSIBLE_TOTAL_PERCENT) continue;
        const values = rows.map(x => x.c[idx]).filter(v => v > 0);
        if (values.length >= MIN_DISTINCTNESS_SAMPLE
            && new Set(values).size / values.length < MIN_COLUMN_DISTINCTNESS) continue;
        measuredTotals++;
      }
      if (measuredTotals >= 2) unitsUndecided = true;
    }
    if (best && best.idx > 0){
      readBy = 'multicolumn';
      columnResolved = true;
      Object.keys(terps).forEach(k => delete terps[k]);
      tally.reset();
      unmodelledTotal = 0;
      totalTerpenes = best.declared;
      const seen = new Set();
      rows.forEach(x => {
        const v = x.c[best.idx];
        if (v == null || seen.has(x.r.upper)) return;
        seen.add(x.r.upper);
        if (x.r.isUnmodelled) unmodelledTotal += v;
        else if (x.r.key){ terps[x.r.key] = (terps[x.r.key] || 0) + v; tally.note(x.r.key, x.r.upper, v); }
      });
    }
    /* Cross-check the chosen column against the ones it beat.
     *
     * When a lab prints the same measurements twice in different units - Kaycha
     * gives mg alongside % - every row's rejected value divided by its chosen
     * value should be the SAME number: the unit conversion factor. That is a
     * fact about the document, independent of anything the parser decided, so a
     * tight ratio is real confirmation that the rows line up.
     *
     * A scattered ratio means cells are landing on the wrong rows. Both column
     * bugs found so far were exactly that, and both produced a total that summed
     * correctly against its own column - so reconciliation could not see them.
     * This can.
     *
     * Warns rather than refuses. Not every second column is a unit twin: a lab
     * could print something genuinely unrelated, so a scattered ratio is a
     * reason for a person to look, not grounds to withhold the reading. */
    if (best){
      let tightest = null;
      for (let idx = 0; idx < width; idx++){
        if (idx === best.idx) continue;
        const ratios = [], seenValues = new Set();
        rows.forEach(x => {
          const chosen = x.c[best.idx], other = x.c[idx];
          if (chosen > 0 && other > 0){ ratios.push(other / chosen); seenValues.add(other); }
        });
        if (ratios.length < MIN_CROSSCHECK_ROWS) continue;
        /* Only a column of MEASUREMENTS can be a unit twin. ACT prints LOQ beside
           the percentage - 82 ug/mL for most analytes, 247 for farnesene - and a
           mostly-constant limit divided by a varying result scatters no matter how
           well the table was read, so it reported a misalignment that was not
           there. A limit column repeats itself; a measurement column does not.
           Distinctness separates them without weakening the real check, because a
           shifted measurement column still holds distinct values.

           Requiring the ratio median to look like a round unit factor was tried
           first and it silently DISABLED the check: a badly shifted column's
           median is not round either, so it was skipped along with the LOQ. */
        if (seenValues.size / ratios.length < MIN_COLUMN_DISTINCTNESS) continue;
        ratios.sort((a, b) => a - b);
        const median = ratios[Math.floor(ratios.length / 2)];
        if (!(median > 0)) continue;
        /* Relative spread measured against the MEDIAN, not the mean: one badly
           shifted row must not be able to drag the centre onto itself and hide. */
        const spread = Math.max(...ratios.map(r => Math.abs(r - median) / median));
        if (!tightest || spread < tightest.spread) tightest = { spread, median, n: ratios.length };
      }
      if (tightest && tightest.spread > MAX_UNIT_RATIO_SPREAD)
        columnCrossCheck = `the two figures this lab prints for each terpene do not keep a constant ratio (differing by up to ${Math.round(tightest.spread * 100)}% across ${tightest.n} rows) - the columns may not be lined up, so check these values against the report`;
    }
  }

  /* Decide which side of the label held the values.
   *
   * The forward reading is already committed above. If the BACKWARD reading
   * reconciles against the lab's printed total substantially better, the
   * document prints figures ahead of labels and the forward pass shifted every
   * value onto the compound above it - real numbers, wrong analytes, the most
   * dangerous failure this parser can produce.
   *
   * A margin is required rather than a simple comparison: "before this name" is
   * also "after the previous name", so on a normal document the two readings
   * are near-identical and a tie-break would let a shifted reading win. */

  if (!columnResolved && totalTerpenes > 0 && rowKeys.length >= 4){
    const sum = arr => arr.reduce((a, v) => a + (v || 0), 0);
    /* The forward reading as COMMITTED above - the column the chooser settled
       on - not the first cell after each name. On a name-first table printing
       a limit before each result (name, LOQ, result; inline total, no verdict
       column) the first cells are the limits: they sum to almost nothing, so
       the backward reading - each name given the result of the row ABOVE it -
       beat that by the margin and replaced a correct reading with every value
       one row out, accepted with no warning. Found 2026-11-16 on made-up
       reports (test/shifted-rows-test.js); no fixture has that layout. On a
       table of one cell per row the two are the same number. Where the first cells sum
       to MORE than the committed reading (ACS prints a dilution of 30 first)
       that larger figure still stands, as it did, so the backward reading
       wins no more often than before. */
    const committed = Object.values(terps).reduce((x, v) => x + (v || 0), 0) + unmodelledTotal;
    const fwdShare = Math.max(sum(afterByRow), committed) / totalTerpenes;
    const bwdShare = sum(beforeByRow) / totalTerpenes;
    const fits = x => x <= 1 + RECONCILE_TOLERANCE;
        /* Edge evidence, independent of the margin: a value-first table prints a
       number before its FIRST analyte and nothing after its LAST. The margin
       alone only catches this when the table is sorted descending; on an
       alphabetical one fwdShare and bwdShare sit too close together. */
    /* ...and only on a document that printed its TOTAL value-first too. The
       edges alone cannot tell a value-first table from a name-first one with
       a small stray figure above it (the last cell of the table before, a
       limit under a heading) whose last row has no result (N/A, NT, a
       dash): cell for cell the two are the same sequence, and they sum to
       the same total. Read backward, the second had every value one row
       out and was accepted. Both fixtures read this way print the total
       before its label; the made-up reports that were misread do not
       (test/shifted-rows-test.js, 2026-11-16). */
    const valueFirstEdges = totalBeforeLabel && beforeByRow[0] != null && beforeByRow[0] <= 100 && afterByRow[afterByRow.length - 1] == null;
    /* The same edges on a document that did NOT print its total value-first:
       a value-first table, or a name-first one under a stray figure. Either
       reading reconciles and one of them has every value one row out, so
       neither is asserted. No fixture is in this state. */
    const edgesAlone = !totalBeforeLabel && beforeByRow[0] != null && beforeByRow[0] <= 100 && afterByRow[afterByRow.length - 1] == null;
    if (edgesAlone && fits(bwdShare) && bwdShare >= MIN_BACKWARD_SHARE && !(bwdShare > fwdShare + BACKWARD_MARGIN)) orderUndecided = true;
    if (fits(bwdShare) && bwdShare >= MIN_BACKWARD_SHARE && (bwdShare > fwdShare + BACKWARD_MARGIN || valueFirstEdges)){
      readBy = 'backward';
      Object.keys(terps).forEach(k => delete terps[k]);
      tally.reset();
      unmodelledTotal = 0;
      const seen = new Set();
      rowKeys.forEach((r, n) => {
        const v = beforeByRow[n];
        if (v == null || seen.has(r.upper)) return;
        seen.add(r.upper);
        if (r.isUnmodelled) unmodelledTotal += v;
        else if (r.key){ terps[r.key] = (terps[r.key] || 0) + v; tally.note(r.key, r.upper, v); }
      });
    }
  }

  Object.keys(terps).forEach(k => { terps[k] = round(terps[k]); });
  /* A terpene printed as a total and as its isomers: counted once, before
     anything below measures the reading against the lab's total. */
  summedDisagree = tally.settle(terps);
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
      summedDisagree = col.summedDisagree;
      unmodelledTotal = col.unmodelledTotal;
      mappedTotal = col.mappedTotal;
      readBy = 'columnmajor';
      layout = 'column';
    }
  }
  /* Two different questions, previously answered by one number.
   *
   *   measuredCoverage - did we recover the lab's terpene table at all?
   *   modelCoverage    - how much of that mass does the NOSE model represent?
   *
   * Conflating them hides the difference between a partial PANEL (the lab
   * printed a top ten; we read it correctly; the model covers most of it) and a
   * partial PARSE (we read almost nothing). Both used to surface as one low
   * percentage. ACS-FLW-001 at 85.2% is the first; a flower COA yielding one
   * terpene is the second, and only the second is a fault.
   *
   * `coverage` is retained unchanged - the app reads it by name. */
  const modelCoverage    = totalTerpenes > 0 ? mappedTotal / totalTerpenes : null;
  const measuredCoverage = totalTerpenes > 0
    ? (mappedTotal + unmodelledTotal) / totalTerpenes : null;
  const coverage = modelCoverage;
  const terpenesTested = terpenesWereTested(lines);
  const lab = detectLab(text);
  const productClass = detectProductClass(text);

  /* The parser must never silently assert a scraped fingerprint. A profile may
     only become a palate entry when every check below passes; otherwise the
     extraction is still returned for display, flagged, so the person sees what
     was read AND why it was not accepted. */
  const rejectReasons = [];
  /* Things worth a person's eye that are not grounds for refusal. Surfaced on
     the confirmation card, never used to alter or withhold a value. */
  const warnings = [];
  if (columnCrossCheck) warnings.push(columnCrossCheck);
  const nonZero = Object.values(terps).filter(v => v > 0).length;

  if (terpenesTested === false)
    rejectReasons.push('the lab did not run a terpene panel on this sample');
  if (totalTerpenes == null)
    rejectReasons.push('this report prints no total terpene figure NOSE can read, so NOSE cannot check its own reading');
  else if (!(totalTerpenes > 0))
    rejectReasons.push('lab reported a total of zero terpenes');
  if (nonZero === 0)
    rejectReasons.push("none of the terpenes NOSE compares was found above the lab's reporting limit");
  /* Catches the failure the ceiling cannot: values that are individually
     possible and a total that is correct, but most of the table missing. Under
     one number this looked like a partial panel; measured coverage separates
     "the lab printed a short list" from "we did not read the list". */
  if (measuredCoverage != null && measuredCoverage < MIN_MEASURED_COVERAGE)
    rejectReasons.push(`only ${(measuredCoverage * 100).toFixed(1)}% of the lab's own terpene total was recovered — the table was not read completely`);
  if (measuredCoverage != null && measuredCoverage > MAX_MEASURED_COVERAGE)
    warnings.push(`the terpene rows on this report add up to ${(measuredCoverage * 100).toFixed(1)}% of the total the lab printed — the individual figures are as listed, but the report's own arithmetic does not close`);
  /* Applies to UNKNOWN too. Two terpenes on a full panel is implausible
     whatever the product is, and the documents that defeat classification are
     exactly the ones running without other guards: ACS prints only "Derivative
     Products (Inhalation - Heated)", which covers carts and concentrates alike,
     and Method separates every label from its value. Neither can be classified
     honestly, so the guards must not depend on classifying them. */
  if ((INHALABLE.has(productClass) || productClass === 'unknown')
      && nonZero > 0 && nonZero < MIN_ANALYTES_INHALABLE)
    rejectReasons.push(`only ${nonZero} terpene${nonZero === 1 ? ' was' : 's were'} found, too few for this kind of product, so the panel was probably misread`);

  const typicalMax = TYPICAL_MAX_TOTAL[productClass];
  if (typicalMax && totalTerpenes > typicalMax)
    /* Warnings are published verbatim on the confirmation card, so the sentence
       has to read as English to someone holding a jar. "unusually high for
       unknown" is the internal class name leaking into a person's face; when we
       could not classify the product, say what is actually being claimed. */
    warnings.push(productClass === 'unknown'
      ? `${totalTerpenes}% total terpenes is higher than any cannabis product normally shows — worth checking against the report, since a units mix-up looks like this`
      : `${totalTerpenes}% total terpenes is unusually high for ${productClass} — worth checking against the report, since a units mix-up looks like this`);
  /* A single compound holding almost the whole profile is possible - a
     terpinolene-dominant pod reached 77% - but it is also what a misaligned
     table produces, so it is worth a look. */
  /* A large gap between measured and model coverage means the table was read
     but the values landed on the wrong analytes. Section 6 says this in words;
     nothing checked it. Reversing every numeric line of a real COA conserves
     the multiset, so every sum still reconciles - no arithmetic check can see
     it - but two thirds of the mass lands on compounds NOSE does not model,
     and modelCoverage falls to 0.32 where the lowest real fixture is 0.71.
     Set at 0.50, well below that floor: model coverage is a property of the
     taxonomy rather than the document, so a genuinely guaiol-rich report could
     run lower than anything in this corpus. A warning, not a refusal - the
     values may be exactly as printed and only the pairing suspect. */
  if (INHALABLE.has(productClass) && modelCoverage != null && measuredCoverage != null
      && measuredCoverage > 0.9 && modelCoverage < MIN_MODEL_COVERAGE)
    warnings.push(`most of this report's terpene mass sits in compounds NOSE does not model — the totals add up, but the values may be lined up against the wrong compounds, so check the top few against the report`);

  const top = Math.max(0, ...Object.values(terps));
  if (mappedTotal > 0 && top / mappedTotal > 0.85 && nonZero > 2)
    warnings.push('one terpene accounts for most of the profile — unusual, though some cultivars genuinely are');

  /* A terpene table printed by weight alone. "Result (mg/g)" over rows of
     6.12, 4.31, 3.52 and a bare total of 20.0 reconciles perfectly - as 20%
     total terpenes, ten times the truth, and silently wherever the form's
     typical ceiling is above it (a cartridge's is 20). INLINE_MASS_UNIT
     already declines a total that says mg/g on its own line; this is the
     same refusal for a table whose heading says it. The test is the
     document's own: across the rows read, and 15 lines either side, a mass
     unit is printed and a percent sign is not. All 56 accepted fixtures
     print a percent sign there (43 beside a mass unit, 13 without one). */
  if (layout === 'row' && rowKeys.length){
    const from = Math.max(0, rowKeys[0].index - UNIT_WINDOW);
    const to = Math.min(lines.length, rowKeys[rowKeys.length - 1].index + UNIT_WINDOW);
    const around = lines.slice(from, to);
    if (around.some(l => TABLE_MASS_UNIT.test(l)) && !around.some(l => l.indexOf('%') >= 0))
      rejectReasons.push('this report gives its terpene figures by weight (such as mg/g), not as percentages, and NOSE reads percentages only');
  }
  if (orderUndecided && layout === 'row')
    rejectReasons.push('NOSE cannot tell whether this report prints each figure before or after the name of its terpene, so it cannot be sure which figure belongs to which');
  if (unitsUndecided && readBy === 'forward')
    rejectReasons.push('this report prints two figures for each terpene, in two units, and neither set adds up to its own printed total, so NOSE cannot tell which figures are the percentages');
  for (const key of summedDisagree)
    rejectReasons.push(`this report lists ${printedName(key)} both as a total and as separate rows, and the two disagree, so NOSE cannot tell which to use`);

  if (coverage != null && coverage > COVERAGE_CEILING)
    rejectReasons.push(`the terpene figures NOSE read add up to more than the total this report prints (${(coverage * 100).toFixed(1)}%), so the table was probably misread`);
  /* Coverage alone is only an INTERNAL consistency check: it compares two
     numbers that can both be wrong. Terpene figures are percentages of mass,
     so anything above 100 means we are reading the wrong column entirely —
     a physical check that does not depend on the total being right. */
  /* A fingerprint holding one repeated figure is a limit column that reached
     the end. The forward chooser refuses one outright now, but when NO column
     reconciles the fallback beneath it takes the first plausible candidate per
     row - on a limit-first layout that is the limit column again, summing to
     exactly the printed total and satisfying every check that compares two
     numbers to each other. Coverage reads 100%, so nothing downstream looks.
     Judge the values themselves: distinctness is a property of the fingerprint,
     independent of which reader produced it, so this covers the column-major
     and backward readers too.
     An absolute count, not a ratio. Every limit column in the corpus holds one
     or two values (Kaycha 0.007, ACS 0.002, ACT 82 and 247), while a weak
     flower printed to two decimals can legitimately collide on several - a
     ratio threshold cannot tell those apart and this can. */
  const distinctValues = new Set(Object.values(terps).filter(v => v > 0)).size;
  if (nonZero >= MIN_DISTINCTNESS_SAMPLE && distinctValues <= MAX_UNIFORM_VALUES)
    rejectReasons.push(`every terpene read as ${distinctValues === 1 ? 'the same figure' : `one of only ${distinctValues} different figures`}, which is what a report's limits column looks like, not its results`);
    const overPercent = Object.entries(terps).filter(([, v]) => v > PERCENT_CEILING);
  if (totalTerpenes != null && totalTerpenes > PERCENT_CEILING)
    rejectReasons.push(`a total of ${totalTerpenes}% is not possible, so the wrong column was read`);
  if (overPercent.length)
    rejectReasons.push(`${overPercent.map(([k]) => printedName(k)).join(', ')} read above 100%, which is not possible, so the wrong column was read`);

  /* Freshness signals (moisture 9-13%, water activity < 0.65) describe the
     cure of plant material. On an extract they are not unknown, they are
     inapplicable — a different statement, and the honest one. */
  /* Freshness signals are read from labelled rows with no reconciliation
     behind them, so a Dilution or limit cell landing at the label's index is
     asserted unchecked - aw 1.0 on six fixtures, aw 55 on one, moisture 1 on
     another. Water activity is a ratio bounded at 0-1 and a reading of exactly
     1 is the dilution factor, not a measurement. Cured flower does not sit
     below 3% or above 20% moisture. Out of range means NOT READ, which is what
     null honestly says: over-reading a freshness signal is worse than leaving
     it unknown, and unlike the terpene table there is no total to reconcile
     against, so a bound is the only check available. */
  /* Read the freshness signals by RECONCILIATION, not position - the four
     labs disagree on column order and Kaycha disagrees with itself:

       ACS/ACT        Water Activity | 0.65  | 0.530          limit first
       Kaycha A       WATER ACTIVITY | aw | 0.010 | 0.10 | 0.65 | PASS | 0.56
       Kaycha B       Water Activity | 0.010 | aw | 0.583 | PASS | 0.65
       Modern Canna   Percent Moisture | 12.5 | 15 | 1        limit second

     A verdict token cannot decide it: Kaycha prints PASS on either side, the
     same hazard §11 records for the terpene rows. Position cannot decide it
     either. What separates them is DISTINCTNESS - the same discriminator that
     separated ACT's LOQ column from a measurement. Action levels and detection
     limits are a small set of constants repeated across every document in the
     corpus; a real reading is not one of them. Excluding those and bounding by
     physics leaves exactly one candidate on all 34 labelled rows across four
     labs, with no ambiguity anywhere.

     Previously this took the first plausible number after the label, which was
     the Dilution cell on six ACS files (aw 1.0), the LOD on six Kaycha files
     (aw 0.01), and the action level on TerpLife (moisture 15). */
  const freshValue = (raw, isAw) => {
    if (raw == null) return null;
    const CONSTS = isAw ? [0.65, 0.85, 0.10, 0.01] : [15, 1.00];
    const inRange = v => isAw ? (v > 0 && v < 1) : (v >= 1 && v <= 20);
    return (CONSTS.indexOf(raw) < 0 && inRange(raw)) ? raw : null;
  };
  /* ACS and ACT print the label TWICE - once as a section heading, once as the
     real row - and the heading comes first, so taking the first occurrence read
     "Specimen Weight: 0.500 g" as a water activity of 0.5. The authoritative row
     is the one preceded by a bare UNIT MARKER: ACS heads its table
     "Analyte / Action Level / (aw) / Result / (aw)", ACT "Analyte / Limit (aw)".
     Keying on the word Result would catch ACS and miss ACT; the unit marker
     catches both, and no heading occurrence carries one - those sit under a date
     or a batch number. The document declaring its own table, as everywhere else
     here. Runs FIRST and falls back to the existing reader, which is what serves
     Kaycha and Modern Canna. */
  {
    /* Two dialects for the same declaration. ACS and ACT print the unit itself
       in the header - "(aw)", "Limit (%)" - while Kaycha names the column
       "Units" and puts the % or aw down in the data row. Only the first was
       recognised, so on Kaycha the binding never fired and the fallback took a
       bare summary tile with no numbers under it: moisture 14.97 and water
       activity 0.583 both read null on a document that prints them plainly. */
    const UNIT = /^(\(|Limit\s*\()?\s*(aw|%|units?)\s*\)?$/i;
    const pick = (re, isAw) => {
      for (let i = 0; i < lines.length; i++){
        if (!re.test(lines[i])) continue;
        if (!lines.slice(Math.max(0, i - 5), i).some(t => UNIT.test(t))) continue;
        const c = lines.slice(i + 1, i + 8)
          .map(t => Number(String(t).match(/^\d+(?:\.\d+)?$/) || NaN))
          .filter(v => !isNaN(v))
          .map(v => freshValue(v, isAw))
          .filter(v => v != null);
        if (c.length === 1) return c[0];
      }
      return null;
    };
    const aw = pick(/^WATER ACTIVITY$/i, true);
    const ms = pick(/^(MOISTURE|MOISTURE CONTENT|PERCENT MOISTURE)$/i, false);
    if (aw != null) waterActivity = aw;
    if (ms != null) moisture = ms;
  }

  waterActivity = freshValue(waterActivity, true);
  moisture      = freshValue(moisture, false);

  const freshnessApplies = productClass === 'flower';

  /* Additive (s7), computed after everything above and read by nothing above. */
  const novelty = noveltyOf(lines, lab, [...unmapped].sort());

  return {
    lab, strain, batch, labId, harvestDate, productClass,
    totalTerpenes, moisture, waterActivity, freshnessApplies,
    terps, mappedTotal, unmodelledTotal, coverage,
    modelCoverage, measuredCoverage, layout, readBy,
    unmapped: [...unmapped].sort(),
    terpenesTested,
    usable: rejectReasons.length === 0,
    rejectReasons, warnings, novelty,
    /* Additive (s7): stored with every archived parse, not sent to the app. */
    reportDate, client,
    harvestOn: isoDate(harvestDate), reportOn: isoDate(reportDate),
    testedOn: finishedOn(lines, lab),
    parserVersion: currentParserVersion()
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
/* Unit-ratio cross-check. A lab printing the same figure in two units gives a
   constant ratio between the columns; rounding on small values moves it a little
   (0.0235 -> 0.823 is 35.02 where 0.023 -> 0.805 is 35.00), so the tolerance has
   to absorb that without absorbing a shifted row, which moves it by whole
   multiples. MIN_CROSSCHECK_ROWS keeps a two-analyte panel from producing a
   confident-looking verdict off one ratio. */
const MAX_UNIT_RATIO_SPREAD = 0.15;
/* Below this share of distinct values a column is a limit, not a measurement -
   ACT repeats one LOQ down the table - and there is nothing to cross-check. */
const MIN_COLUMN_DISTINCTNESS = 0.6;
const MIN_CROSSCHECK_ROWS = 4;
/* The forward chooser applies the same distinctness test, but to a candidate
   column directly rather than to a ratio, so it needs its own floor on sample
   size. MIN_CROSSCHECK_ROWS guards a two-analyte panel there; the risk here is
   a short trace-heavy panel whose printed values legitimately repeat at 0.01.
   Set higher because a uniform column cannot reach MIN_ROW_SHARE without many
   rows - nothing is lost by staying out of small panels entirely. */
const MIN_DISTINCTNESS_SAMPLE = 8;
/* How few distinct figures a whole fingerprint may hold before it is refused
   as a limit column rather than a reading. Absolute rather than a share of
   the panel: limit columns repeat one or two values regardless of how many
   analytes the lab ran, and a share threshold tuned for the ratio cross-check
   would also refuse a low-total flower whose printed values collide on
   rounding. Verified no-op: the corpus probe finds no fixture below a 0.6
   share at four values, and this is tighter on both counts. */
const MAX_UNIFORM_VALUES = 3;
/* A recovered table accounts for essentially all of the lab's own total. Across
   every correctly-parsed fixture measured coverage sits at 99-100%; a genuine
   partial PANEL still reaches it, because unmodelled mass counts too. Well below
   it means rows were missed, not that the lab printed a short list. */
const BACKWARD_MARGIN = 0.15;       // backward must beat forward clearly
const MIN_BACKWARD_SHARE = 0.80;    // ...and reconcile convincingly on its own
/* No cannabis product is a third terpene by mass; ~35% is far beyond the
   richest concentrate. A "total" above this is another unit entirely. */
const PLAUSIBLE_TOTAL_PERCENT = 35;
/* Typical ceilings by product form, from the fixture corpus and the published
   literature. Exceeding one is not impossible, so it is a WARNING rather than a
   rejection - the numbers may be right and the product unusual. But it is also
   exactly what a units mix-up looks like: KAY-CAR-003 parsed to 37.8% total
   terpenes on a cart, reconciled internally, passed every guard, and was wrong
   by 5x because the mg/g column had been read as percentages. */
/* `unknown` carries the HIGHEST ceiling, not the lowest, and that is the point:
   it is not a guess at the form but a bound that no legitimate product of ANY
   form exceeds. Set at flower's 6 it would fire on every unclassified
   concentrate and teach the reader to ignore warnings; set here it still catches
   the units mix-up that motivated the check, which overshoots by 10x or more.
   Previously `unknown` had no entry at all, so a 30% total was rejected as
   flower and accepted silently as unknown. */
const TYPICAL_MAX_TOTAL = { flower: 6, vape: 20, concentrate: 25, edible: 5, tincture: 5, topical: 5, unknown: 25 };
/* The floor had no matching ceiling. A document whose rows sum to MORE than
   the total it printed itself asserts two incompatible things, and did so
   silently: MCL-FLW-002 lists "Ocimene, Total 0.068" in its full panel, omits
   it from its headline 1.769%, and accepted at 103.8% with an empty warnings
   array. Summing thirty rows rounded to three decimals reaches ~1%; every
   fixture below this bound sits there and the three above it do not. A WARNING,
   not a refusal - every value was read correctly and the fingerprint is sound.
   It is the report's own arithmetic that does not close, and the person holding
   the jar is who should hear that. */
const MAX_MEASURED_COVERAGE = 1.01;
const MIN_MODEL_COVERAGE = 0.50;
const MIN_MEASURED_COVERAGE = 0.80;
/* Inhalable cannabis carries more than a couple of terpenes above LOQ. One or
   two on a flower COA is a parse that collapsed, not a real profile. */
const MIN_ANALYTES_INHALABLE = 3;
const INHALABLE = new Set(['flower', 'concentrate', 'vape']);

/* A mass unit as a table prints it, and how far either side of the rows read
   the table's headings and its total may sit. */
const TABLE_MASS_UNIT = /mg\s*\/\s*g|mg\s*\/\s*unit|(?:u|\u00B5|\u03BC)g\s*\/\s*g/i;
const UNIT_WINDOW = 15;

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
    /* An isomer row of a terpene this column also prints as a total stays
       out of the checksum (SUMMED_SPELLINGS). */
    const uppers = names.items.map(canonicalAnalyte);
    const bothWays = keysPrintedBothWays(uppers.map(upper => ({ key: ANALYTE_MAP[upper], upper })));
    const shadowed = k => bothWays.size > 0 && bothWays.has(ANALYTE_MAP[uppers[k]]) && ISOMER_SPELLINGS.has(uppers[k]);
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
      c.items.forEach((t, k) => { if (k !== totalIdx && !shadowed(k)) sum += (resultToNumber(t) || 0); });

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
  const tally = summedTally();
  let unmodelled = 0;
  bestOverall.names.items.forEach((name, k) => {
    if (k === bestOverall.totalIdx) return;
    const u = canonicalAnalyte(name);
    if (seen.has(u)) return;
    seen.add(u);
    const v = resultToNumber(bestOverall.run.items[k]);
    if (v == null) return;
    const key = ANALYTE_MAP[u];
    if (key){ terps[key] = round((terps[key] || 0) + v); tally.note(key, u, v); }
    else if (UNMODELLED.test(u)) unmodelled = round(unmodelled + v);
  });
  const summedDisagree = tally.settle(terps);

  const mapped = round(Object.values(terps).reduce((a, b) => a + b, 0));
  return { terps, summedDisagree, unmodelledTotal: unmodelled, mappedTotal: mapped, totalTerpenes: bestOverall.declared };
}

module.exports.readColumnMajor = readColumnMajor;
module.exports._printedNames = { PRINTED_NAME, keys: [...new Set(Object.values(ANALYTE_MAP))] };

/* ------------------------------------------------------------------ novelty --
 * Is this document new to the parser? Output field `novelty` (s7): short
 * notes, one per kind of thing the parser has not met, [] when there is none.
 *
 * Computed AFTER the reading, from what the reading already saw - the lab it
 * recognised, the names it could not map, and the lines of the terpene section
 * held against the reader's own vocabularies. Nothing reads it back: no other
 * field depends on it, so a document reads exactly as it did before it existed.
 *
 *   lab not recognised        detectLab() matched nothing in LABS
 *   unmapped: ...             the `unmapped` diagnostic is not empty
 *   unit not read: "..."      a figure and a concentration unit that VALUE_LINE
 *                             does not accept, so the reader never saw a value
 *   verdict not known: "..."  a verdict word the row reader does not act on
 *   heading not known: "..."  a column heading that is not in SECTION_LABELS,
 *                             not stepped over by SKIPPABLE_IN_ROW, and not
 *                             on a fixture already (SEEN_HEADINGS)
 *
 * The last three look only inside the terpene section, tracked exactly as the
 * loop tracks it for `unmapped` - so they share its blind spot: Method closes
 * the section in its summary tiles, and its table sits outside it.
 *
 * The notes are for the archive and scripts/review-queue.js, never for a
 * person: the confirmation card prints one fixed sentence when the list is not
 * empty. At most three examples per note, each cut to 40 characters, so an
 * odd document cannot grow it without bound. Deterministic, so the same text
 * always gives the same list and a reparse adds a row only when it changes. */

/* The loop's section tracking, repeated rather than shared so the loop stays
   exactly as it was. test/novelty-test.js fails if the two ever differ. */
const NOVELTY_SECTION_OPEN = /^(TERPENES?|Terpene Screen by GC\/MS|Terpenes Summary|TERPENES SUMMARY.*)$/i;
const NOVELTY_SECTION_CLOSE = /^(Pesticides?|Heavy Metals|Microbials?|Mycotoxins|Residual Solvents|Potency|Cannabinoids?|Filth[\/ ](and )?Foreign|Foreign Matter|Microbial)\b/i;

/* Every verdict word the parser acts on: the row reader's pin (TESTED, PASSED,
   PASS, FAIL, FAILED) and terpenesWereTested's tiles (COMPLETED, NOT TESTED). */
const KNOWN_VERDICT = /^(TESTED|PASSED|PASS|FAIL|FAILED|NOT\s*TESTED|COMPLETED)$/i;
/* A whole line a lab could print in a verdict column. N/A is not one - it is a
   placeholder, and three ACS fixtures print it under an action level. */
const VERDICT_LIKE = /^(PASS(?:ED|ES|ING)?|FAIL(?:ED|S|ING)?|(?:NOT\s+|UN)?TESTED|COMPLETED?|COMPLIES|(?:NON-?\s?)?COMPLIANT|(?:NON-?\s?)?CONFORM(?:S|ING)?|MEETS(?:\s+SPEC(?:IFICATIONS?)?)?|DOES\s+NOT\s+MEET|ACCEPT(?:ED|ABLE)?|REJECT(?:ED)?|(?:UN)?SATISFACTORY|WITHIN\s+(?:LIMITS?|SPEC)|OUT\s+OF\s+SPEC|OOS|INCONCLUSIVE|NT|NR|INFO(?:RMATIONAL)?|REPORT\s+ONLY|PENDING)$/i;

/* A table cell: figures, then a unit of CONCENTRATION. A mass or volume alone
   (Kaycha's "0.227 g" and "10 ml", ACS's "0.500 g") and a dilution ("1 x") are
   sample details on known layouts, never a terpene result. */
const CONCENTRATION_UNIT = String.raw`(?:%(?:\s*(?:w\/w|w\/v|v\/v|wt))?|wt\s*%|w\/w|(?:mg|g|ug|[\u00B5\u03BC]g|mcg|ng)\s*\/\s*[A-Za-z]+|mg|ppm|ppb|ppt|aw)`;
const UNIT_CELL = new RegExp(String.raw`^[<\u2264]?\s*\d[\d.,]*(?:\s+[<\u2264]?\d[\d.,]*)*\s*(?:(?:\u00B1|\+\/-)\s*\d[\d.,]*\s*)?` +
                             CONCENTRATION_UNIT + String.raw`(?![A-Za-z])`, 'i');
const UNIT_CELL_MAX = 32;   // a cell, not a footnote that happens to open with "20%"
/* "22.8% (798 mg)": a percentage with its mass beside it. resultToNumber names
   the form, and Modern Canna prints its cannabinoid totals this way inside the
   terpene section on six fixtures. VALUE_LINE does not take it, and does not
   need to - the terpene rows beside it are read. */
const PERCENT_WITH_MASS = /^\d[\d.,]*\s*%\s*\(\s*\d[\d.,]*\s*mg\s*\)$/i;

/* A column heading: at most six words, no figures, not a "Label:", naming a
   column - a word from the reader's own heading vocabulary or a common
   alternative to one - and not a line of a footnote (isHeadingLine). */
const HEADING_WORD = /^(ANALYTES?|COMPOUNDS?|RESULTS?|AMOUNT|CONC|CONCENTRATION|LOD|LOQ|LLOQ|ULOQ|MDL|PQL|RL|MRL|LIMITS?|SPEC|SPECIFICATIONS?|UNITS?|DILUTION|DILN|STATUS|QUALIFIER|FLAGS?|PASS\/FAIL|%|MG\/G|MG\/UNIT|MG\/ML|MG\/KG|UG\/G|UG\/ML|UG\/KG|[\u00B5\u03BC]G\/G|[\u00B5\u03BC]G\/ML|MCG\/G|NG\/G|NG\/ML|W\/W|WT%|PPM|PPB|AW)$/i;
const HEADING_MAX = 40;
/* Headings the fixtures print that SECTION_LABELS and SKIPPABLE_IN_ROW do not
   name. Seen, so not new: each is on an accepted, baselined document. Kept as
   whole lines, uppercased, like ANALYTE_MAP's spellings - a heading that only
   shares words with one of these is still new. Add a heading here when a
   fixture that prints it is baselined, not before. Read by novelty only.
   Green Scientific's "Results (%)" is deliberately absent: its one fixture is
   refused, so that layout has never been read. */
const SEEN_HEADINGS = new Set([
  '(MG/UNIT) QUALIFIER',                                  // Kaycha, 10 fixtures
  'TOTAL (%)',                                            // Kaycha, 6
  '(LOD)', '(LOQ)',                                       // Kaycha, Grease_monkey_live_resin
  'WEIGHT VOLUME DILUTION LIMIT LOD',                     // Kaycha, KAY-CAR-003
  'RESULT(%) (MG/UNIT) QUALIFIER PASS/FAIL',              //   the same
  'LOD (%)',                                              // Kaycha KAY-CAR-001, ACT
  'LOQ (%)',                                              // ACT, LAB-0425BSWS-20250731
  'LIMIT (UG/ML)', 'LOQ (UG/ML)',                         // ACT, 2
  'RESULT (MG/G)',                                        // ACS, 8
  'REG. LIMIT',                                           // Modern Canna, 5
  'LIMIT OF QUANTIFICATION', 'METHOD DETECTION LIMIT',    // Modern Canna, 2
  'PRACTICAL QUANTITATION LIMIT',                         //   the same
  'UG/KG'                                                 // Modern Canna 2023, MCL-LRS-002: the unit heading of the next panel
]);

const NOVELTY_EXAMPLES = 3;
const NOVELTY_CHARS = 40;
const NOVELTY_NAMES = 5;

function isHeadingLine(line){
  if (line.length > HEADING_MAX || /\d/.test(line) || /:\s*$/.test(line)) return false;
  if (isResultToken(line) || CANNABINOID.test(line)) return false;
  const u = canonicalAnalyte(line);
  if (ANALYTE_MAP[u] || UNMODELLED.test(u)) return false;
  const words = line.split(/\s+/).map(w => w.replace(/^[(\[]+|[)\].,]+$/g, ''));
  if (words.length > 6 || !words.some(w => HEADING_WORD.test(w))) return false;
  if (words.every(w => HEADING_WORD.test(w))) return true;   // "ug/mL", "RESULT (%)"
  /* Otherwise not a footnote. ACS and Kaycha print theirs inside the section:
     "(ppm) =", "moisture concentration.", "Terpenes % is dry-weight corrected." */
  return !/=|[,;]$/.test(line) && !/^[a-z]/.test(line) && !(/\.$/.test(line) && words.length >= 3);
}

const knownHeading = line => SECTION_LABELS.test(line) || SKIPPABLE_IN_ROW.test(line)
  || SEEN_HEADINGS.has(line.toUpperCase().replace(/\s+/g, ' '));

/* `lines` as parseCoa normalised them, `lab` as detected, `unmapped` sorted. */
function noveltyOf(lines, lab, unmapped){
  const notes = [];
  if (!lab) notes.push('lab not recognised');
  if (unmapped.length){
    const more = unmapped.length - NOVELTY_NAMES;
    notes.push(`unmapped: ${unmapped.slice(0, NOVELTY_NAMES).join(', ')}${more > 0 ? ` (+${more} more)` : ''}`);
  }

  const units = [], verdicts = [], headings = [];
  let inSection = false;
  for (const line of lines){
    if (NOVELTY_SECTION_OPEN.test(line)) inSection = true;
    else if (NOVELTY_SECTION_CLOSE.test(line)) inSection = false;
    if (!inSection) continue;
    if (line.length <= UNIT_CELL_MAX && UNIT_CELL.test(line) && !VALUE_LINE.test(line) && !PERCENT_WITH_MASS.test(line))
      units.push(line);
    else if (VERDICT_LIKE.test(line) && !KNOWN_VERDICT.test(line))
      verdicts.push(line);
    else if (isHeadingLine(line) && !knownHeading(line))
      headings.push(line);
  }

  const quoted = (label, found) => {
    const distinct = [...new Set(found)];
    if (!distinct.length) return;
    const cut = s => (s.length > NOVELTY_CHARS ? s.slice(0, NOVELTY_CHARS - 1) + '…' : s);
    const more = distinct.length - NOVELTY_EXAMPLES;
    notes.push(`${label}: ${distinct.slice(0, NOVELTY_EXAMPLES).map(s => JSON.stringify(cut(s))).join(', ')}` +
               (more > 0 ? ` (+${more} more)` : ''));
  };
  quoted('unit not read', units);
  quoted('verdict not known', verdicts);
  quoted('heading not known', headings);
  return notes;
}

module.exports.noveltyOf = noveltyOf;
module.exports._novelty = {
  NOVELTY_SECTION_OPEN, NOVELTY_SECTION_CLOSE, KNOWN_VERDICT, VERDICT_LIKE,
  UNIT_CELL, PERCENT_WITH_MASS, HEADING_WORD, SEEN_HEADINGS, isHeadingLine
};

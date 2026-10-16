'use strict';
/* NOSE - from a link to a verdict: the one path a lab report is read by.
 *
 *   const { readReport, STAGES } = require('./read-report');
 *   const read = await readReport(link);    // read.stage is where it stopped
 *
 * The steps, in order. Each one that fails ends the read there:
 *
 *   link      validateUrl (lib/fetch-report.js): https, and not a private address
 *   fetch     fetchPdf: the chain, its guards and its 8s budget
 *   extract   the PDF's text layer (lib/extract-text.js) could not be read
 *   text      fewer than MIN_TEXT characters of it: nothing worth reading
 *   parse     parseCoa threw
 *
 * and once the parser has read it, the verdict:
 *
 *   unsafe    its lab and form are in UNSAFE_UNDER_UNPDF: refused, whatever the
 *             parser said
 *   refused   the parser refused it: its rejectReasons
 *   accepted  the parser found it usable (usable === true, nothing looser)
 *
 * Two callers, since 2026-10-16 (PARSER-HANDOFF s12):
 *
 *   coa.js                   the scanner: each stage becomes its reply, and on
 *                            the production deploy the archive gets every parsed
 *                            read between this and the reply - coa.js's call
 *   scripts/b2b-coverage.js  readFetched(), the dispensary coverage report; and
 *                            through it scripts/b2b-read-catalog.js, which writes
 *                            a store's readings
 *
 * So a sentence changed here reaches the scanner and the dispensary reports
 * together. The fetch chain's own sentences are lib/fetch-report.js's.
 *
 * What comes back is one plain object, every field present:
 *
 *   stage     one of STAGES
 *   parsed    true once parseCoa returned: unsafe, refused or accepted
 *   sentence  the sentence for the person who gave the link - the chain's, or
 *             one of SCANNER, or the unsafe one; null when accepted
 *   reasons   on refused, the parser's rejectReasons as it gave them; else null
 *   url       the link as validateUrl passed it (a URL), from fetch on
 *   buffer    the PDF's bytes, finalUrl the address they came from, viaPage
 *             the page they were found through or null - from extract on
 *   text      the extracted text, once it is long enough to parse
 *   output    the parser's output, once parsed
 *
 * fetch, extract and parse can be passed in, for a test or a script that
 * brings its own: fetch in fetchPdf's shape, extract in extractCoaText's,
 * parse in parseCoa's. Nothing here writes a file, a log line or a row, and
 * it decides nothing about keeping: this file loads neither lib/archive.js
 * nor lib/pdf-store.js. Aroma and flavour only.
 */

const { validateUrl, fetchPdf } = require('./fetch-report');
const { extractCoaText } = require('./extract-text');
const { parseCoa } = require('./parse-coa');

/* Below this many characters a PDF has no text layer worth reading - a scan,
   most often. */
const MIN_TEXT = 200;

/* The scanner's four sentences for a report it could not read. coa.js sends
   them as they are, and the coverage report prints them as they are. */
const SCANNER = Object.freeze({
  unreadable: 'That PDF could not be read. It may be a scan rather than a text document.',
  noText: 'That PDF has no readable text. Scanned reports are not supported.',
  unparsed: 'That report could not be parsed.',
  refused: 'That report could not be read reliably.'
});

/* Labs whose text ordering under unpdf does not match the committed fixtures.
 * test/extraction-parity.js reports these as DIFFER. A DIFFER is not a near
 * miss - the parser may read a different column - so these are refused until
 * a handler for that ordering exists and the harness reports MATCH. Each rule
 * is { lab: RegExp, productClass }. */
const UNSAFE_UNDER_UNPDF = [
];

/* Known-unsafe extraction ordering: a limitation of this tool, not a fault in
   the report, and the sentence says so. */
const unsafeSentence = lab =>
  `${lab} reports of this type are not yet supported by the scanner. ` +
  'Enter the terpene values manually — the numbers on the report are correct, ' +
  'this tool just cannot read that layout reliably yet.';

const STAGES = Object.freeze({
  link: 'link', fetch: 'fetch', extract: 'extract', text: 'text', parse: 'parse',
  unsafe: 'unsafe', refused: 'refused', accepted: 'accepted'
});

async function readReport(link, { fetch: fetchReport = fetchPdf, extract = extractCoaText, parse = parseCoa } = {}){
  const read = { stage: null, parsed: false, sentence: null, reasons: null,
                 url: null, buffer: null, finalUrl: null, viaPage: null, text: null, output: null };
  const stop = (stage, sentence) => Object.assign(read, { stage, sentence });

  const checked = validateUrl(link);
  if (checked.error) return stop(STAGES.link, checked.error);
  read.url = checked.url;

  const fetched = await fetchReport(checked.url);
  if (fetched.error) return stop(STAGES.fetch, fetched.error);
  read.buffer = fetched.buffer;
  read.finalUrl = fetched.finalUrl;
  read.viaPage = fetched.viaPage || null;

  let text;
  try {
    /* extractCoaText returns { text, pages }, not a bare string. Passing the
       object straight to parseCoa finds no terpenes in it and yields a
       confident, wrong refusal — the failure hides behind a sensible message. */
    const extracted = await extract(fetched.buffer);
    text = typeof extracted === 'string' ? extracted : (extracted && extracted.text);
  } catch {
    return stop(STAGES.extract, SCANNER.unreadable);
  }
  if (typeof text !== 'string' || text.length < MIN_TEXT) return stop(STAGES.text, SCANNER.noText);
  read.text = text;

  let output;
  try {
    output = parse(text);
  } catch {
    return stop(STAGES.parse, SCANNER.unparsed);
  }
  read.parsed = true;
  read.output = output;

  const unsafe = UNSAFE_UNDER_UNPDF.some(rule =>
    rule.lab.test(output.lab || '') && rule.productClass === output.productClass);
  if (unsafe) return stop(STAGES.unsafe, unsafeSentence(output.lab));

  if (!(output && output.usable === true)){
    read.reasons = output ? output.rejectReasons : null;
    return stop(STAGES.refused, SCANNER.refused);
  }
  return stop(STAGES.accepted, null);
}

module.exports = { readReport, STAGES, SCANNER, MIN_TEXT, UNSAFE_UNDER_UNPDF, unsafeSentence };

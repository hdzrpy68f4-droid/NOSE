#!/usr/bin/env node
'use strict';
/* Put every fixture PDF through the archive's real storage path.
 *
 *   node scripts/seed-from-fixtures.js
 *
 * Each PDF in test/fixtures/pdf is extracted, parsed and stored exactly as a
 * scan on the live site is - through lib/archive.js, the function coa.js
 * calls - so one run proves the whole path, both halves, before a real jar
 * depends on it. The rows say context 'seed' and carry no source address.
 *
 * The stamps come from git (lib/version.js), so the run REFUSES to write while
 * parse-coa.js or extract-text.js has uncommitted changes: a stamp has to
 * name the code that actually ran.
 *
 * Safe to run twice: a PDF already stored is not rewritten, and a parse equal
 * to the latest one for its text is not written again.
 *
 * Needs three Codespaces secrets: NOSE_DB_URL, NETLIFY_SITE_ID and
 * NETLIFY_AUTH_TOKEN (see PARSER-HANDOFF s13).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify/functions/lib');
const PDF_DIR = path.join(ROOT, 'test/fixtures/pdf');
const TIMEOUT_MS = 20000;   // a script, not a function: no 10s ceiling to respect

const version = require(path.join(LIB, 'version.js'));
/* The stamp-or-refuse helper lives in scripts/lib/rerun.js now, shared with
   reparse.js and backfill-from-blobs.js; the seed's rules are unchanged. */
const rerun = require('./lib/rerun');
const { STAMPED_FILES, MIN_TEXT } = rerun;

function refuse(msg) {
  console.error(`REFUSED: ${msg}`);
  console.error('Nothing was written.');
  process.exit(1);
}

/* Decide the stamps, or refuse: all three secrets, a committed parser and
   extractor, and unpdf installed. Exported for test/archive-scripts-test.js. */
function stampsOrRefusal({ root, env } = {}) {
  return rerun.stampsOrRefusal({ root, env });
}

async function main() {
  const { refusal, stamps } = stampsOrRefusal();
  if (refusal) refuse(refusal);

  /* Every parse in this process now reports these stamps, not build-info.json. */
  version.pin({ parserVersion: stamps.parserVersion, extractorVersion: stamps.extractorVersion });

  const { extractCoaText } = require(path.join(LIB, 'extract-text.js'));
  const { parseCoa } = require(path.join(LIB, 'parse-coa.js'));
  const archive = require(path.join(LIB, 'archive.js'));
  const pdfStore = require(path.join(LIB, 'pdf-store.js'));
  const blobStore = pdfStore.open({ siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });

  const files = fs.readdirSync(PDF_DIR).filter(f => /\.pdf$/i.test(f)).sort();
  console.log(`seeding ${files.length} PDFs - parser ${stamps.parserVersion}, extractor ${stamps.extractorVersion} ` +
              `(unpdf ${stamps.unpdf}), context seed\n`);

  const tally = { written: 0, already: 0, pdfFailed: 0, parses: 0, unchanged: 0, dbFailed: 0, skipped: 0 };
  let failures = 0;

  for (const f of files) {
    const name = f.replace(/\.pdf$/i, '').padEnd(52);
    const buffer = fs.readFileSync(path.join(PDF_DIR, f));

    /* The same gates coa.js puts before the archive: text it cannot read, too
       little text, or a parser that throws means the scanner would have
       replied with an error and stored nothing - so nothing is stored here. */
    let text;
    try { ({ text } = await extractCoaText(buffer)); }
    catch (e) {
      failures++;
      console.log(`FAIL  ${name} could not extract: ${archive.reason(e)}`);
      continue;
    }
    if (typeof text !== 'string' || text.length < MIN_TEXT) {
      tally.skipped++;
      console.log(`skip  ${name} under ${MIN_TEXT} characters of text - the scanner stores nothing for it either`);
      continue;
    }
    let output;
    try { output = parseCoa(text); }
    catch (e) {
      failures++;
      console.log(`FAIL  ${name} the parser threw: ${archive.reason(e)}`);
      continue;
    }
    if (output.parserVersion !== stamps.parserVersion) {
      refuse(`the parser stamped "${output.parserVersion}", not ${stamps.parserVersion} - lib/version.js did not load`);
    }

    const r = await archive.storeScan(
      { buffer, finalUrl: null, text, output, context: 'seed',
        parserVersion: stamps.parserVersion, extractorVersion: stamps.extractorVersion },
      { timeoutMs: TIMEOUT_MS, openPdfStore: () => blobStore });

    if (r.kept === false && r.reason) {
      tally.skipped++;
      console.log(`skip  ${name} ${r.reason}`);
      continue;
    }
    if (r.pdf === 'written') tally.written++;
    else if (r.pdf === 'already stored') tally.already++;
    else tally.pdfFailed++;
    if (r.db === 'parse written') tally.parses++;
    else if (r.db === 'nothing new') tally.unchanged++;
    else tally.dbFailed++;
    if (r.failed.length) failures++;

    const verdict = output.usable ? 'usable' : 'refused by the parser, kept';
    console.log(`${r.failed.length ? 'FAIL' : 'ok  '}  ${name} pdf ${r.pdf.padEnd(15)} database ${r.db.padEnd(14)} ${verdict}` +
                (r.failed.length ? `\n      ${r.failed.join('\n      ')}` : ''));
  }

  console.log(`\n${files.length} PDFs: ${tally.written} stored now, ${tally.already} already stored, ${tally.pdfFailed} failed` +
              ` | database: ${tally.parses} parses written, ${tally.unchanged} unchanged, ${tally.dbFailed} failed` +
              (tally.skipped ? ` | ${tally.skipped} skipped` : ''));
  if (failures) {
    console.log(`seed: ${failures} failure${failures === 1 ? '' : 's'} - run it again once fixed; it only adds what is missing`);
    process.exit(1);
  }
  console.log('seed clean - now run: node scripts/archive-health.js');
}

module.exports = { stampsOrRefusal, STAMPED_FILES };
if (require.main === module) {
  main().catch(e => {
    const { reason } = require(path.join(LIB, 'archive.js'));
    console.error('seed failed:', reason(e));
    process.exit(1);
  });
}

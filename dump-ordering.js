#!/usr/bin/env node
'use strict';
/* Dump how unpdf orders a COA's terpene table, so a reader can be written for
 * that ordering.
 *
 *   node dump-ordering.js test/fixtures/pdf/<file>.pdf
 *
 * Prints the numbered line sequence around the terpene section, which is the
 * only thing the parser actually sees. Also prints poppler's ordering of the
 * same region when pdftotext is available, so the two can be compared directly.
 */
const fs = require('fs');
const { execSync } = require('child_process');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('usage: node dump-ordering.js <path-to.pdf>');
  process.exit(1);
}

// Anchor on any of these; the first that appears wins.
const ANCHORS = [/TERPENES?\s*SUMMARY/i, /^TERPENES?$/i, /TOTAL\s+TERPENES/i, /Total Terpenes/i];
const WINDOW = 90;

function findAnchor(lines) {
  for (const re of ANCHORS) {
    const i = lines.findIndex(l => re.test(l.trim()));
    if (i !== -1) return i;
  }
  return -1;
}

function show(label, text) {
  const lines = text.split('\n');
  const i = findAnchor(lines);
  console.log('\n=== ' + label + ' ===');
  if (i === -1) {
    console.log('(no terpene anchor found; first 40 non-empty lines)');
    lines.filter(l => l.trim()).slice(0, 40)
      .forEach((l, n) => console.log(String(n).padStart(4) + ' | ' + JSON.stringify(l)));
    return;
  }
  const from = Math.max(0, i - 6);
  const to = Math.min(lines.length, i + WINDOW);
  for (let n = from; n < to; n++) {
    if (!lines[n].trim()) continue;               // blank lines are noise here
    console.log(String(n).padStart(4) + ' | ' + JSON.stringify(lines[n]));
  }
}

(async () => {
  const buf = fs.readFileSync(file);

  // --- unpdf: what the serverless function actually sees ---
  try {
    const { extractCoaText } = require('./netlify/functions/lib/extract-text');
    const out = await extractCoaText(buf);
    const text = typeof out === 'string' ? out : (out && out.text);
    if (typeof text !== 'string') {
      console.log('extractCoaText returned no string:', typeof out, out && Object.keys(out));
    } else {
      show('UNPDF (production path)', text);
    }
  } catch (err) {
    console.log('\nunpdf extraction failed:', err && err.message);
  }

  // --- poppler: what the fixtures were built with ---
  try {
    const tmp = '/tmp/_dump_ordering.txt';
    execSync(`pdftotext ${JSON.stringify(file)} ${tmp}`, { stdio: 'pipe' });
    show('PDFTOTEXT (fixture path)', fs.readFileSync(tmp, 'utf8'));
    fs.unlinkSync(tmp);
  } catch {
    console.log('\n=== PDFTOTEXT ===\n(pdftotext not available here — skipping)');
  }

  // --- what the parser currently makes of it ---
  try {
    const { extractCoaText } = require('./netlify/functions/lib/extract-text');
    const { parseCoa } = require('./netlify/functions/lib/parse-coa');
    const out = await extractCoaText(buf);
    const text = typeof out === 'string' ? out : (out && out.text);
    const r = parseCoa(text);
    console.log('\n=== PARSER RESULT (from unpdf text) ===');
    console.log('lab        :', r.lab);
    console.log('class      :', r.productClass);
    console.log('layout     :', r.layout);
    console.log('usable     :', r.usable);
    console.log('total terps:', r.totalTerpenes);
    console.log('coverage   :', r.coverage);
    console.log('terps      :', JSON.stringify(r.terps));
    console.log('reasons    :', r.rejectReasons);
  } catch (err) {
    console.log('\nparse failed:', err && err.message);
  }
})();

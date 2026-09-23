#!/usr/bin/env node
'use strict';
/* Turn one archived report into a candidate test fixture.
 *
 *   node scripts/export-candidate.js <sha>                 files named candidate-<first 8>
 *   node scripts/export-candidate.js <sha> LAB-FORM-NNN    files named that
 *
 * <sha> is a document's fingerprint, or its first 7 or more characters, as
 * reparse.js and archive-health.js print them. Writes two files:
 *
 *   test/fixtures/pdf/<name>.pdf         the PDF from Netlify Blobs, checked
 *                                        against its fingerprint
 *   test/fixtures/extracted/<name>.txt   its text from the CURRENT extractor,
 *                                        exactly as test/extract-dump.js
 *                                        would write it
 *
 * and prints the stored lab, strain and batch so it can be named LAB-FORM-NNN
 * (PARSER-HANDOFF s10). An existing file is never overwritten.
 *
 * WRITES FILES, NEVER COMMITS THEM. The repo is public, and whether fixture
 * PDFs belong in it is still open (PARSER-HANDOFF s9), so .gitignore keeps new
 * PDFs out of `git add`. The expected values are then recorded BY HAND from
 * the PDF (s10) - never copied from the parser's output, which is what the
 * fixture exists to check. Until they are, the gates count the new files and
 * fail.
 *
 * Reads the archive only. Needs NOSE_DB_URL, NETLIFY_SITE_ID and
 * NETLIFY_AUTH_TOKEN. Prints no report text, no addresses, no secrets.
 */

const fs = require('fs');
const path = require('path');
const rerun = require('./lib/rerun');

const { ROOT, LIB, SECRETS } = rerun;
const USAGE = 'usage: node scripts/export-candidate.js <sha, or its first 7+ characters> [LAB-FORM-NNN]';
const PDF_DIR = path.join(ROOT, 'test/fixtures/pdf');
const TEXT_DIR = path.join(ROOT, 'test/fixtures/extracted');
const BASELINE = path.join(ROOT, 'test/fixtures/coa-baseline.json');
const NAME = /^[A-Z][A-Z0-9]{1,5}-[A-Z]{3}-\d{3}$/;
const FIXTURE_NAME = /^([A-Z][A-Z0-9]{1,5})-([A-Z]{3})-(\d{3})$/;

class UsageError extends Error {}   // the arguments are wrong: exit 2
class Refusal extends Error {}      // nothing was written, and this says why: exit 1

const rel = f => path.relative(process.cwd(), f) || f;

/* The LAB-FORM names already used for a lab, highest number per form: the
   next free one is a glance away. From the baseline, whose lab names come
   from the same parser as the stored reading. */
function namesInUse(baseline, lab) {
  const top = new Map();
  for (const [name, entry] of Object.entries(baseline || {})) {
    const m = FIXTURE_NAME.exec(name);
    if (!m || !entry || entry.lab !== lab) continue;
    const key = `${m[1]}-${m[2]}`;
    if (!top.has(key) || top.get(key) < m[3]) top.set(key, m[3]);
  }
  return [...top].sort().map(([k, n]) => `${k}-${n}`);
}

async function exportCandidate({ db, blobs, extract, prefix, name = null, pdfDir = PDF_DIR, textDir = TEXT_DIR,
                                 baseline = {}, log = console.log }) {
  const pdfStore = require(path.join(LIB, 'pdf-store.js'));

  const p = String(prefix || '').toLowerCase();
  if (!/^[0-9a-f]{7,64}$/.test(p)) throw new UsageError('give a document fingerprint, or at least its first 7 characters (0-9 and a-f)');
  if (name !== null && !NAME.test(name)) {
    throw new UsageError(`"${name}" is not LAB-FORM-NNN, like KAY-FLW-004 (PARSER-HANDOFF s10)`);
  }

  const docs = (await db.query(
    'select id::text as id, sha256 from nose.documents where sha256 like $1 order by id limit 6', [`${p}%`])).rows;
  if (!docs.length) throw new Refusal(`no document's fingerprint starts with ${p} - nothing was written`);
  if (docs.length > 1) {
    throw new Refusal(`${p} matches more than one document (${docs.map(d => rerun.short(d.sha256)).join(', ')}${docs.length > 5 ? ', ...' : ''}) - give more characters. Nothing was written.`);
  }
  const row = await rerun.readRow(db, docs[0].id);
  const out = row.output || {};

  const pdf = await pdfStore.read(blobs, row.sha256);
  if (!pdf) {
    throw new Refusal(`document #${row.id} has no PDF in Blobs - it was kept before PDFs were, or its PDF write failed. ` +
                    'Scan the jar again on the live site to store it, then export. Nothing was written.');
  }

  if (name !== null && baseline && baseline[name]) {
    throw new Refusal(`${name} already has a baseline entry - it names another report. Pick the next free number. Nothing was written.`);
  }
  const base = name || `candidate-${row.sha256.slice(0, 8)}`;
  const pdfPath = path.join(pdfDir, `${base}.pdf`);
  const textPath = path.join(textDir, `${base}.txt`);
  for (const f of [pdfPath, textPath]) {
    if (fs.existsSync(f)) throw new Refusal(`${rel(f)} already exists - nothing was written`);
  }

  const got = await extract(pdf.bytes);
  const text = typeof got === 'string' ? got : got && got.text;
  if (typeof text !== 'string') throw new Refusal('the extractor returned no text - nothing was written');

  fs.mkdirSync(pdfDir, { recursive: true });
  fs.mkdirSync(textDir, { recursive: true });
  fs.writeFileSync(pdfPath, pdf.bytes, { flag: 'wx' });
  /* test/extract-dump.js strips NUL on write, so grep never skips the file. */
  fs.writeFileSync(textPath, text.replace(/\0/g, ''), { flag: 'wx' });
  const sameText = typeof row.text === 'string' && rerun.asStoredText(text) === row.text;

  const shown = v => (v === undefined || v === null || v === '' ? '-' : String(v));
  const reasons = Array.isArray(out.rejectReasons) ? out.rejectReasons.length : 0;
  log(`document #${row.id}  ${rerun.short(row.sha256)}  first fetched ${shown(row.first_fetched_on)}`);
  log(row.parse_id
    ? `stored reading - parse #${row.parse_id}, parser ${shown(row.parser_version)}, context ${shown(row.context)}:`
    : 'no stored reading for this document');
  log(`  lab      ${shown(out.lab)}`);
  log(`  strain   ${shown(out.strain)}`);
  log(`  batch    ${shown(out.batch)}`);
  log(`  class    ${shown(out.productClass)}  (the parser's; name it by what the document itself says)`);
  log(`  verdict  ${out.usable === true ? 'usable' : out.usable === false ? `refused (${reasons} reason${reasons === 1 ? '' : 's'})` : '-'}`);
  log('wrote');
  log(`  ${rel(pdfPath)}`);
  log(`  ${rel(textPath)}  (today's extractor - ${sameText ? 'the same text the archive holds'
    : 'NOT the text the archive holds: extract-text.js changed since; run reparse.js --reextract'})`);
  log('next');
  if (!name) {
    const used = out.lab ? namesInUse(baseline, out.lab) : [];
    log(`  1. Name it LAB-FORM-NNN (PARSER-HANDOFF s10).${used.length ? ` ${out.lab} so far: ${used.join('  ')}` : ''}`);
    log(`       mv ${rel(pdfPath)} ${rel(path.join(pdfDir, 'LAB-FORM-NNN.pdf'))}`);
    log(`       mv ${rel(textPath)} ${rel(path.join(textDir, 'LAB-FORM-NNN.txt'))}`);
  } else {
    log(`  1. Named ${name}.`);
  }
  log('  2. Open the PDF and write its expected values into test/fixtures/coa-baseline.json BY HAND -');
  log('     never from the parser\'s output (PARSER-HANDOFF s10).');
  log('  3. Until then the gates count the new files and fail. To undo: delete both files.');
  log('  Nothing here commits. Do not commit the PDF while PARSER-HANDOFF s9 is open.');
  return { pdfPath, textPath, sameText, documentId: row.id };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length < 1 || argv.length > 2 || argv.some(a => a.startsWith('-'))) {
    console.error(USAGE);
    process.exit(2);
  }
  /* Reads only, so uncommitted code is fine - like test/extract-dump.js. */
  const { refusal } = rerun.stampsOrRefusal({ needs: SECRETS, write: false, extractor: true });
  if (refusal) {
    console.error(`REFUSED: ${refusal}`);
    process.exit(1);
  }
  const { extractCoaText } = require(path.join(LIB, 'extract-text.js'));
  let baseline = {};
  try { baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch { /* the naming hint is optional */ }

  let db = null;
  try {
    const blobs = rerun.openBlobs();
    db = rerun.openDb();
    await rerun.connectAsWriter(db);
    await exportCandidate({ db, blobs, extract: extractCoaText, prefix: argv[0], name: argv[1] ?? null, baseline });
  } catch (e) {
    const known = e instanceof UsageError || e instanceof Refusal;
    console.error(known ? e.message : `export failed: ${rerun.explain(e)}`);
    process.exitCode = e instanceof UsageError ? 2 : 1;
  } finally {
    if (db) await db.end().catch(() => {});
  }
}

module.exports = { exportCandidate, namesInUse, UsageError, Refusal, USAGE };
if (require.main === module) {
  main().catch(e => { console.error('export failed:', e && e.message); process.exit(1); });
}

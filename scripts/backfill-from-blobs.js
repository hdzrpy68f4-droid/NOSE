#!/usr/bin/env node
'use strict';
/* Give every orphaned PDF its database rows.
 *
 *   node scripts/backfill-from-blobs.js --dry-run    what would be saved; writes nothing
 *   node scripts/backfill-from-blobs.js              save it
 *
 * The archive's two halves are written independently (lib/archive.js), so a
 * scan made while Supabase was paused or down keeps its PDF in Netlify Blobs
 * and has no database rows - archive-health.js lists these as "PDFs with no
 * document row". This extracts and parses each one with the current code and
 * saves it through nose.save_scan with context 'backfill'. The document is
 * dated by the day in the PDF's own metadata (fetchedAt, a UTC day), not by
 * today, and its address comes from there too.
 *
 * The same gates as a live scan: a PDF with under 200 characters of text, one
 * the parser throws on, or one that is not a lab report by the scanner's rule
 * - two of its three signs, lib/archive.js - stores nothing. Neither does one
 * WITHHELD: its file, or its text, was taken out of the archive by hand
 * (scripts/remove-document.js), and save_scan would refuse it anyway. Both
 * are listed with the command that deletes their PDF.
 *
 * A PDF whose text a stored document already holds is not an orphan but a
 * DUPLICATE COPY: the same report under other bytes, from a portal that builds
 * its PDF at the moment of download (PARSER-HANDOFF s13). The scanner keeps
 * no PDF of a copy when the database answers, but writes one when it cannot,
 * so a copy can reach Blobs while the database is down. It is listed with the
 * document it copies and nothing is saved for it. Neither does one whose metadata has no valid day - nothing
 * is guessed. Each is listed with its reason. The PDFs are never changed.
 *
 * Stamped from git; REFUSES to write while parse-coa.js, coa-dates.js or
 * extract-text.js has uncommitted changes (--dry-run is allowed). Safe to run again: a PDF
 * that has its document row is no longer an orphan. Connects as nose_writer.
 * Prints no report text, no addresses, no secrets.
 *
 * Needs NOSE_DB_URL, NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN.
 */

const path = require('path');
const rerun = require('./lib/rerun');

const { LIB, MIN_TEXT } = rerun;

/* The first document holding a text, by the fingerprint save_scan uses. */
const COPY_OF_SQL = `
  select document_id::text as id from nose.extractions
   where text_sha256 = $1
   order by document_id, id
   limit 1`;
/* Taken out by hand: the file, or its text (scripts/remove-document.js). */
const WITHHELD_SQL = `
  select kind from nose.withheld
   where (kind = 'file' and sha256 = $1) or (kind = 'text' and sha256 = $2)
   limit 1`;
const USAGE = 'usage: node scripts/backfill-from-blobs.js [--dry-run]';

async function backfill({ db, blobs, parse, extract, dryRun = false, stamps, log = console.log }) {
  const store = require(path.join(LIB, 'store.js'));
  const pdfStore = require(path.join(LIB, 'pdf-store.js'));
  const archive = require(path.join(LIB, 'archive.js'));

  const keys = (await pdfStore.keys(blobs)).sort();
  const known = new Set((await db.query('select sha256 from nose.documents')).rows.map(r => r.sha256));
  const orphans = keys.filter(k => !known.has(k));
  const counts = { pdfs: keys.length, orphans: orphans.length, saved: 0, copies: 0, skipped: 0, failed: 0 };
  /* Before the 2026-10-02 removals migration nothing can be withheld. */
  const canWithhold = (await db.query(`select to_regclass('nose.withheld') is not null as ok`)).rows[0].ok === true;

  for (const key of orphans) {
    const head = rerun.short(key);
    const skip = why => { counts.skipped++; log(`skip  ${head}  ${why}`); };
    const fail = why => { counts.failed++; log(`FAIL  ${head}  ${why}`); };
    const removeWith = extra => `node scripts/remove-document.js ${key.slice(0, 8)}${extra}`;

    let pdf;
    try { pdf = await pdfStore.read(blobs, key); }
    catch (e) { fail(`could not read the PDF: ${archive.reason(e)}`); continue; }
    if (!pdf) { skip('listed, but gone by the time it was downloaded'); continue; }
    const day = pdf.metadata.fetchedAt;
    if (!day) { skip('its metadata holds no valid fetch day - nothing guessed, nothing stored'); continue; }

    let text;
    try {
      const got = await extract(pdf.bytes);
      text = typeof got === 'string' ? got : got && got.text;
    } catch (e) { fail(`could not extract: ${archive.reason(e)}`); continue; }
    if (typeof text !== 'string' || text.length < MIN_TEXT) {
      skip(`under ${MIN_TEXT} characters of text - the scanner stores nothing for it either`);
      continue;
    }
    let output;
    try { output = rerun.asStored(parse(text)); }
    catch (e) { fail(`the parser threw: ${archive.reason(e)}`); continue; }
    if (!archive.looksLikeLabReport(output, text)) {
      skip('not a lab report by the scanner\'s own rule (two of its three signs) - nothing stored; ' +
           `its PDF stays in Blobs until ${removeWith(' --reason notreport --yes')} deletes it`);
      continue;
    }
    if (text.length > archive.MAX_TEXT) { skip('its text is over 256KB, which the archive does not keep'); continue; }

    /* Taken out by hand: save_scan would refuse it, so it is not offered. Its
       PDF got here by a scan made while the database was down, or stayed
       when a removal could not delete it. */
    if (canWithhold) {
      let held;
      try { held = (await db.query(WITHHELD_SQL, [key, rerun.textSha(text)])).rows[0] || null; }
      catch (e) { fail(`database: ${archive.reason(e)}`); continue; }
      if (held) {
        skip(`withheld - its ${held.kind} was taken out of the archive by hand; nothing saved. This PDF was left ` +
             `behind (a scan while the database was down, or a deletion that failed): ${removeWith(' --yes')} deletes it`);
        continue;
      }
    }

    /* The same text as a stored document: a duplicate copy, not an orphan. */
    let copyOf;
    try { copyOf = (await db.query(COPY_OF_SQL, [rerun.textSha(text)])).rows[0] || null; }
    catch (e) { fail(`database: ${archive.reason(e)}`); continue; }
    if (copyOf) {
      counts.copies++;
      log(`copy  ${head}  first fetched ${day}  ${rerun.labStrain(null, output)}  -> a duplicate copy of document #${copyOf.id}: ` +
          'the same text under other bytes - nothing saved');
      continue;
    }
    if (!dryRun && output.parserVersion !== stamps.parserVersion) {
      throw new Error(`the parser stamped "${output.parserVersion}", not ${stamps.parserVersion} - lib/version.js did not load`);
    }

    const what = `first fetched ${day}  ${rerun.labStrain(null, output)}  ${output.usable ? 'usable' : 'refused by the parser, kept'}`;
    if (dryRun) {
      counts.saved++;
      log(`would ${head}  ${what}`);
      continue;
    }
    let saved;
    try {
      saved = await store.saveScan({
        sha256: key,
        byteSize: pdf.bytes.length,
        sourceUrl: archive.sourceAddress(pdf.metadata.sourceUrl),   // origin + path, https only - as first stored
        fetchedAt: day,                                               // the day it was scanned, not today
        extractorVersion: stamps.extractorVersion,
        text,
        parserVersion: stamps.parserVersion,
        context: 'backfill',
        output
      }, { client: db });
    } catch (e) { fail(`database: ${archive.reason(e)}`); continue; }
    if (saved && saved.withheld === true) {
      skip(`withheld - taken out of the archive by hand while this ran; nothing saved: ${removeWith(' --yes')} deletes its PDF`);
      continue;
    }
    counts.saved++;
    log(`ok    ${head}  ${what}  -> document #${saved.documentId}` +
        (saved.documentWritten ? '' : ' (its row had appeared in the meantime)'));
  }

  if (orphans.length) log('');
  if (dryRun) log('dry run - nothing was written');
  log(`${counts.pdfs} PDFs in Blobs, ${counts.orphans} with no document row: ${counts.saved} ${dryRun ? 'would be saved' : 'saved'}, ` +
      `${counts.copies} duplicate ${counts.copies === 1 ? 'copy' : 'copies'}, ${counts.skipped} skipped, ${counts.failed} failed`);
  return counts;
}

async function main(argv = process.argv.slice(2)) {
  const bad = argv.filter(a => a !== '--dry-run');
  if (bad.length) {
    console.error(`unknown: ${bad.join(' ')}\n${USAGE}`);
    process.exit(2);
  }
  const dryRun = argv.includes('--dry-run');
  const { refusal, stamps } = rerun.stampsOrRefusal({ write: !dryRun, extractor: true });
  if (refusal) {
    console.error(`REFUSED: ${refusal}`);
    console.error('Nothing was written.');
    process.exit(1);
  }
  require(path.join(LIB, 'version.js')).pin({ parserVersion: stamps.parserVersion, extractorVersion: stamps.extractorVersion });
  const dirty = stamps.dirty.length
    ? ` - uncommitted changes in ${stamps.dirty.map(f => path.basename(f)).join(', ')}, fine for a dry run` : '';
  console.log(`backfill${dryRun ? ' --dry-run' : ''}: parser ${stamps.parserVersion}, extractor ${stamps.extractorVersion} ` +
              `(unpdf ${stamps.unpdf}), context backfill${dirty}\n`);

  const { parseCoa } = require(path.join(LIB, 'parse-coa.js'));
  const { extractCoaText } = require(path.join(LIB, 'extract-text.js'));
  let db = null;
  try {
    const blobs = rerun.openBlobs();
    db = rerun.openDb();
    await rerun.connectAsWriter(db);
    const counts = await backfill({ db, blobs, parse: parseCoa, extract: extractCoaText, dryRun, stamps });
    if (counts.failed) process.exitCode = 1;
  } catch (e) {
    console.error(`\nbackfill stopped: ${rerun.explain(e)}`);
    process.exitCode = 1;
  } finally {
    if (db) await db.end().catch(() => {});
  }
}

module.exports = { backfill, COPY_OF_SQL, WITHHELD_SQL, USAGE };
if (require.main === module) {
  main().catch(e => { console.error('backfill failed:', e && e.message); process.exit(1); });
}

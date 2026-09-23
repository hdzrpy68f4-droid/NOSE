#!/usr/bin/env node
'use strict';
/* Run the whole archive through the current parser - and, with --reextract,
 * the current extractor first - and keep every reading that changed.
 *
 *   node scripts/reparse.js --dry-run               what would change; writes nothing
 *   node scripts/reparse.js                         parse every stored text again, and save
 *   node scripts/reparse.js --reextract --dry-run
 *   node scripts/reparse.js --reextract             extract every PDF again first
 *
 * For each document, 100 at a time: the text of its newest extraction is
 * parsed by the current parse-coa.js and saved through nose.save_scan with
 * context 'reparse'. save_scan writes a parse only when the reading differs
 * from the latest one, so the archive grows only when a reading changes.
 *
 * --reextract pulls each PDF from Netlify Blobs and runs the current
 * extract-text.js on it first. A text is kept only when it differs from every
 * text already stored for that document - the (document_id, text_sha256)
 * constraint does that - and is then parsed. Only needed after
 * extract-text.js changes. A document with no PDF in Blobs (kept before PDFs
 * were) is parsed from its stored text instead, and counted.
 *
 * Prints, for each document whose reading changed: the short fingerprint,
 * lab and strain; usable, readBy and totalTerpenes before -> after; and every
 * terpene that moved more than 0.001. Ends with the counts: unchanged /
 * values changed / accepted->rejected / rejected->accepted.
 *
 * A real run is stamped from git and REFUSES while parse-coa.js or
 * extract-text.js has uncommitted changes; --dry-run writes nothing and runs
 * on anything, which is what it is for. Every real run adds one row to
 * nose.reparse_runs, even when nothing changed, so "this parser version
 * checked every document" is on record. Connects as nose_writer, which can
 * only read and insert. Prints no report text, no addresses, no secrets.
 *
 * Needs NOSE_DB_URL; --reextract also NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN.
 *
 * One corner: if extract-text.js is reverted, a re-extracted text can equal an
 * EARLIER extraction of the same document, which the constraint reuses rather
 * than storing again - so the newest row stays the newer text, and a plain
 * reparse keeps reading it. --reextract says so for each such document.
 */

const path = require('path');
const rerun = require('./lib/rerun');

const { LIB, MIN_TEXT, PAGE_SIZE, SECRETS } = rerun;
const USAGE = 'usage: node scripts/reparse.js [--dry-run] [--reextract]';

const RECORD_SQL = `
  insert into nose.reparse_runs
         (mode, parser_version, extractor_version, documents, last_document_id, unchanged, values_changed,
          accepted_to_rejected, rejected_to_accepted, failed, new_texts, no_pdf)
  values ($1, $2, $3, $4::int, $5::bigint, $6::int, $7::int, $8::int, $9::int, $10::int, $11::int, $12::int)
  returning id::text as id, run_on::text as day`;

const EARLIER_SQL = `
  select id::text as id from nose.extractions
   where document_id = $1::bigint and text_sha256 = $2`;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* The run itself, with everything it touches passed in, so
 * test/rerun-test.js can drive it on PGlite with stand-ins for the parser,
 * the extractor and Blobs. */
async function reparse({ db, parse, extract = null, blobs = null, reextract = false, dryRun = false,
                         stamps, pageSize = PAGE_SIZE, log = console.log, progress = () => {} }) {
  const store = require(path.join(LIB, 'store.js'));
  const pdfStore = require(path.join(LIB, 'pdf-store.js'));
  const { reason, MAX_TEXT } = require(path.join(LIB, 'archive.js'));

  const counts = { documents: 0, unchanged: 0, 'values changed': 0, 'accepted→rejected': 0, 'rejected→accepted': 0,
                   failed: 0, newTexts: 0, noPdf: 0 };

  async function one(row) {
    const before = row.output || null;
    const fail = why => ({ failed: true, lines: [`${rerun.short(row.sha256)}  ${rerun.labStrain(before, null)}  FAILED: ${why}`] });
    if (row.extraction_id == null) return fail('no extraction is stored for it');

    let text = row.text;
    let extractorVersion = row.extractor_version;
    let fresh = false;
    let noPdf = false;
    if (reextract) {
      let pdf = null;
      if (stored.has(row.sha256)) {
        try { pdf = await pdfStore.read(blobs, row.sha256); }
        catch (e) { return fail(`could not read its PDF: ${reason(e)}`); }
      }
      if (!pdf) {
        noPdf = true;
      } else {
        let got;
        try { got = await extract(pdf.bytes); }
        catch (e) { return fail(`could not extract: ${reason(e)}`); }
        const t = typeof got === 'string' ? got : got && got.text;
        if (typeof t !== 'string' || t.length < MIN_TEXT) {
          return fail(`the extractor read under ${MIN_TEXT} characters - nothing kept; has extract-text.js regressed?`);
        }
        if (t.length > MAX_TEXT) return fail('the extracted text is over 256KB, which the archive does not keep');
        text = t;
        extractorVersion = stamps.extractorVersion;
        fresh = true;
      }
    }

    let after;
    try { after = rerun.asStored(parse(text)); }
    catch (e) { return fail(`the parser threw: ${reason(e)}`); }
    if (!dryRun && (!after || after.parserVersion !== stamps.parserVersion)) {
      /* Fatal, not a per-document failure: the stamp would be wrong on every row. */
      throw new Error(`the parser stamped "${after && after.parserVersion}", not ${stamps.parserVersion} - lib/version.js did not load`);
    }
    const outcome = rerun.classify(before, after);

    /* A fresh text is the newest one again, one stored earlier, or new. */
    let earlier = null;
    let newText = false;
    if (fresh) {
      const h = rerun.textSha(text);
      if (h !== row.text_sha256) {
        try { earlier = (await db.query(EARLIER_SQL, [row.id, h])).rows[0] || null; }
        catch (e) { return fail(`database: ${reason(e)}`); }
        newText = !earlier;
      }
    }

    let saved = null;
    if (!dryRun) {
      try {
        saved = await store.saveScan({
          sha256: row.sha256,
          byteSize: row.byte_size,
          sourceUrl: null,          // the document row exists; save_scan keeps its first address
          fetchedAt: null,
          extractorVersion,
          text,
          parserVersion: stamps.parserVersion,
          context: 'reparse',
          output: after
        }, { client: db });
      } catch (e) { return fail(`database: ${reason(e)}`); }
      newText = !!saved.extractionWritten;
    }

    const lines = outcome === 'unchanged' ? [] : rerun.describe(row.sha256, before, after);
    const notes = [];
    if (noPdf) notes.push('no PDF in Blobs - parsed from its stored text');
    if (newText) notes.push(dryRun ? 'its text changed - would be kept as a new extraction' : 'its text changed - kept as a new extraction');
    if (earlier) notes.push(`its text equals an earlier extraction (#${earlier.id}), not the newest - a plain reparse keeps reading the newest`);
    if (saved && !reextract && saved.parseWritten !== (outcome !== 'unchanged')) {
      notes.push('the database compared it with a different latest parse - did a scan land during the run?');
    }
    if (notes.length && !lines.length) lines.push(`${rerun.short(row.sha256)}  ${rerun.labStrain(before, after)}`);
    for (const n of notes) lines.push(`          ${n}`);
    return { outcome, lines, noPdf, newText };
  }

  /* A real run ends by recording itself, so the table must be there before
     anything is saved - not discovered missing after the parses are written. */
  if (!dryRun) {
    try { await db.query('select 1 from nose.reparse_runs limit 0'); }
    catch (e) {
      throw new Error(/does not exist/.test(e.message)
        ? 'nose.reparse_runs is missing - push the migration first: npx supabase db push --db-url "$NOSE_DB_ADMIN_URL"'
        : e.message);
    }
  }

  /* Which PDFs Blobs holds, listed once: a refused or expired token stops the
     run here, before any document is counted as failed, and a document with no
     PDF costs no request. */
  const stored = reextract ? new Set(await pdfStore.keys(blobs)) : new Set();
  const total = (await db.query('select count(*)::int as n from nose.documents')).rows[0].n;
  let last = null;
  let printed = 0;
  for (;;) {
    const rows = await rerun.readRows(db, { after: last || '0', limit: pageSize });
    for (const row of rows) {
      last = row.id;
      counts.documents++;
      const r = await one(row);
      for (const line of r.lines) { log(line); printed++; }
      if (r.failed) { counts.failed++; continue; }
      counts[r.outcome]++;
      if (r.noPdf) counts.noPdf++;
      if (r.newText) counts.newTexts++;
    }
    if (rows.length) progress(counts.documents, Math.max(total, counts.documents));
    if (rows.length < pageSize) break;
  }

  let run = null;
  if (!dryRun) {
    run = (await db.query(RECORD_SQL, [
      reextract ? 'reextract' : 'reparse', stamps.parserVersion, reextract ? stamps.extractorVersion : null,
      counts.documents, last, counts.unchanged, counts['values changed'], counts['accepted→rejected'],
      counts['rejected→accepted'], counts.failed, counts.newTexts, counts.noPdf])).rows[0];
  }

  if (printed) log('');
  if (run) {
    log(`run #${run.id} recorded: parser ${stamps.parserVersion}${reextract ? ` with extractor ${stamps.extractorVersion}` : ''}` +
        ` checked ${plural(counts.documents, 'document')}${last ? ` (through document #${last})` : ''} on ${run.day} (UTC)`);
  } else {
    log('dry run - nothing was written');
  }
  if (reextract) {
    log(`re-extract: ${plural(counts.newTexts, 'new text')} ${dryRun ? 'would be kept' : 'kept'}; ` +
        `${plural(counts.noPdf, 'document')} with no PDF, parsed from stored text`);
  }
  log(`${plural(counts.documents, 'document')}: ${counts.unchanged} unchanged / ${counts['values changed']} values changed / ` +
      `${counts['accepted→rejected']} accepted→rejected / ${counts['rejected→accepted']} rejected→accepted / ${counts.failed} failed`);
  return { counts, run, last };
}

/* A progress line on a terminal only, cleared before anything else prints. */
function terminal() {
  const tty = !!process.stderr.isTTY;
  let showing = false;
  const clear = () => { if (showing) { process.stderr.write('\r\x1b[K'); showing = false; } };
  return {
    log: line => { clear(); console.log(line); },
    progress: (n, total) => { if (tty) { process.stderr.write(`\r  checked ${n} of ${total}`); showing = true; } },
    done: clear
  };
}

async function main(argv = process.argv.slice(2)) {
  const bad = argv.filter(a => a !== '--dry-run' && a !== '--reextract');
  if (bad.length) {
    console.error(`unknown: ${bad.join(' ')}\n${USAGE}`);
    process.exit(2);
  }
  const dryRun = argv.includes('--dry-run');
  const reextract = argv.includes('--reextract');

  const { refusal, stamps } = rerun.stampsOrRefusal({
    needs: reextract ? SECRETS : ['NOSE_DB_URL'], write: !dryRun, extractor: reextract });
  if (refusal) {
    console.error(`REFUSED: ${refusal}`);
    console.error('Nothing was written.');
    process.exit(1);
  }
  /* Every parse in this process now reports these stamps, not build-info.json. */
  require(path.join(LIB, 'version.js')).pin({ parserVersion: stamps.parserVersion, extractorVersion: stamps.extractorVersion });

  const dirty = stamps.dirty.length
    ? ` - uncommitted changes in ${stamps.dirty.map(f => path.basename(f)).join(', ')}, fine for a dry run` : '';
  console.log(`reparse${reextract ? ' --reextract' : ''}${dryRun ? ' --dry-run' : ''}: parser ${stamps.parserVersion}` +
              (reextract ? `, extractor ${stamps.extractorVersion} (unpdf ${stamps.unpdf})` : '') + `${dirty}\n`);

  const { parseCoa } = require(path.join(LIB, 'parse-coa.js'));
  const extract = reextract ? require(path.join(LIB, 'extract-text.js')).extractCoaText : null;
  const ui = terminal();
  let db = null;
  try {
    const blobs = reextract ? rerun.openBlobs() : null;
    db = rerun.openDb();
    await rerun.connectAsWriter(db);
    const { counts } = await reparse({ db, parse: parseCoa, extract, blobs, reextract, dryRun, stamps,
                                       log: ui.log, progress: ui.progress });
    if (counts.failed) process.exitCode = 1;
  } catch (e) {
    ui.done();
    console.error(`\nreparse stopped: ${rerun.explain(e)}\nNo run was recorded.`);
    process.exitCode = 1;
  } finally {
    ui.done();
    if (db) await db.end().catch(() => {});
  }
}

module.exports = { reparse, RECORD_SQL, USAGE };
if (require.main === module) {
  main().catch(e => { console.error('reparse failed:', e && e.message); process.exit(1); });
}

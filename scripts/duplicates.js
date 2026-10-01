#!/usr/bin/env node
'use strict';
/* Which lab reports the archive holds more than once. Read-only.
 *
 *   node scripts/duplicates.js               every report kept as more than one document
 *   node scripts/duplicates.js --limit 200   list more than the first 50 of each kind
 *
 * A document is one PDF, keyed by the SHA-256 of its bytes (PARSER-HANDOFF
 * s13). A portal that builds its PDF at the moment of download - Method Testing
 * Labs' coaportal stamps each file with the time it was made - hands over new
 * bytes every time, so one report scanned twice becomes two documents. This
 * finds them two ways:
 *
 *   same text     documents whose extracted text is identical: one report,
 *                 stored more than once. The first document stored is the
 *                 report; every later one is a COPY. A copy holds its own
 *                 extraction, its own parses and, since 2026-09-23, its own
 *                 PDF in Netlify Blobs.
 *   same lab ID   documents whose latest readings name the same laboratory and
 *                 the same lab ID (the lab's own sample number), where the
 *                 parser read one. With one text they are copies, already
 *                 listed above; with different texts they are an amended
 *                 report, a re-render that changed its text, or one ID on two
 *                 reports - look at the PDFs.
 *
 * Ends with the count of copies, by lab, and what they hold - rows, and with
 * NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN set, how many have a PDF in Blobs.
 * Run it before and after scanning the same jar twice: a portal that rebuilds
 * its PDF adds a copy per scan.
 *
 * Reads only, as nose_writer. Needs NOSE_DB_URL. Prints no report text, no
 * addresses, no secrets: ids, days, the first 8 characters of a file
 * fingerprint, sizes, and the lab, strain and lab ID the parser read.
 */

const path = require('path');
const rerun = require('./lib/rerun');

const USAGE = 'usage: node scripts/duplicates.js [--limit N]';
const DEFAULT_LIMIT = 50;

class UsageError extends Error {}

/* Every document, how it first arrived, and how many rows hang from it. No
   text and no address is selected, so neither can be printed. */
const DOCUMENTS_SQL = `
  select d.id::text as id, d.sha256, d.byte_size, d.first_fetched_on::text as day,
         (select s.context
            from nose.extractions x
            join nose.parses s on s.extraction_id = x.id
           where x.document_id = d.id
           order by s.id
           limit 1) as first_context,
         (select count(*) from nose.extractions x where x.document_id = d.id)::int as extractions,
         (select count(*)
            from nose.extractions x
            join nose.parses s on s.extraction_id = x.id
           where x.document_id = d.id)::int as parses
    from nose.documents d
   order by d.id`;

/* Each extraction's text fingerprint - computed by the database (text_hash),
   never the text itself. */
const TEXTS_SQL = `
  select x.document_id::text as id, x.text_sha256
    from nose.extractions x
   order by x.document_id, x.id`;

/* Each document's latest reading, as reparse.js and the analysis views read it. */
const READINGS_SQL = `
  select l.document_id::text as id, l.lab, l.lab_id, l.strain, l.usable,
         l.total_terpenes::text as total, p.output_hash
    from nose.latest_parses l
    join nose.parses p on p.id = l.parse_id`;

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const byId = (a, b) => Number(a) - Number(b);

function parseArgs(argv) {
  const opts = { limit: DEFAULT_LIMIT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit' && /^[1-9]\d{0,5}$/.test(argv[i + 1] || '')) opts.limit = Number(argv[++i]);
    else throw new UsageError(`unknown: ${a}${a === '--limit' ? ' (give a number)' : ''}\n${USAGE}`);
  }
  return opts;
}

/* Documents joined by any text they share: one group per report. A document
   extracted again after an extractor change holds two texts, and a copy of it
   may share either one, so groups are connected, not just keyed. */
function groupByText(documentIds, texts) {
  const parent = new Map(documentIds.map(id => [id, id]));
  const find = id => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(id) !== r) { const next = parent.get(id); parent.set(id, r); id = next; }
    return r;
  };
  const firstWithText = new Map();
  for (const t of texts) {
    if (!parent.has(t.id)) continue;
    const seen = firstWithText.get(t.text_sha256);
    if (seen === undefined) { firstWithText.set(t.text_sha256, t.id); continue; }
    const a = find(seen);
    const b = find(t.id);
    if (a !== b) parent.set(Number(a) < Number(b) ? b : a, Number(a) < Number(b) ? a : b);
  }
  const groups = new Map();
  for (const id of documentIds) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }
  return [...groups.values()].map(g => g.sort(byId)).sort((a, b) => byId(a[0], b[0]));
}

/* The work itself, with the connection (and, optionally, the PDF store) passed
 * in, so test/duplicates-test.js can drive it on PGlite. */
async function duplicates({ db, blobs = null, limit = DEFAULT_LIMIT, log = console.log }) {
  const docs = (await db.query(DOCUMENTS_SQL)).rows;
  const texts = (await db.query(TEXTS_SQL)).rows;
  const readings = new Map((await db.query(READINGS_SQL)).rows.map(r => [r.id, r]));
  const doc = new Map(docs.map(d => [d.id, d]));

  const groups = groupByText(docs.map(d => d.id), texts);
  const reports = groups.length;
  const repeated = groups.filter(g => g.length > 1);
  const copies = repeated.flatMap(g => g.slice(1)).sort(byId);
  const groupOf = new Map(groups.flatMap((g, i) => g.map(id => [id, i])));

  /* Same laboratory, same lab ID, more than one document. */
  const byLabId = new Map();
  for (const [id, r] of readings) {
    if (typeof r.lab_id !== 'string' || !r.lab_id.trim()) continue;
    const key = `${r.lab || ''}\u0000${r.lab_id}`;
    if (!byLabId.has(key)) byLabId.set(key, []);
    byLabId.get(key).push(id);
  }
  const shared = [...byLabId.values()].filter(ids => ids.length > 1).map(ids => ids.sort(byId))
    .sort((a, b) => byId(a[0], b[0]));

  const name = id => {
    const r = readings.get(id) || {};
    return `${r.lab || '(no lab)'} | ${r.strain || '(no strain)'}${r.lab_id ? ` | lab ID ${r.lab_id}` : ''}`;
  };
  const docLine = (id, mark) => {
    const d = doc.get(id);
    const how = d.first_context || 'no parse';
    return `    #${String(id).padEnd(6)}${d.day}  ${how.padEnd(10)}  ${rerun.short(d.sha256)}  ${String(d.byte_size).padStart(8)} bytes` +
           (mark ? `  ${mark}` : '');
  };

  log(`duplicates: ${plural(docs.length, 'document')} hold ${plural(reports, 'distinct report')} by text - ` +
      `${plural(copies.length, 'document is a copy', 'documents are copies')} of an earlier one`);

  log('');
  if (!repeated.length) {
    log('Same text, more than one document: none.');
  } else {
    log(`Same text, more than one document (${plural(repeated.length, 'report')}) - the first one stored is the report, the rest are copies:`);
    for (const g of repeated.slice(0, limit)) {
      const hashes = new Set(g.map(id => (readings.get(id) || {}).output_hash));
      log('');
      log(`  ${name(g[0])}   ${plural(g.length, 'document')}, ` +
          `${hashes.size === 1 ? 'one reading' : `${hashes.size} different readings - not all read by today's parser? run reparse.js`}`);
      g.forEach((id, i) => log(docLine(id, i === 0 ? 'first' : 'copy')));
    }
    if (repeated.length > limit) { log(''); log(`  ... and ${repeated.length - limit} more - add --limit ${repeated.length}`); }
  }

  log('');
  if (!shared.length) {
    log('Same lab and lab ID, more than one document: none.');
  } else {
    log(`Same lab and lab ID, more than one document (${plural(shared.length, 'lab ID')}):`);
    for (const ids of shared.slice(0, limit)) {
      const r = readings.get(ids[0]);
      /* Each text a letter, in the order the documents arrived. */
      const letter = new Map();
      for (const id of ids) if (!letter.has(groupOf.get(id))) letter.set(groupOf.get(id), String.fromCharCode(65 + letter.size));
      log('');
      if (letter.size === 1) {
        log(`  ${r.lab || '(no lab)'}  ${r.lab_id}   ${plural(ids.length, 'document')}, one text - the copies above`);
      } else {
        log(`  ${r.lab || '(no lab)'}  ${r.lab_id}   ${plural(ids.length, 'document')}, ${letter.size} different texts - ` +
            'an amended report, a re-render that changed its text, or one ID on two reports: compare the PDFs');
        for (const id of ids) {
          const x = readings.get(id);
          const verdict = x.usable === true ? 'usable' : x.usable === false ? 'refused' : '-';
          log(`${docLine(id, `text ${letter.get(groupOf.get(id))}`)}  ${verdict}  total ${x.total == null ? '-' : `${x.total}%`}`);
        }
      }
    }
    if (shared.length > limit) { log(''); log(`  ... and ${shared.length - limit} more - add --limit ${shared.length}`); }
  }

  /* What the copies hold, and where. */
  const perLab = new Map();
  for (const id of copies) {
    const lab = (readings.get(id) || {}).lab || '(no lab)';
    perLab.set(lab, (perLab.get(lab) || 0) + 1);
  }
  const held = copies.reduce((t, id) => ({ extractions: t.extractions + doc.get(id).extractions, parses: t.parses + doc.get(id).parses }),
                             { extractions: 0, parses: 0 });
  /* The PDF count is a courtesy: Blobs refusing (an expired token, say) must
     not take the database's answer away with it. */
  let pdfs = null;
  let pdfsUnchecked = 'not checked (needs NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN)';
  if (blobs) {
    try {
      const keys = new Set(await require(path.join(rerun.LIB, 'pdf-store.js')).keys(blobs));
      pdfs = copies.filter(id => keys.has(doc.get(id).sha256)).length;
    } catch (e) {
      pdfsUnchecked = `could not be checked - ${rerun.explain(e)}`;
    }
  }

  log('');
  if (copies.length) {
    log('Copies by lab:');
    for (const [lab, n] of [...perLab.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
      log(`  ${lab.padEnd(28)}${n}`);
    }
    log(`What the copies hold: ${plural(copies.length, 'document')}, ${plural(held.extractions, 'extraction')}, ` +
        `${plural(held.parses, 'parse')} - and ${pdfs === null ? `their PDFs in Blobs: ${pdfsUnchecked}`
          : `${pdfs} of ${copies.length} with a PDF in Blobs`}`);
  }
  log(`duplicates already stored: ${plural(copies.length, 'document')}`);
  return { documents: docs.length, reports, copies, repeated, shared, held, pdfs, perLab: Object.fromEntries(perLab) };
}

async function main(argv = process.argv.slice(2)) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const missing = rerun.missingSecrets(['NOSE_DB_URL'], process.env);
  if (missing) {
    console.error(`REFUSED: ${missing}`);
    process.exit(1);
  }
  let db = null;
  try {
    const blobs = process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN ? rerun.openBlobs() : null;
    db = rerun.openDb();
    await rerun.connectAsWriter(db);
    await duplicates({ db, blobs, ...opts });
  } catch (e) {
    console.error(`duplicates failed: ${rerun.explain(e)}`);
    process.exitCode = 1;
  } finally {
    if (db) await db.end().catch(() => {});
  }
}

module.exports = { duplicates, groupByText, parseArgs, DOCUMENTS_SQL, TEXTS_SQL, READINGS_SQL, USAGE, UsageError };
if (require.main === module) {
  main().catch(e => { console.error('duplicates failed:', e && e.message); process.exit(1); });
}

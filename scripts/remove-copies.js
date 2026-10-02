#!/usr/bin/env node
'use strict';
/* Remove duplicate copies of stored reports: an admin cleanup, run by hand.
 *
 *   node scripts/remove-copies.js            what would be removed; changes nothing
 *   node scripts/remove-copies.js --apply    remove it
 *
 * Until 2026-10-02 a report whose portal builds the PDF at the moment of
 * download (Method Testing Labs') was kept as a new document on every scan
 * (PARSER-HANDOFF s13, "One report, many documents"). save_scan no longer
 * does that. This removes the copies kept before it changed - on the real
 * archive, one: document #449, the second scan of the probe's jar.
 *
 * A COPY is a document that shares an extracted text with an EARLIER
 * document - the same documents scripts/duplicates.js counts. It is removed
 * only when EVERY text it holds an earlier document also holds, so removing
 * it loses no text, no reading and no report. The earlier document is the
 * report and is never touched. Each
 * copy is removed whole:
 *
 *   1. its PDF in Netlify Blobs, if there is one - first, so a failure leaves
 *      a document with no PDF, which archive-health.js lists and a second run
 *      removes, rather than a PDF with no document
 *   2. its parses, extractions and document row, in one transaction
 *
 * A copy is KEPT, and says why, when:
 *   - it holds a text no earlier document holds (extracted again since)
 *   - its report has no PDF in Blobs while the copy has one: the copy's PDF
 *     is then the only file of that report
 *   - a reparse run names it as the last document it walked
 *     (nose.reparse_runs.last_document_id): that record is append-only
 *
 * The archive is append-only for nose_writer, the role the site and every
 * other script use; this is the one script that deletes, and it refuses to
 * run as anything but an admin role. It removes copies only - never a
 * report. Prints no report text, no address, no secret: ids, days, short
 * fingerprints, lab, strain and lab ID.
 *
 * Needs NOSE_DB_ADMIN_URL (the Session pooler string), NETLIFY_SITE_ID and
 * NETLIFY_AUTH_TOKEN. Run node scripts/duplicates.js before and after.
 */

const path = require('path');
const rerun = require('./lib/rerun');

const { LIB } = rerun;
const USAGE = 'usage: node scripts/remove-copies.js [--apply]';
const SECRETS = ['NOSE_DB_ADMIN_URL', 'NETLIFY_SITE_ID', 'NETLIFY_AUTH_TOKEN'];

/* Every document with each extraction's text fingerprint, the report it
   copies (the earliest other document holding that text), and whether a
   reparse run names it. No text and no address is selected. */
const CANDIDATES_SQL = `
  with texts as (
    select e.document_id, e.text_sha256,
           (select min(o.document_id) from nose.extractions o
             where o.text_sha256 = e.text_sha256 and o.document_id < e.document_id) as earlier
      from nose.extractions e
  ), copies as (
    select document_id, min(earlier) as report, bool_and(earlier is not null) as all_held
      from texts
     group by document_id
    having bool_or(earlier is not null)
  )
  select d.id::text as id, d.sha256, d.first_fetched_on::text as day, c.report::text as report, c.all_held,
         r.sha256 as report_sha256,
         l.lab, l.strain, l.lab_id,
         (select count(*) from nose.extractions x where x.document_id = d.id)::int as extractions,
         (select count(*) from nose.extractions x join nose.parses p on p.extraction_id = x.id
           where x.document_id = d.id)::int as parses,
         exists (select 1 from nose.reparse_runs u where u.last_document_id = d.id) as named_by_run
    from copies c
    join nose.documents d on d.id = c.document_id
    join nose.documents r on r.id = c.report
    left join nose.latest_parses l on l.document_id = d.id
   order by d.id`;

const DELETE_SQL = [
  `delete from nose.parses where extraction_id in (select id from nose.extractions where document_id = $1::bigint)`,
  `delete from nose.extractions where document_id = $1::bigint`,
  `delete from nose.documents where id = $1::bigint`
];

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

async function removeCopies({ db, blobs, apply = false, log = console.log }) {
  const pdfStore = require(path.join(LIB, 'pdf-store.js'));
  const { reason } = require(path.join(LIB, 'archive.js'));

  const who = (await db.query('select current_user as u')).rows[0].u;
  if (who === 'nose_writer') {
    throw new Error('connected as nose_writer, which can only read and insert - this needs NOSE_DB_ADMIN_URL, the admin connection');
  }

  const candidates = (await db.query(CANDIDATES_SQL)).rows;
  const inBlobs = new Set(await pdfStore.keys(blobs));
  const counts = { candidates: candidates.length, removed: 0, kept: 0, failed: 0, pdfs: 0 };

  log(`remove-copies${apply ? ' --apply' : ' (dry run)'}: ${plural(candidates.length, 'copy', 'copies')} of a stored report, ` +
      `connected as ${who}`);

  for (const c of candidates) {
    const what = `document #${c.id}  ${c.day}  ${rerun.short(c.sha256)}  ${c.lab || '(no lab)'} | ${c.strain || '(no strain)'}` +
                 `${c.lab_id ? ` | lab ID ${c.lab_id}` : ''}  - a copy of document #${c.report}`;
    const hasPdf = inBlobs.has(c.sha256);
    const holds = `${plural(c.extractions, 'extraction')}, ${plural(c.parses, 'parse')}, ${hasPdf ? 'its PDF' : 'no PDF'}`;
    log('');
    if (!c.all_held) {
      counts.kept++;
      log(`keep    ${what}`);
      log('        it also holds a text no earlier document holds (it was extracted again), and removing it would lose that text');
      continue;
    }
    if (c.named_by_run) {
      counts.kept++;
      log(`keep    ${what}`);
      log('        a reparse run names it as the last document it walked, and that record is append-only');
      continue;
    }
    if (hasPdf && !inBlobs.has(c.report_sha256)) {
      counts.kept++;
      log(`keep    ${what}`);
      log(`        its report has no PDF in Blobs, so this copy's PDF is the only file of it`);
      continue;
    }
    if (!apply) {
      counts.removed++;
      if (hasPdf) counts.pdfs++;
      log(`would remove  ${what}`);
      log(`        ${holds}`);
      continue;
    }
    try {
      if (hasPdf) await pdfStore.remove(blobs, c.sha256);
    } catch (e) {
      counts.failed++;
      log(`FAIL    ${what}`);
      log(`        its PDF could not be deleted (${rerun.explain(e)}) - nothing in the database was touched`);
      continue;
    }
    try {
      await db.query('begin');
      for (const sql of DELETE_SQL) await db.query(sql, [c.id]);
      await db.query('commit');
    } catch (e) {
      await db.query('rollback').catch(() => {});
      counts.failed++;
      log(`FAIL    ${what}`);
      log(`        ${hasPdf ? 'its PDF was deleted, but ' : ''}its rows were not (${reason(e)}) - run this again to finish`);
      continue;
    }
    counts.removed++;
    if (hasPdf) counts.pdfs++;
    log(`removed ${what}`);
    log(`        ${holds}`);
  }

  log('');
  if (!apply) log('dry run - nothing was changed; --apply removes it');
  log(`${plural(counts.candidates, 'copy', 'copies')}: ${counts.removed} ${apply ? 'removed' : 'would be removed'} ` +
      `(${plural(counts.pdfs, 'PDF')}), ${counts.kept} kept, ${counts.failed} failed`);
  return counts;
}

async function main(argv = process.argv.slice(2)) {
  const bad = argv.filter(a => a !== '--apply');
  if (bad.length) {
    console.error(`unknown: ${bad.join(' ')}\n${USAGE}`);
    process.exit(2);
  }
  const missing = rerun.missingSecrets(SECRETS, process.env);
  if (missing) {
    console.error(`REFUSED: ${missing}`);
    process.exit(1);
  }
  const { Client } = require('pg');
  const { clientConfig } = require(path.join(LIB, 'store.js'));
  let db = null;
  try {
    const blobs = rerun.openBlobs();
    db = new Client(clientConfig(process.env.NOSE_DB_ADMIN_URL, { name: 'NOSE_DB_ADMIN_URL', timeoutMs: 10000, queryTimeoutMs: 60000 }));
    db.on('error', () => {});
    await db.connect();
    const counts = await removeCopies({ db, blobs, apply: argv.includes('--apply') });
    if (counts.failed) process.exitCode = 1;
  } catch (e) {
    console.error(`remove-copies stopped: ${rerun.explain(e)}`);
    process.exitCode = 1;
  } finally {
    if (db) await db.end().catch(() => {});
  }
}

module.exports = { removeCopies, CANDIDATES_SQL, DELETE_SQL, USAGE };
if (require.main === module) {
  main().catch(e => { console.error('remove-copies failed:', e && e.message); process.exit(1); });
}

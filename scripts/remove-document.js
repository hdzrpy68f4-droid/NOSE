#!/usr/bin/env node
'use strict';
/* Take one stored report back out of the archive: run by hand, admin only.
 *
 *   node scripts/remove-document.js <fingerprint> --reason <why>          what would go; changes nothing
 *   node scripts/remove-document.js <fingerprint> --reason <why> --yes    remove it
 *
 *   <fingerprint>  the document's file fingerprint, or the fingerprint of a
 *                  text read from it: all 64 characters, or the first 8 or
 *                  more, as the archive scripts print them. A PDF in Blobs
 *                  with no document row can be named by its own.
 *   <why>          one word, from a fixed list - nose.removals refuses any
 *                  other, so nothing about a person fits:
 *                    request    someone asked for it to be taken out
 *                    personal   it carries something about a person
 *                    notreport  it is not a lab report (kept under the looser
 *                               rule before two signs were required)
 *                    legal      a legal demand
 *                  Not needed to finish a removal already recorded.
 *
 * WHAT GOES: the document's parses, its extractions, its row and its PDF in
 * Netlify Blobs - and the same of any other document holding one of its
 * texts, which is another copy of the same report (PARSER-HANDOFF s13, "One
 * report, many documents"). Named by its own fingerprint, a PDF with no row -
 * from a scan made while the database was down - has its text read, so any
 * stored copy of that report goes with it.
 *
 * WHAT STAYS: one row in nose.removals - the UTC day and the word - and the
 * fingerprints in nose.withheld: the SHA-256 of each file and of each text.
 * save_scan checks them before anything else, so the same file, or another
 * download of the same report, is never kept again; the scan itself still
 * works. Nothing about who asked is recorded anywhere: there is no column for
 * it.
 *
 * DATABASE FIRST, as lib/archive.js: the removal, the withheld fingerprints
 * and the deletes are one transaction, and the PDFs are deleted only once it
 * has committed. A PDF that fails to delete is left behind withheld - no scan
 * and no backfill can make it a document again - and running the same
 * command again deletes it. (scripts/remove-copies.js deletes the PDF first
 * instead: a copy has no withheld fingerprint standing guard over a PDF left
 * behind.)
 *
 * The archive is append-only for nose_writer, the role the site and every
 * other script use; this script refuses to run as it. Prints no report text,
 * no address, no strain, no client and no full fingerprint: ids, days, short
 * fingerprints, labs and counts.
 *
 * Needs NOSE_DB_ADMIN_URL (the Session pooler string), NETLIFY_SITE_ID and
 * NETLIFY_AUTH_TOKEN; to name a PDF that has no document row, an
 * `npm install` too (its text is read with extract-text.js).
 */

const path = require('path');
const rerun = require('./lib/rerun');

const { LIB } = rerun;
const REASONS = ['request', 'personal', 'notreport', 'legal'];
const USAGE = `usage: node scripts/remove-document.js <fingerprint> [--reason ${REASONS.join('|')}] [--yes]`;
const SECRETS = ['NOSE_DB_ADMIN_URL', 'NETLIFY_SITE_ID', 'NETLIFY_AUTH_TOKEN'];
const MIN_PREFIX = 8;
const MAX_ROUNDS = 20;          // copies of copies: far more than any archive needs

class UsageError extends Error {}
class Refusal extends Error {}

function parseArgs(argv) {
  const opts = { fingerprint: null, reason: null, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--yes') {
      opts.yes = true;
    } else if (a === '--reason') {
      const r = argv[++i];
      if (!REASONS.includes(r)) throw new UsageError(`--reason must be one of: ${REASONS.join(', ')}\n${USAGE}`);
      opts.reason = r;
    } else if (a.startsWith('-')) {
      throw new UsageError(`unknown: ${a}\n${USAGE}`);
    } else if (opts.fingerprint) {
      throw new UsageError(`one fingerprint at a time\n${USAGE}`);
    } else {
      const f = a.toLowerCase();
      if (!/^[0-9a-f]+$/.test(f) || f.length < MIN_PREFIX || f.length > 64) {
        throw new UsageError(`a fingerprint is ${MIN_PREFIX} to 64 hex characters, as the archive scripts print them\n${USAGE}`);
      }
      opts.fingerprint = f;
    }
  }
  if (!opts.fingerprint) throw new UsageError(USAGE);
  return opts;
}

/* ------------------------------------------------------------------ reads */

const BY_FILE_SQL = 'select id::text as id, sha256 from nose.documents where starts_with(sha256, $1)';
const BY_TEXT_SQL = 'select distinct text_sha256 from nose.extractions where starts_with(text_sha256, $1)';
const TEXTS_OF_SQL = 'select distinct text_sha256 from nose.extractions where document_id = any($1::bigint[])';
const HOLDERS_SQL = 'select distinct document_id::text as id from nose.extractions where text_sha256 = any($1::text[])';
const HELD_LIKE_SQL = `
  select w.kind, w.sha256, w.removal_id::text as removal, r.removed_on::text as day, r.reason
    from nose.withheld w join nose.removals r on r.id = w.removal_id
   where starts_with(w.sha256, $1)`;
const HELD_SQL = `
  select w.kind, w.sha256, w.removal_id::text as removal, r.removed_on::text as day, r.reason
    from nose.withheld w join nose.removals r on r.id = w.removal_id
   where (w.kind = 'file' and w.sha256 = any($1::text[]))
      or (w.kind = 'text' and w.sha256 = any($2::text[]))
   order by w.removal_id`;
const FILES_OF_REMOVALS_SQL = `select sha256 from nose.withheld where kind = 'file' and removal_id = any($1::bigint[])`;
/* No text, no address, no strain, no client: what the dry run shows. */
const DOCS_SQL = `
  select d.id::text as id, d.sha256, d.first_fetched_on::text as day, l.lab, l.usable,
         (select count(*) from nose.extractions x where x.document_id = d.id)::int as extractions,
         (select count(*) from nose.extractions x join nose.parses p on p.extraction_id = x.id
           where x.document_id = d.id)::int as parses,
         exists (select 1 from nose.reparse_runs u where u.last_document_id = d.id) as named_by_run
    from nose.documents d
    left join nose.latest_parses l on l.document_id = d.id
   where d.id = any($1::bigint[])
   order by d.id`;

/* ----------------------------------------------------------------- writes */

const REMOVAL_SQL = 'insert into nose.removals (reason) values ($1) returning id::text as id, removed_on::text as day';
const WITHHOLD_SQL = 'insert into nose.withheld (kind, sha256, removal_id) values ($1, $2, $3::bigint) on conflict do nothing';
const DELETE_SQL = [
  'delete from nose.parses where extraction_id in (select id from nose.extractions where document_id = any($1::bigint[]))',
  'delete from nose.extractions where document_id = any($1::bigint[])',
  'delete from nose.documents where id = any($1::bigint[])'
];

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const reading = usable => (usable === true ? 'usable' : usable === false ? 'refused by the parser' : 'no reading');
const utcToday = () => new Date().toISOString().slice(0, 10);

async function removeDocument({ db, blobs, fingerprint, reason = null, yes = false, extract = null, log = console.log }) {
  const pdfStore = require(path.join(LIB, 'pdf-store.js'));
  const { reason: scrub } = require(path.join(LIB, 'archive.js'));
  const fp = String(fingerprint || '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(fp) || fp.length < MIN_PREFIX || fp.length > 64) {
    throw new UsageError(`a fingerprint is ${MIN_PREFIX} to 64 hex characters\n${USAGE}`);
  }
  if (reason !== null && !REASONS.includes(reason)) throw new UsageError(`--reason must be one of: ${REASONS.join(', ')}\n${USAGE}`);

  const who = (await db.query('select current_user as u')).rows[0].u;
  if (who === 'nose_writer') {
    throw new Refusal('connected as nose_writer, which can only read and insert - this needs NOSE_DB_ADMIN_URL, the admin connection');
  }
  const ready = (await db.query(
    `select to_regclass('nose.withheld') is not null and to_regclass('nose.removals') is not null as ok`)).rows[0].ok;
  if (ready !== true) {
    throw new Refusal('nose.removals and nose.withheld do not exist yet - push the migration first: ' +
                      'npx supabase db push --db-url "$NOSE_DB_ADMIN_URL"');
  }

  const inBlobs = new Set(await pdfStore.keys(blobs));
  const counts = { documents: 0, extractions: 0, parses: 0, pdfs: 0, withheldFiles: 0, withheldTexts: 0, removal: null, failed: 0 };
  log(`remove-document${yes ? ' --yes' : ' (dry run)'}: ${fp.slice(0, 8)}, connected as ${who}`);

  /* --- what the fingerprint names ------------------------------------------ */
  const byFile = (await db.query(BY_FILE_SQL, [fp])).rows;
  const byText = (await db.query(BY_TEXT_SQL, [fp])).rows.map(r => r.text_sha256);
  const named = new Set([...byFile.map(r => r.sha256), ...byText]);
  if (named.size > 1) {
    throw new Refusal(`${fp} begins more than one fingerprint (${[...named].map(h => h.slice(0, 12)).join(', ')}) - give more of it`);
  }
  let seedDocs = [];
  let seedTexts = [];
  let orphanKeys = [];
  if (named.size === 1) {
    const h = [...named][0];
    seedDocs = byFile.filter(r => r.sha256 === h).map(r => r.id);
    if (byText.includes(h)) seedTexts = [h];
  } else {
    const keys = [...inBlobs].filter(k => k.startsWith(fp));
    if (keys.length > 1) throw new Refusal(`${fp} begins more than one PDF in Blobs - give more of it`);
    if (keys.length === 1) {
      orphanKeys = keys;
    } else {
      /* Nothing stored has it: it may be a removal already made. */
      const held = (await db.query(HELD_LIKE_SQL, [fp])).rows;
      if (!held.length) throw new Refusal(`no document, text, PDF or withheld fingerprint begins with ${fp}`);
      const removals = [...new Set(held.map(r => r.removal))];
      const left = (await db.query(FILES_OF_REMOVALS_SQL, [removals])).rows.map(r => r.sha256).filter(k => inBlobs.has(k));
      for (const r of [...new Map(held.map(x => [x.removal, x])).values()]) {
        log(`already taken out: removal #${r.removal} on ${r.day}, ${r.reason} - its ${r.kind} fingerprint begins ${fp.slice(0, 8)}`);
      }
      if (!left.length) {
        log('nothing of it is left in the database or in Blobs - nothing to do');
        return counts;
      }
      orphanKeys = left;
    }
  }

  /* --- PDFs with no document row: their text, unless already withheld ------- */
  const orphans = [];
  for (const key of orphanKeys) {
    const o = { key, day: null, textSha: null, why: null, held: false };
    const already = (await db.query(HELD_SQL, [[key], []])).rows;
    if (already.length) {
      o.held = true;
    } else {
      try {
        const pdf = await pdfStore.read(blobs, key);
        if (!pdf) throw new Error('it was listed, but is gone');
        o.day = pdf.metadata.fetchedAt;
        const read = extract || require(path.join(LIB, 'extract-text.js')).extractCoaText;
        const got = await read(pdf.bytes);
        const text = typeof got === 'string' ? got : got && got.text;
        if (typeof text !== 'string' || !text) throw new Error('no text could be read from it');
        o.textSha = rerun.textSha(text);
      } catch (e) {
        o.why = scrub(e);
      }
    }
    orphans.push(o);
  }

  /* --- every document holding one of these texts: copies of one report ------ */
  const docIds = new Set(seedDocs);
  const texts = new Set(seedTexts);
  for (const o of orphans) if (o.textSha) texts.add(o.textSha);
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (docIds.size) for (const r of (await db.query(TEXTS_OF_SQL, [[...docIds]])).rows) texts.add(r.text_sha256);
    const more = texts.size
      ? (await db.query(HOLDERS_SQL, [[...texts]])).rows.map(r => r.id).filter(id => !docIds.has(id))
      : [];
    if (!more.length) break;
    for (const id of more) docIds.add(id);
  }
  const docs = docIds.size ? (await db.query(DOCS_SQL, [[...docIds]])).rows : [];

  /* --- what is withheld already, and what this adds ------------------------- */
  const files = [...new Set([...docs.map(d => d.sha256), ...orphans.map(o => o.key)])];
  const allTexts = [...texts];
  const held = (await db.query(HELD_SQL, [files, allTexts])).rows;
  const isHeld = (kind, h) => held.some(r => r.kind === kind && r.sha256 === h);
  const newFiles = files.filter(h => !isHeld('file', h));
  const newTexts = allTexts.filter(h => !isHeld('text', h));
  const earlier = held.length ? { id: held[0].removal, day: held[0].day, reason: held[0].reason } : null;
  const needsRemoval = !earlier && (newFiles.length + newTexts.length > 0);
  if (needsRemoval && !reason) {
    throw new UsageError(`say why it goes: --reason ${REASONS.join('|')}\n${USAGE}`);
  }
  const pdfKeys = [...docs.filter(d => inBlobs.has(d.sha256)).map(d => d.sha256), ...orphans.map(o => o.key)];

  /* --- the plan ------------------------------------------------------------- */
  const seeds = new Set(seedDocs);
  const via = seedDocs.length ? 'file' : seedTexts.length ? 'text' : 'pdf';
  if (via === 'text') log(`the text ${rerun.short(seedTexts[0])} is held by ${plural(docs.length, 'document')}`);
  for (const d of docs) {
    log('');
    log(`document #${d.id}  first fetched ${d.day}  ${rerun.short(d.sha256)}  ${d.lab || '(no lab)'}  ${reading(d.usable)}`);
    log(`          ${plural(d.extractions, 'extraction')}, ${plural(d.parses, 'parse')}, ${inBlobs.has(d.sha256) ? 'its PDF' : 'no PDF'}`);
    if (via === 'file' && !seeds.has(d.id)) log('          it holds one of the same texts: another copy of the same report, so it goes too');
    if (via === 'pdf') log('          it holds the text of the PDF named below: the same report, so it goes too');
    if (d.named_by_run) log('          a reparse run names it as the last document it walked; that record keeps the number');
  }
  for (const o of orphans) {
    log('');
    log(`PDF with no document row  ${rerun.short(o.key)}${o.day ? `  first fetched ${o.day}` : ''}`);
    if (o.held) log('          withheld already - left behind when its deletion failed, or by a scan made while the database was down');
    else if (o.textSha) log(`          its text ${rerun.short(o.textSha)}${docs.length ? ' - the documents above hold it' : ''}`);
    else log(`          its text could not be read (${o.why}) - only the file will be withheld`);
  }
  log('');
  const day = earlier ? earlier.day : utcToday();
  if (needsRemoval) log(`${yes ? 'recording' : 'would record'}: a removal on ${day} (UTC), reason ${reason}`);
  else if (earlier) log(`part of removal #${earlier.id} (${earlier.day}, ${earlier.reason}) - no new removal is recorded`);
  if (newFiles.length + newTexts.length) {
    log(`${yes ? 'withholding' : 'would withhold'}: ${plural(newFiles.length, 'file fingerprint')} and ` +
        `${plural(newTexts.length, 'text fingerprint')} - the same file, or any file with the same text, is not kept again`);
  }
  const ext = docs.reduce((n, d) => n + d.extractions, 0);
  const par = docs.reduce((n, d) => n + d.parses, 0);
  log(`${yes ? 'deleting' : 'would delete'}: ${plural(docs.length, 'document')} (${plural(ext, 'extraction')}, ${plural(par, 'parse')}) ` +
      `and ${plural(pdfKeys.length, 'PDF')}`);

  if (!yes) {
    log('dry run - nothing was changed; --yes removes it');
    return { ...counts, documents: docs.length, extractions: ext, parses: par, pdfs: pdfKeys.length,
             withheldFiles: newFiles.length, withheldTexts: newTexts.length };
  }

  /* --- the database, in one transaction ------------------------------------- */
  let removal = earlier;
  if (docs.length || newFiles.length || newTexts.length) {
    try {
      await db.query('begin');
      if (needsRemoval) removal = { ...(await db.query(REMOVAL_SQL, [reason])).rows[0], reason };
      for (const h of newFiles) await db.query(WITHHOLD_SQL, ['file', h, removal.id]);
      for (const h of newTexts) await db.query(WITHHOLD_SQL, ['text', h, removal.id]);
      if (docs.length) for (const sql of DELETE_SQL) await db.query(sql, [docs.map(d => d.id)]);
      await db.query('commit');
    } catch (e) {
      await db.query('rollback').catch(() => {});
      counts.failed++;
      log(`FAIL  the database refused (${scrub(e)}) - nothing was changed, in the database or in Blobs`);
      return counts;
    }
    Object.assign(counts, { documents: docs.length, extractions: ext, parses: par,
                            withheldFiles: newFiles.length, withheldTexts: newTexts.length });
  }
  counts.removal = removal && removal.id;
  if (needsRemoval) log(`removal #${removal.id} recorded: ${removal.day}, ${removal.reason}`);

  /* --- then the PDFs: the database has answered ------------------------------ */
  for (const key of pdfKeys) {
    try {
      await pdfStore.remove(blobs, key);
      counts.pdfs++;
      log(`deleted PDF ${rerun.short(key)}`);
    } catch (e) {
      counts.failed++;
      log(`FAIL  PDF ${rerun.short(key)} is still in Blobs (${rerun.explain(e)}) - it is withheld, so nothing can make it a ` +
          `document again; run the same command again to delete it`);
    }
  }
  log(`done: ${plural(counts.documents, 'document')} and ${plural(counts.pdfs, 'PDF')} removed, ${counts.failed} failed`);
  return counts;
}

async function main(argv = process.argv.slice(2)) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (e) {
    console.error(e.message);
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
    const counts = await removeDocument({ db, blobs, ...opts });
    if (counts.failed) process.exitCode = 1;
  } catch (e) {
    if (e instanceof UsageError) { console.error(e.message); process.exitCode = 2; }
    else if (e instanceof Refusal) { console.error(`REFUSED: ${e.message}`); process.exitCode = 1; }
    else { console.error(`remove-document stopped: ${rerun.explain(e)}`); process.exitCode = 1; }
  } finally {
    if (db) await db.end().catch(() => {});
  }
}

module.exports = { removeDocument, parseArgs, REASONS, USAGE, UsageError, Refusal, DELETE_SQL };
if (require.main === module) {
  main().catch(e => { console.error('remove-document failed:', e && e.message); process.exit(1); });
}

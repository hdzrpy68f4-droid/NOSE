#!/usr/bin/env node
'use strict';
/* The archive's health, both halves at once. Read-only.
 *
 *   node scripts/archive-health.js            PDF sizes from the database
 *   node scripts/archive-health.js --verify   also download every PDF and re-hash it
 *
 * Reports:
 *   - rows per table, and the newest parse in full (the day, never a time -
 *     the archive does not record times)
 *   - database size against the Supabase free plan's 500 MB
 *   - how many PDFs Netlify Blobs holds, and their total bytes
 *   - PDFs with no document row, and documents with no PDF
 *
 * Needs three Codespaces secrets:
 *   NOSE_DB_URL          the writer's connection string - only read with here
 *   NETLIFY_SITE_ID      the site's ID (Netlify calls it the Project ID)
 *   NETLIFY_AUTH_TOKEN   a Netlify personal access token WITH AN EXPIRY DATE
 *
 * Prints no report text, no addresses and no secrets: counts, sizes, days,
 * parse and document ids, and the first 12 characters of a file fingerprint.
 *
 * PDF sizes: a PDF's key IS the SHA-256 of its bytes and its document row
 * records how many bytes those were, so a PDF with a document row is counted
 * from the row. Only PDFs with no row are downloaded to be measured. --verify
 * downloads all of them and checks each against its key instead.
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify/functions/lib');
const { clientConfig } = require(path.join(LIB, 'store.js'));
const pdfStore = require(path.join(LIB, 'pdf-store.js'));
const { reason } = require(path.join(LIB, 'archive.js'));

const FREE_PLAN_BYTES = 500 * 1000 * 1000;   // decimal MB: never understates the share used
const MB = n => `${(n / 1e6).toFixed(1)} MB`;
const short = sha => `${String(sha).slice(0, 12)}...`;
const secretHelp = n => (n === 1 ? 'is not set - it is a Codespaces secret; add it' : 'are not set - they are Codespaces secrets; add them') +
  ', then restart the Codespace (PARSER-HANDOFF s13)';

/* Dates come back as text: pg would turn a date column into a JavaScript Date
 * at local midnight, which prints as the previous day west of Greenwich. */
const COUNTS_SQL = `
  select (select count(*) from nose.documents)::int   as documents,
         (select count(*) from nose.extractions)::int as extractions,
         (select count(*) from nose.parses)::int      as parses,
         pg_database_size(current_database())::text   as db_bytes,
         (select coalesce(sum(pg_total_relation_size(c.oid)), 0)
            from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'nose' and c.relkind in ('r', 'm'))::text as nose_bytes`;

const NEWEST_SQL = `
  select p.id, p.parsed_on::text as day, p.context, p.usable,
         coalesce(p.lab, '(no lab)') as lab, p.strain, p.client,
         coalesce(p.product_class, '-') as product_class,
         p.total_terpenes::text as total, p.output ->> 'reportDate' as report_date,
         p.parser_version, e.extractor_version, e.document_id,
         (select count(*) from nose.terpene_values v where v.parse_id = p.id)::int as terpenes
    from nose.parses p
    join nose.extractions e on e.id = p.extraction_id
   order by p.id desc
   limit 1`;

const DOCUMENTS_SQL = `
  select id, sha256, byte_size, first_fetched_on::text as day
    from nose.documents
   order by id`;

async function readDatabase() {
  const { Client } = require('pg');
  const c = new Client(clientConfig(process.env.NOSE_DB_URL, { timeoutMs: 8000, queryTimeoutMs: 20000 }));
  c.on('error', () => {});
  try {
    await c.connect();
    const counts = (await c.query(COUNTS_SQL)).rows[0];
    const newest = (await c.query(NEWEST_SQL)).rows[0] || null;
    const documents = (await c.query(DOCUMENTS_SQL)).rows;
    return { counts, newest, documents };
  } finally {
    await c.end().catch(() => {});
  }
}

/* A few at a time: enough to be quick, few enough not to trip rate limits. */
async function eachLimited(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/* The report, as lines. Pure, so test/archive-scripts-test.js can check it. */
function report({ db, dbError, blobKeys, blobError, measured = new Map(), verify = false }) {
  const lines = [];
  const attention = [];
  let failed = false;

  lines.push('database');
  if (dbError) {
    failed = true;
    lines.push(`  FAIL  ${dbError}`);
  } else {
    const n = db.counts;
    const dbBytes = Number(n.db_bytes);
    lines.push(`  documents      ${n.documents}`);
    lines.push(`  extractions    ${n.extractions}`);
    lines.push(`  parses         ${n.parses}`);
    lines.push(`  size           ${MB(dbBytes)} of the free plan's 500 MB ` +
               `(${(100 * dbBytes / FREE_PLAN_BYTES).toFixed(1)}%) - the archive's own tables are ${MB(Number(n.nose_bytes))} of it`);
    if (dbBytes > 0.8 * FREE_PLAN_BYTES) attention.push('the database is past 80% of the free plan');
    const p = db.newest;
    if (!p) {
      lines.push('  newest parse   none yet');
    } else {
      const verdict = p.usable === true ? 'usable' : p.usable === false ? 'refused' : '-';
      lines.push(`  newest parse   #${p.id}  ${p.day}  ${p.context}  (the archive keeps days, never times)`);
      lines.push(`                 ${p.lab} | ${p.strain || '(no strain)'} | ${p.product_class} | ${verdict}` +
                 ` | total ${p.total == null ? '-' : p.total + '%'} | ${p.terpenes} terpene values`);
      lines.push(`                 client ${p.client || '-'} | report date ${p.report_date || '-'} | document #${p.document_id}`);
      lines.push(`                 parser ${p.parser_version} | extractor ${p.extractor_version}`);
    }
  }

  lines.push('', `pdf copies (Netlify Blobs, store "${pdfStore.STORE_NAME}")`);
  if (blobError) {
    failed = true;
    lines.push(`  FAIL  ${blobError}`);
  } else {
    let total = 0;
    let unmeasured = 0;
    const byteSize = new Map((db ? db.documents : []).map(d => [d.sha256, Number(d.byte_size)]));
    for (const key of blobKeys) {
      const m = measured.get(key);
      if (m) total += m.bytes;
      else if (byteSize.has(key)) total += byteSize.get(key);
      else unmeasured++;
    }
    lines.push(`  files          ${blobKeys.length}`);
    lines.push(`  bytes          ${MB(total)}` +
               (verify ? '   (every file downloaded and measured)' : '   (from the database\'s byte counts; --verify downloads each file)') +
               (unmeasured ? `   ${unmeasured} could not be measured` : ''));
    if (unmeasured) attention.push(`${unmeasured} PDF(s) could not be measured`);
    for (const [key, m] of measured) {
      if (m.sha256 !== key) {
        failed = true;
        lines.push(`  FAIL  ${short(key)} holds bytes whose SHA-256 is ${short(m.sha256)} - the copy does not match its key`);
      } else if (byteSize.has(key) && byteSize.get(key) !== m.bytes) {
        failed = true;
        lines.push(`  FAIL  ${short(key)} is ${m.bytes} bytes; its document row says ${byteSize.get(key)}`);
      }
    }
  }

  if (!dbError && !blobError) {
    const keys = new Set(blobKeys);
    const docs = new Set(db.documents.map(d => d.sha256));
    const noRow = blobKeys.filter(k => !docs.has(k));
    const noBlob = db.documents.filter(d => !keys.has(d.sha256));
    lines.push('', 'cross-check');
    lines.push(`  PDFs with no document row      ${noRow.length}`);
    for (const k of noRow.slice(0, 10)) lines.push(`    ${short(k)}`);
    if (noRow.length > 10) lines.push(`    ...and ${noRow.length - 10} more`);
    if (noRow.length) {
      attention.push(`${noRow.length} PDF(s) with no document row - the database write failed while the PDF write worked; scanning the jar again adds the row`);
    }
    lines.push(`  documents with no PDF          ${noBlob.length}`);
    for (const d of noBlob.slice(0, 10)) lines.push(`    document #${d.id}  first fetched ${d.day}  ${short(d.sha256)}`);
    if (noBlob.length > 10) lines.push(`    ...and ${noBlob.length - 10} more`);
    if (noBlob.length) {
      attention.push(`${noBlob.length} document(s) with no PDF - either kept before PDFs were, or the PDF write failed; scanning the jar again stores the PDF`);
    }
  }

  lines.push('');
  for (const a of attention) lines.push(`note  ${a}`);
  if (failed) lines.push('archive-health: FAILED - see the FAIL lines above');
  else lines.push(attention.length ? `archive-health: ok, ${attention.length} note(s)` : 'archive-health: ok');
  return { lines, failed };
}

function explainBlobError(err) {
  const msg = reason(err);
  if (/\b(401|403)\b/.test(msg)) {
    return `Netlify refused the token (${msg}). It may have expired: make a new one and update NETLIFY_AUTH_TOKEN.`;
  }
  if (/\b404\b/.test(msg)) return `Netlify does not know that site (${msg}). Check NETLIFY_SITE_ID.`;
  return msg;
}

async function main() {
  const verify = process.argv.includes('--verify');
  const missing = ['NOSE_DB_URL', 'NETLIFY_SITE_ID', 'NETLIFY_AUTH_TOKEN'].filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`FAIL: ${missing.join(', ')} ${secretHelp(missing.length)}`);
    process.exit(1);
  }

  let db = null;
  let dbError = null;
  try { db = await readDatabase(); }
  catch (e) { dbError = `could not read the database: ${reason(e)}`; }

  let blobKeys = [];
  let blobError = null;
  const measured = new Map();
  try {
    const store = pdfStore.open({ siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN });
    blobKeys = await pdfStore.keys(store);
    const rows = new Set(db ? db.documents.map(d => d.sha256) : []);
    const toMeasure = verify ? blobKeys : blobKeys.filter(k => !rows.has(k));
    await eachLimited(toMeasure, 4, async key => {
      const m = await pdfStore.measure(store, key);
      if (m) measured.set(key, m);
    });
  } catch (e) {
    blobError = explainBlobError(e);
  }

  const { lines, failed } = report({ db, dbError, blobKeys, blobError, measured, verify });
  for (const line of lines) console.log(line);
  process.exit(failed ? 1 : 0);
}

module.exports = { report, COUNTS_SQL, NEWEST_SQL, DOCUMENTS_SQL, FREE_PLAN_BYTES };
if (require.main === module) {
  main().catch(e => { console.error('archive-health failed:', reason(e)); process.exit(1); });
}

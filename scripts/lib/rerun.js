'use strict';
/* NOSE - what the archive's Codespace scripts share.
 *
 *   stampsOrRefusal()   the stamp-or-refuse helper, first written for
 *                       seed-from-fixtures.js: a run that WRITES is stamped
 *                       from git and refuses while parse-coa.js or
 *                       extract-text.js has uncommitted changes
 *   openDb(), openBlobs()   the two halves of the archive, from a Codespace
 *   readRows()          a page of documents, each with its newest extraction
 *                       and that extraction's latest parse
 *   asStored(), sameReading(), classify(), describe()
 *                       what the database would keep, and how two readings
 *                       differ - the comparison nose.output_hash makes
 *
 * Used by seed-from-fixtures.js, reparse.js, backfill-from-blobs.js and
 * export-candidate.js. Never bundled into a function: /scripts/ is not
 * published (_redirects), and nothing under netlify/ requires this file.
 *
 * Nothing here prints report text, addresses or secrets.
 */

const crypto = require('crypto');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const LIB = path.join(ROOT, 'netlify/functions/lib');
const version = require(path.join(LIB, 'version.js'));

/* The code a stored reading depends on. coa-dates.js writes the parser's
   harvestOn / reportOn, so an uncommitted change there is a parser change. */
const STAMPED_FILES = ['netlify/functions/lib/parse-coa.js', 'netlify/functions/lib/coa-dates.js',
                       'netlify/functions/lib/extract-text.js'];
const SECRETS = ['NOSE_DB_URL', 'NETLIFY_SITE_ID', 'NETLIFY_AUTH_TOKEN'];
const MIN_TEXT = 200;          // coa.js refuses a PDF with less text than this, before parsing
const PAGE_SIZE = 100;
const MOVE = 0.001;            // a terpene that moves more than this is printed
const VERSION_KEYS = ['parserVersion', 'extractorVersion'];   // nose.output_hash ignores these

/* ------------------------------------------------------ stamp, or refuse */

function missingSecrets(needs, env) {
  const missing = needs.filter(k => !env[k]);
  if (!missing.length) return null;
  return `${missing.join(', ')} ${missing.length === 1
    ? 'is not set - it is a Codespaces secret; add it'
    : 'are not set - they are Codespaces secrets; add them'}, then restart the Codespace`;
}

/* Decide the stamps, or refuse.
 *   needs      the secrets this script reads
 *   write      false for a dry run: it stores nothing, so it may run on
 *              uncommitted code - which is what a dry run is for
 *   extractor  false when nothing is extracted, so unpdf is not required
 * Returns { stamps: { parserVersion, extractorVersion, unpdf, dirty } } or
 * { refusal }. `dirty` lists the stamped files with uncommitted changes. */
function stampsOrRefusal({ root = ROOT, env = process.env, needs = SECRETS, write = true, extractor = true } = {}) {
  const missing = missingSecrets(needs, env);
  if (missing) return { refusal: missing };
  let dirty;
  try { dirty = version.uncommitted(STAMPED_FILES, root); }
  catch {
    if (write) return { refusal: 'git could not say whether the parser or extractor has uncommitted changes' };
    dirty = ['(git could not tell)'];
  }
  if (write && dirty.length) {
    return { refusal: `uncommitted changes in ${dirty.join(', ')} - commit them first, so the stamp names the code that ran` };
  }
  const v = version.fromCheckout(root);
  if (write && v.parserVersion === 'dev') return { refusal: 'git could not name the commit' };
  if (extractor && v.extractorVersion === 'dev') return { refusal: 'unpdf is not installed - run: npm install' };
  return { stamps: { ...v, dirty } };
}

/* ------------------------------------------------------------ connections */

/* One client for a whole run, verified TLS, as store.js configures it. The
 * caller connects and ends it. */
function openDb(env = process.env) {
  const { Client } = require('pg');
  const { clientConfig } = require(path.join(LIB, 'store.js'));
  const c = new Client(clientConfig(env.NOSE_DB_URL, { timeoutMs: 10000, queryTimeoutMs: 60000 }));
  /* A client that loses its socket while nobody is waiting emits 'error', and
     an unheard one crashes the process. The next query reports it instead. */
  c.on('error', () => {});
  return c;
}

/* Connect, and make sure it is as nose_writer - the role that can only read
 * and insert. A NOSE_DB_URL pointing at any other role is refused before
 * anything is read. */
async function connectAsWriter(db) {
  await db.connect();
  const who = (await db.query('select current_user as u')).rows[0].u;
  if (who !== 'nose_writer') {
    throw new Error(`NOSE_DB_URL connects as "${who}", not nose_writer - these scripts use only the writer, which can read and insert and nothing else`);
  }
}

function openBlobs(env = process.env) {
  return require(path.join(LIB, 'pdf-store.js')).open({ siteID: env.NETLIFY_SITE_ID, token: env.NETLIFY_AUTH_TOKEN });
}

/* An error that stopped a run, safe to print - archive.reason() scrubs
   fingerprints, addresses, hosts and IPs - with Netlify's refusals explained,
   as archive-health.js explains them. */
function explain(err) {
  const { reason } = require(path.join(LIB, 'archive.js'));
  const msg = reason(err);
  if (/\b(401|403)\b/.test(msg)) {
    return `Netlify refused the token (${msg}). It may have expired: make a new one and update NETLIFY_AUTH_TOKEN.`;
  }
  if (/\b404\b/.test(msg)) return `Netlify does not know that site (${msg}). Check NETLIFY_SITE_ID.`;
  return msg;
}

/* ----------------------------------------------------------------- reads */

/* Each document with its NEWEST extraction and that extraction's LATEST parse
 * - the reading the archive currently stands by. Ids come back as text so
 * that pg, PGlite and JavaScript agree on them. A document with no extraction
 * or no parse still comes back, with nulls, so it is counted rather than
 * skipped. */
const ROWS_SQL = `
  select d.id::text as id, d.sha256, d.byte_size, d.first_fetched_on::text as first_fetched_on,
         e.id::text as extraction_id, e.extractor_version, e.text, e.text_sha256,
         p.id::text as parse_id, p.parser_version, p.context, p.output
    from nose.documents d
    left join lateral (
          select x.id, x.extractor_version, x.text, x.text_sha256
            from nose.extractions x
           where x.document_id = d.id
           order by x.id desc
           limit 1) e on true
    left join lateral (
          select y.id, y.parser_version, y.context, y.output
            from nose.parses y
           where y.extraction_id = e.id
           order by y.id desc
           limit 1) p on true`;

async function readRows(db, { after = '0', limit = PAGE_SIZE } = {}) {
  return (await db.query(`${ROWS_SQL}
   where d.id > $1::bigint
   order by d.id
   limit $2::int`, [String(after), limit])).rows;
}

async function readRow(db, documentId) {
  return (await db.query(`${ROWS_SQL}
   where d.id = $1::bigint`, [String(documentId)])).rows[0] || null;
}

/* ------------------------------------------------------ comparing readings */

/* What the database would keep of an output: store.js's own cleaning (no NUL,
   no lone surrogate), then JSON - which drops undefined and turns NaN into
   null exactly as the write does. */
function asStored(output) {
  const { _clean } = require(path.join(LIB, 'store.js'));
  const s = JSON.stringify(_clean(output));
  return s === undefined ? null : JSON.parse(s);
}

/* The text the database would keep, and its fingerprint - nose.text_hash is
   the SHA-256 of the same UTF-8 bytes. */
function asStoredText(text) {
  const { _clean } = require(path.join(LIB, 'store.js'));
  return _clean(String(text));
}
const textSha = text => crypto.createHash('sha256').update(asStoredText(text), 'utf8').digest('hex');

/* Key order does not matter, at any depth - as with jsonb. */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}

/* A reading is the output without its version stamps: a new commit alone is
   not a new reading. */
function reading(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return output ?? null;
  const o = { ...output };
  for (const k of VERSION_KEYS) delete o[k];
  return o;
}

const sameReading = (before, after) => canonical(reading(before)) === canonical(reading(after));

const OUTCOMES = ['unchanged', 'values changed', 'accepted→rejected', 'rejected→accepted'];

function classify(before, after) {
  if (sameReading(before, after)) return 'unchanged';
  const b = before && before.usable;
  const a = after && after.usable;
  if (b === true && a === false) return 'accepted→rejected';
  if (b === false && a === true) return 'rejected→accepted';
  return 'values changed';
}

/* ------------------------------------------------------------- printing */

const short = sha => String(sha || '').slice(0, 8).padEnd(8);
const shown = v => (v === undefined || v === null ? '-' : typeof v === 'string' ? v : JSON.stringify(v));
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
/* Rounded to 1e-9 so a move of exactly 0.001 is not "more than 0.001" through
   float noise: the parser rounds every value to six places. */
const movedBy = (a, b) => Math.round(Math.abs(num(a) - num(b)) * 1e9) / 1e9;

function labStrain(before, after) {
  const pick = k => (after && after[k]) || (before && before[k]) || null;
  return `${pick('lab') || '(no lab)'} | ${pick('strain') || '(no strain)'}`;
}

/* The lines for one document whose reading changed: short sha, lab and
   strain; usable, readBy and totalTerpenes before -> after; every terpene
   that moved more than 0.001, largest first; and the names of anything else
   that changed, so no line of the report is a mystery. */
function describe(sha, before, after) {
  const b = before || {};
  const a = after || {};
  const lines = [`${short(sha)}  ${labStrain(before, after)}`];
  const pair = (label, k) => `${label} ${shown(b[k])} → ${shown(a[k])}`;
  lines.push(`          ${[pair('usable', 'usable'), pair('readBy', 'readBy'), pair('totalTerpenes', 'totalTerpenes')].join('   ')}`);

  const bt = b.terps && typeof b.terps === 'object' ? b.terps : {};
  const at = a.terps && typeof a.terps === 'object' ? a.terps : {};
  const moves = [...new Set([...Object.keys(bt), ...Object.keys(at)])]
    .map(k => ({ k, by: movedBy(bt[k], at[k]) }))
    .filter(m => m.by > MOVE)
    .sort((x, y) => y.by - x.by || x.k.localeCompare(y.k))
    .map(m => `${m.k} ${shown(bt[m.k])} → ${shown(at[m.k])}`);
  for (let i = 0; i < moves.length; i += 4) lines.push(`          ${moves.slice(i, i + 4).join('   ')}`);

  /* A field one reading has and the other lacks is a change even when its
     value is null - the first parses in the archive predate reportDate and
     client, and a reparse adds them - so it is named as new or gone. */
  const skip = new Set([...VERSION_KEYS, 'usable', 'readBy', 'totalTerpenes', 'terps']);
  const also = [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter(k => !skip.has(k) && ((k in b) !== (k in a) || canonical(b[k]) !== canonical(a[k])))
    .sort()
    .map(k => (!(k in b) ? `${k} (new)` : !(k in a) ? `${k} (gone)` : k));
  if (!moves.length && canonical(bt) !== canonical(at)) also.push('terpenes (none moved more than 0.001)');
  if (also.length) lines.push(`          also changed: ${also.join(', ')}`);
  return lines;
}

module.exports = {
  ROOT, LIB, STAMPED_FILES, SECRETS, MIN_TEXT, PAGE_SIZE, MOVE, OUTCOMES,
  missingSecrets, stampsOrRefusal, openDb, connectAsWriter, openBlobs, explain,
  readRows, readRow, asStored, asStoredText, textSha,
  canonical, reading, sameReading, classify, describe, short, labStrain
};

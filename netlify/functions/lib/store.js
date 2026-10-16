'use strict';
/* NOSE - the archive's one write path, from JavaScript.
 *
 * saveScan(payload, { client }) makes a single call to nose.save_scan() and
 * returns what it reports. Every rule - dedupe, append-only, the person guard,
 * derived columns, both hashes - lives in the database (supabase/migrations).
 * This module only gets the payload there intact, over a verified connection.
 *
 * With no client: a fresh pg Client per call - connect, one query, end - and
 * the whole exchange bounded by timeoutMs (withClient, lib/db.js, shared with
 * the dispensary store since 2026-10-16). A function instance serves one request
 * at a time and Supabase's pooler is the real pool, so holding sockets open
 * buys nothing. Scripts may pass one client for a whole run;
 * test/store-test.js passes PGlite through the same seam, which is why
 * nothing here uses more than client.query(text, params).
 *
 * clientConfig() is lib/db.js's, re-exported here, where the Codespace
 * scripts have always taken it from.
 *
 * touch() is the keep-awake read: one cheap query as nose_writer, so the free
 * Supabase project sees activity and is not paused.
 *
 * Never a query `name`: named queries are prepared statements, which the
 * transaction pooler cannot run.
 *
 * The payload travels as a bind parameter. Postgres does not write bind
 * parameters to its error log by default; inlining the payload into the SQL
 * text would put the whole report in the log on any failure.
 */

const db = require('./db');

/* Keep identical to the list in nose.holds_no_person(). test/store-test.js
 * proves the database refuses every key named here. */
const PERSONAL_KEYS = [
  'userid', 'user_id', 'email', 'email_address', 'emailaddress',
  'ip', 'ipaddress', 'ip_address', 'deviceid', 'device_id',
  'useragent', 'user_agent', 'sessionid', 'session_id',
  'accountid', 'account_id', 'palate', 'phone'
];

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/* Postgres rejects \u0000 in text and in jsonb, and PARSER-HANDOFF s11 shows
 * extraction can emit it. A lone UTF-16 surrogate is rejected by jsonb too.
 * Either would fail the whole write, so both are removed before anything is
 * serialised - recursively, keys included. */
function clean(value) {
  if (typeof value === 'string') {
    const s = value.replace(/\u0000/g, '');
    return typeof s.toWellFormed === 'function' ? s.toWellFormed() : s.replace(LONE_SURROGATE, '�');
  }
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[clean(k)] = clean(v);
    return out;
  }
  return value;
}

/* Returns the first key, at any depth, that names a person - or null. */
function findPersonalKey(value) {
  if (Array.isArray(value)) {
    for (const v of value) { const k = findPersonalKey(v); if (k) return k; }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (PERSONAL_KEYS.includes(k.toLowerCase())) return k;
      const nested = findPersonalKey(v);
      if (nested) return nested;
    }
  }
  return null;
}

/* Only these keys ever leave this module. Anything else a caller attaches -
 * an outputHash, or by accident a request header - is dropped here rather
 * than trusted. The database computes the output hash itself. */
function buildPayload(p) {
  if (!p || typeof p !== 'object') throw new TypeError('saveScan: a payload object is required');
  const output = clean(p.output);
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw new TypeError('saveScan: payload.output must be an object');
  }
  const personal = findPersonalKey(output);
  if (personal) {
    /* The key name only, never its value. */
    throw new Error(`saveScan: refusing to store "${personal}" - the archive holds nothing that identifies a person`);
  }
  return {
    sha256: p.sha256,
    byteSize: p.byteSize,
    sourceUrl: p.sourceUrl ?? null,
    fetchedAt: p.fetchedAt ?? null,
    extractorVersion: p.extractorVersion,
    text: clean(p.text),
    parserVersion: p.parserVersion,
    context: p.context,
    output
  };
}

function unwrap(res) {
  const r = res && res.rows && res.rows[0] && res.rows[0].result;
  if (r == null) throw new Error('saveScan: save_scan returned nothing');
  return typeof r === 'string' ? JSON.parse(r) : r;
}

/* The archive's database: NOSE_DB_URL, as nose_writer. */
const URL_ENV = 'NOSE_DB_URL';

const SAVE_SQL = 'select nose.save_scan($1::jsonb) as result';

async function saveScan(payload, { client, timeoutMs = 4000, _Client } = {}) {
  /* Serialised here, as a string, so pg and PGlite receive byte-identical input
   * and neither driver's object handling can differ. */
  const body = JSON.stringify(buildPayload(payload));

  if (client) return unwrap(await client.query(SAVE_SQL, [body]));
  return db.withClient(async c => unwrap(await c.query(SAVE_SQL, [body])), { urlEnv: URL_ENV, timeoutMs, _Client });
}

/* A read of a real table, not "select 1": Supabase counts user activity on the
 * database, and a query that touches no table is the one most likely not to
 * count. An index probe, so its cost does not grow with the archive. */
const TOUCH_SQL = 'select id from nose.documents order by id desc limit 1';

async function touch({ timeoutMs = 8000, _Client } = {}) {
  await db.withClient(c => c.query(TOUCH_SQL), { urlEnv: URL_ENV, timeoutMs, _Client });
  return true;
}

/* clean and findPersonalKey are public: the dispensary store refuses and
   cleans by them, and scripts/lib/rerun.js cleans by clean. */
module.exports = {
  saveScan,
  touch,
  clientConfig: db.clientConfig,
  TOUCH_SQL,
  PERSONAL_KEYS,
  clean,
  findPersonalKey,
  _buildPayload: buildPayload
};

'use strict';
/* NOSE - the archive's one write path, from JavaScript.
 *
 * saveScan(payload, { client }) makes a single call to nose.save_scan() and
 * returns what it reports. Every rule - dedupe, append-only, the person guard,
 * derived columns, both hashes - lives in the database (supabase/migrations).
 * This module only gets the payload there intact, over a verified connection.
 *
 * With no client: a fresh pg Client per call - connect, one query, end. A
 * function instance serves one request at a time and Supabase's pooler is the
 * real pool, so holding sockets open buys nothing. Scripts may pass one client
 * for a whole run; test/store-test.js passes PGlite through the same seam,
 * which is why nothing here uses more than client.query(text, params).
 *
 * Never a query `name`: named queries are prepared statements, which the
 * transaction pooler cannot run.
 *
 * The payload travels as a bind parameter. Postgres does not write bind
 * parameters to its error log by default; inlining the payload into the SQL
 * text would put the whole report in the log on any failure.
 */

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

function checkUrl(url, name = 'NOSE_DB_URL') {
  if (!url) throw new Error(`${name} is not set`);
  if (/[?&]sslmode=/i.test(url)) {
    throw new Error(`${name} must not contain sslmode: pg discards the ssl object when one is present, ` +
                    'and TLS verification is configured in code');
  }
  return url;
}

function loadCa() {
  let ca;
  try { ca = require('./supabase-ca'); }
  catch {
    throw new Error('Supabase root certificate not embedded yet - run: node scripts/embed-supabase-ca.js <downloaded .crt>');
  }
  if (typeof ca !== 'string' || !ca.includes('BEGIN CERTIFICATE')) {
    throw new Error('netlify/functions/lib/supabase-ca.js does not hold a PEM certificate');
  }
  return ca;
}

/* One place that decides how NOSE connects, shared by the scripts. TLS is
 * verified against Supabase's own root certificate. Never
 * rejectUnauthorized: false - if verification fails, the connection fails. */
function clientConfig(url, { name = 'NOSE_DB_URL', timeoutMs = 1000, queryTimeoutMs = 4000 } = {}) {
  return {
    connectionString: checkUrl(url, name),
    ssl: { ca: loadCa() },
    connectionTimeoutMillis: timeoutMs,
    /* A hung query must not outlive Netlify's 10s ceiling. */
    query_timeout: queryTimeoutMs
  };
}

function unwrap(res) {
  const r = res && res.rows && res.rows[0] && res.rows[0].result;
  if (r == null) throw new Error('saveScan: save_scan returned nothing');
  return typeof r === 'string' ? JSON.parse(r) : r;
}

const SAVE_SQL = 'select nose.save_scan($1::jsonb) as result';

async function saveScan(payload, { client } = {}) {
  /* Serialised here, as a string, so pg and PGlite receive byte-identical input
   * and neither driver's object handling can differ. */
  const body = JSON.stringify(buildPayload(payload));

  if (client) return unwrap(await client.query(SAVE_SQL, [body]));

  const { Client } = require('pg');
  const c = new Client(clientConfig(process.env.NOSE_DB_URL));
  try {
    await c.connect();
    return unwrap(await c.query(SAVE_SQL, [body]));
  } finally {
    await c.end().catch(() => {});
  }
}

module.exports = {
  saveScan,
  clientConfig,
  PERSONAL_KEYS,
  _clean: clean,
  _findPersonalKey: findPersonalKey,
  _buildPayload: buildPayload,
  _checkUrl: checkUrl
};

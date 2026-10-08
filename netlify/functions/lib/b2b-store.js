'use strict';
/* NOSE - dispensary (B2B) data, from JavaScript. PARSER-HANDOFF s14.
 *
 * Mirrors lib/store.js, for schema b2b and role nose_b2b:
 *
 *   upsertBatches(storeId, rows)          a store's listed batches, added or
 *                                         updated in one statement
 *   upsertRead(storeId, batchId, output)  NOSE's one current reading of a
 *                                         batch's lab report
 *   storeForKey(key)                      which store a working key names
 *
 * - A FIXED FIELD LIST PER WRITE. Only BATCH_FIELDS and READ_FIELDS ever
 *   leave this module; anything else a caller attaches is dropped here.
 * - PERSON KEYS REFUSED BEFORE ANYTHING IS SENT, at any depth of what the
 *   caller hands in: the archive's own list (PERSONAL_KEYS, lib/store.js),
 *   which b2b.holds_no_person() refuses in the database too.
 * - VALUES ONLY FOR AN ACCEPTED READ. A refused reading keeps its reasons and
 *   no figure - no terpenes, no total, no moisture or water activity - and
 *   the database refuses one that tries.
 * - BOUNDED CONNECTIONS. With no client, a fresh pg Client per call - connect,
 *   one statement, end - the whole exchange inside timeoutMs, as store.js
 *   does it: a hung query cannot hold the function, and a late socket error
 *   cannot crash it.
 * - A NO-OP WITHOUT NOSE_B2B_DB_URL. Writes answer NOT_CONFIGURED and
 *   storeForKey answers null; pg is never loaded.
 * - SCRUBBED ERRORS. A database error comes back as one short message with
 *   no key, fingerprint, address, host, IP or quoted value in it, plus its
 *   code and constraint name. Its detail - where Postgres puts the failing
 *   row - is never passed on.
 *
 * NOSE_B2B_DB_URL is nose_b2b.<project-ref> through Supabase's transaction
 * pooler (6543), TLS verified against the embedded root certificate and no
 * sslmode - exactly as NOSE_DB_URL, through store.js's own clientConfig().
 * Never a query `name`: the transaction pooler cannot run prepared
 * statements. Every value travels as a bind parameter, so none reaches the
 * Postgres log in a statement's text.
 *
 * Nothing here logs. The caller decides what to print: on success nothing,
 * on failure one line without detail.
 *
 * Keys: a key is 32 random bytes as hex, behind a visible prefix - nsk_ for a
 * store's secret key, npk_ for its public one. Only keyHash(key) is stored.
 */

const crypto = require('crypto');
const { PERSONAL_KEYS, clientConfig, _clean: clean, _findPersonalKey: findPersonalKey } = require('./store');

const NOT_CONFIGURED = 'not configured';
const DEFAULT_TIMEOUT_MS = 4000;

/* ------------------------------------------------------------------ keys */

const KEY_PREFIX = Object.freeze({ secret: 'nsk_', public: 'npk_' });
const KEY_SHAPE = /^(nsk|npk)_[0-9a-f]{64}$/;

function newKey(kind) {
  if (!Object.prototype.hasOwnProperty.call(KEY_PREFIX, kind)) throw new TypeError('newKey: kind is secret or public');
  return KEY_PREFIX[kind] + crypto.randomBytes(32).toString('hex');
}

/* The kind a well-formed key names, or null. */
function keyKind(key) {
  const m = typeof key === 'string' ? KEY_SHAPE.exec(key) : null;
  return m ? (m[1] === 'nsk' ? 'secret' : 'public') : null;
}

/* The SHA-256, as hex, of the whole key as written, prefix included: what
   b2b.store_keys holds, and all it holds. */
function keyHash(key) {
  if (!keyKind(key)) throw new TypeError('keyHash: not a NOSE key');
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex');
}

/* ------------------------------------------------------- the two writes */

/* The catalog's columns (docs/B2B-CATALOG-FORMAT.md) and where the batch came
   in the upload. store_id comes from the caller's argument, the two days from
   the database. */
const BATCH_FIELDS = Object.freeze(['batch_id', 'product_id', 'list_position', 'category', 'route', 'name', 'brand',
                                    'coa_url', 'product_url', 'in_stock', 'thc_percent', 'cbd_percent']);
/* Optional in the catalog format, "empty when unknown": an empty value is
   not given, so it is stored as NULL - the database refuses an empty string
   standing in for one. */
const OPTIONAL_BATCH_FIELDS = Object.freeze(['brand', 'coa_url', 'product_url', 'thc_percent', 'cbd_percent']);

/* The parser's own names (PARSER-HANDOFF s7) for what b2b.batch_reads keeps. */
const READ_FIELDS = Object.freeze(['lab', 'productClass', 'usable', 'rejectReasons', 'terps', 'totalTerpenes',
                                   'moisture', 'waterActivity', 'harvestOn', 'reportOn', 'readBy', 'warnings']);

/* A batch's lab report link as stored: https, the whole link without its "#"
   part - a fragment is never sent to a server, and the query names the report
   on real portals (Kaycha's viewer ?sample=, Method's ?search=). A link that
   carries a user name or password is refused: that is a credential. */
function coaLink(raw) {
  if (raw == null || raw === '') return null;
  let u;
  try { u = new URL(String(raw)); }
  catch { throw new TypeError('coa_url is not a link'); }
  if (u.protocol !== 'https:') throw new TypeError('coa_url is not an https link');
  if (u.username || u.password) throw new TypeError('coa_url carries a user name or password');
  u.hash = '';
  return u.href;
}

function refusePersonal(value, what) {
  const k = findPersonalKey(value);
  /* The key's name only, never its value. */
  if (k) throw new TypeError(`${what}: refusing "${k}" - dispensary records hold nothing about a person`);
}

function storeIdOf(storeId) {
  const s = String(storeId);
  if (!/^[1-9][0-9]{0,18}$/.test(s)) throw new TypeError('storeId must be a store\'s id');
  return s;
}

function buildBatchRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError('upsertBatches: rows must be an array');
  refusePersonal(rows, 'upsertBatches');
  const seen = new Set();
  return rows.map((r, i) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new TypeError(`upsertBatches: row ${i + 1} is not an object`);
    const out = {};
    for (const f of BATCH_FIELDS) out[f] = clean(r[f] === undefined ? null : r[f]);
    for (const f of OPTIONAL_BATCH_FIELDS) if (typeof out[f] === 'string' && out[f].trim() === '') out[f] = null;
    out.coa_url = coaLink(out.coa_url);
    if (seen.has(out.batch_id)) throw new TypeError(`upsertBatches: row ${i + 1} repeats an earlier row's batch_id`);
    seen.add(out.batch_id);
    return out;
  });
}

const strings = v => (Array.isArray(v) ? v.filter(s => typeof s === 'string').map(clean) : []);
const textOrNull = v => (typeof v === 'string' && v !== '' ? clean(v) : null);
const numberOrNull = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function buildRead(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) throw new TypeError('upsertRead: the parser output must be an object');
  refusePersonal(output, 'upsertRead');
  const usable = output.usable === true;
  return {
    lab: textOrNull(output.lab),
    productClass: textOrNull(output.productClass),
    usable,
    rejectReasons: strings(output.rejectReasons),
    /* As the parser read them, and only when the read was accepted. */
    terps: usable ? clean(output.terps ?? null) : null,
    totalTerpenes: usable ? numberOrNull(output.totalTerpenes) : null,
    moisture: usable ? numberOrNull(output.moisture) : null,
    waterActivity: usable ? numberOrNull(output.waterActivity) : null,
    harvestOn: textOrNull(output.harvestOn),
    reportOn: textOrNull(output.reportOn),
    readBy: textOrNull(output.readBy),
    warnings: strings(output.warnings)
  };
}

/* One statement each: the rows travel as one JSON bind parameter, and the
   database types them. The two days are the database's own: first_listed_on
   on the first listing, last_listed_on and read_on on every one. */
const UPSERT_BATCHES_SQL = `
  with up as (
    insert into b2b.batches as b (store_id, batch_id, product_id, list_position, category, route, name, brand,
                                  coa_url, product_url, in_stock, thc_percent, cbd_percent)
    select $1::bigint, r.batch_id, r.product_id, r.list_position, r.category, r.route, r.name, r.brand,
           r.coa_url, r.product_url, r.in_stock, r.thc_percent, r.cbd_percent
      from jsonb_to_recordset($2::jsonb) as r (batch_id text, product_id text, list_position integer, category text,
                                               route text, name text, brand text, coa_url text, product_url text,
                                               in_stock boolean, thc_percent numeric, cbd_percent numeric)
    on conflict (store_id, batch_id) do update
       set product_id = excluded.product_id, list_position = excluded.list_position, category = excluded.category,
           route = excluded.route, name = excluded.name, brand = excluded.brand, coa_url = excluded.coa_url,
           product_url = excluded.product_url, in_stock = excluded.in_stock, thc_percent = excluded.thc_percent,
           cbd_percent = excluded.cbd_percent, last_listed_on = (now() at time zone 'UTC')::date
    returning (xmax = 0) as inserted)
  select (count(*) filter (where inserted))::int as inserted, (count(*) filter (where not inserted))::int as updated
    from up`;

const UPSERT_READ_SQL = `
  insert into b2b.batch_reads (store_id, batch_id, read_on, lab, product_class, usable, reject_reasons, terps,
                               total_terpenes, moisture, water_activity, harvest_on, report_on, read_by, warnings)
  select $1::bigint, $2::text, (now() at time zone 'UTC')::date, r."lab", r."productClass", r."usable",
         coalesce(array(select jsonb_array_elements_text(r."rejectReasons")), '{}'), r."terps",
         r."totalTerpenes", r."moisture", r."waterActivity", r."harvestOn", r."reportOn", r."readBy",
         coalesce(array(select jsonb_array_elements_text(r."warnings")), '{}')
    from jsonb_to_record($3::jsonb) as r ("lab" text, "productClass" text, "usable" boolean, "rejectReasons" jsonb,
                                          "terps" jsonb, "totalTerpenes" numeric, "moisture" numeric,
                                          "waterActivity" numeric, "harvestOn" date, "reportOn" date,
                                          "readBy" text, "warnings" jsonb)
  on conflict (store_id, batch_id) do update
     set read_on = excluded.read_on, lab = excluded.lab, product_class = excluded.product_class,
         usable = excluded.usable, reject_reasons = excluded.reject_reasons, terps = excluded.terps,
         total_terpenes = excluded.total_terpenes, moisture = excluded.moisture,
         water_activity = excluded.water_activity, harvest_on = excluded.harvest_on, report_on = excluded.report_on,
         read_by = excluded.read_by, warnings = excluded.warnings
  returning read_on::text as read_on`;

const STORE_FOR_KEY_SQL = `
  select s.id::text as store_id, s.slug, k.kind
    from b2b.store_keys k join b2b.stores s on s.id = k.store_id
   where k.key_sha256 = $1 and k.revoked_on is null`;

/* ------------------------------------------------------------ connection */

const configured = (env = process.env) => !!env.NOSE_B2B_DB_URL;

/* An error's message, safe to print or return: no key, no fingerprint, no
   address, no database host, no IP, no quoted input value. */
function scrub(err) {
  return String((err && err.message) || err || 'failed')
    .replace(/n[sp]k_[0-9A-Za-z_-]+/g, '<key>')
    .replace(/[0-9a-f]{64}/gi, '<sha256>')
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<address>')
    .replace(/\b[\w.-]+\.supabase\.(?:com|co)\b(?::\d+)?/gi, '<database host>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b(?::\d+)?/g, '<ip>')
    .replace(/\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/gi, '<ip>')
    .replace(/:\s*"[^"]*"/g, ': <value>')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

/* The error a caller sees: the scrubbed message, the SQLSTATE and the
   constraint's name - schema facts, not data - and nothing else. */
function scrubbed(err) {
  const e = new Error(`b2b-store: ${scrub(err)}`);
  if (err && typeof err.code === 'string') e.code = err.code;
  if (err && typeof err.constraint === 'string') e.constraint = err.constraint;
  return e;
}

/* Connect, run fn(client), let go - inside timeoutMs, as store.js's
   withClient: pg's own timeouts as a second line, an 'error' listener so a
   socket lost after we stopped waiting cannot crash the process, and end()
   never awaited. _Client exists for test/b2b-store-test.js. */
async function withClient(fn, { timeoutMs = DEFAULT_TIMEOUT_MS, _Client } = {}) {
  const Client = _Client || require('pg').Client;
  const c = new Client(clientConfig(process.env.NOSE_B2B_DB_URL,
                                    { name: 'NOSE_B2B_DB_URL', timeoutMs, queryTimeoutMs: timeoutMs }));
  c.on('error', () => {});

  let timer;
  const work = (async () => {
    await c.connect();
    return fn(c);
  })();
  const giveUp = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`gave up after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([work, giveUp]);
  } finally {
    clearTimeout(timer);
    Promise.resolve().then(() => c.end()).catch(() => {});
  }
}

async function run(sql, params, { client, timeoutMs, _Client } = {}) {
  try {
    if (client) return await client.query(sql, params);
    return await withClient(c => c.query(sql, params), { timeoutMs, _Client });
  } catch (e) {
    throw scrubbed(e);
  }
}

/* ------------------------------------------------------------- the calls */

async function upsertBatches(storeId, rows, opts = {}) {
  const id = storeIdOf(storeId);
  const body = buildBatchRows(rows);
  if (!opts.client && !configured()) return NOT_CONFIGURED;
  if (!body.length) return { inserted: 0, updated: 0 };
  const res = await run(UPSERT_BATCHES_SQL, [id, JSON.stringify(body)], opts);
  const r = res.rows[0];
  return { inserted: Number(r.inserted), updated: Number(r.updated) };
}

async function upsertRead(storeId, batchId, output, opts = {}) {
  const id = storeIdOf(storeId);
  if (typeof batchId !== 'string' || !batchId) throw new TypeError('upsertRead: batchId must be a string');
  const body = buildRead(output);
  if (!opts.client && !configured()) return NOT_CONFIGURED;
  const res = await run(UPSERT_READ_SQL, [id, clean(batchId), JSON.stringify(body)], opts);
  return { written: true, readOn: res.rows[0].read_on };
}

/* The store a key names, while the key works: { storeId, slug, kind }, or
   null - for a key that is malformed, unknown, revoked, or when there is no
   database. Only the key's hash is sent. */
async function storeForKey(key, opts = {}) {
  if (!keyKind(key)) return null;
  if (!opts.client && !configured()) return null;
  const res = await run(STORE_FOR_KEY_SQL, [keyHash(key)], opts);
  const r = res.rows[0];
  return r ? { storeId: String(r.store_id), slug: r.slug, kind: r.kind } : null;
}

module.exports = {
  upsertBatches, upsertRead, storeForKey,
  newKey, keyHash, keyKind, coaLink, configured,
  BATCH_FIELDS, OPTIONAL_BATCH_FIELDS, READ_FIELDS, KEY_PREFIX, PERSONAL_KEYS, NOT_CONFIGURED, DEFAULT_TIMEOUT_MS,
  _buildBatchRows: buildBatchRows, _buildRead: buildRead, _scrub: scrub, _withClient: withClient,
  UPSERT_BATCHES_SQL, UPSERT_READ_SQL, STORE_FOR_KEY_SQL
};

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
 * and, since 2026-10-08 (Prompt 3, the catalog upload and the batch reader):
 *
 *   batchesFromCatalog(rows)              a catalog's rows, read by
 *                                         lib/b2b-catalog-format.js, as batch
 *                                         rows - or refused, by row number and
 *                                         reason, for what the database cannot
 *                                         hold
 *   applyCatalog(storeId, batches, listed)  an upload as a whole snapshot, in
 *                                         one statement: the listed batches
 *                                         added or updated, every other batch
 *                                         of the store kept and marked out of
 *                                         stock
 *   storeForSecretKey(key)                the store a working SECRET key names,
 *                                         the hash compared in constant time
 *   upsertRead(..., { readUrl })          a reading, with the link it came from
 *   upsertUnfetched(storeId, batchId, readUrl, reason)
 *                                         a link that gave no report: the
 *                                         fetcher's words, and nothing read
 *   storeBySlug(slug), listedInWindow(storeId)
 *                                         what the reader and the coverage
 *                                         report read back
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

/* The parser's own names (PARSER-HANDOFF s7) for what b2b.batch_reads keeps.
   The last three since 2026-10-08: batch and labId, the identifiers the
   report printed (report_batch, report_lab_id), and novelty - sent only as
   whether the parser's notes were empty (new_layout); the notes themselves
   are written for the review queue and never leave this module. */
const READ_FIELDS = Object.freeze(['lab', 'productClass', 'usable', 'rejectReasons', 'terps', 'totalTerpenes',
                                   'moisture', 'waterActivity', 'harvestOn', 'reportOn', 'readBy', 'warnings',
                                   'batch', 'labId', 'novelty']);

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

/* what: the call refusing, in its messages - upsertBatches, or applyCatalog. */
function buildBatchRows(rows, what = 'upsertBatches') {
  if (!Array.isArray(rows)) throw new TypeError(`${what}: rows must be an array`);
  refusePersonal(rows, what);
  const seen = new Set();
  return rows.map((r, i) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new TypeError(`${what}: row ${i + 1} is not an object`);
    const out = {};
    for (const f of BATCH_FIELDS) out[f] = clean(r[f] === undefined ? null : r[f]);
    for (const f of OPTIONAL_BATCH_FIELDS) if (typeof out[f] === 'string' && out[f].trim() === '') out[f] = null;
    out.coa_url = coaLink(out.coa_url);
    if (seen.has(out.batch_id)) throw new TypeError(`${what}: row ${i + 1} repeats an earlier row's batch_id`);
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
    warnings: strings(output.warnings),
    /* Identifiers the report printed, accepted or refused: never a figure. */
    batch: identifierOrNull(output.batch),
    labId: identifierOrNull(output.labId),
    novelty: Array.isArray(output.novelty) && output.novelty.length > 0
  };
}

/* An identifier the report printed, as b2b.batch_reads can hold it: a control
   character becomes a space, the ends are trimmed, and it is cut at 200
   characters. Empty is not given. Only the coverage report's flag reads it -
   whether the report names the catalog's batch, spaces aside. */
function identifierOrNull(v) {
  if (typeof v !== 'string') return null;
  const s = Array.from(clean(v).replace(CONTROL_CHARS, ' ').trim()).slice(0, 200).join('').trim();
  return s === '' ? null : s;
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

/* $4 is the link the reading came from (read_url), since 2026-10-08: a reading
   counts as the batch's current one only while that is still its coa_url. */
const UPSERT_READ_SQL = `
  insert into b2b.batch_reads (store_id, batch_id, read_on, lab, product_class, usable, reject_reasons, terps,
                               total_terpenes, moisture, water_activity, harvest_on, report_on, read_by, warnings,
                               read_url, fetched, report_batch, report_lab_id, new_layout)
  select $1::bigint, $2::text, (now() at time zone 'UTC')::date, r."lab", r."productClass", r."usable",
         coalesce(array(select jsonb_array_elements_text(r."rejectReasons")), '{}'), r."terps",
         r."totalTerpenes", r."moisture", r."waterActivity", r."harvestOn", r."reportOn", r."readBy",
         coalesce(array(select jsonb_array_elements_text(r."warnings")), '{}'),
         $4::text, true, r."batch", r."labId", coalesce(r."novelty", false)
    from jsonb_to_record($3::jsonb) as r ("lab" text, "productClass" text, "usable" boolean, "rejectReasons" jsonb,
                                          "terps" jsonb, "totalTerpenes" numeric, "moisture" numeric,
                                          "waterActivity" numeric, "harvestOn" date, "reportOn" date,
                                          "readBy" text, "warnings" jsonb, "batch" text, "labId" text,
                                          "novelty" boolean)
  on conflict (store_id, batch_id) do update
     set read_on = excluded.read_on, lab = excluded.lab, product_class = excluded.product_class,
         usable = excluded.usable, reject_reasons = excluded.reject_reasons, terps = excluded.terps,
         total_terpenes = excluded.total_terpenes, moisture = excluded.moisture,
         water_activity = excluded.water_activity, harvest_on = excluded.harvest_on, report_on = excluded.report_on,
         read_by = excluded.read_by, warnings = excluded.warnings, read_url = excluded.read_url, fetched = true,
         report_batch = excluded.report_batch, report_lab_id = excluded.report_lab_id,
         new_layout = excluded.new_layout
  returning read_on::text as read_on`;

/* A link that gave no report: the fetcher's one sentence and nothing read.
   It replaces whatever the batch held - unless that is a reading the same
   link DID give (a --reread on a day the lab's portal is down): a fetch that
   failed read nothing, so it never takes a real reading's place. Then no row
   comes back, and the reading stands. */
const UPSERT_UNFETCHED_SQL = `
  insert into b2b.batch_reads as r (store_id, batch_id, read_on, read_url, fetched, usable, reject_reasons)
  values ($1::bigint, $2::text, (now() at time zone 'UTC')::date, $3::text, false, false, array[$4::text])
  on conflict (store_id, batch_id) do update
     set read_on = excluded.read_on, read_url = excluded.read_url, fetched = false, usable = false,
         reject_reasons = excluded.reject_reasons, lab = null, product_class = null, terps = null,
         total_terpenes = null, moisture = null, water_activity = null, harvest_on = null, report_on = null,
         read_by = null, warnings = '{}', report_batch = null, report_lab_id = null, new_layout = false
   where not (r.fetched and r.read_url is not distinct from excluded.read_url)
  returning read_on::text as read_on`;

/* An upload, as a whole snapshot, in one statement - so it lands whole or not
   at all. The listed batches are added or updated as upsertBatches does it;
   every other batch of the store still in stock is marked out of stock and
   KEPT: a shopper's past purchases are usually sold out, and the feed must
   still find them. $3 names every batch on a row of the file, refused rows
   included, so a row refused for a typo never takes its batch out of stock.
   The two sets cannot meet: $3 holds every batch_id $2 does. A batch absent
   from the upload keeps its last_listed_on - the last day a file listed it,
   which the store's window is measured from - and its list_position. */
const APPLY_CATALOG_SQL = `
  with listed as (
    select jsonb_array_elements_text($3::jsonb) as batch_id),
  up as (
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
    returning (xmax = 0) as inserted),
  gone as (
    update b2b.batches as b
       set in_stock = false
     where b.store_id = $1::bigint and b.in_stock
       and not exists (select 1 from listed l where l.batch_id = b.batch_id)
    returning 1)
  select (select count(*) from up where inserted)::int as inserted,
         (select count(*) from up where not inserted)::int as updated,
         (select count(*) from gone)::int as marked_out_of_stock`;

const STORE_FOR_KEY_SQL = `
  select s.id::text as store_id, s.slug, k.kind
    from b2b.store_keys k join b2b.stores s on s.id = k.store_id
   where k.key_sha256 = $1 and k.revoked_on is null`;

/* A working secret key: an upload's. The row's own hash comes back so the
   caller can compare it with the presented key's in constant time. */
const SECRET_KEY_SQL = `
  select s.id::text as store_id, s.slug, k.key_sha256
    from b2b.store_keys k join b2b.stores s on s.id = k.store_id
   where k.key_sha256 = $1 and k.kind = 'secret' and k.revoked_on is null`;

const STORE_BY_SLUG_SQL = `
  select id::text as store_id, slug, display_name, window_months
    from b2b.stores
   where slug = $1`;

/* The store's window - how far back a listed batch stays in its feed - as one
   SQL condition on b2b.batches b joined to b2b.stores s: the batch was last
   listed no more than window_months ago, counted in UTC days. The feed
   (Prompt 4) reads the same condition. */
const IN_WINDOW_SQL = `b.last_listed_on >= ((now() at time zone 'UTC')::date - make_interval(months => s.window_months))::date`;

/* Every batch the store listed within its window, with its reading if it has
   one. "current": a reading of the batch's own coa_url that the link gave -
   the one reading of this batch NOSE stands by. A reading of another link (one
   the store has since corrected) or one the link never gave is not current:
   the reader reads the batch again, and nothing shows its numbers. In stock
   first, then the store's own order. */
const LISTED_SQL = `
  select b.batch_id, b.product_id, b.list_position, b.category, b.route, b.name, b.brand, b.coa_url,
         b.product_url, b.in_stock, b.last_listed_on::text as last_listed_on,
         (r.batch_id is not null) as has_read, r.read_on::text as read_on,
         (r.read_url is not distinct from b.coa_url and b.coa_url is not null) as same_link,
         coalesce(r.fetched and r.read_url = b.coa_url, false) as current,
         r.fetched, r.usable, r.lab, r.product_class, to_json(r.reject_reasons) as reject_reasons, r.terps,
         r.total_terpenes::text as total_terpenes, to_json(r.warnings) as warnings, r.report_batch,
         r.report_lab_id, r.new_layout
    from b2b.batches b
    join b2b.stores s on s.id = b.store_id
    left join b2b.batch_reads r on r.store_id = b.store_id and r.batch_id = b.batch_id
   where b.store_id = $1::bigint and ${IN_WINDOW_SQL}
   order by b.in_stock desc, b.list_position, b.batch_id`;

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

/* A reading, as the parser gave it. opts.readUrl is the link it came from
   (since 2026-10-08): without one the reading is kept but is never current,
   so nothing shows its numbers. */
async function upsertRead(storeId, batchId, output, opts = {}) {
  const id = storeIdOf(storeId);
  if (typeof batchId !== 'string' || !batchId) throw new TypeError('upsertRead: batchId must be a string');
  const body = buildRead(output);
  const readUrl = coaLink(opts.readUrl ?? null);
  if (!opts.client && !configured()) return NOT_CONFIGURED;
  const res = await run(UPSERT_READ_SQL, [id, clean(batchId), JSON.stringify(body), readUrl], opts);
  return { written: true, readOn: res.rows[0].read_on };
}

/* A link that gave no report, in the fetcher's own words. { written: true }
   when it is now the batch's reading; { written: false, kept: true } when the
   batch already holds a reading that same link gave, which stands. */
async function upsertUnfetched(storeId, batchId, readUrl, reason, opts = {}) {
  const id = storeIdOf(storeId);
  if (typeof batchId !== 'string' || !batchId) throw new TypeError('upsertUnfetched: batchId must be a string');
  const link = coaLink(readUrl);
  if (!link) throw new TypeError('upsertUnfetched: the link that gave no report is required');
  if (typeof reason !== 'string' || !reason.trim()) throw new TypeError('upsertUnfetched: the fetcher\'s words are required');
  if (!opts.client && !configured()) return NOT_CONFIGURED;
  const res = await run(UPSERT_UNFETCHED_SQL, [id, clean(batchId), link, clean(reason).trim()], opts);
  return res.rows.length ? { written: true, readOn: res.rows[0].read_on } : { written: false, kept: true };
}

/* ------------------------------------------------------ the catalog upload */

/* What b2b.batches refuses, checked here first: a row the database would
   refuse is refused by row number and reason, and the rest of the upload
   still lands - instead of one row failing the whole statement. Lengths count
   characters as Postgres does; a control character covers a line break inside
   a quoted CSV value. */
const TEXT_LIMITS = Object.freeze({ batch_id: 200, product_id: 200, name: 300, brand: 300 });
const URL_LIMIT = 2048;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const HAS_CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const codePoints = s => Array.from(s).length;
const percentOf = v => (v === '' || v == null ? null : Number(String(v).replace('%', '').trim()));

/* rows: what lib/b2b-catalog-format.js's readCatalog() read - each either a
   row (outcome null) or a refused row (with its row number and reasons).
   Returns { batches, refused, listed }:
     batches  the rows as BATCH_FIELDS, typed: in_stock a boolean, a percent
              a number, list_position the row's number in the file (the
              header is row 1, as the refusals count it)
     refused  [{ row, reasons }] - the format's refusals, then the database's
     listed   every batch_id named on a row, refused rows included: the
              batches an upload does not take out of stock */
function batchesFromCatalog(rows) {
  if (!Array.isArray(rows)) throw new TypeError('batchesFromCatalog: rows must be an array');
  const batches = [];
  const refused = [];
  const listed = new Set();
  for (const r of rows) {
    if (typeof r.batch_id === 'string' && r.batch_id !== '') listed.add(r.batch_id);
    if (r.outcome !== null) { refused.push({ row: r.row, reasons: [...(r.reasons || [])] }); continue; }
    const problems = [];
    for (const [col, max] of Object.entries(TEXT_LIMITS)) {
      const v = r[col];
      if (typeof v !== 'string' || v === '') continue;
      if (codePoints(v) > max) problems.push(`${col} is longer than ${max} characters`);
      if (HAS_CONTROL.test(v)) problems.push(`${col} has a line break or another control character in it`);
    }
    let coa = null;
    if (r.coa_url) {
      try { coa = coaLink(r.coa_url); } catch (e) { problems.push(e.message); }
      if (coa && coa.length > URL_LIMIT) problems.push(`coa_url is longer than ${URL_LIMIT} characters`);
    }
    if (r.product_url) {
      if (/\s/.test(r.product_url)) problems.push('product_url has a space or a line break in it');
      if (r.product_url.length > URL_LIMIT) problems.push(`product_url is longer than ${URL_LIMIT} characters`);
    }
    if (problems.length) { refused.push({ row: r.row, reasons: problems }); continue; }
    batches.push({
      batch_id: r.batch_id, product_id: r.product_id, list_position: r.row, category: r.category, route: r.route,
      name: r.name, brand: r.brand || null, coa_url: coa, product_url: r.product_url || null,
      in_stock: r.in_stock === 'yes', thc_percent: percentOf(r.thc_percent), cbd_percent: percentOf(r.cbd_percent)
    });
  }
  return { batches, refused, listed: [...listed] };
}

/* An upload as a whole snapshot (APPLY_CATALOG_SQL): { inserted, updated,
   markedOutOfStock }. At least one batch, or nothing is sent - an empty
   snapshot would take every batch of the store out of stock. */
async function applyCatalog(storeId, batches, listed, opts = {}) {
  const id = storeIdOf(storeId);
  const body = buildBatchRows(batches, 'applyCatalog');
  if (!body.length) throw new TypeError('applyCatalog: an upload must list at least one batch');
  if (!Array.isArray(listed) || listed.some(b => typeof b !== 'string')) throw new TypeError('applyCatalog: listed must be batch ids');
  const names = new Set(listed.map(clean));
  if (body.some(b => !names.has(b.batch_id))) throw new TypeError('applyCatalog: every batch sent must be among those listed');
  if (!opts.client && !configured()) return NOT_CONFIGURED;
  const res = await run(APPLY_CATALOG_SQL, [id, JSON.stringify(body), JSON.stringify([...names])], opts);
  const r = res.rows[0];
  return { inserted: Number(r.inserted), updated: Number(r.updated), markedOutOfStock: Number(r.marked_out_of_stock) };
}

/* ------------------------------------------------------------- the keys */

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

/* The store a working SECRET key names - an upload's: { storeId, slug }, or
   null for a public key, a malformed, unknown or revoked one, or no database.
   The key never leaves this function: the database is asked for the row of
   its SHA-256, and the hash that comes back is compared with the key's own in
   constant time (crypto.timingSafeEqual), so the comparison that decides takes
   the same time whatever the bytes. A lookup by hash cannot reveal the key -
   at most something about the hash of a key the caller already holds. */
async function storeForSecretKey(key, opts = {}) {
  if (keyKind(key) !== 'secret') return null;
  if (!opts.client && !configured()) return null;
  const want = Buffer.from(keyHash(key), 'hex');
  const res = await run(SECRET_KEY_SQL, [want.toString('hex')], opts);
  const r = res.rows[0];
  if (!r || typeof r.key_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(r.key_sha256)) return null;
  return crypto.timingSafeEqual(Buffer.from(r.key_sha256, 'hex'), want) ? { storeId: String(r.store_id), slug: r.slug } : null;
}

/* ------------------------------------------- what the scripts read back */

async function storeBySlug(slug, opts = {}) {
  if (typeof slug !== 'string' || slug.length > 40 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  if (!opts.client && !configured()) return NOT_CONFIGURED;
  const res = await run(STORE_BY_SLUG_SQL, [slug], opts);
  const r = res.rows[0];
  return r ? { storeId: String(r.store_id), slug: r.slug, displayName: r.display_name, windowMonths: Number(r.window_months) } : null;
}

const numberOrNullText = v => (v == null ? null : Number(v));

/* LISTED_SQL, as plain values: one entry per batch in the window, in stock
   first, then the store's order, each with its reading or null. */
async function listedInWindow(storeId, opts = {}) {
  const id = storeIdOf(storeId);
  if (!opts.client && !configured()) return NOT_CONFIGURED;
  const res = await run(LISTED_SQL, [id], opts);
  return res.rows.map(r => ({
    batchId: r.batch_id, productId: r.product_id, listPosition: Number(r.list_position), category: r.category,
    route: r.route, name: r.name, brand: r.brand, coaUrl: r.coa_url, productUrl: r.product_url,
    inStock: r.in_stock === true, lastListedOn: r.last_listed_on,
    reading: r.has_read !== true ? null : {
      readOn: r.read_on, current: r.current === true, sameLink: r.same_link === true, fetched: r.fetched === true,
      usable: r.usable === true, lab: r.lab, productClass: r.product_class,
      rejectReasons: Array.isArray(r.reject_reasons) ? r.reject_reasons : [], terps: r.terps,
      totalTerpenes: numberOrNullText(r.total_terpenes), warnings: Array.isArray(r.warnings) ? r.warnings : [],
      batch: r.report_batch, labId: r.report_lab_id, newLayout: r.new_layout === true
    }
  }));
}

module.exports = {
  upsertBatches, upsertRead, storeForKey,
  batchesFromCatalog, applyCatalog, storeForSecretKey, upsertUnfetched, storeBySlug, listedInWindow,
  newKey, keyHash, keyKind, coaLink, configured,
  BATCH_FIELDS, OPTIONAL_BATCH_FIELDS, READ_FIELDS, KEY_PREFIX, PERSONAL_KEYS, NOT_CONFIGURED, DEFAULT_TIMEOUT_MS,
  TEXT_LIMITS, URL_LIMIT,
  _buildBatchRows: buildBatchRows, _buildRead: buildRead, _scrub: scrub, _withClient: withClient,
  UPSERT_BATCHES_SQL, UPSERT_READ_SQL, STORE_FOR_KEY_SQL,
  UPSERT_UNFETCHED_SQL, APPLY_CATALOG_SQL, SECRET_KEY_SQL, STORE_BY_SLUG_SQL, IN_WINDOW_SQL, LISTED_SQL
};

'use strict';
/* NOSE — COA storage layer.
 *
 * Persists lab documents and what the parser read off them. Nothing here
 * touches parse-coa.js; this module only writes down what it was handed.
 *
 * WHAT THIS STORE MUST NEVER HOLD: anything identifying a person. No user id,
 * no IP, no device, no palate, no session. The parser's output contract
 * (PARSER-HANDOFF §7) contains none of those today, and `output` is written
 * wholesale, so assertNoPersonalFields() below is the tripwire if a future
 * field ever carries one.
 *
 * Connection: NOSE_DB_URL. Supabase's transaction pooler (port 6543) does not
 * support prepared statements, so no query here is given a `name`.
 */

const { Pool } = require('pg');

/* ---------------------------------------------------------------- connection
 * One pool per process, built lazily. Netlify reuses a warm function
 * container across invocations, so building this at module scope keeps
 * connection churn off the 7.5s fetch budget. max:1 because a function
 * instance handles one request at a time and the pooler is the real pool.
 */
let pool = null;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.NOSE_DB_URL;
  if (!connectionString) {
    throw new Error('NOSE_DB_URL is not set — cannot reach the COA store');
  }
  pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000
  });
  return pool;
}

/* Exposed so tests and shutdown paths can release sockets. */
async function end() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/* ------------------------------------------------------------------- guards */

const PERSONAL_FIELDS = [
  'userid', 'user_id', 'ip', 'ipaddress', 'ip_address', 'deviceid',
  'device_id', 'palate', 'email', 'sessionid', 'session_id',
  'useragent', 'user_agent'
];

/* Fails closed, the way the parser does. A believable row carrying a person's
 * identity is worse than a refused write. */
function assertNoPersonalFields(output) {
  for (const key of Object.keys(output || {})) {
    if (PERSONAL_FIELDS.includes(key.toLowerCase())) {
      throw new Error(
        `refusing to store "${key}" — the COA store holds documents and ` +
        `parses, never anything identifying a person`
      );
    }
  }
}

/* pg returns bigint as a string, because a bigint can exceed Number's exact
 * range. Document and parse counts cannot reach 2^53, so a Number is safe
 * here and spares every caller a string/number comparison bug. */
function toId(raw) {
  return raw == null ? null : Number(raw);
}

/* A value the lab did not print is null, never 0 — 0 is a real reading
 * (below-LOQ resolves to it) and must stay distinguishable from unread. */
function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/* ------------------------------------------------------------- saveDocument
 * Upsert on sha256. Saving the same bytes twice yields one row and the same
 * id both times. Single statement: the CTE returns the new id on insert, and
 * the UNION ALL arm returns the existing id when ON CONFLICT wrote nothing.
 */
async function saveDocument({ sha256, sourceUrl, bytes, text, extractorVersion }) {
  if (!sha256) throw new Error('saveDocument: sha256 is required');

  const byteSize =
    typeof bytes === 'number' ? bytes
      : bytes && typeof bytes.length === 'number' ? bytes.length
        : null;

  const { rows } = await getPool().query(
    `WITH ins AS (
       INSERT INTO documents (sha256, source_url, byte_size, extracted_text, extractor_version)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (sha256) DO NOTHING
       RETURNING id
     )
     SELECT id FROM ins
     UNION ALL
     SELECT id FROM documents WHERE sha256 = $1
     LIMIT 1`,
    [sha256, sourceUrl ?? null, byteSize, text ?? null, extractorVersion ?? null]
  );

  return toId(rows[0] && rows[0].id);
}

/* ---------------------------------------------------------------- saveParse
 * Writes the parses row and one terpene_values row per key in output.terps,
 * zeros included — a below-LOQ 0 is a reading, not an absence.
 *
 * Both writes share one transaction: a parse row whose terpene rows failed to
 * land would be a fingerprint that silently lost compounds.
 */
async function saveParse(documentId, parserVersion, output) {
  if (documentId == null) throw new Error('saveParse: documentId is required');
  if (!output) throw new Error('saveParse: output is required');
  assertNoPersonalFields(output);

  const terps = output.terps || {};
  const keys = Object.keys(terps).sort();
  /* numeric[] is fed strings so the exact decimal the parser produced is what
   * Postgres stores — 4.124 stays 4.124. */
  const values = keys.map(k => String(terps[k]));

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO parses (
         document_id, parser_version, usable, product_class, lab, strain,
         batch, lab_id, harvest_date, report_date, client,
         total_terpenes, moisture, water_activity, read_by,
         reject_reasons, warnings, output
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15,
         $16::jsonb, $17::jsonb, $18::jsonb
       ) RETURNING id`,
      [
        documentId,
        parserVersion ?? null,
        typeof output.usable === 'boolean' ? output.usable : null,
        output.productClass ?? null,
        output.lab ?? null,
        output.strain ?? null,
        output.batch ?? null,
        output.labId ?? null,
        output.harvestDate ?? null,
        output.reportDate ?? null,   // parser does not emit this yet
        output.client ?? null,       // licensee on the COA, a business
        numOrNull(output.totalTerpenes),
        numOrNull(output.moisture),
        numOrNull(output.waterActivity),
        output.readBy ?? null,
        JSON.stringify(output.rejectReasons || []),
        JSON.stringify(output.warnings || []),
        JSON.stringify(output)
      ]
    );

    const parseId = toId(rows[0].id);

    if (keys.length) {
      await client.query(
        `INSERT INTO terpene_values (parse_id, key, value)
         SELECT $1, k, v FROM unnest($2::text[], $3::numeric[]) AS t(k, v)`,
        [parseId, keys, values]
      );
    }

    await client.query('COMMIT');
    return parseId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { saveDocument, saveParse, end };

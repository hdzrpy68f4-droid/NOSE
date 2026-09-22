'use strict';
/* NOSE — the fetcher's storage call must never affect what the person is told.
 *
 *   node test/store-wiring-test.js     -> "wiring clean", or a FAIL and exit 1
 *
 * The first three phases need no database and always run. The fourth runs only
 * when NOSE_TEST_DB_URL is set, and proves a parse actually lands in the
 * tables — the wiring equivalent of store-test.
 *
 * Why this exists: the storage call sits in the middle of a working scanner. A
 * regression here would not fail any parser gate — it would just start turning
 * good reads into 500s for someone holding a jar.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
}

/* Load the handler module with NOSE_DB_URL guaranteed unset, so nothing at
 * module load can reach for a database. */
delete process.env.NOSE_DB_URL;
const coa = require(path.resolve(__dirname, '../netlify/functions/coa.js'));
const { _recordParse: recordParse } = coa;

function sampleOutput() {
  const txt = path.resolve(__dirname, 'fixtures/extracted/KAY-CAR-001.txt');
  if (fs.existsSync(txt)) {
    const { parseCoa } = require(path.resolve(__dirname, '../netlify/functions/lib/parse-coa.js'));
    const out = parseCoa(fs.readFileSync(txt, 'utf8'));
    if (out && out.terps && Object.keys(out.terps).length) return out;
  }
  return {
    lab: 'Test Lab', productClass: 'vape', readBy: 'forward', usable: true,
    totalTerpenes: 4.124, rejectReasons: [], warnings: [],
    terps: { limonene: 0.822, myrcene: 0.474, ocimene: 0 }
  };
}

const BUF = Buffer.from('%PDF-1.4 not a real pdf, only bytes to hash');
const OUT = sampleOutput();
const far = () => Date.now() + 9000;

async function main() {
  /* --- 1. unconfigured: the state production is in right now -------------- */
  const unset = await recordParse(BUF, 'https://example.test/a.pdf', 'text', OUT, far());
  check('unset NOSE_DB_URL does not store', unset.stored, false);
  check('unset NOSE_DB_URL says why', unset.reason, 'not configured');

  /* --- 2. no budget left: skipped rather than risking the 10s ceiling ----- */
  process.env.NOSE_DB_URL = 'postgresql://u:p@127.0.0.1:1/postgres';
  const late = await recordParse(BUF, 'https://example.test/a.pdf', 'text', OUT, Date.now() + 10);
  check('an exhausted budget skips the write', late.stored, false);
  check('an exhausted budget says why', late.reason, 'no time left in budget');
  delete process.env.NOSE_DB_URL;

  /* --- 3. a real parse lands in the tables -------------------------------- */
  const TEST_URL = process.env.NOSE_TEST_DB_URL;
  if (TEST_URL) {
    const { Pool } = require('pg');
    const probe = new Pool({ connectionString: TEST_URL, max: 1 });
    const sha = crypto.createHash('sha256').update(BUF).digest('hex');
    process.env.NOSE_DB_URL = TEST_URL;
    try {
      const res = await recordParse(BUF, 'https://example.test/a.pdf', 'extracted text', OUT, far());
      check('a configured store records the parse', res.stored, true);

      const { rows: d } = await probe.query(
        'select count(*)::int n from documents where sha256 = $1', [sha]);
      check('one document row was written', d[0].n, 1);

      const { rows: t } = await probe.query(
        `select count(*)::int n from terpene_values tv
           join parses p on p.id = tv.parse_id
           join documents dd on dd.id = p.document_id
          where dd.sha256 = $1`, [sha]);
      check(`${Object.keys(OUT.terps).length} terpene rows were written`,
        t[0].n, Object.keys(OUT.terps).length);

      /* The same jar scanned twice must not duplicate the document. */
      await recordParse(BUF, 'https://example.test/a.pdf', 'extracted text', OUT, far());
      const { rows: d2 } = await probe.query(
        'select count(*)::int n from documents where sha256 = $1', [sha]);
      check('rescanning the same PDF adds no second document', d2[0].n, 1);
    } finally {
      await probe.query('delete from documents where sha256 = $1', [sha]);
      await probe.end();
      await require(path.resolve(__dirname, '../netlify/functions/lib/store.js')).end();
      delete process.env.NOSE_DB_URL;
    }
  } else {
    console.log('skip  database phase — no NOSE_TEST_DB_URL set');
  }

  /* --- 4. an unreachable database must not throw at the caller ------------ */
  process.env.NOSE_DB_URL = 'postgresql://u:p@127.0.0.1:1/postgres';
  let threw = false;
  let res4;
  try {
    res4 = await recordParse(BUF, 'https://example.test/a.pdf', 'text', OUT, far());
  } catch { threw = true; }
  check('an unreachable database does not throw', threw, false);
  check('an unreachable database reports not-stored', res4 && res4.stored, false);
  delete process.env.NOSE_DB_URL;
  try { await require(path.resolve(__dirname, '../netlify/functions/lib/store.js')).end(); } catch {}

  if (failures) {
    console.error(`\nstore-wiring-test: ${failures} failure${failures === 1 ? '' : 's'}`);
    process.exit(1);
  }
  console.log('\nwiring clean');
  process.exit(0);
}

main().catch(err => {
  console.error('store-wiring-test threw:', err && err.message);
  process.exit(1);
});

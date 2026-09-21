'use strict';
/* NOSE — storage layer test.
 *
 *   node test/store-test.js        -> "store clean", or a FAIL and exit 1
 *
 * Needs a throwaway Postgres in NOSE_TEST_DB_URL. Without it the test SKIPS
 * rather than failing, so the gate sequence still runs on a fresh clone.
 *
 * NOSE_TEST_DB_URL, never NOSE_DB_URL: this test writes rows. Pointing it at
 * the live database would seed production with fixtures. If the two are set
 * to the same string the test refuses to run at all.
 *
 * Verification goes through the test's OWN connection, not through store.js,
 * so a store.js that miscounts cannot mark its own homework.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const TEST_URL = process.env.NOSE_TEST_DB_URL;

if (!TEST_URL) {
  console.log('store-test SKIPPED — no NOSE_TEST_DB_URL set.');
  console.log('  Set it to a THROWAWAY Postgres database (never the live one), then:');
  console.log('    psql "$NOSE_TEST_DB_URL" -f db/migrations/0001_nose_coa_store.sql');
  console.log('    node test/store-test.js');
  process.exit(0);
}

if (process.env.NOSE_DB_URL && process.env.NOSE_DB_URL === TEST_URL) {
  console.error('FAIL: NOSE_TEST_DB_URL is the same as NOSE_DB_URL.');
  console.error('      This test writes rows. Point it at a throwaway database.');
  process.exit(1);
}

/* store.js reads NOSE_DB_URL; aim it at the test database for this process. */
process.env.NOSE_DB_URL = TEST_URL;

const { Pool } = require('pg');
const store = require(path.resolve(__dirname, '../netlify/functions/lib/store.js'));

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  (got ${actual}, want ${expected})`}`);
}

/* Real parser output when the corpus is present — 15 keys, three of them 0,
 * which is the case that matters: a below-LOQ 0 is a reading, not an absence,
 * and must still get a row. Falls back to a small fixture so the test runs
 * before `node test/extract-dump.js` has been run. */
function sampleOutput() {
  const txt = path.resolve(__dirname, 'fixtures/extracted/KAY-CAR-001.txt');
  if (fs.existsSync(txt)) {
    const { parseCoa } = require(path.resolve(__dirname, '../netlify/functions/lib/parse-coa.js'));
    const out = parseCoa(fs.readFileSync(txt, 'utf8'));
    if (out && out.terps && Object.keys(out.terps).length) {
      console.log(`      (using real KAY-CAR-001 output: ${Object.keys(out.terps).length} keys)`);
      return out;
    }
  }
  console.log('      (KAY-CAR-001 not extracted; using inline fixture)');
  return {
    lab: 'Test Lab', strain: 'Fixture', productClass: 'vape', readBy: 'forward',
    totalTerpenes: 4.124, moisture: null, waterActivity: null, usable: true,
    rejectReasons: [], warnings: [],
    terps: { limonene: 0.822, myrcene: 0.474, ocimene: 0 }
  };
}

async function main() {
  const probe = new Pool({ connectionString: TEST_URL, max: 1 });
  const sha = crypto.randomBytes(32).toString('hex');
  let documentId = null;

  try {
    /* --- 1. the same bytes saved twice yield ONE document ----------------- */
    const args = {
      sha256: sha,
      sourceUrl: 'https://example.test/coa.pdf',
      bytes: 2048,
      text: 'EXTRACTED TEXT',
      extractorVersion: 'store-test'
    };
    const firstId = await store.saveDocument(args);
    const secondId = await store.saveDocument(args);
    documentId = firstId;

    const { rows: docRows } = await probe.query(
      'SELECT count(*)::int AS n FROM documents WHERE sha256 = $1', [sha]
    );
    check('saving the same bytes twice yields one document', docRows[0].n, 1);
    check('the second save returns the same document id', secondId, firstId);

    /* --- 2. saveParse writes one terpene row per key ---------------------- */
    const output = sampleOutput();
    const expectedKeys = Object.keys(output.terps).length;

    const parseId = await store.saveParse(documentId, 'store-test', output);

    const { rows: terpRows } = await probe.query(
      'SELECT count(*)::int AS n FROM terpene_values WHERE parse_id = $1', [parseId]
    );
    check(`saveParse writes ${expectedKeys} terpene rows`, terpRows[0].n, expectedKeys);

    /* Values must survive the round trip exactly — this is the anchor rule. */
    const { rows: ttRows } = await probe.query(
      'SELECT total_terpenes::text AS t FROM parses WHERE id = $1', [parseId]
    );
    check('total_terpenes round-trips exactly',
      ttRows[0].t, String(output.totalTerpenes));

    /* --- 3. the store refuses anything identifying a person --------------- */
    let threw = false;
    try {
      await store.saveParse(documentId, 'store-test',
        Object.assign({}, output, { palate: ['citrus', 'pine'] }));
    } catch (e) {
      threw = /never anything identifying a person/.test(e.message);
    }
    check('saveParse refuses a person-identifying field', threw, true);
  } finally {
    /* Leave nothing behind. parses and terpene_values cascade from here. */
    if (documentId != null) {
      await probe.query('DELETE FROM documents WHERE sha256 = $1', [sha]);
    }
    await probe.end();
    await store.end();
  }

  if (failures) {
    console.error(`\nstore-test: ${failures} failure${failures === 1 ? '' : 's'}`);
    process.exit(1);
  }
  console.log('\nstore clean');
}

main().catch(err => {
  console.error('store-test threw:', err.message);
  process.exit(1);
});

'use strict';
/* NOSE - the archive, tested against real Postgres semantics, in memory.
 *
 *   node test/store-test.js      -> "store clean", or FAIL lines and exit 1
 *
 * Runs on PGlite (Postgres compiled to WebAssembly): no database, no network,
 * no secrets. Applies every file in supabase/migrations in filename order, then
 * drives netlify/functions/lib/store.js through the same client seam the
 * scripts use - so what passes here is the code that runs in production.
 *
 * The assertions live in run(db), separate from the engine, so the identical
 * checks can be pointed at any Postgres that offers exec() and query().
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const store = require(path.join(ROOT, 'netlify/functions/lib/store.js'));

const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function sampleOutput() {
  const txt = path.join(ROOT, 'test/fixtures/extracted/KAY-CAR-001.txt');
  if (fs.existsSync(txt)) {
    const { parseCoa } = require(path.join(ROOT, 'netlify/functions/lib/parse-coa.js'));
    const out = parseCoa(fs.readFileSync(txt, 'utf8'));
    if (out && out.terps && Object.keys(out.terps).length) return { out, real: true };
  }
  return {
    real: false,
    out: {
      lab: 'Kaycha Labs', strain: 'Fixture', batch: 'B-1', labId: 'L-1', productClass: 'vape',
      readBy: 'multicolumn', usable: true, totalTerpenes: 4.124, moisture: null, waterActivity: null,
      rejectReasons: [], warnings: [], terps: { limonene: 0.822, myrcene: 0.474, ocimene: 0 }
    }
  };
}

function payload(overrides = {}) {
  return {
    sha256: sha('pdf-bytes-A'),
    byteSize: 2048,
    sourceUrl: 'https://lab.example/report.pdf',
    fetchedAt: '2026-09-22T14:05:09.123Z',
    extractorVersion: 'unpdf@1.8',
    text: 'EXTRACTED TEXT',
    parserVersion: 'abc1234',
    context: 'seed',
    output: { lab: 'Test Lab', totalTerpenes: 1.5, usable: true, terps: { limonene: 1 } },
    ...overrides
  };
}

async function run(db, log = console.log) {
  let failures = 0;
  const check = (label, actual, expected) => {
    const ok = Object.is(actual, expected);
    if (!ok) failures++;
    log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
  };
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const count = async (sql, params) => (await one(sql, params)).n;
  const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  const save = p => store.saveScan(p, { client: db });

  /* --- the migrations, in order ------------------------------------------ */
  const dir = path.join(ROOT, 'supabase/migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  check(`${files.length} migration(s) applied`, files.length > 0, true);

  /* --- same bytes twice -> one document ----------------------------------- */
  const a1 = await save(payload());
  const a2 = await save(payload());
  check('first save writes the document', a1.documentWritten, true);
  check('same bytes again does not', a2.documentWritten, false);
  check('...and returns the same document id', a2.documentId, a1.documentId);
  check('one document row', await count('select count(*)::int as n from nose.documents'), 1);

  /* --- same output twice -> one parse ------------------------------------- */
  check('same output again writes no parse', a2.parseWritten, false);
  check('one parse row', await count('select count(*)::int as n from nose.parses'), 1);

  const reordered = await save(payload({ output: { usable: true, terps: { limonene: 1 }, totalTerpenes: 1.5, lab: 'Test Lab' } }));
  check('same output with keys reordered writes no parse', reordered.parseWritten, false);

  /* --- A -> B -> A -> three parses, A latest ------------------------------ */
  const outA = { lab: 'Test Lab', totalTerpenes: 1.5, usable: true, terps: { limonene: 1 } };
  const outB = { lab: 'Test Lab', totalTerpenes: 1.7, usable: true, terps: { limonene: 1.2 } };
  await save(payload({ output: outB, context: 'reparse' }));
  const back = await save(payload({ output: outA, context: 'reparse' }));
  check('A -> B -> A writes the reverted parse', back.parseWritten, true);
  check('A -> B -> A leaves three parses', await count('select count(*)::int as n from nose.parses'), 3);
  const latest = await one('select total_terpenes::text as t from nose.parses where extraction_id = $1 order by id desc limit 1', [back.extractionId]);
  check('the latest parse is A again', latest.t, '1.5');

  /* --- generated columns equal the output --------------------------------- */
  const { out: real, real: isReal } = sampleOutput();
  log(`      (generated-column check uses ${isReal ? 'real KAY-CAR-001 parser output' : 'an inline fixture'})`);
  const r = await save(payload({ sha256: sha('pdf-bytes-real'), text: 'REAL TEXT', output: real }));
  const row = await one(
    `select lab, strain, batch, lab_id, product_class, read_by, usable,
            total_terpenes::text as total, moisture::text as moisture, water_activity::text as aw
       from nose.parses where id = $1`, [r.parseId]);
  const num = v => (typeof v === 'number' ? String(v) : null);
  check('lab column equals output', row.lab, real.lab ?? null);
  check('strain column equals output', row.strain, real.strain ?? null);
  check('batch column equals output', row.batch, real.batch ?? null);
  check('lab_id column equals output', row.lab_id, real.labId ?? null);
  check('product_class column equals output', row.product_class, real.productClass ?? null);
  check('read_by column equals output', row.read_by, real.readBy ?? null);
  check('usable column equals output', row.usable, typeof real.usable === 'boolean' ? real.usable : null);
  check('total_terpenes column equals output exactly', row.total, num(real.totalTerpenes));
  check('moisture column equals output', row.moisture, num(real.moisture));
  check('water_activity column equals output', row.aw, num(real.waterActivity));

  /* --- the view: one row per terpene -------------------------------------- */
  const keys = Object.keys(real.terps);
  check(`view gives ${keys.length} rows for ${keys.length} terpenes`,
    await count('select count(*)::int as n from nose.terpene_values where parse_id = $1', [r.parseId]), keys.length);
  const mismatched = [];
  for (const k of keys) {
    const v = await one('select value::text as v from nose.terpene_values where parse_id = $1 and key = $2', [r.parseId, k]);
    if (!v || v.v !== String(real.terps[k])) mismatched.push(k);
  }
  check('every view value equals the output value', mismatched.join(',') || 'none', 'none');

  /* --- text the database would otherwise reject --------------------------- */
  const nul = await save(payload({ sha256: sha('nul'), text: 'A\u0000B\u0000C', output: { lab: 'N\u0000UL' } }));
  check('a NUL in the text still saves', nul.extractionWritten, true);
  const stored = await one('select text from nose.extractions where id = $1', [nul.extractionId]);
  check('...and is stripped from what is stored', stored.text, 'ABC');
  const sur = await save(payload({ sha256: sha('surrogate'), text: 'bad \uD800 pair', output: { lab: 'x' } }));
  check('a lone surrogate in the text still saves', sur.extractionWritten, true);

  /* --- nothing that identifies a person ----------------------------------- */
  const beforeParses = await count('select count(*)::int as n from nose.parses');
  const jsRefusal = await rejects(() => save(payload({ sha256: sha('p1'), output: { lab: 'x', meta: { deep: { palate: ['citrus'] } } } })));
  check('JS refuses a person field at depth', jsRefusal && /refusing to store "palate"/.test(jsRefusal.message), true);
  check('...without sending anything', await count('select count(*)::int as n from nose.parses'), beforeParses);

  const dbGaps = [];
  for (const key of store.PERSONAL_KEYS) {
    const raw = JSON.stringify({ ...payload({ sha256: sha('raw-' + key) }), output: { lab: 'x', nested: { [key.toUpperCase()]: 'v' } } });
    const err = await rejects(() => db.query('select nose.save_scan($1::jsonb)', [raw]));
    if (!err || !/identifies a person/.test(err.message)) dbGaps.push(key);
  }
  check(`the DATABASE refuses all ${store.PERSONAL_KEYS.length} person keys with JS bypassed`, dbGaps.join(',') || 'none', 'none');

  const extras = [];
  const spy = { query: async (text, params) => { extras.push(JSON.parse(params[0])); return db.query(text, params); } };
  await store.saveScan({ ...payload({ sha256: sha('extras') }), ip: '203.0.113.9', outputHash: 'caller-supplied' }, { client: spy });
  check('a top-level ip on the payload is never sent', 'ip' in extras[0], false);
  check('a caller-supplied outputHash is never sent', 'outputHash' in extras[0], false);

  /* --- dates, not times --------------------------------------------------- */
  const day = await one('select first_fetched_on::text as d, pg_typeof(first_fetched_on)::text as t from nose.documents where id = $1', [a1.documentId]);
  check('a full timestamp keeps only the day', day.d, '2026-09-22');
  check('...in a date column', day.t, 'date');

  const iso = await save(payload({ sha256: sha('iso'), output: { harvestOn: '2025-07-07', reportOn: '07/07/25' } }));
  const dates = await one('select harvest_on, report_on from nose.parses where id = $1', [iso.parseId]);
  check('an ISO harvestOn is kept', dates.harvest_on, '2025-07-07');
  check('a lab-format date is left NULL, not stored wrong', dates.report_on, null);

  /* --- reparse_runs: a run is on record even when it changed nothing ------ */
  const lastDoc = (await one('select max(id)::int as n from nose.documents')).n;
  const RUN_SQL = `insert into nose.reparse_runs
      (mode, parser_version, extractor_version, documents, last_document_id, unchanged, values_changed,
       accepted_to_rejected, rejected_to_accepted, failed, new_texts, no_pdf)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      returning id, run_on::text as day, pg_typeof(run_on)::text as t,
                ((now() at time zone 'UTC')::date)::text as utc_day`;
  const run1 = { mode: 'reparse', parser: 'abc1234', extractor: null, documents: 5, last: lastDoc,
                 unchanged: 5, changed: 0, a2r: 0, r2a: 0, failed: 0, newTexts: 0, noPdf: 0 };
  const insertRun = r => db.query(RUN_SQL, [r.mode, r.parser, r.extractor, r.documents, r.last, r.unchanged,
                                             r.changed, r.a2r, r.r2a, r.failed, r.newTexts, r.noPdf]);
  const refusedBy = async (r, constraint) => {
    const e = await rejects(() => insertRun(r));
    return !!e && e.message.includes(constraint);
  };
  /* UTC+14 and UTC-12, written as POSIX specs so no tz database is needed: at
     any hour, at least one of them is on a different day from UTC. */
  const runDays = [];
  let zonesSet = true;
  for (const zone of ['<+14>-14', '<-12>+12']) {
    try { await db.exec(`set timezone = '${zone}'`); }
    catch { zonesSet = false; }
    try { runDays.push((await insertRun(run1)).rows[0]); }
    finally { await db.exec('reset timezone'); }
  }
  const runRow = runDays[0];
  check('a run that changed nothing is recorded', runRow.id != null, true);
  if (!zonesSet) log('skip  other session timezones - this engine cannot set them, so the next check proves less');
  check('...on the UTC day, whatever the session timezone',
    runDays.every(r => r.day === r.utc_day) ? 'utc' : JSON.stringify(runDays), 'utc');
  check('...in a date column', runRow.t, 'date');
  const rx = (await insertRun({ ...run1, mode: 'reextract', extractor: '0123456789ab', unchanged: 2, changed: 1,
                                a2r: 1, r2a: 0, failed: 1, newTexts: 2, noPdf: 1 })).rows[0];
  check('a re-extract run with its extractor is recorded', !!rx.id, true);
  check('counts that do not add up are refused',
    await refusedBy({ ...run1, unchanged: 4 }, 'every_document_counted_once'), true);
  check('a dev parser version is refused', await refusedBy({ ...run1, parser: 'dev' }, 'parser_version_check'), true);
  check('a plain reparse claiming an extractor is refused',
    await refusedBy({ ...run1, extractor: '0123456789ab' }, 'extractor_only_when_reextracting'), true);
  check('a re-extract without its extractor is refused',
    await refusedBy({ ...run1, mode: 'reextract' }, 'extractor_only_when_reextracting'), true);
  check('a plain reparse claiming new texts is refused',
    await refusedBy({ ...run1, newTexts: 1 }, 'texts_only_when_reextracting'), true);
  check('documents walked with no last document is refused',
    await refusedBy({ ...run1, last: null }, 'last_document_when_any'), true);
  const noDoc = await rejects(() => insertRun({ ...run1, last: lastDoc + 1000 }));
  check('a last document that does not exist is refused', !!noDoc && /foreign key/.test(noDoc.message), true);
  check('an empty archive records no last document',
    !!(await insertRun({ ...run1, documents: 0, last: null, unchanged: 0 })).rows[0].id, true);

  /* --- privileges, as the roles themselves -------------------------------- */
  let canSetRole = true;
  try { await db.exec('set role nose_writer'); await db.exec('reset role'); }
  catch { canSetRole = false; }

  if (!canSetRole) {
    log('skip  role checks - this engine cannot SET ROLE; scripts/probe-db.js covers them on the real project');
  } else {
    await db.exec('set role nose_writer');
    try {
      const w = await save(payload({ sha256: sha('as-writer'), output: { lab: 'written as nose_writer' } }));
      check('nose_writer can save through save_scan', w.parseWritten, true);
      const wr = await rejects(() => insertRun(run1));
      check('nose_writer can record a run', wr ? wr.message : 'recorded', 'recorded');
      /* An ordinary column per table: updating an identity or generated column
       * fails for that reason before the privilege check runs, which would
       * pass this test for the wrong reason. */
      const plainColumn = { documents: 'byte_size', extractions: 'extractor_version', parses: 'context', reparse_runs: 'failed' };
      for (const t of ['documents', 'extractions', 'parses', 'reparse_runs']) {
        for (const [verb, sql] of [
          ['UPDATE',   `update nose.${t} set ${plainColumn[t]} = ${plainColumn[t]} where false`],
          ['DELETE',   `delete from nose.${t} where false`],
          ['TRUNCATE', `truncate nose.${t}`]
        ]) {
          const e = await rejects(() => db.query(sql));
          check(`nose_writer cannot ${verb} ${t}`, !!e && /permission denied/.test(e.message), true);
        }
      }
    } finally {
      await db.exec('reset role');
    }

    await db.exec('create role nose_test_nobody nologin');
    await db.exec('set role nose_test_nobody');
    try {
      const sel = await rejects(() => db.query('select count(*) from nose.parses'));
      check('a role with no grants cannot read the archive', !!sel && /permission denied/.test(sel.message), true);
      const runs = await rejects(() => db.query('select count(*) from nose.reparse_runs'));
      check('...nor the record of runs', !!runs && /permission denied/.test(runs.message), true);
      const ex = await rejects(() => db.query('select nose.save_scan($1::jsonb)', [JSON.stringify(payload())]));
      check('a role with no grants cannot call save_scan', !!ex && /permission denied/.test(ex.message), true);
    } finally {
      await db.exec('reset role');
    }
  }

  /* --- the connection rules, no database needed --------------------------- */
  const ssl = await rejects(async () => store._checkUrl('postgresql://h:6543/postgres?sslmode=require'));
  check('a URL containing sslmode is refused', !!ssl && /sslmode/.test(ssl.message), true);
  const unset = await rejects(async () => store._checkUrl(undefined));
  check('an unset NOSE_DB_URL is refused plainly', !!unset && /not set/.test(unset.message), true);

  return failures;
}

async function main() {
  let PGlite;
  try { ({ PGlite } = await import('@electric-sql/pglite')); }
  catch {
    console.error('FAIL: @electric-sql/pglite is not installed - run: npm install --save-dev @electric-sql/pglite');
    process.exit(1);
  }
  const pg = new PGlite();
  const db = { exec: sql => pg.exec(sql), query: (sql, params) => pg.query(sql, params) };
  let failures;
  try { failures = await run(db); }
  catch (e) { console.error('store-test threw:', e && e.message); process.exit(1); }
  finally { await pg.close(); }
  if (failures) {
    console.error(`\nstore-test: ${failures} failure${failures === 1 ? '' : 's'}`);
    process.exit(1);
  }
  console.log('\nstore clean');
}

module.exports = { run };
if (require.main === module) main();

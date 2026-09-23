'use strict';
/* NOSE - the analysis layer, against real Postgres semantics, offline.
 *
 *   node test/analysis-test.js      -> "analysis clean", or FAIL lines and exit 1
 *
 * Saves readings through store.js exactly as a scan, the seed and a reparse
 * do, on PGlite with every migration applied, then checks the two views of
 * supabase/migrations/20260923170000_nose_analysis_views.sql:
 *
 *   latest_parses   one row per document: the latest parse of its newest
 *                   extraction, as reparse.js and review-queue.js read it
 *   batch_series    usable latest readings, with the strain key and the
 *                   batch date (harvest, else report)
 *
 * and that both are read-only and security_invoker. As in the other PGlite
 * tests, the assertions live in run(db).
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const store = require(path.join(ROOT, 'netlify/functions/lib/store.js'));

const sha = s => crypto.createHash('sha256').update(s).digest('hex');

/* A usable reading, as the parser shapes one. */
const reading = (extra = {}) => ({
  lab: 'Kaycha Labs', strain: 'Banana Papaya', batch: 'B-1', client: null, productClass: 'flower',
  readBy: 'forward', usable: true, totalTerpenes: 2, terps: { limonene: 1, myrcene: 0.6, caryophyllene: 0.4 },
  measuredCoverage: 1, warnings: [], rejectReasons: [], novelty: [], harvestOn: null, reportOn: null, ...extra
});

async function run(db, log = console.log) {
  let failures = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
  };
  const rows = async (sql, params) => (await db.query(sql, params)).rows;
  const rejects = async fn => { try { await fn(); return null; } catch (e) { return e; } };

  const dir = path.join(ROOT, 'supabase/migrations');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  }

  const save = (name, output, { text = `text of ${name}`, context = 'seed', day = '2026-09-20' } = {}) =>
    store.saveScan({ sha256: sha(name), byteSize: 1000, sourceUrl: null, fetchedAt: `${day}T12:00:00Z`,
                     extractorVersion: 'x1', text, parserVersion: 'abc1234', context, output }, { client: db });

  /* ======================================================= the two views */

  /* One document per case, oldest first. */
  await save('harvest', reading({ strain: '(I) Banana Papaya', harvestOn: '2026-01-10', reportOn: '2026-01-20' }));
  await save('report', reading({ strain: '  banana   PAPAYA ', batch: 'B-2', reportOn: '2026-03-05' }));
  await save('undated', reading({ strain: 'Banana Papaya', batch: 'B-3' }));
  await save('refused', reading({ batch: 'B-4', usable: false, rejectReasons: ['only 1 terpene found'], harvestOn: '2026-02-01' }));
  await save('no verdict', (({ usable, ...o }) => o)(reading({ batch: 'B-5' })));
  /* A -> B -> A on one extraction: the latest is A again, the third row. */
  const A = reading({ strain: 'GMO', batch: 'G-1', harvestOn: '2026-04-01' });
  const B = reading({ strain: 'GMO', batch: 'G-1', harvestOn: '2026-04-01', totalTerpenes: 3 });
  await save('aba', A); await save('aba', B, { context: 'reparse' }); await save('aba', A, { context: 'reparse' });
  /* Two extractions: the newer text's reading is the latest, even though the
     older text is parsed again afterwards. */
  await save('two texts', reading({ strain: 'Old Text', batch: 'T-1' }), { text: 'first text' });
  await save('two texts', reading({ strain: 'New Text', batch: 'T-1' }), { text: 'second text', context: 'reparse' });
  await save('two texts', reading({ strain: 'Old Text again', batch: 'T-1' }), { text: 'first text', context: 'reparse' });
  /* A real report, read by today's parser. */
  const acsText = path.join(ROOT, 'test/fixtures/extracted/ACS-FLW-002.txt');
  const { parseCoa } = require(path.join(ROOT, 'netlify/functions/lib/parse-coa.js'));
  const acs = parseCoa(fs.readFileSync(acsText, 'utf8'));
  await save('ACS-FLW-002', acs, { text: fs.readFileSync(acsText, 'utf8') });

  const latest = await rows(`
    select l.document_id::text as doc, l.parse_id::text as parse, l.strain, l.usable, l.total_terpenes::float8 as total
      from nose.latest_parses l order by l.document_id`);
  const docs = (await rows('select count(*)::int as n from nose.documents'))[0].n;
  check('latest_parses: one row per document', [latest.length, new Set(latest.map(r => r.doc)).size], [docs, docs]);

  const parseIdsOf = async name => (await rows(`
    select p.id::text as id from nose.parses p join nose.extractions x on x.id = p.extraction_id
      join nose.documents d on d.id = x.document_id where d.sha256 = $1 order by p.id`, [sha(name)])).map(r => r.id);
  const latestOf = async name => (await rows(`
    select parse_id::text as parse, strain, total_terpenes::float8 as total from nose.latest_parses where sha256 = $1`, [sha(name)]))[0];
  const aba = await parseIdsOf('aba');
  check('A -> B -> A keeps three parses; the latest is the third, A again',
    [aba.length, (await latestOf('aba')).parse, (await latestOf('aba')).total], [3, aba[2], 2]);
  const two = await latestOf('two texts');
  check('two extractions: the latest parse of the NEWEST extraction, as reparse.js reads it',
    two.strain, 'New Text');
  check('...not the highest parse id, which here belongs to the older text',
    (await parseIdsOf('two texts')).slice(-1)[0] === two.parse, false);

  const series = await rows(`
    select lab, client, strain_key, batch, batch_date, total_terpenes::float8 as total, parse_id::text as parse
      from nose.batch_series order by parse_id`);
  const byBatch = Object.fromEntries(series.map(r => [r.batch, r]));
  check('batch_series: usable latest readings only - not the refused one, not one without a verdict',
    series.map(r => r.batch).sort(), ['1006 1837 9110 9527', 'B-1', 'B-2', 'B-3', 'G-1', 'T-1']);
  check('the strain key: lowercase, whitespace collapsed, a leading (I) dropped',
    ['B-1', 'B-2', 'B-3'].map(b => byBatch[b].strain_key), ['banana papaya', 'banana papaya', 'banana papaya']);
  check('batch_date: harvest when printed, else report, else null',
    ['B-1', 'B-2', 'B-3'].map(b => byBatch[b].batch_date), ['2026-01-10', '2026-03-05', null]);
  check('each row names its parse: the one latest_parses stands by',
    series.every(r => latest.some(l => l.parse === r.parse)), true);
  check('a real report: ACS-FLW-002 dated by its printed harvest day, its total as read',
    [byBatch['1006 1837 9110 9527'].strain_key, byBatch['1006 1837 9110 9527'].batch_date, byBatch['1006 1837 9110 9527'].total],
    ['sfv og', '2026-04-03', 2.008]);

  const key = async s => (await rows('select nose.strain_key($1::text) as k', [s]))[0].k;
  check('strain_key: markers (I) (S) (H) in any case, and nothing else',
    [await key('(S) Ocifer'), await key('(h)GMO'), await key(' (I)  Gelato  de   Limon '), await key('GMO #2'),
     await key('Gelato (I)'), await key('( I ) X'), await key('(X) Y'), await key('(H)'), await key('   '), await key(null)],
    ['ocifer', 'gmo', 'gelato de limon', 'gmo #2', 'gelato (i)', '( i ) x', '(x) y', null, null, null]);

  check('batch_series has exactly the columns asked for',
    (await rows(`select column_name from information_schema.columns
                  where table_schema = 'nose' and table_name = 'batch_series' order by ordinal_position`)).map(r => r.column_name),
    ['lab', 'client', 'strain_key', 'batch', 'batch_date', 'total_terpenes', 'parse_id']);
  check('latest_parses carries neither the address nor the text',
    (await rows(`select column_name from information_schema.columns
                  where table_schema = 'nose' and table_name = 'latest_parses'
                    and column_name in ('first_source_url', 'text', 'text_sha256')`)).length, 0);
  check('both views are security_invoker',
    (await rows(`select c.relname, c.reloptions::text as o from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'nose' and c.relname in ('latest_parses', 'batch_series') order by 1`))
      .map(r => [r.relname, /security_invoker=true/.test(r.o)]),
    [['batch_series', true], ['latest_parses', true]]);

  /* As nose_writer: it reads both, writes neither, and runs the key. */
  await db.exec('set role nose_writer');
  try {
    const n = (await rows('select count(*)::int as n from nose.batch_series'))[0].n;
    const can = (await rows(`
      select has_table_privilege('nose.latest_parses', 'SELECT') as read_latest,
             has_table_privilege('nose.batch_series', 'SELECT') as read_series,
             has_table_privilege('nose.latest_parses', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as write_latest,
             has_table_privilege('nose.batch_series', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as write_series,
             has_function_privilege('nose.strain_key(text)', 'EXECUTE') as run_key`))[0];
    check('nose_writer reads both views, writes neither, runs strain_key',
      [n, can.read_latest, can.read_series, can.write_latest, can.write_series, can.run_key], [series.length, true, true, false, false, true]);
  } finally {
    await db.exec('reset role');
  }
  /* security_invoker in practice: a role granted the views alone reaches
     nothing, because the tables underneath are read as that role. */
  await db.exec(`create role nose_test_viewer nologin;
                 grant usage on schema nose to nose_test_viewer;
                 grant select on nose.latest_parses, nose.batch_series to nose_test_viewer;
                 grant execute on function nose.strain_key(text) to nose_test_viewer`);
  await db.exec('set role nose_test_viewer');
  let refused;
  try { refused = await rejects(() => db.query('select count(*) from nose.batch_series')); }
  finally { await db.exec('reset role'); }
  check('a role holding only the views is refused by the tables beneath them',
    [refused && refused.code, refused && /permission denied for table/.test(refused.message)], ['42501', true]);
  await db.exec('drop owned by nose_test_viewer; drop role nose_test_viewer');
  check('PUBLIC executes no nose function, strain_key included',
    (await rows(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'nose'
                    and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) g where g.grantee = 0))`))[0].n, 0);

  return failures;
}

async function main() {
  let PGlite;
  try { ({ PGlite } = await import('@electric-sql/pglite')); }
  catch {
    console.error('FAIL: @electric-sql/pglite is not installed - run: npm install');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(ROOT, 'test/fixtures/extracted'))) {
    console.error('FAIL: test/fixtures/extracted is missing - run: node test/extract-dump.js');
    process.exit(1);
  }
  const pg = new PGlite();
  const db = { exec: sql => pg.exec(sql), query: (sql, params) => pg.query(sql, params) };
  let failures;
  try { failures = await run(db); }
  catch (e) { console.error('analysis-test threw:', e && e.stack); await pg.close(); process.exit(1); }
  await pg.close();
  if (failures) {
    console.error(`\nanalysis-test: ${failures} failure${failures === 1 ? '' : 's'}`);
    process.exit(1);
  }
  console.log('\nanalysis clean');
}

module.exports = { run };
if (require.main === module) main();

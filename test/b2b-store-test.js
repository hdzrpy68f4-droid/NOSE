'use strict';
/* NOSE - the dispensary (B2B) store: schema b2b, role nose_b2b, the store
 * layer, its switch and its admin script, against real Postgres semantics,
 * offline. PARSER-HANDOFF s14.
 *
 *   node test/b2b-store-test.js      -> "b2b-store clean", or FAIL lines and exit 1
 *
 * On PGlite, every migration applied in filename order - the b2b one after
 * every migration the archive was built with, which are pinned byte for byte
 * - then:
 *
 *   - the schema: exactly the four tables and their columns, no column for a
 *     shopper, a purchase or an order, days never times, the person check on
 *     every jsonb column and the person trigger on every table, nothing that
 *     joins b2b to nose
 *   - three lists, one rule: PERSONAL_KEYS, nose.holds_no_person() and
 *     b2b.holds_no_person() name the same keys, and the two bodies are
 *     byte-identical; JS and the database agree on every key tried, both ways
 *   - a personal key at any depth refused in both layers, with the text of
 *     each refusal asserted, nothing sent and nothing written
 *   - the roles: nose_b2b upserts batches and readings, and cannot DELETE,
 *     TRUNCATE, make a store or a key, or reach schema nose; nose_writer
 *     cannot reach b2b; nose_writer's grants are exactly as before
 *   - probe-db.js's b2b audit passes here, and fails on each broken grant
 *   - values only for an accepted reading: every fixture's parser output
 *     stored as read, KAY-CAR-001 4.124 exactly; a refusal keeps no figure
 *   - coa_url: the whole link without its "#" part
 *   - keys: 32 random bytes behind nsk_ / npk_, only the SHA-256 stored
 *   - scripts/b2b-store.js: create, add-origin, rotate-keys, revoke,
 *     delete-store - keys printed once and kept nowhere, a dry run that
 *     changes nothing, refused as nose_b2b
 *   - lib/b2b-store.js's connection: a no-op without NOSE_B2B_DB_URL, bounded,
 *     TLS as store.js configures it, errors scrubbed, a fixed field list
 *   - lib/b2b-flag.js: on only for B2B_ENABLED=1 on a production build
 *   - check-published.js: an nsk_ key fails the build, tracked or published
 *
 * No key is written in this file: every one is made when the test runs.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify/functions/lib');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const B2B_MIGRATION = '20261008020000_nose_b2b.sql';

/* Every migration applied before this one, as applied - and this one, as
   committed for its first push. An applied migration is never edited:
   change any of them in a new file. */
const PINNED = Object.freeze({
  '20260922180000_nose_archive.sql': '75c80693f207a883cb037d1f7e0f3b427b15a83d9a6fa5a3aedba1e1ba61351e',
  '20260923140000_nose_reparse_runs.sql': 'c73401d99c164fcde5b555fee365ec23ad3b87be26a7103c2d750a8e3d9369f7',
  '20260923170000_nose_analysis_views.sql': 'dc926ac589c46166cd255ebeae37e41e14fd16c3a3dd67e4d07b88eb362c001c',
  '20261002180000_nose_one_document_per_text.sql': '85bf04d6957c67de67cbcd658940350976937ebbf18db15683b6601ebb20ce5f',
  '20261002230000_nose_removals_and_cap.sql': '42a8ea14d0a486b11030e095f2252fe76932133786b4e49ef43abe803a72b85c',
  [B2B_MIGRATION]: '1ab2c8194e3bbf475aa3c226e4360d9adfa4dd5a9c7bc6c884b62797e15c51e2'
});

const pgLoaded = () => Object.keys(require.cache).some(k => /[\\/]node_modules[\\/]pg[\\/]/.test(k));

const store = require(path.join(LIB, 'store.js'));
const b2b = require(path.join(LIB, 'b2b-store.js'));
const { b2bEnabled } = require(path.join(LIB, 'b2b-flag.js'));
const version = require(path.join(LIB, 'version.js'));
const admin = require(path.join(ROOT, 'scripts/b2b-store.js'));
const probe = require(path.join(ROOT, 'scripts/probe-db.js'));
const { b2bUrl } = require(path.join(ROOT, 'scripts/set-b2b-password.js'));
const { looksPersonal, readCatalog } = require(path.join(ROOT, 'scripts/b2b-coverage.js'));
const { parseCoa } = require(path.join(LIB, 'parse-coa.js'));

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const EFFECT_WORDS = /\b(effects?|high|stoned|buzz\w*|relax\w*|energ\w*|calm\w*|focus\w*|sleep\w*|sedat\w*|uplift\w*|euphori\w*|mood\w*|potency|potent|strong(?:er)? hit)\b/i;
const PERSON_REFUSED = 'b2b: a field that identifies a person - refused, nothing written';
const jsRefusal = (call, key) => `${call}: refusing "${key}" - dispensary records hold nothing about a person`;
const today = () => new Date().toISOString().slice(0, 10);
const tick = () => new Promise(r => setImmediate(r));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* A fake address for NOSE_B2B_DB_URL, built so that no password-bearing URL is
   ever written in this file (check-published.js refuses one in git). */
function fakeB2bUrl() {
  const u = new URL('postgresql://aws-0-us-east-1.pooler.supabase.com');
  u.username = 'nose_b2b.abcdefghijklmnopqrst';
  u.password = 'not-a-real-password';
  u.port = '6543';
  u.pathname = '/postgres';
  return u.toString();
}

async function run(db, log = console.log) {
  let failures = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
  };
  const rows = async (sql, params) => (await db.query(sql, params)).rows;
  const one = async (sql, params) => (await rows(sql, params))[0];
  const count = async (sql, params) => (await one(sql, params)).n;
  const rejects = async fn => { try { await fn(); return null; } catch (e) { return e; } };
  const asRole = async (role, fn) => {
    await db.exec(`set role ${role}`);
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  const client = { query: (sql, params) => db.query(sql, params) };
  const errText = e => (e ? `${e.code || ''} ${e.message}`.trim() : 'no error');

  /* ===================================================== the migrations */

  const files = fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();
  check('the b2b migration exists, and sorts after every migration the archive was built with',
    [files.includes(B2B_MIGRATION), Object.keys(PINNED).filter(f => f !== B2B_MIGRATION).every(f => f < B2B_MIGRATION)], [true, true]);
  check('every applied migration is byte-identical to the one pushed - and this one to its first push',
    Object.keys(PINNED).map(f => [f, fs.existsSync(path.join(MIGRATIONS, f)) ? sha(fs.readFileSync(path.join(MIGRATIONS, f))) : 'missing']),
    Object.entries(PINNED));

  const SNAPSHOT_SQL = `
    select 'relation' as k, c.relname as name, coalesce(c.relacl::text, '') as acl
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'nose'
    union all
    select 'function', p.oid::regprocedure::text, coalesce(p.proacl::text, '')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'nose'
    union all
    select 'schema', n.nspname, coalesce(n.nspacl::text, '') from pg_namespace n where n.nspname = 'nose'
    union all
    select 'default', coalesce(n.nspname, '(all)') || ' ' || d.defaclobjtype::text, d.defaclacl::text
      from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
    union all
    select 'role', r.rolname, concat_ws(',', r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls)
      from pg_roles r where r.rolname = 'nose_writer'
    order by 1, 2`;
  for (const f of files.filter(f => f < B2B_MIGRATION)) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  const before = await rows(SNAPSHOT_SQL);
  for (const f of files.filter(f => f >= B2B_MIGRATION)) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  check(`${files.length} migrations applied, in filename order`, files.length >= 6, true);
  check('nose_writer\'s grants - and every grant and default privilege in schema nose - are exactly as before the b2b migration',
    await rows(SNAPSHOT_SQL), before);

  /* ========================================================= the schema */

  check('schema b2b holds exactly four tables and no view',
    (await rows(`select table_name as t, table_type as k from information_schema.tables where table_schema = 'b2b' order by 1`))
      .map(r => `${r.t} ${r.k}`),
    ['batch_reads BASE TABLE', 'batches BASE TABLE', 'store_keys BASE TABLE', 'stores BASE TABLE']);
  const columns = async t => (await rows(`select column_name as c from information_schema.columns
                                            where table_schema = 'b2b' and table_name = $1 order by ordinal_position`, [t])).map(r => r.c);
  check('stores: id, slug, display_name, allowed_origins, window_months, the guardrail, created_on', await columns('stores'),
    ['id', 'slug', 'display_name', 'allowed_origins', 'window_months', 'guardrail_thc_points', 'guardrail_cbd_points', 'created_on']);
  check('store_keys: store_id, kind, key_sha256, created_on, revoked_on - a hash, never the key', await columns('store_keys'),
    ['store_id', 'kind', 'key_sha256', 'created_on', 'revoked_on']);
  check('batches: the catalog\'s columns, list_position and the two listing days', await columns('batches'),
    ['store_id', 'batch_id', 'product_id', 'list_position', 'category', 'route', 'name', 'brand', 'coa_url', 'product_url',
     'in_stock', 'thc_percent', 'cbd_percent', 'first_listed_on', 'last_listed_on']);
  /* The last five since 20261008150000_nose_b2b_read_source.sql (Prompt 3,
     PARSER-HANDOFF s14): the link a reading came from, whether it gave a
     report, the report's batch and lab ID, and whether its layout was new. */
  check('batch_reads: one current reading - what the parser read, the day, and where it came from', await columns('batch_reads'),
    ['store_id', 'batch_id', 'read_on', 'lab', 'product_class', 'usable', 'reject_reasons', 'terps', 'total_terpenes',
     'moisture', 'water_activity', 'harvest_on', 'report_on', 'read_by', 'warnings',
     'read_url', 'fetched', 'report_batch', 'report_lab_id', 'new_layout']);
  const allColumns = (await rows(`select table_name || '.' || column_name as c, column_name as name, data_type as t
                                    from information_schema.columns where table_schema = 'b2b' order by 1`));
  check('no column for a person, a shopper, a purchase or an order, anywhere in b2b',
    allColumns.filter(c => looksPersonal(c.name) || /shopper|purchase|order|buyer|visitor|cart|checkout|contact/i.test(c.name)).map(c => c.c), []);
  check('days, never times: no b2b column holds a time of day',
    allColumns.filter(c => /time|interval/.test(c.t)).map(c => c.c), []);
  check('...and every day is a date column',
    allColumns.filter(c => /_on$/.test(c.name)).map(c => `${c.c} ${c.t}`),
    ['batch_reads.harvest_on date', 'batch_reads.read_on date', 'batch_reads.report_on date', 'batches.first_listed_on date',
     'batches.last_listed_on date', 'store_keys.created_on date', 'store_keys.revoked_on date', 'stores.created_on date']);
  const jsonb = await rows(`
    select c.table_name || '.' || c.column_name as col,
           exists (select 1 from pg_constraint k join pg_class t on t.oid = k.conrelid join pg_namespace n on n.oid = t.relnamespace
                    where n.nspname = 'b2b' and t.relname = c.table_name and k.contype = 'c'
                      and pg_get_constraintdef(k.oid) like '%b2b.holds_no_person(' || c.column_name || ')%') as checked
      from information_schema.columns c where c.table_schema = 'b2b' and c.data_type = 'jsonb' order by 1`);
  check('holds_no_person() is a CHECK on every jsonb column in b2b (there is one: the terpenes)',
    jsonb.map(r => [r.col, r.checked]), [['batch_reads.terps', true]]);
  check('every b2b table runs the person check on every row first: BEFORE INSERT OR UPDATE, FOR EACH ROW',
    (await rows(`select c.relname as t, t.tgtype as type from pg_trigger t join pg_class c on c.oid = t.tgrelid
                   join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
                  where n.nspname = 'b2b' and not t.tgisinternal and p.proname = 'refuse_personal_fields' order by 1`))
      .map(r => [r.t, r.type]),
    [['batch_reads', 23], ['batches', 23], ['store_keys', 23], ['stores', 23]]);
  check('nothing joins the two schemas: no foreign key across them, no function of one naming the other',
    [await count(`select count(*)::int as n from pg_constraint k
                    join pg_class a on a.oid = k.conrelid join pg_namespace na on na.oid = a.relnamespace
                    join pg_class b on b.oid = k.confrelid join pg_namespace nb on nb.oid = b.relnamespace
                   where k.contype = 'f' and na.nspname <> nb.nspname and 'b2b' in (na.nspname, nb.nspname)`),
     (await rows(`select n.nspname || '.' || p.proname as f, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname in ('nose', 'b2b')`))
       .filter(r => (r.f.startsWith('b2b.') && /\bnose\./.test(r.prosrc)) || (r.f.startsWith('nose.') && /\bb2b\./.test(r.prosrc))).map(r => r.f)],
    [0, []]);
  check('schema b2b is not public, and PUBLIC may not use it',
    [await count(`select count(*)::int as n from pg_namespace where nspname = 'b2b'`),
     (await one(`select has_schema_privilege('public', 'b2b', 'USAGE') as u`)).u], [1, false]);

  /* ===================================== three lists, one rule, both ways */

  const keysIn = src => [...src.match(/ARRAY\[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const fn = sig => one(`select prosrc, provolatile::text as v, proisstrict as strict, proparallel::text as par,
                                proconfig::text as config from pg_proc where oid = $1::regprocedure`, [sig]);
  const nf = await fn('nose.holds_no_person(jsonb)');
  const bf = await fn('b2b.holds_no_person(jsonb)');
  check(`three lists, one rule: PERSONAL_KEYS, nose.holds_no_person() and b2b.holds_no_person() name the same ${store.PERSONAL_KEYS.length} keys in the same order`,
    [keysIn(nf.prosrc), keysIn(bf.prosrc)], [store.PERSONAL_KEYS, store.PERSONAL_KEYS]);
  check('...the two function bodies are byte-identical', bf.prosrc === nf.prosrc, true);
  check('...as are their attributes: immutable, strict, parallel safe, empty search_path',
    [bf.v, bf.strict, bf.par, bf.config], [nf.v, nf.strict, nf.par, nf.config]);
  check('...and lib/b2b-store.js refuses by store.js\'s own list, not a copy', b2b.PERSONAL_KEYS === store.PERSONAL_KEYS, true);

  const dbHolds = async doc => (await one('select b2b.holds_no_person($1::jsonb) as ok', [JSON.stringify(doc)])).ok;
  const jsHolds = doc => store._findPersonalKey(doc) === null;
  const depths = k => [{ [k]: 1 }, { a: { [k]: 1 } }, { a: { b: { c: { [k]: 'x' } } } }, { list: [1, { [k]: null }] }, [{ x: [{ [k]: [] }] }]];
  const missedByDb = [];
  for (const k of store.PERSONAL_KEYS) {
    for (const key of [k, k.toUpperCase(), k[0].toUpperCase() + k.slice(1)]) {
      for (const doc of depths(key)) if (await dbHolds(doc) !== false) missedByDb.push(`${key} in ${JSON.stringify(doc)}`);
    }
  }
  check('the database refuses every key, in any case, at depths 1 to 4 and inside arrays', missedByDb, []);
  const PROBE_KEYS = [...store.PERSONAL_KEYS, ...store.PERSONAL_KEYS.map(k => k.toUpperCase()), 'Email', 'IP',
    'emails', 'mail', 'ips', 'zip', 'phones', 'user', 'session', 'device', 'palates', 'limonene', 'batch_id', 'client', 'e_mail',
    'customer', 'patient', 'shopper', 'address', 'name', 'contact'];
  const disagree = [];
  for (const k of PROBE_KEYS) {
    const doc = { reading: { nested: [{ [k]: 1 }] } };
    if (jsHolds(doc) !== await dbHolds(doc)) disagree.push(k);
  }
  check(`JS and the database agree, both ways, on all ${PROBE_KEYS.length} keys tried: the personal ones refused, the near misses kept`,
    disagree, []);

  /* ================================== a store, and batches, as the admin */

  await db.query(`insert into b2b.stores (slug, display_name, allowed_origins) values ('test-store', 'Test Store', '{https://shop.example}')`);
  const storeId = (await one(`select id::text as id from b2b.stores where slug = 'test-store'`)).id;
  const row = (batch, extra = {}) => ({ batch_id: batch, product_id: `P-${batch}`, list_position: 0, category: 'flower',
                                        route: 'smoking', name: `Name ${batch}`, in_stock: true, ...extra });

  /* ======================== a personal key: refused in both layers, at depth */

  const spy = { calls: 0, query: async () => { spy.calls++; return { rows: [{ inserted: 0, updated: 0, read_on: today() }] }; } };
  const USABLE = { lab: 'Kaycha Labs', productClass: 'flower', usable: true, rejectReasons: [], terps: { limonene: 0.5, myrcene: 0.3 },
                   totalTerpenes: 1.2, moisture: 11.2, waterActivity: 0.58, harvestOn: '2026-03-01', reportOn: null, readBy: 'forward', warnings: [] };
  const jsGaps = [];
  for (const k of store.PERSONAL_KEYS) {
    const value = 'jane@example.org';
    for (const [what, call, name, key] of [
      ['a batch row', () => b2b.upsertBatches(storeId, [row('J-1', { [k]: value })], { client: spy }), 'upsertBatches', k],
      ['a batch row, deep in an array', () => b2b.upsertBatches(storeId, [row('J-2', { extra: { deep: [{ [k.toUpperCase()]: value }] } })], { client: spy }), 'upsertBatches', k.toUpperCase()],
      ['a reading\'s terpenes', () => b2b.upsertRead(storeId, 'J-1', { ...USABLE, terps: { limonene: 1, more: { [k]: value } } }, { client: spy }), 'upsertRead', k],
      ['a reading, four deep', () => b2b.upsertRead(storeId, 'J-1', { ...USABLE, a: { b: { c: { [k]: value } } } }, { client: spy }), 'upsertRead', k],
      ['a refused reading', () => b2b.upsertRead(storeId, 'J-1', { usable: false, rejectReasons: ['x'], list: [{ [k]: value }] }, { client: spy }), 'upsertRead', k]
    ]) {
      const e = await rejects(call);
      if (!e || e.message !== jsRefusal(name, key) || e.message.includes(value)) jsGaps.push(`${k} in ${what}: ${errText(e)}`);
    }
  }
  check(`JS refuses each of the ${store.PERSONAL_KEYS.length} keys in a batch row, deep in one, in a reading's terpenes, four deep and in a refusal - naming the key, never its value`,
    jsGaps, []);
  check('...and sends nothing: no query was made', spy.calls, 0);
  delete process.env.NOSE_B2B_DB_URL;
  check('...the refusal comes first: it holds with no database configured too',
    errText(await rejects(() => b2b.upsertBatches(storeId, [row('J-3', { phone: '1' })]))), `${jsRefusal('upsertBatches', 'phone')}`);

  await db.query(`insert into b2b.batches (store_id, batch_id, product_id, list_position, category, route, name, in_stock)
                  values ($1::bigint, 'B-1', 'P-1', 0, 'flower', 'smoking', 'One', true)`, [storeId]);
  const RAW_READ = 'insert into b2b.batch_reads (store_id, batch_id, usable, terps, total_terpenes) values ($1::bigint, $2, true, $3::jsonb, 1)';
  const readRows = () => count('select count(*)::int as n from b2b.batch_reads');
  const readsBefore = await readRows();
  const dbGaps = [];
  await asRole('nose_b2b', async () => {
    for (const k of store.PERSONAL_KEYS) {
      for (const terps of [{ limonene: 1, more: { [k.toUpperCase()]: 1 } }, { a: { b: { [k]: 1 } } }, { list: [{ [k]: 'jane@example.org' }] }]) {
        const e = await rejects(() => db.query(RAW_READ, [storeId, 'B-1', JSON.stringify(terps)]));
        if (!e || e.message !== PERSON_REFUSED || e.code !== '23514' || e.detail) dbGaps.push(`${k}: ${errText(e)}`);
      }
    }
  });
  check(`the DATABASE refuses all ${store.PERSONAL_KEYS.length} keys at depth, with JS bypassed and as nose_b2b: "${PERSON_REFUSED}" - no row in the error`,
    dbGaps, []);
  check('...and nothing was written', await readRows(), readsBefore);
  const viaStore = await rejects(() => b2b.upsertRead(storeId, 'B-1', { ...USABLE, terps: { limonene: 1 } },
    { client: { query: () => db.query(RAW_READ, [storeId, 'B-1', JSON.stringify({ limonene: 1, x: { email: 1 } })]) } }));
  check('...and reaches a caller of lib/b2b-store.js as the same words, scrubbed and kept: code and all',
    [viaStore && viaStore.message, viaStore && viaStore.code, viaStore && 'detail' in viaStore], [`b2b-store: ${PERSON_REFUSED}`, '23514', false]);
  await db.exec('alter table b2b.batch_reads disable trigger batch_reads_refuse_personal_fields');
  const byCheck = await rejects(() => db.query(RAW_READ, [storeId, 'B-1', JSON.stringify({ limonene: 1, email: 0.5 })]));
  await db.exec('alter table b2b.batch_reads enable trigger batch_reads_refuse_personal_fields');
  check('with the trigger switched off, the CHECK on the column refuses on its own',
    !!byCheck && /violates check constraint "terps_hold_no_person"/.test(byCheck.message), true);
  const byTrigger = await rejects(() => db.query(RAW_READ, [storeId, 'B-1', JSON.stringify({ limonene: 1, email: 0.5 })]));
  check('...and with it on, the trigger answers first, in words that carry no data', errText(byTrigger), `23514 ${PERSON_REFUSED}`);
  check('...nothing was written either way', await readRows(), readsBefore);

  /* ========================================================== the roles */

  await asRole('nose_b2b', async () => {
    const first = await b2b.upsertBatches(storeId, [row('R-1'), row('R-2', { brand: 'Brand', thc_percent: 21.5 }), row('R-3', { in_stock: false })], { client });
    check('nose_b2b can upsert batches: three new', first, { inserted: 3, updated: 0 });
  });
  await db.query(`update b2b.batches set first_listed_on = '2026-01-02', last_listed_on = '2026-01-02' where store_id = $1::bigint and batch_id like 'R-%'`, [storeId]);
  await asRole('nose_b2b', async () => {
    const again = await b2b.upsertBatches(storeId, [row('R-1', { name: 'Renamed', list_position: 5 }), row('R-2', { in_stock: false }), row('R-4')], { client });
    check('...again: two updated, one new', again, { inserted: 1, updated: 2 });
  });
  const listed = await rows(`select batch_id, name, list_position, in_stock, brand, first_listed_on::text as first, last_listed_on::text as last
                               from b2b.batches where store_id = $1::bigint and batch_id like 'R-%' order by batch_id`, [storeId]);
  check('...an update keeps the day a batch was first listed, and moves the day it was last listed to today (UTC)',
    listed.map(r => [r.batch_id, r.name, r.list_position, r.in_stock, r.first, r.last]),
    [['R-1', 'Renamed', 5, true, '2026-01-02', today()], ['R-2', 'Name R-2', 0, false, '2026-01-02', today()],
     ['R-3', 'Name R-3', 0, false, '2026-01-02', '2026-01-02'], ['R-4', 'Name R-4', 0, true, today(), today()]]);
  check('...a batch absent from an upload is kept, untouched (Prompt 3 decides when it is out of stock)', listed.length, 4);
  check('...and an upsert replaces what it lists: R-2\'s brand, not given again, is gone', listed[1].brand, null);
  await asRole('nose_b2b', async () => {
    const w = await b2b.upsertRead(storeId, 'R-1', USABLE, { client });
    check('nose_b2b can write a reading', [w.written, w.readOn], [true, today()]);
    const w2 = await rejects(() => b2b.upsertRead(storeId, 'R-1', { usable: false, rejectReasons: ['the lab did not run a terpene panel on this sample'],
                                                                   terps: { limonene: 9 }, totalTerpenes: 9, moisture: 12, waterActivity: 0.6, lab: 'Kaycha Labs' }, { client }));
    check('...and replace it with a refusal that came with figures: one current reading per batch', errText(w2), 'no error');
  });
  const r1 = await one(`select usable, terps, total_terpenes, moisture, water_activity, to_json(reject_reasons) as reasons, lab,
                               (select count(*)::int from b2b.batch_reads where store_id = $1::bigint and batch_id = 'R-1') as n
                          from b2b.batch_reads where store_id = $1::bigint and batch_id = 'R-1'`, [storeId]);
  check('...a refused reading keeps its reasons and no figure at all - not its terpenes, not its total, not moisture or water activity',
    [r1.n, r1.usable, r1.terps, r1.total_terpenes, r1.moisture, r1.water_activity, r1.reasons, r1.lab],
    [1, false, null, null, null, null, ['the lab did not run a terpene panel on this sample'], 'Kaycha Labs']);

  const refusedRole = async (role, label, sql, want = /permission denied/) => {
    const e = await asRole(role, () => rejects(() => db.query(sql)));
    check(label, !!e && e.code === '42501' && want.test(e.message), true);
  };
  /* Each refusal is asserted by the object it names: refused for another
     reason - a CHECK's function, a sequence - it would prove nothing. */
  for (const t of ['stores', 'store_keys', 'batches', 'batch_reads']) {
    await refusedRole('nose_b2b', `nose_b2b cannot DELETE from b2b.${t}`, `delete from b2b.${t} where false`, new RegExp(`permission denied for table ${t}$`));
    await refusedRole('nose_b2b', `nose_b2b cannot TRUNCATE b2b.${t}`, `truncate b2b.${t}`, new RegExp(`permission denied for table ${t}$`));
  }
  await refusedRole('nose_b2b', 'nose_b2b cannot make a store', `insert into b2b.stores (slug, display_name, allowed_origins) values ('x', 'X', '{}')`, /permission denied for table stores$/);
  await refusedRole('nose_b2b', 'nose_b2b cannot change a store (add itself an origin, say)', 'update b2b.stores set allowed_origins = allowed_origins', /permission denied for table stores$/);
  await refusedRole('nose_b2b', 'nose_b2b cannot add a key', `insert into b2b.store_keys (store_id, kind, key_sha256) values (1, 'secret', '${'0'.repeat(64)}')`, /permission denied for table store_keys$/);
  await refusedRole('nose_b2b', 'nose_b2b cannot un-revoke a key', 'update b2b.store_keys set revoked_on = null', /permission denied for table store_keys$/);
  await refusedRole('nose_b2b', 'nose_b2b cannot read schema nose', 'select count(*) from nose.parses', /permission denied for schema nose/);
  await refusedRole('nose_b2b', 'nose_b2b cannot call nose.save_scan', `select nose.save_scan('{}'::jsonb)`, /permission denied for schema nose/);
  await refusedRole('nose_writer', 'nose_writer cannot read schema b2b', 'select count(*) from b2b.stores', /permission denied for schema b2b/);
  await refusedRole('nose_writer', 'nose_writer cannot write to it', `insert into b2b.batches (store_id, batch_id) values (1, 'x')`, /permission denied for schema b2b/);
  await db.exec('create role nose_b2b_test_nobody nologin');
  await refusedRole('nose_b2b_test_nobody', 'a role with no grants cannot read b2b', 'select count(*) from b2b.batches', /permission denied for schema b2b/);
  const reads = await asRole('nose_b2b', () => count(`select count(*)::int as n from b2b.store_keys k join b2b.stores s on s.id = k.store_id`));
  check('nose_b2b can read the stores and their keys (the feed and the upload find a store by its key)', typeof reads, 'number');

  /* ====================================== probe-db.js's audit, on this DB */

  const audit = async () => {
    const out = [...await probe.b2bAdminChecks(client), ...await asRole('nose_b2b', () => probe.b2bRoleChecks(client))];
    return { failed: out.filter(r => !r.pass).map(r => r.label), n: out.length };
  };
  const clean0 = await audit();
  check(`probe-db.js's b2b audit passes on a freshly migrated database (${clean0.n} checks, as admin and as nose_b2b)`, clean0.failed, []);
  const readsNow = await count('select count(*)::int as n from b2b.batch_reads');
  for (const [what, grant, revoke, expect] of [
    ['DELETE granted on batches', 'grant delete on b2b.batches to nose_b2b', 'revoke delete on b2b.batches from nose_b2b',
     ['nose_b2b holds exactly SELECT on stores and store_keys, SELECT, INSERT and UPDATE on batches and batch_reads, and nothing else in b2b',
      'nose_b2b holds exactly INSERT, SELECT, UPDATE on b2b.batches', 'nose_b2b cannot DELETE from b2b.batches']],
    ['TRUNCATE granted on batch_reads', 'grant truncate on b2b.batch_reads to nose_b2b', 'revoke truncate on b2b.batch_reads from nose_b2b',
     ['nose_b2b holds exactly SELECT on stores and store_keys, SELECT, INSERT and UPDATE on batches and batch_reads, and nothing else in b2b',
      'nose_b2b holds exactly INSERT, SELECT, UPDATE on b2b.batch_reads', 'nose_b2b cannot TRUNCATE b2b.batch_reads']],
    ['INSERT granted on store_keys', 'grant insert on b2b.store_keys to nose_b2b', 'revoke insert on b2b.store_keys from nose_b2b',
     ['nose_b2b holds exactly SELECT on stores and store_keys, SELECT, INSERT and UPDATE on batches and batch_reads, and nothing else in b2b',
      'nose_b2b holds exactly SELECT on b2b.store_keys', 'nose_b2b cannot add a key']],
    ['PUBLIC given a b2b function', 'grant execute on function b2b.https_origins(text[]) to public',
     'revoke execute on function b2b.https_origins(text[]) from public',
     ['only postgres and nose_b2b hold any grant in schema b2b', 'PUBLIC cannot execute any b2b function',
      'nose_b2b executes b2b.holds_no_person(jsonb) and b2b.terps_ok(jsonb), and not b2b.https_origins(text[]) or b2b.refuse_personal_fields()']],
    ['USAGE on schema nose', 'grant usage on schema nose to nose_b2b', 'revoke usage on schema nose from nose_b2b',
     ['nose_b2b holds nothing in schema nose', 'nose_b2b cannot read schema nose', 'nose_b2b cannot call nose.save_scan']],
    ['nose_b2b made a member of nose_writer', 'grant nose_writer to nose_b2b', 'revoke nose_writer from nose_b2b',
     ['nose_b2b is a member of no role, so it inherits nothing', 'nose_b2b holds nothing in schema nose',
      'nose_b2b cannot read schema nose', 'nose_b2b cannot call nose.save_scan']],
    ['nose_writer given a b2b table', 'grant usage on schema b2b to nose_writer; grant select on b2b.stores to nose_writer',
     'revoke select on b2b.stores from nose_writer; revoke usage on schema b2b from nose_writer',
     ['only postgres and nose_b2b hold any grant in schema b2b', 'nose_writer holds nothing in schema b2b']],
    ['a default privilege in b2b', 'alter default privileges in schema b2b grant select on tables to nose_b2b',
     'alter default privileges in schema b2b revoke select on tables from nose_b2b',
     ['schema b2b has no default privileges: a new table there is granted nothing until its migration says so']]
  ]) {
    await db.exec(grant);
    const broken = await audit();
    await db.exec(revoke);
    check(`...and fails on ${what}`, broken.failed, expect);
  }
  check('...a wrongly granted TRUNCATE ran inside a transaction the probe rolled back: no reading was lost',
    [readsNow > 0, await count('select count(*)::int as n from b2b.batch_reads')], [true, readsNow]);
  check('...and passes again once each is put right', (await audit()).failed, []);

  /* ============================================ values only when accepted */

  const rawRead = (cols, vals) => rejects(() => db.query(`insert into b2b.batch_reads (store_id, batch_id, ${cols}) values ($1::bigint, 'B-1', ${vals})`, [storeId]));
  for (const [label, cols, vals, constraint] of [
    ['a refused reading with terpenes', 'usable, terps', `false, '{"limonene":1}'`, 'values_only_when_usable'],
    ['a refused reading with a total', 'usable, total_terpenes', 'false, 1.5', 'values_only_when_usable'],
    ['a refused reading with moisture', 'usable, moisture', 'false, 11', 'values_only_when_usable'],
    ['a refused reading with water activity', 'usable, water_activity', 'false, 0.6', 'values_only_when_usable'],
    ['an accepted reading without terpenes', 'usable, total_terpenes', 'true, 1.5', 'values_only_when_usable'],
    ['an accepted reading without a total', 'usable, terps', `true, '{"limonene":1}'`, 'values_only_when_usable'],
    ['a terpene that is not a number', 'usable, terps, total_terpenes', `true, '{"limonene":"0.5"}', 1`, 'terps_are_terpenes'],
    ['a terpene below zero', 'usable, terps, total_terpenes', `true, '{"limonene":-0.1}', 1`, 'terps_are_terpenes'],
    ['a sentence where a terpene key goes', 'usable, terps, total_terpenes', `true, '{"Jane Example":1}', 1`, 'terps_are_terpenes'],
    ['terpenes that are not an object', 'usable, terps, total_terpenes', `true, '[1]', 1`, 'terps_are_terpenes'],
    ['no terpenes at all in an accepted reading\'s object', 'usable, terps, total_terpenes', `true, '{}', 1`, 'terps_are_terpenes'],
    ['a water activity above 1', 'usable, terps, total_terpenes, water_activity', `true, '{"limonene":1}', 1, 1.2`, 'batch_reads_water_activity_check']
  ]) {
    const e = await rawRead(cols, vals);
    check(`the database refuses ${label} (${constraint})`, !!e && e.message.includes(`"${constraint}"`), true);
  }
  const fk = await rejects(() => db.query(`insert into b2b.batch_reads (store_id, batch_id, usable) values ($1::bigint, 'NOT-LISTED', false)`, [storeId]));
  check('...and a reading of a batch the store has not listed', !!fk && /batch_reads_store_id_batch_id_fkey/.test(fk.message), true);
  const built = b2b._buildRead({ usable: false, rejectReasons: ['refused', 7, null], terps: { limonene: 1 }, totalTerpenes: 2,
                                 moisture: 10, waterActivity: 0.5, harvestOn: '2026-01-01', lab: 'ACS Laboratory', client: 'Somebody', strain: 'X' });
  check('lib/b2b-store.js sends a refusal with its reasons, its lab and days, and no figure - and only READ_FIELDS',
    [built.terps, built.totalTerpenes, built.moisture, built.waterActivity, built.rejectReasons, built.lab, built.harvestOn, Object.keys(built)],
    [null, null, null, null, ['refused'], 'ACS Laboratory', '2026-01-01', [...b2b.READ_FIELDS]]);

  /* Every fixture's reading, through the real parser and the store layer. */
  const extracted = path.join(ROOT, 'test/fixtures/extracted');
  const texts = fs.existsSync(extracted) ? fs.readdirSync(extracted).filter(f => f.endsWith('.txt')).sort() : [];
  check('the extracted fixtures are on disk (node test/extract-dump.js writes them)', texts.length >= 59, true);
  const outputs = texts.map(f => [f.replace(/\.txt$/, ''), parseCoa(fs.readFileSync(path.join(extracted, f), 'utf8'))]);
  await asRole('nose_b2b', async () => {
    await b2b.upsertBatches(storeId, outputs.map(([id], i) => row(`FX-${id}`, { list_position: i })), { client });
  });
  const failedReads = [];
  await asRole('nose_b2b', async () => {
    for (const [id, out] of outputs) {
      const e = await rejects(() => b2b.upsertRead(storeId, `FX-${id}`, out, { client }));
      if (e) failedReads.push(`${id}: ${e.message}`);
    }
  });
  check(`every fixture's reading is stored as the parser gave it: ${outputs.length} written, none refused by the schema`, failedReads, []);
  const storedFx = await rows(`select batch_id, usable, terps, total_terpenes::text as total, harvest_on::text as harvest, read_by
                                 from b2b.batch_reads where store_id = $1::bigint and batch_id like 'FX-%' order by batch_id`, [storeId]);
  const byId = new Map(outputs.map(([id, o]) => [`FX-${id}`, o]));
  const sorted = o => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));
  const mismatch = storedFx.filter(r => {
    const o = byId.get(r.batch_id);
    return r.usable !== (o.usable === true) ||
           (o.usable === true ? sorted(r.terps) !== sorted(o.terps) || r.total !== String(o.totalTerpenes)
                              : r.terps !== null || r.total !== null) ||
           r.harvest !== (o.harvestOn || null) || r.read_by !== (o.readBy || null);
  }).map(r => r.batch_id);
  check('...accepted ones with exactly the parser\'s terpenes and total, refused ones with neither; days and reader as read',
    [storedFx.filter(r => r.usable).length, storedFx.filter(r => !r.usable).length, mismatch], [56, 3, []]);
  const kay = storedFx.find(r => r.batch_id === 'FX-KAY-CAR-001');
  check('KAY-CAR-001: total 4.124 exactly, 15 terpene values (zeros kept as 0)',
    kay ? [kay.total, Object.keys(kay.terps).length] : null, ['4.124', 15]);

  /* ============================================================ coa_url */

  check('coa_url keeps the query and drops the "#" part: Kaycha\'s viewer keeps its ?sample=',
    b2b.coaLink('https://yourcoa.com/coa/coa-view?sample=MI60617015-004#page=1'), 'https://yourcoa.com/coa/coa-view?sample=MI60617015-004');
  check('...empty is not given; http, a non-link and a link carrying a password are refused, naming no value',
    [b2b.coaLink(''), b2b.coaLink(null), errText(await rejects(async () => b2b.coaLink('http://coa.example/x.pdf'))),
     errText(await rejects(async () => b2b.coaLink('not a link'))),
     errText(await rejects(async () => b2b.coaLink('https://jane:hunter2@coa.example/x.pdf')))],
    [null, null, 'coa_url is not an https link', 'coa_url is not a link', 'coa_url carries a user name or password']);
  const catalog = readCatalog(fs.readFileSync(path.join(ROOT, 'test/fixtures/b2b/catalog.csv')));
  const pct = v => (v === '' || v == null ? null : Number(String(v).replace('%', '')));
  const usableRows = catalog.rows.filter(r => r.outcome === null && /^https:/.test(r.coa_url || ''))
    .map((r, i) => ({ ...r, list_position: i, in_stock: r.in_stock === 'yes', thc_percent: pct(r.thc_percent), cbd_percent: pct(r.cbd_percent) }));
  /* A second store, so the test catalog's batch IDs cannot meet the ones above. */
  await db.query(`insert into b2b.stores (slug, display_name) values ('catalog-store', 'Catalog Store')`);
  const catalogStore = (await one(`select id::text as id from b2b.stores where slug = 'catalog-store'`)).id;
  const up = await asRole('nose_b2b', () => b2b.upsertBatches(catalogStore, usableRows, { client }));
  check(`the test catalog's ${usableRows.length} https-linked rows store as given - its extra fields (row, outcome, reasons) dropped`,
    up, { inserted: usableRows.length, updated: 0 });
  const links = new Map((await rows(`select batch_id, coa_url from b2b.batches where store_id = $1::bigint`, [catalogStore])).map(r => [r.batch_id, r.coa_url]));
  check('...every link whole but for its "#" part: the viewer\'s ?sample=, the portal\'s ?search=, a #page=1 gone',
    [usableRows.every(r => links.get(r.batch_id) === r.coa_url.split('#')[0]),
     links.get('6650039866516120'), links.get('5637041429622699'), links.get('MI60403006-005')],
    [true, 'https://yourcoa.com/coa/coa-view?sample=MI60617015-004', 'https://coaportal.com/sunburn/listings/?search=5637041429622699',
     'https://coa.example/kaycha/KAY-AIO-001.pdf']);
  for (const [label, url, constraint] of [['a "#" part', 'https://coa.example/x.pdf#page=2', 'batches_coa_url_check'],
                                          ['an http link', 'http://coa.example/x.pdf', 'batches_coa_url_check']]) {
    const e = await rejects(() => db.query(`insert into b2b.batches (store_id, batch_id, product_id, list_position, category, route, name, in_stock, coa_url)
                                            values ($1::bigint, 'U-1', 'P', 0, 'vape', 'inhalation', 'N', true, $2)`, [catalogStore, url]));
    check(`...and the database refuses a coa_url with ${label}, JS bypassed`, !!e && e.message.includes(`"${constraint}"`), true);
  }
  const blank = b2b._buildBatchRows([row('E-1', { brand: '', coa_url: '', product_url: ' ', thc_percent: '', cbd_percent: '' })])[0];
  check('an empty optional value is not given: NULL, never an empty string',
    [blank.brand, blank.coa_url, blank.product_url, blank.thc_percent, blank.cbd_percent], [null, null, null, null, null]);
  check('a batch_id twice in one upload is refused before anything is sent, naming no value',
    errText(await rejects(() => b2b.upsertBatches(storeId, [row('D-1'), row('D-1')], { client: spy }))),
    'upsertBatches: row 2 repeats an earlier row\'s batch_id');

  /* =============================================================== keys */

  const sk = b2b.newKey('secret');
  const pk = b2b.newKey('public');
  check('a key is 32 random bytes as hex behind its prefix: nsk_ secret, npk_ public',
    [/^nsk_[0-9a-f]{64}$/.test(sk), /^npk_[0-9a-f]{64}$/.test(pk), sk !== b2b.newKey('secret'), b2b.keyKind(sk), b2b.keyKind(pk)],
    [true, true, true, 'secret', 'public']);
  check('its hash is the SHA-256 of the whole key as written', b2b.keyHash(sk), sha(sk));
  check('a malformed key is no key: no kind, no hash',
    [b2b.keyKind('nsk_short'), b2b.keyKind(sk.toUpperCase()), b2b.keyKind(` ${sk}`), b2b.keyKind(null),
     errText(await rejects(async () => b2b.keyHash('npk_' + 'g'.repeat(64))))],
    [null, null, null, null, 'keyHash: not a NOSE key']);
  const keyRefused = async (vals, constraint) => {
    const e = await rejects(() => db.query(`insert into b2b.store_keys (store_id, kind, key_sha256, created_on, revoked_on) values ${vals}`));
    return !!e && e.message.includes(`"${constraint}"`);
  };
  check('the database holds a hash and nothing else: a key itself is refused where its hash goes',
    await keyRefused(`(${storeId}, 'secret', '${sk}', default, null)`, 'store_keys_key_sha256_check'), true);
  check('...a kind is secret or public', await keyRefused(`(${storeId}, 'admin', '${sha('k1')}', default, null)`, 'store_keys_kind_check'), true);
  await db.query(`insert into b2b.store_keys (store_id, kind, key_sha256) values ($1::bigint, 'secret', $2)`, [storeId, sha('k2')]);
  check('...one working key of each kind per store',
    await keyRefused(`(${storeId}, 'secret', '${sha('k3')}', default, null)`, 'store_keys_one_current_idx'), true);
  check('...and a key cannot be revoked before it was made',
    await keyRefused(`(${storeId}, 'public', '${sha('k4')}', '2026-10-07', '2026-10-06')`, 'revoked_after_made'), true);

  /* ============================================ scripts/b2b-store.js, admin */

  const say = () => { const lines = []; return { lines, log: l => lines.push(String(l)) }; };
  const cmd = async (argv, out = say()) => {
    const r = await admin.runCommand(admin.parseArgs(argv), { db: client, log: out.log });
    return { r, lines: out.lines, text: out.lines.join('\n') };
  };
  const keysIn2 = text => [...text.matchAll(/n[sp]k_[0-9a-f]{64}/g)].map(m => m[0]);
  const created = await cmd(['create', 'pilot-store', '--name', 'Pilot Store', '--origin', 'https://Shop.Example/', '--origin', 'https://menu.shop.example:8443']);
  const firstKeys = keysIn2(created.text);
  const ps = await one(`select id::text as id, display_name, to_json(allowed_origins) as origins, window_months, guardrail_thc_points, created_on::text as day
                          from b2b.stores where slug = 'pilot-store'`);
  check('create: the store, its origins as a browser sends them, a 12-month window, no guardrail, made today (UTC)',
    [ps.display_name, ps.origins, ps.window_months, ps.guardrail_thc_points, ps.day],
    ['Pilot Store', ['https://shop.example', 'https://menu.shop.example:8443'], 12, null, today()]);
  check('...prints one secret key and one public key, each exactly once',
    [firstKeys.length, new Set(firstKeys).size, firstKeys.filter(k => k.startsWith('nsk_')).length, firstKeys.filter(k => k.startsWith('npk_')).length],
    [2, 2, 1, 1]);
  const [secret1, public1] = [firstKeys.find(k => k.startsWith('nsk_')), firstKeys.find(k => k.startsWith('npk_'))];
  const keyRows = async () => rows(`select kind, key_sha256, revoked_on::text as revoked from b2b.store_keys
                                      where store_id = (select id from b2b.stores where slug = 'pilot-store') order by kind, created_on, key_sha256`);
  check('...and the database holds their hashes alone', (await keyRows()).map(r => [r.kind, r.key_sha256, r.revoked]).sort(),
    [['public', b2b.keyHash(public1), null], ['secret', b2b.keyHash(secret1), null]]);
  const everything = async () => JSON.stringify(await Promise.all(['stores', 'store_keys', 'batches', 'batch_reads']
    .map(t => rows(`select to_jsonb(x) as r from b2b.${t} x order by to_jsonb(x)::text`))));
  const allText = await everything();
  check('...nowhere in any b2b table: neither key, nor the 64 characters behind its prefix',
    [secret1, public1, secret1.slice(4), public1.slice(4)].some(s => allText.includes(s)), false);
  check('...nor does the output print a key\'s full fingerprint', [b2b.keyHash(secret1), b2b.keyHash(public1)].some(h => created.text.includes(h)), false);
  check('...the new keys work', [await b2b.storeForKey(secret1, { client }), await b2b.storeForKey(public1, { client })],
    [{ storeId: ps.id, slug: 'pilot-store', kind: 'secret' }, { storeId: ps.id, slug: 'pilot-store', kind: 'public' }]);
  const nose_b2b_finds = await asRole('nose_b2b', () => b2b.storeForKey(public1, { client }));
  check('...and nose_b2b finds the store by its key', nose_b2b_finds && nose_b2b_finds.slug, 'pilot-store');
  const snapshot1 = await everything();
  const dup = await rejects(() => cmd(['create', 'pilot-store', '--name', 'Again', '--origin', 'https://x.example']));
  check('create with a slug in use is refused, and changes nothing',
    [dup instanceof admin.Refusal, dup && dup.message, await everything() === snapshot1],
    [true, 'a store called "pilot-store" already exists - nothing was changed', true]);

  const added = await cmd(['add-origin', 'pilot-store', 'https://third.example']);
  const addedAgain = await cmd(['add-origin', 'pilot-store', 'https://third.example']);
  check('add-origin adds one, and says so; the same one again changes nothing',
    [added.text, addedAgain.text], ['store "pilot-store" now allows: https://shop.example, https://menu.shop.example:8443, https://third.example',
                                    'store "pilot-store" already allows https://third.example - nothing was changed']);

  const rot = await cmd(['rotate-keys', 'pilot-store']);
  const rotKeys = keysIn2(rot.text);
  const [secret2, public2] = [rotKeys.find(k => k.startsWith('nsk_')), rotKeys.find(k => k.startsWith('npk_'))];
  check('rotate-keys: two new keys, each printed once', [rotKeys.length, new Set(rotKeys).size, !!secret2, !!public2], [2, 2, true, true]);
  check('...the old ones stop working at once, the new ones work',
    [await b2b.storeForKey(secret1, { client }), await b2b.storeForKey(public1, { client }),
     (await b2b.storeForKey(secret2, { client })).kind, (await b2b.storeForKey(public2, { client })).kind],
    [null, null, 'secret', 'public']);
  check('...the old ones kept as revoked today, by hash',
    (await keyRows()).filter(r => r.revoked).map(r => [r.kind, r.key_sha256, r.revoked]).sort(),
    [['public', b2b.keyHash(public1), today()], ['secret', b2b.keyHash(secret1), today()]]);
  const rotS = await cmd(['rotate-keys', 'pilot-store', '--secret']);
  const secret3 = keysIn2(rotS.text);
  check('rotate-keys --secret: one new secret key; the public key is untouched',
    [secret3.length, secret3[0].startsWith('nsk_'), await b2b.storeForKey(secret2, { client }), (await b2b.storeForKey(public2, { client })).kind],
    [1, true, null, 'public']);
  const rev = await cmd(['revoke', 'pilot-store', '--public']);
  check('revoke --public: the public key stops working, the secret one does not; no key is printed',
    [await b2b.storeForKey(public2, { client }), (await b2b.storeForKey(secret3[0], { client })).kind, keysIn2(rev.text).length],
    [null, 'secret', 0]);
  const revAgain = await cmd(['revoke', 'pilot-store', '--public']);
  check('...again: nothing to revoke, nothing changed', revAgain.text, 'store "pilot-store" had no working public key - nothing was changed');

  await asRole('nose_b2b', async () => {
    await b2b.upsertBatches(ps.id, [row('PS-1'), row('PS-2')], { client });
    await b2b.upsertRead(ps.id, 'PS-1', USABLE, { client });
  });
  const otherBefore = JSON.stringify(await rows(`select to_jsonb(b) as r from b2b.batches b where store_id = $1::bigint order by batch_id`, [storeId]));
  const snapshot2 = await everything();
  const dry = await cmd(['delete-store', 'pilot-store']);
  check('delete-store without --yes is a dry run: it says what would go, and changes nothing - every row of every table as it was',
    [await everything() === snapshot2, dry.lines[dry.lines.length - 1], dry.lines.some(l => /5 keys \(1 working, 4 revoked\), 2 listed batches, 1 reading/.test(l))],
    [true, 'dry run - nothing was changed; --yes deletes all of it', true]);
  const gone = await cmd(['delete-store', 'pilot-store', '--yes']);
  check('delete-store --yes: the store, its keys, its batches and their readings are gone',
    [await count(`select count(*)::int as n from b2b.stores where slug = 'pilot-store'`),
     await count('select count(*)::int as n from b2b.store_keys where store_id = $1::bigint', [ps.id]),
     await count('select count(*)::int as n from b2b.batches where store_id = $1::bigint', [ps.id]),
     await count('select count(*)::int as n from b2b.batch_reads where store_id = $1::bigint', [ps.id]), gone.r.deleted],
    [0, 0, 0, 0, true]);
  check('...and no other store lost anything',
    JSON.stringify(await rows(`select to_jsonb(b) as r from b2b.batches b where store_id = $1::bigint order by batch_id`, [storeId])), otherBefore);
  const asB2b = await asRole('nose_b2b', () => rejects(() => cmd(['delete-store', 'test-store', '--yes'])));
  check('as nose_b2b the script refuses before it reads anything',
    [asB2b instanceof admin.Refusal, asB2b && asB2b.message],
    [true, 'connected as nose_b2b, which cannot make, key or delete stores - this needs NOSE_DB_ADMIN_URL, the admin connection']);
  const missingStore = await rejects(() => cmd(['rotate-keys', 'no-such-store']));
  check('a store that does not exist is refused, nothing changed', missingStore && missingStore.message, 'no store called "no-such-store" - nothing was changed');
  const usage = argv => { try { admin.parseArgs(argv); return 'parsed'; } catch (e) { return e instanceof admin.UsageError ? e.message.split('\n')[0] : `threw ${e.message}`; } };
  check('usage: an unknown command, a missing --name or --origin, a bad slug, an origin with a path or over http, a flag a command does not take',
    [usage([]), usage(['make', 'x']), usage(['create', 'x', '--origin', 'https://x.example']), usage(['create', 'x', '--name', 'X']),
     usage(['create', 'Bad_Slug', '--name', 'X', '--origin', 'https://x.example']),
     usage(['create', 'x', '--name', 'X', '--origin', 'https://x.example/menu']),
     usage(['create', 'x', '--name', 'X', '--origin', 'http://x.example']),
     usage(['create', 'x', '--name', 'X', '--origin', 'https://x.example', '--yes']),
     usage(['delete-store', 'x', '--secret']), usage(['create', 'x', '--name', 'X', '--origin', 'https://x.example', '--window-months', '40']),
     usage(['create', 'x', '--name', 'X', '--origin', 'https://x.example', '--guardrail-thc', '0'])],
    ['usage:', 'usage:', 'create needs --name', 'create needs at least one --origin',
     'a slug is lowercase letters, digits and single hyphens, up to 40: "rose-city"',
     '"https://x.example/menu" is not an https origin - the scheme and host only, as https://shop.example (no path)',
     '"http://x.example" is not an https origin - the scheme and host only, as https://shop.example (no path)',
     'create does not take --yes', 'delete-store does not take --secret', '--window-months is a whole number of months, 1 to 36',
     '--guardrail-thc is a number of percentage points, above 0 and at most 100']);
  const g = await cmd(['create', 'guarded', '--name', 'Guarded', '--origin', 'https://g.example', '--window-months', '6', '--guardrail-thc', '5', '--guardrail-cbd', '0.5']);
  const gs = await one(`select window_months, guardrail_thc_points::text as thc, guardrail_cbd_points::text as cbd from b2b.stores where slug = 'guarded'`);
  check('create takes the window and a guardrail, in percentage points', [gs.window_months, gs.thc, gs.cbd, keysIn2(g.text).length], [6, '5', '0.5', 2]);

  const bare = { PATH: process.env.PATH, HOME: process.env.HOME || os.tmpdir() };
  const cli = args => spawnSync(process.execPath, [path.join(ROOT, 'scripts/b2b-store.js'), ...args], { env: bare, encoding: 'utf8', timeout: 20000 });
  const noSecret = cli(['create', 'x', '--name', 'X', '--origin', 'https://x.example']);
  const noArgs = cli([]);
  check('from the command line: no NOSE_DB_ADMIN_URL refuses (exit 1); no command prints the usage (exit 2)',
    [noSecret.status, /^REFUSED: NOSE_DB_ADMIN_URL is not set/.test(noSecret.stderr), noArgs.status, /^usage:/.test(noArgs.stderr), noSecret.stdout + noArgs.stdout],
    [1, true, 2, true, '']);

  return failures;
}

/* ================================== what needs no database, run first */

async function offline(log = console.log) {
  let failures = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
  };
  const rejects = async fn => { try { await fn(); return null; } catch (e) { return e; } };
  const unhandled = [];
  const onUnhandled = e => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  const row = { batch_id: 'B-1', product_id: 'P-1', list_position: 0, category: 'flower', route: 'smoking', name: 'One', in_stock: true };

  /* --- lib/b2b-store.js: a no-op without NOSE_B2B_DB_URL ----------------- */
  delete process.env.NOSE_B2B_DB_URL;
  check('pg has not been loaded by anything this test loaded', pgLoaded(), false);
  check('without NOSE_B2B_DB_URL: writes answer "not configured", a key finds no store',
    [await b2b.upsertBatches(1, [row]), await b2b.upsertRead(1, 'B-1', { usable: false, rejectReasons: ['x'] }),
     await b2b.storeForKey(b2b.newKey('public')), b2b.configured()],
    [b2b.NOT_CONFIGURED, b2b.NOT_CONFIGURED, null, false]);
  check('...and pg is never loaded', pgLoaded(), false);

  /* --- the bounded connection, against a stand-in Client ----------------- */
  class FakeClient extends EventEmitter {
    constructor(config) { super(); this.config = config; this.ended = 0; FakeClient.made.push(this); }
    connect() { return FakeClient.behaviour.connect(this); }
    query(sql, params) { this.sql = sql; this.params = params; return FakeClient.behaviour.query(this); }
    end() { this.ended++; return Promise.resolve(); }
  }
  FakeClient.made = [];
  const behave = (connect, query) => { FakeClient.behaviour = { connect, query }; };
  const ok = () => Promise.resolve();
  const hang = () => new Promise(() => {});
  const counted = () => Promise.resolve({ rows: [{ inserted: 1, updated: 0 }] });
  process.env.NOSE_B2B_DB_URL = fakeB2bUrl();

  behave(ok, counted);
  const stray = { ...row, row: 7, outcome: null, reasons: ['x'], internal_note: 'left out', store_id: 99, first_listed_on: '2020-01-01' };
  const res = await b2b.upsertBatches('5', [stray], { timeoutMs: 200, _Client: FakeClient });
  const c = FakeClient.made[FakeClient.made.length - 1];
  await tick();
  check('upsertBatches: one connection, TLS verified against the embedded CA, bounded, one statement, closed',
    [res, c.config.connectionString === process.env.NOSE_B2B_DB_URL, /BEGIN CERTIFICATE/.test(c.config.ssl && c.config.ssl.ca),
     c.config.connectionTimeoutMillis, c.config.query_timeout, c.sql === b2b.UPSERT_BATCHES_SQL, c.listenerCount('error') >= 1, c.ended],
    [{ inserted: 1, updated: 0 }, true, true, 200, 200, true, true, 1]);
  check('...the store id from the argument; of the row, BATCH_FIELDS alone - nothing else a caller attached',
    [c.params[0], Object.keys(JSON.parse(c.params[1])[0])], ['5', [...b2b.BATCH_FIELDS]]);
  check('...a plain query, never a named one: the transaction pooler cannot run prepared statements', typeof c.sql, 'string');
  for (const [what, connect, query] of [['connect', hang, counted], ['query', ok, hang]]) {
    behave(connect, query);
    const t0 = Date.now();
    const e = await rejects(() => b2b.upsertBatches(1, [row], { timeoutMs: 60, _Client: FakeClient }));
    const took = Date.now() - t0;
    await tick();
    check(`a hung ${what} is given up at the budget, and the client closed`,
      [e && e.message, took >= 55 && took < 500, FakeClient.made[FakeClient.made.length - 1].ended],
      ['b2b-store: gave up after 60ms', true, 1]);
  }
  let rejectLate;
  behave(() => new Promise((_, rej) => { rejectLate = rej; }), counted);
  await rejects(() => b2b.storeForKey(b2b.newKey('secret'), { timeoutMs: 30, _Client: FakeClient }));
  FakeClient.made[FakeClient.made.length - 1].emit('error', new Error('socket hang up'));
  rejectLate(new Error('Connection terminated'));
  await sleep(20);
  check('a socket lost after giving up, and a late rejection, crash nothing', unhandled.length, 0);
  const made = FakeClient.made.length;
  process.env.NOSE_B2B_DB_URL = fakeB2bUrl() + '?sslmode=require';
  const ssl = await rejects(() => b2b.upsertBatches(1, [row], { _Client: FakeClient }));
  process.env.NOSE_B2B_DB_URL = fakeB2bUrl();
  check('a NOSE_B2B_DB_URL with sslmode is refused before any client exists, as NOSE_DB_URL is',
    [!!ssl && /NOSE_B2B_DB_URL must not contain sslmode/.test(ssl.message), FakeClient.made.length], [true, made]);

  /* --- scrubbed errors ----------------------------------------------------- */
  const key = b2b.newKey('secret');
  const partKey = b2b.newKey('public').slice(0, 20);
  const pgError = Object.assign(new Error(`invalid input syntax for type numeric: "jane@example.org" near ${key} ${partKey} ${'a'.repeat(64)} ` +
    'https://coa.example/r.pdf?t=1 db.abcdefghijklmnopqrst.supabase.co:5432 203.0.113.9 2001:db8::1'),
    { code: '22P02', constraint: 'batches_thc_percent_check', detail: `Failing row contains (1, B-1, jane@example.org, ${key}).`, where: 'x', hint: 'y' });
  behave(ok, () => Promise.reject(pgError));
  const scrubbedErr = await rejects(() => b2b.upsertBatches(1, [row], { timeoutMs: 200, _Client: FakeClient }));
  const said = scrubbedErr ? scrubbedErr.message : '';
  check('a database error comes back scrubbed: no quoted value, key, fingerprint, address, host or IP',
    ['jane@example.org', key, key.slice(4), partKey, partKey.slice(4), 'a'.repeat(64), 'coa.example', 'supabase', '203.0.113.9', '2001:db8'].filter(s => said.includes(s)), []);
  check('...with its SQLSTATE and constraint name, and never its detail - where Postgres puts the failing row',
    [scrubbedErr.code, scrubbedErr.constraint, 'detail' in scrubbedErr, 'where' in scrubbedErr, said.startsWith('b2b-store: invalid input syntax for type numeric: <value>')],
    ['22P02', 'batches_thc_percent_check', false, false, true]);
  const clientErr = await rejects(() => b2b.upsertRead(1, 'B-1', { usable: false }, { client: { query: () => Promise.reject(pgError) } }));
  check('...the same when the caller passes its own client', [clientErr.message === said, 'detail' in clientErr], [true, false]);
  check('a malformed key is never sent: storeForKey answers null without a query',
    [await b2b.storeForKey('nsk_' + 'g'.repeat(64), { client: { query: () => { throw new Error('queried'); } } }), await b2b.storeForKey(undefined)], [null, null]);
  delete process.env.NOSE_B2B_DB_URL;

  /* --- set-b2b-password.js's address ------------------------------------- */
  const url = b2bUrl({ ref: 'abcdefghijklmnopqrst', host: 'aws-0-us-east-1.pooler.supabase.com' }, 'f'.repeat(64));
  const u = new URL(url);
  check('NOSE_B2B_DB_URL as set-b2b-password.js writes it: nose_b2b.<ref>, the transaction pooler, no sslmode - and the probe reads its ref',
    [decodeURIComponent(u.username), u.port, u.pathname, u.search, store._checkUrl(url, 'NOSE_B2B_DB_URL') === url, probe.b2bTarget(url).ref],
    ['nose_b2b.abcdefghijklmnopqrst', '6543', '/postgres', '', true, 'abcdefghijklmnopqrst']);
  const pwSrc = fs.readFileSync(path.join(ROOT, 'scripts/set-b2b-password.js'), 'utf8');
  check('...setting its password with set-writer-password.js\'s own SCRAM verifier, not a copy of it',
    [/require\(path\.resolve\(__dirname, 'set-writer-password\.js'\)\)/.test(pwSrc), /pbkdf2|createHmac/.test(pwSrc), /alter role \$\{ROLE\} password '\$\{verifier\}'/.test(pwSrc)],
    [true, false, true]);

  /* --- lib/b2b-flag.js ---------------------------------------------------- */
  const flagCases = [];
  for (const [context, value, want] of [
    ['production', '1', true], ['production', '0', false], ['production', 'true', false], ['production', ' 1', false],
    ['production', '1 ', false], ['production', '', false], ['production', undefined, false],
    ['dev', '1', false], ['deploy-preview', '1', false], ['branch-deploy', '1', false]
  ]) {
    version.pin({ parserVersion: 'abc1234', extractorVersion: 'abc123456789', deployContext: context });
    const env = value === undefined ? {} : { B2B_ENABLED: value };
    if (b2bEnabled(env) !== want) flagCases.push(`${context} ${JSON.stringify(value)}`);
  }
  version.pin(version.DEV);
  check('b2bEnabled(): true only for B2B_ENABLED exactly "1" on a production build - every other value, and every other context, off',
    flagCases, []);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nose-b2b-flag-'));
  const lib = path.join(tmp, 'netlify/functions/lib');
  fs.mkdirSync(lib, { recursive: true });
  for (const f of ['version.js', 'b2b-flag.js']) fs.copyFileSync(path.join(LIB, f), path.join(lib, f));
  const flagFrom = (info, env) => {
    const file = path.join(lib, 'build-info.json');
    if (info === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, typeof info === 'string' ? info : JSON.stringify(info));
    const r = spawnSync(process.execPath, ['-e', 'console.log(require("./b2b-flag.js").b2bEnabled())'],
                        { cwd: lib, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
    return r.stdout.trim();
  };
  const prod = { parserVersion: 'abc1234', extractorVersion: 'abc123456789', deployContext: 'production' };
  check('...read from build-info.json as a deploy bundles it: on for production with B2B_ENABLED=1, off without it, off for a preview, a missing or a broken file',
    [flagFrom(prod, { B2B_ENABLED: '1' }), flagFrom(prod, {}), flagFrom({ ...prod, deployContext: 'deploy-preview' }, { B2B_ENABLED: '1' }),
     flagFrom(null, { B2B_ENABLED: '1' }), flagFrom('{ not json', { B2B_ENABLED: '1' })],
    ['true', 'false', 'false', 'false', 'false']);
  fs.rmSync(tmp, { recursive: true, force: true });

  /* --- check-published.js: an nsk_ key fails the build --------------------- */
  const GUARD = fs.readFileSync(path.join(ROOT, 'scripts/check-published.js'), 'utf8');
  const git = (dir, args) => execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, stdio: 'ignore' });
  const site = ({ tracked = {}, untracked = {}, guard = GUARD } = {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nose-b2b-published-'));
    const put = (rel, body) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
    put('scripts/check-published.js', guard);
    put('_redirects', '/docs/*  /404.html  404!\n/scripts/*  /404.html  404!\n');
    put('index.html', '<!doctype html>\n<p>Flavour matching from lab reports.</p>\n');
    for (const [f, body] of Object.entries(tracked)) put(f, body);
    git(dir, ['init', '-q']);
    git(dir, ['add', '-A']);
    for (const [f, body] of Object.entries(untracked)) put(f, body);
    const r = spawnSync(process.execPath, [path.join(dir, 'scripts/check-published.js')], { cwd: dir, encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const secretKey = b2b.newKey('secret');
  const publicKey = b2b.newKey('public');
  const clean1 = site();
  const inGit = site({ tracked: { 'docs/setup.md': `Upload with: Authorization: Bearer ${secretKey}\n` } });
  const published = site({ untracked: { 'page.html': `<p data-k="${secretKey}"></p>\n` } });
  const glued = site({ tracked: { 'docs/glued.md': `token=Bearer${secretKey}\n` } });
  const part = site({ tracked: { 'docs/part.md': `the first part: ${secretKey.slice(0, 14)}\n` } });
  const prefixOnly = site({ tracked: { 'docs/keys.md': 'nsk_ for secret, npk_ for public: a secret key looks like nsk_… and is shown once.\n' } });
  const publicPage = site({ untracked: { 'shop.html': `<nose-matches key="${publicKey}"></nose-matches>\n` } });
  check('check-published.js: a clean site passes; a secret key fails it - in a tracked file, in a published one, glued to other text, or the first part of one',
    [clean1.code, inGit.code, /docs\/setup\.md:1: a NOSE dispensary secret key \(nsk_\) \(in git\)/.test(inGit.out),
     published.code, /page\.html:1: a NOSE dispensary secret key \(nsk_\) \(published\)/.test(published.out), glued.code, part.code],
    [0, 1, true, 1, true, 1, 1]);
  check('...and never prints the key it found', [inGit.out, published.out].some(o => o.includes(secretKey.slice(4))), false);
  check('...writing about the prefix passes, and so does a public key on a page: it is not a secret', [prefixOnly.code, publicPage.code], [0, 0]);
  const unguarded = GUARD.replace(/,\n {2}NOSE_SECRET_KEY/g, '');
  check('...and it is this rule that catches the key: a copy of the guard without it passes the same file',
    [unguarded !== GUARD, site({ tracked: { 'docs/setup.md': `Bearer ${secretKey}\n` }, guard: unguarded }).code], [true, 0]);
  const real = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-published.js')], { cwd: ROOT, encoding: 'utf8' });
  check('...the real tree passes', [real.status, /^==> no database hosts or credentials/m.test(real.stdout)], [0, true]);

  /* --- the code: one place deletes, nothing consumer reaches B2B --------- */
  const sources = dir => fs.readdirSync(path.join(ROOT, dir), { recursive: true }).map(f => path.join(dir, String(f)))
    .filter(f => /\.(js|mjs)$/.test(f) && !f.split(path.sep).includes('node_modules'));
  const code = [...sources('netlify'), ...sources('scripts')].map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
  check('the only code that deletes from b2b is scripts/b2b-store.js (and the probe, proving nose_b2b cannot)',
    code.filter(([, s]) => /(delete\s+from|truncate)\s+b2b\./i.test(s)).map(([f]) => f).sort(), ['scripts/b2b-store.js', 'scripts/probe-db.js']);
  check('...and in the probe only inside a refusal it expects',
    code.find(([f]) => f === 'scripts/probe-db.js')[1].split('\n').filter(l => /(delete\s+from|truncate)\s+b2b\./i.test(l)).every(l => /denied\(/.test(l)), true);
  check('no function outside the b2b- ones loads the B2B store or its switch, and lib/b2b-store.js names no table of schema nose',
    [code.filter(([f, s]) => f.startsWith(`netlify${path.sep}functions${path.sep}`) && !/[\\/]b2b-[^\\/]*\.js$/.test(f) &&
                             /b2b-store|b2b-flag/.test(s)).map(([f]) => f),
     /\bnose\.[a-z_]+/.test(code.find(([f]) => f.endsWith(`lib${path.sep}b2b-store.js`))[1])],
    [[], false]);
  const mine = ['supabase/migrations/' + B2B_MIGRATION, 'netlify/functions/lib/b2b-store.js', 'netlify/functions/lib/b2b-flag.js',
                'scripts/b2b-store.js', 'scripts/set-b2b-password.js'];
  check('no effect wording in the dispensary store\'s own files', mine.filter(f => EFFECT_WORDS.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))), []);

  process.removeListener('unhandledRejection', onUnhandled);
  return failures;
}

async function main() {
  let PGlite;
  let failures = 0;
  try { failures += await offline(); }
  catch (e) { console.error('b2b-store-test threw:', e && e.stack); process.exit(1); }
  try { ({ PGlite } = await import('@electric-sql/pglite')); }
  catch {
    console.error('FAIL: @electric-sql/pglite is not installed - run: npm install --save-dev @electric-sql/pglite');
    process.exit(1);
  }
  const pg = new PGlite();
  const db = { exec: sql => pg.exec(sql), query: (sql, params) => pg.query(sql, params) };
  try { failures += await run(db); }
  catch (e) { console.error('b2b-store-test threw:', e && e.stack); await pg.close(); process.exit(1); }
  await pg.close();
  if (failures) {
    console.error(`\nb2b-store-test: ${failures} failure${failures === 1 ? '' : 's'}`);
    process.exit(1);
  }
  console.log('\nb2b-store clean');
}

module.exports = { run, offline };
if (require.main === module) main();

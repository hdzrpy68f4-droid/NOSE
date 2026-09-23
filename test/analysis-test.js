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
 * and that both are read-only and security_invoker; then drives
 * scripts/drift.js over a strain with dated, same-day, undated, refused and
 * other-strain batches from two labs, checking every score against the app's
 * own maths and every line for effect wording. As in the other PGlite tests,
 * the assertions live in run(db).
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

  await driftChecks(db, check);
  cliChecks(check);
  return failures;
}

/* No effect wording, anywhere the analysis layer prints or is written. */
const EFFECT_WORDS = /\b(effects?|high|stoned|buzz\w*|relax\w*|energ\w*|calm\w*|focus\w*|sleep\w*|sedat\w*|uplift\w*|euphori\w*|mood\w*|potency|potent|strong(?:er)? hit)\b/i;
const SECRET_TEXT = 'PRIVATE-REPORT-TEXT-MARKER';
const ADDRESS = 'https://example.org/coa/secret-report.pdf';

/* ============================================================= drift.js */
async function driftChecks(db, check) {
  const count = check;
  const { drift, parseArgs, UsageError } = require(path.join(ROOT, 'scripts/drift.js'));
  const M = require(path.join(ROOT, 'scripts/lib/match.js')).load();

  const T = {
    K1: { limonene: 1.0, myrcene: 0.6, caryophyllene: 0.4, linalool: 0.1, pinene_a: 0.05, humulene: 0.02, ocimene: 0 },
    K2: { limonene: 0.8, myrcene: 0.8, caryophyllene: 0.3, linalool: 0.1 },
    K3: { limonene: 0.9, myrcene: 0.5, caryophyllene: 0.5, terpinolene: 0.2 },
    K4: { myrcene: 1.2, limonene: 0.3, caryophyllene: 0.6, humulene: 0.2 },
    A1: { limonene: 0.7, myrcene: 0.7, caryophyllene: 0.5, pinene_b: 0.1 },
    U1: { caryophyllene: 1.0, limonene: 0.2 }
  };
  const bp = (batch, extra) => reading({ strain: '(I) Gelato de Limon', batch, terps: T[batch], ...extra });
  const scan = (name, output) => store.saveScan({ sha256: sha(name), byteSize: 1000, sourceUrl: ADDRESS, fetchedAt: '2026-09-22T12:00:00Z',
    extractorVersion: 'x1', text: `${name} ${SECRET_TEXT}`, parserVersion: 'abc1234', context: 'production', output }, { client: db });
  await scan('d-K1', bp('K1', { harvestOn: '2026-01-10', reportOn: '2026-01-20', client: 'Grower A' }));
  await scan('d-A1', bp('A1', { lab: 'ACS Laboratory', productClass: 'vape', harvestOn: '2026-02-01', client: 'Grower A' }));
  await scan('d-K2', bp('K2', { reportOn: '2026-03-05', client: 'Grower A' }));
  await scan('d-K3', bp('K3', { strain: 'gelato  DE limon', harvestOn: '2026-03-05', client: 'Grower B' }));
  await scan('d-K4', bp('K4', { harvestOn: '2026-05-01', client: 'Grower A' }));
  await scan('d-U1', bp('U1', { client: 'Grower A' }));
  await scan('d-R1', bp('K1', { batch: 'R1', usable: false, rejectReasons: ['only 1 terpene found'], harvestOn: '2026-04-01' }));
  await scan('d-other', bp('K1', { strain: 'Gelato de Limon #2', batch: 'O1', harvestOn: '2026-02-02' }));

  const run = async args => {
    const lines = [];
    const result = await drift({ db, ...args, log: l => lines.push(l) });
    return { lines, result, text: lines.join('\n') };
  };
  const all = await run({ strain: 'GELATO de  limon' });
  const r = all.result;
  const labelled = r.dated.flatMap(d => d.batches.map(b => `${b.label} ${b.batch_date} ${b.batch}`));
  count('drift: dated batches oldest first; same-day batches share a place, in no order (3a, 3b)',
    labelled, ['1 2026-01-10 K1', '2 2026-02-01 A1', '3a 2026-03-05 K2', '3b 2026-03-05 K3', '4 2026-05-01 K4']);
  count('...the refused reading, the other strain and the undated batch are not placed',
    [r.undated.map(b => b.batch), r.leftOut], [['U1'], 1]);
  count('...each compared with every batch of the day before, and same-day batches with each other',
    r.pairs.map(p => `${p.from.label}${p.sameDay ? '~' : '>'}${p.to.label}`), ['1>2', '2>3a', '2>3b', '3a~3b', '3a>4', '3b>4']);
  /* The terps come back in jsonb's own key order, not the order they were
     written in, and cosine() sums in key order - so the exact check is made
     on the objects drift read, and the written-order score agrees to far
     below anything shown (the app rounds to whole percent). */
  count('...every score is the app\'s own cosine of the app\'s own share-of-total profiles, to the last bit',
    r.pairs.every(p => Object.is(p.score, M.cosine(M.normalize(p.from.terps), M.normalize(p.to.terps)))
                       && JSON.stringify(p.from.shares) === JSON.stringify(M.normalize(p.from.terps))), true);
  const byBatch = Object.fromEntries(Object.entries(T).map(([k, t]) => [k, M.normalize(t)]));
  count('...and within 1e-12 of the score on the terps as written',
    r.pairs.every(p => Math.abs(p.score - M.cosine(byBatch[p.from.batch], byBatch[p.to.batch])) < 1e-12), true);
  const firstPair = all.lines.find(l => /^ {2}1 → 2 /.test(l));
  const s12 = M.cosine(byBatch.K1, byBatch.A1);
  count('...printed with the app\'s rounding and the app\'s band',
    firstPair.trim().split(/\s{2,}/).slice(-3), [s12.toFixed(3), String(Math.round(s12 * 100)), `${M.matchBand(s12)[0]} (${M.matchBand(s12)[1]})`]);
  const shares = Object.entries(byBatch.K1).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, v]) => `${M.TERPENES[k].name} ${(v * 100).toFixed(1)}%`).join(' · ');
  count('...top five as share of total, from the app\'s normalize(), a zero never listed',
    all.lines.includes(`      top five, share of total: ${shares}`), true);
  count('...and each batch says which date it is and what its report printed',
    [all.lines.some(l => /^ {2}1 {3}2026-01-10 {2}harvest {2}Kaycha Labs · client Grower A · batch K1 · flower {3}parse #\d+$/.test(l)),
     all.lines.some(l => /^ {2}3a {2}2026-03-05 {2}report {3}Kaycha Labs/.test(l)),
     all.lines.includes('      printed name "(I) Gelato de Limon" · total terpenes 2%')], [true, true, true]);
  count('...the notes: two labs, two clients, two forms, mixed date kinds, one refusal',
    [/reported by 2 labs \(Kaycha Labs, ACS Laboratory\)/.test(all.text), /2 clients \(Grower A, Grower B\)/.test(all.text),
     /mix product forms \(flower, vape\)/.test(all.text), /mix harvest days and report days/.test(all.text),
     /1 reading under this strain key was refused/.test(all.text)], [true, true, true, true, true]);
  count('...and it says what drift is: between lab reports, not between experiences',
    [all.lines[1], all.lines[all.lines.length - 1]],
    ['Every figure below is as read from a lab report. Drift here is between lab reports, not between experiences.',
     '  - A score compares the measured proportions of two lab reports - drift between lab reports, not between experiences.']);
  count('...no effect wording, no report text, no address, no fingerprint',
    [EFFECT_WORDS.test(all.text), all.text.includes(SECRET_TEXT), all.text.includes('example.org'), all.text.includes(sha('d-K1').slice(0, 8))],
    [false, false, false, false]);

  const kay = (await run({ strain: 'gelato de limon', lab: '  kaycha   LABS ' })).result;
  count('--lab: one lab, matched whole, case and spacing aside',
    [kay.dated.flatMap(d => d.batches.map(b => b.label + b.batch)), kay.pairs.length], [['1K1', '2aK2', '2bK3', '3K4'], 5]);
  const grower = (await run({ strain: 'gelato de limon', client: 'grower b' })).result;
  count('--client: one client', grower.dated.flatMap(d => d.batches.map(b => b.batch)), ['K3']);
  const partial = await run({ strain: 'gelato de limon', lab: 'Kaycha' });
  count('--lab is never a substring match; it lists the labs there are',
    [partial.result.dated.length, partial.lines.includes('Labs: Kaycha Labs (5), ACS Laboratory (1)')], [0, true]);
  const one = await run({ strain: 'gelato de limon', client: 'Grower B' });
  count('one dated batch: nothing to compare', one.lines.includes('Only one dated batch, so there is nothing to compare it with yet.'), true);
  const none = await run({ strain: 'gelato' });
  count('a name with no batches lists the strain keys containing it',
    none.lines.slice(-2), ['No usable batch in the archive has this strain key.', 'Strain keys containing "gelato": gelato de limon (6), gelato de limon #2 (1)']);
  const bare = await run({ strain: '(S)' });
  count('a name that is only a marker has no key', [bare.result.key, /has no strain key/.test(bare.text)], [null, true]);

  const usage = argv => { try { parseArgs(argv); return null; } catch (e) { return e instanceof UsageError; } };
  count('arguments', [parseArgs(['Gelato', '--lab', 'ACS Laboratory', '--client', 'X']), usage([]), usage(['--lab']),
                      usage(['a', 'b']), usage(['a', '--lab', '--client']), usage(['a', '--all'])],
    [{ strain: 'Gelato', lab: 'ACS Laboratory', client: 'X' }, true, true, true, true, true]);
}

/* ============================================ the command lines refuse */
function cliChecks(check) {
  const count = check;
  const { spawnSync } = require('child_process');
  const os = require('os');
  const bare = { PATH: process.env.PATH, HOME: process.env.HOME || os.tmpdir() };
  const cli = (script, args) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], { env: bare, encoding: 'utf8', timeout: 20000 });
  for (const [script, args] of [['drift.js', ['Gelato']]]) {
    const res = cli(script, args);
    count(`${script} with no secrets refuses`, res.status === 1 && /^REFUSED: NOSE_DB_URL.* not set/.test(res.stderr), true);
  }
  const d = cli('drift.js', []);
  count('drift.js with no strain prints its usage', d.status === 2 && /usage: node scripts\/drift\.js/.test(d.stderr), true);
  const sources = ['scripts/drift.js', 'scripts/lib/match.js', 'netlify/functions/lib/coa-dates.js',
                   'supabase/migrations/20260923170000_nose_analysis_views.sql',
                   path.relative(ROOT, require(path.join(ROOT, 'scripts/lib/match.js')).matchFile())]
    .map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
  count('no effect wording in the analysis layer\'s own files', sources.filter(([, s]) => EFFECT_WORDS.test(s)).map(([f]) => f), []);
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

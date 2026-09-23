'use strict';
/* NOSE - scripts/review-queue.js, against real Postgres semantics, offline.
 *
 *   node test/review-queue-test.js      -> "review-queue clean", or FAIL lines and exit 1
 *
 * Saves documents through store.js exactly as a scan, the seed and a reparse
 * do, on PGlite with every migration applied, then drives reviewQueue() and
 * reads what it prints: which documents are listed, in what order, with which
 * reasons, what is only counted, and that no report text or address appears.
 * The command-line refusals are checked by running the script with its
 * secrets removed. As in test/rerun-test.js, the assertions live in run(db).
 */

const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const store = require(path.join(ROOT, 'netlify/functions/lib/store.js'));
const { reviewQueue, parseArgs, UsageError } = require(path.join(ROOT, 'scripts/review-queue.js'));

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const SECRET_TEXT = 'PRIVATE-REPORT-TEXT-MARKER';
const ADDRESS = 'https://example.org/coa/secret-report.pdf';

async function run(db, log = console.log) {
  let failures = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
  };

  const dir = path.join(ROOT, 'supabase/migrations');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  }

  const reading = (lab, strain, extra = {}) => ({
    lab, strain, productClass: 'flower', readBy: 'forward', usable: true, totalTerpenes: 1.5,
    terps: { limonene: 0.7 }, warnings: [], rejectReasons: [], novelty: [], ...extra
  });
  const save = (name, output, { day, context = 'production', text = `${name} ${SECRET_TEXT}` } = {}) =>
    store.saveScan({
      sha256: sha(name), byteSize: 1000, sourceUrl: context === 'production' ? ADDRESS : null,
      fetchedAt: `${day}T12:00:00Z`, extractorVersion: 'x1', text,
      parserVersion: 'abc1234', context, output
    }, { client: db });
  const short = name => sha(name).slice(0, 8);

  /* Oldest first, as they would arrive. */
  await save('quiet', reading('Kaycha Labs', 'Quiet'), { day: '2026-09-20' });
  await save('refused', reading('Modern Canna', 'Refused', { usable: false,
    rejectReasons: ['no total terpene figure printed, so coverage cannot be known'] }), { day: '2026-09-21' });
  await save('novel', reading('ACS Laboratory', 'Novel', { novelty: ['unmapped: Moisture'] }), { day: '2026-09-22' });
  await save('both', reading(null, null, { usable: false, rejectReasons: ['lab reported a total of zero terpenes'],
    novelty: ['lab not recognised', 'heading not known: "Conc."'] }), { day: '2026-09-22' });
  await save('old', (({ novelty, ...o }) => o)(reading('Kaycha Labs', 'Before')), { day: '2026-09-19' });
  await save('fixture', reading('Method Testing Labs', 'Hemp', { usable: false, rejectReasons: ['the lab did not run a terpene panel on this sample'] }),
             { day: '2026-09-23', context: 'seed' });
  /* Refused once, then read again and accepted: A -> B, latest wins. */
  await save('fixed', reading('ACT Laboratories', 'Fixed', { usable: false, rejectReasons: ['only 1 terpene found'] }), { day: '2026-09-18' });
  await save('fixed', reading('ACT Laboratories', 'Fixed'), { day: '2026-09-18', context: 'reparse' });
  /* Its first text was refused; a newer extraction reads fine - the newest extraction wins. */
  await save('reextracted', reading('TerpLife Labs', 'Old text', { usable: false, rejectReasons: ['coverage too low'] }),
             { day: '2026-09-17', text: `first text ${SECRET_TEXT}` });
  await save('reextracted', reading('TerpLife Labs', 'New text'), { day: '2026-09-17', context: 'reparse', text: `second text ${SECRET_TEXT}` });

  const printed = async opts => {
    const lines = [];
    const result = await reviewQueue({ db, log: l => lines.push(l), ...opts });
    return { lines, result, text: lines.join('\n') };
  };
  const headsOf = lines => lines.filter(l => /^[0-9a-f]{8}  /.test(l)).map(l => l.slice(0, 8));

  const q = await printed({});
  check('refused or new, newest first; accepted, fixed, re-read and old readings are not listed',
    headsOf(q.lines), [short('both'), short('novel'), short('refused')]);
  check('the counts it returns', q.result, { listed: 3, due: 3, total: 8, hiddenFixtures: 1, predates: 1 });
  check('a document shows its day, lab, strain, class and verdict',
    q.lines.find(l => l.startsWith(short('refused'))), `${short('refused')}  2026-09-21  Modern Canna | Refused | flower  refused`);
  check('a missing lab and strain say so',
    q.lines.find(l => l.startsWith(short('both'))), `${short('both')}  2026-09-22  (no lab) | (no strain) | flower  refused`);
  const block = name => q.lines.slice(q.lines.findIndex(l => l.startsWith(short(name))) + 1)
    .filter((l, i, a) => a.slice(0, i + 1).every(x => x.startsWith('          ')));
  check('a refusal lists the parser\'s own reasons',
    block('refused'), ['          refused  no total terpene figure printed, so coverage cannot be known']);
  check('novelty lists its notes',
    block('novel'), ['          new      unmapped: Moisture']);
  check('both, reasons first',
    block('both'), ['          refused  lab reported a total of zero terpenes', '          new      lab not recognised',
                    '          new      heading not known: "Conc."']);
  check('the seeded fixture is counted, not listed',
    q.lines.includes('1 test fixture (seeded) is not listed - add --fixtures to see it'), true);
  check('a reading from before novelty is counted, with the command that fills it in',
    q.lines.includes('1 document was last read before novelty existed, so only a refusal can show for it - to fill it in: node scripts/reparse.js'), true);
  check('it ends by saying how to turn one into a fixture',
    q.lines.slice(-2), ['To turn one into a test fixture:  node scripts/export-candidate.js <fingerprint> [LAB-FORM-NNN]',
                        'then write its expected values into the baseline by hand, from the PDF (PARSER-HANDOFF s10).']);
  check('no report text, no address, no full fingerprint is printed',
    [q.text.includes(SECRET_TEXT), q.text.includes('example.org'), q.text.includes(sha('refused'))], [false, false, false]);

  const all = await printed({ fixtures: true });
  check('--fixtures lists the fixture too, marked', headsOf(all.lines)[0], short('fixture'));
  check('...marked as one', all.lines.some(l => l.startsWith(short('fixture')) && l.endsWith('refused  [fixture]')), true);

  const one = await printed({ limit: 1 });
  check('--limit shows that many, and says how many more', [headsOf(one.lines), one.lines.includes('... and 2 more - add --limit 3')],
    [[short('both')], true]);

  /* Arguments. */
  const usage = argv => { try { parseArgs(argv); return null; } catch (e) { return e instanceof UsageError; } };
  check('arguments: --limit N and --fixtures', parseArgs(['--limit', '7', '--fixtures']), { limit: 7, fixtures: true });
  check('arguments: the default', parseArgs([]), { limit: 50, fixtures: false });
  check('arguments: anything else is a usage error', [usage(['--limit']), usage(['--limit', '0']), usage(['--all']), usage(['x'])],
    [true, true, true, true]);

  /* The command line refuses before touching anything. */
  const bare = { PATH: process.env.PATH, HOME: process.env.HOME || os.tmpdir() };
  const cli = args => spawnSync(process.execPath, [path.join(ROOT, 'scripts/review-queue.js'), ...args],
                                { env: bare, encoding: 'utf8', timeout: 20000 });
  const refused = cli([]);
  check('with no secrets it refuses', refused.status === 1 && /^REFUSED: NOSE_DB_URL.* not set/.test(refused.stderr), true);
  const bad = cli(['--everything']);
  check('an unknown option prints its usage', bad.status === 2 && /usage: node scripts\/review-queue\.js/.test(bad.stderr), true);

  return failures;
}

async function main() {
  let PGlite;
  try { ({ PGlite } = await import('@electric-sql/pglite')); }
  catch {
    console.error('FAIL: @electric-sql/pglite is not installed - run: npm install');
    process.exit(1);
  }
  const pg = new PGlite();
  const db = { exec: sql => pg.exec(sql), query: (sql, params) => pg.query(sql, params) };
  let failures;
  try { failures = await run(db); }
  catch (e) { console.error('review-queue-test threw:', e && e.stack); process.exit(1); }
  finally { await pg.close(); }
  if (failures) {
    console.error(`\nreview-queue-test: ${failures} failure${failures === 1 ? '' : 's'}`);
    process.exit(1);
  }
  console.log('\nreview-queue clean');
}

module.exports = { run };
if (require.main === module) main();

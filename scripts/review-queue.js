#!/usr/bin/env node
'use strict';
/* What in the archive needs a person to look at it: every document whose
 * latest reading was refused, or is new to the parser (PARSER-HANDOFF s7,
 * `novelty`), newest first, with the reasons.
 *
 *   node scripts/review-queue.js                 the newest 50
 *   node scripts/review-queue.js --limit 200
 *   node scripts/review-queue.js --fixtures      the seeded test fixtures too
 *
 * "Latest reading" is the one reparse.js stands by: each document's newest
 * extraction, and that extraction's latest parse. A refusal lists the
 * parser's own reasons (rejectReasons); novelty lists its notes. Newest means
 * the day the document was first fetched, then the order it arrived.
 *
 * Documents first stored by the seed ARE the test fixtures - already on disk
 * and baselined, or deliberately refused - so they are counted, not listed,
 * unless --fixtures. A reading from before novelty existed has no novelty
 * field; those are counted too, with the command that fills it in.
 *
 * Ends with how to turn one into a fixture: scripts/export-candidate.js.
 *
 * Reads only, as nose_writer. Needs NOSE_DB_URL. Prints no report text, no
 * addresses, no secrets.
 */

const rerun = require('./lib/rerun');

const USAGE = 'usage: node scripts/review-queue.js [--limit N] [--fixtures]';
const DEFAULT_LIMIT = 50;

class UsageError extends Error {}

/* One row per document, with its latest reading. No text and no address is
   selected at all, so neither can be printed. */
const QUEUE_SQL = `
  select d.id::text as id, d.sha256, d.first_fetched_on::text as day,
         p.usable, p.lab, p.strain, p.product_class,
         p.output -> 'rejectReasons' as reasons,
         p.output -> 'novelty' as novelty,
         exists (select 1
                   from nose.extractions x
                   join nose.parses s on s.extraction_id = x.id
                  where x.document_id = d.id and s.context = 'seed') as seeded
    from nose.documents d
    join lateral (
          select x.id from nose.extractions x
           where x.document_id = d.id
           order by x.id desc
           limit 1) e on true
    join lateral (
          select y.usable, y.lab, y.strain, y.product_class, y.output
            from nose.parses y
           where y.extraction_id = e.id
           order by y.id desc
           limit 1) p on true
   order by d.first_fetched_on desc, d.id desc`;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const strings = v => (Array.isArray(v) ? v.filter(s => typeof s === 'string' && s) : []);

function parseArgs(argv) {
  const opts = { limit: DEFAULT_LIMIT, fixtures: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fixtures') opts.fixtures = true;
    else if (a === '--limit' && /^[1-9]\d{0,5}$/.test(argv[i + 1] || '')) opts.limit = Number(argv[++i]);
    else throw new UsageError(`unknown: ${a}${a === '--limit' ? ' (give a number)' : ''}\n${USAGE}`);
  }
  return opts;
}

/* The queue itself, with the connection passed in, so test/review-queue-test.js
 * can drive it on PGlite. */
async function reviewQueue({ db, limit = DEFAULT_LIMIT, fixtures = false, log = console.log }) {
  const rows = (await db.query(QUEUE_SQL)).rows;

  const due = [];
  let hiddenFixtures = 0;
  let predates = 0;
  for (const r of rows) {
    const hasNovelty = Array.isArray(r.novelty);
    if (!hasNovelty) predates++;
    const refused = r.usable === false;
    const notes = strings(r.novelty);
    if (!refused && !notes.length) continue;
    if (r.seeded && !fixtures) { hiddenFixtures++; continue; }
    due.push({ ...r, refused, notes, reasons: strings(r.reasons) });
  }

  log(`review queue: ${plural(due.length, 'document')} to look at, newest first ` +
      `(${plural(rows.length, 'document')} in the archive)`);
  const shown = due.slice(0, limit);
  for (const r of shown) {
    const what = [r.lab || '(no lab)', r.strain || '(no strain)', r.product_class || '-'].join(' | ');
    log('');
    log(`${rerun.short(r.sha256)}  ${r.day}  ${what}  ${r.refused ? 'refused' : 'usable'}${r.seeded ? '  [fixture]' : ''}`);
    if (r.refused && !r.reasons.length) log('          refused  (no reason was stored)');
    for (const why of r.reasons) log(`          refused  ${why}`);
    for (const note of r.notes) log(`          new      ${note}`);
  }
  if (due.length > shown.length) { log(''); log(`... and ${due.length - shown.length} more - add --limit ${due.length}`); }

  const quiet = [];
  if (hiddenFixtures) {
    quiet.push(`${plural(hiddenFixtures, 'test fixture')} (seeded) ${hiddenFixtures === 1 ? 'is' : 'are'} not listed - add --fixtures to see ${hiddenFixtures === 1 ? 'it' : 'them'}`);
  }
  if (predates) {
    const one = predates === 1;
    quiet.push(`${plural(predates, 'document')} ${one ? 'was' : 'were'} last read before novelty existed, so only a refusal ` +
               `can show for ${one ? 'it' : 'them'} - to fill it in: node scripts/reparse.js`);
  }
  if (quiet.length) { log(''); quiet.forEach(q => log(q)); }

  log('');
  log('To turn one into a test fixture:  node scripts/export-candidate.js <fingerprint> [LAB-FORM-NNN]');
  log('then write its expected values into the baseline by hand, from the PDF (PARSER-HANDOFF s10).');
  return { listed: shown.length, due: due.length, total: rows.length, hiddenFixtures, predates };
}

async function main(argv = process.argv.slice(2)) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const missing = rerun.missingSecrets(['NOSE_DB_URL'], process.env);
  if (missing) {
    console.error(`REFUSED: ${missing}`);
    process.exit(1);
  }
  let db = null;
  try {
    db = rerun.openDb();
    await rerun.connectAsWriter(db);
    await reviewQueue({ db, ...opts });
  } catch (e) {
    console.error(`review-queue failed: ${rerun.explain(e)}`);
    process.exitCode = 1;
  } finally {
    if (db) await db.end().catch(() => {});
  }
}

module.exports = { reviewQueue, parseArgs, QUEUE_SQL, USAGE, UsageError };
if (require.main === module) {
  main().catch(e => { console.error('review-queue failed:', e && e.message); process.exit(1); });
}

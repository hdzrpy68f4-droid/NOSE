#!/usr/bin/env node
'use strict';
/* Per lab: how the parser fares with that lab's reports.
 *
 *   node scripts/lab-stats.js
 *
 * From nose.latest_parses - each document's latest reading, as reparse.js and
 * review-queue.js read it - one block per lab:
 *
 *   documents            documents whose latest reading names the lab, and
 *                        how many of them are test fixtures stored by the seed
 *   accepted             how many of those readings are usable, and the rate
 *   median coverage      the median measuredCoverage (s6: did we read the
 *                        table?) over the readings that carry one
 *   most common warning  the warning most readings of that lab carry, with
 *                        its figures shown as # so that one kind of warning
 *                        counts as one, and how many readings carry it
 *
 * Readings whose lab was not recognised are one group of their own. This
 * describes the parser's readings of lab reports - how complete, how often
 * refused - and nothing about any product.
 *
 * Reads only, as nose_writer. Needs NOSE_DB_URL. Prints no report text, no
 * addresses, no secrets: the warnings it prints are the parser's own
 * sentences, the ones the card shows.
 */

const rerun = require('./lib/rerun');

const USAGE = 'usage: node scripts/lab-stats.js';
const UNRECOGNISED = '(lab not recognised)';

/* No text, no address: the lab, the verdict, two fields of the output, and
   whether the seed stored the document (it is then a test fixture). */
const STATS_SQL = `
  select l.lab, l.usable,
         l.output -> 'measuredCoverage' as coverage,
         l.output -> 'warnings' as warnings,
         exists (select 1
                   from nose.extractions x
                   join nose.parses s on s.extraction_id = x.id
                  where x.document_id = l.document_id and s.context = 'seed') as seeded
    from nose.latest_parses l`;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');

function median(values) {
  const v = values.filter(x => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/* One kind of warning: the sentence with its figures as #, so "add up to
   103.8%" and "add up to 102.2%" are the same warning. */
const kindOf = w => String(w).replace(/\d+(?:\.\d+)?/g, '#');

/* The kind most readings carry - each reading counts a kind once - and how
   many other kinds tie with it. */
function commonest(warningLists) {
  const tally = new Map();
  for (const list of warningLists) {
    const kinds = new Set((Array.isArray(list) ? list : []).filter(w => typeof w === 'string' && w).map(kindOf));
    for (const k of kinds) tally.set(k, (tally.get(k) || 0) + 1);
  }
  if (!tally.size) return null;
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [kind, count] = ranked[0];
  return { kind, count, tied: ranked.filter(([, n]) => n === count).length - 1 };
}

function summarise(rows) {
  const labs = new Map();
  for (const r of rows) {
    const name = r.lab || UNRECOGNISED;
    if (!labs.has(name)) labs.set(name, []);
    labs.get(name).push(r);
  }
  return [...labs.entries()]
    .map(([lab, rs]) => ({
      lab,
      documents: rs.length,
      fixtures: rs.filter(r => r.seeded).length,
      accepted: rs.filter(r => r.usable === true).length,
      coverage: median(rs.map(r => r.coverage)),
      withCoverage: rs.filter(r => typeof r.coverage === 'number' && Number.isFinite(r.coverage)).length,
      warning: commonest(rs.map(r => r.warnings))
    }))
    .sort((a, b) => (a.lab === UNRECOGNISED) - (b.lab === UNRECOGNISED) || b.documents - a.documents || a.lab.localeCompare(b.lab));
}

async function labStats({ db, log = console.log }) {
  const rows = (await db.query(STATS_SQL)).rows;
  const labs = summarise(rows);
  const fixtures = rows.filter(r => r.seeded).length;

  log(`lab-stats: ${plural(labs.length, 'lab')}, ${plural(rows.length, 'document')} - each document's latest reading, as reparse.js reads it`);
  if (fixtures === rows.length && fixtures) log(`(${fixtures === 1 ? 'it is a test fixture' : `all ${fixtures} are test fixtures`} stored by the seed - nothing scanned yet)`);
  else if (fixtures) log(`(${fixtures} of them ${fixtures === 1 ? 'is a test fixture' : 'are test fixtures'} stored by the seed; the other ${rows.length - fixtures} came from scans)`);

  for (const s of labs) {
    log('');
    log(s.lab);
    log(`  documents            ${s.documents}${s.fixtures ? `  (${plural(s.fixtures, 'test fixture')})` : ''}`);
    log(`  accepted             ${s.accepted} of ${s.documents} (${pct(s.accepted, s.documents)})`);
    log(`  median coverage      ${s.coverage === null ? 'none recorded'
      : `${(s.coverage * 100).toFixed(1)}%  (${plural(s.withCoverage, 'reading')} ${s.withCoverage === 1 ? 'carries' : 'carry'} one)`}`);
    log(`  most common warning  ${s.warning === null ? 'none'
      : `${s.warning.count} of ${s.documents}${s.warning.tied ? ` (tied with ${plural(s.warning.tied, 'other')})` : ''}: ${s.warning.kind}`}`);
  }

  const accepted = rows.filter(r => r.usable === true).length;
  log('');
  log(`all labs: ${plural(rows.length, 'document')}, accepted ${accepted} of ${rows.length} (${pct(accepted, rows.length)})`);
  log('Coverage is measured coverage (PARSER-HANDOFF s6): the analytes read, against the total the lab printed. A warning is the parser\'s own sentence, figures shown as #.');
  return { labs, documents: rows.length, accepted, fixtures };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length) {
    console.error(`unknown: ${argv.join(' ')}\n${USAGE}`);
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
    await labStats({ db });
  } catch (e) {
    console.error(`lab-stats failed: ${rerun.explain(e)}`);
    process.exitCode = 1;
  } finally {
    if (db) await db.end().catch(() => {});
  }
}

module.exports = { labStats, summarise, median, commonest, kindOf, STATS_SQL, USAGE };
if (require.main === module) {
  main().catch(e => { console.error('lab-stats failed:', e && e.message); process.exit(1); });
}

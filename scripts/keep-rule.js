#!/usr/bin/env node
'use strict';
/* The archive against its keep rule. Reads only.
 *
 *   node scripts/keep-rule.js
 *
 * Two questions, from the Codespace, as nose_writer (NOSE_DB_URL):
 *
 *   1. How many NEW documents arrive per UTC day - by the day each was first
 *      fetched, split by how it arrived (the context of its first parse:
 *      production, seed, backfill) - and where today stands against the cap on
 *      new documents from live scans (nose.daily_document_cap()).
 *   2. Which documents' latest readings - each document's newest text, as
 *      reparse.js reads it - show fewer than two of the three signs of a lab
 *      report the scanner keeps by (lib/archive.js, labReportSigns: a
 *      laboratory, "Certificate of Analysis", a terpene panel). Such a file was
 *      kept under the looser rule before two signs were required; each is
 *      listed with the command that takes it out (scripts/remove-document.js).
 *
 * It was first written as the probe for that rule (PARSER-HANDOFF s13, "What
 * gets kept, and taking it back out") and stays useful after it: run it after
 * a deploy to see the day's count and that nothing below the rule remains.
 *
 * Prints no report text, no strain, no client and no address: short
 * fingerprints, days, how each arrived, labs and signs.
 */

const path = require('path');
const rerun = require('./lib/rerun');

const { LIB } = rerun;

/* The day each document was first fetched, and how it arrived: the context
   of its first parse. No text, no address. */
const ARRIVALS_SQL = `
  select d.id::text as id, d.first_fetched_on::text as day,
         (select p.context
            from nose.extractions e
            join nose.parses p on p.extraction_id = e.id
           where e.document_id = d.id
           order by p.id
           limit 1) as arrived
    from nose.documents d
   order by d.id`;

const KINDS = ['production', 'seed', 'backfill'];
const COMBOS = ['lab + phrase + panel', 'lab + phrase', 'lab + panel', 'phrase + panel', 'lab', 'phrase', 'panel', 'none'];

async function keepRule({ db, log = console.log }) {
  const archive = require(path.join(LIB, 'archive.js'));

  /* --- 1. new documents per UTC day ----------------------------------------- */
  const arrivals = (await db.query(ARRIVALS_SQL)).rows;
  const arrivedAs = new Map(arrivals.map(r => [r.id, r.arrived || '(no parse)']));
  const kinds = [...KINDS];
  const days = new Map();
  for (const r of arrivals) {
    const k = r.arrived || '(no parse)';
    if (!kinds.includes(k)) kinds.push(k);
    if (!days.has(r.day)) days.set(r.day, {});
    days.get(r.day)[k] = (days.get(r.day)[k] || 0) + 1;
  }
  log(`1. New documents per UTC day (the day each was first fetched), by how it arrived - ${plural(arrivals.length, 'document')}`);
  log('');
  log(`   ${'day'.padEnd(12)}${kinds.map(k => k.padStart(12)).join('')}${'total'.padStart(9)}`);
  for (const [day, c] of [...days.entries()].sort()) {
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    log(`   ${day.padEnd(12)}${kinds.map(k => String(c[k] || 0).padStart(12)).join('')}${String(total).padStart(9)}`);
  }
  log('');
  const scanDays = [...days.entries()].filter(([, c]) => c.production).map(([d, c]) => [d, c.production]);
  const scans = scanDays.reduce((a, [, n]) => a + n, 0);
  let busiest = null;
  if (scanDays.length) {
    busiest = scanDays.reduce((best, x) => (x[1] > best[1] ? x : best));
    const sorted = scanDays.map(x => x[1]).sort((a, b) => a - b);
    const mid = sorted.length / 2;
    const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
    log(`   live scans: ${plural(scans, 'new document')} over ${plural(scanDays.length, 'day')} with any; ` +
        `busiest ${busiest[0]} with ${busiest[1]}; median ${median} on a day with any`);
  } else {
    log('   live scans: none yet');
  }

  const today = (await db.query(`select (now() at time zone 'UTC')::date::text as day`)).rows[0].day;
  const todayCount = (await db.query(
    'select count(*)::int as n from nose.documents where first_fetched_on = $1::date', [today])).rows[0].n;
  const hasCap = (await db.query(`select to_regprocedure('nose.daily_document_cap()') is not null as ok`)).rows[0].ok === true;
  let cap = null;
  if (hasCap) {
    cap = (await db.query('select nose.daily_document_cap() as n')).rows[0].n;
    log(`   today (${today}, UTC): ${plural(todayCount, 'new document')} of the ${cap} a day the cap allows from live scans`);
  } else {
    log(`   today (${today}, UTC): ${plural(todayCount, 'new document')}; no daily cap in this database yet ` +
        '- push the migration: npx supabase db push --db-url "$NOSE_DB_ADMIN_URL"');
  }
  const hasWithheld = (await db.query(`select to_regclass('nose.withheld') is not null as ok`)).rows[0].ok === true;
  if (hasWithheld) {
    const w = (await db.query(`select count(*) filter (where kind = 'file')::int as files,
                                      count(*) filter (where kind = 'text')::int as texts from nose.withheld`)).rows[0];
    log(`   withheld - taken out by hand, never kept again: ${plural(w.files, 'file fingerprint')}, ${plural(w.texts, 'text fingerprint')}`);
  }

  /* --- 2. the signs on each document's latest reading ------------------------- */
  const combos = new Map();
  const below = [];
  let seen = 0;
  let noReading = 0;
  let after = '0';
  for (;;) {
    const rows = await rerun.readRows(db, { after });
    if (!rows.length) break;
    for (const r of rows) {
      seen++;
      after = r.id;
      if (!r.output || r.text == null) { noReading++; continue; }
      const shown = archive.signsShown(archive.labReportSigns(r.output, r.text));
      const key = shown.join(' + ') || 'none';
      combos.set(key, (combos.get(key) || 0) + 1);
      if (shown.length < archive.MIN_SIGNS) {
        below.push({ sha: r.sha256, day: r.first_fetched_on, arrived: arrivedAs.get(r.id), lab: r.output.lab, shown });
      }
    }
  }
  log('');
  log(`2. Signs of a lab report on each document's latest reading - ${plural(seen, 'document')}`);
  log(`   (a file is kept only with two of the three: a laboratory, "Certificate of Analysis", a terpene panel)`);
  log('');
  for (const k of COMBOS) if (combos.has(k)) log(`   ${String(combos.get(k)).padStart(5)}  ${k}`);
  if (noReading) log(`   ${String(noReading).padStart(5)}  no text or no reading at all`);
  log('');
  if (!below.length) {
    log('   below the rule: none');
  } else {
    log(`   below the rule: ${below.length}`);
    for (const b of below) {
      log(`   ${rerun.short(b.sha)}  first fetched ${b.day}  arrived as ${String(b.arrived).padEnd(10)}  ` +
          `${typeof b.lab === 'string' && b.lab ? b.lab : '(no lab)'}  signs: ${b.shown.join(' + ') || 'none'}`);
      log(`             node scripts/remove-document.js ${b.sha.slice(0, 8)} --reason notreport`);
    }
  }
  return { documents: arrivals.length, scans, busiest: busiest && busiest[1], today: todayCount, cap, below: below.length };
}

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

async function main() {
  const missing = rerun.missingSecrets(['NOSE_DB_URL'], process.env);
  if (missing) {
    console.error(`REFUSED: ${missing}`);
    process.exit(1);
  }
  console.log('keep-rule: reads only, as nose_writer; prints no report text, strain, client or address\n');
  let db = null;
  try {
    db = rerun.openDb();
    await rerun.connectAsWriter(db);
    await keepRule({ db });
    console.log('\nkeep-rule done - nothing was written');
  } catch (e) {
    console.error(`\nkeep-rule stopped: ${rerun.explain(e)}`);
    process.exitCode = 1;
  } finally {
    if (db) await db.end().catch(() => {});
  }
}

module.exports = { keepRule, ARRIVALS_SQL };
if (require.main === module) main();

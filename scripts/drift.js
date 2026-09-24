#!/usr/bin/env node
'use strict';
/* How one strain's lab reports move from batch to batch.
 *
 *   node scripts/drift.js "<strain>"
 *   node scripts/drift.js "<strain>" --lab "Kaycha Labs"
 *   node scripts/drift.js "<strain>" --client "Sunburn"
 *
 * Reads nose.batch_series (supabase/migrations/20260923170000_nose_analysis_views.sql):
 * each document's latest reading, usable ones only. The strain is keyed by
 * nose.strain_key(), the view's own rule - "(I) Banana Papaya" and
 * "banana  papaya" are one strain, "Banana Papaya #2" is another. --lab and
 * --client pick one lab or one client exactly (case and spacing aside).
 *
 * Dated batches - the harvest day, else the report day, as the parser read
 * them (lib/coa-dates.js) - are listed oldest first, each with the total
 * terpenes its report printed and its top five terpenes as share of total.
 * Then each batch is compared with the one before it: the cosine similarity
 * of the two share-of-total profiles, scored and banded exactly as the app
 * scores a match. Batches dated the same day have no order between them, so
 * each is compared with every batch of the previous day and with each other.
 * Batches with no readable date are listed apart and compared with nothing:
 * never placed by guess.
 *
 * The maths is the app's own: js/match-math.<hash>.js, loaded through
 * scripts/lib/match.js. There is no copy of it here.
 *
 * Drift here is between lab reports, not between experiences: two reports
 * can differ because the batches differ, because the labs or their methods
 * do, or because the products do.
 *
 * Reads only, as nose_writer. Needs NOSE_DB_URL. Prints no report text, no
 * addresses, no secrets.
 */

const rerun = require('./lib/rerun');
const { load } = require('./lib/match');

const USAGE = 'usage: node scripts/drift.js "<strain>" [--lab "<lab>"] [--client "<client>"]';
const TOP = 5;

class UsageError extends Error {}

/* The strain's usable batches, with what each needs: the parse's terps, its
 * class, the strain as printed, and which date the batch date is. Nothing
 * else is selected - no text, no address. */
const SERIES_SQL = `
  select b.lab, b.client, b.batch, b.batch_date, b.total_terpenes::text as total,
         b.parse_id::text as parse_id, p.strain, p.product_class,
         (b.batch_date is not null and b.batch_date = p.harvest_on) as by_harvest,
         p.output -> 'terps' as terps
    from nose.batch_series b
    join nose.parses p on p.id = b.parse_id
   where b.strain_key = $1::text
   order by b.batch_date nulls last, b.parse_id`;

/* Latest readings under the same key that are NOT in the series: refused,
 * or without a verdict. Counted, so the series is not mistaken for all of it. */
const LEFT_OUT_SQL = `
  select count(*)::int as n
    from nose.latest_parses
   where nose.strain_key(strain) = $1::text and usable is not true`;

/* Keys that contain what was typed, for a name that matches nothing. */
const NEAR_SQL = `
  select strain_key as key, count(*)::int as n
    from nose.batch_series
   where strain_key is not null and strpos(strain_key, $1::text) > 0
   group by strain_key
   order by n desc, strain_key
   limit 10`;

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const batches = n => plural(n, 'batch', 'batches');
const same = s => String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();

function parseArgs(argv) {
  const opts = { strain: null, lab: null, client: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lab' || a === '--client') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--') || !v.trim()) throw new UsageError(`${a} needs a name\n${USAGE}`);
      opts[a.slice(2)] = v; i++;
    } else if (a.startsWith('--')) {
      throw new UsageError(`unknown: ${a}\n${USAGE}`);
    } else if (opts.strain === null) {
      opts.strain = a;
    } else {
      throw new UsageError(`one strain at a time - quote a name with spaces\n${USAGE}`);
    }
  }
  if (!opts.strain || !opts.strain.trim()) throw new UsageError(USAGE);
  return opts;
}

/* Top five terpenes as share of total, from the app's normalize(). */
function topShares(M, shares) {
  return Object.entries(shares)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, TOP)
    .map(([key, share]) => `${M.TERPENES[key] ? M.TERPENES[key].name : key} ${(share * 100).toFixed(1)}%`);
}

/* Dated batches into days, oldest first; each batch labelled 1, 2, 3a, 3b... */
function days(batches) {
  const out = [];
  for (const b of batches) {
    const last = out[out.length - 1];
    if (last && last.date === b.batch_date) last.batches.push(b);
    else out.push({ date: b.batch_date, batches: [b] });
  }
  out.forEach((d, i) => d.batches.forEach((b, j) => {
    b.label = d.batches.length === 1 ? String(i + 1) : `${i + 1}${String.fromCharCode(97 + (j % 26))}`;
  }));
  return out;
}

/* Every comparison the series allows: each batch with every batch of the day
 * before, and batches of one day with each other. */
function comparisons(M, dayList) {
  const score = (a, b) => M.cosine(a.shares, b.shares);
  const out = [];
  dayList.forEach((d, i) => {
    if (i > 0) {
      for (const prev of dayList[i - 1].batches) {
        for (const cur of d.batches) out.push({ from: prev, to: cur, sameDay: false, score: score(prev, cur) });
      }
    }
    for (let x = 0; x < d.batches.length; x++) {
      for (let y = x + 1; y < d.batches.length; y++) {
        out.push({ from: d.batches[x], to: d.batches[y], sameDay: true, score: score(d.batches[x], d.batches[y]) });
      }
    }
  });
  return out;
}

async function drift({ db, strain, lab = null, client = null, log = console.log, M = load() }) {
  const key = (await db.query('select nose.strain_key($1::text) as key', [strain])).rows[0].key;
  if (!key) {
    log(`drift: "${strain}" has no strain key - nothing is left once the (I)/(S)/(H) marker and spacing are taken away`);
    return { key: null, dated: [], undated: [], pairs: [] };
  }
  const all = (await db.query(SERIES_SQL, [key])).rows;
  const leftOut = (await db.query(LEFT_OUT_SQL, [key])).rows[0].n;

  log(`drift: strain key "${key}"${lab ? `, lab "${lab}"` : ''}${client ? `, client "${client}"` : ''}`);
  log('Every figure below is as read from a lab report. Drift here is between lab reports, not between experiences.');

  if (!all.length) {
    const near = (await db.query(NEAR_SQL, [key])).rows;
    log('');
    log(`No usable batch in the archive has this strain key${leftOut ? ` (${plural(leftOut, 'reading')} under it ${leftOut === 1 ? 'was' : 'were'} refused)` : ''}.`);
    if (near.length) log(`Strain keys containing "${key}": ${near.map(r => `${r.key} (${r.n})`).join(', ')}`);
    return { key, dated: [], undated: [], pairs: [], leftOut };
  }

  const rows = all.filter(r => (!lab || same(r.lab) === same(lab)) && (!client || same(r.client) === same(client)));
  if (!rows.length) {
    const tally = k => Object.entries(all.reduce((t, r) => ({ ...t, [r[k] || '(none printed)']: (t[r[k] || '(none printed)'] || 0) + 1 }), {}))
      .map(([name, n]) => `${name} (${n})`).join(', ');
    log('');
    log(`None of the ${plural(all.length, 'usable batch', 'usable batches')} under this strain key matches${lab ? ` --lab "${lab}"` : ''}${client ? ` --client "${client}"` : ''}.`);
    log(`Labs: ${tally('lab')}`);
    log(`Clients: ${tally('client')}`);
    return { key, dated: [], undated: [], pairs: [], leftOut };
  }

  const read = rows.map(r => ({ ...r, shares: M.normalize(r.terps || {}) }));
  const dayList = days(read.filter(b => b.batch_date));
  const undated = read.filter(b => !b.batch_date);
  const pairs = comparisons(M, dayList);

  const describe = (b, lead) => {
    const who = [b.lab || '(lab not recognised)', b.client ? `client ${b.client}` : null, b.batch ? `batch ${b.batch}` : 'no batch printed',
                 b.product_class || 'form not stated'].filter(Boolean).join(' · ');
    const top = topShares(M, b.shares);
    log(`${lead}${who}   parse #${b.parse_id}`);
    log(`      printed name "${b.strain}" · total terpenes ${b.total == null ? 'not printed' : `${b.total}%`}`);
    log(`      top five, share of total: ${top.length ? top.join(' · ') : 'no modelled terpene above zero'}`);
  };

  log('');
  if (dayList.length) {
    log(`Dated batches, oldest first (${batches(dayList.reduce((n, d) => n + d.batches.length, 0))}):`);
    for (const d of dayList) {
      for (const b of d.batches) {
        log('');
        describe(b, `  ${b.label.padEnd(4)}${d.date}  ${b.by_harvest ? 'harvest' : 'report '}  `);
      }
    }
  } else {
    log('No batch under this key has a readable harvest or report date, so there is no series to follow.');
  }

  if (pairs.length) {
    log('');
    log('Batch to batch - cosine similarity of the two share-of-total profiles, scored and banded as the app scores a match');
    log('(→ a batch against the day before it; ~ two batches of the same day, which have no order between them):');
    log('');
    for (const p of pairs) {
      const [label, band] = M.matchBand(p.score);
      const link = `${p.from.label} ${p.sameDay ? '~' : '→'} ${p.to.label}`;
      const when = p.sameDay ? `same day, ${p.to.batch_date}` : `${p.from.batch_date} → ${p.to.batch_date}`;
      log(`  ${link.padEnd(10)}${when.padEnd(27)}${p.score.toFixed(3)}  ${String(M.shownScore(p.score)).padStart(3)}  ${label} (${band})`);
    }
  } else if (dayList.length === 1 && dayList[0].batches.length === 1) {
    log('');
    log('Only one dated batch, so there is nothing to compare it with yet.');
  }

  if (undated.length) {
    log('');
    log(`Undated - no readable harvest or report date, so not placed in the series and compared with nothing (${batches(undated.length)}):`);
    for (const b of undated) { log(''); describe(b, '  -   '); }
  }

  const notes = [];
  const labs = [...new Set(rows.map(r => r.lab || '(lab not recognised)'))];
  if (labs.length > 1) {
    notes.push(`These batches were reported by ${labs.length} labs (${labs.join(', ')}). A change between two labs' reports can come from ` +
               'the labs as much as from the batches - add --lab to follow one lab.');
  }
  const clients = [...new Set(rows.map(r => r.client).filter(Boolean))];
  if (clients.length > 1) {
    notes.push(`They come from ${clients.length} clients (${clients.join(', ')}); one name is not proof of one plant - add --client to follow one.`);
  }
  const forms = [...new Set(rows.map(r => r.product_class || 'form not stated'))];
  if (forms.length > 1) {
    notes.push(`They mix product forms (${forms.join(', ')}): each form is a different product, and its report can differ for that reason alone.`);
  }
  const dated = dayList.flatMap(d => d.batches);
  if (dated.some(b => b.by_harvest) && dated.some(b => !b.by_harvest)) {
    notes.push('The dates mix harvest days and report days, and a report comes after its harvest, so order across the two is approximate.');
  }
  if (leftOut) {
    notes.push(`${plural(leftOut, 'reading')} under this strain key ${leftOut === 1 ? 'was' : 'were'} refused by the parser and ${leftOut === 1 ? 'is' : 'are'} not shown - node scripts/review-queue.js lists refusals.`);
  }
  notes.push('A score compares the measured proportions of two lab reports - drift between lab reports, not between experiences.');
  log('');
  log('Notes:');
  notes.forEach(n => log(`  - ${n}`));

  return { key, dated: dayList, undated, pairs, leftOut, notes };
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
  let M;
  try { M = load(); }
  catch (e) {
    console.error(`drift failed: ${e.message}`);
    process.exit(1);
  }
  let db = null;
  try {
    db = rerun.openDb();
    await rerun.connectAsWriter(db);
    await drift({ db, ...opts, M });
  } catch (e) {
    console.error(`drift failed: ${rerun.explain(e)}`);
    process.exitCode = 1;
  } finally {
    if (db) await db.end().catch(() => {});
  }
}

module.exports = { drift, parseArgs, days, comparisons, topShares, SERIES_SQL, USAGE, UsageError };
if (require.main === module) {
  main().catch(e => { console.error('drift failed:', e && e.message); process.exit(1); });
}

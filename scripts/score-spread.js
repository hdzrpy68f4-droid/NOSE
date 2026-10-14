#!/usr/bin/env node
'use strict';
/* How alike the archive's lab reports look to the matching maths.
 *
 *   node scripts/score-spread.js [--class flower|vape|concentrate]
 *
 * It describes lab reports, not experiences. Four tables, each with real
 * scans and seeded test fixtures apart, then together, and a denominator
 * beside every share:
 *
 *   1. score spread    every pair of samples in one product class, scored as
 *                      the app scores a match: cosine() of the two
 *                      normalize()d profiles, banded by matchBand(), the
 *                      median and the 10th and 90th percentiles shown by
 *                      shownScore(). All four from scripts/lib/match.js,
 *                      which loads js/match-math.<hash>.js - the file the app
 *                      loads - and holds no maths of its own; neither does
 *                      this file.
 *   2. a typical jar   for each sample, the share of the other samples in its
 *                      class that score Good or better against it: the
 *                      median, the fewest and the most
 *   3. dropped mass    measuredCoverage (PARSER-HANDOFF s6): the median, and
 *                      how many readings fall under 95%; then the unmapped
 *                      compound names, by how many readings carry each
 *   4. freshness       by lab, flower only: how many readings print a
 *                      moisture number and how many a water activity number,
 *                      and water activity below, inside and above ASTM
 *                      D8197's 0.55-0.65, both edges inside, as the card
 *                      reads it (s13, "Water activity against ASTM D8197")
 *
 * One reading per sample: nose.batch_series, the newest usable document of
 * each lab and lab ID, else of each document (nose.sample_key()), as
 * drift.js reads it. A sample is a test fixture when the seed stored any of
 * its documents, as lab-stats.js counts one. Refused readings are not in it.
 *
 * Reads only, as nose_writer. Needs NOSE_DB_URL. Selects no report text, no
 * address, no strain, batch or client, and prints none.
 */

const rerun = require('./lib/rerun');
const { load } = require('./lib/match');

const USAGE = 'usage: node scripts/score-spread.js [--class flower|vape|concentrate]';
const CLASSES = ['flower', 'vape', 'concentrate'];
const UNRECOGNISED = '(lab not recognised)';
const NO_CLASS = '(no class read)';
const COVERAGE_LINE = 0.95;
/* ASTM D8197's water activity range for dried flower, both edges inside -
   the card's own rule (js/nose.*.js, waterActivityText()). */
const WATER_ACTIVITY_RANGE = [0.55, 0.65];

class UsageError extends Error {}

function parseArgs(argv) {
  if (!argv.length) return { cls: null };
  if (argv.length === 2 && argv[0] === '--class' && CLASSES.includes(argv[1])) return { cls: argv[1] };
  throw new UsageError(`unknown: ${argv.join(' ')}`);
}

/* The usable samples, one row each, with only what the tables need: the
   lab, the class, the profile, coverage, unmapped names, the two freshness
   figures, how many usable documents hold the sample, and whether the seed
   stored any document of it. */
const SPREAD_SQL = `
  with docs as (
    select nose.sample_key(l.lab, l.lab_id, l.document_id) as sample,
           exists (select 1
                     from nose.extractions x
                     join nose.parses s on s.extraction_id = x.id
                    where x.document_id = l.document_id and s.context = 'seed') as seeded
      from nose.latest_parses l),
  fixtures as (
    select sample from docs group by sample having bool_or(seeded))
  select b.parse_id::text as parse_id, b.copies::int as copies, p.lab, p.product_class,
         p.output -> 'terps' as terps,
         p.output -> 'measuredCoverage' as coverage,
         p.output -> 'unmapped' as unmapped,
         p.output -> 'moisture' as moisture,
         p.output -> 'waterActivity' as water_activity,
         nose.sample_key(p.lab, p.lab_id, x.document_id) in (select sample from fixtures) as seeded
    from nose.batch_series b
    join nose.parses p on p.id = b.parse_id
    join nose.extractions x on x.id = p.extraction_id
   order by b.parse_id`;

const GROUPS = [
  ['scans', r => !r.seeded],
  ['fixtures', r => r.seeded],
  ['together', () => true]
];

const isNumber = x => typeof x === 'number' && Number.isFinite(x);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const pct = (a, b) => `${Math.round((100 * a) / b)}%`;
const share = (a, b) => (b ? `${fmt(a)} of ${b} (${pct(a, b)})` : 'none');
const fmt = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/* The value at fraction p of the way through the ranked values, linear
   between neighbours - R's default quantile (type 7), the same as a
   spreadsheet's PERCENTILE.INC; p = 0.5 is the ordinary median. */
function quantile(values, p) {
  const v = values.filter(isNumber).sort((a, b) => a - b);
  if (!v.length) return null;
  const h = (v.length - 1) * p;
  const lo = Math.floor(h);
  return lo + 1 < v.length ? v[lo] + (h - lo) * (v[lo + 1] - v[lo]) : v[lo];
}

/* matchBand()'s bands, closest first, read from matchBand() itself by
   walking the score down from 1 to 0 - so the names and the order are its
   own, and no edge is written here. */
function bandsOf(M) {
  const bands = [];
  for (let i = 1000; i >= 0; i--) {
    const [label, band] = M.matchBand(i / 1000);
    if (!bands.some(b => b.band === band)) bands.push({ label, band });
  }
  const good = bands.findIndex(b => b.band === 'Good');
  if (good < 0) throw new Error('matchBand() has no band named Good');
  return { bands, goodOrBetter: new Set(bands.slice(0, good + 1).map(b => b.band)) };
}

function waterActivityPlace(aw) {
  if (aw < WATER_ACTIVITY_RANGE[0]) return 'below';
  if (aw > WATER_ACTIVITY_RANGE[1]) return 'above';
  return 'inside';
}

/* Rows as label + one column per group, padded to the widest cell. A row of
   one cell is a heading inside the table, printed as it is. */
function table(log, rows) {
  const widths = [0, 0, 0, 0];
  for (const r of rows) if (r.length > 1) r.forEach((c, i) => { widths[i] = Math.max(widths[i], String(c).length); });
  for (const r of rows) {
    log(r.map((c, i) => (i === r.length - 1 ? String(c) : String(c).padEnd(widths[i] + 3))).join('').replace(/\s+$/, ''));
  }
}

function classOrder(a, b) {
  const rank = c => (CLASSES.includes(c) ? CLASSES.indexOf(c) : c === NO_CLASS ? 99 : 50);
  return rank(a) - rank(b) || byText(a, b);
}

/* Every pair inside each group of one class: its score and band; and, per
   sample, how many of the others in its group are Good or better. */
function pairsOf(samples, M, goodOrBetter) {
  const scores = [];
  const bands = new Map();
  const closeCounts = samples.map(() => 0);
  let close = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const score = M.cosine(samples[i].shares, samples[j].shares);
      const band = M.matchBand(score)[1];
      scores.push(score);
      bands.set(band, (bands.get(band) || 0) + 1);
      if (goodOrBetter.has(band)) { close++; closeCounts[i]++; closeCounts[j]++; }
    }
  }
  return { scores, bands, close, closeCounts };
}

async function scoreSpread({ db, cls = null, log = console.log }) {
  const M = load();
  const { bands, goodOrBetter } = bandsOf(M);
  const all = (await db.query(SPREAD_SQL)).rows
    .map(r => ({ ...r, product_class: r.product_class || NO_CLASS, shares: M.normalize(r.terps) }))
    .filter(r => !cls || r.product_class === cls);
  const documents = all.reduce((n, r) => n + (r.copies || 1), 0);
  const fixtures = all.filter(r => r.seeded).length;
  const head = GROUPS.map(([name]) => name);
  const shown = s => (s === null ? 'none' : String(M.shownScore(s)));

  log('score-spread describes lab reports, not experiences: how alike the matching maths finds the archive\'s usable readings, one per sample.');
  log(`scope: ${cls ? `${cls} only (--class ${cls})` : 'every product class, each on its own'}`);
  log(`${plural(all.length, 'usable sample')}${documents !== all.length ? ` from ${plural(documents, 'document')}` : ''}: ` +
      `${all.length - fixtures} from scans, ${plural(fixtures, 'test fixture')} stored by the seed`);

  const classes = [...new Set(all.map(r => r.product_class))].sort(classOrder);
  const scored = all.filter(r => Object.keys(r.shares).length);
  const unscored = all.length - scored.length;
  const perClass = classes.map(c => ({
    cls: c,
    groups: GROUPS.map(([, keep]) => {
      const samples = scored.filter(r => r.product_class === c && keep(r));
      return { samples, ...pairsOf(samples, M, goodOrBetter) };
    })
  }));

  log('');
  log('1. Score spread - every pair of samples in one product class, scored as the app scores a match');
  for (const { cls: c, groups } of perClass) {
    log('');
    const rows = [[c, ...head],
      ['  samples', ...groups.map(g => g.samples.length)],
      ['  pairs', ...groups.map(g => g.scores.length)]];
    for (const b of bands) rows.push([`  ${b.label} (${b.band})`, ...groups.map(g => share(g.bands.get(b.band) || 0, g.scores.length))]);
    rows.push([`  Good or better (${[...goodOrBetter].join(' + ')})`,
      ...groups.map(g => share(g.close, g.scores.length))]);
    rows.push(['  median score', ...groups.map(g => shown(quantile(g.scores, 0.5)))]);
    rows.push(['  10th percentile', ...groups.map(g => shown(quantile(g.scores, 0.1)))]);
    rows.push(['  90th percentile', ...groups.map(g => shown(quantile(g.scores, 0.9)))]);
    table(log, rows);
  }
  if (unscored) log('');
  if (unscored) log(`(${plural(unscored, 'usable sample')} ${unscored === 1 ? 'carries' : 'carry'} no terpene the maths reads, so ${unscored === 1 ? 'it is' : 'they are'} in no pair)`);

  log('');
  log('2. A typical jar - for each sample, the share of the other samples in its class that score Good or better against it');
  for (const { cls: c, groups } of perClass) {
    log('');
    const others = g => Math.max(g.samples.length - 1, 0);
    const at = (g, f) => (g.samples.length > 1 ? share(f(g.closeCounts), others(g)) : 'none');
    table(log, [[c, ...head],
      ['  samples', ...groups.map(g => g.samples.length)],
      ['  others per sample', ...groups.map(others)],
      ['  median', ...groups.map(g => at(g, k => quantile(k, 0.5)))],
      ['  fewest', ...groups.map(g => at(g, k => Math.min(...k)))],
      ['  most', ...groups.map(g => at(g, k => Math.max(...k)))]]);
  }

  log('');
  log('3. Dropped mass - how much of its own printed terpene total each reading recovered (measured coverage)');
  log('');
  const pick = keep => all.filter(keep);
  const groupsAll = GROUPS.map(([, keep]) => pick(keep));
  const withCoverage = groupsAll.map(g => g.filter(r => isNumber(r.coverage)));
  const withList = groupsAll.map(g => g.filter(r => Array.isArray(r.unmapped)));
  const rows3 = [['', ...head],
    ['  readings', ...groupsAll.map(g => g.length)],
    ['  carry a measured coverage', ...withCoverage.map((g, i) => share(g.length, groupsAll[i].length))],
    ['  median measured coverage', ...withCoverage.map(g => { const m = quantile(g.map(r => r.coverage), 0.5); return m === null ? 'none' : `${(m * 100).toFixed(1)}%`; })],
    ['  under 95%', ...withCoverage.map(g => share(g.filter(r => r.coverage < COVERAGE_LINE).length, g.length))],
    ['  carry an unmapped list', ...withList.map((g, i) => share(g.length, groupsAll[i].length))]];
  const names = new Map();
  for (const r of all) {
    if (!Array.isArray(r.unmapped)) continue;
    for (const n of new Set(r.unmapped.filter(x => typeof x === 'string' && x))) {
      if (!names.has(n)) names.set(n, GROUPS.map(() => 0));
      GROUPS.forEach(([, keep], i) => { if (keep(r)) names.get(n)[i]++; });
    }
  }
  const ranked = [...names.entries()].sort((a, b) => b[1][2] - a[1][2] || byText(a[0], b[0]));
  rows3.push([`  unmapped names, by readings carrying each${ranked.length ? '' : ': none'}`]);
  for (const [n, counts] of ranked) rows3.push([`    ${n}`, ...counts.map((k, i) => share(k, withList[i].length))]);
  table(log, rows3);

  log('');
  log(`4. Freshness by lab - flower readings only; water activity against ASTM D8197's ${WATER_ACTIVITY_RANGE[0]}-${WATER_ACTIVITY_RANGE[1]}, both edges inside`);
  if (cls && cls !== 'flower') {
    log(`(flower only, so not in a --class ${cls} run)`);
  } else {
    const flower = all.filter(r => r.product_class === 'flower');
    const labs = [...new Set(flower.map(r => r.lab || UNRECOGNISED))]
      .map(lab => ({ lab, rs: flower.filter(r => (r.lab || UNRECOGNISED) === lab) }))
      .sort((a, b) => (a.lab === UNRECOGNISED) - (b.lab === UNRECOGNISED) || b.rs.length - a.rs.length || byText(a.lab, b.lab));
    if (!labs.length) log('(no flower readings)');
    for (const { lab, rs } of labs) {
      log('');
      const gs = GROUPS.map(([, keep]) => rs.filter(keep));
      const aw = gs.map(g => g.filter(r => isNumber(r.water_activity)));
      const at = place => aw.map(g => share(g.filter(r => waterActivityPlace(r.water_activity) === place).length, g.length));
      table(log, [[lab, ...head],
        ['  flower readings', ...gs.map(g => g.length)],
        ['  print a moisture number', ...gs.map(g => share(g.filter(r => isNumber(r.moisture)).length, g.length))],
        ['  print a water activity number', ...aw.map((g, i) => share(g.length, gs[i].length))],
        [`    below ${WATER_ACTIVITY_RANGE[0]}`, ...at('below')],
        [`    inside ${WATER_ACTIVITY_RANGE[0]}-${WATER_ACTIVITY_RANGE[1]}`, ...at('inside')],
        [`    above ${WATER_ACTIVITY_RANGE[1]}`, ...at('above')]]);
    }
  }

  log('');
  log('Notes');
  log('  - A pair is two samples of one product class. Its score is the app\'s own: cosine() of the two share-of-total profiles from normalize(), banded by matchBand(), shown by shownScore() - floored, as the app shows it.');
  log('  - Median and percentiles are linear between ranked values (R\'s default, type 7), then shown by shownScore().');
  log('  - One reading per sample: the newest usable document of each lab and lab ID, else each document. A sample is a test fixture when the seed stored any of its documents.');
  log('  - Test fixtures are reports collected by hand for the parser\'s tests: a sample, not a market.');
  log('  - Moisture is counted, never judged: no published moisture range was found.');
  log('  - Every figure here describes lab reports, not experiences.');
  return { samples: all.length, documents, fixtures, perClass, bands };
}

async function main(argv = process.argv.slice(2)) {
  let args;
  try { args = parseArgs(argv); }
  catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`${e.message}\n${USAGE}`);
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
    await scoreSpread({ db, cls: args.cls });
  } catch (e) {
    console.error(`score-spread failed: ${rerun.explain(e)}`);
    process.exitCode = 1;
  } finally {
    if (db) await db.end().catch(() => {});
  }
}

module.exports = { scoreSpread, parseArgs, UsageError, quantile, bandsOf, waterActivityPlace, SPREAD_SQL, USAGE, WATER_ACTIVITY_RANGE };
if (require.main === module) {
  main().catch(e => { console.error('score-spread failed:', e && e.message); process.exit(1); });
}

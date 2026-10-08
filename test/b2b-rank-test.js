'use strict';
/* NOSE - the dispensary ranking engine, js/b2b-rank.<hash>.js (PARSER-HANDOFF
 * s14, "The ranking engine").
 *
 *   node test/b2b-rank-test.js      -> "b2b-rank clean", or FAIL lines and exit 1
 *
 * The engine is every decision the widget makes, as plain functions over the
 * feed (b2b-feed's reply), and it holds no maths. This checks:
 *
 *   - one file, loaded as a page loads it (after js/match-math, setting
 *     window.NoseRank; refused without it) and by require() in Node, taking
 *     its maths through scripts/lib/match.js
 *   - no maths of its own: none defined, no score made, no band named; with
 *     every NoseMatch function watched, each number it hands back is one
 *     NoseMatch returned, by the app's own call, cosine(palate, normalize(terps))
 *   - every pair in test/fixtures/match-golden.json scores through rank() as
 *     match-math scores it, to the last bit, and so does each profile against
 *     itself and each of the 65 palates through palateFrom(); a profile scaled
 *     3x shows the same number in the same band
 *   - a batch with no panel NOSE can compare comes after every scored one,
 *     with no number; routes, category, stock and the guardrail leave batches
 *     out and never reorder; ties keep list_position
 *   - palateFrom(): each reason a purchase is skipped, in order; a removed
 *     batch leaves the palate; a batch counts once; the store's window as
 *     PostgreSQL counts it
 *   - soldOut() ranks against the most-bought product's latest batch alone;
 *     voteScore() leaves out the voted batch
 *   - no function reads a batch's name or brand, or any field it does not need
 *   - build.sh syntax-checks and fingerprints it, and its load-order rule -
 *     build.sh's own lines, run here - fails a page that loads it before
 *     js/match-math
 *   - no effect wording in the engine
 *
 * Every feed here is built with lib/b2b-store.js's own FEED_FIELDS, so it has
 * the shape b2b-feed serves. No database, no network, no clock: each call is
 * handed its day.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'js');
const matchLib = require(path.join(ROOT, 'scripts/lib/match.js'));
const M = matchLib.load();
const golden = require(path.join(ROOT, 'test/fixtures/match-golden.json'));
const { FEED_FIELDS, FEED_STORE_FIELDS } = require(path.join(ROOT, 'netlify/functions/lib/b2b-store.js'));

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
};
/* Numbers compared to the last bit: Object.is, so -0 and NaN count too. */
const sameNumbers = (a, b) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
const ids = list => list.map(e => e.batch.batch_id);
const numbersOf = list => list.map(e => [e.batch.batch_id, e.score, e.shown, e.band, e.label, e.unscored]);

/* ===================================================== one file, two ways */

const files = fs.readdirSync(JS).filter(f => /^b2b-rank(\.[0-9a-f]{8})?\.js$/.test(f));
check('exactly one js/b2b-rank.<hash>.js', files.length, 1);
if (files.length !== 1) {
  console.error('\nb2b-rank-test: cannot go on without exactly one engine file - run: bash build.sh');
  process.exit(1);
}
const FILE = path.join(JS, files[0]);
const SRC = fs.readFileSync(FILE, 'utf8');
const R = require(FILE);
check('in Node it exports the engine, frozen: palateFrom, rank, soldOut, voteScore and the skip reasons',
  [Object.keys(R), Object.isFrozen(R), Object.isFrozen(R.REASONS)], [['palateFrom', 'rank', 'soldOut', 'voteScore', 'REASONS'], true, true]);
check("...the reasons: the prompt's five, and 'not inhalable', which the catalog upload makes impossible",
  Object.values(R.REASONS), ['not listed', 'not inhalable', 'no read', 'refused', 'outside the window', 'removed']);
check('...and in Node it takes its maths through scripts/lib/match.js, the loader every script uses',
  /module\.exports = factory\(require\('\.\.\/scripts\/lib\/match\.js'\)\.load\(\)\)/.test(SRC), true);

const MATH_FILE = matchLib.matchFile();
const MATH_SRC = fs.readFileSync(MATH_FILE, 'utf8');
/* As a browser runs it: classic scripts, no module, `self` the window. */
function asPage({ maths = true, NoseMatch } = {}) {
  const win = {};
  win.self = win;
  const ctx = vm.createContext(win);
  if (NoseMatch) win.NoseMatch = NoseMatch;
  else if (maths) vm.runInContext(MATH_SRC, ctx, { filename: path.basename(MATH_FILE) });
  vm.runInContext(SRC, ctx, { filename: files[0] });
  return win;
}
const page = asPage();
check('as a page loads it, after js/match-math: a classic script that sets window.NoseRank, with the same functions',
  page.NoseRank ? Object.keys(R).map(k => (typeof R[k] === 'function' ? page.NoseRank[k].toString() === R[k].toString()
                                                                       : JSON.stringify(page.NoseRank[k]) === JSON.stringify(R[k]))) : null,
  Object.keys(R).map(() => true));
const refusals = [{ maths: false }, { NoseMatch: { cosine: M.cosine, normalize: M.normalize } }].map(o => {
  try { asPage(o); return null; } catch (e) { return e.message; }
});
check('...and loaded before js/match-math, or beside part of it, it refuses to load and says why', refusals,
  refusals.map(() => 'NoseRank needs js/match-math loaded before it (window.NoseMatch)'));

/* ============================================================ the feeds */

const TODAY = '2026-10-08';
const STORE = { window_months: 12, guardrail_thc_points: null, guardrail_cbd_points: null };
const storeOf = s => Object.fromEntries(FEED_STORE_FIELDS.map(k => [k, k in s ? s[k] : null]));
const feedOf = (batches, store = STORE) => ({ store: storeOf({ ...STORE, ...store }), batches });
/* A batch with exactly the feed's fields, in the feed's order. */
const mk = (id, over = {}) => {
  const fields = { batch_id: id, product_id: `P-${id}`, list_position: 0, category: 'flower', route: 'smoking', name: `Name of ${id}`,
                   brand: 'House Brand', product_url: `https://shop.example/menu/${id}`, in_stock: true, thc_percent: null,
                   cbd_percent: null, lab: 'Kaycha Labs', harvest_on: '2026-03-23', report_on: null, usable: true, total_terpenes: 1,
                   terps: null, ...over };
  return Object.fromEntries(FEED_FIELDS.map(k => [k, fields[k] === undefined ? null : fields[k]]));
};
const P = name => golden.profiles.find(p => p.name === name).terps;
const EDGE = name => golden.edges.find(e => e.name === name).terps;
const T = i => golden.profiles[i].terps;
const bought = (id, day = TODAY) => [{ batchId: id, day }];
const at = { today: TODAY };
const FLOWER = { category: 'flower', routes: ['smoking'] };
const VAPE = { category: 'vape', routes: ['inhalation'] };
const OFF = { guardrail_thc_points: null, guardrail_cbd_points: null };

const goldenFeed = feedOf(golden.profiles.map((p, i) => mk(`G${i}`, { list_position: i + 1, terps: p.terps })));
check('the feeds built here have exactly the feed\'s fields, in its order (lib/b2b-store.js FEED_FIELDS, FEED_STORE_FIELDS)',
  [[...new Set(goldenFeed.batches.map(b => Object.keys(b).join(',')))], Object.keys(goldenFeed.store)],
  [[FEED_FIELDS.join(',')], [...FEED_STORE_FIELDS]]);

/* ========================================================= no maths here */

const MATHS = /\bfunction\s+(normalize|cosine|matchBand|shownScore|sanitizeTerps|averageProfiles|coerce|total)\s*\(|\bconst\s+(TERPENES|TERP_ALIAS)\s*=/g;
const BAND_WORDS = [...new Set([1, 0.8, 0.6, 0].flatMap(s => M.matchBand(s)))];
check('it holds no maths: none of match-math\'s functions or tables is defined in it', SRC.match(MATHS), null);
check('...it makes no score: nothing multiplied by 100, no square root or power',
  /\*\s*100\b|\b100\s*\*|Math\.(sqrt|hypot|pow)\b/.test(SRC), false);
check(`...and names no band: matchBand()'s ${BAND_WORDS.length} words come back from matchBand() itself`,
  BAND_WORDS.filter(w => SRC.includes(w)), []);

/* Every NoseMatch function watched: what it was given and what it returned. */
function watchedMaths() {
  const calls = {};
  const S = {};
  for (const [k, v] of Object.entries(M)) {
    if (typeof v !== 'function') { S[k] = v; continue; }
    calls[k] = [];
    S[k] = (...args) => { const out = v(...args); calls[k].push({ args, out }); return out; };
  }
  return { S: Object.freeze(S), calls };
}
{
  const { S, calls } = watchedMaths();
  const W = asPage({ NoseMatch: S }).NoseRank;
  const feed = feedOf([mk('A', { list_position: 1, category: 'vape', route: 'inhalation', terps: T(0), product_id: 'PA' }),
                       mk('B', { list_position: 2, category: 'vape', route: 'inhalation', terps: T(7), product_id: 'PB' }),
                       mk('C', { list_position: 3, category: 'vape', route: 'inhalation', terps: T(9), product_id: 'PC', in_stock: false }),
                       mk('D', { list_position: 4, category: 'vape', route: 'inhalation', terps: T(12), product_id: 'PD' }),
                       mk('E', { list_position: 5, category: 'vape', route: 'inhalation', usable: null, terps: null })]);
  const buys = [{ batchId: 'C', day: '2026-09-01' }, { batchId: 'B', day: '2026-08-01' }, { batchId: 'D', day: '2026-07-01' }];
  const palate = W.palateFrom(feed, buys, [], at);
  const ranked = W.rank(feed, palate, VAPE);
  const vote = W.voteScore(feed, buys, 'PC', at);
  const sold = W.soldOut(feed, buys.slice(0, 1), { ...VAPE, today: TODAY });
  const traced = (e, vector) =>
    calls.cosine.some(c => Object.is(c.out, e.score) && c.args[0] === vector && calls.normalize.some(n => n.out === c.args[1] && n.args[0] === e.batch.terps))
    && calls.shownScore.some(c => Object.is(c.args[0], e.score) && c.out === e.shown)
    && calls.matchBand.some(c => Object.is(c.args[0], e.score) && c.out[0] === e.label && c.out[1] === e.band);
  const scored = ranked.filter(e => !e.unscored);
  const soldScored = sold.ranked.filter(e => !e.unscored);
  check('with every NoseMatch function watched: each palate vector is one averageProfiles() returned',
    [palate, vote.palate, sold.palate].map(p => calls.averageProfiles.some(c => c.out === p.vector)), [true, true, true]);
  check('...each score is one cosine() returned for that palate and normalize() of that batch\'s own terps - the palate first, as the app calls it',
    [scored.length, scored.every(e => traced(e, palate.vector)), soldScored.length, soldScored.every(e => traced(e, sold.palate.vector)),
     traced(vote, vote.palate.vector)], [3, true, 3, true, true]);
  check('...each number shown is shownScore() of that score, and each band and label matchBand()\'s, and the vote carries those',
    [vote.payload.score === vote.shown, vote.payload.band === vote.band, Object.keys(vote.payload)],
    [true, true, ['candidate', 'score', 'band', 'palateSize']]);
  check('...every cosine() call took a palate first and a normalized batch second; and only those five functions were called',
    [calls.cosine.every(c => calls.averageProfiles.some(a => a.out === c.args[0]) && calls.normalize.some(n => n.out === c.args[1])),
     Object.keys(calls).filter(k => calls[k].length).sort()],
    [true, ['averageProfiles', 'cosine', 'matchBand', 'normalize', 'shownScore']]);
}

/* ====================================== the golden scores, through rank() */

{
  const pairs = [], self = [], shownOk = [];
  for (let i = 0; i < golden.profiles.length; i++) {
    const palate = R.palateFrom(goldenFeed, bought(`G${i}`), [], at);
    const by = new Map(R.rank(goldenFeed, palate, FLOWER).map(e => [e.batch.batch_id, e]));
    for (let j = i + 1; j < golden.profiles.length; j++) pairs.push(by.get(`G${j}`));
    self.push(by.get(`G${i}`));
  }
  check(`every pair in match-golden.json - all ${golden.pairs.length} - scores through rank() exactly as match-math scores it, to the last bit`,
    sameNumbers(pairs.map(e => e.score), golden.pairs), true);
  check(`...each of the ${golden.self.length} profiles against itself too`, sameNumbers(self.map(e => e.score), golden.self), true);
  for (const [e, s] of [...pairs.map((e, n) => [e, golden.pairs[n]]), ...self.map((e, n) => [e, golden.self[n]])]) {
    shownOk.push(e.shown === M.shownScore(s) && e.label === M.matchBand(s)[0] && e.band === M.matchBand(s)[1]);
  }
  check('...each shown as shownScore() shows it, labelled and banded as matchBand() names them', shownOk.every(Boolean), true);
}
{
  const ALL = [...golden.profiles, ...golden.edges];
  const results = golden.palates.map(s => {
    const members = s.members.map((m, x) => mk(`M${x}`, { list_position: x + 1, terps: ALL[m].terps }));
    const feed = feedOf([...members, mk('C', { list_position: members.length + 1, terps: ALL[s.candidate].terps })]);
    const palate = R.palateFrom(feed, members.map(b => ({ batchId: b.batch_id, day: TODAY })), [], at);
    const e = R.rank(feed, palate, FLOWER).find(x => x.batch.batch_id === 'C');
    return { vector: palate.vector, score: e ? e.score : null, skipped: palate.basis.skipped.map(x => x.reason) };
  });
  check(`the ${golden.palates.length} golden palates through palateFrom(): the same vectors, key order and all`,
    JSON.stringify(results.map(r => r.vector)), JSON.stringify(golden.palates.map(p => p.vector)));
  check('...each scored against its candidate through rank(), to the last bit', sameNumbers(results.map(r => r.score), golden.palates.map(p => p.score)), true);
  check("...the one with golden's 'empty' edge as a member skips it as 'no read' - averageProfiles() leaves it out of the mean too",
    results.flatMap(r => r.skipped), ['no read']);
  const lemonCreek = feedOf([mk('LEMON', { list_position: 1, terps: P('demo:lemon-tart') }), mk('CREEK', { list_position: 2, terps: P('demo:cold-creek') })]);
  const hero = R.rank(lemonCreek, R.palateFrom(lemonCreek, bought('LEMON'), [], at), FLOWER).find(e => e.batch.batch_id === 'CREEK');
  check('the home page hero pair through the engine: 0.7452..., shown as 74, "Partial overlap" - Moderate',
    [Object.is(hero.score, golden.anchors.heroDefault.score), hero.shown, hero.label, hero.band], [true, 74, 'Partial overlap', 'Moderate']);
}

/* ============================================== 3x the intensity, the same */

{
  const tripled = terps => Object.fromEntries(Object.entries(terps).map(([key, v]) => [key, typeof v === 'number' ? v * 3 : v]));
  const feed = feedOf([...goldenFeed.batches, ...golden.profiles.map((p, i) => mk(`T${i}`, { list_position: 62 + i, terps: tripled(p.terps) }))]);
  let worst = 0, moved = 0, n = 0;
  for (let i = 0; i < golden.profiles.length; i++) {
    for (const palateOf of [`G${i}`, `T${i}`]) {
      const by = new Map(R.rank(feed, R.palateFrom(feed, bought(palateOf), [], at), FLOWER).map(e => [e.batch.batch_id, e]));
      for (let j = 0; j < golden.profiles.length; j++) {
        const a = by.get(`G${j}`), b = by.get(`T${j}`);
        n++;
        worst = Math.max(worst, Math.abs(a.score - b.score));
        if (a.shown !== b.shown || a.band !== b.band) moved++;
      }
    }
  }
  check(`a profile scaled 3x scores the same: ${n} candidates against every profile's palate and its 3x copy's - the same number in the same band, never 1e-15 apart`,
    [moved, worst < 1e-15], [0, true]);
  const lemon = feedOf([mk('LEMON', { list_position: 1, terps: P('demo:lemon-tart') }),
                        mk('X3', { list_position: 2, terps: EDGE('three times the intensity') }),
                        mk('XC', { list_position: 3, terps: EDGE('with THCA, THC and CBD') })]);
  const r = R.rank(lemon, R.palateFrom(lemon, bought('LEMON'), [], at), FLOWER);
  check('...golden\'s anchors: lemon-tart at three times the intensity, and with THCA, THC and CBD added, each 100, Close match',
    r.filter(e => e.batch.batch_id !== 'LEMON').map(e => [e.batch.batch_id, e.shown, e.label]),
    [['X3', M.shownScore(golden.anchors.tripled), 'Close match'], ['XC', M.shownScore(golden.anchors.withCannabinoids), 'Close match']]);
}

/* ===================================== no panel: after the scored, no number */

{
  const feed = feedOf([
    mk('A', { list_position: 5, usable: false, terps: null, total_terpenes: null }),
    mk('B', { list_position: 1, terps: P('demo:cold-creek') }),
    mk('C', { list_position: 3, usable: null, terps: null, total_terpenes: null, lab: null, harvest_on: null }),
    mk('D', { list_position: 2, terps: P('demo:pepper-grove') }),
    mk('E', { list_position: 4, terps: EDGE('only cannabinoids') }),
    mk('F', { list_position: 0, terps: EDGE('all zero') }),
    mk('L', { list_position: 9, terps: P('demo:lemon-tart'), in_stock: false })]);
  const palate = R.palateFrom(feed, bought('L'), [], at);
  const ranked = R.rank(feed, palate, FLOWER);
  const scoreOf = id => M.cosine(palate.vector, M.normalize(feed.batches.find(b => b.batch_id === id).terps));
  const scoredOrder = ['B', 'D'].sort((x, y) => scoreOf(y) - scoreOf(x));
  check('batches with no panel NOSE can compare come after every scored one, in the store\'s order, each labelled why',
    ranked.map(e => [e.batch.batch_id, e.unscored]),
    [...scoredOrder.map(id => [id, null]), ['F', 'no read'], ['C', 'no read'], ['E', 'no read'], ['A', 'refused']]);
  check('...and carry no number: score, shown, band and label all null',
    ranked.filter(e => e.unscored).map(e => [e.score, e.shown, e.band, e.label]), [0, 0, 0, 0].map(() => [null, null, null, null]));
  check('...where a scored batch carries all four, a number in its band',
    ranked.filter(e => !e.unscored).map(e => [typeof e.score, Number.isInteger(e.shown), M.matchBand(e.score)[1] === e.band]),
    [['number', true, true], ['number', true, true]]);
  check('an accepted reading with no terpene the maths models (golden\'s "only cannabinoids" and "all zero") is never a score of 0: no read',
    ranked.filter(e => ['E', 'F'].includes(e.batch.batch_id)).map(e => [e.score, e.unscored]), [[null, 'no read'], [null, 'no read']]);
  check('...each entry holds the feed\'s own batch, not a copy', ranked.every(e => feed.batches.includes(e.batch)), true);
  check('a palate built from nothing ranks nothing - no "no panel" label on a batch that has one: the menu keeps its own order',
    [R.rank(feed, R.palateFrom(feed, [], [], at), FLOWER), R.rank(feed, R.palateFrom(feed, bought('C'), [], at), FLOWER),
     R.rank(feed, null, FLOWER), R.rank(feed, { vector: {} }, FLOWER)], [[], [], [], []]);
}

/* ============================== routes, category, stock: out, never moved */

{
  const feed = feedOf(golden.profiles.map((p, i) => mk(`R${i}`, {
    list_position: i + 1, route: i % 2 ? 'inhalation' : 'smoking', terps: p.terps,
    usable: i % 9 === 4 ? null : i % 11 === 6 ? false : true })));
  const palate = R.palateFrom(feed, [{ batchId: 'R0', day: TODAY }, { batchId: 'R3', day: TODAY }], [], at);
  const rk = routes => R.rank(feed, palate, { category: 'flower', routes });
  const both = rk(['smoking', 'inhalation']);
  check(`routes leave batches out and never reorder: each route alone is the ${both.length}-batch list less the other, in the same order, the same numbers`,
    [numbersOf(rk(['smoking'])), numbersOf(rk(['inhalation']))],
    [numbersOf(both.filter(e => e.batch.route === 'smoking')), numbersOf(both.filter(e => e.batch.route === 'inhalation'))]);
  check('...unscored batches included', [rk(['smoking']).filter(e => e.unscored).length > 0, rk(['inhalation']).filter(e => e.unscored).length > 0], [true, true]);
  check('...no routes, an empty list, or a route given as a string rather than a list: nothing is inside them',
    [rk(undefined).length, rk([]).length, rk('smoking').length, rk(['oral']).length], [0, 0, 0, 0]);
  const mixed = feedOf([
    mk('V1', { list_position: 1, category: 'vape', route: 'inhalation', terps: T(5) }),
    mk('F1', { list_position: 2, category: 'flower', route: 'smoking', terps: T(6) }),
    mk('V2', { list_position: 3, category: 'vape', route: 'inhalation', terps: T(8), in_stock: false }),
    mk('C1', { list_position: 4, category: 'concentrate', route: 'inhalation', terps: T(9) }),
    mk('V3', { list_position: 5, category: 'vape', route: 'inhalation', usable: null, terps: null }),
    mk('ED', { list_position: 6, category: 'edible', route: 'oral', terps: T(10) }),
    mk('V4', { list_position: 7, category: 'vape', route: 'inhalation', terps: T(11) })]);
  const pm = R.palateFrom(mixed, bought('F1'), [], at);
  const all = ['flower', 'pre-roll', 'vape', 'concentrate'].map(c => [c, ids(R.rank(mixed, pm, { category: c, routes: ['smoking', 'inhalation'] }))]);
  check('only the category asked for, and only in stock - the sold-out vape left out, the vape with no panel last',
    all.map(([c, list]) => [c, list.length, list.includes('V2')]), [['flower', 1, false], ['pre-roll', 0, false], ['vape', 3, false], ['concentrate', 1, false]]);
  check('...no category, or one that is not inhalable - even with its own route - ranks nothing',
    [R.rank(mixed, pm, { routes: ['smoking', 'inhalation'] }).length, R.rank(mixed, pm, { category: 'edible', routes: ['oral', 'smoking', 'inhalation'] }).length],
    [0, 0]);
}

/* ============================================ ties keep the store's order */

{
  /* golden's lemon-tart demo jar and its last fixture have one shape: each
     scores exactly 1 against the lemon-tart palate. */
  const tie = R.rank(goldenFeed, R.palateFrom(goldenFeed, bought('G0'), [], at), FLOWER).slice(0, 2);
  check('two batches score exactly the same - one shape, as when one report is linked from two batches: list_position order',
    tie.map(e => [e.batch.batch_id, e.score, e.batch.list_position]), [['G0', 1, 1], ['G60', 1, 61]]);
  const reversed = feedOf(goldenFeed.batches.slice().reverse());
  check('...whatever order the feed\'s array holds them in',
    ids(R.rank(reversed, R.palateFrom(reversed, bought('G0'), [], at), FLOWER).slice(0, 2)), ['G0', 'G60']);
  const copies = feedOf([mk('K7', { list_position: 7, terps: T(5) }), mk('K3', { list_position: 3, terps: T(5) }),
                         mk('TOP', { list_position: 9, terps: T(13) }), mk('K5', { list_position: 5, terps: T(5) }),
                         mk('U8', { list_position: 8, usable: null, terps: null }), mk('U2', { list_position: 2, usable: false, terps: null })]);
  check('three batches with one panel, listed 7, 3 and 5: 3, 5, 7 behind the batch closest to the palate; unscored ones too in the store\'s order',
    ids(R.rank(copies, R.palateFrom(copies, bought('TOP'), [], at), FLOWER)), ['TOP', 'K3', 'K5', 'K7', 'U2', 'U8']);
  const twins = feedOf([mk('W2', { list_position: 4, terps: T(5) }), mk('W1', { list_position: 4, terps: T(5) }), mk('TOP2', { list_position: 1, terps: T(13) })]);
  check('...two equal in score and in list_position too keep the feed\'s order - a hand-made feed: an upload gives each in-stock batch its own row',
    ids(R.rank(twins, R.palateFrom(twins, bought('TOP2'), [], at), FLOWER)), ['TOP2', 'W2', 'W1']);
  const palate0 = R.palateFrom(goldenFeed, bought('G0'), [], at);
  const ranked0 = R.rank(goldenFeed, palate0, FLOWER);
  const byScoreThenPlace = ranked0.slice().sort((x, y) => (y.score - x.score) || (x.batch.list_position - y.batch.list_position));
  const sameShownApart = ranked0.some((e, n) => n > 0 && e.shown === ranked0[n - 1].shown && e.batch.list_position < ranked0[n - 1].batch.list_position);
  check('...by the score itself, not the number shown: two batches that both show the same number keep their scores\' order, even against list_position',
    [ids(ranked0).join() === ids(byScoreThenPlace).join(), sameShownApart], [true, true]);
}

/* =========================================================== the guardrail */

{
  const basis = [mk('Q1', { list_position: 1, category: 'vape', route: 'inhalation', in_stock: false, thc_percent: 18, cbd_percent: 0, terps: T(1) }),
                 mk('Q2', { list_position: 2, category: 'vape', route: 'inhalation', in_stock: false, thc_percent: 20, cbd_percent: 0.5, terps: T(2) }),
                 mk('Q3', { list_position: 3, category: 'vape', route: 'inhalation', in_stock: false, thc_percent: 30, cbd_percent: 1, terps: T(3) })];
  const c = (id, n, thc, cbd, over = {}) => mk(id, { list_position: 10 + n, category: 'vape', route: 'inhalation', thc_percent: thc, cbd_percent: cbd, terps: T(10 + n), ...over });
  const candidates = [c('C15', 1, 15, 0), c('C25', 2, 25, 0.2), c('C1499', 3, 14.99, 0), c('C2501', 4, 25.01, 0), c('CNULL', 5, null, 0),
                      c('C20', 6, 20, 3), c('UREAD', 7, 21, 0, { usable: null, terps: null }), c('UOUT', 8, 40, 0, { usable: false, terps: null })];
  const buys = basis.map(b => ({ batchId: b.batch_id, day: TODAY }));
  const thc5 = feedOf([...basis, ...candidates], { guardrail_thc_points: 5 });
  const palate = R.palateFrom(thc5, buys, [], at);
  const on = R.rank(thc5, palate, VAPE);
  const off = R.rank(thc5, palate, { ...VAPE, guardrail: OFF });
  check('the store\'s guardrail, THC within 5 points of the basis batches\' median (18, 20, 30: 20) - both edges in; just past them, or no figure, out',
    [ids(on).sort(), ids(off).filter(id => !ids(on).includes(id)).sort()],
    [['C15', 'C20', 'C25', 'UREAD'], ['C1499', 'C2501', 'CNULL', 'UOUT']]);
  check('...it only leaves batches out: the list without it, less those, in the same order with the same numbers - unscored batches too',
    numbersOf(on), numbersOf(off.filter(e => ['C15', 'C20', 'C25', 'UREAD'].includes(e.batch.batch_id))));
  check('...left out, rank() applies the store\'s own: the same list as handing it feed.store, and not the list without one',
    [ids(R.rank(thc5, palate, { ...VAPE, guardrail: thc5.store })).join() === ids(on).join(), ids(on).join() !== ids(off).join()], [true, true]);

  const one = (thc, band, cands) => {
    const f = feedOf([mk('B', { list_position: 1, category: 'vape', route: 'inhalation', in_stock: false, thc_percent: thc[0], terps: T(1) }),
                      ...(thc[1] === undefined ? [] : [mk('B2', { list_position: 2, category: 'vape', route: 'inhalation', in_stock: false, thc_percent: thc[1], terps: T(2) })]),
                      ...cands.map((v, n) => c(`X${n}`, n, v, null))], { guardrail_thc_points: band });
    const p = R.palateFrom(f, [{ batchId: 'B', day: TODAY }, ...(thc[1] === undefined ? [] : [{ batchId: 'B2', day: TODAY }])], [], at);
    return R.rank(f, p, VAPE).map(e => e.batch.thc_percent).sort((x, y) => x - y);
  };
  check('a band edge holds as written: 16.1 is 5 points from 11.1, though subtracting them as floating point gives 5.000000000000002',
    [16.1 - 11.1 > 5, one([11.1], 5, [16.1, 6.1, 16.2, 6])], [true, [6.1, 16.1]]);
  check('...an even basis takes the middle two\'s mean: 18 and 21.3 make 19.65, so 14.65 and 24.65 are in and 14.64 and 24.66 out',
    one([18, 21.3], 5, [14.64, 14.65, 24.65, 24.66]), [14.65, 24.65]);
  const cbd2 = feedOf([...basis, ...candidates], { guardrail_cbd_points: 2 });
  check('CBD alone, within 2 points of the basis median (0, 0.5, 1: 0.5): 3% CBD out, THC not looked at',
    ids(R.rank(cbd2, R.palateFrom(cbd2, buys, [], at), VAPE)).sort(),
    ['C1499', 'C15', 'C25', 'C2501', 'CNULL', 'UOUT', 'UREAD']);
  const both = feedOf([...basis, ...candidates], { guardrail_thc_points: 5, guardrail_cbd_points: 2 });
  check('...both halves at once: in both bands', ids(R.rank(both, R.palateFrom(both, buys, [], at), VAPE)).sort(), ['C15', 'C25', 'UREAD']);
  const noFigure = feedOf([...basis.map(b => ({ ...b, thc_percent: null })), ...candidates], { guardrail_thc_points: 5 });
  check('a basis with no THC figure has no median to be near: with THC\'s half set, nothing is shown, scored or not',
    R.rank(noFigure, R.palateFrom(noFigure, buys, [], at), VAPE), []);
  const weird = [null, true, 'on', 5].map(g => R.rank(thc5, palate, { ...VAPE, guardrail: g }).length);
  const badBands = [0, -1, 101, '5', NaN, Infinity].map(v => R.rank(thc5, palate, { ...VAPE, guardrail: { guardrail_thc_points: v, guardrail_cbd_points: null } }).length);
  check('...and a guardrail that is not { guardrail_thc_points, guardrail_cbd_points }, or a half that is not a band above 0 and at most 100, keeps everything out',
    [weird, badBands], [[0, 0, 0, 0], [0, 0, 0, 0, 0, 0]]);

  /* Never reorders, on 61 golden batches with THC and CBD from a fixed
     sequence, checked against the band computed here in tenths - exact,
     and apart from the engine's own arithmetic. */
  let seed = 20261008;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  const tenths = golden.profiles.map(() => [next() % 9 === 0 ? null : 100 + next() % 251, next() % 13 === 0 ? null : next() % 21]);
  const feed = feedOf(golden.profiles.map((p, i) => mk(`N${i}`, { list_position: i + 1, category: 'vape', route: 'inhalation', terps: p.terps,
    thc_percent: tenths[i][0] === null ? null : tenths[i][0] / 10, cbd_percent: tenths[i][1] === null ? null : tenths[i][1] / 10,
    usable: i % 10 === 7 ? null : true, in_stock: i % 8 !== 2 })));
  const inside = (value, basisValues, band) => {
    const v = basisValues.filter(x => x !== null).sort((a, b) => a - b);
    if (!v.length || value === null) return false;
    const twice = v.length % 2 ? 2 * v[(v.length - 1) / 2] : v[v.length / 2 - 1] + v[v.length / 2];
    return Math.abs(2 * value - twice) <= 2 * band;
  };
  let combos = 0, wrong = 0, kept = 0, left = 0;
  for (const set of [[2], [5, 9], [11, 17, 23], [29, 31, 37, 41], [3, 4, 5, 6, 7, 8]]) {
    const palateN = R.palateFrom(feed, set.map(i => ({ batchId: `N${i}`, day: TODAY })), [], at);
    const usedAt = palateN.basis.used.map(u => Number(u.batch.batch_id.slice(1)));
    const offN = R.rank(feed, palateN, { ...VAPE, guardrail: OFF });
    for (const [thcBand, cbdBand] of [[30, null], [50, null], [80, null], [null, 5], [null, 10], [50, 10]]) {
      const onN = R.rank(feed, palateN, { ...VAPE, guardrail: { guardrail_thc_points: thcBand === null ? null : thcBand / 10,
                                                                 guardrail_cbd_points: cbdBand === null ? null : cbdBand / 10 } });
      const want = offN.filter(e => {
        const i = Number(e.batch.batch_id.slice(1));
        return (thcBand === null || inside(tenths[i][0], usedAt.map(u => tenths[u][0]), thcBand))
            && (cbdBand === null || inside(tenths[i][1], usedAt.map(u => tenths[u][1]), cbdBand));
      });
      /* ...and the same band set by the store itself, rank() handed none. */
      const asStore = { store: storeOf({ ...STORE, guardrail_thc_points: thcBand === null ? null : thcBand / 10,
                                         guardrail_cbd_points: cbdBand === null ? null : cbdBand / 10 }), batches: feed.batches };
      const byStore = R.rank(asStore, palateN, VAPE);
      combos++;
      kept += onN.length;
      left += offN.length - onN.length;
      if (JSON.stringify(numbersOf(onN)) !== JSON.stringify(numbersOf(want))) wrong++;
      if (JSON.stringify(numbersOf(byStore)) !== JSON.stringify(numbersOf(want))) wrong++;
    }
  }
  check(`...and never reorders: ${combos} palates and bands on 61 batches, handed to rank() or set by the store, each list the unguarded one less what the band leaves out, in order (${kept} kept, ${left} left out)`,
    [wrong, kept > 0, left > 0], [0, true, true]);
}

/* ============================================================== palateFrom */

{
  const rd = (id, n, over = {}) => mk(id, { list_position: n, terps: T(20 + n), ...over });
  const feed = feedOf([rd('OK1', 1), rd('OK2', 2), rd('REF', 3, { usable: false, terps: null }), rd('NOREAD', 4, { usable: null, terps: null }),
                       rd('EDIBLE', 5, { category: 'edible', route: 'oral' }), rd('RM', 6), rd('OK3', 7)]);
  const buys = [
    { batchId: 'OK1', day: '2026-10-01' }, { batchId: 'OK1', day: '2026-05-01' },
    { batchId: 'OK2', day: '2025-10-08' }, { batchId: 'OK2', day: '2025-10-07' },
    { batchId: 'NOPE', day: '2026-10-01' }, { batchId: 'EDIBLE', day: '2026-10-01' },
    { batchId: 'NOREAD', day: '2026-10-01' }, { batchId: 'REF', day: '2026-10-01' }, { batchId: 'REF', day: '2020-01-01' },
    { batchId: 'RM', day: '2026-10-01' }, { batchId: 'RM', day: '2020-01-01' }, { batchId: 'NOREAD', day: '2020-01-01' },
    { batchId: 'OK1', day: '2026-02-30' }, { batchId: 'OK1', day: '2026-10-8' }, { batchId: 'OK1', day: 20261008 }, { batchId: 'OK1' },
    null, { batchId: 42, day: TODAY }, {}, { batchId: 'ok1', day: TODAY },
    { batchId: 'OK3', day: '2026-10-09' }];
  const p = R.palateFrom(feed, buys, ['RM', 'NOPE', 7], at);
  check('palateFrom(): every purchase skipped says why - the first that holds of not listed, not inhalable, no read, refused, outside the window, removed',
    p.basis.skipped.map(s => [s.batchId, s.day, s.reason]),
    [['OK2', '2025-10-07', 'outside the window'], ['NOPE', '2026-10-01', 'not listed'], ['EDIBLE', '2026-10-01', 'not inhalable'],
     ['NOREAD', '2026-10-01', 'no read'], ['REF', '2026-10-01', 'refused'], ['REF', '2020-01-01', 'refused'],
     ['RM', '2026-10-01', 'removed'], ['RM', '2020-01-01', 'outside the window'], ['NOREAD', '2020-01-01', 'no read'],
     ['OK1', '2026-02-30', 'outside the window'], ['OK1', '2026-10-8', 'outside the window'], ['OK1', null, 'outside the window'],
     ['OK1', null, 'outside the window'], [null, null, 'not listed'], [null, '2026-10-08', 'not listed'], [null, null, 'not listed'],
     ['ok1', '2026-10-08', 'not listed']]);
  check('...the batches used, each once, in the feed\'s order, with the days that count: the window\'s first day in, the day before out, tomorrow in',
    p.basis.used.map(u => [u.batch.batch_id, u.days]), [['OK1', ['2026-05-01', '2026-10-01']], ['OK2', ['2025-10-08']], ['OK3', ['2026-10-09']]]);
  check('...the palate is averageProfiles() of their terps, to the last bit', JSON.stringify(p.vector),
    JSON.stringify(M.averageProfiles(['OK1', 'OK2', 'OK3'].map(id => feed.batches.find(b => b.batch_id === id)))));
  check('...every purchase is either a day of a batch used or a reason, never both or neither',
    p.basis.used.reduce((n, u) => n + u.days.length, 0) + p.basis.skipped.length, buys.length);
  check('...a skipped batch that is listed comes with the feed\'s own batch, so the basis list can show it',
    p.basis.skipped.map(s => s.batch === null ? null : feed.batches.includes(s.batch)),
    [true, null, true, true, true, true, true, true, true, true, true, true, true, null, null, null, null]);

  const withRm = R.palateFrom(feed, [{ batchId: 'OK1', day: TODAY }, { batchId: 'RM', day: TODAY }, { batchId: 'OK2', day: TODAY }], [], at);
  const withoutRm = R.palateFrom(feed, [{ batchId: 'OK1', day: TODAY }, { batchId: 'RM', day: TODAY }, { batchId: 'OK2', day: TODAY }], ['RM'], at);
  const neverBought = R.palateFrom(feed, [{ batchId: 'OK1', day: TODAY }, { batchId: 'OK2', day: TODAY }], [], at);
  const candidates = feedOf([...feed.batches, ...golden.profiles.slice(30, 40).map((pr, i) => mk(`Z${i}`, { list_position: 20 + i, terps: pr.terps }))]);
  const scoresOf = pal => R.rank(candidates, pal, FLOWER).map(e => [e.batch.batch_id, e.score]);
  check('a removed batch leaves the palate: the same palate as never buying it, to the last bit, and the same ranking',
    [JSON.stringify(withoutRm.vector) === JSON.stringify(neverBought.vector), JSON.stringify(scoresOf(withoutRm)) === JSON.stringify(scoresOf(neverBought)),
     withoutRm.basis.skipped.map(s => [s.batchId, s.reason])], [true, true, [['RM', 'removed']]]);
  check('...and it was in the palate before it was removed: the scores differ', JSON.stringify(scoresOf(withRm)) !== JSON.stringify(scoresOf(withoutRm)), true);

  const thrice = R.palateFrom(feed, [{ batchId: 'OK1', day: '2026-01-01' }, { batchId: 'OK2', day: TODAY }, { batchId: 'OK1', day: '2026-02-01' },
                                     { batchId: 'OK1', day: '2026-03-01' }], [], at);
  check('a batch bought three times counts once - no weighting, the published method: the palate of buying it once',
    [JSON.stringify(thrice.vector) === JSON.stringify(neverBought.vector), thrice.basis.used.map(u => [u.batch.batch_id, u.days.length])],
    [true, [['OK1', 3], ['OK2', 1]]]);

  const s = golden.palates.find(x => x.members.length >= 3 && x.members.every(m => m < golden.profiles.length) &&
    JSON.stringify(M.averageProfiles(x.members.map(m => golden.profiles[m]))) !== JSON.stringify(M.averageProfiles(x.members.slice().reverse().map(m => golden.profiles[m]))));
  const mfeed = feedOf(s.members.map((m, x) => mk(`M${x}`, { list_position: x + 1, terps: golden.profiles[m].terps })));
  const forward = R.palateFrom(mfeed, s.members.map((m, x) => ({ batchId: `M${x}`, day: TODAY })), [], at);
  const backward = R.palateFrom(mfeed, s.members.map((m, x) => ({ batchId: `M${x}`, day: TODAY })).reverse(), [], at);
  check(`the palate is made in the feed's order, not the page's: the same ${s.members.length} purchases listed backwards make the same palate to the last bit (averaged backwards, they would not)`,
    [JSON.stringify(forward.vector) === JSON.stringify(backward.vector), JSON.stringify(forward.vector) === JSON.stringify(s.vector)], [true, true]);

  const edge = (today, months, inDay, outDay) => {
    const f = feedOf([rd('W', 1)], { window_months: months });
    const r = R.palateFrom(f, [{ batchId: 'W', day: inDay }, { batchId: 'W', day: outDay }], [], { today });
    return [r.basis.used.map(u => u.days.join()), r.basis.skipped.map(x => x.reason)];
  };
  /* [today, window_months, the window's first day, the day before it]. When
     the engine was built, every day of 2023 to 2029 against every window of 1
     to 36 months - 92,052 cases - was put through palateFrom() and through
     PostgreSQL 16, and all agreed (PARSER-HANDOFF s14). */
  const EDGES = [['2026-10-08', 12, '2025-10-08', '2025-10-07'], ['2026-03-31', 1, '2026-02-28', '2026-02-27'],
                 ['2024-03-31', 1, '2024-02-29', '2024-02-28'], ['2026-01-15', 1, '2025-12-15', '2025-12-14'],
                 ['2028-02-29', 12, '2027-02-28', '2027-02-27'], ['2026-05-31', 3, '2026-02-28', '2026-02-27'],
                 ['2026-10-08', 36, '2023-10-08', '2023-10-07']];
  check('the store\'s window as PostgreSQL counts it (date - make_interval(months => n)): the day of the month kept, a day the month lacks its last day',
    EDGES.map(([today, months, first, before]) => edge(today, months, first, before)), EDGES.map(([, , first]) => [[first], ['outside the window']]));
  const bad = [{ window_months: 0 }, { window_months: 37 }, { window_months: '12' }, { window_months: 1.5 }, { window_months: null }]
    .map(st => R.palateFrom(feedOf([rd('W', 1)], st), bought('W'), [], at).basis.skipped.map(x => x.reason).join());
  const noStore = R.palateFrom({ batches: [rd('W', 1)] }, bought('W'), [], at).basis.skipped.map(x => x.reason).join();
  const badToday = ['2026-13-01', '2026-02-29', null, '', 20261008].map(t => R.palateFrom(feedOf([rd('W', 1)]), bought('W'), [], { today: t }).basis.skipped.map(x => x.reason).join());
  check('...a window or a today that cannot be read puts every purchase outside it: nothing counts that cannot be checked',
    [bad, noStore, badToday], [bad.map(() => 'outside the window'), 'outside the window', badToday.map(() => 'outside the window')]);
  const utc = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const longAgo = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);
  const byClock = R.palateFrom(feedOf([rd('W', 1)], { window_months: 1 }), [{ batchId: 'W', day: utc }, { batchId: 'W', day: longAgo }], []);
  check('...handed no day, it takes today\'s UTC day: yesterday is inside a one-month window, forty days ago is not',
    [byClock.basis.used.map(u => u.days.join()), byClock.basis.skipped.map(x => x.reason)], [[utc], ['outside the window']]);
  check('...and purchases or a removed list that are not lists count for nothing',
    [R.palateFrom(feed, 'OK1', [], at).basis, R.palateFrom(feed, bought('OK1'), 'OK1', at).basis.used.length], [{ used: [], skipped: [] }, 1]);
}

/* =============================================================== sold out */

{
  const v = (id, n, over = {}) => mk(id, { list_position: n, category: 'vape', route: 'inhalation', terps: T(30 + n), ...over });
  const base = [v('U1', 1, { product_id: 'P-USUAL', in_stock: false }), v('U2', 2, { product_id: 'P-USUAL', in_stock: false }),
                v('V1', 3), v('V2', 4), v('V3', 5), v('V4', 6, { usable: null, terps: null }), v('VOUT', 7, { in_stock: false }),
                mk('F1', { list_position: 8, terps: T(45) }), v('O1', 9, { product_id: 'P-OTHER' })];
  const feed = feedOf(base);
  const buys = [{ batchId: 'U1', day: '2026-03-01' }, { batchId: 'U1', day: '2026-04-01' }, { batchId: 'U2', day: '2026-06-01' },
                { batchId: 'O1', day: '2026-05-01' }, { batchId: 'O1', day: '2026-07-01' }, { batchId: 'F1', day: '2026-08-01' }];
  const so = R.soldOut(feed, buys, { routes: ['inhalation'], today: TODAY });
  const U2 = feed.batches.find(b => b.batch_id === 'U2');
  check('soldOut(): the most-bought product (three purchases of P-USUAL, over two of P-OTHER) has no batch in stock - its latest purchased batch, U2',
    [so.productId, so.batch === U2, so.palate.basis.used.map(u => u.batch.batch_id)], ['P-USUAL', true, ['U2']]);
  check('...ranked against that batch alone: its palate is averageProfiles() of U2 by itself, and the scores are its scores, to the last bit',
    [JSON.stringify(so.palate.vector) === JSON.stringify(M.averageProfiles([U2])),
     so.ranked.filter(e => !e.unscored).every(e => Object.is(e.score, M.cosine(M.averageProfiles([U2]), M.normalize(e.batch.terps))))], [true, true]);
  const whole = R.rank(feed, R.palateFrom(feed, buys, [], at), { ...VAPE });
  check('...not against the whole palate, which ranks the same batches with other scores',
    [ids(so.ranked).sort().join() === ids(whole).sort().join(), JSON.stringify(numbersOf(so.ranked)) !== JSON.stringify(numbersOf(whole))], [true, true]);
  check('...in the sold-out batch\'s category, in stock, within the routes - the flower and the sold-out vape left out, the vape with no panel last',
    [ids(so.ranked).slice(-1), ids(so.ranked).filter(id => ['F1', 'VOUT', 'U1', 'U2'].includes(id))], [['V4'], []]);
  check('...and it is rank() itself, called with that batch\'s category and the shopper\'s routes',
    JSON.stringify(numbersOf(so.ranked)), JSON.stringify(numbersOf(R.rank(feed, so.palate, { category: 'vape', routes: ['inhalation'] }))));
  check('...outside the shopper\'s routes, nothing', R.soldOut(feed, buys, { routes: ['smoking'], today: TODAY }).ranked, []);
  check('the most-bought product in stock: no sold-out panel',
    R.soldOut(feedOf([...base, v('U3', 10, { product_id: 'P-USUAL' })]), buys, { routes: ['inhalation'], today: TODAY }), null);
  const tied = R.soldOut(feed, [{ batchId: 'U2', day: '2026-01-01' }, { batchId: 'U1', day: '2026-02-01' },
                                { batchId: 'V1', day: '2026-03-01' }, { batchId: 'V1', day: '2026-09-01' }], { routes: ['inhalation'], today: TODAY });
  check('two products bought as often: the one bought most lately - P-V1, in stock, so no panel',
    tied, null);
  const tiedOut = R.soldOut(feed, [{ batchId: 'V1', day: '2026-01-01' }, { batchId: 'V1', day: '2026-02-01' },
                                   { batchId: 'U1', day: '2026-03-01' }, { batchId: 'U2', day: '2026-09-01' }], { routes: ['inhalation'], today: TODAY });
  check('...and the other way round: P-USUAL bought most lately, sold out, so the panel', [tiedOut.productId, tiedOut.batch.batch_id], ['P-USUAL', 'U2']);
  check('a removed purchase does not count toward the usual: with U1 removed, P-OTHER is bought most, and it is in stock',
    R.soldOut(feed, buys, { removed: ['U1'], routes: ['inhalation'], today: TODAY }), null);
  const unread = feedOf(base.map(b => (b.batch_id === 'U2' ? { ...b, usable: null, terps: null } : b)));
  const ur = R.soldOut(unread, buys, { routes: ['inhalation'], today: TODAY });
  check('the latest batch has no panel NOSE can compare: sold out still, nothing ranked, and its basis says why',
    [ur.productId, ur.batch.batch_id, ur.ranked, ur.palate.basis.skipped.map(s => [s.batchId, s.reason])], ['P-USUAL', 'U2', [], [['U2', 'no read']]]);
  const sameDay = feedOf([...base.map(b => (b.batch_id === 'U2' ? { ...b, usable: null, terps: null } : b)), v('U2B', 11, { product_id: 'P-USUAL', in_stock: false })]);
  const sd = R.soldOut(sameDay, [...buys, { batchId: 'U2B', day: '2026-06-01' }], { routes: ['inhalation'], today: TODAY });
  check('...two of its batches bought the same latest day: the one NOSE can compare', [sd.batch.batch_id, sd.ranked.length > 0], ['U2B', true]);
  check('no purchase that counts - none, all outside the window, none listed: no panel',
    [R.soldOut(feed, [], { routes: ['inhalation'], today: TODAY }), R.soldOut(feed, bought('U2', '2020-01-01'), { routes: ['inhalation'], today: TODAY }),
     R.soldOut(feed, bought('NOPE'), { routes: ['inhalation'], today: TODAY })], [null, null, null]);
}

/* ============================================================ vote score */

{
  const v = (id, n, product, over = {}) => mk(id, { list_position: n, product_id: product, category: 'vape', route: 'inhalation', terps: T(46 + n), ...over });
  const feed = feedOf([v('X0', 1, 'PX', { in_stock: false }), v('X', 2, 'PX'), v('Y', 3, 'PY'), v('Z', 4, 'PZ'), v('N', 5, 'PN', { usable: null, terps: null })]);
  const by = id => feed.batches.find(b => b.batch_id === id);
  const buys = [{ batchId: 'X0', day: '2026-01-10' }, { batchId: 'Y', day: '2026-02-10' }, { batchId: 'Z', day: '2026-03-10' },
                { batchId: 'X', day: '2026-09-10' }, { batchId: 'N', day: '2026-04-01' }, { batchId: 'X', day: '2026-09-20' }];
  const vs = R.voteScore(feed, buys, 'PX', at);
  const others = M.averageProfiles([by('X0'), by('Y'), by('Z')]);
  check('voteScore(): the bought product\'s latest batch, scored against the palate of the other purchases - every purchase of that batch left out',
    [vs.batch.batch_id, vs.palate.basis.used.map(u => u.batch.batch_id), Object.is(vs.score, M.cosine(others, M.normalize(by('X').terps)))],
    ['X', ['X0', 'Y', 'Z'], true]);
  check('...another batch of the same product stays in, as it was in the palate before; one with no panel is skipped', vs.palate.basis.skipped.map(s => [s.batchId, s.reason]), [['N', 'no read']]);
  const included = M.cosine(M.averageProfiles([by('X0'), by('X'), by('Y'), by('Z')]), M.normalize(by('X').terps));
  check('...which is not the score with the voted batch in its own palate', vs.score !== included, true);
  check('...the number rank() gives that batch against the same palate', vs.score, R.rank(feed, vs.palate, VAPE).find(e => e.batch.batch_id === 'X').score);
  check('...and the vote\'s fields, exactly as b2b-vote takes them: candidate, shownScore(), matchBand()\'s band name, the palate\'s size',
    vs.payload, { candidate: 'PX', score: M.shownScore(vs.score), band: M.matchBand(vs.score)[1], palateSize: 3 });
  check('...with a batch removed, a smaller palate', R.voteScore(feed, buys, 'PX', { ...at, removed: ['Y'] }).payload.palateSize, 2);
  check('...its size counts batches, not purchases: Y bought twice is one batch of three',
    R.voteScore(feed, [...buys, { batchId: 'Y', day: '2026-02-20' }], 'PX', at).payload.palateSize, 3);
  check('no vote score for a batch with no panel, a palate of nothing, a product not bought, or a product ID that is not text',
    [R.voteScore(feed, buys, 'PN', at), R.voteScore(feed, bought('X'), 'PX', at), R.voteScore(feed, buys, 'PQ', at), R.voteScore(feed, buys, 7, at)],
    [null, null, null, null]);
}

/* ======================================================= no name is read */

{
  const reads = { batch: new Set(), feed: new Set(), store: new Set(), purchase: new Set() };
  const watch = (obj, set) => new Proxy(obj, {
    get(t, k, r) { if (typeof k === 'string') set.add(k); return Reflect.get(t, k, r); },
    has(t, k) { if (typeof k === 'string') set.add(`in ${k}`); return Reflect.has(t, k); },
    ownKeys(t) { set.add('(its keys)'); return Reflect.ownKeys(t); }
  });
  const v = (id, n, over = {}) => watch(mk(id, { list_position: n, category: 'vape', route: 'inhalation', terps: T(50 + n),
                                                 thc_percent: 18 + n, cbd_percent: n / 10, ...over }), reads.batch);
  /* B and B2 tie on everything the engine orders by - score and list_position
     - so no ordering could stop short of whatever it reads next. */
  const feed = watch({ store: watch(storeOf({ ...STORE, guardrail_thc_points: 8, guardrail_cbd_points: 1 }), reads.store),
                       batches: [v('A', 1, { product_id: 'PA', in_stock: false }), v('B', 2), v('C', 3), v('D', 4, { usable: null, terps: null }),
                                 v('E', 5, { usable: false, terps: null }), v('F', 6, { product_id: 'PA', in_stock: false }),
                                 v('B2', 2, { terps: T(52), thc_percent: 20, cbd_percent: 0.2 }), v('D2', 4, { usable: null, terps: null })] }, reads.feed);
  const buys = [{ batchId: 'A', day: '2026-06-01' }, { batchId: 'A', day: '2026-07-01' }, { batchId: 'F', day: '2026-08-01' },
                { batchId: 'C', day: '2026-02-01' }].map(p => watch(p, reads.purchase));
  const palate = R.palateFrom(feed, buys, ['C'], at);
  R.rank(feed, palate, VAPE);
  R.soldOut(feed, buys, { ...VAPE, today: TODAY });
  R.voteScore(feed, buys, 'PA', at);
  const seen = Object.fromEntries(Object.entries(reads).map(([k, s]) => [k, [...s].sort()]));
  check('no name field is ever read: of a batch, never its name or brand - nor its lab, dates, link or printed total, and its fields are never listed',
    seen.batch, ['batch_id', 'category', 'cbd_percent', 'in_stock', 'list_position', 'product_id', 'route', 'terps', 'thc_percent', 'usable']);
  check('...of the feed its batches and store; of the store its window and guardrail; of a purchase its batchId and day',
    [seen.feed, seen.store, seen.purchase], [['batches', 'store'], ['guardrail_cbd_points', 'guardrail_thc_points', 'window_months'], ['batchId', 'day']]);
}

/* ========================================================= the build rule */

{
  const build = fs.readFileSync(path.join(ROOT, 'build.sh'), 'utf8');
  check('build.sh syntax-checks js/b2b-rank and fingerprints it like the other bundles',
    [/^for f in [^\n]* js\/b2b-rank\*\.js [^\n]*; do$/m.test(build), /^fingerprint js +b2b-rank js$/m.test(build)], [true, true]);
  const lines = build.split('\n');
  const from = lines.findIndex(l => l.startsWith('# The dispensary ranking engine (js/b2b-rank)'));
  const to = from < 0 ? -1 : lines.findIndex((l, i) => i > from && l === 'done');
  const rule = from >= 0 && to > from ? lines.slice(from, to + 1).join('\n') : null;
  check('build.sh holds the load-order rule for it, from its comment to its "done"', rule !== null && rule.includes("'/js/b2b-rank\\.") && rule.includes("'/js/match-math\\."), true);
  const run = html => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2b-rank-rule-'));
    fs.writeFileSync(path.join(dir, 'page.html'), html);
    const r = spawnSync('bash', ['-c', `set -euo pipefail\ncd '${dir}'\nHTML=(./page.html)\n${rule}\necho 'load order ok'`], { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    return [r.status, `${r.stdout}${r.stderr}`.trim()];
  };
  const MATH = '<script defer src="/js/match-math.cd934bdd.js"></script>';
  const RANK = '<script defer src="/js/b2b-rank.0a1b2c3d.js"></script>';
  const FAIL = [1, 'FAIL: ./page.html loads js/b2b-rank without js/match-math before it'];
  check('...its own lines, run on throwaway pages: js/match-math first passes; js/b2b-rank alone, before it, or on its line fails the build; neither passes',
    rule === null ? null : [run(`${MATH}\n${RANK}\n`), run(`${RANK}\n`), run(`${RANK}\n${MATH}\n`), run(`${MATH}${RANK}\n`), run('<p>no scripts</p>\n')],
    [[0, 'load order ok'], FAIL, FAIL, FAIL, [0, 'load order ok']]);
  const pages = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'vendor', 'test'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) pages.push(p);
    }
  })(ROOT);
  const loaders = pages.filter(p => /\/js\/b2b-rank(\.[0-9a-f]{8})?\.js/.test(fs.readFileSync(p, 'utf8')));
  check(`...and every page in the tree that loads js/b2b-rank loads js/match-math first, from the same build (${loaders.length} today: the widget comes with Prompt 6)`,
    loaders.map(p => { const s = fs.readFileSync(p, 'utf8'); const m = s.indexOf(`/js/${path.basename(MATH_FILE)}"`); return m >= 0 && m < s.indexOf(`/js/${files[0]}"`); }),
    loaders.map(() => true));
}

/* ======================================================= aroma words only */

const EFFECT = /\b(relax|calm|sleep|energ|focus|uplift|euphor|sedat|mood|high|buzz|stoned|pain|anxi|stress|treat|relief|cure)/i;
check('no effect wording in the engine, comments included - aroma and flavour only', (SRC.match(EFFECT) || [null])[0], null);

if (failures) {
  console.error(`\nb2b-rank-test: ${failures} failure${failures === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('\nb2b-rank clean');

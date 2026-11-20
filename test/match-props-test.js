#!/usr/bin/env node
'use strict';
/* NOSE - what must always be true of the matching maths. PARSER-HANDOFF s13,
 * "The maths has a property test".
 *
 *   node test/match-props-test.js     -> "match-props clean", or FAIL lines and exit 1
 *
 * test/match-test.js compares 1,830 recorded scores to the last bit. This
 * test states properties instead, over 20,000 made-up pairs of profiles on
 * the 15 keys, from a seeded generator (no Math.random), so that a change
 * meant to move scores - a new terpene, the alias fix - still has to keep
 * scale, order and below-limit handling as they are. The maths is loaded
 * through scripts/lib/match.js: js/match-math.*.js, the file the app loads.
 *
 * Since 2026-11-14 it also states the alias table and coerce(), fixed that
 * day (PARSER-HANDOFF s13, "The app's alias table, and coerce()"): every
 * spelling the parser accepts reaches the same key here, no compound is
 * folded into another, and coerce() reads only a plain number.
 *
 * Since 2026-11-18 it also holds the methodology page's two figures (13-records,
 * "The methodology page's figures under a gate"): among the accepted flower
 * fixtures, how often two jars score "Close match", and at least "Related
 * profile". The page says "about three times in ten" (one time in four until
 * 2026-11-20, when three flower fixtures from The Flowery's site moved it to
 * 30%) and "about two times in three"; each stays true while the measured
 * share is within 5 points of it.
 * Needs test/fixtures/extracted (node test/extract-dump.js), as the gates do.
 *
 * Offline. Nothing is written.
 */
const path = require('path');
const M = require(path.join(__dirname, '..', 'scripts/lib/match.js')).load();

let failures = 0;
function property(label, bad) {
  if (bad.length) failures++;
  console.log(`${bad.length ? 'FAIL' : 'ok  '}  ${label}${bad.length ? `\n        ${bad.length} case${bad.length === 1 ? '' : 's'}, the first: ${JSON.stringify(bad[0])}` : ''}`);
}

/* mulberry32: a small seeded generator, the same numbers on every run. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = seeded(20261114);
const KEYS = Object.keys(M.TERPENES);
/* A jar: 1 to 15 of the keys, each 0.001 to 2.000, as a lab prints them. */
function jar() {
  const n = 1 + Math.floor(rand() * KEYS.length);
  const keys = KEYS.map(k => [rand(), k]).sort((x, y) => x[0] - y[0]).slice(0, n).map(x => x[1]);
  return Object.fromEntries(keys.map(k => [k, Math.round((0.001 + rand() * 1.999) * 1000) / 1000]));
}
const shuffled = o => Object.fromEntries(Object.entries(o).map(e => [rand(), e]).sort((x, y) => x[0] - y[0]).map(x => x[1]));
const score = (a, b) => M.cosine(M.normalize(a), M.normalize(b));
const palateScore = (jars, b) => M.cosine(M.averageProfiles(jars.map(terps => ({ terps }))), M.normalize(b));
const EPS = 1e-12;
const same = (x, y) => Math.abs(x - y) <= EPS;

const N = 20000;
const PAIRS = Array.from({ length: N }, () => [jar(), jar()]);
const SCALES = [0.1, 3, 7.3, 10, 1000];
const BELOW = ['<LOQ', '<0.200', 'ND', 'BQL', 'N/D', 'none detected', '≤0.05'];

const range = [], scale = [], swap = [], keyOrder = [], jarOrder = [], self = [], below = [], nerolidol = [], others = [], empty = [], single = [];
PAIRS.forEach(([a, b], i) => {
  const s = score(a, b);
  if (!(s >= 0 && s <= 1 + EPS)) range.push({ a, b, s });

  const k = SCALES[i % SCALES.length];
  const scaled = Object.fromEntries(Object.entries(a).map(([key, v]) => [key, v * k]));
  const s2 = score(scaled, b);
  if (!same(s, s2) || M.shownScore(s) !== M.shownScore(s2)) scale.push({ a, b, k, s, s2 });

  const back = score(b, a);
  if (!same(s, back)) swap.push({ a, b, s, back });

  const s3 = score(shuffled(a), shuffled(b));
  if (!same(s, s3) || M.shownScore(s) !== M.shownScore(s3) || M.matchBand(s)[1] !== M.matchBand(s3)[1]) keyOrder.push({ a, b, s, s3 });

  if (M.shownScore(score(a, JSON.parse(JSON.stringify(a)))) !== 100) self.push({ a, shown: M.shownScore(score(a, a)) });

  if (i % 4 === 0) {
    /* a palate of three jars, in two orders */
    const c = PAIRS[(i + 1) % N][0], d = PAIRS[(i + 2) % N][1];
    const p1 = palateScore([a, c, d], b), p2 = palateScore([d, a, c], b);
    if (!same(p1, p2) || M.shownScore(p1) !== M.shownScore(p2) || M.matchBand(p1)[1] !== M.matchBand(p2)[1]) jarOrder.push({ a, c, d, b, p1, p2 });
    /* an empty jar in a palate is skipped */
    const p3 = palateScore([a, {}, c, { thca: 20 }, d], b);
    if (p3 !== p1) empty.push({ a, c, d, b, p1, p3 });
    /* a palate of one jar is that jar's shares */
    if (JSON.stringify(M.averageProfiles([{ terps: a }])) !== JSON.stringify(M.normalize(a))) single.push({ a });
  }

  /* a row below the lab's limit scores exactly as if it were absent */
  const missing = KEYS.find(key => !(key in a));
  if (missing) {
    const withRow = { ...a, [missing]: BELOW[i % BELOW.length] };
    if (score(withRow, b) !== s) below.push({ a, b, row: [missing, BELOW[i % BELOW.length]], s, got: score(withRow, b) });
  }

  if (i % 10 === 0) {
    /* cis- and trans-nerolidol sum into one value */
    const { nerolidol: n = 0.04, ...rest } = a;
    const cis = Math.round(n * 0.3 * 1e6) / 1e6, trans = Math.round(n * 0.7 * 1e6) / 1e6;
    const split = M.sanitizeTerps({ ...rest, 'cis-Nerolidol': cis, 'trans-Nerolidol': String(trans) });
    const whole = M.sanitizeTerps({ ...rest, nerolidol: cis + trans });
    if (JSON.stringify(split) !== JSON.stringify(whole)) nerolidol.push({ a, split, whole });
    /* cannabinoids, a date and a total among the keys change nothing */
    const noisy = { thca: 24.1, 'Δ9-THC': '0.31', ...a, CBD: 0.1, 'Harvest Date': '2026-01-27', 'Total Terpenes': 2.5, total: '2.5%' };
    if (score(noisy, b) !== s) others.push({ a, b, s, got: score(noisy, b) });
  }
});

property(`every score of ${N} pairs is between 0 and 1`, range);
property('multiplying every value of one jar by 0.1, 3, 7.3, 10 or 1000 moves no score by more than 1e-12 and changes no shown number', scale);
property('score(a, b) and score(b, a) differ by no more than 1e-12', swap);
property('reordering a profile\'s keys moves no score by more than 1e-12 and changes no shown number or band', keyOrder);
property('reordering a palate\'s jars moves no score by more than 1e-12 and changes no shown number or band', jarOrder);
property('a jar scored against itself shows 100', self);
property('a row whose value is "<LOQ", "<0.200", "ND", "BQL", "N/D", "none detected" or "≤0.05" scores exactly as if the row were absent', below);
property('cis- and trans-nerolidol sum into one value', nerolidol);
property('THCA, THC, CBD, a harvest date and a total among the keys change nothing', others);
property('an empty jar in a palate is skipped', empty);
property('a palate of one jar is that jar\'s shares', single);

/* The band edges: the higher band at exactly the edge, the lower one a step below. */
const step = x => x - Number.EPSILON / 2;
const edges = [[0.90, 'Strong', 'Good'], [0.75, 'Good', 'Moderate'], [0.55, 'Moderate', 'Low']]
  .filter(([edge, at, under]) => M.matchBand(edge)[1] !== at || M.matchBand(step(edge))[1] !== under || !(step(edge) < edge))
  .map(([edge]) => ({ edge, at: M.matchBand(edge), under: M.matchBand(step(edge)) }));
property('matchBand() gives the higher band at exactly 0.55, 0.75 and 0.90 and the lower one a step below each', edges);
const shares = PAIRS.slice(0, 2000).map(([a]) => a).filter(a => Math.abs(Object.values(M.normalize(a)).reduce((x, y) => x + y, 0) - 1) > EPS);
property('a jar\'s shares add up to 1', shares);

/* The alias table and coerce(), since 2026-11-14. */
const { ANALYTE_MAP } = require(path.join(__dirname, '..', 'netlify/functions/lib/parse-coa.js'));
property(`every spelling the parser accepts (${Object.keys(ANALYTE_MAP).length}) reaches the same key in the app`,
  Object.entries(ANALYTE_MAP).filter(([s, k]) => JSON.stringify(Object.keys(M.sanitizeTerps({ [s]: 1 }))) !== JSON.stringify([k])).map(([s, k]) => ({ s, k })));
property('no compound is folded into another: caryophyllene oxide, linalool oxide and a bare "pinene" are dropped, not counted',
  ['caryophyllene oxide', 'Caryophyllene-Oxide', 'linalool oxide', 'pinene', 'Pinene'].filter(s => Object.keys(M.sanitizeTerps({ [s]: 1 })).length));
const COERCE = [['0.51', 0.51], [' 3 ', 3], ['12.5%', 12.5], ['.5', 0.5], ['1.5e-2', 0.015], ['0,45', 0], ['1,234.5', 0], ['abc', 0],
  ['<0.2', 0], ['ND', 0], ['', 0], ['-1', 0], [0.25, 0.25], [-0.1, 0]];
property('coerce() reads a plain number, with an exponent or a trailing %, and anything else as 0',
  COERCE.filter(([v, want]) => M.coerce(v) !== want).map(([v, want]) => ({ v, want, got: M.coerce(v) })));

/* The methodology page's "how often unrelated jars earn each label". */
{
  const fs = require('fs');
  const ROOT = path.join(__dirname, '..');
  const EXTRACTED = path.join(ROOT, 'test/fixtures/extracted');
  const { parseCoa } = require(path.join(ROOT, 'netlify/functions/lib/parse-coa.js'));
  const jars = fs.readdirSync(EXTRACTED).filter(f => f.endsWith('.txt')).sort()
    .map(f => parseCoa(fs.readFileSync(path.join(EXTRACTED, f), 'utf8')))
    .filter(o => o.usable && o.productClass === 'flower').map(o => M.normalize(o.terps));
  let pairs = 0, close = 0, related = 0;
  for (let a = 0; a < jars.length; a++) for (let b = a + 1; b < jars.length; b++) {
    const band = M.matchBand(M.cosine(jars[a], jars[b]))[1];
    pairs++; if (band === 'Strong') close++; if (band === 'Strong' || band === 'Good') related++;
  }
  const page = fs.readFileSync(path.join(ROOT, 'methodology/index.html'), 'utf8');
  const said = [['&ldquo;Close match&rdquo; about three times in ten', close, 3 / 10],
    ['at least &ldquo;Related profile&rdquo; about two times in three', related, 2 / 3]];
  for (const [words, count, share] of said) {
    const got = pairs ? count / pairs : NaN;
    property(`the methodology page says ${words.replace(/&[lr]dquo;/g, '"')}: ${count} of ${pairs} flower pairs (${Math.round(got * 100)}%), within 5 points of ${Math.round(share * 100)}%`,
      [!page.includes(words) && { missing: 'the page no longer says this - update the test with the page' },
       !(Math.abs(got - share) <= 0.05) && { got, share, fix: 'recompute and rewrite the page sentence (#labelBaseline)' }].filter(Boolean));
  }
}

if (failures) { console.log(`\nmatch-props: ${failures} failure${failures === 1 ? '' : 's'}`); process.exit(1); }
console.log('\nmatch-props clean');

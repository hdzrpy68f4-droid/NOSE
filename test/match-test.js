'use strict';
/* NOSE - the matching algorithm has one home, and it still gives the scores it
 * gave before it moved there.
 *
 *   node test/match-test.js      -> "match clean", or FAIL lines and exit 1
 *
 * js/match-math.<hash>.js holds TERPENES, sanitizeTerps, normalize,
 * averageProfiles, cosine and matchBand. The app loads it before
 * js/nose.<hash>.js and reads them from window.NoseMatch; the Codespace
 * scripts load the same file through scripts/lib/match.js. This checks:
 *
 *   - there is one such file, it loads in Node and as a browser script alike,
 *     and scripts/lib/match.js hands out that one
 *   - the app bundle defines none of the maths itself and takes all of it
 *     from window.NoseMatch; every page that loads the bundle loads the maths
 *     first; nothing else in the repo holds a copy
 *   - every value in test/fixtures/match-golden.json - written from the
 *     pre-move bundle (js/nose.81d6bb53.js at b596508) by
 *     test/match-golden-make.js - comes back identical to the last bit:
 *     1830 pair scores, 65 palates, normalised vectors, bands, coerce()
 *
 * No database, no network.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const matchLib = require(path.join(ROOT, 'scripts/lib/match.js'));
const golden = require(path.join(ROOT, 'test/fixtures/match-golden.json'));

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
};
/* Numbers compared to the last bit: Object.is, so -0 and NaN count too. */
const sameNumbers = (a, b) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
const decode = v => (v && typeof v === 'object' && !Array.isArray(v) && typeof v.$ === 'string' ? Number(v.$) : v);

/* --- one file, loadable both ways ---------------------------------------- */
const jsDir = path.join(ROOT, 'js');
const files = fs.readdirSync(jsDir).filter(f => /^match-math(\.[0-9a-f]{8})?\.js$/.test(f));
check('exactly one js/match-math.<hash>.js', files.length, 1);
const file = path.join(jsDir, files[0]);
const M = matchLib.load();
check('scripts/lib/match.js loads that file', matchLib.matchFile(), file);
check('it exports the maths, frozen',
  [Object.keys(M).sort(), Object.isFrozen(M)],
  [['TERPENES', 'TERP_ALIAS', 'averageProfiles', 'coerce', 'cosine', 'matchBand', 'normalize', 'sanitizeTerps', 'total'], true]);
{
  /* As the browser runs it: a classic script, no module, `self` the window. */
  const win = {};
  win.self = win;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), win, { filename: files[0] });
  const B = win.NoseMatch;
  check('as a browser script it sets window.NoseMatch, with the same functions',
    B ? Object.keys(B).map(k => typeof B[k] === 'function' ? B[k].toString() === M[k].toString() : JSON.stringify(B[k]) === JSON.stringify(M[k])) : null,
    Object.keys(M).map(() => true));
  check('...and gives the same score', B && B.cosine(B.normalize(golden.profiles[0].terps), B.normalize(golden.profiles[1].terps)), golden.pairs[0]);
}

/* --- the app takes all of it from there, and nothing else holds a copy ---- */
const bundles = fs.readdirSync(jsDir).filter(f => /^nose(\.[0-9a-f]{8})?\.js$/.test(f));
check('exactly one js/nose.<hash>.js', bundles.length, 1);
const app = fs.readFileSync(path.join(jsDir, bundles[0]), 'utf8');
const MATHS = /\bfunction\s+(normalize|cosine|matchBand|sanitizeTerps|averageProfiles|coerce|total)\s*\(|\bconst\s+(TERPENES|TERP_ALIAS)\s*=/g;
check('the app bundle defines none of the maths', app.match(MATHS), null);
check('...and takes it from window.NoseMatch',
  /const \{ TERPENES, normalize, averageProfiles, cosine, matchBand \} = window\.NoseMatch;/.test(app), true);
check('...before anything that uses it',
  app.indexOf('= window.NoseMatch;') < Math.min(...['normalize(', 'cosine(', 'matchBand(', 'averageProfiles(', 'TERPENES[']
    .map(t => app.indexOf(t)).filter(i => i >= 0)), true);

const html = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'vendor', 'test'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) html.push(p);
  }
})(ROOT);
const loaders = html.filter(p => /\/js\/nose(\.[0-9a-f]{8})?\.js/.test(fs.readFileSync(p, 'utf8')));
check('the pages that load the app bundle', loaders.map(p => path.relative(ROOT, p)).sort(), ['app.html', 'index.html']);
check('...each load js/match-math first, from the same build',
  loaders.map(p => {
    const s = fs.readFileSync(p, 'utf8');
    const m = s.indexOf(`/js/${files[0]}"`);
    return m >= 0 && m < s.indexOf(`/js/${bundles[0]}"`);
  }), loaders.map(() => true));

/* Nothing else that runs may carry the maths. wip/ keeps an unfinished,
   unloaded copy of an older bundle - listed here so a new copy is not. */
const COPY = /\bfunction\s+(cosine|normalize|matchBand|averageProfiles)\s*\(\s*(a\s*,\s*b|values|score|list)\s*\)/;
const copies = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'vendor'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(c|m)?js$/.test(e.name) && p !== file && COPY.test(fs.readFileSync(p, 'utf8'))) copies.push(path.relative(ROOT, p));
  }
})(ROOT);
check('no other file in the repo holds a copy of the maths (wip/ is a stale draft, loaded by nothing)',
  copies, ['wip/nose-farnesene-wip.js']);
check('...and nothing loads that draft',
  html.concat(fs.readdirSync(jsDir).map(f => path.join(jsDir, f))).filter(p => /nose-farnesene-wip/.test(fs.readFileSync(p, 'utf8'))).length, 0);

/* --- the scores it gave before it moved ---------------------------------- */
const all = [...golden.profiles, ...golden.edges];
const normalized = all.map(p => M.normalize(p.terps));
check(`normalize() of ${all.length} profiles, key order included`, JSON.stringify(normalized), JSON.stringify(golden.normalized));
check('total() of each', sameNumbers(all.map(p => M.total(p.terps)), golden.totals), true);
check('sanitizeTerps() of the lab spellings, strings, cannabinoids and isomers',
  JSON.stringify(golden.edges.map(e => M.sanitizeTerps(e.terps))), JSON.stringify(golden.sanitized));
const pairs = [];
for (let i = 0; i < golden.profiles.length; i++) {
  for (let j = i + 1; j < golden.profiles.length; j++) pairs.push(M.cosine(normalized[i], normalized[j]));
}
check(`cosine() of all ${golden.pairs.length} pairs, to the last bit`, sameNumbers(pairs, golden.pairs), true);
check('...and of each profile with itself', sameNumbers(golden.profiles.map((p, i) => M.cosine(normalized[i], M.normalize(p.terps))), golden.self), true);
const lemon = golden.profiles.find(p => p.name === 'demo:lemon-tart').terps;
check('...and of each edge case against the demo lemon-tart',
  sameNumbers(golden.edges.map((e, k) => M.cosine(normalized[golden.profiles.length + k], M.normalize(lemon))), golden.edgeScores), true);
const palates = golden.palates.map(s => {
  const vector = M.averageProfiles(s.members.map(m => all[m]));
  return { vector, score: M.cosine(vector, M.normalize(all[s.candidate].terps)) };
});
check(`averageProfiles() palates, ${golden.palates.length} of them`,
  JSON.stringify(palates.map(p => p.vector)), JSON.stringify(golden.palates.map(p => p.vector)));
check('...scored against their candidates', sameNumbers(palates.map(p => p.score), golden.palates.map(p => p.score)), true);
check(`matchBand() at every band edge and golden score (${golden.bands.length})`,
  golden.bands.map(b => M.matchBand(b.score)), golden.bands.map(b => b.band));
check(`coerce() on ${golden.coerce.length} raw values`,
  golden.coerce.map(c => M.coerce(decode(c.in))).map(v => (Number.isFinite(v) ? v : String(v))),
  golden.coerce.map(c => decode(c.out)).map(v => (Number.isFinite(v) ? v : String(v))));

/* The anchors, in words. */
const heroScore = M.cosine(M.normalize(lemon), M.normalize(golden.profiles.find(p => p.name === 'demo:cold-creek').terps));
check('the home page hero, lemon-tart against cold-creek: 0.7452..., shown as 75, banded "Partial overlap"',
  [heroScore === golden.anchors.heroDefault.score, Math.round(heroScore * 100), M.matchBand(heroScore)], [true, 75, ['Partial overlap', 'Moderate']]);
check('three times the intensity is the same shape: 100', Math.round(golden.anchors.tripled * 100), 100);
check('THCA, THC and CBD never enter the vector: still 100', Math.round(golden.anchors.withCannabinoids * 100), 100);

if (failures) {
  console.error(`\nmatch-test: ${failures} failure${failures === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('\nmatch clean');

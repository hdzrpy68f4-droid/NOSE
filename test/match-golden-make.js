'use strict';
/* NOSE - write test/fixtures/match-golden.json: the scores the app's matching
 * code produced BEFORE it moved into js/match-math.js, for test/match-test.js
 * to hold the shared module to.
 *
 * Since 2026-11-14 it can be made again, from today's maths:
 *
 *   node test/extract-dump.js
 *   node test/match-golden-make.js
 *       the same file, byte for byte, while no score has moved
 *   node test/match-golden-make.js --why "<what changed>"
 *       for a change that is MEANT to move scores: writes the reason and
 *       today's commit into "about" and "source"
 *
 * With no bundle named, the maths comes from js/match-math.*.js through
 * scripts/lib/match.js and the demo profiles from js/nose.*.js's PROFILES.
 * Without --why the "about" and "source" strings already in the file are
 * kept. Run with --why only in the commit that changes the maths, and say
 * why there; never to make a test pass. PARSER-HANDOFF s13, "The maths has a
 * property test".
 *
 * The first run, kept for the record:
 *
 *   git show b596508:js/nose.81d6bb53.js > /tmp/nose-before.js
 *   node test/match-golden-make.js /tmp/nose-before.js
 *
 * Run once, 2026-09-23, against js/nose.81d6bb53.js at b596508 - the last
 * bundle that defined the maths itself. It reads that bundle's own text
 * (TERPENES, the spec-compliance block through cosine(), matchBand() and the
 * demo PROFILES), runs it in a fresh VM context exactly as written, and
 * records what it returns for:
 *
 *   - the five demo profiles and the terps of every accepted fixture, as
 *     today's parser reads them
 *   - normalize() and total() of each, and cosine() of every pair - what the
 *     hero shows
 *   - averageProfiles() palates against a candidate - what the matcher shows
 *   - matchBand() at each band edge, and of every palate and edge score
 *   - sanitizeTerps() and coerce() on raw lab spellings, below-LOQ strings,
 *     cannabinoids, nerolidol isomers and non-numbers
 *
 * A changed golden file means the maths changed, and that is what the test
 * exists to catch. Inputs are written
 * first and read back before anything is computed, so the test recomputes
 * from byte-identical objects, key order included - cosine() sums in key
 * order, and a float sum depends on its order.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test/fixtures/match-golden.json');
const EXTRACTED = path.join(ROOT, 'test/fixtures/extracted');

function block(lines, startsWith, endsBefore) {
  const i = lines.findIndex(l => l.startsWith(startsWith));
  if (i < 0) throw new Error(`not found: ${startsWith}`);
  if (typeof endsBefore === 'number') return lines.slice(i, i + endsBefore);
  const j = lines.findIndex((l, k) => k > i && endsBefore(l));
  if (j < 0) throw new Error(`no end after: ${startsWith}`);
  return lines.slice(i, j);
}

function oldMaths(bundlePath) {
  const lines = fs.readFileSync(bundlePath, 'utf8').split('\n');
  const code = [
    ...block(lines, '    const TERPENES = {', l => l.startsWith('    const PROFILES = [')),
    ...block(lines, '    const PROFILES = [', l => l.startsWith('    ];')), '    ];',
    ...block(lines, '    /* ---- SPEC COMPLIANCE', l => l.startsWith('    function familyShares(')),
    ...block(lines, '    function matchBand(', 1)
  ].join('\n');
  if (!/function cosine\(/.test(code) || !/function normalize\(/.test(code)) {
    throw new Error('that bundle does not define the maths itself - give it the pre-move bundle (b596508)');
  }
  const ctx = vm.createContext({});
  return vm.runInContext(`${code}\n;({ TERPENES, PROFILES, coerce, sanitizeTerps, total, normalize, averageProfiles, cosine, matchBand })`, ctx);
}

/* Today's maths: js/match-math.*.js as the app loads it, and the demo
   profiles from the one js/nose.*.js, read from its own text. */
function todaysMaths() {
  const M = require(path.join(ROOT, 'scripts/lib/match.js')).load();
  const jsDir = path.join(ROOT, 'js');
  const bundles = fs.readdirSync(jsDir).filter(f => /^nose(\.[0-9a-f]{8})?\.js$/.test(f));
  if (bundles.length !== 1) throw new Error(`expected exactly one js/nose.<hash>.js, found ${bundles.length}`);
  const lines = fs.readFileSync(path.join(jsDir, bundles[0]), 'utf8').split('\n');
  const code = [...block(lines, '    const PROFILES = [', l => l.startsWith('    ];')), '    ];'].join('\n');
  const PROFILES = vm.runInContext(`${code}\n;PROFILES`, vm.createContext({}));
  return { ...M, PROFILES };
}

/* JSON cannot hold NaN or the infinities; coerce() cases carry them as {"$": "NaN"}. */
const encode = v => (typeof v === 'number' && !Number.isFinite(v) ? { $: String(v) } : v);

function main() {
  const args = process.argv.slice(2);
  const whyAt = args.indexOf('--why');
  const why = whyAt >= 0 ? args[whyAt + 1] : null;
  if (whyAt >= 0 && !why) { console.error('usage: node test/match-golden-make.js [--why "<what changed>"] | <pre-move js/nose bundle>'); process.exit(2); }
  const bundle = whyAt >= 0 ? null : args[0];
  const M = bundle ? oldMaths(bundle) : todaysMaths();
  let about = 'Scores from the maths in js/nose.81d6bb53.js at b596508, before it moved into js/match-math.js. ' +
              'Written once by test/match-golden-make.js; read by test/match-test.js. Never regenerate to make a test pass.';
  let source = 'js/nose.81d6bb53.js @ b596508';
  if (why) {
    const commit = require('child_process').execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const file = path.basename(require(path.join(ROOT, 'scripts/lib/match.js')).matchFile());
    source = `js/${file}, regenerated ${new Date().toISOString().slice(0, 10)} on top of ${commit}`;
    about = `Scores from the maths in ${source}: ${why}. ` +
            'Written by test/match-golden-make.js --why; read by test/match-test.js. Never regenerate to make a test pass.';
  } else if (!bundle && fs.existsSync(OUT)) {
    const before = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    about = before.about; source = before.source;
  }
  const { parseCoa } = require(path.join(ROOT, 'netlify/functions/lib/parse-coa.js'));

  /* --- inputs, written and read back before use --------------------------- */
  const profiles = M.PROFILES.map(p => ({ name: `demo:${p.id}`, terps: JSON.parse(JSON.stringify(p.terps)) }));
  for (const f of fs.readdirSync(EXTRACTED).filter(f => f.endsWith('.txt')).sort()) {
    const o = parseCoa(fs.readFileSync(path.join(EXTRACTED, f), 'utf8'));
    if (o.usable) profiles.push({ name: `fixture:${f.slice(0, -4)}`, terps: o.terps });
  }
  const lemon = M.PROFILES.find(p => p.id === 'lemon-tart').terps;
  const edges = [
    { name: 'three times the intensity', terps: Object.fromEntries(Object.entries(lemon).map(([k, v]) => [k, v * 3])) },
    { name: 'with THCA, THC and CBD', terps: { ...lemon, thca: 24.1, 'Δ9-THC': 0.3, cbd: 0.1, CBGA: '0.9' } },
    { name: 'lab spellings and strings', terps: {
      'd-Limonene': '0.512', 'β-Myrcene': '<0.200', 'Linalool': 'ND', 'alpha-pinene': 'BQL', 'beta pinene': ' 0.1 %',
      'Beta Caryophyllene': '0.33', 'alpha humulene': 0.12, ' Terpinolene ': '0.2', 'Ocimene': -1, 'Fenchol': '≤0.05',
      'Camphene': 'none detected', 'a-Bisabolol': 'loq', 'Guaiol': 0.4, 'Eucalyptol': '0.02' } },
    { name: 'nerolidol isomers sum', terps: { 'trans-Nerolidol': '0.05', 'cis-nerolidol': 0.02, Nerolidol: '0.01', limonene: 0.2 } },
    { name: 'aliases the app folds', terps: { 'caryophyllene oxide': 0.04, 'linalool oxide': 0.03, pinene: 0.02, 'bisabolol-a': 0.01, limonene: 0.1 } },
    { name: 'only cannabinoids', terps: { thca: 20, cbd: 1 } },
    { name: 'all zero', terps: { limonene: 0, myrcene: '0.000' } },
    { name: 'empty', terps: {} }
  ];
  const coerceIn = [0, 0.25, -0.1, NaN, Infinity, -Infinity, '0.51', '<0.200', '≤0.1', 'ND', 'n/d', 'None Detected', 'BQL', 'loq',
                    '12.5%', ' 3 ', '1,234.5', 'abc', '', null, undefined, true, [1], { v: 1 }];
  const decoded = JSON.parse(JSON.stringify({ profiles, edges }));

  /* --- what the pre-move code returns ------------------------------------ */
  const all = [...decoded.profiles, ...decoded.edges];
  const normalized = all.map(p => M.normalize(p.terps));
  const pairs = [];
  for (let i = 0; i < decoded.profiles.length; i++) {
    for (let j = i + 1; j < decoded.profiles.length; j++) pairs.push(M.cosine(normalized[i], normalized[j]));
  }
  const self = decoded.profiles.map((p, i) => M.cosine(normalized[i], M.normalize(p.terps)));
  const edgeScores = decoded.edges.map((e, k) => M.cosine(normalized[decoded.profiles.length + k], M.normalize(lemon)));

  const n = decoded.profiles.length;
  const palateSets = [];
  for (let k = 0; k < n; k++) palateSets.push({ members: [k, (k + 1) % n, (k + 2) % n], candidate: (k + 3) % n });
  palateSets.push({ members: [0], candidate: 1 }, { members: [0, 1], candidate: 2 }, { members: [0, 1, 2, 3, 4], candidate: 5 });
  palateSets.push({ members: [0, n + decoded.edges.findIndex(e => e.name === 'empty')], candidate: 1 });   // an empty jar is skipped
  const palates = palateSets.map(s => {
    const vector = M.averageProfiles(s.members.map(m => all[m]));
    return { ...s, vector, score: M.cosine(vector, M.normalize(all[s.candidate].terps)) };
  });

  const edgesOfBands = [1, 0.9, 0.8999999999999999, 0.75, 0.7499999999999999, 0.55, 0.5499999999999999, 0, -0.1];
  /* Every band edge, and every palate and edge score; the pair scores are
     banded by the same function, so pinning them all adds size, not cover. */
  const scores = [...new Set([...edgesOfBands, ...edgeScores, ...palates.map(p => p.score)])];
  const bands = scores.map(s => ({ score: s, band: M.matchBand(s) }));

  const golden = {
    about,
    source,
    profiles: decoded.profiles,
    edges: decoded.edges,
    normalized,
    totals: all.map(p => M.total(p.terps)),
    sanitized: decoded.edges.map(e => M.sanitizeTerps(e.terps)),
    pairs,
    self,
    edgeScores,
    palates,
    bands,
    coerce: coerceIn.map(v => ({ in: encode(v), out: encode(M.coerce(v)) })),
    anchors: {
      heroDefault: { palate: 'demo:lemon-tart', candidate: 'demo:cold-creek',
                     score: M.cosine(M.normalize(lemon), M.normalize(M.PROFILES.find(p => p.id === 'cold-creek').terps)) },
      tripled: edgeScores[0],
      withCannabinoids: edgeScores[1]
    }
  };
  fs.writeFileSync(OUT, JSON.stringify(golden) + '\n');
  console.log(`wrote ${path.relative(ROOT, OUT).split(path.sep).join('/')}: ${decoded.profiles.length} profiles, ${pairs.length} pairs, ` +
              `${palates.length} palates, ${bands.length} bands, ${golden.coerce.length} coerce cases`);
}

main();

#!/usr/bin/env node
'use strict';
/* NOSE - every vote the app sends is stored, and the question asks about smell
 * and taste. PARSER-HANDOFF s13, "Every vote stored".
 *
 *   node test/match-feedback-test.js     -> "match-feedback clean", or FAIL lines and exit 1
 *
 * netlify/functions/match-feedback.js and feedback-read.js are driven through
 * their default exports, offline, with a stand-in for @netlify/blobs that
 * answers as 10.x does - getStore(), setJSON(), get(), list() with and
 * without paginate. Until 2026-10-13 the vote took Strong, Good, Partial and
 * Weak, while the app sends matchBand(score)[1] - Strong, Good, Moderate or
 * Low - so every vote on a Partial overlap or Different profile match was
 * refused with bad-band and lost.
 *
 * What it pins down:
 *   - the bands: matchBand()'s own four names, read from js/match-math.*.js,
 *     each stored under its lowercase slug; Partial, Weak, a lowercase name,
 *     an unknown name, a label, "constructor" and a non-string refused with
 *     bad-band and nothing stored; a score of 0 accepted
 *   - what does not move: the key layout (votes/<slug>/<vote>/<day>/<time>-<rand>),
 *     the store and its strong consistency, the record's ten fields, nothing
 *     read about the person (no header, no cookie, no account), the privacy
 *     page's sentence about votes
 *   - feedback-read: the summary counts all four in matchBand()'s order, reads
 *     only those four, filters by band and vote, exports them as CSV; its
 *     caveat word for word; its token still fails closed
 *   - the app: its vote takes the band from matchBand(score)[1] and the number
 *     from shownScore(score), read from the bundle's own source text and run on
 *     the default /app pair (74, Partial overlap), and that vote is counted
 *     under Moderate; the question asks whether the smell and taste matched the
 *     score, with no effect word anywhere in the feedback block
 *
 * No network, no Netlify, no database. Nothing is written to disk.
 */

for (const k of ['FEEDBACK_READ_TOKEN', 'NETLIFY_SITE_ID', 'NETLIFY_AUTH_TOKEN', 'NETLIFY_BLOBS_CONTEXT']) delete process.env[k];

const crypto = require('crypto');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const VOTE = path.join(ROOT, 'netlify/functions/match-feedback.js');
const READ = path.join(ROOT, 'netlify/functions/feedback-read.js');
const BEACON = path.join(ROOT, 'netlify/lib/beacon.js');
const APP_HTML = path.join(ROOT, 'app.html');
const PRIVACY = path.join(ROOT, 'privacy/index.html');
const M = require(path.join(ROOT, 'scripts/lib/match.js')).load();
const golden = require(path.join(ROOT, 'test/fixtures/match-golden.json'));

/* A run that stops on a promise nothing keeps alive exits 0 quietly. Only
 * reaching the end counts. */
let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) {
    process.stderr.write('match-feedback: stopped before the last check - NOT clean\n');
    process.exitCode = 1;
  }
});

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
}
const codeOf = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
/* The prompt's list of words that speak about effects. */
const EFFECT_WORDS = /relax|calm|sleep|energ|focus|uplift|euphor|sedat|mood|high|buzz|stoned|pain|anxiety|stress|treat|relief|cure/i;

/* ------------------------------------------- Netlify Blobs, stood in for */

/* As @netlify/blobs 10.x answers: getStore({ name, consistency }), setJSON()
   with { modified, etag }, get(key, { type: 'json' }), list() - one page, or
   with paginate: true an async iterator of pages. Every call is recorded. */
const blobs = { stores: new Map(), opened: [], calls: [] };
function storeNamed(name) {
  if (!blobs.stores.has(name)) blobs.stores.set(name, new Map());
  const m = blobs.stores.get(name);
  const page = prefix => ({ blobs: [...m.keys()].filter(k => k.startsWith(prefix)).sort().map(key => ({ key, etag: m.get(key).etag })), directories: [] });
  return {
    async setJSON(key, value) {
      blobs.calls.push(['setJSON', name, key]);
      const etag = `"${crypto.randomBytes(8).toString('hex')}"`;
      m.set(key, { text: JSON.stringify(value), etag });
      return { modified: true, etag };
    },
    async get(key, opts = {}) {
      blobs.calls.push(['get', name, key]);
      if (!m.has(key)) return null;
      return opts.type === 'json' ? JSON.parse(m.get(key).text) : m.get(key).text;
    },
    list({ prefix = '', paginate = false } = {}) {
      blobs.calls.push(['list', name, prefix, paginate]);
      if (paginate) return (async function* () { yield page(prefix); })();
      return Promise.resolve(page(prefix));
    },
  };
}
globalThis.__noseFeedbackBlobs = {
  getStore(opts) {
    const o = typeof opts === 'string' ? { name: opts } : { ...opts };
    blobs.opened.push(o);
    return storeNamed(o.name);
  },
};
const votesIn = () => [...(blobs.stores.get('match-feedback') || new Map()).keys()].sort();
const recordAt = key => JSON.parse(blobs.stores.get('match-feedback').get(key).text);
const writes = () => blobs.calls.filter(c => c[0] === 'setJSON').length;

/* Both functions, and netlify/lib/beacon.js, are ES module syntax in a
   CommonJS package; Netlify's esbuild bundler compiles them (netlify.toml).
   Node has to be told, so a one-file hook loads those three as modules and
   answers @netlify/blobs with the stand-in above. */
async function loadFunctions() {
  const urls = [VOTE, READ, BEACON].map(f => pathToFileURL(f).href);
  const standIn = 'data:text/javascript,' + encodeURIComponent(
    'export function getStore(o) { return globalThis.__noseFeedbackBlobs.getStore(o); }');
  Module.register('data:text/javascript,' + encodeURIComponent(`
    const URLS = new Set(${JSON.stringify(urls)});
    export async function resolve(specifier, context, next) {
      if (specifier === '@netlify/blobs') return { url: ${JSON.stringify(standIn)}, shortCircuit: true };
      return next(specifier, context);
    }
    export async function load(url, context, next) {
      if (URLS.has(url)) {
        const r = await next(url, { ...context, format: 'module' });
        return { ...r, format: 'module', shortCircuit: true };
      }
      return next(url, context);
    }`));
  return { vote: (await import(urls[0])).default, read: (await import(urls[1])).default };
}

/* What the functions print. */
const CONSOLE = ['log', 'info', 'warn', 'error', 'debug'];
async function quietly(fn) {
  const lines = [];
  const saved = CONSOLE.map(k => console[k]);
  CONSOLE.forEach(k => { console[k] = (...a) => lines.push(`${k}: ${a.map(String).join(' ')}`); });
  try { return { value: await fn(), lines }; } finally { CONSOLE.forEach((k, i) => { console[k] = saved[i]; }); }
}

/* ------------------------------------------------- the app, from its bundle */

/* One top-level piece of the bundle's source, by its opening text: from there
   to the bracket that closes the first one opened, quotes stepped over. */
function pieceOf(src, opening) {
  const at = src.indexOf(opening);
  if (at < 0) return null;
  const open = src.slice(at).search(/[{[]/) + at;
  let depth = 0, quote = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{' || c === '[') depth++;
    if (c === '}' || c === ']') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return null;
}

async function main() {
  const jsDir = path.join(ROOT, 'js');
  const bundles = fs.readdirSync(jsDir).filter(f => /^nose(\.[0-9a-f]{8})?\.js$/.test(f));
  check('exactly one js/nose.<hash>.js', bundles.length, 1);
  const app = fs.readFileSync(path.join(jsDir, bundles[0]), 'utf8');
  const voteSrc = fs.readFileSync(VOTE, 'utf8');
  const readSrc = fs.readFileSync(READ, 'utf8');
  const voteCode = codeOf(voteSrc);
  const readCode = codeOf(readSrc);

  /* matchBand()'s own names, from js/match-math.*.js, strongest first. */
  const grid = Array.from({ length: 10001 }, (_, i) => i / 10000);
  const NAMES = [...new Set(grid.map(s => M.matchBand(s)[1]))].reverse();
  const SLUGS = NAMES.map(n => n.toLowerCase());
  check('matchBand() names four bands, strongest first: Strong, Good, Moderate, Low', NAMES, ['Strong', 'Good', 'Moderate', 'Low']);

  /* ============================================================ the code */

  check('match-feedback.js takes exactly matchBand()\'s four names, each to its lowercase slug, in matchBand()\'s order',
    voteCode.match(/^const BANDS = \{.*\};$/m)?.[0], `const BANDS = { ${NAMES.map(n => `${n}: '${n.toLowerCase()}'`).join(', ')} };`);
  check('feedback-read.js reads the same four slugs, to the same names, in the same order',
    readCode.match(/^const BAND_SLUGS = \{.*\};$/m)?.[0], `const BAND_SLUGS = { ${NAMES.map(n => `${n.toLowerCase()}: '${n}'`).join(', ')} };`);
  check('...and neither names Partial or Weak as a band any more, outside its comments',
    [/\b(partial|weak)\b/i.test(voteCode), /\b(partial|weak)\b/i.test(readCode)], [false, false]);
  check('the vote reads nothing about the person: no request header, cookie, account, session, address or place',
    voteCode.match(/request\.headers|\.headers\.get|cookie|authoriz|session|account|user_?id|x-forwarded|x-nf-|client-ip|\bgeo\b|\bip\b|context\.|auth\.js/gi), null);
  check('...and imports only @netlify/blobs and netlify/lib/beacon.js',
    voteCode.match(/^import [\s\S]*?;$/gm).map(l => l.match(/from '([^']+)'/)[1]), ['@netlify/blobs', '../lib/beacon.js']);

  const { vote, read } = await loadFunctions();
  const post = body => vote(new Request('https://nose-app.com/.netlify/functions/match-feedback', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  const ballot = (band, score, extra = {}) => ({ vote: 'up', band, score, candidate: 'cold-creek', palate: ['lemon-tart'], palateSize: 1,
                                                 ts: new Date().toISOString(), ...extra });

  /* =================================================== one vote per band */

  /* A real golden pair score in each band, shown as the app shows it. */
  const inBand = NAMES.map(n => golden.pairs.find(s => M.matchBand(s)[1] === n));
  check('a golden pair score in every band', inBand.every(s => typeof s === 'number'), true);
  const kept = [];
  for (const [i, band] of NAMES.entries()) {
    const before = votesIn();
    const res = await quietly(() => post(ballot(band, M.shownScore(inBand[i]), { vote: i % 2 ? 'down' : 'up' })));
    const added = votesIn().filter(k => !before.includes(k));
    kept.push(...added);
    check(`${band}: 204, one vote stored, under votes/${SLUGS[i]}/${i % 2 ? 'down' : 'up'}/, nothing logged`,
      [res.value.status, await res.value.text(), added.length, added.every(k => k.startsWith(`votes/${SLUGS[i]}/${i % 2 ? 'down' : 'up'}/`)), res.lines],
      [204, '', 1, true, []]);
  }
  check('all four bands stored, each under its slug', SLUGS.map(s => kept.filter(k => k.split('/')[1] === s).length), [1, 1, 1, 1]);
  check('the key layout has not moved: votes/<slug>/<up|down>/<UTC day>/<HHMMSSmmm>-<rand>, the day the server\'s own',
    kept.map(k => { const r = recordAt(k); return /^votes\/(strong|good|moderate|low)\/(up|down)\/\d{4}-\d{2}-\d{2}\/\d{9}-[a-z0-9]{1,6}$/.test(k) && k.split('/')[3] === r.ts.slice(0, 10) && k.split('/')[4].slice(0, 9) === r.ts.slice(11, 23).replace(/[:.]/g, ''); }),
    [true, true, true, true]);
  check('one store, "match-feedback", site-wide and strongly consistent, as before',
    [...new Set(blobs.opened.map(o => JSON.stringify(o)))], [JSON.stringify({ name: 'match-feedback', consistency: 'strong' })]);
  check('the record has not moved: its ten fields, the band as matchBand() names it, the score as sent',
    kept.map(k => { const r = recordAt(k); return [Object.keys(r), r.v, r.band, r.score]; }),
    NAMES.map((n, i) => [['v', 'vote', 'band', 'score', 'candidate', 'palate', 'palateSize', 'ts', 'clientTs', 'ctx'], 1, n, M.shownScore(inBand[i])]));

  /* ============================================================ refusals */

  const refused = ['Partial', 'Weak', 'moderate', 'low', 'STRONG', 'Medium', 'Partial overlap', 'Different profile', 'constructor', 'toString', '', null, ['Strong'], 3];
  const answers = [];
  for (const band of refused) {
    const before = writes();
    const res = await post(ballot(band, 60));
    answers.push([res.status, await res.text(), writes() - before]);
  }
  check(`each band matchBand() never gives refused with bad-band and nothing stored: ${refused.map(b => JSON.stringify(b)).join(', ')}`,
    answers, refused.map(() => [400, JSON.stringify({ error: 'rejected', reason: 'bad-band' }), 0]));
  check('...and the store holds just the four votes', votesIn(), kept.slice().sort());

  {
    const before = votesIn();
    const res = await post(ballot('Low', 0, { vote: 'down' }));
    const added = votesIn().filter(k => !before.includes(k));
    check('a score of 0 is accepted: a Low match, down, stored with its 0',
      [res.status, added.length, added[0] && added[0].split('/').slice(1, 3), added[0] && recordAt(added[0]).score],
      [204, 1, ['low', 'down'], 0]);
    kept.push(...added);
  }
  check('the other refusals are as before: a bad vote, a score off 0-100 or not whole, a bad candidate',
    await Promise.all([ballot('Good', 80, { vote: 'sideways' }), ballot('Good', 101), ballot('Good', 80.5), ballot('Good', '80'),
                       ballot('Good', 80, { candidate: 'Cold Creek' })].map(async b => (await (await post(b)).json()).reason)),
    ['bad-vote', 'bad-score', 'bad-score', 'bad-score', 'bad-candidate']);

  /* ======================================================== feedback-read */

  const token = crypto.randomBytes(24).toString('hex');
  const get = (query = '', auth = `Bearer ${token}`) => read(new Request(`https://nose-app.com/.netlify/functions/feedback-read${query}`,
    { headers: auth ? { authorization: auth } : {} }));
  {
    const res = await quietly(() => get());
    check('feedback-read still fails closed with no token set: 503', res.value.status, 503);
  }
  process.env.FEEDBACK_READ_TOKEN = token;
  check('...and a wrong token gets 401', (await get('', `Bearer ${token.slice(1)}x`)).status, 401);

  /* A key under a slug matchBand() never names - as no vote could be stored
     before today but by hand - is not one of the four, and is not read. */
  storeNamed('match-feedback').setJSON('votes/partial/up/2026-10-01/120000000-abc123', { v: 1, vote: 'up', band: 'Partial' });
  storeNamed('match-feedback').setJSON('votes/weak/down/2026-10-01/120000000-def456', { v: 1, vote: 'down', band: 'Weak' });

  const counts = slug => {
    const ks = kept.filter(k => k.split('/')[1] === slug);
    const up = ks.filter(k => k.split('/')[2] === 'up').length, down = ks.length - up;
    return { up, down, total: ks.length, upShare: ks.length ? Number((up / ks.length).toFixed(3)) : null };
  };
  const summary = await (await get()).json();
  check('the summary counts all four, in matchBand()\'s order, and only those four',
    [Object.keys(summary.summary.byBand), summary.summary.byBand, summary.totalRecords],
    [NAMES, Object.fromEntries(NAMES.map((n, i) => [n, counts(SLUGS[i])])), kept.length]);
  check('...overall too', summary.summary.overall,
    { up: kept.filter(k => k.split('/')[2] === 'up').length, down: kept.filter(k => k.split('/')[2] === 'down').length, total: kept.length,
      upShare: Number((kept.filter(k => k.split('/')[2] === 'up').length / kept.length).toFixed(3)) });
  check('its caveat stays, word for word', summary.caveat,
    'Counts are votes, not voters: there is no identifier, so one person voting twice counts twice (group by ctx to collapse repeats). ' +
    'Up-share is meaningless at small n and is not evidence the aroma-shape hypothesis holds.');
  check('the summary is read from the keys alone: no blob read',
    blobs.calls.filter(c => c[0] === 'get').length, 0);

  const byBand = await Promise.all(NAMES.map(async n => (await (await get(`?band=${n}&limit=50`)).json()).records.map(r => r.band)));
  check('?band= filters each of the four, records and all', byBand, NAMES.map((n, i) => kept.filter(k => k.split('/')[1] === SLUGS[i]).map(() => n)));
  check('?band=Low&vote=down: just those two - the 0 and the golden Low',
    (await (await get('?band=Low&vote=down&limit=50')).json()).records.map(r => [r.band, r.vote, r.score]).sort((a, b) => a[2] - b[2]),
    [['Low', 'down', 0], ['Low', 'down', M.shownScore(inBand[3])]]);
  const csv = await get('?format=csv');
  const rows = (await csv.text()).trim().split('\n');
  check('the CSV export: the same columns, a row for every vote of the four, every band in it',
    [csv.status, csv.headers.get('content-type'), rows[0], rows.length - 1,
     NAMES.map(n => rows.slice(1).filter(r => r.split(',')[3] === n).length)],
    [200, 'text/csv; charset=utf-8', 'ts,clientTs,vote,band,score,candidate,palateSize,palate,palateTruncated,ctx', kept.length,
     SLUGS.map(s => kept.filter(k => k.split('/')[1] === s).length)]);

  /* ============================================================== the app */

  check('the app\'s vote takes its band from matchBand(score)[1] and its number from shownScore(score), in its bundle\'s source text',
    [/\bscore:shownScore\(score\),/.test(app), /\bband:matchBand\(score\)\[1\],/.test(app)], [true, true]);
  check('...and its only sender posts that context, with the vote, to match-feedback',
    [(app.match(/\/\.netlify\/functions\/match-feedback/g) || []).length, /const payload=\{\.\.\.feedbackContext,vote\};/.test(app)], [2, true]);

  /* The bundle's own pieces, run as the page runs them on the default /app
     pair, with the maths from js/match-math.*.js and a beacon that records. */
  const sent = [];
  const pieces = ['const PROFILES =', 'function profileById(', 'function palateProfiles(', 'function palateVector(',
                  'function reportableId(', 'function resetFeedback(', 'function sendFeedback('].map(o => pieceOf(app, o));
  check('the vote\'s pieces are in the bundle: PROFILES, profileById, palateProfiles, palateVector, reportableId, resetFeedback, sendFeedback',
    pieces.map(p => typeof p === 'string'), pieces.map(() => true));
  const defaults = app.match(/palateIds:\['([a-z0-9-]+)'\], appCandidate:'([a-z0-9-]+)',/);
  const element = () => ({ hidden: false, textContent: 'x', querySelectorAll: () => [] });
  const sandbox = {
    window: { NoseMatch: M }, Blob: class { constructor(parts, opts) { this.text = parts.join(''); this.type = opts.type; } },
    navigator: { sendBeacon: (url, blob) => { sent.push({ url, type: blob.type, body: blob.text }); return true; } },
    document: { getElementById: element }, state: { palateIds: [defaults[1]], appCandidate: defaults[2], saved: [] },
  };
  vm.createContext(sandbox);
  vm.runInContext(`const { normalize, averageProfiles, cosine, matchBand, shownScore } = window.NoseMatch;\n${pieces.join('\n')}\n` +
    'let feedbackContext=null;\n' +
    'this.run = (vote) => { const b=profileById(state.appCandidate); const palateVec=palateVector(); const score=cosine(palateVec,normalize(b.terps));' +
    ' resetFeedback(score,b); sendFeedback(vote); return score; };', sandbox);
  check('the default /app pair is the home page\'s, lemon-tart against cold-creek', [defaults[1], defaults[2]], ['lemon-tart', 'cold-creek']);
  check('...and updateFullResult() scores it as this run does', /const score=cosine\(palateVec,normalize\(b\.terps\)\);/.test(pieceOf(app, 'function updateFullResult(') || ''), true);
  const score = sandbox.run('up');
  const payload = JSON.parse(sent[0].body);
  check('the bundle\'s vote on the default pair: 0.7452..., sent as 74 · Moderate - the band behind "Partial overlap"',
    [Object.is(score, golden.anchors.heroDefault.score), M.matchBand(score), sent.length, sent[0].url, sent[0].type,
     Object.keys(payload), payload.score, payload.band, payload.candidate, payload.palate, payload.palateSize, payload.vote],
    [true, ['Partial overlap', 'Moderate'], 1, '/.netlify/functions/match-feedback', 'application/json',
     ['score', 'band', 'palate', 'palateSize', 'candidate', 'ts', 'vote'], 74, 'Moderate', 'cold-creek', ['lemon-tart'], 1, 'up']);
  {
    const before = votesIn();
    const res = await post(sent[0].body);
    const added = votesIn().filter(k => !before.includes(k));
    const after = await (await get()).json();
    check('...that vote is stored under votes/moderate/up/ and counted under Moderate - before 2026-10-13 it was refused with bad-band',
      [res.status, added.length, added[0] && added[0].split('/').slice(0, 3).join('/'), after.summary.byBand.Moderate.up - counts('moderate').up],
      [204, 1, 'votes/moderate/up', 1]);
  }

  const html = fs.readFileSync(APP_HTML, 'utf8');
  const block = (html.match(/<div class="match-feedback" id="matchFeedback">[\s\S]*?<p class="match-feedback-ack" id="feedbackAck"[^>]*><\/p>/) || [''])[0];
  check('the feedback block is on the page', block.length > 0, true);
  const q = (block.match(/<p class="match-feedback-q">([^<]*)<\/p>/) || [])[1];
  check('the question asks whether the smell and taste matched the score, after the same first sentence',
    q, 'This score is a hypothesis, not a proven prediction. Did the smell and taste match the score?');
  check('..."your experience" is asked nowhere on the page', /your experience/i.test(html), false);
  check('...both buttons stay: Matched (up) and Didn\'t match (down)',
    [...block.matchAll(/data-vote="(up|down)"[^>]*>\s*<span aria-hidden="true">[^<]*<\/span>\s*([^<]*?)\s*<\/button>/g)].map(m => [m[1], m[2]]),
    [['up', 'Matched'], ['down', 'Didn’t match']]);
  const words = block.replace(/<[^>]+>/g, ' ') + ' ' + [...block.matchAll(/aria-label="([^"]*)"/g)].map(m => m[1]).join(' ');
  check('no effect word in the feedback block, read or heard', (words.match(new RegExp(EFFECT_WORDS.source, 'gi')) || []), []);
  check('the privacy page\'s sentence about votes still holds: these are the fields a vote sends',
    fs.readFileSync(PRIVACY, 'utf8').includes('When you press &ldquo;Matched&rdquo; or &ldquo;Didn\'t match&rdquo; on a result, we receive: the similarity score, its confidence band, how many jars were in your palate, which built-in sample jars were involved, and a timestamp.</p>'),
    true);

  finished = true;
  if (failures) {
    console.log(`\nmatch-feedback: ${failures} FAILED`);
    process.exit(1);
  }
  console.log('\nmatch-feedback clean');
}

main().catch(err => { console.error('FAIL: match-feedback crashed:', err && err.stack ? err.stack : err); process.exit(1); });

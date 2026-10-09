'use strict';
/* NOSE - pinned widget releases: the builder, the publisher, the function
 * that serves them and the check. PARSER-HANDOFF s14, "Pinned releases".
 *
 *   node test/b2b-release-test.js        expect: b2b-release clean
 *
 * Offline, after the build (it builds from the files build.sh leaves). Each
 * release is built in a throwaway git world - a bare "origin" and clones of
 * it, holding this tree's five widget files, its stylesheet and an empty
 * record - with Netlify Blobs stood in for as @netlify/blobs 10.x answers.
 * What it pins down:
 *   - the same commit and version give the same bytes: twice, from two
 *     clones, and in a process with another clock, zone and locale
 *   - nose-matches.js is a header and js/match-math, js/b2b-rank,
 *     js/aroma-bar, js/b2b-strings and js/b2b-widget, verbatim and in that
 *     order, but for the widget's two stylesheet lines - this release's own
 *     stylesheet and its sha384; nose-matches.css is css/b2b-widget verbatim;
 *     the bundle loads as a page loads it and defines <nose-matches>
 *   - refused, with nothing built or sent: a change in the tree, staged,
 *     unstaged or untracked; a commit not on origin/main, or behind it;
 *     origin unreachable; widget files unchanged since the last release; a
 *     record it cannot read; files not as build.sh leaves them
 *   - publishing: the next version, the stylesheet first, each written only
 *     if new, read back, then the row; never overwriting a release, going on
 *     after a run that stopped part way, a write without an ETag a failure,
 *     nothing recorded unless both files read back; no secret printed
 *   - the function: off without the switch; GET and HEAD only; the one path
 *     shape and nothing else; the bytes, with exactly the headers a store's
 *     page needs; a plain 404 nothing caches; 503 and one fixed line when the
 *     store does not answer; it reads the method and the address alone, and
 *     never writes, lists or deletes
 *   - the check: every row against git, the store and, with --site, the
 *     function's own replies; each kind of mismatch found; it writes nothing
 *   - nothing built is left in the repo, so test/match-test.js's one copy of
 *     the maths holds with no path exempted; no effect wording in any of it;
 *     the integration guide names every attribute, event, storage key and
 *     header it should
 */

const { execFileSync, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify/functions/lib');
const FUNCTION = path.join(ROOT, 'netlify/functions/b2b-release.js');

for (const k of ['B2B_ENABLED', 'NETLIFY_SITE_ID', 'NETLIFY_AUTH_TOKEN']) delete process.env[k];

let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) {
    process.stderr.write('b2b-release: stopped before the last check - NOT clean\n');
    process.exitCode = 1;
  }
});

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual).slice(0, 700)}\n        want ${JSON.stringify(expected).slice(0, 700)}`}`);
}
const codeOf = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* --- Netlify Blobs, as @netlify/blobs 10.x answers ------------------------ */

/* set(): onlyIfNew on a key that exists is { modified: false }; any other
   write { modified: true, etag } - or, as a 401 or 503 answers a conditional
   write, { modified: true } with an empty ETag. get(): null when missing, an
   ArrayBuffer for type 'arrayBuffer'. list(): { blobs: [{ key, etag }] }.
   Every call is recorded. */
const blobs = { stores: new Map(), opened: [], calls: [], fail: null, noEtag: false, corruptRead: false, hang: false };
function storeNamed(name) {
  if (!blobs.stores.has(name)) blobs.stores.set(name, new Map());
  const m = blobs.stores.get(name);
  const failIf = op => {
    if (blobs.fail === op || blobs.fail === 'all') throw new Error('Netlify Blobs has generated an internal error (503 Service Unavailable)');
    if (blobs.fail === '401') throw new Error('Netlify Blobs has generated an internal error (401 Unauthorized)');
  };
  return {
    async set(key, data, opts = {}) {
      blobs.calls.push(['set', name, key, Object.keys(opts).sort().join(',')]);
      failIf('set');
      if (!(data instanceof ArrayBuffer) && typeof data !== 'string') throw new TypeError('BlobInput is a string, an ArrayBuffer or a Blob');
      if (opts.onlyIfNew && m.has(key)) return { modified: false };
      if (blobs.noEtag) return { etag: '', modified: true };
      const etag = `"${crypto.randomBytes(8).toString('hex')}"`;
      m.set(key, { bytes: Buffer.from(typeof data === 'string' ? data : new Uint8Array(data)), etag });
      return { etag, modified: true };
    },
    async get(key, opts = {}) {
      blobs.calls.push(['get', name, key, opts.type || 'text']);
      if (blobs.hang) return new Promise(() => {});
      failIf('get');
      if (!m.has(key)) return null;
      let bytes = m.get(key).bytes;
      if (blobs.corruptRead) bytes = Buffer.concat([bytes, Buffer.from(' ')]);
      if (opts.type === 'arrayBuffer') return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return bytes.toString('utf8');
    },
    async list(opts = {}) {
      blobs.calls.push(['list', name, opts.prefix || '']);
      failIf('list');
      return { blobs: [...m.keys()].sort().map(key => ({ key, etag: m.get(key).etag })), directories: [] };
    },
    async delete(key) { blobs.calls.push(['delete', name, key]); m.delete(key); }
  };
}
const fakeBlobs = {
  getStore(opts) {
    const o = typeof opts === 'string' ? { name: opts } : { ...opts };
    blobs.opened.push(o);
    return storeNamed(o.name);
  },
  getDeployStore() { blobs.calls.push(['getDeployStore']); throw new Error('a deploy store'); },
  connectLambda() { blobs.calls.push(['connectLambda']); }
};
const FAKE_BLOBS = path.join(ROOT, 'test', '.b2b-release-test-blobs.js');
{
  const m = new Module(FAKE_BLOBS, module);
  m.filename = FAKE_BLOBS; m.loaded = true; m.exports = fakeBlobs;
  require.cache[FAKE_BLOBS] = m;
}
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === '@netlify/blobs' ? FAKE_BLOBS : resolve.call(this, request, ...rest);
};
const held = () => blobs.stores.get('b2b-releases') || new Map();
/* Exactly a Buffer's bytes as an ArrayBuffer - never the pool a small Buffer shares. */
const ab = b => { const x = Buffer.from(b); return x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength); };
const resetBlobs = () => { blobs.stores.clear(); blobs.opened.length = 0; blobs.calls.length = 0; blobs.fail = null; blobs.noEtag = false; blobs.corruptRead = false; blobs.hang = false; };

const releases = require(path.join(LIB, 'b2b-releases.js'));
const rel = require(path.join(ROOT, 'scripts/b2b-release.js'));
const check2 = require(path.join(ROOT, 'scripts/b2b-release-check.js'));
const version = require(path.join(LIB, 'version.js'));
const { effectWords } = require(path.join(ROOT, 'test/b2b-strings-test.js'));

/* --- a throwaway git world ------------------------------------------------ */

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'b2b-release-test-'));
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
const sh = (cwd, ...args) => execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...args],
  { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/* The files a release is built from, as this tree holds them after the build. */
function builtName(dir, stem, ext) {
  const found = fs.readdirSync(path.join(ROOT, dir)).filter(f => new RegExp(`^${stem}\\.[0-9a-f]{8}\\.${ext}$`).test(f));
  if (found.length !== 1) { console.error(`FAIL: expected one built ${dir}/${stem}.<hash>.${ext} - run: bash build.sh`); process.exit(1); }
  return `${dir}/${found[0]}`;
}
const FILES = [...rel.PARTS.map(p => builtName('js', p, 'js')), builtName('css', rel.STYLESHEET, 'css')];
const RECORD_HEAD = (() => {
  const t = fs.readFileSync(path.join(ROOT, rel.DOC), 'utf8');
  const lines = t.split('\n');
  return lines.slice(0, lines.indexOf(rel.DOC_RULE) + 1).join('\n') + '\n';
})();

let worlds = 0;
function world() {
  const dir = path.join(TMP, `w${++worlds}`);
  fs.mkdirSync(dir);
  sh(dir, 'init', '-q', '--bare', 'origin.git');
  sh(dir, 'clone', '-q', 'origin.git', 'work');
  const work = path.join(dir, 'work');
  for (const f of FILES) {
    fs.mkdirSync(path.dirname(path.join(work, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(work, f));
  }
  fs.mkdirSync(path.join(work, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(work, rel.DOC), RECORD_HEAD);
  sh(work, 'add', '-A');
  sh(work, 'commit', '-q', '-m', 'the widget');
  sh(work, 'push', '-q', 'origin', 'main');
  return { dir, work, origin: path.join(dir, 'origin.git') };
}
const commitAll = (work, msg) => { sh(work, 'add', '-A'); sh(work, 'commit', '-q', '-m', msg); return sh(work, 'rev-parse', 'HEAD'); };
const push = work => sh(work, 'push', '-q', 'origin', 'main');
/* One change to a widget file that keeps it as build.sh would leave it: its
   name follows its new hash. */
function touchWidget(work, note) {
  const old = FILES.find(f => f.includes('b2b-widget') && f.endsWith('.js'));
  const cur = fs.readdirSync(path.join(work, 'js')).find(f => /^b2b-widget\.[0-9a-f]{8}\.js$/.test(f));
  const text = fs.readFileSync(path.join(work, 'js', cur), 'utf8').replace('Aroma and flavour only.', `Aroma and flavour only. ${note}`);
  const name = `js/b2b-widget.${crypto.createHash('sha256').update(text).digest('hex').slice(0, 8)}.js`;
  fs.rmSync(path.join(work, 'js', cur));
  fs.writeFileSync(path.join(work, name), text);
  return { old, name };
}

const SECRETS = { NETLIFY_SITE_ID: 'site-0000', NETLIFY_AUTH_TOKEN: 'not-a-real-token-for-this-test' };
async function run(script, argv, { root, env = {}, fetchImpl } = {}) {
  const out = [], err = [];
  const code = await script.main(argv, { root, env, out: l => out.push(l), err: l => err.push(l), fetchImpl });
  return { code, out, err, all: [...out, ...err].join('\n') };
}
const releaseRun = (argv, opts) => run(rel, argv, opts);
const checkRun = (argv, opts) => run(check2, argv, opts);
const record = work => fs.readFileSync(path.join(work, rel.DOC), 'utf8');

/* --- the function, loaded as Netlify's bundler compiles it ----------------- */

async function loadFunction() {
  const url = pathToFileURL(FUNCTION).href;
  Module.register('data:text/javascript,' + encodeURIComponent(`
    const URL_ = ${JSON.stringify(url)};
    export async function load(url, context, next) {
      if (url === URL_) {
        const r = await next(url, { ...context, format: 'module' });
        return { ...r, format: 'module', shortCircuit: true };
      }
      return next(url, context);
    }`));
  return import(url);
}
const PROD = { parserVersion: 'abc1234', extractorVersion: 'abc123456789', deployContext: 'production' };
const ON = () => { process.env.B2B_ENABLED = '1'; version.pin(PROD); };
const CONSOLE = ['log', 'info', 'warn', 'error', 'debug'];
async function quietly(fn) {
  const lines = [];
  const saved = CONSOLE.map(k => console[k]);
  CONSOLE.forEach(k => { console[k] = (...a) => lines.push(`${k}: ${a.map(String).join(' ')}`); });
  try { return { value: await fn(), lines }; } finally { CONSOLE.forEach((k, i) => { console[k] = saved[i]; }); }
}
/* A Request whose every property read is recorded. */
function watched(url, init) {
  const req = new Request(url, init);
  const reads = new Set();
  return { reads, req: new Proxy(req, { get: (t, k) => { reads.add(String(k)); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } }) };
}

async function main() {
  const status0 = sh(ROOT, 'status', '--porcelain', '--untracked-files=all');

  /* ===================================================== the builder */
  const A = world();
  const C1 = sh(A.work, 'rev-parse', 'HEAD');
  const r1 = rel.build({ version: 1, source: rel.commitSource(C1, A.work) });
  const r1b = rel.build({ version: '1', source: rel.commitSource(C1, A.work) });
  sh(A.dir, 'clone', '-q', 'origin.git', 'other');
  const r1c = rel.build({ version: 1, source: rel.commitSource(C1, path.join(A.dir, 'other')) });
  const r1s = rel.build({ version: 1, source: rel.commitSource(C1.slice(0, 7), A.work) });
  check('...and a commit named by its short hash builds the same bytes, its header naming the full one',
    [r1s.js.equals(r1.js), r1s.commit], [true, C1]);
  const elsewhere = spawnSync(process.execPath, ['-e', `
    const rel = require(${JSON.stringify(path.join(ROOT, 'scripts/b2b-release.js'))});
    const r = rel.build({ version: 1, source: rel.commitSource(${JSON.stringify(C1)}, ${JSON.stringify(A.work)}) });
    process.stdout.write(JSON.stringify([r.sri.js, r.sri.css, r.js.length]));`],
    { env: { ...process.env, TZ: 'Pacific/Kiritimati', LANG: 'tr_TR.UTF-8', LC_ALL: 'tr_TR.UTF-8', FAKETIME: '2031-01-01' }, encoding: 'utf8' });
  check('same inputs, same bytes: one commit and version built twice, from two clones, and in another process with another zone and locale',
    [r1.js.equals(r1b.js) && r1.css.equals(r1b.css), r1.js.equals(r1c.js) && r1.css.equals(r1c.css), elsewhere.stdout],
    [true, true, JSON.stringify([r1.sri.js, r1.sri.css, r1.js.length])]);
  check('...and the sha384 values are the bytes\' own, as an integrity attribute writes them',
    [r1.sri.js, r1.sri.css], [`sha384-${crypto.createHash('sha384').update(r1.js).digest('base64')}`, `sha384-${crypto.createHash('sha384').update(r1.css).digest('base64')}`]);

  const fileAt = f => execFileSync('git', ['show', `${C1}:${f}`], { cwd: A.work });
  check('nose-matches.css is css/b2b-widget at that commit, byte for byte', r1.css.equals(fileAt(FILES[5])), true);
  const text = r1.js.toString('utf8');
  const markers = [...text.matchAll(/^\/\* ---- (js\/[^ ]+) ---- \*\/$/gm)];
  check('nose-matches.js holds the five files, in that order: match-math, b2b-rank, aroma-bar, b2b-strings, b2b-widget',
    [markers.map(m => m[1]), r1.parts], [FILES.slice(0, 5), FILES.slice(0, 5)]);
  const pieces = markers.map((m, i) => text.slice(m.index + m[0].length + 1, i + 1 < markers.length ? markers[i + 1].index : text.length));
  check('...the first four verbatim, byte for byte',
    pieces.slice(0, 4).map((p, i) => Buffer.from(p, 'utf8').equals(fileAt(FILES[i]))), [true, true, true, true]);
  const widgetAt = fileAt(FILES[4]).toString('utf8');
  const lineDiff = (a, b) => { const x = a.split('\n'), y = b.split('\n'); return x.length === y.length ? x.map((l, i) => (l === y[i] ? null : [l, y[i]])).filter(Boolean) : 'line count'; };
  check('...and the widget verbatim but for its two stylesheet lines: this release\'s own stylesheet, and its sha384',
    lineDiff(widgetAt, pieces[4]), [
      [`  const STYLESHEET = '/${FILES[5]}';`, "  const STYLESHEET = '/b2b/releases/1/nose-matches.css';"],
      ['  const STYLESHEET_INTEGRITY = null;', `  const STYLESHEET_INTEGRITY = '${r1.sri.css}';`]]);
  const head = text.slice(0, markers[0].index);
  check('...after a header naming the release, the commit and the five files, and nothing else before them',
    [head.startsWith('/* NOSE <nose-matches>, pinned release 1, built by scripts/b2b-release.js\n'), head.includes(`commit ${C1}`),
     FILES.slice(0, 6).every(f => head.includes(f)), head.endsWith('Aroma and flavour only. */\n'), /\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}/.test(head)],
    [true, true, true, true, false]);
  const r2 = rel.build({ version: 2, source: rel.commitSource(C1, A.work) });
  check('another version of the same commit: the same stylesheet and hash, the widget naming release 2\'s',
    [r2.css.equals(r1.css), r2.sri.css === r1.sri.css, r2.js.toString().includes("const STYLESHEET = '/b2b/releases/2/nose-matches.css';"), r2.sri.js !== r1.sri.js],
    [true, true, true, true]);

  /* As a page runs it: a classic script, no module, its own origin read from
     document.currentScript. */
  {
    const defined = new Map();
    class HTMLElement {}
    const win = { HTMLElement, customElements: { get: n => defined.get(n), define: (n, c) => defined.set(n, c) }, console, queueMicrotask, URL };
    win.self = win; win.window = win;
    win.document = { currentScript: { src: 'https://nose-app.com/b2b/releases/1/nose-matches.js' }, createElement: () => ({}) };
    const ctx = vm.createContext(win);
    let threw = null;
    try { vm.runInContext(text, ctx, { filename: 'nose-matches.js' }); } catch (e) { threw = e.message; }
    check('the bundle runs as a page runs it - NoseMatch, NoseRank, NoseBar and NoseStrings set, <nose-matches> defined',
      [threw, ['NoseMatch', 'NoseRank', 'NoseBar', 'NoseStrings'].map(k => typeof win[k]), typeof defined.get('nose-matches')],
      [null, ['object', 'object', 'object', 'object'], 'function']);
    const ranked = vm.runInContext('typeof self.NoseRank.rank', ctx);
    check('...the engine reading its maths from the bundle\'s own NoseMatch', ranked, 'function');
  }

  /* ===================================================== the refusals */
  resetBlobs();
  const quietStore = () => blobs.calls.length === 0 && blobs.opened.length === 0;
  {
    const W = world();
    const before = record(W.work);
    const cases = [];
    fs.appendFileSync(path.join(W.work, FILES[0]), '\n');
    cases.push(['a change not staged', await releaseRun([], { root: W.work, env: SECRETS })]);
    sh(W.work, 'add', FILES[0]);
    cases.push(['a change staged', await releaseRun([], { root: W.work, env: SECRETS })]);
    sh(W.work, 'reset', '-q', '--hard');
    fs.writeFileSync(path.join(W.work, 'notes.txt'), 'x');
    cases.push(['an untracked file', await releaseRun(['--dry-run'], { root: W.work, env: SECRETS })]);
    fs.rmSync(path.join(W.work, 'notes.txt'));
    check('a working tree with any change - unstaged, staged or untracked - is refused, naming the files, dry run or not',
      cases.map(([w, r]) => [w, r.code, /REFUSED - the working tree has changes/.test(r.all), r.all.includes(w === 'an untracked file' ? 'notes.txt' : FILES[0])]),
      cases.map(([w]) => [w, 1, true, true]));
    touchWidget(W.work, 'local');
    commitAll(W.work, 'not pushed');
    const notPushed = await releaseRun(['--dry-run'], { root: W.work, env: SECRETS });
    check('a commit not on origin/main is refused, after fetching origin', [notPushed.code, /REFUSED - commit [0-9a-f]{7} is not on origin\/main - push it first/.test(notPushed.all)], [1, true]);
    sh(W.work, 'remote', 'set-url', 'origin', path.join(W.dir, 'nowhere.git'));
    const offline = await releaseRun([], { root: W.work, env: SECRETS });
    check('...and so is any run while origin cannot be reached', [offline.code, /REFUSED - could not fetch origin main/.test(offline.all)], [1, true]);
    sh(W.work, 'remote', 'set-url', 'origin', W.origin);
    check('...each changing nothing: no store opened, the record as it was', [quietStore(), record(W.work) === before], [true, true]);
    const usage = await releaseRun(['--force'], { root: W.work, env: SECRETS });
    check('an unknown argument is a usage error', [usage.code, usage.err], [2, ['usage: node scripts/b2b-release.js [--dry-run]']]);
  }
  {
    const W = world();
    const bad = [
      ['an unbuilt js/b2b-widget.js beside the built one', w => fs.writeFileSync(path.join(w, 'js/b2b-widget.js'), fs.readFileSync(path.join(w, FILES[4]))), /an unbuilt js\/b2b-widget\.js/],
      ['a built file whose name is not its hash', w => fs.appendFileSync(path.join(w, FILES[1]), '// edited\n'), /js\/b2b-rank\.[0-9a-f]{8}\.js at|is not the file build\.sh names so/],
      ['a widget naming another stylesheet', w => { const t = touchWidget(w, 'x'); const s = fs.readFileSync(path.join(w, t.name), 'utf8').replace(/b2b-widget\.[0-9a-f]{8}\.css/, 'b2b-widget.00000000.css'); fs.rmSync(path.join(w, t.name)); fs.writeFileSync(path.join(w, `js/b2b-widget.${crypto.createHash('sha256').update(s).digest('hex').slice(0, 8)}.js`), s); }, /names \/css\/b2b-widget\.00000000\.css, not the stylesheet beside it/],
      ['a widget without its STYLESHEET_INTEGRITY line', w => { const t = touchWidget(w, 'y'); const s = fs.readFileSync(path.join(w, t.name), 'utf8').replace('  const STYLESHEET_INTEGRITY = null;\n', ''); fs.rmSync(path.join(w, t.name)); fs.writeFileSync(path.join(w, `js/b2b-widget.${crypto.createHash('sha256').update(s).digest('hex').slice(0, 8)}.js`), s); }, /STYLESHEET_INTEGRITY line exactly once/],
      ['a file not ending its last statement', w => { const p = path.join(w, FILES[2]); const s = fs.readFileSync(p, 'utf8').replace(/;\n$/, '\n'); fs.rmSync(p); fs.writeFileSync(path.join(w, `js/aroma-bar.${crypto.createHash('sha256').update(s).digest('hex').slice(0, 8)}.js`), s); }, /does not end its last statement/]
    ];
    const got = [];
    const base = sh(W.work, 'rev-parse', 'HEAD');
    for (const [what, make, says] of bad) {
      sh(W.work, 'reset', '-q', '--hard', base);
      make(W.work);
      commitAll(W.work, what);
      sh(W.work, 'push', '-q', '--force', 'origin', 'main');
      const r = await releaseRun(['--dry-run'], { root: W.work });
      got.push([what, r.code, says.test(r.all)]);
    }
    check('a commit whose files are not as build.sh leaves them is refused, each in its own words',
      got, bad.map(([what]) => [what, 1, true]));
  }
  {
    const W = world();
    fs.writeFileSync(path.join(W.work, rel.DOC), `${RECORD_HEAD}| 2 | ${'a'.repeat(40)} | sha384-${'A'.repeat(64)} | sha384-${'B'.repeat(64)} |\n`);
    commitAll(W.work, 'a gap'); push(W.work);
    const gap = await releaseRun(['--dry-run'], { root: W.work });
    fs.writeFileSync(path.join(W.work, rel.DOC), `${RECORD_HEAD}| 1 | ${'a'.repeat(40)} | sha384-short | sha384-${'B'.repeat(64)} |\n`);
    commitAll(W.work, 'a bad row'); push(W.work);
    const badRow = await releaseRun(['--dry-run'], { root: W.work });
    fs.writeFileSync(path.join(W.work, rel.DOC), RECORD_HEAD.replace('| version |', '| release |'));
    commitAll(W.work, 'no table'); push(W.work);
    const noTable = await releaseRun(['--dry-run'], { root: W.work });
    fs.rmSync(path.join(W.work, rel.DOC));
    commitAll(W.work, 'no record'); push(W.work);
    const none = await releaseRun(['--dry-run'], { root: W.work });
    check('a record it cannot read is refused: a gap in the versions, a row out of shape, no table, no file',
      [gap, badRow, noTable, none].map(r => [r.code, /REFUSED - docs\/B2B-RELEASES\.md/.test(r.all)]), [[1, true], [1, true], [1, true], [1, true]]);
  }

  /* ===================================================== publishing */
  resetBlobs();
  const P = world();
  const P1 = sh(P.work, 'rev-parse', 'HEAD');
  {
    const dry = await releaseRun(['--dry-run'], { root: P.work });
    const want = rel.build({ version: 1, source: rel.commitSource(P1, P.work) });
    check('--dry-run: release 1 of the pushed commit, both files and their sha384, nothing uploaded and nothing written, no secret needed',
      [dry.code, dry.out[0], dry.out.some(l => l.includes(want.sri.js)), dry.out.some(l => l.includes(want.sri.css)),
       dry.out[dry.out.length - 1], quietStore(), record(P.work) === RECORD_HEAD],
      [0, `b2b-release: release 1, from commit ${P1} (on origin/main)`, true, true, 'b2b-release: dry run - nothing uploaded, nothing written', true, true]);
    const noSecrets = await releaseRun([], { root: P.work });
    check('publishing without NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN is refused, nothing uploaded',
      [noSecrets.code, /REFUSED - publishing needs NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN/.test(noSecrets.all), quietStore()], [1, true, true]);

    const pub = await releaseRun([], { root: P.work, env: SECRETS });
    check('published: exit 0, "release 1 published"', [pub.code, pub.out.includes('b2b-release: release 1 published')], [0, true]);
    check('...the store opened as b2b-releases, site-wide, by site and token, strongly consistent - never a deploy store',
      [blobs.opened, blobs.calls.some(c => c[0] === 'getDeployStore')],
      [[{ name: 'b2b-releases', siteID: SECRETS.NETLIFY_SITE_ID, token: SECRETS.NETLIFY_AUTH_TOKEN, consistency: 'strong' }], false]);
    check('...the stylesheet written first, then the script, each only if new; then both read back; nothing listed or deleted',
      blobs.calls.map(c => c.slice(0, 4)),
      [['set', 'b2b-releases', '1/nose-matches.css', 'onlyIfNew'], ['set', 'b2b-releases', '1/nose-matches.js', 'onlyIfNew'],
       ['get', 'b2b-releases', '1/nose-matches.css', 'arrayBuffer'], ['get', 'b2b-releases', '1/nose-matches.js', 'arrayBuffer']]);
    check('...the store holds exactly the built bytes, under <version>/<file>',
      [[...held().keys()].sort(), held().get('1/nose-matches.js').bytes.equals(want.js), held().get('1/nose-matches.css').bytes.equals(want.css)],
      [['1/nose-matches.css', '1/nose-matches.js'], true, true]);
    check('...and only then the record gains one row: version, commit, the two sha384 values',
      record(P.work), `${RECORD_HEAD}| 1 | ${P1} | ${want.sri.js} | ${want.sri.css} |\n`);
    check('...which reads back as release 1', rel.readRecord(P.work), [{ version: '1', commit: P1, js: want.sri.js, css: want.sri.css }]);
    check('...and it prints the tag a store\'s page carries, and the commands that come next - and no secret',
      [pub.out.includes(`          integrity="${want.sri.js}"`), pub.out.includes('  <script src="https://nose-app.com/b2b/releases/1/nose-matches.js"'),
       pub.out.some(l => l.includes('git add docs/B2B-RELEASES.md && git commit')), pub.out.includes('  node scripts/b2b-release-check.js'),
       pub.all.includes(SECRETS.NETLIFY_AUTH_TOKEN) || pub.all.includes(SECRETS.NETLIFY_SITE_ID)],
      [true, true, true, true, false]);
    const dirtyAfter = await releaseRun(['--dry-run'], { root: P.work });
    check('the record not yet committed: the next run is refused, as a change in the tree', [dirtyAfter.code, /working tree has changes[\s\S]*docs\/B2B-RELEASES\.md/.test(dirtyAfter.all)], [1, true]);
    commitAll(P.work, 'b2b: release 1'); push(P.work);
    blobs.calls.length = 0; blobs.opened.length = 0;
    const unchanged = await releaseRun([], { root: P.work, env: SECRETS });
    check('the record\'s own commit holds release 1\'s widget files, byte for byte: refused, nothing new to release, the store untouched',
      [unchanged.code, unchanged.all.includes(`REFUSED - the widget's files at ${sh(P.work, 'rev-parse', '--short=7', 'HEAD')} are release 1's (commit ${P1.slice(0, 7)}), byte for byte - nothing new to release`),
       blobs.calls.length, rel.readRecord(P.work).length], [1, true, 0, 1]);
    const t = touchWidget(P.work, 'Second.');
    const P2 = commitAll(P.work, 'the widget, changed'); push(P.work);
    const second = await releaseRun([], { root: P.work, env: SECRETS });
    const want2 = rel.build({ version: 2, source: rel.commitSource(P2, P.work) });
    check('a changed widget: release 2, beside release 1, which is untouched - and its row under release 1\'s',
      [second.code, [...held().keys()].sort(), held().get('1/nose-matches.js').bytes.equals(want.js), held().get('2/nose-matches.js').bytes.equals(want2.js),
       rel.readRecord(P.work).map(r => [r.version, r.commit]), want2.parts.includes(t.name)],
      [0, ['1/nose-matches.css', '1/nose-matches.js', '2/nose-matches.css', '2/nose-matches.js'], true, true, [['1', P1], ['2', P2]], true]);
    commitAll(P.work, 'b2b: release 2'); push(P.work);
    /* Another clone moves origin/main on; this checkout is then behind it. */
    sh(P.dir, 'clone', '-q', 'origin.git', 'ahead');
    const ahead = path.join(P.dir, 'ahead');
    touchWidget(ahead, 'Third.');
    commitAll(ahead, 'pushed from elsewhere'); push(ahead);
    blobs.calls.length = 0;
    const behind = await releaseRun([], { root: P.work, env: SECRETS });
    check('a checkout behind origin/main is refused - pull first - so a release is of the newest commit and its row goes on the newest record',
      [behind.code, /REFUSED - origin\/main has commits this checkout does not - git pull first/.test(behind.all), blobs.calls.length], [1, true, 0]);
  }
  {
    /* Never overwriting; going on after a stop; a write without an ETag; a read-back that differs. */
    const W = world();
    const C = sh(W.work, 'rev-parse', 'HEAD');
    const want = rel.build({ version: 1, source: rel.commitSource(C, W.work) });
    resetBlobs();
    await storeNamed('b2b-releases').set('1/nose-matches.css', ab('/* someone else\'s */\n'), {});
    blobs.calls.length = 0;
    const clash = await releaseRun([], { root: W.work, env: SECRETS });
    check('a version whose stylesheet the store already holds, with other bytes: refused, nothing overwritten, no script written, no row',
      [clash.code, /REFUSED - release 1's nose-matches\.css is already in the store, with other bytes - nothing was overwritten/.test(clash.all),
       held().get('1/nose-matches.css').bytes.toString(), held().has('1/nose-matches.js'), record(W.work) === RECORD_HEAD],
      [1, true, '/* someone else\'s */\n', false, true]);
    resetBlobs();
    await storeNamed('b2b-releases').set('1/nose-matches.css', ab(want.css), { onlyIfNew: true });
    const resume = await releaseRun([], { root: W.work, env: SECRETS });
    check('a run that stopped after the stylesheet: the same bytes found, it goes on, the script written, the row recorded',
      [resume.code, resume.out.some(l => /nose-matches\.css is already there, byte for byte/.test(l)), held().get('1/nose-matches.js').bytes.equals(want.js),
       rel.readRecord(W.work).length],
      [0, true, true, 1]);
    fs.writeFileSync(path.join(W.work, rel.DOC), RECORD_HEAD);
    resetBlobs();
    blobs.noEtag = true;
    const noEtag = await releaseRun([], { root: W.work, env: SECRETS });
    check('a write answered without an ETag counts as failed: exit 1, nothing recorded, the same command again goes on',
      [noEtag.code, /FAILED - b2b-releases: Netlify Blobs did not confirm the write \(no ETag\)/.test(noEtag.all), record(W.work) === RECORD_HEAD,
       /the same command again goes on/.test(noEtag.all)], [1, true, true, true]);
    resetBlobs();
    blobs.corruptRead = true;
    const corrupt = await releaseRun([], { root: W.work, env: SECRETS });
    check('a file that does not read back as written: exit 1, nothing recorded',
      [corrupt.code, /did not read back as written - nothing recorded/.test(corrupt.all), record(W.work) === RECORD_HEAD], [1, true, true]);
    resetBlobs();
    blobs.fail = '401';
    const refused = await releaseRun([], { root: W.work, env: SECRETS });
    check('Netlify refusing the token: said plainly, nothing recorded, no secret printed',
      [refused.code, /Netlify refused the token .*update NETLIFY_AUTH_TOKEN/.test(refused.all), record(W.work) === RECORD_HEAD, refused.all.includes(SECRETS.NETLIFY_AUTH_TOKEN)],
      [1, true, true, false]);
  }

  /* ===================================================== the function */
  resetBlobs();
  const { default: handler, config } = await loadFunction();
  const fnCode = codeOf(fs.readFileSync(FUNCTION, 'utf8'));
  check('the function: a default export taking a Request, and config.path alone beside it - /b2b/releases/:version/:file',
    [(fnCode.match(/^export /gm) || []).length, /^export default async \(request\) => \{$/m.test(fnCode), config],
    [2, true, { path: '/b2b/releases/:version/:file' }]);
  check('...which is where lib/b2b-releases.js says a release is served', releases.releasePath(7, releases.JS).replace(/^\/b2b\/releases\/7\//, '/b2b/releases/:version/').replace('nose-matches.js', ':file'), config.path);
  check('...it asks the switch first, before the method or the path',
    fnCode.split('\n')[fnCode.split('\n').findIndex(l => l.startsWith('export default')) + 1].trim(), 'if (!flag.b2bEnabled()) return notFound();');
  check('...it imports the switch and the release store, whole, and nothing else',
    fnCode.match(/^import .*$/gm), ["import flag from './lib/b2b-flag.js';", "import releases from './lib/b2b-releases.js';"]);
  check('...and holds no clock, no request header, no write: nothing about the caller, nothing changed',
    /Date\.now|new Date|headers\.get|\.set\(|\.setJSON\(|\.delete\(|\.list\(|getDeployStore|connectLambda/.test(fnCode), false);

  const STORED = { js: r1.js, css: r1.css };
  const seed = async () => {
    resetBlobs();
    const s = storeNamed('b2b-releases');
    await s.set('1/nose-matches.js', ab(STORED.js), {});
    await s.set('1/nose-matches.css', ab(STORED.css), {});
    blobs.calls.length = 0;
  };
  const NOSE = 'https://nose-app.com';
  const ask = async (p, init) => quietly(async () => { const r = await handler(new Request(`${NOSE}${p}`, init)); return { r, body: Buffer.from(await r.arrayBuffer()) }; });
  const headersOf = r => Object.fromEntries([...r.headers.entries()].sort());

  await seed();
  delete process.env.B2B_ENABLED; version.pin(PROD);
  const off1 = await ask('/b2b/releases/1/nose-matches.js');
  process.env.B2B_ENABLED = '1'; version.pin({ ...PROD, deployContext: 'deploy-preview' });
  const off2 = await ask('/b2b/releases/1/nose-matches.js');
  process.env.B2B_ENABLED = 'true'; version.pin(PROD);
  const off3 = await ask('/b2b/releases/1/nose-matches.js', { method: 'POST', body: 'x' });
  check('off - no B2B_ENABLED, a deploy preview with it, or B2B_ENABLED=true: the same plain 404, nothing cached, the store never opened',
    [off1, off2, off3].map(({ value: { r, body } }) => [r.status, body.toString(), r.headers.get('cache-control')]).concat([[blobs.calls.length, blobs.opened.length]]),
    [[404, 'Not Found', 'no-store'], [404, 'Not Found', 'no-store'], [404, 'Not Found', 'no-store'], [0, 0]]);

  ON();
  const js = await ask('/b2b/releases/1/nose-matches.js');
  check('on: GET the script - 200, the stored bytes exactly', [js.value.r.status, js.value.body.equals(STORED.js)], [200, true]);
  check('...with exactly the headers a store\'s page needs, and no others',
    headersOf(js.value.r), {
      'access-control-allow-origin': '*', 'cache-control': 'public, max-age=31536000, immutable', 'content-type': 'text/javascript; charset=utf-8',
      'cross-origin-resource-policy': 'cross-origin', 'x-content-type-options': 'nosniff' });
  const css = await ask('/b2b/releases/1/nose-matches.css');
  check('...the stylesheet the same way, as text/css', [css.value.r.status, css.value.body.equals(STORED.css), css.value.r.headers.get('content-type')], [200, true, 'text/css; charset=utf-8']);
  const headReq = await ask('/b2b/releases/1/nose-matches.js', { method: 'HEAD' });
  check('...HEAD: the same status and headers, no body', [headReq.value.r.status, headReq.value.body.length, headReq.value.r.headers.get('cache-control')], [200, 0, releases.CACHE]);
  check('...read with get(), as an ArrayBuffer, from the site-wide store Netlify hands the function - no site ID or token of its own',
    [blobs.opened.every(o => JSON.stringify(o) === '{"name":"b2b-releases"}'), blobs.calls.every(c => c[0] === 'get' && c[3] === 'arrayBuffer')], [true, true]);
  check('...and nothing logged on success', [js, css, headReq].map(x => x.lines), [[], [], []]);
  blobs.calls.length = 0;
  const methods = [];
  for (const m of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']) {
    const { value: { r } } = await ask('/b2b/releases/1/nose-matches.js', m === 'OPTIONS' || m === 'DELETE' ? { method: m } : { method: m, body: 'x' });
    methods.push([m, r.status, r.headers.get('allow')]);
  }
  check('any method but GET and HEAD: 405, Allow: GET, HEAD, the store never read',
    [methods, blobs.calls.length], [['POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'].map(m => [m, 405, 'GET, HEAD']), 0]);
  const paths = ['/b2b/releases/0/nose-matches.js', '/b2b/releases/01/nose-matches.js', '/b2b/releases/-1/nose-matches.js',
    '/b2b/releases/1234567/nose-matches.js', '/b2b/releases/latest/nose-matches.js', '/b2b/releases/1/nose-matches.min.js',
    '/b2b/releases/1/NOSE-MATCHES.JS', '/b2b/releases/1/../1/nose-matches.js', '/b2b/releases//1/nose-matches.js', '/b2b/releases/1/nose-matches.js/',
    '/b2b/releases/1/nose-matches.js?v=1', '/b2b/releases/1/nose-matches.js?', '/b2b/releases/1/%6Eose-matches.js', '/b2b/releases/1/'];
  const answers = [];
  for (const p of paths) { const { value: { r } } = await ask(p); answers.push([p, r.status, r.headers.get('cache-control')]); }
  check('any other path, or any query: a plain 404 that nothing caches, the store never read',
    [answers.filter(([p, s, c]) => !(s === 404 && c === 'no-store') && !(p === '/b2b/releases/1/../1/nose-matches.js' && s === 200)), blobs.calls.length],
    [[], answers.filter(([p, s]) => p === '/b2b/releases/1/../1/nose-matches.js' && s === 200).length]);
  blobs.calls.length = 0;
  const missing = await ask('/b2b/releases/2/nose-matches.js');
  check('a version the store does not hold: a plain 404, no-store - so a request before publishing is never cached as missing',
    [missing.value.r.status, missing.value.r.headers.get('cache-control'), missing.value.r.headers.get('access-control-allow-origin'), missing.lines], [404, 'no-store', null, []]);
  blobs.fail = 'get';
  const down = await ask('/b2b/releases/1/nose-matches.js');
  check('the store failing: 503, no-store, and one fixed line, naming no release',
    [down.value.r.status, down.value.r.headers.get('cache-control'), down.lines], [503, 'no-store', ['error: b2b-release: the release store did not answer - nothing served']]);
  blobs.fail = null; blobs.hang = true;
  const t0 = Date.now();
  const hung = await ask('/b2b/releases/1/nose-matches.css');
  check('the store hanging: the same 503 and line, within its 4 seconds',
    [hung.value.r.status, hung.lines.length, Date.now() - t0 < 6000], [503, 1, true]);
  blobs.hang = false;
  {
    const w = watched(`${NOSE}/b2b/releases/1/nose-matches.js`, { headers: { origin: 'https://shop.example', referer: 'https://shop.example/orders/12', cookie: 'a=b', 'user-agent': 'x' } });
    const { value } = await quietly(() => handler(w.req));
    check('it reads the method and the address alone - not a header, not the body', [value.status, [...w.reads].filter(k => !['method', 'url', 'then'].includes(k))], [200, []]);
  }
  check('...and in all of it the store was only read: no write, listing or delete', blobs.calls.filter(c => c[0] !== 'get'), []);

  /* ===================================================== the check */
  {
    const W = world();
    resetBlobs();
    const pub = await releaseRun([], { root: W.work, env: SECRETS });
    commitAll(W.work, 'b2b: release 1'); push(W.work);
    blobs.calls.length = 0;
    const ok = await checkRun([], { root: W.work, env: SECRETS });
    check('the check, after a release: every file matches, in git and in the store; exit 0',
      [pub.code, ok.code, ok.out[ok.out.length - 1], ok.out.some(l => /^ {2}release 1 {2}commit [0-9a-f]{7} {2}git ok {2}store ok$/.test(l))],
      [0, 0, 'b2b-release-check: every file of 1 release matches the record, in git and in the store', true]);
    check('...reading only: one listing, two downloads, nothing written', [blobs.calls.map(c => c[0]).sort(), sh(W.work, 'status', '--porcelain')],
      [['get', 'get', 'list'], '']);
    ON();
    const viaFunction = async (url, init) => handler(new Request(url, { method: 'GET' }));
    const site = await checkRun(['--site', 'https://nose-app.com'], { root: W.work, env: SECRETS, fetchImpl: viaFunction });
    check('--site, against the function\'s own replies: the bytes and the five headers - and in git, the store and on the site',
      [site.code, site.out[site.out.length - 1]], [0, 'b2b-release-check: every file of 1 release matches the record, in git, in the store and on the site']);
    delete process.env.B2B_ENABLED;
    const offSite = await checkRun(['--site', 'https://nose-app.com'], { root: W.work, env: SECRETS, fetchImpl: viaFunction });
    check('--site while B2B is off: each file not served, said as such, and a problem',
      [offSite.code, offSite.out.filter(l => /site: nose-matches\.(js|css): the site answers 404 - not served yet \(B2B is off until Prompt 8/.test(l)).length], [1, 2]);
    ON();
    const lying = async url => { const r = await handler(new Request(url)); const h = new Headers(r.headers); h.delete('access-control-allow-origin'); h.set('cache-control', 'public, max-age=60'); return new Response(await r.arrayBuffer(), { status: r.status, headers: h }); };
    const badHeaders = await checkRun(['--site', 'https://nose-app.com'], { root: W.work, env: SECRETS, fetchImpl: lying });
    check('--site, a reply without Access-Control-Allow-Origin or with a short cache: each named',
      [badHeaders.code, badHeaders.out.filter(l => /access-control-allow-origin is missing|cache-control is "public, max-age=60"/.test(l)).length], [1, 4]);
    const usage = [await checkRun(['--site'], { root: W.work, env: SECRETS }), await checkRun(['--site', 'nose-app.com'], { root: W.work, env: SECRETS }),
      await checkRun(['--site', 'https://nose-app.com/path'], { root: W.work, env: SECRETS }), await checkRun(['--verbose'], { root: W.work, env: SECRETS })];
    check('usage errors: --site with no origin, a bare host, a path; an unknown argument', usage.map(u => u.code), [2, 2, 2, 2]);
    const noSecrets = await checkRun([], { root: W.work, env: {} });
    check('without the Blobs secrets: refused, as it downloads every release', [noSecrets.code, /REFUSED - it downloads every release from Netlify Blobs/.test(noSecrets.all)], [1, true]);

    const realJs = held().get('1/nose-matches.js').bytes;
    held().get('1/nose-matches.js').bytes = Buffer.concat([realJs, Buffer.from('\n')]);
    const changed = await checkRun([], { root: W.work, env: SECRETS });
    held().get('1/nose-matches.js').bytes = realJs;
    check('a file changed in the store behind the record\'s back: found, by its hash', [changed.code, changed.out.some(l => /store: the store's nose-matches\.js is not the recorded file/.test(l))], [1, true]);
    await storeNamed('b2b-releases').set('9/nose-matches.js', ab('x'), {});
    await storeNamed('b2b-releases').set('notes.txt', 'x', {});
    const extra = await checkRun([], { root: W.work, env: SECRETS });
    held().delete('9/nose-matches.js'); held().delete('notes.txt');
    check('a release the record does not name, and a key that is no release file: both found',
      [extra.code, extra.out.some(l => /the store holds release 9 \(nose-matches\.js\), which docs\/B2B-RELEASES\.md does not record/.test(l)),
       extra.out.some(l => /the store holds "notes\.txt", which is not a release file/.test(l))], [1, true, true]);
    held().delete('1/nose-matches.css');
    const gone = await checkRun([], { root: W.work, env: SECRETS });
    held().set('1/nose-matches.css', { bytes: rel.build({ version: 1, source: rel.commitSource(rel.readRecord(W.work)[0].commit, W.work) }).css, etag: '"x"' });
    check('a file missing from the store: found', [gone.code, gone.out.some(l => /store: nose-matches\.css is missing from the store/.test(l))], [1, true]);
    const row = rel.readRecord(W.work)[0];
    fs.writeFileSync(path.join(W.work, rel.DOC), `${RECORD_HEAD}| 1 | ${row.commit} | sha384-${'A'.repeat(64)} | ${row.css} |\n`);
    commitAll(W.work, 'an edited row'); push(W.work);
    const edited = await checkRun([], { root: W.work, env: SECRETS });
    check('a row whose hash was edited: the commit builds other bytes, and the store holds other bytes - both found',
      [edited.code, edited.out.some(l => /git: commit [0-9a-f]{7} builds a nose-matches\.js other than the recorded one/.test(l)),
       edited.out.some(l => /store: the store's nose-matches\.js is not the recorded file/.test(l))], [1, true, true]);
    sh(W.work, 'reset', '-q', '--hard', 'HEAD~1');
    sh(W.work, 'push', '-q', '--force', 'origin', 'main');
    /* origin/main rewritten without the released commit. */
    const orphan = sh(W.work, 'rev-parse', 'HEAD');
    fs.writeFileSync(path.join(W.work, 'x.txt'), 'x');
    sh(W.work, 'checkout', '-q', '--orphan', 'fresh');
    sh(W.work, 'rm', '-q', '-rf', '--cached', '.');
    fs.writeFileSync(path.join(W.work, 'README'), 'rewritten\n');
    sh(W.work, 'add', 'README');
    sh(W.work, 'commit', '-q', '-m', 'rewritten');
    sh(W.work, 'push', '-q', '--force', 'origin', 'fresh:main');
    sh(W.work, 'checkout', '-q', '-f', orphan);
    sh(W.work, 'clean', '-q', '-fd');
    sh(W.work, 'fetch', '-q', 'origin');
    const offMain = await checkRun([], { root: W.work, env: SECRETS });
    check('a released commit no longer on origin/main: found', [offMain.code, offMain.out.some(l => /git: commit [0-9a-f]{7} is not on origin\/main/.test(l))], [1, true]);
    const empty = world();
    resetBlobs();
    const none = await checkRun([], { root: empty.work, env: SECRETS });
    check('no releases yet, and an empty store: said, exit 0', [none.code, none.out[none.out.length - 1]], [0, 'b2b-release-check: no releases yet, and the store holds none']);
  }

  /* ===================================================== the repo itself */
  check('this repo\'s record reads: versions 1, 2, 3 with no gap, each row in shape', Array.isArray(rel.readRecord(ROOT)), true);
  check('nothing built was left in the repo - test/match-test.js\'s one copy of the maths stands with no path exempted',
    sh(ROOT, 'status', '--porcelain', '--untracked-files=all'), status0);
  const words = ['scripts/b2b-release.js', 'scripts/b2b-release-check.js', 'netlify/functions/b2b-release.js', 'netlify/functions/lib/b2b-releases.js',
    'docs/B2B-INTEGRATION.md', 'docs/B2B-RELEASES.md'].map(f => [f, effectWords(fs.readFileSync(path.join(ROOT, f), 'utf8'))]);
  check('no effect wording in the release scripts, the function, its store module, the guide or the record - nor in the bundle\'s header',
    [words.filter(([, w]) => w.length), effectWords(head)], [[], []]);

  const guide = fs.readFileSync(path.join(ROOT, 'docs/B2B-INTEGRATION.md'), 'utf8');
  const widget = fs.readFileSync(path.join(ROOT, FILES[4]), 'utf8');
  const attrs = JSON.parse(widget.match(/return (\[[^\]]+\]);/)[1].replace(/'/g, '"'));
  const events = [...new Set([...widget.matchAll(/'(nose:[a-z-]+)'/g)].map(m => m[1]))].sort();
  const keys = [...widget.matchAll(/_KEY = '([a-z-]+)'/g)].map(m => m[1]);
  check(`the guide names every attribute the widget reads (${attrs.length}), every event it fires (${events.length}) and both lists it keeps`,
    [attrs.filter(a => !guide.includes(`\`${a}\``)), events.filter(e => !guide.includes(`\`${e}\``)), keys.filter(k => !guide.includes(`\`${k}\``)), events, keys],
    [[], [], [], ['nose:consent', 'nose:palate-removed', 'nose:palate-restored'], ['nose-matches-removed', 'nose-matches-voted']]);
  check('...the tag with integrity, crossorigin="anonymous" and no referrer, from a release URL, and the record for its values',
    [/<script src="https:\/\/nose-app\.com\/b2b\/releases\/1\/nose-matches\.js"\s+integrity="sha384-[^"]+"\s+crossorigin="anonymous" referrerpolicy="no-referrer" defer><\/script>/.test(guide),
     guide.includes('docs/B2B-RELEASES.md')], [true, true]);
  const S = require(path.join(ROOT, builtName('js', 'b2b-strings', 'js')));
  const flat = guide.replace(/\s+/g, ' ');
  check('...the consent button and sentence in the strings file\'s own words',
    [flat.includes(`"${S.default.consentButton}"`), flat.includes(`"${S.default.consentNote}"`)], [true, true]);
  const { COLUMNS } = require(path.join(LIB, 'b2b-catalog-format.js'));
  check('...the catalog\'s columns, the upload call with the secret key, and the CSP lines',
    [COLUMNS.filter(c => !guide.includes(`\`${c}\``)), /curl -sS -X POST https:\/\/nose-app\.com\/\.netlify\/functions\/b2b-catalog/.test(guide),
     guide.includes('-H "Authorization: Bearer $NOSE_SECRET_KEY"'), /^script-src +https:\/\/nose-app\.com\/b2b\/releases\/$/m.test(guide),
     /^style-src +https:\/\/nose-app\.com\/b2b\/releases\/$/m.test(guide),
     /^connect-src +https:\/\/nose-app\.com\/\.netlify\/functions\/b2b-feed https:\/\/nose-app\.com\/\.netlify\/functions\/b2b-vote$/m.test(guide)],
    [[], true, true, true, true, true]);
  check('...purchase days in UTC, purchases only after consent, the A/B group, routes - and no key written out',
    [/\*\*in UTC\*\*/.test(guide), /render `purchases` into the page \*\*only for a shopper who has said\s+yes\*\*/.test(guide), guide.includes('`group="control"`'),
     guide.includes('`["smoking","inhalation"]`'), /n[sp]k_[0-9a-f]{8,}/.test(guide)], [true, true, true, true, false]);

  fs.rmSync(TMP, { recursive: true, force: true });
  finished = true;
  if (failures) {
    console.error(`\nb2b-release-test: ${failures} failure${failures === 1 ? '' : 's'}`);
    process.exit(1);
  }
  console.log('\nb2b-release clean');
}

main().catch(e => { console.error('b2b-release-test threw:', e && e.stack ? e.stack : e); process.exit(1); });

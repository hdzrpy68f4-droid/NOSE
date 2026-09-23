#!/usr/bin/env node
'use strict';
/* scripts/check-trust.mjs - the build refuses the old storage promise.
 *
 *   node test/check-trust-test.js      expect: check-trust clean
 *
 * Each case builds a throwaway site with its own git repo and a copy of the
 * guard, so the guard runs exactly as build.sh runs it. What it pins down:
 *   - the promise fails wherever it is written: body text, a meta description,
 *     split by tags and a line break, by &nbsp; or a   escape, in either
 *     order, "nothing X, nothing Y", any capitalisation
 *   - "nothing stored" fails where a visitor can read it (a published page, a
 *     server reply) and not where only a maintainer can (docs, a comment)
 *   - the promise fails in a tracked file that is not published, and in a
 *     published file that is not tracked; a file that is neither is ignored
 *   - only FORCED 404s unpublish a path, as in check-published.js
 *   - a file named on the command line is checked; a missing one fails
 *   - the sentences the site says today pass
 *   - the real tree passes, and counts the same published files as
 *     check-published.js; the About page from before da5a6cf fails
 *
 * The promise is only ever assembled from separate words here, so this file
 * is tracked and scanned like any other without tripping the guard.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'scripts/check-trust.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nose-check-trust-'));

let passed = 0;
const failed = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed.push(`FAIL  ${name}\n      ${String(e && e.message).split('\n').join('\n      ')}`); }
}

/* The words, kept apart. */
const N = 'nothing', S = 'stored', O = 'or', D = 'sold';

const BLOCKS = [
  '/docs/*      /404.html  404!',
  '/scripts/*   /404.html  404!',
  '/netlify/*   /404.html  404!',
  ''
].join('\n');
const CLEAN_PAGE = '<!doctype html>\n<p>Lab reports are kept so batches can be compared over time.</p>\n';

const git = (dir, args) => execFileSync('git', ['-c', 'init.defaultBranch=main', ...args], { cwd: dir, stdio: 'ignore' });

function site({ files = {}, untracked = {}, redirects = BLOCKS } = {}) {
  const dir = fs.mkdtempSync(path.join(TMP, 'site-'));
  const put = (rel, body) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  };
  put('scripts/check-trust.mjs', fs.readFileSync(GUARD));
  put('_redirects', redirects);
  put('index.html', CLEAN_PAGE);
  for (const [f, body] of Object.entries(files)) put(f, body);
  git(dir, ['init', '-q']);
  git(dir, ['add', '-A']);
  for (const [f, body] of Object.entries(untracked)) put(f, body);
  return dir;
}

function run(dir, args = []) {
  const r = spawnSync(process.execPath, [path.join(dir, 'scripts/check-trust.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function fails(dir, args, ...expected) {
  const { code, out } = run(dir, args);
  assert.strictEqual(code, 1, `the guard passed:\n${out}`);
  for (const e of expected) assert.ok(out.includes(e), `expected "${e}" in:\n${out}`);
}

function passes(dir, args = []) {
  const { code, out } = run(dir, args);
  assert.strictEqual(code, 0, `the guard failed:\n${out}`);
  assert.match(out, /^==> no old storage promise \(/m);
}

const page = body => `<!doctype html>\n${body}\n`;

/* --- the promise, in the forms it could come back in ------------------------ */

test('a clean site passes, with internal notes and server comments saying "nothing stored"', () => {
  passes(site({ files: {
    'docs/notes.md': `A refused write: ${N} ${S}.\n`,
    'netlify/functions/f.js': `// a dev build: ${N} ${S}\n/* previews: ${N} is ${S} */\nexports.handler = () => 'ok';\n`
  } }));
});

test('the promise in a published page fails, naming file and line', () => {
  fails(site({ files: { 'index.html': page(`<p>Third-party lab data, ${N} ${S} ${O} ${D}.</p>`) } }), [],
    'index.html:2:', 'keep nothing, sell nothing', '(published)');
});

test('the promise in a meta description fails', () => {
  fails(site({ files: { 'about/index.html': page(`<meta name="description" content="${N} ${S} ${O} ${D}">`) } }), [],
    'about/index.html:2:', 'keep nothing, sell nothing');
});

test('split by tags and a line break, it fails at the line it starts on', () => {
  fails(site({ files: { 'index.html': `<!doctype html>\n<p>${N} <em>${S}</em>\n${O} ${D}</p>\n` } }), [],
    'index.html:2:');
});

test('split by &nbsp;, or by a \\u00a0 escape in a bundle, it fails', () => {
  fails(site({ files: { 'index.html': page(`<p>${N}&nbsp;${S}&nbsp;${O}&nbsp;${D}</p>`) } }), [], 'index.html:2:');
  fails(site({ files: { 'js/app.js': `const m = '${N}\\u00a0${S} ${O} ${D}';\n` } }), [], 'js/app.js:1:');
});

test('reversed, "nothing X, nothing Y", and in capitals, it fails', () => {
  const PROMISE = 'keep nothing, sell nothing';
  fails(site({ files: { 'index.html': page(`<p>${D} ${O} ${S}</p>`) } }), [], 'index.html:2:', PROMISE);
  fails(site({ files: { 'index.html': page(`<p>${N} ${S}, ${N} ${D}.</p>`) } }), [], 'index.html:2:', PROMISE);
  fails(site({ files: { 'index.html': page(`<p>${N} kept ${O} ${D}</p>`) } }), [], 'index.html:2:', PROMISE);
  fails(site({ files: { 'index.html': page(`<p>${[N, S, O, D].join(' ').toUpperCase()}</p>`) } }), [], 'index.html:2:', PROMISE);
});

/* --- "nothing stored", where a visitor can read it -------------------------- */

test('"nothing stored" and its variants fail in a published page', () => {
  for (const said of [`${N} ${S}`, `${N}&nbsp;is&nbsp;${S}`, `${N}&rsquo;s ${S}`, `${N} is ever ${S}`, `we store ${N}`, `${N.toUpperCase()} ${S.toUpperCase()}`]) {
    fails(site({ files: { 'app.html': page(`<p>${said} here.</p>`) } }), [], 'app.html:2:', '"nothing stored" claim');
  }
});

test('"nothing stored" in a server reply fails; the same words in its comments do not', () => {
  fails(site({ files: { 'netlify/functions/f.js': `exports.handler = () => '${N} is ${S}.';\n` } }), [],
    'netlify/functions/f.js:1:', 'server code a visitor can see');
});

/* --- which files: tracked, published, neither, forced ----------------------- */

test('the promise in a tracked file that is not published still fails', () => {
  fails(site({ files: { 'docs/notes.md': `Old copy: ${N} ${S} ${O} ${D}.\n` } }), [], 'docs/notes.md:1:', '(in git)');
});

test('a published file that git does not track is still checked', () => {
  /* "never", not "nothing": only the promise rule may catch this one. */
  fails(site({ untracked: { 'vendor/x.js': `// never ${S} ${O} ${D}\n` } }), [], 'vendor/x.js:1:', 'keep nothing, sell nothing', '(published)');
});

test('a file that is neither tracked nor published is ignored', () => {
  passes(site({ untracked: { 'docs/draft.md': `${N} ${S} ${O} ${D}\n` } }));
});

test('an unforced 404 does not unpublish, as in check-published.js', () => {
  fails(site({ redirects: '/docs/*  /404.html  404\n', files: { 'docs/notes.md': `A refused write: ${N} ${S}.\n` } }), [],
    'docs/notes.md:1:', '(published)');
});

test('a PDF is not read as text', () => {
  passes(site({ files: { 'report.pdf': `%PDF-1.7\n${N} ${S} ${O} ${D}\n` } }));
});

/* --- files named on the command line (a static preview kept elsewhere) ------ */

test('a file named on the command line gets both rules; a missing one fails', () => {
  const dir = site();
  const preview = path.join(TMP, 'preview.html');
  fs.writeFileSync(preview, page(`<footer>${N} ${S}</footer>`));
  fails(dir, [preview], 'preview.html:2:', 'given on the command line');
  fs.writeFileSync(preview, CLEAN_PAGE);
  passes(dir, [preview]);
  fails(dir, [path.join(TMP, 'no-such-preview.html')], 'does not exist');
});

/* --- what the site says today must pass ------------------------------------- */

test('the true sentences the site says today pass', () => {
  passes(site({ files: {
    'index.html': page([
      '<p>Lab reports read from a scan or a link are kept so batches can be compared over time. Nothing about you is kept with them: no account, no record of who scanned what, no location.</p>',
      '<p>Your password passes through our server on its way to them and is never stored or logged by us.</p>',
      '<p>Nothing was kept before that day.</p>',
      '<p>If the file turns out not to be a lab report at all, we keep nothing from it.</p>',
      '<p>We intend to study this collection and we may sell that analysis to growers.</p>',
      '<li>No advertising, and no selling of your personal information.</li>',
      '<p class="small" id="savedPalateSummary">Nothing saved yet.</p>'
    ].join('\n'))
  } }));
});

/* --- the real tree ---------------------------------------------------------- */

test('the real tree passes, and counts the published files check-published.js counts', () => {
  const mine = execFileSync(process.execPath, [GUARD], { cwd: ROOT, encoding: 'utf8' });
  const theirs = execFileSync(process.execPath, [path.join(ROOT, 'scripts/check-published.js')], { cwd: ROOT, encoding: 'utf8' });
  const count = (out, re) => { const m = re.exec(out); assert.ok(m, `no count in:\n${out}`); return Number(m[1]); };
  assert.strictEqual(count(mine, /\((\d+) published files/), count(theirs, /\((\d+) published files/));
});

let history = 'checked';
test('the About page as it was before da5a6cf fails', () => {
  const before = spawnSync('git', ['show', 'da5a6cf^:about/index.html'], { cwd: ROOT, encoding: 'utf8' });
  if (before.status !== 0) { history = 'skipped: da5a6cf is not in this clone'; return; }
  const file = path.join(TMP, 'about-before-da5a6cf.html');
  fs.writeFileSync(file, before.stdout);
  const r = spawnSync(process.execPath, [GUARD, file], { cwd: ROOT, encoding: 'utf8' });
  assert.strictEqual(r.status, 1, `the guard passed the old About page:\n${r.stdout}`);
  assert.ok(r.stdout.includes('about-before-da5a6cf.html:102:'), r.stdout);
});

fs.rmSync(TMP, { recursive: true, force: true });

for (const f of failed) console.error(f);
if (failed.length) {
  console.error(`\ncheck-trust: ${failed.length} failure${failed.length === 1 ? '' : 's'} (${passed} passed)`);
  process.exit(1);
}
console.log(`check-trust: ${passed} checks (history ${history})\ncheck-trust clean`);

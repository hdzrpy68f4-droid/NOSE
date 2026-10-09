#!/usr/bin/env node
'use strict';
/* NOSE for dispensaries - publish a pinned release of the widget, from the
 * Codespace. PARSER-HANDOFF s14, "Pinned releases".
 *
 *   node scripts/b2b-release.js --dry-run    build it and say what it would publish
 *   node scripts/b2b-release.js              publish it
 *
 * A store's page pins one exact release with an integrity hash, so no NOSE
 * deploy changes that page: a deploy never touches a release, and a browser
 * refuses any bytes but the ones the page names. Git still holds one copy of
 * the maths - js/match-math.<hash>.js - because a built release is never
 * committed: it is built from a commit, uploaded to Netlify Blobs
 * ("b2b-releases", lib/b2b-releases.js), and recorded in docs/B2B-RELEASES.md
 * by its version, commit and the two sha384 values, from which
 * scripts/b2b-release-check.js builds it again and compares.
 *
 * WHAT IS BUILT, from the commit's own files in git (never the working tree):
 *
 *   nose-matches.js    js/match-math, js/b2b-rank, js/aroma-bar,
 *                      js/b2b-strings and js/b2b-widget, verbatim, in that
 *                      order - the order each reads the one before (build.sh's
 *                      load-order rule) - after a header naming the release,
 *                      the commit and the five files. Two lines of the widget
 *                      change: STYLESHEET names this release's own stylesheet,
 *                      /b2b/releases/<version>/nose-matches.css, and
 *                      STYLESHEET_INTEGRITY its sha384, so the browser checks
 *                      the stylesheet as it checks the script.
 *   nose-matches.css   css/b2b-widget, verbatim.
 *
 * The same commit and version always give the same bytes: nothing else goes
 * in - no time, no machine, no environment.
 *
 * IT REFUSES, before anything is built or sent:
 *   - a working tree with any change, staged or not, or an untracked file:
 *     what is released is a commit, and the record it writes is committed
 *     next, on its own
 *   - a checkout that is not origin/main's newest commit, after fetching
 *     origin: a release names a commit anyone can fetch and build again, and
 *     its record row goes on top of the newest record
 *   - widget files the same as the last release's, byte for byte: nothing
 *     new to release - or a record it cannot read
 *   - a commit whose files are not as build.sh leaves them: one hashed file
 *     each, named by its own SHA-256, the widget naming the stylesheet beside
 *     it, each file ending its last statement
 *
 * PUBLISHING, with NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN (the Codespaces
 * secrets the archive scripts use): the next version - one more than the
 * record's last - the stylesheet first, then the script, each written only
 * if its key is new (onlyIfNew), so no release is ever overwritten. A key
 * that is already there with these very bytes is a run that stopped part
 * way, and it goes on; with other bytes it stops, overwriting nothing. Both
 * files are read back and compared, and only then is the row written to
 * docs/B2B-RELEASES.md. Commit and push that file; then run
 * scripts/b2b-release-check.js. Prints no secret.
 *
 * Aroma and flavour only.
 */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const releases = require('../netlify/functions/lib/b2b-releases.js');

const ROOT = path.resolve(__dirname, '..');
const DOC = 'docs/B2B-RELEASES.md';
const USAGE = 'usage: node scripts/b2b-release.js [--dry-run]';

/* The five files, in the order each reads the one before, and the stylesheet. */
const PARTS = Object.freeze(['match-math', 'b2b-rank', 'aroma-bar', 'b2b-strings', 'b2b-widget']);
const STYLESHEET = 'b2b-widget';

/* The widget's two stylesheet lines, as build.sh leaves them. */
const STYLESHEET_LINE = /^ {2}const STYLESHEET = '\/css\/b2b-widget\.([0-9a-f]{8})\.css';$/gm;
const INTEGRITY_LINE = /^ {2}const STYLESHEET_INTEGRITY = null;$/gm;

const DOC_HEADER = '| version | commit | nose-matches.js | nose-matches.css |';
const DOC_RULE = '|---|---|---|---|';
const DOC_ROW = /^\| ([1-9][0-9]{0,5}) \| ([0-9a-f]{40}) \| (sha384-[A-Za-z0-9+/]{64}) \| (sha384-[A-Za-z0-9+/]{64}) \|$/;

class Refusal extends Error {}

/* ----------------------------------------------------------------- git */

function git(args, root, opts = {}) {
  return execFileSync('git', args, { cwd: root, encoding: opts.encoding === null ? null : 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}
function gitOk(args, root) {
  try { git(args, root); return true; } catch { return false; }
}

/* The files of one commit, read from git's objects. The commit is named by
   its full hash whatever it was asked for by, so a short name builds the very
   same bytes - the header names the commit. */
function commitSource(name, root = ROOT) {
  const commit = git(['rev-parse', '--verify', '--quiet', `${name}^{commit}`], root).trim();
  const names = git(['ls-tree', '-r', '--name-only', commit, '--', 'js', 'css'], root).split('\n').filter(Boolean);
  return { commit, names, read: p => git(['show', `${commit}:${p}`], root, { encoding: null }) };
}

/* The working tree's files: for the tests, which build what build.sh has just
   left on disk. Never used to publish. */
function treeSource(root = ROOT) {
  const names = ['js', 'css'].flatMap(d => fs.readdirSync(path.join(root, d)).map(f => `${d}/${f}`));
  return { commit: null, names, read: p => fs.readFileSync(path.join(root, p)) };
}

/* --------------------------------------------------------------- build */

const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');

/* One built file of a name: js/<name>.<hash>.js, named by its own SHA-256 as
   build.sh names it, and no unbuilt js/<name>.js beside it. */
function builtFile(source, dir, name, ext) {
  const hashed = new RegExp(`^${dir}/${name}\\.([0-9a-f]{8})\\.${ext}$`);
  const found = source.names.filter(n => hashed.test(n));
  if (source.names.includes(`${dir}/${name}.${ext}`) || found.length !== 1) {
    throw new Refusal(`expected exactly one built ${dir}/${name}.<hash>.${ext}, found ${found.length ? found.join(', ') : 'none'}` +
                      `${source.names.includes(`${dir}/${name}.${ext}`) ? ` and an unbuilt ${dir}/${name}.${ext}` : ''} - run bash build.sh and commit`);
  }
  const bytes = source.read(found[0]);
  if (sha256(bytes).slice(0, 8) !== hashed.exec(found[0])[1]) {
    throw new Refusal(`${found[0]} is not the file build.sh names so - run bash build.sh and commit`);
  }
  return { path: found[0], bytes };
}

/* Bytes as text, refused unless they are UTF-8 exactly. */
function utf8(file) {
  const text = file.bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(file.bytes)) throw new Refusal(`${file.path} is not UTF-8`);
  return text;
}

function replaceOnce(text, pattern, replacement, what) {
  const hits = text.match(pattern) || [];
  if (hits.length !== 1) throw new Refusal(`js/b2b-widget must hold ${what} exactly once, as build.sh leaves it; found ${hits.length}`);
  return text.replace(pattern, replacement);
}

/* The release, as bytes: { version, commit, js, css, sri, parts, stylesheet }. */
function build({ version, source }) {
  const v = releases.versionOf(version);
  const css = builtFile(source, 'css', STYLESHEET, 'css');
  const parts = PARTS.map(name => builtFile(source, 'js', name, 'js'));
  const cssSri = releases.sri(css.bytes);
  const texts = parts.map(p => {
    const t = utf8(p);
    if (!t.endsWith(';\n')) throw new Refusal(`${p.path} does not end its last statement with ";" and a newline, so it could run into the next file`);
    return t;
  });
  utf8(css);

  const w = PARTS.indexOf('b2b-widget');
  const named = [...texts[w].matchAll(STYLESHEET_LINE)];
  if (named.length === 1 && `css/b2b-widget.${named[0][1]}.css` !== css.path) {
    throw new Refusal(`js/b2b-widget names /css/b2b-widget.${named[0][1]}.css, not the stylesheet beside it, /${css.path} - run bash build.sh and commit`);
  }
  texts[w] = replaceOnce(texts[w], STYLESHEET_LINE, `  const STYLESHEET = '${releases.releasePath(v, releases.CSS)}';`, 'its STYLESHEET line');
  texts[w] = replaceOnce(texts[w], INTEGRITY_LINE, `  const STYLESHEET_INTEGRITY = '${cssSri}';`, 'its STYLESHEET_INTEGRITY line');

  const header = [
    `/* NOSE <nose-matches>, pinned release ${v}, built by scripts/b2b-release.js`,
    ` * from ${source.commit ? `commit ${source.commit}` : 'the working tree - a test build, never published'}.`,
    ' * Five files, verbatim, in this order:',
    ...parts.map(p => ` *   ${p.path}`),
    ' * but for the widget\'s two stylesheet lines, which name this release\'s own',
    ` * stylesheet, ${releases.releasePath(v, releases.CSS)} - ${css.path}, verbatim -`,
    ' * and its sha384. Load this file with its integrity hash and',
    ' * crossorigin="anonymous": docs/B2B-INTEGRATION.md in NOSE\'s repository.',
    ' * Aroma and flavour only. */',
    ''
  ].join('\n');
  const js = Buffer.from(header + parts.map((p, i) => `/* ---- ${p.path} ---- */\n${texts[i]}`).join(''), 'utf8');
  return {
    version: v, commit: source.commit, js, css: css.bytes,
    sri: { js: releases.sri(js), css: cssSri },
    parts: parts.map(p => p.path), stylesheet: css.path, source
  };
}

/* The release's six files are the ones another commit holds, byte for byte. */
function sameFiles(release, source) {
  const paths = [...release.parts, release.stylesheet];
  if (!paths.every(p => source.names.includes(p))) return false;
  const here = paths.map(p => release.source.read(p));
  return paths.every((p, i) => source.read(p).equals(here[i]));
}

/* -------------------------------------------------------------- record */

/* docs/B2B-RELEASES.md's rows, in order: [{ version, commit, js, css }].
   Versions run 1, 2, 3 with no gap; nothing but rows follows the table. */
function readRecord(root = ROOT) {
  let text;
  try { text = fs.readFileSync(path.join(root, DOC), 'utf8'); }
  catch { throw new Refusal(`${DOC} is missing - it is the record of every release, and it is committed`); }
  const lines = text.split('\n');
  const at = lines.indexOf(DOC_HEADER);
  if (at < 0 || lines[at + 1] !== DOC_RULE) throw new Refusal(`${DOC} has no release table - its header must be exactly: ${DOC_HEADER}`);
  const rows = [];
  for (const [i, line] of lines.slice(at + 2).entries()) {
    if (line === '') continue;
    const m = DOC_ROW.exec(line);
    if (!m) throw new Refusal(`${DOC} line ${at + 3 + i} is not a release row - the table is written by scripts/b2b-release.js alone`);
    rows.push({ version: m[1], commit: m[2], js: m[3], css: m[4] });
  }
  rows.forEach((r, i) => {
    if (r.version !== String(i + 1)) throw new Refusal(`${DOC}: release ${r.version} is in the place of release ${i + 1} - versions run 1, 2, 3 with no gap`);
  });
  if (lines.slice(at + 2).some((l, i, all) => l === '' && all.slice(i + 1).some(x => x !== ''))) {
    throw new Refusal(`${DOC}: a blank line inside the release table`);
  }
  return rows;
}

const rowOf = r => `| ${r.version} | ${r.commit} | ${r.sri.js} | ${r.sri.css} |`;

function appendRow(release, root = ROOT) {
  const file = path.join(root, DOC);
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, `${text.replace(/\n*$/, '\n')}${rowOf(release)}\n`);
}

/* -------------------------------------------------------------- refusals */

function dirtyPaths(root) {
  return git(['status', '--porcelain', '--untracked-files=all'], root).split('\n').filter(l => l.length > 3).map(l => l.slice(3));
}

function checkTree(root) {
  const dirty = dirtyPaths(root);
  if (dirty.length) {
    throw new Refusal(`the working tree has changes - commit or remove them first, so that what is released is a commit:\n` +
                      dirty.slice(0, 20).map(p => `    ${p}`).join('\n') + (dirty.length > 20 ? `\n    ...and ${dirty.length - 20} more` : ''));
  }
  try { git(['fetch', '--quiet', 'origin', 'main'], root); }
  catch { throw new Refusal('could not fetch origin main, so could not confirm the commit is on it - check the network and try again'); }
  const head = git(['rev-parse', 'HEAD'], root).trim();
  const tip = git(['rev-parse', 'refs/remotes/origin/main'], root).trim();
  if (head === tip) return head;
  if (gitOk(['merge-base', '--is-ancestor', head, tip], root)) {
    throw new Refusal(`origin/main has commits this checkout does not - git pull first, so the release is of the newest commit and its row goes on the newest record`);
  }
  throw new Refusal(`commit ${head.slice(0, 7)} is not on origin/main - push it first (git push), so anyone can build the release again from it`);
}

/* ------------------------------------------------------------ the store */

function explain(err) {
  const msg = err && err.message ? err.message : String(err);
  if (/\b(401|403)\b/.test(msg)) return `Netlify refused the token (${msg}). It may have expired: make a new one and update NETLIFY_AUTH_TOKEN.`;
  if (/\b404\b/.test(msg)) return `Netlify does not know that site (${msg}). Check NETLIFY_SITE_ID.`;
  return msg;
}

async function publish(release, { env, out }) {
  const store = releases.open({ siteID: env.NETLIFY_SITE_ID, token: env.NETLIFY_AUTH_TOKEN });
  for (const file of [releases.CSS, releases.JS]) {
    const bytes = file === releases.JS ? release.js : release.css;
    const done = await releases.put(store, release.version, file, bytes);
    if (done === 'written') { out(`  wrote ${file}`); continue; }
    const there = await releases.read(store, release.version, file);
    if (there && there.equals(bytes)) { out(`  ${file} is already there, byte for byte - a run that stopped part way, going on`); continue; }
    throw new Refusal(`release ${release.version}'s ${file} is already in the store, with other bytes - nothing was overwritten, and ` +
                      `${DOC} has no row for it. Run node scripts/b2b-release-check.js to see what the store holds.`);
  }
  for (const file of [releases.CSS, releases.JS]) {
    const want = file === releases.JS ? release.js : release.css;
    const got = await releases.read(store, release.version, file);
    if (!got || !got.equals(want)) throw new Error(`release ${release.version}'s ${file} did not read back as written - nothing recorded`);
  }
  out('  read back: both files match, byte for byte');
}

/* ----------------------------------------------------------------- main */

const size = b => b.length.toLocaleString('en-US');

async function main(argv = process.argv.slice(2), { env = process.env, root = ROOT, out = console.log, err = console.error } = {}) {
  const dryRun = argv.includes('--dry-run');
  if (argv.some(a => a !== '--dry-run')) { err(USAGE); return 2; }
  try {
    const commit = checkTree(root);
    const rows = readRecord(root);
    const version = String(rows.length + 1);
    const release = build({ version, source: commitSource(commit, root) });
    const last = rows[rows.length - 1];
    if (last && sameFiles(release, commitSource(last.commit, root))) {
      throw new Refusal(`the widget's files at ${commit.slice(0, 7)} are release ${last.version}'s (commit ${last.commit.slice(0, 7)}), byte for byte - nothing new to release`);
    }
    out(`b2b-release: release ${version}, from commit ${commit} (on origin/main)`);
    out(`  ${releases.JS.padEnd(17)} ${size(release.js).padStart(7)} bytes  ${release.sri.js}`);
    out(`  ${releases.CSS.padEnd(17)} ${size(release.css).padStart(7)} bytes  ${release.sri.css}`);
    out(`  served at ${releases.releasePath(version, releases.JS)} and ${releases.releasePath(version, releases.CSS)}`);
    if (dryRun) {
      out('b2b-release: dry run - nothing uploaded, nothing written');
      return 0;
    }
    if (!env.NETLIFY_SITE_ID || !env.NETLIFY_AUTH_TOKEN) {
      throw new Refusal('publishing needs NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN, the Codespaces secrets the archive scripts use - nothing was uploaded');
    }
    try { await publish(release, { env, out }); }
    catch (e) {
      if (e instanceof Refusal) throw e;
      err(`b2b-release: FAILED - ${explain(e)}`);
      err(`  nothing was recorded in ${DOC}; the same command again goes on where this stopped`);
      return 1;
    }
    appendRow(release, root);
    out(`  recorded in ${DOC}`);
    out(`b2b-release: release ${version} published`);
    out('');
    out('Next: commit and push the record, then check every release:');
    out(`  git add ${DOC} && git commit -m "b2b: release ${version}" && git push`);
    out('  node scripts/b2b-release-check.js');
    out('');
    out('The tag a store\'s page carries (docs/B2B-INTEGRATION.md):');
    out(`  <script src="https://nose-app.com${releases.releasePath(version, releases.JS)}"`);
    out(`          integrity="${release.sri.js}"`);
    out('          crossorigin="anonymous" referrerpolicy="no-referrer" defer></script>');
    return 0;
  } catch (e) {
    if (e instanceof Refusal || e instanceof TypeError) { err(`b2b-release: REFUSED - ${e.message}`); return 1; }
    err(`b2b-release: FAILED - ${e && e.message ? e.message : e}`);
    return 1;
  }
}

module.exports = {
  build, commitSource, treeSource, readRecord, rowOf, appendRow, checkTree, sameFiles, main,
  PARTS, STYLESHEET, DOC, DOC_HEADER, DOC_RULE, DOC_ROW, Refusal
};

if (require.main === module) main().then(code => { process.exitCode = code; });

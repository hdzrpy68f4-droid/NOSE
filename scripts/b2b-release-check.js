#!/usr/bin/env node
'use strict';
/* NOSE for dispensaries - check every pinned release against its record,
 * from the Codespace. PARSER-HANDOFF s14, "Pinned releases".
 *
 *   node scripts/b2b-release-check.js                              git and the store
 *   node scripts/b2b-release-check.js --site https://nose-app.com  and the live site
 *
 * For every row of docs/B2B-RELEASES.md - version, commit, and the sha384 of
 * nose-matches.js and nose-matches.css - three questions, each answered by
 * bytes, never by a name:
 *
 *   git     does the commit, still on origin/main, build those very bytes?
 *           (scripts/b2b-release.js's own build, from git's objects)
 *   store   does the "b2b-releases" store hold those very bytes? Every file
 *           is downloaded and hashed. And does it hold any release the record
 *           does not name, or anything else?
 *   site    with --site: does the site serve them - 200, those bytes, and the
 *           headers a store's page needs: the file's Content-Type,
 *           Cache-Control: public, max-age=31536000, immutable,
 *           Access-Control-Allow-Origin: *, Cross-Origin-Resource-Policy:
 *           cross-origin, X-Content-Type-Options: nosniff? Until B2B is
 *           switched on (Prompt 8) the site answers 404, and this says so.
 *
 * Needs NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN, the Codespaces secrets the
 * archive scripts use. Reads only: it writes nothing anywhere, and prints no
 * secret. Ends with one line: every file matching, or how many problems.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const releases = require('../netlify/functions/lib/b2b-releases.js');
const rel = require('./b2b-release.js');

const ROOT = path.resolve(__dirname, '..');
const USAGE = 'usage: node scripts/b2b-release-check.js [--site https://nose-app.com]';
const FETCH_TIMEOUT_MS = 15000;

function git(args, root) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function gitOk(args, root) {
  try { git(args, root); return true; } catch { return false; }
}

/* --site <origin>, or nothing; anything else is a usage error. */
function parseArgs(argv) {
  let site = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--site' && i + 1 < argv.length && site === null) { site = argv[++i]; continue; }
    return null;
  }
  if (site !== null) {
    let u;
    try { u = new URL(site); } catch { return null; }
    if (!/^https?:$/.test(u.protocol) || u.pathname !== '/' || u.search || u.hash || u.username || u.password) return null;
    site = u.origin;
  }
  return { site };
}

/* git: the commit, fetched when the clone lacks it, built again. */
function fromGit(row, root) {
  const has = () => gitOk(['cat-file', '-e', `${row.commit}^{commit}`], root);
  if (!has()) { try { git(['fetch', '--quiet', 'origin'], root); } catch {} }
  if (!has()) return [`commit ${row.commit.slice(0, 7)} is neither in this clone nor on origin`];
  let built;
  try { built = rel.build({ version: row.version, source: rel.commitSource(row.commit, root) }); }
  catch (e) { return [`commit ${row.commit.slice(0, 7)} does not build: ${e.message}`]; }
  const problems = [];
  if (built.sri.js !== row.js) problems.push(`commit ${row.commit.slice(0, 7)} builds a ${releases.JS} other than the recorded one (${built.sri.js})`);
  if (built.sri.css !== row.css) problems.push(`commit ${row.commit.slice(0, 7)} builds a ${releases.CSS} other than the recorded one (${built.sri.css})`);
  if (!gitOk(['merge-base', '--is-ancestor', row.commit, 'refs/remotes/origin/main'], root)) {
    problems.push(`commit ${row.commit.slice(0, 7)} is not on origin/main`);
  }
  return problems;
}

/* store: both files downloaded and hashed. */
async function fromStore(row, store) {
  const problems = [];
  for (const [file, want] of [[releases.JS, row.js], [releases.CSS, row.css]]) {
    const bytes = await releases.read(store, row.version, file);
    if (!bytes) problems.push(`${file} is missing from the store`);
    else if (releases.sri(bytes) !== want) problems.push(`the store's ${file} is not the recorded file (it hashes to ${releases.sri(bytes)})`);
  }
  return problems;
}

/* site: both files fetched as a browser would, without cookies, and their
   headers compared with what the function sends. */
async function fromSite(row, site, fetchImpl) {
  const problems = [];
  for (const [file, want] of [[releases.JS, row.js], [releases.CSS, row.css]]) {
    const url = `${site}${releases.releasePath(row.version, file)}`;
    let res, body;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      res = await fetchImpl(url, { redirect: 'manual', credentials: 'omit', signal: ctl.signal });
      body = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      problems.push(`${file}: the site did not answer (${e && e.message ? e.message : e})`);
      continue;
    } finally { clearTimeout(timer); }
    if (res.status === 404) { problems.push(`${file}: the site answers 404 - not served yet (B2B is off until Prompt 8 switches it on)`); continue; }
    if (res.status !== 200) { problems.push(`${file}: the site answers ${res.status}`); continue; }
    for (const [name, value] of Object.entries(releases.headers(file))) {
      const got = res.headers.get(name);
      if (got === null || sameHeader(got) !== sameHeader(value)) problems.push(`${file}: ${name} is ${got === null ? 'missing' : `"${got}"`}, not "${value}"`);
    }
    if (releases.sri(body) !== want) problems.push(`${file}: the site serves other bytes (they hash to ${releases.sri(body)})`);
  }
  return problems;
}

/* A header's value as its meaning: case aside, and the spaces around "," and
   ";" aside. Netlify's CDN serves the function's
   "public, max-age=31536000, immutable" as "public,max-age=31536000,immutable"
   (seen live, 2026-10-09) - the same directives, which RFC 9111 lists with
   optional whitespace around each comma. */
function sameHeader(v) {
  return String(v).toLowerCase().trim().replace(/\s*([,;])\s*/g, '$1');
}

function explain(err) {
  const msg = err && err.message ? err.message : String(err);
  if (/\b(401|403)\b/.test(msg)) return `Netlify refused the token (${msg}). It may have expired: make a new one and update NETLIFY_AUTH_TOKEN.`;
  if (/\b404\b/.test(msg)) return `Netlify does not know that site (${msg}). Check NETLIFY_SITE_ID.`;
  return msg;
}

async function main(argv = process.argv.slice(2), { env = process.env, root = ROOT, out = console.log, err = console.error, fetchImpl = globalThis.fetch } = {}) {
  const args = parseArgs(argv);
  if (!args) { err(USAGE); return 2; }
  let rows;
  try { rows = rel.readRecord(root); }
  catch (e) { err(`b2b-release-check: FAILED - ${e.message}`); return 1; }
  if (!env.NETLIFY_SITE_ID || !env.NETLIFY_AUTH_TOKEN) {
    err('b2b-release-check: REFUSED - it downloads every release from Netlify Blobs, which needs NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN, the Codespaces secrets the archive scripts use');
    return 1;
  }

  const problems = [];
  let store, held;
  try {
    store = releases.open({ siteID: env.NETLIFY_SITE_ID, token: env.NETLIFY_AUTH_TOKEN });
    held = await releases.inventory(store);
  } catch (e) {
    err(`b2b-release-check: FAILED - ${explain(e)}`);
    return 1;
  }

  out(`b2b-release-check: ${rows.length} release${rows.length === 1 ? '' : 's'} in ${rel.DOC}${args.site ? `, served by ${args.site}` : ''}`);
  for (const row of rows) {
    const found = { git: fromGit(row, root), store: null, site: null };
    try { found.store = await fromStore(row, store); }
    catch (e) { found.store = [`the store did not answer (${explain(e)})`]; }
    if (args.site) found.site = await fromSite(row, args.site, fetchImpl);
    const say = k => (found[k] === null ? null : `${k} ${found[k].length ? 'FAIL' : 'ok'}`);
    out(`  release ${row.version}  commit ${row.commit.slice(0, 7)}  ${['git', 'store', 'site'].map(say).filter(Boolean).join('  ')}`);
    for (const k of ['git', 'store', 'site']) for (const p of found[k] || []) { out(`    ${k}: ${p}`); problems.push(p); }
  }
  const recorded = new Set(rows.map(r => r.version));
  for (const [version, files] of Object.entries(held.versions).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    if (!recorded.has(version)) {
      const p = `the store holds release ${version} (${files.join(', ')}), which ${rel.DOC} does not record`;
      out(`  ${p}`);
      problems.push(p);
    }
  }
  for (const k of held.other) {
    const p = `the store holds "${k}", which is not a release file`;
    out(`  ${p}`);
    problems.push(p);
  }

  if (problems.length) {
    out(`b2b-release-check: ${problems.length} problem${problems.length === 1 ? '' : 's'} - see the lines above`);
    return 1;
  }
  out(rows.length
    ? `b2b-release-check: every file of ${rows.length} release${rows.length === 1 ? '' : 's'} matches the record${args.site ? ', in git, in the store and on the site' : ', in git and in the store'}`
    : 'b2b-release-check: no releases yet, and the store holds none');
  return 0;
}

module.exports = { main, parseArgs, fromGit, fromStore, fromSite, USAGE };

if (require.main === module) main().then(code => { process.exitCode = code; });

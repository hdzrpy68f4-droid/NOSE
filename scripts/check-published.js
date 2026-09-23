#!/usr/bin/env node
'use strict';
/* NOSE - refuse to publish a database address or credential.
 *
 *   node scripts/check-published.js [extra files...]    (run by build.sh)
 *
 * Two checks, because there are two rules:
 *
 *  1. PUBLISHED files must not name the database at all: no postgres:// or
 *     postgresql:// URL, no pooler.supabase.com, no <ref>.supabase.co host, no
 *     sb_secret_, no Netlify token. A link to supabase.com - on the privacy
 *     page, say - is fine; the .supabase.co match is exact for that reason.
 *
 *  2. EVERY file in git must not hold a credential: no URL with a password in
 *     it, no Supabase secret key, no Netlify token. The repo is public.
 *
 * "Published" is computed, not listed: everything in the publish directory
 * except .git, node_modules and whatever _redirects blocks with a FORCED 404.
 * Only forced rules count - without the !, Netlify serves a file that exists
 * and the rule does nothing. So deleting a ! makes this check scan that path
 * again, which is the point.
 *
 * Extra paths on the command line (a static preview kept elsewhere, say) get
 * check 1 as well.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

/* Netlify's own tokens start nfp_ (personal access), nfc_ (CLI), nfo_ (OAuth),
   nfu_ (app) or nfb_ (build). NETLIFY_AUTH_TOKEN, which the archive scripts
   use, is a personal access token and lives only in Codespaces secrets. */
const NETLIFY_TOKEN = [/\bnf[pcoub]_[A-Za-z0-9]{20,}/, 'a Netlify access token'];

const PUBLISHED_PATTERNS = [
  [/postgres(?:ql)?:\/\//i, 'a postgres:// URL'],
  [/pooler\.supabase\.com/i, 'the Supabase pooler host'],
  [/\b[a-z0-9-]+\.supabase\.co(?![a-z0-9-])/i, 'a <project>.supabase.co host'],
  [/sb_secret_/, 'a Supabase secret key prefix'],
  NETLIFY_TOKEN
];
const CREDENTIAL_PATTERNS = [
  [/postgres(?:ql)?:\/\/[^\s:@/'"`<>]+:[^\s@/'"`<>]+@/i, 'a database URL with a password in it'],
  [/sb_secret_[A-Za-z0-9_-]{8,}/, 'a Supabase secret key'],
  NETLIFY_TOKEN
];

const BINARY = /\.(pdf|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|zip|tar|gz|br)$/i;

function isText(file) {
  if (BINARY.test(file)) return false;
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return !buf.subarray(0, n).includes(0);
  } finally {
    fs.closeSync(fd);
  }
}

/* Forced 404 rules only: "/path/*  /404.html  404!" or "/file  /404.html  404!" */
function blockedPaths() {
  const f = path.join(ROOT, '_redirects');
  if (!fs.existsSync(f)) return { prefixes: [], files: [] };
  const prefixes = [];
  const files = [];
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*\/(\S*)\s+\/404\.html\s+404!\s*$/.exec(line);
    if (!m) continue;
    if (m[1].endsWith('/*')) prefixes.push(m[1].slice(0, -1));
    else files.push(m[1]);
  }
  return { prefixes, files };
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
      .split('\0').filter(Boolean).map(f => path.join(ROOT, f)).filter(f => fs.existsSync(f));
  } catch {
    return walk(ROOT);   /* no git (unusual): check everything present */
  }
}

function scan(files, patterns, why, hits) {
  for (const file of files) {
    if (!isText(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const [re, what] of patterns) {
        if (re.test(line)) hits.push(`${path.relative(ROOT, file) || file}:${i + 1}: ${what} (${why})`);
      }
    });
  }
}

const { prefixes, files: blockedFiles } = blockedPaths();
const published = walk(ROOT).filter(f => {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  return !prefixes.some(p => rel.startsWith(p)) && !blockedFiles.includes(rel);
});
const extra = process.argv.slice(2).map(p => path.resolve(p)).filter(p => fs.existsSync(p));

const hits = [];
scan([...published, ...extra], PUBLISHED_PATTERNS, 'published', hits);
scan(trackedFiles(), CREDENTIAL_PATTERNS, 'in git', hits);

/* A .env is gitignored and never deployed, so neither scan above sees it - but
 * the rule is that connection strings never sit in one at all. Only matters in
 * a Codespace; on Netlify there is no .env. */
const dotenv = path.join(ROOT, '.env');
if (fs.existsSync(dotenv)) scan([dotenv], [...PUBLISHED_PATTERNS, ...CREDENTIAL_PATTERNS], 'in .env - delete it and use Codespaces secrets', hits);

if (hits.length) {
  console.log('FAIL: a database address or credential would be published or committed:');
  for (const h of [...new Set(hits)]) console.log(`  ${h}`);
  console.log('Connection strings belong only in Netlify environment variables and Codespaces secrets.');
  process.exit(1);
}
console.log(`==> no database hosts or credentials (${published.length} published files, blocked: ${prefixes.length} dirs + ${blockedFiles.length} files)`);

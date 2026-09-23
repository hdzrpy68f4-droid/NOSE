'use strict';
/* NOSE - which code ran. The one version helper, for the function and the
 * Codespace scripts alike.
 *
 *   parserVersion     git short SHA of the checkout
 *   extractorVersion  short hash of extract-text.js together with the unpdf
 *                     version actually INSTALLED - a change to either one is a
 *                     different extractor
 *   deployContext     Netlify's $CONTEXT when the build ran: production,
 *                     deploy-preview, branch-deploy - or 'dev'
 *
 * Three ways in:
 *
 *   the function   buildInfo() reads build-info.json. build.sh writes it at
 *                  deploy time and esbuild bundles it into the function. An
 *                  environment variable exported by build.sh would be gone by
 *                  then - Netlify hands build variables to functions only with
 *                  Functions scope - so the build writes a file instead.
 *   build.sh       node netlify/functions/lib/version.js --write
 *   scripts        fromCheckout() computes the same stamps from git and the
 *                  installed files, and pin() makes this process use them, so
 *                  what a script stores names the code that actually ran.
 *
 * A missing or unreadable build-info.json reads as 'dev' in every field, and
 * coa.js stores nothing unless deployContext is exactly 'production'. A local
 * run, a test, a deploy preview or a build that somehow skipped the stamp all
 * fail closed: nothing stored.
 *
 * build-info.json is generated and gitignored. Never commit one.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const BUILD_INFO_FILE = 'netlify/functions/lib/build-info.json';
const EXTRACTOR_FILE = 'netlify/functions/lib/extract-text.js';
const FIELDS = ['parserVersion', 'extractorVersion', 'deployContext'];
const DEV = Object.freeze({ parserVersion: 'dev', extractorVersion: 'dev', deployContext: 'dev' });

/* A stamp is short, printable and has no spaces. Anything else is not a stamp,
   and reads as 'dev' rather than being stored as though it were one. */
const STAMP = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const stamp = v => (typeof v === 'string' && STAMP.test(v) ? v : 'dev');

function normalise(raw) {
  const out = {};
  for (const k of FIELDS) out[k] = stamp(raw && raw[k]);
  return out;
}

/* ------------------------------------------------------------ the function */

let cached = null;
let pinned = null;

function readBuildInfo() {
  let raw;
  /* A literal path, so esbuild can inline the file; inside try, so a bundle
     made without it still loads and reads as 'dev'. */
  try { raw = require('./build-info.json'); }
  catch { return { ...DEV }; }
  return normalise(raw);
}

function buildInfo() {
  if (pinned) return { ...pinned };
  if (!cached) cached = readBuildInfo();
  return { ...cached };
}

/* ------------------------------------------------------ build and scripts */

function git(args, root) {
  const { execFileSync } = require('child_process');
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function gitShortSha(root = ROOT) {
  try {
    return git(['rev-parse', '--short', 'HEAD'], root).trim() || null;
  } catch {
    /* Netlify also names the commit it is building. */
    const ref = process.env.COMMIT_REF;
    return ref && /^[0-9a-f]{7,40}$/i.test(ref) ? ref.slice(0, 7).toLowerCase() : null;
  }
}

/* The unpdf in node_modules, not the one package.json asks for: what runs is
   what is installed. */
function installedUnpdf(root = ROOT) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/unpdf/package.json'), 'utf8')).version;
    return typeof v === 'string' && v ? v : null;
  } catch {
    return null;
  }
}

function extractorHash(root = ROOT) {
  const unpdf = installedUnpdf(root);
  if (!unpdf) return null;
  let src;
  try { src = fs.readFileSync(path.join(root, EXTRACTOR_FILE)); }
  catch { return null; }
  return crypto.createHash('sha256').update(src).update(`\0unpdf@${unpdf}`).digest('hex').slice(0, 12);
}

/* The stamps for this checkout, as the build would write them. */
function fromCheckout(root = ROOT) {
  return {
    parserVersion: stamp(gitShortSha(root)),
    extractorVersion: stamp(extractorHash(root)),
    unpdf: installedUnpdf(root)
  };
}

/* Paths among `files` with uncommitted changes, staged or not, or untracked.
   Throws when git cannot say, so a caller refuses rather than guesses. */
function uncommitted(files, root = ROOT) {
  /* Porcelain lines are "XY path"; X may be a space, so nothing is trimmed
     before the two status columns are cut off. */
  return git(['status', '--porcelain', '--', ...files], root)
    .split('\n').filter(l => l.length > 3).map(l => l.slice(3).trim());
}

/* Scripts only: make buildInfo() - and so every parse this process runs -
   report these stamps instead of build-info.json. */
function pin(info) {
  pinned = normalise(info);
  return { ...pinned };
}

function writeBuildInfo({ root = ROOT, context = process.env.CONTEXT } = {}) {
  const v = fromCheckout(root);
  const info = {
    parserVersion: v.parserVersion,
    extractorVersion: v.extractorVersion,
    deployContext: stamp(context || 'dev')
  };
  fs.writeFileSync(path.join(root, BUILD_INFO_FILE), JSON.stringify(info, null, 2) + '\n');
  return { ...info, unpdf: v.unpdf };
}

module.exports = {
  buildInfo, fromCheckout, uncommitted, pin, writeBuildInfo,
  DEV, BUILD_INFO_FILE, EXTRACTOR_FILE,
  _stamp: stamp, _extractorHash: extractorHash
};

if (require.main === module) {
  if (process.argv.includes('--write')) {
    const i = writeBuildInfo();
    console.log(`==> build info: parser ${i.parserVersion}, extractor ${i.extractorVersion} (unpdf ${i.unpdf || 'not installed'}), context ${i.deployContext}`);
  } else {
    const c = fromCheckout();
    console.log(`checkout      parser ${c.parserVersion}, extractor ${c.extractorVersion} (unpdf ${c.unpdf || 'not installed'})`);
    const b = buildInfo();
    console.log(`build-info    parser ${b.parserVersion}, extractor ${b.extractorVersion}, context ${b.deployContext}`);
  }
}

#!/usr/bin/env node
/* NOSE - the compliance kit, scripts/b2b-compliance-kit.js, end to end.
 *
 *   node test/b2b-compliance-kit-test.mjs        expect: b2b-compliance-kit clean
 *
 * After the build, like the other browser tests: the kit drives headless
 * Chromium itself. Every run is in a throwaway git world - this tree's built
 * js/ and css/, the demo, the privacy page, the integration guide and
 * .gitignore, committed, with release 1 recorded from that very commit by
 * scripts/b2b-release.js's own build() - so the kit builds its release from
 * git as it does in the Codespace, and this repository is never written.
 * What it pins down (PARSER-HANDOFF s14, "The compliance kit"):
 *   - the test store's kit: the ten screens and their PNGs, phone and
 *     desktop, scroll pages only for the lists that scroll; README.md naming
 *     the release, its commit and both hashes, every PNG, the demo's own
 *     made-up purchases and every request the widget made; strings.md with
 *     every Florida string exactly as written, the screens' strings each
 *     traced and none to the default variant, "not rendered" only for what
 *     no screen showed; data.md holding every paragraph of the privacy
 *     page's dispensary section and every other mention of dispensaries,
 *     saying it was not compared with the published page under --offline
 *   - a store's kit, against a stand-in for the site: one feed request, the
 *     public key alone with the store's origin, no cookie or referrer; the
 *     privacy page compared; purchases made up from that store's list by the
 *     rule; an earlier kit replaced
 *   - the refusals, each writing nothing: a secret key, --offline with a
 *     store, a folder outside b2b-out/ or holding something else, b2b-out/
 *     not ignored, a release not recorded, not matching its record or not in
 *     the clone, a feed refused, a published privacy section that differs or
 *     cannot be read, a widget showing the default words, a vote carrying
 *     more than its six fields
 *   - the kit's own words and its output free of effect wording; every
 *     string of js/b2b-strings placed by the kit's WHEN; no database, Blobs,
 *     coa.js or archive code loaded; nothing written outside b2b-out/, in a
 *     world or here
 *
 * Needs Playwright with its Chromium, as input-paths does.
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) {
    process.stderr.write('b2b-compliance-kit: stopped before the last check - NOT clean\n');
    process.exitCode = 1;
  }
});
let failures = 0;
function check(name, ok, detail) {
  if (ok) { console.log(`ok    ${name}`); return; }
  failures++;
  console.log(`FAIL  ${name}${detail ? `\n      ${String(detail).slice(0, 900)}` : ''}`);
}

function havePlaywright() {
  for (const id of ['playwright', '@playwright/test']) { try { require.resolve(id); return true; } catch {} }
  try {
    const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    require.resolve(path.join(g, 'playwright'));
    return true;
  } catch { return false; }
}
if (!havePlaywright()) {
  console.error('FAIL: Playwright is not installed - run: npm install --no-save playwright && npx playwright install --with-deps chromium');
  process.exit(1);
}

/* Every module the kit loads, watched from here. */
const Module = require('module');
const loads = [];
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  try { loads.push(Module._resolveFilename(request, parent, isMain)); } catch { loads.push(request); }
  return originalLoad.apply(this, arguments);
};

const KIT_SRC = path.join(ROOT, 'scripts/b2b-compliance-kit.js');
const kit = require(KIT_SRC);
const rel = require(path.join(ROOT, 'scripts/b2b-release.js'));
const { effectWords } = require(path.join(ROOT, 'test/b2b-strings-test.js'));
function builtName(dir, stem, ext) {
  const found = fs.readdirSync(path.join(ROOT, dir)).filter(f => new RegExp(`^${stem}\\.[0-9a-f]{8}\\.${ext}$`).test(f));
  if (found.length !== 1) { console.error(`FAIL: expected one built ${dir}/${stem}.<hash>.${ext} - run: bash build.sh`); process.exit(1); }
  return path.join(dir, found[0]);
}
const S = require(path.join(ROOT, builtName('js', 'b2b-strings', 'js')));
const DEMO_JS = fs.readFileSync(path.join(ROOT, builtName('js', 'b2b-demo', 'js')), 'utf8');
const EXAMPLE = JSON.parse(/const EXAMPLE = (\[[\s\S]*?\]);/.exec(DEMO_JS)[1].replace(/'/g, '"'));
const DEMO_FEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'b2b/demo/test-store.json'), 'utf8'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const today = new Date();
const dayBack = back => new Date(today.getTime() - back * 86400000).toISOString().slice(0, 10);

/* --- this repository, before ------------------------------------------------ */

const repoStatus = () => execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
function snapshot(dir, skip = ['.git', 'b2b-out']) {
  const out = [];
  const walk = d => {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (skip.includes(path.relative(dir, p))) continue;
      const st = fs.statSync(p);
      if (st.isDirectory()) { out.push(`${path.relative(dir, p)}/`); walk(p); } else out.push(`${path.relative(dir, p)} ${sha(fs.readFileSync(p))}`);
    }
  };
  walk(dir);
  return out.sort().join('\n');
}
const REPO_BEFORE = { status: repoStatus(), out: snapshot(path.join(ROOT, 'b2b-out'), []) };

/* --- throwaway git worlds ---------------------------------------------------- */

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'b2b-kit-test-'));
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
const sh = (cwd, ...args) => execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...args],
  { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const RECORD_HEAD = (() => {
  const lines = fs.readFileSync(path.join(ROOT, rel.DOC), 'utf8').split('\n');
  return lines.slice(0, lines.indexOf(rel.DOC_RULE) + 1).join('\n') + '\n';
})();
const COPY = ['js', 'css', 'b2b/demo', 'privacy/index.html', 'docs/B2B-INTEGRATION.md', '.gitignore'];
let worlds = 0;
/* A world: the files, committed; release 1 built from that commit and
   recorded, committed too. edit(dir) changes the files first. */
function world(edit) {
  const dir = path.join(TMP, `w${++worlds}`);
  for (const p of COPY) fs.cpSync(path.join(ROOT, p), path.join(dir, p), { recursive: true });
  fs.writeFileSync(path.join(dir, rel.DOC), RECORD_HEAD);
  if (edit) edit(dir);
  sh(dir, 'init', '-q');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'the widget');
  const release = rel.build({ version: 1, source: rel.commitSource('HEAD', dir) });
  fs.appendFileSync(path.join(dir, rel.DOC), `${rel.rowOf(release)}\n`);
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'release 1');
  return { dir, release };
}
/* One change to the widget that keeps it as build.sh would leave it: named
   by its new hash. */
function editWidget(dir, from, to) {
  const cur = fs.readdirSync(path.join(dir, 'js')).find(f => /^b2b-widget\.[0-9a-f]{8}\.js$/.test(f));
  const text = fs.readFileSync(path.join(dir, 'js', cur), 'utf8');
  if (!text.includes(from)) throw new Error(`the widget no longer holds: ${from}`);
  const next = text.replace(from, to);
  fs.rmSync(path.join(dir, 'js', cur));
  fs.writeFileSync(path.join(dir, 'js', `b2b-widget.${sha(next).slice(0, 8)}.js`), next);
}
async function run(dir, argv) {
  const out = [], err = [];
  const code = await kit.main(argv, { root: dir, out: l => out.push(l), err: l => err.push(l) });
  return { code, out, err, all: [...out, ...err].join('\n') };
}
const stagingLeft = dir => {
  const found = [];
  const walk = d => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { if (f.startsWith('.compliance-kit-')) found.push(f); const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); } };
  walk(path.join(dir, 'b2b-out'));
  return found;
};
function png(file) {
  const b = fs.readFileSync(file);
  const ok = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && b.toString('latin1', 12, 16) === 'IHDR';
  return ok ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null;
}
/* A section of strings.md: its lines from its "## " heading to the next. */
function section(md, title) {
  const lines = md.split('\n');
  const at = lines.findIndex(l => l.startsWith(`## ${title}`));
  if (at < 0) return [];
  const end = lines.findIndex((l, i) => i > at && l.startsWith('## '));
  return lines.slice(at + 1, end < 0 ? undefined : end);
}
const cellOf = s => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
/* strings.md's section 4: every row of every screen. */
function screenRowsOf(md) {
  const rows = [];
  let screen = null;
  for (const l of md.split('\n')) {
    const h = /^### (\d\d) · /.exec(l);
    if (h) { screen = Number(h[1]); continue; }
    if (l.startsWith('## 5.')) screen = null;
    if (screen && /^\| [0-9]+ \|/.test(l)) { const c = rowCells(l); rows.push({ screen, text: c[1], how: c[2], where: c[3], from: c[4] }); }
  }
  return rows;
}
const rowCells = l => l.slice(1, -1).split(/(?<!\\)\|/).map(c => c.trim());

/* --- the stand-in site: NOSE's live feed and privacy page --------------------- */

const KEY = `npk_${'a'.repeat(64)}`;
const ORIGIN = 'https://shop.example';
const SHOP_FEED = JSON.parse(JSON.stringify(DEMO_FEED));
SHOP_FEED.batches.forEach(b => { b.batch_id = `SHOP-${b.batch_id}`; b.name = `${b.name} (shop)`; });
const site = { got: [], privacy: null };
const siteServer = await new Promise(resolve => {
  const s = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      site.got.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/.netlify/functions/b2b-feed') {
        if (req.method === 'GET' && u.search === `?key=${KEY}` && req.headers.origin === ORIGIN) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': ORIGIN, Vary: 'Origin' });
          res.end(JSON.stringify(SHOP_FEED));
        } else { res.writeHead(403, { 'Cache-Control': 'no-store' }); res.end(); }
        return;
      }
      if (u.pathname === '/privacy/' && site.privacy) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(site.privacy); return; }
      res.writeHead(404); res.end();
    });
  });
  s.listen(0, '127.0.0.1', () => resolve(s));
});
const SITE = `http://127.0.0.1:${siteServer.address().port}`;
const closedPort = await new Promise(resolve => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

/* --- the kit's lists, against the strings file ------------------------------------ */

{
  const keys = [...new Set([...Object.keys(S.default), ...Object.keys(S.florida)])].sort();
  check('the kit\'s WHEN places every string of js/b2b-strings, both variants, and nothing else',
    JSON.stringify(Object.keys(kit.WHEN).sort()) === JSON.stringify(keys), JSON.stringify({ when: Object.keys(kit.WHEN), keys }));
  check('the kit\'s own words, comments included, hold no effect wording', !effectWords(fs.readFileSync(KIT_SRC, 'utf8')).length,
    JSON.stringify(effectWords(fs.readFileSync(KIT_SRC, 'utf8'))));
  check('the kit takes the categories and routes from the catalog format, not a copy of its own',
    /require\('\.\.\/netlify\/functions\/lib\/b2b-catalog-format\.js'\)/.test(fs.readFileSync(KIT_SRC, 'utf8'))
      && !/\[\s*'flower',\s*'pre-roll'/.test(fs.readFileSync(KIT_SRC, 'utf8')));
}

{
  const guide = fs.readFileSync(path.join(ROOT, 'docs/B2B-INTEGRATION.md'), 'utf8');
  const lines = [...guide.matchAll(/^(script-src|style-src|connect-src) +(.+)$/gm)].map(m => m[0].replace(/ +/g, ' '));
  const nose = 'http://127.0.0.1:1';
  const csp = kit.storeCsp(guide, nose).split('; ');
  check('the stand-in store page\'s CSP is the integration guide\'s three lines, NOSE\'s origin for nose-app.com\'s, the store\'s own \'self\' beside the first two',
    lines.length === 3 && csp.length === 3 && csp[0] === lines[0].replace('script-src ', "script-src 'self' ").split('https://nose-app.com').join(nose)
      && csp[1] === lines[1].replace('style-src ', "style-src 'self' ").split('https://nose-app.com').join(nose)
      && csp[2] === lines[2].split('https://nose-app.com').join(nose) && !/unsafe/.test(csp.join(' ')), JSON.stringify({ lines, csp }));
  const page = kit.storePage({ key: KEY, mode: 'rail', name: '"<x>' }, { nose, version: '4', integrity: 'sha384-TEST' });
  const tags = [...page.matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
  check('...and its one script tag the guide\'s: the release\'s address, its integrity hash, crossorigin="anonymous", referrerpolicy="no-referrer", defer',
    tags.length === 1 && tags[0] === `<script src="${nose}/b2b/releases/4/nose-matches.js" integrity="sha384-TEST" crossorigin="anonymous" referrerpolicy="no-referrer" defer>`,
    JSON.stringify(tags));
  check('...the element carrying the attributes as given, a quote and an opening bracket in a value escaped, no style of its own',
    page.includes(`<nose-matches key="${KEY}" mode="rail" name="&quot;&lt;x>"></nose-matches>`) && !/<style|style="/.test(page), page);
}

/* --- A: the test store's kit ---------------------------------------------------- */

const A = world();
const A_BEFORE = snapshot(A.dir);
const a = await run(A.dir, ['--offline']);
const AK = path.join(A.dir, 'b2b-out/test-store/compliance-kit');
check('the test store: the kit is written to b2b-out/test-store/compliance-kit/, exit 0',
  a.code === 0 && a.out[a.out.length - 1] === 'compliance kit written: b2b-out/test-store/compliance-kit/ - 10 screens, ' +
    `${fs.existsSync(AK) ? fs.readdirSync(AK).filter(f => f.endsWith('.png')).length : 0} PNGs, README.md, strings.md, data.md`, a.all);
const IDS = ['consent', 'rail', 'sold-out', 'no-panel', 'vote', 'rail-basis', 'rail-removed', 'vote-answered', 'rail-nothing-yet', 'rail-none-available'];
const SCROLLS = ['rail', 'sold-out', 'no-panel'];
if (fs.existsSync(AK)) {
  const files = fs.readdirSync(AK).sort();
  const pngs = files.filter(f => f.endsWith('.png'));
  check('...holding README.md, strings.md, data.md and PNGs, nothing else',
    files.filter(f => !f.endsWith('.png')).join(' ') === 'README.md data.md strings.md'
      && pngs.every(f => /^(\d\d)-([a-z-]+)-(phone|desktop)(?:-([2-9]|[1-9][0-9]))?\.png$/.test(f)), files.join(' '));
  const parsed = pngs.map(f => { const m = /^(\d\d)-([a-z-]+)-(phone|desktop)(?:-(\d+))?\.png$/.exec(f); return { f, n: Number(m[1]), id: m[2], w: m[3], k: m[4] ? Number(m[4]) : 1 }; });
  check('...a phone and a desktop PNG for each of the ten screens, numbered in order',
    IDS.every((id, i) => ['phone', 'desktop'].every(w => parsed.some(p => p.n === i + 1 && p.id === id && p.w === w && p.k === 1)))
      && parsed.every(p => IDS[p.n - 1] === p.id), JSON.stringify(parsed.map(p => p.f)));
  check('...pages scrolled on only for the rail, the sold-out panel and the batch with no panel, numbered from 2 with no gap',
    parsed.filter(p => p.k > 1).every(p => SCROLLS.includes(p.id))
      && SCROLLS.every(id => ['phone', 'desktop'].every(w => { const ks = parsed.filter(p => p.id === id && p.w === w).map(p => p.k).sort((x, y) => x - y); return ks.every((k, i) => k === i + 1); }))
      && parsed.some(p => p.id === 'rail' && p.w === 'phone' && p.k > 1), JSON.stringify(parsed.filter(p => p.k > 1).map(p => p.f)));
  const dims = parsed.map(p => ({ ...p, d: png(path.join(AK, p.f)) }));
  const widthsOf = w => [...new Set(dims.filter(p => p.w === w).map(p => p.d && p.d.width))];
  check('...every PNG a PNG, at 2x: one width for every phone screen (at most 390 px), one for every desktop screen (at most 1280 px)',
    dims.every(p => p.d && p.d.height > 0) && widthsOf('phone').length === 1 && widthsOf('phone')[0] <= 780
      && widthsOf('desktop').length === 1 && widthsOf('desktop')[0] <= 2560 && widthsOf('desktop')[0] > widthsOf('phone')[0],
    JSON.stringify({ phone: widthsOf('phone'), desktop: widthsOf('desktop') }));

  const readme = fs.readFileSync(path.join(AK, 'README.md'), 'utf8');
  check('README.md: the kit\'s title, release 1 of this world - its commit in full and both recorded hashes - and the Florida words',
    readme.startsWith(`${kit.KIT_TITLE} - the NOSE test store, Florida words\n`) && readme.includes(A.release.commit)
      && readme.includes(A.release.sri.js) && readme.includes(A.release.sri.css) && readme.includes('strings="florida"'));
  const index = section(readme, 'What is in this folder').join('\n');
  check('...its index of the folder names every file in it, and the screens table every PNG',
    files.every(f => index.includes(`\`${f}\``)) && pngs.every(f => section(readme, 'The screens').join('\n').includes(`\`${f}\``)),
    files.filter(f => !index.includes(`\`${f}\``)).join(' '));
  check('...and calls data.md this checkout\'s section, not compared with the published page, under --offline',
    readme.includes('| `data.md` | the privacy page\'s dispensary section, as this checkout deploys it - not compared with the published page (`--offline`) |'));
  const purchaseRows = section(readme, 'What the widget was given').filter(l => /^\| `/.test(l)).map(rowCells);
  check('...the purchases are the demo\'s own example list, in its order, each day counted back from today in UTC',
    purchaseRows.length === EXAMPLE.length && purchaseRows.every((c, i) => c[0] === `\`${EXAMPLE[i][0]}\`` && c[1] === dayBack(EXAMPLE[i][1])),
    JSON.stringify(purchaseRows.slice(0, 3)));
  const reqRows = section(readme, 'What left the page').filter(l => /^\| (GET|POST) /.test(l)).map(rowCells);
  const reqOf = what => reqRows.find(c => c[0].startsWith(what));
  check('...what left the page: the release\'s two files, the feed by the key alone, and the two votes of screen 08 - nothing else',
    reqRows.length === 4 && reqOf('GET /b2b/releases/1/nose-matches.js') && reqOf('GET /b2b/releases/1/nose-matches.css')
      && reqOf('GET /.netlify/functions/b2b-feed?key=npk_0000...') && reqOf('POST /.netlify/functions/b2b-vote')
      && reqOf('POST /.netlify/functions/b2b-vote')[1] === '2' && Number(reqOf('GET /.netlify/functions/b2b-feed')[1]) === 18
      && /^text\/plain, no cookie, no referrer: key npk_0000\.\.\., candidate "D-[0-9]+", score [0-9]+, band "(Strong|Good|Moderate|Low)", palateSize [0-9]+, vote "up"/.test(reqOf('POST')[2]),
    JSON.stringify(reqRows));

  const md = fs.readFileSync(path.join(AK, 'strings.md'), 'utf8');
  const s1 = section(md, '1. ').filter(l => /^\| `/.test(l)).map(rowCells);
  const floridaKeys = Object.entries(S.florida).filter(([, t]) => typeof t === 'string').map(([k]) => k);
  check('strings.md: every Florida string once, in the file\'s order, exactly as written, then the categories and months',
    JSON.stringify(s1.map(c => c[0])) === JSON.stringify([...floridaKeys, 'categories', 'months'].map(k => `\`${k}\``))
      && floridaKeys.every((k, i) => s1[i][1] === cellOf(S.florida[k]).trim()), JSON.stringify(s1.slice(0, 2)));
  const screenRows = screenRowsOf(md);
  check('...a section for each of the ten screens, in order', JSON.stringify([...new Set(screenRows.map(r => r.screen))]) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  check('...every string on every screen traced: the Florida variant, matchBand(), the aroma bar or the catalog, never the default variant',
    screenRows.length > 500 && screenRows.every(r => /^(florida\.[A-Za-z]+|matchBand\(\)|the aroma bar|the catalog)$/.test(r.from)),
    JSON.stringify(screenRows.filter(r => !/^(florida\.[A-Za-z]+|matchBand\(\)|the aroma bar|the catalog)$/.test(r.from)).slice(0, 3)));
  /* The trace checked apart from the kit's own: a Florida string's text holds
     its template's words around its placeholders, in order. */
  const holdsTemplate = (text, t) => {
    const parts = t.split(/\{\w+\}/);
    let at = 0;
    for (const [i, p] of parts.entries()) {
      const lit = cellOf(p);
      const j = text.indexOf(lit, at);
      if (j < 0 || (i === 0 && j !== 0)) return false;
      at = j + lit.length;
    }
    return parts[parts.length - 1] === '' || text.endsWith(cellOf(parts[parts.length - 1]));
  };
  const flRows = screenRows.filter(r => r.from.startsWith('florida.'));
  check('...each Florida-traced string holds its template\'s own words, in order - the kit\'s trace checked apart from it',
    flRows.length > 100 && flRows.every(r => holdsTemplate(r.text, S.florida[r.from.slice(8)])),
    JSON.stringify(flRows.filter(r => !holdsTemplate(r.text, S.florida[r.from.slice(8)])).slice(0, 3)));
  check('...screen 01 holds the two opt-in strings and nothing else',
    JSON.stringify(screenRows.filter(r => r.screen === 1).map(r => [r.text, r.from])) ===
      JSON.stringify([[S.florida.consentButton, 'florida.consentButton'], [S.florida.consentNote, 'florida.consentNote']]));
  const hidden = h => h.startsWith('in the list that line opens');
  const visibleKeys = new Set(screenRows.filter(r => r.from.startsWith('florida.') && !hidden(r.how)).map(r => r.from.slice(8)));
  const notRendered = s1.filter(c => c[2] === '**not rendered with this store**').map(c => c[0].slice(1, -1));
  check('..."not rendered" exactly for the Florida strings no screen showed or read aloud - a closed list counts as neither',
    JSON.stringify(notRendered.sort()) === JSON.stringify(floridaKeys.filter(k => !visibleKeys.has(k)).sort()), JSON.stringify(notRendered));
  const listed = new Map(s1.slice(0, floridaKeys.length).map(c => [c[0].slice(1, -1), c[2]]));
  const shownOn = k => [...new Set(screenRows.filter(r => r.from === `florida.${k}` && !hidden(r.how)).map(r => r.screen))].sort((x, y) => x - y)
    .map(n => String(n).padStart(2, '0')).join(', ') || '**not rendered with this store**';
  check('...each Florida string\'s "Shown in" is exactly the screens where it is seen or read aloud - not one where it sits in a closed list',
    floridaKeys.every(k => listed.get(k) === shownOn(k)), JSON.stringify(floridaKeys.filter(k => listed.get(k) !== shownOn(k)).map(k => [k, listed.get(k), shownOn(k)])));
  check('...with the test store, those are the sold-out panel\'s two messages, THC not listed, and one other order item',
    JSON.stringify(notRendered.sort()) === JSON.stringify(['notUsedOthersOne', 'soldOutNoPanel', 'soldOutNone', 'thcMissing']), JSON.stringify(notRendered));
  check('...the strings in the closed list of screen 02 are said to be there, and shown on screen 06 once it is opened',
    screenRows.some(r => r.screen === 2 && r.from === 'florida.remove' && hidden(r.how))
      && screenRows.some(r => r.screen === 6 && r.from === 'florida.remove' && r.how === 'shown')
      && screenRows.some(r => r.screen === 6 && r.from === 'florida.removeAria' && r.how === 'read aloud, as its label'));
  check('...a removal brings the put-back words (screen 07), an answer the thanks (08), the empty rails their messages (09, 10)',
    screenRows.some(r => r.screen === 7 && r.from === 'florida.removedTitle') && screenRows.some(r => r.screen === 7 && r.from === 'florida.putBack')
      && screenRows.some(r => r.screen === 8 && r.from === 'florida.voteThanks') && screenRows.some(r => r.screen === 9 && r.from === 'florida.railEmpty')
      && screenRows.some(r => r.screen === 9 && r.from === 'florida.basisNone') && screenRows.some(r => r.screen === 10 && r.from === 'florida.railNone'));
  check('...the batch with no terpene panel: its card says so, with no match and no bar, on screen 04',
    screenRows.some(r => r.screen === 4 && r.from === 'florida.noPanel' && /^card [0-9]+: in place of a match and a bar/.test(r.where)));
  const s3 = section(md, '3. ').filter(l => /^\| `/.test(l)).map(rowCells);
  const byBatch = new Map(DEMO_FEED.batches.map(b => [b.batch_id, b]));
  check('...the store\'s words apart: each product shown, named and branded exactly as its catalog line has them',
    s3.length > 10 && s3.every(c => { const b = byBatch.get(c[0].slice(1, -1)); return b && c[1] === cellOf(b.name) && c[2] === cellOf(b.brand || '-'); }),
    JSON.stringify(s3.slice(0, 2)));

  const data = fs.readFileSync(path.join(AK, 'data.md'), 'utf8');
  const html = fs.readFileSync(path.join(A.dir, 'privacy/index.html'), 'utf8');
  const article = html.slice(html.indexOf('id="dispensaries"'), html.indexOf('</article>', html.indexOf('id="dispensaries"')));
  const entity = { rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', amp: '&', nbsp: ' ', hellip: '…', quot: '"' };
  const plain = s => s.replace(/<[^>]+>/g, '').replace(/&([a-z]+);/g, (m, e) => entity[e] || m).replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim();
  const mdPlain = data.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*/g, '').replace(/\\([\\`*[\]<>])/g, '$1').replace(/\s+/g, ' ');
  const paras = [...article.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => plain(m[1]));
  check('data.md: every paragraph of the privacy page\'s dispensary section, word for word, in order',
    paras.length >= 10 && paras.every(p => mdPlain.includes(p)) && paras.every((p, i) => i === 0 || mdPlain.indexOf(p) > mdPlain.indexOf(paras[i - 1])),
    paras.filter(p => !mdPlain.includes(p)).slice(0, 1).join(''));
  const outside = [...html.slice(0, html.indexOf('id="dispensaries"')).matchAll(/<(p|li)>([\s\S]*?)<\/\1>/g), ...html.slice(html.indexOf('</article>', html.indexOf('id="dispensaries"'))).matchAll(/<(p|li)>([\s\S]*?)<\/\1>/g)]
    .map(m => plain(m[2])).filter(t => /dispensar/i.test(t));
  const elsewhere = data.slice(data.indexOf('## Elsewhere on the same page'));
  /* Four since 2026-10-14, under the same three headings: "What changed" gained
     a seventh change, a dispensary's readings keeping the day the lab finished
     (PARSER-HANDOFF s14, "The day the lab finished, in a store's readings"). */
  check('...and every other paragraph or list item of the page that names dispensaries, under its own heading',
    outside.length === 4 && outside.every(t => elsewhere.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*/g, '').replace(/\s+/g, ' ').includes(t))
      && (elsewhere.match(/^### /gm) || []).length === 3, JSON.stringify(outside));
  check('...saying it is this checkout\'s page, not compared with the published one, under --offline',
    /^From `privacy\/index\.html` at NOSE commit `[0-9a-f]{7}`, the page this checkout deploys\. \*\*Not compared with the published page\*\* \(`--offline`\)/m.test(data));
  check('...links as the page writes them', data.includes('[Supabase](https://supabase.com)') && data.includes('(https://nose-app.com/privacy/#dispensaries)'));
  check('...a day in each, never a time of day: README.md, strings.md and data.md',
    [readme, md, data].every(t => !/\b[0-2][0-9]:[0-5][0-9]\b|T[0-2][0-9]:[0-5][0-9]/.test(t)) && readme.includes(`Made ${today.toISOString().slice(0, 10)} (UTC)`));
  check('README.md and strings.md hold no effect wording - the kit\'s words, NOSE\'s strings and the test store\'s names',
    !effectWords(readme).length && !effectWords(md).length, JSON.stringify([...effectWords(readme), ...effectWords(md)]));
}
check('the test store: nothing written in the world outside b2b-out/, which git ignores - its tree unchanged, git status clean',
  snapshot(A.dir) === A_BEFORE && sh(A.dir, 'status', '--porcelain') === '' && !stagingLeft(A.dir).length);

/* --- B: a store's kit, against the stand-in site ---------------------------------- */

site.privacy = fs.readFileSync(path.join(A.dir, 'privacy/index.html'), 'utf8');
const BK = path.join(A.dir, 'b2b-out/test-shop/compliance-kit');
fs.mkdirSync(BK, { recursive: true });
fs.writeFileSync(path.join(BK, 'README.md'), `${kit.KIT_TITLE} - an earlier kit\n`);
fs.writeFileSync(path.join(BK, '99-old-phone.png'), 'not a real png');
site.got.length = 0;
const b = await run(A.dir, ['--store', 'test-shop', '--key', KEY, '--origin', ORIGIN, '--site', SITE]);
check('a store: its kit written to b2b-out/test-shop/compliance-kit/, exit 0',
  b.code === 0 && /^compliance kit written: b2b-out\/test-shop\/compliance-kit\/ - 10 screens, [0-9]+ PNGs, README\.md, strings\.md, data\.md$/.test(b.out[b.out.length - 1] || ''), b.all);
const feedReqs = site.got.filter(r => r.url.startsWith('/.netlify/functions/b2b-feed'));
check('...its feed read once: GET, the public key alone in the address, the store\'s own origin, no cookie, no referrer, no body',
  feedReqs.length === 1 && feedReqs[0].method === 'GET' && feedReqs[0].url === `/.netlify/functions/b2b-feed?key=${KEY}`
    && feedReqs[0].headers.origin === ORIGIN && !feedReqs[0].headers.cookie && !feedReqs[0].headers.referer && feedReqs[0].body === '',
  JSON.stringify(feedReqs.map(r => [r.method, r.url, r.headers.origin])));
check('...and the published privacy page once - nothing else asked of the site',
  site.got.length === 2 && site.got.filter(r => r.method === 'GET' && r.url === '/privacy/').length === 1, JSON.stringify(site.got.map(r => r.url)));
if (fs.existsSync(path.join(BK, 'README.md'))) {
  const readme = fs.readFileSync(path.join(BK, 'README.md'), 'utf8');
  check('...the earlier kit replaced whole: its stale PNG gone', !fs.existsSync(path.join(BK, '99-old-phone.png')) && readme.startsWith(`${kit.KIT_TITLE} - store test-shop, Florida words\n`));
  check('...README.md calls data.md the section as published, once compared', readme.includes('| `data.md` | the privacy page\'s dispensary section, as published |'));
  check('...README.md says whose feed, from where, with which origin, and that the purchases are made up from that list',
    readme.includes(`\`test-shop\`'s public feed, the list every visitor's browser is given, read ${today.toISOString().slice(0, 10)} from ${SITE} with the store's origin ${ORIGIN}`)
      && readme.includes('made up from the store\'s own list by the kit\'s rule'));
  const rows = section(readme, 'What the widget was given').filter(l => /^\| `/.test(l)).map(rowCells).map(c => ({ id: c[0].slice(1, -1), day: c[1] }));
  const shop = new Map(SHOP_FEED.batches.map(x => [x.batch_id, x]));
  const usual = shop.get(rows[0] && rows[0].id);
  check('...the made-up purchases follow the rule: the usual three times, out of stock with a panel, again from before the window; one batch the store never listed; the rest the store\'s own',
    rows.length >= 8 && usual && !usual.in_stock && usual.usable === true && rows.slice(0, 3).every(r => r.id === usual.batch_id)
      && rows[rows.length - 1].id === usual.batch_id && rows[rows.length - 1].day < dayBack(SHOP_FEED.store.window_months * 31)
      && rows.filter(r => !shop.has(r.id)).length === 1 && rows.filter(r => !shop.has(r.id))[0].id === 'NOT-LISTED',
    JSON.stringify(rows));
  check('...a shopper with an order in every category: screen 09 hands over the list less that category\'s orders, and says so',
    /^\| 09 \| A rail with nothing to compare with yet \| .*the purchases less those in [a-z-]+, a shopper with no order there/m.test(readme));
  const data = fs.readFileSync(path.join(BK, 'data.md'), 'utf8');
  check('...data.md compared with the published page, word for word',
    data.includes(`From ${SITE}/privacy/#dispensaries, read ${today.toISOString().slice(0, 10)} (UTC) - word for word the section of \`privacy/index.html\``));
  const md = fs.readFileSync(path.join(BK, 'strings.md'), 'utf8');
  check('...strings.md lists the store\'s own names, and none of the test store\'s', md.includes('(shop)') && !/\| `DB-1[0-9]{3}` \|/.test(md));
  const rows9 = screenRowsOf(md).filter(r => r.screen === 9);
  check('...and screen 09 shows what that shorter list gives: nothing to compare with yet, based on no order',
    rows9.some(r => r.from === 'florida.railEmpty') && rows9.some(r => r.from === 'florida.basisNone') && !rows9.some(r => r.from === 'florida.matchLine'),
    JSON.stringify(rows9.map(r => r.from)));
}

/* --- C: refusals, each writing nothing ------------------------------------------- */

async function refused(name, dir, argv, { code = 1, says, sent = null } = {}) {
  const before = snapshot(dir, ['.git']);
  const asked = site.got.length;
  const r = await run(dir, argv);
  check(`refused: ${name}`, r.code === code && says.test(r.all) && snapshot(dir, ['.git']) === before && !stagingLeft(dir).length
    && (sent === null || site.got.length - asked === sent), `${r.code} ${r.all}`);
  return r;
}
await refused('a secret key, before any request - the kit needs the public one', A.dir,
  ['--store', 'test-shop', '--key', `nsk_${'b'.repeat(64)}`, '--origin', ORIGIN, '--site', SITE], { says: /REFUSED - that is a secret key \(nsk_\)/, sent: 0 });
await refused('--offline with a store: usage', A.dir, ['--store', 'test-shop', '--key', KEY, '--origin', ORIGIN, '--offline'], { code: 2, says: /--offline is for the test store/, sent: 0 });
await refused('an origin that is not one, as a browser sends it: usage', A.dir, ['--store', 'test-shop', '--key', KEY, '--origin', 'https://shop.example/menu'], { code: 2, says: /--origin: an origin as a browser sends it/, sent: 0 });
await refused('a folder outside b2b-out/', A.dir, ['--offline', '--out', 'docs/kit'], { says: /the kit writes only under b2b-out\/, which git ignores - not docs\/kit/ });
fs.mkdirSync(path.join(A.dir, 'b2b-out/foreign/compliance-kit'), { recursive: true });
fs.writeFileSync(path.join(A.dir, 'b2b-out/foreign/compliance-kit/notes.txt'), 'a store\'s own notes');
await refused('a folder holding something that is not an earlier kit - left as it was', A.dir, ['--offline', '--out', 'b2b-out/foreign/compliance-kit'], { says: /already holds something that is not an earlier kit/ });
await refused('a release the record does not hold', A.dir, ['--offline', '--release', '9'], { says: /records no release 9 - it records 1/ });
await refused('a published privacy section that cannot be read - with the --offline hint', A.dir, ['--site', `http://127.0.0.1:${closedPort}`],
  { says: /could not read the published privacy page at http:\/\/127\.0\.0\.1:[0-9]+\/privacy\/ - for the test store, --offline writes data\.md from this checkout and says so/ });
await refused('a feed that refuses the origin (403), nothing written', A.dir, ['--store', 'test-shop', '--key', KEY, '--origin', 'https://other.example', '--site', SITE],
  { says: /the store's feed answered 403: the key is not working, or that origin is not one of the store's/, sent: 1 });
site.privacy = fs.readFileSync(path.join(A.dir, 'privacy/index.html'), 'utf8').replace('Switched on October 9, 2026.', 'Switched on October 10, 2026.');
await refused('a published dispensary section that is not this checkout\'s', A.dir, ['--store', 'test-shop', '--key', KEY, '--origin', ORIGIN, '--site', SITE],
  { says: /the dispensary section published at http:\/\/127\.0\.0\.1:[0-9]+\/privacy\/ is not the one this checkout holds/ });
site.privacy = fs.readFileSync(path.join(A.dir, 'privacy/index.html'), 'utf8');
{
  const W = world();
  const doc = path.join(W.dir, rel.DOC);
  const row = fs.readFileSync(doc, 'utf8').trim().split('\n').pop();
  fs.writeFileSync(doc, fs.readFileSync(doc, 'utf8').replace(row, row.replace(W.release.sri.js, `sha384-${'A'.repeat(64)}`)));
  await refused('a release that does not build to the hashes its record holds', W.dir, ['--offline'], { says: /release 1, built again from [0-9a-f]{7}, does not match docs\/B2B-RELEASES\.md/ });
  fs.writeFileSync(doc, `${RECORD_HEAD}| 1 | ${'0'.repeat(40)} | ${W.release.sri.js} | ${W.release.sri.css} |\n`);
  await refused('a release whose commit is not in the clone - with the fetch to run', W.dir, ['--offline'], { says: /release 1's commit 0000000 is not in this clone - run: git fetch origin main/ });
}
{
  const W = world(dir => fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n'));
  await refused('b2b-out/ not ignored by git', W.dir, ['--offline'], { says: /b2b-out\/ is not ignored by git here/ });
}

/* --- D: a widget that shows the default words; E: a vote that carries more ---------- */

{
  const W = world(dir => editWidget(dir, "_strings() { return this.getAttribute('strings') === 'florida' ? STRINGS.florida : STRINGS.default; }", '_strings() { return STRINGS.default; }'));
  await refused('a widget showing the default words: stopped at the first screen, naming the default string', W.dir, ['--offline'],
    { says: /REFUSED - screen 01: not every string is the Florida variant's[\s\S]*"Sort by flavor using what I've bought here" \(the opt-in button\) - the default variant's consentButton/ });
}
{
  const W = world(dir => editWidget(dir, 'band: v.payload.band, palateSize: v.payload.palateSize, vote });', 'band: v.payload.band, palateSize: v.payload.palateSize, vote, bought: purchases });'));
  await refused('a vote carrying the purchase list beside its six fields', W.dir, ['--offline'], { says: /REFUSED - a vote with fields key, candidate, score, band, palateSize, vote, bought/ });
}

{
  const W = world(dir => editWidget(dir, "const wrap = node('div', 'nm-consent');", "const wrap = node('div', 'nm-consent'); wrap.setAttribute('style', 'outline: 1px solid');"));
  await refused('a widget that breaks the store page\'s CSP - an inline style - shown to be in force', W.dir, ['--offline'],
    { says: /REFUSED - screen 01 \(phone\): the store page's CSP was breached \(style-src-attr\)/ });
}
{
  const W = world(dir => editWidget(dir, 'palateSize: v.payload.palateSize, vote });', "palateSize: v.payload.palateSize, vote: vote + ' ' + purchases.map(p => p.day).join(' ') });"));
  await refused('a vote with its six fields, one carrying the purchase days', W.dir, ['--offline'],
    { says: /REFUSED - a request to NOSE carried a purchase \(\/\.netlify\/functions\/b2b-vote\)/ });
}

/* --- what the kit never loads, and this repository ------------------------------------- */

const loaded = part => loads.some(f => typeof f === 'string' && (f.includes(`${path.sep}node_modules${path.sep}${part}${path.sep}`) || f.endsWith(part)));
check('no database, Blobs, coa.js or archive code loaded by any run: pg, @netlify/blobs, lib/b2b-store.js, lib/archive.js, lib/pdf-store.js, coa.js',
  !loaded('pg') && !loaded(path.join('@netlify', 'blobs')) && !loaded(path.join('lib', 'b2b-store.js')) && !loaded(path.join('lib', 'archive.js'))
    && !loaded(path.join('lib', 'pdf-store.js')) && !loaded(path.join('functions', 'coa.js')));
check('this repository untouched: git status and b2b-out/ as they were', repoStatus() === REPO_BEFORE.status && snapshot(path.join(ROOT, 'b2b-out'), []) === REPO_BEFORE.out);

siteServer.close();
fs.rmSync(TMP, { recursive: true, force: true });
finished = true;
console.log(failures ? `b2b-compliance-kit: ${failures} failure${failures === 1 ? '' : 's'}` : 'b2b-compliance-kit clean');
process.exitCode = failures ? 1 : 0;

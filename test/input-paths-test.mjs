#!/usr/bin/env node
/* NOSE - the app's ways in, used in a real browser: Scan QR, COA link, Upload.
 *
 *   node test/input-paths-test.mjs        expect: input-paths clean
 *
 * Headless Chromium opens /app from a local copy of the site, served with the
 * headers in _headers (CSP included), and uses each input path the way a
 * person does. POST /.netlify/functions/coa never leaves the machine: the
 * browser's request goes to the REAL handler, netlify/functions/coa.js, and
 * the REAL parser. Only the two steps that need the outside world are stood
 * in for - the download of the PDF, and unpdf, which here returns the
 * fixture's extracted text (test/fixtures/extracted). So every card is filled
 * by a real parser output, in the exact reply the handler sends. The build
 * stamp is pinned to 'dev' and no database address is set, so the archive is
 * never reached.
 *
 * What it pins down:
 *   - Scan QR, by camera (Chromium's fake camera, showing
 *     test/fixtures/qr/coa-link.png) and by "Choose QR image": the
 *     confirmation card shows in the Scan QR panel, values in value order
 *   - COA link: "Read report" shows the same card in the COA link panel.
 *     Until 2026-09-23 the card sat inside the Scan QR panel, which that tab
 *     hides: the message said "Check the values below, then add the jar."
 *     and nothing was below (PARSER-HANDOFF s13)
 *   - on both paths, the warnings line (MCL-FLW-002's 103.8%) and the novelty
 *     line show when the reply carries them and not otherwise; KAY-CAR-001
 *     shows its 4.124; "Use this jar" and "Discard" do what they say. The
 *     novelty line is shown on ACS-FLW-002 with one column heading added that
 *     no fixture prints: ACS-FLW-002 itself carries no novelty since
 *     2026-09-24 - its layout is known, and the handler's reply for it says so
 *     (PARSER-HANDOFF s7)
 *   - the card hides with its tab, and moves to the panel of the next request
 *   - a refused report shows its reasons and no card
 *   - on flower, the card's Water activity row says whether the value sits
 *     inside ASTM D8197's 0.55-0.65 for dried flower, edges inside, and its
 *     Moisture row gives the value with no verdict; each says "no number on
 *     this report" without one. Below (KAY-PRR-001, 0.54), inside (KAY-FLW-002,
 *     0.583), the 0.55 edge (ACS-PRR-001), the 0.65 edge and above
 *     (KAY-FLW-002's reply set to 0.65 and 0.68 - no fixture prints either)
 *     and Pass only (MCL-FLW-001). Since 2026-10-14;
 *     INPUT_PATHS_SHOTS=<folder> saves each card as a picture
 *   - the row after Batch: "Harvested" and the harvest day with how long ago
 *     (KAY-FLW-001), else "Report dated" (TerpLife_GrpeBblGm_flower), else no
 *     row (MCL-FLW-001); the note under it; every other row as before; today,
 *     yesterday and the person's tomorrow, on a frozen clock in New York's
 *     time zone. Since 2026-10-14
 *   - Upload: the tab and the message after choosing a file say plainly that
 *     reading an uploaded file isn't available yet and point to Scan QR, COA
 *     link and Manual; the page makes no request, so the file goes nowhere
 *   - no uncaught error on the page
 *
 * coa-link.png encodes https://lab.example/coa/input-paths-test.pdf (a
 * reserved example domain; nothing is fetched from it). It was drawn once with
 * libqrencode - error correction L, 8 pixels a module - and read back with
 * zbar; the test checks that the scanner reads that address from it. Redraw it
 * the same way: the same address drawn at level M, 8 pixels a module, is one
 * html5-qrcode 2.3.8 does not read, by camera or from a file.
 *
 * Needs test/fixtures/extracted (node test/extract-dump.js), and Playwright
 * with its Chromium, which are not project dependencies. In a Codespace:
 *     npm install --no-save playwright
 *     npx playwright install --with-deps chromium
 * `npm ci` removes Playwright again; install it again after one.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FN = path.join(ROOT, 'netlify/functions');
const EXTRACTED = path.join(ROOT, 'test/fixtures/extracted');
const QR_PNG = path.join(ROOT, 'test/fixtures/qr/coa-link.png');
const QR_URL = 'https://lab.example/coa/input-paths-test.pdf';
const LINK_URL = 'https://lab.example/coa/pasted-link.pdf';
/* An accepted fixture carries no novelty (test/novelty-test.js fails if one
   does), so the novelty case is a real report with one line added inside its
   terpene section, as novelty-test adds one: a column heading no fixture
   prints. Nothing else about the reading moves - checked below. */
const NOVEL_BASE = 'ACS-FLW-002';
const UNSEEN_HEADING = 'Conc. (ug/g)';
const FIXTURES = { plain: 'KAY-CAR-001', warned: 'MCL-FLW-002', novel: `${NOVEL_BASE} + "${UNSEEN_HEADING}"`,
  refused: 'GreenRoadsFullSpectrumCBDOil750mgLot24007' };
/* Water activity against ASTM D8197's 0.55-0.65 for dried flower, and moisture
   as printed with no verdict (PARSER-HANDOFF s13). Real flower reports below,
   inside and on the 0.55 edge, and one that prints only Pass for both. No
   fixture prints a water activity of 0.65 or above, so those two cases are
   KAY-FLW-002's real reply with only waterActivity changed. Each row's text
   is written out;
   the card puts a word joiner (U+2060) after the en dash, so the range never
   breaks across two lines. */
const RANGE = 'ASTM D8197\'s 0.55–\u20600.65 range for dried flower';
const NO_NUMBER = 'no number on this report';
const FRESHNESS = [
  { name: 'KAY-PRR-001', fixture: 'KAY-PRR-001', aw: 0.54, moisture: '12%', water: `0.54 — below ${RANGE}` },
  { name: 'KAY-FLW-002', fixture: 'KAY-FLW-002', aw: 0.583, moisture: '14.97%', water: `0.583 — inside ${RANGE}` },
  { name: 'ACS-PRR-001', fixture: 'ACS-PRR-001', aw: 0.55, moisture: '10%', water: `0.55 — inside ${RANGE}` },
  { name: 'KAY-FLW-002 at 0.65', fixture: 'KAY-FLW-002', aw: 0.583, set: { waterActivity: 0.65 }, moisture: '14.97%', water: `0.65 — inside ${RANGE}` },
  { name: 'KAY-FLW-002 at 0.68', fixture: 'KAY-FLW-002', aw: 0.583, set: { waterActivity: 0.68 }, moisture: '14.97%', water: `0.68 — above ${RANGE}` },
  { name: 'MCL-FLW-001', fixture: 'MCL-FLW-001', aw: null, moisture: NO_NUMBER, water: NO_NUMBER }
];
/* INPUT_PATHS_SHOTS=<folder> saves a picture of the card for each of these;
   unset, the test writes nothing. */
const SHOTS = process.env.INPUT_PATHS_SHOTS || '';
/* When the jar was harvested, or else when its report is dated, and how long
   ago (PARSER-HANDOFF s13, "Harvest date and age on the card"). The page's
   clock is frozen at 02:30 UTC on 2026-10-15 - 22:30 on 2026-10-14 in New
   York, the context's time zone - so every age counts from 2026-10-14, the
   person's own today; a count from the UTC day would be one more. Playwright's
   clock API, clock.setFixedTime() (https://playwright.dev/docs/clock and
   https://playwright.dev/docs/api/class-clock, added in v1.45, read
   2026-10-14): Date.now() and new Date() return that time, and timers keep
   running. The context's time zone is timezoneId
   (https://playwright.dev/docs/emulation, read 2026-10-14). Three real
   reports: one with a harvest day, one with only a report day, one with
   neither. Then KAY-FLW-001's real reply with one field set: a report day as
   well (the harvest day still wins), harvested today, yesterday, and on the
   UTC today, which is the person's tomorrow (the date alone). Each row's text
   is written out. */
const FROZEN = '2026-10-15T02:30:00Z';
const TIME_ZONE = 'America/New_York';
const AGE_NOTE = 'A report describes the jar on test day. Terpenes keep evaporating after that, so an older jar can smell quieter than its numbers.';
const DATED = [
  { name: 'KAY-FLW-001', fixture: 'KAY-FLW-001', harvestOn: '2026-01-27', reportOn: null,
    row: ['Harvested', 'Jan 27, 2026 · 260 days ago'], moisture: '13.8%', water: `0.56 — inside ${RANGE}` },
  { name: 'TerpLife_GrpeBblGm_flower', fixture: 'TerpLife_GrpeBblGm_flower', harvestOn: null, reportOn: '2025-11-17',
    row: ['Report dated', 'Nov 17, 2025 · 331 days ago'], moisture: NO_NUMBER, water: `0.49 — below ${RANGE}` },
  { name: 'MCL-FLW-001, no date', fixture: 'MCL-FLW-001', harvestOn: null, reportOn: null,
    row: null, moisture: NO_NUMBER, water: NO_NUMBER },
  { name: 'KAY-FLW-001 with a report day too', fixture: 'KAY-FLW-001', set: { reportOn: '2026-02-03' },
    row: ['Harvested', 'Jan 27, 2026 · 260 days ago'] },
  { name: 'KAY-FLW-001 harvested today', fixture: 'KAY-FLW-001', set: { harvestOn: '2026-10-14' },
    row: ['Harvested', 'Oct 14, 2026 · today'] },
  { name: 'KAY-FLW-001 harvested yesterday', fixture: 'KAY-FLW-001', set: { harvestOn: '2026-10-13' },
    row: ['Harvested', 'Oct 13, 2026 · 1 day ago'] },
  { name: 'KAY-FLW-001 harvested on the UTC today', fixture: 'KAY-FLW-001', set: { harvestOn: '2026-10-15' },
    row: ['Harvested', 'Oct 15, 2026'] }
];
const FILES = [FIXTURES.plain, FIXTURES.warned, NOVEL_BASE, FIXTURES.refused,
  ...new Set([...FRESHNESS, ...DATED].map(c => c.fixture))];
/* The card's one novelty sentence, as js/nose.*.js publishes it (s7). */
const NOVELTY_LINE = 'NOSE hasn\'t seen this lab\'s layout before — check the top three against the report.';

/* A run that stops on a promise nothing keeps alive exits 0 quietly.
 * Only reaching the end counts. */
let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) {
    process.stderr.write('input-paths: stopped before the last check - NOT clean\n');
    process.exitCode = 1;
  }
});

let failures = 0;
function check(name, ok, detail) {
  if (ok) { console.log(`ok    ${name}`); return; }
  failures++;
  console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ''}`);
}

/* --- what the test needs before it can say anything ----------------------- */

function loadPlaywright() {
  for (const id of ['playwright', '@playwright/test']) {
    try { return require(id); } catch {}
  }
  try {   // npm install -g playwright
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return require(path.join(root, 'playwright'));
  } catch {}
  return null;
}

const playwright = loadPlaywright();
if (!playwright) {
  console.error('FAIL: Playwright is not installed - run: npm install --no-save playwright && npx playwright install --with-deps chromium');
  process.exit(1);
}
for (const id of FILES) {
  if (!fs.existsSync(path.join(EXTRACTED, `${id}.txt`))) {
    console.error(`FAIL: ${path.relative(ROOT, EXTRACTED)}/${id}.txt is missing - run: node test/extract-dump.js`);
    process.exit(1);
  }
}

/* --- the real handler, in this process ------------------------------------ */

delete process.env.NOSE_DB_URL;
delete process.env.NOSE_DB_ADMIN_URL;
const Module = require('module');
function install(file, exports) {
  const m = new Module(file);
  m.filename = file;
  m.loaded = true;
  m.exports = exports;
  require.cache[file] = m;
}
let fixtureText = '';
install(path.join(FN, 'lib/extract-text.js'), {
  extractCoaText: async () => ({ text: fixtureText, pages: 1 }),
  itemsToLines: () => { throw new Error('not used by the handler'); }
});
require(path.join(FN, 'lib/version.js')).pin({ parserVersion: 'dev', extractorVersion: 'dev', deployContext: 'dev' });
const coa = require(path.join(FN, 'coa.js'));
const { _novelty: NOVELTY } = require(path.join(FN, 'lib/parse-coa.js'));
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1024, 0x20)]);

/* A fixture's extracted text; for the novelty case, NOVEL_BASE's with the
   unseen heading after the line that opens its first terpene section. */
function textOf(fixture) {
  if (fixture !== FIXTURES.novel) return fs.readFileSync(path.join(EXTRACTED, `${fixture}.txt`), 'utf8');
  const lines = fs.readFileSync(path.join(EXTRACTED, `${NOVEL_BASE}.txt`), 'utf8').split('\n');
  const at = lines.findIndex(l => NOVELTY.NOVELTY_SECTION_OPEN.test(l.trim()));
  if (at < 0) throw new Error(`${NOVEL_BASE} has no terpene section to add a heading to`);
  return [...lines.slice(0, at + 1), UNSEEN_HEADING, ...lines.slice(at + 1)].join('\n');
}

/* The handler's reply to `body`, the report being the fixture's text. Only
   the PDF download is replaced, and only while the handler runs. */
async function handlerReply(fixture, body) {
  fixtureText = textOf(fixture);
  const saved = globalThis.fetch;
  globalThis.fetch = async () => new Response(PDF, { status: 200, headers: { 'content-type': 'application/pdf' } });
  try { return await coa.handler({ httpMethod: 'POST', body, headers: {} }); }
  finally { globalThis.fetch = saved; }
}

/* The fixtures carry what the checks below rely on - or the checks would
   pass without testing anything. */
{
  const body = JSON.stringify({ url: LINK_URL });
  const r = {};
  for (const [k, id] of [...Object.entries(FIXTURES), ['base', NOVEL_BASE]]) {
    const reply = await handlerReply(id, body);
    r[k] = { status: reply.statusCode, data: JSON.parse(reply.body) };
  }
  check(`the handler reads ${FIXTURES.plain}: 4.124, no warning, no novelty`,
    r.plain.status === 200 && r.plain.data.totalTerpenes === 4.124 && !r.plain.data.warnings.length && !r.plain.data.novelty.length,
    JSON.stringify(r.plain.data).slice(0, 200));
  check(`the handler reads ${FIXTURES.warned} with a warning and no novelty`,
    r.warned.status === 200 && r.warned.data.warnings.length > 0 && !r.warned.data.novelty.length);
  check(`the handler reads ${NOVEL_BASE} with no novelty, nothing unmapped and no warning - a known layout`,
    r.base.status === 200 && r.base.data.usable === true && !r.base.data.novelty.length && !r.base.data.unmapped.length
      && !r.base.data.warnings.length,
    JSON.stringify({ novelty: r.base.data.novelty, unmapped: r.base.data.unmapped, warnings: r.base.data.warnings }));
  check(`the handler reads ${FIXTURES.novel} with that heading as its one novelty note, and ${NOVEL_BASE}'s values`,
    r.novel.status === 200 && r.novel.data.usable === true && !r.novel.data.warnings.length
      && JSON.stringify(r.novel.data.novelty) === JSON.stringify([`heading not known: "${UNSEEN_HEADING}"`])
      && r.novel.data.totalTerpenes === r.base.data.totalTerpenes
      && JSON.stringify(r.novel.data.terps) === JSON.stringify(r.base.data.terps),
    JSON.stringify({ novelty: r.novel.data.novelty, totalTerpenes: r.novel.data.totalTerpenes }));
  check(`the handler refuses ${FIXTURES.refused}, with reasons`,
    r.refused.status === 422 && Array.isArray(r.refused.data.reasons) && r.refused.data.reasons.length > 0);
  for (const c of FRESHNESS) {
    if (c.set) continue;
    const reply = await handlerReply(c.fixture, body);
    const data = JSON.parse(reply.body);
    check(`the handler reads ${c.fixture} as flower, water activity ${c.aw === null ? 'none' : c.aw}`,
      reply.statusCode === 200 && data.usable === true && data.freshnessApplies === true && data.waterActivity === c.aw,
      JSON.stringify({ status: reply.statusCode, freshnessApplies: data.freshnessApplies, waterActivity: data.waterActivity, moisture: data.moisture }));
  }
  for (const c of DATED) {
    if (c.set) continue;
    const reply = await handlerReply(c.fixture, body);
    const data = JSON.parse(reply.body);
    check(`the handler's reply for ${c.fixture} carries harvestOn ${c.harvestOn} and reportOn ${c.reportOn}`,
      reply.statusCode === 200 && data.usable === true && data.harvestOn === c.harvestOn && data.reportOn === c.reportOn,
      JSON.stringify({ status: reply.statusCode, harvestOn: data.harvestOn, reportOn: data.reportOn }));
  }
}

/* --- the site, served as Netlify serves it -------------------------------- */

function siteHeaders() {
  const out = {};
  let all = false;
  for (const line of fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').split('\n')) {
    if (/^\S/.test(line)) { all = line.trim() === '/*'; continue; }
    const m = /^\s+([^:\s][^:]*):\s*(.*)$/.exec(line);
    if (all && m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}
const HEADERS = siteHeaders();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.json': 'application/json', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8' };
const SOURCE_ONLY = /^\/(netlify|node_modules|docs|test|scripts|supabase|wip)\//;   // 404! in _redirects

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (p === '/app' || p === '/app/') p = '/app.html';            // _redirects: 200 rewrite
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  const ok = (req.method === 'GET' || req.method === 'HEAD') && file.startsWith(ROOT + path.sep)
    && !SOURCE_ONLY.test(p) && fs.existsSync(file) && fs.statSync(file).isFile();
  if (!ok) { res.writeHead(404, HEADERS); res.end(); return; }
  res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* --- a camera that sees the QR code --------------------------------------- */

/* coa-link.png as grey pixels (8-bit greyscale, not interlaced). */
function greyPixels(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, width = 0, height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 0 || data[12] !== 0) throw new Error('coa-link.png must be 8-bit greyscale, not interlaced');
    }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (width + 1)];
    for (let x = 0; x < width; x++) {
      const a = x ? px[y * width + x - 1] : 0, b = y ? px[(y - 1) * width + x] : 0;
      const c = x && y ? px[(y - 1) * width + x - 1] : 0;
      let v = raw[y * (width + 1) + 1 + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * width + x] = v & 255;
    }
  }
  return { width, height, px };
}

/* One 640x480 frame, the code in the middle, as a Y4M file: Chromium's fake
   camera plays it in a loop. */
function writeCameraFile(file, { width, height, px }) {
  const W = 640, H = 480;
  const luma = Buffer.alloc(W * H, 255);
  const ox = (W - width) >> 1, oy = (H - height) >> 1;
  for (let y = 0; y < height; y++) px.copy(luma, (oy + y) * W + ox, y * width, (y + 1) * width);
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\nFRAME\n`), luma, chroma, chroma]));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nose-input-paths-'));
const camera = path.join(tmp, 'qr.y4m');
writeCameraFile(camera, greyPixels(QR_PNG));

/* --- the browser ----------------------------------------------------------- */

const browser = await playwright.chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${camera}`]
});
const pageErrors = [];
const sent = [];        // the url each POST to the handler carried
const queue = [];       // the fixture the next POST reads
let last = null;        // the handler's last reply: { fixture, data }

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: TIME_ZONE });
  await context.grantPermissions(['camera'], { origin: BASE });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.route('**/.netlify/functions/coa', async route => {
    const body = route.request().postData() || '';
    let url = null;
    try { url = JSON.parse(body).url; } catch {}
    sent.push(url);
    const next = queue.shift();
    if (!next) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"input-paths-test: no reply was expected"}' });
      return;
    }
    /* A name is a fixture; a freshness case may also change fields of its
       real reply ({ name, fixture, set }). */
    const fixture = typeof next === 'string' ? next : next.fixture;
    const reply = await handlerReply(fixture, body);
    const data = JSON.parse(reply.body);
    if (typeof next !== 'string' && next.set) Object.assign(data, next.set);
    const sentBody = typeof next !== 'string' && next.set ? JSON.stringify(data) : reply.body;
    last = { fixture: typeof next === 'string' ? next : next.name, data };
    await route.fulfill({ status: reply.statusCode, headers: reply.headers, body: sentBody });
  });

  const text = async sel => ((await page.locator(sel).textContent()) || '').trim();
  const visible = sel => page.isVisible(sel);
  const panelOf = () => page.evaluate(() => {
    const card = document.getElementById('coaConfirm');
    const panel = card && card.closest('[role="tabpanel"]');
    return panel ? `#${panel.id}${panel.hidden ? ' (hidden)' : ''}` : 'no panel';
  });
  async function messageMatches(id, re, timeout = 10000) {
    try {
      await page.waitForFunction(([id, src]) => {
        const n = document.getElementById(id);
        return !!n && !n.hidden && new RegExp(src).test(n.textContent.trim());
      }, [id, re.source], { timeout });
      return true;
    } catch { return false; }
  }
  const READ = /read\. Check the values below, then add the jar\.$/;

  /* The card after a usable reply: where it is, what it says, and the lines
     that depend on the reply. */
  async function cardChecks(where, panelId, messageId, fixture) {
    if (!last || last.fixture !== fixture) {
      check(`${where}: the handler's reply for ${fixture} reached the page`, false,
        `the message says "${await text(`#${messageId}`)}"; requests so far ${JSON.stringify(sent)}`);
      return false;
    }
    const data = last.data;
    const shown = await page.waitForSelector('#coaConfirm', { state: 'visible', timeout: 3000 }).then(() => true, () => false);
    check(`${where}: the card is visible after ${fixture} is read`, shown,
      shown ? '' : `the message says "${await text(`#${messageId}`)}", and the card is in ${await panelOf()}`);
    check(`${where}: the card is in the panel with the message`, (await panelOf()) === `#${panelId}`, `found in ${await panelOf()}`);
    check(`${where}: the message is "${data.lab} read. Check the values below, then add the jar."`,
      (await text(`#${messageId}`)) === `${data.lab} read. Check the values below, then add the jar.`);

    const known = await page.evaluate(() => Object.keys(window.NoseMatch.TERPENES));
    const want = Object.entries(data.terps).filter(([k]) => known.includes(k)).sort((a, b) => b[1] - a[1]);
    const rows = await page.$$eval('#coaConfirmRows input[data-key]', ins => ins.map(i => [i.dataset.key, Number(i.value)]));
    check(`${where}: the card lists ${want.length} rows, the report's values, highest first`,
      JSON.stringify(rows) === JSON.stringify(want), `rows ${JSON.stringify(rows)}\n      want ${JSON.stringify(want)}`);
    const total = await page.evaluate(() => {
      const dt = [...document.querySelectorAll('#coaConfirmMeta dt')].find(d => d.textContent === 'Total terpenes');
      return dt && dt.nextElementSibling ? dt.nextElementSibling.textContent : null;
    });
    check(`${where}: the card gives total terpenes as ${data.totalTerpenes}%`,
      total === `${data.totalTerpenes}% — intensity, not shape`, `it gives ${JSON.stringify(total)}`);

    const warned = await visible('#coaConfirmWarnings');
    if (data.warnings.length) {
      check(`${where}: the warnings line shows ${fixture}'s warning`,
        warned && (await text('#coaConfirmWarnings')) === data.warnings.join(' '));
    } else {
      check(`${where}: no warnings line for ${fixture}, which has none`, !warned);
    }
    const novel = await visible('#coaConfirmNovelty');
    if (data.usable === true && data.novelty.length) {
      check(`${where}: the novelty line shows for ${fixture}`, novel && (await text('#coaConfirmNovelty')) === NOVELTY_LINE);
    } else {
      check(`${where}: no novelty line for ${fixture}, which has none`, !novel);
    }
    return shown;
  }

  async function useJar(where, messageId, name) {
    if (!await visible('#coaConfirmAccept')) {
      check(`${where}: "Use this jar" adds the jar`, false, 'the button is not visible');
      return;
    }
    await page.fill('#coaConfirmName', name);
    await page.click('#coaConfirmAccept');
    const said = await messageMatches(messageId, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} was added and saved in this browser\\.$`));
    const saved = await page.$$eval('#savedPalateList .saved-item-name', ns => ns.map(n => n.textContent));
    check(`${where}: "Use this jar" adds the jar and closes the card`, said && saved.includes(name) && !(await visible('#coaConfirm')),
      `message "${await text(`#${messageId}`)}", saved ${JSON.stringify(saved)}`);
  }

  async function discard(where, messageId) {
    if (!await visible('#coaConfirmCancel')) {
      check(`${where}: "Discard" closes the card`, false, 'the button is not visible');
      return;
    }
    await page.click('#coaConfirmCancel');
    const said = await messageMatches(messageId, /^Discarded\. Nothing was added to your palate\.$/);
    check(`${where}: "Discard" closes the card and adds nothing`, said && !(await visible('#coaConfirm')));
  }

  await page.goto(`${BASE}/app`);
  await page.click('.ag-yes');                 // the age gate, answered as a person answers it
  await page.waitForSelector('#palateSamples .sample-chip');

  /* ---- Scan QR, by camera ------------------------------------------------ */
  queue.push(FIXTURES.plain);
  await page.click('#scanTab');                // starts the camera; the fake one shows the code
  check('Scan QR (camera): the code is read and its address sent',
    await messageMatches('scannerMessage', READ, 20000) && sent.at(-1) === QR_URL,
    `message "${await text('#scannerMessage')}", sent ${JSON.stringify(sent)}`);
  await cardChecks('Scan QR (camera)', 'scanPanel', 'scannerMessage', FIXTURES.plain);
  await useJar('Scan QR (camera)', 'scannerMessage', 'Input paths camera jar');

  /* ---- Scan QR, by "Choose QR image" ------------------------------------- */
  queue.push(FIXTURES.warned);
  await page.setInputFiles('#qrImageFile', QR_PNG);
  check('Scan QR (image): the code is read and its address sent',
    await messageMatches('scannerMessage', READ) && sent.at(-1) === QR_URL,
    `message "${await text('#scannerMessage')}", sent ${JSON.stringify(sent)}`);
  await cardChecks('Scan QR (image)', 'scanPanel', 'scannerMessage', FIXTURES.warned);
  await discard('Scan QR (image)', 'scannerMessage');

  queue.push(FIXTURES.novel);
  await page.setInputFiles('#qrImageFile', QR_PNG);
  await messageMatches('scannerMessage', READ);
  await cardChecks('Scan QR (image)', 'scanPanel', 'scannerMessage', FIXTURES.novel);
  await useJar('Scan QR (image)', 'scannerMessage', 'Input paths image jar');

  /* ---- COA link ------------------------------------------------------------ */
  async function readLink(fixture) {
    queue.push(fixture);
    await page.fill('#coaUrl', LINK_URL);
    await page.click('#validateUrlButton');
  }
  await page.click('#urlTab');
  await readLink(FIXTURES.plain);
  check('COA link: the link is read and sent', await messageMatches('urlMessage', READ) && sent.at(-1) === LINK_URL,
    `message "${await text('#urlMessage')}", sent ${JSON.stringify(sent.at(-1))}`);
  const linkShown = await cardChecks('COA link', 'urlPanel', 'urlMessage', FIXTURES.plain);

  await page.click('#sampleTab');
  const away = await visible('#coaConfirm');
  await page.click('#urlTab');
  const back = await visible('#coaConfirm');
  check('COA link: the card hides with its tab, and is there again on return', linkShown && !away && back,
    `visible: before ${linkShown}, on Samples ${away}, back on COA link ${back}`);
  await useJar('COA link', 'urlMessage', 'Input paths link jar');

  await readLink(FIXTURES.warned);
  await messageMatches('urlMessage', READ);
  await cardChecks('COA link', 'urlPanel', 'urlMessage', FIXTURES.warned);
  await discard('COA link', 'urlMessage');

  await readLink(FIXTURES.novel);
  await messageMatches('urlMessage', READ);
  await cardChecks('COA link', 'urlPanel', 'urlMessage', FIXTURES.novel);

  /* ---- the card follows the next request ---------------------------------- */
  queue.push(FIXTURES.plain);
  await page.click('#scanTab');                // the camera reads the code again
  await messageMatches('scannerMessage', READ, 20000);
  const moved = await page.waitForSelector('#coaConfirm', { state: 'visible', timeout: 3000 }).then(() => true, () => false);
  check('Scan QR after COA link: the new card shows in the Scan QR panel',
    moved && (await panelOf()) === '#scanPanel', `card in ${await panelOf()}`);
  check('...and the COA link panel no longer holds it',
    await page.evaluate(() => !document.getElementById('urlPanel').contains(document.getElementById('coaConfirm'))));

  /* ---- a refused report ---------------------------------------------------- */
  await page.click('#urlTab');
  await readLink(FIXTURES.refused);
  const refused = await messageMatches('urlMessage', /^That report could not be read reliably\. /);
  const reasons = last && last.fixture === FIXTURES.refused && Array.isArray(last.data.reasons) ? last.data.reasons : [];
  check('COA link: a refused report shows its reasons and no card',
    refused && reasons.length > 0 && (await text('#urlMessage')).includes(reasons[0]) && !(await visible('#coaConfirm')),
    `message "${await text('#urlMessage')}"`);

  /* ---- moisture and water activity, on flower ------------------------------ */
  const metaRow = label => page.evaluate(label => {
    const dts = [...document.querySelectorAll('#coaConfirmMeta dt')].filter(d => d.textContent === label);
    return dts.length === 1 && dts[0].nextElementSibling ? dts[0].nextElementSibling.textContent : `${dts.length} rows`;
  }, label);
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  /* the card from its title to the line above "Jar name", scrolled clear of
     the sticky site header - twice, as the header changes on scroll */
  async function shoot(name) {
    const settle = () => page.evaluate(() => {
      const card = document.getElementById('coaConfirm');
      const header = document.querySelector('.site-header');
      window.scrollBy({ top: card.getBoundingClientRect().top - (header ? header.getBoundingClientRect().bottom : 0) - 16, behavior: 'instant' });
    });
    for (let i = 0; i < 2; i++) { await settle(); await page.waitForTimeout(500); }
    const clip = await page.evaluate(() => {
      const top = document.getElementById('coaConfirm').getBoundingClientRect();
      const end = document.querySelector('label[for="coaConfirmName"]').getBoundingClientRect();
      return { x: top.left, y: top.top, width: top.width, height: end.top - top.top };
    });
    await page.screenshot({ path: path.join(SHOTS, `${name.replace(/[^A-Za-z0-9.-]+/g, '-')}.png`), clip });
  }
  for (const c of FRESHNESS) {
    await readLink(c);
    await messageMatches('urlMessage', READ);
    const shown = await cardChecks(`COA link, ${c.name}`, 'urlPanel', 'urlMessage', c.name);
    const moisture = await metaRow('Moisture');
    check(`COA link, ${c.name}: Moisture reads "${c.moisture}"`, shown && moisture === c.moisture, `it reads ${JSON.stringify(moisture)}`);
    const water = await metaRow('Water activity');
    check(`COA link, ${c.name}: Water activity reads "${c.water}"`, shown && water === c.water, `it reads ${JSON.stringify(water)}`);
    if (SHOTS && shown) await shoot(c.name);
    await discard(`COA link, ${c.name}`, 'urlMessage');
  }

  /* ---- the harvest or report day, and how long ago ------------------------- */
  await page.clock.setFixedTime(FROZEN);
  check(`the page's clock reads ${FROZEN}, and its today is 2026-10-14 in ${TIME_ZONE}`,
    JSON.stringify(await page.evaluate(() => { const d = new Date(); return [d.toISOString(), d.getFullYear(), d.getMonth() + 1, d.getDate()]; })),
    JSON.stringify(['2026-10-15T02:30:00.000Z', 2026, 10, 14]));
  /* every row of the card, in order: its label, its value - the date row's
     value without the note under it - and whether a note is in it */
  const allRows = () => page.evaluate(() => [...document.querySelectorAll('#coaConfirmMeta dt')].map(dt => {
    const dd = dt.nextElementSibling;
    const note = dd && dd.querySelector('#coaConfirmAgeNote');
    return [dt.textContent, dd ? (note ? dd.firstChild.nodeValue : dd.textContent) : null, note ? note.textContent : null];
  }));
  for (const c of DATED) {
    await readLink(c);
    await messageMatches('urlMessage', READ);
    const shown = await cardChecks(`COA link, ${c.name}`, 'urlPanel', 'urlMessage', c.name);
    const data = last && last.data;
    const want = [['Strain as printed', data.strain || 'not stated', null], ['Batch', data.batch || 'not stated', null],
      ...(c.row ? [[...c.row, AGE_NOTE]] : []),
      ['Lab ID', data.labId || 'not stated', null], ['Product', data.productClass || 'unknown', null],
      ['Total terpenes', `${data.totalTerpenes}% — intensity, not shape`, null]];
    if (c.moisture) want.push(['Moisture', c.moisture, null], ['Water activity', c.water, null]);
    const rows = await allRows();
    if (c.row) {
      check(`COA link, ${c.name}: "${c.row[0]}" reads "${c.row[1]}", straight after Batch, with the note under it`,
        shown && JSON.stringify(rows.find(r => r[0] === c.row[0])) === JSON.stringify([...c.row, AGE_NOTE])
          && rows.findIndex(r => r[0] === c.row[0]) === rows.findIndex(r => r[0] === 'Batch') + 1,
        `rows ${JSON.stringify(rows)}`);
    } else {
      check(`COA link, ${c.name}: no date row and no note`,
        shown && !rows.some(r => ['Harvested', 'Report dated', 'Tested'].includes(r[0]) || r[2] !== null)
          && !(await page.$('#coaConfirmAgeNote')), `rows ${JSON.stringify(rows)}`);
    }
    if (!c.set) {
      check(`COA link, ${c.name}: every row of the card, in order, as written out`,
        shown && JSON.stringify(rows) === JSON.stringify(want), `rows ${JSON.stringify(rows)}\n      want ${JSON.stringify(want)}`);
    }
    if (SHOTS && shown) await shoot(`date ${c.name}`);
    await discard(`COA link, ${c.name}`, 'urlMessage');
  }

  /* ---- Upload -------------------------------------------------------------- */
  await page.click('#uploadTab');
  const intro = await text('#uploadPanel');
  check('Upload: the tab says reading an uploaded file isn\'t available yet, and names Scan QR, COA link and Manual',
    /isn['\u2019]t available yet/.test(intro) && ['Scan QR', 'COA link', 'Manual'].every(t => intro.includes(t)), `the tab says "${intro}"`);
  check('Upload: no "static preview" left in the tab', !/static preview/i.test(intro));

  const requests = [];
  const record = r => requests.push(`${r.method()} ${r.url()}`);
  page.on('request', record);
  await page.setInputFiles('#reportFile', { name: 'lab-report.pdf', mimeType: 'application/pdf', buffer: PDF });
  const answered = await messageMatches('uploadMessage', /isn['\u2019]t available yet/);
  await page.waitForTimeout(750);
  page.off('request', record);
  const said = await text('#uploadMessage');
  check('Upload: choosing a report says plainly that reading it isn\'t available yet',
    answered && !/static preview/i.test(said), `the message says "${said}"`);
  check('Upload: ...and points to Scan QR, COA link and Manual', ['Scan QR', 'COA link', 'Manual'].every(t => said.includes(t)),
    `the message says "${said}"`);
  check('Upload: the page makes no request - the file goes nowhere', requests.length === 0, requests.join(', '));

  check('no uncaught error on the page', pageErrors.length === 0, pageErrors.join(' | '));
  check('every request to the handler had a reply waiting', queue.length === 0 && sent.length === 8 + FRESHNESS.length + DATED.length,
    `${sent.length} requests, ${queue.length} replies unused`);
} finally {
  await browser.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

finished = true;
if (failures) {
  console.log(`\ninput-paths: ${failures} failure${failures === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('\ninput-paths clean');

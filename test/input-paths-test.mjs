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
 *     line (ACS-FLW-002) show when the reply carries them and not otherwise;
 *     KAY-CAR-001 shows its 4.124; "Use this jar" and "Discard" do what they say
 *   - the card hides with its tab, and moves to the panel of the next request
 *   - a refused report shows its reasons and no card
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
const FIXTURES = { plain: 'KAY-CAR-001', warned: 'MCL-FLW-002', novel: 'ACS-FLW-002',
  refused: 'GreenRoadsFullSpectrumCBDOil750mgLot24007' };
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
for (const id of Object.values(FIXTURES)) {
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
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1024, 0x20)]);

/* The handler's reply to `body`, the report being the fixture's text. Only
   the PDF download is replaced, and only while the handler runs. */
async function handlerReply(fixture, body) {
  fixtureText = fs.readFileSync(path.join(EXTRACTED, `${fixture}.txt`), 'utf8');
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
  for (const [k, id] of Object.entries(FIXTURES)) {
    const reply = await handlerReply(id, body);
    r[k] = { status: reply.statusCode, data: JSON.parse(reply.body) };
  }
  check(`the handler reads ${FIXTURES.plain}: 4.124, no warning, no novelty`,
    r.plain.status === 200 && r.plain.data.totalTerpenes === 4.124 && !r.plain.data.warnings.length && !r.plain.data.novelty.length,
    JSON.stringify(r.plain.data).slice(0, 200));
  check(`the handler reads ${FIXTURES.warned} with a warning and no novelty`,
    r.warned.status === 200 && r.warned.data.warnings.length > 0 && !r.warned.data.novelty.length);
  check(`the handler reads ${FIXTURES.novel} with novelty and no warning`,
    r.novel.status === 200 && r.novel.data.usable === true && r.novel.data.novelty.length > 0 && !r.novel.data.warnings.length);
  check(`the handler refuses ${FIXTURES.refused}, with reasons`,
    r.refused.status === 422 && Array.isArray(r.refused.data.reasons) && r.refused.data.reasons.length > 0);
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.grantPermissions(['camera'], { origin: BASE });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.route('**/.netlify/functions/coa', async route => {
    const body = route.request().postData() || '';
    let url = null;
    try { url = JSON.parse(body).url; } catch {}
    sent.push(url);
    const fixture = queue.shift();
    if (!fixture) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"input-paths-test: no reply was expected"}' });
      return;
    }
    const reply = await handlerReply(fixture, body);
    last = { fixture, data: JSON.parse(reply.body) };
    await route.fulfill({ status: reply.statusCode, headers: reply.headers, body: reply.body });
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
  check('every request to the handler had a reply waiting', queue.length === 0 && sent.length === 8,
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

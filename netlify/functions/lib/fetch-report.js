'use strict';
/* NOSE - a lab report's PDF, fetched from a link through the scanner's guards.
 *
 *   const { validateUrl, fetchPdf } = require('./fetch-report');
 *   const checked = validateUrl(link);             // { url } or { error }
 *   const fetched = await fetchPdf(checked.url);   // { buffer, finalUrl, viaPage? } or { error }
 *
 * Moved here unchanged from netlify/functions/coa.js on 2026-10-05, so that
 * something other than the scanner can fetch a report through the same
 * guards without loading coa.js, and the archive wiring with it. Its callers
 * (PARSER-HANDOFF s12 says why the guards are what they are, s14 why the
 * dispensary scripts use them):
 *
 *   lib/read-report.js          validateUrl and fetchPdf - the one route to a
 *                               report's bytes, for coa.js (the scanner's
 *                               endpoint) since 2026-10-16
 *   scripts/b2b-coverage.js,    validateUrl alone: a catalog's report links,
 *   scripts/b2b-read-catalog.js checked before they are read, from a Codespace
 *   scripts/download-twice.js   resolvePdfFromPage, by hand
 *
 * test/fetch-guard-test.js tests the guards; test/resolver-test.js and
 * test/duplicates-test.js call resolvePdfFromPage.
 *
 * The guard does not depend on recognising anyone (coa.js's header says why):
 * https only; no private, loopback or link-local destination, re-checked after
 * every redirect; bounded time and bytes; PDF magic bytes rather than a
 * Content-Type header. What comes back is only bytes. Whether they are a lab
 * report is the parser's question.
 *
 * Every error is one plain sentence for the person who gave the link: coa.js
 * sends it to the app as it is, and the coverage report prints it as it is.
 * This file only fetches: it writes no file and no log line.
 */

const MAX_BYTES   = 12 * 1024 * 1024;   // COAs run to a few hundred KB; 12MB is generous
/* One BUDGET for the whole chain, not per request. Each fetch used to start a
   fresh 7500ms timer, so three hops could reach 22.5s against the 10s NOSE
   keeps a reply within - its own budget, not a Netlify limit: the chain has
   8s of it, and the archive what is left before 9s (lib/archive.js). Netlify's
   "Configuration for functions" gives a synchronous function - coa.js, a
   default export taking a Request since 2026-10-16 - 60s (read 2026-10-16).
   A chain that runs on leaves the person waiting, and past the
   platform's own limit shows them its error page instead of ours, which is
   the failure this timeout exists to prevent. TIMEOUT_MS still caps any
   single request; whichever is smaller wins. */
const TOTAL_BUDGET_MS = 8000;
const TIMEOUT_MS  = 7500;   // under NOSE's own 10s budget for a reply, so our message wins
const MAX_REDIRECTS = 3;
const MAX_PAGE_HOPS = 2;   // a portal may put a listings page before the report page

/* Block anything that points back at infrastructure rather than the public
 * internet. Checked on the initial URL and again on every redirect, because a
 * public host is free to redirect to 169.254.169.254. */
/* Every address range that is not the public internet, for an address written
   as the link's host. Until 2026-11-14 the checks below were prefix matches,
   and [::ffff:127.0.0.1], [::ffff:169.254.169.254], [::], 100.64.0.0/10,
   0.0.0.0/8, 64:ff9b::/96 and fec0::/10 each passed (security audit item 6).
   An IPv4 address written inside IPv6 (::ffff:a.b.c.d, or 64:ff9b::a.b.c.d,
   which NAT64 turns into a.b.c.d) is checked as the IPv4 address it names.
   Ranges from IANA's special-purpose registries (RFC 6890 and updates).
   A public NAME that resolves to a private address is caught before each
   request since 2026-11-16 (resolvesPrivate, below). */
const net = require('node:net');
const BLOCKED = new net.BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) BLOCKED.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
  ['2001:db8::', 32], ['100::', 64]]) BLOCKED.addSubnet(a, p, 'ipv6');
function isBlockedAddress(h){
  const kind = net.isIP(h);
  if (kind === 4) return BLOCKED.check(h, 'ipv4');
  if (kind !== 6) return false;
  /* An IPv4 address carried in IPv6: the last 32 bits, in either notation. */
  const embedded = /^(?:::ffff:|::ffff:0:|64:ff9b::|::)(\d+\.\d+\.\d+\.\d+)$/i.exec(h);
  if (embedded) return net.isIP(embedded[1]) === 4 ? BLOCKED.check(embedded[1], 'ipv4') || /^::$/.test(h) : true;
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(h);
  if (hex) {
    const n = (parseInt(hex[1], 16) << 16 >>> 0) + parseInt(hex[2], 16);
    return BLOCKED.check([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'), 'ipv4');
  }
  if (/^64:ff9b::/i.test(h) || /^::ffff:/i.test(h)) return true;   // an embedded form not parsed above: refuse
  return BLOCKED.check(h, 'ipv6');
}

function isBlockedHost(hostname){
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (isBlockedAddress(h)) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '0.0.0.0') return true;
  if (/^127\./.test(h)) return true;                    // loopback
  if (/^10\./.test(h)) return true;                     // private
  if (/^192\.168\./.test(h)) return true;               // private
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;// private
  if (/^169\.254\./.test(h)) return true;               // link-local / cloud metadata
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true;       // IPv6 unique-local
  if (/^fe80:/i.test(h)) return true;                   // IPv6 link-local
  return false;
}

/* A public name that resolves to a private address (security audit item 6,
   the part left until 2026-11-16). Before each request - the first and every
   redirect or page hop - the host's name is looked up and every address it
   gives is held to isBlockedAddress; one private address refuses the link.

   What this does NOT do: pin the connection. fetch() looks the name up again
   for itself, so a name server that answers the two lookups differently
   still gets through. Closing that needs the request made on the address
   that was checked, which Node's fetch gives no way to do without the undici
   package; https and its certificate check stay the guard for it, since a
   private machine would have to hold a certificate for the public name.

   A lookup that fails or runs past LOOKUP_MS decides nothing: the request
   goes on and fails, or not, as it would have. Bounded by the chain's own
   budget too. */
const dns = require('node:dns');
const LOOKUP_MS = 1500;
let resolveAll = host => dns.promises.lookup(host, { all: true, verbatim: true });
async function resolvesPrivate(hostname, deadline){
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || net.isIP(h)) return false;   // an address written as the host: isBlockedHost has judged it
  const left = Math.min(LOOKUP_MS, (deadline || Infinity) - Date.now());
  if (left <= 0) return false;
  let timer;
  try {
    const found = await Promise.race([
      Promise.resolve().then(() => resolveAll(h)).catch(() => null),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), left); })
    ]);
    return Array.isArray(found) && found.some(a => a && typeof a.address === 'string' && isBlockedAddress(a.address.toLowerCase()));
  } catch { return false; }
  finally { clearTimeout(timer); }
}

function validateUrl(raw){
  let u;
  try { u = new URL(String(raw)); }
  catch { return { error: 'That is not a valid web address.' }; }
  if (u.protocol !== 'https:')
    return { error: 'Only secure https links can be fetched.' };
  if (isBlockedHost(u.hostname))
    return { error: 'That address points to a private network, not a public lab report.' };
  return { url: u };
}

/* A reply's body, or null once it passes `max` bytes, when reading stops and
   the rest is cancelled. A reply with no stream (a stand-in in a test) is read
   whole, as before. */
async function readCapped(res, max){
  if (!res.body || typeof res.body.getReader !== 'function'){
    const whole = Buffer.from(await res.arrayBuffer());
    return whole.length > max ? null : whole;
  }
  const reader = res.body.getReader();
  const parts = [];
  let total = 0;
  for (;;){
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max){ reader.cancel().catch(() => {}); return null; }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts, total);
}

/* Follow redirects by hand so each hop can be re-validated. */
async function fetchOnce(startUrl, deadline){
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++){
    const controller = new AbortController();
    const left = (deadline || Infinity) - Date.now();
    if (left <= 0) return { error: 'The lab server took too long to respond.' };
    if (await resolvesPrivate(current.hostname, deadline))
      return { error: hop === 0 && current === startUrl ? 'That address points to a private network, not a public lab report.' : 'That link redirects somewhere it should not.' };
    const timer = setTimeout(() => controller.abort(), Math.min(TIMEOUT_MS, Math.max(1, (deadline || Infinity) - Date.now())));
    let res;
    try {
      res = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'Accept': 'application/pdf,text/html;q=0.8,*/*;q=0.5' }
      });
    } catch (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError')
        return { error: 'The lab server took too long to respond.' };
      return { error: 'Could not reach that address.' };
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400){
      const location = res.headers.get('location');
      if (!location) return { error: 'The lab server sent an incomplete redirect.' };
      let next;
      try { next = new URL(location, current); }
      catch { return { error: 'The lab server sent an invalid redirect.' }; }
      if (next.protocol !== 'https:' || isBlockedHost(next.hostname))
        return { error: 'That link redirects somewhere it should not.' };
      current = next;
      continue;
    }

    if (!res.ok)
      return { error: `The lab server returned ${res.status} for that link.` };

    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BYTES)
      return { error: 'That file is larger than this tool will fetch.' };

    /* Read with a running count and stop past MAX_BYTES, as b2b-catalog.js
       does: a reply with no Content-Length was read whole before this check
       until 2026-11-14, so a fast stream could fill the function's memory
       (security audit item 7). */
    let buf;
    try {
      buf = await readCapped(res, MAX_BYTES);
    } catch (err) {
      if (err && err.name === 'AbortError') return { error: 'The lab server took too long to respond.' };
      return { error: 'Could not reach that address.' };
    }
    if (buf === null)
      return { error: 'That file is larger than this tool will fetch.' };
    if (buf.length < 512)
      return { error: 'That link did not return a document.' };

    return { buffer: buf, finalUrl: current };
  }

  return { error: 'That link redirected too many times.' };
}

const isPdf = buf => buf.subarray(0, 5).toString('latin1') === '%PDF-';

function looksLikeHtml(buf){
  const head = buf.subarray(0, 400).toString('latin1').toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html');
}

/* Several labs put a VIEWER PAGE behind their QR code rather than the file —
 * Kaycha's codes resolve to yourcoa.com/coa/coa-view?sample=<lab id>, which is
 * HTML wrapping a PDF.js viewer. So when a fetch lands on a page instead of a
 * document, look once for the document it is displaying.
 *
 * Order matters. The query-parameter transform is tried first because it is
 * cheap and survives a redesign of the page; markup scraping is the fallback.
 * Either way the result is re-validated by the same guards and must still
 * present PDF magic bytes, so a wrong guess fails safely rather than quietly.
 */
function resolvePdfFromPage(buf, pageUrl){
  /* 400,000 was not enough. The coaportal listings page is 547KB - a WordPress
     theme with the payload near the end - and the one link worth having sat
     past the cut, so the scan found nothing on a page that plainly had it.
     The slice only bounds regex work on a buffer already held in memory and
     already capped by MAX_BYTES, so a larger window costs little. */
  const html = buf.toString('utf8').slice(0, 4000000);
  /* WordPress emits the zero-padded &#038; for an ampersand, which the two
     literal patterns here missed - the resolved URL kept it, and since # opens
     a fragment the link fetched the page again instead of the file. Match the
     numeric form with optional leading zeros. */
  const unescape = t => t.replace(/&(?:amp|#0*38);/gi, '&');
  const candidates = [];

  // 1. yourcoa.com viewer: the sample id in the query is the download path
  if (/(^|\.)yourcoa\.com$/i.test(pageUrl.hostname)){
    const sample = pageUrl.searchParams.get('sample');
    if (sample && /^[A-Za-z0-9._-]{4,64}$/.test(sample))
      candidates.push(`/coa/coa-download/${encodeURIComponent(sample)}?wl_id=0&mrk=0&is_view=1`);
  }

  /* coaportal.com is Method Testing Labs' portal - one path segment per brand,
     e.g. /sunburn/. It puts TWO pages between the QR code and the file: a
     listings page linking to a report page, which carries the file behind
     ?...&pdf=<n>. Neither URL ends in .pdf and neither says download, so the
     generic patterns below match nothing on either hop. The number after pdf=
     is read from the markup, never constructed, so a change to it is harmless. */
  if (/(^|\.)coaportal\.com$/i.test(pageUrl.hostname)){
    for (const re of [/href\s*=\s*"([^"]*[?&]pdf=\d+[^"]*)"/gi,
                      /href\s*=\s*"([^"]*\/report\/\?search=[^"]*)"/gi]){
      let c;
      while ((c = re.exec(html)) !== null) candidates.push(unescape(c[1]));
    }
  }

  // 2. an explicit download or .pdf link in the markup
  const linkRe = /(?:href|src)\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = linkRe.exec(html)) !== null){
    const raw = unescape(m[1]);
    if (/coa-download|\.pdf(\?|$)/i.test(raw)) candidates.push(raw);
  }

  // 3. a PDF.js viewer embed carries the real file in ?file=
  const viewerRe = /viewer\.html\?file=([^"'&]+)/i;
  const viewer = viewerRe.exec(html);
  if (viewer){
    try { candidates.push(decodeURIComponent(unescape(viewer[1]))); } catch {}
  }

  for (const candidate of candidates){
    let next;
    try { next = new URL(candidate, pageUrl); } catch { continue; }
    if (next.protocol !== 'https:' || isBlockedHost(next.hostname)) continue;
    return next;
  }
  return null;
}

async function fetchPdf(startUrl){
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const first = await fetchOnce(startUrl, deadline);
  if (first.error) return first;
  if (isPdf(first.buffer))
    return { buffer: first.buffer, finalUrl: first.finalUrl.toString() };

  if (looksLikeHtml(first.buffer)){
    /* Some portals put TWO pages between the QR code and the file: coaportal
       lands on a listings page linking to a report page linking to the PDF.
       Bounded at two hops, each re-validated by the same guards and still
       required to present PDF magic bytes, with a visited set so a
       self-referencing page cannot loop. */
    let page = first;
    const visited = new Set([first.finalUrl.toString()]);
    for (let hop = 0; hop < MAX_PAGE_HOPS; hop++){
      const resolved = resolvePdfFromPage(page.buffer, page.finalUrl);
      if (!resolved) break;
      const key = resolved.toString();
      if (visited.has(key)) break;
      visited.add(key);
      const next = await fetchOnce(resolved, deadline);
      if (next.error) return next;
      if (isPdf(next.buffer))
        return { buffer: next.buffer, finalUrl: next.finalUrl.toString(), viaPage: page.finalUrl.toString() };
      if (!looksLikeHtml(next.buffer))
        return { error: 'That page pointed at something that is not a PDF.' };
      page = next;
    }
    return { error: 'That link opens a page rather than a report, and no report could be found on it. Open the page yourself and paste the PDF link.' };
  }

  return { error: 'That link is not a PDF. Lab reports must be the report itself, not a page about one.' };
}

module.exports = {
  validateUrl,
  fetchPdf,
  resolvePdfFromPage,
  /* For test/fetch-guard-test.js: stand in for the name lookup, and put it back. */
  _setResolver(fn){ const was = resolveAll; resolveAll = fn; return was; },
  LIMITS: Object.freeze({ MAX_BYTES, TOTAL_BUDGET_MS, TIMEOUT_MS, MAX_REDIRECTS, MAX_PAGE_HOPS })
};

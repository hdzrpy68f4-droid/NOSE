'use strict';
/* NOSE - a lab report's PDF, fetched from a link through the scanner's guards.
 *
 *   const { validateUrl, fetchPdf } = require('./fetch-report');
 *   const checked = validateUrl(link);             // { url } or { error }
 *   const fetched = await fetchPdf(checked.url);   // { buffer, finalUrl, viaPage? } or { error }
 *
 * Moved here unchanged from netlify/functions/coa.js on 2026-10-05, so that
 * something other than the scanner can fetch a report through the same
 * guards without loading coa.js, and the archive wiring with it. Two callers
 * (PARSER-HANDOFF s12 says why the guards are what they are, s14 why the
 * second one exists):
 *
 *   coa.js                   the scanner's endpoint: validateUrl and fetchPdf,
 *                            and resolvePdfFromPage as its _resolvePdfFromPage
 *   scripts/b2b-coverage.js  the dispensary coverage report, run from a
 *                            Codespace
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
   fresh 7500ms timer, so three hops could reach 22.5s against Netlify's 10s
   ceiling - past which the platform kills the function and the person sees its
   error page instead of ours, which is the failure this timeout exists to
   prevent. TIMEOUT_MS still caps any single request; whichever is smaller wins. */
const TOTAL_BUDGET_MS = 8000;
const TIMEOUT_MS  = 7500;   // under Netlify's 10s function limit, so our message wins
const MAX_REDIRECTS = 3;
const MAX_PAGE_HOPS = 2;   // a portal may put a listings page before the report page

/* Block anything that points back at infrastructure rather than the public
 * internet. Checked on the initial URL and again on every redirect, because a
 * public host is free to redirect to 169.254.169.254. */
function isBlockedHost(hostname){
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
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

/* Follow redirects by hand so each hop can be re-validated. */
async function fetchOnce(startUrl, deadline){
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++){
    const controller = new AbortController();
    const left = (deadline || Infinity) - Date.now();
    if (left <= 0) return { error: 'The lab server took too long to respond.' };
    const timer = setTimeout(() => controller.abort(), Math.min(TIMEOUT_MS, left));
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

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES)
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
  LIMITS: Object.freeze({ MAX_BYTES, TOTAL_BUDGET_MS, TIMEOUT_MS, MAX_REDIRECTS, MAX_PAGE_HOPS })
};

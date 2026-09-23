'use strict';
/* NOSE — COA fetch + parse endpoint.
 *
 *   POST /.netlify/functions/coa   { "url": "https://…/report.pdf" }
 *
 * Fetches a certificate of analysis, extracts its text and returns the terpene
 * fingerprint the parser found — together with an honest account of how
 * complete that reading is.
 *
 * SCOPE: aroma and flavour only. Nothing here infers, ranks or describes
 * effects, and nothing should be added that does.
 *
 * WHY THERE IS NO DOMAIN ALLOWLIST
 * The earlier client-side check trusted a list of lab hostnames. In practice
 * COAs reach people through the dispensary that sold the jar — both of the
 * real reports this was built against were served from a retailer's S3
 * bucket, not from the issuing lab's domain. A hostname list would reject
 * precisely the files people actually hold.
 *
 * The list did guard something real, though: without it, submitting a URL
 * makes this server fetch an arbitrary address (SSRF). So the guard is kept
 * and moved, from "do I recognise the host" to layered checks that do not
 * depend on recognising anyone:
 *
 *   1. https only
 *   2. no private, loopback or link-local destinations, re-checked after
 *      every redirect
 *   3. bounded time and bounded bytes
 *   4. it must really be a PDF (magic bytes, not the Content-Type header)
 *   5. the CONTENT must stand up: a known lab template, a product class we
 *      model, and a terpene total that reconciles against the figure the lab
 *      printed itself
 *
 * (5) is the substantive boundary. A fabricated report on an allowlisted
 * domain would pass a hostname check and fail reconciliation.
 *
 * On the production deploy, every lab report fetched is also kept in the
 * archive (archiveScan, below): the PDF and what was read from it, never
 * anything about the person who scanned it.
 */

const { extractCoaText } = require('./lib/extract-text');
const { parseCoa } = require('./lib/parse-coa');
const { buildInfo } = require('./lib/version');
const archive = require('./lib/archive');

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

/* The archive (PARSER-HANDOFF s13). The whole handler must finish inside
   Netlify's 10s ceiling and the fetch chain alone may spend 8s of it, so the
   two writes together get at most 2s of whatever is left, and are skipped
   outright when too little is left to be worth starting. A stored row is
   worth less than a reply that arrives. */
const ARCHIVE_DEADLINE_MS = 9000;         // measured from the start of the handler
const ARCHIVE_BUDGET_MS   = 2000;         // the PDF and database writes, together
const ARCHIVE_MIN_MS      = 300;          // below this, do not start

/* ONLY the production deploy stores anything. Deploy previews and branch
   deploys share the site's Blobs store, so a preview scan would write into the
   real archive. The context, like the two version stamps stored with every
   scan, comes from build-info.json, which build.sh writes and esbuild bundles
   (lib/version.js); a missing file reads as 'dev', and dev stores nothing. */
const archiveOn = () => buildInfo().deployContext === 'production';

/* Labs whose text ordering under unpdf does not match the committed fixtures.
 * test/extraction-parity.js reports these as DIFFER. A DIFFER is not a near
 * miss — the parser may read a different column — so these are refused until
 * a handler for that ordering exists and the harness reports MATCH. */
const UNSAFE_UNDER_UNPDF = [
];

function json(statusCode, body){
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

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

/* Lambda compatibility: a function written as exports.handler is not handed
   the Blobs context the way a (Request, Context) function is, and without it
   every Blobs write fails. connectLambda reads event.blobs and the site and
   deploy ids Netlify adds as headers - which site, never who is asking - and
   keeps nothing else. A failure here only means the PDF write fails and says
   so; the database write does not depend on it. */
function connectBlobs(event){
  try { require('./lib/pdf-store').connect(event); }
  catch { /* reported by the PDF write itself */ }
}

/* Keep the report and what was read from it, without ever changing what the
 * person is told. The storage path itself is lib/archive.js, shared with the
 * seed script so a seed run proves this code.
 *
 * WHAT IS PASSED: the PDF bytes, the address they came from, the extracted
 * text and the parser's output. Nothing about the person - no IP, no header,
 * no user agent, no session, no account. `event` is deliberately not in scope
 * here, and test/archive-wiring-test.js fails if this function ever names it.
 *
 * WHAT IS KEPT: whatever looks like a lab report - a laboratory the parser
 * recognised, "Certificate of Analysis" in the text, or a terpene it read -
 * refusals included. The PDF goes to Netlify Blobs and what was read goes to
 * Postgres, independently: either can fail without touching the other.
 *
 * HOW IT STAYS OUT OF THE WAY:
 *   - production only (archiveOn): previews and local runs store nothing
 *   - NOSE_DB_URL unset: the database half is a no-op, store.js never loaded
 *   - both writes together get at most ARCHIVE_BUDGET_MS of what is left
 *     before the deadline, and are skipped when less than ARCHIVE_MIN_MS
 *     remains
 *   - every failure is swallowed; the reply never depends on this
 *
 * NOTHING IS LOGGED ON SUCCESS, and a failure logs no detail of the document.
 * Netlify timestamps every log line, and a line naming the report would line
 * a stored scan up with the request logs - the thing the day-only dates in the
 * archive exist to prevent.
 */
async function archiveScan(buffer, finalUrl, text, result, deadline){
  const left = deadline - Date.now();
  if (left < ARCHIVE_MIN_MS) return { kept: false, reason: 'no time left' };
  try {
    const { parserVersion, extractorVersion } = buildInfo();
    const outcome = await archive.storeScan(
      { buffer, finalUrl, text, output: result, context: 'production', parserVersion, extractorVersion },
      { timeoutMs: Math.min(ARCHIVE_BUDGET_MS, left) });
    if (outcome.failed && outcome.failed.length)
      console.error('coa: archive incomplete, reply unaffected:', outcome.failed.join('; '));
    return outcome;
  } catch (err) {
    console.error('coa: archive skipped, reply unaffected:', archive.reason(err));
    return { kept: false, reason: 'failed' };
  }
}

exports.handler = async function(event){
  if (event.httpMethod === 'OPTIONS')
    return { statusCode: 204, headers: { 'Allow': 'POST' }, body: '' };
  if (event.httpMethod !== 'POST')
    return json(405, { error: 'Send a POST request with a url.' });

  const archiveDeadline = Date.now() + ARCHIVE_DEADLINE_MS;

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Could not read that request.' }); }

  const checked = validateUrl(payload.url);
  if (checked.error) return json(400, { error: checked.error });

  const fetched = await fetchPdf(checked.url);
  if (fetched.error) return json(502, { error: fetched.error });

  let text;
  try {
    /* extractCoaText returns { text, pages }, not a bare string. Passing the
       object straight to parseCoa finds no terpenes in it and yields a
       confident, wrong refusal — the failure hides behind a sensible message. */
    const extracted = await extractCoaText(fetched.buffer);
    text = typeof extracted === 'string' ? extracted : (extracted && extracted.text);
  } catch {
    return json(422, { error: 'That PDF could not be read. It may be a scan rather than a text document.' });
  }
  if (typeof text !== 'string' || text.length < 200)
    return json(422, { error: 'That PDF has no readable text. Scanned reports are not supported.' });

  let result;
  try {
    result = parseCoa(text);
  } catch {
    return json(422, { error: 'That report could not be parsed.' });
  }

  /* One call site, covering every outcome below: a usable read, an unusable
     one, and a layout this tool refuses. All three are parses that happened,
     and the refusals are how parser faults get found. Production only.
     connectBlobs first, or the PDF write fails. Awaited, because this is a
     Lambda-style function and Netlify freezes it the moment it returns, so an
     unawaited write would be cut off; bounded, so it can never be what makes
     a reply late. */
  if (archiveOn()){
    connectBlobs(event);
    await archiveScan(fetched.buffer, fetched.finalUrl, text, result, archiveDeadline);
  }

  /* Known-unsafe extraction ordering: refuse rather than risk reading the
     wrong column. This is a limitation of this tool, not a fault in the
     report, and it says so. */
  const unsafe = UNSAFE_UNDER_UNPDF.some(rule =>
    rule.lab.test(result.lab || '') && rule.productClass === result.productClass);
  if (unsafe){
    return json(422, {
      error: `${result.lab} reports of this type are not yet supported by the scanner. ` +
             'Enter the terpene values manually — the numbers on the report are correct, ' +
             'this tool just cannot read that layout reliably yet.',
      lab: result.lab,
      manualEntry: true
    });
  }

  if (!result.usable){
    return json(422, {
      error: 'That report could not be read reliably.',
      reasons: result.rejectReasons,
      lab: result.lab,
      productClass: result.productClass,
      manualEntry: true
    });
  }

  /* A successful read still returns coverage and unmapped compounds. The
     fingerprint may rest on a partial panel — several labs publish only a top
     ten — and the person is entitled to see that rather than infer it. */
  return json(200, {
    lab: result.lab,
    strain: result.strain,
    batch: result.batch,
    labId: result.labId,
    harvestDate: result.harvestDate,
    productClass: result.productClass,
    terps: result.terps,
    totalTerpenes: result.totalTerpenes,
    mappedTotal: result.mappedTotal,
    unmodelledTotal: result.unmodelledTotal,
    coverage: result.coverage,
    unmapped: result.unmapped,
    modelCoverage: result.modelCoverage,
    measuredCoverage: result.measuredCoverage,
    /* Not grounds for refusal, so the values stand — but the person is
       entitled to see them. A plausibility warning is what caught a cart
       read 10x high, and it was only visible in the parser. */
    warnings: result.warnings || [],
    terpenesTested: result.terpenesTested,
    moisture: result.freshnessApplies ? result.moisture : null,
    waterActivity: result.freshnessApplies ? result.waterActivity : null,
    freshnessApplies: result.freshnessApplies,
    layout: result.layout,
    source: fetched.finalUrl,
    viaPage: fetched.viaPage || null
  });
};
exports._resolvePdfFromPage = resolvePdfFromPage;
exports._archiveScan = archiveScan;
exports._archiveOn = archiveOn;
exports._ARCHIVE_LIMITS = { ARCHIVE_DEADLINE_MS, ARCHIVE_BUDGET_MS, ARCHIVE_MIN_MS };

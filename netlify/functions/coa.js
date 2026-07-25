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
 */

const { extractCoaText } = require('./lib/extract-text');
const { parseCoa } = require('./lib/parse-coa');

const MAX_BYTES   = 12 * 1024 * 1024;   // COAs run to a few hundred KB; 12MB is generous
const TIMEOUT_MS  = 12000;
const MAX_REDIRECTS = 3;

/* Labs whose text ordering under unpdf does not match the committed fixtures.
 * test/extraction-parity.js reports these as DIFFER. A DIFFER is not a near
 * miss — the parser may read a different column — so these are refused until
 * a handler for that ordering exists and the harness reports MATCH. */
const UNSAFE_UNDER_UNPDF = [
  { lab: /modern\s*canna/i, productClass: 'flower' }
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
async function fetchPdf(startUrl){
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++){
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'Accept': 'application/pdf,*/*' }
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

    // Size cap before reading: trust Content-Length when it is offered.
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BYTES)
      return { error: 'That file is larger than this tool will fetch.' };

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES)
      return { error: 'That file is larger than this tool will fetch.' };
    if (buf.length < 1024)
      return { error: 'That link did not return a document.' };

    // Magic bytes, not Content-Type: a header is trivially wrong or spoofed.
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-')
      return { error: 'That link is not a PDF. Lab reports must be the PDF itself, not a page about one.' };

    return { buffer: buf, finalUrl: current.toString() };
  }

  return { error: 'That link redirected too many times.' };
}

exports.handler = async function(event){
  if (event.httpMethod === 'OPTIONS')
    return { statusCode: 204, headers: { 'Allow': 'POST' }, body: '' };
  if (event.httpMethod !== 'POST')
    return json(405, { error: 'Send a POST request with a url.' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Could not read that request.' }); }

  const checked = validateUrl(payload.url);
  if (checked.error) return json(400, { error: checked.error });

  const fetched = await fetchPdf(checked.url);
  if (fetched.error) return json(502, { error: fetched.error });

  let text;
  try {
    text = await extractCoaText(fetched.buffer);
  } catch {
    return json(422, { error: 'That PDF could not be read. It may be a scan rather than a text document.' });
  }
  if (!text || text.length < 200)
    return json(422, { error: 'That PDF has no readable text. Scanned reports are not supported.' });

  let result;
  try {
    result = parseCoa(text);
  } catch {
    return json(422, { error: 'That report could not be parsed.' });
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
    terpenesTested: result.terpenesTested,
    moisture: result.freshnessApplies ? result.moisture : null,
    waterActivity: result.freshnessApplies ? result.waterActivity : null,
    freshnessApplies: result.freshnessApplies,
    layout: result.layout,
    source: fetched.finalUrl
  });
};

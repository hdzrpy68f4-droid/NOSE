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
 * Checks 1 to 4 are lib/fetch-report.js, moved there unchanged on 2026-10-05
 * so the dispensary coverage report (scripts/b2b-coverage.js) fetches through
 * the same guards without loading this file. 5 is the parser.
 *
 * The steps from the link to a verdict - those checks, the text, the parser
 * and the layouts this tool refuses - are lib/read-report.js since
 * 2026-10-16, the one path the dispensary reports read by too. This file
 * turns each stage into its reply, and keeps the report.
 *
 * On the production deploy, every lab report fetched is also kept in the
 * archive (lib/archive.js, archiveScan): the PDF and what was read from it,
 * never anything about the person who scanned it.
 *
 * WRITTEN AS EVERY OTHER FUNCTION IS, since 2026-10-16: one default export,
 * taking a Request and returning a Response, and nothing else exported. Until
 * then this was the one exports.handler function - Netlify's "Lambda
 * compatibility" format, whose deploys Netlify stops accepting on July 1, 2027
 * (PARSER-HANDOFF s13, "coa.js in the current format"). The lib/ files are
 * CommonJS, so each is imported whole (Netlify, "Configuration for
 * functions", Module format: no named imports from a CommonJS module);
 * ../lib/http.js, an ES module, gives its json() by name.
 *
 * Netlify's Context - the caller's IP address, location and cookies among it
 * - is never taken: the handler has one parameter, the request, and reads
 * only its method and its body. The archive is handed neither.
 *
 * A request this cannot read gets a 400; anything else that goes wrong, a
 * fixed 500 and one fixed log line - never the platform's crash page, which
 * shows the error and its stack trace (security audit #5).
 */

import report from './lib/read-report.js';
import archive from './lib/archive.js';
import { json } from '../lib/http.js';

const { readReport, STAGES } = report;
const { ARCHIVE_DEADLINE_MS } = archive.ARCHIVE_LIMITS;

const UNREADABLE = 'Could not read that request.';
const FAILED = 'The report reader failed. Try again, or enter the values manually.';
/* The one line a failure logs: nothing of the request or of the error, so
   it can never carry a link, a fingerprint or anything about the person. */
const FAILED_LINE = 'coa: the report reader failed - a fixed 500 sent, no detail logged';

/* Every JSON reply carries three headers: http.js's json() gives
   Content-Type: application/json and Cache-Control: no-store, and this adds
   the third. */
const NOSNIFF = { 'x-content-type-options': 'nosniff' };

/* A body JSON.parse reads but that is not a plain object - null, an array, a
   string, a number, true - is as unreadable as one it cannot parse. Until
   2026-10-16 null threw on .url, and an array or a string reached the link
   check as no link at all. */
const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

async function reply(request, archiveDeadline){
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: { 'Allow': 'POST' } });
  if (request.method !== 'POST')
    return json({ error: 'Send a POST request with a url.' }, 405, NOSNIFF);

  let payload;
  try { payload = JSON.parse((await request.text()) || '{}'); }
  catch { return json({ error: UNREADABLE }, 400, NOSNIFF); }
  if (!isPlainObject(payload)) return json({ error: UNREADABLE }, 400, NOSNIFF);

  /* The link to a verdict, in lib/read-report.js: each step that fails stops
     the read, with the sentence the person is shown. A stage before the parse
     is replied to at once and never reaches the archive. */
  const read = await readReport(payload.url);
  if (read.stage === STAGES.link) return json({ error: read.sentence }, 400, NOSNIFF);
  if (read.stage === STAGES.fetch) return json({ error: read.sentence }, 502, NOSNIFF);
  if (!read.parsed) return json({ error: read.sentence }, 422, NOSNIFF);
  const result = read.output;

  /* One call site, covering every outcome below: a usable read, an unusable
     one, and a layout this tool refuses. All three are parses that happened,
     and the refusals are how parser faults get found. Production only.
     Awaited before the reply, as it always was, so the reply still never
     comes before the archive has finished or given up; bounded, so it can
     never be what makes a reply late. Handed what was read, never the
     request. */
  if (archive.archiveOn())
    await archive.archiveScan(read.buffer, read.finalUrl, read.text, result, archiveDeadline);

  /* Known-unsafe extraction ordering (read-report's UNSAFE_UNDER_UNPDF):
     refused rather than risk reading the wrong column, in a sentence that
     says the fault is this tool's, not the report's. */
  if (read.stage === STAGES.unsafe){
    return json({
      error: read.sentence,
      lab: result.lab,
      manualEntry: true
    }, 422, NOSNIFF);
  }

  if (read.stage === STAGES.refused){
    return json({
      error: read.sentence,
      reasons: read.reasons,
      lab: result.lab,
      productClass: result.productClass,
      manualEntry: true
    }, 422, NOSNIFF);
  }

  /* A successful read still returns coverage and unmapped compounds. The
     fingerprint may rest on a partial panel — several labs publish only a top
     ten — and the person is entitled to see that rather than infer it. */
  return json({
    lab: result.lab,
    strain: result.strain,
    batch: result.batch,
    labId: result.labId,
    harvestDate: result.harvestDate,
    /* The harvest day, the day the lab finished and the report day, as ISO
       days or null - lib/coa-dates.js reads them from the printed dates after
       the reading (PARSER-HANDOFF s7). The card shows one of them and how
       long ago it was; nothing scores them (s4). */
    harvestOn: result.harvestOn ?? null,
    testedOn: result.testedOn ?? null,
    reportOn: result.reportOn ?? null,
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
    /* Whether the parser met anything in this report it has not seen before
       (PARSER-HANDOFF s7). The card shows one fixed sentence when the list is
       not empty and the read is usable; the notes themselves are never shown. */
    usable: result.usable,
    novelty: Array.isArray(result.novelty) ? result.novelty : [],
    terpenesTested: result.terpenesTested,
    moisture: result.freshnessApplies ? result.moisture : null,
    waterActivity: result.freshnessApplies ? result.waterActivity : null,
    freshnessApplies: result.freshnessApplies,
    layout: result.layout,
    source: read.finalUrl,
    viaPage: read.viaPage
  }, 200, NOSNIFF);
}

/* The 9s archive deadline is measured from here, the handler's start. Any
   throw at all becomes the fixed 500: the reply and the log line say nothing
   of the request or of the error. */
export default async (request) => {
  const archiveDeadline = Date.now() + ARCHIVE_DEADLINE_MS;
  try {
    return await reply(request, archiveDeadline);
  } catch {
    console.error(FAILED_LINE);
    return json({ error: FAILED }, 500, NOSNIFF);
  }
};

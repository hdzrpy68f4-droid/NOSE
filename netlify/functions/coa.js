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
 * archive (archiveScan, below): the PDF and what was read from it, never
 * anything about the person who scanned it.
 */

const { resolvePdfFromPage } = require('./lib/fetch-report');
const { readReport, STAGES } = require('./lib/read-report');
const { buildInfo } = require('./lib/version');
const archive = require('./lib/archive');

/* The archive (PARSER-HANDOFF s13). NOSE keeps the handler's reply within
   10s - its own budget, not a Netlify limit. Netlify's "Configuration for
   functions" gives a synchronous function 60s, and its "Lambda compatibility
   for Functions" gives no limit for an exports.handler function like this
   one, only 10s for a streamed reply, which this is not (both read
   2026-10-15). The fetch chain alone may spend 8s of the 10, so the two
   writes together get at most 2s of whatever is left before 9s, and are
   skipped outright when too little is left to be worth starting. A stored
   row is worth less than a reply that arrives. */
const ARCHIVE_DEADLINE_MS = 9000;         // measured from the start of the handler
const ARCHIVE_BUDGET_MS   = 2000;         // the PDF and database writes, together
const ARCHIVE_MIN_MS      = 300;          // below this, do not start

/* ONLY the production deploy stores anything. Deploy previews and branch
   deploys share the site's Blobs store, so a preview scan would write into the
   real archive. The context, like the two version stamps stored with every
   scan, comes from build-info.json, which build.sh writes and esbuild bundles
   (lib/version.js); a missing file reads as 'dev', and dev stores nothing. */
const archiveOn = () => buildInfo().deployContext === 'production';

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
 * WHAT IS KEPT: a lab report, known by two of its three signs - a laboratory
 * the parser recognised, "Certificate of Analysis" in the text, a terpene
 * panel (archive.labReportSigns) - refusals included. One sign is not enough:
 * a receipt or a label can name a lab. What was read goes to Postgres first,
 * then the PDF to Netlify Blobs - unless the database recognised the scan as
 * a copy of a report it already holds, by its text (a portal that builds its
 * PDF at the moment of download), or answered that it keeps nothing: the file
 * was removed by hand and is withheld, or today's cap on new documents is
 * reached. Either write can fail; a failed database still leaves the PDF
 * written, for backfill.
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
 * archive exist to prevent. A withheld file logs nothing at all: a line saying
 * one was scanned again would tie a removed report to a request in those logs.
 * Reaching the daily cap logs one fixed line, with nothing about the report,
 * so a day the archive stopped filling can be seen.
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
    if (outcome.db === archive.DAILY_CAP)
      console.error('coa: archive at its daily cap - nothing kept, reply unaffected');
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

  /* The link to a verdict, in lib/read-report.js: each step that fails stops
     the read, with the sentence the person is shown. A stage before the parse
     is replied to at once and never reaches the archive. */
  const read = await readReport(payload.url);
  if (read.stage === STAGES.link) return json(400, { error: read.sentence });
  if (read.stage === STAGES.fetch) return json(502, { error: read.sentence });
  if (!read.parsed) return json(422, { error: read.sentence });
  const result = read.output;

  /* One call site, covering every outcome below: a usable read, an unusable
     one, and a layout this tool refuses. All three are parses that happened,
     and the refusals are how parser faults get found. Production only.
     connectBlobs first, or the PDF write fails. Awaited, because this is a
     Lambda-style function and Netlify freezes it the moment it returns, so an
     unawaited write would be cut off; bounded, so it can never be what makes
     a reply late. */
  if (archiveOn()){
    connectBlobs(event);
    await archiveScan(read.buffer, read.finalUrl, read.text, result, archiveDeadline);
  }

  /* Known-unsafe extraction ordering (read-report's UNSAFE_UNDER_UNPDF):
     refused rather than risk reading the wrong column, in a sentence that
     says the fault is this tool's, not the report's. */
  if (read.stage === STAGES.unsafe){
    return json(422, {
      error: read.sentence,
      lab: result.lab,
      manualEntry: true
    });
  }

  if (read.stage === STAGES.refused){
    return json(422, {
      error: read.sentence,
      reasons: read.reasons,
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
  });
};
exports._resolvePdfFromPage = resolvePdfFromPage;
exports._archiveScan = archiveScan;
exports._archiveOn = archiveOn;
exports._ARCHIVE_LIMITS = { ARCHIVE_DEADLINE_MS, ARCHIVE_BUDGET_MS, ARCHIVE_MIN_MS };

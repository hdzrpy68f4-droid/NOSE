'use strict';
/* NOSE - the archive's storage path, shared by the scanner (coa.js) and the
 * seed script (scripts/seed-from-fixtures.js), so a seed run proves the same
 * code a real scan runs.
 *
 *   storeScan(scan, options) -> { kept, pdf, db, copyOf, saved, failed }
 *   archiveScan(buffer, finalUrl, text, result, deadline)   the scanner's call
 *   archiveOn()                                             production only?
 *
 * archiveScan, archiveOn and their three limits were coa.js's until
 * 2026-10-16, when coa.js became a default export taking a Request and
 * nothing else (PARSER-HANDOFF s13, "coa.js in the current format"). They
 * moved here unchanged.
 *
 * One fetch's worth - the PDF bytes, where they came from, the text extracted
 * from them and the parser's output - is kept in two places:
 *
 *   what was read    Postgres, through nose.save_scan    (lib/store.js)
 *   the PDF itself   Netlify Blobs, store "coa-pdf"      (lib/pdf-store.js)
 *
 * DATABASE FIRST. save_scan says which document the scan belongs to: a new
 * one, the one with these very bytes, or an earlier document holding the same
 * text - a portal that builds its PDF at the moment of download (Method
 * Testing Labs') hands over new bytes for the same report every time
 * (PARSER-HANDOFF s13). The PDF is then written unless it is such a copy:
 *
 *   database stored a new document          PDF written
 *   database matched these same bytes       PDF written - a no-op when it is
 *                                           there (onlyIfNew), and it fills in
 *                                           a document kept before PDFs were
 *   database matched another document's     PDF not written: the report's own
 *     text (a copy)                         PDF is the one kept
 *   database said WITHHELD - the file, or   PDF not written: a removal took it
 *     its text, was removed by hand         out (scripts/remove-document.js)
 *   database said CAPPED - today's new      PDF not written: above the cap
 *     documents from live scans are full    nothing is kept
 *   database failed, timed out, or is not   PDF written, so backfill-from-
 *     configured                            blobs.js can still save it later
 *
 * BOUNDED TOGETHER: the database gets at most half of timeoutMs, and the PDF
 * whatever is left of the whole, so neither a hung database nor a hung Blobs
 * write can take the pair past timeoutMs. A database that hangs still leaves
 * the PDF its half. scripts/archive-health.js reports a file that one half
 * has and the other lacks.
 *
 * WHAT IS KEPT: a lab report, by TWO of its three signs (labReportSigns,
 * below) - one is not enough, since a receipt or a product label can name a
 * laboratory and a letter can mention a certificate of analysis. Refused and
 * unusable reports ARE kept: the refusals are how parser faults get found. A
 * PDF with fewer signs is not kept at all, in either place - it could be
 * somebody's personal document, linked by mistake.
 *
 * NOTHING ABOUT THE PERSON. This module is never handed the request, nor
 * Netlify's Context, so it cannot store anything from either. The address it
 * keeps has lost its query and fragment: signed links carry a temporary
 * credential there (X-Amz-Signature, Signature, Expires) and order pages carry
 * tokens that can point back at whoever received the link. Dates are UTC
 * days, never times. (`context` in a scan is the deploy context - production,
 * seed, backfill - and nothing to do with Netlify's Context object, which no
 * function of NOSE's takes.)
 *
 * storeScan LOGS NOTHING. `failed` holds short reasons with any file
 * fingerprint or address scrubbed out; the caller decides what to print.
 * archiveScan, the scanner's caller, prints the fixed lines described above
 * it, below.
 */

const crypto = require('crypto');
const { buildInfo } = require('./version');

const MAX_TEXT = 256 * 1024;        // real reports run 2-30KB of text
const DEFAULT_TIMEOUT_MS = 2000;
const BACKSTOP_MS = 50;             // store.js bounds itself; this bounds store.js
const DATABASE_SHARE = 0.5;         // of timeoutMs; the PDF has the rest
const MIN_PDF_MS = 50;              // less than this left: the PDF write is not started
const NOT_CONFIGURED = 'not configured';
const WITHHELD = 'withheld';        // save_scan: removed by hand, never kept again
const DAILY_CAP = 'daily cap';      // save_scan: today's new documents are full

/* The three signs of a lab report (PARSER-HANDOFF s13):
 *
 *   lab     the parser recognised a laboratory (detectLab)
 *   phrase  the text says "Certificate of Analysis", anywhere
 *   panel   a terpene panel: the report says whether terpenes were tested
 *           (terpenesTested is not null), it prints a total, or the parser
 *           read at least one terpene
 *
 * A file is kept only when at least TWO hold. Every report in the test corpus
 * shows two or more - 52 all three, the six ACS reports no phrase, Harmony no
 * panel - and test/archive-wiring-test.js pins exactly that. No output at all
 * shows no sign, whatever the text says. */
const PHRASE = /certificate\s+of\s+analysis/i;
const SIGNS = ['lab', 'phrase', 'panel'];
const MIN_SIGNS = 2;

function labReportSigns(output, text) {
  const o = output && typeof output === 'object' && !Array.isArray(output) ? output : null;
  if (!o) return { lab: false, phrase: false, panel: false };
  const terps = o.terps && typeof o.terps === 'object' && !Array.isArray(o.terps) ? o.terps : {};
  return {
    lab: !!o.lab,
    phrase: typeof text === 'string' && PHRASE.test(text),
    panel: o.terpenesTested != null ||
           (typeof o.totalTerpenes === 'number' && Number.isFinite(o.totalTerpenes)) ||
           Object.keys(terps).length > 0
  };
}

/* The signs that hold, in their fixed order: ['lab', 'panel'], say. */
const signsShown = signs => SIGNS.filter(k => signs && signs[k]);

function looksLikeLabReport(output, text) {
  return signsShown(labReportSigns(output, text)).length >= MIN_SIGNS;
}

/* Where the file came from: origin and path only. Dropping the whole query
   takes every presigned-URL parameter with it, and every other token too; the
   origin never carries credentials. https only. */
function sourceAddress(finalUrl) {
  if (!finalUrl) return null;
  try {
    const u = new URL(String(finalUrl));
    return u.protocol === 'https:' ? u.origin + u.pathname : null;
  } catch {
    return null;
  }
}

const utcDay = (now = new Date()) => now.toISOString().slice(0, 10);

/* An error's message, safe to print: no file fingerprint, no address, no
   database host, no IP address of any kind. */
function reason(err) {
  return String((err && err.message) || err || 'failed')
    .replace(/[0-9a-f]{64}/gi, '<sha256>')
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<address>')
    .replace(/\b[\w.-]+\.supabase\.(?:com|co)\b(?::\d+)?/gi, '<database host>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b(?::\d+)?/g, '<ip>')
    .replace(/\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/gi, '<ip>')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

/* Wait for work() at most ms. The race stays subscribed to work it gave up
   on, so a late rejection is still handled rather than crashing the process. */
function bounded(work, ms, label) {
  let timer;
  const giveUp = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([Promise.resolve().then(work), giveUp]).finally(() => clearTimeout(timer));
}

function defaultOpenPdfStore() {
  return require('./pdf-store').open();
}

/* Unset NOSE_DB_URL is a complete no-op: store.js and pg are never loaded. */
function defaultSaveScan(payload, opts) {
  if (!process.env.NOSE_DB_URL) return NOT_CONFIGURED;
  return require('./store').saveScan(payload, opts);
}

async function storeScan(scan, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  openPdfStore = defaultOpenPdfStore,
  saveScan = defaultSaveScan
} = {}) {
  const { buffer, finalUrl, text, output, context, parserVersion, extractorVersion } = scan || {};

  if (!looksLikeLabReport(output, text)) return { kept: false, reason: 'not a lab report' };
  if (typeof text !== 'string' || text.length > MAX_TEXT) return { kept: false, reason: 'text too large' };
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { kept: false, reason: 'no file' };

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const sourceUrl = sourceAddress(finalUrl);
  const deadline = Date.now() + timeoutMs;
  const dbMs = Math.max(1, Math.floor(timeoutMs * DATABASE_SHARE));

  const [db] = await Promise.allSettled([
    bounded(() => saveScan({
      sha256,
      byteSize: buffer.length,
      sourceUrl,
      fetchedAt: null,              // the database records the day itself, in UTC
      extractorVersion,
      text,
      parserVersion,
      context,
      output
    }, { timeoutMs: dbMs }), dbMs + BACKSTOP_MS, 'database write')
  ]);
  const saved = db.status === 'fulfilled' && db.value && typeof db.value === 'object' ? db.value : null;

  /* The database kept nothing, and says why: the file or its text was
     removed by hand and is withheld, or today's new documents from live scans
     have reached the cap. The PDF half obeys - nothing is written there
     either - and neither is a failure. */
  if (saved && (saved.withheld === true || saved.capped === true)) {
    const why = saved.withheld === true ? WITHHELD : DAILY_CAP;
    return { kept: false, reason: why, pdf: 'not kept', db: why, copyOf: null, saved, failed: [] };
  }

  /* A copy of a report the database already holds by its text: its PDF is
     the report's own, kept under the report's fingerprint. */
  const copyOf = saved && saved.matchedBy === 'text' ? saved.documentId : null;

  let pdf;
  if (copyOf != null) {
    pdf = { status: 'skipped' };
  } else {
    const left = deadline - Date.now();
    pdf = left < MIN_PDF_MS
      ? { status: 'rejected', reason: new Error(`pdf write skipped - ${Math.max(0, left)}ms left of ${timeoutMs}ms`) }
      : (await Promise.allSettled([
          bounded(() => require('./pdf-store').put(openPdfStore(), sha256, buffer,
                                                   { sourceUrl, fetchedAt: utcDay() }),
                  left, 'pdf write')
        ]))[0];
  }

  const failed = [];
  if (pdf.status === 'rejected') failed.push(`pdf: ${reason(pdf.reason)}`);
  if (db.status === 'rejected') failed.push(`database: ${reason(db.reason)}`);

  return {
    kept: pdf.status === 'fulfilled' || !!saved,
    pdf: pdf.status === 'skipped' ? 'copy, not kept'
      : pdf.status === 'rejected' ? 'failed' : pdf.value.written ? 'written' : 'already stored',
    db: db.status === 'rejected' ? 'failed'
      : db.value === NOT_CONFIGURED ? NOT_CONFIGURED
      : copyOf != null ? (saved.parseWritten ? 'copy, parse written' : 'copy, nothing new')
      : saved && saved.parseWritten ? 'parse written' : 'nothing new',
    copyOf,
    saved,
    failed
  };
}

/* ------------------------------------------------- the scanner's call */

/* NOSE keeps coa.js's reply within 10s - its own budget, not a Netlify
   limit. Netlify's "Configuration for functions" gives a synchronous
   function 60s (read 2026-10-16). The fetch chain alone may spend 8s of the
   10, so the two writes together get at most 2s of whatever is left before
   9s, and are skipped outright when too little is left to be worth starting.
   A stored row is worth less than a reply that arrives. */
const ARCHIVE_DEADLINE_MS = 9000;         // measured from the start of coa.js's handler
const ARCHIVE_BUDGET_MS   = 2000;         // the PDF and database writes, together
const ARCHIVE_MIN_MS      = 300;          // below this, do not start
const ARCHIVE_LIMITS = Object.freeze({ ARCHIVE_DEADLINE_MS, ARCHIVE_BUDGET_MS, ARCHIVE_MIN_MS });

/* ONLY the production deploy stores anything. Deploy previews and branch
   deploys share the site's Blobs store, so a preview scan would write into the
   real archive. The context, like the two version stamps stored with every
   scan, comes from build-info.json, which build.sh writes and esbuild bundles
   (lib/version.js); a missing file reads as 'dev', and dev stores nothing. */
const archiveOn = () => buildInfo().deployContext === 'production';

/* Keep the report and what was read from it, without ever changing what the
 * person is told. coa.js calls this once per parse, on the production deploy.
 *
 * WHAT IS PASSED: the PDF bytes, the address they came from, the extracted
 * text and the parser's output, and the deadline coa.js measured from the
 * start of its handler. Nothing about the person - no IP, no header, no user
 * agent, no cookie, no session, no account. Neither the request nor
 * Netlify's Context is ever handed to this module: test/archive-wiring-test.js
 * fails if a function here takes one - or the old format's `event` - or reads
 * anything off one.
 *
 * WHAT IS KEPT: a lab report, known by two of its three signs - a laboratory
 * the parser recognised, "Certificate of Analysis" in the text, a terpene
 * panel (labReportSigns) - refusals included. One sign is not enough: a
 * receipt or a label can name a lab. What was read goes to Postgres first,
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
 * so a day the archive stopped filling can be seen. The lines still begin
 * "coa:", the function they come from.
 */
async function archiveScan(buffer, finalUrl, text, result, deadline){
  const left = deadline - Date.now();
  if (left < ARCHIVE_MIN_MS) return { kept: false, reason: 'no time left' };
  try {
    const { parserVersion, extractorVersion } = buildInfo();
    const outcome = await storeScan(
      { buffer, finalUrl, text, output: result, context: 'production', parserVersion, extractorVersion },
      { timeoutMs: Math.min(ARCHIVE_BUDGET_MS, left) });
    if (outcome.failed && outcome.failed.length)
      console.error('coa: archive incomplete, reply unaffected:', outcome.failed.join('; '));
    if (outcome.db === DAILY_CAP)
      console.error('coa: archive at its daily cap - nothing kept, reply unaffected');
    return outcome;
  } catch (err) {
    console.error('coa: archive skipped, reply unaffected:', reason(err));
    return { kept: false, reason: 'failed' };
  }
}

module.exports = {
  storeScan, looksLikeLabReport, labReportSigns, signsShown, sourceAddress, reason, utcDay,
  archiveScan, archiveOn, ARCHIVE_LIMITS,
  MAX_TEXT, DEFAULT_TIMEOUT_MS, DATABASE_SHARE, MIN_PDF_MS, MIN_SIGNS, WITHHELD, DAILY_CAP
};

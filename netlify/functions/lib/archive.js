'use strict';
/* NOSE - the archive's storage path, shared by the scanner (coa.js) and the
 * seed script (scripts/seed-from-fixtures.js), so a seed run proves the same
 * code a real scan runs.
 *
 *   storeScan(scan, options) -> { kept, pdf, db, copyOf, saved, failed }
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
 *   database failed, timed out, or is not   PDF written, so backfill-from-
 *     configured                            blobs.js can still save it later
 *
 * BOUNDED TOGETHER: the database gets at most half of timeoutMs, and the PDF
 * whatever is left of the whole, so neither a hung database nor a hung Blobs
 * write can take the pair past timeoutMs. A database that hangs still leaves
 * the PDF its half. scripts/archive-health.js reports a file that one half
 * has and the other lacks.
 *
 * WHAT IS KEPT: whatever looks like a lab report - the parser named a
 * laboratory, the text says "Certificate of Analysis", or at least one terpene
 * was read. Refused and unusable reports ARE kept: the refusals are how parser
 * faults get found. A PDF that is none of these is not kept at all, in either
 * place - it could be somebody's personal document, linked by mistake.
 *
 * NOTHING ABOUT THE PERSON. This module is never handed the request, so it
 * cannot store anything from it. The address it keeps has lost its query and
 * fragment: signed links carry a temporary credential there (X-Amz-Signature,
 * Signature, Expires) and order pages carry tokens that can point back at
 * whoever received the link. Dates are UTC days, never times.
 *
 * NOTHING IS LOGGED HERE. `failed` holds short reasons with any file
 * fingerprint or address scrubbed out; the caller decides what to print.
 */

const crypto = require('crypto');

const MAX_TEXT = 256 * 1024;        // real reports run 2-30KB of text
const DEFAULT_TIMEOUT_MS = 2000;
const BACKSTOP_MS = 50;             // store.js bounds itself; this bounds store.js
const DATABASE_SHARE = 0.5;         // of timeoutMs; the PDF has the rest
const MIN_PDF_MS = 50;              // less than this left: the PDF write is not started
const NOT_CONFIGURED = 'not configured';

function looksLikeLabReport(output, text) {
  if (!output || typeof output !== 'object') return false;
  if (output.lab) return true;
  if (typeof text === 'string' && /certificate\s+of\s+analysis/i.test(text)) return true;
  return !!(output.terps && typeof output.terps === 'object' && Object.keys(output.terps).length > 0);
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

module.exports = {
  storeScan, looksLikeLabReport, sourceAddress, reason, utcDay,
  MAX_TEXT, DEFAULT_TIMEOUT_MS, DATABASE_SHARE, MIN_PDF_MS
};

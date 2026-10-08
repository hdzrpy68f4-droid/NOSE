// NOSE for dispensaries: a store sends its catalog. PARSER-HANDOFF s14,
// "Catalog upload and the batch reader".
//
//   POST /.netlify/functions/b2b-catalog
//   Authorization: Bearer nsk_...      the store's secret key
//   Content-Type: text/csv; charset=utf-8
//   (the catalog itself: docs/B2B-CATALOG-FORMAT.md)
//
// OFF unless b2bEnabled() (lib/b2b-flag.js): B2B_ENABLED=1 in Netlify's
// Production context AND a production build. Off, every request gets the same
// plain 404, before its method, key or body is looked at - so a dev run or a
// deploy preview never reaches the production database.
//
// THE KEY is the store's SECRET key, sent by its own server. Its SHA-256
// finds the store, and the hash is compared in constant time
// (lib/b2b-store.js, storeForSecretKey). A public key, a revoked key, a key
// never issued and no key at all get one and the same 401: the reply never
// says which.
//
// THE BODY is the CSV, at most 4 MB: checked from Content-Length before it is
// read, and counted while it is read, so a larger body is never held whole.
// Netlify caps a buffered request at 6 MB, and at about 4.5 MB when it
// base64-encodes the body (docs.netlify.com, "Configuration for functions",
// Default values, read 2026-10-08). The file is read by
// lib/b2b-catalog-format.js, the coverage report's own reader: the same
// columns refuse the whole file (a personal-looking one first), the same
// reasons refuse a row. lib/b2b-store.js then refuses the rows the database
// could not hold - a coa_url that is not https, a value too long, a line
// break inside one.
//
// EACH UPLOAD IS A WHOLE SNAPSHOT, written in one statement: the listed
// batches are added or updated, with their row number as list_position, and
// every other batch the store has listed is KEPT and marked out of stock - a
// shopper's past purchases are usually sold out, and the feed must still find
// them. A refused row leaves its batch as it was. An upload with no row NOSE
// can keep changes nothing: an empty snapshot would take every batch out of
// stock.
//
// THE REPLY holds counts only - received, upserted, marked out of stock - and
// the refused rows by row number and reason. A catalog describes products and
// batches, never a shopper, and nothing here reads anything about the caller:
// no address, no user agent, no time of day; the database keeps UTC days.
// Logs: nothing on success, one fixed line without detail on failure.
//
// Lab reports are not fetched here, and nothing here reaches the lab-report
// archive: scripts/b2b-read-catalog.js reads each listed batch's report, from
// the Codespace, into schema b2b alone.
//
// Written as palate-sync.js is: one default export, taking a Request and
// returning a Response, and nothing else exported. The lib/ files are
// CommonJS, so each is imported whole (Netlify, "Configuration for functions",
// Module format: no named imports from a CommonJS module).

import flag from './lib/b2b-flag.js';
import b2b from './lib/b2b-store.js';
import format from './lib/b2b-catalog-format.js';

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const DB_TIMEOUT_MS = 8000;

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const reply = (data, status, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...headers, ...extra } });

const NOTHING_CHANGED = 'Nothing was changed.';
const SAYS = Object.freeze({
  unauthorized: `This needs the store's working secret key, sent as: Authorization: Bearer nsk_... ${NOTHING_CHANGED}`,
  method: 'Send the catalog with POST.',
  tooLarge: `The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. ${NOTHING_CHANGED}`,
  unreadable: `The upload could not be read. ${NOTHING_CHANGED}`,
  nothingKept: 'refused: no row of the file can be kept, so nothing was changed. An upload is the whole catalog: ' +
               'an empty one would mark every batch out of stock.',
  unavailable: 'The catalog could not be saved just now. Send the whole file again later: an upload is a whole ' +
               'snapshot, so sending the same file twice changes nothing more.'
});

/* One fixed line each, and nothing else ever logged. */
const LOG = Object.freeze({
  notConfigured: 'b2b-catalog: no database configured - nothing saved',
  keyUnchecked: 'b2b-catalog: key not checked - the database did not answer; nothing saved',
  notConfirmed: 'b2b-catalog: upload not confirmed - the database did not answer'
});

const notFound = () => new Response('Not Found', {
  status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
});
const unauthorized = () => reply({ error: 'unauthorized', reason: SAYS.unauthorized }, 401, { 'www-authenticate': 'Bearer' });
const unavailable = () => reply({ error: 'unavailable', reason: SAYS.unavailable }, 503);

/* "Bearer <key>", the scheme in any case (RFC 7235), one key and nothing else. */
function bearer(value) {
  const m = /^bearer[ \t]+(\S+)[ \t]*$/i.exec(value || '');
  return m ? m[1] : null;
}

/* The body, counted as it arrives: { bytes }, { tooLarge } or { unreadable }. */
async function readCapped(request, max) {
  if (!request.body) return { bytes: Buffer.alloc(0) };
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    let got;
    try { got = await reader.read(); } catch { return { unreadable: true }; }
    if (got.done) break;
    size += got.value.byteLength;
    if (size > max) {
      try { await reader.cancel(); } catch { /* the reply is the same */ }
      return { tooLarge: true };
    }
    chunks.push(Buffer.from(got.value.buffer, got.value.byteOffset, got.value.byteLength));
  }
  return { bytes: Buffer.concat(chunks) };
}

export default async (request) => {
  if (!flag.b2bEnabled()) return notFound();
  if (request.method !== 'POST') return reply({ error: 'method-not-allowed', reason: SAYS.method }, 405, { allow: 'POST' });

  const key = bearer(request.headers.get('authorization'));
  if (b2b.keyKind(key) !== 'secret') return unauthorized();

  const declared = request.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared.trim()) && Number(declared.trim()) > MAX_UPLOAD_BYTES) {
    return reply({ error: 'too-large', reason: SAYS.tooLarge }, 413);
  }

  if (!b2b.configured()) {
    console.error(LOG.notConfigured);
    return unavailable();
  }
  let store;
  try { store = await b2b.storeForSecretKey(key); }
  catch {
    console.error(LOG.keyUnchecked);
    return unavailable();
  }
  if (!store) return unauthorized();

  const body = await readCapped(request, MAX_UPLOAD_BYTES);
  if (body.tooLarge) return reply({ error: 'too-large', reason: SAYS.tooLarge }, 413);
  if (body.unreadable) return reply({ error: 'unreadable-body', reason: SAYS.unreadable }, 400);

  const read = format.readCatalog(body.bytes);
  if (read.refusal) return reply({ error: 'refused', reason: read.refusal }, 422);

  const { batches, refused, listed } = b2b.batchesFromCatalog(read.rows);
  const received = read.rows.length;
  if (!batches.length) return reply({ error: 'refused', reason: SAYS.nothingKept, received, refused }, 422);

  let done;
  try { done = await b2b.applyCatalog(store.storeId, batches, listed, { timeoutMs: DB_TIMEOUT_MS }); }
  catch {
    console.error(LOG.notConfirmed);
    return unavailable();
  }
  return reply({ received, upserted: done.inserted + done.updated, markedOutOfStock: done.markedOutOfStock, refused }, 200);
};

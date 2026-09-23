'use strict';
/* NOSE - the PDF half of the archive: Netlify Blobs.
 *
 * One SITE-WIDE store, "coa-pdf". Never getDeployStore: a deploy store belongs
 * to a single deploy, so every deploy would begin an empty archive. Site-wide
 * also means deploy previews and branch deploys can reach it, which is why
 * coa.js stores nothing outside the production context (lib/version.js).
 *
 * KEY: the SHA-256 of the PDF's bytes - the same fingerprint nose.documents is
 * keyed by, so the two halves of the archive join on it. Written only if the
 * key is new (onlyIfNew): the same file scanned again writes nothing, and a
 * stored copy is never replaced.
 *
 * METADATA: { sourceUrl, fetchedAt }, nothing else.
 *   sourceUrl  the address with its query and fragment already removed by
 *              lib/archive.js; null when there is none, or when it would not
 *              fit Blobs' 2KB metadata limit
 *   fetchedAt  the UTC DAY, never a time - the database's rule too, so a
 *              stored file cannot be lined up against request logs
 *
 * Only this module touches @netlify/blobs, and only when called, so a test or
 * a run without the package never loads it.
 */

const crypto = require('crypto');

const STORE_NAME = 'coa-pdf';
const MAX_SOURCE_URL = 1024;          // Blobs caps metadata at 2KB, JSON-encoded
const SHA256_HEX = /^[0-9a-f]{64}$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const blobs = () => require('@netlify/blobs');

/* A Lambda-style function (exports.handler) is not handed the Blobs context
 * automatically: without this, every write fails. connectLambda reads
 * event.blobs and the x-nf-site-id / x-nf-deploy-id headers - which site and
 * deploy, never who is asking - and keeps nothing else. */
function connect(event) {
  blobs().connectLambda(event);
}

/* Inside a function, after connect(): no arguments. From a Codespace script:
 * the site's ID and a Netlify personal access token. */
function open({ siteID, token } = {}) {
  if (siteID || token) {
    if (!siteID || !token) throw new Error('pdf-store: outside Netlify both a site ID and a token are needed');
    return blobs().getStore({ name: STORE_NAME, siteID, token });
  }
  return blobs().getStore(STORE_NAME);
}

function metadataFor({ sourceUrl, fetchedAt } = {}) {
  return {
    sourceUrl: typeof sourceUrl === 'string' && sourceUrl.startsWith('https://') &&
               sourceUrl.length <= MAX_SOURCE_URL ? sourceUrl : null,
    fetchedAt: typeof fetchedAt === 'string' && DAY.test(fetchedAt) ? fetchedAt : null
  };
}

/* Store one PDF unless its key is already there. { written } says which. */
async function put(store, sha256, bytes, meta) {
  if (!SHA256_HEX.test(String(sha256))) throw new Error('pdf-store: the key must be a SHA-256 hex digest');
  if (!bytes || !bytes.byteLength) throw new Error('pdf-store: no bytes to store');
  /* The exact bytes as an ArrayBuffer, one of the types set() accepts. A
     Buffer can be a view into a larger shared pool; slicing copies only its
     own range. */
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const res = await store.set(sha256, data, { metadata: metadataFor(meta), onlyIfNew: true });
  return { written: !!(res && res.modified) };
}

/* Every key in the store; list() follows the pages itself. */
async function keys(store) {
  const { blobs: listed } = await store.list();
  return listed.map(b => b.key);
}

/* Download one stored PDF: its size, and the SHA-256 of what came back. */
async function measure(store, key) {
  const data = await store.get(key, { type: 'arrayBuffer' });
  if (data == null) return null;
  const buf = Buffer.from(data);
  return { bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

module.exports = { STORE_NAME, connect, open, put, keys, measure, metadataFor };

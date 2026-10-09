'use strict';
/* NOSE for dispensaries - pinned widget releases, in Netlify Blobs.
 * PARSER-HANDOFF s14, "Pinned releases".
 *
 * A release is the widget a store's page pins with an integrity hash: two
 * files, built once from one commit by scripts/b2b-release.js and never
 * changed after.
 *
 *   nose-matches.js    js/match-math, js/b2b-rank, js/aroma-bar,
 *                      js/b2b-strings and js/b2b-widget, verbatim and in that
 *                      order - the widget's two stylesheet lines naming this
 *                      release's own stylesheet and its sha384
 *   nose-matches.css   css/b2b-widget, verbatim
 *
 * ONE SITE-WIDE STORE, "b2b-releases": never getDeployStore, which would
 * belong to one deploy and empty itself on the next. Site-wide means every
 * deploy can read it, previews included; nothing that runs on Netlify writes
 * or deletes in it. Only scripts/b2b-release.js writes, from the Codespace,
 * and only with onlyIfNew - a key that exists is never written again - and
 * nothing anywhere deletes a release. Git holds no built release: a release
 * is rebuilt from its commit by scripts/b2b-release-check.js and compared
 * with docs/B2B-RELEASES.md, which records its version, commit and the two
 * sha384 values.
 *
 * KEYS: <version>/<file>, the version a whole number from 1 (no leading
 * zero), the file one of the two names above. Served by
 * netlify/functions/b2b-release.js at /b2b/releases/<version>/<file>.
 *
 * Holds nothing about anyone: the files are code and words that are the same
 * for every visitor. Nothing here reads a request or logs.
 */

const crypto = require('crypto');

const STORE_NAME = 'b2b-releases';
const FILES = Object.freeze({
  'nose-matches.js': 'text/javascript; charset=utf-8',
  'nose-matches.css': 'text/css; charset=utf-8'
});
const JS = 'nose-matches.js';
const CSS = 'nose-matches.css';
const VERSION = /^[1-9][0-9]{0,5}$/;
const PATH_PREFIX = '/b2b/releases/';
const PATH = /^\/b2b\/releases\/([1-9][0-9]{0,5})\/(nose-matches\.(?:js|css))$/;

/* What a release's reply carries, and nothing else: the browser caches it for
   a year and never asks again (immutable); any origin may read it, which
   integrity checking needs from a store's page (crossorigin="anonymous");
   any origin may embed it; and the browser runs or applies it only as what
   it is (nosniff). */
const CACHE = 'public, max-age=31536000, immutable';
function headers(file) {
  if (!Object.prototype.hasOwnProperty.call(FILES, file)) throw new TypeError('b2b-releases: not a release file');
  return {
    'content-type': FILES[file],
    'cache-control': CACHE,
    'access-control-allow-origin': '*',
    'cross-origin-resource-policy': 'cross-origin',
    'x-content-type-options': 'nosniff'
  };
}

function versionOf(v) {
  const s = typeof v === 'number' ? String(v) : v;
  if (typeof s !== 'string' || !VERSION.test(s)) throw new TypeError('b2b-releases: a version is a whole number from 1');
  return s;
}
function fileOf(f) {
  if (!Object.prototype.hasOwnProperty.call(FILES, f)) throw new TypeError('b2b-releases: not a release file');
  return f;
}
const key = (version, file) => `${versionOf(version)}/${fileOf(file)}`;
const releasePath = (version, file) => `${PATH_PREFIX}${versionOf(version)}/${fileOf(file)}`;

/* /b2b/releases/<version>/<file>, exactly, or null. */
function parsePath(pathname) {
  const m = typeof pathname === 'string' ? PATH.exec(pathname) : null;
  return m ? { version: m[1], file: m[2] } : null;
}

/* The integrity value a page writes: sha384, base64. */
const sri = bytes => `sha384-${crypto.createHash('sha384').update(bytes).digest('base64')}`;

const blobs = () => require('@netlify/blobs');

/* Inside a function written as a default export taking a Request, Netlify
   hands Blobs its context itself. From a Codespace script: the site's ID and
   a Netlify personal access token, and strong consistency, so a script reads
   back exactly what it wrote. */
function open({ siteID, token, consistency } = {}) {
  if (siteID || token) {
    if (!siteID || !token) throw new Error('b2b-releases: outside Netlify both a site ID and a token are needed');
    return blobs().getStore({ name: STORE_NAME, siteID, token, consistency: consistency || 'strong' });
  }
  return blobs().getStore({ name: STORE_NAME });
}

/* One file's bytes, or null when the store holds none. */
async function read(store, version, file) {
  const data = await store.get(key(version, file), { type: 'arrayBuffer' });
  if (data === null || data === undefined) return null;
  return Buffer.from(data);
}

/* Write one file, only if its key is new: 'written' or 'exists'. A write
   counts only with an ETag: for a conditional write @netlify/blobs 10.x
   answers { modified: true } on any status but 412 - a 401, 403 or 503
   included - without throwing (lib/pdf-store.js, put), so `modified` alone
   proves nothing. */
async function put(store, version, file, bytes) {
  const b = Buffer.from(bytes);
  const body = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const res = await store.set(key(version, file), body, { onlyIfNew: true });
  if (res && res.modified === false) return 'exists';
  if (res && res.modified === true && typeof res.etag === 'string' && res.etag) return 'written';
  throw new Error('b2b-releases: Netlify Blobs did not confirm the write (no ETag) - counted as failed');
}

/* Every key in the store, as { version: [files] }; a key of any other shape
   is listed under "other", so nothing in the store goes unseen. */
async function inventory(store) {
  const res = await store.list();
  if (!res || !Array.isArray(res.blobs)) throw new Error('b2b-releases: Netlify Blobs answered a listing without a list');
  const versions = {};
  const other = [];
  for (const { key: k } of res.blobs) {
    const m = /^([1-9][0-9]{0,5})\/(nose-matches\.(?:js|css))$/.exec(k);
    if (!m) { other.push(k); continue; }
    (versions[m[1]] = versions[m[1]] || []).push(m[2]);
  }
  for (const v of Object.keys(versions)) versions[v].sort();
  return { versions, other: other.sort() };
}

module.exports = {
  STORE_NAME, FILES, JS, CSS, VERSION, PATH_PREFIX, CACHE,
  headers, key, releasePath, parsePath, versionOf, sri, open, read, put, inventory
};

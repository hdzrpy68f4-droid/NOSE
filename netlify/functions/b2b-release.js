// NOSE for dispensaries: serves a pinned widget release - the one file a
// store's page loads with an integrity hash, and the stylesheet it links.
// PARSER-HANDOFF s14, "Pinned releases".
//
//   GET /b2b/releases/<version>/nose-matches.js
//   GET /b2b/releases/<version>/nose-matches.css
//
// THE SAME BYTES FOREVER. Each version was built once from one commit by
// scripts/b2b-release.js and written to the "b2b-releases" Blobs store with
// onlyIfNew; this function only reads it, and no deploy changes what it holds
// (lib/b2b-releases.js). A store's page names the script's sha384, and the
// script names its stylesheet's, so a browser refuses any other bytes.
//
// THE REPLY: the file, with Content-Type for what it is, Cache-Control:
// public, max-age=31536000, immutable, Access-Control-Allow-Origin: *,
// Cross-Origin-Resource-Policy: cross-origin and X-Content-Type-Options:
// nosniff. A script or stylesheet loaded with an integrity hash from another
// origin is checked only through CORS - the page asks with
// crossorigin="anonymous" and the reply must allow its origin - or the
// browser blocks it (MDN, "Subresource Integrity", cross-origin resources).
// Netlify caches a function's reply only when it says so, and clears the
// cache on every deploy, after which the same bytes are read again (Netlify
// docs, "Caching overview"). Netlify's custom headers do not apply to a
// function's reply (docs, "Custom headers", Limitations), so these are all it
// carries. Anything but a release - a missing version, any other path, a
// query - is a plain 404 that nothing caches.
//
// OFF unless b2bEnabled() (lib/b2b-flag.js): B2B_ENABLED=1 in Netlify's
// Production context AND a production build. Off, every request gets the same
// plain 404, before its method or path is looked at.
//
// It reads nothing about the caller - no Origin, address, user agent, cookie,
// referrer, context, geography or time - only the method and the path. Logs:
// nothing on success, one fixed line on failure.
//
// Routed by config.path (Netlify docs, "Functions configuration", Routing):
// with a path set, the function answers there and not at
// /.netlify/functions/b2b-release. Written as b2b-feed.js is: a default
// export taking a Request; the lib/ files are CommonJS and imported whole.

import flag from './lib/b2b-flag.js';
import releases from './lib/b2b-releases.js';

export const config = { path: '/b2b/releases/:version/:file' };

const STORE_TIMEOUT_MS = 4000;
const LOG = Object.freeze({ failed: 'b2b-release: the release store did not answer - nothing served' });

const plain = (body, status, extra = {}) => new Response(body, {
  status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...extra }
});
const notFound = () => plain('Not Found', 404);

/* The release a path names, or null: /b2b/releases/<version>/<file> exactly,
   with nothing after it - not even an empty "?" - so each file has one
   address, and one entry in any cache. */
function releaseOf(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.search || u.hash || /[?#]/.test(u.href)) return null;
  return releases.parsePath(u.pathname);
}

function within(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timed out')), ms); })])
    .finally(() => clearTimeout(timer));
}

export default async (request) => {
  if (!flag.b2bEnabled()) return notFound();
  if (request.method !== 'GET' && request.method !== 'HEAD') return plain('Method Not Allowed', 405, { allow: 'GET, HEAD' });

  const wanted = releaseOf(request.url);
  if (!wanted) return notFound();

  let bytes;
  try { bytes = await within(releases.read(releases.open(), wanted.version, wanted.file), STORE_TIMEOUT_MS); }
  catch {
    console.error(LOG.failed);
    return plain('Service Unavailable', 503);
  }
  if (!bytes) return notFound();

  return new Response(request.method === 'HEAD' ? null : bytes, { status: 200, headers: releases.headers(wanted.file) });
};

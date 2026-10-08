// NOSE for dispensaries: the feed the widget on a store's page reads - one
// of the widget's only two calls to NOSE (the other is b2b-vote.js).
// PARSER-HANDOFF s14, "Feed and votes".
//
//   GET /.netlify/functions/b2b-feed?key=npk_...
//
// THE SAME REPLY FOR EVERY VISITOR of a store. The public key names the store
// and is not a secret; the request carries nothing about the shopper, and the
// shopper's purchases never leave their browser - the widget builds the
// palate and ranks there. The reply is every batch the store listed within
// its window, in stock or not (a shopper's past purchases are usually out of
// stock and must still be found), each with batch_id, product_id,
// list_position, category, route, name, brand, product_url, in_stock,
// thc_percent, cbd_percent, lab, harvest_on, report_on, usable,
// total_terpenes and terps - plus the store's window and guardrail. No sales,
// no quantities, no lab-report link (a catalog's link can carry a credential
// in its query, s14). Of a batch's reading only the one NOSE stands by: lab,
// days and verdict from it, terps and total_terpenes only when it was
// accepted - never another link's numbers, never a guess (lib/b2b-store.js,
// FEED_SQL). usable is null when there is no such reading.
//
// THE ORIGIN RULE. The request's Origin header must be one of the store's
// allowed_origins, exactly as a browser sends it. Then the reply echoes it in
// Access-Control-Allow-Origin, with Vary: Origin. No other origin gets the
// header or any data: a missing Origin, "null", another store's origin, a
// look-alike - 403, nothing read past the store's settings. A cross-origin
// GET with no custom headers is a CORS simple request, so no preflight
// happens; this function answers GET alone, so a widget that adds a header or
// asks for credentials fails closed (MDN, "Cross-Origin Resource Sharing
// (CORS)": simple requests; Access-Control-Allow-Origin with Vary: Origin;
// credentials not sent by default).
//
// BRIEFLY CACHEABLE: Cache-Control: public, max-age=60. Netlify caches a
// function's response only when it says so, keys it by the query string
// (which names the store) and by every header in Vary (so each allowed
// origin is cached apart, with its own Access-Control-Allow-Origin), and
// clears it on every deploy (Netlify docs, "Caching overview": default
// caching behavior, Vary, automatic invalidation). So a catalog upload, a
// revoked key or a deleted store shows within 60 seconds; a deploy ends it at
// once. Every reply but the feed itself is no-store.
//
// OFF unless b2bEnabled() (lib/b2b-flag.js): B2B_ENABLED=1 in Netlify's
// Production context AND a production build. Off, every request gets the same
// plain 404, before its method or query is looked at.
//
// It reads nothing about the caller beyond the Origin header: no address,
// user agent, cookie, context, geography or time. Logs: nothing on success,
// one fixed line without detail on failure. Netlify's custom headers do not
// apply to function responses (docs, "Custom headers", Limitations), so the
// headers below are all this reply carries.
//
// Written as b2b-catalog.js is: one default export, taking a Request and
// returning a Response, and nothing else exported; the lib/ files are
// CommonJS and imported whole.

import flag from './lib/b2b-flag.js';
import b2b from './lib/b2b-store.js';

const CACHE = 'public, max-age=60';
const DB_TIMEOUT_MS = 4000;

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const reply = (data, status, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...headers, ...extra } });

const SAYS = Object.freeze({
  method: 'Read the feed with GET.',
  query: 'Ask for the feed as /.netlify/functions/b2b-feed?key=npk_..., with the store\'s public key and nothing else.',
  key: 'This needs the store\'s working public key (npk_...).',
  origin: 'The feed is served only to a page at one of the store\'s own origins.',
  unavailable: 'The feed could not be read just now.'
});

/* One fixed line each, and nothing else ever logged. */
const LOG = Object.freeze({
  notConfigured: 'b2b-feed: no database configured - no feed served',
  failed: 'b2b-feed: the database did not answer - no feed served'
});

const notFound = () => new Response('Not Found', {
  status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
});
const forbidden = reason => reply({ error: 'forbidden', reason }, 403);
const unavailable = () => reply({ error: 'unavailable', reason: SAYS.unavailable }, 503);

/* The one query parameter, key, given once - or null. */
function keyOf(url) {
  let params;
  try { params = [...new URL(url).searchParams]; } catch { return null; }
  return params.length === 1 && params[0][0] === 'key' ? params[0][1] : null;
}

export default async (request) => {
  if (!flag.b2bEnabled()) return notFound();
  if (request.method !== 'GET') return reply({ error: 'method-not-allowed', reason: SAYS.method }, 405, { allow: 'GET' });

  const key = keyOf(request.url);
  if (b2b.keyKind(key) !== 'public') return reply({ error: 'bad-request', reason: SAYS.query }, 400);

  if (!b2b.configured()) {
    console.error(LOG.notConfigured);
    return unavailable();
  }
  const origin = request.headers.get('origin');
  let found;
  try { found = await b2b.feedFor(key, origin, { timeoutMs: DB_TIMEOUT_MS }); }
  catch {
    console.error(LOG.failed);
    return unavailable();
  }
  if (!found || typeof found !== 'object') return unavailable();
  if (found.refused === 'key') return forbidden(SAYS.key);
  if (found.refused) return forbidden(SAYS.origin);

  return new Response(JSON.stringify(found.feed), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': CACHE,
      vary: 'Origin',
      'access-control-allow-origin': origin,
      'x-content-type-options': 'nosniff'
    }
  });
};

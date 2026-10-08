// NOSE for dispensaries: a shopper's vote on a match - "Was the flavor
// close?" - sent from the store's page by the widget. PARSER-HANDOFF s14,
// "Feed and votes".
//
//   POST /.netlify/functions/b2b-vote
//   Content-Type: text/plain;charset=UTF-8
//   {"key":"npk_...","candidate":"<product_id>","score":74,"band":"Moderate","palateSize":3,"vote":"up"}
//
// A text/plain body is what navigator.sendBeacon sends a string as, and with
// it the request is a no-cors POST that needs no preflight (W3C Beacon,
// "Processing model": a CORS-safelisted Content-Type keeps the mode no-cors).
// Any other Content-Type is refused: from a page it would need a preflight,
// which this function never answers.
//
// OFF unless b2bEnabled() (lib/b2b-flag.js): B2B_ENABLED=1 in Netlify's
// Production context AND a production build. Off, every request gets the same
// plain 404, before its method or body is looked at - so a dev run or a deploy
// preview never reaches the production database or the vote store.
//
// EXACTLY SIX FIELDS, all required, nothing else accepted - no palate list, no
// shopper or session ID, no client time, nothing about the purchase:
//   key         the store's PUBLIC key (npk_), the one its page names
//   candidate   the product voted on: a product_id the store listed within
//               its window, the feed's batches
//   score       a whole number from 0 to 100 - the score the shopper was
//               shown, shownScore() (js/match-math.*.js)
//   band        exactly one of Strong, Good, Moderate, Low - matchBand()'s own
//               names. Not checked against the score: a score within 1e-11
//               below a band's edge shows as the edge while matchBand() gives
//               the band below (PARSER-HANDOFF s13, "The shown score"), and
//               this function holds none of the maths
//   palateSize  how many purchases made the palate, 1 to 1000
//   vote        up | down
//
// THE SAME ORIGIN RULE AS THE FEED: the request's Origin must be one the
// store allows, or nothing is kept (403). A working public key, a product the
// store listed, then lib/b2b-votes.js keeps one blob in the "b2b-votes" store:
// votes/<store slug>/<band>/<vote>/<UTC day>/<random>, holding { candidate,
// score, palateSize }. The day is the database's; no time of day is kept in
// the key or the value. Over the store's daily cap (B2B_VOTE_DAILY_CAP,
// default 100) the vote is dropped and the reply is the same.
//
// It reads nothing about the caller beyond the Origin header and the body: no
// address, user agent, cookie, context, geography or time. A beacon carries
// the page's cookies for this site (credentials "include"), and this function
// never looks at them. Logs: nothing on success, one fixed line without detail
// on a failure or a dropped vote. A valid vote is answered 204 with the origin
// echoed, so a fetch() in cors mode with keepalive reads it as sent; a beacon
// never reads a reply.
//
// Written as palate-sync.js and b2b-catalog.js are: one default export,
// taking a Request and returning a Response, and nothing else exported. The
// lib/ files are CommonJS, so each is imported whole (Netlify, "Configuration
// for functions", Module format); netlify/lib/beacon.js is shared with the
// consumer's beacon endpoints and used as it is.

import flag from './lib/b2b-flag.js';
import b2b from './lib/b2b-store.js';
import votes from './lib/b2b-votes.js';
import { readJsonBody, isInt, noContent, rejected } from '../lib/beacon.js';

const MAX_BODY_CHARS = 2048;
const MAX_PALATE_SIZE = 1000;
const MAX_CANDIDATE = 200;
const DB_TIMEOUT_MS = 4000;
const BLOBS_TIMEOUT_MS = 4000;
const FIELDS = Object.freeze(['key', 'candidate', 'score', 'band', 'palateSize', 'vote']);
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const reply = (data, status, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...headers, ...extra } });

const SAYS = Object.freeze({
  method: 'Send a vote with POST.',
  mediaType: 'Send the vote as a text/plain body, as navigator.sendBeacon sends a string.',
  key: 'This needs the store\'s working public key (npk_...). The vote was not kept.',
  origin: 'Votes are taken only from a page at one of the store\'s own origins. The vote was not kept.',
  unavailable: 'The vote could not be kept just now.'
});

/* One fixed line each, and nothing else ever logged. */
const LOG = Object.freeze({
  notConfigured: 'b2b-vote: no database configured - vote not kept',
  dbFailed: 'b2b-vote: the database did not answer - vote not kept',
  blobsFailed: 'b2b-vote: the vote store did not answer - vote not kept',
  capped: 'b2b-vote: a store reached its daily cap - vote dropped, reply unaffected'
});

const notFound = () => new Response('Not Found', {
  status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
});
const forbidden = reason => reply({ error: 'forbidden', reason }, 403);
const unavailable = () => reply({ error: 'unavailable', reason: SAYS.unavailable }, 503);

/* The media type, parameters aside: text/plain;charset=UTF-8 is text/plain. */
function isTextPlain(value) {
  return typeof value === 'string' && value.split(';')[0].trim().toLowerCase() === 'text/plain';
}

/* As b2b.batches holds a product_id: trimmed, 1 to 200 characters, no
   control character. */
function isProductId(v) {
  return typeof v === 'string' && v !== '' && v === v.trim() && Array.from(v).length <= MAX_CANDIDATE && !CONTROL.test(v);
}

function validate(d) {
  for (const k of Object.keys(d)) if (!FIELDS.includes(k)) return { ok: false, reason: 'unknown-field' };
  for (const f of FIELDS) if (!Object.prototype.hasOwnProperty.call(d, f)) return { ok: false, reason: 'missing-field' };
  if (b2b.keyKind(d.key) !== 'public') return { ok: false, reason: 'bad-key' };
  if (!isProductId(d.candidate)) return { ok: false, reason: 'bad-candidate' };
  if (!isInt(d.score, 0, 100)) return { ok: false, reason: 'bad-score' };
  if (!votes.BANDS.includes(d.band)) return { ok: false, reason: 'bad-band' };
  if (!isInt(d.palateSize, 1, MAX_PALATE_SIZE)) return { ok: false, reason: 'bad-palate-size' };
  if (!votes.VOTES.includes(d.vote)) return { ok: false, reason: 'bad-vote' };
  return { ok: true, value: { key: d.key, candidate: d.candidate, score: d.score, band: d.band, palateSize: d.palateSize, vote: d.vote } };
}

function within(promise, ms) {
  let timer;
  const giveUp = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`gave up after ${ms}ms`)), ms); });
  return Promise.race([promise, giveUp]).finally(() => clearTimeout(timer));
}

export default async (request) => {
  if (!flag.b2bEnabled()) return notFound();
  if (request.method !== 'POST') return reply({ error: 'method-not-allowed', reason: SAYS.method }, 405, { allow: 'POST' });
  if (!isTextPlain(request.headers.get('content-type'))) return reply({ error: 'unsupported-media-type', reason: SAYS.mediaType }, 415);

  const declared = request.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared.trim()) && Number(declared.trim()) > MAX_BODY_CHARS) return rejected('body-too-large');
  const body = await readJsonBody(request, MAX_BODY_CHARS);
  if (!body.ok) return rejected(body.reason);
  const checked = validate(body.data);
  if (!checked.ok) return rejected(checked.reason);
  const v = checked.value;

  if (!b2b.configured()) {
    console.error(LOG.notConfigured);
    return unavailable();
  }
  const origin = request.headers.get('origin');
  let target;
  try { target = await b2b.voteTarget(v.key, origin, v.candidate, { timeoutMs: DB_TIMEOUT_MS }); }
  catch {
    console.error(LOG.dbFailed);
    return unavailable();
  }
  if (!target || typeof target !== 'object') return unavailable();
  if (target.refused === 'key') return forbidden(SAYS.key);
  if (target.refused === 'origin') return forbidden(SAYS.origin);
  if (target.refused) return rejected('bad-candidate');

  let outcome;
  try {
    outcome = await within(votes.record(votes.open(), {
      slug: target.slug, day: target.day, band: v.band, vote: v.vote,
      candidate: v.candidate, score: v.score, palateSize: v.palateSize
    }), BLOBS_TIMEOUT_MS);
  } catch {
    console.error(LOG.blobsFailed);
    return unavailable();
  }
  if (outcome === 'capped') console.error(LOG.capped);

  /* Kept or dropped at the cap, the same reply. */
  const done = noContent();
  done.headers.set('access-control-allow-origin', origin);
  done.headers.set('vary', 'Origin');
  done.headers.set('cache-control', 'no-store');
  return done;
};

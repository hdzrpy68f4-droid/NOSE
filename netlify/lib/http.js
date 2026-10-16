// Shared helpers for the functions' requests and replies: reading a JSON
// body, the replies every function builds the same way, and a time limit.
// One copy since 2026-10-16 (PARSER-HANDOFF s13, "One set of server
// helpers"); until then auth.js and beacon.js each read bodies their own way,
// and the functions each wrote their own replies.
//
// Lives OUTSIDE netlify/functions, as auth.js and beacon.js do: imported by a
// relative path and inlined by esbuild at build time.
//
// Nothing here reads the request beyond its body, and nothing reads a clock:
// within() sets a timer, it never asks the time.

/**
 * Read and parse a JSON body no longer than `limit` characters.
 * Returns { ok: true, data } or { ok: false, reason }, the reason one of
 * unreadable-body, empty-body, body-too-large, invalid-json, not-an-object.
 * Each caller names its own limit: auth.js 4096, beacon.js 16384,
 * b2b-vote.js 2048. A body that is not a JSON object - null, an array, a
 * string, a number, true - is not-an-object.
 */
export async function readJsonBody(request, { limit } = {}) {
  if (!Number.isInteger(limit) || limit < 0) throw new TypeError('readJsonBody: a limit, in characters, is required');
  let raw;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, reason: 'unreadable-body' };
  }
  if (!raw) return { ok: false, reason: 'empty-body' };
  if (raw.length > limit) return { ok: false, reason: 'body-too-large' };
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, reason: 'not-an-object' };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
}

/* The dispensary functions' replies name their charset; the others' never
   have. Passed as json()'s headers, it replaces the Content-Type. */
export const JSON_UTF8 = Object.freeze({ 'content-type': 'application/json; charset=utf-8' });

/**
 * A JSON reply: Content-Type application/json and Cache-Control no-store,
 * then `headers` - each replacing one of those two or adding its own, by name
 * in any case. `space`, when given, indents the body as JSON.stringify does
 * (feedback-read.js answers a person reading curl).
 */
export function json(data, status = 200, headers = {}, { space } = {}) {
  const h = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
  for (const [name, value] of Object.entries(headers)) h.set(name, value);
  return new Response(space === undefined ? JSON.stringify(data) : JSON.stringify(data, null, space), { status, headers: h });
}

/** The plain 404 the dispensary functions give before anything is looked at. */
export const notFound = () => new Response('Not Found', {
  status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
});

/** 405, naming the methods allowed. */
export const methodNotAllowed = (allow = 'POST') =>
  new Response('Method Not Allowed', { status: 405, headers: { allow } });

/* Wait for promise at most ms. The race stays subscribed to the work it gave
   up on, so a late rejection is still handled rather than crashing the
   process. */
export function within(promise, ms) {
  let timer;
  const giveUp = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`gave up after ${ms}ms`)), ms); });
  return Promise.race([promise, giveUp]).finally(() => clearTimeout(timer));
}

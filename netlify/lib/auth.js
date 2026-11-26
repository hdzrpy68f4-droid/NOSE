// Shared helpers for the auth endpoints.
//
// Lives OUTSIDE netlify/functions on purpose — same reason as beacon.js:
// anything inside that directory risks being registered as a function.
//
// DESIGN, because it is not the obvious one:
//
// The browser never talks to Supabase. Every call in this file runs inside a
// Netlify function, on nose's own origin. That is what keeps the Content
// Security Policy untouched — no `connect-src` widening, no third-party
// script, no hosted login page, nothing for build.sh's inline-script guard to
// catch. Supabase is a password-verification service reached server-side, not
// an SDK in the page.
//
// Sessions are OPAQUE IDS stored in Netlify Blobs, not Supabase JWTs handed to
// the client. That costs one blob read per authenticated request and buys:
//   * real revocation — logout and account deletion actually kill the session,
//     rather than waiting out a token's expiry
//   * no access token in the browser at all
//   * no refresh-token rotation logic to get subtly wrong
//
// Supabase therefore holds email + password hash and nothing else. Palates go
// to Blobs keyed by user id. The auth provider never sees what anyone liked.

import { getStore } from '@netlify/blobs';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readJsonBody as readBody, json } from './http.js';

export const SESSIONS_STORE = 'auth-sessions';
export const RATELIMIT_STORE = 'auth-ratelimit';
export const PALATES_STORE = 'palates';

export const COOKIE_NAME = 'nose_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days, absolute

// Blobs defaults to EVENTUAL consistency: a write can take up to 60s to be
// visible to a read. That is fine for the append-only vote log, and fatal
// here — a user would log in and immediately 401 on the next request. Every
// store in this file is opened strong.
const strongStore = (name) => getStore({ name, consistency: 'strong' });

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

const supabaseUrl = () => env('SUPABASE_URL').replace(/\/+$/, '');
const serviceKey = () => env('SUPABASE_SERVICE_KEY');
/* Which key a call carries (security audit item 10, since 2026-11-16). The
   service key can do anything in the project; only /admin/* needs it. Every
   other call - sign-up, sign-in, reset, verifying a link's code, a user's own
   session - is one Supabase serves to its public key, so that is the key it
   gets, when SUPABASE_PUBLISHABLE_KEY is set. Until it is set those calls
   carry the service key, as they always have. */
const keyFor = (path) =>
  (path.startsWith('/admin/') ? null : process.env.SUPABASE_PUBLISHABLE_KEY) || serviceKey();

/**
 * Call Supabase's auth (GoTrue) REST API server-side.
 * `accessToken` overrides the key for user-scoped calls.
 */
export async function gotrue(path, { method = 'POST', body, accessToken } = {}) {
  let res;
  try {
    res = await fetch(`${supabaseUrl()}/auth/v1${path}`, {
      method,
      headers: {
        apikey: keyFor(path),
        authorization: `Bearer ${accessToken || keyFor(path)}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, status: 0, data: null, networkError: String(err && err.message) };
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  }
  return { ok: res.ok, status: res.status, data };
}

// ---------------------------------------------------------------- validation

export const isEmail = (v) =>
  typeof v === 'string' && v.length >= 3 && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// 10 rather than Supabase's default 6. Length is the only password rule here
// on purpose: composition rules push people toward predictable substitutions
// and a longer minimum is worth more than a symbol requirement.
export const isPassword = (v) => typeof v === 'string' && v.length >= 10 && v.length <= 200;

export const normaliseEmail = (v) => String(v).trim().toLowerCase();

/* The shape of the one-time code in an email link (Supabase's token_hash).
   One of the wrong shape never reaches Supabase. */
export const TOKEN_HASH = /^[A-Za-z0-9_-]{16,256}$/;

/* The six-digit code in the same emails (Supabase's {{ .Token }}, since
   2026-11-25), typed on /account/. Six digits can be guessed where a
   token_hash cannot, so every try is counted (the 'code' bucket below). */
export const OTP_CODE = /^\d{6}$/;

// An auth request's body: a JSON object of at most 4096 characters, read by
// http.js's readJsonBody - the beacons' reader too, each with its own limit.
const MAX_BODY_CHARS = 4096;
export const readJsonBody = (request) => readBody(request, { limit: MAX_BODY_CHARS });

// ------------------------------------------------------- where it came from

/**
 * Is this request a JSON request from a page on this site? Every function
 * that sets, uses or clears the session cookie asks before reading the body.
 * Without it, a page on any other site could post a plain form here - a
 * browser sends a text/plain form cross-site with no preflight - and sign a
 * visitor into an account of the other site's choosing (login CSRF), or log
 * them out. Security audit item 4, since 2026-11-14.
 *
 * The body must be declared application/json, which no plain HTML form can
 * send (a bodiless DELETE passes { json: false }, and a browser preflights
 * any cross-site DELETE, which no CORS header here allows). Then Sec-Fetch-Site, which every current browser sends and a page
 * cannot set, must say same-origin; a client that sends none must send an
 * Origin equal to this request's own. Reads two headers that say which site
 * asked, never who asked, and keeps neither.
 */
export function fromThisSite(request, { json: needJson = true } = {}) {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (needJson && type !== 'application/json') return false;
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

export const crossSite = () =>
  json({ error: 'cross-site', message: 'This request must come from a page on this site.' }, 403);

// ------------------------------------------------------------------- cookies

export function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      // A value that is not valid percent-encoding ("%") is no cookie at all.
      // Until 2026-11-14 decodeURIComponent threw here, and with it every
      // function that reads a session.
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

// SameSite=Lax, not Strict: Strict would drop the cookie when a user arrives
// from an external link (including the password-reset email), making them look
// logged out. Lax still blocks cross-site POST, which is the CSRF case.
export const sessionCookie = (id, maxAge = SESSION_TTL_SECONDS) =>
  `${COOKIE_NAME}=${encodeURIComponent(id)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

export const clearedCookie = () =>
  `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

// ------------------------------------------------------------------ sessions

const SESSION_ID_RE = /^[A-Za-z0-9_-]{32,128}$/;

/**
 * Two keys per session:
 *   sessions/<id>            → the record, read on every authenticated request
 *   by-user/<userId>/<id>    → index, so "log out everywhere" and account
 *                              deletion can find every session without a scan
 */
export async function createSession(user) {
  const id = randomBytes(32).toString('base64url');
  const now = Date.now();
  const record = {
    v: 1,
    userId: user.id,
    email: user.email,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_SECONDS * 1000).toISOString(),
  };
  const store = strongStore(SESSIONS_STORE);
  await store.setJSON(`sessions/${id}`, record);
  await store.setJSON(`by-user/${user.id}/${id}`, { createdAt: record.createdAt });
  return { id, record };
}

/** Returns { id, userId, email, ... } or null. Never throws on a bad cookie. */
export async function readSession(request) {
  const id = readCookie(request, COOKIE_NAME);
  if (!id || !SESSION_ID_RE.test(id)) return null;

  let record = null;
  try {
    record = await strongStore(SESSIONS_STORE).get(`sessions/${id}`, { type: 'json' });
  } catch {
    return null;
  }
  if (!record) return null;

  if (!record.expiresAt || Date.parse(record.expiresAt) <= Date.now()) {
    await destroySession(id, record.userId).catch(() => {});
    return null;
  }
  return { id, ...record };
}

export async function destroySession(id, userId) {
  const store = strongStore(SESSIONS_STORE);
  await store.delete(`sessions/${id}`).catch(() => {});
  if (userId) await store.delete(`by-user/${userId}/${id}`).catch(() => {});
}

/** Used on "log out everywhere" and account deletion — privilege change means
 *  every other session dies, not just the current one.
 *
 *  Throws when the sessions cannot be listed. Until 2026-11-14 it answered 0,
 *  so account-delete reported every session destroyed when none had been
 *  looked at (PARSER-HANDOFF s13, "Sessions end when the privacy page says"). */
export async function destroyAllSessions(userId) {
  const store = strongStore(SESSIONS_STORE);
  const listed = await store.list({ prefix: `by-user/${userId}/` });
  const blobs = (listed && listed.blobs) || [];
  for (const b of blobs) {
    const id = b.key.split('/').pop();
    await store.delete(`sessions/${id}`).catch(() => {});
    await store.delete(b.key).catch(() => {});
  }
  return blobs.length;
}

/**
 * Delete every session record whose 14 days have ended, with its by-user
 * entry, and every record under sessions/ that cannot be read as a session.
 * sessions-purge.js runs it daily: the browser drops the cookie at 14 days,
 * so an expired record's cookie normally never comes back for readSession()
 * to delete it, and the record holds an email address.
 *
 * Returns counts only - never an id, a user id or an address. Throws when
 * the listing fails.
 */
export async function purgeExpiredSessions(now = Date.now()) {
  const store = strongStore(SESSIONS_STORE);
  let scanned = 0, deleted = 0, failed = 0;
  for await (const page of store.list({ prefix: 'sessions/', paginate: true })) {
    for (const blob of page.blobs || []) {
      scanned++;
      let record = null;
      try { record = await store.get(blob.key, { type: 'json' }); } catch { record = null; }
      const isSession = record && typeof record === 'object' && typeof record.expiresAt === 'string';
      if (isSession && Date.parse(record.expiresAt) > now) continue;
      try {
        await store.delete(blob.key);
        if (isSession && typeof record.userId === 'string') {
          await store.delete(`by-user/${record.userId}/${blob.key.split('/').pop()}`);
        }
        deleted++;
      } catch {
        failed++;
      }
    }
  }
  return { scanned, deleted, failed };
}

// ---------------------------------------------------------------- rate limit

/**
 * Fixed-window counter keyed by a hash of the identity.
 *
 * Keyed on EMAIL, not IP — deliberately. The vote and error stores hold no
 * pseudo-identifier and client-error.js says so in writing; introducing an IP
 * counter here would quietly break that position for the whole site. The cost
 * is honest: this throttles attacks against one account, not a distributed
 * spray across many. Supabase applies its own limits behind this.
 *
 * Read-modify-write, so concurrent hits can under-count by one or two, and a
 * store that fails lets the try through (fail open). That is acceptable for
 * login, signup and reset, where a password or an email stands behind it.
 *
 * `strict: true` (since 2026-11-25) is for the 'code' bucket only, the one
 * guard on a six-digit code: the record is read with its etag and the new
 * count written only if nobody wrote in between (onlyIfNew when there was no
 * record, onlyIfMatch on its etag when there was, an ended window included).
 * A lost race, a read or a write that throws, or a write that comes back
 * modified: false refuses the try. No retry: a parallel burst cannot pass
 * more than `limit` tries in a window.
 *
 * Each record holds { start, count } under a fingerprint of the identity: a
 * SHA-256, or, once NOSE_THROTTLE_SECRET is set, an HMAC-SHA-256 keyed with
 * it, which nobody without the secret can compute from an address (security
 * audit item 14's last part, since 2026-11-16). Setting the secret starts
 * every window again, once; the privacy page's sentence about these counts
 * says SHA-256 and changes with it. Since
 * 2026-11-14 a record past its window is deleted daily
 * (purgeExpiredThrottles, run by sessions-purge.js), and deleting an account
 * deletes its address's records (deleteThrottles). Security audit item 14.
 */
/* 'code' (since 2026-11-25) counts tries of an email's six-digit code, in
   auth-confirm and auth-reset-finish together. Every call to Supabase comes
   from Netlify, so Supabase's own per-IP limit does not slow a guesser; this
   count is what does. */
export const THROTTLE_BUCKETS = Object.freeze({ login: 900, signup: 3600, reset: 3600, code: 3600, codesite: 3600 });
/* 'codesite' (since 2026-11-25) is one count for the whole site: every code
   try from every address together. It holds no address, so deleting an
   account has nothing in it to delete. */
const SITE_BUCKET = 'codesite';
const plainDigest = (identity) => createHash('sha256').update(String(identity)).digest('hex').slice(0, 32);
const throttleDigest = (identity) => {
  const secret = process.env.NOSE_THROTTLE_SECRET;
  return secret ? createHmac('sha256', secret).update(String(identity)).digest('hex').slice(0, 32) : plainDigest(identity);
};

export async function rateLimit(bucket, identity, { limit, windowSeconds, strict = false }) {
  const digest = throttleDigest(identity);
  const key = `rl/${bucket}/${digest}`;
  const store = strongStore(RATELIMIT_STORE);
  const now = Date.now();

  if (strict) {
    /* Fails CLOSED, with no retry: a read or write that throws, or a write
       another try got in before (modified: false), refuses this try. */
    try {
      const got = await store.getWithMetadata(key, { type: 'json' });
      const old = got && got.data;
      const live = old && typeof old.start === 'number' && Number.isInteger(old.count)
        && now - old.start <= windowSeconds * 1000;
      const rec = live ? { start: old.start, count: old.count + 1 } : { start: now, count: 1 };
      if (rec.count > limit) return false;
      if (got && !got.etag) return false;
      const res = await store.setJSON(key, rec, got ? { onlyIfMatch: got.etag } : { onlyIfNew: true });
      return Boolean(res && res.modified);
    } catch {
      return false;
    }
  }

  let rec = null;
  try { rec = await store.get(key, { type: 'json' }); } catch { rec = null; }
  if (!rec || typeof rec.start !== 'number' || now - rec.start > windowSeconds * 1000) {
    rec = { start: now, count: 0 };
  }
  rec.count += 1;

  try { await store.setJSON(key, rec); } catch { /* fail open, never 500 a login */ }
  return rec.count <= limit;
}

/** Delete one address's throttle records, in every bucket. Throws if one
 *  cannot be deleted, so account-delete can say so. */
export async function deleteThrottles(email) {
  const store = strongStore(RATELIMIT_STORE);
  /* Both fingerprints once a secret is set: a record written before it was
     set is under the plain one until its window ends. */
  const digests = [...new Set([throttleDigest(email), plainDigest(email)])];
  for (const digest of digests)
    for (const bucket of Object.keys(THROTTLE_BUCKETS))
      if (bucket !== SITE_BUCKET) await store.delete(`rl/${bucket}/${digest}`);
}

/**
 * May this six-digit code try go to Supabase? Five an hour per address, then
 * a brake for the whole site: 300 tries an hour from all addresses together.
 * The per-address count alone lets someone guess across many addresses at
 * once; past the brake every code is refused until the hour ends, and the
 * email's link still works. Both counts are strict (fail closed). The site
 * count is asked only once the address's own count allows the try.
 */
export const codeTryAllowed = async (email) =>
  (await rateLimit('code', email, { limit: 5, windowSeconds: 3600, strict: true }))
  && rateLimit(SITE_BUCKET, 'all', { limit: 300, windowSeconds: 3600, strict: true });

/**
 * Delete every throttle record whose window has ended, and every record that
 * cannot be read as one. A window is at most an hour, so nothing here is
 * older than a day and an hour. Returns counts only; throws when the listing
 * fails.
 */
export async function purgeExpiredThrottles(now = Date.now()) {
  const store = strongStore(RATELIMIT_STORE);
  let scanned = 0, deleted = 0, failed = 0;
  for await (const page of store.list({ prefix: 'rl/', paginate: true })) {
    for (const blob of page.blobs || []) {
      scanned++;
      const window = THROTTLE_BUCKETS[blob.key.split('/')[1]];
      let rec = null;
      try { rec = await store.get(blob.key, { type: 'json' }); } catch { rec = null; }
      const live = window && rec && typeof rec.start === 'number' && now - rec.start <= window * 1000;
      if (live) continue;
      try { await store.delete(blob.key); deleted++; } catch { failed++; }
    }
  }
  return { scanned, deleted, failed };
}

// ------------------------------------------------------------------ palates

export const palateKey = (userId) => `palates/${userId}`;
export const palateStore = () => strongStore(PALATES_STORE);

// ----------------------------------------------------------------- responses
//
// json() and methodNotAllowed() are http.js's, shared with every function;
// these two are the auth endpoints' own.

export const tooMany = () =>
  json({ error: 'rate-limited', message: 'Too many attempts. Wait a few minutes and try again.' }, 429);

/* One answer for a six-digit code that is wrong, expired, of the wrong shape,
   for an address with no account, or past the 'code' throttle (since
   2026-11-25): none of them may tell a caller which it was. */
export const codeRefused = () =>
  json({ error: 'code-refused', message: 'That code is wrong or has expired. Check the newest email, or use the link in it. After five tries, wait an hour.' }, 400);

export const unauthenticated = () =>
  json({ error: 'unauthenticated' }, 401, { 'set-cookie': clearedCookie() });

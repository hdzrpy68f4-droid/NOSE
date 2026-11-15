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
import { createHash, randomBytes } from 'node:crypto';
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

/**
 * Call Supabase's auth (GoTrue) REST API server-side.
 * `accessToken` overrides the service key for user-scoped calls.
 */
export async function gotrue(path, { method = 'POST', body, accessToken } = {}) {
  let res;
  try {
    res = await fetch(`${supabaseUrl()}/auth/v1${path}`, {
      method,
      headers: {
        apikey: serviceKey(),
        authorization: `Bearer ${accessToken || serviceKey()}`,
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
 * Read-modify-write, so concurrent hits can under-count by one or two. That is
 * acceptable for a throttle and not worth a locking scheme.
 *
 * Each record holds { start, count } under a SHA-256 of the identity. Since
 * 2026-11-14 a record past its window is deleted daily
 * (purgeExpiredThrottles, run by sessions-purge.js), and deleting an account
 * deletes its address's records (deleteThrottles). Security audit item 14.
 */
export const THROTTLE_BUCKETS = Object.freeze({ login: 900, signup: 3600, reset: 3600 });
const throttleDigest = (identity) => createHash('sha256').update(String(identity)).digest('hex').slice(0, 32);

export async function rateLimit(bucket, identity, { limit, windowSeconds }) {
  const digest = throttleDigest(identity);
  const key = `rl/${bucket}/${digest}`;
  const store = strongStore(RATELIMIT_STORE);
  const now = Date.now();

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
  const digest = throttleDigest(email);
  for (const bucket of Object.keys(THROTTLE_BUCKETS)) await store.delete(`rl/${bucket}/${digest}`);
}

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

export const unauthenticated = () =>
  json({ error: 'unauthenticated' }, 401, { 'set-cookie': clearedCookie() });

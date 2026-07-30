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

export async function readJsonBody(request, limit = 4096) {
  let raw;
  try { raw = await request.text(); } catch { return { ok: false, reason: 'unreadable-body' }; }
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

// ------------------------------------------------------------------- cookies

export function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      return decodeURIComponent(part.slice(i + 1).trim());
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

/** Used on password change and account deletion — privilege change means every
 *  other session dies, not just the current one. */
export async function destroyAllSessions(userId) {
  const store = strongStore(SESSIONS_STORE);
  let listed;
  try {
    listed = await store.list({ prefix: `by-user/${userId}/` });
  } catch {
    return 0;
  }
  const blobs = (listed && listed.blobs) || [];
  for (const b of blobs) {
    const id = b.key.split('/').pop();
    await store.delete(`sessions/${id}`).catch(() => {});
    await store.delete(b.key).catch(() => {});
  }
  return blobs.length;
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
 */
export async function rateLimit(bucket, identity, { limit, windowSeconds }) {
  const digest = createHash('sha256').update(String(identity)).digest('hex').slice(0, 32);
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

// ------------------------------------------------------------------ palates

export const palateKey = (userId) => `palates/${userId}`;
export const palateStore = () => strongStore(PALATES_STORE);

// ----------------------------------------------------------------- responses

export const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extraHeaders },
  });

export const methodNotAllowed = (allow = 'POST') =>
  new Response('Method Not Allowed', { status: 405, headers: { allow } });

export const tooMany = () =>
  json({ error: 'rate-limited', message: 'Too many attempts. Wait a few minutes and try again.' }, 429);

export const unauthenticated = () =>
  json({ error: 'unauthenticated' }, 401, { 'set-cookie': clearedCookie() });

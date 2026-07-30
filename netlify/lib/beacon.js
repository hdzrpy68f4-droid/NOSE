// Shared helpers for the two beacon endpoints (match-feedback, client-error).
//
// Lives OUTSIDE netlify/functions on purpose: anything inside that directory
// risks being registered as a function. Imported via a relative path and
// inlined by esbuild at build time.

import { createHash } from 'node:crypto';

export const VOTES_STORE = 'match-feedback';
export const ERRORS_STORE = 'client-errors';

// sendBeacon caps at ~64KB. A typical payload is a few hundred bytes, but the
// palate is unbounded in the UI, so this has to leave room for a genuinely
// large one: ~490 ids fit in 4KB, which is reachable for a heavy user, and a
// body-size rejection happens BEFORE validation and would silently discard a
// real vote. 16KB is still a hard garbage-injection bound (~1900 ids) while
// being far above anything a person will actually build.
export const MAX_BODY_BYTES = 16384;

/**
 * Read and parse a JSON beacon body under a hard size cap.
 * Returns { ok:true, data } or { ok:false, reason }.
 */
export async function readJsonBody(request, limit = MAX_BODY_BYTES) {
  let raw;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, reason: 'unreadable-body' };
  }
  if (raw.length > limit) return { ok: false, reason: 'body-too-large' };
  if (!raw) return { ok: false, reason: 'empty-body' };
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

/** Slug-shaped identifier: matches every built-in profile id plus the opaque
 *  privacy tokens 'custom' and 'unknown'. Deliberately a character-class check
 *  rather than an allowlist of known ids, so adding a sample profile to the
 *  client does not require redeploying this function. */
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const isId = (v) => typeof v === 'string' && ID_RE.test(v);

export const isInt = (v, min, max) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Clamp a string and strip control characters (log-injection guard). */
export const clean = (v, max) =>
  String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, max);

/** ISO-8601 timestamp as sent by the client, or null if implausible.
 *  Never authoritative — the server stamps its own ts. */
export function safeClientTs(v) {
  if (typeof v !== 'string' || v.length > 32) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  // Reject anything absurd (bad device clock, replay of an ancient payload).
  const now = Date.now();
  if (t < now - 30 * 24 * 3600e3 || t > now + 24 * 3600e3) return null;
  return new Date(t).toISOString();
}

/** Short hash used only to GROUP records at analysis time. Derived entirely
 *  from fields already stored, so it reveals nothing new. NOT a user id:
 *  two different people voting on the same built-in pair collide by design. */
export function contextHash(parts) {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 12);
}

export function dayKey(iso) {
  return iso.slice(0, 10); // YYYY-MM-DD
}

/** Time-of-day + random suffix. Keys must be unique per write; there is no
 *  read-modify-write anywhere in this design, so nothing can be clobbered. */
export function keySuffix(iso) {
  const hms = iso.slice(11, 23).replace(/[:.]/g, '');
  return `${hms}-${Math.random().toString(36).slice(2, 8)}`;
}

export const noContent = () => new Response(null, { status: 204 });

/** Malformed input gets a 400 with a machine-readable reason. The beacon
 *  ignores the response entirely; this exists for curl and for logs. */
export const rejected = (reason) =>
  new Response(JSON.stringify({ error: 'rejected', reason }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });

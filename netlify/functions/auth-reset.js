// Requests a password-reset email from Supabase.
//
// Returns the same 200 and the same body for every input: registered address,
// unregistered address, and Supabase outage alike. There is no code path here
// that tells a caller whether an account exists.
//
// Throttled hard (3/hour per address) because this endpoint sends mail. Without
// a limit it is a free way to flood someone's inbox using their own address.
//
// NOTE ON DELIVERY: Supabase's built-in SMTP is rate-limited to a handful of
// messages per hour on the free tier, and silently drops the rest. Custom SMTP
// must be configured before launch or reset emails will simply not arrive for
// real users — a failure that looks like nothing at all from this side.

import {
  gotrue, isEmail, normaliseEmail, readJsonBody, rateLimit,
  json, methodNotAllowed,
} from '../lib/auth.js';

const NEUTRAL = {
  status: 'submitted',
  message: 'If that address has an account, a reset link is on its way.',
};

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed();

  const body = await readJsonBody(request);
  if (!body.ok) return json(NEUTRAL, 200);

  const email = normaliseEmail(body.data.email);
  if (!isEmail(email)) return json(NEUTRAL, 200);

  const allowed = await rateLimit('reset', email, { limit: 3, windowSeconds: 3600 });
  if (!allowed) return json(NEUTRAL, 200); // Not even a 429 — that leaks activity.

  const res = await gotrue('/recover', { body: { email } });

  if (!res.ok) {
    console.warn('[auth-reset] non-ok from supabase', { status: res.status });
  }

  return json(NEUTRAL, 200);
};

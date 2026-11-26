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

import { gotrue, isEmail, normaliseEmail, readJsonBody, rateLimit, fromThisSite, crossSite } from '../lib/auth.js';
import { json, methodNotAllowed } from '../lib/http.js';

const RESET_PAGE = 'https://nose-app.com/account/reset/';

/* Since 2026-11-25 the email carries a six-digit code beside its link, typed
   on /account/ with the new password (auth-reset-finish). */
const NEUTRAL = {
  status: 'submitted',
  message: 'If that address has an account, an email with a six-digit code is on its way.',
};

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed();
  if (!fromThisSite(request)) return crossSite();

  const body = await readJsonBody(request);
  if (!body.ok) return json(NEUTRAL, 200);

  const email = normaliseEmail(body.data.email);
  if (!isEmail(email)) return json(NEUTRAL, 200);

  const allowed = await rateLimit('reset', email, { limit: 3, windowSeconds: 3600 });
  if (!allowed) return json(NEUTRAL, 200); // Not even a 429 — that leaks activity.

  /* The reset link comes back to /account/reset/, which asks for the new
     password (since 2026-11-15). Supabase sends there only an address on the
     project's Redirect URLs list, which holds it (Authentication -> URL
     Configuration). PARSER-HANDOFF s13, "A password reset that finishes". */
  const res = await gotrue(`/recover?redirect_to=${encodeURIComponent(RESET_PAGE)}`, { body: { email } });

  if (!res.ok) {
    console.warn('[auth-reset] non-ok from supabase', { status: res.status });
  }

  return json(NEUTRAL, 200);
};

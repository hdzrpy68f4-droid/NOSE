// Who is signed in, and what are they entitled to.
//
// THIS IS THE ONLY PLACE SUBSCRIPTION STATUS IS DECIDED. Every future gated
// endpoint must call resolveEntitlement() (or re-read the user the same way)
// rather than trusting anything the client sends. A field named `subscription`
// arriving in a request body is not evidence of anything.
//
// Status is read live from Supabase on each call rather than copied into the
// session record: a session lasts 14 days, and a cancellation or upgrade must
// take effect immediately, not whenever the user next logs in.
//
// Nothing is gated yet — billing comes later. The check exists now so that
// turning gating on is a one-line change at the call site rather than a
// retrofit of the trust model.

import { gotrue, readSession, json, methodNotAllowed } from '../lib/auth.js';

const SIGNED_OUT = { signedIn: false, subscription: 'none' };

export async function resolveEntitlement(userId) {
  const res = await gotrue(`/admin/users/${encodeURIComponent(userId)}`, { method: 'GET' });
  if (!res.ok || !res.data) return null;

  const meta = res.data.user_metadata || {};
  // Unknown or absent means free. Failing closed matters more than convenience.
  const subscription = meta.subscription === 'active' ? 'active' : 'free';

  return {
    email: res.data.email,
    subscription,
    createdAt: res.data.created_at || null,
    ageAttestedAt: meta.age_attested_at || null,
  };
}

export default async (request) => {
  if (request.method !== 'GET') return methodNotAllowed('GET');

  const session = await readSession(request);
  if (!session) return json(SIGNED_OUT, 200);

  const user = await resolveEntitlement(session.userId);

  if (!user) {
    // Session exists but the Supabase user does not, or Supabase is down. Report
    // signed in from the session record and fail the entitlement closed, rather
    // than logging someone out because a third party had a bad minute.
    console.warn('[auth-me] entitlement lookup failed', { userId: session.userId });
    return json({
      signedIn: true,
      email: session.email,
      subscription: 'free',
      degraded: true,
    }, 200);
  }

  return json({
    signedIn: true,
    email: user.email,
    subscription: user.subscription,
    createdAt: user.createdAt,
    sessionExpiresAt: session.expiresAt,
  }, 200);
};

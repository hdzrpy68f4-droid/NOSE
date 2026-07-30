// Creates an account. Email + password only.
//
// ENUMERATION RESISTANCE: this endpoint returns the identical neutral response
// whether the address is new, already registered, or rejected by Supabase. An
// attacker cannot use it to discover who has a NOSE account — which matters
// more here than on a normal site, because the answer would reveal an interest
// in cannabis attached to a real email address.
//
// The cost is a slightly vaguer message for legitimate users, which the UI
// absorbs by telling everyone to check their email.
//
// AGE: the site's 21+ gate is self-attested and the terms say so. Signing up
// records the attestation timestamp in user metadata so there is a record of
// what was claimed and when. It is NOT verification and must never be
// described as verification anywhere on the site.

import {
  gotrue, isEmail, isPassword, normaliseEmail, readJsonBody,
  rateLimit, createSession, sessionCookie, json, methodNotAllowed, tooMany,
} from '../lib/auth.js';

// Deliberately identical for every outcome.
const NEUTRAL = {
  status: 'submitted',
  message: 'Check your email to finish setting up your account.',
};

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed();

  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: 'rejected', reason: body.reason }, 400);
  const d = body.data;

  const email = normaliseEmail(d.email);
  if (!isEmail(email)) return json({ error: 'bad-email' }, 400);

  if (!isPassword(d.password)) {
    return json({ error: 'bad-password', message: 'Use at least 10 characters.' }, 400);
  }

  // Must be an explicit true, not merely truthy — an unchecked box must not
  // pass because the client sent the string "false".
  if (d.ageAttested !== true) return json({ error: 'age-not-attested' }, 400);

  const allowed = await rateLimit('signup', email, { limit: 5, windowSeconds: 3600 });
  if (!allowed) return tooMany();

  const res = await gotrue('/signup', {
    body: {
      email,
      password: d.password,
      data: {
        age_attested_at: new Date().toISOString(),
        subscription: 'free',
      },
    },
  });

  if (res.networkError) {
    console.error('[auth-signup] supabase unreachable', res.networkError);
    return json({ error: 'unavailable' }, 503);
  }

  // Anything other than success is logged and swallowed. "User already
  // registered" must not be distinguishable from success by the client.
  if (!res.ok) {
    console.warn('[auth-signup] non-ok from supabase', {
      status: res.status,
      code: res.data && (res.data.error_code || res.data.code),
    });
    return json(NEUTRAL, 200);
  }

  // If email confirmation is DISABLED in the Supabase dashboard, /signup
  // returns a session immediately. Set the cookie so the account page finds
  // them signed in — but keep the response body neutral, because varying it
  // would reintroduce the enumeration signal.
  const user = res.data && res.data.user;
  const hasSession = Boolean(res.data && res.data.session);

  if (hasSession && user && user.id) {
    try {
      const { id } = await createSession(user);
      return json(NEUTRAL, 200, { 'set-cookie': sessionCookie(id) });
    } catch (err) {
      console.error('[auth-signup] session create failed', String(err && err.message));
    }
  }

  return json(NEUTRAL, 200);
};

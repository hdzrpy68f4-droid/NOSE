// Verifies a password against Supabase and issues a NOSE session cookie.
//
// The Supabase access token returned here is used once, to confirm the
// credentials were good, and then discarded. It is never stored and never sent
// to the browser. What the browser gets is an opaque id pointing at a record in
// Blobs, which means logout and account deletion revoke access immediately
// rather than waiting for a token to expire.
//
// Failures are uniform: wrong password and unknown address produce the same
// 400 with the same body. GoTrue already behaves this way; this endpoint must
// not accidentally add a distinction on top.

import {
  gotrue, isEmail, normaliseEmail, readJsonBody, rateLimit,
  readSession, destroySession, createSession, sessionCookie,
  json, methodNotAllowed, tooMany,
} from '../lib/auth.js';

const BAD_CREDENTIALS = { error: 'invalid-credentials', message: 'Email or password is incorrect.' };

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed();

  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: 'rejected', reason: body.reason }, 400);
  const d = body.data;

  const email = normaliseEmail(d.email);
  // Malformed input gets the same answer as a wrong password, so probing the
  // validator tells an attacker nothing either.
  if (!isEmail(email) || typeof d.password !== 'string' || !d.password) {
    return json(BAD_CREDENTIALS, 400);
  }

  const allowed = await rateLimit('login', email, { limit: 8, windowSeconds: 900 });
  if (!allowed) return tooMany();

  const res = await gotrue('/token?grant_type=password', {
    body: { email, password: d.password },
  });

  if (res.networkError) {
    console.error('[auth-login] supabase unreachable', res.networkError);
    return json({ error: 'unavailable' }, 503);
  }

  if (!res.ok) {
    // Unconfirmed email is worth surfacing distinctly: it is not a credential
    // leak (the caller already proved they know the password) and without it
    // the user is stuck with no idea why a correct password fails.
    const code = res.data && (res.data.error_code || res.data.code);
    if (code === 'email_not_confirmed') {
      return json({ error: 'email-not-confirmed', message: 'Confirm your email address first — check your inbox.' }, 403);
    }
    return json(BAD_CREDENTIALS, 400);
  }

  const user = res.data && res.data.user;
  if (!user || !user.id) {
    console.error('[auth-login] token response had no user');
    return json({ error: 'unavailable' }, 503);
  }

  // Session rotation: any pre-existing session id on this browser is destroyed
  // and replaced, so a fixated cookie cannot survive a successful login.
  const existing = await readSession(request);
  if (existing) await destroySession(existing.id, existing.userId).catch(() => {});

  const { id } = await createSession(user);

  return json(
    { status: 'signed-in', email: user.email },
    200,
    { 'set-cookie': sessionCookie(id) },
  );
};

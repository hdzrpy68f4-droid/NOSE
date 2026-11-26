// Confirm a new account's email address: the code from the confirmation link,
// or (since 2026-11-25) the six-digit code from the same email, typed on
// /account/.
//
// Since 2026-11-16 (PARSER-HANDOFF s13, "Email links that come to NOSE").
// Until then the confirmation email's link went to Supabase's own site, which
// checked it and sent the browser on to /account/confirmed/. Now the email's
// link is /account/confirmed/#token_hash=...&type=signup on this site. A
// browser sends nothing after "#" to a server, so the code is in no request
// log; the page sends it here when the person presses the button - so an
// email scanner that opens the link first does not use the code up, and the
// person's browser never visits Supabase.
// Here, for { token_hash }:
//   1. The code is checked by Supabase (POST /verify, type signup). A used,
//      expired or made-up one is refused with one plain sentence.
//   2. Supabase answers a good code with a session of its own. NOSE signs
//      people in with its own sessions, so that one is ended at once (POST
//      /logout, scope global) and the person signs in with their password.
//      No cookie is read or set on this path.
// For { email, code } (13-records, "Six-digit email codes on /account/"):
//   1. Every try is counted for the address, whether or not it has an account
//      ('code' bucket, five an hour, shared with auth-reset-finish), before
//      Supabase is asked. Over the count, Supabase is not asked. The count is
//      strict (rateLimit's strict option): a lost race or a store that fails
//      refuses the try.
//   2. Supabase checks the code (POST /verify, type signup, email, token).
//   3. Its session is ended as above, and the person is signed in to NOSE at
//      once (the owner's decision), as auth-login.js does it: any session
//      this browser had is destroyed and a new one set.
//   A wrong, expired or wrong-shaped code, an address with no account and a
//   try over the count all get the one same answer (codeRefused).
// Nothing is kept but the count: no code, no address. Console lines name a
// step and a status, never the address.

import {
  gotrue, readJsonBody, fromThisSite, crossSite, TOKEN_HASH, OTP_CODE,
  isEmail, normaliseEmail, rateLimit, codeRefused,
  readSession, destroySession, createSession, sessionCookie,
} from '../lib/auth.js';
import { json, methodNotAllowed } from '../lib/http.js';

const EXPIRED = {
  error: 'link-expired',
  message: 'This confirmation link has expired or was already used. Try signing in; if your address is not confirmed yet, signing up again with it sends a new link.',
};

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed();
  if (!fromThisSite(request)) return crossSite();

  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: 'rejected', reason: body.reason }, 400);
  const tokenHash = body.data.token_hash;
  if (tokenHash === undefined && (body.data.code !== undefined || body.data.email !== undefined)) return byCode(request, body.data);
  if (typeof tokenHash !== 'string' || !TOKEN_HASH.test(tokenHash)) return json(EXPIRED, 400);

  const verified = await gotrue('/verify', { body: { type: 'signup', token_hash: tokenHash } });
  if (verified.networkError) {
    console.error('[auth-confirm] supabase unreachable', verified.networkError);
    return json({ error: 'unavailable' }, 503);
  }
  const accessToken = verified.ok && verified.data && verified.data.access_token;
  if (!accessToken) return json(EXPIRED, 400);

  // The address is confirmed; ending Supabase's session is tidying, so a
  // failure here is logged and the person is still told it is confirmed.
  const out = await gotrue('/logout?scope=global', { method: 'POST', accessToken });
  if (!out.ok) console.warn('[auth-confirm] supabase logout refused', { status: out.status });

  return json({ status: 'confirmed', message: 'Your email address is confirmed. Sign in with it and your password.' }, 200);
};

async function byCode(request, d) {
  const email = normaliseEmail(d.email);
  const code = typeof d.code === 'string' ? d.code.trim() : '';
  if (!isEmail(email) || !OTP_CODE.test(code)) return codeRefused();
  if (!(await rateLimit('code', email, { limit: 5, windowSeconds: 3600, strict: true }))) return codeRefused();

  /* GoTrue's POST /verify with type, email and token. Newer Supabase docs call
     this type "email"; a live sign-up is the first real proof of this body. */
  const verified = await gotrue('/verify', { body: { type: 'signup', email, token: code } });
  if (verified.networkError) {
    console.error('[auth-confirm] supabase unreachable', verified.networkError);
    return json({ error: 'unavailable' }, 503);
  }
  const accessToken = verified.ok && verified.data && verified.data.access_token;
  if (!accessToken) return codeRefused();
  const user = verified.data.user;

  const out = await gotrue('/logout?scope=global', { method: 'POST', accessToken });
  if (!out.ok) console.warn('[auth-confirm] supabase logout refused', { status: out.status });

  if (!user || !user.id) {
    console.error('[auth-confirm] verify response had no user');
    return json({ error: 'unavailable' }, 503);
  }
  // Session rotation, as auth-login.js: a fixated cookie cannot survive.
  const existing = await readSession(request);
  if (existing) await destroySession(existing.id, existing.userId).catch(() => {});
  const { id } = await createSession(user);
  return json({ status: 'signed-in' }, 200, { 'set-cookie': sessionCookie(id) });
}

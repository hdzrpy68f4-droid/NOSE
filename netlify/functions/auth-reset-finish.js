// Finish a password reset: the link's code, and the new password.
//
// Since 2026-11-14 (PARSER-HANDOFF s13, "A password reset that finishes";
// security audit item 13). Until then nothing finished a reset: Supabase's
// email sent people to the home page with its own login tokens in the address
// after "#", and no page read them or set a password.
//
// The reset email's link points at /account/reset/?token_hash=...&type=recovery
// (Supabase -> Authentication -> Emails -> Reset password, set by hand). That
// page asks for the new password and sends it here with the code only when the
// person presses the button - an email scanner that opens the link first does
// not use the code up. Here:
//   1. Supabase checks the code (POST /verify, type recovery). A used, expired
//      or made-up code is refused with one plain sentence.
//   2. With the session that answer carries, the password is set (PUT /user).
//   3. That Supabase session is ended (POST /logout, scope global), and every
//      NOSE session of the account is destroyed: whoever had the old password
//      is signed out everywhere. The person then signs in with the new one.
// Nothing is kept: no code, no password, no address. Console lines name a step
// and a status, never the address.

import {
  gotrue, isPassword, readJsonBody, destroyAllSessions, fromThisSite, crossSite,
} from '../lib/auth.js';
import { json, methodNotAllowed } from '../lib/http.js';

const EXPIRED = {
  error: 'link-expired',
  message: 'This reset link has expired or was already used. Ask for a new one on the account page.',
};
const TOKEN_HASH = /^[A-Za-z0-9_-]{16,256}$/;

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed();
  if (!fromThisSite(request)) return crossSite();

  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: 'rejected', reason: body.reason }, 400);
  const { token_hash: tokenHash, password } = body.data;
  if (typeof tokenHash !== 'string' || !TOKEN_HASH.test(tokenHash)) return json(EXPIRED, 400);
  if (!isPassword(password)) return json({ error: 'bad-password', message: 'Use at least 10 characters.' }, 400);

  const verified = await gotrue('/verify', { body: { type: 'recovery', token_hash: tokenHash } });
  if (verified.networkError) {
    console.error('[auth-reset-finish] supabase unreachable', verified.networkError);
    return json({ error: 'unavailable' }, 503);
  }
  const accessToken = verified.ok && verified.data && verified.data.access_token;
  const userId = verified.ok && verified.data && verified.data.user && verified.data.user.id;
  if (!accessToken || !userId) return json(EXPIRED, 400);

  const updated = await gotrue('/user', { method: 'PUT', accessToken, body: { password } });
  if (!updated.ok) {
    console.warn('[auth-reset-finish] password update refused', { status: updated.status });
    const weak = updated.data && /password/i.test(String(updated.data.error_code || updated.data.msg || ''));
    return weak
      ? json({ error: 'bad-password', message: 'That password was refused. Choose another, at least 10 characters.' }, 400)
      : json({ error: 'unavailable' }, 503);
  }

  // The password is set; what follows only signs the old sessions out, so a
  // failure here is logged and the person is still told the password changed.
  const out = await gotrue('/logout?scope=global', { method: 'POST', accessToken });
  if (!out.ok) console.warn('[auth-reset-finish] supabase logout refused', { status: out.status });
  try {
    await destroyAllSessions(userId);
  } catch (err) {
    console.error('[auth-reset-finish] session sweep failed', String(err && err.message));
  }

  return json({ status: 'password-set', message: 'Your password is changed, and every device was signed out. Sign in with the new one.' }, 200);
};

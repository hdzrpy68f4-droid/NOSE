// Finish a password reset: the link's code, and the new password.
//
// Since 2026-11-14 (PARSER-HANDOFF s13, "A password reset that finishes";
// security audit item 13). Until then nothing finished a reset: Supabase's
// email sent people to the home page with its own login tokens in the address
// after "#", and no page read them or set a password.
//
// Two ways a reset link reaches /account/reset/, and the page sends either:
//   - Supabase's default email: its link goes to Supabase, which checks it and
//     sends the browser on to /account/reset/#access_token=...&type=recovery
//     (auth-reset.js asks for that address). The page sends { access_token }.
//     Emails sent before 2026-11-16 work this way, and "Reset template" in
//     the dashboard would bring it back.
//   - The template since 2026-11-16 (13-records, "Email links that come to
//     NOSE") links /account/reset/#token_hash=...&type=recovery:
//     the page sends { token_hash } only when the button is pressed, so an
//     email scanner that opens the link first does not use the code up.
// And one way without the link, since 2026-11-25 (13-records, "Six-digit
// email codes on /account/"): the six-digit code from the same email, typed on
// /account/ with the address and the new password - { email, code, password }.
// Here:
//   1. A token_hash is checked by Supabase (POST /verify, type recovery); an
//      access_token is used as it is. A used, expired or made-up one is
//      refused with one plain sentence. A six-digit code is checked only
//      after the password passes isPassword (a short one uses no try), and
//      only inside the 'code' count, five tries an hour per address, shared
//      with auth-confirm and strict (a lost race or a failing store refuses
//      the try), then inside the whole site's brake, 300 tries an hour from
//      all addresses (codeTryAllowed); then POST /verify, type recovery,
//      email, token. A
//      wrong, expired or wrong-shaped code, an address with no account and a
//      try over the count get the one same answer (codeRefused).
//   2. With that session, the password is set (PUT /user).
//   3. That Supabase session is ended (POST /logout, scope global), and every
//      NOSE session of the account is destroyed: whoever had the old password
//      is signed out everywhere. The person then signs in with the new one.
// Nothing is kept but that count: no code, no password, no address. Console
// lines name a step and a status, never the address.

import {
  gotrue, isPassword, readJsonBody, destroyAllSessions, fromThisSite, crossSite, TOKEN_HASH,
  OTP_CODE, isEmail, normaliseEmail, codeTryAllowed, codeRefused,
} from '../lib/auth.js';
import { json, methodNotAllowed } from '../lib/http.js';

const EXPIRED = {
  error: 'link-expired',
  message: 'This reset link has expired or was already used. Ask for a new one on the account page.',
};
const ACCESS_TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;   // a JWT
const userIdOf = (jwt) => { try { return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')).sub || null; } catch { return null; } };

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed();
  if (!fromThisSite(request)) return crossSite();

  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: 'rejected', reason: body.reason }, 400);
  const { token_hash: tokenHash, access_token: given, password } = body.data;
  const byHash = typeof tokenHash === 'string' && TOKEN_HASH.test(tokenHash);
  const bySession = typeof given === 'string' && given.length <= 4096 && ACCESS_TOKEN.test(given);
  const byCode = tokenHash === undefined && given === undefined
    && (body.data.code !== undefined || body.data.email !== undefined);
  if (!byHash && !bySession && !byCode) return json(EXPIRED, 400);
  if (!isPassword(password)) return json({ error: 'bad-password', message: 'Use at least 10 characters.' }, 400);

  let accessToken, userId;
  if (byCode) {
    const email = normaliseEmail(body.data.email);
    const code = typeof body.data.code === 'string' ? body.data.code.trim() : '';
    if (!isEmail(email) || !OTP_CODE.test(code)) return codeRefused();
    if (!(await codeTryAllowed(email))) return codeRefused();
    const verified = await gotrue('/verify', { body: { type: 'recovery', email, token: code } });
    if (verified.networkError) {
      console.error('[auth-reset-finish] supabase unreachable', verified.networkError);
      return json({ error: 'unavailable' }, 503);
    }
    accessToken = verified.ok && verified.data && verified.data.access_token;
    userId = verified.ok && verified.data && verified.data.user && verified.data.user.id;
    if (!accessToken || !userId) return codeRefused();
  } else if (byHash) {
    const verified = await gotrue('/verify', { body: { type: 'recovery', token_hash: tokenHash } });
    if (verified.networkError) {
      console.error('[auth-reset-finish] supabase unreachable', verified.networkError);
      return json({ error: 'unavailable' }, 503);
    }
    accessToken = verified.ok && verified.data && verified.data.access_token;
    userId = verified.ok && verified.data && verified.data.user && verified.data.user.id;
  } else {
    /* The session Supabase handed the page; PUT /user below refuses it if it
       is not a live one. Its user id is read from it only to sign that
       account's NOSE sessions out once the password is set. */
    accessToken = given;
    userId = userIdOf(given);
  }
  if (!accessToken || !userId) return json(EXPIRED, 400);

  const updated = await gotrue('/user', { method: 'PUT', accessToken, body: { password } });
  if (updated.networkError) {
    console.error('[auth-reset-finish] supabase unreachable', updated.networkError);
    return json({ error: 'unavailable' }, 503);
  }
  if (bySession && updated.status === 401) return json(EXPIRED, 400);
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
  const confirmedId = updated.data && updated.data.id;
  if (confirmedId) userId = confirmedId;
  if (!out.ok) console.warn('[auth-reset-finish] supabase logout refused', { status: out.status });
  try {
    await destroyAllSessions(userId);
  } catch (err) {
    console.error('[auth-reset-finish] session sweep failed', String(err && err.message));
  }

  return json({ status: 'password-set', message: 'Your password is changed, and every device was signed out. Sign in with the new one.' }, 200);
};

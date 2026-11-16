// Confirm a new account's email address: the code from the confirmation link.
//
// Since 2026-11-16 (PARSER-HANDOFF s13, "Email links that come to NOSE").
// Until then the confirmation email's link went to Supabase's own site, which
// checked it and sent the browser on to /account/confirmed/. Now the email's
// link is /account/confirmed/#token_hash=...&type=signup on this site. A
// browser sends nothing after "#" to a server, so the code is in no request
// log; the page sends it here when the person presses the button - so an
// email scanner that opens the link first does not use the code up, and the
// person's browser never visits Supabase.
// Here:
//   1. The code is checked by Supabase (POST /verify, type signup). A used,
//      expired or made-up one is refused with one plain sentence.
//   2. Supabase answers a good code with a session of its own. NOSE signs
//      people in with its own sessions, so that one is ended at once (POST
//      /logout, scope global) and the person signs in with their password.
// Nothing is kept: no code, no address. Console lines name a step and a
// status, never the address. No cookie is read or set.

import { gotrue, readJsonBody, fromThisSite, crossSite, TOKEN_HASH } from '../lib/auth.js';
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

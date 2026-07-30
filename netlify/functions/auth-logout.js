// Destroys the session server-side and clears the cookie.
//
// POST rather than GET, so a third-party <img src> cannot log people out.
// Always returns 200 with a cleared cookie, even if there was no session —
// there is nothing to protect by distinguishing, and the client should be able
// to fire this blindly to recover from a bad state.
//
// { "everywhere": true } destroys every session for the user, not just this
// browser. That is the control someone reaches for after losing a device.

import {
  readSession, destroySession, destroyAllSessions, readJsonBody,
  clearedCookie, json, methodNotAllowed,
} from '../lib/auth.js';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed();

  const session = await readSession(request);
  if (!session) {
    return json({ status: 'signed-out' }, 200, { 'set-cookie': clearedCookie() });
  }

  let everywhere = false;
  const body = await readJsonBody(request);
  if (body.ok && body.data.everywhere === true) everywhere = true;

  try {
    if (everywhere) {
      await destroyAllSessions(session.userId);
    } else {
      await destroySession(session.id, session.userId);
    }
  } catch (err) {
    // The cookie is cleared regardless. A stranded record expires on its own.
    console.error('[auth-logout] destroy failed', String(err && err.message));
  }

  return json({ status: 'signed-out', everywhere }, 200, { 'set-cookie': clearedCookie() });
};

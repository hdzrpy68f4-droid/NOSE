// Deletes an account and everything attached to it.
//
// The privacy policy will promise this works. It therefore has to actually
// erase data rather than flag a row as inactive, and the order below matters:
// NOSE-held data goes first, the identity last. If the run dies halfway, what
// survives is an account with no data attached — recoverable and harmless. The
// reverse order would leave orphaned palate blobs keyed to a user id that no
// longer resolves to anyone, which is exactly the kind of quiet residue this
// endpoint exists to prevent.
//
// WHAT IS NOT DELETED, and why — this list belongs in the privacy policy
// verbatim, not summarised:
//   * Match feedback votes. They carry no account id, no device id and no
//     terpene values, so there is nothing in them to attribute to a person and
//     nothing to erase. Keeping votes anonymous is what makes them survivable
//     here; if they were ever linked to accounts, this endpoint would have to
//     destroy the research dataset every time someone left.
//   * Client error reports. Anonymous, and purged on their own 90-day cycle.
//   * Netlify's server logs, which are outside NOSE's control.
//
// Requires an explicit confirmation string. A logged-in user should not be able
// to destroy their account via a single stray POST.

import {
  readSession, destroyAllSessions, readJsonBody, gotrue,
  palateStore, palateKey, clearedCookie, json, methodNotAllowed, unauthenticated,
} from '../lib/auth.js';

export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed();

  const session = await readSession(request);
  if (!session) return unauthenticated();

  const body = await readJsonBody(request);
  if (!body.ok || body.data.confirm !== 'DELETE') {
    return json({ error: 'confirmation-required', message: 'Send confirm: "DELETE" to proceed.' }, 400);
  }

  const userId = session.userId;
  const failures = [];

  // 1. Palate. The sensitive one.
  try {
    await palateStore().delete(palateKey(userId));
  } catch (err) {
    failures.push('palate');
    console.error('[account-delete] palate delete failed', { userId, error: String(err && err.message) });
  }

  // 2. Every session, not just this browser.
  try {
    await destroyAllSessions(userId);
  } catch (err) {
    failures.push('sessions');
    console.error('[account-delete] session sweep failed', { userId, error: String(err && err.message) });
  }

  // 3. The identity itself.
  const res = await gotrue(`/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  if (!res.ok) {
    failures.push('identity');
    console.error('[account-delete] supabase user delete failed', { userId, status: res.status });
  }

  if (failures.length) {
    // The cookie is still cleared — the user is signed out either way. But this
    // must not report success, because the policy says deletion means deletion
    // and a partial run has to be visible and followed up.
    return json({
      status: 'partial',
      failed: failures,
      message: 'Some data could not be removed. Contact us and we will finish it manually.',
    }, 500, { 'set-cookie': clearedCookie() });
  }

  return json({ status: 'deleted' }, 200, { 'set-cookie': clearedCookie() });
};

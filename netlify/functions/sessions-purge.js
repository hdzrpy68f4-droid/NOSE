// Scheduled daily: deletes session records whose 14 days have ended.
//
// The privacy page says "Sessions: fourteen days, or until you log out".
// readSession() deletes an expired record only when its cookie is presented
// again, and the browser drops the cookie at 14 days, so without this an
// expired record - which holds an email address - stayed in Blobs with no end
// date. Follows errors-purge.js. PARSER-HANDOFF s13, "Sessions end when the
// privacy page says".
//
// The log line and the reply hold counts only: never a session id, a user id
// or an address.

import { purgeExpiredSessions } from '../lib/auth.js';

export const config = { schedule: '@daily' };

export default async () => {
  let counts;
  try {
    counts = await purgeExpiredSessions();
  } catch (err) {
    console.error('[sessions-purge] list failed', String(err && err.message));
    return new Response('list failed', { status: 500 });
  }
  console.log('[sessions-purge] done', counts);
  return new Response(JSON.stringify(counts), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};

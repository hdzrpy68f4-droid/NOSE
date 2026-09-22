// Scheduled every four hours. Keeps the free Supabase project from pausing.
//
// Supabase pauses a free project after a week without enough database
// activity - "a few user requests to the database each day" is what its docs
// say is typically enough. While paused, every scan's archive write fails, and
// coa.js swallows those failures by design, so the archive would stop filling
// without anybody noticing. Six small reads a day prevent that.
//
// It reads, never writes: one indexed lookup as nose_writer (store.touch).
// Scheduled functions cannot be called by URL on a published deploy, so this
// is not an endpoint anybody can hammer. Unset NOSE_DB_URL (deploy previews,
// local runs) means it does nothing.
//
// A failure is logged loudly and returns 500, so it shows in Netlify's
// function log - the one place a paused or unreachable database surfaces
// before it costs any data.

import store from './lib/store.js';

export const config = { schedule: '17 */4 * * *' };

export default async () => {
  if (!process.env.NOSE_DB_URL) {
    console.log('[keep-awake] NOSE_DB_URL is not set - nothing to do');
    return new Response('not configured', { status: 200 });
  }
  const started = Date.now();
  try {
    await store.touch({ timeoutMs: 8000 });
    console.log('[keep-awake] ok', { ms: Date.now() - started });
    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('[keep-awake] FAILED - the archive database did not answer:',
                  String((err && err.message) || err).slice(0, 200));
    return new Response('failed', { status: 500 });
  }
};

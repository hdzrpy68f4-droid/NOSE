// Scheduled daily. Deletes client-error records older than 90 days.
//
// Netlify Blobs has no TTL, so a retention promise in the privacy policy is
// only true if something actually enforces it. This is that something.
//
// Votes are NOT touched: they are kept indefinitely by decision (anonymous,
// and they are the evidence base for the aroma-shape hypothesis).

import { getStore } from '@netlify/blobs';
import { ERRORS_STORE } from '../lib/beacon.js';

export const config = { schedule: '@daily' };

const RETAIN_DAYS = 90;
const CONCURRENCY = 10;

export default async () => {
  const cutoff = new Date(Date.now() - RETAIN_DAYS * 24 * 3600e3).toISOString().slice(0, 10);
  const store = getStore(ERRORS_STORE);

  const stale = [];
  try {
    for await (const page of store.list({ prefix: 'errors/', paginate: true })) {
      for (const blob of page.blobs || []) {
        const day = blob.key.split('/')[1];
        if (day && day < cutoff) stale.push(blob.key); // ISO dates sort lexically
      }
    }
  } catch (err) {
    console.error('[errors-purge] list failed', err);
    return new Response('list failed', { status: 500 });
  }

  let deleted = 0, failed = 0;
  for (let i = 0; i < stale.length; i += CONCURRENCY) {
    const batch = stale.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((k) => store.delete(k)));
    for (const r of results) r.status === 'fulfilled' ? deleted++ : failed++;
  }

  console.log('[errors-purge] done', { cutoff, deleted, failed, scanned: stale.length });
  return new Response(JSON.stringify({ cutoff, deleted, failed }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};

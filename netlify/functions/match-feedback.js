// Receives anonymous match-accuracy votes. No PII: only the score, band,
// profile ids being compared, a timestamp, and up/down. This is the instrument
// that tests NOSE's core hypothesis — that shared aroma shape predicts shared
// enjoyment. Wire the `persist()` body to your store (Netlify Blobs, a DB, or
// an analytics sink) before relying on it.
export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  let data;
  try {
    data = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const vote = data && data.vote;
  if (vote !== 'up' && vote !== 'down') {
    return new Response('Bad Request', { status: 400 });
  }

  const record = {
    vote,
    score: Number(data.score) || null,          // 0–100
    band: String(data.band || '').slice(0, 24),
    candidate: String(data.candidate || '').slice(0, 64),
    palate: Array.isArray(data.palate) ? data.palate.slice(0, 20).map(id => String(id).slice(0, 64)) : [],
    ts: new Date().toISOString(),
  };

  try {
    await persist(record);
  } catch (err) {
    // Never fail the client because storage hiccuped; log and move on.
    console.error('feedback persist failed', err);
  }

  return new Response(null, { status: 204 });
};

// TODO(deploy): replace with real storage, e.g. Netlify Blobs:
//   import { getStore } from '@netlify/blobs';
//   const store = getStore('match-feedback');
//   await store.setJSON(`${record.ts}-${Math.random().toString(36).slice(2)}`, record);
async function persist(record) {
  console.log('match-feedback', JSON.stringify(record));
}

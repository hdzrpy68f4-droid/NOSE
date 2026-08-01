// Palate backup and restore. Session required on every method.
//
// EXPLICIT, NOT AUTOMATIC. The client sends a whole document and this
// overwrites what was there. No merge, no conflict resolution, and — the point
// of the design — no tombstones. An automatic sync would have to remember
// which jars you deleted in order to stop another device resurrecting them,
// which means permanently retaining a record of things you asked to remove.
// That is a bad promise to have to explain on a page that says deletion means
// deletion. Whole-document overwrite avoids the problem instead of managing it.
//
// SENSITIVITY. This is the only store in the project that holds user-supplied
// text tied to an identity. The `name` field is free text people type — the
// same field that caused a past leak by ending up in a beacon payload. Treat
// this store as sensitive data, never as cache.
//
// The stored shape matches the export file exactly ({version, profiles}), so a
// synced palate and a downloaded one are interchangeable.

import {
  readSession, palateStore, palateKey,
  json, unauthenticated,
} from '../lib/auth.js';

// A palate is a few hundred bytes per jar. 256KB is roughly 1500 jars: far
// beyond any real palate, and a hard ceiling on what one account can push into
// paid storage. The UI does not cap the palate, so without this the write is
// unbounded.
const MAX_BYTES = 262144;

const MAX_PROFILES = 500;

export default async (request) => {
  const session = await readSession(request);
  if (!session) return unauthenticated();

  const key = palateKey(session.userId);
  const store = palateStore();

  // ------------------------------------------------------------------ read
  if (request.method === 'GET') {
    let doc = null;
    try {
      doc = await store.get(key, { type: 'json' });
    } catch {
      doc = null; // A missing key throws rather than returning null.
    }
    if (!doc) return json({ status: 'empty', profiles: [], savedAt: null }, 200);
    return json({
      status: 'ok',
      version: doc.version || 1,
      profiles: Array.isArray(doc.profiles) ? doc.profiles : [],
      savedAt: doc.savedAt || null,
      count: Array.isArray(doc.profiles) ? doc.profiles.length : 0,
    }, 200);
  }

  // ----------------------------------------------------------------- write
  if (request.method === 'PUT') {
    let raw;
    try {
      raw = await request.text();
    } catch {
      return json({ error: 'unreadable-body' }, 400);
    }
    if (raw.length > MAX_BYTES) {
      return json({
        error: 'too-large',
        message: 'That palate is too big to save. Remove some jars and try again.',
      }, 413);
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'invalid-json' }, 400);
    }

    const profiles = Array.isArray(body && body.profiles) ? body.profiles : null;
    if (!profiles) return json({ error: 'bad-shape' }, 400);
    if (profiles.length > MAX_PROFILES) {
      return json({ error: 'too-many', message: `Limit is ${MAX_PROFILES} jars.` }, 413);
    }

    // Store only the four fields the app actually uses. Anything else a client
    // sends is dropped rather than persisted: this store should never quietly
    // accumulate fields nobody declared in the privacy policy.
    const clean = [];
    for (const p of profiles) {
      if (!p || typeof p !== 'object') continue;
      if (typeof p.name !== 'string' || !p.name) continue;
      if (!p.terps || typeof p.terps !== 'object' || Array.isArray(p.terps)) continue;

      const terps = {};
      for (const [k, v] of Object.entries(p.terps)) {
        if (typeof k !== 'string' || k.length > 40) continue;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 100) continue;
        terps[k] = n;
      }
      if (!Object.keys(terps).length) continue;

      clean.push({
        id: typeof p.id === 'string' ? p.id.slice(0, 120) : null,
        name: p.name.slice(0, 120),
        subtitle: typeof p.subtitle === 'string' ? p.subtitle.slice(0, 160) : '',
        terps,
      });
    }

    if (!clean.length) return json({ error: 'nothing-valid' }, 400);

    const doc = { version: 1, profiles: clean, savedAt: new Date().toISOString() };

    try {
      await store.setJSON(key, doc);
    } catch (err) {
      console.error('[palate-sync] write failed', {
        userId: session.userId,
        error: err && err.message ? err.message : String(err),
      });
      return json({ error: 'storage-unavailable' }, 502);
    }

    return json({ status: 'saved', count: clean.length, savedAt: doc.savedAt }, 200);
  }

  // ---------------------------------------------------------------- delete
  if (request.method === 'DELETE') {
    try {
      await store.delete(key);
    } catch (err) {
      console.error('[palate-sync] delete failed', {
        userId: session.userId,
        error: err && err.message ? err.message : String(err),
      });
      return json({ error: 'storage-unavailable' }, 502);
    }
    return json({ status: 'deleted' }, 200);
  }

  return new Response('Method Not Allowed', {
    status: 405,
    headers: { allow: 'GET, PUT, DELETE' },
  });
};

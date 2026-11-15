#!/usr/bin/env node
'use strict';
/* NOSE - rewrite stored match votes and error reports so none keeps a time.
 * PARSER-HANDOFF s13, "Votes and error reports keep the day, not the time".
 *
 *   node scripts/blobs-to-days.js          a dry run: counts what it would rewrite
 *   node scripts/blobs-to-days.js --yes    rewrites them
 *
 * Since 2026-11-14 match-feedback.js and client-error.js write a record that
 * keeps the UTC day and no time, under a key that ends in 32 random hex
 * characters. Records written before then keep ts (the server's time to the
 * millisecond) and clientTs (the device's), under a key that ends
 * HHMMSSmmm-<rand>. This rewrites each such record:
 *   - votes:  votes/<band>/<vote>/<day>/<32 hex>, the record with day in
 *             place of ts and no clientTs; band, vote and day as they were
 *   - errors: errors/<day>/<ctx>/<32 hex>, the same; day and ctx as they were
 * The new key is written, read back and compared, and only then is the old key
 * deleted. A run that stops part way leaves each record whole under one key or
 * both; a second run finishes it, and deletes an old key whose copy is already
 * there. The schema version moves to 3 for a vote and 2 for an error report.
 *
 * Prints counts only - never a record, a key or a value.
 *
 * Needs NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN (the Codespace's secrets);
 * refuses without them.
 */
const crypto = require('crypto');

const STORES = [
  { name: 'match-feedback', prefix: 'votes/', parts: 5, dayAt: 3, v: 3, label: 'votes' },
  { name: 'client-errors', prefix: 'errors/', parts: 4, dayAt: 1, v: 2, label: 'error reports' },
];
const NEW_SUFFIX = /^[0-9a-f]{32}$/;

/* The record as it is kept from 2026-11-14: day for ts, no clientTs, the
   fields otherwise in their order. */
function withoutTime(rec, v) {
  const out = {};
  for (const [k, val] of Object.entries(rec)) {
    if (k === 'clientTs') continue;
    if (k === 'ts') { out.day = String(val).slice(0, 10); continue; }
    if (k === 'v') { out.v = v; continue; }
    out[k] = val;
  }
  return out;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function rewriteStore(store, spec, { yes, randomHex = () => crypto.randomBytes(16).toString('hex') }) {
  const counts = { scanned: 0, withTime: 0, rewritten: 0, failed: 0 };
  const keys = [];
  for await (const page of store.list({ prefix: spec.prefix, paginate: true })) for (const b of page.blobs || []) keys.push(b.key);
  /* What is already under a new key, by its folder, so that an old record a
     stopped run copied but did not delete is deleted, not copied twice. */
  const copied = new Map();
  const folderOf = k => k.split('/').slice(0, -1).join('/');
  if (yes) for (const k of keys) if (NEW_SUFFIX.test(k.split('/').pop())) {
    let v = null;
    try { v = await store.get(k, { type: 'json' }); } catch { v = null; }
    if (v) { const f = folderOf(k); if (!copied.has(f)) copied.set(f, new Set()); copied.get(f).add(JSON.stringify(v)); }
  }
  for (const key of keys) {
    counts.scanned++;
    const p = key.split('/');
    if (p.length !== spec.parts || NEW_SUFFIX.test(p[p.length - 1])) continue;
    let rec;
    try { rec = await store.get(key, { type: 'json' }); } catch { rec = null; }
    if (!rec || typeof rec !== 'object') { counts.failed++; continue; }
    counts.withTime++;
    if (!yes) continue;
    try {
      const value = withoutTime(rec, spec.v);
      const day = typeof rec.ts === 'string' ? rec.ts.slice(0, 10) : p[spec.dayAt];
      p[spec.dayAt] = day;
      p[p.length - 1] = randomHex();
      const next = p.join('/');
      const already = copied.get(folderOf(next));
      if (already && already.has(JSON.stringify(value))) { await store.delete(key); counts.rewritten++; continue; }
      await store.setJSON(next, value);
      const back = await store.get(next, { type: 'json' });
      if (!same(back, value)) throw new Error('read back differs');
      await store.delete(key);
      counts.rewritten++;
    } catch {
      counts.failed++;
    }
  }
  return counts;
}

async function main(argv = process.argv.slice(2), { env = process.env, out = console.log, err = console.error, getStore } = {}) {
  const yes = argv.includes('--yes');
  if (argv.some(a => a !== '--yes')) { err('usage: node scripts/blobs-to-days.js [--yes]'); return 2; }
  if (!getStore) {
    if (!env.NETLIFY_SITE_ID || !env.NETLIFY_AUTH_TOKEN) {
      err('REFUSED - NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN are both needed (the Codespace\'s secrets)');
      return 1;
    }
    const blobs = require('@netlify/blobs');
    getStore = name => blobs.getStore({ name, siteID: env.NETLIFY_SITE_ID, token: env.NETLIFY_AUTH_TOKEN, consistency: 'strong' });
  }
  let failed = 0;
  for (const spec of STORES) {
    let c;
    try {
      c = await rewriteStore(getStore(spec.name), spec, { yes });
    } catch (e) {
      const msg = String(e && e.message || e);
      err(`${spec.label}: could not list the store "${spec.name}"${/\b401\b/.test(msg) ? ' - Netlify refused the token: it may have expired' : ''}`);
      return 1;
    }
    failed += c.failed;
    out(yes
      ? `${spec.label}: ${c.scanned} scanned, ${c.rewritten} rewritten without a time, ${c.failed} failed`
      : `${spec.label}: ${c.scanned} scanned, ${c.withTime} still keep a time and would be rewritten${c.failed ? `, ${c.failed} unreadable` : ''}`);
  }
  out(yes ? 'done - run it again without --yes: each store should have 0 to rewrite' : 'dry run - nothing was written; add --yes to rewrite');
  return failed ? 1 : 0;
}

module.exports = { main, withoutTime, rewriteStore, STORES };
if (require.main === module) main().then(code => { process.exitCode = code; });

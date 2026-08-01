// Read path for the vote corpus. Stored votes nobody can look at are barely
// better than discarded ones, so this is part of the job, not an extra.
//
// Gated by a single shared secret in FEEDBACK_READ_TOKEN. It is curl-able,
// which is why it doubles as the CLI: no local Netlify auth, and it can never
// drift out of sync with the write schema because it lives beside it.
//
//   TOKEN=...  SITE=https://example.com
//   curl -s -H "authorization: Bearer $TOKEN" "$SITE/.netlify/functions/feedback-read"
//   curl -s -H "authorization: Bearer $TOKEN" "$SITE/.netlify/functions/feedback-read?band=Good&limit=200"
//   curl -s -H "authorization: Bearer $TOKEN" "$SITE/.netlify/functions/feedback-read?format=csv" > votes.csv
//
// Everything it returns is already anonymous; the gate exists so the corpus
// isn't a public scrape target, not because the contents are sensitive.

import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { VOTES_STORE } from '../lib/beacon.js';

// SYNTHETIC RECORDS — exclude these from any analysis, and from any figure
// that gets published or shown to anyone:
//
//   candidate 'test-do-not-count'  (2026-08-01)  endpoint smoke test
//   candidate 'probe-test'         (2026-08-01)  persistence check
//
// Both were written by curl to confirm the write path worked at all. Neither
// came from a person looking at a match result, so neither says anything about
// whether the aroma-shape hypothesis holds. They are left in place rather than
// deleted because there is no delete path and inventing one to remove two rows
// would be worse than a comment. Filter on candidate id.
//
// Real votes to date: 1 (candidate 'cold-creek', score 84, up).
// That is not a finding. It is one vote.

const BAND_SLUGS = { strong: 'Strong', good: 'Good', partial: 'Partial', weak: 'Weak' };
const MAX_RECORDS = 1000;

export default async (request) => {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } });
  }

  const expected = process.env.FEEDBACK_READ_TOKEN;
  // Fail closed. An unset token must not mean an open endpoint.
  if (!expected || expected.length < 24) {
    console.error('[feedback-read] FEEDBACK_READ_TOKEN unset or too short; refusing');
    return new Response('Not configured', { status: 503 });
  }
  if (!authorized(request, expected)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const band = url.searchParams.get('band');
  const vote = url.searchParams.get('vote');
  const since = url.searchParams.get('since'); // YYYY-MM-DD or YYYY-MM
  const format = url.searchParams.get('format') || 'json';
  const limit = clampInt(url.searchParams.get('limit'), 0, MAX_RECORDS, 0);

  // Strong consistency: a summary that lags the last few votes is more
  // confusing than one that costs an extra moment.
  const store = getStore({ name: VOTES_STORE, consistency: 'strong' });

  let keys;
  try {
    keys = await listKeys(store, prefixFor(band, vote));
  } catch (err) {
    console.error('[feedback-read] list failed', err);
    return new Response('Storage unavailable', { status: 502 });
  }

  const parsed = keys.map(parseKey).filter(Boolean).filter((k) => inRange(k, since));
  parsed.sort((a, b) => (a.key < b.key ? 1 : -1)); // newest first

  const summary = summarize(parsed);

  // Default view is the summary, computed from KEYS ALONE — no blob reads.
  if (!limit && format !== 'csv') {
    return json({ summary, totalRecords: parsed.length, caveat: CAVEAT });
  }

  const take = parsed.slice(0, limit || MAX_RECORDS);
  let records;
  try {
    records = (await Promise.all(take.map((k) => store.get(k.key, { type: 'json' })))).filter(Boolean);
  } catch (err) {
    console.error('[feedback-read] get failed', err);
    return new Response('Storage unavailable', { status: 502 });
  }

  if (format === 'csv') return csv(records);
  return json({ summary, returned: records.length, totalRecords: parsed.length, caveat: CAVEAT, records });
};

const CAVEAT =
  'Counts are votes, not voters: there is no identifier, so one person voting twice ' +
  'counts twice (group by ctx to collapse repeats). Up-share is meaningless at small n ' +
  'and is not evidence the aroma-shape hypothesis holds.';

function authorized(request, expected) {
  const header = request.headers.get('authorization') || '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  // Hash both sides to a fixed length so the compare is timing-safe and the
  // token length doesn't leak.
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function prefixFor(band, vote) {
  const slug = band ? String(band).toLowerCase() : null;
  if (!slug || !BAND_SLUGS[slug]) return 'votes/';
  if (vote === 'up' || vote === 'down') return `votes/${slug}/${vote}/`;
  return `votes/${slug}/`;
}

async function listKeys(store, prefix) {
  const out = [];
  // Paginated iterator so a large corpus doesn't have to fit in one response.
  for await (const page of store.list({ prefix, paginate: true })) {
    for (const blob of page.blobs || []) out.push(blob.key);
  }
  return out;
}

// votes/<band>/<vote>/<YYYY-MM-DD>/<suffix>
function parseKey(key) {
  const p = key.split('/');
  if (p.length !== 5 || p[0] !== 'votes') return null;
  if (!BAND_SLUGS[p[1]]) return null;
  if (p[2] !== 'up' && p[2] !== 'down') return null;
  return { key, band: BAND_SLUGS[p[1]], vote: p[2], day: p[3] };
}

function inRange(k, since) {
  if (!since) return true;
  return k.day >= since; // ISO dates sort lexically
}

function summarize(parsed) {
  const out = {};
  for (const name of Object.values(BAND_SLUGS)) out[name] = { up: 0, down: 0, total: 0, upShare: null };
  let up = 0, down = 0;
  for (const k of parsed) {
    out[k.band][k.vote] += 1;
    out[k.band].total += 1;
    if (k.vote === 'up') up += 1; else down += 1;
  }
  for (const name of Object.keys(out)) {
    const b = out[name];
    // Left as null rather than 0 when there is nothing to divide: an absent
    // number is honest, a zero looks like a finding.
    if (b.total > 0) b.upShare = Number((b.up / b.total).toFixed(3));
  }
  const total = up + down;
  return {
    byBand: out,
    overall: { up, down, total, upShare: total ? Number((up / total).toFixed(3)) : null },
  };
}

function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

const COLS = ['ts', 'clientTs', 'vote', 'band', 'score', 'candidate',
              'palateSize', 'palate', 'palateTruncated', 'ctx'];

function csv(records) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(' ') : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [COLS.join(',')];
  for (const r of records) lines.push(COLS.map((c) => esc(r[c])).join(','));
  return new Response(lines.join('\n') + '\n', {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="nose-votes.csv"',
      'cache-control': 'no-store',
    },
  });
}

function clampInt(v, min, max, dflt) {
  const n = Number.parseInt(v ?? '', 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

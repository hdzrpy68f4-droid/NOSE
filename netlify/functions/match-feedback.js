// Receives anonymous match-accuracy votes and writes them to Netlify Blobs.
//
// This is the instrument that tests NOSE's core hypothesis: that a shared
// aroma shape predicts shared enjoyment. /methodology/ says out loud that the
// hypothesis is not yet validated and that this mechanism exists to start
// testing it. A vote therefore means "the match was / wasn't right about how
// this smells" — never anything about effects.
//
// PRIVACY CONTRACT (mirrors reportableId() in js/nose.*.js — do not weaken):
//   * only built-in sample ids arrive by name; user-created profiles arrive as
//     the opaque token 'custom'
//   * no strain names, no terpene values, no user identifiers, no IP address
//   * there is no account system, so records are anonymous and unlinkable
// Adding a field here means changing the published privacy policy.

import { getStore } from '@netlify/blobs';
import {
  VOTES_STORE, readJsonBody, isId, isInt, safeClientTs,
  contextHash, dayKey, keySuffix, noContent, rejected,
} from '../lib/beacon.js';

// Fixed taxonomy. Anything else is not a band this app can produce.
const BANDS = { Strong: 'strong', Good: 'good', Partial: 'partial', Weak: 'weak' };
const MAX_PALATE = 500;


export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  }

  const body = await readJsonBody(request);
  if (!body.ok) return rejected(body.reason);
  const data = body.data;

  const record = validate(data);
  if (!record.ok) return rejected(record.reason);

  try {
    await persist(record.value);
  } catch (err) {
    // Storage must never surface to the user: sendBeacon discards the response
    // and sendFeedback() swallows exceptions. But it must not vanish either —
    // this line is the only place a lost vote is visible.
    console.error('[match-feedback] persist failed', {
      band: record.value.band,
      vote: record.value.vote,
      error: err && err.message ? err.message : String(err),
    });
  }

  return noContent();
};

function validate(d) {
  const vote = d.vote;
  if (vote !== 'up' && vote !== 'down') return { ok: false, reason: 'bad-vote' };

  const bandSlug = BANDS[d.band];
  if (!bandSlug) return { ok: false, reason: 'bad-band' };

  // NOTE: the previous stub used `Number(d.score) || null`, which silently
  // turned a legitimate score of 0 (a real Weak match, and exactly the kind of
  // vote worth having) into null. Validate the range instead of coercing.
  if (!isInt(d.score, 0, 100)) return { ok: false, reason: 'bad-score' };

  // Deliberately NOT cross-checked against the band: the client derives the
  // band from the raw cosine value and rounds the score afterwards, so a
  // boundary match (cosine 0.895 → band Good, score 90) is legitimate and a
  // strict check would throw away real votes.

  if (!isId(d.candidate)) return { ok: false, reason: 'bad-candidate' };

  if (!Array.isArray(d.palate) || d.palate.length > MAX_PALATE) {
    return { ok: false, reason: 'bad-palate' };
  }
  if (!d.palate.every(isId)) return { ok: false, reason: 'bad-palate-id' };

  if (!isInt(d.palateSize, 0, MAX_PALATE)) return { ok: false, reason: 'bad-palate-size' };

  const ts = new Date().toISOString();

  return {
    ok: true,
    value: {
      v: 1,                              // schema version, so this can evolve
      vote,
      band: d.band,                      // canonical casing preserved
      score: d.score,
      candidate: d.candidate,
      palate: d.palate,
      palateSize: d.palateSize,
      ts,                                // server clock: authoritative
      clientTs: safeClientTs(d.ts),      // as sent; may be null
      ctx: contextHash([d.band, d.score, d.candidate, d.palateSize, d.palate.join(',')]),
      _bandSlug: bandSlug,               // key building only, stripped below
    },
  };
}

// KEY LAYOUT — the whole design, because Blobs is a key-value store and not a
// query engine:
//
//   votes/<band>/<vote>/<YYYY-MM-DD>/<HHMMSSmmm>-<rand>
//
// The band and the vote are IN THE KEY, so the primary hypothesis question —
// "for a given band, what share of votes were up?" — is answered by listing
// keys and counting them, with zero blob reads. Date is the next segment, so
// string prefixes give free year/month/day filtering. The full record is still
// the value, for when score / palateSize / candidate analysis is wanted.
//
// One blob per vote, append-only, never read-modify-write. That means no
// aggregate counter to go stale or lose a concurrent increment, and every
// derived number is rebuildable from the log. It also keeps the write to a
// single round trip, which matters: a beacon fires as the page is unloading
// and cannot be relied on to stay connected.
async function persist(record) {
  const { _bandSlug, ...value } = record;
  const store = getStore(VOTES_STORE);
  const key = `votes/${_bandSlug}/${record.vote}/${dayKey(record.ts)}/${keySuffix(record.ts)}`;
  await store.setJSON(key, value);
}

// REPEAT VOTES — a decision, not an accident.
//
// Every vote is stored as its own record; nothing is deduplicated at write
// time. There is no identifier to dedupe BY, and the only available proxy —
// the context fields — is genuinely ambiguous: two different people voting on
// the same pair of built-in samples produce identical context. Collapsing
// those would delete real signal to remove an imagined duplicate.
//
// So duplicates are resolved at READ time instead. The `ctx` field groups
// records with identical context; a reload-and-revote shows up as the same ctx
// with a different clientTs seconds apart, and can be collapsed in analysis
// with the caveat above made explicit. This is the conservative direction:
// over-counting is visible and fixable later, whereas a discarded vote is not.
//
// The corpus therefore counts VOTES, not VOTERS, and no headline figure should
// be phrased as though it counted people.

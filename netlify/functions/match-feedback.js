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
//   * smell words only from the fixed list below (NOTES), never free text
//   * accounts exist, but votes carry NO account id and NO session cookie is
//     read here — records stay anonymous and unlinkable BY DESIGN, not by
//     absence of an account system. Do not add a user id to this payload:
//     account-delete.js relies on votes having nothing to erase.
// Adding a field here means changing the published privacy policy.

import { getStore } from '@netlify/blobs';
import {
  VOTES_STORE, readJsonBody, isId, isInt, safeClientTs,
  contextHash, dayKey, keySuffix, noContent, rejected,
} from '../lib/beacon.js';
import { methodNotAllowed } from '../lib/http.js';

// matchBand()'s own four names (js/match-math.*.js), strongest first: the app
// sends matchBand(score)[1]. Anything else is not a band this app can produce,
// a lowercase name included. Until 2026-10-13 this held Partial and Weak,
// names the app never sent, so every vote on a Moderate or Low match was
// refused with bad-band and lost (PARSER-HANDOFF s13, "Every vote stored").
const BANDS = { Strong: 'strong', Good: 'good', Moderate: 'moderate', Low: 'low' };
const MAX_PALATE = 500;

// The smell words a vote may carry, since 2026-10-14: the slugs of
// SMELL_NOTES in js/nose.*.js, in the same order - test/match-feedback-test.js
// checks the two lists match. Up to three, each once. A lab report measures
// terpenes; a word beside a vote says which smell the matching may have
// missed (PARSER-HANDOFF s13, "Smell words on a vote"). Only these words are
// ever stored: nothing a person types reaches this function.
const NOTES = ['gas', 'skunk', 'savory', 'chemical', 'sweet', 'fruity', 'hay', 'citrus', 'earthy', 'spice', 'pine', 'floral', 'herbal'];
const MAX_NOTES = 3;


export default async (request) => {
  if (request.method !== 'POST') return methodNotAllowed();

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

  // A string, and an own key: a plain lookup would take "constructor" as a
  // band and file the vote under a function's source text, or ["Strong"] as
  // Strong and store the array.
  const bandSlug = typeof d.band === 'string' && Object.hasOwn(BANDS, d.band) ? BANDS[d.band] : null;
  if (!bandSlug) return { ok: false, reason: 'bad-band' };

  // NOTE: the previous stub used `Number(d.score) || null`, which silently
  // turned a legitimate score of 0 (a real Low match, and exactly the kind of
  // vote worth having) into null. Validate the range instead of coercing.
  if (!isInt(d.score, 0, 100)) return { ok: false, reason: 'bad-score' };

  // Deliberately NOT cross-checked against the band. The client derives the
  // band from the raw cosine value. Until 2026-09-24 it rounded the score, so
  // a stored boundary vote can carry a number from the band above (cosine
  // 0.895 → band Good, score 90). Since then it sends shownScore(), which
  // floors, so the two agree - except in a window 1e-11 wide below each edge
  // (js/match-math.*.js). A strict check would throw away real votes either
  // way. PARSER-HANDOFF s13.

  if (!isId(d.candidate)) return { ok: false, reason: 'bad-candidate' };

  if (!Array.isArray(d.palate) || d.palate.length > MAX_PALATE) {
    return { ok: false, reason: 'bad-palate' };
  }
  if (!d.palate.every(isId)) return { ok: false, reason: 'bad-palate-id' };

  if (!isInt(d.palateSize, 0, MAX_PALATE)) return { ok: false, reason: 'bad-palate-size' };

  // Optional. Absent, as from a page opened before the words existed, it is
  // stored as null - that vote was never asked - which is not the same as []
  // (asked, none picked). Present, it must be an array of at most three
  // distinct words from NOTES, or the whole vote is refused and nothing is
  // stored. Kept in the list's order whatever order it arrived in.
  let notes = null;
  if (Object.hasOwn(d, 'notes')) {
    const n = d.notes;
    if (!Array.isArray(n) || n.length > MAX_NOTES
        || !n.every((w) => typeof w === 'string' && NOTES.includes(w))
        || new Set(n).size !== n.length) {
      return { ok: false, reason: 'bad-notes' };
    }
    notes = NOTES.filter((w) => n.includes(w));
  }

  const ts = new Date().toISOString();

  return {
    ok: true,
    value: {
      v: 2,                              // schema version: 2 adds notes (2026-10-14); 1 had none
      vote,
      band: d.band,                      // canonical casing preserved
      score: d.score,
      candidate: d.candidate,
      palate: d.palate,
      palateSize: d.palateSize,
      ts,                                // server clock: authoritative
      clientTs: safeClientTs(d.ts),      // as sent; may be null
      ctx: contextHash([d.band, d.score, d.candidate, d.palateSize, d.palate.join(',')]),
      notes,                             // smell words, in NOTES order; null when the page sent none
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
  // Strong consistency deliberately: the default is eventual, and a vote
  // that is invisible for up to a minute after it lands looks exactly like a
  // vote that was dropped. feedback-read.js already reads strongly; a writer
  // that does not match it turns every spot-check into a false alarm.
  const store = getStore({ name: VOTES_STORE, consistency: 'strong' });
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

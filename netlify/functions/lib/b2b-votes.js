'use strict';
/* NOSE for dispensaries - the votes, in Netlify Blobs. PARSER-HANDOFF s14,
 * "Feed and votes".
 *
 * ONE SITE-WIDE STORE, "b2b-votes". Never getDeployStore: a deploy store
 * belongs to one deploy, so every deploy would begin with no votes. Site-wide
 * also means a deploy preview could reach it, which is why b2b-vote.js keeps
 * nothing unless b2bEnabled() (lib/b2b-flag.js): B2B_ENABLED=1 and a
 * production build. Apart from the consumer's "match-feedback" store in name,
 * key layout and code: nothing here reads or writes that one.
 *
 * ONE BLOB PER VOTE, written once and never changed:
 *
 *   votes/<store slug>/<band>/<vote>/<UTC day>/<random>
 *
 *   store slug  the store's slug, b2b.stores (lowercase letters, digits,
 *               single hyphens)
 *   band        matchBand()'s own names, exactly: Strong, Good, Moderate, Low
 *               (js/match-math.*.js). The consumer's votes take Strong, Good,
 *               Partial and Weak and so refuse Moderate and Low (s13, "Still
 *               open"); this list is the maths file's, which
 *               test/b2b-endpoints-test.js checks
 *   vote        up | down
 *   UTC day     YYYY-MM-DD, the database's day (b2b-store.js, voteTarget) -
 *               never a time
 *   random      16 random bytes as hex: no time, no counter, so the keys of a
 *               day list in no order the votes arrived in
 *
 * So the question a pilot asks - for each band, what share of votes were
 * up? - is answered by listing keys, without reading a blob.
 *
 * THE VALUE is { candidate, score, palateSize } and nothing else: the product
 * voted on (a product_id the store listed), the score the shopper was shown
 * (0 to 100, shownScore()), and how many purchases made the palate. No
 * metadata. Nothing about who voted - no shopper, purchase list, palate,
 * address, browser or time - and nothing from the request beyond those six
 * fields reaches here.
 *
 * THE DAILY CAP, per store and UTC day: B2B_VOTE_DAILY_CAP, a whole number
 * up to 100000 (0 keeps no votes at all); unset or anything else, 100. Over
 * it a vote is dropped and the shopper's reply is the same. It is counted by
 * listing the day's keys, so votes arriving at the same moment can pass it by
 * the number arriving together: it bounds a day, it does not count exactly.
 *
 * Only this module touches @netlify/blobs for the votes, and only when
 * called, so a run without the package never loads it. Nothing here logs.
 */

const crypto = require('crypto');

const STORE_NAME = 'b2b-votes';
const BANDS = Object.freeze(['Strong', 'Good', 'Moderate', 'Low']);
const VOTES = Object.freeze(['up', 'down']);
const VALUE_FIELDS = Object.freeze(['candidate', 'score', 'palateSize']);
const DEFAULT_DAILY_CAP = 100;
const MAX_DAILY_CAP = 100000;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const blobs = () => require('@netlify/blobs');

/* Inside a function written as a default export taking a Request, Netlify
 * hands Blobs its context itself: no arguments. From a Codespace script: the
 * site's ID and a Netlify personal access token. Strong consistency, as the
 * consumer's votes are read and written, so a count never misses a vote that
 * has landed. */
function open({ siteID, token } = {}) {
  if (siteID || token) {
    if (!siteID || !token) throw new Error('b2b-votes: outside Netlify both a site ID and a token are needed');
    return blobs().getStore({ name: STORE_NAME, siteID, token, consistency: 'strong' });
  }
  return blobs().getStore({ name: STORE_NAME, consistency: 'strong' });
}

function slugOf(slug) {
  if (typeof slug !== 'string' || slug.length > 40 || !SLUG.test(slug)) throw new TypeError('b2b-votes: not a store slug');
  return slug;
}

/* Every vote of one store: what delete-store removes. The trailing "/" keeps
   "rose" from reaching "rose-city". */
function storePrefix(slug) {
  return `votes/${slugOf(slug)}/`;
}

function dayPrefix(slug, band, vote, day) {
  if (!BANDS.includes(band)) throw new TypeError('b2b-votes: not a band matchBand() gives');
  if (!VOTES.includes(vote)) throw new TypeError('b2b-votes: a vote is up or down');
  if (typeof day !== 'string' || !DAY.test(day)) throw new TypeError('b2b-votes: a day is YYYY-MM-DD');
  return `${storePrefix(slug)}${band}/${vote}/${day}/`;
}

function voteKey(slug, band, vote, day) {
  return dayPrefix(slug, band, vote, day) + crypto.randomBytes(16).toString('hex');
}

function dailyCap(env = process.env) {
  const raw = env.B2B_VOTE_DAILY_CAP;
  if (typeof raw !== 'string' || !/^\d{1,6}$/.test(raw)) return DEFAULT_DAILY_CAP;
  const n = Number(raw);
  return n <= MAX_DAILY_CAP ? n : DEFAULT_DAILY_CAP;
}

/* list() follows the pages itself. An answer without a list is not taken for
   an empty one: the caller keeps nothing rather than count it as zero. */
async function keysUnder(store, prefix) {
  const res = await store.list({ prefix });
  if (!res || !Array.isArray(res.blobs)) throw new Error('b2b-votes: Netlify Blobs answered a listing without a list');
  return res.blobs.map(b => b.key);
}

/* A store's votes on one UTC day, every band and both ways. */
async function countDay(store, slug, day) {
  const prefixes = BANDS.flatMap(band => VOTES.map(vote => dayPrefix(slug, band, vote, day)));
  const lists = await Promise.all(prefixes.map(p => keysUnder(store, p)));
  return lists.reduce((n, keys) => n + keys.length, 0);
}

/* Keep one vote, unless the store's day is at its cap: 'kept' or 'capped'.
   A write counts only with an ETag. For a conditional write @netlify/blobs
   10.x answers { modified: true } on any status but 412 - a 401, 403 or 503
   included - without throwing (lib/pdf-store.js, put), so `modified` alone
   proves nothing. */
async function record(store, { slug, day, band, vote, candidate, score, palateSize }, { cap = dailyCap() } = {}) {
  const key = voteKey(slug, band, vote, day);
  if (typeof candidate !== 'string' || candidate === '' || Array.from(candidate).length > 200 ||
      !Number.isInteger(score) || score < 0 || score > 100 || !Number.isInteger(palateSize) || palateSize < 1) {
    throw new TypeError('b2b-votes: a vote is a product id, a score from 0 to 100 and a palate size');
  }
  if (await countDay(store, slug, day) >= cap) return 'capped';
  const value = { candidate, score, palateSize };
  const res = await store.setJSON(key, value, { onlyIfNew: true });
  if (res && res.modified === true && typeof res.etag === 'string' && res.etag) return 'kept';
  throw new Error('b2b-votes: Netlify Blobs did not confirm the write (no ETag) - counted as failed');
}

/* Every vote of one store, as keys: what delete-store counts. */
async function storeVoteKeys(store, slug) {
  return keysUnder(store, storePrefix(slug));
}

/* Delete every vote of one store: scripts/b2b-store.js delete-store, run by
   hand with the admin connection, is the only caller - no function deletes a
   vote. { deleted }. A failure part way says how many went first, as
   err.deleted; running delete-store again deletes the rest. */
async function removeStoreVotes(store, slug) {
  const keys = await storeVoteKeys(store, slug);
  let deleted = 0;
  for (const key of keys) {
    try { await store.delete(key); }
    catch (e) {
      const err = new Error(`b2b-votes: Netlify Blobs stopped answering after ${deleted} of ${keys.length} votes`);
      err.deleted = deleted;
      err.of = keys.length;
      err.cause = e;
      throw err;
    }
    deleted++;
  }
  return { deleted };
}

module.exports = {
  STORE_NAME, BANDS, VOTES, VALUE_FIELDS, DEFAULT_DAILY_CAP, MAX_DAILY_CAP,
  open, storePrefix, dayPrefix, voteKey, dailyCap, countDay, record, storeVoteKeys, removeStoreVotes
};

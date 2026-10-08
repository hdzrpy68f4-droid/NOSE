/* NOSE - the dispensary ranking engine. Every decision the "closest to your
 * usual" widget makes, as plain functions: no page, no network, and no clock
 * but the day it is handed (today's UTC day when it is handed none). It makes
 * no request and writes nowhere, so what a store's page hands it - a shopper's
 * purchases - stays with the shopper. PARSER-HANDOFF s14, "The ranking engine".
 *
 * It holds no maths. Every score comes from NoseMatch, js/match-math.<hash>.js,
 * by the very call the app makes to score a candidate against a palate
 * (js/nose.*.js), the palate first:
 *
 *     score  = cosine(palate, normalize(batch.terps))
 *     palate = averageProfiles(the palate's batches)
 *
 * shown with shownScore() and banded by matchBand(), whose own names it hands
 * back: band is matchBand()[1], the name a vote carries, and label is [0].
 *
 *   palateFrom(feed, purchases, removed, { today })
 *     purchases: [{ batchId, day }] from the store's page, day a UTC day
 *     (YYYY-MM-DD). removed: the batch IDs the shopper took out of the
 *     palate. A purchase counts when its batch is in the feed, inhalable, has
 *     a terpene panel NOSE stands by, was bought inside the store's window and
 *     was not removed; each batch counts once however often it was bought.
 *     -> { vector, basis: { used: [{ batch, days }], skipped: [{ batchId, day, reason, batch }] } }
 *   rank(feed, palate, { category, routes, guardrail })
 *     -> [{ batch, score, shown, band, label, unscored }]
 *   soldOut(feed, purchases, { removed, routes, guardrail, today })
 *     -> null, or { productId, batch, palate, ranked }
 *   voteScore(feed, purchases, productId, { removed, today })
 *     -> null, or { batch, score, shown, band, label, palate, payload }
 *
 * The feed is b2b-feed's reply, the same for every visitor of a store (s14,
 * "Feed and votes"). Nothing here reads a batch's name or brand, nor its lab,
 * dates, link or printed total: a batch is ranked by its own lab report's
 * terpenes, never by what it is called. Bad input never throws: it counts for
 * nothing - a purchase is skipped, a batch left out.
 *
 * Loaded as a classic script after js/match-math in a page (sets
 * window.NoseRank; build.sh fails a page that loads this first), and by
 * require() in Node (module.exports), where it takes the maths through
 * scripts/lib/match.js. build.sh fingerprints it: js/b2b-rank.<hash>.js.
 * Aroma and flavour only.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module && module.exports) module.exports = factory(require('../scripts/lib/match.js').load());
  else root.NoseRank = factory(root.NoseMatch);
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';
  if (!M || ['normalize', 'averageProfiles', 'cosine', 'matchBand', 'shownScore'].some(f => typeof M[f] !== 'function')) {
    throw new Error('NoseRank needs js/match-math loaded before it (window.NoseMatch)');
  }

  /* Why a purchase is not in the palate: codes, not words - the widget's
     strings say them to the shopper. The first that holds, in this order, is
     the one given. rank() labels a batch it cannot score with 'no read' or
     'refused'. */
  const REASONS = Object.freeze({
    NOT_LISTED: 'not listed',             // its batch is not in the feed: this store did not list it within its window
    NOT_INHALABLE: 'not inhalable',       // outside the four categories and two routes; the upload refuses any other
    NO_READ: 'no read',                   // no reading NOSE stands by (the feed's usable is null)
    REFUSED: 'refused',                   // its lab report was read and refused (usable is false)
    OUTSIDE_WINDOW: 'outside the window', // bought before the store's window began, or on no day NOSE can read
    REMOVED: 'removed'                    // the shopper took the batch out of the palate
  });

  /* Inhalables only, as docs/B2B-CATALOG-FORMAT.md lists them. */
  const CATEGORIES = ['flower', 'pre-roll', 'vape', 'concentrate'];
  const ROUTES = ['smoking', 'inhalation'];
  const inhalable = b => CATEGORIES.includes(b.category) && ROUTES.includes(b.route);

  /* A terpene panel NOSE can compare: an accepted reading with at least one
     terpene the maths models. Every terpene key the parser writes is one of
     TERPENES (s8), so an accepted reading always has one; should one ever
     come without, it counts as no read - never as a score of 0, which would
     claim a difference nobody measured. */
  const comparable = b => b.usable === true && Object.keys(M.normalize(b.terps)).length > 0;
  const readReason = b => (b.usable === false ? REASONS.REFUSED : comparable(b) ? null : REASONS.NO_READ);

  /* ------------------------------------------------------------ the feed */

  const listOf = x => (Array.isArray(x) ? x : []);
  const batchesOf = feed => listOf(feed && feed.batches);
  const storeOf = feed => (feed && feed.store && typeof feed.store === 'object' ? feed.store : {});
  /* batch_id -> the batch and its place in the feed. Matched exactly, as the
     catalog gives it; the database holds one of each, and of a repeat in a
     hand-made feed the first wins. */
  function indexOf(feed) {
    const index = new Map();
    batchesOf(feed).forEach((b, at) => {
      if (b && typeof b.batch_id === 'string' && !index.has(b.batch_id)) index.set(b.batch_id, { batch: b, at });
    });
    return index;
  }
  const removedSet = removed => new Set(listOf(removed).filter(id => typeof id === 'string'));

  /* ---------------------------------------------------------------- days */

  const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
  const leap = y => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const daysIn = (y, m) => [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  function dayParts(s) {
    const d = typeof s === 'string' ? DAY.exec(s) : null;
    if (!d) return null;
    const [y, m, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
    return m >= 1 && m <= 12 && day >= 1 && day <= daysIn(y, m) ? [y, m, day] : null;
  }
  const pad = (n, width) => String(n).padStart(width, '0');
  /* The first day inside the store's window: today less window_months, as
     lib/b2b-store.js's IN_WINDOW_SQL counts it for the feed - PostgreSQL's
     date minus make_interval(months => n), which keeps the day of the month
     and moves a day the shorter month lacks to its last day (2026-03-31 less
     one month is 2026-02-28). Null when today or the window cannot be read,
     and then no purchase is inside it. */
  function windowStart(today, months) {
    const t = dayParts(today);
    if (!t || !Number.isInteger(months) || months < 1 || months > 36) return null;
    const index = t[0] * 12 + (t[1] - 1) - months;
    const y = Math.floor(index / 12);
    const m = index - y * 12 + 1;
    return `${pad(y, 4)}-${pad(m, 2)}-${pad(Math.min(t[2], daysIn(y, m)), 2)}`;
  }
  const utcToday = () => new Date().toISOString().slice(0, 10);
  const todayOf = opts => (opts.today === undefined ? utcToday() : opts.today);
  const inWindow = (day, start) => start !== null && dayParts(day) !== null && day >= start;
  /* Latest day first; on one day, a batch NOSE can compare first; then the
     store's order. */
  const latestFirst = (x, y) => (x.day < y.day ? 1 : x.day > y.day ? -1 : 0)
    || (Number(comparable(y.batch)) - Number(comparable(x.batch))) || (x.at - y.at);

  /* -------------------------------------------------------------- palate */

  function palateFrom(feed, purchases, removed, options) {
    const opts = options || {};
    const start = windowStart(todayOf(opts), storeOf(feed).window_months);
    const index = indexOf(feed);
    const out = removedSet(removed);
    const used = new Map();
    const skipped = [];
    for (const p of listOf(purchases)) {
      const batchId = p && typeof p.batchId === 'string' ? p.batchId : null;
      const day = p && typeof p.day === 'string' ? p.day : null;
      const hit = batchId === null ? undefined : index.get(batchId);
      const b = hit ? hit.batch : null;
      const reason = !b ? REASONS.NOT_LISTED
        : !inhalable(b) ? REASONS.NOT_INHALABLE
        : readReason(b) || (!inWindow(day, start) ? REASONS.OUTSIDE_WINDOW : out.has(batchId) ? REASONS.REMOVED : null);
      if (reason) {
        skipped.push({ batchId, day, reason, batch: b });
        continue;
      }
      const u = used.get(batchId) || { batch: b, at: hit.at, days: [] };
      u.days.push(day);
      used.set(batchId, u);
    }
    /* In the feed's order, not the page's: the same purchases make the same
       palate to the last bit, however the page lists them. */
    const basis = [...used.values()].sort((x, y) => x.at - y.at).map(u => ({ batch: u.batch, days: u.days.sort() }));
    return { vector: M.averageProfiles(basis.map(u => u.batch)), basis: { used: basis, skipped } };
  }

  /* ----------------------------------------------------------- guardrail */

  /* Percentages compared as whole millionths of a percentage point, so a band
     edge holds as written: 16.1 is 5 points from 11.1, where subtracting the
     two as floating point gives 5.000000000000002. */
  const UNITS = 1e6;
  const units = x => Math.round(x * UNITS);
  const isPercent = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100;
  const isBand = x => typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= 100;

  /* One cannabinoid's half of the guardrail, as b2b.stores defines it: keep a
     batch whose percent is within `points` percentage points of the median of
     the basis batches' percents, both edges included. A batch with no figure
     cannot be shown to be inside the band, and a basis with no figure has no
     median to be near: either way the batch is kept out. Null when the store
     does not set this half (null); a setting that is not a band keeps
     everything out. */
  function half(field, points, basis) {
    if (points === null || points === undefined) return null;
    if (!isBand(points)) return () => false;
    const v = basis.map(b => b[field]).filter(isPercent).map(units).sort((a, b) => a - b);
    if (!v.length) return () => false;
    const n = v.length;
    const twiceMedian = n % 2 ? 2 * v[(n - 1) / 2] : v[n / 2 - 1] + v[n / 2];
    const twicePoints = 2 * units(points);
    return b => isPercent(b[field]) && Math.abs(2 * units(b[field]) - twiceMedian) <= twicePoints;
  }
  /* settings: { guardrail_thc_points, guardrail_cbd_points }, as the feed's
     store carries them; anything but such an object keeps everything out. */
  function guardrail(settings, basis) {
    if (!settings || typeof settings !== 'object') return () => false;
    const halves = [half('thc_percent', settings.guardrail_thc_points, basis),
                    half('cbd_percent', settings.guardrail_cbd_points, basis)].filter(Boolean);
    return b => halves.every(h => h(b));
  }

  /* ---------------------------------------------------------------- rank */

  const place = e => (Number.isFinite(e.batch.list_position) ? e.batch.list_position : Infinity);
  const byPlace = (x, y) => (place(x) - place(y)) || (x.at - y.at);

  /* The in-stock batches of one category, inside the shopper's routes and,
     when the store sets one, its guardrail - which only ever leaves batches
     out. Each scored against the palate; the largest score first, a tie in
     the store's own order (list_position). Then every batch with no panel
     NOSE can compare, unscored, labelled 'no read' or 'refused', in the
     store's order. A palate built from nothing ranks nothing: the menu keeps
     its own order. routes must be a list; without one nothing is inside it.
     guardrail, left out, is the store's own (feed.store). */
  function rank(feed, palate, options) {
    const opts = options || {};
    const vector = palate && palate.vector && typeof palate.vector === 'object' ? palate.vector : {};
    if (!Object.keys(vector).length) return [];
    const basis = listOf(palate.basis && palate.basis.used).map(u => u && u.batch).filter(Boolean);
    const inBand = guardrail(opts.guardrail === undefined ? storeOf(feed) : opts.guardrail, basis);
    const routes = listOf(opts.routes);
    const scored = [];
    const unscored = [];
    batchesOf(feed).forEach((b, at) => {
      if (!b || b.in_stock !== true || b.category !== opts.category || !routes.includes(b.route) || !inhalable(b) || !inBand(b)) return;
      if (comparable(b)) {
        const score = M.cosine(vector, M.normalize(b.terps));
        const band = M.matchBand(score);
        scored.push({ batch: b, at, score, shown: M.shownScore(score), band: band[1], label: band[0], unscored: null });
      } else {
        unscored.push({ batch: b, at, score: null, shown: null, band: null, label: null, unscored: readReason(b) });
      }
    });
    scored.sort((x, y) => (y.score - x.score) || byPlace(x, y));
    unscored.sort(byPlace);
    return scored.concat(unscored).map(({ at, ...entry }) => entry);
  }

  /* ------------------------------------------------------------ sold out */

  /* When the product the shopper buys most has no batch in stock: the
     in-stock batches of its category ranked against its latest purchased
     batch alone - closest to what the shopper came for, not to the whole
     palate. Most bought counts purchases of a listed, inhalable batch,
     bought inside the window and not removed, read or not; a tie goes to the
     product bought most lately, then to the store's order. null when that
     product is in stock or no purchase counts. The latest batch without a
     panel NOSE can compare ranks nothing, and its palate's basis says why. */
  function soldOut(feed, purchases, options) {
    const opts = options || {};
    const today = todayOf(opts);
    const start = windowStart(today, storeOf(feed).window_months);
    const index = indexOf(feed);
    const out = removedSet(opts.removed);
    const counted = [];
    for (const p of listOf(purchases)) {
      const hit = p && typeof p.batchId === 'string' ? index.get(p.batchId) : undefined;
      if (hit && inhalable(hit.batch) && inWindow(p.day, start) && !out.has(p.batchId)) counted.push({ batch: hit.batch, at: hit.at, day: p.day });
    }
    if (!counted.length) return null;
    const products = new Map();
    for (const c of counted) {
      const id = c.batch.product_id;
      const e = products.get(id) || { id, count: 0, last: '', at: c.at };
      e.count += 1;
      if (c.day > e.last) e.last = c.day;
      e.at = Math.min(e.at, c.at);
      products.set(id, e);
    }
    const top = [...products.values()].sort((x, y) => (y.count - x.count) || (x.last < y.last ? 1 : x.last > y.last ? -1 : 0) || (x.at - y.at))[0];
    if (batchesOf(feed).some(b => b && b.product_id === top.id && b.in_stock === true)) return null;
    const latest = counted.filter(c => c.batch.product_id === top.id).sort(latestFirst)[0].batch;
    const palate = palateFrom(feed, listOf(purchases).filter(p => p && p.batchId === latest.batch_id), opts.removed, { today });
    return { productId: top.id, batch: latest, palate,
             ranked: rank(feed, palate, { category: latest.category, routes: opts.routes, guardrail: opts.guardrail }) };
  }

  /* --------------------------------------------------------- vote score */

  /* For the post-purchase vote: the batch bought of productId - its latest
     purchase - scored against the palate of the other purchases, every
     purchase of that batch left out; another batch of the same product stays
     in, as it would have been in the palate before. payload is the vote's
     fields this engine decides (b2b-vote: candidate, score, band,
     palateSize); the widget adds key and vote. null when that batch has no
     panel NOSE can compare, or the other purchases make no palate. */
  function voteScore(feed, purchases, productId, options) {
    const opts = options || {};
    if (typeof productId !== 'string') return null;
    const index = indexOf(feed);
    const bought = [];
    for (const p of listOf(purchases)) {
      const hit = p && typeof p.batchId === 'string' ? index.get(p.batchId) : undefined;
      if (hit && hit.batch.product_id === productId && dayParts(p.day)) bought.push({ batch: hit.batch, at: hit.at, day: p.day });
    }
    if (!bought.length) return null;
    const voted = bought.sort(latestFirst)[0].batch;
    if (!inhalable(voted) || !comparable(voted)) return null;
    const palate = palateFrom(feed, listOf(purchases).filter(p => !(p && p.batchId === voted.batch_id)), opts.removed, { today: todayOf(opts) });
    const palateSize = palate.basis.used.length;
    if (!palateSize) return null;
    const score = M.cosine(palate.vector, M.normalize(voted.terps));
    const band = M.matchBand(score);
    const shown = M.shownScore(score);
    return { batch: voted, score, shown, band: band[1], label: band[0], palate,
             payload: { candidate: productId, score: shown, band: band[1], palateSize } };
  }

  return Object.freeze({ palateFrom, rank, soldOut, voteScore, REASONS });
});

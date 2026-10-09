/* NOSE - <nose-matches>, the element a dispensary places on its page.
 *
 *   <nose-matches key="npk_..." mode="rail" category="flower"
 *                 routes='["smoking","inhalation"]' consent="unknown"
 *                 purchases='[{"batchId":"...","day":"2026-09-28"}]'>
 *   </nose-matches>
 *
 * The store's page hands it the shopper's purchases - batch IDs and UTC days -
 * and the widget builds the palate and ranks here, in the shopper's browser,
 * with js/b2b-rank. Only two kinds of request ever leave the page from it: the
 * feed (GET, the store's public key and nothing else - the same reply for
 * every visitor of the store) and a vote (POST, b2b-vote's six fields).
 * Nothing about what the shopper bought is in either. PARSER-HANDOFF s14,
 * "The widget".
 *
 * Attributes:
 *   key        the store's public key, npk_ and 64 hex characters; anything
 *              else (a secret nsk_ key above all) and nothing is sent or shown
 *   mode       rail (the default) | sold-out | vote
 *   category   rail: flower | pre-roll | vape | concentrate - the batches it
 *              ranks, and the purchases its palate is made of: suggestions
 *              across forms stay off
 *   routes     JSON, the shopper's routes, e.g. ["smoking","inhalation"]
 *   purchases  JSON, [{ "batchId": "...", "day": "YYYY-MM-DD" }] - ignored
 *              entirely, never read, unless consent is "granted"
 *   consent    granted | denied | unknown. Unknown shows one button and one
 *              sentence; the button fires nose:consent, and the page records
 *              the shopper's answer and sets this attribute. NOSE records
 *              nothing. Denied shows nothing.
 *   group      test | control - control shows nothing and sends nothing
 *   product    vote: the product_id the vote is about
 *   strings    default | florida - which words js/b2b-strings shows
 *   feed       a file on NOSE's own origin to read the feed from in place of
 *              b2b-feed - the demo's test store; never another origin
 *
 * Events, each bubbling out of the element: nose:consent { consent },
 * nose:palate-removed and nose:palate-restored { batchId, removed } - the
 * batches the shopper has taken out of the palate, also kept in this
 * browser's storage on the store's own origin, so the page can keep them too.
 *
 * It holds no maths and shows no words of its own: every number comes from
 * js/b2b-rank (and through it js/match-math), shown with shownScore() and
 * labelled with matchBand()'s own names; every bar is js/aroma-bar's
 * renderBar(), the app's bar; every word on the page is js/b2b-strings' or
 * the store's catalog's. A batch without a terpene panel NOSE can read is
 * never scored, guessed or looked up by name: its card says so. Cards link
 * to the store's product page; nothing here adds to a cart. One console line,
 * once, and without detail, says when it shows nothing for a wrong attribute
 * or a feed that did not come.
 *
 * A classic script, loaded after js/match-math, js/aroma-bar, js/b2b-rank
 * and js/b2b-strings (build.sh fails a page that loads it before any of
 * them). No inline script or style and no eval: it runs under a store's CSP
 * of script-src, style-src and connect-src naming NOSE's origin. Its
 * stylesheet, css/b2b-widget.<hash>.css, is linked inside its shadow root;
 * build.sh writes that name into this file before fingerprinting it.
 * Aroma and flavour only.
 */
(function () {
  'use strict';
  const BAR = window.NoseBar, RANK = window.NoseRank, STRINGS = window.NoseStrings;
  if (!BAR || typeof BAR.renderBar !== 'function' || !RANK || typeof RANK.rank !== 'function'
      || !STRINGS || !STRINGS.default || !STRINGS.florida) {
    throw new Error('<nose-matches> needs js/match-math, js/aroma-bar, js/b2b-rank and js/b2b-strings loaded before it');
  }

  /* NOSE's origin: where this file came from, and so where the feed, the vote
     and the stylesheet are. Read once, while the script runs. */
  const SCRIPT = document.currentScript && document.currentScript.src;
  const ORIGIN = SCRIPT ? new URL(SCRIPT).origin : null;
  const STYLESHEET = '/css/b2b-widget.25464277.css';
  const FEED_PATH = '/.netlify/functions/b2b-feed';
  const VOTE_PATH = '/.netlify/functions/b2b-vote';
  const PUBLIC_KEY = /^npk_[0-9a-f]{64}$/;
  const MODES = ['rail', 'sold-out', 'vote'];
  const CATEGORIES = ['flower', 'pre-roll', 'vape', 'concentrate'];
  const RAIL_MAX = 12;
  const FEED_TIMEOUT_MS = 8000;

  /* ------------------------------------------------------------- helpers */

  const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));
  function node(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function json(text) {
    if (typeof text !== 'string') return undefined;
    try { return JSON.parse(text); } catch (e) { return undefined; }
  }
  /* A link only to an https address: the upload refuses any other product
     link, and a hand-made feed gets no javascript: link either. */
  function httpsUrl(u) {
    if (typeof u !== 'string') return null;
    try { const url = new URL(u); return url.protocol === 'https:' ? url.href : null; } catch (e) { return null; }
  }
  const isFigure = v => typeof v === 'number' && Number.isFinite(v);
  let quietOnce = false;
  function quiet() {
    if (quietOnce || !window.console) return;
    quietOnce = true;
    console.warn('nose-matches: nothing to show - check the key, the attributes and that this page\'s origin is allowed');
  }

  /* -------------------------------------------- what this browser keeps */

  /* The batches the shopper took out of the palate, and the products they
     voted on, in this browser's storage on the store's own origin - never
     sent anywhere. When storage is unavailable they last as long as the page. */
  const REMOVED_KEY = 'nose-matches-removed';
  const VOTED_KEY = 'nose-matches-voted';
  const memory = {};
  function readList(k) {
    if (!memory[k]) {
      let list = [];
      try { const v = JSON.parse(window.localStorage.getItem(k) || '[]'); if (Array.isArray(v)) list = v.filter(x => typeof x === 'string'); } catch (e) {}
      memory[k] = list;
    }
    return memory[k].slice();
  }
  function writeList(k, list) {
    memory[k] = list.slice();
    try { window.localStorage.setItem(k, JSON.stringify(list)); } catch (e) {}
  }

  /* ---------------------------------------------------------------- feed */

  /* One request per feed for the whole page, however many widgets it holds;
     no cookie, no referrer, and given up after 8 seconds. */
  const FEEDS = new Map();
  function feedUrl(el) {
    if (!ORIGIN) return null;
    const own = el.getAttribute('feed');
    if (own !== null) {
      let u;
      try { u = new URL(own, ORIGIN); } catch (e) { return null; }
      return u.origin === ORIGIN ? u.href : null;
    }
    return `${ORIGIN}${FEED_PATH}?key=${el.getAttribute('key')}`;
  }
  function loadFeed(url) {
    if (!FEEDS.has(url)) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), FEED_TIMEOUT_MS);
      FEEDS.set(url, fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal })
        .then(r => (r.ok ? r.json() : null))
        .then(f => (f && typeof f === 'object' && Array.isArray(f.batches) && f.store && typeof f.store === 'object' ? f : null))
        .catch(() => null)
        .finally(() => clearTimeout(timer)));
    }
    return FEEDS.get(url);
  }

  /* The purchases of one category - batches the feed lists in it - and the
     rest. Of a batch_id listed twice the first counts, as in js/b2b-rank. */
  function byCategory(feed, purchases, category) {
    const index = new Map();
    for (const b of feed.batches) if (b && typeof b.batch_id === 'string' && !index.has(b.batch_id)) index.set(b.batch_id, b);
    const mine = [], others = [];
    for (const p of purchases) {
      const b = p && typeof p.batchId === 'string' ? index.get(p.batchId) : undefined;
      (b && b.category === category ? mine : others).push(p);
    }
    return { mine, others };
  }

  /* --------------------------------------------------------------- views */

  function card(S, entry) {
    const b = entry.batch;
    const li = node('li', 'nm-card');
    const name = node('h3', 'nm-name');
    const href = httpsUrl(b.product_url);
    if (href) { const a = node('a', null, b.name); a.href = href; name.append(a); }
    else name.textContent = b.name;
    li.append(name);
    if (b.brand) li.append(node('p', 'nm-brand', b.brand));
    if (entry.unscored) {
      li.append(node('p', 'nm-nopanel', S.noPanel));
    } else {
      const match = node('p', 'nm-match');
      match.dataset.band = entry.band;
      const seen = node('span', null, fill(S.matchLine, { label: entry.label, shown: entry.shown }));
      seen.setAttribute('aria-hidden', 'true');
      match.append(seen, node('span', 'nm-sr', fill(S.matchAria, { label: entry.label, shown: entry.shown })));
      const bar = node('div', 'nm-bar');
      BAR.renderBar(bar, b.terps);
      li.append(match, bar);
    }
    /* THC and CBD as the store's catalog gives them: plain facts, never
       rounded, and said to be missing when it gives none. */
    const facts = node('p', 'nm-facts');
    facts.append(node('span', null, isFigure(b.thc_percent) ? fill(S.thc, { value: b.thc_percent }) : S.thcMissing),
                 node('span', null, isFigure(b.cbd_percent) ? fill(S.cbd, { value: b.cbd_percent }) : S.cbdMissing));
    li.append(facts);
    return li;
  }

  function cards(S, entries, label) {
    const list = node('ul', 'nm-cards');
    list.setAttribute('aria-label', label);
    entries.forEach(e => list.append(card(S, e)));
    return list;
  }

  const firstOf = (list, by) => {
    const seen = new Set();
    return list.filter(x => { const k = by(x); if (seen.has(k)) return false; seen.add(k); return true; });
  };

  /* What the rail's palate is made of: the batches it uses, each with its
     remove button; those taken out, each with its put-back button; and what
     it does not use. */
  function basis(S, widget, palate, category, others) {
    const used = palate.basis.used;
    const skipped = palate.basis.skipped;
    const removed = firstOf(skipped.filter(s => s.reason === RANK.REASONS.REMOVED), s => s.batchId);
    const panelLess = firstOf(skipped.filter(s => s.reason === RANK.REASONS.NO_READ || s.reason === RANK.REASONS.REFUSED), s => s.batchId);
    const otherCount = others.length + skipped.filter(s => ![RANK.REASONS.REMOVED, RANK.REASONS.NO_READ, RANK.REASONS.REFUSED].includes(s.reason)).length;
    if (!used.length && !removed.length && !panelLess.length && !otherCount) return null;

    /* Drawn again after every change, so it stays open if the shopper opened it. */
    const details = node('details', 'nm-basis');
    details.open = widget._basisOpen === true;
    details.addEventListener('toggle', () => { widget._basisOpen = details.open; });
    let summary;
    if (used.length) {
      const first = used.map(u => u.days[0]).sort()[0];
      const month = `${S.months[Number(first.slice(5, 7)) - 1]} ${first.slice(0, 4)}`;
      summary = fill(used.length === 1 ? S.basisOne : S.basisMany, { n: used.length, category: S.categories[category], month });
    } else summary = S.basisNone;
    details.append(node('summary', null, summary));

    const line = (b, text, button) => {
      const li = node('li', 'nm-basis-item');
      li.append(node('span', 'nm-basis-name', text));
      if (button) {
        const el = node('button', 'nm-button nm-quiet', button.text);
        el.type = 'button';
        el.dataset.batch = b.batch_id;
        el.dataset.action = button.action;
        el.setAttribute('aria-label', fill(button.aria, { name: b.name }));
        el.addEventListener('click', () => widget._palate(button.action, b.batch_id));
        li.append(el);
      }
      return li;
    };
    const named = b => (b.brand ? `${b.name} · ${b.brand}` : b.name);

    if (used.length) {
      const list = node('ul', 'nm-basis-list');
      used.forEach(u => list.append(line(u.batch, named(u.batch), { text: S.remove, aria: S.removeAria, action: 'remove' })));
      details.append(list);
    }
    if (removed.length) {
      details.append(node('p', 'nm-basis-title', S.removedTitle));
      const list = node('ul', 'nm-basis-list');
      removed.forEach(s => list.append(line(s.batch, named(s.batch), { text: S.putBack, aria: S.putBackAria, action: 'restore' })));
      details.append(list);
    }
    if (panelLess.length || otherCount) {
      details.append(node('p', 'nm-basis-title', S.notUsedTitle));
      const list = node('ul', 'nm-basis-list');
      panelLess.forEach(s => list.append(line(s.batch, fill(S.notUsedPanel, { name: s.batch.name }))));
      if (otherCount) list.append(line(null, fill(otherCount === 1 ? S.notUsedOthersOne : S.notUsedOthersMany, { n: otherCount })));
      details.append(list);
    }
    return details;
  }

  /* A section named by its own heading. */
  function section(cls, title) {
    const s = node('section', cls);
    const h = node('h2', 'nm-title', title);
    h.id = `${cls}-title`;
    s.setAttribute('aria-labelledby', h.id);
    s.append(h);
    return s;
  }

  /* The rail: the in-stock batches of one category, closest to the palate
     made of the shopper's purchases in that category. */
  function railView(S, widget, feed, purchases, removed, category, routes) {
    const { mine, others } = byCategory(feed, purchases, category);
    const palate = RANK.palateFrom(feed, mine, removed);
    const ranked = RANK.rank(feed, palate, { category, routes });
    const s = section('nm-rail', S.railTitle);
    if (!palate.basis.used.length) s.append(node('p', 'nm-empty', S.railEmpty));
    else if (!ranked.length) s.append(node('p', 'nm-empty', S.railNone));
    else s.append(cards(S, ranked.slice(0, RAIL_MAX), S.railTitle));
    const b = basis(S, widget, palate, category, others);
    if (b) s.append(b);
    if (ranked.length) s.append(node('p', 'nm-method', S.method));
    return s;
  }

  /* The sold-out panel: when the product the shopper buys most has no batch
     in stock, what is closest to its last batch. Nothing when it is in stock. */
  function soldOutView(S, feed, purchases, removed, routes) {
    const found = RANK.soldOut(feed, purchases, { removed, routes });
    if (!found) return null;
    const title = fill(S.soldOutTitle, { name: found.batch.name });
    const s = section('nm-soldout', title);
    if (!Object.keys(found.palate.vector).length) s.append(node('p', 'nm-empty', S.soldOutNoPanel));
    else if (!found.ranked.length) s.append(node('p', 'nm-empty', S.soldOutNone));
    else s.append(node('p', 'nm-lead', S.soldOutLead), cards(S, found.ranked.slice(0, RAIL_MAX), title), node('p', 'nm-method', S.method));
    return s;
  }

  /* The vote, on order history: for a product the shopper bought and NOSE
     could score against the rest of their purchases in its category. One
     vote per product in this browser. */
  function voteView(S, feed, purchases, removed, product, key) {
    const listed = feed.batches.find(b => b && b.product_id === product);
    if (!listed) return null;
    const { mine } = byCategory(feed, purchases, listed.category);
    const v = RANK.voteScore(feed, mine, product, { removed });
    if (!v) return null;
    const s = node('section', 'nm-vote');
    const question = node('p', 'nm-question', S.voteQuestion);
    question.id = 'nm-vote-question';
    s.setAttribute('aria-labelledby', question.id);
    s.append(question, node('p', 'nm-lead', fill(S.voteMatched, { label: v.label, shown: v.shown })));
    const thanks = node('p', 'nm-thanks');
    thanks.setAttribute('role', 'status');
    if (readList(VOTED_KEY).includes(product)) {
      thanks.textContent = S.voteThanks;
      s.append(thanks);
      return s;
    }
    const group = node('div', 'nm-vote-buttons');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-labelledby', question.id);
    const buttons = [['up', S.voteUp], ['down', S.voteDown]].map(([vote, text]) => {
      const button = node('button', 'nm-button', text);
      button.type = 'button';
      button.dataset.vote = vote;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        /* b2b-vote's six fields, named one by one: nothing else rides along. */
        const body = JSON.stringify({ key, candidate: v.payload.candidate, score: v.payload.score,
                                      band: v.payload.band, palateSize: v.payload.palateSize, vote });
        try { if (navigator.sendBeacon) navigator.sendBeacon(ORIGIN + VOTE_PATH, body); } catch (e) {}
        writeList(VOTED_KEY, readList(VOTED_KEY).concat([product]));
        buttons.forEach(b => { b.disabled = true; b.setAttribute('aria-pressed', String(b === button)); });
        thanks.textContent = S.voteThanks;
      });
      return button;
    });
    group.append(...buttons);
    s.append(group, thanks);
    return s;
  }

  /* ------------------------------------------------------------ element */

  const LIVE = new Set();

  class NoseMatches extends HTMLElement {
    static get observedAttributes() {
      return ['key', 'mode', 'category', 'routes', 'purchases', 'consent', 'group', 'product', 'strings', 'feed'];
    }
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: 'open' });
      this._view = node('div', 'nm');
      this._view.hidden = true;
      this._shadow.append(this._view);
      this._style = null;
      this._token = 0;
      this._queued = false;
    }
    connectedCallback() { LIVE.add(this); this._schedule(); }
    disconnectedCallback() { LIVE.delete(this); }
    attributeChangedCallback() { this._schedule(); }

    _schedule() {
      if (this._queued) return;
      this._queued = true;
      queueMicrotask(() => { this._queued = false; this._render(); });
    }

    _show(content) {
      if (!content) { this._view.replaceChildren(); return; }
      if (!this._style) {
        /* Linked on the first thing shown, so a widget that shows nothing
           loads nothing. The view waits for it, so it never flashes
           unstyled - and shows anyway if the stylesheet cannot load. */
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = new URL(STYLESHEET, ORIGIN).href;
        const ready = () => { this._view.hidden = false; };
        link.addEventListener('load', ready, { once: true });
        link.addEventListener('error', ready, { once: true });
        this._shadow.insertBefore(link, this._view);
        this._style = link;
      }
      this._view.replaceChildren(content);
    }

    _strings() { return this.getAttribute('strings') === 'florida' ? STRINGS.florida : STRINGS.default; }

    async _render() {
      const token = ++this._token;
      const S = this._strings();
      if (this.getAttribute('group') === 'control' || !ORIGIN) { this._show(null); return; }
      const consent = this.getAttribute('consent');
      if (consent === 'denied') { this._show(null); return; }
      if (consent !== 'granted') { this._show(this._consentView(S)); return; }

      /* Everything the mode needs, checked before anything is fetched. */
      const mode = this.getAttribute('mode') || 'rail';
      const key = this.getAttribute('key');
      const category = this.getAttribute('category');
      const product = this.getAttribute('product');
      const routes = mode === 'vote' ? [] : json(this.getAttribute('routes'));
      const url = MODES.includes(mode) && PUBLIC_KEY.test(key || '') ? feedUrl(this) : null;
      if (!url || !Array.isArray(routes) || (mode === 'rail' && !CATEGORIES.includes(category))
          || (mode === 'vote' && !product)) {
        this._show(null); quiet(); return;
      }
      const given = json(this.getAttribute('purchases'));
      const purchases = Array.isArray(given) ? given : [];
      const removed = readList(REMOVED_KEY);

      const feed = await loadFeed(url);
      if (token !== this._token) return;
      if (!feed) { this._show(null); quiet(); return; }
      const content = mode === 'rail' ? railView(S, this, feed, purchases, removed, category, routes)
        : mode === 'sold-out' ? soldOutView(S, feed, purchases, removed, routes)
        : voteView(S, feed, purchases, removed, product, key);
      this._show(content);
      /* After a remove or a put-back, the button that undoes it is the
         active one, so the keyboard keeps its place. */
      const f = this._landOn;
      this._landOn = null;
      if (f) {
        const button = [...this._view.querySelectorAll('button[data-batch]')].find(b => b.dataset.batch === f.batchId && b.dataset.action === f.action);
        if (button) button.focus();
      }
    }

    _consentView(S) {
      const wrap = node('div', 'nm-consent');
      const button = node('button', 'nm-button nm-primary', S.consentButton);
      button.type = 'button';
      const note = node('p', 'nm-note', S.consentNote);
      note.id = 'nm-consent-note';
      button.setAttribute('aria-describedby', note.id);
      button.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('nose:consent', { bubbles: true, composed: true, detail: { consent: 'granted' } }));
      });
      wrap.append(button, note);
      return wrap;
    }

    /* A batch out of the palate, or back in it: kept here, told to the page,
       and every widget on the page drawn again. */
    _palate(action, batchId) {
      const now = readList(REMOVED_KEY).filter(id => id !== batchId);
      if (action === 'remove') now.push(batchId);
      writeList(REMOVED_KEY, now);
      const type = action === 'remove' ? 'nose:palate-removed' : 'nose:palate-restored';
      this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail: { batchId, removed: now.slice() } }));
      this._landOn = { batchId, action: action === 'remove' ? 'restore' : 'remove' };
      LIVE.forEach(w => w._schedule());
    }
  }

  if (!window.customElements.get('nose-matches')) window.customElements.define('nose-matches', NoseMatches);
})();

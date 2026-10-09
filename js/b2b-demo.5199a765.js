/* NOSE - the dispensary widget's demo page, b2b/demo/. It plays the store's
 * page: it hands <nose-matches> what the presenter sets in the form - a
 * made-up purchase list typed in, never a real shopper's - records consent
 * when the widget asks, and lists the events the widget fires. The test
 * store's feed is b2b/demo/test-store.json (scripts/b2b-demo-feed.js).
 * Nothing typed here leaves the page. Not linked from the site; noindex.
 * PARSER-HANDOFF s14, "The widget".
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const widget = $('demoWidget');
  const form = $('demoForm');
  if (!widget || !form) return;

  /* An example purchase list, made up, dated back from today so it stays
     inside the test store's twelve-month window: the shopper's usual, bought
     three times and now sold out; two more flower products; a flower batch
     whose report was refused, and one with no reading; a pre-roll; a vape; a
     batch this store never listed; and a purchase from before the window. */
  const day = back => new Date(Date.now() - back * 86400000).toISOString().slice(0, 10);
  const EXAMPLE = [['DB-1106', 11], ['DB-1120', 20], ['DB-1106', 40], ['DB-1106', 75], ['DB-1115', 117], ['DB-1103', 152],
                   ['DB-1119', 173], ['DB-1130', 215], ['DB-1118', 236], ['DB-9999', 271], ['DB-1112', 432]];
  $('demoPurchases').value = EXAMPLE.map(([id, back]) => `${id} ${day(back)}`).join('\n');

  function purchases() {
    return $('demoPurchases').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [batchId, when] = l.split(/[\s,]+/);
      return { batchId, day: when || '' };
    });
  }
  function routes() {
    return ['demoRouteSmoking', 'demoRouteInhalation'].map($).filter(c => c.checked).map(c => c.value);
  }
  function apply() {
    widget.setAttribute('mode', $('demoMode').value);
    widget.setAttribute('consent', $('demoConsent').value);
    widget.setAttribute('group', $('demoGroup').value);
    widget.setAttribute('strings', $('demoStrings').value);
    widget.setAttribute('category', $('demoCategory').value);
    widget.setAttribute('routes', JSON.stringify(routes()));
    if ($('demoProduct').value) widget.setAttribute('product', $('demoProduct').value);
    /* As a store's page should: the purchase list only once the shopper has
       said yes. The widget ignores it otherwise anyway. */
    if ($('demoConsent').value === 'granted') widget.setAttribute('purchases', JSON.stringify(purchases()));
    else widget.removeAttribute('purchases');
    explainQuiet();
  }

  /* When the widget shows nothing, the demo says why - in its own words,
     not the widget's: the widget itself stays silent. */
  function explainQuiet() {
    setTimeout(() => {
      const empty = !widget.shadowRoot || widget.shadowRoot.textContent.trim() === '';
      const why = $('demoGroup').value === 'control' ? 'Control group: the widget shows nothing, and loads and sends nothing.'
        : $('demoConsent').value === 'denied' ? 'The shopper said no: the widget shows nothing and never reads the purchases.'
        : $('demoMode').value === 'sold-out' ? 'Nothing to show: the product bought most has a batch in stock, or no purchase counts.'
        : $('demoMode').value === 'vote' ? 'Nothing to show: that product was not bought, has no terpene panel available, or nothing else bought in its category has one.'
        : 'Nothing to show for these settings.';
      $('demoQuiet').textContent = why;
      $('demoQuiet').hidden = !empty;
    }, 400);
  }
  form.addEventListener('submit', e => { e.preventDefault(); apply(); });
  form.addEventListener('change', apply);

  $('demoReset').addEventListener('click', () => {
    try { localStorage.removeItem('nose-matches-removed'); localStorage.removeItem('nose-matches-voted'); } catch (e) {}
    location.reload();
  });

  /* What the page is told. */
  function told(text) {
    const li = document.createElement('li');
    li.textContent = text;
    $('demoEvents').prepend(li);
    $('demoNoEvents').hidden = true;
  }
  widget.addEventListener('nose:consent', () => {
    told('nose:consent - the shopper said yes; the page records it and sets consent="granted"');
    $('demoConsent').value = 'granted';
    apply();
  });
  widget.addEventListener('nose:palate-removed', e => told(`nose:palate-removed - ${e.detail.batchId} out of the palate`));
  widget.addEventListener('nose:palate-restored', e => told(`nose:palate-restored - ${e.detail.batchId} back in the palate`));

  /* The test store's batches, for the presenter to pick from. */
  fetch(widget.getAttribute('feed'), { credentials: 'omit' })
    .then(r => (r.ok ? r.json() : null))
    .then(feed => {
      if (!feed || !Array.isArray(feed.batches)) return;
      const body = $('demoMenu');
      const products = new Map();
      for (const b of feed.batches) {
        const tr = document.createElement('tr');
        const panel = b.usable === true ? `read (${b.lab})` : b.usable === false ? 'refused' : 'no reading';
        [b.batch_id, b.brand ? `${b.name} · ${b.brand}` : b.name, b.category, b.in_stock ? 'yes' : 'no', panel].forEach(text => {
          const td = document.createElement('td');
          td.textContent = text;
          tr.append(td);
        });
        body.append(tr);
        if (!products.has(b.product_id)) products.set(b.product_id, b.name);
      }
      const select = $('demoProduct');
      for (const [id, name] of products) {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = `${name} (${id})`;
        select.append(o);
      }
      select.value = 'D-103';
      apply();
    })
    .catch(() => {});
})();

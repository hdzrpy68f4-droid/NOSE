/* NOSE age gate — self-attested 21+. External file (CSP: script-src 'self').
   Injects its own styles so it works on every page regardless of which
   stylesheet that page loads. Remembers a pass so it asks only once. */
(function () {
  var KEY = 'nose-age-ok';
  try { if (localStorage.getItem(KEY) === '1') return; } catch (e) { /* storage blocked; gate every load */ }

  var css = '' +
    '#nose-ag{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;' +
    'justify-content:center;padding:24px;background:rgba(15,21,15,.86);' +
    '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);' +
    'font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
    '#nose-ag .ag-card{width:min(440px,100%);background:#F2F4F1;color:#1A241E;' +
    'border-radius:20px;padding:38px 32px;text-align:center;' +
    'box-shadow:0 40px 90px -30px rgba(0,0,0,.6)}' +
    '#nose-ag .ag-bars{display:flex;gap:3px;justify-content:center;margin-bottom:22px}' +
    '#nose-ag .ag-bars i{width:7px;height:26px;border-radius:3px;display:block}' +
    '#nose-ag h2{margin:0 0 10px;font-size:1.6rem;letter-spacing:-.03em;line-height:1.15}' +
    '#nose-ag p{margin:0 0 26px;color:#536057;font-size:1rem;line-height:1.55}' +
    '#nose-ag .ag-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}' +
    '#nose-ag button{min-height:48px;padding:0 26px;border-radius:999px;border:0;' +
    'font-weight:750;font-size:1rem;cursor:pointer;font-family:inherit}' +
    '#nose-ag .ag-yes{background:#2F6144;color:#fff}' +
    '#nose-ag .ag-no{background:transparent;color:#1A241E;border:1px solid rgba(24,33,27,.28)}' +
    '#nose-ag .ag-yes:focus-visible,#nose-ag .ag-no:focus-visible{outline:3px solid rgba(47,97,68,.5);outline-offset:3px}' +
    '#nose-ag .ag-deny h2{margin-bottom:14px}' +
    '#nose-ag .ag-fine{margin-top:22px;font-size:.8rem;color:#6E655C}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var fam = ['#D19412','#9C6B3F','#C25B2E','#3E7A54','#8A6BBE','#4E8D99'];
  var bars = fam.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('');

  var ask =
    '<div class="ag-card" role="dialog" aria-modal="true" aria-labelledby="ag-t" aria-describedby="ag-d">' +
      '<div class="ag-bars" aria-hidden="true">' + bars + '</div>' +
      '<h2 id="ag-t">Are you 21 or older?</h2>' +
      '<p id="ag-d">NOSE is an educational tool for adults 21 and up. ' +
      'We can\u2019t check your ID through a screen, so we\u2019re trusting you here.</p>' +
      '<div class="ag-btns">' +
        '<button class="ag-yes" type="button">Yes, I\u2019m 21+</button>' +
        '<button class="ag-no" type="button">No, not yet</button>' +
      '</div>' +
      '<p class="ag-fine">Educational tool \u00b7 Not medical advice</p>' +
    '</div>';

  var deny =
    '<div class="ag-card ag-deny" role="dialog" aria-modal="true" aria-labelledby="ag-t2">' +
      '<div class="ag-bars" aria-hidden="true">' + bars + '</div>' +
      '<h2 id="ag-t2">Come back in a few birthdays.</h2>' +
      '<p>NOSE is strictly a 21-and-over affair \u2014 like a very boring nightclub ' +
      'that only talks about terpenes. The door policy stands. No amount of ' +
      '\u201Cbut my birthday\u2019s soon\u201D gets you past the velvet rope.</p>' +
      '<p class="ag-fine">Your terpenes will keep. So will we.</p>' +
    '</div>';

  var overlay = document.createElement('div');
  overlay.id = 'nose-ag';
  overlay.innerHTML = ask;
  document.body.appendChild(overlay);
  document.documentElement.style.overflow = 'hidden';

  var lastFocus = document.activeElement;
  var yes = overlay.querySelector('.ag-yes');
  var no = overlay.querySelector('.ag-no');
  if (yes) yes.focus();

  function close() {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    overlay.remove();
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function denied() {
    overlay.innerHTML = deny;
    var h = overlay.querySelector('h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
  }

  if (yes) yes.addEventListener('click', close);
  if (no) no.addEventListener('click', denied);

  // Keep focus inside the dialog while it's open (basic trap).
  overlay.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var f = overlay.querySelectorAll('button, [tabindex]');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
})();

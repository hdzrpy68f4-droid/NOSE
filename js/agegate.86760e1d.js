/* NOSE age gate. Styles live in /css/agegate.css (CSP: style-src 'self'
   blocks JS-injected CSS). This file only builds the DOM and handles clicks.
   Fails SAFE: if anything goes wrong, it never leaves the page scroll-locked
   without a visible gate. */
(function () {
  var KEY = 'nose-age-ok';
  try { if (localStorage.getItem(KEY) === '1') return; } catch (e) {}

  function lock()   { document.documentElement.style.overflow = 'hidden'; }
  function unlock() { document.documentElement.style.overflow = ''; }

  /* Classes, not inline styles: CSP style-src 'self' blocks style="" attrs,
     which was silently rendering these bars colourless. */
  var fam  = ['citrus','earthy','spice','pine','floral','herbal'];
  var bars = fam.map(function (n) { return '<i class="ag-' + n + '"></i>'; }).join('');

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
      'that only talks about terpenes. The door policy stands.</p>' +
      '<p class="ag-fine">Your terpenes will keep \u00b7 So will we</p>' +
    '</div>';

  function build() {
    var overlay = document.createElement('div');
    overlay.id = 'nose-ag';
    overlay.innerHTML = ask;
    document.body.appendChild(overlay);
    lock();

    var lastFocus = document.activeElement;
    var yes = overlay.querySelector('.ag-yes');
    var no  = overlay.querySelector('.ag-no');
    if (yes) yes.focus();

    function pass() {
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
      overlay.remove(); unlock();
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function denied() {
      overlay.innerHTML = deny;
      var h = overlay.querySelector('h2');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
    }

    if (yes) yes.addEventListener('click', pass);
    if (no)  no.addEventListener('click', denied);

    overlay.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = overlay.querySelectorAll('button, [tabindex]');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  // Body must exist before we append. defer usually guarantees this, but be safe.
  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();

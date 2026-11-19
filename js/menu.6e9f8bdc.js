/* NOSE - the phone menu in the shared header, on every page that has one.
 * Until 2026-11-19 only the home page and /app had a menu button, driven from
 * js/nose; the other pages showed their links in a row that ran off a phone's
 * screen (13-records, "Every page gets the phone menu"). Under 900px the
 * header's links hide (css/world) and the button opens #mobileMenu: focus goes
 * to its first link, Tab stays inside it while it is open, Escape closes it
 * and gives focus back to the button, and a route change in /app closes it.
 * build.sh fingerprints it: js/menu.<hash>.js.
 */
(function () {
  'use strict';
  const button = document.getElementById('menuButton'), menu = document.getElementById('mobileMenu');
  if (!button || !menu) return;
  const set = open => {
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    menu.dataset.open = String(open);
  };
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    set(open);
    if (open) { const first = menu.querySelector('a[href]'); if (first) first.focus(); }
  });
  document.addEventListener('keydown', event => {
    if (menu.dataset.open !== 'true') return;
    if (event.key === 'Escape') { set(false); button.focus(); return; }
    if (event.key !== 'Tab') return;
    const links = menu.querySelectorAll('a[href]'), first = links[0], last = links[links.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.addEventListener('hashchange', () => set(false));
}());

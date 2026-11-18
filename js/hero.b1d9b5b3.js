/* NOSE desk: the equalizer's pages. External file (CSP: script-src 'self').
 *
 * The desk itself is js/aroma-bar's createDesk() since 2026-11-18, so the
 * dispensary widget draws the same one; this file sets window.NoseDesk to it
 * for js/nose, and lights the desks of the pages below. Load it after
 * js/match-math and js/aroma-bar. DESIGN.md, "The desk".
 *
 * Two pages use it:
 *   - the home page's opening screen (#hero-eq): a sample jar's terpenes by
 *     family, in percent by weight, so a louder jar stands taller. The jars
 *     are the app's own samples (window.NoseSamples, set by js/nose) and the
 *     terpene-to-family map is js/match-math's; this file copies neither.
 *   - the matcher's result (js/nose calls NoseDesk), each family's share of a
 *     profile.
 *   - a reading page's worked examples: a canvas.result-eq with data-shares,
 *     six whole percents in family order, lit as the matcher's result is
 *     (full at 60%). learn/intensity-versus-character since 2026-11-18.
 * The printed figures beside a desk are exact; the motion is a meter's shimmer
 * around them.
 *
 */
(function () {
  var create = window.NoseBar && window.NoseBar.createDesk;
  if (!create) throw new Error('js/hero needs js/match-math and js/aroma-bar loaded before it (window.NoseBar)');
  window.NoseDesk = Object.freeze({ create: create });

  /* ---- the home page's opening screen ---------------------------------- */
  function home() {
    var canvas = document.getElementById('hero-eq');
    var samples = window.NoseSamples, match = window.NoseMatch;
    if (!canvas || !samples || !samples.length || !match || !match.TERPENES) return;
    var ORDER = ['citrus','earthy','spice','pine','floral','herbal'];
    var FIRST = 'cold-creek';   /* the jar the page is served showing */
    var FULL = 1.05;            /* percent by weight that lights a whole column */
    var jars = samples.map(function (p) {
      var fam = [0,0,0,0,0,0], total = 0;
      Object.keys(p.terps).forEach(function (k) {
        var t = match.TERPENES[k], v = +p.terps[k];
        if (!t || !(v > 0)) return;
        fam[ORDER.indexOf(t.family)] += v; total += v;
      });
      return { id: p.id, name: p.name, sub: p.subtitle, fam: fam, total: total };
    });
    jars.sort(function (a, b) { return (b.id === FIRST) - (a.id === FIRST); });
    var desk = create(canvas); if (!desk) return;
    var at = 0, byId = function (id) { return document.getElementById(id); }, vals = document.querySelectorAll('.ch-val');
    function show() {
      var j = jars[at];
      byId('jarName').textContent = j.name;
      byId('jarSub').textContent = j.sub;
      byId('vol').textContent = j.total.toFixed(2);
      for (var i = 0; i < 6 && i < vals.length; i++) vals[i].textContent = j.fam[i] ? j.fam[i].toFixed(2) + '%' : '0%';
      desk.set(j.fam, FULL);
    }
    function turn(by) { at = (at + by + jars.length) % jars.length; show(); }
    byId('jarPrev').addEventListener('click', function () { turn(-1); });
    byId('jarNext').addEventListener('click', function () { turn(1); });
    show();
  }
  /* js/nose sets window.NoseSamples when it runs, and the pages list this file
     before it (js/nose draws its own desks with NoseDesk). Deferred scripts run
     while readyState is already 'interactive' and have all run by
     DOMContentLoaded, so the home page waits for that. */
  function examples() {
    [].forEach.call(document.querySelectorAll('canvas.result-eq[data-shares]'), function (c) {
      var desk = create(c);
      if (desk) desk.set(c.getAttribute('data-shares').split(',').map(function (v) { return v / 100; }), 0.6);
    });
  }
  function start() { home(); examples(); }
  if (document.readyState === 'complete') start();
  else document.addEventListener('DOMContentLoaded', start);
})();

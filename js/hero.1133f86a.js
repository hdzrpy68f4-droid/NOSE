/* NOSE desk: the equalizer. External file (CSP: script-src 'self').
 *
 * window.NoseDesk.create(canvas) draws six channels, one per aroma family, in
 * family order with no gap between them, and returns { set(levels, scale) }:
 * six numbers in family order and the value that lights a whole column. Each
 * column drifts around its level on two slow sines and travels to a new level
 * when set() is called again. DESIGN.md, "The desk".
 *
 * Two pages use it:
 *   - the home page's opening screen (#hero-eq): a sample jar's terpenes by
 *     family, in percent by weight, so a louder jar stands taller. The jars
 *     are the app's own samples (window.NoseSamples, set by js/nose) and the
 *     terpene-to-family map is js/match-math's; this file copies neither.
 *   - the matcher's result (js/nose calls NoseDesk), each family's share of a
 *     profile.
 * The printed figures beside a desk are exact; the motion is a meter's shimmer
 * around them.
 *
 * FILLS is one of the four copies of the family fills that cannot read
 * css/tokens (a canvas is drawn by script); test/colour-tokens-test.js fails
 * unless it equals that file. Motion stops for prefers-reduced-motion and
 * pauses while a desk is off screen or the tab is hidden.
 */
(function () {
  var FILLS = ['#D19412','#9C6B3F','#C25B2E','#3E7A54','#8A6BBE','#4E8D99'];
  var SWING = 0.34;   /* how far a column drifts from its level */
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var RGB = FILLS.map(function (h) { return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; });
  function mix(a, t) { return 'rgb(' + a.map(function (v) { return Math.round(v + (255 - v) * t); }).join(',') + ')'; }
  function tint(a, al) { return 'rgba(' + a.join(',') + ',' + al + ')'; }

  function create(canvas) {
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;
    var W = 0, H = 0, dpr = 1, cols = [], peaks = [], cur = [0,0,0,0,0,0], tgt = cur.slice(), scale = 1;
    var raf = 0, last = 0, seen = true, moved = false;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      if (!W || !H) return;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = 6 * (W < 560 ? 4 : 8);
      if (cols.length !== n) {
        cols = []; peaks = [];
        for (var i = 0; i < n; i++) {
          cols.push({ p: Math.random() * 6.28, a: (.14 + Math.random() * .22) * 3.2, b: (.26 + Math.random() * .30) * 3.2 });
          peaks.push(0);
        }
      }
      draw(performance.now() / 1000);
    }

    function level(i, g, t) {
      var c = cols[i], w = reduce ? 1 : 1 + (Math.sin(t * c.a + c.p) * .55 + Math.sin(t * c.b + c.p * 1.7) * .45) * SWING;
      return Math.max(0, Math.min(1, cur[g] / scale * w));
    }

    function draw(t) {
      if (!W || !H || !cols.length) return;
      ctx.clearRect(0, 0, W, H);
      var per = cols.length / 6, gap = W < 560 ? 2 : 3, bW = (W - gap * (cols.length - 1)) / cols.length;
      var cell = W < 560 ? 4 : 5, vGap = 2, rows = Math.floor(H / (cell + vGap));
      var i, g, x, lit = [];
      for (i = 0; i < cols.length; i++) lit.push(Math.round(level(i, Math.floor(i / per), t) * rows));

      /* pass 1: halos only - each rect is drawn off the canvas and only its shadow lands */
      ctx.save();
      ctx.shadowBlur = (W < 560 ? 10 : 16) * dpr; ctx.shadowOffsetX = 20000 * dpr; ctx.fillStyle = '#000';
      for (i = 0; i < cols.length; i++) {
        if (!lit[i]) continue;
        g = Math.floor(i / per); x = i * (bW + gap);
        var hh = lit[i] * (cell + vGap) - vGap;
        ctx.shadowColor = tint(RGB[g], .6);
        ctx.fillRect(x - 20000, H - hh, bW, hh);
      }
      ctx.restore();

      /* pass 2: the segments, with a brighter peak marker that falls slowly */
      for (i = 0; i < cols.length; i++) {
        g = Math.floor(i / per); x = i * (bW + gap);
        peaks[i] = Math.max(lit[i], peaks[i] - (reduce ? rows : .04));
        var peak = Math.round(peaks[i]);
        for (var s = 0; s < rows; s++) {
          ctx.fillStyle = s < lit[i] ? mix(RGB[g], .3 * (s / rows))
                        : (s === peak && lit[i] > 0 ? mix(RGB[g], .55) : tint(RGB[g], .13));
          ctx.fillRect(x, H - (s + 1) * (cell + vGap) + vGap, bW, cell);
        }
      }
    }

    function frame(now) {
      var dt = Math.min(.05, (now - last) / 1000) || .016; last = now;
      var far = 0;
      for (var i = 0; i < 6; i++) { cur[i] += (tgt[i] - cur[i]) * Math.min(1, dt * 7); far = Math.max(far, Math.abs(tgt[i] - cur[i])); }
      draw(now / 1000);
      raf = (!reduce || far > .002) && seen && !document.hidden ? requestAnimationFrame(frame) : 0;
      if (!raf && reduce) { cur = tgt.slice(); draw(0); }
    }
    function run() { if (!raf && seen && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else run(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { seen = e[0].isIntersecting; if (!seen) stop(); else { resize(); run(); } }).observe(canvas);
    }
    /* a desk in a panel that starts hidden has no size until it is shown */
    if ('ResizeObserver' in window) new ResizeObserver(function () { if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize(); }).observe(canvas);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
    window.addEventListener('load', resize);

    return {
      set: function (levels, full) {
        tgt = levels.slice(0, 6); scale = full || 1;
        if (!moved) { cur = tgt.slice(); moved = true; }
        resize();
        if (reduce) { cur = tgt.slice(); draw(0); } else run();
      },
      resize: resize
    };
  }

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
  if (document.readyState === 'complete') home();
  else document.addEventListener('DOMContentLoaded', home);
})();

/* NOSE - the aroma bar. ONE copy, for the app and the dispensary widget.
 *
 * The six aroma families, a profile's share in each, and the segmented bar
 * that shows them: segment width is the family's share, segment colour the
 * family's, role="img" with the whole profile in its aria-label. The app
 * (js/nose.*.js, on / and /app) and the dispensary widget
 * (js/b2b-widget.*.js) both draw it with this file, so a jar's bar in a
 * store's widget is the bar NOSE shows for it. Never copy any of it
 * elsewhere. PARSER-HANDOFF s14, "The widget".
 *
 * Moved verbatim from js/nose.593b2c1b.js on 2026-10-08:
 *
 *   FAMILIES        the six families, in their fixed order: label, colour,
 *                   and the app's family-card copy and images
 *   FAMILY_ORDER    their keys, in that order
 *   familyShares()  a profile as shares of the six families - normalize()
 *                   first, so the bar shows shape, never loudness
 *   renderBar()     the bar, drawn into an element or the element of an id
 *   createDesk()    the equalizer on a canvas (from js/hero, 2026-11-18)
 *
 * FAMILIES' color and text copy css/tokens.css, which a store's page - where
 * the widget runs this file too - does not load; test/colour-tokens-test.js
 * fails unless they are equal. Five of its inks, all but citrus's, became the
 * tokens' on 2026-10-15 (PARSER-HANDOFF s13, "One home for the family colours").
 *
 * It holds no maths: normalize() and TERPENES come from NoseMatch,
 * js/match-math.<hash>.js. Loaded as a classic script after js/match-math in
 * a page (sets window.NoseBar; build.sh fails a page that loads this before
 * js/match-math, or js/nose or js/b2b-widget before this), and by require()
 * in Node (module.exports), where it takes the maths through
 * scripts/lib/match.js. build.sh fingerprints it: js/aroma-bar.<hash>.js.
 * Aroma and flavour only.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module && module.exports) module.exports = factory(require('../scripts/lib/match.js').load());
  else root.NoseBar = factory(root.NoseMatch);
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';
  if (!M || typeof M.normalize !== 'function' || !M.TERPENES) {
    throw new Error('NoseBar needs js/match-math loaded before it (window.NoseMatch)');
  }
  const { TERPENES, normalize } = M;

    const FAMILIES = {
      citrus:{label:'Citrus',color:'#D19412',text:'#654700',description:'Lemon peel, orange zest, grapefruit and bright pith.',compounds:['Limonene'],image:'/images/families/citrus.jpg',width:620,height:465,alt:'Lemon peel spirals, a halved orange and juniper berries on a warm gold surface.'},
      earthy:{label:'Earthy',color:'#9C6B3F',text:'#5C3B20',description:'Damp earth, clove, musk and mossy wood.',compounds:['Myrcene'],image:'/images/families/earthy.jpg',width:620,height:496,alt:'Cloves, a mango slice, moss-covered bark and thyme on dark brown.'},
      spice:{label:'Spice',color:'#C25B2E',text:'#7E3417',description:'Black pepper, dry spice, wood and warm bite.',compounds:['β-Caryophyllene','α-Humulene'],image:'/images/families/spice.jpg',width:620,height:496,alt:'Cracked black peppercorns, whole cloves and split wood on burnt orange.'},
      pine:{label:'Pine',color:'#3E7A54',text:'#2A5439',description:'Pine needle, rosemary, fir and resinous green notes.',compounds:['α-Pinene','β-Pinene','Fenchol','Camphene'],image:'/images/families/pine.jpg',width:620,height:413,alt:'A pine sprig, rosemary stems and a fir cone on deep forest green.'},
      floral:{label:'Floral',color:'#8A6BBE',text:'#4E3878',description:'Lavender, rose, chamomile and soft perfumed spice.',compounds:['Linalool','α-Bisabolol','α-Terpineol','Nerolidol'],image:'/images/families/floral.jpg',width:620,height:620,alt:'A lavender stem, a rose and coriander seed on muted violet.'},
      herbal:{label:'Herbal',color:'#4E8D99',text:'#2C565E',description:'Fresh herbs, apple skin, tea tree and airy green notes.',compounds:['Terpinolene','Ocimene'],image:'/images/families/herbal.jpg',width:620,height:620,alt:'Fresh basil, a green apple slice and loose green tea on teal.'}
    };
    const FAMILY_ORDER = Object.keys(FAMILIES);

    function familyShares(values){ const normalized=normalize(values); const out=Object.fromEntries(FAMILY_ORDER.map(key=>[key,0])); Object.entries(normalized).forEach(([key,value])=>{ if(TERPENES[key]) out[TERPENES[key].family]+=value; }); return out; }

    /* What a desk says aloud: the words renderBar() gives its bar, below, which
       stays as moved on 2026-10-08; b2b-widget-test holds the two equal. */
    function profileLabel(shares){ return `Aroma profile: ${FAMILY_ORDER.filter(key=>shares[key]>.001).map(key=>`${FAMILIES[key].label} ${Math.round(shares[key]*100)}%`).join(', ') || 'no values'}`; }

    function renderBar(target,values){
      const element=typeof target==='string' ? document.getElementById(target) : target;
      const shares=familyShares(values);
      const description=FAMILY_ORDER.filter(key=>shares[key]>.001).map(key=>`${FAMILIES[key].label} ${Math.round(shares[key]*100)}%`).join(', ');
      const bar=document.createElement('div');
      bar.className='profile-bar';
      bar.setAttribute('role','img');
      bar.setAttribute('aria-label',`Aroma profile: ${description || 'no values'}`);
      FAMILY_ORDER.forEach(key=>{
        const share=shares[key];
        if(share<=0) return;
        const segment=document.createElement('div');
        segment.className='profile-segment';
        segment.style.width=`${(share*100).toFixed(2)}%`;
        segment.style.background=FAMILIES[key].color;
        segment.title=`${FAMILIES[key].label} ${Math.round(share*100)}%`;
        if(share>.17){ const label=document.createElement('span'); label.textContent=FAMILIES[key].label; label.style.color=key==='citrus'?'#18211B':'white'; segment.append(label); }
        bar.append(segment);
      });
      element.replaceChildren(bar);
    }

    /* ---- the desk (the equalizer), moved from js/hero on 2026-11-18 -------
       createDesk(canvas, still) draws six channels, one per family in FAMILY_ORDER,
       with no gap between them, and returns { set(levels, full), resize }: six
       numbers in that order and the value that lights a whole column. Each
       column drifts around its level on two slow sines and travels to a new
       level on the next set(). Its fills are FAMILIES' colours. Motion stops
       for prefers-reduced-motion, and always with still set; it pauses while a desk is off screen or the
       tab is hidden. Drawn by the app, the home page and the widget; in Node
       it is defined, never called. DESIGN.md, "The desk". */
    const createDesk = (function () {
  var FILLS = FAMILY_ORDER.map(function (k) { return FAMILIES[k].color; });
  var SWING = 0.34;   /* how far a column drifts from its level */
  var reducedMotion = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var RGB = FILLS.map(function (h) { return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; });
  function mix(a, t) { return 'rgb(' + a.map(function (v) { return Math.round(v + (255 - v) * t); }).join(',') + ')'; }
  function tint(a, al) { return 'rgba(' + a.join(',') + ',' + al + ')'; }

  function create(canvas, still) {
    var reduce = reducedMotion || !!still;   /* still: drawn at its levels, never moving (the widget's cards) */
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

  return create;
    })();

    return Object.freeze({ FAMILIES, FAMILY_ORDER, familyShares, profileLabel, renderBar, createDesk });
});

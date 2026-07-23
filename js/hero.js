/* NOSE hero equalizer. External file (CSP: script-src 'self').
   Draws six family groups of bars along the bottom of the hero.
   Respects prefers-reduced-motion and pauses when scrolled offscreen. */
(function () {
  var hero   = document.querySelector('.hero');
  var canvas = document.getElementById('hero-eq');
  if (!hero || !canvas || !canvas.getContext) return;   // fail safe: no canvas, no harm

  var ctx  = canvas.getContext('2d');
  var card = hero.querySelector('.demo-card');   /* mobile: band stops above this */
  var FILLS = ['#D19412','#9C6B3F','#C25B2E','#3E7A54','#8A6BBE','#4E8D99'];
  var reduce = window.matchMedia &&
               window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var SEG = 22, SHIMMER = 0.16;
  var perFam = 4, W = 0, H = 0, dpr = 1, cols = [], famOf = [];

  function hx(h){ h = h.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
  function mix(a,b,t){ var A=hx(a),B=hx(b);
    return 'rgb('+Math.round(A[0]+(B[0]-A[0])*t)+','+Math.round(A[1]+(B[1]-A[1])*t)+','+Math.round(A[2]+(B[2]-A[2])*t)+')'; }
  function rgba(a,al){ var A=hx(a); return 'rgba('+A[0]+','+A[1]+','+A[2]+','+al+')'; }

  function buildColumns(){
    var cw = canvas.clientWidth || hero.clientWidth;
    perFam = cw < 560 ? 3 : (cw < 900 ? 4 : 5);
    cols = []; famOf = [];
    var n = FILLS.length * perFam;
    for (var c = 0; c < n; c++){
      famOf.push(Math.floor(c / perFam));
      cols.push({
        phase: Math.random()*Math.PI*2,
        fA: 0.14 + Math.random()*0.22,
        fB: 0.26 + Math.random()*0.30,
        base: 0.42 + Math.random()*0.18,
        level: 0.4
      });
    }
  }

  function isMobile(){ return window.innerWidth <= 640; }

  /* On mobile the demo card stacks below the copy. CSS can't know where it
     starts, so measure it and end the band just above it. Desktop keeps the
     CSS height (band anchored to the bottom of the banner). */
  function fitBand(){
    if (isMobile() && card){
      var hr = hero.getBoundingClientRect();
      var cr = card.getBoundingClientRect();
      var h  = Math.max(90, (cr.top - hr.top) - 14);
      canvas.style.height = h + 'px';
    } else {
      canvas.style.height = '';
    }
  }

  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    fitBand();
    /* Measure the CANVAS, not the hero — the canvas is a band whose size is
       set above, so the bars land exactly where we want them. */
    W = canvas.clientWidth; H = canvas.clientHeight;
    if (!W || !H) return;
    canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    buildColumns();
    if (reduce) { staticState(); draw(); }
  }

  function step(dt){
    var t = performance.now()/1000;
    for (var i = 0; i < cols.length; i++){
      var col = cols[i];
      var osc = Math.sin(t*col.fA + col.phase)*0.55 + Math.sin(t*col.fB + col.phase*1.7)*0.45;
      var lvl = Math.max(0.06, Math.min(1, col.base + osc*SHIMMER));
      col.level += (lvl - col.level) * Math.min(1, dt*6);
    }
  }

  function staticState(){
    for (var i = 0; i < cols.length; i++){
      var col = cols[i];
      col.level = Math.max(0.1, Math.min(1, col.base + Math.sin(col.phase)*0.1));
    }
  }

  function roundRect(x,y,w,h,r,fill){
    if (h <= 0 || w <= 0) return;
    var rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  }

  function draw(){
    if (!W || !H) return;
    ctx.clearRect(0,0,W,H);
    var padX = Math.max(10, W*0.015);
    var areaH = Math.min(H*0.72, isMobile() ? 150 : 1e9);   /* condensed on mobile */
    var groups = FILLS.length;
    var groupGap = Math.max(8, W*0.014);
    var barGap = Math.max(2.5, W*0.0035);
    var usable = W - padX*2 - groupGap*(groups-1);
    var groupW = usable/groups;
    var barW = (groupW - barGap*(perFam-1))/perFam;
    var cellGap = Math.max(2, areaH*0.012);
    var cellH = (areaH - cellGap*(SEG-1))/SEG;

    for (var c = 0; c < cols.length; c++){
      var fill = FILLS[famOf[c]];
      var g = famOf[c], within = c % perFam;
      var x = padX + g*(groupW+groupGap) + within*(barW+barGap);
      var lit = Math.round(cols[c].level*SEG);
      for (var s = 0; s < SEG; s++){
        var y = H - (s+1)*cellH - s*cellGap;
        var color;
        if (s < lit){
          var f = lit > 1 ? s/(lit-1) : 0;
          color = mix(fill, '#ffffff', 0.24*f);
        } else {
          color = rgba(fill, 0.05);
        }
        roundRect(x, y, barW, cellH, Math.min(2, barW*0.35), color);
      }
    }
  }

  var last = performance.now(), raf = 0;
  function frame(now){
    var dt = Math.min(0.05, (now-last)/1000); last = now;
    step(dt); draw();
    raf = requestAnimationFrame(frame);
  }

  if ('IntersectionObserver' in window){
    new IntersectionObserver(function(es){
      var on = es[0].isIntersecting;
      if (on && !reduce && !raf){ last = performance.now(); raf = requestAnimationFrame(frame); }
      else if (!on && raf){ cancelAnimationFrame(raf); raf = 0; }
    }, {threshold:0}).observe(hero);
  }

  var rz;
  window.addEventListener('resize', function(){ clearTimeout(rz); rz = setTimeout(resize, 120); });

  resize();
  setTimeout(resize, 350);            /* layout settles after webfonts/images */
  window.addEventListener('load', resize);
  if (reduce){ staticState(); draw(); }
  else { raf = requestAnimationFrame(frame); }
})();

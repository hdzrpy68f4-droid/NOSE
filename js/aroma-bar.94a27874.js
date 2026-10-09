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
      earthy:{label:'Earthy',color:'#9C6B3F',text:'#68431F',description:'Damp earth, clove, musk and mossy wood.',compounds:['Myrcene'],image:'/images/families/earthy.jpg',width:620,height:496,alt:'Cloves, a mango slice, moss-covered bark and thyme on dark brown.'},
      spice:{label:'Spice',color:'#C25B2E',text:'#833817',description:'Black pepper, dry spice, wood and warm bite.',compounds:['β-Caryophyllene','α-Humulene'],image:'/images/families/spice.jpg',width:620,height:496,alt:'Cracked black peppercorns, whole cloves and split wood on burnt orange.'},
      pine:{label:'Pine',color:'#3E7A54',text:'#28583A',description:'Pine needle, rosemary, fir and resinous green notes.',compounds:['α-Pinene','β-Pinene','Fenchol','Camphene'],image:'/images/families/pine.jpg',width:620,height:413,alt:'A pine sprig, rosemary stems and a fir cone on deep forest green.'},
      floral:{label:'Floral',color:'#8A6BBE',text:'#5B4386',description:'Lavender, rose, chamomile and soft perfumed spice.',compounds:['Linalool','α-Bisabolol','α-Terpineol','Nerolidol'],image:'/images/families/floral.jpg',width:620,height:620,alt:'A lavender stem, a rose and coriander seed on muted violet.'},
      herbal:{label:'Herbal',color:'#4E8D99',text:'#2E6671',description:'Fresh herbs, apple skin, tea tree and airy green notes.',compounds:['Terpinolene','Ocimene'],image:'/images/families/herbal.jpg',width:620,height:620,alt:'Fresh basil, a green apple slice and loose green tea on teal.'}
    };
    const FAMILY_ORDER = Object.keys(FAMILIES);

    function familyShares(values){ const normalized=normalize(values); const out=Object.fromEntries(FAMILY_ORDER.map(key=>[key,0])); Object.entries(normalized).forEach(([key,value])=>{ if(TERPENES[key]) out[TERPENES[key].family]+=value; }); return out; }

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

    return Object.freeze({ FAMILIES, FAMILY_ORDER, familyShares, renderBar });
});

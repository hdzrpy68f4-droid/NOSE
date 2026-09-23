/* NOSE - the matching algorithm. ONE copy, for the app and the scripts.
 *
 * The app (js/nose.*.js, loaded after this file on /app and /) and the
 * Codespace scripts (scripts/drift.js, through scripts/lib/match.js) both run
 * exactly this code, so a score in the terminal is a score the app would
 * show. Never copy any of it elsewhere: change it here, and the app, the
 * scripts and test/match-test.js all see the change. PARSER-HANDOFF s13.
 *
 * Moved here verbatim from js/nose.81d6bb53.js (TERPENES, the spec-compliance
 * block through cosine(), and matchBand()); test/match-test.js holds the
 * scores that file produced, and fails if this one ever gives another.
 *
 *   TERPENES          the 15 keys the vector has, each with its aroma family
 *   sanitizeTerps()   core rules 5 and 6: below-LOQ is 0, cis + trans
 *                     nerolidol sum, anything not in TERPENES is dropped
 *   normalize()       core rule 1: share-of-total, so intensity is not shape
 *   averageProfiles() core rule 2: a palate is the mean of normalised profiles
 *   cosine()          core rule 3: the match score, 0..1
 *   matchBand()       core rule 4: the score bands
 *
 * Aroma and flavour only.
 *
 * Loaded as a classic script in the browser (sets window.NoseMatch) and by
 * require() in Node (module.exports). build.sh fingerprints it like every
 * bundle: js/match-math.<hash>.js.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.NoseMatch = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
    const TERPENES = {
      limonene:{name:'Limonene',family:'citrus'},
      myrcene:{name:'Myrcene',family:'earthy'},
      caryophyllene:{name:'β-Caryophyllene',family:'spice'},
      humulene:{name:'α-Humulene',family:'spice'},
      pinene_a:{name:'α-Pinene',family:'pine'},
      pinene_b:{name:'β-Pinene',family:'pine'},
      fenchol:{name:'Fenchol',family:'pine'},
      camphene:{name:'Camphene',family:'pine'},
      linalool:{name:'Linalool',family:'floral'},
      bisabolol:{name:'α-Bisabolol',family:'floral'},
      terpineol:{name:'α-Terpineol',family:'floral'},
      nerolidol:{name:'Nerolidol',family:'floral'},
      terpinolene:{name:'Terpinolene',family:'herbal'},
      /* Farnesene's signature note is green apple peel over woody and herbal
         undertones — the same territory as terpinolene, whose family copy already
         reads "fresh-cut herbs and apple skin". A borderline call: alpha-farnesene
         is the apple-like isomer, beta- is woodier and closer to earthy, and labs
         rarely report which they measured. Revisit if that changes. */
      farnesene:{name:'Farnesene',family:'herbal'},
      ocimene:{name:'Ocimene',family:'herbal'}

    };

    /* ---- SPEC COMPLIANCE (NOSE core algorithm rules 5 & 6) ----------------
       Every profile is passed through sanitizeTerps() before any maths:
         - below-LOQ values ("<0.200") resolve to 0, not the printed number
         - cis- + trans-nerolidol are summed into a single `nerolidol` value
         - non-aroma compounds (THCA, d9-THC, CBD...) are dropped from the
           vector entirely. Leaving THCA in is catastrophic: a jar compared
           against itself scores 3% instead of 100%, because a ~25% cannabinoid
           dominates the normalised vector and drowns out every terpene.
       ---------------------------------------------------------------------- */
    /* Lab reports spell the same compound many ways. Explicit alias table -
       never regex surgery on keys, which risks mangling valid names. */
    const TERP_ALIAS={
      'alpha-pinene':'pinene_a','a-pinene':'pinene_a','α-pinene':'pinene_a','pinene-a':'pinene_a','pinene':'pinene_a',
      'beta-pinene':'pinene_b','b-pinene':'pinene_b','β-pinene':'pinene_b','pinene-b':'pinene_b',
      'beta-caryophyllene':'caryophyllene','b-caryophyllene':'caryophyllene','β-caryophyllene':'caryophyllene','caryophyllene-oxide':'caryophyllene',
      'alpha-humulene':'humulene','a-humulene':'humulene','α-humulene':'humulene',
      'alpha-bisabolol':'bisabolol','a-bisabolol':'bisabolol','α-bisabolol':'bisabolol','bisabolol-a':'bisabolol',
      'alpha-terpineol':'terpineol','a-terpineol':'terpineol','α-terpineol':'terpineol',
      'beta-myrcene':'myrcene','b-myrcene':'myrcene','β-myrcene':'myrcene',
      'd-limonene':'limonene','r-limonene':'limonene','(r)-limonene':'limonene',
      'beta-ocimene':'ocimene','b-ocimene':'ocimene','β-ocimene':'ocimene',
      'linalool-oxide':'linalool','trans-b-farnesene':'farnesene','trans-beta-farnesene':'farnesene',
'alpha-farnesene':'farnesene','beta-farnesene':'farnesene','β-farnesene':'farnesene',

    };
    function coerce(value){
      if(typeof value==='number') return Number.isFinite(value)&&value>0?value:0;
      if(typeof value!=='string') return 0;
      const raw=value.trim();
      if(/^[<≤]/.test(raw)) return 0;            // below limit of quantitation
      if(/^(nd|n\/d|none detected|bql|loq)$/i.test(raw)) return 0;
      const n=parseFloat(raw.replace(/[^0-9.]/g,''));
      return Number.isFinite(n)&&n>0?n:0;
    }
    function sanitizeTerps(values){
      const out={};
      Object.entries(values||{}).forEach(([rawKey,rawValue])=>{
        let key=String(rawKey).toLowerCase().trim().replace(/\s+/g,'-');
        if(/nerolidol/.test(key)) key='nerolidol';   // rule 6: sum cis+trans variants
        else if(TERP_ALIAS[key]) key=TERP_ALIAS[key];
        if(!TERPENES[key]) return;                   // rule 6: drop THCA/cannabinoids/unknowns
        const v=coerce(rawValue);                    // rule 5: below-LOQ -> 0
        if(v>0) out[key]=(out[key]||0)+v;
      });
      return out;
    }
    function total(values){ return Object.values(sanitizeTerps(values)).reduce((sum,value)=>sum+value,0); }
    function normalize(values){ const clean=sanitizeTerps(values); const sum=Object.values(clean).reduce((a,b)=>a+b,0); const out={}; if(!sum) return out; Object.entries(clean).forEach(([key,value])=>{ out[key]=value/sum; }); return out; }
    /* Core algorithm step 2: a palate is the AVERAGE of the normalised profiles
       of every jar the user likes - not a single strain. */
    function averageProfiles(list){
      const usable=(list||[]).map(p=>normalize(p.terps)).filter(v=>Object.keys(v).length);
      if(!usable.length) return {};
      const acc={};
      usable.forEach(vec=>Object.entries(vec).forEach(([k,v])=>{ acc[k]=(acc[k]||0)+v; }));
      Object.keys(acc).forEach(k=>{ acc[k]/=usable.length; });
      return acc;
    }
    function cosine(a,b){ const keys=new Set([...Object.keys(a),...Object.keys(b)]); let dot=0,aa=0,bb=0; keys.forEach(key=>{ const x=a[key]||0,y=b[key]||0; dot+=x*y; aa+=x*x; bb+=y*y; }); return aa&&bb ? dot/(Math.sqrt(aa)*Math.sqrt(bb)) : 0; }
    function matchBand(score){ if(score>=.90) return ['Close match','Strong']; if(score>=.75) return ['Related profile','Good']; if(score>=.55) return ['Partial overlap','Moderate']; return ['Different profile','Low']; }

    return Object.freeze({ TERPENES, TERP_ALIAS, coerce, sanitizeTerps, total, normalize, averageProfiles, cosine, matchBand });
});

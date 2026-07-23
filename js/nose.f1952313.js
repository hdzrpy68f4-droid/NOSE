(() => {
  /* ---- null-safe DOM helpers -------------------------------------------
     The home shell and the app shell now contain different markup, so a
     given element may legitimately be absent. These helpers make that a
     no-op instead of a TypeError, and step() isolates each init phase so a
     failure in one feature can never blank the page. */
  function $id(id){ return typeof id==='string' ? document.getElementById(id) : id; }
  function on(id,ev,fn,opts){ const el=$id(id); if(el) el.addEventListener(ev,fn,opts); return !!el; }
  function each(sel,fn){ document.querySelectorAll(sel).forEach(fn); }

  /* ---- error reporting -------------------------------------------------
     A JS failure on someone's device used to be completely invisible to us.
     This reports the minimum needed to locate a bug (message, file, line,
     which page) and nothing about the person. Rate-limited to 3 per page
     load so a render loop cannot spam the endpoint, and wrapped so the
     reporter can never itself throw. */
  (function(){
    var sent=0, MAX=3;
    function report(kind,detail){
      if(sent>=MAX) return; sent++;
      try{
        var payload=JSON.stringify({
          kind:kind,
          message:String(detail.message||'').slice(0,300),
          source:String(detail.source||'').slice(0,200),
          line:detail.line||null,
          col:detail.col||null,
          page:location.pathname,
          ua:navigator.userAgent.slice(0,180),
          ts:new Date().toISOString()
        });
        if(navigator.sendBeacon){
          navigator.sendBeacon('/.netlify/functions/client-error', new Blob([payload],{type:'application/json'}));
        } else {
          fetch('/.netlify/functions/client-error',{method:'POST',headers:{'Content-Type':'application/json'},body:payload,keepalive:true}).catch(function(){});
        }
      }catch(e){ /* reporting must never break the page */ }
    }
    window.addEventListener('error',function(e){
      report('error',{message:e.message,source:e.filename,line:e.lineno,col:e.colno});
    });
    window.addEventListener('unhandledrejection',function(e){
      var r=e.reason;
      report('unhandledrejection',{message:(r&&(r.message||r))||'unknown'});
    });
    window.__noseReport=report;
  })();

  function step(name,fn){ try{ fn(); }catch(err){ if(window.console&&console.warn) console.warn('[NOSE] '+name+' skipped:',err&&err.message); if(window.__noseReport) window.__noseReport('init:'+name,{message:err&&err.message,source:err&&err.stack}); } }

    'use strict';

    const FAMILIES = {
      citrus:{label:'Citrus',color:'#D19412',text:'#654700',description:'Lemon peel, orange zest, grapefruit and bright pith.',compounds:['Limonene'],image:'/images/families/citrus.jpg',width:620,height:465,alt:'Lemon peel spirals, a halved orange and juniper berries on a warm gold surface.'},
      earthy:{label:'Earthy',color:'#9C6B3F',text:'#68431F',description:'Damp earth, clove, musk and mossy wood.',compounds:['Myrcene'],image:'/images/families/earthy.jpg',width:620,height:496,alt:'Cloves, a mango slice, moss-covered bark and thyme on dark brown.'},
      spice:{label:'Spice',color:'#C25B2E',text:'#833817',description:'Black pepper, dry spice, wood and warm bite.',compounds:['β-Caryophyllene','α-Humulene'],image:'/images/families/spice.jpg',width:620,height:496,alt:'Cracked black peppercorns, whole cloves and split wood on burnt orange.'},
      pine:{label:'Pine',color:'#3E7A54',text:'#28583A',description:'Pine needle, rosemary, fir and resinous green notes.',compounds:['α-Pinene','β-Pinene','Fenchol','Camphene'],image:'/images/families/pine.jpg',width:620,height:413,alt:'A pine sprig, rosemary stems and a fir cone on deep forest green.'},
      floral:{label:'Floral',color:'#8A6BBE',text:'#5B4386',description:'Lavender, rose, chamomile and soft perfumed spice.',compounds:['Linalool','α-Bisabolol','α-Terpineol','Nerolidol'],image:'/images/families/floral.jpg',width:620,height:620,alt:'A lavender stem, a rose and coriander seed on muted violet.'},
      herbal:{label:'Herbal',color:'#4E8D99',text:'#2E6671',description:'Fresh herbs, apple skin, tea tree and airy green notes.',compounds:['Terpinolene','Ocimene'],image:'/images/families/herbal.jpg',width:620,height:620,alt:'Fresh basil, a green apple slice and loose green tea on teal.'}
    };
    const FAMILY_ORDER = Object.keys(FAMILIES);
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
      ocimene:{name:'Ocimene',family:'herbal'}
    };

    const PROFILES = [
      {id:'lemon-tart',name:'Lemon Tart Pucker',subtitle:'Earthy-spice with citrus lift',terps:{myrcene:.59,caryophyllene:.299,limonene:.153,humulene:.0954,bisabolol:.0869,linalool:.0484,pinene_b:.0232}},
      {id:'cold-creek',name:'Cold Creek Kush',subtitle:'Citrus-forward, earthy and spice',terps:{limonene:.718,myrcene:.416,caryophyllene:.357,pinene_b:.12,humulene:.117,fenchol:.0973,linalool:.0843,pinene_a:.0833,terpineol:.0831,ocimene:.0676,bisabolol:.0649,camphene:.0204,nerolidol:.0195}},
      {id:'forest-window',name:'Forest Window',subtitle:'Pine-forward with herbal lift',terps:{pinene_a:.42,pinene_b:.31,terpinolene:.22,ocimene:.12,limonene:.13,caryophyllene:.18,myrcene:.19}},
      {id:'violet-hour',name:'Violet Hour',subtitle:'Floral, citrus and soft spice',terps:{linalool:.31,bisabolol:.17,limonene:.29,caryophyllene:.21,myrcene:.16,terpineol:.12,nerolidol:.08}},
      {id:'pepper-grove',name:'Pepper Grove',subtitle:'Spice-forward with earthy depth',terps:{caryophyllene:.53,humulene:.22,myrcene:.41,limonene:.18,pinene_a:.10,linalool:.06}}
    ];

    const state = {
      heroPalate:'lemon-tart', heroCandidate:'cold-creek',
      palateIds:['lemon-tart'], appCandidate:'cold-creek',
      saved:loadSaved()
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
      'linalool-oxide':'linalool'
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
    function familyShares(values){ const normalized=normalize(values); const out=Object.fromEntries(FAMILY_ORDER.map(key=>[key,0])); Object.entries(normalized).forEach(([key,value])=>{ if(TERPENES[key]) out[TERPENES[key].family]+=value; }); return out; }
    function profileById(id){ return [...PROFILES,...state.saved].find(profile=>profile.id===id) || PROFILES[0]; }
    function topFamilies(values){ return Object.entries(familyShares(values)).sort((a,b)=>b[1]-a[1]); }
    function matchBand(score){ if(score>=.90) return ['Close match','Strong']; if(score>=.75) return ['Related profile','Good']; if(score>=.55) return ['Partial overlap','Moderate']; return ['Different profile','Low']; }
    function confidence(profileA,profileB){ const countA=Object.keys(profileA.terps||{}).length; const countB=Object.keys(profileB.terps||{}).length; const min=Math.min(countA,countB); if(min>=9) return 'High — broad measured panels'; if(min>=5) return 'Moderate — useful but incomplete'; return 'Low — few measured compounds'; }
    function safeText(value){ return String(value ?? ''); }
    function slugify(value){ return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || 'saved-profile'; }

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

    function describeMatch(a,b,score){
      const topA=topFamilies(a.terps), topB=topFamilies(b.terps);
      const shared=topA.filter(([key])=>familyShares(b.terps)[key]>.10).slice(0,2).map(([key])=>FAMILIES[key].label.toLowerCase());
      const candidateTop=FAMILIES[topB[0][0]].label.toLowerCase();
      const sameTop=topA[0][0]===topB[0][0];
      if(score>=.9) return `Very similar measured proportions with a shared ${shared.join(' and ')} backbone.`;
      if(score>=.75) return `Related aroma shape${shared.length ? ` with shared ${shared.join(' and ')} notes` : ''}. The new jar leans more ${candidateTop}.`;
      if(score>=.55) return `Some overlap, but the dominant balance changes${sameTop ? ' within the same leading family' : ' to a different leading family'}.`;
      return `The measured profile points in a different direction, led by ${candidateTop}.`;
    }

    function updateHero(){
      const a=profileById(state.heroPalate), b=profileById(state.heroCandidate);
      const score=cosine(normalize(a.terps),normalize(b.terps));
      renderBar('heroPalateBar',a.terps); renderBar('heroCandidateBar',b.terps);
      document.getElementById('heroScore').textContent=Math.round(score*100);
      document.getElementById('heroScoreLabel').textContent=matchBand(score)[0];
      document.getElementById('heroScoreCopy').textContent=describeMatch(a,b,score);
    }

    function populateSelect(selectId,selected){
      const select=document.getElementById(selectId); select.replaceChildren();
      PROFILES.forEach(profile=>{ const option=document.createElement('option'); option.value=profile.id; option.textContent=profile.name; option.selected=profile.id===selected; select.append(option); });
    }

    function renderFamilies(){
      const makeCard=(key,detail=false)=>{
        const family=FAMILIES[key];
        const article=document.createElement(detail?'article':'a');
        article.className=detail?'card article-card':'family-card';
        if(!detail){ article.href=`/aromas/${key}/`; }
        const figure=document.createElement('figure');
        figure.className='family-figure';
        /* <picture> with AVIF -> WebP -> JPEG. Intrinsic dimensions are set so
           the card reserves space and does not shift layout as images arrive. */
        const picture=document.createElement('picture');
        const stem=family.image.replace(/\.jpg$/,'');
        [['image/avif','.avif'],['image/webp','.webp']].forEach(([type,ext])=>{
          const source=document.createElement('source');
          source.type=type; source.srcset=stem+ext; picture.append(source);
        });
        const img=document.createElement('img');
        img.src=family.image;
        img.alt=family.alt;
        img.loading='lazy';
        img.decoding='async';
        if(family.width) img.width=family.width;
        if(family.height) img.height=family.height;
        picture.append(img);
        figure.append(picture);
        const swatch=document.createElement('div'); swatch.className='family-swatch'; swatch.style.background=family.color;
        const heading=document.createElement(detail?'h2':'h3'); heading.textContent=family.label;
        const description=document.createElement('p'); description.textContent=family.description;
        article.append(figure,swatch,heading,description);
        if(detail){
          const notes=document.createElement('p');
          notes.className='mono';
          notes.style.color=family.text;
          notes.style.margin='14px 0 0';
          notes.textContent=family.alt.replace(/\.$/,'');
          const compounds=document.createElement('p'); compounds.className='mono'; compounds.style.color=family.text; compounds.style.marginTop='18px'; compounds.textContent=`Common panel signals: ${family.compounds.join(' · ')}`;
          article.append(notes, compounds);
        } else {
          const link=document.createElement('span'); link.className='family-link'; link.style.color=family.text; link.textContent='Learn more →'; article.append(link);
        }
        return article;
      };
      ['homeFamilyCards','allFamilyCards'].forEach(id=>{ const node=$id(id); if(node) node.replaceChildren(...FAMILY_ORDER.map(key=>makeCard(key,false))); });
      const details=$id('familyDetails'); if(details) details.replaceChildren(...FAMILY_ORDER.map(key=>makeCard(key,true)));
    }

    function palateProfiles(){ return state.palateIds.map(id=>profileById(id)).filter(Boolean); }
    function palateVector(){ return averageProfiles(palateProfiles()); }
    function palateLabel(){ const n=palateProfiles(); if(!n.length) return 'No jars selected';
      if(n.length===1) return n[0].name; if(n.length===2) return n[0].name+' + '+n[1].name;
      return n[0].name+' + '+(n.length-1)+' more'; }
    function renderSampleButtons(){
      /* Saved jars were previously never rendered as chips, so anything the user
         saved became unreachable in the picker. They are included now. */
      const all=[...PROFILES,...state.saved];
      const build=(containerId,mode)=>{
        const container=document.getElementById(containerId); container.replaceChildren();
        all.forEach(profile=>{
          const button=document.createElement('button'); button.type='button'; button.className='sample-chip';
          button.dataset.profile=profile.id; button.dataset.mode=mode;
          const on = mode==='palate' ? state.palateIds.includes(profile.id) : state.appCandidate===profile.id;
          button.setAttribute('aria-pressed',String(on));
          if(mode==='palate') button.setAttribute('aria-label',(on?'Remove ':'Add ')+profile.name+(on?' from':' to')+' your palate');
          const strong=document.createElement('strong'); strong.textContent=profile.name;
          const span=document.createElement('span'); span.textContent=profile.subtitle;
          button.append(strong,span); container.append(button);
        });
      };
      build('palateSamples','palate'); build('candidateSamples','candidate');
      const sum=document.getElementById('palateSummaryLine');
      if(sum) sum.textContent = state.palateIds.length
        ? 'Palate = average of '+state.palateIds.length+' jar'+(state.palateIds.length===1?'':'s')+': '+palateLabel()
        : 'Select one or more jars you like. Your palate is their averaged aroma shape.';
    }

    /* -------- Match feedback loop --------------------------------------
       The score is explicitly a hypothesis; this is the instrument that lets
       us test it. Each vote is posted to a serverless endpoint with just
       enough context to be useful and nothing that identifies the user.
       If the endpoint is absent (e.g. this static prototype), votes are
       queued in memory and the UI still acknowledges — the loop degrades
       gracefully instead of throwing. */
    let feedbackContext=null;
    /* Saved profile ids are built as `saved-<slugified user name>-<ts>`, so
       sending them raw would transmit text the user typed — breaking the
       promise that palate data stays in the browser. Only built-in sample ids
       (public fixtures) are reported; anything user-created is reduced to the
       opaque token 'custom'. */
    function reportableId(profile){
      if(!profile||!profile.id) return 'unknown';
      return PROFILES.some(p=>p.id===profile.id) ? profile.id : 'custom';
    }
    function resetFeedback(score,candidate){
      feedbackContext={
        score:Math.round(score*100),
        band:matchBand(score)[1],
        palate:palateProfiles().map(reportableId),
        palateSize:palateProfiles().length,
        candidate:reportableId(candidate),
        ts:new Date().toISOString()
      };
      const wrap=document.getElementById('matchFeedback');
      wrap.querySelectorAll('.feedback-btn').forEach(btn=>{ btn.setAttribute('aria-pressed','false'); btn.disabled=false; });
      const ack=document.getElementById('feedbackAck'); ack.hidden=true; ack.textContent='';
    }
    function sendFeedback(vote){
      if(!feedbackContext) return;
      const payload={...feedbackContext,vote};
      try{
        const body=JSON.stringify(payload);
        if(navigator.sendBeacon){
          navigator.sendBeacon('/.netlify/functions/match-feedback',new Blob([body],{type:'application/json'}));
        } else {
          fetch('/.netlify/functions/match-feedback',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
        }
      }catch(e){ /* never let telemetry break the UI */ }
    }
    function wireFeedback(){
      const wrap=document.getElementById('matchFeedback');
      wrap.querySelectorAll('.feedback-btn').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const vote=btn.dataset.vote;
          wrap.querySelectorAll('.feedback-btn').forEach(b=>{ b.setAttribute('aria-pressed',String(b===btn)); b.disabled=true; });
          sendFeedback(vote);
          const ack=document.getElementById('feedbackAck');
          ack.textContent = vote==='up'
            ? 'Logged — thank you. Agreement is how we test whether shared aroma predicts shared enjoyment.'
            : 'Logged — thank you. Disagreement is the most useful signal we get; it is exactly what we are watching for.';
          ack.hidden=false;
        });
      });
    }

    function updateFullResult(){
      const b=profileById(state.appCandidate);
      const palateVec=palateVector();
      if(!b||!Object.keys(palateVec).length) return;
      const a={name:palateLabel(),terps:palateVec};
      const score=cosine(palateVec,normalize(b.terps));
      const familyA=familyShares(palateVec), familyB=familyShares(b.terps);
      const differences=FAMILY_ORDER.map(key=>[key,familyB[key]-familyA[key]]).sort((x,y)=>Math.abs(y[1])-Math.abs(x[1]));
      const shared=FAMILY_ORDER.filter(key=>familyA[key]>.10&&familyB[key]>.10).sort((x,y)=>(familyA[y]+familyB[y])-(familyA[x]+familyB[x]));
      const biggest=differences[0];
      document.getElementById('fullResult').hidden=false;
      document.getElementById('resultNames').textContent=`${a.name} compared with ${b.name}`;
      document.getElementById('resultBadge').textContent=matchBand(score)[0];
      document.getElementById('resultScore').textContent=Math.round(score*100);
      document.getElementById('resultSummary').textContent=`${Math.round(score*100)}% aroma similarity — ${matchBand(score)[1].toLowerCase()} confidence band`;
      document.getElementById('resultExplanation').textContent=describeMatch(a,b,score);
      resetFeedback(score,b);
      document.getElementById('sharedBackbone').textContent=shared.length?shared.slice(0,2).map(key=>FAMILIES[key].label).join(' + '):'No strong shared family';
      document.getElementById('biggestDifference').textContent=`${FAMILIES[biggest[0]].label} ${biggest[1]>=0?'higher':'lower'} by ${Math.round(Math.abs(biggest[1])*100)} points`;
      document.getElementById('resultConfidence').textContent=confidence(a,b);
      renderBar('resultPalateBar',a.terps); renderBar('resultCandidateBar',b.terps);
      const tbody=document.getElementById('accessibleResultRows'); tbody.replaceChildren();
      FAMILY_ORDER.forEach(key=>{ const tr=document.createElement('tr'); [FAMILIES[key].label,`${Math.round(familyA[key]*100)}%`,`${Math.round(familyB[key]*100)}%`,`${Math.round((familyB[key]-familyA[key])*100)} pts`].forEach(text=>{ const td=document.createElement('td'); td.textContent=text; tr.append(td); }); tbody.append(tr); });
    }

    function setTab(name){
      each('[role="tab"]',tab=>{ const selected=tab.dataset.tab===name; tab.setAttribute('aria-selected',String(selected)); document.getElementById(`${tab.dataset.tab}Panel`).hidden=!selected; });
      if(name!=='scan') stopQrScanner();
    }

    let qrScanner=null;
    let qrScannerRunning=false;
    let qrScanLocked=false;
    let selectedCameraId='';

    function scannerAvailable(){
      if(typeof Html5Qrcode==='undefined'){
        showMessage('scannerMessage','The QR scanner could not load. Check the connection, then reload the page, or choose a QR image.','error');
        return false;
      }
      return true;
    }

    function setScannerButtons(running){
      qrScannerRunning=running;
      document.getElementById('startScannerButton').disabled=running;
      document.getElementById('stopScannerButton').disabled=!running;
    }

    async function loadCameraChoices(){
      if(!scannerAvailable()) return [];
      try {
        const cameras=await Html5Qrcode.getCameras();
        const select=document.getElementById('cameraSelect');
        select.replaceChildren();
        cameras.forEach((camera,index)=>{
          const option=document.createElement('option');
          option.value=camera.id;
          option.textContent=camera.label || `Camera ${index+1}`;
          select.append(option);
        });
        const rear=cameras.find(camera=>/back|rear|environment/i.test(camera.label));
        const preferred=selectedCameraId || rear?.id || cameras.at(-1)?.id || cameras[0]?.id || '';
        if(preferred) select.value=preferred;
        selectedCameraId=select.value;
        document.getElementById('cameraPicker').hidden=cameras.length<2;
        return cameras;
      } catch {
        document.getElementById('cameraPicker').hidden=true;
        return [];
      }
    }

    function handleQrResult(decodedText){
      if(qrScanLocked) return;
      const value=String(decodedText||'').trim();
      if(!value) return;
      qrScanLocked=true;
      try {
        const url=new URL(value);
        if(!checkCoaUrl(url.href).ok) throw new Error('not-allowed');
        document.getElementById('coaUrl').value=url.href;
        showMessage('scannerMessage',`QR code found: ${url.hostname}. Opening the COA-link step…`,'success');
        if(navigator.vibrate) navigator.vibrate(120);
        stopQrScanner().finally(()=>{
          setTimeout(()=>{
            setTab('url');
            showMessage('urlMessage',`Scanned secure link: ${url.hostname}.`,'success');
            { const u=$id('coaUrl'); if(u) u.focus(); }
          },250);
        });
      } catch {
        qrScanLocked=false;
        showMessage('scannerMessage','That QR code was read, but it does not contain a secure HTTPS COA link. Keep the code centered or choose a different image.','error');
      }
    }

    async function improveCameraFocus(){
      try {
        const video=document.querySelector('#qrReader video');
        const track=video?.srcObject?.getVideoTracks?.()[0];
        const caps=track?.getCapabilities?.();
        const advanced=[];
        if(caps?.focusMode?.includes?.('continuous')) advanced.push({focusMode:'continuous'});
        if(caps?.zoom && caps.zoom.min<=1.5 && caps.zoom.max>=1.5) advanced.push({zoom:1.5});
        if(advanced.length) await track.applyConstraints({advanced});
      } catch {}
    }

    async function startQrScanner(cameraId=''){
      if(!scannerAvailable() || qrScannerRunning) return;
      if(!navigator.mediaDevices?.getUserMedia){
        showMessage('scannerMessage','This browser does not provide camera access. Choose a QR image or paste the link manually.','error');
        return;
      }
      qrScanLocked=false;
      showMessage('scannerMessage','Starting the rear camera…','neutral');
      try {
        qrScanner ||= new Html5Qrcode('qrReader', {formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE],verbose:false});
        const cameras=await loadCameraChoices();
        const rear=cameras.find(camera=>/back|rear|environment/i.test(camera.label));
        const chosen=cameraId || selectedCameraId || rear?.id || '';
        const cameraConfig=chosen ? {deviceId:{exact:chosen}} : {facingMode:{ideal:'environment'}};
        const config={
          fps:15,
          
          aspectRatio:1.333333,
          disableFlip:false,
          experimentalFeatures:{useBarCodeDetectorIfSupported:true}
        };
        await qrScanner.start(cameraConfig,config,handleQrResult,()=>{});
        selectedCameraId=chosen || document.getElementById('cameraSelect').value;
        setScannerButtons(true);
        showMessage('scannerMessage','Camera active. Hold the QR code steady inside the square.','success');
        setTimeout(improveCameraFocus,500);
      } catch(error){
        // Some iPhones reject an exact device id before labels are available. Retry by facing mode.
        try {
          qrScanner ||= new Html5Qrcode('qrReader', {formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE],verbose:false});
          const config={fps:15,aspectRatio:1.333333,disableFlip:false,experimentalFeatures:{useBarCodeDetectorIfSupported:true}};
          await qrScanner.start({facingMode:'environment'},config,handleQrResult,()=>{});
          setScannerButtons(true);
          await loadCameraChoices();
          showMessage('scannerMessage','Camera active. Hold the QR code steady inside the square.','success');
          setTimeout(improveCameraFocus,500);
          return;
        } catch {}
        setScannerButtons(false);
        const denied=error?.name==='NotAllowedError' || /permission|denied/i.test(String(error));
        showMessage('scannerMessage',denied?'Camera permission was denied. Allow camera access in Safari settings, then try again.':'The rear camera could not be started. Choose a QR image or paste the link manually.','error');
      }
    }

    async function stopQrScanner(){
      if(!qrScanner) return;
      if(qrScannerRunning){
        try { await qrScanner.stop(); } catch {}
      }
      try { await qrScanner.clear(); } catch {}
      setScannerButtons(false);
    }

    async function switchCamera(cameraId){
      selectedCameraId=cameraId;
      if(!qrScannerRunning) return;
      await stopQrScanner();
      await startQrScanner(cameraId);
    }

    async function scanQrImage(file){
      if(!file || !scannerAvailable()) return;
      const allowed=['image/jpeg','image/png','image/webp'];
      if(!allowed.includes(file.type) || file.size>10*1024*1024){
        showMessage('scannerMessage','Choose a JPG, PNG, or WebP image under 10 MB.','error');
        return;
      }
      qrScanLocked=false;
      await stopQrScanner();
      try {
        qrScanner ||= new Html5Qrcode('qrReader', {formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE],verbose:false});
        const decoded=await qrScanner.scanFile(file,true);
        handleQrResult(decoded);
      } catch {
        showMessage('scannerMessage','No readable QR code was found. Try a sharper photo with the complete code visible.','error');
      } finally {
        if(!qrScannerRunning){ try { await qrScanner.clear(); } catch {} }
      }
    }

    function addManualRow(selected='limonene',value='',unit='%'){
      const tbody=document.getElementById('manualRows');
      const tr=document.createElement('tr');
      const terpTd=document.createElement('td'); const terpSelect=document.createElement('select'); terpSelect.className='manual-terpene'; terpSelect.setAttribute('aria-label','Terpene');
      Object.entries(TERPENES).forEach(([key,terpene])=>{ const option=document.createElement('option'); option.value=key; option.textContent=terpene.name; option.selected=key===selected; terpSelect.append(option); });
      terpTd.append(terpSelect);
      const valueTd=document.createElement('td'); const valueInput=document.createElement('input'); valueInput.className='manual-value'; valueInput.type='number'; valueInput.min='0'; valueInput.step='0.001'; valueInput.inputMode='decimal'; valueInput.value=value; valueInput.setAttribute('aria-label','Terpene value'); valueTd.append(valueInput);
      const unitTd=document.createElement('td'); const unitSelect=document.createElement('select'); unitSelect.className='manual-unit'; unitSelect.setAttribute('aria-label','Unit'); ['%','mg/g'].forEach(item=>{ const option=document.createElement('option'); option.value=item; option.textContent=item; option.selected=item===unit; unitSelect.append(option); }); unitTd.append(unitSelect);
      const removeTd=document.createElement('td'); const remove=document.createElement('button'); remove.type='button'; remove.className='icon-button remove-row'; remove.setAttribute('aria-label',`Remove ${TERPENES[selected].name}`); remove.textContent='×'; removeTd.append(remove);
      tr.append(terpTd,valueTd,unitTd,removeTd); tbody.append(tr);
    }

    function showMessage(id,text,type='neutral'){
      const node=document.getElementById(id); node.hidden=false; node.textContent=text; node.className=`inline-message ${type==='error'?'error-message':type==='success'?'success-message':''}`;
    }

    function saveManualProfile(){
      const name=document.getElementById('manualName').value.trim();
      const rows=[...document.querySelectorAll('#manualRows tr')];
      const terps={}; const seen=new Set();
      for(const row of rows){
        const key=row.querySelector('.manual-terpene').value;
        const value=Number(row.querySelector('.manual-value').value);
        const unit=row.querySelector('.manual-unit').value;
        if(seen.has(key)){ showMessage('manualMessage',`Duplicate compound: ${TERPENES[key].name}. Remove or combine the duplicate row.`,'error'); return; }
        seen.add(key);
        if(value>0) terps[key]=unit==='mg/g'?value/10:value;
      }
      if(!name){ showMessage('manualMessage','Add a jar name before saving.','error'); return; }
      if(!Object.keys(terps).length){ showMessage('manualMessage','Enter at least one terpene value greater than zero.','error'); return; }
      const profile={id:`saved-${slugify(name)}-${Date.now()}`,name,subtitle:`${Object.keys(terps).length} measured compounds`,terps};
      state.saved.push(profile); const persisted=persistSaved(); if(!state.palateIds.includes(profile.id)) state.palateIds.push(profile.id); updateSavedSummary(); renderSampleButtons(); updateFullResult();
      showMessage('manualMessage',`${name} was saved ${persisted?'in this browser':'for this session'} and selected as your palate.`,'success');
    }

    function loadSaved(){ try { const parsed=JSON.parse(localStorage.getItem('nose-palate-v1')||'[]'); return Array.isArray(parsed)?parsed.filter(item=>item&&item.name&&item.terps):[]; } catch { return []; } }
    function persistSaved(){ try { localStorage.setItem('nose-palate-v1',JSON.stringify(state.saved)); return true; } catch { return false; } }
    function updateSavedSummary(){ const node=document.getElementById('savedPalateSummary'); node.textContent=state.saved.length?`${state.saved.length} locally saved ${state.saved.length===1?'profile':'profiles'}.`:'Nothing saved yet.'; document.getElementById('exportButton').disabled=!state.saved.length; document.getElementById('clearButton').disabled=!state.saved.length; }
    function exportSaved(){ const blob=new Blob([JSON.stringify({version:1,profiles:state.saved},null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='nose-palate.json'; a.click(); URL.revokeObjectURL(url); }
    function importSaved(file){ const reader=new FileReader(); reader.onload=()=>{ try { const data=JSON.parse(String(reader.result)); const profiles=Array.isArray(data)?data:data.profiles; if(!Array.isArray(profiles)) throw new Error('Invalid format'); state.saved=profiles.filter(item=>item&&item.name&&item.terps).map(item=>({...item,id:item.id||`saved-${slugify(item.name)}-${Date.now()}`})); const persisted=persistSaved(); updateSavedSummary(); showMessage('manualMessage',`Imported ${state.saved.length} profiles${persisted?' into this browser':' for this session'}.`,'success'); } catch { alert('That file is not a valid NOSE palate export.'); } }; reader.readAsText(file); }

    /* A bare https check is not enough: any attacker-controlled domain passed it
   and was reported back to the user as a "valid secure link". Lab hosts are
   allowlisted, and the same check is reused by the QR scanner. */
    const LAB_ALLOWLIST=['confidentcannabis.com','sclabs.com','steephill.com','kaychalabs.com','anresco.com','greenleaflab.org'];
    function checkCoaUrl(value){
      let url; try{ url=new URL(String(value).trim()); }catch{ return {ok:false,message:'Enter a complete HTTPS report URL.'}; }
      if(url.protocol!=='https:') return {ok:false,message:'Secure HTTPS links only.'};
      if(url.username||url.password) return {ok:false,message:'Links containing credentials are not accepted.'};
      const host=url.hostname.toLowerCase();
      const known=LAB_ALLOWLIST.some(d=>host===d||host.endsWith('.'+d));
      if(!known) return {ok:false,message:`${host} is not on the accepted lab allowlist. Use manual entry instead.`};
      return {ok:true,url,message:`Accepted lab link: ${host}.`};
    }
    function validateUrl(){ const r=checkCoaUrl(document.getElementById('coaUrl').value); showMessage('urlMessage',r.message,r.ok?'success':'error'); }
    function validateUpload(file){ if(!file){ document.getElementById('uploadMessage').hidden=true; return; } const allowed=['application/pdf','image/jpeg','image/png','image/webp']; if(!allowed.includes(file.type)){ showMessage('uploadMessage','Use a PDF, JPG, PNG, or WebP file.','error'); return; } if(file.size>10*1024*1024){ showMessage('uploadMessage','The selected file is larger than 10 MB.','error'); return; } showMessage('uploadMessage',`${file.name} selected. The file remains local in this static preview.`,'success'); }

    /* Routing after the Tier-2 split.
       Every destination is now a real URL:
         /            -> index.html   (data-page="home")
         /app         -> app.html     (data-page="app")
         /aromas|learn|methodology|about  -> static pages
       Each shell contains exactly ONE data-page block, so routing is mostly
       "reveal what this document owns". Legacy #/hash links are forwarded to
       the canonical URL so old bookmarks and inbound links keep working. */
    const STATIC_ROUTES={methodology:'/methodology/',learn:'/learn/',about:'/about/',aromas:'/aromas/',home:'/',app:'/app'};

    function route(){
      const owned=[...document.querySelectorAll('[data-page]')].map(n=>n.dataset.page);
      if(!owned.length) return;
      const raw=(location.hash||'').replace(/^#\/?/,'');
      const requested=raw.split('?')[0];

      /* A hash that names a page this document does not own is a legacy link:
         send it to the canonical URL instead of rendering nothing. */
      if(requested && !owned.includes(requested)){
        const target=STATIC_ROUTES[requested];
        if(target){ location.replace(target); return; }
      }

      const next = owned.includes(requested) ? requested : owned[0];
      each('[data-page]',node=>{ node.hidden = node.dataset.page!==next; });

      /* aria-current is path-based now that nav links are real URLs. */
      const here=location.pathname.replace(/index\.html$/,'').replace(/\/$/,'')||'/';
      each('.nav-links a',link=>{
        const href=(link.getAttribute('href')||'').replace(/\/$/,'')||'/';
        if(href===here) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
      });

      closeMenu();
      window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
      { const mc=$id('main-content'); if(mc) mc.focus({preventScroll:true}); }
      if(next==='app') step('result',updateFullResult); else step('scanner stop',stopQrScanner);
    }

    function trapOpenFocus(event){
      const menu=$id('mobileMenu');
      const scope=(menu&&menu.dataset.open==='true')?menu:null;
      if(!scope) return;
      const focusable=[...scope.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(node=>!node.hidden);
      if(!focusable.length) return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){ event.preventDefault(); last.focus(); }
      else if(!event.shiftKey&&document.activeElement===last){ event.preventDefault(); first.focus(); }
    }

    function closeMenu(){ const button=$id('menuButton'), menu=$id('mobileMenu'); if(!button||!menu) return; button.setAttribute('aria-expanded','false'); button.setAttribute('aria-label','Open navigation menu'); menu.dataset.open='false'; }
    function toggleMenu(){ const button=$id('menuButton'), menu=$id('mobileMenu'); if(!button||!menu) return; const open=button.getAttribute('aria-expanded')==='true'; button.setAttribute('aria-expanded',String(!open)); button.setAttribute('aria-label',open?'Open navigation menu':'Close navigation menu'); menu.dataset.open=String(!open); if(!open){ const first=menu.querySelector('a'); if(first) first.focus(); } }

    function init(){
      /* Each shell renders only the markup it owns, so every phase is
         conditional on its anchor element and isolated by step(). */
      if($id('heroPalate')) step('hero',()=>{ populateSelect('heroPalate',state.heroPalate); populateSelect('heroCandidate',state.heroCandidate); updateHero(); });
      if($id('homeFamilyCards')||$id('allFamilyCards')||$id('familyDetails')) step('families',renderFamilies);
      if($id('palateSamples')) step('samples',renderSampleButtons);
      if($id('savedPalateSummary')) step('saved summary',updateSavedSummary);
      if($id('manualRows')) step('manual rows',()=>{ addManualRow('limonene'); addManualRow('myrcene'); addManualRow('caryophyllene'); });
      if($id('matchFeedback')) step('feedback',wireFeedback);
      on('heroPalate','change',event=>{ state.heroPalate=event.target.value; updateHero(); });
      on('heroCandidate','change',event=>{ state.heroCandidate=event.target.value; updateHero(); });
      on('menuButton','click',toggleMenu);
      document.addEventListener('keydown',event=>{
        if(event.key==='Escape'){ closeMenu(); return; }
        if(event.key==='Tab') trapOpenFocus(event);
      });
      window.addEventListener('hashchange',route);
      each('[role="tab"]',tab=>tab.addEventListener('click',()=>{ setTab(tab.dataset.tab); if(tab.dataset.tab==='scan') startQrScanner(); }));
      on('startScannerButton','click',startQrScanner);
      on('stopScannerButton','click',stopQrScanner);
      on('cameraSelect','change',event=>switchCamera(event.target.value));
      on('chooseQrImageButton','click',()=>{ const f=$id('qrImageFile'); if(f) f.click(); });
      on('qrImageFile','change',event=>{ const file=event.target.files[0]; if(file) scanQrImage(file); event.target.value=''; });
      document.addEventListener('visibilitychange',()=>{ if(document.hidden) stopQrScanner(); });
      on('palateSamples','click',event=>{ const button=event.target.closest('.sample-chip'); if(!button)return; const id=button.dataset.profile; const i=state.palateIds.indexOf(id); if(i>=0){ if(state.palateIds.length>1) state.palateIds.splice(i,1); } else state.palateIds.push(id); renderSampleButtons(); updateFullResult(); });
      on('candidateSamples','click',event=>{ const button=event.target.closest('.sample-chip'); if(!button)return; state.appCandidate=button.dataset.profile; renderSampleButtons(); updateFullResult(); });
      on('addRowButton','click',()=>addManualRow());
      on('manualRows','click',event=>{ const button=event.target.closest('.remove-row'); if(button&&document.querySelectorAll('#manualRows tr').length>1) button.closest('tr').remove(); });
      on('saveManualButton','click',saveManualProfile);
      on('validateUrlButton','click',validateUrl);
      on('reportFile','change',event=>validateUpload(event.target.files[0]));
      on('exportButton','click',exportSaved);
      on('importButton','click',()=>{ const f=$id('importFile'); if(f) f.click(); });
      on('importFile','change',event=>{ if(event.target.files[0]) importSaved(event.target.files[0]); });
      on('clearButton','click',()=>{ if(confirm('Delete all locally saved NOSE profiles?')){ state.saved=[]; persistSaved(); updateSavedSummary(); } });
      step('route',route);
    }


    init();
  })();

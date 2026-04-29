    const els = {
      video: document.getElementById('video'), videoFile: document.getElementById('videoFile'), jsonFile: document.getElementById('jsonFile'),
      participant: document.getElementById('participant'), story: document.getElementById('story'), typology: document.getElementById('typology'),
      outlineToggle: document.getElementById('outlineToggle'), gazeStep: document.getElementById('gazeStep'),
      startBtn: document.getElementById('btn-start'), pauseBtn: document.getElementById('btn-pause'), saveBtn: document.getElementById('btn-save'),
      miniStop: document.getElementById('btn-mini-stop'), toolsToggle: document.getElementById('btn-tools-toggle'), status: document.getElementById('status'),
      overlay: document.getElementById('overlay'), gazeDot: document.getElementById('gazeDot')
    };

    for (let i=1;i<=30;i++){ const o=document.createElement('option'); o.value=String(i).padStart(2,'0'); o.textContent='ID '+String(i).padStart(2,'0'); els.participant.appendChild(o); }

    let data=null, gaze={x:0,y:0}, tickTimer=null, intersections=[], lastWordIdx=0, lastFaceIdx=0, isRunning=false;

    const setStatus = (t)=> els.status.textContent=t;
    const yyyymmdd=(d=new Date())=>`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

    function setFocusMode(active){
      document.body.classList.toggle('running-collapsed', !!active);
      if(!active) document.body.classList.remove('header-expanded');
      els.toolsToggle.textContent = '+ STRUMENTI';
    }
    function toggleTools(){
      if(!document.body.classList.contains('running-collapsed')) return;
      const expanded=document.body.classList.toggle('header-expanded');
      els.toolsToggle.textContent = expanded ? '- STRUMENTI' : '+ STRUMENTI';
    }

    function pickNearestAtOrBefore(arr,time,fromIdx){
      if(!Array.isArray(arr)||!arr.length) return {idx:0,item:null};
      let i=Math.min(fromIdx||0,arr.length-1);
      while(i+1<arr.length && Number(arr[i+1].videoTime)<=time) i++;
      while(i>0 && Number(arr[i].videoTime)>time) i--;
      return {idx:i,item:arr[i]||null};
    }

    function vRect(){ const r=els.video.getBoundingClientRect(); return {w:r.width,h:r.height}; }
    function mapToOverlay(box){ if(!box) return null; const v=vRect(); const vw=els.video.videoWidth||v.w; const vh=els.video.videoHeight||v.h; return {x:(box.x/vw)*v.w,y:(box.y/vh)*v.h,w:(box.w/vw)*v.w,h:(box.h/vh)*v.h}; }
    const inBox=(pt,b)=>pt.x>=b.x&&pt.x<=b.x+b.w&&pt.y>=b.y&&pt.y<=b.y+b.h;

    function getCurrentWordEntries(t){ if(!data||!Array.isArray(data.textUpdateSnapshots)||!data.textUpdateSnapshots.length) return []; const got=pickNearestAtOrBefore(data.textUpdateSnapshots,t,lastWordIdx); lastWordIdx=got.idx; return (got.item&&Array.isArray(got.item.entries))?got.item.entries:[]; }
    function getCurrentFaceBoxes(t){ if(!data||!Array.isArray(data.faceTrackingSnapshots)||!data.faceTrackingSnapshots.length) return null; const got=pickNearestAtOrBefore(data.faceTrackingSnapshots,t,lastFaceIdx); lastFaceIdx=got.idx; return got.item?got.item.boxes:null; }

    function clearOutline(){ els.overlay.querySelectorAll('.box').forEach(n=>n.remove()); }
    function drawBox(cls,box){ if(!box) return; const b=mapToOverlay(box); if(!b) return; const d=document.createElement('div'); d.className='box '+cls; d.style.left=b.x+'px'; d.style.top=b.y+'px'; d.style.width=b.w+'px'; d.style.height=b.h+'px'; els.overlay.appendChild(d); }

    function drawCurrentOutline(t){
      clearOutline();
      if(!data || els.outlineToggle.value!=='on') return;
      const typ=els.typology.value, words=getCurrentWordEntries(t), meta=data.wordMetaById||{};
      words.forEach(e=>{ const m=meta[String(e.wordAutoIncrementalId)]||{}; const isImage=!!m.image; if(typ==='solo_testo'&&isImage) return; drawBox(isImage?'image':'word', e.location); });
      const face=getCurrentFaceBoxes(t); if(!face) return;
      drawBox('face',face.face); drawBox('mouth',face.mouth); drawBox('nose',face.nose); drawBox('eyeLeft',face.eyeLeft); drawBox('eyeRight',face.eyeRight);
    }

    function moveGaze(){
      const v=vRect(); if(!v.w||!v.h) return;
      const step=clamp(parseFloat(els.gazeStep.value)||20,1,200);
      if(gaze.x===0&&gaze.y===0){gaze.x=v.w*.5;gaze.y=v.h*.5;} else { gaze.x=clamp(gaze.x+((Math.random()*2-1)*step),0,v.w); gaze.y=clamp(gaze.y+((Math.random()*2-1)*step),0,v.h); }
      els.gazeDot.style.left=gaze.x+'px'; els.gazeDot.style.top=gaze.y+'px';
    }

    function categorizeIntersections(t){
      const hits=[], typ=els.typology.value, pt={x:gaze.x,y:gaze.y};
      if(data){
        const words=getCurrentWordEntries(t), meta=data.wordMetaById||{};
        for(const e of words){ const mapped=mapToOverlay(e.location); if(!mapped||!inBox(pt,mapped)) continue; const m=meta[String(e.wordAutoIncrementalId)]||{}; const isImage=!!m.image; if(typ==='solo_testo'&&isImage) continue; hits.push({category:isImage?'image':'word',subcategory:m.word||'',id:e.wordAutoIncrementalId}); }
        const face=getCurrentFaceBoxes(t); if(face){ [['face',face.face,'face'],['face',face.mouth,'mouth'],['face',face.nose,'nose'],['face',face.eyeLeft,'eyeLeft'],['face',face.eyeRight,'eyeRight']].forEach(p=>{ const mapped=mapToOverlay(p[1]); if(mapped&&inBox(pt,mapped)) hits.push({category:p[0],subcategory:p[2]}); }); }
      }
      let primaryCategory='none', primarySubcategory='none';
      if(hits.length){ const wordHit=hits.find(h=>h.category==='word'||h.category==='image'); const faceHit=hits.find(h=>h.category==='face'); const chosen=wordHit||faceHit||hits[0]; primaryCategory=chosen.category; primarySubcategory=chosen.subcategory; }
      intersections.push({t:Number(t.toFixed(3)),gaze:{x:Number(gaze.x.toFixed(2)),y:Number(gaze.y.toFixed(2))},primaryCategory,primarySubcategory,hits});
    }

    function tick(){ const t=els.video.currentTime||0; moveGaze(); drawCurrentOutline(t); categorizeIntersections(t); setStatus(`Video t=${t.toFixed(2)}s\nIntersezioni: ${intersections.length}\nOutline: ${els.outlineToggle.value.toUpperCase()}`); }
    function startTick(){ if(tickTimer) return; tickTimer=setInterval(tick,100); }
    function stopTick(){ if(!tickTimer) return; clearInterval(tickTimer); tickTimer=null; }

    function resetSession(){ intersections=[]; lastWordIdx=0; lastFaceIdx=0; const v=vRect(); gaze={x:v.w*.5,y:v.h*.5}; els.gazeDot.style.left=gaze.x+'px'; els.gazeDot.style.top=gaze.y+'px'; clearOutline(); }

    function saveIntersections(){
      if(!els.video.src){ alert('Carica prima un video.'); return; }
      const payload={date:new Date().toISOString(), participantId:els.participant.value, story:els.story.value, typology:els.typology.value, sourceJsonLoaded:!!data, intersections};
      const filename=`${yyyymmdd()}_${els.participant.value}_${els.story.value}_${els.typology.value}.json`;
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
    }

    async function startSession(){
      if(!els.video.src){ alert('Carica prima un video.'); return; }
      setFocusMode(true);
      isRunning=true;
      if(!intersections.length) resetSession();
      await els.video.play();
    }
    function stopSession(){
      isRunning=false;
      setFocusMode(false);
      els.video.pause();
      stopTick();
    }

    els.videoFile.addEventListener('change',(ev)=>{ const f=ev.target.files&&ev.target.files[0]; if(!f) return; els.video.src=URL.createObjectURL(f); resetSession(); setStatus('Video caricato. Premi AVVIA.'); });
    els.jsonFile.addEventListener('change',async(ev)=>{ const f=ev.target.files&&ev.target.files[0]; if(!f){data=null;els.outlineToggle.disabled=true;els.outlineToggle.value='off';return;} try{const txt=await f.text(); data=JSON.parse(txt); if(!Array.isArray(data.textUpdateSnapshots)) data.textUpdateSnapshots=[]; if(!Array.isArray(data.faceTrackingSnapshots)) data.faceTrackingSnapshots=[]; data.textUpdateSnapshots.sort((a,b)=>Number(a.videoTime)-Number(b.videoTime)); data.faceTrackingSnapshots.sort((a,b)=>Number(a.videoTime)-Number(b.videoTime)); els.outlineToggle.disabled=false; setStatus('JSON caricato. Outline disponibile.');}catch{data=null;els.outlineToggle.disabled=true;els.outlineToggle.value='off';alert('JSON non valido.');} });

    els.startBtn.addEventListener('click', startSession);
    els.pauseBtn.addEventListener('click', stopSession);
    els.miniStop.addEventListener('click', stopSession);
    els.toolsToggle.addEventListener('click', toggleTools);

    els.video.addEventListener('play', ()=>{ if(!intersections.length) resetSession(); startTick(); });
    els.video.addEventListener('pause', stopTick);
    els.video.addEventListener('ended', ()=>{ stopTick(); stopSession(); });

    els.saveBtn.addEventListener('click', saveIntersections);
    els.outlineToggle.addEventListener('change', ()=> drawCurrentOutline(els.video.currentTime||0));
    els.typology.addEventListener('change', ()=> drawCurrentOutline(els.video.currentTime||0));

    setStatus('Carica un video per iniziare.');
  

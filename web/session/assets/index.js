    const els = {
      video: document.getElementById('video'), videoFile: document.getElementById('videoFile'), jsonFile: document.getElementById('jsonFile'),
      participant: document.getElementById('participant'), story: document.getElementById('story'), typology: document.getElementById('typology'),
      outlineToggle: document.getElementById('outlineToggle'), gazeStep: document.getElementById('gazeStep'),
      startBtn: document.getElementById('btn-start'), pauseBtn: document.getElementById('btn-pause'), saveBtn: document.getElementById('btn-save'),
      miniStop: document.getElementById('btn-mini-stop'), toolsToggle: document.getElementById('btn-tools-toggle'), status: document.getElementById('status'),
      overlay: document.getElementById('overlay'), gazeDot: document.getElementById('gazeDot'),
      tobiiStatus: document.getElementById('tobii-status'), tobiiReconnect: document.getElementById('btn-tobii-reconnect')
    };

    for (let i=1;i<=30;i++){ const o=document.createElement('option'); o.value=String(i).padStart(2,'0'); o.textContent='ID '+String(i).padStart(2,'0'); els.participant.appendChild(o); }

    let data=null, gaze={x:0,y:0}, tickTimer=null, intersections=[], lastWordIdx=0, lastFaceIdx=0, isRunning=false;

    // Bridge protocol: WebSocket ws://127.0.0.1:8765/.
    // Server sends {"type":"gaze","ts":<ms>,"x":<0..1>,"y":<0..1>,"valid":<bool>}.
    // x,y are display-normalized (top-left origin). Without calibration we assume
    // the browser fills the same display so viewport coords == display coords.
    const TOBII_URL = 'ws://127.0.0.1:8765/';
    const TOBII_FRESH_MS = 500;
    let tobii = { ws:null, connected:false, lastSample:null, lastSampleAt:0, reconnectTimer:null };

    function setTobiiStatus(cls,text){ if(!els.tobiiStatus) return; els.tobiiStatus.className='status-pill '+cls; els.tobiiStatus.textContent=text; }
    function scheduleTobiiReconnect(){ if(tobii.reconnectTimer) return; tobii.reconnectTimer=setTimeout(()=>{ tobii.reconnectTimer=null; connectTobii(); },2000); }
    function connectTobii(){
      try{
        if(tobii.ws){ try{tobii.ws.close();}catch{} tobii.ws=null; }
        setTobiiStatus('off','connessione...');
        const ws=new WebSocket(TOBII_URL); tobii.ws=ws;
        ws.onopen=()=>{ tobii.connected=true; setTobiiStatus('on','connesso'); };
        ws.onclose=()=>{ tobii.connected=false; tobii.lastSample=null; setTobiiStatus('off','disconnesso'); scheduleTobiiReconnect(); };
        ws.onerror=()=>{ setTobiiStatus('err','errore'); };
        ws.onmessage=(ev)=>{ try{ const m=JSON.parse(ev.data); if(m && m.type==='gaze' && m.valid){ tobii.lastSample={x:m.x,y:m.y,ts:m.ts}; tobii.lastSampleAt=performance.now(); } }catch{} };
      }catch{ setTobiiStatus('err','errore'); scheduleTobiiReconnect(); }
    }
    function tobiiHasFreshSample(){ return tobii.connected && tobii.lastSample && (performance.now()-tobii.lastSampleAt) < TOBII_FRESH_MS; }
    function tobiiSend(obj){ if(tobii.ws && tobii.ws.readyState===1){ try{ tobii.ws.send(JSON.stringify(obj)); }catch{} } }

    const setStatus = (t)=> els.status.textContent=t;
    const yyyymmdd=(d=new Date())=>`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

    function setFocusMode(active){
      document.body.classList.toggle('running-collapsed', !!active);
      if(!active) document.body.classList.remove('header-expanded');
      els.toolsToggle.textContent = '+ STRUMENTI';
    }
    function setPresentationMode(on){ document.body.classList.toggle('presentation-mode', !!on); }
    function togglePresentationMode(){ setPresentationMode(!document.body.classList.contains('presentation-mode')); }
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
    function getSnapshotViewport(snap){
      if(snap && snap.viewport && snap.viewport.width && snap.viewport.height) return snap.viewport;
      if(data && data.viewport && data.viewport.width && data.viewport.height) return data.viewport;
      return null;
    }
    function mapBoxToViewport(box, captureViewport){
      if(!box) return null;
      if(!captureViewport){
        return { x:box.x, y:box.y, w:box.w, h:box.h };
      }
      // Use uniform scaling (same factor on x and y) to match object-fit:contain on the video.
      // The video is laid out top-left aligned by layoutVideoTopLeft, so no offset needed.
      const sw = window.innerWidth || 0;
      const sh = window.innerHeight || 0;
      const scale = Math.min(sw / captureViewport.width, sh / captureViewport.height);
      return { x:box.x*scale, y:box.y*scale, w:box.w*scale, h:box.h*scale };
    }
    const inBox=(pt,b)=>pt.x>=b.x&&pt.x<=b.x+b.w&&pt.y>=b.y&&pt.y<=b.y+b.h;

    function layoutVideoTopLeft(){
      const vw = window.innerWidth || 0;
      const vh = window.innerHeight || 0;
      const w = els.video.videoWidth || 0;
      const h = els.video.videoHeight || 0;
      if (!vw || !vh || !w || !h) {
        els.video.style.left = '0px';
        els.video.style.top = '0px';
        return;
      }
      const scale = Math.min(vw / w, vh / h);
      const rw = Math.floor(w * scale);
      const rh = Math.floor(h * scale);
      els.video.style.left = '0px';
      els.video.style.top = '0px';
      els.video.style.width = rw + 'px';
      els.video.style.height = rh + 'px';
    }

    function getCurrentWordSnapshot(t){ if(!data||!Array.isArray(data.textUpdateSnapshots)||!data.textUpdateSnapshots.length) return null; const got=pickNearestAtOrBefore(data.textUpdateSnapshots,t,lastWordIdx); lastWordIdx=got.idx; return got.item; }
    function getCurrentFaceSnapshot(t){ if(!data||!Array.isArray(data.faceTrackingSnapshots)||!data.faceTrackingSnapshots.length) return null; const got=pickNearestAtOrBefore(data.faceTrackingSnapshots,t,lastFaceIdx); lastFaceIdx=got.idx; return got.item; }

    function clearOutline(){ els.overlay.querySelectorAll('.box').forEach(n=>n.remove()); }
    function drawBox(cls,box,captureViewport){ if(!box) return; const b=mapBoxToViewport(box,captureViewport); if(!b) return; const d=document.createElement('div'); d.className='box '+cls; d.style.left=b.x+'px'; d.style.top=b.y+'px'; d.style.width=b.w+'px'; d.style.height=b.h+'px'; els.overlay.appendChild(d); }

    function drawCurrentOutline(t){
      clearOutline();
      if(!data || els.outlineToggle.value!=='on') return;
      const typ=els.typology.value, meta=data.wordMetaById||{};
      const wordSnap=getCurrentWordSnapshot(t);
      const wordVp=getSnapshotViewport(wordSnap);
      if(wordSnap && Array.isArray(wordSnap.entries)){
        wordSnap.entries.forEach(e=>{ const m=meta[String(e.wordAutoIncrementalId)]||{}; const isImage=!!m.image; drawBox(isImage?'image':'word', e.location, wordVp); });
      }
      const faceSnap=getCurrentFaceSnapshot(t);
      const faceVp=getSnapshotViewport(faceSnap);
      const face=faceSnap?faceSnap.boxes:null;
      if(!face) return;
      drawBox('face',face.face,faceVp); drawBox('mouth',face.mouth,faceVp); drawBox('nose',face.nose,faceVp); drawBox('eyeLeft',face.eyeLeft,faceVp); drawBox('eyeRight',face.eyeRight,faceVp);
    }

    function moveGaze(){
      const v=vRect(); if(!v.w||!v.h) return;
      if(tobiiHasFreshSample()){
        const vw=window.innerWidth||v.w, vh=window.innerHeight||v.h;
        gaze.x=clamp(tobii.lastSample.x*vw,0,vw);
        gaze.y=clamp(tobii.lastSample.y*vh,0,vh);
      } else {
        const step=clamp(parseFloat(els.gazeStep.value)||20,1,200);
        if(gaze.x===0&&gaze.y===0){gaze.x=v.w*.5;gaze.y=v.h*.5;} else { gaze.x=clamp(gaze.x+((Math.random()*2-1)*step),0,v.w); gaze.y=clamp(gaze.y+((Math.random()*2-1)*step),0,v.h); }
      }
      els.gazeDot.style.left=gaze.x+'px'; els.gazeDot.style.top=gaze.y+'px';
    }

    function categorizeIntersections(t){
      const hits=[], typ=els.typology.value, pt={x:gaze.x,y:gaze.y};
      if(data){
        const meta=data.wordMetaById||{};
        const wordSnap=getCurrentWordSnapshot(t);
        const wordVp=getSnapshotViewport(wordSnap);
        if(wordSnap && Array.isArray(wordSnap.entries)){
          for(const e of wordSnap.entries){ const mapped=mapBoxToViewport(e.location,wordVp); if(!mapped||!inBox(pt,mapped)) continue; const m=meta[String(e.wordAutoIncrementalId)]||{}; const isImage=!!m.image; if(typ==='solo_testo'&&isImage) continue; hits.push({category:isImage?'image':'word',subcategory:m.word||'',id:e.wordAutoIncrementalId}); }
        }
        const faceSnap=getCurrentFaceSnapshot(t);
        const faceVp=getSnapshotViewport(faceSnap);
        const face=faceSnap?faceSnap.boxes:null;
        if(face){ [['face',face.face,'face'],['face',face.mouth,'mouth'],['face',face.nose,'nose'],['face',face.eyeLeft,'eyeLeft'],['face',face.eyeRight,'eyeRight']].forEach(p=>{ const mapped=mapBoxToViewport(p[1],faceVp); if(mapped&&inBox(pt,mapped)) hits.push({category:p[0],subcategory:p[2]}); }); }
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
      setPresentationMode(true);
      isRunning=true;
      if(!intersections.length) resetSession();
      tobiiSend({cmd:'trigger-start'});
      await els.video.play();
    }
    function stopSession(){
      isRunning=false;
      setFocusMode(false);
      setPresentationMode(false);
      tobiiSend({cmd:'trigger-stop'});
      els.video.pause();
      stopTick();
    }

    els.videoFile.addEventListener('change',(ev)=>{ const f=ev.target.files&&ev.target.files[0]; if(!f) return; els.video.src=URL.createObjectURL(f); els.video.style.top='0px'; els.video.style.left='0px'; resetSession(); setStatus('Video caricato. Premi AVVIA.'); });
    els.jsonFile.addEventListener('change',async(ev)=>{ const f=ev.target.files&&ev.target.files[0]; if(!f){data=null;els.outlineToggle.disabled=true;els.outlineToggle.value='off';return;} try{const txt=await f.text(); data=JSON.parse(txt); if(!Array.isArray(data.textUpdateSnapshots)) data.textUpdateSnapshots=[]; if(!Array.isArray(data.faceTrackingSnapshots)) data.faceTrackingSnapshots=[]; data.textUpdateSnapshots.sort((a,b)=>Number(a.videoTime)-Number(b.videoTime)); data.faceTrackingSnapshots.sort((a,b)=>Number(a.videoTime)-Number(b.videoTime)); els.outlineToggle.disabled=false; setStatus('JSON caricato. Outline disponibile.');}catch{data=null;els.outlineToggle.disabled=true;els.outlineToggle.value='off';alert('JSON non valido.');} });

    els.startBtn.addEventListener('click', startSession);
    els.pauseBtn.addEventListener('click', stopSession);
    els.miniStop.addEventListener('click', stopSession);
    els.toolsToggle.addEventListener('click', toggleTools);

    els.video.addEventListener('play', ()=>{ if(!intersections.length) resetSession(); startTick(); });
    els.video.addEventListener('pause', stopTick);
    els.video.addEventListener('ended', ()=>{ stopTick(); stopSession(); });
    els.video.addEventListener('loadedmetadata', layoutVideoTopLeft);
    window.addEventListener('resize', layoutVideoTopLeft);

    els.saveBtn.addEventListener('click', saveIntersections);
    els.outlineToggle.addEventListener('change', ()=> drawCurrentOutline(els.video.currentTime||0));
    els.typology.addEventListener('change', ()=> drawCurrentOutline(els.video.currentTime||0));
    if(els.tobiiReconnect) els.tobiiReconnect.addEventListener('click', connectTobii);

    window.addEventListener('keydown',(ev)=>{ if(ev.key==='F2'){ ev.preventDefault(); togglePresentationMode(); } });

    setTobiiStatus('off','disconnesso');
    connectTobii();
    setStatus('Carica un video per iniziare. F2 per mostrare/nascondere il pallino. F1 e\' usato da Tobii.');
  

    const els = {
      video: document.getElementById('video'),
      participant: document.getElementById('participant'), classSel: document.getElementById('classSel'),
      story: document.getElementById('story'), typology: document.getElementById('typology'),
      outlineToggle: document.getElementById('outlineToggle'), gazeStep: document.getElementById('gazeStep'),
      startBtn: document.getElementById('btn-start'), pauseBtn: document.getElementById('btn-pause'),
      miniStop: document.getElementById('btn-mini-stop'), toolsToggle: document.getElementById('btn-tools-toggle'), status: document.getElementById('status'),
      overlay: document.getElementById('overlay'), gazeDot: document.getElementById('gazeDot'),
      tobiiStatus: document.getElementById('tobii-status'), tobiiReconnect: document.getElementById('btn-tobii-reconnect'),
      sourcesStatus: document.getElementById('sources-status')
    };

    for (let i=1;i<=30;i++){ const o=document.createElement('option'); o.value=String(i).padStart(2,'0'); o.textContent='ID '+String(i).padStart(2,'0'); els.participant.appendChild(o); }

    let data=null, gaze={x:0,y:0}, tickTimer=null, samples=[], lastWordIdx=0, lastFaceIdx=0, isRunning=false;

    // Tobii bridge protocol: WebSocket ws://127.0.0.1:8765/.
    // Server sends {"type":"gaze","ts":<ms>,"x":<0..1>,"y":<0..1>,"valid":<bool>}.
    // x,y are display-normalized (top-left origin). Without calibration we assume
    // the browser fills the same display so viewport coords == display coords.
    const TOBII_URL = 'ws://127.0.0.1:12346/';
    const TOBII_FRESH_MS = 500;
    let tobii = { ws:null, connected:false, lastSample:null, lastSampleAt:0, reconnectTimer:null };

    function setTobiiStatus(cls,text){ if(!els.tobiiStatus) return; els.tobiiStatus.className='status-pill '+cls; els.tobiiStatus.textContent=text; }
    function setSourcesStatus(cls,text){ if(!els.sourcesStatus) return; els.sourcesStatus.className='status-pill '+cls; els.sourcesStatus.textContent=text; }
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
    const pad2=(n)=>String(n).padStart(2,'0');
    const yyyymmdd=(d=new Date())=>`${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}`;
    const hhmmss=(d=new Date())=>`${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
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
      const wordSnap=getCurrentWordSnapshot(t);
      const wordVp=getSnapshotViewport(wordSnap);
      if(wordSnap && Array.isArray(wordSnap.entries)){
        const meta=data.wordMetaById||{};
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

    // The session records only raw gaze samples vs. video time. Intersection
    // analysis (which word/face was looked at) is computed offline by the
    // analysis module, so the same recording can be re-evaluated with different
    // bounding-box scaling factors.
    function recordSample(t){
      samples.push({
        t: Number(t.toFixed(3)),
        gaze: { x: Number(gaze.x.toFixed(2)), y: Number(gaze.y.toFixed(2)) }
      });
    }

    function tick(){ const t=els.video.currentTime||0; moveGaze(); drawCurrentOutline(t); recordSample(t); setStatus(`Video t=${t.toFixed(2)}s\nSample: ${samples.length}\nOutline: ${els.outlineToggle.value.toUpperCase()}`); }
    function startTick(){ if(tickTimer) return; tickTimer=setInterval(tick,100); }
    function stopTick(){ if(!tickTimer) return; clearInterval(tickTimer); tickTimer=null; }

    function resetSession(){ samples=[]; lastWordIdx=0; lastFaceIdx=0; const v=vRect(); gaze={x:v.w*.5,y:v.h*.5}; els.gazeDot.style.left=gaze.x+'px'; els.gazeDot.style.top=gaze.y+'px'; clearOutline(); }

    // Auto-load video + tracking JSON from /sources/ based on (story, typology).
    // Convention: <baseSlug> = "2_<story>_<typology>" -- where 2_ marks the
    // record/ output that feeds session/ replay. Video can be .mp4 or .webm.
    let currentLoadToken = 0;
    async function fileExists(url){
      try { const r=await fetch(url,{method:'HEAD'}); return r.ok; } catch { return false; }
    }
    async function loadSourcesForSelection(){
      const token = ++currentLoadToken;
      const cls=els.classSel.value, story=els.story.value, typ=els.typology.value;
      const base=`/sources/2_${cls}_${story}_${typ}`;
      setSourcesStatus('off','caricamento...');

      // Pick a video extension that actually exists.
      let videoUrl=null;
      for(const ext of ['mp4','webm']){
        if(await fileExists(`${base}.${ext}`)){ videoUrl=`${base}.${ext}`; break; }
      }
      if(token!==currentLoadToken) return;

      // Reset existing state.
      data=null; els.outlineToggle.disabled=true; els.outlineToggle.value='off';
      try{ els.video.pause(); }catch{}
      els.video.removeAttribute('src');
      els.video.load();
      resetSession();

      if(!videoUrl){
        setSourcesStatus('err','video mancante');
        setStatus(`Nessun video trovato per 2_${cls}_${story}_${typ}.mp4|.webm in /sources/.`);
        return;
      }
      els.video.src=videoUrl;

      // Tracking JSON (may not exist for every combination).
      const jsonUrl=`${base}.json`;
      let jsonLoaded=false;
      try{
        const r=await fetch(jsonUrl);
        if(r.ok){
          const txt=await r.text();
          const parsed=JSON.parse(txt);
          if(token!==currentLoadToken) return;
          data=parsed;
          if(!Array.isArray(data.textUpdateSnapshots)) data.textUpdateSnapshots=[];
          if(!Array.isArray(data.faceTrackingSnapshots)) data.faceTrackingSnapshots=[];
          data.textUpdateSnapshots.sort((a,b)=>Number(a.videoTime)-Number(b.videoTime));
          data.faceTrackingSnapshots.sort((a,b)=>Number(a.videoTime)-Number(b.videoTime));
          els.outlineToggle.disabled=false;
          jsonLoaded=true;
        }
      }catch{ /* leave data null */ }

      if(token!==currentLoadToken) return;
      setSourcesStatus('on', jsonLoaded ? 'pronto' : 'video ok, json mancante');
      setStatus(`Sorgenti caricate: ${videoUrl.split('/').pop()}${jsonLoaded?' + tracking JSON':' (no tracking JSON)'}\nPremi AVVIA.`);
    }

    // POST the raw gaze track to the local server -> recordings/<filename>.json.
    async function saveSession(){
      if(!samples.length) return false;
      const now=new Date();
      const filename=`${yyyymmdd(now)}_${hhmmss(now)}_${els.participant.value}_${els.classSel.value}_${els.story.value}_${els.typology.value}.json`;
      const payload={
        date:now.toISOString(),
        participantId:els.participant.value,
        class:els.classSel.value,
        story:els.story.value,
        typology:els.typology.value,
        sourceJsonLoaded:!!data,
        viewport:{width:window.innerWidth, height:window.innerHeight},
        samples
      };
      try{
        const r=await fetch(`/api/recordings/${encodeURIComponent(filename)}`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload)
        });
        if(!r.ok){ console.error('save failed',r.status); setStatus(`Salvataggio fallito (HTTP ${r.status}).`); return false; }
        const j=await r.json().catch(()=>null);
        setStatus(`Salvato: recordings/${filename}\nSample: ${samples.length}`);
        return true;
      }catch(e){
        console.error('save error',e);
        setStatus(`Errore di rete nel salvataggio: ${e.message||e}`);
        return false;
      }
    }

    async function startSession(){
      if(!els.video.src){ alert('Sorgenti non caricate. Controlla la combinazione storia/tipologia.'); return; }
      setFocusMode(true);
      setPresentationMode(true);
      isRunning=true;
      if(!samples.length) resetSession();
      tobiiSend({cmd:'trigger-start'});
      await els.video.play();
    }
    async function stopSession(){
      const wasRunning=isRunning;
      isRunning=false;
      setFocusMode(false);
      setPresentationMode(false);
      tobiiSend({cmd:'trigger-stop'});
      els.video.pause();
      stopTick();
      if(wasRunning && samples.length){
        await saveSession();
      }
    }

    els.startBtn.addEventListener('click', startSession);
    els.pauseBtn.addEventListener('click', stopSession);
    els.miniStop.addEventListener('click', stopSession);
    els.toolsToggle.addEventListener('click', toggleTools);

    els.video.addEventListener('play', ()=>{ if(!samples.length) resetSession(); startTick(); });
    els.video.addEventListener('pause', stopTick);
    els.video.addEventListener('ended', ()=>{ stopTick(); stopSession(); });
    els.video.addEventListener('loadedmetadata', layoutVideoTopLeft);
    window.addEventListener('resize', layoutVideoTopLeft);

    els.outlineToggle.addEventListener('change', ()=> drawCurrentOutline(els.video.currentTime||0));
    els.typology.addEventListener('change', ()=>{ drawCurrentOutline(els.video.currentTime||0); loadSourcesForSelection(); });
    els.story.addEventListener('change', loadSourcesForSelection);
    els.classSel.addEventListener('change', loadSourcesForSelection);
    if(els.tobiiReconnect) els.tobiiReconnect.addEventListener('click', connectTobii);

    window.addEventListener('keydown',(ev)=>{ if(ev.key==='F2'){ ev.preventDefault(); togglePresentationMode(); } });

    setTobiiStatus('off','disconnesso');
    setSourcesStatus('off','non caricate');
    connectTobii();
    loadSourcesForSelection();
    setStatus('Seleziona partecipante, storia e tipologia. F2 per mostrare/nascondere il pallino. F1 e\' usato da Tobii.');

    const els = {
      video: document.getElementById('video'),
      participant: document.getElementById('participant'), classSel: document.getElementById('classSel'),
      story: document.getElementById('story'), typology: document.getElementById('typology'),
      outlineToggle: document.getElementById('outlineToggle'),
      startBtn: document.getElementById('btn-start'), pauseBtn: document.getElementById('btn-pause'),
      miniStop: document.getElementById('btn-mini-stop'), toolsToggle: document.getElementById('btn-tools-toggle'), status: document.getElementById('status'),
      overlay: document.getElementById('overlay'), gazeDot: document.getElementById('gazeDot'), gazeToggle: document.getElementById('gazeToggle'),
      tobiiStatus: document.getElementById('tobii-status'), tobiiReconnect: document.getElementById('btn-tobii-reconnect'),
      tobiiCalibrate: document.getElementById('btn-tobii-calibrate'),
      sourcesStatus: document.getElementById('sources-status')
    };


    // Stories available per class (mirrors data/00_sources naming <class>_<story>).
    // Selecting a class rebuilds the Story dropdown with just its stories.
    const STORIES_BY_CLASS = {
      '1': ['carpet', 'fox'],
      '2': ['carpet', 'fox'],
      '3': ['cats', 'yawn'],
      '4': ['dolphin', 'panda'],
      '5': ['bear', 'eels'],
    };
    function populateStories(){
      const stories = STORIES_BY_CLASS[els.classSel.value] || [];
      const prev = els.story.value;
      els.story.innerHTML = '';
      // Leading empty placeholder: story stays empty until a class is selected
      // and a story explicitly chosen.
      const ph = document.createElement('option'); ph.value=''; ph.textContent='—'; els.story.appendChild(ph);
      for (const s of stories){ const o=document.createElement('option'); o.value=s; o.textContent=s; els.story.appendChild(o); }
      // Keep the previous story only if this class still offers it, else empty.
      els.story.value = stories.includes(prev) ? prev : '';
    }

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
    async function calibrateTobii(){
      const btn=els.tobiiCalibrate; if(btn) btn.disabled=true;
      setTobiiStatus('off','calibrazione...');
      try{
        const r=await fetch('/api/tobii/calibrate',{method:'POST'});
        const j=await r.json().catch(()=>({}));
        if(!r.ok) throw new Error(j.error||('HTTP '+r.status));
        setStatus('Calibrazione Tobii avviata: segui le istruzioni sullo schermo.');
      }catch(e){
        setTobiiStatus('err','errore');
        setStatus('Calibrazione non avviata: '+(e.message||e));
      }finally{
        if(btn) btn.disabled=false;
      }
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
    // Gaze dot is hidden by default; shown only when explicitly enabled (toggle or F2).
    function setGazeVisible(on){ document.body.classList.toggle('show-gaze', !!on); if(els.gazeToggle) els.gazeToggle.value = on ? 'on' : 'off'; }
    function toggleGazeVisible(){ setGazeVisible(!document.body.classList.contains('show-gaze')); }
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
      if(!captureViewport || !captureViewport.width){
        return { x:box.x, y:box.y, w:box.w, h:box.h };
      }
      // Anchor outlines to the video's actually-displayed *content* rectangle.
      // Two robustness points learned the hard way:
      //   1) Some browsers mis-report videoHeight for these webm (e.g. 1024 vs the
      //      real 1080), so we derive the uniform scale from WIDTH only (the recorded
      //      content spans the full capture width, and width is reported reliably).
      //   2) object-fit:contain can letterbox the content inside the <video> element;
      //      we add that letterbox offset (and the element's own position) so the
      //      outlines never drift when the element aspect != the content aspect.
      const v = els.video;
      const r = v.getBoundingClientRect();
      const vw = v.videoWidth || 0, vh = v.videoHeight || 0;
      let contentW = r.width, offX = 0, offY = 0;
      if (vw && vh) {
        const fit = Math.min(r.width / vw, r.height / vh);
        contentW = vw * fit;
        offX = (r.width - contentW) / 2;
        offY = (r.height - vh * fit) / 2;
      }
      const scale = contentW / captureViewport.width;
      return {
        x: r.left + offX + box.x*scale,
        y: r.top  + offY + box.y*scale,
        w: box.w*scale,
        h: box.h*scale,
      };
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

    // Move the gaze dot to the latest real Tobii sample. Returns true if a fresh
    // sample was available. When Tobii is offline there is no simulated gaze: the
    // dot holds its last position and the caller records nothing.
    function moveGaze(){
      const v=vRect(); if(!v.w||!v.h) return false;
      if(!tobiiHasFreshSample()) return false;
      const vw=window.innerWidth||v.w, vh=window.innerHeight||v.h;
      gaze.x=clamp(tobii.lastSample.x*vw,0,vw);
      gaze.y=clamp(tobii.lastSample.y*vh,0,vh);
      els.gazeDot.style.left=gaze.x+'px'; els.gazeDot.style.top=gaze.y+'px';
      return true;
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

    function tick(){ const t=els.video.currentTime||0; const hasGaze=moveGaze(); drawCurrentOutline(t); if(hasGaze) recordSample(t); setStatus(`Video t=${t.toFixed(2)}s\nSample: ${samples.length}\nOutline: ${els.outlineToggle.value.toUpperCase()}`); }
    function startTick(){ if(tickTimer) return; tickTimer=setInterval(tick,100); }
    function stopTick(){ if(!tickTimer) return; clearInterval(tickTimer); tickTimer=null; }

    function resetSession(){ samples=[]; lastWordIdx=0; lastFaceIdx=0; const v=vRect(); gaze={x:v.w*.5,y:v.h*.5}; els.gazeDot.style.left=gaze.x+'px'; els.gazeDot.style.top=gaze.y+'px'; clearOutline(); }

    // Auto-load video + tracking JSON from /data/01_record/ based on (story, typology).
    // Convention: <baseSlug> = "<class>_<story>_<typology>" -- the record/ output
    // that feeds session/ replay. Video can be .mp4 or .webm.
    let currentLoadToken = 0;
    async function fileExists(url){
      try { const r=await fetch(url,{method:'HEAD'}); return r.ok; } catch { return false; }
    }
    async function loadSourcesForSelection(){
      const token = ++currentLoadToken;
      const cls=els.classSel.value, story=els.story.value, typ=els.typology.value;
      // Nothing to load until class, story and typology are all chosen: unload
      // any current video and stand by.
      if(!cls || !story || !typ){
        data=null; els.outlineToggle.disabled=true; els.outlineToggle.value='off';
        try{ els.video.pause(); }catch{}
        els.video.removeAttribute('src'); els.video.load();
        resetSession();
        setSourcesStatus('off','non caricate');
        setStatus('Seleziona classe, storia e tipologia.');
        return;
      }
      const base=`/data/01_record/${cls}_${story}_${typ}`;
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
        setStatus(`Nessun video trovato per ${cls}_${story}_${typ}.mp4|.webm in /data/01_record/.`);
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

    // POST the raw gaze track to the local server -> data/02_gaze/<filename>.json.
    async function saveSession(){
      if(!samples.length) return false;
      const now=new Date();
      // The server only accepts filenames matching [A-Za-z0-9_-.]; the participant
      // is a free-text field, so strip anything else to avoid a 400 rejection.
      const safe = s => String(s==null?'':s).replace(/[^A-Za-z0-9\-.]/g, '');
      const pid = safe(els.participant.value) || 'NA';
      const filename=`${yyyymmdd(now)}_${hhmmss(now)}_${pid}_${els.classSel.value}_${els.story.value}_${els.typology.value}.json`;
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
        const r=await fetch(`/api/gaze/${encodeURIComponent(filename)}`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload)
        });
        if(!r.ok){ console.error('save failed',r.status); setStatus(`Salvataggio fallito (HTTP ${r.status}).`); return false; }
        const j=await r.json().catch(()=>null);
        setStatus(`Salvato: gaze/${filename}\nSample: ${samples.length}`);
        return true;
      }catch(e){
        console.error('save error',e);
        setStatus(`Errore di rete nel salvataggio: ${e.message||e}`);
        return false;
      }
    }

    async function startSession(){
      els.participant.value = els.participant.value.trim();
      if(!els.participant.value){ alert('Inserisci l\'ID partecipante prima di avviare.'); els.participant.focus(); return; }
      if(!els.classSel.value){ alert('Seleziona la classe prima di avviare.'); els.classSel.focus(); return; }
      if(!els.story.value){ alert('Seleziona la storia prima di avviare.'); els.story.focus(); return; }
      if(!els.typology.value){ alert('Seleziona la tipologia prima di avviare.'); els.typology.focus(); return; }
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

      // Determine the outcome BEFORE clearing anything.
      const hadSamples = samples.length > 0;
      let saved = false;
      if(wasRunning && hadSamples){
        saved = await saveSession();
      }

      // Clear the whole selection on every stop / end of session: participant,
      // class, story and typology all reset to empty. The next run must re-enter
      // them, and start stays blocked until they are set again.
      els.participant.value = '';
      els.classSel.value = '';
      els.typology.value = '';
      populateStories();          // class empty -> story dropdown back to empty
      loadSourcesForSelection();  // unload the video, stand by (this overwrites the status)

      // Make the outcome explicit AFTER the reset status, so a save is never
      // silently swallowed and an empty (Tobii-offline) session is loudly flagged.
      if(wasRunning && !hadSamples){
        setStatus('Sessione terminata: NESSUN campione di gaze registrato (Tobii offline?). Niente salvato.\nSeleziona i campi per ripartire.');
        alert('Nessun campione di gaze registrato: il bridge Tobii era connesso (pill verde)?\nLa sessione NON e\' stata salvata.');
      } else if(saved){
        setStatus('Salvataggio completato in data/02_gaze/.\nSeleziona partecipante, classe, storia e tipologia per una nuova sessione.');
      } else if(wasRunning){
        setStatus('Salvataggio FALLITO (vedi console/Sample). Riprova.\nSeleziona i campi per ripartire.');
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
    els.classSel.addEventListener('change', ()=>{ populateStories(); loadSourcesForSelection(); });
    if(els.tobiiReconnect) els.tobiiReconnect.addEventListener('click', connectTobii);
    if(els.tobiiCalibrate) els.tobiiCalibrate.addEventListener('click', calibrateTobii);

    els.gazeToggle.addEventListener('change', ()=> setGazeVisible(els.gazeToggle.value==='on'));
    window.addEventListener('keydown',(ev)=>{ if(ev.key==='F2'){ ev.preventDefault(); toggleGazeVisible(); } });

    setTobiiStatus('off','disconnesso');
    setSourcesStatus('off','non caricate');
    connectTobii();
    populateStories();
    loadSourcesForSelection();
    setStatus('Seleziona partecipante, classe, storia e tipologia. F2 per mostrare/nascondere il pallino. F1 e\' usato da Tobii.');

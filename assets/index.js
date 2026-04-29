let recognition = null, isOn = false, isListening = false, finalText = '', interimText = '';
let words = [], pendingImg = null, logLines = [], fontSize = 64, currentPanel = null;
let mode = localStorage.getItem('caption_mode') || 'images';
let videoAudioTrack = null, videoUrl = null;
let wordAutoIncrementalId = 0;
let textUpdateId = 0;
let sessionStartedAtMs = null;
let lastRenderedTokenRefs = [];
let outlineMode = false;
// Word-level tracking stores: per-time bboxes + stable metadata map.
const wordLocationsByIdAndTime = {};
const wordMetaById = {};
const textUpdateSnapshots = [];
// Face tracking snapshots sampled every 100ms from MediaPipe.
const faceTrackingSnapshots = [];
let faceMeshModel = null;
let faceModelReady = false;
let faceTrackingTimer = null;
let faceProcessing = false;
let lastFaceBoxes = null;
let screenRecEnabled = false;
let screenStream = null;
let screenRecorder = null;
let screenChunks = [];
const SPEECH_FIXES = {
  "fuochi": "foche",
  "fuoco": "foche",
  "carboni": "carponi",
  "carbone": "carponi"
};

const FACE_PARTS = {
  mouth: [61, 291, 0, 17, 13, 14, 78, 308, 82, 312],
  nose: [1, 2, 4, 98, 327, 168, 197, 195],
  eyeLeft: [33, 133, 159, 145, 160, 144, 158, 153, 157, 154, 173],
  eyeRight: [362, 263, 386, 374, 387, 373, 385, 380, 384, 381, 398]
};

function getVideoEl() {
  return document.getElementById('story-video');
}

function hasActiveVideo() {
  const v = getVideoEl();
  return !!(v && v.src);
}

function refreshVideoButtons() {
  const addBtn = document.getElementById('btn-video-add');
  const removeBtn = document.getElementById('btn-video-remove');
  if (!addBtn || !removeBtn) return;
  const hasVideo = hasActiveVideo();
  addBtn.style.display = hasVideo ? 'none' : '';
  removeBtn.style.display = hasVideo ? '' : 'none';
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function createBBoxFromLandmarks(landmarks, indices, rect) {
  const pts = indices ? indices.map(i => landmarks[i]).filter(Boolean) : landmarks;
  if (!pts || !pts.length) return null;
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of pts) {
    const x = clamp01(p.x);
    const y = clamp01(p.y);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const x = rect.left + minX * rect.width;
  const y = rect.top + minY * rect.height;
  const w = Math.max(0, (maxX - minX) * rect.width);
  const h = Math.max(0, (maxY - minY) * rect.height);
  return { x, y, w, h };
}

function getVideoContentRect(video) {
  const r = video.getBoundingClientRect();
  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  if (!vw || !vh || !r.width || !r.height) return r;
  const contentAspect = vw / vh;
  const boxAspect = r.width / r.height;
  let width = r.width;
  let height = r.height;
  let left = r.left;
  let top = r.top;
  if (boxAspect > contentAspect) {
    height = r.height;
    width = height * contentAspect;
    left = r.left + (r.width - width) / 2;
  } else {
    width = r.width;
    height = width / contentAspect;
    top = r.top + (r.height - height) / 2;
  }
  return { left, top, width, height };
}

async function initFaceModelIfNeeded() {
  // Lazy init to avoid loading MediaPipe until video analysis is needed.
  if (faceModelReady || typeof FaceMesh === 'undefined') return;
  faceMeshModel = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });
  faceMeshModel.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  faceMeshModel.onResults((results) => {
    const video = getVideoEl();
    if (!video) return;
    const rect = getVideoContentRect(video);
    const lm = results && results.multiFaceLandmarks && results.multiFaceLandmarks[0];
    if (!lm || !lm.length) {
      lastFaceBoxes = null;
      return;
    }
    const face = createBBoxFromLandmarks(lm, null, rect);
    const mouth = createBBoxFromLandmarks(lm, FACE_PARTS.mouth, rect);
    const nose = createBBoxFromLandmarks(lm, FACE_PARTS.nose, rect);
    const eyeLeft = createBBoxFromLandmarks(lm, FACE_PARTS.eyeLeft, rect);
    const eyeRight = createBBoxFromLandmarks(lm, FACE_PARTS.eyeRight, rect);
    lastFaceBoxes = { face, mouth, nose, eyeLeft, eyeRight };
  });
  faceModelReady = true;
}

async function runFaceTrackingStep() {
  // Single-step face analysis; called by a 100ms timer while session is running.
  if (!isOn || !hasActiveVideo() || !faceModelReady || !faceMeshModel || faceProcessing) return;
  const video = getVideoEl();
  if (!video || video.paused || video.ended || video.readyState < 2) return;
  faceProcessing = true;
  try {
    await faceMeshModel.send({ image: video });
    const videoTime = getVideoTime();
    const boxes = lastFaceBoxes ? JSON.parse(JSON.stringify(lastFaceBoxes)) : null;
    faceTrackingSnapshots.push({ videoTime, boxes });
    window.faceTrackingSnapshots = faceTrackingSnapshots;
    renderWordOutlines();
  } catch { }
  faceProcessing = false;
}

async function startFaceTrackingLoop() {
  await initFaceModelIfNeeded();
  stopFaceTrackingLoop();
  faceTrackingTimer = setInterval(() => { runFaceTrackingStep(); }, 100);
}

function stopFaceTrackingLoop() {
  if (faceTrackingTimer) {
    clearInterval(faceTrackingTimer);
    faceTrackingTimer = null;
  }
}

function normalizeWord(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’]/g, "'").trim();
}

function fixRecognizedText(txt) {
  return String(txt || '').replace(/\b(fuochi|fuoco|carboni|carbone)\b/gi, m => {
    const fixed = SPEECH_FIXES[m.toLowerCase()] || m;
    return m[0] === m[0].toUpperCase() ? fixed[0].toUpperCase() + fixed.slice(1) : fixed;
  });
}

async function loadBuiltinWords() {
  try {
    const res = await fetch('assets/word-images.json', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.filter(x => x && x.word && x.src) : [];
  } catch { return []; }
}

function loadUserWords() {
  try { return JSON.parse(localStorage.getItem('sottotitoli_user_words') || '[]'); } catch { return []; }
}

function saveUserWords() {
  const builtins = new Set((window.BUILTIN_WORDS || []).map(w => normalizeWord(w.word)));
  const user = words.filter(w => !builtins.has(normalizeWord(w.word)));
  localStorage.setItem('sottotitoli_user_words', JSON.stringify(user));
}

function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { document.getElementById('nosupport').style.display = 'block'; return; }
  recognition = new SR(); recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'it-IT';
  recognition.onstart = () => { isListening = true; setStatus('In ascolto (' + getActiveAudioSource() + ')...', true); };
  recognition.onend = () => { isListening = false; if (isOn) setTimeout(safeStart, 300); else setStatus('Fermo', false); };
  recognition.onerror = (e) => {
    isListening = false;
    if (e.error === 'no-speech') { setStatus('Nessuna voce rilevata, riprovo...', true); return; }
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { isOn = false; updateMicBtn(); setStatus('Microfono non consentito', false); return; }
    setStatus('Errore: ' + e.error, false); if (isOn) setTimeout(safeStart, 700);
  };
  recognition.onresult = (e) => {
    let fin = '', intr = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) fin += e.results[i][0].transcript; else intr += e.results[i][0].transcript;
    }
    fin = fixRecognizedText(fin); intr = fixRecognizedText(intr);
    if (fin) { finalText += fin + ' '; logLines.push({ t: new Date(), txt: fin.trim() }); refreshLog(); }
    interimText = intr; render();
  };
}

function getActiveAudioSource() {
  return videoAudioTrack ? 'video' : 'microfono';
}

function refreshAudioSourceBadge() {
  const el = document.getElementById('audio-source');
  if (!el) return;
  el.textContent = 'Sorgente: ' + getActiveAudioSource();
}

function refreshWordsSavedCounter() {
  const el = document.getElementById('words-saved');
  if (!el) return;
  el.textContent = 'Parole salvate: ' + Object.keys(wordMetaById).length;
}

function refreshScreenRecButton() {
  const b = document.getElementById('btn-screen-rec');
  if (!b) return;
  b.textContent = screenRecEnabled ? '⏺ REC SCHERMO ON' : '⏺ REC SCHERMO OFF';
}

function toggleScreenRecMode() {
  screenRecEnabled = !screenRecEnabled;
  refreshScreenRecButton();
}

async function startScreenRecordingIfEnabled() {
  if (!screenRecEnabled) return true;
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'include'
    });
    screenChunks = [];
    // Prefer VP8 first: on some Chrome/GPU combinations VP9 recordings can appear green.
    const mimeCandidates = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm'
    ];
    const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) || '';
    screenRecorder = mimeType
      ? new MediaRecorder(screenStream, { mimeType, videoBitsPerSecond: 6_000_000 })
      : new MediaRecorder(screenStream);
    screenRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) screenChunks.push(e.data);
    };
    screenRecorder.onstop = () => {
      const blob = new Blob(screenChunks, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'screen-recording-' + new Date().toISOString().replace(/[:.]/g, '-') + '.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      screenChunks = [];
    };
    const vTrack = screenStream.getVideoTracks()[0];
    if (vTrack) {
      vTrack.onended = () => {
        if (!isOn) return;
        isOn = false;
        stopSessionAndExport();
      };
    }
    screenRecorder.start();
    return true;
  } catch {
    setStatus('Registrazione schermo annullata o non consentita', false);
    return false;
  }
}

function stopScreenRecording() {
  if (screenRecorder && screenRecorder.state !== 'inactive') {
    try { screenRecorder.stop(); } catch { }
  }
  if (screenStream) {
    screenStream.getTracks().forEach(t => {
      try { t.stop(); } catch { }
    });
  }
  screenRecorder = null;
  screenStream = null;
}

function refreshOutlineButton() {
  const b = document.getElementById('btn-outline');
  if (!b) return;
  b.textContent = outlineMode ? '▣ Outline ON' : '▢ Outline OFF';
}

function setFocusMode(active) {
  document.body.classList.toggle('running-collapsed', !!active);
  if (!active) document.body.classList.remove('header-expanded');
  const t = document.getElementById('btn-header-toggle');
  if (t) t.textContent = '+ STRUMENTI';
  syncFloatingButtonSizes();
}

function toggleHeaderPanel() {
  if (!document.body.classList.contains('running-collapsed')) return;
  const expanded = document.body.classList.toggle('header-expanded');
  const t = document.getElementById('btn-header-toggle');
  if (t) t.textContent = expanded ? '- STRUMENTI' : '+ STRUMENTI';
  syncFloatingButtonSizes();
}

function miniStop() {
  if (isOn) toggleMic();
}

function syncFloatingButtonSizes() {
  const btnAvvia = document.getElementById('btn-mic');
  const btnCancella = document.getElementById('btn-clear');
  const btnFerma = document.getElementById('btn-mini-stop');
  const btnStrumenti = document.getElementById('btn-header-toggle');
  if (!btnAvvia || !btnCancella || !btnFerma || !btnStrumenti) return;
  btnFerma.style.width = '';
  btnStrumenti.style.width = '';
  btnFerma.style.minWidth = btnAvvia.offsetWidth + 'px';
  btnStrumenti.style.minWidth = btnCancella.offsetWidth + 'px';
}

function toggleOutlineMode() {
  outlineMode = !outlineMode;
  refreshOutlineButton();
  renderWordOutlines();
}

function renderWordOutlines() {
  const wordLayer = document.getElementById('word-outline-layer');
  const faceLayer = document.getElementById('face-outline-layer');
  if (!wordLayer || !faceLayer) return;
  wordLayer.innerHTML = '';
  faceLayer.innerHTML = '';
  if (!outlineMode) return;
  const snap = textUpdateSnapshots[textUpdateSnapshots.length - 1];
  if (!snap || !Array.isArray(snap.entries)) return;
  snap.entries.forEach((e) => {
    const loc = e.location || {};
    if (![loc.x, loc.y, loc.w, loc.h].every(v => typeof v === 'number')) return;
    const r = document.createElement('div');
    r.className = 'word-outline';
    r.style.left = loc.x + 'px';
    r.style.top = loc.y + 'px';
    r.style.width = loc.w + 'px';
    r.style.height = loc.h + 'px';
    wordLayer.appendChild(r);
  });
  const faceSnap = faceTrackingSnapshots.length ? faceTrackingSnapshots[faceTrackingSnapshots.length - 1] : null;
  const boxes = faceSnap && faceSnap.boxes;
  if (!boxes) return;
  const faceEntries = [
    ['face', boxes.face],
    ['mouth', boxes.mouth],
    ['nose', boxes.nose],
    ['eye-left', boxes.eyeLeft],
    ['eye-right', boxes.eyeRight]
  ];
  faceEntries.forEach(([cls, b]) => {
    if (!b || ![b.x, b.y, b.w, b.h].every(v => typeof v === 'number')) return;
    const el = document.createElement('div');
    el.className = 'face-outline ' + cls;
    el.style.left = b.x + 'px';
    el.style.top = b.y + 'px';
    el.style.width = b.w + 'px';
    el.style.height = b.h + 'px';
    faceLayer.appendChild(el);
  });
}

function clearTrackingData() {
  // Full reset of current-session tracking buffers.
  wordAutoIncrementalId = 0;
  textUpdateId = 0;
  lastRenderedTokenRefs = [];
  for (const k of Object.keys(wordLocationsByIdAndTime)) delete wordLocationsByIdAndTime[k];
  for (const k of Object.keys(wordMetaById)) delete wordMetaById[k];
  textUpdateSnapshots.length = 0;
  faceTrackingSnapshots.length = 0;
  lastFaceBoxes = null;
  window.wordLocationsByIdAndTime = wordLocationsByIdAndTime;
  window.wordMetaById = wordMetaById;
  window.textUpdateSnapshots = textUpdateSnapshots;
  window.faceTrackingSnapshots = faceTrackingSnapshots;
  refreshWordsSavedCounter();
  renderWordOutlines();
}

function exportTrackingDataJson() {
  // Manual export triggered from toolbar button.
  const payload = {
    exportedAt: new Date().toISOString(),
    source: getActiveAudioSource(),
    wordsSaved: Object.keys(wordMetaById).length,
    wordMetaById,
    wordLocationsByIdAndTime,
    textUpdateSnapshots,
    faceTrackingSnapshots
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tracking-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function stopSessionAndExport() {
  setFocusMode(false);
  stopScreenRecording();
  stopFaceTrackingLoop();
  if (hasActiveVideo()) {
    const video = getVideoEl();
    if (video) {
      try { video.pause(); } catch { }
    }
  }
  try { recognition.stop(); } catch { }
  isListening = false;
  updateMicBtn();
  setStatus('Fermo', false);
}

function allocateStableWordId(tokenRef, index) {
  // Reuse ID when same token (normalized + image flag) stays in same logical position.
  const prev = lastRenderedTokenRefs[index];
  if (prev && prev.norm === tokenRef.norm && prev.image === tokenRef.image) return prev.id;
  return ++wordAutoIncrementalId;
}

function safeStart() {
  if (!recognition || !isOn || isListening) return;
  const startRecognition = () => {
    if (videoAudioTrack) {
      try {
        // Prefer video audio when available.
        recognition.start(videoAudioTrack);
      } catch {
        // Graceful fallback when start(audioTrack) is unsupported.
        recognition.start();
        setStatus('In ascolto (microfono). Audio video non supportato dal browser.', true);
        videoAudioTrack = null;
        refreshAudioSourceBadge();
      }
    } else {
      recognition.start();
    }
  };
  try {
    startRecognition();
    setStatus('In ascolto (' + getActiveAudioSource() + ')...', true);
  } catch {
    setTimeout(() => {
      try {
        if (isOn && !isListening) {
          startRecognition();
          setStatus('In ascolto (' + getActiveAudioSource() + ')...', true);
        }
      } catch { }
    }, 500);
  }
}
async function toggleMic() {
  if (!recognition) return;
  isOn = !isOn;
  const video = getVideoEl();

  if (isOn) {
    setFocusMode(true);
    const recOk = await startScreenRecordingIfEnabled();
    if (!recOk) {
      isOn = false;
      setFocusMode(false);
      updateMicBtn();
      return;
    }
    sessionStartedAtMs = performance.now();
    clearTrackingData();
    if (hasActiveVideo() && video) {
      try { await video.play(); } catch { }
      startFaceTrackingLoop();
    }
    safeStart();
  } else {
    setFocusMode(false);
    stopFaceTrackingLoop();
    stopSessionAndExport();
  }
  updateMicBtn();
}
function updateMicBtn() { const b = document.getElementById('btn-mic'); b.className = isOn ? 'danger' : 'primary'; b.innerHTML = isOn ? '<span class="dot pulse"></span> FERMA' : '<span class="dot"></span> AVVIA'; }
function setStatus(msg, on) { document.getElementById('stxt').textContent = msg; const d = document.getElementById('sdot'); d.className = 'dot' + (on ? ' pulse' : ''); d.style.color = on ? 'var(--accent2)' : 'var(--muted)'; }
function clearCaption() {
  finalText = '';
  interimText = '';
  logLines = [];
  clearTrackingData();
  refreshLog();
  render();
}
function changeSize(d) { fontSize = Math.max(24, Math.min(128, fontSize + d)); document.documentElement.style.setProperty('--caption-size', fontSize + 'px'); document.getElementById('szlbl').textContent = fontSize + 'px'; }
function setTheme(v) { document.body.setAttribute('data-theme', v); }
function setMode(v) { mode = v; localStorage.setItem('caption_mode', mode); render(); }

function matchWordToken(token) {
  let original = String(token || '').trim();
  let suffix = '';
  const m = original.match(/([.,!?;:]+)$/);
  if (m) { suffix = m[1]; original = original.slice(0, -suffix.length); }
  const normalized = normalizeWord(original);
  const parts = normalized.split("'");
  const attempts = [normalized];
  if (parts.length > 1) attempts.push(parts[parts.length - 1]);
  const prefixes = ['l', 'nell', 'dell', 'all', 'sull', 'coll', 'dall'];
  for (const p of prefixes) if (normalized.startsWith(p) && normalized.length > p.length + 1) attempts.push(normalized.slice(p.length));
  const seen = new Set();
  for (const a of attempts) {
    if (!a || seen.has(a)) continue; seen.add(a);
    const found = words.find(w => normalizeWord(w.word) === a);
    if (found) return { found, suffix };
  }
  return null;
}

function addRenderedToken(line, token, isInterim, forcedId) {
  const match = mode === 'images' ? matchWordToken(token) : null;
  const wordId = forcedId || ++wordAutoIncrementalId;
  const cleanWord = String(token || '').replace(/[.,!?;:]+$/, '');
  if (match) {
    const wrap = document.createElement('span'); wrap.className = 'word-img';
    wrap.dataset.wordId = String(wordId);
    wrap.innerHTML = '<img src="' + esc(match.found.src) + '" alt=""/><span class="wlbl">' + esc(match.found.word) + '</span>';
    line.appendChild(wrap);
    wordMetaById[wordId] = { word: cleanWord || match.found.word, image: true, interim: !!isInterim };
    if (match.suffix) { const sx = document.createElement('span'); sx.textContent = match.suffix + ' '; line.appendChild(sx); }
  } else {
    const node = document.createElement('span');
    node.dataset.wordId = String(wordId);
    if (isInterim) node.className = 'interim';
    node.textContent = token + ' ';
    line.appendChild(node);
    wordMetaById[wordId] = { word: cleanWord || String(token || ''), image: false, interim: !!isInterim };
  }
}

function render() {
  const el = document.getElementById('caption'); const ph = document.getElementById('placeholder');
  const hasContent = (finalText.trim() || interimText.trim()); ph.style.display = hasContent ? 'none' : 'block'; el.innerHTML = '';
  if (!hasContent) return;
  const line = document.createElement('div'); line.className = 'line';
  const tokens = [];
  finalText.trim().split(/\s+/).filter(Boolean).forEach(w => tokens.push({ token: w, isInterim: false }));
  interimText.trim().split(/\s+/).filter(Boolean).forEach(w => tokens.push({ token: w, isInterim: true }));

  const currentRefs = [];
  tokens.forEach((item, idx) => {
    const match = mode === 'images' ? matchWordToken(item.token) : null;
    const cleanWord = String(item.token || '').replace(/[.,!?;:]+$/, '');
    const norm = normalizeWord(cleanWord);
    const image = !!match;
    const id = allocateStableWordId({ norm, image }, idx);
    currentRefs.push({ id, norm, image });
    addRenderedToken(line, item.token, item.isInterim, id);
  });

  lastRenderedTokenRefs = currentRefs;
  el.appendChild(line); document.getElementById('stage').scrollTop = 999999;
  trackRenderedWordLocations();
}

function getVideoTime() {
  const v = getVideoEl();
  if (v && Number.isFinite(v.currentTime)) return v.currentTime;
  if (sessionStartedAtMs == null) return 0;
  return Math.max(0, (performance.now() - sessionStartedAtMs) / 1000);
}

function trackRenderedWordLocations() {
  // Save DOM bbox for each rendered token at current session/video timestamp.
  const videoTime = getVideoTime();
  const videoTimeKey = videoTime.toFixed(3);
  const updateId = ++textUpdateId;
  const entries = [];
  const trackedNodes = document.querySelectorAll('#caption [data-word-id]');
  trackedNodes.forEach((node) => {
    const id = Number(node.getAttribute('data-word-id'));
    if (!id) return;
    const r = node.getBoundingClientRect();
    const meta = wordMetaById[id] || {};
    const loc = { x: r.left, y: r.top, w: r.width, h: r.height, interim: !!meta.interim };
    if (!wordLocationsByIdAndTime[id]) wordLocationsByIdAndTime[id] = {};
    wordLocationsByIdAndTime[id][videoTimeKey] = loc;
    entries.push({ wordAutoIncrementalId: id, videoTime, location: loc });
  });
  textUpdateSnapshots.push({ updateId, videoTime, entries });
  window.wordLocationsByIdAndTime = wordLocationsByIdAndTime;
  window.wordMetaById = wordMetaById;
  window.textUpdateSnapshots = textUpdateSnapshots;
  refreshWordsSavedCounter();
  renderWordOutlines();
}

function toggleFS() { if (!document.fullscreenElement) document.getElementById('stage').requestFullscreen(); else document.exitFullscreen(); }
function togglePanel(name) { if (currentPanel === name) { closePanel(); return; } currentPanel = name; document.getElementById('panel').classList.add('open'); document.getElementById('panel-title').textContent = name === 'images' ? 'Immagini' : 'Log'; if (name === 'images') renderImagesPanel(); else renderLogPanel(); }
function closePanel() { currentPanel = null; document.getElementById('panel').classList.remove('open'); }

function pickVideo() {
  const input = document.getElementById('video-file');
  if (input) input.click();
}

async function bindVideoTrack(video) {
  videoAudioTrack = null;
  try {
    if (video.captureStream) {
      const stream = video.captureStream();
      const tracks = stream.getAudioTracks();
      if (tracks && tracks[0]) videoAudioTrack = tracks[0];
    } else if (video.mozCaptureStream) {
      const stream = video.mozCaptureStream();
      const tracks = stream.getAudioTracks();
      if (tracks && tracks[0]) videoAudioTrack = tracks[0];
    }
  } catch { }
  refreshAudioSourceBadge();
}

async function onVideoSelected(event) {
  const file = (event.target.files || [])[0];
  if (!file) return;
  const videoWrap = document.getElementById('video-wrap');
  const video = document.getElementById('story-video');
  if (!video || !videoWrap) return;

  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;
  videoWrap.classList.remove('hidden');
  refreshVideoButtons();

  const onCanPlay = async () => {
    await bindVideoTrack(video);
    await initFaceModelIfNeeded();
    if (isOn) {
      try { await video.play(); } catch { }
      startFaceTrackingLoop();
      try { recognition.stop(); } catch { }
      isListening = false;
      setTimeout(safeStart, 100);
    } else {
      setStatus('Video caricato. Sorgente audio: ' + getActiveAudioSource(), false);
    }
    video.removeEventListener('canplay', onCanPlay);
  };
  video.addEventListener('canplay', onCanPlay);
  video.onended = () => {
    if (!isOn) return;
    isOn = false;
    stopSessionAndExport();
  };
  video.load();
}

function clearVideo() {
  const videoWrap = document.getElementById('video-wrap');
  const video = document.getElementById('story-video');
  const input = document.getElementById('video-file');
  if (!video || !videoWrap) return;

  video.pause();
  stopFaceTrackingLoop();
  video.removeAttribute('src');
  video.load();
  videoWrap.classList.add('hidden');
  videoAudioTrack = null;
  refreshAudioSourceBadge();
  if (videoUrl) {
    URL.revokeObjectURL(videoUrl);
    videoUrl = null;
  }
  if (input) input.value = '';
  refreshVideoButtons();

  if (isOn) {
    try { recognition.stop(); } catch { }
    isListening = false;
    setTimeout(safeStart, 100);
  } else {
    setStatus('Video rimosso. Sorgente audio: microfono', false);
  }
}

function renderImagesPanel() {
  const b = document.getElementById('panel-body'); const f = document.getElementById('panel-footer'); b.innerHTML = '';
  if (!words.length) b.innerHTML = '<div class="empty">Nessuna parola configurata.</div>';
  else words.forEach((w, i) => {
    const d = document.createElement('div'); d.className = 'witem';
    d.innerHTML = '<img src="' + esc(w.src) + '" alt="" onerror="this.style.display=\'none\'"/>' +
      '<div class="wname"><strong>' + esc(w.word) + '</strong><small>' + esc(w.src.length > 46 ? w.src.slice(0, 46) + '...' : w.src) + '</small></div>' +
      '<button class="del" onclick="removeWord(' + i + ')">x</button>';
    b.appendChild(d);
  });
  f.innerHTML = '<div class="field"><label>Parola</label><input type="text" id="nw" placeholder="es. gatto"/></div>' +
    '<div class="field"><label>Immagine file</label><label class="drop-zone" id="dz"><span id="dzlbl">Trascina file o clicca</span><img class="prev" id="dprev"/><input type="file" accept="image/*" onchange="onFileChg(event)"/></label></div>' +
    '<div class="field"><label>Oppure URL</label><input type="url" id="nu" placeholder="https://..."/></div>' +
    '<button class="primary" onclick="addWord()" style="width:100%">+ Aggiungi</button>';
}

function onFileChg(e) { const f = e.target.files[0]; if (f) readFile(f); }
function readFile(f) { const r = new FileReader(); r.onload = (e) => { pendingImg = e.target.result; const p = document.getElementById('dprev'); const l = document.getElementById('dzlbl'); if (p) { p.src = pendingImg; p.style.display = 'block'; } if (l) l.style.display = 'none'; }; r.readAsDataURL(f); }
function addWord() { const word = ((document.getElementById('nw') || {}).value || '').trim(); const url = ((document.getElementById('nu') || {}).value || '').trim(); const src = url || pendingImg; if (!word) { alert('Inserisci la parola'); return; } if (!src) { alert('Carica un\'immagine o inserisci un URL'); return; } words.push({ word, src }); saveUserWords(); pendingImg = null; renderImagesPanel(); render(); }
function removeWord(i) { words.splice(i, 1); saveUserWords(); renderImagesPanel(); render(); }

function renderLogPanel() { refreshLog(); document.getElementById('panel-footer').innerHTML = '<button onclick="copyLog()" style="width:100%">Copia testo</button>'; }
function refreshLog() { if (currentPanel !== 'log') return; const b = document.getElementById('panel-body'); b.innerHTML = ''; if (!logLines.length) { b.innerHTML = '<div class="empty">Nessuna trascrizione ancora.</div>'; return; } logLines.slice().reverse().forEach(l => { const d = document.createElement('div'); d.className = 'log-entry'; d.innerHTML = '<span class="ts">' + l.t.toTimeString().slice(0, 8) + '</span>' + esc(l.txt); b.appendChild(d); }); }
function copyLog() { const txt = logLines.map(l => l.t.toTimeString().slice(0, 8) + ' ' + l.txt).join('\n'); navigator.clipboard.writeText(txt); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

(async function init() {
  document.getElementById('mode').value = mode;
  const builtins = await loadBuiltinWords();
  window.BUILTIN_WORDS = builtins;
  words = builtins.concat(loadUserWords());
  window.faceTrackingSnapshots = faceTrackingSnapshots;
  refreshAudioSourceBadge();
  refreshWordsSavedCounter();
  refreshVideoButtons();
  refreshScreenRecButton();
  refreshOutlineButton();
  syncFloatingButtonSizes();
  window.addEventListener('resize', syncFloatingButtonSizes);
  initSpeech();
  render();
})();

// Analysis module: loads a session recording (raw gaze track) together with
// the original source video and tracking JSON (word/face bounding boxes), then:
//   - plays the video with a live overlay (gaze dot + bounding boxes)
//   - computes per-sample intersections (configurable bbox scaling via alpha)
//   - shows primary-category pie, category->subcategory sankey, gaze heatmap

const ALPHA_CATEGORIES = ['image', 'text', 'face', 'eyeLeft', 'eyeRight', 'nose', 'mouth'];
const ALPHA_STORAGE_KEY = 'favola:analysis:alphas2';
const ALPHA_LABELS = { image:'image', text:'text', face:'face', eyeLeft:'L-eye', eyeRight:'R-eye', nose:'nose', mouth:'mouth' };

// Chart colours mirror the bbox outlines defined in assets/index.css (.box, .box.image, ...).
// 'word' equals the default .box border (cyan); 'none' is a muted grey reserved
// for the "not in any tracked region" bucket.
const CAT_COLOR = {
  word:     '#00e5ff',
  image:    '#ff4fc1',
  face:     '#ffd166',
  mouth:    '#ff4d6d',
  nose:     '#8ac926',
  eyeLeft:  '#3a86ff',
  eyeRight: '#8338ec',
  none:     '#666666',
};
const colorFor = (name) => CAT_COLOR[name] || '#888888';

const els = {
  picker: document.getElementById('recordingPicker'),
  reload: document.getElementById('btn-reload'),
  info: document.getElementById('info'),
  showBoxes: document.getElementById('showBoxes'),
  showGaze: document.getElementById('showGaze'),
  alphaReset: document.getElementById('alpha-reset'),
  alphaList: document.getElementById('alphaList'),
  bboxToggle: document.getElementById('btn-bbox-toggle'),
  bboxClose: document.getElementById('bbox-close'),
  bboxDrawer: document.getElementById('bboxDrawer'),
  status: document.getElementById('status'),
  video: document.getElementById('video'),
  videoStage: document.getElementById('videoStage'),
  overlay: document.getElementById('overlay'),
  gazeDot: document.getElementById('gazeDot'),
  videoHint: document.getElementById('videoHint'),
  hudCat: document.getElementById('hud-cat'),
  hudSub: document.getElementById('hud-sub'),
};

const charts = {
  primary: echarts.init(document.getElementById('chart-primary')),
  faceSub: echarts.init(document.getElementById('chart-face-sub')),
  words:   echarts.init(document.getElementById('chart-words')),
  heatmap: echarts.init(document.getElementById('chart-heatmap')),
};
window.addEventListener('resize', () => Object.values(charts).forEach(c => c.resize()));

const setStatus = (t) => els.status.textContent = t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// State for the currently loaded recording.
let session = null;   // { date, participantId, class, story, typology, viewport, samples[] }
let tracking = null;  // { textUpdateSnapshots, faceTrackingSnapshots, wordMetaById, viewport }
let videoUrl = null;  // object URL or http URL for the source video
let rafId = 0;

// Per-category bbox transform: { w, h, dx, dy } in *video-frame fraction* space.
//   w, h  : scale around the box centre (1.0 = unchanged)
//   dx, dy: translation along x / y as a fraction of the frame
//           (e.g. dx=0.05 = shift right by 5% of the frame width)
const alphaByCat = {};
function initAlphasDefault() {
  for (const c of ALPHA_CATEGORIES) alphaByCat[c] = { w: 1.0, h: 1.0, dx: 0.0, dy: 0.0 };
}
initAlphasDefault();

function keyForCat(cat) { return cat === 'word' ? 'text' : cat; }
function alphaWFor(cat)  { const v = alphaByCat[keyForCat(cat)]?.w;  return Number.isFinite(v) && v > 0 ? v : 1.0; }
function alphaHFor(cat)  { const v = alphaByCat[keyForCat(cat)]?.h;  return Number.isFinite(v) && v > 0 ? v : 1.0; }
function alphaDxFor(cat) { const v = alphaByCat[keyForCat(cat)]?.dx; return Number.isFinite(v) ? v : 0.0; }
function alphaDyFor(cat) { const v = alphaByCat[keyForCat(cat)]?.dy; return Number.isFinite(v) ? v : 0.0; }

function loadAlphasFromStorage() {
  try {
    const raw = localStorage.getItem(ALPHA_STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    for (const c of ALPHA_CATEGORIES) {
      const v = obj[c];
      if (!v) continue;
      const w = parseFloat(v.w), h = parseFloat(v.h), dx = parseFloat(v.dx), dy = parseFloat(v.dy);
      if (Number.isFinite(w) && w > 0) alphaByCat[c].w = w;
      if (Number.isFinite(h) && h > 0) alphaByCat[c].h = h;
      if (Number.isFinite(dx)) alphaByCat[c].dx = dx;
      if (Number.isFinite(dy)) alphaByCat[c].dy = dy;
    }
  } catch { /* corrupted -> keep defaults */ }
}
function saveAlphasToStorage() {
  try { localStorage.setItem(ALPHA_STORAGE_KEY, JSON.stringify(alphaByCat)); } catch {}
}

// Per-axis range and formatting for the drawer controls.
const ALPHA_BOUNDS = {
  w:  { min: 0.1,  max: 10.0, step: 0.05,  digits: 2, label: 'W' },
  h:  { min: 0.1,  max: 10.0, step: 0.05,  digits: 2, label: 'H' },
  dx: { min: -1.0, max: 1.0,  step: 0.005, digits: 3, label: 'dx' },
  dy: { min: -1.0, max: 1.0,  step: 0.005, digits: 3, label: 'dy' },
};

function renderAlphaPanel() {
  if (!els.alphaList) return;
  els.alphaList.innerHTML = '';

  const mkAxisLabel = (text) => {
    const el = document.createElement('span');
    el.className = 'alpha-row-axis'; el.textContent = text;
    return el;
  };
  const mkSlider = (cat, axis, value) => {
    const b = ALPHA_BOUNDS[axis];
    const inp = document.createElement('input');
    inp.type = 'range'; inp.className = 'alpha-row-input';
    inp.min = String(b.min); inp.max = String(b.max); inp.step = String(b.step);
    inp.value = String(value);
    inp.dataset.cat = cat; inp.dataset.axis = axis;
    inp.title = `${b.label} bbox ${cat}`;
    return inp;
  };
  const mkNumber = (cat, axis, value) => {
    const b = ALPHA_BOUNDS[axis];
    const inp = document.createElement('input');
    inp.type = 'number'; inp.className = 'alpha-row-num';
    inp.min = String(b.min); inp.max = String(b.max); inp.step = String(b.step);
    inp.value = value.toFixed(b.digits);
    inp.dataset.cat = cat; inp.dataset.axis = axis;
    inp.title = `${b.label} bbox ${cat} (valore numerico)`;
    return inp;
  };

  const onAlphaChange = (cat, axis, raw, slider, num) => {
    const b = ALPHA_BOUNDS[axis];
    let v = parseFloat(raw);
    if (!Number.isFinite(v)) return;
    v = Math.max(b.min, Math.min(b.max, v));
    alphaByCat[cat][axis] = v;
    const formatted = v.toFixed(b.digits);
    if (slider && slider.value !== String(v)) slider.value = String(v);
    if (num && num.value !== formatted) num.value = formatted;
    saveAlphasToStorage();
    refreshChartsForAlpha();
  };

  const addPair = (cat, axis, value) => {
    const axisLabel = mkAxisLabel(ALPHA_BOUNDS[axis].label);
    const slider = mkSlider(cat, axis, value);
    const num = mkNumber(cat, axis, value);
    els.alphaList.append(axisLabel, slider, num);
    slider.addEventListener('input', () => onAlphaChange(cat, axis, slider.value, slider, num));
    num.addEventListener('input',    () => onAlphaChange(cat, axis, num.value,    slider, num));
  };

  for (const c of ALPHA_CATEGORIES) {
    const a = alphaByCat[c];
    const header = document.createElement('div');
    header.className = 'alpha-group-name';
    header.textContent = ALPHA_LABELS[c] || c;
    els.alphaList.appendChild(header);

    // Row 1: scale W and H side by side.
    addPair(c, 'w', a.w);
    addPair(c, 'h', a.h);
    // Row 2: offsets dx and dy side by side.
    addPair(c, 'dx', a.dx);
    addPair(c, 'dy', a.dy);
  }
}

function resetAlphas() {
  initAlphasDefault();
  renderAlphaPanel();
  saveAlphasToStorage();
  refreshChartsForAlpha();
}

// ---------- Recording list ----------

async function loadRecordingsList() {
  setStatus('Caricamento lista...');
  const r = await fetch('/api/recordings');
  if (!r.ok) { setStatus(`Errore lista: HTTP ${r.status}`); return; }
  const j = await r.json();
  const items = j.items || [];
  els.picker.innerHTML = '';
  if (!items.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = '(nessun recording)';
    els.picker.appendChild(o);
    setStatus('Nessun recording in /recordings.');
    return;
  }
  for (const it of items) {
    const o = document.createElement('option');
    o.value = it.name;
    const dt = new Date(it.mtime);
    o.textContent = `${it.name}  (${(it.size/1024).toFixed(1)} KB, ${dt.toLocaleString()})`;
    els.picker.appendChild(o);
  }
  setStatus(`${items.length} recording disponibili.`);
  await loadRecording(items[0].name);
}

async function fileExists(url) {
  try { const r = await fetch(url, { method: 'HEAD' }); return r.ok; }
  catch { return false; }
}

async function loadRecording(filename) {
  if (!filename) return;
  setStatus(`Caricamento ${filename}...`);
  const r = await fetch(`/recordings/${encodeURIComponent(filename)}`);
  if (!r.ok) { setStatus(`Errore caricamento: HTTP ${r.status}`); return; }
  session = await r.json();
  if (!Array.isArray(session.samples)) {
    // Back-compat: pre-refactor recordings stored full intersections; keep only
    // the (t, gaze) part so the same playback / heatmap code works.
    if (Array.isArray(session.intersections)) {
      session.samples = session.intersections.map(it => ({ t: it.t, gaze: it.gaze }));
    } else {
      session.samples = [];
    }
  }

  els.info.textContent =
    `pid=${session.participantId||'?'} class=${session.class||'?'} story=${session.story||'?'} typ=${session.typology||'?'} samples=${session.samples.length}`;

  // Locate source video and tracking JSON based on class/story/typology.
  const base = `/sources/2_${session.class}_${session.story}_${session.typology}`;
  let foundVideo = null;
  for (const ext of ['mp4', 'webm']) {
    if (await fileExists(`${base}.${ext}`)) { foundVideo = `${base}.${ext}`; break; }
  }
  videoUrl = foundVideo;
  if (foundVideo) {
    els.video.src = foundVideo;
    els.videoHint.textContent = `Video: ${foundVideo}`;
  } else {
    els.video.removeAttribute('src');
    els.video.load();
    els.videoHint.textContent = `Video non trovato in /sources/2_${session.class}_${session.story}_${session.typology}.{mp4,webm}`;
  }

  // Load tracking JSON (optional).
  tracking = null;
  try {
    const tr = await fetch(`${base}.json`);
    if (tr.ok) {
      tracking = await tr.json();
      if (!Array.isArray(tracking.textUpdateSnapshots)) tracking.textUpdateSnapshots = [];
      if (!Array.isArray(tracking.faceTrackingSnapshots)) tracking.faceTrackingSnapshots = [];
      tracking.textUpdateSnapshots.sort((a,b) => Number(a.videoTime) - Number(b.videoTime));
      tracking.faceTrackingSnapshots.sort((a,b) => Number(a.videoTime) - Number(b.videoTime));
    }
  } catch { /* leave tracking null */ }

  renderAll();
}

// ---------- Geometry helpers ----------

function pickNearestAtOrBefore(arr, time, hint) {
  if (!Array.isArray(arr) || !arr.length) return { idx: 0, item: null };
  let i = Math.max(0, Math.min(hint|0, arr.length - 1));
  while (i + 1 < arr.length && Number(arr[i+1].videoTime) <= time) i++;
  while (i > 0 && Number(arr[i].videoTime) > time) i--;
  return { idx: i, item: arr[i] || null };
}

// Returns the displayed inner-rect of the video element with object-fit:contain.
// Both bbox and gaze are drawn inside this rect by mapping a "video-frame
// fraction" [0..1] x [0..1] onto it.
function getVideoDisplayRect() {
  const v = els.video;
  const stage = els.videoStage.getBoundingClientRect();
  const vw = v.videoWidth || 0, vh = v.videoHeight || 0;
  if (!vw || !vh) return { x: 0, y: 0, w: stage.width, h: stage.height };
  const scale = Math.min(stage.width / vw, stage.height / vh);
  const w = vw * scale, h = vh * scale;
  const x = (stage.width - w) / 2;
  const y = (stage.height - h) / 2;
  return { x, y, w, h };
}

function snapshotCaptureViewport(snap, fallback) {
  if (snap && snap.viewport && snap.viewport.width && snap.viewport.height) return snap.viewport;
  if (fallback && fallback.width && fallback.height) return fallback;
  return null;
}

function videoIntrinsic() {
  return { w: els.video.videoWidth || 0, h: els.video.videoHeight || 0 };
}

// ----- Coordinate spaces -----
// The session and record/ modules both played their underlying video full-
// viewport with object-fit:contain top-left aligned. So:
//   - bbox in record-viewport pixels is at the same fractional position on the
//     final video frame: fx = box.x / recordVp.width, fy = box.y / recordVp.height.
//   - gaze in session-viewport pixels is at fraction fx = gaze.x / sessionVideoW
//     where sessionVideoW = videoW * min(sessionVp.w / videoW, sessionVp.h / videoH)
//     (and likewise for y).
// Both are then projected onto the analysis player's dispRect.

function gazeToVideoFraction(gazeSess, sessionVp, vid) {
  if (!gazeSess || !sessionVp || !vid || !vid.w || !vid.h) return null;
  const s = Math.min(sessionVp.width / vid.w, sessionVp.height / vid.h);
  const sw = vid.w * s, sh = vid.h * s;
  if (sw <= 0 || sh <= 0) return null;
  return { x: gazeSess.x / sw, y: gazeSess.y / sh };
}

function boxToVideoFraction(box, recordVp) {
  if (!box || !recordVp || !recordVp.width || !recordVp.height) return null;
  return {
    x: box.x / recordVp.width,
    y: box.y / recordVp.height,
    w: box.w / recordVp.width,
    h: box.h / recordVp.height,
  };
}

function alphaScaleFractionBox(fracBox, aW, aH) {
  let { x, y, w, h } = fracBox;
  if (aW !== 1 || aH !== 1) {
    const cx = x + w/2, cy = y + h/2;
    w *= aW; h *= aH;
    x = cx - w/2; y = cy - h/2;
  }
  return { x, y, w, h };
}

// Translate a fraction-space box by (dx, dy) in fraction units (e.g. dx=0.05 = +5% of frame width).
function shiftFractionBox(fracBox, dx, dy) {
  if (!dx && !dy) return fracBox;
  return { x: fracBox.x + dx, y: fracBox.y + dy, w: fracBox.w, h: fracBox.h };
}

// Convenience: scale-then-shift in fraction space using the per-category transform.
function applyAlphaToFractionBox(fracBox, cat) {
  const scaled = alphaScaleFractionBox(fracBox, alphaWFor(cat), alphaHFor(cat));
  return shiftFractionBox(scaled, alphaDxFor(cat), alphaDyFor(cat));
}

function projectFractionPoint(frac, dispRect) {
  if (!frac || !dispRect) return null;
  return { x: dispRect.x + frac.x * dispRect.w, y: dispRect.y + frac.y * dispRect.h };
}

function projectFractionBox(frac, dispRect) {
  if (!frac || !dispRect) return null;
  return {
    x: dispRect.x + frac.x * dispRect.w,
    y: dispRect.y + frac.y * dispRect.h,
    w: frac.w * dispRect.w,
    h: frac.h * dispRect.h,
  };
}

const inBox = (pt, b) => pt && b && pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;

// ---------- Intersection computation ----------

// Macro-area: bounding rect (in record viewport pixels) of all word/image
// entries in the current text snapshot. Used to detect "gaze fell inside the
// text block but not on any specific word".
function computeTextRegion(wordSnap) {
  if (!wordSnap || !Array.isArray(wordSnap.entries) || !wordSnap.entries.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of wordSnap.entries) {
    const b = e.location; if (!b) continue;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Categorize one sample in video-frame fraction space. Returns
// { primaryCategory, primarySubcategory, hits[] }.
// Rules:
//   - specific hit on word/image -> category 'word'|'image', subcategory = word text
//   - gaze in text macro-area but no specific word/image -> 'word'/'none'
//   - specific hit on face part (mouth/nose/eye*) or whole face -> 'face'/<part>
//   - everything else -> 'none'/'none'
function categorizeFraction(gazeFrac, t, hints) {
  const hits = [];
  if (!tracking || !gazeFrac) return { primaryCategory: 'none', primarySubcategory: 'none', hits };

  const meta = tracking.wordMetaById || {};

  // Words / images: specific hits.
  const wsRes = pickNearestAtOrBefore(tracking.textUpdateSnapshots, t, hints.word|0);
  hints.word = wsRes.idx;
  const wordSnap = wsRes.item;
  const wordVp = snapshotCaptureViewport(wordSnap, tracking.viewport);
  let hasSpecificWordHit = false;
  if (wordSnap && Array.isArray(wordSnap.entries) && wordVp) {
    for (const e of wordSnap.entries) {
      const m = meta[String(e.wordAutoIncrementalId)] || {};
      const cat = m.image ? 'image' : 'word'; // 'word' = user-facing 'text'
      const frac = boxToVideoFraction(e.location, wordVp);
      if (!frac) continue;
      const transformed = applyAlphaToFractionBox(frac, cat);
      if (inBox(gazeFrac, transformed)) {
        hits.push({ category: cat, subcategory: m.word || '', id: e.wordAutoIncrementalId });
        hasSpecificWordHit = true;
      }
    }
    // No specific hit but gaze sits inside the text macro-area -> 'word'/'none'.
    // The macro-area is the layout region of text, kept alpha-independent on purpose.
    if (!hasSpecificWordHit) {
      const region = computeTextRegion(wordSnap);
      const regionFrac = region ? boxToVideoFraction(region, wordVp) : null;
      if (regionFrac && inBox(gazeFrac, regionFrac)) {
        hits.push({ category: 'word', subcategory: 'none' });
      }
    }
  }

  // Face parts. Whole-face stays at alpha 1.0 (not in user-controlled list).
  const fsRes = pickNearestAtOrBefore(tracking.faceTrackingSnapshots, t, hints.face|0);
  hints.face = fsRes.idx;
  const faceSnap = fsRes.item;
  const faceVp = snapshotCaptureViewport(faceSnap, tracking.viewport);
  const face = faceSnap ? faceSnap.boxes : null;
  if (face && faceVp) {
    const parts = [
      { sub: 'face',     box: face.face,     cat: 'face' },
      { sub: 'mouth',    box: face.mouth,    cat: 'mouth' },
      { sub: 'nose',     box: face.nose,     cat: 'nose' },
      { sub: 'eyeLeft',  box: face.eyeLeft,  cat: 'eyeLeft' },
      { sub: 'eyeRight', box: face.eyeRight, cat: 'eyeRight' },
    ];
    for (const p of parts) {
      const frac = boxToVideoFraction(p.box, faceVp);
      if (!frac) continue;
      const transformed = applyAlphaToFractionBox(frac, p.cat);
      if (inBox(gazeFrac, transformed)) hits.push({ category: 'face', subcategory: p.sub });
    }
  }

  let primaryCategory = 'none', primarySubcategory = 'none', primaryWordId = null;
  if (hits.length) {
    const wordHit = hits.find(h => h.category === 'word' || h.category === 'image');
    // Face priority: specific part (mouth/nose/eye*) wins over the whole-face
    // container. Otherwise primary subcategory was always "face" since
    // face.face is itself a hit whenever the gaze lands on the head.
    const facePartHit = hits.find(h => h.category === 'face' && h.subcategory !== 'face');
    const faceWholeHit = hits.find(h => h.category === 'face');
    const chosen = wordHit || facePartHit || faceWholeHit || hits[0];
    primaryCategory = chosen.category;
    primarySubcategory = chosen.subcategory;
    if (wordHit && wordHit.id != null) primaryWordId = String(wordHit.id);
  }
  return { primaryCategory, primarySubcategory, primaryWordId, hits };
}

function aggregateIntersections(samples) {
  const primaryCounts = {};   // by primaryCategory: word, image, face, none
  const faceSubCounts = {};   // by primarySubcategory when primaryCategory == 'face'
  const wordCounts = {};      // by wordAutoIncrementalId when primary in {word,image}
                              //   ('none' subcategory means "in text area but no specific hit"
                              //    and has no id, so it's excluded)
  if (!session) return { primaryCounts, faceSubCounts, wordCounts, total: 0 };
  const sessionVp = session.viewport || { width: window.innerWidth, height: window.innerHeight };
  const vid = videoIntrinsic();
  const hints = { word: 0, face: 0 };
  for (const s of samples) {
    const gFrac = gazeToVideoFraction(s.gaze, sessionVp, vid);
    const r = categorizeFraction(gFrac, s.t, hints);
    primaryCounts[r.primaryCategory] = (primaryCounts[r.primaryCategory] || 0) + 1;
    if (r.primaryCategory === 'face') {
      faceSubCounts[r.primarySubcategory] = (faceSubCounts[r.primarySubcategory] || 0) + 1;
    } else if ((r.primaryCategory === 'word' || r.primaryCategory === 'image') && r.primaryWordId != null) {
      wordCounts[r.primaryWordId] = (wordCounts[r.primaryWordId] || 0) + 1;
    }
  }
  return { primaryCounts, faceSubCounts, wordCounts, total: samples.length };
}

function refreshChartsForAlpha() {
  if (!session) return;
  const { primaryCounts, faceSubCounts, wordCounts } = aggregateIntersections(session.samples);
  setPrimaryChart(primaryCounts);
  setFaceSubChart(faceSubCounts);
  setWordsChart(wordCounts);
}

// ---------- Chart rendering ----------

function pctOf(map) {
  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function setPrimaryChart(primaryCounts) {
  const data = pctOf(primaryCounts).map(d => ({ ...d, itemStyle: { color: colorFor(d.name) } }));
  charts.primary.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: p => `${p.name}<br/>${p.value} (${p.percent}%)` },
    legend: { orient: 'vertical', right: 8, top: 8, textStyle: { color: '#bdbdbd', fontSize: 11 } },
    series: [{
      name: 'Primary',
      type: 'pie',
      radius: ['38%', '70%'],
      center: ['40%', '54%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: '#151515', borderWidth: 2 },
      label: { show: true, position: 'outside', formatter: '{d}%', color: '#ffffff', fontSize: 11, fontWeight: 700 },
      labelLine: { show: true, length: 6, length2: 6, lineStyle: { color: '#666' } },
      data,
    }],
  });
}

function setFaceSubChart(faceSubCounts) {
  const data = pctOf(faceSubCounts).map(d => ({ ...d, itemStyle: { color: colorFor(d.name) } }));
  charts.faceSub.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: p => `${p.name}<br/>${p.value} (${p.percent}%)` },
    legend: { orient: 'vertical', right: 8, top: 8, textStyle: { color: '#bdbdbd', fontSize: 11 } },
    series: [{
      name: 'Face subcategory',
      type: 'pie',
      radius: ['38%', '70%'],
      center: ['40%', '54%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: '#151515', borderWidth: 2 },
      label: { show: true, position: 'outside', formatter: '{d}%', color: '#ffffff', fontSize: 11, fontWeight: 700 },
      labelLine: { show: true, length: 6, length2: 6, lineStyle: { color: '#666' } },
      data,
    }],
  });
}

function setWordsChart(wordCountsById) {
  // wordCountsById: { '<wordAutoIncrementalId>': count }
  // Each id is a stable position-occurrence of a word; two occurrences of the
  // same text in different positions therefore stay as separate bars.
  const meta = (tracking && tracking.wordMetaById) || {};
  const items = Object.entries(wordCountsById)
    .map(([id, value]) => {
      const m = meta[id] || {};
      const isImage = !!m.image;
      return {
        id,
        label: m.word || `#${id}`,
        value,
        color: colorFor(isImage ? 'image' : 'word'),
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 15)
    .reverse();
  charts.words.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: ps => {
        const p = Array.isArray(ps) ? ps[0] : ps;
        const it = items[p.dataIndex] || {};
        return `${it.label}<br/>id=${it.id} &mdash; ${p.value}`;
      },
    },
    grid: { left: 100, right: 30, top: 10, bottom: 24 },
    xAxis: { type: 'value', axisLine: { lineStyle: { color: '#444' } }, axisLabel: { color: '#888', fontSize: 10 }, splitLine: { lineStyle: { color: '#222' } } },
    yAxis: {
      type: 'category',
      data: items.map(i => i.label),
      axisLine: { lineStyle: { color: '#444' } },
      axisLabel: { color: '#cfcfcf', fontSize: 11 },
    },
    series: [{
      type: 'bar',
      data: items.map(i => ({ value: i.value, itemStyle: { color: i.color, borderRadius: [0, 3, 3, 0] } })),
      barMaxWidth: 16,
      label: { show: true, position: 'right', color: '#bdbdbd', fontSize: 10 },
    }],
  });
}

function setHeatmap(samples, sessionVp) {
  const W = sessionVp && sessionVp.width  ? sessionVp.width  : 1920;
  const H = sessionVp && sessionVp.height ? sessionVp.height : 1080;
  const ny = 18;
  const nx = Math.max(8, Math.round(ny * (W / H)));
  const counts = new Array(nx * ny).fill(0);
  let maxV = 0;
  for (const s of samples) {
    if (!s.gaze) continue;
    const ix = clamp(Math.floor(s.gaze.x / W * nx), 0, nx - 1);
    const iy = clamp(Math.floor(s.gaze.y / H * ny), 0, ny - 1);
    const idx = iy * nx + ix;
    counts[idx]++;
    if (counts[idx] > maxV) maxV = counts[idx];
  }
  const data = [];
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) data.push([ix, iy, counts[iy * nx + ix]]);
  charts.heatmap.setOption({
    backgroundColor: 'transparent',
    tooltip: { position: 'top' },
    grid: { left: 30, right: 50, top: 10, bottom: 25 },
    xAxis: { type: 'category', data: Array.from({length: nx}, (_, i) => i), axisLine: { lineStyle: { color: '#444' } }, axisLabel: { color: '#888', fontSize: 9 } },
    yAxis: { type: 'category', data: Array.from({length: ny}, (_, i) => i), inverse: true, axisLine: { lineStyle: { color: '#444' } }, axisLabel: { color: '#888', fontSize: 9 } },
    visualMap: { min: 0, max: Math.max(1, maxV), calculable: true, orient: 'vertical', right: 4, top: 'center', textStyle: { color: '#bdbdbd', fontSize: 10 }, inRange: { color: ['#0b0b0b', '#1d3a5c', '#2a6fb0', '#3aa9ff', '#fff58b', '#ff6b3b', '#d11400'] } },
    series: [{ type: 'heatmap', data, animation: false, progressive: 1000 }],
  });
}

// ---------- Live overlay (gaze dot + bbox at current videoTime) ----------

let boxNodes = []; // pool of overlay <div> elements
function ensureBoxes(n) {
  while (boxNodes.length < n) {
    const d = document.createElement('div');
    d.className = 'box';
    els.overlay.appendChild(d);
    boxNodes.push(d);
  }
}
function hideExcessBoxes(used) {
  for (let i = used; i < boxNodes.length; i++) {
    boxNodes[i].style.display = 'none';
  }
}

let liveHints = { word: 0, face: 0 };
function renderLiveOverlay() {
  if (!session) return;
  const t = els.video.currentTime || 0;
  const dispRect = getVideoDisplayRect();

  // Gaze dot at current time: find sample with t <= now closest, then project from
  // video-frame fraction space onto the analysis player's video display rect.
  // Also runs categorization for the HUD ("currently watched category/subcategory").
  let currentGazeFrac = null;
  if (session.samples.length) {
    const samples = session.samples;
    let lo = 0, hi = samples.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].t <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
    }
    const vid = videoIntrinsic();
    if (idx >= 0) {
      currentGazeFrac = gazeToVideoFraction(samples[idx].gaze, session.viewport, vid);
    }
  }
  if (els.showGaze.checked && currentGazeFrac) {
    const placed = projectFractionPoint(currentGazeFrac, dispRect);
    if (placed) {
      els.gazeDot.style.left = placed.x + 'px';
      els.gazeDot.style.top  = placed.y + 'px';
      els.gazeDot.style.display = 'block';
    } else {
      els.gazeDot.style.display = 'none';
    }
  } else {
    els.gazeDot.style.display = 'none';
  }

  // HUD: floating label above the gaze dot.
  const hud = document.getElementById('hud');
  if (currentGazeFrac && tracking && els.showGaze.checked) {
    const placed = projectFractionPoint(currentGazeFrac, dispRect);
    const { primaryCategory, primarySubcategory } = categorizeFraction(currentGazeFrac, t, liveHints);
    if (els.hudCat) els.hudCat.textContent = primaryCategory;
    if (els.hudSub) els.hudSub.textContent = primarySubcategory;
    if (hud && placed) {
      hud.style.left = placed.x + 'px';
      hud.style.top  = placed.y + 'px';
      hud.style.display = 'block';
    }
  } else if (hud) {
    hud.style.display = 'none';
  }

  // Bounding boxes (word + face) at current time, alpha-scaled.
  if (!els.showBoxes.checked || !tracking) {
    hideExcessBoxes(0);
    rafId = requestAnimationFrame(renderLiveOverlay);
    return;
  }
  let used = 0;
  const meta = tracking.wordMetaById || {};
  const wsHint = liveHints.word|0;
  const wsRes = pickNearestAtOrBefore(tracking.textUpdateSnapshots, t, wsHint);
  liveHints.word = wsRes.idx;
  const wordSnap = wsRes.item;
  const wordVp = snapshotCaptureViewport(wordSnap, tracking.viewport);
  if (wordSnap && Array.isArray(wordSnap.entries) && wordVp) {
    for (const e of wordSnap.entries) {
      const m = meta[String(e.wordAutoIncrementalId)] || {};
      const cat = m.image ? 'image' : 'word';
      const frac = boxToVideoFraction(e.location, wordVp);
      if (!frac) continue;
      const transformed = applyAlphaToFractionBox(frac, cat);
      const b = projectFractionBox(transformed, dispRect);
      if (!b) continue;
      ensureBoxes(used + 1);
      const node = boxNodes[used++];
      node.className = 'box ' + cat;
      node.style.left = b.x + 'px'; node.style.top = b.y + 'px';
      node.style.width = b.w + 'px'; node.style.height = b.h + 'px';
      node.style.display = 'block';
    }
  }
  const fsHint = liveHints.face|0;
  const fsRes = pickNearestAtOrBefore(tracking.faceTrackingSnapshots, t, fsHint);
  liveHints.face = fsRes.idx;
  const faceSnap = fsRes.item;
  const faceVp = snapshotCaptureViewport(faceSnap, tracking.viewport);
  const face = faceSnap ? faceSnap.boxes : null;
  if (face && faceVp) {
    // All face parts (including the whole-face container) use the per-category sliders.
    const parts = [
      { cls: 'face',     box: face.face,     cat: 'face' },
      { cls: 'mouth',    box: face.mouth,    cat: 'mouth' },
      { cls: 'nose',     box: face.nose,     cat: 'nose' },
      { cls: 'eyeLeft',  box: face.eyeLeft,  cat: 'eyeLeft' },
      { cls: 'eyeRight', box: face.eyeRight, cat: 'eyeRight' },
    ];
    for (const p of parts) {
      const frac = boxToVideoFraction(p.box, faceVp);
      if (!frac) continue;
      const transformed = applyAlphaToFractionBox(frac, p.cat);
      const b = projectFractionBox(transformed, dispRect);
      if (!b) continue;
      ensureBoxes(used + 1);
      const node = boxNodes[used++];
      node.className = 'box ' + p.cls;
      node.style.left = b.x + 'px'; node.style.top = b.y + 'px';
      node.style.width = b.w + 'px'; node.style.height = b.h + 'px';
      node.style.display = 'block';
    }
  }
  hideExcessBoxes(used);

  rafId = requestAnimationFrame(renderLiveOverlay);
}

function startOverlayLoop() { if (!rafId) rafId = requestAnimationFrame(renderLiveOverlay); }
function stopOverlayLoop()  { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }

// ---------- Render orchestration ----------

function renderAll() {
  if (!session) return;
  const { primaryCounts, faceSubCounts, wordCounts } = aggregateIntersections(session.samples);
  setPrimaryChart(primaryCounts);
  setFaceSubChart(faceSubCounts);
  setWordsChart(wordCounts);
  setHeatmap(session.samples, session.viewport);
  setStatus(`Rendered: ${session.samples.length} samples, tracking=${tracking ? 'yes' : 'no'}`);
  setTimeout(() => Object.values(charts).forEach(c => c.resize()), 50);
}

// ---------- Events ----------

els.picker.addEventListener('change', () => loadRecording(els.picker.value));
els.reload.addEventListener('click', loadRecordingsList);

if (els.alphaReset) els.alphaReset.addEventListener('click', resetAlphas);

function setBboxDrawerOpen(open) {
  if (!els.bboxDrawer) return;
  els.bboxDrawer.classList.toggle('open', !!open);
  els.bboxDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  // Charts may have changed available width: trigger a resize on next frame.
  setTimeout(() => Object.values(charts).forEach(c => c.resize()), 220);
}
if (els.bboxToggle) els.bboxToggle.addEventListener('click', () => {
  setBboxDrawerOpen(!els.bboxDrawer.classList.contains('open'));
});
if (els.bboxClose) els.bboxClose.addEventListener('click', () => setBboxDrawerOpen(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && els.bboxDrawer && els.bboxDrawer.classList.contains('open')) {
    setBboxDrawerOpen(false);
  }
});

els.showBoxes.addEventListener('change', () => { /* overlay loop will pick it up */ });
els.showGaze.addEventListener('change',  () => { /* overlay loop will pick it up */ });

els.video.addEventListener('loadedmetadata', () => {
  // We now know videoWidth/videoHeight, so intersections (which depend on the
  // video frame fraction) can finally be computed correctly.
  if (session) {
    const { primaryCounts, faceSubCounts, wordCounts } = aggregateIntersections(session.samples);
    setPrimaryChart(primaryCounts);
    setFaceSubChart(faceSubCounts);
    setWordsChart(wordCounts);
  }
  startOverlayLoop();
});
els.video.addEventListener('play',  startOverlayLoop);
els.video.addEventListener('pause', () => { renderLiveOverlay(); stopOverlayLoop(); });
els.video.addEventListener('seeked', () => { renderLiveOverlay(); });

loadAlphasFromStorage();
renderAlphaPanel();
loadRecordingsList();

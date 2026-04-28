let recognition = null, isOn = false, isListening = false, finalText = '', interimText = '';
let words = [], pendingImg = null, logLines = [], fontSize = 64, currentPanel = null;
let mode = localStorage.getItem('caption_mode') || 'words';
const SPEECH_FIXES = { "fuochi":"foche", "fuoco":"foche", "carboni":"carponi", "carbone":"carponi" };

function normalizeWord(s){
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’]/g, "'").trim();
}

function fixRecognizedText(txt){
  return String(txt || '').replace(/\b(fuochi|fuoco|carboni|carbone)\b/gi, m => {
    const fixed = SPEECH_FIXES[m.toLowerCase()] || m;
    return m[0] === m[0].toUpperCase() ? fixed[0].toUpperCase() + fixed.slice(1) : fixed;
  });
}

async function loadBuiltinWords(){
  try {
    const res = await fetch('assets/word-images.json', { cache:'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.filter(x => x && x.word && x.src) : [];
  } catch { return []; }
}

function loadUserWords(){
  try { return JSON.parse(localStorage.getItem('sottotitoli_user_words') || '[]'); } catch { return []; }
}

function saveUserWords(){
  const builtins = new Set((window.BUILTIN_WORDS || []).map(w => normalizeWord(w.word)));
  const user = words.filter(w => !builtins.has(normalizeWord(w.word)));
  localStorage.setItem('sottotitoli_user_words', JSON.stringify(user));
}

function initSpeech(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ document.getElementById('nosupport').style.display='block'; return; }
  recognition = new SR(); recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'it-IT';
  recognition.onstart = () => { isListening = true; setStatus('In ascolto...', true); };
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

function safeStart(){ if (!recognition || !isOn || isListening) return; try { recognition.start(); } catch { setTimeout(() => { try { if (isOn && !isListening) recognition.start(); } catch {} }, 500); } }
function toggleMic(){ if (!recognition) return; isOn = !isOn; if (isOn) safeStart(); else { try { recognition.stop(); } catch {} isListening = false; setStatus('Fermo', false); } updateMicBtn(); }
function updateMicBtn(){ const b = document.getElementById('btn-mic'); b.className = isOn ? 'danger' : 'primary'; b.innerHTML = isOn ? '<span class="dot pulse"></span> FERMA' : '<span class="dot"></span> AVVIA'; }
function setStatus(msg, on){ document.getElementById('stxt').textContent = msg; const d = document.getElementById('sdot'); d.className = 'dot' + (on ? ' pulse' : ''); d.style.color = on ? 'var(--accent2)' : 'var(--muted)'; }
function clearCaption(){ finalText = ''; interimText = ''; render(); }
function changeSize(d){ fontSize = Math.max(24, Math.min(128, fontSize + d)); document.documentElement.style.setProperty('--caption-size', fontSize + 'px'); document.getElementById('szlbl').textContent = fontSize + 'px'; }
function setTheme(v){ document.body.setAttribute('data-theme', v); }
function setMode(v){ mode = v; localStorage.setItem('caption_mode', mode); render(); }

function matchWordToken(token){
  let original = String(token || '').trim();
  let suffix = '';
  const m = original.match(/([.,!?;:]+)$/);
  if (m) { suffix = m[1]; original = original.slice(0, -suffix.length); }
  const normalized = normalizeWord(original);
  const parts = normalized.split("'");
  const attempts = [normalized];
  if (parts.length > 1) attempts.push(parts[parts.length - 1]);
  const prefixes = ['l','nell','dell','all','sull','coll','dall'];
  for (const p of prefixes) if (normalized.startsWith(p) && normalized.length > p.length + 1) attempts.push(normalized.slice(p.length));
  const seen = new Set();
  for (const a of attempts){
    if (!a || seen.has(a)) continue; seen.add(a);
    const found = words.find(w => normalizeWord(w.word) === a);
    if (found) return { found, suffix };
  }
  return null;
}

function addRenderedToken(line, token, isInterim){
  const match = mode === 'images' ? matchWordToken(token) : null;
  if (match && !isInterim){
    const wrap = document.createElement('span'); wrap.className = 'word-img';
    wrap.innerHTML = '<img src="' + esc(match.found.src) + '" alt=""/><span class="wlbl">' + esc(match.found.word) + '</span>';
    line.appendChild(wrap);
    if (match.suffix){ const sx = document.createElement('span'); sx.textContent = match.suffix + ' '; line.appendChild(sx); }
  } else {
    const node = document.createElement('span'); if (isInterim) node.className = 'interim'; node.textContent = token + ' '; line.appendChild(node);
  }
}

function render(){
  const el = document.getElementById('caption'); const ph = document.getElementById('placeholder');
  const hasContent = (finalText.trim() || interimText.trim()); ph.style.display = hasContent ? 'none' : 'block'; el.innerHTML = '';
  if (!hasContent) return;
  const line = document.createElement('div'); line.className = 'line';
  finalText.trim().split(/\s+/).filter(Boolean).forEach(w => addRenderedToken(line, w, false));
  interimText.trim().split(/\s+/).filter(Boolean).forEach(w => addRenderedToken(line, w, true));
  el.appendChild(line); document.getElementById('stage').scrollTop = 999999;
}

function toggleFS(){ if (!document.fullscreenElement) document.getElementById('stage').requestFullscreen(); else document.exitFullscreen(); }
function togglePanel(name){ if (currentPanel === name){ closePanel(); return; } currentPanel = name; document.getElementById('panel').classList.add('open'); document.getElementById('panel-title').textContent = name === 'images' ? 'Immagini' : 'Log'; if (name === 'images') renderImagesPanel(); else renderLogPanel(); }
function closePanel(){ currentPanel = null; document.getElementById('panel').classList.remove('open'); }

function renderImagesPanel(){
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

function onFileChg(e){ const f = e.target.files[0]; if (f) readFile(f); }
function readFile(f){ const r = new FileReader(); r.onload = (e) => { pendingImg = e.target.result; const p = document.getElementById('dprev'); const l = document.getElementById('dzlbl'); if (p){ p.src = pendingImg; p.style.display = 'block'; } if (l) l.style.display = 'none'; }; r.readAsDataURL(f); }
function addWord(){ const word = ((document.getElementById('nw') || {}).value || '').trim(); const url = ((document.getElementById('nu') || {}).value || '').trim(); const src = url || pendingImg; if (!word){ alert('Inserisci la parola'); return; } if (!src){ alert('Carica un\'immagine o inserisci un URL'); return; } words.push({ word, src }); saveUserWords(); pendingImg = null; renderImagesPanel(); render(); }
function removeWord(i){ words.splice(i,1); saveUserWords(); renderImagesPanel(); render(); }

function renderLogPanel(){ refreshLog(); document.getElementById('panel-footer').innerHTML = '<button onclick="copyLog()" style="width:100%">Copia testo</button>'; }
function refreshLog(){ if (currentPanel !== 'log') return; const b = document.getElementById('panel-body'); b.innerHTML = ''; if (!logLines.length){ b.innerHTML = '<div class="empty">Nessuna trascrizione ancora.</div>'; return; } logLines.slice().reverse().forEach(l => { const d = document.createElement('div'); d.className = 'log-entry'; d.innerHTML = '<span class="ts">' + l.t.toTimeString().slice(0,8) + '</span>' + esc(l.txt); b.appendChild(d); }); }
function copyLog(){ const txt = logLines.map(l => l.t.toTimeString().slice(0,8) + ' ' + l.txt).join('\n'); navigator.clipboard.writeText(txt); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

(async function init(){
  document.getElementById('mode').value = mode;
  const builtins = await loadBuiltinWords();
  window.BUILTIN_WORDS = builtins;
  words = builtins.concat(loadUserWords());
  initSpeech();
  render();
})();

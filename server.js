// Minimal Node HTTP server for Favola.
// - Serves /            from ./web/   (front-end modules: record/, session/, analysis/)
// - Serves /data/*      from ./data/  (00_sources/, 01_record/, 02_gaze/)
//     NB: data is served under /data/ (not /record/ etc) so it does not shadow
//     the web/record/ front-end module served from /record/.
// - Accepts POST /api/record/<file>.(webm|mp4)      -> ./data/01_record/
//           POST /api/record/json/<file>.json       -> ./data/01_record/
//           POST /api/gaze/<file>.json              -> ./data/02_gaze/
// Supports HTTP Range requests so <video> can seek.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.PORT || '12345', 10);
const HOST = '127.0.0.1';
const ROOT = __dirname;
const WEB_DIR = path.join(ROOT, 'web');
const DATA_DIR = path.join(ROOT, 'data');
const SOURCES_DIR = path.join(DATA_DIR, '00_sources');
const RECORD_DIR = path.join(DATA_DIR, '01_record');
const GAZE_DIR = path.join(DATA_DIR, '02_gaze');

for (const dir of [SOURCES_DIR, RECORD_DIR, GAZE_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mov':  'video/quicktime',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
};

function sendText(res, code, body, headers = {}) {
  res.writeHead(code, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function safeJoin(baseDir, relUrl) {
  const decoded = decodeURIComponent(relUrl || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const target = decoded === '' ? 'index.html' : decoded;
  const full = path.resolve(baseDir, target);
  if (!full.startsWith(path.resolve(baseDir) + path.sep) && full !== path.resolve(baseDir)) {
    return null;
  }
  return full;
}

function serveStatic(req, res, baseDir, relUrl) {
  const filePath = safeJoin(baseDir, relUrl);
  if (!filePath) return sendText(res, 400, 'Bad path');

  fs.stat(filePath, (err, st) => {
    if (err) return sendText(res, 404, 'Not found');
    if (st.isDirectory()) {
      // Force a trailing slash on directory URLs so relative paths inside
      // index.html (href="assets/...") resolve under the right base.
      const rawUrl = (req.url || '').split('?')[0];
      if (!rawUrl.endsWith('/')) {
        res.writeHead(301, { Location: rawUrl + '/' });
        return res.end();
      }
      const indexPath = path.join(filePath, 'index.html');
      return fs.stat(indexPath, (err2, st2) => {
        if (err2 || !st2.isFile()) return sendText(res, 404, 'Not found');
        streamFile(req, res, indexPath, st2);
      });
    }
    if (!st.isFile()) return sendText(res, 404, 'Not found');
    streamFile(req, res, filePath, st);
  });
}

// Static image/font assets never change during a session but are re-created in
// the DOM on every caption re-render; caching them (instead of no-store) avoids a
// re-download storm that makes the "Parole + immagini" mode crawl. Everything else
// (html/js/css/json/video) stays no-store for dev freshness / live data.
const CACHEABLE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.otf']);

function streamFile(req, res, filePath, st) {

    const ext = path.extname(filePath).toLowerCase();
    const ct = MIME[ext] || 'application/octet-stream';
    const cacheControl = CACHEABLE_EXT.has(ext) ? 'public, max-age=3600' : 'no-store';
    const range = req.headers.range;

    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        const start = m[1] === '' ? 0 : parseInt(m[1], 10);
        const end = m[2] === '' ? st.size - 1 : parseInt(m[2], 10);
        if (start >= 0 && end < st.size && start <= end) {
          res.writeHead(206, {
            'Content-Type': ct,
            'Content-Length': end - start + 1,
            'Content-Range': `bytes ${start}-${end}/${st.size}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': cacheControl,
          });
          fs.createReadStream(filePath, { start, end }).pipe(res);
          return;
        }
      }
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
      return res.end();
    }

    res.writeHead(200, {
      'Content-Type': ct,
      'Content-Length': st.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': cacheControl,
    });
    fs.createReadStream(filePath).pipe(res);
}

function handleJsonUpload(req, res, baseDir, urlPrefix, allowedNameRegex) {
  const rel = req.url.substring(urlPrefix.length);
  const filename = path.basename(decodeURIComponent(rel));
  if (!allowedNameRegex.test(filename)) {
    return sendJson(res, 400, { error: `invalid filename, expected ${allowedNameRegex}` });
  }

  let body = '';
  let tooBig = false;
  const LIMIT = 50 * 1024 * 1024; // 50 MB cap
  req.on('data', chunk => {
    if (tooBig) return;
    body += chunk;
    if (body.length > LIMIT) { tooBig = true; req.destroy(); }
  });
  req.on('end', () => {
    if (tooBig) return sendJson(res, 413, { error: 'payload too large' });
    try { JSON.parse(body); }
    catch (e) { return sendJson(res, 400, { error: 'invalid JSON in body' }); }
    const outPath = path.join(baseDir, filename);
    fs.writeFile(outPath, body, 'utf8', (err) => {
      if (err) {
        console.error('write error', err);
        return sendJson(res, 500, { error: 'write failed' });
      }
      console.log(`POST ${urlPrefix}: saved ${filename} (${body.length} bytes)`);
      sendJson(res, 200, { ok: true, file: filename, size: body.length });
    });
  });
  req.on('error', () => sendJson(res, 400, { error: 'request error' }));
}

// Accepts arbitrary binary uploads (e.g. webm/mp4 video) saved by record/.
function handleBinaryUpload(req, res, baseDir, urlPrefix, allowedNameRegex) {
  const rel = req.url.substring(urlPrefix.length);
  const filename = path.basename(decodeURIComponent(rel));
  if (!allowedNameRegex.test(filename)) {
    return sendJson(res, 400, { error: `invalid filename, expected ${allowedNameRegex}` });
  }
  const LIMIT = 500 * 1024 * 1024; // 500 MB cap for video
  const outPath = path.join(baseDir, filename);
  const tmpPath = outPath + '.part';
  let received = 0;
  let tooBig = false;
  const stream = fs.createWriteStream(tmpPath);
  req.on('data', chunk => {
    if (tooBig) return;
    received += chunk.length;
    if (received > LIMIT) { tooBig = true; stream.destroy(); req.destroy(); return; }
    stream.write(chunk);
  });
  req.on('end', () => {
    if (tooBig) {
      try { fs.unlinkSync(tmpPath); } catch {}
      return sendJson(res, 413, { error: 'payload too large' });
    }
    stream.end(() => {
      fs.rename(tmpPath, outPath, (err) => {
        if (err) {
          console.error('rename error', err);
          try { fs.unlinkSync(tmpPath); } catch {}
          return sendJson(res, 500, { error: 'write failed' });
        }
        console.log(`POST ${urlPrefix}: saved ${filename} (${received} bytes)`);
        sendJson(res, 200, { ok: true, file: filename, size: received });
      });
    });
  });
  req.on('error', () => { try { stream.destroy(); fs.unlinkSync(tmpPath); } catch {} sendJson(res, 400, { error: 'request error' }); });
}

function handleGazeList(req, res) {
  fs.readdir(GAZE_DIR, (err, names) => {
    if (err) return sendJson(res, 500, { error: 'cannot list gaze recordings' });
    const items = names.filter(n => n.toLowerCase().endsWith('.json')).map(n => {
      const st = fs.statSync(path.join(GAZE_DIR, n));
      return { name: n, size: st.size, mtime: st.mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime);
    sendJson(res, 200, { items });
  });
}

// POST /api/tobii/calibrate -> launches the Tobii calibration/configuration app.
// The exe is auto-detected among the known Tobii install paths; override with the
// FAVOLA_TOBII_CALIB_EXE env var (full path) and FAVOLA_TOBII_CALIB_ARGS
// (space-separated extra args, e.g. a direct-calibration switch for your Tobii version).
function findTobiiCalibExe() {
  if (process.env.FAVOLA_TOBII_CALIB_EXE) return process.env.FAVOLA_TOBII_CALIB_EXE;
  const candidates = [
    'C:\\Program Files\\Tobii\\Tobii EyeX\\Tobii.Configuration.exe',
    'C:\\Program Files (x86)\\Tobii\\Tobii EyeX\\Tobii.Configuration.exe',
    'C:\\Program Files\\Tobii\\Tobii Experience\\Tobii.Experience.exe',
    'C:\\Program Files (x86)\\Tobii\\Tobii Experience\\Tobii.Experience.exe',
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function handleTobiiCalibrate(req, res) {
  if (process.platform !== 'win32') {
    return sendJson(res, 501, { error: 'La calibrazione Tobii è disponibile solo su Windows.' });
  }
  const exe = findTobiiCalibExe();
  if (!exe) {
    return sendJson(res, 404, {
      error: 'Eseguibile di calibrazione Tobii non trovato. Installa Tobii Experience oppure imposta FAVOLA_TOBII_CALIB_EXE.',
    });
  }
  const extra = (process.env.FAVOLA_TOBII_CALIB_ARGS || '').trim();
  const args = extra ? extra.split(/\s+/) : [];
  try {
    const child = spawn(exe, args, { detached: true, stdio: 'ignore' });
    child.on('error', (e) => console.error(`tobii calibrate spawn error: ${e.message}`));
    child.unref();
    console.log(`POST /api/tobii/calibrate: launched ${exe} ${args.join(' ')}`.trim());
    return sendJson(res, 200, { ok: true, exe, args });
  } catch (e) {
    return sendJson(res, 500, { error: `Impossibile avviare la calibrazione: ${e.message}` });
  }
}

// Allowed naming on disk:
//   data/00_sources/  <class>_<story>.mp4                        (record input)
//   data/01_record/   <class>_<story>_<type>.{webm|mp4|json}     (record output)
//   data/02_gaze/     YYYYMMDD_HHMMSS_<pid>_<class>_<story>_<type>.json
const RECORD_BIN_RE = /^[A-Za-z0-9_\-.]+\.(?:webm|mp4)$/;
const RECORD_JSON_RE = /^[A-Za-z0-9_\-.]+\.json$/;
const GAZE_RE  = /^[A-Za-z0-9_\-.]+\.json$/;

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    if (req.url.startsWith('/api/gaze/')) {
      return handleJsonUpload(req, res, GAZE_DIR, '/api/gaze/', GAZE_RE);
    }
    if (req.url.startsWith('/api/record/json/')) {
      return handleJsonUpload(req, res, RECORD_DIR, '/api/record/json/', RECORD_JSON_RE);
    }
    if (req.url.startsWith('/api/record/')) {
      return handleBinaryUpload(req, res, RECORD_DIR, '/api/record/', RECORD_BIN_RE);
    }
    if (req.url === '/api/tobii/calibrate') {
      return handleTobiiCalibrate(req, res);
    }
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (req.url === '/api/gaze' || req.url === '/api/gaze/') {
      return handleGazeList(req, res);
    }
    if (req.url.startsWith('/data/')) {
      return serveStatic(req, res, DATA_DIR, req.url.substring('/data/'.length));
    }
    return serveStatic(req, res, WEB_DIR, req.url.split('?')[0]);
  }
  sendText(res, 405, 'Method not allowed');
});

server.listen(PORT, HOST, () => {
  console.log(`Favola server listening on http://${HOST}:${PORT}/`);
  console.log(`  web/              ->  GET  /            (record/, session/, analysis/)`);
  console.log(`  data/00_sources/  ->  GET  /data/00_sources/<file>`);
  console.log(`  data/01_record/   ->  GET  /data/01_record/<file>`);
  console.log(`                    ->  POST /api/record/<file>.(webm|mp4)`);
  console.log(`                    ->  POST /api/record/json/<file>.json`);
  console.log(`  data/02_gaze/     ->  GET  /data/02_gaze/<file>.json`);
  console.log(`                    ->  GET  /api/gaze   (list)`);
  console.log(`                    ->  POST /api/gaze/<file>.json`);
});

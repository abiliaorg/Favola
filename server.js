// Minimal Node HTTP server for Favola.
// - Serves /            from ./web/
// - Serves /sources/*   from ./sources/
// - Accepts POST /api/recordings/<filename>.json -> writes ./recordings/<filename>.json
// Supports HTTP Range requests so <video> can seek.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '12345', 10);
const HOST = '127.0.0.1';
const ROOT = __dirname;
const WEB_DIR = path.join(ROOT, 'web');
const SOURCES_DIR = path.join(ROOT, 'sources');
const RECORDINGS_DIR = path.join(ROOT, 'recordings');

if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
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

function streamFile(req, res, filePath, st) {

    const ext = path.extname(filePath).toLowerCase();
    const ct = MIME[ext] || 'application/octet-stream';
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
            'Cache-Control': 'no-store',
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
      'Cache-Control': 'no-store',
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

function handleRecordingsList(req, res) {
  fs.readdir(RECORDINGS_DIR, (err, names) => {
    if (err) return sendJson(res, 500, { error: 'cannot list recordings' });
    const items = names.filter(n => n.toLowerCase().endsWith('.json')).map(n => {
      const st = fs.statSync(path.join(RECORDINGS_DIR, n));
      return { name: n, size: st.size, mtime: st.mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime);
    sendJson(res, 200, { items });
  });
}

// Allowed input naming on disk:
//   sources/    1_<class>_<story>.mp4    (record input)
//               2_<class>_<story>_<type>.{webm|mp4|json}  (record output)
//   recordings/ YYYYMMDD_HHMMSS_<pid>_<class>_<story>_<type>.json
const SOURCES_BIN_RE = /^[A-Za-z0-9_\-.]+\.(?:webm|mp4)$/;
const SOURCES_JSON_RE = /^[A-Za-z0-9_\-.]+\.json$/;
const RECORDINGS_RE  = /^[A-Za-z0-9_\-.]+\.json$/;

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    if (req.url.startsWith('/api/recordings/')) {
      return handleJsonUpload(req, res, RECORDINGS_DIR, '/api/recordings/', RECORDINGS_RE);
    }
    if (req.url.startsWith('/api/sources/json/')) {
      return handleJsonUpload(req, res, SOURCES_DIR, '/api/sources/json/', SOURCES_JSON_RE);
    }
    if (req.url.startsWith('/api/sources/')) {
      return handleBinaryUpload(req, res, SOURCES_DIR, '/api/sources/', SOURCES_BIN_RE);
    }
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (req.url === '/api/recordings' || req.url === '/api/recordings/') {
      return handleRecordingsList(req, res);
    }
    if (req.url.startsWith('/recordings/')) {
      return serveStatic(req, res, RECORDINGS_DIR, req.url.substring('/recordings/'.length));
    }
    if (req.url.startsWith('/sources/')) {
      return serveStatic(req, res, SOURCES_DIR, req.url.substring('/sources/'.length));
    }
    return serveStatic(req, res, WEB_DIR, req.url.split('?')[0]);
  }
  sendText(res, 405, 'Method not allowed');
});

server.listen(PORT, HOST, () => {
  console.log(`Favola server listening on http://${HOST}:${PORT}/`);
  console.log(`  web/         ->  GET  /`);
  console.log(`  sources/     ->  GET  /sources/<file>`);
  console.log(`               ->  POST /api/sources/<file>.(webm|mp4)`);
  console.log(`               ->  POST /api/sources/json/<file>.json`);
  console.log(`  recordings/  ->  GET  /recordings/<file>.json`);
  console.log(`               ->  GET  /api/recordings   (list)`);
  console.log(`               ->  POST /api/recordings/<file>.json`);
});

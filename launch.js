// Cross-platform launcher for Favola.
// - Frees the ports we use (kills any process listening on them).
// - Starts the Tobii Python bridge on TOBII_PORT.
// - Starts the static + API server in-process on WEB_PORT.
// - Opens Chrome in app mode on /session/.
// - On Ctrl+C: cleans up spawned children and exits.

const { spawn, execSync } = require('child_process');

const WEB_PORT   = parseInt(process.env.PORT       || '12345', 10);
const TOBII_PORT = parseInt(process.env.TOBII_PORT || '12346', 10);
const URL = `http://127.0.0.1:${WEB_PORT}/session/index.html`;
const ROOT = __dirname;

const children = [];
let shuttingDown = false;

function log(name, msg) { console.log(`[${name}] ${msg}`); }

function killProcessesOnPort(port) {
  try {
    if (process.platform === 'win32') {
      let out = '';
      try { out = execSync(`netstat -ano -p tcp | findstr :${port}`, { stdio: ['ignore','pipe','ignore'] }).toString(); }
      catch { return; /* findstr exits 1 when no match */ }
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        // Layout: "  TCP    0.0.0.0:47823    0.0.0.0:0    LISTENING    12345"
        if (!/LISTENING/i.test(line)) continue;
        const cols = line.trim().split(/\s+/);
        const pid = cols[cols.length - 1];
        if (/^\d+$/.test(pid) && pid !== '0' && pid !== String(process.pid)) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          log('launch', `freed port ${port} (killed pid ${pid})`);
        } catch (e) { log('launch', `failed to kill pid ${pid} on port ${port}: ${e.message}`); }
      }
    } else {
      let out = '';
      try { out = execSync(`lsof -ti tcp:${port}`, { stdio: ['ignore','pipe','ignore'] }).toString(); }
      catch { return; }
      const pids = out.split(/\s+/).filter(s => /^\d+$/.test(s) && s !== String(process.pid));
      for (const pid of pids) {
        try { process.kill(parseInt(pid, 10), 'SIGKILL'); log('launch', `freed port ${port} (killed pid ${pid})`); }
        catch (e) { log('launch', `failed to kill pid ${pid} on port ${port}: ${e.message}`); }
      }
    }
  } catch (e) {
    log('launch', `port cleanup error: ${e.message}`);
  }
}

function startChild(name, command, args, opts = {}) {
  log('launch', `starting ${name}: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  children.push({ name, child });
  child.on('exit', (code, sig) => {
    if (!shuttingDown) log('launch', `${name} exited (code=${code} signal=${sig})`);
  });
  return child;
}

function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('launch', `shutdown (${reason}): killing children...`);
  for (const { name, child } of children) {
    try { child.kill(); } catch (e) { log('launch', `kill ${name} failed: ${e.message}`); }
  }
  setTimeout(() => process.exit(0), 400);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
if (process.platform === 'win32') process.on('SIGBREAK', () => shutdown('SIGBREAK'));

// 0) Free ports from leftover processes from previous runs.
killProcessesOnPort(WEB_PORT);
killProcessesOnPort(TOBII_PORT);

// 1) Tobii bridge (Python). If the ET5 isn't connected it will exit, that's OK.
startChild('tobii', 'python', [
  'gaze/tobii_gaze.py',
  '--ws',
  '--ws-port', String(TOBII_PORT),
  '--no-csv',
]);

// 2) Static + API server (in-process, shares stdout). Picks up env.PORT.
process.env.PORT = String(WEB_PORT);
require('./server.js');

// 3) Chrome in app mode. Give the server ~1s to bind.
setTimeout(() => {
  const chromeArgs = [
    `--app=${URL}`,
    '--start-maximized',
    '--no-first-run',
    '--disable-features=Translate',
  ];
  if (process.platform === 'win32') {
    startChild('chrome', 'cmd', ['/c', 'start', '""', 'chrome', ...chromeArgs]);
  } else if (process.platform === 'darwin') {
    startChild('chrome', 'open', ['-a', 'Google Chrome', '--args', ...chromeArgs]);
  } else {
    startChild('chrome', 'google-chrome', chromeArgs);
  }
}, 1000);

log('launch', `ready. Web=${WEB_PORT} Tobii=${TOBII_PORT}. URL: ${URL}. Press Ctrl+C to stop.`);

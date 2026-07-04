# Favola — Live subtitles + Eye tracking

Web tool that generates live subtitles for fairy tales while tracking the words and the
reader's face, and later analyzes the participant's gaze during replay.

## Folder structure

```text
Favola/
├─ server.js                     (static server + upload/list API)
├─ launch.js                     (starts Tobii bridge + server + Chrome)
├─ web/                          (front-end served from /)
│  ├─ index.html                 (home: pick the module)
│  ├─ originals/                 (source templates, DO NOT modify)
│  ├─ record/                    (recording module)
│  ├─ session/                   (replay + gaze capture module)
│  └─ analysis/                  (analysis / recording replay module)
├─ gaze/                         (Python bridge for the Tobii ET5)
└─ data/                         (all input/output data)
   ├─ 00_sources/                (input: story video  <class>_<story>.mp4)
   ├─ 01_record/                 (record output: <class>_<story>_<type>.{webm|mp4|json})
   └─ 02_gaze/                   (gaze output: YYYYMMDD_HHMMSS_<pid>_<class>_<story>_<type>.json)
```

### Folder ↔ URL mapping

Data is served under `/data/…` (not `/record/`, `/session/`, etc.) so it does not shadow the
front-end modules served from `/` (`web/record/`, `web/session/`, `web/analysis/`).

| Folder | Content | GET | Upload |
|---|---|---|---|
| `data/00_sources/` | input story video `<class>_<story>.mp4` | `/data/00_sources/<file>` | — (chosen from a file picker in Record) |
| `data/01_record/` | Record output `<class>_<story>_<type>` | `/data/01_record/<file>` | `POST /api/record/<file>.(webm\|mp4)` · `POST /api/record/json/<file>.json` |
| `data/02_gaze/` | gaze recordings | `/data/02_gaze/<file>` | `POST /api/gaze/<file>.json` · list `GET /api/gaze` |

Control endpoint: `POST /api/tobii/calibrate` launches the Tobii calibration app
(see [Tobii calibration](#tobii-calibration)).

## Ground rule

The files in `web/originals/` are **source templates**:

- do not modify them
- do not rename them
- do not move them

## Record module (`record/`)

Captures speech, video, on-screen word positions and face landmarks in real time.

Main features:

- Live transcription with the `Web Speech API` (`it-IT`), with custom fixes for recurring errors
- Toolbar: mic start/stop (`AVVIA`/`FERMA`), clear (`Cancella`), text size (`A-`/`A+`), background theme, mode (`Solo parole` / `Parole + immagini`), max rows (`Righe`), `REC SCHERMO`, video (`+`/`-`), export JSON, outline, `Immagini`/`Log` panels, fullscreen
- Optional story-video load: the video's audio becomes the recognition source instead of the microphone
- Face tracking with `MediaPipe FaceMesh` sampled every 100 ms (face, mouth, nose, eye-left, eye-right)
- Word location tracking: the DOM bbox of every token saved at each update
- Optional screen recording via `getDisplayMedia` (`preferCurrentTab`): on stop, the `webm` is **uploaded** to `data/01_record/` as `<class>_<story>_<type>.webm` (local download as fallback)
- The tracking JSON (words, locations, face snapshots) is uploaded to `data/01_record/` as `<class>_<story>_<type>.json` (fallback: download)
- `Immagini` panel to manually add word/image pairs (persisted in `localStorage`)
- `Log` panel with copy-to-clipboard
- After `FERMA` or at the end of the story it saves everything and **resets**: clears the text, rewinds the video to `00:00` and stands by for a new recording
- Changing or removing the video clears the transcribed text
- Rows beyond the `Righe` limit are neither shown nor tracked; default text size is `80px`

The input video is loaded from a **local file picker**; the filename must follow the
`<class>_<story>.<ext>` scheme (e.g. `4_dolphin.mp4`) to enable auto-saving the output into
`data/01_record/`.

> **Alignment note** — In the screen-recording share dialog choose **"This tab"** (Chrome
> pre-selects it thanks to `preferCurrentTab`): this way the recorded video matches the
> viewport and in `session/`/`analysis/` the outlines line up perfectly. Sharing the whole
> screen/window makes the frame include extra areas and the bboxes end up misaligned.

Words/images mode:

- In `Solo parole`, the text is shown as a plain subtitle.
- In `Parole + immagini`, if a transcribed word exists in `assets/word-images.json`, it is rendered as an image card + label.

## Session module (`session/`)

Replays the recorded video with an overlay of the **real gaze** (Tobii bridge) and
word/face outlines, while recording the participant's gaze track for analysis.

Main features:

- Selection: **participant** (text field, required), **class** → **story** (depends on the class) → **typology**. Everything starts empty and is cleared on `FERMA`/end of video; `AVVIA` is blocked until they are all set (and the sources loaded)
- Auto-loading of video + tracking JSON from `data/01_record/` based on `<class>_<story>_<typology>`
- Overlay of the real gaze from the Tobii bridge (WebSocket `12346`); if Tobii is offline the dot stays put and **no** simulated samples are recorded
- Optional outline of words and face parts for the current frame, anchored to the video's real geometry
- Records the raw gaze track as `{t, gaze:{x,y}}` samples (~10 Hz, one tick every 100 ms) vs. video time; intersections with the bboxes are computed offline by the Analysis module
- Session typologies: `text` or `text + images`
- Saved to `data/02_gaze/` as `YYYYMMDD_HHMMSS_<participantId>_<class>_<story>_<typology>.json`
- **Calibra** button in the Tobii toolbar: launches the Tobii calibration app without leaving the page (see [Tobii calibration](#tobii-calibration))

### Tobii calibration

The `Calibra` button (*Tobii* toolbar group) issues a `POST /api/tobii/calibrate`; the
server launches the Tobii calibration executable, auto-detected among the known paths:

- `C:\Program Files\Tobii\Tobii EyeX\Tobii.Configuration.exe`
- `C:\Program Files\Tobii\Tobii Experience\Tobii.Experience.exe` (and `Program Files (x86)` variants)

With the **Tobii EyeX/Core** stack there is no documented CLI switch to jump straight into
calibration: the button opens the calibration app, from which calibration starts
immediately or after a click depending on the version.

To force an executable or pass custom arguments (e.g. a direct-calibration switch), set the
environment variables before `npm start`:

```powershell
$env:FAVOLA_TOBII_CALIB_EXE  = "C:\Program Files\Tobii\Tobii EyeX\Tobii.Configuration.exe"
$env:FAVOLA_TOBII_CALIB_ARGS = "--your-switch"
npm start
```

## Analysis module (`analysis/`)

Offline analysis of gaze recordings: pick a file from `data/02_gaze/` (via `GET /api/gaze`)
and reload the matching video + tracking from `data/01_record/`.

Main features:

- Video replay with gaze and bbox overlays
- Per-sample computation of the **gaze ↔ bbox intersections**, assigning each to a primary category (word / image / face) and, for the face, a sub-category (eyes / mouth / nose), with priority word/image > face
- Charts: % distribution per primary category, face sub-category breakdown, top words/images, gaze heatmap
- **Bbox scaling** panel (`alpha` parameters: W/H scale and dx/dy translation per category) to correct alignment after the fact without re-recording

## Tobii bridge (`gaze/tobii_gaze.py`)

Python bridge that reads gaze from the **Tobii Eye Tracker 5** on Windows and streams it
over a local **WebSocket** (and/or saves it to CSV). The `session/` module consumes the
stream to move the gaze dot in real time and record the track. No Tobii Pro SDK and no
middleware: the script loads `tobii_stream_engine.dll` (installed by Tobii Experience)
directly via `ctypes`.

### Requirements

- **Hardware**: Tobii Eye Tracker 5 connected via USB.
- **Software**: Windows 10/11 (64-bit); Python 3.8+ (64-bit); **Tobii Experience** installed, running and **calibrated**.
- **Python packages**: `websockets` (only with `--ws`) → `py -m pip install websockets`. Everything else is standard library.

The DLL is looked up at `C:\Program Files\Tobii\Tobii EyeX\tobii_stream_engine.dll`; if your
path differs, update `DLL_PATH` at the top of `tobii_gaze.py`.

### Usage

With `npm start` the bridge starts automatically (`launch.js`) on port **12346**. By hand —
`npm run tobii`, or:

```powershell
py gaze\tobii_gaze.py --ws --no-csv        # live streaming for session/ (recommended)
py gaze\tobii_gaze.py --ws                 # streaming + CSV backup
py gaze\tobii_gaze.py                       # CSV only, no WebSocket
```

Useful options:

- `--duration N` — stop after N seconds (default: run until Ctrl+C)
- `--out FILE.csv` — custom CSV filename (default: timestamped name)
- `--ws-port N` — WebSocket port (**default 8765**; the app uses **12346**)
- `--width N` / `--height N` — override the screen resolution if auto-detection is wrong

### WebSocket protocol

With `--ws`, the server accepts connections on `ws://127.0.0.1:<port>/` and broadcasts one
JSON message per **valid** sample:

```json
{"type":"gaze","ts":1716123456789,"x":0.5123,"y":0.4781,"valid":true}
```

| Field | Type | Description |
|---|---|---|
| `type` | string | Always `"gaze"`. |
| `ts` | int | Tobii timestamp in **milliseconds** (from the native µs clock). |
| `x` | float | Horizontal gaze position, **normalized** `[0,1]` from the left edge of the display. |
| `y` | float | Vertical gaze position, **normalized** `[0,1]` from the top edge of the display. |
| `valid` | bool | Always `true` in broadcasts (invalid samples are filtered upstream). |

Invalid samples (blinks, tracking loss) are dropped before broadcast.

### CSV format

When CSV is enabled (default unless `--no-csv`):

| Column | Type | Description |
|---|---|---|
| `timestamp_us` | int | Tobii internal clock in microseconds (for precise sync with other streams). |
| `x_px` | float | Horizontal gaze position in **pixels** (normalized x × screen width). |
| `y_px` | float | Vertical gaze position in **pixels** (normalized y × screen height). |

Values slightly outside the bounds (negative or beyond the resolution) are normal near the
edges and are not clipped. Sampling rate is ~**33 Hz** on the ET5.

### How it works

1. **DLL loading** — `tobii_stream_engine.dll` via `ctypes.CDLL`.
2. **API init** — the Stream Engine API is created; the local ET5 is enumerated and opened.
3. **Gaze subscription** — a C callback registered with `tobii_gaze_point_subscribe`, fired for every sample (~33 Hz).
4. **Per-sample fan-out** — valid samples go to the CSV buffer and/or to the connected WebSocket clients.
5. **WebSocket server** — with `--ws`, an asyncio server runs on a background thread; broadcasts are scheduled cross-thread with `asyncio.run_coroutine_threadsafe`.
6. **Shutdown** — on Ctrl+C (or when `--duration` elapses) the subscription is cancelled, device and API are destroyed, and the CSV is written if enabled.

### Validity filtering

Only samples with `validity == 1` (valid in this DLL version) are kept. All others (blinks,
tracker loss, off-screen) are dropped from both the CSV and the WebSocket broadcasts.

### Coordinate system

The `session/` module assumes the browser window covers the **same display** the Tobii is
calibrated against, so it maps the normalized gaze `(x,y)` directly onto
`window.innerWidth/innerHeight`. On a fullscreen browser (`F11`) on the primary display this
is accurate without further calibration. To (re)calibrate the ET5, use the **Calibra**
button (see [Tobii calibration](#tobii-calibration)).

### Troubleshooting

- **`OSError: [WinError 193] … not a valid Win32 application`** — 32/64-bit mismatch between the DLL and Python; use the DLL installed by Tobii Experience in `C:\Program Files\Tobii\Tobii EyeX\`.
- **`RuntimeError: No Tobii device found`** — ET5 not connected, Tobii Experience not running, or unplug/replug the device.
- **0 samples / WebSocket silent** — sit 40–80 cm from the screen; verify calibration in Tobii Experience.
- **`Module 'websockets' is not installed`** — `py -m pip install websockets`.

### Legal notice

The Tobii Eye Tracker 5 is sold for interaction purposes only. Using it for research or
analysis may require a separate licence under Tobii's agreement — see
[developer.tobii.com/license-agreement](https://developer.tobii.com/license-agreement/).
The script does not redistribute any Tobii IP: it only loads `tobii_stream_engine.dll`
already present on the machine as part of Tobii Experience.

### References

- [betaboon/python-tobii-stream-engine](https://github.com/betaboon/python-tobii-stream-engine)
- [JamesQFreeman/PyEyetracker](https://github.com/JamesQFreeman/PyEyetracker)
- [GazePlay/TobiiStreamEngineForJava](https://github.com/GazePlay/TobiiStreamEngineForJava)

## Installation (fresh PC)

On a fresh Windows 10/11 (64-bit) PC, run the prerequisites installer:

- Double-click [`install/install.bat`](install/install.bat) (it auto-elevates to Administrator), **or**
- from an Administrator PowerShell: `powershell -ExecutionPolicy Bypass -File install\install.ps1`

The installer (based on `winget`) checks/installs:

| Component | Why it's needed |
|---|---|
| Node.js LTS | runs `server.js` / `launch.js` |
| Python 3.12 (64-bit) | Tobii bridge `gaze/tobii_gaze.py` |
| pip package `websockets` | live gaze streaming via WebSocket |
| Google Chrome | UI opened in app/kiosk mode |
| Tobii Experience | ET5 driver + DLL `tobii_stream_engine.dll` (only if you use the eye tracker) |

Notes:

- The project has **no npm dependencies** (Node standard library only): no `npm install`.
- The installer is idempotent: it skips whatever is already present.
- Tobii is not distributed via winget: if it doesn't show up, install it from
  [gaming.tobii.com/getstarted](https://gaming.tobii.com/getstarted/) and calibrate it in Tobii Experience.
  Use `-SkipTobii` on PCs without an eye tracker.
- If after installation `node`/`py` are not on the PATH, reopen the terminal and rerun the installer.

## Running

After installation, from the project folder:

```powershell
npm start        # equivalent to: node launch.js
```

`launch.js` frees the ports (killing any leftover bridge/Chrome from a previous run),
starts the Tobii bridge, the static/API server, and opens Chrome in app mode on `/session/`.
Press Ctrl+C to stop everything.

The pages must be **served by the server** (not opened via `file://`): the modules fetch
`/data/…` and `/api/…`. To use them by hand, start `npm run server` (or `npm run dev`) and
open `http://127.0.0.1:12345/` in `Chrome`/`Edge` with microphone access enabled, then pick
the module (`record/`, `session/`, `analysis/`).

### npm scripts

| Script | Command | Use |
|---|---|---|
| `npm start` | `node launch.js` | full stack: ports + Tobii bridge + server + Chrome app on `/session/` |
| `npm run server` | `node server.js` | server (static/API) only on `127.0.0.1:12345` (no Chrome/Tobii) |
| `npm run dev` | `node --watch server.js` | like `server`, but **auto-restarts** when `server.js` changes — for development |
| `npm run tobii` | `py gaze/tobii_gaze.py --ws ...` | Tobii bridge only (WebSocket on `12346`) |
| `npm run kiosk` | `chrome --app=…/session/` | opens Chrome in app mode only (server already running) |

During development: code assets (HTML/JS/CSS/JSON) and video are served from disk with
`Cache-Control: no-store`, so to see changes just **reload the page** in the browser; only
changes to `server.js` require a restart, handled automatically by `npm run dev`.

**Images and fonts are cached** (`Cache-Control: public, max-age=3600`) on purpose: the
caption re-renders re-create the `<img>` elements many times per second, and with
`no-store` the ~3000 mapped images (hundreds of KB each) were re-downloaded on every
render, making the `Parole + immagini` mode crawl. Consequence: after replacing an image
file, force a **hard reload** (`Ctrl+Shift+R`) to bypass the cache. On the client side the
word→image match uses a prebuilt normalized lookup (rebuilt only when the word list
changes) instead of re-scanning all entries per token.

### Environment variables

Set these before `npm start` (PowerShell: `$env:PORT = "8080"`).

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `12345` | HTTP server port (`server.js` / `launch.js`) |
| `TOBII_PORT` | `12346` | Tobii bridge WebSocket port (`launch.js`) |
| `FAVOLA_PYTHON` | `py` (Windows) / `python3` | Python interpreter used to spawn the Tobii bridge from `launch.js` |
| `FAVOLA_TOBII_CALIB_EXE` | auto-detected | Full path to the Tobii calibration executable (see [Tobii calibration](#tobii-calibration)) |
| `FAVOLA_TOBII_CALIB_ARGS` | — | Extra space-separated args passed to that executable |

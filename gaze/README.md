# gaze / tobii_gaze.py

A lightweight Python bridge that reads gaze data from the **Tobii Eye Tracker 5** on Windows and either saves it as CSV, streams it over a local WebSocket, or both. The session module (`session/index.html`) consumes the WebSocket stream to drive its on-screen gaze indicator.

No Tobii Pro SDK, no GazeServer middleware: the script loads `tobii_stream_engine.dll` (already installed by Tobii Experience) directly via `ctypes`.

---

## Requirements

### Hardware
- Tobii Eye Tracker 5, connected via USB.

### Software
- Windows 10 or 11 (64-bit).
- Python 3.8+ (64-bit).
- **Tobii Experience** installed, running, and calibrated.
  - Download from [gaming.tobii.com/getstarted](https://gaming.tobii.com/getstarted/) → select "Tobii Eye Tracker 5".
  - Calibrate through Tobii Experience before recording.

### Python packages
- `websockets` (only required when using `--ws`): `pip install websockets`.
- Everything else is in the standard library.

The script looks for the DLL at:
```
C:\Program Files\Tobii\Tobii EyeX\tobii_stream_engine.dll
```
If your installation path differs, update `DLL_PATH` at the top of `tobii_gaze.py`.

---

## Usage

### Live streaming for the session module (recommended)
```powershell
python gaze\tobii_gaze.py --ws --no-csv
```
Then open `session/index.html`. The Tobii status pill turns green when connected and the red dot follows the user's gaze in real time.

### Live streaming + CSV backup
```powershell
python gaze\tobii_gaze.py --ws
```

### CSV only (no WebSocket)
```powershell
python gaze\tobii_gaze.py
```

### Useful options
- `--duration N` — stop after N seconds (default: run until Ctrl+C).
- `--out FILE.csv` — custom CSV filename (default: timestamped name).
- `--ws-port N` — WebSocket port (default 8765).
- `--width N` / `--height N` — override screen resolution if auto-detection is wrong.

---

## WebSocket protocol

When `--ws` is enabled, the server accepts connections on `ws://127.0.0.1:<port>/` and broadcasts one JSON message per valid gaze sample:

```json
{"type":"gaze","ts":1716123456789,"x":0.5123,"y":0.4781,"valid":true}
```

| Field | Type | Description |
|---|---|---|
| `type` | string | Always `"gaze"`. Reserved for future message kinds. |
| `ts` | int | Tobii timestamp in **milliseconds** (derived from the native microsecond clock). |
| `x` | float | Horizontal gaze position, **normalized** `[0, 1]` from the left edge of the display. |
| `y` | float | Vertical gaze position, **normalized** `[0, 1]` from the top edge of the display. |
| `valid` | bool | Always `true` in broadcast messages (invalid samples are filtered out upstream). |

Invalid samples (blinks, tracking loss) are silently dropped before broadcast — the JS client never sees them.

---

## CSV output format

When CSV is enabled (default unless `--no-csv`), the script writes:

| Column | Type | Description |
|---|---|---|
| `timestamp_us` | int | Tobii's internal clock in microseconds. Use this for precise synchronisation with other streams. |
| `x_px` | float | Horizontal gaze position in **pixels** (normalized x × screen width). |
| `y_px` | float | Vertical gaze position in **pixels** (normalized y × screen height). |

Values slightly outside the screen bounds (negative, or greater than the resolution) are normal near the screen edges and are not clipped.

Sample rate is approximately **33 Hz** on the ET5.

---

## How it works

1. **DLL loading** — `tobii_stream_engine.dll` is loaded via `ctypes.CDLL`.
2. **API initialisation** — the Stream Engine API is created and the local ET5 is enumerated and opened.
3. **Gaze subscription** — a C-compatible callback is registered with `tobii_gaze_point_subscribe`. The tracker fires it for every new sample (~33 Hz).
4. **Per-sample fan-out** — inside the callback, valid samples are pushed to a CSV buffer and/or broadcast to all connected WebSocket clients (depending on the active mode).
5. **WebSocket server** — when `--ws` is set, an asyncio-based `websockets` server runs on a background thread. Broadcasts are scheduled across thread boundaries with `asyncio.run_coroutine_threadsafe`.
6. **Shutdown** — on Ctrl+C (or when `--duration` elapses), the subscription is cancelled, the device and API are destroyed, and the CSV is written if enabled.

---

## Troubleshooting

**`OSError: [WinError 193] %1 is not a valid Win32 application`**
The DLL at `DLL_PATH` is 32-bit but your Python is 64-bit. Make sure the DLL is the one installed by Tobii Experience in `C:\Program Files\Tobii\Tobii EyeX\`.

**`RuntimeError: No Tobii device found`**
- Confirm the ET5 is connected via USB.
- Make sure Tobii Experience is running in the background.
- Unplug and replug the device.

**Recording saves 0 samples / WebSocket sends nothing**
- Sit within range of the tracker (40–80 cm from the screen).
- Confirm calibration in Tobii Experience (the gaze dot in the app should follow your eyes).
- Inspect raw validity values by adding a `print` inside `gaze_cb`:
  ```python
  print(f"validity={gp.validity}  x={gp.position_xy[0]:.4f}  y={gp.position_xy[1]:.4f}")
  ```

**`Module 'websockets' is not installed`**
Run `pip install websockets`.

---

## Validity filtering

The script keeps only samples with `validity == 1` (valid). Samples with any other validity value (blinks, tracker loss, off-screen) are dropped both from CSV output and WebSocket broadcasts.

---

## Coordinate system notes

The session module assumes the **browser window covers the same display the Tobii is calibrated against**, so it maps the normalized gaze `(x, y)` directly to `window.innerWidth/innerHeight`. On a fullscreen browser (`F11`) on the primary display, this is accurate without further calibration. A 4-point calibration step in the session UI is planned for setups that don't satisfy this assumption.

---

## Limitations and legal notice

The Tobii Eye Tracker 5 is sold for interaction purposes only. Using it for research or analytical purposes may require a separate licence under Tobii's licence agreement. Review [developer.tobii.com/license-agreement](https://developer.tobii.com/license-agreement/) before using this script in a research context.

This script does not bundle or redistribute any Tobii intellectual property. It only loads `tobii_stream_engine.dll` already present on the machine as part of Tobii Experience.

---

## Acknowledgements

- [betaboon/python-tobii-stream-engine](https://github.com/betaboon/python-tobii-stream-engine) — Linux CFFI wrapper that documented the Stream Engine API approach.
- [JamesQFreeman/PyEyetracker](https://github.com/JamesQFreeman/PyEyetracker) — Windows reference that confirmed ET5 + Stream Engine compatibility.
- [GazePlay/TobiiStreamEngineForJava](https://github.com/GazePlay/TobiiStreamEngineForJava) — Java wrapper confirming ET5 + Stream Engine on Windows.

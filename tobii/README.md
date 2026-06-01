# tobii_gaze.py

A lightweight Python script to record gaze data from the **Tobii Eye Tracker 5** on Windows, without the official Tobii Pro SDK or GazeServer. It communicates directly with the tracker via `tobii_stream_engine.dll`, giving you a per-sample callback with Tobii's own microsecond timestamps and normalized screen coordinates.

---

## Background

The Tobii Eye Tracker 5 (ET5) is a consumer-grade device not officially supported by Tobii's Python SDK (`tobii_research`), which is reserved for Pro research devices. The only SDKs that officially support the ET5 use C, C++, or C#.

This script works around that limitation by loading `tobii_stream_engine.dll` — the native Windows driver library installed by **Tobii Experience** — directly via Python's `ctypes` module. No third-party packages, no GazeServer middleware, no 32-bit Python workarounds.

---

## Requirements

### Hardware
- Tobii Eye Tracker 5, connected via USB

### Software
- Windows 10 or 11 (64-bit)
- Python 3.8+ (64-bit)
- **Tobii Experience** installed and running (provides the driver and `tobii_stream_engine.dll`)
  - Download from [gaming.tobii.com/getstarted](https://gaming.tobii.com/getstarted/) → select "Tobii Eye Tracker 5" → Download Driver
  - Calibrate your tracker through Tobii Experience before recording

### Python packages
None required beyond the standard library. `ctypes` is built into Python.

---

## Installation

1. Clone or download this repository.
2. Confirm that Tobii Experience is installed. The script looks for the DLL at:
   ```
   C:\Program Files\Tobii\Tobii EyeX\tobii_stream_engine.dll
   ```
   If your installation path differs, update the `DLL_PATH` variable at the top of `tobii_gaze.py`.

3. Make sure your ET5 is plugged in and calibrated via Tobii Experience before running.

---

## Usage

### Basic recording (runs until Ctrl+C)
```bash
python tobii_gaze.py
```

### Record for a fixed duration
```bash
python tobii_gaze.py --duration 60
```

### Custom output filename
```bash
python tobii_gaze.py --out participant_01.csv
```

### Manual screen resolution (if auto-detection fails)
```bash
python tobii_gaze.py --width 2560 --height 1440
```

### All options combined
```bash
python tobii_gaze.py --duration 30 --out session_01.csv --width 1920 --height 1200
```

By default the output filename is auto-generated with a timestamp, e.g. `gaze_20260529_163224.csv`.

---

## Output format

The script saves a CSV file with three columns:

| Column | Type | Description |
|---|---|---|
| `timestamp_us` | integer | Tobii's internal clock in **microseconds**. Use this for precise temporal analysis and synchronisation with other data streams. |
| `x_px` | float | Horizontal gaze position in **pixels**, measured from the left edge of the screen. |
| `y_px` | float | Vertical gaze position in **pixels**, measured from the top edge of the screen. |

Example output:
```
timestamp_us,x_px,y_px
23449301760,949.02,1137.04
23449331816,950.42,1132.23
23449362088,938.02,1125.09
```

### Notes on coordinates
- Coordinates are derived from normalized values (0.0–1.0) returned by the tracker, multiplied by your screen resolution.
- Values slightly outside the screen bounds (e.g. negative or greater than screen width/height) are normal and occur when the participant looks near the edges of the display. Invalid samples (e.g. blinks, tracker loss) are filtered out and not saved.
- Sample rate is approximately 33 Hz on the ET5.

---

## How it works

1. **DLL loading** — `tobii_stream_engine.dll` is loaded via `ctypes.CDLL`. This is the same library Tobii Experience uses to communicate with the ET5 hardware.
2. **API initialisation** — the Tobii Stream Engine API is created and the local device is enumerated and connected to.
3. **Gaze subscription** — a C-compatible callback function is registered with `tobii_gaze_point_subscribe`. The tracker fires this callback for every new sample (~33 times per second).
4. **Main loop** — `tobii_wait_for_callbacks` and `tobii_device_process_callbacks` are called in a tight loop to process incoming samples. Each valid sample is appended to an in-memory list.
5. **Shutdown** — on Ctrl+C (or when the duration elapses), the subscription is cancelled, the device and API are destroyed cleanly, and all recorded samples are written to CSV.

---

## Validity filtering

This script filters out invalid gaze samples before saving. In the version of `tobii_stream_engine.dll` shipped with Tobii Experience for the ET5, a validity value of `1` indicates a **valid** sample; `0` indicates invalid (e.g. blink or tracking loss). Samples with validity `!= 1` are silently discarded.

---

## Troubleshooting

**`OSError: [WinError 193] %1 is not a valid Win32 application`**
The DLL at the specified path is 32-bit but your Python is 64-bit. Make sure you are using the DLL from `C:\Program Files\Tobii\Tobii EyeX\`, not the one bundled with PyEyetracker (which is 32-bit).

**`RuntimeError: No Tobii device found`**
- Check that the ET5 is connected via USB.
- Make sure Tobii Experience is running in the background.
- Try unplugging and replugging the device.

**Recording saves 0 samples**
- Sit within range of the tracker (40–80 cm from screen).
- Confirm the tracker is calibrated in Tobii Experience (the gaze dot should follow your eyes in the app).
- Run the debug snippet below to inspect raw validity and coordinate values:
  ```python
  def gaze_cb(gaze_point_ptr, _):
      gp = gaze_point_ptr.contents
      print(f"validity={gp.validity}  x={gp.position_xy[0]:.4f}  y={gp.position_xy[1]:.4f}")
  ```

---

## Limitations and legal notice

The Tobii Eye Tracker 5 is sold for interaction purposes only. Using it for research or analytical purposes may require a separate licence under Tobii's licence agreement. Please review [developer.tobii.com/license-agreement](https://developer.tobii.com/license-agreement/) before using this script in a research context.

This script does not include or redistribute any Tobii intellectual property. It relies solely on `tobii_stream_engine.dll` already present on your machine as part of Tobii Experience.

---

## Acknowledgements

- [betaboon/python-tobii-stream-engine](https://github.com/betaboon/python-tobii-stream-engine) — Linux CFFI wrapper that documented the Stream Engine API approach
- [JamesQFreeman/PyEyetracker](https://github.com/JamesQFreeman/PyEyetracker) — Windows Python interface that confirmed ET5 compatibility and provided the bundled DLL for architecture testing
- [GazePlay/TobiiStreamEngineForJava](https://github.com/GazePlay/TobiiStreamEngineForJava) — Java wrapper confirming ET5 + Stream Engine works on Windows
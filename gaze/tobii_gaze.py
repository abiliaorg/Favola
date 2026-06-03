"""
Tobii Eye Tracker 5 - Direct gaze recorder
Uses tobii_stream_engine.dll via ctypes (no GazeServer needed).

Usage:
    python tobii_gaze.py                  # records until Ctrl+C, saves to gaze_data.csv
    python tobii_gaze.py --duration 30    # records for 30 seconds then stops
    python tobii_gaze.py --out my_file.csv --width 2560 --height 1440

Requirements:
    pip install pywin32     # only if you want auto screen resolution detection
"""

import ctypes
import ctypes.util
import csv
import time
import signal
import sys
import argparse
import os
import json
import asyncio
import threading
from datetime import datetime

try:
    import websockets
    WEBSOCKETS_AVAILABLE = True
except ImportError:
    WEBSOCKETS_AVAILABLE = False

# ── DLL path ────────────────────────────────────────────────────────────────

DLL_PATH = r"C:\Program Files\Tobii\Tobii EyeX\tobii_stream_engine.dll"
# ── Tobii Stream Engine structs & constants ──────────────────────────────────

TOBII_ERROR_NO_ERROR         = 0
TOBII_LOG_LEVEL_ERROR        = 0
TOBII_FIELD_OF_USE_INTERACTIVE = 1  # required for consumer devices

class TobiiVersion(ctypes.Structure):
    _fields_ = [
        ("major", ctypes.c_uint32),
        ("minor", ctypes.c_uint32),
        ("revision", ctypes.c_uint32),
        ("build", ctypes.c_uint32),
    ]

class TobiiGazePoint(ctypes.Structure):
    _fields_ = [
        ("timestamp_us", ctypes.c_int64),
        ("validity",     ctypes.c_int32),   # 0 = valid, 1 = invalid
        ("position_xy",  ctypes.c_float * 2),
    ]

# Callback types
URL_RECEIVER_CB   = ctypes.CFUNCTYPE(None, ctypes.c_char_p, ctypes.c_void_p)
GAZE_POINT_CB     = ctypes.CFUNCTYPE(None, ctypes.POINTER(TobiiGazePoint), ctypes.c_void_p)

# ── Load DLL ─────────────────────────────────────────────────────────────────

def load_dll(path):
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"DLL not found at: {path}\n"
            f"Edit DLL_PATH at the top of this script."
        )
    dll = ctypes.CDLL(path)

    # tobii_get_api_version
    dll.tobii_get_api_version.argtypes = [ctypes.POINTER(TobiiVersion)]
    dll.tobii_get_api_version.restype  = ctypes.c_int

    # tobii_api_create
    dll.tobii_api_create.argtypes = [
        ctypes.POINTER(ctypes.c_void_p),  # api out
        ctypes.c_void_p,                  # custom_alloc (NULL)
        ctypes.c_void_p,                  # custom_log   (NULL)
    ]
    dll.tobii_api_create.restype = ctypes.c_int

    # tobii_api_destroy
    dll.tobii_api_destroy.argtypes = [ctypes.c_void_p]
    dll.tobii_api_destroy.restype  = ctypes.c_int

    # tobii_enumerate_local_device_urls
    dll.tobii_enumerate_local_device_urls.argtypes = [
        ctypes.c_void_p,   # api
        URL_RECEIVER_CB,   # callback
        ctypes.c_void_p,   # user_data
    ]
    dll.tobii_enumerate_local_device_urls.restype = ctypes.c_int

    # tobii_device_create
    dll.tobii_device_create.argtypes = [
        ctypes.c_void_p,              # api
        ctypes.c_char_p,              # url
        ctypes.c_int,                 # field_of_use
        ctypes.POINTER(ctypes.c_void_p),  # device out
    ]
    dll.tobii_device_create.restype = ctypes.c_int

    # tobii_device_destroy
    dll.tobii_device_destroy.argtypes = [ctypes.c_void_p]
    dll.tobii_device_destroy.restype  = ctypes.c_int

    # tobii_gaze_point_subscribe
    dll.tobii_gaze_point_subscribe.argtypes = [
        ctypes.c_void_p,   # device
        GAZE_POINT_CB,     # callback
        ctypes.c_void_p,   # user_data
    ]
    dll.tobii_gaze_point_subscribe.restype = ctypes.c_int

    # tobii_gaze_point_unsubscribe
    dll.tobii_gaze_point_unsubscribe.argtypes = [ctypes.c_void_p]
    dll.tobii_gaze_point_unsubscribe.restype  = ctypes.c_int

    # tobii_wait_for_callbacks
    dll.tobii_wait_for_callbacks.argtypes = [
        ctypes.c_int,                 # device_count
        ctypes.POINTER(ctypes.c_void_p),  # devices array
    ]
    dll.tobii_wait_for_callbacks.restype = ctypes.c_int

    # tobii_device_process_callbacks
    dll.tobii_device_process_callbacks.argtypes = [ctypes.c_void_p]
    dll.tobii_device_process_callbacks.restype  = ctypes.c_int

    return dll


# ── WebSocket broadcast ──────────────────────────────────────────────────────
# Bridge protocol expected by session/assets/index.js:
#   {"type":"gaze","ts":<ms>,"x":<0..1>,"y":<0..1>,"valid":true}
# x,y are display-normalized with top-left origin (same as Tobii).

_ws_clients = set()
_ws_loop = None

async def _ws_handler(ws):
    _ws_clients.add(ws)
    try:
        async for _ in ws:
            pass
    except Exception:
        pass
    finally:
        _ws_clients.discard(ws)

async def _ws_server_main(host, port):
    global _ws_loop
    _ws_loop = asyncio.get_running_loop()
    async with websockets.serve(_ws_handler, host, port):
        print(f"WebSocket server listening on ws://{host}:{port}/")
        await asyncio.Future()

def start_ws_server(host="127.0.0.1", port=8765):
    if not WEBSOCKETS_AVAILABLE:
        raise RuntimeError(
            "Module 'websockets' is not installed. Run: pip install websockets"
        )
    t = threading.Thread(
        target=lambda: asyncio.run(_ws_server_main(host, port)),
        daemon=True,
    )
    t.start()
    # short wait so the event loop has time to register itself
    for _ in range(50):
        if _ws_loop is not None:
            break
        time.sleep(0.02)
    return t

def ws_broadcast(payload_dict):
    if not _ws_clients or _ws_loop is None:
        return
    payload = json.dumps(payload_dict, separators=(",", ":"))

    async def _send():
        if not _ws_clients:
            return
        dead = []
        for c in list(_ws_clients):
            try:
                await c.send(payload)
            except Exception:
                dead.append(c)
        for d in dead:
            _ws_clients.discard(d)

    try:
        asyncio.run_coroutine_threadsafe(_send(), _ws_loop)
    except Exception:
        pass


# ── Main recorder ─────────────────────────────────────────────────────────────

def get_screen_resolution():
    """Try to detect screen resolution automatically on Windows."""
    try:
        import ctypes as _ct
        user32 = _ct.windll.user32
        w = user32.GetSystemMetrics(0)
        h = user32.GetSystemMetrics(1)
        if w > 0 and h > 0:
            return w, h
    except Exception:
        pass
    return None, None


def record(duration_s=None, out_path="gaze_data.csv", screen_w=None, screen_h=None,
           ws_enabled=False, ws_port=8765, csv_enabled=True):
    # Auto-detect screen resolution if not provided
    if screen_w is None or screen_h is None:
        auto_w, auto_h = get_screen_resolution()
        screen_w = screen_w or auto_w or 1920
        screen_h = screen_h or auto_h or 1080
        print(f"Screen resolution: {screen_w}x{screen_h}")

    if ws_enabled:
        start_ws_server("127.0.0.1", ws_port)

    dll = load_dll(DLL_PATH)

    # Print API version
    ver = TobiiVersion()
    dll.tobii_get_api_version(ctypes.byref(ver))
    print(f"Tobii Stream Engine v{ver.major}.{ver.minor}.{ver.revision}.{ver.build}")

    # Create API
    api = ctypes.c_void_p()
    rc = dll.tobii_api_create(ctypes.byref(api), None, None)
    if rc != TOBII_ERROR_NO_ERROR:
        raise RuntimeError(f"tobii_api_create failed: {rc}")

    # Enumerate devices
    device_urls = []
    def url_cb(url, _):
        device_urls.append(url.decode())
    cb_url = URL_RECEIVER_CB(url_cb)
    dll.tobii_enumerate_local_device_urls(api, cb_url, None)

    if not device_urls:
        dll.tobii_api_destroy(api)
        raise RuntimeError("No Tobii device found. Is the ET5 plugged in and Tobii Experience running?")

    print(f"Found device: {device_urls[0]}")

    # Create device
    device = ctypes.c_void_p()
    rc = dll.tobii_device_create(
        api,
        device_urls[0].encode(),
        TOBII_FIELD_OF_USE_INTERACTIVE,
        ctypes.byref(device)
    )
    if rc != TOBII_ERROR_NO_ERROR:
        dll.tobii_api_destroy(api)
        raise RuntimeError(f"tobii_device_create failed: {rc}")

    # Gaze data buffer
    records = []

    def gaze_cb(gaze_point_ptr, _):
        gp = gaze_point_ptr.contents
        x = gp.position_xy[0]
        y = gp.position_xy[1]
        # validity=1 means VALID in this DLL version
        if gp.validity != 1:
            return
        if ws_enabled:
            ws_broadcast({
                "type": "gaze",
                "ts": gp.timestamp_us // 1000,
                "x": float(x),
                "y": float(y),
                "valid": True,
            })
        if csv_enabled:
            x_px = x * screen_w
            y_px = y * screen_h
            records.append((gp.timestamp_us, round(x_px, 2), round(y_px, 2)))
    cb_gaze = GAZE_POINT_CB(gaze_cb)
    rc = dll.tobii_gaze_point_subscribe(device, cb_gaze, None)
    if rc != TOBII_ERROR_NO_ERROR:
        dll.tobii_device_destroy(device)
        dll.tobii_api_destroy(api)
        raise RuntimeError(f"tobii_gaze_point_subscribe failed: {rc}")

    # Setup stop signal
    stop = [False]
    def on_sigint(sig, frame):
        print("\nStopping...")
        stop[0] = True
    signal.signal(signal.SIGINT, on_sigint)

    print(f"Recording gaze data... {'for ' + str(duration_s) + 's' if duration_s else 'press Ctrl+C to stop'}")
    start_time = time.time()

    devices_arr = (ctypes.c_void_p * 1)(device)

    # Main loop
    while not stop[0]:
        if duration_s and (time.time() - start_time) >= duration_s:
            break
        dll.tobii_wait_for_callbacks(1, devices_arr)
        dll.tobii_device_process_callbacks(device)

    # Cleanup
    dll.tobii_gaze_point_unsubscribe(device)
    dll.tobii_device_destroy(device)
    dll.tobii_api_destroy(api)

    # Save CSV
    if csv_enabled:
        print(f"Saving {len(records)} samples to {out_path}...")
        with open(out_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["timestamp_us", "x_px", "y_px"])
            writer.writerows(records)
        print(f"Done. {len(records)} gaze samples saved to: {out_path}")
    else:
        print(f"CSV disabled. {len(records)} samples not written.")
    if records:
        duration_actual = (records[-1][0] - records[0][0]) / 1_000_000
        hz = len(records) / duration_actual if duration_actual > 0 else 0
        print(f"Recording duration: {duration_actual:.2f}s  |  Avg sample rate: {hz:.1f} Hz")


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Record Tobii ET5 gaze data to CSV.")
    parser.add_argument("--duration", type=float, default=None,
                        help="Recording duration in seconds (default: run until Ctrl+C)")
    parser.add_argument("--out", type=str,
                        default=f"gaze_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
                        help="Output CSV filename")
    parser.add_argument("--width",  type=int, default=None, help="Screen width in pixels")
    parser.add_argument("--height", type=int, default=None, help="Screen height in pixels")
    parser.add_argument("--ws", action="store_true",
                        help="Start a WebSocket server and stream gaze live (consumed by the session module)")
    parser.add_argument("--ws-port", type=int, default=8765, help="WebSocket server port (default 8765)")
    parser.add_argument("--no-csv", action="store_true",
                        help="Do not save the final CSV (useful for WS-only mode)")
    args = parser.parse_args()

    record(
        duration_s=args.duration,
        out_path=args.out,
        screen_w=args.width,
        screen_h=args.height,
        ws_enabled=args.ws,
        ws_port=args.ws_port,
        csv_enabled=not args.no_csv,
    )

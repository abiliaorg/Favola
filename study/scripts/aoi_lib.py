# -*- coding: utf-8 -*-
"""Core AOI condiviso (porting fedele di web/analysis/assets/index.js).

Usato da aoi_engine.py (aggregati per registrazione) e question_gaze.py
(analisi puntuale per domanda). Parametri da study/aoi_params.json.
"""
import json
from bisect import bisect_right
from pathlib import Path

STUDY = Path(__file__).resolve().parent.parent
ROOT = STUDY.parent
RECORD = ROOT / "data" / "01_record"

VID_W, VID_H = 1920, 1080  # dimensione intrinseca di tutti i video (verificata con ffprobe)

_params = json.loads((STUDY / "aoi_params.json").read_text(encoding="utf-8"))
ALPHA = _params["alphaByCat"]
USE_CAL = bool(_params.get("calibration", True))
GAZE_DY = float(_params.get("gazePointerDyPx", 0))

EN2IT = {"fox": "volpe e boscaiolo", "carpet": "tappeto", "cats": "gatta", "yawn": "sbadiglio",
         "dolphin": "delfino", "panda": "panda", "bear": "orso", "eels": "anguille"}

# ---------- calibrazione ----------

def fit_axis_linear(ms, ts):
    n = len(ms)
    if n == 0:
        return (1.0, 0.0)
    mm = sum(ms) / n
    mt = sum(ts) / n
    num = sum((m - mm) * (t - mt) for m, t in zip(ms, ts))
    den = sum((m - mm) ** 2 for m in ms)
    if n < 2 or den < 1e-6:
        return (1.0, mt - mm)
    a = num / den
    return (a, mt - a * mm)

def compute_calibration(cal):
    if not cal or not isinstance(cal.get("points"), list):
        return None
    pts = [p for p in cal["points"] if p and p.get("measured") and p.get("target")]
    if len(pts) == 1:
        p = pts[0]
        return ((1.0, p["target"]["x"] - p["measured"]["x"]),
                (1.0, p["target"]["y"] - p["measured"]["y"]))
    if len(pts) < 2:
        return None
    cx = fit_axis_linear([p["measured"]["x"] for p in pts], [p["target"]["x"] for p in pts])
    cy = fit_axis_linear([p["measured"]["y"] for p in pts], [p["target"]["y"] for p in pts])
    return (cx, cy)

# ---------- geometria ----------

def gaze_to_fraction(gx, gy, sess_w, sess_h, cal):
    s = min(sess_w / VID_W, sess_h / VID_H)
    sw, sh = VID_W * s, VID_H * s
    if sw <= 0 or sh <= 0:
        return None
    if USE_CAL and cal:
        (ax, bx), (ay, by) = cal
        gx = ax * gx + bx
        gy = ay * gy + by
    return (gx / sw, (gy + GAZE_DY) / sh)

def box_to_fraction(box, rec_w, rec_h):
    if not box or not rec_w or not rec_h:
        return None
    denom_h = rec_w * VID_H / VID_W
    return (box["x"] / rec_w, box["y"] / denom_h, box["w"] / rec_w, box["h"] / denom_h)

def apply_alpha(frac, cat):
    a = ALPHA.get(cat, {"w": 1.0, "h": 1.0, "dx": 0.0, "dy": 0.0})
    x, y, w, h = frac
    if a["w"] != 1 or a["h"] != 1:
        cx, cy = x + w / 2, y + h / 2
        w, h = w * a["w"], h * a["h"]
        x, y = cx - w / 2, cy - h / 2
    return (x + a["dx"], y + a["dy"], w, h)

def in_box(px, py, b):
    return b[0] <= px <= b[0] + b[2] and b[1] <= py <= b[1] + b[3]

# ---------- tracking per storia (cache) ----------

_tracking_cache = {}

def load_tracking(cls, story, typ):
    key = (cls, story, typ)
    if key in _tracking_cache:
        return _tracking_cache[key]
    d = json.loads((RECORD / f"{cls}_{story}_{typ}.json").read_text(encoding="utf-8"))
    vp = d.get("viewport") or {"width": 1920, "height": 1024}
    words = sorted(d.get("textUpdateSnapshots") or [], key=lambda s: float(s["videoTime"]))
    faces = sorted(d.get("faceTrackingSnapshots") or [], key=lambda s: float(s["videoTime"]))
    meta = d.get("wordMetaById") or {}
    wtimes = [float(s["videoTime"]) for s in words]
    ftimes = [float(s["videoTime"]) for s in faces]

    word_boxes = []
    for snap in words:
        svp = snap.get("viewport") or vp
        entries = []
        for e in snap.get("entries") or []:
            frac = box_to_fraction(e.get("location"), svp.get("width"), svp.get("height"))
            if not frac:
                continue
            m = meta.get(str(e["wordAutoIncrementalId"])) or {}
            sub = "image" if m.get("image") else "word"
            acat = "image" if sub == "image" else "text"
            entries.append((apply_alpha(frac, acat), sub, str(e["wordAutoIncrementalId"]), m.get("word", "")))
        word_boxes.append(entries)

    face_boxes = []
    for snap in faces:
        svp = snap.get("viewport") or vp
        boxes = snap.get("boxes") or {}
        parts = []
        for part in ("face", "mouth", "nose", "eyeLeft", "eyeRight"):
            frac = box_to_fraction(boxes.get(part), svp.get("width"), svp.get("height"))
            if frac:
                parts.append((apply_alpha(frac, part), part))
        face_boxes.append(parts)

    top = None
    for snap in words:
        svp = snap.get("viewport") or vp
        for e in snap.get("entries") or []:
            frac = box_to_fraction(e.get("location"), svp.get("width"), svp.get("height"))
            if frac and (top is None or frac[1] < top):
                top = frac[1]
    band = (0.0, top, 1.0, max(0.0, 1.0 - top)) if top is not None else None

    tr = {"wtimes": wtimes, "word_boxes": word_boxes,
          "ftimes": ftimes, "face_boxes": face_boxes,
          "band": band, "meta": meta}
    _tracking_cache[key] = tr
    return tr

def at_or_before(times, t):
    return bisect_right(times, t) - 1  # -1 se nessuno

# ---------- categorizzazione ----------

def categorize(gf, t, tr):
    """Ritorna (primary, sub, word_id) con le priorità del tool web."""
    if gf is None:
        return ("none", "none", None)
    px, py = gf
    hits = []

    wi = at_or_before(tr["wtimes"], t)
    if tr["word_boxes"]:
        for box, sub, wid, _w in tr["word_boxes"][max(wi, 0)]:
            if in_box(px, py, box):
                hits.append(("caption", sub, wid))
    if not hits and tr["band"] and in_box(px, py, tr["band"]):
        hits.append(("caption", "none", None))

    if tr["face_boxes"]:
        fi = at_or_before(tr["ftimes"], t)
        for box, part in tr["face_boxes"][max(fi, 0)]:
            if in_box(px, py, box):
                hits.append(("face", part, None))

    if not hits:
        return ("none", "none", None)
    chosen = (next((h for h in hits if h[0] == "caption" and h[2] is not None), None)
              or next((h for h in hits if h[0] == "face" and h[1] != "face"), None)
              or next((h for h in hits if h[0] == "face"), None)
              or hits[0])
    return chosen

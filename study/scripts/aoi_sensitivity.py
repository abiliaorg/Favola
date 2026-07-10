# -*- coding: utf-8 -*-
"""E15: sensitivity dei risultati AOI ai parametri alpha.
Ricalcola lo shift caption/volto (I-25) con i box NON trasformati (alpha=1,
nessun offset) e confronta con i parametri concordati."""
import json
import re
from pathlib import Path

import aoi_lib
from aoi_lib import EN2IT, categorize, compute_calibration, gaze_to_fraction, load_tracking

STUDY = Path(__file__).resolve().parent.parent
GAZE = STUDY.parent / "data" / "02_gaze"
MAPPING = json.loads((STUDY / "mappatura_soggetti.json").read_text(encoding="utf-8"))["mapping"]

def mean(xs): return sum(xs) / len(xs) if xs else float("nan")
def sd(xs):
    if len(xs) < 2: return float("nan")
    m = mean(xs)
    return (sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) ** 0.5
def tstat(xs): return mean(xs) / (sd(xs) / len(xs) ** 0.5) if len(xs) > 1 and sd(xs) > 0 else float("nan")

def run_pass(label):
    aoi_lib._tracking_cache.clear()
    per_rec = {}
    for folder in sorted(GAZE.iterdir()):
        if not folder.is_dir() or not folder.name.startswith("data_"):
            continue
        for f in sorted(folder.glob("*.json")):
            d = json.loads(f.read_text(encoding="utf-8"))
            pid = str(d.get("participantId", "")).strip("`").strip().upper()
            if pid not in MAPPING or d.get("story") not in EN2IT:
                continue
            tr = load_tracking(str(d.get("class")), d["story"], d["typology"])
            vp = d.get("viewport") or {}
            cal = compute_calibration(d.get("calibration"))
            samples = d.get("samples") or []
            if not samples:
                continue
            cnt = {"caption": 0, "face": 0, "none": 0}
            for s in samples:
                g = s.get("gaze")
                gf = gaze_to_fraction(g["x"], g["y"], vp.get("width"), vp.get("height"), cal) if g else None
                cat, _, _ = categorize(gf, float(s["t"]), tr)
                cnt[cat] += 1
            n = len(samples)
            per_rec[(MAPPING[pid], d["typology"])] = {k: v / n * 100 for k, v in cnt.items()}
    # shift appaiato
    bysub = {}
    for (nid, mod), v in per_rec.items():
        bysub.setdefault(nid, {})[mod] = v
    print(f"--- {label} ---")
    for mod in ("text", "images"):
        vs = [v for (nid, m), v in per_rec.items() if m == mod]
        print(f"  {mod:6}: caption={mean([v['caption'] for v in vs]):5.1f}%  "
              f"face={mean([v['face'] for v in vs]):5.1f}%  none={mean([v['none'] for v in vs]):5.1f}%")
    for met in ("caption", "face"):
        dd = [v["images"][met] - v["text"][met] for v in bysub.values() if "text" in v and "images" in v]
        print(f"  shift {met:7} (images-text, appaiato): {mean(dd):+.1f} pt  t={tstat(dd):+.2f}  (n={len(dd)})")

print("=== E15) Sensitivity dei risultati AOI ai parametri alpha ===")
run_pass("parametri concordati (aoi_params.json)")
aoi_lib.ALPHA = {k: {"w": 1.0, "h": 1.0, "dx": 0.0, "dy": 0.0} for k in aoi_lib.ALPHA}
run_pass("alpha di default (box originali, nessun ingrandimento)")

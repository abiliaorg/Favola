# -*- coding: utf-8 -*-
"""Analisi A1-A4 (dinamica temporale) e B5 (livello parola).

A1 time-course: quota AOI per quartile del video, text vs images.
A2 latenza di aggancio: tempo tra prima comparsa di una parola e primo sguardo
   su di essa (solo parole guardate almeno una volta), image vs text word.
A3 switching: transizioni volto<->caption al minuto, per modalità.
A4 reading-along (solo text): correlazione tra posizione x dello sguardo e
   posizione x della parola più recente comparsa (proxy dell'inseguimento).
B5 ranking parole-immagine per dwell complessivo.

Output: study/timecourse.csv, study/word_gaze.csv + statistiche a video.
"""
import csv
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
def welch(a, b):
    if len(a) < 2 or len(b) < 2: return float("nan")
    return (mean(a) - mean(b)) / (sd(a) ** 2 / len(a) + sd(b) ** 2 / len(b)) ** 0.5
def pearson(xs, ys):
    n = len(xs)
    if n < 3: return float("nan")
    mx, my = mean(xs), mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = sum((x - mx) ** 2 for x in xs) ** 0.5
    dy = sum((y - my) ** 2 for y in ys) ** 0.5
    return num / (dx * dy) if dx > 0 and dy > 0 else float("nan")

# prima comparsa visiva (incluso interim: il box è già sullo schermo durante il
# riconoscimento) e ultima posizione nota di ogni parola
def word_appearances(cls, story_en, typ):
    d = json.loads((aoi_lib.RECORD / f"{cls}_{story_en}_{typ}.json").read_text(encoding="utf-8"))
    meta = d.get("wordMetaById") or {}
    first = {}   # wid -> (t_prima_comparsa, x_frac, y_frac)
    for snap in sorted(d.get("textUpdateSnapshots") or [], key=lambda s: float(s["videoTime"])):
        vp = snap.get("viewport") or d.get("viewport")
        denom_h = vp["width"] * aoi_lib.VID_H / aoi_lib.VID_W
        for e in snap.get("entries") or []:
            wid = str(e["wordAutoIncrementalId"])
            if wid in first:
                continue
            loc = e.get("location") or {}
            t = float(e.get("videoTime", snap.get("videoTime", 0)))
            fx = (loc.get("x", 0) + loc.get("w", 0) / 2) / vp["width"]
            fy = (loc.get("y", 0) + loc.get("h", 0) / 2) / denom_h
            first[wid] = (t, fx, fy)
    return first, meta

tc_rows, wg_rows = [], []
switch_stats, follow_stats = [], []

for folder in sorted(GAZE.iterdir()):
    if not folder.is_dir() or not folder.name.startswith("data_"):
        continue
    for f in sorted(folder.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        pid = str(d.get("participantId", "")).strip("`").strip().upper()
        if pid not in MAPPING:
            continue
        story_en = d.get("story")
        if story_en not in EN2IT:
            continue
        cls, typ = str(d.get("class")), d.get("typology")
        tr = load_tracking(cls, story_en, typ)
        vp = d.get("viewport") or {}
        cal = compute_calibration(d.get("calibration"))
        samples = d.get("samples") or []
        if not samples:
            continue
        dur = float(samples[-1]["t"])
        hz = len(samples) / dur if dur else 0
        good = hz >= 5 and dur >= 40

        cats = []
        for s in samples:
            g = s.get("gaze")
            gf = gaze_to_fraction(g["x"], g["y"], vp.get("width"), vp.get("height"), cal) if g else None
            t = float(s["t"])
            cats.append((t, gf, *categorize(gf, t, tr)))

        # A1: quartili
        for qt in range(4):
            t0, t1 = dur * qt / 4, dur * (qt + 1) / 4
            seg = [c for c in cats if t0 <= c[0] < t1]
            if not seg:
                continue
            n = len(seg)
            tc_rows.append({
                "newid": MAPPING[pid], "mod": typ, "storia": EN2IT[story_en], "good": good,
                "quartile": qt + 1,
                "pct_caption": sum(1 for c in seg if c[2] == "caption") / n * 100,
                "pct_face": sum(1 for c in seg if c[2] == "face") / n * 100,
                "pct_none": sum(1 for c in seg if c[2] == "none") / n * 100,
            })

        # A3: switching volto<->caption
        seq = [c[2] for c in cats if c[2] in ("caption", "face")]
        sw = sum(1 for a, b in zip(seq, seq[1:]) if a != b)
        if good and dur > 0:
            switch_stats.append({"newid": MAPPING[pid], "mod": typ, "per_min": sw / dur * 60})

        # A2+B5: prima occhiata e dwell per parola
        firsts, meta = word_appearances(cls, story_en, typ)
        hit_first, dwell = {}, {}
        for t, gf, cat, sub, wid in cats:
            if cat == "caption" and wid is not None:
                dwell[wid] = dwell.get(wid, 0) + 1
                if wid not in hit_first:
                    hit_first[wid] = t
        for wid, (t_app, fx, fy) in firsts.items():
            m = meta.get(wid) or {}
            lat = hit_first.get(wid)
            wg_rows.append({
                "newid": MAPPING[pid], "mod": typ, "storia": EN2IT[story_en], "good": good,
                "wid": wid, "word": m.get("word", ""), "is_image": int(bool(m.get("image"))),
                "t_appear": round(t_app, 2), "latency": round(lat - t_app, 2) if lat is not None else None,
                "dwell_n": dwell.get(wid, 0),
            })

        # A4: reading-along (solo text, solo good): quota dei campioni-caption in cui
        # lo sguardo è vicino (entro il 15% del frame) all'ultima parola comparsa
        if typ == "text" and good:
            wts = sorted(firsts.values())
            times = [t for t, _, _ in wts]
            import bisect
            near = tot = 0
            for t, gf, cat, sub, wid in cats:
                if cat != "caption" or gf is None:
                    continue
                i = bisect.bisect_right(times, t) - 1
                if i < 0:
                    continue
                tot += 1
                _, wx, wy = wts[i]
                if ((gf[0] - wx) ** 2 + (gf[1] - wy) ** 2) ** 0.5 <= 0.15:
                    near += 1
            if tot >= 30:
                follow_stats.append({"newid": MAPPING[pid], "storia": EN2IT[story_en],
                                     "r_follow": near / tot * 100, "n": tot})

# ---------- export ----------
with open(STUDY / "timecourse.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(tc_rows[0].keys()))
    w.writeheader(); [w.writerow(r) for r in tc_rows]
with open(STUDY / "word_gaze.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(wg_rows[0].keys()))
    w.writeheader(); [w.writerow(r) for r in wg_rows]
print(f"Salvati: timecourse.csv ({len(tc_rows)} righe), word_gaze.csv ({len(wg_rows)} righe)")

# ---------- statistiche ----------
print("\n=== A1) Time-course: % caption per quartile (solo good) ===")
for mod in ("text", "images"):
    line = f"  {mod:6}:"
    for qt in (1, 2, 3, 4):
        xs = [r["pct_caption"] for r in tc_rows if r["mod"] == mod and r["quartile"] == qt and r["good"]]
        line += f"  Q{qt}={mean(xs):5.1f}%"
    print(line)
print("  % volto per quartile:")
for mod in ("text", "images"):
    line = f"  {mod:6}:"
    for qt in (1, 2, 3, 4):
        xs = [r["pct_face"] for r in tc_rows if r["mod"] == mod and r["quartile"] == qt and r["good"]]
        line += f"  Q{qt}={mean(xs):5.1f}%"
    print(line)
# trend appaiato Q4-Q1 per bambino (caption, images)
for mod in ("text", "images"):
    byid = {}
    for r in tc_rows:
        if r["mod"] == mod and r["good"]:
            byid.setdefault(r["newid"], {})[r["quartile"]] = r["pct_caption"]
    dd = [v[4] - v[1] for v in byid.values() if 1 in v and 4 in v]
    print(f"  {mod}: caption Q4-Q1 entro bambino = {mean(dd):+.1f} pt (n={len(dd)}, t={tstat(dd):+.2f})")

print("\n=== A2) Latenza di aggancio prima occhiata (solo good, parole guardate) ===")
lat_img = [r["latency"] for r in wg_rows if r["good"] and r["latency"] is not None and r["is_image"]]
lat_txt = [r["latency"] for r in wg_rows if r["good"] and r["latency"] is not None and not r["is_image"]
           and r["mod"] == "images"]
lat_txt_t = [r["latency"] for r in wg_rows if r["good"] and r["latency"] is not None and r["mod"] == "text"]
print(f"  parole-immagine (images): n={len(lat_img):5}  mediana={sorted(lat_img)[len(lat_img)//2]:.2f}s  media={mean(lat_img):.2f}s")
print(f"  parole-testo   (images): n={len(lat_txt):5}  mediana={sorted(lat_txt)[len(lat_txt)//2]:.2f}s  media={mean(lat_txt):.2f}s")
print(f"  parole-testo   (text):   n={len(lat_txt_t):5}  mediana={sorted(lat_txt_t)[len(lat_txt_t)//2]:.2f}s  media={mean(lat_txt_t):.2f}s")
print(f"  t Welch immagine vs testo (in images): {welch(lat_img, lat_txt):+.2f}")
# quota di parole guardate almeno una volta
for lbl, cond in [("immagine/images", lambda r: r["is_image"] and r["mod"] == "images"),
                  ("testo/images", lambda r: not r["is_image"] and r["mod"] == "images"),
                  ("testo/text", lambda r: r["mod"] == "text")]:
    rs = [r for r in wg_rows if r["good"] and cond(r)]
    hit = sum(1 for r in rs if r["dwell_n"] > 0)
    print(f"  quota parole guardate ({lbl}): {hit/len(rs)*100:.0f}%")

print("\n=== A3) Switching volto<->caption al minuto (solo good) ===")
for mod in ("text", "images"):
    xs = [r["per_min"] for r in switch_stats if r["mod"] == mod]
    print(f"  {mod:6}: n={len(xs)}  media={mean(xs):.1f} switch/min  sd={sd(xs):.1f}")
bp = {}
for r in switch_stats:
    bp.setdefault(r["newid"], {})[r["mod"]] = r["per_min"]
dd = [v["images"] - v["text"] for v in bp.values() if "text" in v and "images" in v]
print(f"  appaiato images-text: {mean(dd):+.1f} switch/min (n={len(dd)}, t={tstat(dd):+.2f})")

print("\n=== A4) Reading-along in modalità text (% campioni-caption vicini all'ultima parola comparsa) ===")
rs = [r["r_follow"] for r in follow_stats]
print(f"  n registrazioni={len(rs)}  quota media={mean(rs):.1f}%  sd={sd(rs):.1f}  "
      f"(>50% in {sum(1 for r in rs if r > 50)}/{len(rs)})")

print("\n=== B5) Top 15 parole-immagine per dwell complessivo (tutte le registrazioni images) ===")
agg = {}
for r in wg_rows:
    if r["is_image"] and r["mod"] == "images":
        k = (r["storia"], r["word"])
        agg[k] = agg.get(k, 0) + r["dwell_n"]
for (st, wtxt), n in sorted(agg.items(), key=lambda kv: -kv[1])[:15]:
    print(f"  {wtxt:15} ({st[:12]}): {n} campioni")

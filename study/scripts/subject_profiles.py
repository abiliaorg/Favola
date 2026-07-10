# -*- coding: utf-8 -*-
"""D11 profili attentivi (cluster) + stabilità del profilo tra le due storie.
D12 durata del test cartaceo (proxy: intervallo tra le due registrazioni gaze).
"""
import csv
import json
import re
from datetime import datetime
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans

STUDY = Path(__file__).resolve().parent.parent
GAZE = STUDY.parent / "data" / "02_gaze"

rows = list(csv.DictReader(open(STUDY / "aoi_scores.csv", encoding="utf-8")))
for r in rows:
    for k in ("pct_caption", "pct_face", "pct_none", "score", "dur"):
        r[k] = float(r[k]) if r[k] != "" else None

def mean(xs): return sum(xs) / len(xs) if xs else float("nan")
def sd(xs):
    if len(xs) < 2: return float("nan")
    m = mean(xs)
    return (sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) ** 0.5
def pearson(xs, ys):
    n = len(xs)
    mx, my = mean(xs), mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = sum((x - mx) ** 2 for x in xs) ** 0.5
    dy = sum((y - my) ** 2 for y in ys) ** 0.5
    return num / (dx * dy) if dx > 0 and dy > 0 else float("nan")

# ---------- D11a: stabilità del profilo tra le due storie ----------
print("=== D11) Stabilità del profilo attentivo tra le due storie (stesso bambino, modalità diverse) ===")
bysub = {}
for r in rows:
    bysub.setdefault(r["newid"], {})[r["mod"]] = r
pairs = {k: v for k, v in bysub.items() if "text" in v and "images" in v}
for met in ("pct_face", "pct_caption", "pct_none"):
    a = [v["text"][met] for v in pairs.values()]
    b = [v["images"][met] for v in pairs.values()]
    print(f"  r({met} text <-> images) = {pearson(a, b):+.2f}  (n={len(a)})")

# ---------- D11b: cluster sui profili (livello registrazione) ----------
X = np.array([[r["pct_face"], r["pct_caption"], r["pct_none"]] for r in rows])
Xz = (X - X.mean(0)) / X.std(0)
km = KMeans(n_clusters=3, n_init=10, random_state=42).fit(Xz)
print("\n=== D11) Cluster dei profili di sguardo (k=3, livello registrazione) ===")
for c in range(3):
    idx = [i for i, l in enumerate(km.labels_) if l == c]
    rs = [rows[i] for i in idx]
    print(f"  cluster {c}: n={len(rs):3}  face={mean([r['pct_face'] for r in rs]):5.1f}%"
          f"  caption={mean([r['pct_caption'] for r in rs]):5.1f}%"
          f"  none={mean([r['pct_none'] for r in rs]):5.1f}%"
          f"  | score={mean([r['score'] for r in rs]):5.1f}%"
          f"  text/images={sum(1 for r in rs if r['mod']=='text')}/{sum(1 for r in rs if r['mod']=='images')}"
          f"  M/F={sum(1 for r in rs if r['sex']=='M')}/{sum(1 for r in rs if r['sex']=='F')}")

# ---------- D12: durata del test 1 (gap tra le due registrazioni) ----------
print("\n=== D12) Durata test 1 (intervallo fine storia 1 -> inizio storia 2) ===")
MAPPING = json.loads((STUDY / "mappatura_soggetti.json").read_text(encoding="utf-8"))["mapping"]
recs = {}
for folder in sorted(GAZE.iterdir()):
    if not folder.is_dir() or not folder.name.startswith("data_"):
        continue
    for f in sorted(folder.glob("*.json")):
        m = re.match(r"(\d{8}_\d{6})_(.+?)_\d_", f.name)
        if not m:
            continue
        pid = m.group(2).strip("`").upper()
        if pid not in MAPPING:
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        samples = d.get("samples") or []
        dur = float(samples[-1]["t"]) if samples else 0
        t0 = datetime.strptime(m.group(1), "%Y%m%d_%H%M%S")
        recs.setdefault(MAPPING[pid], []).append((t0, dur))

gaps, gap_by_id = [], {}
for nid, rr in recs.items():
    if len(rr) != 2:
        continue
    rr.sort()
    gap = (rr[1][0] - rr[0][0]).total_seconds() - rr[0][1]
    if 0 < gap < 3600:
        gaps.append(gap)
        gap_by_id[nid] = gap / 60
print(f"  n={len(gaps)}  mediana={sorted(gaps)[len(gaps)//2]/60:.1f} min  media={mean(gaps)/60:.1f} min  "
      f"range={min(gaps)/60:.1f}-{max(gaps)/60:.1f} min")
# correlazione con punteggio del test 1 (storia S1) e con la classe
s1_scores, s1_gaps, cls_l = [], [], []
S1 = {"volpe e boscaiolo", "gatta", "delfino", "anguille"}
for r in rows:
    if r["storia"] in S1 and r["newid"] in gap_by_id:
        s1_scores.append(r["score"]); s1_gaps.append(gap_by_id[r["newid"]]); cls_l.append(int(r["classe"]))
print(f"  r(durata test1, punteggio test1) = {pearson(s1_gaps, s1_scores):+.2f} (n={len(s1_gaps)})")
print(f"  r(durata test1, classe)         = {pearson(s1_gaps, [float(c) for c in cls_l]):+.2f}")

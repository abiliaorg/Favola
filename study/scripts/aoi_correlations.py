# -*- coding: utf-8 -*-
"""Correlazioni tra AOI aggregate (aoi_results.json) e punteggi dei test.

Primo lavoro sul gaze: correlazioni tra dati aggregati (percentuale di tempo
su caption/word/image/face/...) e punteggio di comprensione, complessive, per
modalità e per sesso. Sensibilità: esclusione delle registrazioni di bassa
qualità (hz<5 o durata<40s).
"""
import csv
import json
from pathlib import Path

import openpyxl

STUDY = Path(__file__).resolve().parent.parent

aoi = json.loads((STUDY / "aoi_results.json").read_text(encoding="utf-8"))

# punteggi per (newid, storia)
wb = openpyxl.load_workbook(STUDY / "risultati_test.xlsx")
ws = wb["Punteggi"]
rows = list(ws.iter_rows(values_only=True))
hdr = [str(h) for h in rows[0]]
ix = {h: hdr.index(h) for h in hdr}
scores = {}
sex_by_newid, age_by_newid = {}, {}
for r in rows[1:]:
    nid, storia = r[ix["ID nuovo"]], r[ix["Storia"]]
    scores[(nid, storia)] = r[ix["Punteggio %"]]
    sex_by_newid[nid] = r[ix["Sesso"]]
    age_by_newid[nid] = r[ix["Età"]]

# join
data = []
for a in aoi:
    sc = scores.get((a["newid"], a["storia"]))
    if sc is None:
        continue
    good = (a["hz"] or 0) >= 5 and a["dur"] >= 40
    data.append({**a, "score": sc, "sex": sex_by_newid.get(a["newid"]),
                 "age": age_by_newid.get(a["newid"]), "good": good})

def mean(xs): return sum(xs) / len(xs) if xs else float("nan")
def sd(xs):
    if len(xs) < 2: return float("nan")
    m = mean(xs)
    return (sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) ** 0.5
def pearson(xs, ys):
    pairs = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    n = len(pairs)
    if n < 3:
        return (float("nan"), n, float("nan"))
    xs, ys = [p[0] for p in pairs], [p[1] for p in pairs]
    mx, my = mean(xs), mean(ys)
    num = sum((x - mx) * (y - my) for x, y in pairs)
    dx = (sum((x - mx) ** 2 for x in xs)) ** 0.5
    dy = (sum((y - my) ** 2 for y in ys)) ** 0.5
    if dx == 0 or dy == 0:
        return (float("nan"), n, float("nan"))
    r = num / (dx * dy)
    t = r * ((n - 2) / (1 - r * r)) ** 0.5 if abs(r) < 1 else float("inf")
    return (r, n, t)

METRICS = ["pct_caption", "pct_word", "pct_image", "pct_band",
           "pct_face", "pct_mouth", "pct_eyes", "pct_none"]

def corr_table(rows_, label):
    print(f"\n=== Correlazione AOI -> punteggio: {label} ===")
    for m in METRICS:
        r, n, t = pearson([d[m] for d in rows_], [d["score"] for d in rows_])
        star = " *" if abs(t) >= 2 else ""
        print(f"  {m:12} r={r:+.2f}  (n={n}, t={t:+.2f}){star}")

good = [d for d in data if d["good"]]
print(f"Test uniti: {len(data)} (di cui buona qualità: {len(good)})")

corr_table(data, "tutti i test")
corr_table(good, "solo buona qualità")
for mod in ("text", "images"):
    corr_table([d for d in good if d["mod"] == mod], f"buona qualità, modalità {mod}")

# --- AOI per sesso e modalità (verifica ipotesi I-02/I-21) ---
print("\n=== AOI medie per sesso x modalità (buona qualità) ===")
for sx in ("M", "F"):
    for mod in ("text", "images"):
        rs = [d for d in good if d["sex"] == sx and d["mod"] == mod]
        print(f"  {sx} {mod:6} (n={len(rs):2}): caption={mean([d['pct_caption'] for d in rs]):5.1f}%"
              f"  word={mean([d['pct_word'] for d in rs]):5.1f}%"
              f"  image={mean([d['pct_image'] for d in rs if d['pct_image'] is not None]):5.1f}%"
              f"  face={mean([d['pct_face'] for d in rs]):5.1f}%"
              f"  none={mean([d['pct_none'] for d in rs]):5.1f}%")

# --- correlazioni per sesso (solo buona qualità) ---
for sx in ("M", "F"):
    corr_table([d for d in good if d["sex"] == sx], f"buona qualità, sesso {sx}")

# --- export CSV per il notebook ---
out = STUDY / "aoi_scores.csv"
cols = ["newid", "pid", "grp", "classe", "storia", "mod", "sex", "age", "score",
        "n", "dur", "hz", "good"] + METRICS + ["pct_face_only", "pct_nose"]
with open(out, "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
    w.writeheader()
    for d in sorted(data, key=lambda d: (d["grp"], int(d["newid"][2:]), d["storia"])):
        w.writerow(d)
print(f"\nSalvato: {out.name} ({len(data)} righe, dataset unito AOI+punteggi)")

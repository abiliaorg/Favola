# -*- coding: utf-8 -*-
"""Analisi di robustezza in risposta alla review CHI (M4, M5, M6).

A) Sensitivity con filtro fissazioni: le quote AOI ricalcolate usando solo
   campioni appartenenti a run di >=3 campioni consecutivi entro un raggio di
   dispersione del 5% del frame (~2 gradi visivi a 60 cm su 15.6'').
B) Effect size (Cohen's d) + t, df, p esatti per i contrasti principali.
C) Sensitivity calibrazione: esclusione delle registrazioni dominate da
   campioni fuori-AOI (>50%), sospette di calibrazione fallita.
D) Affidabilita' delle finestre-ancora: distanza temporale tra le finestre
   della stessa domanda localizzate in modo indipendente nelle due varianti
   (transcript ASR diversi) -> proxy di riproducibilita' senza secondo coder.
E) GEE clusterizzato per DOMANDA (complementare al cluster per bambino).
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

import aoi_lib
from aoi_lib import EN2IT, categorize, compute_calibration, gaze_to_fraction, load_tracking

STUDY = Path(__file__).resolve().parent.parent
GAZE = STUDY.parent / "data" / "02_gaze"
MAPPING = json.loads((STUDY / "mappatura_soggetti.json").read_text(encoding="utf-8"))["mapping"]

def paired_stats(x):
    x = pd.Series(x).dropna()
    n = len(x)
    t = x.mean() / (x.std(ddof=1) / n ** 0.5)
    p = 2 * (1 - stats.t.cdf(abs(t), n - 1))
    d = x.mean() / x.std(ddof=1)
    return x.mean(), t, n - 1, p, d

# ---------- A + C: ricalcolo quote AOI con filtro fissazioni ----------
import re
rec_rows = []
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
        pts, cats = [], []
        for s in samples:
            g = s.get("gaze")
            gf = gaze_to_fraction(g["x"], g["y"], vp.get("width"), vp.get("height"), cal) if g else None
            pts.append(gf)
            cats.append(categorize(gf, float(s["t"]), tr)[0])
        # filtro fissazioni: run di >=3 campioni con dispersione <= 0.05
        keep = [False] * len(pts)
        i = 0
        while i < len(pts):
            if pts[i] is None:
                i += 1
                continue
            j = i
            xs = [pts[i][0]]; ys = [pts[i][1]]
            while j + 1 < len(pts) and pts[j + 1] is not None:
                nx, ny = pts[j + 1]
                if (max(xs + [nx]) - min(xs + [nx])) <= 0.05 and (max(ys + [ny]) - min(ys + [ny])) <= 0.05:
                    xs.append(nx); ys.append(ny); j += 1
                else:
                    break
            if j - i + 1 >= 3:
                for k in range(i, j + 1):
                    keep[k] = True
            i = j + 1
        n_all = len([c for c in cats])
        n_fix = sum(keep)
        def share(sel, cat):
            tot = sum(1 for k, c in zip(keep, cats) if (k or not sel))
            if sel:
                tot = n_fix
                num = sum(1 for k, c in zip(keep, cats) if k and c == cat)
            else:
                num = sum(1 for c in cats if c == cat)
                tot = n_all
            return num / tot * 100 if tot else np.nan
        rec_rows.append({
            "newid": MAPPING[pid], "mod": d["typology"],
            "cap_all": share(False, "caption"), "face_all": share(False, "face"),
            "none_all": share(False, "none"),
            "cap_fix": share(True, "caption"), "face_fix": share(True, "face"),
            "n_all": n_all, "n_fix": n_fix,
        })
rr = pd.DataFrame(rec_rows)
print(f"A) Filtro fissazioni: campioni totali {rr.n_all.sum()}, in fissazione {rr.n_fix.sum()} "
      f"({rr.n_fix.sum()/rr.n_all.sum()*100:.0f}%)")
for met, lab in [("cap", "caption"), ("face", "face")]:
    for suff, lab2 in [("all", "tutti i campioni"), ("fix", "solo fissazioni")]:
        pv = rr.pivot_table(index="newid", columns="mod", values=f"{met}_{suff}")
        dif = (pv["images"] - pv["text"]).dropna()
        m, t, dfree, p, dd = paired_stats(dif)
        print(f"   shift {lab:7} ({lab2:16}): {m:+.1f} pp, t({dfree})={t:.2f}, p={p:.4f}, d={dd:.2f}")

print()
print("C) Sensitivity calibrazione: escludo registrazioni con fuori-AOI > 50%")
bad = rr[rr.none_all > 50]
print(f"   registrazioni escluse: {len(bad)} (di {len(rr)})")
ok = rr[rr.none_all <= 50]
for met, lab in [("cap", "caption"), ("face", "face")]:
    pv = ok.pivot_table(index="newid", columns="mod", values=f"{met}_all")
    dif = (pv["images"] - pv["text"]).dropna()
    m, t, dfree, p, dd = paired_stats(dif)
    print(f"   shift {lab:7}: {m:+.1f} pp, t({dfree})={t:.2f}, p={p:.4f}, d={dd:.2f}  (n coppie={dfree+1})")

# ---------- B: effect size per i contrasti principali ----------
print()
print("B) Contrasti principali con statistiche complete")
df = pd.read_csv(STUDY / "aoi_scores.csv")
piv = df.pivot_table(index="newid", columns="mod", values="score")
m, t, dfree, p, dd = paired_stats(piv["images"] - piv["text"])
print(f"   comprensione (CC+P-CC-T): {m:+.2f} pp, t({dfree})={t:.2f}, p={p:.3f}, d={dd:.2f}")
tc = pd.read_csv(STUDY / "timecourse.csv")
tc["good"] = tc["good"].astype(str).str.lower().eq("true")
g = tc[tc.good & (tc["mod"] == "images")]
pq = g.pivot_table(index="newid", columns="quartile", values="pct_caption")
m, t, dfree, p, dd = paired_stats(pq[4] - pq[1])
print(f"   timecourse CC+P Q4-Q1: {m:+.1f} pp, t({dfree})={t:.2f}, p={p:.4f}, d={dd:.2f}")

# ---------- D: riproducibilita' delle finestre tra varianti ----------
print()
print("D) Affidabilita' finestre: stessa domanda localizzata nei due transcript ASR indipendenti")
w = json.loads((STUDY / "question_windows.json").read_text(encoding="utf-8"))
deltas = []
for st, qs in w.items():
    if st.startswith("_"):
        continue
    for q, obj in qs.items():
        wins = obj.get("windows") or {}
        bycls = {}
        for wk, win in wins.items():
            cls, typ = wk.split("_")
            bycls.setdefault(cls, {})[typ] = win
        for cls, pair in bycls.items():
            if "text" in pair and "images" in pair:
                deltas.append(abs(pair["text"]["t_first_word"] - pair["images"]["t_first_word"]))
s = pd.Series(deltas)
print(f"   n coppie finestra={len(s)}  |delta t_first| mediana={s.median():.2f}s  "
      f"media={s.mean():.2f}s  90mo percentile={s.quantile(0.9):.2f}s  max={s.max():.2f}s")

# ---------- E: GEE clusterizzato per domanda ----------
print()
print("E) GEE: cluster per bambino vs cluster per domanda")
import statsmodels.api as sm
import statsmodels.formula.api as smf
qg = pd.read_csv(STUDY / "question_gaze.csv")
qi = qg[(qg.incluso == 1) & qg.pct_anchor.notna()].copy()
qi["anchor10"] = qi.pct_anchor / 10
qi["is_img"] = (qi["mod"] == "images").astype(int)
qi["item"] = qi["storia"] + "_" + qi["q"].astype(str)
for grp, lab in [("newid", "bambino"), ("item", "domanda")]:
    mres = smf.gee("correct ~ anchor10 * is_img", groups=grp, data=qi,
                   family=sm.families.Binomial(), cov_struct=sm.cov_struct.Exchangeable()).fit()
    print(f"   cluster {lab:8}: anchor10 beta={mres.params['anchor10']:+.3f} p={mres.pvalues['anchor10']:.3f}  "
          f"interaz. p={mres.pvalues['anchor10:is_img']:.3f}")

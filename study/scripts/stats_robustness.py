# -*- coding: utf-8 -*-
"""E13 TOST (equivalenza) su I-01; E14 GEE logistico sull'analisi puntuale;
E16 power analysis per lo studio con bambini sordi."""
import csv
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

STUDY = Path(__file__).resolve().parent.parent

# ---------- E13: TOST ----------
df = pd.read_csv(STUDY / "aoi_scores.csv")
piv = df.pivot_table(index="newid", columns="mod", values="score")
d = (piv["images"] - piv["text"]).dropna()
n, mean_d, sd_d = len(d), d.mean(), d.std(ddof=1)
se = sd_d / n ** 0.5
print("=== E13) TOST di equivalenza sull'effetto modalità (images - text) ===")
print(f"  diff media = {mean_d:+.2f} pt, sd = {sd_d:.1f}, n = {n}, SE = {se:.2f}")
print(f"  IC90% = [{mean_d - 1.678 * se:+.1f}, {mean_d + 1.678 * se:+.1f}]  (df={n-1})")
for delta in (5, 7.5, 10, 12.5):
    t_low = (mean_d + delta) / se
    t_up = (delta - mean_d) / se
    p_low = 1 - stats.t.cdf(t_low, n - 1)
    p_up = 1 - stats.t.cdf(t_up, n - 1)
    p = max(p_low, p_up)
    print(f"  bound ±{delta:4}: p_TOST = {p:.3f}  -> {'EQUIVALENTE' if p < .05 else 'non concludente'}")

# ---------- E14: GEE logistico (cluster per soggetto) ----------
print("\n=== E14) GEE logistico: correttezza ~ quota-ancora x modalità (cluster = soggetto) ===")
import statsmodels.api as sm
import statsmodels.formula.api as smf

qg = pd.read_csv(STUDY / "question_gaze.csv")
qg = qg[(qg.incluso == 1) & qg.pct_anchor.notna()].copy()
qg["anchor10"] = qg.pct_anchor / 10      # coefficiente per +10 punti di quota-ancora
qg["is_img"] = (qg["mod"] == "images").astype(int)
model = smf.gee("correct ~ anchor10 * is_img", groups="newid", data=qg,
                family=sm.families.Binomial(),
                cov_struct=sm.cov_struct.Exchangeable()).fit()
print(model.summary().tables[1])
print("  (anchor10 = effetto di +10 pt di sguardo-ancora sull'odds di risposta corretta, in text;")
print("   anchor10:is_img = quanto cambia in images; cluster robusti per soggetto,")
print("   non modellato il cluster per domanda)")

# ---------- E16: power analysis ----------
print("\n=== E16) Power analysis per lo studio con bambini sordi ===")
sd_paired = sd_d                        # sd della differenza appaiata (udenti)
sd_single = df.groupby("mod")["score"].std().mean()
print(f"  sd differenza appaiata (udenti) = {sd_paired:.1f} pt; sd punteggio singolo = {sd_single:.1f} pt")

def n_paired(delta, power=0.80, alpha=0.05):
    for n_ in range(5, 2000):
        ncp = delta / (sd_paired / n_ ** 0.5)
        crit = stats.t.ppf(1 - alpha / 2, n_ - 1)
        if 1 - stats.nct.cdf(crit, n_ - 1, ncp) >= power:
            return n_
    return None

def n_between(delta, power=0.80, alpha=0.05):
    for n_ in range(5, 4000):
        ncp = delta / (sd_single * (2 / n_) ** 0.5)
        crit = stats.t.ppf(1 - alpha / 2, 2 * n_ - 2)
        if 1 - stats.nct.cdf(crit, 2 * n_ - 2, ncp) >= power:
            return n_
    return None

print("  Disegno appaiato (ogni bambino sordo vede text e images, come qui):")
for delta in (5, 10, 15, 20):
    print(f"    effetto {delta:2} pt: n = {n_paired(delta)} bambini (80% power)  ·  {n_paired(delta, .9)} (90%)")
print("  Confronto tra gruppi (es. sordi vs udenti sulla stessa modalità):")
for delta in (10, 15, 20):
    print(f"    effetto {delta:2} pt: n = {n_between(delta)} per gruppo (80% power)")

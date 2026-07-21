# -*- coding: utf-8 -*-
"""Figure del paper CHI (inglese, PDF vettoriale) in paper/figures/.

Palette semantica smorzata, validata con dataviz/validate_palette.js
(lightness band, chroma, CVD e normal-vision separation, contrasto):
- identità di condizione, fissa in tutte le figure: CC-T (testo) = blu
  acciaio #3667A8, CC+P (pittogrammi) = terracotta #B4653A;
- sotto-aree caption come declinazioni delle stesse famiglie: parole-testo
  = acciaio chiaro #729ED8, pittogrammi = terracotta (stessa entità di CC+P),
  banda residua = grigio-azzurro quasi neutro #C9D4DF (categoria residuale,
  etichettata direttamente);
- volto narratrice = prugna smorzato #92589B; fuori-AOI = grigio #BDBDBD
  con tratteggio (assenza di contenuto);
- fasce MT = rampa sequenziale monocroma blu-grigio (ordine di rendimento,
  non categorie); esito corretto/sbagliato = pieno vs contorno nella tinta
  della modalità (nessun colore semaforo); i valori annotati usano sempre
  inchiostro neutro, mai il colore della serie.
Stampa a video tutti i numeri esatti da inserire nel testo.
"""
import csv
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats

STUDY = Path(__file__).resolve().parent.parent
FIG = STUDY.parent / "paper" / "figures"
FIG.mkdir(exist_ok=True)

plt.rcParams.update({
    "font.size": 8, "axes.titlesize": 9, "axes.labelsize": 8,
    "xtick.labelsize": 7.5, "ytick.labelsize": 7.5, "legend.fontsize": 7.5,
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": "#e6e6e6", "grid.linewidth": 0.6,
    "axes.axisbelow": True, "figure.dpi": 200, "savefig.bbox": "tight",
})
C_T, C_P = "#3667A8", "#B4653A"          # CC-T (steel blue) / CC+P (terracotta)
A_WORD, A_PIC, A_BAND, A_FACE = "#729ED8", "#B4653A", "#C9D4DF", "#92589B"
A_OFF = "#BDBDBD"
INK = "#333333"                           # annotazioni: sempre inchiostro neutro
MODLAB = {"text": "CC-T", "images": "CC+P"}

df = pd.read_csv(STUDY / "aoi_scores.csv")
df["good"] = df["good"].astype(str).str.lower().eq("true")
qg = pd.read_csv(STUDY / "question_gaze.csv")
tc = pd.read_csv(STUDY / "timecourse.csv")
tc["good"] = tc["good"].astype(str).str.lower().eq("true")
wg = pd.read_csv(STUDY / "word_gaze.csv")
wg["good"] = wg["good"].astype(str).str.lower().eq("true")
test = pd.read_excel(STUDY / "risultati_test.xlsx", sheet_name="Punteggi")

piv = df.pivot_table(index=["newid", "grp", "sex"], columns="mod", values="score").reset_index()
piv["diff"] = piv["images"] - piv["text"]

STORY_EN = {"volpe e boscaiolo": "Fox & woodman", "tappeto": "Magic carpet",
            "gatta": "Limping cat", "sbadiglio": "Story of a yawn",
            "delfino": "Desire to play", "panda": "The panda",
            "anguille": "Eels' journey", "orso": "White bear"}

def save(fig, name):
    fig.savefig(FIG / f"{name}.pdf")
    plt.close(fig)
    print(f"  -> figures/{name}.pdf")

# ---------------- Fig 1: comprehension (2x2 con TOST) ----------------
fig, axs = plt.subplots(2, 2, figsize=(6.8, 5.2), constrained_layout=True)
ax = axs[0, 0]
for i, mod in enumerate(["text", "images"]):
    v = df[df["mod"] == mod]["score"]
    ax.boxplot(v, positions=[i], widths=0.5, showfliers=False,
               boxprops=dict(color=[C_T, C_P][i], lw=1.4),
               whiskerprops=dict(color=[C_T, C_P][i], lw=1.2),
               capprops=dict(color=[C_T, C_P][i], lw=1.2),
               medianprops=dict(color="black", lw=1.2))
    ax.scatter(np.random.default_rng(1).normal(i, 0.07, len(v)), v, s=6,
               color=[C_T, C_P][i], alpha=0.55, zorder=3)
ax.set_xticks([0, 1], ["CC-T", "CC+P"])
ax.set_ylabel("Comprehension score (%)")
ax.set_title("A. Scores by caption modality")

ax = axs[0, 1]
for _, r in piv.iterrows():
    ax.plot([0, 1], [r["text"], r["images"]], color="#999999", alpha=0.45, lw=0.8, zorder=1)
ax.plot([0, 1], [piv["text"].mean(), piv["images"].mean()], color="black", lw=2.2,
        marker="o", ms=5, zorder=3, label="Mean")
ax.set_xticks([0, 1], ["CC-T", "CC+P"])
ax.set_xlim(-0.25, 1.25)
ax.set_title("B. Within-child pairs (n=48)")
ax.legend(frameon=False)

ax = axs[1, 0]
d = piv["diff"].dropna()
ax.hist(d, bins=14, color="#9AA7B4", edgecolor="white")
ax.axvline(0, color="black", lw=1)
ax.axvline(d.mean(), color=INK, lw=1.6, ls="--")
ax.annotate(f"mean {d.mean():+.1f}", (d.mean(), ax.get_ylim()[1] * 0.92),
            color=INK, fontsize=8, ha="left", xytext=(3, 0), textcoords="offset points")
ax.set_xlabel("Within-child difference, CC+P − CC-T (pp)")
ax.set_ylabel("Children")
ax.set_title("C. Distribution of paired differences")

ax = axs[1, 1]
n, m, se = len(d), d.mean(), d.std(ddof=1) / len(d) ** 0.5
lo, hi = m - stats.t.ppf(0.95, n - 1) * se, m + stats.t.ppf(0.95, n - 1) * se
ax.errorbar([m], [0], xerr=[[m - lo], [hi - m]], fmt="o", color="black",
            capsize=4, lw=1.8, ms=5)
for b, y, ok in [(5, 0.9, False), (7.5, 0.6, True), (10, 0.3, True)]:
    ax.plot([-b, -b], [y - 0.09, y + 0.09], color="#666666", lw=1.2)
    ax.plot([b, b], [y - 0.09, y + 0.09], color="#666666", lw=1.2)
    ax.plot([-b, b], [y, y], color="#dddddd", lw=0.8, zorder=0)
    ax.annotate(f"±{b} pp: {'equivalent' if ok else 'inconclusive'}",
                (b + 0.4, y), fontsize=7.5, va="center",
                color="#3D7A4A" if ok else "#777777")
ax.set_yticks([])
ax.set_xlim(-14, 14)
ax.set_xlabel("CC+P − CC-T (pp): 90% CI vs equivalence bounds")
ax.set_title("D. Equivalence test (TOST)")
save(fig, "fig_comprehension")

# ---------------- Fig 2: sex x modality ----------------
fig, axs = plt.subplots(1, 2, figsize=(6.8, 2.7), constrained_layout=True)
ax = axs[0]
for sx, mk, off in [("M", "o", -0.06), ("F", "s", 0.06)]:
    means, ses = [], []
    for mod in ["text", "images"]:
        v = df[(df.sex == sx) & (df["mod"] == mod)]["score"]
        means.append(v.mean()); ses.append(v.std(ddof=1) / len(v) ** 0.5)
    ax.errorbar([0 + off, 1 + off], means, yerr=ses, marker=mk, ms=5, lw=1.6,
                capsize=3, color="#444444", ls="-" if sx == "M" else "--", label=f"{sx} (n={ {'M':25,'F':23}[sx] })")
ax.set_xticks([0, 1], ["CC-T", "CC+P"])
ax.set_xlim(-0.3, 1.5)
ax.set_ylabel("Comprehension score (%)")
ax.set_title("A. Mean score by sex and modality (±1 SE)")
ax.legend(frameon=False)

ax = axs[1]
for i, sx in enumerate(["M", "F"]):
    v = piv[piv.sex == sx]["diff"].dropna()
    ax.boxplot(v, positions=[i], widths=0.45, showfliers=False,
               medianprops=dict(color="black"))
    ax.scatter(np.random.default_rng(2).normal(i, 0.06, len(v)), v, s=8,
               color="#666666", alpha=0.6, zorder=3)
ax.axhline(0, color="black", lw=0.9)
ax.set_xticks([0, 1], ["Boys", "Girls"])
ax.set_ylabel("CC+P − CC-T (pp)")
ax.set_title("B. Paired modality benefit by sex")
save(fig, "fig_sex")

# ---------------- Fig 3: stories + MT bands ----------------
fig, axs = plt.subplots(1, 2, figsize=(6.8, 2.9), constrained_layout=True)
ax = axs[0]
order = df.groupby("storia")["score"].mean().sort_values(ascending=False).index
x = np.arange(len(order))
for k, mod in enumerate(["text", "images"]):
    means, ns = [], []
    for st in order:
        v = df[(df.storia == st) & (df["mod"] == mod)]["score"]
        means.append(v.mean()); ns.append(len(v))
    ax.bar(x + (k - 0.5) * 0.38, means, width=0.36, color=[C_T, C_P][k],
           label=MODLAB[mod], edgecolor="white")
    for xi, (mn, nn) in zip(x + (k - 0.5) * 0.38, zip(means, ns)):
        ax.annotate(str(nn), (xi, 3), ha="center", fontsize=6, color="white")
ax.set_xticks(x, [STORY_EN[s] for s in order], rotation=30, ha="right")
ax.set_ylabel("Mean score (%)")
ax.set_title("A. Score by story and modality (n in bars)")
ax.legend(frameon=False)

ax = axs[1]
FASCE = ["CCRD", "PSD", "RAD", "RIDI"]
# rampa sequenziale monocroma (rendimento decrescente -> tinta piu' chiara)
FCOL = {"CCRD": "#2F4F6F", "PSD": "#5F7F9E", "RAD": "#93A9BE", "RIDI": "#C8D3DD"}
ft = (test.groupby(["Modalità", "Fascia MT"]).size().unstack(fill_value=0)
      .reindex(columns=FASCE).apply(lambda r: r / r.sum() * 100, axis=1)
      .reindex(["text", "images"]))
left = np.zeros(2)
for f in FASCE:
    ax.barh([0, 1], ft[f].values, left=left, color=FCOL[f], edgecolor="white", label=f)
    for yi, (v, l) in enumerate(zip(ft[f].values, left)):
        if v > 7:
            ax.annotate(f"{v:.0f}%", (l + v / 2, yi), ha="center", va="center", fontsize=7,
                        color="white" if f in ("CCRD", "PSD") else INK)
    left += ft[f].values
ax.set_yticks([0, 1], ["CC-T", "CC+P"])
ax.set_xlabel("% of tests")
ax.set_title("B. MT normative bands (descriptive)")
ax.legend(frameon=False, ncol=4, loc="upper center", bbox_to_anchor=(0.5, -0.28))
save(fig, "fig_stories")

# ---------------- Fig 4: AOI composition + paired shift ----------------
fig, axs = plt.subplots(1, 2, figsize=(6.8, 2.8), constrained_layout=True)
ax = axs[0]
comp_cols = [("pct_word", "Caption: words", A_WORD), ("pct_image", "Caption: pictograms", A_PIC),
             ("pct_band", "Caption: band", A_BAND), ("pct_face", "Narrator's face", A_FACE),
             ("pct_none", "Off-AOI", A_OFF)]
left = np.zeros(2)
for col, lab, c in comp_cols:
    vals = [df[df["mod"] == m][col].mean() for m in ["text", "images"]]
    ax.barh([0, 1], vals, left=left, color=c, edgecolor="white",
            hatch="//" if col == "pct_none" else None, label=lab)
    for yi, (v, l) in enumerate(zip(vals, left)):
        if v > 6:
            ax.annotate(f"{v:.0f}%", (l + v / 2, yi), ha="center", va="center", fontsize=7)
    left += np.array(vals)
ax.set_yticks([0, 1], ["CC-T", "CC+P"])
ax.set_xlabel("% of gaze samples")
ax.set_title("A. Gaze allocation by modality")
ax.legend(frameon=False, fontsize=6.5, ncol=2, loc="upper center", bbox_to_anchor=(0.5, -0.3))

ax = axs[1]
pv2 = df.pivot_table(index="newid", columns="mod", values=["pct_caption", "pct_face"])
sh_c = (pv2["pct_caption"]["images"] - pv2["pct_caption"]["text"]).dropna()
sh_f = (pv2["pct_face"]["images"] - pv2["pct_face"]["text"]).dropna()
for i, (v, lab) in enumerate([(sh_c, "Captions"), (sh_f, "Face")]):
    ax.boxplot(v, positions=[i], widths=0.45, showfliers=False,
               medianprops=dict(color="black"))
    ax.scatter(np.random.default_rng(3).normal(i, 0.06, len(v)), v, s=8,
               color="#666666", alpha=0.6, zorder=3)
    t = v.mean() / (v.std(ddof=1) / len(v) ** 0.5)
    ax.annotate(f"{v.mean():+.1f} pp\nt={t:.2f}", (i + 0.3, v.mean()), fontsize=7)
ax.axhline(0, color="black", lw=0.9)
ax.set_xticks([0, 1], ["Captions", "Narrator's face"])
ax.set_ylabel("CC+P − CC-T (pp)")
ax.set_title("B. Within-child attention shift (n=48)")
save(fig, "fig_aoi")

# ---------------- Fig 5: time-course ----------------
fig, axs = plt.subplots(1, 2, figsize=(6.8, 2.6), constrained_layout=True)
g = tc[tc.good]
for ax, met, title in [(axs[0], "pct_caption", "A. Gaze on captions"),
                       (axs[1], "pct_face", "B. Gaze on narrator's face")]:
    for mod, c in [("text", C_T), ("images", C_P)]:
        m = [g[(g["mod"] == mod) & (g.quartile == q)][met].mean() for q in (1, 2, 3, 4)]
        ax.plot([1, 2, 3, 4], m, color=c, marker="o", ms=4, lw=1.8, label=MODLAB[mod])
    ax.set_xticks([1, 2, 3, 4], ["Q1", "Q2", "Q3", "Q4"])
    ax.set_xlabel("Video quartile")
    ax.set_ylabel("% of samples")
    ax.set_title(title)
axs[0].legend(frameon=False)
save(fig, "fig_timecourse")

# ---------------- Fig 6: word-level capture ----------------
fig, axs = plt.subplots(1, 2, figsize=(6.8, 2.6), constrained_layout=True)
ax = axs[0]
gw = wg[wg.good]
groups = [
    ("Pictogram words\n(CC+P)", gw[(gw["mod"] == "images") & (gw.is_image == 1)], A_PIC),
    ("Text words\n(CC+P)", gw[(gw["mod"] == "images") & (gw.is_image == 0)], A_WORD),
    ("Text words\n(CC-T)", gw[gw["mod"] == "text"], C_T),
]
rates = [g_.dwell_n.gt(0).mean() * 100 for _, g_, _ in groups]
ax.bar(range(3), rates, color=[c for _, _, c in groups], width=0.55, edgecolor="white")
for i, r in enumerate(rates):
    ax.annotate(f"{r:.0f}%", (i, r + 1.2), ha="center", fontsize=8)
ax.set_xticks(range(3), [l for l, _, _ in groups])
ax.set_ylabel("% of words gazed ≥ once")
ax.set_title("A. Word capture rate")

ax = axs[1]
lat = [g_[g_.latency.notna() & (g_.latency >= 0)].latency for _, g_, _ in groups]
bp = ax.boxplot(lat, positions=range(3), widths=0.5, showfliers=False,
                medianprops=dict(color="black"))
for i, (l, (_, _, c)) in enumerate(zip(lat, groups)):
    ax.annotate(f"med {np.median(l):.2f}s", (i, np.median(l)), xytext=(0, 8),
                textcoords="offset points", ha="center", fontsize=7, color=INK)
ax.set_xticks(range(3), [l for l, _, _ in groups])
ax.set_ylabel("First-look latency (s)")
ax.set_title("B. Latency of first look (words gazed)")
save(fig, "fig_words")

# ---------------- Fig 7: moment of information ----------------
fig, axs = plt.subplots(1, 2, figsize=(6.8, 2.8), constrained_layout=True)
qi = qg[(qg.incluso == 1) & qg.pct_anchor.notna()]
ax = axs[0]
pos = 0
xt, xl = [], []
for mod, c in [("text", C_T), ("images", C_P)]:
    for corr, lab in [(1, "correct"), (0, "wrong")]:
        v = qi[(qi["mod"] == mod) & (qi.correct == corr)].pct_anchor
        bp = ax.boxplot(v, positions=[pos], widths=0.5, showfliers=False,
                        patch_artist=True,
                        boxprops=dict(edgecolor=c),
                        whiskerprops=dict(color=c), capprops=dict(color=c),
                        medianprops=dict(color="black"))
        # pieno = risposta corretta, vuoto = errata (stessa tinta della modalita')
        bp["boxes"][0].set_facecolor(matplotlib.colors.to_rgba(c, 0.35) if corr else "white")
        ax.annotate(f"{v.mean():.0f}", (pos, v.mean()), xytext=(12, 0),
                    textcoords="offset points", fontsize=7, color=INK)
        xt.append(pos); xl.append(f"{MODLAB[mod]}\n{lab}")
        pos += 1
    pos += 0.4
ax.set_xticks(xt, xl)
ax.set_ylabel("% gaze on anchor words in window")
ax.set_title("A. Anchor-word gaze by answer outcome")

ax = axs[1]
recs = []
for (nid, mod), g_ in qi.groupby(["newid", "mod"]):
    ok, ko = g_[g_.correct == 1].pct_anchor, g_[g_.correct == 0].pct_anchor
    if len(ok) and len(ko):
        recs.append({"mod": mod, "d": ok.mean() - ko.mean()})
sub = pd.DataFrame(recs)
for i, (mod, c) in enumerate([("text", C_T), ("images", C_P)]):
    v = sub[sub["mod"] == mod]["d"]
    ax.boxplot(v, positions=[i], widths=0.45, showfliers=False, medianprops=dict(color="black"))
    ax.scatter(np.random.default_rng(4).normal(i, 0.06, len(v)), v, s=8, color=c, alpha=0.6, zorder=3)
    t = v.mean() / (v.std(ddof=1) / len(v) ** 0.5)
    ax.annotate(f"{v.mean():+.1f} pp, t={t:.2f}", (i, v.max() + 3), ha="center", fontsize=7)
ax.axhline(0, color="black", lw=0.9)
ax.set_xticks([0, 1], ["CC-T", "CC+P"])
ax.set_ylabel("Anchor gaze, correct − wrong (pp)")
ax.set_title("B. Within-child control")
save(fig, "fig_window")

# ---------------- Fig 8: attention vs comprehension ----------------
fig, axs = plt.subplots(1, 2, figsize=(6.8, 2.8), constrained_layout=True)
ax = axs[0]
dd = piv.merge(pd.DataFrame({"newid": pv2.index,
                             "shift_caption": (pv2["pct_caption"]["images"] - pv2["pct_caption"]["text"]).values}),
               on="newid")
ax.scatter(dd["shift_caption"], dd["diff"], s=14, color="#555555", alpha=0.75)
r = dd[["shift_caption", "diff"]].corr().iloc[0, 1]
z = np.polyfit(dd["shift_caption"].dropna(), dd.loc[dd["shift_caption"].notna(), "diff"], 1)
xs = np.linspace(dd["shift_caption"].min(), dd["shift_caption"].max(), 20)
ax.plot(xs, np.polyval(z, xs), color="#000000", lw=1.4)
ax.annotate(f"r = {r:+.2f} (n.s.)", (0.03, 0.93), xycoords="axes fraction", fontsize=8)
ax.axhline(0, color="#bbbbbb", lw=0.8); ax.axvline(0, color="#bbbbbb", lw=0.8)
ax.set_xlabel("Attention shift to captions, CC+P − CC-T (pp)")
ax.set_ylabel("Comprehension benefit (pp)")
ax.set_title("A. Attention shift does not predict benefit")

ax = axs[1]
st_f = pv2["pct_face"]["text"]; im_f = pv2["pct_face"]["images"]
ax.scatter(st_f, im_f, s=14, color=A_FACE, alpha=0.8)
r2 = pd.concat([st_f, im_f], axis=1).corr().iloc[0, 1]
lim = max(st_f.max(), im_f.max()) * 1.05
ax.plot([0, lim], [0, lim], color="#bbbbbb", lw=0.8)
ax.annotate(f"r = {r2:+.2f}", (0.03, 0.93), xycoords="axes fraction", fontsize=8)
ax.set_xlabel("% gaze on face, CC-T story")
ax.set_ylabel("% gaze on face, CC+P story")
ax.set_title("B. Face preference is child-stable")
save(fig, "fig_attention_comprehension")

# ---------------- numeri esatti per il testo ----------------
print("\n=== NUMBERS FOR THE PAPER ===")
demo = pd.read_csv(STUDY / "demo.csv", sep="\t").drop_duplicates("ID")
alias = json.loads((STUDY / "mappatura_soggetti.json").read_text(encoding="utf-8")).get("alias", {})
demo["ID"] = demo["ID"].replace(alias)
demo = demo.drop_duplicates("ID")
print(f"participants (all, post F4=F6 merge): n={len(demo)}, "
      f"age mean={demo.AGE.mean():.2f} median={demo.AGE.median():.0f}, "
      f"M={sum(demo.SEX=='M')}, F={sum(demo.SEX=='F')}")
kids = df.drop_duplicates("newid").merge(
    test.drop_duplicates("ID nuovo")[["ID nuovo", "Età", "Sesso"]],
    left_on="newid", right_on="ID nuovo")
print(f"analysed cohort: n={len(kids)}, age mean={kids['Età'].mean():.2f} "
      f"median={kids['Età'].median():.0f}, M={sum(kids.Sesso=='M')}, F={sum(kids.Sesso=='F')}")
print(f"score: CC-T {df[df['mod']=='text'].score.mean():.1f} (SD {df[df['mod']=='text'].score.std(ddof=1):.1f}), "
      f"CC+P {df[df['mod']=='images'].score.mean():.1f} (SD {df[df['mod']=='images'].score.std(ddof=1):.1f})")
d = piv['diff'].dropna()
print(f"paired diff {d.mean():+.2f} (SD {d.std(ddof=1):.1f}), t(47)={d.mean()/(d.std(ddof=1)/len(d)**0.5):.2f}, "
      f"p={2*(1-stats.t.cdf(abs(d.mean()/(d.std(ddof=1)/len(d)**0.5)), 47)):.2f}")
for sx in ['M', 'F']:
    for mod in ['text', 'images']:
        v = df[(df.sex==sx)&(df['mod']==mod)].score
        print(f"  {sx} {MODLAB[mod]}: {v.mean():.1f} (SD {v.std(ddof=1):.1f}, n={len(v)})")
sw = None
print(f"anchor obs: {len(qi)} incl.; correct {qi.correct.mean()*100:.0f}%")
print(f"capture rates: {rates[0]:.0f}/{rates[1]:.0f}/{rates[2]:.0f}")
print(f"latency medians: {[round(float(np.median(l)),2) for l in lat]}")
print(f"timecourse caption images Q1={g[(g['mod']=='images')&(g.quartile==1)].pct_caption.mean():.1f} "
      f"Q4={g[(g['mod']=='images')&(g.quartile==4)].pct_caption.mean():.1f}")
print(f"stability face r={r2:+.2f}; shift-vs-benefit r={r:+.2f}")

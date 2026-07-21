# -*- coding: utf-8 -*-
"""Genera il notebook interattivo study/notebooks/risultati.ipynb.

Il notebook è uno strato di PRESENTAZIONE: carica gli output della pipeline
(risultati_test.xlsx, aoi_scores.csv, mappatura, INSIGHTS.md) senza rifare i
calcoli. Rigenerabile in ogni momento con questo script.
"""
from pathlib import Path

import nbformat as nbf

STUDY = Path(__file__).resolve().parent.parent
OUT = STUDY / "notebooks"
OUT.mkdir(exist_ok=True)

nb = nbf.v4.new_notebook()
cells = []
md = lambda s: cells.append(nbf.v4.new_markdown_cell(s))
code = lambda s: cells.append(nbf.v4.new_code_cell(s))

md("""# Studio Favola — Risultati interattivi

Notebook di **presentazione** dei risultati: carica gli output della pipeline in `study/`
(punteggi MT, AOI del gaze, demografia) senza rifare i calcoli. Per rigenerare i dati:
`make_transcripts.py → classify_order.py → make_mapping.py → score_tests.py → analyze_balance.py → aoi_engine.py → aoi_correlations.py`.
Per rigenerare questo notebook: `scripts/make_notebook.py`.

Riferimenti: gli id **I-nn** citati nei titoli rimandano a `study/INSIGHTS.md`.
Coorte: 48 soggetti validi (27 TI = text→images, 21 IT = images→text), 96 test, 96 registrazioni gaze.""")

code("""# Setup e caricamento dati
from pathlib import Path
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

sns.set_theme(style="whitegrid", palette="deep")
plt.rcParams["figure.dpi"] = 110

def find_study():
    for base in [Path.cwd(), *Path.cwd().parents]:
        if (base / "aoi_scores.csv").exists():
            return base
        if (base / "study" / "aoi_scores.csv").exists():
            return base / "study"
    raise FileNotFoundError("cartella study non trovata (aoi_scores.csv)")

STUDY = find_study()

# dataset unito AOI + punteggi + demografia (una riga per registrazione/test)
df = pd.read_csv(STUDY / "aoi_scores.csv")
df["good"] = df["good"].astype(str).str.lower().eq("true")

# punteggi con fascia MT e dettagli risposte
test = pd.read_excel(STUDY / "risultati_test.xlsx", sheet_name="Punteggi")

# Palette semantica condivisa col paper (scripts/make_paper_figures.py):
# text = blu acciaio, images = terracotta; sotto-aree caption declinazioni
# delle stesse famiglie; volto = prugna; fuori-AOI = grigio neutro;
# fasce MT = rampa sequenziale monocroma (ordine di rendimento).
COL_MOD = {"text": "#3667A8", "images": "#B4653A"}
COL_GRP = {"TI": "#3667A8", "IT": "#B4653A"}  # ordine: TI text-first, IT images-first
AOI_COL = {"caption: parole": "#729ED8", "caption: immagini": "#B4653A",
           "caption: banda": "#C9D4DF", "volto": "#92589B", "fuori AOI": "#BDBDBD"}
COL_SEX = {"M": "#4D4D4D", "F": "#8C8C8C"}    # neutri: nessuno stereotipo cromatico
FASCE = ["CCRD", "PSD", "RAD", "RIDI"]
FASCE_COL = {"CCRD": "#2F4F6F", "PSD": "#5F7F9E", "RAD": "#93A9BE", "RIDI": "#C8D3DD"}

print(f"Registrazioni/test: {len(df)}  ·  Soggetti: {df.newid.nunique()}  "
      f"(TI: {df[df.grp=='TI'].newid.nunique()}, IT: {df[df.grp=='IT'].newid.nunique()})")
print(f"Registrazioni gaze di buona qualità: {df.good.sum()}/{len(df)}")""")

md("## 1. La coorte (I-13, I-16)")

code("""# Composizione: classe x gruppo, sesso, età
kids = df.drop_duplicates("newid")[["newid", "grp", "classe", "sex", "age"]]
fig, axs = plt.subplots(1, 3, figsize=(13, 3.4))
ct = pd.crosstab(kids.classe, kids.grp)
ct.plot.bar(ax=axs[0], color=[COL_GRP[c] for c in ct.columns], rot=0)
axs[0].set_title("Bambini per classe × gruppo"); axs[0].set_xlabel("classe"); axs[0].set_ylabel("n")
ct2 = pd.crosstab(kids.sex, kids.grp)
ct2.plot.bar(ax=axs[1], color=[COL_GRP[c] for c in ct2.columns], rot=0)
axs[1].set_title("Sesso × gruppo"); axs[1].set_xlabel("")
sns.histplot(data=kids, x="age", hue="grp", multiple="dodge", discrete=True, palette=COL_GRP, ax=axs[2])
axs[2].set_title("Età × gruppo"); axs[2].set_xlabel("età")
plt.tight_layout(); plt.show()
kids.groupby("grp").agg(n=("newid", "count"), M=("sex", lambda s: (s=="M").sum()),
                        F=("sex", lambda s: (s=="F").sum()), eta_media=("age", "mean")).round(2)""")

md("""## 2. Effetto modalità sulla comprensione (I-01) — il risultato principale

Ogni bambino ha fatto una storia in *text* e una in *images*: il confronto giusto è **appaiato**.""")

code("""# Confronto appaiato images - text
piv = df.pivot_table(index=["newid", "grp", "sex"], columns="mod", values="score").reset_index()
piv["diff"] = piv["images"] - piv["text"]

fig, axs = plt.subplots(1, 3, figsize=(13, 4))
sns.boxplot(data=df, x="mod", y="score", hue="mod", order=["text", "images"],
            palette=COL_MOD, legend=False, ax=axs[0])
sns.stripplot(data=df, x="mod", y="score", order=["text", "images"], color=".25", size=3, ax=axs[0])
axs[0].set_title("Punteggio per modalità"); axs[0].set_xlabel(""); axs[0].set_ylabel("punteggio %")

for _, r in piv.iterrows():
    axs[1].plot([0, 1], [r["text"], r["images"]], color="grey", alpha=.4, lw=1)
axs[1].plot([0, 1], [piv["text"].mean(), piv["images"].mean()], color="#333333", lw=3, marker="o")
axs[1].set_xticks([0, 1], ["text", "images"]); axs[1].set_title("Coppie per bambino (nero = media)")
axs[1].set_ylabel("punteggio %")

sns.histplot(piv["diff"], bins=15, ax=axs[2], color="#9AA7B4")
axs[2].axvline(0, color="k"); axs[2].axvline(piv["diff"].mean(), color="#333333", lw=2, ls="--")
axs[2].set_title("Differenza images − text per bambino"); axs[2].set_xlabel("punti %")
plt.tight_layout(); plt.show()

d = piv["diff"].dropna()
t = d.mean() / (d.std(ddof=1) / len(d) ** 0.5)
print(f"images − text: {d.mean():+.1f} pt (sd {d.std(ddof=1):.1f}, n={len(d)}, t={t:.2f})  → nessun effetto (I-01)")
print(f"meglio images: {(d>0).sum()}  ·  meglio text: {(d<0).sum()}  ·  pari: {(d==0).sum()}")""")

code("""# Decomposizione del disegno incrociato: effetto modalità vs effetto posizione/storia
dti = piv.loc[piv.grp == "TI", "diff"].dropna()   # images-text = S2-S1
dit = piv.loc[piv.grp == "IT", "diff"].dropna()   # images-text = S1-S2
m = (dti.mean() + dit.mean()) / 2
p = (dti.mean() - dit.mean()) / 2
se = ((dti.std(ddof=1)**2/len(dti) + dit.std(ddof=1)**2/len(dit)) ** 0.5) / 2
print(f"effetto MODALITÀ  m = {m:+.1f} pt (t≈{m/se:.2f})   [I-01]")
print(f"effetto POSIZIONE/STORIA (S2−S1) p = {p:+.1f} pt (t≈{p/se:.2f})   [I-04]")
print(f"gruppi: TI {dti.mean():+.1f} pt (n={len(dti)}) · IT {dit.mean():+.1f} pt (n={len(dit)})")""")

md("""## 3. Interazione modalità × sesso (I-02) — esplorativa

I maschi rendono meglio col testo, le femmine con le immagini.""")

code("""fig, axs = plt.subplots(1, 2, figsize=(11, 4))
sns.pointplot(data=df, x="mod", y="score", hue="sex", order=["text", "images"],
              errorbar=("se", 1), dodge=.15, ax=axs[0], palette=COL_SEX)
axs[0].set_title("Punteggio medio (±1 SE)"); axs[0].set_xlabel(""); axs[0].set_ylabel("punteggio %")

sns.boxplot(data=piv, x="sex", y="diff", hue="sex", palette=COL_SEX,
            legend=False, ax=axs[1])
sns.stripplot(data=piv, x="sex", y="diff", color=".25", size=4, ax=axs[1])
axs[1].axhline(0, color="k", lw=1)
axs[1].set_title("Diff. appaiata images − text per sesso"); axs[1].set_ylabel("punti %")
plt.tight_layout(); plt.show()

for sx in ["M", "F"]:
    d = piv.loc[piv.sex == sx, "diff"].dropna()
    t = d.mean() / (d.std(ddof=1) / len(d) ** 0.5)
    print(f"{sx}: images − text = {d.mean():+.1f} pt (n={len(d)}, t={t:.2f})")
print("→ I-02: interazione ≈17 pt (esplorativa: n piccoli, nessuna correzione per confronti multipli)")""")

md("## 4. Storie, classi e fasce MT (I-05, I-09, I-10, I-11)")

code("""fig, axs = plt.subplots(1, 2, figsize=(13, 4.2))
order = df.groupby("storia")["score"].mean().sort_values(ascending=False).index
sns.barplot(data=df, x="storia", y="score", hue="mod", order=order, palette=COL_MOD,
            errorbar=("se", 1), ax=axs[0])
axs[0].tick_params(axis="x", rotation=30); axs[0].set_xlabel(""); axs[0].set_ylabel("punteggio %")
axs[0].set_title("Punteggio per storia × modalità (attenzione agli n piccoli)")

ft = (test.groupby(["Modalità", "Fascia MT"]).size().unstack(fill_value=0)
      .reindex(columns=FASCE).apply(lambda r: r / r.sum() * 100, axis=1))
ft.plot.bar(stacked=True, ax=axs[1], color=[FASCE_COL[f] for f in FASCE], rot=0)
axs[1].set_title("Fasce MT per modalità (%)  — norme 'all'uscita', descrittive")
axs[1].set_ylabel("% test"); axs[1].legend(title="", ncol=4, fontsize=8)
plt.tight_layout(); plt.show()

print("Differenza fra storie della stessa classe (S2−S1, entro bambino) [I-05]:")
pos = df.assign(pos=np.where(df.storia.isin(["volpe e boscaiolo", "gatta", "delfino", "anguille"]), "S1", "S2"))
pp = pos.pivot_table(index=["newid", "classe"], columns="pos", values="score").reset_index()
pp["diff"] = pp["S2"] - pp["S1"]
for cl, g in pp.groupby("classe"):
    d = g["diff"].dropna()
    if len(d) > 1:
        t = d.mean() / (d.std(ddof=1) / len(d) ** 0.5)
        print(f"  classe {cl}: {d.mean():+.1f} pt (n={len(d)}, t={t:.2f})")""")

md("""## 5. Dove guardano: AOI per modalità (I-25)

Percentuale di campioni gaze per area di interesse — metodo `web/analysis`, parametri `aoi_params.json`, calibrazione attiva.""")

code("""aoi_cols = ["pct_word", "pct_image", "pct_band", "pct_face", "pct_none"]
labels = {"pct_word": "caption: parole", "pct_image": "caption: immagini", "pct_band": "caption: banda",
          "pct_face": "volto", "pct_none": "fuori AOI"}
comp = df.groupby("mod")[aoi_cols].mean().reindex(["text", "images"]).rename(columns=labels)

fig, axs = plt.subplots(1, 2, figsize=(12.5, 4.2))
comp.plot.barh(stacked=True, ax=axs[0], color=[AOI_COL[c] for c in comp.columns])
axs[0].set_title("Composizione media dello sguardo"); axs[0].set_xlabel("% campioni")
axs[0].legend(fontsize=8, ncol=2)

pv = df.pivot_table(index="newid", columns="mod", values=["pct_caption", "pct_face"])
sh = pd.DataFrame({
    "caption": pv["pct_caption"]["images"] - pv["pct_caption"]["text"],
    "volto":   pv["pct_face"]["images"] - pv["pct_face"]["text"],
}).melt(var_name="AOI", value_name="diff")
sns.boxplot(data=sh, x="AOI", y="diff", hue="AOI", palette=["#3667A8", "#92589B"], legend=False, ax=axs[1])
sns.stripplot(data=sh, x="AOI", y="diff", color=".25", size=4, ax=axs[1])
axs[1].axhline(0, color="k", lw=1)
axs[1].set_title("Shift appaiato images − text (per bambino)"); axs[1].set_ylabel("punti %")
plt.tight_layout(); plt.show()

for name, s in [("caption", sh[sh.AOI=="caption"]["diff"].dropna()), ("volto", sh[sh.AOI=="volto"]["diff"].dropna())]:
    t = s.mean() / (s.std(ddof=1) / len(s) ** 0.5)
    print(f"shift {name}: {s.mean():+.1f} pt (n={len(s)}, t={t:.2f})")
print("→ I-25: con le images lo sguardo va sulle caption e lascia il volto — ma la comprensione non cambia (I-01)")""")

md("## 6. AOI ↔ punteggio (I-26, I-27, I-28)")

code("""g = df[df.good]
mets = ["pct_caption", "pct_word", "pct_image", "pct_face", "pct_mouth", "pct_eyes", "pct_none"]

fig, axs = plt.subplots(1, 3, figsize=(13.5, 4))
for ax, met in zip(axs, ["pct_caption", "pct_face", "pct_image"]):
    sns.scatterplot(data=g, x=met, y="score", hue="mod", palette=COL_MOD, s=28, ax=ax)
    for mod, gg in g.groupby("mod"):
        gg = gg.dropna(subset=[met, "score"])
        if len(gg) > 2 and gg[met].std() > 0:
            z = np.polyfit(gg[met], gg["score"], 1)
            xs = np.linspace(gg[met].min(), gg[met].max(), 20)
            ax.plot(xs, np.polyval(z, xs), color=COL_MOD[mod], lw=2)
    ax.set_ylabel("punteggio %"); ax.legend(fontsize=8)
plt.suptitle("AOI vs punteggio (solo registrazioni di buona qualità)", y=1.02)
plt.tight_layout(); plt.show()

rows = []
for met in mets:
    for label, gg in [("tutti", g), ("text", g[g["mod"]=="text"]), ("images", g[g["mod"]=="images"]),
                      ("M", g[g.sex=="M"]), ("F", g[g.sex=="F"])]:
        gg = gg.dropna(subset=[met, "score"])
        if len(gg) > 2 and gg[met].std() > 0:
            r = gg[met].corr(gg["score"])
            n = len(gg)
            t = r * ((n - 2) / (1 - r * r)) ** 0.5
            rows.append({"AOI": met, "gruppo": label, "r": round(r, 2), "n": n, "t": round(t, 2)})
corr = pd.DataFrame(rows).pivot(index="AOI", columns="gruppo", values="r")[["tutti", "text", "images", "M", "F"]]
corr.style.background_gradient(cmap="RdBu_r", vmin=-.5, vmax=.5).format("{:+.2f}")""")

md("""## 7. Analisi puntuale: lo sguardo nel momento dell'informazione (I-30…I-33)

Per ogni domanda "puntuale" (90 su 94) è definita la finestra temporale in cui la
narrazione dà l'informazione necessaria a rispondere (`question_windows.json`).
Qui: quota di sguardo sulle **parole-ancora** dentro la finestra vs correttezza
della risposta. Regole: soglia ≥5 campioni in finestra, bianche = errate,
padding −1.0/+1.5 s (sensitivity −0.5/+1.0 e −2.0/+3.0: risultati identici,
vedi `scripts/question_gaze.py`).""")

code("""qg = pd.read_csv(STUDY / "question_gaze.csv")
qg = qg[qg.incluso == 1].copy()
qg["esito"] = np.where(qg.correct == 1, "corretta", "errata")
print(f"Osservazioni incluse: {len(qg)}  ·  corrette: {qg.correct.mean()*100:.0f}%  ·  bianche (errate): {qg.blank.sum()}")

fig, axs = plt.subplots(1, 3, figsize=(13.5, 4))
sns.boxplot(data=qg, x="esito", y="pct_anchor", hue="mod", palette=COL_MOD, ax=axs[0])
axs[0].set_title("Quota sguardo sulle parole-ancora"); axs[0].set_ylabel("% campioni in finestra"); axs[0].set_xlabel("")

acc = qg.groupby(["mod", "any_anchor"])["correct"].agg(["mean", "count"]).reset_index()
acc["% corrette"] = acc["mean"] * 100
acc["ancora"] = np.where(acc.any_anchor == 1, "guardata", "non guardata")
sns.barplot(data=acc, x="mod", y="% corrette", hue="ancora", order=["text", "images"],
            palette={"guardata": "#4D4D4D", "non guardata": "#B0B0B0"}, ax=axs[1])
axs[1].set_title("% risposte corrette se l'ancora è stata guardata"); axs[1].set_xlabel("")
for c in axs[1].containers:
    axs[1].bar_label(c, fmt="%.0f%%", fontsize=9)

sns.boxplot(data=qg, x="esito", y="pct_face", hue="mod", palette=COL_MOD, ax=axs[2])
axs[2].set_title("Quota sguardo sul volto in finestra"); axs[2].set_ylabel("% campioni in finestra"); axs[2].set_xlabel("")
plt.tight_layout(); plt.show()

def welch(a, b):
    a, b = a.dropna(), b.dropna()
    return (a.mean() - b.mean()) / (a.var(ddof=1)/len(a) + b.var(ddof=1)/len(b)) ** 0.5

for mod in ["tutti", "text", "images"]:
    q = qg if mod == "tutti" else qg[qg["mod"] == mod]
    ok, ko = q[q.correct == 1]["pct_anchor"], q[q.correct == 0]["pct_anchor"]
    print(f"{mod:6}: ancora corrette {ok.mean():.1f}% vs errate {ko.mean():.1f}%  "
          f"(diff {ok.mean()-ko.mean():+.1f}, t={welch(ok, ko):+.2f})")
print("→ I-31: guardare l'informazione mentre viene narrata NON predice la correttezza")""")

code("""# Controllo anti pseudo-replicazione: differenza entro-soggetto (corrette - errate)
recs = []
for (nid, mod), g in qg.groupby(["newid", "mod"]):
    ok, ko = g[g.correct == 1]["pct_anchor"].dropna(), g[g.correct == 0]["pct_anchor"].dropna()
    if len(ok) and len(ko):
        recs.append({"newid": nid, "mod": mod, "diff": ok.mean() - ko.mean()})
sub = pd.DataFrame(recs)

fig, ax = plt.subplots(figsize=(6.5, 3.8))
sns.boxplot(data=sub, x="mod", y="diff", hue="mod", order=["text", "images"], palette=COL_MOD, legend=False, ax=ax)
sns.stripplot(data=sub, x="mod", y="diff", order=["text", "images"], color=".25", size=4, ax=ax)
ax.axhline(0, color="k", lw=1)
ax.set_title("Diff. entro-soggetto della quota-ancora (corrette − errate)")
ax.set_ylabel("punti %"); ax.set_xlabel("")
plt.tight_layout(); plt.show()

for mod, g in sub.groupby("mod"):
    d = g["diff"]
    t = d.mean() / (d.std(ddof=1) / len(d) ** 0.5)
    print(f"{mod:6}: n={len(d):2}  diff media={d.mean():+.1f} pt  t={t:+.2f}")
print("→ I-32: il segnale negativo del text a livello di osservazione (t=-2.43) sparisce entro-soggetto:")
print("  era un effetto TRA bambini (chi si aggrappa al testo sbaglia di più in generale), non momento-per-momento")""")

md("## 8. Qualità delle registrazioni gaze (I-29)")

code("""bad = df[~df.good][["newid", "pid", "storia", "mod", "n", "dur", "hz", "score"]]
print(f"{len(bad)} registrazioni sotto soglia (hz<5 o durata<40s) — I-25/I-26 non cambiano con/senza")
bad.sort_values(["newid", "storia"])""")

md("""## 9. Esplorazione interattiva

Filtra per gruppo, classe e sesso (richiede ipywidgets; in VS Code funziona out-of-the-box).""")

code("""try:
    from ipywidgets import interact, Dropdown

    def esplora(gruppo="tutti", classe="tutte", sesso="tutti"):
        q = df.copy()
        if gruppo != "tutti": q = q[q.grp == gruppo]
        if classe != "tutte": q = q[q.classe.astype(str) == classe]
        if sesso != "tutti": q = q[q.sex == sesso]
        if q.empty:
            print("nessun dato con questi filtri"); return
        fig, axs = plt.subplots(1, 2, figsize=(11, 3.6))
        sns.boxplot(data=q, x="mod", y="score", hue="mod", order=["text", "images"],
                    palette=COL_MOD, legend=False, ax=axs[0])
        sns.stripplot(data=q, x="mod", y="score", order=["text", "images"], color=".25", size=4, ax=axs[0])
        axs[0].set_title(f"Punteggi (n={len(q)})"); axs[0].set_ylabel("punteggio %"); axs[0].set_xlabel("")
        comp = q.groupby("mod")[aoi_cols].mean().reindex(["text", "images"]).rename(columns=labels)
        comp.plot.barh(stacked=True, ax=axs[1], color=[AOI_COL.get(c, "#BDBDBD") for c in comp.columns], legend=False)
        axs[1].set_title("AOI medie"); axs[1].set_xlabel("% campioni")
        plt.tight_layout(); plt.show()
        print(q.groupby("mod")["score"].agg(["count", "mean", "std"]).round(1))

    interact(esplora,
             gruppo=Dropdown(options=["tutti", "TI", "IT"], description="gruppo"),
             classe=Dropdown(options=["tutte"] + sorted(df.classe.astype(str).unique()), description="classe"),
             sesso=Dropdown(options=["tutti", "M", "F"], description="sesso"))
except ImportError:
    print("ipywidgets non disponibile: usa i filtri modificando le celle sopra")""")

md("""## 10. Insights completi

Il registro completo (con etichette di solidità e id citabili) è in `study/INSIGHTS.md`:""")

code("""from IPython.display import Markdown
Markdown((STUDY / "INSIGHTS.md").read_text(encoding="utf-8"))""")

nb["cells"] = cells
nb["metadata"]["language_info"] = {"name": "python"}
out = OUT / "risultati.ipynb"
nbf.write(nb, str(out))
print(f"Notebook scritto: {out} ({len(cells)} celle)")

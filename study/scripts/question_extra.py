# -*- coding: utf-8 -*-
"""Analisi C7-C10 a livello di domanda.

C7  esplicite vs inferenziali x modalità (classificazione MT-template, valida
    solo per le 4 storie a 10 domande; da verificare sul manuale MT).
C8  congruenza video->foglio: le domande con OPZIONI A IMMAGINI sul testsheet
    vanno meglio se il bambino ha visto la storia in modalità images?
C9  posizione dell'informazione nella storia vs correttezza.
C10 analisi psicometrica item: difficoltà, discriminazione (item-rest), distrattori.

Output: study/item_analysis.csv + statistiche a video.
"""
import csv
import json
from pathlib import Path

import openpyxl

STUDY = Path(__file__).resolve().parent.parent

key_data = json.loads((STUDY / "chiave_derivata.json").read_text(encoding="utf-8"))
KEY = {k: v for k, v in key_data.items() if not k.startswith("_")}
ALT = key_data.get("_accetta_anche", {})
MAPPING = json.loads((STUDY / "mappatura_soggetti.json").read_text(encoding="utf-8"))["mapping"]
windows = json.loads((STUDY / "question_windows.json").read_text(encoding="utf-8"))

EN2IT = {"fox": "volpe e boscaiolo", "carpet": "tappeto", "cats": "gatta", "yawn": "sbadiglio",
         "dolphin": "delfino", "panda": "panda", "bear": "orso", "eels": "anguille"}
FIRST_STORIES = {"volpe e boscaiolo", "gatta", "delfino", "anguille"}

# domande con opzioni a immagini sul testsheet adattato (dai PDF)
IMG_OPTIONS = {"volpe e boscaiolo": {2, 3, 4, 5, 6}, "tappeto": {2, 4, 5, 7, 9},
               "gatta": {1, 2}, "sbadiglio": {1, 3, 6, 7, 8},  # numerazione MT: 3=donna (immagini), 2=sorellina (testo)
               "delfino": set(), "panda": set(), "orso": set(), "anguille": set()}

# classificazione MT-template (SOLO storie a 10 domande; da verificare sul manuale)
MT_ESPLICITE = {1, 3, 4, 6, 8}
TEN_Q_STORIES = ["volpe e boscaiolo", "tappeto", "sbadiglio", "anguille"]

# modalità vista per (pid, storia): dal gaze
import re
gaze_mod = {}
GAZE = STUDY.parent / "data" / "02_gaze"
for folder in sorted(GAZE.iterdir()):
    if not folder.is_dir() or not folder.name.startswith("data_"):
        continue
    for f in sorted(folder.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        pid = str(d.get("participantId", "")).strip("`").strip().upper()
        st = EN2IT.get(d.get("story"))
        if st and re.match(r"^[BF]\d+$", pid):
            gaze_mod[(pid, st)] = d.get("typology")

# risposte per domanda (solo soggetti validi)
wb = openpyxl.load_workbook(STUDY / "test.xlsx")
obs = []   # una riga per (soggetto valido, storia, domanda)
for r in list(wb["PROVE"].iter_rows(values_only=True))[1:]:
    if not r[0] or not r[1]:
        continue
    pid, storia = str(r[0]).strip().upper(), str(r[1]).strip()
    if pid not in MAPPING:
        continue
    key = KEY[storia]
    mod = gaze_mod.get((pid, storia))
    given_list = [str(r[2 + i]).strip().lower() if r[2 + i] is not None else "" for i in range(len(key))]
    ok_fn = lambda i, a: a == key[i - 1] or a in ALT.get(storia, {}).get(str(i), [])
    tot_correct = sum(1 for i, a in enumerate(given_list, start=1) if ok_fn(i, a))
    for qi, (a, k) in enumerate(zip(given_list, key), start=1):
        obs.append({"pid": pid, "newid": MAPPING[pid], "storia": storia, "q": qi,
                    "mod": mod, "given": a, "correct": int(ok_fn(qi, a)),
                    "rest": tot_correct - int(ok_fn(qi, a)), "n_q": len(key)})

def mean(xs): return sum(xs) / len(xs) if xs else float("nan")
def sd(xs):
    if len(xs) < 2: return float("nan")
    m = mean(xs)
    return (sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) ** 0.5
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

# ---------- C7: esplicite vs inferenziali x modalità ----------
print("=== C7) Esplicite vs inferenziali x modalità (storie a 10 domande; classificazione MT-template, da verificare) ===")
sub7 = [o for o in obs if o["storia"] in TEN_Q_STORIES and o["mod"]]
for tipo, qs in [("esplicite", MT_ESPLICITE), ("inferenziali", set(range(1, 11)) - MT_ESPLICITE)]:
    line = f"  {tipo:12}:"
    accs = {}
    for mod in ("text", "images"):
        xs = [o["correct"] for o in sub7 if o["q"] in qs and o["mod"] == mod]
        accs[mod] = mean(xs) * 100
        line += f"  {mod}={accs[mod]:5.1f}% (n={len(xs):3})"
    line += f"  diff img-txt={accs['images']-accs['text']:+.1f}"
    print(line)
# interazione entro bambino: (acc_img - acc_txt) per tipo domanda
print("  entro bambino (diff images-text per tipo):")
for tipo, qs in [("esplicite", MT_ESPLICITE), ("inferenziali", set(range(1, 11)) - MT_ESPLICITE)]:
    bysub = {}
    for o in sub7:
        if o["q"] in qs:
            bysub.setdefault(o["newid"], {}).setdefault(o["mod"], []).append(o["correct"])
    dd = [mean(v["images"]) - mean(v["text"]) for v in bysub.values() if "text" in v and "images" in v]
    t = mean(dd) / (sd(dd) / len(dd) ** 0.5) if len(dd) > 1 else float("nan")
    print(f"    {tipo:12}: n={len(dd):2}  diff={mean(dd)*100:+.1f} pt  t={t:+.2f}")

# ---------- C8: congruenza video->foglio ----------
print("\n=== C8) Domande con opzioni a immagini sul foglio x modalità vista ===")
res = {}
for opt, lbl in [(True, "opzioni a immagini"), (False, "opzioni testuali")]:
    accs = {}
    for mod in ("text", "images"):
        xs = [o["correct"] for o in obs if o["mod"] == mod
              and ((o["q"] in IMG_OPTIONS[o["storia"]]) == opt)]
        accs[mod] = mean(xs) * 100
        res[(opt, mod)] = xs
    print(f"  {lbl:20}: text={accs['text']:5.1f}% (n={len(res[(opt,'text')]):3})  "
          f"images={accs['images']:5.1f}% (n={len(res[(opt,'images')]):3})  diff={accs['images']-accs['text']:+.1f}")
# interazione entro bambino (solo storie 1-3 che hanno entrambe i tipi di opzioni)
print("  entro bambino (diff images-text):")
for opt, lbl in [(True, "opzioni a immagini"), (False, "opzioni testuali (stesse storie)")]:
    bysub = {}
    for o in obs:
        if not o["mod"] or not IMG_OPTIONS[o["storia"]]:
            continue  # solo storie che hanno domande a immagini
        if (o["q"] in IMG_OPTIONS[o["storia"]]) == opt:
            bysub.setdefault(o["newid"], {}).setdefault(o["mod"], []).append(o["correct"])
    dd = [mean(v["images"]) - mean(v["text"]) for v in bysub.values() if "text" in v and "images" in v]
    t = mean(dd) / (sd(dd) / len(dd) ** 0.5) if len(dd) > 1 else float("nan")
    print(f"    {lbl:32}: n={len(dd):2}  diff={mean(dd)*100:+.1f} pt  t={t:+.2f}")

# ---------- C9: posizione dell'informazione ----------
print("\n=== C9) Posizione dell'informazione nella storia vs correttezza (domande puntuali) ===")
# posizione normalizzata = t_first_word / max(t_last_word) della variante
pos_norm = {}
for storia, qs in windows.items():
    if storia.startswith("_"):
        continue
    for q, obj in qs.items():
        for wk, w in (obj.get("windows") or {}).items():
            dur = max(x["t_last_word"] for o2 in qs.values() if o2.get("windows")
                      for k2, x in o2["windows"].items() if k2 == wk)
            pos_norm[(storia, int(q), wk)] = w["t_first_word"] / dur
poss, corrs = [], []
for o in obs:
    if not o["mod"]:
        continue
    # ricava wkey dalla classe implicita nelle finestre disponibili
    for wk in (f"1_{o['mod']}", f"2_{o['mod']}", f"3_{o['mod']}", f"4_{o['mod']}", f"5_{o['mod']}"):
        p = pos_norm.get((o["storia"], o["q"], wk))
        if p is not None:
            poss.append(p); corrs.append(o["correct"])
            break
r = pearson(poss, corrs)
n = len(poss)
t = r * ((n - 2) / (1 - r * r)) ** 0.5
print(f"  r posizione-correttezza = {r:+.3f} (n={n}, t={t:+.2f})")
for terzo, lo, hi in [("inizio", 0, 1/3), ("centro", 1/3, 2/3), ("fine", 2/3, 1.01)]:
    xs = [c for p, c in zip(poss, corrs) if lo <= p < hi]
    print(f"  info nel {terzo:6}: {mean(xs)*100:5.1f}% corrette (n={len(xs)})")

# ---------- C10: item analysis ----------
print("\n=== C10) Item analysis (difficoltà p, discriminazione item-rest, item problematici) ===")
items = []
for storia in KEY:
    nq = len(KEY[storia])
    for qi in range(1, nq + 1):
        oo = [o for o in obs if o["storia"] == storia and o["q"] == qi]
        if not oo:
            continue
        p = mean([o["correct"] for o in oo])
        disc = pearson([o["correct"] for o in oo], [o["rest"] for o in oo])
        # distrattore più scelto tra gli errori
        wrong = {}
        for o in oo:
            if not o["correct"]:
                wrong[o["given"] or "(bianco)"] = wrong.get(o["given"] or "(bianco)", 0) + 1
        top_d = max(wrong.items(), key=lambda kv: kv[1])[0] if wrong else ""
        items.append({"storia": storia, "q": qi, "n": len(oo), "p": round(p, 2),
                      "disc": round(disc, 2) if disc == disc else None,
                      "chiave": KEY[storia][qi - 1], "distrattore_top": top_d,
                      "opzioni_img": int(qi in IMG_OPTIONS[storia])})
with open(STUDY / "item_analysis.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(items[0].keys()))
    w.writeheader(); [w.writerow(i) for i in items]
flag = [i for i in items if (i["p"] is not None and (i["p"] < 0.3 or i["p"] > 0.95))
        or (i["disc"] is not None and i["disc"] < 0.1)]
print(f"  {len(items)} item -> item_analysis.csv; item problematici (p<.30, p>.95 o disc<.10): {len(flag)}")
for i in sorted(flag, key=lambda i: (i["storia"], i["q"])):
    print(f"    {i['storia'][:14]:14} Q{i['q']:<2} p={i['p']:.2f} disc={i['disc']}  "
          f"chiave={i['chiave']}  distrattore_top={i['distrattore_top']}")

# -*- coding: utf-8 -*-
"""Analisi puntuale: dove guardava il bambino mentre veniva narrata
l'informazione necessaria a rispondere a ciascuna domanda?

Per ogni soggetto valido x domanda puntuale:
  - finestra temporale della variante vista (question_windows.json, tempi
    t_first/last_word + padding);
  - campioni gaze in finestra categorizzati con il motore AOI (aoi_lib);
  - metrica chiave: % campioni sulle PAROLE-ANCORA (word_ids della finestra);
  - esito: risposta corretta/errata (chiave derivata; bianche = errate).

Regole concordate: soglia >=5 campioni in finestra; padding primario
-1.0/+1.5 s con sensitivity a -0.5/+1.0 e -2.0/+3.0.

Output: study/question_gaze.csv (padding primario) + statistiche a video.
"""
import csv
import json
import re
from pathlib import Path

import openpyxl

import aoi_lib
from aoi_lib import EN2IT, categorize, compute_calibration, gaze_to_fraction, load_tracking

STUDY = Path(__file__).resolve().parent.parent
GAZE = STUDY.parent / "data" / "02_gaze"

MIN_SAMPLES = 5
PADDINGS = {"primario": (1.0, 1.5), "stretto": (0.5, 1.0), "largo": (2.0, 3.0)}

windows = json.loads((STUDY / "question_windows.json").read_text(encoding="utf-8"))
key_data = json.loads((STUDY / "chiave_derivata.json").read_text(encoding="utf-8"))
KEY = {k: v for k, v in key_data.items() if not k.startswith("_")}
MAPPING = json.loads((STUDY / "mappatura_soggetti.json").read_text(encoding="utf-8"))["mapping"]

DEMO = {}
with open(STUDY / "demo.csv", newline="", encoding="utf-8-sig") as fh:
    for row in csv.DictReader(fh, delimiter="\t"):
        DEMO[row["ID"].strip().upper()] = {"age": int(row["AGE"]), "sex": row["SEX"].strip().upper()}

# risposte per domanda: (pid, storia) -> [lettera, ...]
answers = {}
wb = openpyxl.load_workbook(STUDY / "test.xlsx")
for r in list(wb["PROVE"].iter_rows(values_only=True))[1:]:
    if not r[0] or not r[1]:
        continue
    pid, storia = str(r[0]).strip().upper(), str(r[1]).strip()
    n = len(KEY[storia])
    answers[(pid, storia)] = [str(r[2 + i]).strip().lower() if r[2 + i] is not None else ""
                              for i in range(n)]

# ---------- elaborazione ----------

rows = []          # padding primario, una riga per osservazione
sens_rows = []     # (pad_label, mod, pct_anchor, correct, n_win) per sensitivity

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
        storia = EN2IT[story_en]
        cls, typ = str(d.get("class")), d.get("typology")
        tr = load_tracking(cls, story_en, typ)
        vp = d.get("viewport") or {}
        cal = compute_calibration(d.get("calibration"))
        samples = d.get("samples") or []

        cats = []  # (t, cat, sub, wid)
        for s in samples:
            g = s.get("gaze")
            gf = gaze_to_fraction(g["x"], g["y"], vp.get("width"), vp.get("height"), cal) if g else None
            t = float(s["t"])
            cats.append((t, *categorize(gf, t, tr)))
        dur = cats[-1][0] if cats else 0.0
        hz = len(cats) / dur if dur else 0.0
        rec_good = hz >= 5 and dur >= 40

        ans = answers.get((pid, storia))
        wkey = f"{cls}_{typ}"
        for q, obj in windows[storia].items():
            if obj["type"] != "puntuale":
                continue
            w = obj["windows"].get(wkey)
            if not w:
                continue
            qi = int(q) - 1
            given = ans[qi] if ans and qi < len(ans) else ""
            correct = 1 if given == KEY[storia][qi] else 0
            blank = given == ""
            anchor_ids = set(w["word_ids"])

            for pad_label, (pb, pa) in PADDINGS.items():
                t0 = w["t_first_word"] - pb
                t1 = w["t_last_word"] + pa
                inw = [c for c in cats if t0 <= c[0] <= t1]
                n_win = len(inw)
                n_anchor = sum(1 for c in inw if c[1] == "caption" and c[3] in anchor_ids)
                if pad_label != "primario":
                    if n_win >= MIN_SAMPLES:
                        sens_rows.append((pad_label, typ, n_anchor / n_win * 100, correct))
                    continue
                cnt = {"caption": 0, "face": 0, "none": 0}
                sub = {"word": 0, "image": 0}
                for c in inw:
                    cnt[c[1]] += 1
                    if c[1] == "caption" and c[2] in sub:
                        sub[c[2]] += 1
                pct = lambda v: round(v / n_win * 100, 1) if n_win else None
                rows.append({
                    "newid": MAPPING[pid], "pid": pid, "grp": MAPPING[pid][:2],
                    "sex": DEMO.get(pid, {}).get("sex"), "age": DEMO.get(pid, {}).get("age"),
                    "classe": cls, "storia": storia, "mod": typ, "q": int(q),
                    "correct": correct, "blank": int(blank),
                    "indiretta": int("note" in obj),
                    "t0": round(t0, 2), "t1": round(t1, 2),
                    "n_win": n_win, "incluso": int(n_win >= MIN_SAMPLES),
                    "rec_good": int(rec_good),
                    "n_anchor": n_anchor, "pct_anchor": pct(n_anchor),
                    "pct_caption": pct(cnt["caption"]), "pct_word": pct(sub["word"]),
                    "pct_image": pct(sub["image"]), "pct_face": pct(cnt["face"]),
                    "pct_none": pct(cnt["none"]),
                    "any_anchor": int(n_anchor > 0),
                })

# ---------- export ----------

cols = list(rows[0].keys())
with open(STUDY / "question_gaze.csv", "w", newline="", encoding="utf-8") as fh:
    wcsv = csv.DictWriter(fh, fieldnames=cols)
    wcsv.writeheader()
    for r in sorted(rows, key=lambda r: (r["grp"], int(r["newid"][2:]), r["storia"], r["q"])):
        wcsv.writerow(r)

inc = [r for r in rows if r["incluso"]]
print(f"Osservazioni totali: {len(rows)}; incluse (n>= {MIN_SAMPLES} campioni in finestra): {len(inc)}")
print(f"  risposte corrette: {sum(r['correct'] for r in inc)} ({sum(r['correct'] for r in inc)/len(inc)*100:.0f}%)"
      f"  ·  bianche (contate errate): {sum(r['blank'] for r in inc)}")

# ---------- statistiche ----------

def mean(xs): return sum(xs) / len(xs) if xs else float("nan")
def sd(xs):
    if len(xs) < 2: return float("nan")
    m = mean(xs)
    return (sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) ** 0.5
def welch(a, b):
    if len(a) < 2 or len(b) < 2: return float("nan")
    return (mean(a) - mean(b)) / (sd(a) ** 2 / len(a) + sd(b) ** 2 / len(b)) ** 0.5

def compare(rows_, metric, label):
    ok = [r[metric] for r in rows_ if r["correct"] == 1 and r[metric] is not None]
    ko = [r[metric] for r in rows_ if r["correct"] == 0 and r[metric] is not None]
    t = welch(ok, ko)
    print(f"  {label:34} corrette={mean(ok):5.1f}% (n={len(ok):3})  errate={mean(ko):5.1f}% (n={len(ko):3})"
          f"  diff={mean(ok)-mean(ko):+5.1f}  t={t:+.2f}{' *' if abs(t) >= 2 else ''}")

print("\n=== Sguardo in finestra vs correttezza (osservazioni, padding primario) ===")
for met in ("pct_anchor", "pct_caption", "pct_word", "pct_image", "pct_face", "pct_none"):
    compare(inc, met, met)

print("\n--- per modalità ---")
for mod in ("text", "images"):
    sub_ = [r for r in inc if r["mod"] == mod]
    print(f" {mod}:")
    for met in ("pct_anchor", "pct_caption", "pct_face"):
        compare(sub_, met, met)

print("\n--- per sesso ---")
for sx in ("M", "F"):
    sub_ = [r for r in inc if r["sex"] == sx]
    print(f" {sx}:")
    for met in ("pct_anchor", "pct_face"):
        compare(sub_, met, met)

# 2x2: ha guardato l'ancora almeno una volta?
print("\n=== Ha guardato l'ancora almeno una volta? (incluse) ===")
for mod in ("tutti", "text", "images"):
    sub_ = inc if mod == "tutti" else [r for r in inc if r["mod"] == mod]
    a = sum(1 for r in sub_ if r["any_anchor"] and r["correct"])       # guardato, corretta
    b = sum(1 for r in sub_ if r["any_anchor"] and not r["correct"])   # guardato, errata
    c = sum(1 for r in sub_ if not r["any_anchor"] and r["correct"])
    dd = sum(1 for r in sub_ if not r["any_anchor"] and not r["correct"])
    p_look = a / (a + b) * 100 if a + b else float("nan")
    p_nolook = c / (c + dd) * 100 if c + dd else float("nan")
    orr = (a * dd) / (b * c) if b * c else float("nan")
    print(f"  {mod:6}: guardata -> {p_look:.0f}% corrette (n={a+b}) · non guardata -> {p_nolook:.0f}% corrette (n={c+dd}) · OR={orr:.2f}")

# aggregato per soggetto (anti pseudo-replicazione)
print("\n=== Aggregato per soggetto: media pct_anchor su corrette vs errate ===")
bysub = {}
for r in inc:
    if r["pct_anchor"] is None:
        continue
    e = bysub.setdefault(r["newid"], {"ok": [], "ko": []})
    e["ok" if r["correct"] else "ko"].append(r["pct_anchor"])
dif = [(mean(e["ok"]) - mean(e["ko"])) for e in bysub.values() if e["ok"] and e["ko"]]
t = mean(dif) / (sd(dif) / len(dif) ** 0.5) if len(dif) > 1 else float("nan")
print(f"  soggetti con corrette ed errate: {len(dif)}  diff media={mean(dif):+.1f} pt  t appaiato={t:+.2f}")

# sensitivity sul padding
print("\n=== Sensitivity padding (diff pct_anchor corrette-errate, osservazioni) ===")
prim_ok = [r["pct_anchor"] for r in inc if r["correct"] and r["pct_anchor"] is not None]
prim_ko = [r["pct_anchor"] for r in inc if not r["correct"] and r["pct_anchor"] is not None]
print(f"  primario (-1.0/+1.5): diff={mean(prim_ok)-mean(prim_ko):+.1f}  t={welch(prim_ok, prim_ko):+.2f}")
for lab in ("stretto", "largo"):
    ok = [p for pl, m, p, c in sens_rows if pl == lab and c == 1]
    ko = [p for pl, m, p, c in sens_rows if pl == lab and c == 0]
    pads = PADDINGS[lab]
    print(f"  {lab:8} (-{pads[0]}/+{pads[1]}): diff={mean(ok)-mean(ko):+.1f}  t={welch(ok, ko):+.2f}")

print(f"\nSalvato: question_gaze.csv ({len(rows)} righe, col 'incluso' = soglia campioni)")

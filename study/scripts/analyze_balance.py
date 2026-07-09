# -*- coding: utf-8 -*-
"""Analisi dei bilanciamenti e degli effetti (ordine, modalità, storia, classe).

Struttura del disegno: ogni bambino fa 2 storie della sua classe, sempre nello
stesso ordine (S1 poi S2); track B = S1 text + S2 images, track F = S1 images +
S2 text. Quindi ordine di modalità == track == postazione/narratrice.
Il disegno incrociato permette di separare effetto MODALITÀ ed effetto
POSIZIONE/STORIA: per i B, (images-text) = (S2-S1); per gli F, (images-text) = (S1-S2).
  effetto modalità  m = (diff_B + diff_F) / 2
  effetto posizione p = (diff_B - diff_F) / 2   (S2 - S1, al netto della modalità)
"""
import json
import re
from pathlib import Path

import openpyxl

STUDY = Path(__file__).resolve().parent.parent
GAZE = STUDY.parent / "data" / "02_gaze"

data = json.loads((STUDY / "chiave_derivata.json").read_text(encoding="utf-8"))
KEY = {k: v for k, v in data.items() if not k.startswith("_")}

EN2IT = {"fox": "volpe e boscaiolo", "carpet": "tappeto", "cats": "gatta", "yawn": "sbadiglio",
         "dolphin": "delfino", "panda": "panda", "bear": "orso", "eels": "anguille"}
FIRST_STORIES = {"volpe e boscaiolo", "gatta", "delfino", "anguille"}
STORY_PAIR = {"1": ("volpe e boscaiolo", "tappeto"), "2": ("volpe e boscaiolo", "tappeto"),
              "3": ("gatta", "sbadiglio"), "4": ("delfino", "panda"), "5": ("anguille", "orso")}

# --- gaze: modalità effettiva, classe, ora, cartella, ordine reale ---
gaze_mod, gaze_cls, gaze_time, gaze_folder = {}, {}, {}, {}
for folder in sorted(GAZE.iterdir()):
    if not folder.is_dir() or not folder.name.startswith("data_"):
        continue
    for f in sorted(folder.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        pid = str(d.get("participantId", "")).strip("`").strip().upper()
        if not re.match(r"^[BF]\d+$", pid):
            continue
        st = EN2IT.get(d.get("story"))
        if st:
            gaze_mod[(pid, st)] = d.get("typology")
            gaze_cls[pid] = str(d.get("class", ""))
            gaze_time[(pid, st)] = f.name[:15]
            gaze_folder[(pid, st)] = folder.name

def design_modality(pid, storia):
    first = storia in FIRST_STORIES
    return ("text" if first else "images") if pid[0] == "B" else ("images" if first else "text")

# --- test scoring ---
wb = openpyxl.load_workbook(STUDY / "test.xlsx")
rows = list(wb["PROVE"].iter_rows(values_only=True))
records = []
for r in rows[1:]:
    if not r[0] or not r[1]:
        continue
    pid, storia = str(r[0]).strip().upper(), str(r[1]).strip()
    key = KEY[storia]
    given = [str(r[2+i]).strip().lower() if r[2+i] is not None else "" for i in range(len(key))]
    if all(a == "" for a in given):
        continue
    correct = sum(1 for a, k in zip(given, key) if a == k)
    mod = gaze_mod.get((pid, storia)) or design_modality(pid, storia)
    records.append({
        "pid": pid, "track": pid[0], "classe": gaze_cls.get(pid, "?"),
        "storia": storia, "mod": mod,
        "pos": 1 if storia in FIRST_STORIES else 2,
        "pct": correct / len(key) * 100,
        "sessione": ("pomeriggio" if gaze_folder.get((pid, storia), "").endswith("2")
                     else "mattina" if (pid, storia) in gaze_folder else "?"),
    })

def mean(xs): return sum(xs) / len(xs) if xs else float("nan")
def sd(xs):
    if len(xs) < 2: return float("nan")
    m = mean(xs)
    return (sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) ** 0.5
def tstat(xs):
    return mean(xs) / (sd(xs) / len(xs) ** 0.5) if len(xs) > 1 and sd(xs) > 0 else float("nan")
def t2(a, b):
    # Welch
    va, vb = sd(a) ** 2 / len(a), sd(b) ** 2 / len(b)
    return (mean(a) - mean(b)) / (va + vb) ** 0.5

bypid = {}
for r in records:
    bypid.setdefault(r["pid"], []).append(r)

# ordine reale dal gaze (controllo)
print("=== Controllo ordine reale (timestamp gaze) ===")
anom = 0
for pid, rs in sorted(bypid.items()):
    times = [(gaze_time.get((pid, x["storia"])), x["pos"]) for x in rs]
    times = [(t, p) for t, p in times if t]
    if len(times) == 2:
        (t1, p1), (t2_, p2) = sorted(times)
        if p1 != 1:
            anom += 1
            print(f"  {pid}: ha fatto PRIMA la storia 2! {times}")
if not anom:
    print("  tutti i bambini con doppio gaze hanno fatto S1 prima di S2 (ordine protocollo rispettato)")

# 1) bilanciamento classe x track
print("\n=== 1) Bilanciamento classe x ordine/track (bambini con almeno un test) ===")
print("  (track B = text-prima; track F = images-prima)")
kids = {pid: rs[0] for pid, rs in bypid.items()}
classes = sorted({k["classe"] for k in kids.values()})
print(f"  {'classe':8} {'B':>4} {'F':>4}")
for cl in classes:
    nb = sum(1 for k in kids.values() if k["classe"] == cl and k["track"] == "B")
    nf = sum(1 for k in kids.values() if k["classe"] == cl and k["track"] == "F")
    print(f"  {cl:8} {nb:4} {nf:4}")
print("  coppie valide (1 text + 1 images):")
pairs = {}
for pid, rs in bypid.items():
    if len(rs) == 2 and sorted(x["mod"] for x in rs) == ["images", "text"]:
        pairs[pid] = rs
print(f"  {'classe':8} {'B':>4} {'F':>4}")
for cl in classes:
    nb = sum(1 for p, rs in pairs.items() if rs[0]["classe"] == cl and p[0] == "B")
    nf = sum(1 for p, rs in pairs.items() if rs[0]["classe"] == cl and p[0] == "F")
    print(f"  {cl:8} {nb:4} {nf:4}")

# 2) text-prima vs images-prima (punteggio medio del bambino)
print("\n=== 2) Ordine: text-prima (B) vs images-prima (F) ===")
print("  NB: ordine == track == postazione/narratrice: non separabili tra loro.")
sb = [mean([x["pct"] for x in rs]) for pid, rs in bypid.items() if pid[0] == "B" and len(rs) == 2]
sf = [mean([x["pct"] for x in rs]) for pid, rs in bypid.items() if pid[0] == "F" and len(rs) == 2]
print(f"  B (text-prima):  n={len(sb):2}  media bambino={mean(sb):5.1f}%  sd={sd(sb):4.1f}")
print(f"  F (images-prima): n={len(sf):2}  media bambino={mean(sf):5.1f}%  sd={sd(sf):4.1f}")
print(f"  diff={mean(sf)-mean(sb):+.1f} pt  t(Welch)={t2(sf, sb):.2f}")

# 3+decomposizione) modalità e posizione dal disegno incrociato
print("\n=== 3) Modalità (images - text) e decomposizione modalità/posizione ===")
db = [next(x["pct"] for x in rs if x["mod"] == "images") - next(x["pct"] for x in rs if x["mod"] == "text")
      for pid, rs in pairs.items() if pid[0] == "B"]
df_ = [next(x["pct"] for x in rs if x["mod"] == "images") - next(x["pct"] for x in rs if x["mod"] == "text")
       for pid, rs in pairs.items() if pid[0] == "F"]
alld = db + df_
print(f"  appaiato complessivo: n={len(alld)}  diff media={mean(alld):+.1f} pt  t={tstat(alld):.2f}")
print(f"  nei B (images-text = S2-S1): n={len(db):2}  {mean(db):+.1f} pt")
print(f"  negli F (images-text = S1-S2): n={len(df_):2}  {mean(df_):+.1f} pt")
m = (mean(db) + mean(df_)) / 2
p = (mean(db) - mean(df_)) / 2
se = ((sd(db) ** 2 / len(db) + sd(df_) ** 2 / len(df_)) ** 0.5) / 2
print(f"  -> effetto MODALITÀ  m={m:+.1f} pt (t≈{m/se:.2f})")
print(f"  -> effetto POSIZIONE/STORIA p (S2-S1)={p:+.1f} pt (t≈{p/se:.2f})")
print("     (posizione e identità della storia non separabili: S1/S2 sono storie fisse)")

# 4) storie della stessa classe (S1 vs S2, entro bambino, tutte le coppie di test)
print("\n=== 4) Differenza tra storie della stessa classe (S2 - S1, entro bambino) ===")
for cl in [c for c in classes if c in STORY_PAIR]:
    s1n, s2n = STORY_PAIR[cl]
    ds = []
    for pid, rs in bypid.items():
        if len(rs) == 2 and rs[0]["classe"] == cl:
            v1 = next((x["pct"] for x in rs if x["pos"] == 1), None)
            v2 = next((x["pct"] for x in rs if x["pos"] == 2), None)
            if v1 is not None and v2 is not None:
                ds.append(v2 - v1)
    if ds:
        print(f"  classe {cl} ({s2n} - {s1n}): n={len(ds):2}  diff={mean(ds):+.1f} pt  t={tstat(ds):.2f}")

# 5) storie di classi diverse
print("\n=== 5) Differenza tra storie di classi diverse (media %, entrambe le modalità) ===")
print("  NB: prove diverse (n domande e difficoltà diverse): confronto solo descrittivo.")
for st in sorted(KEY, key=lambda s: (s not in FIRST_STORIES, s)):
    xs = [r["pct"] for r in records if r["storia"] == st]
    if xs:
        cl = next((c for c, pr in STORY_PAIR.items() if st in pr), "?")
        print(f"  {st:18} (cl.{cl}, {len(KEY[st])} dom.): n={len(xs):2}  media={mean(xs):5.1f}%  sd={sd(xs):4.1f}")

# 6) altre combinazioni rapide
print("\n=== 6) Altre combinazioni ===")
print("  a) sessione (mattina/pomeriggio):")
for s in ["mattina", "pomeriggio"]:
    xs = [r["pct"] for r in records if r["sessione"] == s]
    print(f"     {s:11}: n={len(xs):3}  media={mean(xs):5.1f}%  sd={sd(xs):4.1f}")
xm = [r["pct"] for r in records if r["sessione"] == "mattina"]
xp = [r["pct"] for r in records if r["sessione"] == "pomeriggio"]
print(f"     diff={mean(xp)-mean(xm):+.1f} pt  t(Welch)={t2(xp, xm):.2f}  "
      f"(pomeriggio = quasi solo classe 1: confuso con la classe)")
print("  b) pomeriggio, solo classe 1 (dove ci sono entrambi i track):")
for tr in ["B", "F"]:
    xs = [r["pct"] for r in records if r["sessione"] == "pomeriggio" and r["track"] == tr]
    print(f"     track {tr}: n={len(xs):2}  media={mean(xs):5.1f}%")
print("  c) PC di somministrazione (cartella bene/fra della registrazione):")
for pc in ["bene", "fra"]:
    xs = [r["pct"] for r in records
          if gaze_folder.get((r["pid"], r["storia"]), "").startswith("data_" + pc)]
    print(f"     {pc}: n={len(xs):3}  media={mean(xs):5.1f}%")

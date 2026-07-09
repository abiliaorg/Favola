# -*- coding: utf-8 -*-
"""Estrae i transcript delle storie da data/01_record in study/transcripts/.

Per ogni registrazione prende le parole definitive (interim=False) in ordine di id.
Nella variante images le parole mostrate come immagine sono racchiuse in [parentesi].
Genera un .txt per variante e un riepilogo README.md.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
REC = ROOT / "data" / "01_record"
OUT = Path(__file__).resolve().parent.parent / "transcripts"
OUT.mkdir(exist_ok=True)

summary = []
texts = {}  # (class, story) -> {type: plain_text}

for f in sorted(REC.glob("*.json")):
    d = json.loads(f.read_text(encoding="utf-8"))
    words = []
    for wid in sorted(d["wordMetaById"], key=int):
        meta = d["wordMetaById"][wid]
        if meta.get("interim"):
            continue
        words.append((meta["word"], bool(meta.get("image"))))
    plain = " ".join(w for w, _ in words)
    marked = " ".join(f"[{w}]" if img else w for w, img in words)
    cls, story, typ = d.get("storyClass"), d.get("story"), d.get("type")
    name = f"{cls}_{story}_{typ}.txt"
    content = marked if typ == "images" else plain
    (OUT / name).write_text(content + "\n", encoding="utf-8")
    texts.setdefault((cls, story), {})[typ] = plain
    n_img = sum(1 for _, img in words if img)
    summary.append((name, len(words), n_img))
    print(f"{name}: {len(words)} parole" + (f" ({n_img} come immagine)" if n_img else ""))

print("\n=== Confronto text vs images (stessa storia):")
for (cls, story), by_typ in sorted(texts.items()):
    if "text" in by_typ and "images" in by_typ:
        same = by_typ["text"] == by_typ["images"]
        print(f"  {cls}_{story}: transcript {'IDENTICI' if same else 'DIVERSI'}")

lines = ["# Transcript delle storie",
         "",
         "Estratti da `data/01_record/*.json` (parole definitive, senza risultati interim del riconoscimento vocale).",
         "Nei file `*_images.txt` le parole tra [parentesi] erano mostrate come immagini nel video.",
         "",
         "| File | Parole | Di cui immagini |",
         "|---|---|---|"]
for name, n, n_img in summary:
    lines.append(f"| {name} | {n} | {n_img or ''} |")
(OUT / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"\nSalvati {len(summary)} transcript in {OUT}")

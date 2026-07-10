# -*- coding: utf-8 -*-
"""Toglie gli a-capo "duri" dai paragrafi dei file Markdown di study/.

Unisce le righe spezzate a ~80 colonne in un'unica riga per paragrafo (o per
voce di elenco / riga di citazione), lasciando intatti titoli, tabelle,
elenchi (ogni voce resta una riga), righe orizzontali e blocchi di codice.
"""
import re
import sys
from pathlib import Path

STUDY = Path(__file__).resolve().parent.parent

def is_block_start(s):
    if s.startswith(("#", "|", "- ", "* ", "+ ")):
        return True
    if re.match(r"^\d+\.\s", s):
        return True
    if re.match(r"^[-*_]{3,}$", s):
        return True
    return False

def unwrap(text):
    out = []
    in_code = False
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("```"):
            in_code = not in_code
            out.append(line)
            continue
        if in_code or s == "":
            out.append(line)
            continue
        prev = out[-1].strip() if out else ""
        prev_joinable = (prev != "" and not prev.startswith(("#", "|"))
                         and not re.match(r"^[-*_]{3,}$", prev) and not prev.startswith("```"))
        if s.startswith(">"):
            if prev.startswith(">") and prev != ">" and s != ">":
                out[-1] = out[-1].rstrip() + " " + s.lstrip(">").strip()
            else:
                out.append(line)
        elif not is_block_start(s) and prev_joinable and not prev.startswith(">"):
            out[-1] = out[-1].rstrip() + " " + s
        else:
            out.append(line)
    return "\n".join(out) + ("\n" if text.endswith("\n") else "")

files = sys.argv[1:] or ["README.md", "INSIGHTS.md", "CONCLUSIONI.md",
                         "SINTESI_GENITORI.md", "chiave_derivata.md",
                         "transcripts/README.md"]
for name in files:
    p = STUDY / name
    if not p.exists():
        print(f"salto {name}: non esiste")
        continue
    orig = p.read_text(encoding="utf-8")
    new = unwrap(orig)
    if new != orig:
        p.write_text(new, encoding="utf-8")
        print(f"{name}: {len(orig.splitlines())} -> {len(new.splitlines())} righe")
    else:
        print(f"{name}: invariato")

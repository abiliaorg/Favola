# -*- coding: utf-8 -*-
"""Cerca file con array samples identico (copie con pid modificato)."""
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent / "data" / "02_gaze"

byhash = {}
for folder in sorted(BASE.iterdir()):
    if not folder.is_dir() or not folder.name.startswith("data_"):
        continue
    for f in sorted(folder.glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        h = hashlib.md5(json.dumps(data.get("samples", [])).encode()).hexdigest()
        byhash.setdefault(h, []).append((folder.name, f.name, str(data.get("participantId")), data.get("date")))

print("=== File con samples IDENTICI:")
found = False
for h, ks in byhash.items():
    if len(ks) > 1:
        found = True
        for k in ks:
            print("  ", k)
        print()
if not found:
    print("  nessuno")

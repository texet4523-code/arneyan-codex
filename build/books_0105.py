"""The books v0.10.5 (22 October 2026): monsters have attribute scores.

- Monsters & Treasure: six scores per stat block, saves from them (attribute modifier + half Level, minimum 1) and a
  Skills line. Read by build_monsters.py from the `ab` and `sk` lines.
- Codex, Contested Checks: "A monster uses the attribute modifiers in its stat block, as a character does." The old
  "save minus half its HD" rule is gone.
- Codex, Random Encounter Rules (Handbook v0.10.6): an Encounter Check of 11 is a Hard Encounter and 12 a Deadly one
  (were Standard and Dangerous). The Encounter Check table is read from this page, so it follows.

Running it twice changes nothing the second time.
"""
import glob, json, os
import lib

OLD = ("A monster has no attribute scores: it uses its Fortitude save minus half its HD for a Strength contest, its "
       "Reflex save minus half its HD for Dexterity, and its Will save minus half its HD for Wisdom.")
NEW = "A monster uses the attribute modifiers in its stat block, as a character does."
ENCOUNTERS = [("A Standard Encounter occurs", "A Hard Encounter occurs"), ("A Dangerous Encounter occurs", "A Deadly Encounter occurs"),
              ("11 is a Standard Encounter and 12 a Dangerous one", "11 is a Hard Encounter and 12 a Deadly one"),
              ("as a Standard Encounter (never Dangerous)", "as a Hard Encounter (never Deadly)")]


def build():
    n = {"journal": 0, "misses": []}
    for f in glob.glob(os.path.join(lib.OUT, "rules", "*.json")):
        d = json.load(open(f))
        ch = False
        for p in d.get("pages", []):
            c = (p.get("text") or {}).get("content") or ""
            if OLD in c:
                c = c.replace(OLD, NEW); ch = True
            for a, b in ENCOUNTERS:
                if a in c:
                    c = c.replace(a, b); ch = True
            if ch:
                p["text"]["content"] = c
        if ch:
            json.dump(d, open(f, "w"), ensure_ascii=False, indent=1); n["journal"] += 1
    text = "".join(open(f).read() for f in glob.glob(os.path.join(lib.OUT, "rules", "*.json")))
    if NEW not in text:
        n["misses"].append("Contested Checks")
    if "Standard Encounter" in text or "Dangerous Encounter" in text or "A Hard Encounter occurs" not in text:
        n["misses"].append("Encounter Check")
    return n


if __name__ == "__main__":
    print(build())

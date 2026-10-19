"""Feature activities (Kieran, 20 Oct 2026: Lay on Hands does nothing; features with options should ask which).

data/activities.json, keyed "<feature name>|<class>", was drafted from each feature's own text: what a player picks
when using it (heal 2 x Paladin level, roll a Dexterity check against the attack, call for a Will save, or a
reminder). Nothing is invented: amounts are only those the text states, and anything set by a progression table is
a reminder. Stored on the class feature item as system.activities.
"""
import glob, json, os
from lib import OUT

HERE = os.path.dirname(__file__)
FIELDS = {"name": "", "kind": "note", "formula": "", "damageType": "", "ability": "", "save": "", "text": "",
          "minLevel": 0, "cost": 1, "per": "", "target": "", "removeConditions": False}
KINDS = {"heal", "temp", "damage", "check", "save", "note"}


def clean(a):
    out = {k: a.get(k, v) for k, v in FIELDS.items()}
    out["kind"] = out["kind"] if out["kind"] in KINDS else "note"
    out["text"] = str(out["text"]).replace("—", ",").replace("–", "-")
    out["minLevel"] = int(out["minLevel"] or 0)
    out["cost"] = int(out["cost"] if out["cost"] is not None else 1)
    out["removeConditions"] = bool(out["removeConditions"])
    for k in ("formula", "damageType", "ability", "save", "per", "target", "name"):
        out[k] = str(out[k] or "")
    return out


def build():
    data = json.load(open(os.path.join(HERE, "data", "activities.json")))
    n = 0
    seen = set()
    for f in glob.glob(os.path.join(OUT, "class-features", "*.json")):
        d = json.load(open(f))
        if d.get("type") != "ability":
            continue
        key = f"{d['name']}|{d['system'].get('className', '')}"
        entry = data.get(key)
        if not entry:
            continue
        seen.add(key)
        acts = [clean(a) for a in entry.get("activities", []) if a.get("name")]
        if not acts:
            continue
        # A feature with no uses can't spend one: its options are free.
        if not (d["system"].get("uses") or {}).get("max"):
            for a in acts:
                a["cost"] = 0
        d["system"]["activities"] = acts
        json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)
        n += 1
    missing = sorted(set(data) - seen)
    return n, missing

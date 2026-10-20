"""Feature activities (Kieran, 20 Oct 2026: Lay on Hands does nothing; features with options should ask which).

data/activities.json, keyed "<name>|<source>", was drafted from each item's own text: what a player picks when using
it (heal 2 x Paladin level, roll a Dexterity check against the attack, call for a Will save, make two attacks, or a
reminder). Nothing is invented: amounts are only those the text states, and anything set by a progression table is
a level table ("4:1, 9:2") read from that table. Stored as system.activities on:

  class features   "<feature>|<class>"        (class-features pack)
  kit features     "<feature>|<kit name>"     (kits pack, each kit's system.features; copied to the actor on grant)
  feats            "<feat>|Feat"              (feats pack)
  actions          "<action>|Action"          (actions pack)

Feats and kit features also get their uses here ("Once per session", "Once/day"), read from the text the way class
features are (build_classes.uses_of), and kit features their save. An entry's "uses" ({"max": 0}) overrides what the
text reading found, where a frequency in the text isn't a pool ("each target only once per day"); its "save",
"damage" and "damageType" set the item's own (Use then offers the save and the damage roll together).
"""
import glob, html, json, os, re
from lib import OUT
from build_classes import uses_of, save_of

HERE = os.path.dirname(__file__)
FIELDS = {"name": "", "kind": "note", "formula": "", "damageType": "", "ability": "", "save": "", "text": "",
          "minLevel": 0, "maxLevel": 0, "cost": 1, "per": "", "target": "", "removeConditions": False,
          "bonus": "", "count": "", "weapons": "", "disadvantage": "", "disUntil": 0, "damageBonus": "",
          "noStack": "", "targetLevel": ""}
KINDS = {"heal", "temp", "damage", "check", "save", "note", "roll", "attacks"}
INTS = ("minLevel", "maxLevel", "disUntil")
STRS = ("formula", "damageType", "ability", "save", "per", "target", "name", "bonus", "count", "weapons",
        "disadvantage", "damageBonus", "noStack", "targetLevel")


def clean(a):
    out = {k: a.get(k, v) for k, v in FIELDS.items()}
    out["kind"] = out["kind"] if out["kind"] in KINDS else "note"
    out["text"] = str(out["text"]).replace("—", ",").replace("–", "-")
    for k in INTS:
        out[k] = int(out[k] or 0)
    out["cost"] = int(out["cost"] if out["cost"] is not None else 1)
    out["removeConditions"] = bool(out["removeConditions"])
    for k in STRS:
        out[k] = str(out[k] if out[k] is not None else "")
    if out["disadvantage"] not in ("", "rest", "all"):
        out["disadvantage"] = ""
    return out


def plain(h):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h or ""))).strip()


def apply(system, entry, text):
    """Activities (and a uses override) onto one item's system data. Returns True if it got activities."""
    # The item's own save and damage, where its text states them (a once-a-day 3d6 lightning strike, Reflex half).
    for k in ("save", "damage", "damageType"):
        if entry and k in entry:
            system[k] = entry[k]
    if entry and "uses" in entry:
        n = int(entry["uses"].get("max", 0))
        system["uses"] = {"value": n, "max": n, "per": entry["uses"].get("per", "") if n else ""}
    acts = [clean(a) for a in (entry or {}).get("activities", []) if a.get("name")]
    if not acts:
        return False
    # A feature with no uses can't spend one: its options are free.
    if not (system.get("uses") or {}).get("max"):
        for a in acts:
            a["cost"] = 0
    system["activities"] = acts
    return True


def build():
    data = json.load(open(os.path.join(HERE, "data", "activities.json")))
    n = 0
    seen = set()
    for pack, tag in (("class-features", None), ("feats", "Feat"), ("actions", "Action")):
        for f in glob.glob(os.path.join(OUT, pack, "items_*.json")):
            d = json.load(open(f))
            if d.get("type") not in ("ability", "feat"):
                continue
            s = d["system"]
            key = f"{d['name']}|{tag or s.get('className', '')}"
            entry = data.get(key)
            if pack == "feats":
                s["uses"] = uses_of(plain(s.get("description", "")))
            if entry:
                seen.add(key)
            if not entry and pack != "feats":
                continue
            n += apply(s, entry, plain(s.get("description", "")))
            json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)
    for f in glob.glob(os.path.join(OUT, "kits", "items_*.json")):
        d = json.load(open(f))
        if d.get("type") != "kit":
            continue
        for ft in d["system"].get("features", []):
            text = plain(ft.get("description", ""))
            ft["uses"] = uses_of(text)
            ft["save"] = save_of(text)
            key = f"{ft['name']}|{d['name']}"
            entry = data.get(key)
            if entry:
                seen.add(key)
                n += apply(ft, entry, text)
        json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)
    missing = sorted(set(data) - seen)
    return n, missing

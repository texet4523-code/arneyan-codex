"""Write approved effects (build/effects/approved.json) into the compendium sources.

approved.json has the same shape as proposed.json, keyed "<pack>/<id>" or "kits/<id>#<index>".
Rule values are stored as strings (the item data model's rule fields are text).
"""
import glob, json, os

HERE = os.path.dirname(os.path.abspath(__file__))


def rule(r):
    return {"key": str(r["key"]), "value": str(r.get("value", "")), "when": str(r.get("when", "") or ""), "label": str(r.get("label", "") or "")}


def applies(a):
    return {
        "name": str(a.get("name", "")),
        "target": "self" if a.get("target") == "self" else "target",
        "rounds": str(a.get("rounds", "") if a.get("rounds") is not None else ""),
        "statuses": [str(s) for s in a.get("statuses", [])],
        "rules": [rule(r) for r in a.get("rules", [])],
    }


def patch(system, entry):
    c = entry.get("container", "passive")
    if c in ("passive", "toggle"):
        system["rules"] = [rule(r) for r in entry.get("rules", [])]
        # A passive effect never switches off a toggle an earlier builder set (Rage, a stance).
        if c == "toggle" or not system.get("toggle"):
            system["toggle"] = c == "toggle"
            system["active"] = False
    if entry.get("applies"):
        # Keep applies the spell or feature already had; add the approved ones not there yet (by name).
        have = {a.get("name") for a in system.get("applies", []) or []}
        system["applies"] = (system.get("applies") or []) + [applies(a) for a in entry["applies"] if str(a.get("name", "")) not in have]


def run(out_dir):
    path = os.path.join(HERE, "effects", "approved.json")
    if not os.path.exists(path):
        print("effects: no approved.json, nothing applied")
        return 0
    approved = json.load(open(path))
    files = {}
    for f in glob.glob(os.path.join(out_dir, "*", "items_*.json")):
        d = json.load(open(f))
        files[(os.path.basename(os.path.dirname(f)), d["_id"])] = (f, d)
    done = missing = 0
    touched = set()
    for key, entry in approved.items():
        pack, rest = key.split("/", 1)
        idx = None
        if "#" in rest:
            rest, idx = rest.split("#")
            idx = int(idx)
        hit = files.get((pack, rest))
        if not hit:
            missing += 1
            print("effects: not found", key)
            continue
        f, d = hit
        if idx is None:
            patch(d["system"], entry)
        else:
            feats = d["system"].get("features", [])
            if idx >= len(feats):
                missing += 1
                print("effects: no feature", key)
                continue
            patch(feats[idx], entry)
        touched.add((pack, rest))
        done += 1
    for k in touched:
        f, d = files[k]
        with open(f, "w") as fh:
            json.dump(d, fh, indent=1, ensure_ascii=False)
    print(f"effects: {done} applied, {missing} missing")
    return missing

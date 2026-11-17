"""Ready-made encounters by terrain and Level (A3; F-R7, F-R10; Kieran's approval K210, lore R96).

Reads build/data/terrain_encounters.json (the approved lists) and the built monsters pack, checks that every creature
exists, that a creature marked solo is marked Solo in its block and that the dice can be read, and writes
arneyan/module/data/terrains.mjs for the system (each foe with its compendium uuid, Level, type and picture).
"""
import glob, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "data", "terrain_encounters.json")
OUT = os.path.join(ROOT, "arneyan", "module", "data", "terrains.mjs")
PACK = os.path.join(ROOT, "packs-src", "monsters")
DICE = re.compile(r"^(\d+|\d+d\d+(\+\d+)?|\d+-\d+)$")


def monsters():
    out = {}
    for f in glob.glob(os.path.join(PACK, "*.json")):
        d = json.load(open(f))
        if d.get("type") != "npc":
            continue
        s = d["system"]; det = s.get("details", {})
        out[d["name"]] = {
            "uuid": f"Compendium.arneyan.monsters.Actor.{d['_id']}", "level": s.get("level", 1), "levelText": det.get("levelText", ""),
            "type": det.get("type", ""), "marked": bool(det.get("isSolo")), "na": det.get("numberAppearing", ""), "img": d.get("img", "")
        }
    return out


def build():
    data = json.load(open(SRC))
    mons = monsters()
    problems, n = [], 0
    for ter in data["terrains"]:
        assert len(ter["twists"]) == 6, ter["name"]
        assert list(ter["bands"]) == data["bands"], ter["name"]
        for band, rows in ter["bands"].items():
            assert len(rows) == 8 and "nonfight" in rows[0], (ter["name"], band)
            for i, row in enumerate(rows[1:], 2):
                for opt in row["options"]:
                    for foe in opt:
                        m = mons.get(foe["name"])
                        where = f"{ter['name']} {band} #{i} {foe['name']}"
                        if not m:
                            problems.append(f"{where}: no such monster"); continue
                        if not DICE.match(foe["dice"]):
                            problems.append(f"{where}: can't read {foe['dice']!r}")
                        if bool(foe.get("solo")) and not m["marked"]:
                            problems.append(f"{where}: run as a solo but not marked Solo")
                        foe.update({k: m[k] for k in ("uuid", "level", "levelText", "type", "na", "img")})
                        foe["marked"] = m["marked"]
                        n += 1
    assert not problems, "terrain encounters:\n" + "\n".join(problems)
    data.pop("note", None)
    with open(OUT, "w") as fh:
        fh.write("// Built by build/build_terrain.py from build/data/terrain_encounters.json. Don't edit by hand.\n")
        fh.write("export const TERRAIN_DATA = ")
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    return n


if __name__ == "__main__":
    print(build(), "creatures placed in the terrain tables")

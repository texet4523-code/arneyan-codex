"""Animated objects for Animate Objects (0.10.43): the spell's own numbers as two Bestiary creatures, so its Summon
button can place them. "Each animated object has 20 HP, AC 14 and speed 30ft, obeys you, and attacks one creature
within reach each round, hitting automatically (no roll) for 1d8 bludgeoning (2d8 if Large)." Not a Monsters &
Treasure entry: made from the spell. A Large object counts as 2 (summons.mjs)."""
import copy, glob, json, os
import lib

MADE = [("AnimObjMedium001", "Animated Object", "medium", 1, "1d8"), ("AnimObjLarge0001", "Animated Object, Large", "large", 2, "2d8")]


def build():
    src = next(f for f in glob.glob(os.path.join(lib.OUT, "monsters", "*.json")) if json.load(open(f)).get("name") == "Animated Armour")
    base = json.load(open(src))
    n = 0
    for aid, name, size, grid, dmg in MADE:
        d = copy.deepcopy(base)
        d["_id"], d["_key"], d["name"] = aid, f"!actors!{aid}", name
        s = d["system"]
        s["level"], s["hd"] = 1, ""
        s["attributes"].update({"hp": {"value": 20, "max": 20, "temp": 0}, "ac": 14, "speed": "30ft", "attack": 0, "morale": 12})
        s["details"].update({"size": size, "numberAppearing": "", "senses": "", "immunities": "poison, condition:frightened", "levelText": "",
                             "description": f"<p><em>{size.capitalize()} construct</em> made by @UUID[Compendium.arneyan.spells.Item]{{Animate Objects}}.</p>"
                                            "<p>A nonmagical, unattended object brought to life. It obeys its caster and attacks one creature within reach each round.</p>"
                                            "<p class=\"arn-note\">Made from the spell's own numbers (Spellcasting in Arneyan); not a Monsters &amp; Treasure entry.</p>",
                             "treasure": ""})
        s["details"]["description"] = s["details"]["description"].replace("@UUID[Compendium.arneyan.spells.Item]{Animate Objects}", "Animate Objects")
        slam = next(i for i in base["items"] if i["type"] == "ability")
        items = []
        for k, (iname, desc, damage) in enumerate([
            ("Slam (hits automatically)", f"<p>Attacks one creature within reach each round, <strong>hitting automatically</strong> (no roll) for <strong>{dmg}</strong> bludgeoning damage.</p>", dmg),
            ("Construct Nature", "<p>Immune to poison, sleep and fear. Needs no air, food or sleep.</p>", "")]):
            it = copy.deepcopy(slam)
            iid = f"{aid[:12]}it{k:02d}"
            it.update({"_id": iid, "_key": f"!actors.items!{aid}.{iid}", "name": iname, "img": slam.get("img")})
            it["system"].update({"description": desc, "damage": damage, "damageType": "bludgeoning" if damage else "", "save": "", "dc": None,
                                 "uses": {"value": 0, "max": 0, "per": ""}, "rules": [], "activities": []})
            items.append(it)
        d["items"] = items
        tok = d.get("prototypeToken") or {}
        tok.update({"name": name, "width": grid, "height": grid})
        d["prototypeToken"] = tok
        d["flags"] = {"arneyan": {"madeFor": "Animate Objects"}}
        lib_path = os.path.join(lib.OUT, "monsters", f"actors_{name.replace(' ', '_').replace(',', '')}_{aid}.json")
        json.dump(d, open(lib_path, "w"), ensure_ascii=False, indent=1)
        n += 1
    return n


if __name__ == "__main__":
    print(build())

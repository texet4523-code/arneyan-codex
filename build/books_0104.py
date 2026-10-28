"""The books v0.10.4 (21 October 2026): the last open questions from the Foundry handoff, settled by the book chat.

- Dragonborn: the draconic type, chosen at creation, sets both the breath weapon and the Resistance 5.
- Traps (Codex, after Environmental Hazards): a page in Book I.
- Class-only spells: school and components, as "Name (Level; School; Components)" in the class entries.
- Knight kits: Steadfast Courage (Hedge Knights) and Wall-Forged Dread (Boldock Wall-Knights) written out in full,
  each replacing the usual Embolden or Demoralise.

Running it twice changes nothing the second time.
"""
import glob, json, os
import lib

OUT = lib.OUT


def _each(pack):
    for f in glob.glob(os.path.join(OUT, pack, "*.json")):
        yield f, json.load(open(f))


def _save(f, d):
    json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)


# Dragonborn (PHB v0.10.4, Ancestries).
DRAGONBORN_OLD = [
    ("<li><strong>Choose a damage type</strong> (fire/cold/lightning/poison/acid) at creation. 1/long rest breath weapon: line or cone, "
     "damage = character level, Reflex save for half (Ancestry Save DC, Constitution; 1 Luck for an extra use).</li>",
     "<li><strong>Draconic type:</strong> choose fire, cold, lightning, poison or acid at creation. 1/long rest breath weapon of that "
     "type: line or cone, damage = character level, Reflex save for half (Ancestry Save DC, Constitution; 1 Luck for an extra use).</li>"),
    ("<li><strong>Resistance 5 to a chosen damage type</strong>.</li>", "<li><strong>Resistance 5</strong> to your draconic type.</li>"),
]
DRAGONBORN_TRAITS = [
    # Books v0.10.25: "Once per day" (was "1/long rest"); Book II now has this wording itself.
    {"name": "Draconic type", "text": "Choose fire, cold, lightning, poison or acid at creation. Once per day breath weapon of that type: line or cone, "
     "damage = character level, Reflex save for half (Ancestry Save DC, Constitution; 1 Luck for an extra use)."},
    {"name": "Resistance 5", "text": "Resistance 5 to your draconic type."},
]

# Traps (Codex, Section IV, after Environmental Hazards), the book's text.
TRAPS_ID = "arnTrapsPage0104"
TRAPS = (
    "<ul><li>A trap has a Level, set like a monster's: use the party's Level for a dangerous trap and a lower one for a nuisance. "
    "A trap that is part of a fight costs the same as a creature of its Level.</li></ul>"
    "<table><thead><tr><th>Trap Level</th><th>Find and Disarm DC</th><th>Save DC</th><th>Damage</th></tr></thead><tbody>"
    "<tr><td>1–4</td><td>12</td><td>12</td><td>2d6</td></tr>"
    "<tr><td>5–8</td><td>15</td><td>14</td><td>4d6</td></tr>"
    "<tr><td>9–12</td><td>15</td><td>16</td><td>6d6</td></tr>"
    "<tr><td>13–16</td><td>20</td><td>18</td><td>8d6</td></tr>"
    "<tr><td>17–20</td><td>20</td><td>20</td><td>10d6</td></tr>"
    "<tr><td>21–24</td><td>20</td><td>22</td><td>12d6</td></tr></tbody></table>"
    "<ul><li><strong>Deadly traps:</strong> add 2 to both DCs and double the damage.</li>"
    "<li><strong>Other effects:</strong> a trap can deal a condition instead of damage, against the same save (Restrained for a net, "
    "Poisoned for a needle, Prone for a tripwire). A pit uses Falling Damage.</li>"
    "<li><strong>Spotting:</strong> the GM rolls a secret Wisdom check for each character moving at Normal or Slow pace who could see "
    "the trap. Searching a 10ft square takes 1 minute and gives Advantage. At Fast pace, no one spots anything.</li>"
    "<li><strong>Disarming:</strong> an Intelligence check against the Find and Disarm DC, taking 1 minute. Failing by 5 or more, or "
    "rolling a natural 1, sets it off. Otherwise the character may try again.</li>"
    "<li><strong>Who can disarm:</strong> Rogues and Assassins use their trap skill on any trap, magical ones included. Rangers use "
    "theirs on wilderness traps and any trap they could build. Anyone else can only tackle mechanical traps, with Disadvantage on the "
    "check unless trained in a fitting skill (Engineering for a mechanism, Set Snares for a snare). Anything with a spring or lock "
    "needs thieves' tools. Kobolds have Advantage (Trapwise).</li>"
    "<li><strong>Magical traps</strong> (glyphs, runes, Fire Trap): a Wisdom check can't spot one unless it can be seen. Detect Magic "
    "reveals it, and Dispel Magic ends it.</li></ul>"
)
TRAPS_TIP = ("<p class=\"arn-note\">In Foundry: make a Hazard actor and press <strong>Use the Traps table</strong> on its sheet for these "
             "numbers by its Level (tick Deadly first for a deadly trap).</p>")
TRAPS += TRAPS_TIP

# Class-only spells (PHB v0.10.4): (school, components, costed note). Eldritch Blast gives none.
SPELLS = {
    "Disrupt Undead": ("Necromancy", "V, S", ""),
    "Touch of Fatigue": ("Necromancy", "V, S, M", ""),
    "Cause Fear": ("Illusion", "V, S", ""),
    "Inflict Light Wounds": ("Necromancy", "V, S", ""),
    "Bind Undead": ("Necromancy", "V, S, M", ""),
    "False Life": ("Necromancy", "V, S, M", ""),
    "Ghoul Touch": ("Necromancy", "V, S, M", ""),
    "Gentle Repose": ("Necromancy", "V, S, M", ""),
    "Halt Undead": ("Necromancy", "V, S, M", ""),
    "Ray of Exhaustion": ("Necromancy", "V, S, M", ""),
    "Contagion": ("Necromancy", "V, S", ""),
    "Feign Death": ("Necromancy", "V, S", ""),
    "Animate Dead (Greater)": ("Necromancy", "V, S, M", "black onyx, as Animate Dead"),
    "Bestow Curse (Greater)": ("Necromancy", "V, S", ""),
    "Enervation": ("Necromancy", "V, S", ""),
    "Bone Armour": ("Necromancy", "V, S, M", ""),
    "Fear (Mass)": ("Illusion", "V, S, M", ""),
    "Symbol of Pain": ("Necromancy", "V, S, M", ""),
    "Harm": ("Necromancy", "V, S", ""),
    "Control Undead": ("Necromancy", "V, S, M", ""),
    "Symbol of Death": ("Necromancy", "V, S, M", "as Symbol"),
    "Create Greater Undead": ("Necromancy", "V, S, M", "black onyx, as Create Undead"),
    "Horrid Wilting": ("Necromancy", "V, S, M", ""),
    "Vile Blight": ("Necromancy", "V, S", ""),
    "Ill Omen": ("Necromancy", "V, S", ""),
    "Hex of Stumbling": ("Transmutation", "V, S", ""),
    "Bind Wound": ("Necromancy", "V, S, M", ""),
    "Evil Eye": ("Enchantment", "V, S", ""),
    "Withering Glance": ("Necromancy", "V, S", ""),
    "Wither Limb": ("Necromancy", "V, S", ""),
    "Withering Curse": ("Necromancy", "V, S, M", ""),
    "Enslave": ("Enchantment", "V, S", ""),
    "Slay Living": ("Necromancy", "V, S", ""),
}
CLASS_ONLY_FOLDERS = {"Necromancer", "Warlock", "Witch"}

# Knight kits. PHB v0.10.4: each replaced the class's own feature of that name. Books v0.10.25 (R-B7, board B-F12): the
# Knight's Commands are one pool, and these two now change a Command option instead of replacing a feature: they keep
# no uses of their own and carry the stronger version of the option's effect, applied in its place.
KITS = {
    "Hedge Knights (Knight)": {
        "name": "Steadfast Courage", "level": 3, "replaces": "",
        "description": "<p>Your Embolden option reaches <strong>60ft</strong>, and companions and followers in range have "
                       "<strong>Advantage on all saves</strong>. When you give Embolden, apply this in place of the usual "
                       "Emboldened.</p>",
        "uses": {"value": 0, "max": 0, "per": ""}, "save": "",
        "applies": [{"name": "Emboldened (Steadfast Courage)", "target": "target", "rounds": "encounter", "statuses": [],
                     "rules": [{"key": "adv.save", "value": "1", "when": "", "label": ""}]}],
        "kit_text": None,
    },
    "Boldock Wall-Knights (Knight)": {
        "name": "Wall-Forged Dread", "level": 5, "replaces": "",
        "description": "<p>Your Demoralise option is harsher: on a failed Will save, enemies have <strong>Disadvantage on all "
                       "their attack rolls</strong>. Otherwise it works as Demoralise. When you give Demoralise, apply this in "
                       "place of the usual failed-save effect.</p>",
        "uses": {"value": 0, "max": 0, "per": ""}, "save": "will",
        "applies": [{"name": "Demoralised (Wall-Forged Dread, failed save)", "target": "target", "rounds": "encounter", "statuses": [],
                     "rules": [{"key": "adv.attack", "value": "-1", "when": "", "label": ""}]}],
        "kit_text": None,
    },
}


def build():
    n = {"ancestry": 0, "journal": 0, "spells": 0, "kits": 0, "misses": []}
    for f, d in _each("ancestries"):
        if d.get("name") != "Dragonborn" or "system" not in d:
            continue
        s = d["system"]
        before = json.dumps(s)
        for old, new in DRAGONBORN_OLD:
            s["description"] = s["description"].replace(old, new)
        s["traitList"] = DRAGONBORN_TRAITS + [t for t in s.get("traitList", []) if not t["name"].startswith(("Choose a damage type", "Resistance 5", "Draconic type"))]
        if json.dumps(s) != before:
            _save(f, d); n["ancestry"] += 1
    for f, d in _each("rules"):
        if "pages" not in d:
            continue
        ch = False
        if d["name"].startswith("Book II:"):
            for p in d["pages"]:
                c = p.get("text", {}).get("content", "")
                c2 = c
                for old, new in DRAGONBORN_OLD:
                    c2 = c2.replace(old, new)
                if c2 != c:
                    p["text"]["content"] = c2; ch = True
        # (The Codex has its own Traps page from books v0.10.11: then this one isn't added, and the Foundry tip goes on
        # the book's page instead.)
        own = next((p for p in d.get("pages", []) if p.get("name") == "Traps"), None) if d["name"].startswith("Book I:") else None
        if own is not None and TRAPS_TIP not in own["text"]["content"]:
            own["text"]["content"] += TRAPS_TIP; ch = True
        if d["name"].startswith("Book I:") and not any(p.get("_id") == TRAPS_ID or p.get("name") == "Traps" for p in d["pages"]):
            env = next((p for p in d["pages"] if p["name"] == "Environmental Hazards"), None)
            if env is None:
                n["misses"].append("Book I: no Environmental Hazards page for Traps")
            else:
                page = json.loads(json.dumps(env))
                page.update({"_id": TRAPS_ID, "_key": f"!journal.pages!{d['_id']}.{TRAPS_ID}", "name": "Traps", "sort": env["sort"] + 50000})
                page["text"] = {**env["text"], "content": TRAPS}
                d["pages"].append(page); ch = True
        if ch:
            _save(f, d); n["journal"] += 1
    folders = {d["_id"]: d["name"] for f, d in _each("spells") if "system" not in d}
    found = set()
    for f, d in _each("spells"):
        if "system" not in d or folders.get(d.get("folder")) not in CLASS_ONLY_FOLDERS or d["name"] not in SPELLS:
            continue
        found.add(d["name"])
        school, comps, costed = SPELLS[d["name"]]
        s = d["system"]
        before = json.dumps(s)
        s["school"], s["components"] = school, comps
        if costed:
            s["costly"] = True
            note = f'<p class="arn-note"><strong>Costed component (‡):</strong> {costed}.</p>'
            if note not in s["description"]:
                s["description"] = s["description"].replace('<p class="arn-note"><strong>Classes:', note + '<p class="arn-note"><strong>Classes:', 1) if '<p class="arn-note"><strong>Classes:' in s["description"] else s["description"] + note
        if json.dumps(s) != before:
            _save(f, d); n["spells"] += 1
    n["misses"] += [f"spell {k}" for k in SPELLS if k not in found]
    for f, d in _each("kits"):
        k = KITS.get(d.get("name"))
        if not k or "system" not in d:
            continue
        s = d["system"]
        before = json.dumps(s)
        if k["kit_text"]:
            old, new = k["kit_text"]
            s["description"] = s["description"].replace(old, new)
        feat = next((x for x in s.get("features", []) if x.get("name") == k["name"]), None)
        if feat is None:
            n["misses"].append(f"kit feature {k['name']}")
            continue
        feat.update({"level": k["level"], "description": k["description"], "uses": dict(k["uses"]), "save": k["save"],
                     "applies": json.loads(json.dumps(k["applies"])), "replaces": k["replaces"]})
        if json.dumps(s) != before:
            _save(f, d); n["kits"] += 1
    return n

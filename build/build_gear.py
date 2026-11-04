"""Drop 1: make the Catalogue's gear work. Runs after build_shop on packs-src/equipment.

- Bundles: ammunition 30 a slot; "(bundles 5/slot)" items, thrown weapons, rings and wands 5 a slot
  (Codex, Carrying; Catalogue, thrown weapons and magic item rules).
- Ammunition items from the Catalogue's line "Arrows 2 gp/20, Arrows, Silver 2 gp each, Bolts 1 gp/12, Rock",
  and which weapons fire them.
- Consumables (potions, oils, poisons, flasks, scrolls, torches), with healing where the entry gives it.
- Wand and staff charges; staffs regain 1d4 at dawn; both can crumble at 0.
- Light where the Catalogue gives a radius (Sunrod).
- Containers: sacks, pouches, quiver, scroll case; Bag of Holding (8 slots) and Portable Hole (20), weightless.
- The Iconic Weapons as real weapons on their base weapon, with +N and their extra damage.
- The Two-handed trait on the Catalogue's two-slot melee weapons that aren't Versatile.
"""
import copy, glob, html, json, os, re
from lib import OUT, fid
import books_md
from icons import icon

PACK = os.path.join(OUT, "equipment")


def load():
    docs, folders = {}, {}
    for f in glob.glob(os.path.join(PACK, "*.json")):
        d = json.load(open(f))
        (folders if d["_key"].startswith("!folders!") else docs)[f] = d
    return docs, {d["_id"]: d["name"] for d in folders.values()}


ONE_HANDED = {"Trident"}
LANCES = {"Lance, Light", "Lance, Heavy"}


def text(d):
    return re.sub(r"<[^>]+>", " ", d["system"].get("description", ""))


CONSUMABLE_FOLDERS = {"Potions", "Weapon Oils", "Poisons", "Alchemical Weapons & Tools", "Spellbooks & Scrolls"}
CONTAINERS = {"Backpack": 0, "Rucksack": 0, "Saddlebag": 0, "Sack, Small": 0, "Sack, Large": 0, "Belt Pouch, Small": 0, "Belt Pouch, Large": 0, "Quiver": 0, "Case, Map or Scroll": 0}
THROWN = {"Dart", "Aclis", "Javelin", "Harpoon", "Bolas", "Knife (thrown)"}
# Kieran, 25 Oct 2026 (player feedback: the starting packs over-filled the inventory): torches bundle 5 a slot, and
# the Backpack takes no slot, since it "provides the grid itself".
# Kieran, 25 Oct 2026: throwing knives bundle 5 a slot (thinner and lighter than a dagger); Daggers and Hand/Throwing
# Axes stay 1 slot each.
EXTRA_BUNDLES = {"Torch", "Torches", "Knife"}  # build_tidy renames Torches to Torch later
NO_SLOT = {"Backpack"}

# Worn items: "+1 AC while worn" (Catalogue).
WORN_RULES = {"Ring of Protection": [{"key": "ac", "value": "1", "when": "", "label": ""}]}

# Iconic weapon -> (base weapon, +N, extra damage [(formula, type, when)], extras)
ICONIC = {
    # Ignited on a command word: +1d6 fire on every hit and light 20ft (Catalogue) while on.
    "Flame Tongue": ("Sword, Long", 1, [("1d6", "fire", "mode")], {"toggle": True, "modeLabel": "Ignited", "modeLight": 20}),
    "Frost Brand": ("Sword, Long", 1, [("1d6", "cold", "")], {"rules": [{"key": "resist", "value": "fire 5", "when": "", "label": ""}]}),
    "Sun Blade": ("Sword, Long", 2, [("1d8", "radiant", "against undead")], {"toggle": True, "modeLabel": "Blade called", "modeLight": 20}),
    "Luck Blade": ("Sword, Long", 1, [], {}),
    "Vorpal Sword": ("Sword, Long", 3, [], {}),
    "Holy Avenger": ("Sword, Long", 3, [("2d6", "radiant", "against evil outsiders and undead")], {}),
    "Dwarven Thrower": ("Hammer, War", 3, [("2d8", "", "against giants")], {"traits": "Sunder, Thrown", "range": "30 ft"}),
    "Mace of Delving": ("Mace, Heavy", 2, [("2d8", "radiant", "against undead")], {}),
    "Javelin of Lightning": ("Javelin", 1, [], {"range": "30 ft"}),
}

# Monsters & Treasure v0.10.41 (K48 A-S2, K51): the Named Uniques, read from the M&T treasure chapter, as weapons on
# their base weapon. Their base (from the line's "(greatsword +3)") -> the Catalogue's name, and a glyph each.
NAMED_UNIQUE_SRC = "/tmp/hb/mm/treasure.md"
UNIQUE_BASE = {"greatsword": "Greatsword", "long sword": "Sword, Long", "maul": "Maul", "trident": "Trident",
               "war hammer": "Hammer, War", "scimitar": "Sword, Scimitar", "long bow": "Bow, Long", "heavy flail": "Flail, Heavy",
               "rapier": "Sword, Rapier", "glaive": "Glaive", "heavy mace": "Mace, Heavy", "battle axe": "Axe, Battle",
               "dagger": "Dagger", "wolf spear": "Spear, Wolf", "short sword": "Sword, Short", "heavy crossbow": "Crossbow, Heavy",
               "morningstar": "Morningstar"}
UNIQUE_GLYPH = {"Soulthief": "bloody-sword", "Wyrmsbane": "dragon-head", "Wallguard": "stone-wall", "Stonefather": "warhammer",
                "Tidecaller": "trident", "Groundbreaker": "hammer-drop", "Hairsplitter": "saber-slash", "Phoenix Oath": "winged-arrow",
                "Wardenbreaker": "flail", "Dreadknell": "ringing-bell", "Retort": "fencer", "Veilcutter": "glaive",
                "Gravebane": "mace-head", "Hillfeller": "battle-axe", "Adder's Kiss": "snake-bite", "Stormcall": "lightning-trio",
                "Weeping Edge": "bleeding-wound", "Greenmantle": "vine-whip", "Quickwind": "crossbow", "Wakeful": "awareness"}
# Extra damage the system can add when the GM ticks it on the damage card: "+2d6 damage against dragons".
UNIQUE_EXTRA = re.compile(r"\+(\d+d\d+)\s*(fire|cold|lightning|radiant|necrotic|poison|acid|thunder|psychic|force)?\s*(?:damage\s*)?against ([a-z ]+?)(?=[,.;]| and )", re.I)


# M&T v0.10.45 (K55, R-B32): the 18 Secrets, as cards in the equipment compendium (GM-placed, never for sale), and the
# Last Form as a Unique feat. Study details go in flags.arneyan.secret for the downtime "Study a Secret".
SECRET_GLYPH = {"The Golem Manuals": "golem-head", "The Grey Muster": "raise-skeleton", "The Black Tome": "black-book",
                "The Wasteborn Bestiary": "book-storm", "Orrin's Little Book": "notebook", "The Brass Concordance": "fire-ring",
                "The Phoenix Draught": "potion-ball", "Tiahane's Tithe": "dragon-breath", "The Last Form": "fist", "Eyrie Eggs": "nest-eggs",
                "The Sleeping Egg": "cosmic-egg", "The Black Forge": "anvil-impact", "The Blood Chalice": "chalice-drops",
                "The Moonward Totem": "moon-claws", "The Evergreen Spring": "water-fountain", "A Name in Brass": "pentacle",
                "The Second Body": "body-swapping", "A Nalwood Heartseed": "plant-seed"}
ATTR = {"intelligence": "int", "wisdom": "wis", "dexterity": "dex", "strength": "str", "constitution": "con", "charisma": "cha"}


def secrets():
    """The Secrets list: [(name, form, text, study)] from the M&T treasure chapter; study is {weeks, dc, ability} or None."""
    try:
        t = open(NAMED_UNIQUE_SRC, encoding="utf-8").read()
    except OSError:
        print(f"gear: WARNING no {NAMED_UNIQUE_SRC}: the Secrets are not built")
        return []
    i = t.find("### Secrets")
    if i < 0:
        print("gear: WARNING no Secrets section in the treasure chapter")
        return []
    block = t[i:].split("\n#", 1)[0]
    out = []
    for m in re.finditer(r"^- \*\*(.+?)\*\* \[Unique\] \(([^)]+)\)\.\s*(.+)$", block, re.M):
        name, form, text = m.group(1), m.group(2).strip(), m.group(3).strip()
        st = re.search(r"\*Study:\*([^*]*)", text)
        study = None
        if st:
            s = st.group(1)
            w = re.search(r"(\d+) weeks?", s)
            dc = re.search(r"DC (\d+)", s)
            ab = re.search(r"an? (Intelligence|Wisdom|Dexterity|Strength|Constitution|Charisma)(?: or (Intelligence|Wisdom|Dexterity|Strength|Constitution|Charisma))? (?:check|or)", s)
            abl = ab.group(1).lower() if ab else ("wis" if re.search(r"Animal Training check", s) else "intelligence")
            study = {"weeks": int(w.group(1)) if w else 0, "dc": int(dc.group(1)) if dc else 15,
                     "ability": ATTR.get(abl, abl), "alt": ATTR.get((ab.group(2) or "").lower(), "") if ab else ""}
        out.append((name, form, text, study))
    return out


def secret_html(name, form, text):
    """A Secret's card: its form, then Study / Teaches / The work / You gain / Upkeep as their own lines, then its history."""
    body = html.escape(text)
    body = re.sub(r"\*([A-Z][A-Za-z ]+):\*", lambda m: f"</p><p><strong>{m.group(1)}:</strong>", body)
    body = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", body)
    return (f"<p><em>Secret ({html.escape(form)}).</em> " + body + "</p>"
            + "<p class=\"arn-note\">Monsters &amp; Treasure, Secrets: one of a kind, never sold, placed by the GM. "
            "Study it in downtime (Study a Secret); no one can teach it.</p>").replace("<p></p>", "")


def named_uniques():
    """The Named Uniques list: [(name, base phrase, bonus, text)] from the M&T treasure chapter (empty if not there)."""
    try:
        t = open(NAMED_UNIQUE_SRC, encoding="utf-8").read()
    except OSError:
        print(f"gear: WARNING no {NAMED_UNIQUE_SRC}: the Named Uniques are not built")
        return []
    i = t.find("### Named Uniques")
    if i < 0:
        print("gear: WARNING no Named Uniques section in the treasure chapter")
        return []
    block = t[i:].split("\n#", 1)[0]
    out = []
    for m in re.finditer(r"^- \*\*(.+?)\*\* \[Unique\] \(([a-z ]+?) \+(\d)\)\.\s*(.+)$", block, re.M):
        out.append((m.group(1), m.group(2).strip(), int(m.group(3)), m.group(4).strip()))
    return out

# Light sources. The Catalogue and Codex give no radius except the Sunrod's; Kieran chose 5e's (19 Oct 2026).
# (bright ft, total ft incl. dim, hours, cone angle)
LANTERN = (30, 60, 6, 360)
LAMP = (15, 45, 6, 360)
BULLSEYE = (60, 120, 6, 60)
LIGHTS = {
    "Torches": (20, 40, 1, 360), "Candles and Tapers": (5, 10, 1, 360),
    "Hooded Lantern": LANTERN, "Self-Dousing Lantern": LANTERN, "Spelunker's Lantern": LANTERN,
    "Bullseye Lantern": BULLSEYE, "Fog-Cutter Lantern": BULLSEYE,
    "Oil Lamps (Basic)": LAMP, "Desert Lamp": LAMP, "Hurricane Lamp": LAMP, "Chime Lamp": LAMP, "Gnomish Firefly Lamp": LAMP,
}

AMMO = [
    ("Arrows", "arrow", 20, "2 gp for 20"),
    ("Arrow, Silver", "arrow", 1, "2 gp each"),
    ("Bolts", "bolt", 12, "1 gp for 12"),
    ("Sling Stones", "stone", 20, "free (found)"),
]


def catalogue_bundles():
    """Names the Catalogue marks "bundles 5/slot" (in its tables and bullet lists)."""
    names = set()
    for ln in open(books_md.SHOP, encoding="utf-8"):
        if not re.search(r"bundles?\s*(?:of\s*)?5\s*(?:/|per)\s*slot", ln, re.I):
            continue
        m = re.match(r"\|\s*([^|]+?)\s*\|", ln) or re.search(r"\*\*([^*]+?):?\*\*", ln)
        if m:
            names.add(re.sub(r"\s*\[[^\]]+\]", "", m.group(1)).strip().rstrip(":").lower())
    return names


NOT_CONSUMABLE = re.compile(r"^(rules|availability|costly components|how |notes|spellbook)", re.I)


def spell_names():
    names = {}
    for f in glob.glob(os.path.join(OUT, "spells", "*.json")):
        d = json.load(open(f))
        if d.get("type") == "spell":
            names[d["name"].lower()] = d["name"]
    return names


def item_spells(t, names):
    """Spells a wand or staff casts and their charge costs, from lines like "One charge casts Magic Missile",
    "2 charges casts Neutralise Poison" or "Fireball (3)"; only real Arneyan spells count."""
    out = []
    words = {"one": 1, "two": 2, "three": 3}
    for m in re.finditer(r"\b((?i:one|two|three)|\d+) charges? casts? ([A-Z][A-Za-z' ]+?)(?=[,.;(]| as | at |$)", t):
        n = m.group(2).strip().lower()
        if n in names:
            out.append({"name": names[n], "cost": words.get(m.group(1).lower()) or int(m.group(1))})
    for m in re.finditer(r"([A-Z][A-Za-z' ]+?) \((\d+)(?: charges?)?\)", t):
        n = re.sub(r"^.*?(?:: |, )", "", m.group(1)).strip().lower()
        if n in names and not any(x["name"].lower() == n for x in out):
            out.append({"name": names[n], "cost": int(m.group(2))})
    cl = re.search(r"as an? (\d+)(?:st|nd|rd|th)-level caster", t)
    return out, int(cl.group(1)) if cl else 0


def non_caster(t):
    """"...or at caster level 12 and DC 18 in the hands of a non-caster" (Staff of the Magi)."""
    m = re.search(r"caster level (\d+) and DC (\d+) in the hands of a non-caster", t)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


# Toolkits from the Handbook's Starting Equipment & Gear page (p. 41-42): the Artificer Kit toolkits
# (free to an Artificer of the matching Kit) and the Artisan's toolkits that go with crafting Skills.
TOOLKITS = [
    ("Infuser's Toolkit", "35 gp", "Fine engraving picks, a small portable forge-kit, etching acid, and a set of enchanter's files, carried in a reinforced satchel. Free to an Artificer of the Infuser Kit."),
    ("Construct Engineer's Toolkit", "35 gp", "Precision screwdrivers, a miniature bellows, spare gears and joints, wiring spools, and a small vice, carried in a hinged case. Free to an Artificer of the Construct Engineer Kit."),
    ("Gadgeteer's Toolkit", "35 gp", "A lockpick-adjacent fine-tool roll, spare springs and triggers, fuse cord, and a magnifying loupe, carried in a slim leather wrap. Free to an Artificer of the Gadgeteer Kit."),
    ("Alchemist's Toolkit", "35 gp", "A collapsible burner, glass vials and stoppers, a mortar and pestle, and a small dosage scale, carried in a padded case. Matches the Alchemy Skill; free to an Artificer of the Alchemist Kit."),
] + [(n, p, f"Artisan's toolkit for the {k} Skill (NWP). You need the tools to craft: with no usable tools you cannot craft.") for n, k, p in [
    ("Blacksmith's Tools", "Blacksmithing", "20 gp"), ("Carpenter's Tools", "Carpentry", "12 gp"), ("Stonemason's Tools", "Stonemasonry", "15 gp"),
    ("Bowyer/Fletcher's Tools", "Bowyer/Fletcher", "10 gp"), ("Cobbler's Tools", "Cobbling", "6 gp"), ("Gem Cutter's Tools", "Gem Cutting", "25 gp"),
    ("Potter's Tools", "Pottery", "5 gp"), ("Weaver's Tools", "Weaving", "6 gp"), ("Leatherworker's Tools", "Leatherworking", "10 gp"),
    ("Weaponsmith's Tools", "Weaponsmithing", "22 gp"), ("Armourer's Tools", "Armourer", "25 gp"), ("Brewer's Tools", "Brewing", "10 gp"),
    ("Vintner's Tools", "Winemaking", "12 gp"), ("Cook's Tools", "Cooking", "5 gp")]]

def build():
    bundled = catalogue_bundles()
    names = spell_names()
    docs, folder_names = load()
    by_name = {d["name"]: (f, d) for f, d in docs.items()}
    changed = 0
    for f, d in docs.items():
        s = d["system"]
        fold = folder_names.get(d.get("folder"), "")
        t = text(d)
        before = json.dumps(d, sort_keys=True)
        s.setdefault("bundle", 0)
        if re.search(r"bundles?\s*5\s*/\s*slot|bundle of 5", t, re.I) or d["name"].lower() in bundled or re.sub(r"\s*\(.*\)$", "", d["name"]).lower() in bundled or d["name"] in THROWN or fold in ("Iconic Rings",) \
                or (fold == "Iconic Wands, Staffs & Rods" and d["name"].startswith("Wand")):
            s["bundle"] = 5
        if d["name"] in EXTRA_BUNDLES or re.match(r"^Scroll\b", d["name"]):  # scrolls bundle 5 a slot (Kieran, 25 Oct)
            s["bundle"] = 5
        if d["name"] in NO_SLOT:
            s["slots"] = 0
        if d["type"] == "weapon":
            # The Catalogue marks two-handed weapons and polearms with a dagger sign and two slots; those melee weapons
            # get the Two-handed trait (Crushing Blow reads it), bar the Versatile, which can be wielded in one hand.
            tr = s.get("traits", "") or ""
            if not s.get("ranged") and float(s.get("slots") or 0) >= 2 and not re.search(r"\b(versatile|light|two-handed)\b", tr, re.I) \
                    and d["name"] not in ONE_HANDED:
                s["traits"] = f"{tr}, Two-handed" if tr.strip() else "Two-handed"
            # Kieran, 20 Oct (by AD&D 2e and 5e): the Trident is one-handed; a Lance is two-handed on foot, one-handed
            # when mounted (its Mounted switch on the sheet says which).
            if d["name"] in ONE_HANDED:
                s["traits"] = re.sub(r",?\s*Two-handed(?: on foot)?(?=\s*(?:,|$))", "", s.get("traits", "") or "").strip(", ")
            if d["name"] in LANCES:
                t2 = re.sub(r",?\s*Two-handed(?: on foot)?(?=\s*(?:,|$))", "", s.get("traits", "") or "").strip(", ")
                s["traits"] = f"{t2}, Two-handed on foot" if t2 else "Two-handed on foot"
                s["toggle"] = True; s["modeLabel"] = "Mounted"; s.setdefault("modeLight", 0); s.setdefault("active", False)
            n = d["name"].lower()
            s["ammoType"] = "bolt" if "crossbow" in n else "arrow" if re.search(r"\bbow\b", n) else "stone" if n == "sling" else ""
            s.setdefault("ammoId", "")
        if d["type"] == "equipment":
            s.setdefault("ammoType", "")
            s.setdefault("container", {"holds": False, "capacity": 0, "weightless": False, "extradimensional": False})
            s.setdefault("consumable", {"use": False, "heal": ""})
            s.setdefault("charges", {"value": 0, "max": 0, "recharge": "", "crumble": False})
            s.setdefault("light", {"bright": 0, "dim": 0, "hours": 0, "lit": False, "litAt": 0})
            s["light"].setdefault("angle", 360)
            s.setdefault("scroll", {"spell": None, "cl": 0, "dc": 0})
            if (fold in CONSUMABLE_FOLDERS or re.search(r"^(Healing Potion|Antitoxin|Torches|Candles and Tapers|Tindertwigs)", d["name"])) \
                    and not NOT_CONSUMABLE.match(d["name"]) and not (fold == "Spellbooks & Scrolls" and not d["name"].startswith("Scroll")):
                s["consumable"]["use"] = True
            heal = re.search(r"Heals (\d+d\d+(?:\s*[+-]\s*\d+)?) HP", t)
            if heal:
                s["consumable"]["heal"] = heal.group(1).replace(" ", "")
            ch = re.search(r"(\d+) charges", t)
            if fold == "Iconic Wands, Staffs & Rods" and ch:
                n = int(ch.group(1))
                s["charges"] = {"value": n, "max": n, "recharge": "1d4" if d["name"].startswith("Staff") else "",
                                "crumble": d["name"].startswith(("Wand", "Staff"))}
                spells, cl = item_spells(t, names)
                s["itemSpells"], s["castLevel"] = spells, cl
                s["nonCasterCl"], s["nonCasterDc"] = non_caster(t)
            s.setdefault("itemSpells", [])
            s.setdefault("castLevel", 0)
            s.setdefault("nonCasterCl", 0)
            s.setdefault("nonCasterDc", 0)
            lt = re.search(r"bright light in a (\d+) ?ft radius for (\d+) hours", t)
            if lt:
                s["light"].update({"bright": int(lt.group(1)), "dim": int(lt.group(1)), "hours": int(lt.group(2))})
            if d["name"] in LIGHTS:
                bright, total, hours, angle = LIGHTS[d["name"]]
                s["light"].update({"bright": bright, "dim": total, "hours": hours, "angle": angle})
            if d["name"] in CONTAINERS:
                s["container"]["holds"] = True
            if d["name"] in ("Bag of Holding", "Portable Hole"):
                s["container"] = {"holds": True, "capacity": 8 if d["name"] == "Bag of Holding" else 20, "weightless": True, "extradimensional": True}
        if json.dumps(d, sort_keys=True) != before:
            changed += 1
            json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)

    # Iconic weapons become weapons on their base weapon.
    for name, (base, plus, extra, more) in ICONIC.items():
        if name not in by_name or base not in by_name:
            print(f"gear: skipped {name} (missing {base})")
            continue
        f, d = by_name[name]
        bs = by_name[base][1]["system"]
        s = d["system"]
        d["type"] = "weapon"
        d["system"] = {
            "description": s["description"], "source": s.get("source", {"book": "phb", "page": 0}),
            "quantity": 1, "slots": s.get("slots", 1), "bundle": 0, "price": s.get("price", ""), "equipped": False,
            "inside": "", "identified": True, "unidentifiedName": "", "unidentifiedDescription": "",
            "damage": bs["damage"], "damageType": bs["damageType"], "ability": bs["ability"], "ranged": False,
            "range": more.get("range", bs.get("range", "")), "magic": plus, "attackBonus": 0,
            "traits": more.get("traits", bs.get("traits", "")), "ammoType": "", "ammoId": "",
            "bonusDamage": [{"formula": a, "type": b, "when": "" if c == "mode" else c, "mode": c == "mode"} for a, b, c in extra],
            "modeLabel": more.get("modeLabel", ""), "modeLight": more.get("modeLight", 0),
            "rules": more.get("rules", []), "toggle": more.get("toggle", False), "active": False, "applies": []
        }
        json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)
        changed += 1

    # Ammunition, beside the missile weapons.
    missile = next((i for i, n in folder_names.items() if n == "Missile Weapons"), None)
    for name, kind, qty, price in AMMO:
        _id = fid("equipment", "item", name)
        doc = {
            "_id": _id, "_key": f"!items!{_id}", "name": name, "type": "equipment", "img": icon("ammo", "stone-pile" if kind == "stone" else "arrow-cluster"),
            "folder": missile, "sort": 0, "ownership": {"default": 0}, "flags": {}, "effects": [],
            "system": {
                "description": f"<p>Ammunition, 30 to a slot. {price}.</p>", "source": {"book": "phb", "page": 0},
                "quantity": qty, "slots": 1, "bundle": 30, "price": price, "equipped": False, "inside": "",
                "identified": True, "unidentifiedName": "", "unidentifiedDescription": "", "ammoType": kind,
                "container": {"holds": False, "capacity": 0, "weightless": False, "extradimensional": False},
                "consumable": {"use": False, "heal": ""}, "charges": {"value": 0, "max": 0, "recharge": "", "crumble": False},
                "light": {"bright": 0, "dim": 0, "hours": 0, "lit": False, "litAt": 0, "angle": 360}, "scroll": {"spell": None, "cl": 0, "dc": 0},
                "itemSpells": [], "castLevel": 0, "nonCasterCl": 0, "nonCasterDc": 0,
                "rules": [], "toggle": False, "active": False, "applies": []
            }
        }
        json.dump(doc, open(os.path.join(PACK, f"items_{re.sub(r'[^A-Za-z0-9]+', '_', name)}_{_id}.json"), "w"), ensure_ascii=False, indent=1)
        changed += 1

    # Named Uniques (M&T v0.10.41): one weapon each, beside the iconic weapons, with its own icon. The GM places them.
    uniques = named_uniques()
    home = by_name.get("Vorpal Sword", (None, {}))[1].get("folder")
    for uname, base_phrase, plus, utext in uniques:
        base = UNIQUE_BASE.get(base_phrase.lower())
        if not base or base not in by_name:
            print(f"gear: skipped {uname} (no base weapon for {base_phrase})")
            continue
        bs = by_name[base][1]["system"]
        _id = fid("equipment", "item", f"unique|{uname}")
        power, _, quirk = utext.partition("*Quirk")
        quirk = ("Quirk" + quirk).replace("*", "").strip() if quirk else ""
        # "Quirk (Heavy): it takes 1 more slot" (Stonefather).
        slots = bs.get("slots", 1) + (1 if re.search(r"takes 1 more slot", quirk, re.I) else 0)
        extra = [{"formula": a, "type": (b or "").lower(), "when": f"against {c.strip()}", "mode": False} for a, b, c in UNIQUE_EXTRA.findall(power)]
        desc = (f"<p><em>Named Unique ({base_phrase} +{plus}).</em> {html.escape(power.strip())}</p>"
                + (f"<p><strong>{html.escape(quirk.split(':', 1)[0])}:</strong> {html.escape(quirk.split(':', 1)[1].strip()) if ':' in quirk else ''}</p>" if quirk else "")
                + "<p class=\"arn-note\">Monsters &amp; Treasure, Named Uniques."
                + (" Saves use DC 10 + half your level + the attribute named." if re.search(r"\bsave\b", utext, re.I) and "DC)" in utext else "") + "</p>")
        doc = {
            "_id": _id, "_key": f"!items!{_id}", "name": uname, "type": "weapon", "img": icon("unique", UNIQUE_GLYPH.get(uname, "crossed-swords")),
            "folder": home, "sort": 0, "ownership": {"default": 0}, "flags": {"arneyan": {"baseWeapon": base}}, "effects": [],
            "system": {
                "description": desc, "source": {"book": "mt", "page": 0},
                "quantity": 1, "slots": slots, "bundle": 0, "price": "Unique (never for sale)", "equipped": False,
                "inside": "", "identified": True, "unidentifiedName": "", "unidentifiedDescription": "",
                "damage": bs["damage"], "damageType": bs["damageType"], "ability": bs["ability"], "ranged": bool(bs.get("ranged")),
                "range": bs.get("range", ""), "magic": plus, "attackBonus": 0, "traits": bs.get("traits", ""),
                "ammoType": bs.get("ammoType", ""), "ammoId": "", "bonusDamage": extra, "modeLabel": "", "modeLight": 0,
                "rules": [], "toggle": False, "active": False, "applies": []
            }
        }
        json.dump(doc, open(os.path.join(PACK, f"items_{re.sub(r'[^A-Za-z0-9]+', '_', uname)}_{_id}.json"), "w"), ensure_ascii=False, indent=1)
        changed += 1

    # The Secrets (M&T v0.10.45, K55): one card each in a Secrets folder beside the Unique Items; the Last Form is also a feat.
    sec_list = secrets()
    if sec_list:
        parent = None  # build_tidy puts it under Magic Items, beside the Unique Items
        sec_folder = fid("equipment", "folder", "secrets")
        json.dump({"_id": sec_folder, "_key": f"!folders!{sec_folder}", "name": "Secrets", "type": "Item", "folder": parent, "sorting": "a",
                   "sort": 67, "color": None, "flags": {}, "description": "Monsters & Treasure: Uniques that teach what no level, teacher or feat does."},
                  open(os.path.join(PACK, f"folders_Secrets_{sec_folder}.json"), "w"), ensure_ascii=False, indent=1)
    for sname, form, stext, study in sec_list:
        _id = fid("equipment", "item", f"secret|{sname}")
        doc = {
            "_id": _id, "_key": f"!items!{_id}", "name": sname, "type": "equipment", "img": icon("secret", SECRET_GLYPH.get(sname, "secret-book")),
            "folder": sec_folder, "sort": 0, "ownership": {"default": 0}, "flags": {"arneyan": {"secret": study or {}}}, "effects": [],
            "system": {"description": secret_html(sname, form, stext), "source": {"book": "mt", "page": 0}, "quantity": 1, "slots": 1.0,
                       "price": "Unique (never for sale)", "equipped": False, "bundle": 0, "ammoType": "",
                       "container": {"holds": False, "capacity": 0, "weightless": False, "extradimensional": False},
                       "consumable": {"use": False, "heal": ""}, "charges": {"value": 0, "max": 0, "recharge": "", "crumble": False},
                       "light": {"bright": 0, "dim": 0, "hours": 0, "lit": False, "litAt": 0, "angle": 360},
                       "scroll": {"spell": None, "cl": 0, "dc": 0}, "itemSpells": [], "castLevel": 0, "nonCasterCl": 0, "nonCasterDc": 0}
        }
        json.dump(doc, open(os.path.join(PACK, f"items_{re.sub(r'[^A-Za-z0-9]+', '_', sname)}_{_id}.json"), "w"), ensure_ascii=False, indent=1)
        changed += 1
        if sname == "The Last Form":
            # The Unique feat it teaches: on no Path, no feat level, once per encounter.
            teach = re.search(r"\*Teaches:\*\s*the Unique feat The Last Form:\s*(.+?)\s*It is on no Path", stext)
            fpack = os.path.join(OUT, "feats")
            fid_ = fid("feats", "item", "secret|The Last Form")
            fdoc = {"_id": fid_, "_key": f"!items!{fid_}", "name": "The Last Form", "type": "feat", "img": icon("secret", "fist"),
                    "folder": None, "sort": 0, "ownership": {"default": 0}, "flags": {}, "effects": [],
                    "system": {"description": f"<p><em>Unique feat (a Secret).</em> {html.escape(teach.group(1) if teach else '')[:1].upper() + html.escape(teach.group(1) if teach else '')[1:]}</p>"
                               "<p>It is on no Path, uses no feat level and isn't your Trained Feat for the Tier; once per character. Learned only by studying "
                               "with its one living holder (the Secret The Last Form).</p>",
                               "source": {"book": "mt", "page": 0}, "path": "", "levelTaken": 0,
                               "uses": {"value": 1, "max": 1, "per": "encounter"}, "rules": [], "toggle": False, "active": False}}
            json.dump(fdoc, open(os.path.join(fpack, f"items_The_Last_Form_{fid_}.json"), "w"), ensure_ascii=False, indent=1)

    # Worn magic items whose Catalogue line is a plain number (28 Oct 2026, the Veterans' Monk wears a Ring of
    # Protection): the number as a rule, counted while the item is equipped.
    for wname, wrules in WORN_RULES.items():
        if wname in by_name:
            f, d = by_name[wname]
            if d["system"].get("rules") != wrules:
                d["system"]["rules"] = wrules
                json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)
                changed += 1

    # Toolkits. Tools & Trades doesn't exist yet on a clean build: build_tidy puts them in it.
    tools = next((i for i, n in folder_names.items() if n == "Tools & Trades"), None)
    have = {d["name"] for d in docs.values()}
    for tk_name, tk_price, tk_text in TOOLKITS:
        if tk_name in have:
            continue
        _id = fid("equipment", "item", tk_name)
        doc = {
            "_id": _id, "_key": f"!items!{_id}", "name": tk_name, "type": "equipment", "img": icon("tool", "toolbox"),
            "folder": tools, "sort": 0, "ownership": {"default": 0}, "flags": {}, "effects": [],
            "system": {
                "description": f"<p>{tk_text}</p><p class=\"arn-note\">{tk_price}. Starting Equipment &amp; Gear.</p>", "source": {"book": "phb", "page": 41},
                "quantity": 1, "slots": 1, "bundle": 1, "price": tk_price, "equipped": False, "inside": "",
                "identified": True, "unidentifiedName": "", "unidentifiedDescription": "", "ammoType": "",
                "container": {"holds": False, "capacity": 0, "weightless": False, "extradimensional": False},
                "consumable": {"use": False, "heal": ""}, "charges": {"value": 0, "max": 0, "recharge": "", "crumble": False},
                "light": {"bright": 0, "dim": 0, "hours": 0, "lit": False, "litAt": 0, "angle": 360}, "scroll": {"spell": None, "cl": 0, "dc": 0},
                "itemSpells": [], "castLevel": 0, "nonCasterCl": 0, "nonCasterDc": 0,
                "rules": [], "toggle": False, "active": False, "applies": []
            }
        }
        json.dump(doc, open(os.path.join(PACK, f"items_{re.sub(r'[^A-Za-z0-9]+', '_', tk_name)}_{_id}.json"), "w"), ensure_ascii=False, indent=1)
        changed += 1
    return changed

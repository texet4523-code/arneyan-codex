"""Monsters & Treasure's magic items that aren't in the Catalogue (M&T v0.10.41 to v0.10.64, B-F54):
the Named Uniques, the Common Magic Items, the Cursed Items, the Artefacts and the Growing Uniques.

Each is read from the M&T treasure chapter and made one item, in a folder of its own under Magic Items:
- a weapon or armour on its base (the "(greatsword +3)" in its line), so it can be attacked with or worn;
- otherwise a plain item card.
Cursed items are made unidentified: players see the item each one passes for (its name, and its Catalogue text when
the Catalogue has it) until the GM reveals it. Growing Uniques carry their three states in the text; a weapon or armour
starts at its Dormant bonus, and flags.arneyan.growing holds the bonus for each state.
"""
import html, json, os, re
from lib import fid
from icons import icon, _pick, WEAPON, ARMOUR, SHIELD, GEAR

SRC = "/tmp/hb/mm/treasure.md"

# The base a "(greatsword +3)" names -> the Catalogue's weapon.
WEAPON_BASE = {"greatsword": "Greatsword", "long sword": "Sword, Long", "maul": "Maul", "trident": "Trident",
               "war hammer": "Hammer, War", "scimitar": "Sword, Scimitar", "long bow": "Bow, Long", "heavy flail": "Flail, Heavy",
               "rapier": "Sword, Rapier", "glaive": "Glaive", "heavy mace": "Mace, Heavy", "battle axe": "Axe, Battle",
               "dagger": "Dagger", "wolf spear": "Spear, Wolf", "short sword": "Sword, Short", "heavy crossbow": "Crossbow, Heavy",
               "morningstar": "Morningstar", "spear": "Spear", "quarterstaff": "Staff", "war pick": "Pick, Heavy",
               "greataxe": "Axe, Two-Handed", "whip": "Whip"}
# ... and the Catalogue's armour or shield.
ARMOUR_BASE = {"breastplate": "Breastplate, Steel", "plate": "Full Plate", "chain mail": "Chain Mail Hauberk",
               "studded leather": "Studded Leather", "large shield": "Shield, Large Steel", "shield": "Shield, Medium Steel"}

UNIQUE_GLYPH = {"Soulthief": "bloody-sword", "Wyrmsbane": "dragon-head", "Wallguard": "stone-wall", "Stonefather": "warhammer",
                "Tidecaller": "trident", "Groundbreaker": "hammer-drop", "Hairsplitter": "saber-slash", "Phoenix Oath": "winged-arrow",
                "Wardenbreaker": "flail", "Dreadknell": "ringing-bell", "Retort": "fencer", "Veilcutter": "glaive",
                "Gravebane": "mace-head", "Hillfeller": "battle-axe", "Adder's Kiss": "snake-bite", "Stormcall": "lightning-trio",
                "Weeping Edge": "bleeding-wound", "Greenmantle": "vine-whip", "Quickwind": "crossbow", "Wakeful": "awareness"}
# "+2d6 damage against dragons": extra damage the GM ticks on the damage card.
EXTRA = re.compile(r"\+(\d+d\d+)\s*(fire|cold|lightning|radiant|necrotic|poison|acid|thunder|psychic|force)?\s*(?:damage\s*)?against ([a-z ]+?)(?=[,.;]| and )", re.I)
# "+1d6 fire on a hit": extra damage on every hit.
ON_HIT = re.compile(r"\+(\d+d\d+)\s*(fire|cold|lightning|radiant|necrotic|poison|acid|thunder|psychic|force)\s*(?:damage\s*)?on a hit", re.I)

# Folder (name, slug, sort) for each section.
FOLDERS = {"named": ("Named Uniques", "named-uniques", 66), "common": ("Common Magic Items", "common-magic-items", 64),
           "cursed": ("Cursed Items", "cursed-items", 65), "artefact": ("Artefacts", "artefacts", 68),
           "growing": ("Growing Uniques", "growing-uniques", 67)}
NOTE = {"named": "Monsters &amp; Treasure, Named Uniques.", "common": "Monsters &amp; Treasure, Common Magic Items.",
        "cursed": "Monsters &amp; Treasure, Cursed Items.", "artefact": "Monsters &amp; Treasure, Artefacts.",
        "growing": "Monsters &amp; Treasure, Growing Uniques."}
# Common items small enough to bundle 5 to a slot.
SMALL = re.compile(r"\b(Bead|Candle|Die|Key|Arrow|Ammunition|Ruby|Eye)\b")
NEVER_SOLD = "Unique (never for sale)"
# M&T Enchanted Arms and Armour: the value of a plain +N (what a cursed weapon or shield passes for).
ENCHANT_VALUE = {("weapon", 1): "45 gp", ("weapon", 2): "300 gp", ("weapon", 3): "900 gp",
                 ("armour", 1): "45 gp", ("armour", 2): "300 gp", ("armour", 3): "900 gp",
                 ("shield", 1): "40 gp", ("shield", 2): "250 gp", ("shield", 3): "800 gp"}
EMPTY_GEAR = {"ammoType": "", "container": {"holds": False, "capacity": 0, "weightless": False, "extradimensional": False},
              "consumable": {"use": False, "heal": ""}, "charges": {"value": 0, "max": 0, "recharge": "", "crumble": False},
              "light": {"bright": 0, "dim": 0, "hours": 0, "lit": False, "litAt": 0, "angle": 360},
              "scroll": {"spell": None, "cl": 0, "dc": 0}, "itemSpells": [], "castLevel": 0, "nonCasterCl": 0, "nonCasterDc": 0}


def section(t, head):
    """[(name, paren, text)] for each "- **Name** ..." line under a heading (to the next heading)."""
    i = t.find(head)
    if i < 0:
        print(f"gear: WARNING no {head!r} in the treasure chapter")
        return []
    block = t[i + len(head):].split("\n#", 1)[0]
    out = []
    for m in re.finditer(r"^- \*\*(.+?)\*\*(.*)$", block, re.M):
        name, rest = m.group(1).strip(), m.group(2).strip()
        if name.endswith("."):            # "**Portal keys.** Not Uniques: ..." is a note, not an item
            continue
        name = name.rstrip(":").strip()
        rest = re.sub(r"^\[Unique\]\s*", "", rest)
        paren = ""
        if rest.startswith("("):
            depth = 0
            for k, ch in enumerate(rest):
                depth += ch == "("
                depth -= ch == ")"
                if depth == 0:
                    paren, rest = rest[1:k], rest[k + 1:]
                    break
        out.append((name, paren.strip(), rest.lstrip(".:").strip()))
    return out


def base_of(paren):
    """(kind, Catalogue name, +N) from "greatsword +3", "a shield +1, crawling ...", "a skull-headed rod, also a heavy mace +3"."""
    for part in [p.strip() for p in re.split(r",", paren)]:
        m = re.match(r"^(?:also )?(?:an? )?([a-z ]+?)(?: \+(\d))?$", part)
        if not m:
            continue
        word, plus = m.group(1).strip(), int(m.group(2) or 0)
        if word in WEAPON_BASE:
            return "weapon", WEAPON_BASE[word], plus
        if word in ARMOUR_BASE:
            return "armour", ARMOUR_BASE[word], plus
    return None, None, 0


def p(s):
    """Markdown-ish text to escaped HTML: *spell* and **bold** kept."""
    s = html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    return re.sub(r"\*(.+?)\*", r"<em>\1</em>", s)


def glyph(kind, name, paren):
    words = f"{paren} {name}"
    if kind == "weapon":
        return _pick(WEAPON, words)
    if kind == "armour":
        return _pick(SHIELD, words) if "shield" in words.lower() else _pick(ARMOUR + [(r"", "leather-armor")], words)
    return _pick(GEAR, words)


def weapon_system(bs, plus, extra=None, slots=None):
    return {"damage": bs["damage"], "damageType": bs["damageType"], "ability": bs["ability"], "ranged": bool(bs.get("ranged")),
            "range": bs.get("range", ""), "magic": plus, "attackBonus": 0, "traits": bs.get("traits", ""),
            "ammoType": bs.get("ammoType", "") if bs.get("ranged") else "", "ammoId": "", "bonusDamage": extra or [],
            "modeLabel": "", "modeLight": 0, "rules": [], "toggle": False, "active": False, "applies": []}


def armour_system(bs, plus):
    return {"category": bs.get("category", "light"), "ac": bs.get("ac", 1), "magic": plus, "traits": bs.get("traits", ""),
            "rules": [], "toggle": False, "active": False, "applies": []}


def doc_for(key, name, desc, kind, base, plus, by_name, folder, img, price, slots=None, extra=None, flags=None, more=None):
    """One item document: a weapon or armour on its base, or a plain item."""
    _id = fid("equipment", "item", key)
    def common(n):
        return {"description": desc, "source": {"book": "mt", "page": 0}, "quantity": 1, "slots": n, "bundle": 0, "price": price,
                "equipped": False, "inside": "", "identified": True, "unidentifiedName": "", "unidentifiedDescription": ""}
    if kind in ("weapon", "armour"):
        bs = by_name[base][1]["system"]
        system = {**common(slots if slots is not None else bs.get("slots", 1)),
                  **(weapon_system(bs, plus, extra) if kind == "weapon" else armour_system(bs, plus))}
        flags = {"arneyan": {**({"baseWeapon": base} if kind == "weapon" else {"baseArmour": base}), **(flags or {})}}
    else:
        kind = "equipment"
        system = {**common(slots if slots is not None else 1), **json.loads(json.dumps(EMPTY_GEAR)),
                  "rules": [], "toggle": False, "active": False, "applies": []}
        flags = {"arneyan": flags} if flags else {}
    if more:
        for k, v in more.items():
            if isinstance(v, dict) and isinstance(system.get(k), dict):
                system[k].update(v)
            else:
                system[k] = v
    return _id, {"_id": _id, "_key": f"!items!{_id}", "name": name, "type": kind, "img": img, "folder": folder, "sort": 0,
                 "ownership": {"default": 0}, "flags": flags, "effects": [], "system": system}


def save(pack, name, _id, doc):
    json.dump(doc, open(os.path.join(pack, f"items_{re.sub(r'[^A-Za-z0-9]+', '_', name)}_{_id}.json"), "w"), ensure_ascii=False, indent=1)


def damage_extras(text):
    out = [{"formula": a, "type": (b or "").lower(), "when": f"against {c.strip()}", "mode": False} for a, b, c in EXTRA.findall(text)]
    out += [{"formula": a, "type": b.lower(), "when": "", "mode": False} for a, b in ON_HIT.findall(text)]
    return out


def build(by_name, pack):
    try:
        t = open(SRC, encoding="utf-8").read()
    except OSError:
        print(f"gear: WARNING no {SRC}: the M&T magic items are not built")
        return 0
    made = 0
    folders = {}
    for key, (fname, slug, sort) in FOLDERS.items():
        _fid = fid("equipment", "folder", slug)
        folders[key] = _fid
        json.dump({"_id": _fid, "_key": f"!folders!{_fid}", "name": fname, "type": "Item", "folder": None, "sorting": "a",
                   "sort": sort, "color": None, "flags": {}, "description": f"Monsters & Treasure: {fname}."},
                  open(os.path.join(pack, f"folders_{re.sub(r'[^A-Za-z0-9]+', '_', fname)}_{_fid}.json"), "w"), ensure_ascii=False, indent=1)

    def known(kind, base):
        return kind in ("weapon", "armour") and base in by_name

    # Named Uniques: the GM places them; saves use DC 10 + half level + the attribute named.
    for name, paren, text in section(t, "### Named Uniques"):
        kind, base, plus = base_of(paren)
        if kind and not known(kind, base):
            print(f"gear: Named Unique {name}: no {base} in the Catalogue, made a plain item")
            kind = None
        power, _, quirk = text.partition("*Quirk")
        quirk = ("Quirk" + quirk).replace("*", "").strip() if quirk else ""
        slots = None
        if kind and re.search(r"takes 1 more slot", quirk, re.I):
            slots = by_name[base][1]["system"].get("slots", 1) + 1
        desc = (f"<p><em>Named Unique ({p(paren)}).</em> {p(power.strip())}</p>"
                + (f"<p><strong>{p(quirk.split(':', 1)[0])}:</strong> {p(quirk.split(':', 1)[1].strip())}</p>" if ":" in quirk else "")
                + f"<p class=\"arn-note\">{NOTE['named']}"
                + (" Saves use DC 10 + half your level + the attribute named." if re.search(r"\bsave\b", text, re.I) and "DC)" in text else "")
                + "</p>")
        img = icon("unique", UNIQUE_GLYPH.get(name) or ("crossed-swords" if kind == "weapon" else glyph(kind, name, paren)))
        _id, doc = doc_for(f"unique|{name}", name, desc, kind, base, plus, by_name, folders["named"], img, NEVER_SOLD,
                           slots=slots, extra=damage_extras(power) if kind == "weapon" else None)
        dt = re.search(r"\bit deals (fire|cold|lightning|radiant|necrotic|poison|acid|thunder|psychic|force) damage", power)
        if kind == "weapon" and dt:      # the Sunsword: "Its blade is sunlight: it deals radiant damage"
            doc["system"]["damageType"] = dt.group(1)
        save(pack, name, _id, doc)
        made += 1

    # Artefacts: never for sale, never from a hoard roll.
    for name, paren, text in section(t, "### Artefacts"):
        kind, base, plus = base_of(paren)
        if kind and not known(kind, base):
            kind = None
        parts = re.split(r"\*(Drawback|Destroyed):\*", text)
        desc = f"<p><em>Artefact ({p(paren)}).</em> {p(parts[0].strip())}</p>"
        for k in range(1, len(parts) - 1, 2):
            desc += f"<p><strong>{parts[k]}:</strong> {p(parts[k + 1].strip())}</p>"
        desc += f"<p class=\"arn-note\">{NOTE['artefact']} Its save DC is 20 unless the entry says otherwise.</p>"
        _id, doc = doc_for(f"artefact|{name}", name, desc, kind, base, plus, by_name, folders["artefact"],
                           icon("unique", glyph(kind, name, paren)), NEVER_SOLD,
                           extra=damage_extras(parts[0]) if kind == "weapon" else None,
                           slots=0 if re.search(r"room-sized|walking engine|throne|2ft globe", paren) else None)
        save(pack, name, _id, doc)
        made += 1

    # Growing Uniques: Dormant when found, Awakened at 9th level, Exalted at 17th.
    for name, paren, text in section(t, "### Growing Uniques"):
        kind, base, plus = base_of(paren)
        if kind and not known(kind, base):
            kind = None
        states = dict(re.findall(r"\*(Dormant|Awakened|Exalted):\*\s*(.+?)(?=\s*\*(?:Dormant|Awakened|Exalted):\*|$)", text))
        bonus = {"dormant": plus}
        for st in ("Awakened", "Exalted"):
            m = re.search(r"\bis \+(\d)", states.get(st, ""))
            bonus[st.lower()] = int(m.group(1)) if m else bonus["awakened" if st == "Exalted" else "dormant"]
        desc = (f"<p><em>Growing Unique ({p(paren)}).</em></p>"
                + "".join(f"<p><strong>{st}</strong> ({lvl}, save DC {dc}): {p(states.get(st, ''))}</p>"
                          for st, lvl, dc in (("Dormant", "when found", 13), ("Awakened", "bearer 9th level", 15), ("Exalted", "bearer 17th level", 17)))
                + f"<p class=\"arn-note\">{NOTE['growing']} Each state adds to the one before. It falls back to Dormant with a new bearer."
                + (f" Its bonus is +{bonus['dormant']} Dormant, +{bonus['awakened']} Awakened and +{bonus['exalted']} Exalted: raise it on the item when it wakes."
                   if kind and bonus["exalted"] != bonus["dormant"] else "") + "</p>")
        extra = damage_extras(states.get("Dormant", "")) if kind == "weapon" else None
        _id, doc = doc_for(f"growing|{name}", name, desc, kind, base, plus, by_name, folders["growing"],
                           icon("unique", glyph(kind, name, paren)), NEVER_SOLD, extra=extra, flags={"growing": bonus} if kind else None)
        save(pack, name, _id, doc)
        made += 1

    # Common Magic Items: 5 gp unless the entry says otherwise; 1 slot, small ones 5 to a slot.
    for name, paren, text in section(t, "## Common Magic Items"):
        price = paren if re.search(r"\d+\s*[gsc]p", paren) else "5 gp"
        more = {}
        ch = re.match(r"(\d+) charges", text)
        if ch:
            more["charges"] = {"value": int(ch.group(1)), "max": int(ch.group(1))}
        if SMALL.search(name):
            more["bundle"] = 5
        kind, base, plus = (None, None, 0)
        if name == "Moon-Touched Sword":    # a sword you can fight with; its moonlight is the toggle
            kind, base = "weapon", "Sword, Long"
            more.update({"toggle": True, "modeLabel": "In darkness", "modeLight": 15})
        desc = f"<p><em>Common magic item.</em> {p(text[:1].upper() + text[1:])}</p><p class=\"arn-note\">{NOTE['common']} {html.escape(price)}.</p>"
        _id, doc = doc_for(f"common|{name}", name, desc, kind, base, plus, by_name, folders["common"],
                           icon("weapon", base) if kind else icon("magic", name), price, more=more)
        save(pack, name, _id, doc)
        made += 1

    # Cursed Items: unidentified, passing for another item until the curse shows.
    for name, paren, text in section(t, "## Cursed Items"):
        seems = re.sub(r"^seems (?:an? )?", "", paren).split(" or ")[0].strip()
        kind, base, plus = base_of(seems)
        if kind and not known(kind, base):
            kind = None
        looks = by_name.get(seems) or next((v for k, v in by_name.items() if k.lower() == seems.lower()), None)
        shown = seems[:1].upper() + seems[1:]
        if kind:
            looks = None
            undesc = by_name[base][1]["system"].get("description", "") + f"<p>A {html.escape(seems)}.</p>"
            price = ENCHANT_VALUE.get(("shield" if "Shield" in base else kind, plus), "")
        else:
            undesc = looks[1]["system"].get("description", "") if looks else f"<p>It seems to be {html.escape(shown)}.</p>"
            price = looks[1]["system"].get("price", "") if looks else ""
        desc = (f"<p><em>Cursed item (seems {p(re.sub(r'^seems ', '', paren))}).</em> {p(text)}</p>"
                f"<p class=\"arn-note\">{NOTE['cursed']} Identify shows only what it seems; once the curse shows, it can't be put down "
                "or taken off until Remove Curse frees the user, and the item stays cursed. Valued as the item it imitates. "
                "Save DC 15 unless the entry says otherwise.</p>")
        _id, doc = doc_for(f"cursed|{name}", name, desc, kind, base, plus, by_name, folders["cursed"],
                           looks[1]["img"] if looks else (icon("weapon", base) if kind == "weapon" else icon("shield" if "Shield" in (base or "") else "armour", base)
                                                          if kind else icon("magic", seems)), price,
                           more={"identified": False, "unidentifiedName": shown, "unidentifiedDescription": undesc})
        save(pack, name, _id, doc)
        made += 1
    return made

"""Pregenerated characters (Kieran, 19 Oct 2026): the one-shots' pregens as ready characters in their own
compendium, one folder per adventure (and per act for The Broken Anvil).

Each character in build/pregens/*.json (see the schema in that folder's README) becomes a character actor with
its class, ancestry, kit, class and kit features, feats, skills, spells and gear copied from the system's own
compendiums, so they behave like a character built on the sheet. Anything that isn't in a compendium (a holy
symbol, a satchel) becomes a plain gear item with the sheet's slots. The sheet's own text (abilities,
personality, tactics) goes in the biography, so nothing on the printed sheet is lost.
"""
import glob, html, json, os, re
from lib import OUT, fid, write

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = "pregens"
SYS = "arneyan"

FOLDERS = [  # (adventure, sub-folder, colour); order is the sidebar order
    ("The Broken Anvil", "", "#5a2a1a"),
    ("The Broken Anvil", "Level 1 - The Apprentices", "#5a2a1a"),
    ("The Broken Anvil", "Level 5 - The Journeymen", "#5a2a1a"),
    ("The Broken Anvil", "Level 9 - The Veterans", "#5a2a1a"),
    ("Jacob's Well", "", "#2a3a4a"),
]

# Sheet names that the Catalogue spells differently.
ALIAS = {
    "longsword": "Sword, Long", "long sword": "Sword, Long", "short sword": "Sword, Short", "shortsword": "Sword, Short",
    "bastard sword": "Sword, Bastard", "broadsword": "Sword, Broad", "rapier": "Sword, Rapier", "scimitar": "Sword, Scimitar",
    "falchion": "Sword, Falchion", "war hammer": "Hammer, War", "warhammer": "Hammer, War", "light hammer": "Hammer, Light",
    "hand axe": "Axe, Hand/Throwing", "handaxe": "Axe, Hand/Throwing", "throwing axe": "Axe, Hand/Throwing",
    "battleaxe": "Axe, Battle", "battle axe": "Axe, Battle", "two-handed axe": "Axe, Two-Handed", "greataxe": "Axe, Two-Handed",
    "light crossbow": "Crossbow, Light", "heavy crossbow": "Crossbow, Heavy", "hand crossbow": "Crossbow, Hand",
    "longbow": "Bow, Long", "long bow": "Bow, Long", "shortbow": "Bow, Short", "short bow": "Bow, Short",
    "composite longbow": "Bow, Long Composite", "composite shortbow": "Bow, Short Composite",
    "light mace": "Mace, Light", "heavy mace": "Mace, Heavy", "mace": "Mace, Light", "quarterstaff": "Staff",
    "light flail": "Flail, Light", "heavy flail": "Flail, Heavy", "light pick": "Pick, Light", "heavy pick": "Pick, Heavy",
    "leather armour": "Leather Armour", "leather": "Leather Armour", "studded leather armour": "Studded Leather",
    "chain shirt": "Chain Mail Shirt", "chain mail": "Chain Mail Hauberk", "chainmail": "Chain Mail Hauberk",
    "medium wooden shield": "Shield, Medium Wooden", "medium steel shield": "Shield, Medium Steel",
    "large wooden shield": "Shield, Large Wooden", "large steel shield": "Shield, Large Steel",
    "wooden shield": "Shield, Medium Wooden", "steel shield": "Shield, Medium Steel", "shield": "Shield, Medium Wooden",
    "ration pack, 1 week": "Week's Rations", "week's rations": "Week's Rations", "rations": "Day's Rations",
    "canteen": "Personal Woollen Canteen", "waterskin": "Bladder Canteens", "torches": "Torch",
    "50ft hemp rope": "Rope, Hemp (50 ft)", "rope, hemp (50ft)": "Rope, Hemp (50 ft)", "hemp rope": "Rope, Hemp (50 ft)",
    "lockpicks, expanded": "Lockpicks (Expanded)", "lockpicks": "Lockpicks (Expanded)", "thieves' tools": "Lockpicks (Expanded)",
    "lamp oil": "Lamp Oil", "oil": "Lamp Oil", "flasks of oil": "Lamp Oil", "chalk": "Slate and Chalk",
    "holy symbol": "Holy Symbols", "spellbook": "Spellbook, blank", "bolts": "Bolts", "arrows": "Arrows",
    "sling stones": "Sling Stones", "potion of healing": "Healing Potion (Regular)", "healing potion": "Healing Potion (Regular)",
}


# Sheet names matched by pattern (a holy symbol of any god is the Catalogue's Holy Symbols).
PATTERNS = [(r"^holy symbol", "Holy Symbols"), (r"canteen", "Personal Woollen Canteen"), (r"^arrows\b", "Arrows"),
            (r"^bolts\b", "Bolts"), (r"^(?:a )?spellbook", "Spellbook, blank"), (r"^chalk", "Slate and Chalk")]


def norm(s):
    s = html.unescape(str(s)).lower().replace("’", "'")
    s = re.sub(r"\s*\((?:keepers' kit|specialised|included|x\d+|\d+)\)", "", s)
    s = re.sub(r"^\+\d\s+|\s+\+\d$", "", s)
    return re.sub(r"\s+", " ", s).strip(" .")


def load(pack):
    out = []
    for f in glob.glob(os.path.join(OUT, pack, "*.json")):
        d = json.load(open(f))
        if d.get("_key", "").startswith("!items!"):
            out.append(d)
    return out


class Index:
    """Name lookups in one compendium: exact, aliased, "Long Sword" for "Sword, Long", then a singular form."""
    def __init__(self, pack, types=None):
        self.pack = pack
        self.docs = [d for d in load(pack) if not types or d["type"] in types]
        self.by = {}
        for d in self.docs:  # exact names first, so "Cleric" never lands on "Cleric (Battle Priest)"
            self.by.setdefault(norm(d["name"]), d)
        for d in sorted(self.docs, key=lambda d: d.get("sort", 0)):
            n = norm(d["name"])
            bare = re.sub(r"\s*\(.*?\)", "", n).strip()
            for key in {n, re.sub(r"^(.*), (.*)$", r"\2 \1", n), n.replace(" (", " ").replace(")", ""), bare,
                        re.sub(r"^(.*), (.*)$", r"\2 \1", bare)}:
                self.by.setdefault(key, d)

    def find(self, name):
        n = norm(name)
        bare = re.sub(r"\s*\(.*?\)", "", n).strip()
        head = bare.split(",")[0].strip()
        tries = []
        for k in (n, bare, head):
            tries += [k, ALIAS.get(k, ""), re.sub(r"e?s$", "", k), ALIAS.get(re.sub(r"s$", "", k), "")]
        for pat, target in PATTERNS:
            if re.search(pat, n):
                tries.append(target)
        for key in tries:
            key = norm(key)
            if key and key in self.by:
                return self.by[key]
        return None


def uuid(pack, d):
    return f"Compendium.{SYS}.{pack}.Item.{d['_id']}"


def rule_number(value, level, cl):
    """A rule's value as the sheet works it out (effects.mjs evalNumber): numbers, @level/@cl/@half, + - * / and
    min/max/floor/ceil. Anything else counts 0, as there."""
    expr = str(value).strip()
    half = max(1, level // 2)
    expr = re.sub(r"@(\w+)", lambda m: str({"level": level, "cl": cl, "half": half}.get(m.group(1), 0)), expr)
    if not re.fullmatch(r"[\d\s+\-*/().,a-z]*", expr) or set(re.findall(r"[a-z]+", expr)) - {"min", "max", "floor", "ceil"}:
        return 0
    try:
        import math
        return float(eval(expr, {"__builtins__": {}}, {"min": min, "max": max, "floor": math.floor, "ceil": math.ceil}))
    except Exception:
        return 0


def hp_from_rules(items, level):
    """Max HP the sheet adds from rules (actor-models.mjs): hp.max as it is, hp.level times the character level. Only
    rules that count all the time: no `when`, gear equipped, switches on."""
    total = 0
    for it in items:
        s = it.get("system", {})
        if it.get("type") in ("weapon", "armour", "equipment") and not s.get("equipped"):
            continue
        if s.get("toggle") and not s.get("active"):
            continue
        cl = level  # a pregen has one class: its class level is its level
        for r in s.get("rules", []) or []:
            if r.get("when"):
                continue
            if r.get("key") == "hp.max":
                total += rule_number(r.get("value", 0), level, cl)
            elif r.get("key") == "hp.level":
                total += rule_number(r.get("value", 0), level, cl) * level
    return int(total)


def copy(pack, d, actor_id, salt, **system):
    """An embedded copy of a compendium item, linked back to it (so 0.7 migrations and the sheet's links work)."""
    item = json.loads(json.dumps(d))
    item["_id"] = fid("pregen-item", actor_id, salt)
    item["_key"] = f"!actors.items!{actor_id}.{item['_id']}"
    item.pop("folder", None)
    item.pop("sort", None)
    item["_stats"] = {"compendiumSource": uuid(pack, d)}
    item.setdefault("flags", {})
    for k, v in system.items():
        cur = item["system"]
        path = k.split(".")
        for p in path[:-1]:
            cur = cur.setdefault(p, {})
        cur[path[-1]] = v
    # An attribute of the player's choice (Will of Iron, Steady Hand): the printed sheet's numbers use the attribute
    # the item's own rule names, so that's the pick (the sheet would otherwise ask, and give no bonus until answered).
    ch = item["system"].get("abilityChoice")
    if isinstance(ch, dict) and len(ch.get("options") or []) > 1 and not ch.get("value"):
        named = [r["key"].split(".", 1)[1] for r in item["system"].get("rules") or [] if str(r.get("key", "")).startswith("ability.") and not r.get("when")]
        ch["value"] = next((k for k in named if k in ch["options"]), ch["options"][0])
    return item


def plain_item(actor_id, salt, name, itype="equipment", description="", **system):
    sys_ = {"description": description, "quantity": 1, "slots": 1}
    sys_.update(system)
    _id = fid("pregen-item", actor_id, salt)
    if itype != "equipment":
        sys_.pop("quantity", None); sys_.pop("slots", None)
    return {"_id": _id, "_key": f"!actors.items!{actor_id}.{_id}", "name": name, "type": itype,
            "img": "icons/svg/item-bag.svg" if itype == "equipment" else "icons/svg/book.svg", "system": sys_, "effects": [], "flags": {}}


def feat_level(f, char_level):
    """The level a pregen took a feat at, from its note ("Martial, 2nd", "1st-level feat", "Human bonus feat"), else 0."""
    try:
        char_level = int(char_level or 0)
    except (TypeError, ValueError):
        char_level = 0
    if char_level == 1:
        return 1
    if isinstance(f.get("level"), int):
        return f["level"]
    note = str(f.get("note") or "")
    # "2nd", "1st-level feat", "1st level." but not "One extra 2nd-level slot".
    m = re.search(r"\b(\d+)(?:st|nd|rd|th)(?=(?:[- ]level)?(?:\s+feat)?\s*(?:[,.;)]|$))", note)
    if m:
        return int(m.group(1))
    if re.search(r"\bbonus\b", note, re.I) and re.search(r"\bhuman\b", note, re.I):
        return 1  # a Human's bonus feat comes at 1st level
    return 0


def para(text):
    text = str(text or "").strip()
    if not text:
        return ""
    if text.startswith("<"):
        return text
    return "".join(f"<p>{html.escape(p.strip())}</p>" for p in re.split(r"\n\s*\n|\n", text) if p.strip())


def ability_html(c):
    if c.get("abilitiesHtml"):
        return c["abilitiesHtml"]
    out = []
    for p in re.split(r"\n\s*\n|\n", c.get("abilitiesText") or ""):
        p = p.strip()
        if not p:
            continue
        m = re.match(r"^\*\*(.{2,120}?)\*\*\s*(.*)$", p, re.S) or re.match(r"^([^.]{2,80}\.)\s+(.*)$", p, re.S)
        bold = lambda t: re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html.escape(t))
        out.append(f"<p><strong>{html.escape(m.group(1))}</strong> {bold(m.group(2))}</p>" if m else f"<p>{bold(p)}</p>")
    return "".join(out)


def build():
    classes = Index("classes")
    ancestries = Index("ancestries")
    kits = load("kits")
    feats = Index("feats")
    skills = Index("skills")
    spells = Index("spells")
    gear = Index("equipment")
    features = {d["_id"]: d for d in load("class-features")}

    # Folders
    fold = {}
    for i, (adv, sub, colour) in enumerate(FOLDERS):
        _id = fid("pregen-folder", adv, sub)
        fold[(adv, sub)] = _id
        write(PACK, {"_id": _id, "_key": f"!folders!{_id}", "name": sub or adv, "type": "Actor",
                     "folder": fold[(adv, "")] if sub else None, "sorting": "m", "sort": i * 1000, "color": colour,
                     "flags": {}, "description": ""})

    report = {"made": 0, "missing": []}
    for path in sorted(glob.glob(os.path.join(HERE, "pregens", "*.json"))):
        for c in json.load(open(path)):
            actor_id = fid("pregen", c["adventure"], c["name"])
            miss = lambda what, n: report["missing"].append(f"{c['name']}: {what} '{n}'")
            items = []

            # Class, with its features up to the character's level.
            cls_doc = classes.find(c["class"])
            if not cls_doc:
                miss("class", c["class"]); continue
            cls = copy("classes", cls_doc, actor_id, "class", levels=c["level"])
            items.append(cls)
            feats_raw = cls_doc["system"].get("features")
            feats_list = feats_raw if isinstance(feats_raw, list) else []
            for f in feats_list:
                if f.get("level", 1) > c["level"] or not f.get("uuid"):
                    continue
                fdoc = features.get(f["uuid"].rsplit(".", 1)[-1])
                if not fdoc:
                    continue
                it = copy("class-features", fdoc, actor_id, f"cf-{fdoc['_id']}", level=f["level"])
                it["flags"][SYS] = {"grantedBy": cls["_id"], "source": f["uuid"]}
                items.append(it)

            # Ancestry
            anc = ancestries.find(c["ancestry"])
            if anc:
                anc_item = copy("ancestries", anc, actor_id, "ancestry")
                items.append(anc_item)
                # Its subtype or bloodline (as on the sheet) and its traits, as the drop-in setup would add them.
                ch = anc["system"].get("choice") or {}
                note = norm(c.get("ancestryNote", ""))
                pick = next((o for o in ch.get("options", []) if note and (norm(o["name"]).split(" (")[0] in note or note.split(",")[0] in norm(o["name"]))), None)
                label = anc["name"] + (f" ({pick['name'].split(' (')[0]})" if pick else "")
                anc_item["name"] = label
                grants = [(t["name"], t["text"], []) for t in anc["system"].get("traitList", [])]
                if pick:  # its resistances count; its speed is already in the sheet's speed
                    grants.insert(0, (f"{ch['label']}: {pick['name']}", pick["text"], [r for r in pick.get("rules", []) if r["key"] != "speed"]))
                for gi, (gname, gtext, grules) in enumerate(grants):
                    _id = fid("pregen-item", actor_id, f"anc-{gi}")
                    items.append({"_id": _id, "_key": f"!actors.items!{actor_id}.{_id}", "name": gname, "type": "ability", "img": anc.get("img", ""),
                                  "effects": [], "system": {"description": f"<p>{html.escape(gtext)}</p>", "kind": "ancestry", "level": 1,
                                                            "className": label, "rules": grules},
                                  "flags": {SYS: {"grantedBy": anc_item["_id"], "source": f"{anc_item['_id']}.{gname}"}}})
                anc_item["flags"][SYS] = {"ancestry": {"choice": pick["name"] if pick else "", "family": "", "applied": {}}}
            else:
                miss("ancestry", c["ancestry"])

            # Kit (named "The Heavy Hand (Fighter)", or "Deity: Ilmater (The Winter's Solace) (Cleric)").
            base_cls = re.sub(r"\s*\(.*", "", c["class"])
            want = norm(re.sub(r"(?i)^(patron|deity|path|kit):\s*", "", c.get("kit", "")).split(",")[0])
            words = lambda t: set(re.findall(r"[a-z0-9']+", t)) - {"the", "of", "and"}
            note = norm(c.get("classNote", ""))
            kit = None
            for k in kits:
                kn = norm(k["name"])
                if not kn.endswith(f"({norm(base_cls)})"):
                    continue
                stem = kn[: -len(f"({norm(base_cls)})")].strip()
                if want and (stem == want or stem.startswith(want) or want in stem or words(want) <= words(stem)
                             or (note and stem.startswith("deity:") and note in stem)):
                    kit = k
                    break
            if kit:
                kit_item = copy("kits", kit, actor_id, "kit")
                items.append(kit_item)
                for idx, f in enumerate(kit["system"].get("features", [])):
                    if f.get("level", 1) > c["level"]:
                        continue
                    _id = fid("pregen-item", actor_id, f"kitf-{idx}")
                    items.append({"_id": _id, "_key": f"!actors.items!{actor_id}.{_id}", "name": f["name"], "type": "ability",
                                  "img": kit.get("img", "icons/svg/book.svg"), "effects": [],
                                  "system": {"description": f.get("description", ""), "kind": "class", "level": f.get("level", 1),
                                             "className": kit["name"], "rules": f.get("rules", []), "toggle": bool(f.get("toggle")),
                                             "active": False, "applies": f.get("applies", []),
                                             # As on a grant in Foundry (progression.mjs): uses, save, damage, activities.
                                             **{k: f[k] for k in ("uses", "save", "damage", "damageType", "activities") if f.get(k)}},
                                  "flags": {SYS: {"grantedBy": kit_item["_id"], "source": f"{kit_item['_id']}.{idx}"}}})
            elif c.get("kit"):
                miss("kit", c["kit"])

            # Feats
            for i, f in enumerate(c.get("feats", [])):
                d = feats.find(f["name"])
                if d:
                    items.append(copy("feats", d, actor_id, f"feat-{i}", levelTaken=feat_level(f, c.get("level", 0))))
                else:
                    items.append(plain_item(actor_id, f"feat-{i}", f["name"], "ability", para(f.get("note", "")), kind="other"))

            # Skills (NWPs)
            for i, s in enumerate(c.get("skills", [])):
                d = skills.find(s["name"])
                if d:
                    items.append(copy("skills", d, actor_id, f"skill-{i}", tier=s.get("tier", "trained")))
                else:
                    miss("skill", s["name"])

            # Weapons and armour, worn and ready.
            for i, w in enumerate(c.get("weapons", [])):
                if re.search(r"(?i)\bcantrip\b", w["name"]):
                    continue  # a cantrip's attack line: the spell is on the sheet
                d = gear.find(w["name"])
                extra = {"equipped": True, "quantity": max(1, int(w.get("qty") or 1))}
                if w.get("magic"):
                    extra["magic"] = int(w["magic"])
                if d and d["type"] == "weapon":
                    items.append(copy("equipment", d, actor_id, f"w-{i}", **extra))
                elif d:  # Alchemist's Fire and the like: thrown gear, not a weapon
                    items.append(copy("equipment", d, actor_id, f"w-{i}", quantity=extra["quantity"]))
                else:
                    miss("weapon", w["name"])
                    items.append(plain_item(actor_id, f"w-{i}", w["name"], "equipment", para(w.get("notes", "")), quantity=extra["quantity"]))
            for i, a in enumerate(c.get("armour", [])):
                d = gear.find(a["name"])
                extra = {"equipped": True}
                if a.get("magic"):
                    extra["magic"] = int(a["magic"])
                if d and d["type"] == "armour":
                    items.append(copy("equipment", d, actor_id, f"a-{i}", **extra))
                else:
                    miss("armour", a["name"])
                    items.append(plain_item(actor_id, f"a-{i}", a["name"], "equipment", para(a.get("notes", "")), slots=a.get("slots", 1)))
            for i, g in enumerate(c.get("gear", [])):
                if re.match(r"(?i)coin purse|coins?\b", g["name"]):
                    continue  # the coins are on the sheet's currency
                d = gear.find(g["name"])
                qty = max(1, int(g.get("qty") or 1))
                worn = bool(re.search(r"(?i)\bworn\b|^ring of|^amulet|^cloak of|^boots of|^bracers", g["name"]))
                if d:
                    items.append(copy("equipment", d, actor_id, f"g-{i}", quantity=qty, **({"equipped": True} if worn else {})))
                else:
                    items.append(plain_item(actor_id, f"g-{i}", g["name"][:1].upper() + g["name"][1:], quantity=qty,
                                            slots=float(g.get("slots", 1)) / qty if qty > 1 else g.get("slots", 1)))

            # Spells: cantrips and prepared ones ready, the rest in the book.
            sp = c.get("spells") or {}
            seen = set()
            known_ready = not (sp.get("prepared") or [])  # a caster with no "prepared" list casts what it knows
            for group, prepared in (("cantrips", True), ("prepared", True), ("known", known_ready)):
                for n in sp.get(group, []) or []:
                    n = re.sub(r"\s*\((?:\d\w\w|book|ritual|cantrip)[^)]*\)|\*", "", n).strip()
                    if not n or n.lower() in seen:
                        continue
                    seen.add(n.lower())
                    d = spells.find(n)
                    if not d and any(norm(i["name"]) == norm(n) for i in items if i["type"] == "ability"):
                        continue  # a class feature (Eldritch Blast), already on the sheet
                    if d:
                        items.append(copy("spells", d, actor_id, f"sp-{n}", prepared=prepared, className=c["class"]))
                    else:
                        # Class-only spells (the Witch's hexes) aren't separate items yet: a note on the sheet instead.
                        miss("spell", n)
                        items.append(plain_item(actor_id, f"sp-{n}", f"{n} ({base_cls} spell)", "ability",
                                                f"<p>A {html.escape(base_cls)} spell; its full text is in the {html.escape(base_cls)} class entry.</p>", kind="other"))

            # Biography: the printed sheet's own words.
            head = f"<p><em>{html.escape(c['adventure'])}" + (f" · {html.escape(c['folder'])}" if c.get("folder") else "") + \
                   f" · Seat {c['seat']}, {html.escape(c.get('role', ''))}</em></p>"
            bio = head + para(c.get("personality"))
            if c.get("hook"):
                bio += f"<p><strong>Tonight:</strong> {html.escape(c['hook'])}</p>"
            if c.get("inAFight"):
                bio += f"<h3>In a fight</h3>{para(c['inAFight'])}"
            story = f"<h3>Abilities (from the printed sheet)</h3>{ability_html(c)}"
            if sp.get("notes"):
                story += f"<h3>Casting</h3>{para(sp['notes'])}"
            if c.get("acBreakdown"):
                story += f"<p><strong>Armour Class on the sheet:</strong> {html.escape(c['acBreakdown'])}</p>"

            # The sheet's scores already include feat bonuses (Toughness +1 Con): once a feat's effect is approved and
            # adds the point itself, take it off the base so the total still matches the printed sheet.
            a = dict(c["attributes"])
            for it in items:
                if it["type"] != "feat":
                    continue
                for r in it["system"].get("rules", []) or []:
                    m = re.match(r"ability\.(str|dex|con|int|wis|cha)$", str(r.get("key", "")))
                    if m and not r.get("when") and re.fullmatch(r"-?\d+", str(r.get("value", "")).strip()):
                        a[m.group(1)] = int(a[m.group(1)]) - int(r["value"])
            # The same for HP: the printed maximum already counts Toughness (+1 per level) and Hag's Vigour (+class level),
            # and the sheet adds those rules to the stored maximum, so the stored one leaves them out.
            hp_max = int(c["hpMax"]) - hp_from_rules(items, int(c["level"]))
            size = (anc or {}).get("system", {}).get("size", "medium")
            img = cls_doc.get("img") or "icons/svg/mystery-man.svg"
            actor = {
                "_id": actor_id, "_key": f"!actors!{actor_id}", "name": c["name"], "type": "character", "img": img,
                "folder": fold[(c["adventure"], c.get("folder", ""))], "sort": c.get("seat", 0) * 100,
                "system": {
                    "abilities": {k: {"value": int(a[k])} for k in ("str", "dex", "con", "int", "wis", "cha")},
                    "luck": {"value": int(c.get("luck", 12)), "start": int(c.get("luck", 12)), "max": 20},
                    "attributes": {"hp": {"value": int(c["hpMax"]), "max": hp_max, "temp": 0},
                                   "speed": int(c.get("speed") or (anc or {}).get("system", {}).get("speed", 30))},
                    "currency": {k: int((c.get("coins") or {}).get(k, 0) or 0) for k in ("pp", "gp", "sp", "cp")},
                    "details": {"alignment": c.get("alignment", ""), "deity": c.get("classNote", "") if base_cls in ("Cleric", "Paladin") else "",
                                "size": size, "languages": ", ".join(c.get("languages", [])), "biography": bio, "backgroundStory": story},
                },
                "items": items, "effects": [],
                "prototypeToken": {"name": c["name"].split('"')[-1].strip() or c["name"], "actorLink": True, "disposition": 1,
                                   "texture": {"src": img}, "displayBars": 20, "bar1": {"attribute": "attributes.hp"},
                                   "sight": {"enabled": True, "range": 0, "visionMode": "basic"},
                                   "width": 0.5 if size == "tiny" else 2 if size == "large" else 1,
                                   "height": 0.5 if size == "tiny" else 2 if size == "large" else 1},
                "ownership": {"default": 0},
                "flags": {SYS: {"pregen": {"adventure": c["adventure"], "seat": c.get("seat"), "role": c.get("role", ""),
                                           "sheet": {"ac": c.get("ac"), "saves": c.get("saves"), "bth": c.get("bth"), "hp": c.get("hpMax")}}}},
            }
            write(PACK, actor)
            report["made"] += 1
    return report

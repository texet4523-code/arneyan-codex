"""The books' dice tables as Foundry RollTables in the "tables" pack.

Sources: Monsters & Treasure's Treasure chapter (/tmp/hb/mm/treasure.md), the Catalogue's Gems & Jewellery and
Magic Items pages, the Codex's Travelling Rules, Reaction Checks and Firearms pages (packs-src/rules), and the
dice tables written into spells and items (packs-src/spells, packs-src/equipment). Results that name a compendium
item link to it; a result that says "roll on" another table links to that table, so a draw rolls it too.
"""
import glob, html, json, os, re
import lib, icons

PACK = "tables"
SRC_TREASURE = "/tmp/hb/mm/treasure.md"
DASH = "–"


# ---------------------------------------------------------------- sources

def _load(pack):
    out = {}
    for f in glob.glob(os.path.join(lib.OUT, pack, "*.json")):
        d = json.load(open(f))
        if d.get("_key", "").startswith(("!items!", "!journal!")):
            out[d["name"]] = d
    return out


def _plain(h):
    h = re.sub(r"</(p|h\d|li|tr)>", "\n", h)
    h = re.sub(r"<t[dh][^>]*>", " | ", h)
    return html.unescape(re.sub(r"<[^>]+>", "", h))


def _rows(text):
    """Table rows of a page's plain text as lists of cells."""
    out = []
    for line in text.splitlines():
        if "|" not in line:
            continue
        cells = [c.strip() for c in line.split("|")]
        while cells and not cells[0]:
            cells.pop(0)
        if cells:
            out.append(cells)
    return out


def _rules_page(rules, name):
    for j in rules.values():
        for p in j.get("pages", []):
            if p["name"] == name:
                return _plain(p["text"]["content"])
    raise AssertionError(f"rules page not found: {name}")


def _md_table(md, heading):
    """Rows of the first markdown table after a heading (header row dropped)."""
    i = md.index(heading)
    rows = []
    for line in md[i:].splitlines()[1:]:
        if line.startswith("#") and rows:
            break
        if line.startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if set("".join(cells)) <= set("-: "):
                continue
            rows.append(cells)
        elif rows and line.strip():
            break
    return rows[1:]


def _span(s):
    s = s.replace("**", "").strip()
    m = re.match(rf"^(\d+)\s*[{DASH}-]\s*(\d+)$", s)
    if m:
        return int(m.group(1)), int(m.group(2))
    return int(s), int(s)


def _inline_list(text, die):
    """'Roll d4: 1 Javelin of Lightning, 2 Cloak ..., 18–20 the GM's choice' as [(lo, hi, text)]."""
    tail = text.split(f"Roll {die}:", 1)[1]
    tail = tail.rstrip(" .|")
    out = []
    for m in re.finditer(rf"(\d+)(?:\s*[{DASH}-]\s*(\d+))?\s+(.+?)(?=,\s*\d+(?:\s*[{DASH}-]\s*\d+)?\s|$)", tail):
        lo = int(m.group(1))
        hi = int(m.group(2) or lo)
        out.append((lo, hi, m.group(3).strip().rstrip(",")))
    return out


# ---------------------------------------------------------------- documents

class Tables:
    def __init__(self):
        self.items = _load("equipment")
        self.spells = _load("spells")
        self.ids = {}
        self.docs = []

    def uuid_item(self, name):
        d = self.items.get(name)
        return f"Compendium.arneyan.equipment.Item.{d['_id']}" if d else None

    def uuid_spell(self, name):
        d = self.spells.get(name)
        return f"Compendium.arneyan.spells.Item.{d['_id']}" if d else None

    def table_id(self, name):
        return lib.fid(PACK, "table", name)

    def uuid_table(self, name):
        return f"Compendium.arneyan.{PACK}.RollTable.{self.table_id(name)}"

    def link_items(self, text, names=None, spells=False):
        """Put @UUID links on every compendium item (or spell) named in a result's text."""
        pool = self.spells if spells else self.items
        names = names or sorted(pool, key=len, reverse=True)
        out = html.escape(text, quote=False)
        kind = "spells" if spells else "equipment"
        for n in names:
            if n not in pool or len(n) < 4:
                continue
            pat = re.compile(rf"(?<![\w])({re.escape(html.escape(n, quote=False))})(?![\w])")
            # Only outside the links already made ("Light" inside "Cure Light Wounds" stays put).
            pieces = re.split(r"(@UUID\[[^\]]+\]\{[^}]*\})", out)
            for k in range(0, len(pieces), 2):
                if pat.search(pieces[k]):
                    pieces[k] = pat.sub(lambda m: f"@UUID[Compendium.arneyan.{kind}.Item.{pool[n]['_id']}]{{{m.group(1)}}}", pieces[k], count=1)
                    break
            out = "".join(pieces)
        return out

    def table(self, name, formula, results, folder, img, description="", sort=0):
        tid = self.table_id(name)
        rs = []
        for i, r in enumerate(results):
            lo, hi = r["range"]
            rid = lib.fid(PACK, "result", name, str(i))
            doc = {"_id": rid, "_key": f"!tables.results!{tid}.{rid}", "type": r.get("type", "text"),
                   "name": _nodash(r.get("name", "")), "description": _nodash(r.get("description", "")), "img": r.get("img") or img,
                   "weight": max(1, hi - lo + 1), "range": [lo, hi], "drawn": False, "flags": {}}
            if r.get("uuid"):
                doc["type"] = "document"
                doc["documentUuid"] = r["uuid"]
            rs.append(doc)
        doc = {"_id": tid, "_key": f"!tables!{tid}", "name": name, "img": img, "description": description,
               "results": rs, "formula": formula, "replacement": True, "displayRoll": True,
               "folder": folder, "sort": sort, "ownership": {"default": 0}, "flags": {}}
        lib.write(PACK, doc)
        self.docs.append(doc)
        return doc

    def text(self, lo, hi, label, description=None, uuid=None, img=None):
        r = {"range": (lo, hi), "name": label, "description": description if description is not None else html.escape(label, quote=False)}
        if uuid:
            r["uuid"] = uuid
        if img:
            r["img"] = img
        return r


def _nodash(t):
    """Player-facing text has no em dashes: the books' asides become a colon."""
    return re.sub(r"\s*\u2014\s*", ": ", t)


def _check_ranges(doc, top):
    seen = []
    for r in doc["results"]:
        seen.extend(range(r["range"][0], r["range"][1] + 1))
    assert sorted(seen) == list(range(doc["results"][0]["range"][0], top + 1)), f"{doc['name']}: ranges {sorted(seen)}"


# ---------------------------------------------------------------- the tables

def build():
    T = Tables()
    rules = _load("rules")
    md = open(SRC_TREASURE, encoding="utf8").read()

    img_gem = icons.icon("treasure", "gems")
    img_art = icons.icon("treasure", "jeweled-chalice")
    img_trade = icons.icon("treasure", "wooden-crate")
    img_magic = icons.icon("treasure", "magic-swirl")
    img_road = icons.icon("treasure", "compass")
    img_talk = icons.icon("treasure", "conversation")
    img_gun = icons.icon("treasure", "pistol-gun")
    img_wand = icons.icon("treasure", "fairy-wand")
    img_d20 = icons.icon("treasure", "dice-twenty-faces-twenty")
    # Used by the hazard actor and the environmental timers (module/hazards.mjs).
    icons.icon("hazard", "box-trap")
    icons.icon("hazard", "hazard-sign")

    f_tre = lib.folder(PACK, "Treasure", "RollTable", sort=100000, color="#2a1414")
    f_gems = lib.folder(PACK, "Gems & Art", "RollTable", parent=f_tre, sort=100000)
    f_magic = lib.folder(PACK, "Magic Items", "RollTable", sort=200000, color="#22163a")
    f_road = lib.folder(PACK, "Travel & Encounters", "RollTable", sort=300000, color="#1A3320")
    f_spell = lib.folder(PACK, "Spells & Items", "RollTable", sort=400000, color="#13263a")
    f_combat = lib.folder(PACK, "Combat", "RollTable", sort=500000, color="#3a1f17")

    # -- Gems: stones by tier (the Catalogue), then the three grades (M&T).
    cat_gems = _rules_page(rules, "Gems & Jewellery — Value Tiers")
    tiers = {}
    for cells in _rows(cat_gems):
        m = re.match(r"([A-Z][\w-]+)(?: \[\w+\])?$", cells[0])
        v = re.match(r"([\d,]+) gp$", cells[1]) if len(cells) > 2 else None
        if m and v:
            tiers[m.group(1)] = (int(v.group(1).replace(",", "")), [x.strip() for x in cells[2].split(",") if x.strip()])
    assert list(tiers) == ["Ornamental", "Semi-Precious", "Fancy", "Precious", "Gem", "Jewel"], tiers.keys()
    for i, (tier, (value, stones)) in enumerate(tiers.items()):
        T.table(f"{tier} Stones ({value:,} gp)", f"1d{len(stones)}",
                [T.text(n + 1, n + 1, s, img=img_gem) for n, s in enumerate(stones)], f_gems, img_gem,
                f"<p>The Catalogue's example stones for the {tier} tier ({value:,} gp each). The GM may choose instead; cut and quality can move a stone up or down a band.</p>",
                sort=200000 + i * 1000)
    rows = _md_table(md, "## Gems and Art")
    for gi, grade in enumerate(["Lesser", "Fine", "Superb"]):
        res = []
        for r in rows:
            lo, hi = _span(r[0])
            cell = r[1 + gi]
            m = re.match(r"(.+?) \(([\d,]+) gp\)", cell)
            tier = m.group(1)
            stones = next(n for n in tiers if n == tier)
            res.append(T.text(lo, hi, cell, f"{html.escape(cell, quote=False)}: @UUID[{T.uuid_table(f'{stones} Stones ({tiers[stones][0]:,} gp)')}]{{choose or draw a stone}}"))
        T.table(f"{grade} Gems", "1d6", res, f_gems, img_gem,
                f"<p>Roll a d6 for each {grade} gem a hoard gives. Up to 5 gems of one tier fit in 1 slot.</p>", sort=100000 + gi * 1000)

    # -- Art objects: the book's examples (value rolled as it says).
    art = re.search(r"Minor art is worth 1d6 × 50 gp: (.+?)\. Major art is worth 2d6 × 250 gp: (.+?)\. ", md)
    for i, (grade, formula, slots, items) in enumerate([("Minor", "1d6 × 50 gp", 1, art.group(1)), ("Major", "2d6 × 250 gp", 2, art.group(2))]):
        ex = [re.sub(r"^an? ", "", x.strip()) for x in items.split(",") if x.strip()]
        ex = [x[0].upper() + x[1:] for x in ex]
        T.table(f"{grade} Art Objects", f"1d{len(ex)}", [T.text(n + 1, n + 1, e, img=img_art) for n, e in enumerate(ex)], f_gems, img_art,
                f"<p>{grade} art is worth {formula} and takes {slots} slot{'s' if slots > 1 else ''}. It sells to a patron or a dealer; a fence pays half. These are the book's examples.</p>",
                sort=300000 + i * 1000)

    # -- Trade goods (d8).
    res = []
    for r in _md_table(md, "## Trade Goods"):
        lo, hi = _span(r[0])
        res.append(T.text(lo, hi, f"{r[1]} ({r[2]})", img=img_trade))
    T.table("Trade Goods", "1d8", res, f_tre, img_trade,
            "<p>Some hoards hold goods in bulk instead of coin. Each lot takes 2 slots and sells for its full value to a merchant who deals in it; a shopkeeper elsewhere pays half.</p>", sort=200000)

    # -- Magic items from a hoard, with their iconic sub-tables.
    enchanted = {"weapon": "A weapon", "armour": "Armour", "shield": "A shield"}
    subs = {}
    for rarity, die in [("Uncommon", "d4"), ("Rare", "d20"), ("Very Rare", "d12")]:
        rows = _md_table(md, f"### {rarity} Items (d10)")
        last = rows[-1][1]
        if f"Roll {die}:" in last:
            entries = _inline_list(last, die)
            top = int(die[1:])
            res = []
            for lo, hi, txt in entries:
                base = re.sub(r",? or a Unique.*$", "", txt).strip()
                uuid = T.uuid_item(base)
                if uuid and base == txt:
                    res.append(T.text(lo, hi, base, "", uuid=uuid))
                else:
                    res.append(T.text(lo, hi, txt[0].upper() + txt[1:], T.link_items(txt[0].upper() + txt[1:])))
            name = f"Iconic {rarity} Items"
            doc = T.table(name, f"1{die}", res, f_magic, img_magic, f"<p>Iconic {rarity} items from a hoard (Monsters &amp; Treasure).</p>", sort=400000 + len(subs) * 1000)
            _check_ranges(doc, top)
            subs[rarity] = name
    for i, rarity in enumerate(["Uncommon", "Rare", "Very Rare"]):
        res = []
        for r in _md_table(md, f"### {rarity} Items (d10)"):
            lo, hi = _span(r[0])
            txt = r[1]
            if "Iconic" in txt and rarity in subs:
                lead = txt.split(". Roll")[0]
                res.append(T.text(lo, hi, lead, "", uuid=T.uuid_table(subs[rarity]), img=img_magic))
                continue
            single = T.uuid_item(re.sub(r",? or .*$", "", txt).strip())
            if single and re.sub(r",? or .*$", "", txt).strip() == txt:
                res.append(T.text(lo, hi, txt, "", uuid=single))
            else:
                res.append(T.text(lo, hi, txt, T.link_items(txt), img=img_magic))
        doc = T.table(f"{rarity} Magic Items", "1d10", res, f_magic, img_magic,
                      f"<p>Where a hoard gives an {rarity} item, roll here or choose one. A hoard's items should not all be useless to the party.</p>", sort=100000 + i * 1000)
        _check_ranges(doc, 10)

    # -- Uniques: power and quirk (the Catalogue's Magic Items page).
    mi = _rules_page(rules, "Magic Items")
    for i, what in enumerate(["Power", "Quirk"]):
        block = mi.split(f"| d12 | {what}", 1)[1]
        res = []
        for cells in _rows(block):
            if not cells[0].isdigit() or len(cells) < 2:
                continue
            n = int(cells[0])
            if res and n <= res[-1]["range"][0]:
                break
            res.append(T.text(n, n, cells[1].split(":")[0].strip(), html.escape(cells[1], quote=False)))
        assert len(res) == 12, (what, len(res))
        T.table(f"Unique Item {what}", "1d12", res, f_magic, img_magic, f"<p>Make a Unique quickly: one signature {what.lower()}.</p>", sort=500000 + i * 1000)

    # -- Travel: the encounter check, and reaction checks.
    tr = _rules_page(rules, "Travelling Rules")
    res = []
    for cells in _rows(tr.split("Random Encounter Rules", 1)[1]):
        if not re.match(r"^\d+(-\d+)?$", cells[0]):
            continue
        lo, hi = _span(cells[0].replace("-", DASH))
        res.append(T.text(lo, hi, cells[1].rstrip(".") + "."))
    doc = T.table("Encounter Check", "1d12", res, f_road, img_road,
                  "<p>At the start of each new segment of dangerous travel (daily travel or a dungeon phase), roll a d12 for each day travelled. Resting in hostile territory: an 11 or 12 is a Standard Encounter, never Dangerous.</p>")
    _check_ranges(doc, 12)
    rc = _rules_page(rules, "Reaction Checks")
    res = []
    for cells in _rows(rc):
        m = re.match(r"^(\d+)(?: or less|-(\d+)|\+)?$", cells[0])
        if not m or len(cells) < 2:
            continue
        lo = int(m.group(1))
        hi = int(m.group(2) or lo)
        if "or less" in cells[0]:
            lo = 2
        txt = cells[1]
        res.append(T.text(lo, hi, txt.split(" — ")[0].split(" - ")[0], html.escape(txt.replace(" — ", ": "), quote=False)))
    doc = T.table("Reaction Check", "2d6", res, f_road, img_talk,
                  "<p>2d6 plus the Charisma modifier of whoever leads the talk (the Background Story Bonus can apply). This table rolls plain 2d6: add the modifier yourself and read the row.</p>")
    _check_ranges(doc, 12)

    # -- Combat: a firearm's catastrophic misfire.
    fa = _rules_page(rules, "Firearms")
    m = re.search(r"roll a d6: (.+?)\n", fa)
    res = []
    for part in re.finditer(r"(\d)(?:-(\d))? (.+?)(?:;|$)", m.group(1)):
        lo = int(part.group(1)); hi = int(part.group(2) or lo)
        txt = part.group(3).strip().rstrip(".")
        res.append(T.text(lo, hi, txt[0].upper() + txt[1:] + "."))
    doc = T.table("Firearm Catastrophe", "1d6", res, f_combat, img_gun,
                  "<p>A natural 1 on a firearm attack (except Silent Mechanism weapons): roll a d6.</p>")
    _check_ranges(doc, 6)

    # -- Spells and items that roll on a table of their own.
    def from_text(name, src, die, top, folder, img, intro, spells_link=False):
        desc = _plain(src["system"]["description"])
        m = re.search(rf"roll {die}[^:]*:\s*(.+?)\.(?:\s|$)", desc.replace("\n", " "), re.I)
        assert m, f"no {die} table in {name}"
        body = m.group(1)
        res = []
        for part in re.finditer(rf"(\d+)(?:\s*[{DASH}-]\s*(\d+))?\s+(.+?)(?=[;,]\s*\d+(?:\s*[{DASH}-]\s*\d+)?\s|$)", body):
            lo = int(part.group(1)); hi = int(part.group(2) or lo)
            txt = part.group(3).strip().rstrip(";,.").strip("'")
            txt = txt[0].upper() + txt[1:]
            res.append(T.text(lo, hi, txt, T.link_items(txt, spells=True) if spells_link else html.escape(txt, quote=False)))
        link = f"@UUID[Compendium.arneyan.{'equipment' if src.get('type') != 'spell' else 'spells'}.Item.{src['_id']}]{{{name}}}"
        doc = T.table(name, die if die[0].isdigit() else f"1{die}", res, folder, img, f"<p>{intro} ({link}).</p>")
        _check_ranges(doc, top)

    from_text("Wand of Wonder", T.items["Wand of Wonder"], "d10", 10, f_spell, img_wand, "What the wand does when aimed", spells_link=True)
    from_text("Efreeti Bottle", T.items["Efreeti Bottle"], "d20", 20, f_spell, img_magic, "What comes out when the bottle is unstopped")
    from_text("Confusion", T.spells["Confusion"], "1d10", 10, f_spell, img_d20, "At the start of each affected creature's turn")
    from_text("Prismatic Spray", T.spells["Prismatic Spray"], "d8", 8, f_spell, img_d20, "Roll for each creature in the cone")
    from_text("Contact Other Plane", T.spells["Contact Other Plane"], "1d20", 20, f_spell, img_d20, "Roll for each question")

    links = sum(1 for d in T.docs for r in d["results"] if r["type"] == "document" or "@UUID" in r["description"])
    return f"{len(T.docs)} tables, {links} results linked"

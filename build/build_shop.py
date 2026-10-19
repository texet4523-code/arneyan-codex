"""The Shopkeeper's Catalogue: weapons, armour, gear and magic items, plus the Book V journal."""
import re
from lib import *

BLUDGEON = re.compile(r"club|hammer|mace|maul|flail|staff|sap|knuckle|cestus|fist|sling|morning|bolas|blowpipe|cudgel|baton|warhammer|mallet|quarterstaff|lucerne|horseman's pick", re.I)
PIERCE = re.compile(r"spear|dagger|dirk|knife|pick|bow|crossbow|dart|javelin|harpoon|rapier|trident|lance|pike|katar|stiletto|aclis|estoc|awl|fork|ranseur|spetum|partisan|military fork|gun|pistol|rifle|musket|carbine|cannon|blunderbuss|derringer|net", re.I)

def dmg_type(name):
    if BLUDGEON.search(name):
        return "bludgeoning"
    if PIERCE.search(name):
        return "piercing"
    return "slashing"

def num(s, default=0.0):
    m = re.search(r"(\d+(?:\.\d+)?)", s or "")
    return float(m.group(1)) if m else default

def clean_name(n):
    n = plain(n).replace("†", "")
    n = re.sub(r"\s*\[(Uncommon|Rare|Very Rare|Legendary|Unique)\]", "", n)
    return re.sub(r"\s+", " ", n).strip()

def rarity(n):
    m = re.search(r"\[(Uncommon|Rare|Very Rare|Legendary|Unique)\]", n)
    return m.group(1) if m else ""

def weapon_damage(d):
    d = d.strip()
    if d in ("—", "-", "", "No damage"):
        return ""
    if d.startswith("+"):
        return "1d2" + d.split()[0]
    m = re.match(r"(\d+d\d+(?:\+\d+)?|\d+)", d)
    if not m:
        return ""
    base = m.group(1)
    if re.search(r"exp", d) and "non-exp" not in d:
        base = re.sub(r"(\d+d\d+)", r"\1x", base, count=1)
    return base

def build(icon):
    md = open("/tmp/hb/shop2.md").read()
    lines = md.split("\n")
    sec2 = sec3 = ""
    folders = {}

    def fol(name, parent=None):
        name = (name or "").strip()
        if not name:
            return parent
        key = (name, parent)
        if key not in folders:
            folders[key] = folder("equipment", name, parent=parent, sort=len(folders))
        return folders[key]

    root_weapons = fol("Weapons")
    root_armour = fol("Armour & Shields")
    root_gear = fol("Gear & Supplies")
    root_magic = fol("Alchemy & Magic Items")
    n = 0
    i = 0
    last_group = ""
    while i < len(lines):
        ln = lines[i]
        if ln.startswith("## "):
            sec2 = plain(ln[3:]); sec3 = ""
        elif ln.startswith("### "):
            sec3 = plain(ln[4:])
        elif re.match(r"^•\s*\*\*", ln):
            # "•  **Name:** text (price)**— Slots: N**", sometimes with the whole line in bold.
            raw = re.sub(r"^•\s*", "", ln).replace("**", "").strip()
            m = re.match(r"^([^:]{1,80}):\s*(.*)$", raw)
            if m and clean_name(m.group(1)):
                name = clean_name(m.group(1))
                rest = m.group(2)
                sm = re.search(r"\s*—\s*Slots:\s*(.*)$", rest)
                slots_txt = sm.group(1).strip() if sm else "1"
                rest = rest[:sm.start()].strip() if sm else rest.strip()
                if name.startswith("- ") and last_group:
                    name = f"{last_group}: {name[2:].strip()}"
                elif "(" in name and re.search(r"\(.*&.*\)", name):
                    last_group = re.sub(r"\s*\(.*\)", "", name).strip()
                price_m = re.findall(r"\(([^()]*?\d[\d,]*\s*(?:gp|sp|cp|pp)[^()]*)\)", rest)
                price = price_m[0] if len(price_m) == 1 else ""
                if not price:
                    pm = re.fullmatch(r"[^;()]*?\b(\d[\d,]*\s*(?:gp|sp|cp|pp)\b[^;()]*)", rest)
                    price = pm.group(1).strip() if pm and len(rest) < 60 else ""
                parent = fol(re.sub(r"^\d+\.\s*", "", sec2), root_gear)
                f = fol(sec3, parent) if sec3 else parent
                desc = f"<p>{md_inline(rest)}</p><p class=\"arn-note\"><strong>Slots:</strong> {esc(slots_txt)}</p>"
                item("equipment", name, "equipment", {
                    "description": desc, "source": {"book": "phb", "page": 0},
                    "quantity": 1, "slots": num(slots_txt, 0) if "N/A" not in slots_txt else 0,
                    "price": price, "equipped": False
                }, icon("gear", name + " " + sec2), folder=f, sort=n)
                n += 1
        elif ln.startswith("|") and (i == 0 or not lines[i - 1].startswith("|")):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            head = rows[0]
            body = rows[1:]
            if head[0] == "Armour":
                for r in body:
                    nm = clean_name(r[0])
                    item("equipment", nm, "armour", {
                        "description": f"<p><strong>{esc(r[1])} armour.</strong> {esc(r[5]) if r[5] != '—' else ''}</p>" + (f"<p>Rarity: {rarity(r[0])}</p>" if rarity(r[0]) else ""),
                        "source": {"book": "phb", "page": 0}, "quantity": 1, "slots": num(r[4], 1),
                        "price": r[2], "equipped": False, "category": r[1].lower() if r[1].lower() in ("light", "medium", "heavy") else "light",
                        "ac": int(num(r[3], 0)), "magic": 0, "traits": r[5] if r[5] != "—" else ""
                    }, icon("armour", nm + " " + r[1]), folder=root_armour, sort=n); n += 1
                continue
            if head[0] == "Shield":
                for r in body:
                    nm = clean_name(r[0])
                    item("equipment", nm, "armour", {
                        "description": f"<p>{esc(r[4])}</p>", "source": {"book": "phb", "page": 0},
                        "quantity": 1, "slots": num(r[3], 0) if "N/A" not in r[3] else 0, "price": r[1], "equipped": False,
                        "category": "shield", "ac": int(num(r[2], 1)), "magic": 0, "traits": r[4]
                    }, icon("shield", nm), folder=root_armour, sort=n); n += 1
                continue
            if head[0] == "Weapon":
                missile = sec2.startswith("Missile")
                firearm = "Reload" in head
                sub = fol("Firearms" if firearm else "Missile Weapons" if missile else "Melee Weapons", root_weapons)
                for r in body:
                    nm = clean_name(r[0])
                    cols = dict(zip(head, r))
                    traits = cols.get("Traits") or cols.get("Traits & Notes") or ""
                    traits = "" if traits == "—" else traits
                    rng = cols.get("Range", "")
                    rng = "" if rng == "—" else rng
                    extra = []
                    if firearm:
                        extra.append(f"Reload {cols.get('Reload','')}, misfire on {cols.get('Misfire','')}.")
                        if "x" in cols.get("Damage", "") and "targets" in cols.get("Damage", ""):
                            extra.append(cols["Damage"])
                    ranged = missile or firearm
                    ability = "dex" if ranged else ("finesse" if "Finesse" in traits else "str")
                    item("equipment", nm, "weapon", {
                        "description": f"<p>{esc(traits)}</p>" + "".join(f"<p>{esc(e)}</p>" for e in extra) + (f"<p>Rarity: {rarity(r[0])}</p>" if rarity(r[0]) else ""),
                        "source": {"book": "phb", "page": 0}, "quantity": 1,
                        "slots": num(cols.get("Slots", "1"), 1), "price": cols.get("Cost", ""), "equipped": False,
                        "damage": weapon_damage(cols.get("Damage", "")), "damageType": dmg_type(nm),
                        "ability": ability, "ranged": ranged, "range": rng, "magic": 0, "attackBonus": 0, "traits": traits
                    }, icon("weapon", nm), folder=sub, sort=n); n += 1
                continue
            if head[:2] == ["Item", "Cost"] or head[:2] == ["Item", "Use"]:
                parent = root_magic if sec2 in ("Alchemist's & Healer's Goods", "Magic Items", "Rare Spell Components") else root_gear
                f = fol(sec3 or sec2, parent)
                for r in body:
                    cols = dict(zip(head, r))
                    nm = clean_name(r[0])
                    eff = cols.get("Effect") or cols.get("Use") or ""
                    price = cols.get("Cost") or cols.get("Price") or ""
                    item("equipment", nm, "equipment", {
                        "description": f"<p>{md_inline(eff)}</p>" + (f"<p>Rarity: {rarity(r[0])}</p>" if rarity(r[0]) else ""),
                        "source": {"book": "phb", "page": 0}, "quantity": 1,
                        "slots": num(cols.get("Slots", "1"), 1) if "N/A" not in cols.get("Slots", "") else 0,
                        "price": price, "equipped": False
                    }, icon("magic" if parent == root_magic else "gear", nm + " " + (sec3 or sec2)), folder=f, sort=n); n += 1
                continue
            continue
        i += 1

    # Journal: the whole Catalogue, one page per section.
    pages = [(re.sub(r"^\d+\.\s*", "", plain(t)), md_to_html(b)) for t, b in md_sections(md, 2)]
    intro = md.split("\n## ")[0]
    pages.insert(0, ("About the Catalogue", md_to_html(re.sub(r"^# .*\n", "", intro))))
    journal("rules", "Book V: The Shopkeeper's Catalogue", [p for p in pages if p[1].strip()], sort=5)

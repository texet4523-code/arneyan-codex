"""Tidy the Catalogue compendium (runs last on packs-src/equipment).

- Rules text the Catalogue prints as bullet lists ("How Magic Items Work", the scroll "Rules", "Availability",
  "Costly components", "Selling") came through as items. They're already in Book V of the rules journal, so the
  stray items go.
- The example unique, Linkbreaker, came through as three items (one per bullet): it becomes one bardiche.
- Torches is one torch.
- Folders: eight clear top-level groups instead of the Catalogue's shop-by-shop order, and the duplicate
  "Spellbooks & Scrolls" folders merged.
"""
import glob, json, os, re
from lib import OUT, fid, write

PACK = os.path.join(OUT, "equipment")

RULE_FOLDERS = {"How Magic Items Work", "Currency & Inventory Notes"}
RULE_ITEMS = {("Spellbooks & Scrolls", "Rules"), ("Spellbooks & Scrolls", "Availability"), ("Spellbooks & Scrolls", "Costly components")}
UNIQUE_FOLDER = "Example Unique: Linkbreaker [Unique]"

# New top-level folder -> the Catalogue folders that go straight under it (their own subfolders come along).
TOP = [
    ("Weapons", "#5a2a1a", ["Melee Weapons", "Missile Weapons", "Firearms"]),
    ("Armour & Shields", "#2a3a4a", []),
    ("Magic Items", "#3a1f5a", ["Iconic Weapons", "Iconic Armour & Shields", "Iconic Rings", "Iconic Wands, Staffs & Rods",
                                "Iconic Wondrous Items", "Magic Containers", "Spellbooks & Scrolls", "Potions", "Unique Items"]),
    ("Alchemy & Poisons", "#2a4a2a", ["Alchemical Weapons & Tools", "Alchemist's & Healer's Goods", "Poisons", "Weapon Oils", "Rare Brews"]),
    ("Spell Components", "#4a3a1a", ["Rare Spell Components", "Spell Components — Animals", "Spell Components — Liquids",
                                     "Spell Components — Metals", "Spell Components — Minerals", "Spell Components — Plants & Aromatics",
                                     "Ritual Incenses (bundles of 12 sticks / 12 oz)"]),
    ("Adventuring Gear", "#1A3320", ["Containers & Storage", "Rope & Binding", "Illuminations", "Clothing", "Personal Supplies",
                                     "Writing & Documentation", "Camp Cookware", "Ranger's Field Equipment", "Wilderness Gear",
                                     "General Adventuring Basics"]),
    ("Food & Drink", "#4a2a2a", ["The Larder", "Breads", "Cheese Shop", "Exotics", "Wines and Ales"]),
    ("Tools & Trades", "#3a3a3a", ["Wizards' Laboratory", "Thieves' Corner", "Bards' Emporium", "Priests' Alcove", "Labourers' List", "Diversions", "Priest in a Poke"]),
]


def load():
    files = {}
    for f in glob.glob(os.path.join(PACK, "*.json")):
        files[f] = json.load(open(f))
    return files


def build():
    files = load()
    folders = {d["_id"]: d for d in files.values() if d["_key"].startswith("!folders!")}
    name_of = lambda fid_: folders.get(fid_, {}).get("name", "")
    path_of = {}
    for f, d in files.items():
        path_of[d["_id"]] = f
    removed = 0

    # 1. Rules text that came through as items.
    for f, d in list(files.items()):
        if d["_key"].startswith("!folders!"):
            continue
        fn = name_of(d.get("folder"))
        if fn in RULE_FOLDERS or (fn, d["name"]) in RULE_ITEMS:
            os.remove(f); files.pop(f); removed += 1

    # 2. Linkbreaker: one bardiche (Catalogue: 2d4, Reach, Cleaving, 2 slots; +2 and counts as magic).
    parts = [(f, d) for f, d in files.items() if not d["_key"].startswith("!folders!") and name_of(d.get("folder")) == UNIQUE_FOLDER]
    base = next((d for d in files.values() if d.get("name") == "Bardiche" and d.get("type") == "weapon"), None)
    if parts and base:
        desc = "<p><em>A bardiche: a war-axe on a long haft, plain and heavily nicked. Carried through the war of independence by a veteran of the Watchers. Some say its head was forged from the iron of mine shackles struck off freed miners.</em></p>"
        for f, d in parts:
            desc += f"<p><strong>{d['name']}:</strong> {re.sub(r'</?p>', '', d['system'].get('description', ''))}</p>"
            os.remove(f); files.pop(f)
        _id = fid("equipment", "item", "Linkbreaker")
        doc = json.loads(json.dumps(base))
        doc.update({"_id": _id, "_key": f"!items!{_id}", "name": "Linkbreaker", "sort": 0})
        doc["system"].update({"description": desc, "magic": 2, "price": "Unique (never for sale)", "traits": "Reach, Cleaving", "slots": 2})
        doc["folder"] = None  # set below
        files["__linkbreaker__"] = doc

    # 3. A torch.
    for f, d in files.items():
        if d.get("name") == "Torches" and d.get("type") == "equipment":
            d["name"] = "Torch"

    # 4. Folders.
    by_name = {}
    for d in folders.values():
        by_name.setdefault(d["name"], []).append(d)
    tops = {}
    for i, (name, color, _) in enumerate(TOP):
        tops[name] = fid("equipment", "folder", "tidy-top", name)
    # Merge the duplicate Spellbooks & Scrolls folders into one.
    keep_spellbooks = None
    for d in by_name.get("Spellbooks & Scrolls", []):
        if keep_spellbooks is None:
            keep_spellbooks = d
            continue
        for x in files.values():
            if x.get("folder") == d["_id"]:
                x["folder"] = keep_spellbooks["_id"]
        os.remove(path_of[d["_id"]]); folders.pop(d["_id"])
    # The unique gets a folder of its own (the old "Example Unique" folder, renamed).
    uniq = by_name.get(UNIQUE_FOLDER, [None])[0]
    if uniq:
        uniq["name"] = "Unique Items"
        if "__linkbreaker__" in files:
            files["__linkbreaker__"]["folder"] = uniq["_id"]
    # Re-parent.
    placed = set()
    for name, color, children in TOP:
        top_id = tops[name]
        existing = [d for d in folders.values() if d["name"] == name and not d.get("folder")]
        if existing:  # reuse a Catalogue folder with the same name at the top level (Armour & Shields, Weapons)
            top_id = existing[0]["_id"]
            tops[name] = top_id
            existing[0].update({"color": color, "sort": TOP.index((name, color, children)) * 1000})
            placed.add(top_id)
        else:
            write("equipment", {"_id": top_id, "_key": f"!folders!{top_id}", "name": name, "type": "Item", "folder": None,
                                "sorting": "a", "sort": TOP.index((name, color, children)) * 1000, "color": color, "flags": {}, "description": ""})
        for child in children:
            for d in folders.values():
                if d["name"] == child:
                    d["folder"] = top_id
                    placed.add(d["_id"])
    # The Handbook's toolkits (build_gear, which runs before this folder exists) go in Tools & Trades.
    from build_gear import TOOLKITS
    toolkit_names = {n for n, _, _ in TOOLKITS}
    for d in files.values():
        if not d["_key"].startswith("!folders!") and d.get("name") in toolkit_names and not d.get("folder"):
            d["folder"] = tops["Tools & Trades"]
    # Folders with nothing left in them (the old shop-level groups, "How Magic Items Work") go.
    while True:
        items_in = {x.get("folder") for x in files.values() if not x["_key"].startswith("!folders!")}
        parents = {d.get("folder") for d in folders.values()}
        empty = [d for d in folders.values() if d["_id"] not in items_in and d["_id"] not in parents]
        if not empty:
            break
        for d in empty:
            if d["_id"] in path_of and os.path.exists(path_of[d["_id"]]):
                os.remove(path_of[d["_id"]])
            folders.pop(d["_id"])
    # Write everything back.
    for f, d in files.items():
        if f == "__linkbreaker__":
            write("equipment", d)
        elif os.path.exists(f) and not d["_key"].startswith("!folders!"):
            json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)
    for d in folders.values():
        if d["_id"] in path_of:
            json.dump(d, open(path_of[d["_id"]], "w"), ensure_ascii=False, indent=1)
    # Anything still at the top level that isn't one of the eight groups is reported.
    stray = [d["name"] for d in folders.values() if not d.get("folder") and d["_id"] not in tops.values()]
    return removed, stray

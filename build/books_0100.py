"""The books v0.10.0 (20 October 2026): what the book chat wrote in from the Foundry rulings, mirrored back.

The builders read the older book sources in /tmp/hb; this step brings the compendium up to the v0.10.0 wording and
numbers where they changed. Each change names the book's new text.
"""
import glob, json, os, re
import lib

OUT = lib.OUT


def _each(pack, folders=False):
    for f in glob.glob(os.path.join(OUT, pack, "*.json")):
        d = json.load(open(f))
        if folders or "system" in d:
            yield f, d


def _save(f, d):
    json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)


def _desc(d, old, new):
    """Swap a phrase in a description (text only, inside the HTML)."""
    s = d["system"].get("description", "")
    if old in s:
        d["system"]["description"] = s.replace(old, new)
        return True
    return False


# Warlock is on these Path spells (PHB v0.10.0, Book IV).
WARLOCK_SPELLS = {"Burning Hands", "Scorching Ray", "Fireball", "Bind Elemental", "Darkness", "Faerie Fire", "Entangle", "Hypnotism"}
# Mounts with Hit Dice (Catalogue and M&T v0.10.0): typical HP from the dice.
MOUNTS = {"Warhorse, Light": ("2d10+4", 15), "Warpony": ("2d8+2", 11)}


# Text that changed wherever it appears (a class's own description repeats its features, and kits theirs).
TEXT = [
    # Twin Nock: each arrow gets Bow Mastery; the per-arrow table is gone, and Never Still says so too.
    (re.compile(r"Each arrow deals \+1 bonus damage\."), "Each arrow gets your Bow Mastery bonus."),
    (re.compile(r"<li>Per-arrow bonus by level:[^<]*?use the higher\.</li>"), ""),
    (re.compile(r"each still carrying the current per-arrow bonus"), "each still carrying your Bow Mastery bonus"),
    # Catalogue, Magic Items: the light-shedding swords say how far.
    (re.compile(r"\+1d6 fire damage on a hit and light 20ft\."), "+1d6 fire damage on a hit, and it sheds bright light in a 20ft radius."),
    (re.compile(r"against undead, and light 15ft\."), "against undead, and it sheds bright light in a 20ft radius."),
]


def _retext(v):
    """Every string inside a document with the TEXT changes made; returns (new value, changes)."""
    if isinstance(v, str):
        n = 0
        for rx, new in TEXT:
            v, k = rx.subn(new, v)
            n += k
        return v, n
    if isinstance(v, list):
        out, n = [], 0
        for x in v:
            x, k = _retext(x); out.append(x); n += k
        return out, n
    if isinstance(v, dict):
        out, n = {}, 0
        for key, x in v.items():
            x, k = _retext(x); out[key] = x; n += k
        return out, n
    return v, 0


def build():
    n = {"kits": 0, "features": 0, "spells": 0, "monsters": 0, "prices": 0, "actions": 0, "text": 0}
    for pack in ("classes", "class-features", "kits", "equipment"):
        for f, d in _each(pack):
            d2, k = _retext(d)
            if k:
                _save(f, d2); n["text"] += k
    # Kit names lose their dashes: "Gladiator, The Pit-Forged (Fighter)".
    for f, d in _each("kits"):
        if " — " in d.get("name", ""):
            d["name"] = d["name"].replace(" — ", ", ")
            _save(f, d); n["kits"] += 1
    for f, d in _each("class-features"):
        name, cls = d.get("name"), d["system"].get("className", "")
        ch = False
        if name == "Aura of Devotion":
            ch |= _desc(d, "Allies within your Aura of Courage range", "You and allies within your Aura of Courage range")
        if name == "Holy Campaign":
            ch |= _desc(d, "Raise 1–100 NPCs", "Once per year, or once per campaign at the GM's call, raise 1–100 NPCs")
        if name == "Combat Dominance":
            ch |= _desc(d, "of Level up to half yours, you can make extra attacks,", "of Level up to half your character Level, you can make extra attacks (your Fighter level sets how many),")
            ch |= _desc(d, "against creatures of Level up to half your level", "against creatures of Level up to half your character Level")
        if ch:
            _save(f, d); n["features"] += 1
    # Kit features: the Cleric's Umberlee wave is a Fortitude save.
    for f, d in _each("kits"):
        ch = False
        for feat in d["system"].get("features", []):
            s = feat.get("description", "")
            if "30ft wave: creatures in a line must save" in s:
                feat["description"] = s.replace("must save", "make a Fortitude save")
                if not feat.get("save"):
                    feat["save"] = "fort"
                ch = True
        if ch:
            _save(f, d); n["kits"] += 1
    for f, d in _each("spells"):
        name = d.get("name")
        ch = False
        if name in WARLOCK_SPELLS:
            cls = d["system"].setdefault("classes", [])
            if "Warlock" not in cls:
                cls.append("Warlock"); ch = True
                d["system"]["description"] = re.sub(r"(Classes:</strong>\s*)([^<]+)", lambda m: m.group(1) + m.group(2).rstrip() + ", Warlock", d["system"].get("description", ""), count=1)
        if name == "Delay Poison":
            ch |= _desc(d, "death from poison is deferred. When it ends, poison resumes.", "death from poison is deferred. Poison taken during the spell is held back too. When it ends, all of it resumes.")
        if ch:
            _save(f, d); n["spells"] += 1
    for f, d in _each("monsters"):
        if d.get("name") in MOUNTS:
            hd, hp = MOUNTS[d["name"]]
            d["system"]["hd"] = hd
            d["system"]["attributes"]["hp"].update({"value": hp, "max": hp})
            _save(f, d); n["monsters"] += 1
    # Spell-component prices given as a range say what the range is.
    folder = {d.get("_id"): d.get("name", "") for f, d in _each("equipment", folders=True) if "system" not in d}
    for f, d in _each("equipment"):
        p = str(d["system"].get("price", ""))
        if re.search(r"\d\s*(cp|sp|gp|pp)\s*(-|\u2013|to)\s*\d", p) and "quality" not in p and folder.get(d.get("folder"), "").startswith("Spell Components"):
            d["system"]["price"] = f"{p} (by quality)"
            _save(f, d); n["prices"] += 1
    # Attacks of Opportunity come only from Combat Reflexes or a monster ability (PHB v0.10.0, Book I).
    # Reactions are only for features that say so (Book I, Reactions). The action's text is the book's, whole.
    text = ("<p>Only a creature with a feature that grants one (Combat Reflexes, or a monster ability that says so) makes "
            "Attacks of Opportunity; the feature says what provokes it, and Disengaging always prevents it. Being moved by "
            "someone else (a shove, a push, a throw) or teleporting never provokes one, unless the ability causing it says so.</p>"
            "<p><strong>Reactions.</strong> Only a feature that says it is a reaction (a class, kit or feat feature, or a monster "
            "ability) can be used out of turn: once per round unless it says otherwise, regained at the start of your turn. "
            "Anything that stops reactions (Surprised, Incapacitated) stops these. A feature that gives extra reactions says so, "
            "and those extras can only be used for that feature (the Swashbuckler's Second Flourish).</p>")
    for f, d in _each("actions"):
        if d.get("name") == "Attack of Opportunity":
            old = d["system"].get("description", "")
            note = re.search(r'<p class="arn-note">.*?</p>', old)
            new = text + (note.group(0) if note else "")
            if new != old:
                d["system"]["description"] = new
                _save(f, d); n["actions"] += 1
    return n

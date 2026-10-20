"""Class-only spells: the Witch's and Necromancer's "Class-Only Spells" lists and the Warlock's Eldritch Blast and
Path spells that aren't on the master list. They live only in the class text (cls/clean2/<Class>.docx), so they
become spell items here, one folder per class in the Spells compendium. Same fields as build_spells.py; damage
from spell_damage.py, and areas are read later by build_areas.py like every other spell.

Spells already in the compendium (by name) are never made again."""
import glob, json, os, re
import docx
from lib import *
import spell_damage

SRC = "/tmp/hb/cls/clean2"
LEVEL_WORD = {"Cantrip": 0, "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6, "7th": 7, "8th": 8, "9th": 9}
ICON = {"Witch": "enchantment", "Necromancer": "necromancy", "Warlock": "evocation"}
FOLDER_SORT = {"Necromancer": 10, "Warlock": 11, "Witch": 12}

# Eldritch Blast: 1d6 at 1st, 1d8 at 5th, 2d6 at 9th, 2d8 at 13th, 3d6 at 17th, 3d8 at 24th (Warlock, Class Abilities).
# Dice count N = 1 + floor((L-1)/8); the die is a d8 when floor((min(L,20)-1)/4) is odd, or at 24th. A d6 term and a
# d8 term, one of them always 0 dice (the roll card drops "0d8").
_L = "min(@cl, 24)"
_N = f"(1 + floor(({_L} - 1) / 8))"
_U = "floor((min(@cl, 20) - 1) / 4)"
_D8 = f"({_U} - 2 * floor({_U} / 2) + floor({_L} / 24))"
ELDRITCH_BLAST = f"({_N} * (1 - {_D8}))d6 + ({_N} * {_D8})d8"

# Wording spell_damage.py doesn't read: Slay Living's "1d6/level" (no maximum stated, so none applied).
DAMAGE = {"Slay Living": ("(@cl)d6", "necrotic")}


def save_of(text):
    """(save, on a save) from "Will negates", "Fortitude halves", "(Fortitude save for half)", "Reflex negates"."""
    m = re.search(r"\b(Will|Reflex|Fortitude)\b(?: save)?\s*(?:for\s+)?(negates|halves|half|to resist)?", text)
    if not m:
        return "", ""
    save = {"Will": "will", "Reflex": "ref", "Fortitude": "fort"}[m.group(1)]
    eff = {"negates": "Negates", "halves": "Half", "half": "Half", "to resist": "Negates"}.get(m.group(2) or "", "")
    return save, eff


def class_only(name):
    """[(spell name, level, text)] from a class's "Class-Only Spells" section."""
    d = docx.Document(os.path.join(SRC, f"{name}.docx"))
    out, on = [], False
    for kind, obj, info in walk_docx(d):
        if kind != "p":
            continue
        t = info["text"]
        if info["style"].startswith("Heading"):
            on = t.strip() == "Class-Only Spells"
            continue
        if not on:
            continue
        m = re.match(r"^(.+?)\s*\((Cantrip|\d(?:st|nd|rd|th))\)\s*[—–-]\s*(.+)$", t)
        if m:
            out.append((m.group(1).strip(), LEVEL_WORD[m.group(2)], m.group(3).strip()))
    return out


def warlock_path_spells():
    """Path spells (Warlock, Patron Paths) missing from the master list: (name, slot level, text, path)."""
    d = docx.Document(os.path.join(SRC, "Warlock.docx"))
    out, path = [], ""
    for kind, obj, info in walk_docx(d):
        if kind == "p":
            if info["style"] == "Heading 1" and info["text"].startswith("Path of"):
                path = info["text"].strip()
            continue
        rows = obj
        if rows and rows[0][:3] == ["Unlocks", "Slot Level", "Spell"]:
            for r in rows[1:]:
                m = re.match(r"^(.+?)\s+[—–]\s+(.+)$", r[2])
                lv = re.match(r"(\d)", r[1])
                if m and lv:
                    out.append((m.group(1).strip(), int(lv.group(1)), m.group(2).strip(), path))
    return out


def existing():
    names = {}
    for f in glob.glob(os.path.join(OUT, "spells", "*.json")):
        d = json.load(open(f))
        if d.get("type") == "spell":
            names[d["name"].lower()] = (f, d)
    return names


def build(icon):
    have = existing()
    # name -> {level, text, classes, folder class, path note}
    spells = {}
    for cls in ("Witch", "Necromancer"):
        for name, lvl, text in class_only(cls):
            s = spells.setdefault(name, {"level": lvl, "text": text, "classes": [], "home": cls, "notes": []})
            s["classes"].append(cls)
    # Eldritch Blast (Warlock, 1st level): an at-will cantrip in the book's words.
    spells["Eldritch Blast"] = {
        "level": 0, "home": "Warlock", "classes": ["Warlock"], "notes": [],
        "text": "Range 60ft; one creature. At-will ranged cantrip. The target makes a Reflex save, taking force damage on a "
                "failure or half on a success. No slot required. Damage scales: 1d6 at 1st, 1d8 at 5th, 2d6 at 9th, 2d8 at "
                "13th, 3d6 at 17th, 3d8 at 24th.",
        "damage": ELDRITCH_BLAST, "damageType": "force", "save": ("ref", "Half")}
    for name, lvl, text, path in warlock_path_spells():
        bare = re.sub(r"\s*\(.*?\)", "", name).strip()  # "Cause Fear (the reverse of Remove Fear)"
        if bare in spells:
            spells[bare]["classes"].append("Warlock")
            spells[bare]["notes"].append(f"Warlock {path} Path spell ({ordinal(lvl)}-level slot).")
            continue
        if bare.lower() in have:
            continue
        text = text[:1].upper() + text[1:]
        spells[bare] = {"level": lvl, "text": text, "classes": ["Warlock"], "home": "Warlock",
                        "notes": [f"Warlock {path} Path spell ({ordinal(lvl)}-level slot)."]}

    folders = {}
    made, skipped = [], []
    for i, (name, s) in enumerate(sorted(spells.items(), key=lambda kv: (kv[1]["level"], kv[0]))):
        if name.lower() in have:
            skipped.append(name)
            continue
        home = s["home"]
        if home not in folders:
            folders[home] = folder("spells", home, sort=FOLDER_SORT.get(home, 20))
        text = fix(s["text"])
        rng = re.match(r"^(Range [^;.]+|Touch|Self|Personal)", text)
        dmg, dtype = (s["damage"], s["damageType"]) if "damage" in s else DAMAGE.get(name) or spell_damage.parse(text)
        save, eff = s.get("save") or save_of(text)
        classes = s["classes"]
        desc = f"<p>{esc(text)}</p>"
        desc += "".join(f'<p class="arn-note">{esc(n)}</p>' for n in s["notes"])
        desc += f'<p class="arn-note"><strong>Classes:</strong> {esc(", ".join(classes))} (class-only spell, from the class entry)</p>'
        material = re.search(r"\bMaterial:\s*([^.]+)", text)
        item("spells", name, "spell", {
            "description": desc, "source": {"book": "phb", "page": 0},
            "level": s["level"], "className": classes[0] if len(classes) == 1 else "",
            "classes": classes, "school": "",
            "castingTime": "1 action", "range": rng.group(1) if rng else "",
            "duration": "", "area": "", "components": "M" if material else "",
            "concentration": bool(re.search(r"\bconcentration\b", text, re.I)), "ritual": False, "prepared": False,
            "save": save, "saveEffect": eff, "damage": dmg, "damageType": dtype,
            "reversible": False, "costly": bool(material and re.search(r"\bgp\b", material.group(1)))
        }, icon("spell", ICON.get(home, "")), folder=folders[home], sort=i, key=f"class-only|{name}")
        made.append(name)
    return made, skipped


def ordinal(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"

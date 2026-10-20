"""Classes and kits from cls/clean2/<Class>.docx."""
import glob, os, re
import docx
from lib import *

SRC = "/tmp/hb/cls/clean2"
ABIL = {"Strength": "str", "Dexterity": "dex", "Constitution": "con", "Intelligence": "int", "Wisdom": "wis", "Charisma": "cha"}
XP = {"Assassin": 8, "Rogue": 8, "Necromancer": 12, "Paladin": 12, "Witch": 12, "Wizard": 12}
CAST = {"Bard": "cha", "Cleric": "wis", "Druid": "wis", "Illusionist": "int", "Magus": "int", "Necromancer": "int",
        "Paladin": "cha", "Sorcerer": "cha", "Warlock": "cha", "Witch": "wis", "Wizard": "int"}

FEAT_LEVELS = {}
for cls in ["Fighter"]: FEAT_LEVELS[cls] = [1, 3, 6, 11, 15, 20]
for cls in ["Barbarian", "Bard", "Paladin", "Knight", "Monk", "Artificer", "Magus"]: FEAT_LEVELS[cls] = [1, 2, 6, 12, 16, 21]
for cls in ["Cleric", "Druid", "Illusionist", "Wizard", "Sorcerer", "Warlock", "Witch", "Necromancer"]: FEAT_LEVELS[cls] = [1, 4, 8, 12, 16, 20]
for cls in ["Assassin", "Rogue", "Ranger", "Archer", "Gunslinger", "Swashbuckler"]: FEAT_LEVELS[cls] = [1, 2, 6, 11, 16, 21]
M, S, A = "Martial Path", "Specialist Path", "Arcane & Devout Path"
FEAT_PATHS = {"Fighter": [M], "Barbarian": [M], "Knight": [M],
              "Bard": [M, A], "Paladin": [M, A], "Magus": [M, A], "Artificer": [S, A],
              "Ranger": [M, S], "Archer": [M, S], "Rogue": [M, S], "Assassin": [M, S], "Monk": [M, S], "Gunslinger": [M, S], "Swashbuckler": [M, S]}
for cls in ["Cleric", "Druid", "Illusionist", "Wizard", "Sorcerer", "Warlock", "Witch", "Necromancer"]: FEAT_PATHS[cls] = [A]
LEVEL_RE = re.compile(r"^(\d+)(?:st|nd|rd|th) Level(?:\s*[—-]\s*(.+))?$|^Level (\d+)$")

def uses_of(text):
    t = text.lower()
    for pat, per in ((r"once per encounter|1/encounter|once an encounter", "encounter"), (r"once per day|once a day|1/day|once/day", "day"),
                     (r"once per long rest|1/long rest", "rest"), (r"once per week|once a week", "week"),
                     (r"once per session|once a session", "session"), (r"once per month|once a month", "month")):
        if re.search(pat, t):
            return {"value": 1, "max": 1, "per": per}
    m = re.search(r"(\d+) times? per day", t)
    if m:
        return {"value": int(m.group(1)), "max": int(m.group(1)), "per": "day"}
    return {"value": 0, "max": 0, "per": ""}

def save_of(text):
    """The save a feature calls for. Not a bonus to the owner's own saves ("+1 to Fortitude and Reflex saves",
    "Advantage on Reflex saves"), the owner's own save ("When you succeed on a Reflex save"), or a change to another
    feature's save ("the first Will save against it", "Fortitude save DC is 2 higher")."""
    for m in re.finditer(r"\b(Fortitude|Reflex|Will) save(?!s)", text):
        before = text[max(0, m.start() - 24):m.start()]
        if re.search(r"(succeed on|advantage on|first) (an? |the )?$", before, re.I) or text[m.end():m.end() + 7] == " DC is ":
            continue
        return {"Fortitude": "fort", "Reflex": "ref", "Will": "will"}[m.group(1)]
    return ""


# Damage the feature text states, as a formula (Kieran, 20 Oct 2026). Eldritch Blast: 1d6 at 1st, 1d8 at 5th, 2d6 at
# 9th, 2d8 at 13th, 3d6 at 17th, 3d8 at 24th (the same progression as the class-only spell, build_class_spells.py).
def feature_damage(cls, name):
    if (cls, name) == ("Warlock", "Eldritch Blast"):
        from build_class_spells import ELDRITCH_BLAST
        return ELDRITCH_BLAST, "force"
    return "", ""

def ordinal(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"

class Feature:
    def __init__(self, name, level):
        self.name, self.level, self.buf, self.text = name, level, HtmlBuf(), ""
    def add(self, html, text, li=None):
        self.text += " " + text
        if li is None:
            self.buf.add(f"<p>{html}</p>")
        else:
            self.buf.li(html, li)

def label_of(p):
    """Bold lead-in label of a paragraph, e.g. 'Effect' or 'Weapon Specialisation'."""
    runs = [r for r in p.runs if r.text.strip()]
    if not runs or not runs[0].bold:
        return None, None
    lead = ""
    for r in p.runs:
        if r.bold or not r.text.strip():
            lead += r.text
        else:
            break
    m = re.match(r"^\s*([^:]{1,60}?)\s*:\s*$", lead) or re.match(r"^\s*([^:]{1,60}?):", p.text)
    if not m:
        return None, None
    rest = p.text.strip()[len(m.group(0).strip()):].strip() if p.text.strip().startswith(m.group(0).strip()) else p.text.split(":", 1)[1].strip()
    return m.group(1).strip(), rest

def bth_prog(t):
    t = t.lower()
    if "+2 per 3" in t: return "martial"
    if "+1 per 3" in t: return "divine"
    if "one behind" in t: return "knight"
    if "per 4" in t: return "rogue"
    return "arcane"

def slot_table(rows):
    """Spells Per Day table -> 24 rows of 10 ints (cantrips, 1st..9th)."""
    head = rows[0]
    out = [[0] * 10 for _ in range(24)]
    for r in rows[1:]:
        m = re.match(r"(\d+)", r[0])
        if not m:
            continue
        lvl = int(m.group(1))
        if not 1 <= lvl <= 24:
            continue
        for ci, h in enumerate(head[1:], start=1):
            hm = re.match(r"(\d)", h)
            if not hm or ci >= len(r):
                continue
            col = int(hm.group(1))
            v = re.match(r"(\d+)", r[ci])
            out[lvl - 1][col] = int(v.group(1)) if v else 0
    return out

def build(icon_for_class):
    for path in sorted(glob.glob(os.path.join(SRC, "*.docx"))):
        name = os.path.splitext(os.path.basename(path))[0]
        d = docx.Document(path)
        chassis = None
        slots = None
        tables_seen = 0
        desc = HtmlBuf()
        kits = []       # (name, HtmlBuf, [features])
        cur_kit = None
        first = True
        section = ""
        feats = []
        cur_feat = None
        cur_level = 1
        for kind, obj, info in walk_docx(d):
            if kind == "table":
                rows = obj
                tables_seen += 1
                if tables_seen == 1 and rows[0][0] == "Trait":
                    chassis = rows
                    continue
                if rows[0] == ["Level", "BtH"]:
                    continue
                if rows[0][0] == "Lvl" and len(rows[0]) > 2 and rows[0][1] == "0" and slots is None:
                    slots = slot_table(rows)
                if rows[0][0] == "Deity":
                    for r in rows[1:]:
                        if len(r) >= 3 and r[0]:
                            kb = HtmlBuf()
                            kb.add(f"<p><strong>Favoured weapon:</strong> {esc(r[1])}</p><p><strong>Granted power:</strong> {esc(fix(r[2]))}</p>")
                            kits.append((f"Deity: {r[0]}", kb, [{"name": f"Granted Power ({r[0].split('(')[0].strip()})", "level": 1,
                                                                   "description": f"<p>{esc(fix(r[2]))}</p><p><strong>Favoured weapon:</strong> {esc(r[1])}</p>"}]))
                target = cur_kit[1] if cur_kit else desc
                target.add(table_html(rows))
                continue
            p, t = obj, info["text"]
            if first:
                first = False
                continue
            if t == "Arneyan Campaign Setting":
                continue
            style = info["style"]
            if style.startswith("Heading"):
                cur_kit = None
                if style == "Heading 1":
                    section = t
                if t in ("Core Chassis", "BtH Progression"):
                    continue
                lvl = 2 if style == "Heading 1" else 3
                desc.add(f"<h{lvl}>{esc(fix(t))}</h{lvl}>")
                if re.match(r"^(Kits|Bloodline Kits|Deities|Patron Paths|Patrons$)", t):
                    desc.add(f'<p class="arn-note">Each kit is an item in the <strong>Kits</strong> compendium, in the {esc(name)} folder. Drag one onto your character.</p>')
                continue
            if info["bold"] and re.match(r"^Kit\s+—", t):
                kname = re.sub(r"^Kit\s+—\s*", "", t).strip()
                cur_kit = (kname, HtmlBuf(), [])
                kits.append(cur_kit)
                continue
            # Kit features: bulleted "Name (6th): effect" lines.
            if cur_kit:
                lab, rest = label_of(p)
                if info["list"] and lab and info["lvl"] == 0:
                    lm = re.search(r"\((\d+)(?:st|nd|rd|th)\)", lab)
                    cur_kit[2].append({"name": re.sub(r"\s*\(\d+(?:st|nd|rd|th)\)", "", lab).strip(), "level": int(lm.group(1)) if lm else 1,
                                       "description": f"<p>{md_inline(rest)}</p>"})
                elif info["list"] and info["lvl"] == 0 and not lab and len(t) <= 40 and not t.endswith("."):
                    cur_kit[2].append({"name": t.strip(), "level": 1, "description": ""})
                elif info["list"] and cur_kit[2]:
                    cur_kit[2][-1]["description"] += f"<p>{runs_html(p)}</p>"
            # Class abilities, split into separate features by level.
            elif section == "Class Abilities":
                lm = LEVEL_RE.match(t) if info["bold"] else None
                if lm:
                    cur_level = int(lm.group(1) or lm.group(3))
                    cur_feat = None
                    if lm.group(2):
                        cur_feat = Feature(lm.group(2).strip(), cur_level); feats.append(cur_feat)
                elif info["bold"] and not info["list"] and len(t) < 90:
                    cur_feat = Feature(t.strip().rstrip(":"), cur_level); feats.append(cur_feat)
                else:
                    lab, rest = label_of(p)
                    inner = runs_html(p)
                    if lab and lab not in ("Effect", "Note", "Example") and (cur_feat is None or cur_feat.level != cur_level or (not info["list"] and lab != cur_feat.name)):
                        cur_feat = Feature(lab, cur_level); feats.append(cur_feat)
                        cur_feat.add(md_inline(rest), rest)
                    else:
                        if cur_feat is None or cur_feat.level != cur_level:
                            cur_feat = Feature(f"{ordinal(cur_level)}-Level Features", cur_level); feats.append(cur_feat)
                        cur_feat.add(inner, t, info["lvl"] if info["list"] else None)
            target = cur_kit[1] if cur_kit else desc
            inner = runs_html(p)
            if info["list"]:
                target.li(inner, info["lvl"])
            elif info["bold"] and re.match(r"^(\d+(st|nd|rd|th) Level|Level \d+)", t):
                target.add(f'<h3 class="arn-level">{esc(fix(t))}</h3>')
            elif info["bold"] and len(t) < 90:
                target.add(f"<h4>{esc(fix(t))}</h4>")
            else:
                target.add(f"<p>{inner}</p>")

        ch = {r[0]: r[1] for r in chassis[1:] if r and r[0]} if chassis else {}
        key = ch.get("Key Attribute", "Strength").split("/")[0].strip()
        hd = ch.get("Hit Die", "d8").strip()
        beyond = re.match(r"\+(\d+)", ch.get("HP beyond 10th", "+2"))
        weapons = "; ".join(f"{k}: {v}" if k not in ("Weapons",) else v for k, v in ch.items() if k in ("Weapons", "Firearms", "Crossbows", "Other Weapons"))
        top = table_html([["Trait", "Detail"]] + [[k, v] for k, v in ch.items() if k])
        system = {
            "description": top + desc.html(),
            "source": {"book": "phb", "page": 0},
            "levels": 1,
            "hitDie": hd if hd in ("d4", "d6", "d8", "d10", "d12") else "d8",
            "hpBeyond10": int(beyond.group(1)) if beyond else 2,
            "bthProgression": bth_prog(ch.get("BtH", "")),
            "keyAbility": ABIL.get(key, "str"),
            "castingAbility": CAST.get(name, ""),
            "xpRate": XP.get(name, 10),
            "weapons": weapons,
            "armour": ch.get("Armour", ""),
            "slotTable": slots or [],
            "featLevels": FEAT_LEVELS.get(name, [1, 4, 8, 12, 16, 20]),
            "featPaths": ["General Path"] + FEAT_PATHS.get(name, []),
            "features": []
        }
        ffol = folder("class-features", name)
        for i, f in enumerate(feats):
            body = f.buf.html()
            if not body.strip():
                continue
            fdoc = item("class-features", f.name, "ability", {
                "description": body, "source": {"book": "phb", "page": 0}, "kind": "class",
                "uses": uses_of(f.text), "save": save_of(f.text), "dc": None, "damage": feature_damage(name, f.name)[0],
                **({"damageType": feature_damage(name, f.name)[1]} if feature_damage(name, f.name)[1] else {}),
                "level": f.level, "className": name
            }, icon_for_class(name, f.name), folder=ffol, sort=i, key=f"{name}|{f.level}|{f.name}|{i}")
            system["features"].append({"level": f.level, "name": f.name, "uuid": f"Compendium.arneyan.class-features.Item.{fdoc['_id']}"})
        item("classes", name, "class", system, f"systems/arneyan/assets/classes/{name}.webp")
        if name == "Cleric":
            bp = dict(system)
            bp["bthProgression"] = "knight"
            bp["xpRate"] = 12
            # Spell slots run two rows behind the Cleric's.
            bp["slotTable"] = [[0] * 10, [0] * 10] + (slots or [])[:22] if slots else []
            bp["description"] = "<p><strong>Battle Priest</strong> is the Cleric option for war gods: Knight Base to Hit, Extra Attack at 7th, spell slots two rows behind the Cleric's, and 12 XP a level. Everything else is as the Cleric.</p>" + system["description"]
            item("classes", "Cleric (Battle Priest)", "class", bp, f"systems/arneyan/assets/classes/{name}.webp")

        fol = folder("kits", name)
        for i, (kname, kb, kfeats) in enumerate(kits):
            item("kits", f"{kname} ({name})", "kit",
                 {"description": kb.html(), "source": {"book": "phb", "page": 0}, "className": name, "features": kfeats},
                 icon_for_class(name, kname), folder=fol, sort=i)

"""Classes and kits from the Handbook's Book III, one Word file per class (books_md.CLASSES, v0.10.11)."""
import glob, json, os, re
import docx
from lib import *

import books_md
SRC = books_md.CLASSES
ABIL = {"Strength": "str", "Dexterity": "dex", "Constitution": "con", "Intelligence": "int", "Wisdom": "wis", "Charisma": "cha"}
XP = {}   # K121 (books v0.10.66): every class pays 10 XP a level
CAST = {"Bard": "cha", "Cleric": "wis", "Druid": "wis", "Illusionist": "int", "Spellblade": "int", "Necromancer": "int",
        "Paladin": "cha", "Sorcerer": "cha", "Warlock": "cha", "Witch": "wis", "Wizard": "int"}

# HB v0.10.86 (the class rebuild, K272ff): feats by class group (Character Creation, Feat Progression). Each class's
# Level by Level table must agree (checked in build()).
MAX_LEVEL = 20
FEAT_LEVELS = {}
for cls in ["Assassin", "Rogue", "Swashbuckler"]: FEAT_LEVELS[cls] = [1, 3, 6, 9, 12, 16, 20]
for cls in ["Archer", "Barbarian", "Fighter", "Gunslinger", "Knight", "Monk", "Ranger"]: FEAT_LEVELS[cls] = [1, 3, 6, 12, 16, 20]
for cls in ["Artificer", "Paladin", "Spellblade"]: FEAT_LEVELS[cls] = [1, 6, 12, 16, 20]
for cls in ["Bard", "Cleric", "Druid", "Illusionist", "Necromancer", "Sorcerer", "Warlock", "Witch", "Wizard"]: FEAT_LEVELS[cls] = [1, 6, 12, 20]
M, S, A = "Martial Path", "Specialist Path", "Arcane & Devout Path"
FEAT_PATHS = {"Fighter": [M], "Barbarian": [M], "Knight": [M],
              "Bard": [S, A], "Illusionist": [S, A], "Paladin": [M, A], "Spellblade": [M, A], "Artificer": [S, A],
              "Ranger": [M, S], "Archer": [M, S], "Rogue": [M, S], "Assassin": [M, S], "Monk": [M, S], "Gunslinger": [M, S], "Swashbuckler": [M, S]}
for cls in ["Cleric", "Druid", "Wizard", "Sorcerer", "Warlock", "Witch", "Necromancer"]: FEAT_PATHS[cls] = [A]
# Paragraphs that lost their list formatting in the class docx. A short bold line reads as a feature heading, so the
# Assassin's "GM rolls secretly" split Assassin's Skills in two (Handbook p. 55 prints it as a note under Disguise).
# (class, paragraph text) -> (list level, text to print in its place).
LIST_FIXES = {("Assassin", "GM rolls secretly"): (1, "GM rolls secretly.")}
# A class feature keeps the id it was released with (data/feature_ids.json, by class and name), so one that moves to
# another level (books v0.10.22, B7) is still the same compendium document for worlds that have it. A new feature's id
# comes from its class, level, name and place, as before.
_FEATURE_IDS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "feature_ids.json")
FEATURE_IDS = json.load(open(_FEATURE_IDS, encoding="utf-8"))["features"] if os.path.exists(_FEATURE_IDS) else {}
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
    feature's save ("the first Will save against it", "Fortitude save DC is 2 higher", "makes its Fortitude save with
    Disadvantage")."""
    for m in re.finditer(r"\b(Fortitude|Reflex|Will) save(?!s)", text):
        before = text[max(0, m.start() - 24):m.start()]
        # (HB v0.10.76: "your Will save and your spell DC", the Druid's form keeping its own numbers.)
        if (re.search(r"(succeed on|advantage on|first|your) (an? |the )?$", before, re.I) or text[m.end():m.end() + 7] == " DC is "
                or re.match(r"\s+with Disadvantage", text[m.end():], re.I)):
            continue
        return {"Fortitude": "fort", "Reflex": "ref", "Will": "will"}[m.group(1)]
    return ""


# Damage the feature text states, as a formula (Kieran, 20 Oct 2026). Eldritch Blast: 1d6 at 1st, 1d8 at 5th, 2d8 at
# 9th, 3d8 at 13th, 4d8 at 17th, 5d8 at 21st (books v0.10.41; the same progression as the class-only spell,
# build_class_spells.py).
def feature_damage(cls, name):
    if (cls, name) == ("Warlock", "Eldritch Blast"):
        from build_class_spells import ELDRITCH_BLAST
        return ELDRITCH_BLAST, "force"
    # Books v0.10.32 (K28): the Artificer's Spark Caster is a Reflex save against the Class Save DC, half on a success,
    # for Eldritch Blast's damage at the Artificer's level plus the Intelligence modifier.
    # Books v0.10.41: the Spark Caster states its own dice, the old Eldritch Blast progression (1d6 to 3d8 at 24th).
    if (cls, name) == ("Artificer", "Spark Caster"):
        from build_class_spells import SPARK_CASTER
        return f"{SPARK_CASTER} + @int.mod", "force"
    return "", ""

def ordinal(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"

class Feature:
    def __init__(self, name, level):
        self.name, self.level, self.buf, self.text = name, level, HtmlBuf(), ""
        self.bullet = False     # started by a bulleted bold name ("- **Fleet Shadow:** ..."), not a heading
        self.at = level         # the level whose lines it is taking now (again(): a later level's lines join it)
    def add(self, html, text, li=None):
        self.text += " " + text
        if li is None:
            self.buf.add(f"<p>{html}</p>")
        else:
            self.buf.li(html, li)

def again(feats, name, level):
    """A new feature, or (HB v0.10.86) the same-named one this class already has, when the book names it again at a
    later level (the Warlock's "Patron Favour: 2 uses a day" at 4th and 8th, the Illusionist's Shattered Glass printed
    twice): its later lines join the first, under a heading for their level, so there is one item and one pool."""
    for f in feats:
        if f.name == name and f.level < level:
            f.buf.add(f'<p class="arn-level-note"><strong>{ordinal(level)} level:</strong></p>')
            f.at = level
            return f
    f = Feature(name, level)
    feats.append(f)
    return f


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
    # A bold lead that ends with a colon is the whole name, colons and all ("Ki: Body of Iron:", books v0.10.38).
    m = re.match(r"^\s*(.{1,60}?)\s*:\s*$", lead) or re.match(r"^\s*([^:]{1,60}?):", p.text)
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
    """Spells Per Day table -> MAX_LEVEL rows of 10 ints (cantrips, 1st..9th)."""
    head = rows[0]
    out = [[0] * 10 for _ in range(MAX_LEVEL)]
    for r in rows[1:]:
        m = re.match(r"(\d+)", r[0])
        if not m:
            continue
        lvl = int(m.group(1))
        if not 1 <= lvl <= MAX_LEVEL:
            continue
        for ci, h in enumerate(head[1:], start=1):
            hm = re.match(r"(\d)", h)
            if not hm or ci >= len(r):
                continue
            col = int(hm.group(1))
            v = re.match(r"(\d+)", r[ci])
            out[lvl - 1][col] = int(v.group(1)) if v else 0
    return out

BULLET_FEATURES = {"Fighter"}
STANDALONE = re.compile(r"^(?:(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma|Attribute) Bonus|Renown: .+)$")


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
                if rows[0][:2] == ["Lvl", "You gain"]:
                    table_feats = [int(r[0]) for r in rows[1:] if r[0].isdigit() and re.search(r"\bfeat\b", r[1], re.I)]
                    assert table_feats == FEAT_LEVELS.get(name), f"{name}: feat levels {table_feats} in its table, {FEAT_LEVELS.get(name)} in the build"
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
            fixed = LIST_FIXES.get((name, t.strip()))
            if fixed:
                # A note inside the current feature and the description, not a heading of its own.
                lvl, text = fixed
                if cur_feat is not None:
                    cur_feat.add(esc(text), text, lvl)
                    # An empty placeholder keeps the place the stray heading had in the list, so the features after it
                    # keep their IDs (the key holds the position); an empty feature is never written.
                    if section == "Class Abilities":
                        feats.append(Feature("", cur_level))
                (cur_kit[1] if cur_kit else desc).li(esc(text), lvl)
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
                if re.match(r"^(Kits|Paths|Bloodline Kits|Deities|Patron Paths|Patrons$)", t):
                    desc.add(f'<p class="arn-note">Each kit is an item in the <strong>Kits</strong> compendium, in the {esc(name)} folder. Drag one onto your character.</p>')
                continue
            # "Kit — Gladiator — The Pit-Forged" (v0.9.9) or "Kit: Gladiator, The Pit-Forged" (v0.10.0). A Path
            # (books v0.10.56: the Knight's, the Ranger's and the Spellblade's Battle Caster) is a kit item named
            # "Path: Cavalier", with features at 1st, 5th and 10th.
            # The Warlock's Pacts (HB v0.10.86): "**Pact of the Chain (Summoner)**" under "# Pacts", each a kit item
            # ("Pact of the Chain (Warlock)") whose dated lines are its features, as a kit's are.
            if info["bold"] and section == "Pacts" and re.match(r"^Pact of the \w+", t):
                cur_kit = (re.match(r"^(Pact of the \w+)", t).group(1), HtmlBuf(), [])
                kits.append(cur_kit)
                continue
            if info["bold"] and re.match(r"^(Kit|Path)\s*(—|:)", t):
                kname = re.sub(r"^Kit\s*(—|:)\s*", "", t).strip()
                kname = re.sub(r"^Path\s*(—|:)\s*", "Path: ", kname)
                cur_kit = (kname, HtmlBuf(), [])
                kits.append(cur_kit)
                continue
            # Kit features: bulleted "Name (6th): effect" lines.
            if cur_kit:
                lab, rest = label_of(p)
                if info["list"] and lab and info["lvl"] == 0:
                    lm = re.search(r"\((\d+)(?:st|nd|rd|th)\b[^)]*\)", lab)
                    # A line the book sets all in bold ("**Sea Shanty: aboard a ship...**") leaves its text starting
                    # lower case once the name is taken off: capitalise it.
                    body = md_inline(rest)
                    body = re.sub(r"^((?:<[^>]+>)*)([a-z])", lambda m: m.group(1) + m.group(2).upper(), body)
                    # A line labelled only by its level ("- **9th:** Hex Brand works twice...", the Pacts) is the kit improving.
                    bare = re.fullmatch(r"(\d+)(?:st|nd|rd|th)", lab.strip())
                    if bare:
                        lab, lm = f"{'Pact' if cur_kit[0].startswith('Pact of') else 'Kit'} improves ({lab.strip()})", bare
                    cur_kit[2].append({"name": re.sub(r"\s*\(\d+(?:st|nd|rd|th)\b[^)]*\)", "", lab).strip(), "level": int(lm.group(1)) if lm else 1,
                                       "description": f"<p>{body}</p>"})
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
                    cur_feat = again(feats, t.strip().rstrip(":"), cur_level)
                elif t.startswith("All of the following abilities are gained"):
                    pass        # (HB v0.10.79: the Assassin's 1st-level preamble, no longer under a Class Skills heading)
                else:
                    lab, rest = label_of(p)
                    # HB v0.10.80: "Flourish Manoeuvres gains a new option, Acrobatic Escape:" is the option's own feature.
                    if lab and re.search(r"gains a new option, ", lab):
                        lab = re.sub(r"^.*gains a new option, ", "", lab)
                    inner = runs_html(p)
                    # The Fighter (books v0.10.57) writes each feature as a bulleted bold name ("- **Weapon Training:**"),
                    # several at one level: each is its own feature.
                    # HB v0.10.86 on, any class may do this at a level (the Rogue's 10th: Fleet Shadow, then Renown: Name);
                    # under a bold heading ("**Metamagic**"), bulleted names are parts of that feature.
                    # An attribute bonus or a Renown step is always a feature of its own, even as a bullet under a
                    # heading feature (the Wizard's 15th: Sculpt Spells, then Intelligence Bonus and Renown: Holding).
                    alone = bool(lab and STANDALONE.match(lab))
                    own = (name in BULLET_FEATURES or getattr(cur_feat, "bullet", False) or alone) and info["list"] and info["lvl"] == 0 and cur_feat is not None and lab != cur_feat.name
                    if lab and lab not in ("Effect", "Note", "Example") and (cur_feat is None or cur_feat.at != cur_level or own or (not info["list"] and lab != cur_feat.name)):
                        cur_feat = again(feats, lab, cur_level)
                        cur_feat.bullet = bool(info["list"] and info["lvl"] == 0)
                        cur_feat.add(md_inline(rest), rest)
                    else:
                        if cur_feat is None or cur_feat.at != cur_level:
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
        # HB v0.10.86 moved the Witch's Hag's Vigour into the chassis (Hit Die). It stays a feature at 1st, in the
        # chassis's words, so its Max HP rule (effects/approved.json) and the id worlds have keep working.
        if name == "Witch" and "Hag's Vigour" in ch.get("Hit Die", "") and not any(f.name == "Hag's Vigour" for f in feats):
            hv = Feature("Hag's Vigour", 1)
            body = re.sub(r"^.*?Hag's Vigour:\s*", "", ch["Hit Die"])
            hv.add(esc(body[0].upper() + body[1:]), body)
            feats.insert(0, hv)
        key = ch.get("Key Attribute", "Strength").split("/")[0].strip()
        # "d4 (Pact of the Chain or the Sculptor); d8 (Pact of the Blade)" and "d6, plus Hag's Vigour..." (HB v0.10.86):
        # the first die named is the class's own.
        hd_m = re.search(r"\bd(4|6|8|10|12)\b", ch.get("Hit Die", "d8"))
        hd = f"d{hd_m.group(1)}" if hd_m else "d8"
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
        seen = {}
        for i, f in enumerate(feats):
            body = f.buf.html()
            if not body.strip():
                continue
            n = seen[f.name] = seen.get(f.name, -1) + 1
            known = FEATURE_IDS.get(f"{name}|{f.name}", [])
            fdoc = item("class-features", f.name, "ability", {
                "description": body, "source": {"book": "phb", "page": 0}, "kind": "class",
                "uses": uses_of(f.text), "save": save_of(f.text), "dc": None, "damage": feature_damage(name, f.name)[0],
                **({"damageType": feature_damage(name, f.name)[1]} if feature_damage(name, f.name)[1] else {}),
                "level": f.level, "className": name
            }, icon_for_class(name, f.name), folder=ffol, sort=i, key=f"{name}|{f.level}|{f.name}|{i}",
               _id=known[n] if n < len(known) else None)
            system["features"].append({"level": f.level, "name": f.name, "uuid": f"Compendium.arneyan.class-features.Item.{fdoc['_id']}"})
        # The Magus is the Spellblade (books v0.10.55, R-B54): same class document, same id.
        item("classes", name, "class", system, f"systems/arneyan/assets/classes/{name}.webp", key="Magus" if name == "Spellblade" else None)
        if name == "Cleric":
            bp = dict(system)
            bp["bthProgression"] = "knight"
            # Spell slots run two rows behind the Cleric's.
            bp["slotTable"] = [[0] * 10, [0] * 10] + (slots or [])[:MAX_LEVEL - 2] if slots else []
            bp["description"] = "<p><strong>Battle Priest</strong> is the Cleric option for war gods: Knight Base to Hit, Extra Attack at 7th, and spell slots two rows behind the Cleric's. Everything else is as the Cleric.</p>" + system["description"]
            item("classes", "Cleric (Battle Priest)", "class", bp, f"systems/arneyan/assets/classes/{name}.webp")
        if name == "Druid":
            # HB v0.10.86: the Shapeshifter kit casts from the Spells Per Day row one below the Druid level (never lower
            # than the 1st-level row) and never gains slots above 7th.
            ss = dict(system)
            rows = slots or []
            ss["slotTable"] = [[*rows[max(0, lv - 1)][:8], 0, 0] for lv in range(len(rows))] if rows else []
            ss["description"] = ("<p><strong>Shapeshifter</strong> is the Druid who gives up some spells for the beast's skin: "
                                 "spell slots from the row one below your Druid level (never lower than the 1st-level row, never "
                                 "above 7th). Everything else is as the Druid. Take the Shapeshifter kit too.</p>") + system["description"]
            item("classes", "Druid (Shapeshifter)", "class", ss, f"systems/arneyan/assets/classes/{name}.webp")
        if name == "Warlock":
            # HB v0.10.86: the Pact of the Blade's frame changes the chassis (Hit Die d8, +2 HP beyond 10th, the Knight
            # track, martial weapons, medium armour and shields, slots from the row two below, never above 5th).
            pb = dict(system)
            pb["hitDie"] = "d8"
            pb["hpBeyond10"] = 2
            pb["bthProgression"] = "knight"
            pb["weapons"] = "Martial weapons"
            pb["armour"] = "Medium armour and shields"
            rows = slots or []
            pb["slotTable"] = [[*rows[max(0, lv - 2)][:6], 0, 0, 0, 0] for lv in range(len(rows))] if rows else []
            pb["description"] = ("<p><strong>Pact of the Blade</strong> is the Warlock's fighting Pact: Hit Die d8, the Knight Base to Hit "
                                 "track, martial weapons, medium armour and shields, Charisma for weapon attacks and damage, and spell "
                                 "slots from the row two below your Warlock level (never lower than the 1st-level row, never above 5th). "
                                 "Everything else is as the Warlock. Take the Pact of the Blade kit too.</p>") + system["description"]
            item("classes", "Warlock (Pact of the Blade)", "class", pb, f"systems/arneyan/assets/classes/{name}.webp")

        fol = folder("kits", name)
        for i, (kname, kb, kfeats) in enumerate(kits):
            item("kits", f"{kname} ({name})", "kit",
                 {"description": kb.html(), "source": {"book": "phb", "page": 0}, "className": name, "features": kfeats},
                 icon_for_class(name, kname), folder=fol, sort=i)

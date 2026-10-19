"""Monsters & Treasure: every stat block in /tmp/hb/mm/*.txt as an NPC actor in the "monsters" pack.

Stat block lines (the books' own DSL):
  = Name | Size type (subtype) | Level [solo]
  hd 3d6 · ac 15 · mv 30ft · mor 8 · tr R · no 2d6 · sv RW (good saves) or svx "Fort +x, Ref +y, Will +z"
  hp 135 (override) · atk ... · sp Name: text (repeated) · gm text
Saves: half HD (minimum 1), +2 for each good save letter. HP: the HD average unless hp overrides it.
Attacks become weapon items; special abilities become ability items whose text links saves, damage,
conditions and spells so the GM can click them.
"""
from senses_add import added_senses, dragon_blindsight, match_5e
import glob, html, json, math, os, re
from lib import actor, folder, OUT, fid
from icons import icon

SRC = "/tmp/hb/mm"
FILES = ["humanoids", "animals", "undead", "fiends_fey_elementals", "aberrations_monstrosities", "dragons_giants", "constructs_oozes_plants"]
DAMAGE = ["slashing", "piercing", "bludgeoning", "fire", "cold", "lightning", "thunder", "acid", "poison", "necrotic", "radiant", "psychic", "force"]
CONDITIONS = {"Blinded": "blinded", "Burning": "burning", "Charmed": "charmed", "Deafened": "deafened", "Dominated": "dominated",
              "Frightened": "frightened", "Incapacitated": "incapacitated", "Invisible": "invisible", "Paralysed": "paralysed",
              "Petrified": "petrified", "Poisoned": "poisoned", "Prone": "prone", "Restrained": "restrained", "Stunned": "stunned",
              "Unconscious": "unconscious", "Sickened": "poisoned"}
CONDITION_IMMUNE = {"charm": "charmed", "fear": "frightened", "frighten": "frightened", "unconscious": "unconscious", "paralyse": "paralysed", "paralysis": "paralysed", "poisoned": "poisoned",
                    "petrif": "petrified", "stun": "stunned", "blind": "blinded", "deafen": "deafened", "prone": "prone"}
SAVE = {"fortitude": "fort", "reflex": "ref", "will": "will"}
SIZE = {"tiny": ("tiny", 0.5), "small": ("small", 1), "medium": ("medium", 1), "large": ("large", 2), "huge": ("huge", 3), "gargantuan": ("gargantuan", 4)}

# Token art: game-icons.net glyphs by name keyword, then by creature type.
NAME_GLYPH = [
    (r"kobold", "lizardman"), (r"goblin|hobgoblin|bugbear", "goblin-head"), (r"orc|orog", "orc-head"), (r"troll", "troll"),
    (r"dragon|drake|wyrm", "dragon-head"), (r"wyvern", "wyvern"), (r"wolf|worg|jackal", "wolf-head"), (r"bear", "bear-head"),
    (r"spider", "spider-face"), (r"skeleton", "skeleton"), (r"zombie", "shambling-zombie"), (r"ghost|spectre|specter|wraith|banshee|haunt|shadow", "ghost"),
    (r"vampire", "vampire-dracula"), (r"mummy", "mummy-head"), (r"giant", "giant"), (r"ogre", "ogre"), (r"snake|serpent|naga|cobra|viper|python", "snake"),
    (r"rat\b|rats\b", "rat"), (r"bat\b|bats\b", "bat"), (r"horse|pony|warhorse|mule|nightmare", "horse-head"), (r"boar", "boar"),
    (r"lion|tiger|panther|leopard|cat\b|sabre", "lion"), (r"eagle|hawk|vulture|raven|owl|bird|roc\b", "eagle-head"),
    (r"shark", "shark-fin"), (r"octopus|squid|kraken", "octopus"), (r"crab", "crab"), (r"scorpion", "scorpion"), (r"beetle", "beetle-shell"),
    (r"wasp|bee\b|hornet", "wasp-sting"), (r"ant\b|ants\b", "ant"), (r"frog|toad", "frog"), (r"crocodile|alligator|lizard", "lizard-tongue"),
    (r"mimic", "mimic-chest"), (r"ooze|pudding|jelly|slime|cube", "slime"), (r"golem", "golem-head"), (r"treant|tree|blight|shambling", "vine-whip"),
    (r"myconid|shrieker|fung|violet", "mushroom-gills"), (r"imp\b|quasit", "imp"), (r"devil|demon|fiend|balor|pit|marilith|hezrou|vrock|glabrezu", "devil-mask"),
    (r"angel|deva|planetar|solar", "angel-wings"), (r"pixie|sprite|dryad|fairy|satyr|nymph", "fairy"), (r"unicorn", "unicorn"), (r"pegasus", "pegasus"),
    (r"griffon|griffin|hippogriff", "griffin-symbol"), (r"hydra", "hydra"), (r"medusa", "medusa-head"), (r"gargoyle", "gargoyle"),
    (r"minotaur", "minotaur"), (r"centaur", "centaur"), (r"harpy", "harpy"), (r"cyclops", "cyclops"), (r"werewolf|lycan|wererat|weretiger|werebear|wereboar", "werewolf"),
    (r"elephant|mammoth", "elephant-head"), (r"ape|gorilla", "gorilla"), (r"deer|elk|stag", "deer-head"), (r"bull|ox\b|bison|cattle", "bull-horns"),
    (r"goat|ram\b", "ram"), (r"hyena|gnoll", "hyena-head"), (r"badger", "badger"), (r"dinosaur|rex|allosaur|triceratops|pteranodon", "dinosaur-rex"),
    (r"salamander", "salamander"), (r"merfolk|merrow|mermaid|sahuagin", "mermaid"), (r"jellyfish", "jellyfish"), (r"worm|purple", "worm-mouth"),
    (r"centipede", "centipede"), (r"chimera|manticore|sphinx", "egyptian-sphinx"), (r"lich|necromancer|cultist|priest|acolyte|mage|wizard|warlock", "hooded-figure"),
    (r"bandit|thug|thief|assassin|spy", "bandit"), (r"pirate|sailor", "pirate-skull"), (r"knight|guard|soldier|veteran|gladiator|captain", "knight-banner"),
    (r"elemental|fire\b|flame", "fire-silhouette"), (r"water", "water-splash"), (r"air\b|wind|djinni", "tornado"), (r"earth|xorn|galeb", "rock-golem"),
    (r"eye|beholder|spectator", "all-seeing-eye"), (r"mind flayer|flayer|aboleth|brain", "brain-tentacle"), (r"hag", "witch-face"),
]
TYPE_GLYPH = {"beast": "paw", "humanoid": "person", "monstrosity": "tentacles-skull", "dragon": "dragon-head", "undead": "skeleton",
              "fiend": "devil-mask", "elemental": "fire-silhouette", "aberration": "all-seeing-eye", "plant": "vine-whip",
              "construct": "golem-head", "giant": "giant", "fey": "fairy", "celestial": "angel-wings", "ooze": "slime"}


def glyph_for(name, typ):
    n = name.lower()
    for pat, g in NAME_GLYPH:
        if re.search(pat, n):
            return g
    t = typ.lower()
    for k, g in TYPE_GLYPH.items():
        if k in t:
            return g
    return "monster-grasp"


def load(path):
    mons, cur, group = [], None, ""
    for ln in open(path, encoding="utf-8").read().split("\n"):
        ln = ln.rstrip()
        if not ln.strip() or ln.startswith("#"):
            continue
        if ln.startswith("== "):
            group = ln[3:].strip(); continue
        if ln.startswith("~ "):
            continue
        if ln.startswith("= "):
            name, typ, cl = [x.strip() for x in ln[2:].split("|")]
            cur = {"name": name, "type": typ, "cl": cl, "f": {}, "sp": [], "gm": "", "group": group}
            mons.append(cur); continue
        k, _, v = ln.partition(" ")
        if k == "sp":
            cur["sp"].append(v.strip())
        elif k == "gm":
            cur["gm"] = v.strip()
        else:
            cur["f"][k] = v.strip()
    return mons


def parse_hd(s):
    m = re.fullmatch(r"(½|\d+)d(\d+)([+-]\d+)?", s.strip())
    if not m:
        return None
    n = 0.5 if m.group(1) == "½" else int(m.group(1))
    d = int(m.group(2)); b = int(m.group(3) or 0)
    return n, max(1, math.floor(n * (d + 1) / 2) + b)


def named_type(name):
    """A damage type named in an attack or ability's name ("Acid Spray", "lightning bolt")."""
    m = re.search(r"\b(" + "|".join(DAMAGE) + r")\b", name.lower())
    return m.group(1) if m else ""


def damage_type_of(name):
    n = name.lower()
    if named_type(n):
        return named_type(n)
    if re.search(r"bite|tusk|horn|gore|sting|spear|arrow|bow|dagger|javelin|pike|pick|trident|fang|beak|spike|spine|quill|lance|rapier|bolt|stinger|needle|dart|jaws|mandible|fork|harpoon|hook|snake hair", n):
        return "piercing"
    if re.search(r"claw|talon|scimitar|sword|axe|scythe|blade|sickle|glaive|halberd|whip|rake", n):
        return "slashing"
    return "bludgeoning"


def split_top(s, seps=(", ", " or ")):
    """Split on separators that are not inside brackets."""
    out, depth, buf, i = [], 0, "", 0
    while i < len(s):
        c = s[i]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
        hit = next((sep for sep in seps if depth == 0 and s.startswith(sep, i)), None)
        if hit:
            out.append(buf.strip()); buf = ""; i += len(hit); continue
        buf += c; i += 1
    if buf.strip():
        out.append(buf.strip())
    return out


SPELLS = {}


SPELL_DOCS = {}


def load_spells():
    for f in glob.glob(os.path.join(OUT, "spells", "items_*.json")):
        d = json.load(open(f))
        SPELLS[d["name"].lower()] = d["_id"]
        SPELL_DOCS[d["name"].lower()] = d


def spell_items(text):
    """Copies of the spells a Spellcasting or Innate line names, so the GM can cast them from the sheet.
    Innate spells carry their frequency in the name ("Suggestion (3/day)")."""
    out = []
    freq = ""
    for chunk in re.split(r"(?<=\.)\s+", text):
        fm = re.match(r"(At will|\d+/day(?: each)?)\s*:", chunk, re.I)
        if fm:
            freq = fm.group(1).replace(" each", "")
        for n in re.findall(r"\*([^*]+?)\*", chunk):
            d = SPELL_DOCS.get(n.lower().strip())
            if not d:
                continue
            out.append({
                "name": d["name"] + (f" ({freq.lower() if freq.lower() == 'at will' else freq})" if freq else ""),
                "type": "spell", "img": d["img"], "system": json.loads(json.dumps(d["system"])),
                "effects": [], "flags": {"arneyan": {"frequency": freq}},
                "_stats": {"compendiumSource": f"Compendium.arneyan.spells.Item.{d['_id']}"}
            })
    return out


def enrich(text):
    """Make saves, damage, conditions and spells in rules text clickable."""
    t = html.escape(text, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)

    def spell(m):
        name = m.group(1)
        sid = SPELLS.get(html.unescape(name).lower().strip())
        return f"@UUID[Compendium.arneyan.spells.Item.{sid}]{{{name}}}" if sid else f"<em>{name}</em>"
    t = re.sub(r"\*([^*]+?)\*", spell, t)
    check = lambda m: f"@Check[{SAVE[m.group(1).lower()]}|dc:{m.group(3)}]{{{m.group(1)}{m.group(2) or ''} DC {m.group(3)}}}"
    # "Will save (DC 27)" loses both brackets; "(Will DC 13)" keeps its own.
    t = re.sub(r"\b(Fortitude|Reflex|Will)( save)? \(DC (\d+)\)", check, t)
    # (not inside a label the line above already made: "{Will save DC 17}")
    t = re.sub(r"(?<!\{)\b(Fortitude|Reflex|Will)( save)?,? DC (\d+)", check, t)
    t = re.sub(r"\b(\d+d\d+(?:\s*[+-]\s*\d+)?) (" + "|".join(DAMAGE) + r")( damage)?",
               lambda m: f"@Damage[{m.group(1).replace(' ', '')} {m.group(2)}]{{{m.group(1)} {m.group(2)}{m.group(3) or ''}}}", t)
    t = re.sub(r"\b(" + "|".join(CONDITIONS) + r")\b", lambda m: f"@Condition[{CONDITIONS[m.group(1)]}]{{{m.group(1)}}}", t)
    return t


def uses_of(text):
    m = re.search(r"\b(once|twice|\d+ times|\d+/day)\b[^.]*?\b(per|a|each)?\s*(day|encounter|long rest|rest)\b", text, re.I)
    if not m:
        m2 = re.match(r"\s*(\d+)/day", text)
        if m2:
            return {"value": int(m2.group(1)), "max": int(m2.group(1)), "per": "day"}
        return {"value": 0, "max": 0, "per": ""}
    word = m.group(1).lower()
    n = 1 if word == "once" else 2 if word == "twice" else int(re.match(r"\d+", word).group(0))
    per = {"day": "day", "encounter": "encounter", "long rest": "rest", "rest": "rest"}[m.group(3).lower()]
    return {"value": n, "max": n, "per": per}


def ability_item(name, text, img):
    if name in ("Spellcasting", "Innate"):
        # The DCs belong to single spells; the spells themselves are added to the sheet.
        text_dc = [int(x) for x in re.findall(r"DC (\d+)", text)]
        return {"name": "Innate Spellcasting" if name == "Innate" else name, "type": "ability", "img": img,
                "system": {"description": f"<p>{enrich(text)}</p>", "source": {"book": "mt", "page": 0}, "kind": "monster",
                           "uses": {"value": 0, "max": 0, "per": ""}, "save": "", "dc": None, "damage": "", "damageType": "",
                           "level": 0, "className": "", "rules": [], "toggle": False, "active": False, "applies": []},
                "_dcs": text_dc}
    sv = re.search(r"\b(Fortitude|Reflex|Will)\b(?: save)?,? \(?DC (\d+)", text)
    # Damage only where the text says so: "2d6 fire", "2d6 fire damage" or "2d6 damage" (not "1d4 rounds" or "1d4 Strength").
    dmg = re.search(r"\b(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+(?:(" + "|".join(DAMAGE) + r")\b|(?=damage\b))", text)
    dtype = dmg.group(2) if dmg and dmg.group(2) else ""
    if not dmg:
        half = re.search(r"half of (\d+d\d+(?:\s*[+-]\s*\d+)?)", text)
        if half:
            dmg = half
    if dmg and not dtype:
        dtype = named_type(name)
    if dmg and not dtype and re.search(r"constrict|buffet|throttle|trampl|crush|slam|gore|bite|claw|tail|stomp", name, re.I):
        dtype = damage_type_of(name)
    return {
        "name": name, "type": "ability", "img": img,
        "system": {
            "description": f"<p>{enrich(text)}</p>", "source": {"book": "mt", "page": 0}, "kind": "monster",
            "uses": uses_of(text), "save": SAVE[sv.group(1).lower()] if sv else "", "dc": int(sv.group(2)) if sv else None,
            "damage": dmg.group(1).replace(" ", "") if dmg else "",
            "damageType": dtype,
            "level": 0, "className": "", "rules": [], "toggle": False, "active": False, "applies": []
        }
    }


DICE = r"\d+(?:d\d+)?(?:\s*[+-]\s*\d+)?"
TYPES = "|".join(DAMAGE)


def weapon_item(seg, base_attack, img):
    """"bite +6 (1d10+3 plus 2d8 poison, 10ft) x2" -> a weapon. A rider ("plus 2d8 poison") stays its own
    typed roll, linked in the description, so resistances apply to each part correctly."""
    m = re.match(r"(.+?)\s+([+-]\d+)\s*\((.*)\)\s*(?:[x×]\s*(\d+))?\s*$", seg)
    if not m:
        return None
    name, bonus, inner, times = m.group(1).strip(), int(m.group(2)), m.group(3), m.group(4)
    parts = [p.strip() for p in re.split(r",|;", inner)]
    dmg_txt = parts[0]
    rng, notes = "", []
    for p in parts[1:]:
        if re.fullmatch(r"\d+(?:/\d+)?\s*ft", p):
            rng = p
        elif p:
            notes.append(p)
    main = re.match(rf"({DICE})\s*({TYPES})?\s*(?:(?:plus|\+)\s+(.+))?$", dmg_txt)
    traits, desc, bonus_damage = [], "", []
    if main:
        base, dtype, rider = main.group(1).replace(" ", ""), main.group(2) or damage_type_of(name), main.group(3)
    else:
        base, dtype, rider = "0", damage_type_of(name), None
        traits.append(dmg_txt)
        desc = f"<p>On a hit: {enrich(dmg_txt)} (see the creature's abilities).</p>"
    if rider:
        rm = re.match(rf"({DICE})\s+({TYPES})", rider)
        um = re.fullmatch(r"(\d+d\d+(?:[+-]\d+)?)", rider.strip())
        if um:
            base = f"{base}+{um.group(1)}"
            rider = None
        elif rm:
            bonus_damage.append({"formula": rm.group(1).replace(" ", ""), "type": rm.group(2), "when": ""})
        else:
            traits.append(f"plus {rider}")
            desc = f"<p>On a hit: plus {enrich(rider)} (see the creature's abilities).</p>"
    if times:
        traits.append(f"{times} attacks")
    traits += notes
    label = name[0].upper() + name[1:] + (f" ×{times}" if times else "")
    return {
        "name": label, "type": "weapon", "img": img,
        "system": {
            "description": desc, "source": {"book": "mt", "page": 0}, "quantity": 1, "slots": 0, "price": "", "equipped": True,
            "damage": base, "damageType": dtype, "ability": "str",
            "ranged": bool(rng) and not re.search(r"dagger|javelin|spear|hand ?axe|trident|hammer", name, re.I), "range": rng,
            "magic": 0, "attackBonus": bonus - base_attack, "traits": ", ".join(traits), "bonusDamage": bonus_damage,
            "rules": [], "toggle": False, "active": False, "applies": []
        }
    }


def _words(txt):
    txt = re.sub(r"\bdamage\b|\bto\b", " ", txt)
    return [w.strip().lower() for w in re.split(r",|\band\b|\bor\b", txt) if w.strip()]


def _weapon_word(sentence, part):
    """Which weapons a resistance or immunity is against: non-magical, non-silvered, non-adamantine, or all weapons."""
    if "weapon" not in part:
        return None
    if "silver" in sentence:
        return "non-silvered"
    if "adamantine" in sentence:
        return "non-adamantine"
    if "non-magical" in part or "other weapons" in part:
        return "non-magical"
    return "weapons"


def traits_from(sp):
    resist, immune, vuln, senses = [], [], [], []
    for raw in sp:
        for m in re.finditer(r"(Darkvision|Truesight|Blindsight|Tremorsense) (\d+)\s*ft", raw):
            senses.append(f"{m.group(1)} {m.group(2)}ft")
        s = re.sub(r"^[^:.;]{1,40}:\s*", "", raw).replace("nonmagical", "non-magical")
        for sent in [x.strip() for x in re.split(r"(?<=\.)\s+", s) if x.strip()]:
            sent = sent.rstrip(".")
            # Immunities
            for m in re.finditer(r"Immune to ([^;]+)", sent):
                for w in _words(m.group(1)):
                    if w in DAMAGE:
                        immune.append(w)
                    elif "weapon" in w:
                        immune.append(_weapon_word(sent, w + " non-magical"))
                    else:
                        immune += [f"condition:{c}" for k, c in CONDITION_IMMUNE.items() if k in w]
            for m in re.finditer(r"cannot be ([^;]+)", sent, re.I):
                if re.search(r"\bwhile\b|\bunless\b", m.group(1)):
                    continue
                for w in _words(m.group(1)):
                    immune += [f"condition:{c}" for k, c in CONDITION_IMMUNE.items() if k in w]
            # Resistances: "Resistance 10 against non-magical weapons, and (Resistance) 5 to acid, cold ..."
            i = sent.find("Resistance ")
            if i >= 0:
                text = sent[i:]
                for chunk in re.split(r",?\s+and\s+(?=(?:Resistance\s+)?\d+\s+(?:to|against)\b)", text):
                    cm = re.match(r"(?:Resistance\s+)?(\d+)\s+(?:to|against)\s+(.*)", chunk)
                    if not cm:
                        continue
                    amt = cm.group(1)
                    for part in re.split(r",?\s+and\s+(?:to|against)\s+", cm.group(2)):
                        ex = re.match(r"all other damage except (.+)", part)
                        if ex:
                            skip = set(_words(ex.group(1)))
                            resist += [f"{d} {amt}" for d in DAMAGE if d not in skip]
                            continue
                        if "from spells" in part:
                            continue
                        ww = _weapon_word(sent, part)
                        if ww:
                            resist.append(f"{ww} {amt}")
                            continue
                        resist += [f"{w} {amt}" for w in _words(part) if w in DAMAGE]
            # Vulnerabilities
            for m in re.finditer(r"(?:Takes double damage from|Vulnerable to) ([^;(]+)", sent):
                vuln += [w for w in _words(m.group(1)) if w in DAMAGE]
    uniq = lambda xs: list(dict.fromkeys(x for x in xs if x))
    immune = uniq(immune)
    resist = [r for r in uniq(resist) if r.split()[0] not in immune]
    return resist, immune, uniq(vuln), uniq(senses)


SENSE_LEAD = r"^(?:Darkvision|Truesight|Blindsight|Tremorsense) \d+\s*ft(?:;[^.]*)?\.\s*"
DEFENCE = re.compile(r"^(?:Immune to|Resistance \d+|Cannot be|Takes double damage|Vulnerable to)", re.I)
# Reminder notes for common abilities, shown on the matching roll (situational, never applied automatically).
NOTES = {
    "Magic Resistance": [{"key": "adv.save", "value": "1", "when": "against spells and magical effects"}],
    "Pack Tactics": [{"key": "adv.attack", "value": "1", "when": "an ally is within 5ft of the target"}],
    "Legendary Resistance": [{"key": "note.save", "value": "Legendary Resistance: may turn a failed save into a success"}],
    "Sunlight Sensitivity": [{"key": "note.attack", "value": "Sunlight Sensitivity: Disadvantage in sunlight"}],
}


def sp_items(s, img):
    rest = re.sub(SENSE_LEAD, "", s.strip()).strip()
    if not rest:
        return []
    mm = re.match(r"([^:.;]{1,40}):\s*(.*)", rest)
    if mm:
        it = ability_item(mm.group(1).strip(), mm.group(2).strip(), img)
        it["system"]["rules"] = [dict(r) for r in NOTES.get(it["name"], [])]
        return [it]
    sentences = [x.strip() for x in re.split(r"(?<=\.)\s+", rest) if x.strip()]
    if all(DEFENCE.match(x) for x in sentences):
        return []
    if rest.lower().startswith("advantage on saves"):
        return [ability_item("Resilient", rest, img)]
    return [ability_item(sentences[0].rstrip(".")[:40], rest, img)]


DETECTION = {"Truesight": "seeAll", "Blindsight": "senseAll", "Tremorsense": "feelTremor"}


ADDED = {}


def vision_of(senses):
    """Token sight from the senses: Darkvision (or Truesight) N ft sees N ft in the dark."""
    rng = max([int(m.group(1)) for s in senses for m in re.finditer(r"(?:Darkvision|Truesight) (\d+)", s)] or [0])
    return {"enabled": True, "range": rng, "visionMode": "darkvision" if rng else "basic"}


def detection_of(senses):
    """Truesight, Blindsight and Tremorsense as Foundry detection modes."""
    out = []
    for word, mode in DETECTION.items():
        m = re.search(word + r" (\d+)", " ".join(senses))
        if m:
            out.append({"id": mode, "range": int(m.group(1)), "enabled": True})
    return out


# Objects a creature can be turned into (Polymorph Any Object: helpless). Icons only; the creature keeps its own stats.
OBJECT_FORMS = ["teapot", "stone-block", "wooden-chair", "book-cover", "barrel", "flower-pot", "chest", "broom", "top-hat",
                "pumpkin", "stone-bust", "old-lantern", "leather-boot", "beer-stein", "acorn", "oak"]


CLASS_SLOTS = {}


def build():
    for f in glob.glob(os.path.join(OUT, "classes", "items_*.json")):
        d = json.load(open(f))
        if d["system"].get("slotTable"):
            CLASS_SLOTS.setdefault(d["name"], d["system"]["slotTable"])
    for g in OBJECT_FORMS:
        icon("form", g)
    load_spells()
    groups = {}
    count = 0
    for i, fn in enumerate(FILES):
        for m in load(os.path.join(SRC, fn + ".txt")):
            g = m["group"]
            if g not in groups:
                groups[g] = folder("monsters", g, type_="Actor", sort=len(groups) * 10, color="#2a1414")
            f = m["f"]
            cl = m["cl"]
            solo = "solo" in cl
            lv = cl.replace("solo", "").strip()
            level_text = lv if lv in ("¼", "½", "Mythic") else ""
            level = {"¼": 0, "½": 0, "Mythic": 25}.get(lv, None)
            if level is None:
                level = int(lv)
            hd = parse_hd(f.get("hd", "")) if f.get("hd", "—") != "—" else None
            n = hd[0] if hd else 1
            hp = int(f["hp"]) if "hp" in f else (hd[1] if hd else 1)
            base = max(1, int(n) // 2) if n >= 1 else 1
            good = f.get("sv", "")
            saves = {k: base + (2 if letter in good else 0) for k, letter in (("fort", "F"), ("ref", "R"), ("will", "W"))}
            if "svx" in f:
                for k, lab in (("fort", "Fort"), ("ref", "Ref"), ("will", "Will")):
                    mm = re.search(lab + r"\s*\+?(-?\d+)", f["svx"])
                    if mm:
                        saves[k] = int(mm.group(1))
            ac = int(re.match(r"\d+", f.get("ac", "10")).group(0))
            size_word = m["type"].split()[0].lower()
            size, token = SIZE.get(size_word, ("medium", 1))
            img = icon("monster", glyph_for(m["name"], m["type"]))
            # Attacks
            segs = [] if f.get("atk", "none").strip().lower() in ("none", "—", "-", "") else split_top(f["atk"])
            first = next((int(x.group(1)) for x in (re.match(r".+?\s+([+-]\d+)\s*\(", s) for s in segs) if x), 0)
            items = []
            for seg in segs:
                w = weapon_item(seg, first, img)
                if w:
                    items.append(w)
                else:
                    nm = re.match(r"([^(]+)", seg).group(1).strip()
                    items.append(ability_item(nm[0].upper() + nm[1:], seg, img))
            # Special abilities. Senses, immunities and resistances also go on the stat line (and into the damage engine).
            for s_ in m["sp"]:
                items += sp_items(s_, img)
                cm = re.match(r"(Spellcasting|Innate):\s*(.*)", s_)
                if cm:
                    items += spell_items(cm.group(2))
            dcs = [x for it in items for x in it.pop("_dcs", [])]
            # "Casts as an 11th-level cleric": that class's spell slots at that level.
            spellcasting = {"className": "", "level": 0, "slots": [], "used": []}
            for s_ in m["sp"]:
                cm = re.search(r"Casts as an? (\d+)\w\w-level (\w+)", s_)
                if cm:
                    cname = cm.group(2).capitalize()
                    lvl = int(cm.group(1))
                    table = CLASS_SLOTS.get(cname, [])
                    spellcasting = {"className": cname, "level": lvl, "slots": table[min(lvl, len(table)) - 1] if table else [], "used": []}
            resist, immune, vuln, senses = traits_from(m["sp"])
            if not senses:
                senses = added_senses(m["name"], re.sub(r"^(tiny|small|medium|large|huge|gargantuan)\s+", "", m["type"], flags=re.I).split()[0].split("(")[0].lower())
                if senses:
                    ADDED[m["name"]] = senses
            more = dragon_blindsight(m["name"], senses)
            if more:
                senses = more + senses
                ADDED[m["name"]] = more
            senses = match_5e(m["name"], senses)
            desc = f"<p><em>{html.escape(m['type'])}</em></p>"
            if m["gm"]:
                desc += f"<p><strong>GM:</strong> {enrich(m['gm'])}</p>"
            system = {
                "abilities": {k: {"value": 10} for k in ("str", "dex", "con", "int", "wis", "cha")},
                "level": level, "hd": f.get("hd", "—"),
                "attributes": {"hp": {"value": hp, "max": hp, "temp": 0}, "ac": ac, "speed": f.get("mv", ""), "attack": first, "spellDC": max(dcs) if dcs else 0,
                               "morale": int(re.match(r"-?\d+", f.get("mor", "0")).group(0)) if re.match(r"-?\d+", f.get("mor", "0")) else 0},
                "saves": saves, "spellcasting": spellcasting,
                "details": {
                    "type": re.sub(r"^(tiny|small|medium|large|huge|gargantuan)\s+", "", m["type"], flags=re.I), "size": size,
                    "alignment": "", "xp": "", "numberAppearing": f.get("no", ""), "resistances": ", ".join(resist),
                    "immunities": ", ".join(immune), "vulnerabilities": ", ".join(vuln), "senses": ", ".join(senses),
                    "isSolo": solo, "levelText": level_text, "page": 0, "description": desc,
                    "treasure": f"<p>Treasure type <strong>{html.escape(f.get('tr', '-'))}</strong> (see the Treasure tables).</p>"
                }
            }
            proto = {"name": m["name"], "texture": {"src": img}, "actorLink": False, "width": token, "height": token,
                     "disposition": -1, "displayBars": 20, "bar1": {"attribute": "attributes.hp"},
                     "sight": vision_of(senses)}
            # Detection modes (Truesight, Blindsight, Tremorsense) are worked out by the system when a token is
            # prepared: Foundry 13 keeps them as a list and Foundry 14 by id, so the Bestiary stores none.
            actor("monsters", m["name"], "npc", system, img, items=items, folder=groups[g], prototype=proto)
            count += 1
    return count

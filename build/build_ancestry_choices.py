"""Ancestry choices for the drop-in setup (Kieran, 19 Oct 2026: picking Tiefling should ask for its bloodline).

Read from each ancestry's own Character Creation text and stored on the item:
  system.bonuses    the attribute changes ("+2 Cha / +1 Int, −1 Wis" -> {cha: 2, int: 1, wis: -1})
  system.pickTwo    Human: +1 to any two attributes of the player's choice
  system.traitList  the Traits bullets [{name, text}], shown as ancestry traits on the sheet
  system.choice     {label: "Bloodline", options: [{name, text, bonuses, rules}]} for subtypes, bloodlines,
                    castes and lineages. A choice's rules are only what its text states as a number: a
                    resistance ("Resist fire": Resistance 5 to fire, as the ancestry's trait says), "+5ft speed"
                    and "+1 natural armour AC". Everything else on it is a reminder in its text.
  system.family     Tiefling: also choose the ancestry of the family you were born into
"""
import glob, html, json, os, re
from lib import OUT

PACK = os.path.join(OUT, "ancestries")
ABBR = {"str": "str", "dex": "dex", "con": "con", "int": "int", "wis": "wis", "cha": "cha", "strength": "str", "dexterity": "dex",
        "constitution": "con", "intelligence": "int", "wisdom": "wis", "charisma": "cha"}
# Each Shifter lineage while shifted (only what its text gives as a number counts on its own; the rest are reminders).
SHIFTED = {
    "Longtooth": [{"key": "adv.attack.first.melee", "value": "1", "when": "against a creature an ally also threatens", "label": ""}],
    "Wildhunt": [{"key": "adv.skill", "value": "1", "when": "Perception or Survival involving scent or tracking", "label": ""}],
    "Swiftstride": [{"key": "speed", "value": "15", "when": "", "label": ""}],
    "Beasthide": [{"key": "resist", "value": "non-magical 3", "when": "", "label": ""},
                  {"key": "note.init", "value": "Beasthide: temporary HP equal to your Constitution modifier each time you shift.", "when": "", "label": ""}],
    "Gorebrute": [{"key": "note.attack", "value": "Gorebrute: move through an enemy's space; it makes a Fortitude save (Ancestry Save DC, Strength) or is knocked prone (once per creature per turn, up to one size larger).", "when": "", "label": ""}],
    "Sslyth": [{"key": "note.attack", "value": "Sslyth: a successful unarmed bite forces a Fortitude save (Ancestry Save DC, Constitution) or the target is poisoned for the shift's duration.", "when": "", "label": ""}],
}
LABELS = {"Subtypes": "Subtype", "Bloodlines": "Bloodline", "Castes": "Caste", "Lineages": "Lineage"}
DAMAGE = "fire|cold|lightning|thunder|acid|poison|necrotic|radiant|psychic|force"


def text(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def bonuses(s):
    out = {}
    for sign, n, a in re.findall(r"([+−-])\s*(\d)\s+(Str|Dex|Con|Int|Wis|Cha)\b", s, re.I):
        out[ABBR[a.lower()]] = int(n) * (-1 if sign in "−-" else 1)
    return out


def items(ul):
    """<li><strong>Name:</strong> text</li> -> (name, text); an unlabelled bullet is named by its first clause."""
    out = []
    for li in re.findall(r"<li>(.*?)</li>", ul, re.S):
        m = re.match(r"\s*<strong>([^<]{1,60}?)(:?)\s*</strong>(:?)\s*(.*)$", li, re.S)
        if m and (m.group(2) or m.group(3)):
            out.append((text(m.group(1)), text(m.group(4))))
            continue
        t = text(li)
        name = re.split(r"[:;,(]|\. ", t)[0].strip().rstrip(".")
        out.append((name if len(name) <= 48 else name[:45].rsplit(" ", 1)[0] + "…", t))
    return out


def choice_rules(t):
    rules = []
    for m in re.finditer(rf"\bresist(?:ance)?(?: 5 to)?\s+({DAMAGE})\b", t, re.I):
        rules.append({"key": "resist", "value": f"{m.group(1).lower()} 5", "when": "", "label": ""})
    m = re.search(r"\+(\d+)\s*ft speed", t, re.I)
    if m:
        rules.append({"key": "speed", "value": m.group(1), "when": "", "label": ""})
    m = re.search(r"\+(\d) natural armour AC", t, re.I)
    if m:
        rules.append({"key": "ac", "value": m.group(1), "when": "", "label": ""})
    return rules


def build():
    n = 0
    for f in glob.glob(os.path.join(PACK, "*.json")):
        d = json.load(open(f))
        if d.get("type") != "ancestry":
            continue
        desc = d["system"].get("description", "")
        s = d["system"]
        s["bonuses"] = bonuses(s.get("attributes", ""))
        s["pickTwo"] = bool(re.search(r"\+1\s*/\s*\+1 to any two", s.get("attributes", ""), re.I))
        s["family"] = d["name"] == "Tiefling"
        # Traits
        m = re.search(r"<em>Traits</em></strong></p>\s*<ul>(.*?)</ul>", desc, re.S)
        traits = items(m.group(1)) if m else []
        s["traitList"] = [{"name": a, "text": b} for a, b in traits]
        # Subtypes, bloodlines...
        choice = None
        m = re.search(r"<em>(Subtypes|Bloodlines|Castes|Lineages)</em></strong></p>\s*<ul>(.*?)</ul>", desc, re.S)
        if m:
            opts = [{"name": a, "text": b, "bonuses": {}, "rules": choice_rules(b)} for a, b in items(m.group(2))]
            choice = {"label": LABELS[m.group(1)], "options": opts}
        else:
            # Genasi and Shifter: the attribute list before the traits names the castes or lineages.
            pre = re.search(r"</strong></p>\s*<ul>(.*?)</ul>\s*<p><strong><em>Traits", desc, re.S)
            if pre:
                opts = []
                for a, b in items(pre.group(1)):
                    key = a.split("-")[-1].strip()
                    detail = " ".join(t for _, t in traits if re.search(rf"\b{re.escape(key)}\b", t))
                    opts.append({"name": a, "text": (b + (". " + detail if detail else "")).strip(), "bonuses": bonuses(b), "rules": choice_rules(detail)})
                label = "Caste" if d["name"] == "Genasi" else "Lineage"
                choice = {"label": label, "options": opts}
                # The per-caste lines belong to the choice, not the general traits.
                keys = [o["name"].split("-")[-1].strip() for o in opts]
                s["traitList"] = [t for t in s["traitList"] if not any(re.search(rf"\b{re.escape(k)}\b", t["text"]) for k in keys)
                                  and not t["text"].lower().startswith("castes")]
        if d["name"] == "Dragonborn":
            types = ["fire", "cold", "lightning", "poison", "acid"]
            choice = {"label": "Draconic type", "options": [{"name": t.capitalize(), "text": f"Resistance 5 to {t}; your breath weapon deals {t} damage.",
                                                            "bonuses": {}, "rules": [{"key": "resist", "value": f"{t} 5", "when": "", "label": ""}]} for t in types]}
        if d["name"] == "Shifter" and choice:
            # Lineage benefits count only while shifted (Batch 8, 25 Oct 2026): the lineage's feature gets a Shifted
            # switch with The Beast Within's uses (half level a day, rounded up), and its rules apply while it's on.
            for o in choice["options"]:
                key = o["name"].split("-")[-1].strip()
                o["rules"] = SHIFTED.get(key, [])
                o["toggle"] = True
                o["uses"] = {"value": 1, "max": 1, "per": "day", "formula": "max(1, ceil(@level/2))"}
        s["choice"] = choice
        json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)
        n += 1
    return n

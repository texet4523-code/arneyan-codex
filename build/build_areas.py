"""Spell areas for placed templates (PF2e style). Read from each spell's opening line:
"Range 150ft; 20ft-radius burst" (a circle), "60ft cone", "Self; 100ft line, 5ft wide", "20ft cube", and
"Self; 15ft radius, moves with you" (an emanation that follows the caster). A spell that lasts (rounds,
minutes, hours) leaves its area on the map; an instant one (Fireball) is cleared at the caster's next turn."""
import glob, json, os, re
from lib import OUT

PACK = os.path.join(OUT, "spells")


def area_of(text):
    t = re.sub(r"<[^>]+>", " ", text)
    head = t.split(".")[0] if t else ""
    m = None
    out = None
    if (m := re.search(r"(\d+)\s*ft[- ]?radius per level(?:\s*\(max\s*(\d+)\s*ft\))?", head, re.I)):
        # Earthquake: 5ft radius per level (max 100ft).
        per, cap = int(m.group(1)), m.group(2)
        out = {"type": "circle", "size": per, "width": 0, "sizeFormula": f"min({per}*@cl, {cap})" if cap else f"{per}*@cl"}
    elif (m := re.search(r"(\d+)\s*ft[- ]?(?:radius|-radius)", head, re.I)):
        out = {"type": "circle", "size": int(m.group(1)), "width": 0}
    elif (m := re.search(r"(\d+)\s*ft[- ]cone", head, re.I)):
        out = {"type": "cone", "size": int(m.group(1)), "width": 0}
    elif (m := re.search(r"(\d+)\s*ft[- ]line(?:,?\s*(\d+)\s*ft wide)?", head, re.I)):
        out = {"type": "line", "size": int(m.group(1)), "width": int(m.group(2) or 5)}
    elif (m := re.search(r"(\d+)\s*ft[- ](?:cube|square)", head, re.I)):
        out = {"type": "rect", "size": int(m.group(1)), "width": 0}
    if not out:
        return None
    self_ = bool(re.match(r"\s*self\b", head, re.I))
    out["attached"] = bool(re.search(r"moves with you", head, re.I)) or (self_ and out["type"] == "circle" and bool(re.search(r"around you|centred on you|centered on you", head, re.I)))
    out["fromSelf"] = self_ or out["type"] == "cone"  # a cone always spreads from the caster
    out["lingering"] = bool(re.search(r"\b\d+\s*(?:round|minute|hour|turn)s?\b|round per level|minute per level|minutes per level|hours? per level|rounds per level|concentration", head, re.I))
    out["rounds"] = rounds_of(head) if out["lingering"] else ""
    out.setdefault("sizeFormula", "")
    return out


UNIT = {"round": 1, "turn": 1, "minute": 10, "hour": 600}


def rounds_of(head):
    """How long a lingering area lasts, in rounds: "1 round per level" -> "1*@cl", "10 minutes" -> "100"."""
    m = re.search(r"(\d+)\s*(round|turn|minute|hour)s?\s+per\s+level(?:\s*\(max\s*(\d+)\))?", head, re.I)
    if m:
        f = f"{int(m.group(1)) * UNIT[m.group(2).lower()]}*@cl"
        return f"min({f}, {int(m.group(3)) * UNIT[m.group(2).lower()]})" if m.group(3) else f
    m = re.search(r"(\d+)\s*(round|turn|minute|hour)s?\b", head, re.I)
    return str(int(m.group(1)) * UNIT[m.group(2).lower()]) if m else ""


# Spells whose "radius" or "cube" is a light, an object or a wall, not an area to place.
NOT_AREAS = {"Daylight", "Produce Flame", "Secret Page", "Wall of Iron", "Detect Poison", "Polymorph Any Object",
             "Sequester", "Stone Tell", "Antipathy"}


def build():
    n = 0
    for f in glob.glob(os.path.join(PACK, "*.json")):
        d = json.load(open(f))
        if d.get("type") != "spell":
            continue
        a = None if d["name"] in NOT_AREAS else area_of(d["system"].get("description", ""))
        d["system"]["template"] = a or {"type": "", "size": 0, "width": 0, "attached": False, "fromSelf": False, "lingering": False, "rounds": "", "sizeFormula": ""}
        if a:
            n += 1
            unit = {"circle": "radius", "cone": "cone", "line": "line", "rect": "cube"}[a["type"]]
            d["system"]["area"] = f"{a['size']}ft {unit}" + (f", {a['width']}ft wide" if a["type"] == "line" else "")
        json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)
    return n

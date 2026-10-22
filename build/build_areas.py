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
    # Follows the caster (an aura) when it says so, or is a circle around them, unless it says it stays put
    # (Obscuring Mist: "It does not move with you": placed where the caster stands, with Remove area).
    stays = bool(re.search(r"does not move with you|doesn't move with you|stays where", t, re.I))
    out["attached"] = not stays and (bool(re.search(r"moves with you", head, re.I)) or (self_ and out["type"] == "circle" and bool(re.search(r"around you|centred on you|centered on you", head, re.I))))
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

# Spells whose duration is on the creatures, not the area: the area is cleared like an instant one.
ON_CREATURES = {"Fear (Mass)"}

def _area(type_, size, width=0, fromSelf=False, lingering=False, rounds=""):
    return {"type": type_, "size": size, "width": width, "attached": False, "fromSelf": fromSelf, "lingering": lingering,
            "rounds": rounds, "sizeFormula": ""}

# Areas stated after the opening line, so area_of() does not see them (the text each rests on is quoted).
AREAS = {
    "Call Lightning": _area("circle", 10),          # "striking a 10ft-radius burst" (one bolt a round)
    "Explosive Runes": _area("circle", 10),         # "explode in a 10ft-radius burst centred on the reader"
    "Glyph of Warding": _area("circle", 5),         # "thunder damage (max 5d8) in a 5ft radius"
    "Fire Trap": _area("circle", 5),                # "it explodes in a 5ft radius"
    "Fire Seeds": _area("circle", 10),              # "each bursts in a 10ft-radius explosion"
    "Sunbeam": _area("line", 60, 5, fromSelf=True),  # "a 5ft-wide, 60ft-long line of sunlight"
    "Creeping Doom": _area("circle", 20, lingering=True, rounds="min(1*@cl, 10)"),  # "A 20ft-radius swarm"; "1 round per level (max 10)"
    "Repel Metal or Stone": _area("cone", 60, fromSelf=True, lingering=True, rounds="1*@cl"),  # "Self; cone 60ft long, 1 round per level"
    "Meteor Swarm": _area("circle", 20),            # "Four meteors ... each exploding in a 20ft radius"
    "Symbol": _area("circle", 30),                  # "everything within a 30ft radius is affected"
    # "one fire no larger than a 20ft cube" is the fire put out; the smoke option "fills a 20ft radius for 1 round per level".
    "Pyrotechnics": _area("circle", 20, lingering=True, rounds="1*@cl"),
}

# Template flags the opening line gets wrong: how long the area stays (from later in the text), or that it is centred on you.
FLAGS = {
    "Evard's Black Tentacles": {"lingering": True, "rounds": "1*@cl"},   # "fill the area for 1 round per level"
    "Spike Growth": {"lingering": True, "rounds": "600*@cl"},            # "Lasts 1 hour per level"
    "Spike Stones": {"lingering": True, "rounds": "600*@cl"},            # "for 1 hour per level"
    "Sleet Storm": {"lingering": True, "rounds": "1*@cl"},               # "covers the area for 1 round per level"
    "Hallucinatory Terrain": {"lingering": True, "rounds": "600*@cl"},   # "for 1 hour per level"
    "Permanent Image": {"lingering": True, "rounds": ""},                # "lasts until dispelled"
    "Plant Growth": {"lingering": True, "rounds": ""},                   # "until it is cleared or burned"
    "Prismatic Spray": {"lingering": False, "rounds": ""},               # instant; "1 minute" is the Indigo ray's Blinded
    "Wail of the Banshee": {"fromSelf": True},                           # "40ft radius around you"
    "Prayer": {"fromSelf": True},                                        # "40ft radius centred on you"
    "Disjunction": {"fromSelf": True},                                   # "30ft-radius burst centred on you"
    "Leomund's Tiny Hut": {"fromSelf": True},                            # "a 10ft-radius dome centred on you, stationary"
}


def build():
    n = 0
    for f in glob.glob(os.path.join(PACK, "*.json")):
        d = json.load(open(f))
        if d.get("type") != "spell":
            continue
        a = None if d["name"] in NOT_AREAS else (dict(AREAS[d["name"]]) if d["name"] in AREAS else area_of(d["system"].get("description", "")))
        if a and d["name"] in ON_CREATURES:
            a.update(lingering=False, rounds="")
        if a and d["name"] in FLAGS:
            a.update(FLAGS[d["name"]])
        d["system"]["template"] = a or {"type": "", "size": 0, "width": 0, "attached": False, "fromSelf": False, "lingering": False, "rounds": "", "sizeFormula": ""}
        if a:
            n += 1
            unit = {"circle": "radius", "cone": "cone", "line": "line", "rect": "cube"}[a["type"]]
            d["system"]["area"] = f"{a['size']}ft {unit}" + (f", {a['width']}ft wide" if a["type"] == "line" else "")
        json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)
    return n

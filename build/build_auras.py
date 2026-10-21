"""Auras, transcribed from the rules text (Kieran asked for auras, 19 Oct 2026; the readings are on the Feature
Board to agree or change). An aura is stored on the item that grants it, as system.auras:

  name, radius (feet; steps by level [[1, 10], [15, 30]]; or a formula with @cl = the class level / caster level), who ("allies", "enemies" or
  "all"), includeSelf, minLevel, rules (the Arneyan rule vocabulary, put on everyone inside while they're inside),
  rounds (spells: how long it lasts once cast), and turn (what happens to a creature that starts its turn inside:
  save, dc, formula, type, half, status, statusRounds, text).

Class features and spells are done before the monsters copy their spells; monster abilities after.
"""
import glob, json, os, re
from lib import OUT

COURAGE_RADIUS = [[1, 10], [15, 30], [20, 50]]  # 10ft, 30ft from 15th, 50ft from 20th

BY_NAME = {
    ("class-features", "Divine Protection"): [{
        "key": "courage", "name": "Aura of Courage", "minLevel": 6, "radius": COURAGE_RADIUS, "who": "allies", "includeSelf": False,
        "rules": [{"key": "save", "value": "4", "when": "vs fear", "label": "Aura of Courage"}]}],
    ("class-features", "Aura of Devotion"): [{
        "key": "devotion", "name": "Aura of Devotion", "minLevel": 18, "radius": COURAGE_RADIUS, "who": "allies", "includeSelf": True,
        "rules": [{"key": "adv.save", "value": "1", "when": "vs charm", "label": "Aura of Devotion"}]}],
    ("class-features", "Divine Monolith"): [{
        "key": "monolith", "name": "Divine Monolith", "radius": 20, "who": "all", "includeSelf": True,
        "rules": [{"key": "check", "value": "2", "label": "Divine Monolith"}, {"key": "save", "value": "2", "label": "Divine Monolith"},
                  {"key": "note.save", "value": "Divine Monolith: immune to death attacks.", "label": "Divine Monolith"}]}],
    ("spells", "Spirit Guardians"): [{
        "key": "guardians", "name": "Spirit Guardians", "radius": 15, "who": "enemies", "includeSelf": False, "rounds": "@cl",
        "rules": [{"key": "speed.mult", "value": "0.5", "label": "Spirit Guardians"}],
        "turn": {"save": "will", "dc": 0, "formula": "1d6", "type": "radiant", "half": True,
                 "text": "1d6 radiant or necrotic damage (the caster's choice when casting); Will halves. Once per round."}}],
}


def put(pack, fn):
    n = 0
    for f in glob.glob(os.path.join(OUT, pack, "*.json")):
        d = json.load(open(f))
        if "system" not in d:
            continue
        auras = fn(d)
        if not auras:
            continue
        d["system"]["auras"] = auras
        n += 1
        json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)
    return n


def before_monsters():
    n = 0
    for pack in ("class-features", "spells", "feats"):  # kits keep effects per feature
        n += put(pack, lambda d, p=pack: BY_NAME.get((p, d["name"])))
    return n


SAVE = {"will": "will", "fortitude": "fort", "reflex": "ref"}


def monster_aura(name, html_text):
    """A monster ability called "... Aura": its radius, and what it does to a creature inside."""
    t = re.sub(r"@\w+\[[^\]]*\]\{([^{}]*)\}", r"\1", html_text)  # plain text from enriched links
    t = re.sub(r"<[^>]+>", " ", t)
    if re.search(r"once per day|as an action", t, re.I):
        return None  # switched on by the monster (Darkness Aura): not always there
    m = re.search(r"within (\d+)\s*ft", t, re.I)
    if not m:
        return None
    a = {"key": re.sub(r"\W+", "-", name.lower()), "name": name, "radius": int(m.group(1)), "who": "all", "includeSelf": False, "rules": []}
    if re.search(r"-1 to all saves", t, re.I):
        a["rules"] = [{"key": "save", "value": "-1", "label": name}]
    turn = {}
    if re.search(r"starts its turn|within \d+\s*ft that sees it", t, re.I):
        dmg = re.search(r"takes (\d+d\d+(?:\s*[+-]\s*\d+)?) (\w+) damage", t)
        sv = re.search(r"(Will|Fortitude|Reflex) save[^.]*?DC (\d+)", t)
        if dmg:
            turn.update({"formula": dmg.group(1).replace(" ", ""), "type": dmg.group(2).lower()})
        if sv:
            turn.update({"save": SAVE[sv.group(1).lower()], "dc": int(sv.group(2))})
        if re.search(r"\bFrightened\b", t):
            turn.update({"status": "frightened", "statusRounds": 10 if re.search(r"1 minute", t) else 1})
        turn["text"] = re.split(r"(?<=\.)\s+", t.strip())[0]
        if re.search(r"\bShaken\b", t):
            turn["text"] = t.strip().split(". A creature that hits")[0]
            turn.update({"status": "shaken", "statusRounds": 1})
    if turn:
        a["turn"] = turn
    return a if (a["rules"] or turn) else None


def after_monsters():
    n = 0
    for f in glob.glob(os.path.join(OUT, "monsters", "*.json")):
        d = json.load(open(f))
        changed = False
        for i in d.get("items", []):
            if i.get("type") == "ability" and re.search(r"\baura\b", i["name"], re.I):
                a = monster_aura(i["name"], i["system"].get("description", ""))
                if a:
                    i["system"]["auras"] = [a]
                    changed = True
                    n += 1
        if changed:
            json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)
    return n

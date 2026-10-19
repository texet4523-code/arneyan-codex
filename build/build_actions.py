"""Actions pack: the Codex's basic actions and Combat Manoeuvres as ability items (kind "action").

Text comes straight from Book I (Codex), Section III. Switchable manoeuvres carry the rules the
table states (Advantage or Disadvantage); everything else is a description and a chat card.
"""
import re
from lib import item, folder, esc, md_inline

CODEX = "/tmp/hb/mm/codex.md"

GLYPH = {
    "Called Shot": "targeted", "Charging": "charging-bull", "Cleave": "axe-swing", "Disarm": "drop-weapon",
    "Disengage": "exit-door", "Dodge": "dodging", "Feint": "fencer", "Flank Attack": "sword-clash",
    "Hide": "hood", "Offensive Focus": "crossed-swords", "Parry": "sword-break", "Push": "push",
    "Rear Attack": "backstab", "Receiving Charge": "spears", "Shield Blow": "shield-bash",
    "Shield Wall": "shield-reflect", "Trip": "falling", "Ready": "hourglass", "Delay": "sands-of-time",
    "Dash": "run", "Opportunity Attack": "sword-wound", "Grapple": "grab", "Overbear": "knockout",
    "Unarmed Strike": "fist", "Help": "shaking-hands"
}

# Manoeuvres you declare and keep up for a while: a switch on the sheet with the table's own effect.
TOGGLES = {
    "Charging": [("adv.attack", "1"), ("adv.against", "1")],
    "Offensive Focus": [("adv.attack", "1"), ("adv.against", "1")],
    "Dodge": [("adv.against", "-1")],
    "Called Shot": [("adv.attack", "-1"), ("note.damage", "Called Shot: add one extra damage die on a hit")],
    "Shield Blow": [("adv.attack", "-1"), ("note.attack", "Shield Blow: on a hit the target makes a Fortitude save or is stunned 1d2 rounds")],
    "Flank Attack": [("adv.attack.melee", "1")],
    "Rear Attack": [("adv.attack", "1")],
}


def rule(k, v):
    return {"key": k, "value": v, "when": "", "label": ""}


def ability(name, html, fol, sort, save="", toggle=False):
    rules = [rule(k, v) for k, v in TOGGLES.get(name, [])]
    from icons import icon
    item("actions", name, "ability", {
        "description": html, "source": {"book": "phb", "page": 0},
        "kind": "action", "uses": {"value": 0, "max": 0, "per": ""}, "save": save, "dc": None, "damage": "",
        "level": 0, "className": "", "rules": rules, "toggle": bool(rules), "active": False, "applies": []
    }, icon("action", GLYPH.get(name, "swords-emblem")), folder=fol, sort=sort)


def build(_icon=None):
    md = open(CODEX, encoding="utf-8").read()
    manoeuvres = folder("actions", "Combat Manoeuvres", sort=1)
    basic = folder("actions", "Basic Actions", sort=0)
    contest = ("<p class=\"arn-note\">Contest: both sides roll d20 + the stated attribute modifier; "
               "the higher total wins and ties go to the defender.</p>")

    # The Combat Manoeuvres table.
    sec = md[md.index("## Combat Manoeuvres"):]
    sec = sec[:sec.index("\n## ", 5)]
    n = 0
    for line in sec.splitlines():
        m = re.match(r"\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$", line)
        if not m or m.group(1) in ("Manoeuvre", "---"):
            continue
        name, effect = m.group(1), m.group(2)
        html = f"<p>{md_inline(effect)}</p>"
        if "Contest" in effect:
            html += contest
        if name in TOGGLES:
            html += "<p class=\"arn-note\">Switch it on from the Actions tab while it applies; the sheet adds the Advantage or Disadvantage.</p>"
        ability(name, html, manoeuvres, n * 10, save="fort" if name == "Shield Blow" else "")
        n += 1

    # Basic actions from Actions & Turns, Movement, Reactions and Unarmed Combat.
    def bullet(label):
        m = re.search(r"\*\*" + re.escape(label) + r"\.?\*\*\.?\s*(?:\([^)]*\):?)?\s*(.+)", md)
        return md_inline(m.group(1).strip()) if m else ""
    basics = [
        ("Ready", bullet("Ready")),
        ("Delay", bullet("Delay")),
        ("Dash", "Spend your action to Dash and double your movement for the turn."),
        ("Opportunity Attack", bullet("Opportunity Attack:")),
        ("Unarmed Strike", bullet("Unarmed Strike:")),
        ("Grapple", "Contest: your Strength check against the target's Strength or Dexterity check (their choice). "
                    "Win, and the target is Restrained until it breaks free with its own contested check on a later turn. "
                    "Grappling does not knock a target prone by itself."),
        ("Overbear", "Spend a further attack to knock a creature you have already grappled (Restrained) prone: a second contested check."),
    ]
    for i, (name, text) in enumerate(basics):
        if not text:
            continue
        ability(name, f"<p>{text[0].upper() + text[1:]}</p>", basic, i * 10)
    return n

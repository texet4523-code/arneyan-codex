"""Actions pack: Book I (Core Rules), Section III Combat, as ability items (kind "action").

Source: out2/The_Arneyan_Codex.docx, the Book I master the Player's Handbook v0.9.9 prints (pp. 8-15; the Handbook
adds only page references). Two folders:
- Combat Manoeuvres: the book's three tables (Actions, Manoeuvres, Positioning), in its order.
- Basic Actions: the other actions Section III names (Ready, Delay, Dash, Attack of Opportunity, Unarmed Strike,
  Overbear, breaking free, Fighting Defensively).

What Use does:
- Contests (Dirty Trick, Disarm, Grapple, Overbear, Trip, Break Free) roll both sides (combat.mjs, startContest).
- Unarmed Strike attacks (combat.mjs); Attack of Opportunity spends the reaction.
- Hide and Search roll the check the book names (an activity, kind "check").
- Charge, Dodge, Flank Attack and Shield Blow are switches with the table's own Advantage or Disadvantage.
- Everything else posts its card.

IDs are sha1 of the name (lib.fid), so an action keeps its ID across builds; the two the book renamed keep their old
key (Charging is now Charge, Opportunity Attack is now Attack of Opportunity)."""
import re
import docx
from lib import item, folder, esc, fix, fid, walk_docx, write

import books_md
CODEX = books_md.CODEX

GLYPH = {
    "Charge": "charging-bull", "Cleave": "axe-swing", "Disarm": "drop-weapon", "Disengage": "exit-door", "Dodge": "dodging",
    "Flank Attack": "sword-clash", "Hide": "hood", "Search": "magnifying-glass", "Guard": "shield", "Push": "push",
    "Receiving Charge": "spears", "Shield Blow": "shield-bash", "Shield Wall": "shield-reflect", "Trip": "falling",
    "Ready": "hourglass", "Delay": "sands-of-time", "Dash": "run", "Attack of Opportunity": "sword-wound", "Grapple": "grab",
    "Overbear": "knockout", "Unarmed Strike": "fist", "Dirty Trick": "dust-cloud", "Break Free": "breaking-chain",
    "Fighting Defensively": "sword-break",
}

# Old keys for the actions the book renamed, so their IDs stay the same.
KEYS = {"Charge": "Charging", "Attack of Opportunity": "Opportunity Attack"}

# Switches on the sheet, with the effect the table states.
TOGGLES = {
    # "make one melee attack with Advantage": the first melee attack only, not every attack while it's on.
    "Charge": [("adv.attack.first.melee", "1"), ("adv.against", "1")],
    "Dodge": [("adv.against", "-1")],
    "Shield Blow": [("adv.attack", "-1"), ("note.attack", "Shield Blow: on a hit the target makes a Fortitude save or is Stunned for 1d2 rounds")],
    "Flank Attack": [("adv.attack.melee", "1")],
}

# Checks the Use button rolls (the book's attribute; a skill that applies is the player's to add).
CHECKS = {
    "Hide": ("dex", "Dexterity (Stealth) check: 12, 15 or 20+ sets how hidden you are and the Search DC (12, 15 or 20); below 12 you are not hidden. A creature not actively looking spots you if its passive awareness meets the Search DC."),
    "Search": ("wis", "Wisdom check against the hidden creature's Search DC; on a success you find it."),
}

# combat.mjs picks the contest by name (Grapple, Trip, Disarm, Dirty Trick, Overbear) or by this flag.
FLAGS = {"Break Free": {"arneyan": {"contest": "escape"}}}

USE_NOTES = {
    **{n: "Target one creature and press Use: both sides roll, and the result is applied." for n in ("Disarm", "Dirty Trick", "Grapple", "Overbear", "Trip")},
    "Break Free": "Press Use while Restrained: you roll Strength or Dexterity against the grappler's Strength, and a win ends Restrained.",
    "Unarmed Strike": "Press Use to attack: it adds an Unarmed Strike weapon to the sheet the first time.",
    "Hide": "Press Use to roll the Dexterity check.",
    "Search": "Press Use to roll the Wisdom check.",
    "Attack of Opportunity": "Press Use to attack with your weapon, out of turn (once per round).",
    "Fighting Defensively": "The Actions tab's Defend buttons apply it.",
}


def rule(k, v):
    return {"key": k, "value": v, "when": "", "label": ""}


def ability(name, html, fol, sort):
    rules = [rule(k, v) for k, v in TOGGLES.get(name, [])]
    if name in USE_NOTES:
        html += f'<p class="arn-note">{USE_NOTES[name]}</p>'
    if rules:
        html += '<p class="arn-note">Switch it on from the Actions tab while it applies; the sheet adds the Advantage or Disadvantage.</p>'
    acts = []
    if name in CHECKS:
        ab, text = CHECKS[name]
        acts.append({"name": name, "kind": "check", "formula": "", "damageType": "", "ability": ab, "save": "", "text": text,
                     "minLevel": 0, "cost": 0, "per": "", "target": "", "removeConditions": False})
    from icons import icon
    system = {
        "description": html, "source": {"book": "phb", "page": 0},
        "kind": "action", "uses": {"value": 0, "max": 0, "per": ""}, "save": "fort" if name == "Shield Blow" else "", "dc": None, "damage": "",
        "level": 0, "className": "", "rules": rules, "toggle": bool(rules), "active": False, "applies": [], "activities": acts
    }
    img = icon("action", GLYPH.get(name, "swords-emblem"))
    if name not in FLAGS:
        return item("actions", name, "ability", system, img, folder=fol, sort=sort, key=KEYS.get(name))
    # lib.item has no flags: the same document, written once.
    _id = fid("actions", "ability", KEYS.get(name) or name)
    doc = {"_id": _id, "_key": f"!items!{_id}", "name": name, "type": "ability", "img": img, "system": system, "effects": [],
           "folder": fol, "sort": sort, "ownership": {"default": 0}, "flags": FLAGS[name]}
    write("actions", doc)
    return doc


def section(d):
    """Book I, Section III: {heading: [(text, is list)]} and {first column header: rows} for its tables."""
    heads, tables = {}, {}
    on, cur = False, None
    for kind, obj, info in walk_docx(d):
        if kind == "table":
            if on:
                tables.setdefault(obj[0][0], []).append(obj)
            continue
        t, style = info["text"].strip(), info["style"]
        if style == "Heading 1":
            on = t.startswith("Section III")
            continue
        if not on:
            continue
        if style.startswith("Heading"):
            cur = heads.setdefault(t, [])
            continue
        if cur is not None and t:
            cur.append(fix(t))
    return heads, tables


def lead(paras, label):
    """The paragraph that starts "Label." or "Label (action):", without the label."""
    for p in paras:
        m = re.match(re.escape(label) + r"\s*(?:\((?:action|[^)]*)\))?\s*[.:]\s*(.+)$", p)
        if m:
            return m.group(1).strip()
    return ""


def ul(lines):
    return "<ul>" + "".join(f"<li>{esc(x)}</li>" for x in lines) + "</ul>"


def build(_icon=None):
    d = docx.Document(CODEX)
    heads, tables = section(d)
    man = tables["Action"][0][1:], tables["Manoeuvre"][0][1:], [t for t in tables["Option"] if t[0] == ["Option", "Effect"]][0][1:]
    manoeuvres = folder("actions", "Combat Manoeuvres", sort=1)
    basic = folder("actions", "Basic Actions", sort=0)
    contest = ('<p class="arn-note">Contest: both sides roll d20 + the stated attribute modifier; '
               "the higher total wins and ties go to the defender.</p>")

    # Fuller text the tables point to ("see Movement & Charging", "see Disengage & Hide", "see Unarmed Combat").
    moving = heads["Movement & Charging"]
    i = next(k for k, p in enumerate(moving) if p.startswith("Charging (action)"))
    hiding = heads["Disengage & Hide"]
    grappling = heads["Unarmed Combat & Grappling"]
    more = {
        "Charge": moving[i:i + 5],
        "Hide": [p for p in hiding if p.startswith(("Hide (action)", "Partially Hidden", "Hidden (", "Completely Hidden", "Passive awareness", "Unseen"))],
        "Search": [p for p in hiding if p.startswith("Search (action)")],
        "Grapple": [p for p in grappling if not p.startswith(("Unarmed Strike", "Grappling:"))],
    }
    group = {}
    n = 0
    for label, rows in zip(("Action", "Manoeuvre", "Positioning"), man):
        for name, effect in rows:
            html = f"<p>{esc(fix(effect))}.</p>".replace("..</p>", ".</p>")
            html += f'<p class="arn-note"><strong>Combat Manoeuvres, {label}:</strong> {dict(Action="uses your action.", Manoeuvre="replaces one attack.", Positioning="a benefit for where you stand.")[label]}</p>'
            if name in more:
                html += ul(more[name])
            if "Contest" in effect:
                html += contest
            if name == "Shield Blow":
                html += "<p>The save DC is 10 + half your level (minimum 1) + your Strength modifier. A creature that saves against your Shield Blow is immune to it for the rest of the fight.</p>"
            ability(name, html, manoeuvres, n * 10)
            group[name] = label
            n += 1

    # The other actions Section III names.
    turns = heads["Actions & Turns"]
    defend = [t for t in tables["Option"] if t[0] == ["Option", "Bonus"]][0]
    dual = heads["Dual Wielding & Shields"]
    j = next(k for k, p in enumerate(dual) if p.startswith("Instead of attacking with your off-hand weapon"))
    unarmed = lead(grappling, "Unarmed Strike")
    overbear = next(p for p in grappling if p.startswith("To knock a grappled target down"))
    restrained = next(r for r in tables["Condition"][0] if r[0] == "Restrained")
    by_grappler = next(p for p in grappling if p.startswith("Win the contest"))
    basics = [
        ("Ready", f"<p>{esc(lead(turns, 'Ready'))}</p>"),
        ("Delay", f"<p>{esc(lead(turns, 'Delay'))}</p>"),
        ("Dash", "<p>Spend your action to Dash and double your movement for the turn (Movement &amp; Charging).</p>"),
        ("Attack of Opportunity", f"<p>{esc(lead(turns, 'Attack of Opportunity'))}</p><p>{esc(lead(turns, 'Reactions'))}</p>"),
        ("Unarmed Strike", f"<p>{esc(unarmed[0].upper() + unarmed[1:])}</p>"),
        ("Overbear", f"<p>{esc(overbear)}</p>{contest}"),
        ("Break Free", f"<p><strong>Restrained</strong> (Conditions): {esc(fix(restrained[1]))}</p><p><strong>Lasts / ends early by:</strong> {esc(fix(restrained[2]))}</p>"
                       f"<p>{esc(by_grappler)}</p>{contest}"),
        ("Fighting Defensively", f"<p>{esc(dual[j])}</p>" + "<ul>" + "".join(f"<li><strong>{esc(o)}:</strong> {esc(fix(b))}</li>" for o, b in defend[1:]) + "</ul>"),
    ]
    for k, (name, html) in enumerate(basics):
        assert re.sub(r"<[^>]+>", "", html).strip(), f"no text for {name}"
        ability(name, html, basic, k * 10)
    return n

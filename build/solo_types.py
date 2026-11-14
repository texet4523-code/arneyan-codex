"""M&T v0.10.75 (R-B92, K141 to K159): Running a Solo. A creature marked Solo names one of nine types on its Solo line
("Solo: Dragon."); run as a solo, it has that type's three villain actions, with damage from the Villain Action Damage
table by Level and its DC from the attribute in brackets (10 + half its Level + that modifier; a Spellcaster's is its
spell DC). This reads the types and the table from front.md and writes a creature's three actions as items.
Ssendam, Ygorl, Primus and the three Mythic creatures keep the actions printed in their blocks."""
import re

SAVES = {"fortitude": "fort", "reflex": "ref", "will": "will"}
ATTR = {"Str": "str", "Dex": "dex", "Con": "con", "Int": "int", "Wis": "wis", "Cha": "cha"}
STEP = {"Opener": 1, "Crowd control": 2, "Ultimate": 3}
STEP_NAME = {1: "Opener", 2: "Crowd Control", 3: "Ultimate"}
KIND = {1: "opener", 2: "crowd-control", 3: "ultimate"}


def section(front):
    m = re.search(r"^# Running a Solo\n(.*?)(?=^# )", front, re.M | re.S)
    assert m, "front.md: no Running a Solo section"
    return m.group(1)


def damage_table(front):
    """{9: {"one": "3d6", "area": "1d10", "cc": "3d6", "ult": "5d8"}, ...} for Levels 9 to 24."""
    out = {}
    for ln in section(front).splitlines():
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if len(cells) != 4 or not re.match(r"\d", cells[0]):
            continue
        lo, hi = (int(x) for x in (re.findall(r"\d+", cells[0]) * 2)[:2])
        one, area = (x.strip() for x in cells[1].split("/"))
        for lv in range(lo, hi + 1):
            out[lv] = {"one": one, "area": area, "cc": cells[2], "ult": cells[3]}
    assert sorted(out) == list(range(9, 25)), f"Villain Action Damage table: {sorted(out)}"
    return out


def types(front):
    """{"Dragon": {1: ("Dread Majesty", text), 2: (...), 3: (...)}, ...} and the Dragon element table."""
    body = section(front)
    out = {}
    for m in re.finditer(r"^\*\*([A-Z][a-z]+(?: [a-z]+)*)\*\* \(([^)]*)\)[^\n]*\n\n((?:- \*[^\n]+\n?)+)", body, re.M):
        acts = {}
        for a in re.finditer(r"^- \*(Opener|Crowd control|Ultimate), ([^:]+):\* (.+)$", m.group(3), re.M):
            acts[STEP[a.group(1)]] = (a.group(2).strip(), a.group(3).strip())
        assert sorted(acts) == [1, 2, 3], f"{m.group(1)}: {sorted(acts)}"
        out[m.group(1)] = acts
    assert len(out) == 9, f"nine solo types, found {sorted(out)}"
    elements = {}
    for ln in body.splitlines():
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if len(cells) == 3 and cells[1] in ("Reflex", "Fortitude", "Will"):
            for el in re.split(r",\s*", cells[0]):
                elements[el.lower()] = (SAVES[cells[1].lower()], cells[2])
    assert {"fire", "cold", "acid", "lightning", "poison", "necrotic", "radiant", "psychic"} <= set(elements), elements
    return out, elements


def _for_this(text, name):
    """"(radiant for a baelnorn)": the type in brackets for that creature, and the brackets gone either way."""
    swap = None
    def keep(m):
        nonlocal swap
        for part in m.group(1).split(", "):
            p = re.fullmatch(r"(\w+) for (?:an? )?([a-z][a-z ]+)", part.strip())
            if p and p.group(2).lower() in name.lower():
                swap = p.group(1)
        return ""
    text = re.sub(r"\s*\(((?:\w+ for an? [a-z][a-z ]+)(?:, \w+ for an? [a-z][a-z ]+)*)\)", keep, text)
    return text, swap


def villain_items(name, kind, level, mods, spell_dc, element, table, sets, elements, enrich, img, types_):
    """The three villain-action items for a solo of this type."""
    row = table[min(max(int(level), 9), 24)]
    out = []
    for n in (1, 2, 3):
        title, text = sets[kind][n]
        text, swap = _for_this(text, name)
        # The DC: the attribute in brackets, or the spell DC for a Spellcaster.
        def dc_of(m):
            a = ATTR[m.group(1)]
            return f"(DC {10 + max(1, int(level) // 2) + mods[a]})"
        text = re.sub(r"\((Str|Dex|Con|Int|Wis|Cha)\)", dc_of, text)
        dc = re.search(r"\(DC (\d+)\)", text)
        dc = int(dc.group(1)) if dc else (spell_dc if kind == "Spellcaster" and spell_dc else None)
        if kind == "Spellcaster" and spell_dc and re.search(r"makes? an? \w+ save", text):
            text = re.sub(r"(makes? an? \w+ save)", rf"\1 (DC {spell_dc})", text, count=1)
        sv = re.search(r"\b(Fortitude|Reflex|Will) save", text)
        save = SAVES[sv.group(1).lower()] if sv else ""
        el = (element or "").lower()
        if "the save for its element" in text and el in elements:
            save = elements[el][0]
            word = {"fort": "Fortitude", "ref": "Reflex", "will": "Will"}[save]
            text = text.replace("the save for its element", f"a {word} save")
        # Damage from the table, with its type.
        dice, dtype = "", ""
        dm = re.search(r"\b(opener|crowd-control|ultimate) ((?:" + "|".join(types_) + r") )?damage( of its element| of a type it chooses)?", text)
        if dm:
            if dm.group(1) == "opener":
                many = re.search(r"\b(each|up to)\b", text[:dm.start()], re.I)
                dice = row["area"] if many else row["one"]
            else:
                dice = row["cc"] if dm.group(1) == "crowd-control" else row["ult"]
            # A dragon's damage is its element ("The dragon's element is its breath weapon's damage type").
            dtype = swap or (dm.group(2) or "").strip() or (el if dm.group(3) == " of its element" or kind == "Dragon" else "")
            chooses = " of a type it chooses" if dm.group(3) == " of a type it chooses" else ""
            text = text[:dm.start()] + f"{dice} {dtype + ' ' if dtype else ''}damage{chooses}" + text[dm.end():]
        elif swap:
            dtype = swap
        if n == 2 and kind == "Dragon" and el in elements:
            text += f" (Its element: {el}; rider: {elements[el][1]}.)"
        if n == 3 and kind == "Dragon" and el in elements:
            text += f" (Rider for {el}: {elements[el][1]}.)"
        text = text[0].upper() + text[1:]
        art = "an" if kind[0] in "AEIOU" else "a"
        out.append({
            "name": f"Villain Action {n} ({STEP_NAME[n]}): {title}", "type": "ability", "img": img,
            "flags": {"arneyan": {"villainAction": n, "soloType": kind}},
            "system": {"description": f"<p>{enrich(text)}</p><p class=\"arn-note\">{art.capitalize()} {kind.lower()} solo's {STEP_NAME[n].lower()} (Running a Solo, Monsters &amp; Treasure). Every rider lasts until the end of the target's next turn.</p>",
                       "source": {"book": "mt", "page": 0}, "kind": "monster",
                       "uses": {"value": 1, "max": 1, "per": "encounter"}, "save": save if dc else "", "dc": dc,
                       "damage": dice, "damageType": dtype, "level": 0, "className": "", "rules": [], "toggle": False,
                       "active": False, "applies": []}
        })
    return out

"""Turn a spell's damage or healing wording into a Foundry roll formula that scales with
@cl (the caster's class level). Returns (formula, type) or ("", "")."""
import re

DT = r"(slashing|piercing|bludgeoning|fire|cold|lightning|thunder|acid|poison|necrotic|radiant|psychic|force)"
WORD = {"two": 2, "three": 3, "four": 4, "five": 5}

def _per(word):
    return WORD.get(word, 1)

def _lv(per):
    return "@cl" if per == 1 else f"floor(@cl/{per})"

def parse(text):
    t = text.replace("–", "-").replace("−", "-")
    heal = re.search(r"\b(Heals|Restores|heals)\b", t)

    def kind(seg):
        i = t.find(seg)
        before = t[max(0, i - 25):i + len(seg)]
        if heal and re.search(r"\b(heal|heals|restores)\b", before, re.I):
            return "healing"
        m = re.search(DT, seg)
        return m.group(1) if m else ""

    # Cantrips: "1d4 ... (+1 die at 5th, 11th and 17th level)"
    m = re.search(r"(\d+)d(\d+)[^.;(]*?\(\+1 die at 5th, 11th and 17th level\)", t)
    if m:
        n, d = int(m.group(1)), m.group(2)
        return f"({n} + floor((@cl + 1) / 6))d{d}", kind(m.group(0))

    # "(1d6+1) ... per level (max 12 levels)"
    m = re.search(r"\((\d+)d(\d+)\s*\+\s*(\d+)\)[^.;]*?per level \(max (\d+) levels\)", t)
    if m:
        d, b, mx = m.group(2), int(m.group(3)), m.group(4)
        return f"(min(@cl, {mx}))d{d} + {b} * min(@cl, {mx})", kind(m.group(0))

    # "1d8 ... plus 1d8 per four levels (max 5d8)"
    m = re.search(r"\b(\d+)d(\d+)[^.;]*?plus 1d\2 per (two|three|four) levels \(max (\d+)d\2\)", t)
    if m:
        n, d, per, mx = int(m.group(1)), m.group(2), _per(m.group(3)), m.group(4)
        return f"(min({n} + {_lv(per)}, {mx}))d{d}", kind(m.group(0))

    # "1d6 ... per (two) level(s) (minimum 4d6, maximum 10d6)" / "(max 10d6)"
    # (Glyph of Warding puts the type after it: "1d8 per two levels thunder damage (max 5d8)".)
    m = re.search(r"\b1d(\d+)\s+(?:\w+\s+){0,3}?(?:damage\s+)?per (two |three |four )?levels?\s*(?:\w+ damage\s*)?\((?:minimum (\d+)d\d+,\s*)?max(?:imum)? (\d+)d\d+\)", t)
    if m:
        d, per, mn, mx = m.group(1), _per((m.group(2) or "").strip()), m.group(3), m.group(4)
        cnt = f"min({_lv(per)}, {mx})"
        cnt = f"max({mn}, {cnt})" if mn else (cnt if per == 1 else f"max(1, {cnt})")
        return f"({cnt})d{d}", kind(m.group(0))

    # "XdY ... plus/+ 1 per (two/three/four) level(s) (max +N)" or "(max 1d6+N)"
    m = re.search(r"\b(\d+d\d+)\s*(?:\w+\s+){0,2}?(?:plus|\+)\s*1 per (two |three |four )?levels?(?:[^.;(]*?)\((?:max(?:imum)? \+?(?:\d+d\d+\+)?(\d+))\)", t)
    if m:
        base, per, mx = m.group(1), _per((m.group(2) or "").strip()), m.group(3)
        return f"{base} + min({_lv(per)}, {mx})", kind(m.group(0))

    # Uncapped "XdY ... plus 1 per (four) levels" with no maximum
    m = re.search(r"\b(\d+d\d+)\s+(?:\w+\s+){0,2}?(?:damage\s+)?plus 1 per (two|three|four) levels(?!\s*\()", t)
    if m:
        return f"{m.group(1)} + {_lv(_per(m.group(2)))}", kind(m.group(0))

    # Uncapped "XdY + 1 per level" (Finger of Death, Wail of the Banshee)
    m = re.search(r"\b(\d+d\d+)\s*\+\s*1 (?:\w+ damage )?per level", t)
    if m:
        return f"{m.group(1)} + @cl", kind(t[m.start():m.end() + 30])

    # Plain "XdY [type] damage" (with an optional flat bonus)
    m = re.search(r"\b(\d+d\d+(?:\s*\+\s*\d+)?)\s+" + DT + r"?\s*damage", t)
    if m and not re.search(r"per (\d+ft|meteor|5ft|10ft|page)", t[m.start():m.end() + 20]):
        return m.group(1).replace(" ", ""), m.group(2) or ""

    # Healing "Heals XdY"
    m = re.search(r"Heals (\d+d\d+(?:\s*\+\s*\d+)?)", t)
    if m:
        return m.group(1).replace(" ", ""), "healing"
    return "", ""

# Spells whose damage is a side effect, a mishap or set per distance fallen or travelled: rolled by hand.
BY_HAND = {"Teleport", "Ethereal Jaunt", "Meld into Stone", "Reverse Gravity", "Earthquake", "Restoration", "Bless Water",
           "Stoneskin", "Shillelagh"}

# Damage the parser cannot read, or reads short, written out from the text. (formula, type, note for the card)
EXPLICIT = {
    # "missiles ... each dealing 1d4+1 force damage. 1 missile per two levels (min 1, max 5)"
    "Magic Missile": ("(max(1, min(floor(@cl/2), 5)))d4 + max(1, min(floor(@cl/2), 5))", "force",
                      "The damage button rolls every missile at one target. Split between targets, each missile deals 1d4+1."),
    # "1 meteor per level (max 10) ... Each target takes 1d4 fire damage per meteor assigned"
    "Melf's Minute Meteors": ("(min(@cl, 10))d4", "fire",
                              "The damage button rolls every meteor at one target. Split between targets, each meteor deals 1d4."),
    # "hitting automatically (no roll) for 1d8 bludgeoning (2d8 if Large)"
    "Animate Objects": ("1d8", "bludgeoning", "One object's hit. A Large object deals 2d8."),
    # "10d6 bludgeoning plus 10d6 fire damage"
    "Meteor Swarm": ("10d6 + 10d6", "", "10d6 bludgeoning plus 10d6 fire. Place one area for each of the four meteors; a creature in two bursts takes the damage once."),
    # "1 red 10d6 fire; 2 orange 10d6 acid; 3 yellow 10d6 lightning; 4 green ... (success 10d6 poison)"
    "Prismatic Spray": ("10d6", "", "Roll d8 for each creature first: red is fire, orange acid, yellow lightning, and green poison on a successful save."),
    # "1d4 piercing damage per 5ft moved through"
    "Spike Growth": ("1d4", "piercing", "The damage button rolls one 5ft of movement: 1d4 for each 5ft moved through the area."),
    # "1d8 piercing damage per 10ft moved (minimum 1d8)"
    "Spike Stones": ("1d8", "piercing", "The damage button rolls one 10ft of movement: 1d8 for each 10ft moved (at least 1d8)."),
    # "2d6 piercing damage per 5ft moved"
    "Wall of Thorns": ("2d6", "piercing", "The damage button rolls one 5ft of movement: 2d6 for each 5ft moved."),
}

# A reminder on the card where the text has a second number the formula can't carry.
NOTES = {
    "Toll the Dead": "The damage button rolls d4s. Against a creature below its maximum HP, roll the same number of d6s instead.",
    "Fire Seeds": "The damage button rolls an acorn (4d8). A berry deals 1d8.",
}

# Mixed damage typed as its first type (half fire, half radiant and so on).
TYPE = {"Fire Shield": "fire", "Chain Lightning": "lightning", "Flame Strike": "fire"}


def for_spell(name, text):
    """(formula, type, note) for a spell on the master list."""
    if name in BY_HAND:
        return "", "", ""
    if name in EXPLICIT:
        return EXPLICIT[name]
    dmg, dtype = parse(text)
    return dmg, TYPE.get(name, dtype), NOTES.get(name, "")


if __name__ == "__main__":
    tests = {
        "Deals 1d4 fire damage (+1 die at 5th, 11th and 17th level).": "(1 + floor((@cl + 1) / 6))d4",
        "Deals 1d3 fire damage plus 1 per level (max +10).": "1d3 + min(@cl, 10)",
        "1d6 fire damage per level (max 10d6); Reflex halves.": "(min(@cl, 10))d6",
        "It takes 1d6 necrotic damage per two levels (minimum 4d6, maximum 10d6).": "(max(4, min(floor(@cl/2), 10)))d6",
        "Deals 1d8 radiant damage plus 1d8 per four levels (max 5d8).": "(min(1 + floor(@cl/4), 5))d8",
        "Heals 1d8 HP plus 1 per level (max +5), up to its maximum HP.": "1d8 + min(@cl, 5)",
        "for (1d6+1) fire damage per level (max 12 levels).": "(min(@cl, 12))d6 + 1 * min(@cl, 12)",
        "1d6 + 1 per three levels force damage (max 1d6+4)": "1d6 + min(floor(@cl/3), 4)",
        "takes 3d6 + 1 necrotic damage per level instead": "3d6 + @cl",
        "Each ray deals 2d6 fire damage.": "2d6",
        "it deals 1d6 force damage per level (max 10d6)": "(min(@cl, 10))d6",
        "dealing 1d8 per two levels thunder damage (max 5d8) in a 5ft radius": "(max(1, min(floor(@cl/2), 5)))d8",
    }
    for s, want in tests.items():
        got = parse(s)[0]
        print("OK " if got == want else "XX ", repr(got), "want", repr(want))

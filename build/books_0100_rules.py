"""The books v0.10.0 (20 October 2026), mirrored into the Rules journals (Books I, II, IV and V).

The journals were built from the v0.9.9 books. This step swaps each passage that changed in v0.10.0 for the new
book wording, de-hyphenated and with page numbers dropped as the journals already do. Every edit names the old text
it expects: if neither the old nor the new text is on the page, it is reported as a miss rather than skipped quietly.
Running it twice changes nothing the second time.
"""
import glob, json, os, re
import lib

OUT = lib.OUT


def _each(pack, folders=False):
    for f in glob.glob(os.path.join(OUT, pack, "*.json")):
        d = json.load(open(f))
        if folders or "pages" in d:
            yield f, d


def _save(f, d):
    json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)


# Journal name prefixes.
B1, B2, B4, B5 = "Book I:", "Book II:", "Book IV:", "Book V:"

# (journal, page, old, new): the new text replaces the old once on that page. Where new contains old (an added
# sentence), the presence of new marks the edit as already made.
EDITS = [
    # Book I, XP carries over (PHB Advancement and How Levels Are Awarded).
    (B1, "Advancement",
     "you spend it to gain that level and start again from 0 (see How Levels Are Awarded).",
     "you spend it to gain that level and carry anything left over towards the next (see How Levels Are Awarded)."),
    (B1, "How Levels Are Awarded",
     "Your XP stops at that rate until you spend it, and each level you gain resets it to 0.",
     "When you gain a level, XP beyond its cost carries over towards the next, but a single award never gives you more "
     "than one level: anything past 1 short of the next level is lost."),
    # Going further over the carrying limit costs more speed.
    (B1, "Quick Reference",
     "Over the limit, speed is reduced by 10ft and you have Disadvantage on Dexterity checks and attack rolls.",
     "Over the limit, speed drops by 10ft or more and you have Disadvantage on Dexterity checks and attack rolls "
     "(see Over the Limit)."),
    (B1, "Inventory & Carrying Capacity",
     "your speed is reduced by 10ft and you have Disadvantage on Dexterity checks and attack rolls.",
     "your speed drops 10ft at 1 to 4 slots over, 20ft at 5 to 9 over, and a further 10ft for every 5 slots beyond "
     "that, to a minimum of 0, applied after anything that halves speed. You also have Disadvantage on Dexterity "
     "checks and attack rolls."),
    # "Many editions" cut to one line.
    (B1, "No Training Required to Level Up",
     "<p>Many editions require a character to train before gaining a level.</p><ul><li>Arneyan ignores that rule. It is "
     "implied a character trains off-screen while also gaining experience in the field. See Advancement at the front of "
     "this book for how levels are awarded.</li></ul>",
     "<p>You need no training to gain a level (see Advancement at the front of this book).</p>"),
    # Attacks of Opportunity only from Combat Reflexes or a monster ability; reactions only for features that say so.
    (B1, "Actions & Turns",
     "<strong>Attack of Opportunity. </strong>A creature that leaves an enemy's melee reach without Disengaging "
     "provokes one melee attack from that enemy.",
     "<strong>Attack of Opportunity. </strong>Only a creature with a feature that grants one (Combat Reflexes, or a "
     "monster ability that says so) makes Attacks of Opportunity; the feature says what provokes it, and Disengaging "
     "always prevents it."),
    (B1, "Actions & Turns",
     "<strong>Reactions. </strong>Each creature can answer one trigger per round (an Attack of Opportunity or another "
     "feature that responds to a trigger), regained at the start of its turn. A feature that gives extra reactions says "
     "so, and those extras can only be used for that feature (the Swashbuckler's Second Flourish). Combat Reflexes also "
     "lets its holder attack a creature that moves past it.",
     "<strong>Reactions. </strong>Only a feature that says it is a reaction (a class, kit or feat feature, or a monster "
     "ability) can be used out of turn: once per round unless it says otherwise, regained at the start of your turn. "
     "Anything that stops reactions (Surprised, Incapacitated) stops these. A feature that gives extra reactions says "
     "so, and those extras can only be used for that feature (the Swashbuckler's Second Flourish)."),
    # Range and long range (the book adds this bullet after Shooting into melee).
    (B1, "Ranged Attacks",
     "<li><strong>Shooting into melee.</strong> A ranged attack against a target engaged in melee with an ally has "
     "Disadvantage.</li>",
     "<li><strong>Shooting into melee.</strong> A ranged attack against a target engaged in melee with an ally has "
     "Disadvantage.</li><li><strong>Range.</strong> Up to a weapon's listed range, attack normally. Up to twice that "
     "range, attack with Disadvantage. Beyond it, you cannot attack. Where a weapon lists two ranges (60–200 ft), the "
     "second is its long range. Melee reach is 5ft, or 10ft with Reach.</li>"),
    # Burning stacks.
    (B1, "Conditions",
     "On fire. Takes 1d6 fire damage at the start of each of its turns. Sources",
     "On fire. Takes 1d6 fire damage at the start of each of its turns, and 1d6 more for each time it is set alight "
     "again (Burning 2 deals 2d6). Sources"),
    (B1, "Conditions", "<td>Until doused. An action", "<td>Until doused, which ends it all. An action"),
    # Turned defined (in the Frightened entry).
    (B1, "Conditions",
     "drops anything it holds if it is told to.</td>",
     "drops anything it holds if it is told to. Turned (Turn Undead) is Frightened of the turner and must also spend "
     "its turns moving away from it; it lasts 1 minute or until the turner attacks it.</td>"),
    # A subdual knockout stays down until subdual falls below current HP.
    (B1, "Conditions",
     "Damage or an ally's action (shaking it awake) rouses a creature put to sleep or knocked out by subdual damage; a "
     "creature below 0 HP is dying instead",
     "Damage or an ally's action (shaking it awake) rouses a sleeping creature. A creature knocked out by subdual "
     "damage stays down until its subdual damage falls below its current HP; a creature below 0 HP is dying instead"),
    (B1, "Conditions",
     "Damage or an ally's action rouses sleep and subdual unconsciousness; Smelling Salts;",
     "Damage or an ally's action rouses sleep; subdual unconsciousness ends when subdual damage falls below current HP; "
     "Smelling Salts;"),
    # Timed conditions count down at the end of the creature's own turn; reapplying keeps the longer duration.
    (B1, "Conditions",
     "and the Quick Recovery feat (see Character Creation).</li>",
     "and the Quick Recovery feat (see Character Creation). Timed conditions count down at the end of the creature's "
     "own turn and end at 0. Applying a timed condition again keeps the longer duration; it does not add.</li>"),
    # Firearms training from your 1st-level class.
    (B1, "Firearms",
     "<strong>Fully trained by default: </strong>Gunslinger, Fighter, Ranger, and Tenor Hold dwarves of any class.",
     "<strong>Fully trained by default: </strong>characters whose 1st-level class is Gunslinger, Fighter or Ranger, and "
     "Tenor Hold dwarves of any class."),
    # Subdual healing.
    (B1, "Non-Lethal (Subdual) Damage",
     "they fall unconscious rather than dying.</li>",
     "they fall unconscious rather than dying. Subdual damage heals at 1 point per hour of rest, and all of it after a "
     "full rest; magical healing removes as much subdual damage as the HP it restores.</li>"),
    # Light for lamps.
    (B1, "Vision & Light", "candle 5ft / +5ft; torch 20ft", "candle 5ft / +5ft; lamp 15ft / +30ft; torch 20ft"),
    (B1, "Vision & Light", "and a lantern for 6 hours per pint of oil.", "and a lamp or lantern for 6 hours per pint of oil."),
    # Hexes are 6 miles; a day's water is half a gallon.
    (B1, "Travelling Rules",
     "Measured in Hexes per Day, modified for Arneyan's larger landmass.",
     "Measured in Hexes per Day (a hex is 6 miles across), modified for Arneyan's larger landmass."),
    (B1, "Travelling Rules",
     "and a day's water per day of travel.</li>",
     "and a day's water per day of travel. A day's water is ½ gallon, one full personal canteen.</li>"),

    # Book II, the Human's Knack and extra Feat.
    (B2, "Full Ancestry Reference",
     "<li><strong>Choose one skill at creation; you have Advantage on checks with it. This is not a Proficiency tier and "
     "does not take an NWP slot.</strong></li><li><strong>Gains an additional Feat from the General Path</strong> (The "
     "Survivors) at 1st level, on top of their normal 1st-level Feat choice.</li>",
     "<li><strong>Choose one skill at creation; you have Advantage on checks with it. This is not a Proficiency tier and "
     "does not take an NWP slot.</strong> It keeps its Advantage if you later train or master the skill.</li><li><strong>"
     "Gains an additional Feat from the General Path</strong> (The Survivors) at 1st level, on top of their normal "
     "1st-level Feat choice. It follows the usual prerequisites, and can't be a Feat you already have.</li>"),
    # A creation feat's points over 18 move to another attribute.
    (B2, "3. Starting Scores",
     "If your ancestry bonus would take a score above 18,",
     "If your ancestry bonus, or an attribute bonus from a feat taken at creation (such as Steady Hand), would take a "
     "score above 18,"),
    # XP carries over.
    (B2, "Experience by Class",
     "spend it to gain a level and start again from 0.",
     "spend it to gain a level; anything left over carries towards the next, but one award never gives more than one "
     "level."),
    (B2, "Mechanical Resolution",
     "Spend it all to gain one level in any of your classes, a new one included with the GM's approval, and start again "
     "from 0.",
     "Spend a level's cost to gain one level in any of your classes, a new one included with the GM's approval; "
     "anything left over carries towards the next."),
    (B2, "Carrying It All — The Inventory Grid",
     "your speed is reduced by 10ft and you have Disadvantage on Dexterity checks and attack rolls.",
     "your speed drops 10ft at 1 to 4 slots over, 20ft at 5 to 9 over, and a further 10ft for every 5 slots beyond "
     "that, to a minimum of 0, applied after anything that halves speed. You also have Disadvantage on Dexterity "
     "checks and attack rolls."),

    # Book IV, save for half on damage spells.
    (B4, "Components, Saves & Rituals",
     "the normal form allows none.</li>",
     "the normal form allows none. A damage spell with a save deals half damage on a success unless its entry says the "
     "save negates.</li>"),

    # Book V, light for lamps and lanterns.
    (B5, "Illuminations",
     "<p><em>Lamps, lanterns, fuels, and optical nocturnal systems.</em></p>",
     "<p><em>Lamps, lanterns, fuels, and optical nocturnal systems.</em></p><p>Light (bright, then dim to): candle 5ft, "
     "dim to 10ft, 1 hour; torch 20ft, dim to 40ft, 1 hour; lamp 15ft, dim to 45ft, 6 hours per pint; hooded lantern "
     "30ft, dim to 60ft, 6 hours per pint; bullseye lantern a 60ft cone, dim to 120ft, 6 hours per pint. A variant gives "
     "the light of its type.</p>"),
    # Cold iron, mithral and Nalwood.
    (B5, "Alchemist's & Healer's Goods",
     "counts as adamantine against creatures that resist other weapons, and deals double damage to objects.</p>",
     "counts as adamantine against creatures that resist other weapons, and deals double damage to objects.</p><p><strong>"
     "Cold iron, mithral and Nalwood.</strong> A cold iron weapon [Uncommon] costs twice the base weapon and counts as "
     "cold iron against fey and fiends that cold iron harms. Adamantine armour [Rare] costs 500 gp more than the base "
     "armour and turns critical hits against its wearer into normal hits. Mithral armour [Rare] costs 1,000 gp more and "
     "counts as one weight class lighter (Heavy as Medium, Medium as Light). Nalwood is black-barked and half-alive, and "
     "its presence frays the Weave: a creature wounded by a Nalwood weapon [Rare, 500 gp more than the base weapon] has "
     "Disadvantage on its next concentration save. Nalwood is not magic, and treated Nalwood does not burn. Tenor dwarven "
     "steel is fine steel, not a special material.</p>"),
    # Iconic blades shed light in a radius.
    (B5, "Magic Items",
     "+1d6 fire damage on a hit and light 20ft.",
     "+1d6 fire damage on a hit, and it sheds bright light in a 20ft radius."),
    (B5, "Magic Items",
     "+1d8 radiant against undead, and light 15ft.",
     "+1d8 radiant against undead, and it sheds bright light in a 20ft radius."),
    # Warpony and light warhorse have Hit Dice.
    (B5, "General Adventuring Basics",
     "barding adds its AC bonus.</em></p>",
     "barding adds its AC bonus. The warpony and light warhorse show their Hit Dice: a Divine Mount has their maximum "
     "(18 and 24 HP).</em></p>"),
    (B5, "General Adventuring Basics",
     "<tr><td>Warpony</td><td>100 gp</td><td>40 ft</td><td>14 slots</td><td>13</td>",
     "<tr><td>Warpony</td><td>100 gp</td><td>40 ft</td><td>14 slots</td><td>11 (2d8+2)</td>"),
    (B5, "General Adventuring Basics",
     "<tr><td>Warhorse, Light</td><td>150 gp</td><td>60 ft</td><td>18 slots</td><td>19</td>",
     "<tr><td>Warhorse, Light</td><td>150 gp</td><td>60 ft</td><td>18 slots</td><td>15 (2d10+4)</td>"),
    # Two-handed weapons.
    (B5, "Melee Weapons",
     "polearms, and other long/bulky weapons (marked with †).</em></p>",
     "polearms, and other long/bulky weapons (marked with †). A Two-handed weapon needs both hands to attack; Versatile "
     "weapons can be used either way. The Trident is bulky but one-handed, and a Lance is one-handed when mounted.</em></p>"),
]

# Spell components priced as a range say what the range is (Priests' Alcove): item, its size and price.
BY_QUALITY = [
    ("Iron / Lead / Mercury / Steel", "Var. — 2 cp – 1 sp"),
    ("Platinum (Chunk, Coin, Die, Mirror, Tissue, Wire)", "Var. — 5 gp – 40 gp"),
    ("Silver (Chunk, Die, Mirror, Wire)", "Var. — 3 sp – 3 gp"),
    ("Feldspar / Glass beads / Lodestone / Obsidian / Quartz", "Var. — 2 cp – 1 gp"),
    ("Sulphur / Volcanic Ash / Stalactite", "Var. — 4 cp – 1 sp"),
    ("Eelskin / Fish scale / Leather thong / Ox sinew", "Var. — 2 cp – 5 cp"),
    ("Feathers (Chicken, Eagle, Hawk, Vulture)", "Var. — 3 cp – 1 gp"),
    ("Frog's leg (dried) / Mouse or Rat whiskers", "Var. — 3 cp – 5 cp"),
    ("Vellum / Wax (Common, White)", "Var. — 5 gp / 3 gp – 4 gp"),
    ("Acorns / Flower Buds / Leaves (Ash, Oak, Yew, etc.)", "Var. — 2 cp – 1 sp"),
]
for _item, _price in BY_QUALITY:
    EDITS.append((B5, "Priests' Alcove", f"<strong>{_item}:</strong> {_price}<strong>",
                  f"<strong>{_item}:</strong> {_price} (by quality)<strong>"))

# The Catalogue's melee weapons tagged Two-handed: name as the journal shows it (rarity tag aside) and the new traits.
TWO_HANDED = {
    "Hook, Hafted †": "Two-handed, Finesse",
    "Pike †": "Two-handed, Reach, Brace",
    "Fauchard †": "Two-handed, Reach, Entangling",
    "Lance, Light †": "Two-handed on foot, Reach, Brace",
    "Ranseur †": "Two-handed, Reach, Entangling",
    "Voulge †": "Two-handed, Reach",
    "Glaive †": "Two-handed, Reach, Cleaving",
    "Fork, Military †": "Two-handed, Reach, Entangling",
    "Lance, Heavy †": "Two-handed on foot, Reach, Brace",
    "Guisarme †": "Two-handed, Reach, Entangling",
    "Halberd †": "Two-handed, Reach",
    "Partisan †": "Two-handed, Reach",
    "Club, Great †": "Two-handed",
    "Maul †": "Two-handed, Sunder",
    "Bec De Corbin †": "Two-handed, Sunder",
    "Bill/Billhook †": "Two-handed, Finesse, Reach, Cleaving",
    "Glaive Guisarme †": "Two-handed, Reach, Cleaving, Entangling",
    "Godentag †": "Two-handed, Reach, Cleaving",
    "Bardiche †": "Two-handed, Reach, Cleaving",
    "Fauchard Fork †": "Two-handed, Reach, Entangling",
    "Scythe †": "Two-handed, Reach, Cleaving",
    "Axe, Two-Handed †": "Two-handed, Heavy, Thrown, Cleaving",
    "Greatsword †": "Two-handed, Heavy",
    "Man Catcher †": "Two-handed, Reach, Entangling",
    "Sword, Great Scimitar †": "Two-handed, Heavy, Cleaving",
    "Lucerne Hammer †": "Two-handed, Sunder, Reach",
    "Sleeve Tangler †": "Two-handed, Reach, Entangling",
}
ROW = re.compile(r"<tr><td>([^<]*)</td>((?:<td>[^<]*</td>){4})<td>([^<]*)</td></tr>")


def _old_traits(new):
    """The v0.9.9 traits: the new ones without the Two-handed tag."""
    rest = re.sub(r"^Two-handed(?: on foot)?(?:, |$)", "", new)
    return rest or "—"


def _two_handed(s, miss):
    """Tag the Two-handed weapons in the Melee Weapons table; returns (html, rows changed)."""
    seen, k = set(), 0

    def sub(m):
        nonlocal k
        name = re.sub(r"\s*\[[^\]]+\]$", "", m.group(1)).strip()
        if name not in TWO_HANDED:
            return m.group(0)
        seen.add(name)
        new, cur = TWO_HANDED[name], m.group(3)
        if cur == new:
            return m.group(0)
        if cur != _old_traits(new):
            miss.append(f"Melee Weapons: {name} traits are '{cur}', expected '{_old_traits(new)}'")
            return m.group(0)
        k += 1
        return f"<tr><td>{m.group(1)}</td>{m.group(2)}<td>{new}</td></tr>"

    s = ROW.sub(sub, s)
    for name in TWO_HANDED:
        if name not in seen:
            miss.append(f"Melee Weapons: no row for {name}")
    return s, k


def build():
    n = {"edits": 0, "already": 0, "two_handed": 0, "pages": 0, "missed": 0}
    miss, done = [], set()
    for f, d in _each("rules"):
        jname = d.get("name", "")
        changed = False
        for p in d["pages"]:
            s = (p.get("text") or {}).get("content") or ""
            s0 = s
            for i, (jn, page, old, new) in enumerate(EDITS):
                if not jname.startswith(jn + " ") or p.get("name") != page:
                    continue
                done.add(i)
                if new in s:
                    n["already"] += 1
                elif s.count(old) == 1:
                    s = s.replace(old, new)
                    n["edits"] += 1
                elif old in s:
                    miss.append(f"{jname} / {page}: old text occurs {s.count(old)} times: {old[:80]}")
                else:
                    miss.append(f"{jname} / {page}: not found: {old[:80]}")
            if jname.startswith(B5 + " ") and p.get("name") == "Melee Weapons":
                s, k = _two_handed(s, miss)
                n["two_handed"] += k
            if s != s0:
                p["text"]["content"] = s
                n["pages"] += 1
                changed = True
        if changed:
            _save(f, d)
    for i, (jn, page, old, new) in enumerate(EDITS):
        if i not in done:
            miss.append(f"{jn} / {page}: page not found")
    n["missed"] = len(miss)
    for m in miss:
        print("books_0100_rules: MISSED", m)
    return n

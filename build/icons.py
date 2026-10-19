"""Pick a game-icons.net glyph for each document. SVGs are written later by make_icons.mjs."""
import json, os, re

USED = {}  # filename -> (glyph, palette)

PALETTES = {
    "weapon": ("#3a1f17", "#e8c27a"), "armour": ("#1f2a33", "#d9dde2"), "shield": ("#1f2a33", "#d9dde2"),
    "gear": ("#2b2418", "#e9dcc0"), "magic": ("#22163a", "#c9a7ff"), "spell": ("#13263a", "#9fd3ff"),
    "feat": ("#1A3320", "#e8c27a"), "skill": ("#2D5A27", "#f1ead6"), "ancestry": ("#3a2a17", "#f1ead6"),
    "kit": ("#1A3320", "#f1ead6"), "monster": ("#2a1414", "#f0b9a4"), "rule": ("#1A3320", "#f1ead6"), "action": ("#3a2a17", "#e8c27a"), "form": ("#2b2418", "#d8c7f0"), "place": ("#2b2418", "#e8c27a")
}

WEAPON = [
    (r"bow|crossbow", "high-shot"), (r"crossbow", "crossbow"), (r"sling", "sling"), (r"dart", "dart"),
    (r"javelin|spear|pike|lance|trident|harpoon|partisan|ranseur|spetum|fork|glaive|halberd|bill|guisarme|voulge|polearm", "spear-hook"),
    (r"axe|hatchet|cleaver", "battle-axe"), (r"hammer|maul|mallet", "warhammer"), (r"mace|morning|flail|club|cudgel", "flanged-mace"),
    (r"dagger|dirk|knife|stiletto|katar", "plain-dagger"), (r"rapier|estoc|foil", "sparkling-sabre"), (r"scimitar|sabre|falchion|cutlass|khopesh|sickle|scythe", "saber-slash"),
    (r"greatsword|two-handed sword|claymore|zweihander|bastard", "relic-blade"), (r"sword|blade|broadsword", "broadsword"),
    (r"staff", "wizard-staff"), (r"whip|cat-o", "whip"), (r"net|bolas", "fishing-net"), (r"knuckle|cestus|fist|gauntlet", "fist"),
    (r"pistol|derringer|gun|rifle|musket|carbine|cannon|blunderbuss", "pistol-gun"), (r"sap|blowpipe", "flute"), (r"pick", "war-pick")
]
ARMOUR = [(r"plate", "breastplate"), (r"chain|mail|ring", "chain-mail"), (r"leather|hide|padded|cuir|laminar|studded", "leather-armor"),
          (r"scale|brigandine|splint|banded|coat of plates|ensemble", "lamellar"), (r"breastplate", "breastplate")]
SHIELD = [(r"buckler", "round-shield"), (r"tower|pavis", "bordered-shield"), (r"steel", "checked-shield"), (r"", "shield")]
GEAR = [
    (r"potion|elixir|tonic|draught|philter", "potion-ball"), (r"oil|poison|venom|toxin", "poison-bottle"), (r"scroll", "scroll-unfurled"),
    (r"book|tome|spellbook|journal|ledger|paper|ink|quill|parchment|writing", "book-cover"), (r"ring", "ring"), (r"wand", "fairy-wand"),
    (r"rod", "lightning-trio"), (r"staff", "wizard-staff"), (r"cloak|robe|cape", "cape"), (r"boot|shoe|sandal", "boots"),
    (r"glove|gauntlet", "gloves"), (r"amulet|necklace|pendant|periapt|talisman", "gem-pendant"), (r"gem|jewel|stone|crystal|pearl", "cut-diamond"),
    (r"lamp|lantern|candle|torch|light|illumin", "lantern-flame"), (r"rope|chain|cord|binding|line", "rope-coil"), (r"tent|bedroll|blanket|camp", "camping-tent"),
    (r"bread|cheese|food|ration|larder|meat|fruit", "bread"), (r"wine|ale|beer|cider|mead|spirit|brew", "beer-stein"), (r"lute|harp|flute|drum|horn|instrument|pipe|fiddle|lyre|bagpipe|music|bard", "lyre"),
    (r"lock|pick|thiev|key", "lockpicks"), (r"hammer|tool|kit|saw|chisel|labour|joiner|farmer|carpent", "toolbox"), (r"incense|holy|prayer|relic|liturg|priest", "holy-symbol"),
    (r"bag|sack|pouch|pack|backpack|chest|box|case|container|barrel|basket|frame", "knapsack"), (r"bottle|vial|flask|jar|jug|component|liquid", "round-bottom-flask"),
    (r"clothing|clothes|hat|shirt|dress|coat|tunic|trouser", "shirt"), (r"toy|game|dice|card|diversion", "dice-six-faces-five"),
    (r"climb|piton|grapple|mountain", "mountain-climbing"), (r"boat|sleigh|sled|ski|transport|wagon|cart", "wooden-crate"),
    (r"mirror|glass|lens", "magnifying-glass"), (r"animal|cage|snare|trap|fish", "fishing-hook"), (r"", "swap-bag")
]
SCHOOL = {"abjuration": "magic-shield", "conjuration": "magic-portal", "divination": "third-eye", "enchantment": "charm",
          "evocation": "fire-ray", "illusion": "domino-mask", "necromancy": "death-skull", "transmutation": "transform",
          "divine": "holy-symbol", "nature": "oak-leaf", "elemental": "fire-dash", "shadow": "shadow-follower"}
FEAT = {"General Path": "laurels", "Martial Path": "crossed-swords", "Specialist Path": "target-arrows", "Arcane & Devout Path": "spell-book"}
SKILL = {"str": "biceps", "dex": "juggler", "con": "heart-plus", "int": "brain", "wis": "owl", "cha": "drama-masks"}
KIT_CLASS = {"Archer": "bowman", "Artificer": "gears", "Assassin": "hood", "Barbarian": "barbarian", "Bard": "lyre",
             "Cleric": "holy-symbol", "Druid": "oak-leaf", "Fighter": "swordman", "Gunslinger": "pistol-gun", "Illusionist": "domino-mask",
             "Knight": "visored-helm", "Magus": "sword-spin", "Monk": "fist", "Necromancer": "death-skull", "Paladin": "shield-reflect",
             "Ranger": "bow-arrow", "Rogue": "cloak-dagger", "Sorcerer": "fire-spell-cast", "Swashbuckler": "sparkling-sabre",
             "Warlock": "pentacle", "Witch": "witch-flight", "Wizard": "wizard-face"}

def _pick(table, name):
    for pat, glyph in table:
        if re.search(pat, name, re.I):
            return glyph
    return table[-1][1]

def icon(kind, name="", extra=""):
    if kind == "weapon":
        glyph = _pick(WEAPON, name)
        if re.search(r"crossbow", name, re.I):
            glyph = "crossbow"
    elif kind == "armour":
        glyph = _pick(ARMOUR + [(r"", "leather-armor")], name)
    elif kind == "shield":
        glyph = _pick(SHIELD, name)
    elif kind in ("gear", "magic"):
        glyph = _pick(GEAR, name)
    elif kind == "spell":
        glyph = SCHOOL.get(name.lower().strip(), "magic-swirl")
    elif kind == "feat":
        glyph = FEAT.get(name, "laurels")
    elif kind == "skill":
        glyph = SKILL.get(name, "skills")
    elif kind == "ancestry":
        glyph = "person"
    elif kind == "kit":
        glyph = KIT_CLASS.get(name, "rank-3")
    else:
        glyph = name or "perspective-dice-six-faces-random"
    fn = f"{kind}-{glyph}.svg"
    USED[fn] = (glyph, PALETTES.get(kind, PALETTES["gear"]))
    return f"systems/arneyan/assets/icons/{fn}"

def kit_icon(cls, kit):
    return icon("kit", cls)

def save(path):
    with open(path, "w") as f:
        json.dump(USED, f, indent=1)

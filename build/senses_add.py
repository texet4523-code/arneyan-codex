"""Senses the M&T stat blocks leave out, added at Kieran's request (19 Oct 2026): each monster's D&D 5e senses
where it has an entry there, otherwise a default for its type. Only monsters with no senses at all get these.
Kieran approves the list on the Feature Board; it also goes to the book chat for the M&T."""

import re

D60, D120 = "Darkvision 60ft", "Darkvision 120ft"

BY_NAME = {
    # Beasts
    "Bat": ["Blindsight 60ft"], "Bat Swarm": ["Blindsight 60ft"], "Giant Bat": ["Blindsight 60ft"],
    "Beetle Swarm": ["Blindsight 10ft"], "Centipede Swarm": ["Blindsight 10ft"], "Insect Swarm": ["Blindsight 10ft"],
    "Spider Swarm": ["Blindsight 10ft"], "Wasp Swarm": ["Blindsight 10ft"],
    "Cave Bear": [D60], "Badger": ["Darkvision 30ft"], "Giant Badger": ["Darkvision 30ft"],
    "Constrictor Snake": ["Blindsight 10ft"], "Giant Snake": ["Blindsight 10ft"], "Poisonous Snake": ["Blindsight 10ft"],
    "Giant Poisonous Snake": ["Blindsight 10ft"], "Poisonous Snake Swarm": ["Blindsight 10ft"],
    "Crab": ["Blindsight 30ft"], "Giant Crab": ["Blindsight 30ft"], "Giant Fire Beetle": ["Blindsight 30ft"],
    "Giant Centipede": ["Blindsight 30ft"], "Giant Frog": ["Darkvision 30ft"], "Giant Toad": ["Darkvision 30ft"], "Toad": ["Darkvision 30ft"],
    "Giant Lizard": ["Darkvision 30ft"], "Lizard": ["Darkvision 30ft"], "Giant Octopus": [D60], "Octopus": ["Darkvision 30ft"],
    "Giant Rat": [D60], "Rat": ["Darkvision 30ft"], "Rat Swarm": ["Darkvision 30ft"],
    "Giant Scorpion": ["Blindsight 60ft"], "Scorpion": ["Blindsight 10ft"],
    "Giant Shark": ["Blindsight 60ft"], "Hunter Shark": ["Blindsight 30ft"], "Reef Shark": ["Blindsight 30ft"], "Killer Whale": ["Blindsight 120ft"],
    "Giant Spider": ["Blindsight 10ft", D60], "Giant Wolf Spider": ["Blindsight 10ft", D60], "Spider": ["Darkvision 30ft"],
    "Giant Weasel": [D60], "Owl": [D120], "Quipper": [D60], "Quipper Swarm": [D60], "Tiger": [D60],
    # Monstrosities
    "Abominable Yeti": [D60], "Yeti": [D60], "Ankheg": [D60, "Tremorsense 60ft"], "Behir": ["Darkvision 90ft"], "Chimera": [D60],
    "Cockatrice": [D60], "Darkmantle": ["Blindsight 60ft"], "Death Dog": [D120], "Displacer Beast": [D60], "Doppelganger": [D60],
    "Ettercap": [D60], "Gargoyle": [D60], "Gorgon": [D60], "Guardian Naga": [D60], "Hook Horror": ["Blindsight 60ft", D120],
    "Hydra": [D60], "Kraken": ["Truesight 120ft"], "Lamia": [D60], "Manticore": [D60], "Medusa": [D60], "Merrow": [D60],
    "Mimic": [D60], "Minotaur": [D60], "Owlbear": [D60], "Phase Spider": [D60], "Piercer": ["Blindsight 30ft", D60],
    "Purple Worm": ["Blindsight 30ft", "Tremorsense 60ft"], "Remorhaz": [D60, "Tremorsense 60ft"], "Roper": [D60],
    "Rust Monster": [D60], "Sphinx": ["Truesight 120ft"], "Tarrasque": ["Blindsight 120ft"], "Umber Hulk": [D120, "Tremorsense 60ft"], "Worg": [D60],
    # Humanoids
    "Grimlock": ["Blindsight 30ft"],
    # Aberrations (others: 120ft)
    "Chuul": [D60], "Cloaker": [D60], "Flumph": [D60], "Slaad Tadpole": [D60], "Star Spawn Grue": [D60], "Star Spawn Hulk": [D60],
    # Undead (others: 60ft)
    "Lich": ["Truesight 120ft"], "Demilich": ["Truesight 120ft"], "Vampire": [D120], "Death Knight": [D120], "Bodak": [D120],
    "Death Tyrant": [D120], "Dracolich": ["Blindsight 60ft", D120], "Crawling Claw": ["Blindsight 30ft"], "Will-o'-Wisp": [D120],
    # Constructs (others: 60ft)
    "Animated Armour": ["Blindsight 60ft"], "Flying Sword": ["Blindsight 60ft"], "Rug of Smothering": ["Blindsight 60ft"],
    "Iron Golem": [D120], "Stone Golem": [D120], "Shield Guardian": ["Blindsight 10ft", D60],
    "Modron, Duodrone": ["Truesight 120ft"], "Modron, Monodrone": ["Truesight 120ft"], "Modron, Pentadrone": ["Truesight 120ft"],
    "Modron, Quadrone": ["Truesight 120ft"], "Modron, Tridrone": ["Truesight 120ft"],
    # Elementals (others: 60ft)
    "Earth Elemental": [D60, "Tremorsense 60ft"], "Water Weird": ["Blindsight 30ft"],
    "Dao": [D120], "Djinni": [D120], "Efreeti": [D120], "Marid": [D120],
    # Plants (only those that sense)
    "Assassin Vine": ["Blindsight 30ft"], "Gas Spore": ["Blindsight 150ft"], "Myconid": [D120], "Myconid Sovereign": [D120],
    "Myconid Sprout": [D120], "Needle Blight": ["Blindsight 60ft"], "Twig Blight": ["Blindsight 60ft"], "Vine Blight": ["Blindsight 60ft"],
    "Shambling Mound": ["Blindsight 60ft"], "Shrieker": ["Blindsight 30ft"], "Violet Fungus": ["Blindsight 30ft"], "Spore Servant": ["Blindsight 30ft"],
    # Others
    "Wyvern": [D60], "Lemure": [D120], "Couatl": ["Truesight 120ft"], "Deva": [D120], "Planetar": ["Truesight 120ft"],
    "Dryad": [D60], "Sea Hag": [D60],
}

BY_TYPE = {"undead": [D60], "construct": [D60], "elemental": [D60], "fiend": [D120], "aberration": [D120], "ooze": ["Blindsight 60ft"], "dragon": [D60]}


def added_senses(name, type_word):
    return list(BY_NAME.get(name) or BY_TYPE.get(type_word, []))


DRAGON_AGE = {"wyrmling": 10, "young": 30, "adult": 60, "ancient": 60}


def dragon_blindsight(name, senses):
    """True dragons: D&D 5e (and Kanka) give them Blindsight (10ft wyrmling, 30ft young, 60ft adult and ancient),
    which the M&T leaves out. Added only when the block has no Blindsight already."""
    # "Red Dragon, Adult", "Gold Dragon, Wyrmling" (also "Adult Red Dragon").
    m = re.search(r"\bdragon, (wyrmling|young|adult|ancient)$", name, re.I) or re.match(r"(wyrmling|young|adult|ancient)\b.*\bdragon$", name, re.I)
    if not m or any("blindsight" in s.lower() for s in senses):
        return []
    age = m.group(1).lower()
    return [f"Blindsight {DRAGON_AGE[age]}ft"]


# Kieran (board, 19 Oct 2026): vision goes by D&D 5e, not Kanka. Monsters with a 5e SRD stat block (the dnd5e
# system's SRD, 2014 first, then 2024) take its Darkvision, Blindsight, Tremorsense and Truesight; their other
# senses (Low-Light Vision, Scent...) stay unless 5e gives Darkvision. Monsters with no 5e block keep the M&T's.
import json as _json, os as _os
FIVE_E = _json.load(open(_os.path.join(_os.path.dirname(__file__), "data", "senses_5e.json")))
VISION = ("darkvision", "blindsight", "tremorsense", "truesight")
CHANGED_5E = {}


def five_e_key(name):
    n = name.lower()
    m = re.match(r"(.+?), (adult|young|ancient|wyrmling)$", n)
    return f"{m.group(2)} {m.group(1)}" if m else n


def match_5e(name, senses):
    v = FIVE_E.get(five_e_key(name))
    if v is None:
        return senses
    keep = [s for s in senses if not any(w in s.lower() for w in VISION)]
    if v.get("darkvision"):
        keep = [s for s in keep if not re.search(r"low[- ]?light", s, re.I)]
    new = [f"{k.capitalize()} {v[k]}ft" for k in ("blindsight", "darkvision", "tremorsense", "truesight") if v.get(k)] + keep
    if sorted(new) != sorted(senses):
        CHANGED_5E[name] = (list(senses), new)
    return new

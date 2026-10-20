"""What a spell's save does, for the chat card's "On a save: ..." line and for applying damage by saves.

The words matter to the system:
- chat.mjs (apply by saves): "negat" anywhere means no damage on a save, "full damage" means the save does not reduce
  the damage, anything else is half damage. So a half-damage line never says "negates".
- areas.mjs (lingering areas): "half" offers a half-damage button for a creature that saved.

Read from the spell's own text (Spellcasting in Arneyan v2 and the Handbook v0.9.9 Master Spell List, which match),
with the readings the plain parser would get wrong written out below."""
import re

# Spells whose Save column is "—" in both books, though the text names a save.
SAVE_ADD = {"Forcecage": "ref", "Polymorph": "will", "Mislead": "will", "Dispel Magic": "will"}

EFFECT = {
    # Illusions: a save sees through them.
    "Minor Illusion": "Sees through it",
    "Silent Image": "Sees through it",
    "Improved Phantasmal Force": "Sees through it",
    "Spectral Force": "Sees through it",
    "Hallucinatory Terrain": "Sees through it",
    "Permanent Image": "Sees through it",
    "Veil": "Sees through it",
    "Mislead": "Sees through the double",
    "Shadow Monsters": "Sees through it and takes no damage from it",
    "Shadow Magic": "Sees through it and is unaffected",
    "Greater Shadow Magic": "Sees through it and is unaffected",
    # The save covers part of the spell only.
    "Compelled Duel": "Keeps moving (it saves each time it tries to move more than 30ft from you)",
    "Invisibility to Undead": "Negates (undead of Intelligence 3 or more only)",
    "Warp Wood": "A held wooden weapon or shield still works",
    "Sound Burst": "Full damage, but no stun",
    "Evard's Black Tentacles": "Full damage, but not Restrained",
    "Hunger of Hadar": "Full damage from the cold; no acid damage at the end of its turn",
    "Finger of Death": "Full damage instead of death",
    "Wail of the Banshee": "Full damage instead of death",
    "Shatter": "Half damage (attended objects are not shattered)",
    "Web": "Not Restrained; half damage if the web burns",
    "Thunderwave": "Half damage and no push",
    "Chill Touch": "Half damage, and it can still regain HP",
    "Guiding Bolt": "Half damage, and no Advantage against it",
    "Melf's Acid Arrow": "Half the first damage, and the acid stops",
    "Sunbeam": "Half damage and not Blinded",
    "Shout": "Half damage and not Deafened",
    "Dreaming": "Half damage and no Exhaustion (Nightmare)",
    "Prismatic Spray": "Half damage (red, orange, yellow); the other colours as listed",
    "Prismatic Wall": "Half damage (red, orange, yellow layers); the other layers as listed",
    "Prismatic Sphere": "Half damage (red, orange, yellow layers); the other layers as listed",
    "Phantasmal Killer": "Negates (on a failure it makes a Fortitude save: failure drops it to 0 HP, success takes 3d6 psychic damage)",
    "Contact Other Plane": "No harm (your own Will save, DC 15, not your spell DC)",
    "Reverse Gravity": "Grabs a fixed object and stays put",
    "Wall of Force": "Picks which side of the wall it is on",
    "Forcecage": "Slips out of the cage",
    "Polymorph": "Negates (an unwilling creature only)",
    "Dispel Magic": "A worn or carried magic item is not suppressed",
    # Reversible spells whose save is the reverse's.
    "Bless": "Negates (Bane only)",
    "Remove Fear": "Negates (Cause Fear only)",
    "Remove Blindness or Deafness": "Negates (Cause Blindness or Deafness only)",
    "Remove Curse": "Negates (Curse only)",
    "Remove Disease": "Negates (Cause Disease only)",
    "Tongues": "Negates (Babble only)",
    "Find the Path": "Negates (Lose the Path only)",
    "Heal": "Negates (Harm only)",
    "Mass Heal": "Loses half its current HP instead (Mass Harm only)",
    "Animate Dead": "Negates (Rest the Dead only)",
    "Restoration": "Negates (Withering Touch only)",
    "Enhance Attribute": "Negates (Diminish Attribute only)",
    "Cure Light Wounds": "Half damage (Cause Light Wounds only)",
    "Cure Serious Wounds": "Half damage (Cause Serious Wounds only)",
    "Cure Critical Wounds": "Half damage (Cause Critical Wounds only)",
    "Healing Circle": "Half damage (Harm Circle only)",
}

_S = r"(?:Will|Reflex|Fortitude)"
_PATTERNS = [
    (_S + r"(?: save)?(?: for)? (?:halves|half)\b", "Half"),
    (r"\(" + _S + r" save for half\)", "Half"),
    (_S + r" save \(halves damage\)", "Half"),
    (_S + r"(?: save)? (?:negates|to resist)\b", "Negates"),
    (_S + r" save \(negates\)", "Negates"),
    (r"\(negates\)", "Negates"),
    (r"\bmakes? an? " + _S + r" save or\b", "Negates"),
    (r"\b" + _S + r" or (?:take|be)\b", "Negates"),
    (r"\bsave negates\b", "Negates"),
]


def generic(text):
    """The first save wording in the text: "Reflex halves" -> Half, "Will negates" -> Negates."""
    best = None
    for p, v in _PATTERNS:
        m = re.search(p, text)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), v)
    return best[1] if best else ""


def save_effect(name, text, save):
    if not save:
        return ""
    return EFFECT.get(name) or generic(text)

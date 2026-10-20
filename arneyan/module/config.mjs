/** Static rules data for The Arneyan Codex. */
export const ARNEYAN = {};

ARNEYAN.abilities = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma"
};

ARNEYAN.abilityAbbr = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" };

ARNEYAN.saves = {
  fort: { label: "Fortitude", ability: "con" },
  ref: { label: "Reflex", ability: "dex" },
  will: { label: "Will", ability: "wis" }
};

/** Difficulty tiers (Core Resolution). */
ARNEYAN.difficulties = { easy: 10, moderate: 12, hard: 15, severe: 20 };

/**
 * The Arneyan Modifier Table. Score 0 is helpless or dead.
 * @param {number} score
 * @returns {number}
 */
ARNEYAN.abilityMod = function (score) {
  score = Math.floor(Number(score) || 0);
  if (score <= 0) return -5;
  if (score <= 2) return -4;
  if (score === 3) return -3;
  if (score <= 5) return -2;
  if (score <= 8) return -1;
  if (score <= 12) return 0;
  if (score <= 15) return 1;
  if (score <= 17) return 2;
  if (score === 18) return 3;
  if (score <= 20) return 4;
  if (score <= 22) return 5;
  if (score <= 25) return 6;
  if (score <= 27) return 7;
  if (score <= 29) return 8;
  return 9;
};

/** Base to Hit by Level, by progression group (index = level, 1 to 24). */
ARNEYAN.bthProgressions = {
  martial: { label: "Martial (+2 per 3 levels)", table: [0, 0, 1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 12, 12, 13, 14, 14, 15, 16] },
  knight: { label: "Knight (one behind the Fighter)", table: [0, 0, 0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7, 7, 8, 9, 9, 10, 11, 11, 12, 13, 13, 14, 15] },
  divine: { label: "Divine (+1 per 3 levels)", table: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8] },
  rogue: { label: "Rogue (about +1 per 4 levels)", table: [0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5] },
  arcane: { label: "Arcane (+1 per 6 levels)", table: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4] }
};

ARNEYAN.bth = function (progression, level) {
  const p = ARNEYAN.bthProgressions[progression] ?? ARNEYAN.bthProgressions.arcane;
  const l = Math.clamp(Math.floor(level) || 0, 0, 24);
  return p.table[l];
};

ARNEYAN.hitDice = { d4: "d4", d6: "d6", d8: "d8", d10: "d10", d12: "d12" };

/** Small, Medium and Large are the Codex's sizes for characters; Monsters & Treasure adds Tiny, Huge and Gargantuan. */
ARNEYAN.sizes = { tiny: "Tiny", small: "Small", medium: "Medium", large: "Large", huge: "Huge", gargantuan: "Gargantuan" };
/** Token width and height in grid squares for each size. */
ARNEYAN.tokenSizes = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };

/** Changing shape: harmless creatures from Monsters & Treasure offered as quick forms, and objects (helpless, own stats). */
ARNEYAN.harmlessForms = ["Toad", "Rat", "Moth", "Lizard", "Crab", "Black Cat", "Weasel", "Goat", "Raven", "Bat"];
ARNEYAN.objectForms = Object.fromEntries([
  ["teapot", "a teapot"], ["stone-block", "a block of stone"], ["wooden-chair", "a chair"], ["book-cover", "a book"],
  ["barrel", "a barrel"], ["flower-pot", "a flower pot"], ["chest", "a chest"], ["broom", "a broom"], ["top-hat", "a hat"],
  ["pumpkin", "a pumpkin"], ["stone-bust", "a statue"], ["old-lantern", "a lantern"], ["leather-boot", "a boot"],
  ["beer-stein", "a tankard"], ["acorn", "an acorn"], ["oak", "a tree"]
].map(([g, label]) => [g, { label, img: `systems/arneyan/assets/icons/form-${g}.svg` }]));

ARNEYAN.armourCategories = { light: "Light", medium: "Medium", heavy: "Heavy", shield: "Shield" };

ARNEYAN.castingAbilities = { "": "None", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

ARNEYAN.saveTypes = { "": "None", fort: "Fortitude", ref: "Reflex", will: "Will" };

ARNEYAN.weaponAbilities = { str: "Strength", dex: "Dexterity", finesse: "Finesse (best of Str/Dex)" };

/** Weapon traits from the Codex (Section III, Weapon Traits). `auto` says what the system does with each. */
/** Kinds of storage place, with their default art. */
ARNEYAN.storageKinds = {
  chest: { label: "Chest or strongbox", icon: "locked-chest" },
  bank: { label: "Bank vault", icon: "bank" },
  home: { label: "Home or base", icon: "house" },
  ship: { label: "Ship's hold or wagon", icon: "galleon" },
  locker: { label: "Guild or temple locker", icon: "locked-box" },
  other: { label: "Somewhere else", icon: "wooden-crate" }
};
ARNEYAN.storageIcon = kind => `systems/arneyan/assets/icons/place-${ARNEYAN.storageKinds[kind]?.icon ?? "locked-chest"}.svg`;

/**
 * Ready-made modes for magic weapons (the forge and a weapon's sheet): what it's called when switched on, the
 * extra damage it adds to every hit while on, and any light it gives. Flaming is the Catalogue's Flame Tongue.
 */
ARNEYAN.weaponModes = {
  flaming: { label: "Flaming", mode: "Ignited", formula: "1d6", type: "fire", light: 20 },
  frost: { label: "Frost", mode: "Rimed", formula: "1d6", type: "cold", light: 0 },
  shocking: { label: "Shocking", mode: "Crackling", formula: "1d6", type: "lightning", light: 0 },
  thundering: { label: "Thundering", mode: "Rumbling", formula: "1d6", type: "thunder", light: 0 },
  radiant: { label: "Radiant", mode: "Shining", formula: "1d6", type: "radiant", light: 20 },
  venomous: { label: "Venomous", mode: "Dripping", formula: "1d6", type: "poison", light: 0 },
  corrosive: { label: "Corrosive", mode: "Hissing", formula: "1d6", type: "acid", light: 0 },
  shadow: { label: "Shadow", mode: "Shadowed", formula: "1d6", type: "necrotic", light: 0 },
  psychic: { label: "Mindpiercing", mode: "Whispering", formula: "1d6", type: "psychic", light: 0 }
};

/** Ammunition kinds: a weapon fires one, an ammunition stack is one. */
ARNEYAN.ammoKinds = { "": "None", arrow: "Arrows", bolt: "Bolts", stone: "Sling stones", bullet: "Bullets (firearms)", dart: "Blowgun needles or darts" };

/** What a weapon is made of, for "non-silvered" and "non-adamantine" Resistance (Monsters & Treasure). Kept in its traits. */
ARNEYAN.weaponMaterials = {
  Silvered: "Silver weapon: full damage to creatures that resist non-silvered weapons (werewolves, devils).",
  Adamantine: "Adamantine weapon: full damage to creatures that resist non-adamantine weapons.",
  "Cold iron": "Cold iron: the bane of fey and fiends. Some monsters' Regeneration doesn't work against it (see their stat blocks).",
  Mithral: "Mithral: light, fine metal (the Catalogue's mithral tools). No rule of its own yet.",
  Nalwood: "Nalwood (Tariel): dead wood of the black-barked, half-aware Nal trees, treated until it is as hard as steel. It doesn't burn, and its field disrupts the Weave: a creature it wounds has Disadvantage on the save to keep concentrating on a spell. Not magic, so it doesn't beat non-magical resistance."
};

ARNEYAN.weaponTraits = {
  "Versatile": { text: "Deals one extra damage die if wielded two-handed instead of one.", auto: "The damage card offers the extra die." },
  "Heavy": { text: "Disadvantage on the attack roll unless your Strength score is 13 or higher.", auto: "Disadvantage applied (Small creatures always; Large never)." },
  "Armour Piercing": { text: "Ignores 2 points of the target's AC from armour specifically (not Dexterity or Feats).", auto: "Reminder on the attack card." },
  "Cleaving": { text: "You may use the Cleave manoeuvre with this weapon up to twice per turn instead of once." },
  "Brace": { text: "Advantage on the attack roll against a charging enemy (stacks with Receiving Charge).", auto: "Reminder on the attack card." },
  "Sunder": { text: "Advantage on Disarm attempts and on checks to break objects." },
  "Finesse": { text: "Use Dexterity instead of Strength for attack and damage.", auto: "Uses the better of Strength and Dexterity." },
  "Reach": { text: "Extends melee range by 5ft." },
  "Light": { text: "Can be used in the off-hand under the Dual Wielding rules." },
  "Thrown": { text: "Can be thrown for the same damage as a melee strike." },
  "Concealable": { text: "Can be hidden on your person without a check; Advantage to keep it hidden during a search." },
  "Entangling": { text: "Advantage on Trip and Grapple attempts made with this weapon." },
  "Two-handed": { text: "Needs both hands; it can't be dual wielded.", auto: "Features for two-handed weapons (Crushing Blow) apply to it." }
};

/**
 * What a rule's `weapon` scope may say: the rule counts only on attack and damage rolls with a weapon that fits, and
 * is a reminder (its "when") on the rest.
 */
ARNEYAN.ruleWeaponScopes = { "two-handed": "Two-handed weapons", chosen: "The weapons picked on the item" };

ARNEYAN.skillTiers = { trained: "Trained", master: "Master" };

/** Session and month uses are not given back by a rest: the GM resets them (the sheet's uses box). */
ARNEYAN.usesPer = { "": "At will", encounter: "Per encounter", day: "Per day", rest: "Per long rest", week: "Per week", session: "Per session", month: "Per month" };

ARNEYAN.abilityKinds = { "class": "Class ability", action: "Action or manoeuvre", ancestry: "Ancestry trait", monster: "Monster ability", other: "Other" };

ARNEYAN.books = { phb: "Player's Handbook", mt: "Monsters & Treasure" };

ARNEYAN.damageTypes = {
  slashing: "Slashing", piercing: "Piercing", bludgeoning: "Bludgeoning", fire: "Fire", cold: "Cold",
  lightning: "Lightning", thunder: "Thunder", acid: "Acid", poison: "Poison", necrotic: "Necrotic",
  radiant: "Radiant", psychic: "Psychic", force: "Force", healing: "Healing"
};

ARNEYAN.spellLevels = ["Cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

/** NWP slots: 3 at 1st, +1 at 4, 8, 12, 16, 20 and 24. */
ARNEYAN.nwpSlots = function (level) {
  return 3 + [4, 8, 12, 16, 20, 24].filter(l => level >= l).length;
};

/** Inventory slots from Strength: 16 at 6 or less, 18 at 7 to 15, 20 at 16+. */
ARNEYAN.inventorySlots = function (str) {
  if (str >= 16) return 20;
  if (str <= 6) return 16;
  return 18;
};

/** Half level, minimum 1, rounded down. */
ARNEYAN.halfLevel = function (level) {
  return Math.max(1, Math.floor((Number(level) || 0) / 2));
};

/** Exhaustion levels (cumulative). */
ARNEYAN.exhaustion = [
  "",
  "Sluggish: Disadvantage on Initiative",
  "Weary: speed halved",
  "Heavy Fatigue: Disadvantage on attribute checks and attacks",
  "Debilitated: Max HP halved",
  "Delirious: speed 0, cannot cast spells",
  "Dead"
];

/* -------------------------------------------- */
/*  Conditions (The Arneyan Codex, Section IV)  */
/* -------------------------------------------- */

const R = (key, value, when) => (when ? { key, value, when } : { key, value });
const INCAP = [R("no.act", 1), R("no.cast", 1)];
const HELPLESS = [...INCAP, R("speed.mult", 0), R("fail.check.str", 1), R("fail.check.dex", 1), R("fail.save.ref", 1), R("adv.against", 1)];

/**
 * Conditions as token status effects. `rules` use the same vocabulary as feats and features.
 * Things that need judgement (line of sight, the source of fear) are left as notes.
 */
ARNEYAN.conditions = {
  blinded: { name: "Blinded", icon: "blindfold", rules: [R("adv.attack", -1), R("adv.against", 1), R("note.check", "Blinded: automatically fails checks that rely on sight")],
    text: "Cannot see. Automatically fails checks that rely on sight. Attacks against it have Advantage; its own attacks have Disadvantage, and it must guess the target's square." },
  burning: { name: "Burning", icon: "flame", rules: [R("note.init", "Burning: takes 1d6 fire damage at the start of each turn")],
    text: "On fire. Takes 1d6 fire damage at the start of each of its turns. Ends when doused: an action to stop, drop and roll, full immersion in water, or an ally spending an action to smother the flames. Each time it is set alight again adds 1d6 (Burning 2: 2d6).", turnDamage: { formula: "1d6", type: "fire" }, counter: "stack" },
  charmed: { name: "Charmed", icon: "charm", rules: [R("note.attack", "Charmed: cannot attack the charmer or target them with harmful abilities or spells")],
    text: "Regards the charmer as a trusted friend. Cannot attack the charmer or target them with harmful abilities or spells. The charmer has Advantage on Charisma checks against it." },
  deafened: { name: "Deafened", icon: "silenced", rules: [R("note.check", "Deafened: automatically fails checks that rely on hearing")],
    text: "Cannot hear. Automatically fails checks that rely on hearing. Immune to effects that work only through sound." },
  dominated: { name: "Dominated", icon: "puppet", rules: [R("note.attack", "Dominated: the controller can command it")],
    text: "As Charmed, but the controller can command it (an action to issue orders). It gets a fresh save whenever ordered to act against its nature or to harm itself." },
  frightened: { name: "Frightened", icon: "terror", rules: [R("adv.attack", -1, "while it can see the source of its fear"), R("adv.check", -1, "while it can see the source of its fear")],
    text: "Disadvantage on attack rolls and attribute checks while it can see the source of its fear, and it cannot willingly move closer to it." },
  incapacitated: { name: "Incapacitated", icon: "knocked-out-stars", rules: [...INCAP],
    text: "Cannot take actions or reactions. It can still move unless another condition says otherwise, and it cannot cast spells or maintain concentration." },
  invisible: { name: "Invisible", icon: "invisible", rules: [R("adv.attack", 1), R("adv.against", -1)],
    text: "Cannot be seen without magic or special senses. Attacks against it have Disadvantage; its own attacks have Advantage. Ends the moment it attacks or casts a spell." },
  paralysed: { name: "Paralysed", icon: "frozen-body", rules: [...HELPLESS, R("crit.against.close", 1)],
    text: "Incapacitated, Speed 0 and unable to speak. Automatically fails Strength and Dexterity checks and Reflex saves. Attacks against it have Advantage, and any melee hit from within 5ft is a critical hit." },
  petrified: { name: "Petrified", icon: "stone-bust", counter: "none", rules: [...HELPLESS, R("crit.against.close", 1), R("immune", "poison")],
    text: "Turned to stone. Treated as Paralysed and unaware of its surroundings. It does not age or need food, and is immune to poison and disease." },
  poisoned: { name: "Poisoned / Sickened", icon: "poison-bottle", counter: "stage", rules: [R("adv.attack", -1), R("adv.check", -1), R("note.save", "Poisoned: repeat the Fortitude save at the end of each turn")],
    text: "Disadvantage on attack rolls and attribute checks. If the source is a poison, it takes poison damage at the start of each turn (1d4, then 1d6, 1d8 and 1d10) and repeats the Fortitude save at the end of each turn." },
  prone: { name: "Prone", icon: "fall-down", counter: "none", rules: [R("adv.against.melee", 1), R("adv.against.ranged", -1)],
    text: "Melee attacks against it have Advantage; ranged attacks against it have Disadvantage. Standing up costs half its movement." },
  restrained: { name: "Restrained", icon: "manacles", rules: [R("speed.mult", 0), R("adv.attack", -1), R("adv.save.ref", -1), R("adv.against", 1)],
    text: "Speed 0. Disadvantage on its attacks and on Reflex saves; attacks against it have Advantage. Breaking free is a Strength or Dexterity check against the source's DC, as an action." },
  stunned: { name: "Stunned", icon: "stun-grenade", rules: [...HELPLESS],
    text: "Incapacitated, Speed 0 and able to speak only falteringly. Automatically fails Strength and Dexterity checks and Reflex saves. Attacks against it have Advantage." },
  unconscious: { name: "Unconscious", icon: "night-sleep", counter: "none", rules: [...HELPLESS, R("crit.against.close", 1)],
    text: "Incapacitated, Speed 0 and unaware. Drops anything it holds and falls Prone. Automatically fails Strength and Dexterity checks and Reflex saves. Attacks against it have Advantage, and any melee hit from within 5ft is a critical hit." },
  // The rest of the Codex's conditions table (Section IV).
  confused: { name: "Confused", icon: "spinning-top", rules: [R("note.init", "Confused: roll 1d10 at the start of each turn (1-3 attack the nearest creature, 4-6 do nothing, 7-8 move randomly at full speed, 9-10 act normally)")],
    text: "Acts at random. At the start of each of its turns roll 1d10: 1-3 it attacks the nearest creature, friend or foe; 4-6 it does nothing; 7-8 it moves in a random direction at full speed; 9-10 it acts normally." },
  shaken: { name: "Shaken", icon: "shaking-hands", rules: [R("adv.attack", -1), R("note.attack", "Shaken: remove it after this attack")],
    text: "Disadvantage on its next attack roll. Ends after that attack, or the effect's duration." },
  slowed: { name: "Slowed", icon: "snail", rules: [R("speed.mult", 0.5), R("note.attack", "Slowed: only one attack per round")],
    text: "Half Speed, and only one attack per round." },
  weakened: { name: "Weakened", icon: "arm-sling", rules: [R("adv.attack", -1)],
    text: "Disadvantage on attack rolls." },
  concentrating: { name: "Concentrating", icon: "concentration-orb", counter: "none", rules: [], system: true,
    text: "Maintaining a concentration effect. Taking damage calls for a Fortitude save, DC 10 or half the damage, whichever is higher." },
  dead: { name: "Dead", icon: "skull-crossed-bones", rules: [...HELPLESS], system: true, counter: "none", text: "Dead." }
};

/** Exhaustion as rules (cumulative). */
ARNEYAN.exhaustionRules = [
  [],
  [R("adv.init", -1)],
  [R("speed.mult", 0.5)],
  [R("adv.check", -1), R("adv.attack", -1)],
  [R("hp.mult", 0.5)],
  [R("speed.mult", 0), R("no.cast", 1)],
  []
];

/** Rule keys, for the editor and validation. Keys ending in a dot take a suffix. */
ARNEYAN.ruleKeys = {
  "Numbers": ["ability.str", "ability.dex", "ability.con", "ability.int", "ability.wis", "ability.cha", "ac", "attack", "attack.melee", "attack.ranged",
    "damage", "damage.melee", "damage.ranged", "spell.damage", "cantrip.damage", "spell.dc", "class.dc", "save", "save.fort", "save.ref", "save.will",
    "check", "check.str", "check.dex", "check.con", "check.int", "check.wis", "check.cha", "skill", "init", "speed", "hp.max", "hp.level", "nwp", "inventory",
    "slots.1", "slots.2", "slots.3", "slots.4", "slots.5", "slots.6", "slots.7", "slots.8", "slots.9",
    "ac.base", "crit.range", "dr", "heal.perdie", "speed.fly"],
  "When applied (once)": ["hp.temp", "exhaustion"],
  "Multipliers and limits": ["speed.mult", "hp.mult", "no.cast", "no.act", "no.reactions"],
  // Value n: the weapon's own damage dice showing n or less are rolled again once (2: Crushing Blow's 1s and 2s).
  "Weapon dice": ["damage.reroll"],
  "Advantage (+1) or Disadvantage (-1)": ["adv.attack", "adv.attack.melee", "adv.attack.ranged", "adv.attack.first", "adv.attack.first.melee", "adv.save", "adv.save.fort", "adv.save.ref", "adv.save.will",
    "adv.check", "adv.check.str", "adv.check.dex", "adv.check.con", "adv.check.int", "adv.check.wis", "adv.check.cha", "adv.skill", "adv.init", "adv.luck", "adv.concentration"],
  "Against this creature": ["adv.against", "adv.against.melee", "adv.against.ranged", "crit.against.close"],
  "Automatic failure": ["fail.save.fort", "fail.save.ref", "fail.save.will", "fail.check.str", "fail.check.dex", "fail.check.con", "fail.check.int", "fail.check.wis", "fail.check.cha"],
  "Traits": ["resist", "immune", "vuln", "sense"],
  "Reminders": ["note.attack", "note.damage", "note.save", "note.check", "note.skill", "note.spell", "note.init"]
};
ARNEYAN.allRuleKeys = new Set(Object.values(ARNEYAN.ruleKeys).flat());

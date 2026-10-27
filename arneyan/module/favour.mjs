/**
 * Cosmic alignment (books v0.10.19, B4, and the v0.10.20 fix build; board B-F6, B-F7). Book II, Alignment in Arneyan:
 * - Outlook: every character's nine-label alignment plus one or two tenets. Roleplay only (details.alignment, details.tenets).
 * - Allegiance: a real side in the gods' war. Gods, fiends, celestials and the undead hold one by nature; a mortal is
 *   Unaligned unless they take a side: divine service (their god's alignment while favoured), a pact (the patron's; a
 *   fiend pact makes them Evil) or profane acts, which pull a mortal towards Evil and, repeated or sustained, make them
 *   Evil (W1, R5: the GM judges it and sets the Allegiance). Spells, items and features that name an alignment affect
 *   only creatures with that Allegiance; Unaligned mortals don't register.
 * - Divine Favour for Clerics, Paladins and Battle Priests: Favoured, Strained (Turn Undead and the highest-level spells
 *   need a DC 12 check with the key attribute, Wisdom or Charisma for Paladins, R6; a failure spends the use or slot),
 *   Forsaken (every class ability the god grants is lost until atonement). Atonement moves one step back.
 * - M&T p.4 (m30): devils Lawful Evil, demons Chaotic Evil, other fiends Neutral Evil, celestials Good, undead Evil.
 * Everything here bar alignmentContext is a pure function of plain data, so the data models and the tests can share it.
 */

/** The nine alignments, in the books' order. */
export const ALIGNMENTS = ["Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil"];
export const UNALIGNED = "Unaligned";

/** Divine Favour states. */
export const FAVOUR = { favoured: "Favoured", strained: "Strained", forsaken: "Forsaken" };

/** The servant classes and the attribute their Strained check uses (R6: the class's key attribute). */
const SERVANTS = [
  { match: /^cleric\s*\(battle priest\)/i, label: "Battle Priest", key: "wis" },
  { match: /^cleric\b/i, label: "Cleric", key: "wis" },
  { match: /^paladin\b/i, label: "Paladin", key: "cha" }
];

/** Fiend kinds (from the type's brackets) and their Allegiance by nature (M&T p.4; Review's m30 wording). */
const NATURE = [
  [/\bdevil\b/i, "Lawful Evil"],
  [/\bdemon\b/i, "Chaotic Evil"],
  [/^fiend\b/i, "Neutral Evil"],
  [/^celestial\b/i, "Good"],
  [/^undead\b/i, "Evil"]
];

/** Warlock patrons that are fiends: a pact with one makes you Evil (Book II, Taking a Side). */
const FIEND_PATRONS = /asmodeus|baalzebul|baphomet|belial|fierna|demogorgon|dispater|glasya|graz.?zt|levistus|mammon|mephistopheles|orcus|yeenoghu|zariel/i;

/** "Lawful Good", "LG", "lawful good" and the like read as the alignment; anything else reads as "" (not set). */
export function readAlignment(text) {
  const t = String(text ?? "").trim();
  if (!t) return "";
  if (/^unaligned$/i.test(t)) return UNALIGNED;
  const abbr = { LG: 0, NG: 1, CG: 2, LN: 3, N: 4, TN: 4, CN: 5, LE: 6, NE: 7, CE: 8 }[t.toUpperCase()];
  if (abbr !== undefined) return ALIGNMENTS[abbr];
  const hit = ALIGNMENTS.find(a => a.toLowerCase() === t.toLowerCase().replace(/\s+/g, " "));
  if (hit) return hit;
  if (/^neutral$/i.test(t)) return "True Neutral";
  if (/^(good|evil|lawful|chaotic)$/i.test(t)) return t[0].toUpperCase() + t.slice(1).toLowerCase();
  return "";
}

/**
 * The servant on a character (Cleric, Battle Priest or Paladin, or a Cleric/Paladin multiclass serving one god) and
 * the deity kit, or null. `bases` and `classNames` list every servant class, so Forsaken and Strained cover each.
 */
export function servantOf(items = []) {
  const list = [...(items ?? [])];
  const found = [];
  for (const s of SERVANTS) {
    const cls = list.find(i => i.type === "class" && s.match.test(String(i.name ?? "")) && !found.some(f => f.cls === i));
    if (cls) found.push({ ...s, cls, base: s.label === "Paladin" ? "paladin" : "cleric" });
  }
  if (!found.length) return null;
  const bases = [...new Set(found.map(f => f.base))];
  const kit = list.find(i => i.type === "kit" && /^deity\b/i.test(String(i.name ?? "")) && bases.includes(String(i.system?.className ?? "").toLowerCase())) ?? null;
  const primary = (kit && found.find(f => f.base === String(kit.system?.className ?? "").toLowerCase())) || found[0];
  return { cls: primary.cls, kit, label: primary.label, key: primary.key, className: String(primary.cls.name), bases, classNames: found.map(f => String(f.cls.name).toLowerCase()) };
}

/** The attribute a Strained check uses for this item: Charisma for a Paladin's, else the servant's (R6). */
export function strainedKey(item, servant, className = null) {
  const cn = String(className ?? item?.system?.className ?? "").toLowerCase();
  if (cn.startsWith("paladin")) return "cha";
  if (cn.startsWith("cleric")) return "wis";
  return servant?.key ?? "wis";
}

/** The god's name from a deity kit ("Deity: Kossuth (Cleric)" reads "Kossuth"). */
export function godOf(kit) {
  return String(kit?.name ?? "").replace(/^deity:\s*/i, "").replace(/\s*\((cleric|paladin)\)\s*$/i, "").trim();
}

/** A Warlock's patron kit, or null. */
export function patronOf(items = []) {
  const list = [...(items ?? [])];
  if (!list.some(i => i.type === "class" && /^warlock\b/i.test(String(i.name ?? "")))) return null;
  return list.find(i => i.type === "kit" && /warlock/i.test(String(i.system?.className ?? ""))) ?? null;
}

/**
 * A character's Allegiance: { value, from }.
 * The GM's own entry wins (profane acts, a curse, a story); then divine service while not Forsaken; then a pact; else Unaligned.
 */
export function characterAllegiance({ override = "", favour = "favoured", items = [] } = {}) {
  const set = readAlignment(override) || String(override ?? "").trim();
  if (set) return { value: set, from: "Set by the GM" };
  const servant = servantOf(items);
  if (servant && favour !== "forsaken") {
    const god = godOf(servant.kit);
    const al = readAlignment(servant.kit?.system?.alignment);
    if (al) return { value: al, from: `Divine service: ${god || "their god"}` };
    return { value: "", from: servant.kit ? `Divine service: ${god}'s alignment isn't set on the deity kit yet` : "Divine service: no deity kit yet", unset: true };
  }
  const patron = patronOf(items);
  if (patron) {
    const al = readAlignment(patron.system?.alignment);
    const name = String(patron.name ?? "").replace(/\s*\(warlock\)\s*$/i, "");
    if (al) return { value: al, from: `Pact: ${name}` };
    if (FIEND_PATRONS.test(name)) return { value: "Evil", from: `Pact with a fiend: ${name}` };
    return { value: "", from: `Pact: ${name}'s alignment isn't set on the patron kit yet`, unset: true };
  }
  return { value: UNALIGNED, from: "A mortal who hasn't taken a side" };
}

/** A creature's Allegiance by nature: fiends, celestials and undead hold one; others are Unaligned unless the GM says. */
export function npcAllegiance({ override = "", type = "" } = {}) {
  const set = readAlignment(override) || String(override ?? "").trim();
  if (set) return { value: set, from: "Its entry, or set by the GM" };
  const t = String(type ?? "").trim();
  for (const [re, al] of NATURE) if (re.test(t)) return { value: al, from: `By its nature (${t.split("(")[0].trim().toLowerCase()})` };
  return { value: UNALIGNED, from: "Serves no power" };
}

/** Text that names an alignment the way a rule does: "vs evil creatures", "against good", "creatures that are Evil". */
const NAMES_ALIGNMENT = /\balignment\b|\b(?:good|evil|lawful|chaotic)\s+(?:creatures?|outsiders?|beings?|foes?|enemies|targets?|spirits?)\b|\bthat (?:are|is) (?:good|evil|lawful|chaotic)\b|\b(?:vs\.?|versus|against)\s+(?:an?\s+)?(?:good|evil|lawful|chaotic)\b/i;
export const namesAlignment = text => NAMES_ALIGNMENT.test(String(text ?? ""));

/**
 * Does an alignment-keyed rule ("vs evil creatures", "against chaotic evil", "non-good") count against this Allegiance?
 * Returns true, false, or null when the text names no alignment. A two-word alignment needs both words; "non-" turns
 * it round. Unaligned never registers.
 */
export function allegianceMatches(when, allegiance) {
  const w = String(when ?? "").toLowerCase();
  if (!namesAlignment(w)) return null;
  const terms = [...w.matchAll(/\b(non-?\s?)?((?:lawful|chaotic|neutral)\s+(?:good|evil)|good|evil|lawful|chaotic)\b/g)]
    .map(m => ({ not: !!m[1], words: m[2].split(/\s+/) }));
  if (!terms.length) return null;
  const a = String(allegiance ?? "").toLowerCase();
  if (!a || a === "unaligned") return false;
  const has = word => new RegExp(`\\b${word}\\b`).test(a);
  return terms.some(t => (t.not ? !t.words.every(has) : t.words.every(has)));
}

/**
 * Reminders that name an alignment ("Blessed Weapon: +1d6 vs evil creatures") get each target's answer, by Allegiance:
 * "Imp counts (Lawful Evil); Goblin doesn't (Unaligned)". targets: [{ name, allegiance }]. Others pass through.
 */
export function annotateAllegiance(notes = [], targets = []) {
  if (!targets?.length) return notes;
  return notes.map(n => {
    if (allegianceMatches(n, "x") === null) return n;
    const parts = targets.map(t => `${t.name} ${allegianceMatches(n, t.allegiance) ? "counts" : "doesn't"} (${t.allegiance || UNALIGNED})`);
    return `${n}. By Allegiance: ${parts.join("; ")}`;
  });
}

/** Does a spell or feature name an alignment (Holy Word, Protection from Alignment, Dispel Alignment...)? */
export function itemNamesAlignment(item) {
  const name = String(item?.name ?? "");
  // Change Alignment shifts an Outlook; "regardless of alignment" (Smite Evil, Mark of the Saint) says it doesn't matter.
  if (/^change alignment\b/i.test(name)) return false;
  const desc = String(item?.system?.description ?? "").replace(/<[^>]+>/g, " ").replace(/\b(?:regardless of|whatever their|any) alignment\b/gi, " ");
  return namesAlignment(name) || namesAlignment(desc);
}

/** The class a feature, kit or spell belongs to, as the item records it ("" when none). */
const classOfItem = item => String(item?.system?.className ?? "").toLowerCase();

/** Cleric and Battle Priest features the god doesn't grant (Kieran, 27 Oct): kept when Forsaken. */
const CLERIC_KEEPS = /^(extra attack|wisdom bonus|weapon selection|battle priest)\b/i;

/**
 * Is this item one of the god-granted abilities a Forsaken servant loses? The servant classes' spells and divine
 * features, the deity kit, and the kit's features. A Paladin loses every class ability (Divine Mount included, Book
 * III); a Cleric or Battle Priest keeps the ones the god doesn't grant (Extra Attack, Wisdom Bonus, Weapon Selection).
 * Other classes (a Fighter's features on a multiclass Cleric) stay. `className`: a spell's class when the spell has
 * none of its own (its caster's).
 */
export function lostToForsaken(item, servant, className = null) {
  if (!servant || !item) return false;
  if (servant.kit && item === servant.kit) return true;
  const cn = String(className || classOfItem(item)).toLowerCase();
  if (!cn) return false;
  if (servant.kit && cn === String(servant.kit.name ?? "").toLowerCase()) return true;
  const bases = servant.bases ?? [servant.label === "Paladin" ? "paladin" : "cleric"];
  const names = servant.classNames ?? [String(servant.className ?? "").toLowerCase()];
  const base = bases.find(b => cn === b || cn.startsWith(`${b} `)) ?? (names.includes(cn) ? (cn.startsWith("paladin") ? "paladin" : "cleric") : null);
  if (!base) return false;
  if (base === "cleric" && item.type !== "spell" && CLERIC_KEEPS.test(String(item.name ?? ""))) return false;
  return true;
}

/** The highest spell level a caster has slots for (0 when none). */
export function highestSlotLevel(caster) {
  const slots = caster?.slots ?? [];
  let top = 0;
  for (let l = 1; l < slots.length; l++) if ((slots[l]?.total ?? 0) > 0) top = l;
  return top;
}

/** Turn Undead (and Control Undead, the same channel) by name. */
export const isTurnUndead = name => /^(turn|control) undead\b/i.test(String(name ?? "").trim());

/** The key attribute's name for a servant's Strained check. */
const ATTR = { wis: "Wisdom", cha: "Charisma" };

/**
 * What the sheets show: the nine choices, the Allegiance and where it comes from, and Divine Favour for a servant.
 * Characters: Outlook, tenets, Allegiance (worked out unless the GM sets one), Favour. Creatures: Outlook and Allegiance.
 */
export function alignmentContext(actor) {
  const s = actor?.system ?? {};
  const allegiance = s.allegiance ?? { value: UNALIGNED, from: "" };
  const base = { choices: ALIGNMENTS, allegiance };
  if (actor?.type === "npc") {
    const natural = npcAllegiance({ type: s.details?.type }).value;
    return { ...base, natural };
  }
  if (actor?.type !== "character") return base;
  const servant = servantOf(actor.items ?? []);
  const favour = s.favour || "favoured";
  return {
    ...base,
    servant: servant ? { label: servant.label, god: godOf(servant.kit), attr: ATTR[servant.key] ?? servant.key } : null,
    favour,
    favourLabel: FAVOUR[favour] ?? FAVOUR.favoured,
    favours: FAVOUR,
    wiki: String(servant?.kit?.flags?.arneyan?.wiki ?? ""),
    pact: (() => {
      const p = servant ? null : patronOf(actor.items ?? []);
      return p ? { name: String(p.name ?? "").replace(/\s*\(warlock\)\s*$/i, ""), wiki: String(p.flags?.arneyan?.wiki ?? "") } : null;
    })()
  };
}

/**
 * Cosmic alignment (books v0.10.19, B4; board B-F6). Book II, Alignment in Arneyan:
 * - Outlook: every character's nine-label alignment plus one or two tenets. Roleplay only (details.alignment, details.tenets).
 * - Allegiance: a real side in the gods' war. Gods, outsiders and the undead hold one by nature; a mortal is Unaligned
 *   unless they take a side: divine service (their god's alignment while favoured), a pact (the patron's; a fiend pact
 *   makes them Evil) or profane acts (the GM marks them; Kieran's W1 and R5 calls make that a drift the GM judges).
 *   Spells, items and features that name an alignment affect only creatures with that Allegiance.
 * - Divine Favour for Clerics, Paladins and Battle Priests: Favoured, Strained (Turn Undead and the highest-level spells
 *   need a DC 12 check with the class's key attribute, Kieran's R6 call; a failure spends the use or slot), Forsaken
 *   (every class ability the god grants is lost until atonement).
 * Everything here is a pure function of plain data, so the data models and the tests can share it.
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

/** The servant class on a character (Cleric, Battle Priest or Paladin) and its deity kit, or null. */
export function servantOf(items = []) {
  const list = [...(items ?? [])];
  for (const s of SERVANTS) {
    const cls = list.find(i => i.type === "class" && s.match.test(String(i.name ?? "")));
    if (!cls) continue;
    const base = s.label === "Paladin" ? "paladin" : "cleric";
    const kit = list.find(i => i.type === "kit" && /^deity\b/i.test(String(i.name ?? "")) && String(i.system?.className ?? "").toLowerCase() === base) ?? null;
    return { cls, kit, label: s.label, key: s.key, className: String(cls.name) };
  }
  return null;
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

/**
 * Does an alignment-keyed rule ("vs evil creatures", "against good") count against this Allegiance?
 * Returns true, false, or null when the text names no alignment. Unaligned never registers.
 */
export function allegianceMatches(when, allegiance) {
  const w = String(when ?? "").toLowerCase();
  const wants = ["good", "evil", "lawful", "chaotic"].filter(k => new RegExp(`\\b${k}\\b`).test(w));
  if (!wants.length) return null;
  const a = String(allegiance ?? "").toLowerCase();
  if (!a || a === "unaligned") return false;
  return wants.some(k => a.includes(k));
}

/** The class a feature, kit or spell belongs to, as the item records it ("" when none). */
const classOfItem = item => String(item?.system?.className ?? "").toLowerCase();

/**
 * Is this item one of the god-granted abilities a Forsaken servant loses? The servant class's features and spells,
 * its deity kit, and the kit's features. A Paladin loses every class ability (Divine Mount included); a Cleric or a
 * Battle Priest their class's. Other classes (a Fighter's features on a multiclass Cleric) stay.
 */
export function lostToForsaken(item, servant) {
  if (!servant || !item) return false;
  if (servant.kit && item === servant.kit) return true;
  const cn = classOfItem(item);
  if (!cn) return false;
  const own = String(servant.className ?? "").toLowerCase();
  const base = servant.label === "Paladin" ? "paladin" : "cleric";
  if (cn === own || cn === base) return true;
  return !!servant.kit && cn === String(servant.kit.name ?? "").toLowerCase();
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

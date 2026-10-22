/**
 * Spells that only work on one kind of creature (Kieran, 21 Oct 2026: Hold Animal held a goblin). Their save, effect
 * and damage buttons leave out targets of the wrong type, or above (or below) the Level the spell allows, and say so.
 * The types are the Bestiary's (a monster's type line); a player character counts as a humanoid.
 */
/** Spell name: types it works on, types it never works on, the Levels it allows, and the words to show. */
export const SPELL_TARGETS = {
  "Hold Animal": { types: ["beast"], text: "animals only" },
  "Animal Friendship": { types: ["beast"], text: "a normal animal only" },
  "Calm Animals": { types: ["beast"], text: "animals only" },
  "Charm Person": { types: ["humanoid"], text: "humanoids only" },
  "Charm Person or Mammal": { types: ["humanoid", "beast"], text: "humanoids and mammals only" },
  "Hold Person": { types: ["humanoid"], text: "humanoids only" },
  "Dominate Person": { types: ["humanoid"], text: "humanoids only" },
  "Enslave": { types: ["humanoid"], text: "humanoids only" },
  "Daze": { types: ["humanoid"], maxLevel: 4, text: "humanoids of Level 4 or lower" },
  "Charm Monster": { notTypes: ["undead", "construct"], text: "living creatures only" },
  "Hold Monster": { notTypes: ["undead"], text: "creatures that aren't undead" },
  "Bind Elemental": { types: ["elemental"], text: "elementals only" },
  "Bind Undead": { types: ["undead"], text: "undead only" },
  "Control Undead": { types: ["undead"], text: "undead only" },
  "Control Greater Undead": { types: ["undead"], minLevel: 9, text: "undead of Level 9 or higher" },
  "Halt Undead": { types: ["undead"], text: "undead only" },
  "Disrupt Undead": { types: ["undead"], text: "undead only" },
  "Cause Fear": { maxLevel: 4, text: "creatures of Level 4 or lower" },
  "Scare": { maxLevel: 5, notTypes: ["undead", "construct"], text: "creatures of Level 5 or lower (not undead or constructs)" }
};

/** A creature's type, lower case ("beast", "humanoid (goblinoid)"); characters are humanoid. */
export function creatureType(actor) {
  if (!actor) return "";
  if (actor.type === "character") return "humanoid";
  return String(actor.system?.details?.type ?? "").trim().toLowerCase();
}

const levelOf = actor => Number(actor?.system?.level ?? actor?.system?.details?.level) || 0;
const isType = (type, list) => list.some(t => type === t || type.startsWith(`${t} `) || type.startsWith(`${t}(`));

/** Can this spell work on this creature? { ok, why }. Spells without a rule work on anything. */
export function spellFits(spellName, actor) {
  const rule = SPELL_TARGETS[String(spellName ?? "").trim()];
  if (!rule || !actor) return { ok: true, why: "" };
  const type = creatureType(actor);
  const lvl = levelOf(actor);
  // A monster with no type written in: the GM's call, so it isn't left out.
  if (rule.types && type && !isType(type, rule.types)) return { ok: false, why: `${spellName} works on ${rule.text}` };
  if (rule.notTypes && type && isType(type, rule.notTypes)) return { ok: false, why: `${spellName} works on ${rule.text}` };
  if (rule.maxLevel !== undefined && lvl > rule.maxLevel) return { ok: false, why: `${spellName} works on ${rule.text}` };
  if (rule.minLevel !== undefined && lvl < rule.minLevel) return { ok: false, why: `${spellName} works on ${rule.text}` };
  return { ok: true, why: "" };
}

/** The targets a spell can work on; the others are named in a notice. */
export function spellTargets(spellName, actors, { notify = true } = {}) {
  const ok = [], out = [];
  for (const a of actors ?? []) (spellFits(spellName, a).ok ? ok : out).push(a);
  if (out.length && notify) {
    const why = spellFits(spellName, out[0]).why;
    globalThis.ui?.notifications?.warn(`${out.map(a => a.name).join(", ")}: not affected (${why}).`);
  }
  return ok;
}


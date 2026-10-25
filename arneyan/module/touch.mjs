/**
 * Touch spells roll to hit (Kieran, 22 Oct 2026): "Touch spells are roll to hit now based on the caster's BtH +
 * caster mod. Only roll to hit against enemies of course; touch spells on allies are automatic." The attack takes the
 * place of the save: on a hit the spell takes full effect, on a miss none.
 *
 * Healing (Cure Light, Serious and Critical Wounds): no save and no roll on an ally. Against an undead, or cast
 * reversed (Cause ... Wounds), it's a touch attack, and on a hit its dice are damage: radiant to an undead, necrotic
 * when reversed.
 *
 * Listed by name: the spells whose touch delivers the harm to one creature. Touch spells that set a trap or a ward
 * (Glyph of Warding, Fire Trap, Sanctuary) or whose reversed form has a range (Tongues, Remove Fear, Find the Path)
 * keep their saves.
 */
import { ARNEYAN } from "./config.mjs";
export const TOUCH_ATTACK = new Set([
  "Shocking Grasp", "Chill Touch", "Inflict Light Wounds", "Vampiric Touch", "Ghoul Touch", "Bestow Curse", "Contagion",
  "Harm", "Touch of Fatigue", "Death Knell", "Polymorph", "Plane Shift", "Temporal Stasis", "Imprisonment",
  // "As Bestow Curse" (Necromancer class-only spell, Handbook v0.10.11).
  "Bestow Curse (Greater)",
  // Reversible: the touch attack is for the reversed form (or, for the cures, an undead).
  "Cure Light Wounds", "Cure Serious Wounds", "Cure Critical Wounds", "Heal", "Remove Curse", "Remove Disease",
  "Remove Blindness or Deafness", "Enhance Attribute", "Restoration"
]);

/** Spells whose touch heals an ally and harms (or, reversed, wounds) on a hit. */
export const CURES = new Set(["Cure Light Wounds", "Cure Serious Wounds", "Cure Critical Wounds"]);

/** Spells whose touch attack is only for the reversed form (an ally gets the spell as normal). */
export const REVERSED_ONLY = new Set(["Heal", "Remove Curse", "Remove Disease", "Remove Blindness or Deafness", "Enhance Attribute", "Restoration"]);

export const isTouchAttack = item => item?.type === "spell" && TOUCH_ATTACK.has(String(item.name ?? "").trim());

/** What the touch attack button says. */
export function touchLabel(item) {
  const n = String(item?.name ?? "").trim();
  if (CURES.has(n)) return "Touch attack: an undead, or cast reversed";
  if (REVERSED_ONLY.has(n)) return "Touch attack (cast reversed)";
  if (n === "Polymorph" || n === "Plane Shift") return "Touch attack (an unwilling creature)";
  return "Touch attack";
}

/** The attack's parts: BtH and the caster's casting modifier (a monster: its attack bonus). */
export function touchParts(actor, item) {
  if (!actor) return [];
  // Bless, a curse on attacks and the like count, as on any melee attack.
  const rules = actor.system?.mods?.parts?.("attack", "attack.melee") ?? [];
  if (actor.type !== "character") return [{ label: "Attack", value: Number(actor.system?.attributes?.attack ?? actor.system?.bth ?? 0) || 0 }, ...rules];
  const c = item?.caster ?? null;
  const parts = [{ label: "BtH", value: Number(actor.system?.bth ?? 0) || 0 }, ...rules];
  if (c) parts.push({ label: `${ARNEYAN.abilities?.[c.ability] ?? "Casting"} (casting)`, value: Number(c.mod ?? 0) || 0 });
  return parts;
}

/** On a hit, the effects to offer: a reversible spell's reversed ones only (no buff for the enemy). */
export function touchApplies(item) {
  const all = (item?.system?.applies ?? []).map((e, i) => ({ e, i })).filter(x => x.e.target !== "self");
  if (!REVERSED_ONLY.has(String(item?.name ?? "").trim())) return all;
  const rev = all.filter(x => /reversed/i.test(x.e.name ?? ""));
  return rev.length ? rev : all;
}

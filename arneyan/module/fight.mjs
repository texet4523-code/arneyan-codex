/**
 * Which combat a creature is fighting in. game.combat is only the encounter this client's tracker is showing: with a
 * second encounter on another scene it can be the wrong one (or one that hasn't started). These look through every
 * running encounter instead, those on the scene being viewed first.
 */

/** Started or active encounters: started ones first, and among those the viewed scene's. */
const allCombats = () => game.combats?.contents ?? Array.from(game.combats?.values?.() ?? []);

export function runningCombats() {
  const all = allCombats();
  const sceneId = globalThis.canvas?.scene?.id ?? null;
  const list = all.filter(c => c && (c.started || c.active));
  const here = c => (sceneId && (c.scene?.id ?? c.scene) === sceneId ? 1 : 0);
  return list.sort((a, b) => (b.started ? 1 : 0) - (a.started ? 1 : 0) || here(b) - here(a));
}

/** Is this combatant the creature? A linked actor, or the token's own (unlinked) actor. */
export const isCombatantOf = (c, actor) => !!actor && (c.actor === actor || (c.actorId === actor.id && c.token?.actor === actor));

/** The creature's combatants in one encounter. */
const inCombat = (combat, actor) => Array.from(combat?.combatants ?? []).filter(c => isCombatantOf(c, actor));

/** The running encounter the creature is in (the viewed scene's first), or null. */
export function combatFor(actor) {
  if (!actor) return null;
  return runningCombats().find(c => inCombat(c, actor).length) ?? null;
}

/** A started encounter on a scene (an area or aura placed there), or null. */
export function combatOnScene(sceneId) {
  if (!sceneId) return null;
  return runningCombats().find(c => c.started && (c.scene?.id ?? c.scene) === sceneId) ?? null;
}

/**
 * The creature's combatants: in the one encounter it's fighting (spending a reaction), or with `all`, in every
 * encounter it's in (marking it defeated).
 */
export function combatantsOf(actor, { all = false } = {}) {
  if (!actor) return [];
  if (all) return allCombats().flatMap(c => inCombat(c, actor));
  const combat = combatFor(actor);
  return combat ? inCombat(combat, actor) : [];
}

/** The encounter a stored stamp points at (an effect's "expires"), whichever one the tracker shows. */
export function combatById(id) {
  if (!id) return null;
  return game.combats?.get?.(id) ?? allCombats().find(c => c.id === id) ?? null;
}

/** "Ash", "Ash and Brin", "Ash, Brin and Cael". */
const nameList = names => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "");

/**
 * Before a rest (the sheet's Rest, the party's Rest): a creature still in a running encounter gets a warning first,
 * since resting mid-fight is almost always a misclick. Returns true to go on with the rest, false on Cancel.
 */
export async function confirmRestInFight(actors) {
  const fighting = [actors].flat().filter(a => a && combatFor(a));
  if (!fighting.length) return true;
  const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
  const go = await foundry.applications.api.DialogV2.wait({
    window: { title: "Rest during a fight?", icon: "fa-solid fa-triangle-exclamation" }, classes: ["arneyan"],
    content: `<p>${esc(nameList(fighting.map(a => a.name)))} ${fighting.length > 1 ? "are" : "is"} ${fighting.some(a => combatFor(a)?.started) ? "in a fight" : "in an encounter that hasn't started yet"}. Rest anyway?</p>`,
    buttons: [
      { action: "rest", label: "Rest anyway", icon: "fa-solid fa-bed" },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", default: true }
    ],
    rejectClose: false
  });
  return go === "rest";
}

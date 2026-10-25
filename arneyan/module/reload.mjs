/**
 * Reloading (Batch 8, Kieran 25 Oct 2026; Handbook v0.10.10, Firearms): reloading uses your action for the weapon's
 * listed number of rounds (you can still move). Quick Reload (the weapon trait) and a Gunslinger's Lightning Reload
 * (one round faster; at least, reload as part of the attack that fired the shot) shorten it. A heavy crossbow takes a
 * round to reload after each shot. Guns that hold several shots (the Repeating Pistol's 5, the Wind Rifle's 6) fire
 * that many before reloading.
 *
 * State on the weapon (flags.arneyan.ammo): { loaded, reloading } where `reloading` is the reload actions still owed,
 * counting the one in progress. No state yet means fully loaded. In a fight the action of the turn the reload starts
 * is the first; each of the wielder's later turns spends one more, and the gun is ready at the start of the turn after
 * the last (a 1-round reload started this turn fires next turn). Out of a fight a reload is done at once.
 */
import { firearmOf } from "./combat.mjs";

const SYS = "arneyan";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const textOf = item => `${item?.system?.description ?? ""} ${item?.system?.traits ?? ""}`.replace(/<[^>]+>/g, " ");

/** A weapon that has to be reloaded: a firearm, or a heavy crossbow. */
export function isReloadable(item) {
  if (item?.type !== "weapon") return false;
  return !!firearmOf(item) || /^crossbow,\s*heavy$|^heavy crossbow$/i.test(String(item.name ?? "").trim());
}

/** Shots it holds: "5 shots per reload", "6 shots"; Paired Pistols two (one each); otherwise one. */
export function capacityOf(item) {
  const t = textOf(item);
  const m = t.match(/(\d+)\s+shots?\b/i);
  if (m) return Math.max(1, Number(m[1]));
  if (/\bpaired pistols\b/i.test(item?.name ?? "") || /\bea\./i.test(t)) return 2;
  return 1;
}

/** The weapon's listed reload, in rounds ("1 rd", "2 rounds", "4 rd (full)"); a heavy crossbow 1. */
export function listedRounds(item) {
  const fire = firearmOf(item);
  const s = fire?.reload ?? "";
  const n = Number(String(s).match(/(\d+)/)?.[1]);
  if (Number.isFinite(n)) return n;
  return isReloadable(item) ? 1 : 0;
}

/** Rounds of action a full reload takes for this wielder: Quick Reload 0, Lightning Reload one less (never below 0). */
export function reloadRounds(item, actor = item?.actor ?? null) {
  if (!isReloadable(item)) return 0;
  if (/\bquick reload\b/i.test(textOf(item))) return 0;
  let n = listedRounds(item);
  // "1 rd ea." (Paired Pistols): each gun takes its own round.
  if (/\bea\b/i.test(firearmOf(item)?.reload ?? "")) n *= Math.max(1, capacityOf(item) - loadedOf(item));
  const lightning = !!firearmOf(item) && [...(actor?.items ?? [])].some(i => /^lightning reload$/i.test(String(i.name ?? "").trim()));
  if (lightning) n = Math.max(0, n - 1);
  return n;
}

export function ammoOf(item) {
  const cap = capacityOf(item);
  const a = item?.flags?.[SYS]?.ammo ?? {};
  const loaded = Number.isFinite(Number(a.loaded)) ? Math.max(0, Math.min(cap, Number(a.loaded))) : cap;
  return { loaded, capacity: cap, reloading: Math.max(0, Number(a.reloading) || 0) };
}
export const loadedOf = item => ammoOf(item).loaded;

/** A shot fired: one fewer loaded. With no reload time (Quick Reload, Lightning Reload at 1 round) it reloads at once. */
export async function spendShot(item) {
  if (!isReloadable(item) || !item.isOwner) return null;
  const a = ammoOf(item);
  const quick = reloadRounds(item) === 0;
  const loaded = quick ? a.capacity : Math.max(0, a.loaded - 1);
  await item.setFlag(SYS, "ammo", { loaded, reloading: 0 });
  return loaded;
}

/** Is this actor (this very token, for an unlinked one) in a fight that has started? */
export function inFight(actor) {
  if (!actor) return false;
  return !!fightOf(actor);
}
/** The started fight this actor is in. A sheet opened from the sidebar (the base actor) counts its linked or unlinked token. */
function fightOf(actor) {
  if (!actor) return null;
  const mine = x => (x.actor && x.actor.uuid === actor.uuid) || (!actor.isToken && x.actorId === actor.id);
  return game.combats?.find?.(c => c.started && c.combatants.some(mine)) ?? null;
}
/** Is it this actor's turn in that fight? */
function onTurn(combat, actor) {
  const x = combat?.combatant;
  return !!x && ((x.actor && x.actor.uuid === actor?.uuid) || (!actor?.isToken && x.actorId === actor?.id));
}

/** Start reloading: done now out of a fight (or if it takes no time), else over the wielder's turns. */
export async function startReload(item, { inCombat = null } = {}) {
  if (!isReloadable(item) || !item.isOwner) return null;
  const a = ammoOf(item);
  const actor = item.actor;
  const fighting = inCombat ?? inFight(actor);
  if (a.loaded >= a.capacity) { ui.notifications.info(`${item.name} is already loaded.`); return a; }
  if (fighting && a.reloading > 0) { ui.notifications.info(`${item.name} is being reloaded: ${a.reloading} more action${a.reloading === 1 ? "" : "s"}.`); return a; }
  const rounds = reloadRounds(item, actor);
  if (!fighting || !rounds) {
    await item.setFlag(SYS, "ammo", { loaded: a.capacity, reloading: 0 });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${esc(actor?.name ?? "")} reloads ${esc(item.name)}.</p>` });
    return ammoOf(item);
  }
  // Started outside the wielder's own turn: their next turn's action is the first.
  const combat = inCombat === null ? fightOf(actor) : null;
  const offTurn = !!combat && !onTurn(combat, actor);
  await item.setFlag(SYS, "ammo", { loaded: a.loaded, reloading: rounds + (offTurn ? 1 : 0) });
  const more = rounds - 1;
  const first = offTurn ? "their next turn's action" : "this turn's action";
  const then = more ? ` and ${more === 1 ? "the turn after's" : `the next ${more} turns'`}` : "";
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${esc(actor?.name ?? "")} reloads ${esc(item.name)}: ${first}${then}, then it's ready to fire. Moving is still fine.</p>` });
  return ammoOf(item);
}

/** A combatant's turn starts: a reload action owed from the last turn is done; one still owed takes this turn's action. */
export async function advanceReloads(actor) {
  for (const item of [...(actor?.items ?? [])].filter(i => isReloadable(i) && ammoOf(i).reloading > 0)) {
    const a = ammoOf(item);
    const left = a.reloading - 1;
    await item.setFlag(SYS, "ammo", { loaded: left ? a.loaded : a.capacity, reloading: left });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p>${esc(actor.name)} ${left ? `keeps reloading ${esc(item.name)}: this turn's action${left > 1 ? ` (${left - 1} more after this)` : ""}, ready to fire next turn` : `has reloaded ${esc(item.name)}: ready to fire`}.</p>` });
  }
}

/** Before firing: an empty weapon can't fire. Returns true to go ahead. */
export async function loadedReady(item) {
  if (!isReloadable(item)) return true;
  const a = ammoOf(item);
  if (a.loaded > 0) return true;
  const rounds = reloadRounds(item);
  const fighting = inFight(item.actor);
  const busy = fighting && a.reloading > 0;
  const { DialogV2 } = foundry.applications.api;
  const note = busy ? ` It's being reloaded: ${a.reloading} more action${a.reloading === 1 ? "" : "s"}.` : "";
  const res = await DialogV2.wait({
    window: { title: item.name, icon: "fa-solid fa-gun" }, classes: ["arneyan"], position: { width: 380 },
    content: `<p><strong>${esc(item.name)}</strong> is empty.${note} Reloading takes ${!fighting ? "no time out of a fight" : rounds ? `${rounds === 1 ? "this turn's action" : `this turn's action and ${rounds === 2 ? "the next turn's" : `the next ${rounds - 1} turns'`}`}, ready to fire ${rounds === 1 ? "next turn" : "after that"} (you can still move)` : "no time"}.</p>`,
    buttons: [
      ...(busy ? [] : [{ action: "reload", label: "Reload", icon: "fa-solid fa-rotate", default: true }]),
      ...(game.user.isGM ? [{ action: "fire", label: "Fire anyway (GM)" }] : []),
      { action: "cancel", label: "Cancel" }
    ],
    rejectClose: false
  });
  if (res === "fire") return true;
  if (res === "reload") {
    await startReload(item, { inCombat: fighting });
    // Loaded at once (no time, or out of a fight): fire. Otherwise the reload took this turn's action.
    return ammoOf(item).loaded > 0;
  }
  return false;
}

/** Which turn each fight last spent reloads for, so a turn re-sent (initiative rolled, a combatant added) or stepped back to doesn't spend another. */
const spentFor = new Map();
export function turnKey(combat) { return `${combat?.round ?? 0}:${combat?.combatant?.id ?? ""}`; }

export function registerReload() {
  // Each combatant's turn spends a round of its reloads (the active GM writes them). Going back a turn doesn't.
  Hooks.on("updateCombat", (combat, changes, options) => {
    if (!game.users.activeGM?.isSelf || !("turn" in changes || "round" in changes) || !combat.started) return;
    if (options?.direction === -1) return;
    const key = turnKey(combat);
    const seen = spentFor.get(combat.id) ?? new Set();
    if (seen.has(key)) return;
    seen.add(key);
    spentFor.set(combat.id, seen);
    const actor = combat.combatant?.actor;
    if (actor) advanceReloads(actor).catch(err => console.warn("Arneyan | reload", err));
  });
  // The fight's over: reloads in progress finish (there's time now).
  Hooks.on("deleteCombat", combat => {
    spentFor.delete(combat.id);
    if (!game.users.activeGM?.isSelf) return;
    for (const c of combat.combatants ?? []) {
      for (const item of [...(c.actor?.items ?? [])].filter(i => isReloadable(i) && ammoOf(i).reloading > 0)) {
        item.setFlag(SYS, "ammo", { loaded: ammoOf(item).capacity, reloading: 0 }).catch(err => console.warn("Arneyan | reload", err));
      }
    }
  });
}

/**
 * Reloading (Batch 8, Kieran 25 Oct 2026; Handbook v0.10.10, Firearms): reloading uses your action for the weapon's
 * listed number of rounds (you can still move). Quick Reload (the weapon trait) and a Gunslinger's Lightning Reload
 * (one round faster; at least, reload as part of the attack that fired the shot) shorten it. A heavy crossbow takes a
 * round to reload after each shot. Guns that hold several shots (the Repeating Pistol's 5, the Wind Rifle's 6) fire
 * that many before reloading.
 *
 * State on the weapon (flags.arneyan.ammo): { loaded, reloading } where `reloading` is the rounds of action still to
 * spend. No state yet means fully loaded. In a fight, each of the wielder's turns spends one round; out of a fight a
 * reload is done at once.
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

/** Start reloading: done now out of a fight (or if it takes no time), else over the wielder's next turns. */
export async function startReload(item, { inCombat = null } = {}) {
  if (!isReloadable(item) || !item.isOwner) return null;
  const a = ammoOf(item);
  if (a.loaded >= a.capacity) { ui.notifications.info(`${item.name} is already loaded.`); return a; }
  const actor = item.actor;
  const rounds = reloadRounds(item, actor);
  const fighting = inCombat ?? !!game.combats?.find?.(c => c.started && c.combatants.some(x => x.actor?.id === actor?.id));
  // This turn's action is the first round of it.
  const left = fighting ? Math.max(0, rounds - 1) : 0;
  if (!left) {
    await item.setFlag(SYS, "ammo", { loaded: a.capacity, reloading: 0 });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${esc(actor?.name ?? "")} reloads ${esc(item.name)}${fighting && rounds ? " (this turn's action)" : ""}.</p>` });
    return ammoOf(item);
  }
  await item.setFlag(SYS, "ammo", { loaded: a.loaded, reloading: left });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${esc(actor?.name ?? "")} starts reloading ${esc(item.name)}: ${rounds} rounds of action (this turn's and the next ${left}). Moving is still fine.</p>` });
  return ammoOf(item);
}

/** A combatant's turn starts: its reloading weapons spend this turn's action and may finish. */
export async function advanceReloads(actor) {
  for (const item of [...(actor?.items ?? [])].filter(i => isReloadable(i) && ammoOf(i).reloading > 0)) {
    const a = ammoOf(item);
    const left = a.reloading - 1;
    await item.setFlag(SYS, "ammo", { loaded: left ? a.loaded : a.capacity, reloading: left });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p>${esc(actor.name)} ${left ? `keeps reloading ${esc(item.name)} (this turn's action; ${left} more)` : `finishes reloading ${esc(item.name)} (this turn's action): ready to fire next turn`}.</p>` });
  }
}

/** Before firing: an empty weapon can't fire. Returns true to go ahead. */
export async function loadedReady(item) {
  if (!isReloadable(item)) return true;
  const a = ammoOf(item);
  if (a.loaded > 0) return true;
  const rounds = reloadRounds(item);
  const { DialogV2 } = foundry.applications.api;
  const busy = a.reloading > 0 ? ` It's being reloaded: ${a.reloading} more round${a.reloading === 1 ? "" : "s"} of action.` : "";
  const res = await DialogV2.wait({
    window: { title: item.name, icon: "fa-solid fa-gun" }, classes: ["arneyan"], position: { width: 380 },
    content: `<p><strong>${esc(item.name)}</strong> is empty.${busy} Reloading takes ${rounds ? `${rounds} round${rounds === 1 ? "" : "s"} of your action (you can still move)` : "no time"}.</p>`,
    buttons: [
      ...(a.reloading ? [] : [{ action: "reload", label: "Reload", icon: "fa-solid fa-rotate", default: true }]),
      ...(game.user.isGM ? [{ action: "fire", label: "Fire anyway (GM)" }] : []),
      { action: "cancel", label: "Cancel" }
    ],
    rejectClose: false
  });
  if (res === "fire") return true;
  if (res === "reload") {
    await startReload(item);
    // Loaded at once (no time, or out of a fight): it still took this turn's action unless it was free.
    return rounds === 0;
  }
  return false;
}

export function registerReload() {
  // Each combatant's turn spends a round of its reloads (the active GM writes them).
  Hooks.on("updateCombat", (combat, changes) => {
    if (!game.users.activeGM?.isSelf || !("turn" in changes || "round" in changes) || !combat.started) return;
    const actor = combat.combatant?.actor;
    if (actor) advanceReloads(actor).catch(err => console.warn("Arneyan | reload", err));
  });
}

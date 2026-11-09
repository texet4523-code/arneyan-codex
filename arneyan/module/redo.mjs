/**
 * Advantage and Disadvantage after the roll on every d20 (Kieran, 9 Nov 2026: "need that for every roll in general",
 * buttons that redo the result). The card's buttons (rolls.mjs secondDie) change the roll; what the roll had already
 * decided is worked out again here: a contest's winner (and its grapple, Prone or Dirty Trick), a firearm's misfire,
 * Last Chance stabilising. Initiative messages get the buttons too, and change the combatant's initiative.
 */
import { contestRedoHere, redoContest, firearmOf, misfireResult, misfireHtml, jamGun } from "./combat.mjs";
import { lastChanceOk } from "./documents.mjs";
import { outcomeFor } from "./rolls.mjs";
import { unset } from "./compat.mjs";

const SYS = "arneyan";
const SOCKET = `system.${SYS}`;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/* -------------------------------------------- */
/*  After a roll changes                        */
/* -------------------------------------------- */

/** On the client that changed the card (the roller or the GM): what the roll decided, worked out again. */
async function onRollChanged(message) {
  const f = message?.flags?.[SYS];
  if (!f) return;
  if (f.kind === "contest") await contestChanged(message);
  if (f.lastChance) await lastChanceChanged(message);
  if (f.kind === "attack" && f.gun) await gunChanged(message);
}

async function contestChanged(message) {
  const f = message.flags[SYS];
  const id = f.contest?.resultId || f.contestResultId;
  const result = id ? game.messages.get(id) : null;
  // Not worked out yet: the contest reads the card as it stands when it is.
  if (!result) return;
  if (await contestRedoHere(result)) return redoContest(result);
  if (!game.users.activeGM) return ui.notifications.warn("No GM is connected to work the contest out again.");
  game.socket.emit(SOCKET, { action: "contestRedo", resultId: result.id });
}

/** Last Chance (Fort DC 10): stabilised or still dying, as the save now stands. */
async function lastChanceChanged(message) {
  const f = message.flags[SYS];
  const actor = f.actorUuid ? await fromUuid(f.actorUuid).catch(() => null) : null;
  if (!actor?.isOwner || f.lastChanceOk === undefined) return;
  const ok = lastChanceOk(f);
  if (ok === !!f.lastChanceOk) return;
  if (message.canUserModify(game.user, "update")) await message.setFlag(SYS, "lastChanceOk", ok);
  if (ok) await actor.update({ "system.attributes.stable": true, ...unset(`flags.${SYS}.lastChance`) });
  else await actor.update({ "system.attributes.stable": false, [`flags.${SYS}.lastChance`]: true });
  return ChatMessage.create({ speaker: message.speaker, content: `<div class="arn-card"><p>${esc(actor.name)}'s Last Chance, worked out again: ${ok
    ? "stabilised after all, and stops bleeding."
    : "not stabilised after all. Still dying: only an ally (a Wisdom check, DC 10) or First Aid can stabilise them now."}</p></div>` });
}

/** A firearm's misfire, from the kept die: the jam put on or taken off, and the card's footer to match. */
async function gunChanged(message) {
  const f = message.flags[SYS];
  const actor = f.actorUuid ? await fromUuid(f.actorUuid).catch(() => null) : null;
  const item = actor?.items?.get?.(f.itemId);
  const fire = firearmOf(item);
  if (!item || !fire || !item.isOwner || !message.canUserModify(game.user, "update")) return;
  const shown = (Number(f.total) || 0) + (Number(f.luckBurned) || 0);
  const crit = !!f.crit;
  const now = misfireResult(fire, f.natural, { trained: f.gun.trained !== false, crit });
  const was = f.gunJam ?? null;
  const html = new DOMParser().parseFromString(message.content, "text/html");
  const foot = html.querySelector(".arn-footer");
  if (now.jam) {
    if (foot) foot.innerHTML = misfireHtml(item, fire, f.natural, now);
  } else if (foot && foot.querySelector(".arn-misfire")) {
    const many = (f.targets ?? []).length > 1;
    const outcome = many ? "" : outcomeFor(shown, f.natural, f.target, "attack", false, f.critAt ?? 20);
    const which = f.natural === 1 && !crit ? "nat1" : crit ? "crit" : outcome === "failure" || outcome === "nat1" ? "miss" : outcome === "success" || outcome === "nat20" ? "hit" : "plain";
    foot.innerHTML = f.footers?.[which] ?? "";
  }
  await message.update({ content: html.body.innerHTML });

  const { isReloadable } = await import("./reload.mjs");
  if (now.jam && !was) {
    // Jams now: it needs clearing and a reload (and a natural 1 rolls the catastrophe).
    await jamGun(actor, item, message, { reloadable: isReloadable(item), catastrophe: now.catastrophe });
  } else if (!now.jam && was) {
    // Doesn't misfire after all: back as it was before the shot jammed it.
    const before = f.gunBefore ?? {};
    if (before.state) await item.setFlag(SYS, "gunState", before.state);
    else await item.unsetFlag(SYS, "gunState");
    if (before.ammo) await item.setFlag(SYS, "ammo", before.ammo);
    await message.update({ ...unset(`flags.${SYS}.gunJam`) });
    await ChatMessage.create({ speaker: message.speaker, content: `<div class="arn-card"><p>${esc(item.name)} doesn't misfire after all: it's back as it was, still loaded.${was.catastrophe
      ? " The catastrophic misfire is undone too: undo any damage it dealt from its damage card." : ""}</p></div>` });
  } else if (now.jam && was && was.catastrophe !== now.catastrophe) {
    if (now.catastrophe) {
      await jamGun(actor, item, null, { catastrophe: true });
    } else {
      // Still a misfire, but not a natural 1 now: jammed, not damaged or destroyed.
      await item.setFlag(SYS, "gunState", "jammed");
      await ChatMessage.create({ speaker: message.speaker, content: `<div class="arn-card"><p>${esc(item.name)} still jams, but it isn't a natural 1 now: no catastrophe. Undo any damage it dealt from its damage card.</p></div>` });
    }
    await message.setFlag(SYS, "gunJam", { catastrophe: now.catastrophe });
  }
}

/* -------------------------------------------- */
/*  Initiative                                  */
/* -------------------------------------------- */

/** The d20s of an initiative roll and its Advantage: "2d20kh + 3" is Advantage. */
export function initiativeDice(roll) {
  const die = roll?.dice?.[0];
  if (!die || Number(die.faces) !== 20) return null;
  const mods = (die.modifiers ?? []).join("");
  const mode = /kh/.test(mods) ? 1 : /kl/.test(mods) ? -1 : 0;
  const results = (die.results ?? []).map(r => r.result);
  const natural = Number(die.total) || 0;
  return { mode, dice: results, natural, total: Number(roll.total) || 0 };
}

/** Which die is kept after the second: the higher with Advantage, the lower with Disadvantage; the other cancels. */
export function keptAfter(natural, second, dir, { cancel = false, first = natural } = {}) {
  if (cancel) return first;
  return dir > 0 ? Math.max(natural, second) : Math.min(natural, second);
}

/** A core initiative message: note the combatant it set, so the buttons can change it. */
function onPreCreateMessage(message) {
  if (!message.getFlag?.("core", "initiativeRoll")) return;
  const d = initiativeDice(message.rolls?.[0]);
  if (!d) return;
  const sp = message.speaker ?? {};
  for (const combat of game.combats ?? []) {
    if (sp.scene && combat.scene && combat.scene.id !== sp.scene) continue;
    const c = combat.combatants.find(x => (sp.token ? x.tokenId === sp.token : x.actorId === sp.actor) && x.initiative === d.total);
    if (!c) continue;
    message.updateSource({ [`flags.${SYS}`]: { kind: "initiative", combatId: combat.id, combatantId: c.id, natural: d.natural, dice: d.dice, mode: d.mode, total: d.total } });
    return;
  }
}

/** The initiative message's buttons (and, once pressed, what changed). */
function onRenderMessage(message, html) {
  const f = message.flags?.[SYS];
  if (f?.kind !== "initiative" || !html?.querySelector) return;
  const box = html.querySelector(".message-content") ?? html;
  if (f.secondDie) {
    const p = document.createElement("p");
    p.className = "arn-card-meta arn-init-second";
    p.textContent = f.secondNote ?? "";
    box.append(p);
    return;
  }
  const combatant = game.combats.get(f.combatId)?.combatants.get(f.combatantId);
  if (!combatant || !(game.user.isGM || combatant.isOwner) || !message.canUserModify(game.user, "update")) return;
  const wrap = document.createElement("div");
  wrap.className = "arn-second arn-dmg-buttons";
  const btn = (dir, label, icon, tip) => `<button type="button" class="arn-init-second-die" data-dir="${dir}" data-tooltip="${esc(tip)}"><i class="fa-solid ${icon}"></i> ${label}</button>`;
  wrap.innerHTML = [f.mode <= 0 ? btn(1, "Advantage", "fa-angles-up", f.mode < 0 ? "Cancels the Disadvantage: the first die counts" : "Roll a second d20 and keep the higher") : "",
    f.mode >= 0 ? btn(-1, "Disadvantage", "fa-angles-down", f.mode > 0 ? "Cancels the Advantage: the first die counts" : "Roll a second d20 and keep the lower") : ""].join("");
  box.append(wrap);
  wrap.querySelectorAll("button").forEach(b => b.addEventListener("click", ev => {
    ev.preventDefault();
    if (b.dataset.busy) return;
    b.dataset.busy = "1";
    initiativeSecondDie(message, Number(b.dataset.dir) || 1).catch(err => { console.error("Arneyan |", err); ui.notifications.error(err.message); }).finally(() => { delete b.dataset.busy; });
  }));
}

/** Advantage or Disadvantage on initiative after the roll: the combatant's initiative (and its group's) changes. */
export async function initiativeSecondDie(message, dir) {
  const f = message.flags?.[SYS];
  if (f?.kind !== "initiative" || f.secondDie || message._arnSecond) return;
  const combat = game.combats.get(f.combatId);
  const combatant = combat?.combatants.get(f.combatantId);
  if (!combatant) return ui.notifications.warn("That combatant is no longer in the fight.");
  const cancel = !!f.mode && Math.sign(f.mode) === -Math.sign(dir) && (f.dice ?? []).length >= 2;
  if (f.mode && !cancel) return;
  message._arnSecond = true;
  let second = 0;
  if (!cancel) {
    const roll = await new Roll("1d20").evaluate();
    await Promise.resolve(game.dice3d?.showForRoll?.(roll, game.user, true, message.whisper?.length ? [...message.whisper] : null, !!message.blind)).catch(() => null);
    second = roll.total;
  }
  if (game.messages.get(message.id)?.flags?.[SYS]?.secondDie) return;
  const kept = keptAfter(f.natural, second, dir, { cancel, first: Number(f.dice?.[0]) || f.natural });
  const total = f.total - f.natural + kept;
  const label = dir > 0 ? "Advantage" : "Disadvantage";
  const note = cancel ? `${label} cancels: the first die counts. Initiative ${total}.` : `${label}: second d20 ${second}, initiative ${total}.`;
  // The ones that share this roll (a group of the same monster) and a solo's second turn follow it.
  const old = combatant.initiative;
  const updates = [{ _id: combatant.id, initiative: total }];
  if (combatant.actor?.type === "npc" && game.settings.get(SYS, "groupInitiative")) {
    const key = c => `${c.actorId ?? ""}|${c.token?.name ?? c.name}`;
    for (const c of combat.combatants) if (c.id !== combatant.id && key(c) === key(combatant) && c.initiative === old && !c.flags?.[SYS]?.soloOf) updates.push({ _id: c.id, initiative: total });
  }
  const { secondInitiative } = await import("./solo.mjs");
  for (const t of combat.combatants.filter(c => c.flags?.[SYS]?.soloOf && updates.some(u => u._id === c.flags[SYS].soloOf))) {
    updates.push({ _id: t.id, initiative: secondInitiative(total, combat.combatants.filter(c => c.id !== t.id && !updates.some(u => u._id === c.id)).map(c => c.initiative)) });
  }
  await combat.updateEmbeddedDocuments("Combatant", updates.filter(u => combat.combatants.get(u._id)?.isOwner), { arneyanSolo: true });
  await message.update({ [`flags.${SYS}.secondDie`]: dir, [`flags.${SYS}.natural`]: kept, [`flags.${SYS}.total`]: total, [`flags.${SYS}.secondNote`]: note });
  return total;
}

export function registerRedo() {
  Hooks.on("arneyanRollChanged", message => { onRollChanged(message).catch(err => console.error("Arneyan | redo", err)); });
  Hooks.on("preCreateChatMessage", onPreCreateMessage);
  Hooks.on("renderChatMessageHTML", onRenderMessage);
}

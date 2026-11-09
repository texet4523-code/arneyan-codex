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
  if (f.downtime) await downtimeChanged(message);
  if (f.scroll) await scrollChanged(message);
}

/**
 * A downtime check, worked out again: income and a single check (crafting, brewing...) change the log entry and the
 * purse; learning with retries and carousing (later rolls followed from this one) get a note for the GM.
 */
async function downtimeChanged(message) {
  const f = message.flags[SYS], d = f.downtime;
  const actor = d.actorUuid ? await fromUuid(d.actorUuid).catch(() => null) : null;
  if (!actor?.isOwner) return;
  const D = await import("./downtime.mjs");
  const total = (Number(f.total) || 0) + (Number(f.luckBurned) || 0);
  const log = foundry.utils.deepClone(actor.getFlag(SYS, "downtime") ?? []);
  const entry = log.find(e => e.id === d.entryId);
  if (!entry) return;
  let purse = { ...actor.system.currency }, note = "", flag = {};
  if (d.kind === "income") {
    const perDay = D.incomePerDay(total), earn = perDay * 6, delta = earn - (Number(d.earn) || 0);
    if (!delta) note = `still ${D.cpText(earn)}`;
    else if (delta > 0) { purse = D.addCoins(purse, delta); note = `${D.cpText(earn)} now, ${D.cpText(delta)} more added`; }
    else {
      const paid = D.payCoins(purse, -delta);
      if (paid) { purse = paid; note = `${D.cpText(earn)} now, ${D.cpText(-delta)} taken back`; }
      else note = `${D.cpText(earn)} now; ${D.cpText(-delta)} should come back, but the purse is short (the GM takes it)`;
    }
    entry.roll = `${total}`;
    entry.result = `Earned ${D.cpText(earn)} (${D.cpText(perDay)} a day for 6 days).`;
    // What the purse really got: coins that couldn't be taken back still count as given.
    flag = { earn: delta < 0 && note.includes("purse is short") ? Number(d.earn) || 0 : earn };
  } else if (d.kind === "check" && d.dc !== null) {
    const ok = total >= d.dc;
    entry.roll = `${total} vs DC ${d.dc}`;
    if (ok === !!d.ok) note = ok ? "still a success" : "still a failure";
    // Whether the half kept on a failure is in the purse now (it may not have been taken back).
    let kept = d.kept ?? !d.ok;
    if (ok === !!d.ok) note = ok ? "still a success" : "still a failure";
    else if (ok) {
      entry.result = `Success: ${d.title} is finished.`;
      const paid = d.half && kept ? D.payCoins(purse, d.half) : purse;
      if (paid && d.half && kept) { purse = paid; kept = false; }
      note = `a success now: ${d.title} is finished${d.half ? (kept ? ` (the ${D.cpText(d.half)} kept should go back into it, but the purse is short)` : ` (the ${D.cpText(d.half)} kept goes back into it)`) : ""}`;
    } else {
      if (d.half && !kept) { purse = D.addCoins(purse, d.half); kept = true; }
      entry.result = `Failure: the time is spent and it isn't finished; half the gold is lost${d.half ? ` (${D.cpText(d.half)} kept)` : ""}.`;
      note = `a failure now: not finished${d.half ? `, ${D.cpText(d.half)} back in the purse` : ""}`;
    }
    flag = { ok, kept };
  } else {
    // Later rolls (more weeks of learning) or the Carousing table followed from this one: the GM adjusts the entry.
    return ChatMessage.create({ speaker: message.speaker, content: `<div class="arn-card"><p>${esc(actor.name)}'s downtime check (${esc(d.title)}) is now <strong>${total}</strong>${d.dc !== null ? ` against DC ${d.dc}` : ""}. What followed from it was worked out from the first roll: change it on the Downtime tab if it should be different.</p></div>` });
  }
  await actor.update({ [`flags.${SYS}.downtime`]: log, ...Object.fromEntries(Object.entries(purse).map(([k, v]) => [`system.currency.${k}`, v])) });
  if (message.canUserModify(game.user, "update")) await message.setFlag(SYS, "downtime", { ...d, ...flag });
  return ChatMessage.create({ speaker: message.speaker, content: `<div class="arn-card"><p>${esc(actor.name)}'s downtime (${esc(d.title)}), worked out again with ${total}: ${esc(note)}.</p></div>` });
}

/** An unknown scroll's check: failed before and passed now, the spell takes hold after all (the scroll is gone either way). */
async function scrollChanged(message) {
  const f = message.flags[SYS], s = f.scroll;
  const actor = s.actorUuid ? await fromUuid(s.actorUuid).catch(() => null) : null;
  if (!actor?.isOwner) return;
  const { scrollCheckOk, castSpellCard } = await import("./gear.mjs");
  const ok = scrollCheckOk(f, s.dc);
  if (ok === !!s.ok) return;
  const cast = !!s.cast || ok;
  if (message.canUserModify(game.user, "update")) await message.setFlag(SYS, "scroll", { ...s, ok, cast });
  if (ok && s.cast) return ChatMessage.create({ speaker: message.speaker, content: `<div class="arn-card"><p>${esc(actor.name)}'s scroll check passes again: the spell was cast already (if the GM undid it, it takes hold again).</p></div>` });
  if (ok) return castSpellCard(actor, s.spell, { cl: s.cl, dc: s.castDc, from: "a scroll (the check passed after all)" });
  return ChatMessage.create({ speaker: message.speaker, content: `<div class="arn-card"><p>${esc(actor.name)}'s scroll check is a failure now: the spell shouldn't have taken hold. The GM undoes what it did.</p></div>` });
}

async function contestChanged(message) {
  const f = message.flags[SYS];
  const id = f.contest?.resultId || f.contestResultId;
  const result = id ? game.messages.get(id) : null;
  // Not worked out yet: the contest reads the card as it stands when it is.
  if (!result) return;
  // On one client only (the GM's when one is connected), so two presses at once queue up there.
  const gm = game.users.activeGM;
  if (gm && !gm.isSelf) return game.socket.emit(SOCKET, { action: "contestRedo", resultId: result.id });
  if (await contestRedoHere(result)) return redoContest(result);
  ui.notifications.warn("No GM is connected to work the contest out again.");
}

/** Last Chance (Fort DC 10): stabilised or still dying, as the save now stands. */
async function lastChanceChanged(message) {
  const f = message.flags[SYS];
  const actor = f.actorUuid ? await fromUuid(f.actorUuid).catch(() => null) : null;
  if (!actor?.isOwner || f.lastChanceOk === undefined) return;
  const ok = lastChanceOk(f);
  if (ok === !!f.lastChanceOk) return;
  // Healed, dead or helped since: the card is history, nothing changes now.
  const hp = Number(actor.system?.attributes?.hp?.value) || 0;
  if (hp >= 0 || actor.system?.attributes?.state === "dead") return;
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
    // Only what the jam did, and only while the gun is still as the jam left it (not cleared, reloaded or fired since).
    const before = f.gunBefore ?? null;
    const state = item.getFlag(SYS, "gunState");
    const ammo = item.getFlag(SYS, "ammo");
    let restored = false;
    if (["jammed", "damaged", "destroyed"].includes(state) && item.getFlag(SYS, "jamBy") === message.id) {
      await item.unsetFlag(SYS, "jamBy");
      if (before?.state) await item.setFlag(SYS, "gunState", before.state);
      else await item.unsetFlag(SYS, "gunState");
      if (before?.ammo && ammo && !Number(ammo.loaded) && !Number(ammo.reloading)) { await item.setFlag(SYS, "ammo", before.ammo); restored = Number(before.ammo.loaded) > 0; }
    }
    await message.update({ ...unset(`flags.${SYS}.gunJam`) });
    await ChatMessage.create({ speaker: message.speaker, content: `<div class="arn-card"><p>${esc(item.name)} doesn't misfire after all: it isn't jammed${restored ? ", and what was loaded is back" : ""}.${was.catastrophe
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
  if (combatant.initiative !== f.total) return ui.notifications.warn(`${combatant.name}'s initiative has changed since this roll.`);
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

/* -------------------------------------------- */
/*  Any other d20 in chat                       */
/* -------------------------------------------- */

/** Cards with their own buttons (rolls.mjs, the initiative ones above). */
const HANDLED = new Set(["attack", "check", "save", "skill", "contest", "luck", "initiative"]);

/** The first single d20 of a message's rolls (1d20, or 2d20 keeping one): { roll, die, mode, dice, natural }. */
export function d20Of(message) {
  const roll = (message?.rolls ?? [])[0];
  if (!roll) return null;
  const dice = roll.dice ?? [];
  const die = dice.find(d => Number(d.faces) === 20);
  // One d20 (not several d20 rolls in one message), added to the rest: never "10 - 1d20", "1d20 * 2", exploding or counted.
  if (!die || dice.filter(d => Number(d.faces) === 20).length > 1) return null;
  const mods = (die.modifiers ?? []).map(String);
  if (mods.some(m => !/^k[hl]1?$/.test(m))) return null;
  const terms = roll.terms ?? [];
  const i = terms.indexOf(die);
  if (i >= 0) {
    const op = t => t?.operator ?? (typeof t?.formula === "string" && /^[-+*/%]$/.test(t.formula.trim()) ? t.formula.trim() : null);
    if (i > 0 && op(terms[i - 1]) !== "+") return null;
    if (["*", "/", "%"].includes(op(terms[i + 1]))) return null;
  }
  const mode = mods.some(m => m.startsWith("kh")) ? 1 : mods.some(m => m.startsWith("kl")) ? -1 : 0;
  const n = Number(die.number) || (die.results ?? []).length;
  if (!(n === 1 || (n === 2 && mode))) return null;
  return { roll, die, mode, dice: (die.results ?? []).map(r => r.result), natural: Number(die.total) || 0 };
}

/** A table draw's table: a world table, or one of the system's (the compendium). */
async function drawTable(message) {
  const id = message.getFlag?.("core", "RollTable");
  if (!id) return null;
  return game.tables?.get?.(id) ?? await game.packs?.get?.(`${SYS}.tables`)?.getDocument?.(id).catch(() => null) ?? null;
}

/** Buttons on any other message with a d20 (a typed /roll, an inline roll, a table draw, a module's roll). */
function onRenderAny(message, html) {
  const f = message.flags?.[SYS] ?? {};
  // An initiative roll this system didn't tag (a summon's, a solo's second turn): the tracker sets those.
  if (HANDLED.has(f.kind) || !html?.querySelector || message.getFlag?.("core", "initiativeRoll") || message.isContentVisible === false) return;
  const found = d20Of(message);
  if (!found) return;
  const box = html.querySelector(".message-content") ?? html;
  if (f.anyD20?.secondDie) {
    const p = document.createElement("p");
    p.className = "arn-card-meta arn-any-second";
    p.textContent = f.anyD20.note ?? "";
    box.append(p);
    return;
  }
  if (!(game.user.isGM || message.isAuthor) || !message.canUserModify(game.user, "update")) return;
  const wrap = document.createElement("div");
  wrap.className = "arn-second arn-dmg-buttons";
  const btn = (dir, label, icon, tip) => `<button type="button" class="arn-any-second-die" data-dir="${dir}" data-tooltip="${esc(tip)}"><i class="fa-solid ${icon}"></i> ${label}</button>`;
  wrap.innerHTML = [found.mode <= 0 ? btn(1, "Advantage", "fa-angles-up", found.mode < 0 ? "Cancels the Disadvantage: the first die counts" : "Roll a second d20 and keep the higher") : "",
    found.mode >= 0 ? btn(-1, "Disadvantage", "fa-angles-down", found.mode > 0 ? "Cancels the Advantage: the first die counts" : "Roll a second d20 and keep the lower") : ""].join("");
  box.append(wrap);
  wrap.querySelectorAll("button").forEach(b => b.addEventListener("click", ev => {
    ev.preventDefault();
    if (b.dataset.busy) return;
    b.dataset.busy = "1";
    anyD20SecondDie(message, Number(b.dataset.dir) || 1).catch(err => { console.error("Arneyan |", err); ui.notifications.error(err.message); }).finally(() => { delete b.dataset.busy; });
  }));
}

/** Advantage or Disadvantage after any other d20: the new total (and, for a table draw, what it lands on). */
export async function anyD20SecondDie(message, dir) {
  const f = message.flags?.[SYS] ?? {};
  const found = d20Of(message);
  if (!found || f.anyD20?.secondDie || message._arnSecond) return;
  const cancel = !!found.mode && Math.sign(found.mode) === -Math.sign(dir) && found.dice.length >= 2;
  if (found.mode && !cancel) return;
  message._arnSecond = true;
  let second = 0;
  if (!cancel) {
    const roll = await new Roll("1d20").evaluate();
    await Promise.resolve(game.dice3d?.showForRoll?.(roll, game.user, true, message.whisper?.length ? [...message.whisper] : null, !!message.blind)).catch(() => null);
    second = roll.total;
  }
  if (game.messages.get(message.id)?.flags?.[SYS]?.anyD20?.secondDie) return;
  const kept = keptAfter(found.natural, second, dir, { cancel, first: found.dice[0] });
  const total = (Number(found.roll.total) || 0) - found.natural + kept;
  const label = dir > 0 ? "Advantage" : "Disadvantage";
  let note = cancel ? `${label} cancels: the first die counts, so the total is ${total}.` : `${label}: second d20 ${second}, so the total is ${total}.`;
  // A table draw: what the new total lands on.
  // Every result in range, drawn already or not.
  const table = await drawTable(message);
  const res = (table?.results?.contents ?? []).filter(r => Array.isArray(r.range) && total >= r.range[0] && total <= r.range[1]);
  if (res.length) note += ` On ${table.name} that's: ${res.map(r => r.name || r.description || r.text || "").filter(Boolean).join(", ").replace(/<[^>]+>/g, "")}.`;
  await message.update({ [`flags.${SYS}.anyD20`]: { secondDie: dir, natural: kept, total, note } });
  Hooks.callAll("arneyanAnyD20", message, { before: found.natural, natural: kept, total, dir });
  return total;
}

/** A charged item that crumbles on a 1: the second die can save it, or end it. */
async function crumbleChanged(message, { before, natural }) {
  const c = message.flags?.[SYS]?.crumble;
  if (!c) return;
  const actor = c.actorUuid ? await fromUuid(c.actorUuid).catch(() => null) : null;
  if (!actor?.isOwner) return;
  const was = before === 1, now = natural === 1;
  if (was === now) return;
  if (was && !actor.items.get(c.item._id)) {
    await actor.createEmbeddedDocuments("Item", [c.item], { keepId: true });
    return ChatMessage.create({ speaker: message.speaker, content: `<div class="arn-card"><p>${esc(c.item.name)} holds together after all, empty.</p></div>` });
  }
  if (now) {
    await actor.items.get(c.item._id)?.delete();
    return ChatMessage.create({ speaker: message.speaker, content: `<div class="arn-card"><p>${esc(c.item.name)} crumbles to dust after all.</p></div>` });
  }
}

/** The GM's client: Luck a player burned on a card only the GM can rewrite (a contest the player resisted). */
async function onSocket(msg, senderId) {
  if (msg?.action === "secondDieCard" && game.users.activeGM?.isSelf) return secondDieFor(msg, senderId);
  if (msg?.action !== "burnLuckCard" || !game.users.activeGM?.isSelf) return;
  const sender = game.users.get(senderId);
  const message = game.messages.get(String(msg.messageId ?? ""));
  const actor = message ? ChatMessage.getSpeakerActor(message.speaker) : null;
  const spend = Math.max(0, Math.floor(Number(msg.spend) || 0));
  if (!sender || !actor || !spend || !actor.testUserPermission(sender, "OWNER") || !message.flags?.[SYS]?.kind) return;
  const { applyBurn } = await import("./rolls.mjs");
  return applyBurn(message, spend);
}

/** The GM's client: Advantage or Disadvantage a player pressed on a card only the GM can rewrite. */
async function secondDieFor(msg, senderId) {
  const sender = game.users.get(senderId);
  const message = game.messages.get(String(msg.messageId ?? ""));
  const actor = message ? ChatMessage.getSpeakerActor(message.speaker) : null;
  const dir = Number(msg.dir) > 0 ? 1 : -1;
  if (!sender || !actor || !actor.testUserPermission(sender, "OWNER") || !message.flags?.[SYS]?.kind) return;
  const { secondDie } = await import("./rolls.mjs");
  return secondDie(message, dir);
}

export function registerRedo() {
  Hooks.once("ready", () => game.socket.on(SOCKET, (m, id) => { onSocket(m, id).catch(err => console.error("Arneyan | GM socket", err)); }));
  Hooks.on("arneyanRollChanged", message => { onRollChanged(message).catch(err => console.error("Arneyan | redo", err)); });
  Hooks.on("preCreateChatMessage", onPreCreateMessage);
  Hooks.on("renderChatMessageHTML", onRenderMessage);
  Hooks.on("renderChatMessageHTML", onRenderAny);
  Hooks.on("arneyanAnyD20", (message, data) => { crumbleChanged(message, data).catch(err => console.error("Arneyan | crumble", err)); });
}

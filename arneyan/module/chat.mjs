/**
 * Chat card buttons, the right-click menu on rolls, inline @Check / @Damage / @Condition links,
 * and a socket so players can apply damage and effects to creatures they don't own.
 */
import { ARNEYAN } from "./config.mjs";
import { burnLuck, damageRoll, outcomeFor } from "./rolls.mjs";
import { turnReminder } from "./qol.mjs";
import { tickCounters, turnDamageFor, advancePoison } from "./counters.mjs";
import { effectDataFor, applyEffectTo, endConcentration, onConcentrationDeleted, expireEffects, toggleCondition, statusesOf } from "./effects.mjs";

const SYS = "arneyan";
const SOCKET = `system.${SYS}`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* -------------------------------------------- */
/*  Who a button acts on                        */
/* -------------------------------------------- */

/** Creatures only: the party token stands in for a group and never rolls or takes damage. */
const creature = a => a && a.type !== "party" && a.type !== "storage";


/**
 * Who damage, healing and effects go to: your targets if you have any (you can be moving your own token and
 * targeting someone else), otherwise the tokens you have selected (yourself, once you drop the target).
 */
function targetedThenSelected() {
  const targets = Array.from(game.user.targets ?? []);
  const list = targets.length ? targets : (canvas?.tokens?.controlled ?? []);
  return list.map(t => t.actor).filter(creature);
}

/** Saves: whoever you are targeting, then selected tokens, then your own character. */
function saveRollers() {
  const targets = Array.from(game.user.targets ?? []).map(x => x.actor).filter(creature);
  if (targets.length) return targets;
  const controlled = (canvas?.tokens?.controlled ?? []).map(t => t.actor).filter(creature);
  if (controlled.length) return controlled;
  return game.user.character ? [game.user.character] : [];
}

/**
 * Roll a save (or check) for each actor. Creatures this user doesn't control are rolled by the
 * GM's client instead, so a player can target a monster and press "Reflex save DC 14".
 */
async function rollSavesFor(actors, { save = "", check = "", dc = null, concentration = false, disrupted = false, source = "", event = null } = {}) {
  const mine = actors.filter(a => a.isOwner);
  const others = actors.filter(a => !a.isOwner);
  for (const a of mine) {
    if (save) await a.rollSave(save, event, { dc, concentration, disrupted, source });
    else if (check) await a.rollAbility(check, event);
  }
  if (others.length) {
    if (!gmOnline()) return;
    game.socket.emit(SOCKET, { action: "save", actorUuids: others.map(a => a.uuid), save, check, dc, concentration: !!concentration, disrupted: !!disrupted, source: String(source).slice(0, 80) });
    ui.notifications.info(`The GM's client rolls for ${others.map(a => a.name).join(", ")}.`);
  }
}

function isActiveGM() {
  const gm = game.users.activeGM ?? game.users.find(u => u.isGM && u.active);
  return gm?.isSelf ?? (gm?.id === game.user.id);
}

/* -------------------------------------------- */
/*  Damage and effects (with GM relay)          */
/* -------------------------------------------- */

function gmOnline() {
  if (game.users.activeGM) return true;
  ui.notifications.warn("No GM is connected, so this can only affect creatures you control.");
  return false;
}

/**
 * Apply damage or healing. `ctx` says who did it and with what ({source, what}), for the chat report.
 */
/** Weapon kinds a damage card can carry (see damageRoll). */
const WEAPON_KINDS = ["", "plain", "silver", "adamantine", "magic"];

export async function applyDamageTo(actors, amount, opts, ctx = {}) {
  if (!actors.length) return ui.notifications.warn("Select or target the tokens to apply this to.");
  if (actors.some(a => !a.isOwner) && !gmOnline()) actors = actors.filter(a => a.isOwner);
  const lines = [];
  const others = [];
  const undo = [];
  for (const actor of actors) {
    if (actor.isOwner) {
      const hp = actor.system.attributes?.hp ?? {};
      undo.push({ uuid: actor.uuid, value: hp.value ?? 0, temp: hp.temp ?? 0, subdual: actor.flags?.[SYS]?.subdual ?? 0, name: actor.name });
      const r = await actor.applyDamage(amount, opts);
      lines.push(r.line ?? r.text);
    } else others.push(actor.uuid);
  }
  // Everything the GM has to do goes in one message, so it reports as one card.
  if (others.length) {
    game.socket.emit(SOCKET, { action: "damage", actorUuids: others, amount, opts,
      ctx: { source: String(ctx.source ?? "").slice(0, 80), what: String(ctx.what ?? "").slice(0, 80), whisper: ctx.whisper ?? null, blind: !!ctx.blind } });
  }
  report({ ...ctx, undo, appliedBy: ctx.appliedBy ?? game.user.id }, lines, opts?.mult < 0 ? "heart" : "burst");
}

/** A public line in chat: "Wiz's Burning Hands: Goblin takes 7 fire damage." Hit point totals stay off it. */
export function report(ctx, lines, icon = "burst") {
  if (!lines.length) return;
  const who = [ctx.source, ctx.what].filter(Boolean);
  const head = who.length === 2 ? `${esc(who[0])}: ${esc(who[1])}` : esc(who[0] ?? "Applied");
  // A private or blind roll keeps its report private too.
  ChatMessage.create({
    speaker: ctx.speaker ?? ChatMessage.getSpeaker(),
    ...(ctx.whisper ? { whisper: ctx.whisper } : {}),
    ...(ctx.blind ? { blind: true, whisper: game.users.filter(u => u.isGM).map(u => u.id) } : {}),
    content: `<div class="arn-card arn-report"><header class="arn-card-title"><i class="fa-solid fa-${icon}"></i> <span>${head}</span></header><ul>${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>${ctx.undo?.length ? `<button type="button" class="arn-undo" data-tooltip="Put their HP back as it was (the misclick on the wrong token)"><i class="fa-solid fa-rotate-left"></i> Undo</button>` : ""}</div>`,
    ...(ctx.undo?.length ? { flags: { [SYS]: { undo: ctx.undo, appliedBy: ctx.appliedBy ?? game.user.id } } } : {})
  });
}

export async function applyItemEffect(item, index, cl, actors) {
  const entry = item.system.applies?.[index];
  if (!entry) return;
  if (!actors.length) return ui.notifications.warn("Target the creatures to affect (or select their tokens).");
  const caster = item.actor;
  const data = await effectDataFor(entry, item, { cl, caster });
  const mine = actors.filter(a => a.isOwner);
  let others = actors.filter(a => !a.isOwner);
  if (others.length && !gmOnline()) others = [];
  const created = await applyEffectTo(mine, data);
  await linkToConcentration(caster, item, created.map(e => e.uuid));
  // The GM rebuilds the effect from the item itself, so nothing arbitrary travels over the socket.
  if (others.length) game.socket.emit(SOCKET, { action: "effect", actorUuids: others.map(a => a.uuid), itemUuid: item.uuid, index, cl, casterUuid: caster?.uuid });
  const rounds = data.flags?.[SYS]?.rounds;
  if (mine.length) report({ source: caster?.name ?? game.user.name, what: item.name, speaker: ChatMessage.getSpeaker({ actor: caster }) },
    mine.map(a => `${data.name} on ${a.name}${rounds ? ` for ${rounds} round${rounds === 1 ? "" : "s"}` : ""}${data.statuses?.length ? ` (${data.statuses.map(s => ARNEYAN.conditions[s]?.name ?? s).join(", ")})` : ""}`), "wand-sparkles");
}

async function linkToConcentration(caster, item, uuids) {
  if (!caster || !item?.system.concentration || !uuids.length) return;
  const conc = caster.effects.find(e => e.flags?.[SYS]?.concentration && e.origin === item.uuid);
  if (!conc) return;
  const linked = [...(conc.flags[SYS].linked ?? []), ...uuids];
  if (conc.isOwner) await conc.update({ [`flags.${SYS}.linked`]: linked });
}

async function onSocket(msg, senderId) {
  if (!isActiveGM() || !msg || typeof msg !== "object") return;
  const sender = game.users.get(senderId);
  if (!sender) return;
  if (msg.action === "damage") {
    const amount = Number(msg.amount);
    const mult = Number(msg.opts?.mult);
    if (!Number.isFinite(amount) || amount < 0 || amount > 9999 || ![1, 0.5, 2, -1].includes(mult)) return;
    const type = String(msg.opts?.type ?? "");
    // Several damage types: each part must be a known type and a sane amount.
    let parts = null;
    if (Array.isArray(msg.opts?.parts)) {
      parts = msg.opts.parts.slice(0, 8).map(p => ({ type: String(p?.type ?? ""), amount: Number(p?.amount) }))
        .filter(p => (p.type === "" || Object.hasOwn(ARNEYAN.damageTypes, p.type)) && Number.isFinite(p.amount) && p.amount >= 0 && p.amount <= 9999);
      if (!parts.length) parts = null;
    }
    const lines = [];
    const undo = [];
    for (const uuid of (msg.actorUuids ?? [msg.actorUuid]).slice(0, 50)) {
      const actor = await fromUuid(String(uuid)).catch(() => null);
      if (!(actor instanceof Actor) || !creature(actor) || actor.pack) continue;
      try {
        const hp0 = actor.system.attributes?.hp ?? {};
        undo.push({ uuid: actor.uuid, value: hp0.value ?? 0, temp: hp0.temp ?? 0, subdual: actor.flags?.[SYS]?.subdual ?? 0, name: actor.name });
        const r = await actor.applyDamage(amount, { type: Object.hasOwn(ARNEYAN.damageTypes, type) ? type : "", mult, temp: !!msg.opts?.temp, weapon: WEAPON_KINDS.includes(msg.opts?.weapon) ? msg.opts.weapon : "", parts, spell: String(msg.opts?.spell ?? "").slice(0, 80), disrupt: !!msg.opts?.disrupt, subdual: msg.opts?.subdual === true && mult > 0 });
        lines.push(r.line ?? r.text);
      } catch (err) { console.warn(`Arneyan | Could not apply damage to ${actor.name}`, err); }
    }
    const ids = new Set(game.users.map(u => u.id));
    const whisper = Array.isArray(msg.ctx?.whisper) ? msg.ctx.whisper.filter(id => ids.has(id)) : null;
    report({ source: String(msg.ctx?.source || sender.name).slice(0, 80), what: String(msg.ctx?.what ?? "").slice(0, 80),
      speaker: ChatMessage.getSpeaker({ user: sender }), whisper: whisper?.length ? whisper : null, blind: !!msg.ctx?.blind, undo, appliedBy: sender.id }, lines, mult < 0 ? "heart" : "burst");
  } else if (msg.action === "undo") {
    // Only the HP stored on that report card, and only for whoever applied it (or a GM).
    const m = game.messages.get(String(msg.messageId));
    const entries = m?.flags?.[SYS]?.undo;
    if (!m || !Array.isArray(entries) || m.flags[SYS].undone) return;
    // A GM-written report (players can't edit those) of damage this player applied, or a GM asking.
    if (!sender.isGM && !(m.author?.isGM && m.flags[SYS].appliedBy === sender.id)) return;
    await undoEntries(entries);
    await m.setFlag(SYS, "undone", true);
  } else if (msg.action === "applySaves") {
    const m = game.messages.get(String(msg.messageId));
    if (!m || m.flags?.[SYS]?.kind !== "damage") return;
    if (!sender.isGM && m.author?.id !== sender.id) return;
    const actors = (await Promise.all((msg.actorUuids ?? []).slice(0, 50).map(u => fromUuid(String(u)).catch(() => null)))).filter(a => a instanceof Actor && creature(a) && !a.pack);
    await applyBySaves(m, actors, sender);
  } else if (msg.action === "save") {
    const save = String(msg.save ?? "");
    const check = String(msg.check ?? "");
    if (save && !(save in ARNEYAN.saves)) return;
    if (check && !(check in ARNEYAN.abilities)) return;
    const dc = Number.isFinite(Number(msg.dc)) && msg.dc !== null ? Math.clamp(Number(msg.dc), 0, 60) : null;
    for (const uuid of (msg.actorUuids ?? []).slice(0, 50)) {
      const actor = await fromUuid(String(uuid)).catch(() => null);
      if (!(actor instanceof Actor) || !creature(actor) || actor.pack) continue;
      // Only creatures the sender can actually see on the map.
      const tok = actor.token ?? actor.getActiveTokens?.(false, true)?.[0];
      if (!tok || tok.hidden) continue;
      if (save) await actor.rollSave(save, null, { dc, concentration: !!msg.concentration, disrupted: !!msg.disrupted && !!msg.concentration, source: String(msg.source ?? "").slice(0, 80) });
      else if (check) await actor.rollAbility(check, null);
    }
  } else if (msg.action === "effect") {
    // Only effects the sender's own spell or ability actually carries.
    const item = await fromUuid(String(msg.itemUuid)).catch(() => null);
    if (!(item instanceof Item) || !item.actor?.testUserPermission(sender, "OWNER")) return;
    const entry = item.system.applies?.[Number(msg.index)];
    if (!entry) return;
    const data = await effectDataFor(entry, item, { cl: Math.clamp(Number(msg.cl) || 1, 1, 30), caster: item.actor });
    const actors = (await Promise.all((msg.actorUuids ?? []).slice(0, 50).map(u => fromUuid(String(u)).catch(() => null)))).filter(a => a instanceof Actor && creature(a) && !a.pack);
    const created = await applyEffectTo(actors, data);
    await linkToConcentration(item.actor, item, created.map(e => e.uuid));
    const rounds = data.flags?.[SYS]?.rounds;
    if (created.length) report({ source: item.actor?.name ?? sender.name, what: item.name, speaker: ChatMessage.getSpeaker({ actor: item.actor }) },
      created.map(e => `${data.name} on ${e.parent?.name ?? "a creature"}${rounds ? ` for ${rounds} round${rounds === 1 ? "" : "s"}` : ""}`), "wand-sparkles");
  }
}

/**
 * What a successful save leaves of the damage, from the item's "On a save" words: "Full damage, but no stun" (Sound
 * Burst) 1, anything that negates 0, otherwise half (build/spell_saves.py writes them this way).
 */
export function saveMultiplier(saveEffect) {
  const t = String(saveEffect ?? "");
  if (/\bfull damage\b/i.test(t)) return 1;
  return /negat/i.test(t) ? 0 : 0.5;
}

/** Apply a damage card by each creature's latest save against its spell. */
async function applyBySaves(message, actors, user) {
  const flags = message.flags?.[SYS] ?? {};
  const spell = flags.spell || flags.what || "";
  const item = flags.itemUuid ? await fromUuid(flags.itemUuid).catch(() => null) : null;
  const halfOrNone = saveMultiplier(item?.system?.saveEffect);
  const failed = [], saved = [], unknown = [];
  for (const a of actors) {
    const r = latestSave(a, spell);
    if (!r) unknown.push(a.name);
    else (r.saved ? saved : failed).push(a);
  }
  const ctx = { ...sourceOf(message), appliedBy: user?.id ?? game.user.id };
  if (unknown.length) {
    const text = `No save against ${spell || "this"} with a DC yet for ${unknown.join(", ")}: left out.`;
    if (user?.id === game.user.id) ui.notifications.warn(text); else report({ ...ctx, whisper: [user.id, ...game.users.filter(u => u.isGM).map(u => u.id)] }, [text], "shield-halved");
  }
  // The card's flags could have been edited by whoever wrote it: the same checks as the damage relay.
  const total = Math.clamp(Number(flags.total) || 0, 0, 9999);
  const type = Object.hasOwn(ARNEYAN.damageTypes, flags.damageType ?? "") ? flags.damageType : "";
  let parts = Array.isArray(flags.split) && flags.split.length > 1 ? flags.split.slice(0, 8).map(p => ({ type: String(p?.type ?? ""), amount: Number(p?.amount) }))
    .filter(p => (p.type === "" || Object.hasOwn(ARNEYAN.damageTypes, p.type)) && Number.isFinite(p.amount) && p.amount >= 0 && p.amount <= 9999) : null;
  if (!parts?.length) parts = null;
  const base = { type, weapon: WEAPON_KINDS.includes(flags.weapon) ? flags.weapon : "", parts, spell: String(flags.spell ?? "").slice(0, 80), disrupt: !!flags.disrupt };
  if (failed.length) await applyDamageTo(failed, total, { ...base, mult: 1 }, { ...ctx, what: `${ctx.what || spell} (failed the save)` });
  if (saved.length && halfOrNone) await applyDamageTo(saved, total, { ...base, mult: halfOrNone }, { ...ctx, what: `${ctx.what || spell} (saved: ${halfOrNone === 1 ? "full damage" : "half"})` });
  if (saved.length && !halfOrNone) report(ctx, saved.map(a => `${a.name} saved: no damage`), "shield-halved");
}

/** Put HP and temporary HP back as a report card stored them. */
async function undoEntries(entries) {
  const lines = [];
  for (const e of entries.slice(0, 50)) {
    const a = await fromUuid(String(e.uuid)).catch(() => null);
    if (!(a instanceof Actor) || !a.isOwner) continue;
    const value = Number(e.value), temp = Number(e.temp);
    if (!Number.isFinite(value) || !Number.isFinite(temp)) continue;
    const sub = Number(e.subdual);
    await a.update({ "system.attributes.hp.value": value, "system.attributes.hp.temp": Math.max(0, temp), ...(Number.isFinite(sub) && e.subdual !== undefined ? { [`flags.${SYS}.subdual`]: Math.max(0, sub) } : {}) });
    lines.push(`${a.name} back to ${value} HP`);
  }
  if (lines.length) report({ source: "Undo" }, lines, "rotate-left");
}

/** This creature's latest save against a spell (by its name), in the last 60 chat messages: { saved }. */
function latestSave(actor, spell) {
  const msgs = game.messages.contents.slice(-60).reverse();
  for (const m of msgs) {
    const f = m.flags?.[SYS];
    if (f?.kind !== "save" || f.actorUuid !== actor.uuid) continue;
    if (!spell || !f.source || String(f.source).toLowerCase() !== String(spell).toLowerCase()) continue;
    const o = outcomeFor((f.total ?? 0) + (f.luckBurned ?? 0), f.natural, f.target, "save", !!f.autoFail);
    if (!o) return null; // no DC on that save: can't tell
    return { saved: o === "success" || o === "nat20" };
  }
  return null;
}

/** Who rolled a damage card, and with what. */
function sourceOf(message) {
  const f = message.flags?.[SYS] ?? {};
  const actor = ChatMessage.getSpeakerActor(message.speaker);
  return { source: actor?.name ?? message.speaker?.alias ?? message.author?.name ?? "", what: f.what ?? "", speaker: message.speaker,
    whisper: message.whisper?.length ? [...message.whisper] : null, blind: !!message.blind };
}

/* -------------------------------------------- */
/*  Card buttons                                */
/* -------------------------------------------- */

function onRender(message, html) {
  const flags = message.flags?.[SYS] ?? {};
  const on = (sel, fn) => html.querySelectorAll(sel).forEach(el => el.addEventListener("click", ev => {
    ev.preventDefault();
    if (el.dataset.busy) return;
    el.dataset.busy = "1";
    Promise.resolve().then(() => fn(ev, el)).catch(err => { console.error("Arneyan |", err); ui.notifications.error(err.message); }).finally(() => { delete el.dataset.busy; });
  }));

  on(".arn-burn", () => burnLuck(message));

  on(".arn-damage", async (ev, btn) => {
    const actor = flags.actorUuid ? await fromUuid(flags.actorUuid) : ChatMessage.getSpeakerActor(message.speaker);
    const item = actor?.items.get(flags.itemId);
    if (!item) return ui.notifications.warn("That weapon is no longer on the sheet.");
    if (!actor.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner can roll its damage.`);
    const crit = btn.dataset.crit !== undefined ? btn.dataset.crit === "1" : !!(flags.crit || flags.natural === 20);
    // Several targets: the damage goes to the ones this attack hit (PF2e style).
    let hits = null, misses = [];
    if ((flags.targets ?? []).length >= 1) {
      const total = (flags.total ?? 0) + (flags.luckBurned ?? 0);
      const res = flags.targets.map(t => ({ name: t.name, uuid: t.uuid, hit: !["failure", "nat1"].includes(outcomeFor(total, flags.natural, t.ac, "attack")) })); // no AC to test: counts as a hit
      hits = res.filter(r => r.hit).map(({ name, uuid }) => ({ name, uuid }));
      misses = res.filter(r => !r.hit).map(({ name, uuid }) => ({ name, uuid }));
    }
    return actor.rollDamage(item, { crit, ammo: flags.ammoName ?? "", hits, misses, offhand: !!flags.offhand, bonus: flags.featureBonus ?? null });
  });

  // A damage roll that should have been a critical, or that needs its conditional extra damage: roll it again.
  const reroll = async opts => {
    const item = flags.itemUuid ? await fromUuid(flags.itemUuid).catch(() => null) : null;
    const actor = item?.actor;
    if (!item || !actor) return ui.notifications.warn("That weapon is no longer on the sheet.");
    if (!actor.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner can roll its damage.`);
    return actor.rollDamage(item, opts);
  };
  on(".arn-recrit", () => reroll({ crit: true, include: flags.include ?? [], ammo: flags.ammo ?? "", hits: flags.hits ?? null, misses: flags.misses ?? [], offhand: !!flags.offhand, bonus: flags.featureBonus ?? null }));
  on(".arn-reroll-with", (ev, btn) => reroll({ crit: !!flags.crit, include: [...(flags.include ?? []), btn.dataset.key], ammo: flags.ammo ?? "", hits: flags.hits ?? null, misses: flags.misses ?? [], offhand: !!flags.offhand, bonus: flags.featureBonus ?? null }));

  on(".arn-item-damage", async (ev, btn) => {
    const item = await fromUuid(btn.dataset.itemUuid);
    if (!item) return ui.notifications.warn("That item is no longer on the sheet.");
    return item.rollItemDamage();
  });

  on(".arn-apply-dmg", async (ev, btn) => {
    const box = btn.closest(".arn-apply");
    const total = Number(box?.dataset.total ?? flags.total ?? 0);
    const mult = Number(btn.dataset.mult);
    // From an attack on several targets: damage goes to the ones it hit; healing and Alt-click use your targets.
    let actors;
    if (Array.isArray(flags.hits) && mult > 0 && !ev.altKey) {
      actors = (await Promise.all(flags.hits.map(h => fromUuid(h.uuid).catch(() => null)))).filter(a => a && creature(a));
      if (!actors.length) return ui.notifications.info("That attack hit nobody. (Alt-click Apply to use your targets anyway.)");
    } else actors = targetedThenSelected();
    // Non-lethal: the button says, else the card's default (unarmed strikes).
    const subdual = mult > 0 && (btn.dataset.subdual !== undefined ? btn.dataset.subdual === "1" : !!flags.subdual);
    return applyDamageTo(actors, total, { type: box?.dataset.type ?? "", mult, temp: !!btn.dataset.temp, weapon: box?.dataset.weapon ?? "",
      parts: mult > 0 && flags.split?.length > 1 ? flags.split : null, spell: flags.spell ?? "", disrupt: !!flags.disrupt, subdual }, sourceOf(message));
  });

  // Apply by saves: full damage to those who failed this spell's save, half (or none) to those who saved.
  // Monsters' saves are often whispered to the GM, so a player's click is worked out on the GM's client.
  on(".arn-apply-saves", async () => {
    const actors = targetedThenSelected();
    if (!actors.length) return ui.notifications.warn("Target the creatures that rolled their saves (or select them).");
    if (!game.user.isGM && actors.some(a => !a.isOwner)) {
      if (message.author?.id !== game.user.id) return ui.notifications.warn("Only whoever rolled this damage (or the GM) can apply it to creatures they don't own.");
      if (!gmOnline()) return;
      game.socket.emit(SOCKET, { action: "applySaves", messageId: message.id, actorUuids: actors.map(a => a.uuid) });
      return ui.notifications.info("The GM's client applies it by the saves.");
    }
    return applyBySaves(message, actors, game.user);
  });

  // Undo: put the HP back as it was before this report's damage or healing.
  if (flags.undo?.length) {
    const may = game.user.isGM || flags.appliedBy === game.user.id;
    html.querySelectorAll(".arn-undo").forEach(b => { b.hidden = !may || !!flags.undone; });
  }
  on(".arn-undo", async (ev, btn) => {
    if (flags.undone) return;
    const mine = [], theirs = [];
    for (const e of flags.undo ?? []) {
      const a = await fromUuid(e.uuid).catch(() => null);
      if (!a) continue;
      (a.isOwner ? mine : theirs).push(e);
    }
    // Creatures the player doesn't own, or a GM-written card the player can't mark as undone: the GM does it.
    if ((theirs.length || !message.isOwner) && !game.user.isGM) {
      if (!gmOnline()) return;
      game.socket.emit(SOCKET, { action: "undo", messageId: message.id });
      btn.hidden = true;
      return;
    }
    await undoEntries([...mine, ...theirs]);
    if (message.isOwner) await message.setFlag(SYS, "undone", true);
    btn.hidden = true;
  });

  on(".arn-save-btn", async (ev, btn) => {
    const dc = btn.dataset.dc ? Number(btn.dataset.dc) : null;
    const concentration = !!btn.dataset.concentration;
    const actors = btn.dataset.actorUuid ? [await fromUuid(btn.dataset.actorUuid)].filter(Boolean) : saveRollers();
    if (!actors.length) return ui.notifications.warn("Target the creatures that should roll (or select them, or assign your character).");
    await rollSavesFor(actors, { save: btn.dataset.save, dc, concentration, disrupted: !!btn.dataset.disrupted, source: btn.dataset.source ?? "", event: ev });
  });

  on(".arn-apply-effect", async (ev, btn) => {
    const item = await fromUuid(btn.dataset.itemUuid);
    if (!item) return ui.notifications.warn("That spell or ability is no longer on the sheet.");
    return applyItemEffect(item, Number(btn.dataset.index), Number(btn.dataset.cl) || 1, targetedThenSelected());
  });

  on(".arn-end-conc", async (ev, btn) => {
    const actor = await fromUuid(btn.dataset.actorUuid);
    if (!actor?.isOwner) return;
    await endConcentration(actor);
    ui.notifications.info(`${actor.name} stops concentrating.`);
  });

  // Only show "end concentration" on a failed concentration save.
  if (flags.concentration) {
    const failed = ["failure", "nat1", "autofail"].some(c => html.querySelector(`.arn-outcome.${c}`));
    html.querySelectorAll(".arn-end-conc").forEach(b => { b.hidden = !failed; });
  }
}

/* -------------------------------------------- */
/*  Right-click menu on chat rolls              */
/* -------------------------------------------- */

function contextOptions(app, options) {
  const msgOf = li => game.messages.get((li?.dataset ?? li?.[0]?.dataset)?.messageId);
  const canApply = li => {
    const m = msgOf(li);
    return !!m && (m.rolls?.length > 0) && ["damage", "healing"].includes(m.flags?.[SYS]?.kind);
  };
  const apply = (mult, subdual) => li => {
    const m = msgOf(li);
    const f = m.flags[SYS];
    applyDamageTo(targetedThenSelected(), f.total ?? m.rolls[0].total, { type: f.damageType ?? "", mult, weapon: f.weapon ?? "",
      parts: mult > 0 && f.split?.length > 1 ? f.split : null, spell: f.spell ?? "", disrupt: !!f.disrupt, subdual: mult > 0 && (subdual ?? !!f.subdual) }, sourceOf(m));
  };
  const add = (name, icon, mult, subdual) => options.push({ name, label: name, icon: `<i class="fa-solid ${icon}"></i>`, condition: canApply, callback: apply(mult, subdual) });
  add("Apply damage", "fa-burst", 1);
  add("Apply as non-lethal", "fa-hand-fist", 1, true);
  add("Apply half damage", "fa-shield-halved", 0.5);
  add("Apply double damage", "fa-angles-up", 2);
  add("Apply as healing", "fa-heart", -1);
}

/* -------------------------------------------- */
/*  Inline links in text                        */
/* -------------------------------------------- */

function link(cls, data, iconCls, text) {
  const a = document.createElement("a");
  a.classList.add("arn-inline", cls);
  for (const [k, v] of Object.entries(data)) a.dataset[k] = v;
  const i = document.createElement("i");
  i.className = `fa-solid ${iconCls}`;
  a.append(i, ` ${text}`);
  return a;
}

function registerEnrichers() {
  // @Check[ref|dc:14]{Reflex save}  or  @Check[str|dc:15] for an attribute check.
  CONFIG.TextEditor.enrichers.push({
    pattern: /@Check\[(\w+)(?:\|dc:(\d+))?\](?:\{([^}]+)\})?/g,
    enricher: async match => {
      const [, what, dc, label] = match;
      const key = what.toLowerCase();
      const isSave = key in ARNEYAN.saves;
      const name = isSave ? `${ARNEYAN.saves[key].label} save` : `${ARNEYAN.abilities[key] ?? key} check`;
      return link("arn-inline-check", { check: key, dc: dc ?? "", save: isSave ? "1" : "" }, "fa-dice-d20", label ?? `${name}${dc ? ` DC ${dc}` : ""}`);
    }
  });
  // @Damage[2d6 fire]{label}
  CONFIG.TextEditor.enrichers.push({
    pattern: /@Damage\[([^\]\s]+)(?:\s+(\w+))?\](?:\{([^}]+)\})?/g,
    enricher: async match => {
      const [, formula, type, label] = match;
      return link("arn-inline-damage", { formula, type: type ?? "" }, type === "healing" ? "fa-heart" : "fa-burst", label ?? `${formula}${type ? ` ${type}` : ""}`);
    }
  });
  // @Condition[prone]{label}: click to put it on targeted or selected tokens.
  CONFIG.TextEditor.enrichers.push({
    pattern: /@Condition\[(\w+)\](?:\{([^}]+)\})?/g,
    enricher: async match => {
      const [, id, label] = match;
      const c = ARNEYAN.conditions[id.toLowerCase()];
      if (!c) return null;
      const a = link("arn-inline-condition", { condition: id.toLowerCase() }, "fa-circle-exclamation", label ?? c.name);
      a.dataset.tooltip = c.text;
      return a;
    }
  });
}

function onBodyClick(event) {
  const el = event.target.closest?.(".arn-inline");
  if (!el) return;
  event.preventDefault();
  if (el.classList.contains("arn-inline-check")) {
    const actors = saveRollers();
    if (!actors.length) return ui.notifications.warn("Target or select a token (or assign your character) to roll.");
    const dc = el.dataset.dc ? Number(el.dataset.dc) : null;
    rollSavesFor(actors, { save: el.dataset.save ? el.dataset.check : "", check: el.dataset.save ? "" : el.dataset.check, dc, event });
  } else if (el.classList.contains("arn-inline-damage")) {
    const speaker = canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
    damageRoll({ actor: speaker, title: el.textContent.trim(), formula: el.dataset.formula, damageType: el.dataset.type, spell: el.dataset.spell ?? "" });
  } else if (el.classList.contains("arn-inline-condition")) {
    const actors = targetedThenSelected();
    if (!actors.length) return ui.notifications.warn("Target or select the tokens first.");
    for (const a of actors) {
      if (!a.isOwner) { ui.notifications.warn(`You don't control ${a.name}.`); continue; }
      toggleCondition(a, el.dataset.condition, true);
    }
  }
}

/* -------------------------------------------- */
/*  Turn start reminders (Burning)              */
/* -------------------------------------------- */

async function onTurnChange(combat, changed, options = {}) {
  if (!isActiveGM()) return;
  if (!("turn" in changed) && !("round" in changed)) return;
  // The creature whose turn just ended: its numbered conditions go down one (Slowed 2 to Slowed 1, then gone).
  const prevId = combat.previous?.combatantId;
  if (options.direction !== -1 && prevId && prevId !== combat.combatant?.id) await tickCounters(combat.combatants.get(prevId)?.actor).catch(err => console.warn("Arneyan | counters", err));
  await expireEffects(combat);
  const actor = combat.combatant?.actor;
  if (!actor) return;
  // Bleeding out: a dying character loses 1 HP at the start of its turn until stabilised.
  // Only when the turn moves on, not when the GM steps back.
  if (options.direction !== -1 && actor.type === "character" && actor.system.attributes?.state === "dying") {
    const hp = actor.system.attributes.hp.value - 1;
    await actor.update({ "system.attributes.hp.value": hp });
    const dead = hp <= actor.system.attributes.deathAt;
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-droplet"></i> <span>${esc(actor.name)} is bleeding out</span></header>
        <p>${dead ? `${esc(actor.name)} dies.` : `HP ${hp}; death at ${actor.system.attributes.deathAt}. An ally can spend an action on a Wisdom check (DC 10) to stabilise them, or they can burn 1 Luck for Last Chance.`}</p></div>`
    });
  }
  const st = statusesOf(actor);
  let poisonNext = false;
  for (const id of Object.keys(ARNEYAN.conditions)) {
    if (!st.has(id)) continue;
    const d = turnDamageFor(actor, id);
    if (!d || options.direction === -1) continue;
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="arn-card"><header class="arn-card-title">${esc(actor.name)}: ${esc(d.label)}</header>
        <button type="button" class="arn-inline arn-inline-damage" data-formula="${d.formula}" data-type="${d.type}"><i class="fa-solid fa-${d.type === "poison" ? "skull-crossbones" : "fire"}"></i> ${d.formula} ${d.type} damage</button>${d.nextStage ? `<p class="arn-card-meta">Next turn: ${["1d4", "1d6", "1d8", "1d10"][d.nextStage - 1]}, unless the Fortitude save at the end of this turn ends it.</p>` : ""}</div>`
    });
    if (d.nextStage) poisonNext = true;
  }
  // The reminder card comes last, after the expired effects are gone and the bleeding and burning cards.
  if (options.direction !== -1) await turnReminder(combat).catch(err => console.warn("Arneyan | reminder", err));
  // The venom moves to its next die only after this turn's card and reminder have shown this one.
  if (poisonNext) await advancePoison(actor).catch(() => null);
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

export function registerChat() {
  registerEnrichers();
  Hooks.on("renderChatMessageHTML", onRender);
  Hooks.on("getChatMessageContextOptions", contextOptions);
  Hooks.on("updateCombat", onTurnChange);
  Hooks.on("deleteActiveEffect", effect => {
    if (effect.flags?.[SYS]?.concentration && isActiveGM()) onConcentrationDeleted(effect);
  });
  Hooks.once("ready", () => {
    game.socket.on(SOCKET, onSocket);
    document.body.addEventListener("click", onBodyClick);
  });
}

/** Conditions as token status effects. */
export function registerConditions() {
  CONFIG.statusEffects = Object.entries(ARNEYAN.conditions).map(([id, c]) => ({
    id, _id: `arneyan${id}`.padEnd(16, "0").slice(0, 16), name: c.name, img: `systems/${SYS}/assets/conditions/${id}.svg`, description: `<p>${c.text}</p>`,
    hud: id !== "concentrating"
  }));
  CONFIG.specialStatusEffects.DEFEATED = "dead";
  CONFIG.specialStatusEffects.INVISIBLE = "invisible";
  CONFIG.specialStatusEffects.BLIND = "blinded";
}

/**
 * Camp and foraging (batch 6, Kieran 22 Oct 2026). Every check here is a button the player (or the GM) presses: the
 * roll is theirs, nothing resolves on its own.
 *
 * Foraging: during travel at Slow pace, or as a camp activity, a Survival check at DC 12 finds 1d4 Day's Rations, plus
 * one for every 5 by which the check beats the DC. Each character forages once a day.
 */
const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const FORAGE_DC = 12;
/** The Day's Rations item in the system's equipment compendium. */
export const RATION_UUID = `Compendium.${SYS}.equipment.Item.7ou5GBNDo9o4VQKz`;

/** Rations a successful forage finds before the 1d4: one more for every 5 the check beats the DC by. */
export const forageBonus = (total, dc = FORAGE_DC) => (Number(total) >= dc ? Math.floor((Number(total) - dc) / 5) : 0);

/** The skill item an actor has for a check, from a list of names in order of preference (null if untrained). */
export function skillFor(actor, names = []) {
  const items = (actor?.items ?? []).filter(i => i.type === "skill");
  for (const n of names) {
    const key = String(n).toLowerCase();
    const hit = items.find(i => i.name.toLowerCase() === key || i.name.toLowerCase().startsWith(`${key} `) || i.name.toLowerCase().startsWith(`${key}/`));
    if (hit) return hit;
  }
  return null;
}

/**
 * A camp or travel check: the first of `skills` the actor is trained in, else (with `ability`) that attribute's check,
 * else the untrained plain d20. Returns the roll's chat message.
 */
export function campCheck(actor, { skills = [], ability = "", dc = null, title = "" } = {}, event = null) {
  if (!actor) return null;
  const skill = skills.length ? skillFor(actor, skills) : null;
  if (skill) return actor.rollSkill(skill, event, { dc, title });
  if (ability) return actor.rollAbility(ability, event, { dc, title });
  return actor.rollSkill(null, event, { dc, title });
}

/** The character this user acts for: the selected token's, else the user's own, else the one member they own. */
export function myCharacter(members = []) {
  const controlled = globalThis.canvas?.tokens?.controlled?.map(t => t.actor).find(a => a?.type === "character" && a.isOwner);
  if (controlled) return controlled;
  if (game.user.character?.isOwner) return game.user.character;
  // A player who owns exactly one member: that one. The GM (who owns them all) is asked.
  const owned = game.user.isGM ? [] : members.filter(m => m.isOwner);
  return owned.length === 1 ? owned[0] : null;
}

/** Ask which member when this user could mean several (the GM, or a player with two characters). */
export async function pickMember(members, title) {
  const mine = myCharacter(members);
  if (mine) return mine;
  const choices = members.filter(m => m.isOwner);
  if (!choices.length) { ui.notifications.warn("You don't control any of the party's characters."); return null; }
  if (choices.length === 1) return choices[0];
  const { DialogV2 } = foundry.applications.api;
  const id = await DialogV2.wait({ window: { title }, classes: ["arneyan"], position: { width: 340 },
    content: `<label class="arn-field">Who? <select name="who">${choices.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select></label>`,
    buttons: [{ action: "ok", label: "Roll", default: true, callback: (ev, btn) => btn.form.querySelector("select[name=who]")?.value }, { action: "cancel", label: "Cancel" }],
    rejectClose: false });
  return choices.find(m => m.id === id) ?? null;
}

/**
 * Forage (a button): the character's Survival check at DC 12; on a success, 1d4 Day's Rations (+1 per 5 over) go into
 * their pack. Once a day for each character (`key` names the day: "<party id>.<day>").
 */
export async function forage(actor, key, event = null) {
  if (!actor?.isOwner) return null;
  if (key && actor.getFlag(SYS, "foraged") === key) return ui.notifications.info(`${actor.name} has already foraged today.`);
  const msg = await campCheck(actor, { skills: ["Survival"], dc: FORAGE_DC, title: "Forage" }, event);
  if (key) await actor.setFlag(SYS, "foraged", key);
  const f = msg?.flags?.[SYS] ?? {};
  const ok = !f.autoFail && f.natural !== 1 && Number(f.total) >= FORAGE_DC;
  if (!ok) {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card"><p><i class="fa-solid fa-seedling"></i> ${esc(actor.name)} finds nothing to eat.</p></div>` });
    return 0;
  }
  const r = await new Roll("1d4").evaluate();
  const found = r.total + forageBonus(f.total);
  await addRations(actor, found);
  await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<div class="arn-card"><p><i class="fa-solid fa-seedling"></i> ${esc(actor.name)} forages <strong>${found} Day's Rations</strong> (1d4${forageBonus(f.total) ? ` + ${forageBonus(f.total)} for beating DC ${FORAGE_DC} by ${Number(f.total) - FORAGE_DC}` : ""}).</p></div>` });
  return found;
}

/** Add Day's Rations to an actor: onto a stack it already carries, else a new one from the compendium. */
export async function addRations(actor, n) {
  if (!(n > 0)) return;
  const have = actor.items.find(i => i.type === "equipment" && /^day'?s rations?/i.test(i.name));
  if (have) return have.update({ "system.quantity": (Number(have.system.quantity) || 0) + n });
  const src = await fromUuid(RATION_UUID).catch(() => null);
  const data = src ? src.toObject() : { name: "Day's Rations", type: "equipment", system: {} };
  delete data._id;
  data.system = { ...(data.system ?? {}), quantity: n };
  return actor.createEmbeddedDocuments("Item", [data]);
}

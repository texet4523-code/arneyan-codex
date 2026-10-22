import { areaButton } from "./areas.mjs";
import { isTouchAttack, touchLabel, touchParts, touchApplies, CURES, REVERSED_ONLY } from "./touch.mjs";
import { ARNEYAN } from "./config.mjs";
import { d20Roll, luckCheck, damageRoll, modeFromEvent, resolveFormula } from "./rolls.mjs";
import { setClassLevel, syncKitFeatures, removeGrants, firstLevelSetup, firstLevelSetupRunning, ancestrySetup } from "./progression.mjs";
import { stampOnCreate, stampOf, tracked } from "./migrate.mjs";
import { effectDataFor, applyEffectTo, startConcentration, endConcentration, statusesOf, toggleCondition, weaponKey, weaponPickMax, featureLevel, rerollDice, rerollNote, chosenRules } from "./effects.mjs";
import { useEquipment, spendAmmo, rechargeAtDawn, putOutData, ammoFor } from "./gear.mjs";
import { attackSituation, targetAC, combatUse, isSubdualWeapon, subdualUpdate, syncSubdual, isReactionFeature, firearmOf } from "./combat.mjs";
import { formulaUsesFor } from "./data/actor-models.mjs";
import { combatFor, combatantsOf, confirmRestInFight } from "./fight.mjs";

const { DialogV2 } = foundry.applications.api;
const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** The user's current targets as actors with names. */
export function targetActors() {
  return Array.from(game.user.targets ?? []).map(t => t.actor ? { token: t, actor: t.actor, name: t.name ?? t.actor.name } : null).filter(Boolean);
}

/** Merge several advantage sources into a mode and an explanation. */
function advFrom(event, ...sources) {
  const values = sources.flatMap(s => s?.values ?? []);
  const why = { adv: sources.flatMap(s => s?.adv ?? []), dis: sources.flatMap(s => s?.dis ?? []) };
  if (event?.shiftKey) why.adv.push("Shift-click");
  if (event?.ctrlKey || event?.metaKey) why.dis.push("Ctrl-click");
  return { mode: modeFromEvent(event, values), why };
}

const NONE = { values: [], adv: [], dis: [] };

/**
 * A number that grows with level: a level table ("4:1, 9:2, 13:3": +1 from 4th, +2 from 9th...; 0 below the first
 * step), or a number or formula (@cl is the feature's class level).
 */
export function byLevel(spec, level, data = {}) {
  const s = String(spec ?? "").trim();
  if (!s) return 0;
  if (/^\d+\s*:/.test(s)) {
    let out = 0;
    for (const [, at, v] of s.matchAll(/(\d+)\s*:\s*(-?\d+)/g)) if (level >= Number(at)) out = Number(v);
    return out;
  }
  // Bracketed, so a sum with no dice works out to one number ("10 + 3 + 2" is 15).
  const v = Number(resolveFormula(`(${s})`, { ...data, cl: level }));
  return Number.isFinite(v) ? v : 0;
}

/** Does this weapon suit an attacks activity's `weapons` ("" any, "melee", "ranged", or an ammunition type)? */
export function weaponFits(w, want) {
  const k = String(want ?? "").toLowerCase();
  if (!k) return true;
  if (k === "melee") return !w.system.ranged;
  if (k === "ranged") return !!w.system.ranged;
  return String(w.system.ammoType ?? "").toLowerCase() === k;
}

/** Damage terms with a feature's bonus added: where a rule from `noStack` already adds a bonus, the higher counts. */
export function featureBonusTerms(terms, notes, bonus) {
  const value = Number(bonus?.value) || 0;
  if (!value) return { terms, notes };
  const clash = bonus.noStack ? terms.filter(t => t.label === bonus.noStack && /^\s*\+?\s*-?\d+\s*$/.test(String(t.value))) : [];
  const theirs = clash.reduce((t, x) => t + Number(String(x.value).replace(/\s|\+/g, "")), 0);
  if (clash.length && theirs >= value) return { terms, notes: [...notes, `${bonus.label}: +${value} does not stack with ${bonus.noStack} (+${theirs}); the higher counts`] };
  const kept = terms.filter(t => !clash.includes(t));
  const out = [...notes];
  if (bonus.noStack) out.push(`${bonus.label}: does not stack with ${bonus.noStack}; use the higher`);
  return { terms: [...kept, { label: bonus.label, value: `+${value}` }], notes: out };
}

/** Weapon resistances: which weapons each trait word covers (physical damage only). */
export const WEAPON_TRAITS = {
  "weapons": "weapons", "non-magical": "non-magical weapons",
  "non-silvered": "non-magical, non-silvered weapons", "non-adamantine": "non-magical, non-adamantine weapons"
};
export function weaponTrait(word, type, weapon) {
  if (!weapon || !["slashing", "piercing", "bludgeoning"].includes(type)) return false;
  if (word === "weapons") return true;
  if (weapon === "magic") return false;
  if (word === "non-magical") return true;
  if (word === "non-silvered") return weapon !== "silver";
  if (word === "non-adamantine") return weapon !== "adamantine";
  return false;
}

/** Does this item still need its attribute picked (several options, none chosen yet)? */
export function needsAbilityChoice(item) {
  const c = item?.system?.abilityChoice;
  return (c?.options?.length ?? 0) > 1 && !c.options.includes(c.value);
}

/** Ask which attribute an item's bonus goes to, and store it (system.abilityChoice.value). */
export async function promptAbilityChoice(item) {
  const c = item?.system?.abilityChoice;
  if (!item?.isOwner || !(c?.options?.length > 1)) return null;
  const amount = (item.system.rules ?? []).find(r => /^ability\./.test(r.key) && !r.when)?.value;
  const content = `<p>${esc(item.name)}${item.actor?.name ? ` (${esc(item.actor.name)})` : ""}: ${amount ? `+${esc(String(amount).replace(/^\+/, ""))} to ` : ""}which attribute?</p>
    <div class="arn-acts">${c.options.map((o, i) => `<label class="arn-act"><input type="radio" name="pick" value="${esc(o)}" ${i === 0 ? "checked" : ""}> <strong>${esc(ARNEYAN.abilities[o] ?? o)}</strong></label>`).join("")}</div>`;
  const pick = await DialogV2.wait({ window: { title: item.name, icon: "fa-solid fa-dumbbell" }, classes: ["arneyan"], position: { width: 360 }, content,
    buttons: [{ action: "ok", label: "Choose", default: true, callback: (ev, btn) => btn.form.querySelector("input[name=pick]:checked")?.value ?? "" },
      { action: "later", label: "Later" }], rejectClose: false }).catch(() => null);
  // Later or closed: nothing stored, no bonus yet; the sheet shows "Choose attribute" on the item.
  if (!c.options.includes(pick)) return null;
  await item.update({ "system.abilityChoice.value": pick });
  return pick;
}

/**
 * Starting Scores (Codex v0.10.0): when a character is created no score can go above 18, even after ancestry bonuses
 * and feats; a creation feat's points over 18 move to another attribute. Returns { from, amount } when this item's
 * attribute bonus takes a score past 18 on a 1st-level (or newer) character and hasn't been moved yet, else null.
 */
export function creationOverflow(item) {
  const actor = item?.parent;
  if (item?.type !== "feat" || !actor || actor.type !== "character" || (Number(actor.system?.level) || 0) > 1 || item.system?.abilityChoice?.moved) return null;
  const rule = chosenRules(item.system).find(r => /^ability\.\w+$/.test(String(r?.key ?? "")) && !r.when && Number(r.value) > 0);
  if (!rule) return null;
  const from = rule.key.split(".")[1];
  const a = actor.system.abilities?.[from];
  const total = Number(a?.total ?? a?.value) || 0;
  return total > 18 ? { from, amount: Number(rule.value) } : null;
}

/** Ask where a creation feat's points over 18 go (the next best attribute under 18 by default), and store it. */
export async function promptCreationOverflow(item) {
  const over = creationOverflow(item);
  if (!over || !item.isOwner) return null;
  const ab = item.parent.system.abilities;
  const keys = Object.keys(ARNEYAN.abilities).filter(k => k !== over.from && (Number(ab[k]?.total ?? ab[k]?.value) || 0) < 18);
  if (!keys.length) { ui.notifications.warn(`${item.name}: every attribute is at 18, so its bonus is lost (no score above 18 at creation).`); return null; }
  keys.sort((x, y) => (Number(ab[y]?.total ?? ab[y]?.value) || 0) - (Number(ab[x]?.total ?? ab[x]?.value) || 0));
  const name = k => ARNEYAN.abilities[k] ?? k;
  const content = `<p>${esc(item.name)}'s +${over.amount} would take ${esc(name(over.from))} past 18. When a character is created no score can go above 18, so the point goes to another attribute instead (that one also stops at 18).</p>
    <div class="form-group"><label>Move it to</label><select name="to">${keys.map(k => `<option value="${k}">${esc(name(k))} ${Number(ab[k]?.total ?? ab[k]?.value) || 0}</option>`).join("")}</select></div>`;
  const to = await DialogV2.wait({ window: { title: `${item.parent.name}: no score above 18`, icon: "fa-solid fa-arrows-left-right" }, classes: ["arneyan"], position: { width: 400 }, content,
    buttons: [{ action: "ok", label: "Move", default: true, callback: (ev, btn) => btn.form.elements.to.value }, { action: "later", label: "Later" }], rejectClose: false }).catch(() => null);
  if (!keys.includes(to)) return null;
  // Another feat may have moved its point while this was open (two creation feats on one attribute): check again.
  if (!creationOverflow(item)) return null;
  await item.update({ "system.abilityChoice.moved": to });
  return to;
}

/** Does this item still need its weapon picked (Weapon Specialisation with none chosen yet)? */
export function needsWeaponChoice(item) {
  const c = item?.system?.weaponChoice;
  return !!String(c?.max ?? "").trim() && !(c.value ?? []).some(v => String(v ?? "").trim());
}

/**
 * The weapons a pick offers: the character's own, then the Catalogue's (the equipment compendium's weapons) not
 * already among them. Names as they're stored, so the sheet and the prompt show the same list.
 */
export async function weaponOptions(actor) {
  const own = [...new Set((actor?.items ?? []).filter(i => i.type === "weapon").map(i => i.name))].sort((a, b) => a.localeCompare(b));
  let catalogue = [];
  try {
    const pack = game.packs?.get(`${SYS}.equipment`);
    const index = pack ? await pack.getIndex({ fields: ["type"] }) : [];
    catalogue = [...new Set([...index].filter(e => e.type === "weapon").map(e => e.name))].sort((a, b) => a.localeCompare(b));
  } catch (err) { console.warn("Arneyan | Catalogue weapons", err); }
  const mine = new Set(own.map(weaponKey));
  return { own, catalogue: catalogue.filter(n => !mine.has(weaponKey(n))) };
}

/** The <option>s of a weapon pick, the character's weapons first. `selected`: the name to mark. */
export function weaponOptionsHtml({ own = [], catalogue = [] }, selected = "") {
  const opt = n => `<option value="${esc(n)}"${n === selected ? " selected" : ""}>${esc(n)}</option>`;
  // A pick that's on neither list (a weapon since sold, a homebrew name) still shows as picked.
  const other = selected && !own.includes(selected) && !catalogue.includes(selected) ? `<optgroup label="Picked">${opt(selected)}</optgroup>` : "";
  return other + (own.length ? `<optgroup label="Your weapons">${own.map(opt).join("")}</optgroup>` : "")
    + (catalogue.length ? `<optgroup label="Catalogue">${catalogue.map(opt).join("")}</optgroup>` : "");
}

/**
 * Ask which weapon an item's weapon rules are for (Weapon Specialisation), and store it (system.weaponChoice.value).
 * From 13th level a Fighter may pick a second one: the prompt offers as many as are still free.
 */
export async function promptWeaponChoice(item) {
  const c = item?.system?.weaponChoice;
  if (!item?.isOwner || !String(c?.max ?? "").trim()) return null;
  const actor = item.actor ?? null;
  const max = weaponPickMax(item.system, featureLevel(actor, item));
  const have = (c.value ?? []).map(v => String(v ?? "").trim()).filter(Boolean);
  const free = Math.max(0, max - have.length);
  if (!free) return null;
  const options = await weaponOptions(actor);
  const selects = Array.from({ length: free }, (_, i) => `<label class="arn-act"><select name="pick${i}"><option value="">${i ? "None yet" : "Choose a weapon"}</option>${weaponOptionsHtml(options)}</select></label>`).join("");
  const content = `<p>${esc(item.name)}${actor?.name ? ` (${esc(actor.name)})` : ""}: which weapon${free > 1 ? "s" : ""}?${have.length ? ` Already picked: ${esc(have.join(", "))}.` : ""}</p>
    <div class="arn-acts">${selects}</div>`;
  const picked = await DialogV2.wait({ window: { title: item.name, icon: "fa-solid fa-khanda" }, classes: ["arneyan"], position: { width: 380 }, content,
    buttons: [{ action: "ok", label: "Choose", default: true, callback: (ev, btn) => [...btn.form.querySelectorAll("select[name^=pick]")].map(s => s.value).filter(Boolean) },
      { action: "later", label: "Later" }], rejectClose: false }).catch(() => null);
  // Later or closed: nothing stored; the rules stay reminders and the sheet shows "Choose weapon" on the item.
  if (!Array.isArray(picked) || !picked.length) return null;
  const value = [...new Set([...have, ...picked])].slice(0, max);
  await item.update({ "system.weaponChoice.value": value });
  return value;
}

/** Slots a skill takes: one, two for a Master, none for a Knack (an ancestry's chosen skill). */
const skillCost = tier => (tier === "master" ? 2 : tier === "knack" ? 0 : 1);

/**
 * Skills (NWP): a new skill costs one slot, a Master one more. Over the limit a player is stopped; the GM is asked, and
 * an extra slot the GM allows is kept (system.nwpBonus) so later level-ups count it.
 */
export async function skillSlotOk(actor, cost, what, user) {
  const nwp = actor?.system?.nwp;
  if (!nwp || actor.type !== "character" || user?.id !== game.user.id) return true;
  if (nwp.used + cost <= nwp.max) return true;
  const short = nwp.used + cost - nwp.max;
  const msg = `${actor.name} has ${nwp.used} of ${nwp.max} Skill (NWP) slots used. ${what}: ${cost} more needed.`;
  if (!game.user.isGM) { ui.notifications.warn(`${msg} Ask the GM for an extra slot.`); return false; }
  const ok = await DialogV2.confirm({ window: { title: "Skill slots" }, content: `<p>${esc(msg)}</p><p>Add it anyway? ${esc(actor.name)} keeps ${short === 1 ? "an extra slot" : `${short} extra slots`} for it, which later level-ups count.</p>`, rejectClose: false });
  if (!ok) return false;
  await actor.update({ "system.nwpBonus": (actor._source?.system?.nwpBonus ?? actor.system.nwpBonus ?? 0) + short });
  return true;
}

/**
 * New skills arriving on a character together (one createEmbeddedDocuments call): which are already known (on the
 * character or earlier in the batch), and which fit in the free slots in order. Pure, for the operation and tests.
 */
export function planSkills(actor, skills) {
  const known = new Set((actor.items ?? []).filter(i => i.type === "skill").map(i => i.name));
  const nwp = actor.system?.nwp ?? { used: 0, max: Infinity };
  const dupes = [], fit = [], over = [];
  let used = nwp.used;
  for (const d of skills) {
    if (known.has(d.name)) { dupes.push(d); continue; }
    known.add(d.name);
    const c = skillCost(d.system?.tier);
    if (used + c <= nwp.max) { fit.push(d); used += c; }
    else over.push(d);
  }
  return { dupes, fit, over, cost: [...fit, ...over].reduce((t, d) => t + skillCost(d.system?.tier), 0) };
}

export class ArneyanActor extends Actor {
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    // A pregen or monster from the system's compendiums: its items are as shipped, so they start fingerprinted
    // (migrate.mjs). A duplicated or imported character keeps whatever its items had.
    // The world update's backups don't travel with a duplicated or imported character.
    // (Embedded items merge by id, so the key has to be deleted, not just left out.)
    const backed = (this._source.items ?? []).filter(i => i.flags?.arneyan?.before);
    if (backed.length) this.updateSource({ items: backed.map(i => ({ _id: i._id, flags: { arneyan: { "-=before": null } } })) });
    const from = this._source?._stats?.compendiumSource ?? "";
    if (typeof from !== "string" || !from.startsWith("Compendium.arneyan.") || this._source?._stats?.duplicateSource) return;
    let changed = false;
    const items = (this._source.items ?? []).map(i => {
      if (i.flags?.arneyan?.synced || !tracked(i)) return i;
      const st = stampOf(i.type, i.system);
      if (!st) return i;
      changed = true;
      return foundry.utils.mergeObject(i, { flags: { arneyan: { synced: st } } }, { inplace: false });
    });
    if (changed) this.updateSource({ items });
  }


  /** A monster's "½" or "¼" no longer applies once the GM types a new Level. */
  async _preUpdate(changes, options, user) {
    if ((await super._preUpdate(changes, options, user)) === false) return false;
    options.arneyanPrevHp ??= {};
    options.arneyanPrevHp[this.id] = this.system.attributes?.hp?.value;
    options.arneyanPrevTemp ??= {};
    options.arneyanPrevTemp[this.id] = this.system.attributes?.hp?.temp ?? 0;
    options.arneyanPrevSubdual ??= {};
    options.arneyanPrevSubdual[this.id] = Number(this.flags?.[SYS]?.subdual ?? 0) || 0;
    const lvl = foundry.utils.getProperty(changes, "system.level");
    if (this.type === "npc" && lvl !== undefined && lvl !== this.system.level && foundry.utils.getProperty(changes, "system.details.levelText") === undefined) {
      foundry.utils.setProperty(changes, "system.details.levelText", "");
    }
  }

  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    // Non-lethal damage: knocked out at current HP, awake again below it (combat.mjs).
    if (userId === game.user.id && (foundry.utils.hasProperty(changed, "flags.arneyan.subdual") || foundry.utils.hasProperty(changed, "system.attributes.hp.value"))) {
      syncSubdual(this).catch(err => console.warn("Arneyan | subdual", err));
    }
    if (userId !== game.user.id || options.arneyanDowned) return;
    if (foundry.utils.hasProperty(changed, "system.attributes.hp.value") || foundry.utils.hasProperty(changed, "system.attributes.hp.max")) {
      this._syncDowned(options.arneyanPrevHp?.[this.id]).catch(err => console.warn("Arneyan | downed", err));
    }
  }

  getRollData() {
    return this.system.getRollData?.() ?? super.getRollData();
  }

  /** The rule set worked out during data preparation. */
  get mods() {
    return this.system.mods;
  }

  /**
   * Switching a status off removes every effect that carries it, including ones a spell created
   * (core only looks for its own fixed-id effect), so the token HUD and the sheet always agree.
   */
  async toggleStatusEffect(statusId, options = {}) {
    const existing = this.effects.filter(e => e.statuses?.has?.(statusId));
    if (existing.length && options.active !== true) {
      await this.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
      return false;
    }
    if (existing.length && options.active === true) return true;
    return super.toggleStatusEffect(statusId, options);
  }

  /** Current AC for either actor type. */
  get acTotal() {
    return this.system.acTotal ?? (this.type === "npc" ? this.system.attributes.ac : this.system.attributes.ac.value);
  }

  /** Attribute check: d20 + attribute modifier. Level never adds. */
  /** Attribute check. `bonus`: a one-off addition from a feature (Primeval Instincts' +4), labelled `label`. */
  rollAbility(key, event, { bonus = 0, label = "" } = {}) {
    const m = this.mods;
    const parts = [{ label: ARNEYAN.abilityAbbr[key], value: this.system.abilities[key].mod }, ...(m?.parts("check", `check.${key}`) ?? [])];
    if (Number(bonus)) parts.push({ label: label || "Bonus", value: Number(bonus) });
    const { mode, why } = advFrom(event, m?.adv("adv.check", `adv.check.${key}`) ?? NONE);
    const fail = m?.has(`fail.check.${key}`) ? m.sources(`fail.check.${key}`).join(", ") : "";
    return d20Roll({ actor: this, kind: "check", mode, why, title: `${ARNEYAN.abilities[key]} Check`, parts, notes: m?.notesFor("check") ?? [], autoFail: fail, extra: { ability: key } });
  }

  /** Saving throw. Pass a DC to show success or failure; concentration saves add their own Advantage. */
  rollSave(key, event, { dc = null, concentration = false, disrupted = false, source = "" } = {}) {
    const m = this.mods;
    const label = `${ARNEYAN.saves[key].label} Save${concentration ? " (Concentration)" : ""}`;
    let parts;
    if (this.type === "npc") {
      const s = this.system.saveList.find(x => x.key === key);
      parts = s.parts;
    } else {
      parts = this.system.saves[key].parts;
    }
    let adv = m?.adv("adv.save", `adv.save.${key}`, ...(concentration ? ["adv.concentration"] : [])) ?? NONE;
    // Wounded by Nalwood: the Weave falters, Disadvantage to keep concentrating.
    if (concentration && disrupted) adv = { ...adv, values: [...(adv.values ?? []), -1], dis: [...(adv.dis ?? []), "Nalwood disrupts the Weave"] };
    const { mode, why } = advFrom(event, adv);
    const fail = m?.has(`fail.save.${key}`) ? m.sources(`fail.save.${key}`).join(", ") : "";
    return d20Roll({
      actor: this, kind: "save", mode, why, title: source ? `${label}: ${source}` : label, parts, target: dc,
      notes: m?.notesFor("save") ?? [], autoFail: fail,
      extra: { save: key, concentration, actorUuid: this.uuid, source },
      footer: concentration ? `<button type="button" class="arn-end-conc" data-actor-uuid="${this.uuid}"><i class="fa-solid fa-circle-xmark"></i> Concentration broken: end it</button>` : ""
    });
  }

  /** Skill (NWP) check. Untrained is a plain d20. Trained adds the modifier (minimum +1). Master also has Advantage. */
  rollSkill(item, event) {
    const m = this.mods;
    if (!item) {
      const { mode, why } = advFrom(event, m?.adv("adv.check", "adv.skill") ?? NONE);
      return d20Roll({ actor: this, kind: "skill", mode, why, title: "Untrained Skill Check", parts: [...(m?.parts("check", "skill") ?? [])], notes: m?.notesFor("check", "skill") ?? [], extra: { skill: "" } });
    }
    const ab = item.system.ability;
    const mod = this.system.abilities[ab].mod;
    const master = item.system.tier === "master";
    // A Knack alone is untrained (a plain d20) with Advantage; a Knack skill also trained keeps its Advantage.
    const knackOnly = item.system.tier === "knack";
    const knack = knackOnly || !!item.flags?.arneyan?.knack;
    const parts = knackOnly ? [...(m?.parts("check", "skill") ?? [])] : [{ label: ARNEYAN.abilityAbbr[ab], value: mod <= 0 ? 1 : mod }, ...(m?.parts("check", `check.${ab}`, "skill") ?? [])];
    const masterSrc = master || knack ? { values: [1], adv: [master ? "Master" : "Knack"], dis: [] } : NONE;
    const { mode, why } = advFrom(event, masterSrc, m?.adv("adv.check", `adv.check.${ab}`, "adv.skill") ?? NONE);
    const fail = m?.has(`fail.check.${ab}`) ? m.sources(`fail.check.${ab}`).join(", ") : "";
    return d20Roll({
      actor: this, kind: "skill", mode, why, title: `${item.name} (${ARNEYAN.skillTiers[item.system.tier] ?? "Trained"})`, parts,
      notes: m?.notesFor("check", "skill") ?? [], autoFail: fail, extra: { skill: item.name }
    });
  }

  rollLuck(event) {
    if (this.type !== "character") return;
    return luckCheck(this, event);
  }

  /** Attack parts: attribute, BtH, rules, magic and item bonus. */
  attackParts(item) {
    const m = this.mods;
    const ranged = !!item.system.ranged;
    const parts = [];
    if (this.type === "npc") {
      parts.push({ label: "Attack", value: this.system.attributes.attack });
    } else {
      const abilityKey = this._weaponAbility(item);
      parts.push({ label: ARNEYAN.abilityAbbr[abilityKey], value: this.system.abilities[abilityKey].mod });
      parts.push({ label: "BtH", value: this.system.bth });
    }
    parts.push(...(m?.parts("attack", ranged ? "attack.ranged" : "attack.melee") ?? []));
    // Rules for some weapons only (scoped to this one): their attack bonuses too.
    parts.push(...(m?.forWeapon(item).mods.parts("attack", ranged ? "attack.ranged" : "attack.melee") ?? []));
    parts.push({ label: "Magic", value: item.system.magic });
    parts.push({ label: "Weapon bonus", value: item.system.attackBonus });
    return parts;
  }

  /** Total attack bonus for a weapon (shown on the sheet and used for the roll). */
  attackBonus(item) {
    return this.attackParts(item).reduce((t, p) => t + (Number(p.value) || 0), 0);
  }

  /**
   * Damage terms from rules for this weapon: everyone's, and those scoped to weapons that fit this one (Weapon
   * Specialisation's bonus with the picked weapon). `include`: the extras in the roll ("versatile": two-handed).
   */
  damageTerms(item, { include = [] } = {}) {
    const m = this.mods;
    if (!m) return [];
    const keys = ["damage", item.system.ranged ? "damage.ranged" : "damage.melee"];
    return [...m.damage(keys), ...m.forWeapon(item, { include }).mods.damage(keys)];
  }

  /**
   * The weapon's own damage dice for a roll, with any reroll worked in (Crushing Blow: 1s and 2s on a two-handed
   * weapon), and the damage card's notes: reminders, less those a weapon-scoped rule now applies, plus what was
   * rerolled. Bonus dice (riders, Versatile's extra die) are never rerolled.
   */
  weaponDice(item, { include = [] } = {}) {
    const m = this.mods;
    const own = item.system.damage;
    if (!m) return { formula: own, notes: [] };
    const fw = m.forWeapon(item, { include });
    const all = m.reroll(), mine = fw.mods.reroll();
    const n = Math.max(all.value, mine.value);
    const formula = n ? rerollDice(own, n) : own;
    const notes = m.notesFor("damage").filter(t => !fw.drop.has(t));
    if (formula !== own) notes.unshift(rerollNote([...new Set([...all.labels, ...mine.labels])], n));
    return { formula, notes };
  }

  /** Damage as shown on the sheet, with its types, e.g. "1d8+3 slashing + 1d6 fire". */
  damageLabel(item) {
    let mod = item.system.magic;
    if (this.type === "character") mod += this.system.abilities[this._weaponAbility(item)].mod;
    const f = item.system.damage || "-";
    const extra = this.damageTerms(item).map(t => t.value).join("");
    const type = item.system.damageType ? ` ${item.system.damageType}` : "";
    const riders = (item.system.bonusDamage ?? []).filter(b => b.formula && !b.when && (!b.mode || item.system.active)).map(b => ` + ${String(b.formula).replace(/^\+\s*/, "")} ${b.type || item.system.damageType}`).join("");
    return `${f}${mod ? `${mod > 0 ? "+" : ""}${mod}` : ""}${extra}${type}${riders}`;
  }

  /**
   * Attack: d20 + attribute modifier + BtH (+ magic and rules), against each target's AC. Bows and the like spend ammunition.
   * A feature making several attacks (activities of kind "attacks") passes: `adv`, an extra Advantage/Disadvantage source;
   * `targets`, this attack's own targets; `label`, the card title ("Twin Nock, arrow 2 of 2"); `notes`; and `bonus`, bonus
   * damage on a hit ({ value, label, noStack }) that the damage buttons carry.
   */
  async rollAttack(item, event, { offhand = false, adv = null, targets: only = null, label = "", notes: more = [], bonus = null, noDamage = "" } = {}) {
    const targets = only ?? targetActors();
    // Combat rules (combat.mjs): Full Cover, a jammed gun, off-hand, flanking and crowding.
    const sit = await attackSituation(this, item, targets, { offhand });
    if (sit.block) return null;
    // A creature that can't act doesn't use up ammunition.
    const { ok, ammo } = this.system.noAct ? { ok: true, ammo: null } : await spendAmmo(this, item);
    if (!ok) return null;
    const ammoName = ammo?._source?.name ?? ammo?.name ?? "";
    const ammoPlus = Number(ammoName.match(/\+(\d)/)?.[1] ?? 0);
    const m = this.mods;
    const ranged = !!item.system.ranged;
    const own = m?.adv("adv.attack", ranged ? "adv.attack.ranged" : "adv.attack.melee") ?? NONE;
    // Conditions on a single target (Prone, Restrained, Invisible...) change the attacker's roll.
    let against = NONE;
    // Rules scoped to weapons that fit this one apply; their reminders leave the card.
    const fw = m?.forWeapon(item) ?? null;
    const notes = [...more, ...(m?.notesFor("attack") ?? []).filter(t => !fw?.drop.has(t))];
    if (targets.length === 1) {
      const tm = targets[0].actor.system.mods;
      if (tm) {
        const a = tm.adv("adv.against", ranged ? "adv.against.ranged" : "adv.against.melee");
        against = { values: a.values, adv: a.adv.map(l => `${targets[0].name}: ${l}`), dis: a.dis.map(l => `${targets[0].name}: ${l}`) };
        if (!ranged && tm.has("crit.against.close")) notes.push(`${targets[0].name} (${tm.sources("crit.against.close").join(", ")}): a melee hit from within 5ft is a critical hit`);
      }
    }
    // Advantage on the first attack each round (Bless, Favoured Enemy and the like).
    let first = NONE, firstWith = NONE;
    const firstKeys = ["adv.attack.first", ...(ranged ? [] : ["adv.attack.first.melee"])];
    const firstSrc = m?.adv(...firstKeys) ?? NONE;
    // ...and on the first attack with a particular weapon each round (Weapon Specialisation), tracked per weapon.
    const withSrc = fw?.mods.adv(...firstKeys) ?? NONE;
    if (firstSrc.values.length || withSrc.values.length) {
      const combat = combatFor(this);
      const stamp = combat?.started ? `${combat.id}.${combat.round}` : null;
      if (firstSrc.values.length) {
        const last = this.getFlag?.(SYS, "lastAttack");
        if (!stamp || last !== stamp) first = { values: firstSrc.values, adv: firstSrc.adv.map(l => `${l} (first attack)`), dis: firstSrc.dis.map(l => `${l} (first attack)`) };
        if (stamp && this.isOwner) this.setFlag(SYS, "lastAttack", stamp);
      }
      if (withSrc.values.length) {
        const key = weaponKey(item.name) || item.id;
        const w = this.getFlag?.(SYS, "firstWith");
        const used = stamp && w?.stamp === stamp ? (w.used ?? []) : [];
        if (!stamp || !used.includes(key)) firstWith = { values: withSrc.values, adv: withSrc.adv.map(l => `${l} (first attack with ${item.name})`), dis: withSrc.dis.map(l => `${l} (first attack with ${item.name})`) };
        if (stamp && this.isOwner && !used.includes(key)) this.setFlag(SYS, "firstWith", { stamp, used: [...used, key] });
      }
    }
    // Weapon traits (Codex): Heavy needs Strength 13 (Small creatures always struggle, Large never do).
    const traits = String(item.system.traits ?? "");
    let heavy = NONE;
    if (this.type === "character" && /\bheavy\b/i.test(traits)) {
      const size = this.system.details?.size;
      const str = this.system.abilities.str.total ?? this.system.abilities.str.value;
      if (size === "small" || size === "tiny") heavy = { values: [-1], adv: [], dis: ["Heavy weapon (Small)"] };
      else if (size !== "large" && size !== "huge" && size !== "gargantuan" && str < 13) heavy = { values: [-1], adv: [], dis: ["Heavy weapon (Strength under 13)"] };
    }
    // Reach and range (Feature Board QoL): beyond reach or range warns; between a range and its long range (twice the
    // listed range, or the second number in "60–200 ft") the attack has Disadvantage.
    let far = NONE;
    const from = this.token?.object ?? this.getActiveTokens?.()?.[0];
    if (from && targets.length && canvas?.scene) {
      const { rangeOf, feetBetween } = await import("./qol.mjs");
      const r = rangeOf(item);
      const worst = Math.max(...targets.map(t => feetBetween(from.document, t.token.document)));
      if (worst > r.reach) {
        if (!r.normal) { ui.notifications.warn(`${item.name}: the target is ${worst}ft away, beyond your ${r.reach}ft reach.`); notes.unshift(`Out of reach: ${worst}ft (reach ${r.reach}ft)`); }
        else if (worst > r.long) { ui.notifications.warn(`${item.name}: the target is ${worst}ft away, beyond its ${r.long}ft range.`); notes.unshift(`Out of range: ${worst}ft (range ${r.normal}/${r.long}ft)`); }
        else if (worst > r.normal) far = { values: [-1], adv: [], dis: [`Long range (${worst}ft, range ${r.normal}ft)`] };
      }
    }
    if (/armou?r piercing/i.test(traits)) notes.push("Armour Piercing: ignores 2 points of the target's AC from armour (not Dexterity or feats).");
    if (/\bbrace\b/i.test(traits)) notes.push("Brace: Advantage against a charging enemy.");
    const { mode, why } = advFrom(event, own, against, first, firstWith, heavy, far, adv ?? NONE, ...sit.adv);
    notes.push(...sit.notes);
    if (this.system.noAct) notes.unshift(`${this.name} cannot take actions right now.`);
    return sit.after(await d20Roll({
      actor: this, kind: "attack", mode, why, critAt: this.system.critRange ?? 20,
      targets: targets.map(t => ({ name: t.name, ac: targetAC(t.actor, { ranged }), uuid: t.actor.uuid })),
      title: `${item.name}: ${label || `${offhand ? "Off-hand " : ""}Attack`}${ammo ? ` (${ammo.name})` : ""}`, parts: [...this.attackParts(item), ...(ammoPlus ? [{ label: ammo.name, value: ammoPlus }] : [])], notes,
      extra: { itemId: item.id, actorUuid: this.uuid, ammoName, ...(bonus ? { featureBonus: bonus } : {}), ...sit.extra },
      // A natural 1 is a miss: no damage buttons. A critical leads with critical damage; either way both are there.
      // A gun that misfires has none either (combat.mjs).
      footer: sit.footer(({ natural, crit }) => {
        if (natural === 1 && !crit) return "";
        // A manoeuvre that hits "instead of dealing damage" (Push): no damage buttons.
        if (noDamage) return `<p class="arn-card-meta"><i class="fa-solid fa-hand"></i> On a hit: ${esc(noDamage)}. No damage.</p>`;
        const normal = `<button type="button" class="arn-damage" data-item-id="${item.id}" data-crit="0"><i class="fa-solid fa-burst"></i> ${crit ? "Normal damage" : "Roll damage"}</button>`;
        const critical = `<button type="button" class="arn-damage ${crit ? "" : "ghost"}" data-item-id="${item.id}" data-crit="1"><i class="fa-solid fa-star"></i> Critical${crit ? " damage" : ""}</button>`;
        return `<div class="arn-dmg-buttons">${crit ? critical + normal : normal + critical}</div>`;
      })
    }));
  }

  /**
   * A touch spell's attack (touch.mjs): d20 + BtH + casting modifier against each target's AC, in place of the save.
   * On a hit its damage and effects go to the ones hit.
   */
  async rollSpellAttack(item, event, { cl = 1 } = {}) {
    const targets = targetActors();
    if (!targets.length) ui.notifications.info("Target the creature you touch (an ally needs no roll).");
    const own = this.mods?.adv("adv.attack", "adv.attack.melee") ?? NONE;
    // A single target's conditions change the roll, as for any melee attack (Blinded, Stunned, Paralysed...).
    let against = NONE;
    const tm = targets.length === 1 ? targets[0].actor.system.mods : null;
    if (tm) {
      const a = tm.adv("adv.against", "adv.against.melee");
      against = { values: a.values, adv: a.adv.map(l => `${targets[0].name}: ${l}`), dis: a.dis.map(l => `${targets[0].name}: ${l}`) };
    }
    const { mode, why } = advFrom(event, own, against);
    const sys = item.system;
    const cure = CURES.has(item.name);
    return d20Roll({
      actor: this, kind: "attack", mode, why, critAt: 20,
      targets: targets.map(t => ({ name: t.name, ac: targetAC(t.actor, { ranged: false }), uuid: t.actor.uuid })),
      title: `${item.name}: Touch attack`, parts: touchParts(this, item),
      notes: [...(this.system.noAct ? [`${this.name} cannot take actions right now.`] : []), "A touch spell: the attack replaces the save. On a hit it takes full effect; on a miss, none."],
      extra: { itemId: item.id, actorUuid: this.uuid, touchSpell: item.uuid, cl },
      footer: ({ natural }) => {
        if (natural === 1) return "";
        const b = [];
        if (cure && sys.damage) {
          b.push(`<button type="button" class="arn-touch-damage" data-as="undead"><i class="fa-solid fa-sun"></i> Damage the undead: ${esc(item.damageFormulaLabel())} radiant</button>`);
          b.push(`<button type="button" class="arn-touch-damage" data-as="reversed"><i class="fa-solid fa-skull"></i> Cast reversed: ${esc(item.damageFormulaLabel())} necrotic</button>`);
        } else if (sys.damage && sys.damageType !== "healing") {
          b.push(`<button type="button" class="arn-touch-damage"><i class="fa-solid fa-burst"></i> Roll damage: ${esc(item.damageFormulaLabel())}</button>`);
        }
        for (const { e, i } of touchApplies(item)) {
          b.push(`<button type="button" class="arn-touch-effect" data-index="${i}"><i class="fa-solid fa-wand-sparkles"></i> Apply ${esc(e.name || item.name)} to the one hit</button>`);
        }
        if (!b.length) b.push(`<p class="arn-card-meta"><i class="fa-solid fa-hand-sparkles"></i> On a hit, ${esc(item.name)} takes effect (no save).</p>`);
        return b.join("");
      }
    });
  }

  /** Damage: weapon dice + the same attribute modifier as the attack (+ magic and rules). */
  rollDamage(item, { crit = false, include = [], ammo = "", hits = null, misses = [], offhand = false, bonus = null } = {}) {
    const sys = item.system;
    const ammoPlus = Number(String(ammo).match(/\+(\d)/)?.[1] ?? 0);
    // Extra damage with a condition ("against undead", Versatile two-handed) joins the roll only when asked for.
    // Extra damage tied to the weapon's mode (a Flame Tongue's fire) counts on every hit while it's on, and not at all while it's off.
    const extras = [...(sys.bonusDamage ?? []).map((b, i) => ({ ...b, key: `b${i}` })).filter(b => !b.mode || sys.active).map(b => (b.mode ? { ...b, when: "" } : b)), ...this._versatileDie(item)]
      .map(x => (include.includes(x.key) ? { ...x, when: "", label: x.when ? `${x.formula} ${x.type || sys.damageType} (${x.when})` : "" } : x));
    let mod = sys.magic + ammoPlus;
    // An off-hand weapon adds no attribute modifier to damage (Codex, Dual Wielding).
    if (this.type === "character" && !offhand) mod += this.system.abilities[this._weaponAbility(item)].mod;
    // The weapon's dice (rerolls worked in) and the card's notes; the damage terms count rules scoped to this weapon.
    const dice = this.weaponDice(item, { include });
    const { terms, notes } = featureBonusTerms(this.damageTerms(item, { include }), dice.notes, bonus);
    return damageRoll({ ammo, offhand, subdual: isSubdualWeapon(item), featureBonus: bonus,
      actor: this, item, title: `${item.name}: ${offhand ? "Off-hand " : ""}${crit ? "Critical Damage" : "Damage"}`, formula: dice.formula, mod, crit, damageType: sys.damageType,
      terms, notes, extras, include, hits, misses
    });
  }

  /** Versatile: one extra damage die two-handed, offered as a button on the damage card. */
  _versatileDie(item) {
    if (!/\bversatile\b/i.test(item.system.traits ?? "")) return [];
    const die = String(item.system.damage ?? "").match(/d(\d+)/i);
    return die ? [{ formula: `1d${die[1]}`, type: item.system.damageType, when: "two-handed (Versatile)", key: "versatile" }] : [];
  }

  _weaponAbility(item) {
    let a = item.system.ability;
    // The Finesse trait: the better of Strength and Dexterity, whatever the attribute box says.
    if (a === "str" && /\bfinesse\b/i.test(item.system.traits ?? "")) a = "finesse";
    if (a === "finesse") return this.system.abilities.dex.mod >= this.system.abilities.str.mod ? "dex" : "str";
    return a;
  }

  /**
   * Take damage or healing. Damage goes through immunity, resistance (half) and vulnerability (double),
   * then temporary HP. Concentration calls for a Fortitude save.
   * @param {number} amount
   * @param {object} [o]
   * @param {string} [o.type]       Damage type.
   * @param {number} [o.mult]       1 normal, 0.5 half, 2 double, -1 healing.
   * @param {boolean} [o.temp]      Healing given as temporary HP.
   * @param {string} [o.weapon]     The weapon that dealt it: "plain", "silver", "adamantine", "magic" or "" (not a weapon).
   * @param {{type:string, amount:number}[]} [o.parts]  Damage of several types (a flaming sword); replaces amount and type.
   */
  async applyDamage(amount, { type = "", mult = 1, temp = false, weapon = "", parts = null, spell = "", disrupt = false, subdual = false } = {}) {
    const hp = this.system.attributes.hp;
    const before = hp.value;
    const maxHp = hp.max;
    const lines = [];
    if (mult < 0) {
      if (temp) {
        const newTemp = Math.max(hp.temp ?? 0, amount);
        await this.update({ "system.attributes.hp.temp": newTemp });
        return { text: `${this.name} gains ${amount} temporary HP`, line: `${this.name} gains ${amount} temporary HP` };
      }
      // Healing a creature below 0 HP first sets it to 0, then adds the rest (Codex, Death & Dying).
      const value = Math.min(maxHp, Math.max(0, before) + amount);
      // Healing removes as much non-lethal damage as the HP it restores (Codex v0.10.0, Subdual Damage): read as the
      // healing's full amount, so a creature knocked out at full HP still wakes.
      const sub = Math.max(0, Number(this.flags?.arneyan?.subdual) || 0);
      const subLeft = Math.max(0, sub - Math.max(0, Math.floor(amount) || 0));
      await this.update({ "system.attributes.hp.value": value, ...(sub ? { "flags.arneyan.subdual": subLeft } : {}) }, { arneyanDowned: true });
      await this._syncDowned(before);
      const subText = sub ? `, ${sub - subLeft} non-lethal damage gone` : "";
      return { text: `${this.name} heals ${value - before} HP (now ${value}/${maxHp})${subText}`, line: `${this.name} is healed for ${value - before} HP${subText}` };
    }
    const t = this.system.traits ?? { resist: [], immune: [], vuln: [] };
    // Immune to a particular spell (Shield stops Magic Missile): nothing gets through.
    if (spell && (t.immune ?? []).some(x => String(x).toLowerCase() === `spell:${String(spell).toLowerCase()}`)) {
      const text = `${this.name} is immune to ${spell}: no damage`;
      return { text, line: text };
    }
    if (mult !== 1) lines.push(mult === 0.5 ? "halved" : "doubled");
    const match = (list, ty) => list.map(x => String(x).split(/\s+/)).find(([w]) => w === ty || w === "all" || weaponTrait(w, ty, weapon));
    const label = (w, ty) => WEAPON_TRAITS[w] ?? ty;
    // Each damage type meets the creature's immunities, resistances and vulnerabilities on its own.
    const list = (parts?.length ? parts : [{ type, amount }]).map(p => ({ type: p.type || "", amount: Math.max(0, Number(p.amount) || 0) }));
    const taken = [];
    let exact = 0;
    // One hit is one instance: a flat resistance ("all 5") comes off once, however many types the hit has.
    const usedFlat = new Set();
    for (const p of list) {
      let d = p.amount * mult;
      const ty = p.type;
      const im = ty ? match(t.immune, ty) : null;
      if (im) { d = 0; lines.push(`immune to ${label(im[0], ty)}`); }
      else {
        const r = ty ? match(t.resist, ty) : null;
        if (r) {
          const amt = Number(r[r.length - 1]);
          const key = r.join(" ");
          if (!amt) { d = d / 2; lines.push(`resists ${label(r[0], ty)}`); }
          else if (!usedFlat.has(key)) { usedFlat.add(key); d = Math.max(0, d - amt); lines.push(`resists ${label(r[0], ty)} ${amt}`); }
        }
        if (ty && match(t.vuln, ty)) { d *= 2; lines.push(`vulnerable to ${ty}`); }
      }
      exact += d;
      taken.push({ type: ty, amount: Math.floor(d) });
    }
    // Rounded down once, at the end.
    let dmg = Math.floor(exact);
    const rolledDmg = dmg;
    const after = [];
    const dr = this.system.dr ?? 0;
    if (dr && dmg > 0) { after.push(`damage reduction ${Math.min(dr, dmg)}`); dmg = Math.max(0, dmg - dr); }
    let tempLeft = hp.temp ?? 0;
    const soaked = Math.min(tempLeft, dmg);
    tempLeft -= soaked;
    const toHp = dmg - soaked;
    if (soaked) after.push(`${soaked} on temporary HP`);
    // Non-lethal (subdual) damage goes on its own track instead of off HP (combat.mjs).
    const value = subdual ? before : before - toHp;
    await this.update({ "system.attributes.hp.value": value, "system.attributes.hp.temp": tempLeft, ...(subdual && toHp > 0 ? subdualUpdate(this, toHp) : {}) }, { arneyanDowned: true });
    await this._syncDowned(before);
    // Concentration check.
    if (dmg > 0 && this.effects.some(e => e.flags?.[SYS]?.concentration)) {
      const dc = Math.max(10, Math.floor(dmg / 2));
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="arn-card"><header class="arn-card-title">${esc(this.name)}: hold concentration?</header>
          <p>Took ${dmg} damage. Fortitude save, DC ${dc} (10 or half the damage).${disrupt ? " <strong>Nalwood:</strong> the Weave falters, Disadvantage." : ""}</p>
          <button type="button" class="arn-save-btn" data-save="fort" data-dc="${dc}" data-concentration="1"${disrupt ? ' data-disrupted="1"' : ""} data-actor-uuid="${this.uuid}"><i class="fa-solid fa-shield-halved"></i> Roll Fortitude save</button></div>`
      });
    }
    // "Goblin takes 9 damage: 7 slashing, 2 fire (resists fire)", or "Goblin takes 7 slashing damage".
    const typed = taken.filter(x => x.amount > 0 || taken.length === 1);
    const kinds = typed.length > 1 ? `damage: ${typed.map(x => `${x.amount} ${x.type || "untyped"}`).join(", ")}` : `${typed[0]?.type ? `${typed[0].type} ` : ""}damage`;
    const what = `${this.name} takes ${rolledDmg} ${subdual ? "non-lethal " : ""}${kinds}${lines.length ? ` (${lines.join(", ")})` : ""}${after.length ? `; ${toHp} to HP after ${after.join(" and ")}` : ""}`;
    const ko = subdual && value > 0 && (Number(this.flags?.[SYS]?.subdual) || 0) >= value;
    return { text: `${what}. HP ${value}/${maxHp}${subdual ? `, non-lethal ${Number(this.flags?.[SYS]?.subdual) || 0}` : ""}`, line: `${what}${value <= 0 && before > 0 ? " and goes down" : ko ? " and is knocked out" : ""}` };
  }

  /**
   * Keep Unconscious and Dead in step with HP, whoever changed it (damage, healing or a number typed on the sheet).
   * Monsters die at 0. Characters fall unconscious at 0 or below, bleed below 0 until stabilised, and die at
   * their death threshold.
   */
  async _syncDowned(prev) {
    if (!["character", "npc"].includes(this.type) || this.getFlag?.(SYS, "transform")) return;
    const hp = this.system.attributes.hp.value;
    const st = statusesOf(this);
    const on = id => (st.has(id) ? null : toggleCondition(this, id, true, id === "dead" ? { overlay: true } : {}).catch(() => null));
    // Taking a condition off removes only the plain condition, never a spell's effect that carries it (Sleep).
    const off = async id => {
      if (!st.has(id)) return;
      const plainId = CONFIG.statusEffects?.find(s => s.id === id)?._id;
      const plain = this.effects.filter(e => (e.statuses?.has?.(id) ?? e.statuses?.includes?.(id)) && (e.id === plainId || (!e.origin && (e.statuses?.size ?? e.statuses?.length ?? 0) === 1)));
      if (plain.length) await this.deleteEmbeddedDocuments("ActiveEffect", plain.map(e => e.id)).catch(() => null);
    };
    if (this.type === "npc") {
      // Defeated in the combat tracker too, so its turns are skipped (and back if it's healed).
      // Only when HP crosses 0, so a GM's manual "defeated" (or undefeated) mark isn't undone by every scratch.
      const defeated = hp <= 0;
      const crossed = prev === undefined || prev === null ? true : (Number(prev) > 0) !== (hp > 0);
      // Every encounter it's in, not only the one this client's tracker shows.
      if (crossed) for (const c of combatantsOf(this, { all: true }).filter(c => c.actor === this || !c.token?.actorLink)) {
        if (c.defeated !== defeated && c.isOwner) await c.update({ defeated }).catch(() => null);
      }
      if (defeated) return on("dead");
      return off("dead");
    }
    const deathAt = this.system.attributes.deathAt;
    if (hp <= deathAt) {
      await off("unconscious");
      return on("dead");
    }
    if (hp <= 0) {
      await off("dead");
      await on("unconscious");
      // Hurt again while stable: the bleeding starts again.
      if (this.system.attributes.stable && prev !== undefined && hp < prev && hp < 0) await this.update({ "system.attributes.stable": false });
      return;
    }
    // Back above 0: wake up and stop being dead (only the plain conditions from going down).
    if (prev === undefined || prev <= 0) {
      await off("dead");
      if (prev !== undefined) await off("unconscious");
    }
    if (this.system.attributes.stable) await this.update({ "system.attributes.stable": false });
  }

  /** Last Chance: burn 1 Luck for a Fortitude save, DC 10. A success stabilises the character. */
  async lastChance(event) {
    if (this.type !== "character" || this.system.attributes.state !== "dying") return ui.notifications.warn(`${this.name} isn't dying.`);
    if ((this.system.luck?.value ?? 0) < 1) return ui.notifications.warn(`${this.name} has no Luck left to burn.`);
    await this.update({ "system.luck.value": this.system.luck.value - 1 });
    const msg = await this.rollSave("fort", event, { dc: 10, source: "Last Chance (1 Luck burned)" });
    const f = msg?.flags?.[SYS] ?? {};
    const ok = !f.autoFail && (f.natural === 20 || (f.natural !== 1 && f.total >= 10));
    if (ok) await this.update({ "system.attributes.stable": true });
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<div class="arn-card"><p>${esc(this.name)} ${ok ? "is stabilised and stops bleeding." : "is still dying."}</p></div>` });
  }

  /** An ally's successful Wisdom check (DC 10), First Aid, or the GM's say-so. */
  async stabilise() {
    if (this.type !== "character" || !game.user.isGM) return;
    await this.update({ "system.attributes.stable": true });
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<div class="arn-card"><p>${esc(this.name)} is stabilised and stops bleeding.</p></div>` });
  }

  /** Raise a class by one level (the sheet's up-arrow). */
  levelUp(cls) {
    if (!cls) return;
    return setClassLevel(this, cls, cls.system.levels + 1);
  }

  /** Set a class to any level (the sheet's level box). */
  setClassLevel(cls, level) {
    return setClassLevel(this, cls, level);
  }

  /**
   * Rest. A long rest restores spell slots and 1/long rest abilities, ends temporary HP and removes
   * one level of Exhaustion. Healing depends on where: a safe haven heals the largest Hit Die + Con
   * (rolled once per stay, negative Con counts as 0) each night; outdoors heals 1 HP, or the Con
   * modifier (minimum 1) with shelter. Medium or heavy armour gives no benefit. Luck never recovers.
   */
  async rest() {
    if (this.type !== "character") return;
    if (!(await confirmRestInFight(this))) return;
    const armour = this.items.find(i => i.type === "armour" && i.system.equipped && ["medium", "heavy"].includes(i.system.category));
    const haven = this.system.rest.haven;
    const where = await DialogV2.wait({
      window: { title: `${this.name}: Rest` },
      content: `${armour ? `<p class="arn-warn"><strong>${armour.name}</strong> is ${armour.system.category} armour: sleeping in it gives none of a long rest's benefits. Take it off first.</p>` : ""}
        <p>Where are you resting?</p>
        <ul class="arn-help-list">
          <li><strong>Safe haven</strong> (town, inn, stronghold): heal your largest Hit Die + Con each night, rolled once per stay${haven ? ` (this stay: ${haven} HP a night)` : ""}.</li>
          <li><strong>Camp with shelter</strong> (tent, bedroll): heal your Con modifier, minimum 1.</li>
          <li><strong>Camp in the open</strong>: heal 1 HP.</li>
        </ul>`,
      buttons: [
        { action: "haven", label: "Safe haven", icon: "fa-solid fa-house" },
        { action: "shelter", label: "Camp, shelter", icon: "fa-solid fa-campground", default: true },
        { action: "open", label: "Camp, open", icon: "fa-solid fa-moon" }
      ],
      rejectClose: false
    });
    if (!where) return;
    return this.restAt(where);
  }

  /**
   * Rest at a place ("haven", "shelter" or "open") with no dialog. Posts its own card unless `quiet`; returns a
   * one-line summary either way (the party sheet's Rest the party puts every member's line on one card).
   */
  async restAt(where, { quiet = false } = {}) {
    if (this.type !== "character") return "";
    // A long rest lets a slain pact servant be called again (Warlock, Pact Summons).
    if (this.getFlag(SYS, "pactSlain")) await this.unsetFlag(SYS, "pactSlain").catch(() => null);
    const armour = this.items.find(i => i.type === "armour" && i.system.equipped && ["medium", "heavy"].includes(i.system.category));
    const haven = this.system.rest.haven;
    if (armour) {
      await rechargeAtDawn(this);
      const line = `${this.name} sleeps in ${armour.name}: none of a long rest's benefits.`;
      if (!quiet) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<p><strong>${esc(this.name)}</strong> sleeps in ${esc(armour.name)} and gains none of a long rest's benefits.</p>` });
      return line;
    }
    const con = this.system.abilities.con.mod;
    let heal = 0;
    let note = "";
    const updates = {};
    const rolls = [];
    if (where === "haven") {
      heal = haven;
      if (!heal) {
        const dice = this.items.filter(i => i.type === "class").map(c => Number(c.system.hitDie.slice(1)));
        const largest = Math.max(4, ...dice);
        const r = await new Roll(`1d${largest}`).evaluate();
        rolls.push(r);
        heal = r.total + Math.max(0, con);
        updates["system.rest.haven"] = heal;
        note = ` (rolled d${largest}: ${r.total}, + Con, for every night of this stay)`;
      }
    } else {
      updates["system.rest.haven"] = 0;
      heal = where === "shelter" ? Math.max(1, con) : 1;
    }
    const hp = this.system.attributes.hp;
    const max = hp.effectiveMax ?? hp.max;
    updates["system.attributes.hp.value"] = Math.min(max, Math.max(hp.value, 0) + heal);
    updates["system.attributes.hp.temp"] = 0;
    // A full rest heals all non-lethal damage (Codex v0.10.0, Subdual Damage).
    const hadSubdual = Number(this.flags?.arneyan?.subdual) > 0;
    if (hadSubdual) updates["flags.arneyan.subdual"] = 0;
    const hadExhaustion = this.system.attributes.exhaustion > 0;
    updates["system.attributes.exhaustion"] = Math.max(0, this.system.attributes.exhaustion - 1);
    await this.update(updates);
    // Spell slots and daily abilities.
    const items = [];
    for (const c of this.items.filter(i => i.type === "class")) items.push({ _id: c.id, "system.slotsUsed": Array(10).fill(0) });
    for (const a of this.items.filter(i => ["ability", "feat"].includes(i.type) && ["day", "rest", "encounter"].includes(i.system.uses?.per) && i.system.uses.max > 0)) {
      items.push({ _id: a.id, "system.uses.value": a.system.uses.max });
    }
    if (items.length) await this.updateEmbeddedDocuments("Item", items);
    // Dawn: staffs regain charges (Catalogue, magic item rules).
    const recharged = await rechargeAtDawn(this);
    const label = { haven: "in a safe haven", shelter: "in camp with shelter", open: "in the open" }[where];
    const line = `${this.name}: +${heal} HP${hadSubdual ? ", non-lethal damage gone" : ""}${hadExhaustion ? ", one Exhaustion level off" : ""}${recharged.length ? `; ${recharged.join("; ")}` : ""}.`;
    if (quiet) return line;
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }), rolls,
      content: `<div class="arn-card"><header class="arn-card-title">${this.name} rests ${label}</header>
        <p>Heals <strong>${heal} HP</strong>${note}. Spell slots and daily abilities restored, temporary HP gone${hadSubdual ? ", all non-lethal damage healed" : ""}${hadExhaustion ? ", one level of Exhaustion removed" : ""}. Luck does not recover with rest.</p>${recharged.length ? `<p>At dawn: ${recharged.map(esc).join("; ")}.</p>` : ""}</div>`
    });
  }

  /** Long rest shortcut kept for macros. */
  longRest() {
    return this.rest();
  }
}

export class ArneyanItem extends Item {
  /** Where a feature or feat comes from and the level it arrives at, for sheets and chat ("Cleric · Level 3"). */
  get levelLabel() {
    const sys = this.system ?? {};
    if (this.type === "ability") {
      if (sys.kind === "ancestry") return "Ancestry trait";
      // A custom ability with no class or kit says nothing (no "Level 1" for something made by hand).
      const from = sys.className || "";
      if (!from) return "";
      return [from, sys.level > 0 ? `Level ${sys.level}` : ""].filter(Boolean).join(" · ");
    }
    if (this.type === "feat") return ["Feat", sys.path, sys.levelTaken > 0 ? `taken at level ${sys.levelTaken}` : ""].filter(Boolean).join(" · ");
    if (this.type === "kit") return [sys.className, "Kit"].filter(Boolean).join(" · ");
    return "";
  }


  /** Unidentified gear: players see a plain name and description until the GM reveals it (PF2e's mystified items). */
  prepareDerivedData() {
    super.prepareDerivedData();
    const s = this.system;
    if (s?.identified === false && game.user && !game.user.isGM) {
      this.name = s.unidentifiedName || `Unidentified ${{ weapon: "weapon", armour: "armour", equipment: "item" }[this.type] ?? "item"}`;
      s.description = s.unidentifiedDescription || "<p>You haven't worked out what this is yet. Identify reveals one property per casting.</p>";
    }
  }

  async _preUpdate(changes, options, user) {
    if ((await super._preUpdate(changes, options, user)) === false) return false;
    // A new attribute pick undoes the 18 cap's move (the new pick is checked against the cap afresh).
    const pickNow = foundry.utils.getProperty(changes, "system.abilityChoice.value");
    if (pickNow !== undefined && pickNow !== this.system.abilityChoice?.value && this.system.abilityChoice?.moved
      && foundry.utils.getProperty(changes, "system.abilityChoice.moved") === undefined) {
      foundry.utils.setProperty(changes, "system.abilityChoice.moved", "");
    }
    const tier = foundry.utils.getProperty(changes, "system.tier");
    if (this.type === "skill" && this.parent instanceof Actor && tier && tier !== this.system.tier) {
      // A Knack comes only from an ancestry at creation: a trained skill can't be turned into one (it would give back
      // its slots for nothing). The GM may, to correct a sheet.
      if (tier === "knack" && !user?.isGM) {
        if (user?.id === game.user.id) ui.notifications.warn(`${this.name}: a Knack comes from your ancestry at creation; a trained skill can't become one.`);
        for (const app of new Set([this._sheet, ...Object.values(this.apps ?? {})])) if (app?.rendered) app.render();
        return false;
      }
      // A higher tier costs the slots between them (Trained to Master one, a Knack to Trained one, to Master two).
      const more = skillCost(tier) - skillCost(this.system.tier);
      if (more > 0 && !(await skillSlotOk(this.parent, more, `Making ${this.name} ${ARNEYAN.skillTiers[tier] ?? tier}`, user))) {
        // Refused: redraw the open sheet so its Training select goes back to what it was.
        for (const app of new Set([this._sheet, ...Object.values(this.apps ?? {})])) if (app?.rendered) app.render();
        return false;
      }
    }
  }

  /**
   * Skills added to a character, checked as one batch (several dropped or created at once): one of each, and only as
   * many as the slots allow (a Master takes two). The GM is asked once for the lot; a player keeps those that fit.
   */
  static async _preCreateOperation(documents, operation, user) {
    if ((await super._preCreateOperation?.(documents, operation, user)) === false) return false;
    const actor = operation?.parent;
    if (!(actor instanceof Actor) || actor.type !== "character" || operation.arneyanGrant) return;
    const skills = documents.filter(d => d.type === "skill" && !actor.items.has(d.id));
    if (!skills.length) return;
    const plan = planSkills(actor, skills);
    const drop = new Set(plan.dupes);
    if (plan.dupes.length && user?.id === game.user.id) {
      ui.notifications.warn(`${actor.name} already has ${[...new Set(plan.dupes.map(d => d.name))].join(", ")}. To improve a skill, set it to Master.`);
    }
    if (plan.over.length) {
      const what = [...plan.fit, ...plan.over].map(d => d.name).join(", ");
      if (!(await skillSlotOk(actor, plan.cost, what, user))) for (const d of plan.over) drop.add(d);
    }
    for (let i = documents.length - 1; i >= 0; i--) if (drop.has(documents[i])) documents.splice(i, 1);
    if (!documents.length) return false;
  }

  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    // The world update's fingerprints (migrate.mjs): what this item's mechanics were in the compendium it came from.
    const stored = this._source ?? this;
    if (!stored.flags?.arneyan?.synced && !options?.arneyanMigration) {
      try { const st = await stampOnCreate(stored); if (st) this.updateSource({ "flags.arneyan.synced": st }); } catch (err) { console.warn("Arneyan | fingerprint", err); }
    }
    // The world update's copy of what it replaced belongs to the item it was taken from, not to copies of it.
    if (stored.flags?.arneyan?.before && !options?.arneyanMigration) this.updateSource({ "flags.arneyan.-=before": null });
    // A lit torch handed to someone else arrives unlit.
    if (this.system?.light?.lit && !options.arneyanGrant) this.updateSource(putOutData(this.system.light));
    const actor = this.parent;
    if (!(actor instanceof Actor) || actor.type !== "character") return;
    // A feat new to the character records the level it was taken at (options.arneyanKeepLevel keeps the one it has).
    if (this.type === "feat" && !actor.items.has(this.id) && !options.arneyanKeepLevel) this.updateSource({ "system.levelTaken": actor.system.level || 0 });
    // Where the 18 cap moved a feat's bonus belongs to the character it was moved on: a copy dragged to another starts
    // again (and is asked afresh if it goes past 18 there). A whole duplicated or imported character keeps its own.
    if (this.type === "feat" && this.system.abilityChoice?.moved && !options.arneyanMigration && !options.arneyanImport && !actor.items.has(this.id)) this.updateSource({ "system.abilityChoice.moved": "" });
    // Skills: one of each, and only as many as the slots allow; checked for the whole batch in _preCreateOperation.
    // A count worked out from a formula (Flèche: Dexterity modifier a day) starts full.
    if (this.system?.uses?.formula && !actor.items.has(this.id)) {
      const n = formulaUsesFor(actor, this);
      if (n !== null) this.updateSource({ "system.uses.value": n });
    }
    // An import (import.mjs) sets classes, ancestries and spells' classes itself.
    if (options.arneyanImport) return;
    if (this.type === "class") {
      // Items arriving with their actor (duplicating or importing a character) are left as they are.
      if (actor.items.has(this.id)) return;
      // Dropping a class the character already has raises that class by a level instead.
      const existing = actor.items.find(i => i.type === "class" && i.name === this.name && i.id !== this.id);
      if (existing) {
        if (user.id === game.user.id) setClassLevel(actor, existing, existing.system.levels + 1);
        return false;
      }
      this.updateSource({ "system.levels": 1, "system.hpRolls": [], "system.luckGains": [], "system.slotsUsed": [], "system.extraSlots": [], "flags.arneyan.fresh": true });
    }
    if (this.type === "ancestry" && !actor.items.has(this.id)) {
      // Dropped on (not arriving with an imported or duplicated character): set it up, starting clean.
      this.updateSource({ "flags.arneyan.fresh": true, "flags.arneyan.-=ancestry": null, name: this.name.replace(/\s*\(.*\)$/, "") });
    }
    if (this.type === "spell" && !this.system.className) {
      // Cast it as the first class on this character whose list has it.
      const lists = this.system.classes ?? [];
      const caster = actor.items.find(i => i.type === "class" && i.system.castingAbility && lists.some(l => i.name === l || i.name.startsWith(l + " ")));
      if (caster) this.updateSource({ "system.className": caster.name });
    }
  }

  async _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    const actor = this.parent;
    // An attribute bonus of the player's choice (Will of Iron, a Fighter's Attribute Bonus): ask the one who added it,
    // granted by a level up too. Nothing picked (Later, or closed): no bonus yet, and the sheet shows "Choose attribute".
    // A new character's 1st-level steps go first: the question waits until they're over (and isn't asked if it was
    // answered or the item removed meanwhile).
    const ask = (needs, prompt, what) => {
      if (userId !== game.user.id || !(actor instanceof Actor) || actor.type !== "character" || options.arneyanNoChoice || !needs(this)) return;
      const run = () => (actor.items.has(this.id) && needs(this) ? prompt(this) : null);
      const wait = firstLevelSetupRunning(actor);
      (wait ? wait.then(run) : Promise.resolve(run())).catch(err => console.warn(`Arneyan | ${what} choice`, err));
    };
    ask(needsAbilityChoice, promptAbilityChoice, "attribute");
    // The same for a weapon of the player's choice (Weapon Specialisation): Later leaves its rules as reminders.
    ask(needsWeaponChoice, promptWeaponChoice, "weapon");
    // A creation feat's attribute bonus over 18 (Toughness's +1 Con on a Con 18 character): where it goes instead.
    ask(i => !!creationOverflow(i), promptCreationOverflow, "creation cap");
    if (userId !== game.user.id || !(actor instanceof Actor) || actor.type !== "character" || options.arneyanGrant) return;
    if (this.type === "class") {
      if (!this.flags.arneyan?.fresh) return;
      const classes = actor.items.filter(i => i.type === "class");
      if (classes.length === 1) {
        await this.update({ "flags.arneyan.-=fresh": null });
        return firstLevelSetup(actor, this);
      }
      // A new class for a multiclass character: its 1st level is a normal level up.
      await this.update({ "system.levels": 0, "flags.arneyan.-=fresh": null });
      const done = await setClassLevel(actor, this, 1);
      if (done === false && actor.items.has(this.id)) {
        ui.notifications.info(`${this.name} was not added.`);
        await this.delete({ arneyanGrant: true });
      }
      return;
    }
    if (this.type === "kit") return syncKitFeatures(actor, this);
    if (this.type === "ancestry") {
      if (!this.flags.arneyan?.fresh) return;
      await this.update({ "flags.arneyan.-=fresh": null });
      const old = actor.items.filter(i => i.type === "ancestry" && i.id !== this.id).map(i => i.id);
      if (old.length) await actor.deleteEmbeddedDocuments("Item", old);
      await actor.update({ "system.attributes.speed": this.system.speed, "system.details.size": this.system.size, "system.details.senses": this.system.vision ?? "" });
      if (!options.arneyanSkipSetup) await ancestrySetup(actor, this, { replacing: old.length > 0 });
    }
  }

  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    // An attribute just picked (Steady Hand: Strength) that a new character's 18 cap stops: ask where it goes.
    if (userId === game.user.id && !options.arneyanMigration && !options.arneyanNoChoice && foundry.utils.hasProperty(changed, "system.abilityChoice.value") && creationOverflow(this)) {
      promptCreationOverflow(this).catch(err => console.warn("Arneyan | creation cap", err));
    }
  }

  _onDelete(options, userId) {
    super._onDelete(options, userId);
    const actor = this.parent;
    if (userId !== game.user.id || !(actor instanceof Actor) || options.arneyanGrant) return;
    if (this.type === "class" || this.type === "kit" || this.type === "ancestry") removeGrants(actor, this);
    // A character that loses an ancestry has had one: the next isn't part of making it (no 18 cap past 1st level).
    if (this.type === "ancestry" && actor.type === "character" && !actor.flags?.arneyan?.hadAncestry) actor.update({ "flags.arneyan.hadAncestry": true }).catch(() => {});
  }

  /** Post the item to chat, or roll it where that makes sense. */
  async use(event) {
    const actor = this.actor;
    // Contests, Unarmed Strike and reactions (combat.mjs).
    const handled = await combatUse(this, event);
    if (handled !== undefined) return handled;
    switch (this.type) {
      case "weapon": return actor?.rollAttack(this, event);
      case "skill": return actor?.rollSkill(this, event);
      case "spell": return this._castSpell(event);
      case "ability": return this._useAbility(event);
      // A feat with an active use (uses, options, a switch or effects) works as an ability does; the rest post their card.
      case "feat": return this._useAbility(event);
      case "equipment": return useEquipment(this, event);
      default: return this.toChat();
    }
  }

  async toChat(extraHtml = "") {
    const description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.system.description ?? "", { rollData: this.actor?.getRollData?.() ?? {}, relativeTo: this });
    const content = await foundry.applications.handlebars.renderTemplate("systems/arneyan/templates/chat/item-card.hbs", {
      item: this, config: ARNEYAN, description, extraHtml, open: !extraHtml, page: this.system.source?.page, book: this.system.source?.book
    });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content, flags: { arneyan: { itemUuid: this.uuid } } });
  }

  /** Buttons for the chat card: save request, damage, effects. */
  _actionButtons({ dc = null, cl = 1 } = {}) {
    const sys = this.system;
    const out = [];
    // A touch spell: an attack roll in place of the save (touch.mjs). One that only harms has its damage and effects
    // on the attack's card, for the creature it hits; a cure or a reversible spell keeps them here for an ally.
    const touch = isTouchAttack(this);
    const forAllies = touch && (CURES.has(this.name) || REVERSED_ONLY.has(this.name) || ["Polymorph", "Plane Shift"].includes(this.name));
    if (touch) out.push(`<button type="button" class="arn-touch-attack" data-item-uuid="${this.uuid}" data-cl="${cl}" data-tooltip="d20 + BtH + casting modifier against the target's AC (no save). An ally is touched automatically."><i class="fa-solid fa-hand-sparkles"></i> ${esc(touchLabel(this))}</button>`);
    if (touch && !forAllies) return out.concat(sys.template?.type && this.actor ? [areaButton(this, { actor: this.actor, dc, cl, formula: sys.damage ? this.damageFormulaLabel() : "", itemUuid: this.uuid })] : []).join("");
    if (sys.save && !touch) {
      out.push(`<button type="button" class="arn-save-btn" data-save="${sys.save}" data-dc="${dc ?? ""}" data-source="${esc(this.name)}"${this.type === "spell" ? ' data-spell="1"' : ""}><i class="fa-solid fa-shield-halved"></i> ${ARNEYAN.saveTypes[sys.save]} save${dc ? ` DC ${dc}` : ""}</button>`);
      if (sys.saveEffect) out.push(`<p class="arn-save-effect">On a save: ${esc(sys.saveEffect)}</p>`);
    }
    if (sys.damage) {
      const heal = sys.damageType === "healing";
      out.push(`<button type="button" class="arn-item-damage" data-item-uuid="${this.uuid}"><i class="fa-solid fa-${heal ? "heart" : "burst"}"></i> ${heal ? "Roll healing" : "Roll damage"}: ${esc(this.damageFormulaLabel())}</button>`);
    }
    if (sys.template?.type && this.actor) out.push(areaButton(this, { actor: this.actor, dc, cl, formula: sys.damage ? this.damageFormulaLabel() : "", itemUuid: this.uuid }));
    (sys.applies ?? []).forEach((e, i) => {
      if (e.target === "self") return;
      out.push(`<button type="button" class="arn-apply-effect" data-item-uuid="${this.uuid}" data-index="${i}" data-cl="${cl}"><i class="fa-solid fa-wand-sparkles"></i> Apply ${esc(e.name || this.name)} to targets</button>`);
    });
    return out.join("");
  }

  /**
   * Put this item's self effects on its owner; start concentration if needed. `fresh`: skip an effect of this item's
   * that is still on (a feature used again through another of its options doesn't stack a second copy).
   */
  async _applySelf(cl, { fresh = false } = {}) {
    const actor = this.actor;
    if (!actor) return [];
    const created = [];
    for (const e of (this.system.applies ?? []).filter(x => x.target === "self")) {
      const name = e.name || this.name;
      if (fresh && (actor.effects ?? []).some?.(x => x.origin === this.uuid && x.name === name && !x.disabled)) continue;
      created.push(...await applyEffectTo([actor], await effectDataFor(e, this, { cl, caster: actor })));
    }
    if (this.system.concentration) await startConcentration(actor, this, created);
    return created;
  }

  /** The casting class entry (slots, DC, class level) this spell uses on its actor. */
  get caster() {
    const actor = this.actor;
    if (actor?.type !== "character" || this.type !== "spell") return null;
    const casters = actor.system.casters;
    const want = [this.system.className, ...(this.system.classes ?? [])].filter(Boolean).map(n => n.toLowerCase());
    return casters.find(c => c.name.toLowerCase() === (this.system.className || "").toLowerCase())
      ?? casters.find(c => want.some(w => c.name.toLowerCase() === w || c.name.toLowerCase().startsWith(w + " ")))
      ?? casters[0] ?? null;
  }

  async _castSpell() {
    const actor = this.actor;
    const sys = this.system;
    let dc = null;
    let caster = null;
    if (actor?.system.noCast) return ui.notifications.warn(`${actor.name} cannot cast spells right now (${actor.mods.sources("no.cast").join(", ")}).`);
    if (actor && canvas?.scene) (await import("./qol.mjs")).warnSpellRange(actor, this);
    if (actor?.type === "character") {
      caster = this.caster;
      if (caster && sys.level > 0) {
        const slot = caster.slots[sys.level];
        if (slot.total <= 0) return ui.notifications.warn(`${caster.name} has no ${ARNEYAN.spellLevels[sys.level]}-level spell slots.`);
        if (slot.left <= 0) return ui.notifications.warn(`${caster.name}: no ${ARNEYAN.spellLevels[sys.level]}-level slots left.`);
        const cls = actor.items.get(caster.id);
        const used = Array.from({ length: 10 }, (_, i) => cls.system.slotsUsed?.[i] ?? 0);
        used[sys.level] += 1;
        await cls.update({ "system.slotsUsed": used });
      }
      dc = caster?.dc ?? actor.system.spellDC;
    } else if (actor?.type === "npc") {
      dc = actor.system.spellDC;
      // Innate spells: so many a day. Class spells: the monster's slots.
      const per = String(this.getFlag(SYS, "frequency") ?? "").match(/^(\d+)\/day/i);
      if (per) {
        const used = this.getFlag(SYS, "used") ?? 0;
        if (used >= Number(per[1])) return ui.notifications.warn(`${actor.name} has used ${this.name} ${per[1]} time${per[1] === "1" ? "" : "s"} today.`);
        await this.setFlag(SYS, "used", used + 1);
      } else if (sys.level > 0 && actor.system.casters?.[0] && !this.getFlag(SYS, "frequency")) {
        const slot = actor.system.casters[0].slots[sys.level];
        if (slot.total <= 0) return ui.notifications.warn(`${actor.name} has no ${ARNEYAN.spellLevels[sys.level]}-level slots.`);
        if (slot.left <= 0) return ui.notifications.warn(`${actor.name}: no ${ARNEYAN.spellLevels[sys.level]}-level slots left.`);
        const used = Array.from({ length: 10 }, (_, i) => actor.system.spellcasting.used?.[i] ?? 0);
        used[sys.level] += 1;
        await actor.update({ "system.spellcasting.used": used });
      }
    }
    const cl = caster?.classLevel ?? actor?.system.spellcasting?.level ?? actor?.system.level ?? 1;
    const self = await this._applySelf(cl);
    const lines = [];
    if (caster) lines.push(`<p class="arn-card-meta">Cast as ${esc(caster.name)} ${caster.classLevel}${sys.level > 0 ? ` · ${ARNEYAN.spellLevels[sys.level]}-level slot spent` : ""}</p>`);
    if (self.length) lines.push(`<p class="arn-card-meta">On ${esc(actor.name)}: ${self.map(e => esc(e.name)).join(", ")}</p>`);
    if (sys.concentration) lines.push(`<p class="arn-card-meta"><i class="fa-solid fa-brain"></i> Concentrating</p>`);
    const notes = actor?.mods?.notesFor("spell") ?? [];
    if (notes.length) lines.push(`<ul class="arn-notes">${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>`);
    lines.push(this._actionButtons({ dc, cl }));
    return this.toChat(lines.join(""));
  }

  /** Roll data for this item's damage: the actor's data plus @cl (caster or class level) and @mod. */
  damageRollData() {
    const actor = this.actor;
    const data = actor?.getRollData?.() ?? {};
    if (this.type === "spell" && actor?.type === "character") {
      const c = this.caster;
      data.cl = c?.classLevel ?? actor.system.level;
      data.mod = c?.mod ?? 0;
    } else if (actor?.type === "npc") {
      data.cl = actor.system.level;
    } else if (actor && ["ability", "feat"].includes(this.type)) {
      // A feature's damage that grows with its class level (Eldritch Blast: 1d6 at 1st up to 3d8 at 24th).
      data.cl = this.featureLevel;
    }
    return data;
  }

  /** The damage formula with @cl resolved, for buttons and tooltips. */
  damageFormulaLabel() {
    try {
      // "(min(@cl,10))d6" at 12th level reads "10d6".
      return resolveFormula(this.system.damage, this.damageRollData()).replace(/\s+/g, "");
    } catch {
      return this.system.damage;
    }
  }

  /** Roll this spell or ability's damage (or healing). */
  rollItemDamage({ hits = null, misses = [], crit = false, as = "" } = {}) {
    const actor = this.actor;
    // A cure's dice as damage after a touch attack: radiant to an undead, necrotic cast reversed (touch.mjs).
    const heal = this.system.damageType === "healing" && !as;
    const damageType = as === "undead" ? "radiant" : as === "reversed" ? "necrotic" : this.system.damageType;
    let terms = [];
    if (this.type === "spell" && actor && !heal) {
      terms = actor.mods?.damage("spell.damage", ...(this.system.level === 0 ? ["cantrip.damage"] : [])) ?? [];
    }
    // Healer and the like: +N HP per healing die.
    const perDie = heal ? (actor?.mods?.sum("heal.perdie") ?? 0) : 0;
    if (perDie) {
      const resolved = Roll.replaceFormulaData(this.system.damage, this.damageRollData());
      const dice = [...resolved.matchAll(/(\d*)d\d+/gi)].reduce((t, m) => t + (Number(m[1]) || 1), 0);
      if (dice) terms.push({ label: "Per healing die", value: `+${dice * perDie}` });
    }
    return damageRoll({
      actor, item: this, title: `${this.name}: ${heal ? "Healing" : as === "reversed" ? "Damage (reversed)" : as === "undead" ? "Damage to the undead" : "Damage"}`,
      formula: this.system.damage, damageType, terms, rollData: this.damageRollData(), hits, misses, crit,
      notes: heal ? [] : (actor?.mods?.notesFor("damage") ?? [])
    });
  }

  /** This feature's class level on its actor (Paladin 7 for Lay on Hands), else the character's level. */
  get featureLevel() {
    const actor = this.actor;
    const name = String(this.system.className ?? "").toLowerCase();
    if (!actor || actor.type !== "character" || !name) return actor?.system?.level ?? 1;
    const classNamed = n => actor.items.find(i => i.type === "class" && (i.name.toLowerCase() === n || i.name.toLowerCase().startsWith(`${n} `)));
    // A kit's feature carries the kit's name: its level is the kit's class level.
    const kit = actor.items.find(i => i.type === "kit" && i.name.toLowerCase() === name);
    const cls = classNamed(name) ?? (kit?.system?.className ? classNamed(String(kit.system.className).toLowerCase()) : null);
    return cls?.system?.levels ?? actor.system.level ?? 1;
  }

  /** The options open at this level. */
  get availableActivities() {
    const lvl = this.featureLevel;
    const open = (this.system.activities ?? []).filter(a => (a.minLevel ?? 0) <= lvl && (!a.maxLevel || lvl <= a.maxLevel));
    // Damage that steps up with level ("Spark Caster (1d6)", "(1d8)" at 5th): only the highest step reached.
    const base = a => `${a.kind}|${String(a.name).replace(/\s*\(\d*d\d+(?:\s*[+-]\s*\d+)?\)\s*$/i, "")}`;
    const best = new Map();
    for (const a of open) if (!best.has(base(a)) || (a.minLevel ?? 0) >= (best.get(base(a)).minLevel ?? 0)) best.set(base(a), a);
    return open.filter(a => best.get(base(a)) === a);
  }

  /** Spend an activity's cost from the feature's uses; false (with a warning) when there aren't enough. */
  async _spendFor(act) {
    const sys = this.system;
    const cost = Number(act.cost ?? 1);
    if (cost > 0 && sys.uses?.max > 0) {
      if (sys.uses.value < cost) { ui.notifications.warn(`${this.name} has no uses left.`); return false; }
      await this.update({ "system.uses.value": sys.uses.value - cost });
    }
    return true;
  }

  /** The "Apply ... to targets" buttons for effects this item puts on others (kept on an activity's card). */
  _applyButtons(cl) {
    return (this.system.applies ?? []).map((e, i) => (e.target === "self" ? "" : `<button type="button" class="arn-apply-effect" data-item-uuid="${this.uuid}" data-index="${i}" data-cl="${cl}"><i class="fa-solid fa-wand-sparkles"></i> Apply ${esc(e.name || this.name)} to targets</button>`)).join("");
  }

  /** A class feature, kit feature or feat that is a reaction (Riposte, Combat Reflexes): say so in chat. Nothing is tracked. */
  async _reacted(act) {
    if (!this.actor || !isReactionFeature(this, act)) return;
    const what = act?.name && act.name !== this.name ? `${this.name}: ${act.name}` : this.name;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="arn-card arn-report arn-reaction-note"><p><i class="fa-solid fa-bolt"></i> <strong>${esc(what)}</strong> is a reaction.</p></div>` }).catch(() => null);
  }

  /** The item's own effects on its user, once per use of an activity (Storm Form, Undying Reputation's Advantage). */
  async _selfForActivity(cl) {
    if (!(this.system.applies ?? []).some(e => e.target === "self")) return [];
    try { return await this._applySelf(cl, { fresh: true }); } catch (err) { console.warn("Arneyan | self effect", err); return []; }
  }

  /** Use one of a feature's activities: spend its use, then roll or post what it does. */
  async _useActivity(act, event) {
    const sys = this.system;
    const actor = this.actor;
    if (act.kind === "attacks") return this._useAttacks(act, event);
    if (!(await this._spendFor(act))) return null;
    await this._reacted(act);
    const cost = Number(act.cost ?? 1);
    const cl = this.featureLevel;
    const self = await this._selfForActivity(cl);
    const rollData = { ...(actor?.getRollData?.() ?? {}), cl };
    const title = `${this.name}: ${act.name}`;
    const left = cost > 0 && sys.uses?.max > 0 ? `${this.system.uses.value} of ${sys.uses.max} uses left` : act.per ? `Its own count (per ${act.per}): keep track on the sheet notes` : "";
    const onSelf = self.length ? `On ${actor.name}: ${self.map(e => e.name).join(", ")}` : "";
    const meta = [act.text ? `<p>${esc(act.text)}</p>` : "", left ? `<p class="arn-card-meta">${esc(left)}</p>` : "", onSelf ? `<p class="arn-card-meta">${esc(onSelf)}</p>` : ""].join("");
    if (act.removeConditions && actor?.isOwner) {
      const gone = actor.effects.filter(e => [...(e.statuses ?? [])].some(s => ARNEYAN.conditions[s] && !["dead", "concentrating"].includes(s)));
      if (gone.length) await actor.deleteEmbeddedDocuments("ActiveEffect", gone.map(e => e.id));
    }
    if (["heal", "temp", "damage"].includes(act.kind) && act.formula) {
      const heal = act.kind !== "damage";
      const notes = [act.text, left, onSelf, act.kind === "temp" ? "Temporary HP: use the Temp HP button." : "", act.target === "self" ? `On ${actor?.name ?? "yourself"}: select your token (no targets), then Apply.` : ""].filter(Boolean);
      return damageRoll({ actor, item: this, title, formula: act.formula, damageType: heal ? "healing" : (act.damageType || ""), rollData, notes });
    }
    if (act.kind === "check" && act.ability && actor?.rollAbility) {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card"><header class="arn-card-title"><img src="${esc(this.img)}" alt=""> <span>${esc(title)}</span></header>${meta}</div>` });
      const bonus = byLevel(act.bonus, cl, rollData);
      return actor.rollAbility(act.ability, event, bonus ? { bonus, label: this.name } : {});
    }
    // A formula posted to chat (Holy Campaign's troops; a roll only the GM sees for "gm").
    if (act.kind === "roll" && act.formula) {
      const roll = await new Roll(resolveFormula(act.formula, rollData)).evaluate();
      return roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<div class="arn-card"><header class="arn-card-title"><img src="${esc(this.img)}" alt=""> <span>${esc(title)}</span></header>${meta}</div>` },
        { rollMode: act.target === "gm" ? "blindroll" : game.settings.get("core", "rollMode") });
    }
    let buttons = "";
    if (act.kind === "save" && act.save) {
      // A DC of its own where the text gives one (Intimidating Presence: 10 + half your level + Charisma), else the Class Save DC.
      const own = act.formula ? Math.round(byLevel(act.formula, cl, rollData)) : 0;
      const dc = own || sys.dc || (actor?.type === "character" ? actor.system.classDC : actor?.system?.spellDC) || "";
      buttons = `<button type="button" class="arn-save-btn" data-save="${esc(act.save)}" data-dc="${dc}" data-source="${esc(this.name)}"><i class="fa-solid fa-shield-halved"></i> ${ARNEYAN.saveTypes[act.save] ?? act.save} save${dc ? ` DC ${dc}` : ""}</button>`;
    }
    // A reminder with a number worked out for you (Parry: half your Level, minimum 1, + Dexterity).
    const value = act.kind === "note" && act.formula ? (/d\d/i.test(act.formula) ? resolveFormula(act.formula, rollData) : String(byLevel(act.formula, cl, rollData))) : "";
    const shown = value ? `<p class="arn-card-meta"><strong>${esc(value)}</strong></p>` : "";
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card"><header class="arn-card-title"><img src="${esc(this.img)}" alt=""> <span>${esc(title)}</span></header>${meta}${shown}${buttons}${this._applyButtons(cl)}</div>`, flags: { arneyan: { itemUuid: this.uuid } } });
  }

  /**
   * Several weapon attacks in one go (Twin Nock, Combat Dominance, Extra Attack): pick the weapon (and, with several
   * targets, who each attack goes at), then roll each through the usual attack. The count, which attacks have
   * Disadvantage and until what level, and bonus damage on each come from the activity.
   */
  async _useAttacks(act, event) {
    const actor = this.actor;
    if (!actor?.rollAttack) return null;
    const lvl = this.featureLevel;
    const rollData = { ...(actor.getRollData?.() ?? {}), cl: lvl };
    const n = Math.max(1, Math.floor(byLevel(act.count || "1", lvl, rollData)));
    const kindLabel = { melee: "melee weapon", ranged: "ranged weapon", "": "weapon" }[act.weapons ?? ""] ?? `weapon that fires ${act.weapons}s`;
    const weapons = actor.items.filter(i => i.type === "weapon" && weaponFits(i, act.weapons))
      .sort((x, y) => Number(!!y.system.equipped) - Number(!!x.system.equipped));
    if (!weapons.length) { ui.notifications.warn(`${this.name}: ${actor.name} has no ${kindLabel}.`); return null; }
    const targets = targetActors();
    let weapon = weapons[0];
    let aim = Array.from({ length: n }, (_, i) => (targets.length > 1 ? [targets[i % targets.length]] : targets));
    if (weapons.length > 1 || targets.length > 1) {
      const opt = (list, sel, f) => list.map((x, i) => `<option value="${i}" ${i === sel ? "selected" : ""}>${esc(f(x))}</option>`).join("");
      const content = `<p>${esc(this.name)}: ${n} attack${n === 1 ? "" : "s"}.</p>
        ${weapons.length > 1 ? `<label class="arn-field">Weapon <select name="weapon">${opt(weapons, 0, w => w.name)}</select></label>` : ""}
        ${targets.length > 1 ? Array.from({ length: n }, (_, i) => `<label class="arn-field">Attack ${i + 1} <select name="t${i}">${opt(targets, i % targets.length, t => t.name)}</select></label>`).join("") : ""}`;
      const pick = await DialogV2.wait({ window: { title: this.name, icon: "fa-solid fa-crosshairs" }, classes: ["arneyan"], position: { width: 380 }, content,
        buttons: [{ action: "ok", label: "Attack", default: true, callback: (ev, btn) => {
          const f = btn.form;
          return { w: Number(f.querySelector("select[name=weapon]")?.value ?? 0), t: Array.from({ length: n }, (_, i) => Number(f.querySelector(`select[name=t${i}]`)?.value ?? (i % Math.max(1, targets.length)))) };
        } }, { action: "cancel", label: "Cancel" }], rejectClose: false });
      if (!pick || typeof pick !== "object") return null;
      weapon = weapons[pick.w] ?? weapons[0];
      if (targets.length > 1) aim = pick.t.map(i => [targets[i] ?? targets[0]]);
    }
    // Enough uses for it? Spent only once an attack has actually rolled.
    const cost = Number(act.cost ?? 1);
    if (cost > 0 && this.system.uses?.max > 0 && this.system.uses.value < cost) { ui.notifications.warn(`${this.name} has no uses left.`); return null; }
    const notes = [];
    if (act.text) notes.push(`${this.name}: ${act.text}`);
    if (cost > 0 && this.system.uses?.max > 0) notes.push(`${this.system.uses.value - cost} of ${this.system.uses.max} uses left`);
    // Combat Dominance: only against creatures of Level up to half yours.
    if (act.targetLevel === "half") {
      const cap = Math.floor((actor.system.level ?? lvl) / 2);
      const over = targets.filter(t => (Number(t.actor.system?.level) || 0) > cap);
      if (over.length) {
        const msg = `${this.name}: ${over.map(t => t.name).join(", ")} ${over.length === 1 ? "is" : "are"} above Level ${cap} (half yours), so it doesn't apply.`;
        ui.notifications.warn(msg);
        notes.push(msg);
      }
    }
    const disOn = act.disadvantage && !(act.disUntil && lvl >= act.disUntil);
    const per = byLevel(act.damageBonus, lvl, rollData);
    const bonus = per ? { value: per, label: this.name, noStack: act.noStack || "" } : null;
    const out = [];
    for (let i = 0; i < n; i++) {
      const dis = disOn && (act.disadvantage === "all" || (act.disadvantage === "rest" && i > 0));
      const msg = await actor.rollAttack(weapon, event, {
        adv: dis ? { values: [-1], adv: [], dis: [`${this.name}: attack ${i + 1}`] } : null,
        targets: aim[i], label: `${act.name || this.name} ${i + 1} of ${n}`, notes: out.length ? [] : notes, bonus,
        noDamage: act.noDamage ? (act.text || act.name || this.name).replace(/^On a hit,?\s*/i, "").replace(/\s*instead of dealing damage\.?$/i, "").replace(/\.$/, "") : ""
      });
      if (msg === null || msg === undefined) {
        // Out of ammunition, or a gun that jammed or needs reloading: no more attacks with it. A target behind Full
        // Cover only blocks its own attack: carry on with the rest.
        if ((weapon.system.ammoType && actor.type === "character" && !ammoFor(actor, weapon)) || firearmOf(weapon)) break;
        continue;
      }
      // The first attack that rolls spends the use (and notes a reaction feature in chat), once.
      if (!out.length) {
        if (cost > 0 && this.system.uses?.max > 0) await this.update({ "system.uses.value": Math.max(0, this.system.uses.value - cost) });
        await this._reacted(act);
        await this._selfForActivity(lvl);
      }
      out.push(msg);
    }
    return out;
  }

  async _useAbility(event) {
    const sys = this.system;
    const actor = this.actor;
    // Wild Shape: pick the beast to become (transform.mjs).
    if (this.name === "Wild Shape" && actor && ["character", "npc"].includes(actor.type)) {
      const { wildShape } = await import("./transform.mjs");
      return wildShape(this, event);
    }
    // Features with options: one goes straight through, several ask which.
    const acts = this.availableActivities;
    if (acts.length && !sys.toggle) {
      let act = acts[0];
      if (acts.length > 1) {
        const usesLeft = sys.uses.max > 0 ? sys.uses.value : null;
        const content = `<p>${esc(this.name)}${usesLeft !== null ? ` (${usesLeft} of ${sys.uses.max} uses left)` : ""}: pick one.</p>
          <div class="arn-acts">${acts.map((a, i) => `<label class="arn-act"><input type="radio" name="act" value="${i}" ${i === 0 ? "checked" : ""} ${(a.cost ?? 1) > 0 && usesLeft !== null && usesLeft < (a.cost ?? 1) ? "disabled" : ""}>
            <strong>${esc(a.name)}</strong>${(a.cost ?? 1) === 0 ? ` <em>(${a.per ? `per ${esc(a.per)}` : "no use spent"})</em>` : ""}<br><small>${esc(a.text)}</small></label>`).join("")}</div>`;
        const pick = await DialogV2.wait({ window: { title: this.name, icon: "fa-solid fa-hand-sparkles" }, classes: ["arneyan"], position: { width: 420 }, content,
          buttons: [{ action: "ok", label: "Use", default: true, callback: (ev, btn) => Number(btn.form.querySelector("input[name=act]:checked")?.value ?? -1) }, { action: "cancel", label: "Cancel" }],
          rejectClose: false });
        if (typeof pick !== "number" || pick < 0) return;
        act = acts[pick];
      }
      return this._useActivity(act, event);
    }
    // Switchable abilities (Rage, a stance): using one flips it.
    if (sys.toggle) {
      const on = !sys.active;
      if (on && sys.uses.max > 0) {
        if (sys.uses.value <= 0) return ui.notifications.warn(`${this.name} has no uses left.`);
        await this.update({ "system.uses.value": sys.uses.value - 1, "system.active": true });
      } else {
        await this.update({ "system.active": on });
      }
      if (on) await this._reacted();
      return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card"><header class="arn-card-title"><img src="${esc(this.img)}" alt=""> <span>${esc(this.name)}</span></header><p>${on ? "Switched on" : "Switched off"}.</p></div>` });
    }
    if (sys.uses.max > 0) {
      if (sys.uses.value <= 0) return ui.notifications.warn(`${this.name} has no uses left.`);
      await this.update({ "system.uses.value": sys.uses.value - 1 });
    }
    await this._reacted();
    let dc = sys.dc;
    if (!dc && sys.save && actor?.type === "character") dc = actor.system.classDC;
    if (!dc && sys.save && actor?.type === "npc") dc = actor.system.spellDC;
    // A feature's effects scale with its class level (Stun Attack: 1d4 rounds from Monk 10th).
    const cl = actor?.type === "character" ? this.featureLevel : (actor?.system.level ?? 1);
    const self = await this._applySelf(cl);
    const lines = [];
    if (sys.uses.max > 0) lines.push(`<p class="arn-card-meta">${sys.uses.value - 1} of ${sys.uses.max} uses left</p>`);
    if (self.length) lines.push(`<p class="arn-card-meta">On ${esc(actor.name)}: ${self.map(e => esc(e.name)).join(", ")}</p>`);
    lines.push(this._actionButtons({ dc, cl }));
    return this.toChat(lines.join(""));
  }
}

/** Initiative: d20 + Dex + rules, with Advantage or Disadvantage from rules (Exhaustion 1 and so on). */
export class ArneyanCombatant extends Combatant {
  _getInitiativeFormula() {
    const a = this.actor;
    if (!a?.system?.mods) return super._getInitiativeFormula();
    const src = a.system.mods.adv("adv.init");
    const mode = modeFromEvent(null, src.values);
    const die = mode > 0 ? "2d20kh" : mode < 0 ? "2d20kl" : "1d20";
    const init = a.system.attributes.init ?? 0;
    return `${die} + ${init}`;
  }
}

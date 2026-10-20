import { areaButton } from "./areas.mjs";
import { ARNEYAN } from "./config.mjs";
import { d20Roll, luckCheck, damageRoll, modeFromEvent, resolveFormula } from "./rolls.mjs";
import { setClassLevel, syncKitFeatures, removeGrants, firstLevelSetup, ancestrySetup } from "./progression.mjs";
import { effectDataFor, applyEffectTo, startConcentration, endConcentration, statusesOf, toggleCondition } from "./effects.mjs";
import { useEquipment, spendAmmo, rechargeAtDawn } from "./gear.mjs";
import { attackSituation, targetAC, combatUse, isSubdualWeapon, subdualUpdate, syncSubdual } from "./combat.mjs";

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

export class ArneyanActor extends Actor {

  /** A monster's "½" or "¼" no longer applies once the GM types a new Level. */
  async _preUpdate(changes, options, user) {
    if ((await super._preUpdate(changes, options, user)) === false) return false;
    options.arneyanPrevHp ??= {};
    options.arneyanPrevHp[this.id] = this.system.attributes?.hp?.value;
    options.arneyanPrevTemp ??= {};
    options.arneyanPrevTemp[this.id] = this.system.attributes?.hp?.temp ?? 0;
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
  rollAbility(key, event) {
    const m = this.mods;
    const parts = [{ label: ARNEYAN.abilityAbbr[key], value: this.system.abilities[key].mod }, ...(m?.parts("check", `check.${key}`) ?? [])];
    const { mode, why } = advFrom(event, m?.adv("adv.check", `adv.check.${key}`) ?? NONE);
    const fail = m?.has(`fail.check.${key}`) ? m.sources(`fail.check.${key}`).join(", ") : "";
    return d20Roll({ actor: this, kind: "check", mode, why, title: `${ARNEYAN.abilities[key]} Check`, parts, notes: m?.notesFor("check") ?? [], autoFail: fail });
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
      return d20Roll({ actor: this, kind: "skill", mode, why, title: "Untrained Skill Check", parts: [...(m?.parts("check", "skill") ?? [])], notes: m?.notesFor("check", "skill") ?? [] });
    }
    const ab = item.system.ability;
    const mod = this.system.abilities[ab].mod;
    const master = item.system.tier === "master";
    const parts = [{ label: ARNEYAN.abilityAbbr[ab], value: mod <= 0 ? 1 : mod }, ...(m?.parts("check", `check.${ab}`, "skill") ?? [])];
    const masterSrc = master ? { values: [1], adv: ["Master"], dis: [] } : NONE;
    const { mode, why } = advFrom(event, masterSrc, m?.adv("adv.check", `adv.check.${ab}`, "adv.skill") ?? NONE);
    const fail = m?.has(`fail.check.${ab}`) ? m.sources(`fail.check.${ab}`).join(", ") : "";
    return d20Roll({
      actor: this, kind: "skill", mode, why, title: `${item.name} (${master ? "Master" : "Trained"})`, parts,
      notes: m?.notesFor("check", "skill") ?? [], autoFail: fail
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
    parts.push({ label: "Magic", value: item.system.magic });
    parts.push({ label: "Weapon bonus", value: item.system.attackBonus });
    return parts;
  }

  /** Total attack bonus for a weapon (shown on the sheet and used for the roll). */
  attackBonus(item) {
    return this.attackParts(item).reduce((t, p) => t + (Number(p.value) || 0), 0);
  }

  /** Damage terms from rules for this weapon. */
  damageTerms(item) {
    const ranged = !!item.system.ranged;
    return this.mods?.damage("damage", ranged ? "damage.ranged" : "damage.melee") ?? [];
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

  /** Attack: d20 + attribute modifier + BtH (+ magic and rules), against each target's AC. Bows and the like spend ammunition. */
  async rollAttack(item, event, { offhand = false } = {}) {
    const targets = targetActors();
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
    const notes = [...(m?.notesFor("attack") ?? [])];
    if (targets.length === 1) {
      const tm = targets[0].actor.system.mods;
      if (tm) {
        const a = tm.adv("adv.against", ranged ? "adv.against.ranged" : "adv.against.melee");
        against = { values: a.values, adv: a.adv.map(l => `${targets[0].name}: ${l}`), dis: a.dis.map(l => `${targets[0].name}: ${l}`) };
        if (!ranged && tm.has("crit.against.close")) notes.push(`${targets[0].name} (${tm.sources("crit.against.close").join(", ")}): a melee hit from within 5ft is a critical hit`);
      }
    }
    // Advantage on the first attack each round (Bless, Favoured Enemy and the like).
    let first = NONE;
    const firstSrc = m?.adv("adv.attack.first") ?? NONE;
    if (firstSrc.values.length) {
      const combat = game.combat;
      const stamp = combat?.started ? `${combat.id}.${combat.round}` : null;
      const last = this.getFlag?.(SYS, "lastAttack");
      if (!stamp || last !== stamp) first = { values: firstSrc.values, adv: firstSrc.adv.map(l => `${l} (first attack)`), dis: firstSrc.dis.map(l => `${l} (first attack)`) };
      if (stamp && this.isOwner) this.setFlag(SYS, "lastAttack", stamp);
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
    const { mode, why } = advFrom(event, own, against, first, heavy, far, ...sit.adv);
    notes.push(...sit.notes);
    if (this.system.noAct) notes.unshift(`${this.name} cannot take actions right now.`);
    return sit.after(await d20Roll({
      actor: this, kind: "attack", mode, why, critAt: this.system.critRange ?? 20,
      targets: targets.map(t => ({ name: t.name, ac: targetAC(t.actor, { ranged }), uuid: t.actor.uuid })),
      title: `${item.name}: ${offhand ? "Off-hand " : ""}Attack${ammo ? ` (${ammo.name})` : ""}`, parts: [...this.attackParts(item), ...(ammoPlus ? [{ label: ammo.name, value: ammoPlus }] : [])], notes,
      extra: { itemId: item.id, actorUuid: this.uuid, ammoName, ...sit.extra },
      // A natural 1 is a miss: no damage buttons. A critical leads with critical damage; either way both are there.
      // A gun that misfires has none either (combat.mjs).
      footer: sit.footer(({ natural, crit }) => {
        if (natural === 1 && !crit) return "";
        const normal = `<button type="button" class="arn-damage" data-item-id="${item.id}" data-crit="0"><i class="fa-solid fa-burst"></i> ${crit ? "Normal damage" : "Roll damage"}</button>`;
        const critical = `<button type="button" class="arn-damage ${crit ? "" : "ghost"}" data-item-id="${item.id}" data-crit="1"><i class="fa-solid fa-star"></i> Critical${crit ? " damage" : ""}</button>`;
        return `<div class="arn-dmg-buttons">${crit ? critical + normal : normal + critical}</div>`;
      })
    }));
  }

  /** Damage: weapon dice + the same attribute modifier as the attack (+ magic and rules). */
  rollDamage(item, { crit = false, include = [], ammo = "", hits = null, misses = [], offhand = false } = {}) {
    const sys = item.system;
    const ammoPlus = Number(String(ammo).match(/\+(\d)/)?.[1] ?? 0);
    // Extra damage with a condition ("against undead", Versatile two-handed) joins the roll only when asked for.
    // Extra damage tied to the weapon's mode (a Flame Tongue's fire) counts on every hit while it's on, and not at all while it's off.
    const extras = [...(sys.bonusDamage ?? []).map((b, i) => ({ ...b, key: `b${i}` })).filter(b => !b.mode || sys.active).map(b => (b.mode ? { ...b, when: "" } : b)), ...this._versatileDie(item)]
      .map(x => (include.includes(x.key) ? { ...x, when: "", label: x.when ? `${x.formula} ${x.type || sys.damageType} (${x.when})` : "" } : x));
    let mod = sys.magic + ammoPlus;
    // An off-hand weapon adds no attribute modifier to damage (Codex, Dual Wielding).
    if (this.type === "character" && !offhand) mod += this.system.abilities[this._weaponAbility(item)].mod;
    return damageRoll({ ammo, offhand, subdual: isSubdualWeapon(item),
      actor: this, item, title: `${item.name}: ${offhand ? "Off-hand " : ""}${crit ? "Critical Damage" : "Damage"}`, formula: sys.damage, mod, crit, damageType: sys.damageType,
      terms: this.damageTerms(item), notes: this.mods?.notesFor("damage") ?? [], extras, include, hits, misses
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
      await this.update({ "system.attributes.hp.value": value }, { arneyanDowned: true });
      await this._syncDowned(before);
      return { text: `${this.name} heals ${value - before} HP (now ${value}/${maxHp})`, line: `${this.name} is healed for ${value - before} HP` };
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
      if (crossed) for (const c of game.combat?.combatants?.filter(c => c.actor === this || (c.actorId === this.id && !c.token?.actorLink && c.token?.actor === this)) ?? []) {
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
    if (where === "haven") {
      heal = haven;
      if (!heal) {
        const dice = this.items.filter(i => i.type === "class").map(c => Number(c.system.hitDie.slice(1)));
        const largest = Math.max(4, ...dice);
        const r = await new Roll(`1d${largest}`).evaluate();
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
    const hadExhaustion = this.system.attributes.exhaustion > 0;
    updates["system.attributes.exhaustion"] = Math.max(0, this.system.attributes.exhaustion - 1);
    await this.update(updates);
    // Spell slots and daily abilities.
    const items = [];
    for (const c of this.items.filter(i => i.type === "class")) items.push({ _id: c.id, "system.slotsUsed": Array(10).fill(0) });
    for (const a of this.items.filter(i => i.type === "ability" && ["day", "rest", "encounter"].includes(i.system.uses.per))) {
      items.push({ _id: a.id, "system.uses.value": a.system.uses.max });
    }
    if (items.length) await this.updateEmbeddedDocuments("Item", items);
    // Dawn: staffs regain charges (Catalogue, magic item rules).
    const recharged = await rechargeAtDawn(this);
    const label = { haven: "in a safe haven", shelter: "in camp with shelter", open: "in the open" }[where];
    const line = `${this.name}: +${heal} HP${hadExhaustion ? ", one Exhaustion level off" : ""}${recharged.length ? `; ${recharged.join("; ")}` : ""}.`;
    if (quiet) return line;
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="arn-card"><header class="arn-card-title">${this.name} rests ${label}</header>
        <p>Heals <strong>${heal} HP</strong>${note}. Spell slots and daily abilities restored, temporary HP gone${hadExhaustion ? ", one level of Exhaustion removed" : ""}. Luck does not recover with rest.</p>${recharged.length ? `<p>At dawn: ${recharged.map(esc).join("; ")}.</p>` : ""}</div>`
    });
  }

  /** Long rest shortcut kept for macros. */
  longRest() {
    return this.rest();
  }
}

export class ArneyanItem extends Item {

  /** Unidentified gear: players see a plain name and description until the GM reveals it (PF2e's mystified items). */
  prepareDerivedData() {
    super.prepareDerivedData();
    const s = this.system;
    if (s?.identified === false && game.user && !game.user.isGM) {
      this.name = s.unidentifiedName || `Unidentified ${{ weapon: "weapon", armour: "armour", equipment: "item" }[this.type] ?? "item"}`;
      s.description = s.unidentifiedDescription || "<p>You haven't worked out what this is yet. Identify reveals one property per casting.</p>";
    }
  }

  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    // A lit torch handed to someone else arrives unlit.
    if (this.system?.light?.lit && !options.arneyanGrant) this.updateSource({ "system.light.lit": false, "system.light.litAt": 0 });
    const actor = this.parent;
    if (!(actor instanceof Actor) || actor.type !== "character") return;
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
      if (!options.arneyanSkipSetup) await ancestrySetup(actor, this);
    }
  }

  _onDelete(options, userId) {
    super._onDelete(options, userId);
    const actor = this.parent;
    if (userId !== game.user.id || !(actor instanceof Actor) || options.arneyanGrant) return;
    if (this.type === "class" || this.type === "kit" || this.type === "ancestry") removeGrants(actor, this);
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
    if (sys.save) {
      out.push(`<button type="button" class="arn-save-btn" data-save="${sys.save}" data-dc="${dc ?? ""}" data-source="${esc(this.name)}"><i class="fa-solid fa-shield-halved"></i> ${ARNEYAN.saveTypes[sys.save]} save${dc ? ` DC ${dc}` : ""}</button>`);
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

  /** Put this item's self effects on its owner; start concentration if needed. */
  async _applySelf(cl) {
    const actor = this.actor;
    if (!actor) return [];
    const created = [];
    for (const e of (this.system.applies ?? []).filter(x => x.target === "self")) {
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
  rollItemDamage() {
    const actor = this.actor;
    const heal = this.system.damageType === "healing";
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
      actor, item: this, title: `${this.name}: ${heal ? "Healing" : "Damage"}`,
      formula: this.system.damage, damageType: this.system.damageType, terms, rollData: this.damageRollData(),
      notes: heal ? [] : (actor?.mods?.notesFor("damage") ?? [])
    });
  }

  /** This feature's class level on its actor (Paladin 7 for Lay on Hands), else the character's level. */
  get featureLevel() {
    const actor = this.actor;
    const name = String(this.system.className ?? "").toLowerCase();
    if (!actor || actor.type !== "character" || !name) return actor?.system?.level ?? 1;
    const cls = actor.items.find(i => i.type === "class" && (i.name.toLowerCase() === name || i.name.toLowerCase().startsWith(`${name} `)));
    return cls?.system?.levels ?? actor.system.level ?? 1;
  }

  /** The options open at this level. */
  get availableActivities() {
    const lvl = this.featureLevel;
    const open = (this.system.activities ?? []).filter(a => (a.minLevel ?? 0) <= lvl);
    // Damage that steps up with level ("Spark Caster (1d6)", "(1d8)" at 5th): only the highest step reached.
    const base = a => `${a.kind}|${String(a.name).replace(/\s*\(\d*d\d+(?:\s*[+-]\s*\d+)?\)\s*$/i, "")}`;
    const best = new Map();
    for (const a of open) if (!best.has(base(a)) || (a.minLevel ?? 0) >= (best.get(base(a)).minLevel ?? 0)) best.set(base(a), a);
    return open.filter(a => best.get(base(a)) === a);
  }

  /** Use one of a feature's activities: spend its use, then roll or post what it does. */
  async _useActivity(act) {
    const sys = this.system;
    const actor = this.actor;
    const cost = Number(act.cost ?? 1);
    if (cost > 0 && sys.uses.max > 0) {
      if (sys.uses.value < cost) return ui.notifications.warn(`${this.name} has no uses left.`);
      await this.update({ "system.uses.value": sys.uses.value - cost });
    }
    const cl = this.featureLevel;
    const rollData = { ...(actor?.getRollData?.() ?? {}), cl };
    const title = `${this.name}: ${act.name}`;
    const left = cost > 0 && sys.uses.max > 0 ? `${this.system.uses.value} of ${sys.uses.max} uses left` : act.per ? `Its own count (per ${act.per}): keep track on the sheet notes` : "";
    const meta = [act.text ? `<p>${esc(act.text)}</p>` : "", left ? `<p class="arn-card-meta">${esc(left)}</p>` : ""].join("");
    if (act.removeConditions && actor?.isOwner) {
      const gone = actor.effects.filter(e => [...(e.statuses ?? [])].some(s => ARNEYAN.conditions[s] && !["dead", "concentrating"].includes(s)));
      if (gone.length) await actor.deleteEmbeddedDocuments("ActiveEffect", gone.map(e => e.id));
    }
    if (["heal", "temp", "damage"].includes(act.kind) && act.formula) {
      const heal = act.kind !== "damage";
      const notes = [act.text, left, act.kind === "temp" ? "Temporary HP: use the Temp HP button." : "", act.target === "self" ? `On ${actor?.name ?? "yourself"}: select your token (no targets), then Apply.` : ""].filter(Boolean);
      return damageRoll({ actor, item: this, title, formula: act.formula, damageType: heal ? "healing" : (act.damageType || ""), rollData, notes });
    }
    if (act.kind === "check" && act.ability && actor?.rollAbility) {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card"><header class="arn-card-title"><img src="${esc(this.img)}" alt=""> <span>${esc(title)}</span></header>${meta}</div>` });
      return actor.rollAbility(act.ability);
    }
    let buttons = "";
    if (act.kind === "save" && act.save) {
      const dc = sys.dc || (actor?.type === "character" ? actor.system.classDC : actor?.system?.spellDC) || "";
      buttons = `<button type="button" class="arn-save-btn" data-save="${esc(act.save)}" data-dc="${dc}" data-source="${esc(this.name)}"><i class="fa-solid fa-shield-halved"></i> ${ARNEYAN.saveTypes[act.save] ?? act.save} save${dc ? ` DC ${dc}` : ""}</button>`;
    }
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card"><header class="arn-card-title"><img src="${esc(this.img)}" alt=""> <span>${esc(title)}</span></header>${meta}${buttons}</div>`, flags: { arneyan: { itemUuid: this.uuid } } });
  }

  async _useAbility() {
    const sys = this.system;
    const actor = this.actor;
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
      return this._useActivity(act);
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
      return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card"><header class="arn-card-title"><img src="${esc(this.img)}" alt=""> <span>${esc(this.name)}</span></header><p>${on ? "Switched on" : "Switched off"}.</p></div>` });
    }
    if (sys.uses.max > 0) {
      if (sys.uses.value <= 0) return ui.notifications.warn(`${this.name} has no uses left.`);
      await this.update({ "system.uses.value": sys.uses.value - 1 });
    }
    let dc = sys.dc;
    if (!dc && sys.save && actor?.type === "character") dc = actor.system.classDC;
    if (!dc && sys.save && actor?.type === "npc") dc = actor.system.spellDC;
    const cl = actor?.system.level ?? 1;
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

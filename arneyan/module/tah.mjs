/**
 * Token Action HUD (optional module): the Arneyan system adapter, registered from the system itself.
 *
 * Token Action HUD Core normally takes a separate system module. It only needs an object with
 * `api.SystemManager` passed to its "tokenActionHudSystemReady" hook, so the system answers its
 * "tokenActionHudCoreApiReady" hook directly. Without the module these hooks never fire.
 *
 * Groups: attacks, manoeuvres, spells (by level), abilities with uses, saves, attribute checks, skills,
 * conditions, and utility (initiative, Luck, rest). Clicking uses the same code as the character sheet;
 * right-click opens the item instead.
 */
import { ARNEYAN } from "./config.mjs";

const SYS = "arneyan";
const REQUIRED_CORE_MODULE_VERSION = "2";
const signed = n => (Number(n) >= 0 ? `+${Number(n)}` : `${Number(n)}`);

/** HUD groups (id: name). Spell levels are cantrips, then spells-1 to spells-9. */
export const TAH_GROUPS = {
  attacks: "Attacks", manoeuvres: "Manoeuvres",
  cantrips: "Cantrips", ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`spells-${i + 1}`, `${ARNEYAN.spellLevels[i + 1]} Level`])),
  abilities: "Abilities", saves: "Saves", checks: "Attribute Checks", skills: "Skills",
  conditions: "Conditions", combat: "Combat", token: "Token", utility: "Utility"
};

/** The default layout: categories and the groups under each. */
export function tahDefaults() {
  const g = id => ({ id, name: TAH_GROUPS[id], listName: `Group: ${TAH_GROUPS[id]}`, type: "system" });
  const cat = (id, name, groups) => ({ nestId: id, id, name, groups: groups.map(x => ({ ...g(x), nestId: `${id}_${x}` })) });
  return {
    layout: [
      cat("attacks", "Attacks", ["attacks", "manoeuvres"]),
      cat("spells", "Spells", ["cantrips", ...Array.from({ length: 9 }, (_, i) => `spells-${i + 1}`)]),
      cat("abilities", "Abilities", ["abilities"]),
      cat("rolls", "Saves & Checks", ["saves", "checks", "skills"]),
      cat("conditions", "Conditions", ["conditions"]),
      cat("utility", "Utility", ["combat", "token", "utility"])
    ],
    groups: Object.keys(TAH_GROUPS).map(g)
  };
}

const action = (id, name, actionType, actionId, { prefix = "", ...extra } = {}) => {
  for (const k of Object.keys(extra)) if (extra[k] === undefined) delete extra[k];
  return { id, name, listName: `${prefix}${name}`, system: { actionType, actionId }, ...extra };
};
const fa = icon => `<i class="fa-solid fa-${icon}"></i>`;

/** Something the sheet treats as usable in a fight (Abilities & Actions on the sheet). */
const usable = i => (i.system.uses?.max > 0) || !!i.system.save || !!i.system.damage || !!i.system.toggle || (i.system.applies?.length > 0) || (i.system.activities?.length > 0);

/**
 * The HUD's actions for an actor (or for several selected tokens, when `actor` is null), by group id.
 * `statusEffects`: CONFIG.statusEffects. `manoeuvres`: the Actions & Manoeuvres compendium ([{ uuid, name, img }]).
 */
export function arneyanHudActions(actor, { statusEffects = [], manoeuvres = [] } = {}) {
  const out = Object.fromEntries(Object.keys(TAH_GROUPS).map(k => [k, []]));
  const items = actor ? [...(actor.items ?? [])] : [];
  const byName = (a, b) => a.name.localeCompare(b.name);
  const isChar = actor?.type === "character";

  // Saves and attribute checks (also for several tokens at once).
  for (const [k, cfg] of Object.entries(ARNEYAN.saves)) {
    const v = !actor ? null : isChar ? actor.system.saves?.[k]?.value : actor.system.saveList?.find(s => s.key === k)?.total;
    out.saves.push(action(`save-${k}`, cfg.label, "save", k, { prefix: "Save: ", info1: v == null ? undefined : { text: signed(v), title: `${cfg.label} save ${signed(v)}` } }));
  }
  for (const [k, label] of Object.entries(ARNEYAN.abilities)) {
    const v = actor?.system.abilities?.[k]?.mod;
    out.checks.push(action(`check-${k}`, label, "check", k, { prefix: "Check: ", info1: v == null ? undefined : { text: signed(v), title: `${label} check ${signed(v)}` } }));
  }
  out.combat.push(action("utility-initiative", "Roll Initiative", "utility", "initiative", { icon1: fa("dice-d20") }));

  // Conditions: lit up when the token has them.
  const has = id => !!actor && ((actor.statuses?.has?.(id)) || [...(actor.effects ?? [])].some(e => e.statuses?.has?.(id) || e.statuses?.includes?.(id)));
  for (const s of statusEffects.filter(s => s?.id && ARNEYAN.conditions?.[s.id])) {
    out.conditions.push(action(`condition-${s.id}`, s.name ?? ARNEYAN.conditions[s.id].name, "condition", s.id,
      { prefix: "Condition: ", img: s.img, cssClass: `toggle${has(s.id) ? " active" : ""}`, tooltip: ARNEYAN.conditions[s.id].text }));
  }
  if (!actor) return out;

  // Attacks: a character's weapons in hand (all of them if none is), a monster's every weapon.
  const weapons = items.filter(i => i.type === "weapon" && (i.system.quantity ?? 1) > 0).sort(byName);
  const ready = isChar && weapons.some(w => w.system.equipped) ? weapons.filter(w => w.system.equipped) : weapons;
  for (const w of ready) {
    let bonus = null;
    try { bonus = actor.attackBonus?.(w); } catch { bonus = null; }
    out.attacks.push(action(`item-${w.id}`, w.name, "item", w.id, { prefix: "Attack: ", img: w.img, info1: Number.isFinite(bonus) ? { text: signed(bonus), title: "Attack bonus" } : undefined }));
  }

  // Spells by level: a character's prepared spells and cantrips (everything, if none is marked prepared).
  const spells = items.filter(i => i.type === "spell").sort(byName);
  const anyPrepared = spells.some(s => s.system.prepared && s.system.level > 0);
  for (const s of spells) {
    const lvl = Number(s.system.level) || 0;
    if (isChar && lvl > 0 && anyPrepared && !s.system.prepared) continue;
    const slot = lvl > 0 ? s.caster?.slots?.[lvl] : null;
    out[lvl === 0 ? "cantrips" : `spells-${lvl}`].push(action(`item-${s.id}`, s.name, "item", s.id, { prefix: "Spell: ", img: s.img,
      info1: slot && slot.total > 0 ? { text: `${slot.left}/${slot.total}`, title: "Slots left at this level" } : undefined }));
  }

  // Abilities with uses or something to roll; switches light up while on. Manoeuvres apart.
  const abilities = items.filter(i => (i.type === "ability" && i.system.kind !== "action" && usable(i)) || (i.type === "feat" && usable(i))).sort(byName);
  for (const a of abilities) {
    const u = a.system.uses;
    out.abilities.push(action(`item-${a.id}`, a.name, "item", a.id, { prefix: "Ability: ", img: a.img,
      cssClass: a.system.toggle ? `toggle${a.system.active ? " active" : ""}` : undefined,
      info1: u?.max > 0 ? { text: `${u.value}/${u.max}`, title: `Uses per ${u.per || "day"}` } : undefined }));
  }

  // Manoeuvres: the ones on the sheet, then the rest of the compendium's.
  const own = items.filter(i => i.type === "ability" && i.system.kind === "action").sort(byName);
  const ownNames = new Set(own.map(i => i.name.toLowerCase()));
  for (const m of own) out.manoeuvres.push(action(`item-${m.id}`, m.name, "item", m.id, { prefix: "Manoeuvre: ", img: m.img }));
  for (const m of [...manoeuvres].sort(byName)) {
    if (ownNames.has(String(m.name).toLowerCase())) continue;
    out.manoeuvres.push(action(`manoeuvre-${m.uuid}`, m.name, "manoeuvre", m.uuid, { prefix: "Manoeuvre: ", img: m.img }));
  }

  // Skills (NWPs).
  for (const s of items.filter(i => i.type === "skill").sort(byName)) {
    out.skills.push(action(`item-${s.id}`, s.name, "item", s.id, { prefix: "Skill: ", img: s.img, info1: { text: ARNEYAN.skillTiers?.[s.system.tier] ?? s.system.tier ?? "" } }));
  }

  if (isChar) {
    out.utility.push(action("utility-luck", "Luck Check", "utility", "luck", { icon1: fa("clover") }));
    out.utility.push(action("utility-rest", "Rest", "utility", "rest", { icon1: fa("bed") }));
  }
  return out;
}

/** Do what a HUD button says, for one actor. Same calls as the sheet. */
export async function runHudAction(actor, { actionType, actionId }, event, { render = false } = {}) {
  if (!actor) return;
  switch (actionType) {
    case "item": {
      const item = actor.items.get(actionId);
      if (!item) return;
      return render ? item.sheet?.render(true) : item.use(event);
    }
    case "manoeuvre": {
      const doc = await fromUuid(actionId).catch(() => null);
      if (!doc) return;
      if (render) return doc.sheet?.render(true);
      // Not on the sheet: post its card as this actor's.
      const temp = new CONFIG.Item.documentClass(doc.toObject(), { parent: actor });
      // Grapple, Trip, Dirty Trick and the rest roll their contest, as from the sheet.
      const { combatUse } = await import("./combat.mjs");
      const r = await combatUse(temp, event);
      if (r !== undefined) return r;
      return temp.toChat();
    }
    case "save": return ARNEYAN.saves[actionId] ? actor.rollSave(actionId, event) : undefined;
    case "check": return ARNEYAN.abilities[actionId] ? actor.rollAbility(actionId, event) : undefined;
    case "condition": {
      if (!ARNEYAN.conditions[actionId]) return;
      const { toggleCondition } = await import("./effects.mjs");
      return toggleCondition(actor, actionId);
    }
    case "utility":
      if (actionId === "initiative") return actor.rollInitiative?.({ createCombatants: true });
      if (actionId === "luck") return actor.rollLuck?.(event);
      if (actionId === "rest") return actor.rest?.();
  }
}

let manoeuvreIndex = null;
async function manoeuvreList() {
  if (manoeuvreIndex) return manoeuvreIndex;
  const pack = game.packs.get(`${SYS}.actions`);
  if (!pack) return (manoeuvreIndex = []);
  const index = await pack.getIndex({ fields: ["img", "system.kind"] });
  manoeuvreIndex = index.filter(e => e.type === "ability" && e.system?.kind === "action").map(e => ({ uuid: e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`, name: e.name, img: e.img }));
  return manoeuvreIndex;
}

export function registerTokenActionHud() {
  Hooks.once("tokenActionHudCoreApiReady", async coreModule => {
    const api = coreModule?.api;
    if (!api?.ActionHandler || !api?.RollHandler || !api?.SystemManager) return;

    class ArneyanActionHandler extends api.ActionHandler {
      async buildSystemActions() {
        const actor = this.actor ?? null;
        if (actor && !["character", "npc"].includes(actor.type)) return;
        const groups = arneyanHudActions(actor, { statusEffects: CONFIG.statusEffects ?? [], manoeuvres: actor ? await manoeuvreList() : [] });
        for (const [id, actions] of Object.entries(groups)) {
          if (actions.length) this.addActions(actions, { id, type: "system" });
        }
      }
    }

    class ArneyanRollHandler extends api.RollHandler {
      async handleActionClick(event) {
        const data = this.action?.system ?? {};
        const render = this.isRenderItem?.() && ["item", "manoeuvre"].includes(data.actionType);
        const actors = this.actor ? [this.actor] : (canvas?.tokens?.controlled ?? []).map(t => t.actor).filter(a => a?.isOwner);
        for (const actor of actors) {
          try { await runHudAction(actor, data, event, { render }); } catch (err) { console.warn("Arneyan | Token Action HUD", err); }
          if (render) break;
        }
      }
    }

    class ArneyanSystemManager extends api.SystemManager {
      getActionHandler() { return new ArneyanActionHandler(); }
      getAvailableRollHandlers() { return { core: "The Arneyan Codex" }; }
      getRollHandler() { return new ArneyanRollHandler(); }
      async registerDefaults() { return tahDefaults(); }
    }

    Hooks.call("tokenActionHudSystemReady", { id: SYS, api: { requiredCoreModuleVersion: REQUIRED_CORE_MODULE_VERSION, SystemManager: ArneyanSystemManager } });
  });
}

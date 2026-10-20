/**
 * Bring a world's copies of compendium items up to date once per system version: items already on sheets keep the
 * data they had when they were added, so a Backpack wouldn't become a container, a feature wouldn't get its new
 * Use, a feat wouldn't get its effects and a spell wouldn't get its save or area.
 *
 * Two kinds of change:
 * - Gear and the like (`fillFrom`): only fields that are still empty are filled; nothing set by hand is overwritten.
 * - Feats, features, kits, ancestries, spells and actions (`refreshFrom`, from 0.10.1): their mechanics (rules,
 *   switch, effects, activities, uses, save, damage, area, a kit's features) are replaced from the current
 *   compendium entry. Name, description, image, quantity and equipped stay, and so do a switch's on/off, uses left
 *   (up to the new maximum) and an attribute already picked. An item flagged `flags.arneyan.keepCustom` (the item
 *   sheet's "Keep my edits" box) is never touched, nor is anything that didn't come from a system compendium.
 */
import { formulaUsesFor } from "./data/actor-models.mjs";

const SYS = "arneyan";
const VERSION = "0.10.1";
const PACKS = ["equipment", "spells", "class-features", "feats", "kits", "ancestries", "actions"];
const SOURCES = PACKS.map(p => `Compendium.${SYS}.${p}.`);
/** The item types whose mechanics are replaced from the compendium. */
const REFRESH = new Set(["feat", "ability", "kit", "ancestry", "spell"]);
/** The mechanical fields replaced (where the compendium entry's type has them). */
const FIELDS = ["rules", "toggle", "applies", "activities", "save", "saveEffect", "dc", "damage", "damageType", "template"];

const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
/** The same data, whatever order its keys are in (stored data follows the schema's order, a fresh object doesn't). */
const stable = v => (Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v);
const same = (a, b) => JSON.stringify(stable(a ?? null)) === JSON.stringify(stable(b ?? null));

/** The system compendium entry an item came from, if any (features a class granted carry it in our own flag). */
export function compendiumSourceOf(item) {
  for (const s of [item?._stats?.compendiumSource, item?.flags?.core?.sourceId, item?.flags?.[SYS]?.source]) {
    if (typeof s === "string" && SOURCES.some(p => s.startsWith(p))) return s;
  }
  return null;
}
const sourceOf = compendiumSourceOf;

/** What to fill in on one item from its compendium entry (nothing if it's already set). */
export function fillFrom(item, src) {
  const s = item.system ?? {}, o = src.system ?? {};
  const upd = {};
  if (item.type === "equipment") {
    if (o.container?.holds && !s.container?.holds) upd["system.container"] = o.container;
    if ((o.light?.bright || o.light?.dim) && !s.light?.bright && !s.light?.dim) {
      upd["system.light.bright"] = o.light.bright; upd["system.light.dim"] = o.light.dim;
      upd["system.light.hours"] = o.light.hours; upd["system.light.angle"] = o.light.angle ?? 360;
    }
    if (o.itemSpells?.length && !s.itemSpells?.length) {
      upd["system.itemSpells"] = o.itemSpells; upd["system.castLevel"] = o.castLevel ?? 0;
      upd["system.nonCasterCl"] = o.nonCasterCl ?? 0; upd["system.nonCasterDc"] = o.nonCasterDc ?? 0;
    }
  }
  if (item.type === "spell" && o.applies?.length && !s.applies?.length) upd["system.applies"] = o.applies;
  // Spell areas (Place area) and auras (Aura of Courage, Spirit Guardians), new in 0.7.0.
  if (item.type === "spell" && o.template?.type && !s.template?.type) { upd["system.template"] = o.template; if (o.area && !s.area) upd["system.area"] = o.area; }
  // 0.7.3: Earthquake's radius grows with level; a light or an object (Daylight, Secret Page) isn't an area after all.
  if (item.type === "spell" && o.template?.sizeFormula && s.template?.type && !s.template?.sizeFormula) upd["system.template.sizeFormula"] = o.template.sizeFormula;
  if (item.type === "spell" && o.template && !o.template.type && s.template?.type) upd["system.template.type"] = "";
  if (o.auras?.length && !s.auras?.length) upd["system.auras"] = o.auras;
  // 0.9.1: what a feature does when used (Lay on Hands heals; options ask which).
  if (item.type === "ability" && o.activities?.length && !s.activities?.length) upd["system.activities"] = o.activities;
  // A weapon that gained a mode (a Flame Tongue ignites): its mode, and its extra damage tied to the mode.
  if (item.type === "weapon" && o.toggle && o.modeLabel && !s.modeLabel) {
    upd["system.toggle"] = true; upd["system.modeLabel"] = o.modeLabel; upd["system.modeLight"] = o.modeLight ?? 0;
    upd["system.bonusDamage"] = o.bonusDamage;
  }
  return upd;
}

/**
 * Uses from the compendium, keeping how many are left: never more than the new maximum (`maxNow`, the maximum
 * its formula gives on this character, when it has one). A feature that had no uses before starts full.
 */
export function usesFrom(old = {}, src = {}, maxNow = null) {
  const out = { max: Number(src.max) || 0, per: src.per ?? "", formula: src.formula ?? "" };
  const max = Number.isFinite(maxNow) && maxNow !== null ? maxNow : out.max;
  const had = Number(old.max) || 0;
  const value = Number(old.value) || 0;
  out.value = !had && !old.formula ? max : Math.max(0, Math.min(value, max));
  return out;
}

/** A kit's features from the compendium, keeping uses left (and a picked attribute) where a feature is still there. */
export function kitFeaturesFrom(oldFeatures = [], srcFeatures = []) {
  return (srcFeatures ?? []).map(f => {
    const nf = clone(f);
    const old = (oldFeatures ?? []).find(x => x.name === f.name);
    if (old && nf.uses) nf.uses.value = Math.max(0, Math.min(Number(old.uses?.value) || 0, Number(nf.uses.max) || 0));
    if (old?.abilityChoice?.value && nf.abilityChoice?.options?.includes(old.abilityChoice.value)) nf.abilityChoice.value = old.abilityChoice.value;
    return nf;
  });
}

/**
 * The mechanical fields of a feat, feature, kit, ancestry, spell or action, replaced from its compendium entry (an
 * object `src` with `type` and `system`). `maxNow` is what a uses formula gives on the owner. Returns an update (empty
 * when nothing differs, so a second run changes nothing).
 */
export function refreshFrom(item, src, { maxNow = null } = {}) {
  const upd = {};
  if (!item || !src || !REFRESH.has(item.type) || item.type !== src.type || item.flags?.[SYS]?.keepCustom) return upd;
  // The stored data, not what data preparation made of it (a uses formula's maximum, a clamped value).
  const s = item._source?.system ?? item.system ?? {}, o = src.system ?? {};
  const set = (k, v) => { if (!same(s[k], v)) upd[`system.${k}`] = clone(v); };
  for (const k of FIELDS) if (o[k] !== undefined && k in s) set(k, o[k]);
  // An attribute picked already stays, if the new options still have it.
  if (o.abilityChoice !== undefined && "abilityChoice" in s) {
    const opts = o.abilityChoice?.options ?? [];
    set("abilityChoice", { options: opts, value: opts.includes(s.abilityChoice?.value) ? s.abilityChoice.value : "" });
  }
  if (o.uses !== undefined && "uses" in s) set("uses", usesFrom(s.uses, o.uses, maxNow));
  if (item.type === "kit" && Array.isArray(o.features)) set("features", kitFeaturesFrom(s.features, o.features));
  return upd;
}

/** A feature a kit granted (flags.arneyan.source "<kit id>.<index>"), refreshed from the kit's (new) features. */
export function refreshGranted(item, features, { maxNow = null } = {}) {
  if (item?.type !== "ability" || item.flags?.[SYS]?.keepCustom) return {};
  const idx = Number(String(item.flags?.[SYS]?.source ?? "").split(".").pop());
  const f = (Number.isInteger(idx) && features?.[idx]?.name === item.name ? features[idx] : null) ?? features?.find?.(x => x.name === item.name);
  if (!f) return {};
  return refreshFrom(item, { type: "ability", system: f }, { maxNow });
}

/** The uses maximum a formula from `srcUses` gives on this actor (null without one). */
function maxOn(actor, item, srcUses) {
  if (!actor || !srcUses?.formula) return null;
  return formulaUsesFor(actor, { type: item.type, name: item.name, system: { className: item.system?.className ?? "", uses: { ...srcUses } } });
}

export function registerMigration() {
  game.settings.register(SYS, "migratedTo", { scope: "world", config: false, type: String, default: "" });
  Hooks.once("ready", () => runMigration().catch(err => console.warn("Arneyan | migration", err)));
}

/** Run the update if this world hasn't had it yet (the active GM only). Returns { items, actors, world }. */
export async function runMigration({ force = false } = {}) {
  if (!game.users.activeGM?.isSelf) return null;
  if (!force && !foundry.utils.isNewerVersion(VERSION, game.settings.get(SYS, "migratedTo") || "0")) return null;
  const cache = new Map();
  const fetch = async uuid => {
    if (!cache.has(uuid)) cache.set(uuid, await fromUuid(uuid).catch(() => null));
    return cache.get(uuid);
  };
  const plain = d => (typeof d?.toObject === "function" ? d.toObject() : d);
  /** Every update for one set of items (an actor's, or the Items directory), in one batch. */
  const updatesFor = async (items, actor = null) => {
    const updates = [];
    const kitFeatures = new Map();
    // Kits first: the features they granted follow the kit's new list.
    const ordered = [...items].sort((a, b) => Number(b.type === "kit") - Number(a.type === "kit"));
    for (const i of ordered) {
      const uuid = sourceOf(i);
      const src = uuid ? plain(await fetch(uuid)) : null;
      let upd = {};
      if (src) {
        upd = { ...fillFrom(i, src), ...refreshFrom(i, src, { maxNow: maxOn(actor, i, src.system?.uses) }) };
        if (i.type === "kit" && !i.flags?.[SYS]?.keepCustom) kitFeatures.set(i.id, src.system?.features ?? []);
      } else if (i.type === "ability" && kitFeatures.has(i.flags?.[SYS]?.grantedBy)) {
        const features = kitFeatures.get(i.flags[SYS].grantedBy);
        const idx = Number(String(i.flags[SYS].source ?? "").split(".").pop());
        const f = features[idx]?.name === i.name ? features[idx] : features.find(x => x.name === i.name);
        upd = refreshGranted(i, features, { maxNow: maxOn(actor, i, f?.uses) });
      }
      if (Object.keys(upd).length) updates.push({ _id: i.id, ...upd });
    }
    return updates;
  };
  let items = 0, actors = 0, world = 0;
  for (const actor of game.actors) {
    try {
      const updates = await updatesFor(actor.items.contents, actor);
      // Monsters from the Bestiary: their abilities' auras (Fire Aura, Fear Aura), matched by name.
      const msrc = actor._stats?.compendiumSource ?? actor.flags?.core?.sourceId ?? "";
      if (actor.type === "npc" && typeof msrc === "string" && msrc.startsWith(`Compendium.${SYS}.monsters.`)) {
        const m = await fetch(msrc);
        for (const i of actor.items) {
          const o = m?.items?.find(x => x.name === i.name && x.type === i.type);
          if (o?.system?.auras?.length && !i.system.auras?.length && !updates.some(u => u._id === i.id)) updates.push({ _id: i.id, "system.auras": o.system.auras });
        }
      }
      if (!updates.length) continue;
      await actor.updateEmbeddedDocuments("Item", updates, { arneyanForce: true, arneyanMigration: true });
      items += updates.length; actors += 1;
    } catch (err) { console.warn(`Arneyan | migration: ${actor.name}`, err); }
  }
  try {
    const updates = await updatesFor(game.items.contents);
    if (updates.length) { await Item.updateDocuments(updates, { arneyanMigration: true }); world = updates.length; }
  } catch (err) { console.warn("Arneyan | migration: Items directory", err); }
  await game.settings.set(SYS, "migratedTo", VERSION);
  if (items || world) {
    const gms = game.users.filter(u => u.isGM).map(u => u.id);
    const extra = world ? ` and ${world} in the Items directory` : "";
    await ChatMessage.create({ whisper: gms, speaker: { alias: "The Arneyan Codex" },
      content: `<div class="arn-card"><p><strong>Arneyan ${VERSION}:</strong> Updated ${items} item${items === 1 ? "" : "s"} on ${actors} actor${actors === 1 ? "" : "s"}${extra} from the compendiums.</p><p class="arn-card-meta">Rules, effects, uses, activities, saves, damage and areas now match the compendium. Names, descriptions and uses left stay. Tick "Keep my edits" on an item to stop updates overwriting it.</p></div>` });
  }
  return { items, actors, world };
}

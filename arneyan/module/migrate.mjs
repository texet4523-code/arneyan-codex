/**
 * Bring a world's copies of Catalogue gear and spells up to date once per system version: items already on
 * sheets keep the data they had when they were added, so a Backpack wouldn't become a container, a torch
 * wouldn't get its light, a wand wouldn't know its spells and Shield wouldn't get its effect. Only fields that
 * are still empty are filled; nothing the GM or a player changed is overwritten.
 */
const SYS = "arneyan";
const VERSION = "0.9.1";
const SOURCES = [`Compendium.${SYS}.equipment.`, `Compendium.${SYS}.spells.`, `Compendium.${SYS}.class-features.`, `Compendium.${SYS}.feats.`];

const sourceOf = item => {
  // Features a class granted carry their source in our own flag.
  const s = item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? item?.flags?.arneyan?.source ?? "";
  return typeof s === "string" && SOURCES.some(p => s.startsWith(p)) ? s : null;
};

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

export function registerMigration() {
  game.settings.register(SYS, "migratedTo", { scope: "world", config: false, type: String, default: "" });
  Hooks.once("ready", async () => {
    if (!game.users.activeGM?.isSelf) return;
    if (!foundry.utils.isNewerVersion(VERSION, game.settings.get(SYS, "migratedTo") || "0")) return;
    const cache = new Map();
    const fetch = async uuid => {
      if (!cache.has(uuid)) cache.set(uuid, await fromUuid(uuid).catch(() => null));
      return cache.get(uuid);
    };
    let n = 0;
    const fix = async (items, apply) => {
      const updates = [];
      for (const i of items) {
        const uuid = sourceOf(i);
        const src = uuid ? await fetch(uuid) : null;
        if (!src) continue;
        const upd = fillFrom(i, src);
        if (Object.keys(upd).length) updates.push({ _id: i.id, ...upd });
      }
      if (updates.length) { await apply(updates); n += updates.length; }
    };
    try {
      for (const actor of game.actors) {
        await fix(actor.items.contents, u => actor.updateEmbeddedDocuments("Item", u, { arneyanForce: true }));
        // Monsters from the Bestiary: their abilities' auras (Fire Aura, Fear Aura), matched by name.
        const msrc = actor._stats?.compendiumSource ?? actor.flags?.core?.sourceId ?? "";
        if (actor.type === "npc" && typeof msrc === "string" && msrc.startsWith(`Compendium.${SYS}.monsters.`)) {
          const m = await fetch(msrc);
          const updates = [];
          for (const i of actor.items) {
            const o = m?.items?.find(x => x.name === i.name && x.type === i.type);
            if (o?.system?.auras?.length && !i.system.auras?.length) updates.push({ _id: i.id, "system.auras": o.system.auras });
          }
          if (updates.length) { await actor.updateEmbeddedDocuments("Item", updates, { arneyanForce: true }); n += updates.length; }
        }
      }
      await fix(game.items.contents, u => Item.updateDocuments(u));
      await game.settings.set(SYS, "migratedTo", VERSION);
      if (n) ui.notifications.info(`Arneyan: ${n} item${n === 1 ? "" : "s"} brought up to date (containers, light, wand spells, spell effects, weapon modes, spell areas, auras, feature options).`);
    } catch (err) { console.warn("Arneyan | migration", err); }
  });
}

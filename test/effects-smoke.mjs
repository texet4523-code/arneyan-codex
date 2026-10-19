// Put every item that carries rules onto one character (all toggles on) and check nothing throws.
import fs from "node:fs";
import path from "node:path";
import { makeItem, makeActor } from "./harness.mjs";
const IM = await import("../arneyan/module/data/item-models.mjs");
const { CharacterData } = await import("../arneyan/module/data/actor-models.mjs");
const { effectDataFor } = await import("../arneyan/module/effects.mjs");
const models = { feat: IM.FeatData, ability: IM.AbilityData, ancestry: IM.AncestryData, spell: IM.SpellData, kit: IM.KitData };
const items = [], effects = [];
let rulesSeen = 0, applies = 0;
globalThis.Roll = class { constructor(f) { this.f = f; } async evaluate() { this.total = 3; return this; } };
for (const pack of ["feats", "class-features", "ancestries", "spells", "kits"]) {
  const dir = new URL(`../packs-src/${pack}/`, import.meta.url).pathname;
  for (const f of fs.readdirSync(dir).filter(f => f.startsWith("items_"))) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f)));
    const Model = models[d.type];
    if (!Model) continue;
    const list = d.type === "kit" ? d.system.features.map(x => ({ ...x, type: "ability" })) : [{ ...d.system, type: d.type }];
    for (const sys of list) {
      if (sys.rules?.length) { rulesSeen += sys.rules.length; const it = makeItem(models[sys.type] ?? IM.AbilityData, sys.type, d.name, { ...sys, active: true }); items.push(it); }
      for (const a of sys.applies ?? []) {
        applies++;
        const data = await effectDataFor(a, { name: d.name, img: "", uuid: "x", system: { description: "" } }, { cl: 9 });
        effects.push({ name: data.name, disabled: false, statuses: data.statuses, flags: data.flags });
      }
    }
  }
}
const a = makeActor(CharacterData, "character", { abilities: { str: { value: 14 } } }, [makeItem(IM.ClassData, "class", "Fighter", { levels: 9 }), ...items], effects);
const s = a.system;
for (const v of [s.attributes.ac.value, s.attributes.hp.max, s.attributes.speedNow, s.saves.fort.value, s.attributes.init]) if (!Number.isFinite(v)) throw new Error("non-number derived value " + v);
console.log(`smoke: ${items.length} items, ${rulesSeen} rules, ${applies} applied effects; AC ${s.attributes.ac.value}, situational ${s.mods.situational.length}`);

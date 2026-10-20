// Compare each pregen's numbers, as the sheet works them out, with its printed sheet.
import fs from "node:fs";
import { makeItem, makeActor } from "./harness.mjs";
const { CharacterData } = await import("../arneyan/module/data/actor-models.mjs");
const IM = await import("../arneyan/module/data/item-models.mjs");
const M = { class: IM.ClassData, ancestry: IM.AncestryData, kit: IM.KitData, feat: IM.FeatData, skill: IM.SkillData, ability: IM.AbilityData,
  weapon: IM.WeaponData, armour: IM.ArmourData, equipment: IM.EquipmentData, spell: IM.SpellData };
const dir = new URL("../packs-src/pregens/", import.meta.url).pathname;
const rows = [];
let bad = 0;
const hpBad = [];
for (const f of fs.readdirSync(dir).filter(f => f.startsWith("actors_"))) {
  const d = JSON.parse(fs.readFileSync(dir + f));
  const items = d.items.map(i => { const it = makeItem(M[i.type], i.type, i.name, i.system); it.id = i._id; it.flags = i.flags ?? {}; it.getFlag = (s, k) => it.flags?.[s]?.[k]; return it; });
  const a = makeActor(CharacterData, "character", d.system, items);
  const s = a.system, sh = d.flags.arneyan.pregen.sheet;
  const got = { ac: s.attributes.ac.value, fort: s.saves.fort.value, ref: s.saves.ref.value, will: s.saves.will.value, bth: s.bth, hp: s.attributes.hp.max, level: s.level };
  const want = { ac: sh.ac, fort: sh.saves?.fort, ref: sh.saves?.ref, will: sh.saves?.will, bth: sh.bth, hp: sh.hp };
  const diff = Object.keys(want).filter(k => want[k] != null && Number(want[k]) !== got[k]).map(k => `${k} sheet ${want[k]} / Foundry ${got[k]}`);
  if (diff.length) bad++;
  if (diff.some(d => d.startsWith("hp "))) hpBad.push(d.name);
  rows.push(`${d.name.padEnd(28)} L${got.level} ${diff.length ? "DIFF: " + diff.join("; ") : "ok"}`);
}
console.log(rows.sort().join("\n"));
console.log(`${rows.length} pregens, ${bad} with differences`);
// Max HP must match the printed sheet on every pregen (Toughness and Hag's Vigour are added by their rules, not twice).
if (hpBad.length) { console.error(`HP differs from the printed sheet: ${hpBad.join(", ")}`); process.exit(1); }
console.log(`HP matches the printed sheet on all ${rows.length}.`);

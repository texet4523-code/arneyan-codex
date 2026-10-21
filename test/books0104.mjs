// 0.10.39: the books v0.10.4 (21 Oct), mirrored: Dragonborn types, Traps, class-only spell schools, the knight kits.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { hbs } from "./harness.mjs";

const src = p => new URL(`../packs-src/${p}/`, import.meta.url).pathname;
const all = pack => fs.readdirSync(src(pack)).map(f => JSON.parse(fs.readFileSync(path.join(src(pack), f), "utf8")));
const docs = pack => all(pack).filter(d => d.system);
const strip = h => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const one = (pack, name) => docs(pack).find(d => d.name === name);
const root = new URL("../arneyan/", import.meta.url).pathname;

// Dragonborn: the draconic type sets the breath weapon and the resistance.
const db = one("ancestries", "Dragonborn");
assert.ok(strip(db.system.description).includes("Draconic type: choose fire, cold, lightning, poison or acid at creation. 1/long rest breath weapon of that type"));
assert.ok(strip(db.system.description).includes("Resistance 5 to your draconic type"));
assert.ok(!strip(db.system.description).includes("a chosen damage type"));
assert.deepEqual(db.system.traitList.slice(0, 2).map(t => t.name), ["Draconic type", "Resistance 5"]);
assert.equal(db.system.choice.options.length, 5, "one choice sets both");
const ref = all("rules").find(d => d.name.startsWith("Book II:")).pages.find(p => p.name === "Full Ancestry Reference");
assert.ok(ref.text.content.includes("Resistance 5</strong> to your draconic type"));

// Traps: a page after Environmental Hazards, with the table.
const b1 = all("rules").find(d => d.name.startsWith("Book I:"));
const env = b1.pages.find(p => p.name === "Environmental Hazards"), traps = b1.pages.find(p => p.name === "Traps");
assert.ok(traps && traps.sort > env.sort && traps.sort < b1.pages.find(p => p.name === "Resting & Recovery").sort);
for (const s of ["<td>13–16</td><td>20</td><td>18</td><td>8d6</td>", "Deadly traps:</strong> add 2 to both DCs and double the damage", "Kobolds have Advantage (Trapwise)", "Dispel Magic ends it"])
  assert.ok(traps.text.content.includes(s), s);
assert.equal(b1.pages.filter(p => p.name === "Traps").length, 1);

// The Traps table on a hazard.
const H = await import("../arneyan/module/hazards.mjs");
assert.deepEqual(H.trapNumbers(1), { find: 12, save: 12, damage: "2d6" });
assert.deepEqual(H.trapNumbers(4), { find: 12, save: 12, damage: "2d6" });
assert.deepEqual(H.trapNumbers(5), { find: 15, save: 14, damage: "4d6" });
assert.deepEqual(H.trapNumbers(12, true), { find: 17, save: 18, damage: "12d6" }, "deadly: +2 DCs, double damage");
assert.deepEqual(H.trapNumbers(24), { find: 20, save: 22, damage: "12d6" });
assert.deepEqual(H.trapNumbers(30), { find: 20, save: 22, damage: "12d6" }, "past the table: its last row");
assert.deepEqual(H.trapNumbers(0), { find: 12, save: 12, damage: "2d6" });
assert.deepEqual(H.trapUpdate({ level: 9, deadly: false, save: { key: "" } }), {
  "system.spot.ability": "wis", "system.spot.dc": 15, "system.disable.ability": "int", "system.disable.dc": 15,
  "system.save.key": "ref", "system.save.dc": 16, "system.save.damage": "6d6" });
assert.equal(H.trapUpdate({ level: 9, deadly: false, save: { key: "fort" } })["system.save.key"], "fort", "a save already chosen stays");
const sheet = fs.readFileSync(path.join(root, "templates/actor/hazard-sheet.hbs"), "utf8");
assert.ok(sheet.includes('data-action="trapTable"') && sheet.includes('name="system.deadly"'));
const enc = fs.readFileSync(path.join(root, "module/encounter.mjs"), "utf8");
assert.ok(enc.includes('["npc", "hazard"].includes(c.actor?.type)'), "a trap in a fight costs like a creature");

// Class-only spells: school and components.
const spells = docs("spells");
const want = { "Cause Fear": ["Illusion", "V, S"], "Fear (Mass)": ["Illusion", "V, S, M"], "Hex of Stumbling": ["Transmutation", "V, S"],
  "Evil Eye": ["Enchantment", "V, S"], "Enslave": ["Enchantment", "V, S"], "Slay Living": ["Necromancy", "V, S"], "Touch of Fatigue": ["Necromancy", "V, S, M"] };
for (const [n, [school, comps]] of Object.entries(want)) {
  const s = spells.find(d => d.name === n).system;
  assert.deepEqual([s.school, s.components], [school, comps], n);
}
for (const n of ["Animate Dead (Greater)", "Create Greater Undead", "Symbol of Death"]) {
  const s = spells.find(d => d.name === n).system;
  assert.ok(s.costly && strip(s.description).includes("Costed component (‡):"), n);
}
assert.ok(strip(spells.find(d => d.name === "Animate Dead (Greater)").system.description).includes("black onyx, as Animate Dead"));
const folders = Object.fromEntries(all("spells").filter(d => !d.system).map(d => [d._id, d.name]));
const classOnly = spells.filter(d => ["Necromancer", "Warlock", "Witch"].includes(folders[d.folder]) && d.name !== "Eldritch Blast");
assert.equal(classOnly.length, 33);
assert.ok(classOnly.every(d => d.system.school && d.system.components), classOnly.filter(d => !d.system.school).map(d => d.name).join());

// Knight kits: written out, automated, replacing Embolden or Demoralise.
const hedge = one("kits", "Hedge Knights (Knight)").system.features.find(f => f.name === "Steadfast Courage");
assert.deepEqual([hedge.level, hedge.replaces, hedge.uses.max, hedge.uses.per], [3, "Embolden", 1, "day"]);
assert.equal(hedge.applies[0].rounds, "@cl * 2");
assert.deepEqual(hedge.applies[0].rules.map(r => `${r.key} ${r.value}`), ["save.fort 2", "save.ref 2", "save.will 3"]);
const wall = one("kits", "Boldock Wall-Knights (Knight)").system.features.find(f => f.name === "Wall-Forged Dread");
assert.deepEqual([wall.level, wall.replaces, wall.save], [5, "Demoralise", "will"]);
assert.deepEqual(wall.applies.map(a => a.rules.map(r => `${r.key} ${r.value}`).join()), ["check.cha -6", "adv.attack -1"]);
assert.ok(strip(one("kits", "Boldock Wall-Knights (Knight)").system.description).includes("your Demoralise replaces the usual one"));
assert.ok(/replaces: str\(\)/.test(fs.readFileSync(path.join(root, "module/data/item-models.mjs"), "utf8")), "kits keep it");
const prog = fs.readFileSync(path.join(root, "module/progression.mjs"), "utf8");
assert.ok(prog.includes("replacedFor(actor, cls)") && prog.includes("dropReplaced"));
const durgan = docs("pregens").find(d => d.name === "Sir Durgan Holdfast");
assert.ok(durgan.items.some(i => i.name === "Wall-Forged Dread" && i.flags.arneyan.replaces === "Demoralise"));
assert.ok(!durgan.items.some(i => i.name === "Demoralise"), "the pregen Wall-Knight has the kit's, not the class's");
console.log("OK books v0.10.4");

// Books HB v0.10.67 and M&T v0.10.67 (B-F59, B-F60, R-F29; K121 to K125, L81).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

const read = sub => {
  const dir = new URL(`../packs-src/${sub}/`, import.meta.url);
  return fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(new URL(f, dir), "utf8")));
};
// K121: every class 10 XP a level, the Battle Priest too.
for (const c of read("classes")) assert.equal(c.system.xpRate, 10, c.name);
assert.ok(!/12 XP/.test(JSON.stringify(read("classes"))), "no 12 XP line");
// K122 to K125: the Spellblade's two new kits.
const kits = read("kits");
const kit = n => kits.find(k => k.name === `${n} (Spellblade)`);
const ward = kit("Wardblade"), drift = kit("Driftblade");
assert.ok(ward && drift);
assert.equal(ward.folder, kit("Bladebound").folder);
assert.ok(ward.system.description.includes("First taught in Aldori"));
assert.ok(!ward.system.description.includes("Boldock"));
assert.ok(drift.system.description.includes("Keepers' Road") && !drift.system.description.includes("Red Waste"));
assert.ok(ward.system.features[0].description.includes("as well as Arcane Cascade"));
assert.equal(ward.system.features[1].rules[0].key, "adv.check");
assert.equal(drift.system.features[1].rules[0].key, "adv.check");
// L81: M&T item homes (the items M&T builds; the Catalogue's staples follow the Catalogue).
const eq = read("equipment");
const item = n => eq.find(d => d.name === n);
assert.ok(item("Githyanki Silver Sword").system.description.includes("relic of the Forgotten Age"));
assert.ok(item("Axe of the Dwarvish Lords").system.description.includes("Galrim Stoneblessed"));
assert.ok(item("Moonblade").system.description.includes("Aldori"));
assert.ok(item("Dragon Slayer").system.description.includes("Jotunas and Depsopteron"));
for (const n of ["Tempus", "Malar", "Cimber", "Netheril"]) assert.ok(!JSON.stringify(eq).includes(n), n);
console.log("books0167 ok");

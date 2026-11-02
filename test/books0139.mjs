// Books v0.10.39 (K46, m73; board B-F26) in the system: four spells change school, class lists unchanged.
import assert from "node:assert/strict";
import fs from "node:fs";

const read = dir => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith("items_"))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const spells = read("spells");
const school = n => spells.find(s => s.name === n)?.system.school;
assert.deepEqual(["Prismatic Spray", "Prismatic Wall", "Major Creation", "Limited Wish"].map(school), ["Evocation", "Abjuration", "Conjuration", "Conjuration"]);
assert.equal(school("Sending"), "Evocation", "Sending stays Evocation");
assert.ok(spells.find(s => s.name === "Limited Wish").system.classes.includes("Wizard"), "class lists unchanged");
console.log("OK books v0.10.39");

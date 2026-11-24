// Handbook v0.10.93 (S-F8, R-S11, K299) in the system (0.10.135): the reworked spells' numbers on their items, the three
// Wizard summons' durations and cap, and Circle of Death's save line.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

const dir = new URL("../packs-src/spells/", import.meta.url);
const spells = Object.fromEntries(fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(new URL(f, dir), "utf8")))
  .filter(s => s.system).map(s => [s.name, s.system]));
const want = {
  "Chill Touch": "1d8 + min(@cl, 10)",
  "Circle of Death": "(max(1, min(floor(@cl/2), 8)))d6",
  "Cloudkill": "(max(1, min(floor(@cl/2), 8)))d6",
  "Insect Plague": "(max(1, min(floor(@cl/2), 6)))d6",
  "Creeping Doom": "(max(1, min(floor(@cl/2), 10)))d6",
  "Incendiary Cloud": "(max(1, min(floor(@cl/2), 10)))d6",
  "Shatter": "(max(1, min(floor(@cl/2), 5)))d6"
};
for (const [n, f] of Object.entries(want)) assert.equal(spells[n].damage, f, n);
assert.equal(spells["Circle of Death"].damageType, "necrotic");
assert.equal(spells["Circle of Death"].save, "fort");
assert.ok(/^Half damage/.test(spells["Circle of Death"].saveEffect) && !/negat/i.test(spells["Circle of Death"].saveEffect),
  "a creature that saves takes half (chat.mjs reads 'negat' as no damage)");
assert.equal(spells["Shatter"].save, "fort");
assert.equal(spells["Sunbeam"].concentration, true);
assert.equal(spells["Sunbeam"].damage, "4d6");
assert.match(spells["Mnemonic Enhancer"].description, /totalling 6 spell levels/);
assert.match(spells["Death Knell"].description, /twice its Level/);
assert.match(spells["Shadow Monsters"].description, /total Levels up to your level/);

const { SUMMON_SPELLS } = await import("../arneyan/module/summons.mjs");
for (const n of ["Summon Lesser Monster", "Summon Monster", "Summon Greater Monster"]) {
  assert.deepEqual(SUMMON_SPELLS[n].duration, { n: 1, unit: "minute", perLevel: true }, n);
  assert.match(spells[n].description, /1 minute per level/, `${n}'s text`);
}
assert.equal(SUMMON_SPELLS["Summon Greater Monster"].options[0].max, 12);
assert.match(spells["Summon Greater Monster"].description, /Level 12 or lower/);
console.log("OK HB v0.10.93 spells");

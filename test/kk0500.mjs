// Keeps & Kingdoms in Foundry (R-F28, K117, K119): Chapter 6's creatures as actors, every chapter as a journal.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

const read = sub => {
  const dir = new URL(`../packs-src/${sub}/`, import.meta.url);
  return fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(new URL(f, dir), "utf8")));
};
const sys = JSON.parse(fs.readFileSync(new URL("../arneyan/system.json", import.meta.url), "utf8"));
for (const p of ["kk-rules", "kk-monsters"]) {
  assert.ok(sys.packs.some(x => x.name === p), `pack ${p}`);
  assert.ok(sys.packFolders.find(f => f.name === "Keeps & Kingdoms").packs.includes(p));
}
const mons = read("kk-monsters").filter(d => d.type === "npc");
assert.equal(mons.length, 19, "nineteen creature blocks");
const by = Object.fromEntries(mons.map(d => [d.name, d]));
// Minions ticked (K101), with 1 HP; others not.
const minions = ["Angulotl Tadpole", "Goblin Runner", "Kobold Shieldbearer", "Orc Raider", "Hobgoblin Legionnaire", "Gnoll Ravager", "Grave Shambler"];
for (const n of minions) { assert.equal(by[n].system.attributes.minion, true, n); assert.equal(by[n].system.attributes.hp.max, 1, n); }
assert.equal(mons.filter(d => d.system.attributes.minion).length, minions.length);
// Saves as the block gives them; Levels; the solo with villain actions and opener damage.
assert.deepEqual(by["Angulotl Needler"].system.saves, { fort: 3, ref: 6, will: 4 });
assert.equal(by["Goblin Runner"].system.levelText ?? by["Goblin Runner"].system.details.levelText, "½");
const worm = by["Kingfissure Worm"];
assert.equal(worm.system.details.isSolo, true);
assert.equal(worm.system.level, 15);
assert.equal(worm.system.attributes.hp.max, 375);
const va = worm.items.filter(i => i.flags?.arneyan?.villainAction);
assert.deepEqual(va.map(i => i.flags.arneyan.villainAction), [1, 2, 3]);
assert.ok(va[0].system.description.includes("Opener damage"));
assert.ok(worm.items.some(i => i.type === "weapon" && i.name === "Tongue ×3"));
// Leaders have their Command; "as the blade" abilities are copied; GM lines aren't abilities.
for (const n of ["Goblin Warlord", "Orc Warchief", "Hobgoblin War Captain"]) {
  assert.ok(by[n].items.some(i => i.name.startsWith("Command")), `${n} Command`);
  assert.ok(by[n].system.details.description.includes("<strong>Leader</strong>"), n);
}
assert.ok(by["Angulotl Seer"].items.some(i => i.name === "Toxic Skin"));
assert.ok(by["Goblin Warlord"].items.some(i => i.name === "Scimitar ×2") && by["Goblin Warlord"].items.some(i => i.name === "Shortbow ×2"));
assert.ok(mons.every(d => d.items.every(i => !/^A |^Where /.test(i.name))), "no GM line as an ability");
// Journals: six chapters; MCDM named once, in the small print on the first page (K104).
const js = read("kk-rules").filter(d => d.pages);
assert.equal(js.length, 6);
const all = JSON.stringify(js);
assert.equal((all.match(/MCDM/g) ?? []).length, 2, "the small print's two mentions only");
assert.ok(js.find(j => j.name === "Chapter 1: Strongholds").pages[0].text.content.includes("Not an MCDM product"));
assert.ok(JSON.stringify(read("kk-monsters")).indexOf("MCDM") < 0);
console.log("kk0500 ok");

// Review fixes (0.10.101): GM-only creatures, the mindless Shambler, once-a-day uses, the Corpse Herder's slots.
assert.equal(sys.packs.find(p => p.name === "kk-monsters").ownership.PLAYER, "NONE");
assert.equal(by["Grave Shambler"].system.attributes.morale, 12);
for (const [n, a] of [["Angulotl Seer", "Toxic Bubble"], ["Dragonet", "Revealing Breath"], ["Lightbender", "Hypnotic Mane"], ["Orc Warchief", "Relentless"], ["Hobgoblin War Captain", "Rally"]]) {
  const it = by[n].items.find(i => i.name.startsWith(a));
  assert.equal(it?.system.uses?.max, 1, `${n}: ${a} once per day`);
}
assert.equal(by["Corpse Herder"].system.spellcasting.className, "Necromancer");
assert.equal(by["Corpse Herder"].system.spellcasting.level, 5);
console.log("kk0500 review fixes ok");

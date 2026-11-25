// M&T 0.10.90, HB 0.10.96, K&K 0.5.9 (S-F11, R-S24, K312) in the system (0.10.138): sixteen monster Levels from R-F53.
// Saves follow the Level (M&T: half the Level plus the attribute modifier), so they move with it; nothing else does.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

const dir = new URL("../packs-src/monsters/", import.meta.url);
const mon = Object.fromEntries(fs.readdirSync(dir).filter(f => f.startsWith("actors_")).map(f => JSON.parse(fs.readFileSync(new URL(f, dir), "utf8"))).map(d => [d.name, d.system]));
const want = { "Hobgoblin Devastator": 5, "Cult Fanatic": 6, "Quipper Swarm": 2, "Poisonous Snake Swarm": 2, "Polar Bear": 7, "Rhinoceros": 4,
  "Mammoth": 10, "Allip": 4, "Apparition": 5, "Galeb Duhr": 5, "Marid": 13, "Gauth": 7, "Mind Flayer": 8, "Mind Flayer Arcanist": 11, "Slaad, Red": 7, "Cyclops": 9 };
for (const [n, l] of Object.entries(want)) assert.equal(mon[n].level, l, n);
assert.deepEqual(mon["Mammoth"].saves, { fort: 10, ref: 5, will: 5 });
assert.equal(mon["Mammoth"].hd, "10d12+50", "stats unchanged");
assert.equal(mon["Giant Octopus"].level, 4, "the other 19 stay");
const lock = JSON.parse(fs.readFileSync(new URL("../build/site.lock", import.meta.url), "utf8"));
const num = v => v.split(".").map(Number).reduce((t, n) => t * 1000 + n, 0);
assert.ok(num(lock.books.MT) >= num("0.10.90") && num(lock.books.HB) >= num("0.10.96"));
const { WILD_FORMS } = await import("../arneyan/module/wild-forms.mjs");
assert.equal(WILD_FORMS.find(f => f.name === "Mammoth").level, 10, "the Druid's forms list reads the Level");
console.log("OK M&T 0.10.90 Levels");

// The world update: a copy still at the old Level moves, with its saves; a GM's own numbers stay.
for (const k of ["Actor", "Item", "Combatant", "ChatMessage"]) globalThis[k] ??= class {};
const M = await import("../arneyan/module/migrate.mjs");
assert.equal(M.LEVEL_MOVES.size, 16);
const mam = (level, saves) => ({ type: "npc", _stats: { compendiumSource: "Compendium.arneyan.monsters.Actor.onbhSHTvsnPThlLJ" }, system: { level, saves } });
assert.deepEqual(M.levelMove(mam(9, { fort: 9, ref: 4, will: 4 })), { "system.level": 10, "system.saves.fort": 10, "system.saves.ref": 5, "system.saves.will": 5 });
assert.deepEqual(M.levelMove(mam(9, { fort: 12, ref: 4, will: 4 })), { "system.level": 10, "system.saves.ref": 5, "system.saves.will": 5 }, "a save the GM set stays");
assert.equal(M.levelMove(mam(11, { fort: 9, ref: 4, will: 4 })), null, "a Level the GM set stays");
assert.equal(M.levelMove({ type: "npc", _stats: { compendiumSource: "Compendium.arneyan.monsters.Actor.nothere" }, system: { level: 9 } }), null);
assert.equal(M.LEVELS_0190, "0.10.138", "the step runs once, for worlds coming from before 0.10.138");
console.log("OK the world's copies");

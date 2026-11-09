// R-F26 (Kieran, 9 Nov): a Minion box on monsters: 1 HP while ticked, the HP it had when unticked. Runs on its own.
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeActor } from "./harness.mjs";

for (const k of ["Item", "Combatant"]) globalThis[k] ??= class {};
class Actor { async _preUpdate() { return true; } }
globalThis.Actor = Actor;
const { NpcData } = await import("../arneyan/module/data/actor-models.mjs");
const { ArneyanActor } = await import("../arneyan/module/documents.mjs");

const ogre = makeActor(NpcData, "npc", { attributes: { hp: { value: 30, max: 30 } } });
assert.equal(ogre.system.attributes.hp.max, 30);
assert.equal(ogre.system.attributes.minion, false);
const minion = makeActor(NpcData, "npc", { attributes: { hp: { value: 30, max: 30 }, minion: true } });
assert.equal(minion.system.attributes.hp.max, 1, "a minion has 1 HP");
assert.equal(minion.system.attributes.hp.fullMax, 30, "the block's HP is kept");

// Ticking and unticking through an update.
const a = Object.create(ArneyanActor.prototype);
Object.defineProperty(a, "system", { value: ogre.system, configurable: true });
Object.assign(a, { type: "npc", id: "o1", flags: { arneyan: {} }, _source: { system: { attributes: { hp: { max: 30 } } } }, clone: null });
const on = { system: { attributes: { minion: true } } };
await a._preUpdate(on, {}, null);
assert.equal(on.system.attributes.hp.value, 1, "ticked: 1 HP");
assert.equal(on.flags.arneyan.minionHp, 30, "the HP it had is kept");
a.system.attributes.minion = true; a.flags.arneyan.minionHp = 30; a.system.attributes.hp.max = 1; a.system.attributes.hp.effectiveMax = 1; a.system.attributes.hp.value = 1;
// As Foundry does: capHpChange works the maximum out on a copy with the change (unticked: the block's 30).
a.clone = () => ({ system: { attributes: { hp: { max: 30, effectiveMax: 30 } } } });
const off = { system: { attributes: { minion: false } } };
await a._preUpdate(off, {}, null);
assert.equal(off.system.attributes.hp.value, 30, "unticked: its HP back");

const tpl = fs.readFileSync(new URL("../arneyan/templates/actor/actor-sheet.hbs", import.meta.url), "utf8");
assert.ok(/name="system.attributes.minion"/.test(tpl), "the box is on the sheet");
console.log("OK minion");

/* The Spellblade rename (books v0.10.55) for a world's Magus characters. */
{
  const M = await import("../arneyan/module/migrate.mjs");
  const items = [
    { id: "c", type: "class", name: "Magus", system: { className: "" } },
    { id: "k", type: "kit", name: "Battle Caster (Magus)", system: { className: "Magus" } },
    { id: "f", type: "ability", name: "War Magic", system: { className: "Magus" } },
    { id: "g", type: "ability", name: "Arcane Ward", system: { className: "Battle Caster (Magus)" } },
    { id: "s", type: "spell", name: "Shield", system: { className: "Magus" } },
    { id: "h", type: "ability", name: "Goring Charge", system: {} },
    { id: "x", type: "class", name: "Fighter", system: {} }
  ];
  assert.deepEqual(M.spellbladeRenames(items), [
    { _id: "c", name: "Spellblade" },
    { _id: "k", name: "Battle Caster (Spellblade)", "system.className": "Spellblade" },
    { _id: "f", "system.className": "Spellblade" },
    { _id: "g", "system.className": "Battle Caster (Spellblade)" },
    { _id: "s", "system.className": "Spellblade" },
    { _id: "h", name: "Horn Charge" }
  ]);
}
console.log("OK spellblade");

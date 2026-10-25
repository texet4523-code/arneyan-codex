// Batch 6 (0.10.51): foraging and the camp checks (camp.mjs).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
const C = await import("../arneyan/module/camp.mjs");

// Forage: DC 12; 1d4 plus one for every 5 over.
assert.equal(C.FORAGE_DC, 12);
assert.deepEqual([11, 12, 16, 17, 21, 22, 30].map(t => C.forageBonus(t)), [0, 0, 0, 1, 1, 2, 3]);

// The skill a check uses: the first trained one of the list.
const actor = { items: [{ type: "skill", name: "Hunting" }, { type: "skill", name: "First Aid/Healing" }, { type: "equipment", name: "Survival Kit" }] };
assert.equal(C.skillFor(actor, ["Survival", "Hunting"]).name, "Hunting");
assert.equal(C.skillFor(actor, ["First Aid"]).name, "First Aid/Healing");
assert.equal(C.skillFor(actor, ["Survival"]), null, "an item that isn't a skill doesn't count");

// campCheck: trained skill, else the attribute, else untrained.
const calls = [];
const roller = { items: actor.items, rollSkill: (i, e, o) => calls.push(["skill", i?.name ?? null, o.dc]), rollAbility: (k, e, o) => calls.push(["ability", k, o.dc]) };
C.campCheck(roller, { skills: ["Hunting"], dc: 12 });
C.campCheck(roller, { skills: ["Cooking"], ability: "int", dc: 10 });
C.campCheck(roller, { skills: ["Survival"], dc: 12 });
C.campCheck(roller, { ability: "wis" });
assert.deepEqual(calls, [["skill", "Hunting", 12], ["ability", "int", 10], ["skill", null, 12], ["ability", "wis", null]]);

// The ration item exists in the compendium sources.
assert.ok(fs.readdirSync(new URL("../packs-src/equipment/", import.meta.url)).some(f => f.includes("7ou5GBNDo9o4VQKz")));
// Rolls take a DC (shown as success or failure on the card).
const docs = fs.readFileSync(new URL("../arneyan/module/documents.mjs", import.meta.url), "utf8");
assert.ok(docs.includes('rollSkill(item, event, { dc = null, title = "" } = {})') && docs.includes('dc = null, title = "" } = {}) {'));
console.log("OK camp (forage)");

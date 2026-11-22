// R-F50 (K213, K221): out-of-turn prompts. Which buttons a character is offered for each event.
import assert from "node:assert/strict";
import "./harness.mjs";
const O = await import("../arneyan/module/outofturn.mjs");

const feat = (name, acts = [], extra = {}) => ({ type: "ability", name, id: name.replace(/\W/g, ""), system: { activities: acts, uses: { max: 0 }, ...extra.system }, availableActivities: acts, usesCount: extra.count ?? null });
const cls = (name, levels) => ({ type: "class", name, system: { levels } });
const actor = (...items) => ({ type: "character", uuid: "Actor.pc", id: "pc", items });
const names = list => list.map(o => o.act?.name ?? o.item.name).sort();

/* A Swashbuckler: Parry when hit in melee, Riposte when missed in melee (within reach), neither at range. */
const swash = actor(cls("Swashbuckler", 3), feat("Flourish Manoeuvres", [{ name: "Parry", cost: 0 }, { name: "Riposte", cost: 0 }, { name: "Acrobatic Escape", cost: 0 }]));
assert.deepEqual(names(O.optionsFor(swash, { on: "hit", self: true, melee: true }, O.TESTS)), ["Parry"]);
assert.deepEqual(names(O.optionsFor(swash, { on: "miss", self: true, melee: true, attackerFeet: 5 }, O.TESTS)), ["Riposte"]);
assert.deepEqual(names(O.optionsFor(swash, { on: "miss", self: true, melee: true, attackerFeet: 15 }, O.TESTS)), [], "out of reach");
assert.deepEqual(names(O.optionsFor(swash, { on: "hit", self: true, melee: false }, O.TESTS)), [], "a ranged hit can't be Parried");

/* A Rogue's Uncanny Dodge on any hit; not for an ally's. */
const rogue = actor(cls("Rogue", 6), feat("Uncanny Dodge", [{ name: "Uncanny Dodge", cost: 0, per: "round" }]));
assert.deepEqual(names(O.optionsFor(rogue, { on: "hit", self: true }, O.TESTS)), ["Uncanny Dodge"]);
assert.deepEqual(names(O.optionsFor(rogue, { on: "hit", self: false, feet: 5 }, O.TESTS)), []);

/* Misdirect: costs 1 Glamour (none left: no button); for an ally within 30ft only from Illusionist 5th. */
const glamour = (lvl, left) => actor(cls("Illusionist", lvl), feat("Glamour", [{ name: "Misdirect", cost: 1 }, { name: "Phantom Wound", cost: 1 }], { count: { value: left, max: 3 } }));
assert.deepEqual(names(O.optionsFor(glamour(1, 2), { on: "hit", self: true }, O.TESTS)), ["Misdirect"]);
assert.deepEqual(names(O.optionsFor(glamour(1, 0), { on: "hit", self: true }, O.TESTS)), [], "no Glamour left");
assert.deepEqual(names(O.optionsFor(glamour(4, 2), { on: "hit", self: false, feet: 20 }, O.TESTS)), [], "an ally's hit: from 5th");
assert.deepEqual(names(O.optionsFor(glamour(5, 2), { on: "hit", self: false, feet: 20 }, O.TESTS)), ["Misdirect"]);
assert.deepEqual(names(O.optionsFor(glamour(5, 2), { on: "hit", self: false, feet: 35 }, O.TESTS)), [], "beyond 30ft");

/* Deflect: missiles; melee from Monk 5th; magical missiles from 10th. */
const monk = l => actor(cls("Monk", l), feat("Deflect (Dexterity)", [{ name: "Deflect", cost: 0 }]));
assert.equal(O.optionsFor(monk(2), { on: "hit", self: true, melee: false }, O.TESTS).length, 1);
assert.equal(O.optionsFor(monk(2), { on: "hit", self: true, melee: true }, O.TESTS).length, 0);
assert.equal(O.optionsFor(monk(5), { on: "hit", self: true, melee: true }, O.TESTS).length, 1);
assert.equal(O.optionsFor(monk(5), { on: "hit", self: true, magical: true }, O.TESTS).length, 0);
assert.equal(O.optionsFor(monk(10), { on: "hit", self: true, magical: true }, O.TESTS).length, 1);

/* Primeval Will when damage takes you to half; Heaven's Answer on any damage, if 2 Channel uses are left. */
const barb = actor(cls("Barbarian", 4), feat("Primeval Will", [{ name: "Primeval Will", cost: 1 }], { count: { value: 1, max: 1 } }));
assert.equal(O.optionsFor(barb, { on: "half", self: true }, O.TESTS).length, 1);
assert.equal(O.optionsFor(barb, { on: "hurt", self: true }, O.TESTS).length, 0);
const pal = left => actor(cls("Paladin", 6), feat("Channel Divinity (Charisma)", [{ name: "Smite", cost: 1 }, { name: "Heaven's Answer: halve damage", cost: 2 }], { count: { value: left, max: 4 } }));
assert.equal(O.optionsFor(pal(2), { on: "hurt", self: true }, O.TESTS).length, 1);
assert.equal(O.optionsFor(pal(1), { on: "hurt", self: true }, O.TESTS).length, 0, "Heaven's Answer costs 2");

/* Mercy's Reach: an ally dropping to 0 within the aura (10ft, 30ft from 15th). */
assert.deepEqual([O.auraFeet(10), O.auraFeet(15), O.auraFeet(20)], [10, 30, 50]);
const loh = l => actor(cls("Paladin", l), feat("Lay on Hands", [{ name: "Heal", cost: 1 }, { name: "Mercy's Reach", cost: 0, per: "encounter" }]));
assert.equal(O.optionsFor(loh(10), { on: "down", self: false, feet: 10 }, O.TESTS).length, 1);
assert.equal(O.optionsFor(loh(10), { on: "down", self: false, feet: 20 }, O.TESTS).length, 0);
assert.equal(O.optionsFor(loh(15), { on: "down", self: false, feet: 20 }, O.TESTS).length, 1);

/* Movement: an Attack of Opportunity when an enemy leaves your reach; Run Them Down only while raging. */
const fighter = actor(cls("Fighter", 8), feat("Combat Reflexes", [{ name: "Attack of Opportunity", cost: 0, per: "round" }]), feat("Hold Ground"));
assert.deepEqual(names(O.optionsFor(fighter, { on: "leave", self: true }, O.TESTS)), ["Attack of Opportunity"]);
assert.deepEqual(names(O.optionsFor(fighter, { on: "endNear", self: true }, O.TESTS)), ["Hold Ground"]);
// The Fighter's own Combat Reflexes (no option of its own) is offered as itself.
assert.deepEqual(names(O.optionsFor(actor(feat("Combat Reflexes")), { on: "leave", self: true }, O.TESTS)), ["Combat Reflexes"]);
const raider = on => actor(cls("Barbarian", 1), feat("Run Them Down"), { type: "ability", name: "Rage", system: { toggle: true, active: on } });
assert.equal(O.optionsFor(raider(true), { on: "leave", self: true }, O.TESTS).length, 1);
assert.equal(O.optionsFor(raider(false), { on: "leave", self: true }, O.TESTS).length, 0);

/* Knight's Riposte: only when the attacker is the knight's Challenged foe. */
const knight = actor(cls("Knight", 4), feat("Knight's Riposte"));
const challenged = { effects: [{ name: "Challenged", origin: "Actor.pc.Item.c" }] };
assert.equal(O.optionsFor(knight, { on: "attack", self: false, feet: 5, attacker: challenged }, O.TESTS).length, 1);
assert.equal(O.optionsFor(knight, { on: "attack", self: false, feet: 5, attacker: { effects: [] } }, O.TESTS).length, 0);

/* A feature it doesn't have, or an option it hasn't got yet (not in availableActivities): no button. */
assert.equal(O.optionsFor(actor(cls("Rogue", 1)), { on: "hit", self: true }, O.TESTS).length, 0);
assert.equal(O.optionsFor(actor(feat("Flourish Manoeuvres", [{ name: "Riposte", cost: 0 }])), { on: "hit", self: true, melee: true }, O.TESTS).length, 0);

/* The card: one button per option, naming the option. */
const html = O.promptHtml({ name: "Vex", uuid: "Actor.pc" }, "A goblin hit you.", O.optionsFor(swash, { on: "hit", self: true, melee: true }, O.TESTS));
assert.match(html, /arn-oot-use[^>]+data-act="Parry"/);
assert.match(html, /Vex: out of turn\?/);

console.log("outofturn: ok");

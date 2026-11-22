// R-F50 (K213, K221): riders on a hit. Which the attacker has, and which are still free.
import assert from "node:assert/strict";
import "./harness.mjs";
const R = await import("../arneyan/module/riders.mjs");

const feat = (name, acts = [], system = {}) => ({ type: "ability", name, id: name.replace(/\W/g, ""), system: { activities: acts, ...system }, availableActivities: acts });
const cls = (name, levels) => ({ type: "class", name, system: { levels } });
const pc = (...items) => ({ type: "character", uuid: "Actor.pc", items, system: { details: { size: "medium" } } });
const sword = { type: "weapon", name: "Sword, Long", system: { damage: "1d8", damageType: "slashing", ranged: false, group: "bind" } };
const axe = { type: "weapon", name: "Axe, Battle", system: { damage: "1d8+1", damageType: "slashing", ranged: false, group: "hew" } };
const bow = { type: "weapon", name: "Bow, Long", system: { damage: "1d8", damageType: "piercing", ranged: true, group: "pinning fire" } };
const keys = list => [...new Set(list.map(r => r.key))];

assert.equal(R.weaponDiceOf(axe), "1d8");

/* Fighter: the group manoeuvre only with the Specialisation group's weapons; Press the Advantage on melee hits;
   the Fighter Manoeuvres learned. */
const fm = [{ name: "Intimidating Strike", kind: "save", save: "will" }, { name: "Feint and Strike", kind: "note" }];
const fighter = pc(cls("Fighter", 4), feat("Weapon Specialisation", [], { optionChoice: { value: ["Bind"] } }), feat("Weapon Training"), feat("Press the Advantage"), feat("Fighter Manoeuvres", fm));
let list = R.ridersFor(fighter, sword, null);
assert.deepEqual(keys(list), ["weapon-training", "press-the-advantage", "fm-Intimidating Strike", "fm-Feint and Strike"]);
assert.equal(list[0].contest, "disarm");
assert.equal(list.filter(r => r.key === "press-the-advantage").length, 3, "Trip, Disarm or Dirty Trick");
assert.ok(!keys(R.ridersFor(fighter, axe, null)).includes("weapon-training"), "a Hew weapon isn't the Bind group");
assert.ok(!keys(R.ridersFor(fighter, bow, null)).includes("press-the-advantage"), "Press the Advantage is melee only");

/* One rider per hit, unless one names the other; once a round each (Brutal twice from 8th). */
let free = R.freeRiders(list, {}, null);
assert.ok(Object.values(free).every(Boolean));
free = R.freeRiders(list, {}, "weapon-training");
assert.equal(free["weapon-training"], false); assert.equal(free["fm-Feint and Strike"], false, "one rider per hit");
free = R.freeRiders(list, { "fm-Feint and Strike": 1 }, null);
assert.equal(free["fm-Feint and Strike"], false, "used this round"); assert.equal(free["weapon-training"], true);
const joined = [{ key: "hunters-tricks", joins: ["favoured-enemy"] }, { key: "favoured-enemy", joins: ["hunters-tricks"] }, { key: "x" }];
assert.deepEqual(R.freeRiders(joined, {}, "hunters-tricks"), { "hunters-tricks": false, "favoured-enemy": true, x: false });
assert.deepEqual(R.freeRiders([{ key: "brutal", times: 2 }], { brutal: 1 }, null), { brutal: true });
assert.deepEqual(R.freeRiders([{ key: "brutal", times: 2 }], { brutal: 2 }, null), { brutal: false });

/* Ranger: Hunter's Tricks only against your marked prey; the Favoured Enemy die from the weapon's dice. */
const ranger = pc(cls("Ranger", 3), feat("Hunter's Tricks", [{ name: "Hamstring" }, { name: "Pin" }, { name: "Expose" }]), feat("Favoured Enemy"));
const prey = { effects: [{ name: "Marked Prey", origin: "Actor.pc.Item.m" }], system: { details: {} } };
assert.deepEqual(keys(R.ridersFor(ranger, bow, prey)), ["hunters-tricks", "favoured-enemy"]);
assert.deepEqual(keys(R.ridersFor(ranger, bow, { effects: [] })), ["favoured-enemy"]);
assert.equal(R.ridersFor(ranger, bow, null).find(r => r.key === "favoured-enemy").damage.formula, "1d8");

/* Barbarian: Brutal and Terrifying and Cleaving Fury only while raging; Brutal not on a creature two sizes bigger. */
const barb = on => pc(cls("Barbarian", 15), { type: "ability", name: "Rage", system: { toggle: true, active: on } },
  feat("Rage Styles", [{ name: "Brutal", kind: "save", save: "fort" }, { name: "Terrifying", kind: "note" }]), feat("Intimidate"), feat("Cleaving Fury"));
assert.deepEqual(keys(R.ridersFor(barb(false), axe, null)), []);
list = R.ridersFor(barb(true), axe, { system: { details: { size: "medium" } } });
assert.deepEqual(keys(list), ["brutal", "terrifying", "cleaving-fury"]);
assert.equal(list[0].times, 2, "Brutal on two hits from 8th");
assert.equal(list.find(r => r.key === "cleaving-fury").damage.formula, "1d8+4", "weapon dice plus the Rage bonus from 15th");
assert.ok(!keys(R.ridersFor(barb(true), axe, { system: { details: { size: "huge" } } })).includes("brutal"));

/* Paladin and Spellblade: Blessed Weapon's radiant die; Spellstrike's highest cantrip tier. */
const pal = pc(cls("Paladin", 5), feat("Blessed Weapon", [{ name: "Blessed Weapon", kind: "damage", formula: "1d6", damageType: "radiant" }]));
list = R.ridersFor(pal, sword, null);
assert.deepEqual(list.map(r => [r.key, r.damage.formula, r.damage.type]), [["blessed-weapon", "1d6", "radiant"]]);
assert.deepEqual(list[0].joins, ["smite"]);
const sb = pc(cls("Spellblade", 5), feat("Spellstrike", [{ name: "Cantrip Spellstrike (1d4)", formula: "1d4" }, { name: "Cantrip Spellstrike (2d4)", formula: "2d4" }, { name: "Levelled Spellstrike (1st-2nd)", formula: "1d6" }]));
list = R.ridersFor(sb, sword, null);
assert.deepEqual(list.map(r => r.label), ["Cantrip Spellstrike (2d4)", "Levelled Spellstrike (1st-2nd)"]);
assert.ok(list.every(r => r.damage.noCrit), "the spell's dice aren't maximised on a critical");

/* Did the card hit? */
assert.equal(R.cardHit({ total: 15, natural: 10, targets: [{ uuid: "a", ac: 14 }] }).hit, true);
assert.equal(R.cardHit({ total: 13, natural: 10, targets: [{ uuid: "a", ac: 14 }] }).hit, false);
assert.equal(R.cardHit({ total: 15, natural: 10, targets: [{ uuid: "a", ac: 18 }, { uuid: "b", ac: 12 }] }).target.uuid, "b");

/* The row: a button per rider, the used ones disabled. */
const html = R.ridersHtml([{ key: "a", label: "Bind", text: "x" }, { key: "b", label: "Trip", text: "y" }], { a: true, b: false });
assert.doesNotMatch(html, /data-index="0" disabled/); assert.match(html, /data-index="1" disabled/);
assert.equal(R.ridersFor({ type: "npc", items: [] }, sword, null).length, 0, "monsters have no rider row");

console.log("riders: ok");

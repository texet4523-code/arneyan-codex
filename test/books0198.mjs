// HB 0.10.97, M&T 0.10.93 and KK 0.5.10 in the system (0.10.140, S-F13 and S-F14).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

// S-F14 (R-F56, K317): M&T's cost table has four bands by party Level.
const { TIERS, costRow, creatureCost, encounterBudget } = await import("../arneyan/module/encounter.mjs");
assert.equal(TIERS.length, 4);
assert.equal(costRow(1), TIERS[0].cost); assert.equal(costRow(4), TIERS[0].cost); assert.equal(costRow(5), TIERS[1].cost);
assert.equal(costRow(12), TIERS[2].cost); assert.equal(costRow(13), TIERS[3].cost); assert.equal(costRow(25), TIERS[3].cost);
const row = (p, ...want) => // Levels p−5 to p+4; Level 0 or less is Level −3, so free at 4th
  assert.deepEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4].map(g => creatureCost(p + g, p)), want, `party ${p}`);
// 1st to 4th: Levels below 1 cost as the book says (½ as −1, ¼ or 0 as −3), so read that band's lower end from the row.
assert.deepEqual([-5, -4].map(g => TIERS[0].cost[String(g)]), [0.25, 0.25]);
assert.equal(creatureCost(0, 4, "½"), 0.25, "½ is Level −1: 5 below a 4th-level party");
row(4, 0, 0, 1 / 3, 1 / 3, 2 / 3, 1, 1.5, 2, 2, 3);
row(8, 0.25, 0.25, 1 / 3, 0.5, 2 / 3, 1, 1.25, 1.25, 1.75, 2);
row(10, 1 / 3, 0.5, 0.5, 2 / 3, 1, 1, 1.25, 1.25, 1.25, 1.75);
row(15, 0.5, 0.5, 0.75, 1, 1, 1, 1, 1, 1, 1.25);
assert.equal(creatureCost(15, 10), null, "more than 4 above is too strong");
// Far below: free (up to the party's number) at 12th or lower; ½ each, counting for crowds, at 13th and up.
assert.equal(creatureCost(6, 12), 0); assert.equal(creatureCost(1, 12), 0);
assert.equal(creatureCost(7, 13), 0.5); assert.equal(creatureCost(1, 20), 0.5);
let eb = encounterBudget([13, 13, 13, 13], [{ name: "Ogre", level: 7, count: 5 }]);
assert.equal(eb.total, 5 * 0.5 + 0.5, "five at ½; the fifth beyond the party's four doubles");
assert.ok(!eb.warnings.some(w => w.includes("no cost")), "no free creatures at 13th");
eb = encounterBudget([8, 8, 8, 8], [{ name: "Kobold", level: 2, count: 6 }]);
assert.equal(eb.total, 2 * 0.25, "four free; two at ¼ (not yet a crowd: only the paid ones count)");
// The fractions show as the book prints them.
const src = fs.readFileSync(new URL("../arneyan/module/encounter.mjs", import.meta.url), "utf8");
for (const f of ["⅔", "1¼", "1¾"]) assert.ok(src.includes(f), f);
console.log("OK S-F14 cost table");

// S-F13 (R-S27, K316): Thieves' Tools, the pack prices and the gear text.
const edir = new URL("../packs-src/equipment/", import.meta.url);
const eq = Object.fromEntries(fs.readdirSync(edir).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(new URL(f, edir), "utf8"))).map(d => [d.name, d]));
assert.ok(eq["Thieves' Tools"]); assert.equal(eq["Thieves' Tools"].system.price, "1 gp"); assert.equal(eq["Thieves' Tools"].system.slots, 1);
assert.match(eq["Thieves' Tools"].system.description, /Lockpicking and Traps/);
assert.match(eq["Lockpicks (Expanded)"].system.description, /full set of thieves' tools/);
assert.ok(!/Advantage/.test(eq["Bandages"].system.description), "Bandages no longer give Advantage");
assert.match(eq["Herbal Medications Case"].system.description, /disease/);
const { STARTING_PACKS } = await import("../arneyan/module/starting.mjs");
const pack = n => STARTING_PACKS.find(p => p.name === n);
assert.equal(pack("Dungeoneer's Pack").sp, 9);
assert.equal(pack("Healer's Satchel").sp, 17);
assert.deepEqual(pack("Healer's Satchel").items, [["Knife Kit", 1], ["Balm Kit", 1], ["Bandages", 1]]);
for (const [n] of pack("Healer's Satchel").items) assert.ok(eq[n], `${n} is in the equipment pack`);
console.log("OK S-F13 gear");

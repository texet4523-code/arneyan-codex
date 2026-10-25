// Batch 6 (0.10.51): foraging and the camp checks (camp.mjs).
import assert from "node:assert/strict";
import fs from "node:fs";
import { hbs } from "./harness.mjs";
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

/* Batch 6b: watches from 10pm to 6am. */
const len = n => C.watchSlots(n).map(w => w.minutes);
assert.deepEqual([len(1), len(2), len(3), len(4), len(5)], [[480], [240, 240], [160, 160, 160], [120, 120, 120, 120], [120, 120, 120, 120]]);
assert.deepEqual(C.watchSlots(3).map(w => `${C.hm(w.start)}-${C.hm(w.end)}`), ["22:00-00:40", "00:40-03:20", "03:20-06:00"]);
assert.deepEqual(C.defaultWatch(["a", "b", "c", "d", "e"], 5), [["a", "e"], ["b"], ["c"], ["d"]], "five: four watches, the first a pair");
assert.deepEqual(C.defaultWatch(["a", "b", "c"], 2), [["a"], ["b"]], "only those on watch stand one");
// Where the night is, and the clock moves for Next / Previous watch (4 watches of 2 h).
assert.deepEqual(C.nightAt(23 * 60, 4), { night: true, index: 0, into: 60 });
assert.deepEqual(C.nightAt(1 * 60, 4), { night: true, index: 1, into: 180 });
assert.equal(C.nightAt(12 * 60, 4).night, false);
assert.equal(C.watchMove(12 * 60, 4, 1), 600, "noon: on to 10pm");
assert.equal(C.watchMove(22 * 60, 4, 1), 120, "10pm: to midnight");
assert.equal(C.watchMove(23 * 60, 4, 1), 60, "11pm: to midnight");
assert.equal(C.watchMove(5 * 60, 4, 1), 60, "last watch: to 6am");
assert.equal(C.watchMove(1 * 60, 4, -1), -60, "1am: back to midnight (this watch's start)");
assert.equal(C.watchMove(0, 4, -1), -120, "midnight: back to 10pm");
assert.equal(C.watchMove(22 * 60, 4, -1), 0, "the first watch: nowhere to go");
assert.equal(C.watchMove(6 * 60, 4, -1), -120, "just after 6am: back to the last watch");
// The activities: Kieran's list, each with its check; keeping watch is Perception, a Wisdom check (not a skill).
assert.deepEqual(C.CAMP_ACTIVITIES.map(a => a.id), ["watch", "forage", "hunt", "cook", "tend", "repair", "scout", "make"]);
const watch = C.CAMP_ACTIVITIES[0];
assert.equal(watch.ability, "wis"); assert.deepEqual(watch.skills, []);
assert.equal(C.canHunt({ items: [{ type: "weapon", name: "Bow", system: { ranged: true } }] }), true);
assert.equal(C.canHunt({ items: [{ type: "equipment", name: "Hunting Traps", system: {} }] }), true);
assert.equal(C.canHunt({ items: [{ type: "weapon", name: "Sword", system: { ranged: false } }] }), false);
// The tab.
const members = ["Ana", "Bo", "Cy"].map((name, i) => ({ id: `m${i}`, name }));
const ctx = C.campContext({ flags: { arneyan: { camp: { mode: true, onWatch: 3 } } } }, members, 60);
assert.equal(ctx.camp.watches.length, 3);
assert.ok(ctx.camp.watches[1].now && ctx.camp.watches[1].names === "Bo", "1am: the second watch, Bo's");
const root = new URL("../arneyan/", import.meta.url).pathname;
const html = hbs(root)("templates/actor/camp-tab.hbs", { ...ctx, isGM: true });
for (const s of ['data-action="campNextWatch"', 'data-action="campPrevWatch"', 'data-action="campNightCheck"', 'data-activity="hunt"', "22:00 to 00:40", "Bo", 'name="flags.arneyan.camp.onWatch"']) assert.ok(html.includes(s), s);
assert.ok(!html.includes("—"), "no em dashes");
const party = fs.readFileSync(new URL("../arneyan/templates/actor/party-sheet.hbs", import.meta.url), "utf8");
assert.ok(party.includes('data-tab="camp"') && party.includes("camp-tab.hbs"));
console.log("OK camp tab");

/* Batch 6c: the menu puts members on watches and activities. */
const camp = { onWatch: 3, assign: { m0: { watch: "3", job: "cook" }, m1: { watch: "1", job: "forage" }, m2: { watch: "1", job: "" } } };
assert.deepEqual(C.watchList(camp, members, 3), [["m1", "m2"], [], ["m0"]], "as assigned (a pair on watch 1, nobody on 2)");
assert.deepEqual(C.watchList({ onWatch: 2, assign: { m0: { watch: "3" } } }, members, 2), [[], []], "a watch past the night's count is left out");
assert.deepEqual(C.watchList({ assign: {} }, members, 3), [["m0"], ["m1"], ["m2"]], "nobody assigned: in order");
assert.deepEqual(C.onJob(camp, members, "forage").map(m => m.id), ["m1"]);
const ctx2 = C.campContext({ flags: { arneyan: { camp } } }, members, 23 * 60);
assert.equal(ctx2.camp.watches[0].names, "Bo and Cy");
assert.equal(ctx2.camp.activities.find(a => a.id === "cook").who, "Ana");
assert.equal(ctx2.camp.activities.find(a => a.id === "watch").who, "Bo, Cy", "11pm: watch 1 stands it");
const html2 = hbs(root)("templates/actor/camp-tab.hbs", { ...ctx2, isGM: true });
for (const s of ['name="flags.arneyan.camp.assign.m0.watch"', 'name="flags.arneyan.camp.assign.m1.job"', "Not on watch", "Resting", "Watch 3 (03:20)"]) assert.ok(html2.includes(s), s);
console.log("OK camp menu");

// Books HB v0.10.48 and M&T v0.10.45 (B-F35, B-F36; K54 and K55) in the system (0.10.86).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
for (const k of ["Actor", "Item", "Combatant", "ChatMessage"]) globalThis[k] ??= class {};

const DT = await import("../arneyan/module/downtime.mjs");
const T = await import("../arneyan/module/treasure.mjs");
const read = (dir, prefix) => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith(prefix))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const src = p => fs.readFileSync(new URL(`../arneyan/${p}`, import.meta.url), "utf8");

/* K54: no skill slots; learning is downtime with a check. */
const skill = (id, name, tier, ability = "wis") => ({ id, type: "skill", name, system: { tier, ability } });
const pc = (items = [], level = 3) => ({ items, system: { level, casters: [] } });
let p = DT.planDowntime("learnSkill", { skillName: "Animal Training", ability: "wis" }, pc());
assert.equal(DT.planDowntime("learnSkill", { skillName: "Animal Training" }, pc()).check.ability, "", "no attribute picked: the compendium skill's own, looked up when it runs");
assert.ok(DT.planDowntime("learnSkill", {}, pc()).block, "nothing picked or typed: nothing charged");
assert.ok(DT.planDowntime("learnSkill", { skillName: "riding" }, pc([skill("s1", "Riding", "master")])).block, "already Master");
assert.equal(DT.planDowntime("learnSkill", { skillName: "Riding" }, pc([skill("s1", "Riding", "trained")])).learn.tier, "master", "a typed skill already Trained goes on to Master");
assert.equal(p.days, 14); assert.equal(p.costCp, 5000, "Trained: 2 weeks at 25 gp");
assert.deepEqual([p.check.ability, p.check.dc], ["wis", 10]);
assert.deepEqual(p.retry, { days: 7, costCp: 2500 }, "a failure: 1 more week and its gold");
assert.deepEqual(p.learn, { skillId: "", name: "Animal Training", ability: "wis", tier: "trained" });
p = DT.planDowntime("learnSkill", { skill: "s1" }, pc([skill("s1", "Riding", "trained", "dex")]));
assert.equal(p.days, 28); assert.equal(p.costCp, 20000, "Master: 4 more weeks at 50 gp");
assert.deepEqual([p.check.ability, p.check.dc, p.learn.tier], ["dex", 15, "master"]);
p = DT.planDowntime("learnSkill", { skillName: "Swimming", ability: "str" }, pc([{ id: "f", type: "feat", name: "Skilled", system: {} }]));
assert.equal(p.days, 7); assert.equal(p.costCp, 2500, "Skilled: half the time (and the weekly gold)");
assert.deepEqual([1, 4, 5, 10, 11, 16, 17, 24].map(DT.trainedFeatGold), [750, 750, 1500, 1500, 3000, 3000, 6000, 6000]);
p = DT.planDowntime("train", { training: "feat", what: "Power Attack", ability: "str" }, pc([], 12));
assert.equal(p.days, 84); assert.equal(p.costCp, 300000, "Tier 3: 3,000 gp");
assert.deepEqual([p.check.ability, p.check.dc], ["str", 15]);
assert.deepEqual(p.retry, { days: 14, costCp: 50000 }, "2 more weeks at the same weekly rate");
assert.equal(DT.planDowntime("train", { training: "weapon" }, pc()).check, null, "weapon training: no check");
const model = src("module/data/actor-models.mjs");
assert.ok(/max: Infinity/.test(model), "no slot maximum");
assert.ok(!/NWP_LEVELS\.includes/.test(src("module/progression.mjs")), "no skill slot at level-up");

const skilled = read("feats", "items_Skilled_k3")[0];
assert.deepEqual(skilled.system.rules, [], "Skilled no longer adds slots");
assert.ok(/half the time/.test(skilled.system.description));

/* K55: the Secrets. */
const eq = read("equipment", "items_");
const secrets = eq.filter(d => /assets\/icons\/secret-/.test(d.img));
assert.deepEqual(secrets.map(d => d.name).sort(), [...T.SECRETS].sort(), "all 18 as cards");
assert.ok(secrets.every(d => d.system.price === "Unique (never for sale)"));
const tome = secrets.find(d => d.name === "The Black Tome");
assert.deepEqual(tome.flags.arneyan.secret, { weeks: 12, dc: 20, ability: "int", alt: "" });
assert.ok(/Upkeep:/.test(tome.system.description) && /one soul/.test(tome.system.description));
assert.deepEqual(secrets.find(d => d.name === "The Last Form").flags.arneyan.secret, { weeks: 12, dc: 15, ability: "dex", alt: "wis" });
assert.deepEqual(secrets.find(d => d.name === "The Phoenix Draught").flags.arneyan.secret, {}, "drunk, not studied");
const lastForm = read("feats", "items_The_Last_Form_")[0];
assert.equal(lastForm.type, "feat");
assert.deepEqual(lastForm.system.uses, { value: 1, max: 1, per: "encounter" });
assert.ok(/critical hit/.test(lastForm.system.description));
p = DT.planDowntime("studySecret", { secret: "x" }, { items: [{ id: "x", name: "The Black Tome", flags: { arneyan: { secret: { weeks: 12, dc: 20, ability: "int" } } } }], system: { level: 15 } });
assert.equal(p.days, 84); assert.equal(p.costCp, 0);
assert.deepEqual([p.check.ability, p.check.dc], ["int", 20]);
assert.deepEqual(p.retry, { days: 14, costCp: 0 }, "a failure: 2 more weeks");
assert.ok(DT.planDowntime("studySecret", { name: "Something" }, pc()).warn.some(w => /in hand/.test(w)));

/* Dragon hoards: Adult (G) a Secret on 20, Ancient (H) on 19-20; only one that can be carried. */
assert.ok(!T.CARRIED_SECRETS.includes("The Black Forge") && !T.CARRIED_SECRETS.includes("The Evergreen Spring") && T.CARRIED_SECRETS.includes("The Black Tome"));
assert.equal(T.isDragon({ name: "Vermithrax", system: { details: { type: "dragon (chromatic)" } } }), true, "a renamed dragon");
assert.equal(T.isDragon({ name: "Dragon Turtle", system: { details: { type: "monstrosity" } } }), false);
assert.equal(T.isDragon({ name: "Old Red Dragon", system: { details: {} } }), true, "no type: its name");
assert.ok(/if \(plan\.block\)/.test(src("module/downtime.mjs")) && /tries < 40/.test(src("module/downtime.mjs")), "keeps rolling while the gold lasts");
assert.ok(/this\.name === "Skilled"/.test(src("module/documents.mjs")), "Skilled asks for its skill however it arrives");
const roller = d20 => async f => (f === "1d20" ? d20 : (await import("node:crypto")).randomInt(1, 2));
const has = r => r.items.some(i => i.name === "A Secret (GM's choice)");
assert.ok(has(await T.rollTreasure(T.parseTreasureCode("G"), { roll: roller(20), name: "Treasure: Green Dragon, Adult" })), "Adult on 20");
assert.ok(!has(await T.rollTreasure(T.parseTreasureCode("G"), { roll: roller(19), name: "Treasure: Green Dragon, Adult" })), "not on 19");
assert.ok(has(await T.rollTreasure(T.parseTreasureCode("H"), { roll: roller(19), name: "Treasure: Red Dragon, Ancient" })), "Ancient on 19");
assert.ok(!has(await T.rollTreasure(T.parseTreasureCode("H"), { roll: roller(20), name: "Treasure: Storm Giant" })), "only a dragon's hoard");
const card = T.treasureCardHtml(await T.rollTreasure(T.parseTreasureCode("H"), { roll: roller(20), name: "Treasure: Red Dragon, Ancient" }), { uuids: { "The Black Tome": "Compendium.arneyan.equipment.Item.bt" } });
assert.ok(card.includes("@UUID[Compendium.arneyan.equipment.Item.bt]{The Black Tome}"));
console.log("books0148: ok");

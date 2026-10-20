// Drop 4 (time, companions and travel): the pure logic, checked against the books in packs-src.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeItem, makeActor, hbs, sheetContext } from "./harness.mjs";

const root = new URL("../arneyan/", import.meta.url).pathname;
const src = p => new URL(`../packs-src/${p}/`, import.meta.url).pathname;
const docs = pack => fs.readdirSync(src(pack)).filter(f => !f.startsWith("folders_")).map(f => JSON.parse(fs.readFileSync(path.join(src(pack), f), "utf8")));
const strip = h => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
foundry.utils.randomID = () => Math.random().toString(36).slice(2, 18);
foundry.utils.hasProperty = (o, k) => foundry.utils.getProperty(o, k) !== undefined;

const { ARNEYAN } = await import("../arneyan/module/config.mjs");
const IM = await import("../arneyan/module/data/item-models.mjs");
const { CharacterData, NpcData, PartyData } = await import("../arneyan/module/data/actor-models.mjs");
const T = await import("../arneyan/module/worldtime.mjs");
const S = await import("../arneyan/module/summons.mjs");
const C = await import("../arneyan/module/companions.mjs");
const D = await import("../arneyan/module/downtime.mjs");
const V = await import("../arneyan/module/travel.mjs");

const spells = new Map(docs("spells").map(d => [d.name, d]));
const monsters = docs("monsters").filter(d => d.type === "npc");
const index = monsters.map(d => ({ uuid: `Compendium.arneyan.monsters.Actor.${d._id}`, name: d.name, img: d.img, level: d.system.level, levelText: d.system.details.levelText, type: d.system.details.type }));
const byName = new Map(index.map(e => [e.name, e]));

/* ---------------- Game time ---------------- */
// A round is 6 seconds and 10 rounds a minute (Codex).
assert.equal(T.ROUND * 10, T.MINUTE);
assert.equal(T.spellDurationSeconds(spells.get("Summon Monster").system.description, 5), 30, "1 round per level");
assert.equal(T.spellDurationSeconds(spells.get("Bless").system.description, 9), 60, "Bless: 1 minute");
assert.equal(T.spellDurationSeconds(spells.get("Summon Animals").system.description, 7), 7 * 60, "1 minute per level");
assert.equal(T.spellDurationSeconds(spells.get("Summon Familiar").system.description, 3), 0, "casting time and the week's wait are not durations");
assert.equal(T.spellDurationSeconds("Stunned for 1d4 rounds", 3), 0, "dice durations are rolled, not read");
assert.equal(T.durationsInText("10 minutes per level")[0].seconds(4), 2400);
assert.equal(T.durationsInText("for 1 day/level")[0].seconds(2), 2 * T.DAY);
assert.equal(T.endsAtFor({ flags: { arneyan: { rounds: 10 } } }, 1000), 1060, "rounds from a spell's effect");
assert.equal(T.endsAtFor({ duration: { seconds: 3600, startTime: 500 } }, 1000), 4100, "an effect's own seconds");
assert.equal(T.endsAtFor({ duration: { rounds: 3 } }, 0), 18);
assert.equal(T.endsAtFor({}, 0, { spellText: "Touch; 10 minutes per level.", cl: 3 }), 1800);
assert.equal(T.endsAtFor({}, 0), null, "no duration, no end");
assert.equal(T.endsAtFor({ flags: { arneyan: { endsAt: 77 } } }, 0), 77);
globalThis.game.combats = new Map([["c1", { started: true, round: 2, turn: 0 }]]);
const effs = [
  { id: "a", name: "Haste", flags: { arneyan: { endsAt: 100 } } },
  { id: "b", name: "Bless", flags: { arneyan: { endsAt: 500 } } },
  { id: "c", name: "Shield", flags: { arneyan: { endsAt: 50, expires: { combat: "c1", round: 5, turn: 0 } } } },
  { id: "d", name: "Old fight", flags: { arneyan: { endsAt: 50, expires: { combat: "gone", round: 5, turn: 0 } } } }
];
assert.deepEqual(T.expiredEffects({ effects: { contents: effs } }, 200).map(e => e.id), ["a", "d"], "a running combat keeps timing its own effects");
assert.equal(T.roundsIn(600), 100);
assert.equal(T.roundsIn(5), 0);
assert.equal(T.formatSpan(30), "5 rounds");
assert.equal(T.formatSpan(540), "9 min");
assert.equal(T.formatSpan(5400), "1 h 30 min");
assert.equal(T.formatSpan(3 * T.DAY), "3 days");
assert.equal(T.gameWhen(T.DAY + 3600 + 600), "Day 2, 01:10");
assert.equal(T.timeLeftLabel({ flags: { arneyan: { endsAt: 600 } } }, 60), "9 min left");
assert.deepEqual(T.STEPS.map(s => s.seconds), [600, 3600, 8 * 3600, T.DAY]);

/* ---------------- Summoning ---------------- */
for (const [name, spec] of Object.entries(S.SUMMON_SPELLS)) {
  const sp = spells.get(name);
  assert.ok(sp, `${name} is in the Spells compendium`);
  const text = strip(sp.system.description);
  for (const o of spec.options) if (o.max < 99) assert.ok(text.includes(`Level ${o.max} or lower`), `${name}: Level ${o.max} from its text`);
  for (const o of spec.options) if (/d/.test(o.count ?? "")) assert.ok(text.includes(o.count), `${name}: ${o.count} from its text`);
  for (const o of spec.options) if (o.totalLevels) assert.ok(text.includes(`max ${o.totalLevels}`), `${name}: total cap`);
  const per = `1 ${spec.duration.unit} per level`;
  assert.ok(text.includes(per), `${name}: ${per}`);
  assert.equal(S.summonSeconds(spec, 6), T.spellDurationSeconds(sp.system.description, 6) || S.summonSeconds(spec, 6), `${name}: duration agrees with its text`);
  assert.equal(!!spec.concentration, !!sp.system.concentration, `${name}: concentration`);
  const cands = S.candidates(spec, spec.options[0], index);
  assert.ok(cands.length > 0, `${name} has creatures to call`);
}
for (const n of S.ATTACKER_SPELLS) assert.ok(spells.has(n), `${n} is a spell`);
assert.equal(S.creatureLevel(0, "½"), 0.5);
assert.equal(S.creatureLevel(4, ""), 4);
const anim = S.SUMMON_SPELLS["Summon Animals"];
const wolf = byName.get("Wolf"), boar = byName.get("Boar"), bear = index.find(e => e.type === "beast" && S.creatureLevel(e.level, e.levelText) <= 4 && S.creatureLevel(e.level, e.levelText) >= 2);
assert.ok(S.fitsFilter("animal", wolf) && !S.fitsFilter("animal", byName.get("Imp")) && !S.fitsFilter("animal", byName.get("Rat Swarm")));
assert.equal(S.checkPicks(anim, anim.options[0], [{ entry: wolf, count: 4 }], 2), "", "four wolves (½ each) at caster level 2");
assert.match(S.checkPicks(anim, anim.options[0], [{ entry: wolf, count: 4 }, { entry: bear, count: 1 }], 3), /add up/);
assert.match(S.checkPicks(anim, anim.options[0], [{ entry: byName.get("Imp"), count: 1 }], 9), /kind/);
const mon = S.SUMMON_SPELLS["Summon Monster"];
assert.equal(S.checkPicks(mon, mon.options[0], [{ entry: byName.get("Hell Hound"), count: 1 }], 9), byName.get("Hell Hound").level <= 6 ? "" : `Hell Hound is above Level 6.`);
assert.match(S.checkPicks(mon, mon.options[0], [{ entry: wolf, count: 2 }], 9), /one/);
assert.match(S.checkPicks(mon, mon.options[1], [], 9), /Pick/);
const big = index.find(e => S.creatureLevel(e.level, e.levelText) > 6);
assert.match(S.checkPicks(mon, mon.options[0], [{ entry: big, count: 1 }], 9), /above Level 6/);
assert.ok(S.candidates(S.SUMMON_SPELLS["Summon Elemental"], { max: 10 }, index).every(e => /Elemental$/.test(e.name)));
assert.deepEqual(S.candidates(S.SUMMON_SPELLS["Summon Swarm"], { max: 99 }, index).map(e => e.name).sort(), ["Bat Swarm", "Rat Swarm", "Spider Swarm"]);
// Pact Summons: every Warlock kit has a path; every servant is in the Bestiary and in the class's Shared Summons table.
const warlock = docs("classes").find(d => d.name === "Warlock");
const wtext = strip(warlock.system.description);
for (const k of docs("kits").filter(d => d.system.className === "Warlock")) assert.ok(S.pactPath([k.name]), `${k.name} has a path`);
assert.equal(S.pactPath(["Graz'zt (Warlock)"]), "abyss");
for (const p of Object.values(S.PACT_PATHS)) {
  assert.ok(wtext.includes(p.label), p.label);
  for (const names of p.pool) {
    for (const n of names) assert.ok(byName.has(n), `${n} is in the Bestiary`);
    assert.ok(wtext.includes(names.length > 1 ? `${names[0]} pair` : names[0]), `${names[0]} is in the Warlock's table`);
  }
}
const pactText = strip(docs("class-features").find(d => d.name === "Pact Summons").system.description);
assert.ok(pactText.includes("combat summons uses your action and lasts 1 minute") && pactText.includes("lasts 1 hour") && pactText.includes("double the HP and damage dice"));
assert.deepEqual(S.pactTiers(7).map(t => t.tier), [1, 2]);
assert.deepEqual(S.pactTiers(15).map(t => t.tier), [1, 2, 3]);
assert.deepEqual(S.pactTiers(15, true).map(t => t.slot), [1, 2, 3, 5]);
assert.equal(S.doubleDice("1d4"), "2d4");
assert.equal(S.doubleDice("1d6+2 plus 2d4"), "2d6+2 plus 4d4");
assert.equal(S.doubleDice("1"), "1");
const combats = new Map([["c", { started: true, round: 4, turn: 2 }]]);
assert.equal(S.summonOver({ endsAt: 10, expires: { combat: "c", round: 4, turn: 3 } }, 999, combats), false, "the combat's clock, not the world's");
assert.equal(S.summonOver({ endsAt: 10, expires: { combat: "c", round: 4, turn: 2 } }, 0, combats), true);
assert.equal(S.summonOver({ endsAt: 10, expires: { combat: "ended", round: 9, turn: 0 } }, 10, combats), true, "combat over: the world clock");
assert.equal(S.summonOver({ endsAt: 10 }, 9, combats), false);
const spots = S.freeSpots(5, 5, 1, 1, 1, 1, [{ x: 6, y: 5, w: 1, h: 1 }], 3);
assert.equal(spots.length, 3);
for (const s of spots) {
  assert.ok(Math.max(Math.abs(s.x - 5), Math.abs(s.y - 5)) === 1, "next to the caster");
  assert.ok(!(s.x === 6 && s.y === 5) && !(s.x === 5 && s.y === 5), "never on a taken square");
}
assert.equal(new Set(spots.map(s => `${s.x},${s.y}`)).size, 3);
const large = S.freeSpots(0, 0, 1, 1, 2, 2, [], 1)[0];
assert.ok(large.x + 2 <= 0 || large.x >= 1 || large.y + 2 <= 0 || large.y >= 1, "a large creature doesn't overlap the caster");

/* ---------------- Companions ---------------- */
const cf = name => docs("class-features").find(d => d.name === name);
assert.ok(strip(cf("Familiar").system.description).includes("1 HP per two Witch levels (minimum 1), AC 14"));
assert.ok(strip(cf("Divine Mount").system.description).includes("Warhorse, Light"));
assert.ok(strip(cf("Birthright Mount").system.description).includes("19 HP"));
assert.ok(strip(docs("kits").find(d => d.name === "Beast Master (Ranger)").system.description).includes("HD equal to half your Ranger level (rounded up)"));
for (const p of Object.values(C.COMPANION_PRESETS)) for (const n of p.suggest ?? []) assert.ok(byName.has(n), `${n} is in the Bestiary`);
assert.equal(byName.get("Warhorse, Light") && monsters.find(d => d.name === "Warhorse, Light").system.attributes.hp.max, 19);
const cls = (name, levels) => makeItem(IM.ClassData, "class", name, { levels });
const ab = name => makeItem(IM.AbilityData, "ability", name, {});
const witch = makeActor(CharacterData, "character", { attributes: { hp: { value: 20, max: 20 } } }, [cls("Witch", 5), ab("Familiar")]);
assert.deepEqual(C.presetsFor(witch).map(p => p.key), ["witchFamiliar", "other"]);
let st = C.companionStats("witchFamiliar", witch, {}, { attributes: { hp: { value: 1, max: 1 } } });
assert.equal(st["system.attributes.hp.max"], 2); assert.equal(st["system.attributes.ac"], 14); assert.equal(st["system.attributes.hp.value"], 2, "full stays full");
st = C.companionStats("witchFamiliar", makeActor(CharacterData, "character", {}, [cls("Witch", 1)]), {}, { attributes: { hp: { value: 1, max: 1 } } });
assert.equal(st["system.attributes.hp.max"], 1, "minimum 1");
st = C.companionStats("witchFamiliar", makeActor(CharacterData, "character", {}, [cls("Witch", 9)]), {}, { attributes: { hp: { value: 1, max: 3 } } });
assert.equal(st["system.attributes.hp.value"], 1, "hurt stays hurt");
assert.equal(C.companionStats("wizardFamiliar", witch)["system.attributes.hp.max"], 10, "half the caster's maximum HP");
const ranger = makeActor(CharacterData, "character", {}, [cls("Ranger", 5), ab("Bonded Companion")]);
assert.ok(C.presetsFor(ranger).some(p => p.key === "rangerCompanion") && !C.presetsFor(ranger).some(p => p.key === "witchFamiliar"));
st = C.companionStats("rangerCompanion", ranger, { hd: "2d8" });
assert.equal(st["system.hd"], "3d8"); assert.equal(st["system.attributes.hp.max"], 13);
assert.equal(C.companionStats("rangerCompanion", ranger, { hd: "—" })["system.hd"], "3d8", "a d8 when the stat block gives no Hit Die");
assert.equal(C.averageHp("2d8"), 9); assert.equal(C.averageHp("10d12+50"), 115); assert.equal(C.maxHp("3d8+2"), 26); assert.equal(C.maxHp("—"), 0);
const art = makeActor(CharacterData, "character", {}, [cls("Artificer", 8), ab("Construct Companion")]);
st = C.companionStats("construct", art);
assert.equal(st["system.attributes.ac"], 16); assert.equal(st["system.hd"], "8d8"); assert.equal(st["system.attributes.attack"], ARNEYAN.bth("martial", 8));
assert.equal(st["system.saves.will"], 4);
assert.equal(C.constructWeapon("striker", 8).system.damage, "1d10+2");
assert.equal(C.constructWeapon("scout", 3).system.damage, "1d6");
const pal = makeActor(CharacterData, "character", {}, [cls("Paladin", 4)]);
assert.deepEqual(C.presetsFor(pal).map(p => p.key), ["other"], "no Divine Mount without the feature");
assert.equal(C.presetsFor(pal, { all: true }).length, Object.keys(C.COMPANION_PRESETS).length);
const wiz = makeActor(CharacterData, "character", {}, [cls("Wizard", 1), makeItem(IM.SpellData, "spell", "Summon Familiar", { level: 1 })]);
assert.ok(C.presetsFor(wiz).some(p => p.key === "wizardFamiliar"));

/* ---------------- Downtime ---------------- */
assert.equal(D.toCp({ pp: 1, gp: 2, sp: 3, cp: 4 }), 1234);
assert.deepEqual(D.payCoins({ pp: 0, gp: 10, sp: 0, cp: 5 }, 250), { pp: 0, gp: 7, sp: 5, cp: 5 }, "change in silver");
assert.deepEqual(D.payCoins({ pp: 1, gp: 0, sp: 0, cp: 0 }, 500), { pp: 0, gp: 5, sp: 0, cp: 0 });
assert.equal(D.payCoins({ gp: 1 }, 101), null);
assert.deepEqual(D.addCoins({ pp: 0, gp: 1, sp: 0, cp: 0 }, 180), { pp: 0, gp: 2, sp: 8, cp: 0 });
assert.equal(D.cpText(1810), "18 gp 1 sp");
assert.deepEqual([9, 10, 14, 15, 19, 20, 25].map(D.incomePerDay), [10, 30, 30, 60, 60, 100, 100], "Earn Income tiers");
assert.equal(D.sideQuestResult(3, 7).text, "a minor reward");
assert.equal(D.sideQuestResult(9, 2).text, "a major reward");
assert.equal(D.sideQuestResult(5, 2).text, "a consequence");
const smith = makeItem(IM.SkillData, "skill", "Weaponsmithing", { ability: "str", tier: "trained" });
const msmith = makeItem(IM.SkillData, "skill", "Blacksmithing", { ability: "str", tier: "master" });
const crafter = makeActor(CharacterData, "character", { currency: { gp: 500 } }, [cls("Fighter", 3), smith, msmith]);
let pl = D.planDowntime("craft", { item: "Chain", value: "100", skill: smith.id, tier: "hard", place: "city" }, crafter);
assert.equal(pl.costCp, 5000); assert.equal(pl.days, 4, "a 100 gp item takes 4 days"); assert.equal(pl.check.dc, 15); assert.ok(pl.failHalf);
pl = D.planDowntime("craft", { value: "100", skill: msmith.id, tier: "easy", place: "remote" }, crafter);
assert.equal(pl.costCp, Math.ceil(10000 / 3 * 1.25)); assert.ok(pl.check.master); assert.equal(pl.check.dc, 10);
pl = D.planDowntime("craft", { value: "10", skill: smith.id, tier: "custom", dc: "17", place: "wild" }, crafter);
assert.equal(pl.days, 2, "at least a day, twice as long in the wilderness"); assert.equal(pl.check.dc, 17);
pl = D.planDowntime("magicItem", { value: "450", rarity: "uncommon" }, crafter);
assert.equal(pl.costCp, 22500); assert.equal(pl.days, 7); assert.ok(pl.warn.some(w => /3rd-level/.test(w)), "needs a caster");
pl = D.planDowntime("magicItem", { value: "3000", rarity: "rare" }, crafter);
assert.equal(pl.costCp, 150000); assert.equal(pl.days, 42, "the Codex's Flame Tongue: 1,500 gp and 6 weeks"); assert.equal(pl.check.dc, 20);
pl = D.planDowntime("copySpell", { level: "3" }, crafter); assert.equal(pl.days, 3); assert.equal(pl.costCp, 15000); assert.equal(pl.check, null);
pl = D.planDowntime("scribe", { level: "0" }, crafter); assert.equal(pl.days, 1); assert.equal(pl.costCp, 1000);
pl = D.planDowntime("scribe", { level: "2" }, crafter); assert.equal(pl.days, 14); assert.equal(pl.costCp, 20000);
pl = D.planDowntime("research", { level: "4" }, crafter); assert.equal(pl.days, 28); assert.equal(pl.check.dc, 15);
pl = D.planDowntime("train", { training: "armourHeavy" }, crafter); assert.equal(pl.days, 56); assert.equal(pl.costCp, 50000);
pl = D.planDowntime("learnSkill", { tiers: "2" }, crafter); assert.equal(pl.days, 14); assert.equal(pl.costCp, 5000);
pl = D.planDowntime("income", { skill: smith.id }, crafter); assert.equal(pl.days, 6);
pl = D.planDowntime("brew", { value: "50", skill: smith.id, tier: "hard" }, crafter); assert.ok(pl.warn.some(w => /Alchemy/.test(w)));
pl = D.planDowntime("other", { kind: "Farm", days: "10", cost: "2.5", result: "A good crop" }, crafter);
assert.equal(pl.days, 10); assert.equal(pl.costCp, 250); assert.equal(pl.result, "A good crop");
const caster = makeActor(CharacterData, "character", { abilities: { int: { value: 16 } } }, [{ ...cls("Wizard", 9) }]);
// The rules text these follow.
const book1 = JSON.parse(fs.readFileSync(path.join(src("rules"), fs.readdirSync(src("rules")).find(f => f.startsWith("journal_Book_I_"))), "utf8"));
const page = n => strip(book1.pages.find(p => p.name === n).text.content);
assert.ok(page("Downtime Rules").includes("DC 10 earns 3 sp per day, DC 15 earns 6 sp per day, DC 20 earns 1 gp per day; on a failure you earn 1 sp per day"));
assert.ok(page("Downtime: Crafting").includes("1 day per 25 gp of the item's value"));
assert.match(page("Downtime: Training & Instruction"), /Heavy \(one type\)\s*8 weeks\s*500 gp/);
assert.match(page("Travelling Rules"), /Foot \(with rests\)\s*1 hex\/day\s*2 hexes\/day\s*3 hexes\/day\s*Mounts \/ Vehicles \/ Ships\s*2 hexes\/day\s*3 hexes\/day\s*4 hexes\/day\s*Umbral Journey\s*\S+\s*24 hexes\/day/);

/* ---------------- Travel ---------------- */
assert.equal(V.hexesPerDay("foot", "normal"), 2);
assert.equal(V.hexesPerDay("foot", "normal", true), 1, "difficult terrain: Normal becomes Slow");
assert.equal(V.hexesPerDay("foot", "slow", true), 1);
assert.equal(V.hexesPerDay("mounted", "fast", true), 3);
assert.equal(V.hexesPerDay("umbral", "fast"), 24);
assert.equal(V.daysToGo(7, 0, 2), 4); assert.equal(V.daysToGo(7, 7, 2), 0); assert.equal(V.daysToGo(5, 1, 3), 2);
assert.deepEqual([1, 10, 11, 12].map(V.encounterFor), ["none", "none", "standard", "dangerous"]);
const equip = new Map(docs("equipment").map(d => [d.name, d]));
assert.ok(equip.has("Day's Rations") && equip.has("Week's Rations") && equip.has("Personal Woollen Canteen"));
const gear = (name, sys = {}, flags = {}) => { const it = makeItem(IM.EquipmentData, "equipment", name, { ...equip.get(name)?.system, ...sys }); it.flags = { arneyan: flags }; return it; };
const day = gear("Day's Rations", { quantity: 2 });
const week = gear("Week's Rations", { quantity: 2 }, { meals: 3 });
const can = gear("Personal Woollen Canteen", { quantity: 1 });
const walker = makeActor(CharacterData, "character", { abilities: { con: { value: 14 } } }, [day, week, can]);
walker.flags = { arneyan: { hunger: { food: 0, water: 0 } } };
assert.equal(V.mealsCarried(walker), 2 + 7 + 3, "an open pack counts its meals left");
assert.equal(V.waterCarried(walker), 1);
let meal = V.mealFrom(walker);
assert.equal(meal.item, day); assert.equal(meal.update["system.quantity"], 1);
const noDays = makeActor(CharacterData, "character", {}, [week]);
meal = V.mealFrom(noDays);
assert.equal(meal.update["flags.arneyan.meals"], 2, "a meal from the open pack");
const lastMeal = makeActor(CharacterData, "character", {}, [gear("Week's Rations", { quantity: 3 }, { meals: 1 })]);
meal = V.mealFrom(lastMeal);
assert.equal(meal.update["system.quantity"], 2); assert.equal(meal.update["flags.arneyan.meals"], 7, "the next pack starts full");
assert.equal(V.drinkFrom(walker).update["flags.arneyan.empty"], 1);
assert.equal(V.drinkFrom(makeActor(CharacterData, "character", {}, [gear("Personal Woollen Canteen", {}, { empty: 1 })])), null);
assert.equal(V.foodGrace(2), 5); assert.equal(V.foodGrace(-4), 1);
assert.equal(V.starvation({ food: 5, water: 0 }, 2), 0, "3 + Con days without food are fine");
assert.equal(V.starvation({ food: 6, water: 0 }, 2), 1);
assert.equal(V.starvation({ food: 0, water: 1 }, 2), 1, "a day without water");
assert.equal(V.starvation({ food: 6, water: 2 }, 2), 2);

/* ---------------- Sheets ---------------- */
const render = hbs(root);
globalThis.game.time = { worldTime: 3600 };
globalThis.game.user.isGM = true;
const { ArneyanActorSheet } = await import("../arneyan/module/sheets.mjs");
const hero = makeActor(CharacterData, "character", { abilities: { con: { value: 12 } }, currency: { gp: 30 } }, [cls("Witch", 4), ab("Familiar")]);
hero.id = "hero"; hero.name = "Ilsa";
hero.flags = { arneyan: {
  downtime: [{ id: "e1", key: "craft", activity: "Craft", title: "Nightshade Nectar", days: 4, cost: "50 gp", costCp: 5000, result: "Success: Nightshade Nectar is finished.", roll: "17 vs DC 15", when: "Day 3, 08:00", worldTime: 0 }],
  summon: { name: "Imp", source: "Pact Summons", endsAt: 3600 + 540, tokenIds: [] }
} };
const famData = monsters.find(d => d.name === "Raven");
const fam = makeActor(NpcData, "npc", famData.system, []);
fam.id = "fam"; fam.name = "Raven (Ilsa's familiar)"; fam.img = "raven.svg";
fam.flags = { arneyan: { companion: { master: "hero", preset: "witchFamiliar", kind: "familiar" } } };
const world = [hero, fam];
globalThis.game.actors = { filter: fn => world.filter(fn), get: id => world.find(a => a.id === id), contents: world };
const ctx = await sheetContext(ArneyanActorSheet, hero, { _activeTab: "downtime" });
assert.ok(ctx.tabs.some(t => t.id === "downtime"));
assert.equal(ctx.companions.length, 1);
assert.equal(ctx.summon.left, "9 min left");
let html = render("templates/actor/actor-sheet.hbs", ctx);
assert.ok(html.includes('data-tab="downtime"') && html.includes("Nightshade Nectar") && html.includes("17 vs DC 15") && html.includes('data-action="downtimeNew"'), "the downtime log");
assert.ok(html.includes("arn-companions") && html.includes("Raven (Ilsa&#x27;s familiar)") && html.includes('data-action="companionPlace"'), "the companions box");
assert.ok(html.includes("Imp") && html.includes('data-action="summonDismiss"'), "the summon");
const fctx = await sheetContext(ArneyanActorSheet, fam, {});
html = render("templates/actor/actor-sheet.hbs", fctx);
assert.ok(html.includes("Familiar (Witch) of") && html.includes('data-master-id="hero"'), "a companion names its master");
assert.ok(!html.includes('data-tab="downtime"'), "no downtime for NPCs");
// Party sheet: the Travel tab.
const { ArneyanPartySheet } = await import("../arneyan/module/party.mjs");
const pcs = { id: "pcs", name: "Player Characters", type: "Actor", folder: null };
hero.folder = pcs; hero.testUserPermission = () => true; hero.img = "x.png";
walker.id = "walker"; walker.name = "Bram"; walker.folder = pcs; walker.testUserPermission = () => true; walker.img = "y.png";
world.push(walker);
globalThis.game.folders = { get: id => (id === "pcs" ? pcs : null), find: fn => [pcs].find(fn) };
globalThis.game.settings.get = (scope, key) => (key === "partyFolderId" ? "pcs" : "");
const party = makeActor(PartyData, "party", { currency: { gp: 0 } }, [gear("Day's Rations", { quantity: 3 })]);
party.items.contents = party.items;
party.flags = { arneyan: { travel: { distance: 9, done: 2, method: "foot", pace: "normal", difficult: false, water: false, table: "", day: 1, log: ["Day 1: 2/9 hexes (Normal)."] } } };
const pctx = await sheetContext(ArneyanPartySheet, party, { _activeTab: "travel" });
assert.equal(pctx.travel.days, 4); assert.equal(pctx.travel.perDay, 2);
assert.equal(pctx.travel.needMeals, 8); assert.equal(pctx.travel.haveMeals, 12 + 3);
html = render("templates/actor/party-sheet.hbs", pctx);
assert.ok(html.includes('data-tab="travel"') && html.includes("2 hexes a day") && html.includes("4 days to go") && html.includes('data-action="travelDay"') && html.includes("Day 1: 2/9 hexes"), "the Travel tab");
assert.ok(html.includes("Bram") && html.includes("Food 12 days"), "each member's supplies");

// Player-facing text: UK English, no em dashes.
for (const f of ["worldtime", "summons", "companions", "downtime", "travel", "world"]) {
  const text = fs.readFileSync(path.join(root, "module", `${f}.mjs`), "utf8");
  assert.ok(!text.includes("—"), `${f}.mjs: no em dashes`);
  assert.ok(!/\b(color|armor|honor|favor)\b/i.test(text.replace(/--arn-[\w-]+|color:|\.color|"light\.color"/g, "")), `${f}.mjs: UK spelling`);
}
for (const f of ["companions.hbs", "downtime-tab.hbs", "travel-tab.hbs"]) assert.ok(!fs.readFileSync(path.join(root, "templates/actor", f), "utf8").includes("—"), f);

console.log("OK world");

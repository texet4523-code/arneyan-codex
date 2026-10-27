// 0.10.48: class features whose numbers step up with level (the Codex's progression tables) follow the class level.
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeActor, makeItem } from "./harness.mjs";

const { levelText, isLevelTable, tableNotYet, ModSet, usesMax, collectRules } = await import("../arneyan/module/effects.mjs");
const { CharacterData } = await import("../arneyan/module/data/actor-models.mjs");
const { ARNEYAN } = await import("../arneyan/module/config.mjs");
const feature = name => {
  const dir = new URL("../packs-src/class-features/", import.meta.url);
  const all = fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(new URL(f, dir), "utf8")));
  return (cls) => all.find(d => d.name === name && (!cls || d.system.className === cls));
};

/* levelText: whole tables and tables in braces. */
assert.equal(levelText("1:13, 2:14, 4:15, 7:16", 5), "15");
assert.equal(levelText("1:13, 2:14, 4:15, 7:16", 1), "13");
assert.equal(levelText("9:3, 11:4", 5), "0", "a table that hasn't started gives 0");
assert.equal(levelText("add {1:1d6, 13:2d6, 18:3d6} once a round", 13), "add 2d6 once a round");
assert.equal(levelText("up to {1:2, 6:3} foes and {1:1, 10:2} more", 10), "up to 3 foes and 2 more");
assert.equal(levelText("+2 vs evil", 10), "+2 vs evil", "plain text is left alone");
assert.equal(levelText(2, 10), 2, "numbers are left alone");
assert.equal(levelText("@cl + 1", 10), "@cl + 1");

/* collectRules reads tables at the feature's class level; a table that gives nothing yet is left out. */
const item = (name, className, rules) => ({ type: "ability", name, system: { className, rules }, flags: {} });
const cls = (name, levels) => ({ type: "class", name, system: { levels } });
const rulesAt = (lvl, rules) => collectRules({ items: [cls("Monk", lvl), item("Iron Discipline", "Monk", rules)] }, { level: lvl });
const iron = [{ key: "save", value: "1:1, 3:2, 6:3", when: "vs poison" }, { key: "save", value: "9:3, 11:4", when: "vs charm" }];
assert.deepEqual(rulesAt(4, iron).map(r => r.value), ["2"], "Iron Mind isn't there before 8th");
assert.deepEqual(rulesAt(11, iron).map(r => r.value), ["3", "4"]);

/* ModSet: the biggest dice for a .dice key. */
const ms = new ModSet([{ key: "unarmed.dice", value: "1d8", label: "A" }, { key: "unarmed.dice", value: "1d10", label: "B" }, { key: "unarmed.dice", value: "junk", label: "C" }]);
assert.deepEqual(ms.dice("unarmed.dice"), { label: "B", value: "1d10" });
assert.equal(new ModSet([]).dice("unarmed.dice"), null);
for (const k of ["ac.unarmoured", "speed.base", "unarmed.dice"]) assert.ok(ARNEYAN.allRuleKeys.has(k), k);

/* The Monk, built from the compendium's features at several levels. */
const fast = feature("Fast Movement")("Monk");
const h2h = feature("Hand-to-Hand Combat")("Monk");
const monkAt = (lvl, dex = 14, extra = []) => {
  const items = [cls("Monk", lvl), item(fast.name, "Monk", fast.system.rules), item(h2h.name, "Monk", h2h.system.rules), ...extra];
  return makeActor(CharacterData, "character", { level: lvl, abilities: { dex: { value: dex } } }, items);
};
const m1 = monkAt(1), m7 = monkAt(7), m21 = monkAt(21);
assert.equal(m1.system.attributes.ac.value, 13, "Monk 1st: AC 13, Dexterity not added");
assert.equal(m7.system.attributes.ac.value, 16);
assert.equal(m21.system.attributes.ac.value, 19);
assert.ok(m7.system.attributes.ac.parts.some(p => p.label === "Dex (not added)" && p.value === 0));
assert.equal(monkAt(1, 20).system.attributes.ac.value, 13, "the table value, whatever the Dexterity (Codex)");
const mageArmour = { type: "ability", name: "Mage Armour", system: { rules: [{ key: "ac.base", value: "13" }] }, flags: {} };
assert.equal(monkAt(1, 20, [mageArmour]).system.attributes.ac.value, 13 + 4, "Mage Armour + Dex still wins when higher");
assert.equal(m1.system.attributes.speedNow, 35);
assert.equal(m7.system.attributes.speedNow, 50);
assert.equal(m21.system.attributes.speedNow, 60);
// Armour: the table AC doesn't apply.
const mail = { type: "armour", name: "Chain Mail", system: { category: "medium", ac: 5, magic: 0, equipped: true } };
const armoured = monkAt(7, 14, [mail]);
assert.equal(armoured.system.attributes.ac.value, 10 + 5 + Math.min(2, armoured.system.abilities.dex.mod), "in armour: the armour's AC, not the table");
// Unarmed dice from the table (the actor document picks them; here, the ModSet).
assert.equal(m1.system.mods.dice("unarmed.dice").value, "1d4");
assert.equal(monkAt(2).system.mods.dice("unarmed.dice").value, "1d6");
assert.equal(monkAt(4).system.mods.dice("unarmed.dice").value, "1d8");
assert.equal(m7.system.mods.dice("unarmed.dice").value, "1d10");

/* Uses that step up with level. */
const usesAt = (name, cls, lvl) => usesMax(feature(name)(cls).system.uses.formula, { cl: lvl, level: lvl }, 1);
assert.deepEqual([1, 2, 3, 6, 9, 14, 15, 24].map(l => usesAt("Wild Shape", "Druid", l)), [1, 1, 2, 3, 4, 4, 5, 6], "Wild Shape: 1 a day, 2 from 3rd ... 6 from 24th");
assert.deepEqual([1, 10, 20].map(l => usesAt("Grit", "Gunslinger", l)), [1, 2, 3]);
assert.deepEqual([1, 14, 15].map(l => usesAt("Exhort Greatness", "Bard", l)), [1, 1, 2]);
assert.deepEqual([13, 17, 22].map(l => usesAt("Divine Intervention", "Paladin", l)), [1, 2, 3]);
assert.equal(usesAt("Exalt (Charisma)", "Bard", 7), 7, "Exalt: once a day per level");

/* Text and rules with tables in the data. */
const ruleText = (name, cls, key) => feature(name)(cls).system.rules.find(r => r.key === key).value;
assert.equal(levelText(ruleText("Sneak Attack", "Rogue", "note.damage"), 13), "Sneak Attack: add 2d6 (once per round).");
assert.equal(levelText(ruleText("Sneak Attack", "Assassin", "note.damage"), 24), "Sneak Attack: add 7d6 (once per round).");
assert.match(levelText(ruleText("Back Attack", "Rogue", "note.damage"), 9), /by 4\./);
const sneak = feature("Sneak Attack")("Rogue").system.activities.find(a => a.name === "Sneak Attack damage");
assert.equal(levelText(sneak.formula, 18), "3d6");
assert.match(levelText(feature("Whirlwind Attack")("Barbarian").system.activities[0].text, 10), /up to 4 adjacent/);
// No braces left unread anywhere: every table in text is a well-formed level table.
for (const f of fs.readdirSync(new URL("../packs-src/class-features/", import.meta.url))) {
  const d = JSON.parse(fs.readFileSync(new URL(`../packs-src/class-features/${f}`, import.meta.url), "utf8"));
  if (!d.system) continue;
  const texts = [...(d.system.activities ?? []).flatMap(a => [a.text, a.formula]), ...(d.system.rules ?? []).map(r => String(r.value))];
  for (const t of texts.filter(Boolean)) assert.ok(!/\{|\}/.test(levelText(t, 24)), `${d.name}: ${t}`);
}
// The Monk's unarmed attacks: one button, 1 attack (2 from 6th, 3 from 16th) through the weapon pipeline; the second
// and third with the Secondary and Tertiary dice.
const ua = h2h.system.activities.find(a => a.name === "Unarmed attacks");
assert.equal(ua.kind, "attacks");
assert.equal(ua.weapons, "unarmed");
assert.deepEqual([1, 6, 16].map(l => levelText(ua.count, l)), ["1", "2", "3"]);
const diceAt = l => levelText(ua.formula, l).split(";").map(d => d.trim()).map(d => (/^\d*d\d+$/i.test(d) ? d : ""));
assert.deepEqual(diceAt(1), ["", "", ""]);
assert.deepEqual(diceAt(9), ["", "1d6", ""]);
assert.deepEqual(diceAt(22), ["", "1d10", "1d8"]);
const docsSrc = fs.readFileSync(new URL("../arneyan/module/documents.mjs", import.meta.url), "utf8");
assert.ok(docsSrc.includes('if (k === "unarmed") return /^unarmed strike$/i'), "attacks can pick the Unarmed Strike");
assert.ok(docsSrc.includes("weaponDice: dice") && docsSrc.includes('String(dice ?? "").trim() || this.ownDice(item)'), "an attack's own dice reach its damage");
const chatSrc = fs.readFileSync(new URL("../arneyan/module/chat.mjs", import.meta.url), "utf8");
assert.equal((chatSrc.match(/dice: flags\.weaponDice/g) ?? []).length, 3, "damage, crit and reroll buttons keep the attack's dice");

/* Review fixes. */
// Text is never read as a whole table; only numbers or dice are.
assert.equal(levelText("10:00 curfew: Disadvantage on Stealth", 5), "10:00 curfew: Disadvantage on Stealth");
assert.equal(levelText("3: roll on the table", 5), "3: roll on the table");
assert.ok(isLevelTable("1:1d4, 7:1d10") && isLevelTable("1:-1, 18:-2") && !isLevelTable("6:Aura, 15:x"));
assert.equal(collectRules({ items: [item("Curfew", "", [{ key: "note.check", value: "10:00 curfew: Disadvantage" }])] }, { level: 3 }).length, 1, "a homebrew note that starts with a time stays");
// A reminder whose table starts later is left out until then (Aura of Courage from 2nd, books v0.10.22).
assert.ok(tableNotYet("allies within {6:10ft, 15:30ft}", 5) && !tableNotYet("allies within {6:10ft, 15:30ft}", 6));
const aura = feature("Divine Protection")("Paladin").system.rules.find(r => /Aura of Courage/.test(String(r.value)) && r.key === "note.save");
const pal = lvl => collectRules({ items: [cls("Paladin", lvl), item("Divine Protection", "Paladin", [aura])] }, { level: lvl });
assert.equal(pal(1).length, 0);
assert.equal(pal(2)[0].value, "Aura of Courage: allies within 10ft gain +4 on saves vs fear.");
assert.equal(pal(15)[0].value, "Aura of Courage: allies within 30ft gain +4 on saves vs fear.");
// A shield switches off the table AC ("Armour or a shield replaces the monk's table AC").
const shield = { type: "armour", name: "Shield", system: { category: "shield", ac: 1, magic: 0, equipped: true } };
const shielded = monkAt(7, 14, [shield]);
assert.equal(shielded.system.attributes.ac.value, 10 + shielded.system.abilities.dex.mod + 1);
// Over the inventory limit a Monk moves at 30ft before the usual penalty, even with a 25ft ancestry.
const IM = await import("../arneyan/module/data/item-models.mjs");
const bricks = Array.from({ length: 30 }, (_, n) => makeItem(IM.EquipmentData, "equipment", `Brick${n}`, { quantity: 1, slots: 1 }));
const loaded = makeActor(CharacterData, "character", { level: 7, attributes: { speed: 25 }, abilities: { str: { value: 10 } } }, [cls("Monk", 7), item(fast.name, "Monk", fast.system.rules), ...bricks]);
assert.ok(loaded.system.inventory.over, "the bricks put the Monk over the limit");
assert.equal(loaded.system.attributes.speedParts[0].value, 30, "Fast Movement lost: 30ft, then the usual penalty");
assert.ok(loaded.system.attributes.speedNow < 30);
assert.equal(monkAt(7).system.attributes.speedNow, 50, "not over the limit: Fast Movement");
// Kit features read their tables at the kit's class level (a Fighter 5 / Monk 2 with a Monk kit: Monk 2).
const kitRules = collectRules({ items: [cls("Fighter", 5), cls("Monk", 2), { type: "kit", name: "Iron Fist School", system: { className: "Monk" } },
  item("Kit Thing", "Iron Fist School", [{ key: "check", value: "1:1, 5:5" }])] }, { level: 7 });
assert.equal(kitRules[0].value, "1");
// Extra uses another feature gives: Voice of the Grove's extra Wild Shape a day.
const ws = feature("Wild Shape")("Druid");
const grove = { type: "ability", name: "Voice of the Grove", system: { className: "Tanatharen Grove (Druid)", rules: [{ key: "uses.extra.wild-shape", value: "1" }] }, flags: {} };
const wsItem = () => ({ type: "ability", name: "Wild Shape", system: { className: "Druid", uses: { ...ws.system.uses, value: 9 } }, flags: {} });
const d6 = makeActor(CharacterData, "character", { level: 6 }, [cls("Druid", 6), wsItem()]);
const d6g = makeActor(CharacterData, "character", { level: 6 }, [cls("Druid", 6), wsItem(), grove]);
assert.equal(d6.items[1].system.uses.max, 3);
assert.equal(d6g.items[1].system.uses.max, 4);

/* Fated Survivor: +1 Luck when taken, then +1 at each of 5th, 10th, 15th and 20th reached after that. */
const P = await import("../arneyan/module/progression.mjs");
assert.deepEqual([1, 4, 5, 9, 10, 15, 20, 24].map(l => P.luckDue("Fated Survivor", l, { taken: 1 })), [1, 1, 2, 2, 3, 4, 5, 5]);
assert.equal(P.luckDue("Fated Survivor", 15, { taken: 15 }), 1, "taken at 15th: the steps already passed aren't given (cautious reading)");
assert.equal(P.luckDue("Fated Survivor", 20, { taken: 15 }), 2);
assert.equal(P.luckDue("Fated Survivor", 9, { taken: 4, base: 0 }), 1, "a feat from before: only steps reached from now");
assert.equal(P.luckDue("Toughness", 20), 0);
globalThis.ChatMessage ??= { create: async () => ({}), getSpeaker: () => ({}) };
let posted = [];
ChatMessage.create = async m => { posted.push(m.content); return {}; };
const hero = (level, luck, rec, luckStart = 9) => {
  const feat = { id: "f1", type: "feat", name: "Fated Survivor", flags: { arneyan: rec === undefined ? {} : { luck: rec } } };
  const a = { id: `a${Math.random()}`, type: "character", isOwner: true, items: [feat], system: { level, luck: { value: luck, start: luckStart } },
    updateEmbeddedDocuments: async (t, ups) => { for (const u of ups) feat.flags.arneyan.luck = u["flags.arneyan.luck"]; },
    update: async u => { a.system.luck.value = u["system.luck.value"]; a.system.luck.start = u["system.luck.start"]; } };
  a.feat = feat;
  return a;
};
// Taken at 5th (a fresh record): +1 only, not the 5th-level step it was taken at.
let h = hero(5, 10, P.newLuckRecord(5));
await P.syncLuckFeats(h);
assert.deepEqual([h.system.luck.value, h.system.luck.start], [11, 10]);
assert.equal(await P.syncLuckFeats(h), 0, "never twice");
h.system.level = 10;
await P.syncLuckFeats(h, { fromLevel: 9 });
assert.equal(h.system.luck.value, 12, "10th: +1");
h.system.level = 7;
await P.syncLuckFeats(h, { fromLevel: 10 });
assert.equal(h.system.luck.value, 11, "back to 7th: the 10th-level step comes off");
// Two syncs at once (a level change and the feat's own): queued, so +1 once.
h = hero(3, 10, P.newLuckRecord(3));
await Promise.all([P.syncLuckFeats(h), P.syncLuckFeats(h, { fromLevel: 2 })]);
assert.equal(h.system.luck.value, 11);
// At the cap: Current Luck 20 gains nothing, and removing the feat takes off only what it added.
h = hero(9, 20, P.newLuckRecord(1), 14);
h.feat.flags.arneyan.luck.units = 2; h.feat.flags.arneyan.luck.start = 2; h.feat.flags.arneyan.luck.value = 1;
h.system.level = 10;
await P.syncLuckFeats(h, { fromLevel: 9 });
assert.deepEqual([h.system.luck.value, h.system.luck.start], [20, 15]);
assert.deepEqual((({ units, start, value }) => ({ units, start, value }))(h.feat.flags.arneyan.luck), { units: 3, start: 3, value: 1 });
assert.deepEqual(h.feat.flags.arneyan.luck.gains.at(-1), [1, 0], "the 10th-level step added to Starting Luck only");
// Level down: the capped step took nothing off Current Luck.
h.system.level = 9;
await P.syncLuckFeats(h, { fromLevel: 10 });
assert.deepEqual([h.system.luck.value, h.system.luck.start], [20, 14]);
h.system.level = 10;
await P.syncLuckFeats(h, { fromLevel: 9 });
await P.removeLuckFeat(h, h.feat);
assert.deepEqual([h.system.luck.value, h.system.luck.start], [19, 12], "removed: −1 Current (all it added), −3 Starting");
// A feat from before 0.10.48 (no record): nothing now; the next step reached adds 1.
h = hero(4, 12, undefined);
assert.equal(await P.syncLuckFeats(h, { fromLevel: 4 }), 0);
assert.equal(h.system.luck.value, 12);
h.system.level = 5;
await P.syncLuckFeats(h, { fromLevel: 4 });
assert.equal(h.system.luck.value, 13);
assert.ok(posted.some(t => /Fated Survivor: \+1 Luck/.test(t)));
// F3 (0.10.49): the Ranger's trap search has Advantage as well as the table bonus.
const wood = feature("Woodcraft")("Ranger").system.rules;
assert.ok(wood.some(r => r.key === "adv.skill" && /wilderness traps/.test(r.when)) && wood.some(r => r.key === "skill" && /wilderness traps/.test(r.when) && /^1:2/.test(r.value)));
console.log("OK level scaling");

// 0.10.65: a situational damage reminder in dice reads as its dice (Blessed Weapon: "+1d6", not "+0").
{
  const { ModSet } = await import("../arneyan/module/effects.mjs");
  const notes = new ModSet([{ key: "damage", value: "+1d6", when: "vs evil creatures (radiant)", label: "Blessed Weapon", data: {} },
    { key: "damage", value: 2, when: "Flank Attack", label: "Battle Space", data: {} }]).situational.map(x => x.text);
  assert.deepEqual(notes, ["Blessed Weapon: +1d6 (damage) vs evil creatures (radiant)", "Battle Space: +2 (damage) Flank Attack"]);
  console.log("OK 0.10.65 dice in damage reminders");
}

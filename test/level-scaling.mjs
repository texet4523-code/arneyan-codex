// 0.10.48: class features whose numbers step up with level (the Codex's progression tables) follow the class level.
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeActor } from "./harness.mjs";

const { levelText, ModSet, usesMax, collectRules } = await import("../arneyan/module/effects.mjs");
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
assert.deepEqual(rulesAt(4, iron).map(r => r.value), ["2"], "Iron Mind isn't there before 9th");
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
// The Monk's second and third attacks open at 6th and 16th (one button each, the highest step reached).
assert.deepEqual(h2h.system.activities.filter(a => a.minLevel === 6 || a.minLevel === 16).map(a => a.name), ["Second unarmed attack (1d4)", "Third unarmed attack (1d4)"]);
console.log("OK level scaling");

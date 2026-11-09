// Books v0.10.41 to v0.10.43 (K48, K49, K51, m76; board B-F28, B-F29, B-F31): class features and spells in the system.
import assert from "node:assert/strict";
import fs from "node:fs";

const read = dir => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith("items_"))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const features = read("class-features"), spells = read("spells");
const feat = (n, c) => { const f = features.find(x => x.name === n && x.system.className === c); assert.ok(f, `${n} (${c})`); return f.system; };
const spell = n => { const s = spells.find(x => x.name === n); assert.ok(s, n); return s.system; };
const dice = (formula, cl) => {
  // "(expr)d6 + (expr)d8 [+ @int.mod]" at this level, 0-dice terms dropped.
  const f = formula.replace(/@cl/g, String(cl)).replace(/\s*\+\s*@int\.mod/g, "");
  const parts = f.split(/\)d(\d+)/);
  const out = [];
  for (let k = 0; k + 1 < parts.length; k += 2) {
    const expr = parts[k].replace(/^\s*\+?\s*\(/, "");
    const n = Function("min", "max", "floor", `return (${expr})`)(Math.min, Math.max, Math.floor);
    if (n) out.push(`${n}d${parts[k + 1]}`);
  }
  return out.join(" + ");
};

/* Eldritch Blast: 1d6, 1d8 at 5th, 2d6 at 9th, 3d8 at 13th, 4d8 at 17th, 5d8 at 21st (feature and class-only spell). */
for (const f of [feat("Eldritch Blast", "Warlock").damage, spell("Eldritch Blast").damage]) {
  assert.deepEqual([1, 5, 9, 13, 17, 21, 24].map(l => dice(f, l)), ["1d6", "1d8", "2d6", "3d8", "4d8", "5d8", "5d8"]);
}
/* The Spark Caster keeps the old dice: 2d8 at 13th, 3d6 at 17th, 3d8 at 24th. */
assert.deepEqual([1, 13, 17, 24].map(l => dice(feat("Spark Caster", "Artificer").damage, l)), ["1d6", "2d8", "3d6", "3d8"]);

/* Spellstrike: 3d6 at 11th, 4d6 at 17th, 5d6 at 21st; the Extra Attack carries one from 7th. */
const ss = feat("Spellstrike", "Spellblade").activities.filter(a => a.name.startsWith("Cantrip"));
assert.deepEqual(ss.map(a => [a.formula, a.minLevel]), [["1d4", 0], ["2d4", 5], ["3d6", 11], ["4d6", 17], ["5d6", 21]]);
assert.ok(ss.every(a => a.text.includes("From 7th level your Extra Attack")));

/* Rules for the new and changed always-on features. */
const rules = (n, c) => feat(n, c).rules.map(r => [r.key, String(r.value)]);
assert.deepEqual(rules("Arcane Ward improves", "Wizard"), [["cast.temp", "1"]]);
assert.deepEqual(rules("Hag's Vigour improves", "Witch"), [["hp.max", "@cl"]]);
assert.deepEqual(rules("Displacement", "Illusionist"), [["adv.against.first", "-1"]]);
assert.deepEqual(rules("Iron Fists", "Monk"), [["attack", "7:1, 13:2, 19:3"], ["damage", "7:1, 13:2, 19:3"]]);
const ps = feat("Precise Strikes", "Rogue").rules[0].value.replace(/^\+/, "").replace(/@cl/g, "L");
const at = L => Function("L", "min", "max", "floor", `return ${ps}`)(L, Math.min, Math.max, Math.floor);
assert.deepEqual([1, 3, 9, 12, 13, 18, 24].map(at), [1, 1, 3, 4, 6, 9, 12], "per three levels, per two from 13th");
for (const [n, c] of [["Steadfast Faith", "Cleric"], ["Aura of Resolve", "Paladin"], ["Lore Master", "Bard"], ["Second School", "Wizard"]]) assert.ok(feat(n, c).rules.length, n);

/* Activities. */
const cd = feat("Channel Divinity (Charisma)", "Paladin").activities.find(a => a.name.startsWith("Smite improves"));
assert.deepEqual([cd.formula, cd.damageType, cd.minLevel, cd.cost], ["1d8", "radiant", 13, 0]);
const tu = feat("Turn Undead", "Cleric").activities;
assert.deepEqual(tu.find(a => a.name === "Turning Radiance") && [tu.find(a => a.name === "Turning Radiance").formula, tu.find(a => a.name === "Turning Radiance").minLevel], ["@cl", 6]);
assert.ok(tu[0].text.includes("{1:30ft, 10:60ft}"));
assert.deepEqual([feat("Apex Predator", "Ranger").uses.formula], ["1:1, 24:2"]);
assert.deepEqual([feat("Overchannel improves", "Sorcerer").uses.per, feat("Overchannel improves", "Sorcerer").activities[0].cost], ["day", 1]);
assert.ok(feat("Wild Surge", "Sorcerer").activities[0].text.includes("from 13th your third"));
assert.ok(feat("Animate Dead", "Necromancer").activities.some(a => a.name === "Command Undead (no save)" && a.minLevel === 18));

/* Warlock: an invocation at 6th too. Hex is Malediction (the Witch keeps her Hex). */
const inv = JSON.parse(fs.readFileSync(new URL("../build/effects/approved.json", import.meta.url), "utf8"))["class-features/7qQi9fW8rl1RKTXP"];
assert.equal(inv.optionChoice.max, "1:1, 5:2, 6:3, 9:4, 13:5, 17:6");
const mal = spells.find(s => s._id === "0zqPnCOdDm0Tb4IW");
assert.equal(mal.name, "Malediction", "Hex's compendium id");
assert.equal(mal.system.applies[0].name, "Maledicted");
assert.ok(!spells.some(s => s.name === "Hex"));
assert.ok(features.some(f => f.name === "Hex (Wisdom)" && f.system.className === "Witch"));

/* Spells: Mass Harm a quarter on a success; Death Ward stops HP set to 0 or a fixed number. */
assert.match(spell("Mass Heal").saveEffect, /quarter/);
assert.match(spell("Death Ward").applies[0].rules[0].value, /set its HP to 0 or a fixed number/);
console.log("OK books v0.10.43 classes");

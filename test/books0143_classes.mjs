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

/* Eldritch Blast (HB v0.10.86): 1d8, 2d8 at 5th, 3d8 at 11th, 4d8 at 17th (feature and class-only spell). */
for (const f of [feat("Eldritch Blast", "Warlock").damage, spell("Eldritch Blast").damage]) {
  assert.deepEqual([1, 5, 10, 11, 16, 17, 20].map(l => dice(f, l)), ["1d8", "2d8", "2d8", "3d8", "3d8", "4d8", "4d8"]);
}
/* The Spark Caster keeps the old dice: 2d8 at 13th, 3d6 at 17th, 3d8 at 24th. */
assert.deepEqual([1, 13, 17, 20].map(l => dice(feat("Spark Caster", "Artificer").damage, l)), ["1d6", "2d8", "3d6", "3d6"], "HB v0.10.86: 3d6 at 17th is the last step");

/* Spellstrike (books v0.10.56, R-B59: the text matches the table): 3d4 at 11th, 4d4 at 17th, 5d4 at 21st; the Extra
   Attack carries one from 7th. */
const ss = feat("Spellstrike", "Spellblade").activities.filter(a => a.name.startsWith("Cantrip"));
assert.deepEqual(ss.map(a => [a.formula, a.minLevel]), [["1d4", 0], ["2d4", 5], ["3d4", 11], ["4d4", 17]], "HB v0.10.86: no 21st step");
assert.ok(ss.every(a => a.text.includes("one Spellstrike a round, through either attack")), "K199: one Spellstrike a round");

/* Rules for the new and changed always-on features. */
const rules = (n, c) => feat(n, c).rules.map(r => [r.key, String(r.value)]);
// HB v0.10.76 and v0.10.77: the "improves" lines are steps of the base features; Displacement is gone.
assert.deepEqual(rules("Arcane Ward", "Wizard"), [["cast.temp", "1:2, 8:3"]]);
assert.deepEqual(rules("Hag's Vigour", "Witch"), [["hp.max", "{1:@cl, 8:@cl * 2, 11:20}"]], "HB v0.10.86: beyond 10th the Witch's +3 a level includes it");
assert.ok(!features.some(f => ["Arcane Ward improves", "Hag's Vigour improves", "Displacement", "Overchannel improves"].includes(f.name)));
assert.deepEqual(rules("Iron Fists", "Monk"), [["attack", "7:1, 15:2"], ["damage", "7:1, 15:2"]], "HB v0.10.86");
// HB v0.10.71: the book's steps as a level table.
const ps = feat("Precise Strikes", "Rogue").rules[0].value;
const at = L => { let v = 0; for (const [, l, n] of ps.matchAll(/(\d+):(\d+)/g)) if (L >= Number(l)) v = Number(n); return v; };
assert.deepEqual([1, 3, 7, 14, 15, 20].map(at), [1, 1, 2, 2, 3, 3], "HB v0.10.86: +1, +2 at 7th, +3 at 15th");
for (const [n, c] of [["Steadfast Faith", "Cleric"], ["Auras", "Paladin"], ["Lore Master", "Bard"]]) assert.ok(feat(n, c).rules.length, n);

/* Activities. */
const cd = feat("Channel Divinity (Charisma)", "Paladin").activities.find(a => a.name.startsWith("Smite: +1d8"));
assert.deepEqual([cd.formula, cd.damageType, cd.minLevel, cd.cost], ["5:1d8, 15:2d8", "radiant", 5, 0], "HB v0.10.86: +1d8 at 5th, 2d8 at 15th");
const tu = feat("Turn Undead", "Cleric").activities;
assert.deepEqual(tu.find(a => a.name === "Turning Radiance") && [tu.find(a => a.name === "Turning Radiance").formula, tu.find(a => a.name === "Turning Radiance").minLevel], ["@cl", 6]);
assert.ok(tu[0].text.includes("{1:30ft, 10:60ft}"));
assert.deepEqual([feat("Apex Predator", "Ranger").uses.formula], ["1:1"], "HB v0.10.76: Peerless Hunter lifts the limit at 24th (a reminder)");
assert.deepEqual(feat("Overchannel", "Sorcerer").activities.map(x => [x.name, x.minLevel ?? 0, x.cost]), [["Overchannel", 0, 0], ["Overchannel (no damage)", 15, 1]], "HB v0.10.86: its 15th-level step spends the daily use");
// HB v0.10.86: Wild Surge in Metamagic; Command Undead its own feature, no save for Level 5 or lower from 15th.
assert.ok(feat("Metamagic", "Sorcerer").activities.find(a => a.name === "Wild Surge").text.includes("four times from 15th"));
assert.ok(feat("Command Undead", "Necromancer").activities.some(a => a.name === "Command Undead (no save)" && a.minLevel === 15));

/* Warlock: an invocation at 6th too. Hex is Malediction (the Witch keeps her Hex). */
const inv = JSON.parse(fs.readFileSync(new URL("../build/effects/approved.json", import.meta.url), "utf8"))["class-features/7qQi9fW8rl1RKTXP"];
assert.equal(inv.optionChoice.max, "1:2, 2:3, 4:4, 6:5, 9:6, 15:7", "HB v0.10.86 (S-F1)");
const mal = spells.find(s => s._id === "0zqPnCOdDm0Tb4IW");
assert.equal(mal.name, "Malediction", "Hex's compendium id");
assert.equal(mal.system.applies[0].name, "Maledicted");
assert.ok(!spells.some(s => s.name === "Hex"));
assert.ok(features.some(f => f.name === "Hex (Wisdom)" && f.system.className === "Witch"));

/* Spells: Mass Harm a quarter on a success; Death Ward stops HP set to 0 or a fixed number. */
assert.match(spell("Mass Heal").saveEffect, /quarter/);
assert.match(spell("Death Ward").applies[0].rules[0].value, /set its HP to 0 or a fixed number/);
console.log("OK books v0.10.43 classes");

/* HB v0.10.86 (S-F1): Spellburn (in Metamagic) and Overchannel burn Strength, Dexterity or Constitution. */
for (const n of ["Metamagic", "Overchannel"]) {
  const f = feat(n, "Sorcerer");
  const text = [f.description, ...(f.activities ?? []).map(a => a.text ?? "")].join(" ");
  assert.match(text, /Strength, Dexterity or Constitution/, n);
}

/* HB v0.10.82 (B-F77): nine kit intros gain an example of who trains in them; the Cleric and Paladin demon-lord lines (K206). */
const kits = read("kits"), classes = read("classes");
const kit = (n, c) => { const k = kits.find(x => x.name === `${n} (${c})` && x.system.className === c); assert.ok(k, `${n} (${c})`); return k.system.description; };
for (const [n, c, words] of [["Bladebound", "Spellblade", "bladesingers of Aldorethi"], ["Shadow Edge", "Spellblade", "Ashes of the Phoenix"],
  ["The Crimson Tide", "Swashbuckler", "fleet's captains"], ["The Silver Serpent", "Swashbuckler", "patient blades of Iiria"],
  ["The Opal Way", "Swashbuckler", "Moon's Free Company"], ["The Eltor Court", "Swashbuckler", "Holfast's halls"],
  ["The Black Street", "Swashbuckler", "Cheap Street"], ["War Barbarian", "Barbarian", "goliath war-bands of Jotunas"],
  ["Drake's Followers", "Barbarian", "Treaty Hold"]])
  assert.ok(kit(n, c).includes(words), `${n}: ${words}`);
const cls = n => classes.find(x => x.name === n).system.description;
assert.match(cls("Paladin"), /have cults and Warlocks but no Paladin orders, unless the GM decides a cult has grown strong enough/);
assert.match(cls("Cleric"), /only those in these tables keep Cleric orders/);
assert.doesNotMatch(cls("Cleric") + cls("Paladin"), /serve only as Warlock patrons|are Warlock patrons, not Paladin gods/);
const codex = fs.readFileSync(new URL(`../packs-src/rules/${fs.readdirSync(new URL("../packs-src/rules/", import.meta.url)).find(f => f.startsWith("journal_Book_I_"))}`, import.meta.url), "utf8");
assert.ok(codex.includes("Knight's Favour, in Keeps &amp; Kingdoms") || codex.includes("Knight's Favour, in Keeps & Kingdoms"), "HB v0.10.86: Battle Lord is the Knight's Favour");
console.log("OK books v0.10.82");

// HB v0.10.86 to v0.10.89, M&T v0.10.87, K&K v0.5.7 (S-F1 to S-F4, K288): the class rebuild and the text pass.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
const dir = new URL("../packs-src/", import.meta.url);
const docs = pack => fs.readdirSync(new URL(pack, dir)).filter(f => f.startsWith("items_") || f.startsWith("actors_") || f.startsWith("journal_"))
  .map(f => JSON.parse(fs.readFileSync(new URL(`${pack}/${f}`, dir), "utf8")));
const classes = docs("classes"), cf = docs("class-features"), kits = docs("kits"), feats = docs("feats");
const cls = n => { const c = classes.find(x => x.name === n); assert.ok(c, n); return c.system; };
const feat = (n, c) => { const f = cf.find(x => x.name === n && x.system.className === c); assert.ok(f, `${n} (${c})`); return f; };
const C = await import("../arneyan/module/companions.mjs");
const plain = h => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/* Level cap 20: no class lists a feature past 20th, and spell tables stop there. */
for (const c of classes) {
  assert.ok(c.system.features.every(f => f.level <= 20), `${c.name}: nothing past 20th`);
  if (c.system.slotTable.length) assert.equal(c.system.slotTable.length, 20, `${c.name}: 20 rows of slots`);
}
const { ARNEYAN } = await import("../arneyan/module/config.mjs");
assert.equal(ARNEYAN.maxLevel, 20);

/* The feat ladder by class group (Character Creation, Feat Progression). */
const LADDER = { Specialist: [1, 3, 6, 9, 12, 16, 20], Martial: [1, 3, 6, 12, 16, 20], Hybrid: [1, 6, 12, 16, 20], Caster: [1, 6, 12, 20] };
for (const [g, names] of Object.entries({ Specialist: ["Assassin", "Rogue", "Swashbuckler"], Martial: ["Archer", "Barbarian", "Fighter", "Gunslinger", "Knight", "Monk", "Ranger"],
  Hybrid: ["Artificer", "Paladin", "Spellblade"], Caster: ["Bard", "Cleric", "Druid", "Illusionist", "Necromancer", "Sorcerer", "Warlock", "Witch", "Wizard"] }))
  for (const n of names) assert.deepEqual(cls(n).featLevels, LADDER[g], n);
assert.deepEqual(cls("Bard").featPaths, ["General Path", "Specialist Path", "Arcane & Devout Path"]);
assert.deepEqual(cls("Illusionist").featPaths, ["General Path", "Specialist Path", "Arcane & Devout Path"]);

/* Renown at 10th and 15th, and the 20th-level Seat, for every class. */
for (const c of classes.filter(x => !x.name.includes("("))) {
  const names = c.system.features.map(f => `${f.level} ${f.name}`);
  assert.ok(names.includes("10 Renown: Name") && names.includes("15 Renown: Holding") && names.some(n => /^20 Renown: /.test(n)), `${c.name}: ${names.join(", ")}`);
}

/* Ids kept through the rebuild: moved features, renames, and the Hunter kit. */
for (const [n, c, id] of [["Divine Intervention", "Cleric", "PhdBHCSAzFgJFz5b"], ["Hierophant", "Druid", "Th7Cb6Cp4dzahaNg"], ["Expert in Arms", "Knight", "3gIR77E7xLXq5uxV"],
  ["Knight's Favour", "Knight", "2V18RRJiy3I6UgG7"], ["Raise the Dead", "Necromancer", "wUDfID3GbQaDq2OG"], ["Metamagic", "Sorcerer", "iG2fFKdcciI8ytpv"],
  ["Path, Patron and Pact", "Warlock", "KGUdCUGs7JdT7FUT"], ["Second Path gift", "Warlock", "ExQfX6J8B6CA1vbj"], ["Hag's Vigour", "Witch", "JuIQSx1fp9et1XBb"], ["Blood Burn", "Sorcerer", "WpKhYgjUj5yry3Hi"]])
  assert.equal(feat(n, c)._id, id, `${n} keeps its id`);
const M = await import("../arneyan/module/migrate.mjs");
assert.equal(M.CLASS_REWORK, "0.10.126");
for (const id of ["tKjUGhmoYFPguIGY", "4GElPAMUOsgjLcSl", "VkVLCNJ3it9jWN1i"]) assert.ok(M.DROPPED_FEATURES.has(`Compendium.arneyan.class-features.Item.${id}`), id);
assert.ok(!M.DROPPED_FEATURES.has("Compendium.arneyan.class-features.Item.WpKhYgjUj5yry3Hi"), "Blood Burn is back");
assert.deepEqual(M.RENAMED_FEATURES["Compendium.arneyan.class-features.Item.iG2fFKdcciI8ytpv"], ["Spellburn", "Metamagic"]);
assert.deepEqual(M.RENAMED_FEATURES["Compendium.arneyan.kits.Item.lo7VFmTRPD7VpKro"], [["Path: Hunter (Ranger)"], "Hunter (Ranger)"]);

/* A feature the book names twice is one item (the Warlock's Patron Favour at 1st, 4th and 8th). */
assert.equal(cls("Warlock").features.filter(f => f.name === "Patron Favour").length, 1);
assert.equal(cls("Illusionist").features.filter(f => f.name === "Shattered Glass").length, 1);

/* Warlock: d4, the Pact of the Blade as its own class (Knight track, d8, slots two rows behind, never above 5th). */
assert.equal(cls("Warlock").hitDie, "d4");
const blade = cls("Warlock (Pact of the Blade)");
assert.deepEqual([blade.hitDie, blade.hpBeyond10, blade.bthProgression], ["d8", 2, "knight"]);
assert.deepEqual(blade.slotTable[2].slice(1), cls("Warlock").slotTable[0].slice(1), "3rd level uses the 1st-level row");
assert.deepEqual(blade.slotTable.map(r => r[0]), cls("Warlock").slotTable.map(r => r[0]), "cantrips unchanged");
assert.ok(blade.slotTable.every(r => r.slice(6).every(v => v === 0)), "never above 5th");
const pacts = kits.filter(k => /^Pact of the /.test(k.name)).map(k => k.name).sort();
assert.deepEqual(pacts, ["Pact of the Blade (Warlock)", "Pact of the Chain (Warlock)", "Pact of the Sculptor (Warlock)"]);
const chain = kits.find(k => k.name === "Pact of the Chain (Warlock)").system.features.map(f => [f.name, f.level]);
assert.deepEqual(chain.find(f => f[0] === "Pack Hunter"), ["Pack Hunter", 7]);
assert.ok(kits.find(k => k.name === "Pact of the Blade (Warlock)").system.features.some(f => f.name === "Pact improves" && f.level === 9));
const inv = feat("Eldritch Invocations", "Warlock").system.optionChoice;
assert.ok(["Lance", "Agonising", "Armour of Shadows", "Life Drinker"].every(n => inv.options.some(o => o.name === n)));

/* Warlock Path gifts (review 22 Nov): picked on Path, Patron and Pact, one at 1st and another at 8th; buttons spend Favour. */
const ppp = feat("Path, Patron and Pact", "Warlock").system;
assert.equal(ppp.optionChoice.max, "1:1, 8:2");
assert.equal(ppp.optionChoice.options.length, 16);
assert.equal(ppp.uses.pool, "Patron Favour");
assert.deepEqual(ppp.activities.filter(a => a.name.startsWith("Fallen Light")).map(a => [a.name, a.cost, a.minLevel]), [["Fallen Light", 1, 8], ["Fallen Light: fire", 0, 8], ["Fallen Light: radiant", 0, 8]]);
assert.equal(ppp.activities.find(a => a.name === "Raise the Fallen").cost, 0, "no Favour");
const dsrc = fs.readFileSync(new URL("../arneyan/module/documents.mjs", import.meta.url), "utf8");
assert.ok(dsrc.includes("n.startsWith(`${o}:`)"), "a gift's extra rolls follow its pick");

/* Wild Shape (review 22 Nov): no casting in shape but the Shapeshifter's; a Druid (Shapeshifter) class with slots one row behind. */
const T = await import("../arneyan/module/transform.mjs");
assert.equal(T.wildCastingMax(20, false), 0);
const ssc = cls("Druid (Shapeshifter)");
assert.deepEqual(ssc.slotTable[1].slice(1), cls("Druid").slotTable[0].slice(1), "slots from the row below");
assert.deepEqual(ssc.slotTable.map(r => r[0]), cls("Druid").slotTable.map(r => r[0]), "cantrips unchanged");
assert.ok(ssc.slotTable.every(r => r.slice(8).every(v => v === 0)), "never above 7th");

/* Spellburn burns only your own score; Undead Mastery adds Endless Ranks and Lichdom. */
assert.ok(dsrc.includes("a spell, potion, item or form that raises it gives nothing more to burn"));
assert.equal(C.undeadMasteryCap(20, 4, { endlessRanks: true, lichdom: true }), 20 + 4 + 5 + 4 + 5);

/* Witch: d6 with Hag's Vigour (+1 a level, +2 from 8th; nothing more beyond 10th). */
assert.equal(cls("Witch").hitDie, "d6");
assert.deepEqual(feat("Hag's Vigour", "Witch").system.rules.map(r => r.value), ["{1:@cl, 8:@cl * 2, 11:20}"]);

/* Sorcerer: flat 2-point Spellburn, Wild Surge 1/2/4 a day, Corruption on a d20 of 1 to 5. */
const mm = feat("Metamagic", "Sorcerer").system;
assert.deepEqual(mm.activities.map(a => [a.name, a.kind, a.formula ?? ""]), [["Spellburn", "burn", "flat"], ["Wild Surge", "note", ""], ["Corruption roll", "roll", "1d20"]]);
assert.equal(mm.uses.formula, "1:1, 5:2, 15:4");
const D = await import("../arneyan/module/documents.mjs").catch(() => null);
if (D) assert.equal(D.tableFor(mm.activities[2].tables, 5), "Minor Corruption");

/* Necromancer: Undead Mastery in points (level + Int, +5 from 15th). */
assert.deepEqual([0, 1, 2, 3, 4, 6, 7, 9, 10, 15].map(C.undeadPoints), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
assert.deepEqual([C.undeadMasteryCap(1, 3), C.undeadMasteryCap(14, 4), C.undeadMasteryCap(15, 4)], [4, 18, 24]);

/* Feats: Grappler replaces Mighty Deed of Arms (K283); Called Shot is Archers' and Gunslingers' (K286). */
assert.ok(feats.some(f => f.name === "Grappler") && !feats.some(f => f.name === "Mighty Deed of Arms"));
const combat = fs.readFileSync(new URL("../arneyan/module/combat.mjs", import.meta.url), "utf8");
assert.ok(!/Mighty Deed of Arms feat/.test(combat));

/* The text pass: Catalogue front matter isn't goods; "maximum" still caps a spell's dice and area. */
const eq = docs("equipment");
assert.ok(!eq.some(d => ["Tags", "Price bands for magical goods, alchemy and spell components", "Money", "Selling"].includes(d.name)));
const sp = docs("spells");
assert.equal(sp.find(s => s.name === "Delayed Blast Fireball").system.damage, "(min(@cl, 12))d6 + 1 * min(@cl, 12)");
assert.equal(sp.find(s => s.name === "Earthquake").system.template.sizeFormula, "min(5*@cl, 100)");
assert.ok(/between −40 and 50 degrees Celsius/.test(plain(sp.find(s => s.name === "Endure Elements").system.description)), "Endure Elements in Celsius");

/* K&K v0.5.7: the Knight's Favour; the Witch's Cottage gives Hex from Afar. */
const kk = JSON.stringify(docs("kk-rules"));
assert.ok(kk.includes("Knight's Favour") && kk.includes("Hex from Afar") && !kk.includes("Deep Hex"));
console.log("OK books v0.10.89");

// 0.10.30: import a character or NPC a chat wrote (the Arneyan import format): reading the block and finding its names.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import "./harness.mjs";

for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
const I = await import("../arneyan/module/import.mjs");

// Compendium indexes from the built packs, as Foundry's getIndex gives them.
const src = p => new URL(`../packs-src/${p}/`, import.meta.url).pathname;
const index = pack => fs.readdirSync(src(pack)).map(f => JSON.parse(fs.readFileSync(path.join(src(pack), f), "utf8")))
  .filter(d => d.system).map(d => ({ _id: d._id, name: d.name, type: d.type, uuid: `Compendium.arneyan.${pack}.${pack === "monsters" ? "Actor" : "Item"}.${d._id}` }));
const cache = new Map();
const find = async pack => { if (!cache.has(pack)) cache.set(pack, new I.Finder(index(pack), pack)); return cache.get(pack); };

// Reading the block: fences, text around it, curly quotes; the type from the block or from what it has.
const block = `Here's Big Wen, ready to import:
\`\`\`json
{ "type": "character", "name": "Wendel “Big Wen” Harrow", "classes": [{ "name": "Fighter", "level": 1 }] }
\`\`\`
Enjoy!`;
assert.throws(() => I.readImport(""), /Paste/);
assert.throws(() => I.readImport("no braces"), /isn't an import block/);
assert.throws(() => I.readImport("{ name: x }"), /doesn't read as JSON/);
assert.throws(() => I.readImport('{ "type": "npc" }'), /no name/);
const wenHead = I.readImport(block.replace("Wendel “Big Wen” Harrow", "Wendel Big Wen Harrow"));
assert.equal(wenHead.type, "character");
assert.equal(I.importType({ hd: "2d8" }), "npc");
assert.equal(I.importType({ class: "Rogue" }), "character");

// Small readers.
assert.deepEqual(I.readScores("Str 18, Dex 14, Con 16, Int 11, Wis 14, Cha 9"), { str: 18, dex: 14, con: 16, int: 11, wis: 14, cha: 9 });
assert.deepEqual(I.readScores({ Strength: 12, DEX: 15, luck: 3 }), { str: 12, dex: 15 });
assert.deepEqual(I.readClasses({ classes: "Fighter 3 / Rogue 2" }), [{ name: "Fighter", level: 3 }, { name: "Rogue", level: 2 }]);
assert.deepEqual(I.readClasses({ class: "Wizard", level: 4 }), [{ name: "Wizard", level: 4 }]);
assert.deepEqual(I.entry("Endurance (Master)", "tier"), { name: "Endurance", tier: "Master" });
assert.deepEqual(I.entry("Arrows x20"), { qty: 20, name: "Arrows" });
assert.deepEqual(I.entry("Rope, Hemp (50ft)"), { name: "Rope, Hemp (50ft)" }, "gear keeps its brackets");
assert.equal(I.textHtml("One **bold** line.\n\nTwo"), "<p>One <strong>bold</strong> line.</p><p>Two</p>");

// A whole character: every name found, picks carried.
const wen = I.readImport(JSON.stringify({
  type: "character", name: "Wendel \"Big Wen\" Harrow", ancestry: "Human", classes: [{ name: "Fighter", level: 1 }], kit: "The Heavy Hand",
  alignment: "Neutral Good", scores: { str: 18, dex: 14, con: 16, int: 11, wis: 14, cha: 9 }, hp: 12, luck: 12,
  feats: ["Critical Strike", { name: "Steady Hand", choice: "str", moved: "wis" }],
  skills: [{ name: "Endurance", tier: "trained" }, "Swimming (Master)"],
  gear: ["Greatsword", "Cuir Bouille", "Buckler", "Backpack", "Arrows x20", "Long Sword", "+1 Longsword"], coins: { gp: 4, sp: 5 }
}));
let plan = await I.planImport(wen, { find });
assert.deepEqual(plan.missing, [], plan.missing.join("; "));
const f = n => plan.found.find(x => x.name === n || x.name.startsWith(n));
assert.equal(f("Fighter").level, 1);
assert.ok(f("The Heavy Hand").name.includes("(Fighter)"), "the Kit for the character's class");
assert.equal(f("Steady Hand").pick, "str");
assert.equal(f("Steady Hand").moved, "wis");
assert.equal(f("Swimming").tier, "master");
assert.equal(plan.found.find(x => x.pack === "equipment" && x.qty === 20)?.name.startsWith("Arrow"), true);
const swords = plan.found.filter(x => x.pack === "equipment" && /sword, long/i.test(x.name));
assert.equal(swords.length, 2, "Long Sword and +1 Longsword are the Catalogue's Sword, Long");
assert.equal(swords[1].magic, 1);
assert.equal(swords[1].label, "+1 Longsword");

// Names not found come in as plain items, listed.
plan = await I.planImport(I.readImport(JSON.stringify({ type: "character", name: "X", classes: ["Fighter 2"], feats: ["Made-up Feat"], gear: ["Glowing Doohickey"], kit: "No Such Kit" })), { find });
assert.deepEqual(plan.missing, ["Kit: No Such Kit", "Feat: Made-up Feat", "Gear: Glowing Doohickey"]);
assert.deepEqual(plan.made.map(m => m.type), ["feat", "equipment"]);

// Ancestry subtypes by a part of their name.
const elf = { system: { choice: { label: "Subtype", options: [{ name: "High Elf" }, { name: "Saevren (Wood Elf)" }, { name: "Iiria Elf (Jinia coastal)" }] } } };
assert.equal(I.ancestryOption(elf, "Wood Elf"), 1);
assert.equal(I.ancestryOption(elf, "saevren"), 1);
assert.equal(I.ancestryOption(elf, "High Elf"), 0);
assert.equal(I.ancestryOption(elf, "Dark Elf"), -1);

// An NPC: a Bestiary base, attacks matched to the Catalogue where they can be, abilities and spellcasting.
plan = await I.planImport(I.readImport(JSON.stringify({
  type: "npc", name: "Grask the Ogre Boss", base: "Ogre", level: 4, hd: "6d10+12", hp: 45, ac: 14, attack: 6,
  attacks: [{ name: "Greatclub", damage: "2d8+4 bludgeoning" }, { name: "Rock Throw", damage: "2d6+4", range: "60ft" }],
  abilities: [{ name: "Bully", text: "Advantage on attacks against prone creatures." }], spellcasting: "Cleric 3", spells: ["Cure Light Wounds"]
})), { find });
assert.equal(plan.type, "npc");
assert.equal(plan.base?.name, "Ogre");
assert.equal(plan.attacks.length, 2);
assert.ok(plan.attacks[0].matched, "Greatclub is the Catalogue's");
assert.equal(plan.attacks[1].matched, "", "Rock Throw is its own");
assert.deepEqual(plan.spellcasting, { className: "Cleric", level: 3 });
assert.equal(plan.made[0].system.kind, "monster");
assert.ok(I.planHtml(plan).includes("Starts from:"));
assert.deepEqual(plan.missing, [], plan.missing.join("; "));
// Books v0.10.5: an NPC's skills. Perception and the like are attribute checks (made, not missing); Spellcraft is the compendium's.
plan = await I.planImport(I.readImport(JSON.stringify({ type: "npc", name: "Sly", base: "Ogre", skills: ["Perception (Master)", "Stealth", "Spellcraft"] })), { find });
assert.deepEqual(plan.made.filter(m => m.type === "skill").map(m => [m.name, m.system.ability, m.system.tier]), [["Perception", "wis", "master"], ["Stealth", "dex", "trained"]]);
assert.ok(!plan.missing.some(m => /Perception|Stealth/.test(m)), plan.missing.join("; "));
assert.ok(plan.found.some(f => f.pack === "skills" && f.name === "Spellcraft"));
// A character's block isn't a monster's: Perception there is still reported as not in the compendium.
plan = await I.planImport(I.readImport(JSON.stringify({ type: "character", name: "Pip", classes: ["Fighter 1"], skills: ["Perception"] })), { find });
assert.ok(plan.missing.some(m => m === "Skill: Perception"));
// Review fixes: curly quotes inside text are fine; bracketed names that are names; picks for class features; Kits
// only for the character's class; ranged attacks; uses periods; string lists split at semicolons only.
assert.equal(I.readImport('{ "name": "Q", "biography": "He said “hello”" }').biography, "He said “hello”");
assert.equal(I.readImport('{ “name”: “Q” }').name, "Q", "a block written with curly quotes still reads");
plan = await I.planImport(I.readImport(JSON.stringify({ type: "character", name: "Y", classes: ["Fighter 1"],
  spells: ["Animate Dead (Greater)", "Magic Missile (Wizard)"], feats: ["Weapon Specialisation (Greatsword)"], picks: { "Attribute Bonus": "con" },
  gear: "Rope, Hemp (50ft); Sword, Long" })), { find });
const sp = plan.found.filter(x => x.pack === "spells");
assert.ok(sp.some(x => x.name === "Animate Dead (Greater)" && !x.className), "the Greater spell, no class from its bracket");
assert.ok(sp.some(x => x.name === "Magic Missile" && x.className === "Wizard"));
assert.deepEqual(plan.picks.map(p => [p.name, p.weapons.join(), p.pick]), [["Weapon Specialisation", "Greatsword", ""], ["Attribute Bonus", "", "con"]]);
assert.ok(!plan.missing.some(m => m.includes("Weapon Specialisation")), "a class feature in feats is a pick, not a missing feat");
assert.equal(plan.found.filter(x => x.pack === "equipment").length, 2, "semicolons split, commas don't");
plan = await I.planImport(I.readImport(JSON.stringify({ type: "character", name: "Z", classes: ["Fighter 2"], kit: "Beast Master" })), { find });
assert.ok(!plan.found.some(x => x.pack === "kits"));
assert.ok(plan.notes.some(n => n.startsWith("Kit Beast Master not added: it's a Kit for")), plan.notes.join(" "));
assert.equal(I.isRanged("60ft"), true);
assert.equal(I.isRanged("30/120"), true);
assert.equal(I.isRanged("reach 10ft"), false);
assert.equal(I.isRanged("5ft"), false);
assert.equal(I.usesPer("Per day"), "day");
assert.equal(I.usesPer("1/long rest"), "rest");
assert.equal(I.usesPer("once per encounter"), "encounter");
assert.equal(I.usesPer("at will"), "");
assert.equal(I.isRanged("Range 60"), true);
plan = await I.planImport(I.readImport(JSON.stringify({ type: "character", name: "BP", classes: ["Cleric (Battle Priest) 3"], kit: "Deity: Bane",
  picks: { "Weapon Specialisation": "Sword, Long" } })), { find });
assert.ok(plan.found.some(x => x.pack === "kits"), "a Cleric Kit for a Battle Priest");
assert.deepEqual(plan.picks[0].weapons, ["Sword, Long"], "a Catalogue weapon name keeps its comma");
assert.deepEqual(I.readScores({ str: 35, dex: 12.6 }), { str: 30, dex: 13 });
assert.equal(I.abilityKey("Chakram"), "", "a weapon isn't an attribute");
assert.equal(I.abilityKey("WIS"), "wis");
console.log("OK import");

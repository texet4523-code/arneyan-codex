// Books M&T v0.10.64 and HB v0.10.64 (B-F54, B-F55, B-F56; 0.10.100): the M&T magic items beyond the Catalogue,
// 65 new monsters, Ygorl's Entropy and the Mortal Limit wording.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

const read = sub => {
  const dir = new URL(`../packs-src/${sub}/`, import.meta.url);
  return fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(new URL(f, dir), "utf8")));
};
const eq = read("equipment");
const folders = Object.fromEntries(eq.filter(d => d._key?.startsWith("!folders!")).map(d => [d.name, d._id]));
const items = eq.filter(d => d._key?.startsWith("!items!"));
const inFolder = n => items.filter(d => d.folder === folders[n]);
const item = n => { const r = items.filter(d => d.name === n && d.system.source?.book === "mt"); assert.equal(r.length, 1, `one ${n}`); return r[0]; };

// One folder each, with every entry of the treasure chapter.
for (const [n, count] of [["Named Uniques", 63], ["Common Magic Items", 48], ["Cursed Items", 19], ["Artefacts", 24], ["Growing Uniques", 19]]) {
  assert.ok(folders[n], `folder ${n}`);
  assert.equal(inFolder(n).length, count, `${n}: ${inFolder(n).length}`);
}
assert.ok(!items.some(d => d.name.startsWith("Portal keys")), "the portal-key note isn't an item");

// The 20 older Named Uniques keep their ids.
assert.equal(item("Soulthief")._id, "A1UOf2nZ9BjmRn3k");
assert.equal(item("Wyrmsbane")._id, "DQDfij4VOBfT2fQk");

// Named Uniques on their base: weapons, armour, or a plain item.
assert.equal(item("Ironfang").type, "weapon");
assert.equal(item("Ironfang").flags.arneyan.baseWeapon, "Pick, Heavy");
assert.equal(item("Helldusk Armour").type, "armour");
assert.equal(item("Helldusk Armour").system.magic, 2);
assert.equal(item("Viconia's Walking Fortress").flags.arneyan.baseArmour, "Shield, Large Steel");
assert.equal(item("The Holy Symbol of Ravenkind").type, "equipment");
assert.equal(item("The Sunsword").system.damageType, "radiant");
assert.equal(item("The Sunsword").system.magic, 2);
assert.equal(item("The Staff of Defence").system.magic, 0);
for (const d of inFolder("Named Uniques")) assert.equal(d.system.price, "Unique (never for sale)", d.name);

// Artefacts: never for sale; a weapon on its base where it has one; drawback and destruction shown.
assert.equal(item("Wand of Orcus").type, "weapon");
assert.equal(item("Wand of Orcus").system.magic, 3);
assert.deepEqual(item("Wand of Orcus").system.bonusDamage.map(b => [b.formula, b.type]), [["2d6", "necrotic"]]);
assert.equal(item("Invulnerable Coat of Arnd").type, "armour");
assert.ok(item("Eye of Vecna").system.description.includes("<strong>Drawback:</strong>"));
assert.ok(item("Eye of Vecna").system.description.includes("<strong>Destroyed:</strong>"));
assert.equal(item("Throne of the Gods").system.slots, 0);

// Growing Uniques: three states in the text, the bonus for each in a flag, the item at its Dormant bonus.
const g = item("Grovelthrash");
assert.equal(g.type, "weapon");
assert.equal(g.system.magic, 1);
assert.deepEqual(g.flags.arneyan.growing, { dormant: 1, awakened: 2, exalted: 3 });
for (const st of ["Dormant", "Awakened", "Exalted"]) assert.ok(g.system.description.includes(`<strong>${st}</strong>`), st);
assert.deepEqual(item("The Mace of the Black Crown").system.bonusDamage.map(b => [b.formula, b.type, b.when]), [["1d6", "fire", ""]]);
assert.equal(item("Verminshroth").type, "armour");
assert.equal(item("Danoth's Visor").type, "equipment");
assert.equal(item("Danoth's Visor").flags.arneyan?.growing, undefined);

// Common items: 5 gp unless the entry says, small ones bundled, wand charges, the Moon-Touched Sword a sword.
assert.equal(item("Candle of the Deep").system.price, "5 gp");
assert.equal(item("Dark Shard Amulet").system.price, "10 gp");
assert.equal(item("Walloping Ammunition").system.price, "2 sp each");
assert.equal(item("Bead of Nourishment").system.bundle, 5);
assert.equal(item("Wand of Pyrotechnics").system.charges.max, 7);
const moon = item("Moon-Touched Sword");
assert.equal(moon.type, "weapon");
assert.equal(moon.system.magic, 0);
assert.ok(moon.system.toggle && moon.system.modeLight === 15);

// Cursed items: unidentified, passing for what they imitate, valued as it.
const bag = item("Bag of Devouring");
assert.equal(bag.system.identified, false);
assert.equal(bag.system.unidentifiedName, "Bag of Holding");
assert.ok(bag.system.unidentifiedDescription.includes("extradimensional"), "players read the Bag of Holding's text");
assert.equal(bag.system.price, items.find(d => d.name === "Bag of Holding").system.price);
const axe = item("Berserker Axe");
assert.equal(axe.type, "weapon");
assert.equal(axe.system.unidentifiedName, "Battle axe +1");
assert.equal(axe.system.price, "45 gp");
assert.equal(item("Shield of Missile Attraction").system.price, "40 gp");
for (const d of inFolder("Cursed Items")) assert.equal(d.system.identified, false, d.name);

// No em dash in any of them.
for (const d of items.filter(d => d.system.source?.book === "mt")) assert.ok(!/—/.test(JSON.stringify(d.system)), d.name);

// Monsters: 573, the new ones there, Entropy as R-B76, the Bheur Hag's Nature and the odd skills as attribute checks.
const mons = read("monsters").filter(d => d.type === "npc");
assert.equal(mons.length, 573);
const mon = n => { const m = mons.find(d => d.name === n); assert.ok(m, n); return m; };
for (const n of ["Hive Mother", "Elder Orb", "Ssendam, Slaad Lord", "Ygorl, Slaad Lord", "Githzerai Anarch", "Drow Matron Mother",
  "Nihileth", "Storm Giant Quintessent", "Molydeus", "Baelnorn", "Primus", "Crystal Dragon, Ancient", "Amethyst Dragon, Adult"]) mon(n);
const entropy = mon("Ygorl, Slaad Lord").items.find(i => i.name === "Entropy");
assert.ok(entropy.system.description.includes("deals only its weapon die, with no attribute modifier, until mended"));
assert.ok(!/−1|-1 damage/.test(entropy.system.description), "no flat −1");
assert.ok(mon("Bheur Hag").items.some(i => i.type === "skill" && /Nature/.test(i.name)), "the Bheur Hag's Nature");
assert.match(mon("Gazer").system.details.treasure, /<strong>(-|N)<\/strong>/, "no treasure (N since M&T v0.10.65)");

// Book II: legendary magic includes "an artefact" (K113).
const b2 = read("rules").find(d => d.name === "Book II: Character Creation") ?? read("rules").find(d => /Book II/.test(d.name));
assert.ok(JSON.stringify(b2).includes("an artefact"), "Beyond Mortal Limits says an artefact");
assert.ok(!JSON.stringify(b2).includes("a relic of power"));
console.log("books0164 ok");

// Review fixes (0.10.100): Gurt's own damage, Heavy slots, the Sword of Kas rider, charges, the Vacuous Grimoire.
const gurt = item("Gurt's Greataxe");
assert.equal(gurt.system.damage, "3d12");
assert.deepEqual(gurt.system.bonusDamage.map(b => [b.formula, b.type]), [["1d6", "cold"]]);
assert.equal(gurt.system.slots, 4);
assert.equal(item("Matalotok").system.slots, 3);
assert.equal(item("Balduran's Giantslayer").system.slots, 3);
assert.equal(item("The Icon of Ravenloft").system.slots, 2);
assert.deepEqual(item("Sword of Kas").system.bonusDamage.map(b => [b.formula, b.when]), [["2d10", "against Vecna's servants and the undead"]]);
assert.deepEqual([item("The Holy Symbol of Ravenkind").system.charges.max, item("The Holy Symbol of Ravenkind").system.charges.recharge], [5, "1d4"]);
assert.equal(item("Talisman of Pure Good").system.charges.max, 7);
const vg = item("Vacuous Grimoire");
assert.equal(vg.system.unidentifiedName, "Spellbook");
assert.equal(vg.system.price, items.find(d => d.name === "Spellbook, blank").system.price);
assert.ok(mons.every(m => m.items.every(i => !/^<p>A [AEIOU]/.test(i.system?.description ?? ""))), "An Insight check");
console.log("books0164 review fixes ok");

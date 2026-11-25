// HB 0.10.94 and 0.10.95, M&T 0.10.89, K&K 0.5.8 (S-F9, S-F10; R-S12 to R-S22) in the system (0.10.136).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
for (const k of ["Actor", "Item", "Combatant", "ChatMessage"]) globalThis[k] ??= class {};

const read = dir => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith("items_") || f.startsWith("actors_"))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const pack = Object.fromEntries(["spells", "feats", "equipment", "kits", "actions", "ancestries", "monsters"].map(p => [p, read(p)]));
const one = (p, n) => { const r = pack[p].filter(d => d.name === n); assert.equal(r.length, 1, `one ${n} in ${p}`); return r[0]; };
const none = (p, n) => assert.ok(!pack[p].some(d => d.name === n), `${n} is gone from ${p}`);
const lock = JSON.parse(fs.readFileSync(new URL("../build/site.lock", import.meta.url), "utf8"));
assert.deepEqual(lock.books, { HB: "0.10.95", MT: "0.10.89", KK: "0.5.8" });

/* Gone, and their ids not reused. */
for (const [p, n, id] of [["spells", "Open/Close", "UtjRPPHpnuJ813iR"], ["spells", "Dismissal", "nkbTY84hVJUkgLEG"], ["feats", "Blood Magic", "jhJ7Tl00cgGly3kl"],
  ["equipment", "Ring of Swimming", "9Ov7HWkacmSOq9va"], ["equipment", "Ring of Jumping", "D3zrYB5V334tdj2P"]]) {
  none(p, n);
  assert.ok(!Object.values(pack).flat().some(d => d._id === id), `${n}'s id`);
}
// Bag of Transmuting: a cursed M&T item now, keeping the id it had in the Catalogue.
const bag = one("equipment", "Bag of Transmuting");
assert.equal(bag._id, "RHYeS1xC0J3NQY1A");
assert.equal(bag.system.identified, false);
assert.equal(bag.system.unidentifiedName, "Bag of Holding");
// Berserker Axe and Sword of Vengeance seem Uniques; still weapons on their base.
assert.equal(one("equipment", "Berserker Axe").flags.arneyan.baseWeapon, "Axe, Battle");
assert.equal(one("equipment", "Sword of Vengeance").flags.arneyan.baseWeapon, "Sword, Long");

/* S-F9: the deity kits renamed, ids kept. */
for (const [n, id] of [["Deity: Brigh (Cleric)", "Nex4UELjP2glRKa4"], ["Deity: Brigh (Paladin)", "MCKRbFLyMiZux0Ki"],
  ["Deity: Mystra (The Woven Turn) (Cleric)", "eXnwrkDsTYNjO6WQ"], ["Deity: Mystra (The Woven Turn) (Paladin)", "NkWIjalCtasB26kT"]]) assert.equal(one("kits", n)._id, id, n);

const Mg = await import("../arneyan/module/migrate.mjs");
assert.deepEqual(Mg.RENAMED_FEATURES["Compendium.arneyan.kits.Item.eXnwrkDsTYNjO6WQ"], [["Deity: Mystra (Cleric)"], "Deity: Mystra (The Woven Turn) (Cleric)"], "world copies renamed");
assert.deepEqual(Mg.RENAMED_FEATURES["Compendium.arneyan.kits.Item.MCKRbFLyMiZux0Ki"], [["Deity: Brigh (The Crafted Turn) (Paladin)"], "Deity: Brigh (Paladin)"]);

/* Spells (R-S12, R-S13). */
const sp = n => one("spells", n).system;
assert.ok(sp("Mage Hand").classes.includes("Sorcerer") && /opens or closes/.test(sp("Mage Hand").description));
assert.ok(sp("Banishment").classes.includes("Paladin"));
assert.equal(sp("Aid").damage, "", "Aid's dice are temporary HP, not damage");
assert.equal(sp("Fire Trap").damage, "(min(@cl, 10))d6");
assert.equal(sp("Hellish Rebuke").damage, "2d10");
assert.equal(sp("Hellish Rebuke").save, "");
assert.match(sp("Spike Stones").description, /rolls one <strong>5ft<\/strong> of movement/);
assert.equal(sp("Obscuring Mist").template.attached, true, "the mist moves with you");
const approved = JSON.parse(fs.readFileSync(new URL("../build/effects/approved.json", import.meta.url), "utf8"));
const aid = approved["spells/w1q43lsWVCiOgl2M"].applies[0].rules;
assert.deepEqual(aid.map(r => r.key), ["attack", "save", "hp.temp"]);
assert.equal(aid[2].value, "1d8 + min(@cl, 10)");
const E = await import("../arneyan/module/effects.mjs");

/* Feats (R-S14). */
const ft = n => one("feats", n).system;
assert.equal(ft("Cross-Trained").uses.max, 2);
assert.equal(ft("Cross-Trained").uses.per, "day");
assert.ok(one("feats", "Mounted Combatant"));
assert.deepEqual(ft("Steady Focus").rules.map(r => [r.key, String(r.value)]), [["concentration.ignore", "10"]]);
assert.deepEqual(approved["feats/oUf51A1TIhwgIV8R"].applies[0].statuses, ["frightened"]);
assert.match(ft("Intimidating Presence").activities[0].text, /Frightened until the end of its next turn/);
const { ARNEYAN } = await import("../arneyan/module/config.mjs");
assert.ok(Object.values(ARNEYAN.ruleKeys).flat().includes("concentration.ignore"));
const docs = fs.readFileSync(new URL("../arneyan/module/documents.mjs", import.meta.url), "utf8");
assert.ok(docs.includes('this.mods?.best?.("concentration.ignore")'));
const DT = await import("../arneyan/module/downtime.mjs");
assert.ok(!DT.UNTEACHABLE.includes("Blood Magic"));

/* Items and weapons (R-S15, R-S16). */
const eq = n => one("equipment", n).system;
assert.deepEqual(eq("Ring of Protection").rules.map(r => [r.key, r.value]), [["ac", "1"], ["save", "1"]]);
assert.equal(eq("Man Catcher").traits, "Two-handed, Reach, Entangling", "the Capture note isn't a trait");
assert.match(eq("Man Catcher").description, /Capture: on a hit you may grapple/);
assert.equal(eq("Sleeve Tangler").traits, "Entangling, Reach, Sunder, Two-handed");
assert.equal(eq("Maul").damage, "2d6");
assert.equal(eq("Katar").damage, "1d6+1");
assert.equal(eq("Katar").ability, "str");
assert.equal(eq("Sickle").ability, "finesse");
assert.equal(eq("Hide").ac, 4);
const { traitList } = await import("../arneyan/module/forge.mjs");
// Every trait the weapon pass names is one the system knows (notes after a semicolon aren't traits).
for (const d of pack.equipment.filter(d => d.type === "weapon" && !d.system.ranged)) for (const t of traitList(String(d.system.traits).split(";")[0]))
  assert.ok(ARNEYAN.weaponTraits[t] || ARNEYAN.weaponMaterials[t], `${d.name}: ${t}`);

// Item AC and save bonuses don't stack: the best of each counts (Ioun Stones aside).
{
  const gear = (name, rules) => ({ name, type: "equipment", system: { equipped: true, rules } });
  const ring = () => gear("Ring of Protection", [{ key: "ac", value: "1" }, { key: "save", value: "1" }]);
  const sum = (items, key) => E.collectRules({ type: "character", items, system: {} }).filter(r => r.key === key).reduce((t, r) => t + Number(r.value), 0);
  assert.equal(sum([ring(), ring()], "ac"), 1, "two rings: +1 AC");
  assert.equal(sum([ring(), ring()], "save"), 1, "two rings: +1 saves");
  assert.equal(sum([ring(), gear("Cloak of Charms", [{ key: "ac", value: "2" }])], "ac"), 2, "the best item bonus");
  assert.equal(sum([ring(), gear("Ioun Stone (Protection)", [{ key: "ac", value: "1" }])], "ac"), 2, "an Ioun Stone stacks");
  assert.equal(sum([ring(), { name: "Shield +1", type: "armour", system: { equipped: true, rules: [{ key: "ac", value: "1" }] } }], "ac"), 2, "armour and shields stack");
  assert.equal(E.collectRules({ type: "character", items: [ring(), gear("Amulet", [{ key: "save", value: "2", when: "vs poison" }])], system: {} }).filter(r => r.key === "save").length, 2, "a bonus with a when stays");
}

/* Codex (R-S20): three-quarters cover; Overbear once, in the Manoeuvres. */
await import("../arneyan/module/combat.mjs");
assert.deepEqual(ARNEYAN.conditions.threequarter.rules, [{ key: "adv.against", value: -1 }, { key: "adv.save.ref", value: 1 }]);
assert.ok(fs.existsSync(new URL("../arneyan/assets/conditions/threequarter.svg", import.meta.url)));
assert.equal(pack.actions.filter(d => d.name === "Overbear").length, 1);
assert.match(one("actions", "Overbear").system.description, /against a creature you have <strong>Restrained<\/strong>/);
assert.match(one("actions", "Overbear").system.description, /To knock a <strong>Restrained<\/strong> target down/);
const aw = await import("../arneyan/module/awareness.mjs");
assert.ok(aw.HIDE_TIERS.every(t => !t.holds.includes("total cover")));

/* Ancestries (R-S18) and their world update. */
const M = await import("../arneyan/module/migrate.mjs");
assert.equal(M.LOW_LIGHT_ANCESTRIES.size, 11);
for (const a of pack.ancestries) {
  const low = M.LOW_LIGHT_ANCESTRIES.has(`Compendium.arneyan.ancestries.Item.${a._id}`);
  if (low) assert.equal(a.system.vision, "Low-Light", a.name);
  else if (["Dwarf", "Duergar", "Kobold", "Goblin", "Tiefling", "Orc"].includes(a.name)) assert.match(a.system.vision, /Darkvision/, a.name);
}
assert.match(one("ancestries", "Mindryath").system.traitList.find(t => /Feywild/.test(t.text)).text, /matching point/);
const gnome = { type: "ancestry", id: "a1", _stats: { compendiumSource: "Compendium.arneyan.ancestries.Item.6EcXJH1hl7Chebhv" }, system: { vision: "Darkvision 60ft" } };
const dwarf = { type: "ancestry", id: "a2", _stats: { compendiumSource: "Compendium.arneyan.ancestries.Item.ChXzUEV5uEj1Q3th" }, system: { vision: "Darkvision 60ft" } };
assert.deepEqual(M.lowLightFix({ system: { details: { senses: "Darkvision 60ft" } }, items: [gnome] }),
  { update: { "system.details.senses": "Low-Light" }, items: [{ _id: "a1", "system.vision": "Low-Light" }] });
assert.deepEqual(M.lowLightFix({ system: { details: { senses: "Darkvision 120ft (cursed)" } }, items: [gnome] }).update, {}, "a GM's own senses line stays");
assert.equal(M.lowLightFix({ system: { details: { senses: "Darkvision 60ft" } }, items: [dwarf] }), null, "a Dwarf keeps darkvision");
assert.equal(M.lowLightFix({ system: { details: { senses: "" } }, items: [{ ...gnome, system: { vision: "Low-Light" } }] }), null, "already done");
assert.equal(M.GONE_0195.size, 5);
assert.equal(M.BOOKS_0195, JSON.parse(fs.readFileSync(new URL("../arneyan/system.json", import.meta.url), "utf8")).version);

/* Travel (R-S13): the Codex row is Shadow Walk. */
const V = await import("../arneyan/module/travel.mjs");
assert.equal(V.METHODS.umbral, "Shadow Walk");
assert.equal(V.hexesPerDay("umbral", "normal"), 24);

/* Monsters (R-S21). */
for (const [n, b] of [["Quipper Swarm", 6], ["Poisonous Snake Swarm", 6], ["Giant Octopus", 7], ["Beholder Zombie", 8], ["Rakshasa", 15], ["Faerie Dragon", 5]])
  assert.equal(one("monsters", n).system.attributes.attack, b, n);
console.log("OK HB 0.10.95 sync");

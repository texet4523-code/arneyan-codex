// 0.10.28: the books v0.10.0 (20 Oct), mirrored: the compendiums and the rules that changed.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeItem, makeActor } from "./harness.mjs";

const src = p => new URL(`../packs-src/${p}/`, import.meta.url).pathname;
const docs = pack => fs.readdirSync(src(pack)).map(f => JSON.parse(fs.readFileSync(path.join(src(pack), f), "utf8"))).filter(d => d.system);
const strip = h => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const one = (pack, name) => docs(pack).find(d => d.name === name);
for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};

const { ARNEYAN } = await import("../arneyan/module/config.mjs");
const E = await import("../arneyan/module/effects.mjs");
const IM = await import("../arneyan/module/data/item-models.mjs");
const { CharacterData } = await import("../arneyan/module/data/actor-models.mjs");
const CB = await import("../arneyan/module/combat.mjs");

// Kit names lose their dashes.
assert.ok(!docs("kits").some(d => d.name.includes("—")), "no kit name has a dash");
assert.ok(one("kits", "Gladiator, The Pit-Forged (Fighter)"));
// Twin Nock: each arrow gets Bow Mastery's bonus (on Bow Mastery's own scale), never twice.
const twin = one("class-features", "Twin Nock");
assert.ok(strip(twin.system.description).includes("Each arrow gets your Bow Mastery bonus."));
assert.deepEqual([twin.system.activities[0].damageBonus, twin.system.activities[0].noStack], ["1:1, 6:2, 12:3, 18:4", "Bow Mastery"]);
// Aura of Devotion covers the Paladin.
const dev = one("class-features", "Aura of Devotion");
assert.ok(strip(dev.system.description).includes("You and allies"));
assert.equal(dev.system.auras[0].includeSelf, true);
// Turn Undead: the Turned condition.
assert.ok(ARNEYAN.conditions.turned && ARNEYAN.conditions.turned.text.includes("moving away"));
for (const d of docs("class-features").filter(d => d.name === "Turn Undead")) assert.deepEqual(d.system.applies[0].statuses, ["turned"], d.system.className);
// Holy Campaign, Combat Dominance, Umberlee, Delay Poison: the new wording.
assert.ok(strip(one("class-features", "Holy Campaign").system.description).includes("Once per year, or once per campaign at the GM's call"));
assert.ok(strip(one("class-features", "Combat Dominance").system.description).includes("half your character Level"));
const umb = one("kits", "Deity: Umberlee (Cleric)").system.features.find(f => /Granted Power/.test(f.name));
assert.ok(strip(umb.description).includes("make a Fortitude save"));
assert.ok(strip(one("spells", "Delay Poison").system.description).includes("Poison taken during the spell is held back too."));
// Warlock on the eight Path spells.
for (const n of ["Burning Hands", "Scorching Ray", "Fireball", "Bind Elemental", "Darkness", "Faerie Fire", "Entangle", "Hypnotism"]) {
  const sp = one("spells", n);
  assert.ok(sp.system.classes.includes("Warlock"), n);
  assert.ok(strip(sp.system.description).includes("Warlock"), `${n}: classes line`);
}
// Mounts with Hit Dice; price ranges say "(by quality)"; Attacks of Opportunity.
assert.equal(one("monsters", "Warpony").system.hd, "2d8+2");
assert.ok(docs("equipment").filter(d => /\(by quality\)/.test(d.system.price ?? "")).length >= 10);
assert.ok(strip(one("actions", "Attack of Opportunity").system.description).includes("Only a creature with a feature that grants one"));
// Big Wen: Steady Hand's point moved to Wisdom by the starting cap (Strength 18, Wisdom 14).
const wen = docs("pregens").find(d => d.name.includes("Big Wen"));
assert.deepEqual(wen.items.find(i => i.name === "Steady Hand").system.abilityChoice, { options: ["str", "dex"], value: "str", moved: "wis" });
// Stored scores leave out the moved point, which lands on the attribute it moved to: Strength 18, Wisdom 13 + 1.
assert.equal(wen.system.abilities.str.value, 18);
assert.equal(wen.system.abilities.wis.value, 13);
const rook = docs("pregens").find(d => d.name === "Rook Halloway");
assert.equal(rook.system.abilities.dex.value, 18, "Rook keeps his printed Dexterity 18");
assert.equal(rook.system.abilities.str.value, 12, "Rook's printed Strength 13 includes the moved point");

// A creation feat's bonus moved by the 18 cap counts where it went.
assert.deepEqual(E.chosenRules({ rules: [{ key: "ability.con", value: "1" }, { key: "hp.level", value: "1" }], abilityChoice: { options: [], value: "", moved: "dex" } }).map(r => r.key), ["ability.dex", "hp.level"]);
assert.deepEqual(E.chosenRules({ rules: [{ key: "ability.str", value: "1" }], abilityChoice: { options: ["str", "dex"], value: "str", moved: "wis" } }).map(r => r.key), ["ability.wis"]);
assert.deepEqual(E.chosenRules({ rules: [{ key: "ability.str", value: "1", when: "vs grapples" }], abilityChoice: { options: [], value: "", moved: "wis" } }).map(r => r.key), ["ability.str"], "a conditional bonus stays");

// The pick first, then the move: a move to one of the feat's own options still counts; a penalty stays put.
assert.deepEqual(E.chosenRules({ rules: [{ key: "ability.str", value: "1" }], abilityChoice: { options: ["str", "dex"], value: "str", moved: "dex" } }).map(r => r.key), ["ability.dex"]);
assert.deepEqual(E.chosenRules({ rules: [{ key: "ability.str", value: "1" }, { key: "ability.cha", value: "-1" }], abilityChoice: { options: [], value: "", moved: "wis" } }).map(r => r.key), ["ability.wis", "ability.cha"]);

// The creation cap asks only for a feat on a 1st-level character whose bonus takes a score past 18.
const D = await import("../arneyan/module/documents.mjs");
const capItem = (extra = {}, level = 1, str = 19) => ({ type: "feat", parent: { type: "character", system: { level, abilities: { str: { total: str, value: str } } } },
  system: { rules: [{ key: "ability.str", value: "1" }], abilityChoice: { options: [], value: "", moved: "" } }, ...extra });
assert.deepEqual(D.creationOverflow(capItem()), { from: "str", amount: 1 });
assert.equal(D.creationOverflow(capItem({}, 2)), null, "not past 1st level");
assert.equal(D.creationOverflow(capItem({}, 1, 18)), null, "18 is fine");
assert.equal(D.creationOverflow(capItem({ type: "equipment" })), null, "only feats");
const movedItem = capItem(); movedItem.system.abilityChoice.moved = "wis";
assert.equal(D.creationOverflow(movedItem), null, "already moved");

// Old wording gone: Twin Nock's per-arrow table, Never Still's per-arrow bonus, the old Attack of Opportunity trigger.
const allText = pack => JSON.stringify(docs(pack));
for (const pack of ["classes", "class-features", "pregens"]) assert.ok(!/per-arrow/i.test(allText(pack)), `${pack}: no per-arrow bonus left`);
assert.ok(strip(one("class-features", "Never Still").system.description).includes("each still carrying your Bow Mastery bonus"));
const aoo = strip(one("actions", "Attack of Opportunity").system.description);
assert.ok(!aoo.includes("A creature that leaves an enemy's melee reach without Disengaging provokes"));
assert.equal(aoo.split("Being moved by someone else").length, 2, "said once");

// Kits renamed by the books keep their old ids (worlds that have them still find them).
assert.equal(one("kits", "Gladiator, The Pit-Forged (Fighter)")._id, "AVBy314CbBUdzNTB");

// Firearms training comes from the 1st-level class.
const cls = name => makeItem(IM.ClassData, "class", name, { levels: 3 });
assert.equal(CB.firearmsTrained(makeActor(CharacterData, "character", {}, [cls("Fighter"), cls("Wizard")])), true);
assert.equal(CB.firearmsTrained(makeActor(CharacterData, "character", {}, [cls("Wizard"), cls("Fighter")])), false, "Fighter levels taken later don't train you");
console.log("OK books v0.10.0");

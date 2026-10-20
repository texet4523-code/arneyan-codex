// Combat rules (Drop 2): pure logic, the actor and sheet hooks, and the pack data it reads.
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeItem, makeActor, hbs, sheetContext } from "./harness.mjs";

const root = new URL("../arneyan/", import.meta.url).pathname;
const { ARNEYAN } = await import("../arneyan/module/config.mjs");
const C = await import("../arneyan/module/combat.mjs");
const { CharacterData, NpcData } = await import("../arneyan/module/data/actor-models.mjs");
const IM = await import("../arneyan/module/data/item-models.mjs");
const packItems = dir => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith("items_"))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));

/* Cover statuses and rule keys. */
for (const id of ["cover", "fullcover", "concealed"]) {
  assert.ok(ARNEYAN.conditions[id], id);
  assert.ok(fs.existsSync(`${root}assets/conditions/${id}.svg`), `${id} icon`);
}
assert.deepEqual(ARNEYAN.conditions.cover.rules, [{ key: "adv.against", value: -1 }]);
assert.deepEqual(ARNEYAN.conditions.fullcover.rules, [{ key: "no.target", value: 1 }]);
for (const k of ["ac.melee", "morale", "no.target", "no.flanked", "no.offhand.dis", "adv.contest.grapple", "firearms.trained"]) assert.ok(ARNEYAN.allRuleKeys.has(k), k);
const covered = makeActor(NpcData, "npc", { attributes: { ac: 12 } }, [], [{ name: "Full Cover", statuses: new Set(["fullcover"]), flags: {} }]);
assert.equal(covered.system.mods.has("no.target"), true, "Full Cover is read from the status");

/* Flanking: directly opposite across the target's space. */
const sq = (x, y, s = 1) => ({ x, y, w: s, h: s });
const T = sq(0, 0);
assert.equal(C.isOpposite(sq(-1, 0), sq(1, 0), T), true, "left and right");
assert.equal(C.isOpposite(sq(0, -1), sq(0, 1), T), true, "above and below");
assert.equal(C.isOpposite(sq(-1, -1), sq(1, 1), T), true, "opposite corners");
assert.equal(C.isOpposite(sq(-1, 0), sq(0, -1), T), false, "side by side round a corner");
assert.equal(C.isOpposite(sq(-1, 0), sq(1, 1), T), false, "left and lower right are not opposite");
assert.equal(C.isOpposite(sq(-1, 0), sq(-1, 1), T), false, "both on the same side");
assert.equal(C.isOpposite(sq(-1, 0), sq(2, 1), sq(0, 0, 2)), true, "across a Large creature");
assert.equal(C.isOpposite(sq(-100, 0, 100), sq(100, 0, 100), sq(0, 0, 100)), true, "pixel sizes");

/* Contests. */
assert.equal(C.contestWinner({ total: 15, natural: 10 }, { total: 15, natural: 12 }), "defender", "ties go to the defender");
assert.equal(C.contestWinner({ total: 16, natural: 10 }, { total: 15, natural: 12 }), "attacker");
assert.equal(C.contestWinner({ total: 8, natural: 20 }, { total: 25, natural: 18 }), "attacker", "a natural 20 always succeeds");
assert.equal(C.contestWinner({ total: 25, natural: 1 }, { total: 3, natural: 2 }), "defender", "a natural 1 always fails");
assert.equal(C.contestWinner({ total: 12, natural: 9 }, { total: 30, natural: 20, autoFail: true }), "attacker", "automatic failure beats a natural 20");
assert.equal(C.sizeAllows("medium", "large"), true);
assert.equal(C.sizeAllows("medium", "huge"), false, "only up to one size larger");
assert.equal(C.sizeAllows("small", "medium"), true);
assert.equal(C.sizeAllows("large", "tiny"), true);
assert.equal(C.hdCount("7d12+28"), 7);
assert.equal(C.hdCount("—", 3), 3);
// A monster uses a save minus half its HD (Codex, Contested Checks).
const ogre = makeActor(NpcData, "npc", { level: 4, hd: "5d8", saves: { fort: 6, ref: 1, will: 2 } });
const op = C.contestParts(ogre, "str", "grapple");
assert.equal(op.total, 6 - 2, "Fortitude 6 minus half of 5 HD");
assert.equal(C.contestParts(ogre, "dex", "grapple").total, 1 - 2);
assert.equal(C.bestChoice(ogre, ["str", "dex"], "grapple"), "str", "defender picks the better");
const fighter = makeActor(CharacterData, "character", { abilities: { str: { value: 16 }, dex: { value: 12 } } });
assert.equal(C.contestParts(fighter, "str", "trip").total, 2);
assert.equal(C.bestChoice(fighter, ["str", "dex"], "trip"), "str");
const frozen = makeActor(CharacterData, "character", { abilities: { str: { value: 18 }, wis: { value: 10 } } }, [], [{ name: "Paralysed", statuses: new Set(["paralysed"]), flags: {} }]);
assert.ok(C.contestParts(frozen, "str", "grapple").fail, "Paralysed fails Strength checks");
assert.equal(C.bestChoice(frozen, ["str", "wis"], "dirty"), "wis", "a choice that fails automatically is never picked");
assert.deepEqual(C.CONTESTS.grapple.def, ["str", "dex"]);
assert.deepEqual(C.CONTESTS.dirty.att, ["dex"]);
assert.deepEqual(C.CONTESTS.dirty.def, ["dex", "wis"]);
assert.equal(C.CONTESTS.grapple.trait, "entangling");
assert.equal(C.CONTESTS.trip.trait, "entangling");
assert.equal(C.CONTESTS.disarm.trait, "sunder");

/* Morale. */
assert.deepEqual(C.moraleResult(7, 0, 8), { effective: 7, breaks: true }, "higher than the score breaks");
assert.deepEqual(C.moraleResult(7, 0, 7), { effective: 7, breaks: false }, "equal holds");
assert.deepEqual(C.moraleResult(7, 1, 8), { effective: 8, breaks: false }, "a bonus raises the score");
assert.deepEqual(C.moraleResult(7, -2, 6), { effective: 5, breaks: true }, "a penalty lowers it");
const cowards = makeActor(NpcData, "npc", { attributes: { morale: 6 } }, [], [{ name: "Demoralised", statuses: new Set(), flags: { arneyan: { rules: [{ key: "morale", value: "-1" }] } } }]);
assert.equal(cowards.system.mods.sum("morale"), -1, "a morale rule plugs in");

/* Firearms. */
const guns = Object.fromEntries(packItems("equipment").filter(i => i.type === "weapon").map(i => [i.name, i]));
const gun = name => ({ ...guns[name], flags: guns[name].flags ?? {} });
assert.deepEqual(C.firearmOf(gun("Pistol")), { threshold: 2, reliable: false, silent: false, reload: "1 rd" });
assert.equal(C.firearmOf(gun("Hand Cannon")).threshold, 4);
assert.equal(C.firearmOf(gun("Rifle")).threshold, 1);
assert.equal(C.firearmOf(gun("Wheellock Pistol")).reliable, true);
assert.equal(C.firearmOf(gun("Wheellock Pistol")).threshold, 1, "Reliable: only a natural 1");
assert.equal(C.firearmOf(gun("Gnomish Wind Rifle")).silent, true);
assert.equal(C.firearmOf(guns["Longsword"] ?? Object.values(guns).find(w => !/misfire/i.test(w.system.description))), null, "not a gun");
assert.equal(C.firearmOf({ ...gun("Pistol"), flags: { arneyan: { misfire: 3 } } }).threshold, 3, "a flag overrides the Catalogue text");
for (const g of Object.values(guns).filter(w => /misfire on \d/i.test(w.system.description) && w.system.damage)) {
  assert.match(g.system.damage, /\d+d\d+x/, `${g.name}: firearm damage dice explode`);
}
const pistol = C.firearmOf(gun("Pistol"));
assert.deepEqual(C.misfireResult(pistol, 2), { jam: true, catastrophe: false, untrainedCrit: false });
assert.deepEqual(C.misfireResult(pistol, 3), { jam: false, catastrophe: false, untrainedCrit: false });
assert.deepEqual(C.misfireResult(pistol, 1), { jam: true, catastrophe: true, untrainedCrit: false });
assert.equal(C.misfireResult(pistol, 20, { trained: false, crit: true }).jam, true, "untrained: a critical jams");
assert.equal(C.misfireResult(pistol, 20, { trained: true, crit: true }).jam, false);
const wind = C.firearmOf(gun("Gnomish Wind Rifle"));
assert.deepEqual(C.misfireResult(wind, 1), { jam: false, catastrophe: false, untrainedCrit: false }, "Silent Mechanism never misfires");
const wheel = C.firearmOf(gun("Wheellock Pistol"));
assert.equal(C.misfireResult(wheel, 2).jam, false);
assert.equal(C.misfireResult(wheel, 1).catastrophe, true, "Reliable still has the natural 1 catastrophe");
assert.equal(C.catastropheFor(1).key, "damaged");
assert.equal(C.catastropheFor(2).key, "damaged");
assert.equal(C.catastropheFor(3).key, "backfire");
assert.equal(C.catastropheFor(4).key, "backfire");
assert.equal(C.catastropheFor(5).key, "destroyed");
assert.equal(C.catastropheFor(6).key, "explodes");
assert.equal(C.noExplode("2d6x"), "2d6");
assert.equal(C.noExplode("3d6x6 + 2"), "3d6 + 2");
// Training.
const ranger = makeActor(CharacterData, "character", {}, [{ type: "class", name: "Ranger", system: { levels: 1 } }]);
assert.equal(C.firearmsTrained(ranger), true);
const wizard = makeActor(CharacterData, "character", {}, [{ type: "class", name: "Wizard", system: { levels: 1 } }]);
assert.equal(C.firearmsTrained(wizard), false);
wizard.flags = { arneyan: { firearmsTrained: true } };
assert.equal(C.firearmsTrained(wizard), true, "backstory or downtime training");
assert.equal(C.firearmsTrained(ogre), true, "monsters use what they carry");

/* Dual wielding and fighting defensively. */
const dagger = makeItem(IM.WeaponData, "weapon", "Dagger", { damage: "1d4", traits: "Light, Finesse, Thrown", equipped: true });
const hatchet = makeItem(IM.WeaponData, "weapon", "Hatchet", { damage: "1d6", traits: "Light, Thrown", equipped: true });
const shield = makeItem(IM.ArmourData, "armour", "Shield", { category: "shield", ac: 1, equipped: true });
assert.equal(C.isLight(dagger), true);
assert.equal(C.isFinesse(dagger), true);
assert.equal(C.isLight(makeItem(IM.WeaponData, "weapon", "Longsword", { traits: "Versatile" })), false);
assert.deepEqual(C.defendOptions(makeActor(CharacterData, "character", {}, [hatchet])), [], "one weapon: no off-hand to defend with");
assert.deepEqual(C.defendOptions(makeActor(CharacterData, "character", {}, [hatchet, makeItem(IM.WeaponData, "weapon", "Longsword", { traits: "Versatile", equipped: true })])), ["light"]);
assert.deepEqual(C.defendOptions(makeActor(CharacterData, "character", {}, [hatchet, dagger])), ["finesse"], "Light Finesse replaces plain Light");
assert.deepEqual(C.defendOptions(makeActor(CharacterData, "character", {}, [shield])), ["shield"]);
const guard = makeActor(CharacterData, "character", { abilities: { dex: { value: 10 } } }, [], [{ name: "Fighting defensively", statuses: new Set(), flags: { arneyan: { defensive: "finesse", rules: [{ key: "ac.melee", value: 1 }] } } }]);
guard.acTotal = guard.system.acTotal;
guard.uuid = "Actor.guard";
assert.equal(C.targetAC(guard, { ranged: false }), guard.system.acTotal + 1, "+1 against melee");
assert.equal(C.targetAC(guard, { ranged: true }), guard.system.acTotal, "nothing against ranged");

/* Non-lethal damage. */
assert.equal(C.subdualState(10, 10), "ko", "equal to current HP knocks out");
assert.equal(C.subdualState(10, 9), "awake");
assert.equal(C.subdualState(0, 20), "", "at 0 HP the dying rules decide");
assert.equal(C.isSubdualWeapon(makeItem(IM.WeaponData, "weapon", "Unarmed Strike", {})), true);
assert.equal(C.isSubdualWeapon(makeItem(IM.WeaponData, "weapon", "Sap", { traits: "Subdual" })), true);
assert.equal(C.isSubdualWeapon(makeItem(IM.WeaponData, "weapon", "Bite", {})), false, "natural weapons are lethal");
for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
const { ArneyanActor } = await import("../arneyan/module/documents.mjs");
const brute = Object.create(ArneyanActor.prototype);
let saved = null;
Object.assign(brute, { name: "Brute", type: "npc", effects: [], flags: { arneyan: { subdual: 3 } }, update: async d => { saved = d; }, _syncDowned: async () => {} });
Object.defineProperty(brute, "system", { value: { attributes: { hp: { value: 12, max: 12, temp: 2 } }, traits: { resist: [], immune: [], vuln: [] }, dr: 0 } });
let res = await brute.applyDamage(7, { type: "bludgeoning", subdual: true });
assert.equal(saved["system.attributes.hp.value"], 12, "HP untouched");
assert.equal(saved["system.attributes.hp.temp"], 0, "temporary HP soaks it first");
assert.equal(saved["flags.arneyan.subdual"], 3 + 5, "the rest goes on the track");
assert.ok(res.line.includes("non-lethal"), res.line);
brute.system.attributes.hp.temp = 0;
res = await brute.applyDamage(4, { type: "bludgeoning" });
assert.equal(saved["system.attributes.hp.value"], 8, "lethal damage as usual");
assert.equal(saved["flags.arneyan.subdual"], undefined);

/* Reactions. */
const actions = Object.fromEntries(packItems("actions").map(i => [i.name, { ...i, flags: i.flags ?? {} }]));
assert.equal(C.isReactionItem(actions["Attack of Opportunity"]), true);
assert.equal(C.isReactionItem(actions["Dodge"]), false);
assert.ok(actions["Dirty Trick"], "Dirty Trick is in the Actions compendium");
for (const n of ["Grapple", "Trip", "Disarm", "Dirty Trick", "Overbear"]) assert.ok(actions[n].system.description.includes("press Use"), n);

/* Actions pack: the Handbook v0.9.9 combat chapter (Book I, Section III), no more and no less. */
const BOOK_ACTIONS = ["Charge", "Disengage", "Dodge", "Hide", "Search", // Combat Manoeuvres: Actions
  "Cleave", "Dirty Trick", "Disarm", "Grapple", "Guard", "Push", "Shield Blow", "Trip", // Manoeuvres
  "Flank Attack", "Receiving Charge", "Shield Wall", // Positioning
  "Ready", "Delay", "Dash", "Attack of Opportunity", "Unarmed Strike", "Overbear", "Break Free", "Fighting Defensively"];
assert.deepEqual(Object.keys(actions).sort(), [...BOOK_ACTIONS].sort(), "the Actions compendium is the book's list");
for (const gone of ["Feint", "Called Shot", "Offensive Focus", "Parry", "Rear Attack", "Charging", "Opportunity Attack"]) assert.ok(!actions[gone], `${gone} is not in the current book`);
assert.equal(actions["Charge"]._id, "UniEPc3NhFzkrGYI", "Charge keeps the old Charging ID");
assert.equal(actions["Attack of Opportunity"]._id, "g8Ifmgn7innIiAZy", "Attack of Opportunity keeps the old Opportunity Attack ID");
assert.equal(actions["Trip"]._id, "oF3I9qCsbxavZOJn", "surviving actions keep their IDs");
assert.ok(actions["Charge"].system.toggle && actions["Charge"].system.rules.some(r => r.key === "adv.attack.first.melee" && r.value === "1"), "Charge: Advantage on the attack");
// Handbook: "make one melee attack with Advantage": the first melee attack only, never a ranged one or every attack.
assert.ok(!actions["Charge"].system.rules.some(r => ["adv.attack", "adv.attack.ranged", "adv.attack.melee"].includes(r.key)), "Charge doesn't give every attack Advantage");
// Push: "instead of dealing damage", so its attack has no damage buttons.
assert.equal(actions["Push"].system.activities[0].noDamage, true, "Push deals no damage");
// Attack of Opportunity (the action and Combat Reflexes' option) and Riposte take the reaction (data, not names).
assert.equal(actions["Attack of Opportunity"].system.activities[0].reaction, true);
const featsPack = Object.fromEntries(packItems("feats").map(i => [i.name, { ...i, flags: i.flags ?? {} }]));
assert.equal(C.isReactionItem({ ...featsPack["Combat Reflexes"], name: "Combat Reflexes" }), true, "Combat Reflexes is a reaction (its activity says so)");
const flourish = packItems("class-features").find(i => i.name === "Flourish Manoeuvres");
assert.equal(C.isReactionItem({ ...flourish, flags: {} }, flourish.system.activities.find(a => a.name === "Riposte")), true, "Riposte takes the reaction");
assert.equal(C.isReactionItem({ type: "ability", name: "Extra Attack", flags: {}, system: { description: "", activities: [{ name: "Extra Attack", kind: "attacks" }] } }), false, "an ordinary attacks option is no reaction");
assert.deepEqual(actions["Search"].system.activities.map(a => [a.kind, a.ability]), [["check", "wis"]], "Search rolls a Wisdom check");
assert.deepEqual(actions["Hide"].system.activities.map(a => [a.kind, a.ability]), [["check", "dex"]], "Hide rolls a Dexterity check");
assert.equal(actions["Break Free"].flags.arneyan?.contest, "escape", "Break Free uses the break-free contest");
assert.ok(C.CONTESTS[actions["Break Free"].flags.arneyan.contest], "a contest combat.mjs knows");
assert.ok(actions["Guard"].system.description.includes("attacks against that ally have Disadvantage"));
assert.ok(actions["Shield Blow"].system.description.includes("10 + half your level"), "Shield Blow states its DC");

/* Sheet: combat tools, off-hand button, non-lethal track; damage card buttons. */
const render = hbs(root);
const { ArneyanActorSheet } = await import("../arneyan/module/sheets.mjs");
for (const f of [dagger]) f.actor = null;
const duel = makeActor(CharacterData, "character", { abilities: { str: { value: 14 }, dex: { value: 16 } } }, [dagger, shield, makeItem(IM.WeaponData, "weapon", "Pistol", { damage: "2d6x", ranged: true, description: "<p>Reload 1 rd, misfire on 1-2.</p>" })]);
duel.flags = { arneyan: { subdual: 4 } };
duel.uuid = "Actor.duel";
const ctx = await sheetContext(ArneyanActorSheet, duel, { _activeTab: "actions" });
assert.equal(ctx.combat.subdual, 4);
assert.ok(ctx.combat.guns && ctx.combat.guns.trained === false);
const html = render("templates/actor/actor-sheet.hbs", ctx);
assert.ok(html.includes('data-action="offhandAttack"'), "Light weapons get an off-hand button");
assert.ok(html.includes('data-action="contest" data-kind="grapple"') && html.includes('data-kind="dirty"') && !html.includes('data-kind="escape"'), "contests (break free only when Restrained)");
assert.ok(!html.includes('data-mode="finesse"') && html.includes('data-mode="shield"'), "dagger and shield: the shield is the off-hand");
assert.ok(html.includes("Non-lethal 4") && !html.includes('name="flags.arneyan.subdual"'), "non-lethal shows as a chip, not a box");
assert.equal(html.includes('data-action="clearSubdual"'), !!globalThis.game?.user?.isGM, "only the GM clears it");
{ const none = render("templates/actor/actor-sheet.hbs", { ...ctx, combat: { ...ctx.combat, subdual: 0 } }); assert.ok(!none.includes("arn-subdual-chip"), "no chip without non-lethal damage"); }
assert.ok(html.includes('name="flags.arneyan.firearmsTrained"'));
assert.ok(typeof ArneyanActorSheet.DEFAULT_OPTIONS.actions.contest === "function" && typeof ArneyanActorSheet.DEFAULT_OPTIONS.actions.rollMorale === "function");
const nctx = await sheetContext(ArneyanActorSheet, cowards, { _activeTab: "actions" });
const nhtml = render("templates/actor/actor-sheet.hbs", nctx);
assert.ok(nhtml.includes('data-action="rollMorale"'), "monster sheet has a Morale button");
const card = d => render("templates/chat/damage-card.hbs", { title: "Fist", damageType: "bludgeoning", formula: "1d2+2", total: 3, parts: [], notes: [], ...d });
assert.ok(card({ subdual: true }).includes("Apply (non-lethal)") && card({ subdual: true }).includes('data-subdual="0"'), "unarmed: non-lethal by default, lethal on request");
assert.ok(card({}).includes('data-subdual="1"') && !card({}).includes("Apply (non-lethal)"), "anything else: non-lethal on request");

console.log("OK combat");

// 0.10.9: a Level up button by the XP bar when XP is full.
{
  const ready = makeActor(CharacterData, "character", { attributes: { xp: 10 } }, [makeItem(IM.ClassData, "class", "Fighter", { levels: 1, xpRate: 10 })]);
  ready.uuid = "Actor.ready";
  const c1 = await sheetContext(ArneyanActorSheet, ready, { _activeTab: "actions" });
  assert.equal(c1.levelReady, true, "XP 10 of 10: ready");
  assert.ok(render("templates/actor/actor-sheet.hbs", c1).includes('data-action="levelUpReady"'), "the button shows");
  const notyet = makeActor(CharacterData, "character", { attributes: { xp: 4 } }, [makeItem(IM.ClassData, "class", "Fighter", { levels: 1, xpRate: 10 })]);
  notyet.uuid = "Actor.notyet";
  const c2 = await sheetContext(ArneyanActorSheet, notyet, { _activeTab: "actions" });
  assert.equal(c2.levelReady, false, "XP 4 of 10: not yet");
  assert.equal(typeof ArneyanActorSheet.DEFAULT_OPTIONS.actions.levelUpReady, "function");
  console.log("OK level up button");
}

// 0.10.18: Crushing Blow and Weapon Specialisation, automated (Kieran, 20 Oct 2026).
{
  const E = await import("../arneyan/module/effects.mjs");
  const D = await import("../arneyan/module/documents.mjs");
  const kits = packItems("kits");
  const cbRules = kits.find(k => k.name === "The Heavy Hand (Fighter)").system.features.find(f => f.name === "Crushing Blow").rules;
  assert.deepEqual(cbRules.map(r => [r.key, r.value, r.weapon]), [["damage.reroll", "2", "two-handed"]], "Crushing Blow is a scoped reroll now");
  assert.ok(ARNEYAN.allRuleKeys.has("damage.reroll"));
  const specSrc = packItems("class-features").find(i => i.name === "Weapon Specialisation");
  assert.equal(specSrc.system.weaponChoice.max, "1:1, 13:2");
  assert.ok(specSrc.system.rules.every(r => r.weapon === "chosen"));
  assert.ok(packItems("equipment").find(i => i.name === "Greatsword").system.traits.includes("Two-handed"), "the Catalogue's two-handed weapons say so");
  assert.ok(!packItems("equipment").find(i => i.name === "Sword, Long").system.traits.includes("Two-handed"), "a Versatile one doesn't");

  // The dice: once each (r, not rr), before an explosion, never twice.
  assert.equal(E.rerollDice("2d6", 2), "2d6r<=2");
  assert.equal(E.rerollDice("1d6+1", 2), "1d6r<=2+1");
  assert.equal(E.rerollDice("2d6x", 2), "2d6r<=2x");
  assert.equal(E.rerollDice("1d8r<=1", 2), "1d8r<=1", "a die that already rerolls stays as it is");
  assert.equal(E.rerollDice("1d8", 0), "1d8");

  const W = (name, sys) => makeItem(IM.WeaponData, "weapon", name, { equipped: true, ...sys });
  const great = W("Greatsword", { damage: "2d6", traits: "Heavy, Two-handed", slots: 2 });
  const magicGreat = W("+1 Greatsword", { damage: "2d6", traits: "Heavy, Two-handed", slots: 2, magic: 1 });
  const longsword = W("Sword, Long", { damage: "1d8", traits: "Versatile", slots: 1 });
  const oldHalberd = W("Halberd", { damage: "1d10", traits: "Reach", slots: 2 });
  const spear = W("Spear", { damage: "1d6", traits: "Reach, Brace, Thrown", slots: 1 });
  assert.equal(E.isTwoHanded(great), true);
  assert.equal(E.isTwoHanded(spear), false);
  assert.equal(E.isTwoHanded(longsword), false, "Versatile in one hand");
  assert.equal(E.isTwoHanded(longsword, { include: ["versatile"] }), true, "Versatile with its two-handed die");
  assert.equal(E.isTwoHanded(oldHalberd), true, "a copy from before the trait: two slots, melee");
  assert.equal(E.weaponKey("Sword, Long"), E.weaponKey("+1 Long Sword"));
  assert.equal(E.weaponKey("Greatsword (specialised)"), "greatsword");

  // Wraps a harness actor in the real Actor methods (weaponDice, damageTerms, attackParts).
  const asActor = a => { const x = Object.create(ArneyanActor.prototype); Object.defineProperty(x, "system", { value: a.system }); x.items = a.items; x.type = a.type; return x; };
  const withFeatures = (level, ...features) => asActor(makeActor(CharacterData, "character", { abilities: { str: { value: 16 } } },
    [makeItem(IM.ClassData, "class", "Fighter", { levels: level }), ...features, great, magicGreat, longsword, oldHalberd, spear]));

  // Crushing Blow: two-handed weapons' own dice reroll 1s and 2s, and the card says so; one-handed weapons don't.
  const crushing = makeItem(IM.AbilityData, "ability", "Crushing Blow", { rules: cbRules, className: "The Heavy Hand (Fighter)" });
  const heavy = withFeatures(3, crushing);
  const gd = heavy.weaponDice(great);
  assert.equal(gd.formula, "2d6r<=2");
  assert.ok(gd.notes[0].startsWith("Crushing Blow: 1s and 2s"), gd.notes[0]);
  assert.equal(heavy.weaponDice(oldHalberd).formula, "1d10r<=2");
  const sd = heavy.weaponDice(spear);
  assert.equal(sd.formula, "1d6", "a one-handed weapon rolls as it is");
  assert.ok(!sd.notes.some(n => n.includes("Crushing Blow")), "and its card says nothing of it");
  assert.equal(heavy.weaponDice(longsword).formula, "1d8", "Versatile in one hand: no reroll");
  assert.equal(heavy.weaponDice(longsword, { include: ["versatile"] }).formula, "1d8r<=2", "Versatile two-handed: rerolled (its extra die is not)");
  assert.equal(withFeatures(3).weaponDice(great).formula, "2d6", "no Crushing Blow, no reroll");

  // Weapon Specialisation: with the picked weapon, +damage and first-attack Advantage for real; otherwise reminders.
  const specWith = value => makeItem(IM.AbilityData, "ability", "Weapon Specialisation", { ...specSrc.system, className: "Fighter", weaponChoice: { max: "1:1, 13:2", value } });
  const f7 = withFeatures(7, specWith(["Greatsword"]));
  const bonus = x => x.filter(t => t.label === "Weapon Specialisation").map(t => t.value);
  assert.deepEqual(bonus(f7.damageTerms(great)), ["+2"], "+2 damage at 7th with the picked weapon");
  assert.deepEqual(bonus(f7.damageTerms(magicGreat)), ["+2"], "a +1 Greatsword is still a Greatsword");
  assert.deepEqual(bonus(f7.damageTerms(spear)), [], "nothing with another weapon");
  assert.deepEqual(f7.system.mods.forWeapon(great).mods.adv("adv.attack.first").values, [1], "first-attack Advantage with it");
  assert.deepEqual(f7.system.mods.forWeapon(spear).mods.adv("adv.attack.first").values, [], "not with the spear");
  assert.equal(f7.system.mods.adv("adv.attack.first").values.length, 0, "never on every weapon");
  assert.ok(f7.weaponDice(spear).notes.some(n => n.includes("with your specialised weapon (Greatsword)")), "the spear's card reminds");
  assert.ok(!f7.weaponDice(great).notes.some(n => n.includes("specialised weapon")), "the greatsword's card doesn't: it applied");
  assert.equal(f7.system.mods.parts("attack").length, 0);
  // No pick yet: reminders only, and the sheet asks.
  const unpicked = specWith([]);
  const f1 = withFeatures(1, unpicked);
  assert.deepEqual(bonus(f1.damageTerms(great)), []);
  assert.ok(f1.weaponDice(great).notes.some(n => n.includes("with your specialised weapon")));
  assert.equal(unpicked.system.needsWeapon, true);
  assert.equal(D.needsWeaponChoice(unpicked), true);
  assert.equal(D.needsWeaponChoice(specWith(["Greatsword"])), false);
  assert.equal(D.needsWeaponChoice(crushing), false, "nothing to pick on other features");
  // A second weapon counts from 13th level only.
  const two = ["Greatsword", "Sword, Long"];
  assert.deepEqual(bonus(withFeatures(12, specWith(two)).damageTerms(longsword)), [], "12th: the first pick only");
  assert.deepEqual(bonus(withFeatures(13, specWith(two)).damageTerms(longsword)), ["+2"], "13th: the second counts");
  assert.deepEqual(bonus(withFeatures(19, specWith(two)).damageTerms(great)), ["+3"], "+3 at 19th");
  assert.deepEqual(E.weaponPicks({ weaponChoice: { max: "1:1, 13:2", value: two } }, 5), ["Greatsword"]);

  // The prompt: a Later stores nothing; a pick is stored.
  const saved = foundry.applications.api.DialogV2.wait;
  const upd = [];
  const it = { name: "Weapon Specialisation", isOwner: true, actor: null, system: { className: "Fighter", weaponChoice: { max: "1:1, 13:2", value: [] }, rules: [] }, update: async d => upd.push(d) };
  foundry.applications.api.DialogV2.wait = async () => ["Maul"];
  assert.deepEqual(await D.promptWeaponChoice(it), ["Maul"]);
  assert.deepEqual(upd, [{ "system.weaponChoice.value": ["Maul"] }]);
  foundry.applications.api.DialogV2.wait = async () => "later";
  assert.equal(await D.promptWeaponChoice(it), null, "Later: nothing stored");
  foundry.applications.api.DialogV2.wait = saved;
  // The sheet row's button.
  const row = render("templates/actor/item-controls.hbs", { system: unpicked.system, editable: true });
  assert.ok(row.includes('data-action="itemChooseWeapon"') && row.includes("Choose weapon"), "Choose weapon on the row until picked");
  assert.ok(!render("templates/actor/item-controls.hbs", { system: specWith(["Greatsword"]).system, editable: true }).includes("Choose weapon"));
  assert.equal(typeof ArneyanActorSheet.DEFAULT_OPTIONS.actions.itemChooseWeapon, "function");
  // The item sheet: one select (two from 13th), the character's weapons offered, the pick selected.
  const { ArneyanItemSheet } = await import("../arneyan/module/sheets.mjs");
  const owned = specWith(["Greatsword"]);
  makeActor(CharacterData, "character", {}, [makeItem(IM.ClassData, "class", "Fighter", { levels: 13 }), owned, W("Greatsword", { damage: "2d6" }), W("Dagger", { damage: "1d4" })]);
  const ictx = await sheetContext(ArneyanItemSheet, owned, { _activeTab: "details" });
  assert.equal(ictx.weaponPick.slots.length, 2, "two picks at 13th");
  const ihtml = render("templates/item/item-sheet.hbs", { ...ictx, editable: true });
  assert.ok(ihtml.includes('class="arn-weapon-pick"') && ihtml.includes('<option value="Greatsword" selected>') && ihtml.includes('<option value="Dagger">') && ihtml.includes("Second weapon"), "the weapon selects");
  console.log("OK Crushing Blow and Weapon Specialisation");
}

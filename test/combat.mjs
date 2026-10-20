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
assert.equal(C.isReactionItem(actions["Parry"]), true);
assert.equal(C.isReactionItem(actions["Opportunity Attack"]), true);
assert.equal(C.isReactionItem(actions["Dodge"]), false);
assert.ok(actions["Dirty Trick"], "Dirty Trick is in the Actions compendium");
for (const n of ["Grapple", "Trip", "Disarm", "Dirty Trick", "Overbear"]) assert.ok(actions[n].system.description.includes("press Use"), n);

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
assert.ok(html.includes('name="flags.arneyan.subdual" value="4"') && html.includes('data-action="clearSubdual"'));
assert.ok(html.includes('name="flags.arneyan.firearmsTrained"'));
assert.ok(typeof ArneyanActorSheet.DEFAULT_OPTIONS.actions.contest === "function" && typeof ArneyanActorSheet.DEFAULT_OPTIONS.actions.rollMorale === "function");
const nctx = await sheetContext(ArneyanActorSheet, cowards, { _activeTab: "actions" });
const nhtml = render("templates/actor/actor-sheet.hbs", nctx);
assert.ok(nhtml.includes('data-action="rollMorale"'), "monster sheet has a Morale button");
const card = d => render("templates/chat/damage-card.hbs", { title: "Fist", damageType: "bludgeoning", formula: "1d2+2", total: 3, parts: [], notes: [], ...d });
assert.ok(card({ subdual: true }).includes("Apply (non-lethal)") && card({ subdual: true }).includes('data-subdual="0"'), "unarmed: non-lethal by default, lethal on request");
assert.ok(card({}).includes('data-subdual="1"') && !card({}).includes("Apply (non-lethal)"), "anything else: non-lethal on request");

console.log("OK combat");

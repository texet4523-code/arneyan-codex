// Books v0.10.25 to v0.10.27 (R-B7, the spendable-power pass; board B-F12 to B-F14) in the system (0.10.68): effects
// that last the encounter, a rage that ends with it, the first attack against a creature at Disadvantage, the Class
// Save DC from the higher key attribute, Arcane Ward, flat poison, out-of-turn wording and the class rework migration.
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeItem, makeActor } from "./harness.mjs";

const chat = [];
globalThis.ChatMessage = { create: async m => { chat.push(m); return m; }, getSpeaker: () => ({}) };
globalThis.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };
for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
globalThis.game.users ??= [];
globalThis.game.users.filter ??= () => [];

const IM = await import("../arneyan/module/data/item-models.mjs");
const { CharacterData } = await import("../arneyan/module/data/actor-models.mjs");
const E = await import("../arneyan/module/effects.mjs");
const C = await import("../arneyan/module/combat.mjs");
const M = await import("../arneyan/module/migrate.mjs");
const packItems = dir => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith("items_"))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const features = packItems("class-features");
const feat = (name, cls) => features.find(i => i.name === name && i.system.className === cls);

/* Level tables in text: an empty step reads as nothing (not "0"). */
assert.equal(E.levelText("Go. {1:, 4:Also rally.}", 3), "Go. ");
assert.equal(E.levelText("Go. {1:, 4:Also rally.}", 4), "Go. Also rally.");

/* "rounds": "encounter": the effect carries the encounter it ends with, and goes when that encounter is deleted. */
{
  game.combat = null;
  const item = { name: "Command (Charisma)", img: "x", uuid: "Item.cmd", system: { description: "" } };
  const data = await E.effectDataFor({ name: "Inspired", target: "target", rounds: "encounter", statuses: [], rules: [{ key: "adv.attack.first", value: "1" }] }, item, { cl: 5 });
  assert.equal(data.flags.arneyan.encounter, "next", "out of combat: ends with the next encounter to end");
  assert.ok(!data.duration, "no round count");
  const gone = [];
  const effects = [{ id: "e1", name: "Inspired", flags: { arneyan: { encounter: "next" } } }, { id: "e2", name: "Bless", flags: { arneyan: { rounds: 10 } } },
    { id: "e3", name: "Exalted", flags: { arneyan: { encounter: "c1" } } }, { id: "e4", name: "Old", flags: { arneyan: { encounter: "c0" } } }];
  effects.has = id => effects.some(e => e.id === id);
  const actor = { uuid: "Actor.a", name: "Sir D", effects, deleteEmbeddedDocuments: async (t, ids) => gone.push(...ids) };
  actor.effects.has = id => effects.some(e => e.id === id);
  const n = await E.endEncounterEffects({ id: "c1", combatants: [{ actor }, { actor }] });
  assert.equal(n, 2);
  assert.deepEqual(gone, ["e1", "e3"], "this encounter's and the 'next' ones; not Bless, not another encounter's");
}

/* A switch that lasts the encounter (Rage: rule toggle.ends) goes off when the encounter ends. */
{
  const rage = feat("Rage", "Barbarian");
  assert.ok(rage.system.toggle && rage.system.rules.some(r => r.key === "toggle.ends" && r.value === "encounter"), "Rage lasts the encounter");
  const calls = [];
  const items = [{ id: "r", type: "ability", system: { toggle: true, active: true, rules: rage.system.rules, uses: { per: "day", value: 1, max: 2 } } },
    { id: "s", type: "ability", system: { toggle: true, active: true, rules: [], uses: { per: "", value: 0, max: 0 } } }];
  await C.resetEncounterUses({ combatants: [{ actor: { uuid: "Actor.b", name: "Barb", items, updateEmbeddedDocuments: async (t, u) => calls.push(u) } }] });
  assert.deepEqual(calls, [[{ _id: "r", "system.active": false }]], "Rage switches off; a stance doesn't");
}

/* The first attack against a creature each round: counted from this round's attack cards. */
{
  const target = { uuid: "Actor.t" };
  const fight = { id: "f1", round: 2, started: true, combatants: [{ actor: target }] };
  game.combats = { contents: [fight] }; game.combat = fight;
  const msg = (melee, uuid = "Actor.t", stamp = "f1.2") => ({ flags: { arneyan: { kind: "attack", melee, stamp, targets: [{ uuid }] } } });
  game.messages = { contents: [msg(true), msg(false), msg(true, "Actor.x"), msg(true, "Actor.t", "f1.1")] };
  assert.equal(C.attacksAgainst(target), 2, "two this round");
  assert.equal(C.attacksAgainst(target, { melee: true }), 1, "one of them melee");
  game.messages = { contents: [] }; game.combat = null; game.combats = { contents: [] };
  const ev = feat("Evasive Manoeuvre", "Rogue");
  assert.ok(ev.system.rules.some(r => r.key === "adv.against.first.melee" && Number(r.value) < 0));
  const cascade = feat("Arcane Cascade", "Magus");
  assert.ok(cascade.system.applies[0].rules.some(r => r.key === "adv.against.first"));
  const docs = fs.readFileSync(new URL("../arneyan/module/documents.mjs", import.meta.url), "utf8");
  assert.ok(docs.includes('tm.adv(...firstKeys)') && docs.includes('tm.sum("against.first.count")'), "rollAttack reads it");
  const combat = fs.readFileSync(new URL("../arneyan/module/combat.mjs", import.meta.url), "utf8");
  assert.ok(combat.includes('finesse: { label: "Light Finesse off-hand weapon", rules: [R("adv.against.first.melee", -1)]'), "Fighting Defensively, Light Finesse (K15)");
  assert.ok(combat.includes('shield: { label: "Shield", rules: [R("adv.against.first", -1)'), "Fighting Defensively, shield (K15)");
}

/* Class Save DC: the higher key attribute (a Fighter's Strength or Dexterity); martial DC: Strength or Dexterity. */
{
  const fighter = makeItem(IM.ClassData, "class", "Fighter", { levels: 6, keyAbility: "str" });
  const f = makeActor(CharacterData, "character", { abilities: { str: { value: 10 }, dex: { value: 16 } } }, [fighter]);
  assert.equal(f.system.classDC, 10 + 3 + f.system.abilities.dex.mod, "Dexterity, the higher of the two");
  const knight = makeItem(IM.ClassData, "class", "Knight", { levels: 4, keyAbility: "cha" });
  const k = makeActor(CharacterData, "character", { abilities: { str: { value: 16 }, cha: { value: 12 }, dex: { value: 8 } } }, [knight]);
  assert.equal(k.system.classDC, 10 + 2 + k.system.abilities.str.mod, "a Knight's Strength beats its Charisma");
  assert.equal(k.system.martialDC, 10 + 2 + k.system.abilities.str.mod);
  assert.equal(k.system.getRollData().martialDC, k.system.martialDC);
  const wiz = makeItem(IM.ClassData, "class", "Wizard", { levels: 4, keyAbility: "int" });
  const w = makeActor(CharacterData, "character", { abilities: { int: { value: 15 }, str: { value: 18 } } }, [wiz]);
  assert.equal(w.system.classDC, 10 + 2 + w.system.abilities.int.mod, "one key attribute: that one");
}

/* Arcane Ward: a passive "cast.temp" rule; the cast gives the temporary HP. */
{
  const ward = feat("Arcane Ward", "Wizard");
  assert.deepEqual(ward.system.rules.map(r => [r.key, r.value]), [["cast.temp", "2"]]);
  const docs = fs.readFileSync(new URL("../arneyan/module/documents.mjs", import.meta.url), "utf8");
  assert.ok(docs.includes('actor.system.mods?.sum?.("cast.temp")') && docs.includes('"system.attributes.hp.temp": ward'));
}

/* Poison: 1d6 a turn, the same every turn (Codex Conditions). */
{
  const K = await import("../arneyan/module/counters.mjs");
  assert.equal(K.POISON_DIE, "1d6");
  const config = fs.readFileSync(new URL("../arneyan/module/config.mjs", import.meta.url), "utf8");
  assert.ok(config.includes("it takes 1d6 poison damage at the start of each turn, the same every turn"));
}

/* Out of turn, not reactions: the chat note, and a feature whose text starts "Once per round, out of turn". */
{
  assert.ok(C.isReactionItem({ type: "ability", name: "Riposte", system: { description: "<p><strong>Effect:</strong> Once per round, out of turn, strike back.</p>", activities: [] }, flags: {} }));
  assert.ok(!C.isReactionItem({ type: "ability", name: "Smite", system: { description: "<p>Spend a use as you attack.</p>", activities: [] }, flags: {} }));
  const docs = fs.readFileSync(new URL("../arneyan/module/documents.mjs", import.meta.url), "utf8");
  assert.ok(docs.includes("is used out of turn: once per round") && !docs.includes("</strong> is a reaction."));
}

/* Auras: Aura of Courage and Steady Voice give Advantage; Divine Monolith Advantage on Will saves (all saves and checks
   from 22nd). */
{
  const aura = (name, cls) => feat(name, cls).system.auras;
  assert.deepEqual(aura("Divine Protection", "Paladin")[0].rules.map(r => [r.key, r.when]), [["adv.save", "vs fear"]]);
  assert.equal(aura("Steady Voice", "Bard")[0].radius, 30);
  assert.ok(aura("Steady Voice", "Bard")[0].rules[0].key === "adv.save");
  assert.deepEqual(aura("Divine Monolith", "Cleric")[0].rules.map(r => r.key), ["adv.save.will", "adv.save", "adv.check", "note.save"]);
}

/* Knight kits: their Command options are stronger versions, no longer replacing a class feature. */
{
  const kits = packItems("kits");
  const hedge = kits.find(k => k.name === "Hedge Knights (Knight)").system.features.find(f => f.name === "Steadfast Courage");
  assert.equal(hedge.replaces ?? "", "");
  assert.deepEqual([hedge.uses.max, hedge.applies[0].rounds, hedge.applies[0].rules[0].key], [0, "encounter", "adv.save"]);
  const wall = kits.find(k => k.name === "Boldock Wall-Knights (Knight)").system.features.find(f => f.name === "Wall-Forged Dread");
  assert.deepEqual([wall.replaces ?? "", wall.uses.max, wall.applies.length], ["", 0, 1]);
  for (const k of kits) for (const f of k.system.features ?? []) assert.ok(!/^<p>[a-z]/.test(f.description ?? ""), `${k.name}: ${f.name} starts with a capital`);
}

/* The class rework runs again for 0.10.68: the features the pools replaced leave a class's list and are listed. */
{
  assert.equal(M.CLASS_REWORK, "0.10.68");
  const inspire = features.find(i => i.name === "Command (Charisma)");
  assert.ok(inspire, "Command is built");
  for (const id of ["ZE561JAXiWa2pFqL", "vjHmF66KtVOxZDDU", "7aWDedO6ICkfxNO3", "v5Af6iwBOG6WQMBU", "rvBtNNIjxzyJA17V"]) assert.ok(M.DROPPED_FEATURES.has(`Compendium.arneyan.class-features.Item.${id}`), id);
  // Activities: blank new fields don't make an older stamp look edited.
  const older = [{ name: "Heal", kind: "heal", formula: "2*@cl", text: "x", minLevel: 0, maxLevel: 0, cost: 1 }];
  assert.equal(M.fingerprint("activities", older), M.fingerprint("activities", [{ ...older[0], effect: "", spendAny: false }]));
  assert.notEqual(M.fingerprint("activities", older), M.fingerprint("activities", [{ ...older[0], effect: "Inspired" }]));
}

console.log("OK 0.10.68 books v0.10.27 (R-B7)");

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
{
  const ms = new E.ModSet([{ key: "note.damage", value: E.levelText("{1:, 17:doubled dice.}", 6), when: "", label: "Honour Attack" }]);
  assert.deepEqual(ms.notesFor("damage"), [], "an empty note isn't shown (Honour Attack before 17th)");
}

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
  // An ally outside the tracker keeps nothing of this encounter's (but a "next" one waits for its own fight).
  const gone2 = [];
  const ally = { uuid: "Actor.c", name: "Ally", effects: [{ id: "x1", name: "Inspired", flags: { arneyan: { encounter: "c1" } } }, { id: "x2", name: "Exalted", flags: { arneyan: { encounter: "next" } } }], deleteEmbeddedDocuments: async (t, ids) => gone2.push(...ids) };
  ally.effects.has = id => ally.effects.some(e => e.id === id);
  game.actors = { contents: [ally] };
  await E.endEncounterEffects({ id: "c1", combatants: [] });
  assert.deepEqual(gone2, ["x1"]);
  game.actors = { contents: [] };
  // Arcane Ward's temporary HP go with the encounter, unless more came from elsewhere.
  const ups = [];
  const wiz = { uuid: "Actor.w", name: "Wiz", flags: { arneyan: { wardTemp: { amount: 6, combat: "c2" } } }, system: { attributes: { hp: { temp: 4 } } }, effects: Object.assign([], { has: () => false }), update: async u => ups.push(u) };
  await E.endEncounterEffects({ id: "c2", combatants: [{ actor: wiz }] });
  assert.equal(ups[0]["system.attributes.hp.temp"], 0);
  ups.length = 0;
  const other = { ...wiz, flags: { arneyan: { wardTemp: { amount: 6, combat: "c9" } } } };
  await E.endEncounterEffects({ id: "c2", combatants: [{ actor: other }] });
  assert.equal(ups.length, 0, "another encounter's ward stays");
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
  assert.ok(docs.includes("firstAgainst(targets[0].actor, { ranged, name: targets[0].name })") && docs.includes("firstAgainst(targets[0].actor, { ranged: false, name: targets[0].name })"), "weapon and touch attacks read it");
  // firstAgainst: an effect counts the attacks since it was put on; a feature's own rule counts this round's; each
  // source its own count.
  {
    const fight2 = { id: "f2", round: 3, started: true, combatants: [] };
    const t = { uuid: "Actor.s", name: "Shieldy" };
    fight2.combatants.push({ actor: t });
    game.combats = { contents: [fight2] }; game.combat = fight2;
    const shield = { name: "Fighting defensively (Shield)", disabled: false, _stats: { createdTime: 1000 }, flags: { arneyan: { expires: { combat: "f2", round: 4, turn: 0 }, rules: [{ key: "adv.against.first", value: "-1" }] } } };
    t.effects = [shield];
    t.system = { mods: new E.ModSet([{ key: "adv.against.first", value: -1, when: "", label: shield.name },
      { key: "adv.against.first.melee", value: -1, when: "", label: "Evasive Manoeuvre" }, { key: "against.first.count", value: 2, when: "", label: "Evasive Manoeuvre" }]) };
    const atk = (time, melee = true, stamp = "f2.3") => ({ timestamp: time, _stats: { createdTime: time }, flags: { arneyan: { kind: "attack", melee, stamp, targets: [{ uuid: "Actor.s" }] } } });
    game.messages = { contents: [atk(900)] };
    let r = C.firstAgainst(t, { ranged: false });
    assert.equal(r.dis.length, 2, "an attack before the shield went up doesn't use it up; Evasive's 2 has 1 left");
    game.messages = { contents: [atk(900), atk(1100)] };
    r = C.firstAgainst(t, { ranged: false });
    assert.deepEqual(r.dis.map(l => l.split(":")[1].trim().split(" (")[0]), [], "shield used; Evasive's two this round used");
    game.messages = { contents: [atk(1100, true, "f2.2"), atk(1200, false, "f2.3")] };
    r = C.firstAgainst(t, { ranged: true });
    assert.equal(r.dis.length, 0, "the shield covered last round's attack, which came after it went up");
    r = C.firstAgainst(t, { ranged: false });
    assert.equal(r.dis.length, 1, "Evasive (melee only, this round's): none melee yet");
    // One lasting the encounter covers the first attack each round, from the newest copy.
    const lect = { name: "Lectured", disabled: false, _stats: { createdTime: 500 }, flags: { arneyan: { encounter: "f2", rules: [{ key: "adv.against.first", value: "1" }] } } };
    t.effects = [lect];
    t.system = { mods: new E.ModSet([{ key: "adv.against.first", value: 1, when: "", label: "Lectured" }]) };
    game.messages = { contents: [atk(600, true, "f2.2"), atk(700, true, "f2.2")] };
    assert.equal(C.firstAgainst(t).adv.length, 1, "a new round: Lectured again");
    game.messages = { contents: [atk(600, true, "f2.2"), atk(800, true, "f2.3")] };
    assert.equal(C.firstAgainst(t).adv.length, 0, "used this round");
    // The server's times: a message's own (client) timestamp doesn't count when the server's is there.
    game.messages = { contents: [{ ...atk(400, true, "f2.3"), timestamp: 9999 }] };
    assert.equal(C.firstAgainst(t).adv.length, 1, "made before Lectured by the server's clock");
    game.messages = { contents: [] }; game.combat = null; game.combats = { contents: [] };
  }
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
  const ranger = makeItem(IM.ClassData, "class", "Ranger", { levels: 4, keyAbility: "str" });
  const r = makeActor(CharacterData, "character", { abilities: { str: { value: 14 }, dex: { value: 18 }, wis: { value: 10 } } }, [ranger]);
  assert.equal(r.system.classDC, 10 + 2 + r.system.abilities.str.mod, "a class's own key attribute (a kit's swap) replaces the book's first");
  const fd = makeActor(CharacterData, "character", { abilities: { str: { value: 18 }, dex: { value: 12 } } }, [makeItem(IM.ClassData, "class", "Fighter", { levels: 4, keyAbility: "dex" })]);
  assert.equal(fd.system.classDC, 10 + 2 + fd.system.abilities.str.mod, "set to the book's second key: both still count");
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

/* Books v0.10.28 to v0.10.30 (K19 to K24): no Arcane Reserve, the old slot table for everyone, the three new always-on
   features, and monster Parry as first-attack Disadvantage. */
{
  assert.ok(!features.some(f => f.name === "Arcane Reserve"), "Arcane Reserve is gone (K19)");
  const wizard = packItems("classes").find(c => c.name === "Wizard");
  assert.deepEqual(wizard.system.slotTable[2].slice(0, 3), [4, 3, 1], "3rd-level Wizard: the v0.10.24 row");
  assert.deepEqual(feat("Arcane Resilience", "Wizard").system.rules.map(r => r.key), ["adv.save"]);
  assert.ok(feat("Potent Cantrips", "Wizard").system.rules[0].value.includes("half damage"));
  assert.ok(feat("Convincing Illusions", "Illusionist").system.rules[0].value.includes("Disadvantage"));
  for (const id of ["OeBvaMJNJnuII8ki", "EYjMeqRHAqP2eDk9"]) assert.ok(M.DROPPED_FEATURES.has(`Compendium.arneyan.class-features.Item.${id}`));
  const monsters = fs.readdirSync(new URL("../packs-src/monsters/", import.meta.url)).filter(f => f.startsWith("actors_")).map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/monsters/${f}`, import.meta.url), "utf8")));
  const mage = monsters.find(m => m.name === "Mage");
  assert.equal(mage.system.spellcasting.slots[1], 5, "a Mage's 1st-level slots: the old table");
  const knight = monsters.find(m => m.name === "Knight");
  assert.deepEqual(knight.items.find(i => i.name === "Parry").system.rules.map(r => [r.key, r.value]), [["adv.against.first.melee", "-1"]]);
  const marilith = monsters.find(m => m.name === "Marilith");
  assert.deepEqual(marilith.items.find(i => i.name === "Parry").system.rules, [], "the Marilith's negating Parry isn't the same");
}

{
  const mig = fs.readFileSync(new URL("../arneyan/module/migrate.mjs", import.meta.url), "utf8");
  assert.ok(mig.includes('"system.rules": o.system.rules, "system.description": o.system.description') && mig.includes("rulesFilled"), "monsters already in a world get Parry's rule, once");
}

console.log("OK 0.10.68 books v0.10.30 (R-B7 and follow-ups)");

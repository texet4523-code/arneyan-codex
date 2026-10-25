// Batch 8 (Kieran, 25 Oct 2026): effects follow-up, feature buttons, firearm reloads, secret group rolls.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

globalThis.Hooks ??= { on() {}, once() {}, callAll() {} };
for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
const E = await import("../arneyan/module/effects.mjs");
const pack = name => { const dir = new URL(`../packs-src/${name}/`, import.meta.url).pathname; return fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(dir + f))); };

/* ---------------- 8.1 Options of the player's choice ---------------- */
{
  const em = pack("class-features").find(d => d.name === "Elemental Mastery").system;
  assert.equal(em.optionChoice.options.length, 6);
  assert.deepEqual(E.chosenRules(em), [], "nothing until the element is picked");
  const picked = { ...em, optionChoice: { ...em.optionChoice, value: ["Cold"] } };
  assert.deepEqual(E.chosenRules(picked).map(r => [r.key, r.value]), [["immune", "cold"]]);
  const inv = pack("class-features").find(d => d.name === "Eldritch Invocations").system;
  const three = { ...inv, optionChoice: { ...inv.optionChoice, value: ["Devil's Sight", "Agonising Blast", "Armour of Shadows"] } };
  assert.equal(E.optionPickMax(inv, 4), 1); assert.equal(E.optionPickMax(inv, 9), 3); assert.equal(E.optionPickMax(inv, 17), 5);
  assert.deepEqual(E.optionPicks(three, 4), ["Devil's Sight"], "only one counts at 4th");
  assert.equal(E.optionPicks(three, 9).length, 3);
  assert.ok(E.chosenRules(three, 9).some(r => r.key === "sense" && /Devil's Sight 60ft/.test(r.value)));
  // A pick the compendium no longer has doesn't count.
  assert.deepEqual(E.optionPicks({ ...inv, optionChoice: { ...inv.optionChoice, value: ["Gone"] } }), []);
  const { refreshFrom } = await import("../arneyan/module/migrate.mjs");
  assert.ok(typeof refreshFrom === "function");
  console.log("OK option choices (Elemental Mastery, Eldritch Invocations)");
}

/* ---------------- 8.1 Expanded Mind, Shifter, Turn Undead ---------------- */
{
  const em = pack("feats").find(d => d.name === "Expanded Mind").system;
  assert.deepEqual(em.rules.map(r => r.key), ["slots.highest"]);
  const ARNEYAN = (await import("../arneyan/module/config.mjs")).ARNEYAN;
  assert.ok(ARNEYAN.allRuleKeys.has("slots.highest"));
  const models = fs.readFileSync(new URL("../arneyan/module/data/actor-models.mjs", import.meta.url), "utf8");
  assert.ok(models.includes('mods.sum("slots.highest")'));
  const sh = pack("ancestries").find(d => d.name === "Shifter").system;
  assert.equal(sh.toggle, false); assert.deepEqual(sh.rules, []);
  const swift = sh.choice.options.find(o => o.name.endsWith("Swiftstride"));
  assert.equal(swift.toggle, true); assert.equal(swift.uses.formula, "max(1, ceil(@level/2))");
  assert.deepEqual(swift.rules.map(r => [r.key, r.value]), [["speed", "15"]]);
  assert.ok(sh.choice.options.find(o => o.name.endsWith("Beasthide")).rules.some(r => r.value === "non-magical 3"));
  // Turned comes off when its turner attacks it.
  const CB = await import("../arneyan/module/combat.mjs");
  const deleted = [];
  const turner = { uuid: "Actor.cleric", name: "Cleric" };
  const zombie = { name: "Zombie", effects: [{ id: "e1", statuses: new Set(["turned"]), flags: { arneyan: { casterUuid: "Actor.cleric" } } }, { id: "e2", statuses: new Set(["turned"]), flags: { arneyan: { casterUuid: "Actor.other" } } }],
    deleteEmbeddedDocuments: async (t, ids) => deleted.push(...ids) };
  game.users = { activeGM: { isSelf: true } };
  globalThis.fromUuidSync = u => (u === "Actor.zombie" ? zombie : null);
  globalThis.ChatMessage = { getSpeakerActor: () => turner, getSpeaker: () => ({}), create: async () => {} };
  assert.equal(await CB.endTurnedOnAttack({ speaker: {}, flags: { arneyan: { kind: "attack", targets: [{ uuid: "Actor.zombie" }] } } }), 1);
  assert.deepEqual(deleted, ["e1"], "only the Turned this attacker gave");
  assert.equal(await CB.endTurnedOnAttack({ speaker: {}, flags: { arneyan: { kind: "check" } } }), 0);
  console.log("OK Expanded Mind, Shifter, Turn Undead");
}
console.log("All batch 8 checks passed.");

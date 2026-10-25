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
/* ---------------- 8.3 Firearm reloads ---------------- */
{
  const R = await import("../arneyan/module/reload.mjs");
  globalThis.ChatMessage = { getSpeaker: () => ({}), create: async () => {}, getSpeakerActor: () => null };
  const gun = (name, desc, traits = "", actorItems = []) => {
    const it = { type: "weapon", name, isOwner: true, flags: {}, system: { description: `<p>${desc}</p>`, traits },
      setFlag: async (s, k, v) => { it.flags[s] = { ...(it.flags[s] ?? {}), [k]: v }; } };
    it.actor = { name: "Gunner", id: "g1", items: [it, ...actorItems] };
    return it;
  };
  const musket = gun("Musket", "Reload 2 rd, misfire on 1-2.");
  assert.equal(R.isReloadable(musket), true);
  assert.deepEqual([R.capacityOf(musket), R.listedRounds(musket), R.reloadRounds(musket)], [1, 2, 2]);
  assert.equal(R.loadedOf(musket), 1, "loaded until fired");
  await R.spendShot(musket);
  assert.equal(R.loadedOf(musket), 0);
  game.combats = { find: () => ({}) }; // in a fight
  await R.startReload(musket);
  assert.deepEqual(R.ammoOf(musket), { loaded: 0, capacity: 1, reloading: 1 }, "this turn and one more");
  await R.advanceReloads(musket.actor);
  assert.deepEqual(R.ammoOf(musket), { loaded: 1, capacity: 1, reloading: 0 }, "done at the next turn");
  // Out of a fight: at once.
  game.combats = { find: () => null };
  await R.spendShot(musket); await R.startReload(musket);
  assert.equal(R.loadedOf(musket), 1);
  // Several shots; Quick Reload; Lightning Reload; heavy crossbow; Paired Pistols.
  const rep = gun("Repeating Pistol", "Reload 4 rd (full), misfire on 1.", "Light, 5 shots per reload");
  assert.equal(R.capacityOf(rep), 5); await R.spendShot(rep); assert.equal(R.loadedOf(rep), 4);
  const carbine = gun("Flintlock Carbine", "Reload 1 rd, misfire on 1-2.", "Quick Reload");
  assert.equal(R.reloadRounds(carbine), 0); await R.spendShot(carbine); assert.equal(R.loadedOf(carbine), 1, "reloads as part of the attack");
  const pistol = gun("Pistol", "Reload 1 rd, misfire on 1-2.", "Light", [{ name: "Lightning Reload" }]);
  assert.equal(R.reloadRounds(pistol), 0, "Lightning Reload: one round faster");
  const rifle = gun("Rifle", "Reload 3 rd, misfire on 1.", "", [{ name: "Lightning Reload" }]);
  assert.equal(R.reloadRounds(rifle), 2);
  const xbow = { type: "weapon", name: "Crossbow, Heavy", system: { description: "", traits: "Armour Piercing" }, flags: {} };
  assert.equal(R.isReloadable(xbow), true); assert.equal(R.reloadRounds(xbow), 1);
  assert.equal(R.isReloadable({ type: "weapon", name: "Crossbow, Light", system: { description: "", traits: "" }, flags: {} }), false);
  const paired = gun("Paired Pistols", "Reload 1 rd ea., misfire on 1-2.", "Light; fired as dual wielding");
  assert.equal(R.capacityOf(paired), 2);
  await R.spendShot(paired); await R.spendShot(paired);
  assert.equal(R.reloadRounds(paired), 2, "one round each");
  const cb = fs.readFileSync(new URL("../arneyan/module/combat.mjs", import.meta.url), "utf8");
  assert.ok(cb.includes("loadedReady(item)") && cb.includes("spendShot(item)"));
  console.log("OK firearm reloads");
}
console.log("All batch 8 checks passed.");

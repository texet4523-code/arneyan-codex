// Kieran, 28 Oct 2026: Last Chance is once per dying episode (one roll, one Luck). A failure leaves only an ally or
// First Aid; stabilised, back to 0 HP or more, or dead, the next time the character is dying is a new chance.
// Runs on its own.
import assert from "node:assert/strict";
import "./harness.mjs";

for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
const chat = [], warns = [];
globalThis.ChatMessage = { create: async m => { chat.push(m); return m; }, getSpeaker: () => ({}) };
globalThis.ui = { notifications: { warn: m => warns.push(m), info: () => {}, error: m => warns.push(m) } };

const { ArneyanActor } = await import("../arneyan/module/documents.mjs");

const mk = ({ hp = -3, luck = 5, stable = false } = {}) => {
  const a = Object.create(ArneyanActor.prototype);
  const flags = {};
  const system = { attributes: { hp: { value: hp, max: 20 }, stable, deathAt: -11, state: "" }, luck: { value: luck } };
  const state = () => { system.attributes.state = system.attributes.hp.value <= system.attributes.deathAt ? "dead" : system.attributes.hp.value < 0 ? (system.attributes.stable ? "stable" : "dying") : system.attributes.hp.value === 0 ? "stable" : ""; };
  state();
  Object.defineProperty(a, "system", { value: system });
  Object.assign(a, {
    name: "Tess", type: "character", flags: { arneyan: flags }, effects: [],
    getFlag: (s, k) => flags[k],
    update: async d => {
      for (const [k, v] of Object.entries(d)) {
        if (k === "system.luck.value") system.luck.value = v;
        else if (k === "system.attributes.stable") system.attributes.stable = v;
        else if (k === "system.attributes.hp.value") system.attributes.hp.value = v;
        else if (k === "flags.arneyan.lastChance") flags.lastChance = v;
        else if (k === "flags.arneyan.-=lastChance") delete flags.lastChance;
      }
      state();
    }
  });
  return a;
};
const roll = natural => async function () { return { flags: { arneyan: { natural, total: natural + 2 } } }; };

// A failed Last Chance: 1 Luck gone, still dying, and no second try this time.
{
  const a = mk();
  a.rollSave = roll(3);
  await a.lastChance();
  assert.equal(a.system.luck.value, 4, "1 Luck burned");
  assert.equal(a.system.attributes.state, "dying");
  assert.ok(chat.at(-1).content.includes("only an ally"), "the card says what's left");
  warns.length = 0;
  await a.lastChance();
  assert.equal(a.system.luck.value, 4, "no second burn");
  assert.ok(warns[0]?.includes("has had their Last Chance"), "told why");
  // An ally stabilises them: the next time they're dying is a new chance.
  game.user = { isGM: true };
  await a.stabilise();
  assert.equal(a.getFlag("arneyan", "lastChance"), undefined, "a new chance after being stabilised");
  // Hurt again while stable: dying again, and Last Chance is there.
  await a.update({ "system.attributes.stable": false, "system.attributes.hp.value": -6 });
  a.rollSave = roll(15);
  await a.lastChance();
  assert.equal(a.system.attributes.stable, true, "a success stabilises");
  assert.equal(a.getFlag("arneyan", "lastChance"), undefined, "and leaves the next episode its own chance");
}
// Healed back to 0 or more after a failed try: the flag goes when HP is synced.
{
  const a = mk();
  a.rollSave = roll(2);
  await a.lastChance();
  assert.equal(a.getFlag("arneyan", "lastChance"), true);
  await a.update({ "system.attributes.hp.value": 4 });
  a._syncDowned = ArneyanActor.prototype._syncDowned;
  globalThis.CONFIG ??= {}; globalThis.CONFIG.statusEffects ??= [];
  await a._syncDowned(-3).catch(() => {});
  assert.equal(a.getFlag("arneyan", "lastChance"), undefined, "healed: a new chance next time");
}
// Still dying (bleeding a point) after a failure: the flag stays.
{
  const a = mk();
  a.rollSave = roll(2);
  await a.lastChance();
  await a.update({ "system.attributes.hp.value": -4 });
  await a._syncDowned(-3).catch(() => {});
  assert.equal(a.getFlag("arneyan", "lastChance"), true, "bleeding doesn't bring it back");
}
// Review: a double click while the first is still on its way gets one roll, not two for one Luck.
{
  const a = mk();
  let rolls = 0;
  a.rollSave = async () => { rolls++; await new Promise(r => setTimeout(r, 20)); return { flags: { arneyan: { natural: 2, total: 4 } } }; };
  const realUpdate = a.update;
  a.update = async d => { await new Promise(r => setTimeout(r, 10)); return realUpdate(d); };
  await Promise.all([a.lastChance(), a.lastChance()]);
  assert.equal(rolls, 1, "one roll");
  assert.equal(a.system.luck.value, 4, "one Luck");
}
// The bleed card doesn't offer it once used.
{
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../arneyan/module/chat.mjs", import.meta.url), "utf8");
  assert.ok(src.includes('actor.getFlag?.("arneyan", "lastChance") ? " They have had their Last Chance this time."'), "bleed card");
}
// The sheet and the help text.
{
  const fs = await import("node:fs");
  const hbs = fs.readFileSync(new URL("../arneyan/templates/actor/actor-sheet.hbs", import.meta.url), "utf8");
  assert.ok(hbs.includes("{{#if lastChanceUsed}}") && hbs.includes("Last Chance used"), "the banner says when it's been used");
  for (const t of [hbs]) assert.ok(!/[–—]/.test(t.split("lastChanceUsed")[1].slice(0, 600)), "no dashes");
}
console.log("OK last-chance");

// Codex v0.10.90, Critical Hits: add the maximum of the weapon's own damage dice; extra dice from features and spells
// (Sneak Attack, Spellstrike, Power Attack's die) are rolled once and never maximised.
import assert from "node:assert/strict";
import "./harness.mjs";
class FakeRoll {
  constructor(f) { this.formula = f; }
  async evaluate() { this.total = 1; this.dice = []; return this; }
  static replaceFormulaData(f) { return String(f); }
}
globalThis.Roll = FakeRoll;
let ctx = null;
foundry.applications.handlebars = { renderTemplate: async (p, c) => { ctx = c; return ""; } };
globalThis.ChatMessage = { create: async d => d, getSpeaker: () => ({}) };
globalThis.game.settings = { get: () => "publicroll" };
const { damageRoll } = await import("../arneyan/module/rolls.mjs");
await damageRoll({ actor: null, item: { name: "Sword", type: "weapon", system: {} }, title: "t", formula: "1d8", crit: true, terms: [{ label: "Sneak Attack", value: "2d6" }] });
assert.deepEqual(ctx.parts.find(p => /Critical/.test(p.label)), { label: "Critical (dice maximised)", value: "+8" }, "only the d8 is maximised");
assert.match(ctx.formula, /^1d8 \+ 2d6 \+ 8$/);
await damageRoll({ actor: null, item: { name: "Sword", type: "weapon", system: {} }, title: "t", formula: "1d8", crit: false, terms: [{ label: "Sneak Attack", value: "2d6" }] });
assert.ok(!ctx.parts.some(p => /Critical/.test(p.label)));
console.log("crit0190: ok");

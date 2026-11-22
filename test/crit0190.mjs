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
// HB v0.10.91 (K296): a magic weapon's or an infusion's extra dice are rolled once and never maximised.
await damageRoll({ actor: null, item: { name: "Flametongue", type: "weapon", system: {} }, title: "t", formula: "1d8", crit: true, damageType: "slashing", extras: [{ formula: "1d6", type: "fire" }] });
assert.equal(ctx.formula, "1d8 + 8 + 1d6 fire", "the d8 maximised, the fire die not");
const { readFileSync } = await import("node:fs");
const docs = readFileSync(new URL("../arneyan/module/documents.mjs", import.meta.url), "utf8");
assert.match(docs, /swap: true/, "Versatile's stepped-up die joins the weapon's own dice (maximised with them)");
console.log("crit0190: ok");

// 0.10.43: players are asked to roll initiative (a window with a Roll initiative button).
import assert from "node:assert/strict";
import "./harness.mjs";
const I = await import("../arneyan/module/initiative.mjs");
const player = { id: "u1", isGM: false };
const c = (name, init, owned, defeated = false) => ({ name, initiative: init, isDefeated: defeated, testUserPermission: (u, l) => owned && l === "OWNER" });
const combat = { id: "c1", combatants: [c("Ilsa", null, true), c("Wolf (Ilsa's)", null, true), c("Rook", 14, true), c("Goblin", null, false), c("Down", null, true, true)] };
combat.combatants.filter = Array.prototype.filter.bind(combat.combatants);
assert.deepEqual(I.waitingFor(combat, player).map(x => x.name), ["Ilsa", "Wolf (Ilsa's)"], "their own, still without one, not the fallen");
assert.deepEqual(I.waitingFor(combat, { isGM: true }), [], "the GM isn't asked");
// The window: asked once per fight; Roll rolls only the ones still waiting.
const rolled = [];
const DialogV2 = foundry.applications.api.DialogV2;
DialogV2.wait = async o => { assert.match(o.content, /Ilsa, Wolf \(Ilsa&#39;s\)/); return true; };
globalThis.game = { ...(globalThis.game ?? {}), user: player, combats: { get: () => combat } };
combat.rollInitiative = async ids => rolled.push(...ids);
combat.combatants.forEach((x, i) => { x.id = `k${i}`; });
await I.promptInitiative(combat);
assert.deepEqual(rolled, ["k0", "k1"]);
console.log("OK initiative prompt");

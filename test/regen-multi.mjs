// 0.10.93: Regeneration at the start of a turn, multi-attacks in one click, and the v14 compatibility helpers.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import "./harness.mjs";

const R = await import("../arneyan/module/regen.mjs");
const M = await import("../arneyan/module/multiattack.mjs");
const C = await import("../arneyan/module/compat.mjs");
const D = await import("../arneyan/module/duration.mjs");

/* Regeneration texts. */
const troll = "<p>Regains <strong>8 HP</strong> at the start of its turn.</p><p>If reduced to <strong>0 HP</strong> by anything other than fire or acid damage, it falls prone and rises again at the start of its next turn instead of dying; fire or acid damage stops the regeneration until the end of its next turn.</p>";
let r = R.regenOf(troll);
assert.deepEqual(r, { amount: 8, stops: ["fire", "acid"], otherStops: false, rises: true });
r = R.regenOf("Regains 5 HP at the start of its turn. This stops for 1 round if it takes fire or radiant damage.");
assert.deepEqual(r.stops, ["fire", "radiant"]);
r = R.regenOf("Regains 10 HP at the start of its first turn each round; this stops for 1 round if it takes radiant damage or is splashed with holy water.");
assert.deepEqual(r.stops, ["radiant"]);
assert.equal(r.otherStops, true);
assert.equal(R.regenOf("regains 10 HP at the start of its turn while it has at least 1 HP.").amount, 10);
assert.equal(R.regenOf("<p>Regains <strong>1 HP</strong> at the start of its turn while it has at least <strong>1 HP</strong>.</p>").amount, 1);
assert.equal(R.regenOf("Regains 1 HP per round.").amount, 1);
// Depends on what wounded it: left to the GM.
assert.equal(R.regenOf("Regains 2 HP per round. This does not work against holy or silver weapons."), null);
assert.equal(R.regenOf("Its wounds close slowly."), null);

// Every Regeneration in the Bestiary reads, or is one the GM handles.
let read = 0, left = 0, total = 0;
const dir = new URL("../packs-src/monsters/", import.meta.url);
for (const f of readdirSync(dir).filter(n => n.startsWith("actors_") && n.endsWith(".json"))) {
  const a = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  for (const i of a.items ?? []) {
    if (!/^regenerat/i.test(i.name)) continue;
    total++;
    const g = R.regenOf(i.system.description);
    if (g) { read++; assert.ok(g.amount > 0 && g.amount <= 50, `${a.name}: ${g.amount}`); } else left++;
  }
}
assert.ok(total > 10 && read >= total - 4, `Regeneration read ${read} of ${total} (${left} left to the GM)`);

/* The start of its turn. */
const reg = R.regenOf(troll);
assert.deepEqual(R.regenStep(reg, { value: 20, max: 30 }), { heal: 8, stopped: false, reason: "" });
assert.deepEqual(R.regenStep(reg, { value: 27, max: 30 }), { heal: 3, stopped: false, reason: "" });
assert.equal(R.regenStep(reg, { value: 30, max: 30 }).reason, "full");
assert.equal(R.regenStep(reg, { value: 0, max: 30 }).reason, "down");
assert.deepEqual(R.regenStep(reg, { value: 10, max: 30 }, "fire"), { heal: 0, stopped: true, reason: "fire" });
assert.equal(R.stoppingType(reg, [{ type: "slashing", amount: 6 }, { type: "fire", amount: 3 }]), "fire");
assert.equal(R.stoppingType(reg, [{ type: "fire", amount: 0 }]), "", "fire it was immune to doesn't stop it");
assert.equal(R.stoppingType(reg, [{ type: "cold", amount: 9 }]), "");
assert.equal(R.stoppingType(null, [{ type: "fire", amount: 9 }]), "");
const actor = { items: [{ name: "Bite" }, { name: "Regeneration", system: { description: troll } }] };
assert.equal(R.regenFor(actor).regen.amount, 8);
assert.equal(R.regenFor({ items: [{ name: "Bite" }] }), null);

/* Multi-attacks. */
const w = (name, traits = "") => ({ type: "weapon", name, system: { traits } });
assert.equal(M.attacksOf(w("Claw ×2")), 2);
assert.equal(M.attacksOf(w("Claw", "2 attacks")), 2);
assert.equal(M.attacksOf(w("Bite ×5")), 5);
assert.equal(M.attacksOf(w("Tentacle", "paralysis, 8 attacks")), 8);
assert.equal(M.attacksOf(w("Longsword")), 1);
assert.equal(M.attacksOf(w("Hex 2")), 1, "an x inside a word isn't a multiplier");
assert.equal(M.attacksOf(w("Claw ×40")), 10, "capped");
assert.equal(M.attacksOf({ type: "ability", name: "Claw ×2" }), 1);
let multi = 0;
for (const f of readdirSync(dir).filter(n => n.startsWith("actors_") && n.endsWith(".json"))) {
  for (const i of JSON.parse(readFileSync(new URL(f, dir), "utf8")).items ?? []) if (i.type === "weapon" && M.attacksOf(i) > 1) multi++;
}
assert.ok(multi > 150, `multi-attack weapons in the Bestiary: ${multi}`);

/* Compatibility: v13 forced deletion here (no operators), v14's operator when Foundry has it. */
assert.deepEqual(C.unset("flags.arneyan.before"), { "flags.arneyan.-=before": null });
assert.deepEqual(C.unsetKey("before"), { "-=before": null });
class ForcedDeletion {}
const ops = foundry.data.operators;
foundry.data.operators = { ForcedDeletion };
const u = C.unset("flags.arneyan.before");
assert.ok(u["flags.arneyan.before"] instanceof ForcedDeletion);
assert.ok(C.unsetKey("x").x instanceof ForcedDeletion);
foundry.data.operators = ops;
assert.equal(C.own({ a: 1 }, "a"), 1);
const getterObj = Object.defineProperty({ value: 2, units: "rounds" }, "rounds", { get() { throw new Error("deprecated getter read"); } });
assert.equal(C.own(getterObj, "rounds"), undefined);
// readDuration never trips v14's warning getters.
const v14 = { duration: getterObj, start: Object.defineProperty({ time: 50 }, "startTime", { get() { throw new Error("getter"); } }) };
const dur = D.readDuration(v14);
assert.equal(dur.rounds, 2);
assert.equal(dur.shape, "v14");
assert.equal(dur.startTime, 50);
globalThis.CONST = { ...(globalThis.CONST ?? {}), WALL_SENSE_TYPES: { NORMAL: 20 } };
assert.equal(C.senseTypes().NORMAL, 20);
globalThis.CONST.EDGE_SENSE_TYPES = { NORMAL: 21 };
assert.equal(C.senseTypes().NORMAL, 21);
delete globalThis.CONST.EDGE_SENSE_TYPES;

console.log(`regen-multi: ok (Regeneration ${read}/${total} automatic, ${multi} multi-attack weapons)`);

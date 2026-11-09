// K89 (books v0.10.56, R-B59): a Disadvantage you choose (Power Attack, Shield Blow, Called Shot) is never offset by
// Advantage; the Fighter's Manoeuvre Mastery still rolls Shield Blow normally. Runs on its own.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
const E = await import("../arneyan/module/effects.mjs");
const R = await import("../arneyan/module/rolls.mjs");

// -2 stays -2 through the rules (it was read as -1 before).
const set = new E.ModSet([
  { key: "adv.attack", value: "-2", label: "Shield Blow", data: {} },
  { key: "adv.attack", value: "1", label: "Bless", data: {} }
]);
assert.deepEqual(set.adv("adv.attack").values.sort(), [-2, 1]);
assert.equal(R.modeFromEvent(null, set.adv("adv.attack").values), -1, "Advantage doesn't offset it");
assert.deepEqual(set.advExcept(new Set(["Shield Blow"]), "adv.attack").values, [1], "Manoeuvre Mastery leaves it out");
assert.equal(R.modeFromEvent({ shiftKey: true }, [-2]), -1, "nor does a Shift-click");

// The pack: Shield Blow and Called Shot carry -2; Power Attack's kept Disadvantage is -2 too.
const read = dir => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith("items_"))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const actions = read("actions");
for (const n of ["Shield Blow", "Called Shot"]) {
  const a = actions.find(x => x.name === n).system;
  assert.ok(a.toggle && a.rules.some(r => r.key === "adv.attack" && r.value === "-2"), n);
}
const docs = fs.readFileSync(new URL("../arneyan/module/documents.mjs", import.meta.url), "utf8");
assert.ok(docs.includes('const paKeep = paOn ? { values: [-2], adv: [], dis: ["Power Attack"], keep: true } : NONE;'));
assert.ok(docs.includes('const skip = new Set([...(mastery ? ["Shield Blow"] : []), ...(freeShot ? ["Called Shot"] : [])]);'));
// The card: no Advantage button under a chosen Disadvantage, and the button does nothing on an older card.
const rolls = fs.readFileSync(new URL("../arneyan/module/rolls.mjs", import.meta.url), "utf8");
assert.ok(rolls.includes("secondAdv = canSecond && mode <= 0 && !chosenDis"));
assert.ok(rolls.includes("if (dir > 0 && flags.chosenDis) return;"));
console.log("OK K89");

// Monsters & Treasure v0.10.88 and Handbook v0.10.92 (S-F7, R-S8, K297) in the system (0.10.132): Running a Solo's Cost
// line counts the characters only; retainers' half points add to the budget on top, so they make a solo fight easier.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

// The book's sentence, when the staged M&T sources are on this machine.
const FRONT = "/tmp/hb/mm/front.md";
if (fs.existsSync(FRONT)) assert.match(fs.readFileSync(FRONT, "utf8"), /Count the characters only: retainers' half points add to the budget on top, so they make a solo fight easier\./);

const E = await import("../arneyan/module/encounter.mjs");
const party = [7, 7, 7, 7], solo = [{ name: "Adult Sky Dragon", level: 7, solo: true, count: 1 }];
const none = E.encounterBudget(party, solo), two = E.encounterBudget(party, solo, { retainers: 2 });
assert.equal(none.total, 4, "a solo costs the whole budget of a party of its Level");
assert.equal(none.budget, 4);
assert.equal(two.total, 4, "the solo's cost counts the characters only");
assert.equal(two.budget, 5, "retainers' half points add to the budget on top");
assert.ok(two.ratio < none.ratio, "retainers make a solo fight easier");
console.log("OK M&T v0.10.88 solo cost with retainers");

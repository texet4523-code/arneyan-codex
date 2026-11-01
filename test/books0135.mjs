// Books v0.10.35 (K33, K34, m58 to m60; board B-F22) in the system (0.10.78): Undying Reputation and Untouchable are
// automatic once each encounter (Untouchable Wisdom-modifier times from 24th), the Assassin's Surprise counts its
// Hide one tier higher, and the rules journal says "Saving again".
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (dir, prefix = "items_") => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith(prefix))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const features = read("class-features");
const feat = (n, c) => features.find(f => f.name === n && f.system.className === c).system;
const ur = feat("Undying Reputation", "Knight");
assert.deepEqual([ur.uses.max, ur.uses.per], [1, "encounter"]);
assert.equal(ur.activities[0].cost, 1);
assert.ok(ur.activities[0].text.startsWith("The first time each encounter"));
const un = feat("Untouchable", "Monk");
assert.deepEqual([un.uses.max, un.uses.per, un.uses.formula], [1, "encounter", "max(1, @wis.mod * min(1, floor(@cl / 24)))"]);
assert.ok(!feat("Quick Reflexes (Improved)", "Monk").activities.some(a => a.name === "Untouchable"), "the 24th-level count is on Untouchable itself");
assert.ok(feat("Surprise", "Assassin").rules.some(r => r.key === "surprise.tier"));
assert.ok(!/18th|23rd/.test(feat("Surprise", "Assassin").description));
assert.ok(/Disadvantage/.test(feat("Signature Style", "Assassin").description));
const codex = read("rules", "journal_").find(j => j.name === "Book I: Core Rules");
const text = JSON.stringify(codex);
assert.ok(text.includes("Saving again") && !text.includes("One try per encounter"), "the Codex journal has the new rule");
console.log("OK 0.10.78 books v0.10.35");

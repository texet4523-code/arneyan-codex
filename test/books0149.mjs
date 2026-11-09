// Books HB v0.10.49 (B-F37; K56 and K57) in the system (0.10.88).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
for (const k of ["Actor", "Item", "Combatant", "ChatMessage"]) globalThis[k] ??= class {};

const P = await import("../arneyan/module/progression.mjs");
const D = await import("../arneyan/module/documents.mjs");
const DT = await import("../arneyan/module/downtime.mjs");
const M = await import("../arneyan/module/migrate.mjs");
const read = (dir, prefix) => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith(prefix))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const src = p => fs.readFileSync(new URL(`../arneyan/${p}`, import.meta.url), "utf8");

/* Thief Skills: Rogue all four (Master from 5th, Climb with Dexterity); Assassin Traps (Master from 7th). */
assert.deepEqual(P.thiefSkillsFor({ Rogue: 1 }), { Lockpicking: { tier: "trained" }, Traps: { tier: "trained" }, "Pick Pocket": { tier: "trained" }, Climb: { tier: "trained", ability: "dex" } });
assert.equal(P.thiefSkillsFor({ Rogue: 5 }).Lockpicking.tier, "master");
assert.deepEqual(P.thiefSkillsFor({ Assassin: 6 }), { Traps: { tier: "trained" } });
assert.equal(P.thiefSkillsFor({ Assassin: 7 }).Traps.tier, "master");
assert.equal(P.thiefSkillsFor({ Rogue: 2, Assassin: 7 }).Traps.tier, "master", "the higher of the two");
assert.deepEqual(P.thiefSkillsFor({ Fighter: 9 }), {});
assert.ok(/await syncThiefSkills\(actor\)/.test(src("module/progression.mjs")), "after each level change");
const skills = read("skills", "items_");
for (const [n, a] of [["Lockpicking", "dex"], ["Traps", "int"], ["Pick Pocket", "dex"], ["Climb", "str"]]) assert.equal(skills.find(s => s.name === n)?.system.ability, a, n);
assert.equal(skills.find(s => s.name === "Climb")._id, "QwBrDsUjGQiCN3qz", "Climb keeps Mountaineering's id");
assert.ok(!skills.some(s => s.name === "Mountaineering"));
assert.deepEqual(M.RENAMED_FEATURES["Compendium.arneyan.skills.Item.QwBrDsUjGQiCN3qz"], ["Mountaineering", "Climb"], "world copies renamed");
assert.ok(/THIEF_REWORK = "0\.10\.88"/.test(src("module/migrate.mjs")));
const rogue1 = read("class-features", "items_1st-Level_Features_YGCVjC9mUfm0216U")[0];
assert.deepEqual(rogue1.system.activities.map(a => a.name), ["Decipher Script"], "the old Rogue checks are gone");
const wick = read("../test/fixtures/pregens", "actors_Wick_Tallow_")[0]; // a retired Broken Anvil pregen (test fixture)
const wsk = Object.fromEntries(wick.items.filter(i => i.type === "skill").map(i => [i.name, [i.system.tier, i.system.ability]]));
assert.deepEqual(wsk.Climb, ["trained", "dex"]); assert.ok(wsk.Lockpicking && wsk.Traps && wsk["Pick Pocket"]);
const sarrix = read("../test/fixtures/pregens", "actors_Sarrix_Stormscale_")[0];
assert.ok(sarrix.items.some(i => i.type === "skill" && i.name === "Climb") && !sarrix.items.some(i => i.name === "Mountaineering"));

/* Weapon Master: repeatable, and as a Trained Feat no check at the end. */
const p = DT.planDowntime("train", { training: "feat", what: "Weapon Master" }, { items: [], system: { level: 6 } });
assert.equal(p.check, null); assert.equal(p.costCp, 15000); assert.equal(p.offerFeat, "Weapon Master");
assert.ok(/i\.name !== "Weapon Master"/.test(src("module/downtime.mjs")), "can be taken again");
assert.ok(/!c && plan\.offerFeat !== undefined/.test(src("module/downtime.mjs")), "added when the weeks are done");
assert.ok(/You can take this feat again/.test(read("feats", "items_Weapon_Master_")[0].system.description));

/* Grappled casters: no somatic components. */
assert.equal(D.hasSomatic("V, S, M (a bit of fleece)"), true);
assert.equal(D.hasSomatic("V, M (sulphur and salt)"), false);
assert.equal(D.hasSomatic("S"), true);
assert.equal(D.hasSomatic("V"), false);
assert.equal(D.hasSomatic(""), false);
assert.ok(/hasSomatic\(this\.system\.components\) && actor\.effects\.some\(e => !e\.disabled && e\.flags\?\.\[SYS\]\?\.grappledBy\)/.test(src("module/documents.mjs")));
/* Review fixes (4 Nov). */
assert.ok(/syncThiefSkills\(actor\)\.catch[^\n]*\n  if \(stop === "close"\) return null;/.test(src("module/progression.mjs")), "a new 1st-level Rogue has them before picking skills");
assert.ok(/i\.name === "Mountaineering"\)\.map\(i => \(\{ _id: i\.id, name: "Climb" \}\)\)/.test(src("module/migrate.mjs")), "the update renames Mountaineering itself");
assert.ok(/flags\.\$\{SYS\}\.knack`\] = true/.test(src("module/progression.mjs")), "a Knack keeps its Advantage");
assert.ok(/e\.name === "Weapon Master"\)\)/.test(src("module/progression.mjs")), "Weapon Master again at a feat level");
for (const k of read("kits", "items_")) if (/Smuggler|Street Thief|Robin Track/.test(k.name)) {
  const rules = JSON.stringify([k.system.rules, ...(k.system.features ?? []).map(f => f.rules ?? [])]);
  assert.ok(!/Open Locks/.test(rules), `${k.name}: no Advantage on the old Open Locks`);
}
/* Kieran 4 Nov: an Assassin who has the Climb skill rolls it with Dexterity too (not granted). */
assert.deepEqual(P.thiefDexFor({ Assassin: 3 }), ["Climb"]);
assert.deepEqual(P.thiefDexFor({ Rogue: 1 }), ["Climb"]);
assert.deepEqual(P.thiefDexFor({ Fighter: 5 }), []);
assert.ok(!("Climb" in P.thiefSkillsFor({ Assassin: 9 })), "not given free");
assert.ok(/thiefDexFor\(lv\)\.some\(n => n\.toLowerCase\(\) === /.test(src("module/downtime.mjs")), "learning Climb (any case) rolls Dexterity for them");
assert.ok(src("module/progression.mjs").indexOf("flags: { arneyan: { knack: true } } } });\n    }\n    // An Assassin who picks Climb") > 0, "after the Knack");
/* HB v0.10.50 (B-F38, K58). */
const cf = read("class-features", "items_");
// Books v0.10.57 (R-B61): the Rogue's Exploit counts a flanked creature; the Assassin's Sneak Attack its Studied target.
assert.ok(cf.find(i => i.name === "Exploit (Sneak Attack)").system.rules.some(r => /flanked/.test(r.when ?? "")), "flanking counts");
assert.ok(cf.find(i => i.name === "Sneak Attack" && i.system.className === "Assassin").system.rules.some(r => /Studied target/.test(r.when ?? "")));
assert.ok(cf.find(i => i.name === "Finishing Blow").system.rules.some(r => /critical hit/.test(r.value) && /Sneak Attack dice/.test(r.value)));
assert.ok(/a solo stops bleeding when Bloodied/.test(JSON.stringify(cf.find(i => i.name === "Marked for Death (Improved)").system.rules)));
assert.ok(/You may study before a fight/.test(cf.find(i => i.name === "Study").system.description));
console.log("books0149: ok");

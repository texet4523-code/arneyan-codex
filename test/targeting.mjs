// 0.10.43: spells that work on one kind of creature leave the others out (Hold Animal and a goblin).
import assert from "node:assert/strict";
import fs from "node:fs";
const T = await import("../arneyan/module/targeting.mjs");
const npc = (type, level = 1) => ({ name: type, type: "npc", system: { level, details: { type } } });
const pc = (level = 3) => ({ name: "Ilsa", type: "character", system: { level } });
assert.equal(T.spellFits("Hold Animal", npc("humanoid (goblinoid)")).ok, false, "a goblin isn't an animal");
assert.equal(T.spellFits("Hold Animal", npc("beast")).ok, true);
assert.equal(T.spellFits("Hold Animal", npc("beast (swarm)")).ok, true);
assert.equal(T.spellFits("Hold Animal", npc("monstrosity")).ok, false, "no magical beasts or monsters");
assert.equal(T.spellFits("Hold Animal", pc()).ok, false);
assert.equal(T.spellFits("Hold Person", pc()).ok, true, "a character is a humanoid");
assert.equal(T.spellFits("Hold Person", npc("undead")).ok, false);
assert.equal(T.spellFits("Hold Monster", npc("undead (incorporeal)")).ok, false);
assert.equal(T.spellFits("Hold Monster", npc("dragon")).ok, true);
assert.equal(T.spellFits("Charm Monster", npc("construct")).ok, false);
assert.equal(T.spellFits("Daze", npc("humanoid", 5)).ok, false, "above Level 4");
assert.equal(T.spellFits("Daze", npc("humanoid", 4)).ok, true);
assert.equal(T.spellFits("Cause Fear", npc("dragon", 9)).ok, false);
assert.equal(T.spellFits("Control Greater Undead", npc("undead", 7)).ok, false);
assert.equal(T.spellFits("Fireball", npc("humanoid")).ok, true, "a spell without a rule works on anything");
assert.equal(T.spellFits("Hold Animal", npc("")).ok, true, "no type written in: the GM's call");
const warned = [];
globalThis.ui = { notifications: { warn: m => warned.push(m) } };
const left = T.spellTargets("Hold Animal", [npc("beast"), { ...npc("humanoid (goblinoid)"), name: "Goblin" }]);
assert.equal(left.length, 1);
assert.match(warned[0], /Goblin: not affected \(Hold Animal works on animals only\)/);
// Every spell on the list is in the Spells compendium.
const dir = new URL("../packs-src/spells/", import.meta.url).pathname;
const names = new Set(fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(dir + f)).name));
for (const n of Object.keys(T.SPELL_TARGETS)) assert.ok(names.has(n), n);
// The buttons use it: saves, effects, damage, apply by saves.
const chat = fs.readFileSync(new URL("../arneyan/module/chat.mjs", import.meta.url), "utf8");
assert.equal((chat.match(/spellTargets\(/g) ?? []).length, 5);
console.log("OK targeting");
await import("./harness.mjs");
// Readable descriptions reach copies already on sheets, unless someone reworded them.
const M = await import("../arneyan/module/migrate.mjs");
assert.equal(M.layoutFrom("<p>Lasts 1 hour. You keep your mind.</p>", "<ul><li>Lasts <strong>1 hour</strong>.</li><li>You keep your mind.</li></ul>"), "<ul><li>Lasts <strong>1 hour</strong>.</li><li>You keep your mind.</li></ul>");
assert.equal(M.layoutFrom("<p>Lasts 2 hours. You keep your mind.</p>", "<ul><li>Lasts <strong>1 hour</strong>.</li></ul>"), null, "reworded: left alone");
assert.equal(M.layoutFrom("<p>Same</p>", "<p>Same</p>"), null);
console.log("OK layout for copies on sheets");
// Kits: a new layout of the same words is not a change (no "edits kept", no question about older items).
{
  const oldF = [{ name: "Bond", description: "<p>Tame a beast. It fights beside you. It follows you.</p>", uses: { value: 1, max: 1, per: "day" } }];
  const newF = [{ name: "Bond", description: "<p>Tame a beast.</p><ul><li>It fights beside you.</li><li>It follows you.</li></ul>", uses: { value: 1, max: 1, per: "day" } }];
  const laid = M.laidOutFeatures(oldF, newF);
  assert.equal(laid[0].description, newF[0].description);
  assert.ok(M.matchesStamp("features", laid, M.fingerprint("features", oldF)), "same words, same fingerprint");
  const kit = (features, synced) => ({ type: "kit", flags: { arneyan: { synced } }, system: { features }, _source: { system: { features }, flags: { arneyan: { synced } } } });
  // Edited by the GM (uses 2): kept, but not listed as an edit the compendium also changed.
  const edited = JSON.parse(JSON.stringify(oldF)); edited[0].uses.max = 2;
  const report = {};
  const upd = M.refreshFrom(kit(edited, { features: M.fingerprint("features", oldF) }), { type: "kit", system: { features: newF } }, { report });
  assert.equal(upd["system.features"], undefined); assert.ok(!report.kept, "a layout-only compendium change isn't listed");
  // Added before fingerprints and otherwise the same: no question about older items.
  const r2 = {};
  M.refreshFrom(kit(oldF, null), { type: "kit", system: { features: newF } }, { legacy: "skip", report: r2 });
  assert.ok(!r2.unstamped);
  console.log("OK kit layout and fingerprints");
}

// 0.10.43, the players' feedback: over-level spells and features, touch spells, Animate Objects, undo, folding, tabs.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
const root = new URL("../arneyan/", import.meta.url).pathname;
const read = p => fs.readFileSync(root + p, "utf8");

// 1. A player can't add a spell above their highest spell level, or a feature above their class level.
const L = await import("../arneyan/module/limits.mjs");
const slots = n => Array.from({ length: 10 }, (_, i) => ({ total: i <= n ? (i ? 2 : 0) : 0 }));
const druid = { name: "Ilsa", type: "character", system: { casters: [{ slots: slots(2) }] }, items: [{ type: "class", name: "Druid", system: { levels: 3 } }] };
druid.items.find = Array.prototype.find.bind(druid.items);
assert.equal(L.highestSpellLevel(druid), 2);
assert.equal(L.blockedReason(druid, { type: "spell", name: "Entangle", system: { level: 1 } }), "");
assert.match(L.blockedReason(druid, { type: "spell", name: "Call Lightning", system: { level: 3 } }), /up to 2nd level/);
assert.equal(L.blockedReason(druid, { type: "spell", name: "Light", system: { level: 0 } }), "");
assert.match(L.blockedReason(druid, { type: "ability", name: "Deepened Shape", system: { kind: "class", className: "Druid", level: 12 } }), /Druid level 12/);
assert.equal(L.blockedReason(druid, { type: "ability", name: "Woodland Stride", system: { kind: "class", className: "Druid", level: 3 } }), "");
assert.match(L.blockedReason(druid, { type: "ability", name: "Rage", system: { kind: "class", className: "Barbarian", level: 1 } }), /isn't a Barbarian/);
const fighter = { name: "Rook", type: "character", system: { casters: [] }, items: [] };
assert.match(L.blockedReason(fighter, { type: "spell", name: "Light", system: { level: 0 } }), /no spellcasting class/);
assert.equal(L.blockedReason({ type: "npc" }, { type: "spell", name: "Meteor Swarm", system: { level: 9 } }), "", "monsters aren't limited");

// 2. Touch spells: an attack roll in place of the save; cures heal allies with no save or roll.
const T = await import("../arneyan/module/touch.mjs");
const dir = new URL("../packs-src/spells/", import.meta.url).pathname;
const names = new Set(fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(dir + f)).name));
for (const n of T.TOUCH_ATTACK) assert.ok(names.has(n), `${n} is a spell`);
assert.ok(T.isTouchAttack({ type: "spell", name: "Shocking Grasp" }) && !T.isTouchAttack({ type: "spell", name: "Glyph of Warding" }));
assert.equal(T.touchLabel({ name: "Cure Light Wounds" }), "Touch attack: an undead, or cast reversed");
assert.deepEqual(T.touchParts({ type: "character", system: { bth: 2 } }, { caster: { ability: "wis", mod: 3 } }).map(p => p.value), [2, 3]);
assert.deepEqual(T.touchParts({ type: "npc", system: { attributes: { attack: 6 } } }, {}).map(p => p.value), [6]);
const docs = read("module/documents.mjs");
assert.ok(docs.includes("if (sys.save && !touch)") && docs.includes("async rollSpellAttack(") && docs.includes('as === "undead" ? "radiant"'));
const chat = read("module/chat.mjs");
for (const c of [".arn-touch-attack", ".arn-touch-damage", ".arn-touch-effect"]) assert.ok(chat.includes(c), c);

// 3. Animate Objects summons the objects the spell describes: 1 per two levels, a Large one counting as 2.
const S = await import("../arneyan/module/summons.mjs");
const ao = S.SUMMON_SPELLS["Animate Objects"];
const med = { name: "Animated Object", level: 1, levelText: "", type: "construct" }, big = { name: "Animated Object, Large", level: 1, levelText: "", type: "construct" };
assert.equal(S.checkPicks(ao, ao.options[0], [{ entry: med, count: 3 }], 6), "");
assert.match(S.checkPicks(ao, ao.options[0], [{ entry: med, count: 2 }, { entry: big, count: 1 }], 6), /limit is 3/);
assert.equal(S.checkPicks(ao, ao.options[0], [{ entry: med, count: 1 }, { entry: big, count: 1 }], 6), "");
assert.ok(!S.fitsFilter(ao.filter, { name: "Goblin" }));
assert.ok(!S.ATTACKER_SPELLS.includes("Animate Objects"));
const mdir = new URL("../packs-src/monsters/", import.meta.url).pathname;
const objs = fs.readdirSync(mdir).map(f => JSON.parse(fs.readFileSync(mdir + f))).filter(d => /^Animated Object/.test(d.name));
assert.equal(objs.length, 2);
for (const o of objs) {
  assert.equal(o.system.attributes.hp.max, 20); assert.equal(o.system.attributes.ac, 14); assert.equal(o.system.attributes.speed, "30ft");
  assert.ok(o.items.some(i => /hits automatically/.test(i.name) && i.system.damage === (o.name.includes("Large") ? "2d8" : "1d8")));
}

// 4. Undo: one click's report cards (failed and saved, yours and the GM's) undo together.
assert.ok(chat.includes("undoGroup") && chat.includes("messageIds: gms.map(m => m.id)") && chat.includes("group: foundry.utils.randomID()"));
// GM side still only for GM-written cards of damage this player applied.
assert.ok(chat.includes("if (!sender.isGM && !(m.author?.isGM && m.flags[SYS].appliedBy === sender.id)) continue;"));

// 5. Spell levels fold; only the open tab is drawn (no scroll jump when a spell opens).
const sheet = read("templates/actor/actor-sheet.hbs");
assert.ok(sheet.includes('data-fold-key="{{foldKey}}"') && sheet.includes('data-action="toggleSpellLevel"'));
assert.equal((sheet.match(/\{\{#unless \(eq @root.activeTab "/g) ?? []).length, 8);
for (const t of ["party-sheet.hbs", "storage-sheet.hbs"]) assert.ok(read(`templates/actor/${t}`).includes('{{#unless (eq @root.activeTab "'), t);

// 6. The changed creature's own token can't be moved. (Monsters without scores showed "–" until the books gave them
// scores in v0.10.5.)
const tr = read("module/transform.mjs");
// (0.10.46: the creature's own token turns into the form instead; the lock stays only for tokens changed before.)
assert.ok(tr.includes("shapeBefore") && tr.includes("arneyanRevert: true") && tr.includes('Hooks.on("preUpdateToken"'));
assert.ok(!read("module/sheets.mjs").includes("noScores"));
console.log("OK feedback 0.10.43");
// Review fixes: drops on a sheet (keepId) are checked; Battle Priests; kit features; each class's own slots.
assert.ok(!read("module/limits.mjs").match(/options\?\.keepId/));
const bp = { name: "Bran", type: "character", system: { casters: [{ name: "Cleric (Battle Priest)", slots: slots(1) }, { name: "Wizard", slots: slots(3) }] },
  items: [{ type: "class", name: "Cleric (Battle Priest)", system: { levels: 2 } }, { type: "kit", name: "Hedge Knight (Knight)" }] };
bp.items.find = Array.prototype.find.bind(bp.items); bp.items.some = Array.prototype.some.bind(bp.items);
assert.equal(L.blockedReason(bp, { type: "ability", name: "Turn Undead", system: { kind: "class", className: "Cleric", level: 1 } }), "");
assert.equal(L.blockedReason(bp, { type: "ability", name: "Steadfast Courage", system: { kind: "class", className: "Hedge Knight", level: 3 } }), "", "a kit's feature");
assert.match(L.blockedReason(bp, { type: "spell", name: "Prayer", system: { level: 3, className: "Cleric" } }), /up to 1st level/, "the cleric's own slots, not the wizard's");
assert.equal(L.blockedReason(bp, { type: "spell", name: "Fireball", system: { level: 3, className: "Wizard" } }), "");
// Reversible spells offer only their reversed effects on a hit.
assert.deepEqual(T.touchApplies({ name: "Enhance Attribute", system: { applies: [{ name: "Enhance Attribute", target: "target" }, { name: "Diminish Attribute (reversed)", target: "target" }] } }).map(x => x.i), [1]);
assert.ok(read("module/rolls.mjs").includes("bySaves: !healing && !Array.isArray(hits)"));
assert.ok(read("module/gear.mjs").includes("TOUCH_ATTACK.has(sp.name)"));
console.log("OK feedback 0.10.43 review fixes");

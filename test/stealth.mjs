// B-F2 / B-F3 (books v0.10.10, K2): passive awareness, hiding tiers, senses, surprise.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

globalThis.Hooks ??= { on() {}, once() {}, callAll() {} };
for (const k of ["Actor", "Item", "Combatant"]) globalThis[k] ??= class {};
const AW = await import("../arneyan/module/awareness.mjs");
const { ModSet } = await import("../arneyan/module/effects.mjs");
const { ARNEYAN } = await import("../arneyan/module/config.mjs");

// Hiding tiers: under 12 none; 12-14, 15-19, 20+.
assert.deepEqual([11, 12, 14, 15, 19, 20, 27].map(n => AW.hideTier(n)?.dc ?? null), [null, 12, 12, 15, 15, 20, 20]);
assert.deepEqual(AW.hideTier(13).beats, ["darkvision"]);
assert.deepEqual(AW.hideTier(16).beats, ["darkvision", "tremorsense"]);
assert.deepEqual(AW.hideTier(22).beats, ["darkvision", "tremorsense", "blindsight", "truesight"]);
for (const t of AW.HIDE_TIERS) assert.ok(ARNEYAN.conditions[t.id], `${t.label} is a condition`);
assert.ok(ARNEYAN.conditions.surprised);

// Passive awareness: 10 + Wis; +5 Advantage (Master Perception or adv.awareness); -5 Disadvantage; they cancel.
const s = { abilities: { wis: { mod: 2 } } };
const none = new ModSet([]);
assert.equal(AW.awarenessOf(s, none).value, 12);
const master = [{ type: "skill", name: "Perception", system: { tier: "master" } }];
assert.equal(AW.awarenessOf(s, none, master).value, 17, "Master in Perception: +5");
assert.equal(AW.awarenessOf(s, none, [{ type: "skill", name: "Perception", system: { tier: "trained" } }]).value, 12, "trained only: no change");
const poisoned = new ModSet([{ key: "adv.check", value: -1, label: "Poisoned" }]);
assert.equal(AW.awarenessOf(s, poisoned).value, 7, "Disadvantage: -5");
assert.equal(AW.awarenessOf(s, poisoned, master).value, 12, "Advantage and Disadvantage cancel");
const kit = new ModSet([{ key: "adv.awareness", value: 1, label: "Granted Power" }, { key: "awareness", value: 1, label: "Ring" }]);
assert.equal(AW.awarenessOf(s, kit).value, 18);
const watch = new ModSet([{ key: "adv.skill", value: 1, label: "Watcher", when: "Perception during watch or sentry duty" }]);
assert.equal(AW.awarenessOf(s, watch).value, 12, "a situational one doesn't count...");
assert.ok(AW.awarenessOf(s, watch).notes[0].includes("watch"), "...it's a reminder");

// Surprise: surprise bonuses and adv.surprise add; the ambusher's surprise.against takes off.
const barb = new ModSet([{ key: "surprise", value: 2, label: "Combat Sense" }, { key: "adv.surprise", value: 1, label: "Alert" }]);
const aw = AW.awarenessOf(s, barb);
assert.equal(aw.value, 12);
assert.deepEqual(AW.surpriseAwareness(aw, barb, 1), { value: 12 + 5 + 2 - 1, bonus: 2, against: 1, net: 1 });

// Senses from the senses text.
assert.deepEqual(AW.sensesOf("Darkvision 60ft, Tremorsense 30ft"), ["darkvision", "tremorsense"]);

// The surprise results and who notices, with mock creatures.
globalThis.foundry.utils.escapeHTML ??= x => x;
const ST = await import("../arneyan/module/stealth.mjs");
const mk = (name, wis, extra = {}) => {
  const mods = extra.mods ?? new ModSet([]);
  const sys = { abilities: { wis: { mod: wis } }, traits: { senses: extra.senses ?? "" } };
  sys.attributes = { awareness: AW.awarenessOf(sys, mods, extra.items ?? []) };
  Object.defineProperty(sys, "mods", { value: mods });
  const effects = extra.hidden ? [{ statuses: new Set([extra.hidden]), disabled: false }] : [];
  return { name, type: "npc", system: sys, mods, effects, appliedEffects: effects, items: extra.items ?? [], getFlag: () => null, getActiveTokens: () => [] };
};
const lurker = mk("Lurker", 0, { hidden: "hiddenFull" });
assert.equal(ST.hideState(lurker)?.dc, 15);
const assassin = mk("Assassin", 0, { mods: new ModSet([{ key: "surprise.against", value: 2, label: "Surprise" }]) });
const guard = mk("Guard", 3), sharp = mk("Sharp", 0, { items: master }), barbarian = mk("Barbarian", 1, { mods: barb });
const r = ST.surpriseResults([lurker, assassin], [guard, sharp, barbarian]);
assert.equal(r.dc, 15, "the lowest Search DC among the hiding ambushers");
assert.equal(r.against, 2);
assert.deepEqual(r.rows.map(x => [x.name, x.awareness, x.surprised]), [["Guard", 11, true], ["Sharp", 13, true], ["Barbarian", 11 + 5 + 2 - 2, false]]);
assert.equal(ST.surpriseResults([assassin], [guard], 12).dc, 12, "a Difficulty Tiers DC when nobody hid");
assert.equal(ST.surpriseResults([assassin], [guard]).dc, null);

const tier = AW.hideTier(16);
const rows = ST.noticeRows(lurker, tier, [{ id: "t1", name: "Guard", actor: guard }, { id: "t2", name: "Mole", actor: mk("Mole", 6, { senses: "Tremorsense 30ft, Blindsight 10ft" }) }]);
assert.deepEqual(rows.map(x => [x.name, x.awareness, x.spots]), [["Mole", 16, true], ["Guard", 13, false]]);
assert.deepEqual(rows[0].beaten, ["tremorsense"]);
assert.deepEqual(rows[0].still, ["blindsight"], "a sense the tier doesn't beat");
assert.ok(ST.tierText(AW.hideTier(13), { items: [{ type: "class", name: "Rogue" }] }).includes("counts as Hidden while lightly obscured"));

// Rules: the surprise features use the new keys; the sheets show Aware and Hide.
const approved = JSON.parse(fs.readFileSync(new URL("../build/effects/approved.json", import.meta.url), "utf8"));
assert.equal(approved["class-features/zEXHGiACkTeX73yo"].rules[0].key, "surprise");
assert.equal(approved["class-features/Sqxt8w1xDKWpnqaM"].rules[0].key, "surprise.against");
for (const k of ["awareness", "surprise", "surprise.against", "adv.awareness", "adv.surprise"]) assert.ok(ARNEYAN.allRuleKeys.has(k), k);
const sheets = fs.readFileSync(new URL("../arneyan/module/sheets.mjs", import.meta.url), "utf8");
assert.ok(sheets.includes('key: "awareness"') && sheets.includes('key: "hide"'));
// Monsters with Master Perception come out 5 higher.
const dir = new URL("../packs-src/monsters/", import.meta.url).pathname;
const chim = fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(dir + f))).find(d => d.name === "Chimera");
assert.ok(AW.perceptionMaster(chim.items), "the Chimera is a Master of Perception");
console.log("All stealth checks passed.");

// 0.10.15: the world update is safe for a live campaign. Items carry fingerprints of their mechanics as they came
// from the compendium; a field the GM changed stays (and is reported), unchanged ones follow the compendium.
import assert from "node:assert/strict";
import "./harness.mjs";

globalThis.game ??= {};
const chat = [];
globalThis.ChatMessage = { create: async m => { chat.push(m); return m; }, getSpeaker: () => ({}) };
const settings = {};
game.settings = { get: (s, k) => settings[k] ?? "", set: async (s, k, v) => { settings[k] = v; }, register: () => {} };
const M = await import("../arneyan/module/migrate.mjs");

const SRC = "Compendium.arneyan.feats.Item.abc";
const comp = rules => ({ type: "feat", system: { rules, uses: { value: 1, max: 1, per: "day", formula: "" } } });
const v1 = [{ key: "ac", value: "1", when: "", label: "" }];
const v2 = [{ key: "ac", value: "2", when: "", label: "" }];
const mine = [{ key: "ac", value: "5", when: "", label: "" }];
const item = (rules, synced, uses = { value: 1, max: 1, per: "day", formula: "" }) => {
  const system = { rules, uses };
  const flags = { arneyan: synced ? { synced } : {} };
  return { id: "i1", type: "feat", name: "Test Feat", system, flags, _stats: { compendiumSource: SRC }, _source: { system, flags } };
};
const stampV1 = M.stampOf("feat", comp(v1).system);

// Fingerprints ignore what play changes: uses left.
assert.equal(M.fingerprint("uses", { value: 0, max: 1, per: "day" }), M.fingerprint("uses", { value: 1, max: 1, per: "day", formula: "" }));
assert.notEqual(M.fingerprint("rules", v1), M.fingerprint("rules", v2));
assert.equal(M.fingerprint("rules", [{ when: "", label: "", value: "1", key: "ac" }]), M.fingerprint("rules", v1), "key order doesn't matter");

{
  // Unchanged since it arrived, and the compendium moved on: updated, with new fingerprints.
  const r = {};
  const upd = M.refreshFrom(item(v1, stampV1), comp(v2), { report: r });
  assert.deepEqual(upd["system.rules"], v2);
  assert.equal(upd["flags.arneyan.synced"].rules, M.fingerprint("rules", v2));
  assert.ok(!r.kept);
}
{
  // The GM changed the rule, and the compendium moved on: kept, and listed.
  const r = {};
  const upd = M.refreshFrom(item(mine, stampV1), comp(v2), { report: r });
  assert.ok(!("system.rules" in upd), "the GM's rule stays");
  assert.deepEqual(r.kept, ["rules"]);
  // "Update these anyway".
  const forced = M.refreshFrom(item(mine, stampV1), comp(v2), { force: true });
  assert.deepEqual(forced["system.rules"], v2);
}
{
  // The GM changed it, the compendium didn't: nothing to do, nothing to report.
  const r = {};
  assert.deepEqual(M.refreshFrom(item(mine, stampV1), comp(v1), { report: r }), {});
  assert.ok(!r.kept);
  // Run again after an update: no change (idempotent).
  const once = M.refreshFrom(item(v1, stampV1), comp(v2));
  const after = item(v2, once["flags.arneyan.synced"]);
  assert.deepEqual(M.refreshFrom(after, comp(v2)), {});
}
{
  // Uses spent in play aren't an edit: a new maximum still comes through, uses left clamped.
  const upd = M.refreshFrom(item(v1, stampV1, { value: 0, max: 1, per: "day", formula: "" }), { type: "feat", system: { rules: v1, uses: { value: 3, max: 3, per: "day", formula: "" } } });
  assert.deepEqual(upd["system.uses"], { max: 3, per: "day", formula: "", value: 0 });
}
{
  // Older items (no fingerprints): "skip" leaves one that differs and says so; one already the same just gets stamped.
  const r = {};
  assert.deepEqual(M.refreshFrom(item(mine, null), comp(v2), { legacy: "skip", report: r }), {});
  assert.equal(r.unstamped, true);
  const r2 = {};
  const same = M.refreshFrom(item(v2, null), comp(v2), { legacy: "skip", report: r2 });
  assert.deepEqual(Object.keys(same), ["flags.arneyan.synced"]);
  assert.ok(!r2.unstamped);
  // "update" brings an older item up to date (the 0.10.1 behaviour).
  assert.deepEqual(M.refreshFrom(item(mine, null), comp(v2), { legacy: "update" })["system.rules"], v2);
}
{
  // Keep my edits still wins over everything, force included.
  const i = item(mine, stampV1); i.flags.arneyan.keepCustom = true;
  assert.deepEqual(M.refreshFrom(i, comp(v2), { force: true }), {});
}
{
  // A new item's fingerprints come from its compendium entry, so a copy someone already changed counts as changed.
  globalThis.fromUuid = async uuid => (uuid === SRC ? { type: "feat", _source: { system: comp(v1).system } } : null);
  const fresh = await M.stampOnCreate({ type: "feat", system: comp(v1).system, _stats: { compendiumSource: SRC }, flags: {} });
  assert.deepEqual(fresh, stampV1);
  const copied = await M.stampOnCreate({ type: "feat", system: { rules: mine, uses: comp(v1).system.uses }, _stats: { compendiumSource: SRC }, flags: {} });
  assert.deepEqual(copied, stampV1, "stamped as the compendium had it");
  const r = {};
  M.refreshFrom(item(mine, copied), comp(v2), { report: r });
  assert.deepEqual(r.kept, ["rules"], "so the change is kept at the next update");
  // A feature a kit granted (no entry of its own) is fingerprinted as it is; homebrew isn't tracked.
  const granted = await M.stampOnCreate({ type: "ability", system: { rules: v1 }, flags: { arneyan: { grantedBy: "k1", source: "k1.0" } } });
  assert.equal(granted.rules, M.fingerprint("rules", v1));
  assert.equal(await M.stampOnCreate({ type: "feat", system: { rules: v1 }, flags: {} }), null);
  assert.equal(await M.stampOnCreate({ type: "weapon", system: {}, _stats: { compendiumSource: "Compendium.arneyan.equipment.Item.x" }, flags: {} }), null, "gear isn't refreshed");
}
{
  // The whole run: the GM's edit is kept and listed with "Update these anyway"; the unchanged item is updated.
  globalThis.fromUuid = async uuid => (uuid === SRC ? { ...comp(v2), toObject() { return JSON.parse(JSON.stringify(comp(v2))); } } : null);
  const edited = item(mine, stampV1); edited.id = "e1"; edited.uuid = "Actor.a.Item.e1"; edited.name = "Edited Feat";
  const plain = item(v1, stampV1); plain.id = "p1"; plain.uuid = "Actor.a.Item.p1";
  const items = [edited, plain];
  const batches = [];
  const pc = { id: "a", name: "Hero", type: "character", items: Object.assign(items, { contents: items }),
    updateEmbeddedDocuments: async (t, ups) => { batches.push(ups); for (const u of ups) { const i = items.find(x => x.id === u._id); for (const [k, v] of Object.entries(u)) if (k !== "_id") { foundry.utils.setProperty(i, k, v); foundry.utils.setProperty(i._source, k, v); } } } };
  game.actors = Object.assign([pc], { contents: [pc] });
  game.items = { contents: [] };
  game.users = Object.assign([{ id: "gm", isGM: true }], { activeGM: { isSelf: true } });
  game.system = { version: "0.10.15" };
  let asked = 0;
  foundry.applications.api.DialogV2.wait = async () => { asked++; return "update"; };
  chat.length = 0;
  const res = await M.runMigration({ force: true });
  assert.equal(asked, 0, "nothing older: no question");
  assert.deepEqual(plain.system.rules, v2, "unchanged item updated");
  assert.deepEqual(edited.system.rules, mine, "edited item kept");
  assert.equal(res.kept, 1);
  assert.equal(chat.length, 1);
  assert.ok(chat[0].content.includes("Your edits kept") && chat[0].content.includes("Hero: Edited Feat (rules)") && chat[0].content.includes("arn-migrate-force"));
  assert.deepEqual(chat[0].flags.arneyan.migrateKept, ["Actor.a.Item.e1"]);
  assert.ok(!chat[0].content.includes("—"));
  // Leave them: an older item that differs stays, and the report says it was left.
  const old = item(mine, null); old.id = "o1"; old.uuid = "Actor.a.Item.o1"; items.push(old);
  foundry.applications.api.DialogV2.wait = async () => { asked++; return "skip"; };
  chat.length = 0;
  const res2 = await M.runMigration({ force: true });
  assert.equal(asked, 1);
  assert.deepEqual(old.system.rules, mine);
  assert.equal(res2.unstamped, 1);
  assert.ok(chat[0].content.includes("1 older item left as it was"));
}
{
  // Review fixes. A spell whose area the GM cleared keeps it cleared (no fill-in behind the fingerprints); a spell
  // with Keep my edits keeps the area the GM gave it; a kit's granted feature follows the kit's kept edit.
  const SP = "Compendium.arneyan.spells.Item.fb", KIT = "Compendium.arneyan.kits.Item.k";
  const tpl = { type: "circle", size: 20, width: 0, attached: false, fromSelf: false, lingering: false, rounds: "", sizeFormula: "" };
  const kitV1 = [{ name: "Breaker", rules: v1, uses: { value: 0, max: 0, per: "", formula: "" } }];
  const kitV2 = [{ name: "Breaker", rules: v2, uses: { value: 0, max: 0, per: "", formula: "" } }];
  const kitMine = [{ name: "Breaker", rules: mine, uses: { value: 0, max: 0, per: "", formula: "" } }];
  const docs = {
    [SP]: { type: "spell", system: { rules: [], template: tpl, save: "ref" } },
    "Compendium.arneyan.spells.Item.none": { type: "spell", system: { rules: [], template: { ...tpl, type: "" }, save: "" } },
    [KIT]: { type: "kit", system: { features: kitV2 } }
  };
  globalThis.fromUuid = async u => (docs[u] ? { ...docs[u], toObject() { return JSON.parse(JSON.stringify(docs[u])); } } : null);
  const mk = (id, type, system, flags, srcUuid) => ({ id, uuid: `Actor.b.Item.${id}`, name: id, type, system, flags: { arneyan: flags }, _stats: srcUuid ? { compendiumSource: srcUuid } : {}, _source: { system, flags: { arneyan: flags } } });
  const cleared = mk("cleared", "spell", { rules: [], template: { ...tpl, type: "" }, save: "ref" }, { synced: M.stampOf("spell", docs[SP].system) }, SP);
  const keep = mk("keep", "spell", { rules: [], template: tpl, save: "" }, { keepCustom: true }, "Compendium.arneyan.spells.Item.none");
  const kit = mk("kit", "kit", { features: kitMine }, { synced: M.stampOf("kit", { features: kitV1 }) }, KIT);
  const granted = mk("Breaker", "ability", { rules: mine }, { grantedBy: "kit", source: "kit.0", synced: M.stampOf("ability", { rules: mine }) });
  const items = [cleared, keep, kit, granted];
  const ups = [];
  const pc = { id: "b", name: "Edith", type: "character", items: Object.assign(items, { contents: items }),
    updateEmbeddedDocuments: async (t, u) => { ups.push(...u); for (const x of u) { const i = items.find(y => y.id === x._id); for (const [k, v] of Object.entries(x)) if (k !== "_id") { foundry.utils.setProperty(i, k, v); foundry.utils.setProperty(i._source, k, v); } } } };
  game.actors = Object.assign([pc], { contents: [pc] });
  chat.length = 0;
  const res = await M.runMigration({ force: true });
  assert.equal(cleared.system.template.type, "", "the cleared area stays cleared");
  assert.equal(keep.system.template.type, "circle", "Keep my edits: the area stays");
  assert.ok(!ups.some(u => u._id === "keep"), "Keep my edits: no update at all");
  assert.deepEqual(kit.system.features[0].rules, mine, "the kit keeps its edit");
  assert.deepEqual(granted.system.rules, mine, "and so does the feature it granted");
  assert.ok(chat[0].content.includes("Edith: kit (features)"), chat[0]?.content);
  assert.equal(res.kept, 1);
}
{
  // 0.10.18: Weapon Specialisation's weapon pick. Rules gained a `weapon` scope (blank on every other rule) and the
  // feature a weapon pick. Fingerprints taken before still match an unedited rule, and the weapon the player picked
  // is theirs: never a GM edit, never wiped by a refresh.
  const W = "with your specialised weapon";
  const before = [{ key: "damage", value: "+1", when: W, label: "" }];
  const now = [{ key: "damage", value: "+1", when: W, label: "", weapon: "chosen" }];
  const later = [{ key: "damage", value: "+2", when: W, label: "", weapon: "chosen" }];
  assert.equal(M.fingerprint("rules", before.map(r => ({ ...r, weapon: "" }))), M.fingerprint("rules", before), "a blank scope is no change");
  assert.notEqual(M.fingerprint("rules", now), M.fingerprint("rules", before), "a real scope is");
  assert.equal(M.fingerprint("weaponChoice", { max: "1:1, 13:2", value: ["Greatsword"] }), M.fingerprint("weaponChoice", { max: "1:1, 13:2", value: [] }), "the pick isn't part of the fingerprint");
  const spec = (rules, weaponChoice, synced) => {
    const system = { rules, weaponChoice };
    const flags = { arneyan: { synced } };
    return { id: "ws", type: "ability", name: "Weapon Specialisation", system, flags, _stats: { compendiumSource: "Compendium.arneyan.class-features.Item.ws" }, _source: { system, flags } };
  };
  const compNow = { type: "ability", system: { rules: now, weaponChoice: { max: "1:1, 13:2", value: [] } } };
  // A world item from before: stamped without the new fields, stored with them blank (the data model fills them in).
  const old = spec(before.map(r => ({ ...r, weapon: "" })), { max: "", value: [] }, M.stampOf("ability", { rules: before }));
  const r = {};
  const upd = M.refreshFrom(old, compNow, { report: r });
  assert.deepEqual(upd["system.rules"], now, "the scoped rules arrive");
  assert.deepEqual(upd["system.weaponChoice"], { max: "1:1, 13:2", value: [] }, "and the weapon pick");
  assert.ok(!r.kept, "nothing counted as the GM's edit");
  // The player picks a Greatsword; the next version changes the bonus: the bonus updates, the pick stays.
  const picked = spec(now, { max: "1:1, 13:2", value: ["Greatsword"] }, upd["flags.arneyan.synced"]);
  const r2 = {};
  const upd2 = M.refreshFrom(picked, { type: "ability", system: { rules: later, weaponChoice: { max: "1:1, 13:2", value: [] } } }, { report: r2 });
  assert.deepEqual(upd2["system.rules"], later);
  assert.ok(!("system.weaponChoice" in upd2), "the picked weapon is left alone");
  assert.ok(!r2.kept, "a pick is not an edit");
  assert.deepEqual(M.refreshFrom(picked, compNow, { force: true }), {}, "Update anyway doesn't wipe it either");
  // How many may be picked follows the compendium, keeping the pick.
  const upd3 = M.refreshFrom(picked, { type: "ability", system: { rules: now, weaponChoice: { max: "1:1, 11:2", value: [] } } });
  assert.deepEqual(upd3["system.weaponChoice"], { max: "1:1, 11:2", value: ["Greatsword"] });
  // A kit feature with a weapon pick keeps it too.
  assert.deepEqual(M.kitFeaturesFrom([{ name: "Kit Spec", weaponChoice: { max: "1", value: ["Maul"] } }], [{ name: "Kit Spec", weaponChoice: { max: "1", value: [] } }])[0].weaponChoice.value, ["Maul"]);
}
{
  // 0.10.22: kit features gained a weapon pick (0.10.18), which the schema fills in, blank, on every stored kit. A kit
  // stamped before then (or by 0.10.18 to 0.10.21, blank picks included) is unedited, so The Heavy Hand updates.
  const NOTE = [{ key: "note.damage", value: "Crushing Blow: reroll 1s and 2s", when: "", label: "" }];
  const REROLL = [{ key: "damage.reroll", value: "2", when: "", label: "", weapon: "two-handed" }];
  const blank = { max: "", value: [] };
  const feat = (rules, wc) => ({ name: "Crushing Blow", rules, uses: { value: 0, max: 0, per: "", formula: "" }, ...(wc ? { weaponChoice: wc } : {}) });
  const comp = { type: "kit", system: { features: [feat(REROLL, blank)] } };
  // The 0.10.18 to 0.10.21 fingerprint (the blank pick included), worked out here as that version did.
  const stable = v => (Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v);
  const fnv = str => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
  const stamp1018 = fnv(JSON.stringify(stable([{ name: "Crushing Blow", rules: NOTE, uses: { max: 0, per: "", formula: "" }, weaponChoice: { max: "" } }])));
  const stampOlder = M.fingerprint("features", [feat(NOTE)]);
  assert.notEqual(stamp1018, stampOlder);
  for (const stamp of [stampOlder, stamp1018]) {
    const stored = [feat(NOTE.map(r => ({ ...r, weapon: "" })), blank)];
    const kit = { id: "k", type: "kit", name: "The Heavy Hand", system: { features: stored }, flags: { arneyan: { synced: { features: stamp } } } };
    kit._source = { system: kit.system, flags: kit.flags };
    const r = {};
    const upd = M.refreshFrom(kit, comp, { report: r });
    assert.ok(!r.kept, "not counted as an edit");
    assert.deepEqual(upd["system.features"][0].rules, REROLL);
  }
  // A real weapon pick on a kit feature still counts.
  assert.notEqual(M.fingerprint("features", [feat(NOTE, { max: "1", value: [] })]), M.fingerprint("features", [feat(NOTE)]));
  // "Update these anyway" on a kit takes the features it granted along (they had stayed as they were).
  const SRCK = "Compendium.arneyan.kits.Item.hh";
  const docs = { [SRCK]: comp };
  class FakeItem {}
  globalThis.Item = FakeItem;
  const mk = (id, type, system, flags, src) => Object.assign(new FakeItem(), { id, uuid: `Actor.c.Item.${id}`, name: id === "cb" ? "Crushing Blow" : id, type, system, flags: { arneyan: flags }, _stats: src ? { compendiumSource: src } : {}, _source: { system, flags: { arneyan: flags } } });
  const mine = [feat([{ key: "note.damage", value: "my own", when: "", label: "" }], blank)];
  const kit = mk("kit", "kit", { features: mine }, { synced: M.stampOf("kit", { features: [feat(NOTE)] }) }, SRCK);
  const cb = mk("cb", "ability", { rules: NOTE, uses: { value: 0, max: 0, per: "", formula: "" } }, { grantedBy: "kit", source: "kit.0", synced: M.stampOf("ability", { rules: NOTE, uses: { value: 0, max: 0, per: "", formula: "" } }) });
  // A second feature the GM changed by hand (stamped as it came): it keeps the change, kit forced or not.
  const BR = [{ key: "adv.check.str", value: "1", when: "", label: "" }], BRmine = [{ key: "adv.check.str", value: "2", when: "", label: "" }];
  comp.system.features.push({ name: "Breaker", rules: [{ ...BR[0], value: "3" }], uses: { value: 0, max: 0, per: "", formula: "" }, weaponChoice: blank });
  const br = mk("br", "ability", { rules: BRmine, uses: { value: 0, max: 0, per: "", formula: "" } }, { grantedBy: "kit", source: "kit.1", synced: M.stampOf("ability", { rules: BR, uses: { value: 0, max: 0, per: "", formula: "" } }) });
  br.name = "Breaker";
  // And one with no fingerprints at all (from before they existed): left alone too.
  const old = mk("old", "ability", { rules: BRmine, uses: { value: 0, max: 0, per: "", formula: "" } }, { grantedBy: "kit", source: "kit.1" });
  old.name = "Breaker";
  const items = [kit, cb, br, old];
  const pc = { id: "c", name: "Rowan", type: "character", items: Object.assign(items, { contents: items }),
    updateEmbeddedDocuments: async (t, u) => { for (const x of u) { const i = items.find(y => y.id === x._id); for (const [k, v] of Object.entries(x)) if (k !== "_id") { foundry.utils.setProperty(i, k, v); foundry.utils.setProperty(i._source, k, v); } } } };
  kit.parent = cb.parent = pc;
  globalThis.fromUuid = async u => (u === kit.uuid ? kit : u === cb.uuid ? cb : docs[u] ? { ...docs[u], toObject() { return JSON.parse(JSON.stringify(docs[u])); } } : null);
  game.user = { isGM: true };
  const n = await M.forceUpdate([kit.uuid]);
  assert.deepEqual(kit.system.features[0].rules, REROLL, "the kit is updated");
  assert.deepEqual(cb.system.rules, REROLL, "and Crushing Blow with it");
  assert.deepEqual(br.system.rules, BRmine, "a feature the GM changed keeps the change");
  assert.deepEqual(old.system.rules, BRmine, "and one with no fingerprints isn't overwritten");
  assert.equal(n, 2, "two items changed");
}
{
  // 0.10.24: Tridents and Lances from before get the Catalogue's traits once (the Trident loses Two-handed, a Lance
  // gets "Two-handed on foot" and its Mounted switch), where only the Two-handed part differs. Nothing else changes.
  const w = (name, traits, extra = {}, flags = {}) => ({ type: "weapon", name, system: { traits, ...extra }, flags: { arneyan: flags } });
  const tri = M.fillFrom(w("Trident", "Reach, Brace, Thrown, Two-handed"), w("Trident", "Reach, Brace, Thrown"));
  assert.equal(tri["system.traits"], "Reach, Brace, Thrown");
  assert.equal(tri["flags.arneyan.handsSet"], true, "once");
  assert.deepEqual(M.fillFrom(w("Trident", "Reach, Brace, Thrown, Two-handed", {}, { handsSet: true }), w("Trident", "Reach, Brace, Thrown")), {}, "a GM who put it back keeps it");
  const LSRC = w("Lance, Heavy", "Reach, Brace, Two-handed on foot", { toggle: true, modeLabel: "Mounted", modeLight: 0, bonusDamage: [] });
  const lance = M.fillFrom(w("Lance, Heavy", "Reach, Brace, Two-handed"), LSRC);
  assert.equal(lance["system.traits"], "Reach, Brace, Two-handed on foot");
  assert.equal(lance["system.modeLabel"], "Mounted");
  assert.ok(!("system.bonusDamage" in lance), "no mode damage to bring");
  // A forged Lance of Shocking keeps its lightning.
  const shock = [{ formula: "1d6", type: "lightning", when: "", mode: false }];
  const forged = M.fillFrom(w("+1 Lance, Heavy of Shocking", "Reach, Brace, Two-handed", { bonusDamage: shock }), LSRC);
  assert.ok(!("system.bonusDamage" in forged), "its own extra damage stays");
  // A Flame Tongue's mode damage still arrives, next to damage of its own.
  const fire = { formula: "2d6", type: "fire", when: "", mode: true };
  assert.deepEqual(M.fillFrom(w("Flame Tongue", "Heavy", { bonusDamage: shock }), w("Flame Tongue", "Heavy", { toggle: true, modeLabel: "Ignited", bonusDamage: [fire] }))["system.bonusDamage"], [...shock, fire]);
  assert.ok(!("system.traits" in M.fillFrom(w("Trident", "Reach, Brace, Thrown, Two-handed, Barbed"), w("Trident", "Reach, Brace, Thrown"))), "a GM's own trait: left alone");
  assert.deepEqual(M.fillFrom(w("Glaive", "Reach"), w("Glaive", "Reach, Two-handed")), {}, "other weapons: their traits are the GM's");
}
{
  // 0.10.25: a copy of what an update replaces stays on the item, and "Put back" restores it; the report lists what's
  // now automatic per character; a character whose update failed is tried again on the next load.
  const SRCF = "Compendium.arneyan.class-features.Item.cb";
  const NOTE = [{ key: "note.damage", value: "Crushing Blow: reroll 1s and 2s", when: "", label: "" }];
  const REROLL = [{ key: "damage.reroll", value: "2", when: "", label: "", weapon: "two-handed" }];
  const docs = { [SRCF]: { type: "ability", name: "Crushing Blow", system: { rules: REROLL } } };
  class FI {}
  globalThis.Item = FI;
  const mkItem = (id, actor) => {
    const system = { rules: NOTE }, flags = { arneyan: { synced: M.stampOf("ability", { rules: NOTE }) } };
    return Object.assign(new FI(), { id, uuid: `Actor.${actor}.Item.${id}`, name: "Crushing Blow", type: "ability", system, flags, _stats: { compendiumSource: SRCF }, _source: { system, flags } });
  };
  const apply = items => async (t, ups) => { for (const u of ups) { const i = items.find(x => x.id === u._id); for (const [k, v] of Object.entries(u)) {
    if (k === "_id") continue;
    if (k.includes("-=")) { const [base, key] = k.split(".-="); delete foundry.utils.getProperty(i, base)[key]; delete foundry.utils.getProperty(i._source, base)[key]; continue; }
    foundry.utils.setProperty(i, k, v); foundry.utils.setProperty(i._source, k, v); } } };
  const mkActor = (id, name, broken = false) => {
    const items = [mkItem(`i${id}`, id)];
    const a = { id, name, type: "character", items: Object.assign(items, { contents: items }) };
    a.updateEmbeddedDocuments = broken ? async () => { throw new Error("boom"); } : apply(items);
    for (const i of items) i.parent = a;
    return a;
  };
  const rowan = mkActor("r", "Rowan"), wen = mkActor("w", "Big Wen", true);
  game.actors = Object.assign([rowan, wen], { contents: [rowan, wen] });
  game.items = { contents: [] };
  globalThis.fromUuid = async u => docs[u] ? { ...docs[u], toObject() { return JSON.parse(JSON.stringify(docs[u])); } } : [rowan, wen].flatMap(a => a.items).find(i => i.uuid === u) ?? null;
  game.system = { version: "0.10.25" };
  settings.migratedTo = "0.10.24";
  foundry.utils.isNewerVersion ??= (a, b) => { const p = v => String(v).split(".").map(Number); const [x, y] = [p(a), p(b)]; for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
  const warn = console.warn; console.warn = () => {};
  chat.length = 0;
  const res = await M.runMigration();
  console.warn = warn;
  const cb = rowan.items[0];
  assert.deepEqual(cb.system.rules, REROLL, "updated");
  const before = cb.flags.arneyan.before;
  assert.equal(before.version, "0.10.25");
  assert.deepEqual(JSON.parse(before.json)["system.rules"], NOTE, "a copy of the old rules");
  const msg = chat.at(-1).content;
  assert.ok(msg.includes("Now automatic") && msg.includes("Rowan:</strong> Crushing Blow"), msg);
  assert.ok(msg.includes("Couldn't update</strong> Big Wen") && msg.includes("arn-migrate-putback"), msg);
  assert.ok(!msg.includes("—"));
  assert.equal(res.failed, 1);
  assert.deepEqual(settings.migrateRetry, { version: "0.10.25", actors: ["w"], items: false, tries: 1 });
  assert.deepEqual(chat.at(-1).flags.arneyan.migrateChanged, [cb.uuid]);
  // Next load, same version: only Big Wen is tried again, and this time it works.
  wen.updateEmbeddedDocuments = apply(wen.items);
  cb.system.rules = NOTE; cb._source.system.rules = NOTE; // (would be left alone anyway: Rowan isn't retried)
  const again = await M.runMigration();
  assert.deepEqual(wen.items[0].system.rules, REROLL, "retried");
  assert.deepEqual(cb.system.rules, NOTE, "the others aren't run again");
  assert.equal(again.failed, 0);
  assert.deepEqual(settings.migrateRetry, {});
  assert.ok(chat.at(-1).content.includes("Tried again"));
  assert.equal(await M.runMigration(), null, "nothing due: nothing runs");
  // Put back: the old rules, and the copy goes.
  game.user = { isGM: true };
  const n = await M.putBack([wen.items[0].uuid], "0.10.25");
  assert.equal(n, 1);
  assert.deepEqual(wen.items[0].system.rules, NOTE);
  assert.ok(!("before" in wen.items[0].flags.arneyan));
  assert.equal(await M.putBack([wen.items[0].uuid], "0.10.25"), 0, "nothing to put back twice");
  // What counts as newly automatic.
  assert.equal(M.becameAutomatic({ rules: NOTE }, { "system.rules": REROLL }), true);
  assert.equal(M.becameAutomatic({ rules: REROLL }, { "system.rules": [{ ...REROLL[0], value: "3" }] }), false, "the same rule, changed: not new");
  assert.equal(M.becameAutomatic({ applies: [] }, { "system.applies": [{ status: "frightened" }] }), true);
  // Review fixes. A second update in the same version keeps the oldest value in the copy.
  const twice = { id: "t", uuid: "Actor.x.Item.t", name: "Twice", _source: { system: { uses: { value: 1, max: 1 }, rules: NOTE }, flags: { arneyan: {} } } };
  const u1 = [{ _id: "t", "system.uses": { value: 1, max: 2 } }];
  M.keepCopies([twice], u1, "0.10.25");
  twice._source.flags.arneyan.before = u1[0]["flags.arneyan.before"];
  twice._source.system.uses = { value: 1, max: 2 };
  const u2 = [{ _id: "t", "system.rules": REROLL, "system.uses": { value: 1, max: 3 } }];
  M.keepCopies([twice], u2, "0.10.25");
  const both = JSON.parse(u2[0]["flags.arneyan.before"].json);
  assert.deepEqual(both["system.uses"], { value: 1, max: 1 }, "the uses from before the first update");
  assert.deepEqual(both["system.rules"], NOTE, "and the rules from before the second");
  // Put back keeps what play changed since (uses left, a weapon picked) and stops gear being filled in again.
  const played = Object.assign(new FI(), { id: "p", uuid: "Actor.p.Item.p", name: "Spec", type: "ability", parent: null,
    system: { uses: { value: 0, max: 3 }, weaponChoice: { max: "1", value: ["Maul"] } },
    flags: { arneyan: { before: { version: "0.10.25", json: JSON.stringify({ "system.uses": { value: 2, max: 2 }, "system.weaponChoice": { max: "1", value: [] } }) } } } });
  played._source = { system: played.system, flags: played.flags };
  const ups = [];
  globalThis.Item.updateDocuments = async u => { ups.push(...u); };
  globalThis.fromUuid = async u => (u === played.uuid ? played : null);
  assert.equal(await M.putBack([played.uuid], "0.10.25"), 1);
  assert.deepEqual(ups[0]["system.uses"], { value: 0, max: 2 }, "uses left stay (within the old maximum)");
  assert.deepEqual(ups[0]["system.weaponChoice"].value, ["Maul"], "the weapon picked stays");
  assert.deepEqual(ups[0]["flags.arneyan.putBack"], ["system.uses", "system.weaponChoice"]);
  const bag = { type: "equipment", system: { container: { holds: false } }, flags: { arneyan: { putBack: ["system.container"] } } };
  assert.deepEqual(M.fillFrom(bag, { type: "equipment", system: { container: { holds: true, capacity: 10 } } }), {}, "a put-back container isn't filled in again");
  // A sheet that keeps failing: tried on three loads in all, then left until the next version.
  wen.updateEmbeddedDocuments = async () => { throw new Error("boom"); };
  { const w0 = wen.items[0]; const fl = { arneyan: { synced: M.stampOf("ability", { rules: NOTE }) } }; w0.system.rules = NOTE; w0._source.system.rules = NOTE; w0.flags = fl; w0._source.flags = fl; }
  globalThis.fromUuid = async u => docs[u] ? { ...docs[u], toObject() { return JSON.parse(JSON.stringify(docs[u])); } } : null;
  game.system = { version: "0.10.26" };
  console.warn = () => {};
  await M.runMigration();
  assert.equal(settings.migrateRetry.tries, 1);
  await M.runMigration();
  assert.equal(settings.migrateRetry.tries, 2);
  await M.runMigration();
  console.warn = warn;
  assert.deepEqual(settings.migrateRetry, {}, "given up after three");
  assert.ok(chat.at(-1).content.includes("After 3 tries"), chat.at(-1).content);
  assert.equal(await M.runMigration(), null);
}
console.log("OK safe world update");

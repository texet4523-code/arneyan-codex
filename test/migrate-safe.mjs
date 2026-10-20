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
console.log("OK safe world update");

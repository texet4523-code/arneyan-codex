// Handbook v0.10.70 (B-F63; K131 to K133): weapon groups, the Fighter's Weapon Specialisation, and the player review's
// Archer, Assassin and Barbarian changes.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

const read = sub => {
  const dir = new URL(`../packs-src/${sub}/`, import.meta.url);
  return fs.readdirSync(dir).filter(f => f.startsWith("items_")).map(f => JSON.parse(fs.readFileSync(new URL(f, dir), "utf8")));
};
const src = f => fs.readFileSync(new URL(`../arneyan/${f}`, import.meta.url), "utf8");
const eq = read("equipment"), cf = read("class-features");
const weapon = n => eq.find(i => i.type === "weapon" && i.name === n);
// K132: every Catalogue weapon in its group, as the table lists it.
for (const [n, g] of [["Club", "hew"], ["Fist", "clinch"], ["Staff", "hook"], ["Spear", "hook"], ["Knife", "bind"], ["Javelin", "pinning fire"], ["Sword, Long", "bind"], ["Cestus", "clinch"]])
  assert.equal(weapon(n)?.system.group, g, n);
assert.equal(eq.filter(i => i.type === "weapon" && !i.system.group).length, 0, "no weapon without a group");
const { WEAPON_GROUPS } = await import("../arneyan/module/data/weapon-groups.mjs");
assert.ok(Object.keys(WEAPON_GROUPS).length > 100 && WEAPON_GROUPS.longsword === "bind" && WEAPON_GROUPS.handaxe === "hew");
assert.equal(WEAPON_GROUPS.unarmedstrike, "clinch", "the sheet's Unarmed Strike is a fist");
assert.equal(WEAPON_GROUPS.rapier, "bind");
// K131: Weapon Specialisation picks a group (no weapon pick, no Advantage).
const ws = cf.find(i => i.name === "Weapon Specialisation");
assert.equal(ws.system.optionChoice.label, "Weapon group");
assert.ok(!JSON.stringify(ws.system).includes("adv.attack.first"));
assert.ok(ws.system.optionChoice.options.find(o => o.name === "Bind").text.includes("Disarm contest"));
assert.ok(cf.find(i => i.name === "Weapon Training").system.description.includes("Shield Guard"));
// K133.
const tn = cf.find(i => i.name === "Twin Nock").system.activities;
assert.deepEqual(tn.map(a => a.name), ["Twin Nock", "Twin Nock (not moved this turn)"]);
assert.ok(!tn[1].disadvantage && tn[0].disadvantage === "rest");
const ov = cf.find(i => i.name === "Open Vein");
assert.equal(ov._id, "VkVLCNJ3it9jWN1i", "Open Vein keeps Marked for Death (Improved)'s id");
assert.ok(!cf.some(i => i.name === "Marked for Death (Improved)"));
assert.ok(/\["Quick Reflexes \(Improved\)", "Marked for Death \(Improved\)"\], "Open Vein"/.test(src("module/migrate.mjs")), "characters' copies are renamed");
assert.ok(cf.find(i => i.name === "Savage Swing").system.activities.every(a => /Fortitude save/.test(a.text)));
assert.ok(/whichever is greater/.test(cf.find(i => i.name === "World Ender")?.system.description ?? JSON.stringify(cf.filter(i => /World Ender/.test(i.system.description)).map(i => i.system.description))));
assert.ok(src("module/downtime.mjs").includes("never one in the group a Fighter has specialised in"));
console.log("books0170: ok");

// HB v0.10.71 to v0.10.73 (B-F64 to B-F66).
{
  const R = await import("../arneyan/module/reload.mjs");
  const w = n => eq.find(i => i.type === "weapon" && i.name === n);
  assert.equal(R.capacityOf(w("Repeating Pistol")), 5);
  assert.equal(R.capacityOf(w("Paired Pistols")), 2);
  assert.equal(R.capacityOf(w("Musket")), 1);
  const rep = w("Crossbow, Repeating Heavy");
  assert.ok(R.isReloadable(rep) && R.capacityOf(rep) === 5 && R.listedRounds(rep) === 2, "a repeating crossbow holds 5 and refills in 2 rounds");
  assert.equal(R.listedRounds(w("Crossbow, Repeating Hand")), 1);
  const { ARNEYAN } = await import("../arneyan/module/config.mjs");
  assert.ok(ARNEYAN.conditions.terrified && /lesser fear/.test(ARNEYAN.conditions.frightened.text));
  const E = await import("../arneyan/module/effects.mjs");
  const fearless = { system: { mods: { traits: { immune: [{ value: "condition:frightened" }] } } } };
  assert.ok(E.immuneTo(fearless, "terrified"), "immune to fear covers Terrified");
  const sp = read("spells");
  assert.ok(sp.find(s => s.name === "Fear").system.applies.some(a => a.statuses.includes("terrified")));
  const G = await import("../arneyan/module/gear.mjs");
  const shield = (name, magic = 0, equipped = true) => ({ type: "armour", name, _source: { name }, system: { category: "shield", magic, equipped } });
  assert.ok(G.canSplinter(shield("Shield, Medium")) && !G.canSplinter(shield("Buckler")) && !G.canSplinter(shield("+1 Shield", 1)) && !G.canSplinter(shield("Shield, Medium", 0, false)));
  assert.ok(read("actions").some(a => a.name === "Taunt"));
  assert.equal(cf.find(i => i.name === "Backstab")._id, "8qIgZFStG8JBG61j", "Backstab keeps Back Attack's id");
  assert.equal(cf.find(i => i.name === "Thieves' Cant")._id, "YGCVjC9mUfm0216U");
  console.log("books0173: ok");
}
{
  const E = await import("../arneyan/module/effects.mjs");
  const xbow = (kits) => ({ type: "weapon", name: "Crossbow, Light", _source: { name: "Crossbow, Light" }, flags: {}, actor: { items: kits.map(n => ({ type: "kit", name: n })) } });
  assert.ok(!E.weaponMatches({ weapon: "bow" }, xbow([])), "a crossbow isn't a bow");
  assert.ok(E.weaponMatches({ weapon: "bow" }, xbow(["Arbalester (Archer)"])), "except for an Arbalester");
  console.log("arbalester: ok");
}

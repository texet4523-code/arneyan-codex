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
{
  const E = await import("../arneyan/module/effects.mjs");
  const deleted = [];
  const actor = st => ({ effects: st.map((s, i) => ({ id: `e${i}`, statuses: new Set([s]) })), deleteEmbeddedDocuments: async (t, ids) => deleted.push(...ids) });
  assert.deepEqual(await E.fearEitherOr(actor(["frightened"]), ["terrified"]), ["terrified"]);
  assert.deepEqual(deleted, ["e0"], "Terrified ends Frightened");
  assert.deepEqual(await E.fearEitherOr(actor(["terrified"]), ["frightened", "prone"]), ["prone"], "Frightened adds nothing to Terrified");
  assert.deepEqual(await E.fearEitherOr(actor([]), ["terrified", "frightened"]), ["terrified"]);
  const upd = [];
  const mixed = { effects: [{ id: "p", statuses: new Set(["blinded", "frightened"]), update: async d => upd.push(d) }], deleteEmbeddedDocuments: async () => assert.fail("nothing deleted") };
  await E.fearEitherOr(mixed, ["terrified"]);
  assert.deepEqual(upd, [{ statuses: ["blinded"] }], "Blinded stays");
  console.log("fear either/or: ok");
}

// HB v0.10.74 and Keeps & Kingdoms v0.5.3 (B-F67, B-F68).
{
  const fsx = await import("node:fs");
  const root = new URL("../packs-src/", import.meta.url).pathname;
  const load = (pack, pred) => fsx.readdirSync(root + pack).map(f => JSON.parse(fsx.readFileSync(root + pack + "/" + f))).find(pred);
  const { ARNEYAN } = await import("../arneyan/module/config.mjs");
  assert.deepEqual([4, 8, 9, 10, 11, 12, 13].map(l => ARNEYAN.bth("rogue", l)), [1, 1, 3, 3, 4, 5, 7], "Rogue and Assassin ramp");
  for (const c of ["Rogue", "Assassin"]) assert.equal(load("classes", d => d.name === c).system.bthProgression, "rogue");
  const bm = load("class-features", d => d.name === "Bow Mastery");
  const hit = bm.system.rules.find(r => r.key === "attack");
  assert.ok(hit && hit.value === "2:1, 6:2" && hit.weapon === "bow", "Bow Mastery adds to hit with bows");
  const E = await import("../arneyan/module/effects.mjs");
  assert.deepEqual([2, 5, 6, 12, 24].map(l => E.levelText("{" + hit.value + "}", l)), ["1", "1", "2", "2", "2"]);
  // Renamed documents keep their ids.
  assert.equal(load("equipment", d => d.name === "Jaw Trap (bear trap)")._id, "48E6TlsdVTUrTX73");
  assert.ok(!load("equipment", d => d.name === "Hunting Trap (iron jaws)"));
  assert.equal(load("spells", d => d.name === "Cause Light Wounds")._id, "Eyaa2BdX9WMmjtjc");
  const mc = load("kk-rules", d => d.name === "Chapter 4: Mass Combat");
  assert.equal(mc._id, "AcyYlNZhkhU798yV", "the Mass Combat journal keeps the Warfare journal's id");
  assert.ok(!load("kk-rules", d => d.name === "Chapter 4: Warfare"));
  assert.equal(fsx.readdirSync(root + "spells").filter(f => f.startsWith("items_Clairaudience")).length, 1, "one Clairaudience/Clairvoyance");
  const kn = load("classes", d => d.name === "Knight").system.features;
  assert.equal(kn.find(f => f.name === "Challenge").level, 1); assert.equal(kn.find(f => f.name === "Command: Expert in Arms").level, 2);
  // Review fixes: the Knight's Command button, the Monk's Parrying Stance, the two capped spells.
  const cfx = n => load("class-features", d => d.name === n);
  assert.equal(cfx("Command (Charisma)").system.activities.find(a => a.name === "Expert in Arms").minLevel, 2);
  assert.equal(load("class-features", d => d.name === "Parrying Stance" && d.system.activities?.length).system.activities[0].maxLevel, 4);
  assert.equal(load("spells", d => d.name === "Slay Living").system.damage, "(min(@cl, 15))d6");
  assert.ok(!load("class-features", d => d.name === "Woodcraft").system.rules.length);
  // A Mechanist's repeating crossbows hold 10 Shots from 9th level; nobody else's do.
  const R = await import("../arneyan/module/reload.mjs");
  const rep = load("equipment", d => d.name === "Crossbow, Repeating Heavy");
  const who = (kit, lvl) => ({ items: [{ type: "kit", name: kit }, { type: "class", name: "Gunslinger", system: { levels: lvl } }] });
  assert.equal(R.capacityOf({ ...rep, actor: who("Mechanist (Gunslinger)", 9) }), 10);
  assert.equal(R.capacityOf({ ...rep, actor: who("Mechanist (Gunslinger)", 8) }), 5);
  assert.equal(R.capacityOf({ ...rep, actor: who("Duelist (Gunslinger)", 12) }), 5);
  assert.equal(R.capacityOf({ ...load("equipment", d => d.name === "Repeating Pistol"), actor: who("Mechanist (Gunslinger)", 12) }), 5, "only crossbows");
  // The Wind Rifle: "Reload —" is its entry, not the "no reload between shots" note; six shots, then a 10 minute refill.
  const C = await import("../arneyan/module/combat.mjs");
  const wind = load("equipment", d => d.name === "Gnomish Wind Rifle");
  assert.equal(C.firearmOf(wind).reload, "—");
  assert.deepEqual([R.capacityOf(wind), R.listedRounds(wind)], [6, 100]);
  assert.equal(C.firearmOf(load("equipment", d => d.name === "Musket")).reload, "2 rd");
  // The spell-name fix leaves "X / Y" headings alone.
  const jr = fsx.readdirSync(root + "rules").map(f => fsx.readFileSync(root + "rules/" + f, "utf8")).join("\n");
  for (const h of ["Advantage / Disadvantage", "Lasts / Ends early by", "Poisoned / Sickened"]) assert.ok(jr.includes(h), `"${h}" keeps its spaced slash`);
  // Polymorph and Plane Shift: the touch attack, then the Will save, on the sheet and from a wand or scroll.
  const T = await import("../arneyan/module/touch.mjs");
  assert.ok(T.TOUCH_THEN_SAVE.has("Ghoul Touch") && T.TOUCH_THEN_SAVE.has("Contagion"));
  assert.equal(T.thenSaveName({ system: { save: "fort" } }, ARNEYAN.saveTypes), "its Fortitude save");
  assert.match(T.thenSaveName({ system: { save: "" } }, ARNEYAN.saveTypes), /disease/);
  for (const n of ["Polymorph", "Plane Shift"]) { assert.ok(T.TOUCH_ATTACK.has(n) && T.TOUCH_THEN_SAVE.has(n)); assert.equal(load("spells", d => d.name === n).system.save, "will"); }
  const gearSrc = fsx.readFileSync(new URL("../arneyan/module/gear.mjs", import.meta.url), "utf8");
  assert.ok(gearSrc.includes("if (s.save && (!touchy || thenSave))") && gearSrc.includes("TOUCH_OLD_NAMES.has(sp.name)"));
  console.log("OK HB v0.10.74 and K&K v0.5.3");
}

/* HB v0.10.80: the Paladin's Class Save DC uses Charisma and the Spellblade's Intelligence, whatever their Strength. */
{
  const { ARNEYAN } = await import("../arneyan/module/config.mjs");
  assert.deepEqual([ARNEYAN.classDCKey.Paladin, ARNEYAN.classDCKey.Spellblade], ["cha", "int"]);
  const fsm = await import("node:fs");
  const src = fsm.readFileSync(new URL("../arneyan/module/data/actor-models.mjs", import.meta.url), "utf8");
  assert.ok(src.includes("ARNEYAN.classDCKey?.[first.name]"), "the Class Save DC reads classDCKey");
  console.log("OK HB v0.10.80 Class Save DC");
}

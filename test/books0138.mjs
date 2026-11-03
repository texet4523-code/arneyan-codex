// Books v0.10.38 (Fable Review 2 fix build, K44 and K45; board B-F25) in the system (0.10.79): the Extra Attack's
// Disadvantage that no Advantage cancels, Marked Prey, the first-hit Smite, the Monk's Ki pool and Fast Healing,
// Performance: Fascinate, Wild Surge improves, First Blood, Beasthide's chosen type and the Shifter migration fix.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
for (const k of ["Actor", "Item", "Combatant", "ChatMessage"]) globalThis[k] ??= class {};

const { modeFromEvent } = await import("../arneyan/module/rolls.mjs");
const { ModSet } = await import("../arneyan/module/effects.mjs");
const { weaponTrait } = await import("../arneyan/module/documents.mjs");
const C = await import("../arneyan/module/combat.mjs");
const M = await import("../arneyan/module/migrate.mjs");
const read = (dir, prefix = "items_") => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith(prefix))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const features = read("class-features"), kits = read("kits").filter(k => k.type === "kit"), anc = read("ancestries"), spells = read("spells");
const feat = (n, c) => { const f = features.find(x => x.name === n && x.system.className === c); assert.ok(f, `${n} (${c})`); return f; };
const src = p => fs.readFileSync(new URL(`../arneyan/module/${p}`, import.meta.url), "utf8");

/* K44 S1: the Extra Attack and the off-hand attack keep their Disadvantage whatever Advantage applies. */
assert.equal(modeFromEvent(null, [-2, 1, 1]), -1, "Advantage never cancels it");
assert.equal(modeFromEvent({ shiftKey: true }, [-2]), -1, "not even a shift-click");
assert.equal(modeFromEvent(null, [-1, 1]), 0, "an ordinary Disadvantage still cancels");
for (const f of features.filter(x => /^Extra Attack/.test(x.name))) assert.equal(f.system.activities[0].disadvantage, "extra", `${f.name} (${f.system.className})`);
assert.ok(src("combat.mjs").includes('out.adv.push({ values: [-2], adv: [], dis: ["Off-hand (no Advantage cancels it)"] })'));
assert.ok(src("documents.mjs").includes('values: [fixed ? -2 : -1]'));
// F-R4 (Review, 2 Nov): Flèche and Flowing Strikes against the creature just hit are extra attacks too.
assert.equal(feat("Flèche", "Swashbuckler").system.activities[0].disadvantage, "fixed");
assert.deepEqual(read("feats").find(f => f.name === "Flowing Strikes").system.activities.map(a => a.disadvantage), ["fixed", ""]);
assert.ok(src("documents.mjs").includes('const fixed = ["extra", "fixed"].includes(act.disadvantage)'));
// Twin Nock and Combat Dominance are not Extra Attacks: their Disadvantage still cancels.
assert.equal(feat("Combat Dominance", "Fighter").system.activities[0].disadvantage, "rest");

/* K44 S3: Marked Prey, Advantage on the marker's own first attack each round against it. */
const mp = feat("Marked Prey", "Ranger").system;
assert.deepEqual(mp.applies[0].rules.map(r => [r.key, Number(r.value)]), [["adv.against.first.mine", 1]]);
assert.equal(mp.activities[0].effect, "Marked Prey");
{
  const ranger = { uuid: "Actor.ranger", getFlag: () => null, isOwner: false };
  const other = { uuid: "Actor.other", getFlag: () => null, isOwner: false };
  const prey = { uuid: "Actor.prey", name: "Wolf", effects: [{ name: "Marked Prey", disabled: false, origin: "Actor.ranger.Item.mp", flags: { arneyan: { rules: [{ key: "adv.against.first.mine", value: 1 }] } } }] };
  assert.deepEqual(C.markedFirst(ranger, prey).values, [1], "the Ranger's attack");
  assert.deepEqual(C.markedFirst(other, prey).values, [], "anyone else's: nothing");
  assert.deepEqual(C.markedFirst(ranger, { ...prey, effects: [] }).values, [], "not marked");
}

/* K44 S4: the first hit each encounter offers the Smite. */
assert.ok(feat("Channel Divinity (Charisma)", "Paladin").system.activities.find(a => a.name === "Smite").text.includes("first hit each encounter"));
assert.ok(src("documents.mjs").includes("firstSmite()") && src("chat.mjs").includes('on(".arn-smite"'));
assert.ok(src("chat.mjs").includes("actor.firstSmite?.()?.item?.id !== item.id"), "a second click or an old card spends nothing");
assert.ok(src("documents.mjs").includes('smite && !["failure", "nat1"].includes(outcome)'), "no Smite button on a miss");

/* K44 S5: Steady Shot is a flat +1d6. */
assert.deepEqual(feat("Steady Shot", "Gunslinger").system.activities.map(a => a.formula), ["1d6"]);

/* K44 S6: Ghoul Touch paralyses for 1 round per three levels. */
const ghoul = spells.find(s => s.name === "Ghoul Touch").system;
assert.deepEqual([ghoul.save, ghoul.applies[0].rounds, ghoul.applies[0].statuses], ["fort", "max(1, floor(@cl / 3))", ["paralysed"]]);
assert.ok(spells.some(s => s.name === "Phantasmal Jab" && s.system.level === 0 && s.system.save === "will" && s.system.damageType === "psychic"));

/* K45: the Monk's Ki pool, keeping the old features' ids. */
const ki = feat("Ki", "Monk");
assert.equal(ki._id, "EEd86TSRn8QJQNK3", "Stun Attack's id");
assert.deepEqual([ki.system.uses.per, ki.system.uses.formula], ["rest", "max(1, @cl + @wis.mod)"]);
assert.deepEqual(ki.system.activities.map(a => [a.name, a.cost, a.effect]), [["Stun Attack", 1, "Stunned"]]);
const boi = feat("Ki: Body of Iron", "Monk"), ds = feat("Ki: Death Strike", "Monk");
assert.deepEqual([boi._id, ds._id], ["waqGtTczSTgFSdmM", "gH5YblxxKBxOtKQK"]);
assert.deepEqual([boi.system.uses.pool, ds.system.uses.pool], ["Ki", "Ki"]);
assert.deepEqual(boi.system.activities.map(a => a.cost), [2, 2]);
assert.deepEqual(ds.system.activities.map(a => [a.kind, a.save, a.cost]), [["save", "fort", 4]]);
// Fast Healing is always on: a rest.heal rule, no daily use.
const ar = feat("Ascetic Recovery", "Monk").system;
assert.ok(ar.rules.some(r => r.key === "rest.heal" && r.value === "@cl") && !ar.activities.some(a => a.name === "Fast Healing"));
assert.equal(new ModSet([{ key: "rest.heal", value: "@cl", data: { cl: 6 }, label: "Fast Healing" }]).sum("rest.heal"), 6);
assert.ok(src("documents.mjs").includes('this.mods?.parts?.("rest.heal")'));
// Primary unarmed dice: 1d6 at 1st, 1d8 at 3rd.
assert.equal(feat("Hand-to-Hand Combat", "Monk").system.rules.find(r => r.key === "unarmed.dice").value, "1:1d6, 3:1d8, 7:1d10");

/* K45: Fascinate is a Performance option. */
const fas = feat("Performance: Fascinate", "Bard");
assert.equal(fas._id, "LsWKxgs0ZtOLLPCd");
assert.equal(fas.system.uses.pool, "Performance (Charisma)");
assert.equal(fas.system.activities.find(a => a.name === "Fascinate").cost, 1);
assert.ok(fas.system.activities.find(a => a.name === "Sway Crowd").text.includes("until the end of their next turn"));

/* Fable M5: Sorcerer's Spark gave way to Wild Surge improves. */
assert.ok(feat("Wild Surge", "Sorcerer").system.activities[0].text.includes("second Wild Surge each day"));
assert.equal(features.filter(f => f.name === "Wild Surge improves").length, 3, "5th, 13th (books v0.10.41) and 20th");

/* Fable M6 and M13: First Blood, Change Self at will. */
assert.equal(feat("First Blood", "Assassin").system.level, 1);
assert.deepEqual(feat("First Blood", "Assassin").system.activities.map(a => a.formula), ["1d6"]);
assert.deepEqual(feat("Change Self", "Illusionist").system.activities.map(a => a.cost), [0, 1]);
for (const [n, id] of [["Quick Reflexes", "12r60eED90uq58Pr"], ["Quick Reflexes (Improved)", "VkVLCNJ3it9jWN1i"], ["Hit and Run", "ImomMrYnSQza53HJ"]]) assert.equal(feat(n, "Assassin")._id, id, `${n} keeps its id`);

/* Kits (M2, M11, M17). */
const kit = n => { const k = kits.find(x => x.name === n); assert.ok(k, n); return k.system.features; };
assert.equal(kit("Deity: Brigh (The Crafted Turn) (Cleric)")[0].applies.find(a => a.name === "Tempered Weapon").rules[0].value, "+1d6");
assert.equal(kit("The Silver Serpent (Swashbuckler)")[0].rules[0].key, "adv.check.dex");
assert.ok(kit("Westfront Wall-Archer (Archer)")[0].rules[0].value.includes("ignores its resistances"));
assert.ok(kit("The Opportunist (Fighter)")[0].rules[0].value.includes("19 or 20"));
assert.deepEqual(kit("College of the Silver Pipes (Bard)")[0].applies[0].rules.map(r => [r.key, Number(r.value) || r.value]).slice(0, 1), [["adv.attack.first", -1]]);

/* K45: Beasthide resists one chosen nonmagical weapon type. */
assert.ok(weaponTrait("non-magical-slashing", "slashing", "plain"));
assert.ok(!weaponTrait("non-magical-slashing", "piercing", "plain"));
assert.ok(!weaponTrait("non-magical-slashing", "slashing", "magic"));
const shifter = anc.find(x => x.name === "Shifter").system.choice;
const bh = shifter.options.find(o => o.name.endsWith("Beasthide"));
assert.equal(bh.optionChoice.options.length, 3);

/* The Shifter migration (review of 95eec4c): a lineage granted as a switch from 0.10.54 on (no toggleSet) still takes
   the 0.10.79 uses and rules; Beasthide also gets its type to choose. */
{
  const shOpt = name => shifter.options.find(o => o.name.endsWith(name));
  const ancItem = { id: "anc1", type: "ancestry", name: "Shifter", _stats: { compendiumSource: "Compendium.arneyan.ancestries.Item.ADRfCMftshwrDIvp" }, flags: {} };
  const mk = (name, rules) => ({ id: `x${name}`, type: "ability", name: `${shifter.label}: ${shOpt(name).name}`, flags: { arneyan: { grantedBy: "anc1", source: `anc1.${name}` } },
    system: { toggle: true, active: false, rules, uses: { value: 1, max: 1, per: "day", formula: "max(1, ceil(@level/2))" }, className: "Shifter" } });
  const beast = mk("Beasthide", [{ key: "resist", value: "non-magical 3", when: "", label: "" }, { key: "note.init", value: shOpt("Beasthide").rules[0].value, when: "", label: "" }]);
  const swift = mk("Swiftstride", [{ key: "speed", value: "15", when: "", label: "" }]);
  const items = [ancItem, beast, swift];
  const actor = { id: "a1", name: "Rook", type: "character", items: Object.assign(items, { get: id => items.find(i => i.id === id), contents: items }), system: { level: 3 } };
  const fetch = async uuid => (uuid.endsWith("ADRfCMftshwrDIvp") ? { type: "ancestry", system: { choice: shifter } } : null);
  const ups = await M.updatesFor([beast, swift], actor, fetch, { legacy: "skip", notes: { kept: [], unstamped: 0, unstampedActors: new Set() } });
  const b = ups.find(u => u._id === beast.id), s = ups.find(u => u._id === swift.id);
  assert.ok(b && s, "both Shifter switches are updated");
  assert.deepEqual([b["system.uses"].per, s["system.uses"].per], ["encounter", "encounter"]);
  assert.ok(s["system.rules"].some(r => r.key === "toggle.ends"));
  assert.ok(!b["system.rules"].some(r => r.key === "resist"), "the old Resistance 3 goes");
  assert.equal(b["system.optionChoice"].options.length, 3, "Beasthide's type to choose");
  assert.equal(b["flags.arneyan.shiftSet"], M.SHIFT_REWORK);
}

/* Renamed in place: an existing Monk's Stun Attack becomes Ki (its options find the pool by name); one renamed by hand
   keeps its name. */
{
  const uuid = "Compendium.arneyan.class-features.Item.EEd86TSRn8QJQNK3";
  const mk = (name, extra = {}) => ({ id: `s${name.length}`, type: "ability", name, flags: { arneyan: { source: uuid, grantedBy: "cls1", ...extra } },
    system: { className: "Monk", level: 1, uses: { value: 3, max: 3, per: "day", formula: "@cl" }, rules: [], activities: [], description: "" } });
  const stun = mk("Stun Attack"), mine = mk("Stunning Fist");
  const items = [stun, mine];
  const actor = { id: "m1", name: "Sarrix", type: "character", items: Object.assign(items, { get: id => items.find(i => i.id === id), contents: items }), system: { level: 9 } };
  const fetch = async u => (u === uuid ? { type: "ability", name: "Ki", system: ki.system } : null);
  const ups = await M.updatesFor(items, actor, fetch, { legacy: "skip", notes: { kept: [], unstamped: 0, unstampedActors: new Set() } });
  assert.equal(ups.find(u => u._id === stun.id)?.name, "Ki");
  assert.equal(ups.find(u => u._id === mine.id)?.name, undefined, "renamed by hand: left alone");
  assert.deepEqual(M.RENAMED_FEATURES["Compendium.arneyan.class-features.Item.UTIrytRZu4fYc46O"], ["Sorcerer's Spark", "Wild Surge improves"]);
}

/* Pregens start with formula uses full (Ki 11 of 11 at 9th, not the compendium's fallback 1). */
{
  const pregens = read("pregens", "actors_");
  const uses = (who, what) => pregens.find(p => p.name.startsWith(who)).items.find(i => i.name === what).system.uses;
  assert.deepEqual([uses("Sarrix", "Ki").value, uses("Sarrix", "Ki").max], [11, 11]);
  assert.equal(uses("Kavra", "Rage").value, 4);
  assert.equal(uses("Liriel", "Flèche").value, 4);
  assert.equal(uses("Sister Aurelle", "Turn Undead").value, 6);
}

console.log("OK 0.10.79 books v0.10.38");

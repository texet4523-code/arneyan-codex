// 0.10.115 (F-R7, Kieran 16 Nov): weekly and monthly uses on the game clock, Casting Under Threat, extra uses for
// Challenge and the Witch's Curse, burned and drained attributes with Spellburn.
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeItem, makeActor } from "./harness.mjs";
for (const k of ["Actor", "Item", "Combatant", "ChatMessage"]) globalThis[k] ??= class {};

const IM = await import("../arneyan/module/data/item-models.mjs");
const AM = await import("../arneyan/module/data/actor-models.mjs");
const { CharacterData } = AM;
const { ARNEYAN } = await import("../arneyan/module/config.mjs");
const P = await import("../arneyan/module/periodic.mjs");
const D = await import("../arneyan/module/documents.mjs");
const read = (dir, start) => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).find(f => f.startsWith(start))}`, import.meta.url), "utf8"));
const DAY = 86400;

/* ---- Weekly and monthly uses ---- */
assert.equal(P.periodStep({ per: "day", value: 0, max: 1 }, 0), null, "only weeks and months");
assert.equal(P.periodStep({ per: "week", value: 1, max: 1 }, 5), null, "full and unmarked: nothing");
assert.deepEqual(P.periodStep({ per: "week", value: 0, max: 1 }, 100), { mark: 100 }, "spent: its time is noted");
assert.deepEqual(P.periodStep({ per: "week", value: 0, max: 1, since: 0 }, 0), null, "a time of 0 is a time");
assert.equal(P.periodStep({ per: "week", value: 0, max: 1, since: 100 }, 100 + 7 * DAY - 1), null, "not yet a week");
assert.deepEqual(P.periodStep({ per: "week", value: 0, max: 1, since: 100 }, 100 + 7 * DAY), { restore: true });
assert.equal(P.periodStep({ per: "month", value: 1, max: 2, since: 100 }, 100 + 29 * DAY), null);
assert.deepEqual(P.periodStep({ per: "month", value: 1, max: 2, since: 100 }, 100 + 30 * DAY), { restore: true });
assert.deepEqual(P.periodStep({ per: "week", value: 1, max: 1, since: 100 }, 200), { clear: true }, "put back by hand: the time is forgotten");
assert.equal(P.periodStep({ per: "week", value: 0, max: 0 }, 5), null, "no uses, nothing to do");
assert.deepEqual(P.periodStep({ per: "week", value: 0, max: 1, since: 100 * DAY }, 10 * DAY), { mark: 10 * DAY }, "the clock put back: the week counts from now");

/* ---- Casting Under Threat: a caster hurt on its own turn in a running fight ---- */
{
  const spell = lvl => ({ type: "spell", system: { level: lvl } });
  const wiz = { uuid: "Actor.w", items: [spell(0), spell(3)] }, ftr = { uuid: "Actor.f", items: [] }, cantrips = { uuid: "Actor.c", items: [spell(0)] };
  const fight = a => ({ started: true, combatant: { actor: a } });
  assert.equal(D.castingThreat(wiz, fight(wiz)), true);
  assert.equal(D.castingThreat(wiz, fight(ftr)), false, "not on someone else's turn");
  assert.equal(D.castingThreat(wiz, { started: false, combatant: { actor: wiz } }), false, "not before the fight starts");
  assert.equal(D.castingThreat(wiz, null), false);
  assert.equal(D.castingThreat(ftr, fight(ftr)), false, "no spells");
  assert.equal(D.castingThreat(cantrips, fight(cantrips)), false, "damage never costs a cantrip");
  assert.equal(D.castingThreat(wiz, fight({ uuid: "Actor.w", items: [] })), true, "the same creature by uuid (a token's copy)");
}

/* ---- Extra uses: Twice Challenged and the Witch's Curse at 18th ---- */
{
  assert.ok(ARNEYAN.allRuleKeys.has("uses.extra.challenge") && ARNEYAN.allRuleKeys.has("uses.extra.patron-curse"));
  assert.equal(AM.usesExtraKey("Challenge"), "uses.extra.challenge");
  assert.equal(AM.usesExtraKey("Patron Curse"), "uses.extra.patron-curse");
  const champion = read("kits", "items_Path_Champion_Knight_").system.features;
  assert.deepEqual(champion.find(f => f.name === "Twice Challenged").rules.map(r => [r.key, String(r.value)]), [["uses.extra.challenge", "1"]]);
  assert.equal(champion.find(f => f.name === "Champion's Blow").uses.formula, "1:1, 15:2", "HB v0.10.86: twice from 15th");
  assert.deepEqual(read("class-features", "items_Patron_Boon_Curse_improves_").system.rules.map(r => [r.key, String(r.value)]), [["uses.extra.patron-curse", "1"]]);
  const challenge = read("class-features", "items_Challenge_").system;
  const knight = makeActor(CharacterData, "character", {}, [
    makeItem(IM.AbilityData, "ability", "Challenge", { uses: challenge.uses }),
    makeItem(IM.AbilityData, "ability", "Twice Challenged", { rules: champion.find(f => f.name === "Twice Challenged").rules })]);
  assert.equal(knight.items.find(i => i.name === "Challenge").system.uses.max, 2, "a Champion challenges twice an encounter");
  const plain = makeActor(CharacterData, "character", {}, [makeItem(IM.AbilityData, "ability", "Challenge", { uses: challenge.uses })]);
  assert.equal(plain.items.find(i => i.name === "Challenge").system.uses.max, 1);
}

/* ---- Burned and drained attributes ---- */
{
  // Constitution 16 (+2): 3 drained reads 13 (+1); 4 burned on top reads 9 (-1). HB v0.10.86: a burned score counts for
  // everything, Max HP and the death threshold included.
  assert.deepEqual(AM.abilityAfter({ value: 16, drain: 0, burn: 0 }), { total: 16, mod: ARNEYAN.abilityMod(16), modUnburned: ARNEYAN.abilityMod(16), modWhole: ARNEYAN.abilityMod(16), drainMod: 0, lost: [] });
  const both = AM.abilityAfter({ value: 16, drain: 3, burn: 4 });
  assert.equal(both.total, 9);
  assert.equal(both.mod, ARNEYAN.abilityMod(9));
  assert.equal(both.modUnburned, ARNEYAN.abilityMod(9), "HB v0.10.86: the burn counts for the death threshold too");
  assert.equal(both.modWhole, ARNEYAN.abilityMod(16), "a level's HP is rolled with the whole score: drained and burned points come off Max HP by themselves");
  assert.equal(both.drainMod, ARNEYAN.abilityMod(9) - ARNEYAN.abilityMod(16));
  assert.deepEqual(both.lost, [{ label: "Drained", value: -3 }, { label: "Burned (Spellburn)", value: -4 }]);
  assert.equal(AM.abilityAfter({ value: 3, drain: 0, burn: 9 }).total, 0, "never below 0");
  const sorc = lost => makeActor(CharacterData, "character", { abilities: { con: { value: 16, ...lost } }, attributes: { hp: { value: 20, max: 20 } } }, []);
  const whole = sorc({}), burnt = sorc({ burn: 6 }), drained = sorc({ drain: 6 });
  assert.equal(burnt.system.abilities.con.total, 10);
  assert.equal(burnt.system.abilities.con.mod, ARNEYAN.abilityMod(10));
  assert.equal(burnt.system.attributes.hp.max, whole.system.attributes.hp.max + (ARNEYAN.abilityMod(10) - ARNEYAN.abilityMod(16)) * burnt.system.level, "HB v0.10.86: burned Constitution lowers Max HP for every level");
  assert.equal(burnt.system.attributes.deathAt - whole.system.attributes.deathAt, ARNEYAN.abilityMod(16) - ARNEYAN.abilityMod(10), "and moves the death threshold by the lost modifier");
  assert.equal(drained.system.attributes.hp.max, whole.system.attributes.hp.max + (ARNEYAN.abilityMod(10) - ARNEYAN.abilityMod(16)) * drained.system.level, "drained Constitution lowers Max HP for every level");
  assert.ok(drained.system.attributes.deathAt >= whole.system.attributes.deathAt, "a drained Constitution moves the death threshold");
  // A rule that reads a modifier follows drained and burned points (Charisma to saves and the like).
  const ruled = lost => makeActor(CharacterData, "character", { abilities: { cha: { value: 18, ...lost } } }, [makeItem(IM.AbilityData, "ability", "Grace", { rules: [{ key: "save", value: "@abilities.cha.mod" }] })]);
  assert.equal(ruled({}).system.mods.sum("save"), ARNEYAN.abilityMod(18));
  assert.equal(ruled({ drain: 4 }).system.mods.sum("save"), ARNEYAN.abilityMod(14));
  // HB v0.10.86: Spellburn is a flat 2 points; a long rest gives back 3 in all (6 from 6th), the most burned first.
  assert.deepEqual([0, 1, 2, 3].map(n => D.spellburnCost(n)), [2, 2, 2, 2]);
  assert.deepEqual(D.BURNABLE, ["str", "dex", "con"]);
  assert.deepEqual(D.burnRecovery({ str: 2, dex: 0, con: 4 }, 5), { str: 0, dex: 0, con: 3 });
  assert.deepEqual(D.burnRecovery({ str: 2, dex: 2, con: 4 }, 6), { str: 1, dex: 1, con: 4 });
  assert.deepEqual(D.burnRecovery({ str: 1 }, 6), { str: 1, dex: 0, con: 0 }, "never more than was burned");
  const sb = read("class-features", "items_Metamagic_iG2fFKdcciI8ytpv").system.activities, oc = read("class-features", "items_Overchannel_").system.activities;
  assert.deepEqual([sb[0].name, sb[0].kind, sb[0].formula], ["Spellburn", "burn", "flat"]);
  assert.deepEqual([oc[0].kind, oc[0].formula, oc[1].kind, oc[1].minLevel], ["burn", "level", "note", 15]);
}
console.log("OK 0.10.115 batch");

/* ---- Floors and stairs ---- */
{
  const S = await import("../arneyan/module/stairs.mjs");
  const ground = { elevation: { bottom: 0, top: 20 }, sort: 0 };
  assert.deepEqual(S.nextFloor([ground], "above"), { elevation: { bottom: 20, top: 40 }, sort: 1 });
  assert.deepEqual(S.nextFloor([ground], "below"), { elevation: { bottom: -20, top: 0 }, sort: -1 });
  assert.deepEqual(S.nextFloor([ground, { elevation: { bottom: 20, top: 30 }, sort: 1 }], "above"), { elevation: { bottom: 30, top: 40 }, sort: 2 }, "as tall as the floor below it");
  assert.deepEqual(S.nextFloor([], "above"), { elevation: { bottom: 0, top: 20 }, sort: 0 });
  assert.deepEqual(S.nextFloor([{ elevation: { bottom: 0, top: 0 }, sort: 3 }], "above"), { elevation: { bottom: 0, top: 20 }, sort: 4 }, "a floor with no height: the default height");
  const r = S.stairRegion({ name: "Stairs up", levelId: "L1", x: 510.4, y: 499.6, width: 100, height: 200 });
  assert.deepEqual(r.shapes, [{ type: "rectangle", x: 510, y: 500, width: 100, height: 200 }]);
  assert.deepEqual(r.levels, ["L1"]);
  assert.equal(r.flags.arneyan.stairs, true);
  const copy = S.stairRegion({ name: "x", shapes: [{ type: "polygon", points: [0, 0, 1, 1] }] });
  assert.deepEqual(copy.shapes, [{ type: "polygon", points: [0, 0, 1, 1] }]);
  assert.ok(!("levels" in copy), "no floor named: every floor");
  const b = S.stairBehaviour("Scene.a.Region.b", { ask: true });
  assert.deepEqual([b.type, b.system.destinations, b.system.destination, b.system.choice, b.flags.arneyan.stairs], ["teleportToken", ["Scene.a.Region.b"], "Scene.a.Region.b", true, true]);
  const inn = { id: "s1", name: "Inn", levels: [{ id: "g", name: "Ground" }, { id: "u", name: "Upstairs" }],
    regions: [{ id: "r1", name: "Stairs", levels: ["g"] }, { id: "r2", name: "Cellar door", levels: ["g"] }] };
  const cave = { id: "s2", name: "Cave", levels: [{ id: "c", name: "Level" }], regions: [{ id: "r9", name: "Mouth", levels: ["c"] }] };
  const t = S.stairTargets(inn, "r1", [inn, cave]);
  assert.deepEqual(t.map(o => o.value), ["floor:u", "region:s1:r2", "scene:s2", "region:s2:r9"]);
  assert.equal(t[0].label, "The same spot on Upstairs");
  assert.equal(t[1].label, "Cellar door (Ground)");
  assert.equal(t[3].label, "Cave: Mouth", "a one-floor map names no floor");
  assert.deepEqual(S.stairTargets(cave, "r9", [cave]).map(o => o.value), [], "one floor, one area, one map: nowhere to lead");
  // 0.10.116: an area on every floor starts on the floor being looked at, which is not offered as where it leads.
  const open = { ...inn, regions: [{ id: "r1", name: "Stairs", levels: [] }] };
  assert.deepEqual(S.stairTargets(open, "r1", [open]).map(o => o.value), ["floor:g", "floor:u"], "no floor known: both offered");
  assert.deepEqual(S.stairTargets(open, "r1", [open], { startLevel: "g" }).map(o => o.value), ["floor:u"]);
  assert.deepEqual(S.stairTargets(inn, "r1", [inn], { startLevel: "u" }).map(o => o.value), ["floor:u", "region:s1:r2"], "an area with a floor keeps its own");
  console.log("OK floors and stairs");
}

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
  assert.equal(champion.find(f => f.name === "Champion's Blow").uses.formula, "1:1, 17:2");
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
  // Constitution 16 (+2): 3 drained reads 13 (+1); 4 burned on top reads 9 (-1), but HP and death keep the unburned +1.
  assert.deepEqual(AM.abilityAfter({ value: 16, drain: 0, burn: 0 }), { total: 16, mod: ARNEYAN.abilityMod(16), modUnburned: ARNEYAN.abilityMod(16), drainMod: 0, lost: [] });
  const both = AM.abilityAfter({ value: 16, drain: 3, burn: 4 });
  assert.equal(both.total, 9);
  assert.equal(both.mod, ARNEYAN.abilityMod(9));
  assert.equal(both.modUnburned, ARNEYAN.abilityMod(13));
  assert.equal(both.drainMod, ARNEYAN.abilityMod(13) - ARNEYAN.abilityMod(16));
  assert.deepEqual(both.lost, [{ label: "Drained", value: -3 }, { label: "Burned (Spellburn)", value: -4 }]);
  assert.equal(AM.abilityAfter({ value: 3, drain: 0, burn: 9 }).total, 0, "never below 0");
  const sorc = lost => makeActor(CharacterData, "character", { abilities: { con: { value: 16, ...lost } }, attributes: { hp: { value: 20, max: 20 } } }, []);
  const whole = sorc({}), burnt = sorc({ burn: 6 }), drained = sorc({ drain: 6 });
  assert.equal(burnt.system.abilities.con.total, 10);
  assert.equal(burnt.system.abilities.con.mod, ARNEYAN.abilityMod(10));
  assert.equal(burnt.system.attributes.hp.max, whole.system.attributes.hp.max, "burned Constitution leaves Max HP alone");
  assert.equal(burnt.system.attributes.deathAt, whole.system.attributes.deathAt, "and the death threshold");
  assert.equal(drained.system.attributes.hp.max, whole.system.attributes.hp.max + (ARNEYAN.abilityMod(10) - ARNEYAN.abilityMod(16)) * drained.system.level, "drained Constitution lowers Max HP for every level");
  assert.ok(drained.system.attributes.deathAt >= whole.system.attributes.deathAt, "a drained Constitution moves the death threshold");
  // Spellburn's cost: 1, 2, 4, 8; the enhanced effect double.
  assert.deepEqual([0, 1, 2, 3].map(n => D.spellburnCost(n)), [1, 2, 4, 8]);
  assert.deepEqual([0, 1, 2].map(n => D.spellburnCost(n, true)), [2, 4, 8]);
  const sb = read("class-features", "items_Spellburn_").system.activities, oc = read("class-features", "items_Overchannel_").system.activities;
  assert.deepEqual([sb[0].kind, sb[0].formula], ["burn", "double"]);
  assert.deepEqual([oc[0].kind, oc[0].formula, oc[1].kind], ["burn", "level", "note"]);
}
console.log("OK 0.10.115 batch");

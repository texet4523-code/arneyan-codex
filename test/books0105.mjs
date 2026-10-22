// Books v0.10.5 (22 Oct 2026): monsters have attribute scores, saves from them, skills, and contests by modifier.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
const { ARNEYAN } = await import("../arneyan/module/config.mjs");
const dir = new URL("../packs-src/monsters/", import.meta.url).pathname;
const mons = fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(dir + f))).filter(d => d.type === "npc");
const by = Object.fromEntries(mons.map(d => [d.name, d]));
assert.equal(mons.length, 466);

// Every monster has six scores; saves = modifier + half Level (minimum 1), ¼ and ½ as 1, Mythic as 30.
const K = ["str", "dex", "con", "int", "wis", "cha"];
for (const d of mons) {
  const ab = d.system.abilities;
  const t = d.system.details.levelText;
  const L = t === "Mythic" ? 30 : (t === "¼" || t === "½") ? 1 : d.system.level;
  const half = Math.max(1, Math.floor(L / 2));
  for (const [s, a] of [["fort", "con"], ["ref", "dex"], ["will", "wis"]])
    assert.equal(d.system.saves[s], ARNEYAN.abilityMod(ab[a].value) + half, `${d.name} ${s}`);
  assert.ok(d.flags?.arneyan?.savesBefore, `${d.name} remembers the old saves`);
}
// Only creatures the book gives straight 10s (the Commoner and the like) are all 10.
const tens = mons.filter(d => K.every(k => d.system.abilities[k].value === 10)).map(d => d.name);
assert.ok(tens.length <= 5, `all 10s: ${tens}`);
// Spot checks against the book chat's Monster_Attributes_v0.10.6.json.
const scores = n => K.map(k => by[n].system.abilities[k].value);
assert.deepEqual(scores("Owlbear"), [20, 12, 17, 3, 12, 7]);
assert.deepEqual(by["Pit Fiend"].system.saves, { fort: 14, ref: 9, will: 11 });
assert.deepEqual(by["Tarrasque"].system.saves, { fort: 24, ref: 15, will: 15 });
assert.deepEqual(by["Goblin"].system.saves, { fort: 1, ref: 2, will: 0 });
assert.deepEqual(by["Giant Shark"].system.saves, { fort: 9, ref: 4, will: 4 });

// Skills: trained or master; Skills (NWP) come from the compendium, Perception and the like are attribute checks.
const skills = n => Object.fromEntries(by[n].items.filter(i => i.type === "skill").map(i => [i.name, [i.system.ability, i.system.tier]]));
assert.deepEqual(skills("Goblin"), { Stealth: ["dex", "master"] });
assert.deepEqual(skills("Wolf"), { Perception: ["wis", "trained"], Stealth: ["dex", "trained"] });
assert.deepEqual(skills("Lich"), { Perception: ["wis", "trained"], Insight: ["wis", "trained"], Spellcraft: ["int", "trained"], "Ancient History": ["int", "trained"] });
assert.match(by["Lich"].items.find(i => i.name === "Spellcraft")._stats.compendiumSource, /^Compendium\.arneyan\.skills\.Item\./);
assert.equal(mons.filter(d => d.items.some(i => i.type === "skill")).length, 265);
assert.equal(mons.reduce((n, d) => n + d.items.filter(i => i.type === "skill" && i.system.tier === "master").length, 0), 109);

// Animated objects are in Monsters & Treasure now, with the ids the spell's own copies had.
assert.equal(by["Animated Object"]._id, "AnimObjMedium001");
assert.equal(by["Animated Object, Large"]._id, "AnimObjLarge0001");
const slam = by["Animated Object, Large"].items.find(i => /hits automatically/.test(i.name));
assert.equal(slam.system.damage, "2d8"); assert.equal(slam.system.damageType, "bludgeoning");
// "Small or Medium construct": a construct (Scare and the like see it), Medium as before.
assert.equal(by["Animated Object"].system.details.type, "construct");
assert.equal(by["Animated Object"].system.details.size, "medium");
assert.equal(by["Animated Object, Large"].system.details.size, "large");
assert.ok(mons.every(d => !/^(or|tiny|small|medium|large|huge|gargantuan)\b/i.test(d.system.details.type)), "no size words left in a type");
// The Giant Shark's bite (handoff 1b) is the book's new one.
assert.ok(by["Giant Shark"].items.some(i => i.type === "weapon" && i.system.damage === "2d8+4"));

// Codex: contests use the stat block's modifiers.
const rules = new URL("../packs-src/rules/", import.meta.url).pathname;
const text = fs.readdirSync(rules).map(f => fs.readFileSync(rules + f, "utf8")).join("");
assert.ok(text.includes("A monster uses the attribute modifiers in its stat block, as a character does."));
assert.ok(!/half its HD/.test(text));
// Handbook v0.10.6: 11 a Hard Encounter, 12 a Deadly one (the Encounter Check table is read from the Codex page).
const tdir = new URL("../packs-src/tables/", import.meta.url).pathname;
const enc = JSON.parse(fs.readFileSync(tdir + fs.readdirSync(tdir).find(f => f.startsWith("tables_Encounter_Check_"))));
assert.deepEqual(enc.results.filter(r => r.range[0] >= 11).map(r => r.name ?? r.description), ["A Hard Encounter occurs.", "A Deadly Encounter occurs."]);
assert.ok(!/Standard Encounter|Dangerous Encounter/.test(text + JSON.stringify(enc)));

// Animal Friendship: Intelligence 1-2.
const T = await import("../arneyan/module/targeting.mjs");
const beast = (int) => ({ type: "npc", system: { level: 1, details: { type: "beast" }, abilities: { int: { value: int, total: int } } } });
assert.equal(T.spellFits("Animal Friendship", beast(2)).ok, true);
assert.equal(T.spellFits("Animal Friendship", beast(7)).ok, false);

// A world's older copy (all 10s, the old book's saves) takes the new scores once; edited saves stay.
const M = await import("../arneyan/module/migrate.mjs");
const src = { system: by["Owlbear"].system, flags: by["Owlbear"].flags, items: by["Owlbear"].items };
const before = src.flags.arneyan.savesBefore;
const old = { flags: {}, system: { abilities: Object.fromEntries(K.map(k => [k, { value: 10 }])), saves: { ...before } }, items: [] };
const r = M.scoresFrom(old, src);
assert.equal(r.update["system.abilities.str.value"], 20);
assert.equal(r.update["system.saves.fort"], 5);
assert.deepEqual(r.skills.map(s => s.name), ["Perception"]);
assert.ok(!("_id" in r.skills[0]));
const edited = { ...old, system: { ...old.system, saves: { ...before, fort: before.fort + 3 } } };
const re = M.scoresFrom(edited, src).update;
assert.ok(!("system.saves.fort" in re), "a save the GM changed is kept");
assert.equal(re["system.saves.ref"], src.system.saves.ref, "the others still take the new ones");
const custom = { ...old, system: { ...old.system, abilities: { ...old.system.abilities, str: { value: 22 } } } };
const cu = M.scoresFrom(custom, src).update;
assert.ok(!("system.abilities.str.value" in cu) && !("system.saves.fort" in cu), "scores the GM set are kept, and its saves with them");
assert.equal(M.scoresFrom({ ...old, flags: { arneyan: { scoresFilled: true } } }, src), null, "only once");
console.log("OK books 0.10.5");

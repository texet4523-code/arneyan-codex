// Books HB v0.10.53 and Monsters & Treasure v0.10.50 (B-F41, B-F42, B-F43; K61 to K65, K71) in the system (0.10.90).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
for (const k of ["Actor", "Item", "Combatant", "ChatMessage"]) globalThis[k] ??= class {};

const S = await import("../arneyan/module/solo.mjs");
const D = await import("../arneyan/module/documents.mjs");
const DT = await import("../arneyan/module/downtime.mjs");
const E = await import("../arneyan/module/encounter.mjs");
const read = (dir, prefix) => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith(prefix))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const one = (dir, prefix) => { const r = read(dir, prefix); assert.equal(r.length, 1, prefix); return r[0]; };

/* Villain actions (K65, K71): three per listed solo, once a fight, numbered; Bloodied leaves them alone. */
const troll = one("monsters", "actors_Two-headed_Troll_");
const va = troll.items.filter(i => i.flags?.arneyan?.villainAction);
assert.deepEqual(va.map(i => i.name), ["Villain Action 1 (Opener): Twin Bellow", "Villain Action 2 (Crowd Control): Sweep", "Villain Action 3 (Ultimate): Feeding Frenzy"]);
assert.deepEqual(va.map(i => i.flags.arneyan.villainAction), [1, 2, 3]);
for (const i of va) assert.deepEqual(i.system.uses, { value: 1, max: 1, per: "encounter" }, i.name);
assert.ok(!/^\*/.test(va[0].system.description.replace(/<[^>]+>/g, "")), "the title leaves the text");
assert.equal(va[0].system.save, "will"); assert.equal(va[0].system.dc, 20);
assert.equal(va[1].system.save, "ref"); assert.equal(va[1].system.damage, "4d8+5");
const withVa = read("monsters", "actors_").filter(m => m.items.some(i => i.flags?.arneyan?.villainAction));
assert.equal(withVa.length, 13, withVa.map(m => m.name).join(", "));
for (const m of withVa) assert.deepEqual(m.items.filter(i => i.flags?.arneyan?.villainAction).map(i => i.flags.arneyan.villainAction), [1, 2, 3], m.name);
for (const m of withVa) assert.ok(m.system.details.isSolo, `${m.name} is a solo`);

assert.equal(S.villainBlock({ statuses: [] }), null);
assert.deepEqual(S.villainBlock({ statuses: ["stunned", "prone"] }), { reason: "cant", cant: ["stunned"] });
assert.equal(S.villainBlock({ statuses: ["frightened", "slowed"] }), null, "it can still act");
assert.deepEqual(S.villainBlock({ last: { combat: "c1", round: 2 }, combatId: "c1", round: 2 }), { reason: "round" });
assert.equal(S.villainBlock({ last: { combat: "c1", round: 2 }, combatId: "c1", round: 3 }), null, "a new round");
assert.equal(S.villainBlock({ last: { combat: "c0", round: 2 }, combatId: "c1", round: 2 }), null, "another fight");
assert.equal(S.villainNo({ flags: { arneyan: { villainAction: 2 } } }), 2);
assert.equal(S.villainNo({ flags: {} }), 0);

/* K61 and m81: the Ultroloth's fireball, the Death Knight's innate banishment. */
const ul = one("monsters", "actors_Ultroloth_");
assert.ok(ul.items.some(i => i.name === "Fireball (1/day)") && !ul.items.some(i => /Fire Storm/i.test(i.name)));
const dk = one("monsters", "actors_Death_Knight_");
assert.ok(dk.items.some(i => i.name === "Banishment (1/day)"));
/* R-B40: Mythic solos at 600 HP. */
for (const n of ["Tiamat", "Bahamut", "Tarrasque"]) {
  const m = one("monsters", `actors_${n}_`);
  assert.ok(m.system.details.isSolo && m.system.attributes.hp.max === 600, n);
}
/* "1 with 2d6 warriors" reads its leader's count. */
assert.equal(E.parseNumberAppearing("1 with 2d6 warriors").wild, "1");
assert.equal(E.parseNumberAppearing("1d4 with slaves").wild, "1d4");

/* Tables (K62, K63): Corruption d100s, Madness, Chases, Carousing; the Corruption roll draws its table. */
const tables = Object.fromEntries(read("tables", "tables_").map(t => [t.name, t]));
for (const [n, f, k] of [["Minor Corruption", "1d100", 100], ["Major Corruption", "1d100", 100], ["Madness (Short-term)", "1d10", 10], ["Madness (Long-term)", "1d10", 10],
  ["Madness (Indefinite)", "1d10", 10], ["Chase Complications (Town)", "1d20", 11], ["Chase Complications (Wild)", "1d20", 11], ["Carousing", "1d20", 20]]) {
  assert.ok(tables[n], n); assert.equal(tables[n].formula, f, n); assert.equal(tables[n].results.length, k, n);
}
assert.deepEqual(tables.Carousing.results.at(-1).range, [20, 25], "20+ covers a +5");
assert.equal(D.tableFor("1=Major Corruption; 2-20=Minor Corruption", 1), "Major Corruption");
assert.equal(D.tableFor("1=Major Corruption; 2-20=Minor Corruption", 14), "Minor Corruption");
assert.equal(D.tableFor("", 5), "");
const corr = one("class-features", "items_Corruption_");
assert.equal(corr.system.activities[0].tables, "1=Major Corruption; 2-20=Minor Corruption");

/* Carouse (downtime): gold by Tier, Charisma DC 12, a week. */
assert.deepEqual([1, 4, 5, 10, 11, 16, 17, 20].map(DT.carouseGold), [100, 100, 500, 500, 2500, 2500, 10000, 10000]);
const plan = DT.planDowntime("carouse", {}, { system: { level: 9 }, items: [] });
assert.equal(plan.costCp, 50000); assert.equal(plan.days, 7); assert.deepEqual(plan.check, { type: "carouse", ability: "cha", dc: 12 });
assert.ok(DT.ACTIVITIES.carouse);

/* Review of the sync. */
// Tiamat's bite keeps its note; no weapon with dice in its line rolls nothing.
const tia = one("monsters", "actors_Tiamat_").items.find(i => i.type === "weapon" && /^Bite/.test(i.name));
assert.equal(tia.system.damage, "3d10+9"); assert.match(tia.system.traits, /any three heads/);
const barg = one("monsters", "actors_Barghest_").items.find(i => i.name === "Shortsword");
assert.ok(barg && /goblin form only/.test(barg.system.traits), "the Barghest's form leads its weapon");
// The Corruption tables' spells are in italics, not asterisks.
assert.ok(!tables["Major Corruption"].results.some(r => /\*/.test(r.description + r.name)));
// Table draws go through the GM for a player (the tables pack is hidden from players), naming nothing to them.
const src = p => fs.readFileSync(new URL(`../arneyan/module/${p}`, import.meta.url), "utf8");
assert.match(src("chat.mjs"), /action: "drawTable"/);
assert.match(src("chat.mjs"), /SHARED_TABLES = \["Major Corruption", "Minor Corruption", "Carousing"\]/);
assert.ok(!/No "\$\{name\}" roll table found/.test(src("documents.mjs")), "no table name in a player's warning");
assert.match(src("downtime.mjs"), /drawTableFor\("Carousing"/);
// A skipped second turn ticks nothing and gets no reminder; the skip re-checks the turn before moving on.
assert.match(src("chat.mjs"), /!skipped\(prev\)\) await tickCounters/);
assert.match(src("solo.mjs"), /combat\.combatant\?\.id === twin\.id && combat\.round === round/);
assert.match(src("solo.mjs"), /if \(current && activeGM\(\)\) await passSecondTurn/);
assert.ok(S.skippedFor({ getFlag: () => ({ combat: "c1", round: 3 }) }, { id: "c1" }, 3));
assert.ok(!S.skippedFor({ getFlag: () => ({ combat: "c1", round: 3 }) }, { id: "c1" }, 4));

console.log("OK books v0.10.53 / M&T v0.10.50");

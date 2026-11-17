// Monsters & Treasure v0.10.83 and v0.10.84 (R-B139, R-B140, K207, K208; board B-F78, B-F79) in the system (0.10.118):
// 60 new dragons (15 kinds, four ages; adults and ancients Solo on the dragon villain actions), three giants, the
// Cyclops's Flash of Foresight, and a retainer's half point on the encounter budget.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";

const dir = new URL("../packs-src/monsters/", import.meta.url);
const monsters = fs.readdirSync(dir).filter(f => f.startsWith("actors_")).map(f => JSON.parse(fs.readFileSync(new URL(f, dir), "utf8")));
const m = n => { const x = monsters.find(d => d.name === n); assert.ok(x, n); return x; };
// An ability's data, its description as plain words (no tags, enrichers down to their labels).
const plain = h => String(h ?? "").replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const item = (x, n) => { const i = x.items.find(y => y.name === n); assert.ok(i, `${x.name}: ${n}`); return { ...i.system, description: plain(i.system.description), raw: i.system.description }; };
const va = x => x.items.filter(i => i.flags?.arneyan?.villainAction);

/* The fifteen kinds: each age there, Levels as the book, breath of its own type, adults and ancients Solo. */
const KINDS = { "Mirage Dragon": ["psychic", [3, 8, 13, 20]], "Moonstone Dragon": ["psychic", [3, 8, 13, 20]], "Forest Dragon": ["poison", [3, 8, 13, 20]],
  "Brine Dragon": ["acid", [4, 9, 14, 21]], "Sea Dragon": ["cold", [4, 9, 14, 21]], "Omen Dragon": ["radiant", [4, 9, 14, 21]],
  "Linnorm": ["poison", [6, 10, 15, 22]], "Deep Dragon": ["necrotic", [6, 10, 15, 22]], "Sky Dragon": ["lightning", [6, 10, 15, 22]],
  "Magma Dragon": ["fire", [7, 11, 16, 23]], "Underworld Dragon": ["necrotic", [7, 11, 16, 23]], "Ghost Dragon": ["cold", [7, 11, 16, 23]],
  "Diabolic Dragon": ["fire", [8, 12, 17, 24]], "Empyreal Dragon": ["radiant", [8, 12, 17, 24]], "Sovereign Dragon": ["force", [8, 12, 17, 24]] };
const AGES = ["Wyrmling", "Young", "Adult", "Ancient"];
for (const [kind, [element, levels]] of Object.entries(KINDS)) {
  AGES.forEach((age, k) => {
    const d = m(`${kind}, ${age}`);
    assert.equal(d.system.level, levels[k], d.name);
    const bw = item(d, "Breath Weapon");
    assert.equal(bw.damageType, element, d.name);
    assert.ok(bw.dc > 0 && bw.save && /^\d+d6$/.test(bw.damage), `${d.name}: the breath has its save, DC and dice`);
    assert.ok(d.system.details.immunities.split(", ").includes(element), `${d.name}: immune to its own element`);
    assert.equal(d.system.details.isSolo, k >= 2, d.name);
    if (k >= 2) {
      assert.equal(d.system.details.soloType, "Dragon", d.name);
      assert.deepEqual(va(d).map(i => i.flags.arneyan.villainAction), [1, 2, 3], d.name);
      assert.deepEqual([...new Set(va(d).map(i => i.system.damageType).filter(Boolean))], [element], `${d.name}: the villain actions use its element`);
      assert.match(plain(va(d)[0].system.description), /It then moves up to half its speed/, d.name);
    } else assert.equal(va(d).length, 0, d.name);
    assert.ok(d.items.some(i => i.system.uses?.per === "day" && i.system.uses.max === 1), `${d.name}: a daily trait with its counter`);
  });
}
assert.equal(monsters.filter(d => /^(Mirage|Moonstone|Forest|Brine|Sea|Omen|Deep|Sky|Magma|Underworld|Ghost|Diabolic|Empyreal|Sovereign) Dragon, |^Linnorm, /.test(d.name)).length, 60);

/* K208 and the MD fixes (v0.10.84). */
for (const [n, shape] of [["Sky Dragon, Adult", /60ft cone/], ["Brine Dragon, Adult", /60ft cone/], ["Mirage Dragon, Adult", /60ft cone/], ["Sovereign Dragon, Adult", /line/]])
  assert.match(item(m(n), "Breath Weapon").description, shape, `${n}: breath shape`);
for (const age of AGES) assert.match(item(m(`Empyreal Dragon, ${age}`), "Healing Breath").description, /Once per day/, age);
assert.match(item(m("Sea Dragon, Adult"), "Tide Call").description, /carried 20ft/);
assert.match(item(m("Sovereign Dragon, Adult"), "Imperial Command").description, /can't attack the dragon until the end of its next turn/);
assert.ok(!m("Diabolic Dragon, Adult").items.some(i => i.name === "Undead Nature"));
const ghost = m("Ghost Dragon, Adult");
assert.match(item(ghost, "Undead Nature").description, /Immune to poison, sleep, charm and fear/);
assert.equal(item(ghost, "Incorporeal").damage, "1d10");
assert.ok(ghost.system.details.immunities.includes("condition:frightened") && ghost.system.details.type.startsWith("undead"));
assert.ok(m("Ghost Dragon, Ancient").items.some(i => i.name === "Wing Buffet"));
assert.match(item(ghost, "Hoard's Claim").description, /each creature within 30ft/);
assert.match(item(m("Mirage Dragon, Young"), "Mirage Veil").description, /Invisible/);
for (const n of ["Deep Dragon, Adult", "Gold Dragon, Adult"]) assert.match(item(m(n), "Shapechange").description, /use its Breath Weapon/, n);
assert.ok(!m("Deep Dragon, Adult").items.some(i => i.name === "Change Shape"));
for (const [n, sk] of [["Mirage Dragon, Young", "Deception"], ["Omen Dragon, Young", "Insight"], ["Linnorm, Young", "Survival"]]) assert.ok(m(n).items.some(i => i.name === sk), `${n}: ${sk}`);
// Imperial Flight is said once in the chapter's intro: each imperial dragon's description carries it, no other dragon's.
const imperial = monsters.filter(d => /\(imperial\)/.test(d.system.details.type));
assert.equal(imperial.length, 20);
for (const d of imperial) assert.match(d.system.details.description, /<strong>Imperial dragon\.<\/strong> The imperial dragons are wingless and fly by their own nature: nothing that ends magic grounds them\./, d.name);
assert.ok(!monsters.some(d => !/\(imperial\)/.test(d.system.details.type) && /Imperial dragon\./.test(d.system.details.description)));

/* The giants and the Cyclops. */
const rune = m("Rune Giant"), ash = m("Ash Giant"), marsh = m("Marsh Giant");
assert.deepEqual([rune, ash, marsh].map(d => d.system.level), [16, 8, 11]);
assert.match(item(rune, "Rune of Command").description, /goliath, firbolg or minotaur/);
assert.match(item(rune, "Rune of Command").raw, /@Condition\[dominated\]/);
assert.equal(item(rune, "Rune of Command").uses.per, "day");
assert.match(item(ash, "Ash Cloud").description, /first time each round/);
assert.equal(ash.system.attributes.attack, 12);
assert.match(item(marsh, "Drag Under").description, /Huge or smaller/);
const fore = item(m("Cyclops"), "Flash of Foresight");
assert.equal(fore.uses.max, 1);
assert.match(fore.description, /it foresees the blow/);
// Old ids kept: nothing that was in the Bestiary moved.
assert.equal(m("Red Dragon, Adult")._id, "8jhPGWm4Al0x3tmv");
assert.equal(m("Cyclops")._id, "Q45fAxS8bS2yHPk6");
console.log("OK M&T v0.10.84 monsters");

/* Retainers (M&T v0.10.83, Building Encounters; Keeps & Kingdoms, Retainers): half a point each on the budget. */
const E = await import("../arneyan/module/encounter.mjs");
const party = [5, 5, 5, 5], ogres = [{ name: "Ogre", level: 5, count: 4 }];
const none = E.encounterBudget(party, ogres), two = E.encounterBudget(party, ogres, { retainers: 2 });
assert.equal(none.budget, 4); assert.equal(none.retainers, 0); assert.equal(none.label, "Hard");
assert.equal(two.budget, 5); assert.equal(two.retainers, 2); assert.equal(two.total, 4); assert.equal(two.label, "Between easy and hard");
assert.equal(two.partySize, 4, "retainers are not characters");
assert.equal(E.encounterBudget(party, [{ name: "Ogre", level: 5, count: 5 }], { retainers: 2 }).total, 6, "the crowd rule still counts four characters");
assert.equal(E.encounterBudget(party, [{ name: "Dragon", level: 5, solo: true, count: 1 }], { retainers: 2 }).total, 4, "a solo costs the characters' budget");
assert.equal(E.encounterBudget(party, ogres, { retainers: 1 }).budget, 4.5);
assert.equal(E.encounterBudget(party, ogres, { retainers: -3 }).budget, 4);
assert.equal(E.encounterBudget(party, ogres, { retainers: "x" }).budget, 4);
assert.equal(E.encounterBudget([], ogres, { retainers: 2 }).label, "No party", "retainers alone are no party");
const mixed = [{ name: "Ogre", level: 5, count: 1 }];
assert.equal(E.fitCounts(party, mixed, 1)[0].count, 4);
assert.equal(E.fitCounts(party, mixed, 1, 50, { retainers: 2 })[0].count, 4, "five would be a crowd: 6 points against 5");
assert.equal(E.fitCounts(party, [{ name: "Orc", level: 3, count: 1 }], 1, 50, { retainers: 2 })[0].count > E.fitCounts(party, [{ name: "Orc", level: 3, count: 1 }], 1)[0].count, true, "more fit with retainers");
const es = fs.readFileSync(new URL("../arneyan/module/encounter.mjs", import.meta.url), "utf8"), et = fs.readFileSync(new URL("../arneyan/templates/apps/encounter.hbs", import.meta.url), "utf8");
assert.ok(/retainerMore: ArneyanEncounterBuilder\.#retainerMore/.test(es) && /data-action="retainerMore"/.test(et) && /data-action="retainerLess"/.test(et));
assert.ok(/encounterBudget\(party\.map\(a => a\.system\.level \?\? 1\), foes, \{ retainers: partyRetainers\(\) \}\)/.test(es));
console.log("OK retainers on the budget");

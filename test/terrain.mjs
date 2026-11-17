// Ready-made encounters by terrain and Level (A3; F-R7, F-R10; Kieran's calls K210, lore R96).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
for (const k of ["Actor", "Item", "Combatant", "ChatMessage"]) globalThis[k] ??= class {};
const T = await import("../arneyan/module/terrain.mjs");
const { encounterBudget } = await import("../arneyan/module/encounter.mjs");
const data = await T.terrainData();
const src = f => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

/* The data: twelve terrains, four bands, eight entries each; every creature is in the monsters pack. */
assert.deepEqual(data.terrains.map(t => t.name), T.TERRAINS, "the picker's terrains are the data's");
assert.deepEqual(data.bands, ["1-4", "5-8", "9-12", "13+"]);
const packIds = new Set(fs.readdirSync(new URL("../packs-src/monsters", import.meta.url)).map(f => f.match(/_([A-Za-z0-9]{16})\.json$/)?.[1]).filter(Boolean));
let foes = 0;
for (const t of data.terrains) {
  assert.equal(t.twists.length, 6, `${t.name}: a d6 of twists`);
  for (const b of data.bands) {
    const rows = t.bands[b];
    assert.equal(rows.length, 8, `${t.name} ${b}: a d8`);
    assert.ok(typeof rows[0].nonfight === "string" && rows[0].nonfight, `${t.name} ${b}: entry 1 isn't a fight`);
    for (const r of rows.slice(1)) for (const o of r.options) for (const f of o) {
      foes++;
      assert.ok(packIds.has(f.uuid.split(".").pop()), `${f.name}: in the monsters pack`);
      assert.ok(!(f.solo && f.minion), `${f.name}: not both a solo and a minion`);
      if (f.solo) assert.ok(f.marked, `${f.name}: run as a solo only if marked Solo`);
    }
  }
}
assert.ok(foes > 500, `${foes} creatures in the tables`);
assert.ok(!src("arneyan/module/data/terrains.mjs").includes("Githyanki"), "K210: no githyanki (none seen on Arneyan since the Forgotten Age)");
const row = (ter, band, n) => data.terrains.find(t => t.name === ter).bands[band][n - 1];
assert.equal(row("Desert", "9-12", 6).label, "Behir", "R96: the desert's yuan-ti abomination swapped for a behir");
assert.equal(row("Plains", "13+", 6).label, "A rune giant and its hill giants");
assert.equal(row("Roads and farmland", "13+", 4).label, "A smiling one and an ettin");

/* Bands and dice. */
assert.equal(T.partyLevelOf([3, 4, 4, 5]), 4);
assert.equal(T.partyLevelOf([]), 1);
assert.deepEqual([1, 4, 5, 8, 9, 12, 13, 24].map(T.bandOf), ["1-4", "1-4", "5-8", "5-8", "9-12", "9-12", "13+", "13+"]);
assert.equal(T.dieFor("1-4", false), "1d6");
assert.equal(T.dieFor("5-8", true), "1d6+2");
assert.equal(T.dieFor("13+", false), "1d8");
assert.equal(T.dieFor("13+", true), "1d8");

/* What suits a party. */
const f = (name, level, extra = {}) => ({ name, level, dice: "1", ...extra });
assert.ok(T.suits([f("Troll", 10)], 9));
assert.ok(!T.suits([f("Troll", 10)], 15), "the strongest more than four below the party: reroll");
assert.ok(!T.suits([f("Cloud Giant", 16)], 11), "more than four above: reroll");
assert.ok(T.suits([f("Hill Giant", 9), f("Ogre", 4, { minion: true })], 12), "a minion crew doesn't count for 'too far below'");
assert.ok(T.suits([f("Roc", 11, { solo: true })], 13) && !T.suits([f("Roc", 11, { solo: true })], 14), "a solo within two Levels only");
const forestDragon = row("Forest", "13+", 7);
assert.equal(T.pickOption(forestDragon, 13, false)[0].name, "Forest Dragon, Adult");
assert.equal(T.pickOption(forestDragon, 19, true)[0].name, "Forest Dragon, Ancient", "a Deadly check takes the solo above the party");
assert.equal(T.pickOption(forestDragon, 17, false), null, "neither age suits Level 17: reroll");

/* Rolling: entry 1 is Hard only; what doesn't suit is rerolled. */
const seq = list => { let i = 0; return async () => list[i++ % list.length]; };
let r = await T.rollTerrain("Forest", [3, 3, 3, 3], { roll: seq([1]) });
assert.ok(r.nonfight && r.n === 1 && r.band === "1-4");
r = await T.rollTerrain("Forest", [3, 3, 3, 3], { deadly: true, roll: seq([1, 3]) });
assert.equal(r.n, 3, "a Deadly check never takes entry 1");
assert.deepEqual(r.rerolled, [1]);
r = await T.rollTerrain("Forest", [17, 17, 17, 17], { roll: seq([7, 2]) });
assert.equal(r.n, 2, "Level 17: the forest dragon doesn't suit, so rerolled");
r = await T.rollTerrain("Forest", [24, 24, 24, 24], { roll: seq([2, 3, 4, 5, 6]), tries: 10 });
assert.ok(r.none, "nothing suits: the card says so");
assert.equal(await T.rollTerrain("Nowhere", [1]), null);

/* Fit to the check (K210): leaders as written, minion crews up to two a character, the rest to the target. */
const goblins = row("Forest", "1-4", 3).options[0];
const party = [3, 3, 3, 3];
const hard = T.fitOption(goblins, party, false);
const deadly = T.fitOption(goblins, party, true);
const boss = x => x.find(y => y.name === "Goblin Boss").count;
assert.equal(boss(hard), 1, "the boss stays one");
assert.equal(boss(deadly), 1);
assert.ok(hard.find(y => y.name === "Goblin").count >= 1);
assert.ok(encounterBudget(party, hard).total <= encounterBudget(party, []).budget, "Hard: within the budget");
assert.ok(encounterBudget(party, deadly).total <= 2 * encounterBudget(party, []).budget, "Deadly: within twice it");
const wolves = row("Forest", "1-4", 2).options[0];
const w = T.fitOption(wolves, party, true);
assert.ok(w.find(y => y.name === "Wolf").minion && w.find(y => y.name === "Wolf").count <= 8, "minions: two per character at most");
const trolls = row("Forest", "9-12", 2).options[0];
assert.ok(T.fitOption(trolls, [9, 9, 9, 9], true).find(y => y.name === "Troll").count > T.fitOption(trolls, [9, 9, 9, 9], false).find(y => y.name === "Troll").count, "one kind: more for Deadly than Hard");
const solo = T.fitOption(T.pickOption(forestDragon, 13), party, true);
assert.equal(solo[0].count, 1);
assert.ok(solo[0].solo && solo[0].marked && solo[0].uuid.startsWith("Compendium.arneyan.monsters.Actor."), "a solo placed as a solo, from the pack");
assert.deepEqual(Object.keys(hard[0]).sort(), ["count", "img", "level", "levelText", "marked", "minion", "na", "name", "solo", "uuid"], "Encounter Builder rows");

/* The book's numbers instead: dice rolled, leaders as written, a range read. */
const book = await T.bookNumbers([{ name: "A", dice: "2d6" }, { name: "B", dice: "1" }, { name: "C", dice: "2-5" }, { name: "D", dice: "4" }], { roll: async formula => (formula === "2d6" ? 7 : formula === "1d4 + 1" ? 3 : 99) });
assert.deepEqual(book.map(x => x.count), [7, 1, 3, 4]);
assert.equal((await T.bookNumbers([{ name: "E", dice: "1d100" }], { roll: async () => 80 }))[0].count, 50, "at most 50 of one");

/* Way through and twists. */
assert.equal(T.kindOf("humanoid (goblinoid)"), "Humanoids");
assert.equal(T.kindOf("swarm of Tiny beasts"), "Beasts");
assert.equal(T.kindOf("plant"), "Plants and oozes");
assert.equal(T.kindOf("aberration"), "Fiends, fey, aberrations, elementals and celestials");
assert.equal(T.mainFoe(goblins).name, "Goblin Boss");
assert.equal((await T.wayThrough(goblins)).kind, "Humanoids");
assert.equal((await T.wayThrough(T.pickOption(forestDragon, 13))).kind, "Dragons");
const tw = await T.rollTwist("Swamp", { roll: async () => 2 });
assert.equal(tw.name, "Swamp gas");

/* The card. */
const state = { terrain: "Forest", band: "1-4", pl: 3, n: 3, deadly: false, label: "Goblin raiders", option: goblins, foes: hard, book: false, twist: tw, way: await T.wayThrough(goblins), rerolled: [] };
const html = T.cardHtml(state, encounterBudget(party, hard));
for (const k of ["place", "builder", "book", "scene"]) assert.ok(html.includes(`data-arn-terrain="${k}"`), `card button ${k}`);
assert.ok(html.includes("fitted to Hard") && html.includes("Goblin Boss") && html.includes("Way through (Humanoids)"));
assert.ok(T.cardHtml({ ...state, book: true }, null).includes('data-arn-terrain="fit"'), "after rolling the book's numbers, the button fits again");
assert.ok(T.cardHtml({ terrain: "Forest", band: "13+", pl: 24, none: true }).includes("Nothing in the Forest table suits"));
assert.ok(T.cardHtml({ terrain: "<b>", band: "1-4", n: 1, nonfight: "x" }).includes("&lt;b&gt;"), "escaped");

/* Wiring. */
const travel = src("arneyan/module/travel.mjs");
assert.ok(/terrain: ""/.test(travel) && /if \(t\.terrain\)/.test(travel) && /Roll on the \$\{esc\(terrain\)\} encounters \(GM\)/.test(travel), "the Travel tab's check rolls the terrain");
assert.ok(src("arneyan/templates/actor/travel-tab.hbs").includes('name="flags.arneyan.travel.terrain"'));
const enc = src("arneyan/module/encounter.mjs");
assert.ok(/static async load\(foes\)/.test(enc) && /static async placeFoes\(foes\)/.test(enc) && /"system\.attributes\.minion": true/.test(enc), "Builder: load, place, minions placed as minions");
const hbs = src("arneyan/templates/apps/encounter.hbs");
assert.ok(hbs.includes('data-action="loadReady"') && hbs.includes('data-action="minionToggle"'));
assert.ok(src("arneyan/module/maps.mjs").includes("terrain: ArneyanMapBrowser.#onTerrain") && src("arneyan/templates/apps/maps.hbs").includes('data-action="terrain"'));
assert.ok(/registerTerrain\(\)/.test(src("arneyan/module/arneyan.mjs")));
/* The templates render: the Builder's rows with the minion chip, and the Ready-made list; the Travel tab's picker. */
{
  const { hbs } = await import("./harness.mjs");
  const root = new URL("../arneyan", import.meta.url).pathname;
  const b = encounterBudget(party, hard);
  const ready = { terrains: T.TERRAINS.map(t => ({ id: t, label: t, selected: t === "Swamp" })), bands: data.bands.map(x => ({ id: x, label: `Levels ${x}`, selected: x === "1-4" })), partyBand: "1-4",
    rows: row("Swamp", "1-4", 1) && data.terrains.find(t => t.name === "Swamp").bands["1-4"].slice(1).map((r, i) => ({ n: i + 2, label: r.label, text: r.options.map(T.optionText).join(" or "), deadly: i + 2 >= 7, suits: i !== 3 })) };
  const out = hbs(root)("templates/apps/encounter.hbs", { b, party: [], foes: hard.map((x, i) => ({ ...x, i, levelLabel: x.levelText || x.level, cost: "1" })), pct: 50, naMode: "off", naModes: [], saved: [], ready });
  assert.ok(out.includes('data-action="minionToggle" data-i="0"') && out.includes(">Minions<") === hard.some(x => x.minion), "minion chip on each ordinary row");
  assert.equal((out.match(/data-action="loadReady"/g) ?? []).length, 14, "seven entries, each with its link and its button");
  assert.ok(out.includes('<option value="Swamp" selected>Swamp</option>') && out.includes("Bullywugs") && out.includes("arn-dim"));
  const tv = (await import("../arneyan/module/travel.mjs")).travelContext({ flags: { arneyan: { travel: { terrain: "Coast" } } } }, []);
  const tab = hbs(root)("templates/actor/travel-tab.hbs", { ...tv, isGM: true });
  assert.ok(tab.includes('name="flags.arneyan.travel.terrain"') && tab.includes('<option value="Coast" selected>Coast</option>') && tab.includes('<option value="" >None (the encounter table)</option>'));
}
console.log("terrain encounters ok");

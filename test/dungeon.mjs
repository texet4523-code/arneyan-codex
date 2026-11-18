// Dungeon Phases on the Travel tab (Codex v0.10.85; Kieran's K211 and K212).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
const D = await import("../arneyan/module/dungeon.mjs");
const DAY = 86400;

/* Pure rules. */
assert.equal(D.dungeonKey("The Sunless Citadel!"), "the-sunless-citadel");
assert.equal(D.dungeonKey("  "), "");
assert.equal(D.dungeonKey("Château Ælfheim"), "chateau-aelfheim", "accents and ligatures kept as letters");
assert.equal(D.dungeonKey("constructor"), "constructor");
assert.deepEqual([0, 1, 3, 4, 7, "x"].map(D.clampDice), [1, 1, 3, 4, 4, 1]);
assert.deepEqual([1, 2, 3, 4].map(D.odds), [17, 31, 42, 52], "the Codex's odds of an 11 or 12");
assert.equal(D.daysAway(0, DAY * 2.5), 2, "full days only");
assert.equal(D.daysAway(null, DAY * 9), 0, "never left: no days away");
assert.equal(D.calmed({ dice: 4, leftAt: 0 }, DAY * 2), 2, "one die off per full day away");
assert.equal(D.calmed({ dice: 3, leftAt: 0 }, DAY * 10), 1, "never below one");
assert.equal(D.calmed({ dice: 3, leftAt: 0 }, DAY - 1), 3, "less than a day: no change");
assert.equal(D.phaseResult(10).id, "none");
assert.equal(D.phaseResult(11).id, "encounter");
assert.equal(D.phaseResult(12).id, "bad");
assert.match(D.phaseResult(11).text, /Reaction Check/);

/* The tab's context. */
const party = (flags = {}) => ({ flags: { arneyan: flags } });
assert.deepEqual(D.dungeonContext(party()), { inside: false, known: [] });
const p = party({ dungeonAt: "crypt", dungeons: { crypt: { name: "Crypt", dice: 3, steps: 5, threat: 2, leftAt: null }, mine: { name: "Old Mine", dice: 4, leftAt: 0 } } });
const c = D.dungeonContext(p, DAY * 3);
assert.ok(c.inside && c.name === "Crypt" && c.dice === 3 && c.odds === 42);
assert.deepEqual(c.track.map(t => t.on), [true, true, false, false, false], "threat 2 of 5");
assert.deepEqual(c.known.find(k => k.key === "mine"), { key: "mine", name: "Old Mine", dice: 1, away: 3, current: false }, "a known dungeon shows its calmed dice");
assert.equal(D.dungeonContext(party({ dungeonAt: "gone", dungeons: {} })).inside, false, "a stale key: not inside");
assert.equal(D.dungeonContext(party({ dungeonAt: "x", dungeons: { x: { name: "X", dice: 9, steps: 3, threat: 7 } } })).threat, 3, "threat never past its steps");

/* The card. */
const card = D.phaseCardHtml({ name: "Crypt <1>", dice: 3, results: [4, 11, 7], highest: 11, steps: 5, threat: 2 });
assert.ok(card.includes("Crypt &lt;1&gt;") && card.includes("<strong>11</strong>") && card.includes("An encounter"));
assert.ok(card.includes('data-arn-dungeon="reaction"') && card.includes('data-arn-dungeon="stir"') && !card.includes('data-arn-dungeon="threat"'), "an 11: Reaction Check and stir");
const bad = D.phaseCardHtml({ name: "Crypt", dice: 1, results: [12], highest: 12, steps: 5, threat: 2 });
assert.ok(bad.includes('data-arn-dungeon="threat"') && bad.includes("Advance the threat (2/5)") && !bad.includes('"reaction"'), "a 12: the threat, if set");
assert.ok(!D.phaseCardHtml({ name: "C", dice: 1, results: [12], highest: 12 }).includes('"threat"'), "no threat set: no button");
assert.ok(!D.phaseCardHtml({ name: "C", dice: 2, results: [3, 9], highest: 9 }).includes("data-arn-dungeon"), "nothing stirs: no buttons");

/* Changes are the GM's; they go to the party's flags. */
const updates = [];
const live = { id: "P1", name: "The Party", flags: { arneyan: {} }, update: async u => { updates.push(u); for (const [k, v] of Object.entries(u)) { const path = k.split("."); let o = live; for (const s of path.slice(0, -1)) o = o[s] ??= {}; o[path.at(-1)] = v; } } };
globalThis.game.user = { isGM: true };
globalThis.game.time = { worldTime: 0 };
const warned = [];
globalThis.ui = { notifications: { info: () => {}, warn: m => warned.push(m) } };
globalThis.foundry.utils.randomID ??= () => Math.random().toString(36).slice(2, 18);
assert.equal(await D.enterDungeon(live, "!!!"), null);
assert.match(warned.pop(), /letters or digits/);
let rec = await D.enterDungeon(live, "Old Mine");
assert.ok(rec.visit);
assert.deepEqual({ ...rec, visit: undefined }, { name: "Old Mine", dice: 1, steps: 0, threat: 0, leftAt: null, visit: undefined });
assert.equal(live.flags.arneyan.dungeonAt, "old-mine");
assert.equal(await D.stirDungeon(live, 1), 2);
assert.equal(await D.stirDungeon(live, 1), 3);
assert.equal(await D.stirDungeon(live, 5), 4);
assert.equal(await D.stirDungeon(live, 1), 4, "up to 4");
assert.deepEqual(await D.setThreat(live, { steps: 3 }), { steps: 3, threat: 0 });
assert.deepEqual(await D.setThreat(live, { delta: 1 }), { steps: 3, threat: 1 });
game.time.worldTime = 1000;
await D.leaveDungeon(live);
assert.equal(live.flags.arneyan.dungeonAt, null);
assert.equal(live.flags.arneyan.dungeons["old-mine"].leftAt, 1000);
game.time.worldTime = 1000 + DAY * 2 + 5;
rec = await D.enterDungeon(live, "old mine");
assert.equal(rec.dice, 2, "two full days away: two dice fewer");
assert.equal(rec.threat, 1, "the threat stays");
assert.equal(rec.leftAt, null);
assert.equal(rec.name, "Old Mine", "a known dungeon keeps its name");
assert.ok(rec.visit && rec.visit !== updates[0][`flags.arneyan.dungeons.old-mine`].visit, "a new visit marker each time in");
// Steps lowered below the threat: the track stays sensible, and back a step works at once.
await D.setThreat(live, { steps: 5 }); await D.setThreat(live, { delta: 1 }); await D.setThreat(live, { delta: 1 });
assert.deepEqual(await D.setThreat(live, { steps: 1 }), { steps: 1, threat: 1 });
assert.deepEqual(await D.setThreat(live, { delta: -1 }), { steps: 1, threat: 0 });
live.flags.arneyan.dungeons["old-mine"].steps = 99;
assert.equal((await D.setThreat(live, { delta: 1 })).steps, 12, "steps never past 12");
await D.setThreat(live, { steps: 0 });
assert.equal(await D.setThreat(live, { delta: 1 }), null, "no track: nothing to advance");
assert.match(warned.pop(), /no threat track/);
// A dungeon called Constructor is a new one.
assert.equal((await D.enterDungeon(live, "Constructor")).steps, 0);
await D.enterDungeon(live, "Old Mine");
globalThis.game.user = { isGM: false };
assert.equal(await D.stirDungeon(live, 1), null, "players can't change it");
assert.equal(live.flags.arneyan.dungeons["old-mine"].dice, 2);

/* Wiring. */
const src = f => fs.readFileSync(new URL(`../arneyan/${f}`, import.meta.url), "utf8");
const tab = src("templates/actor/travel-tab.hbs");
for (const a of ["dungeonPhase", "dungeonLeave", "dungeonEnter", "dungeonStir", "dungeonThreat"]) assert.ok(tab.includes(`data-action="${a}"`), a);
assert.ok(tab.includes('name="flags.arneyan.dungeons.{{dungeon.key}}.steps"'));
assert.ok(/\.\.\.DUNGEON_ACTIONS/.test(src("module/world.mjs")) && /ctx\.dungeon = dungeonContext/.test(src("module/world.mjs")));
assert.ok(/registerDungeon\(\)/.test(src("module/arneyan.mjs")));
const dm = src("module/dungeon.mjs");
assert.ok(/await message\.setFlag\(SYS, DONE\[act\]\[0\], true\)/.test(dm) && /cur\.visit !== st\.visit/.test(dm), "card buttons once a card, this visit only");
// The tab renders, inside a dungeon and out.
const { hbs } = await import("./harness.mjs");
const root = new URL("../arneyan", import.meta.url).pathname;
const T = await import("../arneyan/module/travel.mjs");
const base = { ...T.travelContext({ flags: {} }, []), isGM: true };
const inside = hbs(root)("templates/actor/travel-tab.hbs", { ...base, dungeon: c });
assert.ok(inside.includes("In Crypt") && inside.includes("Phase (3d12)") && inside.includes("42% chance") && (inside.match(/fa-solid fa-circle/g) ?? []).length === 2);
const outside = hbs(root)("templates/actor/travel-tab.hbs", { ...base, dungeon: D.dungeonContext(party({ dungeons: { mine: { name: "Old Mine", dice: 2, leftAt: 0 } } }), DAY) });
assert.ok(outside.includes("Enter a dungeon") && outside.includes("Not in a dungeon. Known: Old Mine (1d12, 1 day away)."));
console.log("dungeon phases ok");

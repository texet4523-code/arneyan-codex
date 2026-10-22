// 0.10.40: travel mode (the party token's moves count hexes a day), the clock's toggle and moving it.
import assert from "node:assert/strict";
import fs from "node:fs";
import { hbs } from "./harness.mjs";

const T = await import("../arneyan/module/travel.mjs");
const root = new URL("../arneyan/", import.meta.url).pathname;

// Hexes a day (Kieran's Travel Speed Rules).
assert.equal(T.hexesPerDay("foot", "slow"), 1);
assert.equal(T.hexesPerDay("foot", "normal"), 2);
assert.equal(T.hexesPerDay("foot", "fast"), 3);
assert.equal(T.hexesPerDay("mounted", "slow"), 2);
assert.equal(T.hexesPerDay("mounted", "normal"), 3);
assert.equal(T.hexesPerDay("mounted", "fast"), 4);
assert.equal(T.hexesPerDay("umbral", "fast"), 24, "an Umbral Journey is always Normal");

// Moving the token: hexes add up to the day's; a day ends when they're used, the rest carries over.
let r = T.travelMove({ today: 0, day: 0 }, 1, 2);
assert.deepEqual([r.today, r.day, r.ended, r.left], [1, 0, [], 1], "1 of 2: one left");
r = T.travelMove({ today: 1, day: 0 }, 1, 2);
assert.deepEqual([r.today, r.day, r.ended], [0, 1, [1]], "the second hex ends day 1");
r = T.travelMove({ today: 1, day: 2 }, 6, 2);
assert.deepEqual([r.today, r.day, r.ended], [1, 5, [3, 4, 5]], "a long move ends several days and carries the odd hex");
// Every 7 days, a ration reckoning.
r = T.travelMove({ today: 1, day: 6, road: 6 }, 1, 2);
assert.deepEqual([r.day, r.road, r.rations], [7, 0, [7]]);
r = T.travelMove({ today: 0, day: 5, road: 5 }, 20, 2);
assert.deepEqual([r.day, r.road, r.rations], [15, 1, [7, 14]]);
// Only travel-mode days count: days of Travel one day (which eats daily) don't.
r = T.travelMove({ today: 1, day: 6, road: 1 }, 1, 2);
assert.deepEqual([r.day, r.road, r.rations], [7, 2, []]);
assert.equal(T.travelMove({ today: 0, day: 0 }, 0, 2).ended.length, 0);
assert.equal(T.RATION_DAYS, 7);

// Hexes between two positions: the grid's own count, else the distance over the grid size.
const scene = { grid: { size: 100, distance: 6, measurePath: ([a, b]) => ({ spaces: Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 100), distance: 0 }) } };
assert.equal(T.hexesBetween(scene, { x: 0, y: 0 }, { x: 300, y: 0 }), 3);
assert.equal(T.hexesBetween(scene, { x: 0, y: 0 }, { x: 0, y: 0 }), 0);
assert.equal(T.hexesBetween({ grid: { size: 100 } }, { x: 0, y: 0 }, { x: 0, y: 200 }), 2, "no measurePath: by size");
assert.equal(T.hexesBetween({ grid: { size: 100, distance: 6, measurePath: () => ({ spaces: 0, distance: 18 }) } }, { x: 0, y: 0 }, { x: 1, y: 1 }), 3, "gridless: distance over the grid's");
assert.equal(T.hexesLabel({ method: "foot", pace: "normal", today: 1 }), "1 of 2 hexes today (Normal pace): 1 left");
assert.match(T.hexesLabel({ method: "foot", pace: "slow", today: 2 }), /: 0 left$/, "never below 0 after a change of pace");
// Square grids (battle and town maps) don't count; a move's own path count comes first.
assert.equal(T.hexesBetween({ grid: { size: 100, isSquare: true } }, { x: 0, y: 0 }, { x: 300, y: 0 }), 0);
assert.equal(T.movedHexes(scene, { passed: { spaces: 4 }, origin: { x: 0, y: 0 }, destination: { x: 100, y: 0 } }), 4, "a path through waypoints");
assert.equal(T.movedHexes(scene, { origin: { x: 0, y: 0 }, destination: { x: 200, y: 0 } }), 2);
assert.equal(T.movedHexes({ grid: { isSquare: true } }, { passed: { spaces: 4 } }), 0);

// The Travel tab: the mode switch, today's count, rations due; End the day here in place of Travel one day.
const ctx = T.travelContext({ flags: { arneyan: { travel: { mode: true, today: 1, day: 9, road: 5 } } } }, []);
assert.deepEqual([ctx.travel.left, ctx.travel.toRations], [1, 2]);
const html = hbs(root)("templates/actor/travel-tab.hbs", { ...ctx, isGM: true });
for (const s of ['name="flags.arneyan.travel.mode" checked', "Today 1 / 2: 1 left", "Rations due in 2 days", 'data-action="travelEndDay"']) assert.ok(html.includes(s), s);
assert.ok(!html.includes('data-action="travelDay"'));
const off = hbs(root)("templates/actor/travel-tab.hbs", { ...T.travelContext({ flags: {} }, []), isGM: true });
assert.ok(off.includes('data-action="travelDay"') && !off.includes("Today "));

// The clock: a grip to drag it, a switch in the Journal Notes tools, and the calendar remembers where it was.
const wt = fs.readFileSync(`${root}module/worldtime.mjs`, "utf8");
assert.ok(wt.includes("data-grip") && wt.includes('"clockPos"') && wt.includes('"clockShown"') && wt.includes("notes.tools.arnClock") && wt.includes("notes.tools.arnCalendar"));
const cal = fs.readFileSync(`${root}module/calendar.mjs`, "utf8");
assert.ok(cal.includes('"calendarPos"') && cal.includes("_initializeApplicationOptions"));
const wd = fs.readFileSync(`${root}module/world.mjs`, "utf8");
assert.ok(wd.includes("registerTravel()") && wd.includes("travelEndDay"));
console.log("OK travel mode");
// 0.10.41: on Foundry 13 and later only the moveToken hook counts (the update hook counted every move twice);
// two quick clicks on the grip put the clock back; another GM's client sets daylight on the scene it views.
const tr = fs.readFileSync(`${root}module/travel.mjs`, "utf8");
assert.ok(tr.includes("game.release?.generation ?? 0) >= 13"));
assert.ok(wt.includes("lastGripTap"));
assert.ok(fs.readFileSync(`${root}module/realtime.mjs`, "utf8").includes("viewed !== game.scenes?.active ? [viewed] : []"));
console.log("OK 0.10.41 fixes");
// 0.10.44: each hex moves the clock on by its share of an 8-hour travelling day; a day's end goes on to the next dawn;
// the players roll the Encounter Check from the day's card; scenes choose to follow the time of day.
assert.equal(T.hexSeconds(2), 4 * 3600); assert.equal(T.hexSeconds(24), 1200); assert.equal(T.hexSeconds(3), 9600);
assert.equal(T.toDawn(18 * 3600, 360), 12 * 3600, "18:00 to 06:00 next day");
assert.equal(T.toDawn(3 * 3600, 360), 3 * 3600, "03:00: dawn is today");
assert.equal(T.toDawn(6 * 3600, 360), 24 * 3600, "at dawn already: the next one");
assert.ok(tr.includes('class="arn-travel-encounter"') && tr.includes("export async function rollEncounterCheck") && !/async function endDays[\s\S]{0,400}encounterCheck\(t\)/.test(tr));
const rt = fs.readFileSync(`${root}module/realtime.mjs`, "utf8");
assert.ok(rt.includes('scene.getFlag?.(SYS, "followDaylight") === true') && rt.includes('Hooks.on("renderSceneConfig"') && rt.includes(`name="flags.\${SYS}.followDaylight"`));
const RT = await import("../arneyan/module/realtime.mjs");
assert.equal(RT.sceneFollows({ getFlag: () => undefined, environment: {} }), false, "off unless ticked");
assert.equal(RT.sceneFollows({ getFlag: () => true, environment: { darknessLock: true } }), false, "a locked darkness never follows");
assert.equal(RT.sceneFollows({ getFlag: () => true, environment: {} }), true);
const trf = fs.readFileSync(`${root}module/transform.mjs`, "utf8");
assert.ok(trf.includes('spellsLocked: level >= 15 || game.user.isGM ? "" : "from 15th level: Wild Shape Casting"') && trf.includes("!!o.keepSpells && (!wild || wild.level >= 15)"));
console.log("OK 0.10.44 travel clock, encounter roll, scene daylight, Wild Shape spells");
// Review fixes: the clock loop ends days as travelMove does; the check is rolled in public; drawn once; old darkness restored.
assert.ok(tr.includes("while (today >= perDay && ended.length)") && tr.includes("rollMode: CONST.DICE_ROLL_MODES.PUBLIC") && tr.includes('"encounterDrawn"') && tr.includes("moveTime(-back * hexSeconds("));
assert.ok(rt.includes('sc.getFlag(SYS, "darknessBefore") !== undefined && !sceneFollows(sc)'));
console.log("OK 0.10.44 review fixes");

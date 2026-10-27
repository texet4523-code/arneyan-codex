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
// Batch 6: hours travelled today, the journey's day in brackets (8-hour travelling day: on foot at Normal, 4 h a hex).
assert.equal(T.hexesLabel({ method: "foot", pace: "normal", today: 1, day: 0 }), "4 h (Day 1)");
assert.equal(T.hexesLabel({ method: "foot", pace: "fast", today: 1, day: 37 }), "2 h 40 m (Day 38)");
assert.equal(T.hexesLabel({ method: "foot", pace: "normal", today: 0, day: 2 }), "0 h (Day 3)");
assert.deepEqual([T.hoursText(9600), T.hoursText(3600 * 8), T.hoursText(0)], ["2 h 40 m", "8 h", "0 h"]);
// Square grids (battle and town maps) don't count; a move's own path count comes first.
assert.equal(T.hexesBetween({ grid: { size: 100, isSquare: true } }, { x: 0, y: 0 }, { x: 300, y: 0 }), 0);
assert.equal(T.movedHexes(scene, { passed: { spaces: 4 }, origin: { x: 0, y: 0 }, destination: { x: 100, y: 0 } }), 4, "a path through waypoints");
assert.equal(T.movedHexes(scene, { origin: { x: 0, y: 0 }, destination: { x: 200, y: 0 } }), 2);
assert.equal(T.movedHexes({ grid: { isSquare: true } }, { passed: { spaces: 4 } }), 0);

// The Travel tab: the mode switch, today's count, rations due; End the day here in place of Travel one day.
const ctx = T.travelContext({ flags: { arneyan: { travel: { mode: true, today: 1, day: 9, road: 5 } } } }, []);
assert.deepEqual([ctx.travel.left, ctx.travel.toRations], [1, 2]);
const html = hbs(root)("templates/actor/travel-tab.hbs", { ...ctx, isGM: true });
for (const s of ['name="flags.arneyan.travel.mode" checked', "4 h (Day 10)", "Rations eaten at dawn", 'data-action="travelEndDay"']) assert.ok(html.includes(s), s);
assert.ok(!html.includes('data-action="travelDay"'));
const off = hbs(root)("templates/actor/travel-tab.hbs", { ...T.travelContext({ flags: {} }, []), isGM: true });
assert.ok(off.includes('data-action="travelDay"') && !off.includes("Rations eaten at dawn"));

// The clock: a grip to drag it, a switch in the Journal Notes tools, and the calendar remembers where it was.
const wt = fs.readFileSync(`${root}module/worldtime.mjs`, "utf8");
assert.ok(wt.includes("data-grip") && wt.includes('"clockPos"') && wt.includes('"clockShown"') && wt.includes("notes.tools.arnClock") && wt.includes("notes.tools.arnCalendar"));
const cal = fs.readFileSync(`${root}module/calendar.mjs`, "utf8");
assert.ok(cal.includes('"calendarPos"') && cal.includes("_initializeApplicationOptions"));
const wd = fs.readFileSync(`${root}module/world.mjs`, "utf8");
assert.ok(wd.includes("registerTravel()") && wd.includes("travelEndDay"));
// Batch 6: rations eaten at dawn after each day in travel mode (no 7-day card); the forage button at Slow pace.
const tsrc = fs.readFileSync(`${root}module/travel.mjs`, "utf8");
// The dawn meal is due after each day and eaten when the party sets off (next move or next day's end), once.
assert.ok(tsrc.includes("[`flags.${SYS}.travel.mealDue`]: dayDone") && tsrc.includes("[`flags.${SYS}.travel.mealDue`]: day }"));
assert.ok(tsrc.includes("if (t.mealDue) {") && (tsrc.match(/await eatDue\(party/g) ?? []).length >= 3);
assert.ok(tsrc.includes("Date.now() - lastEndDay < 2500"), "End the day here: one day per double click");
assert.ok(tsrc.includes("Number(b.dataset.day) !== Number(travelState(party).day)"), "an old card's Forage is spent");
assert.ok(!tsrc.includes("Wisdom (Survival)"));
assert.ok(!/await rationCard\(/.test(tsrc), "no 7-day ration card in travel mode");
assert.ok(tsrc.includes('class="arn-forage"') && tsrc.includes("forage(who,"));
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
assert.ok(trf.includes("const WILD_CASTING_LEVEL = 6;") && trf.includes("spellsLocked: level >= WILD_CASTING_LEVEL || game.user.isGM") && trf.includes("!!o.keepSpells && (!wild || wild.level >= WILD_CASTING_LEVEL)"), "Wild Shape Casting from 6th (books v0.10.22)");
console.log("OK 0.10.44 travel clock, encounter roll, scene daylight, Wild Shape spells");
// Review fixes: the clock loop ends days as travelMove does; the check is rolled in public; drawn once; old darkness restored.
assert.ok(tr.includes("while (today >= perDay && ended.length)") && tr.includes("rollMode: CONST.DICE_ROLL_MODES.PUBLIC") && tr.includes('"encounterDrawn"') && tr.includes("moveTime(-back * hexSeconds("));
assert.ok(rt.includes('sc.getFlag(SYS, "darknessBefore") !== undefined && !sceneFollows(sc)'));
console.log("OK 0.10.44 review fixes");

// 0.10.68: travel mode's fog of war (Kieran, 27 Oct 2026): on a hex map the party token sees 2 hexes in colour by its
// own light (1 at night) instead of its members' darkvision; a square or gridless map is left alone.
{
  globalThis.CONST ??= {};
  CONST.GRID_TYPES ??= { GRIDLESS: 0, SQUARE: 1, HEXODDR: 2 };
  globalThis.foundry ??= {};
  foundry.utils ??= {};
  foundry.utils.deepClone ??= v => structuredClone(v);
  globalThis.game ??= {};
  const { travelSight, TRAVEL_SIGHT, travelOn, restoreSaved } = await import("../arneyan/module/tokens.mjs");
  const tok = () => ({ sight: { range: 120, visionMode: "darkvision", saturation: -1 }, light: { dim: 0, bright: 0, animation: { type: "torch" } }, detectionModes: [{ id: "basicSight", range: 120 }, { id: "seeAll", enabled: true, range: 60 }] });
  const hex = d => ({ grid: { type: 2, distance: 5 }, environment: { darknessLevel: d } });
  const day = travelSight(tok(), hex(0));
  // Foundry adds half the token's width, so 2 hexes of range reach the far edge of the 2nd ring.
  assert.deepEqual([day.sight.visionMode, day.sight.range, day.sight.saturation, day.light.dim, day.light.bright, day.detectionModes[0].range], ["basic", 10, 0, 10, 10, 10]);
  assert.equal(day.detectionModes[1].enabled, false, "members' other senses are off in travel mode");
  assert.equal(travelSight(tok(), hex(0.8)).sight.range, TRAVEL_SIGHT.night * 5, "1 hex at night");
  // The saved darkness wins over the prepared value while a jump fades in.
  assert.equal(travelSight(tok(), { ...hex(0.1), _source: { environment: { darknessLevel: 0.9 } } }).sight.range, 5, "night as soon as it's saved");
  assert.equal(travelSight(tok(), { grid: { type: 1, distance: 5 }, environment: {} }).sight.visionMode, "darkvision", "a square map is left alone");
  // Keyed detection modes (v14).
  const keyed = travelSight({ sight: {}, light: {}, detectionModes: { basicSight: { range: 120 }, seeAll: { enabled: true, range: 60 } } }, hex(0));
  assert.deepEqual([keyed.detectionModes.basicSight.range, keyed.detectionModes.seeAll.enabled], [10, false]);
  // An unlinked token reads travel mode from the party, not its own old copy.
  game.actors = { get: id => (id === "P" ? { flags: { arneyan: { travel: { mode: false } } } } : null) };
  assert.equal(travelOn({ actorLink: false, actorId: "P", actor: { flags: { arneyan: { travel: { mode: true } } } } }), false);
  assert.equal(travelOn({ actorLink: true, actor: { flags: { arneyan: { travel: { mode: true } } } } }), true);
  // A party token prepared again in place gets its saved light, sight and detection back.
  const lit = travelSight({ ...tok(), _source: { light: { dim: 0, bright: 0 }, sight: { range: 0, visionMode: "basic", saturation: 0 }, detectionModes: [] } }, hex(0));
  restoreSaved(lit);
  assert.deepEqual([lit.light.dim, lit.light.bright, lit.sight.range, lit.detectionModes.length], [0, 0, 0, 0]);
  const tk = fs.readFileSync(`${root}module/tokens.mjs`, "utf8");
  assert.ok(tk.includes("if (party) restoreSaved(this);") && tk.includes("if (party && this.parent && travelOn(this)) { travelSight(this, this.parent); return; }"));
  assert.ok(tk.indexOf("travelOn(this)) {") < tk.indexOf("if (!autoOn()) return;"), "travel fog doesn't depend on the senses setting");
  assert.ok(tk.includes("flags.${SYS}.travel.mode`)) schedule(actor)"));
  console.log("OK 0.10.68 travel mode fog of war");
}

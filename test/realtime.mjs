// 0.10.39: the clock in real time, moving the time freely, and daylight on the scene.
import assert from "node:assert/strict";
import { hbs } from "./harness.mjs";

const RT = await import("../arneyan/module/realtime.mjs");
const root = new URL("../arneyan/", import.meta.url).pathname;

// Times.
assert.equal(RT.parseHM("06:30"), 390);
assert.equal(RT.parseHM("6"), 360);
assert.equal(RT.parseHM("24:00"), 1440);
assert.equal(RT.parseHM("25:00"), null);
assert.equal(RT.parseHM("12:60"), null);
assert.equal(RT.parseHM("dawn"), null);
assert.equal(RT.hmText(390), "06:30");
assert.equal(RT.hmText(1440), "00:00");

// Darkness through the day (defaults: dawn 06:00, full day 08:00, dusk 18:00, full night 20:00).
const d = m => RT.darknessAt(m);
assert.equal(d(0), 1);
assert.equal(d(359), 1);
assert.equal(d(360), 1, "dawn starts dark");
assert.equal(d(420), 0.5, "half way through dawn");
assert.equal(d(480), 0, "full day");
assert.equal(d(720), 0);
assert.equal(d(1080), 0, "dusk starts light");
assert.equal(d(1140), 0.5);
assert.equal(d(1200), 1, "full night");
assert.equal(d(1439), 1);
assert.equal(d(-60), 1, "wraps round");
// Custom: a lighter night, a slightly dim day.
const cfg = { dawn: 300, day: 360, dusk: 1200, night: 1260, dark: 0.8, light: 0.1 };
assert.equal(RT.darknessAt(0, cfg), 0.8);
assert.equal(RT.darknessAt(330, cfg), 0.45);
assert.equal(RT.darknessAt(600, cfg), 0.1);
assert.equal(RT.partOfDay(330, cfg), "Dawn");
assert.equal(RT.partOfDay(600, cfg), "Day");
assert.equal(RT.partOfDay(1230, cfg), "Dusk");
assert.equal(RT.partOfDay(1300, cfg), "Night");
// Times put in order; darkness kept between 0 and 1.
assert.deepEqual(RT.cleanDaylight({ on: 1, dawn: 500, day: 400, dusk: 300, night: 200, dark: 3, light: -1 }), { on: true, dawn: 500, day: 500, dusk: 500, night: 500, dark: 1, light: 0 });
assert.equal(RT.darknessAt(600, { dawn: 500, day: 500, dusk: 500, night: 500 }), 1, "no day at all is night");

// Points of the day, and the seconds to them from a time of day (back or on).
assert.deepEqual(RT.dayPoints().map(p => [p.id, p.minute]), [["dawn", 360], ["midday", 720], ["dusk", 1080], ["midnight", 0]]);
assert.equal(RT.secondsTo(10 * 3600, 720), 2 * 3600, "10:00 to midday: on 2 hours");
assert.equal(RT.secondsTo(14 * 3600, 720), -2 * 3600, "14:00 to midday: back 2 hours");
assert.equal(RT.secondsTo(14 * 3600, 0), -14 * 3600, "midnight is the start of the day");

// Real seconds into game seconds: the part-seconds carry over; a long gap (a laptop asleep) counts at most 30.
let a = RT.accrue(0, 1.4);
assert.deepEqual([a.advance, Math.round(a.carry * 10) / 10], [1, 0.4]);
a = RT.accrue(a.carry, 0.7);
assert.equal(a.advance, 1);
assert.equal(RT.accrue(0, 3600).advance, 30);
assert.equal(RT.accrue(0, 2, 60).advance, 120, "a minute a second");
assert.equal(RT.accrue(0, 5, 0).advance, 0, "speed 0 runs nothing");
assert.equal(RT.accrue(0, -5).advance, 0);

// The calendar window: the clock, the GM's moves and the daylight form.
const ctx = {
  gm: true, weekdays: [], weeks: [], monthName: "Lathos", god: "x", year: 503, suffix: "AC", season: "Spring", nowText: "", isNowMonth: true,
  picked: { things: [] },
  clock: { time: "14:05:09", runs: true, live: true, state: "Running in real time", part: "Day", rate: 1, rates: [{ value: 1, label: "Real time", selected: true }, { value: 60, label: "1 min a second", selected: false }], combatPause: true,
    points: RT.dayPoints().map(p => ({ ...p, time: RT.hmText(p.minute) })), moves: [{ s: -60, label: "−1 min", back: true }, { s: 60, label: "+1 min", back: false }],
    daylight: { on: true, dawnText: "06:00", dayText: "08:00", duskText: "18:00", nightText: "20:00", dark: 1, light: 0, darkNow: 0 }, scene: { name: "Tariel", follows: false } }
};
const html = hbs(root)("templates/apps/calendar.hbs", ctx);
for (const s of ['class="arn-cal-clock-time">14:05:09', 'data-action="toggleClock"', "fa-pause", 'data-action="move" data-s="-60"', 'data-action="toPoint" data-minute="360"',
  'name="clockSet"', '<option value="1" selected>Real time</option>', 'name="clockCombat" checked', 'name="dl-dawn" value="06:00"', 'data-action="saveDaylight"', 'name="sceneFollows" >', "Tariel follows the time of day"])
  assert.ok(html.includes(s), s);
const player = hbs(root)("templates/apps/calendar.hbs", { ...ctx, gm: false });
assert.ok(player.includes("14:05:09") && !player.includes("toggleClock") && !player.includes("dl-dawn"), "players see the time, not the controls");
console.log("OK real-time clock");

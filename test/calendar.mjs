// 0.10.31: the Arneyan calendar (the Tobiasian Calendar from the Kanka wiki), in place of Simple Calendar.
import assert from "node:assert/strict";
import fs from "node:fs";
import { hbs } from "./harness.mjs";

const C = await import("../arneyan/module/calendar-data.mjs");

// Kanka's own display, read 21 Oct 2026: full and new moons of Elnaris from 1 AC to 513 AC.
const full = [[1, 1, 1], [1, 2, 1], [100, 1, 18], [503, 1, 2], [503, 11, 6], [503, 12, 7], [504, 1, 7], [504, 6, 9], [506, 6, 20], [506, 7, 21], [513, 6, 27]];
const newMoons = [[1, 1, 16], [1, 2, 17], [100, 1, 3], [503, 1, 17], [504, 1, 22], [504, 6, 25], [506, 6, 5], [506, 7, 5], [513, 6, 12]];
for (const [y, m, d] of full) {
  const n = C.dayNumber(y, m, d);
  assert.ok(C.elnaris(n).full, `full moon ${d}/${m}/${y}`);
  assert.ok(!C.elnaris(n + 1).full && !C.elnaris(n - 1).full, "full for one day");
}
for (const [y, m, d] of newMoons) assert.ok(C.elnaris(C.dayNumber(y, m, d)).new, `new moon ${d}/${m}/${y}`);
// Ilmatria 503 as Kanka marks it: waxing gibbous 3, full 7, waning gibbous 10, last quarter 14, waning crescent 18,
// new 22, waxing crescent 26, first quarter 29. The quarters are single days too.
const ilm = d => C.elnaris(C.dayNumber(503, 12, d));
assert.ok(ilm(14).quarter && ilm(14).phase === "Last quarter" && !ilm(13).quarter && !ilm(15).quarter);
assert.ok(ilm(29).quarter && ilm(29).phase === "First quarter" && !ilm(28).quarter && !ilm(30).quarter);
assert.equal(ilm(10).phase, "Waning gibbous");
assert.equal(ilm(18).phase, "Waning crescent");
assert.equal(ilm(26).phase, "Waxing crescent");
assert.equal(ilm(3).phase, "Waxing gibbous");

// Dates: 30-day months, weeks that start again each month (every month opens on Moonday).
assert.deepEqual(C.dateOf(C.dayNumber(503, 12, 11)), { year: 503, month: 12, day: 11, weekday: 3 });
assert.equal(C.dateText(C.dateOf(C.dayNumber(503, 12, 11))), "Tyrsday, 11 Ilmatria 503 AC");
for (let m = 1; m <= 12; m++) assert.equal(C.dateOf(C.dayNumber(506, m, 1)).weekday, 0, "a month starts on Moonday");
assert.deepEqual(C.dateOf(C.dayNumber(503, 12, 30) + 1), { year: 504, month: 1, day: 1, weekday: 0 });
assert.equal(C.seasonOf(1, 1), "Winter");
assert.equal(C.seasonOf(1, 19), "Spring");
assert.equal(C.seasonOf(4, 21), "Summer");
assert.equal(C.seasonOf(8, 20), "Autumn");
assert.equal(C.seasonOf(10, 20), "Winter");

// Festivals and events; the GM's notes, yearly or once, for everyone or the GM only.
assert.deepEqual(C.onDay(503, 7, 30).map(x => x.name), ["The Night of Masks"]);
assert.deepEqual(C.onDay(499, 8, 4), [], "Mournas Day from 500 only");
assert.deepEqual(C.onDay(506, 6, 20).map(x => x.name), ["Planar Eclipse"]);
const notes = [{ id: "a", year: 503, month: 3, day: 5, text: "Kieran's birthday", yearly: true }, { id: "b", year: 504, month: 3, day: 5, text: "Secret", gmOnly: true }];
assert.deepEqual(C.onDay(506, 3, 5, { notes }).map(x => x.name), ["Kieran's birthday"]);
assert.deepEqual(C.onDay(504, 3, 5, { notes, gm: true }).map(x => x.name), ["Kieran's birthday", "Secret"]);
assert.deepEqual(C.onDay(502, 3, 5, { notes }), [], "a yearly note starts from its year");

// Tharizdun's Eye: six-month cycles from the day it first rose; four done by the start of 506 AC.
const rose = C.dayNumber(504, 1, 1);
assert.equal(C.eye(rose - 1, rose), null);
assert.equal(C.eye(C.dayNumber(504, 2, 30), rose).phase, "Opening");
assert.equal(C.eye(C.dayNumber(504, 3, 1), rose).phase, "Watching");
assert.equal(C.eye(C.dayNumber(504, 4, 1), rose).phase, "Receding");
assert.equal(C.eye(C.dayNumber(506, 1, 1), rose).cycle, 5);
assert.equal(C.eye(C.dayNumber(506, 1, 1), null), null, "not set: not shown");

// Foundry's world calendar config, and the window drawn from its template.
globalThis.foundry.data ??= {};
globalThis.foundry.data.CalendarData ??= class { timeToComponents() { return { dayOfMonth: 10 }; } componentsToTime() { return 0; } };
const K = await import("../arneyan/module/calendar.mjs");
assert.equal(K.CALENDAR_CONFIG.months.values.length, 12);
assert.equal(K.CALENDAR_CONFIG.days.daysPerYear, 360);
assert.deepEqual(K.CALENDAR_CONFIG.seasons.values, [], "seasons are the calendar's own (they start mid-month)");
assert.equal(K.whenText(C.dayNumber(503, 12, 11) * 86400 + 14 * 3600 + 5 * 60), "Tyrsday, 11 Ilmatria 503 AC, 14:05");
// Dates as the GM types them.
assert.equal(K.parseDate("1 Lathos 504"), C.dayNumber(504, 1, 1));
assert.equal(K.parseDate("13 Selunen 506"), C.dayNumber(506, 6, 13), "no circumflex");
assert.equal(K.parseDate("13 SELU\u0302NEN 506"), C.dayNumber(506, 6, 13), "a decomposed û, capitals");
assert.equal(K.parseDate("1st Lathos 504 AC"), C.dayNumber(504, 1, 1));
assert.equal(K.parseDate("31 Lathos 504"), null, "no 31st");
assert.equal(K.parseDate("soon"), null);
globalThis.game = { ...(globalThis.game ?? {}), time: { worldTime: C.dayNumber(506, 6, 20) * 86400 + 8 * 3600 }, user: { isGM: true },
  settings: { get: (s, k) => ({ calendarNotes: notes, eyeStart: "1 Lathos 504", dateOffset: 0 }[k]) } };
// The date offset (Set date without time passing) moves the date, not world time.
game.settings.get = (s, k) => ({ calendarNotes: notes, eyeStart: "1 Lathos 504", dateOffset: 86400 * 3 }[k]);
assert.equal(K.whenOf(C.dayNumber(506, 6, 20) * 86400).day, 23);
game.settings.get = (s, k) => ({ calendarNotes: notes, eyeStart: "1 Lathos 504", dateOffset: 0 }[k]);
assert.equal(K.eyeStart(), rose);
const app = Object.create(K.ArneyanCalendar.prototype);
app.view = null; app.picked = null;
const ctx = await app._prepareContext();
assert.equal(ctx.monthName, "Selûnen");
assert.equal(ctx.weeks.length, 5);
assert.equal(ctx.weeks[4].length, 2, "30 days: four weeks and two days");
assert.ok(ctx.picked.isToday && ctx.picked.things.some(t => t.name === "Planar Eclipse"));
assert.equal(ctx.picked.eye.phase, "Receding", "Selûnen 506: the fifth cycle, receding");
const html = hbs(new URL("../arneyan/", import.meta.url).pathname)("templates/apps/calendar.hbs", ctx);
assert.ok(html.includes("Selûnen 506 AC") && html.includes("The month of Selûne") && html.includes("Set date"));
assert.ok(html.includes("Eye: Receding (cycle 5)"));
game.user.isGM = false;
const pctx = await app._prepareContext();
assert.equal(pctx.picked.eye.label, "The Dark Moon: Receding", "players see the name most people use");
game.user.isGM = true;
assert.ok(!html.includes("—") && !/data-action="tab"/.test(html));
console.log("OK calendar");

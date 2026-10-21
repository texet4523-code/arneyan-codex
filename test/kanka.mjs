// 0.10.32: the calendar kept in step with Kanka (pull its events and date; move its date a day at a time).
import assert from "node:assert/strict";
import "./harness.mjs";

const C = await import("../arneyan/module/calendar-data.mjs");
const K = await import("../arneyan/module/kanka.mjs");

assert.deepEqual(K.readKankaDate("503-12-11"), { year: 503, month: 12, day: 11 });
assert.equal(K.readKankaDate("soon"), null);

// Reminders as Kanka gives them (the shapes read from the wiki's calendar on 21 Oct).
const reminders = [
  { id: 1, entity_id: 4668796, comment: "Spring Equinox", year: 1, month: 1, day: 19, length: 1, is_recurring: true, recurring_periodicity: "year", visibility_id: 1 },
  { id: 2, entity_id: 4668796, comment: "Mournas Day", year: 500, month: 8, day: 4, length: 1, is_recurring: true, recurring_periodicity: "year", visibility_id: 1 },
  { id: 3, entity_id: 4668796, comment: "Planar Eclipse", year: 506, month: 6, day: 20, length: 1, is_recurring: false, visibility_id: 1 },
  { id: 4, entity_id: 777, comment: "", year: 480, month: 3, day: 5, length: 1, is_recurring: true, recurring_periodicity: "year", visibility_id: 1 },
  { id: 5, entity_id: 4668796, comment: "The Maw's secret", year: 504, month: 2, day: 1, length: 3, is_recurring: false, visibility_id: 2 }
];
const ev = K.remindersToEvents(reminders, { 777: "Tannith's birthday" }, { calendarEntity: 4668796, publicEntities: new Set([777]) });
assert.deepEqual(ev.map(e => e.name), ["Spring Equinox", "Tannith's birthday", "Mournas Day", "The Maw's secret", "Planar Eclipse"]);
assert.equal(ev.find(e => e.name === "The Maw's secret").gmOnly, true, "admin-only on Kanka: the GM's here");
assert.equal(ev.find(e => e.name === "Spring Equinox").every, "year");

// The calendar uses them in place of the ones it came with.
assert.deepEqual(C.onDay(503, 1, 19, { events: ev }).map(x => x.name), ["Spring Equinox"]);
assert.deepEqual(C.onDay(499, 8, 4, { events: ev }), [], "Mournas Day from 500");
assert.deepEqual(C.onDay(503, 8, 4, { events: ev }).map(x => x.kind), ["festival"]);
assert.deepEqual(C.onDay(504, 2, 3, { events: ev }), [], "hidden from players");
assert.deepEqual(C.onDay(504, 2, 3, { events: ev, gm: true }).map(x => x.name), ["The Maw's secret"], "three days long");
assert.deepEqual(C.onDay(504, 2, 4, { events: ev, gm: true }), []);
assert.deepEqual(C.onDay(503, 1, 19, { events: [] }), [], "an empty pull shows nothing pulled");
assert.ok(C.eventOn({ year: 1, month: 1, day: 30, every: "month" }, 503, 7, 30), "every month");

// Differences from the system's calendar are reported, not changed.
assert.deepEqual(K.calendarDiffs({ months: C.MONTHS.map(name => ({ name, length: 30 })), weekdays: C.WEEKDAYS }), []);
assert.equal(K.calendarDiffs({ months: [{ name: "Lathos", length: 31 }], weekdays: ["Moonday"] }).length, 2);

// Pull and push against a stand-in Kanka: the token goes in the header, the date moves a day at a time.
const settings = { kankaToken: "tok", kankaCampaign: "198952", kankaCalendar: "18550", kankaEvents: {} };
globalThis.game = { settings: { get: (s, k) => settings[k], set: async (s, k, v) => { settings[k] = v; } }, user: { isGM: true } };
let kankaDay = C.dayNumber(503, 12, 11);
const calls = [];
globalThis.fetch = async (url, opts) => {
  calls.push(`${opts.method} ${url.replace("https://api.kanka.io/1.0/campaigns/198952/", "")}`);
  assert.equal(opts.headers.Authorization, "Bearer tok");
  const ok = data => ({ ok: true, status: 200, json: async () => data });
  if (url.endsWith("/advance")) { kankaDay++; return ok({}); }
  if (url.endsWith("/retreat")) { kankaDay--; return ok({}); }
  if (url.includes("/reminders")) return ok({ data: reminders, links: { next: null }, meta: { last_page: 1 } });
  if (url.includes("/entities/777")) return ok({ data: { name: "Tannith's birthday", is_private: false } });
  if (url.endsWith("calendars/18550")) { const d = C.dateOf(kankaDay); return ok({ data: { entity_id: 4668796, date: `${d.year}-${d.month}-${d.day}`, months: C.MONTHS.map(name => ({ name, length: 30 })), weekdays: C.WEEKDAYS } }); }
  return { ok: false, status: 404, json: async () => ({}) };
};
const res = await K.pullFromKanka();
assert.deepEqual(res.date, { year: 503, month: 12, day: 11 });
assert.equal(res.events.length, 5);
assert.deepEqual(res.diffs, []);
assert.equal(K.kankaEvents().length, 5, "saved for the calendar (the GM sees all five)");
assert.equal(settings.kankaEvents.items.length, 4, "the world setting, which players download, has only the open four");
assert.ok(!JSON.stringify(settings.kankaEvents).includes("Maw"), "nothing hidden reaches the world setting");
game.user.isGM = false;
assert.equal(K.kankaEvents().length, 4, "a player's calendar");
game.user.isGM = true;
assert.ok(res.notes.length === 0);
// A birthday on a private entry, or on one not looked up, stays the GM's; a reminder with no visibility too.
const priv = K.remindersToEvents([{ entity_id: 9, comment: "Secret NPC's birthday", year: 1, month: 2, day: 2, is_recurring: true, recurring_periodicity: "year", visibility_id: 1 },
  { entity_id: 4668796, comment: "No visibility", year: 1, month: 2, day: 3, is_recurring: false }], {}, { calendarEntity: 4668796, publicEntities: new Set() });
assert.deepEqual(priv.map(e => e.gmOnly), [true, true]);
assert.ok(K.remindersToEvents([{ entity_id: 5, comment: "Unknown calendar", year: 1, month: 1, day: 1, visibility_id: 1 }])[0].gmOnly, "no calendar entity known: entries count as other entries");
// Another GM's older pull doesn't mix its hidden events into a newer one.
settings.kankaEventsGm = { pulledAt: 1, items: [{ name: "Stale", year: 1, month: 1, day: 1, every: "", gmOnly: true }] };
assert.ok(!K.kankaEvents().some(e => e.name === "Stale"));
assert.equal(K.remindersToEvents([{ entity_id: 1, comment: "Once", year: 500, month: 1, day: 1, is_recurring: false, recurring_periodicity: "year", visibility_id: 1 }])[0].every, "", "a one-off stays one-off");
// Two pushes at once run one after the other, the second from Kanka's date as the first left it.
const [p1, p2] = await Promise.all([K.pushOnce({ year: 503, month: 12, day: 16 }), K.pushOnce({ year: 503, month: 12, day: 14 })]);
assert.deepEqual([p1.moved, p2.moved, kankaDay], [5, -2, C.dayNumber(503, 12, 14)]);
let push = await K.pushDateToKanka({ year: 503, month: 12, day: 14 });
assert.equal(push.moved, 0);
push = await K.pushDateToKanka({ year: 503, month: 12, day: 13 });
assert.deepEqual([push.moved, kankaDay], [-1, C.dayNumber(503, 12, 13)]);
push = await K.pushDateToKanka({ year: 504, month: 3, day: 1 });
assert.equal(push.moved, K.MAX_STEPS, "at most 20 days at once (Kanka's rate limit)");
assert.equal(push.left, C.dayNumber(504, 3, 1) - C.dayNumber(503, 12, 13) - K.MAX_STEPS);
assert.ok(calls.every(c => /^(GET|POST) /.test(c)) && !calls.some(c => /PUT|PATCH|DELETE/.test(c)), "nothing rewritten or deleted on Kanka");
settings.kankaToken = "";
await assert.rejects(K.kankaDate(), /No Kanka token/);
settings.kankaToken = "bad";
globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
await assert.rejects(K.kankaDate(), /turned the token down/);
console.log("OK kanka");

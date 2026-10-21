/**
 * The Arneyan calendar, in place of Simple Calendar: the Tobiasian Calendar from the Kanka wiki (twelve 30-day months
 * named for the Tarielian gods, weeks that start again each month, years AC), Elnaris's phases, Tharizdun's Eye on
 * its six-month cycle, the festivals and the wiki's dated events, and the GM's own notes.
 *
 * It is Foundry's world calendar too (CONFIG.time), so the game clock, rests, light and travel all read the date from
 * it. The window opens from the clock (the calendar icon) or game.arneyan.calendar().
 */
import * as C from "./calendar-data.mjs";

const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY = 86400;
const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/* -------------------------------------------- */
/*  Foundry's world calendar                    */
/* -------------------------------------------- */

/** The calendar as Foundry's CalendarData config. */
export const CALENDAR_CONFIG = {
  name: "The Tobiasian Calendar",
  description: "The calendar of Tariel and the Watchers Coast: twelve months of thirty days, each named for a god of the Tarielian Pantheon.",
  years: { yearZero: 0, firstWeekday: 0, leapYear: null },
  months: { values: C.MONTHS.map((name, i) => ({ name, abbreviation: name.slice(0, 3), ordinal: i + 1, days: C.DAYS_IN_MONTH })) },
  days: {
    values: C.WEEKDAYS.map((name, i) => ({ name, abbreviation: name.slice(0, 3), ordinal: i + 1 })),
    daysPerYear: C.DAYS_IN_YEAR, hoursPerDay: 24, minutesPerHour: 60, secondsPerMinute: 60
  },
  // The seasons start mid-month (19 Lathos), which Foundry's season fields don't take; the calendar works them out
  // itself (calendar-data.mjs seasonOf), and nothing reads Foundry's.
  seasons: { values: [] }
};

/**
 * Seconds added to the world time for the date (the GM's "Set date" without time passing): the date moves, and
 * effects, light and rests, which count world time, see no jump.
 */
export function dateOffset() {
  try { return Number(game.settings.get(SYS, "dateOffset")) || 0; } catch { return 0; }
}

/** The date and time of a world time, from the calendar's own arithmetic. */
export function whenOf(t = game.time?.worldTime ?? 0) {
  t += dateOffset();
  const n = Math.floor(t / DAY);
  const secs = ((t % DAY) + DAY) % DAY;
  return { ...C.dateOf(n), n, hour: Math.floor(secs / 3600), minute: Math.floor((secs % 3600) / 60) };
}

/** "Tyrsday, 11 Ilmatria 503 AC, 14:05". */
export function whenText(t) {
  const w = whenOf(t);
  return `${C.dateText(w)}, ${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
}

/** Foundry's CalendarData with the Tobiasian week (each month starts on Moonday) and its date format. */
function calendarClass() {
  const Base = foundry.data.CalendarData;
  return class ArneyanCalendarData extends Base {
    timeToComponents(time = 0) {
      const c = super.timeToComponents(time);
      c.dayOfWeek = c.dayOfMonth % C.WEEKDAYS.length;
      return c;
    }

  };
}

/** The "arneyan" date format for game.time.calendar.format(t, "arneyan"). */
const formatArneyan = (calendar, components) => whenText(calendar.componentsToTime(components));

/** Make it the world calendar (at init, before Foundry builds game.time). */
export function configureCalendar() {
  try {
    if (!foundry.data?.CalendarData || !globalThis.CONFIG?.time) return;
    // The date format works from world seconds, so it holds whichever calendar Foundry ends up with.
    CONFIG.time.formatters ??= {};
    CONFIG.time.formatters.arneyan = formatArneyan;
    const cls = calendarClass();
    // Tried once here first: a config this Foundry version won't take, or can't work with, leaves its own in place.
    const probe = new cls(foundry.utils.deepClone(CALENDAR_CONFIG));
    const c = probe.timeToComponents(DAY * 400 + 3723);
    if (c.month !== 1 || c.dayOfMonth !== 10 || c.dayOfWeek !== 3 || probe.componentsToTime(c) !== DAY * 400 + 3723) throw new Error("the calendar's arithmetic doesn't come out right");
    CONFIG.time.worldCalendarConfig = CALENDAR_CONFIG;
    CONFIG.time.worldCalendarClass = cls;
  } catch (err) {
    console.warn("Arneyan | calendar", err);
  }
}

/* -------------------------------------------- */
/*  Settings and notes                          */
/* -------------------------------------------- */

/** The GM's notes on the calendar: { id, year, month, day, text, yearly, gmOnly }. */
export function calendarNotes() {
  try { return foundry.utils.deepClone(game.settings.get(SYS, "calendarNotes") ?? []); } catch { return []; }
}

/** The day the Eye first appeared (a day number), or null if the GM hasn't set one. */
export function eyeStart() {
  try { return parseDate(game.settings.get(SYS, "eyeStart")); } catch { return null; }
}

const plain = s => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** A date as the GM types it ("1 Lathos 504", "13 Selunen 506", "1st LATHOS 504 AC") as a day number, or null. */
export function parseDate(v) {
  const m = plain(v).trim().match(/^(\d+)(?:st|nd|rd|th)?\s+(\p{L}+)\s+(\d+)/u);
  if (!m) return null;
  const day = Number(m[1]);
  const month = C.MONTHS.findIndex(x => plain(x).startsWith(m[2].slice(0, 4))) + 1;
  return month && day >= 1 && day <= C.DAYS_IN_MONTH ? C.dayNumber(Number(m[3]), month, day) : null;
}

async function saveNotes(notes) {
  await game.settings.set(SYS, "calendarNotes", notes);
}

/* -------------------------------------------- */
/*  The window                                  */
/* -------------------------------------------- */

const MOON_ICON = ["fa-solid fa-circle", "fa-solid fa-circle-half-stroke", "fa-solid fa-circle-half-stroke", "fa-solid fa-moon", "fa-regular fa-circle", "fa-solid fa-moon", "fa-solid fa-circle-half-stroke", "fa-solid fa-circle-half-stroke"];

export class ArneyanCalendar extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;

  /** Open the calendar at today's month. */
  static open() {
    const app = ArneyanCalendar.#instance ??= new ArneyanCalendar();
    app.view = null;
    app.picked = null;
    return app.render({ force: true });
  }

  /** Redraw it if open (the clock moved, notes changed). */
  static refresh() {
    if (ArneyanCalendar.#instance?.rendered) ArneyanCalendar.#instance.render();
  }

  static DEFAULT_OPTIONS = {
    id: "arneyan-calendar",
    classes: ["arneyan", "arn-calendar-app"],
    position: { width: 640, height: "auto" },
    window: { title: "Calendar", icon: "fa-solid fa-calendar-days", resizable: true },
    actions: {
      prev: ArneyanCalendar.#prev,
      next: ArneyanCalendar.#next,
      prevYear: ArneyanCalendar.#prevYear,
      nextYear: ArneyanCalendar.#nextYear,
      today: ArneyanCalendar.#today,
      pickDay: ArneyanCalendar.#pickDay,
      setDate: ArneyanCalendar.#setDate,
      addNote: ArneyanCalendar.#addNote,
      editNote: ArneyanCalendar.#editNote
    }
  };

  static PARTS = { body: { template: "systems/arneyan/templates/apps/calendar.hbs" } };

  /** The month on show: { year, month }; null shows today's. */
  view = null;
  /** The day picked in the grid (a day number), for its details below. */
  picked = null;

  async _prepareContext() {
    const now = whenOf();
    const view = this.view ?? { year: now.year, month: now.month };
    this.view = view;
    const gm = game.user.isGM;
    const notes = calendarNotes();
    const start = eyeStart();
    const first = C.dayNumber(view.year, view.month, 1);
    const days = [];
    for (let d = 1; d <= C.DAYS_IN_MONTH; d++) {
      const n = first + d - 1;
      const moon = C.elnaris(n);
      const things = C.onDay(view.year, view.month, d, { notes, gm });
      const eye = C.eye(n, start);
      days.push({
        d, n, today: n === now.n, picked: n === this.picked, past: n < now.n,
        moon: moon.full || moon.new || moon.quarter ? { icon: MOON_ICON[moon.index], label: `Elnaris: ${moon.phase}`, cls: moon.full ? "full" : moon.new ? "new" : "quarter" } : null,
        things: things.map(t => ({ ...t, icon: { festival: "fa-solid fa-star", event: "fa-solid fa-bookmark", note: t.gmOnly ? "fa-solid fa-eye-slash" : "fa-solid fa-note-sticky" }[t.kind] })),
        eyeWatching: !!eye?.watching
      });
    }
    // Weeks start again each month: rows of seven, the last one short.
    const weeks = [];
    for (let i = 0; i < days.length; i += C.WEEKDAYS.length) weeks.push(days.slice(i, i + C.WEEKDAYS.length));
    const pickedN = this.picked ?? now.n;
    const pd = C.dateOf(pickedN);
    const pickedThings = C.onDay(pd.year, pd.month, pd.day, { notes, gm });
    const moon = C.elnaris(pickedN);
    const eye = C.eye(pickedN, start);
    return {
      gm, weekdays: C.WEEKDAYS, weeks,
      monthName: C.MONTHS[view.month - 1], god: C.MONTH_GODS[view.month - 1], year: view.year, suffix: C.SUFFIX,
      season: C.seasonOf(view.month, 1),
      nowText: whenText(), isNowMonth: view.year === now.year && view.month === now.month,
      picked: {
        n: pickedN, text: C.dateText(pd), season: C.seasonOf(pd.month, pd.day), moon: moon.phase, isToday: pickedN === now.n,
        things: pickedThings.map(t => ({ ...t, kindLabel: { festival: "Festival", event: "Event", note: t.gmOnly ? "GM note" : "Note" }[t.kind] })),
        // Most people call it the Dark Moon; its true name is the GM's to give out.
        eye: eye ? { ...eye, label: gm ? `Tharizdun's Eye: ${eye.phase} (cycle ${eye.cycle})` : `The Dark Moon: ${eye.phase}` } : null
      },
      eyeSet: start != null
    };
  }

  static #move(app, dm) {
    let { year, month } = app.view;
    month += dm;
    while (month < 1) { month += 12; year -= 1; }
    while (month > 12) { month -= 12; year += 1; }
    app.view = { year, month };
    app.render();
  }
  static #prev() { ArneyanCalendar.#move(this, -1); }
  static #next() { ArneyanCalendar.#move(this, 1); }
  static #prevYear() { ArneyanCalendar.#move(this, -12); }
  static #nextYear() { ArneyanCalendar.#move(this, 12); }
  static #today() { this.view = null; this.picked = null; this.render(); }
  static #pickDay(event, target) { this.picked = Number(target.dataset.n); this.render(); }

  /** GM: make the picked day today (keeping the time of day), or set the date and time exactly. */
  static async #setDate() {
    if (!game.user.isGM) return;
    const now = whenOf();
    const target = C.dateOf(this.picked ?? now.n);
    const content = `<div class="arn-cal-set">
      <div class="form-group"><label>Day</label><input type="number" name="day" min="1" max="30" value="${target.day}"></div>
      <div class="form-group"><label>Month</label><select name="month">${C.MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === target.month ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></div>
      <div class="form-group"><label>Year (AC)</label><input type="number" name="year" min="0" value="${target.year}"></div>
      <div class="form-group"><label>Time</label><input type="number" name="hour" min="0" max="23" value="${now.hour}" style="width:4em"> : <input type="number" name="minute" min="0" max="59" value="${now.minute}" style="width:4em"></div>
      <div class="form-group"><label>Time passes</label><input type="checkbox" name="pass"></div>
      <p class="hint">Unticked, only the date changes (to start a campaign on its date, or to skip ahead without anything running down). Ticked, game time moves on to it: effects, light and rests count the time, as with the clock's buttons.</p></div>`;
    const got = await DialogV2.wait({
      window: { title: "Set the date", icon: "fa-solid fa-calendar-day" }, classes: ["arneyan"], position: { width: 380 }, content,
      buttons: [{ action: "ok", label: "Set", default: true, callback: (ev, btn) => ({ ...Object.fromEntries(["day", "month", "year", "hour", "minute"].map(k => [k, Number(btn.form.elements[k].value)])), pass: btn.form.elements.pass.checked }) }, { action: "cancel", label: "Cancel" }],
      rejectClose: false
    });
    if (!got || typeof got !== "object") return;
    const day = Math.clamp(Math.round(got.day) || 1, 1, C.DAYS_IN_MONTH), month = Math.clamp(Math.round(got.month) || 1, 1, 12);
    const t = C.dayNumber(Math.max(0, Math.round(got.year) || 0), month, day) * DAY + Math.clamp(Math.round(got.hour) || 0, 0, 23) * 3600 + Math.clamp(Math.round(got.minute) || 0, 0, 59) * 60;
    const world = game.time.worldTime ?? 0;
    const dt = t - (world + dateOffset());
    if (got.pass) {
      if (dt < 0) return ui.notifications.warn("Time can't pass backwards: untick \"Time passes\" to move the date back.");
      if (dt) await game.time.advance(dt);
    } else if (dt) await game.settings.set(SYS, "dateOffset", t - world);
    this.view = null;
    this.picked = null;
    this.render();
  }

  /** GM: a note on the picked day (yearly or once; for everyone or the GM only). */
  static async #addNote() {
    if (!game.user.isGM) return;
    const n = this.picked ?? whenOf().n;
    const note = await noteDialog({ ...C.dateOf(n), text: "", yearly: false, gmOnly: false });
    if (!note) return;
    const notes = calendarNotes();
    notes.push({ ...note, id: foundry.utils.randomID() });
    await saveNotes(notes);
  }

  static async #editNote(event, target) {
    if (!game.user.isGM) return;
    const notes = calendarNotes();
    const i = notes.findIndex(x => x.id === target.dataset.id);
    if (i < 0) return;
    const note = await noteDialog(notes[i], { canDelete: true });
    if (note === null) return;
    if (note === "delete") notes.splice(i, 1);
    else notes[i] = { ...notes[i], ...note };
    await saveNotes(notes);
  }
}

/** Ask for a note's text and how it repeats. Returns the note, "delete", or null. */
async function noteDialog(note, { canDelete = false } = {}) {
  const content = `<p>${esc(C.dateText({ ...note, weekday: (note.day - 1) % 7 }))}</p>
    <div class="form-group"><label>Note</label><input type="text" name="text" value="${esc(note.text)}" autofocus></div>
    <div class="form-group"><label>Every year</label><input type="checkbox" name="yearly" ${note.yearly ? "checked" : ""}></div>
    <div class="form-group"><label>Hidden from players</label><input type="checkbox" name="gmOnly" ${note.gmOnly ? "checked" : ""}></div>`;
  const got = await DialogV2.wait({
    window: { title: canDelete ? "Calendar note" : "Add a note", icon: "fa-solid fa-note-sticky" }, classes: ["arneyan"], position: { width: 400 }, content,
    buttons: [
      { action: "ok", label: "Save", default: true, callback: (ev, btn) => ({ text: btn.form.elements.text.value.trim(), yearly: btn.form.elements.yearly.checked, gmOnly: btn.form.elements.gmOnly.checked }) },
      ...(canDelete ? [{ action: "delete", label: "Delete" }] : []),
      { action: "cancel", label: "Cancel" }
    ],
    rejectClose: false
  });
  if (got === "delete") return "delete";
  if (!got || typeof got !== "object" || !got.text) return null;
  return { year: note.year, month: note.month, day: note.day, ...got };
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

export function registerCalendar() {
  game.settings.register(SYS, "calendarNotes", { scope: "world", config: false, type: Array, default: [], onChange: () => ArneyanCalendar.refresh() });
  // Where the date stands against world time (Set date without time passing); the clock redraws with it.
  game.settings.register(SYS, "dateOffset", { scope: "world", config: false, type: Number, default: 0, onChange: () => { ArneyanCalendar.refresh(); Hooks.callAll("arneyanDateChanged"); } });
  game.settings.register(SYS, "eyeStart", {
    name: "The Dark Moon first rose", hint: "The date it first rose (\"1 Lathos 504\"); its six-month cycles count from it. Blank: the calendar doesn't show it.",
    scope: "world", config: true, type: String, default: "1 Lathos 504", onChange: v => {
      ArneyanCalendar.refresh();
      if (String(v ?? "").trim() && parseDate(v) === null && game.user.isGM) ui.notifications.warn(`"${v}" isn't a date the calendar can read: write it as "1 Lathos 504".`);
    }
  });
  Hooks.on("updateWorldTime", () => ArneyanCalendar.refresh());
}

/**
 * The Arneyan calendar, in place of Simple Calendar: the Tobiasian Calendar from the Kanka wiki (twelve 30-day months
 * named for the Tarielian gods, weeks that start again each month, years AC), Elnaris's phases, Tharizdun's Eye on
 * its six-month cycle, the festivals and the wiki's dated events, and the GM's own notes.
 *
 * It is Foundry's world calendar too (CONFIG.time), so the game clock, rests, light and travel all read the date from
 * it. The window opens from the clock (the calendar icon) or game.arneyan.calendar().
 */
import * as C from "./calendar-data.mjs";
import { registerKanka, kankaDialog, kankaEvents } from "./kanka.mjs";
import * as RT from "./realtime.mjs";

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

/** The date and time of a world time (now, with the real-time clock's running seconds), from the calendar's arithmetic. */
export function whenOf(t = RT.liveWorldTime()) {
  t += dateOffset();
  const n = Math.floor(t / DAY);
  const secs = ((t % DAY) + DAY) % DAY;
  return { ...C.dateOf(n), n, hour: Math.floor(secs / 3600), minute: Math.floor((secs % 3600) / 60), second: Math.floor(secs % 60), secondOfDay: secs };
}

/** Minutes since midnight on the calendar (for daylight). */
export function minuteOfDay(t = game.time?.worldTime ?? 0) {
  return Math.floor(whenOf(t).secondOfDay / 60);
}

const two = n => String(n).padStart(2, "0");
/** "14:05:09". */
export const timeText = w => `${two(w.hour)}:${two(w.minute)}:${two(w.second)}`;

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

/** The time and clock part: running or not, the GM's controls, daylight. */
function clockContext(now) {
  const dl = RT.daylight();
  const scene = globalThis.canvas?.scene ?? null;
  const runs = RT.clockRuns(), live = RT.clockLive();
  return {
    time: timeText(now), runs, live,
    state: !runs ? "Stopped" : game.paused ? "Paused (the game is paused)" : !live ? "Held while a combat runs" : RT.clockRate() === 1 ? "Running in real time" : `Running, ${RT.clockRate()}× real time`,
    rate: RT.clockRate(),
    rates: [[1, "Real time"], [2, "2×"], [6, "6×"], [10, "10×"], [60, "1 min a second"]].map(([value, label]) => ({ value, label, selected: value === RT.clockRate() })),
    combatPause: (() => { try { return game.settings.get(SYS, "clockCombatPause"); } catch { return true; } })(),
    part: RT.partOfDay(Math.floor(now.secondOfDay / 60), dl),
    points: RT.dayPoints(dl).map(p => ({ ...p, time: RT.hmText(p.minute) })),
    moves: [[-DAY, "−1 day"], [-3600, "−1 h"], [-600, "−10 min"], [-60, "−1 min"], [60, "+1 min"], [600, "+10 min"], [3600, "+1 h"], [DAY, "+1 day"]].map(([s, label]) => ({ s, label, back: s < 0 })),
    daylight: { ...dl, dawnText: RT.hmText(dl.dawn), dayText: RT.hmText(dl.day), duskText: RT.hmText(dl.dusk), nightText: RT.hmText(dl.night),
      darkNow: RT.darknessAt(Math.floor(now.secondOfDay / 60), dl) },
    scene: scene ? { name: scene.name, follows: RT.sceneFollows(scene) } : null
  };
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

  /** Redraw it if open (the clock moved, notes changed). `ifChanged`: only if the day or the part of the day did. */
  static refresh({ ifChanged = false } = {}) {
    const app = ArneyanCalendar.#instance;
    if (!app?.rendered) return;
    if (ifChanged) {
      const w = whenOf();
      const key = `${w.n}|${RT.partOfDay(Math.floor(w.secondOfDay / 60), RT.daylight())}`;
      if (key === app._shownKey) return;
    }
    app.render();
  }

  /** Where the window was left (this browser), for the next time it opens. */
  setPosition(pos) {
    const out = super.setPosition(pos);
    clearTimeout(this._posSave);
    this._posSave = setTimeout(() => {
      if (this.minimized) return;
      const { left, top, width } = this.position ?? {};
      if (Number.isFinite(left) && Number.isFinite(top)) game.settings.set(SYS, "calendarPos", { left, top, width }).catch(() => null);
    }, 400);
    this._posSave?.unref?.();
    return out;
  }

  _initializeApplicationOptions(options) {
    const o = super._initializeApplicationOptions(options);
    try {
      const p = game.settings.get(SYS, "calendarPos");
      if (p && Number.isFinite(p.left) && Number.isFinite(p.top)) Object.assign(o.position, { left: Math.max(0, Math.min(p.left, window.innerWidth - 200)), top: Math.max(0, Math.min(p.top, window.innerHeight - 100)), ...(Number.isFinite(p.width) ? { width: p.width } : {}) });
    } catch { /* first time: Foundry places it */ }
    return o;
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
      move: ArneyanCalendar.#moveTime,
      toPoint: ArneyanCalendar.#toPoint,
      setTime: ArneyanCalendar.#setTime,
      toggleClock: ArneyanCalendar.#toggleClock,
      saveDaylight: ArneyanCalendar.#saveDaylight,
      addNote: ArneyanCalendar.#addNote,
      kanka: ArneyanCalendar.#kanka,
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
    // The events pulled from Kanka, once the GM has; until then the ones the calendar came with.
    const events = kankaEvents();
    const start = eyeStart();
    const first = C.dayNumber(view.year, view.month, 1);
    const days = [];
    for (let d = 1; d <= C.DAYS_IN_MONTH; d++) {
      const n = first + d - 1;
      const moon = C.elnaris(n);
      const things = C.onDay(view.year, view.month, d, { notes, gm, events });
      const eye = C.eye(n, start);
      days.push({
        d, n, today: n === now.n, picked: n === this.picked, past: n < now.n,
        moon: moon.full || moon.new || moon.quarter ? { icon: MOON_ICON[moon.index], label: `Elnaris: ${moon.phase}`, cls: moon.full ? "full" : moon.new ? "new" : "quarter" } : null,
        // Anything hidden from players shows as such on the GM's calendar.
        things: things.map(t => ({ ...t, icon: t.gmOnly ? "fa-solid fa-eye-slash" : { festival: "fa-solid fa-star", event: "fa-solid fa-bookmark", note: "fa-solid fa-note-sticky" }[t.kind] })),
        eyeWatching: !!eye?.watching
      });
    }
    // Weeks start again each month: rows of seven, the last one short.
    const weeks = [];
    for (let i = 0; i < days.length; i += C.WEEKDAYS.length) weeks.push(days.slice(i, i + C.WEEKDAYS.length));
    const pickedN = this.picked ?? now.n;
    const pd = C.dateOf(pickedN);
    const pickedThings = C.onDay(pd.year, pd.month, pd.day, { notes, gm, events });
    const moon = C.elnaris(pickedN);
    const eye = C.eye(pickedN, start);
    return {
      gm, weekdays: C.WEEKDAYS, weeks,
      monthName: C.MONTHS[view.month - 1], god: C.MONTH_GODS[view.month - 1], year: view.year, suffix: C.SUFFIX,
      season: C.seasonOf(view.month, 1),
      nowText: whenText(), isNowMonth: view.year === now.year && view.month === now.month,
      picked: {
        n: pickedN, text: C.dateText(pd), season: C.seasonOf(pd.month, pd.day), moon: moon.phase, isToday: pickedN === now.n,
        things: pickedThings.map(t => ({ ...t, kindLabel: `${t.kind === "festival" && t.every === "month" ? "Every month" : { festival: "Every year", event: "Event", note: "Note" }[t.kind]}${t.gmOnly ? " (hidden from players)" : ""}` })),
        // Most people call it the Dark Moon; its true name is the GM's to give out.
        eye: eye ? { ...eye, label: gm ? `Tharizdun's Eye: ${eye.phase} (cycle ${eye.cycle})` : `The Dark Moon: ${eye.phase}` } : null
      },
      eyeSet: start != null,
      clock: clockContext(now)
    };
  }



  _onRender(context, options) {
    super._onRender?.(context, options);
    const w = whenOf();
    this._shownKey = `${w.n}|${RT.partOfDay(Math.floor(w.secondOfDay / 60), RT.daylight())}`;
    // The Daylight panel stays as the GM left it across redraws.
    const det = this.element.querySelector(".arn-cal-daylight");
    if (det && this._dlOpen !== undefined) det.open = this._dlOpen;
    det?.addEventListener("toggle", () => { this._dlOpen = det.open; });
    // The clock's speed, its combat hold and the scene's daylight save as soon as they change (GM).
    const on = (sel, fn) => this.element.querySelector(sel)?.addEventListener("change", ev => fn(ev.currentTarget));
    on('select[name="clockRate"]', el => game.settings.set(SYS, "clockRate", Number(el.value) || 1));
    on('input[name="clockCombat"]', el => game.settings.set(SYS, "clockCombatPause", el.checked));
    // Daylight times and darkness save as they change (nothing to lose on the next redraw).
    // The field the GM moved on to keeps the focus through the redraw the save brings.
    for (const n of ["dl-dawn", "dl-day", "dl-dusk", "dl-night", "dl-dark", "dl-light"]) on(`input[name="${n}"]`, () => setTimeout(() => {
      const next = document.activeElement;
      this._refocus = next && this.element?.contains(next) ? next.name : null;
      ArneyanCalendar.#saveDaylight.call(this);
    }, 0));
    if (this._refocus) {
      const f = this.element.querySelector(`[name="${this._refocus}"]`);
      this._refocus = null;
      if (f) { f.focus(); f.select?.(); }
    }
    // The seconds run on the window (and the minute, part of day and the like on the next full redraw).
    clearInterval(this._secTimer);
    this._secTimer = setInterval(() => {
      const el = this.element?.querySelector?.(".arn-cal-clock-time");
      if (!el) return clearInterval(this._secTimer);
      const w = whenOf();
      el.textContent = timeText(w);
      const now = this.element.querySelector(".arn-cal-now");
      if (now) now.textContent = whenText();
      const dark = this.element.querySelector(".arn-cal-dark-now");
      if (dark) dark.textContent = String(RT.darknessAt(Math.floor(w.secondOfDay / 60), RT.daylight()));
    }, 500);
    this._secTimer?.unref?.();
  }

  _onClose(options) {
    clearInterval(this._secTimer);
    super._onClose?.(options);
  }

  /** GM: the time back or on by a step (on: time passes; back: the clock is wound back, nothing undoes). */
  static async #moveTime(event, target) {
    await RT.moveTime(Number(target.dataset.s));
  }

  /** GM: to dawn, midday, dusk or midnight of this day (back or on, as the buttons above). */
  static async #toPoint(event, target) {
    const w = whenOf();
    await RT.moveTime(RT.secondsTo(w.secondOfDay, Number(target.dataset.minute)));
  }

  /** GM: the time of day typed in ("14:30" or "14:30:15"), this day. */
  static async #setTime() {
    const v = String(this.element.querySelector('input[name="clockSet"]')?.value ?? "").trim();
    const m = v.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3] ?? 0) > 59) return ui.notifications.warn("Type a time as 14:30 or 14:30:15.");
    const w = whenOf();
    await RT.moveTime(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0) - w.secondOfDay);
  }

  /** GM: start or stop the clock running in real time. */
  static async #toggleClock() {
    if (!game.user.isGM) return;
    await RT.setClockRuns(!RT.clockRuns());
  }

  /** GM: the daylight settings from the form (on or off, the four times, how dark the night and the day). */
  static async #saveDaylight() {
    if (!game.user.isGM) return;
    const el = this.element;
    const val = n => el.querySelector(`[name="${n}"]`);
    const times = Object.fromEntries(["dawn", "day", "dusk", "night"].map(k => [k, RT.parseHM(val(`dl-${k}`)?.value)]));
    const bad = Object.entries(times).filter(([, v]) => v === null).map(([k]) => k);
    if (bad.length) return ui.notifications.warn(`Type the times as 06:30 (${bad.join(", ")}).`);
    const cfg = RT.cleanDaylight({ on: true, ...times, dark: Number(val("dl-dark")?.value), light: Number(val("dl-light")?.value) });
    await game.settings.set(SYS, "daylight", cfg);
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
    // Worked out once the running clock's unsaved seconds are saved, so the date lands on the time typed.
    const warn = await RT.queued(async () => {
      const world = game.time.worldTime ?? 0;
      const dt = t - (world + dateOffset());
      if (got.pass) {
        if (dt < 0) return true;
        if (dt) await game.time.advance(dt);
      } else if (dt) await game.settings.set(SYS, "dateOffset", t - world);
      return false;
    });
    if (warn) return ui.notifications.warn("Time can't pass backwards: untick \"Time passes\" to move the date back.");
    this.view = null;
    this.picked = null;
    this.render();
  }

  /** GM: the Kanka window (pull the wiki's events and date, send this date to Kanka). */
  static async #kanka() {
    await kankaDialog({ today: () => whenOf(), setToday: d => setCalendarDate(d) });
    this.view = null;
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

/** Move the calendar to a date, keeping the time of day, without time passing (the date offset). GM only. */
export async function setCalendarDate({ year, month, day }) {
  if (!game.user.isGM) return;
  await RT.queued(async () => {
    const world = game.time.worldTime ?? 0;
    const now = whenOf(world);
    const t = C.dayNumber(year, month, day) * DAY + now.secondOfDay;
    await game.settings.set(SYS, "dateOffset", t - world);
  });
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
  game.settings.register(SYS, "calendarPos", { scope: "client", config: false, type: Object, default: null, nullable: true });
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
  // The running clock saves every few seconds: the window redraws only when the day or the part of the day changes
  // (its seconds run by themselves), so what the GM is typing isn't wiped.
  Hooks.on("updateWorldTime", () => ArneyanCalendar.refresh({ ifChanged: true }));
  Hooks.on("arneyanClockChanged", () => ArneyanCalendar.refresh());
  Hooks.on("canvasReady", () => ArneyanCalendar.refresh());
  RT.registerRealtime();
  registerKanka({ today: () => whenOf(), refresh: () => ArneyanCalendar.refresh() });
}

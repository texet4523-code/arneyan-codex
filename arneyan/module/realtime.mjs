/**
 * The clock in real time, and daylight on the scenes (0.10.39).
 *
 * Real time: while it runs, game time passes with real time (a second a second, or faster) unless the game is paused
 * or, by default, a combat is running (combat counts its own rounds). The active GM's client moves the world clock on
 * every few seconds; every client shows the time between those moves itself, so the calendar's seconds tick smoothly.
 *
 * Daylight: when it's on, the scene being viewed darkens and brightens with the time of day: full dark at night, light
 * by day, and a gradual change from dawn to full day and from dusk to full night. A scene can be left out (indoors,
 * underground). Times are minutes after midnight.
 */
const SYS = "arneyan";
const DAY = 86400;

/* -------------------------------------------- */
/*  Pure parts                                  */
/* -------------------------------------------- */

/** The daylight settings as they start: dawn 06:00, full day 08:00, dusk 18:00, full night 20:00. */
export const DAYLIGHT_DEFAULT = { on: false, dawn: 360, day: 480, dusk: 1080, night: 1200, dark: 1, light: 0 };

/** "06:30" → 390, "6" → 360, or null. */
export function parseHM(v) {
  const m = String(v ?? "").trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  return h <= 24 && min < 60 && h * 60 + min <= 1440 ? h * 60 + min : null;
}

/** 390 → "06:30". */
export function hmText(minutes) {
  const t = ((Math.round(Number(minutes) || 0) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** The settings put right: times in order (dawn before day before dusk before night), darkness between 0 and 1. */
export function cleanDaylight(cfg = {}) {
  const c = { ...DAYLIGHT_DEFAULT, ...(cfg ?? {}) };
  const t = k => Math.clamp(Math.round(Number(c[k]) || 0), 0, 1440);
  let dawn = t("dawn"), day = t("day"), dusk = t("dusk"), night = t("night");
  day = Math.max(day, dawn);
  dusk = Math.max(dusk, day);
  night = Math.max(night, dusk);
  const dark = Math.clamp(Number(c.dark ?? 1), 0, 1), light = Math.clamp(Number(c.light ?? 0), 0, 1);
  return { on: !!c.on, dawn, day, dusk, night, dark, light };
}

/** How dark it is at this minute of the day (0 light to 1 dark): night, dawn rising, day, dusk falling, night. */
export function darknessAt(minute, cfg = DAYLIGHT_DEFAULT) {
  const c = cleanDaylight(cfg);
  const m = ((Number(minute) % 1440) + 1440) % 1440;
  const lerp = (a, b, f) => Math.round((a + (b - a) * Math.clamp(f, 0, 1)) * 100) / 100;
  if (m < c.dawn || m >= c.night) return c.dark;
  if (m < c.day) return lerp(c.dark, c.light, (m - c.dawn) / Math.max(1, c.day - c.dawn));
  if (m < c.dusk) return c.light;
  return lerp(c.light, c.dark, (m - c.dusk) / Math.max(1, c.night - c.dusk));
}

/** The part of the day it is: "Night", "Dawn", "Day" or "Dusk". */
export function partOfDay(minute, cfg = DAYLIGHT_DEFAULT) {
  const c = cleanDaylight(cfg);
  const m = ((Number(minute) % 1440) + 1440) % 1440;
  if (m < c.dawn || m >= c.night) return "Night";
  if (m < c.day) return "Dawn";
  if (m < c.dusk) return "Day";
  return "Dusk";
}

/** The points of the day the calendar's buttons go to, in minutes: dawn, midday (12:00), dusk and midnight. */
export function dayPoints(cfg = DAYLIGHT_DEFAULT) {
  const c = cleanDaylight(cfg);
  return [{ id: "dawn", label: "Dawn", minute: c.dawn }, { id: "midday", label: "Midday", minute: 720 }, { id: "dusk", label: "Dusk", minute: c.dusk }, { id: "midnight", label: "Midnight", minute: 0 }];
}

/** Seconds from a time of day to a point of the same day (negative when that point has gone: midnight is the start). */
export function secondsTo(secondsOfDay, minute) {
  return minute * 60 - (((Number(secondsOfDay) % DAY) + DAY) % DAY);
}

/**
 * Real seconds into game seconds, between the GM's saves: carries what's left over, never more than `cap` real
 * seconds at once (a laptop that slept doesn't jump the clock hours on).
 */
export function accrue(carry, realSeconds, rate = 1, cap = 30) {
  const total = (Number(carry) || 0) + Math.clamp(Number(realSeconds) || 0, 0, cap) * Math.max(0, Number(rate) || 0);
  const whole = Math.floor(total);
  return { advance: whole, carry: total - whole };
}

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

const get = (k, d) => { try { return game.settings.get(SYS, k) ?? d; } catch { return d; } };
export const clockRuns = () => !!get("clockRuns", false);
export const clockRate = () => Math.max(0, Number(get("clockRate", 1)) || 0);
export const daylight = () => cleanDaylight(get("daylight", DAYLIGHT_DEFAULT));
const pauseInCombat = () => !!get("clockCombatPause", true);
/** Save the clock every this many seconds of real time (the clients show the time in between). */
export const SAVE_EVERY = 10;

/** Is the clock running right now (on, not paused, no combat holding it)? */
export function clockLive() {
  if (!clockRuns() || game.paused) return false;
  if (pauseInCombat() && game.combats?.some?.(c => c.started)) return false;
  return true;
}

/* -------------------------------------------- */
/*  Every client: the time between saves        */
/* -------------------------------------------- */

let lastSaved = { world: 0, at: 0 };
function noteWorldTime() { lastSaved = { world: game.time?.worldTime ?? 0, at: performance.now() }; }

/** The world time as of this moment: the last saved time plus what has run since (while the clock runs). */
export function liveWorldTime() {
  const world = game.time?.worldTime ?? 0;
  if (!clockLive() || lastSaved.world !== world) return world;
  const since = (performance.now() - lastSaved.at) / 1000;
  return world + Math.floor(Math.min(since, SAVE_EVERY + 5) * clockRate());
}

/* -------------------------------------------- */
/*  The GM's client: moving the clock on        */
/* -------------------------------------------- */

let ticker = null, carry = 0, lastTick = 0, saving = false, pending = 0;
const isClockKeeper = () => !!game.users?.activeGM?.isSelf;

async function tick() {
  const now = performance.now();
  const real = (now - lastTick) / 1000;
  lastTick = now;
  if (!isClockKeeper()) { carry = 0; pending = 0; return; }
  // Stopped (a combat started, the clock switched off): what had run is saved, and nothing more counts.
  if (!clockLive()) { carry = 0; if (pending) await flush(); return; }
  const { advance, carry: left } = accrue(carry, real, clockRate());
  carry = left;
  pending += advance;
  if (pending >= SAVE_EVERY * Math.max(1, clockRate()) && !saving) await flush();
}

/** Save the time that has run (on a pause, a stop, or every few seconds). */
async function flush() {
  if (!pending || saving || !isClockKeeper()) return;
  saving = true;
  const n = pending;
  pending = 0;
  try { await game.time.advance(n); } catch (err) { console.warn("Arneyan | real-time clock", err); } finally { saving = false; }
}

function startTicker() {
  if (ticker) return;
  lastTick = performance.now();
  ticker = setInterval(() => tick().catch(() => null), 1000);
  ticker?.unref?.();
}

/** Start or stop the clock (GM). */
export async function setClockRuns(on) {
  if (!game.user.isGM) return;
  if (!on) await flush();
  await game.settings.set(SYS, "clockRuns", !!on);
}

/** Move the time on (time passes) or wind it back (the date and time move, nothing that was counting undoes). GM. */
export async function moveTime(seconds) {
  if (!game.user.isGM) return;
  const s = Math.round(Number(seconds) || 0);
  if (!s) return;
  await flush();
  if (s > 0) return game.time.advance(s);
  const off = Number(get("dateOffset", 0)) || 0;
  return game.settings.set(SYS, "dateOffset", off + s);
}

/* -------------------------------------------- */
/*  Daylight on the scene                       */
/* -------------------------------------------- */

/** Does this scene follow the time of day? (A scene can be left out: indoors, underground.) */
export const sceneFollows = scene => !!scene && !scene.getFlag?.(SYS, "noDaylight");

/** The scene's darkness now (either Foundry's shape). */
function sceneDarkness(scene) {
  return Number(scene?.environment?.darknessLevel ?? scene?.darkness ?? 0);
}

let lastDark = null;
/** Set the viewed scene's darkness for the time of day (the active GM's client). */
export async function applyDaylight({ force = false } = {}) {
  if (!isClockKeeper()) return;
  const cfg = daylight();
  const scene = globalThis.canvas?.scene;
  if (!cfg.on || !sceneFollows(scene)) return;
  const { minuteOfDay } = await import("./calendar.mjs");
  const target = darknessAt(minuteOfDay(), cfg);
  const cur = sceneDarkness(scene);
  if (!force && Math.abs(cur - target) < 0.01 && lastDark === target) return;
  lastDark = target;
  if (Math.abs(cur - target) < 0.005) return;
  const key = scene.environment ? "environment.darknessLevel" : "darkness";
  await scene.update({ [key]: target }, { animateDarkness: Math.abs(cur - target) > 0.2 ? 3000 : 1000 }).catch(err => console.warn("Arneyan | daylight", err));
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

export function registerRealtime() {
  const refresh = () => Hooks.callAll("arneyanClockChanged");
  game.settings.register(SYS, "clockRuns", { scope: "world", config: false, type: Boolean, default: false, onChange: () => { noteWorldTime(); refresh(); } });
  game.settings.register(SYS, "clockRate", { scope: "world", config: false, type: Number, default: 1, onChange: () => { noteWorldTime(); refresh(); } });
  game.settings.register(SYS, "clockCombatPause", { scope: "world", config: false, type: Boolean, default: true, onChange: refresh });
  game.settings.register(SYS, "daylight", { scope: "world", config: false, type: Object, default: DAYLIGHT_DEFAULT, onChange: () => { lastDark = null; applyDaylight({ force: true }); refresh(); } });
  Hooks.on("updateWorldTime", () => { noteWorldTime(); applyDaylight(); });
  Hooks.on("arneyanDateChanged", () => applyDaylight());
  Hooks.on("canvasReady", () => { lastDark = null; applyDaylight({ force: true }); });
  Hooks.on("updateScene", (scene, changes) => { if (foundry.utils.hasProperty(changes, `flags.${SYS}.noDaylight`)) { lastDark = null; applyDaylight({ force: true }); } });
  // A pause saves the time run so far; unpausing starts counting afresh.
  Hooks.on("pauseGame", paused => { if (paused) flush(); lastTick = performance.now(); noteWorldTime(); refresh(); });
  for (const h of ["combatStart", "deleteCombat", "updateCombat"]) Hooks.on(h, () => { noteWorldTime(); refresh(); });
  Hooks.once("ready", () => { noteWorldTime(); startTicker(); });
}

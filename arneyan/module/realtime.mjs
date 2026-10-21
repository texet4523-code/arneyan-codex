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
 * seconds at once: enough for a browser that checks a tab in the background once a minute, not so much that a laptop
 * that slept jumps the clock hours on.
 */
export function accrue(carry, realSeconds, rate = 1, cap = 300) {
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
  // No GM connected, nobody saves the clock: show the saved time rather than run ahead and jump back.
  if (!clockLive() || lastSaved.world !== world || !game.users?.activeGM) return world;
  const since = (performance.now() - lastSaved.at) / 1000;
  // Up to two minutes: the GM's tab in the background may save only once a minute.
  return world + Math.floor(Math.min(since, 120) * clockRate());
}

/* -------------------------------------------- */
/*  The GM's client: moving the clock on        */
/* -------------------------------------------- */

let ticker = null, carry = 0, lastTick = 0, pending = 0, flushing = false;
const isClockKeeper = () => !!game.users?.activeGM?.isSelf;

/**
 * Every change this system makes to the world clock goes through here, one after another, with the seconds the
 * running clock has counted but not yet saved folded into the same change: two changes made at once would each
 * start from the same saved time, and one would undo the other. `fn` runs after those seconds are saved.
 */
let chain = Promise.resolve();
export function queued(fn = () => null) { // fn must not call queued() or advance() itself: it would wait on itself
  const run = chain.then(async () => {
    const n = pending;
    pending = 0;
    if (n) await game.time.advance(n);
    return fn();
  });
  chain = run.catch(err => console.warn("Arneyan | game clock", err));
  return run;
}

/** Move the world clock on by `seconds` (GM), in turn with the running clock. */
export function advance(seconds) {
  const n = Math.round(Number(seconds) || 0);
  return queued(() => (n ? game.time.advance(n) : null));
}

async function tick() {
  const now = performance.now();
  const real = (now - lastTick) / 1000;
  lastTick = now;
  if (!isClockKeeper()) { carry = 0; pending = 0; return; }
  // Stopped (a combat started, the clock switched off): what had run is saved, and nothing more counts.
  if (!clockLive()) { carry = 0; if (pending) await flush(); return; }
  const { advance: n, carry: left } = accrue(carry, real, clockRate());
  carry = left;
  pending += n;
  if (pending >= SAVE_EVERY * Math.max(1, clockRate())) await flush();
}

/** Save the time that has run (every few seconds, on a pause or a stop). */
async function flush() {
  if (!pending || flushing || !isClockKeeper()) return;
  flushing = true;
  try { await queued(); } finally { flushing = false; }
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
  if (s > 0) return advance(s);
  return queued(() => game.settings.set(SYS, "dateOffset", (Number(get("dateOffset", 0)) || 0) + s));
}

/* -------------------------------------------- */
/*  Daylight on the scene                       */
/* -------------------------------------------- */

/** Does this scene follow the time of day? (A scene can be left out: indoors, underground.) Locked darkness is left be. */
export const sceneFollows = scene => !!scene && !scene.getFlag?.(SYS, "noDaylight") && !scene.environment?.darknessLock;

/** The scene's darkness as saved (either Foundry's shape): while it animates, the prepared value lags behind. */
function sceneDarkness(scene) {
  const src = scene?._source ?? {};
  return Number(src.environment?.darknessLevel ?? src.darkness ?? scene?.environment?.darknessLevel ?? scene?.darkness ?? 0);
}
const darknessKey = scene => (scene.environment ? "environment.darknessLevel" : "darkness");

/**
 * The scenes daylight sets: the active GM's client sets the one the players are on and the one it is viewing; another
 * GM's client sets only the one that GM is viewing (when it isn't the players' scene).
 */
function daylightScenes() {
  const viewed = globalThis.canvas?.scene;
  if (!isClockKeeper()) return viewed && viewed !== game.scenes?.active ? [viewed] : [];
  return [...new Set([game.scenes?.active, viewed].filter(Boolean))];
}

/**
 * Set the scenes' darkness for the time of day (the active GM's client; another GM's sets the scene it views). The first time daylight takes a scene over,
 * its own darkness is kept, and put back when daylight is turned off or the scene is left out.
 */
// Daylight changes and putting darkness back run one after another, each reading the settings when its turn comes.
let lightChain = Promise.resolve();
const inTurn = fn => (lightChain = lightChain.then(fn).catch(err => console.warn("Arneyan | daylight", err)));

export function applyDaylight(opts = {}) {
  if (!game.user?.isGM || !game.users?.activeGM) return Promise.resolve();
  return inTurn(() => setDaylight(opts));
}

async function setDaylight({ force = false } = {}) {
  const cfg = daylight();
  const { minuteOfDay } = await import("./calendar.mjs");
  const target = darknessAt(minuteOfDay(), cfg);
  for (const scene of daylightScenes()) {
    if (!cfg.on || !sceneFollows(scene)) continue;
    const cur = sceneDarkness(scene);
    if (!force && Math.abs(cur - target) < 0.01) continue;
    const upd = { [darknessKey(scene)]: target };
    if (scene.getFlag(SYS, "darknessBefore") === undefined) upd[`flags.${SYS}.darknessBefore`] = cur;
    // A jump (the clock moved hours, a new scene) fades over a few seconds; the small steps of a running clock just apply.
    const fade = Math.abs(cur - target) > 0.2 ? { animateDarkness: 3000 } : {};
    await scene.update(upd, fade).catch(err => console.warn("Arneyan | daylight", err));
  }
}

/** Put back a scene's own darkness (daylight off, or the scene left out). */
export function restoreDarkness(scene) {
  return inTurn(() => putBack(scene));
}
async function putBack(scene) {
  const was = scene?.getFlag?.(SYS, "darknessBefore");
  if (!scene || was === undefined || !game.user.isGM) return;
  // Still followed (ticked again, or daylight back on, before this turn came): leave it to daylight.
  if (daylight().on && sceneFollows(scene)) return;
  await scene.update({ [darknessKey(scene)]: Number(was) || 0, [`flags.${SYS}.-=darknessBefore`]: null }, { animateDarkness: 2000 }).catch(err => console.warn("Arneyan | daylight", err));
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

export function registerRealtime() {
  const refresh = () => Hooks.callAll("arneyanClockChanged");
  game.settings.register(SYS, "clockRuns", { scope: "world", config: false, type: Boolean, default: false, onChange: () => { noteWorldTime(); refresh(); } });
  game.settings.register(SYS, "clockRate", { scope: "world", config: false, type: Number, default: 1, onChange: () => { noteWorldTime(); refresh(); } });
  game.settings.register(SYS, "clockCombatPause", { scope: "world", config: false, type: Boolean, default: true, onChange: refresh });
  game.settings.register(SYS, "daylight", { scope: "world", config: false, type: Object, default: DAYLIGHT_DEFAULT, onChange: async v => {
    // Turned off: the scenes it had taken over get their own darkness back (the active GM's client does it).
    if (!cleanDaylight(v).on && isClockKeeper()) for (const sc of game.scenes ?? []) if (sc.getFlag(SYS, "darknessBefore") !== undefined) await restoreDarkness(sc);
    applyDaylight({ force: true });
    refresh();
  } });
  Hooks.on("updateWorldTime", () => { noteWorldTime(); applyDaylight(); });
  Hooks.on("arneyanDateChanged", () => applyDaylight());
  Hooks.on("canvasReady", () => applyDaylight({ force: true }));
  Hooks.on("updateScene", (scene, changes) => {
    if (foundry.utils.hasProperty(changes, "active") && changes.active) applyDaylight({ force: true });
    if (!foundry.utils.hasProperty(changes, `flags.${SYS}.noDaylight`)) return;
    if (changes.flags[SYS].noDaylight) { if (isClockKeeper()) restoreDarkness(scene); }
    else applyDaylight({ force: true });
  });
  // A pause saves the time run so far; unpausing starts counting afresh.
  Hooks.on("pauseGame", paused => { if (paused) flush(); lastTick = performance.now(); noteWorldTime(); refresh(); });
  // A combat starting or ending holds or frees the clock.
  for (const h of ["combatStart", "deleteCombat"]) Hooks.on(h, () => { noteWorldTime(); refresh(); });
  Hooks.on("updateCombat", (c, changes) => { if ("round" in changes || "active" in changes) { noteWorldTime(); refresh(); } });
  Hooks.once("ready", () => { noteWorldTime(); startTicker(); });
}

/**
 * Active Effect durations across Foundry versions.
 *
 * v13 keeps the duration as `duration: { seconds, rounds, turns, startTime, startRound, startTurn, combat }`.
 * v14 moved it to `duration: { value, units, expiry, expired }` (units: years, months, days, hours, minutes,
 * seconds, rounds, turns) and the start to `start: { time, combat, combatant, initiative, round, turn }`.
 * `readDuration` reads either shape (from an effect, its source or creation data) as one plain object, and
 * `durationData` writes the shape the running version stores. Nothing here throws.
 */

const ROUND = 6;
const MINUTE = 60, HOUR = 3600, DAY = 86400;

const num = v => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(Number(v)) ? Number(v) : null;
const pos = v => { const n = num(v); return n !== null && n > 0 ? n : 0; };

/** Seconds in one of v14's time units (the world calendar's own lengths when it has them). */
export function unitSeconds(units) {
  let cal = null;
  try { cal = globalThis.game?.time?.calendar ?? null; } catch { cal = null; }
  const d = cal?.days ?? {};
  const spm = pos(d.secondsPerMinute) || MINUTE;
  const sph = spm * (pos(d.minutesPerHour) || 60);
  const spd = sph * (pos(d.hoursPerDay) || 24);
  const dpy = pos(d.daysPerYear) || 365;
  const months = cal?.months?.values?.length || 12;
  switch (String(units ?? "").toLowerCase()) {
    case "seconds": case "second": return 1;
    case "minutes": case "minute": return spm;
    case "hours": case "hour": return sph;
    case "days": case "day": return spd;
    case "months": case "month": return spd * dpy / months;
    case "years": case "year": return spd * dpy;
    default: return 0;
  }
}

/**
 * An effect's duration as { seconds, rounds, turns, startTime, startRound, startTurn, combat, shape } from either
 * shape. `src` is an ActiveEffect (its stored source is read), its source, creation data, or a bare duration
 * object. Missing parts are 0 (lengths) or null (start). `shape` is "v13", "v14" or null when there is none.
 */
export function readDuration(src) {
  const out = { seconds: 0, rounds: 0, turns: 0, startTime: null, startRound: null, startTurn: null, combat: null, shape: null };
  try {
    const obj = v => (v && typeof v === "object" ? v : null);
    const s = obj(src?._source) ?? obj(src) ?? {};
    const isBare = !("duration" in s) && ("value" in s || "units" in s || "seconds" in s || "rounds" in s || "turns" in s);
    const d = (isBare ? s : obj(s.duration)) ?? {};
    const st = isBare ? null : obj(s.start);
    // v13 lengths (also what a module may still pass to a v14 create, before Foundry migrates it).
    const legacy = pos(d.seconds) || pos(d.rounds) || pos(d.turns);
    if (legacy) {
      out.shape = "v13";
      out.seconds = pos(d.seconds);
      out.rounds = pos(d.rounds);
      out.turns = pos(d.turns);
    } else if (pos(d.value) && typeof d.units === "string") {
      out.shape = "v14";
      const v = pos(d.value), u = d.units.toLowerCase();
      if (u === "rounds" || u === "round") out.rounds = v;
      else if (u === "turns" || u === "turn") out.turns = v;
      else out.seconds = v * unitSeconds(u);
    }
    // Start: v13's duration.startTime/startRound/startTurn/combat, else v14's start.*. v14 fills start.time with 0
    // by default (and copies from items carry it), so 0 there counts as not set.
    const t13 = num(d.startTime);
    const t14 = num(st?.time);
    out.startTime = t13 !== null ? t13 : t14 ? t14 : null;
    out.startRound = num(d.startRound) ?? num(st?.round);
    out.startTurn = num(d.startTurn) ?? num(st?.turn);
    out.combat = d.combat ?? st?.combat ?? null;
  } catch { /* an unreadable duration is no duration */ }
  return out;
}

/** Does it carry a length at all? */
export const hasLength = dur => !!(dur && (dur.seconds > 0 || dur.rounds > 0 || dur.turns > 0));

/** Rounds a turns-only duration takes at most: one combatant's turn each, so many turns span fewer rounds. */
function turnsAsRounds(turns, combatId) {
  if (!(turns > 0)) return 0;
  let n = 0;
  try { n = globalThis.game?.combats?.get?.(combatId)?.turns?.length || 0; } catch { n = 0; }
  return Math.max(1, Math.ceil(turns / Math.max(1, n || 1)));
}

/** A duration's total length in world seconds (rounds and turns at `round` seconds a round), or 0. */
export function lengthSeconds(dur, round = ROUND) {
  if (!dur) return 0;
  if (dur.seconds > 0) return dur.seconds;
  const rounds = (dur.rounds || 0) + (dur.rounds > 0 ? 0 : turnsAsRounds(dur.turns, dur.combat));
  return rounds > 0 ? rounds * round : 0;
}

/** Is Foundry's stored duration the v14 shape? (generation 14+, or the schema says so). */
export function isV14Duration() {
  try {
    const gen = Number(globalThis.game?.release?.generation);
    if (Number.isFinite(gen) && gen > 0) return gen >= 14;
    const f = globalThis.foundry?.documents?.BaseActiveEffect?.schema?.fields?.duration?.fields;
    return !!(f && "units" in f);
  } catch { return false; }
}

/**
 * Duration data to create an effect with, in the shape the running Foundry stores: { rounds } or { seconds }
 * become { value, units } on v14. Rounds win when both are given. Returns null for no duration.
 */
export function durationData({ rounds = 0, seconds = 0 } = {}, v14 = isV14Duration()) {
  const r = Math.floor(pos(rounds)), s = Math.floor(pos(seconds));
  if (!r && !s) return null;
  if (v14) return r ? { value: r, units: "rounds" } : { value: s, units: "seconds" };
  return r ? { rounds: r } : { seconds: s };
}

/**
 * The stored duration after `changes.duration` (an update) applies to the effect's source, in whichever shape
 * the two use. A v13-shaped change on a v14 effect stands alone (Foundry migrates it the same way).
 */
export function mergedDuration(source, change) {
  const s = source && typeof source === "object" ? source : {};
  const c = change && typeof change === "object" ? change : {};
  const legacyKeys = ["seconds", "rounds", "turns", "startTime", "startRound", "startTurn"];
  const changeLegacy = legacyKeys.some(k => k in c);
  const sourceV14 = "units" in s || "value" in s;
  if (changeLegacy && sourceV14 && !("value" in c) && !("units" in c)) return { ...c };
  return { ...s, ...c };
}

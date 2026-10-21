/**
 * Game time (Drop 4). Effect durations in rounds, minutes, hours and days count down with the world clock
 * (game.time.worldTime), not only with combat rounds. A round is 6 seconds and 10 rounds make a minute (Codex,
 * Combat). An effect made with a duration gets `flags.arneyan.endsAt` (world seconds) when it is created; the GM's
 * client removes it once the clock passes that. While its own combat is running, the combat's rounds end it as before.
 *
 * Numbered timed conditions (Stunned 2) tick down with the clock too when their creature is not in a running combat.
 * A small clock shows the game time; the GM's buttons move it on (10 minutes, 1 hour, 8 hours for a rest, 1 day).
 */
import { readDuration, hasLength, lengthSeconds, mergedDuration } from "./duration.mjs";
import { liveWorldTime, clockRuns, clockLive, setClockRuns } from "./realtime.mjs";
export { readDuration, durationData } from "./duration.mjs";

const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const ROUND = 6;
export const MINUTE = 60;
export const HOUR = 3600;
export const DAY = 86400;
const UNIT = { round: ROUND, turn: ROUND, minute: MINUTE, hour: HOUR, day: DAY, week: 7 * DAY };

/** Seconds in a round (Foundry's setting, 6 by default, as in the Codex). */
export function roundSeconds() {
  return Number(globalThis.CONFIG?.time?.roundTime) || ROUND;
}

/* -------------------------------------------- */
/*  Reading durations from spell text           */
/* -------------------------------------------- */

const WORDS = { one: 1, an: 1, a: 1, two: 2, three: 3, four: 4, six: 6, ten: 10, twelve: 12 };
// "1 round per level", "10 minutes per level", "1 hour", "1 day/level", "for 1 minute". Dice ("1d4 rounds") are left out.
const DURATION_RE = /(?<![\w.])(\d+|one|an|a|two|three|four|six|ten|twelve)\s+(round|turn|minute|hour|day|week)s?(\s*(?:per|\/|a|each)\s*(?:caster\s+)?level)?/gi;
// Words that make a time something other than how long the spell lasts ("casting takes 1 hour", "after 1 week").
const NOT_DURATION = /\b(takes?|taking|another after|again after|the last|within|every|each|once per|cannot return for|again for|lasts? 1 round of study|at least|wait|in)\s*$/i;

/**
 * The durations a spell's text gives, as { n, unit, perLevel, seconds(cl) }. Several distinct ones means the
 * text is ambiguous (a reversed form, a rider), and callers should not guess.
 */
export function durationsInText(text) {
  const plain = String(text ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const out = [];
  for (const m of plain.matchAll(DURATION_RE)) {
    const before = plain.slice(Math.max(0, m.index - 24), m.index);
    if (NOT_DURATION.test(before)) continue;
    const n = Number(m[1]) || WORDS[m[1].toLowerCase()] || 1;
    const unit = m[2].toLowerCase() === "turn" ? "round" : m[2].toLowerCase();
    const perLevel = !!m[3];
    const key = `${n}|${unit}|${perLevel}`;
    if (out.some(d => d.key === key)) continue;
    out.push({ key, n, unit, perLevel, seconds: (cl = 1) => n * UNIT[unit] * (perLevel ? Math.max(1, cl) : 1) });
  }
  return out;
}

/** The one duration a spell's text gives (seconds at this caster level), or 0 when it gives none or several. */
export function spellDurationSeconds(text, cl = 1) {
  const list = durationsInText(text);
  return list.length === 1 ? list[0].seconds(cl) : 0;
}

/** "9 min", "1 h 30 min", "3 days": a span of game time for the sheet. */
export function formatSpan(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < MINUTE) return `${Math.max(1, Math.ceil(s / ROUND))} round${Math.ceil(s / ROUND) === 1 ? "" : "s"}`;
  if (s < HOUR) return `${Math.ceil(s / MINUTE)} min`;
  if (s < DAY) {
    const h = Math.floor(s / HOUR), m = Math.round((s % HOUR) / MINUTE);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(s / DAY), h = Math.round((s % DAY) / HOUR);
  return `${d} day${d === 1 ? "" : "s"}${h ? ` ${h} h` : ""}`;
}

/** The in-game date and time as text (the world calendar's own format if it has one). */
export function gameWhen(t = globalThis.game?.time ? liveWorldTime() : 0) {
  try {
    const cal = globalThis.game?.time?.calendar;
    // The Arneyan calendar's own format ("Tyrsday, 11 Ilmatria 503 AC, 14:05"), else the calendar's default.
    const f = globalThis.CONFIG?.time?.formatters?.arneyan ? cal?.format?.(t, "arneyan") : cal?.format?.(t);
    if (typeof f === "string" && f.trim()) return f;
  } catch { /* fall back below */ }
  const day = Math.floor(t / DAY) + 1;
  const hh = String(Math.floor((((t % DAY) + DAY) % DAY) / HOUR)).padStart(2, "0");
  const mm = String(Math.floor((((t % HOUR) + HOUR) % HOUR) / MINUTE)).padStart(2, "0");
  return `Day ${day}, ${hh}:${mm}`;
}

/* -------------------------------------------- */
/*  Expiry on effects                           */
/* -------------------------------------------- */

/**
 * When an effect being created should end, in world seconds, or null. `now` is the world time; `spellText` and
 * `cl` let a spell's own duration stand in when the effect carries none (only when the text gives exactly one).
 */
export function endsAtFor(data, now, { spellText = "", cl = 1, round = ROUND, source = null } = {}) {
  const f = data?.flags?.[SYS] ?? {};
  if (Number.isFinite(f.endsAt)) return f.endsAt;
  // Foundry's own duration, v13 { seconds, rounds, startTime } or v14 { value, units } + start.time. The
  // creation data may not carry it (or carry it migrated); the effect's own source then stands in.
  let d = readDuration(data);
  if (!hasLength(d) && source) d = readDuration(source);
  if (d.startTime === null && source) d.startTime = readDuration(source).startTime;
  const start = Number.isFinite(d.startTime) ? d.startTime : now;
  if (d.seconds > 0) return start + d.seconds;
  const rounds = Number(f.rounds) || d.rounds || 0;
  if (rounds > 0) return start + rounds * round;
  const span = lengthSeconds(d, round);
  if (span > 0) return start + span;
  if (spellText) {
    const s = spellDurationSeconds(spellText, cl);
    if (s > 0) return now + s;
  }
  return null;
}

/** Is this effect being timed by a combat that is still running? Then the combat's rounds end it. */
function timedByCombat(effect) {
  const x = effect.flags?.[SYS]?.expires;
  if (!x?.combat) return false;
  const c = game.combats?.get?.(x.combat);
  return !!c?.started;
}

/** Effects whose time has run out on this actor (not those a running combat is timing). */
export function expiredEffects(actor, now) {
  return (actor?.effects?.contents ?? []).filter(e => {
    const at = e.flags?.[SYS]?.endsAt;
    return Number.isFinite(at) && now >= at && !timedByCombat(e);
  });
}

/** Rounds of game time that passed in `dt` seconds (whole rounds only). */
export const roundsIn = (dt, round = ROUND) => Math.max(0, Math.floor((Number(dt) || 0) / round));

function inRunningCombat(actor) {
  return game.combats?.some?.(c => c.started && c.combatants.some(cb => cb.actor === actor || (cb.actorId === actor.id && cb.token?.actorLink))) ?? false;
}

/** Every actor in the world plus the unlinked tokens on the scenes. */
function allActors() {
  const out = [...(game.actors?.contents ?? [])];
  for (const scene of game.scenes ?? []) for (const t of scene.tokens) if (!t.actorLink && t.actor) out.push(t.actor);
  return out;
}

// One clock change at a time, in order (quick clicks on the clock queue up rather than being lost).
let queue = Promise.resolve();
function onWorldTime(worldTime, dt) {
  if (!game.users.activeGM?.isSelf) return;
  queue = queue.then(() => processTime(worldTime, dt));
  return queue;
}
async function processTime(worldTime, dt) {
  try {
    const rounds = roundsIn(dt, roundSeconds());
    for (const actor of allActors()) {
      if (!actor.effects?.size) continue;
      const gone = expiredEffects(actor, worldTime);
      const ids = gone.map(e => e.id).filter(id => actor.effects.has(id));
      if (ids.length) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", ids).catch(() => null);
        ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter(u => u.isGM).map(u => u.id),
          content: `<p><strong>${esc(actor.name)}</strong>: ${gone.map(e => esc(e.name)).join(", ")} ended (time ran out).</p>` });
      }
      // Numbered timed conditions outside combat lose a round for every round of game time.
      if (rounds > 0 && !inRunningCombat(actor)) await tickConditions(actor, rounds);
    }
  } catch (err) {
    console.warn("Arneyan | game time", err);
  }
}

async function tickConditions(actor, rounds) {
  const { conditionOf, counterKind, valueOf } = await import("./counters.mjs");
  const ended = [], down = [];
  for (const e of actor.effects.contents) {
    const id = conditionOf(e);
    if (!id || counterKind(id) !== "rounds") continue;
    const v = valueOf(e);
    if (!v) continue;
    if (v <= rounds) ended.push(e);
    else down.push([e, v - rounds]);
  }
  for (const [e, v] of down) await e.update({ [`flags.${SYS}.value`]: v }).catch(() => null);
  const ids = ended.map(e => e.id).filter(id => actor.effects.has(id));
  if (ids.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", ids).catch(() => null);
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter(u => u.isGM).map(u => u.id),
      content: `<p><strong>${esc(actor.name)}</strong>: ${ended.map(e => esc(e.name)).join(", ")} ended.</p>` });
  }
}

/** The caster level and text of the spell an effect came from, if it came from one. */
function spellSource(data, effect) {
  const origin = data?.origin ?? effect?.origin;
  if (!origin || typeof fromUuidSync !== "function") return null;
  let item = null;
  try { item = fromUuidSync(origin); } catch { item = null; }
  if (item?.type !== "spell") return null;
  const cl = Number(data?.flags?.[SYS]?.cl) || item.caster?.classLevel || item.actor?.system?.level || 1;
  return { text: item.system?.description ?? "", cl };
}

/**
 * The end time an update to an effect's own duration gives it (world seconds, or null when the duration was
 * cleared), or undefined when the update leaves the length alone (or sets endsAt itself). Either duration shape.
 */
export function endsAtAfterUpdate(effect, changes, now, round = ROUND) {
  if (!changes?.duration && !changes?.start) return undefined;
  const has = (o, k) => foundry.utils.hasProperty?.(o, k) ?? (k.split(".").reduce((x, y) => x?.[y], o) !== undefined);
  if (has(changes, `flags.${SYS}.endsAt`)) return undefined;
  const src = effect?._source ?? {};
  const oldDur = src.duration ?? effect?.duration ?? {};
  const before = readDuration({ duration: oldDur, start: src.start ?? null });
  const after = readDuration({
    duration: changes.duration ? mergedDuration(oldDur, changes.duration) : oldDur,
    start: changes.start ? { ...(src.start ?? {}), ...changes.start } : (src.start ?? null)
  });
  const len = d => lengthSeconds(d, round);
  if (len(after) === len(before) && after.startTime === before.startTime) return undefined;
  const start = Number.isFinite(after.startTime) ? after.startTime : now;
  return len(after) > 0 ? start + len(after) : null;
}

/** Time left on an effect, for the sheet ("8 min left"), or "". */
export function timeLeftLabel(effect, now = globalThis.game?.time?.worldTime ?? 0) {
  const at = effect?.flags?.[SYS]?.endsAt;
  if (!Number.isFinite(at)) return "";
  return `${formatSpan(at - now)} left`;
}

/* -------------------------------------------- */
/*  The clock                                   */
/* -------------------------------------------- */

export const STEPS = [
  { id: "10m", seconds: 10 * MINUTE, label: "+10 min", tip: "Move game time on 10 minutes" },
  { id: "1h", seconds: HOUR, label: "+1 h", tip: "Move game time on 1 hour" },
  { id: "8h", seconds: 8 * HOUR, label: "+8 h", tip: "8 hours: a long rest (use Rest on the party sheet for its benefits)" },
  { id: "1d", seconds: DAY, label: "+1 day", tip: "Move game time on 1 day" }
];

let clock = null;

function clockHtml() {
  const gm = game.user.isGM;
  const runs = clockRuns(), live = clockLive();
  const run = gm ? `<a class="arn-clock-run${live ? " on" : ""}" data-run data-tooltip="${runs ? (live ? "The clock runs in real time: click to stop it" : "The clock is held (the game is paused, or a combat runs): click to stop it") : "Run the clock in real time (it stops while the game is paused)"}"><i class="fa-solid ${runs ? "fa-pause" : "fa-play"}"></i></a>` : "";
  return `<a class="arn-clock-cal" data-calendar data-tooltip="The calendar"><i class="fa-solid fa-calendar-days"></i></a><span class="arn-clock-time" data-tooltip="Game time"><i class="fa-solid ${live ? "fa-hourglass-start" : "fa-hourglass-half"}"></i> ${esc(gameWhen())}</span>${run}
    ${gm ? `<span class="arn-clock-steps">${STEPS.map(s => `<a data-step="${s.id}" data-tooltip="${esc(s.tip)}">${esc(s.label)}</a>`).join("")}</span>` : ""}`;
}

function placeClock() {
  if (!clock) return;
  const players = document.getElementById("players");
  const r = players?.getBoundingClientRect?.();
  if (r && r.width) {
    clock.style.left = `${Math.round(r.left)}px`;
    clock.style.bottom = `${Math.round(window.innerHeight - r.top + 6)}px`;
  }
}

function renderClock() {
  const show = game.user.isGM || game.settings.get(SYS, "clockForPlayers");
  if (!show) { clock?.remove(); clock = null; return; }
  if (!clock) {
    clock = document.createElement("aside");
    clock.id = "arneyan-clock";
    clock.className = "arneyan";
    clock.addEventListener("click", ev => {
      if (ev.target.closest?.("[data-calendar]")) return game.arneyan?.calendar?.();
      if (ev.target.closest?.("[data-run]") && game.user.isGM) return setClockRuns(!clockRuns());
      const a = ev.target.closest?.("[data-step]");
      if (!a || !game.user.isGM) return;
      const step = STEPS.find(s => s.id === a.dataset.step);
      if (step) advanceTime(step.seconds);
    });
    document.body.append(clock);
  }
  clock.innerHTML = clockHtml();
  placeClock();
}

/** Move the world clock on (GM). */
export async function advanceTime(seconds) {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM moves game time on.");
  return game.time.advance(Number(seconds) || 0);
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

export function registerWorldTime() {
  game.settings.register(SYS, "clockForPlayers", {
    name: "Show the game clock to players", hint: "Players see the game date and time above the player list. Only the GM can move it on.",
    scope: "world", config: true, type: Boolean, default: true, onChange: () => renderClock()
  });

  // Effects made with a duration get an end time on the world clock.
  Hooks.on("preCreateActiveEffect", (effect, data) => {
    try {
      const now = game.time?.worldTime ?? 0;
      const src = spellSource(data, effect);
      const f = data.flags?.[SYS] ?? {};
      // A spell's own text is only read for the effects it puts on (and its concentration), never for plain conditions.
      const useText = !!src && !!(f.concentration || f.sourceName);
      const at = endsAtFor(data, now, { spellText: useText ? src.text : "", cl: src?.cl ?? 1, round: roundSeconds(), source: effect?._source ?? null });
      if (Number.isFinite(at) && at > now) effect.updateSource({ [`flags.${SYS}.endsAt`]: at });
    } catch (err) {
      console.warn("Arneyan | effect duration", err);
    }
  });
  // A duration typed into the effect's own settings later on counts too.
  Hooks.on("preUpdateActiveEffect", (effect, changes) => {
    try {
      const at = endsAtAfterUpdate(effect, changes, game.time?.worldTime ?? 0, roundSeconds());
      if (at !== undefined) foundry.utils.setProperty(changes, `flags.${SYS}.endsAt`, at);
    } catch (err) {
      console.warn("Arneyan | effect duration", err);
    }
  });

  Hooks.on("arneyanDateChanged", () => renderClock());
  Hooks.on("arneyanClockChanged", () => renderClock());
  // While the clock runs, the minute on show moves on between the GM's saves.
  let shown = "";
  setInterval(() => {
    if (!clock || !clockLive()) return;
    const text = gameWhen();
    if (text !== shown) { shown = text; renderClock(); }
  }, 1000)?.unref?.();
  Hooks.on("updateWorldTime", (worldTime, dt) => {
    renderClock();
    onWorldTime(worldTime, dt);
  });
  Hooks.once("ready", () => {
    renderClock();
    window.addEventListener("resize", placeClock);
    const players = document.getElementById("players");
    if (players && typeof ResizeObserver === "function") new ResizeObserver(placeClock).observe(players);
  });
  for (const hook of ["renderPlayers", "renderPlayerList", "collapseSidebar"]) Hooks.on(hook, () => setTimeout(placeClock, 50));
}

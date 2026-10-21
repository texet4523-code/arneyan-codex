/**
 * The Tobiasian Calendar (Kanka, The World of Arneyan): the twelve months of the Tarielian year, each named for a god
 * and 30 days long; a seven-day week that starts again with every month; years counted AC. Elnaris, the one moon, and
 * since 504 AC Tharizdun's Eye on its six-month cycle. Pure data and arithmetic: no Foundry here, so tests can run it.
 */

export const MONTHS = ["Lathos", "Chauntia", "Eldathia", "Sunevern", "Lliiran", "Selûnen", "Tymoran", "Brighen", "Tormenus", "Steadhelm", "Tyrannis", "Ilmatria"];
/** The god each month is named for (Arneyan lore, the Tarielian Pantheon). */
export const MONTH_GODS = ["Lathander", "Chauntea", "Eldath", "Sune", "Lliira", "Selûne", "Tymora", "Brigh", "Torm", "Helm", "Tyr", "Ilmater"];
export const WEEKDAYS = ["Moonday", "Toilday", "Wealday", "Tyrsday", "Fireday", "Starday", "Suneday"];
export const DAYS_IN_MONTH = 30;
export const DAYS_IN_YEAR = 360;
export const SUFFIX = "AC";

/** Seasons start on these days (month 1-12, day 1-30). */
export const SEASONS = [
  { name: "Spring", month: 1, day: 19 },
  { name: "Summer", month: 4, day: 21 },
  { name: "Autumn", month: 8, day: 20 },
  { name: "Winter", month: 10, day: 20 }
];

/** Every year (from `from` AC, if given). */
export const FESTIVALS = [
  { month: 1, day: 19, name: "Spring Equinox" },
  { month: 2, day: 30, name: "The Sowing Feast" },
  { month: 4, day: 21, name: "Summer Solstice" },
  { month: 5, day: 30, name: "Midsummer" },
  { month: 7, day: 15, name: "The First Harvest" },
  { month: 7, day: 30, name: "The Night of Masks" },
  { month: 8, day: 4, name: "Mournas Day", from: 500 },
  { month: 8, day: 20, name: "Autumn Equinox" },
  { month: 9, day: 30, name: "Highharvestide" },
  { month: 10, day: 20, name: "Winter Solstice" },
  { month: 12, day: 30, name: "Feast of the Moon" }
];

/** One-off events on the Kanka calendar. */
export const EVENTS = [
  { year: 406, month: 1, day: 3, name: "The Last Watch comes together in Ol' Town" },
  { year: 406, month: 8, day: 21, name: "The War for Tariel begins" },
  { year: 406, month: 11, day: 2, name: "The War for Tariel ends at Corellon's Eye" },
  { year: 499, month: 6, day: 13, name: "Planar Eclipse" },
  { year: 500, month: 5, day: 22, name: "First night of The Shattering" },
  { year: 500, month: 7, day: 2, name: "The Wayfinders are founded" },
  { year: 506, month: 6, day: 20, name: "Planar Eclipse" },
  { year: 513, month: 6, day: 28, name: "Planar Eclipse" }
];

/* -------------------------------------------- */
/*  Dates                                       */
/* -------------------------------------------- */

/** Days since 1 Lathos, 0 AC, for a date (month and day from 1). */
export const dayNumber = (year, month, day) => year * DAYS_IN_YEAR + (month - 1) * DAYS_IN_MONTH + (day - 1);

/** The date of a day number: { year, month, day, weekday } (month, day from 1; weekday 0 = Moonday). */
export function dateOf(n) {
  const year = Math.floor(n / DAYS_IN_YEAR);
  const inYear = n - year * DAYS_IN_YEAR;
  const month = Math.floor(inYear / DAYS_IN_MONTH) + 1;
  const day = inYear - (month - 1) * DAYS_IN_MONTH + 1;
  return { year, month, day, weekday: (day - 1) % WEEKDAYS.length };
}

/** The season a date falls in. */
export function seasonOf(month, day) {
  const at = (month - 1) * DAYS_IN_MONTH + (day - 1);
  const starts = SEASONS.map(s => ({ ...s, at: (s.month - 1) * DAYS_IN_MONTH + (s.day - 1) }));
  const before = starts.filter(s => s.at <= at);
  return (before.length ? before[before.length - 1] : starts[starts.length - 1]).name;
}

/** "Toilday, 11 Ilmatria 503 AC". */
export function dateText({ year, month, day, weekday }, { weekdayName = true } = {}) {
  return `${weekdayName ? `${WEEKDAYS[weekday]}, ` : ""}${day} ${MONTHS[month - 1]} ${year} ${SUFFIX}`;
}

/* -------------------------------------------- */
/*  Elnaris                                     */
/* -------------------------------------------- */

export const ELNARIS_CYCLE = 30.45;
const ELNARIS_OFFSET = 6;
/** Phases as Kanka names them, in order from full. */
export const PHASES = ["Full moon", "Waning gibbous", "Last quarter", "Waning crescent", "New moon", "Waxing crescent", "First quarter", "Waxing gibbous"];

/**
 * Elnaris on a day, matching the Kanka calendar's own display: full when (day number + 6) mod 30.45 < 1, new half a cycle
 * later. Returns { phase, index (0 full .. 4 new), fraction (0 full .. 0.5 new .. 1), full, new }.
 */
export function elnaris(n) {
  const x = (((n + ELNARIS_OFFSET) % ELNARIS_CYCLE) + ELNARIS_CYCLE) % ELNARIS_CYCLE;
  const fraction = x / ELNARIS_CYCLE;
  // Each named phase falls on one day, an eighth of the cycle apart, as Kanka marks them; the days between are
  // gibbous or crescent.
  const step = ELNARIS_CYCLE / 8;
  const k = Math.floor(x / step) % 8;
  const exact = x - k * step < 1;
  const index = exact ? k : k % 2 ? k : (k + 1) % 8;
  return { phase: PHASES[index], index, fraction, full: exact && k === 0, new: exact && k === 4, quarter: exact && (k === 2 || k === 6) };
}

/* -------------------------------------------- */
/*  Tharizdun's Eye                             */
/* -------------------------------------------- */

/** The Eye's phases over its six-month cycle (Kanka: Opening months 1-2, Watching month 3, Receding months 4-6). */
export const EYE_PHASES = [
  { name: "Opening", months: 2, text: "Growing from a dark point to clearly visible at night. Minor chaotic surges begin." },
  { name: "Watching", months: 1, text: "Full, and visible even by day. Chaotic magic at its peak." },
  { name: "Receding", months: 3, text: "Shrinking back towards nothing. Its effects lessen but never quite go." }
];
export const EYE_CYCLE_DAYS = 6 * DAYS_IN_MONTH;

/**
 * The Eye on a day, given the day it first appeared (a day number; null: not set). Null before it appeared.
 * Returns { cycle (from 1), phase, text, dayOfCycle (from 1), watching }.
 */
export function eye(n, start) {
  if (start == null || !Number.isFinite(start) || n < start) return null;
  const since = n - start;
  const cycle = Math.floor(since / EYE_CYCLE_DAYS) + 1;
  const d = since % EYE_CYCLE_DAYS;
  let acc = 0;
  for (const p of EYE_PHASES) {
    acc += p.months * DAYS_IN_MONTH;
    if (d < acc) return { cycle, phase: p.name, text: p.text, dayOfCycle: d + 1, watching: p.name === "Watching" };
  }
  return null;
}

/* -------------------------------------------- */
/*  What's on a day                             */
/* -------------------------------------------- */

/**
 * Festivals, events and notes on a date. `notes`: the GM's own ({ year, month, day, text, yearly, gmOnly, id }).
 * `gm`: include GM-only notes.
 */
export function onDay(year, month, day, { notes = [], gm = false } = {}) {
  const out = [];
  for (const f of FESTIVALS) if (f.month === month && f.day === day && (!f.from || year >= f.from)) out.push({ kind: "festival", name: f.name });
  for (const e of EVENTS) if (e.year === year && e.month === month && e.day === day) out.push({ kind: "event", name: e.name });
  for (const n of notes) {
    if (n.gmOnly && !gm) continue;
    if (n.month === month && n.day === day && (n.yearly ? year >= (n.year ?? 0) : n.year === year)) out.push({ kind: "note", name: n.text, id: n.id, gmOnly: !!n.gmOnly, yearly: !!n.yearly });
  }
  return out;
}

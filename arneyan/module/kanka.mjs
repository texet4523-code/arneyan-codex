/**
 * The calendar kept in step with the Kanka wiki (the GM's): pull the calendar's events and its date from Kanka, and
 * (if the GM switches it on) move Kanka's date when the date moves here.
 *
 * Kanka's API needs a personal access token, made by the GM on Kanka (Profile > API). It is kept in the GM's own
 * browser only (a client setting), never in the world's settings, which every player's client downloads. Kanka's date
 * is moved a day at a time (its advance and retreat), never by rewriting the calendar, so nothing else there changes.
 * Nothing is ever deleted on Kanka.
 */
import * as C from "./calendar-data.mjs";

const SYS = "arneyan";
const API = "https://api.kanka.io/1.0";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** Kanka allows 30 requests a minute: a date push moves at most this many days, the rest is left to the GM. */
export const MAX_STEPS = 20;
/** Kanka's visibility: 1 everyone, 5 campaign members; the rest (admins, the author) are the GM's. */
const OPEN_VISIBILITY = [1, 5];

/* -------------------------------------------- */
/*  Reading Kanka's data                        */
/* -------------------------------------------- */

/** Kanka's "503-12-11" as { year, month, day }, or null. */
export function readKankaDate(s) {
  const m = String(s ?? "").match(/^(-?\d+)-(\d+)-(\d+)$/);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

/**
 * Kanka reminders as the calendar's events: { name, year, month, day, every, until, length, gmOnly }. `names` gives
 * the entry name for reminders with no comment of their own (a birthday on a character).
 */
export function remindersToEvents(reminders, names = {}, { calendarEntity = null, publicEntities = new Set() } = {}) {
  const out = [];
  for (const r of reminders ?? []) {
    const name = String(r.comment ?? "").trim() || names[r.entity_id] || "";
    if (!name || !r.month || !r.day) continue;
    const recurring = typeof r.is_recurring === "boolean" ? r.is_recurring : !!r.recurring_periodicity;
    const every = recurring ? (["year", "month"].includes(r.recurring_periodicity) ? r.recurring_periodicity : "year") : "";
    // On another entry (a character's birthday): open only if that entry is known to be public, as a secret NPC's
    // birthday would give the NPC away. On the calendar itself: as the reminder's own visibility says.
    const otherEntry = r.entity_id != null && (calendarEntity == null || Number(r.entity_id) !== Number(calendarEntity));
    out.push({
      name, year: Number(r.year) || 0, month: Number(r.month), day: Number(r.day), every,
      until: r.recurring_until != null && r.recurring_until !== "" ? Number(r.recurring_until) : null,
      length: Math.max(1, Number(r.length) || 1),
      gmOnly: !!r.is_private || !OPEN_VISIBILITY.includes(Number(r.visibility_id)) || (otherEntry && !publicEntities.has(Number(r.entity_id)))
    });
  }
  return out.sort((a, b) => C.dayNumber(a.year, a.month, a.day) - C.dayNumber(b.year, b.month, b.day));
}

/** Where Kanka's calendar differs from this one (months, their lengths, weekdays): lines for the GM, empty if none. */
export function calendarDiffs(cal) {
  const out = [];
  const months = (cal?.months ?? []).map(m => ({ name: String(m.name ?? ""), length: Number(m.length) }));
  if (months.length && (months.length !== C.MONTHS.length || months.some((m, i) => m.name !== C.MONTHS[i] || m.length !== C.DAYS_IN_MONTH))) {
    out.push(`Kanka's months are ${months.map(m => `${m.name} (${m.length})`).join(", ")}; the system's are ${C.MONTHS.join(", ")}, ${C.DAYS_IN_MONTH} days each.`);
  }
  const days = (cal?.weekdays ?? []).map(String);
  if (days.length && days.join() !== C.WEEKDAYS.join()) out.push(`Kanka's weekdays are ${days.join(", ")}; the system's are ${C.WEEKDAYS.join(", ")}.`);
  return out;
}

/* -------------------------------------------- */
/*  Settings and requests                       */
/* -------------------------------------------- */

const token = () => { try { return String(game.settings.get(SYS, "kankaToken") ?? "").trim(); } catch { return ""; } };
const campaignId = () => String(game.settings.get(SYS, "kankaCampaign") ?? "").trim();
const calendarId = () => String(game.settings.get(SYS, "kankaCalendar") ?? "").trim();

/** One Kanka API call. Throws an Error that says what went wrong in plain words. */
async function api(path, { method = "GET" } = {}) {
  const t = token();
  if (!t) throw new Error("No Kanka token yet: add one in the calendar's Kanka window.");
  let r;
  try {
    r = await fetch(`${API}/campaigns/${encodeURIComponent(campaignId())}/${path}`, { method, headers: { Authorization: `Bearer ${t}`, Accept: "application/json" } });
  } catch {
    throw new Error("Kanka didn't answer (offline, or blocked by the browser).");
  }
  if (r.status === 401) throw new Error("Kanka turned the token down: make a new one on Kanka (Profile > API) and paste it in again.");
  if (r.status === 403) throw new Error("That Kanka account can't see this campaign or calendar.");
  if (r.status === 404) throw new Error("Kanka has no such campaign or calendar: check the numbers in the Kanka window.");
  if (r.status === 429) throw new Error("Kanka says too many requests (30 a minute): try again in a minute.");
  if (!r.ok) throw new Error(`Kanka answered ${r.status}.`);
  if (r.status === 204) return null;
  try { return await r.json(); } catch { throw new Error("Kanka's answer couldn't be read."); }
}

/** Every page of a Kanka list. */
const MAX_PAGES = 10;
async function all(path) {
  const out = [];
  let more = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await api(`${path}${path.includes("?") ? "&" : "?"}page=${page}`);
    out.push(...(res?.data ?? []));
    const last = res?.meta?.last_page ?? 1;
    if (!res?.links?.next || page >= last) break;
    more = page === MAX_PAGES;
  }
  out.more = more;
  return out;
}

/**
 * Pull the calendar from Kanka: its date, its events (saved for the calendar), and anything that no longer matches.
 * Returns { date, events, diffs }.
 */
export async function pullFromKanka() {
  const cal = (await api(`calendars/${encodeURIComponent(calendarId())}`))?.data ?? {};
  const reminders = await all(`calendars/${encodeURIComponent(calendarId())}/reminders`);
  // Reminders on other entries (a character's birthday): each entry looked up once for its name and whether it's
  // private, a few at most (Kanka's 30 requests a minute). Entries not looked up count as the GM's.
  const names = {};
  const publicEntities = new Set();
  const others = [...new Set(reminders.filter(r => r.entity_id && Number(r.entity_id) !== Number(cal.entity_id)).map(r => Number(r.entity_id)))];
  const LOOKUPS = 12;
  let checked = 0;
  for (const id of others.slice(0, LOOKUPS)) {
    try {
      const e = (await api(`entities/${id}`))?.data ?? {};
      names[id] = e.name ?? "";
      if (e.is_private === false) publicEntities.add(id);
      checked += 1;
    } catch { break; }
  }
  const events = remindersToEvents(reminders, names, { calendarEntity: cal.entity_id ?? null, publicEntities });
  const unnamed = reminders.length - events.length;
  // Players' clients download world settings: only what players may see goes there; the rest stays in this browser.
  const pulledAt = Date.now();
  await game.settings.set(SYS, "kankaEventsGm", { pulledAt, items: events.filter(e => e.gmOnly) });
  await game.settings.set(SYS, "kankaEvents", { pulledAt, items: events.filter(e => !e.gmOnly) });
  const notes = [];
  if (reminders.more) notes.push(`Kanka has more than ${MAX_PAGES} pages of events: only the first ${reminders.length} were pulled.`);
  if (unnamed > 0) notes.push(`${unnamed} event${unnamed === 1 ? "" : "s"} with no name of their own left out.`);
  if (others.length > checked) notes.push(`Events on ${others.length - checked} more entr${others.length - checked === 1 ? "y are" : "ies are"} kept GM-only (not checked, to stay inside Kanka's request limit).`);
  return { date: readKankaDate(cal.date), events, diffs: calendarDiffs(cal), notes };
}

/** Kanka's current date, or null. */
export async function kankaDate() {
  return readKankaDate((await api(`calendars/${encodeURIComponent(calendarId())}`))?.data?.date);
}

/**
 * Move Kanka's date to `target` ({ year, month, day }) a day at a time. Returns { moved, left } (left: days still to
 * go when the gap is more than MAX_STEPS, for the GM to set on Kanka by hand).
 */
export async function pushDateToKanka(target) {
  const now = await kankaDate();
  if (!now) throw new Error("Kanka's calendar has no date set.");
  const gap = C.dayNumber(target.year, target.month, target.day) - C.dayNumber(now.year, now.month, now.day);
  const steps = Math.min(Math.abs(gap), MAX_STEPS);
  for (let i = 0; i < steps; i++) {
    try {
      await api(`calendars/${encodeURIComponent(calendarId())}/${gap > 0 ? "advance" : "retreat"}`, { method: "POST" });
    } catch (err) {
      throw new Error(i ? `Kanka's date moved ${i} of ${steps} days, then stopped: ${err.message}` : err.message);
    }
  }
  return { moved: gap > 0 ? steps : gap < 0 ? -steps : 0, left: Math.abs(gap) - steps, from: now };
}

/** The events pulled from Kanka, or null if none have been (the calendar then uses the ones it came with). */
export function kankaEvents() {
  try {
    const v = game.settings.get(SYS, "kankaEvents");
    if (!v?.pulledAt || !Array.isArray(v.items)) return null;
    // The hidden ones from this browser's own pull, if it's the latest one.
    const mine = game.user?.isGM ? game.settings.get(SYS, "kankaEventsGm") : null;
    return [...v.items, ...(mine?.pulledAt === v.pulledAt && Array.isArray(mine.items) ? mine.items : [])];
  } catch { return null; }
}

/** One push at a time: a second waits for the first, then works from Kanka's date as it is by then. */
let pushing = null;
export function pushOnce(target) {
  const run = (pushing ?? Promise.resolve()).catch(() => null).then(() => pushDateToKanka(typeof target === "function" ? target() : target));
  pushing = run.catch(() => null);
  return run;
}

/* -------------------------------------------- */
/*  The Kanka window                            */
/* -------------------------------------------- */

/** The GM's Kanka window: token, numbers, pull, push and "keep in step". */
export async function kankaDialog({ today, setToday }) {
  if (!game.user.isGM) return;
  const { DialogV2 } = foundry.applications.api;
  const pulled = game.settings.get(SYS, "kankaEvents");
  const content = `<div class="arn-kanka">
    <p>Keep this calendar in step with the calendar on your Kanka wiki. The token stays in this browser only.</p>
    <div class="form-group"><label>Kanka token</label><input type="password" name="token" value="${esc(token())}" placeholder="Make one on Kanka: Profile > API" autocomplete="off"></div>
    <div class="form-group"><label>Campaign</label><input type="text" name="campaign" value="${esc(campaignId())}"></div>
    <div class="form-group"><label>Calendar</label><input type="text" name="calendar" value="${esc(calendarId())}"></div>
    <div class="form-group"><label>Move Kanka's date with this one</label><input type="checkbox" name="follow" ${game.settings.get(SYS, "kankaFollow") ? "checked" : ""}></div>
    <p class="hint">${pulled?.pulledAt ? `Events last pulled ${esc(new Date(pulled.pulledAt).toLocaleString())} (${pulled.items?.length ?? 0} for everyone, ${game.settings.get(SYS, "kankaEventsGm")?.pulledAt === pulled.pulledAt ? game.settings.get(SYS, "kankaEventsGm").items?.length ?? 0 : 0} hidden from players, kept in this browser).` : "Nothing pulled yet: the calendar shows the events it came with."} Moving Kanka's date goes a day at a time (up to ${MAX_STEPS} at once); nothing else on Kanka changes, and nothing is deleted.</p>
  </div>`;
  const save = async form => {
    await game.settings.set(SYS, "kankaToken", form.elements.token.value.trim());
    await game.settings.set(SYS, "kankaCampaign", form.elements.campaign.value.trim());
    await game.settings.set(SYS, "kankaCalendar", form.elements.calendar.value.trim());
    await game.settings.set(SYS, "kankaFollow", form.elements.follow.checked);
  };
  const act = await DialogV2.wait({
    window: { title: "Kanka calendar", icon: "fa-solid fa-book-atlas" }, classes: ["arneyan"], position: { width: 460 }, content,
    buttons: [
      { action: "pull", label: "Pull from Kanka", icon: "fa-solid fa-download", default: true, callback: async (ev, btn) => { await save(btn.form); return "pull"; } },
      { action: "push", label: "Send today's date to Kanka", icon: "fa-solid fa-upload", callback: async (ev, btn) => { await save(btn.form); return "push"; } },
      ...(pulled?.pulledAt ? [{ action: "forget", label: "Forget pulled events", icon: "fa-solid fa-rotate-left" }] : []),
      { action: "save", label: "Save", callback: async (ev, btn) => { await save(btn.form); return "save"; } }
    ],
    rejectClose: false
  });
  try {
    if (act === "pull") {
      const res = await pullFromKanka();
      const hidden = res.events.filter(e => e.gmOnly).length;
      const lines = [`${res.events.length} events pulled from Kanka${hidden ? ` (${hidden} hidden from players)` : ""}.`, ...res.notes, ...res.diffs];
      const here = today();
      if (res.date && C.dayNumber(res.date.year, res.date.month, res.date.day) !== here.n) {
        const k = C.dateOf(C.dayNumber(res.date.year, res.date.month, res.date.day));
        const ok = await DialogV2.confirm({ window: { title: "Kanka's date" }, rejectClose: false,
          content: `<p>${lines.map(esc).join("<br>")}</p><p>Kanka's date is <strong>${esc(C.dateText(k))}</strong>; this calendar's is <strong>${esc(C.dateText(here))}</strong>. Set this calendar to Kanka's date? (Only the date moves: no time passes here.)</p>` });
        if (ok) await setToday(k);
      } else ui.notifications.info(lines.join(" "));
    } else if (act === "push") {
      const res = await pushOnce(today);
      ui.notifications.info(res.left ? `Kanka's date moved ${res.moved} days; it's still ${res.left} days off. Set the rest on Kanka by hand.` : res.moved ? `Kanka's date moved ${res.moved > 0 ? "on" : "back"} ${Math.abs(res.moved)} day${Math.abs(res.moved) === 1 ? "" : "s"}.` : "Kanka already has today's date.");
    }
    else if (act === "forget") {
      await game.settings.set(SYS, "kankaEventsGm", {});
      await game.settings.set(SYS, "kankaEvents", {});
      ui.notifications.info("Pulled events forgotten: the calendar shows the events it came with.");
    }
  } catch (err) {
    ui.notifications.warn(err.message);
  }
}

/* -------------------------------------------- */
/*  Keeping in step                             */
/* -------------------------------------------- */

let timer = null;
let lastDay = null;
let warnedNoToken = false;

/** Whether this client is the one that moves Kanka's date: the active GM, following, with a token. */
function leads() {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || !game.settings.get(SYS, "kankaFollow")) return false;
  if (!token()) {
    if (!warnedNoToken) ui.notifications.warn("Kanka's date is set to follow this calendar, but there's no Kanka token in this browser: add it in the calendar's Kanka window.");
    warnedNoToken = true;
    return false;
  }
  return true;
}

/** After the date moves here (a few seconds after the last change), move Kanka's with it: the active GM only. */
function follow(today) {
  if (!leads()) return;
  const t = today();
  if (lastDay === null) { lastDay = t.n; return; }
  if (t.n === lastDay) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    if (!leads()) return;
    try {
      const res = await pushOnce(today);
      lastDay = today().n;
      if (res.left) ui.notifications.warn(`Kanka's date is ${res.left} days off this calendar: set it on Kanka by hand, or use the Kanka window.`);
    } catch (err) {
      ui.notifications.warn(`Kanka's date: ${err.message}`);
    }
  }, 8000);
}

export function registerKanka({ today, refresh }) {
  game.settings.register(SYS, "kankaToken", { scope: "client", config: false, type: String, default: "" });
  game.settings.register(SYS, "kankaCampaign", { scope: "world", config: false, type: String, default: "198952" });
  game.settings.register(SYS, "kankaCalendar", { scope: "world", config: false, type: String, default: "18550" });
  game.settings.register(SYS, "kankaFollow", { scope: "world", config: false, type: Boolean, default: false, onChange: v => { if (!v) { clearTimeout(timer); timer = null; } } });
  game.settings.register(SYS, "kankaEvents", { scope: "world", config: false, type: Object, default: {}, onChange: () => refresh() });
  // The events hidden from players stay in the GM's browser (world settings reach every player's client).
  game.settings.register(SYS, "kankaEventsGm", { scope: "client", config: false, type: Object, default: {}, onChange: () => refresh() });
  Hooks.once("ready", () => { try { lastDay = today().n; } catch { lastDay = null; } });
  Hooks.on("updateWorldTime", () => follow(today));
  Hooks.on("arneyanDateChanged", () => follow(today));
}

/**
 * Travel (Drop 4), Codex Travelling Rules, on the party sheet's Travel tab. Distance is in hexes; travel speed is
 * hexes a day by method and pace (difficult terrain drops one pace step). Each day of travel the GM presses
 * Travel one day: the world clock moves on a day, each member eats a Day's Rations (or a meal from an open Week's
 * Rations pack, seven meals to a pack) and drinks a day's water, and the Encounter Check is rolled (a d12: 11 a
 * Standard Encounter, 12 a Dangerous one), drawing from the encounter roll table named on the tab if there is one.
 * Days without food (beyond 3 + Con modifier, minimum 1) or water (from the first) bring Exhaustion.
 * State: party flags.arneyan.travel = { distance, done, method, pace, difficult, water, table, day, log }.
 * Members' hunger: flags.arneyan.hunger = { food, water } (days without).
 */
import { DAY, HOUR } from "./worldtime.mjs";
import { advance, daylight, secondsTo } from "./realtime.mjs";

const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const METHODS = { foot: "On foot (with rests)", mounted: "Mounts, vehicles or ships", umbral: "Umbral Journey" };
export const PACES = { slow: "Slow", normal: "Normal", fast: "Fast" };
/** Hexes per day (Codex, Travel Speed). */
export const SPEED = { foot: { slow: 1, normal: 2, fast: 3 }, mounted: { slow: 2, normal: 3, fast: 4 }, umbral: { normal: 24 } };
const STEP_DOWN = { fast: "normal", normal: "slow", slow: "slow" };
/** Tables tried, in order, when the tab names none. */
export const TABLE_NAMES = ["Travel Encounters", "Random Encounters", "Wilderness Encounters", "Encounter Check"];

export const DEFAULT_TRAVEL = { distance: 0, done: 0, method: "foot", pace: "normal", difficult: false, water: true, table: "", day: 0, log: [], mode: false, today: 0, road: 0 };

/**
 * Travel mode's clock (Kieran, 22 Oct 2026): each hex takes its share of a travelling day of TRAVEL_HOURS hours (on
 * foot at Normal, 2 hexes: 4 hours each); when the day's hexes are done the party camps, and the clock goes on to the
 * next morning (dawn, as the calendar's daylight sets it).
 */
export const TRAVEL_HOURS = 8;
export const hexSeconds = perDay => Math.round((TRAVEL_HOURS * HOUR) / Math.max(1, Number(perDay) || 1));
/** Seconds from a time of day (seconds since midnight) to the next dawn (dawn in minutes after midnight). */
export function toDawn(secondOfDay, dawnMinute = 360) {
  const s = secondsTo(secondOfDay, dawnMinute);
  return s > 0 ? s : s + DAY;
}
async function onToMorning() {
  const { whenOf } = await import("./calendar.mjs");
  await advance(toDawn(whenOf().secondOfDay, daylight().dawn));
}

/** Days of travel between ration reckonings (Kieran's Ration Consumption rule: 7 rations a character every 7 days). */
export const RATION_DAYS = 7;

/**
 * Travel mode: hexes the party token moved, added to today's. Returns the new state's numbers: days ended (each one a
 * full day's hexes at this pace), hexes into the next day, days in travel mode since the last ration reckoning (road),
 * and the days of travel that reached a reckoning. Only days travelled in travel mode count towards it (Travel one day
 * already eats daily).
 */
export function travelMove(t, hexes, perDay) {
  const per = Math.max(1, Number(perDay) || 1);
  let today = (Number(t.today) || 0) + Math.max(0, Number(hexes) || 0);
  let day = Number(t.day) || 0, road = Number(t.road) || 0;
  const ended = [], rations = [];
  while (today >= per) {
    today -= per;
    day += 1;
    ended.push(day);
    if (++road >= RATION_DAYS) { road = 0; rations.push(day); }
  }
  return { today, day, road, ended, rations, left: per - today };
}

/** The pace actually travelled: difficult terrain drops one step (Slow stays Slow); an Umbral Journey is Normal. */
export function effectivePace(method, pace, difficult) {
  if (method === "umbral") return "normal";
  const p = SPEED[method]?.[pace] ? pace : "normal";
  return difficult ? STEP_DOWN[p] : p;
}

export function hexesPerDay(method, pace, difficult = false) {
  const m = SPEED[method] ? method : "foot";
  return SPEED[m][effectivePace(m, pace, difficult)] ?? 1;
}

export function daysToGo(distance, done, perDay) {
  const left = Math.max(0, (Number(distance) || 0) - (Number(done) || 0));
  return perDay > 0 ? Math.ceil(left / perDay) : 0;
}

/* -------------------------------------------- */
/*  Supplies                                    */
/* -------------------------------------------- */

const isDay = i => i.type === "equipment" && /^day'?s rations?/i.test(i.name);
const isWeek = i => i.type === "equipment" && /^week'?s rations?|^ration pack/i.test(i.name);
const isWater = i => i.type === "equipment" && /canteen|waterskin|water skin|wineskin|bladder/i.test(i.name);
const mealsLeft = i => (i.flags?.[SYS]?.meals ?? 7);

/** Days of food an actor carries: Day's Rations, plus seven meals a Week's Rations pack (fewer in an open one). */
export function mealsCarried(actor) {
  let n = 0;
  for (const i of actor?.items ?? []) {
    const q = Number(i.system?.quantity ?? 1) || 0;
    if (q <= 0) continue;
    if (isDay(i)) n += q;
    else if (isWeek(i)) n += (q - 1) * 7 + mealsLeft(i);
  }
  return n;
}

/** Full water containers an actor carries (each holds a day's water until it's refilled). */
export function waterCarried(actor) {
  return (actor?.items ?? []).filter(i => isWater(i) && (Number(i.system?.quantity ?? 1) || 0) > 0)
    .reduce((t, i) => t + Math.max(0, (Number(i.system.quantity) || 1) - (Number(i.flags?.[SYS]?.empty) || 0)), 0);
}

/** Days without food before Exhaustion sets in: 3 + Constitution modifier, minimum 1. */
export const foodGrace = con => Math.max(1, 3 + (Number(con) || 0));

/** Exhaustion gained for a day, from days without food and water so far (after counting today). */
export function starvation(hunger, con) {
  let ex = 0;
  if ((hunger.food ?? 0) > foodGrace(con)) ex += 1;
  if ((hunger.water ?? 0) >= 1) ex += 1;
  return ex;
}

/** Eat one day's food from an actor: the update to make, or null if it has none. */
export function mealFrom(actor) {
  const items = [...(actor?.items ?? [])];
  const day = items.find(i => isDay(i) && (i.system.quantity ?? 1) > 0);
  if (day) return { item: day, update: { "system.quantity": day.system.quantity - 1 }, text: day.name };
  // An open pack first.
  const week = items.filter(i => isWeek(i) && (i.system.quantity ?? 1) > 0).sort((a, b) => mealsLeft(a) - mealsLeft(b))[0];
  if (!week) return null;
  const left = mealsLeft(week) - 1;
  if (left > 0) return { item: week, update: { [`flags.${SYS}.meals`]: left }, text: `${week.name} (${left} meals left in the open pack)` };
  return { item: week, update: { "system.quantity": week.system.quantity - 1, [`flags.${SYS}.meals`]: 7 }, text: `the last meal of a ${week.name} pack` };
}

/** Drink a day's water from an actor's containers: the update to make, or null if they're all empty. */
export function drinkFrom(actor) {
  const c = [...(actor?.items ?? [])].find(i => isWater(i) && (Number(i.system?.quantity ?? 1) || 1) > (Number(i.flags?.[SYS]?.empty) || 0));
  if (!c) return null;
  return { item: c, update: { [`flags.${SYS}.empty`]: (Number(c.flags?.[SYS]?.empty) || 0) + 1 }, text: c.name };
}

/* -------------------------------------------- */
/*  The tab                                     */
/* -------------------------------------------- */

export function travelState(party) {
  return { ...DEFAULT_TRAVEL, ...(party?.flags?.[SYS]?.travel ?? {}) };
}

/** Everything the Travel tab shows. */
export function travelContext(party, members = []) {
  const t = travelState(party);
  const perDay = hexesPerDay(t.method, t.pace, t.difficult);
  const days = daysToGo(t.distance, t.done, perDay);
  const pace = effectivePace(t.method, t.pace, t.difficult);
  const rows = members.map(m => {
    const h = m.flags?.[SYS]?.hunger ?? {};
    const meals = mealsCarried(m);
    const water = waterCarried(m);
    return { id: m.id, name: m.name, img: m.img, meals, water, short: meals < days, dry: !t.water && water < days,
      hungry: h.food ?? 0, thirsty: h.water ?? 0, grace: foodGrace(m.system?.abilities?.con?.mod) };
  });
  const stash = party ? { meals: mealsCarried(party), water: waterCarried(party) } : { meals: 0, water: 0 };
  return {
    travel: {
      ...t, perDay, days, pace, paceLabel: PACES[pace], arrived: t.distance > 0 && t.done >= t.distance,
      methods: METHODS, paces: t.method === "umbral" ? { normal: "Normal" } : PACES,
      needMeals: days * members.length, haveMeals: rows.reduce((s, r) => s + r.meals, 0) + stash.meals, stash,
      rows, slowNote: pace === "slow", fastNote: pace === "fast",
      left: Math.max(0, perDay - (Number(t.today) || 0)), toRations: RATION_DAYS - ((Number(t.road) || 0) % RATION_DAYS),
      log: [...(t.log ?? [])].reverse().slice(0, 20)
    }
  };
}

/* -------------------------------------------- */
/*  A day on the road                           */
/* -------------------------------------------- */

/** A roll table by name: the world's first, then any compendium's. */
export async function findTable(name) {
  if (!name) return null;
  const w = game.tables?.getName?.(name);
  if (w) return w;
  for (const pack of game.packs.filter(p => p.documentName === "RollTable")) {
    const idx = await pack.getIndex();
    const e = idx.find(x => x.name === name);
    if (e) return pack.getDocument(e._id);
  }
  return null;
}

/** The encounter table: the one named on the tab, else a likely one by name, else none. */
async function encounterTable(name) {
  if (name) return findTable(name);
  for (const n of TABLE_NAMES) { const t = await findTable(n); if (t) return t; }
  const w = game.tables?.find?.(t => /encounter/i.test(t.name));
  return w ?? null;
}

/** Names of roll tables for the tab's suggestions. */
export async function tableNames() {
  const out = new Set((game.tables?.contents ?? []).map(t => t.name));
  for (const pack of game.packs.filter(p => p.documentName === "RollTable")) for (const e of await pack.getIndex()) out.add(e.name);
  return [...out].sort((a, b) => a.localeCompare(b));
}

/** The Encounter Check result for a d12 (Codex): 1-10 nothing, 11 Standard, 12 Dangerous. */
export const encounterFor = n => (n >= 12 ? "dangerous" : n === 11 ? "standard" : "none");

/** Feed and water one member (or take from the stash): returns lines for the card. GM. */
async function supply(member, party, waterFound) {
  const lines = [];
  const hunger = { food: 0, water: 0, ...(member.flags?.[SYS]?.hunger ?? {}) };
  const meal = mealFrom(member) ?? mealFrom(party);
  if (meal) {
    await meal.item.update(meal.update);
    if ((meal.update["system.quantity"] ?? 1) <= 0) await meal.item.delete().catch(() => null);
    hunger.food = 0;
    lines.push(`eats ${meal.item.parent === party ? "from the stash: " : ""}${meal.text}`);
  } else {
    hunger.food += 1;
    lines.push(`has no food (day ${hunger.food} without)`);
  }
  if (waterFound) hunger.water = 0;
  else {
    const drink = drinkFrom(member) ?? drinkFrom(party);
    if (drink) { await drink.item.update(drink.update); hunger.water = 0; lines.push(`drinks from ${drink.text}`); }
    else { hunger.water += 1; lines.push(`has no water (day ${hunger.water} without)`); }
  }
  const ex = starvation(hunger, member.system.abilities?.con?.mod);
  const upd = { [`flags.${SYS}.hunger`]: hunger };
  if (ex) {
    upd["system.attributes.exhaustion"] = Math.min(6, (member.system.attributes.exhaustion ?? 0) + ex);
    lines.push(`gains ${ex} level${ex === 1 ? "" : "s"} of Exhaustion`);
  }
  await member.update(upd);
  return lines;
}

/** The day's Encounter Check (Codex): a d12, drawing from the encounter table on an 11 or 12. Returns the card text. */
async function encounterCheck(t) {
  // A d12 (or the named table itself, if it is the check).
  const table = await encounterTable(t.table).catch(() => null);
  let check = "", drew = "";
  if (table && /^1d12$/i.test(String(table.formula ?? "").replace(/\s/g, ""))) {
    const r = await table.draw({ displayChat: true, rollMode: "gmroll" }).catch(() => null);
    check = `${esc(table.name)}: ${r?.roll?.total ?? "?"}`;
  } else {
    const r = await new Roll("1d12").evaluate();
    const what = encounterFor(r.total);
    check = `d12: ${r.total}, ${{ none: "nothing happens", standard: "a Standard Encounter", dangerous: "a Dangerous Encounter" }[what]}`;
    if (what !== "none" && table) {
      await table.draw({ displayChat: true, rollMode: "gmroll" }).catch(err => console.warn("Arneyan | encounter table", err));
      drew = ` Drawn from ${esc(table.name)}.`;
    } else if (what !== "none") drew = " No encounter table found: build one, or name it on the Travel tab.";
  }
  return { check, drew };
}

/** Travel one day (GM). */
export async function travelDay(party, members) {
  if (!game.user.isGM) return ui.notifications.warn("The GM moves the party on.");
  const t = travelState(party);
  if (!(t.distance > 0)) return ui.notifications.warn("Set the distance to the destination first (in hexes).");
  if (t.done >= t.distance) return ui.notifications.info("The party has arrived.");
  const perDay = hexesPerDay(t.method, t.pace, t.difficult);
  const done = Math.min(t.distance, t.done + perDay);
  const day = t.day + 1;
  // Water found along the way refills everyone's containers.
  if (t.water) for (const a of [...members, party]) {
    const full = a.items.filter(i => isWater(i) && i.flags?.[SYS]?.empty);
    for (const i of full) await i.update({ [`flags.${SYS}.empty`]: 0 });
  }
  const lines = [];
  for (const m of members) lines.push(`<li><strong>${esc(m.name)}</strong> ${esc((await supply(m, party, t.water)).join(", "))}.</li>`);
  const { check, drew } = await encounterCheck(t);
  const logLine = `Day ${day}: ${done}/${t.distance} hexes (${PACES[effectivePace(t.method, t.pace, t.difficult)]}${t.difficult ? ", difficult terrain" : ""}).`;
  await party.update({ [`flags.${SYS}.travel`]: { ...t, done, day, log: [...(t.log ?? []), logLine].slice(-40) } });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: party }),
    content: `<div class="arn-card arn-report"><header class="arn-card-title"><i class="fa-solid fa-route"></i> <span>${esc(party.name)}: day ${day} on the road</span></header>
      <p>${done - t.done} hex${done - t.done === 1 ? "" : "es"} covered: ${done} of ${t.distance}.${done >= t.distance ? " <strong>They arrive.</strong>" : ` ${daysToGo(t.distance, done, perDay)} more day${daysToGo(t.distance, done, perDay) === 1 ? "" : "s"} to go.`}</p>
      <ul>${lines.join("")}</ul>
      ${effectivePace(t.method, t.pace, t.difficult) === "slow" ? `<p class="arn-muted">Slow pace: the party can move stealthily and forage (Wisdom (Survival), Moderate, DC 12, feeds one person for the day).</p>` : ""}
      ${effectivePace(t.method, t.pace, t.difficult) === "fast" ? `<p class="arn-muted">Fast pace: Disadvantage on Wisdom checks to notice danger.</p>` : ""}</div>`
  });
  await ChatMessage.create({ whisper: game.users.filter(u => u.isGM).map(u => u.id), speaker: ChatMessage.getSpeaker({ actor: party }),
    content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-dice-d20"></i> <span>Encounter Check, day ${day}</span></header><p>${check}.${drew}</p></div>` });
  await advance(DAY);
}

/** Fill every member's water containers (at a stream, a well, a town). */
export async function refillWater(party, members) {
  if (!game.user.isGM) return;
  for (const a of [...members, party]) for (const i of a.items.filter(i => isWater(i) && i.flags?.[SYS]?.empty)) await i.update({ [`flags.${SYS}.empty`]: 0 });
  ui.notifications.info("Water containers refilled.");
}

export async function resetJourney(party) {
  if (!game.user.isGM) return;
  const t = travelState(party);
  return party.update({ [`flags.${SYS}.travel`]: { ...t, done: 0, day: 0, today: 0, road: 0, log: [] } });
}

/* -------------------------------------------- */
/*  Travel mode: the party token on the map     */
/* -------------------------------------------- */

/** Hexes between two token positions on a scene (its grid's spaces; gridless: distance over the grid size). */
export function hexesBetween(scene, from, to) {
  const grid = scene?.grid;
  if (!grid || !from || !to || (from.x === to.x && from.y === to.y)) return 0;
  if (grid.isSquare) return 0; // a battle or town map: its squares aren't the 6-mile hexes
  try {
    const r = grid.measurePath?.([{ x: from.x, y: from.y }, { x: to.x, y: to.y }]);
    if (r && Number.isFinite(r.spaces) && r.spaces > 0) return Math.round(r.spaces);
    if (r && Number.isFinite(r.distance) && grid.distance) return Math.round(r.distance / grid.distance);
  } catch { /* fall back below */ }
  const size = grid.size || 100;
  return Math.round(Math.hypot(to.x - from.x, to.y - from.y) / size);
}

/**
 * A day of travel ends in travel mode (GM): a card in the chat with a button for the players to roll the day's
 * Encounter Check (d12) themselves; the GM draws from the encounter table on an 11 or 12.
 */
async function endDays(party, t, days, perDay) {
  const pace = effectivePace(t.method, t.pace, t.difficult);
  for (const day of days) {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: party }), flags: { [SYS]: { travelDay: { party: party.id, day } } },
      content: `<div class="arn-card arn-report"><header class="arn-card-title"><i class="fa-solid fa-route"></i> <span>${esc(party.name)}: day ${day} on the road ends</span></header>
        <p>${perDay} hex${perDay === 1 ? "" : "es"} at ${PACES[pace]} pace (${esc(METHODS[t.method] ?? "")}${t.difficult ? ", difficult terrain" : ""}).${t.distance > 0 ? ` ${Math.min(t.done, t.distance)} of ${t.distance} to the destination.` : ""} The party camps; the clock goes on to the next morning.</p>
        ${pace === "slow" ? `<p class="arn-muted">Slow pace: the party can move stealthily and forage (Wisdom (Survival), Moderate, DC 12, feeds one person for the day).</p>` : ""}
        ${pace === "fast" ? `<p class="arn-muted">Fast pace: Disadvantage on Wisdom checks to notice danger.</p>` : ""}
        <div class="arn-card-buttons"><button type="button" class="arn-travel-encounter" data-party="${esc(party.id)}" data-day="${day}"><i class="fa-solid fa-dice-d20"></i> Roll the Encounter Check (d12)</button></div></div>` });
  }
}

/** Roll a day's Encounter Check (anyone, once per day): 11 a Standard Encounter, 12 a Dangerous one. */
export async function rollEncounterCheck(party, day) {
  if (encounterRolled(party.id, day)) return ui.notifications.info(`Day ${day}'s Encounter Check is already rolled.`);
  const r = await new Roll("1d12").evaluate();
  const what = encounterFor(r.total);
  const label = { none: "nothing happens", standard: "a Standard Encounter", dangerous: "a Dangerous Encounter" }[what];
  // Rolled in the open, whatever the roller's roll mode, so everyone's button knows it's done.
  return r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: party }), flavor: `Encounter Check, day ${day}: ${label}`,
    flags: { [SYS]: { encounterRolled: { party: party.id, day, total: r.total, what } } } }, { rollMode: CONST.DICE_ROLL_MODES.PUBLIC });
}
/** The day's Encounter Check (the first one rolled, if two players pressed at once). */
const encounterRolled = (partyId, day) => game.messages?.contents?.find(m => m.flags?.[SYS]?.encounterRolled?.party === partyId && m.flags[SYS].encounterRolled.day === Number(day)) ?? null;

/** The ration reckoning after every 7 days of travel: who has 7 days' rations, who doesn't, and a button to eat them. */
export async function rationCard(party, members, day) {
  if (!members.length) return;
  // As the rations are used: each from their own, then the stash, in turn.
  let stash = mealsCarried(party);
  const stashBefore = stash;
  const rows = members.map(m => {
    const have = mealsCarried(m);
    const fromStash = Math.min(stash, Math.max(0, RATION_DAYS - have));
    stash -= fromStash;
    return { m, have, fromStash, short: have + fromStash < RATION_DAYS };
  });
  const short = rows.filter(r => r.short);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: party }),
    content: `<div class="arn-card arn-report arn-ration-card"><header class="arn-card-title"><i class="fa-solid fa-drumstick-bite"></i> <span>${RATION_DAYS} days on the road (day ${day})</span></header>
      <p>Each character now uses <strong>${RATION_DAYS} rations</strong> (or ${RATION_DAYS} charges of a ration) to keep this travel speed.</p>
      <ul>${rows.map(r => `<li><strong>${esc(r.m.name)}</strong>: ${r.have} carried${r.fromStash ? `, ${r.fromStash} from the party stash` : ""}${r.short ? ' <span class="arn-bad">not enough</span>' : ""}</li>`).join("")}</ul>
      ${stashBefore ? `<p class="arn-muted">The party stash has ${stashBefore}.</p>` : ""}
      ${short.length ? `<p class="arn-bad"><strong>Not enough rations:</strong> ${esc(short.map(r => r.m.name).join(", "))}. Tell the GM: this brings penalties (such as Exhaustion) and may force a slower pace.</p>` : ""}
      <div class="arn-card-buttons"><button type="button" class="arn-travel-eat" data-party="${esc(party.id)}"><i class="fa-solid fa-utensils"></i> Use ${RATION_DAYS} days' rations (GM)</button></div></div>` });
}

/** Eat 7 days' rations from each member (their own first, then the stash). GM. */
export async function eatRations(party, members) {
  if (!game.user.isGM) return ui.notifications.warn("The GM uses the rations.");
  const lines = [];
  for (const m of members) {
    let ate = 0;
    for (let i = 0; i < RATION_DAYS; i++) {
      const meal = mealFrom(m) ?? mealFrom(party);
      if (!meal) break;
      await meal.item.update(meal.update);
      if ((meal.update["system.quantity"] ?? 1) <= 0) await meal.item.delete().catch(() => null);
      ate += 1;
    }
    lines.push(`<li><strong>${esc(m.name)}</strong>: ${ate} of ${RATION_DAYS}${ate < RATION_DAYS ? ' <span class="arn-bad">short</span>' : ""}</li>`);
  }
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: party }), whisper: game.users.filter(u => u.isGM).map(u => u.id),
    content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-utensils"></i> <span>Rations used</span></header><ul>${lines.join("")}</ul></div>` });
}

/** Travel mode's changes run one at a time, each reading the party as the last one left it. */
let travelQueue = Promise.resolve();
const serial = fn => (travelQueue = travelQueue.then(fn).catch(err => console.warn("Arneyan | travel mode", err)));

/** End the day here (travel mode, GM): camp short of the day's hexes; the day counts all the same. */
export function endDayHere(party, members) {
  if (!game.user.isGM) return;
  return serial(async () => {
    const t = travelState(party);
    const perDay = hexesPerDay(t.method, t.pace, t.difficult);
    const day = t.day + 1;
    let road = (Number(t.road) || 0) + 1;
    const reckon = road >= RATION_DAYS;
    if (reckon) road = 0;
    await party.update({ [`flags.${SYS}.travel`]: { ...t, day, road, today: 0, log: [...(t.log ?? []), `Day ${day}: ${t.today} of ${perDay} hexes, camped early.`].slice(-40) } }, { arneyanTravelMoved: true });
    await endDays(party, { ...t, day }, [day], t.today);
    await onToMorning();
    if (reckon) await rationCard(party, members, day);
  });
}

/**
 * A party token moved in travel mode (the active GM's client): count the hexes and end any days they complete.
 * An undone move gives today's hexes back (a day already ended stays ended).
 */
function onPartyMoved(tokenDoc, hexes, undo = false) {
  const party = tokenDoc.actor;
  if (party?.type !== "party" || !hexes) return;
  return serial(async () => {
    const t = travelState(party);
    if (!t.mode) return;
    if (undo) {
      const back = Math.min(Number(t.today) || 0, hexes);
      if (!back) return;
      // The hexes' time goes back too (the clock is wound back; nothing that was counting is undone).
      const { moveTime } = await import("./realtime.mjs");
      await moveTime(-back * hexSeconds(hexesPerDay(t.method, t.pace, t.difficult)));
      return party.update({ [`flags.${SYS}.travel`]: { ...t, today: t.today - back, done: Math.max(0, (Number(t.done) || 0) - back) } }, { arneyanTravelMoved: true });
    }
    const perDay = hexesPerDay(t.method, t.pace, t.difficult);
    const r = travelMove(t, hexes, perDay);
    const done = (Number(t.done) || 0) + hexes;
    const pace = PACES[effectivePace(t.method, t.pace, t.difficult)];
    const log = [...(t.log ?? []), ...r.ended.map(d => `Day ${d}: ${perDay} hexes (${pace}).`)].slice(-40);
    await party.update({ [`flags.${SYS}.travel`]: { ...t, today: r.today, day: r.day, road: r.road, done, log } }, { arneyanTravelMoved: true });
    // The clock: each hex its share of the travelling day; at a day's end, camp and on to the next morning.
    let today = Number(t.today) || 0, secs = 0;
    const ended = [...r.ended];
    for (let k = 0; k < hexes; k++) {
      secs += hexSeconds(perDay);
      today++;
      // As travelMove counts: hexes already over a day's worth (the pace was changed mid-day) end their days too.
      while (today >= perDay && ended.length) {
        today -= perDay;
        if (secs) await advance(secs);
        secs = 0;
        await endDays(party, { ...t, done }, [ended.shift()], perDay);
        await onToMorning();
      }
    }
    if (secs) await advance(secs);
    if (r.rations.length) {
      const { partyMembers } = await import("./party.mjs");
      for (const d of r.rations) await rationCard(party, partyMembers(), d);
    }
  });
}

/** What the party token shows after a move: "1 of 2 hexes today (Normal pace): 1 left". */
export function hexesLabel(t) {
  const perDay = hexesPerDay(t.method, t.pace, t.difficult);
  const left = Math.max(0, perDay - (Number(t.today) || 0));
  return `${t.today ?? 0} of ${perDay} hex${perDay === 1 ? "" : "es"} today (${PACES[effectivePace(t.method, t.pace, t.difficult)]} pace): ${left} left`;
}

/** Hexes a finished move covered: the grid's count along its path, else start to end. */
export function movedHexes(scene, movement) {
  if (scene?.grid?.isSquare) return 0;
  const spaces = movement?.passed?.spaces;
  if (Number.isFinite(spaces) && spaces > 0) return Math.round(spaces);
  return hexesBetween(scene, movement?.origin, movement?.destination);
}

/** Moves that count: by hand (dragged, the keyboard) or by a macro; not a token's settings, a paste or an undo. */
const SKIP_METHODS = new Set(["config", "paste"]);

export function registerTravel() {
  // Where a party token stood before a move (used only when Foundry gives no movement record).
  const seen = new Map();
  const remember = tok => { if (tok?.actor?.type === "party") seen.set(tok.id, { x: tok.x, y: tok.y }); };
  Hooks.on("canvasReady", () => { for (const t of globalThis.canvas?.scene?.tokens ?? []) remember(t); });
  Hooks.on("createToken", remember);
  // A finished move (v13 and v14): its path, how it was made, and whether it was an undo.
  Hooks.on("moveToken", (tok, movement) => {
    remember(tok);
    if (tok.actor?.type !== "party" || !game.users.activeGM?.isSelf) return;
    const method = movement?.method;
    if (SKIP_METHODS.has(method)) return;
    onPartyMoved(tok, movedHexes(tok.parent, movement), method === "undo");
  });
  // Older Foundry without the moveToken hook: measure from where it stood.
  Hooks.on("preUpdateToken", (tok, changes, options) => {
    if (tok.actor?.type === "party" && ("x" in changes || "y" in changes)) options.arneyanTravelFrom = { x: tok.x, y: tok.y };
  });
  Hooks.on("updateToken", (tok, changes, options) => {
    if (!("x" in changes || "y" in changes) || tok.actor?.type !== "party") return;
    // Foundry 13 and later report every move to the moveToken hook (above): counting here too would count it twice.
    if ((game.release?.generation ?? 0) >= 13 || options.movement?.[tok.id] || options._movement) return;
    const from = options.arneyanTravelFrom ?? seen.get(tok.id);
    remember(tok);
    if (!game.users.activeGM?.isSelf || !from || options.isUndo) return;
    onPartyMoved(tok, hexesBetween(tok.parent, from, { x: tok.x, y: tok.y }));
  });
  // Everyone sees the count over the party token after a move or a day's end.
  Hooks.on("updateActor", (actor, changes, options) => {
    if (actor.type !== "party" || !options?.arneyanTravelMoved) return;
    const t = travelState(actor);
    if (!t.mode) return;
    for (const tok of actor.getActiveTokens?.() ?? []) {
      globalThis.canvas?.interface?.createScrollingText?.(tok.center, hexesLabel(t), { anchor: CONST.TEXT_ANCHOR_POINTS.TOP, fontSize: 22, stroke: 0x000000, strokeThickness: 4, duration: 4000 });
    }
  });
  // The ration card's button: once only (marked on the message).
  // The day's Encounter Check: a button for the players; once rolled it says so. The GM draws on an 11 or 12.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const b = html.querySelector?.(".arn-travel-encounter");
    if (b) {
      const done = encounterRolled(b.dataset.party, Number(b.dataset.day));
      if (done) { b.disabled = true; b.innerHTML = `<i class="fa-solid fa-check"></i> Rolled: ${done.flags[SYS].encounterRolled.total}`; }
      else b.addEventListener("click", async ev => {
        ev.currentTarget.disabled = true;
        const party = game.actors.get(b.dataset.party);
        if (party) await rollEncounterCheck(party, Number(b.dataset.day));
      });
    }
    const rolled = message.flags?.[SYS]?.encounterRolled;
    // The GM's draw: on the day's first check only, once.
    const first = rolled ? encounterRolled(rolled.party, rolled.day) : null;
    if (rolled && rolled.what !== "none" && game.user.isGM && first?.id === message.id && !html.querySelector?.(".arn-travel-draw")) {
      const draw = document.createElement("button");
      draw.type = "button"; draw.className = "arn-travel-draw";
      const drawn = !!message.getFlag?.(SYS, "encounterDrawn");
      draw.disabled = drawn;
      draw.innerHTML = drawn ? '<i class="fa-solid fa-check"></i> Drawn' : '<i class="fa-solid fa-table-list"></i> Draw from the encounter table (GM)';
      draw.addEventListener("click", async () => {
        if (message.getFlag?.(SYS, "encounterDrawn")) return;
        const party = game.actors.get(rolled.party);
        const table = await encounterTable(travelState(party ?? {}).table).catch(() => null);
        if (!table) return ui.notifications.warn("No encounter table found: build one, or name it on the party's Travel tab.");
        draw.disabled = true;
        await message.setFlag(SYS, "encounterDrawn", true);
        // A table that is itself the d12 check reads the players' roll instead of rolling again.
        const isCheck = /^1d12$/i.test(String(table.formula ?? "").replace(/\s/g, ""));
        await table.draw({ displayChat: true, rollMode: "gmroll", ...(isCheck ? { roll: await new Roll(String(rolled.total)).evaluate() } : {}) });
      });
      (html.querySelector?.(".message-content") ?? html).append(draw);
    }
  });
  // When the check is rolled, the day's card updates its button.
  Hooks.on("createChatMessage", message => {
    const r = message.flags?.[SYS]?.encounterRolled;
    if (!r) return;
    for (const m of game.messages.contents.slice(-30)) if (m.flags?.[SYS]?.travelDay?.party === r.party && m.flags[SYS].travelDay.day === r.day) ui.chat?.updateMessage?.(m);
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const btn = html.querySelector?.(".arn-travel-eat");
    if (!btn) return;
    if (message.getFlag?.(SYS, "rationsUsed")) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Rations used';
      return;
    }
    btn.addEventListener("click", async ev => {
      if (!game.user.isGM) return ui.notifications.warn("The GM uses the rations.");
      if (message.getFlag?.(SYS, "rationsUsed")) return;
      const party = game.actors.get(ev.currentTarget.dataset.party);
      if (!party) return;
      ev.currentTarget.disabled = true;
      await message.setFlag(SYS, "rationsUsed", true);
      const { partyMembers } = await import("./party.mjs");
      await eatRations(party, partyMembers());
    });
  });
}

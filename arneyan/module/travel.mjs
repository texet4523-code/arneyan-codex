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
import { DAY } from "./worldtime.mjs";
import { advance } from "./realtime.mjs";

const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const METHODS = { foot: "On foot (with rests)", mounted: "Mounts, vehicles or ships", umbral: "Umbral Journey" };
export const PACES = { slow: "Slow", normal: "Normal", fast: "Fast" };
/** Hexes per day (Codex, Travel Speed). */
export const SPEED = { foot: { slow: 1, normal: 2, fast: 3 }, mounted: { slow: 2, normal: 3, fast: 4 }, umbral: { normal: 24 } };
const STEP_DOWN = { fast: "normal", normal: "slow", slow: "slow" };
/** Tables tried, in order, when the tab names none. */
export const TABLE_NAMES = ["Travel Encounters", "Random Encounters", "Wilderness Encounters", "Encounter Check"];

export const DEFAULT_TRAVEL = { distance: 0, done: 0, method: "foot", pace: "normal", difficult: false, water: true, table: "", day: 0, log: [] };

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
  // The Encounter Check: a d12 (or the named table itself, if it is the check).
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
  return party.update({ [`flags.${SYS}.travel`]: { ...t, done: 0, day: 0, log: [] } });
}

/**
 * Ready-made encounters by terrain and Level (A3; F-R7, F-R10; Kieran's approval K210, lore R96).
 *
 * Twelve terrains, each with a d8 table for Levels 1-4, 5-8, 9-12 and 13+ (build/data/terrain_encounters.json). On the
 * Travel tab's Encounter Check, an 11 is a Hard encounter and a 12 a Deadly one: in bands to 12, Hard rolls 1d6 and
 * Deadly 1d6+2 (entries 7 and 8 only on a Deadly check); in 13+ both roll 1d8. Entry 1 isn't a fight (Hard only). An
 * entry that doesn't suit the party is rerolled: a solo more than two Levels from it, an ordinary creature more than
 * four above it, or a group whose strongest ordinary creature is more than four below it.
 *
 * Numbers (Kieran, K210, "Fit to the check"): a creature given as a number (a leader, a pair, a lone dragon) stays as written, minion crews go up to two per character, the
 * rest scale to the check's target (Hard: the budget; Deadly: twice it). The GM card can roll the book's numbers
 * instead. Each fight also rolls a Combat Axis twist for its terrain and shows a way through for its main foe's kind
 * (Kieran's binding design notes). Nothing here resolves anything: the card is for the GM.
 */
import { encounterBudget } from "./encounter.mjs";

const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

import { TERRAINS } from "./data/terrain-names.mjs";
export { TERRAINS };
/** Most of one creature the card places from a fit (the Encounter Builder's own cap). */
const MAX_EACH = 50;

let DATA = null;
/** The tables (loaded when first needed: they're big). */
export async function terrainData() {
  return DATA ??= (await import("./data/terrains.mjs")).TERRAIN_DATA;
}

/** The party's Level for the tables: the members' average, rounded (at least 1). */
export function partyLevelOf(levels) {
  const l = (levels ?? []).map(Number).filter(Number.isFinite);
  return l.length ? Math.max(1, Math.round(l.reduce((a, b) => a + b, 0) / l.length)) : 1;
}

/** The band a party Level rolls on. */
export const bandOf = pl => (pl <= 4 ? "1-4" : pl <= 8 ? "5-8" : pl <= 12 ? "9-12" : "13+");

/** The die for a check: 1d6 Hard and 1d6+2 Deadly, except 13+ where both roll 1d8. */
export const dieFor = (band, deadly) => (band === "13+" ? "1d8" : deadly ? "1d6+2" : "1d6");

/** A creature's Level for the rules here (Level ½ and ¼ count as 0). */
const lv = f => Number(f.level) || 0;

/** Whether one option of an entry suits a party of this Level. */
export function suits(option, pl) {
  if (!option?.length) return false;
  if (option.some(f => f.solo && Math.abs(lv(f) - pl) > 2)) return false;
  const ordinary = option.filter(f => !f.solo && !f.minion);
  if (ordinary.some(f => lv(f) > pl + 4)) return false;
  if (ordinary.length && !option.some(f => f.solo) && Math.max(...ordinary.map(lv)) < pl - 4) return false;
  return true;
}

/**
 * The option of an entry to use (an entry with two solos, "Adult or Ancient", gives two). Of those that suit, a Deadly
 * check prefers a solo above the party and a Hard one a solo at or below it; then the nearest. Null when none suits.
 */
export function pickOption(entry, pl, deadly = false) {
  const ok = (entry?.options ?? []).filter(o => suits(o, pl));
  if (ok.length < 2) return ok[0] ?? null;
  const top = o => Math.max(...o.map(lv));
  const score = o => { const d = top(o) - pl; return (deadly ? (d > 0 ? 0 : 10) : (d <= 0 ? 0 : 10)) + Math.abs(d); };
  return [...ok].sort((a, b) => score(a) - score(b))[0];
}

/** Roll a formula (Foundry's dice); tests pass their own. */
const foundryRoll = async formula => (await new Roll(formula).evaluate()).total;

/**
 * Roll a terrain's table for a party (an array of Levels). Returns { terrain, band, n, label, option } for a fight,
 * { terrain, band, n, nonfight } for entry 1, or { terrain, band, none: true } when nothing suits after many tries.
 * `rerolled` lists the numbers rolled again.
 */
export async function rollTerrain(terrain, levels, { deadly = false, roll = foundryRoll, tries = 40 } = {}) {
  const data = await terrainData();
  const ter = data.terrains.find(t => t.name === terrain);
  if (!ter) return null;
  const pl = partyLevelOf(levels);
  const band = bandOf(pl);
  const rows = ter.bands[band];
  const rerolled = [];
  for (let k = 0; k < tries; k++) {
    const n = await roll(dieFor(band, deadly));
    const row = rows[n - 1];
    if (!row) { rerolled.push(n); continue; }
    if (row.nonfight !== undefined) {
      if (deadly) { rerolled.push(n); continue; }
      return { terrain, band, pl, n, nonfight: row.nonfight, rerolled };
    }
    const option = pickOption(row, pl, deadly);
    if (!option) { rerolled.push(n); continue; }
    return { terrain, band, pl, n, label: row.label, option, rerolled };
  }
  return { terrain, band, pl, none: true, rerolled };
}

/** A number as written (not dice): a leader, a pair or a lone creature the fit doesn't change. Minion crews scale. */
const fixedIn = (option, f) => !!f.solo || (!f.minion && /^\d+$/.test(String(f.dice)));

/** The Encounter Builder's foe row for one of the option's creatures. */
const asFoe = (f, count) => ({ uuid: f.uuid, name: f.name, img: f.img, level: f.level ?? 1, levelText: f.levelText ?? "", marked: !!f.marked, solo: !!f.solo, minion: !!f.minion, count, na: f.na ?? "" });

/**
 * Fit an option to the check (K210): leaders and solos as written, minion crews up to two per character, the rest
 * raised one at a time (the one with fewest first) while the budget takes them. Hard's target is the budget,
 * Deadly's twice it. Returns the Encounter Builder's foe rows.
 */
export function fitOption(option, levels, deadly = false, { retainers = 0 } = {}) {
  const n = Math.max(1, levels.length);
  const out = option.map(f => asFoe(f, fixedIn(option, f) ? Math.max(1, Number(f.dice) || 1) : 1));
  if (!levels.length) return out;
  const target = encounterBudget(levels, [], { retainers }).budget * (deadly ? 2 : 1);
  const open = new Set(option.map((f, i) => i).filter(i => !fixedIn(option, option[i])));
  const cap = i => (out[i].minion ? 2 * n : MAX_EACH);
  for (let step = 0; step < 600 && open.size; step++) {
    const i = [...open].sort((a, b) => out[a].count - out[b].count || a - b)[0];
    out[i].count += 1;
    if (out[i].count > cap(i) || encounterBudget(levels, out, { retainers }).total > target) { out[i].count -= 1; open.delete(i); }
  }
  return out;
}

/** The book's numbers instead: each creature's dice rolled (leaders and pairs as written), at most 50 of one. */
export async function bookNumbers(option, { roll = foundryRoll } = {}) {
  const out = [];
  for (const f of option) {
    const d = String(f.dice ?? "1");
    const range = d.match(/^(\d+)-(\d+)$/);
    const formula = range ? `1d${Number(range[2]) - Number(range[1]) + 1} + ${Number(range[1]) - 1}` : d;
    const count = /^\d+$/.test(d) ? Number(d) : await roll(formula);
    out.push(asFoe(f, Math.min(MAX_EACH, Math.max(1, count || 1))));
  }
  return out;
}

/** The kind of foe a creature type is, for its way through. */
export function kindOf(type) {
  const t = String(type ?? "").toLowerCase();
  if (/^swarm|^beast/.test(t)) return "Beasts";
  if (/^humanoid/.test(t)) return "Humanoids";
  if (/^monstrosity/.test(t)) return "Monstrosities";
  if (/^undead/.test(t)) return "Undead";
  if (/^dragon/.test(t)) return "Dragons";
  if (/^giant/.test(t)) return "Giants";
  if (/^(plant|ooze)/.test(t)) return "Plants and oozes";
  return "Fiends, fey, aberrations, elementals and celestials";
}

/** The group's main foe: its strongest creature that isn't a minion. */
export function mainFoe(option) {
  const pool = option.filter(f => !f.minion);
  return [...(pool.length ? pool : option)].sort((a, b) => lv(b) - lv(a))[0];
}

/** The way through for an option, from its main foe's kind. */
export async function wayThrough(option) {
  const data = await terrainData();
  const kind = kindOf(mainFoe(option)?.type);
  return { kind, text: data.wayThrough.find(w => w.kind === kind)?.text ?? "" };
}

/** A terrain's twist (rolled d6). */
export async function rollTwist(terrain, { roll = foundryRoll } = {}) {
  const data = await terrainData();
  const ter = data.terrains.find(t => t.name === terrain);
  if (!ter) return null;
  const n = await roll("1d6");
  return { n, ...ter.twists[n - 1] };
}

/** A short line for an entry's creatures, as the lists print them ("2d6 Goblin (minions), 1 Goblin Boss"). */
export const optionText = option => option.map(f => `${f.dice} ${f.name}${f.minion ? " (minions)" : f.solo ? " (solo)" : ""}`).join(", ");

/* -------------------------------------------- */
/*  The GM's card                               */
/* -------------------------------------------- */

const LABEL = { false: "Hard", true: "Deadly" };

/** The card's text from its state (stored on the message, so its buttons can change the numbers). */
export function cardHtml(state, budget) {
  const head = `<header class="arn-card-title"><i class="fa-solid fa-mountain-sun"></i> <span>${esc(state.terrain)}: ${state.nonfight !== undefined ? "not a fight" : `${LABEL[!!state.deadly]} encounter`}</span></header>`;
  const again = [...new Set(state.rerolled ?? [])];
  const sub = `<p class="arn-muted">Levels ${esc(state.band)} table, ${state.n ? `entry ${state.n}` : "no entry"}${again.length ? ` (rerolled ${again.join(", ")}: ${again.length === 1 ? "it didn't" : "they didn't"} suit the party)` : ""}.</p>`;
  if (state.none) return `<div class="arn-card arn-terrain-card">${head}<p>Nothing in the ${esc(state.terrain)} table suits a party of Level ${state.pl}. Build this one in the Encounter Builder.</p></div>`;
  if (state.nonfight !== undefined) return `<div class="arn-card arn-terrain-card">${head}${sub}<p>${esc(state.nonfight)}</p></div>`;
  const rows = state.foes.map(f => `<li><strong>${f.count}</strong> ${esc(f.name)}${f.minion ? " <em>(minions)</em>" : ""}${f.solo ? " <em>(run as a solo)</em>" : ""}</li>`).join("");
  return `<div class="arn-card arn-terrain-card">${head}${sub}
    <p><strong>${esc(state.label)}</strong> <span class="arn-muted">(${state.book ? "the book's numbers" : `fitted to ${LABEL[!!state.deadly]}`})</span></p>
    <ul>${rows}</ul>
    ${budget ? `<p class="arn-muted">For the party: <strong>${esc(budget.label)}</strong>, ${budget.total} of ${esc(budget.budgetText)} points.</p>` : ""}
    ${state.twist ? `<p><strong>Twist (${state.twist.n}): ${esc(state.twist.name)}</strong> <span class="arn-muted">(${esc(state.twist.axis)})</span>: ${esc(state.twist.text)}</p>` : ""}
    ${state.way?.text ? `<p><strong>Way through (${esc(state.way.kind)}):</strong> ${esc(state.way.text)}</p>` : ""}
    <div class="arn-card-buttons">
      <button type="button" data-arn-terrain="place"><i class="fa-solid fa-map-location-dot"></i> Place on this scene</button>
      <button type="button" data-arn-terrain="builder"><i class="fa-solid fa-scale-balanced"></i> Open in Encounter Builder</button>
      <button type="button" data-arn-terrain="${state.book ? "fit" : "book"}"><i class="fa-solid fa-dice"></i> ${state.book ? `Fit to ${LABEL[!!state.deadly]} instead` : "Roll the book's numbers instead"}</button>
      <button type="button" data-arn-terrain="scene"><i class="fa-solid fa-map"></i> New scene from a ${esc(state.terrain)} map</button>
    </div></div>`;
}

/** The party's Levels (its members), and the GM's retainer count. */
async function partyNow() {
  const { partyMembers } = await import("./party.mjs");
  const { partyRetainers } = await import("./encounter.mjs");
  return { levels: partyMembers().map(a => a.system.level ?? 1), retainers: partyRetainers() };
}

/**
 * Roll a terrain encounter for the party and whisper the card to the GMs. `deadly`: the check was a 12.
 * Returns the message.
 */
export async function terrainEncounter(terrain, { deadly = false, levels = null } = {}) {
  if (!game.user.isGM) { ui.notifications.warn("The GM rolls the encounter."); return null; }
  const party = await partyNow();
  levels = levels ?? party.levels;
  if (!levels.length) ui.notifications.warn("No party members: the tables use Level 1. Put the player characters in the party.");
  const r = await rollTerrain(terrain, levels.length ? levels : [1], { deadly });
  if (!r) { ui.notifications.warn(`No encounter table for "${terrain}".`); return null; }
  const state = { terrain, band: r.band, pl: r.pl, n: r.n ?? null, deadly: !!deadly, rerolled: r.rerolled };
  if (r.none) state.none = true;
  else if (r.nonfight !== undefined) state.nonfight = r.nonfight;
  else {
    Object.assign(state, { label: r.label, option: r.option, foes: fitOption(r.option, levels, deadly, { retainers: party.retainers }), book: false });
    state.twist = await rollTwist(terrain);
    state.way = await wayThrough(r.option);
  }
  const budget = state.foes ? encounterBudget(levels, state.foes, { retainers: party.retainers }) : null;
  return ChatMessage.create({
    whisper: game.users.filter(u => u.isGM).map(u => u.id), speaker: { alias: "Encounter" },
    content: cardHtml(state, budget), flags: { [SYS]: { terrainEnc: state } }
  });
}

/* -------------------------------------------- */
/*  Maps for a terrain (the Map Browser)        */
/* -------------------------------------------- */

/** The maps the GM set for each terrain in the Map Browser: { Forest: [{ key, rel, name, w, h, variants }] }. */
export const terrainMaps = () => game.settings.get(SYS, "terrainMaps") ?? {};

/** A new scene from one of a terrain's maps (at random), viewed. */
async function sceneFor(terrain) {
  const list = terrainMaps()[terrain] ?? [];
  if (!list.length) return ui.notifications.warn(`No maps set for ${terrain}: in the Map Browser, use a map's terrain button to set some.`);
  const map = list[Math.floor(Math.random() * list.length)];
  const { createMapScene } = await import("./maps.mjs");
  try {
    const { scene } = await createMapScene(map, map.variants?.[0]);
    ui.notifications.info(`Made the scene "${scene.name}" from a ${terrain} map. It's hidden from players until you show it.`);
    await scene.view();
  } catch (err) {
    console.error("Arneyan | terrain map", err);
    ui.notifications.error(`Couldn't make a scene from ${map.name} (the console has the error).`);
  }
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

async function onCardButton(message, action, button) {
  const state = foundry.utils.deepClone(message.flags?.[SYS]?.terrainEnc);
  if (!state?.foes) return action === "scene" && state ? sceneFor(state.terrain) : undefined;
  const { ArneyanEncounterBuilder } = await import("./encounter.mjs");
  if (action === "builder") return ArneyanEncounterBuilder.load(state.foes);
  if (action === "place") {
    button.disabled = true;
    try { return await ArneyanEncounterBuilder.placeFoes(state.foes); } finally { button.disabled = false; }
  }
  if (action === "scene") return sceneFor(state.terrain);
  if (action === "book" || action === "fit") {
    button.disabled = true;
    const party = await partyNow();
    state.foes = action === "book" ? await bookNumbers(state.option) : fitOption(state.option, party.levels, state.deadly, { retainers: party.retainers });
    state.book = action === "book";
    const budget = party.levels.length ? encounterBudget(party.levels, state.foes, { retainers: party.retainers }) : null;
    return message.update({ content: cardHtml(state, budget), [`flags.${SYS}.terrainEnc`]: state });
  }
}

export function registerTerrain() {
  game.settings.register(SYS, "terrainMaps", { scope: "world", config: false, type: Object, default: {} });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.flags?.[SYS]?.terrainEnc) return;
    for (const b of html.querySelectorAll?.("[data-arn-terrain]") ?? []) {
      if (!game.user.isGM) { b.remove(); continue; }
      b.addEventListener("click", ev => {
        ev.preventDefault();
        onCardButton(message, b.dataset.arnTerrain, b).catch(err => {
          console.error("Arneyan | terrain card", err);
          ui.notifications.error("That didn't work (the console has the error).");
          b.disabled = false;
        });
      });
    }
  });
}

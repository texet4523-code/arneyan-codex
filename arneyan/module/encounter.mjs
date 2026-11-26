/**
 * Encounter budget (Monsters & Treasure, Building Encounters), shown in the combat tracker and in an
 * Encounter Builder window where the GM drags monsters in, sees the cost, and places them.
 *
 * Budget: 1 point per character, half a point per retainer in the fight (M&T v0.10.83; Keeps & Kingdoms, Retainers).
 * Cost by Level against the party, and by the party's Level (M&T 0.10.93, K317, R-F56): see TIERS.
 * Far below: against a party of 12th or lower, a creature 6 or more Levels below it costs nothing and is never part of a
 * crowd, but only up to the party's number; any more cost ¼ each and count for the crowd rule (R8, Kieran 27 Oct 2026).
 * Against a party of 13th or higher they cost ½ each, like any other creature.
 * Crowds: creatures beyond the party's number (the cheapest) cost double. Level 0 and ¼ count as Level −3, ½ as Level −1.
 * More than 4 Levels above the party: solo rules only. A solo of the party's Level costs the characters' whole budget
 * (retainers' half points stay on top: M&T v0.10.88, Running a Solo).
 * Difficulty: half the budget easy, the full budget hard, double deadly.
 */
import { partyMembers } from "./party.mjs";
import { treasureForFoes } from "./treasure.mjs";
import { isSolo as runsAsSolo } from "./solo.mjs";
import { rollMonsterInitiative } from "./qol.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const SYS = "arneyan";
/**
 * M&T 0.10.93, Building Encounters (K317): a creature's cost by its Level against the party's (5 lower to 4 higher),
 * one row per party tier. 6 or more lower: Far below up to 12th, ½ from 13th.
 */
export const TIERS = [
  { upTo: 4, cost: { "-5": 0.25, "-4": 0.25, "-3": 1 / 3, "-2": 1 / 3, "-1": 2 / 3, "0": 1, "1": 1.5, "2": 2, "3": 2, "4": 3 } },
  { upTo: 8, cost: { "-5": 0.25, "-4": 0.25, "-3": 1 / 3, "-2": 0.5, "-1": 2 / 3, "0": 1, "1": 1.25, "2": 1.25, "3": 1.75, "4": 2 } },
  { upTo: 12, cost: { "-5": 1 / 3, "-4": 0.5, "-3": 0.5, "-2": 2 / 3, "-1": 1, "0": 1, "1": 1.25, "2": 1.25, "3": 1.25, "4": 1.75 } },
  { upTo: Infinity, cost: { "-6": 0.5, "-5": 0.5, "-4": 0.5, "-3": 0.75, "-2": 1, "-1": 1, "0": 1, "1": 1, "2": 1, "3": 1, "4": 1.25 } }
];
/** The cost row for a party Level. */
export const costRow = partyLevel => TIERS.find(t => partyLevel <= t.upTo).cost;
/** What a far-below creature past the free ones costs (M&T: ¼ each). */
const PAST_FREE = 0.25;
/** A budget of whole and half points as the book writes it: 4.5 -> "4½". Budgets are never negative. */
export const halves = v => (Number.isInteger(v) || v < 0 ? String(v) : Number.isInteger(v * 2) ? `${Math.floor(v) || ""}½` : String(v));
const FRACTION = v => ({ 0.0625: "¹⁄₁₆", 0.125: "⅛", [1 / 12]: "¹⁄₁₂", [1 / 6]: "⅙", 0.1875: "³⁄₁₆", 0.25: "¼", 0.3125: "⁵⁄₁₆", 0.375: "⅜", 0.4375: "⁷⁄₁₆", [1 / 3]: "⅓", 0.5: "½", [2 / 3]: "⅔", 0.75: "¾", 1.25: "1¼", 1.5: "1½", 1.75: "1¾" }[v] ?? String(Math.round(v * 100) / 100));

/** The Level used for costing: ½ counts as −1, ¼ and 0 as −3. */
export function effectiveLevel(level, levelText = "") {
  if (levelText === "½") return -1;
  if (levelText === "¼" || level <= 0) return -3;
  return level;
}

/** Levels below the party at which a creature costs nothing (M&T, Building Encounters: far below). */
export const FAR_BELOW = 6;

/** Cost of one creature against a party Level (0 far below it), or null if it's too strong outside the solo rules. */
export function creatureCost(level, partyLevel, levelText = "") {
  const gap = effectiveLevel(level, levelText) - partyLevel;
  const row = costRow(partyLevel);
  if (gap <= -FAR_BELOW) return row["-6"] ?? 0;
  return gap > 4 ? null : row[String(gap)];
}

/**
 * Work out an encounter.
 * @param {number[]} partyLevels  Each character's level.
 * @param {{name:string, level:number, levelText?:string, solo:boolean, count:number}[]} foes
 * @param {{retainers?:number}} [opts]  Retainers fighting with the party: half a point each on the budget. They are not
 *   characters: the party's number (crowds, free far-below creatures, a solo's cost) and its Level stay the characters'.
 */
export function encounterBudget(partyLevels, foes, { retainers = 0 } = {}) {
  const n = partyLevels.length;
  retainers = Math.max(0, Math.floor(Number(retainers) || 0));
  const partyLevel = n ? Math.round(partyLevels.reduce((a, b) => a + b, 0) / n) : 1;
  const warnings = [];
  const singles = [];
  let soloCost = 0, minionCost = 0;
  let free = 0;
  let pastFree = 0;
  // Each foe row's far-below creatures: how many are free and how many pay ¼ (for the Encounter Builder's rows).
  const rows = foes.map(() => ({ free: 0, paid: 0 }));
  // Free slots (far below, up to the party's number) go to solos first, then in the list's order, so the total never
  // depends on which order the foes were added in for the same mix.
  const order = foes.map((f, i) => i).sort((a, b) => Number(!!foes[b].solo) - Number(!!foes[a].solo));
  for (const idx of order) {
    const f = foes[idx];
    const c0 = creatureCost(f.level, partyLevel, f.levelText);
    // A minion costs a quarter of its normal cost (M&T v0.10.76, K163 M8).
    const c = f.minion && !f.solo && c0 ? c0 / 4 : c0;
    // A solo against a party off its Level (M&T v0.10.76, K163 M7).
    const gap = Math.round(Number(f.level) || 0) - partyLevel;
    if (f.solo && f.levelText !== "Mythic" && gap) warnings.push(Math.abs(gap) > 2 ? `${f.name} is ${Math.abs(gap)} Levels ${gap > 0 ? "above" : "below"} the party: further apart than two, don't run it as a solo.`
      : gap > 0 ? `${f.name} is ${gap} Level${gap > 1 ? "s" : ""} above the party: as a solo, the fight is deadly.` : `${f.name} is ${-gap} Level${gap < -1 ? "s" : ""} below the party: as a solo, the fight is hard at most.`);
    for (let i = 0; i < (f.count ?? 1); i++) {
      // Far below: free up to the party's number; past that, ¼ each (R8).
      const far = c === 0 && free >= n;
      if (far) pastFree += 1;
      if (c === 0) rows[idx][far ? "paid" : "free"] += 1;
      if (f.solo) {
        const each = (far ? PAST_FREE : (c ?? costRow(partyLevel)["4"])) * n;
        soloCost += each;
        if (c === 0 && !far) free += 1;
        if (c === null) warnings.push(`${f.name} is more than 4 Levels above the party: cost shown as 4 Levels higher.`);
      } else if (c === null) {
        warnings.push(`${f.name} is more than 4 Levels above the party: run it under the solo rules.`);
        if (f.minion) minionCost += costRow(partyLevel)["4"] / 4;
        else singles.push({ name: f.name, cost: costRow(partyLevel)["4"] });
      } else if (c === 0 && !far) free += 1;
      // Minions ignore the Crowds rule (Keeps & Kingdoms, Minions): their quarter costs sit outside the crowd count.
      else if (f.minion) minionCost += far ? PAST_FREE / 4 : c;
      else singles.push({ name: f.name, cost: far ? PAST_FREE : c });
    }
  }
  // Crowds: each creature beyond the party's number, the cheapest ones, costs double. Free creatures (far below the
  // party, up to its number) are never part of one; far-below creatures past that are.
  const sorted = singles.slice().sort((a, b) => b.cost - a.cost);
  const crowd = Math.max(0, sorted.length - n);
  const doubled = crowd ? sorted.slice(sorted.length - crowd) : [];
  const singleCost = sorted.reduce((t, s) => t + s.cost, 0) + doubled.reduce((t, s) => t + s.cost, 0);
  const total = Math.round((singleCost + soloCost + minionCost) * 100) / 100;
  const budget = n + retainers / 2;
  const r = budget ? total / budget : 0;
  if (!n) return { partyLevel, partySize: 0, budget: 0, total: Math.round((singles.reduce((t, s) => t + s.cost, 0) + soloCost + minionCost) * 100) / 100, ratio: 0, label: "No party", tier: "none", retainers, budgetText: "0", warnings: ["No party members: put the player characters in the Player Characters folder (or add them to the combat)."], costLabel: c => FRACTION(c) };
  const anyFoes = foes.some(f => (f.count ?? 1) > 0);
  const label = !total ? (anyFoes ? "Easy (all far below)" : "No foes") : r <= 0.5 ? "Easy" : r < 1 ? "Between easy and hard" : r === 1 ? "Hard" : r < 2 ? "Between hard and deadly" : r === 2 ? "Deadly" : "Beyond deadly";
  const tier = !total ? (anyFoes ? "easy" : "none") : r <= 0.5 ? "easy" : r <= 1 ? "hard" : r <= 2 ? "deadly" : "beyond";
  if (free) warnings.push(`${free} creature${free === 1 ? " is" : "s are"} ${FAR_BELOW} or more Levels below the party: no cost, and not part of a crowd.`);
  if (pastFree) warnings.push(pastFree === 1
    ? `1 more creature is ${FAR_BELOW} or more Levels below the party: they're free only up to the party's number, so it costs ¼ (a solo ¼ × party; a minion ¹⁄₁₆, outside crowds) and counts for crowds.`
    : `${pastFree} more creatures are ${FAR_BELOW} or more Levels below the party: they're free only up to the party's number, so these cost ¼ each (a solo ¼ × party; a minion ¹⁄₁₆, outside crowds) and count for crowds.`);
  if (crowd) warnings.push(`${crowd} creature${crowd === 1 ? "" : "s"} beyond the party's number cost double (crowds).`);
  return { partyLevel, partySize: n, retainers, budget, budgetText: halves(budget), total, ratio: r, label, tier, warnings, rows, costLabel: c => FRACTION(c) };
}

/**
 * The list's counts fitted to the party: the same mix of foes (in the proportions the list has now), as many as the
 * budget takes without passing `ratio` × the party's budget (0.5 easy, 1 hard, 2 deadly). Solos keep their count; every
 * other foe keeps at least one. Pure, for tests.
 */
export function fitCounts(partyLevels, foes, ratio = 1, max = 50, { retainers = 0 } = {}) {
  const out = foes.map(f => ({ ...f }));
  const open = new Set(out.map((f, i) => i).filter(i => !out[i].solo));
  if (!partyLevels.length || !open.size) return out;
  const target = encounterBudget(partyLevels, [], { retainers }).budget * ratio;
  const weight = i => Math.max(1, Number(foes[i].count) || 1);
  for (const i of open) out[i].count = 1;
  for (let step = 0; step < 600 && open.size; step++) {
    // The foe furthest behind its share of the mix goes up by one, if the budget takes it.
    const i = [...open].sort((a, b) => out[a].count / weight(a) - out[b].count / weight(b) || a - b)[0];
    out[i].count += 1;
    if (out[i].count > max || encounterBudget(partyLevels, out, { retainers }).total > target) { out[i].count -= 1; open.delete(i); }
  }
  return out;
}

/**
 * A stat block's No. appearing as dice: "2d6 (lair 20-200)" gives { wild: "2d6", lair: "1d181 + 19" }.
 * A range "4-36" becomes a flat roll across it. Returns null parts it can't read.
 */
export function parseNumberAppearing(text) {
  const t = String(text ?? "").replace(/(\d),(\d)/g, "$1$2").trim();
  const asDice = s => {
    s = String(s ?? "").trim();
    const range = s.match(/^(\d+)\s*[-\u2013]\s*(\d+)$/);
    if (range) {
      const [lo, hi] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
      return lo === hi ? String(lo) : `1d${hi - lo + 1}${lo > 1 ? ` + ${lo - 1}` : ""}`;
    }
    return /^[\dd\s+*-]+$/i.test(s) && /\d/.test(s) ? s.replace(/\s+/g, " ") : null;
  };
  const lair = t.match(/\(\s*lair\s+([^)]+)\)/i);
  // "1 with 2d6 warriors", "1d4 with slaves" (M&T v0.10.48): the leader's count; the GM adds the rest.
  const wild = t.replace(/\([^)]*\)/g, "").replace(/\s+with\b.*$/i, "").trim();
  return { wild: asDice(wild), lair: lair ? asDice(lair[1]) : null };
}

/* -------------------------------------------- */
/*  Combat tracker                              */
/* -------------------------------------------- */

const FRIENDLY = () => CONST.TOKEN_DISPOSITIONS?.FRIENDLY ?? 1;

function trackerBudget(combat) {
  const pcs = combat.combatants.filter(c => c.actor?.type === "character").map(c => c.actor);
  const party = pcs.length ? pcs : partyMembers();
  // A trap in a fight costs the same as a creature of its Level (Codex, Traps).
  // A solo's second turn (solo.mjs) is the same creature: counted once.
  const foes = combat.combatants.filter(c => ["npc", "hazard"].includes(c.actor?.type) && (c.token?.disposition ?? -1) !== FRIENDLY() && !c.flags?.arneyan?.soloOf)
    .map(c => ({ name: c.name, level: c.actor.system.level ?? 1, levelText: c.actor.system.details?.levelText ?? "", solo: runsAsSolo(c.actor), minion: !!c.actor.system.attributes?.minion, count: 1 }));
  return encounterBudget(party.map(a => a.system.level ?? 1), foes, { retainers: partyRetainers() });
}

/**
 * How many retainers fight with the party: the GM's count in the Encounter Builder (half a point each on the budget).
 * One count per GM, used for every fight until changed (the tracker's budget line too); a saved encounter doesn't keep it.
 * A solo's cost counts the characters only; the retainers' half points add to the budget on top (M&T v0.10.88, Running a Solo;
 * K297), so they make a solo fight easier.
 */
export const partyRetainers = () => Math.max(0, Math.floor(Number(game.user?.getFlag?.(SYS, "encounterRetainers")) || 0));

function onRenderTracker(app, html) {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const combat = app.viewed ?? game.combat;
  if (!root || !combat) return;
  root.querySelector(".arn-budget")?.remove();
  const b = trackerBudget(combat);
  const bar = document.createElement("div");
  bar.className = `arn-budget ${b.tier}`;
  bar.innerHTML = `<span><strong>${b.label}</strong> · ${b.total} of ${b.budgetText} points · party level ${b.partyLevel}${b.retainers ? ` · ${b.retainers} retainer${b.retainers === 1 ? "" : "s"}` : ""}</span>`;
  if (b.warnings.length) bar.dataset.tooltip = b.warnings.join(" ");
  const btn = document.createElement("a");
  btn.className = "arn-budget-open";
  btn.dataset.tooltip = "Encounter Builder";
  btn.innerHTML = '<i class="fa-solid fa-scale-balanced"></i>';
  btn.addEventListener("click", () => ArneyanEncounterBuilder.open());
  bar.append(btn);
  const anchor = root.querySelector(".combat-tracker-header");
  if (anchor) anchor.after(bar);
  else (root.querySelector(".window-content") ?? root).prepend(bar);
}

/* -------------------------------------------- */
/*  Encounter Builder                           */
/* -------------------------------------------- */

export class ArneyanEncounterBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;

  static open() {
    if (!game.user.isGM) return ui.notifications.warn("The Encounter Builder is for the GM.");
    const app = ArneyanEncounterBuilder.#instance ??= new ArneyanEncounterBuilder();
    return app.render({ force: true });
  }

  /** Add a monster (by UUID) to the GM's encounter and open the builder. */
  static async addFoe(uuid) {
    if (!game.user.isGM) return;
    const actor = await fromUuid(uuid);
    if (!["npc", "hazard"].includes(actor?.type)) return ui.notifications.warn("Only monsters, NPCs and traps go in an encounter.");
    const app = ArneyanEncounterBuilder.#instance ??= new ArneyanEncounterBuilder();
    const foes = app.foes;
    const found = foes.find(f => f.uuid === actor.uuid);
    if (found) found.count += 1;
    else foes.push({ uuid: actor.uuid, name: actor.name, img: actor.img, level: actor.system.level ?? 1, levelText: actor.system.details?.levelText ?? "", marked: !!actor.system.details?.isSolo, solo: runsAsSolo(actor), minion: !!actor.system.attributes?.minion, count: 1, na: actor.system.details?.numberAppearing ?? "" });
    await game.user.setFlag(SYS, "encounter", foes);
    return app.render({ force: true });
  }

  /** Replace the GM's foes with these (Encounter Builder rows) and open the builder (a terrain card, A3). */
  static async load(foes) {
    if (!game.user.isGM) return;
    const app = ArneyanEncounterBuilder.#instance ??= new ArneyanEncounterBuilder();
    await game.user.setFlag(SYS, "encounter", foes);
    return app.render({ force: true });
  }

  /** Place these foes on the current scene as they're listed (a terrain card's Place button); the builder's list stays. */
  static async placeFoes(foes) {
    if (!game.user.isGM) return;
    const app = ArneyanEncounterBuilder.#instance ??= new ArneyanEncounterBuilder();
    return ArneyanEncounterBuilder.#place.call(app, { counts: true, foes: foundry.utils.deepClone(foes) });
  }

  static DEFAULT_OPTIONS = {
    id: "arneyan-encounter-builder",
    classes: ["arneyan", "arn-encounter-app"],
    position: { width: 520, height: 640 },
    window: { title: "Encounter Builder", icon: "fa-solid fa-scale-balanced", resizable: true },
    actions: {
      more: ArneyanEncounterBuilder.#more,
      less: ArneyanEncounterBuilder.#less,
      remove: ArneyanEncounterBuilder.#remove,
      clear: ArneyanEncounterBuilder.#clear,
      place: ArneyanEncounterBuilder.#place,
      placeStart: ArneyanEncounterBuilder.#placeStart,
      fit: ArneyanEncounterBuilder.#fit,
      rollNumber: ArneyanEncounterBuilder.#rollNumber,
      retainerMore: ArneyanEncounterBuilder.#retainerMore,
      retainerLess: ArneyanEncounterBuilder.#retainerLess,
      soloToggle: ArneyanEncounterBuilder.#soloToggle,
      minionToggle: ArneyanEncounterBuilder.#minionToggle,
      loadReady: ArneyanEncounterBuilder.#loadReady,
      treasure: ArneyanEncounterBuilder.#treasure,
      saveEncounter: ArneyanEncounterBuilder.#saveEncounter,
      loadEncounter: ArneyanEncounterBuilder.#loadEncounter,
      deleteEncounter: ArneyanEncounterBuilder.#deleteEncounter,
      bestiary: () => game.arneyan?.browser?.({ tab: "monsters" })
    }
  };

  static PARTS = { main: { template: "systems/arneyan/templates/apps/encounter.hbs" } };

  get foes() {
    // Lists saved before 0.10.109 say solo: true for a creature marked Solo: it can be toggled like a new one.
    return foundry.utils.deepClone(game.user.getFlag(SYS, "encounter") ?? []).map(f => ({ ...f, marked: f.marked ?? !!f.solo }));
  }

  async _setFoes(foes) {
    await game.user.setFlag(SYS, "encounter", foes);
    this.render();
  }

  async _prepareContext() {
    const party = partyMembers();
    const foes = this.foes;
    const b = encounterBudget(party.map(a => a.system.level ?? 1), foes, { retainers: partyRetainers() });
    return {
      party: party.map(a => ({ name: a.name, img: a.img, level: a.system.level ?? 1 })),
      foes: foes.map((f, i) => {
        const c0 = creatureCost(f.level, b.partyLevel, f.levelText);
        const c = f.minion && !f.solo && c0 ? c0 / 4 : c0; // a minion's row shows its quarter cost
        // Far below: free up to the party's number, then ¼ (R8): the row says which.
        const fr = b.rows?.[i] ?? { free: 0, paid: 0 };
        const pf = f.solo ? "¼ × party" : f.minion ? "¹⁄₁₆" : "¼"; // past the free ones: ¼, a minion a quarter of that
        const far = !fr.paid ? "free (far below)" : !fr.free ? `${pf} (far below, past the free ones)` : `free × ${fr.free}, ${pf} × ${fr.paid} (far below)`;
        return { ...f, i, mythic: f.levelText === "Mythic", levelLabel: f.levelText || f.level, cost: c === 0 ? far : f.solo ? `${b.costLabel(c ?? costRow(b.partyLevel)["4"])} × party` : c === null ? "solo only" : b.costLabel(c), canRoll: !!parseNumberAppearing(f.na).wild && f.na !== "1" };
      }),
      b, pct: Math.min(100, Math.round((b.total / Math.max(1, b.budget * 2)) * 100)),
      naMode: game.user.getFlag(SYS, "encounterNa") ?? "off",
      naModes: [["off", "Place the counts above"], ["wild", "Roll No. appearing (in the wild)"], ["lair", "Roll No. appearing (in the lair)"]].map(([id, label]) => ({ id, label })),
      saved: (game.settings.get(SYS, "savedEncounters") ?? []).map(e => ({ id: e.id, name: e.name, summary: e.foes.map(f => `${f.name} × ${f.count}`).join(", ") })),
      ready: await readyMade(party.map(a => a.system.level ?? 1))
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const [sel, flag] of [[".arn-enc-ready-terrain", "encounterReadyTerrain"], [".arn-enc-ready-band", "encounterReadyBand"]]) {
      this.element.querySelector(sel)?.addEventListener("change", async ev => { await game.user.setFlag(SYS, flag, ev.target.value); this.render(); });
    }
    this.element.querySelector(".arn-enc-na")?.addEventListener("change", async ev => {
      await game.user.setFlag(SYS, "encounterNa", ev.target.value);
      this.render();
    });
    const zone = this.element.querySelector(".arn-enc-drop");
    zone?.addEventListener("dragover", ev => ev.preventDefault());
    zone?.addEventListener("drop", async ev => {
      ev.preventDefault();
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev);
      if (data?.type !== "Actor") return;
      return ArneyanEncounterBuilder.addFoe(data.uuid);
    });
  }

  static #more(event, target) { const f = this.foes; f[Number(target.dataset.i)].count += 1; return this._setFoes(f); }
  static #less(event, target) {
    const f = this.foes;
    const x = f[Number(target.dataset.i)];
    x.count -= 1;
    return this._setFoes(x.count > 0 ? f : f.filter((_, i) => i !== Number(target.dataset.i)));
  }
  /** A creature marked Solo: run it as a solo (the whole budget, phases, two turns) or as a normal creature (R-F33). */
  static #soloToggle(event, target) {
    const f = this.foes;
    const x = f[Number(target.dataset.i)];
    if (!x?.marked || x.levelText === "Mythic") return;
    x.solo = !x.solo;
    return this._setFoes(f);
  }
  /** Place a group as minions (1 HP; a quarter of the cost), or as it is. A solo can't be a minion. */
  static #minionToggle(event, target) {
    const f = this.foes;
    const x = f[Number(target.dataset.i)];
    if (!x || x.solo) return;
    x.minion = !x.minion;
    return this._setFoes(f);
  }
  /** Load a ready-made encounter (A3), fitted to the party: entries 7 and 8 to Deadly, the rest to Hard (K210). */
  static async #loadReady(event, target) {
    const T = await import("./terrain.mjs");
    const data = await T.terrainData();
    const terrain = game.user.getFlag(SYS, "encounterReadyTerrain") || T.TERRAINS[0];
    const levels = partyMembers().map(a => a.system.level ?? 1);
    const pl = T.partyLevelOf(levels);
    const band = game.user.getFlag(SYS, "encounterReadyBand") || T.bandOf(pl);
    const row = data.terrains.find(t => t.name === terrain)?.bands?.[band]?.[Number(target.dataset.n) - 1];
    if (!row?.options) return;
    const deadly = Number(target.dataset.n) >= 7;
    const option = T.pickOption(row, pl, deadly) ?? row.options[0];
    if (!T.suits(option, pl)) ui.notifications.warn(`${row.label} doesn't suit a party of Level ${pl}: loaded all the same.`);
    return this._setFoes(levels.length ? T.fitOption(option, levels, deadly, { retainers: partyRetainers() }) : T.fitOption(option, [], deadly));
  }
  /** Retainers fighting with the party (Keeps & Kingdoms): half a point each on the budget. The GM's own count. */
  static async #retainerMore() { await game.user.setFlag(SYS, "encounterRetainers", Math.min(20, partyRetainers() + 1)); ui.combat?.render(); return this.render(); }
  static async #retainerLess() { await game.user.setFlag(SYS, "encounterRetainers", Math.max(0, partyRetainers() - 1)); ui.combat?.render(); return this.render(); }
  static #remove(event, target) { return this._setFoes(this.foes.filter((_, i) => i !== Number(target.dataset.i))); }
  /** Fit the counts to the party: easy (half the budget), hard (the budget) or deadly (twice it). */
  static async #fit(event, target) {
    const levels = partyMembers().map(a => a.system.level ?? 1);
    if (!levels.length) return ui.notifications.warn("No party members: put the player characters in the party first.");
    const ratio = Number(target.dataset.ratio) || 1;
    const retainers = partyRetainers();
    const fitted = fitCounts(levels, this.foes, ratio, MAX_PLACE, { retainers });
    await this._setFoes(fitted);
    const b = encounterBudget(levels, fitted, { retainers });
    if (b.total > b.budget * ratio) ui.notifications.info(`One of each already costs ${b.total} of ${b.budgetText} points: ${b.label}.`);
  }
  static #clear() { return this._setFoes([]); }

  /** Roll a group's No. appearing (in the wild, or in its lair with Shift held) and use it as the count. */
  static async #rollNumber(event, target) {
    const f = this.foes;
    const x = f[Number(target.dataset.i)];
    const n = await rollNumberAppearing(x, event?.shiftKey ? "lair" : "wild");
    if (n === null) return ui.notifications.warn(`Can't read ${x.name}'s No. appearing ("${x.na || "none"}").`);
    x.count = Math.clamp(n, 1, MAX_PLACE);
    if (n > MAX_PLACE) ui.notifications.warn(`Rolled ${n}: placing ${MAX_PLACE} at most. Add more by hand if you really want them all.`);
    ui.notifications.info(`${x.name}: ${x.count} appear (${x.na}).`);
    return this._setFoes(f);
  }

  static #treasure() { return treasureForFoes(this.foes); }

  static async #saveEncounter() {
    const foes = this.foes;
    if (!foes.length) return ui.notifications.warn("Add some foes first.");
    const name = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Save encounter" }, content: `<div class="form-group"><label>Name</label><input type="text" name="name" value="${foundry.utils.escapeHTML(foes.map(f => f.name).join(" and ").slice(0, 60))}" autofocus></div>`,
      ok: { label: "Save", icon: "fa-solid fa-floppy-disk", callback: (ev, button) => button.form.elements.name.value.trim() }, rejectClose: false
    }).catch(() => null);
    if (!name) return;
    const list = foundry.utils.deepClone(game.settings.get(SYS, "savedEncounters") ?? []);
    list.push({ id: foundry.utils.randomID(), name, foes, savedAt: Date.now() });
    await game.settings.set(SYS, "savedEncounters", list);
    ui.notifications.info(`Encounter "${name}" saved.`);
    this.render();
  }

  static async #loadEncounter(event, target) {
    const e = (game.settings.get(SYS, "savedEncounters") ?? []).find(x => x.id === target.closest("[data-enc-id]")?.dataset.encId);
    if (e) return this._setFoes(foundry.utils.deepClone(e.foes));
  }

  static async #deleteEncounter(event, target) {
    const id = target.closest("[data-enc-id]")?.dataset.encId;
    const list = game.settings.get(SYS, "savedEncounters") ?? [];
    const e = list.find(x => x.id === id);
    if (!e) return;
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Delete encounter" }, content: `<p>Delete the saved encounter <strong>${foundry.utils.escapeHTML(e.name)}</strong>?</p>` });
    if (!ok) return;
    await game.settings.set(SYS, "savedEncounters", list.filter(x => x.id !== id));
    this.render();
  }

  /** Put the encounter's monsters on the current scene, hostile, around the middle of the view. */
  static async #place(options = {}) {
    const scene = canvas.scene;
    if (!scene) return ui.notifications.warn("Open a scene first.");
    const size = scene.grid.size;
    const c = canvas.stage?.pivot ?? { x: scene.dimensions.width / 2, y: scene.dimensions.height / 2 };
    const data = [];
    const runs = [];
    const mins = [];
    let i = 0;
    // No. appearing rolled for each group as it's placed (the counts in the list follow).
    // A terrain card places its own numbers: the No. appearing setting is for the builder's own Place button.
    const given = Array.isArray(options?.foes) ? options.foes : null;
    const mode = options?.counts === true ? "off" : (game.user.getFlag(SYS, "encounterNa") ?? "off");
    let foes = given ?? this.foes;
    if (mode !== "off") {
      const rolled = [];
      for (const f of foes) {
        const n = await rollNumberAppearing(f, mode);
        if (n !== null) { f.count = Math.clamp(n, 1, MAX_PLACE); rolled.push(`${f.name} ${f.count}${n > MAX_PLACE ? ` (rolled ${n})` : ""}`); }
      }
      await this._setFoes(foes);
      foes = this.foes;
      if (rolled.length) ui.notifications.info(`No. appearing: ${rolled.join(", ")}.`);
    }
    for (const f of foes) {
      const actor = await fromUuid(f.uuid);
      if (!actor) continue;
      // Compendium monsters are imported to the world first.
      const world = actor.pack ? (game.actors.find(a => a._stats?.compendiumSource === actor.uuid)
        ?? await game.actors.importFromCompendium(game.packs.get(actor.pack), actor.id)) : actor;
      for (let n = 0; n < f.count; n++, i++) {
        const col = i % 5, row = Math.floor(i / 5);
        const pos = { x: c.x + (col - 2) * size, y: c.y + row * size };
        const snapped = canvas.grid?.getSnappedPoint ? canvas.grid.getSnappedPoint(pos, { mode: CONST.GRID_SNAPPING_MODES?.TOP_LEFT_CORNER ?? 256 }) : pos;
        const doc = await world.getTokenDocument({ ...snapped, disposition: CONST.TOKEN_DISPOSITIONS?.HOSTILE ?? -1 });
        data.push(doc.toObject());
        runs.push(!!f.solo);
        mins.push(!!f.minion && !f.solo);
      }
    }
    const made = data.length ? await scene.createEmbeddedDocuments("Token", data) : [];
    // Run as a solo, as the list says: each placed token's own actor (a linked one's world actor) is ticked.
    for (const [k, t] of made.entries()) {
      const a = t.actor;
      if (!a?.system?.details?.isSolo || a.system.details.levelText === "Mythic" || !!a.system.details.runSolo === runs[k]) continue;
      await a.update({ "system.details.runSolo": runs[k] }).catch(() => null);
    }
    // Placed as minions, as the list says: each token's own actor (1 HP; unlinked tokens keep it to themselves).
    const linked = new Set();
    for (const [k, t] of made.entries()) {
      const a = t.actor;
      // A linked token shares its world actor: making it a minion would change every copy, so it's left as it is.
      if (!mins[k] || a?.type !== "npc" || a.system.attributes?.minion) continue;
      if (t.actorLink) { linked.add(t.name); continue; }
      await a.update({ "system.attributes.minion": true }).catch(err => console.warn("Arneyan | minion", err));
    }
    if (linked.size) ui.notifications.warn(`Not made minions, as their tokens are linked (that would change the actors themselves): ${[...linked].join(", ")}.`);
    ui.notifications.info(`${data.length} token${data.length === 1 ? "" : "s"} placed.`);
    return made;
  }

  /**
   * Place the foes, then put them and the party's tokens on this scene into the tracker and begin the fight
   * (initiative follows the usual rules for a new combat). A fight already running on the scene takes the newcomers.
   */
  static async #placeStart() {
    const made = await ArneyanEncounterBuilder.#place.call(this, {});
    const scene = canvas.scene;
    if (!scene || !made?.length) return;
    const mine = c => (c.scene?.id ?? c.sceneId ?? scene.id) === scene.id;
    let combat = game.combats.find(c => mine(c) && c.started) ?? game.combats.find(c => mine(c));
    combat ??= await getDocumentClass("Combat").create({ scene: scene.id, active: true });
    const have = new Set(combat.combatants.map(c => c.tokenId));
    const ids = new Set(partyMembers().map(a => a.id));
    const heroes = scene.tokens.filter(t => t.actorId && ids.has(t.actorId));
    const add = [...made, ...heroes].filter(t => !have.has(t.id)).map(t => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId, hidden: !!t.hidden }));
    if (add.length) await combat.createEmbeddedDocuments("Combatant", add);
    // A fight already running: the newcomers roll initiative now (a new fight rolls it as it starts).
    if (add.length && combat.started) await rollMonsterInitiative(combat).catch(err => console.warn("Arneyan | initiative for the newcomers", err));
    if (!heroes.length) ui.notifications.warn("None of the party's tokens are on this scene: add them to the tracker yourself.");
    if (!combat.active) await combat.activate?.();
    if (!combat.started) await combat.startCombat();
  }
}

/** Roll a foe's No. appearing ("wild" or "lair"); null when the stat block's entry can't be read. */
/** A lair roll can reach 200: one click places no more than this many of one foe. */
const MAX_PLACE = 50;

async function rollNumberAppearing(foe, mode = "wild") {
  let na = foe.na;
  if (na === undefined) na = (await fromUuid(foe.uuid).catch(() => null))?.system?.details?.numberAppearing ?? "";
  const p = parseNumberAppearing(na);
  const formula = (mode === "lair" && p.lair) || p.wild;
  if (!formula) return null;
  return (await new Roll(formula).evaluate()).total;
}

/** The Encounter Builder's Ready-made list (A3): the GM's terrain and band (by default the party's), each entry. */
async function readyMade(levels) {
  const T = await import("./terrain.mjs");
  const data = await T.terrainData().catch(() => null);
  if (!data) return null;
  const pl = T.partyLevelOf(levels);
  const terrain = game.user.getFlag(SYS, "encounterReadyTerrain") || T.TERRAINS[0];
  const band = game.user.getFlag(SYS, "encounterReadyBand") || T.bandOf(pl);
  const rows = data.terrains.find(t => t.name === terrain)?.bands?.[band] ?? [];
  return {
    terrains: T.TERRAINS.map(t => ({ id: t, label: t, selected: t === terrain })),
    bands: data.bands.map(b => ({ id: b, label: `Levels ${b}`, selected: b === band })),
    partyBand: T.bandOf(pl),
    rows: rows.slice(1).map((r, i) => ({ n: i + 2, label: r.label, text: r.options.map(T.optionText).join(" or "), deadly: i + 2 >= 7,
      suits: r.options.some(o => T.suits(o, pl)) }))
  };
}

export function registerEncounters() {
  game.settings.register(SYS, "savedEncounters", { scope: "world", config: false, type: Array, default: [] });
  Hooks.on("renderCombatTracker", onRenderTracker);
}

/**
 * Encounter budget (Monsters & Treasure, Building Encounters), shown in the combat tracker and in an
 * Encounter Builder window where the GM drags monsters in, sees the cost, and places them.
 *
 * Budget: 1 point per character. Cost by Level against the party:
 *   4+ lower ¼, 3 lower ⅓, 2 lower ½, 1 lower ¾, equal 1, 1 higher 1½, 2 higher 2, 3 higher 3, 4 higher 4.
 * Far below: a creature 6 or more Levels below the party costs nothing and is never part of a crowd, but only up to the
 * party's number; any more cost ¼ each and count for the crowd rule (R8, Kieran 27 Oct 2026).
 * Crowds: creatures beyond the party's number (the cheapest) cost double. Level 0 and ¼ count as Level −3, ½ as Level −1.
 * More than 4 Levels above the party: solo rules only. A solo of the party's Level costs the whole budget.
 * Difficulty: half the budget easy, the full budget hard, double deadly.
 */
import { partyMembers } from "./party.mjs";
import { treasureForFoes } from "./treasure.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const SYS = "arneyan";
const LADDER = { "-4": 0.25, "-3": 1 / 3, "-2": 0.5, "-1": 0.75, "0": 1, "1": 1.5, "2": 2, "3": 3, "4": 4 };
const FRACTION = v => ({ 0.25: "¼", [1 / 3]: "⅓", 0.5: "½", 0.75: "¾", 1.5: "1½" }[v] ?? String(Math.round(v * 100) / 100));

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
  if (gap <= -FAR_BELOW) return 0;
  const d = Math.max(-4, gap);
  return d > 4 ? null : LADDER[String(d)];
}

/**
 * Work out an encounter.
 * @param {number[]} partyLevels  Each character's level.
 * @param {{name:string, level:number, levelText?:string, solo:boolean, count:number}[]} foes
 */
export function encounterBudget(partyLevels, foes) {
  const n = partyLevels.length;
  const partyLevel = n ? Math.round(partyLevels.reduce((a, b) => a + b, 0) / n) : 1;
  const warnings = [];
  const singles = [];
  let soloCost = 0;
  let free = 0;
  let pastFree = 0;
  for (const f of foes) {
    const c = creatureCost(f.level, partyLevel, f.levelText);
    for (let i = 0; i < (f.count ?? 1); i++) {
      // Far below: free up to the party's number; past that, ¼ each (R8).
      const far = c === 0 && free >= n;
      if (far) pastFree += 1;
      if (f.solo) {
        const each = (far ? LADDER["-4"] : (c ?? LADDER["4"])) * n;
        soloCost += each;
        if (c === 0 && !far) free += 1;
        if (c === null) warnings.push(`${f.name} is more than 4 Levels above the party: cost shown as 4 Levels higher.`);
      } else if (c === null) {
        warnings.push(`${f.name} is more than 4 Levels above the party: run it under the solo rules.`);
        singles.push({ name: f.name, cost: LADDER["4"] });
      } else if (c === 0 && !far) free += 1;
      else singles.push({ name: f.name, cost: far ? LADDER["-4"] : c });
    }
  }
  // Crowds: each creature beyond the party's number, the cheapest ones, costs double. Free creatures (far below the
  // party, up to its number) are never part of one; far-below creatures past that are.
  const sorted = singles.slice().sort((a, b) => b.cost - a.cost);
  const crowd = Math.max(0, sorted.length - n);
  const doubled = crowd ? sorted.slice(sorted.length - crowd) : [];
  const singleCost = sorted.reduce((t, s) => t + s.cost, 0) + doubled.reduce((t, s) => t + s.cost, 0);
  const total = Math.round((singleCost + soloCost) * 100) / 100;
  const budget = n;
  const r = budget ? total / budget : 0;
  if (!n) return { partyLevel, partySize: 0, budget: 0, total: Math.round((singles.reduce((t, s) => t + s.cost, 0)) * 100) / 100, ratio: 0, label: "No party", tier: "none", warnings: ["No party members: put the player characters in the Player Characters folder (or add them to the combat)."], costLabel: c => FRACTION(c) };
  const anyFoes = foes.some(f => (f.count ?? 1) > 0);
  const label = !total ? (anyFoes ? "Easy (all far below)" : "No foes") : r <= 0.5 ? "Easy" : r < 1 ? "Between easy and hard" : r === 1 ? "Hard" : r < 2 ? "Between hard and deadly" : r === 2 ? "Deadly" : "Beyond deadly";
  const tier = !total ? (anyFoes ? "easy" : "none") : r <= 0.5 ? "easy" : r <= 1 ? "hard" : r <= 2 ? "deadly" : "beyond";
  if (free) warnings.push(`${free} creature${free === 1 ? " is" : "s are"} ${FAR_BELOW} or more Levels below the party: no cost, and not part of a crowd.`);
  if (pastFree) warnings.push(`${pastFree} more creature${pastFree === 1 ? " is" : "s are"} ${FAR_BELOW} or more Levels below the party: free only up to the party's number, so ${pastFree === 1 ? "it costs" : "they cost"} ¼ each and count for crowds.`);
  if (crowd) warnings.push(`${crowd} creature${crowd === 1 ? "" : "s"} beyond the party's number cost double (crowds).`);
  return { partyLevel, partySize: n, budget, total, ratio: r, label, tier, warnings, costLabel: c => FRACTION(c) };
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
  const wild = t.replace(/\([^)]*\)/g, "").trim();
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
  const foes = combat.combatants.filter(c => ["npc", "hazard"].includes(c.actor?.type) && (c.token?.disposition ?? -1) !== FRIENDLY())
    .map(c => ({ name: c.name, level: c.actor.system.level ?? 1, levelText: c.actor.system.details?.levelText ?? "", solo: !!c.actor.system.details?.isSolo, count: 1 }));
  return encounterBudget(party.map(a => a.system.level ?? 1), foes);
}

function onRenderTracker(app, html) {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const combat = app.viewed ?? game.combat;
  if (!root || !combat) return;
  root.querySelector(".arn-budget")?.remove();
  const b = trackerBudget(combat);
  const bar = document.createElement("div");
  bar.className = `arn-budget ${b.tier}`;
  bar.innerHTML = `<span><strong>${b.label}</strong> · ${b.total} of ${b.budget} points · party level ${b.partyLevel}</span>`;
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
    else foes.push({ uuid: actor.uuid, name: actor.name, img: actor.img, level: actor.system.level ?? 1, levelText: actor.system.details?.levelText ?? "", solo: !!actor.system.details?.isSolo, count: 1, na: actor.system.details?.numberAppearing ?? "" });
    await game.user.setFlag(SYS, "encounter", foes);
    return app.render({ force: true });
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
      rollNumber: ArneyanEncounterBuilder.#rollNumber,
      treasure: ArneyanEncounterBuilder.#treasure,
      saveEncounter: ArneyanEncounterBuilder.#saveEncounter,
      loadEncounter: ArneyanEncounterBuilder.#loadEncounter,
      deleteEncounter: ArneyanEncounterBuilder.#deleteEncounter,
      bestiary: () => game.arneyan?.browser?.({ tab: "monsters" })
    }
  };

  static PARTS = { main: { template: "systems/arneyan/templates/apps/encounter.hbs" } };

  get foes() {
    return foundry.utils.deepClone(game.user.getFlag(SYS, "encounter") ?? []);
  }

  async _setFoes(foes) {
    await game.user.setFlag(SYS, "encounter", foes);
    this.render();
  }

  async _prepareContext() {
    const party = partyMembers();
    const foes = this.foes;
    const b = encounterBudget(party.map(a => a.system.level ?? 1), foes);
    return {
      party: party.map(a => ({ name: a.name, img: a.img, level: a.system.level ?? 1 })),
      foes: foes.map((f, i) => {
        const c = creatureCost(f.level, b.partyLevel, f.levelText);
        return { ...f, i, levelLabel: f.levelText || f.level, cost: c === 0 ? "free (far below, up to the party's number)" : f.solo ? `${c === null ? "4" : b.costLabel(c)} × party` : c === null ? "solo only" : b.costLabel(c), canRoll: !!parseNumberAppearing(f.na).wild && f.na !== "1" };
      }),
      b, pct: Math.min(100, Math.round((b.total / Math.max(1, b.budget * 2)) * 100)),
      naMode: game.user.getFlag(SYS, "encounterNa") ?? "off",
      naModes: [["off", "Place the counts above"], ["wild", "Roll No. appearing (in the wild)"], ["lair", "Roll No. appearing (in the lair)"]].map(([id, label]) => ({ id, label })),
      saved: (game.settings.get(SYS, "savedEncounters") ?? []).map(e => ({ id: e.id, name: e.name, summary: e.foes.map(f => `${f.name} × ${f.count}`).join(", ") }))
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
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
  static #remove(event, target) { return this._setFoes(this.foes.filter((_, i) => i !== Number(target.dataset.i))); }
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
  static async #place() {
    const scene = canvas.scene;
    if (!scene) return ui.notifications.warn("Open a scene first.");
    const size = scene.grid.size;
    const c = canvas.stage?.pivot ?? { x: scene.dimensions.width / 2, y: scene.dimensions.height / 2 };
    const data = [];
    let i = 0;
    // No. appearing rolled for each group as it's placed (the counts in the list follow).
    const mode = game.user.getFlag(SYS, "encounterNa") ?? "off";
    let foes = this.foes;
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
      }
    }
    if (data.length) await scene.createEmbeddedDocuments("Token", data);
    ui.notifications.info(`${data.length} token${data.length === 1 ? "" : "s"} placed.`);
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

export function registerEncounters() {
  game.settings.register(SYS, "savedEncounters", { scope: "world", config: false, type: Array, default: [] });
  Hooks.on("renderCombatTracker", onRenderTracker);
}

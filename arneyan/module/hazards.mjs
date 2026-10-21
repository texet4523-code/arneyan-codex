/**
 * Hazards and traps (a "hazard" actor, PF2e style), and the environmental timers of the Codex's Environmental
 * Hazards: holding your breath and suffocation (drowning uses the same clock), extreme heat and extreme cold.
 *
 * A hazard's sheet asks the party to spot it or disarm it (a group roll card), and its Trigger button posts what it
 * does: an attack roll against the targets, a save button and a damage button that use the usual cards (Apply,
 * Apply by saves).
 */
import { ARNEYAN } from "./config.mjs";
import { d20Roll, damageRoll } from "./rolls.mjs";
import { HazardData } from "./data/hazard-models.mjs";
import { partyMembers } from "./party.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const SYS = "arneyan";
const HAZARD_IMG = `systems/${SYS}/assets/icons/hazard-box-trap.svg`;
const ENV_IMG = `systems/${SYS}/assets/icons/hazard-hazard-sign.svg`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const gms = () => game.users.filter(u => u.isGM).map(u => u.id);

/* -------------------------------------------- */
/*  Hazard cards                                */
/* -------------------------------------------- */

/** The trigger card's HTML: what sets it off, what it does, and its buttons. */
export function triggerCardHtml(actor) {
  const s = actor.system;
  const uuid = esc(actor.uuid);
  const btns = [];
  if (s.attack.damage || s.attack.bonus) btns.push(`<button type="button" class="arn-hz-attack" data-actor-uuid="${uuid}"><i class="fa-solid fa-crosshairs"></i> ${esc(s.attack.label || "Attack")} ${s.attack.bonus >= 0 ? "+" : ""}${s.attack.bonus}</button>`);
  if (s.save.key) btns.push(`<button type="button" class="arn-save-btn" data-save="${s.save.key}" data-dc="${s.save.dc}" data-source="${esc(actor.name)}"><i class="fa-solid fa-shield-halved"></i> ${ARNEYAN.saves[s.save.key].label} save, DC ${s.save.dc}</button>`);
  if (s.save.damage) btns.push(`<button type="button" class="arn-hz-damage" data-actor-uuid="${uuid}" data-which="save"><i class="fa-solid fa-burst"></i> ${esc(s.save.damage)} ${esc(s.save.damageType)} damage${s.save.key ? ` (${{ half: "half on a save", negates: "none on a save", none: "even on a save" }[s.save.onSave]})` : ""}</button>`);
  const cond = s.save.condition && ARNEYAN.conditions?.[s.save.condition] ? `<p>On a failed save: @Condition[${s.save.condition}]{${esc(ARNEYAN.conditions[s.save.condition].name)}}</p>` : "";
  return `<div class="arn-card arn-hazard-card"><header class="arn-card-title"><img src="${esc(actor.img)}" alt=""> <span>${esc(actor.name)}</span><span class="arn-mode">${s.complex ? "Complex hazard" : "Hazard"} ${s.level}</span></header>
    ${s.trigger ? `<p><strong>Trigger:</strong> ${esc(s.trigger)}</p>` : ""}
    ${s.effect ? `<p><strong>Effect:</strong> ${esc(s.effect)}</p>` : ""}
    ${cond}
    ${btns.length ? `<div class="arn-card-buttons">${btns.join("")}</div>` : ""}
    ${s.reset ? `<p class="arn-card-meta"><strong>${s.complex ? "Routine" : "Reset"}:</strong> ${esc(s.reset)}</p>` : ""}</div>`;
}

export async function triggerHazard(actor) {
  if (!actor?.isOwner) return;
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: triggerCardHtml(actor) });
}

/** The hazard's attack against the targeted tokens (their AC on the card). */
export async function hazardAttack(actor, event = null) {
  if (!actor?.isOwner) return;
  const s = actor.system;
  const targets = Array.from(game.user.targets ?? []).filter(t => t.actor).map(t => ({ name: t.name, ac: t.actor.acTotal ?? null, uuid: t.actor.uuid }));
  const mode = event?.shiftKey && !event?.ctrlKey ? 1 : event?.ctrlKey && !event?.shiftKey ? -1 : 0;
  return d20Roll({
    actor, kind: "attack", mode, title: `${actor.name}: ${s.attack.label || "attack"}`, targets,
    parts: [{ label: "Attack", value: s.attack.bonus }],
    footer: ({ natural }) => s.attack.damage ? `<button type="button" class="arn-hz-damage" data-actor-uuid="${esc(actor.uuid)}" data-which="attack" data-crit="${natural === 20 ? 1 : 0}"><i class="fa-solid fa-burst"></i> Damage ${esc(s.attack.damage)}${natural === 20 ? " (critical)" : ""}</button>` : ""
  });
}

/** Damage from the attack or the save, as a normal damage card (Apply, and Apply by saves for a save). */
export async function hazardDamage(actor, which = "save", crit = false) {
  if (!actor?.isOwner) return ui.notifications.warn("The GM rolls the hazard's damage.");
  const s = actor.system;
  const d = which === "attack" ? s.attack : s.save;
  if (!d.damage) return;
  const type = Object.hasOwn(ARNEYAN.damageTypes, d.damageType) ? d.damageType : "";
  return damageRoll({ actor, title: `${actor.name}: Damage`, formula: d.damage, damageType: type, crit: which === "attack" && crit, spell: which === "save" && s.save.key ? actor.name : "" });
}

/* -------------------------------------------- */
/*  The Codex's Traps table                     */
/* -------------------------------------------- */

/** Find and Disarm DC, Save DC and damage dice by Trap Level (Codex, Traps), each row up to its top Level. */
export const TRAP_TABLE = [
  { upTo: 4, find: 12, save: 12, dice: 2 },
  { upTo: 8, find: 15, save: 14, dice: 4 },
  { upTo: 12, find: 15, save: 16, dice: 6 },
  { upTo: 16, find: 20, save: 18, dice: 8 },
  { upTo: 20, find: 20, save: 20, dice: 10 },
  { upTo: 24, find: 20, save: 22, dice: 12 }
];

/** A trap's numbers by its Level: { find, save, damage }. Deadly: +2 to both DCs and double the damage. Past 24 uses the last row. */
export function trapNumbers(level, deadly = false) {
  const row = TRAP_TABLE.find(r => Math.max(1, Number(level) || 0) <= r.upTo) ?? TRAP_TABLE.at(-1);
  const plus = deadly ? 2 : 0;
  return { find: row.find + plus, save: row.save + plus, damage: `${row.dice * (deadly ? 2 : 1)}d6` };
}

/** The changes that give a hazard the Traps table's numbers for its Level (spotting, disarming, the save and damage). */
export function trapUpdate(system) {
  const t = trapNumbers(system.level, system.deadly);
  return {
    "system.spot.ability": "wis", "system.spot.dc": t.find,
    "system.disable.ability": "int", "system.disable.dc": t.find,
    "system.save.key": system.save?.key || "ref", "system.save.dc": t.save,
    "system.save.damage": t.damage
  };
}

/* -------------------------------------------- */
/*  Hazard sheet                                */
/* -------------------------------------------- */

export class ArneyanHazardSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["arneyan", "sheet", "actor", "hazard"],
    position: { width: 620, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      spot: ArneyanHazardSheet.#spot,
      disarm: ArneyanHazardSheet.#disarm,
      trigger: ArneyanHazardSheet.#trigger,
      attack: ArneyanHazardSheet.#attack,
      damage: ArneyanHazardSheet.#damage,
      trapTable: ArneyanHazardSheet.#trapTable,
      editDescription: ArneyanHazardSheet.#editDescription
    }
  };

  static PARTS = { sheet: { template: "systems/arneyan/templates/actor/hazard-sheet.hbs", scrollable: [".arn-body"] } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const s = actor.system;
    Object.assign(context, {
      actor, system: s, source: actor._source.system, editable: this.isEditable, isGM: game.user.isGM,
      abilities: ARNEYAN.abilities,
      saves: { "": "No save", ...Object.fromEntries(Object.entries(ARNEYAN.saves).map(([k, v]) => [k, v.label])) },
      onSave: { half: "Half damage on a save", negates: "No effect on a save", none: "Full damage anyway" },
      kinds: { trap: "Trap", environmental: "Environmental", magical: "Magical", haunt: "Haunt" },
      damageTypes: { "": "Untyped", ...Object.fromEntries(Object.entries(ARNEYAN.damageTypes).filter(([k]) => k !== "healing")) },
      conditions: { "": "None", ...Object.fromEntries(Object.entries(ARNEYAN.conditions ?? {}).filter(([k]) => k !== "concentrating").map(([k, c]) => [k, c.name])) },
      spotLabel: `${ARNEYAN.abilities[s.spot.ability]} check, DC ${s.spot.dc}`,
      disableLabel: `${s.disable.skill || ARNEYAN.abilities[s.disable.ability]} check, DC ${s.disable.dc}`,
      description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(s.details.description ?? "", { relativeTo: actor, secrets: actor.isOwner })
    });
    return context;
  }

  static #spot() {
    const s = this.document.system;
    return game.arneyan.askRoll({ kind: "check", key: s.spot.ability, dc: s.spot.dc, label: `Spot it: ${this.document.name}` });
  }
  static #disarm() {
    const s = this.document.system;
    const skill = s.disable.skill.trim();
    return game.arneyan.askRoll({ kind: skill ? "skill" : "check", key: skill || s.disable.ability, dc: s.disable.dc, label: `Disarm: ${this.document.name}`, text: s.disable.text });
  }
  /** Fill in the Codex's Traps table numbers for this Level (and Deadly). */
  static async #trapTable() {
    const s = this.document.system;
    await this.document.update(trapUpdate(s));
    const t = trapNumbers(s.level, s.deadly);
    ui.notifications.info(`Level ${s.level}${s.deadly ? " deadly" : ""} trap: Find and Disarm DC ${t.find}, Save DC ${t.save}, ${t.damage} damage.`);
  }
  static #trigger() { return triggerHazard(this.document); }
  static #attack(event) { return hazardAttack(this.document, event); }
  static #damage(event, target) { return hazardDamage(this.document, target.dataset.which ?? "save"); }
  static #editDescription() {
    return new game.arneyan.ArneyanTextEditor(this.document, "system.details.description", "Description").render(true);
  }
}

/* -------------------------------------------- */
/*  Environmental hazards: pure parts           */
/* -------------------------------------------- */

/** Holding your breath: 1 + Con modifier minutes (minimum 30 seconds), in 6-second rounds. */
export function breathRounds(conMod) {
  const minutes = 1 + (Number(conMod) || 0);
  return Math.max(5, minutes * 10);
}

/** Out of breath: Con modifier rounds (minimum 1) before dropping to 0 HP. */
export function suffocationRounds(conMod) {
  return Math.max(1, Number(conMod) || 0);
}

/** Heat and cold: Fortitude DC 10 in the first hour, +2 for each further hour. */
export function exposureDc(hour) {
  return 10 + 2 * Math.max(0, (Number(hour) || 1) - 1);
}

/**
 * One round on the breath clock. Stages: breath (holding it) → out (suffocating) → down (0 HP, unconscious) → dying.
 * @returns {{c:object, event:""|"out"|"down"|"dying"}}
 */
export function advanceBreath(c) {
  const n = { ...c };
  if (n.stage === "breath") {
    n.left -= 1;
    if (n.left <= 0) { n.stage = "out"; n.left = n.suffocate; return { c: n, event: "out" }; }
  } else if (n.stage === "out") {
    n.left -= 1;
    if (n.left <= 0) { n.stage = "down"; n.left = 0; return { c: n, event: "down" }; }
  } else if (n.stage === "down") {
    n.stage = "dying";
    return { c: n, event: "dying" };
  }
  return { c: n, event: "" };
}

export function breathLabel(c) {
  if (c.stage === "breath") return `Holding breath: ${c.left} round${c.left === 1 ? "" : "s"} left`;
  if (c.stage === "out") return `Out of breath: ${c.left} round${c.left === 1 ? "" : "s"} before falling unconscious`;
  if (c.stage === "down") return "Unconscious at 0 HP: dying next round if it goes on";
  if (c.stage === "dying") return "Dying";
  return "";
}

/* -------------------------------------------- */
/*  Environmental hazards: the GM's window      */
/* -------------------------------------------- */

const KINDS = {
  breath: { label: "Holding breath and suffocation", icon: "fa-solid fa-lungs", unit: "round" },
  drowning: { label: "Under water (drowning)", icon: "fa-solid fa-water", unit: "round" },
  heat: { label: "Extreme heat", icon: "fa-solid fa-temperature-high", unit: "hour" },
  cold: { label: "Extreme cold", icon: "fa-solid fa-snowflake", unit: "hour" }
};

/** Quick cards from the same section: damage and saves to click. */
const QUICK = {
  flames: { label: "Standing in flames", damage: "1d6", type: "fire", save: "ref", dc: 12, text: "1d6 fire damage per round. Reflex save (DC 12) or catch fire.", cond: "burning" },
  smoke: { label: "Thick smoke", save: "fort", dc: 12, text: "After 1 minute in thick smoke, a Fortitude save (DC 12) each round or Poisoned until you breathe clean air. Smoke also counts as concealment.", cond: "poisoned" },
  acidSplash: { label: "Acid splash", damage: "1d6", type: "acid", text: "1d6 acid damage." },
  acidBath: { label: "Acid immersion", damage: "2d6", type: "acid", text: "2d6 acid damage per round. Nonmagical metal gear exposed for a full round is ruined (the GM decides how badly)." },
  lavaTouch: { label: "Touching lava", damage: "4d6", type: "fire", text: "4d6 fire damage per round." },
  lavaBath: { label: "Immersed in lava", damage: "10d6", type: "fire", text: "10d6 fire damage per round, and you catch fire.", cond: "burning" }
};

const heavyArmour = a => a.items?.some(i => i.type === "armour" && i.system.equipped && ["medium", "heavy"].includes(i.system.category));
const resists = (a, type) => [...(a.system.traits?.resist ?? []), ...(a.system.traits?.immune ?? [])].some(x => String(x).split(/\s+/)[0] === type);
const creatureOk = a => a && !["party", "storage", "hazard"].includes(a.type);

export class EnvironmentTimers extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;

  static open() {
    if (!game.user.isGM) return ui.notifications.warn("Environmental timers are for the GM.");
    const app = EnvironmentTimers.#instance ??= new EnvironmentTimers();
    return app.render({ force: true });
  }

  static refresh() {
    if (EnvironmentTimers.#instance?.rendered) EnvironmentTimers.#instance.render();
  }

  static DEFAULT_OPTIONS = {
    id: "arneyan-environment",
    classes: ["arneyan", "arn-env-app"],
    position: { width: 520, height: 640 },
    window: { title: "Environmental Hazards", icon: "fa-solid fa-temperature-half", resizable: true },
    actions: {
      start: EnvironmentTimers.#start,
      next: EnvironmentTimers.#next,
      end: EnvironmentTimers.#end,
      drop: EnvironmentTimers.#drop,
      addSelected: EnvironmentTimers.#addSelected,
      toggle: EnvironmentTimers.#toggle,
      quick: EnvironmentTimers.#quick
    }
  };

  static PARTS = { main: { template: "systems/arneyan/templates/apps/environment.hbs", scrollable: [".arn-env-list"] } };

  static get timers() { return foundry.utils.deepClone(game.settings.get(SYS, "envTimers") ?? []); }
  static async save(timers) { await game.settings.set(SYS, "envTimers", timers); EnvironmentTimers.refresh(); }

  async _prepareContext() {
    return {
      kinds: Object.entries(KINDS).map(([id, k]) => ({ id, ...k })),
      quick: Object.entries(QUICK).map(([id, q]) => ({ id, label: q.label, text: q.text })),
      timers: EnvironmentTimers.timers.map(t => ({
        ...t, ...KINDS[t.kind], isBreath: t.kind === "breath" || t.kind === "drowning", isHeat: t.kind === "heat", isCold: t.kind === "cold",
        nextDc: exposureDc((t.count ?? 0) + 1),
        creatures: t.creatures.map(c => ({ ...c, status: t.kind === "breath" || t.kind === "drowning" ? breathLabel(c) : c.noSave ? "No save" : "" }))
      }))
    };
  }

  /** Creatures for a new timer: the selected tokens, or the party. */
  static #pickCreatures() {
    const sel = (canvas?.tokens?.controlled ?? []).map(t => t.actor).filter(creatureOk);
    return sel.length ? sel : partyMembers();
  }

  static #entry(kind, a) {
    const c = { uuid: a.uuid, name: a.name, img: a.img };
    if (kind === "breath" || kind === "drowning") {
      const con = a.system.abilities?.con?.mod ?? 0;
      Object.assign(c, { stage: "breath", left: breathRounds(con), suffocate: suffocationRounds(con) });
    } else {
      // Cold: an Insulated garment removes the save (Environmental Hazards); heat: fire resistance.
      const insulated = kind === "cold" && (a.items ?? []).some(i => i.system?.equipped !== false && /\binsulated\b/i.test(`${i.system?.traits ?? ""} ${i.name}`));
      c.noSave = resists(a, kind === "heat" ? "fire" : "cold") || insulated;
    }
    return c;
  }

  static async #start(event, target) {
    const kind = target.dataset.kind;
    const actors = EnvironmentTimers.#pickCreatures();
    if (!actors.length) return ui.notifications.warn("Select the tokens it affects (or put the characters in the party).");
    const timers = EnvironmentTimers.timers;
    timers.push({ id: foundry.utils.randomID(), kind, count: 0, roughWater: false, sheltered: false, followCombat: true, creatures: actors.map(a => EnvironmentTimers.#entry(kind, a)) });
    await EnvironmentTimers.save(timers);
  }

  static async #end(event, target) {
    await EnvironmentTimers.save(EnvironmentTimers.timers.filter(t => t.id !== target.closest("[data-timer]").dataset.timer));
  }

  static async #drop(event, target) {
    const id = target.closest("[data-timer]").dataset.timer;
    const timers = EnvironmentTimers.timers;
    const t = timers.find(x => x.id === id);
    if (!t) return;
    t.creatures = t.creatures.filter(c => c.uuid !== target.closest("[data-uuid]").dataset.uuid);
    await EnvironmentTimers.save(t.creatures.length ? timers : timers.filter(x => x.id !== id));
  }

  static async #addSelected(event, target) {
    const id = target.closest("[data-timer]").dataset.timer;
    const timers = EnvironmentTimers.timers;
    const t = timers.find(x => x.id === id);
    const sel = (canvas?.tokens?.controlled ?? []).map(x => x.actor).filter(creatureOk).filter(a => !t.creatures.some(c => c.uuid === a.uuid));
    if (!sel.length) return ui.notifications.warn("Select the tokens to add.");
    t.creatures.push(...sel.map(a => EnvironmentTimers.#entry(t.kind, a)));
    await EnvironmentTimers.save(timers);
  }

  static async #toggle(event, target) {
    const id = target.closest("[data-timer]").dataset.timer;
    const timers = EnvironmentTimers.timers;
    const t = timers.find(x => x.id === id);
    const key = target.dataset.key;
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    if (uuid) { const c = t.creatures.find(x => x.uuid === uuid); c[key] = !c[key]; }
    else t[key] = !t[key];
    await EnvironmentTimers.save(timers);
  }

  static async #next(event, target) {
    return advanceTimer(target.closest("[data-timer]").dataset.timer);
  }

  static async #quick(event, target) {
    const q = QUICK[target.dataset.id];
    if (!q) return;
    const btns = [];
    if (q.save) btns.push(`<button type="button" class="arn-save-btn" data-save="${q.save}" data-dc="${q.dc}" data-source="${esc(q.label)}"><i class="fa-solid fa-shield-halved"></i> ${ARNEYAN.saves[q.save].label} save, DC ${q.dc}</button>`);
    if (q.damage) btns.push(`<button type="button" class="arn-env-damage" data-formula="${q.damage}" data-type="${q.type}" data-label="${esc(q.label)}"><i class="fa-solid fa-fire"></i> ${q.damage} ${q.type} damage</button>`);
    const cond = q.cond && ARNEYAN.conditions?.[q.cond] ? ` @Condition[${q.cond}]{${ARNEYAN.conditions[q.cond].name}}` : "";
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ alias: q.label }),
      content: `<div class="arn-card arn-env-card"><header class="arn-card-title"><img src="${ENV_IMG}" alt=""> <span>${esc(q.label)}</span></header><p>${esc(q.text)}${cond}</p><div class="arn-card-buttons">${btns.join("")}</div></div>`
    });
  }
}

/** Move one timer on: a round of breath, or an hour of heat or cold (posts the saves). */
export async function advanceTimer(id) {
  if (!game.user.isGM) return;
  const timers = EnvironmentTimers.timers;
  const t = timers.find(x => x.id === id);
  if (!t) return;
  t.count = (t.count ?? 0) + 1;
  if (t.kind === "breath" || t.kind === "drowning") {
    const lines = [];
    for (const [i, c] of t.creatures.entries()) {
      const { c: n, event } = advanceBreath(c);
      t.creatures[i] = n;
      const a = await fromUuid(c.uuid).catch(() => null);
      if (!a || !event) continue;
      if (event === "out") lines.push(`${a.name} runs out of breath: ${n.left} round${n.left === 1 ? "" : "s"} before falling unconscious.`);
      if (event === "down") {
        if ((a.system.attributes?.hp?.value ?? 0) > 0) await a.update({ "system.attributes.hp.value": 0 });
        lines.push(`${a.name} drops to 0 HP and falls unconscious.`);
      }
      if (event === "dying") {
        if (a.type === "character" && (a.system.attributes?.hp?.value ?? 0) >= 0) await a.update({ "system.attributes.hp.value": -1, "system.attributes.stable": false });
        lines.push(a.type === "character" ? `${a.name} is dying (see Death & Dying).` : `${a.name} dies.`);
      }
    }
    await EnvironmentTimers.save(timers);
    const label = KINDS[t.kind].label;
    if (lines.length) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ alias: label }), whisper: gms(), content: `<div class="arn-card arn-report"><header class="arn-card-title"><i class="${KINDS[t.kind].icon}"></i> <span>${esc(label)}, round ${t.count}</span></header><ul>${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>` });
    // Swimming in rough water: a Strength check each round.
    if (t.roughWater) {
      const actors = (await Promise.all(t.creatures.filter(c => c.stage === "breath" || c.stage === "out").map(c => fromUuid(c.uuid).catch(() => null)))).filter(Boolean);
      const per = Object.fromEntries(actors.filter(a => a.items?.some(i => i.type === "armour" && i.system.equipped && i.system.category === "heavy")).map(a => [a.uuid, { mode: -1, note: "heavy armour" }]));
      if (actors.length) await game.arneyan.askForRoll({ actors, kind: "check", key: "str", dc: 12, label: `Rough water, round ${t.count}`, text: "A failure makes no headway this round; failing by 5 or more (a total of 7 or less) means you sink.", per });
    }
    return;
  }
  // Heat or cold: this hour's Fortitude save, Exhaustion for those who fail.
  await EnvironmentTimers.save(timers);
  const dc = exposureDc(t.count);
  const all = (await Promise.all(t.creatures.map(c => fromUuid(c.uuid).catch(() => null).then(a => ({ a, c }))))).filter(x => x.a);
  const skip = all.filter(x => x.c.noSave);
  const rolling = all.filter(x => !x.c.noSave);
  const per = {};
  for (const { a } of rolling) {
    if (t.kind === "heat" && heavyArmour(a)) per[a.uuid] = { mode: -1, note: "medium or heavy armour" };
    if (t.kind === "cold" && t.sheltered) per[a.uuid] = { mode: 1, note: "warm clothing, fire or shelter" };
  }
  const label = `${KINDS[t.kind].label}, hour ${t.count}`;
  const text = skip.length ? `No save needed: ${skip.map(x => x.a.name).join(", ")}.` : "";
  if (!rolling.length) return ui.notifications.info(`${label}: nobody needs to save.`);
  return game.arneyan.askForRoll({ actors: rolling.map(x => x.a), kind: "save", key: "fort", dc, label, text, consequence: "exhaustion", per });
}

/** Breath timers that follow the combat move on with each new round; a complex hazard's turn shows its routine. */
async function onCombatRound(combat, changed, options = {}) {
  if (!game.users.activeGM?.isSelf || options.direction === -1) return;
  if ("round" in changed) for (const t of EnvironmentTimers.timers.filter(x => (x.kind === "breath" || x.kind === "drowning") && x.followCombat)) await advanceTimer(t.id);
  const actor = combat.combatant?.actor;
  if (("turn" in changed || "round" in changed) && actor?.type === "hazard" && actor.system.complex && !combat.combatant.defeated) {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: gms(), content: triggerCardHtml(actor) });
  }
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

export function registerHazards() {
  CONFIG.Actor.dataModels.hazard = HazardData;
  Hooks.once("setup", () => { CONFIG.Actor.trackableAttributes ??= {}; CONFIG.Actor.trackableAttributes.hazard = { bar: ["attributes.hp"], value: ["attributes.ac"] }; });
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, SYS, ArneyanHazardSheet, { types: ["hazard"], makeDefault: true, label: "Arneyan Hazard Sheet" });
  game.settings.register(SYS, "envTimers", { scope: "world", config: false, type: Array, default: [], onChange: () => EnvironmentTimers.refresh() });
  foundry.applications.handlebars.loadTemplates(["systems/arneyan/templates/actor/hazard-sheet.hbs", "systems/arneyan/templates/apps/environment.hbs"]);

  // New hazards: the trap icon, and a hostile token that isn't linked.
  Hooks.on("preCreateActor", (actor, data) => {
    if (actor.type !== "hazard") return;
    const upd = {};
    if (!data.img || data.img === "icons/svg/mystery-man.svg") { upd.img = HAZARD_IMG; upd["prototypeToken.texture.src"] = HAZARD_IMG; }
    if (!("disposition" in (data.prototypeToken ?? {}))) upd["prototypeToken.disposition"] = -1;
    if (Object.keys(upd).length) actor.updateSource(upd);
  });

  Hooks.on("updateCombat", onCombatRound);

  Hooks.on("renderChatMessageHTML", (message, html) => {
    const on = (sel, fn) => html.querySelectorAll(sel).forEach(el => el.addEventListener("click", ev => {
      ev.preventDefault();
      if (el.dataset.busy) return;
      el.dataset.busy = "1";
      Promise.resolve().then(() => fn(ev, el)).catch(err => { console.error("Arneyan |", err); ui.notifications.error(err.message); }).finally(() => delete el.dataset.busy);
    }));
    html.querySelectorAll(".arn-hz-attack, .arn-hz-damage").forEach(b => { b.hidden = !fromUuidSync(b.dataset.actorUuid)?.isOwner; });
    on(".arn-hz-attack", async (ev, b) => hazardAttack(await fromUuid(b.dataset.actorUuid), ev));
    on(".arn-hz-damage", async (ev, b) => hazardDamage(await fromUuid(b.dataset.actorUuid), b.dataset.which, b.dataset.crit === "1"));
    on(".arn-env-damage", async (ev, b) => damageRoll({ actor: null, title: `${b.dataset.label}: Damage`, formula: b.dataset.formula, damageType: Object.hasOwn(ARNEYAN.damageTypes, b.dataset.type) ? b.dataset.type : "" }));
  });
}

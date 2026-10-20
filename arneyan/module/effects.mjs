/**
 * The Arneyan effects layer: a small rule engine in the spirit of PF2e's rule elements.
 *
 * Rules live on items (`system.rules`), on Active Effects (`flags.arneyan.rules`) and on
 * conditions (CONFIG.ARNEYAN.conditions). Everything is worked out during data preparation, so
 * it behaves the same on Foundry v13 and v14 and never relies on core change application.
 */
import { ARNEYAN } from "./config.mjs";
import { reapply } from "./counters.mjs";
import { combatFor, combatOnScene } from "./fight.mjs";
import { durationData } from "./duration.mjs";

const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FUNCS = Object.assign(Object.create(null), { floor: Math.floor, ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max, abs: Math.abs });

/* -------------------------------------------- */
/*  Formulas                                    */
/* -------------------------------------------- */

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** A small numeric formula's value, or null if it isn't one (bad words, strings, a syntax error). */
export function tryNumber(value, data = {}) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;
  let expr = String(value).trim();
  if (!expr) return null;
  expr = expr.replace(/@([\w.]+)/g, (_, p) => {
    const v = getPath(data, p);
    return Number.isFinite(Number(v)) ? `(${Number(v)})` : "(0)";
  });
  // Only digits, operators, brackets, commas and the whitelisted functions.
  const words = expr.match(/[a-z_]+/gi) ?? [];
  if (words.some(w => !Object.hasOwn(FUNCS, w))) return null;
  if (/\.\s*[a-z_]/i.test(expr) || /[`'"\[\]{};=]/.test(expr)) return null; // no property access or strings
  if (!/^[\d\s+\-*/().,a-z_]*$/i.test(expr)) return null;
  try {
    const n = Function(...Object.keys(FUNCS), `"use strict"; return (${expr});`)(...Object.values(FUNCS));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Evaluate a small numeric formula such as "floor(@level/4)" or "@cl". Returns 0 if it can't. */
export function evalNumber(value, data = {}) {
  return tryNumber(value, data) ?? 0;
}

/**
 * Uses worked out from a formula (system.uses.formula): a level table on @cl ("5:1, 9:2, 13:3": 1 from 5th, 2 from
 * 9th...) or a formula ("max(1, @dex.mod)", "3 + @wis.mod", "@cl"). Never throws: anything it can't read gives
 * `fallback` (the stored maximum). Never below 0, always a whole number.
 */
export function usesMax(formula, data = {}, fallback = 0) {
  try {
    const s = String(formula ?? "").trim();
    if (!s) return fallback;
    let n = null;
    if (/^\d+\s*:/.test(s)) {
      const lvl = Number(data.cl ?? data.level ?? 1) || 0;
      n = 0;
      for (const [, at, v] of s.matchAll(/(\d+)\s*:\s*(-?\d+)/g)) if (lvl >= Number(at)) n = Number(v);
    } else n = tryNumber(s, data);
    return n === null ? fallback : Math.max(0, Math.floor(n));
  } catch {
    return fallback;
  }
}

/** Damage-style values keep dice: "+1d6" stays as it is; "@cl" style terms are resolved. */
function evalTerm(value, data) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (/\d*d\d/i.test(s)) return s.replace(/@([\w.]+)/g, (_, p) => String(Number(getPath(data, p)) || 0));
  const n = evalNumber(s, data);
  return n ? (n > 0 ? `+${n}` : `${n}`) : "";
}

/* -------------------------------------------- */
/*  Collecting rules                            */
/* -------------------------------------------- */

const GEAR = new Set(["weapon", "armour", "equipment"]);

/** Is an item's rule set switched on? Gear must be equipped; toggles must be on. */
export function itemRulesActive(item) {
  const s = item.system;
  if (!s?.rules?.length) return false;
  if (GEAR.has(item.type) && !s.equipped) return false;
  if (s.toggle && !s.active) return false;
  return true;
}

/** Status ids currently on the actor, read from its effects (works before core sets actor.statuses). */
/** Every effect that applies to an actor: its own, plus those transferred from its items. */
export function appliedEffects(actor) {
  try {
    if (typeof actor.allApplicableEffects === "function") return [...actor.allApplicableEffects()];
  } catch { /* fall back */ }
  return [...(actor.effects ?? [])];
}

export function statusesOf(actor) {
  const out = new Set();
  for (const e of appliedEffects(actor)) {
    if (e.disabled) continue;
    for (const s of e.statuses ?? []) out.add(s);
  }
  return out;
}

/**
 * An item's rules with its attribute choice applied: Will of Iron's `ability.wis` counts for Intelligence when the
 * player picked Intelligence. Never throws; anything odd leaves the rules as they are.
 */
export function chosenRules(sys) {
  const rules = sys?.rules ?? [];
  try {
    const opts = (sys?.abilityChoice?.options ?? []).filter(o => Object.hasOwn(ARNEYAN.abilities, o));
    if (!opts.length) return rules;
    // Several options and none picked yet: no attribute bonus until the player chooses (never a silent default).
    const pick = opts.includes(sys.abilityChoice.value) ? sys.abilityChoice.value : opts.length === 1 ? opts[0] : null;
    return rules.flatMap(r => {
      const m = /^ability\.(\w+)$/.exec(String(r?.key ?? "").trim());
      if (!m || !opts.includes(m[1])) return [r];
      return pick ? [{ ...r, key: `ability.${pick}` }] : [];
    });
  } catch {
    return rules;
  }
}

/* -------------------------------------------- */
/*  Rules for some weapons only                 */
/* -------------------------------------------- */

/**
 * A weapon name reduced to what identifies the weapon, so a "+1 Longsword", "Long Sword" and the Catalogue's "Sword,
 * Long" are all one weapon: no magic bonus, nothing in brackets ("Greatsword (specialised)"), the Catalogue's "Kind,
 * Variety" read the other way round, then letters only.
 */
export function weaponKey(name) {
  let s = String(name ?? "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[+-]\s*\d+\b/g, " ");
  const parts = s.split(",").map(x => x.trim()).filter(Boolean);
  if (parts.length === 2) s = `${parts[1]} ${parts[0]}`;
  return s.replace(/[^a-z]/g, "");
}

/** The names a weapon answers to: its own, its name before any renaming, and the compendium entry it came from. */
function weaponKeys(item) {
  const names = [item?.name, item?._source?.name];
  try {
    const uuid = item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId;
    // A synchronous lookup only: the compendium index has the name without loading the entry.
    if (typeof uuid === "string" && uuid.startsWith("Compendium.") && typeof globalThis.fromUuidSync === "function") names.push(globalThis.fromUuidSync(uuid, { strict: false })?.name);
  } catch { /* no source to read: its own names do */ }
  return [...new Set(names.map(weaponKey).filter(Boolean))];
}

/**
 * Is this weapon being used two-handed? The Two-handed trait (the Catalogue's † melee weapons carry it) says so and
 * One-handed says not; a Versatile weapon is two-handed when its two-handed die is in the roll (`include` has
 * "versatile"). Copies on sheets from before the trait existed: a two-slot melee weapon that isn't Versatile or Light,
 * which is how the Catalogue marks its two-handed weapons. A Trident is one-handed (Kieran, 20 Oct), even on an older copy.
 */
export function isTwoHanded(item, { include = [] } = {}) {
  if (item?.type !== "weapon") return false;
  const traits = String(item.system?.traits ?? "");
  // A Lance: two-handed on foot, one-handed while its Mounted switch is on.
  if (item.system?.toggle && item.system?.active && /^mounted$/i.test(String(item.system?.modeLabel ?? "").trim())) return false;
  if (/\btwo[- ]handed\b/i.test(traits)) return true;
  if (/\bone[- ]handed\b/i.test(traits)) return false;
  if (/\bversatile\b/i.test(traits)) return include.includes("versatile");
  if (weaponKeys(item).includes("trident")) return false;
  return !item.system?.ranged && Number(item.system?.slots) >= 2 && !/\blight\b/i.test(traits);
}

/** Does a rule scoped to some weapons (`weapon`: "two-handed" or "chosen") count for this weapon? */
export function weaponMatches(rule, item, opts = {}) {
  if (item?.type !== "weapon") return false;
  const scope = String(rule?.weapon ?? "").trim().toLowerCase();
  if (scope === "two-handed") return isTwoHanded(item, opts);
  if (scope === "chosen") {
    const want = new Set((rule.names ?? []).map(weaponKey).filter(Boolean));
    return want.size > 0 && weaponKeys(item).some(k => want.has(k));
  }
  return false;
}

/** How many weapons an item's weapon pick allows at this class level (0: it has none). */
export function weaponPickMax(sys, cl = 1) {
  const max = String(sys?.weaponChoice?.max ?? "").trim();
  return max ? usesMax(max, { cl, level: cl }, 1) : 0;
}

/** The weapons picked on an item that count at this class level (a second pick only from 13th, for instance). */
export function weaponPicks(sys, cl = 1) {
  const n = weaponPickMax(sys, cl);
  if (!n) return [];
  return [...new Set((sys.weaponChoice.value ?? []).map(v => String(v ?? "").trim()).filter(Boolean))].slice(0, n);
}

/** The class level an item's rules work with on an actor (as collectRules works it out). */
export function featureLevel(actor, item) {
  const name = String(item?.system?.className ?? "").toLowerCase();
  const cls = name ? (actor?.items ?? []).find(i => i.type === "class" && i.name.toLowerCase().startsWith(name)) : null;
  return cls?.system?.levels ?? actor?.system?.level ?? 1;
}

/**
 * The weapon's own damage dice, each die showing `n` or less rolled again once (Foundry's r<=n): "2d6" reads
 * "2d6r<=2", an exploding "2d6x" reads "2d6r<=2x". A die that already rerolls is left as it is.
 */
export function rerollDice(formula, n) {
  const k = Math.floor(Number(n));
  if (!(k >= 1)) return formula;
  return String(formula ?? "").replace(/(\d*d\d+)([a-z][a-z0-9<>=]*)?/gi, (m, dice, mods = "") => (/r/i.test(mods) ? m : `${dice}r<=${k}${mods}`));
}

/** The damage card's line for a reroll: "Crushing Blow: 1s and 2s on the weapon's damage dice rerolled once". */
export function rerollNote(labels, n) {
  const which = n <= 1 ? "1s" : n === 2 ? "1s and 2s" : `1s to ${n}s`;
  return `${labels.join(", ") || "Reroll"}: ${which} on the weapon's damage dice rerolled once`;
}

/** What a rule's weapon scope reads as on the sheet: "with two-handed weapons", "with Greatsword". */
export function scopeText(rule) {
  const scope = String(rule?.weapon ?? "").trim();
  if (scope === "two-handed") return "with two-handed weapons";
  if (scope === "chosen") return rule.names?.length ? `with ${rule.names.join(" or ")}` : "with the picked weapon (none picked yet)";
  return scope ? `with ${scope} weapons` : "";
}

/**
 * Every active rule on an actor, with its source.
 * @returns {{key:string, value:any, when:string, label:string, source:string, data:object}[]}
 */
export function collectRules(actor, baseData = {}) {
  const out = [];
  const push = (rules, label, extra = {}, picks = []) => {
    for (const r of rules ?? []) {
      if (!r?.key) continue;
      const rule = { key: String(r.key).trim(), value: r.value, when: r.when ?? "", label: r.label || label, data: { ...baseData, ...extra } };
      // Scoped to some weapons (Crushing Blow's two-handed, Weapon Specialisation's picked weapon): ModSet keeps it
      // apart, for the rolls with a weapon that fits.
      const weapon = String(r.weapon ?? "").trim();
      if (weapon) {
        rule.weapon = weapon;
        if (weapon === "chosen") {
          rule.names = picks;
          // Picked already: the reminder on other weapons' cards names it.
          if (picks.length && rule.when) rule.when = `${rule.when} (${picks.join(", ")})`;
        }
      }
      out.push(rule);
    }
  };
  // Items: feats, abilities, ancestry, equipped gear, switched-on toggles.
  for (const item of actor.items ?? []) {
    if (!itemRulesActive(item)) continue;
    const cls = item.system.className ? actor.items.find(i => i.type === "class" && i.name.toLowerCase().startsWith(item.system.className.toLowerCase())) : null;
    const cl = cls?.system.levels ?? baseData.level ?? 1;
    push(chosenRules(item.system), item.name, { cl }, weaponPicks(item.system, cl));
  }
  // Active Effects on the actor (spells, abilities and conditions applied to it).
  const conditionsDone = new Set();
  for (const e of appliedEffects(actor)) {
    if (e.disabled || e.isSuppressed) continue;
    const flags = e.flags?.[SYS] ?? {};
    push(flags.rules, e.name, { cl: flags.cl ?? baseData.level ?? 1 });
    for (const id of e.statuses ?? []) {
      const c = ARNEYAN.conditions[id];
      if (!c || conditionsDone.has(id)) continue; // the same condition never stacks
      conditionsDone.add(id);
      push(c.rules, c.name);
    }
  }
  // Exhaustion track.
  const ex = actor.system?.attributes?.exhaustion ?? 0;
  for (let i = 1; i <= ex; i++) push(ARNEYAN.exhaustionRules[i], `Exhaustion ${i}`);
  return out;
}

/* -------------------------------------------- */
/*  The modifier set                            */
/* -------------------------------------------- */

const NOTE_GROUP = key => {
  if (key.startsWith("note.")) return key.slice(5);
  const k = key.replace(/^(adv|fail)\./, "");
  if (k.startsWith("attack")) return "attack";
  if (k.startsWith("damage") || k.endsWith("damage")) return "damage";
  if (k.startsWith("save")) return "save";
  if (k.startsWith("skill")) return "skill";
  if (k.startsWith("check")) return "check";
  if (k.startsWith("spell") || k.startsWith("slots")) return "spell";
  if (k === "init") return "init";
  if (k === "luck") return "luck";
  if (k === "concentration") return "save";
  return "other";
};

function describe(rule, n) {
  if (rule.key.startsWith("adv.")) return rule.value > 0 || n > 0 ? "Advantage" : "Disadvantage";
  if (rule.key.startsWith("note.")) return String(rule.value);
  if (typeof n === "number") return n >= 0 ? `+${n}` : `${n}`;
  return String(rule.value);
}

export class ModSet {
  constructor(rules = []) {
    this.rules = rules;
    this.numbers = new Map();   // key -> [{label, value}]
    this.terms = new Map();     // key -> [{label, value:string}] dice terms for damage
    this.flags = new Map();     // key -> [{label, value}] multipliers, limits, adv
    this.traits = { resist: [], immune: [], vuln: [], sense: [] };
    this.notes = new Map();     // group -> [text]
    this.situational = [];      // {label, text, group}
    this.scoped = [];           // {rule, note}: rules for some weapons only (forWeapon)
    for (const r of rules) {
      try { this.#add(r); } catch (err) { console.warn(`Arneyan | Skipped a bad rule from ${r?.label}`, r, err); }
    }
  }

  /** Add a rule after the fact (the sheet's own, such as being over the inventory limit). */
  add(rule) {
    this.rules.push(rule);
    try { this.#add(rule); } catch (err) { console.warn("Arneyan | Skipped a bad rule", rule, err); }
  }

  #push(map, key, entry) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  }

  #add(r) {
    const key = r.key;
    // A rule for some weapons only: kept for the rolls with a weapon that fits (forWeapon), never applied to all.
    const scoped = String(r.weapon ?? "").trim() ? { rule: r, note: "" } : null;
    if (scoped) this.scoped.push(scoped);
    if (r.when) {
      // A resistance, immunity, weakness or sense only some of the time names what it is ("Resistance slashing 3").
      const TRAIT_WORD = { resist: "Resistance", immune: "Immune", vuln: "Vulnerable", sense: "Sense" };
      const what = Object.hasOwn(TRAIT_WORD, key) ? `${TRAIT_WORD[key]} ${String(r.value ?? "").replace(/^condition:/, "")}`
        : `${describe(r, evalNumber(r.value, r.data))} ${r.key.startsWith("adv.") || r.key.startsWith("note.") ? "" : `(${r.key})`}`;
      const text = `${r.label}: ${what} ${r.when}`.replace(/\s+/g, " ").trim();
      const group = NOTE_GROUP(key);
      this.situational.push({ label: r.label, text, group });
      this.#push(this.notes, group, text);
      // With the weapon it's for, the rule applies instead, and this reminder leaves that card.
      if (scoped) scoped.note = text;
      return;
    }
    if (scoped) return;
    if (key.startsWith("note.")) return this.#push(this.notes, key.slice(5), `${r.label}: ${r.value}`);
    // Weapon damage dice rerolled at or below the value (Crushing Blow): a flag, not a damage term.
    if (key === "damage.reroll") return this.#push(this.flags, key, { label: r.label, value: evalNumber(r.value, r.data) });
    if (Object.hasOwn(this.traits, key)) {
      for (const v of String(r.value ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean)) {
        this.traits[key].push({ value: v, label: r.label });
      }
      return;
    }
    if (/damage$/.test(key) || key.startsWith("damage")) {
      const t = evalTerm(r.value, r.data);
      if (t) this.#push(this.terms, key, { label: r.label, value: t });
      return;
    }
    if (key.startsWith("adv.") || key.startsWith("fail.") || key.startsWith("no.") || key.endsWith(".mult") || key.startsWith("crit.against")) {
      return this.#push(this.flags, key, { label: r.label, value: evalNumber(r.value, r.data) });
    }
    const n = evalNumber(r.value, r.data);
    if (n) this.#push(this.numbers, key, { label: r.label, value: n });
  }

  /** Sum of numeric rules for any of the keys. */
  sum(...keys) {
    return keys.flat().reduce((t, k) => t + (this.numbers.get(k) ?? []).reduce((a, e) => a + e.value, 0), 0);
  }

  /** Breakdown parts {label, value} for any of the keys. */
  parts(...keys) {
    return keys.flat().flatMap(k => this.numbers.get(k) ?? []);
  }

  /** Extra damage terms joined as a formula fragment, e.g. "+1d6 +2". */
  damage(...keys) {
    return keys.flat().flatMap(k => this.terms.get(k) ?? []);
  }

  /** Is any flag with these keys set (value not 0)? */
  has(...keys) {
    return keys.flat().some(k => (this.flags.get(k) ?? []).some(e => e.value));
  }

  /** All multipliers for a key multiplied together (1 if none): Haste x2 and Exhaustion x0.5 cancel out. */
  mult(key) {
    const list = this.flags.get(key) ?? [];
    return list.reduce((t, e) => t * e.value, 1);
  }

  /** Highest value among the keys (for "set to" style rules like ac.base), or null. */
  best(key) {
    const list = this.numbers.get(key) ?? [];
    return list.length ? Math.max(...list.map(e => e.value)) : null;
  }

  /** Lowest value among the keys (crit range), or null. */
  lowest(key) {
    const list = this.numbers.get(key) ?? [];
    return list.length ? Math.min(...list.map(e => e.value)) : null;
  }

  /** Advantage sources for these keys as [+1, -1] style values plus who gave them. */
  adv(...keys) {
    const list = keys.flat().flatMap(k => this.flags.get(k) ?? []).filter(e => e.value);
    return {
      values: list.map(e => Math.sign(e.value)),
      adv: list.filter(e => e.value > 0).map(e => e.label),
      dis: list.filter(e => e.value < 0).map(e => e.label)
    };
  }

  /** Who imposes a flag. */
  sources(...keys) {
    return keys.flat().flatMap(k => (this.flags.get(k) ?? []).filter(e => e.value).map(e => e.label));
  }

  /** Reminder notes for these roll groups. */
  notesFor(...groups) {
    return [...new Set(groups.flat().flatMap(g => this.notes.get(g) ?? []))];
  }

  /**
   * The rules scoped to weapons that count for this one, as their own ModSet (`mods`), and the reminders they leave
   * behind on its cards (`drop`). `include`: the damage card's extras in the roll ("versatile": wielded two-handed).
   */
  forWeapon(item, { include = [] } = {}) {
    const hit = this.scoped.filter(s => weaponMatches(s.rule, item, { include }));
    return { mods: new ModSet(hit.map(s => ({ ...s.rule, when: "", weapon: "" }))), drop: new Set(hit.map(s => s.note).filter(Boolean)) };
  }

  /** Damage dice rerolled at or below this (the highest `damage.reroll`), and who gives it. */
  reroll() {
    const list = (this.flags.get("damage.reroll") ?? []).filter(e => e.value >= 1);
    return { value: list.length ? Math.max(...list.map(e => Math.floor(e.value))) : 0, labels: [...new Set(list.map(e => e.label))] };
  }
}

/**
 * A value that changes with level, as a level table: "1:1, 10:1d4" is 1 from 1st and 1d4 from 10th (Stun Attack's
 * rounds). Anything else comes back as it is.
 */
export function byLevelTable(value, level) {
  const s = String(value ?? "").trim();
  if (!/^\d+\s*:/.test(s)) return value;
  let out = "0";
  for (const part of s.split(",")) {
    const m = part.match(/^\s*(\d+)\s*:\s*(.+?)\s*$/);
    if (m && Number(level) >= Number(m[1])) out = m[2];
  }
  return out;
}

/** Parse "fire, cold" style text into a list of lower-case words. */
export function wordList(text) {
  return String(text ?? "").split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

/** Tooltip text for a breakdown. */
export function breakdown(parts) {
  return parts.filter(p => p.value !== 0 && p.value !== "" && p.value !== undefined)
    .map(p => `${p.label} ${typeof p.value === "number" ? (p.value >= 0 ? `+${p.value}` : p.value) : p.value}`).join(" · ");
}

/* -------------------------------------------- */
/*  Applying effects from spells and abilities  */
/* -------------------------------------------- */

/** The default Active Effect data for an "applies" entry, ready to create on a target. */
export async function effectDataFor(entry, item, { cl = 1, caster = null } = {}) {
  const data0 = { cl, level: cl, half: ARNEYAN.halfLevel(cl) };
  // Rolled durations and values ("1d4" rounds, "2d4" to a score) are rolled once, when applied.
  const rollIf = async v => {
    const s = String(v ?? "").trim();
    if (!/\d*d\d/i.test(s)) return v;
    try { return (await new Roll(s.replace(/@([\w.]+)/g, (_, p) => String(Number(getPath(data0, p)) || 0))).evaluate()).total; } catch { return 0; }
  };
  const roundsRaw = await rollIf(byLevelTable(entry.rounds ?? 0, cl));
  const rounds = Math.max(0, Math.floor(evalNumber(roundsRaw, data0)));
  const DAMAGEISH = /damage/;
  const rules = [];
  for (const r of entry.rules ?? []) rules.push({ ...r, value: DAMAGEISH.test(r.key) ? r.value : String(await rollIf(r.value)) });
  const data = {
    name: entry.name || item.name,
    img: item.img,
    origin: item.uuid,
    statuses: (entry.statuses ?? []).filter(s => s in ARNEYAN.conditions),
    description: item.system.description ?? "",
    flags: { [SYS]: { rules, cl, sourceName: item.name, casterUuid: caster?.uuid ?? null, rounds } }
  };
  if (rounds) {
    // Foundry's own duration too, in the shape this Foundry stores (v13 { rounds }, v14 { value, units }).
    data.duration = durationData({ rounds });
    // The encounter the caster is fighting in (game.combat is only the one this client's tracker shows).
    const combat = combatFor(caster) ?? combatFor(item?.actor) ?? combatOnScene(globalThis.canvas?.scene?.id);
    if (combat?.started) data.flags[SYS].expires = { combat: combat.id, round: combat.round + rounds, turn: combat.turn ?? 0 };
  }
  return data;
}

/** Create an effect on each actor. Players can only affect actors they own; the GM affects anyone. */
export async function applyEffectTo(actors, data) {
  const done = [];
  for (const actor of actors) {
    if (!actor) continue;
    if (!actor.isOwner) {
      ui.notifications.warn(`You don't control ${actor.name}; ask the GM to apply ${data.name}.`);
      continue;
    }
    // Immune to a condition: skip those statuses.
    const immune = actor.system.mods?.traits.immune.map(t => t.value) ?? [];
    const statuses = (data.statuses ?? []).filter(s => !immune.includes(`condition:${s}`) && !immune.includes(s));
    // One-off grants when the effect lands: temporary HP and Exhaustion levels.
    const once = (data.flags?.[SYS]?.rules ?? []).filter(r => ["hp.temp", "exhaustion"].includes(r.key) && !r.when);
    const keep = (data.flags?.[SYS]?.rules ?? []).filter(r => !once.includes(r));
    const effData = foundry.utils.deepClone({ ...data, statuses });
    effData.flags[SYS].rules = keep;
    const upd = {};
    const cl = data.flags?.[SYS]?.cl ?? 1;
    for (const r of once) {
      const n = Math.floor(evalNumber(r.value, { cl, level: cl }));
      if (r.key === "hp.temp") upd["system.attributes.hp.temp"] = Math.max(actor.system.attributes.hp.temp ?? 0, n);
      if (r.key === "exhaustion" && actor.type === "character") upd["system.attributes.exhaustion"] = Math.clamp((actor.system.attributes.exhaustion ?? 0) + n, 0, 6);
    }
    if (Object.keys(upd).length) await actor.update(upd);
    if (!keep.length && !statuses.length && !data.flags?.[SYS]?.rounds && once.length) continue;
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [effData]);
    if (effect) done.push(effect);
  }
  return done;
}

/** Toggle a condition on an actor (used by the sheet and chat buttons). */
export async function toggleCondition(actor, id, active, { overlay = false, value = 1 } = {}) {
  // Remove every effect carrying the status (spells create their own effects with random ids).
  const existing = actor.effects.filter(e => e.statuses?.has?.(id) || e.statuses?.includes?.(id));
  if (existing.length && active !== true) return actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
  // Already on: Burning stacks, a timed one keeps the longer (counters.mjs).
  if (existing.length && active === true) return reapply(actor, id, value);
  if (existing.length || active === false) return;
  if (typeof actor.toggleStatusEffect === "function") return actor.toggleStatusEffect(id, { active: true, overlay });
  {
    const c = ARNEYAN.conditions[id];
    return actor.createEmbeddedDocuments("ActiveEffect", [{ name: c.name, img: `systems/${SYS}/assets/conditions/${id}.svg`, statuses: [id] }]);
  }
}

/* -------------------------------------------- */
/*  Concentration                               */
/* -------------------------------------------- */

/** Start concentrating on a spell: ends any earlier concentration first. */
export async function startConcentration(actor, item, linked = []) {
  if (!actor?.isOwner) return;
  await endConcentration(actor);
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: `Concentrating: ${item.name}`,
    img: `systems/${SYS}/assets/conditions/concentrating.svg`,
    origin: item.uuid,
    statuses: ["concentrating"],
    flags: { [SYS]: { concentration: true, linked: linked.map(e => e.uuid), sourceName: item.name } }
  }]);
  return effect;
}

/** Stop concentrating: removes the effects the spell put on others. */
export async function endConcentration(actor) {
  const conc = actor.effects.filter(e => e.flags?.[SYS]?.concentration);
  if (!conc.length) return;
  // Remove the linked effects this user can remove now; the GM's client handles the rest.
  for (const c of conc) {
    for (const uuid of c.flags[SYS].linked ?? []) {
      const e = await fromUuid(uuid).catch(() => null);
      if (e?.isOwner) await e.delete().catch(() => null);
    }
  }
  if (!game.users.activeGM && conc.some(c => (c.flags[SYS].linked ?? []).length)) {
    ui.notifications.warn("No GM is connected: effects on creatures you don't control stay until the GM removes them.");
  }
  await actor.deleteEmbeddedDocuments("ActiveEffect", conc.map(e => e.id).filter(id => actor.effects.has(id)));
}

/** When a concentration effect goes, take its linked effects with it (run by the GM). */
export async function onConcentrationDeleted(effect) {
  const linked = effect.flags?.[SYS]?.linked ?? [];
  for (const uuid of linked) {
    const e = await fromUuid(uuid).catch(() => null);
    if (e) await e.delete().catch(() => null);
  }
}

/* -------------------------------------------- */
/*  Durations in combat                         */
/* -------------------------------------------- */

/** Remove effects whose rounds have run out. Called by the GM when the turn changes. */
export async function expireEffects(combat) {
  if (!combat?.started) return;
  for (const c of combat.combatants) {
    const actor = c.actor;
    if (!actor) continue;
    const gone = actor.effects.filter(e => {
      const x = e.flags?.[SYS]?.expires;
      if (!x || x.combat !== combat.id) return false;
      return combat.round > x.round || (combat.round === x.round && (combat.turn ?? 0) >= x.turn);
    });
    if (!gone.length) continue;
    await actor.deleteEmbeddedDocuments("ActiveEffect", gone.map(e => e.id).filter(id => actor.effects.has(id))).catch(() => null);
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter(u => u.isGM).map(u => u.id), content: `<p><strong>${esc(actor.name)}</strong>: ${gone.map(e => esc(e.name)).join(", ")} ended.</p>` });
  }
}

/**
 * Combat rules (Drop 2), from Book I, Section III:
 * - Cover & Concealment as token statuses; Full Cover can't be targeted.
 * - Flanking worked out from token positions, plus the Ranged Attacks crowding rules (enemy within 5ft,
 *   shooting into melee). The Flank Attack and Rear Attack switches stay as manual overrides.
 * - Dual Wielding: off-hand attacks with Light weapons, and fighting defensively with an off-hand weapon or shield.
 * - Contests (Disarm, Dirty Trick, Grapple, Overbear, Trip, breaking free): both sides roll, the GM's client rolls
 *   for creatures the player doesn't own.
 * - Non-Lethal (Subdual) Damage: its own track; Unconscious, not dying, when it reaches current HP.
 * - Morale Checks: 2d6 against the Morale Score, bonuses move the score.
 * - Reactions: no tracker (Kieran, 20 Oct: only some classes have them); their features say so in chat.
 * - Firearms: Misfire Threshold, the natural 1 catastrophe, Reliable, Silent Mechanism and training.
 */
import { ARNEYAN } from "./config.mjs";
import { d20Roll, damageRoll, modeFromEvent } from "./rolls.mjs";
import { statusesOf, toggleCondition } from "./effects.mjs";
import { feetBetween, rangeOf } from "./qol.mjs";
import { combatFor } from "./fight.mjs";

const SYS = "arneyan";
const SOCKET = `system.${SYS}`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NONE = { values: [], adv: [], dis: [] };
const R = (key, value) => ({ key, value });

/* -------------------------------------------- */
/*  Statuses and rule keys                      */
/* -------------------------------------------- */

// Cover & Concealment (Codex): token statuses the attack roll reads. Added here so config.mjs stays untouched.
Object.assign(ARNEYAN.conditions, {
  cover: { name: "Half Cover", icon: "broken-wall", counter: "none", rules: [R("adv.against", -1)],
    text: "Half Cover: attacks made against it have Disadvantage." },
  fullcover: { name: "Full Cover", icon: "stone-wall", counter: "none", rules: [R("no.target", 1)],
    text: "Full Cover: it cannot be targeted directly at all." },
  concealed: { name: "Concealed", icon: "fog", counter: "none", rules: [R("adv.against", -1)],
    text: "Concealment (fog, smoke, dense foliage or similar): attacks made against it have Disadvantage. If it is heavily obscured, the attacker must guess its square or general direction." }
});

const addKeys = (group, keys) => {
  const list = (ARNEYAN.ruleKeys[group] ??= []);
  for (const k of keys) {
    if (!list.includes(k)) list.push(k);
    ARNEYAN.allRuleKeys?.add?.(k);
  }
};
addKeys("Numbers", ["ac.melee", "morale", "firearms.trained"]);
addKeys("Multipliers and limits", ["no.target", "no.flanked", "no.offhand.dis"]);
addKeys("Advantage (+1) or Disadvantage (-1)", ["adv.contest", "adv.contest.grapple", "adv.contest.trip", "adv.contest.disarm", "adv.contest.dirty", "adv.contest.overbear", "adv.contest.escape"]);

/* -------------------------------------------- */
/*  Pure helpers (tested in test/combat.mjs)    */
/* -------------------------------------------- */

const centre = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/**
 * Flanking (Codex): "positioned directly opposite an ally". A line from the attacker's centre to the ally's
 * centre must cross two opposite sides (or corners) of the target's space.
 * @param {{x,y,w,h}} a  Attacker's space.  @param {{x,y,w,h}} b  Ally's space.  @param {{x,y,w,h}} t  Target's space.
 */
export function isOpposite(a, b, t) {
  const p = centre(a), q = centre(b);
  const eps = 1e-6 * Math.max(1, t.w, t.h);
  const x0 = t.x, x1 = t.x + t.w, y0 = t.y, y1 = t.y + t.h;
  const yAt = x => p.y + (q.y - p.y) * ((x - p.x) / (q.x - p.x));
  const xAt = y => p.x + (q.x - p.x) * ((y - p.y) / (q.y - p.y));
  const inY = y => y >= y0 - eps && y <= y1 + eps;
  const inX = x => x >= x0 - eps && x <= x1 + eps;
  const acrossX = ((p.x <= x0 + eps && q.x >= x1 - eps) || (q.x <= x0 + eps && p.x >= x1 - eps)) && Math.abs(q.x - p.x) > eps;
  if (acrossX && inY(yAt(x0)) && inY(yAt(x1))) return true;
  const acrossY = ((p.y <= y0 + eps && q.y >= y1 - eps) || (q.y <= y0 + eps && p.y >= y1 - eps)) && Math.abs(q.y - p.y) > eps;
  if (acrossY && inX(xAt(y0)) && inX(xAt(y1))) return true;
  return false;
}

const SIZE_ORDER = ["tiny", "small", "medium", "large", "huge", "gargantuan"];
/** Grapple, shove and trip: only a creature up to one size larger than yourself. */
export function sizeAllows(attacker, target) {
  const a = SIZE_ORDER.indexOf(attacker || "medium"), t = SIZE_ORDER.indexOf(target || "medium");
  return t - (a < 0 ? 2 : a) <= 1;
}

/** Hit Dice count from a stat block's "4d8+4" (falls back to its Level). */
export function hdCount(hd, level = 1) {
  const m = String(hd ?? "").match(/^\s*(\d+)\s*d/i);
  return m ? Number(m[1]) : Math.max(0, Math.floor(Number(level) || 0));
}

/**
 * Who wins a contest (Codex: higher total wins, ties go to the defender). A natural 20 always succeeds and a
 * natural 1 always fails (Core Resolution), and a condition's automatic failure beats both.
 * @param {{total:number, natural:number, autoFail?:boolean}} att
 * @param {{total:number, natural:number, autoFail?:boolean}} def
 * @returns {"attacker"|"defender"}
 */
export function contestWinner(att, def) {
  const tier = r => (r.autoFail ? 0 : r.natural === 1 ? 1 : r.natural === 20 ? 3 : 2);
  const ta = tier(att), td = tier(def);
  if (ta !== td) return ta > td ? "attacker" : "defender";
  return att.total > def.total ? "attacker" : "defender";
}

/** Morale (Codex): roll 2d6; higher than the Morale Score breaks. Bonuses raise the score, penalties lower it. */
export function moraleResult(score, bonus, total) {
  const effective = (Number(score) || 0) + (Number(bonus) || 0);
  return { effective, breaks: total > effective };
}

/** Light trait: can be used in the off-hand. */
export const isLight = item => item?.type === "weapon" && /\blight\b/i.test(item.system?.traits ?? "");
export const isFinesse = item => item?.type === "weapon" && (/\bfinesse\b/i.test(item.system?.traits ?? "") || item.system?.ability === "finesse");
const hasTrait = (item, t) => new RegExp(`\\b${t}\\b`, "i").test(item?.system?.traits ?? "");

/** Unarmed strikes deal subdual damage by default (natural weapons such as bites and claws don't). */
export function isSubdualWeapon(item) {
  if (item?.type !== "weapon") return false;
  const name = String(item._source?.name ?? item.name ?? "");
  return /\bunarmed\b/i.test(name) || /\b(subdual|non-lethal)\b/i.test(item.system?.traits ?? "");
}

/**
 * A firearm's misfire data, or null when it isn't one. The Catalogue prints "Reload 2 rd, misfire on 1-2." in the
 * description; `flags.arneyan.misfire` (a number, 0 for never) overrides it.
 * @returns {{threshold:number, reliable:boolean, silent:boolean, reload:string}|null}
 */
export function firearmOf(item) {
  if (item?.type !== "weapon") return null;
  const s = item.system ?? {};
  const text = `${s.description ?? ""} ${s.traits ?? ""}`.replace(/<[^>]+>/g, " ");
  const m = text.match(/misfire\s+on\s+(never|\d+)(?:\s*[-–]\s*(\d+))?/i);
  const flag = item.flags?.[SYS]?.misfire;
  const silent = /silent mechanism/i.test(text);
  if (!m && flag === undefined && !silent) return null;
  let threshold = flag !== undefined && flag !== null && flag !== "" ? Math.max(0, Number(flag) || 0)
    : !m || /never/i.test(m[1]) ? 0 : Number(m[2] ?? m[1]);
  const reliable = /\breliable\b/i.test(text);
  if (reliable) threshold = Math.min(threshold, 1);
  if (silent) threshold = 0;
  const reload = (text.match(/reload\s+([^,.]+)/i)?.[1] ?? "").trim();
  return { threshold, reliable, silent, reload };
}

/**
 * Firearms (Codex): a natural roll within the Misfire Threshold jams (no damage). A natural 1 is a catastrophe
 * (except Silent Mechanism, which never checks). Untrained: a roll that would be a critical jams instead.
 */
export function misfireResult(fire, natural, { trained = true, crit = false } = {}) {
  if (!fire || fire.silent) return { jam: false, catastrophe: false, untrainedCrit: false };
  const catastrophe = natural === 1;
  const untrainedCrit = !trained && crit;
  const jam = catastrophe || (natural >= 1 && natural <= fire.threshold) || untrainedCrit;
  return { jam, catastrophe, untrainedCrit };
}

/** The catastrophic failure table (d6). */
export function catastropheFor(d6) {
  if (d6 <= 2) return { key: "damaged", text: "The weapon is damaged and unusable until repaired." };
  if (d6 <= 4) return { key: "backfire", text: "It backfires: half its listed damage (not exploding) to the wielder." };
  if (d6 === 5) return { key: "destroyed", text: "It is destroyed outright." };
  return { key: "explodes", text: "It explodes: full listed damage (exploding dice apply) to the wielder and every creature within 5ft." };
}

/** Non-lethal track: knocked out when accumulated subdual damage equals or exceeds current HP (above 0). */
export function subdualState(hpValue, subdual) {
  if (hpValue <= 0) return "";
  return subdual > 0 && subdual >= hpValue ? "ko" : "awake";
}

/** Exploding dice off: "2d6x" reads "2d6" (a backfire's half damage doesn't explode). */
export const noExplode = f => String(f ?? "").replace(/(\d*d\d+)x\d*/gi, "$1");

/* -------------------------------------------- */
/*  Small Foundry helpers                       */
/* -------------------------------------------- */

const canAct = a => !!a && !a.system?.noAct;
const tokenOf = actor => actor?.token?.object ?? actor?.getActiveTokens?.()?.[0] ?? null;
const rectOf = tok => {
  const d = tok.document ?? tok;
  const gs = d.parent?.grid?.size ?? canvas?.scene?.grid?.size ?? 100;
  return { x: d.x, y: d.y, w: (d.width ?? 1) * gs, h: (d.height ?? 1) * gs };
};
const positional = () => { try { return game.settings.get(SYS, "positionalCombat") !== false; } catch { return true; } };
const isGMClient = () => { const gm = game.users.activeGM; return gm ? gm.id === game.user.id : game.user.isGM; };
const subdualOf = actor => Math.max(0, Number(actor?.flags?.[SYS]?.subdual) || 0);
const sizeOf = actor => actor?.system?.details?.size ?? "medium";

/** A creature's melee reach: 5ft, 10ft with a Reach weapon, +5ft if Large or bigger (Codex, Size). */
function reachOf(actor) {
  const ws = (actor?.items ?? []).filter(i => i.type === "weapon" && !i.system.ranged && (actor.type === "npc" || i.system.equipped));
  const weapon = Math.max(5, ...ws.map(w => rangeOf(w).reach || 5));
  return weapon + (["large", "huge", "gargantuan"].includes(sizeOf(actor)) ? 5 : 0);
}

/** Tokens on the scene that are creatures able to act. */
const creaturesOnScene = () => (canvas?.tokens?.placeables ?? []).filter(t => t.actor && !["party", "storage"].includes(t.actor.type) && !t.document.hidden && canAct(t.actor));

/** Turn after which an effect "until the start of your next turn" ends. */
function startOfNextTurn(combat, actor) {
  if (!combat?.started) return null;
  const idx = combat.turns.findIndex(c => c.actor === actor || (c.actorId === actor.id && c.token?.actor === actor));
  if (idx < 0) return null;
  return { combat: combat.id, round: idx > (combat.turn ?? 0) ? combat.round : combat.round + 1, turn: idx };
}

/* -------------------------------------------- */
/*  Before an attack                            */
/* -------------------------------------------- */

/**
 * Firearms training (Codex v0.10.0): a 1st-level class of Gunslinger, Fighter or Ranger, and Tenor Hold dwarves; anyone
 * with backstory or downtime training. Levels in those classes taken later don't train you (Weapon Proficiency).
 */
export function firstClass(actor) {
  // The class added first (the sheet's order), as starting gold and weapon training read it.
  return (actor?.items ?? []).find(i => i.type === "class") ?? null;
}
export function firearmsTrained(actor) {
  if (actor?.type !== "character") return true;
  if (actor.flags?.[SYS]?.firearmsTrained) return true;
  if ((actor.system.mods?.sum?.("firearms.trained") ?? 0) > 0) return true;
  if (/^(gunslinger|fighter|ranger)\b/i.test(firstClass(actor)?.name ?? "")) return true;
  return actor.items.some(i => i.type === "ancestry" && /tenor\s*hold/i.test(`${i.name} ${JSON.stringify(i.flags?.[SYS] ?? {})}`));
}

/** A jammed, damaged or destroyed gun: ask before letting it fire. Returns false to stop the attack. */
async function gunReady(item, fire) {
  const state = item.getFlag?.(SYS, "gunState");
  if (!state) return true;
  const { DialogV2 } = foundry.applications.api;
  if (state === "destroyed" && !game.user.isGM) { ui.notifications.warn(`${item.name} was destroyed by a misfire.`); return false; }
  const text = {
    jammed: `<p><strong>${esc(item.name)}</strong> is jammed. Clearing it takes ${esc(fire?.reload || "its Reload time")} (its Reload time), as well as a normal reload.</p><p>Has it been cleared?</p>`,
    damaged: `<p><strong>${esc(item.name)}</strong> is damaged and unusable until repaired.</p><p>Has it been repaired?</p>`,
    destroyed: `<p><strong>${esc(item.name)}</strong> was destroyed by a misfire. Restore it (GM)?</p>`
  }[state] ?? "";
  const ok = await DialogV2.confirm({ window: { title: item.name }, content: text, rejectClose: false, yes: { label: state === "jammed" ? "Cleared: fire" : "Yes" }, no: { label: "Not yet" } });
  if (!ok) return false;
  if (item.isOwner) await item.unsetFlag(SYS, "gunState");
  return true;
}

/** Rolls already made this round: is this the first melee attack against that creature (in the encounter it's in)? */
function firstMeleeAgainst(actor) {
  const uuid = actor?.uuid;
  const combat = combatFor(actor);
  if (!combat?.started) return true;
  const stamp = `${combat.id}.${combat.round}`;
  return !game.messages.contents.slice(-80).some(m => {
    const f = m.flags?.[SYS];
    return f?.kind === "attack" && f.melee && f.stamp === stamp && (f.targets ?? []).some(t => t.uuid === uuid);
  });
}

/** A target's AC against this attack: fighting defensively adds to it against melee (Codex, Dual Wielding & Shields). */
export function targetAC(actor, { ranged = false } = {}) {
  let ac = actor.acTotal ?? actor.system?.acTotal ?? 0;
  if (ranged) return ac;
  const bonus = actor.system?.mods?.sum?.("ac.melee") ?? 0;
  if (!bonus) return ac;
  // A plain Light weapon guards against the first melee attack each round only.
  const firstOnly = actor.effects?.some?.(e => !e.disabled && e.flags?.[SYS]?.defensive === "light");
  return ac + (firstOnly && !firstMeleeAgainst(actor) ? 0 : bonus);
}

/**
 * What the Codex's combat rules add to an attack, worked out before it is rolled.
 * @returns {Promise<{block:boolean, adv:object[], notes:string[], extra:object, fire:object|null, trained:boolean, footer:Function, after:Function}>}
 */
export async function attackSituation(actor, item, targets, { offhand = false } = {}) {
  const ranged = !!item.system.ranged;
  const out = { block: false, adv: [], notes: [], extra: { melee: !ranged, offhand: !!offhand }, fire: null, trained: true };
  const combat = combatFor(actor);
  if (combat?.started) out.extra.stamp = `${combat.id}.${combat.round}`;

  // Full Cover: can't be targeted directly.
  const hidden = targets.filter(t => t.actor.system?.mods?.has?.("no.target"));
  if (hidden.length) {
    ui.notifications.warn(`${hidden.map(t => t.name).join(", ")} ${hidden.length === 1 ? "is" : "are"} in Full Cover and can't be targeted directly.`);
    out.block = true;
    return out;
  }
  // Cover on one of several targets: one roll can't carry it, so say so.
  if (targets.length > 1) {
    for (const t of targets) {
      const st = statusesOf(t.actor);
      const c = ["cover", "concealed"].filter(id => st.has(id)).map(id => ARNEYAN.conditions[id].name);
      if (c.length) out.notes.push(`${t.name}: ${c.join(", ")} (Disadvantage against it)`);
    }
  }

  // Firearms.
  const fire = firearmOf(item);
  if (fire) {
    if (!(await gunReady(item, fire))) { out.block = true; return out; }
    out.fire = fire;
    out.trained = firearmsTrained(actor);
    if (!out.trained) out.adv.push({ values: [-1], adv: [], dis: ["Untrained with firearms"] });
    out.notes.push(fire.silent ? "Silent Mechanism: never misfires." : `Misfires on a natural ${fire.threshold > 1 ? `1-${fire.threshold}` : "1"}${fire.reliable ? " (Reliable)" : ""}.`);
    if (!out.trained) out.notes.push("Untrained: a roll that would be a critical hit jams instead.");
  }

  // Off-hand attack (Codex, Dual Wielding): Light weapons only, Disadvantage, no attribute modifier to damage.
  if (offhand) {
    if (!isLight(item)) ui.notifications.warn(`${item.name} isn't Light: only a Light weapon can be used in the off-hand.`);
    if (actor.items?.some?.(i => i.type === "armour" && i.system.category === "shield" && i.system.equipped)) out.notes.push("Dual wielding needs a free hand for each weapon: not while holding a shield.");
    if (!actor.system?.mods?.has?.("no.offhand.dis")) out.adv.push({ values: [-1], adv: [], dis: ["Off-hand"] });
    out.notes.push("Off-hand attack: adds no attribute modifier to damage.");
    if (actor.effects?.some?.(e => !e.disabled && ["light", "finesse"].includes(e.flags?.[SYS]?.defensive))) out.notes.push("Fighting defensively with the off-hand weapon: it can't also attack this round.");
  }

  // Positions: flanking (melee) and crowding (ranged).
  const from = tokenOf(actor);
  if (positional() && from && canvas?.scene && targets.length === 1) {
    const t = targets[0];
    const tTok = t.token;
    const tm = t.actor.system?.mods;
    const allies = creaturesOnScene().filter(o => o.id !== from.id && o.id !== tTok.id && o.document.disposition === from.document.disposition && o.document.disposition !== (CONST.TOKEN_DISPOSITIONS?.NEUTRAL ?? 0));
    if (!ranged) {
      const inReach = feetBetween(from.document, tTok.document) <= Math.max(rangeOf(item).reach || 5, reachOf(actor));
      if (inReach && !tm?.has?.("no.flanked")) {
        const flanker = allies.find(o => feetBetween(o.document, tTok.document) <= reachOf(o.actor) && isOpposite(rectOf(from), rectOf(o), rectOf(tTok)));
        if (flanker) out.adv.push({ values: [1], adv: [`Flanking with ${flanker.name}`], dis: [] });
      }
    } else {
      const disp = from.document.disposition;
      const enemyNear = creaturesOnScene().find(o => o.id !== from.id && o.document.disposition * disp === -1 && feetBetween(from.document, o.document) <= 5);
      if (enemyNear) out.adv.push({ values: [-1], adv: [], dis: [`${enemyNear.name} within 5ft (close quarters)`] });
      const engaged = allies.find(o => feetBetween(o.document, tTok.document) <= 5);
      if (engaged) out.adv.push({ values: [-1], adv: [], dis: [`Shooting into melee (${engaged.name})`] });
    }
  }

  // After the roll: misfires.
  out.footer = normal => args => {
    const r = misfireResult(out.fire, args.natural, { trained: out.trained, crit: args.crit });
    if (!r.jam) return normal(args);
    const why = r.catastrophe ? "Natural 1: catastrophic misfire (the d6 follows)." : r.untrainedCrit ? "Untrained: the critical becomes a misfire." : `Natural ${args.natural}: within the Misfire Threshold.`;
    return `<div class="arn-outcome failure arn-misfire"><i class="fa-solid fa-gun"></i> Misfire: ${esc(item.name)} jams. No damage. ${esc(why)} Clearing it takes ${esc(out.fire.reload || "its Reload time")}, then a normal reload.</div>`;
  };
  out.after = async msg => {
    if (!msg || !out.fire) return msg;
    const f = msg.flags?.[SYS] ?? {};
    const r = misfireResult(out.fire, f.natural, { trained: out.trained, crit: !!f.crit });
    if (!r.jam) return msg;
    if (item.isOwner) await item.setFlag(SYS, "gunState", "jammed").catch(() => null);
    if (r.catastrophe) await catastrophe(actor, item);
    return msg;
  };
  return out;
}

/** The natural 1 table: roll a d6 and do what it says. */
async function catastrophe(actor, item) {
  const roll = await new Roll("1d6").evaluate();
  const c = catastropheFor(roll.total);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), rolls: [roll],
    content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-explosion"></i> <span>${esc(item.name)}: catastrophic misfire</span></header>
      <div class="arn-card-result"><span class="arn-total">${roll.total}</span><span class="arn-target">d6</span></div><p>${esc(c.text)}</p></div>`
  });
  if (["damaged", "destroyed"].includes(c.key) && item.isOwner) await item.setFlag(SYS, "gunState", c.key).catch(() => null);
  const formula = item.system.damage;
  if (!formula || !["backfire", "explodes"].includes(c.key)) return;
  const me = tokenOf(actor);
  const hits = [{ name: actor.name, uuid: actor.uuid }];
  if (c.key === "explodes" && me && canvas?.scene) {
    for (const t of (canvas.tokens?.placeables ?? []).filter(t => t.actor && t.id !== me.id && !["party", "storage"].includes(t.actor.type))) {
      if (feetBetween(me.document, t.document) <= 5) hits.push({ name: t.name, uuid: t.actor.uuid });
    }
  }
  return damageRoll({
    actor, title: `${item.name}: ${c.key === "backfire" ? "Backfire" : "Explosion"}`, formula: c.key === "backfire" ? noExplode(formula) : formula,
    damageType: item.system.damageType, hits, misses: [],
    notes: [c.key === "backfire" ? "Half of this to the wielder: press ½." : "Full damage to the wielder and every creature within 5ft."]
  });
}

/* -------------------------------------------- */
/*  Fighting defensively                        */
/* -------------------------------------------- */

const DEFEND = {
  light: { label: "Light off-hand weapon", rules: [R("ac.melee", 1)], text: "+1 AC against the first melee attack this round (none against ranged attacks)." },
  finesse: { label: "Light Finesse off-hand weapon", rules: [R("ac.melee", 1)], text: "+1 AC against every melee attack this round (none against ranged attacks)." },
  shield: { label: "Shield", rules: [R("ac", 1), R("note.attack", "Fighting defensively with your shield: no extra attacks this turn, and if you have none, this attack has Disadvantage")],
    text: "+1 to the shield's AC bonus until your next turn, against melee and ranged attacks. It costs your extra attacks this turn; if you have none, your attack has Disadvantage." }
};

/** The defensive options this creature's gear allows. */
export function defendOptions(actor) {
  const held = (actor?.items ?? []).filter(i => actor.type === "npc" || i.system?.equipped);
  const out = [];
  // "Instead of attacking with your off-hand weapon": only with a second weapon in hand.
  const weapons = held.filter(i => i.type === "weapon");
  if (weapons.length < 2) {
    if (held.some(i => i.type === "armour" && i.system.category === "shield")) out.push("shield");
    return out;
  }
  // A Light Finesse weapon guards against every melee attack, so it replaces the plain Light option.
  if (held.some(i => isLight(i) && isFinesse(i))) out.push("finesse");
  else if (held.some(i => isLight(i))) out.push("light");
  if (held.some(i => i.type === "armour" && i.system.category === "shield")) out.push("shield");
  return out;
}

/** Use the off-hand weapon (or shield) to defend: an effect that lasts until the start of your next turn. */
export async function fightDefensively(actor, mode) {
  if (!actor?.isOwner) return;
  const d = DEFEND[mode];
  const old = actor.effects.filter(e => e.flags?.[SYS]?.defensive);
  if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old.map(e => e.id));
  if (!d || old.some(e => e.flags[SYS].defensive === mode)) return; // clicking the same one again switches it off
  // The off-hand weapon guards "that round"; the shield until your next turn (in the encounter this creature is in).
  const c = combatFor(actor);
  const expires = mode === "shield" ? startOfNextTurn(c, actor) : (c?.started ? { combat: c.id, round: c.round + 1, turn: 0 } : null);
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: `Fighting defensively (${d.label})`, img: "icons/svg/shield.svg", description: `<p>${d.text}</p>`,
    flags: { [SYS]: { rules: d.rules, defensive: mode, sourceName: "Dual Wielding & Shields", ...(expires ? { expires } : {}) } }
  }]);
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-shield-halved"></i> <span>${esc(actor.name)} fights defensively</span></header><p>${esc(d.label)}: ${esc(d.text)}</p></div>` });
}

/* -------------------------------------------- */
/*  Unarmed strikes                             */
/* -------------------------------------------- */

/** Unarmed Strike (Codex): 1d2 + Strength, subdual. Added to the sheet as a weapon the first time it's used. */
export async function unarmedStrike(actor, event) {
  const w = await ensureUnarmed(actor);
  return w ? actor.rollAttack(w, event) : undefined;
}

/** The actor's Unarmed Strike weapon, added to the sheet the first time it's needed (null if it can't be). */
export async function ensureUnarmed(actor) {
  if (!actor) return null;
  let w = actor.items.find(i => i.type === "weapon" && /^unarmed strike$/i.test(i._source?.name ?? i.name));
  if (!w) {
    if (!actor.isOwner) return null;
    [w] = await actor.createEmbeddedDocuments("Item", [{
      name: "Unarmed Strike", type: "weapon", img: "systems/arneyan/assets/icons/action-fist.svg",
      system: { damage: "1d2", damageType: "bludgeoning", ability: "str", ranged: false, traits: "Subdual", equipped: true, slots: 0,
        description: "<p>Any character can make an unarmed strike for 1d2 + Strength modifier, always subdual damage unless a class or ancestry feature says otherwise.</p>" }
    }]);
    ui.notifications.info(`${actor.name}: Unarmed Strike added to the weapons.`);
  }
  return w ?? null;
}

/* -------------------------------------------- */
/*  Contests                                    */
/* -------------------------------------------- */

/**
 * Combat Manoeuvres contests (Codex). `att` and `def` are the attribute choices for each side; the better one is
 * picked for whoever has the choice. `adv` is the weapon trait that gives the attacker Advantage.
 */
export const CONTESTS = {
  grapple: { label: "Grapple", icon: "hand-fist", att: ["str"], def: ["str", "dex"], size: true, trait: "entangling",
    win: "is Restrained (grappled). It breaks free with a Strength or Dexterity check against the grappler's Strength." },
  trip: { label: "Trip", icon: "person-falling", att: ["str", "dex"], def: ["str", "dex"], size: true, trait: "entangling", win: "is knocked Prone. No damage." },
  disarm: { label: "Disarm", icon: "hand-holding", att: ["str"], def: ["str", "dex"], trait: "sunder", win: "drops its weapon." },
  dirty: { label: "Dirty Trick", icon: "hand-sparkles", att: ["dex"], def: ["dex", "wis"], win: "is Blinded until the end of its next turn." },
  overbear: { label: "Overbear", icon: "person-falling-burst", att: ["str"], def: ["str", "dex"], size: true, win: "is knocked Prone as well." },
  escape: { label: "Break free", icon: "unlock", att: ["str", "dex"], def: ["str"], win: "" }
};

/**
 * An attribute check's parts and Advantage for a contest: d20 + the attribute modifier. A monster uses the modifiers in
 * its stat block, as a character does (Codex, books v0.10.5; the old "save minus half its HD" is gone).
 */
export function contestParts(actor, ab, kind) {
  const m = actor.system?.mods;
  const parts = [{ label: ARNEYAN.abilityAbbr[ab], value: actor.system.abilities?.[ab]?.mod ?? 0 }, ...(m?.parts("check", `check.${ab}`) ?? [])];
  const adv = m?.adv("adv.check", `adv.check.${ab}`) ?? NONE;
  const fail = m?.has?.(`fail.check.${ab}`) ? m.sources(`fail.check.${ab}`).join(", ") : "";
  return { parts, adv, fail, total: parts.reduce((t, p) => t + (Number(p.value) || 0), 0) };
}

/** The better of the choices, for whoever gets to choose (failing automatically counts as worst). */
export function bestChoice(actor, choices, kind) {
  let best = choices[0], score = -Infinity;
  for (const ab of choices) {
    const c = contestParts(actor, ab, kind);
    const mode = modeFromEvent(null, c.adv.values);
    const s = c.fail ? -100 : c.total + mode * 3;
    if (s > score) { score = s; best = ab; }
  }
  return best;
}

async function contestRoll(actor, ab, { kind, role, vs, extraAdv = [], event = null, extra = {}, notes = [] }) {
  const c = contestParts(actor, ab, kind);
  const keys = role === "attacker" ? ["adv.contest", `adv.contest.${kind}`] : [];
  const own = actor.system?.mods?.adv(...keys) ?? NONE;
  const sources = [c.adv, ...(keys.length ? [own] : []), ...extraAdv];
  const values = sources.flatMap(s => s.values ?? []);
  const why = { adv: sources.flatMap(s => s.adv ?? []), dis: sources.flatMap(s => s.dis ?? []) };
  if (event?.shiftKey) why.adv.push("Shift-click");
  if (event?.ctrlKey || event?.metaKey) why.dis.push("Ctrl-click");
  const label = ARNEYAN.abilities[ab];
  return d20Roll({
    actor, kind: "contest", mode: modeFromEvent(event, values), why, autoFail: c.fail,
    title: `${CONTESTS[kind].label}: ${label} check${role === "defender" ? " (resisting)" : ""}${vs ? ` vs ${vs}` : ""}`,
    parts: c.parts, notes: [...notes, ...(actor.system?.mods?.notesFor?.("check") ?? [])],
    extra: { ...extra, ability: ab, actorUuid: actor.uuid }
  });
}

/** Start a contest against your one target (or, to break free, against the creature holding you). */
export async function startContest(actor, kind, event = null) {
  const cfg = CONTESTS[kind];
  if (!actor || !cfg) return;
  if (!actor.isOwner) return ui.notifications.warn(`You don't control ${actor.name}.`);
  const targets = Array.from(game.user.targets ?? []).filter(t => t.actor && t.actor !== actor);
  let target = targets.length === 1 ? targets[0].actor : null;
  // Breaking free with no target: the creature whose grapple holds you, if it's on the scene.
  if (!target && kind === "escape") {
    const by = actor.effects.find(e => e.flags?.[SYS]?.grappledBy)?.flags[SYS].grappledBy;
    target = by ? await fromUuid(by).catch(() => null) : null;
  }
  if (!target) return ui.notifications.warn(`${cfg.label}: target one creature first.`);
  if (cfg.size && !sizeAllows(sizeOf(actor), sizeOf(target))) return ui.notifications.warn(`${cfg.label}: ${target.name} is more than one size larger than ${actor.name}.`);
  const tst = statusesOf(target), mst = statusesOf(actor);
  if (kind === "overbear" && !tst.has("restrained")) return ui.notifications.warn(`Overbear: grapple ${target.name} first (it must already be Restrained). Use Trip to knock it down without a grapple.`);
  if (kind === "escape" && !mst.has("restrained")) return ui.notifications.warn(`${actor.name} isn't Restrained.`);
  const fight = combatFor(actor);
  if (kind === "dirty" && fight?.started && (target.flags?.[SYS]?.dirtyTricked ?? []).includes(`${fight.id}:${actor.uuid}`)) {
    return ui.notifications.warn(`${target.name} has already fallen for ${actor.name}'s Dirty Trick this fight.`);
  }
  // Weapon traits: Entangling (Trip and Grapple) and Sunder (Disarm) give Advantage when the attempt is made with it.
  const extraAdv = [];
  const notes = [];
  if (cfg.trait) {
    const w = actor.items.find(i => i.type === "weapon" && (actor.type === "npc" || i.system.equipped) && hasTrait(i, cfg.trait));
    if (w) { extraAdv.push({ values: [1], adv: [`${w.name} (${cfg.trait[0].toUpperCase()}${cfg.trait.slice(1)})`], dis: [] }); notes.push(`Made with ${w.name}.`); }
  }
  // Small creatures: Advantage on checks to escape a Grapple or Restrained (Codex, Size).
  if (kind === "escape" && sizeOf(actor) === "small") extraAdv.push({ values: [1], adv: ["Small"], dis: [] });
  if (kind === "dirty") notes.push("A creature only falls for your Dirty Trick once per fight.");
  const ab = bestChoice(actor, cfg.att, kind);
  const msg = await contestRoll(actor, ab, { kind, role: "attacker", vs: target.name, extraAdv, event, notes,
    extra: { contest: { kind, targetUuid: target.uuid, attackerUuid: actor.uuid, combat: fight?.started ? fight.id : "" } } });
  if (!msg) return;
  if (target.isOwner) return resolveContest(msg, target, actor);
  if (!game.users.activeGM) return ui.notifications.warn("No GM is connected to roll for the other side.");
  game.socket.emit(SOCKET, { action: "combatContest", messageId: msg.id, targetUuid: target.uuid });
  ui.notifications.info(`The GM's client rolls for ${target.name}.`);
}

/** The defender rolls, the winner is worked out and the result applied (on the target owner's or the GM's client). */
export async function resolveContest(message, target, attacker) {
  const f = message.flags?.[SYS] ?? {};
  const kind = f.contest?.kind;
  const cfg = CONTESTS[kind];
  if (!cfg || f.contest.resolved) return;
  // Breaking free is resisted by the grappler's Strength; the rest by the defender's choice.
  const ab = bestChoice(target, cfg.def, kind);
  const dmsg = await contestRoll(target, ab, { kind, role: "defender", vs: attacker.name });
  const d = dmsg?.flags?.[SYS] ?? {};
  const att = { total: (f.total ?? 0) + (f.luckBurned ?? 0), natural: f.natural, autoFail: !!f.autoFail };
  const def = { total: (d.total ?? 0) + (d.luckBurned ?? 0), natural: d.natural, autoFail: !!d.autoFail };
  const won = contestWinner(att, def) === "attacker";
  const lines = [];
  if (won) {
    if (kind === "grapple") {
      await target.createEmbeddedDocuments("ActiveEffect", [{ name: `Grappled by ${attacker.name}`, img: `systems/${SYS}/assets/conditions/restrained.svg`, statuses: ["restrained"],
        description: "<p>Restrained by a grapple. Break free with a Strength or Dexterity check contested by the grappler's Strength, as an action.</p>",
        flags: { [SYS]: { grappledBy: attacker.uuid, sourceName: "Grapple" } } }]);
    } else if (kind === "trip" || kind === "overbear") {
      await toggleCondition(target, "prone", true);
    } else if (kind === "dirty") {
      await target.createEmbeddedDocuments("ActiveEffect", [{ name: `Dirty Trick (${attacker.name})`, img: `systems/${SYS}/assets/conditions/blinded.svg`, statuses: ["blinded"],
        flags: { [SYS]: { value: 1, sourceName: "Dirty Trick" } } }]);
      // Once per fight: remembered for this combat only.
      if (f.contest.combat) await target.setFlag(SYS, "dirtyTricked", [...(target.flags?.[SYS]?.dirtyTricked ?? []), `${f.contest.combat}:${attacker.uuid}`].slice(-20));
    } else if (kind === "escape") {
      const gone = attacker.effects.filter(e => (e.statuses?.has?.("restrained") ?? false) && (e.flags?.[SYS]?.grappledBy === target.uuid || !e.flags?.[SYS]?.grappledBy));
      if (gone.length && attacker.isOwner) await attacker.deleteEmbeddedDocuments("ActiveEffect", gone.map(e => e.id));
    }
  }
  const outcome = kind === "escape"
    ? (won ? `${attacker.name} breaks free.` : `${attacker.name} is still held.`)
    : (won ? `${target.name} ${cfg.win}` : `${target.name} resists.`);
  lines.push(`${attacker.name} ${att.total} (${ARNEYAN.abilities[f.ability] ?? ""}) vs ${target.name} ${def.total} (${ARNEYAN.abilities[ab] ?? ""})${att.total === def.total && !won ? ": a tie goes to the defender" : ""}.`);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: `<div class="arn-card arn-contest"><header class="arn-card-title"><i class="fa-solid fa-${cfg.icon}"></i> <span>${esc(cfg.label)}: ${won ? "success" : "failure"}</span></header>
      <p>${esc(lines[0])}</p><div class="arn-outcome ${won ? "success" : "failure"}">${esc(outcome)}</div></div>`
  });
  if (message.canUserModify?.(game.user, "update")) await message.setFlag(SYS, "contest", { ...f.contest, resolved: true }).catch(() => null);
  return won;
}

/* -------------------------------------------- */
/*  Morale                                      */
/* -------------------------------------------- */

/** A Morale Check for a creature (and the rest of its group: same name and stat block). */
export async function rollMorale(actor, { group = [] } = {}) {
  if (!actor || actor.type !== "npc") return;
  const score = Number(actor.system.attributes.morale) || 0;
  if (!score) return ui.notifications.warn(`${actor.name} has no Morale Score. Set one (2 to 12) on its sheet.`);
  const m = actor.system.mods;
  const bonus = m?.sum("morale") ?? 0;
  const roll = await new Roll("2d6").evaluate();
  const r = moraleResult(score, bonus, roll.total);
  const parts = [`Morale ${score}`, ...(m?.parts("morale") ?? []).map(p => `${p.value >= 0 ? "+" : ""}${p.value} ${p.label}`)];
  const who = group.length > 1 ? `${actor.name} (×${group.length})` : actor.name;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), rolls: [roll], flags: { [SYS]: { kind: "morale", breaks: r.breaks } },
    content: `<div class="arn-card arn-morale"><header class="arn-card-title"><i class="fa-solid fa-flag"></i> <span>${esc(who)}: Morale Check</span></header>
      <div class="arn-card-dice">${roll.dice[0].results.map(x => `<span class="arn-die">${x.result}</span>`).join("")}</div>
      <div class="arn-card-result"><span class="arn-total">${roll.total}</span><span class="arn-target" data-tooltip="${esc(parts.join(" "))}">vs Morale ${r.effective}</span></div>
      <div class="arn-outcome ${r.breaks ? "failure" : "success"}">${r.breaks ? "Breaks: it routs, flees or surrenders (the GM decides how)." : "Holds, until the next trigger."}</div></div>`
  }, { rollMode: game.settings.get("core", "rollMode") });
}

/* -------------------------------------------- */
/*  Reactions                                   */
/* -------------------------------------------- */


/**
 * Items that answer a trigger with the creature's reaction. With an activity (`act`): that option is one (its data
 * says so: Combat Reflexes' Attack of Opportunity, a Swashbuckler's Riposte), or the whole item is.
 */
export function isReactionItem(item, act = null) {
  if (!item || !["ability", "feat"].includes(item.type)) return false;
  if (act?.reaction) return true;
  if (item.flags?.[SYS]?.reaction) return true;
  // Every option it has is a reaction (Flourish Manoeuvres: Parry, Riposte, Acrobatic Escape).
  const acts = item.system?.activities ?? [];
  if (acts.length && acts.every(a => a.reaction)) return true;
  if (/^(opportunity attack|attack of opportunity|parry)$/i.test(item.name)) return true;
  return /^\s*(<p>)?\s*reaction\b/i.test(item.system?.description ?? "");
}

/**
 * An encounter ended: every combatant's "per encounter" uses (feats, features, kit features) are full again. One
 * update per creature. Returns how many items were reset. Week uses are left to the players (see the README).
 */
export async function resetEncounterUses(combat) {
  const seen = new Set();
  let n = 0;
  for (const c of combat?.combatants ?? []) {
    const actor = c.actor;
    if (!actor || seen.has(actor.uuid ?? actor)) continue;
    seen.add(actor.uuid ?? actor);
    const updates = (actor.items ?? []).filter(i => ["ability", "feat"].includes(i.type) && i.system?.uses?.per === "encounter" && i.system.uses.max > 0 && i.system.uses.value < i.system.uses.max)
      .map(i => ({ _id: i.id, "system.uses.value": i.system.uses.max }));
    if (!updates.length) continue;
    try { await actor.updateEmbeddedDocuments("Item", updates); n += updates.length; } catch (err) { console.warn(`Arneyan | encounter uses: ${actor.name}`, err); }
  }
  return n;
}

/**
 * A class or kit feature, or a feat, that is a reaction (a Swashbuckler's Riposte, Combat Reflexes): its use says so in
 * chat. General manoeuvres (Attack of Opportunity, Parry) and monster abilities don't, and nothing is tracked
 * (Kieran, 20 Oct 2026).
 */
export function isReactionFeature(item, act = null) {
  if (!isReactionItem(item, act)) return false;
  return item.type === "feat" || (item.type === "ability" && !["action", "monster"].includes(item.system?.kind));
}

/* -------------------------------------------- */
/*  Using items                                 */
/* -------------------------------------------- */

const CONTEST_NAMES = { grapple: "grapple", trip: "trip", disarm: "disarm", "dirty trick": "dirty", overbear: "overbear" };

/**
 * Items with combat rules of their own: contests roll, Unarmed Strike attacks. Returns a result when it handled the
 * use, else undefined and the item is used as usual. A reaction feature notes it in chat (documents.mjs) once the use
 * has happened: not when a weapon or target prompt is cancelled, nor when no attack rolled.
 */
export async function combatUse(item, event) {
  const actor = item.actor;
  if (!actor || item.type !== "ability") return undefined;
  const kind = item.flags?.[SYS]?.contest ?? (item.system.kind === "action" ? CONTEST_NAMES[item.name.toLowerCase()] : null);
  if (kind && CONTESTS[kind]) { await startContest(actor, kind, event); return null; }
  if (item.system.kind === "action" && /^unarmed strike$/i.test(item.name)) return (await unarmedStrike(actor, event)) ?? null;
  return undefined;
}

/* -------------------------------------------- */
/*  Non-lethal damage                           */
/* -------------------------------------------- */

/** Knock out or wake up by the subdual track (run by whoever changed HP or the track). */
export async function syncSubdual(actor) {
  if (!actor?.isOwner || !["character", "npc"].includes(actor.type)) return;
  const hp = actor.system.attributes.hp.value;
  const state = subdualState(hp, subdualOf(actor));
  // At 0 HP or below the dying rules decide (documents.mjs); the knock-out is left as it is.
  if (!state) return;
  const ko = actor.effects.filter(e => e.flags?.[SYS]?.subdualKO);
  if (state === "ko" && !ko.length) {
    // An origin keeps it apart from the plain Unconscious that going down and getting back up adds and removes.
    await actor.createEmbeddedDocuments("ActiveEffect", [{ name: "Knocked out (non-lethal)", img: `systems/${SYS}/assets/conditions/unconscious.svg`, statuses: ["unconscious"], origin: actor.uuid,
      description: "<p>Non-lethal damage has reached current HP: Unconscious, not dying. Damage or an ally's action rouses it; Smelling Salts too.</p>",
      flags: { [SYS]: { subdualKO: true, sourceName: "Non-lethal damage" } } }]);
  } else if (state !== "ko" && ko.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", ko.map(e => e.id).filter(id => actor.effects.has(id)));
  }
}

/** The update that adds subdual damage to the track. */
export const subdualUpdate = (actor, amount) => ({ [`flags.${SYS}.subdual`]: subdualOf(actor) + Math.max(0, Math.floor(amount) || 0) });

/* -------------------------------------------- */
/*  Sheet                                       */
/* -------------------------------------------- */

/** What the Actions tab's combat tools show. */
export function combatSheetContext(actor) {
  const isChar = actor.type === "character";
  const defending = actor.effects?.find?.(e => e.flags?.[SYS]?.defensive)?.flags[SYS].defensive ?? "";
  const restrained = statusesOf(actor).has("restrained");
  const hasGun = (actor.items ?? []).some(i => firearmOf(i));
  return {
    defend: defendOptions(actor).map(mode => ({ mode, label: DEFEND[mode].label, tip: DEFEND[mode].text, on: defending === mode })),
    contests: Object.entries(CONTESTS).filter(([k]) => k !== "escape" || restrained).map(([kind, c]) => ({ kind, label: c.label, icon: c.icon,
      tip: kind === "escape" ? "Strength or Dexterity check against the grappler's Strength" : `Contest against your target: ${c.label}` })),
    unarmed: isChar,
    morale: actor.type === "npc" ? { score: actor.system.attributes.morale, bonus: actor.system.mods?.sum?.("morale") ?? 0 } : null,
    subdual: subdualOf(actor),
    guns: isChar && hasGun ? { trained: firearmsTrained(actor), flag: !!actor.flags?.[SYS]?.firearmsTrained } : null
  };
}

/** Sheet actions (bound to the sheet: `this` is the application). */
export const combatSheetActions = {
  offhandAttack(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    return item ? this.document.rollAttack(item, event, { offhand: true }) : null;
  },
  fightDefensively(event, target) { return fightDefensively(this.document, target.dataset.mode); },
  contest(event, target) { return startContest(this.document, target.dataset.kind, event); },
  unarmedStrike(event) { return unarmedStrike(this.document, event); },
  rollMorale() { return rollMorale(this.document); },
  clearSubdual() { return this.document.isOwner ? this.document.update({ [`flags.${SYS}.subdual`]: 0 }) : null; }
};

/* -------------------------------------------- */
/*  Combat tracker                              */
/* -------------------------------------------- */

/** Monsters of one kind share a Morale Score: the same stat block and name. */
const groupOf = (combat, c) => combat.combatants.filter(o => o.actor?.type === "npc" && !o.isDefeated && (o.actorId === c.actorId) && (o.token?.name ?? o.name) === (c.token?.name ?? c.name));

function trackerOptions(app, options) {
  const combatantOf = li => {
    const el = li instanceof HTMLElement ? li : li?.[0];
    return (app.viewed ?? game.combat)?.combatants.get(el?.dataset?.combatantId);
  };
  // The same entry shape as the chat log's menu (chat.mjs), which works on v13 and v14.
  const push = (label, icon, condition, fn) => options.push({ name: label, label, icon: `<i class="fa-solid ${icon}"></i>`, condition, callback: fn });
  push("Morale check", "fa-flag", li => { const c = combatantOf(li); return !!c?.actor && c.actor.type === "npc" && (game.user.isGM || c.isOwner); },
    li => { const c = combatantOf(li); return rollMorale(c.actor, { group: groupOf(app.viewed ?? game.combat, c) }); });
}

/* -------------------------------------------- */
/*  Socket (GM side)                            */
/* -------------------------------------------- */

async function onSocket(msg, senderId) {
  if (!msg || typeof msg !== "object" || msg.action !== "combatContest" || !isGMClient()) return;
  const sender = game.users.get(senderId);
  const m = game.messages.get(String(msg.messageId ?? ""));
  const c = m?.flags?.[SYS]?.contest;
  if (!sender || !m || !c || c.resolved || !CONTESTS[c.kind]) return;
  // Only the sender's own roll, for their own creature, against the target named on that roll.
  if (m.author?.id !== sender.id || String(msg.targetUuid) !== c.targetUuid) return;
  const attacker = await fromUuid(String(c.attackerUuid)).catch(() => null);
  const target = await fromUuid(String(c.targetUuid)).catch(() => null);
  if (!(attacker instanceof Actor) || !(target instanceof Actor) || attacker.pack || target.pack) return;
  if (!attacker.testUserPermission(sender, "OWNER") || ["party", "storage"].includes(target.type)) return;
  const tok = target.token ?? target.getActiveTokens?.(false, true)?.[0];
  if (!tok || tok.hidden) return;
  await resolveContest(m, target, attacker);
  await m.setFlag(SYS, "contest", { ...c, resolved: true }).catch(() => null);
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

/* -------------------------------------------- */
/*  Max HP lowered: current HP comes down too     */
/* -------------------------------------------- */

/**
 * Player feedback (23 Oct 2026): when a creature's maximum HP drops below its current HP (a level lost, a feature
 * removed, Debilitated, a drain), its current HP drops to the new maximum, and stays there when the maximum comes
 * back. One client writes it: the active GM, or with no GM on, whoever made the change.
 */
const HP_PENDING = new Set();
export function hpOverMax(actor) {
  const hp = actor?.system?.attributes?.hp;
  if (!hp) return null;
  const max = hp.effectiveMax ?? hp.max;
  return Number.isFinite(max) && Number.isFinite(hp.value) && hp.value > max ? max : null;
}
export function checkHpMax(actor, userId) {
  if (!actor || !["character", "npc"].includes(actor.type) || actor.pack) return;
  const gm = game.users?.activeGM;
  if (gm ? !gm.isSelf : userId !== game.user?.id) return;
  const key = actor.uuid;
  if (HP_PENDING.has(key)) return;
  HP_PENDING.add(key);
  // After the change has settled (an item and its effects arrive one after another).
  setTimeout(() => {
    HP_PENDING.delete(key);
    const max = hpOverMax(actor);
    if (max !== null) actor.update({ "system.attributes.hp.value": max }, { arneyanHpClamp: true }).catch(err => console.warn("Arneyan | HP to max", err));
  }, 100);
}
const ownerActor = doc => {
  let p = doc?.parent;
  while (p && p.documentName !== "Actor") p = p.parent;
  return p ?? null;
};

export function registerCombat() {
  Hooks.on("updateActor", (actor, changes, options, userId) => { if (!options?.arneyanHpClamp) checkHpMax(actor, userId); });
  for (const h of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(h, (doc, ...rest) => checkHpMax(ownerActor(doc), rest.at(-1)));
  }
  foundry.applications.handlebars.loadTemplates(["systems/arneyan/templates/actor/combat-tools.hbs"]);
  if (game.arneyan) game.arneyan.combat = { rollMorale, startContest, fightDefensively, unarmedStrike };
  game.settings.register(SYS, "positionalCombat", {
    name: "Flanking and crowding from token positions",
    hint: "Melee attacks get Advantage when an ally stands directly opposite the target; ranged attacks get Disadvantage with an enemy within 5ft or when shooting at a target next to an ally. The Flank Attack switch still works by hand.",
    scope: "world", config: true, type: Boolean, default: true
  });
  Hooks.on("getCombatantContextOptions", trackerOptions);
  // The fight is over: "per encounter" uses come back (the active GM does it, once).
  Hooks.on("deleteCombat", combat => { if (game.users.activeGM?.isSelf) resetEncounterUses(combat).catch(err => console.warn("Arneyan | encounter uses", err)); });
  Hooks.once("ready", () => game.socket.on(SOCKET, onSocket));
}

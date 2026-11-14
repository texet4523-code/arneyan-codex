/**
 * Solo creatures (books v0.10.40 to v0.10.43, K47 and K48; Monsters & Treasure, Building Encounters: Solo creatures,
 * Solos and control). There is no Legendary Resistance; instead:
 * - Two turns a round: a solo acts on its initiative and again 10 lower (or last in the round, if that would be below
 *   1). Added to a fight, it gets a second combatant for the same token (flags.arneyan.soloOf), whose initiative
 *   follows the first's. Each is one of its turns: numbered conditions tick and end-of-turn reminders and saves come
 *   up on both. Durations in rounds, and anything timed by the caster's turns, run as normal (F-R5).
 * - Shaking it off: an effect that stops it acting, attacking, moving or casting as it normally would (CONTROL, plus
 *   Feeblemind and Polymorph effects) ends once it has spent two of its turns under it, one turn the second time in a
 *   fight. Then nothing of the kind can affect it until the end of the following round. Kill, banish, imprison and
 *   spell Exhaustion are the GM's (the solo's description says so).
 * - Once a round: area, aura and ongoing damage and regeneration only at the start of its first turn (chat.mjs,
 *   auras.mjs, areas.mjs, qol.mjs check the second turn's flag). It ignores Exhaustion's Max HP loss (effects.mjs).
 * - Phases (M&T v0.10.75, R-B92; K141, K145, K158, K159; replaces Bloodied): three, with the block's HP in each (a
 *   Mythic creature's block already holds one phase's HP). At 0 HP the next phase starts at full HP, damage beyond 0 is
 *   lost, and every condition and hostile effect on it ends; at the first phase change only, its breath weapons and other
 *   limited-use abilities recover (never spells). One phase change a round: for the rest of that round damage can't take
 *   it below 1 HP, last phase included. At 0 HP in its third phase it dies.
 * Only a creature marked Solo can be run as one, and only when the GM ticks Run as solo (R-F33); the Mythic three always
 * are. Unticked, it is a normal creature of its Level: one turn, its HP once, none of the above.
 */
import { ARNEYAN } from "./config.mjs";
import { unset } from "./compat.mjs";
import { statusesOf } from "./effects.mjs";
import { combatFor, isCombatantOf } from "./fight.mjs";

const SYS = "arneyan";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const activeGM = () => {
  const gm = game.users.activeGM ?? game.users.find(u => u.isGM && u.active);
  return !!(gm?.isSelf ?? (gm?.id === game.user.id));
};

/** The conditions a solo shakes off (M&T v0.10.41): anything that stops it acting, attacking, moving or casting. */
export const CONTROL = ["incapacitated", "paralysed", "stunned", "unconscious", "charmed", "dominated", "confused", "petrified",
  "slowed", "restrained", "blinded", "frightened", "terrified"];
/** Effects shaken off the same way, by name (they carry no condition of their own). */
export const CONTROL_EFFECTS = { feeblemind: /^Feeblemind/i, polymorph: /^Polymorph/i };
const KEYS = [...CONTROL, ...Object.keys(CONTROL_EFFECTS)];

/** Marked Solo in Monsters & Treasure: it may be run as a solo. */
export const markedSolo = actor => actor?.type === "npc" && !!actor.system?.details?.isSolo;
/** Run as a solo now: marked, and the GM ticked Run as solo (the Mythic three always). Everything below checks this. */
export const isSolo = actor => markedSolo(actor) && (!!actor.system?.details?.runSolo || actor.system?.details?.levelText === "Mythic");
/** A solo's second-turn combatant (the first's id), or "". */
export const soloOf = c => String(c?.flags?.[SYS]?.soloOf ?? "");

/** The second turn's initiative: 10 lower, or last in the round if that would be below 1. */
export function secondInitiative(init, others = []) {
  const v = Number(init) - 10;
  if (v >= 1) return v;
  const low = others.filter(Number.isFinite);
  return Math.min(0, ...(low.length ? low.map(x => x - 1) : [0]));
}

/**
 * What a solo's turn ending does (pure, for tests): `counts` the turns each control effect has been on it, `on` the
 * control conditions and effect keys on it now, `turns` how many of its turns shake one off (2, or 1 the second time in
 * a fight). Returns the new counts (every key, so a flag update can't keep an old one) and what it shakes off now.
 */
export function shakeOff(counts = {}, on = [], turns = 2) {
  const next = noCounts(), off = [];
  for (const id of KEYS) {
    if (!on.includes(id)) continue;
    const n = (Number(counts[id]) || 0) + 1;
    if (n >= turns) off.push(id); else next[id] = n;
  }
  return { counts: next, off };
}
/** No counts: every key 0. */
export const noCounts = () => Object.fromEntries(KEYS.map(id => [id, 0]));

/** The control keys on a solo now: its conditions and its Feeblemind or Polymorph effects. */
export function controlOn(actor, { combat = null, form = false } = {}) {
  const fx = [...(actor.effects?.contents ?? actor.effects ?? [])].filter(e => !e.disabled);
  // A condition running out at this very turn change (a numbered one at 1 that ticks off, or its rounds reached)
  // ends by itself: that isn't shaking it off.
  const now = combat ? { round: Number(combat.round) || 0, turn: Number(combat.turn) || 0 } : null;
  const ending = e => {
    const v = Number(e.flags?.[SYS]?.value) || 0;
    if (v === 1) return true;
    const x = e.flags?.[SYS]?.expires;
    return !!(now && x && x.combat === combat.id && (now.round > x.round || (now.round === x.round && now.turn >= x.turn)));
  };
  const has = id => fx.some(e => (e.statuses?.has?.(id) || e.statuses?.includes?.(id)) && !ending(e));
  const st = statusesOf(actor);
  return [...CONTROL.filter(id => st.has(id) && (has(id) || !fx.some(e => e.statuses?.has?.(id) || e.statuses?.includes?.(id)))),
    ...Object.entries(CONTROL_EFFECTS).filter(([, re]) => fx.some(e => re.test(e.name ?? "") && !ending(e))).map(([k]) => k),
    // Turned into another creature (Polymorph, Change Shape: transform.mjs): the form is a creature of its own.
    ...(form ? ["polymorph"] : [])].filter((x, i, a) => a.indexOf(x) === i);
}

/**
 * Effects a solo's phase change ends: every condition put on it (Prone, a Stun, a spell's Paralysis), and every spell or
 * effect from a creature on the other side. Its own effects (its area, its aura, fighting defensively, hiding) and its
 * allies' stay, and so does concentration. `sideOf(origin)` says whose side an effect's source is on: "own", "ally",
 * "foe" or "" (unknown: counted hostile when it carries a condition, kept when it doesn't).
 */
export function phaseEnds(actor, sideOf = () => "") {
  const own = `${actor.uuid}.`;
  return [...(actor.effects?.contents ?? actor.effects ?? [])].filter(e => {
    if (e.flags?.[SYS]?.concentration || e.flags?.[SYS]?.shookOff) return false;
    if (e.flags?.[SYS]?.phase) return false;
    const st = [...(e.statuses ?? [])].filter(s => !["dead", "concentrating", "phase"].includes(s));
    if ([...(e.statuses ?? [])].includes("dead")) return false;
    const origin = String(e.origin ?? "");
    const side = origin && (origin === actor.uuid || origin.startsWith(own)) ? "own" : origin ? sideOf(origin) : "";
    if (side === "own") return st.some(s => ARNEYAN.conditions[s] && !/^hidden|^invisible$/.test(s));
    if (side === "ally") return false;
    if (side === "foe") return true;
    return st.some(s => ARNEYAN.conditions[s]);
  });
}

/** Whose side an effect's source is on, from its actor's token disposition against the solo's. */
function sideFinder(actor) {
  const dispo = a => a?.token?.disposition ?? a?.getActiveTokens?.()[0]?.document?.disposition ?? a?.prototypeToken?.disposition;
  const mine = dispo(actor);
  return origin => {
    let doc = null;
    try { doc = fromUuidSync(origin); } catch { doc = null; }
    const src = doc?.documentName === "Actor" ? doc : doc?.actor ?? doc?.parent;
    if (!src || src.documentName !== "Actor") return "";
    const d = dispo(src);
    return d === undefined || mine === undefined ? "" : d === mine ? "ally" : "foe";
  };
}

/** A card: to everyone, or only the GM while the creature's token is hidden. */
async function card(actor, html) {
  const hidden = actor.token?.hidden ?? actor.getActiveTokens?.()[0]?.document?.hidden;
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card">${html}</div>`,
    ...(hidden ? { whisper: game.users.filter(u => u.isGM).map(u => u.id) } : {}) });
}
const tryIt = async (what, fn) => { try { return await fn(); } catch (err) { console.warn(`Arneyan | solo ${what}`, err); return null; } };

/** One of a solo's turns has ended. */
async function turnEnded(actor, combat, { form = false } = {}) {
  // A dead or downed solo has nothing to shake off.
  if (statusesOf(actor).has("dead") || (Number(actor.system?.attributes?.hp?.value) || 0) <= 0) return;
  // The second time in a fight it shakes one off after one turn.
  const shakes = actor.getFlag(SYS, "soloShakes");
  const before = shakes?.combat === combat?.id ? Number(shakes.n) || 0 : 0;
  const { counts, off } = shakeOff(actor.getFlag(SYS, "soloControl") ?? {}, controlOn(actor, { combat, form }), before >= 1 ? 1 : 2);
  await tryIt("counts", () => actor.setFlag(SYS, "soloControl", counts));
  if (!off.length) return;
  const names = [];
  for (const id of off) {
    // A solo turned into another creature goes back to its own form.
    if (id === "polymorph" && form) {
      const { revertTransform } = await import("./transform.mjs");
      await tryIt("polymorph", () => revertTransform(actor));
      names.push("its new form");
      continue;
    }
    const re = CONTROL_EFFECTS[id];
    const carriers = actor.effects.filter(e => (re ? re.test(e.name ?? "") : (e.statuses?.has?.(id) || e.statuses?.includes?.(id)))).map(e => e.id);
    if (!carriers.length) continue;
    await tryIt("shake off", () => actor.deleteEmbeddedDocuments("ActiveEffect", carriers.filter(x => actor.effects.has(x))));
    names.push(ARNEYAN.conditions[id]?.name ?? (id === "feeblemind" ? "Feeblemind" : id === "polymorph" ? "Polymorph" : id));
  }
  if (!names.length) return;
  await tryIt("shakes", () => actor.setFlag(SYS, "soloShakes", { combat: combat?.id ?? "", n: before + 1 }));
  // Nothing of the kind affects it until the end of the following round: immune to every control condition until
  // the round after next starts (expireEffects), or the fight ends.
  const round = Number(combat?.previous?.round ?? combat?.round) || 0;
  const old = actor.effects.filter(e => e.flags?.[SYS]?.shookOff).map(e => e.id);
  if (old.length) await tryIt("immunity", () => actor.deleteEmbeddedDocuments("ActiveEffect", old.filter(x => actor.effects.has(x))));
  await tryIt("immunity", () => actor.createEmbeddedDocuments("ActiveEffect", [{
    name: "Shook it off", img: `systems/${SYS}/assets/conditions/${off.find(id => CONTROL.includes(id)) ?? "stunned"}.svg`, origin: actor.uuid,
    flags: { [SYS]: { shookOff: { ids: off }, encounter: combat?.id ?? "", ...(combat ? { expires: { combat: combat.id, round: round + 2, turn: 0 } } : {}),
      rules: CONTROL.map(id => ({ key: "immune", value: `condition:${id}`, when: "", label: "Shook it off" })) } }
  }]));
  await card(actor, `<header class="arn-card-title"><i class="fa-solid fa-person-rays"></i> <span>${esc(actor.name)} shakes off ${esc(names.join(", "))}</span></header>
    <p>A solo throws off what stops it acting after two of its turns${before >= 1 ? " (one, the second time in a fight)" : ""}. Nothing of the kind can affect it until the end of the following round${before >= 1 ? "" : "; the next one it shakes off after one of its turns"}.</p>`);
}

/* -------------------------------------------- */
/*  Phases                                      */
/* -------------------------------------------- */

/** Its phase now (1 to 3; 1 when it hasn't changed yet). */
export const phaseOf = actor => Math.min(3, Math.max(1, Number(actor?.flags?.[SYS]?.soloPhase?.n) || 1));

/** The round a phase change happens in: its started fight's id and round, or "" outside a fight (no once-a-round). */
function roundKey(actor) {
  const combat = combatFor(actor);
  return combat?.started ? `${combat.id}:${combat.round}` : "";
}

/**
 * The HP a damaging change leaves a solo with (pure, for tests). `hp` the new value, `max` its phase HP, `phase` its
 * phase now, `changedThisRound` whether it already changed phase this round. Returns { hp, next } where next is the
 * phase it enters (0 for none).
 */
export function phaseStep({ hp, max, phase = 1, changedThisRound = false }) {
  if (hp >= 1) return { hp, next: 0 };
  if (changedThisRound) return { hp: 1, next: 0 };
  if (phase >= 3) return { hp, next: 0 };
  return { hp: max, next: phase + 1 };
}

/**
 * Called from the actor's _preUpdate: a solo's HP change below 1 starts its next phase (full HP, excess lost), or holds
 * it at 1 for the rest of a round in which it already changed phase. Ticking Run as solo starts it at phase 1, full HP.
 * Writes the outcome into options.arneyanPhase for the update hook. Returns nothing.
 */
export function phasePreUpdate(actor, changes, options = {}) {
  if (!markedSolo(actor) || options.arneyanUndo) return;
  const run = foundry.utils.getProperty(changes, "system.details.runSolo");
  if (run !== undefined && !!run !== !!actor.system.details.runSolo) {
    foundry.utils.setProperty(changes, `flags.${SYS}.soloPhase`, { n: 1, key: "" });
    if (run) foundry.utils.setProperty(changes, "system.attributes.hp.value", Number(actor.system.attributes.hp.max) || 1);
    return;
  }
  if (!isSolo(actor)) return;
  const hp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
  if (hp === undefined || hp === null || Number(hp) >= Number(actor.system.attributes.hp.value)) return;
  const was = actor.flags?.[SYS]?.soloPhase ?? {};
  const key = roundKey(actor);
  const max = Number(foundry.utils.getProperty(changes, "system.attributes.hp.max") ?? actor.system.attributes.hp.max) || 1;
  const r = phaseStep({ hp: Number(hp), max, phase: phaseOf(actor), changedThisRound: !!key && was.key === key });
  foundry.utils.setProperty(changes, "system.attributes.hp.value", r.hp);
  if (!r.next) return;
  foundry.utils.setProperty(changes, `flags.${SYS}.soloPhase`, { n: r.next, key });
  options.arneyanPhase ??= {};
  options.arneyanPhase[actor.id] = r.next;
}

/** Its villain action for a phase it has just entered: the crowd control for phase 2, the ultimate for phase 3. */
const villainFor = (actor, n) => actor.items.find(i => villainNo(i) === n);

/** It has just entered phase n: what ends, what recovers, the marker and a card (once, if two updates race). */
const phasing = new Set();
export async function phaseStarted(actor, n) {
  const key = `${actor.uuid}:${n}`;
  if (phasing.has(key)) return;
  phasing.add(key);
  try { await phaseStartedNow(actor, n); } finally { setTimeout(() => phasing.delete(key), 2000); }
}
async function phaseStartedNow(actor, n) {
  const ends = phaseEnds(actor, sideFinder(actor));
  if (ends.length) await tryIt("phase", () => actor.deleteEmbeddedDocuments("ActiveEffect", ends.map(e => e.id).filter(id => actor.effects.has(id))));
  // Breath weapons and other limited abilities, at the first phase change only; no spells, innate or slotted (K159).
  const uses = n !== 2 ? [] : actor.items.filter(i => i.type !== "spell" && !villainNo(i) && ["day", "rest", "encounter"].includes(i.system?.uses?.per) && Number(i.system.uses.max) > 0 && i.system.uses.value < i.system.uses.max)
    .map(i => ({ _id: i.id, "system.uses.value": i.system.uses.max }));
  if (uses.length) await tryIt("phase", () => actor.updateEmbeddedDocuments("Item", uses));
  await tryIt("phase", () => actor.setFlag(SYS, "soloControl", noCounts()));
  // The marker on its token, so the table sees the phase.
  const old = actor.effects.filter(e => e.flags?.[SYS]?.phase).map(e => e.id);
  if (old.length) await tryIt("phase", () => actor.deleteEmbeddedDocuments("ActiveEffect", old.filter(id => actor.effects.has(id))));
  await tryIt("phase", () => actor.createEmbeddedDocuments("ActiveEffect", [{
    name: `Phase ${n} of 3`, img: `systems/${SYS}/assets/conditions/phase.svg`, statuses: ["phase"], origin: actor.uuid, flags: { [SYS]: { phase: n } }
  }]));
  const va = villainFor(actor, n);
  const max = Number(actor.system.attributes.hp.max) || 0;
  await card(actor, `<header class="arn-card-title"><i class="fa-solid fa-layer-group"></i> <span>${esc(actor.name)}: phase ${n} of 3</span></header>
    <p>At 0 HP its next phase starts at full HP (${max}); damage beyond 0 is lost. Every condition and hostile effect on it ends${ends.length ? ` (${esc(ends.map(e => e.name).join(", "))})` : ""}${n === 2 ? `, and its breath weapons and other limited-use abilities recover${uses.length ? ` (${esc(actor.items.filter(i => uses.some(u => u._id === i.id)).map(i => i.name).join(", "))})` : ""}; spells don't` : "; nothing recovers this time"}. For the rest of this round, damage can't take it below 1 HP.${n === 3 ? " At 0 HP in this phase, it dies." : ""}</p>
    ${va ? `<p><strong>Villain action:</strong> ${esc(va.name)}, straight after the turn that started this phase (use it from its sheet).</p>` : ""}`);
}

/** The marker as its phase now says (after an undo): "Phase N of 3", or none in phase 1. */
export async function phaseMarker(actor) {
  const n = phaseOf(actor);
  const old = actor.effects.filter(e => e.flags?.[SYS]?.phase);
  if (old.length === (n > 1 ? 1 : 0) && (n === 1 || Number(old[0].flags[SYS].phase) === n)) return;
  if (old.length) await tryIt("phase", () => actor.deleteEmbeddedDocuments("ActiveEffect", old.map(e => e.id).filter(id => actor.effects.has(id))));
  if (n > 1) await tryIt("phase", () => actor.createEmbeddedDocuments("ActiveEffect", [{
    name: `Phase ${n} of 3`, img: `systems/${SYS}/assets/conditions/phase.svg`, statuses: ["phase"], origin: actor.uuid, flags: { [SYS]: { phase: n } }
  }]));
}

/** Taken off Run as solo: the phase marker goes. */
async function phaseCleared(actor) {
  const old = actor.effects.filter(e => e.flags?.[SYS]?.phase).map(e => e.id);
  if (old.length) await tryIt("phase", () => actor.deleteEmbeddedDocuments("ActiveEffect", old.filter(id => actor.effects.has(id))));
}

/* -------------------------------------------- */
/*  Villain actions                             */
/* -------------------------------------------- */

/**
 * Villain actions (M&T v0.10.75, K145, K158): three, its type's or its own (opener, crowd control, ultimate), each once
 * a fight (its uses: per encounter). The opener straight after the first enemy turn, the crowd control straight after the
 * turn that starts phase 2, the ultimate after the one that starts phase 3, even if it has used one that round; never
 * while it can't act (it uses it as soon as it can). It skips its second turn in a round it uses one, if still to come.
 */
export const villainNo = item => Number(item?.flags?.[SYS]?.villainAction) || 0;
/** The conditions that stop it acting at all. */
export const CANT_ACT = ["incapacitated", "paralysed", "stunned", "unconscious", "petrified"];

/** Can it use a villain action now (pure, for tests)? `statuses` its conditions. No longer one a round (K158). */
export function villainBlock({ statuses = [] } = {}) {
  const cant = CANT_ACT.filter(id => statuses.includes(id));
  if (cant.length) return { reason: "cant", cant };
  return null;
}

/** The started fight a solo is in, and its first-turn combatant (fight.mjs's helpers: unlinked tokens too). */
function villainFight(actor) {
  const combat = combatFor(actor);
  if (!combat?.started) return { combat: null, first: null };
  const first = [...combat.combatants].find(c => !soloOf(c) && isCombatantOf(c, actor)) ?? null;
  return { combat: first ? combat : null, first };
}

/** Before a villain action: false (with a warning) when it can't use one now. */
export function villainGate(item) {
  const actor = item?.actor;
  if (!actor || !villainNo(item)) return true;
  if (!isSolo(actor)) {
    ui.notifications.warn(`${actor.name} isn't being run as a solo: a normal creature has no villain actions (tick Run as solo on its sheet).`);
    return false;
  }
  const b = villainBlock({ statuses: [...statusesOf(actor)] });
  if (!b) return true;
  ui.notifications.warn(`${actor.name} can't use a villain action while ${b.cant.map(id => ARNEYAN.conditions[id]?.name ?? id).join(", ")}: it uses it as soon as it can.`);
  return false;
}

/** Did it use a villain action in this round of this fight? (chat.mjs: a skipped turn ticks nothing down.) */
export function skippedFor(actor, combat, round) {
  const v = actor?.getFlag?.(SYS, "villainRound");
  return !!v && v.combat === combat?.id && Number(v.round) === Number(round);
}

/** Pass over a solo's second turn (once a turn, and only while it is still the turn: no double step). */
const passing = new Set();
async function passSecondTurn(combat, twin) {
  const key = `${combat.id}:${combat.round}:${twin.id}`;
  if (passing.has(key)) return;
  passing.add(key);
  if (passing.size > 500) passing.delete(passing.values().next().value);
  const round = combat.round;
  await card(twin.actor, `<header class="arn-card-title"><i class="fa-solid fa-forward"></i> <span>${esc(twin.actor.name)} skips its second turn</span></header><p>It used a villain action this round.</p>`);
  if (combat.combatant?.id === twin.id && combat.round === round) await tryIt("villain skip", () => combat.nextTurn());
}

/** After a villain action: note the round, and its second turn this round is skipped. */
export async function villainUsed(item) {
  const actor = item?.actor;
  if (!actor) return;
  const { combat, first } = villainFight(actor);
  if (!combat) {
    await card(actor, `<header class="arn-card-title"><i class="fa-solid fa-skull"></i> <span>${esc(actor.name)}: ${esc(item.name)}</span></header><p>Outside a started fight: nothing to skip in the tracker.</p>`);
    return;
  }
  await tryIt("villain", () => actor.setFlag(SYS, "villainRound", { combat: combat.id, round: combat.round }));
  const twin = [...combat.combatants].find(c => soloOf(c) === first.id);
  const at = (combat.turns ?? []).findIndex(t => t.id === twin?.id);
  const now = Number(combat.turn) || 0;
  const gone = twin && at >= 0 && at < now;
  const current = twin && at === now;
  await card(actor, `<header class="arn-card-title"><i class="fa-solid fa-skull"></i> <span>${esc(actor.name)}: ${esc(item.name)}</span></header>
    <p>${gone ? "Its second turn this round has already gone; the GM decides what it gives up." : "It skips its second turn this round (the tracker passes over it)."} Each once a fight; a phase change doesn't bring them back.</p>`);
  // Used at the start of its own second turn: that turn ends now.
  if (current && activeGM()) await passSecondTurn(combat, twin);
}

/** A second combatant for a solo's second turn. */
function addSecondTurn(c) {
  const combat = c.parent;
  if (combat.combatants.some(x => soloOf(x) === c.id)) return;
  combat.createEmbeddedDocuments("Combatant", [{
    tokenId: c.tokenId, sceneId: c.sceneId, actorId: c.actorId, hidden: c.hidden, name: `${c.name} (second turn)`,
    ...(Number.isFinite(c.initiative) ? { initiative: secondInitiative(c.initiative, combat.combatants.filter(x => x.id !== c.id).map(x => x.initiative)) } : {}),
    flags: { [SYS]: { soloOf: c.id } }
  }], { arneyanSolo: true }).catch(err => console.warn("Arneyan | solo second turn", err));
}

export function registerSolo() {
  // Added to a fight: a second combatant for its second turn.
  Hooks.on("createCombatant", (c, options) => {
    if (!activeGM() || soloOf(c) || options?.arneyanSolo || !isSolo(c.actor)) return;
    addSecondTurn(c);
  });
  // The second turn's initiative always follows the first's.
  Hooks.on("preUpdateCombatant", (c, changes, options) => {
    const by = soloOf(c);
    if (!by || !("initiative" in changes) || changes.initiative === null || options.arneyanSolo) return;
    const m = c.parent?.combatants?.get(by);
    if (Number.isFinite(m?.initiative)) changes.initiative = secondInitiative(m.initiative, c.parent.combatants.filter(x => x.id !== c.id && x.id !== m.id).map(x => x.initiative));
  });
  Hooks.on("updateCombatant", (c, changes) => {
    if (!activeGM() || soloOf(c)) return;
    const twin = c.parent.combatants.find(x => soloOf(x) === c.id);
    if (!twin) return;
    // Revealed or hidden with the first entry.
    if ("hidden" in changes && twin.hidden !== c.hidden) c.parent.updateEmbeddedDocuments("Combatant", [{ _id: twin.id, hidden: c.hidden }], { arneyanSolo: true }).catch(() => null);
    if (!("initiative" in changes)) return;
    if (!Number.isFinite(c.initiative)) {
      if (twin.initiative !== null) c.parent.updateEmbeddedDocuments("Combatant", [{ _id: twin.id, initiative: null }], { arneyanSolo: true }).catch(() => null);
      return;
    }
    const v = secondInitiative(c.initiative, c.parent.combatants.filter(x => x.id !== c.id && x.id !== twin.id).map(x => x.initiative));
    if (twin.initiative !== v) c.parent.updateEmbeddedDocuments("Combatant", [{ _id: twin.id, initiative: v }], { arneyanSolo: true }).catch(() => null);
  });
  Hooks.on("deleteCombatant", c => {
    if (!activeGM() || soloOf(c)) return;
    const twin = c.parent?.combatants?.find(x => soloOf(x) === c.id);
    if (twin) c.parent.deleteEmbeddedDocuments("Combatant", [twin.id]).catch(() => null);
  });
  // One of its turns ended (once: Foundry re-sends the turn when someone joins or rolls initiative).
  const done = new Set();
  Hooks.on("updateCombat", (combat, changed, options = {}) => {
    if (!activeGM() || options.direction === -1 || (!("turn" in changed) && !("round" in changed))) return;
    const prev = combat.combatants.get(combat.previous?.combatantId);
    if (!prev || prev.id === combat.combatant?.id || !prev.actor) return;
    // A solo, or a solo turned into another creature (its form keeps the original's uuid).
    const orig = prev.actor.flags?.[SYS]?.transform?.originalUuid;
    let form = false;
    if (!isSolo(prev.actor)) {
      try { form = !!orig && isSolo(fromUuidSync(orig)); } catch { form = false; }
      if (!form) return;
    }
    const key = `${combat.id}:${combat.previous?.round}:${combat.previous?.turn}:${prev.id}`;
    if (done.has(key)) return;
    done.add(key);
    if (done.size > 500) done.delete(done.values().next().value);
    // A second turn skipped for a villain action wasn't a turn: nothing to shake off.
    if (soloOf(prev) && skippedFor(prev.actor, combat, combat.previous?.round)) return;
    turnEnded(prev.actor, combat, { form }).catch(err => console.warn("Arneyan | solo turn", err));
  });
  // Its second turn comes up in a round it used a villain action: pass over it. Stepping back onto it lets the GM
  // play it (the skip can come round again when the tracker moves on to it).
  Hooks.on("updateCombat", (combat, changed, options = {}) => {
    if (!activeGM() || (!("turn" in changed) && !("round" in changed))) return;
    const cur = combat.combatant;
    if (options.direction === -1) {
      for (const k of [...passing]) if (k.startsWith(`${combat.id}:${combat.round}:`)) passing.delete(k);
      return;
    }
    if (!cur || !soloOf(cur) || !cur.actor || !skippedFor(cur.actor, combat, combat.round)) return;
    passSecondTurn(combat, cur).catch(err => console.warn("Arneyan | villain skip", err));
  });
  // A fight's end: its turn counts start again next time.
  Hooks.on("deleteCombat", combat => {
    if (!activeGM()) return;
    for (const c of combat.combatants ?? []) if (soloOf(c) && c.actor) c.actor.update({ [`flags.${SYS}.soloControl`]: noCounts(), ...unset(`flags.${SYS}.soloShakes`) }).catch(() => null);
    // A new fight starts in phase 1 (the marker goes; its HP is the GM's to set).
    for (const c of combat.combatants ?? []) {
      const a = c.actor;
      if (soloOf(c) || !a || !markedSolo(a) || phaseOf(a) === 1) continue;
      a.update({ [`flags.${SYS}.soloPhase`]: { n: 1, key: "" } }).then(() => phaseCleared(a)).catch(() => null);
    }
  });
  // A phase change (phasePreUpdate wrote it into the update's options): what ends, what recovers, the card.
  Hooks.on("updateActor", (actor, changes, options) => {
    if (!activeGM()) return;
    const n = options?.arneyanPhase?.[actor.id];
    if (n) phaseStarted(actor, n).catch(err => console.warn("Arneyan | phase", err));
    // Run as solo ticked or unticked mid-fight: its second turn joins or leaves the tracker.
    if (!foundry.utils.hasProperty(changes, "system.details.runSolo")) return;
    if (!actor.system.details.runSolo) phaseCleared(actor).catch(() => null);
    for (const combat of game.combats ?? []) {
      for (const c of [...combat.combatants].filter(x => !soloOf(x) && isCombatantOf(x, actor))) {
        const twin = combat.combatants.find(x => soloOf(x) === c.id);
        if (isSolo(actor) && !twin) addSecondTurn(c);
        else if (!isSolo(actor) && twin) combat.deleteEmbeddedDocuments("Combatant", [twin.id]).catch(() => null);
      }
    }
  });
}

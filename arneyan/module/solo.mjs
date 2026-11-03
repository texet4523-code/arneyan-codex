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
 * - Bloodied: the first time it drops to half its HP or lower, every condition and hostile effect on it ends and its
 *   limited-use abilities recover (not spell slots). Once, until it is back to full HP.
 */
import { ARNEYAN } from "./config.mjs";
import { statusesOf } from "./effects.mjs";

const SYS = "arneyan";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const activeGM = () => {
  const gm = game.users.activeGM ?? game.users.find(u => u.isGM && u.active);
  return !!(gm?.isSelf ?? (gm?.id === game.user.id));
};

/** The conditions a solo shakes off (M&T v0.10.41): anything that stops it acting, attacking, moving or casting. */
export const CONTROL = ["incapacitated", "paralysed", "stunned", "unconscious", "charmed", "dominated", "confused", "petrified",
  "slowed", "restrained", "blinded", "frightened"];
/** Effects shaken off the same way, by name (they carry no condition of their own). */
export const CONTROL_EFFECTS = { feeblemind: /^Feeblemind/i, polymorph: /^Polymorph/i };
const KEYS = [...CONTROL, ...Object.keys(CONTROL_EFFECTS)];

export const isSolo = actor => actor?.type === "npc" && !!actor.system?.details?.isSolo;
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
 * Effects a solo's Bloodied ends: every condition put on it (Prone, a Stun, a spell's Paralysis), and every spell or
 * effect from a creature on the other side. Its own effects (its area, its aura, fighting defensively, hiding) and its
 * allies' stay, and so does concentration. `sideOf(origin)` says whose side an effect's source is on: "own", "ally",
 * "foe" or "" (unknown: counted hostile when it carries a condition, kept when it doesn't).
 */
export function bloodiedEnds(actor, sideOf = () => "") {
  const own = `${actor.uuid}.`;
  return [...(actor.effects?.contents ?? actor.effects ?? [])].filter(e => {
    if (e.flags?.[SYS]?.concentration || e.flags?.[SYS]?.shookOff) return false;
    const st = [...(e.statuses ?? [])].filter(s => !["dead", "concentrating"].includes(s));
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

/** Bloodied: the first time it drops to half its HP or lower. */
const bleeding = new Set();
export async function bloodied(actor) {
  // Two HP updates before the flag is back: once.
  if (bleeding.has(actor.uuid)) return;
  bleeding.add(actor.uuid);
  try {
    await actor.setFlag(SYS, "bloodied", true);
    await bloodiedNow(actor);
  } finally {
    bleeding.delete(actor.uuid);
  }
}
async function bloodiedNow(actor) {
  const ends = bloodiedEnds(actor, sideFinder(actor));
  if (ends.length) await tryIt("bloodied", () => actor.deleteEmbeddedDocuments("ActiveEffect", ends.map(e => e.id).filter(id => actor.effects.has(id))));
  const uses = actor.items.filter(i => ["day", "rest", "encounter"].includes(i.system?.uses?.per) && Number(i.system.uses.max) > 0 && i.system.uses.value < i.system.uses.max)
    .map(i => ({ _id: i.id, "system.uses.value": i.system.uses.max }));
  if (uses.length) await tryIt("bloodied", () => actor.updateEmbeddedDocuments("Item", uses));
  await tryIt("bloodied", () => actor.setFlag(SYS, "soloControl", noCounts()));
  await card(actor, `<header class="arn-card-title"><i class="fa-solid fa-droplet"></i> <span>${esc(actor.name)} is Bloodied</span></header>
    <p>At half its HP, every condition and hostile effect on it ends${ends.length ? ` (${esc(ends.map(e => e.name).join(", "))})` : ""}, and its limited-use abilities recover${uses.length ? ` (${esc(actor.items.filter(i => uses.some(u => u._id === i.id)).map(i => i.name).join(", "))})` : ""}; spell slots don't. A good moment for a new phase.</p>`);
}

export function registerSolo() {
  // Added to a fight: a second combatant for its second turn.
  Hooks.on("createCombatant", (c, options) => {
    if (!activeGM() || soloOf(c) || options?.arneyanSolo || !isSolo(c.actor)) return;
    const combat = c.parent;
    if (combat.combatants.some(x => soloOf(x) === c.id)) return;
    combat.createEmbeddedDocuments("Combatant", [{
      tokenId: c.tokenId, sceneId: c.sceneId, actorId: c.actorId, hidden: c.hidden, name: `${c.name} (second turn)`,
      ...(Number.isFinite(c.initiative) ? { initiative: secondInitiative(c.initiative, combat.combatants.filter(x => x.id !== c.id).map(x => x.initiative)) } : {}),
      flags: { [SYS]: { soloOf: c.id } }
    }], { arneyanSolo: true }).catch(err => console.warn("Arneyan | solo second turn", err));
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
    turnEnded(prev.actor, combat, { form }).catch(err => console.warn("Arneyan | solo turn", err));
  });
  // A fight's end: its turn counts start again next time.
  Hooks.on("deleteCombat", combat => {
    if (!activeGM()) return;
    for (const c of combat.combatants ?? []) if (soloOf(c) && c.actor) c.actor.update({ [`flags.${SYS}.soloControl`]: noCounts(), [`flags.${SYS}.-=soloShakes`]: null }).catch(() => null);
  });
  // Bloodied, once until it's back to full HP.
  Hooks.on("updateActor", (actor, changes) => {
    if (!activeGM() || !isSolo(actor) || !foundry.utils.hasProperty(changes, "system.attributes.hp.value")) return;
    const hp = actor.system.attributes.hp;
    const max = Number(hp.max) || 0;
    if (max && hp.value >= max && actor.getFlag(SYS, "bloodied")) { actor.unsetFlag(SYS, "bloodied").catch(() => null); return; }
    if (max && hp.value > 0 && hp.value <= max / 2 && !actor.getFlag(SYS, "bloodied")) bloodied(actor).catch(err => console.warn("Arneyan | bloodied", err));
  });
}

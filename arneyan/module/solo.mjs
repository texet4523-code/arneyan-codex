/**
 * Solo creatures (books v0.10.40, K47; Monsters & Treasure, Building Encounters: Solo creatures, Solos and control).
 * Legendary Resistance is gone; instead:
 * - Two turns a round: a solo acts on its initiative and again 10 lower (or last in the round, if that would be below
 *   1). Added to a fight, it gets a second combatant for the same token (flags.arneyan.soloOf), whose initiative
 *   follows the first's. Each is one of its turns: numbered conditions tick, end-of-turn reminders come up on both,
 *   and timed effects on it count down twice a round (each round its second turn ends, they move a round closer).
 * - Shaking it off: a condition that takes it out of the fight (Incapacitated, Paralysed, Stunned, Unconscious,
 *   Charmed, Dominated, Confused, and Petrified) ends once it has spent two of its turns under it; then the same
 *   condition can't affect it until the end of its next turn. Kill, banish and imprison effects are the GM's (a
 *   reminder on the card).
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

/** The conditions a solo shakes off after two of its turns. */
export const CONTROL = ["incapacitated", "paralysed", "stunned", "unconscious", "charmed", "dominated", "confused", "petrified"];

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
 * What a solo's turn ending does (pure, for tests): `counts` the turns each control condition has been on it, `on`
 * the statuses on it now. Returns the new counts and the conditions it shakes off now.
 */
export function shakeOff(counts = {}, on = []) {
  const next = {}, off = [];
  for (const id of CONTROL) {
    if (!on.includes(id)) continue;
    const n = (Number(counts[id]) || 0) + 1;
    if (n >= 2) off.push(id); else next[id] = n;
  }
  return { counts: next, off };
}

/** Effects a solo's Bloodied ends: conditions and anything another creature put on it (not its own, not concentration). */
export function bloodiedEnds(actor) {
  const own = `${actor.uuid}.`;
  return [...(actor.effects?.contents ?? actor.effects ?? [])].filter(e => {
    if (e.flags?.[SYS]?.concentration) return false;
    const st = [...(e.statuses ?? [])];
    if (st.includes("dead") || st.includes("concentrating")) return false;
    const mine = String(e.origin ?? "").startsWith(own) || e.origin === actor.uuid;
    return !mine || st.some(s => ARNEYAN.conditions[s] && !/^hidden/.test(s));
  });
}

async function card(actor, html) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card">${html}</div>` });
}

/** One of a solo's turns has ended. */
async function turnEnded(actor, combat, { second = false } = {}) {
  // The immunity from shaking something off lasts until the end of its next turn.
  const imm = actor.effects.filter(e => e.flags?.[SYS]?.shookOff);
  const drop = imm.filter(e => (Number(e.flags[SYS].shookOff.turns) || 0) <= 1).map(e => e.id);
  const keep = imm.filter(e => !drop.includes(e.id)).map(e => ({ _id: e.id, [`flags.${SYS}.shookOff.turns`]: Number(e.flags[SYS].shookOff.turns) - 1 }));
  if (drop.length) await actor.deleteEmbeddedDocuments("ActiveEffect", drop);
  if (keep.length) await actor.updateEmbeddedDocuments("ActiveEffect", keep);
  // Shaking it off: two of its turns under a condition that takes it out of the fight.
  const { counts, off } = shakeOff(actor.getFlag(SYS, "soloControl") ?? {}, [...statusesOf(actor)]);
  for (const id of off) {
    const carriers = actor.effects.filter(e => e.statuses?.has?.(id) || e.statuses?.includes?.(id)).map(e => e.id);
    if (carriers.length) await actor.deleteEmbeddedDocuments("ActiveEffect", carriers);
    const name = ARNEYAN.conditions[id]?.name ?? id;
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: `Shook off ${name}`, img: `systems/${SYS}/assets/conditions/${id}.svg`, origin: actor.uuid,
      flags: { [SYS]: { shookOff: { id, turns: 1 }, rules: [{ key: "immune", value: `condition:${id}`, when: "", label: `Shook off ${name}` }] } }
    }]);
    await card(actor, `<header class="arn-card-title"><i class="fa-solid fa-person-rays"></i> <span>${esc(actor.name)} shakes off ${esc(name)}</span></header>
      <p>A solo throws off a condition that takes it out of the fight after two of its turns. It can't be ${esc(name)} again until the end of its next turn.</p>`);
  }
  await actor.setFlag(SYS, "soloControl", counts);
  // Its second turn of the round: timed effects on it come a round closer, so each of its turns counts.
  if (second && combat) {
    const ups = actor.effects.filter(e => e.flags?.[SYS]?.expires?.combat === combat.id && !e.flags?.[SYS]?.shookOff)
      .map(e => ({ _id: e.id, [`flags.${SYS}.expires.round`]: Number(e.flags[SYS].expires.round) - 1 }));
    if (ups.length) await actor.updateEmbeddedDocuments("ActiveEffect", ups);
  }
}

/** Bloodied: the first time it drops to half its HP or lower. */
export async function bloodied(actor) {
  await actor.setFlag(SYS, "bloodied", true);
  const ends = bloodiedEnds(actor);
  if (ends.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ends.map(e => e.id).filter(id => actor.effects.has(id)));
  const uses = actor.items.filter(i => ["day", "rest", "encounter"].includes(i.system?.uses?.per) && Number(i.system.uses.max) > 0 && i.system.uses.value < i.system.uses.max)
    .map(i => ({ _id: i.id, "system.uses.value": i.system.uses.max }));
  if (uses.length) await actor.updateEmbeddedDocuments("Item", uses);
  await actor.setFlag(SYS, "soloControl", {});
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
    if (!activeGM() || soloOf(c) || !("initiative" in changes) || !Number.isFinite(c.initiative)) return;
    const twin = c.parent.combatants.find(x => soloOf(x) === c.id);
    if (!twin) return;
    const v = secondInitiative(c.initiative, c.parent.combatants.filter(x => x.id !== c.id && x.id !== twin.id).map(x => x.initiative));
    if (twin.initiative !== v) c.parent.updateEmbeddedDocuments("Combatant", [{ _id: twin.id, initiative: v }], { arneyanSolo: true }).catch(() => null);
  });
  Hooks.on("deleteCombatant", c => {
    if (!activeGM() || soloOf(c)) return;
    const twin = c.parent?.combatants?.find(x => soloOf(x) === c.id);
    if (twin) c.parent.deleteEmbeddedDocuments("Combatant", [twin.id]).catch(() => null);
  });
  // One of its turns ended.
  Hooks.on("updateCombat", (combat, changed, options = {}) => {
    if (!activeGM() || options.direction === -1 || (!("turn" in changed) && !("round" in changed))) return;
    const prev = combat.combatants.get(combat.previous?.combatantId);
    if (!prev || prev.id === combat.combatant?.id || !isSolo(prev.actor)) return;
    turnEnded(prev.actor, combat, { second: !!soloOf(prev) }).catch(err => console.warn("Arneyan | solo turn", err));
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

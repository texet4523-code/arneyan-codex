/**
 * Turn checks (R-F50, K213 and K221: what Foundry can take off the player). Foundry sees token movement and attacks
 * each turn, so the attack card says when a feature that hangs on them applies, instead of the player remembering:
 *   Running Shot      moved 10ft this turn before the bow attack (any distance from 10th, Never Still)
 *   Dead Eye          has not moved this turn (Gunslinger)
 *   Dead Aim          neither moved nor attacked on its last turn (first shot this turn)
 *   Duel's Rhythm     exactly one enemy within reach
 *   Exploit           flanked, in melee with an ally and not with you, Restrained, Prone, or can't see you (Rogue)
 *   Sneak Attack      can't see you, hasn't acted yet this encounter, or your Studied target (Assassin)
 * and at the end of a raging Barbarian's turn with no attack made and no damage taken since its last turn ended, a
 * card asks whether the rage ends (a button, never by itself). What the map suggests stays the players' call: the
 * card's Advantage button applies it (Kieran, 8 Nov).
 *
 * The log lives on the combat (flags.arneyan.turnLog), written by the active GM: a tick that counts turns, and per
 * combatant the tick its turn started and ended, feet moved on its turn, the tick of its last attack and of the last
 * damage it took, and what it did on its last turn. Every client also keeps its own copy of this turn's moves and
 * attacks, so a card rolled straight after moving already knows.
 */
import { combatFor, isCombatantOf } from "./fight.mjs";
import { statusesOf, weaponMatches } from "./effects.mjs";
import { feetBetween, rangeOf } from "./qol.mjs";

const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isActiveGM = () => !!globalThis.game?.users?.activeGM?.isSelf;

/* -------------------------------------------- */
/*  The log (pure)                              */
/* -------------------------------------------- */

/** An empty log. */
export const emptyLog = () => ({ tick: 0, cur: null, log: {} });

/** One combatant's entry, filled in. */
export const entryOf = (log, cid) => ({ start: -1, end: null, prevEnd: null, moved: 0, attackT: -1, hurtT: -1, last: null, acted: false, ...(log?.log?.[cid] ?? {}) });

/**
 * A new turn starts: the one that ended records what it did; the new one starts counting. `moved` is what the map
 * measured for the one that ended (feet). `again`: the same combatant's next turn (a new round with it alone).
 * Returns { log, ended } with `ended` the finished entry (or null).
 */
export function startTurn(log, nextCid, { moved = null, again = false } = {}) {
  const out = { tick: (log?.tick ?? 0) + 1, cur: nextCid ?? null, log: { ...(log?.log ?? {}) } };
  let ended = null;
  const prev = log?.cur;
  const fresh = prev !== nextCid || again;
  if (prev && fresh) {
    const e = entryOf(log, prev);
    const feet = Math.max(Number(e.moved) || 0, Number(moved) || 0);
    ended = { ...e, moved: feet, last: { moved: feet, attacked: e.attackT >= e.start && e.start >= 0 }, prevEnd: e.end, end: out.tick };
    out.log[prev] = ended;
  }
  if (nextCid && fresh) out.log[nextCid] = { ...entryOf(log, nextCid), start: out.tick, moved: 0, acted: true };
  return { log: out, ended };
}

/** An attack made (on its turn or out of turn). */
export function noteAttack(log, cid) {
  if (!cid) return log;
  return { ...log, log: { ...log.log, [cid]: { ...entryOf(log, cid), attackT: log.tick ?? 0 } } };
}

/** Damage taken. */
export function noteHurt(log, cid) {
  if (!cid) return log;
  return { ...log, log: { ...log.log, [cid]: { ...entryOf(log, cid), hurtT: log.tick ?? 0 } } };
}

/** Feet moved on its own turn. */
export function noteMove(log, cid, feet) {
  if (!cid || log?.cur !== cid || !(feet > 0)) return log;
  const e = entryOf(log, cid);
  return { ...log, log: { ...log.log, [cid]: { ...e, moved: (Number(e.moved) || 0) + feet } } };
}

/**
 * Rage (Barbarian): it ends at the end of your turn if you have neither attacked nor taken damage since your last
 * turn ended. `entry` is the combatant's entry as its turn ends (its `prevEnd` is when the turn before ended; none:
 * since the fight began). True when the rage should end.
 */
export function rageIdle(entry) {
  if (!entry) return false;
  const since = Number.isFinite(entry.prevEnd) ? entry.prevEnd : 0;
  return !(entry.attackT >= since && entry.attackT >= 0) && !(entry.hurtT >= since && entry.hurtT >= 0);
}

/* -------------------------------------------- */
/*  Reading it                                  */
/* -------------------------------------------- */

const local = new Map();          // `${combatId}.${cid}` -> { start, moved, attacked } for this client
const localKey = (combat, cid) => `${combat?.id}.${cid}`;

const logOf = combat => foundry.utils.deepClone(combat?.getFlag?.(SYS, "turnLog") ?? emptyLog());

/** The creature's combatant in its running encounter, with the encounter. */
export function combatantOf(actor) {
  const combat = combatFor(actor);
  if (!combat?.started) return { combat: null, combatant: null };
  const combatant = Array.from(combat.combatants ?? []).find(c => isCombatantOf(c, actor)) ?? null;
  return { combat, combatant };
}

/**
 * What the creature has done this turn and last turn: { mine (its turn now), moved (feet this turn), attacked (this
 * turn), last ({ moved, attacked } or null), entry }. Null outside a started encounter.
 */
export function turnInfo(actor) {
  const { combat, combatant } = combatantOf(actor);
  if (!combat || !combatant) return null;
  const log = logOf(combat);
  const e = entryOf(log, combatant.id);
  const mine = combat.combatant?.id === combatant.id;
  const here = local.get(localKey(combat, combatant.id));
  const fresh = here && here.round === combat.round && here.turn === combat.turn;
  const moved = mine ? Math.max(log.cur === combatant.id ? Number(e.moved) || 0 : 0, fresh ? here.moved : 0) : 0;
  const attacked = mine && ((log.cur === combatant.id && e.attackT >= e.start && e.start >= 0) || !!(fresh && here.attacked));
  return { combat, combatant, mine, moved, attacked, last: e.last ?? null, entry: e };
}

/** Has the creature had a turn yet this encounter? (Its turn now counts.) */
export function hasActed(actor) {
  const { combat, combatant } = combatantOf(actor);
  if (!combat || !combatant) return true;
  const e = entryOf(logOf(combat), combatant.id);
  if (e.acted) return true;
  // No log (an encounter begun before this version): its place in the order says.
  if ((combat.round ?? 0) > 1) return true;
  const idx = combat.turns.findIndex(c => c.id === combatant.id);
  return idx >= 0 && idx <= (combat.turn ?? 0);
}

/* -------------------------------------------- */
/*  On the attack card                          */
/* -------------------------------------------- */

const tokenOf = actor => actor?.token?.object ?? actor?.getActiveTokens?.()?.[0] ?? null;
const has = (actor, name) => [...(actor?.items ?? [])].some(i => ["ability", "feat"].includes(i.type) && i.name === name);
const levelIn = (actor, cls) => Number([...(actor?.items ?? [])].find(i => i.type === "class" && i.name.startsWith(cls))?.system?.levels) || 0;
const rect = tok => {
  const d = tok.document ?? tok;
  const gs = d.parent?.grid?.size ?? globalThis.canvas?.scene?.grid?.size ?? 100;
  return { x: d.x, y: d.y, w: (d.width ?? 1) * gs, h: (d.height ?? 1) * gs };
};
const living = () => (globalThis.canvas?.tokens?.placeables ?? []).filter(t => t.actor && !["party", "storage"].includes(t.actor.type) && !t.document.hidden
  && !statusesOf(t.actor).has("dead") && !t.actor.system?.noAct);
const hostile = (a, b) => (a.document?.disposition ?? 0) * (b.document?.disposition ?? 0) === -1;

/** Melee reach: 5ft, a Reach weapon's 10ft, +5ft for Large or bigger. */
export function reachFeet(actor, item = null) {
  const ws = [...(actor?.items ?? [])].filter(i => i.type === "weapon" && !i.system.ranged && (actor.type === "npc" || i.system.equipped));
  const own = item && !item.system?.ranged ? rangeOf(item).reach || 5 : 5;
  const big = ["large", "huge", "gargantuan"].includes(actor?.system?.details?.size) ? 5 : 0;
  return Math.max(own, ...ws.map(w => rangeOf(w).reach || 5)) + big;
}

/** Can the target see the attacker? No when the target is Blinded, or the attacker Invisible or hidden. */
export function cannotSee(target, attacker) {
  const t = statusesOf(target), a = statusesOf(attacker);
  if (t.has("blinded") || t.has("unconscious") || t.has("petrified")) return "it can't see you";
  if (a.has("invisible")) return "you are Invisible";
  if ([...a].some(s => /^hid(den|e)/.test(s))) return "you are hidden from it";
  return "";
}

/** An effect a creature's own feature put on the target (Studied, Marked Prey, Challenged). */
export function markedBy(target, attacker, name) {
  if (!target || !attacker?.uuid) return false;
  return [...(target.effects?.contents ?? target.effects ?? [])].some(e => !e.disabled && e.name === name && String(e.origin ?? "").startsWith(`${attacker.uuid}.`));
}

/**
 * Exploit's and Sneak Attack's conditions as the map and the tracker see them (the reasons that hold, or []).
 * `flankedBy` is the first ally standing directly opposite the attacker... or any two of the attacker's allies.
 */
export function openings(actor, target, { me, them, allies = [], opposite = () => false, ranged = false, assassin = false } = {}) {
  const why = [];
  const st = statusesOf(target);
  const blind = cannotSee(target, actor);
  if (blind) why.push(blind);
  if (assassin) {
    if (!hasActed(target)) why.push("it hasn't acted yet this encounter");
    if (markedBy(target, actor, "Studied")) why.push("it is your Studied target");
    return why;
  }
  if (st.has("restrained")) why.push("it is Restrained");
  if (st.has("prone")) why.push("it is Prone");
  if (me && them) {
    const near = allies.filter(o => feetBetween(o.document, them.document) <= reachFeet(o.actor));
    const mine = feetBetween(me.document, them.document) <= reachFeet(actor);
    // With you: only when you are in melee with it yourself; or two of your allies on opposite sides.
    const flank = (mine ? near.find(o => opposite(rect(me), rect(o), rect(them))) : null)
      ?? near.flatMap((o, i) => near.slice(i + 1).map(p => [o, p])).find(([o, p]) => opposite(rect(o), rect(p), rect(them)));
    if (flank) why.push(`it is flanked${Array.isArray(flank) ? "" : ` (with ${flank.name})`}`);
    const ally = allies.find(o => feetBetween(o.document, them.document) <= 5);
    if (ally && !mine) why.push(`it is in melee with ${ally.name} and not with you`);
  }
  return why;
}

/**
 * What the turn and the map say about this attack: { maybe: [[dir, why]], notes: [] }. `maybe` goes on the card as
 * "Advantage if it applies" (the card's button applies it); notes are plain lines.
 */
export async function turnHints(actor, item, targets, { opposite = () => false } = {}) {
  const out = { maybe: [], notes: [] };
  if (actor?.type !== "character" || item?.type !== "weapon") return out;
  const ranged = !!item.system?.ranged;
  const info = turnInfo(actor);
  const me = tokenOf(actor);
  const scene = !!(me && globalThis.canvas?.scene);
  const t = targets.length === 1 ? targets[0] : null;
  const them = t?.token?.object ?? t?.token ?? null;

  // Running Shot (Archer): moved 10ft this turn before the first bow attack (from 10th, Never Still: any distance).
  if (has(actor, "Running Shot") && info?.mine && weaponMatches({ weapon: "bow" }, item)) {
    const need = has(actor, "Never Still") ? 1 : 10;
    if (info.attacked) out.notes.push("Running Shot: only your first bow attack each turn; you have already attacked this turn, so if that was a bow attack it doesn't apply.");
    else if (info.moved >= need) out.maybe.push([1, `Running Shot (you moved ${info.moved}ft this turn)`]);
    else out.notes.push(`Running Shot: no Advantage yet: you have moved ${info.moved}ft this turn${need > 1 ? ", and it needs 10ft" : ""}.`);
  }
  // Dead Eye and Dead Aim (Gunslinger): ranged attacks on your own turn.
  if (ranged && info?.mine) {
    if (has(actor, "Dead Eye")) {
      out.notes.push(info.moved > 0 ? `Dead Eye: no benefit: you have moved ${info.moved}ft this turn.`
        : info.attacked ? "Dead Eye: you haven't moved; it explodes only your first ranged attack this turn, so if you have made one it doesn't apply here; you stay rooted until the end of your turn."
          : "Dead Eye applies: you haven't moved this turn, so this attack's damage dice explode on their two highest numbers. You can't move again this turn.");
      if (has(actor, "Steady Shot") && info.moved === 0) out.notes.push("Steady Shot: Dead Eye applies, so the first hit this round adds +1d6.");
    }
    if (has(actor, "Dead Aim") && !info.attacked) {
      const last = info.last;
      if (!last) out.notes.push("Dead Aim: no last turn on record in this encounter, so it's your call.");
      else if (!last.moved && !last.attacked) out.maybe.push([1, "Dead Aim (you neither moved nor attacked last turn; its extra damage die too)"]);
      else out.notes.push(`Dead Aim doesn't apply: last turn you ${[last.moved ? "moved" : "", last.attacked ? "attacked" : ""].filter(Boolean).join(" and ")}.`);
    }
  }
  if (!scene) return out;
  const allies = living().filter(o => o.id !== me.id && o.id !== them?.id && o.document.disposition === me.document.disposition && o.document.disposition !== 0);
  // Duel's Rhythm (Swashbuckler): exactly one enemy within your reach.
  if (has(actor, "Duel's Rhythm")) {
    const reach = reachFeet(actor, item);
    const foes = living().filter(o => o.id !== me.id && hostile(o, me) && feetBetween(me.document, o.document) <= reach);
    if (foes.length === 1 && (!them || foes[0].id === them.id)) out.notes.push(`Duel's Rhythm applies: ${foes[0].name} is the only enemy within your reach. After this attack you may move 10ft without provoking it, and you have Advantage on saves against it.`);
    else if (foes.length > 1) out.notes.push(`Duel's Rhythm is off: ${foes.length} enemies within your reach.`);
  }
  if (!them || !t?.actor) return out;
  const within30 = feetBetween(me.document, them.document) <= 30;
  // Exploit (Rogue) and Sneak Attack (Assassin): once per round, within 30ft.
  for (const [name, assassin] of [["Exploit", false], ["Sneak Attack", true]]) {
    if (!has(actor, name)) continue;
    const why = openings(actor, t.actor, { me, them, allies, opposite, ranged, assassin });
    if (!why.length) continue;
    if (!within30) out.notes.push(`${name}: ${why.join(", ")}, but it is more than 30ft away.`);
    else out.maybe.push([1, `${name} (${why.join(", ")}; once per round; its extra dice are in the rider row under a hit)`]);
  }
  return out;
}

/* -------------------------------------------- */
/*  Writing the log (the active GM)             */
/* -------------------------------------------- */

const queue = new Map();
function writeLog(combat, change) {
  if (!combat?.id || !isActiveGM()) return Promise.resolve();
  const prev = queue.get(combat.id) ?? Promise.resolve();
  const next = prev.then(async () => {
    if (!game.combats?.get?.(combat.id)) return;
    const log = logOf(combat);
    const out = await change(log);
    if (out && out !== log) await combat.setFlag(SYS, "turnLog", out);
  }).catch(err => console.warn("Arneyan | turn log", err));
  queue.set(combat.id, next);
  return next;
}

/** The combatants of a creature, across running encounters. */
const combatantsFor = actor => (game.combats?.contents ?? []).filter(c => c.started).flatMap(c => Array.from(c.combatants).filter(x => isCombatantOf(x, actor)).map(x => [c, x]));

function remember(combat, cid, f) {
  const k = localKey(combat, cid);
  const cur = local.get(k);
  const fresh = cur && cur.round === combat.round && cur.turn === combat.turn ? cur : { round: combat.round, turn: combat.turn, moved: 0, attacked: false };
  local.set(k, f(fresh));
}

/** A raging creature that has neither attacked nor taken damage since its last turn ended: ask whether its rage ends. */
async function askRage(combat, combatant, entry) {
  const actor = combatant?.actor;
  const rage = [...(actor?.items ?? [])].find(i => i.system?.toggle && i.system.active && /^rage$/i.test(i.name));
  if (!rage || !rageIdle(entry)) return;
  const owners = game.users.filter(u => !u.isGM && actor.testUserPermission?.(u, "OWNER")).map(u => u.id);
  const gms = game.users.filter(u => u.isGM).map(u => u.id);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: [...new Set([...owners, ...gms])],
    flags: { [SYS]: { kind: "rageIdle", actorUuid: actor.uuid, itemId: rage.id } },
    content: `<div class="arn-card arn-turn-prompt"><header class="arn-card-title"><i class="fa-solid fa-fire"></i> <span>${esc(actor.name)}: Rage</span></header>
      <p>Since the end of your last turn you have neither attacked nor taken damage, so your rage ends now (Rage).</p>
      <button type="button" class="arn-rage-end" data-actor-uuid="${actor.uuid}" data-item-id="${rage.id}"><i class="fa-solid fa-fire-extinguisher"></i> End the rage</button></div>`
  });
}

/** Feet a token moved in one movement, leaving out displacement and teleports (Displace, Blink and the like). */
export function movementFeet(movement) {
  const pts = movement?.passed?.waypoints ?? [];
  const jump = a => a === "displace" || !!globalThis.CONFIG?.Token?.movement?.actions?.[a]?.teleport;
  if (pts.length && pts.every(w => jump(w.action))) return 0;
  return Math.max(0, Number(movement?.passed?.distance) || 0);
}

export function registerTurns() {
  // A turn ends and another starts.
  Hooks.on("updateCombat", (combat, changed) => {
    if (!("turn" in changed || "round" in changed) || !combat.started) return;
    const next = combat.combatant?.id ?? null;
    writeLog(combat, async log => {
      const again = log.cur === next && "round" in changed;
      if (log.cur === next && !again) return log;
      const { log: out, ended } = startTurn(log, next, { again });
      if (ended) await askRage(combat, combat.combatants.get(log.cur), ended).catch(err => console.warn("Arneyan | rage", err));
      return out;
    });
  });
  // Moves on the creature's own turn.
  Hooks.on("moveToken", (doc, movement) => {
    const feet = movementFeet(movement);
    if (!feet) return;
    for (const combat of (game.combats?.contents ?? []).filter(c => c.started && c.combatant?.tokenId === doc.id)) {
      const cid = combat.combatant.id;
      remember(combat, cid, x => ({ ...x, moved: x.moved + feet }));
      writeLog(combat, log => noteMove(log, cid, feet));
    }
  });
  // Attacks, wherever they come from (an attack card).
  Hooks.on("createChatMessage", message => {
    const f = message.flags?.[SYS];
    if (f?.kind !== "attack") return;
    let actor = null;
    try { actor = f.actorUuid ? fromUuidSync(f.actorUuid) : ChatMessage.getSpeakerActor(message.speaker); } catch { actor = null; }
    for (const [combat, c] of combatantsFor(actor)) {
      if (combat.combatant?.id === c.id) remember(combat, c.id, x => ({ ...x, attacked: true }));
      writeLog(combat, log => noteAttack(log, c.id));
    }
  });
  // Damage taken (HP or temporary HP down).
  Hooks.on("updateActor", (actor, changed, options) => {
    if (!isActiveGM() || !hurtBy(actor, changed, options)) return;
    for (const [combat, c] of combatantsFor(actor)) writeLog(combat, log => noteHurt(log, c.id));
  });
}

/** HP lost in this update (the actor's _preUpdate keeps what it had), or 0. */
export function hurtBy(actor, changed, options) {
  const hp = foundry.utils.getProperty(changed, "system.attributes.hp.value");
  const temp = foundry.utils.getProperty(changed, "system.attributes.hp.temp");
  const was = Number(options?.arneyanPrevHp?.[actor.id]), wasT = Number(options?.arneyanPrevTemp?.[actor.id]) || 0;
  let lost = 0;
  if (hp !== undefined && Number.isFinite(was) && Number(hp) < was) lost += was - Number(hp);
  if (temp !== undefined && Number(temp) < wasT) lost += wasT - Number(temp);
  return lost;
}

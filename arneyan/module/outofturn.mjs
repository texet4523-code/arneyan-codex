/**
 * Out-of-turn prompts (R-F50, K213 and K221). When a character is hit, missed, hurt or charged, or an enemy moves
 * through its reach, a card goes privately to its player with a button for each thing it could use right now:
 * Parry, Riposte, Uncanny Dodge, Misdirect, Deflect, Bone Shield, Heaven's Answer, Hold Ground, Brace and Fire, Knight's
 * Riposte, Primeval Will, Scapegoat and the rest below. Nothing fires by itself: the button uses the feature as its own
 * sheet button would (its use spent, its roll made). It only takes away the remembering.
 *
 * The active GM's client sees each event once and posts the cards. A world setting turns them off.
 */
import { feetBetween } from "./qol.mjs";
import { statusesOf } from "./effects.mjs";
import { outcomeFor } from "./rolls.mjs";
import { reachFeet, markedBy, movementFeet } from "./turns.mjs";

const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * What can be used, and when. `item` is the feature's name on the sheet; `act` the option on it (none: the feature
 * itself). `on`: hit (an attack hit), miss (an attack missed), attack (an attack, hit or not), hurt (damage taken),
 * half (damage takes it to half its HP or less), down (to 0 HP), belowHalf (below half its HP), leave (an enemy leaves
 * its reach), endNear (an enemy ends its move within its reach), moveNear (an enemy within its reach moves), charge
 * (an enemy runs at it and ends beside it). `who`: self, ally (another creature on its side), either. `range` in feet
 * for an ally ("reach": its own reach; "aura": a Paladin's). `need`: an extra test (below).
 */
export const PROMPTS = [
  { item: "Flourish Manoeuvres", act: "Parry", on: "hit", who: "self", melee: true, text: "Parry: a Dexterity check against the attack roll; meet or beat it and the hit is negated." },
  { item: "Flourish Manoeuvres", act: "Riposte", on: "miss", who: "self", melee: true, need: "inReach", text: "Riposte: one melee attack against it." },
  { item: "Uncanny Dodge", act: "Uncanny Dodge", on: "hit", who: "self", text: "Halve the damage (an attacker you can see)." },
  { item: "Glamour", act: "Misdirect", on: "hit", who: "self", need: "glamour", text: "Misdirect (1 Glamour): it makes a Will save; on a failure the hit lands on a double and misses." },
  { item: "Glamour", act: "Misdirect", on: "hit", who: "ally", range: 30, level: ["Illusionist", 5], need: "glamour", text: "Misdirect (1 Glamour, an ally within 30ft): it makes a Will save; on a failure the hit lands on a double and misses." },
  { item: "Deflect (Dexterity)", act: "Deflect", on: "hit", who: "self", need: "deflect", text: "Deflect: a Dexterity check against the attack roll; on a success it does no damage." },
  { item: "Parrying Stance", act: "Parrying Stance", on: "hit", who: "self", melee: true, text: "Add your Wisdom modifier to your AC against this attack (unarmed and unarmoured)." },
  { item: "Bone Shield", on: "hit", who: "self", need: "undeadNear", text: "One of your undead within 5ft takes the hit instead." },
  { item: "Shield Brother", on: "hit", who: "ally", range: 5, text: "You take the hit instead (an ally beside you)." },
  { item: "Scapegoat", on: "hit", who: "either", range: 60, need: "hexed", text: "Pass the damage to a creature under your Hex: it makes a Will save, and on a failure takes it instead." },
  { item: "Knight's Riposte", on: "attack", who: "ally", range: "reach", need: "challenger", text: "Your Challenged foe attacked an ally within your reach: one melee attack against it." },
  { item: "Channel Divinity (Charisma)", act: "Heaven's Answer: halve damage", on: "hurt", who: "self", text: "Heaven's Answer (2 uses): halve this damage, and all you take until the start of your next turn." },
  { item: "Path, Patron and Pact", act: "Hellfire Rebuke", on: "hurt", who: "self", text: "Hellfire Rebuke: if a creature damaged you, it takes fire damage, no save." },
  { item: "Primeval Will", act: "Primeval Will", on: "half", who: "self", text: "Temporary HP equal to twice your Barbarian level until the encounter ends." },
  { item: "Lay on Hands", act: "Mercy's Reach", on: "down", who: "ally", range: "aura", text: "Mercy's Reach: spend Lay on Hands points on it at once, with no touch, and end one condition on it." },
  { item: "Guardian's Reach", on: "belowHalf", who: "ally", range: "reach", text: "Move up to half your speed to stand beside it, without provoking; attacks against it have Disadvantage until the start of your next turn." },
  { item: "Combat Reflexes", act: "Attack of Opportunity", orItem: true, on: "leave", who: "self", text: "Attack of Opportunity: one melee attack (it left your reach; moving past or through it counts too, and Disengage prevents it)." },
  { item: "Run Them Down", on: "leave", who: "self", need: "raging", text: "Move up to half your speed after it; if you end beside it, attack it once." },
  { item: "Hold Ground", on: "endNear", who: "self", text: "Move 5ft without provoking; its first attack before your next turn has Disadvantage if you're now next to an ally." },
  { item: "Hold the Line", on: "moveNear", who: "self", text: "It makes a Reflex save against your Class Save DC or its movement ends." },
  { item: "Brace and Fire", on: "charge", who: "self", text: "If it charged you: one ranged attack against it before it reaches you (Dead Eye applies)." }
];

/* -------------------------------------------- */
/*  Who could use what                          */
/* -------------------------------------------- */

const features = actor => [...(actor?.items ?? [])].filter(i => ["ability", "feat"].includes(i.type));
const levelIn = (actor, cls) => Number([...(actor?.items ?? [])].find(i => i.type === "class" && i.name.startsWith(cls))?.system?.levels) || 0;

/** The Paladin's aura: 10ft, 30ft from 15th, 50ft from 20th (Auras). */
export const auraFeet = level => (level >= 20 ? 50 : level >= 15 ? 30 : 10);

/**
 * The options a creature has for one event. `ev`: { on, self (it's the one hit, hurt or moved past), feet (from it to
 * the creature it happened to), melee, ranged, magical }; `tests`: the extra tests by name (functions of the actor).
 * Returns [{ item, act, text }], the item and activity found on its sheet; nothing for an option it doesn't have or
 * can't afford right now (a pool out of points).
 */
export function optionsFor(actor, ev, tests = {}) {
  const out = [];
  for (const p of PROMPTS) {
    if (p.on !== ev.on) continue;
    if (p.who === "self" && !ev.self) continue;
    if (p.who === "ally" && ev.self) continue;
    if (p.melee && !ev.melee) continue;
    if (p.level && levelIn(actor, p.level[0]) < p.level[1]) continue;
    if (!ev.self && p.range !== undefined) {
      const range = p.range === "reach" ? reachFeet(actor) : p.range === "aura" ? auraFeet(levelIn(actor, "Paladin")) : p.range;
      if (!(ev.feet <= range)) continue;
    }
    const item = features(actor).find(i => i.name === p.item);
    if (!item) continue;
    let act = null;
    if (p.act) {
      act = (item.availableActivities ?? item.system?.activities ?? []).find(a => a.name === p.act) ?? null;
      // The Fighter's Combat Reflexes (a class feature with no option of its own) is used as itself.
      if (!act && !(p.orItem && !(item.system?.activities ?? []).length)) continue;
    }
    if (p.need && tests[p.need] && !tests[p.need](actor, ev, item)) continue;
    // A cost the item can't pay now (Glamour, Channel): left out.
    const cost = act ? Number(act.cost ?? 1) : 0;
    const count = item.usesCount;
    if (cost > 0 && count && count.value < cost) continue;
    if (!act && item.system?.uses?.max > 0 && count && count.value < 1) continue;
    out.push({ item, act, text: p.text, key: `${p.item}|${p.act ?? ""}` });
  }
  // One button per option (Misdirect for yourself and for an ally is one option).
  return out.filter((o, i) => out.findIndex(x => x.key === o.key) === i);
}

/* -------------------------------------------- */
/*  The card                                    */
/* -------------------------------------------- */

/** The players who own the character and are here; else the GMs. */
function readers(actor) {
  const own = game.users.filter(u => u.active && !u.isGM && actor.testUserPermission?.(u, "OWNER")).map(u => u.id);
  return own.length ? own : game.users.filter(u => u.isGM).map(u => u.id);
}

export function promptHtml(actor, what, options) {
  const rows = options.map(o => `<div class="arn-oot-row"><button type="button" class="arn-oot-use" data-actor-uuid="${esc(actor.uuid)}" data-item-id="${esc(o.item.id)}" data-act="${esc(o.act?.name ?? "")}">`
    + `<i class="fa-solid fa-bolt"></i> ${esc(o.act?.name ?? o.item.name)}</button> <span class="arn-tiny">${esc(o.text)}</span></div>`).join("");
  return `<div class="arn-card arn-oot"><header class="arn-card-title"><i class="fa-solid fa-hand"></i> <span>${esc(actor.name)}: out of turn?</span></header>
    <p>${esc(what)}</p>${rows}<p class="arn-card-meta">Only if you want it, and only one out-of-turn use a round unless a feature says otherwise.</p></div>`;
}

async function post(actor, what, options) {
  if (!options.length) return null;
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: readers(actor), flags: { [SYS]: { kind: "outOfTurn" } }, content: promptHtml(actor, what, options) });
}

/* -------------------------------------------- */
/*  The tests                                   */
/* -------------------------------------------- */

const tokenOf = actor => actor?.token?.object ?? actor?.getActiveTokens?.()?.[0] ?? null;
const sceneTokens = () => (globalThis.canvas?.tokens?.placeables ?? []).filter(t => t.actor && !t.document.hidden);

export const TESTS = {
  inReach: (actor, ev) => ev.attackerFeet === undefined || ev.attackerFeet <= reachFeet(actor),
  glamour: (actor, ev, item) => !item.usesCount || item.usesCount.value >= 1,
  // Deflect: a missile (a nonmagical one until 10th); from 5th a melee attack too.
  deflect: (actor, ev) => (ev.melee ? levelIn(actor, "Monk") >= 5 : !ev.magical || levelIn(actor, "Monk") >= 10),
  undeadNear: actor => {
    const me = tokenOf(actor);
    if (!me) return true;
    return sceneTokens().some(t => t.actor?.flags?.[SYS]?.companion?.master === actor.id && t.actor.flags[SYS].companion.preset === "raisedUndead" && feetBetween(me.document, t.document) <= 5);
  },
  // A creature under your Hex somewhere on the map.
  hexed: actor => sceneTokens().some(t => [...(t.actor.effects ?? [])].some(e => !e.disabled && /hex/i.test(e.name ?? "") && String(e.origin ?? "").startsWith(`${actor.uuid}.`))),
  challenger: (actor, ev) => !!ev.attacker && markedBy(ev.attacker, actor, "Challenged"),
  raging: actor => features(actor).some(i => i.system?.toggle && i.system.active && /^rage$/i.test(i.name))
};

/* -------------------------------------------- */
/*  Events                                      */
/* -------------------------------------------- */

const enabled = () => { try { return game.settings.get(SYS, "outOfTurnPrompts") !== false; } catch { return true; } };
const isActiveGM = () => !!globalThis.game?.users?.activeGM?.isSelf;
const pcs = () => sceneTokens().filter(t => t.actor.type === "character" && !statusesOf(t.actor).has("dead") && !t.actor.system?.noAct);
const sameSide = (a, b) => (a.document?.disposition ?? 0) === (b.document?.disposition ?? 0) && (a.document?.disposition ?? 0) !== 0;
const foes = (a, b) => (a.document?.disposition ?? 0) * (b.document?.disposition ?? 0) === -1;

/**
 * An attack card: whom it hit and missed, and who could answer. Run again when the roll changes (the card's Advantage
 * button, Luck): only a target whose hit or miss changed is asked again, and each outcome once (flags.arneyan.oot).
 */
export async function onAttack(message) {
  const f = message.flags?.[SYS];
  if (f?.kind !== "attack" || !enabled() || !isActiveGM() || !globalThis.canvas?.scene) return 0;
  const done = { ...(f.oot ?? {}) };
  let attacker = null;
  try { attacker = f.actorUuid ? fromUuidSync(f.actorUuid) : ChatMessage.getSpeakerActor(message.speaker); } catch { attacker = null; }
  const from = tokenOf(attacker);
  let posted = 0;
  const total = (Number(f.total) || 0) + (Number(f.luckBurned) || 0);
  for (const t of f.targets ?? []) {
    let target = null;
    try { target = fromUuidSync(t.uuid); } catch { target = null; }
    const tt = tokenOf(target);
    if (!target || !tt || (from && !foes(from, tt))) continue;
    const o = outcomeFor(total, f.natural, t.ac, "attack");
    const hit = !["failure", "nat1"].includes(o);
    const was = done[t.uuid];
    if (was === (hit ? "hit" : "miss")) continue;
    done[t.uuid] = hit ? "hit" : "miss";
    const base = { melee: !!f.melee, ranged: !f.melee, magical: !!f.magical, attacker, attackerFeet: from ? feetBetween(from.document, tt.document) : undefined };
    // "attack" (hit or miss) only the first time.
    const ons = [hit ? "hit" : "miss", ...(was ? [] : ["attack"])];
    // The one attacked.
    if (target.type === "character") {
      const options = ons.flatMap(on => optionsFor(target, { ...base, on, self: true }, TESTS));
      if (options.length) { await post(target, `${attacker?.name ?? "An attack"} ${hit ? "hit" : "missed"} you${t.ac ? ` (${total} against AC ${t.ac})` : ""}.`, options); posted++; }
    }
    // Its allies nearby.
    for (const pc of pcs().filter(p => p.id !== tt.id && sameSide(p, tt))) {
      const feet = feetBetween(pc.document, tt.document);
      const options = ons.flatMap(on => optionsFor(pc.actor, { ...base, on, self: false, feet }, TESTS));
      if (options.length) { await post(pc.actor, `${attacker?.name ?? "An attack"} ${hit ? "hit" : "missed"} ${target.name} (${feet}ft from you).`, options); posted++; }
    }
  }
  if (JSON.stringify(done) !== JSON.stringify(f.oot ?? {})) await message.update({ [`flags.${SYS}.oot`]: done }).catch(() => null);
  return posted;
}

/** Damage taken: the hurt one's own answers, and its allies' (to half, below half, down). */
export async function onHurt(actor, { before, after, max }) {
  if (!enabled() || !isActiveGM() || !(after < before)) return 0;
  const me = tokenOf(actor);
  let posted = 0;
  const half = (Number(max) || 0) / 2;
  // Primeval Will: "to half your HP or less"; Guardian's Reach: "below half HP".
  const ons = (self) => [self ? "hurt" : null, self && before > half && after <= half ? "half" : null, !self && before >= half && after < half ? "belowHalf" : null, !self && before > 0 && after <= 0 ? "down" : null].filter(Boolean);
  if (actor.type === "character") {
    const options = ons(true).flatMap(on => optionsFor(actor, { on, self: true }, TESTS));
    if (options.length) { await post(actor, `You took ${before - after} damage (${after} HP left).`, options); posted++; }
  }
  if (!me || !globalThis.canvas?.scene) return posted;
  for (const pc of pcs().filter(p => p.id !== me.id && sameSide(p, me))) {
    const feet = feetBetween(pc.document, me.document);
    const options = ons(false).flatMap(on => optionsFor(pc.actor, { on, self: false, feet }, TESTS));
    if (options.length) { await post(pc.actor, `${actor.name} ${after <= 0 ? "drops to 0 HP" : "drops below half its HP"} (${feet}ft from you).`, options); posted++; }
  }
  return posted;
}

/** A token's space at a position (for distances before and after a move). */
const at = (doc, pos) => ({ x: pos?.x ?? doc.x, y: pos?.y ?? doc.y, width: pos?.width ?? doc.width, height: pos?.height ?? doc.height, parent: doc.parent });

/** Each (mover, character, trigger) once a turn: keyboard moves come a square at a time. */
const asked = new Set();
export const askOnce = (combat, moverId, pcId, on) => {
  const k = `${combat?.id}.${combat?.round}.${combat?.turn}|${moverId}|${pcId}|${on}`;
  if (asked.has(k)) return false;
  if (asked.size > 500) asked.clear();
  asked.add(k);
  return true;
};

/** An enemy moved: whose reach it left, entered or crossed, and who it ran at. */
export async function onMove(doc, movement) {
  if (!enabled() || !isActiveGM() || !globalThis.canvas?.scene || doc.parent?.id !== canvas.scene.id) return 0;
  const passed = movement?.passed;
  const feetMoved = Number(passed?.distance) || 0;
  if (!(movementFeet(movement) > 0)) return 0;
  const mover = doc.object;
  const combat = (game.combats?.contents ?? []).find(c => c.started && c.combatants.some(x => x.tokenId === doc.id));
  if (!mover?.actor || !combat) return 0;
  const start = at(doc, movement.origin), end = at(doc, movement.destination);
  const ended = !(movement.pending?.waypoints?.length);
  let posted = 0;
  for (const pc of pcs().filter(p => foes(p, mover))) {
    const reach = reachFeet(pc.actor);
    const a = feetBetween(pc.document, start), b = feetBetween(pc.document, end);
    const ons = [];
    if (a <= reach && b > reach) ons.push("leave");
    if (ended && b <= reach) ons.push("endNear");
    if (a <= reach) ons.push("moveNear");
    if (ended && feetMoved >= 10 && a > 5 && b <= 5) ons.push("charge");
    const options = ons.filter(on => askOnce(combat, doc.id, pc.id, on)).flatMap(on => optionsFor(pc.actor, { on, self: true }, TESTS));
    if (!options.length) continue;
    const what = ons.includes("leave") ? "left your reach" : ons.includes("charge") ? "ran at you" : ons.includes("endNear") ? "ended its move within your reach" : "moved within your reach";
    await post(pc.actor, `${mover.name} ${what}.`, options);
    posted++;
  }
  return posted;
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

export function registerOutOfTurn() {
  game.settings.register(SYS, "outOfTurnPrompts", {
    name: "Out-of-turn prompts",
    hint: "When a character is hit, missed or hurt, or an enemy leaves, enters or charges into its reach, its player gets a private card with a button for each feature it could use right now (Parry, Riposte, Uncanny Dodge, Misdirect, Deflect, an Attack of Opportunity and the like). Nothing is used by itself.",
    scope: "world", config: true, type: Boolean, default: true
  });
  Hooks.on("createChatMessage", message => { onAttack(message).catch(err => console.warn("Arneyan | out of turn", err)); });
  // The roll changed after it was made (the card's Advantage button, Luck): a miss can become a hit.
  Hooks.on("updateChatMessage", (message, changed) => {
    const f = changed?.flags?.[SYS];
    if (!f || !["natural", "total", "luckBurned"].some(k => k in f)) return;
    onAttack(message).catch(err => console.warn("Arneyan | out of turn", err));
  });
  Hooks.on("updateActor", (actor, changed, options) => {
    const hp = foundry.utils.getProperty(changed, "system.attributes.hp.value");
    const was = Number(options?.arneyanPrevHp?.[actor.id]);
    if (hp === undefined || !Number.isFinite(was)) return;
    onHurt(actor, { before: was, after: Number(hp), max: actor.system?.attributes?.hp?.max }).catch(err => console.warn("Arneyan | out of turn", err));
  });
  Hooks.on("moveToken", (doc, movement) => { onMove(doc, movement).catch(err => console.warn("Arneyan | out of turn", err)); });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    html.querySelectorAll?.(".arn-oot-use").forEach(btn => btn.addEventListener("click", async ev => {
      ev.preventDefault();
      const actor = await fromUuid(btn.dataset.actorUuid).catch(() => null);
      const item = actor?.items?.get(btn.dataset.itemId);
      if (!item) return ui.notifications.warn("That feature is no longer on the sheet.");
      if (!actor.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner can use it.`);
      const act = btn.dataset.act ? (item.availableActivities ?? []).find(a => a.name === btn.dataset.act) : null;
      if (btn.dataset.act && !act) return ui.notifications.warn(`${item.name}: ${btn.dataset.act} isn't available.`);
      btn.disabled = true;
      try { return act ? await item._useActivity(act, ev) : await item.use(ev); } finally { btn.disabled = false; }
    }));
  });
}

/**
 * Auras: effects that radiate from a token. The GM's client keeps them up to date.
 *
 * - Sources: items with system.auras (a Paladin's Divine Protection, a Balor's Fire Aura), and active effects
 *   carrying flags.arneyan.aura (Spirit Guardians once cast).
 * - Rules: a creature inside gets an effect with the aura's rules while it's inside (Aura of Courage: Advantage on saves
 *   vs fear), and loses it when it leaves.
 * - Turns: a creature that starts its turn inside gets a card with the aura's save, damage and condition buttons.
 * - A faint ring shows each aura's reach on the map.
 *
 * Distance is counted in squares between the nearest squares of the two tokens (5ft to the next square, diagonals
 * included), so a 10ft aura reaches two squares out from the creature's edge.
 */
import { ARNEYAN } from "./config.mjs";
import { toggleCondition } from "./effects.mjs";
import { tagDamage } from "./dsn.mjs";

const SYS = "arneyan";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const isGM = () => !!game.users?.activeGM?.isSelf;

/* -------------------------------------------- */
/*  Working out auras                           */
/* -------------------------------------------- */

/**
 * A radius (or duration) for a level: a number, steps by level ([[1, 10], [15, 30], [20, 50]]: 10ft, 30ft from
 * 15th, 50ft from 20th), or a plain formula with @cl (class or caster level) and @level.
 */
export function evalRadius(value, cl = 1) {
  if (typeof value === "number") return value;
  if (Array.isArray(value)) {
    let r = 0;
    for (const [lvl, ft] of value) if ((Number(cl) || 1) >= lvl) r = Number(ft) || 0;
    return r;
  }
  const s = String(value ?? "").replace(/@cl\b|@level\b/g, String(Number(cl) || 1));
  try { return Number(Roll.safeEval(s)) || 0; } catch { return Number(s) || 0; }
}

/** The level an item's aura scales with: its class's level, else the creature's. */
function levelFor(actor, item) {
  const cls = item?.system?.className ? actor.items.find(i => i.type === "class" && i.name.replace(/\s*\(.*$/, "") === String(item.system.className).replace(/\s*\(.*$/, "")) : null;
  return cls?.system?.levels ?? actor.system?.level ?? 1;
}

/** Is this item's aura switched on (gear worn, a switch on)? */
function itemOn(item) {
  const s = item.system ?? {};
  if (["weapon", "armour", "equipment"].includes(item.type) && !s.equipped) return false;
  if (s.toggle && !s.active) return false;
  return true;
}

/** Every aura an actor gives off right now: [{ def, radius, source, key }]. */
export function aurasOf(actor) {
  if (!actor) return [];
  const out = [];
  for (const item of actor.items ?? []) {
    if (item.type === "spell") continue; // a spell's aura only once it's cast (as an effect)
    const defs = item.system?.auras ?? [];
    if (!defs.length || !itemOn(item)) continue;
    const lvl = levelFor(actor, item);
    defs.forEach((def, i) => {
      if (def.minLevel && lvl < def.minLevel) return;
      out.push({ def, radius: evalRadius(def.radius, lvl), source: item.name, key: `${item.id}:${def.key ?? i}`, cl: lvl });
    });
  }
  for (const e of actor.effects ?? []) {
    const defs = e.flags?.[SYS]?.aura;
    if (e.disabled || !Array.isArray(defs)) continue;
    const cl = e.flags[SYS].cl ?? 1;
    defs.forEach((def, i) => out.push({ def, radius: evalRadius(def.radius, cl), source: e.name, key: `fx-${e.id}:${def.key ?? i}`, dc: e.flags[SYS].dc ?? 0, cl }));
  }
  return out.filter(a => a.radius > 0);
}

/** The squares a token covers. */
function squares(t, size) {
  const x0 = Math.round(t.x / size), y0 = Math.round(t.y / size);
  const w = Math.max(1, Math.round(t.width ?? 1)), h = Math.max(1, Math.round(t.height ?? 1));
  const out = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push([x0 + i, y0 + j]);
  return out;
}

/** Feet between two tokens: squares between their nearest squares (diagonals count as one), times the grid distance. */
export function gapFeet(a, b, size, distance) {
  const A = squares(a, size), B = squares(b, size);
  let best = Infinity;
  for (const [ax, ay] of A) for (const [bx, by] of B) best = Math.min(best, Math.max(Math.abs(ax - bx), Math.abs(ay - by)));
  return best * distance;
}

/** Does an aura from `src` (a token) reach and touch `tgt`? */
export function inAura(aura, src, tgt, size, distance) {
  if (src.id === tgt.id) return !!aura.def.includeSelf;
  const who = aura.def.who ?? "all";
  const D = CONST.TOKEN_DISPOSITIONS ?? { FRIENDLY: 1, NEUTRAL: 0, HOSTILE: -1 };
  if (who === "allies" && tgt.disposition !== src.disposition) return false;
  if (who === "enemies") {
    const pair = new Set([src.disposition, tgt.disposition]);
    if (!(pair.has(D.FRIENDLY) && pair.has(D.HOSTILE))) return false;
  }
  return gapFeet(src, tgt, size, distance) <= aura.radius;
}

/* -------------------------------------------- */
/*  Keeping effects in step (GM)                */
/* -------------------------------------------- */

const tokensOf = scene => scene.tokens.contents.filter(t => t.actor && ["character", "npc"].includes(t.actor.type));

/** Aura effects on creatures that aren't on the GM's scene any more (a token deleted, moved scene, the GM changed scene). */
async function sweepElsewhere(scene) {
  const here = new Set(scene.tokens.contents.filter(t => t.actorLink).map(t => t.actorId));
  for (const actor of game.actors) {
    if (here.has(actor.id)) continue;
    const gone = actor.effects.filter(e => e.flags?.[SYS]?.auraKey).map(e => e.id);
    if (gone.length) await actor.deleteEmbeddedDocuments("ActiveEffect", gone, { arneyanAura: true }).catch(() => null);
  }
  for (const other of game.scenes) {
    if (other.id === scene.id) continue;
    for (const t of other.tokens) {
      if (t.actorLink || !t.actor) continue;
      const gone = t.actor.effects.filter(e => e.flags?.[SYS]?.auraKey).map(e => e.id);
      if (gone.length) await t.actor.deleteEmbeddedDocuments("ActiveEffect", gone, { arneyanAura: true }).catch(() => null);
    }
  }
}

let busy = false, again = false, sweepNext = false;
async function refreshScene() {
  const scene = canvas?.scene;
  if (!scene || !isGM()) return;
  if (busy) { again = true; return; }
  busy = true;
  try {
    const size = scene.grid.size, distance = scene.grid.distance || 5;
    const tokens = tokensOf(scene);
    // What every creature should have: key -> { name, rules, img }.
    const want = new Map(tokens.map(t => [t.id, new Map()]));
    for (const src of tokens) {
      for (const aura of aurasOf(src.actor)) {
        if (!aura.def.rules?.length) continue;
        for (const tgt of tokens) {
          if (!inAura(aura, src, tgt, size, distance)) continue;
          want.get(tgt.id).set(`${src.id}:${aura.key}`, { name: `${aura.def.name} (${src.name})`, rules: aura.def.rules, img: src.actor.img, cl: aura.cl ?? 1 });
        }
      }
    }
    for (const t of tokens) {
      const actor = t.actor;
      const have = actor.effects.filter(e => e.flags?.[SYS]?.auraKey);
      const need = want.get(t.id);
      const gone = have.filter(e => !need.has(e.flags[SYS].auraKey)).map(e => e.id);
      const has = new Set(have.map(e => e.flags[SYS].auraKey));
      const add = [...need].filter(([k]) => !has.has(k)).map(([k, v]) => ({
        name: v.name, img: v.img || "icons/svg/aura.svg", transfer: false,
        flags: { [SYS]: { auraKey: k, cl: v.cl, rules: v.rules.map(r => ({ ...r, value: String(r.value) })), sourceName: v.name } }
      }));
      if (gone.length) await actor.deleteEmbeddedDocuments("ActiveEffect", gone, { arneyanAura: true }).catch(() => null);
      if (add.length) await actor.createEmbeddedDocuments("ActiveEffect", add, { arneyanAura: true }).catch(() => null);
    }
    if (sweepNext) { sweepNext = false; await sweepElsewhere(scene); }
  } catch (err) {
    console.warn("Arneyan | auras", err);
  } finally {
    busy = false;
    if (again) { again = false; schedule(sweepNext); }
  }
}

let timer = null;
function schedule(sweep = false) {
  if (!isGM()) return;
  if (sweep === true) sweepNext = true;
  clearTimeout(timer);
  timer = setTimeout(refreshScene, 250);
}

/* -------------------------------------------- */
/*  Start of turn                               */
/* -------------------------------------------- */

/** Cards for a creature starting its turn inside auras with a turn effect. */
async function turnCards(combat) {
  const scene = combat.scene ?? canvas?.scene;
  const tgt = combat.combatant?.token;
  if (!scene || !tgt?.actor) return;
  const size = scene.grid.size, distance = scene.grid.distance || 5;
  for (const src of tokensOf(scene)) {
    for (const aura of aurasOf(src.actor)) {
      const turn = aura.def.turn;
      if (!turn || !inAura(aura, src, tgt, size, distance)) continue;
      await auraCard(tgt, src, aura, turn, { gmOnly: !!(src.hidden || tgt.hidden) });
    }
  }
}

/** "Goblin starts its turn in the Balor's Fire Aura": the save, the damage and the condition buttons. */
export async function auraCard(tgt, src, aura, turn, { gmOnly = false } = {}) {
  const victim = tgt.actor;
  const dc = turn.dc || aura.dc || 0;
  const parts = [`<p>${esc(turn.text ?? "")}</p>`];
  if (turn.save) parts.push(`<button type="button" class="arn-save-btn" data-save="${esc(turn.save)}" ${dc ? `data-dc="${dc}"` : ""} data-actor-uuid="${victim.uuid}" data-source="${esc(aura.def.name)}"><i class="fa-solid fa-shield-halved"></i> ${esc(ARNEYAN.saveTypes?.[turn.save] ?? turn.save)} save${dc ? ` DC ${dc}` : ""}</button>`);
  if (turn.formula) {
    const label = `${turn.formula} ${turn.type ?? ""}`.trim();
    parts.push(`<div class="arn-aura-dmg">
      <button type="button" class="arn-aura-damage" data-actor-uuid="${victim.uuid}" data-formula="${esc(turn.formula)}" data-type="${esc(turn.type ?? "")}" data-mult="1" data-source="${esc(aura.def.name)}"><i class="fa-solid fa-burst"></i> ${esc(label)} damage</button>
      ${turn.half ? `<button type="button" class="arn-aura-damage" data-actor-uuid="${victim.uuid}" data-formula="${esc(turn.formula)}" data-type="${esc(turn.type ?? "")}" data-mult="0.5" data-source="${esc(aura.def.name)}">Half (saved)</button>` : ""}</div>`);
  }
  if (turn.status && ARNEYAN.conditions[turn.status]) {
    parts.push(`<button type="button" class="arn-aura-status" data-actor-uuid="${victim.uuid}" data-status="${esc(turn.status)}"><i class="fa-solid fa-circle-exclamation"></i> Failed: ${esc(ARNEYAN.conditions[turn.status].name)}${turn.statusRounds ? ` (${turn.statusRounds === 10 ? "1 minute" : `${turn.statusRounds} round${turn.statusRounds === 1 ? "" : "s"}`})` : ""}</button>`);
  }
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: tgt }),
    ...(gmOnly ? { whisper: game.users.filter(u => u.isGM).map(u => u.id) } : {}),
    content: `<div class="arn-card arn-aura-card"><header class="arn-card-title"><i class="fa-solid fa-circle-radiation"></i> <span>${esc(tgt.name)} starts its turn in ${esc(src.name)}'s ${esc(aura.def.name)}</span></header>${parts.join("")}</div>`
  });
}

/* -------------------------------------------- */
/*  Rings on the map                            */
/* -------------------------------------------- */

const RING = { allies: 0x2d8a3e, enemies: 0xc0392b, all: 0xb8860b };

function drawRings(token, flags = {}) {
  const old = token.children?.find?.(c => c.name === "arnAuraRings");
  // Moving only shifts the token (the ring moves with it): redraw when its size, look or auras change.
  if (!flags.refreshSize && !flags.refreshVisibility && !flags.refreshState && !flags.redraw) return;
  if (old) { token.removeChild(old); old.destroy?.(); }
  if (!game.settings.get(SYS, "auraRings")) return;
  const auras = aurasOf(token.actor).filter(a => a.def.rules?.length || a.def.turn || a.def.ring);
  if (!auras.length || !token.visible) return;
  const g = new PIXI.Graphics();
  g.name = "arnAuraRings";
  const grid = canvas.scene.grid;
  const half = Math.max(token.w, token.h) / 2;
  for (const a of auras) {
    const r = half + (a.radius / (grid.distance || 5)) * grid.size;
    const color = RING[a.def.who] ?? RING.all;
    g.lineStyle(2, color, 0.55);
    g.beginFill(color, 0.05);
    g.drawCircle(token.w / 2, token.h / 2, r);
    g.endFill();
  }
  g.eventMode = "none";
  token.addChildAt?.(g, 0) ?? token.addChild(g);
}

/** Redraw the rings of an actor's tokens (or every token) after its auras change. */
function redrawRings(actor = null) {
  for (const t of canvas?.tokens?.placeables ?? []) {
    if (actor && t.actor !== actor && t.document.actorId !== actor.id) continue;
    try { drawRings(t, { redraw: true }); } catch (err) { console.warn("Arneyan | aura ring", err); }
  }
}

/* -------------------------------------------- */
/*  Chat buttons                                */
/* -------------------------------------------- */

async function onAuraButton(btn) {
  const actor = await fromUuid(btn.dataset.actorUuid).catch(() => null);
  if (!actor) return;
  if (btn.classList.contains("arn-aura-status")) {
    if (!actor.isOwner) return ui.notifications.warn(`Ask the GM to put ${btn.dataset.status} on ${actor.name}.`);
    return toggleCondition(actor, btn.dataset.status, true);
  }
  const roll = tagDamage(await new Roll(btn.dataset.formula).evaluate(), btn.dataset.type);
  const mult = Number(btn.dataset.mult) || 1;
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${esc(btn.dataset.source)}: ${esc(btn.dataset.formula)} ${esc(btn.dataset.type)}${mult < 1 ? " (halved)" : ""}` });
  const { applyDamageTo } = await import("./chat.mjs");
  return applyDamageTo([actor], roll.total, { type: btn.dataset.type ?? "", mult }, { source: btn.dataset.source, what: btn.dataset.source });
}

/* -------------------------------------------- */

export function registerAuras() {
  game.settings.register(SYS, "auraRings", {
    name: "Show aura rings", hint: "A faint ring around tokens with an aura (green for allies, red for enemies, gold for everyone).",
    scope: "client", config: true, type: Boolean, default: true, onChange: () => redrawRings()
  });
  Hooks.on("refreshToken", (token, flags) => { try { drawRings(token, flags); } catch (err) { console.warn("Arneyan | aura ring", err); } });
  Hooks.on("canvasReady", () => schedule(true));
  Hooks.on("updateToken", (doc, changes) => { if ("x" in changes || "y" in changes || "disposition" in changes || "hidden" in changes || "width" in changes) schedule(); });
  Hooks.on("createToken", schedule);
  Hooks.on("deleteToken", () => schedule(true));
  for (const hook of ["createItem", "deleteItem", "updateItem"]) Hooks.on(hook, item => { if (item.system?.auras?.length || item.type === "class") { schedule(); redrawRings(item.actor); } });
  for (const hook of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect"]) {
    Hooks.on(hook, (effect, ...rest) => {
      const opts = rest[rest.length - 2]; // (options, userId), or (changes, options, userId) on update
      if (opts?.arneyanAura || effect.flags?.[SYS]?.auraKey) return;
      if (effect.flags?.[SYS]?.aura) { schedule(); redrawRings(effect.parent); }
    });
  }
  Hooks.on("updateActor", (actor, changes) => { if (foundry.utils.hasProperty(changes, "system.level")) schedule(); });
  Hooks.on("updateCombat", (combat, changed, options) => {
    if (!isGM() || options?.direction === -1 || !("turn" in changed || "round" in changed)) return;
    turnCards(combat).catch(err => console.warn("Arneyan | aura turn", err));
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    html.querySelectorAll(".arn-aura-damage, .arn-aura-status").forEach(el => el.addEventListener("click", ev => { ev.preventDefault(); onAuraButton(el); }));
  });
}

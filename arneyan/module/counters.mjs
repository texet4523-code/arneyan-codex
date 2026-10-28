/**
 * Numbered conditions, PF2e style (Kieran, 20 Oct 2026).
 *
 * A condition can carry a number, kept in its effect's flags.arneyan.value:
 *   rounds  most conditions: rounds left. It goes down by one at the end of the creature's own turn and the
 *           condition ends at 0. Applying it again keeps the longer of the two.
 *   stack   Burning: each application adds 1d6 to the fire damage at the start of its turn (Burning 2 = 2d6).
 *           Dousing ends it all.
 *   stage   Poisoned by a venom: 1 means the poison deals damage, 1d6 at the start of each turn, the same every turn
 *           until the save ends it (Codex Conditions, books v0.10.25; it used to rise 1d4 to 1d10).
 *   none    Prone, Unconscious, Petrified, Dead, Concentrating: on or off.
 * A condition with no number simply lasts until it is removed (or a spell's own duration ends it).
 * Left-click a condition on the token HUD or the effects panel: +1. Right-click: −1, and it goes at 0.
 */
import { ARNEYAN } from "./config.mjs";
import { combatById } from "./fight.mjs";

const SYS = "arneyan";
/** A damaging poison's start-of-turn damage (Codex Conditions, books v0.10.25: flat, no longer rising). */
export const POISON_DIE = "1d6";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const counterKind = id => ARNEYAN.conditions[id]?.counter ?? (ARNEYAN.conditions[id] ? "rounds" : "none");
const has = (e, id) => e.statuses?.has?.(id) ?? e.statuses?.includes?.(id) ?? false;
export const valueOf = e => Math.max(0, Number(e?.flags?.[SYS]?.value) || 0);

/** The condition id an effect stands for (its first known status). */
export function conditionOf(effect) {
  for (const s of effect.statuses ?? []) if (ARNEYAN.conditions[s]) return s;
  return null;
}

/** The effects on an actor carrying a condition; the plain one (from the HUD) first. */
function carriers(actor, id) {
  const list = actor.effects.filter(e => has(e, id));
  const plainId = CONFIG.statusEffects?.find(s => s.id === id)?._id;
  return list.sort((a, b) => (b.id === plainId) - (a.id === plainId) || valueOf(b) - valueOf(a));
}

/** The condition's number on this actor (0: none, or no number). */
export function conditionValue(actor, id) {
  const list = carriers(actor, id);
  // Burning from two sources is two stacks; the others take the largest.
  if (counterKind(id) === "stack") return list.reduce((t, e) => t + (valueOf(e) || 1), 0);
  return Math.max(0, ...list.map(valueOf));
}

/** Rounds left from a spell's own duration, for the badge when the condition has no number. */
function roundsLeft(effect) {
  const x = effect.flags?.[SYS]?.expires;
  // The encounter the duration was stamped in, whichever one this client's tracker shows.
  const combat = combatById(x?.combat);
  if (!x || !combat) return 0;
  return Math.max(0, x.round - combat.round);
}

/** What to show on the icon: the number, else a spell duration's rounds left. */
export function badgeOf(effect) {
  const v = valueOf(effect);
  if (v) return String(v);
  const r = roundsLeft(effect);
  return r ? String(r) : "";
}

async function setValue(effect, v) {
  if (!effect?.isOwner) return;
  return effect.update({ [`flags.${SYS}.value`]: v });
}

async function create(actor, id) {
  if (typeof actor.toggleStatusEffect === "function") await actor.toggleStatusEffect(id, { active: true });
  else {
    const c = ARNEYAN.conditions[id];
    await actor.createEmbeddedDocuments("ActiveEffect", [{ name: c.name, img: `systems/${SYS}/assets/conditions/${id}.svg`, statuses: [id] }]);
  }
  return carriers(actor, id)[0] ?? null;
}

/** Remove a condition entirely (every effect carrying it). */
export async function removeCondition(actor, id) {
  const list = carriers(actor, id).filter(e => e.isOwner);
  if (list.length) await actor.deleteEmbeddedDocuments("ActiveEffect", list.map(e => e.id));
}

/** +1 or −1 from a click. At 0 the condition goes; a condition with no number goes on −1. */
export async function adjustCondition(actor, id, delta) {
  if (!actor?.isOwner) return;
  const kind = counterKind(id);
  let list = carriers(actor, id);
  if (!list.length) {
    if (delta <= 0) return;
    const e = await create(actor, id);
    if (e && kind !== "none" && delta > 1) await setValue(e, Math.min(delta, kind === "stage" ? 1 : 99));
    return;
  }
  if (kind === "none") return delta < 0 ? removeCondition(actor, id) : undefined;
  const e = list[0];
  const cur = valueOf(e);
  // A spell's effect that runs on its own clock: the click moves that clock instead.
  const x = e.flags?.[SYS]?.expires;
  if (!cur && x && kind === "rounds" && combatById(x.combat)) {
    const left = roundsLeft(e) + delta;
    if (left <= 0) return e.delete();
    return e.update({ [`flags.${SYS}.expires.round`]: x.round + delta });
  }
  if (!cur && delta < 0) return removeCondition(actor, id);
  // Burning with no number counts as 1 stack; a timer or venom stage with no number starts from 0.
  const next = Math.min((kind === "stack" ? (cur || 1) : cur) + delta, kind === "stage" ? 1 : 99);
  if (next <= 0) return removeCondition(actor, id);
  return setValue(e, next);
}

/**
 * A condition applied again (a second Burning, Slowed 3 on Slowed 2): stack adds, the others keep the larger.
 * Returns true when it handled it (the condition was already there).
 */
export async function reapply(actor, id, value = 1) {
  const list = carriers(actor, id);
  if (!list.length) return false;
  const kind = counterKind(id);
  if (kind === "none") return true;
  const e = list[0];
  const cur = valueOf(e) || (kind === "stack" || kind === "stage" ? 1 : 0);
  const v = Math.max(1, Number(value) || 1);
  const next = kind === "stack" ? cur + v : Math.max(cur, v);
  if (next !== valueOf(e)) await setValue(e, Math.min(next, kind === "stage" ? 1 : 99));
  return true;
}

/** End of a creature's own turn: every numbered timed condition goes down one; at 0 it ends. */
export async function tickCounters(actor) {
  if (!actor) return;
  const ended = [], down = [];
  for (const e of actor.effects.contents) {
    const id = conditionOf(e);
    if (!id || counterKind(id) !== "rounds") continue;
    const v = valueOf(e);
    if (!v) continue;
    if (v <= 1) ended.push(e);
    else down.push(e);
  }
  for (const e of down) await setValue(e, valueOf(e) - 1).catch(() => null);
  if (ended.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", ended.map(e => e.id).filter(i => actor.effects.has(i))).catch(() => null);
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: game.users.filter(u => u.isGM).map(u => u.id),
      content: `<p><strong>${esc(actor.name)}</strong>: ${ended.map(e => esc(e.name)).join(", ")} ended.</p>` });
  }
}

/** The start-of-turn damage for Burning (stacks of 1d6) and a damaging poison (1d6, the same every turn). */
export function turnDamageFor(actor, id) {
  const c = ARNEYAN.conditions[id];
  if (id === "burning") {
    const n = Math.max(1, conditionValue(actor, id));
    return { formula: `${n}d6`, type: "fire", label: n > 1 ? `Burning ${n}` : "Burning" };
  }
  if (id === "poisoned") {
    const stage = conditionValue(actor, id);
    if (!stage) return null; // Poisoned or Sickened by something that isn't a venom: no damage
    return { formula: POISON_DIE, type: "poison", label: "Poisoned (venom)", note: "The same each turn until the Fortitude save at the end of a turn ends it." };
  }
  return c?.turnDamage ? { ...c.turnDamage, label: c.name } : null;
}

/* -------------------------------------------- */
/*  Numbers on the token's icons                */
/* -------------------------------------------- */

function textureSrc(sprite) {
  const t = sprite?.texture;
  return String(t?.baseTexture?.resource?.src ?? t?.source?.resource?.src ?? t?.source?.label ?? t?.baseTexture?.cacheId ?? t?.textureCacheIds?.[0] ?? "");
}

/** Put each numbered condition's value on its icon (call after the token draws its effects). */
export function drawTokenCounters(token) {
  const actor = token.actor;
  const box = token.effects;
  if (!actor || !box?.children) return;
  const want = new Map();
  for (const e of actor.effects) {
    const id = conditionOf(e);
    if (!id || e.disabled) continue;
    const b = badgeOf(e);
    if (b) want.set(`conditions/${id}.svg`, b);
  }
  if (!want.size) return;
  const temp = actor.temporaryEffects ?? [];
  const sprites = box.children.filter(c => c instanceof PIXI.Sprite);
  // Core gives each icon its effect's index as zIndex; trust that only if the indexes are distinct.
  const indexed = new Set(sprites.map(c => c.zIndex)).size === sprites.length && sprites.length > 1;
  for (const sprite of sprites) {
    const byIndex = indexed && Number.isInteger(sprite.zIndex) ? temp[sprite.zIndex] : null;
    const idx = byIndex && conditionOf(byIndex) ? `conditions/${conditionOf(byIndex)}.svg` : null;
    const src = textureSrc(sprite);
    const key = idx && want.has(idx) ? idx : (idx ? null : [...want.keys()].find(k => src.includes(k)));
    if (!key) continue;
    sprite.children?.filter(c => c.name === "arnCount").forEach(c => { sprite.removeChild(c); c.destroy(true); });
    const w = sprite.texture?.width || 100, h = sprite.texture?.height || 100;
    const text = new PIXI.Text(want.get(key), { fontFamily: "Signika", fontWeight: "700", fontSize: Math.round(h * 0.62), fill: 0xffffff, stroke: 0x000000, strokeThickness: Math.max(2, Math.round(h * 0.12)) });
    text.name = "arnCount";
    // Core clears the icons without destroying their children: free the text's canvas with its icon.
    sprite.once?.("destroyed", () => { if (!text.destroyed) text.destroy(true); });
    text.anchor.set(1, 1);
    text.position.set(w * (1 - (sprite.anchor?.x ?? 0)) + w * 0.08, h * (1 - (sprite.anchor?.y ?? 0)) + h * 0.08);
    sprite.addChild(text);
  }
}

/* -------------------------------------------- */
/*  Token HUD clicks                            */
/* -------------------------------------------- */

export function registerCounters() {
  // A spell's clock on an icon changes with the round: redraw those tokens' icons.
  Hooks.on("updateCombat", (combat, changed) => {
    if (!("round" in changed) || !canvas?.tokens) return;
    for (const t of canvas.tokens.placeables) {
      if (t.actor?.effects?.some(e => e.flags?.[SYS]?.expires && conditionOf(e))) t.renderFlags?.set?.({ redrawEffects: true });
    }
  });
  Hooks.on("renderTokenHUD", (hud, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.dataset.arnCounters) return;
    root.dataset.arnCounters = "1";
    const handle = (ev, delta) => {
      const ctl = ev.target.closest?.("[data-status-id]");
      if (!ctl) return;
      const id = ctl.dataset.statusId;
      const actor = hud.object?.actor ?? hud.document?.actor;
      if (!actor || !ARNEYAN.conditions[id] || counterKind(id) === "none") return;
      if (!carriers(actor, id).length) return; // not on yet: core's click puts it on
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      adjustCondition(actor, id, delta).then(() => setTimeout(() => hud.rendered && hud.render?.(), 50)).catch(err => console.warn("Arneyan | counter", err));
    };
    root.addEventListener("click", ev => handle(ev, +1), true);
    root.addEventListener("contextmenu", ev => handle(ev, -1), true);
    // The number beside each lit icon.
    const actor = hud.object?.actor ?? hud.document?.actor;
    if (!actor) return;
    for (const ctl of root.querySelectorAll("[data-status-id]")) {
      const id = ctl.dataset.statusId;
      const e = carriers(actor, id)[0];
      const b = e ? badgeOf(e) : "";
      if (!e || counterKind(id) === "none") continue;
      ctl.dataset.tooltip = `${ARNEYAN.conditions[id]?.name ?? id}${b ? ` ${b}` : ""}<br><small>Left-click +1 · right-click −1</small>`;
      if (b) {
        // Wrapped so the number sits on the icon whatever the palette's layout (it's hidden until opened).
        const wrap = document.createElement("span");
        wrap.className = "arn-hud-wrap";
        ctl.replaceWith(wrap);
        wrap.append(ctl);
        const tag = document.createElement("span");
        tag.className = "arn-hud-count";
        tag.textContent = b;
        wrap.append(tag);
      }
    }
  });
}

/**
 * Table conveniences (Feature Board QoL, 19 Oct 2026):
 * - Monsters roll initiative when combat starts; identical monsters (six goblins) share one roll and act together.
 * - Hovering a monster shows players how hurt it looks (Unhurt, Hurt, Bloodied, Near death, Down); the GM sees
 *   its HP and AC.
 * - Drag a weapon, spell, ability or potion from a sheet to the macro bar: clicking it uses that item for the
 *   selected token (or your character).
 */
import { turnDamageFor } from "./counters.mjs";
const SYS = "arneyan";
const isGM = () => !!game.users?.activeGM?.isSelf;

/* -------------------------------------------- */
/*  Group initiative                            */
/* -------------------------------------------- */

/** One key per kind of monster: the same base actor (unlinked tokens) and name. */
const groupKey = c => `${c.actorId ?? ""}|${c.token?.name ?? c.name}`;

export async function rollMonsterInitiative(combat) {
  const todo = combat.combatants.filter(c => c.initiative === null && c.actor?.type === "npc" && !c.isDefeated);
  if (!todo.length) return;
  const share = game.settings.get(SYS, "groupInitiative");
  const groups = new Map();
  for (const c of todo) {
    const k = share ? groupKey(c) : c.id;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const leaders = [...groups.values()].map(g => g[0].id);
  await combat.rollInitiative(leaders, { updateTurn: false, messageOptions: { rollMode: CONST.DICE_ROLL_MODES.PRIVATE } });
  const updates = [];
  for (const g of groups.values()) {
    const init = combat.combatants.get(g[0].id)?.initiative;
    for (const c of g.slice(1)) updates.push({ _id: c.id, initiative: init });
  }
  if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
}

/* -------------------------------------------- */
/*  How hurt it looks                           */
/* -------------------------------------------- */

export function healthWord(hp) {
  const max = Number(hp?.max) || 0, v = Number(hp?.value) || 0;
  if (!max) return "";
  if (v <= 0) return "Down";
  const f = v / max;
  if (f >= 1) return "Unhurt";
  if (f > 0.5) return "Hurt";
  if (f > 0.25) return "Bloodied";
  return "Near death";
}
const WORD_COLOUR = { Unhurt: 0xb9e3b0, Hurt: 0xf3d58a, Bloodied: 0xf0a060, "Near death": 0xff6b5b, Down: 0xbbbbbb };

function showHealth(token, hovered) {
  const old = token.children?.find?.(c => c.name === "arnHealth");
  if (old) { token.removeChild(old); old.destroy(); }
  if (!hovered || !game.settings.get(SYS, "healthWords")) return;
  const actor = token.actor;
  if (!actor || actor.type !== "npc") return;
  const hp = actor.system.attributes?.hp;
  let text, colour;
  if (game.user.isGM) {
    text = `HP ${hp?.value ?? "?"}/${hp?.max ?? "?"} · AC ${actor.system.acTotal ?? actor.system.attributes?.ac ?? "?"}`;
    colour = 0xffffff;
  } else {
    if (actor.isOwner || token.document.hidden) return;
    text = healthWord(hp);
    colour = WORD_COLOUR[text] ?? 0xffffff;
  }
  if (!text) return;
  const style = CONFIG.canvasTextStyle?.clone?.() ?? new PIXI.TextStyle();
  style.fontSize = 14;
  style.fill = colour;
  style.stroke = 0x000000;
  style.strokeThickness = 3;
  const TextClass = foundry.canvas?.containers?.PreciseText ?? globalThis.PreciseText ?? PIXI.Text;
  const label = new TextClass(text, style);
  label.name = "arnHealth";
  label.anchor.set(0.5, 0);
  label.position.set(token.w / 2, token.h + 18);
  label.eventMode = "none";
  token.addChild(label);
}

/* -------------------------------------------- */
/*  Macro bar                                   */
/* -------------------------------------------- */

/** Use an item by name on the selected token's actor (or your character): attack, cast, use. */
export async function useItem(name, type = "") {
  const actor = canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character;
  if (!actor) return ui.notifications.warn("Select a token (or assign your character) to use that.");
  const item = actor.items.find(i => i.name === name && (!type || i.type === type));
  if (!item) return ui.notifications.warn(`${actor.name} has no ${name}.`);
  return item.use();
}

async function itemMacro(data, slot) {
  const item = data.uuid ? await fromUuid(data.uuid).catch(() => null) : null;
  if (!item?.actor) return ui.notifications.warn("Drag the item from a character's or monster's sheet.");
  const command = `game.arneyan.useItem(${JSON.stringify(item.name)}, ${JSON.stringify(item.type)});`;
  let macro = game.macros.find(m => m.name === item.name && m.command === command && m.isOwner);
  if (!macro) macro = await Macro.create({ name: item.name, type: "script", img: item.img, command, flags: { [SYS]: { itemMacro: true } } });
  if (macro) await game.user.assignHotbarMacro(macro, slot);
}

/* -------------------------------------------- */

/* -------------------------------------------- */
/*  Reach and range                             */
/* -------------------------------------------- */

/** Feet between two tokens, counted in squares between their nearest squares (as the grid counts movement). */
export function feetBetween(a, b) {
  const scene = a.parent ?? canvas.scene;
  const size = scene.grid.size, dist = scene.grid.distance || 5;
  const sq = t => {
    const out = [], x0 = Math.round(t.x / size), y0 = Math.round(t.y / size);
    const w = Math.max(1, Math.round(t.width ?? 1)), h = Math.max(1, Math.round(t.height ?? 1));
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push([x0 + i, y0 + j]);
    return out;
  };
  let best = Infinity;
  for (const [ax, ay] of sq(a)) for (const [bx, by] of sq(b)) best = Math.min(best, Math.max(Math.abs(ax - bx), Math.abs(ay - by)));
  return best * dist;
}

/**
 * A weapon's reach and range: { reach, normal, long }. Melee reach is 5ft (10ft with the Reach trait). A range of
 * "60–200 ft" is 60 normal, 200 long; a single "20 ft" (thrown, a sling) is 20 normal, 40 long (Disadvantage
 * beyond the listed range, up to twice it, as the pregen sheets print it).
 */
export function rangeOf(item) {
  const s = item?.system ?? {};
  const reach = /\breach\b/i.test(s.traits ?? "") ? 10 : 5;
  const txt = String(s.range ?? "");
  const two = txt.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (two) return { reach: s.ranged ? 0 : reach, normal: Number(two[1]), long: Number(two[2]) };
  const one = txt.match(/(\d+)\s*ft/i) ?? txt.match(/^(\d+)$/);
  if (one) return { reach: s.ranged ? 0 : reach, normal: Number(one[1]), long: Number(one[1]) * 2 };
  return { reach, normal: 0, long: 0 };
}

/** A spell's range in feet, or null for Touch, Self or one it can't read ("Range 150ft" -> 150). */
export function spellRange(spell) {
  const t = String(spell?.system?.range ?? "");
  if (/touch/i.test(t)) return 5;
  const m = t.match(/(\d+)\s*ft/i);
  return m ? Number(m[1]) : null;
}

/** Warn when a spell's targets are out of its range (casting still goes ahead: the GM may know better). */
export function warnSpellRange(actor, spell) {
  const r = spellRange(spell);
  const from = actor?.token?.object ?? actor?.getActiveTokens?.()?.[0];
  if (!r || !from) return;
  const far = Array.from(game.user.targets ?? []).filter(t => feetBetween(from.document, t.document) > r);
  if (far.length) ui.notifications.warn(`${spell.name} reaches ${r}ft: ${far.map(t => `${t.name} (${feetBetween(from.document, t.document)}ft)`).join(", ")} ${far.length === 1 ? "is" : "are"} out of range.`);
}

/* -------------------------------------------- */
/*  Floating numbers                            */
/* -------------------------------------------- */

function floatHp(actor, changes, options) {
  if (!game.settings.get(SYS, "floatingNumbers")) return;
  const pops = [];
  const now = foundry.utils.getProperty(changes, "system.attributes.hp.value");
  const prev = options?.arneyanPrevHp?.[actor.id];
  if (now !== undefined && prev !== undefined && now !== prev) pops.push({ d: now - prev, text: d => `${d > 0 ? "+" : ""}${d}`, fill: d => (d < 0 ? 0xff5c4d : 0x6be36b) });
  // Temporary HP: blue, so a hit soaked by it still shows.
  const tNow = foundry.utils.getProperty(changes, "system.attributes.hp.temp");
  const tPrev = options?.arneyanPrevTemp?.[actor.id];
  if (tNow !== undefined && tPrev !== undefined && Number(tNow) !== Number(tPrev)) pops.push({ d: Number(tNow) - Number(tPrev), text: d => `${d > 0 ? "+" : ""}${d} temp`, fill: () => 0x6bb4ff });
  if (!pops.length) return;
  for (const t of actor.getActiveTokens?.(true) ?? []) {
    if (!t.visible) continue;
    pops.forEach((p, i) => canvas.interface?.createScrollingText?.({ x: t.center.x, y: t.center.y + i * 30 }, p.text(p.d), {
      anchor: CONST.TEXT_ANCHOR_POINTS.TOP, direction: CONST.TEXT_ANCHOR_POINTS.TOP, distance: t.h, fontSize: i ? 26 : 32,
      fill: p.fill(p.d), stroke: 0x000000, strokeThickness: 4, jitter: 0.25
    }));
  }
}

/* -------------------------------------------- */
/*  Reach ring                                  */
/* -------------------------------------------- */

function reachRing(token) {
  const old = token.children?.find?.(c => c.name === "arnReach");
  if (old) { token.removeChild(old); old.destroy(); }
  if (!token.controlled || !game.settings.get(SYS, "reachRing") || !token.actor?.isOwner) return;
  const weapons = token.actor.items.filter(i => i.type === "weapon" && i.system.equipped && !i.system.ranged);
  const reach = weapons.some(w => /\breach\b/i.test(w.system.traits ?? "")) ? 10 : 5;
  const grid = canvas.scene.grid;
  const pad = (reach / (grid.distance || 5)) * grid.size;
  const g = new PIXI.Graphics();
  g.name = "arnReach";
  g.lineStyle(2, 0xd4b062, 0.5);
  g.drawRoundedRect(-pad, -pad, token.w + 2 * pad, token.h + 2 * pad, grid.size * 0.25);
  g.eventMode = "none";
  token.addChildAt(g, 0);
}

/* -------------------------------------------- */
/*  Start of turn reminders                     */
/* -------------------------------------------- */

export async function turnReminder(combat) {
  if (!game.settings.get(SYS, "turnReminders")) return;
  const c = combat.combatant;
  const actor = c?.actor;
  if (!actor || c.defeated) return;
  const lines = [];
  const conc = actor.effects.find(e => e.flags?.[SYS]?.concentration);
  if (conc) lines.push(`Concentrating on ${conc.flags[SYS].sourceName ?? conc.name.replace(/^Concentrating:\s*/, "")}.`);
  for (const e of actor.effects) {
    const x = e.flags?.[SYS]?.expires;
    if (!x || x.combat !== combat.id) continue;
    const left = x.round - combat.round;
    if (left === 1) lines.push(`${e.name} ends at the start of its next turn.`);
  }
  const regen = actor.items.find(i => /regenerat/i.test(i.name));
  if (regen) lines.push(`${regen.name}: ${String(regen.system.description ?? "").replace(/<[^>]+>/g, "").slice(0, 160)}`);
  const ongoing = [...(actor.statuses ?? [])].filter(id => ["burning", "poisoned", "confused"].includes(id));
  for (const id of ongoing) {
    const d = turnDamageFor(actor, id);
    lines.push(`${({ burning: `${d?.label ?? "Burning"}: ${d?.formula ?? "1d6"} fire (card above)`, poisoned: d ? `${d.label}: ${d.formula} poison (card above), then a Fortitude save at the end of the turn` : "Poisoned: a Fortitude save at the end of the turn", confused: "Confused: roll 1d10 for what it does" })[id]}.`);
  }
  if (actor.system.attributes?.stable === false && actor.system.attributes?.state === "dying") lines.push("Dying: loses 1 HP (card above).");
  if (!lines.length) return;
  const owners = game.users.filter(u => u.active && (u.isGM || actor.testUserPermission(u, "OWNER"))).map(u => u.id);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor, token: c.token }), whisper: owners,
    content: `<div class="arn-card arn-report"><header class="arn-card-title"><i class="fa-solid fa-hourglass-start"></i> <span>${foundry.utils.escapeHTML(c.name)}'s turn</span></header><ul>${lines.map(l => `<li>${foundry.utils.escapeHTML(l)}</li>`).join("")}</ul></div>`
  });
}

/** Combat that rolls the monsters' initiative before the first turn starts (so turn-start cards go to the right creature). */
export function combatClass(Base) {
  return class ArneyanCombat extends Base {
    async startCombat() {
      if (game.user.isGM) await rollMonsterInitiative(this).catch(err => console.warn("Arneyan | initiative", err));
      return super.startCombat();
    }
  };
}

export function registerQol() {
  game.settings.register(SYS, "floatingNumbers", {
    name: "Floating damage and healing numbers", hint: "Applying damage or healing pops the number over the token (red for damage, green for healing).",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(SYS, "reachRing", {
    name: "Reach ring on your selected token", hint: "A faint square at your melee reach (5ft, 10ft with a Reach weapon), to see who you can hit or who can make an attack of opportunity.",
    scope: "client", config: true, type: Boolean, default: true, onChange: () => canvas?.tokens?.controlled.forEach(reachRing)
  });
  game.settings.register(SYS, "turnReminders", {
    name: "Start of turn reminders", hint: "One card, to the creature's owners and the GM, listing concentration, effects about to end, ongoing damage and Regeneration.",
    scope: "world", config: true, type: Boolean, default: true
  });
  Hooks.on("updateActor", (actor, changes, options) => { try { floatHp(actor, changes, options); } catch (err) { console.warn("Arneyan | float", err); } });
  Hooks.on("controlToken", token => { try { reachRing(token); } catch (err) { console.warn("Arneyan | reach", err); } });
  // A token's sprite can be rebuilt (size or image changes): put the ring back if it went.
  Hooks.on("refreshToken", (token, flags) => {
    if (!token.controlled || !(flags?.refreshSize || flags?.redraw)) return;
    if (flags.refreshSize || !token.children?.some?.(c => c.name === "arnReach")) try { reachRing(token); } catch (err) { /* drawing not ready */ }
  });
  Hooks.on("updateItem", item => { if (item.type === "weapon" && item.actor) for (const t of item.actor.getActiveTokens?.() ?? []) if (t.controlled) reachRing(t); });
  // Defeated monsters' turns are skipped (core's setting), switched on once for the world.
  Hooks.once("ready", async () => {
    if (!game.user.isGM || game.settings.get(SYS, "skipDefeatedSet")) return;
    try {
      const cfg = foundry.utils.deepClone(game.settings.get("core", "combatTrackerConfig") ?? {});
      cfg.skipDefeated = true;
      await game.settings.set("core", "combatTrackerConfig", cfg);
    } catch (err) { console.warn("Arneyan | skip defeated", err); }
    await game.settings.set(SYS, "skipDefeatedSet", true);
  });
  game.settings.register(SYS, "skipDefeatedSet", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register(SYS, "groupInitiative", {
    name: "Identical monsters share initiative", hint: "When combat starts, every monster rolls initiative (privately); monsters of the same kind (six goblins) share one roll and act together.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(SYS, "healthWords", {
    name: "Hover a monster to see how hurt it is", hint: "Players see Unhurt, Hurt, Bloodied, Near death or Down; the GM sees HP and AC.",
    scope: "world", config: true, type: Boolean, default: true
  });
  Hooks.on("hoverToken", (token, hovered) => { try { showHealth(token, hovered); } catch (err) { console.warn("Arneyan | health word", err); } });
  Hooks.on("updateActor", actor => {
    for (const t of actor.getActiveTokens?.() ?? []) if (t.hover) try { showHealth(t, true); } catch { /* the label is only a convenience */ }
  });
  Hooks.on("hotbarDrop", (bar, data, slot) => {
    if (data?.type !== "Item" || !data.uuid) return;
    const it = fromUuidSync(data.uuid);
    if (!it?.actor) return; // sidebar and compendium items keep Foundry's own macro
    itemMacro(data, slot).catch(err => ui.notifications.warn(`Couldn't make the macro: ${err.message}`));
    return false;
  });
}

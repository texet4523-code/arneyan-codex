/**
 * Place area: a spell's shape on the map (Fireball's 20ft circle, Burning Hands' cone, Lightning Bolt's line).
 *
 * - The shape follows the mouse; the wheel turns it; left-click places it, right-click or Esc cancels. Cones and
 *   lines that start from the caster stay on the caster and point at the mouse.
 * - Creatures inside become your targets, so the card's save, damage and effect buttons go straight to them.
 * - An instant area (Fireball) is cleared at the start of the caster's next turn. A lingering one (Web,
 *   Stinking Cloud, Cloudkill) stays, and anyone who starts a turn inside gets a card with its save and damage.
 *   Ending concentration clears it.
 * - A spell that moves with the caster (Spirit Guardians) becomes an aura on them instead (see auras.mjs).
 *
 * Foundry 14 places Regions; Foundry 13 falls back to a measured template at the caster, to drag into place.
 */
import { auraCard, evalRadius } from "./auras.mjs";
import { combatFor, combatOnScene } from "./fight.mjs";

const SYS = "arneyan";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const isGM = () => !!game.users?.activeGM?.isSelf;
const SHAPES = { circle: "circle", cone: "cone", line: "line", rect: "cube" };

/** The button for a spell's card. `spell` is the spell's data (an Item or its toObject()). */
export function areaButton(spell, { actor, dc = null, cl = 1, formula = "", itemUuid = "" } = {}) {
  const t = spell?.system?.template?.type ? spell.system.template : areaFromText(spell?.system?.area);
  if (!t?.type || !actor) return "";
  const s = spell.system;
  const size = (t.sizeFormula && roundsFor(t.sizeFormula, cl)) || t.size;
  const data = {
    spell: spell.name, actor: actor.uuid, item: itemUuid, type: t.type, size, width: t.width || 0,
    attached: !!t.attached, fromSelf: !!t.fromSelf, lingering: !!t.lingering, rounds: t.rounds ?? "",
    save: s.save ?? "", dc: dc ?? 0, formula: formula || "", dtype: s.damageType ?? "", half: /\bhalf\b/i.test(s.saveEffect ?? ""), cl
  };
  const what = t.type === "line" ? `${size}ft line` : t.type === "circle" ? `${size}ft radius` : `${size}ft ${SHAPES[t.type] ?? t.type}`;
  const label = t.attached ? `Start ${esc(spell.name)} (${size}ft around you)` : `Place area: ${what}${t.lingering ? ", lingering" : ""}`;
  return `<button type="button" class="arn-place-area" data-area="${esc(JSON.stringify(data))}"><i class="fa-solid fa-${t.attached ? "circle-radiation" : "bullseye"}"></i> ${label}</button>`;
}

/** A spell copied before 0.7.0 has only its area text ("20ft radius", "15ft cone", "100ft line, 5ft wide"). */
export function areaFromText(text) {
  const m = String(text ?? "").match(/(\d+)\s*ft[- ]?(radius|cone|line|cube|square)(?:,\s*(\d+)\s*ft wide)?/i);
  if (!m) return null;
  const type = { radius: "circle", cone: "cone", line: "line", cube: "rect", square: "rect" }[m[2].toLowerCase()];
  return { type, size: Number(m[1]), width: Number(m[3] ?? (type === "line" ? 5 : 0)), attached: false, fromSelf: type === "cone", lingering: false };
}

/* -------------------------------------------- */
/*  Who's inside                                */
/* -------------------------------------------- */

/** The centres of the squares a token covers. */
function squareCentres(doc) {
  const size = doc.parent?.grid?.size ?? canvas.grid.size;
  const w = Math.max(1, Math.round(doc.width ?? 1)), h = Math.max(1, Math.round(doc.height ?? 1));
  const out = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push({ x: doc.x + (i + 0.5) * size, y: doc.y + (j + 0.5) * size });
  return out;
}

/** Is any square of this token inside the area (a Region or a measured template)? */
export function tokenInside(area, tokenDoc) {
  const pts = squareCentres(tokenDoc);
  if (area.documentName === "Region") {
    return pts.some(p => { try { return area.testPoint({ ...p, elevation: tokenDoc.elevation ?? 0 }); } catch { return false; } });
  }
  const shape = area.object?.shape;
  if (!shape) return false;
  return pts.some(p => shape.contains(p.x - area.x, p.y - area.y));
}

/** Creatures inside the area (not the caster when the shape starts from them). */
function creaturesIn(area) {
  const f = area.flags?.[SYS]?.area ?? {};
  return (canvas.tokens?.placeables ?? []).filter(t => {
    const a = t.actor;
    if (!a || !["character", "npc"].includes(a.type)) return false;
    if (t.document.hidden && !game.user.isGM) return false;
    if (f.fromSelf && t.document.id === f.token) return false;
    return tokenInside(area, t.document);
  });
}

function targetAll(tokens) {
  const ids = tokens.map(t => t.id);
  if (canvas.tokens.setTargets) return canvas.tokens.setTargets(ids);
  for (const t of Array.from(game.user.targets)) t.setTarget(false, { releaseOthers: false, groupSelection: true });
  for (const t of tokens) t.setTarget(true, { releaseOthers: false, groupSelection: true });
}

/* -------------------------------------------- */
/*  Placing                                     */
/* -------------------------------------------- */

const pxPerFoot = () => canvas.scene.grid.size / (canvas.scene.grid.distance || 5);

/**
 * The shape in pixels. True geometric shapes (gridBased false): with the 5-5-5 diagonal rule a grid-based circle
 * counts diagonals as 5ft and comes out square, which isn't how D&D-style areas look.
 */
function shapeData(d) {
  const px = pxPerFoot();
  const size = d.size * px;
  switch (d.type) {
    case "circle": return { type: "circle", x: 0, y: 0, radius: size, gridBased: false };
    case "cone": return { type: "cone", x: 0, y: 0, radius: size, angle: CONFIG.MeasuredTemplate?.defaults?.angle ?? 53.13, rotation: 0, gridBased: false };
    case "line": return { type: "line", x: 0, y: 0, length: size, width: (d.width || 5) * px, rotation: 0, gridBased: false };
    case "rect": return { type: "rectangle", x: 0, y: 0, width: size, height: size, anchorX: 0.5, anchorY: 0.5, rotation: 0, gridBased: false };
  }
  return null;
}

/** Where a cone or line leaves the caster: the edge of its token, towards the mouse. */
function edgeToward(token, pos) {
  const c = token.center;
  const ang = Math.atan2(pos.y - c.y, pos.x - c.x);
  const half = Math.max(token.w, token.h) / 2;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const k = half / Math.max(Math.abs(cos), Math.abs(sin), 1e-6);
  return { x: c.x + cos * k, y: c.y + sin * k, rotation: Math.toDegrees ? Math.toDegrees(ang) : ang * 180 / Math.PI };
}

async function placeRegion(d, actor, token) {
  const shape = shapeData(d);
  if (!shape) return null;
  const pinned = d.fromSelf && token && ["cone", "line", "circle"].includes(d.type);
  const data = {
    name: `${d.spell} (${actor.name})`,
    color: game.user.color?.css ?? game.user.color,
    shapes: [shape],
    ...(canvas.level?.id ? { levels: [canvas.level.id] } : {}),
    restriction: { enabled: true, type: "move" },
    visibility: CONST.REGION_VISIBILITY?.ALWAYS ?? 2,
    highlightMode: "coverage",
    displayMeasurements: true,
    ownership: { [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    flags: { core: { MeasuredTemplate: true }, [SYS]: { area: areaFlags(d, token) } }
  };
  if (game.paused && !game.user.isGM) { ui.notifications.warn("The game is paused: areas can be placed once the GM unpauses."); return null; }
  const options = {
    onMove: pinned ? ({ position, shape: s }) => {
      if (d.type === "circle") { const c = token.center; s.updateSource({ x: c.x, y: c.y }); return false; }
      s.updateSource(edgeToward(token, position));
      return false;
    } : undefined,
    allowRotation: d.type !== "circle"
  };
  ui.notifications.info(`${d.spell}: move the mouse to place it${d.type === "circle" ? "" : ", the wheel turns it"}; left-click places it, right-click or Esc cancels.`);
  return canvas.regions.placeRegion(data, options);
}

/** Foundry 13: a measured template at the caster, for the player to drag into place. */
async function placeTemplate(d, actor, token) {
  const t = { circle: "circle", cone: "cone", line: "ray", rect: "rect" }[d.type];
  const c = token?.center ?? { x: canvas.dimensions.width / 2, y: canvas.dimensions.height / 2 };
  const data = {
    t, x: c.x, y: c.y, distance: d.type === "rect" ? Math.hypot(d.size, d.size) : d.size, direction: d.type === "rect" ? 45 : 0,
    ...(t === "cone" ? { angle: CONFIG.MeasuredTemplate.defaults.angle } : {}),
    ...(t === "ray" ? { width: d.width || 5 } : {}),
    fillColor: game.user.color?.css ?? game.user.color,
    flags: { [SYS]: { area: areaFlags(d, token) } }
  };
  const [doc] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [data]);
  canvas.templates?.activate?.();
  ui.notifications.info(`${d.spell}: drag the template into place, then press "Target creatures inside" on the card.`);
  return doc;
}

/** Rounds from a formula like "1*@cl" or "min(10*@cl, 100)". */
export function roundsFor(formula, cl = 1) {
  const s = String(formula ?? "").trim();
  if (!s) return 0;
  const n = Number(cl) || 1;
  const m = s.match(/^min\((\d+)\*@cl,\s*(\d+)\)$/);
  if (m) return Math.min(Number(m[1]) * n, Number(m[2]));
  const k = s.match(/^(\d+)\*@cl$/);
  if (k) return Number(k[1]) * n;
  return Number(s) || 0;
}

function areaFlags(d, token) {
  // The caster's encounter, else one running on the scene the area is placed on (not just the tracker's).
  const own = combatFor(token?.actor);
  const combat = (own?.started ? own : null) ?? combatOnScene(token?.parent?.id ?? globalThis.canvas?.scene?.id);
  const rounds = d.lingering ? roundsFor(d.rounds, d.cl) : 0;
  return {
    rounds, expires: rounds && combat ? { round: combat.round + rounds, turn: combat.turn ?? 0 } : null,
    spell: d.spell, actor: d.actor, token: token?.id ?? "", fromSelf: !!d.fromSelf, lingering: !!d.lingering, instant: !d.lingering,
    save: d.save, dc: d.dc, formula: d.formula, dtype: d.dtype, half: !!d.half, combat: combat?.id ?? "", round: combat?.round ?? 0,
    turn: combat?.turn ?? 0
  };
}

/** Link something the spell made to the caster's concentration, so ending it clears it. */
async function linkConcentration(actor, spellName, uuid) {
  const conc = actor.effects.find(e => e.flags?.[SYS]?.concentration && e.flags[SYS].sourceName === spellName);
  if (!conc?.isOwner) return;
  await conc.update({ [`flags.${SYS}.linked`]: [...(conc.flags[SYS].linked ?? []), uuid] });
}

/** Spirit Guardians and the like: an aura on the caster for the spell's duration. */
async function startAura(d, actor) {
  if (!actor.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner can start ${d.spell}.`);
  let spell = d.item ? await fromUuid(d.item).catch(() => null) : null;
  if (!spell) {
    const pack = game.packs.get(`${SYS}.spells`);
    const idx = (await pack?.getIndex())?.find(e => e.name === d.spell);
    spell = idx ? await pack.getDocument(idx._id) : null;
  }
  const auras = foundry.utils.deepClone(spell?.system?.auras ?? []);
  if (!auras.length) auras.push({ key: "area", name: d.spell, radius: d.size, who: "all", includeSelf: false, rules: [], ring: true });
  const rounds = auras[0].rounds ? Math.max(0, Math.floor(evalRadius(auras[0].rounds, d.cl))) : roundsFor(d.rounds, d.cl);
  for (const a of auras) if (a.turn && !a.turn.dc) a.turn.dc = d.dc || 0;
  const old = actor.effects.filter(e => e.flags?.[SYS]?.aura && e.name === d.spell).map(e => e.id);
  if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old);
  const own = combatFor(actor);
  const combat = own?.started ? own : null;
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: d.spell, img: spell?.img ?? "icons/svg/aura.svg", transfer: false,
    ...(rounds ? { duration: { rounds } } : {}),
    flags: { [SYS]: { aura: auras, cl: d.cl, dc: d.dc, sourceName: d.spell, rounds,
      ...(rounds && combat ? { expires: { combat: combat.id, round: combat.round + rounds, turn: combat.turn ?? 0 } } : {}) } }
  }]);
  if (effect) await linkConcentration(actor, d.spell, effect.uuid);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="arn-card arn-report"><header class="arn-card-title"><i class="fa-solid fa-circle-radiation"></i> <span>${esc(d.spell)}</span></header><p>${esc(actor.name)}: ${esc(d.spell)} surrounds them (${d.size}ft)${rounds ? ` for ${rounds} rounds` : ""}. Creatures that start their turn inside get a card.</p></div>`
  });
}

async function onPlace(btn) {
  let d;
  try { d = JSON.parse(btn.dataset.area); } catch { return; }
  const actor = await fromUuid(d.actor).catch(() => null);
  if (!actor) return ui.notifications.warn("The caster is no longer here.");
  if (d.attached) return startAura(d, actor);
  if (!canvas?.scene) return ui.notifications.warn("Open a scene to place the area.");
  // An unlinked monster's token is the actor's own token; a character's is any of its tokens here.
  const token = actor.token?.object ?? actor.getActiveTokens?.()?.[0] ?? null;
  if (d.fromSelf && !token) ui.notifications.warn(`${actor.name} has no token on this scene; place the area by hand.`);
  let area;
  try {
    area = canvas.regions?.placeRegion ? await placeRegion(d, actor, token) : await placeTemplate(d, actor, token);
  } catch (err) {
    console.warn("Arneyan | place area", err);
    return ui.notifications.warn("Couldn't place the area. On Foundry 14, players need permission to create templates (Configure Settings → User Permissions).");
  }
  if (!area) return;
  if (d.lingering) await linkConcentration(actor, d.spell, area.uuid);
  const inside = creaturesIn(area);
  targetAll(inside);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="arn-card arn-report arn-area-card"><header class="arn-card-title"><i class="fa-solid fa-bullseye"></i> <span>${esc(d.spell)}: area placed</span></header>
      <p>${inside.length ? `Inside: ${inside.map(t => esc(t.name)).join(", ")}. They are now your targets.` : "Nobody is inside."}</p>
      <p class="arn-muted">${d.lingering ? `It stays${area.flags?.[SYS]?.area?.rounds ? ` for ${area.flags[SYS].area.rounds} rounds` : " until the spell ends"} (or press Remove area); anyone starting a turn inside gets a card.` : "It clears at the start of the caster's next turn."}</p>
      <div class="arn-area-tools">
        <button type="button" class="arn-area-target" data-uuid="${area.uuid}"><i class="fa-solid fa-crosshairs"></i> Target creatures inside</button>
        <button type="button" class="arn-area-remove" data-uuid="${area.uuid}"><i class="fa-solid fa-eraser"></i> Remove area</button>
      </div></div>`
  });
}

async function onTarget(btn) {
  const area = await fromUuid(btn.dataset.uuid).catch(() => null);
  if (!area) return ui.notifications.warn("That area has gone.");
  const inside = creaturesIn(area);
  targetAll(inside);
  ui.notifications.info(inside.length ? `Targeting ${inside.map(t => t.name).join(", ")}.` : "Nobody is inside.");
}

async function onRemove(btn) {
  const area = await fromUuid(btn.dataset.uuid).catch(() => null);
  if (!area) return;
  if (!area.isOwner) return ui.notifications.warn("Ask the GM to remove it.");
  await area.delete();
}

/* -------------------------------------------- */
/*  Turns (GM)                                  */
/* -------------------------------------------- */

// Foundry 14 deprecates scene.templates, so it's read only on 13.
const areasOn = scene => [...(scene.regions?.contents ?? []), ...(canvas.regions?.placeRegion ? [] : (scene.templates?.contents ?? []))].filter(a => a.flags?.[SYS]?.area);

async function onTurn(combat) {
  const scene = combat.scene ?? canvas?.scene;
  const c = combat.combatant;
  if (!scene || !c) return;
  // The caster's instant areas go at the start of their next turn.
  const mine = areasOn(scene).filter(a => {
    const f = a.flags[SYS].area;
    // Not on the turn it was placed: placed on the caster's own turn, it lasts until their next one.
    const sameTurn = f.combat === combat.id && f.round === combat.round && f.turn === combat.turn;
    return f.instant && f.actor === c.actor?.uuid && !sameTurn;
  });
  // Lingering areas whose duration has run out (counted from the turn they were placed).
  const done = areasOn(scene).filter(a => {
    const f = a.flags[SYS].area, e = f.expires;
    return f.lingering && e && f.combat === combat.id && (combat.round > e.round || (combat.round === e.round && combat.turn >= e.turn));
  });
  for (const a of [...mine, ...done]) await a.delete().catch(() => null);
  // Starting a turn in a lingering area.
  const tok = c.token;
  if (!tok?.actor) return;
  for (const a of areasOn(scene)) {
    const f = a.flags[SYS].area;
    if (!f.lingering || !(f.save || f.formula) || !tokenInside(a, tok)) continue;
    const caster = await fromUuid(f.actor).catch(() => null);
    await auraCard(tok, { name: caster?.name ?? "a", id: "" }, { def: { name: f.spell }, dc: f.dc },
      { save: f.save, dc: f.dc, formula: f.formula, type: f.dtype, half: f.half, text: `Use these if ${f.spell} acts on a creature that starts its turn inside.` });
  }
}

/* -------------------------------------------- */

export function registerAreas() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const on = (sel, fn) => html.querySelectorAll(sel).forEach(el => el.addEventListener("click", ev => { ev.preventDefault(); fn(el); }));
    on(".arn-place-area", onPlace);
    on(".arn-area-target", onTarget);
    on(".arn-area-remove", onRemove);
  });
  Hooks.on("updateCombat", (combat, changed, options) => {
    if (!isGM() || options?.direction === -1 || !("turn" in changed || "round" in changed)) return;
    onTurn(combat).catch(err => console.warn("Arneyan | area turn", err));
  });
}

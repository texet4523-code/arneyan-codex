/**
 * Tokens follow the sheet, PF2e style:
 * - Size: changing a creature's size sets its token's width and height (Tiny ½, Small and Medium 1,
 *   Large 2, Huge 3, Gargantuan 4).
 * - Vision: tokens see what the creature's senses say. Darkvision 60ft gives 60ft darkvision, Low-Light Vision
 *   light amplification, and Truesight, Blindsight and Tremorsense their detection modes. The party token sees
 *   as far as the best-sighted member and shares every member's special senses.
 * Vision is worked out each time a token is prepared (nothing is saved), so it suits Foundry 13 and 14 alike and
 * covers monsters imported before senses were added. A longer range typed into a token's settings still wins.
 */
import { ARNEYAN } from "./config.mjs";
import { activeParty, partyMembers } from "./party.mjs";

const SYS = "arneyan";

/** Senses Foundry can draw, as detection modes: Truesight sees everything, Blindsight senses everything, Tremorsense feels movement. */
export const DETECTION = { truesight: "seeAll", blindsight: "senseAll", tremorsense: "feelTremor" };

/** The creature's best dark-seeing sense, in feet (Darkvision or Truesight). */
export function sensesRange(senses) {
  let range = 0;
  for (const s of senses ?? []) for (const m of String(s).matchAll(/\b(?:darkvision|truesight)\s*(\d+)/gi)) range = Math.max(range, Number(m[1]));
  return range;
}

/**
 * What a creature's tokens should see: { range, mode, detect }.
 * Darkvision N: "darkvision" mode out to N. Low-Light Vision: "lightAmplification" (sees dim light as bright, needs light).
 * Truesight, Blindsight and Tremorsense: detection modes with their ranges.
 */
export function visionFrom(senses) {
  const range = sensesRange(senses);
  const text = (senses ?? []).join(" ");
  const detect = [];
  for (const [word, id] of Object.entries(DETECTION)) {
    const m = text.match(new RegExp(`\\b${word}\\s*(\\d+)`, "i"));
    if (m) detect.push({ id, range: Number(m[1]), enabled: true });
  }
  const mode = range ? "darkvision" : /low[- ]?light/i.test(text) ? "lightAmplification" : "basic";
  return { range, mode, detect };
}

/** One member's sight for the party token: what the senses give, or a longer range set by hand. */
function memberVision(m) {
  const v = visionFrom(m.system?.traits?.senses);
  const s = m.prototypeToken?._source?.sight ?? m.prototypeToken?.sight;
  const auto = m.flags?.[SYS]?.autoVision;
  if (!s?.enabled || (s.range ?? 0) <= v.range || s.range === auto) return v;
  const mode = v.mode !== "basic" ? v.mode : (s.visionMode || "basic");
  return { ...v, range: s.range, mode };
}

export function visionFor(actor) {
  if (actor?.type === "party") {
    // The best member's sight, and every special sense any member has.
    let best = { range: 0, mode: "basic", detect: [] };
    const detect = new Map();
    for (const m of partyMembers()) {
      const v = memberVision(m);
      if (v.range > best.range || (best.mode === "basic" && v.mode !== "basic" && v.range >= best.range)) best = { range: v.range, mode: v.mode, detect: [], from: m.name };
      for (const d of v.detect) if ((detect.get(d.id) ?? 0) < d.range) detect.set(d.id, d.range);
    }
    best.detect = [...detect].map(([id, range]) => ({ id, range, enabled: true }));
    return best;
  }
  return visionFrom(actor?.system?.traits?.senses);
}

/**
 * Put what the senses give onto a token's prepared data (nothing is saved). Works with Foundry 13's
 * list of detection modes and Foundry 14's detection modes keyed by id.
 * @param {object} token  The token's prepared data ({ sight, detectionModes }).
 * @param {{range:number, mode:string, detect:object[]}} want  From visionFor.
 * @param {{range?:number, visionMode?:string}} base  The token's own saved sight (a longer range set by hand wins).
 * @param {object} [defaults]  Vision mode defaults (saturation and the like) for a mode we switch on.
 */
export function applyVision(token, want, base = {}, defaults = {}) {
  const sight = token.sight;
  sight.enabled = true;
  const range = Math.max(Number(base.range) || 0, want.range);
  sight.range = range;
  // A vision mode chosen by hand stays; otherwise the senses pick it.
  if ((base.visionMode || "basic") === "basic") {
    sight.visionMode = want.mode;
    if (want.mode !== "basic") for (const [k, v] of Object.entries(defaults ?? {})) if (v !== undefined && k in sight) sight[k] = v;
  }
  // Only finite ranges are raised: an unlimited one (null or Infinity) stays unlimited.
  const raise = (m, r) => { if (typeof m.range === "number" && Number.isFinite(m.range) && m.range < r) m.range = r; };
  let dm = token.detectionModes;
  if (Array.isArray(dm)) {
    for (const d of want.detect) {
      const ex = dm.find(m => m.id === d.id);
      if (ex) { ex.enabled = true; raise(ex, d.range); } else dm.push({ id: d.id, enabled: true, range: d.range });
    }
    const basic = dm.find(m => m.id === "basicSight");
    if (basic) raise(basic, range);
  } else {
    if (!dm || typeof dm !== "object") dm = token.detectionModes = {};
    for (const d of want.detect) {
      const ex = dm[d.id];
      if (ex) { ex.enabled = true; raise(ex, d.range); } else dm[d.id] = { enabled: true, range: d.range };
    }
    if (dm.basicSight) raise(dm.basicSight, range);
  }
  return token;
}

/** The token's own saved sight, ignoring what older versions of the system wrote there for it. */
function savedSight(doc) {
  const s = doc._source?.sight ?? {};
  const auto = doc.actor?.flags?.[SYS]?.autoVision;
  return auto != null && s.range === auto ? { range: 0, visionMode: "basic" } : { range: s.range ?? 0, visionMode: s.visionMode || "basic" };
}

function autoOn() {
  try { return game.settings.get(SYS, "autoVision") !== false; } catch { return false; }
}

/**
 * Token documents work out their vision from the creature's senses whenever they're prepared, so a dwarf's
 * Darkvision, a goblin's, and the party's best member's show up without anything being saved, on every client.
 */
export function visionTokenClass(Base) {
  return class ArneyanTokenDocument extends Base {
    prepareBaseData() {
      this._arnDone = false;
      super.prepareBaseData();
      // Foundry versions that don't prepare detection modes here still get the senses.
      if (!this._arnDone) this._arnVision();
    }
    _prepareDetectionModes() {
      this._arnVision();
      return super._prepareDetectionModes?.();
    }
    _arnVision() {
      this._arnDone = true;
      try {
        if (!autoOn()) return;
        const actor = this.actor;
        if (!actor || !["character", "npc", "party"].includes(actor.type)) return;
        const want = visionFor(actor);
        const defaults = CONFIG.Canvas?.visionModes?.[want.mode]?.vision?.defaults ?? {};
        applyVision(this, want, savedSight(this), defaults);
      } catch (err) { console.warn("Arneyan | token vision", err); }
    }
  };
}

/** Prepare tokens on the scene in view again and redraw what they see ("all", an actor, or a token's actor). */
export function refreshVision(actor) {
  const scene = canvas?.ready ? canvas.scene : null;
  if (!scene || !actor) return;
  const tokens = actor === "all" ? scene.tokens.contents
    : actor.isToken ? [actor.token].filter(t => t?.parent === scene)
    : scene.tokens.filter(t => t.actorId === actor.id);
  if (!tokens.length) return;
  for (const t of tokens) {
    // Linked tokens start again from their saved data; an unlinked one is prepared again in place, which keeps
    // its own copy of the creature (and any sheet open on it).
    try { if (t.actorLink) t.reset(); else t.prepareData(); t.object?.initializeSources?.(); } catch (err) { console.warn("Arneyan | token vision", err); }
  }
  canvas.perception?.update?.({ initializeVision: true, refreshVision: true, refreshLighting: true });
}

async function updateTokens(tokens, data) {
  const byScene = new Map();
  for (const t of tokens) {
    const list = byScene.get(t.parent) ?? [];
    list.push({ _id: t.id, ...(typeof data === "function" ? data(t) : data) });
    byScene.set(t.parent, list);
  }
  for (const [scene, updates] of byScene) await scene.updateEmbeddedDocuments("Token", updates).catch(err => console.warn("Arneyan | token update", err));
}

/** Token width and height for a size. */
export function tokenSize(size) {
  return ARNEYAN.tokenSizes[size] ?? null;
}

/** Make a creature's tokens match its size. */
export async function syncSize(actor) {
  if (!actor || actor.pack || !game.settings.get(SYS, "autoTokenSize")) return;
  const n = tokenSize(actor.system?.details?.size);
  if (!n) return;
  const dims = { width: n, height: n };
  if (actor.isToken) {
    const t = actor.token;
    if (t && (t.width !== n || t.height !== n)) await t.update(dims);
    return;
  }
  if (actor.prototypeToken.width !== n || actor.prototypeToken.height !== n) await actor.update({ "prototypeToken.width": n, "prototypeToken.height": n });
  // Linked tokens, and unlinked ones that haven't been given a size of their own.
  const tokens = game.scenes.contents.flatMap(s => s.tokens.filter(t => t.actorId === actor.id && (t.actorLink || t.actor?.system?.details?.size === actor.system.details.size)));
  await updateTokens(tokens.filter(t => t.width !== n || t.height !== n), dims);
}

/* -------------------------------------------- */

const pending = new Map();
/** Redraw an actor's vision once things settle (every client, for its own view); the party follows its members. */
function schedule(actor) {
  if (!actor) return;
  const key = actor === "all" ? "all" : actor.uuid;
  clearTimeout(pending.get(key));
  pending.set(key, setTimeout(() => {
    pending.delete(key);
    refreshVision(actor);
    if (actor !== "all" && actor.type === "character") {
      const party = activeParty();
      if (party) refreshVision(party);
    }
  }, 150));
}

/* -------------------------------------------- */
/*  Numbered duplicates                         */
/* -------------------------------------------- */

const NUMBERED = /^(.*\S)\s+\((\d+)\)$/;
/** A token's name without its number: "Goblin (2)" is a Goblin. */
export const baseName = name => { const m = String(name ?? "").match(NUMBERED); return m ? m[1] : String(name ?? ""); };
const numberOf = name => Number(String(name ?? "").match(NUMBERED)?.[2]) || 0;

/**
 * Names for monsters of the same kind on one scene (Kieran, 22 Oct 2026: "multiple of the same enemies can be called
 * Goblin (1) for dupes to help me keep track better in combat"). `tokens`: [{ id, name, base, order }] for one scene's
 * unlinked monster tokens, where `base` is the name its actor gives its tokens. A token whose name is its base (or its
 * base with a number) is counted; one the GM renamed is left alone. A kind with two or more gets numbers: those already
 * numbered keep theirs, the rest take the next free numbers in the order they were placed (`order`, then `idx`, the
 * scene's order). Returns [{ id, name }] to change.
 */
export function duplicateNames(tokens) {
  const groups = new Map();
  for (const t of tokens) {
    const base = String(t.base ?? "").trim();
    if (!base || baseName(t.name) !== base) continue;
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(t);
  }
  const out = [];
  for (const [base, list] of groups) {
    if (list.length < 2) continue;
    // The first token (in placing order) with a number keeps it; a second with the same number (a copied token) and
    // those without one take the next free numbers.
    const sorted = [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.idx ?? 0) - (b.idx ?? 0));
    const kept = new Set();
    for (const t of sorted) { const n = numberOf(t.name); if (n && !kept.has(n)) { kept.add(n); t._keep = true; } }
    const used = new Set(kept);
    let next = 1;
    for (const t of sorted) {
      if (t._keep) continue;
      while (used.has(next)) next++;
      used.add(next);
      const name = `${base} (${next})`;
      if (name !== t.name) out.push({ id: t.id, name });
    }
  }
  return out;
}

const numbering = new Map();
/** Number a scene's duplicate monsters (the active GM's client, a moment after tokens arrive). */
function scheduleNumbering(scene) {
  if (!scene || !game.users.activeGM?.isSelf) return;
  let on = true;
  try { on = game.settings.get(SYS, "numberDuplicates"); } catch { /* default */ }
  if (!on) return;
  clearTimeout(numbering.get(scene.id));
  numbering.set(scene.id, setTimeout(async () => {
    numbering.delete(scene.id);
    // (In the order they were placed: tokens have no creation time, but the scene keeps them in that order.)
    const list = scene.tokens.contents.map((t, i) => ({ t, i })).filter(({ t }) => !t.actorLink && t.actor?.type === "npc").map(({ t, i }) => ({
      id: t.id, name: t.name, order: t._stats?.createdTime ?? Number.MAX_SAFE_INTEGER, idx: i,
      base: baseName(game.actors.get(t.actorId)?.prototypeToken?.name || t.actor?.name || "")
    }));
    const upd = duplicateNames(list).map(({ id, name }) => ({ _id: id, name }));
    if (upd.length) await scene.updateEmbeddedDocuments("Token", upd).catch(err => console.warn("Arneyan | numbering", err));
  }, 300));
}

export function registerTokens() {
  game.settings.register(SYS, "numberDuplicates", {
    name: "Number duplicate monsters", hint: "When a scene has two or more of the same monster, their tokens are named Goblin (1), Goblin (2) and so on, in the order they were placed. A token you rename yourself is left alone.",
    scope: "world", config: true, type: Boolean, default: true
  });
  Hooks.on("createToken", token => scheduleNumbering(token.parent));
  game.settings.register(SYS, "autoVision", {
    name: "Token vision follows senses", hint: "Tokens see in the dark as far as the creature's Darkvision (or Truesight), and get Low-Light Vision, Blindsight, Tremorsense and Truesight from its senses. The party token sees as far as its best-sighted member. Turn this off to set every token's vision by hand.",
    scope: "world", config: true, type: Boolean, default: true, onChange: () => schedule("all")
  });
  game.settings.register(SYS, "autoTokenSize", {
    name: "Token size follows creature size", hint: "Changing a creature's size on its sheet resizes its tokens.",
    scope: "world", config: true, type: Boolean, default: true
  });

  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (userId === game.user.id && foundry.utils.hasProperty(changes, "system.details.size")) syncSize(actor).catch(err => console.warn("Arneyan | size", err));
    // Senses live in the details (and items and effects, below); HP changes in a fight don't redraw vision.
    if (foundry.utils.hasProperty(changes, "system.details") || "prototypeToken" in changes || "system" in changes && actor.type === "party") schedule(actor);
    // Joining or leaving the party folder changes the party's sight.
    if ("folder" in changes && actor.type === "character") { const p = activeParty(); if (p) schedule(p); }
  });
  for (const hook of ["createItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(hook, doc => { if (doc.parent instanceof Actor) schedule(doc.parent); });
  }
  // An item can grant a sense once it's equipped or switched on; spending arrows or charges can't.
  Hooks.on("updateItem", (item, changes) => {
    if (!(item.parent instanceof Actor)) return;
    const sys = changes.system ?? {};
    if (item.type === "ancestry" || "rules" in sys || "equipped" in sys || "active" in sys) schedule(item.parent);
  });
  Hooks.on("createActor", actor => {
    if (actor.type === "character") { schedule(actor); const p = activeParty(); if (p) schedule(p); }
  });
  Hooks.on("deleteActor", actor => {
    if (actor.type === "character") { const p = activeParty(); if (p) schedule(p); }
  });
  // Tokens are first prepared before every actor is ready, and other scenes' tokens go stale: prepare the
  // tokens in view again each time a scene is drawn.
  Hooks.on("canvasReady", () => schedule("all"));
}

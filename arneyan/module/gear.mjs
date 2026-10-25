/**
 * Gear that does things (Drop 1): ammunition, consumables, wand and staff charges, light sources,
 * spell scrolls, and Luck for alignment deeds. Rules from the Codex (Carrying), the Catalogue
 * (magic item rules, Illuminations), Spellcasting in Arneyan (Spellbooks & Scrolls) and Character
 * Creation (Recovering Luck).
 */
import { areaButton } from "./areas.mjs";
import { TOUCH_ATTACK } from "./touch.mjs";
import { ARNEYAN } from "./config.mjs";
import { publicName } from "./expand.mjs";
import { damageRoll, resolveFormula } from "./rolls.mjs";
import { effectDataFor, applyEffectTo, startConcentration } from "./effects.mjs";
import { tagDamage, show3d } from "./dsn.mjs";

const { DialogV2 } = foundry.applications.api;
const SYS = "arneyan";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const say = (actor, html) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card">${html}</div>` });

/* -------------------------------------------- */
/*  Ammunition                                  */
/* -------------------------------------------- */

/** The stack a weapon fires from: the chosen one, else the first of the right kind with some left. */
export function ammoFor(actor, weapon) {
  const kind = weapon?.system?.ammoType;
  if (!actor || !kind) return null;
  const fits = i => i.type === "equipment" && i.system.ammoType === kind && i.system.quantity > 0;
  const chosen = weapon.system.ammoId ? actor.items.get(weapon.system.ammoId) : null;
  if (chosen && fits(chosen)) return chosen;
  // Plain ammunition first; silver and magic only when chosen or when nothing else is left.
  const special = i => /silver|\+\d/i.test(i._source?.name ?? i.name);
  const all = actor.items.filter(fits).sort((a, b) => special(a) - special(b));
  return all[0] ?? null;
}

/** Spend one piece of ammunition; returns the stack it came from (or null and a warning if there's none). */
export async function spendAmmo(actor, weapon) {
  if (!weapon?.system?.ammoType || actor?.type !== "character") return { ok: true, ammo: null };
  const ammo = ammoFor(actor, weapon);
  if (!ammo) {
    ui.notifications.warn(`${actor.name} has no ${weapon.system.ammoType}s left for ${weapon.name}.`);
    return { ok: false, ammo: null };
  }
  await ammo.update({ "system.quantity": ammo.system.quantity - 1 });
  if (ammo.system.quantity <= 0) ui.notifications.info(`${actor.name}'s last ${ammo.name} is gone.`);
  return { ok: true, ammo };
}

/* -------------------------------------------- */
/*  Using equipment                             */
/* -------------------------------------------- */

/** What happens when someone uses a piece of equipment from their sheet. */
export async function useEquipment(item, event) {
  const s = item.system;
  // Unidentified gear a player tries (a wand, a staff, a potion): the GM says what happens, so nothing on screen names
  // it (T130, 25 Oct 2026). An unknown scroll keeps its own rule (a check to read it, below). The GM's use is as usual.
  if (s.identified === false && !game.user.isGM && !s.scroll?.spell) {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: item.actor }), content: `<p>${foundry.utils.escapeHTML(item.actor?.name ?? "")} tries to use ${foundry.utils.escapeHTML(publicName(item))}. The GM says what happens.</p>` });
    return ui.notifications.info(`${publicName(item)} is unidentified: the GM decides what happens when you use it.`);
  }
  if (s.scroll?.spell) return readScroll(item, event);
  if (blankScrollLevel(item) !== null) return inscribeScroll(item);
  // A wand or staff that casts spells: pick one (or the only one).
  if (s.itemSpells?.length) {
    if (s.itemSpells.length === 1) return castFromItem(item, s.itemSpells[0].name);
    const pick = await DialogV2.wait({
      window: { title: item.name }, classes: ["arneyan"],
      content: `<p>${s.charges?.max ? `${s.charges.value} of ${s.charges.max} charges left. ` : ""}Which spell?</p>`,
      buttons: [...s.itemSpells.map(e => ({ action: e.name, label: `${e.name} (${e.cost})`, icon: "fa-solid fa-wand-sparkles" })), { action: "cancel", label: "Cancel" }],
      rejectClose: false
    });
    return pick && pick !== "cancel" ? castFromItem(item, pick) : null;
  }
  // A torch, lantern or Sunrod: using it lights it (or puts it out).
  if (s.light?.bright || s.light?.dim) return toggleLight(item);
  if (s.charges?.max > 0) return useCharges(item);
  if (s.consumable?.use) return consume(item);
  return item.toChat();
}

/** Take one off the stack; the last one goes from the sheet. */
async function useUp(item, n = 1) {
  const left = (item.system.quantity ?? 1) - n;
  if (left > 0) return item.update({ "system.quantity": left });
  return item.delete();
}

/** Potions, oils, poisons, flasks: apply what they do, then one is gone. */
export async function consume(item) {
  const actor = item.actor;
  if (!actor) return item.toChat();
  if ((item.system.quantity ?? 1) <= 0) return ui.notifications.warn(`${actor.name} has no ${item.name} left.`);
  const cl = actor.system.level ?? 1;
  const self = await item._applySelf(cl);
  const lines = [];
  if (self.length) lines.push(`<p class="arn-card-meta">On ${esc(actor.name)}: ${self.map(e => esc(e.name)).join(", ")}</p>`);
  lines.push(item._actionButtons({ cl }));
  await item.toChat(lines.join(""));
  // Healing: rolled once and taken by the one who uses it.
  if (item.system.consumable.heal) {
    const roll = await new Roll(resolveFormula(item.system.consumable.heal, actor.getRollData?.() ?? {})).evaluate();
    const formula = roll.formula;
    tagDamage(roll, "healing");
    const r = await actor.applyDamage(roll.total, { mult: -1 });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls: [roll],
      content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-heart"></i> <span>${esc(item.name)}</span></header><p>Rolled ${esc(formula)}: <strong>${roll.total}</strong>. ${esc(r.text)}.</p></div>` });
  }
  return useUp(item);
}

/** Wands and staffs: spend charges; at 0, roll a d20 and on a 1 it crumbles to dust (Catalogue, magic item rules). */
export async function useCharges(item) {
  const actor = item.actor;
  const c = item.system.charges;
  if (c.value <= 0) return ui.notifications.warn(`${item.name} has no charges left.`);
  let spend = 1;
  if (c.value > 1) {
    spend = await DialogV2.prompt({
      window: { title: `Use ${item.name}` }, classes: ["arneyan"],
      content: `<p>${c.value} of ${c.max} charges left. Some powers cost more than one (see the item).</p>
        <div class="form-group"><label>Charges to spend</label><input type="number" name="n" value="1" min="1" max="${c.value}" autofocus></div>`,
      ok: { label: "Use", callback: (e, b) => Math.clamp(Number(b.form.elements.n.value) || 1, 1, c.value) },
      rejectClose: false
    }).catch(() => null);
    if (!spend) return;
  }
  await item.toChat(`<p class="arn-card-meta">${spend} charge${spend === 1 ? "" : "s"} spent · ${c.value - spend} of ${c.max} left</p>`);
  await spendCharges(item, spend);
}

/** Dawn (a long rest): staffs and other rechargeable items regain charges. */
export async function rechargeAtDawn(actor) {
  const lines = [];
  for (const i of actor.items.filter(i => i.type === "equipment" && i.system.charges?.recharge && i.system.charges.value < i.system.charges.max)) {
    let r = null;
    try { r = await new Roll(String(i.system.charges.recharge)).evaluate(); } catch { r = null; }
    if (!r) continue;
    show3d(r);
    const before = i.system.charges.value;
    const value = Math.min(i.system.charges.max, before + r.total);
    await i.update({ "system.charges.value": value });
    lines.push(`${i.name} regains ${value - before} charge${value - before === 1 ? "" : "s"} (${value}/${i.system.charges.max})`);
  }
  return lines;
}

/* -------------------------------------------- */
/*  Light                                       */
/* -------------------------------------------- */

const LIGHT = { color: "#ff9b3d", alpha: 0.35, animation: { type: "torch", speed: 3, intensity: 3 } };

/** The actor's tokens show the brightest lit light source it carries; with none lit, the token's own light comes back. */
export async function syncLight(actor) {
  if (!actor) return;
  // Lit torches and lanterns, and weapons whose mode gives light (a Flame Tongue ignited).
  const lit = [
    ...actor.items.filter(i => i.type === "equipment" && i.system.light?.lit).map(i => i.system.light),
    ...actor.items.filter(modeLit).map(i => ({ bright: i.system.modeLight, dim: i.system.modeLight, angle: 360 }))
  ];
  const best = lit.reduce((b, l) => (Math.max(l.bright, l.dim) > Math.max(b.bright, b.dim) ? l : b), { bright: 0, dim: 0 });
  const proto = actor.isToken ? actor.token?.light : actor.prototypeToken?.light;
  let saved = actor.getFlag?.(SYS, "baseLight");
  // Remember the light the token had before a torch was lit, to give it back afterwards.
  if (lit.length && !saved && actor.isOwner) {
    saved = { bright: proto?.bright ?? 0, dim: proto?.dim ?? 0, angle: proto?.angle ?? 360, color: proto?.color ?? null, alpha: proto?.alpha ?? 0.5, animation: proto?.animation?.toObject?.() ?? proto?.animation ?? {} };
    await actor.setFlag(SYS, "baseLight", saved);
  }
  let data;
  if (lit.length) data = { "light.bright": best.bright, "light.dim": Math.max(best.dim, best.bright), "light.angle": best.angle || 360, "light.color": LIGHT.color, "light.alpha": LIGHT.alpha, "light.animation": LIGHT.animation };
  else if (saved) data = { "light.bright": saved.bright, "light.dim": saved.dim, "light.angle": saved.angle ?? 360, "light.color": saved.color, "light.alpha": saved.alpha, "light.animation": saved.animation };
  else return;
  const tokens = actor.isToken ? [actor.token] : actor.getActiveTokens(true, true);
  for (const t of tokens) if (t?.isOwner) await t.update(data).catch(() => null);
  if (!actor.isToken && actor.isOwner) {
    await actor.update(Object.fromEntries(Object.entries(data).map(([k, v]) => [`prototypeToken.${k}`, v]))).catch(() => null);
  }
  if (!lit.length && saved && actor.isOwner) await actor.unsetFlag(SYS, "baseLight");
}

/** A weapon whose mode is on and gives light, in hand (not packed away). */
function modeLit(i) {
  return i.type === "weapon" && i.system.toggle && i.system.active && i.system.modeLight > 0 && !i.system.inside;
}

/** Switch a weapon's mode on or off (ignite a Flame Tongue): its mode damage counts while on, and it may give light. */
export async function toggleMode(item) {
  if (item?.type !== "weapon" || !item.system.toggle) return;
  const on = !item.system.active;
  await item.update({ "system.active": on });
  const label = item.system.modeLabel || "On";
  say(item.actor, `<p>${esc(item.actor?.name ?? "")}'s ${esc(item.name)}: ${on ? esc(label) : `no longer ${esc(label.toLowerCase())}`}.</p>`);
}

/*
 * Burn timers. A light with a burn time (hours > 0) keeps the seconds it has left in system.light.left (null: the
 * full burn time). The world setting "Light sources burn in" picks how it burns down:
 * - Game time: `left` is what it had when it was lit (litAt, world seconds); time left is left - (now - litAt).
 * - Real time: the active GM's client takes a minute off `left` every minute the world is open and not paused.
 * Putting a light out keeps what it has left; a one-use light (a torch, a candle, a Sunrod) is used up when it
 * burns out, anything else (a lantern) just goes out. The owner is told once when it gets to 10 minutes.
 */
const HOUR = 3600;
const WARN_AT = 600;
const REAL_TICK = 60;

/** "game" or "real": what light sources burn in (the world setting). */
export function burnMode() {
  try { return game.settings.get(SYS, "lightBurn") === "real" ? "real" : "game"; } catch { return "game"; }
}

/** Seconds of burn a light has left right now: Infinity for one that burns until put out. */
export function lightLeft(light, { mode = burnMode(), now = game.time?.worldTime ?? 0 } = {}) {
  const l = light ?? {};
  if (!(Number(l.hours) > 0)) return Infinity;
  let left = typeof l.left === "number" && Number.isFinite(l.left) ? l.left : l.hours * HOUR;
  if (l.lit && mode === "game") left -= Math.max(0, now - (Number(l.litAt) || 0));
  return Math.max(0, left);
}

/** "45 min left", "5 h 30 min left", "under a minute left", "burnt out"; blank for a light with no burn time. */
export function lightLeftLabel(seconds) {
  if (!Number.isFinite(seconds)) return "";
  if (seconds <= 0) return "burnt out";
  if (seconds < 60) return "under a minute left";
  const m = Math.ceil(seconds / 60);
  if (m < 60) return `${m} min left`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} h${r ? ` ${r} min` : ""} left`;
}

/** What a light shows on the sheet and in its tooltip. */
export function lightInfo(light, opts) {
  const l = light ?? {};
  const left = lightLeft(l, opts);
  const timed = Number.isFinite(left);
  const real = (opts?.mode ?? burnMode()) === "real";
  const full = timed ? l.hours * HOUR : 0;
  return {
    timed, left, label: lightLeftLabel(left), lit: !!l.lit, low: timed && left <= WARN_AT, out: timed && left <= 0,
    used: timed && left < full, hours: timed ? Math.round((left / HOUR) * 100) / 100 : 0,
    tip: !timed ? "Burns until put out" : `Burns ${l.hours} hour${l.hours === 1 ? "" : "s"} of ${real ? "real time while the game isn't paused" : "game time"}: ${lightLeftLabel(left)}`
  };
}

/** The update that puts a light out, keeping the burn it has left. */
export function putOutData(light, opts) {
  const left = lightLeft(light, opts);
  return { "system.light.lit": false, "system.light.litAt": 0, ...(Number.isFinite(left) ? { "system.light.left": Math.round(left) } : {}) };
}

/** Light or put out a torch, lantern or Sunrod. */
export async function toggleLight(item) {
  const l = item.system.light;
  if (!(l.bright || l.dim)) return ui.notifications.warn(`${item.name} has no light radius set. Add one on its sheet (Light).`);
  const on = !l.lit;
  const left = lightLeft(l);
  if (on && left <= 0) return ui.notifications.warn(`${item.name} has burned out. The GM can give it more time on its sheet (Light).`);
  await item.update(on ? { "system.light.lit": true, "system.light.litAt": game.time.worldTime, ...(left > WARN_AT ? { "system.light.warned": false } : {}) } : putOutData(l));
  await syncLight(item.actor);
  const label = lightLeftLabel(left);
  say(item.actor, `<p>${esc(item.actor?.name ?? "")} ${on ? "lights" : "puts out"} ${esc(item.name)}${label ? ` (${label})` : ""}.</p>`);
}

/** The GM sets how long a light has left (seconds; null: back to its full burn time). */
export async function setLightLeft(item, seconds) {
  const l = item.system.light;
  const left = seconds === null ? null : Math.max(0, Math.round(Number(seconds) || 0));
  const now = left ?? (l.hours || 0) * HOUR;
  return item.update({ "system.light.left": left, ...(l.lit ? { "system.light.litAt": game.time.worldTime } : {}), ...(now > WARN_AT ? { "system.light.warned": false } : {}) });
}

const timedLit = i => i.type === "equipment" && i.system.light?.lit && i.system.light.hours > 0;

/** A raw item (source data) that is a lit light on a timer. */
const rawTimedLit = i => i?.type === "equipment" && i.system?.light?.lit && Number(i.system.light.hours) > 0;

/**
 * The actors that may carry a lit light on a timer: every world actor, and only those unlinked tokens whose own
 * items (the token's changes) or base actor have one. A token's actor is only built when it might, so a big world
 * with hundreds of monster tokens doesn't build them all on every tick of the clock.
 */
export function lightActors() {
  const out = [...(game.actors?.contents ?? [])];
  const baseLit = new Set(out.filter(a => a.items?.some?.(timedLit)).map(a => a.id));
  for (const scene of game.scenes ?? []) {
    for (const t of scene.tokens ?? []) {
      if (t.actorLink) continue;
      const delta = t._source?.delta?.items ?? t.delta?._source?.items ?? null;
      // The token's own copy of a light changed (lit, burning): it has a delta entry. Otherwise it shares the base's.
      const own = Array.isArray(delta) && delta.some(rawTimedLit);
      if (!own && !baseLit.has(t.actorId)) continue;
      const a = t.actor;
      if (a) out.push(a);
    }
  }
  return out;
}

/** One light's time is up, or nearly: out it goes (a torch is used up), or its owner is told. Returns true if it went out. */
async function settleLight(actor, i, left, { real = false } = {}) {
  const l = i.system.light;
  if (left <= 0) {
    const once = !!i.system.consumable?.use;
    // A one-use light is gone; what's left of the stack is fresh. A lantern keeps nothing.
    await i.update({ "system.light.lit": false, "system.light.litAt": 0, "system.light.left": once ? null : 0, "system.light.warned": false });
    say(actor, `<p>${esc(actor.name)}'s ${esc(i.name)} burns out${once ? "" : ". It needs more fuel before it will light again"}.</p>`);
    if (once) await useUp(i);
    return true;
  }
  const warn = left <= WARN_AT && !l.warned;
  const upd = { ...(real ? { "system.light.left": Math.round(left) } : {}), ...(warn ? { "system.light.warned": true } : {}) };
  if (Object.keys(upd).length) await i.update(upd);
  if (warn) {
    const whisper = game.users.filter(u => actor.testUserPermission?.(u, "OWNER") ?? u.isGM).map(u => u.id);
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper, content: `<div class="arn-card"><p><strong>${esc(actor.name)}</strong>: ${esc(i.name)} is nearly out (${lightLeftLabel(left)}).</p></div>` });
  }
  return false;
}

// One burn check at a time, in order (the game clock and the real-time tick both queue here).
let lightQueue = Promise.resolve();
const queued = fn => (lightQueue = lightQueue.then(fn).catch(err => console.warn("Arneyan | lights", err)));

/** Game time moves on: lights that have burned their time go out, nearly-out ones warn their owners. */
export function burnDown() {
  if (!game.users.activeGM?.isSelf || burnMode() !== "game") return lightQueue;
  return queued(() => burnLights(0));
}

/** Check every lit light: in real time, `seconds` of burn come off first. */
async function burnLights(seconds) {
  const mode = seconds > 0 ? "real" : "game";
  const now = game.time.worldTime;
  for (const actor of lightActors()) {
    const lit = actor.items.filter(timedLit);
    if (!lit.length) continue;
    let out = false;
    for (const i of lit) {
      const left = lightLeft(i.system.light, { mode, now }) - seconds;
      if (seconds > 0 || left <= WARN_AT) out = (await settleLight(actor, i, left, { real: seconds > 0 })) || out;
    }
    if (out) await syncLight(actor);
  }
}

// Real time: the last tick (ms), so a slow tick still counts the time that passed (at most two minutes).
let lastTick = null;
/** The real-time clock ticks (every minute on every client; only the active GM's burns). */
export function realTick(nowMs = Date.now(), { ignorePause = false } = {}) {
  const dt = lastTick === null ? 0 : Math.min(Math.max(0, (nowMs - lastTick) / 1000), REAL_TICK * 2);
  lastTick = nowMs;
  if ((game.paused && !ignorePause) || dt <= 0 || burnMode() !== "real" || !game.users.activeGM?.isSelf) return lightQueue;
  return queued(() => burnLights(dt));
}

/** Pausing counts the burn up to the pause; nothing burns while paused; unpausing starts the count again. */
export function onPauseGame(paused, nowMs = Date.now()) {
  if (paused) return realTick(nowMs, { ignorePause: true });
  lastTick = nowMs;
  return lightQueue;
}

/** The setting changes: lit lights carry on from the time they have left now. */
function switchBurnMode(mode) {
  lastTick = Date.now();
  if (!game.users.activeGM?.isSelf) return;
  const old = mode === "real" ? "game" : "real";
  return queued(async () => {
    const now = game.time.worldTime;
    for (const actor of lightActors()) for (const i of actor.items.filter(timedLit)) {
      await i.update({ "system.light.left": Math.round(lightLeft(i.system.light, { mode: old, now })), "system.light.litAt": now });
    }
  });
}

/** Game time moved on: open sheets showing a lit light show its new time left. */
function refreshLightSheets() {
  for (const app of foundry.applications.instances?.values?.() ?? []) {
    const doc = app.document;
    if (!app.rendered || !doc) continue;
    if ((doc.documentName === "Actor" && doc.items.some(timedLit)) || (doc.documentName === "Item" && timedLit(doc))) app.render();
  }
}

/** The item sheet's "Time left" box and reset button (GM). */
function wireLightTimer(app, element) {
  const item = app.document;
  if (item?.type !== "equipment" || !game.user.isGM) return;
  for (const input of element.querySelectorAll?.("input.arn-light-left") ?? []) {
    input.addEventListener("change", ev => {
      ev.stopPropagation();
      setLightLeft(item, (Number(input.value) || 0) * HOUR);
    });
  }
  for (const a of element.querySelectorAll?.("a.arn-light-reset") ?? []) {
    a.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); setLightLeft(item, null); });
  }
}

/* -------------------------------------------- */
/*  Spell scrolls                               */
/* -------------------------------------------- */

const SCROLL_IMG = "systems/arneyan/assets/icons/gear-scroll-unfurled.svg";

/** Write a scroll of a spell you know: 1 week and 100 gp a spell level (a cantrip, 1 day and 10 gp). */
export async function writeScroll(spell) {
  const actor = spell.actor;
  if (!actor?.isOwner || spell.type !== "spell") return;
  const lvl = spell.system.level;
  const cost = lvl ? 100 * lvl : 10;
  const time = lvl ? "1 week" : "1 day";
  const caster = spell.caster;
  const cl = caster?.classLevel ?? actor.system.level ?? 1;
  const dc = caster?.dc ?? actor.system.spellDC ?? 0;
  const gp = actor.system.currency?.gp ?? 0;
  const pay = await DialogV2.wait({
    window: { title: `Write a scroll: ${spell.name}` }, classes: ["arneyan"],
    content: `<p>Writing it takes <strong>${time}</strong> and <strong>${cost} gp</strong>${spell.system.costly ? " plus the spell's costly components" : ""}. You may write no more scrolls a month than your casting modifier (minimum 1).</p>
      <p class="arn-muted">The scroll keeps your caster level (${cl}) and save DC${dc ? ` (${dc})` : ""}.</p>`,
    buttons: [
      { action: "pay", label: `Write it and pay ${cost} gp`, icon: "fa-solid fa-coins", default: true },
      { action: "free", label: "Write it (paid already)", icon: "fa-solid fa-scroll" },
      { action: "cancel", label: "Cancel" }
    ],
    rejectClose: false
  });
  if (!["pay", "free"].includes(pay)) return;
  if (pay === "pay") {
    if (gp < cost) return ui.notifications.warn(`${actor.name} has ${gp} gp; the scroll needs ${cost} gp.`);
    await actor.update({ "system.currency.gp": gp - cost });
  }
  const spellData = spell.toObject();
  delete spellData._id;
  const [made] = await actor.createEmbeddedDocuments("Item", [{
    name: `Scroll of ${spell.name}`, type: "equipment", img: SCROLL_IMG,
    system: {
      description: spell.system.description, quantity: 1, slots: 1, price: lvl ? `${200 * lvl} gp` : "25 gp",
      consumable: { use: true, heal: "" }, scroll: { spell: spellData, cl, dc }, identified: true,
      source: { book: "phb", page: 0 }
    }
  }]);
  say(actor, `<p>${esc(actor.name)} writes ${esc(made?.name)} (${time}${pay === "pay" ? `, ${cost} gp` : ""}).</p>`);
}

/**
 * Read a scroll: no slot or components, but you must speak and gesture. Unidentified, it needs a casting-stat check
 * (Intelligence with none) against DC 10 + the spell's level, or it's wasted. It keeps its writer's caster level and DC;
 * one of unknown origin casts at caster level 2 × level − 1 (minimum 1) and DC 12 + level. Then it crumbles.
 */
export async function readScroll(item, event) {
  const actor = item.actor;
  const sp = item.system.scroll.spell;
  if (!actor || !sp) return item.toChat();
  if (actor.system.noCast) return ui.notifications.warn(`${actor.name} cannot cast right now.`);
  const lvl = Number(sp.system?.level) || 0;
  const cl = item.system.scroll.cl || Math.max(1, 2 * lvl - 1);
  const dc = item.system.scroll.dc || 12 + lvl;
  if (!item.system.identified) {
    const casters = actor.system.casters ?? [];
    const best = casters.length ? casters.reduce((a, b) => (b.mod > a.mod ? b : a)) : null;
    const ab = best?.ability ?? "int";
    const mod = actor.system.abilities?.[ab]?.mod ?? 0;
    const r = await new Roll(`1d20 + ${mod}`).evaluate();
    const ok = r.total >= 10 + lvl;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }), rolls: [r],
      content: `<div class="arn-card"><header class="arn-card-title">${esc(actor.name)} reads an unknown scroll</header><p>${esc(ARNEYAN.abilities[ab])} check: <strong>${r.total}</strong> against DC ${10 + lvl}. ${ok ? "The spell takes hold." : "The words slip away: the scroll is wasted."}</p></div>`
    });
    if (!ok) return useUp(item);
  }
  await castSpellCard(actor, sp, { cl, dc, from: "a scroll" });
  return useUp(item);
}

/**
 * Cast a spell from something other than a slot (a scroll, a wand, a staff): the chat card with its save,
 * damage and effect buttons, then the effects on the caster and concentration.
 */
export async function castSpellCard(actor, sp, { cl, dc, from }) {
  const data = { cl, level: actor.system.level ?? cl };
  const s = sp.system ?? {};
  const out = [`<p class="arn-card-meta">From ${esc(from)} · caster level ${cl}${s.save ? ` · DC ${dc}` : ""}</p>`];
  // A touch spell from a scroll or wand: an attack, not a save (touch.mjs); a cure heals an ally with neither.
  if (TOUCH_ATTACK.has(sp.name)) out.push(`<p class="arn-card-meta"><i class="fa-solid fa-hand-sparkles"></i> Touch spell: against an enemy roll d20 + BtH + casting modifier against its AC in place of the save (no save); an ally is touched automatically.</p>`);
  else if (s.save) {
    out.push(`<button type="button" class="arn-save-btn" data-save="${s.save}" data-dc="${dc}" data-source="${esc(sp.name)}" data-spell="1"><i class="fa-solid fa-shield-halved"></i> ${ARNEYAN.saveTypes[s.save]} save DC ${dc}</button>`);
    if (s.saveEffect) out.push(`<p class="arn-save-effect">On a save: ${esc(s.saveEffect)}</p>`);
  }
  if (s.damage) {
    const f = resolveFormula(s.damage, data).replace(/\s+/g, "");
    out.push(`<button type="button" class="arn-inline arn-inline-damage" data-formula="${esc(f)}" data-type="${esc(s.damageType ?? "")}" data-spell="${esc(sp.name)}"><i class="fa-solid fa-${s.damageType === "healing" ? "heart" : "burst"}"></i> ${s.damageType === "healing" ? "Roll healing" : "Roll damage"}: ${esc(f)}</button>`);
  }
  if (s.template?.type) out.push(areaButton(sp, { actor, dc, cl, formula: s.damage ? resolveFormula(s.damage, data).replace(/\s+/g, "") : "" }));
  (s.applies ?? []).forEach((e, i) => {
    if (e.target === "self") return;
    out.push(`<button type="button" class="arn-scroll-effect" data-index="${i}"><i class="fa-solid fa-wand-sparkles"></i> ${esc(e.name || sp.name)} on targets</button>`);
  });
  const description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(s.description ?? "", { rollData: data });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="arn-card"><header class="arn-card-title"><img src="${esc(sp.img)}" alt=""> <span>${esc(sp.name)}</span></header><div class="arn-card-desc">${description}</div>${out.join("")}</div>`,
    flags: { [SYS]: { scrollSpell: sp, scrollCl: cl, actorUuid: actor.uuid } }
  });
  // Effects the spell puts on its reader, and concentration if it needs it.
  const temp = new CONFIG.Item.documentClass(foundry.utils.deepClone(sp), { parent: actor });
  const created = [];
  for (const e of (s.applies ?? []).filter(x => x.target === "self")) created.push(...await applyEffectTo([actor], await effectDataFor(e, temp, { cl, caster: actor })));
  if (s.concentration) await startConcentration(actor, { name: sp.name, uuid: null }, created);
  return created;
}

/** An Arneyan spell by name, from the Spells compendium. */
export async function spellByName(name) {
  const pack = game.packs.get(`${SYS}.spells`);
  const idx = (await pack?.getIndex())?.find(e => e.name.toLowerCase() === String(name).toLowerCase());
  return idx ? pack.getDocument(idx._id) : null;
}

/** The wielder's best casting: its caster level and save DC (none for a non-caster). */
function wielderCasting(actor) {
  const casters = actor.system.casters ?? [];
  if (!casters.length) return null;
  return casters.reduce((a, b) => ((b.classLevel ?? 0) > (a.classLevel ?? 0) ? b : a));
}

/**
 * Cast one of a wand's or staff's spells: spend its charges (and, at 0, roll to see if it crumbles), then cast.
 * It casts at its own caster level if it has one; otherwise at the wielder's (a staff of the magi), or for a
 * non-caster at caster level 2 × level − 1 and DC 12 + level, as a scroll of unknown origin does.
 */
export async function castFromItem(item, spellName) {
  const actor = item.actor;
  const entry = (item.system.itemSpells ?? []).find(e => e.name === spellName);
  if (!actor || !entry) return;
  if (actor.system.noCast) return ui.notifications.warn(`${actor.name} cannot cast right now.`);
  const c = item.system.charges;
  if (c.max && c.value < entry.cost) return ui.notifications.warn(`${item.name} has ${c.value} charge${c.value === 1 ? "" : "s"}; ${entry.name} needs ${entry.cost}.`);
  const linked = entry.uuid ? await fromUuid(entry.uuid).catch(() => null) : null;
  const spell = linked?.type === "spell" ? linked : await spellByName(entry.name);
  if (!spell) return ui.notifications.warn(`${entry.name} isn't in the Spells compendium.`);
  const lvl = spell.system.level ?? 0;
  const own = wielderCasting(actor);
  const s = item.system;
  const cl = s.castLevel || own?.classLevel || s.nonCasterCl || Math.max(1, 2 * lvl - 1);
  const dc = s.castLevel ? 12 + lvl : own ? (own.dc ?? 12 + lvl) : (s.nonCasterDc || 12 + lvl);
  await castSpellCard(actor, spell.toObject(), { cl, dc, from: `${item.name} (${entry.cost} charge${entry.cost === 1 ? "" : "s"})` });
  if (c.max) await spendCharges(item, entry.cost);
}

/** Take charges off an item; at 0, a crumbling item rolls a d20 and is gone on a 1. */
async function spendCharges(item, spend) {
  const c = item.system.charges;
  if (!(spend > 0)) return;
  const left = Math.max(0, c.value - spend);
  await item.update({ "system.charges.value": left });
  if (left <= 0 && c.crumble) {
    const r = await new Roll("1d20").evaluate();
    const gone = r.total === 1;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: item.actor }), rolls: [r],
      content: `<div class="arn-card"><header class="arn-card-title">${esc(item.name)}: out of charges</header><p>d20: <strong>${r.total}</strong>. ${gone ? "It crumbles to dust." : "It holds together, empty."}</p></div>`
    });
    if (gone) await item.delete();
  }
}

/** A blank scroll's level from its name ("Scroll, 3rd level"; a cantrip is 0), or null if it isn't one. */
export function blankScrollLevel(item) {
  const n = item?._source?.name ?? item?.name ?? "";
  if (!/^scroll\b/i.test(n) || item.system?.scroll?.spell) return null;
  if (/cantrip/i.test(n)) return 0;
  const m = n.match(/(\d)(?:st|nd|rd|th) level/i);
  return m ? Number(m[1]) : null;
}

/** Say which spell a blank scroll holds: pick from the Spells compendium, up to the scroll's level. */
export async function inscribeScroll(item) {
  const max = blankScrollLevel(item);
  if (max === null) return ui.notifications.warn(`${item.name} isn't a blank scroll.`);
  const pack = game.packs.get(`${SYS}.spells`);
  const index = await pack?.getIndex({ fields: ["img", "system.level", "system.classes", "system.school"] });
  const list = (index?.contents ?? [...(index ?? [])]).filter(e => (e.system?.level ?? 0) <= max).sort((a, b) => (a.system.level - b.system.level) || a.name.localeCompare(b.name));
  if (!list.length) return ui.notifications.warn("No spells found in the Spells compendium.");
  // A compendium-style list: picture, name, level, school and classes; grouped by level; type to filter.
  let html = "";
  let lvl = -1;
  for (const e of list) {
    const l = e.system.level ?? 0;
    if (l !== lvl) { lvl = l; html += `<li class="arn-pick-head">${l ? `${ARNEYAN.spellLevels[l]} level` : "Cantrips"}</li>`; }
    const sub = [e.system.school, (e.system.classes ?? []).join(", ")].filter(Boolean).join(" · ");
    html += `<li class="arn-pick-row" data-name="${esc(e.name.toLowerCase())} ${esc(sub.toLowerCase())}"><label><input type="radio" name="spell" value="${e._id}">
      <img src="${esc(e.img)}" alt=""><span class="arn-pick-main"><strong>${esc(e.name)}</strong><span class="arn-pick-sub">${esc(sub)}</span></span></label></li>`;
  }
  const id = await DialogV2.prompt({
    window: { title: `Inscribe ${item.name}`, icon: "fa-solid fa-scroll" }, classes: ["arneyan", "arn-inscribe"],
    position: { width: 520 },
    content: `<p>Which spell is on it? Up to ${max ? `${ARNEYAN.spellLevels[max]} level` : "cantrips"}.</p>
      <input type="search" class="arn-inscribe-filter" placeholder="Type a name, school or class" autofocus>
      <ul class="arn-pick-list">${html}</ul>`,
    render: (event, dialog) => {
      const el = dialog.element ?? dialog;
      const box = el.querySelector(".arn-inscribe-filter");
      const rows = [...el.querySelectorAll(".arn-pick-row")];
      box?.addEventListener("keydown", ev => { if (ev.key === "Enter") ev.preventDefault(); });
      box?.addEventListener("input", () => {
        const q = box.value.trim().toLowerCase();
        for (const r of rows) r.hidden = !!q && !r.dataset.name.includes(q);
        for (const h of el.querySelectorAll(".arn-pick-head")) {
          let n = h.nextElementSibling, any = false;
          while (n && !n.classList.contains("arn-pick-head")) { if (!n.hidden) any = true; n = n.nextElementSibling; }
          h.hidden = !any;
        }
      });
      // Double-click a spell to inscribe it straight away.
      for (const r of rows) r.addEventListener("dblclick", () => el.querySelector('button[data-action="ok"]')?.click());
    },
    ok: { label: "Inscribe", icon: "fa-solid fa-feather", callback: (e, b) => b.form.querySelector("input[name=spell]:checked")?.value ?? "none" },
    rejectClose: false
  }).catch(() => null);
  if (id === "none") return ui.notifications.warn("Pick a spell from the list first.");
  if (!id) return;
  const spell = await pack.getDocument(id);
  if (!spell) return;
  const data = spell.toObject();
  delete data._id;
  const inscribed = { name: `Scroll of ${spell.name}`, "system.scroll.spell": data, "system.description": spell.system.description };
  // One scroll off a stack of blanks; the rest stay blank.
  if ((item.system.quantity ?? 1) > 1 && item.actor) {
    const copy = foundry.utils.mergeObject(item.toObject(), foundry.utils.expandObject({ ...inscribed, "system.quantity": 1 }));
    delete copy._id;
    await item.actor.createEmbeddedDocuments("Item", [copy]);
    await item.update({ "system.quantity": item.system.quantity - 1 });
  } else await item.update(inscribed);
  ui.notifications.info(`A scroll now holds ${spell.name}.`);
}

/** A scroll card's effect button: put the spell's effect on the targeted (or selected) tokens you control. */
async function scrollEffect(message, index) {
  const f = message.flags?.[SYS] ?? {};
  const entry = f.scrollSpell?.system?.applies?.[index];
  if (!entry) return;
  const caster = f.actorUuid ? await fromUuid(f.actorUuid).catch(() => null) : null;
  const targets = [...game.user.targets].map(t => t.actor).filter(Boolean);
  const actors = targets.length ? targets : (canvas?.tokens?.controlled ?? []).map(t => t.actor).filter(Boolean);
  if (!actors.length) return ui.notifications.warn("Target the creatures to affect (or select their tokens).");
  const mine = actors.filter(a => a.isOwner);
  const others = actors.filter(a => !a.isOwner);
  const temp = new CONFIG.Item.documentClass(foundry.utils.deepClone(f.scrollSpell), { parent: caster ?? undefined });
  if (mine.length) await applyEffectTo(mine, await effectDataFor(entry, temp, { cl: f.scrollCl || 1, caster }));
  if (others.length) {
    if (!game.users.activeGM) return ui.notifications.warn("Putting it on creatures you don't control needs the GM online.");
    game.socket.emit(`system.${SYS}`, { action: "scrollEffect", messageId: message.id, index, actorUuids: others.map(a => a.uuid) });
  }
}

/** The GM's side: the effect is rebuilt from the Arneyan spell of that name, never from what the message carries. */
async function onScrollSocket(msg, senderId) {
  if (msg?.action !== "scrollEffect" || !game.users.activeGM?.isSelf) return;
  const message = game.messages.get(String(msg.messageId));
  const sender = game.users.get(senderId);
  if (!message || !sender || message.author?.id !== sender.id) return;
  const f = message.flags?.[SYS] ?? {};
  const pack = game.packs.get(`${SYS}.spells`);
  const entryIdx = (await pack?.getIndex())?.find(e => e.name === f.scrollSpell?.name);
  const spell = entryIdx ? await pack.getDocument(entryIdx._id) : null;
  const entry = spell?.system?.applies?.[Number(msg.index)];
  if (!entry) return;
  const caster = f.actorUuid ? await fromUuid(f.actorUuid).catch(() => null) : null;
  const actors = [];
  for (const u of (msg.actorUuids ?? []).slice(0, 20)) {
    const a = await fromUuid(String(u)).catch(() => null);
    if (a instanceof Actor && !a.pack) actors.push(a);
  }
  if (actors.length) await applyEffectTo(actors, await effectDataFor(entry, spell, { cl: Math.clamp(Number(f.scrollCl) || 1, 1, 24), caster }));
}

/* -------------------------------------------- */
/*  Luck                                        */
/* -------------------------------------------- */

/**
 * A significant deed for the character's Alignment: +1 Luck at the GM's discretion, at most once a session,
 * never above 20 (Character Creation, Recovering Luck). Levelling up already gives its +1.
 */
export async function luckForDeed(actor) {
  if (!game.user.isGM || actor?.type !== "character") return;
  const luck = actor.system.luck?.value ?? 0;
  if (luck >= 20) return ui.notifications.info(`${actor.name}'s Luck is already 20, the maximum.`);
  const today = new Date().toISOString().slice(0, 10);
  if (actor.getFlag(SYS, "luckDeed") === today) {
    const again = await DialogV2.confirm({ window: { title: "Luck for a deed" }, content: `<p>${esc(actor.name)} already had Luck for a deed today. The rule is once a session. Give it anyway?</p>`, rejectClose: false });
    if (!again) return;
  }
  await actor.update({ "system.luck.value": luck + 1, [`flags.${SYS}.luckDeed`]: today });
  say(actor, `<p>${esc(actor.name)} earns <strong>+1 Luck</strong> for a deed true to their Alignment (now ${luck + 1}).</p>`);
}

/* -------------------------------------------- */

export function registerGear() {
  Hooks.once("ready", () => game.socket.on(`system.${SYS}`, onScrollSocket));
  // A lit light source given away, dropped or used up: the token's light follows.
  Hooks.on("deleteItem", (item, options, userId) => {
    if (userId === game.user.id && item.parent instanceof Actor && ((item.type === "equipment" && item.system.light?.lit) || modeLit(item))) syncLight(item.parent);
  });
  // A weapon's mode switched (from its sheet, the Effects tab or the Actions row) or its light changed: the token follows.
  Hooks.on("updateItem", (item, changes, options, userId) => {
    if (userId !== game.user.id || item.type !== "weapon" || !(item.parent instanceof Actor)) return;
    const s = changes.system ?? {};
    if (("active" in s || "toggle" in s || "modeLight" in s || "equipped" in s || "inside" in s) && (item.system.modeLight > 0 || "modeLight" in s)) syncLight(item.parent);
  });
  // Light sources burn down in game time (the clock) or real time (while the world is open and not paused).
  game.settings.register(SYS, "lightBurn", {
    name: "Light sources burn in", hint: "Game time: a lit torch or lantern burns down as the game clock moves on. Real time: it burns down while the world is open and the game isn't paused (counted on the GM's client, so a GM must be logged in).",
    scope: "world", config: true, type: String, default: "game", choices: { game: "Game time", real: "Real time" }, onChange: v => switchBurnMode(v)
  });
  Hooks.on("updateWorldTime", () => {
    burnDown();
    if (burnMode() === "game") refreshLightSheets();
  });
  Hooks.on("pauseGame", paused => onPauseGame(paused));
  Hooks.once("ready", () => setInterval(() => realTick(), REAL_TICK * 1000));
  Hooks.on("renderArneyanItemSheet", (app, element) => wireLightTimer(app, element));
  Hooks.on("renderChatMessageHTML", (message, html) => {
    for (const btn of html.querySelectorAll?.(".arn-scroll-effect") ?? []) {
      btn.addEventListener("click", ev => { ev.preventDefault(); scrollEffect(message, Number(btn.dataset.index)); });
    }
  });
  // A token placed for someone carrying a lit torch shows its light.
  Hooks.on("createToken", (token, options, userId) => {
    if (userId !== game.user.id) return;
    if (token.actor?.items?.some(i => i.type === "equipment" && i.system.light?.lit)) syncLight(token.actor);
  });
}

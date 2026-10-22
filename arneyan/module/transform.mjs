/**
 * Changing shape (Spellcasting in Arneyan): Polymorph, Wild Shape, Shapechange, Animal Shapes and the like give
 * a creature the form's whole stat block from Monsters & Treasure (HP, AC, attacks, saves, movement). It keeps its
 * own mind. When the form drops to 0 HP it returns to its own form with the HP it had when it changed; damage
 * beyond 0 does not carry over. Polymorph Any Object can also turn a creature into an object, helpless.
 *
 * How it works here: drop a creature onto a sheet (or use the sheet's Change Shape button). The changed creature
 * is a new actor, "Ilsa (Wolf)", in the Transformed folder. On every scene its token stands where the original's
 * was, and the original token is hidden. Returning to its own form deletes the new actor and brings the original
 * token back where the form stood. The original is never altered, so its HP is what it had when it changed.
 */
import { ARNEYAN } from "./config.mjs";
import { WILD_FORMS } from "./wild-forms.mjs";

const { DialogV2 } = foundry.applications.api;
const SYS = "arneyan";
const SOCKET = `system.${SYS}`;
const FOLDER = "Transformed";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

const MIND = ["int", "wis", "cha"];
export const DEFAULT_OPTIONS = { keepMind: true, keepFeatures: false, keepSpells: false, keepEffects: true };

/* -------------------------------------------- */
/*  Building the changed creature               */
/* -------------------------------------------- */

/** Own effects worth carrying into a form (not concentration, which stays with the caster's own body). */
function carriedEffects(original) {
  return original.effects.contents.filter(e => !e.flags?.[SYS]?.concentration).map(e => e.toObject());
}

const strip = d => { const x = foundry.utils.deepClone(d); delete x._id; delete x.folder; delete x.sort; return x; };
/** Embedded items or effects from two sources, keeping their ids (so nothing treats them as newly dropped) unless they clash. */
function merged(...lists) {
  const seen = new Set();
  return lists.flat().map(d => {
    const x = foundry.utils.deepClone(d);
    if (!x._id || seen.has(x._id)) delete x._id;
    else seen.add(x._id);
    return x;
  });
}

/**
 * Actor data for a creature in a new form.
 * @param {Actor} original  The creature changing shape.
 * @param {Actor|null} form A creature to become, or null with `object` set.
 * @param {object} o        keepMind, keepFeatures, keepSpells, keepEffects; object (a key of ARNEYAN.objectForms).
 */
export function formData(original, form, o = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...o };
  const src = original.toObject();
  const proto = src.prototypeToken ?? {};
  const info = { originalUuid: original.uuid, originalName: original.name, formName: "", object: "", options: opts, hpAtChange: original.system.attributes?.hp?.value ?? 0 };

  // An object: the creature's own stat block, helpless, with the object's look.
  if (!form) {
    const obj = ARNEYAN.objectForms[opts.object];
    if (!obj) throw new Error("Unknown object form");
    const data = strip(src);
    info.formName = obj.label;
    info.object = opts.object;
    data.name = `${original.name} (${obj.label})`;
    data.img = obj.img;
    data.prototypeToken = { ...strip(proto), texture: { ...(proto.texture ?? {}), src: obj.img }, width: 1, height: 1, actorLink: true };
    data.items = merged(src.items ?? []);
    data.effects = merged(carriedEffects(original), [{
      name: `Turned into ${obj.label}`, img: obj.img, statuses: ["paralysed"], disabled: false,
      description: "Helpless while in this form (Polymorph Any Object).",
      flags: { [SYS]: { rules: [{ key: "speed.mult", value: "0" }, { key: "no.cast", value: "1" }] } }
    }]);
    data.flags = { ...(data.flags ?? {}), [SYS]: { ...(data.flags?.[SYS] ?? {}), transform: info } };
    data.ownership = foundry.utils.deepClone(src.ownership);
    return data;
  }

  // A creature: the form's whole stat block.
  const f = form.toObject();
  const data = strip(f);
  info.formName = form.name;
  info.formUuid = form.uuid;
  data.name = `${original.name} (${form.name})`;
  data.ownership = foundry.utils.deepClone(src.ownership);
  data.prototypeToken = {
    ...strip(f.prototypeToken ?? {}), name: proto.name || original.name, actorLink: true,
    disposition: proto.disposition ?? f.prototypeToken?.disposition ?? 0
  };
  if (opts.keepMind) {
    for (const k of MIND) {
      const v = src.system?.abilities?.[k]?.value;
      if (Number.isFinite(v)) foundry.utils.setProperty(data, `system.abilities.${k}.value`, v);
    }
  }
  const own = types => (src.items ?? []).filter(i => types.includes(i.type));
  const items = [f.items ?? []];
  if (opts.keepFeatures) items.push(own(["ability", "feat"]));
  if (opts.keepSpells) {
    items.push(own(["spell"]).map(s => { const x = foundry.utils.deepClone(s); foundry.utils.setProperty(x, "system.className", ""); return x; }));
    const dc = original.system.spellDC ?? original.system.classDC ?? 0;
    if (data.type === "npc" && dc) foundry.utils.setProperty(data, "system.attributes.spellDC", dc);
  }
  data.items = merged(...items);
  // Wild Shape: up to an hour (its effect ending brings the druid back), and Deepened Shape's temporary HP.
  const wild = opts.wildShape ? [{
    name: "Wild Shape", img: "icons/svg/paw.svg", disabled: false, transfer: false,
    description: "Up to 1 hour, or until you choose to revert. When this ends you return to your own form.",
    flags: { [SYS]: { wildShape: true, endsAt: (game.time?.worldTime ?? 0) + 3600 } }
  }] : [];
  if (opts.tempHp > 0) foundry.utils.setProperty(data, "system.attributes.hp.temp", Math.round(opts.tempHp));
  info.wildShape = !!opts.wildShape;
  data.effects = merged(f.effects ?? [], opts.keepEffects ? carriedEffects(original) : [], wild);
  data.flags = { ...(data.flags ?? {}), [SYS]: { ...(data.flags?.[SYS] ?? {}), transform: info } };
  delete data.flags[SYS].autoVision;
  return data;
}

/* -------------------------------------------- */
/*  Doing it (GM)                               */
/* -------------------------------------------- */

async function transformFolder() {
  return game.folders.find(f => f.type === "Actor" && f.name === FOLDER && !f.folder)
    ?? Folder.create({ name: FOLDER, type: "Actor", color: "#3a2a4a", sorting: "a" });
}

/** The tokens that stand for this creature: its own token if it's an unlinked token, else its linked tokens on every scene. */
function tokensOf(actor) {
  if (actor.isToken) return actor.token ? [actor.token] : [];
  return game.scenes.contents.flatMap(s => s.tokens.filter(t => t.actorLink && t.actorId === actor.id));
}

async function swapCombatants(scene, fromId, to) {
  for (const combat of game.combats) {
    for (const c of combat.combatants) {
      if (c.sceneId === scene.id && c.tokenId === fromId) await c.update({ tokenId: to.id, actorId: to.actorId }).catch(err => console.warn("Arneyan | combatant swap", err));
    }
  }
}

/** Has this creature already changed shape (it is a form, or a form of it is out there)? */
export function isChanged(actor) {
  if (!actor) return false;
  if (actor.getFlag(SYS, "transform")) return true;
  if (tokensOf(actor).some(t => t.getFlag(SYS, "changedTo"))) return true;
  return game.actors.some(a => a.getFlag(SYS, "transform")?.originalUuid === actor.uuid);
}

/** Change a creature into a form (or an object). Runs on the GM's client. */
export async function doTransform(original, form, opts = {}) {
  if (!original || original.pack || !["character", "npc"].includes(original.type)) throw new Error("Only a creature in the world can change shape.");
  if (form && !["character", "npc"].includes(form.type)) throw new Error("Only creatures can be a form.");
  if (isChanged(original)) throw new Error(`${original.name} has already changed shape. Return to its own form first.`);
  const data = formData(original, form, opts);
  data.flags[SYS].transform.baseActorId = original.isToken ? original.token?.actorId : original.id;
  const folder = await transformFolder();
  data.folder = folder?.id ?? null;
  const changed = await Actor.create(data, { arneyanGrant: true, arneyanTransform: true });
  let placed = 0;
  for (const t of tokensOf(original)) {
    const scene = t.parent;
    const doc = await changed.getTokenDocument({
      x: t.x, y: t.y, elevation: t.elevation, hidden: t.hidden, disposition: t.disposition, name: t.name,
      flags: { [SYS]: { standsInFor: t.id } }
    }, { parent: scene });
    const [made] = await scene.createEmbeddedDocuments("Token", [doc.toObject()]);
    // The creature's own token waits, hidden and locked, where it stood (it can't be moved while it's changed).
    await t.update({ hidden: true, locked: true, [`flags.${SYS}.wasHidden`]: t.hidden, [`flags.${SYS}.wasLocked`]: !!t.locked, [`flags.${SYS}.changedTo`]: made.id });
    await swapCombatants(scene, t.id, made);
    placed++;
  }
  const what = form ? `a ${esc(form.name)}` : esc(ARNEYAN.objectForms[opts.object].label);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: original }),
    content: `<div class="arn-card"><header class="arn-card-title"><img src="${esc(changed.img)}" alt=""> <span>${esc(original.name)} changes shape</span></header><p>${esc(original.name)} becomes ${what}${opts.wildShape ? " (Wild Shape, up to 1 hour)" : ""}.${form ? " It takes the form's stat block and keeps its own mind." : " It is helpless while it stays that way."}${opts.tempHp > 0 ? ` ${Math.round(opts.tempHp)} temporary HP (Deepened Shape).` : ""}</p></div>`
  });
  return { actor: changed, placed };
}

/** Bring a changed creature back to its own form. Runs on the GM's client. */
export async function doRevert(changed, { dropped = false } = {}) {
  const info = changed.getFlag(SYS, "transform");
  if (!info) return;
  const original = await fromUuid(info.originalUuid).catch(() => null);
  const base = game.actors.get(info.baseActorId);
  const belongs = t => original?.isToken ? t.id === original.token?.id : (t.actorLink && t.actorId === info.baseActorId);
  for (const scene of game.scenes) {
    const forms = scene.tokens.filter(t => t.actorId === changed.id);
    // Hidden originals: the ones these forms stand in for, plus any whose form token was deleted by hand.
    const origs = scene.tokens.filter(t => {
      const to = t.getFlag(SYS, "changedTo");
      return to && (forms.some(f => f.id === to) || (!scene.tokens.has(to) && belongs(t)));
    });
    const used = new Set();
    for (const orig of origs) {
      const f = forms.find(x => x.id === orig.getFlag(SYS, "changedTo"));
      if (f) used.add(f.id);
      // Move it while it's still hidden (no slide across the map), then show it.
      if (f) await orig.update({ x: f.x, y: f.y, elevation: f.elevation }, { animate: false, arneyanRevert: true });
      await orig.update({ hidden: !!orig.getFlag(SYS, "wasHidden"), locked: !!orig.getFlag(SYS, "wasLocked"), [`flags.${SYS}.wasHidden`]: null, [`flags.${SYS}.wasLocked`]: null, [`flags.${SYS}.changedTo`]: null }, { arneyanRevert: true });
      if (f) await swapCombatants(scene, f.id, orig);
    }
    // A form whose original token is gone: put the creature back on the map where the form stood.
    for (const f of forms.filter(x => !used.has(x.id))) {
      const who = original && !original.isToken ? original : base;
      if (!who) continue;
      const doc = await who.getTokenDocument({ x: f.x, y: f.y, elevation: f.elevation, hidden: f.hidden }, { parent: scene });
      const [made] = await scene.createEmbeddedDocuments("Token", [doc.toObject()]);
      await swapCombatants(scene, f.id, made);
    }
    if (forms.length) await scene.deleteEmbeddedDocuments("Token", forms.map(t => t.id));
  }
  // An object keeps the creature's own stats, so what happened to them stays.
  if (info.object && original) {
    const hp = changed.system.attributes?.hp ?? {};
    const before = original.system.attributes?.hp?.value ?? 0;
    await original.update({ "system.attributes.hp.value": hp.value ?? before, "system.attributes.hp.temp": hp.temp ?? 0 });
  }
  await ChatMessage.create({
    speaker: original ? ChatMessage.getSpeaker({ actor: original }) : ChatMessage.getSpeaker(),
    content: `<div class="arn-card"><p>${esc(info.originalName)} returns to its own form${dropped && !info.object ? ` as the ${esc(info.formName)} form drops` : ""}${original ? `, with ${original.system.attributes?.hp?.value ?? "?"} HP` : ""}.</p></div>`
  });
  await changed.delete({ arneyanForce: true, arneyanGrant: true });
  return original;
}

/* -------------------------------------------- */
/*  Asking for it (anyone)                      */
/* -------------------------------------------- */

const gm = () => game.users.activeGM;

/** Change shape, asking the GM's client to do it when you aren't the GM. */
export async function transformInto(original, form, opts = {}) {
  if (!original?.isOwner) return ui.notifications.warn(`You don't control ${original?.name ?? "that creature"}.`);
  if (form && !["character", "npc"].includes(form.type)) return ui.notifications.warn("Only creatures can be a form.");
  if (original.pack || !["character", "npc"].includes(original.type)) return ui.notifications.warn("Only a creature in the world can change shape.");
  if (isChanged(original)) return ui.notifications.warn(`${original.name} has already changed shape. Return to its own form first.`);
  if (game.user.isGM) {
    try {
      const { actor } = await doTransform(original, form, opts);
      original.sheet?.close();
      actor.sheet?.render(true);
    } catch (err) { ui.notifications.error(err.message); }
    return;
  }
  if (!gm()) return ui.notifications.warn("Changing shape needs the GM to be online.");
  game.socket.emit(SOCKET, { action: "transform", originalUuid: original.uuid, formUuid: form?.uuid ?? null, opts: { ...opts } });
  original.sheet?.close();
  ui.notifications.info(`${original.name} changes shape...`);
}

/** Return to own form, asking the GM's client when you aren't the GM. */
const reverting = new Set();
export async function revertTransform(changed, { dropped = false } = {}) {
  if (!changed?.getFlag(SYS, "transform") || reverting.has(changed.uuid)) return;
  if (game.user.isGM && gm()?.isSelf) {
    reverting.add(changed.uuid);
    try {
      const original = await doRevert(changed, { dropped });
      original?.sheet?.render(true);
    } finally { reverting.delete(changed.uuid); }
    return;
  }
  if (!changed.isOwner) return;
  if (!gm()) return ui.notifications.warn("Returning to your own form needs the GM to be online.");
  reverting.add(changed.uuid);
  setTimeout(() => reverting.delete(changed.uuid), 3000);
  game.socket.emit(SOCKET, { action: "revert", actorUuid: changed.uuid, dropped: !!dropped });
}

async function onSocket(msg, senderId) {
  if (!gm()?.isSelf || !msg || typeof msg !== "object") return;
  const sender = game.users.get(senderId);
  if (!sender) return;
  try {
    if (msg.action === "transform") {
      const original = await fromUuid(String(msg.originalUuid)).catch(() => null);
      if (!(original instanceof Actor) || original.pack || !original.testUserPermission(sender, "OWNER")) return;
      const o = msg.opts ?? {};
      let form = null;
      let wild = null;
      if (msg.formUuid) {
        form = await fromUuid(String(msg.formUuid)).catch(() => null);
        if (!(form instanceof Actor) || !["character", "npc"].includes(form.type)) return;
        // Wild Shape: a beast from the Bestiary within the druid's own cap (the player may not see the Bestiary itself).
        if (o.wildShape) {
          wild = wildShapeFor(original);
          if (!wild || form.pack !== `${SYS}.monsters` || !isWildForm(form) || levelOf(form) > wild.cap) return;
          const u = wild.item.system?.uses;
          if (u?.max > 0 && u.value <= 0) return;
        } else {
          const canSee = form.pack ? game.packs.get(form.pack)?.testUserPermission(sender, "OBSERVER") : form.testUserPermission(sender, "OBSERVER");
          if (!canSee) return;
        }
      }
      const opts = { keepMind: !!o.keepMind, keepFeatures: !!o.keepFeatures, keepSpells: !!o.keepSpells && (!wild || wild.level >= 15), keepEffects: !!o.keepEffects,
        wildShape: !!wild, tempHp: wild?.tempHp ?? 0 };
      if (!form) {
        if (!Object.hasOwn(ARNEYAN.objectForms, String(o.object))) return;
        opts.object = o.object;
      }
      await doTransform(original, form, opts);
      if (wild) await spendWildShape(original);
    } else if (msg.action === "revert") {
      const changed = await fromUuid(String(msg.actorUuid)).catch(() => null);
      if (!(changed instanceof Actor) || !changed.getFlag(SYS, "transform") || !changed.testUserPermission(sender, "OWNER")) return;
      await revertTransform(changed, { dropped: !!msg.dropped });
    }
  } catch (err) {
    console.warn("Arneyan | change shape", err);
  }
}

/* -------------------------------------------- */
/*  The dialog                                  */
/* -------------------------------------------- */

const box = (name, label, checked, hint) =>
  `<label class="arn-check" ${hint ? `data-tooltip="${esc(hint)}"` : ""}><input type="checkbox" name="${name}" ${checked ? "checked" : ""}> ${label}</label>`;

function optionsHtml(d = DEFAULT_OPTIONS, { spellsLocked = "" } = {}) {
  return `<fieldset class="arn-shape-opts"><legend>The creature keeps</legend>
    ${box("keepMind", "Its own mind (Intelligence, Wisdom, Charisma)", d.keepMind, "Every way of changing shape keeps the creature's own mind.")}
    ${box("keepEffects", "Its conditions and effects", d.keepEffects)}
    ${box("keepFeatures", "Its class abilities and feats", d.keepFeatures, "For Wild Shape: Wisdom-based abilities and the like. Tick it and delete what doesn't apply.")}
    ${spellsLocked ? `<label class="arn-check" data-tooltip="${esc(spellsLocked)}"><input type="checkbox" name="keepSpells" disabled> Its spells <span class="arn-muted">(${esc(spellsLocked)})</span></label>`
      : box("keepSpells", "Its spells", d.keepSpells, "Only where the form can still cast, such as Wild Shape Casting. Polymorph and Shapechange can't.")}
  </fieldset>`;
}

function readOptions(form) {
  const el = name => form?.elements?.[name];
  return { keepMind: !!el("keepMind")?.checked, keepEffects: !!el("keepEffects")?.checked, keepFeatures: !!el("keepFeatures")?.checked, keepSpells: !!el("keepSpells")?.checked };
}

/** Dropped a creature on a sheet: confirm, with what to keep. */
export async function promptTransform(original, form) {
  if (form.id === original.id && !form.pack) return;
  if (original.getFlag(SYS, "transform")) return ui.notifications.warn(`${original.name} has already changed shape. Return to its own form first.`);
  const lvl = form.system?.details?.levelText || form.system?.level;
  const content = `<div class="arn-shape-dialog">
    <p class="arn-shape-head"><img src="${esc(form.img)}" alt=""> <span><strong>${esc(original.name)}</strong> becomes <strong>${esc(form.name)}</strong>${lvl !== undefined ? ` (Level ${esc(lvl)})` : ""}.</span></p>
    <p class="arn-muted">It takes the form's whole stat block: HP, AC, attacks, saves and movement. At 0 HP it returns to its own form with the HP it had when it changed.</p>
    ${optionsHtml()}</div>`;
  const opts = await DialogV2.wait({
    window: { title: "Change Shape", icon: "fa-solid fa-paw" }, classes: ["arneyan", "arn-shape-app"], position: { width: 460 }, content,
    buttons: [
      { action: "go", label: "Change shape", icon: "fa-solid fa-paw", default: true, callback: (ev, button) => readOptions(button.form) },
      { action: "cancel", label: "Cancel" }
    ],
    rejectClose: false
  });
  if (opts && typeof opts === "object") return transformInto(original, form, opts);
}

/** The sheet's Change Shape button: harmless creatures and objects, or drag a creature on. */
export async function chooseForm(original) {
  if (original.getFlag(SYS, "transform")) return revertTransform(original);
  const pack = game.packs.get(`${SYS}.monsters`);
  const index = pack?.visible ? await pack.getIndex() : null;
  const critters = ARNEYAN.harmlessForms.map(n => index?.find(e => e.name === n)).filter(Boolean);
  const tile = (attrs, img, label) => `<button type="button" class="arn-shape-tile" ${attrs}><img src="${esc(img)}" alt=""><span>${esc(label)}</span></button>`;
  const content = `<div class="arn-shape-dialog">
    <p class="arn-muted">To take a creature's form, drag it from the Actors sidebar, a compendium or the Bestiary onto ${esc(original.name)}'s sheet${pack?.visible ? ", or pick one from the whole Bestiary" : ""}.</p>
    ${pack?.visible ? `<button type="button" class="arn-shape-all"><i class="fa-solid fa-dragon"></i> Every creature in the Bestiary</button>` : ""}
    ${critters.length ? `<h4>A harmless creature</h4><div class="arn-shape-grid">${critters.map(c => tile(`data-uuid="${c.uuid}"`, c.img, c.name)).join("")}</div>` : ""}
    <h4>An object <span class="arn-muted">(helpless; keeps its own stats)</span></h4>
    <div class="arn-shape-grid">${Object.entries(ARNEYAN.objectForms).map(([k, o]) => tile(`data-object="${k}"`, o.img, o.label.replace(/^an? /, ""))).join("")}</div>
    ${optionsHtml()}</div>`;
  let picked = null;
  const opts = await DialogV2.wait({
    window: { title: `Change Shape: ${original.name}`, icon: "fa-solid fa-paw" }, classes: ["arneyan", "arn-shape-app"], position: { width: 560 }, content,
    buttons: [{ action: "cancel", label: "Cancel" }],
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog?.element ?? (dialog instanceof HTMLElement ? dialog : event?.target?.element);
      const form = root?.matches?.("form") ? root : root?.querySelector("form");
      root?.querySelector(".arn-shape-all:not([data-bound])")?.addEventListener("click", ev => {
        ev.currentTarget.dataset.bound = "1";
        picked = { all: true, opts: readOptions(form) };
        dialog.close();
      });
      root?.querySelectorAll(".arn-shape-tile:not([data-bound])").forEach(btn => {
        btn.dataset.bound = "1";
        btn.addEventListener("click", () => {
          picked = { uuid: btn.dataset.uuid ?? null, object: btn.dataset.object ?? null, opts: readOptions(form) };
          dialog.close();
        });
      });
    }
  });
  if (!picked) return opts;
  if (picked.all) {
    const entries = await bestiaryForms();
    if (!entries.length) return ui.notifications.warn("The Bestiary has no creatures you can see.");
    const choice = await pickForm({ title: `Change Shape: ${original.name}`, entries, defaults: picked.opts, typeFilter: true,
      note: "Every creature in the Bestiary, at any Level: which you can become is the spell's (and the GM's) call." });
    if (!choice) return;
    const f = await fromUuid(choice.uuid);
    return f ? transformInto(original, f, choice.opts) : undefined;
  }
  if (picked.object) return transformInto(original, null, { ...picked.opts, object: picked.object });
  const form = await fromUuid(picked.uuid);
  if (form) return transformInto(original, form, picked.opts);
}

/* -------------------------------------------- */
/*  Wild Shape: pick a beast                    */
/* -------------------------------------------- */

/**
 * Beast-like monsters (not "beast" by type) a druid can become: animal-minded and not magical (Wild Shape: "a wolf,
 * giant spider or dire badger are all fair game, but intelligent or magical creatures are not"; GM's call).
 */
export const BEAST_LIKE = ["Owlbear", "Death Dog", "Hippogriff", "Griffon", "Ankheg", "Bulette", "Carrion Crawler", "Grick", "Grick Alpha",
  "Hook Horror", "Young Remorhaz", "Remorhaz", "Roc", "Purple Worm", "Hydra", "Piercer", "Rust Monster"];

const typeOf = e => String(foundry.utils.getProperty(e, "system.details.type") ?? "").toLowerCase();
const levelOf = e => Number(foundry.utils.getProperty(e, "system.level")) || 0;
const levelLabel = e => foundry.utils.getProperty(e, "system.details.levelText") || String(levelOf(e));

/** A beast, or a beast-like monster on the list. */
export const isWildForm = e => typeOf(e).startsWith("beast") || BEAST_LIKE.includes(e?.name);

/** The highest Level a druid can take (half the Druid level, at least 1; the full level from Deepened Shape). */
export const wildShapeCap = (druidLevel, deepened = false) => deepened ? Math.max(1, druidLevel) : Math.max(1, Math.floor(druidLevel / 2));

/** The Druid level a form of this Level first opens at: twice its Level, or its own Level from 12th (Deepened Shape). */
export const druidLevelFor = lvl => lvl <= 1 ? 1 : Math.min(2 * lvl, Math.max(12, lvl));

/** A creature's Wild Shape: its Druid level, cap and Deepened Shape's temporary HP (null without the feature). */
export function wildShapeFor(actor) {
  const item = actor?.items?.find?.(i => i.name === "Wild Shape");
  if (!item) return null;
  const level = Number(item.featureLevel ?? actor.system?.level) || 1;
  const deepened = level >= 12 || actor.items.some(i => i.name === "Deepened Shape");
  return { item, level, deepened, cap: wildShapeCap(level, deepened), tempHp: deepened ? 2 * level : 0 };
}

/** The Wild Shape forms built into the system (players see these even when the Bestiary is hidden from them). */
export const builtWildForms = () => WILD_FORMS.map(e => ({ ...e, uuid: `Compendium.${SYS}.monsters.Actor.${e.id}` }));

/** A monster's art from the art index (the packs it was scanned from), where it has some. */
async function withArt(entries) {
  try {
    const { artFor } = await import("./art.mjs");
    return entries.map(e => { const a = artFor(e.name); return a ? { ...e, img: a.token || a.portrait || e.img } : e; });
  } catch { return entries; }
}

/** The creatures in the Bestiary (the system's monsters) this user can see, with their Level and type. */
export async function bestiaryForms() {
  const pack = game.packs.get(`${SYS}.monsters`);
  if (!pack?.visible) return [];
  const index = await pack.getIndex({ fields: ["system.details.type", "system.level", "system.details.levelText"] });
  return withArt(index.filter(e => e.type === "npc").map(e => ({ uuid: e.uuid, name: e.name, img: e.img, level: levelOf(e), levelText: levelLabel(e), type: typeOf(e) }))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)));
}

/**
 * The form picker: a searchable grid of creatures (those above `cap` shown but locked), and what the creature keeps.
 * Returns { uuid, opts } or null.
 */
export async function pickForm({ title, entries, cap = Infinity, lockTip = () => "", defaults = DEFAULT_OPTIONS, note = "", typeFilter = false, spellsLocked = "" }) {
  const types = [...new Set(entries.map(e => e.type.split(" (")[0]).filter(Boolean))].sort();
  const tile = e => {
    const locked = e.level > cap;
    return `<button type="button" class="arn-shape-tile ${locked ? "locked" : ""}" data-uuid="${esc(e.uuid)}" data-name="${esc(e.name.toLowerCase())}" data-type="${esc(e.type.split(" (")[0])}"
      ${locked ? `disabled data-tooltip="${esc(lockTip(e))}"` : `data-tooltip="${esc(`${e.name}: Level ${e.levelText}, ${e.type || "creature"}`)}"`}>
      <img src="${esc(e.img)}" alt="" loading="lazy"><span>${esc(e.name)}</span><small>Level ${esc(e.levelText)}${locked ? ' <i class="fa-solid fa-lock"></i>' : ""}</small></button>`;
  };
  const content = `<div class="arn-shape-dialog arn-shape-picker">
    ${note ? `<p class="arn-muted">${note}</p>` : ""}
    <div class="arn-shape-find"><input type="search" class="arn-shape-search" placeholder="Search by name" autocomplete="off">
      ${typeFilter ? `<select class="arn-shape-type"><option value="">Every type</option>${types.map(t => `<option value="${esc(t)}">${esc(t[0].toUpperCase() + t.slice(1))}</option>`).join("")}</select>` : ""}
      ${Number.isFinite(cap) ? `<label class="arn-check"><input type="checkbox" class="arn-shape-onlyok"> Only the ones I can take</label>` : ""}</div>
    <div class="arn-shape-grid arn-shape-scroll">${entries.map(tile).join("")}</div>
    <p class="arn-muted arn-shape-count"></p>
    ${optionsHtml(defaults, { spellsLocked })}</div>`;
  let picked = null;
  await DialogV2.wait({
    window: { title, icon: "fa-solid fa-paw" }, classes: ["arneyan", "arn-shape-app"], position: { width: 640 }, content,
    buttons: [{ action: "cancel", label: "Cancel" }],
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog?.element ?? (dialog instanceof HTMLElement ? dialog : event?.target?.element);
      const form = root?.matches?.("form") ? root : root?.querySelector("form");
      if (!root || root.dataset.arnPicker) return;
      root.dataset.arnPicker = "1";
      const tiles = [...root.querySelectorAll(".arn-shape-tile")];
      const count = root.querySelector(".arn-shape-count");
      const filter = () => {
        const q = String(root.querySelector(".arn-shape-search")?.value ?? "").trim().toLowerCase();
        const t = root.querySelector(".arn-shape-type")?.value ?? "";
        const ok = !!root.querySelector(".arn-shape-onlyok")?.checked;
        let n = 0;
        for (const b of tiles) {
          const show = (!q || b.dataset.name.includes(q)) && (!t || b.dataset.type === t) && (!ok || !b.disabled);
          b.hidden = !show;
          if (show) n++;
        }
        if (count) count.textContent = `${n} shown`;
      };
      root.querySelector(".arn-shape-search")?.addEventListener("input", filter);
      root.querySelector(".arn-shape-type")?.addEventListener("change", filter);
      root.querySelector(".arn-shape-onlyok")?.addEventListener("change", filter);
      for (const b of tiles) b.addEventListener("click", () => {
        if (b.disabled) return;
        picked = { uuid: b.dataset.uuid, opts: readOptions(form) };
        dialog.close();
      });
      filter();
      root.querySelector(".arn-shape-search")?.focus();
    }
  });
  return picked;
}

/** Spend a use of Wild Shape (after the change has happened). */
async function spendWildShape(actor) {
  const item = actor?.items?.find?.(i => i.name === "Wild Shape");
  const u = item?.system?.uses;
  if (u?.max > 0 && u.value > 0) await item.update({ "system.uses.value": u.value - 1 });
}

/** The Wild Shape feature used (its Use button): pick a beast up to your Level cap and become it. */
export async function wildShape(item) {
  const actor = item?.actor;
  if (!actor?.isOwner) return;
  // Already a beast: using it again (or Change Shape) brings the druid back.
  if (actor.getFlag(SYS, "transform")) return revertTransform(actor);
  if (isChanged(actor)) return ui.notifications.warn(`${actor.name} has already changed shape. Return to its own form first.`);
  const uses = item.system.uses ?? {};
  if (uses.max > 0 && uses.value <= 0) return ui.notifications.warn(`${item.name} has no uses left today.`);
  if (!game.user.isGM && !gm()) return ui.notifications.warn("Changing shape needs the GM to be online.");
  const level = Number(item.featureLevel ?? actor.system.level) || 1;
  const deepened = level >= 12 || actor.items.some(i => i.name === "Deepened Shape");
  const cap = wildShapeCap(level, deepened);
  // The Bestiary's own index when this user can see it (the GM), else the list built into the system.
  const visible = game.packs.get(`${SYS}.monsters`)?.visible;
  const entries = visible ? (await bestiaryForms()).filter(e => isWildForm({ name: e.name, system: { details: { type: e.type } } })) : await withArt(builtWildForms());
  if (!entries.length) return ui.notifications.warn("The Bestiary has no beasts you can see.");
  const choice = await pickForm({
    title: `Wild Shape: ${actor.name}`, entries, cap,
    lockTip: e => `Level ${e.levelText}: needs Druid level ${druidLevelFor(e.level)}`,
    defaults: { ...DEFAULT_OPTIONS, keepSpells: level >= 15 },
    // Casting in a form comes with Wild Shape Casting (15th level), and then only spells with no somatic component.
    spellsLocked: level >= 15 || game.user.isGM ? "" : "from 15th level: Wild Shape Casting",
    note: `A beast or beast-like monster of Level ${cap} or lower (${deepened ? "your Druid level: Deepened Shape" : "half your Druid level, at least 1"}). Higher ones are shown locked. ${uses.max > 0 ? `${uses.value} of ${uses.max} uses left today. ` : ""}Up to 1 hour; at 0 HP you return to your own form.${deepened ? ` You gain ${2 * level} temporary HP.` : ""}`
  });
  if (!choice) return;
  const picked = entries.find(e => e.uuid === choice.uuid);
  if (!picked) return;
  if (picked.level > cap) return ui.notifications.warn(`${picked.name} is Level ${picked.levelText}: above your Wild Shape cap of ${cap}.`);
  // A use is spent only once the change has happened (the GM's client spends it for a player).
  const now = item.system.uses ?? {};
  if (now.max > 0 && now.value <= 0) return ui.notifications.warn(`${item.name} has no uses left today.`);
  const opts = { ...choice.opts, wildShape: true, tempHp: deepened ? 2 * level : 0 };
  if (game.user.isGM) {
    const form = await fromUuid(choice.uuid);
    if (!form) return ui.notifications.warn(`${picked.name} isn't in the Bestiary any more.`);
    await transformInto(actor, form, opts);
    if (isChanged(actor)) await spendWildShape(actor);
    return;
  }
  // A player: the GM's client finds the form and checks it is within the cap.
  if (!gm()) return ui.notifications.warn("Changing shape needs the GM to be online.");
  game.socket.emit(SOCKET, { action: "transform", originalUuid: actor.uuid, formUuid: choice.uuid, opts });
  actor.sheet?.close();
  ui.notifications.info(`${actor.name} changes shape...`);
}

export function registerTransform() {
  // A creature that has changed shape stays put: its own token doesn't move until it returns (the form moves instead).
  Hooks.on("preUpdateToken", (tok, changes, options) => {
    if (options?.arneyanRevert || !tok.getFlag?.(SYS, "changedTo") || !tok.parent?.tokens?.has(tok.getFlag(SYS, "changedTo"))) return;
    if ("x" in changes || "y" in changes || "elevation" in changes) {
      if (game.user.id === options?.userId || !options?.userId) ui.notifications?.warn(`${tok.name} has changed shape: move the form instead (its own token comes back where the form stands).`);
      return false;
    }
  });
  Hooks.once("ready", () => game.socket.on(SOCKET, onSocket));
  // Wild Shape's hour runs out (its effect ends): the druid returns to its own form.
  Hooks.on("deleteActiveEffect", (effect, options, userId) => {
    if (userId !== game.user.id || !effect.flags?.[SYS]?.wildShape) return;
    const actor = effect.parent;
    if (actor instanceof Actor && actor.getFlag(SYS, "transform")) revertTransform(actor).catch(err => console.warn("Arneyan | wild shape", err));
  });
  // A form at 0 HP (from damage or typed on the sheet) returns to its own form.
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (userId !== game.user.id || !actor.getFlag(SYS, "transform")) return;
    if (!foundry.utils.hasProperty(changes, "system.attributes.hp.value") || (actor.system.attributes?.hp?.value ?? 1) > 0) return;
    revertTransform(actor, { dropped: true }).catch(err => console.warn("Arneyan | change shape", err));
  });
}

/**
 * Storage places: a bank vault, the chest back home, a ship's hold, a guild locker. An actor for a place
 * rather than a creature, holding gear and coins away from anyone's inventory.
 *
 * - The GM's "Party is here" switch: while it's off, players can see what's stored but can't put anything
 *   in or take anything out (no loot teleporting from the bank into a dungeon). The GM always can.
 * - Who may use it is Foundry's own Ownership (right-click it in the Actors sidebar): new places belong to
 *   every player.
 * - A capacity in slots, if the GM sets one (0 means no limit; the Catalogue gives chests none).
 * - A ledger: every deposit and withdrawal with the game date and who did it.
 * - It can go on a map as a token (the chest in the corner of the room); double-click opens it.
 */
import { ARNEYAN } from "./config.mjs";
import { blockedCopy, moveDroppedItem, settleMoved, partyMembers } from "./party.mjs";
import { storageSlots } from "./data/actor-models.mjs";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const SYS = "arneyan";
const GEAR = new Set(["weapon", "armour", "equipment"]);
const COINS = ["pp", "gp", "sp", "cp"];
const LEDGER_MAX = 200;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/* -------------------------------------------- */
/*  Rules                                       */
/* -------------------------------------------- */

/** Can this user put things in or take things out right now? */
export function canUseStorage(actor, user = game.user) {
  if (actor?.type !== "storage") return true;
  return !!user?.isGM || (!!actor.system.here && actor.testUserPermission(user, "OWNER"));
}

/** Why not, in a sentence. */
function awayReason(actor) {
  if (!actor.testUserPermission(game.user, "OWNER")) return `${actor.name} isn't yours to use.`;
  const where = actor.system.location ? ` (${actor.system.location})` : "";
  return `${actor.name}${where} is somewhere else. The GM marks it "Party is here" when you're there.`;
}

/** Slots one more stack would add. */
function slotsOf(item) {
  return item.system?.totalSlots ?? 0;
}

/** Slots an item brings with everything inside it (nothing inside a weightless container counts). */
export function slotsWithContents(item, depth = 0) {
  let n = slotsOf(item);
  if (depth > 8 || !item.system?.container?.holds || !item.parent?.items || item.system.container.weightless) return n;
  for (const i of item.parent.items.filter(x => x.system?.inside === item.id)) n += slotsWithContents(i, depth + 1);
  return n;
}

/** Does it fit? Contents of a weightless container (a Bag of Holding) cost nothing. */
export function fitsIn(actor, slots) {
  const cap = actor.system.capacity;
  return !cap || actor.system.usedSlots + slots <= cap + 1e-9;
}

/** The in-game date and time for the ledger. */
function gameWhen() {
  const t = game.time?.worldTime ?? 0;
  try {
    const cal = game.time?.calendar;
    const f = globalThis.CONFIG?.time?.formatters?.arneyan ? cal?.format?.(t, "arneyan") : cal?.format?.(t);
    if (typeof f === "string" && f.trim()) return f;
  } catch { /* the calendar can't format: fall back below */ }
  const day = Math.floor(t / 86400) + 1;
  const hh = String(Math.floor((t % 86400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  return `Day ${day}, ${hh}:${mm}`;
}

function whoActs(options) {
  const char = options?.arneyanWho ?? game.user.character?.name;
  return char && !game.user.isGM ? `${game.user.name} (${char})` : (char ? `${char} (GM)` : game.user.name);
}

/*
 * Ledger writes go through the GM (one writer, one after another), so two players moving things at once
 * don't overwrite each other's entries. With no GM online, the player writes it.
 */
const queues = new Map();
const SOCKET = `system.${SYS}`;
export function logStorage(actor, text, options = {}) {
  if (actor?.type !== "storage") return Promise.resolve();
  const entry = { when: gameWhen(), worldTime: game.time?.worldTime ?? 0, who: whoActs(options), text };
  const gm = game.users?.activeGM;
  if (gm && !gm.isSelf) {
    game.socket.emit(SOCKET, { action: "storageLog", actorId: actor.id, entry });
    return Promise.resolve();
  }
  return writeLedger(actor, entry);
}

function writeLedger(actor, entry) {
  if (!actor?.isOwner) return Promise.resolve();
  const prev = queues.get(actor.id) ?? Promise.resolve();
  const next = prev.then(async () => {
    const ledger = [...(actor.system.ledger ?? []).map(e => ({ ...e })), entry].slice(-LEDGER_MAX);
    await actor.update({ "system.ledger": ledger }, { arneyanLedger: true });
  }).catch(err => console.warn("Arneyan | storage ledger", err));
  queues.set(actor.id, next);
  return next;
}

const coinText = c => COINS.filter(k => c[k]).map(k => `${c[k]} ${k}`).join(", ");

/* -------------------------------------------- */
/*  The sheet                                   */
/* -------------------------------------------- */

export class ArneyanStorageSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["arneyan", "sheet", "actor", "storage"],
    position: { width: 680, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      changeTab: ArneyanStorageSheet.#changeTab,
      toggleHere: ArneyanStorageSheet.#toggleHere,
      itemEdit: ArneyanStorageSheet.#itemEdit,
      itemDelete: ArneyanStorageSheet.#itemDelete,
      takeItem: ArneyanStorageSheet.#takeItem,
      moveCoins: ArneyanStorageSheet.#moveCoins,
      editNotes: ArneyanStorageSheet.#editNotes,
      browse: ArneyanStorageSheet.#browse,
      clearLedger: ArneyanStorageSheet.#clearLedger
    }
  };

  static PARTS = { sheet: { template: "systems/arneyan/templates/actor/storage-sheet.hbs", scrollable: [".arn-body"] } };

  _activeTab = "contents";

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const sys = actor.system;
    const usable = canUseStorage(actor);
    const byId = new Map(actor.items.map(i => [i.id, i]));
    const sort = (a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name);
    // Containers first, their contents under them.
    const rows = [];
    const add = (item, depth) => {
      if (depth > 8) return;
      const sys = item.system;
      const kind = item.type === "weapon" ? `${sys.damage ?? ""} ${ARNEYAN.damageTypes?.[sys.damageType] ?? ""}`.trim() || "Weapon"
        : item.type === "armour" ? `Armour${sys.ac ? ` · AC +${sys.ac}` : ""}`
        : sys.container?.holds ? "Container" : sys.consumable?.use ? "Consumable" : sys.charges?.max ? `${sys.charges.value}/${sys.charges.max} charges` : "Gear";
      rows.push({ id: item.id, name: item.name, img: item.img, qty: sys.quantity ?? 1, slots: sys.totalSlots ?? 0,
        price: sys.price ?? "", depth, indent: depth * 22, holds: !!sys.container?.holds, kind });
      for (const c of actor.items.filter(i => i.system?.inside === item.id).sort(sort)) add(c, depth + 1);
    };
    for (const i of actor.items.filter(i => GEAR.has(i.type) && !byId.has(i.system?.inside)).sort(sort)) add(i, 0);
    const ledger = [...(sys.ledger ?? [])].reverse();
    Object.assign(context, {
      actor, system: sys, source: actor._source.system, editable: this.isEditable, isGM: game.user.isGM, usable,
      awayText: usable ? "" : awayReason(actor),
      kinds: Object.fromEntries(Object.entries(ARNEYAN.storageKinds).map(([k, v]) => [k, v.label])),
      kindLabel: ARNEYAN.storageKinds[sys.kind]?.label ?? "",
      tabs: [["contents", "Contents"], ["ledger", `Ledger (${ledger.length})`], ["notes", "Notes"]].map(([id, label]) => ({ id, label, active: id === this._activeTab })),
      rows, ledger,
      capLabel: sys.capacity ? `${sys.usedSlots} of ${sys.capacity} slots` : `${sys.usedSlots} slots (no limit)`,
      capPct: sys.capacity ? Math.min(100, Math.round(sys.usedSlots / sys.capacity * 100)) : 0,
      // Coins move with Put in or take out (both sides change); typing a number in is the GM's.
      coinsEditable: game.user.isGM,
      notes: await foundry.applications.ux.TextEditor.implementation.enrichHTML(sys.details.notes ?? "", { relativeTo: actor, secrets: actor.isOwner })
    });
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const el of this.element.querySelectorAll(".arn-tab")) el.hidden = el.dataset.tab !== this._activeTab;
    for (const r of this.element.querySelectorAll("[data-item-id][draggable]")) {
      r.addEventListener("dragstart", ev => {
        const item = this.document.items.get(r.dataset.itemId);
        if (!item) return;
        if (!canUseStorage(this.document)) { ev.preventDefault(); return ui.notifications.warn(awayReason(this.document)); }
        ev.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
      });
    }
  }

  /** Gear dropped here moves in (from a sheet you own) or is copied (from the Catalogue). */
  async _onDropItem(event, item) {
    const actor = this.document;
    if (!GEAR.has(item?.type)) return ui.notifications.warn("Storage holds gear: weapons, armour and equipment.");
    if (!canUseStorage(actor)) return ui.notifications.warn(awayReason(actor));
    if (blockedCopy(item)) return null;
    // Re-ordering inside the same place.
    if (item.parent?.uuid === actor.uuid) return super._onDropItem?.(event, item);
    if (!fitsIn(actor, slotsWithContents(item))) {
      return ui.notifications.warn(`${item.name} doesn't fit: ${actor.name} is full (${actor.system.usedSlots} of ${actor.system.capacity} slots).`);
    }
    const created = await super._onDropItem?.(event, item);
    await moveDroppedItem(this, item, created);
    return created;
  }

  _itemFrom(target) {
    return this.document.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  }

  static #changeTab(event, target) { this._activeTab = target.dataset.tab; this.render(); }

  static async #toggleHere() {
    if (!game.user.isGM) return;
    const here = !this.document.system.here;
    await this.document.update({ "system.here": here });
    return logStorage(this.document, here ? "The party arrived: it can be used." : "The party left: it's closed to them.");
  }

  static #itemEdit(event, target) { return this._itemFrom(target)?.sheet.render(true); }

  static async #itemDelete(event, target) {
    const item = this._itemFrom(target);
    if (!item) return;
    if (!canUseStorage(this.document)) return ui.notifications.warn(awayReason(this.document));
    const ok = await DialogV2.confirm({ window: { title: `Delete ${item.name}?` }, content: `<p>Throw away <strong>${esc(item.name)}</strong>? It's gone for good (to move it, use Take).</p>`, rejectClose: false });
    if (ok) return item.delete();
  }

  /** Take an item out to a character you own (it moves, with anything inside it). */
  static async #takeItem(event, target) {
    const item = this._itemFrom(target);
    if (!item) return;
    if (!canUseStorage(this.document)) return ui.notifications.warn(awayReason(this.document));
    const who = await pickCharacter(`Take ${item.name}`, `Who takes <strong>${esc(item.name)}</strong>?`);
    if (!who || !this.document.items.has(item.id)) return;
    if (!canUseStorage(this.document)) return ui.notifications.warn(awayReason(this.document));
    const data = item.toObject();
    delete data._id;
    data.system.inside = "";
    const [made] = await who.createEmbeddedDocuments("Item", [data]);
    if (!made) return;
    await settleMoved(item, made, who);
    await item.delete({ arneyanWho: who.name, arneyanForce: true });
    ui.notifications.info(`${who.name} took ${item.name}.`);
  }

  /** Move coins between a character and this place. */
  static async #moveCoins() {
    const actor = this.document;
    if (!canUseStorage(actor)) return ui.notifications.warn(awayReason(actor));
    const chars = ownedCharacters();
    if (!chars.length) return ui.notifications.warn("You have no character to move coins to or from.");
    const opts = chars.map(c => `<option value="${c.id}" ${c.id === game.user.character?.id ? "selected" : ""}>${esc(c.name)}</option>`).join("");
    const inputs = COINS.map(k => `<label>${k} <input type="number" name="${k}" min="0" value="0"></label>`).join("");
    const res = await DialogV2.wait({
      window: { title: `Coins: ${actor.name}`, icon: "fa-solid fa-coins" }, classes: ["arneyan", "arn-coin-dialog"],
      content: `<div class="arn-form"><label>Character <select name="who">${opts}</select></label><div class="arn-coins">${inputs}</div>
        <p class="arn-muted">Held here: ${coinText(actor.system.currency) || "nothing"}.</p></div>`,
      buttons: [
        { action: "in", label: "Put in", icon: "fa-solid fa-arrow-down", default: true, callback: (e, b) => read(b.form, "in") },
        { action: "out", label: "Take out", icon: "fa-solid fa-arrow-up", callback: (e, b) => read(b.form, "out") },
        { action: "cancel", label: "Cancel" }
      ],
      rejectClose: false
    });
    function read(form, dir) {
      const amt = Object.fromEntries(COINS.map(k => [k, Math.max(0, Math.floor(Number(form.elements[k].value) || 0))]));
      return { dir, who: form.elements.who.value, amt };
    }
    if (!res || typeof res !== "object" || !COINS.some(k => res.amt[k])) return;
    const who = game.actors.get(res.who);
    if (!who) return;
    // The GM may have moved the party on while the window was open.
    if (!canUseStorage(actor)) return ui.notifications.warn(awayReason(actor));
    const from = res.dir === "in" ? who : actor;
    const to = res.dir === "in" ? actor : who;
    const short = COINS.filter(k => (from.system.currency?.[k] ?? 0) < res.amt[k]);
    if (short.length) return ui.notifications.warn(`${from.name} hasn't got that many ${short.join(", ")}.`);
    if (res.dir === "in" && actor.system.capacity) {
      const after = Object.fromEntries(COINS.map(k => [k, (actor.system.currency[k] ?? 0) + res.amt[k]]));
      const items = actor.items.filter(i => GEAR.has(i.type));
      if (storageSlots(items, after) > actor.system.capacity) return ui.notifications.warn(`${actor.name} is full: that many coins won't fit (100 to a slot).`);
    }
    // Take from one side first; only once that worked, give to the other (nothing can stop half a move).
    const took = await from.update(Object.fromEntries(COINS.map(k => [`system.currency.${k}`, from.system.currency[k] - res.amt[k]])), { arneyanWho: who.name });
    if (!took) return;
    await to.update(Object.fromEntries(COINS.map(k => [`system.currency.${k}`, (to.system.currency?.[k] ?? 0) + res.amt[k]])), { arneyanWho: who.name, arneyanForce: true });
  }

  static #editNotes() {
    const { ArneyanTextEditor } = game.arneyan;
    return new ArneyanTextEditor(this.document, "system.details.notes", `${this.document.name}: notes`).render(true);
  }

  static #browse() { return game.arneyan.browser({ tab: "equipment", actor: this.document }); }

  static async #clearLedger() {
    if (!game.user.isGM) return;
    const ok = await DialogV2.confirm({ window: { title: "Clear the ledger?" }, content: `<p>Clear every entry in ${esc(this.document.name)}'s ledger?</p>`, rejectClose: false });
    if (ok) return this.document.update({ "system.ledger": [] }, { arneyanLedger: true });
  }
}

/** Characters this user can move things to: their own, or every player character for the GM. */
function ownedCharacters() {
  const list = game.user.isGM ? (partyMembers().length ? partyMembers() : game.actors.filter(a => a.type === "character"))
    : game.actors.filter(a => a.type === "character" && a.isOwner);
  return list;
}

async function pickCharacter(title, text) {
  const chars = ownedCharacters();
  if (!chars.length) { ui.notifications.warn("You have no character to give it to."); return null; }
  if (chars.length === 1) return chars[0];
  const id = await DialogV2.wait({
    window: { title }, classes: ["arneyan", "arn-give-dialog"], content: `<p>${text}</p>`,
    buttons: [...chars.map(c => ({ action: c.id, label: c.name, icon: "fa-solid fa-user" })), { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }],
    rejectClose: false
  });
  return game.actors.get(id) ?? null;
}

/* -------------------------------------------- */
/*  Guards and the ledger                       */
/* -------------------------------------------- */

const storageOf = doc => {
  const a = doc?.parent;
  return a instanceof Actor && a.type === "storage" && !a.pack ? a : null;
};

export function registerStorage() {
  // Only the GM deletes a place (players could otherwise throw away everything in it from afar).
  Hooks.on("preDeleteActor", actor => {
    if (actor.type !== "storage" || game.user.isGM) return;
    ui.notifications.warn("Only the GM can remove a storage place.");
    return false;
  });
  // Its tokens stay where the GM put them, with no vision.
  Hooks.on("preUpdateToken", token => {
    if (token.actor?.type !== "storage" || game.user.isGM) return;
    ui.notifications.warn("Only the GM moves or changes a storage place's token.");
    return false;
  });
  // The GM writes ledger entries sent by players.
  Hooks.once("ready", () => game.socket.on(SOCKET, data => {
    if (data?.action !== "storageLog" || !game.users.activeGM?.isSelf) return;
    const actor = game.actors.get(data.actorId);
    const e = data.entry ?? {};
    if (actor?.type !== "storage") return;
    writeLedger(actor, { when: String(e.when ?? "").slice(0, 80), worldTime: Number(e.worldTime) || 0, who: String(e.who ?? "").slice(0, 80), text: String(e.text ?? "").slice(0, 200) });
  }));

  // New places: the token is the place itself (linked), with no vision; every player may use it.
  Hooks.on("preCreateActor", (actor, data) => {
    if (actor.type !== "storage") return;
    const icon = ARNEYAN.storageIcon(data.system?.kind ?? "chest");
    const upd = {
      "prototypeToken.actorLink": true, "prototypeToken.sight.enabled": false,
      "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS?.NEUTRAL ?? 0, "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES?.HOVER ?? 30
    };
    if (!data.img || data.img === Actor.DEFAULT_ICON || data.img === CONST.DEFAULT_TOKEN) { upd.img = icon; upd["prototypeToken.texture.src"] = icon; }
    if (!(data.ownership?.default > 0)) upd["ownership.default"] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    actor.updateSource(foundry.utils.expandObject(upd));
  });

  // Away: players can't touch the contents or the coins. Full: nothing more goes in.
  Hooks.on("preCreateItem", (item, data, options, userId) => {
    const actor = storageOf(item);
    // Forced, or the contents of a container whose whole move was already checked.
    if (!actor || options?.arneyanForce || options?.arneyanContents) return;
    if (!GEAR.has(item.type)) { ui.notifications.warn("Storage holds gear: weapons, armour and equipment."); return false; }
    if (!canUseStorage(actor)) { ui.notifications.warn(awayReason(actor)); return false; }
    let inFree = false;
    for (let c = actor.items.get(item.system?.inside), n = 0; c && n < 8; c = actor.items.get(c.system?.inside), n++) if (c.system?.container?.weightless) inFree = true;
    if (!inFree && !fitsIn(actor, slotsOf(item))) {
      ui.notifications.warn(`${item.name} doesn't fit: ${actor.name} is full (${actor.system.usedSlots} of ${actor.system.capacity} slots).`);
      return false;
    }
  });
  for (const hook of ["preUpdateItem", "preDeleteItem"]) {
    Hooks.on(hook, (item, ...rest) => {
      const actor = storageOf(item);
      const options = hook === "preUpdateItem" ? rest[1] : rest[0];
      if (!actor || options?.arneyanForce || options?.arneyanContents || canUseStorage(actor)) return;
      ui.notifications.warn(awayReason(actor));
      return false;
    });
  }
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    if (actor.type !== "storage") return;
    // Coins can't be touched from afar; the rest (name, notes, ledger) can.
    if (foundry.utils.hasProperty(changes, "system.currency") && !options?.arneyanLedger && !canUseStorage(actor)) {
      ui.notifications.warn(awayReason(actor));
      return false;
    }
    if ((foundry.utils.hasProperty(changes, "system.here") || foundry.utils.hasProperty(changes, "system.capacity")) && !game.user.isGM) {
      ui.notifications.warn("Only the GM changes that.");
      return false;
    }
    if ("prototypeToken" in changes && !game.user.isGM) {
      ui.notifications.warn("Only the GM changes a storage place's token.");
      return false;
    }
    if (foundry.utils.hasProperty(changes, "system.currency")) options.arneyanPrevCoins = { ...actor.system.currency };
    // A new kind brings its own art, unless the GM chose a picture.
    const kind = foundry.utils.getProperty(changes, "system.kind");
    if (kind && kind !== actor.system.kind && String(actor.img).includes("/assets/icons/place-")) {
      changes.img = ARNEYAN.storageIcon(kind);
      foundry.utils.setProperty(changes, "prototypeToken.texture.src", changes.img);
    }
  });

  // The party sheet lists the places: keep it current.
  const reParty = actor => { if (actor?.type === "storage") for (const app of foundry.applications.instances?.values?.() ?? []) if (app.document?.type === "party" && app.rendered) app.render(); };
  for (const hook of ["createActor", "updateActor", "deleteActor"]) Hooks.on(hook, a => reParty(a));

  // The ledger, written by whoever made the change.
  Hooks.on("createItem", (item, options, userId) => {
    const actor = storageOf(item);
    if (actor && userId === game.user.id && !options?.arneyanContents) logStorage(actor, `Put in ${item.name}${(item.system.quantity ?? 1) !== 1 ? ` × ${item.system.quantity}` : ""}`, options);
  });
  Hooks.on("deleteItem", (item, options, userId) => {
    const actor = storageOf(item);
    if (actor && userId === game.user.id && !options?.arneyanContents) logStorage(actor, `Took out ${item.name}${(item.system.quantity ?? 1) !== 1 ? ` × ${item.system.quantity}` : ""}`, options);
  });
  Hooks.on("updateItem", (item, changes, options, userId) => {
    const actor = storageOf(item);
    const q = foundry.utils.getProperty(changes, "system.quantity");
    if (actor && userId === game.user.id && q !== undefined) logStorage(actor, `${item.name}: now × ${q}`, options);
  });
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (actor.type !== "storage" || userId !== game.user.id || options?.arneyanLedger || !foundry.utils.hasProperty(changes, "system.currency")) return;
    const prev = options.arneyanPrevCoins;
    if (!prev) return;
    const diff = Object.fromEntries(COINS.map(k => [k, (actor.system.currency[k] ?? 0) - (prev[k] ?? 0)]));
    const added = coinText(Object.fromEntries(COINS.map(k => [k, Math.max(0, diff[k])])));
    const taken = coinText(Object.fromEntries(COINS.map(k => [k, Math.max(0, -diff[k])])));
    const text = [added && `Put in ${added}`, taken && `Took out ${taken}`].filter(Boolean).join("; ");
    if (text) logStorage(actor, text, options);
  });
}

/**
 * The party, PF2e style: a "Player Characters" folder holding a Party actor whose sheet shows the
 * members, a shared stash and notes, and whose token stands in for the group on travel maps.
 * Items dragged between the party and a member (either way) move rather than copy.
 */
import { ARNEYAN } from "./config.mjs";
import { itemFacts, bindItemWindows, itemToChat } from "./expand.mjs";
import { statusesOf } from "./effects.mjs";
import { putOutData } from "./gear.mjs";
import { worldPartyContext, WORLD_PARTY_ACTIONS } from "./world.mjs";
import { confirmRestInFight } from "./fight.mjs";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const SYS = "arneyan";
const GEAR = new Set(["weapon", "armour", "equipment"]);
const FOLDER = "Player Characters";
const ALLIES = "Allies, Mounts & Pets";
const PARTY_IMG = `systems/${SYS}/assets/icons/party.svg`;

/** The world's active party actor, if there is one. */
export function activeParty() {
  const id = game.settings.get(SYS, "partyId");
  return (id && game.actors.get(id)) || game.actors.find(a => a.type === "party") || null;
}

/** Move (not copy) gear dropped from another actor this user owns. Shared by both sheets. */
/** Gear on a sheet you can only look at can't be dragged off it (that would copy it). */
export function blockedCopy(item) {
  // A storage place the party isn't at: look, don't touch.
  const place = item?.parent;
  if (place instanceof Actor && place.type === "storage" && !place.pack && !game.user.isGM && !(place.system.here && place.isOwner)) {
    ui.notifications.warn(`${place.name} is somewhere else. The GM marks it "Party is here" when you're there.`);
    return true;
  }
  if (item?.parent instanceof Actor && !item.parent.pack && !item.parent.isOwner && GEAR.has(item.type)) {
    ui.notifications.warn(`You can't take ${item.name} from ${item.parent.name}.`);
    return true;
  }
  return false;
}

export async function moveDroppedItem(sheet, item, created) {
  if (!created || !item?.parent || item.parent.pack || !(item.parent instanceof Actor)) return;
  if (item.parent.uuid === sheet.document.uuid || !GEAR.has(item.type) || !item.parent.isOwner) return;
  const made = Array.isArray(created) ? created[0] : created;
  if (!made) return;
  await settleMoved(item, made, sheet.document);
  // Permission was checked when the move began: once the copy exists, the original goes.
  await item.delete({ arneyanForce: true });
}

/**
 * After gear moves to another sheet: a container brings what's inside it, and the copy isn't left pointing
 * at a container on the old sheet.
 */
export async function settleMoved(item, made, target) {
  if (!made) return;
  // A lit torch handed over goes out (the new owner lights it).
  if (made.system?.light?.lit) await made.update(putOutData(made.system.light), { arneyanForce: true });
  if (made.system?.inside && !target.items.has(made.system.inside)) await made.update({ "system.inside": "" }, { arneyanForce: true });
  if (item.system?.container?.holds) await moveContents(item.parent, item.id, target, made.id);
}

async function moveContents(source, oldId, target, newId, depth = 0) {
  if (depth > 8) return;
  for (const i of source.items.filter(x => x.system?.inside === oldId)) {
    const data = i.toObject();
    delete data._id;
    data.system.inside = newId;
    const [copy] = await target.createEmbeddedDocuments("Item", [data], { arneyanContents: true });
    // Refused (a full storage place, say): it stays where it was.
    if (!copy) continue;
    if (i.system?.container?.holds) await moveContents(source, i.id, target, copy.id, depth + 1);
    await i.delete({ arneyanContents: true, arneyanForce: true });
  }
}

/* -------------------------------------------- */
/*  Giving gear to another character            */
/* -------------------------------------------- */

const GIVE_SOCKET = `system.${SYS}`;

/** Move an item (and what's inside it) from one actor to another. Returns the copy, or null. */
async function moveItemTo(item, target) {
  const data = item.toObject();
  delete data._id;
  data.system.inside = "";
  data.system.equipped = false;
  const [made] = await target.createEmbeddedDocuments("Item", [data]);
  if (!made) return null;
  await settleMoved(item, made, target);
  await item.delete({ arneyanForce: true });
  return made;
}

/**
 * Give a piece of gear to another character (a party member, or anyone in Allies, Mounts & Pets). Your own
 * characters get it straight away; anyone else's goes through the GM, who moves it.
 */
export async function giveItemTo(item) {
  const from = item?.actor;
  if (!from?.isOwner || !GEAR.has(item.type)) return;
  const allies = alliesFolder();
  const inAllies = a => { for (let f = a.folder; f && allies; f = f.folder) if (f.id === allies.id) return true; return false; };
  const others = [...partyMembers(), ...game.actors.filter(a => a.type !== "party" && a.type !== "storage" && inAllies(a))]
    .filter((a, i, list) => a.id !== from.id && list.findIndex(b => b.id === a.id) === i);
  if (!others.length) return ui.notifications.warn("There's nobody in the party to give it to.");
  const id = await DialogV2.wait({
    window: { title: `Give ${item.name}` }, classes: ["arneyan", "arn-give-dialog"],
    content: `<p>Who gets <strong>${foundry.utils.escapeHTML(item.name)}</strong>${item.system.container?.holds ? " (and what's inside it)" : ""}?</p>`,
    buttons: [...others.map(a => ({ action: a.id, label: a.name, icon: "fa-solid fa-user" })), { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }],
    rejectClose: false
  });
  const to = game.actors.get(id);
  if (!to || !from.items.has(item.id)) return;
  if (to.isOwner) {
    const made = await moveItemTo(item, to);
    if (made) say(`${from.name} gives ${item.name} to ${to.name}.`, from);
    return made;
  }
  if (!game.users.activeGM) return ui.notifications.warn(`Giving to ${to.name} needs the GM online (you don't control them).`);
  game.socket.emit(GIVE_SOCKET, { action: "giveItem", fromUuid: from.uuid, itemId: item.id, toId: to.id });
  ui.notifications.info(`Handing ${item.name} to ${to.name}...`);
}

function say(text, actor) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card"><p><i class="fa-solid fa-hand-holding"></i> ${foundry.utils.escapeHTML(text)}</p></div>` });
}

/** The GM's side: the giver must own the item, and the receiver must be a party member or one of its allies. */
const giving = new Set();
async function onGiveSocket(msg, senderId) {
  if (msg?.action !== "giveItem" || !game.users.activeGM?.isSelf) return;
  const key = String(msg.itemId ?? "");
  if (giving.has(key)) return;
  giving.add(key);
  try { await giveFromSocket(msg, senderId); } finally { giving.delete(key); }
}
async function giveFromSocket(msg, senderId) {
  const sender = game.users.get(senderId);
  const from = await fromUuid(String(msg.fromUuid ?? "")).catch(() => null);
  const item = from?.items?.get(String(msg.itemId ?? ""));
  const to = game.actors.get(String(msg.toId ?? ""));
  if (!sender || !(from instanceof Actor) || from.pack || !item || !to || to.pack || !GEAR.has(item.type)) return;
  if (!from.testUserPermission(sender, "OWNER")) return;
  const allies = alliesFolder();
  const inAllies = a => { for (let f = a.folder; f && allies; f = f.folder) if (f.id === allies.id) return true; return false; };
  if (!partyMembers().some(a => a.id === to.id) && !inAllies(to)) return;
  const made = await moveItemTo(item, to);
  if (made) say(`${from.name} gives ${item.name} to ${to.name}.`, from);
}

/* -------------------------------------------- */
/*  The sheet                                   */
/* -------------------------------------------- */

/** What the party token sees, for the sheet: the best-sighted member's vision and every special sense. */
async function partySight(party) {
  const { visionFor } = await import("./tokens.mjs");
  const v = visionFor(party);
  const names = { seeAll: "Truesight", senseAll: "Blindsight", feelTremor: "Tremorsense" };
  const base = v.mode === "darkvision" ? `Darkvision ${v.range}ft` : v.mode === "lightAmplification" ? "Low-Light Vision" : "Normal sight";
  const extra = (v.detect ?? []).map(d => `${names[d.id] ?? d.id} ${d.range}ft`);
  return { label: [base, ...extra].join(", "), from: v.from ?? "" };
}

export class ArneyanPartySheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["arneyan", "sheet", "actor", "party"],
    position: { width: 760, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      changeTab: ArneyanPartySheet.#changeTab,
      itemExpand: ArneyanPartySheet.#itemExpand,
      itemChat: ArneyanPartySheet.#itemChat,
      openMember: ArneyanPartySheet.#openMember,
      removeMember: ArneyanPartySheet.#removeMember,
      itemEdit: ArneyanPartySheet.#itemEdit,
      itemDelete: ArneyanPartySheet.#itemDelete,
      giveItem: ArneyanPartySheet.#giveItem,
      gather: ArneyanPartySheet.#gather,
      deploy: ArneyanPartySheet.#deploy,
      splitCoins: ArneyanPartySheet.#splitCoins,
      editNotes: ArneyanPartySheet.#editNotes,
      browse: ArneyanPartySheet.#browse,
      openPlace: ArneyanPartySheet.#openPlace,
      newPlace: ArneyanPartySheet.#newPlace,
      encounter: () => game.arneyan.encounter(),
      askRoll: () => game.arneyan.askRoll?.(),
      awardXp: () => game.arneyan.awardXp?.(),
      restParty: ArneyanPartySheet.#restParty,
      partyControl: () => partyControl(),
      ...WORLD_PARTY_ACTIONS
    }
  };

  static PARTS = { sheet: { template: "systems/arneyan/templates/actor/party-sheet.hbs", scrollable: [".arn-body"] } };

  _activeTab = "members";

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const members = partyMembers().map(m => {
      const s = m.system;
      const hp = s.attributes?.hp ?? { value: 0, max: 1 };
      const st = statusesOf(m);
      return {
        id: m.id, name: m.name, img: m.img, canOpen: m.testUserPermission(game.user, "OBSERVER"),
        classLabel: s.classLabel || "No class yet", level: s.level ?? 1,
        hp: hp.value, hpMax: hp.max, hpPct: Math.clamp(Math.round((Math.max(0, hp.value) / Math.max(1, hp.max)) * 100), 0, 100),
        ac: s.attributes?.ac?.value ?? "-", luck: s.luck?.value ?? "-", speed: s.attributes?.speedNow ?? "-",
        exhaustion: s.attributes?.exhaustion ?? 0,
        xp: s.attributes?.xp ?? 0, xpRate: s.xpRate ?? 10, levelReady: (s.attributes?.xp ?? 0) >= (s.xpRate ?? 10),
        conditions: [...st].map(id => ({ id, name: ARNEYAN.conditions[id]?.name ?? id, img: `systems/${SYS}/assets/conditions/${id}.svg` }))
      };
    });
    const sort = (a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name);
    const enrichDesc = html => foundry.applications.ux.TextEditor.implementation.enrichHTML(html ?? "", { relativeTo: actor, secrets: actor.isOwner });
    const stash = await Promise.all(actor.items.contents.sort(sort).map(async i => ({ id: i.id, name: i.name, img: i.img, type: i.type,
      qty: i.system.quantity ?? 1, slots: i.system.totalSlots ?? "", price: i.system.price ?? "",
      expanded: this._expanded.has(i.id), facts: this._expanded.has(i.id) ? itemFacts(i) : [], desc: this._expanded.has(i.id) ? await enrichDesc(i.system.description) : "" })));
    const speeds = members.map(m => Number(m.speed)).filter(Number.isFinite);
    Object.assign(context, {
      actor, system: actor.system, source: actor._source.system, editable: this.isEditable, isGM: game.user.isGM,
      activeTab: this._activeTab,
      tabs: [["members", "Members"], ["stash", "Stash"], ["travel", "Travel"], ["camp", "Camp"], ["notes", "Notes"]].map(([id, label]) => ({ id, label, active: id === this._activeTab })),
      members, stash,
      places: game.actors.filter(a => a.type === "storage" && a.testUserPermission(game.user, "OBSERVER")).sort((a, b) => a.name.localeCompare(b.name))
        .map(a => ({ id: a.id, name: a.name, img: a.img, location: a.system.location, here: a.system.here, slots: a.system.usedSlots, capacity: a.system.capacity })),
      travelSpeed: speeds.length ? Math.min(...speeds) : "-",
      sight: await partySight(actor),
      avgLevel: members.length ? Math.round(members.reduce((t, m) => t + m.level, 0) / members.length * 10) / 10 : "-",
      notes: await foundry.applications.ux.TextEditor.implementation.enrichHTML(actor.system.details.notes ?? "", { relativeTo: actor, secrets: actor.isOwner })
    });
    Object.assign(context, await worldPartyContext(actor, partyMembers()));
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const el of this.element.querySelectorAll(".arn-tab")) el.hidden = el.dataset.tab !== this._activeTab;
    bindItemWindows(this);
    for (const r of this.element.querySelectorAll("[data-item-id][draggable]")) {
      r.addEventListener("dragstart", ev => {
        const item = this.document.items.get(r.dataset.itemId);
        if (item) ev.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
      });
    }
    for (const r of this.element.querySelectorAll("[data-member-id][draggable]")) {
      r.addEventListener("dragstart", ev => {
        const a = game.actors.get(r.dataset.memberId);
        if (a) ev.dataTransfer.setData("text/plain", JSON.stringify(a.toDragData()));
      });
    }
  }

  /** Dropping a character adds it as a member; dropping gear puts it in the stash. */
  async _onDropActor(event, actor) {
    if (actor?.type !== "character" || actor.pack) return ui.notifications.warn("Only player characters from the Actors sidebar can join the party.");
    return addMember(this.document, actor);
  }

  async _onDropItem(event, item) {
    if (!GEAR.has(item?.type)) return ui.notifications.warn("The stash holds gear: weapons, armour and equipment.");
    if (blockedCopy(item)) return null;
    const created = await super._onDropItem?.(event, item);
    await moveDroppedItem(this, item, created);
    return created;
  }

  _itemFrom(target) {
    return this.document.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  }

  /** Rest every member at once: one place for everyone, one summary card. */
  static async #restParty() {
    if (!game.user.isGM) return ui.notifications.warn("The GM rests the party.");
    const members = partyMembers();
    if (!members.length) return ui.notifications.warn("No party members to rest.");
    if (!(await confirmRestInFight(members))) return;
    const where = await foundry.applications.api.DialogV2.wait({
      window: { title: "Rest the party" },
      content: `<p>Where is the party resting? Each member heals as on their own sheet (safe haven: largest Hit Die + Con a night; camp with shelter: Con modifier, minimum 1; in the open: 1 HP), and spell slots, daily abilities and staffs come back.</p>`,
      buttons: [
        { action: "haven", label: "Safe haven", icon: "fa-solid fa-house" },
        { action: "shelter", label: "Camp, shelter", icon: "fa-solid fa-campground", default: true },
        { action: "open", label: "Camp, open", icon: "fa-solid fa-moon" }
      ],
      rejectClose: false
    });
    if (!where) return;
    const lines = [];
    for (const m of members) lines.push(await m.restAt(where, { quiet: true }));
    const label = { haven: "in a safe haven", shelter: "in camp with shelter", open: "in the open" }[where];
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.document }),
      content: `<div class="arn-card arn-report"><header class="arn-card-title"><i class="fa-solid fa-campground"></i> <span>The party rests ${label}</span></header>
        <ul>${lines.filter(Boolean).map(l => `<li>${foundry.utils.escapeHTML(l)}</li>`).join("")}</ul>
        <p class="arn-muted">Spell slots and daily abilities restored, temporary HP gone. Luck does not recover with rest.</p></div>`
    });
  }

  static #changeTab(event, target) { this._activeTab = target.dataset.tab; this.render(); }
  static #openMember(event, target) { game.actors.get(target.closest("[data-member-id]").dataset.memberId)?.sheet.render(true); }
  static async #removeMember(event, target) {
    return removeMember(game.actors.get(target.closest("[data-member-id]").dataset.memberId));
  }
  static #itemEdit(event, target) { return this._itemFrom(target)?.sheet.render(true); }
  /** Stash rows opened to read (click the name). */
  _expanded = new Set();
  static #itemChat(event, target) { return itemToChat(this._itemFrom(target)); }
  static #itemExpand(event, target) {
    const item = this._itemFrom(target);
    if (!item) return;
    if (this._expanded.has(item.id)) this._expanded.delete(item.id);
    else this._expanded.add(item.id);
    this.render();
  }

  static async #itemDelete(event, target) {
    const item = this._itemFrom(target);
    if (!item) return;
    const ok = await DialogV2.confirm({ window: { title: `Delete ${item.name}?` }, content: `<p>Remove <strong>${item.name}</strong> from the stash?</p>` });
    if (ok) return item.delete();
  }
  /** Give a stash item to a member (moves it): pick who in a small window. */
  static async #giveItem(event, target) {
    const item = this._itemFrom(target);
    if (!item) return;
    const members = partyMembers().filter(m => m.isOwner);
    if (!members.length) return ui.notifications.warn("There's no party member you can give items to.");
    const id = await DialogV2.wait({
      window: { title: `Give ${item.name}` },
      classes: ["arneyan", "arn-give-dialog"],
      content: `<p>Who gets <strong>${foundry.utils.escapeHTML?.(item.name) ?? item.name}</strong>?</p>`,
      buttons: [...members.map(m => ({ action: m.id, label: m.name, icon: "fa-solid fa-user" })), { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }],
      rejectClose: false
    });
    const member = game.actors.get(id);
    if (!member) return;
    const data = item.toObject();
    delete data._id;
    const [made] = await member.createEmbeddedDocuments("Item", [data]);
    if (!made) return;
    await settleMoved(item, made, member);
    await item.delete({ arneyanForce: true });
    ui.notifications.info(`${item.name} given to ${member.name}.`);
  }
  static #gather() { return gatherParty(this.document); }
  static #deploy() { return deployParty(this.document); }
  static #editNotes() {
    const { ArneyanTextEditor } = game.arneyan;
    return new ArneyanTextEditor(this.document, "system.details.notes", "Party notes").render(true);
  }
  static #browse() { return game.arneyan.browser({ tab: "equipment", actor: this.document }); }
  static #openPlace(event, target) { game.actors.get(target.closest("[data-place-id]").dataset.placeId)?.sheet.render(true); }
  static async #newPlace() {
    if (!game.user.isGM) return;
    const place = await Actor.create({ name: "New storage", type: "storage" });
    place?.sheet.render(true);
  }
  /** Share the stash's coins evenly between the members (remainders stay in the stash). */
  static async #splitCoins() {
    if (!game.user.isGM) return ui.notifications.warn("Ask the GM to split the coins.");
    const members = partyMembers();
    if (!members.length) return ui.notifications.warn("The party has no members.");
    const cur = this.document.system.currency;
    const share = {}, left = {};
    for (const k of Object.keys(cur)) { share[k] = Math.floor(cur[k] / members.length); left[k] = cur[k] - share[k] * members.length; }
    const ok = await DialogV2.confirm({ window: { title: "Split coins" }, content: `<p>Give each of ${members.length} members ${Object.entries(share).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing"}?</p>` });
    if (!ok) return;
    for (const m of members) {
      const c = m.system.currency;
      await m.update(Object.fromEntries(Object.keys(share).map(k => [`system.currency.${k}`, (c?.[k] ?? 0) + share[k]])));
    }
    return this.document.update(Object.fromEntries(Object.entries(left).map(([k, v]) => [`system.currency.${k}`, v])));
  }
}

/* -------------------------------------------- */
/*  Members, gather and deploy                  */
/* -------------------------------------------- */

/** The party folder (it can't be deleted). */
export function partyFolder() {
  const id = game.settings.get(SYS, "partyFolderId");
  return (id && game.folders.get(id)) || game.folders.find(f => f.type === "Actor" && f.name === FOLDER) || null;
}

/** The "Allies, Mounts & Pets" folder inside the party folder: travels with the party, isn't in it. */
export function alliesFolder() {
  const pf = partyFolder();
  if (!pf) return null;
  const id = game.settings.get(SYS, "alliesFolderId");
  const f = id && game.folders.get(id);
  return f || game.folders.find(x => x.type === "Actor" && x.name === ALLIES && x.folder?.id === pf.id) || null;
}

/** Every player character in the party folder (or a folder inside it, except Allies, Mounts & Pets) is a member. */
export function partyMembers() {
  const folder = partyFolder();
  if (!folder) return [];
  const allies = alliesFolder();
  const inside = f => { for (let x = f; x; x = x.folder) { if (allies && x.id === allies.id) return false; if (x.id === folder.id) return true; } return false; };
  return game.actors.filter(a => a.type === "character" && a.folder && inside(a.folder) && !a.flags?.["item-piles"]?.data?.enabled).sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
}

/** Joining the party = moving into the party folder; leaving = moving out to the top level. */
export async function addMember(party, actor) {
  const folder = partyFolder();
  if (!folder || actor?.type !== "character" || actor.pack) return;
  if (partyMembers().some(m => m.id === actor.id)) return;
  if (!actor.isOwner) return ui.notifications.warn(`You can't move ${actor.name}; ask the GM.`);
  await actor.update({ folder: folder.id });
}

export async function removeMember(actor) {
  if (!actor?.isOwner) return ui.notifications.warn(`You can't move ${actor?.name}; ask the GM.`);
  await actor.update({ folder: null });
}

/** Replace the members' tokens on this scene with the party token (GM). */
export async function gatherParty(party) {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can gather the party.");
  const scene = canvas.scene;
  if (!scene) return;
  const ids = new Set(partyMembers().map(a => a.id));
  // (A member in another form: its token is the form's, and remembers whose it is.)
  const whose = t => t.getFlag?.(SYS, "shapeBefore")?.actorId ?? t.actorId;
  const tokens = scene.tokens.filter(t => ids.has(whose(t)));
  const fighting = game.combats.some(c => c.scene?.id === scene.id && c.combatants.some(cb => ids.has(cb.actorId)));
  if (fighting) {
    const ok = await DialogV2.confirm({ window: { title: "Gather the party?" }, content: "<p>Party members are in a combat on this scene. Gathering removes their tokens and their places in the combat. Carry on?</p>" });
    if (!ok) return;
  }
  const existing = scene.tokens.find(t => t.actorId === party.id);
  let x, y;
  if (tokens.length) {
    x = tokens.reduce((s, t) => s + t.x, 0) / tokens.length;
    y = tokens.reduce((s, t) => s + t.y, 0) / tokens.length;
  } else if (!existing) {
    const c = canvas.stage?.pivot ?? { x: scene.dimensions.width / 2, y: scene.dimensions.height / 2 };
    x = c.x; y = c.y;
  }
  if (tokens.length) await scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id));
  const snap = p => canvas.grid?.getSnappedPoint ? canvas.grid.getSnappedPoint(p, { mode: CONST.GRID_SNAPPING_MODES?.TOP_LEFT_CORNER ?? 256 }) : p;
  if (existing) {
    if (x !== undefined) await existing.update(snap({ x, y }));
  } else {
    const doc = await party.getTokenDocument(snap({ x, y }));
    await scene.createEmbeddedDocuments("Token", [doc.toObject()]);
  }
  ui.notifications.info(`${party.name} gathered${tokens.length ? ` (${tokens.length} tokens)` : ""}.`);
}

/** Put each member's token around the party token, then remove the party token (GM). */
export async function deployParty(party) {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can deploy the party.");
  const scene = canvas.scene;
  if (!scene) return;
  const pt = scene.tokens.find(t => t.actorId === party.id);
  const size = scene.grid.size;
  const cx = pt?.x ?? (canvas.stage?.pivot?.x ?? 0);
  const cy = pt?.y ?? (canvas.stage?.pivot?.y ?? 0);
  const onScene = new Set(scene.tokens.map(t => t.getFlag?.(SYS, "shapeBefore")?.actorId ?? t.actorId));
  const members = partyMembers().filter(m => !onScene.has(m.id));
  const ring = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, -1], [1, -1], [-1, 1], [2, 0], [0, 2], [2, 1], [1, 2], [-2, 0], [0, -2], [2, 2]];
  const data = [];
  for (const [i, m] of members.entries()) {
    const [dx, dy] = ring[i % ring.length];
    const pos = { x: cx + dx * size, y: cy + dy * size };
    const snapped = canvas.grid?.getSnappedPoint ? canvas.grid.getSnappedPoint(pos, { mode: CONST.GRID_SNAPPING_MODES?.TOP_LEFT_CORNER ?? 256 }) : pos;
    const doc = await m.getTokenDocument(snapped);
    data.push(doc.toObject());
  }
  if (data.length) await scene.createEmbeddedDocuments("Token", data);
  if (pt) await pt.delete();
  ui.notifications.info(`${party.name} deployed${data.length ? ` (${data.length} tokens)` : ""}.`);
}

/* -------------------------------------------- */
/*  Setup and hooks                             */
/* -------------------------------------------- */

async function ensureFolder() {
  const found = partyFolder();
  if (found) {
    if (game.settings.get(SYS, "partyFolderId") !== found.id) await game.settings.set(SYS, "partyFolderId", found.id);
    return found;
  }
  const f = await Folder.create({ name: FOLDER, type: "Actor", color: "#1A3320", sorting: "m" });
  await game.settings.set(SYS, "partyFolderId", f.id);
  return f;
}

/**
 * Why players can or can't move the party token (player feedback, 23 Oct 2026), and a button to let them all.
 * Ownership: an explicit level for a player (Observer, say) beats the Default, so Default: Owner alone isn't enough.
 */
export function partyControlReport(party = activeParty(), scene = globalThis.canvas?.scene ?? game.scenes?.viewed) {
  const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const players = [...(game.users ?? [])].filter(u => !u.isGM);
  const lvl = id => party?.ownership?.[id];
  const rows = players.map(u => {
    const own = party?.testUserPermission?.(u, "OWNER");
    const explicit = lvl(u.id);
    return { name: u.name, own, why: own ? "Owner" : explicit !== undefined && explicit !== -1 && explicit < OWNER ? "set lower for this player, which beats the Default" : "not an Owner" };
  });
  const toks = scene?.tokens?.filter?.(t => t.actorId === party?.id) ?? [];
  const issues = [];
  if (!toks.length) issues.push("There's no party token on this scene (Gather puts one here).");
  for (const tk of toks) {
    if (!tk.actorLink) issues.push("The party token on this scene isn't linked to the party: drag a new one from the party, or use Gather.");
    if (tk.locked) issues.push("The party token is locked (Token settings): nobody can drag it.");
    if (tk.hidden) issues.push("The party token is hidden from players.");
  }
  if (game.paused) issues.push("The game is paused: players can't move tokens until it's unpaused.");
  return { rows, issues, allOwn: rows.every(r => r.own) };
}

export async function letPlayersMoveParty(party = activeParty()) {
  if (!game.user.isGM || !party) return;
  const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const upd = { "ownership.default": OWNER };
  for (const u of game.users.filter(u => !u.isGM)) {
    const l = party.ownership?.[u.id];
    if (l !== undefined && l < OWNER) upd[`ownership.${u.id}`] = OWNER;
  }
  await party.update(upd);
}

async function partyControl() {
  const party = activeParty();
  if (!game.user.isGM || !party) return;
  const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
  const r = partyControlReport(party);
  const content = `<p>Players can select and move the party token when they're an Owner of the party.</p>
    <ul>${r.rows.map(x => `<li><strong>${esc(x.name)}</strong>: ${x.own ? "can move it" : `can't (${esc(x.why)})`}</li>`).join("") || "<li>No players.</li>"}</ul>
    ${r.issues.length ? `<p><strong>Also on this scene:</strong></p><ul>${r.issues.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}`;
  const go = await foundry.applications.api.DialogV2.wait({
    window: { title: `${party.name}: who can move the token`, icon: "fa-solid fa-hand-pointer" }, classes: ["arneyan"], position: { width: 460 },
    content,
    buttons: [{ action: "all", label: "Let every player move it", icon: "fa-solid fa-users", default: !r.allOwn }, { action: "close", label: "Close", default: r.allOwn }],
    rejectClose: false
  });
  if (go !== "all") return;
  await letPlayersMoveParty(party);
  ui.notifications.info(`Every player is now an Owner of ${party.name} and can move its token.`);
}

async function ensureAllies(folder) {
  let f = alliesFolder();
  if (!f && folder) f = await Folder.create({ name: ALLIES, type: "Actor", folder: folder.id, color: "#2f4a35", sorting: "a" });
  if (f && game.settings.get(SYS, "alliesFolderId") !== f.id) await game.settings.set(SYS, "alliesFolderId", f.id);
  return f;
}

async function ensureParty(folder) {
  let party = activeParty();
  if (!party) {
    party = await Actor.create({
      name: "The Party", type: "party", img: PARTY_IMG, folder: folder?.id ?? null,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
      prototypeToken: { name: "The Party", actorLink: true, disposition: 1, texture: { src: PARTY_IMG }, sight: { enabled: true } }
    });
  }
  if (game.settings.get(SYS, "partyId") !== party.id) await game.settings.set(SYS, "partyId", party.id);
  return party;
}

/** Put the party icon in the party folder's header in the Actors sidebar, and hide the party's own row. */
function decorateDirectory(app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const folder = partyFolder();
  const party = activeParty();
  if (!root || !folder || !party) return;
  root.querySelectorAll(`[data-entry-id="${party.id}"], [data-document-id="${party.id}"]`).forEach(el => { el.hidden = true; });
  const li = root.querySelector(`[data-folder-id="${folder.id}"]`);
  const header = li?.querySelector(".folder-header, header, h3");
  if (!header) return;
  // First in the list whatever the sorting, and it can't be dragged about.
  if (li.parentElement && li.parentElement.firstElementChild !== li) li.parentElement.prepend(li);
  li.classList.add("arn-party-folder");
  for (const f of [folder, alliesFolder()].filter(Boolean)) {
    const el = root.querySelector(`[data-folder-id="${f.id}"]`);
    const head = el?.querySelector(".folder-header, header, h3");
    if (!el || el.dataset.arnPinned) continue;
    el.dataset.arnPinned = "1";
    el.addEventListener("dragstart", ev => {
      if (ev.target.closest?.(".arn-party-badge")) return;
      if (ev.target === el || (head && head.contains(ev.target))) { ev.preventDefault(); ev.stopPropagation(); }
    }, true);
    if (head) head.draggable = false;
  }
  if (header.querySelector(".arn-party-badge")) return;
  const a = document.createElement("a");
  a.className = "arn-party-badge";
  a.draggable = true;
  a.dataset.tooltip = `${party.name}: click to open the party sheet, drag onto a scene for the party token`;
  const img = document.createElement("img");
  img.src = party.img || PARTY_IMG;
  img.alt = party.name;
  a.append(img);
  a.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); party.sheet.render(true); });
  a.addEventListener("dragstart", ev => { ev.stopPropagation(); ev.dataTransfer.setData("text/plain", JSON.stringify(party.toDragData())); });
  header.prepend(a);
}

export function registerParty() {
  Hooks.once("ready", () => game.socket.on(GIVE_SOCKET, onGiveSocket));
  game.settings.register(SYS, "partyId", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(SYS, "partySetup", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register(SYS, "partyFolderId", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(SYS, "alliesFolderId", { scope: "world", config: false, type: String, default: "" });

  Hooks.once("ready", async () => {
    if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
    try {
      const folder = await ensureFolder();
      await ensureParty(folder);
      await ensureAllies(folder);
      // The party folder sits at the top of the Actors sidebar, also when it's sorted by hand.
      if (folder.folder) await folder.update({ folder: null }, { arneyanForce: true });
      const lowest = Math.min(0, ...game.folders.filter(f => f.type === "Actor" && !f.folder && f.id !== folder.id).map(f => f.sort ?? 0));
      if ((folder.sort ?? 0) >= lowest) await folder.update({ sort: lowest - 100000 }, { arneyanForce: true });
      if (!game.settings.get(SYS, "partySetup")) {
        // Once per world: player characters with no folder join the party folder.
        for (const a of game.actors.filter(a => a.type === "character" && !a.folder && a.hasPlayerOwner)) await a.update({ folder: folder.id });
        await game.settings.set(SYS, "partySetup", true);
      }
      // Members listed by 0.4.2 (before membership became the folder) move into it, once.
      const party = activeParty();
      const listed = (party?._source?.system?.members ?? []).map(id => game.actors.get(id)).filter(a => a?.type === "character");
      if (party && (party._source.system.members ?? []).length) {
        const members = new Set(partyMembers().map(a => a.id));
        for (const a of listed.filter(a => !members.has(a.id))) await a.update({ folder: folder.id });
        await party.update({ "system.members": [] });
      }
      ui.actors?.render();
    } catch (err) {
      console.warn("Arneyan | Party setup failed", err);
    }
  });

  // The party folder and the party itself can't be deleted.
  Hooks.on("preDeleteFolder", (folder, options) => {
    if (options?.arneyanForce) return;
    const pf = partyFolder();
    let inside = false;
    for (let x = pf; x; x = x.folder) if (x.id === folder.id) inside = true;
    if (inside) {
      ui.notifications.warn("The Player Characters folder holds the party and can't be deleted. Move characters out of it instead.");
      return false;
    }
    if (folder.id === alliesFolder()?.id) {
      ui.notifications.warn("Allies, Mounts & Pets stays. Move creatures out of it instead.");
      return false;
    }
  });
  // The party folder stays at the top level, and Allies, Mounts & Pets stays inside it.
  Hooks.on("preUpdateFolder", (folder, changes, options) => {
    if (options?.arneyanForce || !("folder" in changes)) return;
    const pf = partyFolder();
    if (pf && folder.id === pf.id && changes.folder) {
      ui.notifications.warn("The Player Characters folder stays at the top of the sidebar.");
      return false;
    }
    const allies = alliesFolder();
    if (pf && allies && folder.id === allies.id && changes.folder !== pf.id) {
      ui.notifications.warn("Allies, Mounts & Pets stays inside the Player Characters folder.");
      return false;
    }
  });
  Hooks.on("preDeleteActor", (actor, options) => {
    if (!options?.arneyanForce && actor.type === "party" && actor.id === game.settings.get(SYS, "partyId")) {
      ui.notifications.warn("The party can't be deleted. Rename it from its sheet if you like.");
      return false;
    }
  });

  // New player characters go in the party folder.
  Hooks.on("createActor", async actor => {
    if (actor.type !== "character" || actor.pack || actor.folder || actor.getFlag(SYS, "transform") || actor.flags?.["item-piles"] || !game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
    const folder = partyFolder();
    if (folder) await actor.update({ folder: folder.id });
  });

  Hooks.on("renderActorDirectory", decorateDirectory);

  // Members' changes show on the party sheet straight away.
  for (const hook of ["updateActor", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "createItem", "updateItem", "deleteItem"]) {
    Hooks.on(hook, doc => {
      const actor = doc instanceof Actor ? doc : doc.parent;
      if (!(actor instanceof Actor) || actor.type !== "character") return;
      const party = activeParty();
      if (party?.sheet?.rendered) party.sheet.render();
    });
  }
}

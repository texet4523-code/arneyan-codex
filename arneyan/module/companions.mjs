/**
 * Familiars, animal companions and mounts (Drop 4), PF2e familiar style: each is its own NPC actor, linked to its
 * master by flags.arneyan.companion = { master, preset, kind }, kept in the Allies, Mounts & Pets folder with the
 * master's owners. The master's sheet shows it (portrait, HP, AC) with buttons to open it, put it on the map, or
 * let it go. Its stats follow the class text, and follow the master's level as it changes:
 *   Witch, Familiar            1 HP per two Witch levels (minimum 1), AC 14
 *   Wizard, Summon Familiar    half the caster's maximum HP
 *   Ranger (Beast Master)      Hit Dice equal to half the Ranger level, rounded up
 *   Paladin, Divine Mount      Warhorse, Light (or Warpony), with maximum HP
 *   Knight, Birthright Mount   Warhorse, Light (19 HP)
 *   Artificer (Construct Engineer), Construct Companion: d8 Hit Dice equal to Artificer level, AC 14 +1 per four
 *     levels, attack as Martial BtH for its Hit Dice, saves half level (minimum +1), +1 damage per four levels
 * Anyone can also keep a mount or pet straight from the Bestiary, stats unchanged.
 * Creating, placing and letting go of a companion goes through the GM (players can't create actors or tokens).
 */
import { ARNEYAN } from "./config.mjs";
import { freeSpots } from "./summons.mjs";

const SYS = "arneyan";
const SOCKET = `system.${SYS}`;
const MONSTERS = `${SYS}.monsters`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Construct Companion chassis (Artificer, Construct Engineer). */
export const CHASSIS = {
  guardian: { label: "Guardian", speed: "30ft", attack: { name: "Slam", damage: "1d8", type: "bludgeoning" }, note: "+1 AC while adjacent to you." },
  scout: { label: "Scout", speed: "40ft, climb 20ft", attack: { name: "Bite", damage: "1d6", type: "piercing" }, note: "Advantage on Perception." },
  striker: { label: "Striker", speed: "30ft", attack: { name: "Blade Arm", damage: "1d10", type: "slashing" }, note: "" }
};

export const COMPANION_PRESETS = {
  witchFamiliar: { label: "Familiar (Witch)", kind: "familiar", feature: "Familiar", className: "Witch",
    suggest: ["Black Cat", "Raven", "Toad", "Moth", "Bat", "Owl", "Rat", "Weasel"],
    text: "1 HP per two Witch levels (minimum 1), AC 14. It acts on its own each round and can deliver a Hex or touch spell for you, as your action, if adjacent to the target. It understands you within 1 mile." },
  wizardFamiliar: { label: "Familiar (Summon Familiar)", kind: "familiar", spell: "Summon Familiar",
    suggest: ["Bat", "Black Cat", "Owl", "Rat", "Raven", "Toad", "Weasel"],
    text: "Half your maximum HP. It acts on your turn; you can see through its eyes and speak to it within 1 mile while you concentrate. If it dies, you can summon another after 1 week." },
  rangerCompanion: { label: "Bonded Companion (Beast Master)", kind: "companion", feature: "Bonded Companion", beasts: true,
    suggest: ["Wolf", "Hawk", "Boar", "Mastiff"],
    text: "Hit Dice equal to half your Ranger level (rounded up). It acts on its own initiative and defends itself or you when threatened; directing it costs your action." },
  divineMount: { label: "Divine Mount (Paladin)", kind: "mount", feature: "Divine Mount",
    suggest: ["Warhorse, Light", "Warpony"],
    text: "A warhorse (or a war pony for a small Paladin) with maximum HP. If it dies, a year and a day must pass before another can be called." },
  birthrightMount: { label: "Birthright Mount (Knight)", kind: "mount", feature: "Birthright Mount",
    suggest: ["Warhorse, Light"],
    text: "A fully outfitted light warhorse (19 HP)." },
  construct: { label: "Construct Companion (Artificer)", kind: "construct", feature: "Construct Companion",
    text: "A Small construct: d8 Hit Dice equal to your Artificer level, AC 14 +1 per four levels, immune to poison, disease and sleep. It acts on your initiative and follows spoken commands; without one it takes no action." },
  other: { label: "A mount or pet", kind: "pet", any: true, suggest: ["Horse, Light", "Pony", "Mule", "Donkey", "Mastiff", "Black Cat"],
    text: "Its Bestiary stat block, unchanged." }
};

const KIND_LABEL = { familiar: "Familiar", companion: "Companion", mount: "Mount", construct: "Construct", pet: "Pet" };

/* -------------------------------------------- */
/*  Stats                                       */
/* -------------------------------------------- */

export function classLevel(actor, name) {
  const c = (actor?.items ?? []).find(i => i.type === "class" && i.name.toLowerCase().startsWith(name.toLowerCase()));
  return c?.system?.levels ?? 0;
}

const hasItem = (actor, type, name) => (actor?.items ?? []).some(i => (Array.isArray(type) ? type.includes(i.type) : i.type === type) && i.name === name);

/** The presets this character can use (what its class, kit and spells give, plus a mount or pet). */
export function presetsFor(actor, { all = false } = {}) {
  return Object.entries(COMPANION_PRESETS).filter(([, p]) => {
    if (all || p.any) return true;
    if (p.spell) return hasItem(actor, "spell", p.spell);
    if (p.className && !classLevel(actor, p.className)) return false;
    return hasItem(actor, ["ability", "feat"], p.feature);
  }).map(([key, p]) => ({ key, ...p }));
}

/** Average HP for Hit Dice like "3d8" or "2d8+4" (as the Bestiary works them out). */
export function averageHp(hd) {
  const m = String(hd ?? "").match(/(\d+)d(\d+)\s*([+-]\s*\d+)?/i);
  if (!m) return 0;
  return Math.max(1, Math.floor(Number(m[1]) * (Number(m[2]) + 1) / 2 + (Number((m[3] ?? "").replace(/\s/g, "")) || 0)));
}

/** Maximum HP for Hit Dice ("3d8+2" gives 26), or 0 when there are none. */
export function maxHp(hd) {
  const m = String(hd ?? "").match(/(\d+)d(\d+)\s*([+-]\s*\d+)?/i);
  return m ? Number(m[1]) * Number(m[2]) + (Number((m[3] ?? "").replace(/\s/g, "")) || 0) : 0;
}

/**
 * What the class text sets on a companion, as update paths, from its master and the creature it was made from.
 * `base` is the creature's system data (Bestiary stat block), `current` the companion's own.
 */
export function companionStats(preset, master, base = {}, current = base) {
  const out = {};
  const ms = master?.system ?? {};
  switch (preset) {
    case "witchFamiliar":
      out["system.attributes.hp.max"] = Math.max(1, Math.floor(classLevel(master, "Witch") / 2));
      out["system.attributes.ac"] = 14;
      break;
    case "wizardFamiliar":
      out["system.attributes.hp.max"] = Math.max(1, Math.floor((ms.attributes?.hp?.max ?? 2) / 2));
      break;
    case "rangerCompanion": {
      const n = Math.max(1, Math.ceil(classLevel(master, "Ranger") / 2));
      const die = Number(String(base.hd ?? "").match(/d(\d+)/i)?.[1]) || 8;
      out["system.hd"] = `${n}d${die}`;
      out["system.attributes.hp.max"] = averageHp(`${n}d${die}`);
      break;
    }
    case "divineMount": {
      const m = maxHp(base.hd);
      if (m) out["system.attributes.hp.max"] = m;
      break;
    }
    case "construct": {
      const lvl = Math.max(1, classLevel(master, "Artificer"));
      const save = Math.max(1, Math.floor(lvl / 2));
      Object.assign(out, {
        "system.level": lvl, "system.hd": `${lvl}d8`, "system.attributes.hp.max": averageHp(`${lvl}d8`),
        "system.attributes.ac": 14 + Math.floor(lvl / 4), "system.attributes.attack": ARNEYAN.bth("martial", Math.min(lvl, 24)),
        "system.saves.fort": save, "system.saves.ref": save, "system.saves.will": save
      });
      break;
    }
    default: break;
  }
  // HP follows a new maximum: full stays full, otherwise it's capped.
  const newMax = out["system.attributes.hp.max"];
  if (newMax !== undefined) {
    const hp = current.attributes?.hp ?? {};
    const oldMax = hp.max ?? newMax;
    const val = hp.value ?? newMax;
    out["system.attributes.hp.value"] = val >= oldMax ? newMax : Math.min(val, newMax);
  }
  return out;
}

/** The construct's own attack: its chassis weapon, +1 damage per four Artificer levels. */
export function constructWeapon(chassis, lvl) {
  const c = CHASSIS[chassis] ?? CHASSIS.guardian;
  const plus = Math.floor(Math.max(1, lvl) / 4);
  return { name: c.attack.name, type: "weapon", img: "systems/arneyan/assets/icons/monster-golem-head.svg",
    system: { damage: `${c.attack.damage}${plus ? `+${plus}` : ""}`, damageType: c.attack.type, ability: "str", quantity: 1, slots: 0, equipped: true } };
}

/** The companions of a character (actors in the world linked to it). */
export function companionsOf(actor) {
  if (!actor?.id || !globalThis.game?.actors?.filter) return [];
  return game.actors.filter(a => a.flags?.[SYS]?.companion?.master === actor.id);
}

/* -------------------------------------------- */
/*  Asking for one                              */
/* -------------------------------------------- */

async function bestiaryIndex() {
  const pack = game.packs.get(MONSTERS);
  if (!pack) return [];
  const idx = await pack.getIndex({ fields: ["system.details.type"] });
  return idx.map(e => ({ uuid: e.uuid ?? `Compendium.${MONSTERS}.Actor.${e._id}`, name: e.name, img: e.img, type: e.system?.details?.type ?? "" }));
}

/** Add a companion: pick what it is (from the character's features) and which creature. */
export async function addCompanion(master, dropped = null) {
  if (!master?.isOwner || master.type !== "character" || master.isToken) return;
  if (!game.users.activeGM) return ui.notifications.warn("Adding a companion needs the GM online.");
  const presets = presetsFor(master, { all: game.user.isGM });
  const index = await bestiaryIndex();
  const byName = new Map(index.map(e => [e.name, e]));
  const presetRows = presets.map((p, i) => `<label class="arn-comp-preset"><input type="radio" name="preset" value="${p.key}" ${i === 0 ? "checked" : ""}> <strong>${esc(p.label)}</strong><br><small class="arn-muted">${esc(p.text)}</small></label>`).join("");
  const options = p => {
    if (p.kind === "construct") return Object.entries(CHASSIS).map(([k, c]) => `<option value="chassis:${k}">${esc(c.label)} (${esc(c.attack.name)} ${c.attack.damage}, ${esc(c.speed)})</option>`).join("");
    const names = [...new Set([...(dropped ? [dropped.name] : []), ...(p.suggest ?? [])])];
    return names.map(n => byName.get(n) ?? (dropped?.name === n ? { uuid: dropped.uuid, name: n } : null)).filter(Boolean).map(e => `<option value="${esc(e.uuid)}">${esc(e.name)}</option>`).join("");
  };
  const content = `<div class="arn-comp-dialog"><fieldset>${presetRows}</fieldset>
    <label>Creature <select name="creature"></select></label>
    <p class="arn-muted">Or drag any creature from the Bestiary onto the Companions box on the sheet.</p></div>`;
  const pick = await foundry.applications.api.DialogV2.wait({
    window: { title: `${master.name}: new companion`, icon: "fa-solid fa-paw" }, classes: ["arneyan", "arn-comp-app"], position: { width: 480 }, content,
    buttons: [{ action: "go", label: "Add", icon: "fa-solid fa-paw", default: true, callback: (ev, btn) => ({ preset: btn.form.querySelector("input[name=preset]:checked")?.value, creature: btn.form.elements.creature?.value }) }, { action: "cancel", label: "Cancel" }],
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog?.element ?? event?.target?.element;
      const sel = root?.querySelector("select[name=creature]");
      const fill = () => { const key = root.querySelector("input[name=preset]:checked")?.value; const p = COMPANION_PRESETS[key]; if (sel && p) sel.innerHTML = options(p); };
      root?.querySelectorAll("input[name=preset]").forEach(r => r.addEventListener("change", fill));
      if (root) fill();
    }
  });
  if (!pick || typeof pick !== "object" || !pick.preset || !pick.creature) return;
  const msg = { action: "world.companion", masterUuid: master.uuid, preset: pick.preset };
  if (pick.creature.startsWith("chassis:")) msg.chassis = pick.creature.slice(8);
  else msg.creatureUuid = pick.creature;
  return sendCompanion(msg);
}

function sendCompanion(msg) {
  if (game.users.activeGM?.isSelf) return onSocket(msg, game.user.id);
  game.socket.emit(SOCKET, msg);
}

/** Put a companion on the map beside its master (the scene you're looking at). */
export async function placeCompanion(companion) {
  if (!companion?.isOwner) return;
  const scene = canvas?.scene;
  if (!scene) return ui.notifications.warn("Open a scene first.");
  const there = scene.tokens.find(t => t.actorId === companion.id);
  if (there?.object) { there.object.control?.({ releaseOthers: true }); canvas.animatePan?.({ x: there.object.center.x, y: there.object.center.y }); return; }
  if (!game.users.activeGM) return ui.notifications.warn("Placing a companion needs the GM online.");
  return sendCompanion({ action: "world.placeCompanion", companionId: companion.id, sceneId: scene.id });
}

/** Let a companion go (the actor and its tokens are removed). */
export async function releaseCompanion(companion) {
  if (!companion?.isOwner) return;
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: `Let ${companion.name} go?` }, content: `<p>${esc(companion.name)} and its tokens are removed for good.</p>`, rejectClose: false });
  if (!ok) return;
  if (!game.users.activeGM) return ui.notifications.warn("Letting a companion go needs the GM online.");
  return sendCompanion({ action: "world.releaseCompanion", companionId: companion.id });
}

/* -------------------------------------------- */
/*  The GM's side                               */
/* -------------------------------------------- */

async function createCompanion(master, presetKey, { creatureUuid = "", chassis = "" } = {}) {
  const preset = COMPANION_PRESETS[presetKey];
  let data;
  if (preset.kind === "construct") {
    const c = CHASSIS[chassis] ?? CHASSIS.guardian;
    const lvl = Math.max(1, classLevel(master, "Artificer"));
    data = {
      name: `${master.name}'s Construct (${c.label})`, type: "npc", img: "systems/arneyan/assets/icons/monster-golem-head.svg",
      system: { abilities: {}, level: lvl, hd: `${lvl}d8`, attributes: { hp: { value: 1, max: 1 }, ac: 14, speed: c.speed, attack: 0, morale: 12 },
        details: { type: "construct", size: "small", immunities: "poison, disease, sleep", description: `<p>${esc(preset.text)}</p>${c.note ? `<p>${esc(c.label)}: ${esc(c.note)}</p>` : ""}` } },
      items: [constructWeapon(chassis, lvl)]
    };
  } else {
    const src = await fromUuid(String(creatureUuid)).catch(() => null);
    if (!(src instanceof Actor) || src.type !== "npc") throw new Error("Pick a creature from the Bestiary.");
    if (preset.beasts && !String(src.system.details?.type ?? "").toLowerCase().startsWith("beast")) throw new Error("A Bonded Companion is a beast.");
    data = src.toObject();
    delete data._id;
    data.name = `${src.name} (${master.name}'s ${KIND_LABEL[preset.kind].toLowerCase()})`;
    foundry.utils.setProperty(data, `flags.${SYS}.bestiary`, src.pack ? src.uuid : (src.getFlag(SYS, "bestiary") ?? ""));
  }
  const { alliesFolder } = await import("./party.mjs");
  data.folder = alliesFolder()?.id ?? null;
  data.ownership = foundry.utils.deepClone(master._source?.ownership ?? master.ownership ?? {});
  data.prototypeToken = { ...(data.prototypeToken ?? {}), name: data.name.replace(/\s*\(.*\)$/, ""), actorLink: true, disposition: 1, sight: { ...(data.prototypeToken?.sight ?? {}), enabled: true } };
  foundry.utils.setProperty(data, `flags.${SYS}.companion`, { master: master.id, preset: presetKey, kind: preset.kind, chassis: chassis || "" });
  for (const [k, v] of Object.entries(companionStats(presetKey, master, data.system, { attributes: { hp: { value: 0, max: 0 } } }))) foundry.utils.setProperty(data, k, v);
  const made = await Actor.create(data, { arneyanGrant: true });
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: master }), content: `<div class="arn-card"><p><i class="fa-solid fa-paw"></i> ${esc(master.name)} gains ${esc(made.name)}: ${esc(preset.label)}.</p></div>` });
  return made;
}

async function onSocket(msg, senderId) {
  if (!game.users.activeGM?.isSelf || !msg || typeof msg !== "object" || !String(msg.action ?? "").startsWith("world.")) return;
  const sender = game.users.get(senderId);
  if (!sender) return;
  try {
    if (msg.action === "world.companion") {
      const master = await fromUuid(String(msg.masterUuid ?? "")).catch(() => null);
      if (!(master instanceof Actor) || master.pack || master.isToken || master.type !== "character" || !master.testUserPermission(sender, "OWNER")) return;
      const key = String(msg.preset ?? "");
      if (!presetsFor(master, { all: sender.isGM }).some(p => p.key === key)) throw new Error("That companion isn't open to this character.");
      if (msg.creatureUuid && !String(msg.creatureUuid).startsWith(`Compendium.${MONSTERS}.`)) {
        const a = await fromUuid(String(msg.creatureUuid)).catch(() => null);
        if (!(a instanceof Actor) || !a.testUserPermission(sender, "OBSERVER")) throw new Error("You can't see that creature.");
      }
      await createCompanion(master, key, { creatureUuid: msg.creatureUuid, chassis: String(msg.chassis ?? "") });
    } else if (msg.action === "world.placeCompanion") {
      const comp = game.actors.get(String(msg.companionId ?? ""));
      const scene = game.scenes.get(String(msg.sceneId ?? ""));
      if (!comp?.flags?.[SYS]?.companion || !scene || !comp.testUserPermission(sender, "OWNER")) return;
      if (scene.tokens.some(t => t.actorId === comp.id)) return;
      const master = game.actors.get(comp.flags[SYS].companion.master);
      const mt = scene.tokens.find(t => t.actorId === master?.id);
      if (!mt) throw new Error(`Put ${master?.name ?? "its master"}'s token on the scene first.`);
      const grid = scene.grid?.size ?? 100;
      const taken = scene.tokens.map(t => ({ x: Math.round(t.x / grid), y: Math.round(t.y / grid), w: Math.max(1, Math.round(t.width)), h: Math.max(1, Math.round(t.height)) }));
      const w = Math.max(1, Math.round(comp.prototypeToken.width)), h = Math.max(1, Math.round(comp.prototypeToken.height));
      const [spot] = freeSpots(Math.round(mt.x / grid), Math.round(mt.y / grid), Math.max(1, Math.round(mt.width)), Math.max(1, Math.round(mt.height)), w, h, taken, 1);
      const doc = await comp.getTokenDocument({ x: (spot?.x ?? Math.round(mt.x / grid) + 1) * grid, y: (spot?.y ?? Math.round(mt.y / grid)) * grid, disposition: mt.disposition ?? 1 }, { parent: scene });
      await scene.createEmbeddedDocuments("Token", [doc.toObject()]);
    } else if (msg.action === "world.releaseCompanion") {
      const comp = game.actors.get(String(msg.companionId ?? ""));
      if (!comp?.flags?.[SYS]?.companion || !comp.testUserPermission(sender, "OWNER")) return;
      for (const s of game.scenes) {
        const ids = s.tokens.filter(t => t.actorId === comp.id).map(t => t.id);
        if (ids.length) await s.deleteEmbeddedDocuments("Token", ids);
      }
      const master = game.actors.get(comp.flags[SYS].companion.master);
      await comp.delete({ arneyanForce: true });
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: master }), content: `<div class="arn-card"><p><i class="fa-solid fa-paw"></i> ${esc(comp.name)} leaves ${esc(master?.name ?? "its master")}.</p></div>` });
    }
  } catch (err) {
    console.warn("Arneyan | companion", err);
    ChatMessage.create({ whisper: [senderId, game.user.id], content: `<p>${esc(err.message)}</p>` });
  }
}

/** Bring a master's companions in line with its level and HP (run by whoever changed the master). */
export async function syncCompanions(master) {
  for (const c of companionsOf(master)) {
    if (!c.isOwner) continue;
    const info = c.flags[SYS].companion;
    const base = info.preset === "rangerCompanion" || info.preset === "divineMount" ? await baseStats(c) : c.system;
    const upd = companionStats(info.preset, master, base, c._source.system);
    const changed = Object.fromEntries(Object.entries(upd).filter(([k, v]) => foundry.utils.getProperty(c._source, k) !== v));
    if (Object.keys(changed).length) await c.update(changed);
    if (info.preset === "construct") {
      const w = c.items.find(i => i.type === "weapon");
      const want = constructWeapon(info.chassis, classLevel(master, "Artificer")).system.damage;
      if (w && w.system.damage !== want) await w.update({ "system.damage": want });
    }
  }
}

/** The Bestiary stat block a companion was made from (for its Hit Die size), or its own. */
async function baseStats(c) {
  const uuid = c.getFlag(SYS, "bestiary");
  const src = uuid ? await fromUuid(uuid).catch(() => null) : null;
  return src?.system ?? c.system;
}

/* -------------------------------------------- */
/*  For the sheets                              */
/* -------------------------------------------- */

/** The Companions box on a character's sheet, and the "companion of" line on a companion's. */
export function companionContext(actor) {
  const info = actor?.flags?.[SYS]?.companion;
  if (info) {
    const master = globalThis.game?.actors?.get?.(info.master);
    const p = COMPANION_PRESETS[info.preset];
    return { companionOf: { name: master?.name ?? "someone no longer here", id: master?.id ?? "", label: p?.label ?? KIND_LABEL[info.kind] ?? "Companion", text: p?.text ?? "", kind: KIND_LABEL[info.kind] ?? "Companion" } };
  }
  if (actor?.type !== "character") return {};
  const list = companionsOf(actor).map(c => {
    const hp = c.system.attributes?.hp ?? { value: 0, max: 1 };
    const i = c.flags[SYS].companion;
    return { id: c.id, name: c.name, img: c.img, hp: hp.value, hpMax: hp.max, hpPct: Math.clamp(Math.round(Math.max(0, hp.value) / Math.max(1, hp.max) * 100), 0, 100),
      ac: c.system.acTotal ?? c.system.attributes?.ac ?? "-", kind: KIND_LABEL[i.kind] ?? "Companion", preset: COMPANION_PRESETS[i.preset]?.label ?? "",
      onScene: !!globalThis.canvas?.scene?.tokens?.some?.(t => t.actorId === c.id), canOpen: c.testUserPermission?.(game.user, "OBSERVER") ?? true };
  });
  return { companions: list };
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

export function registerCompanions() {
  Hooks.once("ready", () => game.socket.on(SOCKET, onSocket));
  // A master's class level or maximum HP changes: its companions follow.
  Hooks.on("updateItem", (item, changes, options, userId) => {
    if (userId !== game.user.id || item.type !== "class" || !foundry.utils.hasProperty(changes, "system.levels")) return;
    const master = item.parent;
    if (master?.type === "character" && !master.isToken) syncCompanions(master).catch(err => console.warn("Arneyan | companions", err));
  });
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (userId !== game.user.id || actor.type !== "character" || actor.isToken || !foundry.utils.hasProperty(changes, "system.attributes.hp.max")) return;
    syncCompanions(actor).catch(err => console.warn("Arneyan | companions", err));
  });
  // The master's sheet shows its companions' HP as it changes.
  for (const hook of ["updateActor", "createActor", "deleteActor"]) {
    Hooks.on(hook, actor => {
      const m = actor.flags?.[SYS]?.companion?.master;
      if (m) game.actors.get(m)?.sheet?.rendered && game.actors.get(m).sheet.render();
    });
  }
}

/**
 * Monster art from installed art packs (0.10.27). The Bestiary's monsters come with plain icons; a GM who owns token
 * art (a token pack, a bestiary or adventure module with creature art, a free pack) can have Arneyan use it, matched
 * by name: an Ogre gets the pack's ogre token and portrait. Nothing is copied: tokens point at the images where the
 * art module installed them, so the art stays licensed to the GM's own games and never ships with the system.
 *
 * Game Settings, Monster art (GM): tick the art modules, Scan them (an index of Bestiary names to images, kept in a
 * world setting), tick "New monsters get matched art", and "Use on monsters already here" fills in the ones already
 * in the world. Only monsters still showing a system icon are changed: art set by hand stays.
 */
const SYS = "arneyan";
const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const IMAGE = /\.(webp|png|jpe?g|gif|avif|svg)$/i;
/** Words in art file names that aren't part of the creature's name ("goblin-token-01.webp"). */
const NOISE = new Set(["token", "tokens", "tok", "topdown", "top", "down", "portrait", "portraits", "art", "full", "round", "ring",
  "circle", "subject", "img", "image", "icon", "avatar", "bust", "pc", "npc", "the", "of", "a"]);
/** Folders that hold maps, scenes, handouts and the like, not creatures: not scanned. */
const SKIP_DIRS = /^(scenes?|maps?|tiles?|handouts?|journals?|items?|icons?|ui|backgrounds?|audio|sounds?|music|fonts?|scripts?|styles?|lang|packs?|templates?)$/i;
const MAX_DEPTH = 7;
/** UK and US spellings read the same ("Grey Ooze", "gray-ooze.webp"). */
const SPELLING = [[/grey/g, "gray"], [/armour/g, "armor"], [/colour/g, "color"]];

/** Words to match on, as one string: "Ancient Red Dragon" and "ancient-red-dragon_02.webp" both read "ancientreddragon". */
function words(s) {
  s = String(s ?? "").toLowerCase().replace(/\([^)]*\)/g, " ");
  for (const [re, to] of SPELLING) s = s.replace(re, to);
  return s.replace(/[0-9]+/g, " ").replace(/[^a-z]+/g, " ").split(" ").filter(w => w.length > 1 && !NOISE.has(w)).join("");
}

/** A file's key, from its name (browse paths come URL-encoded: "Red%20Dragon%2C%20Adult.webp"). */
export function fileKey(path) {
  let s = String(path ?? "").split("/").pop().replace(IMAGE, "");
  try { s = decodeURIComponent(s); } catch { /* keep it as it is */ }
  const parts = s.split(",").map(p => p.trim()).filter(Boolean);
  return words(parts.length === 2 ? `${parts[1]} ${parts[0]}` : s);
}

/**
 * The keys a Bestiary name may go by, best first. "Red Dragon, Adult" is "adult red dragon" in packs, but "Red Dragon,
 * Wyrmling" is "red dragon wyrmling" and "Modron, Monodrone" just "monodrone": all three are tried.
 */
export function nameKeys(name) {
  const s = String(name ?? "");
  const parts = s.split(",").map(p => p.trim()).filter(Boolean);
  // The part after the comma on its own only for Modrons ("Modron, Monodrone"): "Adult" or "Red" alone would match
  // any file called adult.webp or red.webp.
  const keys = parts.length === 2 ? [words(`${parts[1]} ${parts[0]}`), words(`${parts[0]} ${parts[1]}`), ...(/^modrons?$/i.test(parts[0]) ? [words(parts[1])] : [])] : [words(s)];
  return [...new Set(keys.filter(Boolean))];
}
/** The best key for a name (tests and callers that want one). */
export const artKey = name => nameKeys(name)[0] ?? "";

/** Is this image a token (top-down, round) or a portrait (full art)? Judged from inside the module's folder only. */
export function artKind(path) {
  const p = String(path).toLowerCase().replace(/^modules\/[^/]+\//, "");
  if (/token|topdown|(^|[/_-])tok([/_.-]|$)/.test(p)) return "token";
  if (/portrait|(^|[/_-])art([/_.-]|$)|fullart|(^|[/_-])full([/_.-]|$)|(^|[/_-])bust([/_.-]|$)|avatar|(^|\/)(actors?|characters?)\//.test(p)) return "portrait";
  return "any";
}

/**
 * The index from a list of image paths: { key: { token, portrait } }. For each slot an image marked for it beats one
 * that could be either; then the shortest file name wins ("ogre.webp" over "ogre-2.webp"). `keep`: only these keys.
 */
export function indexFrom(paths, keep = null) {
  const best = {};
  const rankFor = (slot, kind) => (kind === slot ? 2 : kind === "any" ? 1 : 0);
  for (const p of paths) {
    if (!IMAGE.test(p)) continue;
    const key = fileKey(p);
    if (!key || (keep && !keep.has(key))) continue;
    const kind = artKind(p);
    const e = (best[key] ??= {});
    for (const slot of ["token", "portrait"]) {
      const r = rankFor(slot, kind);
      if (!r) continue;
      const cur = e[slot];
      const len = p.split("/").pop().length;
      if (!cur || r > cur.r || (r === cur.r && len < cur.len)) e[slot] = { p, r, len };
    }
  }
  const out = {};
  for (const [k, e] of Object.entries(best)) {
    out[k] = {};
    if (e.token) out[k].token = e.token.p;
    if (e.portrait) out[k].portrait = e.portrait.p;
  }
  return out;
}

/** The art for a monster's name, if the index has it: { token, portrait } (either may be missing). */
export function artFor(name, index = readIndex()) {
  const entries = index?.entries ?? {};
  for (const k of nameKeys(name)) if (entries[k]) return entries[k];
  return null;
}

/** Still the art it shipped with (a system or core icon), so ours may replace it. */
export function plainArt(src) {
  const s = String(src ?? "");
  return !s || s.startsWith(`systems/${SYS}/`) || s.startsWith("icons/svg/");
}

function readIndex() {
  try { return game.settings.get(SYS, "artIndex") ?? null; } catch { return null; }
}
const auto = () => { try { return !!game.settings.get(SYS, "artAuto"); } catch { return false; } };

/** Every image under a folder, a few levels deep, leaving out map, scene and handout folders. */
async function imagesUnder(path, depth = 0) {
  const FP = foundry.applications.apps.FilePicker.implementation;
  const res = await FP.browse("data", path);
  const files = (res.files ?? []).filter(f => IMAGE.test(f));
  if (depth >= MAX_DEPTH) return files;
  for (const d of res.dirs ?? []) {
    let leaf = String(d).replace(/\/$/, "").split("/").pop();
    try { leaf = decodeURIComponent(leaf); } catch { /* as it is */ }
    if (SKIP_DIRS.test(leaf)) continue;
    files.push(...await imagesUnder(d, depth + 1));
  }
  return files;
}

/** Every key the Bestiary's monsters go by (so the index keeps only art for them). */
async function bestiaryKeys() {
  const pack = game.packs.get(`${SYS}.monsters`);
  const keys = new Set();
  for (const e of pack ? await pack.getIndex() : []) for (const k of nameKeys(e.name)) keys.add(k);
  return keys;
}

/**
 * Scan the chosen art modules and keep the index (GM). Returns { names, images, empty: [module ids with no images],
 * failed: [ids that couldn't be read] }.
 */
export async function scanArt(moduleIds = []) {
  if (!game.user.isGM) return null;
  const paths = [], empty = [], failed = [];
  for (const id of moduleIds) {
    if (!game.modules.get(id)) continue;
    try {
      const found = await imagesUnder(`modules/${id}`);
      if (!found.length) empty.push(id);
      paths.push(...found);
    } catch (err) {
      console.warn(`Arneyan | art scan: ${id}`, err);
      failed.push(id);
    }
  }
  const entries = indexFrom(paths, await bestiaryKeys());
  await game.settings.set(SYS, "artIndex", { modules: moduleIds, scanned: Date.now(), images: paths.length, entries });
  return { names: Object.keys(entries).length, images: paths.length, empty, failed };
}

/** The changes that give an actor (data or document) its matched art, or null when there's nothing to change. */
export function artUpdate(actor, index = readIndex()) {
  const art = artFor(actor?.name, index);
  if (!art) return null;
  const img = actor.img ?? actor._source?.img;
  const tok = actor.prototypeToken?.texture?.src ?? actor._source?.prototypeToken?.texture?.src;
  const upd = {};
  if (plainArt(img) && (art.portrait || art.token)) upd.img = art.portrait ?? art.token;
  if (plainArt(tok) && (art.token || art.portrait)) upd["prototypeToken.texture.src"] = art.token ?? art.portrait;
  return Object.keys(upd).length ? upd : null;
}

const fromBestiary = actor => {
  const src = actor?._stats?.compendiumSource ?? actor?.flags?.core?.sourceId ?? "";
  return typeof src === "string" && src.startsWith(`Compendium.${SYS}.monsters.`);
};

/** "Use on monsters already here": the world's Bestiary monsters (and their tokens on scenes) still on system icons. */
export async function applyArtToWorld() {
  if (!game.user.isGM) return 0;
  const index = readIndex();
  const updates = [];
  for (const a of game.actors) {
    if (a.type !== "npc" || !fromBestiary(a)) continue;
    const upd = artUpdate(a, index);
    if (upd) updates.push({ _id: a.id, ...upd });
  }
  if (updates.length) await Actor.updateDocuments(updates);
  // Tokens already placed (unlinked copies included) still showing a system icon.
  for (const scene of game.scenes) {
    const tu = [];
    for (const t of scene.tokens) {
      const actor = t.actor;
      if (actor?.type !== "npc" || !plainArt(t.texture?.src) || !fromBestiary(game.actors.get(t.actorId) ?? actor)) continue;
      const art = artFor(actor.name, index) ?? artFor(t.name, index);
      if (art?.token || art?.portrait) tu.push({ _id: t.id, "texture.src": art.token ?? art.portrait });
    }
    if (tu.length) await scene.updateEmbeddedDocuments("Token", tu);
  }
  return updates.length;
}

class ArneyanArtConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "arneyan-art-config",
    classes: ["arneyan", "arn-art-config"],
    window: { title: "Monster art from art packs", icon: "fa-solid fa-images", resizable: true },
    position: { width: 560, height: 640 },
    actions: { scan: ArneyanArtConfig.#onScan, apply: ArneyanArtConfig.#onApply }
  };
  static PARTS = { main: { template: `systems/${SYS}/templates/apps/art-config.hbs`, scrollable: [".arn-art-mods"] } };

  async _prepareContext() {
    const index = readIndex();
    const chosen = new Set(index?.modules ?? []);
    const artLike = m => /\b(tokens?|art|portraits?|bestiar\w*|monsters?|creatures?)\b|caeora|forgotten/i.test(`${m.id.replace(/[-_]/g, " ")} ${m.title}`);
    const mods = game.modules.contents
      .map(m => ({ id: m.id, title: m.title, checked: index?.scanned ? chosen.has(m.id) : artLike(m), suggested: artLike(m) }))
      .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.title.localeCompare(b.title));
    return {
      mods, auto: auto(), names: Object.keys(index?.entries ?? {}).length, images: index?.images ?? 0,
      scanned: index?.scanned ? new Date(index.scanned).toLocaleString() : ""
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    // The "new monsters" box saves as soon as it's ticked; changed module ticks wait for Scan, and say so.
    this.element.querySelector('input[name="auto"]')?.addEventListener("change", async ev => {
      await game.settings.set(SYS, "artAuto", ev.currentTarget.checked);
      ui.notifications.info(ev.currentTarget.checked ? "New monsters from the Bestiary get matched art." : "New monsters keep the Bestiary's icons.");
    });
    const note = this.element.querySelector(".arn-art-changed");
    for (const box of this.element.querySelectorAll('input[name="mod"]')) box.addEventListener("change", () => note?.classList.remove("hidden"));
  }

  #chosen() {
    return [...this.element.querySelectorAll('input[name="mod"]:checked')].map(i => i.value);
  }

  static async #onScan(event, target) {
    target.disabled = true;
    try {
      ui.notifications.info("Scanning the art packs. Big packs take a minute.");
      const res = await scanArt(this.#chosen());
      ui.notifications.info(`Found art for ${res?.names ?? 0} Bestiary monster${res?.names === 1 ? "" : "s"} (${res?.images ?? 0} images looked at).`);
      for (const id of res?.empty ?? []) ui.notifications.warn(`No images found in ${game.modules.get(id)?.title ?? id}.`);
      for (const id of res?.failed ?? []) ui.notifications.error(`Couldn't read ${game.modules.get(id)?.title ?? id}'s folder (the console has the error).`);
    } catch (err) {
      console.error("Arneyan | art scan", err);
      ui.notifications.error("The scan failed (the console has the error).");
    } finally { this.render(); }
  }

  static async #onApply(event, target) {
    target.disabled = true;
    try {
      const n = await applyArtToWorld();
      ui.notifications.info(`Matched art on ${n} monster${n === 1 ? "" : "s"} in the world, and their tokens.`);
    } catch (err) {
      console.error("Arneyan | art", err);
      ui.notifications.error("Couldn't change every monster (the console has the error).");
    } finally { this.render(); }
  }
}

export function registerArt() {
  game.settings.register(SYS, "artIndex", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(SYS, "artAuto", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.registerMenu(SYS, "artConfig", {
    name: "Monster art from art packs",
    label: "Monster art",
    hint: "Use token art and portraits from art modules you have installed, matched to Bestiary monsters by name. Nothing is copied.",
    icon: "fa-solid fa-images",
    type: ArneyanArtConfig,
    restricted: true
  });
  // A new monster from the Bestiary (dragged into the world, onto a scene, or placed by the Encounter Builder).
  Hooks.on("preCreateActor", (actor, data, options, userId) => {
    if (userId !== game.user.id || actor.type !== "npc" || !auto() || !fromBestiary(actor)) return;
    const upd = artUpdate(actor);
    if (upd) actor.updateSource(upd);
  });
  game.arneyan ??= {};
  game.arneyan.art = { scan: scanArt, applyToWorld: applyArtToWorld, find: name => artFor(name) };
}

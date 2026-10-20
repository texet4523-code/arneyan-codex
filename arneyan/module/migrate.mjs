/**
 * Bring a world's copies of compendium items up to date with each new system version: items already on sheets keep
 * the data they had when they were added, so a Backpack wouldn't become a container, a feature wouldn't get its new
 * Use, a feat wouldn't get its effects and a spell wouldn't get its save or area.
 *
 * Two kinds of change:
 * - Gear and the like (`fillFrom`): only fields that are still empty are filled; nothing set by hand is overwritten.
 * - Feats, features, kits, ancestries, spells and actions (`refreshFrom`): their mechanics (rules, switch, effects,
 *   activities, uses, save, damage, area, a kit's features) are replaced from the current compendium entry. Name,
 *   description, image, quantity and equipped stay, and so do a switch's on/off, uses left (up to the new maximum)
 *   and an attribute or weapon already picked.
 *
 * Safe for a live campaign (0.10.15): an item added from a compendium carries a fingerprint of each mechanical field
 * as it arrived (flags.arneyan.synced). The update replaces a field only while it still matches its fingerprint, so a
 * rule the GM changed stays and is listed in the GM's report, with a button to update it anyway. Items added before
 * fingerprints existed are the GM's call: update them all, or leave them (asked once per new version). An item
 * flagged `flags.arneyan.keepCustom` (the item sheet's "Keep my edits" box) is never touched, nor is anything that
 * didn't come from a system compendium.
 */
import { formulaUsesFor } from "./data/actor-models.mjs";

const SYS = "arneyan";
/** The version a run brings the world to: the installed system's. */
const currentVersion = () => game.system?.version ?? "0.10.15";
const PACKS = ["equipment", "spells", "class-features", "feats", "kits", "ancestries", "actions"];
const SOURCES = PACKS.map(p => `Compendium.${SYS}.${p}.`);
/** The item types whose mechanics are replaced from the compendium. */
const REFRESH = new Set(["feat", "ability", "kit", "ancestry", "spell"]);
/** The mechanical fields replaced (where the compendium entry's type has them). */
const FIELDS = ["rules", "toggle", "applies", "activities", "save", "saveEffect", "dc", "damage", "damageType", "template", "area", "auras"];

const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
/** The same data, whatever order its keys are in (stored data follows the schema's order, a fresh object doesn't). */
const stable = v => (Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v);
const same = (a, b) => JSON.stringify(stable(a ?? null)) === JSON.stringify(stable(b ?? null));

/**
 * The mechanical fields fingerprinted, as they're compared: without what play changes (uses left, a picked attribute,
 * picked weapons).
 */
const MECH = [...FIELDS, "uses", "abilityChoice", "weaponChoice", "features"];
/**
 * A rule's blank weapon scope (0.10.18: every stored rule gained `weapon`, "" unless it's for some weapons) reads as
 * no field at all, so fingerprints taken before it existed still match an unedited rule.
 */
function plainRules(v) {
  if (Array.isArray(v)) return v.map(plainRules);
  if (!v || typeof v !== "object") return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = plainRules(x);
  if ("key" in out && "value" in out && out.weapon === "") delete out.weapon;
  return out;
}
/**
 * What a fingerprint covers. A kit feature's weapon pick (0.10.18) reads as no field at all while it's blank: the
 * schema fills it in on every stored kit, which made kits stamped before it look edited. `legacy` is the 0.10.18 to
 * 0.10.21 view (blank picks included), so their stamps still match.
 */
function mechView(field, v, legacy = false) {
  if (v == null) return null;
  if (field === "uses") return { max: Number(v.max) || 0, per: v.per ?? "", formula: v.formula ?? "" };
  if (field === "abilityChoice") return { options: [...(v.options ?? [])] };
  if (field === "weaponChoice") return { max: String(v.max ?? "") };
  if (field === "features" && Array.isArray(v)) return plainRules(v.map(f => {
    const c = clone(f) ?? {};
    if (c.uses) delete c.uses.value;
    if (c.abilityChoice) delete c.abilityChoice.value;
    if (c.weaponChoice) delete c.weaponChoice.value;
    if (!legacy && c.weaponChoice && !String(c.weaponChoice.max ?? "")) delete c.weaponChoice;
    return c;
  }));
  if (["rules", "applies", "auras"].includes(field)) return plainRules(v);
  return v;
}
function hash(view) {
  const str = JSON.stringify(stable(view));
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
/** FNV-1a (32 bit) of a value's stable JSON, in base 36: short, and the same for the same data. */
export function fingerprint(field, v) { return hash(mechView(field, v)); }
/** Does a value still match its stamp (taken now, or by 0.10.18 to 0.10.21)? */
export function matchesStamp(field, v, stamp) {
  return fingerprint(field, v) === stamp || (field === "features" && hash(mechView(field, v, true)) === stamp);
}
/** Fingerprints of an item's mechanical fields (those its type has), from its stored system data. */
export function stampOf(type, system = {}) {
  if (!REFRESH.has(type)) return null;
  const out = {};
  for (const k of MECH) if (k in (system ?? {})) out[k] = fingerprint(k, system[k]);
  return out;
}
/** Does this item come from a system compendium (or a kit's features list), so updates follow it? */
export function tracked(item) {
  return REFRESH.has(item?.type) && !!(compendiumSourceOf(item) || item?.flags?.[SYS]?.grantedBy);
}

/**
 * The fingerprints a newly added item starts with: its compendium entry's, so a copy someone already changed counts as
 * changed. A feature a kit or class granted just now (no entry of its own) is fingerprinted as it is.
 */
export async function stampOnCreate(data) {
  if (!tracked(data)) return null;
  const uuid = compendiumSourceOf(data);
  if (uuid) {
    const src = await fromUuid(uuid).catch(() => null);
    if (src?.type === data.type) return stampOf(src.type, src._source?.system ?? src.system);
  }
  return data.flags?.[SYS]?.grantedBy ? stampOf(data.type, data.system) : null;
}

/** The system compendium entry an item came from, if any (features a class granted carry it in our own flag). */
export function compendiumSourceOf(item) {
  for (const s of [item?._stats?.compendiumSource, item?.flags?.core?.sourceId, item?.flags?.[SYS]?.source]) {
    if (typeof s === "string" && SOURCES.some(p => s.startsWith(p))) return s;
  }
  return null;
}
const sourceOf = compendiumSourceOf;

/** What to fill in on one item from its compendium entry (nothing if it's already set). */
export function fillFrom(item, src) {
  const s = item.system ?? {}, o = src.system ?? {};
  const upd = {};
  if (item.type === "equipment") {
    if (o.container?.holds && !s.container?.holds) upd["system.container"] = o.container;
    if ((o.light?.bright || o.light?.dim) && !s.light?.bright && !s.light?.dim) {
      upd["system.light.bright"] = o.light.bright; upd["system.light.dim"] = o.light.dim;
      upd["system.light.hours"] = o.light.hours; upd["system.light.angle"] = o.light.angle ?? 360;
    }
    if (o.itemSpells?.length && !s.itemSpells?.length) {
      upd["system.itemSpells"] = o.itemSpells; upd["system.castLevel"] = o.castLevel ?? 0;
      upd["system.nonCasterCl"] = o.nonCasterCl ?? 0; upd["system.nonCasterDc"] = o.nonCasterDc ?? 0;
    }
  }
  if (item.type === "spell" && o.applies?.length && !s.applies?.length) upd["system.applies"] = o.applies;
  // Spell areas (Place area) and auras (Aura of Courage, Spirit Guardians), new in 0.7.0.
  if (item.type === "spell" && o.template?.type && !s.template?.type) { upd["system.template"] = o.template; if (o.area && !s.area) upd["system.area"] = o.area; }
  // 0.7.3: Earthquake's radius grows with level; a light or an object (Daylight, Secret Page) isn't an area after all.
  if (item.type === "spell" && o.template?.sizeFormula && s.template?.type && !s.template?.sizeFormula) upd["system.template.sizeFormula"] = o.template.sizeFormula;
  if (item.type === "spell" && o.template && !o.template.type && s.template?.type) upd["system.template.type"] = "";
  if (o.auras?.length && !s.auras?.length) upd["system.auras"] = o.auras;
  // 0.9.1: what a feature does when used (Lay on Hands heals; options ask which).
  if (item.type === "ability" && o.activities?.length && !s.activities?.length) upd["system.activities"] = o.activities;
  // A weapon that gained a mode (a Flame Tongue ignites): its mode, and its extra damage tied to the mode.
  if (item.type === "weapon" && o.toggle && o.modeLabel && !s.modeLabel) {
    upd["system.toggle"] = true; upd["system.modeLabel"] = o.modeLabel; upd["system.modeLight"] = o.modeLight ?? 0;
    upd["system.bonusDamage"] = o.bonusDamage;
  }
  return upd;
}

/**
 * Uses from the compendium, keeping how many are left: never more than the new maximum (`maxNow`, the maximum
 * its formula gives on this character, when it has one). A feature that had no uses before starts full.
 */
export function usesFrom(old = {}, src = {}, maxNow = null) {
  const out = { max: Number(src.max) || 0, per: src.per ?? "", formula: src.formula ?? "" };
  const max = Number.isFinite(maxNow) && maxNow !== null ? maxNow : out.max;
  const had = Number(old.max) || 0;
  const value = Number(old.value) || 0;
  out.value = !had && !old.formula ? max : Math.max(0, Math.min(value, max));
  return out;
}

/** A kit's features from the compendium, keeping uses left (and a picked attribute) where a feature is still there. */
export function kitFeaturesFrom(oldFeatures = [], srcFeatures = []) {
  return (srcFeatures ?? []).map(f => {
    const nf = clone(f);
    const old = (oldFeatures ?? []).find(x => x.name === f.name);
    if (old && nf.uses) nf.uses.value = Math.max(0, Math.min(Number(old.uses?.value) || 0, Number(nf.uses.max) || 0));
    if (old?.abilityChoice?.value && nf.abilityChoice?.options?.includes(old.abilityChoice.value)) nf.abilityChoice.value = old.abilityChoice.value;
    if (old?.weaponChoice?.value?.length && nf.weaponChoice) nf.weaponChoice.value = [...old.weaponChoice.value];
    return nf;
  });
}

/**
 * The mechanical fields of a feat, feature, kit, ancestry, spell or action, replaced from its compendium entry (an
 * object `src` with `type` and `system`). `maxNow` is what a uses formula gives on the owner. Returns an update (empty
 * when nothing differs, so a second run changes nothing).
 *
 * A field is replaced only while it still matches its fingerprint (flags.arneyan.synced); one that doesn't is the
 * GM's edit and stays (its name goes in `report.kept`). An item with no fingerprints at all (added before they
 * existed) follows `legacy`: "update" replaces, "skip" leaves it (and sets `report.unstamped`). `force` replaces
 * every field whatever the fingerprints say ("Update these anyway"). Keep my edits always wins.
 */
export function refreshFrom(item, src, { maxNow = null, legacy = "update", force = false, report = null } = {}) {
  const upd = {};
  if (!item || !src || !REFRESH.has(item.type) || item.type !== src.type || item.flags?.[SYS]?.keepCustom) return upd;
  // The stored data, not what data preparation made of it (a uses formula's maximum, a clamped value).
  const s = item._source?.system ?? item.system ?? {}, o = src.system ?? {};
  const stamps = item._source?.flags?.[SYS]?.synced ?? item.flags?.[SYS]?.synced ?? null;
  const unstamped = !stamps || typeof stamps !== "object";
  if (unstamped && legacy === "skip" && !force) {
    // Nothing to tell an edit from the release it came with: only if anything would change does it count.
    const probe = refreshFrom(item, src, { maxNow, legacy: "update" });
    if (Object.keys(probe).some(k => k.startsWith("system."))) { if (report) report.unstamped = true; return {}; }
    // Already the same as the compendium: nothing to lose, so it just gets its fingerprints.
    return probe;
  }
  const next = { ...(unstamped ? {} : stamps) };
  const kept = [];
  // A blank weapon scope on one side only is no difference (stored rules have it, an older entry may not).
  const plainIf = (k, v) => (["rules", "applies", "auras", "features"].includes(k) ? plainRules(v) : v);
  const set = (k, v) => {
    if (same(plainIf(k, s[k]), plainIf(k, v))) { next[k] = fingerprint(k, v); return; }
    // Changed by hand since it arrived (or since the last update): keep it, and its old fingerprint.
    if (!force && !unstamped && stamps[k] !== undefined && !matchesStamp(k, s[k], stamps[k])) {
      if (!matchesStamp(k, v, stamps[k])) kept.push(k);
      return;
    }
    upd[`system.${k}`] = clone(v);
    next[k] = fingerprint(k, v);
  };
  for (const k of FIELDS) if (o[k] !== undefined && k in s) set(k, o[k]);
  // An attribute picked already stays, if the new options still have it.
  if (o.abilityChoice !== undefined && "abilityChoice" in s) {
    const opts = o.abilityChoice?.options ?? [];
    set("abilityChoice", { options: opts, value: opts.includes(s.abilityChoice?.value) ? s.abilityChoice.value : "" });
  }
  // Weapons picked already stay (the player's choice, never the GM's edit); the compendium decides how many may be.
  if (o.weaponChoice !== undefined && "weaponChoice" in s) set("weaponChoice", { max: String(o.weaponChoice?.max ?? ""), value: [...(s.weaponChoice?.value ?? [])] });
  if (o.uses !== undefined && "uses" in s) set("uses", usesFrom(s.uses, o.uses, maxNow));
  if (item.type === "kit" && Array.isArray(o.features)) set("features", kitFeaturesFrom(s.features, o.features));
  if (report && kept.length) report.kept = kept;
  // Record the fingerprints when they change (a first stamp, or a field updated), not on every run.
  if (!same(stamps, next)) upd[`flags.${SYS}.synced`] = next;
  return upd;
}

/** A feature a kit granted (flags.arneyan.source "<kit id>.<index>"), refreshed from the kit's (new) features. */
export function refreshGranted(item, features, { maxNow = null, ...opts } = {}) {
  if (item?.type !== "ability" || item.flags?.[SYS]?.keepCustom) return {};
  const idx = Number(String(item.flags?.[SYS]?.source ?? "").split(".").pop());
  const f = (Number.isInteger(idx) && features?.[idx]?.name === item.name ? features[idx] : null) ?? features?.find?.(x => x.name === item.name);
  if (!f) return {};
  return refreshFrom(item, { type: "ability", system: f }, { maxNow, ...opts });
}

/** The uses maximum a formula from `srcUses` gives on this actor (null without one). */
function maxOn(actor, item, srcUses) {
  if (!actor || !srcUses?.formula) return null;
  return formulaUsesFor(actor, { type: item.type, name: item.name, system: { className: item.system?.className ?? "", uses: { ...srcUses } } });
}

export function registerMigration() {
  game.settings.register(SYS, "migratedTo", { scope: "world", config: false, type: String, default: "" });
  Hooks.once("ready", () => runMigration().catch(err => console.warn("Arneyan | migration", err)));
  // The GM's report: "Update these anyway" for the items whose edits were kept.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const btn = html?.querySelector?.(".arn-migrate-force");
    if (!btn || !game.user.isGM) return;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const uuids = message.getFlag(SYS, "migrateKept") ?? [];
      const res = await forceUpdate(uuids);
      ui.notifications.info(`Updated ${res} item${res === 1 ? "" : "s"} from the compendiums.`);
    });
  });
}

const plain = d => (typeof d?.toObject === "function" ? d.toObject() : d);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Every update for one set of items (an actor's, or the Items directory), in one batch. `notes` collects the items
 * whose edits were kept ({ uuid, label, fields }) and counts those added before fingerprints (`unstamped`).
 */
async function updatesFor(items, actor, fetch, { legacy, force = false, forceIds = null, notes }) {
  const updates = [];
  const kitFeatures = new Map();
  // Kits first: the features they granted follow the kit's new list.
  const ordered = [...items].sort((a, b) => Number(b.type === "kit") - Number(a.type === "kit"));
  for (const i of ordered) {
    const uuid = sourceOf(i);
    const src = uuid ? plain(await fetch(uuid)) : null;
    const report = {};
    let upd = {};
    if (src) {
      // Feats, features, kits, ancestries, spells and actions only through the fingerprinted refresh (an area the
      // GM cleared stays cleared); gear gets its empty fields filled, unless Keep my edits is ticked.
      if (REFRESH.has(i.type)) upd = refreshFrom(i, src, { maxNow: maxOn(actor, i, src.system?.uses), legacy, force: force || !!forceIds?.has(i.id), report });
      else if (!i.flags?.[SYS]?.keepCustom) upd = fillFrom(i, src);
      // The features a kit granted follow the kit as it will be: the compendium's list if the kit takes it, or the
      // kit's own list if it keeps an edit (or is left as it was).
      if (i.type === "kit") kitFeatures.set(i.id, clone(upd["system.features"] ?? (i._source?.system ?? i.system)?.features ?? []));
    } else if (i.type === "ability" && kitFeatures.has(i.flags?.[SYS]?.grantedBy)) {
      const features = kitFeatures.get(i.flags[SYS].grantedBy);
      const idx = Number(String(i.flags[SYS].source ?? "").split(".").pop());
      const f = features[idx]?.name === i.name ? features[idx] : features.find(x => x.name === i.name);
      upd = refreshGranted(i, features, { maxNow: maxOn(actor, i, f?.uses), legacy, force: force || !!forceIds?.has(i.id), report });
    }
    if (report.kept?.length) notes.kept.push({ uuid: i.uuid, label: actor ? `${actor.name}: ${i.name}` : i.name, fields: report.kept });
    if (report.unstamped) { notes.unstamped += 1; notes.unstampedActors.add(actor?.id ?? "items"); }
    if (Object.keys(upd).length) updates.push({ _id: i.id, ...upd });
  }
  return updates;
}

/** One pass over the world: every character's and monster's items, then the Items directory. */
async function pass(fetch, opts) {
  let items = 0, world = 0, stamped = 0;
  const actors = opts.actorIds ?? new Set();
  const count = ups => ups.filter(u => Object.keys(u).some(k => k.startsWith("system."))).length;
  for (const actor of game.actors) {
    try {
      const updates = await updatesFor(actor.items.contents, actor, fetch, opts);
      // Monsters from the Bestiary: their abilities' auras (Fire Aura, Fear Aura), matched by name.
      const msrc = actor._stats?.compendiumSource ?? actor.flags?.core?.sourceId ?? "";
      if (actor.type === "npc" && typeof msrc === "string" && msrc.startsWith(`Compendium.${SYS}.monsters.`)) {
        const m = await fetch(msrc);
        for (const i of actor.items) {
          const o = m?.items?.find(x => x.name === i.name && x.type === i.type);
          // Once (a monster added before auras existed); one the GM took the aura off, or marked Keep my edits, stays.
          if (o?.system?.auras?.length && !i.system.auras?.length && !i.flags?.[SYS]?.aurasFilled && !i.flags?.[SYS]?.keepCustom && !updates.some(u => u._id === i.id)) updates.push({ _id: i.id, "system.auras": o.system.auras, [`flags.${SYS}.aurasFilled`]: true });
        }
      }
      if (!updates.length) continue;
      await actor.updateEmbeddedDocuments("Item", updates, { arneyanForce: true, arneyanMigration: true });
      const n = count(updates);
      items += n; stamped += updates.length - n; if (n) actors.add(actor.id);
    } catch (err) { console.warn(`Arneyan | migration: ${actor.name}`, err); }
  }
  try {
    const updates = await updatesFor(game.items.contents, null, fetch, opts);
    if (updates.length) { await Item.updateDocuments(updates, { arneyanMigration: true }); world = count(updates); stamped += updates.length - world; }
  } catch (err) { console.warn("Arneyan | migration: Items directory", err); }
  return { items, actors: actors.size, world, stamped };
}

/** Ask the GM what to do with items added before fingerprints: "update" or "skip". */
async function askLegacy(n, actors, version) {
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: `Arneyan ${version}: older items`, icon: "fa-solid fa-arrows-rotate" }, classes: ["arneyan"], position: { width: 460 },
    content: `<p>${n} item${n === 1 ? "" : "s"} on ${actors} sheet${actors === 1 ? "" : "s"} came from the compendiums before this version, and the compendiums have changed since. They were added before the system kept track of edits, so it can't tell whether you changed their rules.</p>
      <p><strong>Update them</strong> to bring their rules, effects, uses, saves and areas up to date (names, descriptions and uses left stay; any rule you changed by hand on them is replaced). <strong>Leave them</strong> to keep them exactly as they are; you'll be asked again after the next update. Items with "Keep my edits" ticked are never changed.</p>`,
    buttons: [{ action: "update", label: "Update them", icon: "fa-solid fa-arrows-rotate", default: true }, { action: "skip", label: "Leave them" }],
    rejectClose: false
  }).catch(() => null);
  return res === "update" ? "update" : "skip";
}

/**
 * Run the update if this world hasn't had it for this version yet (the active GM only). `legacy` decides items added
 * before fingerprints without asking ("update" or "skip"). Returns { items, actors, world, kept, unstamped }.
 */
export async function runMigration({ force = false, legacy = null } = {}) {
  if (!game.users.activeGM?.isSelf) return null;
  const version = currentVersion();
  if (!force && !foundry.utils.isNewerVersion(version, game.settings.get(SYS, "migratedTo") || "0")) return null;
  const cache = new Map();
  const fetch = async uuid => {
    if (!cache.has(uuid)) cache.set(uuid, await fromUuid(uuid).catch(() => null));
    return cache.get(uuid);
  };
  const notes = { kept: [], unstamped: 0, unstampedActors: new Set() };
  const actorIds = new Set();
  // First everything that's safe: unedited items, and older items already the same as the compendium.
  const res = await pass(fetch, { legacy: legacy ?? "skip", notes, actorIds });
  let legacyDone = 0;
  if (notes.unstamped && legacy === null) {
    const choice = await askLegacy(notes.unstamped, notes.unstampedActors.size, version);
    if (choice === "update") {
      const more = await pass(fetch, { legacy: "update", notes: { kept: [], unstamped: 0, unstampedActors: new Set() }, actorIds });
      res.items += more.items; res.world += more.world; res.actors = actorIds.size; legacyDone = notes.unstamped;
    }
  }
  await game.settings.set(SYS, "migratedTo", version);
  const left = legacyDone ? 0 : (legacy === "update" ? 0 : notes.unstamped);
  if (res.items || res.world || notes.kept.length || left) {
    const gms = game.users.filter(u => u.isGM).map(u => u.id);
    const extra = res.world ? ` and ${res.world} in the Items directory` : "";
    const keptList = notes.kept.slice(0, 40).map(k => `<li>${esc(k.label)} (${esc(k.fields.join(", "))})</li>`).join("") + (notes.kept.length > 40 ? `<li>and ${notes.kept.length - 40} more</li>` : "");
    const content = `<div class="arn-card"><p><strong>Arneyan ${esc(version)}:</strong> Updated ${res.items} item${res.items === 1 ? "" : "s"} on ${res.actors} actor${res.actors === 1 ? "" : "s"}${extra} from the compendiums.</p>`
      + `<p class="arn-card-meta">Rules, effects, uses, activities, saves, damage and areas now match the compendium. Names, descriptions and uses left stay. Tick "Keep my edits" on an item to stop updates changing it.</p>`
      + (notes.kept.length ? `<p><strong>Your edits kept</strong> on ${notes.kept.length} item${notes.kept.length === 1 ? "" : "s"} (the compendium changed these too):</p><ul>${keptList}</ul><button type="button" class="arn-migrate-force"><i class="fa-solid fa-arrows-rotate"></i> Update these anyway</button>` : "")
      + (left ? `<p>${left} older item${left === 1 ? "" : "s"} left as ${left === 1 ? "it was" : "they were"}; you'll be asked again after the next update.</p>` : "")
      + `</div>`;
    await ChatMessage.create({ whisper: gms, speaker: { alias: "The Arneyan Codex" }, content, flags: { [SYS]: { migrateKept: notes.kept.map(k => k.uuid) } } });
  }
  return { items: res.items, actors: res.actors, world: res.world, kept: notes.kept.length, unstamped: left };
}

/** "Update these anyway": replace the listed items' mechanics from the compendium, edits or not. Returns how many. */
export async function forceUpdate(uuids = []) {
  if (!game.user.isGM) return 0;
  const cache = new Map();
  const fetch = async uuid => {
    if (!cache.has(uuid)) cache.set(uuid, await fromUuid(uuid).catch(() => null));
    return cache.get(uuid);
  };
  let n = 0;
  const items = (await Promise.all(uuids.map(u => fromUuid(u).catch(() => null)))).filter(i => i instanceof Item);
  const byParent = new Map();
  for (const i of items) { const k = i.parent ?? null; byParent.set(k, [...(byParent.get(k) ?? []), i]); }
  for (const [actor, list] of byParent) {
    // A kit's granted features need their kit in the same pass; a kit updated here takes its granted features along
    // (Crushing Blow follows The Heavy Hand), with their own edits kept as in any update.
    // The listed items are forced; anything else here follows the fingerprints, and one with none is left alone.
    const ids = new Set(list.map(i => i.id));
    const listedKits = new Set(list.filter(i => i.type === "kit").map(i => i.id));
    const kits = actor ? actor.items.filter(x => x.type === "kit" && list.some(i => i.flags?.[SYS]?.grantedBy === x.id)) : [];
    const granted = actor ? actor.items.filter(x => x.type === "ability" && listedKits.has(x.flags?.[SYS]?.grantedBy) && !ids.has(x.id)) : [];
    const pool = actor ? [...new Set([...list, ...kits, ...granted])] : list;
    const ups = (await updatesFor(pool, actor, fetch, { legacy: "skip", forceIds: ids, notes: { kept: [], unstamped: 0, unstampedActors: new Set() } }))
      .filter(u => ids.has(u._id) || granted.some(i => i.id === u._id));
    if (!ups.length) continue;
    if (actor) await actor.updateEmbeddedDocuments("Item", ups, { arneyanForce: true, arneyanMigration: true });
    else await Item.updateDocuments(ups, { arneyanMigration: true });
    // Counted as the report counts: an item whose mechanics changed (not only its fingerprints).
    n += ups.filter(u => Object.keys(u).some(k => k.startsWith("system."))).length;
  }
  return n;
}

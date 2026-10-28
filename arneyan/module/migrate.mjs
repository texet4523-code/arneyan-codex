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
 *
 * 0.10.25: each item an update changes keeps a copy of what it replaced (flags.arneyan.before), and the GM's report
 * can put it all back; the report lists, per character, what's now automatic (so a bonus added by hand can come off);
 * a character whose update failed is tried again the next time the world loads.
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
const MECH = [...FIELDS, "uses", "abilityChoice", "weaponChoice", "optionChoice", "features"];
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
function mechView(field, v, legacy = false, raw = false) {
  if (v == null) return null;
  if (field === "uses") return { max: Number(v.max) || 0, per: v.per ?? "", formula: v.formula ?? "" };
  if (field === "abilityChoice") return { options: [...(v.options ?? [])] };  // the pick and a move are play, not mechanics
  if (field === "weaponChoice") return { max: String(v.max ?? "") };
  if (field === "optionChoice") return (v.options?.length ? { label: v.label ?? "", max: String(v.max ?? ""), options: plainRules(v.options) } : null);
  if (field === "features" && Array.isArray(v)) return plainRules(v.map(f => {
    const c = clone(f) ?? {};
    if (c.uses) delete c.uses.value;
    if (c.abilityChoice) { delete c.abilityChoice.value; delete c.abilityChoice.moved; }
    if (c.weaponChoice) delete c.weaponChoice.value;
    if (!legacy && c.weaponChoice && !String(c.weaponChoice.max ?? "")) delete c.weaponChoice;
    if (Array.isArray(c.activities)) c.activities = mechView("activities", c.activities);
    // 0.10.43: a feature's text counts by its words, so a new layout (short points, bold terms) isn't a change.
    if (!legacy && !raw && typeof c.description === "string") c.description = wordsOf(c.description);
    return c;
  }));
  if (["rules", "applies", "auras"].includes(field)) return plainRules(v);
  // 0.10.68: activities gained `effect` and `spendAny`; blank ones read as no field, so older stamps still match.
  if (field === "activities" && Array.isArray(v)) return v.map(a => {
    if (!a || typeof a !== "object") return a;
    const c = { ...a };
    if (c.effect === "") delete c.effect;
    if (c.spendAny === false) delete c.spendAny;
    return c;
  });
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
  return fingerprint(field, v) === stamp
    || (field === "features" && (hash(mechView(field, v, false, true)) === stamp || hash(mechView(field, v, true)) === stamp));
}

/**
 * A kit's features with the compendium's layout for each description whose words are the same (by name, else by
 * place in the list): the GM's own edits (uses, a reworded text) stay.
 */
export function laidOutFeatures(features, srcFeatures) {
  if (!Array.isArray(features) || !Array.isArray(srcFeatures)) return null;
  let changed = false;
  const out = features.map((f, i) => {
    const src = srcFeatures.find(x => x?.name === f?.name) ?? srcFeatures[i];
    const d = layoutFrom(f?.description, src?.description);
    if (!d) return f;
    changed = true;
    return { ...clone(f), description: d };
  });
  return changed ? out : null;
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

/** A description's words alone (no tags, no spaces), to tell a new layout from a reworded text. */
export function wordsOf(h) { return String(h ?? "").replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;/g, "").replace(/\s+/g, ""); }

/**
 * 0.10.43: descriptions laid out for reading (short points, key terms in bold). A copy on a sheet takes the new
 * layout only when its words are exactly the compendium's: a description anyone reworded stays as it is.
 */
export function layoutFrom(desc, srcDesc) {
  if (typeof desc !== "string" || typeof srcDesc !== "string" || desc === srcDesc) return null;
  return wordsOf(desc) === wordsOf(srcDesc) ? srcDesc : null;
}

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
  // 0.10.24: the Trident is one-handed and a Lance "Two-handed on foot" (Kieran, 20 Oct). Copies of those two from
  // before get the Catalogue's traits, once (flags.arneyan.handsSet), and only where the Two-handed part is all that
  // differs: a GM who changes it back later keeps the change.
  const srcName = String(src.name ?? "");
  if (item.type === "weapon" && /^(Trident|Lance, (Light|Heavy))$/.test(srcName) && !item.flags?.[SYS]?.handsSet
      && typeof o.traits === "string" && typeof s.traits === "string") {
    const plainT = t => t.replace(/,?\s*Two-handed(?: on foot)?(?=\s*(?:,|$))/gi, "").replace(/^[,\s]+|[,\s]+$/g, "").trim();
    if (s.traits !== o.traits && plainT(s.traits) === plainT(o.traits)) upd["system.traits"] = o.traits;
    upd[`flags.${SYS}.handsSet`] = true;
  }
  // 0.10.52: torches bundle 5 a slot and the Backpack takes no slot (Kieran, 25 Oct). Copies from before change once
  // (flags.arneyan.slotsSet), and only while they still have the old values: a GM's own change stays.
  // 0.10.60: Knives and scrolls bundle 5 a slot too (Kieran, 25 Oct); Daggers don't.
  const bundles = /^(Torch|Knife)$|^Scroll\b/.test(srcName);
  if (((item.type === "equipment" && (/^(Torch|Backpack)$/.test(srcName) || /^Scroll\b/.test(srcName))) || (item.type === "weapon" && srcName === "Knife")) && !item.flags?.[SYS]?.slotsSet) {
    let set = false;
    if (bundles && o.bundle === 5 && !(s.bundle > 0) && Number(s.slots) === 1) { upd["system.bundle"] = 5; set = true; }
    if (srcName === "Backpack" && Number(o.slots) === 0 && Number(s.slots) === 1) { upd["system.slots"] = 0; set = true; }
    if (set) upd[`flags.${SYS}.slotsSet`] = true;
  }
  // A weapon that gained a mode (a Flame Tongue ignites, a Lance's Mounted switch): its mode, and the extra damage
  // tied to the mode; extra damage of its own (a forged Lance of Shocking) stays.
  if (item.type === "weapon" && o.toggle && o.modeLabel && !s.modeLabel) {
    upd["system.toggle"] = true; upd["system.modeLabel"] = o.modeLabel; upd["system.modeLight"] = o.modeLight ?? 0;
    const modeDmg = (o.bonusDamage ?? []).filter(b => b.mode);
    if (modeDmg.length) upd["system.bonusDamage"] = [...(s.bonusDamage ?? []).filter(b => !b.mode), ...modeDmg];
  }
  // What the GM put back after an update stays as it is: it isn't filled in again.
  const back = item.flags?.[SYS]?.putBack ?? [];
  if (back.length) for (const k of Object.keys(upd)) if (back.some(p => k === p || k.startsWith(`${p}.`) || p.startsWith(`${k}.`))) delete upd[k];
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
    if (old?.abilityChoice?.moved && nf.abilityChoice) nf.abilityChoice.moved = old.abilityChoice.moved;
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
  const plainIf = (k, v) => (k === "features" ? mechView("features", v) : ["rules", "applies", "auras"].includes(k) ? plainRules(v) : v);
  const set = (k, v) => {
    if (same(plainIf(k, s[k]), plainIf(k, v))) { next[k] = fingerprint(k, v); return; }
    // Changed by hand since it arrived (or since the last update): keep it, and its old fingerprint.
    if (!force && !unstamped && stamps[k] !== undefined && !matchesStamp(k, s[k], stamps[k])) {
      // Listed only when the compendium changed more than its layout (the copy's own text read in its place).
      const asBefore = k === "features" ? (laidOutFeatures(v, s[k]) ?? v) : v;
      if (!matchesStamp(k, v, stamps[k]) && !matchesStamp(k, asBefore, stamps[k])) kept.push(k);
      return;
    }
    upd[`system.${k}`] = clone(v);
    next[k] = fingerprint(k, v);
  };
  for (const k of FIELDS) if (o[k] !== undefined && k in s) set(k, o[k]);
  // An attribute picked already stays, if the new options still have it.
  if (o.abilityChoice !== undefined && "abilityChoice" in s) {
    const opts = o.abilityChoice?.options ?? [];
    set("abilityChoice", { options: opts, value: opts.includes(s.abilityChoice?.value) ? s.abilityChoice.value : "", moved: s.abilityChoice?.moved ?? "" });
  }
  // Weapons picked already stay (the player's choice, never the GM's edit); the compendium decides how many may be.
  if (o.weaponChoice !== undefined && "weaponChoice" in s) set("weaponChoice", { max: String(o.weaponChoice?.max ?? ""), value: [...(s.weaponChoice?.value ?? [])] });
  // Options picked already stay where the compendium still has them (Elemental Mastery's element).
  if (o.optionChoice?.options?.length && "optionChoice" in s) {
    const names = new Set(o.optionChoice.options.map(x => x?.name));
    set("optionChoice", { ...clone(o.optionChoice), value: (s.optionChoice?.value ?? []).filter(v => names.has(v)) });
  }
  // A choice the compendium no longer asks on this item (0.10.66: Elemental Mastery (Improved) follows Elemental
  // Mastery's pick): cleared while nothing is picked on it, so the sheet stops asking.
  if (!o.optionChoice?.options?.length && s.optionChoice?.options?.length && !(s.optionChoice.value ?? []).length) set("optionChoice", { label: "", max: "", options: [], value: [] });
  if (o.uses !== undefined && "uses" in s) set("uses", usesFrom(s.uses, o.uses, maxNow));
  if (item.type === "kit" && Array.isArray(o.features)) set("features", kitFeaturesFrom(s.features, o.features));
  if (report && kept.length) report.kept = kept;
  // Record the fingerprints when they change (a first stamp, or a field updated), not on every run.
  if (!same(stamps, next)) upd[`flags.${SYS}.synced`] = next;
  return upd;
}

/**
 * 0.10.64 (B-F6): a deity's or patron's alignment and wiki page, filled in where the kit copy has none. Only blanks are
 * filled, so it runs beside the fingerprinted refresh (even for older items the GM chose to leave), and a GM's own
 * alignment stays. Not for a kit with "Keep my edits".
 */
export function kitFill(item, src) {
  const upd = {};
  if (item?.type !== "kit" || src?.type !== "kit" || item.flags?.[SYS]?.keepCustom) return upd;
  const s = item._source?.system ?? item.system ?? {}, o = src.system ?? {};
  const f = item._source?.flags?.[SYS] ?? item.flags?.[SYS] ?? {};
  // Once only (flags.arneyan.alignFilled), and never over what the GM put back: a GM who clears it later keeps it clear.
  const back = f.putBack ?? [];
  if (o.alignment && !String(s.alignment ?? "").trim() && !f.alignFilled && !back.includes("system.alignment")) {
    upd["system.alignment"] = o.alignment;
    upd[`flags.${SYS}.alignFilled`] = true;
  }
  const wiki = src.flags?.[SYS]?.wiki;
  if (wiki && !f.wiki) upd[`flags.${SYS}.wiki`] = wiki;
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
  game.settings.register(SYS, "migrateRetry", { scope: "world", config: false, type: Object, default: {} });
  Hooks.once("ready", () => runMigration().catch(err => console.warn("Arneyan | migration", err)));
  // The GM's report: "Update these anyway" for the items whose edits were kept.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const btn = html?.querySelector?.(".arn-migrate-force");
    if (!btn || !game.user.isGM) return;
    if (message.getFlag(SYS, "migrateForced")) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-check"></i> Updated'; return; }
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const uuids = message.getFlag(SYS, "migrateKept") ?? [];
      const changed = [];
      const res = await forceUpdate(uuids, { changed, version: message.getFlag(SYS, "migrateVersion") ?? null });
      // What it replaced can be put back from the same report (again, if it was put back before).
      await message.update({ [`flags.${SYS}.migrateForced`]: true, [`flags.${SYS}.migratePutBack`]: false,
        [`flags.${SYS}.migrateChanged`]: [...new Set([...(message.getFlag(SYS, "migrateChanged") ?? []), ...changed])] });
      ui.notifications.info(`Updated ${res} item${res === 1 ? "" : "s"} from the compendiums.`);
    });
  });
  // "Put back what this update replaced": every item the report's update (or its "Update these anyway") changed.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const btn = html?.querySelector?.(".arn-migrate-putback");
    if (!btn || !game.user.isGM) return;
    if (message.getFlag(SYS, "migratePutBack")) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-check"></i> Put back'; return; }
    if (!(message.getFlag(SYS, "migrateChanged") ?? []).length) { btn.disabled = true; btn.dataset.tooltip = "Nothing changed yet: use Update these anyway first"; return; }
    btn.addEventListener("click", async () => {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Put back what the update replaced?" },
        content: `<p>The items this update changed get back the rules, effects, uses and so on they had before it (uses left and anything picked since stay). Later updates leave what you put back alone; if the compendium changes it again, they list it under "Your edits kept".</p>`,
        rejectClose: false
      }).catch(() => false);
      if (!ok) return;
      btn.disabled = true;
      const n = await putBack(message.getFlag(SYS, "migrateChanged") ?? [], message.getFlag(SYS, "migrateVersion") ?? null);
      await message.setFlag(SYS, "migratePutBack", true);
      ui.notifications.info(`Put back ${n} item${n === 1 ? "" : "s"} as they were before the update.`);
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
      if (i.type === "kit") Object.assign(upd, kitFill(i, src));
      // The features a kit granted follow the kit as it will be: the compendium's list if the kit takes it, or the
      // kit's own list if it keeps an edit (or is left as it was).
      if (i.type === "kit") kitFeatures.set(i.id, clone(upd["system.features"] ?? (i._source?.system ?? i.system)?.features ?? []));
      // The new layout of the same words (not while the GM is still to be asked about older items).
      const back = i.flags?.[SYS]?.putBack ?? [];
      if (!i.flags?.[SYS]?.keepCustom && !report.unstamped) {
        const d = !back.includes("system.description") && layoutFrom((i._source?.system ?? i.system)?.description, src.system?.description);
        if (d) upd["system.description"] = d;
        if (i.type === "kit") {
          const now = upd["system.features"] ?? (i._source?.system ?? i.system)?.features;
          const laid = laidOutFeatures(now, src.system?.features);
          if (laid) {
            upd["system.features"] = laid;
            kitFeatures.set(i.id, clone(laid));
            // A stamp that matched before still matches (its words are the same): stamped again in the new form.
            const synced = upd[`flags.${SYS}.synced`] ?? i._source?.flags?.[SYS]?.synced;
            if (synced && typeof synced === "object" && matchesStamp("features", now, synced.features)) upd[`flags.${SYS}.synced`] = { ...synced, features: fingerprint("features", laid) };
          }
        }
      }
    } else if (i.type === "ability" && kitFeatures.has(i.flags?.[SYS]?.grantedBy)) {
      const features = kitFeatures.get(i.flags[SYS].grantedBy);
      const idx = Number(String(i.flags[SYS].source ?? "").split(".").pop());
      const f = features[idx]?.name === i.name ? features[idx] : features.find(x => x.name === i.name);
      upd = refreshGranted(i, features, { maxNow: maxOn(actor, i, f?.uses), legacy, force: force || !!forceIds?.has(i.id), report });
      const d = !i.flags?.[SYS]?.keepCustom && !report.unstamped && !(i.flags?.[SYS]?.putBack ?? []).includes("system.description") && layoutFrom((i._source?.system ?? i.system)?.description, f?.description);
      if (d) upd["system.description"] = d;
    } else if (i.type === "ability" && actor && !i.flags?.[SYS]?.toggleSet && !i.flags?.[SYS]?.keepCustom) {
      // 0.10.54: a Shifter's lineage counts only while shifted, as a switch with its uses (Batch 8). One granted
      // before gets the switch, its uses and its rules once (flags.arneyan.toggleSet); a GM's own rules stay.
      const anc = actor.items?.get?.(i.flags?.[SYS]?.grantedBy);
      const ancUuid = anc?.type === "ancestry" ? sourceOf(anc) : null;
      const ancSrc = ancUuid ? plain(await fetch(ancUuid)) : null;
      const ch = ancSrc?.system?.choice;
      const o = (ch?.options ?? []).find(x => x?.toggle && `${ch.label}: ${x.name}` === i.name);
      if (o && !(i._source?.system ?? i.system)?.toggle) {
        const short = String(o.name).replace(/\s*\(.*\)$/, "");
        upd["system.toggle"] = true;
        upd["system.active"] = false;
        if (o.uses) upd["system.uses"] = { ...o.uses, value: maxOn(actor, i, o.uses) ?? o.uses.value };
        if (!((i._source?.system ?? i.system)?.rules ?? []).length && o.rules?.length) upd["system.rules"] = o.rules.map(r => ({ ...r, label: r.label || short }));
        upd[`flags.${SYS}.toggleSet`] = true;
      }
    }
    if (report.kept?.length) notes.kept.push({ uuid: i.uuid, label: actor ? `${actor.name}: ${i.name}` : i.name, fields: report.kept });
    if (report.unstamped) { notes.unstamped += 1; notes.unstampedActors.add(actor?.id ?? "items"); }
    if (Object.keys(upd).length) updates.push({ _id: i.id, ...upd });
  }
  return updates;
}

/** Is a rule one the system applies (not a reminder note)? */
const autoRule = r => !!r?.key && !String(r.key).startsWith("note.");
/**
 * What an update makes automatic that wasn't (Crushing Blow's note turning into its reroll; a spell gaining its
 * effect or aura): true when the item had no applied rule with a key it has now, or gains effects or auras.
 */
export function becameAutomatic(before = {}, upd = {}) {
  if (Array.isArray(upd["system.rules"])) {
    const had = new Set((before.rules ?? []).filter(autoRule).map(r => r.key));
    if (upd["system.rules"].some(r => autoRule(r) && !had.has(r.key))) return true;
  }
  for (const k of ["applies", "auras"]) if (Array.isArray(upd[`system.${k}`]) && upd[`system.${k}`].length && !(before[k] ?? []).length) return true;
  return false;
}

/**
 * 0.10.25: before an update replaces an item's mechanics, a copy of what it replaces goes on the item
 * (flags.arneyan.before: the version and the old values, as JSON so a later copy never merges with an older one).
 * "Put back what this update replaced" restores it. Adds to `notes.changed` (uuids) and `notes.automatic`.
 */
export function keepCopies(items, updates, version, notes = null, label = null) {
  for (const u of updates) {
    const keys = Object.keys(u).filter(k => k.startsWith("system."));
    if (!keys.length) continue;
    const item = items.find(i => i.id === u._id);
    if (!item) continue;
    const src = item._source ?? item;
    let data = {};
    for (const k of keys) data[k] = clone(foundry.utils.getProperty(src, k) ?? null);
    // A second update in the same version (the older items' pass, "Update these anyway") adds to the copy: the value
    // from before the first one is the one to put back.
    const prev = src.flags?.[SYS]?.before;
    if (prev?.version === version) { try { data = { ...data, ...JSON.parse(prev.json) }; } catch { /* unreadable: start again */ } }
    // An older report's "Update these anyway" doesn't replace a newer update's copy.
    else if (prev?.version && version && foundry.utils.isNewerVersion?.(prev.version, version)) continue;
    u[`flags.${SYS}.before`] = { version, json: JSON.stringify(data) };
    if (!notes) continue;
    notes.changed?.push(item.uuid);
    if (notes.automatic && becameAutomatic(src.system ?? {}, u)) {
      const who = label ?? item.parent?.name ?? "Items directory";
      (notes.automatic[who] ??= []).push(item.name);
    }
  }
  return updates;
}

/**
 * What play has changed since the update stays when it's put back: uses left (up to the restored maximum), and an
 * attribute or weapon picked; a kit's features keep theirs the same way.
 */
function keepPlay(item, data) {
  const cur = item._source?.system ?? item.system ?? {};
  if (data["system.uses"] && cur.uses) {
    const max = Number(data["system.uses"].max) || 0;
    const left = Number(cur.uses.value) || 0;
    data["system.uses"] = { ...data["system.uses"], value: max ? Math.max(0, Math.min(left, max)) : left };
  }
  if (data["system.abilityChoice"] && cur.abilityChoice?.value) {
    const opts = data["system.abilityChoice"].options ?? [];
    if (opts.includes(cur.abilityChoice.value)) data["system.abilityChoice"] = { ...data["system.abilityChoice"], value: cur.abilityChoice.value };
  }
  // A bonus moved by the 18 cap stays moved.
  if (data["system.abilityChoice"] && cur.abilityChoice?.moved) data["system.abilityChoice"] = { ...data["system.abilityChoice"], moved: cur.abilityChoice.moved };
  if (data["system.weaponChoice"] && cur.weaponChoice?.value?.length) data["system.weaponChoice"] = { ...data["system.weaponChoice"], value: [...cur.weaponChoice.value] };
  // Options picked since (Eldritch Invocations): kept, where the restored list still has them.
  if (data["system.optionChoice"]) {
    const names = new Set((data["system.optionChoice"].options ?? []).map(o => o?.name));
    const restored = data["system.optionChoice"].value ?? [];
    const now = (cur.optionChoice?.value ?? []).filter(v => names.has(v));
    // Both: a pick the update dropped (its option renamed) comes back with the option.
    data["system.optionChoice"] = { ...data["system.optionChoice"], value: [...new Set([...now, ...restored.filter(v => names.has(v))])] };
  }
  if (Array.isArray(data["system.features"])) data["system.features"] = kitFeaturesFrom(cur.features ?? [], data["system.features"]);
  return data;
}

/** "Put back what this update replaced": the items' mechanics as they were before `version`'s update. Returns how many. */
export async function putBack(uuids = [], version = null) {
  if (!game.user.isGM) return 0;
  const items = (await Promise.all([...new Set(uuids)].map(u => fromUuid(u).catch(() => null)))).filter(i => i instanceof Item);
  const byParent = new Map();
  for (const i of items) {
    const b = i.flags?.[SYS]?.before;
    if (!b?.json || (version && b.version !== version)) continue;
    let data;
    try { data = JSON.parse(b.json); } catch { continue; }
    keepPlay(i, data);
    const paths = [...new Set([...(i.flags?.[SYS]?.putBack ?? []), ...Object.keys(data)])];
    const k = i.parent ?? null;
    byParent.set(k, [...(byParent.get(k) ?? []), { _id: i.id, ...data, [`flags.${SYS}.putBack`]: paths, [`flags.${SYS}.-=before`]: null }]);
  }
  let n = 0;
  for (const [actor, ups] of byParent) {
    // One sheet that fails doesn't stop the rest.
    try {
      if (actor) await actor.updateEmbeddedDocuments("Item", ups, { arneyanMigration: true });
      else await Item.updateDocuments(ups, { arneyanMigration: true });
      n += ups.length;
    } catch (err) { console.warn(`Arneyan | put back: ${actor?.name ?? "Items directory"}`, err); }
  }
  return n;
}

function mergeNotes(notes, mine) {
  if (!notes) return;
  notes.changed?.push(...mine.changed);
  if (notes.automatic) for (const [who, names] of Object.entries(mine.automatic)) (notes.automatic[who] ??= []).push(...names);
}

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

/**
 * Books v0.10.5: monsters have attribute scores. A Bestiary monster copied into the world before then (all six at 10)
 * takes the stat block's scores, each save still at the old book's number (half HD, +2 if good; an edited save
 * stays), and its skills if it has none. Once per monster. Returns { update, skills, changed } or null.
 */
export function scoresFrom(actor, src) {
  if (!actor || !src || actor.flags?.[SYS]?.scoresFilled) return null;
  const mine = actor.system?.abilities ?? {}, theirs = src.system?.abilities ?? {};
  const value = (a, k) => Number(a?.[k]?.value ?? a?.[k]) || 0;
  const update = { [`flags.${SYS}.scoresFilled`]: true };
  // Scores only onto a sheet still at all 10s; then each save still at the old book's number takes the new one (a
  // save the GM changed stays). A sheet whose scores the GM set keeps its saves too.
  if (ABILITY_KEYS.every(k => value(mine, k) === 10)) {
    for (const k of ABILITY_KEYS) if (value(theirs, k) !== 10) update[`system.abilities.${k}.value`] = value(theirs, k);
    const before = src.flags?.[SYS]?.savesBefore;
    if (before) for (const k of ["fort", "ref", "will"]) {
      const now = Number(src.system?.saves?.[k]) || 0;
      if (Number(actor.system?.saves?.[k]) === Number(before[k]) && now !== Number(before[k])) update[`system.saves.${k}`] = now;
    }
  }
  const items = actor.items?.contents ?? actor.items ?? [];
  const has = items.some?.(i => i.type === "skill");
  const srcItems = src.items?.contents ?? src.items ?? [];
  const skills = has ? [] : srcItems.filter(i => i.type === "skill").map(i => {
    const d = typeof i.toObject === "function" ? i.toObject() : foundry.utils.deepClone(i);
    delete d._id;
    return d;
  });
  return { update, skills, changed: Object.keys(update).length > 1 || skills.length > 0 };
}

/** One pass over the world: every character's and monster's items, then the Items directory. */
async function pass(fetch, opts) {
  let items = 0, world = 0, stamped = 0;
  const actors = opts.actorIds ?? new Set();
  const count = ups => ups.filter(u => Object.keys(u).some(k => k.startsWith("system."))).length;
  const only = opts.only ?? null;
  for (const actor of game.actors) {
    if (only && !only.actors.has(actor.id)) continue;
    try {
      const updates = await updatesFor(actor.items.contents, actor, fetch, opts);
      // Monsters from the Bestiary: their abilities' auras (Fire Aura, Fear Aura), matched by name.
      // (A companion or mount kept from the Bestiary names its monster in flags.arneyan.bestiary.)
      const msrc = actor._stats?.compendiumSource ?? actor.flags?.core?.sourceId ?? actor.flags?.[SYS]?.bestiary ?? "";
      if (actor.type === "npc" && typeof msrc === "string" && msrc.startsWith(`Compendium.${SYS}.monsters.`)) {
        const m = await fetch(msrc);
        for (const i of actor.items) {
          const o = m?.items?.find(x => x.name === i.name && x.type === i.type);
          // Once (a monster added before auras existed); one the GM took the aura off, or marked Keep my edits, stays.
          if (o?.system?.auras?.length && !i.system.auras?.length && !i.flags?.[SYS]?.aurasFilled && !i.flags?.[SYS]?.keepCustom && !updates.some(u => u._id === i.id)) updates.push({ _id: i.id, "system.auras": o.system.auras, [`flags.${SYS}.aurasFilled`]: true });
          // An ability that has gained a rule (0.10.68, M&T v0.10.30: Parry is the first melee attack against it each
          // round at Disadvantage): the rule and the book's new wording for it, once; edits and put-back as above.
          else if (o?.system?.rules?.length && !(i.system.rules ?? []).length && !i.flags?.[SYS]?.rulesFilled && !i.flags?.[SYS]?.keepCustom && !updates.some(u => u._id === i.id)) updates.push({ _id: i.id, "system.rules": o.system.rules, "system.description": o.system.description ?? i.system.description, [`flags.${SYS}.rulesFilled`]: true });
        }
        const sc = scoresFrom(actor, m);
        if (sc) {
          // Skills first: the flag that stops a second try is written only once they're on.
          if (sc.skills.length) await actor.createEmbeddedDocuments("Item", sc.skills, { arneyanGrant: true, arneyanMigration: true });
          await actor.update(sc.update, { arneyanMigration: true });
          if (sc.changed) { opts.notes?.scored?.push({ id: actor.id, name: actor.name }); actors.add(actor.id); }
        }
      }
      if (!updates.length) continue;
      // Listed only once the update went through.
      const mine = { changed: [], automatic: {} };
      keepCopies(actor.items.contents, updates, opts.version, mine, actor.name);
      await actor.updateEmbeddedDocuments("Item", updates, { arneyanForce: true, arneyanMigration: true });
      mergeNotes(opts.notes, mine);
      const n = count(updates);
      items += n; stamped += updates.length - n; if (n) actors.add(actor.id);
      if (opts.notes?.failed) opts.notes.failed = opts.notes.failed.filter(f => f.id !== actor.id);
    } catch (err) {
      console.warn(`Arneyan | migration: ${actor.name}`, err);
      if (opts.notes?.failed && !opts.notes.failed.some(f => f.id === actor.id)) opts.notes.failed.push({ id: actor.id, name: actor.name });
    }
  }
  if (!only || only.items) {
    try {
      const updates = await updatesFor(game.items.contents, null, fetch, opts);
      if (updates.length) {
        const mine = { changed: [], automatic: {} };
        keepCopies(game.items.contents, updates, opts.version, mine, "Items directory");
        await Item.updateDocuments(updates, { arneyanMigration: true }); world = count(updates); stamped += updates.length - world;
        mergeNotes(opts.notes, mine);
      }
      if (opts.notes?.failed) opts.notes.failed = opts.notes.failed.filter(f => f.id !== "items");
    } catch (err) {
      console.warn("Arneyan | migration: Items directory", err);
      if (opts.notes?.failed && !opts.notes.failed.some(f => f.id === "items")) opts.notes.failed.push({ id: "items", name: "the Items directory" });
    }
  }
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
/**
 * The latest version whose books changed class feature lists: 0.10.65 (books v0.10.22 and v0.10.23, B7: new levels),
 * then 0.10.68 (books v0.10.25 to v0.10.30, R-B7 and K19 to K24: Commands, Performance and Channel Divinity pools, renamed and
 * always-on features). A world coming from before it runs `classRework` once.
 */
export const CLASS_REWORK = "0.10.68";

/** Is version `a` newer than `b` ("0.10.65" than "0.10.64")? Numbers compared part by part. */
export function newerThan(a, b) {
  const pa = String(a ?? "0").split(".").map(Number), pb = String(b ?? "0").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** A class feature list as a comparable key: each feature's level, name and compendium entry. */
const featureKey = list => JSON.stringify((list ?? []).map(f => [Number(f?.level) || 0, String(f?.name ?? ""), String(f?.uuid ?? "")]));

/** Class features the books dropped: in v0.10.22 (B7), Battle Space (Improved), now part of Battle Space, and the
 * Artificer's 11th-level kit tier, now at 5th; in v0.10.25 to v0.10.27 (R-B7), the features the pools replaced (the
 * Knight's Inspire, Embolden, Demoralise and Expert in Arms, now Command options; the Bard's Exalt, Discord, Rally,
 * Exhort Greatness and Words of Power, now Performance options; the Paladin's Smite Evil, Turn Undead and Divine
 * Intervention, now Channel Divinity options), the Wizard's Scribe's Insight, Perfect Recall, Counterspell and
 * Signature Spells and the Illusionist's Perfect Recall, Quick Reaction, renamed Quick Reflexes, and Arcane Reserve
 * (books v0.10.25, gone again in v0.10.28, K19). A class's list
 * loses these; anything else not in the compendium (homebrew) stays. */
export const DROPPED_FEATURES = new Set(["Compendium.arneyan.class-features.Item.I2r5qtG2KwQTR6iK", "Compendium.arneyan.class-features.Item.Rn6ITCaMUuOEzKtD",
  ...["PGT74NWPoMAAKgp7", "9LMT5x0O4r7fkocP", "UuTSGIvWzg5QslOT", "vjHmF66KtVOxZDDU", "uSTUZxOJHdvFNgWR", "JIaD39xKsToGFQqI", "kRQIqmxGqZ793v4R", "eYTrrXe7aFfrOTyg", "dRkz1FNkc0dlZnex", "s1yZv1dE0bEj5BOv", "xG5wRGsRMzXivujQ", "ZE561JAXiWa2pFqL", "rvBtNNIjxzyJA17V", "FNO70JvfLoZanKqm", "bdwwOd80cGPmzxut", "7aWDedO6ICkfxNO3", "hjEk4CMWD5TSmD3U", "gKVwolNGBNNiLG6q", "H3neu8yzLSGCe5yL", "v5Af6iwBOG6WQMBU", "TuG1EEi0FYQBtn7p", "hU9kcAPORzWXsrOh", "UrSW25YSYzhk2JKs", "OeBvaMJNJnuII8ki", "EYjMeqRHAqP2eDk9"].map(id => `Compendium.arneyan.class-features.Item.${id}`)]);

/** The class a world or actor copy came from, if it's the system's compendium. */
const classSource = cls => {
  const uuid = cls?._stats?.compendiumSource ?? cls?.flags?.core?.sourceId ?? "";
  return typeof uuid === "string" && uuid.startsWith(`Compendium.${SYS}.classes.`) ? uuid : "";
};

/** Each kit's feature levels before this update changes them (a kit's list is refreshed by the main pass). */
export function kitLevelsOf(actors) {
  const out = new Map();
  for (const actor of actors ?? []) for (const k of actor?.items?.filter?.(i => i.type === "kit") ?? []) out.set(k.uuid ?? `${actor.id}.${k.id}`, (k.system?.features ?? []).map(f => Number(f?.level) || 1));
  return out;
}

/**
 * 0.10.65: classes and kits on sheets take the books' new feature levels (B7: every core feature by 5th), once.
 * - A class's feature list becomes the compendium's (homebrew entries kept, the two features the books dropped
 *   removed); the list it had is kept in flags.arneyan.featuresBefore, marked with the rework's version
 *   (featuresBeforeFor) so a later rework never reads an earlier one's list.
 * - Only what the character's level newly reaches is added (a 6th-level Fighter gets Battle Space, Unbroken and Legend
 *   of Battle); a feature the GM deleted earlier stays deleted, and nothing is taken away. Kits the same, from the
 *   levels their features had before the update (`kitBefore`, from kitLevelsOf).
 * - Features already on the sheet that now come earlier take their new level (levelling down then keeps them).
 * - A dropped feature still on a sheet is listed for the GM. A class marked "Keep my edits", or not from the system's
 *   compendium, is left alone. Classes in the Items directory get the new list too (nothing to grant there).
 * `grant` = { cls(actor, cls, only), kit(actor, kit, only) } adds features (progression.mjs); `classOf(actor, kit)` is
 * the class a kit belongs to.
 */
export async function classRework(actors, fetch, grant, notes, { kitBefore = new Map(), worldItems = [], classOf = null } = {}) {
  const flag = (i, k) => i?.flags?.[SYS]?.[k];
  for (const cls of worldItems ?? []) {
    try {
      const uuid = cls?.type === "class" ? classSource(cls) : "";
      if (!uuid || flag(cls, "keepCustom") || flag(cls, "reworked") === CLASS_REWORK) continue;
      const list = plain(await fetch(uuid))?.system?.features;
      if (!Array.isArray(list)) continue;
      const old = cls.system.features ?? [];
      const merged = [...clone(list), ...old.filter(f => !list.some(x => x.uuid === f.uuid) && !DROPPED_FEATURES.has(f.uuid))];
      await cls.update({ "system.features": merged, [`flags.${SYS}.featuresBefore`]: clone(old), [`flags.${SYS}.featuresBeforeFor`]: CLASS_REWORK, [`flags.${SYS}.reworked`]: CLASS_REWORK }, { arneyanMigration: true });
    } catch (err) { console.warn(`Arneyan | class features: ${cls?.name}`, err); }
  }
  for (const actor of actors) {
    if (actor?.type !== "character") continue;
    try {
      for (const cls of actor.items.filter(i => i.type === "class")) {
        const uuid = classSource(cls);
        if (!uuid || flag(cls, "keepCustom") || flag(cls, "reworked") === CLASS_REWORK) continue;
        const list = plain(await fetch(uuid))?.system?.features;
        if (!Array.isArray(list)) continue;
        // The list before this update (kept from a try that stopped half-way).
        // Only this rework's own copy: an earlier rework (0.10.65) left its list behind, which is older than the sheet.
        const kept = flag(cls, "featuresBeforeFor") === CLASS_REWORK ? flag(cls, "featuresBefore") : null;
        const old = kept ?? cls.system.features ?? [];
        const level = Number(cls.system.levels) || 1;
        const reached = new Set(old.filter(f => (Number(f.level) || 1) <= level).map(f => f.uuid));
        const only = new Set(list.filter(f => (Number(f.level) || 1) <= level && !reached.has(f.uuid)).map(f => f.uuid));
        const merged = [...clone(list), ...old.filter(f => !list.some(x => x.uuid === f.uuid) && !DROPPED_FEATURES.has(f.uuid))];
        await cls.update({ "system.features": merged, [`flags.${SYS}.featuresBefore`]: clone(old), [`flags.${SYS}.featuresBeforeFor`]: CLASS_REWORK }, { arneyanMigration: true });
        const added = only.size ? await grant.cls(actor, cls, only) : [];
        if (added?.length) (notes.classAdded[actor.name] ??= []).push(...added);
        // Features already here that now come earlier take their new level.
        const at = new Map(list.map(f => [f.uuid, Number(f.level) || 1]));
        const lower = actor.items.filter(i => flag(i, "grantedBy") === cls.id && at.has(flag(i, "source")) && at.get(flag(i, "source")) < (Number(i.system?.level) || 1))
          .map(i => ({ _id: i.id, "system.level": at.get(flag(i, "source")) }));
        if (lower.length) await actor.updateEmbeddedDocuments("Item", lower, { arneyanMigration: true });
        const gone = actor.items.filter(i => flag(i, "grantedBy") === cls.id && DROPPED_FEATURES.has(flag(i, "source"))).map(i => i.name);
        if (gone.length) (notes.classGone[actor.name] ??= []).push(...gone);
        await cls.update({ [`flags.${SYS}.reworked`]: CLASS_REWORK }, { arneyanMigration: true });
      }
      for (const kit of actor.items.filter(i => i.type === "kit")) {
        if (flag(kit, "reworked") === CLASS_REWORK) continue;
        // Its levels before this update: kept on the kit while the update hasn't reached it yet (a retry), else the
        // snapshot taken before the main pass.
        const before = (flag(kit, "featureLevelsBeforeFor") === CLASS_REWORK ? flag(kit, "featureLevelsBefore") : null) ?? kitBefore.get(kit.uuid ?? `${actor.id}.${kit.id}`);
        const feats = kit.system?.features ?? [];
        const levels = feats.map(f => Number(f?.level) || 1);
        const ksrc = compendiumSourceOf(kit);
        const want = ksrc ? (plain(await fetch(ksrc))?.system?.features ?? []).map(f => Number(f?.level) || 1) : null;
        // The books didn't move this kit's features: nothing to do.
        if (!before || !want || JSON.stringify(want) === JSON.stringify(before)) continue;
        // The main pass hasn't given it the new levels yet (it failed, or the GM keeps the kit's own list): keep the
        // old levels on it and look again on the next try.
        if (JSON.stringify(levels) === JSON.stringify(before)) {
          if (flag(kit, "featureLevelsBeforeFor") !== CLASS_REWORK) await kit.update({ [`flags.${SYS}.featureLevelsBefore`]: before, [`flags.${SYS}.featureLevelsBeforeFor`]: CLASS_REWORK }, { arneyanMigration: true });
          continue;
        }
        const cls = classOf ? classOf(actor, kit) : null;
        if (cls) {
          const level = Number(cls.system?.levels) || 1;
          const only = new Set(feats.map((f, idx) => ((Number(f.level) || 1) <= level && (before[idx] ?? 99) > level ? `${kit.id}.${idx}` : null)).filter(Boolean));
          const added = only.size ? await grant.kit(actor, kit, only) : [];
          if (added?.length) (notes.classAdded[actor.name] ??= []).push(...added);
          const lower = actor.items.filter(i => flag(i, "grantedBy") === kit.id).map(i => {
            const idx = Number(String(flag(i, "source") ?? "").split(".").pop());
            const lv = Number(feats[idx]?.level) || 0;
            return lv && feats[idx]?.name === i.name && lv < (Number(i.system?.level) || 1) ? { _id: i.id, "system.level": lv } : null;
          }).filter(Boolean);
          if (lower.length) await actor.updateEmbeddedDocuments("Item", lower, { arneyanMigration: true });
        }
        await kit.update({ [`flags.${SYS}.reworked`]: CLASS_REWORK }, { arneyanMigration: true });
      }
    } catch (err) {
      console.warn(`Arneyan | class features: ${actor.name}`, err);
      if (!notes.failed.some(f => f.id === actor.id)) notes.failed.push({ id: actor.id, name: actor.name });
    }
  }
}

export async function runMigration({ force = false, legacy = null } = {}) {
  if (!game.users.activeGM?.isSelf) return null;
  const version = currentVersion();
  // Sheets an earlier run couldn't update (an error on one character) are tried again, this version's run or not.
  const retry = readRetry();
  const due = force || foundry.utils.isNewerVersion(version, game.settings.get(SYS, "migratedTo") || "0");
  if (!due && !retry) return null;
  const only = due ? null : { actors: new Set(retry.actors), items: retry.items };
  const cache = new Map();
  const fetch = async uuid => {
    if (!cache.has(uuid)) cache.set(uuid, await fromUuid(uuid).catch(() => null));
    return cache.get(uuid);
  };
  const notes = { kept: [], unstamped: 0, unstampedActors: new Set(), changed: [], automatic: {}, failed: [], scored: [], classAdded: {}, classGone: {} };
  const actorIds = new Set();
  const from = game.settings.get(SYS, "migratedTo") || "0";
  // 0.10.65: class features at the books' new levels (once, coming from an earlier version, or for a retried actor).
  const rework = (due && !newerThan(CLASS_REWORK, version) && newerThan(CLASS_REWORK, from)) || (!due && !!retry?.classes);
  const kitBefore = rework ? kitLevelsOf(only ? game.actors.filter(a => only.actors.has(a.id)) : game.actors) : new Map();
  // First everything that's safe: unedited items, and older items already the same as the compendium.
  const res = await pass(fetch, { legacy: legacy ?? "skip", notes, actorIds, version, only });
  let legacyDone = 0;
  if (notes.unstamped && legacy === null) {
    const choice = await askLegacy(notes.unstamped, notes.unstampedActors.size, version);
    if (choice === "update") {
      const second = { kept: [], unstamped: 0, unstampedActors: new Set(), changed: notes.changed, automatic: notes.automatic, failed: notes.failed, scored: notes.scored };
      const more = await pass(fetch, { legacy: "update", notes: second, actorIds, version, only });
      notes.failed = second.failed;
      res.items += more.items; res.world += more.world; res.actors = actorIds.size; legacyDone = notes.unstamped;
    }
  }
  if (rework) {
    const P = await import("./progression.mjs");
    const opts = { arneyanGrant: true };
    await classRework(only ? game.actors.filter(a => only.actors.has(a.id)) : game.actors, fetch,
      { cls: (actor, cls, ids) => P.syncClassFeatures(actor, cls, opts, { only: ids }), kit: (actor, kit, ids) => P.syncKitFeatures(actor, kit, opts, { only: ids }) },
      notes, { kitBefore, worldItems: only ? [] : (game.items?.contents ?? []), classOf: P.classForKit });
  }
  if (due) await game.settings.set(SYS, "migratedTo", version);
  // Tried again on the next loads, three times in all (then at the next version).
  const tries = due ? 1 : (Number(retry?.tries) || 1) + 1;
  const giveUp = notes.failed.length > 0 && tries >= 3;
  await writeRetry(notes.failed.length && !giveUp ? { version, actors: notes.failed.filter(f => f.id !== "items").map(f => f.id), items: notes.failed.some(f => f.id === "items"), tries, ...(rework ? { classes: true } : {}) } : null);
  const left = legacyDone ? 0 : (legacy === "update" ? 0 : notes.unstamped);
  const auto = Object.entries(notes.automatic);
  const scored = [...new Map(notes.scored.map(x => [x.id, x.name])).values()];
  const classAdded = Object.entries(notes.classAdded), classGone = Object.entries(notes.classGone);
  if (res.items || res.world || notes.kept.length || left || notes.failed.length || scored.length || classAdded.length || classGone.length) {
    const gms = game.users.filter(u => u.isGM).map(u => u.id);
    const extra = res.world ? ` and ${res.world} in the Items directory` : "";
    const keptList = notes.kept.slice(0, 40).map(k => `<li>${esc(k.label)} (${esc(k.fields.join(", "))})</li>`).join("") + (notes.kept.length > 40 ? `<li>and ${notes.kept.length - 40} more</li>` : "");
    const autoList = auto.slice(0, 40).map(([who, names]) => `<li><strong>${esc(who)}:</strong> ${esc([...new Set(names)].join(", "))}</li>`).join("") + (auto.length > 40 ? `<li>and ${auto.length - 40} more</li>` : "");
    const changed = [...new Set(notes.changed)];
    const any = res.items + res.world > 0;
    const head = any ? `${due ? "Updated" : "Tried again and updated"} ${res.items} item${res.items === 1 ? "" : "s"} on ${res.actors} actor${res.actors === 1 ? "" : "s"}${extra} from the compendiums.`
      : due ? "Nothing on your sheets was updated from the compendiums." : "Tried the update again.";
    const content = `<div class="arn-card"><p><strong>Arneyan ${esc(version)}:</strong> ${head}</p>`
      + (any ? `<p class="arn-card-meta">Rules, effects, uses, activities, saves, damage and areas now match the compendium, and descriptions take the new layout where their words are unchanged. Names, reworded descriptions and uses left stay. Tick "Keep my edits" on an item to stop updates changing it.</p>` : "")
      + (scored.length ? `<p><strong>Monsters given their scores</strong> (Monsters &amp; Treasure v0.10.5: attribute scores, saves worked out from them where yours were the book's old ones, and skills): ${esc(nameList(scored.length > 30 ? [...scored.slice(0, 30), `${scored.length - 30} more`] : scored))}.</p>` : "")
      + (classAdded.length ? `<p><strong>New class features</strong> (books v0.10.23: every class has its core features by 5th; books v0.10.27: the Knight's Command, the Bard's Performance and the Paladin's Channel Divinity pools, and other new features). Added:</p><ul>${classAdded.slice(0, 40).map(([who, names]) => `<li><strong>${esc(who)}:</strong> ${esc(nameList([...new Set(names)]))}</li>`).join("")}${classAdded.length > 40 ? `<li>and ${classAdded.length - 40} more</li>` : ""}</ul>` : "")
      + (classGone.length ? `<p><strong>No longer in the books</strong> (Battle Space (Improved) is now part of Battle Space; the Artificer's 11th-level Kit Feature is now the 5th-level one; books v0.10.27: Inspire, Embolden, Demoralise and Expert in Arms are Command options, Exalt, Discord, Rally, Exhort Greatness and Words of Power Performance options, Smite Evil, Turn Undead and Divine Intervention Channel Divinity options, Quick Reaction is Quick Reflexes, and the Wizard's Scribe's Insight, Perfect Recall, Counterspell and Signature Spells are gone). Delete them, or they count twice:</p><ul>${classGone.slice(0, 40).map(([who, names]) => `<li><strong>${esc(who)}:</strong> ${esc(nameList([...new Set(names)]))}</li>`).join("")}</ul>` : "")
      + (auto.length ? `<p><strong>Now automatic</strong> (if you added a bonus by hand for any of these, take it off, or it counts twice):</p><ul>${autoList}</ul>` : "")
      + (notes.kept.length ? `<p><strong>Your edits kept</strong> on ${notes.kept.length} item${notes.kept.length === 1 ? "" : "s"} (the compendium changed these too):</p><ul>${keptList}</ul><button type="button" class="arn-migrate-force"><i class="fa-solid fa-arrows-rotate"></i> Update these anyway</button>` : "")
      + (left ? `<p>${left} older item${left === 1 ? "" : "s"} left as ${left === 1 ? "it was" : "they were"}; you'll be asked again after the next update.</p>` : "")
      + (notes.failed.length ? `<p class="arn-bad"><strong>Couldn't update</strong> ${esc(nameList(notes.failed.map(f => f.name)))} (the browser console has the error). ${giveUp ? `After ${tries} tries ${notes.failed.length === 1 ? "it's" : "they're"} left until the next version.` : `${notes.failed.length === 1 ? "It's" : "They're"} tried again the next time the world loads.`}</p>` : "")
      + (changed.length || notes.kept.length ? `<p class="arn-card-meta">Each item an update changes keeps a copy of what it replaced.</p><button type="button" class="arn-migrate-putback"><i class="fa-solid fa-clock-rotate-left"></i> Put back what this update replaced</button>` : "")
      + `</div>`;
    await ChatMessage.create({ whisper: gms, speaker: { alias: "The Arneyan Codex" }, content, flags: { [SYS]: { migrateKept: notes.kept.map(k => k.uuid), migrateChanged: changed, migrateVersion: version } } });
  }
  return { items: res.items, actors: res.actors, world: res.world, scored: scored.length, kept: notes.kept.length, unstamped: left, automatic: auto.length, failed: notes.failed.length, changed: new Set(notes.changed).size };
}

const nameList = names => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
/** What an earlier run couldn't update: { version, actors: [ids], items: bool }, or null. */
function readRetry() {
  try {
    const r = game.settings.get(SYS, "migrateRetry");
    return r && (r.actors?.length || r.items) ? r : null;
  } catch { return null; }
}
async function writeRetry(v) {
  try { await game.settings.set(SYS, "migrateRetry", v ?? {}); } catch { /* not registered (tests) */ }
}

/** "Update these anyway": replace the listed items' mechanics from the compendium, edits or not. Returns how many. */
export async function forceUpdate(uuids = [], { changed = null, version = null } = {}) {
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
    const mine = { changed: [] };
    keepCopies(pool, ups, version ?? currentVersion(), mine);
    try {
      if (actor) await actor.updateEmbeddedDocuments("Item", ups, { arneyanForce: true, arneyanMigration: true });
      else await Item.updateDocuments(ups, { arneyanMigration: true });
    } catch (err) { console.warn(`Arneyan | update anyway: ${actor?.name ?? "Items directory"}`, err); continue; }
    changed?.push(...mine.changed);
    // Counted as the report counts: an item whose mechanics changed (not only its fingerprints).
    n += ups.filter(u => Object.keys(u).some(k => k.startsWith("system."))).length;
  }
  return n;
}

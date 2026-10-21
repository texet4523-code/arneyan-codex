/**
 * Import a character or NPC written in a chat (the "Arneyan import format", a JSON block): paste it, see what it
 * found in the compendiums and what it didn't, then fill the sheet. Nothing is guessed: a name that isn't found comes
 * in as a plain item carrying the text given, and the report lists it.
 *
 * Characters get real compendium items: classes at their levels with their features, the Kit and its features, the
 * ancestry with its subtype and traits, feats (with their attribute and weapon picks), skills, spells and gear. The
 * scores and HP given are the sheet's totals: whatever the items add is taken off the stored numbers, so the sheet
 * shows what the chat wrote. NPCs take a stat block (Level, HD, HP, AC, attacks, abilities), optionally starting from
 * a Bestiary monster.
 */
import { ARNEYAN } from "./config.mjs";
import { weaponKey } from "./effects.mjs";
import { syncClassFeatures, syncKitFeatures } from "./progression.mjs";
import { bestiarySource } from "./refresh.mjs";

const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ABILITY_KEYS = Object.keys(ARNEYAN.abilities);
// Options for items the import makes: no prompts, no setup steps, no skill-slot questions, levels and picks kept.
const QUIET = { arneyanGrant: true, arneyanNoChoice: true, arneyanKeepLevel: true, arneyanImport: true, arneyanSkipSetup: true };

/* -------------------------------------------- */
/*  Reading the text                            */
/* -------------------------------------------- */

/**
 * The import block as an object. Takes the JSON as a chat writes it: in a code fence or not, with text around it.
 * Throws an Error whose message says what's wrong, for the dialog.
 */
export function readImport(text) {
  let t = String(text ?? "").trim();
  if (!t) throw new Error("Paste the import block first.");
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("That isn't an import block: it should be one { ... } block (JSON), as the format describes.");
  let data;
  const raw = t.slice(a, b + 1);
  try {
    data = JSON.parse(raw);
  } catch (err) {
    // Typographic quotes from a chat window break JSON: straighten them and try again (only then, as quotes inside the
    // text are fine as they are).
    try { data = JSON.parse(raw.replace(/[“”]/g, '"')); } catch {
      throw new Error(`The block doesn't read as JSON (${err.message}). Ask the chat to give it again as one JSON block.`);
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The block should be one { ... } object.");
  if (!String(data.name ?? "").trim()) throw new Error("The block has no name.");
  data.type = importType(data);
  return data;
}

/** "character" or "npc": as the block says, else by what it has (classes make a character). */
export function importType(data) {
  const t = String(data?.type ?? "").toLowerCase().trim();
  if (["character", "pc", "player"].includes(t)) return "character";
  if (["npc", "monster", "creature"].includes(t)) return "npc";
  return data?.classes || data?.class ? "character" : "npc";
}

/* -------------------------------------------- */
/*  Finding names in the compendiums            */
/* -------------------------------------------- */

/** A name reduced for matching: lower case, straight apostrophes, no "+1", single spaces. */
export function norm(s) {
  return String(s ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/^\+\d+\s+|\s+\+\d+$/g, "").replace(/\s+/g, " ").trim().replace(/[ .]+$/, "");
}
const bare = s => s.replace(/\s*\([^)]*\)/g, "").trim();
const swap = s => s.replace(/^(.*), (.*)$/, "$2 $1");
const single = s => s.replace(/(?<=\w{3})(?:es|s)$/, "");

/** Name lookups in one compendium's index: exact, without brackets, "Long Sword" for "Sword, Long", singular. */
export class Finder {
  constructor(entries, pack) {
    this.pack = pack;
    this.entries = entries;
    this.by = new Map();
    const add = (k, e) => { if (!k) return; const l = this.by.get(k) ?? []; if (!l.includes(e)) l.push(e); this.by.set(k, l); };
    for (const e of entries) add(norm(e.name), e);  // exact names first
    for (const e of entries) {
      const n = norm(e.name), b = bare(n);
      for (const k of [swap(n), n.replace(/[()]/g, ""), b, swap(b), single(b)]) add(k, e);
      if (["weapon", "armour"].includes(e.type)) add(`w:${weaponKey(e.name)}`, e);
    }
  }

  /** Every entry a name could be. */
  candidates(name, { types = null } = {}) {
    const n = norm(name), b = bare(n);
    const keys = [n, swap(n), b, swap(b), single(b), single(n), `w:${weaponKey(name)}`];
    for (const k of keys) {
      const l = (this.by.get(k) ?? []).filter(e => !types || types.includes(e.type));
      if (l.length) return l;
    }
    return [];
  }

  /** The best entry for a name, or null. `prefer`: words to favour in the name ("Fighter" for a kit). */
  find(name, { types = null, prefer = [] } = {}) {
    const l = this.candidates(name, { types });
    if (l.length < 2) return l[0] ?? null;
    const want = prefer.map(p => norm(p)).filter(Boolean);
    return l.find(e => want.some(p => norm(e.name).includes(`(${p})`) || norm(e.name).includes(p))) ?? l[0];
  }
}

const finders = new Map();
/** The Finder for one of the system's compendiums (cached; cleared when the import ends). */
async function finder(pack) {
  if (finders.has(pack)) return finders.get(pack);
  const p = game.packs.get(`${SYS}.${pack}`);
  const index = p ? await p.getIndex({ fields: ["type", "system.className"] }) : [];
  const entries = [...index].filter(e => e.type !== "base").map(e => ({ ...e, uuid: e.uuid ?? `Compendium.${SYS}.${pack}.${p?.documentName ?? "Item"}.${e._id}` }));
  const f = new Finder(entries, pack);
  finders.set(pack, f);
  return f;
}

/* -------------------------------------------- */
/*  Reading the block's fields                  */
/* -------------------------------------------- */

// A list from an array, or a string split at semicolons and new lines (not commas: "Sword, Long" is one name). An
// object, such as scores under the same key, is no list.
const list = v => (Array.isArray(v) ? v : v == null || v === "" || typeof v === "object" ? [] : String(v).split(/\s*(?:;|\n)\s*/)).filter(x => x !== "" && x != null);
/** The weapon names a pick means, from "Greatsword", "Sword, Long; Bow, Short" or ["Greatsword", "Longbow"]. */
const weaponPicks = v => (Array.isArray(v) ? v : String(v ?? "").split(/\s*[;\/]\s*/)).map(s => String(s).trim()).filter(Boolean);
/** Comma lists for plain text fields (languages, senses). */
const words = v => (Array.isArray(v) ? v : String(v ?? "").split(/\s*,\s*/)).map(String).filter(Boolean);
const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Number(v) : d);
/** An attribute key from "str", "Strength" or "STR". */
export function abilityKey(v) {
  const s = norm(v);
  // "str", "Str", "Strength", "stre": a start of the name (so "Chakram" isn't Charisma).
  return s.length >= 3 ? ABILITY_KEYS.find(k => norm(ARNEYAN.abilities[k]).startsWith(s)) ?? "" : "";
}

/** Scores from { str: 18 }, { Strength: 18 } or "Str 18, Dex 14". */
export function readScores(v) {
  const out = {};
  if (typeof v === "string") for (const m of v.matchAll(/([A-Za-z]+)\s*:?\s*(\d+)/g)) { const k = abilityKey(m[1]); if (k) out[k] = Number(m[2]); }
  else if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, n] of Object.entries(v)) { const key = abilityKey(k); if (key && Number.isFinite(Number(n))) out[key] = Number(n); }
  for (const k of Object.keys(out)) out[k] = Math.clamp(Math.round(out[k]), 0, 30);
  return out;
}

/** Classes from [{ name, level }], "Fighter 3 / Rogue 2", or class + level. The first is the 1st-level class. */
export function readClasses(data) {
  const raw = data.classes ?? (data.class ? [{ name: data.class, level: data.level }] : []);
  const items = Array.isArray(raw) ? raw : String(raw).split(/\s*[\/,;]\s*/);
  return items.map(c => {
    if (typeof c === "string") { const m = c.match(/^(.*?)\s+(\d+)$/); return { name: (m ? m[1] : c).trim(), level: m ? Number(m[2]) : 1 }; }
    return { name: String(c?.name ?? "").trim(), level: Math.max(1, num(c?.level, 1)) };
  }).filter(c => c.name);
}

/** A list entry as { name, ...rest }: "Endurance (Master)" or { name: "Endurance", tier: "master" }. */
export function entry(v, bracket) {
  if (v && typeof v === "object") return { ...v, name: String(v.name ?? "").trim() };
  let s = String(v ?? "").trim();
  const out = {};
  // "Arrows x20" or "Rations × 5": a quantity.
  const q = s.match(/\s[x×]\s*(\d+)$/i);
  if (q) { out.qty = Number(q[1]); s = s.slice(0, q.index).trim(); }
  // "Endurance (Master)": the bracket says something about it (only where the caller names what).
  const b = bracket ? s.match(/^(.*?)\s*\(([^)]*)\)$/) : null;
  if (b) { out.name = b[1].trim(); out[bracket] = b[2].trim(); }
  else out.name = s;
  return out;
}

/**
 * An entry whose bracket may be part of the name ("Animate Dead (Greater)") or say something about it ("Swimming
 * (Master)"): the whole name is tried in the compendium first, and only split when that misses. `ok(bracket)`: whether
 * the bracket can be what the caller means (a class name for a spell).
 */
function entryIn(v, bracket, finder, types, ok = () => true) {
  const whole = entry(v);
  if (typeof v === "object" && v) return whole;
  const e = finder.find(whole.name, { types });
  if (e && norm(e.name) === norm(whole.name)) return whole;
  const split = entry(v, bracket);
  if (split[bracket] !== undefined && !ok(split[bracket])) return whole;
  return split;
}

/** Plain text (a chat's paragraphs, **bold** and *italic*) as the HTML a sheet shows. */
export function textHtml(t) {
  const s = String(t ?? "").trim();
  if (!s) return "";
  if (/^<\w/.test(s)) return s;
  return s.split(/\n\s*\n/).map(p => `<p>${esc(p.trim()).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/\n/g, "<br>")}</p>`).join("");
}

/* -------------------------------------------- */
/*  The plan                                    */
/* -------------------------------------------- */

/**
 * What an import will do, worked out before anything changes: the compendium entries it found (with what to set on
 * each), the plain items it will make for names it didn't find, and lines for the report.
 */
export async function planImport(data, { find = finder } = {}) {
  const plan = { type: data.type, name: String(data.name).trim(), found: [], made: [], missing: [], notes: [], data };
  const hit = (pack, e, extra = {}) => plan.found.push({ pack, uuid: e.uuid, name: e.name, type: e.type, ...extra });
  const miss = (what, name, item) => { plan.missing.push(`${what}: ${name}`); if (item) plan.made.push(item); };

  if (plan.type === "character") {
    const classes = readClasses(data);
    if (!classes.length) plan.notes.push("No class given: the sheet gets none.");
    const clsF = await find("classes");
    for (const [i, c] of classes.entries()) {
      const e = clsF.find(c.name, { types: ["class"] });
      if (e) hit("classes", e, { level: c.level, order: i });
      else miss("Class", c.name);
    }
    const classNames = classes.map(c => c.name);
    if (data.ancestry) {
      const ancF = await find("ancestries");
      const a = entryIn(data.ancestry, "choice", ancF, ["ancestry"]);
      const e = ancF.find(a.name, { types: ["ancestry"] });
      if (e) hit("ancestries", e, { choice: String(data.ancestryChoice ?? data.subtype ?? a.choice ?? "").trim(), family: String(data.family ?? "").trim() });
      else miss("Ancestry", a.name);
    }
    if (data.kit) {
      const kitName = entry(data.kit).name;
      const all = (await find("kits")).candidates(kitName, { types: ["kit"] });
      // The Kit's class against the classes found ("Cleric (Battle Priest)" takes a Cleric Kit), as classForKit does.
      const have = plan.found.filter(x => x.pack === "classes").map(x => norm(x.name));
      const kitClass = e => norm(e.system?.className || (e.name.match(/\(([^)]*)\)$/)?.[1] ?? ""));
      const mine = all.filter(e => kitClass(e) && have.some(c => c === kitClass(e) || c.startsWith(`${kitClass(e)} `) || bare(c) === kitClass(e)));
      if (mine.length) hit("kits", mine[0]);
      else if (all.length) plan.notes.push(`Kit ${kitName} not added: it's a Kit for ${[...new Set(all.map(e => e.system?.className || e.name))].join(", ")}, not this character's class.`);
      else miss("Kit", kitName);
    }
    const featF = await find("feats");
    // Feats; a class or Kit feature written here (Weapon Specialisation (Greatsword)) is a pick for that feature.
    const cfF = await find("class-features");
    plan.picks = [];
    for (const v of list(data.feats)) {
      const f = entryIn(v, "pick", featF, ["feat"]);
      const pick = { pick: f.choice ?? f.pick ?? "", moved: f.moved ?? "", weapons: weaponPicks(f.weapons ?? f.weapon ?? "") };
      const e = featF.find(f.name, { types: ["feat"] });
      if (e) hit("feats", e, pick);
      // A bracket that isn't an attribute names the weapon ("Weapon Specialisation (Greatsword)").
      else if (cfF.find(f.name)) plan.picks.push({ name: f.name, ...pick, ...(pick.pick && !abilityKey(pick.pick) && !pick.weapons.length ? { pick: "", weapons: weaponPicks(pick.pick) } : {}) });
      else miss("Feat", f.name, { name: f.name, type: "feat", system: { description: textHtml(f.text ?? f.note ?? "") } });
    }
    // Picks for class and Kit features: { "Weapon Specialisation": ["Greatsword"], "Attribute Bonus": "str" }.
    if (data.picks && typeof data.picks === "object" && !Array.isArray(data.picks)) {
      for (const [name, v] of Object.entries(data.picks)) {
        const isAbility = !Array.isArray(v) && abilityKey(v);
        plan.picks.push({ name, pick: isAbility ? v : "", moved: "", weapons: isAbility ? [] : weaponPicks(v) });
      }
    }
    const skillF = await find("skills");
    for (const v of list(data.skills)) {
      const s = entryIn(v, "tier", skillF, ["skill"], b => Object.keys(ARNEYAN.skillTiers).some(t => norm(b).startsWith(t.slice(0, 4))));
      const tier = Object.keys(ARNEYAN.skillTiers).find(t => norm(s.tier ?? "trained").startsWith(t.slice(0, 4))) ?? "trained";
      const e = skillF.find(s.name, { types: ["skill"] });
      if (e) hit("skills", e, { tier });
      else miss("Skill", s.name, { name: s.name, type: "skill", system: { tier, ability: abilityKey(s.ability) || "int" } });
    }
  } else {
    if (data.base) {
      const e = (await find("monsters")).find(String(data.base));
      if (e) plan.base = { uuid: e.uuid, name: e.name };
      else plan.missing.push(`Bestiary monster: ${data.base} (the stat block given is used on its own)`);
    }
    const eqF = await find("equipment");
    for (const v of list(data.attacks)) {
      const a = entry(v);
      const e = eqF.find(a.name, { types: ["weapon"] });
      plan.attacks ??= [];
      plan.attacks.push({ ...a, uuid: e?.uuid ?? null, matched: e?.name ?? "" });
    }
    if (data.spellcasting) {
      const sc = typeof data.spellcasting === "string" ? entry(data.spellcasting) : data.spellcasting;
      const m = String(sc.name ?? sc.class ?? "").match(/^(.*?)\s+(\d+)$/);
      plan.spellcasting = { className: (m ? m[1] : sc.class ?? sc.name ?? "").trim(), level: num(sc.level, m ? Number(m[2]) : 0),
        ...(Array.isArray(sc.slots) ? { slots: sc.slots.map(n => Math.max(0, Math.round(num(n)))) } : {}) };
    }
  }

  // Both: spells, gear, extra abilities.
  const spellF = await find("spells");
  const classNames = (await find("classes")).entries.map(e => norm(e.name));
  for (const v of list(data.spells)) {
    const s = entryIn(v, "className", spellF, ["spell"], b => classNames.includes(norm(b)));
    const e = spellF.find(s.name, { types: ["spell"] });
    if (e) hit("spells", e, { className: s.class ?? s.className ?? "", prepared: !!s.prepared });
    else miss("Spell", s.name, { name: s.name, type: "ability", system: { kind: "other", description: textHtml(s.text ?? "A spell the import didn't find in the compendium.") } });
  }
  const eqF = await find("equipment");
  const gear = [...list(data.weapons), ...list(data.armour ?? data.armor), ...list(data.gear ?? data.equipment ?? data.inventory)];
  for (const v of gear) {
    const g = entry(v);
    const magic = num(g.magic, num(String(g.name).match(/^\+(\d+)\s|\s\+(\d+)$/)?.slice(1).find(Boolean), 0));
    const e = eqF.find(g.name);
    const opts = { qty: Math.max(0, Math.round(num(g.qty ?? g.quantity, 1))), equipped: g.equipped, magic, label: g.name !== e?.name && magic ? g.name : "" };
    if (e) hit("equipment", e, opts);
    else miss("Gear", g.name, { name: g.name, type: "equipment", system: { quantity: opts.qty, description: textHtml(g.notes ?? g.note ?? g.text ?? "") } });
  }
  for (const v of list(data.abilities ?? data.traits ?? data.features)) {
    const a = entry(v);
    if (!a.name) continue;
    plan.made.push({ name: a.name, type: "ability", system: { kind: plan.type === "npc" ? "monster" : "other", description: textHtml(a.text ?? a.description ?? ""),
      ...(a.uses ? { uses: { value: Math.max(0, Math.round(num(a.uses))), max: Math.max(0, Math.round(num(a.uses))), per: usesPer(a.per) } } : {}) } });
  }
  return plan;
}

/** "Per day", "1/day", "daily", "long rest" as one of the sheet's uses periods (day if it can't tell). */
export function usesPer(v) {
  const s = norm(v ?? "day");
  if (s in ARNEYAN.usesPer) return s;
  if (/at will|unlimited/.test(s)) return "";
  for (const [k, words] of [["encounter", ["encounter", "fight", "combat"]], ["rest", ["long rest", "rest"]], ["week", ["week"]], ["session", ["session"]], ["month", ["month"]], ["day", ["day", "daily"]]]) {
    if (words.some(w => s.includes(w))) return k;
  }
  return "day";
}

/** The report lines for a plan, as HTML. */
export function planHtml(plan, actor = null) {
  const by = t => plan.found.filter(f => f.type === t || f.pack === t);
  const names = l => l.map(f => esc(f.name + (f.level ? ` ${f.level}` : "") + (f.qty > 1 ? ` × ${f.qty}` : ""))).join(", ");
  const rows = [
    ["Classes", by("classes")], ["Ancestry", by("ancestries")], ["Kit", by("kits")], ["Feats", by("feats")], ["Skills", by("skills")],
    ["Spells", by("spells")], ["Gear", by("equipment")]
  ].filter(([, l]) => l.length).map(([label, l]) => `<li><strong>${label}:</strong> ${names(l)}</li>`);
  if (plan.base) rows.unshift(`<li><strong>Starts from:</strong> ${esc(plan.base.name)} (Bestiary)</li>`);
  if (plan.picks?.length) rows.push(`<li><strong>Picks for features:</strong> ${plan.picks.map(p => esc(`${p.name}: ${[p.pick, ...p.weapons].filter(Boolean).join(", ")}`)).join("; ")}</li>`);
  if (plan.attacks?.length) rows.push(`<li><strong>Attacks:</strong> ${plan.attacks.map(a => esc(a.name)).join(", ")}</li>`);
  const own = plan.made.filter(m => !plan.missing.some(x => x.endsWith(`: ${m.name}`)));
  if (own.length) rows.push(`<li><strong>Abilities:</strong> ${own.map(m => esc(m.name)).join(", ")}</li>`);
  return `<p><strong>${esc(plan.name)}</strong>, ${plan.type === "character" ? "a character" : "an NPC"}${actor ? `, onto ${esc(actor.name)}'s sheet` : ""}.</p>
    <p class="arn-import-ok"><i class="fa-solid fa-check"></i> Found in the compendiums:</p><ul>${rows.join("") || "<li>Nothing</li>"}</ul>
    ${plan.missing.length ? `<p class="arn-import-miss"><i class="fa-solid fa-triangle-exclamation"></i> Not found (added as plain items with the text given, so nothing is lost):</p><ul>${plan.missing.map(m => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
    ${plan.notes.length ? `<p class="arn-muted">${plan.notes.map(esc).join(" ")}</p>` : ""}`;
}

/* -------------------------------------------- */
/*  Filling the sheet                           */
/* -------------------------------------------- */

/** A compendium document's data, ready to put on an actor (no id, no folder). */
async function dataFrom(uuid) {
  const doc = await fromUuid(uuid);
  if (!doc) return null;
  const d = doc.toObject();
  delete d._id;
  delete d.folder;
  delete d.sort;
  foundry.utils.setProperty(d, "_stats.compendiumSource", uuid);
  return d;
}

/** The subtype (or bloodline, caste, lineage) of an ancestry a name means: exact, a prefix, or the bit in brackets. */
export function ancestryOption(anc, name) {
  const opts = anc?.system?.choice?.options ?? [];
  const n = norm(name);
  if (!n) return -1;
  let i = opts.findIndex(o => norm(o.name) === n);
  if (i < 0) i = opts.findIndex(o => norm(o.name).startsWith(n) || bare(norm(o.name)) === n || (norm(o.name).match(/\(([^)]*)\)/)?.[1] ?? "") === n);
  if (i < 0) i = opts.findIndex(o => norm(o.name).includes(n));
  return i;
}

/** An ancestry's traits and subtype as features (as the ancestry window gives them), without asking anything. */
async function ancestryGrants(actor, anc, { choice = "", family = "" } = {}) {
  const s = anc.system;
  const baseName = anc.name.replace(/\s*\(.*\)$/, "");
  const idx = ancestryOption(anc, choice);
  const o = idx >= 0 ? s.choice.options[idx] : null;
  const short = o ? o.name.replace(/\s*\(.*\)$/, "") : "";
  const label = short ? `${baseName} (${short})` : baseName;
  const grant = (name, text, rules = []) => ({
    name, type: "ability", img: anc.img,
    system: { description: `<p>${esc(text)}</p>`, kind: "ancestry", level: 1, className: label, rules },
    flags: { [SYS]: { grantedBy: anc.id, source: `${anc.id}.${name}` } }
  });
  const create = (s.traitList ?? []).filter(t => !(family && t.name === "Family")).map(t => grant(t.name, t.text));
  if (o) create.unshift(grant(`${s.choice.label}: ${o.name}`, o.text, (o.rules ?? []).map(r => ({ ...r, label: r.label || short }))));
  if (family && s.family) create.unshift(grant(`Family: ${family}`, `Born into a ${family} family: you speak its language, and its people treat you as one of their own once they look past the marks.`));
  if (create.length) await actor.createEmbeddedDocuments("Item", create, QUIET);
  await anc.update({ name: label, [`flags.${SYS}.ancestry`]: { choice: o?.name ?? "", family: s.family ? family : "", applied: {}, moved: {} } }, QUIET);
  await actor.update({ "system.attributes.speed": s.speed, "system.details.size": s.size, "system.details.senses": s.vision ?? "", [`flags.${SYS}.hadAncestry`]: true });
  return choice && !o ? `${s.choice?.label ?? "Subtype"} "${choice}" isn't one of ${baseName}'s: none set.` : "";
}


/** Flags of the system's that belong to what was on the sheet, cleared when an import replaces it. */
const SHEET_FLAGS = ["subdual", "firearmsTrained", "scoresRolled", "needsScores", "startingGold", "startingGear", "hadAncestry", "downtime", "luckDeed", "pactSlain", "hunger", "travel", "importedFrom"];

/** Take everything off a sheet: items, effects on the actor, its numbers and details (back to a new sheet's). */
async function clearSheet(actor) {
  if (actor.items.size) await actor.deleteEmbeddedDocuments("Item", actor.items.map(i => i.id), QUIET);
  if (actor.effects.size) await actor.deleteEmbeddedDocuments("ActiveEffect", actor.effects.map(e => e.id), QUIET);
  const initial = actor.system.constructor.schema.getInitialValue?.() ?? null;
  const flags = Object.fromEntries(SHEET_FLAGS.filter(k => actor.flags?.[SYS]?.[k] !== undefined).map(k => [`flags.${SYS}.-=${k}`, null]));
  // The system data as a whole (not merged into what's there), then the flags on their own.
  if (initial) await actor.update({ system: initial }, { diff: false, recursive: false, ...QUIET });
  if (Object.keys(flags).length) await actor.update(flags, QUIET);
}

/** Fill an actor from a plan. `replace`: take everything off the sheet first. Returns the lines for the chat card. */
export async function applyImport(actor, plan, { replace = true } = {}) {
  const data = plan.data;
  const notes = [];
  if (replace) await clearSheet(actor);
  const create = async list => (list.length ? actor.createEmbeddedDocuments("Item", list, QUIET) : []);
  const itemsFor = async kind => {
    const out = [];
    for (const f of plan.found.filter(f => f.pack === kind)) {
      const d = await dataFrom(f.uuid);
      if (!d) { notes.push(`${f.name} couldn't be read from the compendium.`); continue; }
      out.push({ f, d });
    }
    return out;
  };

  if (plan.type === "character") {
    // Classes first (their levels make the character's level), then their features.
    const classes = (await itemsFor("classes")).sort((a, b) => a.f.order - b.f.order);
    for (const { f, d } of classes) {
      foundry.utils.mergeObject(d, { system: { levels: f.level, hpRolls: [], luckGains: [], slotsUsed: [], extraSlots: [] } });
      const [cls] = await create([d]);
      if (cls) await syncClassFeatures(actor, cls, QUIET);
    }
    for (const { f, d } of await itemsFor("ancestries")) {
      const [anc] = await create([d]);
      if (anc) {
        const n = await ancestryGrants(actor, anc, f);
        if (n) notes.push(n);
        else if (anc.system.choice?.options?.length && !f.choice) notes.push(`No ${String(anc.system.choice.label ?? "subtype").toLowerCase()} given for ${anc.name}: none set.`);
      }
    }
    for (const { d } of await itemsFor("kits")) {
      const [kit] = await create([d]);
      if (kit) await syncKitFeatures(actor, kit, QUIET);
    }
    const level = actor.system.level || 1;
    const feats = (await itemsFor("feats")).map(({ f, d }) => {
      const ch = d.system.abilityChoice;
      if (ch?.options?.length) {
        const k = abilityKey(f.pick);
        if (k && ch.options.includes(k)) ch.value = k;

      }
      const moved = abilityKey(f.moved);
      if (moved) foundry.utils.setProperty(d, "system.abilityChoice.moved", moved);
      if (String(d.system.weaponChoice?.max ?? "").trim()) {
        const w = weaponPicks(f.weapons?.length ? f.weapons : f.pick);
        if (w.length) d.system.weaponChoice.value = w;
      }
      d.system.levelTaken = num(f.levelTaken, level);
      return d;
    });
    await create(feats);
    await create((await itemsFor("skills")).map(({ f, d }) => { d.system.tier = f.tier; return d; }));
    // Picks for class and Kit features (Weapon Specialisation's weapon, the Attribute Bonus).
    for (const p of plan.picks ?? []) {
      if (!p.pick && !p.moved && !p.weapons.length) continue;
      const it = actor.items.find(i => ["ability", "feat"].includes(i.type) && norm(i.name) === norm(p.name)) ?? actor.items.find(i => i.type === "ability" && bare(norm(i.name)) === bare(norm(p.name)));
      if (!it) { notes.push(`${p.name}: not on the character at these levels, so its pick wasn't set.`); continue; }
      const upd = {};
      const k = abilityKey(p.pick);
      if (k && it.system.abilityChoice?.options?.includes(k)) upd["system.abilityChoice.value"] = k;
      if (abilityKey(p.moved)) upd["system.abilityChoice.moved"] = abilityKey(p.moved);
      const w = p.weapons.length ? p.weapons : (!k && p.pick ? weaponPicks(p.pick) : []);
      if (w.length && String(it.system.weaponChoice?.max ?? "").trim()) upd["system.weaponChoice.value"] = w;
      if (Object.keys(upd).length) await it.update(upd, QUIET);
      else notes.push(`${p.name}: nothing it could take from "${[p.pick, ...p.weapons].filter(Boolean).join(", ")}".`);
    }
    for (const i of actor.items) {
      if (i.system.needsChoice) notes.push(`${i.name}: no attribute picked yet; choose it on the sheet.`);
      if (i.system.needsWeapon) notes.push(`${i.name}: no weapon picked yet; choose it on the sheet.`);
    }
  } else {
    await importNpcStats(actor, plan, notes);
  }

  // Spells, gear and plain items (both kinds).
  await create((await itemsFor("spells")).map(({ f, d }) => {
    if (f.className) d.system.className = f.className;
    else if (actor.type === "character") {
      const caster = actor.items.find(i => i.type === "class" && i.system.castingAbility && (d.system.classes ?? []).some(l => i.name === l || i.name.startsWith(`${l} `)));
      if (caster) d.system.className = caster.name;
    }
    if (f.prepared) d.system.prepared = true;
    return d;
  }));
  await create((await itemsFor("equipment")).map(({ f, d }) => {
    if ("quantity" in d.system) d.system.quantity = f.qty;
    if (["weapon", "armour"].includes(d.type)) d.system.equipped = f.equipped ?? true;
    if (f.magic && "magic" in d.system) d.system.magic = f.magic;
    if (f.label) d.name = f.label;
    return d;
  }));
  await create(plan.made.map(m => ({ img: { feat: "icons/svg/upgrade.svg", skill: "icons/svg/book.svg", equipment: "icons/svg/item-bag.svg" }[m.type] ?? "icons/svg/aura.svg", ...m })));

  if (actor.type === "character") await importCharacterStats(actor, data, notes);
  // Uses worked out from a formula (Flèche: Dexterity modifier a day) start full, on the scores just set.
  const full = actor.items.filter(i => i.system?.uses?.formula && i.system.uses.max > 0 && i.system.uses.value !== i.system.uses.max)
    .map(i => ({ _id: i.id, "system.uses.value": i.system.uses.max }));
  if (full.length) await actor.updateEmbeddedDocuments("Item", full, QUIET);
  return notes;
}

/** A character's details, coins, Luck and XP, then scores and HP set so the sheet's totals are the ones given. */
async function importCharacterStats(actor, data, notes) {
  const upd = { name: String(data.name).trim() };
  const d = "system.details";
  if (data.alignment != null) upd[`${d}.alignment`] = String(data.alignment);
  if (data.deity != null) upd[`${d}.deity`] = String(data.deity);
  if (data.age != null) upd[`${d}.age`] = String(data.age);
  if (data.languages != null) upd[`${d}.languages`] = words(data.languages).join(", ");
  const bio = [data.biography ?? data.description, data.personality, data.notes].filter(Boolean).map(textHtml).join("");
  if (bio) upd[`${d}.biography`] = bio;
  if (data.background ?? data.backgroundStory) upd[`${d}.backgroundStory`] = textHtml(data.background ?? data.backgroundStory);
  const coins = data.coins ?? data.currency;
  if (coins && typeof coins === "object") for (const k of ["pp", "gp", "sp", "cp"]) if (coins[k] != null) upd[`system.currency.${k}`] = Math.max(0, num(coins[k]));
  if (data.luck != null) {
    const l = typeof data.luck === "object" ? data.luck : { value: data.luck };
    upd["system.luck.value"] = Math.clamp(Math.round(num(l.value, 10)), 0, 20);
    upd["system.luck.start"] = Math.clamp(Math.round(num(l.start, num(l.value, 10))), 0, 20);
  }
  if (data.xp != null) upd["system.attributes.xp"] = Math.max(0, Math.round(num(data.xp)));
  const scores = readScores(data.scores ?? data.attributes ?? data.abilities);
  for (const [k, v] of Object.entries(scores)) upd[`system.abilities.${k}.value`] = v;
  await actor.update(upd);
  // The scores given are the totals: take off what feats and features add (Toughness's +1 Con), so the sheet agrees.
  const fix = {};
  for (const [k, v] of Object.entries(scores)) {
    const a = actor.system.abilities[k];
    const diff = (a.total ?? a.value) - v;
    if (diff) fix[`system.abilities.${k}.value`] = Math.max(0, a.value - diff);
  }
  // HP: the maximum given is the sheet's; the rest (value) defaults to full.
  const hp = typeof data.hp === "object" && data.hp ? data.hp : { max: data.hp ?? data.hpMax };
  if (Object.keys(fix).length) await actor.update(fix);
  if (hp.max != null) {
    // What the sheet shows is the stored maximum plus rules (Toughness), possibly scaled: two passes settle it.
    for (let pass = 0; pass < 2; pass++) {
      const shown = actor.system.attributes.hp.max;
      if (shown === num(hp.max)) break;
      const src = actor._source.system.attributes.hp.max;
      await actor.update({ "system.attributes.hp.max": Math.max(0, src + num(hp.max) - shown) });
    }
    if (actor.system.attributes.hp.max !== num(hp.max)) notes.push(`Maximum HP comes out at ${actor.system.attributes.hp.max} (given ${num(hp.max)}).`);
    await actor.update({ "system.attributes.hp.value": Math.round(num(hp.value, actor.system.attributes.hp.max)) });
  } else {
    notes.push("No HP given: set the maximum on the sheet (edit mode).");
  }
  const off = Object.entries(scores).filter(([k, v]) => (actor.system.abilities[k].total ?? actor.system.abilities[k].value) !== v);
  if (off.length) notes.push(`Scores that don't come out as given: ${off.map(([k, v]) => `${ARNEYAN.abilities[k]} ${actor.system.abilities[k].total} (given ${v})`).join(", ")}.`);
}

/** A range that means a ranged attack: "60ft", "30/120", "range 80 ft" (not "melee", "reach 10ft" or "5ft"). */
export function isRanged(range) {
  const r = String(range ?? "").toLowerCase();
  if (/melee|reach|touch/.test(r)) return false;
  if (r.includes("/")) return true;
  const ft = Number(r.match(/(\d+)\s*(?:ft|feet|')/)?.[1] ?? r.match(/(\d+)/)?.[1] ?? 0);
  return ft > 10;
}

/** A class's spell slots at a level (the class's own table), for "casts as a 5th-level cleric". */
async function slotsFor(className, level) {
  try {
    const e = (await finder("classes")).find(className, { types: ["class"] });
    const cls = e ? await fromUuid(e.uuid) : null;
    const row = cls?.system?.slotTable?.[Math.clamp(Math.round(level) || 1, 1, 24) - 1];
    return Array.isArray(row) ? [...row] : [];
  } catch { return []; }
}

/** Which Bestiary entry the sheet comes from (what "Update from the Bestiary" uses). Never stops the import. */
async function setBestiarySource(actor, uuid) {
  await actor.update({ "_stats.compendiumSource": uuid, "flags.core.-=sourceId": null }).catch(err => console.warn("Arneyan | import source", err));
}

/** An NPC's stat block (on top of a Bestiary monster if the block names one) and its attacks. */
async function importNpcStats(actor, plan, notes) {
  const data = plan.data;
  if (plan.base) {
    const base = await fromUuid(plan.base.uuid);
    if (base) {
      const src = base.toObject();
      // The sheet now comes from this Bestiary entry: "Update from the Bestiary" goes back to it, not to an older one.
      await actor.update({ system: src.system, img: src.img, prototypeToken: { texture: src.prototypeToken?.texture ?? {} }, [`flags.${SYS}.importedFrom`]: plan.base.uuid });
      // Its items keep their ids (the sheet is empty), so anything inside a container stays inside it.
      await actor.createEmbeddedDocuments("Item", src.items, { ...QUIET, keepId: !actor.isToken });
    }
  }
  // An imported stat block is its own: "Update from the Bestiary" (one sheet or all) must never put the plain
  // monster back over it. The monster it started from is kept in flags.arneyan.importedFrom.
  if (bestiarySource(actor)) await setBestiarySource(actor, null);
  const s = "system";
  const upd = { name: String(data.name).trim() };
  const lvl = String(data.level ?? "").trim();
  if (lvl) {
    const frac = { "¼": 0.25, "1/4": 0.25, "½": 0.5, "1/2": 0.5 }[lvl];
    upd[`${s}.level`] = frac ? 0 : Math.max(0, Math.round(num(lvl, 1)));
    upd[`${s}.details.levelText`] = frac || !/^\d+$/.test(lvl) ? lvl : "";
  }
  if (data.hd != null) upd[`${s}.hd`] = String(data.hd);
  const hp = typeof data.hp === "object" && data.hp ? data.hp : { max: data.hp };
  if (hp.max != null) { upd[`${s}.attributes.hp.max`] = num(hp.max, 1); upd[`${s}.attributes.hp.value`] = num(hp.value, num(hp.max, 1)); }
  if (data.ac != null) upd[`${s}.attributes.ac`] = num(data.ac, 10);
  if ((data.move ?? data.speed) != null) upd[`${s}.attributes.speed`] = String(data.move ?? data.speed);
  if (data.attack != null) upd[`${s}.attributes.attack`] = num(data.attack);
  if (data.morale != null) upd[`${s}.attributes.morale`] = num(data.morale);
  if (data.spellDC != null) upd[`${s}.attributes.spellDC`] = num(data.spellDC);
  const saves = data.saves && typeof data.saves === "object" ? data.saves : {};
  for (const [k, v] of Object.entries(saves)) {
    const key = { fortitude: "fort", reflex: "ref", will: "will" }[norm(k)] ?? norm(k).slice(0, 4);
    if (["fort", "ref", "will"].includes(key)) upd[`${s}.saves.${key}`] = num(v);
  }
  const det = `${s}.details`;
  const size = norm(data.size);
  if (size && size in ARNEYAN.sizes) upd[`${det}.size`] = size;
  for (const [from, to] of [["creature", "type"], ["creatureType", "type"], ["alignment", "alignment"], ["xp", "xp"], ["numberAppearing", "numberAppearing"],
    ["senses", "senses"], ["resistances", "resistances"], ["immunities", "immunities"], ["vulnerabilities", "vulnerabilities"]]) {
    if (data[from] != null) upd[`${det}.${to}`] = words(data[from]).join(", ");
  }
  if (data.solo != null) upd[`${det}.isSolo`] = !!data.solo;
  const desc = [data.description ?? data.biography, data.notes].filter(Boolean).map(textHtml).join("");
  if (desc) upd[`${det}.description`] = desc;
  if (data.treasure) upd[`${det}.treasure`] = textHtml(data.treasure);
  const scores = readScores(data.scores ?? data.abilities_scores ?? data.attributesScores ?? (typeof data.attributes === "object" ? data.attributes : null));
  for (const [k, v] of Object.entries(scores)) upd[`${s}.abilities.${k}.value`] = v;
  if (plan.spellcasting?.className) {
    upd[`${s}.spellcasting.className`] = plan.spellcasting.className;
    upd[`${s}.spellcasting.level`] = plan.spellcasting.level;
    upd[`${s}.spellcasting.slots`] = plan.spellcasting.slots ?? await slotsFor(plan.spellcasting.className, plan.spellcasting.level);
    upd[`${s}.spellcasting.used`] = [];
    if (!upd[`${s}.spellcasting.slots`].length) notes.push(`No spell slots found for ${plan.spellcasting.className} at level ${plan.spellcasting.level}: set them on the sheet.`);
  }
  await actor.update(upd);

  // Attacks: the Catalogue's weapon where the name is one (its traits and picture), with the stat block's numbers.
  const attacks = [];
  for (const a of plan.attacks ?? []) {
    const d = a.uuid ? await dataFrom(a.uuid) : { name: a.name, type: "weapon", img: "icons/svg/sword.svg", system: {} };
    if (!d) continue;
    d.name = a.name;
    const dmg = String(a.damage ?? "").trim();
    const type = norm(a.damageType ?? a.type ?? (dmg.match(/\b([a-z]+)$/i)?.[1] ?? ""));
    Object.assign(d.system, {
      equipped: true, slots: 0, quantity: 1,
      ...(dmg ? { damage: dmg.replace(/\s+[a-z]+$/i, "").trim() } : {}),
      ...(type && type in ARNEYAN.damageTypes ? { damageType: type } : {}),
      ...(a.range ? { range: String(a.range), ranged: isRanged(a.range) } : {}),
      ...(a.ranged != null ? { ranged: !!a.ranged } : {}),
      attackBonus: a.bonus != null ? num(a.bonus) - (actor.system.attributes.attack ?? 0) : (d.system.attackBonus ?? 0),
      ...(a.notes ?? a.text ? { description: textHtml(a.notes ?? a.text) } : {})
    });
    attacks.push(d);
  }
  if (attacks.length) await actor.createEmbeddedDocuments("Item", attacks, QUIET);
}

/* -------------------------------------------- */
/*  The dialog                                  */
/* -------------------------------------------- */

/**
 * Import onto an actor's sheet, or (no actor) make a new actor from the block. Asks for the block, shows what it
 * found, then imports. Returns the actor, or null if nothing was done.
 */
export async function importDialog(actor = null) {
  const { DialogV2 } = foundry.applications.api;
  // The GM's: an import skips the skill slots, the scores window and the other checks a player goes through.
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can import characters and NPCs."), null;
  let text = "";
  try {
    for (;;) {
      const got = await DialogV2.wait({
        window: { title: actor ? `Import onto ${actor.name}` : "Import a character or NPC", icon: "fa-solid fa-file-import" }, classes: ["arneyan", "arn-import"],
        position: { width: 560 },
        content: `<p>Paste the import block a chat wrote for you (the Arneyan import format: one JSON block). The next step shows what it found before anything changes.</p>
          <textarea name="block" rows="16" style="width:100%;font-family:monospace" placeholder='{ "type": "character", "name": "...", ... }'>${esc(text)}</textarea>`,
        buttons: [{ action: "read", label: "Read it", icon: "fa-solid fa-magnifying-glass", default: true, callback: (ev, btn) => btn.form.elements.block.value }, { action: "cancel", label: "Cancel" }],
        rejectClose: false
      });
      if (typeof got !== "string") return null;
      text = got;
      let data, plan;
      try {
        data = readImport(text);
        if (actor && data.type !== actor.type) throw new Error(`That block is for ${data.type === "character" ? "a character" : "an NPC"}, and this is ${actor.type === "character" ? "a character's" : "an NPC's"} sheet. Use the Actors tab's Import, or change "type" in the block.`);
        plan = await planImport(data);
      } catch (err) {
        ui.notifications.warn(err.message);
        continue;
      }
      const has = actor?.items?.size;
      const go = await DialogV2.wait({
        window: { title: `Import ${plan.name}`, icon: "fa-solid fa-file-import" }, classes: ["arneyan", "arn-import"], position: { width: 560 },
        content: `${planHtml(plan, actor)}${has ? `<p><strong>This replaces everything on ${esc(actor.name)}'s sheet</strong> (its ${has} items, scores and details).</p>` : ""}`,
        buttons: [{ action: "import", label: "Import", icon: "fa-solid fa-file-import", default: true }, { action: "back", label: "Back" }],
        rejectClose: false
      });
      if (go === "back") continue;
      if (go !== "import") return null;
      const target = actor ?? await Actor.create({ name: plan.name, type: plan.type }, { arneyanNoSetup: true });
      if (!target) return null;
      let notes;
      try {
        notes = await applyImport(target, plan, { replace: true });
      } catch (err) {
        console.error("Arneyan | import", err);
        // A new actor that didn't import is removed again; a sheet that did is left as far as it got.
        if (!actor) await target.delete().catch(() => null);
        ui.notifications.error(`The import stopped part-way (${err.message}).${actor ? " The sheet may be half filled: import again once it's fixed." : ""}`, { permanent: true });
        return null;
      }
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ alias: game.user.name }), whisper: [game.user.id],
        content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-file-import"></i> <span>Imported ${esc(target.name)}</span></header>
          ${plan.missing.length ? `<p>Not found, added as plain items: ${plan.missing.map(esc).join("; ")}.</p>` : "<p>Everything was found in the compendiums.</p>"}
          ${notes.length ? `<p class="arn-card-meta">${notes.map(esc).join(" ")}</p>` : ""}</div>`
      });
      target.sheet?.render(true);
      return target;
    }
  } finally {
    finders.clear();
  }
}

/** The Actors tab's Import button (GM). */
export function registerImport() {
  Hooks.on("renderActorDirectory", (app, html) => {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".arn-import-actor")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "arn-import-actor";
    btn.innerHTML = '<i class="fa-solid fa-file-import"></i> Import';
    btn.dataset.tooltip = "Make a character or NPC from an import block a chat wrote (the Arneyan import format).";
    btn.addEventListener("click", () => importDialog(null));
    (root.querySelector(".header-actions, .directory-header") ?? root).append(btn);
  });
}

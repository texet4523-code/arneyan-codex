/**
 * Ledgers on the character sheet (R-F50, K213 and K221): the bookkeeping familiarity doesn't fix.
 *   Soul Tax (Necromancer)     undead points held against the Undead Mastery cap, what upkeep is free at dawn and how
 *                              many points need slots (Raise the Dead: half the cap free, rounded up; upkeep may use
 *                              no more than half your spell slots, rounded up)
 *   Running illusions          (Illusionist) each Illusion spell cast goes on the list, with who has seen through it;
 *                              the Phantasm and anything else added by hand; ended with a click
 *   Workshop (Artificer)       infusions, gadgets, formulas and suit mods made, against the kit's limit, with when an
 *                              infusion ends (1 hour per level; until the next long rest from 3rd)
 * Lists are flags on the character (flags.arneyan.illusions, flags.arneyan.workshop). Nothing here changes a rule.
 */
import { undeadPoints, undeadMasteryCap, companionsOf } from "./companions.mjs";

const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const levelIn = (actor, cls) => Number([...(actor?.items ?? [])].find(i => i.type === "class" && i.name.startsWith(cls))?.system?.levels) || 0;
const has = (actor, name) => [...(actor?.items ?? [])].some(i => i.name === name);
const now = () => Number(globalThis.game?.time?.worldTime) || 0;
const newId = () => globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 12);

/* -------------------------------------------- */
/*  Soul Tax                                    */
/* -------------------------------------------- */

/**
 * Soul Tax at dawn (Raise the Dead, HB v0.10.86): undead worth up to half the cap (rounded up) are kept free; beyond
 * that each needs a slot of a level equal to its points or higher; upkeep may use no more than half your slots
 * (rounded up). `points` are the held undead's points. Pure.
 */
export function soulTax(points, cap, slotsTotal = 0) {
  const held = points.reduce((t, p) => t + p, 0);
  const free = Math.ceil(cap / 2);
  return { held, cap, free, over: Math.max(0, held - free), slotCap: Math.ceil(slotsTotal / 2), count: points.length };
}

function soulTaxFor(actor) {
  const nl = levelIn(actor, "Necromancer");
  if (!nl) return null;
  const undead = companionsOf(actor).filter(c => c.flags?.[SYS]?.companion?.preset === "raisedUndead");
  const cap = undeadMasteryCap(nl, actor.system?.abilities?.int?.mod ?? 0, { endlessRanks: has(actor, "Endless Ranks"), lichdom: has(actor, "Lichdom") });
  // "Half your total spell slots" (Raise the Dead): every casting class's levelled slots.
  const slots = (actor.system?.casters ?? []).flatMap(c => c.slots.filter(s => s.level > 0)).reduce((t, s) => t + s.total, 0);
  const t = soulTax(undead.map(c => undeadPoints(c.system?.level)), cap, slots);
  return { ...t, overText: t.over ? `${t.over} point${t.over === 1 ? "" : "s"} beyond it need slots at dawn (a slot of each undead's points or higher; at most ${t.slotCap} slots), or you lose control of those` : "all of it free at dawn" };
}

/* -------------------------------------------- */
/*  Running illusions                           */
/* -------------------------------------------- */

const illusionsOf = actor => [...(actor?.getFlag?.(SYS, "illusions") ?? [])];

/** An Illusion spell an Illusionist casts goes on its list. */
export function isIllusion(spell) {
  return spell?.type === "spell" && /illusion/i.test(String(spell.system?.school ?? ""));
}

export async function addIllusion(actor, name, { concentration = false } = {}) {
  if (!actor?.isOwner || !name) return null;
  const list = illusionsOf(actor);
  list.push({ id: newId(), name, at: now(), concentration: !!concentration, seen: [] });
  await actor.setFlag(SYS, "illusions", list.slice(-20));
  return list.at(-1);
}

/** Creatures that have seen through one: the ones targeted, or names typed in. */
export async function seenThrough(actor, id, names) {
  const list = illusionsOf(actor);
  const e = list.find(x => x.id === id);
  if (!e || !names.length) return null;
  e.seen = [...new Set([...(e.seen ?? []), ...names])];
  await actor.setFlag(SYS, "illusions", list);
  return e;
}

export async function endIllusion(actor, id) {
  const list = illusionsOf(actor).filter(x => x.id !== id);
  return actor.setFlag(SYS, "illusions", list);
}

/* -------------------------------------------- */
/*  Workshop                                    */
/* -------------------------------------------- */

const KITS = ["Infuser", "Gadgeteer", "Alchemist", "Armourer", "Construct Engineer"];
export const kitOf = actor => KITS.find(k => [...(actor?.items ?? [])].some(i => i.type === "kit" && i.name.startsWith(k))) ?? null;

/**
 * What the kit makes, and how many at once (The Artificer's kits): Infuser, infused items, half your level rounded
 * up; Gadgeteer, built gadgets, Intelligence modifier + half your level (one more from 7th); Alchemist, brewed
 * formulas, Intelligence modifier + your level; Armourer, suit mods carried, one (two from 3rd). Pure.
 */
export function workshopLimit(kit, level, intMod = 0) {
  switch (kit) {
    case "Infuser": return { what: "Infused items", max: Math.ceil(level / 2), lasts: level >= 3 ? "rest" : "hours" };
    case "Gadgeteer": return { what: "Built gadgets", max: Math.max(0, intMod) + Math.floor(level / 2) + (level >= 7 ? 1 : 0), lasts: "used" };
    case "Alchemist": return { what: "Brewed formulas", max: Math.max(0, intMod) + level, lasts: "used" };
    case "Armourer": return { what: "Suit mods", max: level >= 3 ? 2 : 1, lasts: "rest" };
    default: return null;
  }
}

/** An infusion's end: 1 hour per level from when it was made (worldTime seconds), or null (until a rest or used). */
export const endsAt = (lim, at, level) => (lim?.lasts === "hours" ? at + level * 3600 : null);

const workshopOf = actor => [...(actor?.getFlag?.(SYS, "workshop") ?? [])];

/**
 * The kit's known options, read from its kit item's Known list (after its "Known ..." heading): each point's bold name
 * ("<li><strong>Smoke Bomb:</strong> ..."), or the list's own headings where it has them.
 */
export function knownOptions(actor) {
  const kit = [...(actor?.items ?? [])].find(i => i.type === "kit" && KITS.some(k => i.name.startsWith(k)));
  const html = String(kit?.system?.description ?? "");
  const at = html.search(/<h3>[^<]*Known/i);
  // From the "Known ..." heading to the next heading (the notes after it, "Designing a Custom ...", aren't options).
  const rest = at >= 0 ? html.slice(at + 4) : "";
  const end = rest.search(/<h[34]>/);
  const known = end >= 0 ? rest.slice(0, end) : rest;
  const clean = n => n.replace(/\s*\(.*$/, "").replace(/:\s*$/, "").trim();
  // The list's own rules notes ("Benchmark", "Mounts and passives") aren't options.
  const note = n => /^(benchmark|mounts and passives)$/i.test(n);
  const named = [...known.matchAll(/<li><strong>([^<]+)<\/strong>/g)].map(m => clean(m[1])).filter(n => n && !note(n));
  if (named.length) return [...new Set(named)];
  return [...(at >= 0 ? html.slice(at) : "").matchAll(/<h4>([^<]+)<\/h4>/g)].map(m => clean(m[1])).filter(n => n && !note(n));
}

export async function addWork(actor, { name, on = "" }) {
  const kit = kitOf(actor), lvl = levelIn(actor, "Artificer");
  const lim = workshopLimit(kit, lvl, actor.system?.abilities?.int?.mod ?? 0);
  if (!lim || !name) return null;
  const list = workshopOf(actor);
  const at = now();
  list.push({ id: newId(), name, on, at, until: endsAt(lim, at, lvl), lasts: lim.lasts });
  if (list.length > lim.max) ui.notifications?.warn?.(`${actor.name}: that's ${list.length} ${lim.what.toLowerCase()}, over the ${lim.max} you can have at once (extras go inert).`);
  return actor.setFlag(SYS, "workshop", list);
}

export async function endWork(actor, id) {
  return actor.setFlag(SYS, "workshop", workshopOf(actor).filter(x => x.id !== id));
}

/** A long rest: what lasts until the next rest ends (Sustained Working infusions, suit mods turned on for the day). */
export async function afterRest(actor) {
  const list = workshopOf(actor);
  if (!list.length || !actor.isOwner) return;
  const keep = list.filter(x => x.lasts !== "rest");
  if (keep.length !== list.length) await actor.setFlag(SYS, "workshop", keep);
}

function workshopFor(actor) {
  const kit = kitOf(actor), lvl = levelIn(actor, "Artificer");
  const lim = workshopLimit(kit, lvl, actor.system?.abilities?.int?.mod ?? 0);
  if (!lim) return null;
  const t = now();
  const rows = workshopOf(actor).map(x => ({ ...x, ended: x.until !== null && x.until !== undefined && t >= x.until,
    left: x.until ? (t >= x.until ? "ended" : `${Math.ceil((x.until - t) / 60)} min left`) : x.lasts === "rest" ? "until your next long rest" : "until used" }));
  return { kit, what: lim.what, max: lim.max, count: rows.filter(r => !r.ended).length, rows };
}

/* -------------------------------------------- */
/*  Sheet                                       */
/* -------------------------------------------- */

export function ledgerContext(actor) {
  if (actor?.type !== "character") return {};
  const illusionist = levelIn(actor, "Illusionist") > 0;
  return { ledgers: { soulTax: soulTaxFor(actor), illusionist, illusions: illusionist ? illusionsOf(actor) : [], workshop: workshopFor(actor) } };
}

const entryId = target => target.closest("[data-entry-id]")?.dataset.entryId;

export const LEDGER_ACTIONS = {
  async illusionAdd() {
    const name = await promptText("Add an illusion", "What is it? (a spell, the Phantasm, a double)", "Phantasm");
    if (name) await addIllusion(this.document, name);
  },
  async illusionSeen(event, target) {
    const targeted = [...(game.user.targets ?? [])].map(t => t.name);
    const names = targeted.length ? targeted : String(await promptText("Seen through by", "Who has seen through it? (or target them first)", "") ?? "").split(",").map(s => s.trim()).filter(Boolean);
    await seenThrough(this.document, entryId(target), names);
  },
  illusionEnd(event, target) { return endIllusion(this.document, entryId(target)); },
  async workAdd() {
    const actor = this.document;
    const known = knownOptions(actor);
    const kit = kitOf(actor);
    const gear = actor.items.filter(i => ["weapon", "armour", "equipment"].includes(i.type)).map(i => i.name);
    const { DialogV2 } = foundry.applications.api;
    const content = `<label class="arn-field">Made <input name="name" list="arn-known" placeholder="${esc(known[0] ?? "Name")}"><datalist id="arn-known">${known.map(k => `<option value="${esc(k)}">`).join("")}</datalist></label>
      ${kit === "Infuser" ? `<label class="arn-field">On <select name="on"><option value=""></option>${gear.map(g => `<option>${esc(g)}</option>`).join("")}</select></label>` : ""}`;
    const res = await DialogV2.wait({ window: { title: `Workshop (${kit})` }, classes: ["arneyan"], position: { width: 380 }, content,
      buttons: [{ action: "ok", label: "Add", default: true, callback: (ev, btn) => ({ name: btn.form.querySelector("[name=name]").value.trim(), on: btn.form.querySelector("[name=on]")?.value ?? "" }) }, { action: "cancel", label: "Cancel" }], rejectClose: false });
    if (res?.name) await addWork(actor, res);
  },
  workEnd(event, target) { return endWork(this.document, entryId(target)); }
};

async function promptText(title, label, value) {
  const { DialogV2 } = foundry.applications.api;
  return DialogV2.wait({ window: { title }, classes: ["arneyan"], position: { width: 360 },
    content: `<label class="arn-field">${esc(label)} <input name="v" value="${esc(value)}" autofocus></label>`,
    buttons: [{ action: "ok", label: "OK", default: true, callback: (ev, btn) => btn.form.querySelector("[name=v]").value.trim() }, { action: "cancel", label: "Cancel" }], rejectClose: false }).catch(() => null);
}

/** An Illusionist's Illusion spell goes on the list as it is cast. */
export function registerLedgers() {
  Hooks.on("createChatMessage", (message, options, userId) => {
    if (userId !== game.user.id) return;
    const uuid = message.flags?.[SYS]?.itemUuid;
    if (!uuid || !message.flags[SYS].cast) return;
    let spell = null;
    try { spell = fromUuidSync(uuid); } catch { spell = null; }
    const actor = spell?.actor;
    if (!isIllusion(spell) || !actor || levelIn(actor, "Illusionist") < 1) return;
    addIllusion(actor, spell.name, { concentration: !!spell.system?.concentration }).catch(err => console.warn("Arneyan | illusions", err));
  });
}

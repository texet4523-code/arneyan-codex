/**
 * Starting gold and gear for a new character (Handbook, Starting Equipment & Gear): roll the class's gold, then buy
 * one of the starting packs from it or keep the gold and shop in the Catalogue. Gunslingers pick a free firearm of
 * 300 gp or less from the Basic Firearms list; Artificers get the toolkit that matches their Kit.
 */
import { ArneyanBrowser } from "./browser.mjs";

const { DialogV2 } = foundry.applications.api;
const SYS = "arneyan";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Starting Wealth: roll by class category. */
export const STARTING_GOLD = {
  Fighter: "3d6*10", Ranger: "3d6*10", Archer: "3d6*10", Knight: "3d6*10", Paladin: "3d6*10", Magus: "3d6*10", Barbarian: "3d6*10",
  Cleric: "3d6*10", Druid: "3d6*10",
  Rogue: "2d6*10", Assassin: "2d6*10", Bard: "2d6*10",
  Gunslinger: "2d6*10", Swashbuckler: "2d6*10", Artificer: "2d6*10",
  Monk: "5d4",
  Wizard: "1d4*10", Illusionist: "1d4*10",
  Sorcerer: "1d4*10", Warlock: "1d4*10", Necromancer: "1d4*10", Witch: "1d4*10"
};

/** Starting Packs: price and the Catalogue items in each (name, quantity). */
export const STARTING_PACKS = [
  { name: "Explorer's Pack", gp: 36, note: "The default for the wilderness or a dungeon.",
    items: [["Backpack", 1], ["Bedroll", 1], ["Week's Rations", 1], ["Personal Woollen Canteen", 1], ["Tinderbox", 1], ["Torch", 5], ["Rope, Hemp (50 ft)", 1], ["Mess Kit", 1]] },
  { name: "Dungeoneer's Pack", gp: 8, note: "Built for delving: more light and first aid.",
    items: [["Backpack", 1], ["Tinderbox", 1], ["Torch", 10], ["Rope, Hemp (50 ft)", 1], ["Kettle, Iron", 1], ["Bandages", 1], ["Signal Horns", 1], ["Sack, Small", 1], ["Belt Pouch, Small", 2]] },
  { name: "Scholar's Pack", gp: 15, note: "For anyone whose real weapon is what they know.",
    items: [["Backpack", 1], ["Ink (1 oz)", 1], ["Paper (10 sheets)", 1], ["Parchment (10 sheets)", 1], ["Quill", 1], ["Sealing Wax", 1], ["Case, Map or Scroll", 1], ["Belt Pouch, Small", 1]] },
  { name: "Diplomat's Pack", gp: 18, note: "More court appearances than cave crawls.",
    items: [["Backpack", 1], ["Perfume", 1], ["Signet Ring", 1], ["Robe", 1], ["Handkerchiefs", 1], ["Sealing Wax", 1], ["Case, Map or Scroll", 1], ["Belt Pouch, Small", 1]] },
  { name: "Survivalist's Pack", gp: 53, note: "For those who sleep outdoors more nights than not.",
    items: [["Backpack", 1], ["Bedroll", 1], ["Canvas Tents", 1], ["Firegrate", 1], ["Mess Kit", 1], ["Week's Rations", 2], ["Personal Woollen Canteen", 1], ["Rope, Hemp (50 ft)", 1], ["Herbal Repellents", 1]] },
  { name: "Healer's Satchel", gp: 16, note: "Keeps a party alive between rests.",
    items: [["Belt Pouch, Small", 1], ["Bandages", 1], ["Balm Kit", 1], ["Herbal Medications Case", 1]] }
];

/** Gunslingers: one firearm costing 300 gp or less from the Basic Firearms list, free. */
export const FREE_FIREARMS = ["Derringer", "Pistol", "Dragon Pistol"];

/** Artificers: the toolkit matching their Kit, free. */
export const KIT_TOOLKITS = { Infuser: "Infuser's Toolkit", "Construct Engineer": "Construct Engineer's Toolkit", Gadgeteer: "Gadgeteer's Toolkit", Alchemist: "Alchemist's Toolkit" };

const baseName = n => String(n ?? "").replace(/\s*\(.*\)$/, "").trim();

/** The gold roll for a class, or null for a class the table doesn't list. */
export function goldFormulaFor(className) {
  return STARTING_GOLD[baseName(className)] ?? null;
}

/** How a formula reads on a button: "3d6 × 10". */
const formulaLabel = f => f.replace("*", " × ");

/** Catalogue items by name (one index read). */
async function catalogueByName() {
  const pack = game.packs.get(`${SYS}.equipment`);
  if (!pack) return new Map();
  const index = await pack.getIndex();
  return new Map(index.map(e => [e.name, e.uuid]));
}

/** Copy Catalogue items onto the actor (quantities added to the item's own), linked back to the Catalogue. */
export async function giveItems(actor, list, byName = null) {
  byName ??= await catalogueByName();
  const data = [], missing = [];
  for (const [name, qty] of list) {
    const uuid = byName.get(name);
    const doc = uuid ? await fromUuid(uuid) : null;
    if (!doc) { missing.push(name); continue; }
    const d = doc.toObject();
    delete d._id;
    d.folder = null;
    foundry.utils.setProperty(d, "_stats.compendiumSource", doc.uuid);
    if (qty > 1) d.system.quantity = (d.system.quantity || 1) * qty;
    data.push(d);
  }
  if (data.length) await actor.createEmbeddedDocuments("Item", data);
  return missing;
}

/** The class this character started in (its first class). */
function firstClass(actor) {
  return actor.items.find(i => i.type === "class");
}

/* -------------------------------------------- */
/*  Paying                                      */
/* -------------------------------------------- */

const CP = { pp: 1000, gp: 100, sp: 10 };

/** Platinum, gold and silver as gold pieces (copper doesn't buy a pack). */
export function purseGp(cur) {
  return Object.entries(CP).reduce((t, [k, v]) => t + (Number(cur?.[k]) || 0) * v, 0) / 100;
}

/**
 * Pay a price in gold from gold first, then platinum, then silver (1 pp = 10 gp, 1 gp = 10 sp), with change in gold
 * and silver. Returns the new pp, gp and sp, or null if it's short.
 */
export function payGp(cur, gp) {
  const out = { pp: Number(cur?.pp) || 0, gp: Number(cur?.gp) || 0, sp: Number(cur?.sp) || 0 };
  let owed = Math.max(0, Math.round(Number(gp) * 100));
  if (purseGp(out) * 100 < owed) return null;
  for (const k of ["gp", "pp", "sp"]) {
    if (owed <= 0) break;
    const n = Math.min(out[k], Math.ceil(owed / CP[k]));
    out[k] -= n;
    owed -= n * CP[k];
  }
  const change = -owed;
  out.gp += Math.floor(change / 100);
  out.sp += Math.floor((change % 100) / 10);
  return out;
}

/**
 * "4 pp, 36 gp, 20 sp": what's in the purse that can pay. Copper is left out by default (it doesn't buy a pack);
 * the browser's Buy passes all four coins because a cheap item can be paid in copper.
 */
export const purseText = (cur, coins = ["pp", "gp", "sp"]) => coins.filter(k => cur?.[k]).map(k => `${cur[k]} ${k}`).join(", ") || "0 gp";

/* -------------------------------------------- */
/*  The window                                  */
/* -------------------------------------------- */

/** Players roll starting gold once; the GM can run it again (freebies aren't given twice). */
export function canRunStartingWealth(actor, user = game.user) {
  if (actor?.type !== "character") return false;
  return !!user?.isGM || actor.getFlag?.(SYS, "startingGold") == null;
}

/** Free items not taken yet: a Gunslinger's firearm, an Artificer's toolkit. */
export function freebiesFor(actor, cls) {
  const base = baseName(cls?.name);
  const taken = actor.getFlag?.(SYS, "startingGear")?.free ?? [];
  const kit = actor.items.find(i => i.type === "kit" && baseName(i.system.className) === "Artificer");
  const toolkit = base === "Artificer" ? KIT_TOOLKITS[baseName(kit?.name)] ?? null : null;
  return {
    gun: base === "Gunslinger" && !taken.some(n => FREE_FIREARMS.includes(n)),
    toolkit: toolkit && !taken.includes(toolkit) ? toolkit : null,
    kitName: kit ? baseName(kit.name) : "",
    taken
  };
}

/**
 * The Starting Equipment & Gear window: roll gold, then a pack or shopping. A player runs it once; the GM can run it
 * again, adding to the gold already rolled (the total is kept in flags.arneyan.startingGold).
 */
export async function startingWealth(actor, cls = null) {
  if (!actor?.isOwner || actor.type !== "character") return;
  if (!canRunStartingWealth(actor, game.user)) {
    return ui.notifications.warn(`${actor.name} has already rolled starting gold. Ask the GM to run it again.`);
  }
  cls ??= firstClass(actor);
  const formula = goldFormulaFor(cls?.name);
  if (!formula) return ui.notifications.warn(`No starting gold is listed for ${cls?.name ?? "a character with no class"}. Add gold by hand.`);
  const rolled = actor.getFlag(SYS, "startingGold");
  const taken = actor.getFlag(SYS, "startingGear")?.free ?? [];
  const go = await DialogV2.wait({
    window: { title: `${actor.name}: starting gold`, icon: "fa-solid fa-coins" }, classes: ["arneyan"], position: { width: 420 },
    content: `<p>Roll your starting gold for a ${esc(baseName(cls.name))}: <strong>${formulaLabel(formula)} gp</strong>. Then buy a starting pack with it, or keep it and shop in the Catalogue.</p>
      ${rolled != null ? `<p class="hint">Already rolled: ${rolled} gp in all. Rolling again adds more gold.${taken.length ? ` Free items already taken (${esc(taken.join(", "))}) aren't given again.` : ""}</p>` : ""}`,
    buttons: [{ action: "roll", label: `Roll ${formulaLabel(formula)} gp`, icon: "fa-solid fa-dice", default: true }, { action: "skip", label: "Not now" }],
    rejectClose: false
  });
  if (go !== "roll") return;
  const roll = await new Roll(formula).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Starting gold (${esc(baseName(cls.name))}: ${formulaLabel(formula)} gp)` });
  const gold = roll.total;
  await actor.update({ "system.currency.gp": (actor.system.currency?.gp ?? 0) + gold, [`flags.${SYS}.startingGold`]: (Number(rolled) || 0) + gold });
  return spendStartingGold(actor, cls);
}

/** Second step: a pack, or the gold kept; plus the class freebies not taken yet. */
export async function spendStartingGold(actor, cls) {
  const cur = actor.system.currency ?? {};
  const wealth = purseGp(cur);
  const base = baseName(cls?.name);
  const free = freebiesFor(actor, cls);
  const packRows = STARTING_PACKS.map((p, i) => {
    const can = p.gp <= wealth;
    return `<label class="arn-act"><input type="radio" name="pick" value="${i}" ${can ? "" : "disabled"}>
      <strong>${esc(p.name)}</strong> · ${p.gp} gp${can ? "" : " <em>(not enough money)</em>"}<br><small>${esc(p.note)} ${esc(p.items.map(([n, q]) => q > 1 ? `${q} × ${n}` : n).join(", "))}</small></label>`;
  }).join("");
  const already = free.taken.length ? `<p class="hint">Free items already taken: ${esc(free.taken.join(", "))}. They aren't given again.</p>` : "";
  const content = `<p>${esc(actor.name)} has <strong>${esc(purseText(cur))}</strong>. A pack is paid from gold first, then platinum, then silver.</p>
    <div class="arn-acts">
      <label class="arn-act"><input type="radio" name="pick" value="shop" checked> <strong>Keep the money and shop</strong><br><small>Opens the Shopkeeper's Catalogue. Take what you buy off your coins yourself.</small></label>
      ${packRows}
    </div>
    ${free.gun ? `<div class="form-group"><label>Free firearm (300 gp or less)</label><select name="gun">${FREE_FIREARMS.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}<option value="">Choose later</option></select></div>` : ""}
    ${base === "Artificer" && !free.taken.some(n => Object.values(KIT_TOOLKITS).includes(n)) ? `<p class="hint">${free.toolkit ? `Your ${esc(free.kitName)} Kit's ${esc(free.toolkit)} is free and goes in your inventory.` : "Pick your Artificer Kit first and its toolkit is free (add it from Tools &amp; Trades)."}</p>` : ""}
    ${already}`;
  const res = await DialogV2.wait({
    window: { title: `${actor.name}: starting gear`, icon: "fa-solid fa-sack-dollar" }, classes: ["arneyan"], position: { width: 520 },
    content,
    buttons: [{ action: "ok", label: "Done", default: true, callback: (ev, btn) => ({ pick: btn.form.querySelector("input[name=pick]:checked")?.value ?? "shop", gun: btn.form.elements.gun?.value ?? "" }) }],
    rejectClose: false
  });
  if (!res) return;
  return applyStartingGear(actor, res, free);
}

/** Pay for and hand over the pack, give the freebies, record what was taken and say so in chat. */
export async function applyStartingGear(actor, res, free) {
  const byName = await catalogueByName();
  const freeList = [];
  if (res.gun && free.gun && FREE_FIREARMS.includes(res.gun)) freeList.push([res.gun, 1]);
  if (free.toolkit) freeList.push([free.toolkit, 1]);
  const lines = [];
  let packName = "";
  if (res.pick !== "shop") {
    const pack = STARTING_PACKS[Number(res.pick)];
    const paid = pack ? payGp(actor.system.currency, pack.gp) : null;
    if (paid) {
      await actor.update({ "system.currency.pp": paid.pp, "system.currency.gp": paid.gp, "system.currency.sp": paid.sp });
      const missing = await giveItems(actor, pack.items, byName);
      packName = pack.name;
      lines.push(`bought the ${esc(pack.name)} for ${pack.gp} gp${missing.length ? ` (not in the Catalogue, add by hand: ${esc(missing.join(", "))})` : ""}`);
    } else if (pack) lines.push(`couldn't pay ${pack.gp} gp for the ${esc(pack.name)}`);
  }
  let given = [];
  if (freeList.length) {
    const missing = await giveItems(actor, freeList, byName);
    given = freeList.map(([n]) => n).filter(n => !missing.includes(n));
    if (given.length) lines.push(`took ${esc(given.join(" and "))} free`);
    if (missing.length) lines.push(`couldn't find ${esc(missing.join(" or "))} in the Catalogue (the GM adds ${missing.length > 1 ? "them" : "it"} by hand)`);
  }
  if (packName || given.length) {
    const prev = actor.getFlag(SYS, "startingGear") ?? {};
    await actor.setFlag(SYS, "startingGear", { packs: [...(prev.packs ?? []), ...(packName ? [packName] : [])], free: [...(prev.free ?? []), ...given] });
  }
  if (lines.length) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${esc(actor.name)} ${lines.join(", and ")}. ${esc(purseText(actor.system.currency))} left.</p>` });
  if (res.pick === "shop") ArneyanBrowser.open({ tab: "equipment", actor, filters: {} });
  return lines;
}

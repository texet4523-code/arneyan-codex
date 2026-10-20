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

/** Copy Catalogue items onto the actor (quantities added to the item's own). */
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

/**
 * The Starting Equipment & Gear window: roll gold, then a pack or shopping. Safe to call again from the sheet; it says
 * so if the gold was already rolled.
 */
export async function startingWealth(actor, cls = null) {
  if (!actor?.isOwner || actor.type !== "character") return;
  cls ??= firstClass(actor);
  const formula = goldFormulaFor(cls?.name);
  if (!formula) return ui.notifications.warn(`No starting gold is listed for ${cls?.name ?? "a character with no class"}. Add gold by hand.`);
  const rolled = actor.getFlag(SYS, "startingGold");
  const go = await DialogV2.wait({
    window: { title: `${actor.name}: starting gold`, icon: "fa-solid fa-coins" }, classes: ["arneyan"], position: { width: 420 },
    content: `<p>Roll your starting gold for a ${esc(baseName(cls.name))}: <strong>${formulaLabel(formula)} gp</strong>. Then buy a starting pack with it, or keep it and shop in the Catalogue.</p>
      ${rolled ? `<p class="hint">Already rolled once: ${rolled} gp. Rolling again adds more gold.</p>` : ""}`,
    buttons: [{ action: "roll", label: `Roll ${formulaLabel(formula)} gp`, icon: "fa-solid fa-dice", default: true }, { action: "skip", label: "Not now" }],
    rejectClose: false
  });
  if (go !== "roll") return;
  const roll = await new Roll(formula).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Starting gold (${esc(baseName(cls.name))}: ${formulaLabel(formula)} gp)` });
  const gold = roll.total;
  await actor.update({ "system.currency.gp": (actor.system.currency?.gp ?? 0) + gold, [`flags.${SYS}.startingGold`]: gold });
  return spendStartingGold(actor, cls);
}

/** Second step: a pack, or the gold kept; plus the class freebies. */
export async function spendStartingGold(actor, cls) {
  const gp = actor.system.currency?.gp ?? 0;
  const base = baseName(cls?.name);
  const kit = actor.items.find(i => i.type === "kit" && baseName(i.system.className) === "Artificer");
  const toolkit = base === "Artificer" ? KIT_TOOLKITS[baseName(kit?.name)] : null;
  const packRows = STARTING_PACKS.map((p, i) => {
    const can = p.gp <= gp;
    return `<label class="arn-act"><input type="radio" name="pick" value="${i}" ${can ? "" : "disabled"}>
      <strong>${esc(p.name)}</strong> · ${p.gp} gp${can ? "" : " <em>(not enough gold)</em>"}<br><small>${esc(p.note)} ${esc(p.items.map(([n, q]) => q > 1 ? `${q} × ${n}` : n).join(", "))}</small></label>`;
  }).join("");
  const content = `<p>${esc(actor.name)} has <strong>${gp} gp</strong>.</p>
    <div class="arn-acts">
      <label class="arn-act"><input type="radio" name="pick" value="shop" checked> <strong>Keep the gold and shop</strong><br><small>Opens the Shopkeeper's Catalogue. Take what you buy off your gold yourself.</small></label>
      ${packRows}
    </div>
    ${base === "Gunslinger" ? `<div class="form-group"><label>Free firearm (300 gp or less)</label><select name="gun">${FREE_FIREARMS.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}<option value="">Choose later</option></select></div>` : ""}
    ${base === "Artificer" ? `<p class="hint">${toolkit ? `Your ${esc(baseName(kit.name))} Kit's ${esc(toolkit)} is free and goes in your inventory.` : "Pick your Artificer Kit first and its toolkit is free (add it from Tools &amp; Trades)."}</p>` : ""}`;
  const res = await DialogV2.wait({
    window: { title: `${actor.name}: starting gear`, icon: "fa-solid fa-sack-dollar" }, classes: ["arneyan"], position: { width: 520 },
    content,
    buttons: [{ action: "ok", label: "Done", default: true, callback: (ev, btn) => ({ pick: btn.form.querySelector("input[name=pick]:checked")?.value ?? "shop", gun: btn.form.elements.gun?.value ?? "" }) }],
    rejectClose: false
  });
  if (!res) return;
  const byName = await catalogueByName();
  const free = [];
  if (res.gun) free.push([res.gun, 1]);
  if (toolkit) free.push([toolkit, 1]);
  const lines = [];
  if (res.pick !== "shop") {
    const pack = STARTING_PACKS[Number(res.pick)];
    if (pack && pack.gp <= (actor.system.currency?.gp ?? 0)) {
      await actor.update({ "system.currency.gp": actor.system.currency.gp - pack.gp });
      const missing = await giveItems(actor, pack.items, byName);
      lines.push(`bought the ${esc(pack.name)} for ${pack.gp} gp${missing.length ? ` (not in the Catalogue, add by hand: ${esc(missing.join(", "))})` : ""}`);
    }
  }
  if (free.length) {
    const missing = await giveItems(actor, free, byName);
    lines.push(`took ${esc(free.filter(([n]) => !missing.includes(n)).map(([n]) => n).join(" and "))} free`);
  }
  if (lines.length) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${esc(actor.name)} ${lines.join(", and ")}. ${actor.system.currency.gp} gp left.</p>` });
  if (res.pick === "shop") ArneyanBrowser.open({ tab: "equipment", actor, filters: {} });
}

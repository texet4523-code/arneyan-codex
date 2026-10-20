/**
 * Item Piles (optional module): loot piles, vaults and merchants use the character's coins (pp, gp, sp, cp on
 * system.currency) and our gear (quantity on system.quantity, the Catalogue price text on system.price).
 * Registered through the Item Piles API when it says it is ready; nothing here runs without the module.
 */

const SYS = "arneyan";
const ICON = c => `systems/${SYS}/assets/icons/coin-${c}-two-coins.svg`;

/** Coins in gold pieces: 1 pp = 10 gp, 1 gp = 10 sp, 1 sp = 10 cp (Catalogue, Currency). */
export const COIN_RATES = { pp: 10, gp: 1, sp: 0.1, cp: 0.01 };

/**
 * A Catalogue price in gold pieces. Prices are text ("4,500 gp", "5 sp", "6 sp Hand Keg – 56 gp Tun",
 * "2 gp each; 3 for 5 gp"): the first amount is the one that counts. No amount (a dash, "Unique") is 0.
 */
export function priceInGp(price) {
  if (typeof price === "number") return Number.isFinite(price) ? Math.max(0, price) : 0;
  // A bare number (a price Item Piles wrote back) is already in gold pieces.
  if (/^\s*\d[\d,]*(?:\.\d+)?\s*$/.test(String(price ?? ""))) return Math.max(0, Number(String(price).replace(/,/g, "")));
  const m = String(price ?? "").match(/(\d[\d,]*(?:\.\d+)?)\s*(pp|gp|sp|cp)\b/i);
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, "")) * COIN_RATES[m[2].toLowerCase()];
  return Math.round(n * 100) / 100;
}

/** The integration data Item Piles takes (game.itempiles.API.addSystemIntegration). */
export function itemPilesConfig() {
  const coin = (key, name, primary) => ({
    type: "attribute", name, img: ICON(key), abbreviation: `{#} ${key}`,
    data: { path: `system.currency.${key}` }, primary, exchangeRate: COIN_RATES[key]
  });
  return {
    VERSION: "1.0.0",
    // New piles are character actors: they have coins and an inventory.
    ACTOR_CLASS_TYPE: "character",
    ITEM_CLASS_LOOT_TYPE: "equipment",
    ITEM_CLASS_WEAPON_TYPE: "weapon",
    ITEM_CLASS_EQUIPMENT_TYPE: "armour",
    ITEM_QUANTITY_ATTRIBUTE: "system.quantity",
    ITEM_PRICE_ATTRIBUTE: "system.price",
    // Only gear goes in piles: classes, kits, features, spells and the like stay on the sheet.
    ITEM_FILTERS: [{ path: "type", filters: "class,ancestry,kit,feat,skill,ability,spell" }],
    ITEM_SIMILARITIES: ["name", "type"],
    UNSTACKABLE_ITEM_TYPES: [],
    PILE_DEFAULTS: {},
    TOKEN_FLAG_DEFAULTS: {},
    // Gear that changes hands arrives unequipped and out of any container it was in.
    ITEM_TRANSFORMER: itemData => {
      if (itemData?.system) {
        if ("equipped" in itemData.system) itemData.system.equipped = false;
        if ("inside" in itemData.system) itemData.system.inside = "";
      }
      return itemData;
    },
    // Prices are text: read the first amount, in gold pieces (the primary coin).
    ITEM_COST_TRANSFORMER: item => priceInGp(foundry.utils.getProperty(item, "system.price")),
    CURRENCIES: [coin("pp", "Platinum", false), coin("gp", "Gold", true), coin("sp", "Silver", false), coin("cp", "Copper", false)],
    SECONDARY_CURRENCIES: [],
    CURRENCY_DECIMAL_DIGITS: 0.01
  };
}

export function registerItemPiles() {
  Hooks.once("item-piles-ready", () => {
    const api = game.itempiles?.API;
    if (typeof api?.addSystemIntegration !== "function") return;
    try { api.addSystemIntegration(itemPilesConfig(), "latest"); } catch (err) { console.warn("Arneyan | Item Piles", err); }
  });
}

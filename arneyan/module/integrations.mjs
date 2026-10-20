/**
 * Optional modules: Dice So Nice, Item Piles and Token Action HUD. Each registers on that module's own
 * "ready" hook, so the system works the same without them.
 */
import { registerDiceSoNice } from "./dsn.mjs";
import { registerItemPiles } from "./itempiles.mjs";
import { registerTokenActionHud } from "./tah.mjs";

export function registerIntegrations() {
  registerDiceSoNice();
  registerItemPiles();
  registerTokenActionHud();
}

/**
 * Dice So Nice (optional module): 3D dice for every Arneyan roll, with damage dice coloured by damage type.
 *
 * Our cards post their rolls on the chat message (`rolls`), which Dice So Nice animates on its own. Damage and
 * healing rolls are tagged here with their type as each die's flavour ("1d6[fire]"): Dice So Nice reads that
 * as a dice role (its "Damage Types" roles: fire, cold, acid...) or a colourset of that name. The types it has
 * no look for (slashing, piercing, bludgeoning, healing) get our own coloursets and roles when it is ready.
 * Nothing here runs or matters without the module.
 */
import { ARNEYAN } from "./config.mjs";

const SYS = "arneyan";

/** Our own looks, for the types Dice So Nice has none for. */
export const DICE_LOOKS = {
  slashing: { foreground: "#1b1b1b", background: "#9aa0a8", outline: "#f1ead6", edge: "#6b7078", material: "metal" },
  piercing: { foreground: "#1b1b1b", background: "#b08d57", outline: "#f1ead6", edge: "#7a5f37", material: "metal" },
  bludgeoning: { foreground: "#f1ead6", background: "#6b4f35", outline: "#1b1b1b", edge: "#4a3524", material: "wood" },
  healing: { foreground: "#f1ead6", background: "#2D5A27", outline: "#1A3320", edge: "#1A3320", material: "plastic" }
};

/** Tag a damage or healing roll's dice with its type (as flavour), so Dice So Nice colours them. Returns the roll. */
export function tagDamage(roll, type) {
  if (!roll || !type || !(type in ARNEYAN.damageTypes)) return roll;
  for (const die of roll.dice ?? []) {
    die.options ??= {};
    if (!die.options.flavor) die.options.flavor = type;
  }
  return roll;
}

/** Show 3D dice for a roll that isn't posted on its own chat message (a staff recharging at dawn). */
export function show3d(roll) {
  try { if (roll && game.dice3d?.showForRoll) game.dice3d.showForRoll(roll, game.user, true); } catch (err) { console.warn("Arneyan | Dice So Nice", err); }
}

/** Register our coloursets and dice roles once Dice So Nice is ready. */
export function registerDiceSoNice() {
  Hooks.once("diceSoNiceReady", dice3d => {
    for (const [type, look] of Object.entries(DICE_LOOKS)) {
      const label = ARNEYAN.damageTypes[type] ?? type;
      try {
        dice3d.addColorset?.({ name: type, description: `${label} (The Arneyan Codex)`, category: "The Arneyan Codex", ...look });
      } catch (err) { console.warn(`Arneyan | Dice So Nice colourset ${type}`, err); }
      // Newer versions: a dice role, so the GM and players can change the look in the Dice Roles table.
      if (typeof dice3d.addRole === "function") {
        try {
          dice3d.addRole({ id: type, label, group: "DICESONICE.DamageTypes", optional: true, customizable: true,
            detectors: { types: [type] }, defaults: { global: { colorset: type } } }, { package: SYS });
        } catch (err) { console.warn(`Arneyan | Dice So Nice role ${type}`, err); }
      }
    }
  });
}

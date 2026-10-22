/**
 * Asking players for initiative (Kieran, 21 Oct 2026): a small window with a Roll initiative button pops up for a
 * player when their character joins a fight without an initiative, when the fight starts, or when the GM presses the
 * bell in the combat tracker. Monsters roll their own when the fight starts (qol.mjs).
 */
const SYS = "arneyan";
const SOCKET = `system.${SYS}`;
const { DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** This player's combatants in a fight still waiting for initiative (their characters, companions and summons). */
export function waitingFor(combat, user = game.user) {
  if (!combat || user.isGM) return [];
  return combat.combatants.filter(c => c.initiative === null && !c.isDefeated && c.testUserPermission?.(user, "OWNER"));
}

const open = new Map();
let pending = null;

/** Pop up the window for this user's combatants still without initiative (once per fight at a time). */
export async function promptInitiative(combat) {
  const todo = waitingFor(combat);
  if (!todo.length) return;
  if (open.has(combat.id)) return;
  const names = todo.map(c => esc(c.name)).join(", ");
  open.set(combat.id, true);
  try {
    const roll = await DialogV2.wait({
      window: { title: "Roll initiative", icon: "fa-solid fa-dice-d20" }, classes: ["arneyan", "arn-init-prompt"], position: { width: 320 },
      content: `<p class="arn-init-ask"><i class="fa-solid fa-khanda"></i> Roll initiative for <strong>${names}</strong>.</p>`,
      buttons: [
        { action: "roll", label: "Roll initiative", icon: "fa-solid fa-dice-d20", default: true, callback: () => true },
        { action: "later", label: "Later" }
      ],
      rejectClose: false
    });
    if (roll !== true) return;
    // Rolled meanwhile from the tracker or the sheet: only the ones still without one.
    const still = waitingFor(game.combats.get(combat.id) ?? combat).map(c => c.id);
    if (still.length) await combat.rollInitiative(still);
  } finally {
    open.delete(combat.id);
  }
}

/** Several changes at once (a token dragged in, the fight started) ask only once. */
function soon(combat) {
  clearTimeout(pending);
  pending = setTimeout(() => promptInitiative(combat).catch(err => console.warn("Arneyan | initiative prompt", err)), 400);
}

/** The GM's bell in the combat tracker: ask every player still without initiative. */
export function askEveryone(combat) {
  if (!game.user.isGM || !combat) return;
  game.socket.emit(SOCKET, { action: "askInitiative", combatId: combat.id });
  const waiting = combat.combatants.filter(c => c.initiative === null && !c.isDefeated && c.hasPlayerOwner);
  ui.notifications.info(waiting.length ? `Asked for initiative: ${waiting.map(c => c.name).join(", ")}.` : "Everyone has rolled initiative.");
}

export function registerInitiative() {
  // A character joins a fight (on the scene or later), or the fight starts.
  Hooks.on("createCombatant", combatant => { if (!game.user.isGM && combatant.isOwner) soon(combatant.parent); });
  Hooks.on("updateCombat", (combat, changes) => {
    if (game.user.isGM || !("round" in changes && combat.round === 1)) return;
    soon(combat);
  });
  Hooks.once("ready", () => {
    game.socket.on(SOCKET, msg => {
      if (msg?.action !== "askInitiative" || game.user.isGM) return;
      const combat = game.combats.get(String(msg.combatId));
      if (combat) soon(combat);
    });
  });
  // The bell in the combat tracker (GM).
  Hooks.on("renderCombatTracker", (app, html) => {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const combat = app.viewed ?? game.combat;
    if (!root || !combat || root.querySelector(".arn-ask-init")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "arn-ask-init inline-control icon fa-solid fa-bell";
    btn.dataset.tooltip = "Ask the players to roll initiative";
    btn.setAttribute("aria-label", "Ask the players to roll initiative");
    btn.addEventListener("click", ev => { ev.preventDefault(); askEveryone(app.viewed ?? game.combat); });
    // In the tracker's own controls where they're found (querySelector with a list takes the first in the page).
    const bar = root.querySelector(".encounter-controls .control-buttons.left") ?? root.querySelector(".encounter-controls")
      ?? root.querySelector(".combat-tracker-header") ?? root;
    bar.append(btn);
  });
}

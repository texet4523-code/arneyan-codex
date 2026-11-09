/**
 * A row of dice buttons above the chat box (Jacob's Well, 8 Nov 2026: "no d4 roll button" for Sleep's duration).
 * Each rolls one die to chat in the roll mode chosen there, as the selected token (or your character).
 */
const DICE = [4, 6, 8, 10, 12, 20, 100];

export function diceTrayHtml() {
  return `<div class="arn-dice-tray">${DICE.map(n => `<button type="button" class="arn-tray-die" data-die="${n}" data-tooltip="Roll 1d${n}">d${n}</button>`).join("")}</div>`;
}

async function rollDie(n) {
  const roll = await new Roll(`1d${n}`).evaluate();
  return roll.toMessage({ speaker: ChatMessage.getSpeaker() }, { rollMode: game.settings.get("core", "rollMode") });
}

/** Inside the chat form, at its top, so the tray goes wherever Foundry moves the chat box (the sidebar or the
 *  notification area when the sidebar is collapsed). */
function addTray() {
  for (const form of document.querySelectorAll(".chat-form")) {
    if (form.querySelector(".arn-dice-tray")) continue;
    form.insertAdjacentHTML("afterbegin", diceTrayHtml());
    form.querySelectorAll(".arn-tray-die").forEach(b => b.addEventListener("click", ev => { ev.preventDefault(); rollDie(Number(b.dataset.die)); }));
  }
}

export function registerDiceTray() {
  Hooks.on("renderChatLog", () => addTray());
  Hooks.on("collapseSidebar", () => setTimeout(addTray, 50));
  Hooks.once("ready", () => addTray());
}

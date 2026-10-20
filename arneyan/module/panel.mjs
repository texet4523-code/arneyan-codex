/**
 * Effects panel: the selected token's (or your own character's) conditions, effects, switches and
 * Exhaustion as icons at the top right of the screen, like PF2e's. Hover for details;
 * right-click to remove (Exhaustion goes down one level, a switch turns off).
 */
import { ARNEYAN } from "./config.mjs";
import { appliedEffects } from "./effects.mjs";
import { adjustCondition, badgeOf, counterKind, removeCondition } from "./counters.mjs";
import { lightInfo } from "./gear.mjs";

const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let el = null;
let pending = null;

function currentActor() {
  const token = canvas?.tokens?.controlled?.[0];
  return token?.actor ?? game.user.character ?? null;
}

function entries(actor) {
  const out = [];
  for (const e of appliedEffects(actor)) {
    if (e.disabled || e.isSuppressed) continue;
    const f = e.flags?.[SYS] ?? {};
    const status = [...(e.statuses ?? [])][0];
    const cond = status ? ARNEYAN.conditions[status] : null;
    const badge = badgeOf(e);
    const counted = !!cond && counterKind(status) !== "none";
    const what = status === "burning" ? "stacks (1d6 each)" : status === "poisoned" ? "venom stage" : "rounds left";
    const rules = (f.rules ?? []).map(r => `${r.key} ${r.value}${r.when ? ` (${r.when})` : ""}`).join(", ");
    out.push({
      kind: "effect", id: e.uuid, img: e.img || (status ? `systems/${SYS}/assets/conditions/${status}.svg` : "icons/svg/aura.svg"),
      name: e.name, badge, cond: !!cond, status: counted ? status : "",
      tip: `<strong>${esc(e.name)}</strong>${f.sourceName ? `<br><em>from ${esc(f.sourceName)}</em>` : ""}${cond ? `<br>${esc(cond.text)}` : ""}${rules ? `<br>${esc(rules)}` : ""}${badge ? `<br>${badge} ${what}` : ""}<br><small>${counted ? "Left-click +1 · right-click −1 · Shift + right-click removes" : "Right-click to remove"}</small>`
    });
  }
  const ex = actor.system?.attributes?.exhaustion ?? 0;
  if (actor.type === "character" && ex > 0) {
    out.push({ kind: "exhaustion", img: `systems/${SYS}/assets/conditions/exhaustion.svg`, name: "Exhaustion", badge: String(ex), cond: true,
      tip: `<strong>Exhaustion ${ex}</strong><br>${esc(ARNEYAN.exhaustion[ex] ?? "")}<br><small>Right-click to lower by one</small>` });
  }
  const inv = actor.system?.inventory;
  if (actor.type === "character" && inv?.over) {
    out.push({ kind: "encumbered", img: "systems/arneyan/assets/icons/gear-knapsack.svg", name: "Over the inventory limit", badge: `${inv.used}/${inv.max}`, cond: true,
      tip: `<strong>Over the inventory limit</strong><br>${inv.used} of ${inv.max} slots (${inv.overBy} over). Speed −${inv.speedPenalty}ft; Disadvantage on Dexterity checks and attack rolls.<br><small>Drop or stow gear to clear it</small>` });
  }
  for (const i of actor.items) {
    if (i.type === "equipment" && i.system.light?.lit) {
      out.push({ kind: "light", id: i.id, img: i.img, name: `${i.name} (lit)`, badge: "", cond: false,
        tip: `<strong>${esc(i.name)}</strong><br>Lit${i.system.light.hours ? `, ${esc(lightInfo(i.system.light).label)}` : ""}<br><small>Right-click to put it out</small>` });
    }
    if (!i.system.toggle || !i.system.active) continue;
    out.push({ kind: "toggle", id: i.id, img: i.img, name: i.name, badge: "", cond: false,
      tip: `<strong>${esc(i.name)}</strong><br>Switched on<br><small>Right-click to switch off</small>` });
  }
  return out;
}

function position() {
  if (!el) return;
  const sidebar = document.getElementById("sidebar");
  const left = sidebar?.getBoundingClientRect?.().left;
  const right = left ? Math.max(8, window.innerWidth - left + 10) : 310;
  el.style.right = `${right}px`;
}

function render() {
  pending = null;
  if (!el) return;
  const actor = currentActor();
  const list = actor ? entries(actor) : [];
  el.hidden = !list.length;
  if (!list.length) { el.replaceChildren(); return; }
  el.dataset.actorUuid = actor.uuid;
  el.innerHTML = list.map((x, i) => `<div class="arn-ep-item ${x.cond ? "cond" : ""}" data-i="${i}" data-kind="${x.kind}" data-id="${x.id ?? ""}" data-status="${x.status ?? ""}" data-tooltip-direction="LEFT">
      <img src="${esc(x.img)}" alt="${esc(x.name)}">${x.badge ? `<span class="arn-ep-badge">${esc(x.badge)}</span>` : ""}</div>`).join("");
  el.querySelectorAll(".arn-ep-item").forEach((node, i) => {
    node.dataset.tooltip = list[i].tip;
    node.dataset.tooltipHtml = list[i].tip;
  });
  position();
}

function schedule() {
  if (pending) return;
  pending = setTimeout(render, 50);
}

async function onContext(event) {
  const node = event.target.closest(".arn-ep-item");
  if (!node) return;
  event.preventDefault();
  const actor = await fromUuid(el.dataset.actorUuid);
  if (!actor?.isOwner) return ui.notifications.warn("You don't control that character.");
  const kind = node.dataset.kind;
  if (kind === "effect" && node.dataset.status) return event.shiftKey ? removeCondition(actor, node.dataset.status) : adjustCondition(actor, node.dataset.status, -1);
  if (kind === "effect") return (await fromUuid(node.dataset.id))?.delete();
  if (kind === "exhaustion") return actor.update({ "system.attributes.exhaustion": Math.max(0, actor.system.attributes.exhaustion - 1) });
  if (kind === "toggle") return actor.items.get(node.dataset.id)?.update({ "system.active": false });
  if (kind === "light") { const i = actor.items.get(node.dataset.id); if (i) return (await import("./gear.mjs")).toggleLight(i); }
}

/** Left-click a numbered condition: one more round (or stack, or venom stage). */
async function onClick(event) {
  const node = event.target.closest(".arn-ep-item[data-status]");
  if (!node?.dataset.status) return;
  event.preventDefault();
  const actor = await fromUuid(el.dataset.actorUuid);
  if (!actor?.isOwner) return ui.notifications.warn("You don't control that character.");
  return adjustCondition(actor, node.dataset.status, +1);
}

export function registerPanel() {
  Hooks.once("ready", () => {
    el = document.createElement("aside");
    el.id = "arneyan-effects-panel";
    el.hidden = true;
    el.addEventListener("contextmenu", onContext);
    el.addEventListener("click", onClick);
    document.body.append(el);
    window.addEventListener("resize", position);
    const sidebar = document.getElementById("sidebar");
    if (sidebar && typeof ResizeObserver === "function") new ResizeObserver(position).observe(sidebar);
    Hooks.on("collapseSidebar", () => setTimeout(position, 400));
    render();
  });
  for (const hook of ["controlToken", "canvasReady", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect",
    "updateActor", "updateItem", "createItem", "deleteItem", "updateCombat", "deleteCombat", "collapseSidebar", "renderSidebar"]) {
    Hooks.on(hook, schedule);
  }
}

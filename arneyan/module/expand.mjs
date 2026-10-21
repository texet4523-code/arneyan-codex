/**
 * Click a row to read it (Kieran, 21 Oct 2026): every item on a sheet (gear, weapons, armour, skills, feats, features,
 * spells, ancestry and kit) opens under its row with its key numbers and its description, PF2e style; right-click a row
 * to open the item in its own window.
 */
import { ARNEYAN } from "./config.mjs";

const slotsText = n => `${n} slot${n === 1 ? "" : "s"}`;
const signed = n => `${n >= 0 ? "+" : ""}${n}`;

/** The short facts shown above an item's description when its row is opened. */
export function itemFacts(item, { gm = globalThis.game?.user?.isGM ?? false } = {}) {
  const s = item?.system ?? {};
  const out = [];
  const push = (...v) => { for (const x of v) if (x !== undefined && x !== null && String(x).trim()) out.push(String(x).trim()); };
  const slots = Number.isFinite(s.totalSlots) ? s.totalSlots : s.slots;
  // Unidentified gear shows players nothing that gives it away.
  if (s.identified === false && !gm) {
    if (Number.isFinite(slots)) push(slotsText(slots));
    return out;
  }
  switch (item?.type) {
    case "weapon":
      push(`${s.damage ?? ""} ${ARNEYAN.damageTypes?.[s.damageType] ?? ""}`.trim());
      if (s.magic) push(signed(s.magic));
      if (s.ranged) push(s.range ? `Range ${s.range}` : "Ranged");
      else push("Melee", s.range ? `Thrown ${s.range}` : "");
      if (s.ammoType) push(`Fires ${s.ammoType}s`);
      push(s.traits);
      for (const b of s.bonusDamage ?? []) if (b.formula) push(`+${String(b.formula).replace(/^\+/, "")} ${ARNEYAN.damageTypes?.[b.type] ?? ""}${b.when ? ` ${b.when}` : ""}`.trim());
      break;
    case "armour":
      push(s.category === "shield" ? `Shield, AC +${s.ac ?? 0}` : `${ARNEYAN.armourCategories?.[s.category] ?? ""} armour, AC +${s.ac ?? 0}`.trim());
      if (s.magic) push(`${signed(s.magic)} magic`);
      push(s.traits);
      break;
    case "equipment":
      if (s.charges?.max) push(`${s.charges.value}/${s.charges.max} charges`);
      if (s.container?.holds) push(`Holds ${s.container.capacity ? slotsText(s.container.capacity) : "anything"}${s.container.weightless ? ", weightless" : ""}`);
      if (s.ammoType) push(`Ammunition (${s.ammoType})`);
      if (s.consumable?.use) push("Used up when used");
      break;
    case "skill":
      push(ARNEYAN.abilities?.[s.ability], ARNEYAN.skillTiers?.[s.tier]);
      break;
    case "spell":
      push(s.level ? `${ARNEYAN.spellLevels?.[s.level] ?? s.level} level` : "Cantrip", s.school, s.castingTime, s.range, s.duration, s.components);
      if (s.concentration) push("Concentration");
      if (s.ritual) push("Ritual");
      break;
    case "feat":
      push(s.path);
      if (s.levelTaken) push(`Taken at level ${s.levelTaken}`);
      break;
    case "ability":
      // A class feature's level; a basic action or a monster's ability has none worth showing.
      if (s.className) push(s.className, s.level ? `Level ${s.level}` : "");
      if (s.save) push(`${ARNEYAN.saveTypes?.[s.save] ?? s.save} save`);
      if (s.damage) push(`${s.damage} ${ARNEYAN.damageTypes?.[s.damageType] ?? ""}`.trim());
      break;
  }
  if (s.uses?.max) push(`${s.uses.value}/${s.uses.max} ${ARNEYAN.usesPer?.[s.uses.per] ?? ""}`.trim());
  if (["weapon", "armour", "equipment"].includes(item?.type)) {
    if ((s.quantity ?? 1) !== 1) push(`× ${s.quantity}`);
    if (Number.isFinite(slots)) push(slotsText(slots));
    push(s.price);
  }
  return out;
}

/** Show in chat, unless it's unidentified gear the GM would give away (its real name and text go to everyone). */
export function itemToChat(item) {
  if (!item) return;
  if (item.system?.identified === false) return ui.notifications.warn(`${item.name} is unidentified: reveal it first (the eye button), or players would see what it is.`);
  return item.toChat();
}

/** Right-click a row with an item on it: open the item in its own window. Bound once per sheet. */
export function bindItemWindows(app, find = id => app.document?.items?.get(id)) {
  if (!app?.element || app._arnItemWindows === app.element) return;
  app._arnItemWindows = app.element;
  app.element.addEventListener("contextmenu", ev => {
    // Slot pips, fields and anything with its own right-click keep theirs.
    if (ev.target.closest?.("input, select, textarea, .arn-pip, [data-no-window]")) return;
    const row = ev.target.closest?.("[data-item-id]");
    const item = row ? find(row.dataset.itemId) : null;
    if (!item) return;
    ev.preventDefault();
    ev.stopPropagation();
    item.sheet?.render(true);
  });
}

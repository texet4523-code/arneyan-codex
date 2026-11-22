/**
 * Metamagic on the spell card (R-F50, K213 and K221). A Sorcerer's spell card lists the Metamagic options it knows, each
 * with two buttons: Spellburn (2 points of Strength, Dexterity or Constitution, for the base effect) and Wild Surge
 * (one of the day's surges, for the enhanced effect; the GM's secret Corruption roll follows). One option per spell
 * (from 20th, once a day, two). The buttons use the
 * Metamagic feature's own options, so the use is spent and the card says what was paid.
 */
const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const feature = (actor, name) => [...(actor?.items ?? [])].find(i => ["ability", "feat"].includes(i.type) && i.name === name) ?? null;
const acts = item => item?.availableActivities ?? item?.system?.activities ?? [];
const levelIn = (actor, cls) => Number([...(actor?.items ?? [])].find(i => i.type === "class" && i.name.startsWith(cls))?.system?.levels) || 0;

/** The Sorcerer's Metamagic for a spell: { options, surges (left), twice (20th) } or null. Overchannel stays on its own feature (it is for a spell with no slot left, which casts no card). */
export function metamagicFor(actor, spell) {
  if (actor?.type !== "character" || spell?.type !== "spell") return null;
  const mm = feature(actor, "Metamagic"), list = feature(actor, "Metamagic Options");
  if (!mm || !list) return null;
  const options = acts(list).map(a => ({ name: a.name, text: a.text ?? "" }));
  if (!options.length) return null;
  const count = mm.usesCount;
  return { options, surges: count ? count.value : null, twice: levelIn(actor, "Sorcerer") >= 20 };
}

export function metamagicHtml(actor, spell, info = metamagicFor(actor, spell)) {
  if (!info) return "";
  const surge = info.surges === null ? "Wild Surge" : `Wild Surge (${info.surges} left)`;
  const rows = info.options.map(o => `<div class="arn-mm-row" data-tooltip="${esc(o.text)}"><strong>${esc(o.name)}</strong>`
    + `<button type="button" class="arn-mm" data-pay="burn" data-option="${esc(o.name)}"><i class="fa-solid fa-fire"></i> Spellburn 2</button>`
    + `<button type="button" class="arn-mm" data-pay="surge" data-option="${esc(o.name)}" ${info.surges === 0 ? "disabled" : ""}><i class="fa-solid fa-hurricane"></i> ${esc(surge)}</button></div>`).join("");
  return `<div class="arn-metamagic" data-actor-uuid="${esc(actor.uuid)}"><div class="arn-tiny arn-muted">Metamagic: one option per spell${info.twice ? " (two, once a day, from 20th)" : ""}. Spellburn for the base effect, Wild Surge for the enhanced one.</div>${rows}</div>`;
}

/**
 * How many options a card may still take: one; at 20th, two, once a day (`twiceUsed`: a second option was taken since
 * the last long rest).
 */
export const optionsLeft = (used = [], twice = false, twiceUsed = false) => Math.max(0, (twice && (!twiceUsed || used.length >= 2) ? 2 : 1) - used.length);


async function pay(message, actor, pay, option, ev) {
  const mm = feature(actor, "Metamagic");
  const text = acts(feature(actor, "Metamagic Options")).find(a => a.name === option)?.text ?? "";
  let paid = null;
  if (pay === "burn") paid = await mm._useActivity(acts(mm).find(a => a.name === "Spellburn"), ev);
  else {
    paid = await mm._useActivity(acts(mm).find(a => a.name === "Wild Surge"), ev);
    const roll = acts(mm).find(a => a.name === "Corruption roll");
    if (paid && roll) await mm._useActivity(roll, ev);
  }
  if (!paid) return null;
  const used = [...(message.flags?.[SYS]?.metamagic ?? []), option];
  if (message.canUserModify?.(game.user, "update")) await message.update({ [`flags.${SYS}.metamagic`]: used }).catch(() => null);
  // A second option on one spell (20th): once a day, until the next long rest.
  if (used.length >= 2) await actor.setFlag(SYS, "metamagicTwice", true).catch(() => null);
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-wand-magic-sparkles"></i> <span>Metamagic: ${esc(option)} (${pay === "burn" ? "base, Spellburn" : "enhanced, Wild Surge"})</span></header><p>${esc(text)}</p></div>` });
}

export function registerMetamagic() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const box = html.querySelector?.(".arn-metamagic");
    if (!box) return;
    let actor = null;
    try { actor = fromUuidSync(box.dataset.actorUuid); } catch { actor = null; }
    if (!actor?.isOwner) { box.remove(); return; }
    const used = message.flags?.[SYS]?.metamagic ?? [];
    const left = optionsLeft(used, levelIn(actor, "Sorcerer") >= 20, !!actor.getFlag?.(SYS, "metamagicTwice"));
    box.querySelectorAll(".arn-mm[data-option]").forEach(b => { if (!left || used.includes(b.dataset.option)) b.disabled = true; });
    if (used.length) box.insertAdjacentHTML("beforeend", `<p class="arn-card-meta">Applied: ${used.map(esc).join(", ")}.</p>`);
    box.querySelectorAll(".arn-mm").forEach(btn => btn.addEventListener("click", async ev => {
      ev.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true;
      let done = null;
      try { done = await pay(message, actor, btn.dataset.pay, btn.dataset.option ?? "", ev); } catch (err) { console.error("Arneyan | metamagic", err); ui.notifications.error(err.message); }
      // Cancelled: the button stays.
      if (!done) btn.disabled = false;
    }));
  });
}

/**
 * Undying (the zombies' trait, Monsters & Treasure): "When reduced to 0 HP by anything other than fire, radiant damage
 * or a critical hit, it makes a Fortitude save (DC 5 + damage taken). On a success it drops to 1 HP instead." Jacob's
 * Well (8 Nov 2026): nobody knew of it until mid-fight. When a creature with it drops to 0 HP, the GM gets a card with
 * the DC worked out, a button to roll the save and one to put it back at 1 HP. Nothing is decided by itself.
 */
const SYS = "arneyan";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** The creature's Undying trait, if it has one (by name, or by its words). */
export function undyingOf(actor) {
  return (actor?.items ?? []).find(i => i.type === "ability" && (i.name === "Undying"
    || /reduced to\s*0\s*HP[\s\S]*Fortitude save[\s\S]*DC\s*5\s*\+\s*damage/i.test(String(i.system?.description ?? "").replace(/<[^>]+>/g, " "))));
}

/** The card's content: the DC from the damage that dropped it. */
export function undyingCard(name, damage) {
  const dc = 5 + Math.max(0, Math.round(Number(damage) || 0));
  return {
    dc,
    content: `<div class="arn-card arn-undying"><header class="arn-card-title"><span>${esc(name)}: Undying</span></header>
      <p>Dropped to 0 HP by ${Math.max(0, Math.round(Number(damage) || 0))} damage. Unless it was fire, radiant damage or a critical hit, it makes a <strong>Fortitude save, DC ${dc}</strong> (5 + damage taken); on a success it drops to 1 HP instead.</p>
      <div class="arn-card-buttons"><button type="button" class="arn-undying-save"><i class="fa-solid fa-shield-halved"></i> Fortitude save DC ${dc}</button>
      <button type="button" class="arn-undying-up"><i class="fa-solid fa-heart"></i> Back to 1 HP</button></div></div>`
  };
}

export function registerUndying() {
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    if (actor.type !== "npc" || !foundry.utils.hasProperty(changes, "system.attributes.hp.value")) return;
    (options.arneyanHpBefore ??= {})[actor.id] = Number(actor.system.attributes?.hp?.value) || 0;
  });
  Hooks.on("updateActor", async (actor, changes, options, userId) => {
    if (userId !== game.user.id || actor.type !== "npc") return;
    const before = options?.arneyanHpBefore?.[actor.id];
    const now = Number(actor.system.attributes?.hp?.value);
    if (!(before > 0) || !(now <= 0) || !undyingOf(actor)) return;
    const { dc, content } = undyingCard(actor.token?.name ?? actor.name, before - now);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }), content, whisper: game.users.filter(u => u.isGM).map(u => u.id),
      flags: { [SYS]: { undying: { actorUuid: actor.uuid, dc } } }
    }).catch(err => console.warn("Arneyan | Undying", err));
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const u = message.getFlag(SYS, "undying");
    if (!u) return;
    const actorOf = async () => fromUuid(u.actorUuid);
    html.querySelector(".arn-undying-save")?.addEventListener("click", async ev => {
      ev.preventDefault();
      const actor = await actorOf();
      if (!actor?.isOwner) return ui.notifications.warn("Only the GM can roll it.");
      await actor.rollSave("fort", ev, { dc: u.dc, source: "Undying" });
    });
    html.querySelector(".arn-undying-up")?.addEventListener("click", async ev => {
      ev.preventDefault();
      const actor = await actorOf();
      if (!actor?.isOwner) return ui.notifications.warn("Only the GM can do that.");
      await actor.update({ "system.attributes.hp.value": 1 });
      ui.notifications.info(`${actor.token?.name ?? actor.name} is back at 1 HP (Undying).`);
    });
  });
}

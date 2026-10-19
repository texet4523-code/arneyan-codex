/**
 * Monsters imported into a world keep the data they had when imported. After a system update changes the
 * Bestiary (sizes, extra damage, spell slots), "Update from the Bestiary" copies the new stat block over:
 * the actor's data and items are replaced, its name and art stay, and its tokens on every scene get the new
 * size and vision.
 */
const SYS = "arneyan";
const PACK = `Compendium.${SYS}.monsters.`;

/** The Bestiary entry a world monster came from, if any. */
export function bestiarySource(actor) {
  const src = actor?._stats?.compendiumSource ?? actor?.flags?.core?.sourceId ?? "";
  return typeof src === "string" && src.startsWith(PACK) ? src : null;
}

/** Copy the current Bestiary stat block onto a world monster (GM). */
export async function refreshFromBestiary(actor, { quiet = false } = {}) {
  if (!game.user.isGM || !actor || actor.pack || actor.isToken) return false;
  const uuid = bestiarySource(actor);
  if (!uuid) return false;
  const src = await fromUuid(uuid).catch(() => null);
  if (!src) { if (!quiet) ui.notifications.warn(`${actor.name}: its Bestiary entry is gone.`); return false; }
  const data = src.toObject();
  const keepName = actor.name !== src.name;
  await actor.deleteEmbeddedDocuments("Item", actor.items.map(i => i.id));
  // The stat block replaces the old one whole; then the token settings.
  await actor.update({ system: data.system }, { diff: false, recursive: false });
  await actor.update({
    ...(keepName ? {} : { img: data.img }),
    "prototypeToken.width": data.prototypeToken.width, "prototypeToken.height": data.prototypeToken.height,
    "prototypeToken.sight": data.prototypeToken.sight
  });
  await actor.createEmbeddedDocuments("Item", data.items, { keepId: true });
  for (const scene of game.scenes) {
    const updates = scene.tokens.filter(t => t.actorId === actor.id).map(t => ({
      _id: t.id, width: data.prototypeToken.width, height: data.prototypeToken.height, sight: data.prototypeToken.sight
    }));
    if (updates.length) await scene.updateEmbeddedDocuments("Token", updates).catch(err => console.warn("Arneyan | token refresh", err));
  }
  if (!quiet) ui.notifications.info(`${actor.name} updated from the Bestiary.`);
  return true;
}

/** Every world monster that came from the Bestiary. */
export async function refreshAllFromBestiary() {
  if (!game.user.isGM) return;
  const list = game.actors.filter(a => a.type === "npc" && bestiarySource(a));
  if (!list.length) return ui.notifications.info("No monsters in this world came from the Bestiary.");
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Update monsters from the Bestiary" },
    content: `<p>Copy the current Bestiary stat blocks onto the ${list.length} monster${list.length === 1 ? "" : "s"} in this world that came from it? Their stats and items are replaced (HP back to full); names you changed stay.</p>`,
    rejectClose: false
  });
  if (!ok) return;
  let n = 0;
  for (const a of list) if (await refreshFromBestiary(a, { quiet: true })) n++;
  ui.notifications.info(`${n} monster${n === 1 ? "" : "s"} updated from the Bestiary.`);
}

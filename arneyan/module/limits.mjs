/**
 * What a player can add to their own character (Kieran, 22 Oct 2026): no spell above the highest spell level they can
 * cast, and no class feature above their level in that class (or from a class they don't have). The GM can add
 * anything; what the system grants itself (levelling up, kits, imports) isn't stopped.
 */
import { ARNEYAN } from "./config.mjs";

const named = (n, want) => { n = String(n ?? "").toLowerCase(); return n === want || n.startsWith(`${want} `); };

/**
 * The highest spell level this character has slots for (0: cantrips only; -1: no casting class): in the spell's own
 * class when it has one ("Cleric" matches "Cleric (Battle Priest)"), else in any.
 */
export function highestSpellLevel(actor, spell = null) {
  let casters = actor?.system?.casters ?? [];
  if (!casters.length) return -1;
  const want = [spell?.className, ...(spell?.classes ?? [])].filter(Boolean).map(n => String(n).toLowerCase());
  const mine = want.length ? casters.filter(c => want.some(w => named(c.name, w))) : [];
  if (mine.length) casters = mine;
  let top = 0;
  for (const c of casters) (c.slots ?? []).forEach((sl, n) => { if (n > top && (Number(sl?.total) || 0) > 0) top = n; });
  return top;
}

/** The character's level in a class, by name (0 without it). */
export function classLevel(actor, name) {
  const want = String(name ?? "").trim().toLowerCase();
  if (!want) return 0;
  const cls = actor?.items?.find?.(i => i.type === "class" && named(i.name, want));
  return Number(cls?.system?.levels) || 0;
}

/** Why a player can't add this item to this character, or "" if they can. */
export function blockedReason(actor, data) {
  if (actor?.type !== "character") return "";
  const type = data?.type, s = data?.system ?? {};
  if (type === "spell") {
    const lvl = Number(s.level) || 0;
    const top = highestSpellLevel(actor, s);
    if (top < 0) return `${actor.name} has no spellcasting class to cast ${data.name}.`;
    if (lvl > top) return `${data.name} is a ${ARNEYAN.spellLevels?.[lvl] ?? lvl}-level spell; ${actor.name} can cast ${top ? `up to ${ARNEYAN.spellLevels?.[top] ?? top} level` : "cantrips only"}.`;
    return "";
  }
  if (type === "ability" && s.kind === "class" && s.className && !data?.flags?.arneyan?.grantedBy) {
    // A kit's features carry the kit's name: the kit's own grants are left to it.
    if (actor.items?.some?.(i => i.type === "kit" && named(i.name, String(s.className).toLowerCase()))) return "";
    const have = classLevel(actor, s.className);
    if (!have) return `${data.name} is a ${s.className} feature, and ${actor.name} isn't a ${s.className}.`;
    if ((Number(s.level) || 1) > have) return `${data.name} comes at ${s.className} level ${s.level}; ${actor.name} is level ${have}.`;
  }
  return "";
}

/** Granted by the system itself (level up, a kit, an import, a transfer), not dropped on by a player. */
// (Not keepId: Foundry's own drop on a sheet passes it, and that's exactly what's being checked.)
const granted = options => !!(options?.arneyanGrant || options?.arneyanImport || options?.arneyanKeepLevel || options?.arneyanContents || options?.arneyanTransform);

export function registerLimits() {
  Hooks.on("preCreateItem", (item, data, options, userId) => {
    if (userId !== game.user.id || game.user.isGM || granted(options)) return;
    const why = blockedReason(item.parent, item.toObject?.() ?? data);
    if (!why) return;
    ui.notifications.warn(`${why} Only the GM can add it.`);
    return false;
  });
}

/**
 * Regeneration, read from the creature's own Regeneration text (M&T): how much it regains at the start of its
 * turn, and the damage types that stop it for a turn. Nothing here touches Foundry, so it can be tested alone.
 */

const DAMAGE = ["fire", "acid", "radiant", "cold", "lightning", "necrotic", "poison", "thunder", "force", "psychic"];

const plain = html => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/**
 * { amount, stops: [damage types], otherStops: bool, rises: bool } from a Regeneration description, or null when it
 * can't be done automatically (no flat amount, or it depends on what wounded it: "does not work against silver").
 */
export function regenOf(html) {
  const t = plain(html);
  const m = t.match(/\bregains?\s+(\d+)\s*(?:HP|hit points)\b/i);
  if (!m || !(Number(m[1]) > 0)) return null;
  if (/\b(?:does not|doesn't|do not) work against\b/i.test(t)) return null;
  // The stopping clause ("fire or acid damage stops the regeneration", "this stops for 1 round if it takes radiant").
  const stopText = t.split(/(?<=[.;])\s*/).filter(s => /\bstops?\b/i.test(s)).join(" ");
  const stops = DAMAGE.filter(w => new RegExp(`\\b${w}\\b`, "i").test(stopText));
  return {
    amount: Number(m[1]), stops,
    otherStops: /running water|holy water|sunlight/i.test(stopText),
    rises: /\brises again\b/i.test(t)
  };
}

/** The creature's Regeneration item (an ability named for it) and what it does, or null. */
export function regenFor(actor) {
  const item = actor?.items?.find?.(i => /^regenerat/i.test(i.name ?? ""));
  if (!item) return null;
  const r = regenOf(item.system?.description);
  return { item, regen: r };
}

/** The first damage type in a hit that stops this regeneration, or "". */
export function stoppingType(regen, taken) {
  if (!regen?.stops?.length) return "";
  const hit = (taken ?? []).find(p => (Number(p.amount) || 0) > 0 && regen.stops.includes(String(p.type ?? "").toLowerCase()));
  return hit ? String(hit.type).toLowerCase() : "";
}

/**
 * What happens at the start of the creature's turn: { heal, stopped, reason }.
 * `hp` is { value, max }; `stoppedBy` is the damage type that stopped it since its last turn ("" if none).
 * It only works while the creature has at least 1 HP (a fallen troll rising is the GM's call), never past its max.
 */
export function regenStep(regen, hp, stoppedBy = "") {
  if (!regen) return { heal: 0, stopped: false, reason: "" };
  const value = Number(hp?.value) || 0, max = Number(hp?.max) || 0;
  if (stoppedBy) return { heal: 0, stopped: true, reason: stoppedBy };
  if (value < 1) return { heal: 0, stopped: false, reason: "down" };
  const heal = Math.max(0, Math.min(regen.amount, max - value));
  return { heal, stopped: false, reason: heal ? "" : "full" };
}

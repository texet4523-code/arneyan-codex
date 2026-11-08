/**
 * How many attacks one use of a weapon makes: a monster's "Claw ×2" or "2 attacks" in its traits (M&T).
 * Capped at 10, so a typo can't flood the chat.
 */
export function attacksOf(item) {
  if (item?.type !== "weapon") return 1;
  const name = String(item.name ?? "");
  const traits = String(item.system?.traits ?? "");
  const fromName = Number(name.match(/(?:^|\s)[×x]\s?(\d+)\s*$/i)?.[1] ?? 0);
  const fromTraits = Number(traits.match(/\b(\d+)\s+attacks\b/i)?.[1] ?? 0);
  const n = Math.max(fromName, fromTraits, 1);
  return Math.min(n, 10);
}

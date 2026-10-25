/**
 * Passive awareness and hiding tiers (books v0.10.10, K2: Codex Disengage & Hide, Surprise Rounds). Pure functions,
 * used by the data models (the sheets show passive awareness) and by stealth.mjs (Hide, Search, surprise).
 *
 * - Passive awareness: 10 + Wisdom modifier; +5 if the creature would have Advantage on the check (Master in
 *   Perception, or a feature: `adv.awareness`), -5 with Disadvantage (a condition such as Poisoned). Advantage and
 *   Disadvantage cancel, as for any roll. `awareness` rules add a flat bonus.
 * - For surprise only: `surprise` rules add (Combat Sense, Survival Instincts, Sixth Sense) and `adv.surprise` counts as
 *   Advantage; an ambusher's `surprise.against` (the Assassin's Surprise) lowers the targets' awareness.
 * - Hide: a Dexterity (Stealth) check. 12-14 Partially Hidden (Search DC 12), 15-19 Hidden (DC 15), 20+ Completely
 *   Hidden (DC 20); under 12 not hidden.
 */

export const HIDE_TIERS = [
  { min: 20, id: "hiddenComplete", label: "Completely Hidden", dc: 20, beats: ["darkvision", "tremorsense", "blindsight", "truesight"],
    holds: "while lightly or heavily obscured or behind any cover" },
  { min: 15, id: "hiddenFull", label: "Hidden", dc: 15, beats: ["darkvision", "tremorsense"],
    holds: "while lightly or heavily obscured or behind any cover" },
  { min: 12, id: "hiddenPartial", label: "Partially Hidden", dc: 12, beats: ["darkvision"],
    holds: "only while heavily obscured or behind three-quarters or total cover" }
];
export const HIDE_IDS = HIDE_TIERS.map(t => t.id);
export const SENSES = ["darkvision", "tremorsense", "blindsight", "truesight"];

/** The tier a Hide result reaches, or null under 12. */
export function hideTier(total) {
  const n = Number(total);
  return Number.isFinite(n) ? HIDE_TIERS.find(t => n >= t.min) ?? null : null;
}
export const tierById = id => HIDE_TIERS.find(t => t.id === id) ?? null;

/** Advantage (+1), Disadvantage (-1) or neither (0) from sources of each: any of both cancels. */
export function netAdv(adv = 0, dis = 0) {
  return adv > 0 && dis > 0 ? 0 : adv > 0 ? 1 : dis > 0 ? -1 : 0;
}

const isPerception = i => i?.type === "skill" && /^perception$/i.test(String(i.name ?? "").trim());
/** A Perception skill rolled with Advantage: Master (a monster's stat block), or a Knack. */
export function perceptionMaster(items = []) {
  return [...items].some(i => isPerception(i) && (i.system?.tier === "master" || i.system?.tier === "knack" || !!i.flags?.arneyan?.knack));
}
export const hasPerception = (items = []) => [...items].some(isPerception);

/**
 * Passive awareness for prepared data.
 * @param {object} s      The actor's system data (abilities prepared).
 * @param {ModSet} mods   Its rules.
 * @param {Iterable} items Its items (for a Master Perception skill).
 * @returns {{value:number, parts:object[], adv:string[], dis:string[], net:number, notes:string[]}}
 */
export function awarenessOf(s, mods, items = []) {
  const wis = Number(s?.abilities?.wis?.mod) || 0;
  // Advantage on the check it would make: a Wisdom check, or its Perception skill (which also takes adv.skill).
  const keys = ["adv.awareness", "adv.check", "adv.check.wis", ...(hasPerception(items) ? ["adv.skill"] : [])];
  const a = mods?.adv?.(...keys) ?? { adv: [], dis: [] };
  const adv = [...a.adv];
  if (perceptionMaster(items)) adv.push("Perception (Master or Knack)");
  const dis = [...a.dis];
  const net = netAdv(adv.length, dis.length);
  const parts = [{ label: "Base", value: 10 }, { label: "Wis", value: wis }];
  if (net > 0) parts.push({ label: `Advantage (${adv.join(", ")})`, value: 5 });
  if (net < 0) parts.push({ label: `Disadvantage (${dis.join(", ")})`, value: -5 });
  parts.push(...(mods?.parts?.("awareness") ?? []));
  // Situational reminders that bear on noticing (watch duty, smell, low light...).
  const notes = (mods?.situational ?? []).filter(x => /percept|notic|surpris|ambush|watch|sentry/i.test(x.text)).map(x => x.text);
  return { value: parts.reduce((t, p) => t + p.value, 0), parts, adv, dis, net, notes };
}

/**
 * Passive awareness against an ambush: the plain value, with Advantage from `adv.surprise` folded in, plus
 * `surprise` bonuses, less the ambushers' `surprise.against`.
 */
export function surpriseAwareness(aw, mods, against = 0) {
  const sAdv = mods?.adv?.("adv.surprise") ?? { adv: [], dis: [] };
  const adv = aw.adv.length + sAdv.adv.length, dis = aw.dis.length + sAdv.dis.length;
  const net = netAdv(adv, dis);
  const base = aw.value - 5 * aw.net + 5 * net;
  const bonus = mods?.sum?.("surprise") ?? 0;
  return { value: base + bonus - (Number(against) || 0), bonus, against: Number(against) || 0, net };
}

/** The special senses a creature has, from its senses text ("Darkvision 60ft, Tremorsense 30ft"). */
export function sensesOf(text = "") {
  const t = String(text ?? "").toLowerCase();
  return SENSES.filter(k => t.includes(k));
}

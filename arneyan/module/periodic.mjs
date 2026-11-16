/**
 * Per-week and per-month uses come back with the game clock (Kieran, 16 Nov 2026). A feature whose uses are "per week"
 * or "per month" (Cleanse Soul, Sanctuary of Song, Divine Intervention, Divine Will) notes the game time of its first
 * use since it was full; 7 or 30 game days later its uses are full again. An option with its own weekly or monthly
 * count already works this way (documents.mjs `_ownCount`). The active GM's client does the work.
 */
const SYS = "arneyan";
export const PERIOD_DAYS = { week: 7, month: 30 };

/**
 * What a feature's uses need at this game time (seconds): null (nothing), { mark } (not full, first seen now: note the
 * time), { restore: true } (its span has passed: fill it) or { clear: true } (full again by hand: forget the time). Pure.
 */
export function periodStep({ per, value, max, since } = {}, now = 0) {
  const span = PERIOD_DAYS[per];
  if (!span || !(Number(max) > 0)) return null;
  const has = since !== null && since !== undefined && Number.isFinite(Number(since));
  if (Number(value) >= Number(max)) return has ? { clear: true } : null;
  if (!has) return { mark: now };
  return now - Number(since) >= span * 86400 ? { restore: true } : null;
}

const gmHere = () => !!(game.users?.activeGM ? game.users.activeGM.isSelf : game.user?.isGM);

/** One item's step, written to the item. Returns its name when its uses came back. */
async function stepItem(item, now) {
  const u = item.system?.uses;
  if (!u || !PERIOD_DAYS[u.per]) return null;
  const step = periodStep({ per: u.per, value: u.value, max: u.max, since: item.getFlag(SYS, "usesSince") }, now);
  if (!step) return null;
  if (step.mark !== undefined) await item.setFlag(SYS, "usesSince", step.mark);
  else if (step.clear) await item.unsetFlag(SYS, "usesSince");
  else if (step.restore) {
    await item.update({ "system.uses.value": u.max, [`flags.${SYS}.-=usesSince`]: null });
    return item.name;
  }
  return null;
}

/** Every world actor's weekly and monthly features at this game time; one whispered card names what came back. */
export async function stepPeriodicUses(now = game.time.worldTime) {
  const back = [];
  for (const actor of game.actors ?? []) {
    for (const item of actor.items.filter(i => ["ability", "feat"].includes(i.type) && PERIOD_DAYS[i.system?.uses?.per])) {
      const name = await stepItem(item, now).catch(err => (console.warn(`Arneyan | ${item.name}: weekly or monthly uses`, err), null));
      if (name) back.push(`${actor.name}: ${name}`);
    }
  }
  if (back.length) {
    const esc = s => foundry.utils.escapeHTML(String(s));
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ alias: "Game time" }), whisper: game.users.filter(u => u.isGM).map(u => u.id),
      content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-hourglass-end"></i> <span>Ready again</span></header><p>Their week or month has passed:</p><ul>${back.map(b => `<li>${esc(b)}</li>`).join("")}</ul></div>` });
  }
  return back;
}

export function registerPeriodicUses() {
  let lastHour = null;
  Hooks.on("updateWorldTime", worldTime => {
    if (!gmHere()) return;
    const hour = Math.floor(worldTime / 3600);
    if (hour === lastHour) return;
    lastHour = hour;
    stepPeriodicUses(worldTime).catch(err => console.warn("Arneyan | weekly and monthly uses", err));
  });
  // A use spent (or put back by hand): its time is noted, or forgotten, at once.
  Hooks.on("updateItem", (item, changes) => {
    if (!gmHere() || !item.parent || foundry.utils.getProperty(changes, "system.uses.value") === undefined) return;
    stepItem(item, game.time.worldTime).catch(err => console.warn("Arneyan | weekly and monthly uses", err));
  });
  Hooks.once("ready", () => { if (gmHere()) stepPeriodicUses().catch(err => console.warn("Arneyan | weekly and monthly uses", err)); });
}

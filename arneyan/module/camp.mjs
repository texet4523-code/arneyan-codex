/**
 * Camp and foraging (batch 6, Kieran 22 Oct 2026). Every check here is a button the player (or the GM) presses: the
 * roll is theirs, nothing resolves on its own.
 *
 * Foraging: during travel at Slow pace, or as a camp activity, a Survival check at DC 12 finds 1d4 Day's Rations, plus
 * one for every 5 by which the check beats the DC. Each character forages once a day.
 */
const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const FORAGE_DC = 12;
/** The Day's Rations item in the system's equipment compendium. */
export const RATION_UUID = `Compendium.${SYS}.equipment.Item.7ou5GBNDo9o4VQKz`;

/** Rations a successful forage finds before the 1d4: one more for every 5 the check beats the DC by. */
export const forageBonus = (total, dc = FORAGE_DC) => (Number(total) >= dc ? Math.floor((Number(total) - dc) / 5) : 0);

/** The skill item an actor has for a check, from a list of names in order of preference (null if untrained). */
export function skillFor(actor, names = []) {
  const items = (actor?.items ?? []).filter(i => i.type === "skill");
  for (const n of names) {
    const key = String(n).toLowerCase();
    const hit = items.find(i => i.name.toLowerCase() === key || i.name.toLowerCase().startsWith(`${key} `) || i.name.toLowerCase().startsWith(`${key}/`));
    if (hit) return hit;
  }
  return null;
}

/**
 * A camp or travel check: the first of `skills` the actor is trained in, else (with `ability`) that attribute's check,
 * else the untrained plain d20. Returns the roll's chat message.
 */
export function campCheck(actor, { skills = [], ability = "", dc = null, title = "" } = {}, event = null) {
  if (!actor) return null;
  const skill = skills.length ? skillFor(actor, skills) : null;
  if (skill) return actor.rollSkill(skill, event, { dc, title });
  if (ability) return actor.rollAbility(ability, event, { dc, title });
  return actor.rollSkill(null, event, { dc, title });
}

/** The character this user acts for: the selected token's, else the user's own, else the one member they own. */
export function myCharacter(members = []) {
  const isMember = a => !!a && members.some(m => m.id === a.id);
  const controlled = globalThis.canvas?.tokens?.controlled?.map(t => t.actor).find(a => a?.type === "character" && a.isOwner && isMember(a));
  if (controlled) return controlled;
  if (game.user.character?.isOwner && isMember(game.user.character)) return game.user.character;
  // A player who owns exactly one member: that one. The GM (who owns them all) is asked.
  const owned = game.user.isGM ? [] : members.filter(m => m.isOwner);
  return owned.length === 1 ? owned[0] : null;
}

/** Ask which member when this user could mean several (the GM, or a player with two characters). */
export async function pickMember(members, title) {
  const mine = myCharacter(members);
  if (mine) return mine;
  const choices = members.filter(m => m.isOwner);
  if (!choices.length) { ui.notifications.warn("You don't control any of the party's characters."); return null; }
  if (choices.length === 1) return choices[0];
  const { DialogV2 } = foundry.applications.api;
  const id = await DialogV2.wait({ window: { title }, classes: ["arneyan"], position: { width: 340 },
    content: `<label class="arn-field">Who? <select name="who">${choices.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select></label>`,
    buttons: [{ action: "ok", label: "Roll", default: true, callback: (ev, btn) => btn.form.querySelector("select[name=who]")?.value }, { action: "cancel", label: "Cancel" }],
    rejectClose: false });
  return choices.find(m => m.id === id) ?? null;
}

/**
 * The day a check belongs to, as a key: the calendar day, counted from a boundary hour instead of midnight. Foraging
 * and hunting go from dawn to dawn (6am: an evening's forage and the night in camp are the same day); a night (the
 * night's Encounter Check, Scout the camp) from noon to noon, so a check at 06:30 still belongs to the night just gone.
 */
export function dayKey(w, boundaryHour = 6) {
  return String(w.secondOfDay < boundaryHour * 3600 ? w.n - 1 : w.n);
}
export async function today(boundaryHour = 6) {
  try { const { whenOf } = await import("./calendar.mjs"); return dayKey(whenOf(), boundaryHour); } catch { return "0"; }
}

/** How many stand watch: the tab's choice, never more than the members (1 to 5). */
export function onWatchOf(camp, members = []) {
  const most = Math.max(1, Math.min(5, members.length || 1));
  return Math.max(1, Math.min(most, Number(camp?.onWatch) || most));
}

/** Rolls in progress (a double click doesn't roll twice). */
const busy = new Set();

/**
 * A finding check (Forage, Hunt): once per character per calendar day, marked before the roll. The roll card gets a
 * Collect button that reads the roll as it stands when pressed (so Luck burned on it counts): on a success, `die`
 * Day's Rations, plus one for every 5 over the DC, into the character's pack.
 */
async function findFood(actor, { kind, label, skills, die, icon, nothing }, event) {
  if (!actor?.isOwner) return null;
  const day = await today();
  const flag = kind === "hunt" ? "hunted" : "foraged";
  if (actor.getFlag(SYS, flag) === day || busy.has(`${actor.id}.${kind}`)) return ui.notifications.info(`${actor.name} has already ${kind === "hunt" ? "hunted" : "foraged"} today.`);
  busy.add(`${actor.id}.${kind}`);
  try {
    await actor.setFlag(SYS, flag, day);
    const msg = await campCheck(actor, { skills, dc: FORAGE_DC, title: label }, event);
    if (!msg) return null;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="arn-card"><p><i class="fa-solid ${icon}"></i> ${esc(actor.name)}'s ${esc(label.toLowerCase())}: on a success, ${die} Day's Rations, +1 for every 5 over DC ${FORAGE_DC}. Burn Luck on the roll first if you want to.</p>
        <div class="arn-card-buttons"><button type="button" class="arn-food-collect" data-actor="${esc(actor.uuid)}" data-roll="${esc(msg.id)}" data-die="${die}" data-nothing="${esc(nothing)}"><i class="fa-solid fa-basket-shopping"></i> Collect</button></div></div>` });
    return msg;
  } finally { busy.delete(`${actor.id}.${kind}`); }
}

/** Forage (a button): Survival at DC 12; 1d4 Day's Rations on a success, +1 per 5 over. Once a calendar day. */
export const forage = (actor, _key, event = null) => findFood(actor, { kind: "forage", label: "Forage", skills: ["Survival"], die: "1d4", icon: "fa-seedling", nothing: "finds nothing to eat" }, event);

/** Collect a finding check's rations (its card's button): reads the roll now, Luck burned included. Once. */
export async function collectFood(button) {
  const actor = await fromUuid(button.dataset.actor).catch(() => null);
  const roll = game.messages.get(button.dataset.roll);
  if (!actor?.isOwner) return ui.notifications.warn("Only the character's owner collects.");
  if (!roll) return ui.notifications.warn("The roll is gone from the chat.");
  const key = `collected.${roll.id}`;
  const done = [].concat(actor.getFlag(SYS, "collected") ?? []);
  if (done.includes(roll.id) || busy.has(key)) return;
  busy.add(key);
  try {
    // Every roll collected (the last 50), so collecting one never re-opens another.
    await actor.setFlag(SYS, "collected", [...done, roll.id].slice(-50));
    const f = roll.flags?.[SYS] ?? {};
    const total = (Number(f.total) || 0) + (Number(f.luckBurned) || 0);
    if (f.autoFail || f.natural === 1 || total < FORAGE_DC) {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card"><p>${esc(actor.name)} ${esc(button.dataset.nothing || "finds nothing")}.</p></div>` });
      return 0;
    }
    const r = await new Roll(button.dataset.die || "1d4").evaluate();
    const found = r.total + forageBonus(total);
    try { await addRations(actor, found); } catch (err) {
      // Nothing was added: the roll can be collected again.
      await actor.setFlag(SYS, "collected", done);
      throw err;
    }
    await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `<div class="arn-card"><p><i class="fa-solid fa-basket-shopping"></i> ${esc(actor.name)} collects <strong>${found} Day's Rations</strong> (${esc(button.dataset.die)}${forageBonus(total) ? ` + ${forageBonus(total)} for beating DC ${FORAGE_DC} by ${total - FORAGE_DC}` : ""}).</p></div>` });
    return found;
  } finally { busy.delete(key); }
}

/** Add Day's Rations to an actor: onto a stack it already carries, else a new one from the compendium. */
export async function addRations(actor, n) {
  if (!(n > 0)) return;
  const have = actor.items.find(i => i.type === "equipment" && /^day'?s rations?/i.test(i.name));
  if (have) return have.update({ "system.quantity": (Number(have.system.quantity) || 0) + n });
  const src = await fromUuid(RATION_UUID).catch(() => null);
  const data = src ? src.toObject() : { name: "Day's Rations", type: "equipment", system: {} };
  delete data._id;
  data.system = { ...(data.system ?? {}), quantity: n };
  return actor.createEmbeddedDocuments("Item", [data]);
}

/* -------------------------------------------- */
/*  Camp mode (batch 6b): the party's Camp tab  */
/* -------------------------------------------- */

/**
 * Watches run from 10pm to 6am (Kieran), split by how many are on watch: 1 or 2 take 4 hours each (one alone takes the
 * whole night), 3 take 2 h 40 m, 4 take 2 hours; with 5, four 2-hour watches and one of them a pair. The Codex: a long
 * rest is 8 hours in each 24 and needn't be in one go, so a watch doesn't spoil anyone's rest.
 */
export const NIGHT_START = 22 * 60;          // minutes after midnight
export const NIGHT_MINUTES = 8 * 60;

/** How many watches the night has for this many on watch. */
export const watchCount = n => Math.max(1, Math.min(4, Math.floor(Number(n) || 1)));

/** The watches for `n` on watch: [{ index, start, end, minutes }] (start and end in minutes after midnight). */
export function watchSlots(n) {
  const k = n <= 1 ? 1 : watchCount(n);
  const len = NIGHT_MINUTES / k;
  return Array.from({ length: k }, (_, i) => ({ index: i, start: (NIGHT_START + i * len) % 1440, end: (NIGHT_START + (i + 1) * len) % 1440, minutes: len }));
}

/** "22:00" for minutes after midnight. */
export const hm = m => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;

/** Who stands each watch by default: in order, one each; with five, the fifth joins the first watch (the pair). */
export function defaultWatch(memberIds, n) {
  const on = memberIds.slice(0, Math.max(1, Math.min(5, n)));
  // One list per watch of the night, whoever is there to stand it (an empty watch when there are too few).
  const slots = watchSlots(Math.max(1, Math.min(5, n)));
  const out = slots.map((_, i) => (on[i] ? [on[i]] : []));
  if (on.length === 5) out[0].push(on[4]);
  return out;
}

/** Where the night stands at a time of day: { night, index (the watch now), into (minutes into the night) }. */
export function nightAt(minuteOfDay, k) {
  const into = (((minuteOfDay - NIGHT_START) % 1440) + 1440) % 1440;
  if (into >= NIGHT_MINUTES) return { night: false, index: -1, into };
  return { night: true, index: Math.min(k - 1, Math.floor(into / (NIGHT_MINUTES / k))), into };
}

/** Minutes to move the clock for Next watch (+) or Previous watch (-), or 0 when there is nowhere to go. */
export function watchMove(minuteOfDay, k, dir) {
  const len = NIGHT_MINUTES / k;
  const { night, index, into } = nightAt(minuteOfDay, k);
  if (dir > 0) {
    if (!night) return 1440 - into;                                        // on to 10pm
    return Math.min(NIGHT_MINUTES, (index + 1) * len) - into;              // the next watch, or 6am after the last
  }
  if (!night) return into < NIGHT_MINUTES + 30 ? (NIGHT_MINUTES - len) - into : 0; // just after 6am: back to the last watch
  const start = index * len;
  if (into > start + 0.5) return start - into;                              // back to the start of this watch
  return index > 0 ? (index - 1) * len - into : 0;                          // the watch before
}

/** Camp activities (Kieran's list, 22 Oct): each a check the player rolls from its button. */
export const CAMP_ACTIVITIES = [
  { id: "watch", label: "Keep watch", check: "Perception (a Wisdom check)", ability: "wis", skills: [], icon: "fa-eye",
    text: "Spot trouble before it reaches the camp. The night's Encounter Check falls in one watch: the watch's passive awareness against the comers' Search DC decides surprise (books v0.10.10), or the watch actively Searches (a Wisdom check)." },
  { id: "forage", label: "Forage", check: "Survival, DC 12", skills: ["Survival"], dc: FORAGE_DC, icon: "fa-seedling",
    text: "1d4 Day's Rations on a success, +1 for every 5 over. Once a day." },
  { id: "hunt", label: "Hunt", check: "Hunting or Survival, DC 12", skills: ["Hunting", "Survival"], dc: FORAGE_DC, icon: "fa-crosshairs", needsGear: true,
    text: "The better yield: 1d6 Day's Rations on a success, +1 for every 5 over. Needs a ranged weapon or traps. Once a day." },
  { id: "cook", label: "Cook", check: "Cooking", skills: ["Cooking"], ability: "", icon: "fa-fire-burner",
    text: "A good meal: on a success the GM may give the party a small bonus tomorrow." },
  { id: "tend", label: "Tend wounds", check: "First Aid/Healing", skills: ["First Aid"], icon: "fa-kit-medical",
    text: "Care for the wounded and the dying." },
  { id: "repair", label: "Repair gear", check: "the relevant craft", skills: ["Armourer", "Weaponsmithing", "Blacksmithing", "Leatherworking", "Bowyer/Fletcher", "Carpentry", "Cobbling", "Weaving"], icon: "fa-hammer",
    text: "Mend armour, weapons and kit with the craft you know (the first one listed that you have)." },
  { id: "scout", label: "Scout the camp", check: "a Wisdom check", ability: "wis", skills: [], icon: "fa-binoculars", oncePerCamp: true,
    text: "Once a camp: walk the ground around it. A success gives the watch a bonus tonight (the GM's call)." },
  { id: "make", label: "Make camp", check: "Fire-building", skills: ["Fire-building"], icon: "fa-campground",
    text: "Pitch the camp and get a fire going." }
];

export const DEFAULT_CAMP = { mode: false, onWatch: 0, checked: "", log: [], assign: {} };

/**
 * Batch 6c: the menu puts each member on a watch and an activity (camp.assign[memberId] = { watch: "1".., job: id }).
 * Who stands each watch: as assigned when anyone is, else in order (defaultWatch). Watches past the night's count are
 * left out.
 */
export function watchList(camp, members, n) {
  const k = watchSlots(n).length;
  const assign = camp?.assign ?? {};
  const ids = members.map(m => m.id);
  const any = ids.some(id => Number(assign[id]?.watch) >= 1);
  if (!any) return defaultWatch(ids, n);
  const out = Array.from({ length: k }, () => []);
  for (const id of ids) {
    const w = Number(assign[id]?.watch);
    if (w >= 1 && w <= k) out[w - 1].push(id);
  }
  return out;
}

/** Members on an activity in the menu. */
export const onJob = (camp, members, job) => members.filter(m => camp?.assign?.[m.id]?.job === job);
export const campState = party => ({ ...DEFAULT_CAMP, ...(party?.flags?.[SYS]?.camp ?? {}) });

/** Does an actor carry what hunting needs: a ranged weapon, or traps or snares? */
export const canHunt = actor => (actor?.items ?? []).some(i => (i.type === "weapon" && i.system?.ranged) || /\b(trap|snare)s?\b/i.test(i.name));

/** Everything the Camp tab shows. `minute` is the time of day (minutes after midnight). */
export function campContext(party, members = [], minute = 0) {
  const c = campState(party);
  const n = onWatchOf(c, members);
  const slots = watchSlots(n);
  const who = watchList(c, members, n);
  const now = nightAt(minute, slots.length);
  const assign = c.assign ?? {};
  const watchChoices = { "": "Not on watch", ...Object.fromEntries(slots.map((sl, i) => [String(i + 1), `Watch ${i + 1} (${hm(sl.start)})`])) };
  const jobChoices = { "": "Resting", ...Object.fromEntries(CAMP_ACTIVITIES.filter(a => a.id !== "watch").map(a => [a.id, a.label])) };
  const names = id => members.find(m => m.id === id)?.name ?? "";
  return {
    camp: {
      ...c, onWatch: n, onWatchChoices: Object.fromEntries(Array.from({ length: Math.max(1, Math.min(5, members.length || 1)) }, (_, i) => [i + 1, String(i + 1)])),
      watches: slots.map((s, i) => ({ ...s, label: `Watch ${i + 1}`, time: `${hm(s.start)} to ${hm(s.end)}`, length: hoursMinutes(s.minutes),
        names: who[i].map(names).filter(Boolean).join(" and ") || "nobody", now: now.night && now.index === i })),
      nightNow: now.night, timeNow: hm(minute),
      activities: CAMP_ACTIVITIES.map(a => ({ ...a, who: (a.id === "watch" ? (now.night ? who[now.index] ?? [] : who.flat()) : onJob(c, members, a.id).map(m => m.id)).map(names).filter(Boolean).join(", ") })),
      assigned: members.some(m => assign[m.id]?.watch || assign[m.id]?.job),
      rows: members.map(m => ({ id: m.id, name: m.name, img: m.img, watch: String(assign[m.id]?.watch ?? ""), job: String(assign[m.id]?.job ?? ""), watchChoices, jobChoices })),
      log: [...(c.log ?? [])].reverse().slice(0, 12)
    }
  };
}
const hoursMinutes = m => (m % 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} m` : `${m / 60} h`);

/** Move the clock to the next or previous watch (GM). */
export async function moveWatch(party, members, dir) {
  if (!game.user.isGM) return;
  const { whenOf } = await import("./calendar.mjs");
  const { moveTime } = await import("./realtime.mjs");
  const w = whenOf();
  const c = campState(party);
  const k = watchSlots(onWatchOf(c, members)).length;
  const minute = w.secondOfDay / 60;
  const mins = watchMove(minute, k, dir);
  if (!mins) {
    const { night } = nightAt(minute, k);
    return ui.notifications.info(dir > 0 ? "Already at the next watch." : night ? "This is the first watch of the night." : "It's daytime: the watches start at 22:00.");
  }
  await moveTime(Math.round(mins * 60));
  rerenderCamp({ force: true });
}

/**
 * The night's Encounter Check (GM, secret, once a night): a d12, 11 a Hard Encounter, 12 a Deadly one; if something
 * comes, a die picks the watch it comes in, and the card has a button to ask that watch for Perception.
 */
export async function nightCheck(party, members) {
  if (!game.user.isGM) return;
  const { whenOf } = await import("./calendar.mjs");
  const w = whenOf();
  // The night belongs to the evening it starts: before 6am it's still the night before.
  const nightKey = dayKey(w, 12);
  const c = campState(party);
  if (c.checked === nightKey) return ui.notifications.info("Tonight's Encounter Check is already rolled.");
  const n = onWatchOf(c, members);
  const slots = watchSlots(n);
  const who = watchList(c, members, n);
  const r = await new Roll("1d12").evaluate();
  const what = r.total >= 12 ? "a Deadly Encounter" : r.total === 11 ? "a Hard Encounter" : "";
  let body = `<p>d12: ${r.total}: ${what || "the night passes quietly"}.</p>`;
  if (what) {
    const pick = await new Roll(`1d${slots.length}`).evaluate();
    const i = pick.total - 1;
    const watchers = who[i];
    const names = watchers.map(id => members.find(m => m.id === id)?.name).filter(Boolean);
    const aware = watchers.map(id => members.find(m => m.id === id)).filter(Boolean).map(m => `${esc(m.name)} ${m.system?.attributes?.awareness?.value ?? "?"}`);
    body += `<p>It comes during <strong>watch ${i + 1}</strong> (${hm(slots[i].start)} to ${hm(slots[i].end)}, d${slots.length}: ${pick.total}), on ${esc(names.join(" and ") || "nobody")}'s watch.</p>
      ${aware.length ? `<p>Passive awareness: ${aware.join(", ")}. A watcher who meets the comers' lowest Search DC (or Moderate 12 / Hard 15 if they weren't hiding) isn't surprised; the Surprise check in the token tools works it out. Or rule on it from the camp's precautions.</p>` : ""}
      <div class="arn-card-buttons"><button type="button" class="arn-camp-askwatch" data-party="${esc(party.id)}" data-watchers="${esc(watchers.join(","))}" data-watch="${i + 1}"><i class="fa-solid fa-eye"></i> Ask the watch to Search</button></div>`;
  }
  await party.update({ [`flags.${SYS}.camp`]: { ...c, checked: nightKey, log: [...(c.log ?? []), `Night Encounter Check: ${r.total}${what ? ` (${what})` : ""}.`].slice(-30) } });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: party }), whisper: game.users.filter(u => u.isGM).map(u => u.id), rolls: [r],
    content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-moon"></i> <span>Night Encounter Check (secret)</span></header>${body}</div>` });
}

/** The watch's Perception (public card): a button each watcher presses to roll their own Wisdom check. */
export async function askWatch(party, watcherIds, watch) {
  if (!game.user.isGM) return;
  const names = watcherIds.map(id => game.actors.get(id)?.name).filter(Boolean);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: party }),
    content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-eye"></i> <span>Watch ${watch}: Search</span></header>
      <p>${esc(names.join(" and ") || "The watch")}: something's out there. Search (a Wisdom check, Perception) to spot it against its Search DC.</p>
      <div class="arn-card-buttons"><button type="button" class="arn-camp-perception" data-watchers="${esc(watcherIds.join(","))}"><i class="fa-solid fa-eye"></i> Search</button></div></div>` });
}

/** A camp activity's button: the user's character rolls it. */
export async function doActivity(party, members, id, event = null) {
  const a = CAMP_ACTIVITIES.find(x => x.id === id);
  if (!a) return;
  // Those the menu put on it (keeping watch: whoever stands the watch now, else anyone on watch), else anyone.
  const c = campState(party);
  let pool = onJob(c, members, id);
  if (id === "watch") {
    const { whenOf } = await import("./calendar.mjs");
    const n = onWatchOf(c, members);
    const list = watchList(c, members, n);
    const now = nightAt(whenOf().secondOfDay / 60, list.length);
    const ids = now.night ? (list[now.index] ?? []) : list.flat();
    pool = members.filter(m => ids.includes(m.id));
  }
  if (pool.length && !game.user.isGM && !pool.some(m => m.isOwner)) return ui.notifications.warn(`${a.label} is ${pool.map(m => m.name).join(" and ")}'s to roll tonight.`);
  const who = await pickMember(pool.length ? pool : members, a.label);
  if (!who) return;
  const { whenOf } = await import("./calendar.mjs");
  const day = String(whenOf().n);
  if (a.id === "forage") return forage(who, day, event);
  if (a.id === "hunt") {
    if (!canHunt(who)) return ui.notifications.warn(`${who.name} needs a ranged weapon or traps to hunt.`);
    return hunt(who, day, event);
  }
  if (a.oncePerCamp) {
    const key = `${party.id}.${id}.${dayKey(whenOf(), 12)}`;
    if (who.getFlag(SYS, `camp-${id}`) === key) return ui.notifications.info(`${who.name} has already done that at this camp.`);
    await who.setFlag(SYS, `camp-${id}`, key);
  }
  return campCheck(who, { skills: a.skills, ability: a.ability, dc: a.dc ?? null, title: a.label }, event);
}

/** Hunt: Hunting (or Survival) at DC 12; 1d6 Day's Rations on a success, +1 per 5 over. Once a calendar day. */
export const hunt = (actor, _key, event = null) => findFood(actor, { kind: "hunt", label: "Hunt", skills: ["Hunting", "Survival"], die: "1d6", icon: "fa-crosshairs", nothing: "comes back empty-handed" }, event);

/** Re-draw open party sheets showing the Camp tab (the time and the watch now have moved). */
let redraw = null;
export function rerenderCamp({ force = false } = {}) {
  clearTimeout(redraw);
  redraw = setTimeout(async () => {
    let minute = 0;
    try { const { whenOf } = await import("./calendar.mjs"); minute = whenOf().secondOfDay / 60; } catch { /* no clock */ }
    const { partyMembers } = await import("./party.mjs");
    const members = partyMembers();
    for (const app of foundry.applications?.instances?.values?.() ?? []) {
      if (app.document?.type !== "party" || app._activeTab !== "camp" || !app.rendered) continue;
      // Only when the watch changes (the running clock saves every few seconds; a redraw would close an open drop-down).
      const k = watchSlots(onWatchOf(campState(app.document), members)).length;
      const now = nightAt(minute, k);
      const key = `${now.night}.${now.index}`;
      if (!force && app._campWatchKey === key) continue;
      app._campWatchKey = key;
      app.render();
    }
  }, 250);
}

/** The camp's chat buttons (the watch's Perception), and the tab's clock. */
export function registerCamp() {
  Hooks.on("updateWorldTime", rerenderCamp);
  Hooks.on("arneyanDateChanged", rerenderCamp);
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const ask = html.querySelector?.(".arn-camp-askwatch");
    if (ask) ask.addEventListener("click", ev => {
      ev.currentTarget.disabled = true;
      const party = game.actors.get(ask.dataset.party);
      if (party) askWatch(party, String(ask.dataset.watchers || "").split(",").filter(Boolean), ask.dataset.watch);
    });
    const col = html.querySelector?.(".arn-food-collect");
    if (col) col.addEventListener("click", ev => { ev.currentTarget.disabled = true; collectFood(col); });
    const per = html.querySelector?.(".arn-camp-perception");
    if (per) per.addEventListener("click", async ev => {
      per.disabled = true;
      setTimeout(() => { per.disabled = false; }, 3000);
      const watchers = String(per.dataset.watchers || "").split(",").map(id => game.actors.get(id)).filter(Boolean);
      const who = await pickMember(watchers, "Perception");
      if (who) await (await import("./stealth.mjs")).rollSearch(who, ev);
    });
  });
}

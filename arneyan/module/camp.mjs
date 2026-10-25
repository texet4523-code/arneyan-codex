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
 * Forage (a button): the character's Survival check at DC 12; on a success, 1d4 Day's Rations (+1 per 5 over) go into
 * their pack. Once a day for each character (`key` names the day: "<party id>.<day>").
 */
export async function forage(actor, key, event = null) {
  if (!actor?.isOwner) return null;
  if (key && actor.getFlag(SYS, "foraged") === key) return ui.notifications.info(`${actor.name} has already foraged today.`);
  const msg = await campCheck(actor, { skills: ["Survival"], dc: FORAGE_DC, title: "Forage" }, event);
  if (key) await actor.setFlag(SYS, "foraged", key);
  const f = msg?.flags?.[SYS] ?? {};
  const ok = !f.autoFail && f.natural !== 1 && Number(f.total) >= FORAGE_DC;
  if (!ok) {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card"><p><i class="fa-solid fa-seedling"></i> ${esc(actor.name)} finds nothing to eat.</p></div>` });
    return 0;
  }
  const r = await new Roll("1d4").evaluate();
  const found = r.total + forageBonus(f.total);
  await addRations(actor, found);
  await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<div class="arn-card"><p><i class="fa-solid fa-seedling"></i> ${esc(actor.name)} forages <strong>${found} Day's Rations</strong> (1d4${forageBonus(f.total) ? ` + ${forageBonus(f.total)} for beating DC ${FORAGE_DC} by ${Number(f.total) - FORAGE_DC}` : ""}).</p></div>` });
  return found;
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
  const slots = watchSlots(on.length);
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
  if (!night) return into === NIGHT_MINUTES ? -len : 0;                     // just after 6am: back to the last watch
  const start = index * len;
  if (into > start + 0.5) return start - into;                              // back to the start of this watch
  return index > 0 ? (index - 1) * len - into : 0;                          // the watch before
}

/** Camp activities (Kieran's list, 22 Oct): each a check the player rolls from its button. */
export const CAMP_ACTIVITIES = [
  { id: "watch", label: "Keep watch", check: "Perception (a Wisdom check)", ability: "wis", skills: [], icon: "fa-eye",
    text: "Spot trouble before it reaches the camp. The night's Encounter Check falls in one watch; that watch's Perception decides surprise." },
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

export const DEFAULT_CAMP = { mode: false, onWatch: 0, checked: "", log: [] };
export const campState = party => ({ ...DEFAULT_CAMP, ...(party?.flags?.[SYS]?.camp ?? {}) });

/** Does an actor carry what hunting needs: a ranged weapon, or traps or snares? */
export const canHunt = actor => (actor?.items ?? []).some(i => (i.type === "weapon" && i.system?.ranged) || /\b(trap|snare)s?\b/i.test(i.name));

/** Everything the Camp tab shows. `minute` is the time of day (minutes after midnight). */
export function campContext(party, members = [], minute = 0) {
  const c = campState(party);
  const n = Math.max(1, Math.min(5, Number(c.onWatch) || Math.min(5, members.length) || 1));
  const slots = watchSlots(n);
  const ids = members.map(m => m.id);
  const who = defaultWatch(ids, n);
  const now = nightAt(minute, slots.length);
  const names = id => members.find(m => m.id === id)?.name ?? "";
  return {
    camp: {
      ...c, onWatch: n, onWatchChoices: Object.fromEntries(Array.from({ length: Math.max(1, Math.min(5, members.length || 1)) }, (_, i) => [i + 1, String(i + 1)])),
      watches: slots.map((s, i) => ({ ...s, label: `Watch ${i + 1}`, time: `${hm(s.start)} to ${hm(s.end)}`, length: hoursMinutes(s.minutes),
        names: who[i].map(names).filter(Boolean).join(" and ") || "nobody", now: now.night && now.index === i })),
      nightNow: now.night, timeNow: hm(minute),
      activities: CAMP_ACTIVITIES.map(a => ({ ...a })),
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
  const k = watchSlots(Math.max(1, Math.min(5, Number(c.onWatch) || Math.min(5, members.length) || 1))).length;
  const minute = w.secondOfDay / 60;
  const mins = watchMove(minute, k, dir);
  if (!mins) return ui.notifications.info(dir > 0 ? "Already at the next watch." : "This is the first watch of the night.");
  await moveTime(Math.round(mins * 60));
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
  const nightKey = String(w.secondOfDay < 6 * 3600 ? w.n - 1 : w.n);
  const c = campState(party);
  if (c.checked === nightKey) return ui.notifications.info("Tonight's Encounter Check is already rolled.");
  const n = Math.max(1, Math.min(5, Number(c.onWatch) || Math.min(5, members.length) || 1));
  const slots = watchSlots(n);
  const who = defaultWatch(members.map(m => m.id), n);
  const r = await new Roll("1d12").evaluate();
  const what = r.total >= 12 ? "a Deadly Encounter" : r.total === 11 ? "a Hard Encounter" : "";
  let body = `<p>d12: ${r.total}: ${what || "the night passes quietly"}.</p>`;
  if (what) {
    const pick = await new Roll(`1d${slots.length}`).evaluate();
    const i = pick.total - 1;
    const watchers = who[i];
    const names = watchers.map(id => members.find(m => m.id === id)?.name).filter(Boolean);
    body += `<p>It comes during <strong>watch ${i + 1}</strong> (${hm(slots[i].start)} to ${hm(slots[i].end)}, d${slots.length}: ${pick.total}), on ${esc(names.join(" and ") || "nobody")}'s watch.</p>
      <div class="arn-card-buttons"><button type="button" class="arn-camp-askwatch" data-party="${esc(party.id)}" data-watchers="${esc(watchers.join(","))}" data-watch="${i + 1}"><i class="fa-solid fa-eye"></i> Ask the watch for Perception</button></div>`;
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
    content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-eye"></i> <span>Watch ${watch}: Perception</span></header>
      <p>${esc(names.join(" and ") || "The watch")}: roll Perception (a Wisdom check) to notice what's coming. The result decides surprise.</p>
      <div class="arn-card-buttons"><button type="button" class="arn-camp-perception" data-watchers="${esc(watcherIds.join(","))}"><i class="fa-solid fa-eye"></i> Roll Perception</button></div></div>` });
}

/** A camp activity's button: the user's character rolls it. */
export async function doActivity(party, members, id, event = null) {
  const a = CAMP_ACTIVITIES.find(x => x.id === id);
  if (!a) return;
  const who = await pickMember(members, a.label);
  if (!who) return;
  const { whenOf } = await import("./calendar.mjs");
  const day = `${party.id}.camp.${whenOf().n}`;
  if (a.id === "forage") return forage(who, day, event);
  if (a.id === "hunt") {
    if (!canHunt(who)) return ui.notifications.warn(`${who.name} needs a ranged weapon or traps to hunt.`);
    return hunt(who, day, event);
  }
  if (a.oncePerCamp) {
    const key = `${party.id}.${id}.${whenOf().n}`;
    if (who.getFlag(SYS, `camp-${id}`) === key) return ui.notifications.info(`${who.name} has already done that at this camp.`);
    await who.setFlag(SYS, `camp-${id}`, key);
  }
  return campCheck(who, { skills: a.skills, ability: a.ability, dc: a.dc ?? null, title: a.label }, event);
}

/** Hunt: Hunting (or Survival) at DC 12; 1d6 Day's Rations on a success, +1 per 5 over. Once a day. */
export async function hunt(actor, key, event = null) {
  if (key && actor.getFlag(SYS, "hunted") === key) return ui.notifications.info(`${actor.name} has already hunted today.`);
  const msg = await campCheck(actor, { skills: ["Hunting", "Survival"], dc: FORAGE_DC, title: "Hunt" }, event);
  if (key) await actor.setFlag(SYS, "hunted", key);
  const f = msg?.flags?.[SYS] ?? {};
  if (f.autoFail || f.natural === 1 || !(Number(f.total) >= FORAGE_DC)) {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card"><p><i class="fa-solid fa-crosshairs"></i> ${esc(actor.name)} comes back empty-handed.</p></div>` });
    return 0;
  }
  const r = await new Roll("1d6").evaluate();
  const found = r.total + forageBonus(f.total);
  await addRations(actor, found);
  await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<div class="arn-card"><p><i class="fa-solid fa-crosshairs"></i> ${esc(actor.name)} brings back <strong>${found} Day's Rations</strong>.</p></div>` });
  return found;
}

/** The camp's chat buttons (the watch's Perception). */
export function registerCamp() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const ask = html.querySelector?.(".arn-camp-askwatch");
    if (ask) ask.addEventListener("click", ev => {
      ev.currentTarget.disabled = true;
      const party = game.actors.get(ask.dataset.party);
      if (party) askWatch(party, String(ask.dataset.watchers || "").split(",").filter(Boolean), ask.dataset.watch);
    });
    const per = html.querySelector?.(".arn-camp-perception");
    if (per) per.addEventListener("click", async ev => {
      const watchers = String(per.dataset.watchers || "").split(",").map(id => game.actors.get(id)).filter(Boolean);
      const who = await pickMember(watchers, "Perception");
      if (who) await campCheck(who, { ability: "wis", title: "Perception" }, ev);
    });
  });
}

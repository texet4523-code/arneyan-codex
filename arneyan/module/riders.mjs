/**
 * Riders on a hit (R-F50, K213 and K221). Under a hit, the attack card lists the attacker's own riders (Codex, Riders:
 * an extra effect a class, kit or feat feature adds to a hit, once a round or once an encounter) that are still free
 * this round: the Fighter's weapon manoeuvre, Press the Advantage and Fighter Manoeuvres, Hunter's Tricks, Brutal and
 * Terrifying, Cleaving Fury, Blessed Weapon, Spellstrike, Exploit and Sneak Attack's dice, Favoured Enemy's die. One
 * click uses it (its roll, save or contest, as its own button would). Once one is used on a hit the others grey out,
 * since a hit carries one of your riders unless one names the other (Blessed Weapon and Smite, Hunter's Tricks and the
 * Favoured Enemy die, First Blood and Sneak Attack). A rider used this round greys out on later cards too.
 *
 * Only the attacker's owner sees the row; it is drawn when the card is shown, so it follows what is left.
 */
import { weaponGroup, featureLevel } from "./effects.mjs";
import { outcomeFor, damageRoll } from "./rolls.mjs";
import { combatFor } from "./fight.mjs";
import { markedBy } from "./turns.mjs";

const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const features = actor => [...(actor?.items ?? [])].filter(i => ["ability", "feat"].includes(i.type));
const feature = (actor, name) => features(actor).find(i => i.name === name) ?? null;
const levelIn = (actor, cls) => Number([...(actor?.items ?? [])].find(i => i.type === "class" && i.name.startsWith(cls))?.system?.levels) || 0;
const raging = actor => features(actor).some(i => i.system?.toggle && i.system.active && /^rage$/i.test(i.name));
const acts = item => item?.availableActivities ?? item?.system?.activities ?? [];
const actOf = (item, name) => acts(item).find(a => a.name === name) ?? null;

/** The weapon's damage dice alone ("1d8+3" gives "1d8"). */
export const weaponDiceOf = weapon => (String(weapon?.system?.damage ?? "").match(/\d*d\d+/gi) ?? []).join("+");

const SIZES = ["tiny", "small", "medium", "large", "huge", "gargantuan"];
const sizeIdx = a => Math.max(0, SIZES.indexOf(a?.system?.details?.size ?? "medium"));

/** The weapon group manoeuvre (Weapon Training) for a group. */
export const GROUP_MANOEUVRE = {
  bind: { label: "Bind", contest: "disarm", text: "Bind: a Disarm contest against the target." },
  hew: { label: "Hew", save: "fort", text: "Hew: a creature your size or smaller makes a Fortitude save against your Class Save DC or is knocked Prone." },
  hook: { label: "Hook", contest: "trip", text: "Hook: a Trip contest against the target, at your weapon's full reach." },
  "pinning fire": { label: "Pinning Fire", text: "Pinning Fire: the target has Disadvantage on its next attack roll." },
  clinch: { label: "Clinch", contest: "grapple", text: "Clinch: a Grapple contest against the target." }
};

/**
 * The attacker's riders for a hit with this weapon on this target. Each: { key (once a round per key), label, text,
 * per ("round" or "encounter"), times (a round), joins (keys it combines with on one hit), and what it does: act
 * (an item's activity), use (an item used as itself), contest, save, damage ({ formula, type, crit }), or note }.
 */
export function ridersFor(actor, weapon, target, { melee = !weapon?.system?.ranged } = {}) {
  const out = [];
  if (actor?.type !== "character" || weapon?.type !== "weapon") return out;
  // Fighter: the group manoeuvre of your Weapon Specialisation group, with that group's weapons.
  const spec = feature(actor, "Weapon Specialisation");
  const picked = String((spec?.system?.optionChoice?.value ?? [])[0] ?? "").toLowerCase();
  const group = weaponGroup(weapon);
  if (feature(actor, "Weapon Training") && picked && group === picked && GROUP_MANOEUVRE[group]) {
    const g = GROUP_MANOEUVRE[group];
    const small = g.save !== "fort" || !target || sizeIdx(target) <= sizeIdx(actor);
    if (small) out.push({ key: "weapon-training", label: g.label, text: g.text, contest: g.contest, save: g.save, item: feature(actor, "Weapon Training"), note: !g.contest && !g.save });
  }
  // Press the Advantage (3rd): one contest on a melee hit.
  if (melee && feature(actor, "Press the Advantage")) {
    for (const [kind, label] of [["trip", "Trip"], ["disarm", "Disarm"], ["dirty", "Dirty Trick"]])
      out.push({ key: "press-the-advantage", label: `Press the Advantage: ${label}`, text: `A ${label} contest against the creature you hit.`, contest: kind, item: feature(actor, "Press the Advantage") });
  }
  // Fighter Manoeuvres (4th): the ones learned, each once a round.
  const fm = feature(actor, "Fighter Manoeuvres");
  for (const a of acts(fm)) out.push({ key: `fm-${a.name}`, label: a.name, text: a.text, act: a, item: fm });
  // Ranger: Hunter's Tricks on a hit against your marked prey; Favoured Enemy's extra die.
  const ht = feature(actor, "Hunter's Tricks");
  if (ht && target && markedBy(target, actor, "Marked Prey")) {
    for (const a of acts(ht)) out.push({ key: "hunters-tricks", label: a.name, text: a.text, act: a, item: ht, joins: ["favoured-enemy"] });
  }
  const fe = feature(actor, "Favoured Enemy");
  if (fe && weaponDiceOf(weapon)) {
    const die = weaponDiceOf(weapon).match(/d\d+/i)?.[0] ?? "d6";
    out.push({ key: "favoured-enemy", label: "Favoured Enemy die", text: `Against a favoured enemy: one extra weapon damage die (1${die}), ignoring its Resistance.`, damage: { formula: `1${die}`, type: weapon.system.damageType ?? "" }, item: fe, joins: ["hunters-tricks"] });
  }
  // Barbarian, while raging: Brutal or Terrifying (the rage's style), and Cleaving Fury on a melee hit.
  if (raging(actor)) {
    const rs = feature(actor, "Rage Styles");
    const brutal = actOf(rs, "Brutal");
    if (brutal && (!target || sizeIdx(target) <= sizeIdx(actor) + 1)) out.push({ key: "brutal", label: "Brutal", text: brutal.text, act: brutal, item: rs, times: levelIn(actor, "Barbarian") >= 8 ? 2 : 1 });
    const intim = feature(actor, "Intimidate");
    if (actOf(rs, "Terrifying") && intim) out.push({ key: "terrifying", label: "Terrifying", text: actOf(rs, "Terrifying").text, use: intim, item: rs });
    const cf = feature(actor, "Cleaving Fury");
    if (cf && melee && weaponDiceOf(weapon)) {
      // From 15th it adds your Rage bonus (+4 from 15th).
      const bonus = levelIn(actor, "Barbarian") >= 15 ? "+4" : "";
      out.push({ key: "cleaving-fury", label: "Cleaving Fury", text: `Another enemy within your reach takes ${weaponDiceOf(weapon)}${bonus ? ` + your Rage bonus` : ""} damage, no attack roll (target it first).`, damage: { formula: `${weaponDiceOf(weapon)}${bonus}`, type: weapon.system.damageType ?? "", other: true }, item: cf });
    }
  }
  // Paladin: Blessed Weapon's radiant die (it adds to a Smite).
  const bw = feature(actor, "Blessed Weapon");
  const bwa = actOf(bw, "Blessed Weapon");
  if (bwa) out.push({ key: "blessed-weapon", label: "Blessed Weapon", text: `${bwa.text} Rolled here on its own card: don't also tick it on the damage card.`, damage: { formula: bwa.formula, type: bwa.damageType }, item: bw, joins: ["smite"] });
  // Spellblade: Spellstrike (a cantrip's, or a slot's), once a round (through your bonded weapon type: the player's to say).
  const ss = feature(actor, "Spellstrike");
  if (ss) {
    const cantrip = acts(ss).filter(a => /^Cantrip Spellstrike/.test(a.name)).at(-1);
    const levelled = acts(ss).filter(a => /^Levelled Spellstrike/.test(a.name));
    for (const a of [cantrip, ...levelled].filter(Boolean)) out.push({ key: "spellstrike", label: a.name, text: a.text, damage: { formula: a.formula, type: a.damageType || "force", noCrit: true }, item: ss });
  }
  // Rogue and Assassin: the extra dice (once a round).
  const ex = feature(actor, "Exploit"), exa = actOf(ex, "Exploit damage");
  if (exa) out.push({ key: "exploit", label: "Exploit dice", text: exa.text || "Exploit's extra dice (its conditions met: see the card).", damage: { formula: exa.formula, type: exa.damageType || weapon.system.damageType || "" }, item: ex });
  const sa = feature(actor, "Sneak Attack"), saa = actOf(sa, "Sneak Attack damage");
  if (saa) out.push({ key: "sneak-attack", label: "Sneak Attack dice", text: saa.text || "Sneak Attack's extra dice.", damage: { formula: saa.formula, type: saa.damageType || weapon.system.damageType || "" }, item: sa, joins: ["first-blood"] });
  const fb = feature(actor, "First Blood"), fba = acts(fb)[0];
  if (fba && target) out.push({ key: "first-blood", label: "First Blood die", text: fba.text || "First Blood: one extra Sneak Attack die against a creature that hasn't acted yet.", damage: { formula: fba.formula, type: fba.damageType || weapon.system.damageType || "" }, item: fb, joins: ["sneak-attack"] });
  return out;
}

/* -------------------------------------------- */
/*  Used this round                             */
/* -------------------------------------------- */

const stampOf = actor => { const c = combatFor(actor); return c?.started ? `${c.id}.${c.round}` : null; };

/** How many times each rider has been used this round: { key: n }. Outside a fight, nothing is counted. */
export function usedThisRound(actor) {
  const stamp = stampOf(actor);
  const f = actor?.getFlag?.(SYS, "riders");
  return stamp && f?.stamp === stamp ? { ...(f.used ?? {}) } : {};
}

/** Which riders are still free on this hit: { key: true }. `onCard` is the key already used on this hit, if any. */
export function freeRiders(list, used = {}, onCard = null) {
  const out = {};
  for (const r of list) {
    const left = (used[r.key] ?? 0) < (r.times ?? 1);
    const fits = !onCard || onCard === r.key || (r.joins ?? []).includes(onCard) || (list.find(x => x.key === onCard)?.joins ?? []).includes(r.key);
    out[r.key] = left && fits && onCard !== r.key;
  }
  return out;
}

/* -------------------------------------------- */
/*  On the card                                 */
/* -------------------------------------------- */

/** Did this attack card hit (any of its targets)? And the first creature it hit. */
export function cardHit(f) {
  const total = (Number(f.total) || 0) + (Number(f.luckBurned) || 0);
  if (!(f.targets ?? []).length) return { hit: f.natural !== 1, target: null };
  const hits = f.targets.filter(t => !["failure", "nat1"].includes(outcomeFor(total, f.natural, t.ac, "attack")));
  return { hit: hits.length > 0, target: hits[0] ?? null };
}

export function ridersHtml(list, free) {
  if (!list.length) return "";
  const buttons = list.map((r, i) => `<button type="button" class="arn-rider" data-index="${i}" ${free[r.key] ? "" : "disabled"} data-tooltip="${esc(r.text)}"><i class="fa-solid fa-plus"></i> ${esc(r.label)}</button>`).join("");
  return `<div class="arn-riders"><div class="arn-tiny arn-muted">Riders on this hit (one, unless one names the other):</div>${buttons}</div>`;
}

async function useRider(message, actor, weapon, target, r, ev) {
  let done = null;
  if (r.act) { done = await r.item._useActivity(r.act, ev); if (Array.isArray(done)) done = done.length > 0; }
  else if (r.use) done = await r.use.use(ev);
  else if (r.contest) {
    // Counted once the contest's card is posted (a refusal, such as a size limit, posts none).
    const before = game.messages?.size ?? 0;
    await (await import("./combat.mjs")).startContest(actor, r.contest, ev, { target });
    done = (game.messages?.size ?? 0) > before;
  }
  else if (r.damage) {
    const f = message.flags?.[SYS] ?? {};
    // Extra dice from features and spells are rolled once and never maximised (Codex, Critical Hits).
    const cl = r.item ? featureLevel(actor, r.item) : 1;
    done = await damageRoll({ actor, item: r.item, title: `${r.item?.name ?? r.label}: ${r.label}`, formula: r.damage.formula, damageType: r.damage.type || "", crit: false,
      rollData: { ...(actor.getRollData?.() ?? {}), cl }, notes: [r.text], hits: r.damage.other ? null : target ? [{ name: target.name, uuid: target.uuid }] : null });
  } else {
    const dc = r.save ? (actor.system?.classDC || "") : "";
    const save = r.save ? `<button type="button" class="arn-save-btn" data-save="${r.save}" data-dc="${dc}" data-source="${esc(r.label)}"><i class="fa-solid fa-shield-halved"></i> ${r.save === "fort" ? "Fortitude" : r.save === "will" ? "Will" : "Reflex"} save${dc ? ` DC ${dc}` : ""}</button>` : "";
    done = await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card"><header class="arn-card-title"><img src="${esc(r.item?.img ?? weapon.img)}" alt=""> <span>${esc(r.label)}${target ? ` on ${esc(target.name)}` : ""}</span></header><p>${esc(r.text)}</p>${save}</div>` });
  }
  // Cancelled, or not enough uses: nothing counted, and the row stays as it was.
  if (!done) return false;
  // Counted for the round, and on this hit.
  const stamp = stampOf(actor);
  if (stamp && actor.isOwner) {
    const used = usedThisRound(actor);
    used[r.key] = (used[r.key] ?? 0) + 1;
    await actor.setFlag(SYS, "riders", { stamp, used }).catch(() => null);
  }
  if (message.canUserModify?.(game.user, "update")) await message.update({ [`flags.${SYS}.rider`]: r.key }).catch(() => null);
  return true;
}

export function registerRiders() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const f = message.flags?.[SYS];
    if (f?.kind !== "attack" || !f.itemId) return;
    let actor = null;
    try { actor = f.actorUuid ? fromUuidSync(f.actorUuid) : ChatMessage.getSpeakerActor(message.speaker); } catch { actor = null; }
    if (!actor?.isOwner || actor.type !== "character") return;
    const weapon = actor.items.get(f.itemId);
    const { hit, target: t } = cardHit(f);
    if (!weapon || !hit) return;
    let target = null;
    try { target = t?.uuid ? fromUuidSync(t.uuid) : null; } catch { target = null; }
    const list = ridersFor(actor, weapon, target, { melee: f.melee !== undefined ? !!f.melee : !weapon.system.ranged });
    if (!list.length) return;
    const free = freeRiders(list, usedThisRound(actor), f.rider ?? null);
    const box = document.createElement("div");
    box.innerHTML = ridersHtml(list, free);
    const row = box.firstElementChild;
    (html.querySelector(".arn-dmg-buttons")?.parentElement ?? html.querySelector(".arn-card") ?? html).appendChild(row);
    row.querySelectorAll(".arn-rider").forEach(btn => btn.addEventListener("click", async ev => {
      ev.preventDefault();
      const r = list[Number(btn.dataset.index)];
      if (!r || btn.disabled) return;
      const before = [...row.querySelectorAll(".arn-rider")].map(b => b.disabled);
      row.querySelectorAll(".arn-rider").forEach(b => { b.disabled = true; });
      let ok = false;
      try { ok = await useRider(message, actor, weapon, target, r, ev); } catch (err) { console.error("Arneyan | rider", err); ui.notifications.error(err.message); }
      if (!ok) row.querySelectorAll(".arn-rider").forEach((b, i) => { b.disabled = before[i]; });
    }));
  });
}

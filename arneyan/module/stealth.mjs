/**
 * Hiding, searching and surprise (books v0.10.10, K2; Builder requests B-F2 and B-F3, 25 Oct 2026).
 *
 * - Hide (action): a Dexterity (Stealth) check, rolled from the sheet's Hide box. The card's button (pressed after
 *   any Luck is burned) sets the tier as a condition on the creature (Partially Hidden, Hidden, Completely Hidden) and
 *   its Search DC (12, 15 or 20), and sends the GM who notices: every other creature on the scene whose passive
 *   awareness meets the DC, and the special senses the tier doesn't beat.
 * - Search (action): a Wisdom check against a targeted hidden creature's Search DC (Advantage from Master Perception
 *   or a feature, as for passive awareness). On a success the card offers to end the hiding.
 * - A hidden creature stops being hidden when it attacks or casts a spell (documents.mjs calls endHiding).
 * - Surprise (GM, token tools): before initiative, each creature on the unaware side compares its passive awareness
 *   (with surprise bonuses, less an Assassin's Surprise) with the lowest Search DC among the hiding ambushers, or a
 *   Difficulty Tiers DC (Moderate 12 for a quiet approach, Hard 15 for a prepared ambush). The GM can mark the
 *   surprised, who lose the surprise round (round 1; the condition comes off when round 2 begins).
 */
import { ARNEYAN } from "./config.mjs";
import { toggleCondition, statusesOf } from "./effects.mjs";
import { HIDE_TIERS, HIDE_IDS, hideTier, sensesOf, surpriseAwareness } from "./awareness.mjs";

const SYS = "arneyan";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);
const ROGUELIKE = /^(Rogue|Assassin)\b/i;

/** The creature's hiding now: its tier (from the condition) and Search DC, or null. */
export function hideState(actor) {
  if (!actor) return null;
  const ids = statusesOf(actor);
  const t = HIDE_TIERS.find(x => ids.has(x.id));
  if (!t) return null;
  const f = actor.getFlag?.(SYS, "hide") ?? {};
  return { ...t, total: Number(f.total) || t.min };
}

/** Put a creature at a hiding tier (null: not hidden), as its condition and remembered result. */
export async function setHideTier(actor, tier, total = null) {
  for (const id of HIDE_IDS) if (id !== tier?.id && statusesOf(actor).has(id)) await toggleCondition(actor, id, false);
  if (!tier) { await actor.unsetFlag?.(SYS, "hide"); return null; }
  if (!statusesOf(actor).has(tier.id)) await toggleCondition(actor, tier.id, true);
  await actor.setFlag(SYS, "hide", { id: tier.id, dc: tier.dc, total: Number(total) || tier.min });
  return tier;
}

/** Hiding ends (it attacked, cast a spell, made a loud noise, or was found). */
export async function endHiding(actor, why = "") {
  if (!actor?.isOwner || !hideState(actor)) return false;
  await setHideTier(actor, null);
  if (why) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${esc(actor.name)} ${esc(why)} and is no longer hidden.</p>` });
  return true;
}

const isRoguelike = actor => [...(actor?.items ?? [])].some(i => i.type === "class" && ROGUELIKE.test(i.name));
const sensesText = actor => actor?.system?.traits?.senses ?? actor?.system?.details?.senses ?? "";
const skillNamed = (actor, re) => [...(actor?.items ?? [])].find(i => i.type === "skill" && re.test(String(i.name).trim()));

/** Roll Hide: Stealth if the creature has it as a skill (a monster), otherwise a Dexterity check. */
export function rollHide(actor, event) {
  const footer = `<button type="button" class="arn-hide-set" data-actor-uuid="${esc(actor.uuid)}"><i class="fa-solid fa-user-ninja"></i> Set how hidden (after any Luck)</button>`;
  const stealth = skillNamed(actor, /^stealth$/i);
  const opts = { title: "Hide", footer, extra: { hide: true } };
  return stealth ? actor.rollSkill(stealth, event, opts) : actor.rollAbility("dex", event, { ...opts, title: "Hide (Dexterity)" });
}

/** What the tier means, for the card. */
export function tierText(tier, actor = null) {
  if (!tier) return "Not hidden (a result under 12).";
  const beats = tier.beats.map(s => s[0].toUpperCase() + s.slice(1)).join(", ");
  const rogue = tier.id === "hiddenPartial" && isRoguelike(actor) ? " As a Rogue or Assassin, counts as Hidden while lightly obscured." : "";
  return `${tier.label}: Search DC ${tier.dc}. Stays hidden ${tier.holds}. ${beats} ${tier.beats.length > 1 ? "don't" : "doesn't"} find it.${rogue}`;
}

/** Everyone else on the scene who could notice the hider, with their passive awareness against the DC. */
export function noticeRows(hider, tier, tokens = []) {
  const mine = hider?.getActiveTokens?.() ?? [];
  const own = new Set(mine.map(t => t.document?.id ?? t.id));
  // The other side: creatures of a different disposition from the hider's token (everyone, if it has none).
  const disp = (mine[0]?.document ?? mine[0])?.disposition;
  const rows = [];
  for (const tok of tokens) {
    const doc = tok.document ?? tok;
    const a = tok.actor ?? doc.actor;
    if (!a || own.has(doc.id) || a === hider || !["character", "npc"].includes(a.type)) continue;
    if (disp !== undefined && doc.disposition === disp) continue;
    const aw = a.system?.attributes?.awareness?.value;
    if (!Number.isFinite(aw)) continue;
    const senses = sensesOf(sensesText(a));
    const still = senses.filter(s => !tier.beats.includes(s));
    rows.push({ name: doc.name ?? a.name, awareness: aw, spots: aw >= tier.dc, beaten: senses.filter(s => tier.beats.includes(s)), still });
  }
  return rows.sort((x, y) => Number(y.spots) - Number(x.spots) || y.awareness - x.awareness);
}

async function onHideSet(button) {
  const actor = await fromUuid(button.dataset.actorUuid).catch(() => null);
  if (!actor?.isOwner) return ui.notifications.warn("Only the creature's owner or the GM sets how hidden it is.");
  const msg = game.messages.get(button.closest("[data-message-id]")?.dataset.messageId);
  const f = msg?.flags?.[SYS];
  if (!f) return;
  const total = (Number(f.total) || 0) + (Number(f.luckBurned) || 0);
  const tier = f.autoFail ? null : hideTier(total);
  await setHideTier(actor, tier, total);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="arn-card"><p><strong>${esc(actor.name)}</strong> (Hide ${total}): ${esc(tierText(tier, actor))}</p></div>` });
  if (!tier) return;
  const rows = noticeRows(actor, tier, globalThis.canvas?.tokens?.placeables ?? []);
  if (!rows.length) return;
  const line = r => `<li><strong>${esc(r.name)}</strong>: passive awareness ${r.awareness} ${r.spots ? `<strong>notices</strong>` : "doesn't notice"}${r.beaten.length ? ` (${esc(r.beaten.join(", "))} beaten)` : ""}${r.still.length ? `; its ${esc(r.still.join(", "))} still finds it in range` : ""}</li>`;
  // Blind: only the GM sees it, not the player who pressed the button.
  await ChatMessage.create({ whisper: gmIds(), blind: true, speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-eye"></i> <span>Who notices ${esc(actor.name)} (DC ${tier.dc})</span></header><ul>${rows.map(line).join("")}</ul><p class="arn-muted">A creature not actively looking notices if its passive awareness meets the Search DC. A sense the creature is hidden from doesn't reveal it on its own.</p></div>` });
}

/** Roll Search: a Wisdom check against the targeted hidden creature's Search DC (Perception if trained). */
export function rollSearch(actor, event) {
  const target = [...(game.user?.targets ?? [])].map(t => t.actor).find(a => a && a !== actor && hideState(a));
  const state = target ? hideState(target) : null;
  const footer = target ? `<button type="button" class="arn-search-found" data-target-uuid="${esc(target.uuid)}" data-dc="${state.dc}"><i class="fa-solid fa-eye"></i> Found: no longer hidden</button>` : "";
  const opts = { dc: state?.dc ?? null, title: target ? `Search for ${target.name}` : "Search", footer, extra: { search: true }, advKeys: ["adv.awareness"] };
  const perception = skillNamed(actor, /^perception$/i);
  return perception ? actor.rollSkill(perception, event, opts) : actor.rollAbility("wis", event, opts);
}

async function onSearchFound(button) {
  const target = await fromUuid(button.dataset.targetUuid).catch(() => null);
  if (!target) return;
  const msg = game.messages.get(button.closest("[data-message-id]")?.dataset.messageId);
  const f = msg?.flags?.[SYS] ?? {};
  const total = (Number(f.total) || 0) + (Number(f.luckBurned) || 0);
  // The DC as it stands now (it may have hidden again since).
  const dc = hideState(target)?.dc ?? Number(button.dataset.dc);
  if (!hideState(target)) return ui.notifications.info(`${target.name} isn't hidden any more.`);
  if (f.autoFail || total < dc) return ui.notifications.warn(`The Search (${total}) didn't reach ${target.name}'s Search DC.`);
  if (!target.isOwner) return ui.notifications.info(`${target.name} is found: the GM ends its hiding.`);
  await endHiding(target, "is found");
}

/* -------------------------------------------- */
/*  Surprise                                     */
/* -------------------------------------------- */

/**
 * The surprise check for each unaware creature.
 * @param {Actor[]} ambushers  The side that may catch the other unaware.
 * @param {Actor[]} unaware    The side that may be caught.
 * @param {number|null} fixedDc  A Difficulty Tiers DC when the ambushers weren't hiding.
 */
export function surpriseResults(ambushers, unaware, fixedDc = ARNEYAN.difficulties.moderate) {
  // Each ambusher gives the group away at its Search DC if it's hiding, or at the Difficulty Tiers DC if not (the
  // noisiest one counts: the lowest).
  const fallback = Number.isFinite(Number(fixedDc)) && fixedDc !== null ? Number(fixedDc) : ARNEYAN.difficulties.moderate;
  const dcs = ambushers.map(a => hideState(a)?.dc ?? fallback);
  const dc = dcs.length ? Math.min(...dcs) : null;
  const against = Math.max(0, ...ambushers.map(a => Number(a.system?.mods?.sum?.("surprise.against") ?? a.mods?.sum?.("surprise.against")) || 0));
  const rows = unaware.map(a => {
    const aw = a.system?.attributes?.awareness;
    const mods = a.system?.mods ?? a.mods;
    const s = surpriseAwareness(aw ?? { value: 10, net: 0, adv: [], dis: [] }, mods, against);
    const cannot = (mods?.notesFor?.("init", "check", "skill") ?? []).filter(n => /cannot be surprised|can't be surprised/i.test(n));
    return { actor: a, name: a.name, awareness: s.value, bonus: s.bonus, against: s.against, surprised: dc !== null && s.value < dc && !cannot.length, cannot };
  });
  return { dc, against, rows };
}

export async function surpriseDialog() {
  if (!game.user.isGM) return;
  const tokens = (globalThis.canvas?.tokens?.placeables ?? []).filter(t => ["character", "npc"].includes(t.actor?.type));
  if (!tokens.length) return ui.notifications.warn("No creatures on this scene.");
  const hidden = new Set(tokens.filter(t => hideState(t.actor)).map(t => t.id));
  const hiddenDisp = new Set(tokens.filter(t => hidden.has(t.id)).map(t => t.document.disposition));
  const guess = t => hidden.has(t.id) || hiddenDisp.has(t.document.disposition) ? "amb" : hiddenDisp.size ? "un" : "";
  const row = t => `<tr><td>${esc(t.name)}${hidden.has(t.id) ? ` <span class="arn-chip">${esc(hideState(t.actor).label)}, DC ${hideState(t.actor).dc}</span>` : ""}</td>
    ${["amb", "un", ""].map(v => `<td><input type="radio" name="side-${t.id}" value="${v}" ${guess(t) === v ? "checked" : ""}></td>`).join("")}</tr>`;
  const content = `<p>Surprise happens only when one side has a real chance to catch the other unaware (your call). Each creature on the unaware side compares its passive awareness with the lowest DC among the ambushers: a hiding ambusher's Search DC, or the DC below for one that isn't hiding (the noisiest gives the group away).</p>
    <table class="arn-surprise-table"><thead><tr><th>Creature</th><th>Ambusher</th><th>Unaware</th><th>Neither</th></tr></thead><tbody>${tokens.map(row).join("")}</tbody></table>
    <div class="form-group"><label>Ambushers not hiding</label><select name="dc"><option value="${ARNEYAN.difficulties.moderate}">Quiet approach (Moderate ${ARNEYAN.difficulties.moderate})</option><option value="${ARNEYAN.difficulties.hard}">Prepared ambush (Hard ${ARNEYAN.difficulties.hard})</option></select></div>`;
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: "Surprise check", icon: "fa-solid fa-eye" }, classes: ["arneyan"], position: { width: 520 }, content,
    buttons: [{ action: "ok", label: "Check", icon: "fa-solid fa-check", default: true, callback: (ev, btn) => {
      const f = btn.form;
      const side = Object.fromEntries(tokens.map(t => [t.id, f.querySelector(`input[name="side-${t.id}"]:checked`)?.value ?? ""]));
      return { side, dc: f.elements.dc.value };
    } }, { action: "cancel", label: "Cancel" }],
    rejectClose: false
  });
  if (!res || res === "cancel") return;
  const amb = tokens.filter(t => res.side[t.id] === "amb").map(t => t.actor);
  const un = tokens.filter(t => res.side[t.id] === "un");
  if (!amb.length || !un.length) return ui.notifications.warn("Choose at least one ambusher and one unaware creature.");
  const r = surpriseResults(amb, un.map(t => t.actor), Number(res.dc));
  const surprisedTokens = un.filter((t, i) => r.rows[i].surprised).map(t => t.document.uuid);
  const lines = r.rows.map(x => `<li><strong>${esc(x.name)}</strong>: ${x.awareness}${x.bonus ? ` (incl. +${x.bonus} surprise)` : ""}${x.against ? ` (−${x.against} ambush)` : ""} ${x.surprised ? "<strong>surprised</strong>" : "notices"}${x.cannot.length ? ` <em>${esc(x.cannot.join("; "))}</em>` : ""}</li>`).join("");
  await ChatMessage.create({ whisper: gmIds(), content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-eye"></i> <span>Surprise check (DC ${r.dc})</span></header><ul>${lines}</ul>
    ${surprisedTokens.length ? `<button type="button" class="arn-surprise-mark" data-tokens="${esc(surprisedTokens.join(","))}"><i class="fa-solid fa-person-falling"></i> Mark the surprised</button>` : "<p>Nobody is surprised.</p>"}
    <p class="arn-muted">In the surprise round the ambushers and anyone who noticed act in initiative order; the surprised can't move, act or react. Run the surprise round as round 1: the condition comes off when round 2 begins.</p></div>` });
}

async function onSurpriseMark(button) {
  if (!game.user.isGM) return;
  for (const uuid of String(button.dataset.tokens ?? "").split(",").filter(Boolean)) {
    const tok = await fromUuid(uuid).catch(() => null);
    if (tok?.actor) await toggleCondition(tok.actor, "surprised", true);
  }
  button.disabled = true;
}

/** The surprise round is over: everyone in the fight loses Surprised. */
async function endSurprise(combat) {
  const actors = new Set([...(combat?.combatants ?? [])].map(c => c.actor).filter(Boolean));
  for (const t of combat?.scene?.tokens ?? globalThis.canvas?.scene?.tokens ?? []) if (t.actor) actors.add(t.actor);
  for (const a of actors) if (statusesOf(a).has("surprised")) await toggleCondition(a, "surprised", false);
}

export function registerStealth() {
  if (game.arneyan) Object.assign(game.arneyan, { hide: rollHide, search: rollSearch, surprise: surpriseDialog });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    root?.querySelectorAll(".arn-hide-set").forEach(b => b.addEventListener("click", ev => { ev.preventDefault(); b.disabled = true; onHideSet(b).finally(() => setTimeout(() => { b.disabled = false; }, 1500)); }));
    root?.querySelectorAll(".arn-search-found").forEach(b => b.addEventListener("click", ev => { ev.preventDefault(); onSearchFound(b); }));
    root?.querySelectorAll(".arn-surprise-mark").forEach(b => b.addEventListener("click", ev => { ev.preventDefault(); onSurpriseMark(b); }));
  });
  Hooks.on("updateCombat", (combat, changes) => {
    // Round 1 is the surprise round; it's over when round 2 (or later) begins.
    if (!game.users.activeGM?.isSelf || !(Number(changes.round) >= 2)) return;
    endSurprise(combat).catch(err => console.warn("Arneyan | surprise", err));
  });
  Hooks.on("deleteCombat", combat => { if (game.users.activeGM?.isSelf) endSurprise(combat).catch(() => {}); });
  Hooks.on("getSceneControlButtons", controls => {
    if (!game.user?.isGM) return;
    const tokens = controls.tokens ?? controls.token ?? Object.values(controls).find(c => c?.name === "tokens");
    if (!tokens?.tools) return;
    tokens.tools.arnSurprise = { name: "arnSurprise", title: "Surprise check (passive awareness against the ambushers' Search DC)", icon: "fa-solid fa-eye",
      order: Object.keys(tokens.tools).length + 3, button: true, visible: true, onChange: () => surpriseDialog() };
  });
}

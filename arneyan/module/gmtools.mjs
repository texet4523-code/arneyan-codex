/**
 * GM tools: ask the party (or any group) for a roll on one chat card, award XP with a level-up notice, and the
 * hooks for treasure, hazards and environmental timers. Scene controls (Token tools) give the GM quick access.
 *
 * Ask for a roll: the GM picks a save, an attribute check or a skill and a DC. The card lists every creature with
 * a Roll button: each player rolls their own character, the GM can roll for anyone (absent players, NPCs). The
 * roll posts its usual card and the result (pass or fail) fills into the group card. Players' results reach the
 * card through the GM's client, which reads them from the roll messages themselves.
 */
import { ARNEYAN } from "./config.mjs";
import { outcomeFor } from "./rolls.mjs";
import { partyMembers } from "./party.mjs";
import { registerTreasure, postTreasure, treasureForActor, treasureForFoes, parseTreasureCode } from "./treasure.mjs";
import { registerHazards, EnvironmentTimers } from "./hazards.mjs";

const SYS = "arneyan";
const SOCKET = `system.${SYS}`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* -------------------------------------------- */
/*  Ask for a roll: pure parts                  */
/* -------------------------------------------- */

/** "Reflex save", "Dexterity check", "Tracking check". */
export function requestLabel(kind, key) {
  if (kind === "save") return `${ARNEYAN.saves[key]?.label ?? key} save`;
  if (kind === "check") return `${ARNEYAN.abilities[key] ?? key} check`;
  return `${key} check`;
}

/** The outcome of one roll message's flags against the request. */
export function resultFromFlags(flags, dc) {
  const total = (Number(flags?.total) || 0) + (Number(flags?.luckBurned) || 0);
  const natural = Number(flags?.natural) || 0;
  const outcome = outcomeFor(total, natural, dc ?? null, flags?.kind ?? "check", !!flags?.autoFail);
  const pass = outcome === "success" || outcome === "nat20" ? true : ["failure", "nat1", "autofail"].includes(outcome) ? false : null;
  return { total, natural, outcome, pass };
}

const OUTCOME_TEXT = { success: "Success", failure: "Failure", nat20: "Natural 20: success", nat1: "Natural 1: failure", autofail: "Automatic failure" };

/** Counts for the summary line. */
export function summarise(members) {
  const done = members.filter(m => m.rollId);
  return { rolled: done.length, waiting: members.length - done.length, passed: done.filter(m => m.pass === true).length, failed: done.filter(m => m.pass === false).length };
}

/** The group card's HTML, from its flags. */
export function partyRollHtml(data) {
  const what = requestLabel(data.kind, data.key);
  const dc = data.dc ?? null;
  const head = data.label || what;
  const sub = data.label ? `${what}${dc !== null ? `, DC ${dc}` : ""}` : (dc !== null ? `DC ${dc}` : "No DC: compare the totals");
  const rows = data.members.map(m => {
    const mode = m.mode > 0 ? '<span class="arn-chip">Advantage</span>' : m.mode < 0 ? '<span class="arn-chip">Disadvantage</span>' : "";
    const note = m.note ? ` <span class="arn-muted">${esc(m.note)}</span>` : "";
    const res = m.rollId
      ? `<span class="arn-pr-result ${m.pass === true ? "pass" : m.pass === false ? "fail" : ""}" data-tooltip="${esc(OUTCOME_TEXT[m.outcome] ?? "")}"><strong>${m.total}</strong>${m.pass === true ? ' <i class="fa-solid fa-check"></i>' : m.pass === false ? ' <i class="fa-solid fa-xmark"></i>' : ""}</span>`
      : `<button type="button" class="arn-pr-roll" data-uuid="${esc(m.uuid)}"><i class="fa-solid fa-dice-d20"></i> Roll</button><span class="arn-pr-wait arn-muted">waiting</span>`;
    return `<li data-uuid="${esc(m.uuid)}"><img src="${esc(m.img)}" alt=""><span class="arn-pr-name">${esc(m.name)}${mode}${note}</span>${res}</li>`;
  }).join("");
  const s = summarise(data.members);
  const summary = dc === null ? `${s.rolled} of ${data.members.length} rolled` : `${s.passed} passed, ${s.failed} failed${s.waiting ? `, ${s.waiting} still to roll` : ""}`;
  const cons = data.consequence === "exhaustion" ? (data.applied
    ? '<p class="arn-muted"><i class="fa-solid fa-check"></i> Exhaustion applied to those who failed.</p>'
    : `<button type="button" class="arn-pr-apply"${s.failed ? "" : " disabled"}><i class="fa-solid fa-person-falling"></i> Those who failed gain 1 level of Exhaustion</button>`) : "";
  return `<div class="arn-card arn-party-roll"><header class="arn-card-title"><i class="fa-solid fa-users"></i> <span>${esc(head)}</span>${dc !== null ? `<span class="arn-mode">DC ${dc}</span>` : ""}</header>
    <p class="arn-card-meta">${esc(sub)}</p>
    ${data.text ? `<p>${esc(data.text)}</p>` : ""}
    <ul class="arn-pr-list">${rows}</ul>
    <p class="arn-pr-summary">${summary}</p>
    <div class="arn-pr-gm">${s.waiting ? '<button type="button" class="arn-pr-rest"><i class="fa-solid fa-dice"></i> GM: roll for the rest</button>' : ""}${cons}</div></div>`;
}

/* -------------------------------------------- */
/*  Ask for a roll: in Foundry                  */
/* -------------------------------------------- */

/**
 * Post a group roll card.
 * @param {object} o
 * @param {Actor[]} o.actors
 * @param {"save"|"check"|"skill"} o.kind
 * @param {string} o.key           Save key, attribute key or skill name.
 * @param {number|null} [o.dc]
 * @param {string} [o.label]       A heading ("Spot the tripwire").
 * @param {string} [o.text]        A line under it.
 * @param {""|"exhaustion"} [o.consequence]
 * @param {Record<string, {mode?:number, note?:string}>} [o.per]  Advantage/Disadvantage and notes by actor uuid.
 */
export async function askForRoll({ actors, kind, key, dc = null, label = "", text = "", consequence = "", per = {} }) {
  if (!game.user.isGM) return ui.notifications.warn("The GM asks for group rolls.");
  if (!actors?.length) return ui.notifications.warn("Nobody to ask: add party members, or select tokens.");
  const data = {
    kind, key, dc: dc === null || dc === "" || !Number.isFinite(Number(dc)) ? null : Math.clamp(Number(dc), 0, 60), label: String(label ?? "").slice(0, 120),
    text: String(text ?? "").slice(0, 300), consequence, applied: false,
    members: actors.map(a => ({ uuid: a.uuid, name: a.name, img: a.img, mode: per[a.uuid]?.mode ?? 0, note: per[a.uuid]?.note ?? "", rollId: "", total: null, natural: null, outcome: "", pass: null }))
  };
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ alias: "GM" }), content: partyRollHtml(data), flags: { [SYS]: { kind: "partyRoll", partyRoll: data } } });
}

/** Roll the request for one creature; returns the roll's chat message. */
async function rollOne(actor, req, member, event = null) {
  const ev = { shiftKey: !!event?.shiftKey || member.mode > 0, ctrlKey: !!(event?.ctrlKey || event?.metaKey) || member.mode < 0 };
  const source = req.label || "";
  if (req.kind === "save") return actor.rollSave(req.key, ev, { dc: req.dc, source });
  if (req.kind === "check") return actor.rollAbility(req.key, ev);
  const item = actor.items.find(i => i.type === "skill" && i.name.toLowerCase() === String(req.key).toLowerCase()) ?? null;
  return actor.rollSkill(item, ev);
}

/** Does this roll message answer the request for this creature? */
function rollMatches(roll, req, actor) {
  const f = roll?.flags?.[SYS];
  if (!f) return false;
  const speaker = ChatMessage.getSpeakerActor(roll.speaker);
  if (speaker && actor && speaker.uuid !== actor.uuid && speaker.id !== actor.id) return false;
  if (req.kind === "save") return f.kind === "save" && f.save === req.key;
  if (req.kind === "check") return f.kind === "check" && (!f.ability || f.ability === req.key);
  // An untrained roll (no such skill on the sheet) answers any skill request; a trained one must be that skill.
  return f.kind === "skill" && (!f.skill || String(f.skill).toLowerCase() === String(req.key).toLowerCase());
}

// GM side: card updates one at a time, so two results arriving together don't overwrite each other.
let queue = Promise.resolve();
const enqueue = fn => (queue = queue.then(fn).catch(err => console.warn("Arneyan | party roll", err)));

async function recordResult(cardId, uuid, rollId) {
  const card = game.messages.get(cardId);
  const data = foundry.utils.deepClone(card?.flags?.[SYS]?.partyRoll);
  if (!data) return;
  const m = data.members.find(x => x.uuid === uuid);
  const roll = game.messages.get(rollId);
  if (!m || !roll) return;
  Object.assign(m, { rollId, ...resultFromFlags(roll.flags[SYS], data.dc) });
  await card.update({ content: partyRollHtml(data), [`flags.${SYS}.partyRoll`]: data });
}

/** A member's Roll button. */
async function onRollButton(card, uuid, event) {
  const data = card.flags[SYS].partyRoll;
  const member = data.members.find(m => m.uuid === uuid);
  if (!member || member.rollId) return;
  const actor = await fromUuid(uuid).catch(() => null);
  if (!actor) return ui.notifications.warn(`${member.name} is no longer in the world.`);
  if (!actor.isOwner) return ui.notifications.warn(`Only ${actor.name}'s player (or the GM) rolls for them.`);
  if (!game.user.isGM && !game.users.activeGM) ui.notifications.warn("No GM is connected: your roll is posted, but the group card fills in once the GM is back.");
  const roll = await rollOne(actor, data, member, event);
  if (!roll) return;
  if (game.user.isGM) return enqueue(() => recordResult(card.id, uuid, roll.id));
  game.socket.emit(SOCKET, { action: "partyRoll", messageId: card.id, uuid, rollId: roll.id });
}

export async function rollTheRest(card) {
  if (!game.user.isGM) return;
  const data = card.flags[SYS].partyRoll;
  for (const m of data.members.filter(x => !x.rollId)) {
    const actor = await fromUuid(m.uuid).catch(() => null);
    if (!actor) continue;
    const roll = await rollOne(actor, data, m);
    if (roll) await enqueue(() => recordResult(card.id, m.uuid, roll.id));
  }
}

export async function applyExhaustion(card) {
  if (!game.user.isGM) return;
  const data = foundry.utils.deepClone(card.flags[SYS].partyRoll);
  if (data.applied) return;
  const lines = [];
  for (const m of data.members.filter(x => x.pass === false)) {
    const a = await fromUuid(m.uuid).catch(() => null);
    if (a?.type !== "character") { if (a) lines.push(`${a.name}: no Exhaustion track (only characters have one)`); continue; }
    const now = Math.min(6, (a.system.attributes.exhaustion ?? 0) + 1);
    await a.update({ "system.attributes.exhaustion": now });
    lines.push(`${a.name}: Exhaustion ${now}${ARNEYAN.exhaustion[now] ? ` (${ARNEYAN.exhaustion[now]})` : ""}`);
  }
  data.applied = true;
  await card.update({ content: partyRollHtml(data), [`flags.${SYS}.partyRoll`]: data });
  if (lines.length) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ alias: "GM" }), content: `<div class="arn-card arn-report"><header class="arn-card-title"><i class="fa-solid fa-person-falling"></i> <span>${esc(data.label || "Exhaustion")}</span></header><ul>${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>` });
}

/** GM side of a player's result: everything is checked against the messages themselves. */
export async function onSocket(msg, senderId) {
  if (msg?.action !== "partyRoll" || !game.users.activeGM?.isSelf) return;
  const sender = game.users.get(senderId);
  const card = game.messages.get(String(msg.messageId ?? ""));
  const data = card?.flags?.[SYS]?.partyRoll;
  if (!sender || !data || !card.author?.isGM) return;
  const uuid = String(msg.uuid ?? "");
  const member = data.members.find(m => m.uuid === uuid);
  if (!member || member.rollId) return;
  const actor = await fromUuid(uuid).catch(() => null);
  if (!(actor instanceof Actor) || !actor.testUserPermission(sender, "OWNER")) return;
  const roll = game.messages.get(String(msg.rollId ?? ""));
  if (!roll || roll.author?.id !== sender.id || !rollMatches(roll, data, actor)) return;
  // The roll came after the card.
  if ((roll.timestamp ?? 0) < (card.timestamp ?? 0)) return;
  return enqueue(() => recordResult(card.id, uuid, roll.id));
}

/** Luck burned on a roll after it was recorded: the card follows (GM). */
function onUpdateMessage(message, changes) {
  if (!game.users.activeGM?.isSelf || foundry.utils.getProperty(changes, `flags.${SYS}.luckBurned`) === undefined) return;
  const cards = game.messages.contents.slice(-80).filter(c => c.flags?.[SYS]?.partyRoll?.members?.some(m => m.rollId === message.id));
  for (const c of cards) {
    const m = c.flags[SYS].partyRoll.members.find(x => x.rollId === message.id);
    enqueue(() => recordResult(c.id, m.uuid, message.id));
  }
}

function onRenderCard(message, html) {
  const data = message.flags?.[SYS]?.partyRoll;
  if (!data) return;
  const busy = (el, fn) => el.addEventListener("click", ev => {
    ev.preventDefault();
    if (el.dataset.busy) return;
    el.dataset.busy = "1";
    Promise.resolve().then(() => fn(ev)).catch(err => { console.error("Arneyan |", err); ui.notifications.error(err.message); }).finally(() => delete el.dataset.busy);
  });
  for (const b of html.querySelectorAll(".arn-pr-roll")) {
    const actor = fromUuidSync(b.dataset.uuid);
    const may = game.user.isGM || actor?.isOwner;
    b.hidden = !may;
    b.nextElementSibling?.toggleAttribute("hidden", !!may);
    if (may) busy(b, ev => onRollButton(message, b.dataset.uuid, ev));
  }
  for (const b of html.querySelectorAll(".arn-pr-rest, .arn-pr-apply")) b.hidden = !game.user.isGM;
  for (const b of html.querySelectorAll(".arn-pr-rest")) busy(b, () => rollTheRest(message));
  for (const b of html.querySelectorAll(".arn-pr-apply")) busy(b, () => applyExhaustion(message));
}

/* -------------------------------------------- */
/*  Ask for a roll: the GM's window             */
/* -------------------------------------------- */

async function skillNames(actors) {
  const names = new Set();
  const pack = game.packs.get(`${SYS}.skills`);
  if (pack) for (const e of await pack.getIndex()) names.add(e.name);
  for (const a of actors) for (const i of a.items?.filter(i => i.type === "skill") ?? []) names.add(i.name);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * The GM's window: what to roll, the DC, who rolls.
 * @param {object} [preset]  { kind, key, dc, label, actors, consequence }
 */
export async function askRollDialog(preset = {}) {
  if (!game.user.isGM) return ui.notifications.warn("The GM asks for group rolls.");
  const party = partyMembers();
  const selected = (canvas?.tokens?.controlled ?? []).map(t => t.actor).filter(a => a && !["party", "storage", "hazard"].includes(a.type));
  const pool = [...new Map([...(preset.actors ?? []), ...party, ...selected].map(a => [a.uuid, a])).values()];
  if (!pool.length) return ui.notifications.warn("No party members (Player Characters folder) and no tokens selected.");
  const chosen = new Set((preset.actors ?? (party.length ? party : selected)).map(a => a.uuid));
  const skills = await skillNames(pool);
  const cur = preset.kind && preset.key ? `${preset.kind}:${preset.key}` : "save:ref";
  const opt = (v, l) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(l)}</option>`;
  const content = `<div class="arn-gm-form">
    <div class="form-group"><label>Roll</label><select name="what">
      <optgroup label="Saving throws">${Object.entries(ARNEYAN.saves).map(([k, s]) => opt(`save:${k}`, `${s.label} save`)).join("")}</optgroup>
      <optgroup label="Attribute checks">${Object.entries(ARNEYAN.abilities).map(([k, l]) => opt(`check:${k}`, `${l} check`)).join("")}</optgroup>
      <optgroup label="Skills (NWP; untrained without it)">${skills.map(n => opt(`skill:${n}`, n)).join("")}</optgroup>
    </select></div>
    <div class="form-group"><label>DC</label><input type="number" name="dc" value="${preset.dc ?? 12}" min="0" max="60" list="arn-dc-tiers">
      <datalist id="arn-dc-tiers">${Object.entries(ARNEYAN.difficulties).map(([k, v]) => `<option value="${v}">${k[0].toUpperCase()}${k.slice(1)}</option>`).join("")}</datalist></div>
    <p class="arn-help">Easy 10, Moderate 12, Hard 15, Severe 20. Leave it empty to compare the totals instead.</p>
    <div class="form-group"><label>Heading</label><input type="text" name="label" value="${esc(preset.label ?? "")}" placeholder="Spot the tripwire"></div>
    <fieldset class="arn-pr-who"><legend>Who rolls</legend>
      ${pool.map(a => `<label class="checkbox"><input type="checkbox" name="who" value="${esc(a.uuid)}"${chosen.has(a.uuid) ? " checked" : ""}> <img src="${esc(a.img)}" alt=""> ${esc(a.name)}</label>`).join("")}
    </fieldset></div>`;
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Ask for a roll", icon: "fa-solid fa-dice-d20" }, classes: ["arneyan", "arn-gm-dialog"], position: { width: 420 }, content,
    ok: { label: "Ask", icon: "fa-solid fa-comment-dots", callback: (ev, button) => {
      const f = button.form.elements;
      const [kind, ...rest] = String(f.what.value).split(":");
      const who = [...button.form.querySelectorAll('input[name="who"]:checked')].map(x => x.value);
      return { kind, key: rest.join(":"), dc: f.dc.value === "" ? null : Number(f.dc.value), label: f.label.value.trim(), who };
    } },
    rejectClose: false
  }).catch(() => null);
  if (!res) return;
  const actors = pool.filter(a => res.who.includes(a.uuid));
  return askForRoll({ actors, kind: res.kind, key: res.key, dc: res.dc, label: res.label, consequence: preset.consequence ?? "", per: preset.per ?? {}, text: preset.text ?? "" });
}

/* -------------------------------------------- */
/*  Award XP                                    */
/* -------------------------------------------- */

/**
 * Work out an award. XP stops at the class rate until the level is taken (Codex, How Levels Are Awarded).
 * @param {{id:string, name:string, xp:number, rate:number}[]} members
 * @param {number} amount
 * @param {"each"|"split"} mode
 */
export function xpAward(members, amount, mode = "each") {
  const n = members.length;
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  const share = mode === "split" ? (n ? Math.floor(amt / n) : 0) : amt;
  const left = mode === "split" && n ? amt - share * n : 0;
  const rows = members.map(m => {
    const rate = Math.max(1, Number(m.rate) || 10);
    const before = Math.max(0, Number(m.xp) || 0);
    const after = Math.min(rate, before + share);
    return { id: m.id, name: m.name, gain: share, before, after, rate, capped: before + share > rate, ready: after >= rate };
  });
  return { share, left, rows };
}

export async function awardXpDialog() {
  if (!game.user.isGM) return ui.notifications.warn("The GM awards XP.");
  const members = partyMembers();
  if (!members.length) return ui.notifications.warn("No party members: put the player characters in the Player Characters folder.");
  const content = `<div class="arn-gm-form">
    <div class="form-group"><label>XP</label><input type="number" name="amount" value="1" min="0" max="999" autofocus></div>
    <div class="form-group"><label>How</label><select name="mode"><option value="each">Each chosen character gets it</option><option value="split">Split it between them (rounded down)</option></select></div>
    <div class="form-group"><label>For</label><input type="text" name="reason" placeholder="Rescued the miller's daughter"></div>
    <p class="arn-help">Completing any quest grants at least 1 XP; more for difficulty, length or a great achievement. Each level costs the class's rate, and XP stops at it until the level is taken.</p>
    <fieldset class="arn-pr-who"><legend>Who</legend>
      ${members.map(a => `<label class="checkbox"><input type="checkbox" name="who" value="${a.id}" checked> <img src="${esc(a.img)}" alt=""> ${esc(a.name)} <span class="arn-muted">${a.system.attributes.xp}/${a.system.xpRate} XP</span></label>`).join("")}
    </fieldset></div>`;
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Award XP", icon: "fa-solid fa-star" }, classes: ["arneyan", "arn-gm-dialog"], position: { width: 420 }, content,
    ok: { label: "Award", icon: "fa-solid fa-star", callback: (ev, button) => {
      const f = button.form.elements;
      return { amount: Number(f.amount.value) || 0, mode: f.mode.value, reason: f.reason.value.trim(), who: [...button.form.querySelectorAll('input[name="who"]:checked')].map(x => x.value) };
    } },
    rejectClose: false
  }).catch(() => null);
  if (!res || !res.amount || !res.who.length) return;
  return awardXp(members.filter(a => res.who.includes(a.id)), res.amount, res.mode, res.reason);
}

export async function awardXp(actors, amount, mode = "each", reason = "") {
  if (!game.user.isGM) return;
  const { share, left, rows } = xpAward(actors.map(a => ({ id: a.id, name: a.name, xp: a.system.attributes.xp, rate: a.system.xpRate })), amount, mode);
  if (!share) return ui.notifications.warn("That's less than 1 XP each.");
  for (const r of rows) await game.actors.get(r.id)?.update({ "system.attributes.xp": r.after });
  const ready = rows.filter(r => r.ready);
  const lines = rows.map(r => `<li><strong>${esc(r.name)}</strong>: +${r.gain} XP, now ${r.after} of ${r.rate}${r.capped ? ` <span class="arn-muted">(XP stops at ${r.rate} until the level is taken)</span>` : ""}${r.ready ? ' <span class="arn-chip strong"><i class="fa-solid fa-circle-up"></i> Ready to level up</span>' : ""}</li>`);
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ alias: "GM" }),
    content: `<div class="arn-card arn-report arn-xp-card"><header class="arn-card-title"><i class="fa-solid fa-star"></i> <span>XP awarded${reason ? `: ${esc(reason)}` : ""}</span></header>
      <ul>${lines.join("")}</ul>${left ? `<p class="arn-muted">${left} XP left over from the split.</p>` : ""}
      ${ready.length ? `<p>${esc(ready.map(r => r.name).join(", "))} can spend their XP on a level: use the level-up arrow on the character sheet.</p>` : ""}</div>`
  });
  if (ready.length) ui.notifications.info(`Ready to level up: ${ready.map(r => r.name).join(", ")}.`);
}

/** Taking a level spends the XP for it: back to 0 (Codex, Advancement). Only when the character had the full rate. */
function registerXpSpend() {
  Hooks.on("preUpdateItem", (item, changes, options) => {
    if (item.type !== "class" || item.parent?.type !== "character" || foundry.utils.getProperty(changes, "system.levels") === undefined) return;
    options.arneyanXp = { levels: item.system.levels, xp: item.parent.system.attributes.xp, rate: item.parent.system.xpRate };
  });
  Hooks.on("updateItem", (item, changes, options, userId) => {
    const before = options.arneyanXp;
    if (!before || userId !== game.user.id) return;
    const gained = (item.system.levels ?? 0) - before.levels;
    if (gained <= 0 || before.xp < before.rate) return;
    const xp = Math.max(0, before.xp - before.rate * gained);
    item.parent.update({ "system.attributes.xp": xp }).then(() => ui.notifications.info(`${item.parent.name} spends ${before.rate} XP on the level: XP back to ${xp}.`)).catch(() => null);
  });
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

function sceneControls(controls) {
  if (!game.user?.isGM) return;
  const tokens = controls.tokens ?? controls.token ?? Object.values(controls).find(c => c?.name === "tokens");
  if (!tokens?.tools) return;
  const n = Object.keys(tokens.tools).length;
  const add = (name, title, icon, fn, i) => { tokens.tools[name] = { name, title, icon, order: n + i, button: true, visible: true, onChange: () => fn() }; };
  add("arnAskRoll", "Ask for a roll (party or selected tokens)", "fa-solid fa-dice-d20", () => askRollDialog(), 1);
  add("arnEnvironment", "Environmental hazards: breath, drowning, heat and cold", "fa-solid fa-temperature-half", () => EnvironmentTimers.open(), 2);
}

export function registerGmTools() {
  Object.assign(game.arneyan, {
    askRoll: askRollDialog, askForRoll, awardXp: awardXpDialog,
    treasure: { roll: postTreasure, forActor: treasureForActor, forFoes: treasureForFoes, parse: parseTreasureCode },
    environment: () => EnvironmentTimers.open()
  });
  registerTreasure();
  registerHazards();
  registerXpSpend();
  Hooks.on("renderChatMessageHTML", onRenderCard);
  Hooks.on("updateChatMessage", onUpdateMessage);
  Hooks.on("getSceneControlButtons", sceneControls);
  Hooks.once("ready", () => game.socket.on(SOCKET, onSocket));
}

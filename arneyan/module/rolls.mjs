import { ARNEYAN } from "./config.mjs";
import { tagDamage } from "./dsn.mjs";

const SYS = "arneyan";

/**
 * Work out Advantage/Disadvantage from the click and any built-in source.
 * Shift = Advantage, Ctrl/Cmd = Disadvantage. One of each cancels out, and they never stack.
 */
export function modeFromEvent(event, builtIn = 0) {
  const sources = Array.isArray(builtIn) ? builtIn : [builtIn];
  let adv = sources.some(v => v > 0) || event?.shiftKey;
  let dis = sources.some(v => v < 0) || event?.ctrlKey || event?.metaKey;
  if (adv && dis) return 0;
  return adv ? 1 : dis ? -1 : 0;
}

function dieFormula(mode) {
  return mode > 0 ? "2d20kh" : mode < 0 ? "2d20kl" : "1d20";
}

/** The natural (kept) d20 result of a roll. */
function naturalOf(roll) {
  const d = roll.dice[0];
  const kept = d.results.find(r => r.active && !r.discarded) ?? d.results[0];
  return kept.result;
}

function signed(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Outcome against a number to beat. An attack with an expanded critical range (Critical Strike: 19-20) is a critical
 * on a natural in that range only if it hits ("crit"); only a real natural 20 hits whatever the AC.
 */
export function outcomeFor(total, natural, target, kind, autoFail = false, critAt = 20) {
  if (autoFail) return "autofail";
  if (natural === 20) return "nat20";
  if (natural === 1) return "nat1";
  if (target === null || target === undefined || target === "") return "";
  const hit = total >= target;
  if (hit && kind === "attack" && natural >= critAt) return "crit";
  return hit ? "success" : "failure";
}

/** Is this attack a critical? A natural 20 always; a natural in an expanded range only against a target it hits. */
export function isCritical(natural, total, critAt = 20, acs = []) {
  if (natural === 20) return true;
  if (natural === 1 || natural < critAt) return false;
  return acs.some(ac => ac !== null && ac !== undefined && ac !== "" && total >= Number(ac));
}

export function outcomeLabel(outcome, kind) {
  const attack = kind === "attack";
  return {
    nat20: attack ? "Natural 20: hit, and a critical" : "Natural 20: automatic success",
    crit: "Hit, and a critical (critical range)",
    nat1: attack ? "Natural 1: automatic miss" : "Natural 1: automatic failure",
    success: attack ? "Hit" : "Success",
    failure: attack ? "Miss" : "Failure",
    autofail: "Automatic failure"
  }[outcome] ?? "";
}

/**
 * Standard d20 roll-over test.
 * @param {object} o
 * @param {Actor} o.actor
 * @param {string} o.title                 Heading for the chat card.
 * @param {{label:string, value:number}[]} o.parts  Flat bonuses (shown as the breakdown).
 * @param {number} [o.mode]                1 Advantage, -1 Disadvantage, 0 normal.
 * @param {{adv:string[], dis:string[]}} [o.why]  Who gave Advantage or Disadvantage.
 * @param {number|null} [o.target]         DC or AC to beat, if known.
 * @param {{name:string, ac:number}[]} [o.targets]  Several targets (attacks).
 * @param {string} [o.kind]                check, save, attack, skill.
 * @param {string[]} [o.notes]             Reminders from feats, features and conditions.
 * @param {string} [o.autoFail]            Why the roll fails automatically, if it does.
 * @param {object} [o.extra]               Extra flags stored on the message.
 * @param {string|Function} [o.footer]     Extra HTML under the result, or a function of { natural, crit, outcome } giving it.
 */
export async function d20Roll({ actor, title, parts = [], mode = 0, why = null, target = null, targets = [], kind = "check", notes = [], autoFail = "", extra = {}, footer = "", critAt = 20, rollMode = null }) {
  const bonus = parts.reduce((t, p) => t + (Number(p.value) || 0), 0);
  const formula = `${dieFormula(mode)}${bonus ? ` + ${bonus}` : ""}`;
  const roll = await new Roll(formula).evaluate();
  const natural = naturalOf(roll);
  // An expanded critical range (Critical Strike): "a Critical Hit on a natural 20, or on a natural 19 that hits". The
  // natural stays as rolled, so only a real 20 hits whatever the AC; a 19 is a critical against each target it hits.
  critAt = kind === "attack" ? Math.clamp(Number(critAt) || 20, 2, 20) : 20;
  const acs = targets.length ? targets.map(t => t.ac) : [target];
  const crit = kind === "attack" && !autoFail && isCritical(natural, roll.total, critAt, acs);
  if (kind === "attack" && natural >= critAt && natural < 20) {
    const known = acs.some(ac => ac !== null && ac !== undefined && ac !== "");
    notes = [...notes, known ? `Critical range ${critAt}-20: a natural ${natural} is a critical only against a target it hits` : `Critical range ${critAt}-20: a natural ${natural} is a critical if it hits`];
  }
  extra = { ...extra, crit, critAt };
  const outcome = targets.length > 1 ? (natural === 20 ? "nat20" : natural === 1 ? "nat1" : "") : outcomeFor(roll.total, natural, target ?? targets[0]?.ac, kind, !!autoFail, critAt);
  const flags = { kind, natural, target: target ?? targets[0]?.ac ?? null, targets, total: roll.total, bonus, luckBurned: 0, autoFail: !!autoFail, ...extra };
  // The footer can depend on the roll (an attack's damage buttons on a natural 20 or 1).
  if (typeof footer === "function") footer = footer({ natural, crit, outcome });
  const content = await renderCard({ title, parts, mode, why, roll, natural, outcome, target: flags.target, targets, kind, footer, actor, notes, autoFail, luckBurned: 0, critAt });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    flags: { [SYS]: flags }
  }, { rollMode: rollMode || game.settings.get("core", "rollMode") });
}

async function renderCard({ title, parts, mode, why, roll, natural, outcome, target, targets, kind, footer, actor, notes, autoFail, luckBurned, critAt = 20 }) {
  const modeLabel = mode > 0 ? "Advantage" : mode < 0 ? "Disadvantage" : "";
  const whyLabel = why ? [...(why.adv?.length ? [`Advantage: ${why.adv.join(", ")}`] : []), ...(why.dis?.length ? [`Disadvantage: ${why.dis.join(", ")}`] : [])].join(" · ") : "";
  const canBurn = actor?.type === "character" && kind !== "luck" && kind !== "damage" && !autoFail;
  const total = roll.total + luckBurned;
  return foundry.applications.handlebars.renderTemplate(`systems/${SYS}/templates/chat/roll-card.hbs`, {
    title, modeLabel, whyLabel,
    parts: parts.filter(p => p.value).map(p => ({ label: p.label, value: signed(p.value) })),
    total,
    dice: roll.dice[0].results.map(r => ({ result: r.result, dropped: !r.active || r.discarded })),
    natural, outcome, outcomeLabel: autoFail ? `Automatic failure (${autoFail})` : outcomeLabel(outcome, kind), target: targets.length > 1 ? null : target,
    targets: targets.length > 1 ? targets.map(t => {
      const o = outcomeFor(total, natural, t.ac, kind, false, critAt);
      return { ...t, outcome: o, label: outcomeLabel(o, kind) };
    }) : [],
    notes, footer, canBurn, luckBurned
  });
}

/** Roll-under Luck Check. A natural 1 always succeeds, a natural 20 always fails. Advantage keeps the lower die. */
export async function luckCheck(actor, event) {
  const luck = actor.system.luck.value;
  const src = actor.system.mods?.adv("adv.luck") ?? { values: [], adv: [], dis: [] };
  const mode = modeFromEvent(event, src.values);
  const roll = await new Roll(mode > 0 ? "2d20kl" : mode < 0 ? "2d20kh" : "1d20").evaluate();
  const n = roll.total;
  const success = n === 1 ? true : n === 20 ? false : n <= luck;
  const outcome = n === 1 ? "nat1luck" : n === 20 ? "nat20luck" : success ? "success" : "failure";
  const label = {
    nat1luck: "Natural 1: fate smiles", nat20luck: "Natural 20: fate turns away",
    success: "Success", failure: "Failure"
  }[outcome];
  const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYS}/templates/chat/roll-card.hbs`, {
    title: `Luck Check (roll ${luck} or under)`, parts: [], total: n,
    modeLabel: mode > 0 ? "Advantage" : mode < 0 ? "Disadvantage" : "",
    dice: roll.dice[0].results.map(r => ({ result: r.result, dropped: !r.active || r.discarded })), natural: n,
    outcome: success ? "success" : "failure", outcomeLabel: label, canBurn: false,
    notes: actor.system.mods?.notesFor("luck") ?? []
  });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, rolls: [roll], flags: { [SYS]: { kind: "luck" } } }, { rollMode: game.settings.get("core", "rollMode") });
}

/** Maximum of the dice in a formula, e.g. "1d8+1d6" gives 14. Used for critical hits. */
export function maxOfDice(formula) {
  let total = 0;
  for (const m of String(formula).matchAll(/(\d*)d(\d+)/gi)) total += (Number(m[1]) || 1) * Number(m[2]);
  return total;
}

const FN = { min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs };

/**
 * Resolve @ data and work out every part that has no dice, so "1d3 + min(@cl, 10)" reads "1d3 + 1".
 */
export function resolveFormula(formula, data = {}) {
  let f = String(formula ?? "").trim();
  if (!f) return "0";
  try { f = Roll.replaceFormulaData(f, data, { missing: "0" }); } catch { /* keep as is */ }
  const num = expr => {
    if (/d\d/i.test(expr)) return null;
    if (!/^[\d\s+\-*/().,]*$/.test(expr)) return null;
    try { const v = Function(`"use strict"; return (${expr});`)(); return Number.isFinite(v) ? v : null; } catch { return null; }
  };
  for (let i = 0; i < 20; i++) {
    const before = f;
    // Functions with dice-free arguments.
    f = f.replace(/\b(min|max|floor|ceil|round|abs)\(([^()]*)\)/g, (m, fn, args) => {
      const vals = args.split(",").map(a => num(a));
      return vals.every(v => v !== null) ? String(FN[fn](...vals)) : m;
    });
    // Dice-free brackets.
    f = f.replace(/(?<![a-z])\(([^(),]*)\)/gi, (m, inner) => {
      const v = num(inner);
      return v === null ? m : String(v);
    });
    if (f === before) break;
  }
  // No dice is no term: a level formula's "0d6 + 1d8" (Eldritch Blast at 5th) reads "1d8", with no "+" left dangling.
  f = f.replace(/\s*[+-]\s*0d\d+(?:[a-z]+\d*)?(?!\d)/gi, "").replace(/^\s*0d\d+(?:[a-z]+\d*)?(?!\d)\s*/i, "");
  // Tidy signs and zero terms.
  f = f.replace(/\+\s*-\s*/g, "- ").replace(/-\s*-\s*/g, "+ ").replace(/\s*\+\s*0(?![\d.d])/g, "").replace(/\s+/g, " ").trim();
  f = f.replace(/\s*([+\-*/])\s*/g, " $1 ").replace(/^\s*\+\s*/, "").trim();
  return f || "0";
}

/**
 * Roll damage or healing and post our own card, with Apply buttons.
 * On a critical, add the maximum of the weapon's own dice. Advantage never applies to damage.
 */
export async function damageRoll({ actor, item = null, title, formula, mod = 0, crit = false, damageType = "", terms = [], extra = "", rollData = null, notes = [], extras = [], include = [], ammo = "", spell = "", hits = null, misses = [], offhand = false, subdual = false, featureBonus = null, weaponDice = "" }) {
  const data = rollData ?? actor?.getRollData?.() ?? {};
  const baseFormula = resolveFormula(formula || "0", data);
  const pieces = [{ label: item?.name ?? "Base", value: baseFormula }];
  if (mod) pieces.push({ label: "Modifier", value: signed(mod) });
  for (const t of terms) if (String(t.value ?? "").trim()) pieces.push({ label: t.label, value: resolveFormula(t.value, data) });
  if (extra && String(extra).trim()) pieces.push({ label: "Bonus", value: resolveFormula(extra, data) });
  // A critical adds the maximum of the damage dice: every damage die in the roll, riders too (Codex, Critical Hits).
  const critBonus = crit ? pieces.reduce((t, p) => t + maxOfDice(p.value), 0) : 0;
  if (critBonus) pieces.push({ label: "Critical (dice maximised)", value: `+${critBonus}` });
  const tidy = f => resolveFormula(f, {}).replace(/[+-]\s*0d\d+[a-z]*\d*/gi, "").replace(/^0d\d+\s*/i, "").trim() || "0";
  const f = tidy(pieces.map((p, i) => {
    const v = String(p.value).trim();
    if (i === 0) return v;
    return /^[+-]/.test(v) ? v : `+ ${v}`;
  }).join(" "));
  const healing = damageType === "healing";
  // Typed riders ("+1d6 fire") are their own rolls so resistances treat each type on its own.
  // Riders with a condition ("against undead") are offered as buttons instead.
  const riders = [];
  const offers = [];
  for (const x of extras ?? []) {
    const rf = resolveFormula(String(x.formula ?? "").replace(/^\+\s*/, ""), data);
    if (!rf || rf === "0") continue;
    const type = x.type || damageType;
    if (x.when) { offers.push({ formula: rf, type, typeLabel: ARNEYAN.damageTypes[type] ?? "", when: x.when, key: x.key ?? "" }); continue; }
    const max = crit ? maxOfDice(rf) : 0;
    riders.push({ formula: tidy(max ? `${rf} + ${max}` : rf), type, label: x.label || `${rf} ${type}`.trim() });
  }
  const rolls = [tagDamage(await new Roll(f).evaluate(), damageType)];
  for (const r of riders) rolls.push(tagDamage(await new Roll(r.formula).evaluate(), r.type));
  const total = rolls.reduce((t, r) => t + r.total, 0);
  const split = [{ type: damageType, amount: rolls[0].total }, ...riders.map((r, i) => ({ type: r.type, amount: rolls[i + 1].total }))];
  // Same type twice (a fire sword's fire rider on fire damage) reads as one.
  const byType = [];
  for (const p of split) {
    const same = byType.find(x => x.type === p.type);
    if (same) same.amount += p.amount; else byType.push({ ...p });
  }
  // What kind of weapon dealt it, for "non-magical", "non-silvered" and "weapons" resistances:
  // "magic" (a +N or a "magic" trait), "silver", "adamantine", "plain"; "" when it isn't a weapon.
  // The ammunition counts too: a silver arrow is silver, a +1 bolt is magic.
  const traits = `${item?._source?.name ?? item?.name ?? ""} ${item?.system?.traits ?? ""} ${ammo}`;
  const weapon = item?.type !== "weapon" ? ""
    : (Number(item.system.magic) > 0 || /\+\d/.test(ammo) || /(?<!non-)\bmagic(al)?\b/i.test(traits)) ? "magic"
    : /silver/i.test(traits) ? "silver" : /adamant/i.test(traits) ? "adamantine" : "plain";
  const type = healing ? "Healing" : (ARNEYAN.damageTypes[damageType] ?? "");
  const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYS}/templates/chat/damage-card.hbs`, {
    title, img: item?.img ?? actor?.img, type, damageType, healing, crit, weapon,
    formula: [f, ...riders.map(r => `${r.formula} ${r.type}`)].join(" + "), total,
    // The breakdown: each die term with what it rolled ("10d6: 3 1 2 ..."), per roll (the base, then each rider).
    diceGroups: rolls.flatMap((r, ri) => r.dice.map(d => ({
      label: `${d.number ?? d.results.length}d${d.faces}${ri ? ` ${ARNEYAN.damageTypes[riders[ri - 1].type] ?? ""}` : ""}`.trim(),
      subtotal: d.total ?? d.results.reduce((t, x) => t + (x.active !== false && !x.discarded ? x.result : 0), 0),
      dice: d.results.map(x => ({ result: x.result, faces: d.faces, dropped: !x.active || x.discarded, max: x.result === d.faces, min: x.result === 1 }))
    }))),
    parts: [...pieces.slice(1).map(p => ({ label: p.label, value: p.value })), ...riders.map(r => ({ label: ARNEYAN.damageTypes[r.type] ?? r.type, value: `+ ${r.formula}` }))],
    split: byType.length > 1 ? byType.map(p => ({ amount: p.amount, type: p.type, label: ARNEYAN.damageTypes[p.type] ?? "untyped" })) : [],
    offers, notes, subdual: !!subdual && !healing,
    // From an attack against several targets: the damage goes to the ones it hit.
    hits: hits ?? null, hasHits: Array.isArray(hits), hitNames: (hits ?? []).map(h => h.name).join(", "), missNames: (misses ?? []).map(h => h.name).join(", "),
    // A spell with a save: one click applies full damage to those who failed and half (or none) to those who saved.
    // Not after a touch attack (it replaces the save: the damage goes to the ones hit).
    bySaves: !healing && !Array.isArray(hits) && !!(spell || (item?.type === "spell" && item.system?.save) || item?.system?.save),
    canCrit: !crit && !healing && item?.type === "weapon" && !!actor
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls,
    flags: { [SYS]: { kind: healing ? "healing" : "damage", damageType, split: byType, weapon, crit, include, ammo, total, hits: hits ?? null, misses, spell: spell || (item?.type === "spell" ? item.name : ""), disrupt: /\bnalwood\b/i.test(item?.system?.traits ?? ""), itemUuid: item?.uuid ?? null, actorUuid: actor?.uuid ?? null, offhand: !!offhand, subdual: !!subdual && !healing, featureBonus: featureBonus ?? null, weaponDice: weaponDice || "",
      what: item?.name ?? String(title ?? "").replace(/:\s*(Damage|Healing)$/, "") } }
  }, { rollMode: game.settings.get("core", "rollMode") });
}

/** Burn Luck after a roll: +1 per point, declared before the outcome is described. */
export async function burnLuck(message) {
  const flags = message.getFlag(SYS, "kind") ? message.flags[SYS] : null;
  if (!flags) return;
  const actor = ChatMessage.getSpeakerActor(message.speaker);
  if (!actor?.isOwner) return ui.notifications.warn("Only the character's owner can burn their Luck.");
  const current = actor.system.luck.value;
  if (current <= 0) return ui.notifications.warn(`${actor.name} has no Luck left to burn.`);

  const amount = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Burn Luck" },
    content: `<p>Current Luck: <strong>${current}</strong>. Each point adds +1 to this roll.</p>
      <div class="form-group"><label>Points to burn</label><input type="number" name="amount" value="1" min="1" max="${current}" autofocus></div>`,
    ok: { label: "Burn", callback: (event, button) => Number(button.form.elements.amount.value) }
  }).catch(() => null);
  if (!amount || amount < 1) return;
  const spend = Math.min(amount, current);
  await actor.update({ "system.luck.value": current - spend });

  const burned = (flags.luckBurned || 0) + spend;
  const total = flags.total + burned;
  const outcome = outcomeFor(total, flags.natural, flags.target, flags.kind, false, flags.critAt ?? 20);

  // Rewrite the card with the new total.
  const html = new DOMParser().parseFromString(message.content, "text/html");
  const totalEl = html.querySelector(".arn-total");
  if (totalEl) totalEl.textContent = total;
  const burnEl = html.querySelector(".arn-luck-burned");
  if (burnEl) { burnEl.textContent = `+${burned} Luck burned`; burnEl.hidden = false; }
  const outEl = html.querySelector(".arn-outcome");
  if (outEl && ["success", "failure", "crit"].includes(outcome)) {
    outEl.textContent = outcomeLabel(outcome, flags.kind);
    outEl.className = `arn-outcome ${outcome}`;
  }
  for (const row of html.querySelectorAll("[data-target-ac]")) {
    const o = outcomeFor(total, flags.natural, Number(row.dataset.targetAc), flags.kind, false, flags.critAt ?? 20);
    const res = row.querySelector(".arn-target-result");
    if (res) { res.textContent = outcomeLabel(o, flags.kind); res.className = `arn-target-result ${o}`; }
  }
  // Burning Luck can turn a natural 19 that missed into a hit, and so into a critical.
  const acs = (flags.targets ?? []).length ? flags.targets.map(t => t.ac) : [flags.target];
  const crit = flags.kind === "attack" && !flags.autoFail && isCritical(flags.natural, total, flags.critAt ?? 20, acs);
  if (message.canUserModify(game.user, "update")) {
    await message.update({ content: html.body.innerHTML, [`flags.${SYS}.luckBurned`]: burned, ...(flags.kind === "attack" ? { [`flags.${SYS}.crit`]: crit } : {}) });
  } else {
    await ChatMessage.create({
      speaker: message.speaker,
      content: `<div class="arn-card"><p><strong>${esc(actor.name)}</strong> burns ${spend} Luck. The roll is now <strong>${total}</strong>${outcome ? `: ${outcomeLabel(outcome, flags.kind)}` : ""}.</p></div>`
    });
  }
}

/* -------------------------------------------- */
/*  Handbook PDF links                          */
/* -------------------------------------------- */

/**
 * Open a handbook PDF at a page. Uses PDF Pager if it is active and a journal name is set,
 * otherwise opens the PDF file in a new browser tab at that page.
 */
export function openPdf(book = "phb", page = 0) {
  page = Number(page) || 0;
  const journalName = game.settings.get(SYS, `${book}Journal`);
  const pager = game.modules.get("pdf-pager")?.active ? ui.pdfpager : null;
  if (pager?.openPDFByName && journalName) {
    return pager.openPDFByName(journalName, { page });
  }
  const path = game.settings.get(SYS, `${book}Pdf`);
  if (!path) {
    return ui.notifications.warn(`Set the ${ARNEYAN.books[book]} PDF in Game Settings > Configure Settings > The Arneyan Codex.`);
  }
  const url = new URL(path, window.location.href);
  url.hash = page ? `page=${page}` : "";
  window.open(url.href, "_blank");
}

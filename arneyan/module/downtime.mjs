/**
 * The Downtime log (Drop 4): a record on each character of what it did between adventures, following the Codex
 * (Downtime Rules; Training & Instruction; Crafting; Making Magic Items; Scribing, Scrolls & Potions). Each entry
 * spends days and coins and, where the Codex gives one, rolls the check and works out the result. Kept in
 * flags.arneyan.downtime as [{ id, key, activity, title, days, cost, costCp, result, roll, when, worldTime }].
 */
import { ARNEYAN } from "./config.mjs";
import { gameWhen } from "./worldtime.mjs";

const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* -------------------------------------------- */
/*  Coins                                       */
/* -------------------------------------------- */

const CP = { cp: 1, sp: 10, gp: 100, pp: 1000 };

/** Coins as copper pieces. */
export const toCp = cur => Object.entries(CP).reduce((t, [k, v]) => t + (Number(cur?.[k]) || 0) * v, 0);

/** "1 gp 5 sp" for a number of copper pieces. */
export function cpText(cp) {
  let n = Math.max(0, Math.round(cp));
  if (!n) return "0 gp";
  const out = [];
  for (const k of ["gp", "sp", "cp"]) { const v = Math.floor(n / CP[k]); if (v) out.push(`${v} ${k}`); n -= v * CP[k]; }
  return out.join(" ");
}

/**
 * Pay a sum (in copper) from a purse, smallest coins first, with change given back in gold, silver and copper
 * (Currency Conversion: 1 pp = 10 gp, 1 gp = 10 sp, 1 sp = 10 cp). Returns the new purse, or null if it's short.
 */
export function payCoins(cur, cost) {
  const out = { pp: 0, gp: 0, sp: 0, cp: 0, ...Object.fromEntries(Object.entries(cur ?? {}).map(([k, v]) => [k, Number(v) || 0])) };
  if (toCp(out) < cost) return null;
  let owed = Math.max(0, Math.round(cost));
  for (const k of ["cp", "sp", "gp", "pp"]) {
    if (owed <= 0) break;
    const n = Math.min(out[k], Math.ceil(owed / CP[k]));
    out[k] -= n;
    owed -= n * CP[k];
  }
  let change = -owed;
  out.gp += Math.floor(change / 100); change %= 100;
  out.sp += Math.floor(change / 10); out.cp += change % 10;
  return out;
}

/** Add coins earned (copper) to a purse, as gold, silver and copper. */
export function addCoins(cur, cp) {
  const out = { pp: 0, gp: 0, sp: 0, cp: 0, ...cur };
  let n = Math.max(0, Math.round(cp));
  out.gp += Math.floor(n / 100); n %= 100;
  out.sp += Math.floor(n / 10); out.cp += n % 10;
  return out;
}

/* -------------------------------------------- */
/*  The activities                              */
/* -------------------------------------------- */

const WEEK = 7;
/** General Difficulty Tiers (Codex). */
export const TIERS = { easy: { label: "Easy", dc: 10 }, moderate: { label: "Moderate", dc: 12 }, hard: { label: "Hard", dc: 15 }, severe: { label: "Severe", dc: 20 } };
/** Downtime: Training & Instruction. */
export const TRAINING = {
  weapon: { label: "Weapon proficiency (one weapon)", weeks: 2, gp: 50 },
  shield: { label: "Shield training", weeks: 2, gp: 50 },
  armourLight: { label: "Armour training: Light or Medium (one type)", weeks: 4, gp: 150 },
  armourHeavy: { label: "Armour training: Heavy (one type)", weeks: 8, gp: 500 },
  feat: { label: "Trained Feat", weeks: 12, gp: 750 }
};
/** Activities the GM rules on: time and coins only, the result written in. */
export const OTHER = ["Research", "Create Forgery", "Farm", "Socialise / Build a Network", "Gather Information", "Learn Spells"];

export const ACTIVITIES = {
  income: { label: "Earn Income", hint: "One week of work (six working days). d20 + a skill: DC 10 earns 3 sp a day, DC 15 6 sp, DC 20 1 gp; a failure 1 sp a day." },
  craft: { label: "Craft", hint: "Pay half the market price (a Master a third; +25% in a remote village). 1 day per 25 gp of value (twice as long in the wilderness). On a failure half the gold is lost." },
  brew: { label: "Brew a Potion", hint: "Alchemy and an Alchemist's Toolkit. Pay half the potion's price; 1 day per 25 gp. On a failure half the gold is lost." },
  magicItem: { label: "Make a Magic Item", hint: "Half the item's value on top of the base item; 1 week per 500 gp. A casting-stat check at the end: Hard for Uncommon, Severe for Rare. On a failure half the gold is lost." },
  copySpell: { label: "Copy a Spell", hint: "1 day and 50 gp per spell level, no roll. The spell must be on your class list." },
  scribe: { label: "Scribe a Scroll", hint: "1 week and 100 gp per spell level (a cantrip: 1 day and 10 gp), plus costly components. No more a month than your casting modifier (minimum 1)." },
  research: { label: "Research a Spell", hint: "The GM approves it and sets its level. 1 week and 100 gp per spell level, then a casting-stat check against a Hard DC. On a failure half the gold is lost." },
  learnSkill: { label: "Learn a Skill (NWP)", hint: "A free NWP slot or GM approval. Each tier takes 1 week with a teacher at 25 gp a week." },
  train: { label: "Train", hint: "A teacher, gold paid up front and time. No check is needed." },
  disease: { label: "Treat a Disease", hint: "8 hours a day. A Wisdom (First Aid/Healing) check against the disease's DC once a day; a success cures it." },
  sideQuest: { label: "Side Quest", hint: "Two weeks off-screen, a 2d6 roll at the end of each week; the better one decides. 2-5 a consequence, 6-8 a minor reward, 9+ a major reward. No more than two at a time." },
  other: { label: "Other (the GM rules)", hint: "Research, forgery, farming, building a network, gathering information, learning spells: the time, the cost and what came of it." }
};

/** Earn Income: copper a day for a check total. */
export function incomePerDay(total) {
  if (total >= 20) return 100;
  if (total >= 15) return 60;
  if (total >= 10) return 30;
  return 10;
}

/** Side Quest: the better of two 2d6 rolls decides. */
export function sideQuestResult(a, b) {
  const best = Math.max(a, b);
  return { best, text: best >= 9 ? "a major reward" : best >= 6 ? "a minor reward" : "a consequence" };
}

/** The highest spell level a character can cast (for Making Magic Items). */
export function highestSpellLevel(actor) {
  let best = 0;
  for (const c of actor?.system?.casters ?? []) c.slots?.forEach((s, n) => { if (n > 0 && s.total > 0) best = Math.max(best, n); });
  return best;
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : d);

/**
 * Work out an activity from the form's values: { days, costCp, title, check, warn }.
 * check: null, or { type: "skill", skillId, dc, master } / { type: "ability", ability, dc } / { type: "income", skillId } /
 *        { type: "daily", ability, skillId, dc, days } / { type: "sideQuest" }.
 */
export function planDowntime(key, v, actor) {
  const warn = [];
  const skills = (actor?.items ?? []).filter(i => i.type === "skill");
  const skill = id => skills.find(s => s.id === id) ?? null;
  const tierDc = (tier, custom) => (tier === "custom" ? num(custom, 15) : TIERS[tier]?.dc ?? 15);
  const castStat = () => {
    const c = (actor?.system?.casters ?? [])[0];
    return c?.ability || "int";
  };
  switch (key) {
    case "income":
      return { title: skill(v.skill)?.name ?? "Untrained", days: 6, costCp: 0, check: { type: "income", skillId: v.skill || "" }, warn };
    case "craft":
    case "brew": {
      const value = Math.max(0, num(v.value));
      const s = skill(v.skill);
      const master = s?.system?.tier === "master";
      const remote = v.place === "remote";
      const wild = v.place === "wild";
      if (key === "brew" && !/alchemy/i.test(s?.name ?? "")) warn.push("Brewing needs the Alchemy skill.");
      if (!s) warn.push("Untrained: a plain d20 with no modifier.");
      let cost = value * 100 * (master ? 1 / 3 : 1 / 2);
      if (remote) cost *= 1.25;
      const days = Math.max(1, Math.ceil(value / 25)) * (wild ? 2 : 1);
      return { title: v.item || "An item", days, costCp: Math.ceil(cost), check: { type: "skill", skillId: s?.id ?? "", dc: tierDc(v.tier, v.dc), master }, warn, failHalf: true };
    }
    case "magicItem": {
      const value = Math.max(0, num(v.value));
      const need = { uncommon: 3, rare: 5, veryRare: 7 }[v.rarity] ?? 3;
      if (highestSpellLevel(actor) < need) warn.push(`Needs a caster who can cast ${ARNEYAN.spellLevels[need]}-level spells.`);
      if (v.rarity !== "uncommon") warn.push("A Rare or Very Rare item also needs a Special Material, which the gold does not cover.");
      const dc = v.rarity === "rare" ? 20 : v.rarity === "veryRare" ? num(v.dc, 20) : 15;
      return { title: v.item || "A magic item", days: Math.max(1, Math.ceil(value / 500)) * WEEK, costCp: Math.ceil(value * 50), check: { type: "ability", ability: castStat(), dc }, warn, failHalf: true };
    }
    case "copySpell": {
      const lvl = Math.clamp(num(v.level, 1), 1, 9);
      return { title: v.spell || `A ${ARNEYAN.spellLevels[lvl]}-level spell`, days: lvl, costCp: 5000 * lvl, check: null, warn };
    }
    case "scribe": {
      const lvl = Math.clamp(num(v.level, 1), 0, 9);
      return { title: v.spell ? `Scroll of ${v.spell}` : "A scroll", days: lvl ? lvl * WEEK : 1, costCp: lvl ? 10000 * lvl : 1000, check: null, warn: ["Add any costly components yourself."] };
    }
    case "research": {
      const lvl = Math.clamp(num(v.level, 1), 1, 9);
      return { title: v.spell || "A new spell", days: lvl * WEEK, costCp: 10000 * lvl, check: { type: "ability", ability: castStat(), dc: 15 }, warn, failHalf: true };
    }
    case "learnSkill": {
      const tiers = Math.clamp(num(v.tiers, 1), 1, 2);
      return { title: v.skillName || "A skill", days: tiers * WEEK, costCp: tiers * 2500, check: null, warn };
    }
    case "train": {
      const t = TRAINING[v.training] ?? TRAINING.weapon;
      return { title: `${t.label}${v.what ? `: ${v.what}` : ""}`, days: t.weeks * WEEK, costCp: t.gp * 100, check: null, warn };
    }
    case "disease": {
      const s = skills.find(x => /first aid|healing/i.test(x.name)) ?? null;
      return { title: v.disease || "A disease", days: Math.clamp(num(v.days, 7), 1, 60), costCp: 0, check: { type: "daily", ability: "wis", skillId: s?.id ?? "", dc: num(v.dc, 12) }, warn };
    }
    case "sideQuest":
      return { title: v.quest || "A side quest", days: 2 * WEEK, costCp: 0, check: { type: "sideQuest" }, warn };
    default:
      return { title: v.kind || OTHER[0], days: Math.max(0, Math.round(num(v.days, 1))), costCp: Math.round(Math.max(0, num(v.cost)) * 100), check: null, warn, result: String(v.result ?? "") };
  }
}

/* -------------------------------------------- */
/*  Doing it                                    */
/* -------------------------------------------- */

/** A check's total from a roll card the actor's own roll methods post (so Luck can still be burned on it). */
async function rollCheck(actor, { skillId = "", ability = "" }) {
  const item = skillId ? actor.items.get(skillId) : null;
  const msg = item ? await actor.rollSkill(item) : ability ? await actor.rollAbility(ability) : await actor.rollSkill(null);
  return Number(msg?.flags?.[SYS]?.total ?? msg?.rolls?.[0]?.total ?? 0);
}

/** A quiet d20 for checks repeated day after day (one card lists them all). */
function dailyBonus(actor, { skillId, ability }) {
  const s = skillId ? actor.items.get(skillId) : null;
  if (s) { const m = actor.system.abilities[s.system.ability].mod; return { bonus: m <= 0 ? 1 : m, adv: s.system.tier === "master" }; }
  return { bonus: actor.system.abilities[ability]?.mod ?? 0, adv: false };
}

/** Run an activity: pay, roll, settle coins, log it and post a card. */
export async function runDowntime(actor, key, values, { paid = false } = {}) {
  const act = ACTIVITIES[key];
  if (!act || !actor?.isOwner) return null;
  const plan = planDowntime(key, values, actor);
  let purse = { ...actor.system.currency };
  if (plan.costCp > 0 && !paid) {
    const after = payCoins(purse, plan.costCp);
    if (!after) { ui.notifications.warn(`${actor.name} has ${cpText(toCp(purse))}; this costs ${cpText(plan.costCp)}.`); return null; }
    purse = after;
  }
  let result = plan.result ?? "";
  let roll = "";
  let refund = 0, earn = 0, days = plan.days;
  const c = plan.check;
  if (c?.type === "income") {
    const total = await rollCheck(actor, { skillId: c.skillId });
    const perDay = incomePerDay(total);
    earn = perDay * 6;
    roll = `${total}`;
    result = `Earned ${cpText(earn)} (${cpText(perDay)} a day for 6 days).`;
  } else if (c?.type === "skill" || c?.type === "ability") {
    const total = await rollCheck(actor, c);
    const ok = total >= c.dc;
    roll = `${total} vs DC ${c.dc}`;
    if (ok) result = `Success: ${plan.title} is finished.`;
    else {
      refund = plan.failHalf && !paid ? Math.floor(plan.costCp / 2) : 0;
      result = `Failure: the time is spent and it isn't finished; half the gold is lost${refund ? ` (${cpText(refund)} kept)` : ""}.`;
    }
  } else if (c?.type === "daily") {
    const { bonus, adv } = dailyBonus(actor, c);
    const rolls = [];
    let cured = 0;
    for (let d = 1; d <= plan.days; d++) {
      const r = await new Roll(`${adv ? "2d20kh" : "1d20"} + ${bonus}`).evaluate();
      rolls.push(r.total);
      if (r.total >= c.dc) { cured = d; break; }
    }
    days = cured || plan.days;
    roll = `${rolls.join(", ")} vs DC ${c.dc}`;
    result = cured ? `Cured on day ${cured}.` : `Not cured after ${plan.days} days.`;
  } else if (c?.type === "sideQuest") {
    const a = (await new Roll("2d6").evaluate()).total, b = (await new Roll("2d6").evaluate()).total;
    const r = sideQuestResult(a, b);
    roll = `${a} and ${b}`;
    result = `Best roll ${r.best}: ${r.text} (the GM decides what).`;
  }
  if (refund || earn) purse = addCoins(purse, refund + earn);
  const entry = {
    id: foundry.utils.randomID(), key, activity: act.label, title: plan.title, days,
    cost: plan.costCp ? `${cpText(plan.costCp)}${paid ? " (paid already)" : ""}` : "", costCp: plan.costCp, result, roll,
    when: gameWhen(), worldTime: game.time?.worldTime ?? 0
  };
  const log = [...(actor.getFlag(SYS, "downtime") ?? []), entry];
  const upd = { [`flags.${SYS}.downtime`]: log };
  if (plan.costCp > 0 && !paid || refund || earn) Object.assign(upd, Object.fromEntries(Object.entries(purse).map(([k, v]) => [`system.currency.${k}`, v])));
  await actor.update(upd);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-hourglass-half"></i> <span>${esc(actor.name)}: ${esc(act.label)}</span></header>
      <p><strong>${esc(plan.title)}</strong> · ${days} day${days === 1 ? "" : "s"}${entry.cost ? ` · ${esc(entry.cost)}` : ""}</p>
      ${roll ? `<p class="arn-card-meta">Rolled ${esc(roll)}</p>` : ""}${result ? `<p>${esc(result)}</p>` : ""}${plan.warn.length ? `<p class="arn-card-meta">${plan.warn.map(esc).join(" ")}</p>` : ""}</div>`
  });
  return entry;
}

/** The New activity window. */
export async function newDowntime(actor) {
  if (!actor?.isOwner || actor.type !== "character") return;
  const skills = actor.items.filter(i => i.type === "skill").sort((a, b) => a.name.localeCompare(b.name));
  const skillSel = (name, pick = null) => `<select name="${name}"><option value="">Untrained (plain d20)</option>${skills.map(s => `<option value="${s.id}" ${pick?.(s) ? "selected" : ""}>${esc(s.name)} (${esc(ARNEYAN.skillTiers[s.system.tier] ?? s.system.tier)})</option>`).join("")}</select>`;
  const tierSel = name => `<select name="${name}">${Object.entries(TIERS).map(([k, t]) => `<option value="${k}" ${k === "hard" ? "selected" : ""}>${t.label} (DC ${t.dc})</option>`).join("")}<option value="custom">Another DC</option></select>`;
  const f = (label, html) => `<label class="arn-dt-field"><span>${label}</span>${html}</label>`;
  const sections = {
    income: f("Skill", skillSel("income.skill")),
    craft: [f("Item", `<input type="text" name="craft.item" placeholder="A longsword">`), f("Value (gp)", `<input type="number" name="craft.value" value="15" min="0">`), f("Skill", skillSel("craft.skill")),
      f("Difficulty", tierSel("craft.tier")), f("Other DC", `<input type="number" name="craft.dc" value="15">`),
      f("Where", `<select name="craft.place"><option value="city">Large town or city</option><option value="remote">Remote village (+25% gold)</option><option value="wild">Wilderness (twice as long)</option></select>`)].join(""),
    brew: [f("Potion", `<input type="text" name="brew.item" placeholder="Potion of Healing">`), f("Value (gp)", `<input type="number" name="brew.value" value="50" min="0">`),
      f("Skill", skillSel("brew.skill", s => /alchemy/i.test(s.name))), f("Difficulty", tierSel("brew.tier")), f("Other DC", `<input type="number" name="brew.dc" value="15">`),
      f("Where", `<select name="brew.place"><option value="city">Large town or city</option><option value="remote">Remote village (+25% gold)</option><option value="wild">Wilderness (twice as long)</option></select>`)].join(""),
    magicItem: [f("Item", `<input type="text" name="magicItem.item" placeholder="Wand of Magic Missiles">`), f("Value (gp)", `<input type="number" name="magicItem.value" value="450" min="0">`),
      f("Rarity", `<select name="magicItem.rarity"><option value="uncommon">Uncommon (Hard)</option><option value="rare">Rare (Severe)</option><option value="veryRare">Very Rare (the GM sets the DC)</option></select>`), f("Very Rare DC", `<input type="number" name="magicItem.dc" value="20">`)].join(""),
    copySpell: [f("Spell", `<input type="text" name="copySpell.spell">`), f("Spell level", `<input type="number" name="copySpell.level" value="1" min="1" max="9">`)].join(""),
    scribe: [f("Spell", `<input type="text" name="scribe.spell">`), f("Spell level (0 for a cantrip)", `<input type="number" name="scribe.level" value="1" min="0" max="9">`)].join(""),
    research: [f("Spell", `<input type="text" name="research.spell">`), f("Spell level (the GM sets it)", `<input type="number" name="research.level" value="1" min="1" max="9">`)].join(""),
    learnSkill: [f("Skill", `<input type="text" name="learnSkill.skillName">`), f("Tiers", `<select name="learnSkill.tiers"><option value="1">One (Trained, or Trained to Master)</option><option value="2">Two (to Master)</option></select>`)].join(""),
    train: [f("Training", `<select name="train.training">${Object.entries(TRAINING).map(([k, t]) => `<option value="${k}">${esc(t.label)}: ${t.weeks} weeks, ${t.gp} gp</option>`).join("")}</select>`), f("Which", `<input type="text" name="train.what" placeholder="Longbow, chain mail, a feat">`)].join(""),
    disease: [f("Disease", `<input type="text" name="disease.disease">`), f("Its DC", `<input type="number" name="disease.dc" value="12">`), f("Days at most", `<input type="number" name="disease.days" value="7" min="1">`)].join(""),
    sideQuest: f("Quest", `<input type="text" name="sideQuest.quest">`),
    other: [f("Activity", `<select name="other.kind">${OTHER.map(o => `<option>${esc(o)}</option>`).join("")}</select>`), f("Days", `<input type="number" name="other.days" value="7" min="0">`),
      f("Cost (gp)", `<input type="number" name="other.cost" value="0" min="0" step="0.01">`), f("What came of it", `<input type="text" name="other.result">`)].join("")
  };
  const content = `<div class="arn-dt-dialog">
    <label class="arn-dt-field"><span>Activity</span><select name="activity">${Object.entries(ACTIVITIES).map(([k, a]) => `<option value="${k}">${esc(a.label)}</option>`).join("")}</select></label>
    ${Object.entries(sections).map(([k, html]) => `<section data-activity="${k}"><p class="arn-muted">${esc(ACTIVITIES[k].hint)}</p>${html}</section>`).join("")}
    <label class="arn-check"><input type="checkbox" name="paid"> Paid already (take no coins)</label>
    <p class="arn-muted">${esc(actor.name)} has ${cpText(toCp(actor.system.currency))}.</p></div>`;
  const read = form => {
    const key = form.elements.activity.value;
    const values = {};
    for (const el of form.querySelectorAll(`[name^="${key}."]`)) values[el.name.slice(key.length + 1)] = el.type === "checkbox" ? el.checked : el.value;
    return { key, values, paid: !!form.elements.paid?.checked };
  };
  const pick = await foundry.applications.api.DialogV2.wait({
    window: { title: `${actor.name}: downtime`, icon: "fa-solid fa-hourglass-half" }, classes: ["arneyan", "arn-dt-app"], position: { width: 500 }, content,
    buttons: [{ action: "go", label: "Do it", icon: "fa-solid fa-check", default: true, callback: (ev, btn) => read(btn.form) }, { action: "cancel", label: "Cancel" }],
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog?.element ?? event?.target?.element;
      const sel = root?.querySelector("select[name=activity]");
      const show = () => root.querySelectorAll("section[data-activity]").forEach(s => { s.hidden = s.dataset.activity !== sel.value; });
      sel?.addEventListener("change", show);
      if (sel) show();
    }
  });
  if (!pick || typeof pick !== "object") return;
  return runDowntime(actor, pick.key, pick.values, { paid: pick.paid });
}

/** The Downtime tab: the log, newest first, and the totals. */
export function downtimeContext(actor) {
  const log = actor?.flags?.[SYS]?.downtime ?? [];
  const rows = [...log].reverse();
  return { downtime: { rows, days: log.reduce((t, e) => t + (Number(e.days) || 0), 0), spent: cpText(log.reduce((t, e) => t + (Number(e.costCp) || 0), 0)), any: log.length > 0 } };
}

export async function deleteDowntime(actor, id) {
  if (!actor?.isOwner) return;
  const log = (actor.getFlag(SYS, "downtime") ?? []).filter(e => e.id !== id);
  return actor.setFlag(SYS, "downtime", log);
}

/** Change what came of an entry (the GM's ruling, a reward named). */
export async function editDowntime(actor, id) {
  if (!actor?.isOwner) return;
  const log = foundry.utils.deepClone(actor.getFlag(SYS, "downtime") ?? []);
  const e = log.find(x => x.id === id);
  if (!e) return;
  const text = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${e.activity}: result` }, classes: ["arneyan"],
    content: `<label class="arn-dt-field"><span>What came of it</span><input type="text" name="result" value="${esc(e.result)}" autofocus></label>`,
    ok: { label: "Save", callback: (ev, btn) => btn.form.elements.result.value }, rejectClose: false
  }).catch(() => null);
  if (typeof text !== "string") return;
  e.result = text;
  return actor.setFlag(SYS, "downtime", log);
}

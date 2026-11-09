/**
 * The Downtime log (Drop 4): a record on each character of what it did between adventures, following the Codex
 * (Downtime Rules; Training & Instruction; Crafting; Making Magic Items; Scribing, Scrolls & Potions). Each entry
 * spends days and coins and, where the Codex gives one, rolls the check and works out the result. Kept in
 * flags.arneyan.downtime as [{ id, key, activity, title, days, cost, costCp, result, roll, when, worldTime }].
 */
import { ARNEYAN } from "./config.mjs";
import { gameWhen } from "./worldtime.mjs";
import { priceText } from "./money.mjs";

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
  if (!n) return "0 sp";
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
  weapon: { label: "Weapon proficiency (one weapon)", weeks: 2, sp: 50 },
  shield: { label: "Shield training", weeks: 2, sp: 50 },
  armourLight: { label: "Armour training: Light or Medium (one type)", weeks: 4, sp: 150 },
  armourHeavy: { label: "Armour training: Heavy (one type)", weeks: 8, sp: 500 },
  feat: { label: "Trained Feat (gold by Tier, then a DC 15 check)", weeks: 12, sp: 750 }
};
/** Books v0.10.47 (K54): a Trained Feat's gold by Tier of Play (1st-4th, 5th-10th, 11th-16th, 17th on). */
export function trainedFeatGold(level) {
  const l = Number(level) || 1;
  return l >= 17 ? 6000 : l >= 11 ? 3000 : l >= 5 ? 1500 : 750;
}
/** Books v0.10.47 (K54): learning a skill. Trained 2 weeks at 25 sp a week (DC 10); Master 4 more weeks at 5 gp (DC 15). */
export const SKILL_COURSE = { trained: { weeks: 2, sp: 25, dc: 10 }, master: { weeks: 4, sp: 50, dc: 15 } };
/** Carousing (the Shopkeeper's Catalogue, HB v0.10.53, K62): a week's gold by Tier of Play. */
export function carouseGold(level) {
  const l = Number(level) || 1;
  return l >= 17 ? 10000 : l >= 11 ? 2500 : l >= 5 ? 500 : 100;
}
/** Activities the GM rules on: time and coins only, the result written in. */
export const OTHER = ["Research", "Create Forgery", "Farm", "Socialise / Build a Network", "Gather Information", "Learn Spells"];

export const ACTIVITIES = {
  income: { label: "Earn Income", hint: "One week of work (six working days). d20 + a skill: DC 10 earns 1 sp a day, DC 15 3 sp, DC 20 1 gp; a failure 3 cp a day." },
  craft: { label: "Craft", hint: "Pay half the market price (a Master a third; +25% in a remote village). 1 day per 25 sp of value (twice as long in the wilderness). On a failure half the gold is lost." },
  brew: { label: "Brew a Potion", hint: "Alchemy and an Alchemist's Toolkit. Pay half the potion's price; 1 day per 25 sp. On a failure half the gold is lost." },
  magicItem: { label: "Make a Magic Item", hint: "Half the item's value on top of the base item; 1 week per 50 gp. A casting-stat check at the end: Hard for Uncommon, Severe for Rare. On a failure half the gold is lost." },
  copySpell: { label: "Copy a Spell", hint: "1 day and 5 gp per spell level, no roll. The spell must be on your class list." },
  scribe: { label: "Scribe a Scroll", hint: "1 week and 10 gp per spell level (a cantrip: 1 day and 1 gp), plus costly components. No more a month than your casting modifier (minimum 1)." },
  research: { label: "Research a Spell", hint: "The GM approves it and sets its level. 1 week and 10 gp per spell level, then a casting-stat check against a Hard DC. On a failure half the gold is lost." },
  learnSkill: { label: "Learn a Skill (NWP)", hint: "No limit. Trained: 2 weeks with a teacher at 25 sp a week, then a DC 10 check with the skill's attribute. Master: 4 more weeks at 5 gp a week with a Master teacher, then DC 15. A failure: 1 more week, its gold, and roll again. Skilled halves the time." },
  train: { label: "Train", hint: "A teacher, gold paid up front and time. Weapon, shield and armour training need no check. A Trained Feat: one per Tier, 12 weeks, gold by Tier, then a DC 15 check with the feat's attribute; a failure is 2 more weeks and their gold." },
  studySecret: { label: "Study a Secret", hint: "The Secret in hand (Monsters & Treasure). Its listed weeks, then a check (Intelligence unless it names another) against its DC; a failure is 2 more weeks and roll again. Your one course at a time." },
  carouse: { label: "Carouse", hint: "A week of drink, dice and good company. Gold by Tier (10, 50, 250 or 1,000 gp), a Charisma check (DC 12), then a d20 on the Carousing table, +5 if the check succeeded." },
  disease: { label: "Treat a Disease", hint: "8 hours a day. A Wisdom (First Aid/Healing) check against the disease's DC once a day; a success cures it." },
  sideQuest: { label: "Side Quest", hint: "Two weeks off-screen, a 2d6 roll at the end of each week; the better one decides. 2-5 a consequence, 6-8 a minor reward, 9+ a major reward. No more than two at a time." },
  other: { label: "Other (the GM rules)", hint: "Research, forgery, farming, building a network, gathering information, learning spells: the time, the cost and what came of it." }
};

/** Earn Income: copper a day for a check total (silver standard, books v0.10.55: 1 sp, 3 sp, 1 gp; 3 cp on a failure). */
export function incomePerDay(total) {
  if (total >= 20) return 100;
  if (total >= 15) return 30;
  if (total >= 10) return 10;
  return 3;
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
      // Typed in gold (books v0.10.59, K103); worked in sp.
      const value = Math.round(Math.max(0, num(v.value)) * 1000) / 100;
      const s = skill(v.skill);
      const master = s?.system?.tier === "master";
      const remote = v.place === "remote";
      const wild = v.place === "wild";
      if (key === "brew" && !/alchemy/i.test(s?.name ?? "")) warn.push("Brewing needs the Alchemy skill.");
      if (!s) warn.push("Untrained: a plain d20 with no modifier.");
      // Values in sp (silver standard, books v0.10.55).
      let cost = value * 10 * (master ? 1 / 3 : 1 / 2);
      if (remote) cost *= 1.25;
      const days = Math.max(1, Math.ceil(value / 25)) * (wild ? 2 : 1);
      return { title: v.item || "An item", days, costCp: Math.ceil(cost), check: { type: "skill", skillId: s?.id ?? "", dc: tierDc(v.tier, v.dc), master }, warn, failHalf: true };
    }
    case "magicItem": {
      // Typed in gold (books v0.10.59, K103); worked in sp.
      const value = Math.round(Math.max(0, num(v.value)) * 1000) / 100;
      const need = { uncommon: 3, rare: 5, veryRare: 7 }[v.rarity] ?? 3;
      if (highestSpellLevel(actor) < need) warn.push(`Needs a caster who can cast ${ARNEYAN.spellLevels[need]}-level spells.`);
      if (v.rarity !== "uncommon") warn.push("A Rare or Very Rare item also needs a Special Material, which the gold does not cover.");
      const dc = v.rarity === "rare" ? 20 : v.rarity === "veryRare" ? num(v.dc, 20) : 15;
      return { title: v.item || "A magic item", days: Math.max(1, Math.ceil(value / 500)) * WEEK, costCp: Math.ceil(value * 5), check: { type: "ability", ability: castStat(), dc }, warn, failHalf: true };
    }
    case "copySpell": {
      const lvl = Math.clamp(num(v.level, 1), 1, 9);
      return { title: v.spell || `A ${ARNEYAN.spellLevels[lvl]}-level spell`, days: lvl, costCp: 500 * lvl, check: null, warn };
    }
    case "scribe": {
      const lvl = Math.clamp(num(v.level, 1), 0, 9);
      return { title: v.spell ? `Scroll of ${v.spell}` : "A scroll", days: lvl ? lvl * WEEK : 1, costCp: lvl ? 1000 * lvl : 100, check: null, warn: ["Add any costly components yourself."] };
    }
    case "research": {
      const lvl = Math.clamp(num(v.level, 1), 1, 9);
      return { title: v.spell || "A new spell", days: lvl * WEEK, costCp: 1000 * lvl, check: { type: "ability", ability: castStat(), dc: 15 }, warn, failHalf: true };
    }
    case "learnSkill": {
      // A typed name the character already has counts as that skill (no Trained course for a skill already Trained).
      const typed = String(v.skillName ?? "").trim();
      const s = skill(v.skill) ?? (typed ? skills.find(x => x.name.toLowerCase() === typed.toLowerCase()) : null) ?? null;
      if (!s && !typed) return { title: "A skill", days: 0, costCp: 0, check: null, warn, block: "Pick a skill to make Master, or type a new skill's name." };
      if (s?.system?.tier === "master") return { title: s.name, days: 0, costCp: 0, check: null, warn, block: `${s.name} is already Master.` };
      const goal = s?.system?.tier === "trained" || v.goal === "master" ? "master" : "trained";
      if (goal === "master" && !s) warn.push("Master needs the skill at Trained first: pick it from the list.");
      const c = SKILL_COURSE[goal];
      // Skilled (K54): skills in half the time; the gold is weekly, so half the gold too.
      const skilled = (actor?.items ?? []).some(i => i.type === "feat" && i.name === "Skilled");
      const weeks = skilled ? c.weeks / 2 : c.weeks;
      const name = s?.name ?? typed;
      // A new skill's attribute: the one picked, else the compendium skill's own (looked up when it runs), else Intelligence.
      const ability = s?.system?.ability || v.ability || "";
      return { title: `${name} (${goal === "master" ? "Master" : "Trained"})`, days: weeks * WEEK, costCp: weeks * c.sp * 10,
        check: { type: "ability", ability, dc: c.dc }, retry: { days: WEEK, costCp: c.sp * 10 },
        learn: { skillId: s?.id ?? "", name, ability, tier: goal }, warn: skilled ? [...warn, "Skilled: half the time."] : warn };
    }
    case "train": {
      const t = TRAINING[v.training] ?? TRAINING.weapon;
      if (v.training === "feat") {
        // Trained Feats (books v0.10.47, K54): gold by Tier, a DC 15 check with the feat's attribute; 2 more weeks on a failure.
        const sp = trainedFeatGold(actor?.system?.level);
        // Weapon Master (books v0.10.49, K57): no check at the end; you're already trained in the weapon.
        if (/^weapon master\b/i.test(String(v.what ?? "").trim())) return { title: `Trained Feat: Weapon Master`, days: t.weeks * WEEK, costCp: sp * 10,
          offerFeat: "Weapon Master", check: null, warn: [...warn, "Weapon Master needs training in the weapon (never a Fighter's specialised one); no check at the end."] };
        return { title: `Trained Feat${v.what ? `: ${v.what}` : ""}`, days: t.weeks * WEEK, costCp: sp * 10, offerFeat: String(v.what ?? "").trim(),
          check: { type: "ability", ability: v.ability || "str", dc: 15 }, retry: { days: 2 * WEEK, costCp: Math.round(sp * 10 / t.weeks) * 2 },
          warn: [...warn, "One Trained Feat per Tier, from a Path open to you; the master also names a price (d6)."] };
      }
      return { title: `${t.label}${v.what ? `: ${v.what}` : ""}`, days: t.weeks * WEEK, costCp: t.sp * 10, check: null, warn };
    }
    case "studySecret": {
      // M&T v0.10.45 (K55): the Secret's weeks, then its check; 2 more weeks on a failure (no gold).
      const it = (actor?.items ?? []).find(i => i.id === v.secret);
      const st = it?.flags?.[SYS]?.secret ?? {};
      const weeks = Math.max(1, num(v.weeks, st.weeks || 4));
      const ability = v.ability || st.ability || "int";
      const dc = num(v.dc, st.dc || 15);
      if (!it) warn.push("Study needs the Secret in hand, or to be with it.");
      return { title: it?.name ?? (String(v.name ?? "").trim() || "A Secret"), days: weeks * WEEK, costCp: 0,
        check: { type: "ability", ability, dc }, retry: { days: 2 * WEEK, costCp: 0 }, warn };
    }
    case "disease": {
      const s = skills.find(x => /first aid|healing/i.test(x.name)) ?? null;
      return { title: v.disease || "A disease", days: Math.clamp(num(v.days, 7), 1, 60), costCp: 0, check: { type: "daily", ability: "wis", skillId: s?.id ?? "", dc: num(v.dc, 12) }, warn };
    }
    case "carouse":
      return { title: "A week of carousing", days: WEEK, costCp: carouseGold(actor?.system?.level) * 10, check: { type: "carouse", ability: "cha", dc: 12 }, warn };
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
async function rollCheck(actor, { skillId = "", ability = "" }, adv = 0, sink = null) {
  const item = skillId ? actor.items.get(skillId) : null;
  // Advantage and Disadvantage can be chosen in the window before the roll, with the rules' own; the card's buttons
  // work the result out again afterwards where that's simple (income, a single check), or say what changed
  // (redo.mjs, downtimeChanged).
  const event = adv ? { shiftKey: adv > 0, ctrlKey: adv < 0 } : null;
  const opts = { auto: true };
  const msg = item ? await actor.rollSkill(item, event, opts) : ability ? await actor.rollAbility(ability, event, opts) : await actor.rollSkill(null, event, opts);
  if (msg && sink) sink.push(msg);
  return Number(msg?.flags?.[SYS]?.total ?? msg?.rolls?.[0]?.total ?? 0);
}

/** A quiet d20 for checks repeated day after day (one card lists them all). */
function dailyBonus(actor, { skillId, ability }) {
  const s = skillId ? actor.items.get(skillId) : null;
  if (s) { const m = actor.system.abilities[s.system.ability].mod; return { bonus: m <= 0 ? 1 : m, adv: s.system.tier === "master" }; }
  return { bonus: actor.system.abilities[ability]?.mod ?? 0, adv: false };
}

/** A skill learned in downtime (K54): a Trained skill made Master, or a new one at Trained (from the compendium if it's there). */
async function learnSkill(actor, { skillId, name, ability, tier }) {
  const own = skillId ? actor.items.get(skillId) : actor.items.find(i => i.type === "skill" && i.name.toLowerCase() === String(name).toLowerCase());
  if (own) {
    if (tier === "master" || own.system.tier === "knack") await own.update({ "system.tier": tier === "master" ? "master" : "trained" });
    return own;
  }
  const pack = game.packs.get(`${SYS}.skills`);
  const entry = pack ? (await pack.getIndex()).find(e => e.name.toLowerCase() === String(name).toLowerCase()) : null;
  const data = entry ? (await pack.getDocument(entry._id)).toObject() : { name, type: "skill", system: { ability } };
  if (entry) foundry.utils.setProperty(data, "_stats.compendiumSource", entry.uuid ?? `Compendium.${pack.collection}.Item.${entry._id}`);
  foundry.utils.setProperty(data, "system.tier", "trained");
  const [made] = await actor.createEmbeddedDocuments("Item", [data]);
  return made;
}

/** Books v0.10.47 (K54): feats that can't be taught. */
export const UNTEACHABLE = ["Diehard", "Fated Survivor", "Inscrutable Fate", "Lucky", "Quick Recovery", "Luck Battery", "Skilled Regeneration",
  "Fate's Reversal", "Blood Magic", "Expanded Mind", "Potent Casting", "Familiar Bond"];

/** A Trained Feat's copy: no attribute +1 (K54), marked as the Tier's Trained Feat. Pure, for the window and tests. */
export function trainedFeatData(data, level) {
  const out = foundry.utils.deepClone(data);
  delete out._id;
  out.folder = null;
  out.system ??= {};
  out.system.rules = (out.system.rules ?? []).filter(r => !/^ability\.(str|dex|con|int|wis|cha)$/.test(String(r?.key ?? "")));
  if (out.system.abilityChoice) out.system.abilityChoice = { ...out.system.abilityChoice, options: [], value: "" };
  out.system.levelTaken = Number(level) || 0;
  foundry.utils.setProperty(out, `flags.${SYS}.trainedFeat`, { gold: trainedFeatGold(level), level: Number(level) || 0 });
  return out;
}

/** After a Trained Feat's check succeeds (Kieran, 4 Nov): ask whether to put the feat on the sheet. */
async function addTrainedFeat(actor, typed) {
  const pack = game.packs.get(`${SYS}.feats`);
  if (!pack) return;
  const index = [...(await pack.getIndex({ fields: ["system.path", "system.alsoPaths"] }))].filter(e => e.type === "feat" && !UNTEACHABLE.includes(e.name) && e.system?.path)
    .sort((a, b) => a.name.localeCompare(b.name));
  // Weapon Master can be taken again for another weapon (K57), so it stays on the list.
  const owned = new Set(actor.items.filter(i => i.type === "feat" && i.name !== "Weapon Master").map(i => i.name));
  // The typed feat, if it's teachable and not already on the sheet (else the player picks; never a silent first entry).
  const open = index.filter(e => !owned.has(e.name));
  const match = open.find(e => e.name.toLowerCase() === String(typed).toLowerCase());
  const already = owned.has(index.find(e => e.name.toLowerCase() === String(typed).toLowerCase())?.name);
  const opts = open.map(e => `<option value="${e._id}" ${e === match ? "selected" : ""}>${esc(e.name)} (${esc([e.system.path, ...(e.system.alsoPaths ?? [])].join(", "))})</option>`).join("");
  const pick = await foundry.applications.api.DialogV2.wait({
    window: { title: `${actor.name}: Trained Feat learned`, icon: "fa-solid fa-graduation-cap" }, classes: ["arneyan"], position: { width: 440 },
    content: `<p>${esc(actor.name)} has learned ${match ? `<strong>${esc(match.name)}</strong>` : "a Trained Feat"}. Add it to the sheet?${already ? ` (${esc(typed)} is on the sheet already.)` : ""}</p>
      <label class="arn-dt-field"><span>Feat</span><select name="feat">${match ? "" : `<option value="">Choose the feat</option>`}${opts}</select></label>
      <p class="arn-muted">A Trained Feat gives no attribute +1 and uses no feat level; one per Tier. No adds nothing (in case of a mistake); the gold and weeks stay spent either way.</p>`,
    buttons: [{ action: "yes", label: "Yes, add it", icon: "fa-solid fa-check", default: true, callback: (ev, btn) => btn.form.elements.feat.value || "none" },
      { action: "no", label: "No" }],
    rejectClose: false
  }).catch(() => null);
  if (!pick || pick === "no") return;
  if (pick === "none") return ui.notifications.warn("No feat picked: nothing added. Add it from the Feats compendium.");
  const doc = await pack.getDocument(pick);
  if (!doc) return;
  const data = trainedFeatData(doc.toObject(), actor.system?.level);
  foundry.utils.setProperty(data, "_stats.compendiumSource", doc.uuid);
  await actor.createEmbeddedDocuments("Item", [data]);
  ui.notifications.info(`${doc.name} added to ${actor.name} as a Trained Feat.`);
}

/** Run an activity: pay, roll, settle coins, log it and post a card. */
export async function runDowntime(actor, key, values, { paid = false, adv = 0 } = {}) {
  const act = ACTIVITIES[key];
  if (!act || !actor?.isOwner) return null;
  const plan = planDowntime(key, values, actor);
  if (plan.block) { ui.notifications.warn(plan.block); return null; }
  // A new skill with no attribute picked: the compendium skill's own.
  if (plan.check?.type === "ability" && !plan.check.ability) {
    const pack = game.packs.get(`${SYS}.skills`);
    const entry = pack ? (await pack.getIndex({ fields: ["system.ability"] })).find(e => e.name.toLowerCase() === String(plan.learn?.name ?? "").toLowerCase()) : null;
    plan.check.ability = entry?.system?.ability || "int";
    // A Rogue or Assassin rolls Climb with Dexterity (books v0.10.49; Kieran 4 Nov for the Assassin).
    const { thiefDexFor } = await import("./progression.mjs");
    const lv = {}; for (const c of actor.items.filter(i => i.type === "class")) lv[c.name] = (lv[c.name] ?? 0) + (Number(c.system.levels) || 0);
    if (thiefDexFor(lv).some(n => n.toLowerCase() === String(plan.learn?.name ?? "").toLowerCase())) plan.check.ability = "dex";
    if (plan.learn) plan.learn.ability = plan.check.ability;
  }
  let purse = { ...actor.system.currency };
  if (plan.costCp > 0 && !paid) {
    const after = payCoins(purse, plan.costCp);
    if (!after) { ui.notifications.warn(`${actor.name} has ${cpText(toCp(purse))}; this costs ${cpText(plan.costCp)}.`); return null; }
    purse = after;
  }
  let result = plan.result ?? "";
  let roll = "";
  let refund = 0, earn = 0, days = plan.days, extraCp = 0;
  const c = plan.check;
  // The check cards rolled, for the second die afterwards (redo.mjs).
  const checks = [];
  if (c?.type === "income") {
    const total = await rollCheck(actor, { skillId: c.skillId }, adv, checks);
    const perDay = incomePerDay(total);
    earn = perDay * 6;
    roll = `${total}`;
    result = `Earned ${cpText(earn)} (${cpText(perDay)} a day for 6 days).`;
  } else if ((c?.type === "skill" || c?.type === "ability") && plan.retry) {
    // Learning (K54, K55): on a failure, more weeks (and their gold) and roll again, until it's learned.
    const rolls = [];
    let total = await rollCheck(actor, c, adv, checks), extraWeeks = 0, tries = 0, broke = false;
    rolls.push(total);
    // The book: keep training and roll again. The extra weeks depend on the rolls, so they're paid now, "paid already" or not.
    while (total < c.dc && tries < 40) {
      if (plan.retry.costCp) {
        const after = payCoins(purse, plan.retry.costCp);
        if (!after) { broke = true; break; }
        purse = after;
      }
      extraCp += plan.retry.costCp;
      days += plan.retry.days;
      extraWeeks += plan.retry.days / WEEK;
      tries++;
      total = await rollCheck(actor, c, adv, checks);
      rolls.push(total);
    }
    roll = `${rolls.join(", ")} vs DC ${c.dc}`;
    if (total >= c.dc) {
      result = `Learned: ${plan.title}${extraWeeks ? ` (${extraWeeks} more week${extraWeeks === 1 ? "" : "s"}${plan.retry.costCp ? `, ${cpText(extraCp)} more` : ""})` : ""}.`;
      if (plan.learn) {
        await learnSkill(actor, plan.learn).catch(err => console.warn("Arneyan | learn skill", err));
        const { syncThiefSkills } = await import("./progression.mjs");
        await syncThiefSkills(actor).catch(err => console.warn("Arneyan | Thief Skills", err));
      }
      if (plan.offerFeat !== undefined) addTrainedFeat(actor, plan.offerFeat).catch(err => console.warn("Arneyan | trained feat", err));
    } else result = `Not yet: ${rolls.length} failed check${rolls.length === 1 ? "" : "s"}${broke ? `, and not enough gold for ${plan.retry.days / WEEK} more week${plan.retry.days === WEEK ? "" : "s"}` : ""}. Carry on later with the extra weeks only, not the whole course.`;
  } else if (c?.type === "skill" || c?.type === "ability") {
    const total = await rollCheck(actor, c, adv, checks);
    const ok = total >= c.dc;
    roll = `${total} vs DC ${c.dc}`;
    if (ok) result = `Success: ${plan.title} is finished.`;
    else {
      refund = plan.failHalf && !paid ? Math.floor(plan.costCp / 2) : 0;
      result = `Failure: the time is spent and it isn't finished; half the gold is lost${refund ? ` (${cpText(refund)} kept)` : ""}.`;
    }
  } else if (c?.type === "daily") {
    const { bonus, adv: master } = dailyBonus(actor, c);
    // A Master's Advantage and the window's choice: one of each cancels.
    const mode = Math.sign((master ? 1 : 0) + Math.sign(adv));
    const rolls = [];
    let cured = 0;
    for (let d = 1; d <= plan.days; d++) {
      const r = await new Roll(`${mode > 0 ? "2d20kh" : mode < 0 ? "2d20kl" : "1d20"} + ${bonus}`).evaluate();
      rolls.push(r.total);
      if (r.total >= c.dc) { cured = d; break; }
    }
    days = cured || plan.days;
    roll = `${rolls.join(", ")} vs DC ${c.dc}`;
    result = cured ? `Cured on day ${cured}.` : `Not cured after ${plan.days} days.`;
  } else if (c?.type === "carouse") {
    // A Charisma check (DC 12), then a d20 on the Carousing table, +5 on a success.
    const total = await rollCheck(actor, { ability: c.ability }, adv, checks);
    const ok = total >= c.dc;
    const r = await new Roll(ok ? "1d20 + 5" : "1d20").evaluate();
    roll = `${total} vs DC ${c.dc}; Carousing ${r.total}`;
    const { drawTableFor } = await import("./chat.mjs");
    const res = await drawTableFor("Carousing", { total: r.total }).catch(err => { console.warn("Arneyan | carousing", err); return null; });
    // A player's client can't read the tables pack: the GM draws it and the card says what happened.
    result = res ? `Carousing ${r.total}${ok ? " (+5 for the check)" : ""}: ${res.name ?? res.text ?? ""}.` : `Carousing ${r.total}${ok ? " (+5 for the check)" : ""}: see the Carousing card.`;
  } else if (c?.type === "sideQuest") {
    const a = (await new Roll("2d6").evaluate()).total, b = (await new Roll("2d6").evaluate()).total;
    const r = sideQuestResult(a, b);
    roll = `${a} and ${b}`;
    result = `Best roll ${r.best}: ${r.text} (the GM decides what).`;
  }
  // A Trained Feat with no end check (Weapon Master, K57): learned when the weeks are done.
  if (!c && plan.offerFeat !== undefined) {
    result ||= `Learned: ${plan.title}.`;
    addTrainedFeat(actor, plan.offerFeat).catch(err => console.warn("Arneyan | trained feat", err));
  }
  if (refund || earn) purse = addCoins(purse, refund + earn);
  const entry = {
    id: foundry.utils.randomID(), key, activity: act.label, title: plan.title, days,
    cost: plan.costCp + extraCp ? `${cpText(plan.costCp + extraCp)}${paid ? ` (${cpText(plan.costCp)} paid already)` : ""}` : "", costCp: plan.costCp + extraCp, result, roll,
    when: gameWhen(), worldTime: game.time?.worldTime ?? 0
  };
  const log = [...(actor.getFlag(SYS, "downtime") ?? []), entry];
  const upd = { [`flags.${SYS}.downtime`]: log };
  if (plan.costCp > 0 && !paid || extraCp > 0 || refund || earn) Object.assign(upd, Object.fromEntries(Object.entries(purse).map(([k, v]) => [`system.currency.${k}`, v])));
  await actor.update(upd);
  // Each check card knows its activity: Advantage or Disadvantage pressed later works it out again (redo.mjs).
  const kind = c?.type === "income" ? "income" : plan.retry ? "retry" : c?.type === "carouse" ? "carouse" : "check";
  const half = plan.failHalf && !paid ? Math.floor(plan.costCp / 2) : 0;
  for (const [i, m] of checks.entries()) {
    if (!m?.canUserModify?.(game.user, "update")) continue;
    await m.setFlag(SYS, "downtime", { actorUuid: actor.uuid, entryId: entry.id, kind, dc: c?.dc ?? null, earn, half, refund, title: plan.title, last: i === checks.length - 1, ok: kind === "check" ? /^Success/.test(result) : null }).catch(() => null);
  }
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
  const abilitySel = (name, pick = "int") => `<select name="${name}">${Object.entries(ARNEYAN.abilities).map(([k, a]) => `<option value="${k}" ${k === pick ? "selected" : ""}>${esc(a)}</option>`).join("")}</select>`;
  const secrets = actor.items.filter(i => i.flags?.[SYS]?.secret && Object.keys(i.flags[SYS].secret).length);
  // The compendium's skills, offered as the new skill is typed (so the name matches and its attribute is found).
  const skillPack = game.packs?.get?.(`${SYS}.skills`);
  const skillNames = skillPack ? [...(await skillPack.getIndex())].map(e => e.name).filter(n => !skills.some(s => s.name === n)).sort() : [];
  const sections = {
    income: f("Skill", skillSel("income.skill")),
    craft: [f("Item", `<input type="text" name="craft.item" placeholder="A longsword">`), f("Value (gp)", `<input type="number" name="craft.value" value="1.5" min="0" step="0.1">`), f("Skill", skillSel("craft.skill")),
      f("Difficulty", tierSel("craft.tier")), f("Other DC", `<input type="number" name="craft.dc" value="15">`),
      f("Where", `<select name="craft.place"><option value="city">Large town or city</option><option value="remote">Remote village (+25% gold)</option><option value="wild">Wilderness (twice as long)</option></select>`)].join(""),
    brew: [f("Potion", `<input type="text" name="brew.item" placeholder="Potion of Healing">`), f("Value (gp)", `<input type="number" name="brew.value" value="5" min="0" step="0.1">`),
      f("Skill", skillSel("brew.skill", s => /alchemy/i.test(s.name))), f("Difficulty", tierSel("brew.tier")), f("Other DC", `<input type="number" name="brew.dc" value="15">`),
      f("Where", `<select name="brew.place"><option value="city">Large town or city</option><option value="remote">Remote village (+25% gold)</option><option value="wild">Wilderness (twice as long)</option></select>`)].join(""),
    magicItem: [f("Item", `<input type="text" name="magicItem.item" placeholder="Wand of Magic Missiles">`), f("Value (gp)", `<input type="number" name="magicItem.value" value="45" min="0" step="0.1">`),
      f("Rarity", `<select name="magicItem.rarity"><option value="uncommon">Uncommon (Hard)</option><option value="rare">Rare (Severe)</option><option value="veryRare">Very Rare (the GM sets the DC)</option></select>`), f("Very Rare DC", `<input type="number" name="magicItem.dc" value="20">`)].join(""),
    copySpell: [f("Spell", `<input type="text" name="copySpell.spell">`), f("Spell level", `<input type="number" name="copySpell.level" value="1" min="1" max="9">`)].join(""),
    scribe: [f("Spell", `<input type="text" name="scribe.spell">`), f("Spell level (0 for a cantrip)", `<input type="number" name="scribe.level" value="1" min="0" max="9">`)].join(""),
    research: [f("Spell", `<input type="text" name="research.spell">`), f("Spell level (the GM sets it)", `<input type="number" name="research.level" value="1" min="1" max="9">`)].join(""),
    learnSkill: [f("A skill you have (Trained to Master, or train a Knack)", `<select name="learnSkill.skill"><option value="">None: a new skill</option>${skills.filter(s => s.system.tier !== "master").map(s => `<option value="${s.id}">${esc(s.name)} (${esc(ARNEYAN.skillTiers[s.system.tier] ?? s.system.tier)})</option>`).join("")}</select>`),
      f("Or a new skill", `<input type="text" name="learnSkill.skillName" placeholder="Animal Training" list="arn-dt-skills-${actor.id}"><datalist id="arn-dt-skills-${actor.id}">${skillNames.map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>`), f("Its attribute", `<select name="learnSkill.ability"><option value="">The skill's own</option>${Object.entries(ARNEYAN.abilities).map(([k, a]) => `<option value="${k}">${esc(a)}</option>`).join("")}</select>`)].join(""),
    studySecret: [f("Secret", `<select name="studySecret.secret"><option value="">Not on the sheet</option>${secrets.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select>`),
      f("Or its name", `<input type="text" name="studySecret.name">`), f("Weeks (blank: the Secret's own)", `<input type="number" name="studySecret.weeks" min="1">`),
      f("DC (blank: the Secret's own)", `<input type="number" name="studySecret.dc" min="1">`), f("Attribute", `<select name="studySecret.ability"><option value="">The Secret's own</option>${Object.entries(ARNEYAN.abilities).map(([k, a]) => `<option value="${k}">${esc(a)}</option>`).join("")}</select>`)].join(""),
    train: [f("Training", `<select name="train.training">${Object.entries(TRAINING).map(([k, t]) => `<option value="${k}">${esc(t.label)}: ${t.weeks} weeks, ${k === "feat" ? `${priceText(trainedFeatGold(actor.system.level))} at your Tier` : priceText(t.sp)}</option>`).join("")}</select>`), f("Which", `<input type="text" name="train.what" placeholder="Longbow, chain mail, a feat">`),
      f("A Trained Feat's attribute", abilitySel("train.ability", "str"))].join(""),
    disease: [f("Disease", `<input type="text" name="disease.disease">`), f("Its DC", `<input type="number" name="disease.dc" value="12">`), f("Days at most", `<input type="number" name="disease.days" value="7" min="1">`)].join(""),
    carouse: f("This week", `<span>${priceText(carouseGold(actor.system.level))} at your Tier; Charisma (DC 12), then the Carousing table</span>`),
    sideQuest: f("Quest", `<input type="text" name="sideQuest.quest">`),
    other: [f("Activity", `<select name="other.kind">${OTHER.map(o => `<option>${esc(o)}</option>`).join("")}</select>`), f("Days", `<input type="number" name="other.days" value="7" min="0">`),
      f("Cost (gp)", `<input type="number" name="other.cost" value="0" min="0" step="0.01">`), f("What came of it", `<input type="text" name="other.result">`)].join("")
  };
  const content = `<div class="arn-dt-dialog">
    <label class="arn-dt-field"><span>Activity</span><select name="activity">${Object.entries(ACTIVITIES).map(([k, a]) => `<option value="${k}">${esc(a.label)}</option>`).join("")}</select></label>
    ${Object.entries(sections).map(([k, html]) => `<section data-activity="${k}"><p class="arn-muted">${esc(ACTIVITIES[k].hint)}</p>${html}</section>`).join("")}
    <label class="arn-dt-field"><span>Advantage on the check</span><select name="adv"><option value="0">Neither (the rules' own still apply)</option><option value="1">Advantage</option><option value="-1">Disadvantage</option></select></label>
    <label class="arn-check"><input type="checkbox" name="paid"> Paid already (take no coins)</label>
    <p class="arn-muted">${esc(actor.name)} has ${cpText(toCp(actor.system.currency))}.</p></div>`;
  const read = form => {
    const key = form.elements.activity.value;
    const values = {};
    for (const el of form.querySelectorAll(`[name^="${key}."]`)) values[el.name.slice(key.length + 1)] = el.type === "checkbox" ? el.checked : el.value;
    return { key, values, paid: !!form.elements.paid?.checked, adv: Number(form.elements.adv?.value) || 0 };
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
  return runDowntime(actor, pick.key, pick.values, { paid: pick.paid, adv: pick.adv });
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

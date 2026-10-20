/**
 * Levelling for The Arneyan Codex: class levels, HP, Luck, class and kit features,
 * Feat and NWP prompts, and the 1st-level setup when a character takes its first class.
 */
import { ARNEYAN } from "./config.mjs";

const { DialogV2 } = foundry.applications.api;
const FLAG = "arneyan";
const NWP_LEVELS = [4, 8, 12, 16, 20, 24];

const esc = s => foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s)) : String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Items an actor gained from a class or kit. */
function grantedBy(actor, sourceItem) {
  return actor.items.filter(i => i.getFlag(FLAG, "grantedBy") === sourceItem.id);
}

/** The class a kit belongs to on this actor (by name), or the first class. */
function classForKit(actor, kit) {
  const classes = actor.items.filter(i => i.type === "class");
  const name = (kit.system.className || "").toLowerCase();
  return classes.find(c => c.name.toLowerCase() === name || c.name.toLowerCase().startsWith(name + " ")) ?? classes[0] ?? null;
}

/* -------------------------------------------- */
/*  Granting features                           */
/* -------------------------------------------- */

/** Add the class's features up to its level and remove any above it. */
export async function syncClassFeatures(actor, cls) {
  const level = cls.system.levels;
  const have = grantedBy(actor, cls);
  const haveSources = new Set(have.map(i => i.getFlag(FLAG, "source")));
  const toDelete = have.filter(i => (i.system.level ?? 1) > level).map(i => i.id);
  const wanted = (cls.system.features ?? []).filter(f => f.level <= level && f.uuid && !haveSources.has(f.uuid));
  const create = [];
  for (const f of wanted) {
    const doc = await fromUuid(f.uuid);
    if (!doc) continue;
    const data = doc.toObject();
    delete data._id;
    data.folder = null;
    foundry.utils.setProperty(data, `flags.${FLAG}.grantedBy`, cls.id);
    foundry.utils.setProperty(data, `flags.${FLAG}.source`, f.uuid);
    foundry.utils.setProperty(data, "system.level", f.level);
    create.push(data);
  }
  if (toDelete.length) await actor.deleteEmbeddedDocuments("Item", toDelete);
  if (create.length) await actor.createEmbeddedDocuments("Item", create, { arneyanGrant: true });
  return create.map(c => c.name);
}

/** Add a kit's features up to its class's level and remove any above it. */
export async function syncKitFeatures(actor, kit) {
  const cls = classForKit(actor, kit);
  const level = cls?.system.levels ?? 1;
  const have = grantedBy(actor, kit);
  const haveSources = new Set(have.map(i => i.getFlag(FLAG, "source")));
  const toDelete = have.filter(i => (i.system.level ?? 1) > level).map(i => i.id);
  const create = [];
  (kit.system.features ?? []).forEach((f, idx) => {
    const source = `${kit.id}.${idx}`;
    if (f.level > level || haveSources.has(source)) return;
    create.push({
      name: f.name, type: "ability", img: kit.img,
      system: { description: f.description, kind: "class", level: f.level, className: kit.name,
        // Uses, save and activities set at build time (build_activities.py); older kits fall back to reading the text.
        uses: f.uses?.max || f.uses?.formula ? foundry.utils.deepClone(f.uses) : usesOf(f.description), save: f.save || saveOf(f.description),
        damage: f.damage ?? "", ...(f.damageType ? { damageType: f.damageType } : {}),
        activities: foundry.utils.deepClone(f.activities ?? []),
        rules: foundry.utils.deepClone(f.rules ?? []), toggle: !!f.toggle, active: false, applies: foundry.utils.deepClone(f.applies ?? []),
        ...(f.abilityChoice?.options?.length ? { abilityChoice: foundry.utils.deepClone(f.abilityChoice) } : {}) },
      flags: { [FLAG]: { grantedBy: kit.id, source } }
    });
  });
  if (toDelete.length) await actor.deleteEmbeddedDocuments("Item", toDelete);
  if (create.length) await actor.createEmbeddedDocuments("Item", create, { arneyanGrant: true });
  return create.map(c => c.name);
}

function usesOf(html) {
  const t = String(html).toLowerCase();
  for (const [re, per] of [[/once per encounter/, "encounter"], [/once per day|once a day|once\/day/, "day"], [/once per long rest/, "rest"], [/once per week/, "week"], [/once per session/, "session"], [/once per month/, "month"]]) {
    if (re.test(t)) return { value: 1, max: 1, per };
  }
  return { value: 0, max: 0, per: "" };
}

function saveOf(html) {
  // A save the feature calls for, not a bonus to the owner's own saves ("+1 to Fortitude and Reflex saves").
  const m = String(html).match(/(?<!(?:succeed on|advantage on|first) (?:an? |the )?)\b(Fortitude|Reflex|Will) save(?!s)(?! DC is)/i);
  return m ? { fortitude: "fort", reflex: "ref", will: "will" }[m[1].toLowerCase()] : "";
}

/** Remove everything a class or kit granted (when it is deleted). */
export async function removeGrants(actor, source) {
  const ids = grantedBy(actor, source).map(i => i.id);
  if (source.type === "class") {
    // Kits that belong to this class go with it (their own features follow via their delete).
    const base = source.name.toLowerCase();
    const kits = actor.items.filter(i => i.type === "kit" && i.system.className
      && (base === i.system.className.toLowerCase() || base.startsWith(i.system.className.toLowerCase() + " ")));
    ids.push(...kits.map(k => k.id), ...kits.flatMap(k => grantedBy(actor, k).map(i => i.id)));
    // Take off the HP and Luck this class gave.
    const hp = (source.system.hpRolls ?? []).reduce((a, b) => a + b, 0);
    const luck = (source.system.luckGains ?? []).reduce((a, b) => a + b, 0);
    if (hp || luck) {
      const newMax = Math.max(1, actor._source.system.attributes.hp.max - hp);
      await actor.update({
        "system.attributes.hp.max": newMax,
        "system.attributes.hp.value": Math.min(actor.system.attributes.hp.value, newMax),
        "system.luck.value": Math.max(0, actor.system.luck.value - luck)
      });
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${esc(source.name)} removed: −${hp} max HP${luck ? `, −${luck} Luck` : ""}${kits.length ? `, kit ${kits.map(k => esc(k.name)).join(", ")} removed` : ""}.</p>` });
    }
  }
  if (source.type === "ancestry") {
    const applied = source.getFlag(FLAG, "ancestry")?.applied ?? {};
    const upd = {};
    for (const [k, v] of Object.entries(applied)) if (v) upd[`system.abilities.${k}.value`] = Math.max(0, actor._source.system.abilities[k].value - v);
    if (Object.keys(upd).length) await actor.update(upd);
  }
  const unique = [...new Set(ids)].filter(id => actor.items.has(id));
  if (unique.length) await actor.deleteEmbeddedDocuments("Item", unique, { arneyanGrant: true });
}

/* -------------------------------------------- */
/*  Levels and HP                               */
/* -------------------------------------------- */

/**
 * Set a class to a new level. Going up rolls or averages HP for each level, adds Luck,
 * grants features and prompts for Feats and NWPs. Going down undoes HP and removes features.
 */
/* One level change at a time per character, so double clicks can't stack HP and prompts. */
const busy = new Set();
async function locked(actor, fn) {
  if (busy.has(actor.id)) {
    ui.notifications.warn(`Finish the current level change for ${actor.name} first.`);
    return false;
  }
  busy.add(actor.id);
  try { return await fn(); } finally { busy.delete(actor.id); }
}

/** Returns false if the change was cancelled or refused. */
export function setClassLevel(actor, cls, target) {
  return locked(actor, () => changeClassLevel(actor, cls, target));
}

async function changeClassLevel(actor, cls, target) {
  target = Math.clamp(Math.floor(Number(target) || 0), 1, 24);
  const from = cls.system.levels;
  if (target === from) return;
  if (target < from) return levelDown(actor, cls, target);

  const otherLevels = actor.system.level - from;
  if (otherLevels + target > 24) { ui.notifications.warn("A character's total level cannot go above 24."); return false; }

  // One window: what this level brings, then how to do HP.
  const needsChoice = Array.from({ length: target - from }, (_, i) => otherLevels + from + i + 1).some(l => l <= 10);
  const avg = Number(cls.system.hitDie.slice(1)) / 2 + 1;
  const buttons = needsChoice
    ? [{ action: "roll", label: `Roll ${cls.system.hitDie}`, icon: "fa-solid fa-dice-d20", default: true },
       { action: "average", label: `Take ${avg}`, icon: "fa-solid fa-equals" },
       { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }]
    : [{ action: "flat", label: "Level up", icon: "fa-solid fa-circle-up", default: true },
       { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }];
  const method = await DialogV2.wait({
    window: { title: `${cls.name}: level ${from} to ${target}`, icon: "fa-solid fa-circle-up" },
    position: { width: 480 },
    classes: ["arneyan", "arn-levelup-dialog"],
    content: levelPreview(actor, cls, from, target, otherLevels, needsChoice, avg),
    buttons,
    rejectClose: false
  });
  if (!method || method === "cancel") return false;

  const die = Number(cls.system.hitDie.slice(1));
  const con = actor.system.abilities.con.mod;
  const gains = [];
  const lines = [];
  const hpRolls = [];
  for (let lvl = from + 1; lvl <= target; lvl++) {
    const charLevel = otherLevels + lvl;
    let base;
    let how;
    if (charLevel > 10) {
      base = cls.system.hpBeyond10; how = `flat ${base}`;
    } else if (method === "average") {
      base = die / 2 + 1; how = `average ${base}`;
    } else {
      const r = await new Roll(`1d${die}r1`).evaluate();
      hpRolls.push(r);
      base = r.total; how = `rolled ${base}`;
    }
    const gain = Math.max(1, base + con);
    gains.push(gain);
    lines.push(`<li>${cls.name} ${lvl}: ${how}, Con ${con >= 0 ? "+" : ""}${con} = <strong>+${gain} HP</strong></li>`);
  }
  const total = gains.reduce((a, b) => a + b, 0);
  // Keep one HP entry and one Luck entry per class level, so levelling down takes off exactly what was added.
  const priorHp = Array.from({ length: from }, (_, i) => cls.system.hpRolls?.[i] ?? 0);
  const priorLuck = Array.from({ length: from }, (_, i) => cls.system.luckGains?.[i] ?? (i === 0 ? 0 : 1));
  const luckBefore = actor.system.luck.value;
  const luckAfter = Math.min(20, luckBefore + (target - from));
  const luckGains = Array.from({ length: target - from }, (_, i) => (luckBefore + i + 1 <= 20 ? 1 : 0));
  const luckGain = luckAfter - luckBefore;
  await cls.update({ "system.levels": target, "system.hpRolls": [...priorHp, ...gains], "system.luckGains": [...priorLuck, ...luckGains] });
  await actor.update({
    "system.attributes.hp.max": actor._source.system.attributes.hp.max + total,
    "system.attributes.hp.value": actor.system.attributes.hp.value + total,
    "system.luck.value": luckAfter
  });

  const newFeatures = [...await syncClassFeatures(actor, cls)];
  for (const kit of actor.items.filter(i => i.type === "kit" && classForKit(actor, i)?.id === cls.id)) {
    newFeatures.push(...await syncKitFeatures(actor, kit));
  }

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), rolls: hpRolls,
    content: `<div class="arn-card"><header class="arn-card-title">${esc(actor.name)}: ${esc(cls.name)} ${target}</header>
      <ul>${lines.join("")}</ul><p>+${luckGain} Luck (now ${luckAfter}).</p>
      ${newFeatures.length ? `<p><strong>New:</strong> ${newFeatures.map(esc).join(", ")}</p>` : ""}</div>`
  });

  // Feats and NWPs, by character level.
  for (let charLevel = otherLevels + from + 1; charLevel <= otherLevels + target; charLevel++) {
    if (featLevels(actor).includes(charLevel)) await promptFeat(actor, charLevel);
    if (NWP_LEVELS.includes(charLevel)) await promptSkill(actor, charLevel);
  }
}

/** What a level up brings, shown before HP is rolled. */
export function levelPreview(actor, cls, from, target, otherLevels, needsChoice, avg) {
  const sys = cls.system;
  const charFrom = otherLevels + from;
  const charTo = otherLevels + target;
  const con = actor.system.abilities.con.mod;
  const li = [];
  const signed = n => (n >= 0 ? `+${n}` : `${n}`);
  // Hit points.
  const early = Array.from({ length: target - from }, (_, i) => charFrom + i + 1).filter(l => l <= 10).length;
  const late = target - from - early;
  const hp = [];
  if (early) hp.push(`${early} level${early === 1 ? "" : "s"}: roll ${sys.hitDie} (1s rerolled once) or take ${avg}, ${signed(con)} Con, minimum 1`);
  if (late) hp.push(`${late} level${late === 1 ? "" : "s"} past 10th: ${signed(sys.hpBeyond10)} ${signed(con)} Con each`);
  li.push(`<li><strong>Hit points:</strong> ${hp.join("; ")}</li>`);
  li.push(`<li><strong>Luck:</strong> +${target - from} (to a maximum of 20)</li>`);
  // Base to Hit, saves and DCs.
  const bthNow = actor.system.bth;
  const others = actor.items.filter(i => i.type === "class" && i.id !== cls.id).map(c => ARNEYAN.bth(c.system.bthProgression, c.system.levels));
  const bthNew = Math.max(0, ARNEYAN.bth(sys.bthProgression, target), ...others) + (actor.system.attributes.bthBonus ?? 0);
  if (bthNew !== bthNow) li.push(`<li><strong>Base to Hit:</strong> ${signed(bthNow)} to ${signed(bthNew)}</li>`);
  const halfFrom = ARNEYAN.halfLevel(charFrom);
  const halfTo = ARNEYAN.halfLevel(charTo);
  if (halfTo !== halfFrom) li.push(`<li><strong>Saves:</strong> ${signed(halfTo - halfFrom)} to Fortitude, Reflex and Will</li>`);
  const dcUp = ARNEYAN.halfLevel(target) - ARNEYAN.halfLevel(from);
  if (dcUp) li.push(`<li><strong>${sys.castingAbility ? "Spell DC and " : ""}Class DC:</strong> ${signed(dcUp)}</li>`);
  // Features.
  const feats = (sys.features ?? []).filter(f => f.level > from && f.level <= target).map(f => `${esc(f.name)} (${f.level})`);
  if (feats.length) li.push(`<li><strong>New class abilities:</strong> ${feats.join(", ")}</li>`);
  for (const kit of actor.items.filter(i => i.type === "kit" && classForKit(actor, i)?.id === cls.id)) {
    const kf = (kit.system.features ?? []).filter(f => f.level > from && f.level <= target).map(f => `${esc(f.name)} (${f.level})`);
    if (kf.length) li.push(`<li><strong>${esc(kit.name)}:</strong> ${kf.join(", ")}</li>`);
  }
  // Spell slots.
  if (sys.castingAbility && sys.slotTable?.length) {
    const a = sys.slotTable[Math.clamp(from, 1, 24) - 1] ?? [];
    const b = sys.slotTable[Math.clamp(target, 1, 24) - 1] ?? [];
    const changes = [];
    for (let n = 0; n <= 9; n++) {
      const x = a[n] ?? 0, y = b[n] ?? 0;
      if (y === x) continue;
      const label = n === 0 ? "cantrips known" : `${ARNEYAN.spellLevels[n]}-level slots`;
      changes.push(x === 0 && n > 0 ? `<strong>${label} unlocked</strong> (${y})` : `${label} ${x} to ${y}`);
    }
    if (changes.length) li.push(`<li><strong>Spells:</strong> ${changes.join(", ")}</li>`);
  }
  // Choices to make.
  const choiceFeats = Array.from({ length: charTo - charFrom }, (_, i) => charFrom + i + 1).filter(l => featLevels(actor).includes(l));
  if (choiceFeats.length) li.push(`<li><strong>Choose a feat</strong> at character level ${choiceFeats.join(" and ")}</li>`);
  const choiceSkills = Array.from({ length: charTo - charFrom }, (_, i) => charFrom + i + 1).filter(l => NWP_LEVELS.includes(l));
  if (choiceSkills.length) li.push(`<li><strong>New skill slot</strong> at character level ${choiceSkills.join(" and ")}</li>`);
  return `<div class="arn-level-preview">
    <p class="arn-lp-head">Character level <strong>${charFrom}</strong> to <strong>${charTo}</strong></p>
    <ul>${li.join("")}</ul>
    ${needsChoice ? "<p class=\"arn-lp-q\">How do you want your hit points?</p>" : ""}
  </div>`;
}

async function levelDown(actor, cls, target) {
  const ok = await DialogV2.confirm({
    window: { title: `Lower ${cls.name} to ${target}?` },
    content: `<p>This removes the HP gained at the higher levels and any class or kit features above level ${target}. Feats and skills you chose stay on the sheet; remove them by hand if needed.</p>`
  });
  if (!ok) return false;
  const from = cls.system.levels;
  const rolls = Array.from({ length: from }, (_, i) => cls.system.hpRolls?.[i] ?? 0);
  const luck = Array.from({ length: from }, (_, i) => cls.system.luckGains?.[i] ?? (i === 0 ? 0 : 1));
  const lost = rolls.splice(target).reduce((a, b) => a + b, 0);
  const luckLost = luck.splice(target).reduce((a, b) => a + b, 0);
  const newMax = Math.max(1, actor._source.system.attributes.hp.max - lost);
  await cls.update({ "system.levels": target, "system.hpRolls": rolls, "system.luckGains": luck });
  await actor.update({
    "system.attributes.hp.max": newMax,
    "system.attributes.hp.value": Math.min(actor.system.attributes.hp.value, newMax),
    "system.luck.value": Math.max(0, actor.system.luck.value - luckLost)
  });
  await syncClassFeatures(actor, cls);
  for (const kit of actor.items.filter(i => i.type === "kit" && classForKit(actor, i)?.id === cls.id)) await syncKitFeatures(actor, kit);
}

/** Feat levels follow the Feat Progression of the character's first class. */
function featLevels(actor) {
  const first = actor.items.find(i => i.type === "class");
  return first?.system.featLevels ?? [1, 4, 8, 12, 16, 20];
}

/** Feat Paths open to the character: General plus every class's Paths. */
function featPaths(actor) {
  const paths = new Set(["General Path"]);
  for (const c of actor.items.filter(i => i.type === "class")) (c.system.featPaths ?? []).forEach(p => paths.add(p));
  return paths;
}

/* -------------------------------------------- */
/*  Prompts                                     */
/* -------------------------------------------- */

async function packOptions(packName, filter) {
  const pack = game.packs.get(`arneyan.${packName}`);
  if (!pack) return [];
  const index = await pack.getIndex({ fields: ["system.path", "system.className", "system.ability"] });
  return index.filter(filter).sort((a, b) => a.name.localeCompare(b.name));
}

function optionsHtml(list, groupBy) {
  if (!groupBy) return list.map(e => `<option value="${e.uuid}">${esc(e.name)}</option>`).join("");
  const groups = {};
  for (const e of list) (groups[groupBy(e)] ??= []).push(e);
  return Object.entries(groups).map(([g, es]) => `<optgroup label="${esc(g)}">${es.map(e => `<option value="${e.uuid}">${esc(e.name)}</option>`).join("")}</optgroup>`).join("");
}

async function addFromUuid(actor, uuid) {
  if (!uuid) return;
  const doc = await fromUuid(uuid);
  if (!doc) return;
  const data = doc.toObject();
  delete data._id;
  data.folder = null;
  return actor.createEmbeddedDocuments("Item", [data]);
}

export async function promptFeat(actor, charLevel) {
  const owned = new Set(actor.items.filter(i => i.type === "feat").map(i => i.name));
  const paths = featPaths(actor);
  const list = await packOptions("feats", e => paths.has(e.system?.path) && !owned.has(e.name));
  if (!list.length) return;
  const uuid = await DialogV2.wait({
    window: { title: `${actor.name}: choose a Feat (level ${charLevel})` },
    content: `<p>You gain a Feat at level ${charLevel}. Open to you: ${[...paths].map(esc).join(", ")}.</p>
      <div class="form-group"><label>Feat</label><select name="feat">${optionsHtml(list, e => e.system?.path ?? "")}</select></div>`,
    buttons: [
      { action: "take", label: "Take Feat", default: true, callback: (ev, btn) => btn.form.elements.feat.value },
      { action: "later", label: "Choose later" }
    ],
    rejectClose: false
  });
  if (uuid && uuid !== "later") await addFromUuid(actor, uuid);
}

export async function promptSkill(actor, charLevel) {
  const owned = actor.items.filter(i => i.type === "skill");
  const ownedNames = new Set(owned.map(i => i.name));
  const list = await packOptions("skills", e => !ownedNames.has(e.name));
  const upgrade = owned.filter(i => i.system.tier !== "master");
  const content = `<p>You gain a Skill (NWP) slot at level ${charLevel}. Learn a new skill, or spend the slot to make a trained one a Master.</p>
    <div class="form-group"><label>New skill</label><select name="skill"><option value="">—</option>${optionsHtml(list, e => ARNEYAN.abilities[e.system?.ability] ?? "")}</select></div>
    ${upgrade.length ? `<div class="form-group"><label>Or make Master</label><select name="master"><option value="">—</option>${upgrade.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join("")}</select></div>` : ""}`;
  const res = await DialogV2.wait({
    window: { title: `${actor.name}: new Skill slot (level ${charLevel})` },
    content,
    buttons: [
      { action: "ok", label: "Confirm", default: true, callback: (ev, btn) => ({ skill: btn.form.elements.skill?.value, master: btn.form.elements.master?.value }) },
      { action: "later", label: "Choose later" }
    ],
    rejectClose: false
  });
  if (!res || res === "later") return;
  if (res.master) await actor.items.get(res.master)?.update({ "system.tier": "master" });
  else if (res.skill) await addFromUuid(actor, res.skill);
}

/* -------------------------------------------- */
/*  1st-level setup                             */
/* -------------------------------------------- */

/**
 * When a character takes its first class: set HP, grant 1st-level features, and offer the
 * kit, 1st-level Feat, three starting skills and a Starting Luck roll in one window.
 */
export function firstLevelSetup(actor, cls) {
  return locked(actor, () => setUpFirstLevel(actor, cls));
}

async function setUpFirstLevel(actor, cls) {
  // No ancestry yet: pick it first, since its Constitution change counts towards Hit Points.
  if (!actor.items.some(i => i.type === "ancestry")) await pickAncestry(actor);
  const con = actor.system.abilities.con.mod;
  const hp = Math.max(1, Number(cls.system.hitDie.slice(1)) + con);
  await cls.update({ "system.levels": 1, "system.hpRolls": [hp], "system.luckGains": [0] });
  await actor.update({ "system.attributes.hp.max": hp, "system.attributes.hp.value": hp });
  await syncClassFeatures(actor, cls);

  const base = cls.name.replace(/\s*\(.*\)$/, "");
  const kits = await packOptions("kits", e => (e.system?.className ?? "") === base);
  const paths = featPaths(actor);
  const feats = await packOptions("feats", e => paths.has(e.system?.path));
  const skills = await packOptions("skills", () => true);
  const skillSel = n => `<div class="form-group"><label>Skill ${n}</label><select name="skill${n}"><option value="">—</option>${optionsHtml(skills, e => ARNEYAN.abilities[e.system?.ability] ?? "")}</select></div>`;

  const res = await DialogV2.wait({
    window: { title: `${actor.name}: 1st-level ${cls.name}` },
    position: { width: 480 },
    content: `<p>Max HP is set to <strong>${hp}</strong> (${cls.system.hitDie} maximum + Con) and your 1st-level class features are on the sheet. Pick the rest now, or close this and add them later.</p>
      ${kits.length ? `<div class="form-group"><label>Kit</label><select name="kit"><option value="">—</option>${optionsHtml(kits)}</select></div>` : ""}
      <div class="form-group"><label>1st-level Feat</label><select name="feat"><option value="">—</option>${optionsHtml(feats, e => e.system?.path ?? "")}</select></div>
      <p class="hint">Three starting skills (NWP), each a different skill.</p>
      ${skillSel(1)}${skillSel(2)}${skillSel(3)}
      <div class="form-group"><label>Roll Starting Luck (4d6, drop lowest)</label><input type="checkbox" name="luck" checked></div>`,
    buttons: [
      { action: "ok", label: "Apply", default: true, callback: (ev, btn) => {
        const f = btn.form.elements;
        return { kit: f.kit?.value, feat: f.feat.value, skills: [f.skill1.value, f.skill2.value, f.skill3.value], luck: f.luck.checked };
      } },
      { action: "skip", label: "Skip" }
    ],
    rejectClose: false
  });
  if (!res || res === "skip") return;
  if (res.kit) await addFromUuid(actor, res.kit);
  if (res.feat) await addFromUuid(actor, res.feat);
  for (const s of [...new Set(res.skills.filter(Boolean))]) await addFromUuid(actor, s);
  if (res.luck) {
    const r = await new Roll("4d6dl").evaluate();
    await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Starting Luck (4d6, drop the lowest)" });
    await actor.update({ "system.luck.start": r.total, "system.luck.value": r.total });
  }
}

/* -------------------------------------------- */
/*  Ancestry                                    */
/* -------------------------------------------- */

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];
const signedN = n => (n >= 0 ? `+${n}` : `−${-n}`);
const bonusText = b => Object.entries(b ?? {}).filter(([, v]) => v).map(([k, v]) => `${signedN(v)} ${ARNEYAN.abilityAbbr[k]}`).join(", ");

/** Pick an ancestry for a character that has none (the first class dropped on a blank sheet). */
export async function pickAncestry(actor) {
  const list = await packOptions("ancestries", () => true);
  if (!list.length) return null;
  const uuid = await DialogV2.wait({
    window: { title: `${actor.name}: ancestry` }, position: { width: 420 },
    content: `<p>${esc(actor.name)} has no ancestry yet. Pick one first: its attribute changes count towards your starting Hit Points.</p>
      <div class="form-group"><label>Ancestry</label><select name="anc">${optionsHtml(list)}</select></div>`,
    buttons: [{ action: "ok", label: "Choose", default: true, callback: (ev, btn) => btn.form.elements.anc.value }, { action: "skip", label: "Not now" }],
    rejectClose: false
  });
  if (!uuid || uuid === "skip") return null;
  const doc = await fromUuid(uuid);
  if (!doc) return null;
  const data = doc.toObject();
  delete data._id;
  data.folder = null;
  const [anc] = await actor.createEmbeddedDocuments("Item", [data], { arneyanSkipSetup: true });
  if (anc) await ancestrySetup(actor, anc);
  return anc;
}

/**
 * When an ancestry lands on a character: its subtype, bloodline, caste or lineage, a Human's two +1s, a Tiefling's
 * family, and its attribute changes (at creation, no score above 18). Its traits go on the sheet as ancestry
 * features, and the choice's own numbers (a bloodline's Resistance 5) apply as rules.
 */
export async function ancestrySetup(actor, anc) {
  const s = anc.system;
  const baseName = anc.name.replace(/\s*\(.*\)$/, "");
  const opts = s.choice?.options ?? [];
  const families = s.family ? await packOptions("ancestries", e => e.name !== baseName) : [];
  const atCreation = (actor.system.level ?? 0) <= 1;
  const anyBonus = Object.keys(s.bonuses ?? {}).length || s.pickTwo || opts.some(o => Object.keys(o.bonuses ?? {}).length);
  const attrOpts = ABILITY_KEYS.map(k => `<option value="${k}">${ARNEYAN.abilities[k]}</option>`).join("");
  const optHtml = opts.map((o, i) => `<option value="${i}">${esc(o.name)}${Object.keys(o.bonuses ?? {}).length ? ` (${bonusText(o.bonuses)})` : ""}</option>`).join("");
  const content = `<div class="arn-anc-setup">
    <p><strong>${esc(anc.name)}</strong>${bonusText(s.bonuses) ? `: ${esc(bonusText(s.bonuses))}` : ""}. Speed, size and vision are set; its traits go on the Features tab.</p>
    ${opts.length ? `<div class="form-group"><label>${esc(s.choice.label)}</label><select name="choice">${optHtml}</select></div>
      <p class="hint arn-anc-text">${esc(opts[0].text)}</p>` : ""}
    ${s.pickTwo ? `<div class="form-group"><label>+1 to</label><select name="pick1">${attrOpts}</select></div>
      <div class="form-group"><label>and +1 to</label><select name="pick2">${attrOpts.replace('value="dex"', 'value="dex" selected')}</select></div>` : ""}
    ${s.family ? `<div class="form-group"><label>Family you were born into</label><select name="family">${families.map(e => `<option value="${esc(e.name)}" ${e.name === "Human" ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</select></div>` : ""}
    ${anyBonus ? `<div class="form-group"><label>Add the attribute changes to the scores</label><input type="checkbox" name="scores" ${atCreation ? "checked" : ""}></div>
      <p class="hint">${atCreation ? "At creation no score can go above 18; any point that would, you move to another attribute yourself." : "Leave this off if the scores already include them."}</p>` : ""}
  </div>`;
  const res = await DialogV2.wait({
    window: { title: `${actor.name}: ${anc.name}` }, position: { width: 460 }, content,
    render: (event, dialog) => {
      const el = dialog.element ?? dialog;
      const sel = el.querySelector("select[name=choice]");
      const p = el.querySelector(".arn-anc-text");
      sel?.addEventListener("change", () => { if (p) p.textContent = opts[Number(sel.value)]?.text ?? ""; });
    },
    buttons: [
      { action: "ok", label: "Apply", default: true, callback: (ev, btn) => {
        const f = btn.form.elements;
        return { choice: f.choice ? Number(f.choice.value) : null, picks: s.pickTwo ? [f.pick1.value, f.pick2.value] : [],
          family: f.family?.value ?? "", scores: !!f.scores?.checked };
      } },
      { action: "skip", label: "Skip" }
    ],
    rejectClose: false
  });
  if (!res || res === "skip" || !actor.items.has(anc.id)) return;
  if (s.pickTwo && res.scores && res.picks[0] === res.picks[1]) {
    ui.notifications.warn("A Human's two +1s go to two different attributes: pick again.");
    return ancestrySetup(actor, anc);
  }
  const o = res.choice !== null ? opts[res.choice] : null;
  const short = o ? o.name.replace(/\s*\(.*\)$/, "") : "";
  const label = short ? `${baseName} (${short})` : baseName;

  // Traits and the choice, as ancestry features that go when the ancestry does.
  const grant = (name, text, rules = []) => ({
    name, type: "ability", img: anc.img,
    system: { description: `<p>${esc(text)}</p>`, kind: "ancestry", level: 1, className: label, rules },
    flags: { [FLAG]: { grantedBy: anc.id, source: `${anc.id}.${name}` } }
  });
  const create = (s.traitList ?? []).filter(t => !(res.family && t.name === "Family")).map(t => grant(t.name, t.text));
  if (o) create.unshift(grant(`${s.choice.label}: ${o.name}`, o.text, (o.rules ?? []).map(r => ({ ...r, label: r.label || short }))));
  if (res.family) create.unshift(grant(`Family: ${res.family}`, `Born into a ${res.family} family: you speak its language, and its people treat you as one of their own once they look past the marks.`));
  if (create.length) await actor.createEmbeddedDocuments("Item", create, { arneyanGrant: true });

  // Attribute changes.
  const deltas = {};
  const add = (k, v) => { if (k && v) deltas[k] = (deltas[k] ?? 0) + v; };
  if (res.scores) {
    for (const [k, v] of Object.entries(s.bonuses ?? {})) add(k, v);
    for (const [k, v] of Object.entries(o?.bonuses ?? {})) add(k, v);
    for (const k of res.picks) add(k, 1);
  }
  const applied = {};
  const over = [];
  const upd = {};
  for (const [k, v] of Object.entries(deltas)) {
    const cur = actor._source.system.abilities[k].value;
    let next = cur + v;
    if (atCreation && next > 18 && v > 0) { over.push(`${ARNEYAN.abilities[k]} ${next - Math.max(cur, 18)}`); next = Math.max(cur, 18); }
    applied[k] = next - cur;
    upd[`system.abilities.${k}.value`] = next;
  }
  if (Object.keys(upd).length) await actor.update(upd);
  await anc.update({ name: label, [`flags.${FLAG}.ancestry`]: { choice: o?.name ?? "", family: res.family, applied } });
  const lines = [bonusText(applied) && `scores ${bonusText(applied)}`, o && `${s.choice.label.toLowerCase()} ${o.name}`, res.family && `${res.family} family`].filter(Boolean);
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${esc(actor.name)} is ${/^[AEIOU]/i.test(anc.name) ? "an" : "a"} <strong>${esc(label)}</strong>${lines.length ? `: ${esc(lines.join("; "))}` : ""}.</p>` });
  if (over.length) ui.notifications.warn(`No score above 18 at creation: move ${over.join(", ")} point(s) to another attribute yourself.`, { permanent: true });
}

/**
 * Levelling for The Arneyan Codex: class levels, HP, Luck, class and kit features,
 * Feat and NWP prompts, and the 1st-level setup when a character takes its first class.
 */
import { ARNEYAN } from "./config.mjs";
import { startingWealth } from "./starting.mjs";
import { pickFromList, stepTitle } from "./picker.mjs";

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

async function packOptions(packName, filter, more = []) {
  const pack = game.packs.get(`arneyan.${packName}`);
  if (!pack) return [];
  const index = await pack.getIndex({ fields: ["system.path", "system.className", "system.ability", ...more] });
  return index.filter(filter).sort((a, b) => a.name.localeCompare(b.name));
}

/** Copy a compendium item onto the actor, linked back to it (as the browser does), so updates from the compendium reach it. */
export async function addFromUuid(actor, uuid, { levelTaken = 0 } = {}) {
  if (!uuid) return;
  const doc = await fromUuid(uuid);
  if (!doc) return;
  const data = doc.toObject();
  delete data._id;
  data.folder = null;
  foundry.utils.setProperty(data, "_stats.compendiumSource", doc.uuid);
  // A Feat granted for a level records that level, even when several levels are taken at once (1st to 4th).
  if (levelTaken && data.type === "feat") {
    foundry.utils.setProperty(data, "system.levelTaken", levelTaken);
    return actor.createEmbeddedDocuments("Item", [data], { arneyanKeepLevel: true });
  }
  return actor.createEmbeddedDocuments("Item", [data]);
}

export async function promptFeat(actor, charLevel) {
  const owned = new Set(actor.items.filter(i => i.type === "feat").map(i => i.name));
  const paths = featPaths(actor);
  const list = await packOptions("feats", e => paths.has(e.system?.path) && !owned.has(e.name));
  if (!list.length) return;
  // Browser-style: the list on the left, what the Feat does on the right.
  const uuid = await pickFromList({
    title: `${actor.name}: choose a Feat (level ${charLevel})`,
    intro: `<p>You gain a Feat at level ${charLevel}. Open to you: ${[...paths].map(esc).join(", ")}. Click one to read it.</p>`,
    entries: list.map(e => ({ value: e.uuid, uuid: e.uuid, name: e.name, group: e.system?.path ?? "" })).sort((x, y) => x.group.localeCompare(y.group) || x.name.localeCompare(y.name)),
    takeLabel: "Take Feat"
  });
  if (uuid && uuid !== "later") await addFromUuid(actor, uuid, { levelTaken: charLevel });
}

export async function promptSkill(actor, charLevel) {
  const owned = actor.items.filter(i => i.type === "skill");
  const ownedNames = new Set(owned.map(i => i.name));
  const list = await packOptions("skills", e => !ownedNames.has(e.name));
  const upgrade = owned.filter(i => i.system.tier !== "master");
  // One slot: a new skill or a Master, never both; every entry shows what it does.
  const entries = [
    ...upgrade.map(i => ({ value: `master:${i.id}`, uuid: i.uuid, name: `${i.name} (make Master)`, group: "Make a trained skill Master", meta: ARNEYAN.abilities[i.system.ability] ?? "" })),
    ...list.map(e => ({ value: e.uuid, uuid: e.uuid, name: e.name, group: `New skill: ${ARNEYAN.abilities[e.system?.ability] ?? "Other"}` }))
      .sort((x, y) => x.group.localeCompare(y.group) || x.name.localeCompare(y.name))
  ];
  const pick = await pickFromList({
    title: `${actor.name}: new Skill slot (level ${charLevel})`,
    intro: `<p>You gain a Skill (NWP) slot at level ${charLevel}. Spend it on one new skill, or on making a trained one Master.</p>`,
    entries, takeLabel: "Take"
  });
  if (!pick || pick === "later") return;
  if (pick.startsWith("master:")) await actor.items.get(pick.slice(7))?.update({ "system.tier": "master" });
  else await addFromUuid(actor, pick);
}

/* -------------------------------------------- */
/*  1st-level setup                             */
/* -------------------------------------------- */

/**
 * When a character takes its first class: set HP, grant 1st-level features, then a few steps, each a browser-style
 * list with descriptions: the ancestry (if it has none), the Kit, the 1st-level Feat and three starting skills, and
 * last the Starting Luck roll. Each step has Choose later (leave that one empty). Skip in any step stops choosing:
 * what was chosen in the steps before is added, then starting gold. Closing a step (X) stops the setup: nothing
 * chosen is added and there is no starting gold. HP and the class features are set either way.
 */
export async function firstLevelSetup(actor, cls) {
  const next = await locked(actor, () => setUpFirstLevel(actor, cls));
  // Starting gold runs after the level-change lock is released, so leaving the gear window open blocks nothing.
  // Only Apply or Skip go on to it; closing a window (X) doesn't.
  if (next === "gold") await startingWealth(actor, cls);
  return next;
}

const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The lists for the 1st-level steps, as picker entries. */
async function firstLevelLists(actor, cls) {
  const base = cls.name.replace(/\s*\(.*\)$/, "");
  // Kits: "Deity: Bane (Cleric)" goes under Deity as "Bane"; the class name in brackets is dropped.
  const tail = new RegExp(`\\s*\\(${reEsc(base)}\\)$`);
  const kits = (await packOptions("kits", e => (e.system?.className ?? "") === base)).map(e => {
    const m = e.name.match(/^([^:()]+):\s*(.+)$/);
    return { value: e.uuid, uuid: e.uuid, name: (m ? m[2] : e.name).replace(tail, ""), group: m ? m[1] : `${base} Kits` };
  }).sort((x, y) => x.group.localeCompare(y.group) || x.name.localeCompare(y.name));
  const paths = featPaths(actor);
  const ownedFeats = new Set(actor.items.filter(i => i.type === "feat").map(i => i.name));
  const feats = (await packOptions("feats", e => paths.has(e.system?.path) && !ownedFeats.has(e.name)))
    .map(e => ({ value: e.uuid, uuid: e.uuid, name: e.name, group: e.system?.path ?? "" }))
    .sort((x, y) => x.group.localeCompare(y.group) || x.name.localeCompare(y.name));
  // Skills by attribute, in sheet order.
  const ownedSkills = new Set(actor.items.filter(i => i.type === "skill").map(i => i.name));
  const order = k => { const n = ABILITY_KEYS.indexOf(k); return n < 0 ? 99 : n; };
  const skills = (await packOptions("skills", e => !ownedSkills.has(e.name)))
    .sort((x, y) => order(x.system?.ability) - order(y.system?.ability) || x.name.localeCompare(y.name))
    .map(e => ({ value: e.uuid, uuid: e.uuid, name: e.name, group: ARNEYAN.abilities[e.system?.ability] ?? "Other" }));
  const ancestries = actor.items.some(i => i.type === "ancestry") ? [] : await ancestryEntries();
  return { base, kits, feats, skills, ancestries };
}

async function setUpFirstLevel(actor, cls) {
  const { base, kits, feats, skills, ancestries } = await firstLevelLists(actor, cls);
  const steps = [ancestries.length && "ancestry", kits.length && "kit", feats.length && "feat", skills.length && "skills", "finish"].filter(Boolean);
  const stepOf = key => (steps.length > 1 ? `Step ${steps.indexOf(key) + 1} of ${steps.length}` : "");

  // No ancestry yet: pick it first, since its Constitution change counts towards Hit Points.
  let stop = "";
  if (ancestries.length) {
    const anc = await pickAncestry(actor, { step: stepOf("ancestry"), entries: ancestries, skip: true });
    if (anc === null) stop = "close";
    else if (anc === "skip") stop = "skip";
  }
  const con = actor.system.abilities.con.mod;
  const hp = Math.max(1, Number(cls.system.hitDie.slice(1)) + con);
  await cls.update({ "system.levels": 1, "system.hpRolls": [hp], "system.luckGains": [0] });
  await actor.update({ "system.attributes.hp.max": hp, "system.attributes.hp.value": hp });
  await syncClassFeatures(actor, cls);
  if (stop === "close") return null;

  // Chosen so far: added at the end (Apply or Skip), nothing if a window is closed.
  const chosen = { kit: "", feat: "", skills: [] };
  const nameOf = new Map([...kits, ...feats, ...skills].map(e => [e.value, e.name]));
  const finish = async luck => {
    if (chosen.kit) await addFromUuid(actor, chosen.kit);
    if (chosen.feat) await addFromUuid(actor, chosen.feat, { levelTaken: 1 });
    // One at a time, so each skill goes through the slot check.
    for (const s of [...new Set(chosen.skills.filter(Boolean))]) await addFromUuid(actor, s);
    if (luck) {
      const r = await new Roll("4d6dl").evaluate();
      await r.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Starting Luck (4d6, drop the lowest)" });
      await actor.update({ "system.luck.start": r.total, "system.luck.value": r.total });
    }
    // Then starting gold and gear (after the kit, so an Artificer's toolkit matches it), once the lock is released.
    return "gold";
  };
  if (stop === "skip") return finish(false);

  // The HP line and how the steps work head the first class step.
  let lead = `<p class="arn-step-lead">Max HP is set to <strong>${hp}</strong> (${cls.system.hitDie} maximum + Con) and your 1st-level class features are on the sheet.${steps.length > 1 ? " <strong>Choose later</strong> leaves a step empty; <strong>Skip</strong> stops choosing and goes on to starting gold with what you have chosen so far." : ""}</p>`;
  const intro = text => { const out = lead + text; lead = ""; return out; };
  const pickers = [
    kits.length && { key: "kit", ask: () => pickFromList({
      title: `${actor.name}: ${base} Kit`, step: stepOf("kit"), entries: kits, takeLabel: "Take Kit", skipLabel: "Skip",
      intro: intro(`<p>Choose your Kit: its 1st-level features go on the sheet. Click one to read it.</p>`)
    }), set: v => { chosen.kit = v; } },
    feats.length && { key: "feat", ask: () => pickFromList({
      title: `${actor.name}: 1st-level Feat`, step: stepOf("feat"), entries: feats, takeLabel: "Take Feat", skipLabel: "Skip",
      intro: intro(`<p>Choose your 1st-level Feat. Open to you: ${[...featPaths(actor)].map(esc).join(", ")}. Click one to read it.</p>`)
    }), set: v => { chosen.feat = v; } },
    skills.length && { key: "skills", ask: () => pickFromList({
      title: `${actor.name}: starting Skills`, step: stepOf("skills"), entries: skills, max: 3, takeLabel: "Take Skills", skipLabel: "Skip",
      intro: intro(`<p>Choose three starting skills (NWP), each a different skill. You have ${actor.system.nwp?.max ?? 3} Skill slots${actor.system.nwp?.used ? `, ${actor.system.nwp.used} used` : ""}.</p>`)
    }), set: v => { chosen.skills = Array.isArray(v) ? v : [v]; } }
  ].filter(Boolean);
  for (const p of pickers) {
    const r = await p.ask();
    if (r === null) return null;
    if (r === "skip") return finish(false);
    if (r !== "later") p.set(r);
  }

  // Last step: what was chosen, and the Starting Luck roll.
  const lines = [chosen.kit && `<li><strong>Kit:</strong> ${esc(nameOf.get(chosen.kit) ?? "")}</li>`,
    chosen.feat && `<li><strong>Feat:</strong> ${esc(nameOf.get(chosen.feat) ?? "")}</li>`,
    chosen.skills.length && `<li><strong>Skills:</strong> ${chosen.skills.map(s => esc(nameOf.get(s) ?? "")).join(", ")}</li>`].filter(Boolean);
  const res = await DialogV2.wait({
    window: { title: stepTitle(`${actor.name}: 1st-level ${cls.name}`, stepOf("finish")), icon: "fa-solid fa-flag-checkered" },
    classes: ["arneyan", "arn-step-final"], position: { width: 460 },
    content: `${intro("")}
      ${lines.length ? `<p>Added when you press Apply:</p><ul>${lines.join("")}</ul>` : `<p>Nothing chosen here: add a Kit, Feat or Skills later from the compendium.</p>`}
      <div class="form-group"><label>Roll Starting Luck (4d6, drop lowest)</label><input type="checkbox" name="luck" checked></div>
      <p class="hint">Apply adds them, rolls Luck if ticked, and goes on to starting gold. Skip adds them without rolling Luck. Closing this window adds nothing.</p>`,
    buttons: [
      { action: "ok", label: "Apply", icon: "fa-solid fa-check", default: true, callback: (ev, btn) => ({ luck: !!btn.form?.elements?.luck?.checked }) },
      { action: "skip", label: "Skip" }
    ],
    rejectClose: false
  });
  if (!res) return null;
  return finish(res !== "skip" && !!res.luck);
}

/* -------------------------------------------- */
/*  Ancestry                                    */
/* -------------------------------------------- */

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];
const signedN = n => (n >= 0 ? `+${n}` : `−${-n}`);
const bonusText = b => Object.entries(b ?? {}).filter(([, v]) => v).map(([k, v]) => `${signedN(v)} ${ARNEYAN.abilityAbbr[k]}`).join(", ");

/** Starting Scores (Player's Handbook): when a character is created, no score can go above 18. */
export const START_CAP = 18;
const pts = n => `${n} point${n === 1 ? "" : "s"}`;

/**
 * Attribute changes at creation: each score after its change, stopped at 18, and the points that went over
 * (only a bonus goes over; a score already above 18 keeps its value and the whole bonus is spare).
 */
export function capAtCreation(scores, deltas) {
  const after = { ...scores };
  const over = {};
  for (const [k, v] of Object.entries(deltas)) {
    let next = scores[k] + v;
    if (v > 0 && next > START_CAP) { over[k] = next - Math.max(scores[k], START_CAP); next = Math.max(scores[k], START_CAP); }
    after[k] = next;
  }
  return { after, over };
}

/** Where spare points go by default: the next best attribute still under 18 (ties in sheet order). */
export function overflowTarget(after, exclude = []) {
  return ABILITY_KEYS.filter(k => !exclude.includes(k) && after[k] < START_CAP).sort((a, b) => after[b] - after[a])[0] ?? null;
}

/**
 * "Moving the excess": the points an ancestry bonus would take past 18 go to another attribute the owner picks
 * (by default the next best one under 18), which also stops at 18. Changes `after` in place; returns what moved
 * ({ int: 2 }), one line per move, and the points nowhere could take.
 */
export async function placeOverflow(actor, after, over) {
  const moved = {};
  const lines = [];
  let lost = 0;
  for (const [from, total] of Object.entries(over)) {
    let left = total;
    while (left > 0) {
      const def = overflowTarget(after, [from]);
      if (!def) { lost += left; break; }
      const room = ABILITY_KEYS.filter(k => k !== from && after[k] < START_CAP);
      const options = room.map(k => {
        const put = Math.min(left, START_CAP - after[k]);
        return `<option value="${k}" ${k === def ? "selected" : ""}>${ARNEYAN.abilities[k]} ${after[k]} (to ${after[k] + put}${put < left ? `, room for ${put}` : ""})</option>`;
      }).join("");
      const pick = await DialogV2.wait({
        window: { title: `${actor.name}: no score above 18`, icon: "fa-solid fa-arrow-right-arrow-left" }, position: { width: 440 },
        content: `<p>Your ancestry bonus would take ${ARNEYAN.abilities[from]} past 18. When a character is created no score can go above 18, so put the ${pts(left)} that would be lost into another attribute instead. That attribute also stops at 18.</p>
          <div class="form-group"><label>Move ${pts(left)} to</label><select name="to">${options}</select></div>`,
        buttons: [{ action: "ok", label: "Move", default: true, callback: (ev, btn) => btn.form.elements.to.value }],
        rejectClose: false
      });
      // Closing the window puts them on the default rather than losing them.
      const to = room.includes(pick) ? pick : def;
      const put = Math.min(left, START_CAP - after[to]);
      after[to] += put;
      moved[to] = (moved[to] ?? 0) + put;
      lines.push(`${pts(put)} from ${ARNEYAN.abilityAbbr[from]} to ${ARNEYAN.abilityAbbr[to]}`);
      left -= put;
    }
  }
  return { moved, lines, lost };
}

/** The ancestries compendium as picker entries: grouped by size, the attribute changes under each name. */
async function ancestryEntries(filter = () => true) {
  const sizes = Object.keys(ARNEYAN.sizes);
  const rank = s => { const n = sizes.indexOf(s); return n < 0 ? 99 : n; };
  return (await packOptions("ancestries", filter, ["system.size", "system.attributes"]))
    .sort((a, b) => rank(a.system?.size) - rank(b.system?.size) || a.name.localeCompare(b.name))
    .map(e => ({ value: e.uuid, uuid: e.uuid, name: e.name, group: ARNEYAN.sizes[e.system?.size] ?? "Other", meta: e.system?.attributes ?? "" }));
}

/**
 * Pick an ancestry for a character that has none (the first class dropped on a blank sheet), then set it up.
 * Returns the ancestry, "later" (none picked, or none to pick), "skip" (Skip pressed, when `skip` is set) or null
 * (a window closed).
 */
export async function pickAncestry(actor, { step = "", entries = null, skip = false } = {}) {
  entries ??= await ancestryEntries();
  if (!entries.length) return "later";
  const uuid = await pickFromList({
    title: `${actor.name}: ancestry`, step, entries, takeLabel: "Choose ancestry", skipLabel: skip ? "Skip" : "", width: 720,
    intro: `<p>${esc(actor.name)} has no ancestry yet. Pick one first: its attribute changes count towards your starting Hit Points. Click one to read it.${skip ? " <strong>Choose later</strong> leaves a step empty; <strong>Skip</strong> stops choosing and goes on to starting gold." : ""}</p>`
  });
  if (uuid === null) return null;
  if (uuid === "later" || uuid === "skip") return uuid;
  const doc = await fromUuid(uuid);
  if (!doc) return "later";
  const data = doc.toObject();
  delete data._id;
  data.folder = null;
  foundry.utils.setProperty(data, "_stats.compendiumSource", doc.uuid);
  const [anc] = await actor.createEmbeddedDocuments("Item", [data], { arneyanSkipSetup: true });
  if (!anc) return "later";
  const done = await ancestrySetup(actor, anc, { step, skip });
  if (done === false) return null;
  if (done === "skip" && skip) return "skip";
  return anc;
}

/**
 * When an ancestry lands on a character: its subtype, bloodline, caste or lineage, a Human's two +1s, a Tiefling's
 * family, and its attribute changes (at creation, no score above 18). Its traits go on the sheet as ancestry
 * features, and the choice's own numbers (a bloodline's Resistance 5) apply as rules. The choice and the family are
 * picked from lists that show their text; the +1s and the scores box are a small form after.
 * Returns false when a window is closed and "skip" when Skip is pressed (nothing set up either way).
 */
export async function ancestrySetup(actor, anc, { step = "" } = {}) {
  const s = anc.system;
  const baseName = anc.name.replace(/\s*\(.*\)$/, "");
  const opts = s.choice?.options ?? [];
  const atCreation = (actor.system.level ?? 0) <= 1;
  const anyBonus = Object.keys(s.bonuses ?? {}).length || s.pickTwo || opts.some(o => Object.keys(o.bonuses ?? {}).length);
  const head = `<p><strong>${esc(anc.name)}</strong>${bonusText(s.bonuses) ? `: ${esc(bonusText(s.bonuses))}` : ""}.`;

  // The subtype, bloodline, caste or lineage, each with what it gives.
  let choice = null;
  if (opts.length) {
    const what = esc(s.choice.label.toLowerCase());
    const pick = await pickFromList({
      title: `${actor.name}: ${baseName} ${s.choice.label.toLowerCase()}`, step, width: 680,
      intro: `${head} Choose your ${what}: click one to read what it gives.</p>`,
      entries: opts.map((o, i) => {
        const b = bonusText(o.bonuses);
        return { value: String(i), name: o.name, meta: b, group: s.choice.label,
          html: `<h3>${esc(o.name)}</h3>${b ? `<p class="arn-pick-meta">${esc(b)}</p>` : ""}<p>${esc(o.text)}</p>` };
      }),
      takeLabel: `Choose ${what}`, skipLabel: "Skip"
    });
    if (pick === null) return false;
    if (pick === "skip") return "skip";
    if (pick !== "later" && opts[Number(pick)]) choice = Number(pick);
  }

  // A Tiefling's family: another ancestry, with its description.
  let family = "";
  if (s.family) {
    const families = await ancestryEntries(e => e.name !== baseName);
    if (families.length) {
      const human = families.find(e => e.name === "Human");
      const pick = await pickFromList({
        title: `${actor.name}: family`, step, width: 720,
        intro: `${head} Which family were you born into? You speak its language. Click one to read about it.</p>`,
        entries: families.map(e => ({ ...e, value: e.name })), preselect: human ? "Human" : null,
        takeLabel: "Choose family", skipLabel: "Skip"
      });
      if (pick === null) return false;
      if (pick === "skip") return "skip";
      if (pick !== "later") family = pick;
    }
  }

  // The rest in a small form: a Human's two +1s and whether to add the attribute changes.
  const o = choice !== null ? opts[choice] : null;
  const attrOpts = ABILITY_KEYS.map(k => `<option value="${k}">${ARNEYAN.abilities[k]}</option>`).join("");
  const picked = [o && `${esc(s.choice.label)}: <strong>${esc(o.name)}</strong>${bonusText(o.bonuses) ? ` (${esc(bonusText(o.bonuses))})` : ""}`,
    family && `Family: <strong>${esc(family)}</strong>`].filter(Boolean);
  const content = `<div class="arn-anc-setup">
    ${head} Speed, size and vision are set; its traits go on the Features tab.</p>
    ${picked.length ? `<p>${picked.join("<br>")}</p>` : ""}
    ${s.pickTwo ? `<div class="form-group"><label>+1 to</label><select name="pick1">${attrOpts}</select></div>
      <div class="form-group"><label>and +1 to</label><select name="pick2">${attrOpts.replace('value="dex"', 'value="dex" selected')}</select></div>` : ""}
    ${anyBonus ? `<div class="form-group"><label>Add the attribute changes to the scores</label><input type="checkbox" name="scores" ${atCreation ? "checked" : ""}></div>
      <p class="hint">${atCreation ? "When a character is created no score can go above 18. If a bonus would take a score past 18, you choose another attribute for the extra points (it also stops at 18)." : "Leave this off if the scores already include them."}</p>` : ""}
  </div>`;
  let res;
  for (;;) {
    res = await DialogV2.wait({
      window: { title: stepTitle(`${actor.name}: ${anc.name}`, step) }, position: { width: 460 }, content,
      buttons: [
        { action: "ok", label: "Apply", default: true, callback: (ev, btn) => {
          const f = btn.form.elements;
          return { picks: s.pickTwo ? [f.pick1.value, f.pick2.value] : [], scores: !!f.scores?.checked };
        } },
        { action: "skip", label: "Skip" }
      ],
      rejectClose: false
    });
    if (!res) return false;
    if (res === "skip") return "skip";
    if (!(s.pickTwo && res.scores && res.picks[0] === res.picks[1])) break;
    ui.notifications.warn("A Human's two +1s go to two different attributes: pick again.");
  }
  if (!actor.items.has(anc.id)) return;
  res = { ...res, picks: res.picks ?? [], choice, family };
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
  const scores = Object.fromEntries(ABILITY_KEYS.map(k => [k, actor._source.system.abilities[k].value]));
  let after = Object.fromEntries(Object.entries(deltas).map(([k, v]) => [k, scores[k] + v]));
  let moves = { moved: {}, lines: [], lost: 0 };
  if (atCreation) {
    const capped = capAtCreation(scores, deltas);
    if (Object.keys(capped.over).length) moves = await placeOverflow(actor, capped.after, capped.over);
    after = capped.after;
  }
  // What the ancestry added to each score, the moved points included, so removing the ancestry takes it all back.
  const applied = {};
  const upd = {};
  for (const k of ABILITY_KEYS) {
    if (!(k in deltas) && !(k in moves.moved)) continue;
    applied[k] = after[k] - scores[k];
    if (applied[k]) upd[`system.abilities.${k}.value`] = after[k];
  }
  if (Object.keys(upd).length) await actor.update(upd);
  await anc.update({ name: label, [`flags.${FLAG}.ancestry`]: { choice: o?.name ?? "", family: res.family, applied, moved: moves.moved } });
  const lines = [bonusText(applied) && `scores ${bonusText(applied)}`, moves.lines.length && `moved ${moves.lines.join(", ")} (no score above 18 at creation)`,
    o && `${s.choice.label.toLowerCase()} ${o.name}`, res.family && `${res.family} family`].filter(Boolean);
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${esc(actor.name)} is ${/^[AEIOU]/i.test(anc.name) ? "an" : "a"} <strong>${esc(label)}</strong>${lines.length ? `: ${esc(lines.join("; "))}` : ""}.</p>` });
  if (moves.lost) ui.notifications.warn(`No score above 18 at creation, and every other attribute is already 18: ${pts(moves.lost)} lost.`, { permanent: true });
}

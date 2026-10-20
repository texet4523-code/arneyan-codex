/**
 * Summoning (Drop 4). Spellcasting in Arneyan, "Summoned and conjured attackers": unless a spell or feature says
 * otherwise you can have only one spell-made attacker at a time (a summoned creature, or the group from one
 * summoning); casting another ends the first. Summoned creatures act straight after you in the initiative order
 * and obey your spoken commands. Familiars and mounts do not count (see companions.mjs).
 *
 * A summoning spell's chat card (and the Warlock's Pact Summons card) gets a Summon button. The caster picks
 * creatures from the Bestiary within the spell's limits; the GM's client places them beside the caster, owned by
 * the caster's players, adds them to the caster's combat straight after the caster, and ends the caster's previous
 * summon. They go when the spell's duration runs out (combat rounds or the world clock), when concentration ends,
 * when they drop to 0 HP, or when dismissed.
 *
 * The caster keeps a record in flags.arneyan.summon: { id, name, source, kind, tier, sceneId, tokenIds, actorIds,
 * endsAt, expires: { combat, round, turn }, concentration }.
 */
import { ARNEYAN } from "./config.mjs";
import { formatSpan, MINUTE, HOUR, ROUND, roundSeconds } from "./worldtime.mjs";

const SYS = "arneyan";
const SOCKET = `system.${SYS}`;
const FOLDER = "Summoned";
const MONSTERS = `${SYS}.monsters`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* -------------------------------------------- */
/*  What each summoning gives (from its text)   */
/* -------------------------------------------- */

/**
 * The summoning spells, from their text in the Spells compendium. Each option is one way of casting it:
 *   max         highest creature Level
 *   count       how many ("1", or dice rolled when it is cast: "1d4+1", all the same creature)
 *   totalLevels the creatures' Levels may add up to the caster level, to this cap (Summon Animals)
 *   filter      which creatures fit: any, animal (beasts), animalOrPlant, elemental, extraplanar, or a list of names
 * duration: n units, per caster level or not. concentration: ends with the caster's concentration.
 */
export const SUMMON_SPELLS = {
  "Summon Lesser Monster": { filter: "any", duration: { n: 1, unit: "round", perLevel: true },
    options: [{ label: "One creature of Level 3 or lower", max: 3, count: "1" }, { label: "1d4+1 creatures of Level 1 or lower", max: 1, count: "1d4+1" }],
    note: "Animals, vermin or monsters with no spellcasting, summoning or at-will magic. They vanish at 0 HP." },
  "Summon Monster": { filter: "any", duration: { n: 1, unit: "round", perLevel: true },
    options: [{ label: "One creature of Level 6 or lower", max: 6, count: "1" }, { label: "1d3 creatures of Level 3 or lower", max: 3, count: "1d3" }],
    note: "They act on your initiative, follow spoken commands and vanish at 0 HP." },
  "Summon Greater Monster": { filter: "any", duration: { n: 1, unit: "round", perLevel: true },
    options: [{ label: "One non-unique monster of Level 9 or lower", max: 9, count: "1" }],
    note: "It will not take suicidal orders, and the spell ends early if you are Incapacitated." },
  "Summon Animals": { filter: "animal", duration: { n: 1, unit: "minute", perLevel: true },
    options: [{ label: "Natural animals of Level 4 or lower each, Levels adding up to your level (max 12)", max: 4, totalLevels: 12 }],
    note: "They act on your initiative, follow spoken commands and vanish at 0 HP." },
  "Summon Beasts or Plants": { filter: "animalOrPlant", duration: { n: 1, unit: "minute", perLevel: true },
    options: [{ label: "Animals or animate plants of Level 6 or lower each, Levels adding up to your level (max 14)", max: 6, totalLevels: 14 }],
    note: "They act on your initiative, follow spoken commands and vanish at 0 HP." },
  "Summon Elemental": { filter: "elemental", duration: { n: 1, unit: "minute", perLevel: true },
    options: [{ label: "One elemental (air, earth, fire or water) of Level 10 or lower", max: 10, count: "1" }],
    note: "If you are Incapacitated it attacks the nearest creature." },
  "Summon Elemental Swarm": { filter: "elemental", duration: { n: 1, unit: "minute", perLevel: true },
    options: [{ label: "1d4+1 elementals of one type, each of Level 10 or lower", max: 10, count: "1d4+1" }],
    note: "They act as one group." },
  "Summon Planar Ally": { filter: "extraplanar", duration: { n: 1, unit: "hour", perLevel: true },
    options: [{ label: "One extraplanar creature of Level 16 or lower", max: 16, count: "1" }],
    note: "Aligned with your deity or alignment. It performs one task for 100 gp per Level, refuses suicidal tasks and leaves if unpaid or attacked." },
  "Summon Swarm": { filter: ["Bat Swarm", "Rat Swarm", "Spider Swarm"], duration: { n: 1, unit: "round", perLevel: true }, concentration: true,
    options: [{ label: "A swarm of bats, rats or spiders", max: 99, count: "1" }],
    note: "It moves 30ft a round as you direct it; fire destroys it." }
};

/** Spell-made attackers with no creature to place (Spellcasting in Arneyan): casting one still ends the last summon. */
export const ATTACKER_SPELLS = ["Spiritual Weapon", "Animate Objects", "Mordenkainen's Sword", "Mordenkainen's Faithful Hound", "Bigby's Clenched Fist", "Bigby's Crushing Hand", "Bigby's Interposing Hand", "Shadow Monsters", "Changestaff"];

/** The Warlock's patron paths: which kits belong to each, and its servants by tier (Warlock class, Shared Summons). */
export const PACT_PATHS = {
  infernal: { label: "Path of the Infernal", kits: ["Asmodeus", "Zariel", "Dispater", "Mammon", "Belial & Fierna", "Levistus", "Glasya", "Baalzebul", "Mephistopheles"],
    pool: [["Imp"], ["Hell Hound"], ["Cambion"], ["Erinyes"]] },
  abyss: { label: "Path of the Abyss", kits: ["Orcus", "Graz'zt", "Demogorgon", "Baphomet", "Yeenoghu"],
    pool: [["Quasit"], ["Dretch", "Dretch"], ["Succubus"], ["Vrock"]] },
  fey: { label: "Path of the Fey", kits: ["The Queen of Air and Darkness", "Verenestra", "Tiandra"],
    pool: [["Pixie"], ["Redcap"], ["Unicorn"], ["Treant"]] },
  goo: { label: "Path of the Great Old One", kits: ["Tharizdun, the Chained God", "Bolothamogg"],
    pool: [["Star Spawn Grue"], ["Intellect Devourer"], ["Chuul"], ["Star Spawn Hulk"]] }
};
/** Warlock level each tier unlocks at, and the slot level it spends (Tier 4 needs Pact Summons (Tier 4): a 5th-level slot). */
export const PACT_TIERS = [{ tier: 1, level: 3, slot: 1 }, { tier: 2, level: 7, slot: 2 }, { tier: 3, level: 11, slot: 3 }, { tier: 4, level: 15, slot: 5 }];
/** A combat summons lasts 1 minute, a ritual summons (10 minutes to call) 1 hour. */
export const PACT_MODES = { combat: { label: "Combat summons (your action, 1 minute)", seconds: MINUTE }, ritual: { label: "Ritual summons (10 minutes, lasts 1 hour)", seconds: HOUR } };

/** A Warlock's path from their kit's name ("Asmodeus (Warlock)"), or "". */
export function pactPath(kitNames = []) {
  for (const n of kitNames) {
    const base = String(n).replace(/\s*\(Warlock\)\s*$/i, "").trim();
    for (const [k, p] of Object.entries(PACT_PATHS)) if (p.kits.includes(base)) return k;
  }
  return "";
}

/** The tiers a Warlock can call: unlocked by level (and Tier 4 by its own feature). */
export function pactTiers(warlockLevel, hasTier4 = false) {
  return PACT_TIERS.filter(t => warlockLevel >= t.level && (t.tier < 4 || hasTier4));
}

/** A creature's Level as a number: ½ and ¼ count as halves and quarters. */
export function creatureLevel(level, levelText = "") {
  if (levelText === "½") return 0.5;
  if (levelText === "¼") return 0.25;
  return Number(level) || 0;
}

/** Does a Bestiary entry fit the spell's kind of creature? */
export function fitsFilter(filter, entry) {
  const type = String(entry.type ?? "").toLowerCase();
  const name = String(entry.name ?? "");
  if (Array.isArray(filter)) return filter.includes(name);
  switch (filter) {
    case "animal": return type.startsWith("beast") && !type.includes("swarm");
    case "animalOrPlant": return (type.startsWith("beast") && !type.includes("swarm")) || type.includes("plant");
    case "elemental": return /^(air|earth|fire|water) elemental$/i.test(name);
    case "extraplanar": return /fiend|celestial|elemental/.test(type);
    default: return true;
  }
}

/** The Bestiary entries (index rows {uuid, name, img, level, levelText, type}) an option allows. */
export function candidates(spec, option, index) {
  return index.filter(e => fitsFilter(spec.filter, e) && creatureLevel(e.level, e.levelText) <= (option.max ?? 99))
    .sort((a, b) => creatureLevel(a.level, a.levelText) - creatureLevel(b.level, b.levelText) || a.name.localeCompare(b.name));
}

/**
 * Check what a caster picked against the option: [{entry, count}]. Returns "" when it's fine, or why not.
 * For a dice count ("1d4+1") one creature is picked and the number is rolled later.
 */
export function checkPicks(spec, option, picks, cl = 1) {
  const list = picks.filter(p => p.count > 0);
  if (!list.length) return "Pick a creature.";
  for (const p of list) {
    if (!fitsFilter(spec.filter, p.entry)) return `${p.entry.name} isn't the kind of creature this calls.`;
    if (creatureLevel(p.entry.level, p.entry.levelText) > (option.max ?? 99)) return `${p.entry.name} is above Level ${option.max}.`;
    if (!Number.isInteger(p.count) || p.count < 1 || p.count > 30) return "That's not a sensible number of creatures.";
  }
  if (option.totalLevels) {
    const cap = Math.min(Math.max(1, cl), option.totalLevels);
    const total = list.reduce((t, p) => t + creatureLevel(p.entry.level, p.entry.levelText) * p.count, 0);
    if (total > cap + 1e-9) return `Their Levels add up to ${total}; your limit is ${cap}.`;
    return "";
  }
  if (list.length > 1 || list[0].count !== 1) return "Pick one creature.";
  return "";
}

/** How long a summoning lasts, in seconds, at this caster level. */
export function summonSeconds(spec, cl = 1) {
  const d = spec.duration;
  const unit = { round: ROUND, minute: MINUTE, hour: HOUR }[d.unit] ?? ROUND;
  return d.n * unit * (d.perLevel ? Math.max(1, cl) : 1);
}

/** Double the dice in a damage formula (Tier 1 servants): "1d4" to "2d4", "1d6+2" to "2d6+2". Flat numbers stay. */
export function doubleDice(formula) {
  return String(formula ?? "").replace(/(\d*)d(\d+)/gi, (_, n, f) => `${(Number(n) || 1) * 2}d${f}`);
}

/** Has a summon's time run out? Its combat's rounds while that combat runs, else the world clock. */
export function summonOver(rec, now, combats = null) {
  if (!rec) return false;
  const x = rec.expires;
  const c = x?.combat ? combats?.get?.(x.combat) : null;
  if (c?.started) return c.round > x.round || (c.round === x.round && (c.turn ?? 0) >= x.turn);
  return Number.isFinite(rec.endsAt) && now >= rec.endsAt;
}

/**
 * Free spots beside a token, nearest first, in grid cells: the caster at cx, cy (w by h cells), the creature w2 by h2.
 * `taken` is a list of {x, y, w, h} cells already occupied.
 */
export function freeSpots(cx, cy, w, h, w2, h2, taken, n) {
  const out = [];
  const busy = [...taken, { x: cx, y: cy, w, h }];
  const clash = (x, y) => busy.some(b => x < b.x + b.w && x + w2 > b.x && y < b.y + b.h && y + h2 > b.y);
  for (let r = 1; r <= 8 && out.length < n; r++) {
    for (let y = cy - r - h2 + 1; y <= cy + h - 1 + r && out.length < n; y++) {
      for (let x = cx - r - w2 + 1; x <= cx + w - 1 + r && out.length < n; x++) {
        const ring = Math.max(cx - (x + w2 - 1), x - (cx + w - 1), cy - (y + h2 - 1), y - (cy + h - 1));
        if (ring !== r || clash(x, y)) continue;
        out.push({ x, y });
        busy.push({ x, y, w: w2, h: h2 });
      }
    }
  }
  return out;
}

/* -------------------------------------------- */
/*  The Bestiary                                */
/* -------------------------------------------- */

async function bestiaryIndex() {
  const pack = game.packs.get(MONSTERS);
  if (!pack) return [];
  const idx = await pack.getIndex({ fields: ["system.level", "system.details.levelText", "system.details.type"] });
  return idx.map(e => ({ uuid: e.uuid ?? `Compendium.${MONSTERS}.Actor.${e._id}`, id: e._id, name: e.name, img: e.img,
    level: e.system?.level ?? 0, levelText: e.system?.details?.levelText ?? "", type: e.system?.details?.type ?? "" }));
}

const levelLabel = e => (e.levelText || e.level);

/* -------------------------------------------- */
/*  The caster's side                           */
/* -------------------------------------------- */

/** The caster's token on the scene being viewed (or any scene), for placing summons beside it. */
function casterToken(actor) {
  if (actor.isToken) return actor.token;
  return actor.getActiveTokens?.(false, true)?.[0] ?? game.scenes.find(s => s.tokens.some(t => t.actorId === actor.id && t.actorLink))?.tokens.find(t => t.actorId === actor.id) ?? null;
}

function warlockOf(actor) {
  return actor.items.find(i => i.type === "class" && /^warlock/i.test(i.name)) ?? null;
}

/** The Summon button's job: open the picker for a spell or for Pact Summons. */
export async function openSummon(item, { mode = "" } = {}) {
  const actor = item?.actor;
  if (!actor?.isOwner) return ui.notifications.warn("You don't control that caster.");
  if (!game.users.activeGM) return ui.notifications.warn("Summoning needs the GM online.");
  const token = casterToken(actor);
  if (!token) return ui.notifications.warn(`Put ${actor.name}'s token on the scene first: summoned creatures appear beside it.`);
  const req = { action: "world.summon", casterUuid: actor.uuid, sceneId: token.parent?.id, tokenId: token.id, itemId: item.id };
  if (/^pact summons/i.test(item.name)) return pickPact(actor, item, req, mode);
  const spec = SUMMON_SPELLS[item.name];
  if (!spec) return;
  return pickSpell(actor, item, spec, req);
}

async function pickSpell(actor, item, spec, req) {
  const index = await bestiaryIndex();
  if (!index.length) return ui.notifications.warn("The Bestiary (Monsters & Treasure compendium) isn't available.");
  const cl = item.caster?.classLevel ?? actor.system.level ?? 1;
  const loosest = spec.options.reduce((a, o) => ((o.max ?? 99) > (a.max ?? 99) ? o : a), spec.options[0]);
  const rows = candidates(spec, loosest, index);
  if (!rows.length) return ui.notifications.warn("No creature in the Bestiary fits this summoning.");
  const secs = summonSeconds(spec, cl);
  const multi = o => !!o.totalLevels;
  const content = `<div class="arn-summon">
    <p>Caster level ${cl}: they stay for <strong>${formatSpan(secs)}</strong>${spec.concentration ? " while you concentrate" : ""}. ${esc(spec.note ?? "")}</p>
    ${spec.options.length > 1 ? `<fieldset class="arn-summon-opts">${spec.options.map((o, i) => `<label><input type="radio" name="option" value="${i}" ${i === 0 ? "checked" : ""}> ${esc(o.label)}</label>`).join("")}</fieldset>` : `<p class="arn-muted">${esc(spec.options[0].label)}${multi(spec.options[0]) ? `: up to ${Math.min(cl, spec.options[0].totalLevels)} Levels in all.` : ""}</p><input type="hidden" name="option" value="0">`}
    <input type="search" class="arn-summon-filter" placeholder="Filter by name or type">
    <ul class="arn-summon-list">${rows.map(e => `<li data-level="${creatureLevel(e.level, e.levelText)}" data-name="${esc(`${e.name} ${e.type}`.toLowerCase())}">
      <input class="arn-pick-one" type="radio" name="pick" value="${esc(e.uuid)}">
      <input class="arn-pick-many" type="number" name="n.${esc(e.uuid)}" value="0" min="0" max="30">
      <img src="${esc(e.img)}" alt=""><span class="arn-summon-name">${esc(e.name)}</span><span class="arn-muted">Level ${esc(levelLabel(e))} · ${esc(e.type)}</span></li>`).join("")}</ul>
  </div>`;
  const read = form => {
    const option = Number(form.elements.option?.value ?? form.querySelector("input[name=option]:checked")?.value ?? 0) || 0;
    const opt = spec.options[option];
    let picks;
    if (multi(opt)) picks = rows.map(e => ({ entry: e, count: Number(form.elements[`n.${e.uuid}`]?.value) || 0 })).filter(p => p.count > 0);
    else {
      const uuid = form.querySelector("input[name=pick]:checked")?.value;
      picks = rows.filter(e => e.uuid === uuid).map(e => ({ entry: e, count: 1 }));
    }
    return { option, picks };
  };
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `${item.name}: summon`, icon: "fa-solid fa-dragon" }, classes: ["arneyan", "arn-summon-app"], position: { width: 520 }, content,
    buttons: [{ action: "go", label: "Summon", icon: "fa-solid fa-dragon", default: true, callback: (ev, btn) => read(btn.form) }, { action: "cancel", label: "Cancel" }],
    rejectClose: false,
    render: (event, dialog) => wirePicker(dialog?.element ?? event?.target?.element, spec)
  });
  if (!result || typeof result !== "object") return;
  const opt = spec.options[result.option];
  const err = checkPicks(spec, opt, result.picks, cl);
  if (err) return ui.notifications.warn(err);
  return send({ ...req, kind: "spell", option: result.option, picks: result.picks.map(p => ({ uuid: p.entry.uuid, count: p.count })) });
}

/** Filter box and the one-or-many switch in the picker. */
function wirePicker(root, spec) {
  if (!root) return;
  const list = root.querySelector(".arn-summon-list");
  const apply = () => {
    const i = Number(root.querySelector("input[name=option]:checked")?.value ?? root.querySelector("input[name=option]")?.value ?? 0) || 0;
    const o = spec.options[i];
    const q = String(root.querySelector(".arn-summon-filter")?.value ?? "").trim().toLowerCase();
    list.classList.toggle("many", !!o.totalLevels);
    for (const li of list.children) li.hidden = Number(li.dataset.level) > (o.max ?? 99) || (q && !li.dataset.name.includes(q));
  };
  root.querySelectorAll("input[name=option]").forEach(r => r.addEventListener("change", apply));
  root.querySelector(".arn-summon-filter")?.addEventListener("input", apply);
  apply();
}

async function pickPact(actor, item, req, mode) {
  const lock = warlockOf(actor);
  if (!lock) return ui.notifications.warn(`${actor.name} has no Warlock levels.`);
  const lvl = lock.system.levels;
  const hasT4 = actor.items.some(i => /^pact summons \(tier 4\)/i.test(i.name));
  const tiers = pactTiers(lvl, hasT4);
  if (!tiers.length) return ui.notifications.warn("Pact Summons opens at Warlock level 3.");
  let path = pactPath(actor.items.filter(i => i.type === "kit").map(i => i.name));
  const caster = actor.system.casters?.find(c => c.id === lock.id);
  const slain = actor.getFlag(SYS, "pactSlain");
  if (slain) return ui.notifications.warn(`${actor.name}'s servant was slain: it can't be called again until a long rest.`);
  const pathPick = path ? `<p>${esc(PACT_PATHS[path].label)}</p>` : `<label>Path <select name="path">${Object.entries(PACT_PATHS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("")}</select></label>`;
  const tierRows = PACT_TIERS.map(t => {
    const open = tiers.some(x => x.tier === t.tier);
    const left = caster?.slots?.[t.slot]?.left ?? 0;
    const why = !open ? (t.tier === 4 && lvl >= 15 ? "needs Pact Summons (Tier 4)" : `Warlock level ${t.level}`) : left <= 0 ? `no ${ARNEYAN.spellLevels[t.slot]}-level slot left` : "";
    return `<label class="${why ? "arn-muted" : ""}"><input type="radio" name="tier" value="${t.tier}" ${why ? "disabled" : ""}> Tier ${t.tier}: <span class="arn-tier-name" data-tier="${t.tier}"></span> (${ARNEYAN.spellLevels[t.slot]}-level slot)${why ? ` · ${esc(why)}` : ""}</label>`;
  }).join("");
  const content = `<div class="arn-summon">
    ${pathPick}
    <fieldset class="arn-summon-opts">${tierRows}</fieldset>
    <fieldset class="arn-summon-opts">${Object.entries(PACT_MODES).map(([k, m]) => `<label><input type="radio" name="mode" value="${k}" ${k === (mode || "combat") ? "checked" : ""}> ${esc(m.label)}</label>`).join("")}</fieldset>
    <p class="arn-muted">It acts straight after you, moving and taking one action, and obeys your spoken commands (with none, it attacks the nearest visible enemy). One at a time. Tier 1 servants have double the HP and damage dice of their stat blocks.</p></div>`;
  const names = p => Object.fromEntries(PACT_PATHS[p].pool.map((c, i) => [i + 1, c.length > 1 ? `${c[0]} pair` : c[0]]));
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Pact Summons", icon: "fa-solid fa-dragon" }, classes: ["arneyan", "arn-summon-app"], position: { width: 480 }, content,
    buttons: [{ action: "go", label: "Summon", icon: "fa-solid fa-dragon", default: true, callback: (ev, btn) => ({
      path: path || btn.form.elements.path?.value, tier: Number(btn.form.querySelector("input[name=tier]:checked")?.value) || 0,
      mode: btn.form.querySelector("input[name=mode]:checked")?.value || "combat" }) }, { action: "cancel", label: "Cancel" }],
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog?.element ?? event?.target?.element;
      const show = () => { const p = path || root.querySelector("select[name=path]")?.value || "infernal"; const n = names(p); root.querySelectorAll(".arn-tier-name").forEach(s => { s.textContent = n[s.dataset.tier]; }); };
      root?.querySelector("select[name=path]")?.addEventListener("change", show);
      if (root) show();
    }
  });
  if (!result || typeof result !== "object") return;
  if (!result.tier) return ui.notifications.warn("Pick a tier.");
  path = result.path;
  return send({ ...req, kind: "pact", tier: result.tier, path, mode: result.mode });
}

function send(msg) {
  if (game.users.activeGM?.isSelf) return doSummonRequest(msg, game.user.id).catch(err => ui.notifications.error(err.message));
  game.socket.emit(SOCKET, msg);
  ui.notifications.info("Summoning...");
}

/** Dismiss a caster's summon (anyone who controls the caster). */
export function dismissSummon(actor) {
  if (!actor?.isOwner) return;
  if (game.users.activeGM?.isSelf) return endSummon(actor, "dismissed");
  if (!game.users.activeGM) return ui.notifications.warn("Dismissing a summon needs the GM online.");
  game.socket.emit(SOCKET, { action: "world.dismissSummon", casterUuid: actor.uuid });
}

/* -------------------------------------------- */
/*  The GM's side                               */
/* -------------------------------------------- */

async function summonedFolder() {
  return game.folders.find(f => f.type === "Actor" && f.name === FOLDER)
    ?? Folder.create({ name: FOLDER, type: "Actor", color: "#4a2a5a", sorting: "a" });
}

/** Check a request from a player and do it. Throws with a reason the GM sees in the console. */
export async function doSummonRequest(msg, senderId) {
  const sender = game.users.get(senderId);
  const caster = await fromUuid(String(msg.casterUuid ?? "")).catch(() => null);
  if (!sender || !(caster instanceof Actor) || caster.pack || !caster.testUserPermission(sender, "OWNER")) throw new Error("Not your caster.");
  const scene = game.scenes.get(String(msg.sceneId ?? ""));
  const token = scene?.tokens.get(String(msg.tokenId ?? ""));
  if (!token || !(token.actor === caster || (token.actorLink && token.actorId === caster.id))) throw new Error("The caster's token isn't on that scene.");
  const item = caster.items.get(String(msg.itemId ?? ""));
  if (!item) throw new Error("No such spell or feature.");
  const index = await bestiaryIndex();
  const byUuid = new Map(index.map(e => [e.uuid, e]));
  const now = game.time.worldTime;
  let plan;
  if (msg.kind === "spell") {
    const spec = SUMMON_SPELLS[item.name];
    const opt = spec?.options?.[Number(msg.option)];
    if (item.type !== "spell" || !opt) throw new Error("Not a summoning spell.");
    const cl = item.caster?.classLevel ?? caster.system.level ?? 1;
    const picks = (Array.isArray(msg.picks) ? msg.picks : []).slice(0, 20).map(p => ({ entry: byUuid.get(String(p?.uuid)), count: Math.floor(Number(p?.count) || 0) })).filter(p => p.entry);
    const err = checkPicks(spec, opt, picks, cl);
    if (err) throw new Error(err);
    if (!opt.totalLevels && opt.count !== "1") picks[0].count = Math.max(1, (await new Roll(opt.count).evaluate()).total);
    plan = { name: item.name, kind: "spell", picks, seconds: summonSeconds(spec, cl), concentration: !!spec.concentration, note: spec.note ?? "", rolled: !opt.totalLevels && opt.count !== "1" ? opt.count : "" };
  } else if (msg.kind === "pact") {
    if (!/^pact summons/i.test(item.name)) throw new Error("Not Pact Summons.");
    const lock = warlockOf(caster);
    const tiers = pactTiers(lock?.system.levels ?? 0, caster.items.some(i => /^pact summons \(tier 4\)/i.test(i.name)));
    const t = tiers.find(x => x.tier === Number(msg.tier));
    const path = PACT_PATHS[String(msg.path)];
    const mode = PACT_MODES[String(msg.mode)];
    if (!t || !path || !mode) throw new Error("That tier isn't open.");
    if (caster.getFlag(SYS, "pactSlain")) throw new Error("The servant was slain: not until a long rest.");
    const names = path.pool[t.tier - 1];
    const picks = [...new Set(names)].map(n => ({ entry: index.find(e => e.name === n), count: names.filter(x => x === n).length })).filter(p => p.entry);
    if (!picks.length) throw new Error(`${names[0]} isn't in the Bestiary.`);
    // Every summons spends a slot of the creature's tier.
    const used = Array.from({ length: 10 }, (_, i) => lock.system.slotsUsed?.[i] ?? 0);
    const slot = caster.system.casters?.find(c => c.id === lock.id)?.slots?.[t.slot];
    if (!slot || slot.left <= 0) throw new Error(`No ${ARNEYAN.spellLevels[t.slot]}-level slot left.`);
    used[t.slot] += 1;
    await lock.update({ "system.slotsUsed": used });
    plan = { name: "Pact Summons", kind: "pact", tier: t.tier, picks, seconds: mode.seconds, concentration: false, double: t.tier === 1,
      note: `${ARNEYAN.spellLevels[t.slot]}-level slot spent. It acts straight after you; if you fall unconscious it only defends itself.` };
  } else throw new Error("Unknown summoning.");
  return placeSummon(caster, token, plan, now);
}

/** Make the creatures, put them on the map and in the combat, and remember them on the caster. */
async function placeSummon(caster, token, plan, now) {
  await endSummon(caster, "replaced");
  const scene = token.parent;
  const folder = await summonedFolder();
  const owners = Object.fromEntries(game.users.filter(u => !u.isGM && caster.testUserPermission(u, "OWNER")).map(u => [u.id, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER]));
  const grid = scene.grid?.size ?? 100;
  const taken = scene.tokens.filter(t => !t.hidden).map(t => ({ x: Math.round(t.x / grid), y: Math.round(t.y / grid), w: Math.max(1, Math.round(t.width)), h: Math.max(1, Math.round(t.height)) }));
  const actorIds = [];
  const tokenData = [];
  const names = [];
  for (const p of plan.picks) {
    const src = await fromUuid(p.entry.uuid);
    if (!src) continue;
    const data = src.toObject();
    delete data._id;
    data.folder = folder?.id ?? null;
    data.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, ...owners };
    data.prototypeToken = { ...(data.prototypeToken ?? {}), actorLink: false, disposition: token.disposition ?? 1 };
    foundry.utils.setProperty(data, `flags.${SYS}.summoned`, { casterUuid: caster.uuid, source: plan.name });
    foundry.utils.setProperty(data, `flags.${SYS}.bestiary`, p.entry.uuid);
    if (plan.double) {
      const hp = data.system.attributes.hp;
      hp.max = (hp.max || 1) * 2; hp.value = hp.max;
      for (const it of data.items ?? []) {
        if (it.system?.damage) it.system.damage = doubleDice(it.system.damage);
        for (const b of it.system?.bonusDamage ?? []) b.formula = doubleDice(b.formula);
      }
    }
    const actor = await Actor.create(data, { arneyanGrant: true });
    actorIds.push(actor.id);
    const w = Math.max(1, Math.round(data.prototypeToken.width ?? 1)), h = Math.max(1, Math.round(data.prototypeToken.height ?? 1));
    const spots = freeSpots(Math.round(token.x / grid), Math.round(token.y / grid), Math.max(1, Math.round(token.width)), Math.max(1, Math.round(token.height)), w, h, taken, p.count);
    names.push(spots.length > 1 ? `${p.entry.name} × ${spots.length}` : p.entry.name);
    for (const s of spots) {
      taken.push({ x: s.x, y: s.y, w, h });
      const doc = await actor.getTokenDocument({ x: s.x * grid, y: s.y * grid, disposition: token.disposition ?? 1, actorLink: false }, { parent: scene });
      tokenData.push(doc.toObject());
    }
  }
  const made = tokenData.length ? await scene.createEmbeddedDocuments("Token", tokenData) : [];
  // Straight after the caster in the caster's combat.
  const combat = game.combats.find(c => c.scene?.id === scene.id && c.combatants.some(cb => cb.tokenId === token.id));
  let expires = null;
  if (combat) {
    const cb = combat.combatants.find(x => x.tokenId === token.id);
    const init = Number.isFinite(cb?.initiative) ? cb.initiative - 0.01 : null;
    await combat.createEmbeddedDocuments("Combatant", made.map(t => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId, initiative: init, flags: { [SYS]: { summonedBy: cb?.id ?? "" } } })), { arneyanSummon: true });
    if (combat.started) expires = { combat: combat.id, round: combat.round + Math.ceil(plan.seconds / roundSeconds()), turn: combat.turn ?? 0 };
  }
  const rec = {
    id: foundry.utils.randomID(), name: names.join(", "),
    source: plan.name, kind: plan.kind, tier: plan.tier ?? 0, sceneId: scene.id, tokenIds: made.map(t => t.id), actorIds,
    endsAt: now + plan.seconds, expires, concentration: plan.concentration
  };
  await caster.update({ [`flags.${SYS}.summon`]: rec });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: caster }),
    content: `<div class="arn-card"><header class="arn-card-title"><i class="fa-solid fa-dragon"></i> <span>${esc(caster.name)} summons ${esc(rec.name)}</span></header>
      <p>${esc(plan.name)}${plan.rolled ? ` (${esc(plan.rolled)} rolled: ${made.length})` : ""}. ${made.length} creature${made.length === 1 ? "" : "s"} beside ${esc(caster.name)}, for ${formatSpan(plan.seconds)}${plan.concentration ? " while concentrating" : ""}.${combat ? " They act straight after their summoner." : ""}</p>
      ${plan.note ? `<p class="arn-card-meta">${esc(plan.note)}</p>` : ""}</div>`
  });
  return rec;
}

/** End a caster's summon: tokens, combatants and the summoned actors go. GM only. */
export async function endSummon(caster, reason = "ended") {
  const rec = caster?.getFlag?.(SYS, "summon");
  if (!rec || !game.users.activeGM?.isSelf) return;
  await caster.unsetFlag(SYS, "summon");
  const scene = game.scenes.get(rec.sceneId);
  const ids = new Set(rec.tokenIds ?? []);
  for (const combat of game.combats) {
    const gone = combat.combatants.filter(c => ids.has(c.tokenId)).map(c => c.id);
    if (gone.length) await combat.deleteEmbeddedDocuments("Combatant", gone).catch(() => null);
  }
  const tokens = scene ? [...ids].filter(id => scene.tokens.has(id)) : [];
  if (tokens.length) await scene.deleteEmbeddedDocuments("Token", tokens).catch(() => null);
  for (const id of rec.actorIds ?? []) {
    const a = game.actors.get(id);
    if (a && !game.scenes.some(s => s.tokens.some(t => t.actorId === id))) await a.delete({ arneyanForce: true }).catch(() => null);
  }
  if (reason === "slain" && rec.kind === "pact") await caster.setFlag(SYS, "pactSlain", true);
  const why = { replaced: "a new summoning replaces it", dismissed: "dismissed", time: "its time is up", concentration: "concentration ended", slain: "slain", attacker: "another spell-made attacker replaces it" }[reason] ?? reason;
  if (rec.name) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: caster }), content: `<div class="arn-card"><p><i class="fa-solid fa-dragon"></i> ${esc(caster.name)}'s ${esc(rec.name)} (${esc(rec.source)}) departs: ${esc(why)}.${reason === "slain" && rec.kind === "pact" ? " It can't be called again until a long rest." : ""}</p></div>` });
}

/** Actors (world and unlinked tokens) holding a summon record. */
function summoners() {
  const out = game.actors.filter(a => a.flags?.[SYS]?.summon);
  for (const s of game.scenes) for (const t of s.tokens) if (!t.actorLink && t.actor?.flags?.[SYS]?.summon) out.push(t.actor);
  return out;
}

async function checkTimes() {
  if (!game.users.activeGM?.isSelf) return;
  const now = game.time.worldTime;
  for (const a of summoners()) if (summonOver(a.getFlag(SYS, "summon"), now, game.combats)) await endSummon(a, "time");
}

/** A summoned creature at 0 HP vanishes; when the last of a summoning goes, the summon ends. */
async function vanishIfDown(tokenDoc) {
  if (!game.users.activeGM?.isSelf || !tokenDoc?.actor) return;
  const info = tokenDoc.actor.flags?.[SYS]?.summoned;
  if (!info || (tokenDoc.actor.system?.attributes?.hp?.value ?? 1) > 0) return;
  const caster = await fromUuid(info.casterUuid).catch(() => null);
  const rec = caster?.getFlag(SYS, "summon");
  if (!rec?.tokenIds?.includes(tokenDoc.id)) return;
  const left = rec.tokenIds.filter(id => id !== tokenDoc.id && tokenDoc.parent.tokens.has(id));
  if (!left.length) return endSummon(caster, "slain");
  for (const combat of game.combats) {
    const gone = combat.combatants.filter(c => c.tokenId === tokenDoc.id).map(c => c.id);
    if (gone.length) await combat.deleteEmbeddedDocuments("Combatant", gone).catch(() => null);
  }
  await caster.setFlag(SYS, "summon", { ...rec, tokenIds: left });
  await tokenDoc.delete().catch(() => null);
}

async function onSocket(msg, senderId) {
  if (!game.users.activeGM?.isSelf || !msg || typeof msg !== "object") return;
  try {
    if (msg.action === "world.summon") await doSummonRequest(msg, senderId);
    else if (msg.action === "world.dismissSummon") {
      const sender = game.users.get(senderId);
      const caster = await fromUuid(String(msg.casterUuid ?? "")).catch(() => null);
      if (caster instanceof Actor && sender && caster.testUserPermission(sender, "OWNER")) await endSummon(caster, "dismissed");
    }
  } catch (err) {
    console.warn("Arneyan | summon", err);
    if (msg.action === "world.summon") ChatMessage.create({ whisper: [senderId, game.user.id], content: `<p>Summoning didn't happen: ${esc(err.message)}</p>` });
  }
}

/** The summon on an actor for its sheet: name, source and time left. */
export function summonSummary(actor) {
  const rec = actor?.flags?.[SYS]?.summon;
  if (!rec) return null;
  const now = globalThis.game?.time?.worldTime ?? 0;
  const c = rec.expires?.combat ? globalThis.game?.combats?.get?.(rec.expires.combat) : null;
  const left = c?.started ? `${Math.max(0, rec.expires.round - c.round)} rounds left` : Number.isFinite(rec.endsAt) ? `${formatSpan(rec.endsAt - now)} left` : "";
  return { name: rec.name, source: rec.source, left, concentration: !!rec.concentration };
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

function chatItem(message) {
  const uuid = message.flags?.[SYS]?.itemUuid;
  if (!uuid || typeof fromUuidSync !== "function") return null;
  try { return fromUuidSync(uuid); } catch { return null; }
}

export function registerSummons() {
  Hooks.once("ready", () => game.socket.on(SOCKET, onSocket));

  // A Summon button on summoning spells' cards and on Pact Summons, for whoever controls the caster.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const item = chatItem(message);
    if (!item?.actor?.isOwner) return;
    const pact = item.type === "ability" && /^pact summons/i.test(item.name);
    if (!pact && !(item.type === "spell" && SUMMON_SPELLS[item.name])) return;
    const card = html.querySelector?.(".arn-card") ?? html;
    if (!card || card.querySelector(".arn-summon-btn")) return;
    const mode = /ritual/i.test(card.querySelector(".arn-card-title")?.textContent ?? "") ? "ritual" : "combat";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "arn-summon-btn";
    btn.innerHTML = `<i class="fa-solid fa-dragon"></i> ${pact ? "Call your patron's servant" : "Summon creatures"}`;
    btn.addEventListener("click", ev => { ev.preventDefault(); openSummon(item, { mode }); });
    card.append(btn);
  });

  // Casting another spell-made attacker (a summoning, Spiritual Weapon and the like) ends the summon (GM).
  Hooks.on("createChatMessage", message => {
    if (!game.users.activeGM?.isSelf) return;
    const item = chatItem(message);
    if (item?.type !== "spell" || !item.actor || !(ATTACKER_SPELLS.includes(item.name) || SUMMON_SPELLS[item.name])) return;
    if (!/Cast as|Concentrating/.test(message.content ?? "") && item.actor.type !== "npc") return;
    if (item.actor.getFlag(SYS, "summon")) endSummon(item.actor, "attacker");
  });

  // Durations: the world clock and the combat's rounds.
  Hooks.on("updateWorldTime", () => checkTimes().catch(err => console.warn("Arneyan | summon time", err)));
  Hooks.on("updateCombat", (combat, changed) => { if ("turn" in changed || "round" in changed) checkTimes().catch(() => null); });
  Hooks.on("deleteCombat", () => checkTimes().catch(() => null));

  // Concentration ends: a summon held by it ends too.
  Hooks.on("deleteActiveEffect", effect => {
    if (!game.users.activeGM?.isSelf || !effect.flags?.[SYS]?.concentration) return;
    const actor = effect.parent;
    const rec = actor?.getFlag?.(SYS, "summon");
    if (rec?.concentration && rec.source === effect.flags[SYS].sourceName) endSummon(actor, "concentration");
  });

  // 0 HP: the creature vanishes.
  Hooks.on("updateActor", actor => { if (actor.isToken && actor.flags?.[SYS]?.summoned) vanishIfDown(actor.token).catch(() => null); });
  Hooks.on("updateToken", (token, changes) => {
    if (foundry.utils.hasProperty(changes, "delta.system.attributes.hp.value")) vanishIfDown(token).catch(() => null);
  });

  // They act straight after their summoner, whatever is rolled for them.
  Hooks.on("preUpdateCombatant", (c, changes, options) => {
    const by = c.flags?.[SYS]?.summonedBy;
    if (!by || !("initiative" in changes) || options.arneyanSummon) return;
    const m = c.parent?.combatants?.get(by);
    if (Number.isFinite(m?.initiative)) changes.initiative = m.initiative - 0.01;
  });
  Hooks.on("updateCombatant", (c, changes) => {
    if (!game.users.activeGM?.isSelf || !("initiative" in changes) || !Number.isFinite(c.initiative)) return;
    const followers = c.parent.combatants.filter(x => x.flags?.[SYS]?.summonedBy === c.id && x.initiative !== c.initiative - 0.01);
    if (followers.length) c.parent.updateEmbeddedDocuments("Combatant", followers.map(x => ({ _id: x.id, initiative: c.initiative - 0.01 })), { arneyanSummon: true }).catch(() => null);
  });

  // A long rest lets a slain pact servant be called again.
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (userId !== game.user.id || !foundry.utils.hasProperty(changes, "system.rest.haven") || !actor.getFlag(SYS, "pactSlain")) return;
    actor.unsetFlag(SYS, "pactSlain");
  });
}

/**
 * Treasure from a code (Monsters & Treasure, Treasure): individual treasure (P to S), hoards (A to H, carried
 * or "lair"), gems and art, trade goods and magic items. Posts one card with everything rolled and a button that
 * puts it in the party stash (coins to the stash's coins, items as items).
 *
 * The rolling is pure (pass any async dice roller), so it can be tested outside Foundry.
 */
const SYS = "arneyan";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* -------------------------------------------- */
/*  The book's tables                           */
/* -------------------------------------------- */

/** Individual treasure, rolled for each creature. */
export const INDIVIDUAL = {
  N: { coins: [] },
  P: { coins: [["2d6", "sp"]] },
  Q: { coins: [["1d6", "gp"]] },
  R: { coins: [["2d6", "gp"]] },
  S: { coins: [["4d6", "gp"]], gems: { chance: 25, count: "1", grade: "lesser" } }
};

/** Hoards, rolled once for the whole group. */
export const HOARDS = {
  A: { coins: "2d6 * 10" },
  B: { coins: "1d6 * 100", gems: { count: "1d4", grade: "lesser" } },
  C: { coins: "2d6 * 100", gems: { count: "1d6", grade: "lesser" }, magic: [{ chance: 20, rarity: "uncommon" }] },
  D: { coins: "3d6 * 100", gems: { count: "2d6", grade: "lesser" }, art: { count: "1d4", grade: "minor" }, magic: [{ chance: 40, rarity: "uncommon" }] },
  E: { coins: "1d6 * 1000", gems: { count: "2d6", grade: "fine" }, magic: [{ chance: 50, rarity: "rare" }] },
  F: { coins: "2d6 * 1000", gems: { count: "3d6", grade: "fine" }, art: { count: "1d6", grade: "minor" }, magic: [{ chance: 100, rarity: "uncommon" }, { chance: 40, rarity: "rare" }] },
  G: { coins: "4d6 * 1000", gems: { count: "3d6", grade: "superb" }, art: { count: "1d6", grade: "major" }, magic: [{ chance: 100, rarity: "rare" }, { chance: 30, rarity: "veryRare" }] },
  H: { coins: "1d6 * 10000", gems: { count: "4d6", grade: "superb" }, art: { count: "2d6", grade: "major" }, magic: [{ chance: 100, rarity: "veryRare" }, { chance: 100, rarity: "rare" }] }
};

/** A dragon's hoard by age. */
export const DRAGON_HOARDS = { Wyrmling: "D", Young: "E", Adult: "G", Ancient: "H" };

/** Gem value tiers (the Catalogue's Gems & Jewellery) with its example stones. */
export const GEM_TIERS = {
  ornamental: { label: "Ornamental", value: 10, stones: ["Azurite", "Banded Agate", "Blue Quartz", "Hematite", "Lapis Lazuli", "Malachite", "Moss Agate", "Obsidian", "Tiger Eye", "Turquoise"] },
  semiPrecious: { label: "Semi-Precious", value: 50, stones: ["Bloodstone", "Carnelian", "Chalcedony", "Citrine", "Jasper", "Moonstone", "Onyx", "Rock Crystal", "Smoky Quartz", "Zircon"] },
  fancy: { label: "Fancy", value: 100, stones: ["Amber", "Alexandrite", "Amethyst", "Chrysoberyl", "Coral", "Garnet", "Jade", "Jet", "Pearl", "Tourmaline"] },
  precious: { label: "Precious", value: 500, stones: ["Aquamarine", "Black Opal", "Black Pearl", "Fire Opal", "Peridot", "Topaz"] },
  gem: { label: "Gem", value: 1000, stones: ["Black Sapphire", "Blue Sapphire", "Emerald", "Star Ruby", "Star Sapphire", "Water Opal"] },
  jewel: { label: "Jewel", value: 5000, stones: ["Diamond", "Jacinth", "Ruby", "Yellow Sapphire"] }
};

/** Roll a d6 for each gem on its grade's column. */
export const GEM_GRADES = {
  lesser: ["ornamental", "ornamental", "semiPrecious", "semiPrecious", "fancy", "fancy"],
  fine: ["semiPrecious", "semiPrecious", "fancy", "fancy", "precious", "gem"],
  superb: ["fancy", "precious", "precious", "gem", "gem", "jewel"]
};

/** Art objects: value, slots and the book's examples. */
export const ART = {
  minor: { label: "Minor art", value: "1d6 * 50", slots: 1, examples: ["Silver goblets", "Carved ivory", "Embroidered cloth", "Signet set with a chip of stone"] },
  major: { label: "Major art", value: "2d6 * 250", slots: 2, examples: ["Gold crown", "Jewelled chalice", "Painted panel", "Ceremonial blade"] }
};

/** Trade goods (d8), 2 slots a lot. */
export const TRADE_GOODS = [
  ["Bolts of fine cloth", 60], ["Casks of wine", 50], ["Furs and pelts", 120], ["Spices and dyes", 200],
  ["Ingots of silver", 250], ["Salt and fine oils", 80], ["Tea, coffee or tobacco", 150], ["Fine weapons or tools", 300]
];

/** Enchanted arms and armour: replacement values. */
export const ENCHANTED = {
  weapon: { 1: 450, 2: 3000, 3: 9000 }, armour: { 1: 450, 2: 3000, 3: 9000 }, shield: { 1: 400, 2: 2500, 3: 8000 }
};

export const ICONIC_UNCOMMON = ["Javelin of Lightning", "Cloak of Elvenkind", "Rope of Climbing", "Boots of Elvenkind"];
export const ICONIC_RARE = ["Flame Tongue", "Frost Brand", "Sun Blade", "Elven Chain", "Spellguard Shield", "Ring of Free Action",
  "Ring of Spell Storing", "Wand of Wonder", "Staff of Healing", "Ring of Invisibility", "Gauntlets of Ogre Power", "Cloak of Displacement",
  "Crystal Ball", "Instrument of the Bards", "Headband of Intellect", "Boots of Speed", "Bracers of Defence"];
export const ICONIC_VERY_RARE = ["Luck Blade", "Vorpal Sword", "Holy Avenger", "Dwarven Thrower", "Dragon Scale Mail", "Ring of Regeneration",
  "Rod of Absorption", "Staff of the Magi", "Robe of the Archmagi", "Carpet of Flying", "Efreeti Bottle", "Mace of Delving"];

const RARITY_LABEL = { uncommon: "Uncommon", rare: "Rare", veryRare: "Very Rare" };
const ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];

/* -------------------------------------------- */
/*  Reading a code                              */
/* -------------------------------------------- */

/**
 * "S, lair E" (or the stat block's "Treasure type <strong>S, lair E</strong>" line) as parts:
 * [{ code: "S", lair: false, kind: "individual" }, { code: "E", lair: true, kind: "hoard" }]. N and "-" give none.
 */
export function parseTreasureCode(text) {
  let t = String(text ?? "");
  const strong = t.match(/<strong>([^<]*)<\/strong>/i);
  if (strong) t = strong[1];
  t = t.replace(/<[^>]+>/g, " ").replace(/treasure(\s+type)?:?/ig, " ").replace(/\([^)]*\)/g, " ");
  const parts = [];
  for (const piece of t.split(/[,;+&]|\band\b/i)) {
    const m = piece.trim().match(/^(lair\s+)?([A-HNPQRS])$/i);
    if (!m) continue;
    const code = m[2].toUpperCase();
    if (code === "N") continue;
    parts.push({ code, lair: !!m[1], kind: code in HOARDS ? "hoard" : "individual" });
  }
  return parts;
}

/** How a code reads in plain words, for buttons and tooltips. */
export function describeCode(parts) {
  if (!parts.length) return "No treasure";
  return parts.map(p => p.kind === "hoard" ? `Hoard ${p.code}${p.lair ? " in the lair" : ""}` : `Individual ${p.code}`).join(", ");
}

/* -------------------------------------------- */
/*  Rolling                                     */
/* -------------------------------------------- */

const emptyCoins = () => ({ pp: 0, gp: 0, sp: 0, cp: 0 });

/**
 * Roll treasure.
 * @param {{code:string, lair:boolean, kind:string}[]} parts  From parseTreasureCode.
 * @param {object} o
 * @param {(formula:string) => Promise<number>} o.roll  Dice roller.
 * @param {number} [o.count]      Creatures (individual treasure is rolled for each).
 * @param {boolean} [o.lair]      Include hoards that sit in a lair.
 * @param {number} [o.tradeLots]  Lots of trade goods a hoard holds instead of that much of its coin.
 * @param {string} [o.name]       Who it's from, for the section headings.
 * @returns {Promise<{coins:object, items:object[], sections:object[], value:number}>}
 */
export async function rollTreasure(parts, { roll, count = 1, lair = true, tradeLots = 0, name = "" } = {}) {
  const pick = async list => list[Math.clamp((await roll(`1d${list.length}`)) - 1, 0, list.length - 1)];
  const pct = async chance => chance >= 100 || (await roll("1d100")) <= chance;
  const sections = [];
  let tradeLeft = Math.max(0, Math.floor(Number(tradeLots) || 0));

  const gems = async (n, grade, items) => {
    for (let i = 0; i < n; i++) {
      const tier = GEM_GRADES[grade][(await roll("1d6")) - 1];
      const t = GEM_TIERS[tier];
      const stone = await pick(t.stones);
      items.push({ kind: "gem", name: `${stone} (${t.label} gem)`, qty: 1, value: t.value, price: `${t.value} gp`, slots: 1, bundle: 5 });
    }
  };
  const art = async (n, grade, items) => {
    const a = ART[grade];
    for (let i = 0; i < n; i++) {
      const value = await roll(a.value);
      const what = await pick(a.examples);
      items.push({ kind: "art", name: `${what} (${a.label.toLowerCase()})`, qty: 1, value, price: `${value} gp`, slots: a.slots, bundle: 0 });
    }
  };

  for (const p of parts) {
    if (p.kind === "individual") {
      const def = INDIVIDUAL[p.code];
      if (!def) continue;
      const sec = { label: `Individual treasure ${p.code}${count > 1 ? ` × ${count}` : ""}`, coins: emptyCoins(), items: [] };
      for (let c = 0; c < count; c++) {
        for (const [f, den] of def.coins) sec.coins[den] += await roll(f);
        if (def.gems && await pct(def.gems.chance)) await gems(1, def.gems.grade, sec.items);
      }
      sections.push(sec);
      continue;
    }
    const def = HOARDS[p.code];
    if (!def || (p.lair && !lair)) continue;
    const sec = { label: `Hoard ${p.code}${p.lair ? " (in the lair, to be found)" : ""}`, coins: emptyCoins(), items: [], lair: p.lair };
    sec.coins.gp += await roll(def.coins);
    // Goods in bulk instead of coin: each lot's value comes off the coin.
    while (tradeLeft > 0 && sec.coins.gp > 0) {
      const [lot, value] = await pick(TRADE_GOODS);
      if (value > sec.coins.gp) break;
      sec.coins.gp -= value;
      tradeLeft--;
      sec.items.push({ kind: "trade", name: `${lot} (a lot of trade goods)`, qty: 1, value, price: `${value} gp`, slots: 2, bundle: 0 });
    }
    if (def.gems) await gems(await roll(def.gems.count), def.gems.grade, sec.items);
    if (def.art) await art(await roll(def.art.count), def.art.grade, sec.items);
    for (const m of def.magic ?? []) if (await pct(m.chance)) sec.items.push(...await magicItem(m.rarity, roll));
    sections.push(sec);
  }

  for (const s of sections) s.items = mergeItems(s.items);
  const coins = emptyCoins();
  for (const s of sections) for (const k of Object.keys(coins)) coins[k] += s.coins[k];
  const items = mergeItems(sections.flatMap(s => s.items));
  const value = coins.pp * 10 + coins.gp + coins.sp / 10 + coins.cp / 100 + items.filter(i => i.kind !== "magic").reduce((t, i) => t + (i.value || 0) * i.qty, 0);
  return { name, coins, items, sections, value: Math.round(value * 100) / 100 };
}

/** Same item twice (two Amethysts) becomes one stack. */
function mergeItems(list) {
  const out = [];
  for (const i of list) {
    const same = out.find(x => x.name === i.name && x.kind === i.kind && x.value === i.value);
    if (same) same.qty += i.qty; else out.push({ ...i });
  }
  return out;
}

const enchanted = (what, plus, note = "") => ({
  kind: "magic", name: `${what[0].toUpperCase()}${what.slice(1)} +${plus}`, qty: 1, value: ENCHANTED[what][plus], price: `${ENCHANTED[what][plus].toLocaleString("en-GB")} gp`,
  slots: 1, bundle: 0, placeholder: true,
  note: note || `Choose the ${what} and give it +${plus}${what === "weapon" ? " to attack and damage" : " to AC"}.`
});
const scroll = level => ({ kind: "magic", name: `Scroll, ${ORD[level]} level`, find: `Scroll, ${ORD[level]} level`, qty: 1, slots: 1, bundle: 5, note: "Choose the spell." });
const named = (n, note = "") => ({ kind: "magic", name: n, find: n, qty: 1, slots: 1, bundle: 0, ...(note ? { note } : {}) });
const gmChoice = (label, list) => ({ kind: "magic", name: `${label} (GM's choice)`, qty: 1, slots: 1, bundle: 0, placeholder: true, note: `Choose one: ${list.join(", ")}.` });

/** One magic item (or a few scrolls) from the hoard tables (d10 by rarity). */
export async function magicItem(rarity, roll) {
  const d = await roll("1d10");
  if (rarity === "uncommon") {
    if (d <= 3) return [enchanted("weapon", 1, "The GM picks the weapon. Give it +1 to attack and damage.")];
    if (d === 4) return [enchanted("armour", 1)];
    if (d === 5) return [enchanted("shield", 1)];
    if (d === 6) return [named("Ring of Protection")];
    if (d === 7) return [named("Wand of Magic Missiles")];
    if (d === 8) return [named("Potion of Superior Healing", "Or swap it for a potion from the Catalogue's Uncommon tier.")];
    if (d === 9) {
      const n = await roll("1d3");
      const out = [];
      for (let i = 0; i < n; i++) out.push(scroll(await roll("1d2")));
      return out;
    }
    return [named(ICONIC_UNCOMMON[(await roll("1d4")) - 1])];
  }
  if (rarity === "rare") {
    if (d <= 2) return [enchanted("weapon", 2)];
    if (d === 3) return [{ ...enchanted("armour", 2), name: "Armour +2, or a shield +2", note: "The GM chooses: armour +2 or a shield +2." }];
    if (d === 4) {
      const n = await roll("1d2");
      const out = [];
      for (let i = 0; i < n; i++) out.push(scroll(2 + await roll("1d2")));
      return out;
    }
    const r = await roll("1d20");
    return [r <= ICONIC_RARE.length ? named(ICONIC_RARE[r - 1]) : gmChoice("Iconic Rare item", ICONIC_RARE)];
  }
  // Very rare.
  if (d <= 2) return [enchanted("weapon", 3)];
  if (d === 3) return [{ ...enchanted("armour", 3), name: "Armour +3, or a shield +3", note: "The GM chooses: armour +3 or a shield +3." }];
  if (d === 4) return [scroll(4 + await roll("1d2"))];
  const r = await roll("1d12");
  return [r === 12 ? named("Mace of Delving", "Or a Unique the GM makes (Uniques in the Catalogue).") : named(ICONIC_VERY_RARE[r - 1])];
}

/* -------------------------------------------- */
/*  The chat card                               */
/* -------------------------------------------- */

export function coinText(c) {
  return ["pp", "gp", "sp", "cp"].filter(k => c?.[k]).map(k => `${Number(c[k]).toLocaleString("en-GB")} ${k}`).join(", ");
}

/** The card's HTML. `uuids` maps an item's name to its compendium entry, for links. */
export function treasureCardHtml(result, { title = "Treasure", code = "", uuids = {} } = {}) {
  const itemLine = i => {
    const uuid = uuids[i.find ?? ""];
    const name = uuid ? `@UUID[${uuid}]{${esc(i.name)}}` : esc(i.name);
    const qty = i.qty > 1 ? `${i.qty} × ` : "";
    const each = i.kind !== "magic" && i.value ? ` <span class="arn-muted">(${i.value.toLocaleString("en-GB")} gp${i.qty > 1 ? " each" : ""})</span>` : "";
    const note = i.note ? ` <span class="arn-muted">${esc(i.note)}</span>` : "";
    return `<li class="arn-tr-${i.kind}">${qty}${name}${each}${note}</li>`;
  };
  const secs = result.sections.map(s => {
    const coins = coinText(s.coins);
    const rows = [coins ? `<li class="arn-tr-coins"><i class="fa-solid fa-coins"></i> ${coins}</li>` : "", ...s.items.map(itemLine)].filter(Boolean);
    return `<section class="arn-tr-section"><h4>${esc(s.label)}</h4><ul>${rows.join("") || '<li class="arn-muted">Nothing.</li>'}</ul></section>`;
  }).join("");
  const empty = !result.sections.length || (!coinText(result.coins) && !result.items.length);
  return `<div class="arn-card arn-treasure"><header class="arn-card-title"><i class="fa-solid fa-gem"></i> <span>${esc(title)}</span>${code ? `<span class="arn-mode">${esc(code)}</span>` : ""}</header>
    ${empty ? '<p class="arn-muted">Nothing worth taking.</p>' : secs}
    ${empty ? "" : `<p class="arn-tr-total">Coins, gems, art and goods worth about <strong>${Math.round(result.value).toLocaleString("en-GB")} gp</strong>${result.items.some(i => i.kind === "magic") ? ", plus the magic" : ""}.</p>
    <button type="button" class="arn-tr-stash"><i class="fa-solid fa-sack-dollar"></i> Put it in the party stash</button>`}
  </div>`;
}

/* -------------------------------------------- */
/*  In Foundry                                  */
/* -------------------------------------------- */

const foundryRoll = async formula => (await new Roll(formula).evaluate()).total;

/** Compendium entries for the named magic items, by name. */
async function itemUuids(names) {
  const pack = game.packs.get(`${SYS}.equipment`);
  if (!pack) return {};
  const index = await pack.getIndex();
  const out = {};
  for (const n of new Set(names.filter(Boolean))) {
    const e = index.find(x => x.name.toLowerCase() === n.toLowerCase());
    if (e) out[n] = e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`;
  }
  return out;
}

/** Ask how to roll a monster's (or a group's) treasure. Returns { count, lair, tradeLots } or null. */
export async function treasureOptions({ parts, count = 1, askCount = true, name = "" } = {}) {
  const hasLair = parts.some(p => p.lair);
  const hasHoard = parts.some(p => p.kind === "hoard");
  const hasIndividual = parts.some(p => p.kind === "individual");
  const content = `<p><strong>${esc(name)}</strong>: ${esc(describeCode(parts))}.</p>
    ${askCount && hasIndividual ? `<div class="form-group"><label>How many creatures</label><input type="number" name="count" value="${count}" min="1" max="200"></div><p class="arn-help">Individual treasure is rolled for each creature (once for a group that pools its takings).</p>` : ""}
    ${hasLair ? `<div class="form-group"><label><input type="checkbox" name="lair" checked> Include the hoard in the lair</label></div>` : ""}
    ${hasHoard ? `<div class="form-group"><label>Lots of trade goods</label><input type="number" name="trade" value="0" min="0" max="20"></div><p class="arn-help">Some hoards hold goods in bulk instead of coin: each lot's value comes off the hoard's coin.</p>` : ""}`;
  return foundry.applications.api.DialogV2.prompt({
    window: { title: "Roll treasure", icon: "fa-solid fa-gem" }, classes: ["arneyan", "arn-gm-dialog"], content,
    ok: { label: "Roll", icon: "fa-solid fa-dice", callback: (ev, button) => {
      const f = button.form.elements;
      return { count: Math.clamp(Number(f.count?.value) || count || 1, 1, 200), lair: f.lair ? f.lair.checked : true, tradeLots: Math.clamp(Number(f.trade?.value) || 0, 0, 20) };
    } },
    rejectClose: false
  }).catch(() => null);
}

/**
 * Roll treasure and post the card (GM only, whispered to the GMs).
 * @param {object} o
 * @param {string} o.title  Card heading ("Treasure: Goblins").
 * @param {{code:string, lair:boolean, kind:string}[]} o.parts
 */
export async function postTreasure({ title, parts, count = 1, lair = true, tradeLots = 0, speaker = null }) {
  if (!game.user.isGM) return ui.notifications.warn("The GM rolls treasure.");
  const result = await rollTreasure(parts, { roll: foundryRoll, count, lair, tradeLots, name: title });
  const uuids = await itemUuids(result.items.map(i => i.find));
  for (const i of result.items) if (i.find && uuids[i.find]) i.uuid = uuids[i.find];
  for (const s of result.sections) for (const i of s.items) if (i.find && uuids[i.find]) i.uuid = uuids[i.find];
  const code = parts.map(p => `${p.lair ? "lair " : ""}${p.code}`).join(", ");
  return ChatMessage.create({
    speaker: speaker ?? ChatMessage.getSpeaker({ alias: "Treasure" }),
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
    content: treasureCardHtml(result, { title, code, uuids }),
    flags: { [SYS]: { kind: "treasure", treasure: { coins: result.coins, items: result.items } } }
  });
}

/** Treasure for one monster (its sheet's button). */
export async function treasureForActor(actor) {
  if (!game.user.isGM) return;
  const parts = parseTreasureCode(actor.system.details?.treasure ?? "");
  if (!parts.length) return ui.notifications.info(`${actor.name} carries no treasure (code N, or none set on the Biography tab).`);
  const opts = await treasureOptions({ parts, name: actor.name });
  if (!opts) return;
  return postTreasure({ title: `Treasure: ${actor.name}`, parts, ...opts, speaker: ChatMessage.getSpeaker({ actor }) });
}

/**
 * Treasure for an encounter: individual treasure for every creature, each kind's hoard once.
 * @param {{name:string, uuid:string, count:number}[]} foes
 */
export async function treasureForFoes(foes) {
  if (!game.user.isGM) return;
  const groups = [];
  for (const f of foes) {
    const actor = await fromUuid(f.uuid).catch(() => null);
    const parts = parseTreasureCode(actor?.system?.details?.treasure ?? "");
    if (parts.length) groups.push({ name: f.name, count: f.count, parts });
  }
  if (!groups.length) return ui.notifications.info("None of these creatures has treasure.");
  const allParts = groups.flatMap(g => g.parts);
  const opts = await treasureOptions({ parts: allParts, askCount: false, name: groups.map(g => `${g.name} × ${g.count}`).join(", ") });
  if (!opts) return;
  // One card: each group's sections, all of it stashable together.
  const merged = { coins: { pp: 0, gp: 0, sp: 0, cp: 0 }, items: [], sections: [], value: 0 };
  for (const g of groups) {
    const r = await rollTreasure(g.parts, { roll: foundryRoll, count: g.count, lair: opts.lair, tradeLots: opts.tradeLots });
    for (const s of r.sections) merged.sections.push({ ...s, label: `${g.name}: ${s.label}` });
    for (const k of Object.keys(merged.coins)) merged.coins[k] += r.coins[k];
    merged.items.push(...r.items);
    merged.value += r.value;
  }
  merged.items = mergeItems(merged.items);
  const uuids = await itemUuids(merged.items.map(i => i.find));
  for (const i of merged.items) if (i.find && uuids[i.find]) i.uuid = uuids[i.find];
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ alias: "Treasure" }),
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
    content: treasureCardHtml(merged, { title: "Treasure: the encounter", uuids }),
    flags: { [SYS]: { kind: "treasure", treasure: { coins: merged.coins, items: merged.items } } }
  });
}

const IMG = {
  gem: `systems/${SYS}/assets/icons/magic-cut-diamond.svg`,
  art: `systems/${SYS}/assets/icons/treasure-jeweled-chalice.svg`,
  trade: `systems/${SYS}/assets/icons/gear-wooden-crate.svg`,
  magic: `systems/${SYS}/assets/icons/magic-swap-bag.svg`
};

/** Item data for one line of treasure: the compendium entry when there is one, a plain item otherwise. */
async function itemDataFor(i) {
  if (i.uuid) {
    const doc = await fromUuid(i.uuid).catch(() => null);
    if (doc) {
      const data = doc.toObject();
      delete data._id;
      data.system.quantity = i.qty;
      foundry.utils.setProperty(data, "_stats.compendiumSource", i.uuid);
      if (i.note) data.system.description = `<p><em>${esc(i.note)}</em></p>${data.system.description ?? ""}`;
      return data;
    }
  }
  return {
    name: i.name, type: "equipment", img: IMG[i.kind] ?? IMG.magic,
    system: {
      quantity: i.qty, slots: i.slots ?? 1, bundle: i.bundle ?? 0, price: i.price ?? "",
      description: `<p>${esc(i.kind === "gem" ? "A gem from a hoard. Gems and art sell for their value to anyone who can pay; a fence pays half."
        : i.kind === "art" ? "An art object. It sells to a patron or a dealer for its value; a fence pays half."
        : i.kind === "trade" ? "A lot of goods in bulk. It sells for its full value to a merchant who deals in it; a shopkeeper elsewhere pays half."
        : "From a hoard.")}</p>${i.note ? `<p><em>${esc(i.note)}</em></p>` : ""}`
    }
  };
}

/** The card's button: coins to the stash's coins, everything else as items (GM). */
async function stashTreasure(message, btn) {
  if (!game.user.isGM) return ui.notifications.warn("The GM puts treasure in the stash.");
  const f = message.flags?.[SYS];
  if (f?.kind !== "treasure" || !f.treasure || !message.author?.isGM) return;
  if (f.stashed) return ui.notifications.info("That treasure is already in the stash.");
  const party = game.arneyan?.party?.active?.();
  if (!party) return ui.notifications.warn("There's no party to give it to.");
  const t = f.treasure;
  const cur = party.system.currency ?? {};
  const upd = {};
  for (const k of ["pp", "gp", "sp", "cp"]) if (Number(t.coins?.[k]) > 0) upd[`system.currency.${k}`] = (cur[k] ?? 0) + Math.floor(Number(t.coins[k]));
  if (Object.keys(upd).length) await party.update(upd);
  const data = [];
  for (const i of t.items ?? []) data.push(await itemDataFor(i));
  if (data.length) await party.createEmbeddedDocuments("Item", data);
  await message.setFlag(SYS, "stashed", true);
  if (btn) btn.disabled = true;
  ui.notifications.info(`Treasure added to ${party.name}'s stash${coinText(t.coins) ? ` (${coinText(t.coins)})` : ""}.`);
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/** A Treasure button on monster sheets (GM). */
function onRenderSheet(app, html) {
  const actor = app.document;
  if (!game.user.isGM || actor?.type !== "npc") return;
  const root = html instanceof HTMLElement ? html : html?.[0] ?? app.element;
  const top = root?.querySelector(".arn-head-top");
  if (!top || top.querySelector(".arn-tr-roll")) return;
  const parts = parseTreasureCode(actor.system.details?.treasure ?? "");
  const a = document.createElement("a");
  a.className = "arn-shape-btn arn-tr-roll";
  a.dataset.tooltip = parts.length ? `Roll treasure: ${describeCode(parts)}` : "No treasure code (N)";
  a.innerHTML = '<i class="fa-solid fa-gem"></i>';
  a.addEventListener("click", ev => { ev.preventDefault(); treasureForActor(actor); });
  const name = top.querySelector(".arn-name");
  if (name) name.after(a); else top.prepend(a);
}

export function registerTreasure() {
  Hooks.on("renderArneyanActorSheet", onRenderSheet);
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (message.flags?.[SYS]?.kind !== "treasure") return;
    for (const b of html.querySelectorAll(".arn-tr-stash")) {
      b.hidden = !game.user.isGM;
      b.disabled = !!message.flags[SYS].stashed;
      b.addEventListener("click", ev => {
        ev.preventDefault();
        if (b.dataset.busy) return;
        b.dataset.busy = "1";
        stashTreasure(message, b).catch(err => { console.error("Arneyan |", err); ui.notifications.error(err.message); }).finally(() => delete b.dataset.busy);
      });
    }
  });
}

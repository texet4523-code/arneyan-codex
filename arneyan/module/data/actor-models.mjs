import { ARNEYAN } from "../config.mjs";
import { ModSet, collectRules, wordList, usesMax } from "../effects.mjs";
import { awarenessOf } from "../awareness.mjs";

const { NumberField, StringField, HTMLField, SchemaField, BooleanField, ArrayField } = foundry.data.fields;

const int = (initial = 0, opts = {}) => new NumberField({ required: true, nullable: false, integer: true, initial, ...opts });
const str = (initial = "") => new StringField({ required: true, blank: true, initial });

function abilitiesSchema() {
  const out = {};
  for (const k of Object.keys(ARNEYAN.abilities)) {
    out[k] = new SchemaField({ value: int(10, { min: 0, max: 30 }) });
  }
  return new SchemaField(out);
}

/** Prepare ability modifiers on any actor. */
function prepareAbilities(system) {
  for (const a of Object.values(system.abilities)) a.mod = ARNEYAN.abilityMod(a.value);
}

/** The class level a feature counts by: its class (or its kit's class), else the character's level. */
export function classLevelFor(item, classes, actor, level) {
  const name = String(item?.system?.className ?? "").toLowerCase();
  if (!name) return level;
  const named = n => classes.find(c => c.name.toLowerCase() === n || c.name.toLowerCase().startsWith(`${n} `));
  const kit = (actor.items ?? []).find?.(i => i.type === "kit" && i.name.toLowerCase() === name);
  const cls = named(name) ?? (kit?.system?.className ? named(String(kit.system.className).toLowerCase()) : null);
  return cls?.system?.levels ?? level;
}

/** What a uses formula can read: attribute modifiers (@dex.mod), @level, @half and @casting.mod. */
function usesBase(s, classes) {
  const ab = Object.fromEntries(Object.entries(s.abilities ?? {}).map(([k, v]) => [k, { value: v.total ?? v.value, mod: v.mod ?? ARNEYAN.abilityMod(v.total ?? v.value) }]));
  // "Your casting-stat modifier" (Blood Magic): the best among the casting classes.
  const casting = classes.filter(c => c.system.castingAbility && ab[c.system.castingAbility]).map(c => ab[c.system.castingAbility].mod);
  const level = s.level ?? Math.max(1, classes.reduce((t, c) => t + (c.system.levels || 0), 0));
  return { ...ab, abilities: ab, level, half: ARNEYAN.halfLevel(level), casting: { mod: casting.length ? Math.max(...casting) : 0 } };
}

/** The rule key for extra uses of a feature: "uses.extra.wild-shape" for Wild Shape. */
export const usesExtraKey = name => `uses.extra.${String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

/** Extra uses of a feature other features give (0 without any). */
function usesExtra(mods, name) {
  try { return Math.max(0, Math.floor(mods?.sum?.(usesExtraKey(name)) ?? 0)); } catch { return 0; }
}

/** An item's uses from its formula on this character as it is now (a feature added mid-game starts full), or null. */
export function formulaUsesFor(actor, item) {
  try {
    const f = item?.system?.uses?.formula;
    if (!f || actor?.type !== "character") return null;
    const classes = (actor.items ?? []).filter(i => i.type === "class");
    const base = usesBase(actor.system, classes);
    const max = usesMax(f, { ...base, cl: classLevelFor(item, classes, actor, base.level) }, item.system.uses.max ?? 0);
    return max > 0 ? max + usesExtra(actor.system?.mods, item.name) : max;
  } catch {
    return null;
  }
}

/** Set uses.max on every item with a uses formula, from the character's numbers. Never throws. */
function prepareFormulaUses(actor, s, classes) {
  try {
    const base = usesBase(s, classes);
    for (const i of actor.items ?? []) {
      const u = i.system?.uses;
      const extra = usesExtra(s.mods, i.name);
      if (!u?.formula && !extra) continue;
      try {
        if (u.formula) u.max = usesMax(u.formula, { ...base, cl: classLevelFor(i, classes, actor, s.level) }, u.max);
        // Extra uses another feature gives (Voice of the Grove: one more Wild Shape a day).
        if (extra && u.max > 0) u.max += extra;
        if (u.value > u.max) u.value = u.max;
      } catch (err) { console.warn(`Arneyan | uses formula on ${i.name}`, err); }
    }
  } catch (err) { console.warn("Arneyan | uses formulas", err); }
}

/* -------------------------------------------- */
/*  Player character                            */
/* -------------------------------------------- */

export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      abilities: abilitiesSchema(),
      luck: new SchemaField({
        value: int(10, { min: 0, max: 20 }),
        start: int(10, { min: 0, max: 20 }),
        max: int(20, { min: 0 })
      }),
      attributes: new SchemaField({
        hp: new SchemaField({ value: int(1), max: int(1, { min: 0 }), temp: int(0, { min: 0 }) }),
        ac: new SchemaField({ bonus: int(0), override: new NumberField({ required: false, nullable: true, integer: true, initial: null }) }),
        speed: int(30, { min: 0 }),
        bthBonus: int(0),
        xp: int(0, { min: 0 }),
        exhaustion: int(0, { min: 0, max: 6 }),
        /** Below 0 HP but stabilised (an ally's Wisdom check, Last Chance, First Aid): no longer bleeding. */
        stable: new BooleanField({ initial: false })
      }),
      /** Nightly HP from a safe haven, rolled once on checking in (0 when not in one). */
      rest: new SchemaField({ haven: int(0, { min: 0 }) }),
      /** Extra roll terms that class features and Active Effects can add to. */
      bonuses: new SchemaField({ attack: str(), damage: str(), spellDamage: str(), cantripDamage: str() }),
      saves: new SchemaField({
        fort: new SchemaField({ bonus: int(0) }),
        ref: new SchemaField({ bonus: int(0) }),
        will: new SchemaField({ bonus: int(0) })
      }),
      spellSlots: new SchemaField(Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [`l${i}`, new SchemaField({ value: int(0, { min: 0 }), max: int(0, { min: 0 }) })])
      )),
      currency: new SchemaField({ pp: int(0, { min: 0 }), gp: int(0, { min: 0 }), sp: int(0, { min: 0 }), cp: int(0, { min: 0 }) }),
      /** Extra Skill (NWP) slots the GM allowed ("Add it anyway"), on top of the level's. */
      nwpBonus: int(0, { min: 0 }),
      details: new SchemaField({
        alignment: str(),
        deity: str(),
        size: new StringField({ required: true, initial: "medium", choices: () => ARNEYAN.sizes }),
        age: str(),
        languages: str(),
        senses: str(),
        resistances: str(),
        immunities: str(),
        vulnerabilities: str(),
        biography: new HTMLField({ required: true, blank: true }),
        backgroundStory: new HTMLField({ required: true, blank: true })
      })
    };
  }

  prepareDerivedData() {
    const s = this;
    const actor = this.parent;

    // Classes and level come first: rules can scale with them.
    const classes = actor.items.filter(i => i.type === "class");
    s.classes = classes;
    s.level = Math.max(1, classes.reduce((t, c) => t + (c.system.levels || 0), 0));
    const half = ARNEYAN.halfLevel(s.level);

    // Gather every rule from feats, features, gear, effects, conditions and exhaustion.
    prepareAbilities(s);
    const base = { level: s.level, half, abilities: Object.fromEntries(Object.entries(s.abilities).map(([k, v]) => [k, { mod: v.mod, value: v.value }])) };
    const sheetRules = [
      { key: "attack", value: s.bonuses.attack, label: "Sheet bonus" },
      { key: "damage", value: s.bonuses.damage, label: "Sheet bonus" },
      { key: "spell.damage", value: s.bonuses.spellDamage, label: "Sheet bonus" },
      { key: "cantrip.damage", value: s.bonuses.cantripDamage, label: "Sheet bonus" },
      ...wordList(s.details.resistances).map(v => ({ key: "resist", value: v, label: "Sheet" })),
      ...wordList(s.details.immunities).map(v => ({ key: "immune", value: v, label: "Sheet" })),
      ...wordList(s.details.vulnerabilities).map(v => ({ key: "vuln", value: v, label: "Sheet" }))
    ].filter(r => String(r.value ?? "").trim()).map(r => ({ ...r, when: "", data: base }));
    const mods = new ModSet([...sheetRules, ...collectRules(actor, base)]);
    Object.defineProperty(s, "mods", { value: mods, configurable: true, enumerable: false, writable: true });

    // Attribute scores after rules (the stored score stays as typed).
    for (const [k, a] of Object.entries(s.abilities)) {
      a.base = a.value;
      a.total = Math.clamp(a.value + mods.sum(`ability.${k}`), 0, 30);
      a.mod = ARNEYAN.abilityMod(a.total);
      a.parts = [{ label: "Score", value: a.base }, ...mods.parts(`ability.${k}`)];
    }

    // BtH and XP rate.
    s.bthBase = Math.max(0, ...classes.map(c => ARNEYAN.bth(c.system.bthProgression, c.system.levels)));
    s.bth = s.bthBase + s.attributes.bthBonus;
    const rates = classes.map(c => c.system.xpRate || 10);
    s.xpRate = (rates.length ? Math.max(...rates) : 10) + Math.max(0, classes.length - 1) * 2;
    s.classLabel = classes.map(c => `${c.name} ${c.system.levels}`).join(" / ");

    // Uses worked out from a formula (Flèche: Dexterity modifier a day, minimum 1; Turn Undead: 3 + Wisdom).
    prepareFormulaUses(actor, s, classes);

    // Saves: attribute modifier + half character level (minimum 1) + bonuses.
    for (const [k, cfg] of Object.entries(ARNEYAN.saves)) {
      const sv = s.saves[k];
      sv.label = cfg.label;
      sv.ability = cfg.ability;
      sv.parts = [
        { label: ARNEYAN.abilityAbbr[cfg.ability], value: s.abilities[cfg.ability].mod },
        { label: "Half level", value: half },
        { label: "Sheet bonus", value: sv.bonus },
        ...mods.parts("save", `save.${k}`)
      ];
      sv.value = sv.parts.reduce((t, p) => t + p.value, 0);
      sv.autoFail = mods.has(`fail.save.${k}`);
    }

    // Armour Class: 10 + armour + shield + Dex (capped by armour category) + bonuses.
    const worn = actor.items.filter(i => i.type === "armour" && i.system.equipped);
    const body = worn.filter(i => i.system.category !== "shield").sort((a, b) => b.system.ac - a.system.ac)[0];
    const shields = worn.filter(i => i.system.category === "shield");
    const dex = s.abilities.dex.mod;
    let dexToAc = dex;
    if (body?.system.category === "medium") dexToAc = Math.min(dex, 2);
    else if (body?.system.category === "heavy") dexToAc = Math.min(dex, 0);
    let acBase = body ? 10 : Math.max(10, mods.best("ac.base") ?? 10);
    let acBaseLabel = acBase > 10 ? `Base (${mods.numbers.get("ac.base").find(e => e.value === acBase).label})` : "Base";
    // An AC that is the table value with no Dexterity, while wearing no armour or shield (the Monk's: "Your AC is the
    // table value; Dexterity does not add"; "Armour or a shield replaces the monk's table AC"). Another base AC (Mage
    // Armour) still wins when it gives more.
    const unarmoured = body || shields.length ? null : mods.best("ac.unarmoured");
    let dexLabel = `Dex${dexToAc !== dex ? " (capped)" : ""}`;
    if (unarmoured !== null && (acBase <= 10 || unarmoured > acBase + dexToAc)) {
      acBaseLabel = `Base (${mods.numbers.get("ac.unarmoured").find(e => e.value === unarmoured).label})`;
      acBase = unarmoured;
      dexToAc = 0;
      dexLabel = "Dex (not added)";
    }
    const acParts = [
      { label: acBaseLabel, value: acBase },
      ...(body ? [{ label: body.name, value: body.system.ac + body.system.magic }] : []),
      { label: dexLabel, value: dexToAc },
      ...shields.map(i => ({ label: i.name, value: i.system.ac + i.system.magic })),
      { label: "Sheet bonus", value: s.attributes.ac.bonus },
      ...mods.parts("ac")
    ];
    s.attributes.ac.armour = body?.name ?? "";
    s.attributes.ac.parts = acParts;
    s.attributes.ac.value = s.attributes.ac.override ?? acParts.reduce((t, p) => t + p.value, 0);
    s.acTotal = s.attributes.ac.value;

    // Initiative.
    s.attributes.initParts = [{ label: "Dex", value: dex }, ...mods.parts("init")];
    s.attributes.init = s.attributes.initParts.reduce((t, p) => t + p.value, 0);
    // Passive awareness (books v0.10.10, K2).
    s.attributes.awareness = awarenessOf(s, mods, actor?.items ?? []);

    // Hit points: the stored maximum plus bonuses, then any halving (Debilitated).
    const hp = s.attributes.hp;
    hp.base = this.parent?._source?.system?.attributes?.hp?.max ?? hp.max;
    hp.parts = [{ label: "Levels", value: hp.base }, ...mods.parts("hp.max"), ...mods.parts("hp.level").map(p => ({ label: `${p.label} (x${s.level})`, value: p.value * s.level }))];
    const hpMult = mods.mult("hp.mult");
    hp.max = Math.max(1, Math.floor(hp.parts.reduce((t, p) => t + p.value, 0) * hpMult));
    hp.effectiveMax = hp.max;
    hp.halved = hpMult < 1;
    // Codex, Death & Dying: −10 HP minus the Constitution modifier (−20 from 11th level); a negative modifier counts as 0.
    s.attributes.deathAt = -(s.level >= 11 ? 20 : 10) - Math.max(0, s.abilities.con.mod);
    s.attributes.state = hp.value <= s.attributes.deathAt ? "dead" : hp.value < 0 ? (s.attributes.stable ? "stable" : "dying") : hp.value === 0 ? "stable" : "";

    // Spellcasting: each casting class keeps its own slots, DC and caster level.
    // DC = 10 + half class level (min 1) + casting modifier. Slots = the class's Spells Per Day
    // row, plus bonus slots from the casting stat (13+ one 1st, 16+ one 2nd, 18+ one 3rd, only
    // where the table gives that level; Sorcerers take a spell known instead), plus extras.
    s.casters = classes.filter(c => c.system.castingAbility && c.system.levels >= 1).map((c, ci) => {
      const lvl = Math.clamp(c.system.levels, 1, 24);
      const row = c.system.slotTable?.[lvl - 1] ?? [];
      const score = s.abilities[c.system.castingAbility].total;
      const mod = s.abilities[c.system.castingAbility].mod;
      const slots = Array.from({ length: 10 }, (_, n) => {
        const table = row[n] ?? 0;
        const bonus = (table > 0 && c.name !== "Sorcerer" && ((n === 1 && score >= 13) || (n === 2 && score >= 16) || (n === 3 && score >= 18))) ? 1 : 0;
        const fromRules = n > 0 && table > 0 ? mods.sum(`slots.${n}`) : 0;
        const total = n === 0 ? table : Math.max(0, table + bonus + fromRules + (c.system.extraSlots?.[n] ?? 0));
        const used = n === 0 ? 0 : Math.min(total, c.system.slotsUsed?.[n] ?? 0);
        return { level: n, table, bonus, total, used, left: total - used };
      });
      // One more slot of the highest level the table gives (Expanded Mind), for the first casting class only.
      const highest = ci === 0 ? mods.sum("slots.highest") : 0;
      const top = slots.findLast?.(x => x.level > 0 && x.table > 0) ?? [...slots].reverse().find(x => x.level > 0 && x.table > 0);
      if (highest && top) {
        top.total += highest;
        top.used = Math.min(top.total, c.system.slotsUsed?.[top.level] ?? 0);
        top.left = top.total - top.used;
      }
      const dcParts = [{ label: "Base", value: 10 }, { label: "Half class level", value: ARNEYAN.halfLevel(c.system.levels) }, { label: ARNEYAN.abilityAbbr[c.system.castingAbility], value: mod }, ...mods.parts("spell.dc")];
      return {
        id: c.id, name: c.name, ability: c.system.castingAbility, mod, classLevel: c.system.levels,
        dc: dcParts.reduce((t, p) => t + p.value, 0), dcParts, slots,
        cantrips: row[0] ?? 0
      };
    });
    s.spellDC = s.casters.length ? Math.max(...s.casters.map(c => c.dc)) : null;
    s.noCast = mods.has("no.cast");
    s.noAct = mods.has("no.act");
    s.exhaustionLabel = ARNEYAN.exhaustion[s.attributes.exhaustion] ?? "";
    s.attributes.exhaustionLabel = s.exhaustionLabel;

    // Class Save DC: 10 + half class level + key attribute of the first class.
    const first = classes[0];
    s.classDC = first ? 10 + ARNEYAN.halfLevel(first.system.levels) + s.abilities[first.system.keyAbility || "str"].mod + mods.sum("class.dc") : null;

    // NWP slots.
    s.nwp = {
      max: ARNEYAN.nwpSlots(s.level) + mods.sum("nwp") + (Number(s.nwpBonus) || 0),
      extra: Number(s.nwpBonus) || 0,
      used: actor.items.filter(i => i.type === "skill").reduce((t, i) => t + (i.system.tier === "master" ? 2 : i.system.tier === "knack" ? 0 : 1), 0)
    };

    // Inventory slots (Codex, Carrying): coins 100 a slot, bundles as the item says, and nothing for
    // what's inside a container whose contents don't count (a Bag of Holding). Over the limit: speed −10ft
    // and Disadvantage on Dexterity checks and attack rolls.
    const coins = Object.values(s.currency).reduce((t, v) => t + v, 0);
    const gearItems = actor.items.filter(i => ["weapon", "armour", "equipment"].includes(i.type));
    const holder = id => { const c = actor.items.get(id); return c?.system?.container?.holds ? c : null; };
    let itemSlots = 0;
    for (const i of gearItems) {
      // Every container it sits in (a pouch in a Bag of Holding) counts it; anything weightless above it makes it free.
      let free = false;
      const seen = new Set([i.id]);
      for (let c = i.system.inside ? holder(i.system.inside) : null; c && !seen.has(c.id); c = c.system.inside ? holder(c.system.inside) : null) {
        seen.add(c.id);
        c.system.contents = Math.round(((c.system.contents ?? 0) + i.system.totalSlots) * 100) / 100;
        if (c.system.container.weightless) free = true;
      }
      if (!free) itemSlots += i.system.totalSlots;
    }
    s.inventory = {
      max: ARNEYAN.inventorySlots(s.abilities.str.total) + mods.sum("inventory"),
      used: Math.round((itemSlots + Math.ceil(coins / 100)) * 100) / 100,
      coins: Math.ceil(coins / 100)
    };
    s.inventory.over = s.inventory.used > s.inventory.max;
    // Speed −10ft over the limit, and another −10ft for every full 5 slots over (1-4 over: −10, 5-9: −20...).
    s.inventory.overBy = s.inventory.over ? Math.round((s.inventory.used - s.inventory.max) * 100) / 100 : 0;
    s.inventory.speedPenalty = s.inventory.over ? 10 * (1 + Math.floor(s.inventory.overBy / 5)) : 0;
    if (s.inventory.over) {
      const label = "Over the inventory limit";
      mods.add({ key: "adv.check.dex", value: -1, label, when: "", data: base });
      mods.add({ key: "adv.attack", value: -1, label, when: "", data: base });
    }

    // Speed: base + bonuses, then halving or zero, then the inventory penalty (never below 0).
    // A base speed set by a feature (the Monk's Fast Movement: 35ft at 1st up to 60ft), used when higher; it's lost
    // while over the inventory limit.
    // Over the limit a Monk "moves at 30ft, reduced as normal", whatever the ancestry's speed.
    const fastRule = mods.best("speed.base");
    const fast = s.inventory.over ? null : fastRule;
    const fastFrom = fast !== null && fast > s.attributes.speed ? mods.numbers.get("speed.base").find(e => e.value === fast).label : "";
    const slowBase = fastRule !== null && s.inventory.over ? Math.max(s.attributes.speed, 30) : s.attributes.speed;
    const speedParts = [{ label: fastFrom ? `Base (${fastFrom})` : "Base", value: fastFrom ? fast : slowBase }, ...mods.parts("speed")];
    const speedMult = mods.mult("speed.mult");
    const beforePenalty = Math.floor(speedParts.reduce((t, p) => t + p.value, 0) * speedMult);
    if (s.inventory.over) speedParts.push({ label: `Over the inventory limit (${s.inventory.overBy} slots over)`, value: -s.inventory.speedPenalty });
    s.attributes.speedParts = speedParts;
    s.attributes.speedNow = Math.max(0, beforePenalty - s.inventory.speedPenalty);
    s.attributes.speedMult = speedMult;

    // Traits.
    s.traits = {
      resist: [...new Set(mods.traits.resist.map(t => t.value))],
      immune: [...new Set(mods.traits.immune.map(t => t.value))],
      vuln: [...new Set(mods.traits.vuln.map(t => t.value))],
      // The ancestry's own vision counts even if it was never copied onto the sheet (characters made earlier).
      senses: [...new Map([s.details.senses, ...actor.items.filter(i => i.type === "ancestry").map(i => i.system.vision), ...mods.traits.sense.map(t => t.value), ...(mods.best("speed.fly") ? [`Fly ${mods.best("speed.fly")}ft`] : [])]
        .filter(Boolean).map(v => [String(v).trim().toLowerCase(), String(v).trim()])).values()]
    };
    s.critRange = Math.clamp(mods.lowest("crit.range") ?? 20, 2, 20);
    s.dr = mods.sum("dr");
  }

  getRollData() {
    const ab = {};
    for (const [k, v] of Object.entries(this.abilities)) ab[k] = { value: v.total ?? v.value, mod: v.mod };
    return { ...ab, abilities: ab, level: this.level, half: ARNEYAN.halfLevel(this.level), bth: this.bth, luck: this.luck.value, cl: this.level };
  }
}

/* -------------------------------------------- */
/*  NPC and monster                             */
/* -------------------------------------------- */

export class NpcData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      abilities: abilitiesSchema(),
      level: int(1, { min: 0 }),
      hd: str("1d8"),
      attributes: new SchemaField({
        hp: new SchemaField({ value: int(5), max: int(5, { min: 0 }), temp: int(0, { min: 0 }) }),
        ac: int(10),
        speed: str("30ft"),
        attack: int(0),
        morale: int(0),
        /** The stat block's spell save DC; 0 works it out from Level and the best mental ability. */
        spellDC: int(0, { min: 0 })
      }),
      /** A stat block's "casts as an 11th-level cleric": that class's spell slots, and how many are spent. */
      spellcasting: new SchemaField({
        className: str(),
        level: int(0, { min: 0 }),
        slots: new ArrayField(int(0, { min: 0 })),
        used: new ArrayField(int(0, { min: 0 }))
      }),
      saves: new SchemaField({ fort: int(0), ref: int(0), will: int(0) }),
      details: new SchemaField({
        type: str(),
        size: new StringField({ required: true, initial: "medium", choices: () => ARNEYAN.sizes }),
        alignment: str(),
        xp: str(),
        numberAppearing: str(),
        resistances: str(),
        immunities: str(),
        vulnerabilities: str(),
        senses: str(),
        isSolo: new BooleanField({ initial: false }),
        /** The book's Level when it isn't a whole number ("¼", "½", "Mythic"); blank otherwise. */
        levelText: str(),
        page: int(0, { min: 0 }),
        description: new HTMLField({ required: true, blank: true }),
        treasure: new HTMLField({ required: true, blank: true })
      })
    };
  }

  prepareDerivedData() {
    const s = this;
    const actor = this.parent;
    prepareAbilities(s);
    const half = ARNEYAN.halfLevel(s.level);
    const base = { level: s.level, half, cl: s.level, abilities: Object.fromEntries(Object.entries(s.abilities).map(([k, v]) => [k, { mod: v.mod, value: v.value }])) };
    const mods = new ModSet([
      ...wordList(s.details.resistances).map(v => ({ key: "resist", value: v, label: "Stat block", when: "", data: base })),
      ...wordList(s.details.immunities).map(v => ({ key: "immune", value: v, label: "Stat block", when: "", data: base })),
      ...wordList(s.details.vulnerabilities).map(v => ({ key: "vuln", value: v, label: "Stat block", when: "", data: base })),
      ...collectRules(actor, base)
    ]);
    Object.defineProperty(s, "mods", { value: mods, configurable: true, enumerable: false, writable: true });
    for (const [k, a] of Object.entries(s.abilities)) {
      a.base = a.value;
      a.total = Math.clamp(a.value + mods.sum(`ability.${k}`), 0, 30);
      a.mod = ARNEYAN.abilityMod(a.total);
    }
    s.attributes.initParts = [{ label: "Dex", value: s.abilities.dex.mod }, ...mods.parts("init")];
    s.attributes.init = s.attributes.initParts.reduce((t, p) => t + p.value, 0);
    s.attributes.awareness = awarenessOf(s, mods, actor?.items ?? []);
    s.bth = s.attributes.attack;
    s.acParts = [{ label: "Stat block", value: s.attributes.ac }, ...mods.parts("ac")];
    s.acTotal = s.acParts.reduce((t, p) => t + p.value, 0);
    s.saveList = Object.entries(ARNEYAN.saves).map(([k, cfg]) => {
      const parts = [{ label: "Stat block", value: s.saves[k] }, ...mods.parts("save", `save.${k}`)];
      return { key: k, label: cfg.label, value: s.saves[k], total: parts.reduce((t, p) => t + p.value, 0), parts, autoFail: mods.has(`fail.save.${k}`) };
    });
    const hp = s.attributes.hp;
    hp.base = this.parent?._source?.system?.attributes?.hp?.max ?? hp.max;
    hp.max = Math.max(1, Math.floor((hp.base + mods.sum("hp.max") + mods.sum("hp.level") * s.level) * mods.mult("hp.mult")));
    hp.effectiveMax = hp.max;
    s.attributes.state = hp.value <= 0 ? "dead" : "";
    s.attributes.speedMult = mods.mult("speed.mult");
    s.noCast = mods.has("no.cast");
    s.noAct = mods.has("no.act");
    s.spellDC = s.attributes.spellDC ? s.attributes.spellDC + mods.sum("spell.dc") : 10 + half + Math.max(s.abilities.int.mod, s.abilities.wis.mod, s.abilities.cha.mod) + mods.sum("spell.dc");
    // Spell slots for a monster that casts as a class.
    const sc = s.spellcasting;
    s.casters = sc?.level > 0 ? [{
      id: "npc", name: `Casts as a ${sc.className || "caster"} of level ${sc.level}`, ability: "", mod: 0, classLevel: sc.level,
      dc: s.spellDC, dcParts: [{ label: "Stat block", value: s.spellDC }], cantrips: sc.slots[0] ?? 0, npc: true,
      slots: Array.from({ length: 10 }, (_, n) => {
        const total = n === 0 ? 0 : (sc.slots[n] ?? 0);
        const used = Math.min(total, sc.used[n] ?? 0);
        return { total, used, left: total - used };
      })
    }] : [];
    s.traits = {
      resist: [...new Set(mods.traits.resist.map(t => t.value))],
      immune: [...new Set(mods.traits.immune.map(t => t.value))],
      vuln: [...new Set(mods.traits.vuln.map(t => t.value))],
      senses: [s.details.senses, ...mods.traits.sense.map(t => t.value), ...(mods.best("speed.fly") ? [`Fly ${mods.best("speed.fly")}ft`] : [])].filter(Boolean)
    };
    s.critRange = Math.clamp(mods.lowest("crit.range") ?? 20, 2, 20);
    s.dr = mods.sum("dr");
  }

  getRollData() {
    const ab = {};
    for (const [k, v] of Object.entries(this.abilities)) ab[k] = { value: v.total ?? v.value, mod: v.mod };
    return { ...ab, abilities: ab, level: this.level, half: ARNEYAN.halfLevel(this.level), bth: this.bth, cl: this.level };
  }
}

/* -------------------------------------------- */
/*  Party (members, shared stash, party token)  */
/* -------------------------------------------- */

export class PartyData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      members: new ArrayField(new StringField({ required: true, blank: false })),
      currency: new SchemaField({ pp: int(0, { min: 0 }), gp: int(0, { min: 0 }), sp: int(0, { min: 0 }), cp: int(0, { min: 0 }) }),
      details: new SchemaField({ notes: new HTMLField({ required: true, blank: true }) })
    };
  }

  prepareDerivedData() {
    const items = this.parent.items.filter(i => ["weapon", "armour", "equipment"].includes(i.type));
    const coins = Object.values(this.currency).reduce((t, v) => t + v, 0);
    this.stashSlots = Math.round((items.reduce((t, i) => t + (i.system.totalSlots ?? 0), 0) + Math.ceil(coins / 100)) * 100) / 100;
  }

  getRollData() {
    return {};
  }
}

/* -------------------------------------------- */
/*  Storage (a bank vault, a chest back home)   */
/* -------------------------------------------- */

/** Slots a storage place's gear and coins take: contents of a weightless container (Bag of Holding) are free. */
export function storageSlots(items, currency) {
  const byId = new Map(items.map(i => [i.id, i]));
  const free = i => {
    for (let c = byId.get(i.system?.inside), n = 0; c && n < 8; c = byId.get(c.system?.inside), n++) if (c.system?.container?.weightless) return true;
    return false;
  };
  const gear = items.filter(i => !free(i)).reduce((t, i) => t + (i.system?.totalSlots ?? 0), 0);
  const coins = Object.values(currency ?? {}).reduce((t, v) => t + (Number(v) || 0), 0);
  return Math.round((gear + Math.ceil(coins / 100)) * 100) / 100;
}

export class StorageData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: new StringField({ required: true, blank: false, initial: "chest", choices: () => Object.keys(ARNEYAN.storageKinds) }),
      location: str(),
      // The GM's switch: the party is at this place and can put things in and take them out.
      here: new BooleanField({ required: true, initial: false }),
      capacity: int(0, { min: 0 }),
      currency: new SchemaField({ pp: int(0, { min: 0 }), gp: int(0, { min: 0 }), sp: int(0, { min: 0 }), cp: int(0, { min: 0 }) }),
      ledger: new ArrayField(new SchemaField({
        when: str(), worldTime: new NumberField({ required: true, nullable: false, initial: 0 }),
        who: str(), text: str()
      })),
      details: new SchemaField({ notes: new HTMLField({ required: true, blank: true }) })
    };
  }

  prepareDerivedData() {
    const items = this.parent.items.filter(i => ["weapon", "armour", "equipment"].includes(i.type));
    this.usedSlots = storageSlots(items, this.currency);
    this.full = this.capacity > 0 && this.usedSlots >= this.capacity;
    this.over = this.capacity > 0 && this.usedSlots > this.capacity;
  }

  getRollData() {
    return {};
  }
}

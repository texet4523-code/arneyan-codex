import { ARNEYAN } from "./config.mjs";
import { openPdf } from "./rolls.mjs";
import { breakdown, toggleCondition, statusesOf, endConcentration, scopeText, weaponPickMax, featureLevel } from "./effects.mjs";
import { ArneyanBrowser } from "./browser.mjs";
import { startingWealth, canRunStartingWealth } from "./starting.mjs";
import { moveDroppedItem, blockedCopy, giveItemTo } from "./party.mjs";
import { promptTransform, chooseForm, revertTransform } from "./transform.mjs";
import { openForge, toggleTrait, traitList, withMode } from "./forge.mjs";
import { ammoFor, toggleLight, toggleMode, writeScroll, luckForDeed, castFromItem, blankScrollLevel, spellByName, lightInfo } from "./gear.mjs";
import { bestiarySource, refreshFromBestiary } from "./refresh.mjs";
import { compendiumSourceOf } from "./migrate.mjs";
import { combatSheetContext, combatSheetActions, isLight } from "./combat.mjs";
import { combatById } from "./fight.mjs";
import { itemFacts, bindItemWindows, itemToChat } from "./expand.mjs";
import { worldSheetContext, WORLD_SHEET_ACTIONS, dropOnCompanions, timeLeftLabel } from "./world.mjs";

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;
const { ActorSheetV2, ItemSheetV2 } = foundry.applications.sheets;
const TextEditorImpl = () => foundry.applications.ux.TextEditor.implementation;
const signed = n => (n >= 0 ? `+${n}` : `${n}`);
const SYS = "arneyan";

/* -------------------------------------------- */
/*  Pop-out rich text editor                    */
/* -------------------------------------------- */

/**
 * Edits one HTML field of a document in its own window. Used for biographies and descriptions,
 * so typing always happens in a full-size editor that nothing on the sheet can squash or hide.
 */
/** Trait words for display: "condition:charmed" reads "Charmed", "non-magical 10" reads "non-magical weapons 10". */
function prettyTraits(t) {
  if (!t) return t;
  const word = v => {
    const s = String(v);
    if (s.startsWith("condition:")) return ARNEYAN.conditions[s.slice(10)]?.name ?? s.slice(10);
    const [w, ...rest] = s.split(/\s+/);
    const names = { "weapons": "weapons", "non-magical": "non-magical weapons", "non-silvered": "non-magical, non-silvered weapons", "non-adamantine": "non-magical, non-adamantine weapons" };
    return names[w] ? [names[w], ...rest].join(" ") : s;
  };
  return { ...t, resist: t.resist.map(word), immune: t.immune.map(word), vuln: t.vuln.map(word) };
}

export class ArneyanTextEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(document, field, label, options = {}) {
    super({ id: `arneyan-editor-${document.uuid.replace(/\W/g, "-")}-${field.replace(/\W/g, "-")}`, ...options });
    this.document = document;
    this.field = field;
    this.label = label;
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["arneyan", "arn-editor-app"],
    position: { width: 640, height: 560 },
    window: { resizable: true, icon: "fa-solid fa-pen-nib" },
    form: { handler: ArneyanTextEditor.#onSubmit, submitOnChange: false, closeOnSubmit: true }
  };

  static PARTS = { form: { template: "systems/arneyan/templates/apps/text-editor.hbs" } };

  get title() {
    return `${this.document.name}: ${this.label}`;
  }

  async _prepareContext() {
    return { field: this.field, value: foundry.utils.getProperty(this.document._source, this.field) ?? "" };
  }

  static async #onSubmit(event, form, formData) {
    const value = formData.object[this.field] ?? form.querySelector("prose-mirror")?.value ?? "";
    await this.document.update({ [this.field]: value });
  }
}

function openEditor(document, field, label) {
  return new ArneyanTextEditor(document, field, label).render(true);
}

/* -------------------------------------------- */
/*  Actor sheet (characters and NPCs)           */
/* -------------------------------------------- */

/** The stacks a weapon can fire from, for the picker on the Actions tab ("" = the first that fits). */
function ammoChoices(actor, w) {
  const stacks = actor.items.filter(i => i.type === "equipment" && i.system.ammoType === w.system.ammoType && i.system.quantity > 0);
  if (!stacks.length) return null;
  const first = ammoFor(actor, { system: { ammoType: w.system.ammoType, ammoId: "" } });
  return { "": `Auto: ${first?.name ?? ""} × ${first?.system.quantity ?? 0}`, ...Object.fromEntries(stacks.map(i => [i.id, `${i.name} × ${i.system.quantity}`])) };
}

/** Why a container can't take an item, or "" if it can (capacity; one extradimensional space inside another ruins both). */
function canHold(container, item, actor) {
  const c = container.system.container;
  if (!c?.holds) return `${container.name} isn't a container.`;
  const seen = new Set();
  for (let x = container; x && !seen.has(x.id); x = x.system?.inside ? actor.items.get(x.system.inside) : null) {
    seen.add(x.id);
    if (x.id === item.id) return `${item.name} can't go inside itself.`;
    if (x.id !== container.id && x.system.container?.extradimensional && item.system.container?.extradimensional) return `Putting one extradimensional container inside another ruins both (Catalogue). ${item.name} stays out.`;
  }
  if (c.extradimensional && item.system.container?.extradimensional) return `Putting one extradimensional container inside another ruins both and scatters what's in them (Catalogue). ${item.name} stays out.`;
  // What's in it now (nested contents included), less this item if it's already inside, plus this item and what it holds.
  const already = item.system.inside === container.id ? (item.system.totalSlots ?? 0) + (item.system.contents ?? 0) : 0;
  const used = (container.system.contents ?? 0) - already;
  const adding = (item.system.totalSlots ?? 0) + (item.system.contents ?? 0);
  if (c.capacity > 0 && used + adding > c.capacity) return `${container.name} holds ${c.capacity} slots; ${item.name} won't fit (${used} used).`;
  return "";
}

export class ArneyanActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["arneyan", "sheet", "actor"],
    position: { width: 880, height: 900 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollAbility: ArneyanActorSheet.#rollAbility,
      rollSave: ArneyanActorSheet.#rollSave,
      rollLuck: ArneyanActorSheet.#rollLuck,
      rollInit: ArneyanActorSheet.#rollInit,
      rollUntrained: ArneyanActorSheet.#rollUntrained,
      itemUse: ArneyanActorSheet.#itemUse,
      itemDamage: ArneyanActorSheet.#itemDamage,
      itemEdit: ArneyanActorSheet.#itemEdit,
      itemChoose: ArneyanActorSheet.#itemChoose,
      classInfo: ArneyanActorSheet.#classInfo,
      itemChooseWeapon: ArneyanActorSheet.#itemChooseWeapon,
      itemDelete: ArneyanActorSheet.#itemDelete,
      itemCreate: ArneyanActorSheet.#itemCreate,
      itemEquip: ArneyanActorSheet.#itemEquip,
      recharge: ArneyanActorSheet.#recharge,
      castItemSpell: ArneyanActorSheet.#castItemSpell,
      giveItem: ArneyanActorSheet.#giveItem,
      itemMode: ArneyanActorSheet.#itemMode,
      itemToggle: ArneyanActorSheet.#itemToggle,
      itemExpand: ArneyanActorSheet.#itemExpand,
      itemChat: ArneyanActorSheet.#itemChat,
      openPage: ArneyanActorSheet.#openPage,
      rest: ArneyanActorSheet.#rest,
      abilityScores: ArneyanActorSheet.#abilityScores,
      rollHitDie: ArneyanActorSheet.#rollHitDie,
      changeTab: ArneyanActorSheet.#changeTab,
      levelUp: ArneyanActorSheet.#levelUp,
      levelDown: ArneyanActorSheet.#levelDown,
      browse: ArneyanActorSheet.#browse,
      startingGold: ArneyanActorSheet.#startingGold,
      levelUpReady: ArneyanActorSheet.#levelUpReady,
      toggleSlot: ArneyanActorSheet.#toggleSlot,
      castSpell: ArneyanActorSheet.#castSpell,
      toggleEdit: ArneyanActorSheet.#toggleEdit,
      setExhaustion: ArneyanActorSheet.#setExhaustion,
      toggleCondition: ArneyanActorSheet.#toggleCondition,
      effectToggle: ArneyanActorSheet.#effectToggle,
      effectDelete: ArneyanActorSheet.#effectDelete,
      endConcentration: ArneyanActorSheet.#endConcentration,
      editText: ArneyanActorSheet.#editText,
      hpStep: ArneyanActorSheet.#hpStep,
      changeShape: ArneyanActorSheet.#changeShape,
      stabilise: ArneyanActorSheet.#stabilise,
      toggleLight: ArneyanActorSheet.#toggleLight,
      toggleIdentified: ArneyanActorSheet.#toggleIdentified,
      takeOut: ArneyanActorSheet.#takeOut,
      writeScroll: ArneyanActorSheet.#writeScroll,
      luckDeed: ArneyanActorSheet.#luckDeed,
      npcNewDay: ArneyanActorSheet.#npcNewDay,
      refreshMonster: ArneyanActorSheet.#refreshMonster,
      importSheet: ArneyanActorSheet.#importSheet,
      lastChance: ArneyanActorSheet.#lastChance,
      revertShape: ArneyanActorSheet.#revertShape,
      ...combatSheetActions,
      ...WORLD_SHEET_ACTIONS
    }
  };

  static PARTS = {
    sheet: { template: "systems/arneyan/templates/actor/actor-sheet.hbs", scrollable: [".arn-body", ".arn-side"] }
  };

  _activeTab = "actions";
  _expanded = new Set();
  _editMode = null;

  get editMode() {
    if (this._editMode === null) {
      // New characters open ready to edit; finished ones open in play mode.
      this._editMode = this.document.type === "character" ? !this.document.items.some(i => i.type === "class") : false;
    }
    return this._editMode && this.isEditable;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;
    const mods = system.mods;
    const isCharacter = actor.type === "character";
    const sort = (a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name);
    const byType = t => actor.items.filter(i => i.type === t).sort(sort);
    const enrich = html => TextEditorImpl().enrichHTML(html ?? "", { rollData: actor.getRollData(), relativeTo: actor, secrets: actor.isOwner });

    // Rows with an expandable description.
    const innateLeft = i => {
      const per = String(i.getFlag?.("arneyan", "frequency") ?? "").match(/^(\d+)\/day/i);
      return per ? `${Math.max(0, Number(per[1]) - (i.getFlag("arneyan", "used") ?? 0))} of ${per[1]} left today` : "";
    };
    const open = i => this._expanded.has(i.id);
    const row = async i => ({ item: i, id: i.id, usesLabel: i.type === "spell" ? innateLeft(i) : "", expanded: open(i), facts: open(i) ? itemFacts(i) : [], desc: open(i) ? await enrich(i.system.description) : "" });
    const rows = async list => Promise.all(list.map(row));

    // Weapons with their attack bonus and damage worked out.
    const weapons = await Promise.all(byType("weapon").map(async w => ({
      ...(await row(w)), toHit: signed(actor.attackBonus(w)), damage: actor.damageLabel(w),
      ammoNeeded: w.system.ammoType || "", ammoName: ammoFor(actor, w)?.name ?? "", ammoLeft: ammoFor(actor, w)?.system.quantity ?? 0,
      ammoChoices: w.system.ammoType ? ammoChoices(actor, w) : null,
      toHitTip: breakdown(actor.attackParts(w)),
      offhand: isLight(w),
      damageType: ARNEYAN.damageTypes[w.system.damageType] ?? ""
    })));

    // Gear: what's packed inside a container is listed under it; a weightless container's contents cost no slots.
    const holderOf = i => {
      const c = i.system.inside ? actor.items.get(i.system.inside) : null;
      return c?.system?.container?.holds && c.id !== i.id ? c : null;
    };
    const gearDesc = new Map();
    for (const id of this._expanded) {
      const it = actor.items.get(id);
      if (it && ["weapon", "armour", "equipment"].includes(it.type)) gearDesc.set(id, await enrich(it.system.description));
    }
    const gearRow = (i, depth = 0) => {
      const s = i.system;
      const holds = i.type === "equipment" && !!s.container?.holds;
      const parent = holderOf(i);
      const light = s.light ?? {};
      const burn = light.bright || light.dim ? lightInfo(light) : null;
      return {
        id: i.id, item: i, name: i.name, img: i.img, system: s, depth,
        expanded: gearDesc.has(i.id), facts: gearDesc.has(i.id) ? itemFacts(i) : [], desc: gearDesc.get(i.id) ?? "",
        useTip: s.scroll?.spell ? "Read the scroll" : s.charges?.max ? "Use a charge" : s.consumable?.use ? "Use it (one is used up)" : "Show in chat",
        // Anything can be worn or held (a ring, a torch, a shield); containers are worn too but show as their own block.
        equip: !holds, dim: i.type !== "equipment" && !s.equipped && !parent,
        usable: i.type === "equipment" && !holds && !!(s.consumable?.use || s.charges?.max || s.scroll?.spell || light.bright || light.dim || /^scroll\b/i.test(i._source?.name ?? "")),
        useLabel: light.bright || light.dim ? (light.lit ? "Put out" : "Light") : s.scroll?.spell ? "Read" : s.charges?.max ? "Use" : blankScrollLevel(i) !== null ? "Inscribe" : "Use",
        recharge: !!s.charges?.max,
        unidentified: s.identified === false && game.user.isGM,
        charges: s.charges?.max ? `${s.charges.value}/${s.charges.max}` : "",
        ammoLabel: s.ammoType && i.type === "equipment" ? `${s.ammoType}s` : "",
        hasLight: !!(light.bright || light.dim), lit: !!light.lit,
        litTip: burn?.tip ?? "", litLeft: burn?.label ?? "", litLow: !!burn?.low,
        // Not lit but part burned (a lantern put out at 3 h), or burned out: shown beside it.
        lightNote: burn && !burn.lit && burn.timed && burn.used ? burn.label : "", lightOut: !!burn?.out,
        holds, capacity: s.container?.capacity ?? 0, contents: s.contents ?? 0, weightless: !!s.container?.weightless,
        overCap: holds && s.container.capacity > 0 && (s.contents ?? 0) > s.container.capacity,
        inside: !!parent, insideName: parent?.name ?? "", freeSlots: !!parent?.system.container.weightless,
        children: holds && depth < 8 ? actor.items.filter(x => holderOf(x)?.id === i.id).sort(sort).map(x => gearRow(x, depth + 1)) : []
      };
    };
    // On your person: what's worn or in hand, then weapons, armour, equipment and consumables you carry loose.
    // Each container (a backpack, a Bag of Holding) is its own block with what's stowed in it.
    const consumableLike = i => i.type === "equipment" && !!(i.system.consumable?.use || i.system.charges?.max || i.system.scroll?.spell || i.system.ammoType || /^scroll\b/i.test(i._source?.name ?? ""));
    const gear = { equipped: [], weapons: [], armour: [], equipment: [], consumables: [], containers: [] };
    for (const i of actor.items.filter(i => ["weapon", "armour", "equipment"].includes(i.type) && !holderOf(i)).sort(sort)) {
      const r = gearRow(i);
      if (r.holds) gear.containers.push(r);
      else if (i.system.equipped) gear.equipped.push(r);
      else if (i.type === "weapon") gear.weapons.push(r);
      else if (i.type === "armour") gear.armour.push(r);
      else if (consumableLike(i)) gear.consumables.push(r);
      else gear.equipment.push(r);
    }

    // Abilities, grouped by where they came from.
    const abilityGroups = {};
    for (const a of byType("ability").filter(i => i.system.kind !== "action").sort((x, y) => (x.system.level ?? 1) - (y.system.level ?? 1) || sort(x, y))) {
      const g = a.system.className || (a.system.kind === "monster" ? "Special Abilities" : "Other Abilities");
      (abilityGroups[g] ??= []).push(a);
    }
    const groups = [];
    for (const [name, list] of Object.entries(abilityGroups)) groups.push({ name, rows: await rows(list) });
    const actionable = i => i.system.kind === "action" || i.system.uses?.max > 0 || i.system.save || i.system.damage || i.system.toggle || i.system.applies?.length || i.system.activities?.length;
    const combatAbilities = await rows([...byType("ability"), ...byType("feat")].filter(actionable));

    // Spells: one section per casting class, PF2e style, with slot pips per level.
    const spells = byType("spell");
    const spellSections = [];
    const placed = new Set();
    {
      for (const c of system.casters ?? []) {
        // A monster's class spells use its slots; innate spells (with a "3/day") don't.
        const mine = c.npc ? spells.filter(s => !s.getFlag?.("arneyan", "frequency")) : spells.filter(s => s.caster?.id === c.id);
        mine.forEach(s => placed.add(s.id));
        const levels = [];
        for (let n = 0; n <= 9; n++) {
          const slot = c.slots[n];
          const list = mine.filter(s => s.system.level === n);
          if (!list.length && !(slot.total > 0)) continue;
          levels.push({
            level: n, label: n === 0 ? "Cantrips" : `${ARNEYAN.spellLevels[n]} Level`,
            pips: n === 0 ? [] : Array.from({ length: slot.total }, (_, i) => ({ index: i, used: i >= slot.left })),
            left: slot.left, total: slot.total, isCantrip: n === 0,
            cantripsKnown: n === 0 && !c.npc ? `${list.length} / ${c.cantrips} known` : "",
            spells: await rows(list)
          });
        }
        spellSections.push({ ...c, levels, abilityLabel: c.npc ? "" : ARNEYAN.abilities[c.ability], modLabel: c.npc ? "" : signed(c.mod), dcTip: breakdown(c.dcParts) });
      }
    }
    const loose = spells.filter(s => !placed.has(s.id));
    if (loose.length) {
      const levels = [];
      for (let n = 0; n <= 9; n++) {
        const list = loose.filter(s => s.system.level === n);
        if (list.length) levels.push({ level: n, label: n === 0 ? "Cantrips" : `${ARNEYAN.spellLevels[n]} Level`, pips: [], spells: await rows(list) });
      }
      spellSections.push({ name: isCharacter ? "Other Spells" : system.casters?.length ? "Innate Spells" : "Spells", levels, loose: true, dc: isCharacter ? null : system.spellDC, npcDay: !isCharacter });
    }

    // Spells in items, PF2e style, under the spell lists: wands and staffs with their charges, then scrolls.
    // Click a name to read it: the item's own text, or the spell's.
    const spellText = async (i, e) => {
      const key = `${i.id}:${e.name}`;
      if (!this._expanded.has(key)) return { key, desc: "" };
      const linked = e.uuid ? await fromUuid(e.uuid).catch(() => null) : null;
      const sp = linked?.type === "spell" ? linked : await spellByName(e.name);
      const meta = sp ? `<p class="arn-muted">${[sp.system.level ? `${ARNEYAN.spellLevels[sp.system.level]} level` : "Cantrip", sp.system.school, sp.system.range].filter(Boolean).join(" · ")}</p>` : "";
      return { key, desc: sp ? meta + await enrich(sp.system.description) : "<p class=\"arn-muted\">Not found in the Spells compendium.</p>" };
    };
    const magicItems = await Promise.all(actor.items.filter(i => i.type === "equipment" && (i.system.itemSpells?.length || i.system.scroll?.spell || blankScrollLevel(i) !== null)).sort(sort).map(async i => {
      const s = i.system;
      const blank = blankScrollLevel(i);
      const spells = await Promise.all((s.itemSpells ?? []).map(async e => ({ name: e.name, cost: e.cost, short: s.charges?.max ? s.charges.value < e.cost : false, ...(await spellText(i, e)) })));
      const scrollKey = `${i.id}:scroll`;
      return {
        expanded: this._expanded.has(i.id), facts: this._expanded.has(i.id) ? itemFacts(i) : [], desc: this._expanded.has(i.id) ? await enrich(s.description) : "",
        scrollKey, scrollDesc: s.scroll?.spell && this._expanded.has(scrollKey) ? await enrich(s.scroll.spell.system?.description ?? "") : "",
        id: i.id, name: i.name, img: i.img, qty: s.quantity ?? 1, isWand: !!s.itemSpells?.length,
        charges: s.charges?.max ? `${s.charges.value}/${s.charges.max}` : "", recharge: !!s.charges?.max,
        castLevel: s.castLevel,
        spells,
        scroll: s.scroll?.spell ? { name: s.scroll.spell.name, level: s.scroll.spell.system?.level ?? 0 } : null,
        blank: blank === null ? null : (blank ? `${ARNEYAN.spellLevels[blank]} level` : "cantrip")
      };
    }));

    // Conditions and effects.
    const statuses = statusesOf(actor);
    const conditions = Object.entries(ARNEYAN.conditions).filter(([, c]) => !c.system).map(([id, c]) => ({
      id, name: c.name, text: c.text, img: `systems/${SYS}/assets/conditions/${id}.svg`, active: statuses.has(id)
    }));
    const hasStatuses = e => (e.statuses?.size ?? e.statuses?.length ?? 0) > 0;
    const effects = actor.effects.contents.filter(e => !hasStatuses(e) || e.flags?.[SYS]?.rules?.length || e.flags?.[SYS]?.concentration).map(e => {
      const f = e.flags?.[SYS] ?? {};
      const fx = f.expires ? combatById(f.expires.combat) : null;
      const rounds = fx ? Math.max(0, f.expires.round - fx.round) : null;
      return {
        id: e.id, name: e.name, img: e.img, disabled: e.disabled, concentration: !!f.concentration,
        source: f.sourceName ?? "", summary: (f.rules ?? []).map(r => `${r.key} ${r.value}${r.when ? ` (${r.when})` : ""}`).join(", "),
        duration: rounds !== null ? `${rounds} round${rounds === 1 ? "" : "s"} left` : timeLeftLabel(e) || (f.rounds ? `${f.rounds} rounds` : "")
      };
    });
    const toggles = actor.items.filter(i => i.system.toggle).map(i => ({ id: i.id, name: i.name, img: i.img, active: i.system.active }));
    const bySource = new Map();
    for (const r of mods?.rules ?? []) {
      if (r.label === "Sheet" || r.label === "Stat block") continue;
      if (!bySource.has(r.label)) bySource.set(r.label, []);
      // A rule for some weapons only says which ("damage.reroll 2 with two-handed weapons"); a reminder's "when" does.
      bySource.get(r.label).push(r.when ? `${r.key} ${r.value} when ${r.when}` : `${r.key} ${r.value}${r.weapon ? ` ${scopeText(r)}` : ""}`);
    }
    const activeRules = [...bySource].map(([label, list]) => ({ label, text: list.join(" · ") }));

    // Sidebar stats with breakdowns.
    const sideStats = isCharacter ? [
      { key: "ac", label: "AC", value: system.attributes.ac.value, tip: breakdown(system.attributes.ac.parts), sub: system.attributes.ac.armour || "Unarmoured" },
      { key: "bth", label: "BtH", value: signed(system.bth), tip: `Class +${system.bthBase}${system.attributes.bthBonus ? ` · Sheet ${signed(system.attributes.bthBonus)}` : ""}` },
      { key: "init", label: "Init", value: signed(system.attributes.init), tip: breakdown(system.attributes.initParts), action: "rollInit" },
      { key: "speed", label: "Speed", value: `${system.attributes.speedNow}ft`, tip: `${breakdown(system.attributes.speedParts)}${system.attributes.speedMult !== 1 ? ` · x${system.attributes.speedMult}` : ""}` }
    ] : [
      { key: "ac", label: "AC", value: system.acTotal, tip: breakdown(system.acParts) },
      { key: "bth", label: "Attack", value: signed(system.attributes.attack) },
      { key: "init", label: "Init", value: signed(system.attributes.init), tip: breakdown(system.attributes.initParts), action: "rollInit" },
      { key: "morale", label: "Morale", value: system.attributes.morale, action: "rollMorale", tip: "Morale Check: 2d6, higher than this breaks" }
    ];
    const saves = isCharacter
      ? Object.entries(system.saves).map(([k, v]) => ({ key: k, label: v.label, value: v.value, bonus: actor._source.system.saves[k].bonus, valueLabel: signed(v.value), tip: breakdown(v.parts), abbr: ARNEYAN.abilityAbbr[v.ability], autoFail: v.autoFail }))
      : system.saveList.map(s => ({ key: s.key, label: s.label, value: s.value, valueLabel: signed(s.total), tip: breakdown(s.parts), autoFail: s.autoFail }));

    const hp = system.attributes.hp;
    Object.assign(context, {
      actor, system, source: actor._source.system, config: ARNEYAN, mods,
      isCharacter, isNpc: !isCharacter, editable: this.isEditable, editMode: this.editMode,
      tabs: (isCharacter
        ? [["actions", "Actions"], ["spells", "Spells"], ["features", "Features"], ["skills", "Skills"], ["gear", "Inventory"], ["effects", "Effects"], ["downtime", "Downtime"], ["bio", "Biography"]]
        : [["actions", "Actions"], ["spells", "Spells"], ["effects", "Effects"], ["bio", "Description"]]).map(([id, label]) => ({ id, label, active: id === this._activeTab })),
      activeTab: this._activeTab,
      abilities: Object.entries(system.abilities).map(([k, v]) => ({
        key: k, label: ARNEYAN.abilities[k], abbr: ARNEYAN.abilityAbbr[k], value: v.base ?? v.value, total: v.total ?? v.value,
        changed: (v.total ?? v.value) !== (v.base ?? v.value), mod: v.mod, modLabel: signed(v.mod), tip: v.parts ? breakdown(v.parts) : ""
      })),
      classes: byType("class"),
      ancestry: await Promise.all(byType("ancestry").map(async i => ({ ...(await row(i)), name: i.name, img: i.img }))),
      kits: await Promise.all(byType("kit").map(async i => ({ ...(await row(i)), name: i.name, img: i.img }))),
      feats: await rows(byType("feat")),
      skills: await Promise.all(byType("skill").map(async s => {
        const ab = s.system.ability;
        const mod = system.abilities[ab].mod;
        const knackOnly = s.system.tier === "knack";
        return { ...(await row(s)), abbr: ARNEYAN.abilityAbbr[ab], tier: ARNEYAN.skillTiers[s.system.tier], bonus: signed(knackOnly ? (mods?.sum("check", "skill") ?? 0) : (mod <= 0 ? 1 : mod) + (mods?.sum("check", `check.${ab}`, "skill") ?? 0)), master: s.system.tier === "master" || knackOnly || !!s.flags?.arneyan?.knack };
      })),
      abilityGroups: groups,
      combatAbilities,
      weapons,
      armour: byType("armour"),
      equipment: byType("equipment"),
      gear,
      spellSections, magicItems,
      sizes: ARNEYAN.sizes,
      sideStats, saves,
      hpPct: Math.clamp(Math.round((Math.max(0, hp.value) / Math.max(1, hp.max)) * 100), 0, 100),
      hpTip: breakdown(hp.parts ?? []),
      // Each class's Hit Die, how many, and what each level gave (click to roll one by hand).
      hitDice: actor.type === "character" ? actor.items.filter(i => i.type === "class").map(c => ({
        id: c.id, name: c.name, die: c.system.hitDie, levels: c.system.levels,
        tip: `${c.name}: ${c.system.hitDie} a level. ${(c.system.hpRolls ?? []).length ? `HP gained by level: ${(c.system.hpRolls ?? []).map((n, i) => `${i + 1}${["st", "nd", "rd"][i] ?? "th"} ${n}`).join(", ")}. ` : ""}Click to roll one ${c.system.hitDie} + Con.`
      })) : [],
      multi: actor.items.filter(i => i.type === "class").length > 1,
      conditions, activeConditions: conditions.filter(c => c.active), effects, toggles, activeRules,
      combat: combatSheetContext(actor),
      situational: mods?.situational ?? [],
      traits: prettyTraits(system.traits),
      levelLabel: system.details?.levelText || system.level,
      isGM: game.user.isGM,
      fromBestiary: game.user.isGM && !!bestiarySource(actor) && !actor.isToken,
      transformed: actor.getFlag?.("arneyan", "transform") ?? null,
      levelTexts: { "": "None", "¼": "¼", "½": "½", "Mythic": "Mythic" },
      noCast: system.noCast ? mods.sources("no.cast").join(", ") : "",
      noAct: system.noAct ? mods.sources("no.act").join(", ") : "",
      concentrating: actor.effects.find(e => e.flags?.[SYS]?.concentration)?.flags[SYS].sourceName ?? "",
      stateLabel: { stable: "Unconscious but stable", dying: `Dying: losing 1 HP a turn, dies at ${system.attributes.deathAt}`, dead: "Dead" }[system.attributes.state] ?? ""
    });

    Object.assign(context, worldSheetContext(actor));
    if (isCharacter) {
      context.exhaustion = Array.from({ length: 6 }, (_, i) => ({ level: i + 1, on: system.attributes.exhaustion > i, label: ARNEYAN.exhaustion[i + 1] }));
      context.bio = await enrich(system.details.biography);
      context.story = await enrich(system.details.backgroundStory);
      context.xpPct = Math.min(100, Math.round((system.attributes.xp / system.xpRate) * 100));
      // Enough XP for the next level (Book I: spend it all on one level): a Level up button by the XP bar.
      const clsList = actor.items.filter(i => i.type === "class");
      context.levelReady = clsList.length > 0 && (system.level ?? 0) < 24 && system.attributes.xp >= system.xpRate;
      context.levelReadyClass = clsList.length === 1 ? clsList[0].id : "";
      context.nwpLeft = system.nwp.max - system.nwp.used;
      // Starting gold: once rolled, only the GM sees the button (players can't farm it).
      context.canStartingGold = this.isEditable && canRunStartingWealth(actor, game.user);
    } else {
      context.desc = await enrich(system.details.description);
      context.treasure = await enrich(system.details.treasure);
    }
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const el of this.element.querySelectorAll(".arn-tab")) el.hidden = el.dataset.tab !== this._activeTab;
    // Right-click a row: the item in its own window.
    bindItemWindows(this);
    // Item rows can be dragged out to the sidebar or other sheets.
    for (const r of this.element.querySelectorAll("[data-item-id][draggable]")) {
      r.addEventListener("dragstart", ev => {
        // Rows inside a container's row: only the row actually dragged counts.
        if (ev.target.closest?.("[data-item-id]") !== r) return;
        const item = this.document.items.get(r.dataset.itemId);
        if (item) ev.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
      });
    }
    // Which ammunition a weapon draws from, picked on the Actions tab.
    for (const sel of this.element.querySelectorAll("select.arn-ammo-pick")) {
      sel.addEventListener("change", ev => {
        ev.stopPropagation();
        this.document.items.get(sel.dataset.ammoFor)?.update({ "system.ammoId": sel.value });
      });
    }
    // Containers light up while gear is dragged over them.
    for (const box of this.element.querySelectorAll(".arn-container-block")) {
      box.addEventListener("dragenter", () => box.classList.add("arn-drop-target"));
      box.addEventListener("dragleave", ev => { if (!box.contains(ev.relatedTarget)) box.classList.remove("arn-drop-target"); });
      box.addEventListener("drop", () => box.classList.remove("arn-drop-target"));
    }
    // Typing a new class level levels the class up or down, with all the prompts.
    for (const input of this.element.querySelectorAll("input.arn-class-level")) {
      input.addEventListener("change", ev => {
        ev.stopPropagation();
        const cls = this.document.items.get(input.dataset.itemId);
        if (cls) Promise.resolve(this.document.setClassLevel(cls, Number(input.value))).finally(() => this.render());
      });
    }
    // Spell slot pips: right-click spends one; the "left / total" boxes can be typed in.
    for (const pip of this.element.querySelectorAll(".arn-pip")) {
      pip.addEventListener("contextmenu", ev => {
        ev.preventDefault();
        if (!this.isEditable) return;
        this._changeSlots(pip.dataset.classId, Number(pip.dataset.level), +1);
      });
    }
    for (const input of this.element.querySelectorAll("input.arn-slot-left")) {
      input.addEventListener("change", ev => {
        ev.stopPropagation();
        const lvl = Number(input.dataset.level);
        const total = this.document.system.casters?.find(c => c.id === input.dataset.classId)?.slots[lvl]?.total ?? 0;
        this._changeSlots(input.dataset.classId, lvl, 0, { setUsed: total - (Number(input.value) || 0) });
      });
    }
    for (const input of this.element.querySelectorAll("input.arn-slot-total")) {
      input.addEventListener("change", ev => {
        ev.stopPropagation();
        const cls = this.document.items.get(input.dataset.classId);
        const lvl = Number(input.dataset.level);
        const total = this.document.system.casters?.find(c => c.id === input.dataset.classId)?.slots[lvl]?.total ?? 0;
        if (input.dataset.classId === "npc") {
          const slots = Array.from({ length: 10 }, (_, i) => this.document.system.spellcasting.slots?.[i] ?? 0);
          slots[lvl] = Math.max(0, Number(input.value) || 0);
          return this.document.update({ "system.spellcasting.slots": slots });
        }
        if (!cls) return;
        const extra = Array.from({ length: 10 }, (_, i) => cls.system.extraSlots?.[i] ?? 0);
        extra[lvl] += (Math.max(0, Number(input.value) || 0) - total);
        cls.update({ "system.extraSlots": extra });
      });
    }
    // Add a condition from the drop-down.
    this.element.querySelector("select.arn-add-condition")?.addEventListener("change", ev => {
      ev.stopPropagation();
      const id = ev.target.value;
      if (id) toggleCondition(this.document, id, true);
    });
  }

  _itemFrom(target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    return this.document.items.get(id);
  }

  /** A creature dropped on a sheet: change shape into it (Polymorph, Wild Shape and the like). */
  async _onDropActor(event, actor) {
    if (!this.isEditable || !actor || !["character", "npc"].includes(actor.type) || !["character", "npc"].includes(this.document.type)) return null;
    if (dropOnCompanions(this, event, actor)) return null;
    await promptTransform(this.document, actor);
    return null;
  }

  static #changeShape() { return chooseForm(this.document); }
  static #stabilise() { return this.document.stabilise(); }
  static #toggleLight(event, target) { const i = this._itemFrom(target); return i ? toggleLight(i) : null; }
  static #toggleIdentified(event, target) {
    const i = this._itemFrom(target);
    if (!i || !game.user.isGM) return;
    return i.update({ "system.identified": i.system.identified === false });
  }
  static #takeOut(event, target) { return this._itemFrom(target)?.update({ "system.inside": "" }); }
  static #writeScroll(event, target) { const i = this._itemFrom(target); return i ? writeScroll(i) : null; }
  static #luckDeed() { return luckForDeed(this.document); }
  static async #importSheet() {
    if (!game.user.isGM) return;
    const { importDialog } = await import("./import.mjs");
    return importDialog(this.document);
  }
  static async #refreshMonster() {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Update from the Bestiary" }, content: `<p>Replace ${this.document.name}'s stats and items with the current Bestiary entry? HP goes back to full.</p>`, rejectClose: false });
    if (ok) return refreshFromBestiary(this.document);
  }
  /** A monster's new day: spell slots back, innate spells' uses back. */
  static async #npcNewDay() {
    const actor = this.document;
    if (actor.type !== "npc") return;
    await actor.update({ "system.spellcasting.used": [] });
    const innate = actor.items.filter(i => i.type === "spell" && i.getFlag("arneyan", "used"));
    if (innate.length) await actor.updateEmbeddedDocuments("Item", innate.map(i => ({ _id: i.id, "flags.arneyan.used": 0 })));
    ui.notifications.info(`${actor.name}: spell slots and innate spells restored.`);
  }
  static #lastChance(event) { return this.document.lastChance(event); }
  static #revertShape() { return revertTransform(this.document); }

  /** Gear dragged from another sheet you own (the party stash, a friend) moves rather than copies. */
  async _onDropItem(event, item) {
    // Gear moved within this sheet: onto a container puts it inside; anywhere else in the inventory takes it out.
    if (item?.parent === this.document && ["weapon", "armour", "equipment"].includes(item.type)) {
      const box = event.target.closest?.("[data-container-id]");
      const container = box ? this.document.items.get(box.dataset.containerId) : null;
      if (container && container.id !== item.id) {
        const fail = canHold(container, item, this.document);
        if (fail) { ui.notifications.warn(fail); return null; }
        // Packed away: no longer worn or held.
        await item.update({ "system.inside": container.id, "system.equipped": false });
        return null;
      }
      if (item.system.inside && event.target.closest?.('[data-tab="gear"]')) await item.update({ "system.inside": "" });
    }
    if (blockedCopy(item)) return null;
    const created = await super._onDropItem?.(event, item);
    await moveDroppedItem(this, item, created);
    // Dropped from elsewhere straight onto a backpack or bag: stow it there.
    const made = Array.isArray(created) ? created[0] : created;
    const box = event.target.closest?.("[data-container-id]");
    const container = box && made && ["weapon", "armour", "equipment"].includes(made.type) ? this.document.items.get(box.dataset.containerId) : null;
    if (container && container.id !== made.id && made.parent === this.document && !made.system.inside) {
      const fail = canHold(container, made, this.document);
      if (fail) ui.notifications.warn(fail);
      else await made.update({ "system.inside": container.id, "system.equipped": false });
    }
    return created;
  }

  static #changeTab(event, target) {
    this._activeTab = target.dataset.tab;
    this.render();
  }
  static #toggleEdit() {
    this._editMode = !this.editMode;
    this.render();
  }
  static #rollAbility(event, target) { return this.document.rollAbility(target.dataset.ability, event); }
  static #rollSave(event, target) { return this.document.rollSave(target.dataset.save, event); }
  static #rollLuck(event) { return this.document.rollLuck(event); }
  static async #rollInit() {
    const actor = this.document;
    if (typeof actor.rollInitiative === "function") return actor.rollInitiative({ createCombatants: true });
  }
  static #rollUntrained(event) { return this.document.rollSkill(null, event); }
  static #itemUse(event, target) { return this._itemFrom(target)?.use(event); }
  static #castSpell(event, target) { return this._itemFrom(target)?.use(event); }
  static #itemDamage(event, target) {
    const item = this._itemFrom(target);
    if (!item) return;
    if (item.type === "weapon") return this.document.rollDamage(item, { crit: event.shiftKey });
    return item.rollItemDamage();
  }
  static #itemEdit(event, target) { return this._itemFrom(target)?.sheet.render(true); }
  /** A class on the sheet: its details window (the pencil still opens the editing sheet). */
  static async #classInfo(event, target) {
    const item = this._itemFrom(target);
    if (!item) return null;
    const { ArneyanClassInfo } = await import("./classinfo.mjs");
    return ArneyanClassInfo.open(item);
  }
  static async #itemChoose(event, target) {
    const item = this._itemFrom(target);
    if (!item) return null;
    const { promptAbilityChoice } = await import("./documents.mjs");
    return promptAbilityChoice(item);
  }
  static async #itemChooseWeapon(event, target) {
    const item = this._itemFrom(target);
    if (!item) return null;
    const { promptWeaponChoice } = await import("./documents.mjs");
    return promptWeaponChoice(item);
  }
  static #itemChat(event, target) { return itemToChat(this._itemFrom(target)); }
  static #itemExpand(event, target) {
    const item = this._itemFrom(target);
    if (!item) return;
    // A wand's spell or a scroll's spell has its own key; anything else opens the item itself.
    const key = target.dataset.expandKey || item.id;
    if (this._expanded.has(key)) this._expanded.delete(key);
    else this._expanded.add(key);
    this.render();
  }
  static async #itemDelete(event, target) {
    const item = this._itemFrom(target);
    if (!item) return;
    const ok = await DialogV2.confirm({ window: { title: `Delete ${item.name}?` }, content: `<p>Remove <strong>${item.name}</strong> from ${this.document.name}?</p>` });
    if (ok) return item.delete();
  }
  static #itemCreate(event, target) {
    const type = target.dataset.type;
    const data = { name: `New ${CONFIG.Item.typeLabels?.[type] ? game.i18n.localize(CONFIG.Item.typeLabels[type]) : type}`, type };
    if (type === "spell" && target.dataset.level) data.system = { level: Number(target.dataset.level) };
    if (type === "spell" && target.dataset.class) foundry.utils.setProperty(data, "system.className", target.dataset.class);
    return this.document.createEmbeddedDocuments("Item", [data]).then(([i]) => i?.sheet.render(true));
  }
  static #itemEquip(event, target) {
    const item = this._itemFrom(target);
    if (!item) return;
    // Wearing or holding something takes it out of the pack.
    const on = !item.system.equipped;
    return item.update({ "system.equipped": on, ...(on && item.system.inside ? { "system.inside": "" } : {}) });
  }
  static #itemMode(event, target) {
    const item = this._itemFrom(target);
    if (item) return toggleMode(item);
  }
  static #giveItem(event, target) {
    const item = this._itemFrom(target);
    if (item) return giveItemTo(item);
  }
  static #castItemSpell(event, target) {
    const item = this._itemFrom(target);
    if (item) return castFromItem(item, target.dataset.spell);
  }
  /** Set a wand or staff's charges by hand, or roll its recharge. */
  static async #recharge(event, target) {
    const item = this._itemFrom(target);
    const c = item?.system.charges;
    if (!c?.max) return;
    const res = await foundry.applications.api.DialogV2.wait({
      window: { title: `Charges: ${item.name}` }, classes: ["arneyan"],
      content: `<div class="form-group"><label>Charges (of ${c.max})</label><input type="number" name="n" value="${c.value}" min="0" max="${c.max}" autofocus></div>
        <p class="arn-muted">${c.recharge ? `It regains ${c.recharge} at dawn (a long rest does it for you).` : "It doesn't recharge by itself (see the item)."}</p>`,
      buttons: [
        { action: "set", label: "Set", icon: "fa-solid fa-check", default: true, callback: (e, b) => ({ set: Math.clamp(Number(b.form.elements.n.value) || 0, 0, c.max) }) },
        ...(c.recharge ? [{ action: "roll", label: `Roll ${c.recharge}`, icon: "fa-solid fa-dice", callback: () => ({ roll: true }) }] : []),
        { action: "cancel", label: "Cancel" }
      ],
      rejectClose: false
    });
    if (!res || typeof res !== "object") return;
    if (res.roll) {
      const r = await new Roll(String(c.recharge)).evaluate();
      const value = Math.min(c.max, c.value + r.total);
      await item.update({ "system.charges.value": value });
      return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.document }), rolls: [r],
        content: `<div class="arn-card"><p>${foundry.utils.escapeHTML(item.name)} regains ${value - c.value} charge${value - c.value === 1 ? "" : "s"} (${value}/${c.max}).</p></div>` });
    }
    return item.update({ "system.charges.value": res.set });
  }
  static #itemToggle(event, target) {
    const item = this._itemFrom(target);
    if (item?.type === "weapon") return toggleMode(item);
    if (item) return item.update({ "system.active": !item.system.active });
  }
  static #openPage(event, target) {
    const item = this._itemFrom(target);
    if (item) return openPdf(item.system.source.book, item.system.source.page);
    return openPdf(target.dataset.book || "mt", target.dataset.page);
  }
  static #rest() { return this.document.rest(); }
  static #abilityScores() { return game.arneyan.abilityScores(this.document); }
  /** Roll one Hit Die + Con by hand (a level's HP rolled at the table, or just to check): the result goes to chat. */
  static async #rollHitDie(event, target) {
    const actor = this.document;
    const cls = actor.items.get(target.dataset.classId);
    if (!cls) return;
    const con = actor.system.abilities.con.mod;
    const roll = await new Roll(`1${cls.system.hitDie} + ${con}`).evaluate();
    const hp = Math.max(1, roll.total);
    return roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `Hit Die: ${cls.name} ${cls.system.hitDie} + Con (${con >= 0 ? "+" : ""}${con}) = ${hp} HP${roll.total < 1 ? " (minimum 1)" : ""}. Add it to Max HP on the sheet if it's for a level.` });
  }
  static #levelUp(event, target) { return this.document.levelUp(this._itemFrom(target)); }
  static #levelDown(event, target) {
    const cls = this._itemFrom(target);
    if (!cls) return;
    if (cls.system.levels <= 1) return ui.notifications.info(`${cls.name} is already 1st level. Delete the class to remove it.`);
    return this.document.setClassLevel(cls, cls.system.levels - 1);
  }
  /** The XP bar's Level up: one class goes straight up; with several, ask which (a new class is added by dropping it). */
  static async #levelUpReady() {
    const classes = this.document.items.filter(i => i.type === "class");
    if (!classes.length) return;
    if (classes.length === 1) return this.document.levelUp(classes[0]);
    const id = await foundry.applications.api.DialogV2.wait({
      window: { title: `${this.document.name}: level up` }, classes: ["arneyan"],
      content: `<p>Which class takes the level? (To start a new class, drop it on the sheet instead.)</p>${classes.map((c, i) => `<label class="checkbox"><input type="radio" name="cls" value="${c.id}" ${i === 0 ? "checked" : ""}> ${foundry.utils.escapeHTML(c.name)} ${c.system.levels}</label>`).join("<br>")}`,
      buttons: [{ action: "ok", label: "Level up", icon: "fa-solid fa-circle-up", default: true, callback: (ev, btn) => btn.form.querySelector("input[name=cls]:checked")?.value }, { action: "cancel", label: "Cancel" }],
      rejectClose: false
    });
    const cls = classes.find(c => c.id === id);
    if (cls) return this.document.levelUp(cls);
  }
  /** Starting Equipment & Gear: roll the class's gold, then a pack or shopping. */
  static #startingGold() { return startingWealth(this.document); }
  /** Open the system's own browser on the right tab, adding to this actor. */
  static #browse(event, target) {
    const tab = target.dataset.pack === "class-features" ? "features" : target.dataset.pack;
    const filters = {};
    // Spells open on the first casting class's list.
    const caster = this.document.system.casters?.[0];
    if (tab === "spells" && caster) filters.class = caster.name.replace(/\s*\(.*$/, "");
    if (target.dataset.group) filters.group = target.dataset.group;
    if (target.dataset.category) filters.category = target.dataset.category;
    if (tab === "kits" && this.document.items.find(i => i.type === "class")) filters.className = this.document.items.find(i => i.type === "class").name.replace(/\s*\(.*$/, "");
    return ArneyanBrowser.open({ tab, actor: this.document, filters });
  }
  /** Left-click a pip: get a slot back (filled circles grow left to right). Right-click (in _onRender): spend one. */
  static #toggleSlot(event, target) {
    if (!this.isEditable) return;
    return this._changeSlots(target.dataset.classId, Number(target.dataset.level), -1);
  }

  _changeSlots(classId, lvl, delta, { setUsed = null } = {}) {
    if (classId === "npc") {
      const sc = this.document.system.spellcasting;
      const total = this.document.system.casters?.[0]?.slots[lvl]?.total ?? 0;
      const used = Array.from({ length: 10 }, (_, i) => sc.used?.[i] ?? 0);
      used[lvl] = Math.clamp(setUsed ?? (Math.min(used[lvl], total) + delta), 0, total);
      return this.document.update({ "system.spellcasting.used": used });
    }
    const cls = this.document.items.get(classId);
    if (!cls) return;
    const caster = this.document.system.casters?.find(c => c.id === classId);
    const total = caster?.slots[lvl]?.total ?? 0;
    const used = Array.from({ length: 10 }, (_, i) => cls.system.slotsUsed?.[i] ?? 0);
    used[lvl] = Math.clamp(setUsed ?? (Math.min(used[lvl], total) + delta), 0, total);
    return cls.update({ "system.slotsUsed": used });
  }
  /** Click an Exhaustion pip: set that level, or click the current top pip to go down one. */
  static #setExhaustion(event, target) {
    const lvl = Number(target.dataset.level);
    const now = this.document.system.attributes.exhaustion;
    return this.document.update({ "system.attributes.exhaustion": lvl === now ? lvl - 1 : lvl });
  }
  static #toggleCondition(event, target) {
    const id = target.dataset.condition;
    return toggleCondition(this.document, id, !statusesOf(this.document).has(id));
  }
  static #effectToggle(event, target) {
    const e = this.document.effects.get(target.closest("[data-effect-id]")?.dataset.effectId);
    if (e) return e.update({ disabled: !e.disabled });
  }
  static #effectDelete(event, target) {
    const e = this.document.effects.get(target.closest("[data-effect-id]")?.dataset.effectId);
    if (e) return e.delete();
  }
  static #endConcentration() { return endConcentration(this.document); }
  static #editText(event, target) { return openEditor(this.document, target.dataset.field, target.dataset.label ?? "Text"); }
  static #hpStep(event, target) {
    const step = Number(target.dataset.step) * (event.shiftKey ? 5 : 1);
    const hp = this.document.system.attributes.hp;
    return this.document.update({ "system.attributes.hp.value": Math.min(hp.max, hp.value + step) });
  }
}

/* -------------------------------------------- */
/*  Item sheet                                  */
/* -------------------------------------------- */

/** An aura's radius for the sheet: "10", or steps by level "10; 30 at 15; 50 at 20". */
export function radiusText(r) {
  if (Array.isArray(r)) return r.map(([lvl, ft], i) => (i === 0 && lvl <= 1 ? `${ft}` : `${ft} at ${lvl}`)).join("; ");
  return String(r ?? "");
}

/** Back from the sheet: a number, steps by level, or a formula with @cl. */
export function parseRadius(text) {
  const t = String(text ?? "").trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^\d+(\s*;\s*\d+\s+at\s+\d+)+$/i.test(t)) {
    const parts = t.split(";").map(p => p.trim());
    return [[1, Number(parts[0])], ...parts.slice(1).map(p => { const [ft, lvl] = p.split(/\s+at\s+/i).map(Number); return [lvl, ft]; })];
  }
  return t || 0;
}

/**
 * The item sheet's weapon pick (Weapon Specialisation): one select per weapon allowed at the owner's class level (a
 * second from 13th), each offering the character's weapons and the Catalogue's.
 */
async function weaponPickContext(item) {
  const { weaponOptions, weaponOptionsHtml } = await import("./documents.mjs");
  const sys = item.system;
  const max = Math.max(1, weaponPickMax(sys, item.actor ? featureLevel(item.actor, item) : 1));
  const picks = (item._source?.system?.weaponChoice?.value ?? sys.weaponChoice?.value ?? []).filter(Boolean);
  const options = await weaponOptions(item.actor);
  // A pick beyond what the level allows (after losing levels) still shows, marked, so it isn't lost unseen.
  return {
    max, slots: Array.from({ length: Math.max(max, picks.length) }, (_, i) => ({
      i, over: i >= max, blank: i ? "None" : "Choose (reminders only until you do)", options: weaponOptionsHtml(options, picks[i] ?? "")
    }))
  };
}

/** The item sheet's line about the creation cap of 18: where a feat's bonus was moved, or that it still needs moving. */
async function creationCapContext(item) {
  if (item.type !== "feat" || !item.actor) return null;
  const name = k => ARNEYAN.abilities[k] ?? k;
  const moved = item.system.abilityChoice?.moved;
  if (moved) return { moved: name(moved), undo: (Number(item.actor.system?.level) || 0) <= 1 };
  const { creationOverflow } = await import("./documents.mjs");
  const over = creationOverflow(item);
  return over ? { over: name(over.from), amount: over.amount } : null;
}

export class ArneyanItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["arneyan", "sheet", "item"],
    position: { width: 640, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      openPage: ArneyanItemSheet.#openPage,
      changeTab: ArneyanItemSheet.#changeTab,
      editText: ArneyanItemSheet.#editText,
      ruleAdd: ArneyanItemSheet.#ruleAdd,
      ruleDelete: ArneyanItemSheet.#ruleDelete,
      applyAdd: ArneyanItemSheet.#applyAdd,
      auraAdd: ArneyanItemSheet.#auraAdd,
      auraDelete: ArneyanItemSheet.#auraDelete,
      applyDelete: ArneyanItemSheet.#applyDelete,
      forge: ArneyanItemSheet.#forge,
      toggleTrait: ArneyanItemSheet.#toggleTrait,
      bdAdd: ArneyanItemSheet.#bdAdd,
      bdDelete: ArneyanItemSheet.#bdDelete,
      isDelete: ArneyanItemSheet.#isDelete,
      capMove: ArneyanItemSheet.#capMove,
      capUndo: ArneyanItemSheet.#capUndo
    }
  };

  static PARTS = {
    sheet: { template: "systems/arneyan/templates/item/item-sheet.hbs", scrollable: [".arn-body"] }
  };

  _activeTab = "details";

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const sys = item.system;
    const hasEffects = "rules" in sys;
    Object.assign(context, {
      item, system: sys, source: item._source.system, config: ARNEYAN, type: item.type,
      editable: this.isEditable,
      tabs: [["details", "Details"], ...(hasEffects ? [["effects", "Effects"]] : []), ["description", "Description"]]
        .map(([id, label]) => ({ id, label, active: id === this._activeTab })),
      hasEffects,
      description: await TextEditorImpl().enrichHTML(sys.description ?? "", { relativeTo: item, rollData: item.actor?.getRollData?.() ?? {}, secrets: item.isOwner }),
      bthChoices: Object.fromEntries(Object.entries(ARNEYAN.bthProgressions).map(([k, v]) => [k, v.label])),
      spellLevelChoices: Object.fromEntries(ARNEYAN.spellLevels.map((l, i) => [i, l])),
      damageChoices: { "": "None", ...ARNEYAN.damageTypes },
      isGear: ["weapon", "armour", "equipment"].includes(item.type),
      canForge: ["weapon", "armour"].includes(item.type),
      isGM: game.user.isGM,
      hideName: sys.identified === false && !game.user.isGM,
      hideScroll: sys.identified === false && !game.user.isGM,
      canHoldSpell: item.type === "equipment" && /^scroll\b/i.test(item._source.name) && !sys.scroll?.spell && this.isEditable,
      lightTimer: item.type === "equipment" && sys.light?.hours > 0 ? lightInfo(sys.light) : null,
      ammoStacks: item.type === "weapon" && item.actor && sys.ammoType ? { "": "The first that fits (plain before silver or magic)", ...Object.fromEntries(item.actor.items.filter(i => i.type === "equipment" && i.system.ammoType === sys.ammoType).map(i => [i.id, `${i.name} × ${i.system.quantity}`])) } : null,
      weaponTraits: item.type === "weapon" ? Object.entries(ARNEYAN.weaponTraits).map(([name, t]) => ({ name, ...t, on: traitList(sys.traits).some(x => x.toLowerCase() === name.toLowerCase()) })) : [],
      materials: item.type === "weapon" ? Object.entries(ARNEYAN.weaponMaterials).map(([name, text]) => ({ name, text, on: traitList(sys.traits).some(x => x.toLowerCase() === name.toLowerCase()) })) : [],
      bonusDamage: (item._source.system.bonusDamage ?? []).map((b, i) => ({ ...b, i })),
      bonusTypeChoices: { "": "Same as the weapon", ...Object.fromEntries(Object.entries(ARNEYAN.damageTypes).filter(([k]) => k !== "healing")) },
      levelStr: String(item._source.system.level ?? ""),
      usesFromFormula: !!(item._source.system.uses?.formula && item.actor),
      abilityChoices: (sys.abilityChoice?.options?.length ?? 0) > 1 ? Object.fromEntries(sys.abilityChoice.options.map(o => [o, ARNEYAN.abilities[o] ?? o])) : null,
      abilityChoiceValue: sys.abilityChoice?.options?.includes(sys.abilityChoice.value) ? sys.abilityChoice.value : "",
      creationCap: await creationCapContext(item),
      weaponPick: String(sys.weaponChoice?.max ?? "").trim() ? await weaponPickContext(item) : null,
      fromCompendium: !!compendiumSourceOf(item),
      keepCustom: !!item.flags?.arneyan?.keepCustom,
      classesLabel: (sys.classes ?? []).join(", "),
      kitFeatures: item.type === "kit" ? await Promise.all((sys.features ?? []).map(async f => ({ ...f, html: await TextEditorImpl().enrichHTML(f.description), ruleText: (f.rules ?? []).map(r => `${r.key} ${r.value}${r.when ? ` (${r.when})` : ""}`).join(", ") }))) : [],
      classFeatures: item.type === "class" ? (sys.features ?? []).slice().sort((a, b) => a.level - b.level) : [],
      slotRow: item.type === "class" && sys.slotTable?.length ? ARNEYAN.spellLevels.map((l, n) => ({
        n, label: l, table: sys.slotTable[Math.clamp(sys.levels, 1, 24) - 1]?.[n] ?? 0, extra: sys.extraSlots?.[n] ?? 0
      })).filter(r => r.n > 0) : [],
      rules: (item._source.system.rules ?? []).map((r, i) => ({ ...r, i })),
      applies: (item._source.system.applies ?? []).map((a, i) => ({ ...a, i, statusesText: (a.statuses ?? []).join(", "), rules: (a.rules ?? []).map((r, j) => ({ ...r, i: j })) })),
      ruleKeyGroups: Object.entries(ARNEYAN.ruleKeys).map(([label, keys]) => ({ label, keys })),
      knownKeys: Object.fromEntries([...ARNEYAN.allRuleKeys].map(k => [k, true])),
      conditionIds: Object.keys(ARNEYAN.conditions).filter(k => !ARNEYAN.conditions[k].system).join(", "),
      auras: (item._source.system.auras ?? []).map((a, i) => ({ ...a, i, ruleApply: `aura-${i}`, radiusText: radiusText(a.radius),
        rules: (a.rules ?? []).map((r, j) => ({ ...r, i: j })), turn: a.turn ?? {} })),
      auraWho: { allies: "Allies", enemies: "Enemies", all: "Everyone" },
      auraSaves: ARNEYAN.saveTypes,
      auraDamageTypes: { "": "None", ...ARNEYAN.damageTypes },
      auraConditions: { "": "None", ...Object.fromEntries(Object.entries(ARNEYAN.conditions).filter(([, c]) => !c.system).map(([k, c]) => [k, c.name])) }
    });
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const el of this.element.querySelectorAll(".arn-tab")) el.hidden = el.dataset.tab !== this._activeTab;
    // Extra spell slots for a class (an array, so saved by hand).
    for (const input of this.element.querySelectorAll("input.arn-extra-slot")) {
      input.addEventListener("change", ev => {
        ev.stopPropagation();
        const extra = Array.from({ length: 10 }, (_, i) => this.document.system.extraSlots?.[i] ?? 0);
        extra[Number(input.dataset.index)] = Number(input.value) || 0;
        this.document.update({ "system.extraSlots": extra });
      });
    }
    // Drop a spell on equipment: a blank scroll learns what it holds; anything else (a wand, a staff, a rod)
    // learns a spell it casts. Wired once: the sheet's outer element survives re-renders.
    if (!this._arnSpellDrop && this.document.type === "equipment") {
      this._arnSpellDrop = true;
      this.element.addEventListener("dragover", ev => { if (this.isEditable) ev.preventDefault(); });
      this.element.addEventListener("drop", ev => this.#onSpellDrop(ev));
    }
    // A ready-made weapon mode (Flaming, Frost...) fills in the mode's name, light and damage.
    for (const sel of this.element.querySelectorAll("select.arn-mode-preset")) {
      sel.addEventListener("change", ev => {
        ev.stopPropagation();
        const m = ARNEYAN.weaponModes[sel.value];
        if (m) this.document.update(Object.fromEntries(Object.entries(withMode(this.document.system, m)).map(([k, v]) => [`system.${k}`, v])));
      });
    }
    for (const input of this.element.querySelectorAll(".arn-item-spells [data-is]")) {
      input.addEventListener("change", ev => {
        ev.stopPropagation();
        this.document.update({ "system.itemSpells": this.#readItemSpells() });
      });
    }
    // The weapon pick (an array, so saved by hand): every select, in order, without blanks or repeats.
    for (const sel of this.element.querySelectorAll("select.arn-weapon-pick")) {
      sel.addEventListener("change", ev => {
        ev.stopPropagation();
        const value = [...new Set([...this.element.querySelectorAll("select.arn-weapon-pick")].map(s => s.value.trim()).filter(Boolean))];
        this.document.update({ "system.weaponChoice.value": value });
      });
    }
    // Extra damage rows (an array, so saved by hand).
    for (const input of this.element.querySelectorAll(".arn-bonus-damage [data-bd]")) {
      input.addEventListener("change", ev => {
        ev.stopPropagation();
        this.document.update({ "system.bonusDamage": this.#readBonusDamage() });
      });
    }
    // Rule and effect editors: read the whole editor back on any change.
    for (const input of this.element.querySelectorAll(".arn-rules-editor [data-r]")) {
      input.addEventListener("change", ev => {
        ev.stopPropagation();
        this.document.update(this.#readEffects());
      });
    }
  }

  async #onSpellDrop(ev) {
    if (!this.isEditable) return;
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev);
    if (data?.type !== "Item") return;
    const spell = await fromUuid(data.uuid).catch(() => null);
    if (spell?.type !== "spell") return;
    ev.preventDefault();
    ev.stopPropagation();
    const doc = this.document;
    if (blankScrollLevel(doc) !== null) {
      const sp = spell.toObject();
      delete sp._id;
      return doc.update({ "system.scroll.spell": sp, "system.scroll.cl": 0, "system.scroll.dc": 0, "system.consumable.use": true, name: `Scroll of ${spell.name}` });
    }
    if (doc.system.scroll?.spell) return ui.notifications.warn(`${doc.name} already holds ${doc.system.scroll.spell.name}.`);
    const list = this.#readItemSpells();
    if (list.some(e => e.name.toLowerCase() === spell.name.toLowerCase())) return ui.notifications.info(`${doc.name} already casts ${spell.name}.`);
    // A compendium spell is found again by name; one made in the world is kept by its id.
    const uuid = spell.pack === "arneyan.spells" ? "" : spell.uuid;
    const upd = { "system.itemSpells": [...list, { name: spell.name, cost: 1, uuid }] };
    if (!doc.system.charges?.max) Object.assign(upd, { "system.charges.max": 7, "system.charges.value": 7 });
    await doc.update(upd);
    ui.notifications.info(`${doc.name} now casts ${spell.name} (1 charge; change the cost on its sheet).`);
  }

  #readItemSpells() {
    const rows = [...this.element.querySelectorAll(".arn-item-spells .arn-is-row")];
    if (!rows.length) return (this.document.system.itemSpells ?? []).map(e => ({ ...e }));
    return rows.map(row => ({
      name: row.dataset.name, uuid: row.dataset.uuid ?? "",
      cost: Math.max(0, Number(row.querySelector("[data-is=cost]")?.value) || 0)
    }));
  }

  /** The 18 cap at creation: ask where the bonus goes (after "Later"), or put a moved bonus back. */
  static async #capMove() {
    const { promptCreationOverflow } = await import("./documents.mjs");
    await promptCreationOverflow(this.document);
  }

  static async #capUndo() {
    await this.document.update({ "system.abilityChoice.moved": "" });
  }

  static #isDelete(event, target) {
    const list = this.#readItemSpells();
    list.splice(Number(target.closest(".arn-is-row").dataset.i), 1);
    return this.document.update({ "system.itemSpells": list });
  }

  #readBonusDamage() {
    return [...this.element.querySelectorAll(".arn-bd-row")].map(row => ({
      formula: row.querySelector("[data-bd=formula]").value.trim(),
      type: row.querySelector("[data-bd=type]").value,
      when: row.querySelector("[data-bd=when]").value.trim(),
      mode: !!row.querySelector("[data-bd=mode]")?.checked
    }));
  }

  static #forge() { return openForge(this.document); }
  static #toggleTrait(event, target) {
    const trait = target.dataset.trait;
    const on = !traitList(this.document.system.traits).some(t => t.toLowerCase() === trait.toLowerCase());
    let traits = toggleTrait(this.document.system.traits, trait, on);
    // One material at a time.
    if (on && trait in ARNEYAN.weaponMaterials) for (const m of Object.keys(ARNEYAN.weaponMaterials)) if (m !== trait) traits = toggleTrait(traits, m, false);
    const update = { "system.traits": traits };
    if (trait === "Finesse") update["system.ability"] = on ? "finesse" : (this.document.system.ability === "finesse" ? "str" : this.document.system.ability);
    return this.document.update(update);
  }
  static #bdAdd() {
    return this.document.update({ "system.bonusDamage": [...this.#readBonusDamage(), { formula: "1d6", type: "fire", when: "" }] });
  }
  static #bdDelete(event, target) {
    const list = this.#readBonusDamage();
    list.splice(Number(target.dataset.i), 1);
    return this.document.update({ "system.bonusDamage": list });
  }

  #readRules(container) {
    if (!container) return [];
    return [...container.querySelectorAll(":scope > .arn-rule-row")].map(row => ({
      key: row.querySelector("[data-r=key]").value.trim(),
      value: row.querySelector("[data-r=value]").value.trim(),
      when: row.querySelector("[data-r=when]").value.trim(),
      label: "",
      // Not edited here, but kept: a rule for some weapons only stays so when another rule changes.
      weapon: row.querySelector("[data-r=weapon]")?.value.trim() ?? ""
    }));
  }

  #readEffects() {
    const root = this.element.querySelector(".arn-rules-editor");
    if (!root) return {};
    const rules = this.#readRules(root.querySelector(".arn-rule-list.passive"));
    const applies = [...root.querySelectorAll(".arn-apply-entry")].map(box => ({
      name: box.querySelector("[data-r=aname]").value.trim(),
      target: box.querySelector("[data-r=atarget]").value,
      rounds: box.querySelector("[data-r=arounds]").value.trim(),
      statuses: box.querySelector("[data-r=astatuses]").value.split(",").map(s => s.trim().toLowerCase()).filter(s => s in ARNEYAN.conditions),
      rules: this.#readRules(box.querySelector(".arn-rule-list"))
    }));
    // Auras: what the sheet shows, merged over what's stored (keeps fields it doesn't show).
    const stored = this.document._source.system.auras ?? [];
    const auras = [...root.querySelectorAll(".arn-aura-entry")].map((box, i) => {
      const v = r => box.querySelector(`[data-r=${r}]`);
      const old = stored[i] ?? {};
      const turn = { ...(old.turn ?? {}),
        save: v("tusave").value, dc: Number(v("tudc").value) || 0, formula: v("tuformula").value.trim(), type: v("tutype").value,
        half: v("tuhalf").checked, status: v("tustatus").value, text: v("tutext").value.trim() };
      const hasTurn = turn.save || turn.formula || turn.status || turn.text;
      const out = { ...old, key: old.key ?? `aura${i}`, name: v("auname").value.trim() || this.document.name,
        radius: parseRadius(v("auradius").value), who: v("auwho").value, includeSelf: v("auself").checked,
        minLevel: Number(v("aumin").value) || 0, rules: this.#readRules(box.querySelector(".arn-rule-list")) };
      if (hasTurn) out.turn = turn; else delete out.turn;
      return out;
    });
    const out = { "system.rules": rules, "system.applies": applies };
    if (root.querySelector(".arn-auras")) out["system.auras"] = auras;
    const toggle = root.querySelector("[data-r=toggle]");
    if (toggle) out["system.toggle"] = toggle.checked;
    return out;
  }

  static #changeTab(event, target) {
    this._activeTab = target.dataset.tab;
    this.render();
  }
  static #editText(event, target) { return openEditor(this.document, target.dataset.field, target.dataset.label ?? "Description"); }
  static #openPage() {
    const s = this.document.system.source;
    return openPdf(s.book, s.page);
  }
  static #ruleAdd(event, target) {
    const data = this.#readEffects();
    const idx = target.dataset.apply;
    const blank = { key: "ac", value: "1", when: "", label: "" };
    if (idx === undefined || idx === "") data["system.rules"].push(blank);
    else if (String(idx).startsWith("aura-")) data["system.auras"][Number(idx.slice(5))].rules.push(blank);
    else data["system.applies"][Number(idx)].rules.push(blank);
    return this.document.update(data);
  }
  static #ruleDelete(event, target) {
    const data = this.#readEffects();
    const idx = target.dataset.apply;
    const i = Number(target.dataset.index);
    if (idx === undefined || idx === "") data["system.rules"].splice(i, 1);
    else if (String(idx).startsWith("aura-")) data["system.auras"][Number(idx.slice(5))].rules.splice(i, 1);
    else data["system.applies"][Number(idx)].rules.splice(i, 1);
    return this.document.update(data);
  }
  static #applyAdd() {
    const data = this.#readEffects();
    data["system.applies"].push({ name: this.document.name, target: "target", rounds: "10", statuses: [], rules: [] });
    return this.document.update(data);
  }
  static #auraAdd() {
    const data = this.#readEffects();
    data["system.auras"] = [...(data["system.auras"] ?? []), { key: `aura${Date.now().toString(36)}`, name: this.document.name, radius: 10, who: "allies", includeSelf: true, minLevel: 0, rules: [{ key: "save", value: "1", when: "", label: "" }] }];
    return this.document.update(data);
  }
  static #auraDelete(event, target) {
    const data = this.#readEffects();
    data["system.auras"].splice(Number(target.dataset.index), 1);
    return this.document.update(data);
  }
  static #applyDelete(event, target) {
    const data = this.#readEffects();
    data["system.applies"].splice(Number(target.dataset.index), 1);
    return this.document.update(data);
  }
}

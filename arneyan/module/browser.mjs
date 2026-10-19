/**
 * The Arneyan browser: one searchable, filterable window over the system's compendiums,
 * in the spirit of PF2e's compendium browser. Opened from the sheet's book buttons it adds
 * straight to that character; rows can also be dragged onto any sheet.
 */
import { ARNEYAN } from "./config.mjs";
import { ArneyanEncounterBuilder } from "./encounter.mjs";
import { refreshAllFromBestiary } from "./refresh.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const SYS = "arneyan";
const LIMIT = 300;

/** Tabs: which pack, which index fields, and which filters. */
const TABS = {
  equipment: { label: "Equipment", pack: "equipment", icon: "fa-sack", fields: ["system.price", "system.damage", "system.ac", "system.category", "system.slots", "system.damageType", "system.consumable.use", "system.charges.max", "system.ammoType"], filters: ["category"], groups: true },
  spells: { label: "Spells", pack: "spells", icon: "fa-wand-sparkles", fields: ["system.level", "system.classes", "system.school", "system.concentration", "system.save", "system.damage", "system.ritual"], filters: ["level", "class", "school"] },
  actions: { label: "Actions", pack: "actions", icon: "fa-hand-fist", fields: ["system.kind", "system.toggle"], filters: [] },
  feats: { label: "Feats", pack: "feats", icon: "fa-star", fields: ["system.path"], filters: ["path"] },
  features: { label: "Class Abilities", pack: "class-features", icon: "fa-shield-halved", fields: ["system.className", "system.level", "system.uses", "system.save"], filters: ["className", "featureLevel"] },
  skills: { label: "Skills", pack: "skills", icon: "fa-book-open-reader", fields: ["system.ability"], filters: ["ability"] },
  classes: { label: "Classes", pack: "classes", icon: "fa-user-shield", fields: ["system.hitDie", "system.bthProgression", "system.castingAbility"], filters: [] },
  ancestries: { label: "Ancestries", pack: "ancestries", icon: "fa-people-group", fields: ["system.size", "system.speed"], filters: [] },
  kits: { label: "Kits", pack: "kits", icon: "fa-flag", fields: ["system.className"], filters: ["className"] },
  monsters: { label: "Bestiary", pack: "monsters", icon: "fa-dragon", gm: true, docType: "Actor",
    fields: ["system.level", "system.details.levelText", "system.details.type", "system.details.isSolo", "system.attributes.hp.max", "system.attributes.ac", "system.hd"],
    filters: ["monsterLevel", "creatureType", "category", "solo"] }
};

const CONSUMABLES = "__consumables";
/** The Catalogue's top-level groups in the compendium's own order. */
const GROUPS = ["Weapons", "Armour & Shields", "Magic Items", "Alchemy & Poisons", "Spell Components", "Adventuring Gear", "Food & Drink", "Tools & Trades"];
const groupOrder = rows => {
  const present = new Set(rows.map(r => r.group).filter(Boolean));
  return [...GROUPS.filter(g => present.has(g)), ...[...present].filter(g => !GROUPS.includes(g)).sort()];
};

/** "½" sorts between 0 and 1, "¼" before it. */
const levelSort = s => s.details?.levelText === "¼" ? 0.25 : s.details?.levelText === "½" ? 0.5 : s.details?.levelText === "Mythic" ? 99 : (s.level ?? 0);
const creatureType = s => (s.details?.type ?? "").split(/[\s(]/)[0].toLowerCase();
const levelName = s => s.details?.levelText || String(s.level ?? 0);

export class ArneyanBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;

  /** Open (or bring forward) the browser on a tab, adding to an actor. */
  static open({ tab = "equipment", actor = null, filters = {} } = {}) {
    if (!TABS[tab] || (TABS[tab].gm && !game.user.isGM)) tab = "equipment";
    const app = ArneyanBrowser.#instance ??= new ArneyanBrowser();
    app.tab = tab;
    app.actor = actor;
    app.filters = { q: "", ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "" && v !== undefined)) };
    app._index = {}; // pick up any compendium edits since last time
    return app.render({ force: true, window: { title: app.title } });
  }

  constructor(options = {}) {
    super(options);
    this.tab = "equipment";
    this.actor = null;
    this.filters = { q: "" };
    this._index = {};
  }

  static DEFAULT_OPTIONS = {
    id: "arneyan-browser",
    classes: ["arneyan", "arn-browser-app"],
    position: { width: 820, height: 720 },
    window: { title: "Arneyan Browser", icon: "fa-solid fa-book-atlas", resizable: true },
    actions: {
      tab: ArneyanBrowser.#onTab,
      add: ArneyanBrowser.#onAdd,
      view: ArneyanBrowser.#onView,
      encounter: ArneyanBrowser.#onEncounter,
      forge: ArneyanBrowser.#onForge,
      refreshAll: () => refreshAllFromBestiary(),
      clear: ArneyanBrowser.#onClear,
      group: ArneyanBrowser.#onGroup
    }
  };

  static PARTS = { main: { template: "systems/arneyan/templates/apps/browser.hbs", scrollable: [".arn-br-results"] } };

  get title() {
    return this.actor ? `Arneyan Browser: adding to ${this.actor.name}` : "Arneyan Browser";
  }

  /** Load (once) a pack's index with the fields we filter on, plus folder names. */
  async #loadIndex(tab) {
    if (this._index[tab]) return this._index[tab];
    const cfg = TABS[tab];
    const pack = game.packs.get(`${SYS}.${cfg.pack}`);
    if (!pack) return (this._index[tab] = []);
    const index = await pack.getIndex({ fields: ["img", "folder", "type", ...cfg.fields] });
    const folderName = id => pack.folders?.get?.(id)?.name ?? "";
    // The top-level folder an entry sits under (Weapons, Magic Items...).
    const topName = id => { let f = pack.folders?.get?.(id); for (let n = 0; f?.folder && n < 8; n++) f = f.folder?.id ? f.folder : pack.folders.get(f.folder); return f?.name ?? ""; };
    const rows = index.contents?.length !== undefined ? index.contents : [...index];
    this._index[tab] = rows.map(e => ({
      uuid: e.uuid ?? `Compendium.${pack.collection}.${cfg.docType ?? "Item"}.${e._id}`, name: e.name, img: e.img, type: e.type,
      folder: folderName(e.folder), group: topName(e.folder), system: e.system ?? {},
      // Used up or spent: potions, oils, poisons, scrolls, wands, ammunition, torches (any group).
      consumable: !!(e.system?.consumable?.use || e.system?.charges?.max || e.system?.ammoType || /^scroll\b/i.test(e.name))
    })).sort((a, b) => (cfg.docType === "Actor" ? levelSort(a.system) - levelSort(b.system) : 0) || a.name.localeCompare(b.name));
    return this._index[tab];
  }

  async _prepareContext() {
    const cfg = TABS[this.tab];
    const all = await this.#loadIndex(this.tab);
    const f = this.filters;
    const q = (f.q ?? "").trim().toLowerCase();
    const sys = r => r.system ?? {};
    const rows = all.filter(r => {
      if (q && !`${r.name} ${r.folder}`.toLowerCase().includes(q)) return false;
      if (f.level !== undefined && f.level !== "" && String(sys(r).level) !== String(f.level)) return false;
      if (f.class && !(sys(r).classes ?? []).includes(f.class)) return false;
      if (f.school && sys(r).school !== f.school) return false;
      if (f.path && sys(r).path !== f.path) return false;
      if (f.className && !(sys(r).className ?? "").startsWith(f.className)) return false;
      if (f.featureLevel && String(sys(r).level) !== String(f.featureLevel)) return false;
      if (f.ability && sys(r).ability !== f.ability) return false;
      if (f.group === CONSUMABLES ? !r.consumable : (f.group && r.group !== f.group)) return false;
      if (f.category && r.folder !== f.category) return false;
      if (f.monsterLevel && levelName(sys(r)) !== f.monsterLevel) return false;
      if (f.creatureType && creatureType(sys(r)) !== f.creatureType) return false;
      if (f.solo && String(!!sys(r).details?.isSolo) !== f.solo) return false;
      return true;
    });

    // Filter choices from the data itself.
    const uniq = list => [...new Set(list.filter(v => v !== undefined && v !== null && v !== ""))];
    const opts = (values, selected, labels = {}) => values.map(v => ({ value: v, label: labels[v] ?? v, selected: String(v) === String(selected ?? "") }));
    const filters = [];
    for (const name of cfg.filters) {
      if (name === "level") filters.push({ name, label: "Level", options: opts([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], f.level, Object.fromEntries(ARNEYAN.spellLevels.map((l, i) => [i, i ? `${l} level` : "Cantrips"]))) });
      if (name === "class") filters.push({ name, label: "Class list", options: opts(uniq(all.flatMap(r => sys(r).classes ?? [])).sort(), f.class) });
      if (name === "school") filters.push({ name, label: "School", options: opts(uniq(all.map(r => sys(r).school)).sort(), f.school) });
      if (name === "path") filters.push({ name, label: "Path", options: opts(uniq(all.map(r => sys(r).path)).sort(), f.path) });
      if (name === "className") filters.push({ name, label: "Class", options: opts(uniq(all.map(r => (sys(r).className ?? "").replace(/\s*\(.*$/, ""))).sort(), f.className) });
      if (name === "featureLevel") filters.push({ name, label: "Level", options: opts(uniq(all.map(r => sys(r).level)).sort((a, b) => a - b), f.featureLevel) });
      if (name === "ability") filters.push({ name, label: "Attribute", options: opts(Object.keys(ARNEYAN.abilities), f.ability, ARNEYAN.abilities) });
      if (name === "group") filters.push({ name, label: "Group", options: opts(uniq(all.map(r => r.group)), f.group) });
      if (name === "category") filters.push({ name, label: cfg.docType === "Actor" ? "Group" : "Section", options: opts(uniq(all.filter(r => !f.group || (f.group === CONSUMABLES ? r.consumable : r.group === f.group)).map(r => r.folder)).sort(), f.category) });
      if (name === "monsterLevel") filters.push({ name, label: "Level", options: opts(uniq(all.map(r => levelName(sys(r)))), f.monsterLevel) });
      if (name === "creatureType") filters.push({ name, label: "Type", options: opts(uniq(all.map(r => creatureType(sys(r)))).sort(), f.creatureType) });
      if (name === "solo") filters.push({ name, label: "Solo", options: opts(["true", "false"], f.solo, { true: "Solo only", false: "No solos" }) });
    }

    return {
      tabs: Object.entries(TABS).filter(([, t]) => !t.gm || game.user.isGM).map(([id, t]) => ({ id, label: t.label, icon: t.icon, active: id === this.tab })),
      q: f.q ?? "", filters,
      // The Catalogue's groups as tabs to flick through, plus everything you use up.
      groupTabs: cfg.groups ? [{ value: "", label: "All" }, ...groupOrder(all).map(g => ({ value: g, label: g })), { value: CONSUMABLES, label: "Consumables" }]
        .map(g => ({ ...g, active: (f.group ?? "") === g.value })) : null,
      total: rows.length, shown: Math.min(rows.length, LIMIT), more: rows.length > LIMIT,
      rows: rows.slice(0, LIMIT).map(r => ({ ...r, meta: this.#meta(r), forgeable: ["weapon", "armour"].includes(r.type) })),
      actorName: cfg.docType === "Actor" ? "" : this.actor?.name ?? "", canAdd: cfg.docType !== "Actor" && !!this.actor?.isOwner,
      isBestiary: cfg.docType === "Actor", dragHint: cfg.docType === "Actor" ? "drag a row onto the map or into the Encounter Builder" : "drag a row onto a sheet"
    };
  }

  #meta(r) {
    const s = r.system ?? {};
    switch (this.tab) {
      case "equipment": return [r.folder, s.damage, s.ac ? `AC +${s.ac}` : "", s.price].filter(Boolean).join(" · ");
      case "spells": return [s.level === 0 ? "Cantrip" : `${ARNEYAN.spellLevels[s.level] ?? s.level} level`, s.school, s.save ? `${ARNEYAN.saveTypes[s.save]} save` : "", s.concentration ? "Concentration" : "", s.damage ? "Damage" : "", (s.classes ?? []).join(", ")].filter(Boolean).join(" · ");
      case "feats": return s.path ?? "";
      case "features": return [s.className, s.level ? `Level ${s.level}` : "", s.uses?.max ? `${s.uses.max}/${ARNEYAN.usesPer[s.uses.per] ?? ""}` : ""].filter(Boolean).join(" · ");
      case "skills": return ARNEYAN.abilities[s.ability] ?? "";
      case "classes": return [s.hitDie, ARNEYAN.bthProgressions[s.bthProgression]?.label, s.castingAbility ? `Casts with ${ARNEYAN.abilities[s.castingAbility]}` : ""].filter(Boolean).join(" · ");
      case "ancestries": return [ARNEYAN.sizes[s.size], s.speed ? `${s.speed}ft` : ""].filter(Boolean).join(" · ");
      case "kits": return s.className ?? "";
      case "actions": return s.toggle ? "Switch" : "Action";
      case "monsters": return [`Level ${levelName(s)}${s.details?.isSolo ? " solo" : ""}`, s.details?.type, `HD ${s.hd}`, `HP ${s.attributes?.hp?.max}`, `AC ${s.attributes?.ac}`, r.folder].filter(Boolean).join(" · ");
      default: return "";
    }
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const el = this.element;
    const search = el.querySelector("input[name=q]");
    let timer;
    search?.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => { this.filters.q = search.value; this.render().then(() => { const s = this.element.querySelector("input[name=q]"); s?.focus(); s?.setSelectionRange(s.value.length, s.value.length); }); }, 200);
    });
    for (const sel of el.querySelectorAll("select[data-filter]")) {
      sel.addEventListener("change", () => {
        this.filters[sel.dataset.filter] = sel.value;
        // A new group: its sections differ, so the old one goes.
        if (sel.dataset.filter === "group") delete this.filters.category;
        this.render();
      });
    }
    for (const row of el.querySelectorAll("[data-uuid][draggable]")) {
      row.addEventListener("dragstart", ev => ev.dataTransfer.setData("text/plain", JSON.stringify({ type: TABS[this.tab].docType ?? "Item", uuid: row.dataset.uuid })));
    }
  }

  static #onGroup(event, target) {
    this.filters.group = target.dataset.group ?? "";
    delete this.filters.category;
    this.render();
  }

  static #onTab(event, target) {
    this.tab = target.dataset.tab;
    this.filters = { q: this.filters.q ?? "" };
    this.render();
  }

  static #onClear() {
    this.filters = { q: "" };
    this.render();
  }

  static async #onView(event, target) {
    const doc = await fromUuid(target.closest("[data-uuid]").dataset.uuid);
    doc?.sheet.render(true);
  }

  static async #onForge(event, target) {
    const doc = await fromUuid(target.closest("[data-uuid]").dataset.uuid);
    return doc ? game.arneyan.forge(doc) : null;
  }

  static async #onEncounter(event, target) {
    return ArneyanEncounterBuilder.addFoe(target.closest("[data-uuid]").dataset.uuid);
  }

  static async #onAdd(event, target) {
    if (!this.actor || (!this.actor.isToken && !game.actors.has(this.actor.id))) return ui.notifications.info("Open the browser from a character sheet to add things, or drag a row onto a sheet.");
    const doc = await fromUuid(target.closest("[data-uuid]").dataset.uuid);
    if (!doc) return;
    const data = doc.toObject();
    delete data._id;
    data.folder = null;
    foundry.utils.setProperty(data, "_stats.compendiumSource", doc.uuid);
    await this.actor.createEmbeddedDocuments("Item", [data]);
    ui.notifications.info(`${doc.name} added to ${this.actor.name}.`);
  }
}

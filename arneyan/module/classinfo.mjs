/**
 * Class details: a read-only window for choosing a class, opened by clicking a class (the Browser, the sheet). The
 * item sheet is a GM's editing form ("Levels 1", "BtH +0"); a player wants to read what the class is and does:
 *   Overview   the key facts and a level 1 to 24 table (Base to Hit, abilities gained, Feats, spell slots)
 *   Abilities  every class ability by level, each opening to its full text
 *   Kits       the class's Kits and what each gives
 *   Handbook   the class's full text from the book
 * Opened from a character's sheet or the Browser adding to one, it has "Add to <name>" too.
 */
import { ARNEYAN } from "./config.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const SYS = "arneyan";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const TE = () => foundry.applications.ux.TextEditor.implementation;
const SLOT_LABELS = ["Cantrips", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const baseName = name => String(name ?? "").replace(/\s*\(.*\)$/, "");

/**
 * The level table's rows, pure (for tests): level, Base to Hit, abilities gained, whether a Feat comes then, and the
 * spell slots per day (only the columns the class ever uses).
 */
export function levelRows(sys, featureNames = {}) {
  const slots = sys.slotTable ?? [];
  const used = SLOT_LABELS.map((_, c) => slots.some(r => (r?.[c] ?? 0) > 0));
  const byLevel = {};
  for (const f of sys.features ?? []) (byLevel[f.level] ??= []).push(featureNames[f.uuid] ?? f.name);
  const feats = new Set(sys.featLevels ?? []);
  return {
    slotCols: SLOT_LABELS.filter((_, c) => used[c]),
    rows: Array.from({ length: 24 }, (_, i) => {
      const level = i + 1;
      return {
        level, bth: `+${ARNEYAN.bth(sys.bthProgression, level)}`,
        gains: [...new Set(byLevel[level] ?? [])].join(", "),
        feat: feats.has(level),
        slots: used.some(Boolean) ? (slots[i] ?? []).filter((_, c) => used[c]).map(n => n || "") : []
      };
    })
  };
}

/**
 * The Handbook's own "Key Attribute" line from a class's text ("Dexterity / Wisdom" for the Archer, whose Seeker adds
 * Wisdom to bow damage at 16th). The class's single key attribute field drives the rules (class DC) and stays as is.
 */
export function bookKeyAttribute(html) {
  const m = String(html ?? "").match(/Key Attribute\s*<\/t[dh]>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  return m ? m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
}

export class ArneyanClassInfo extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Open the details of a class (an Item of type class, from a compendium or a sheet). `actor`: offer "Add to". */
  static async open(cls, { actor = null } = {}) {
    if (!cls || cls.type !== "class") return null;
    const app = new ArneyanClassInfo({ id: `arneyan-class-${cls.id}-${foundry.utils.randomID(4)}` });
    app.cls = cls;
    app.actor = actor;
    app.tab = "overview";
    return app.render({ force: true });
  }

  static DEFAULT_OPTIONS = {
    classes: ["arneyan", "arn-classinfo-app"],
    position: { width: 760, height: 720 },
    window: { icon: "fa-solid fa-user-shield", resizable: true },
    actions: {
      ciTab: ArneyanClassInfo.#onTab,
      add: ArneyanClassInfo.#onAdd,
      openKit: ArneyanClassInfo.#onOpenKit,
      sheet: ArneyanClassInfo.#onSheet
    }
  };

  static PARTS = { main: { template: "systems/arneyan/templates/apps/class-info.hbs", scrollable: [".arn-ci-body"] } };

  get title() { return `Class: ${this.cls?.name ?? ""}`; }

  async _prepareContext() {
    // Loaded once: switching tabs only changes which part shows.
    this._data ??= await this.#load();
    const actor = this.actor && (this.actor.isToken || game.actors?.has(this.actor.id)) ? this.actor : null;
    return {
      ...this._data, tab: this.tab,
      actorName: actor?.name ?? "",
      canAdd: !!actor?.isOwner && actor.type === "character",
      already: !!actor?.items?.some(i => i.type === "class" && i.name === this.cls.name),
      isGM: game.user.isGM,
      tabs: [["overview", "Overview"], ["abilities", "Abilities"], ["kits", `Kits${this._data.kits.length ? ` (${this._data.kits.length})` : ""}`], ["handbook", "Handbook"]]
        .map(([id, label]) => ({ id, label, active: id === this.tab }))
    };
  }

  /** Everything the window shows, fetched and enriched once. */
  async #load() {
    const cls = this.cls;
    const sys = cls.system;
    const base = baseName(cls.name);
    const enrich = html => TE().enrichHTML(html ?? "", { relativeTo: cls });
    // The class abilities (compendium items), in level order, each with its own text.
    const docs = await Promise.all((sys.features ?? []).map(f => (f.uuid ? fromUuid(f.uuid).catch(() => null) : null)));
    const names = {};
    const abilities = [];
    for (const [i, f] of (sys.features ?? []).entries()) {
      const d = docs[i];
      if (d) names[f.uuid] = d.name;
      abilities.push({ level: f.level, levelLabel: f.level ? `${ordinal(f.level)} level` : "Any level", name: d?.name ?? f.name, uuid: f.uuid,
        text: d ? await enrich(d.system.description) : "", uses: d?.system?.uses?.max ? `${d.system.uses.max} ${String(ARNEYAN.usesPer?.[d.system.uses.per] ?? d.system.uses.per).toLowerCase()}` : "" });
    }
    abilities.sort((a, b) => a.level - b.level);
    const levels = [];
    for (const a of abilities) {
      const last = levels.at(-1);
      if (last?.level === a.level) last.items.push(a); else levels.push({ level: a.level, label: a.levelLabel, items: [a] });
    }
    // Its Kits from the compendium ("Deity: Bane (Cleric)" reads "Bane", under "Deity").
    const kits = [];
    const pack = game.packs.get(`${SYS}.kits`);
    if (pack) {
      const index = await pack.getIndex({ fields: ["system.className"] });
      const mine = [...index].filter(e => (e.system?.className ?? "") === base);
      const loaded = await Promise.all(mine.map(e => pack.getDocument(e._id).catch(() => null)));
      for (const k of loaded) {
        if (!k) continue;
        const m = k.name.match(/^([^:()]+):\s*(.+)$/);
        kits.push({ uuid: k.uuid, name: (m ? m[2] : k.name).replace(new RegExp(`\\s*\\(${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)$`), ""),
          group: m ? m[1] : "", text: await enrich(k.system.description),
          features: (k.system.features ?? []).map(f => ({ name: f.name, level: f.level ? ordinal(f.level) : "" })) });
      }
      kits.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
    }
    const table = levelRows(sys, names);
    const facts = [
      ["Hit Die", sys.hitDie],
      ["HP beyond 10th", `+${sys.hpBeyond10} a level, plus Constitution`],
      ["Key attribute", bookKeyAttribute(sys.description) || (ARNEYAN.abilities[sys.keyAbility] ?? sys.keyAbility)],
      ["Spellcasting", sys.castingAbility ? `Casts with ${ARNEYAN.abilities[sys.castingAbility] ?? sys.castingAbility}` : "None"],
      ["Base to Hit", ARNEYAN.bthProgressions[sys.bthProgression]?.label ?? sys.bthProgression],
      ["Weapons", sys.weapons || "None listed"],
      ["Armour", sys.armour || "None listed"],
      ["Feats", `${(sys.featPaths ?? []).join(", ") || "General Path"}; at levels ${(sys.featLevels ?? []).join(", ")}`],
      ["XP per level", sys.xpRate]
    ].map(([label, value]) => ({ label, value }));
    return {
      img: cls.img, name: cls.name, facts, table, levels, kits,
      sub: [`Hit Die ${sys.hitDie}`, ARNEYAN.bthProgressions[sys.bthProgression]?.label ?? "", sys.castingAbility ? `casts with ${ARNEYAN.abilities[sys.castingAbility]}` : ""].filter(Boolean).join(" · "),
      handbook: await enrich(sys.description)
    };
  }

  static async #onTab(event, target) {
    this.tab = target.dataset.tab;
    await this.render();
    // Each tab starts at its top.
    const body = this.element?.querySelector(".arn-ci-body");
    if (body) body.scrollTop = 0;
  }

  static async #onAdd() {
    if (!this.actor) return;
    const { addToActor } = await import("./browser.mjs");
    await addToActor(this.actor, this.cls);
    this.close();
  }

  static async #onOpenKit(event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    doc?.sheet?.render(true);
  }

  static #onSheet() { this.cls?.sheet?.render(true); }
}

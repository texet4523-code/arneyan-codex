// Minimal Foundry mocks so the data models and templates can be exercised outside Foundry.
import Handlebars from "handlebars";
import fs from "node:fs";
import path from "node:path";

Math.clamp = (n, a, b) => Math.min(Math.max(n, a), b);

class Field { constructor(opts = {}) { this.opts = opts; } initial() { return typeof this.opts.initial === "function" ? this.opts.initial() : this.opts.initial; } }
class SchemaField extends Field { constructor(fields, opts) { super(opts); this.fields = fields; } initial() { return Object.fromEntries(Object.entries(this.fields).map(([k, f]) => [k, f.initial()])); } }
class ArrayField extends Field { initial() { return []; } }
const fields = { NumberField: Field, StringField: Field, HTMLField: Field, BooleanField: Field, SchemaField, ArrayField, ObjectField: Field };

function build(schema, src = {}) {
  const out = {};
  for (const [k, f] of Object.entries(schema)) {
    if (f instanceof SchemaField) out[k] = build(f.fields, src[k] ?? {});
    else out[k] = src[k] !== undefined ? src[k] : f.initial();
  }
  return out;
}

class TypeDataModel {
  constructor(src = {}, parent) {
    Object.assign(this, build(this.constructor.defineSchema(), src));
    Object.defineProperty(this, "parent", { value: parent, enumerable: false });
  }
}

class BaseSheet { async _prepareContext() { return {}; } }
globalThis.game = { combat: null, user: { targets: new Set() }, settings: { get: () => "publicroll" } };
globalThis.foundry = {
  data: { fields }, abstract: { TypeDataModel },
  utils: { escapeHTML: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])), deepClone: o => JSON.parse(JSON.stringify(o)), getProperty: (o, k) => k.split(".").reduce((x, y) => x?.[y], o), setProperty: (o, k, v) => { const p = k.split("."); let t = o; while (p.length > 1) { const x = p.shift(); t = t[x] ??= {}; } t[p[0]] = v; } },
  applications: {
    api: { HandlebarsApplicationMixin: B => B, DialogV2: {}, ApplicationV2: BaseSheet },
    sheets: { ActorSheetV2: BaseSheet, ItemSheetV2: BaseSheet },
    ux: { TextEditor: { implementation: { enrichHTML: async h => h ?? "" } } }
  }
};

/** Run a sheet's real _prepareContext against a mock document. */
export async function sheetContext(SheetClass, doc, extra = {}) {
  const sheet = Object.create(SheetClass.prototype);
  Object.assign(sheet, { document: doc, isEditable: true, _activeTab: "main", _expanded: new Set(), ...extra });
  return sheet._prepareContext({});
}

export function makeItem(Model, type, name, src) {
  const item = { type, name, id: name.replace(/\W/g, ""), sort: 0 };
  item.system = new Model(src, item);
  item.system.prepareDerivedData?.();
  item.toDragData = () => ({});
  item._source = { system: JSON.parse(JSON.stringify(build(Model.defineSchema(), src))) };
  item.isOwner = true;
  return item;
}

export function makeActor(Model, type, src, items = [], effects = []) {
  const actor = { type, name: "Test", items, img: "x.png", isOwner: true, getRollData: () => ({}),
    attackBonus: () => 3, damageLabel: w => `${w.system.damage}+2`, attackParts: () => [{ label: "Str", value: 3 }] };
  actor.effects = effects;
  effects.contents = effects;
  for (const i of items) {
    i.actor = actor;
    if (type === "spell" || i.type === "spell") Object.defineProperty(i, "caster", { get: () => actor.system.casters?.find(c => c.name === i.system.className) ?? actor.system.casters?.[0] ?? null });
  }
  actor.items.get = id => items.find(i => i.id === id);
  actor.system = new Model(src, actor);
  actor.system.prepareDerivedData();
  actor._source = { system: JSON.parse(JSON.stringify(build(Model.defineSchema(), src))) };
  return actor;
}

/** Handlebars with stand-ins for Foundry's helpers. */
export function hbs(root) {
  const h = Handlebars.create();
  h.registerHelper("eq", (a, b) => a === b);
  h.registerHelper("gt", (a, b) => a > b);
  h.registerHelper("or", (...a) => a.slice(0, -1).some(Boolean));
  h.registerHelper("checked", v => (v ? "checked" : ""));
  h.registerHelper("selectOptions", (choices, opts) => {
    const sel = opts.hash.selected;
    // Foundry's `blank` option: an empty first choice with that label.
    const blank = opts.hash.blank != null ? `<option value="" ${sel ? "" : "selected"}>${opts.hash.blank}</option>` : "";
    return new Handlebars.SafeString(blank + Object.entries(choices).map(([k, v]) => `<option value="${k}" ${String(k) === String(sel) ? "selected" : ""}>${v}</option>`).join(""));
  });
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(root).filter(f => f.endsWith(".hbs"))) {
    const rel = "systems/arneyan/" + path.relative(root, f).replaceAll(path.sep, "/");
    h.registerPartial(rel, fs.readFileSync(f, "utf8"));
  }
  return (rel, ctx) => h.compile(fs.readFileSync(path.join(root, rel), "utf8"), { strict: false })(ctx);
}

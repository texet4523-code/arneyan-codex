// Strict offline validation of every compendium document against the system's own data models
// (with field rules mirroring Foundry's: types, integers, min/max, choices, nullability) plus
// the core Folder / JournalEntry / Item shape Foundry checks when it opens a pack.
import fs from "node:fs";
import path from "node:path";

Math.clamp = (n, a, b) => Math.min(Math.max(n, a), b);
const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

class Field {
  constructor(opts = {}) { this.o = opts; }
  initial() { return typeof this.o.initial === "function" ? this.o.initial() : this.o.initial; }
  validate(v, where) {
    if (v === undefined) return; // missing values take the initial
    if (v === null) { if (this.o.nullable === false || (this.o.nullable === undefined && this.o.required)) err(where, "null not allowed"); return; }
    this._check(v, where);
  }
  _check() {}
}
class NumberField extends Field {
  _check(v, w) {
    if (typeof v !== "number" || Number.isNaN(v)) return err(w, `not a number: ${JSON.stringify(v)}`);
    if (this.o.integer && !Number.isInteger(v)) err(w, `not an integer: ${v}`);
    if (this.o.min !== undefined && v < this.o.min) err(w, `below min ${this.o.min}: ${v}`);
    if (this.o.max !== undefined && v > this.o.max) err(w, `above max ${this.o.max}: ${v}`);
  }
}
class StringField extends Field {
  _check(v, w) {
    if (typeof v !== "string") return err(w, `not a string: ${JSON.stringify(v)}`);
    if (v === "" && this.o.blank === false) err(w, "blank not allowed");
    if (this.o.choices) {
      const c = typeof this.o.choices === "function" ? this.o.choices() : this.o.choices;
      const keys = Array.isArray(c) ? c : Object.keys(c);
      if (!keys.includes(v) && !(v === "" && this.o.blank)) err(w, `"${v}" not in choices [${keys.join(", ")}]`);
    }
  }
}
class HTMLField extends StringField {}
class BooleanField extends Field { _check(v, w) { if (typeof v !== "boolean") err(w, `not boolean: ${v}`); } }
class ObjectField extends Field { _check(v, w) { if (typeof v !== "object" || Array.isArray(v)) err(w, "not an object"); } }
class SchemaField extends Field {
  constructor(fields, o) { super(o); this.fields = fields; }
  initial() { return Object.fromEntries(Object.entries(this.fields).map(([k, f]) => [k, f.initial()])); }
  _check(v, w) {
    if (typeof v !== "object" || Array.isArray(v)) return err(w, "not an object");
    for (const [k, f] of Object.entries(this.fields)) f.validate(v[k], `${w}.${k}`);
    for (const k of Object.keys(v)) if (!(k in this.fields)) err(w, `unknown key "${k}"`);
  }
}
class ArrayField extends Field {
  constructor(el, o) { super(o); this.el = el; }
  initial() { return []; }
  _check(v, w) { if (!Array.isArray(v)) return err(w, "not an array"); v.forEach((x, i) => this.el.validate(x, `${w}[${i}]`)); }
}
globalThis.foundry = { data: { fields: { NumberField, StringField, HTMLField, BooleanField, SchemaField, ArrayField, ObjectField } }, abstract: { TypeDataModel: class {} } };

const IM = await import("../arneyan/module/data/item-models.mjs");
const models = {
  class: IM.ClassData, ancestry: IM.AncestryData, kit: IM.KitData, feat: IM.FeatData, skill: IM.SkillData,
  ability: IM.AbilityData, weapon: IM.WeaponData, armour: IM.ArmourData, equipment: IM.EquipmentData, spell: IM.SpellData
};
const AM = await import("../arneyan/module/data/actor-models.mjs");
const actorModels = { npc: AM.NpcData, character: AM.CharacterData };
const checkImg = (w, img) => {
  if (!img) err(w, "no img");
  else if (img.startsWith("systems/arneyan/") && !fs.existsSync(path.join(sysRoot, img.replace("systems/arneyan/", "")))) err(w, `img missing ${img}`);
};
const sys = JSON.parse(fs.readFileSync(new URL("../arneyan/system.json", import.meta.url)));
const held = JSON.parse(fs.readFileSync(new URL("../build/held-back-packs.json", import.meta.url)));
const sysRoot = new URL("../arneyan/", import.meta.url).pathname;
const ID = /^[a-zA-Z0-9]{16}$/;

const src = new URL("../packs-src/", import.meta.url).pathname;
let count = 0;
for (const pack of fs.readdirSync(src)) {
  // A pack held back from release (build/held-back-packs.json; none at the moment) is still checked against its own entry.
  const decl = sys.packs.find(p => p.name === pack) ?? held.packs.find(p => p.name === pack);
  if (!decl) err(pack, "pack not declared in system.json");
  const docs = fs.readdirSync(path.join(src, pack)).map(f => JSON.parse(fs.readFileSync(path.join(src, pack, f))));
  const ids = new Set();
  const folderIds = new Set(docs.filter(d => d._key.startsWith("!folders!")).map(d => d._id));
  for (const d of docs) {
    count++;
    const w = `${pack}/${d.name || d._id}`;
    if (!ID.test(d._id)) err(w, `bad _id ${d._id}`);
    if (ids.has(d._id)) err(w, `duplicate _id ${d._id}`);
    ids.add(d._id);
    if (typeof d.name !== "string" || !d.name.trim()) err(w, "missing name");
    if (d.folder !== null && d.folder !== undefined && !folderIds.has(d.folder)) err(w, `folder ${d.folder} missing`);
    if (d.sort !== undefined && !Number.isInteger(d.sort)) err(w, "sort not integer");
    const kind = d._key.split("!")[1];
    if (kind === "folders") {
      if (d._key !== `!folders!${d._id}`) err(w, "bad key");
      if (d.type !== decl?.type) err(w, `folder type ${d.type} != pack type ${decl?.type}`);
      if (!["a", "m"].includes(d.sorting)) err(w, "bad sorting");
      if (d.color !== null && !/^#[0-9a-fA-F]{6}$/.test(d.color)) err(w, "bad colour");
    } else if (kind === "items") {
      if (decl?.type !== "Item") err(w, "item in non-Item pack");
      if (!models[d.type]) { err(w, `unknown item type ${d.type}`); continue; }
      new SchemaField(models[d.type].defineSchema()).validate(d.system, `${w}.system`);
      if (!d.img) err(w, "no img");
      else if (d.img.startsWith("systems/arneyan/") && !fs.existsSync(path.join(sysRoot, d.img.replace("systems/arneyan/", "")))) err(w, `img missing ${d.img}`);
      if (!Array.isArray(d.effects)) err(w, "effects not array");
    } else if (kind === "actors") {
      if (decl?.type !== "Actor") err(w, "actor in non-Actor pack");
      if (!actorModels[d.type]) { err(w, `unknown actor type ${d.type}`); continue; }
      new SchemaField(actorModels[d.type].defineSchema()).validate(d.system, `${w}.system`);
      checkImg(w, d.img);
      const t = d.prototypeToken ?? {};
      checkImg(`${w} token`, t.texture?.src);
      if (!(t.width > 0 && t.height > 0)) err(w, "bad token size");
      if (![-2, -1, 0, 1].includes(t.disposition ?? 0)) err(w, "bad token disposition");
      const iids = new Set();
      for (const it of d.items ?? []) {
        const iw = `${w} > ${it.name}`;
        if (!ID.test(it._id)) err(iw, "bad item id");
        if (iids.has(it._id)) err(iw, "duplicate item id");
        iids.add(it._id);
        if (it._key !== `!actors.items!${d._id}.${it._id}`) err(iw, "bad item key");
        if (!it.name?.trim()) err(iw, "item has no name");
        if (!models[it.type]) { err(iw, `unknown item type ${it.type}`); continue; }
        new SchemaField(models[it.type].defineSchema()).validate(it.system, `${iw}.system`);
        checkImg(iw, it.img);
        if (/@(Check|Damage|Condition|UUID)\[[^\]]*$/.test(it.system.description ?? "")) err(iw, "unclosed enricher");
      }
    } else if (kind === "journal") {
      if (decl?.type !== "JournalEntry") err(w, "journal in non-Journal pack");
      if (!Array.isArray(d.pages) || !d.pages.length) err(w, "no pages");
      const pids = new Set();
      for (const p of d.pages ?? []) {
        const pw = `${w} > ${p.name}`;
        if (!ID.test(p._id)) err(pw, "bad page id");
        if (pids.has(p._id)) err(pw, "duplicate page id");
        pids.add(p._id);
        if (p._key !== `!journal.pages!${d._id}.${p._id}`) err(pw, "bad page key");
        if (!p.name?.trim()) err(pw, "page has no name");
        if (p.type !== "text" || p.text?.format !== 1 || typeof p.text?.content !== "string") err(pw, "bad text page");
        if (!Number.isInteger(p.title?.level) || p.title.level < 1 || p.title.level > 6) err(pw, "bad title level");
      }
    } else if (kind === "tables") {
      // Roll tables: a formula, results that cover its range, links that point at real compendium entries.
      if (decl?.type !== "RollTable") err(w, "table in non-RollTable pack");
      if (!/^\d*d\d+$/.test(d.formula ?? "")) err(w, `bad formula ${d.formula}`);
      checkImg(w, d.img);
      const rids = new Set();
      for (const r of d.results ?? []) {
        const rw = `${w} > ${r.name || r._id}`;
        if (!ID.test(r._id) || rids.has(r._id)) err(rw, "bad or duplicate result id");
        rids.add(r._id);
        if (r._key !== `!tables.results!${d._id}.${r._id}`) err(rw, "bad result key");
        if (!["text", "document"].includes(r.type)) err(rw, `bad result type ${r.type}`);
        if (!Array.isArray(r.range) || r.range.length !== 2 || r.range[0] > r.range[1]) err(rw, "bad range");
        checkImg(rw, r.img);
        for (const u of [r.documentUuid, ...[...(r.description ?? "").matchAll(/@UUID\[([^\]]+)\]/g)].map(m => m[1])].filter(Boolean)) {
          const [, pk, , id] = u.match(/^Compendium\.arneyan\.([\w-]+)\.(\w+)\.(\w+)$/) ?? [];
          const there = pk && fs.existsSync(path.join(src, pk)) && fs.readdirSync(path.join(src, pk)).some(f => f.endsWith(`_${id}.json`));
          if (!there) err(rw, `link to a missing entry ${u}`);
        }
      }
      if (!d.results?.length) err(w, "no results");
    } else err(w, `unexpected key ${d._key}`);
  }
}
// The compiled packs exist for every declared pack.
for (const p of sys.packs) if (!fs.existsSync(path.join(sysRoot, p.path, "CURRENT"))) err(p.name, "compiled pack missing");

if (errors.length) {
  console.log(`${errors.length} problems in ${count} documents:`);
  console.log([...new Set(errors)].slice(0, 60).join("\n"));
  process.exit(1);
}
console.log(`All ${count} compendium documents valid.`);

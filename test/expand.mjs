// 0.10.42: click a row to read it (facts, description, Show in chat, Open); right-click opens the item's window.
import assert from "node:assert/strict";
import fs from "node:fs";
import { hbs } from "./harness.mjs";
const root = new URL("../arneyan/", import.meta.url).pathname;
const { itemFacts, bindItemWindows } = await import("../arneyan/module/expand.mjs");

const w = { type: "weapon", system: { damage: "1d8", damageType: "slashing", range: "", ranged: false, traits: "Versatile", magic: 1, quantity: 1, totalSlots: 1, price: "15 gp", bonusDamage: [{ formula: "1d6", type: "fire", when: "" }] } };
const f = itemFacts(w, { gm: false });
for (const t of ["1d8", "+1", "Melee", "Versatile", "+1d6", "1 slot", "15 gp"]) assert.ok(f.some(x => x.includes(t)), t);
assert.ok(itemFacts({ type: "weapon", system: { ...w.system, ranged: true, range: "80/320" } }).includes("Range 80/320"));
assert.ok(itemFacts({ type: "armour", system: { category: "shield", ac: 1, totalSlots: 1, quantity: 1 } })[0].startsWith("Shield, AC +1"));
assert.ok(itemFacts({ type: "equipment", system: { charges: { value: 3, max: 7 }, quantity: 2, totalSlots: 0.2 } }).includes("3/7 charges"));
assert.ok(itemFacts({ type: "equipment", system: { container: { holds: true, capacity: 10, weightless: true }, quantity: 1, totalSlots: 1 } }).some(x => x.includes("Holds 10 slots, weightless")));
assert.ok(itemFacts({ type: "spell", system: { level: 0, school: "Evocation", range: "60ft" } }).includes("Cantrip"));
// Unidentified: players see nothing that gives it away; the GM sees it all.
const hidden = { type: "weapon", system: { ...w.system, identified: false } };
assert.deepEqual(itemFacts(hidden, { gm: false }), ["1 slot"]);
assert.ok(itemFacts(hidden, { gm: true }).includes("+1"));

// The panel.
const html = hbs(root)("templates/actor/item-expand.hbs", { facts: ["1d8 Slashing"], desc: "<p>A sword.</p>" });
for (const s of ["1d8 Slashing", "A sword.", 'data-action="itemChat"', 'data-action="itemEdit"']) assert.ok(html.includes(s), s);
assert.ok(hbs(root)("templates/actor/item-expand.hbs", { facts: [], desc: "" }).includes("No description."));

// Right-click a row: its item's window, once per sheet however often it draws.
const listeners = [];
const opened = [];
const el = { addEventListener: (t, fn) => listeners.push([t, fn]) };
const app = { element: el, document: { items: { get: id => (id === "i1" ? { sheet: { render: () => opened.push(id) } } : null) } } };
bindItemWindows(app); bindItemWindows(app);
assert.equal(listeners.length, 1);
const ev = (row, extra = null) => ({ target: { closest: s => (s.startsWith("input") ? extra : row) }, preventDefault() { this.pd = true; }, stopPropagation() {} });
const e1 = ev({ dataset: { itemId: "i1" } }); listeners[0][1](e1);
assert.deepEqual(opened, ["i1"]); assert.ok(e1.pd);
listeners[0][1](ev({ dataset: { itemId: "i1" } }, {})); // on a field: left alone
assert.equal(opened.length, 1);

// Every list opens rows in place now: gear, skills, ancestry, kits, containers, the party stash and storage.
const sheet = fs.readFileSync(`${root}templates/actor/actor-sheet.hbs`, "utf8");
assert.ok(!sheet.includes('<div class="arn-expand">{{{desc}}}</div>{{/if}}\n          </li>'));
assert.ok(sheet.includes('<a class="arn-container-name" data-action="itemExpand"'));
assert.ok(sheet.includes('data-action="itemExpand" data-tooltip="Show details">{{item.name}}</a>\n            <span class="arn-muted arn-meta">{{abbr}}'));
assert.ok(fs.readFileSync(`${root}templates/actor/gear-row.hbs`, "utf8").includes('data-action="itemExpand"'));
for (const t of ["party-sheet.hbs", "storage-sheet.hbs"]) assert.ok(fs.readFileSync(`${root}templates/actor/${t}`, "utf8").includes("item-expand.hbs"), t);
console.log("OK expand");
// Review fixes: a container's open panel finds its item; thrown and ranged weapons; no Level chip on basic actions.
assert.ok(fs.readFileSync(`${root}templates/actor/actor-sheet.hbs`, "utf8").includes('data-container-id="{{id}}" data-item-id="{{id}}"'));
assert.deepEqual(itemFacts({ type: "weapon", system: { damage: "1d4", damageType: "piercing", range: "20/60", ranged: false } }).slice(1, 3), ["Melee", "Thrown 20/60"]);
assert.ok(itemFacts({ type: "weapon", system: { damage: "1d6", damageType: "piercing", range: "", ranged: true } }).includes("Ranged"));
assert.ok(!itemFacts({ type: "ability", system: { level: 1, className: "" } }).some(x => /Level/.test(x)));
console.log("OK expand review fixes");

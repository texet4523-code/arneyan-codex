// R-F50 (K213, K221): the ledgers. Soul Tax, running illusions, the Artificer's workshop.
import assert from "node:assert/strict";
import fs from "node:fs";
import Handlebars from "handlebars";
import "./harness.mjs";
const L = await import("../arneyan/module/ledgers.mjs");

/* Soul Tax: half the cap free (rounded up); beyond, slots, at most half your slots (rounded up). */
assert.deepEqual(L.soulTax([1, 1, 2, 3], 9, 7), { held: 7, cap: 9, free: 5, over: 2, slotCap: 4, count: 4 });
assert.equal(L.soulTax([1], 4).over, 0);

/* The workshop's limits by kit. */
assert.deepEqual(L.workshopLimit("Infuser", 5, 3), { what: "Infused items", max: 3, lasts: "rest" });
assert.equal(L.workshopLimit("Infuser", 2, 3).lasts, "hours", "1 hour per level until Sustained Working (3rd)");
assert.equal(L.workshopLimit("Gadgeteer", 6, 3).max, 6); assert.equal(L.workshopLimit("Gadgeteer", 7, 3).max, 7, "Expanded Toolkit: one more");
assert.equal(L.workshopLimit("Alchemist", 4, 2).max, 6);
assert.equal(L.workshopLimit("Armourer", 2, 2).max, 1); assert.equal(L.workshopLimit("Armourer", 3, 2).max, 2);
assert.equal(L.workshopLimit("Construct Engineer", 5, 3), null, "the construct is a companion, not a workshop list");
assert.equal(L.endsAt({ lasts: "hours" }, 1000, 2), 1000 + 7200);
assert.equal(L.endsAt({ lasts: "rest" }, 1000, 5), null);

/* The kit's known options, from its Workshop headings. */
const kit = { type: "kit", name: "Gadgeteer (Artificer)", system: { description: "<h3>Gadgeteer: Known Gadgets</h3><h4>Smoke Bomb</h4><p>x</p><h4>Grapnel Line (reusable)</h4>" } };
assert.deepEqual(L.knownOptions({ items: [kit] }), ["Smoke Bomb", "Grapnel Line"]);
assert.equal(L.kitOf({ items: [kit] }), "Gadgeteer");

/* Illusions: Illusion spells only. */
assert.equal(L.isIllusion({ type: "spell", system: { school: "Illusion" } }), true);
assert.equal(L.isIllusion({ type: "spell", system: { school: "Evocation" } }), false);

/* The sheet: a Necromancer's Soul Tax line from its raised undead; an Illusionist's list; an Artificer's workshop. */
const necro = { id: "n", type: "character", items: [{ type: "class", name: "Necromancer", system: { levels: 5 } }],
  system: { abilities: { int: { mod: 3 } }, casters: [{ name: "Necromancer", slots: [{ level: 0, total: 4 }, { level: 1, total: 4 }, { level: 2, total: 3 }, { level: 3, total: 2 }] }] }, getFlag: () => null };
const undead = (level) => ({ flags: { arneyan: { companion: { master: "n", preset: "raisedUndead" } } }, system: { level } });
globalThis.game.actors = { filter: f => [undead(1), undead(1), undead(3), undead(5)].filter(f) };
let ctx = L.ledgerContext(necro).ledgers;
assert.deepEqual([ctx.soulTax.held, ctx.soulTax.cap, ctx.soulTax.free, ctx.soulTax.over, ctx.soulTax.slotCap], [7, 8, 4, 3, 5]);
assert.match(ctx.soulTax.overText, /3 points beyond it need slots/);
assert.equal(ctx.illusionist, false); assert.equal(ctx.workshop, null);
const necroTax = ctx.soulTax;
const flags = { illusions: [{ id: "i1", name: "Phantasmal Force", concentration: true, seen: ["Goblin"] }], workshop: [{ id: "w1", name: "Smoke Bomb", at: 0, until: null, lasts: "used" }] };
const art = { id: "a", type: "character", items: [{ type: "class", name: "Illusionist", system: { levels: 1 } }, { type: "class", name: "Artificer", system: { levels: 4 } }, kit],
  system: { abilities: { int: { mod: 2 } }, casters: [] }, getFlag: (s, k) => flags[k] };
globalThis.game.actors = { filter: () => [] };
ctx = L.ledgerContext(art).ledgers;
assert.equal(ctx.illusions.length, 1);
assert.deepEqual([ctx.workshop.what, ctx.workshop.max, ctx.workshop.count, ctx.workshop.rows[0].left], ["Built gadgets", 4, 1, "until used"]);

/* The template renders all three. */
Handlebars.registerHelper("eq", (a, b) => a === b);
// An Illusionist with nothing running still has the list (and its + button).
const tplSrc = fs.readFileSync(new URL("../arneyan/templates/actor/ledgers.hbs", import.meta.url), "utf8");
assert.match(Handlebars.compile(tplSrc)({ editable: true, ledgers: { illusionist: true, illusions: [] } }), /data-action="illusionAdd"[\s\S]*None running/);
const tpl = Handlebars.compile(fs.readFileSync(new URL("../arneyan/templates/actor/ledgers.hbs", import.meta.url), "utf8"));
const html = tpl({ editable: true, ledgers: { ...ctx, soulTax: necroTax } });
assert.match(html, /Undead Mastery: <strong>7<\/strong> of 8 points/);
assert.match(html, /Phantasmal Force/); assert.match(html, /Seen through by Goblin/);
assert.match(html, /Workshop: Built gadgets 1\/4/); assert.match(html, /data-action="workEnd"/);
assert.equal(L.ledgerContext({ type: "npc" }).ledgers, undefined);
delete globalThis.game.actors;
console.log("ledgers: ok");

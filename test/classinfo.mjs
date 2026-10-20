// 0.10.19: Class details, the read-only window a class opens (Browser, sheet): its level table and its template.
import assert from "node:assert/strict";
import fs from "node:fs";
import { hbs } from "./harness.mjs";

const root = new URL("../arneyan/", import.meta.url).pathname;
const dir = new URL("../packs-src/classes/", import.meta.url).pathname;
const cls = name => fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(dir + f))).find(d => d.name === name);
const C = await import("../arneyan/module/classinfo.mjs");

// Fighter: Base to Hit by level, abilities at their levels, Feats, no spell columns.
{
  const f = cls("Fighter");
  const t = C.levelRows(f.system);
  assert.equal(t.rows.length, 24);
  assert.deepEqual(t.slotCols, [], "a Fighter has no spell slots");
  assert.equal(t.rows[0].bth, "+0"); assert.equal(t.rows[11].bth, "+8", "+8 at 12th (Martial)"); assert.equal(t.rows[23].bth, "+16");
  assert.ok(t.rows[0].gains.includes("Weapon Specialisation") && t.rows[3].gains.includes("Combat Dominance"));
  assert.deepEqual(t.rows.filter(r => r.feat).map(r => r.level), f.system.featLevels);
}
// Wizard: the slot columns it uses, cantrips first.
{
  const w = cls("Wizard");
  const t = C.levelRows(w.system);
  assert.equal(t.slotCols[0], "Cantrips");
  assert.ok(t.slotCols.includes("9th"), "a Wizard reaches 9th-level slots");
  assert.equal(t.rows[0].slots.length, t.slotCols.length);
  assert.equal(t.rows[0].slots[0], w.system.slotTable[0][0], "cantrips at 1st");
}
// The template: tabs, facts, the level table, and Add only when adding to a character.
{
  const render = hbs(root);
  const f = cls("Fighter");
  const ctx = { name: "Fighter", img: "x.webp", sub: "Hit Die d10", tab: "overview", facts: [{ label: "Hit Die", value: "d10" }], table: C.levelRows(f.system),
    levels: [], kits: [], handbook: "<p>Book text</p>", canAdd: true, already: false, actorName: "Rowan", isGM: false,
    tabs: [{ id: "overview", label: "Overview", active: true }, { id: "abilities", label: "Abilities" }, { id: "kits", label: "Kits" }, { id: "handbook", label: "Handbook" }] };
  const html = render("templates/apps/class-info.hbs", ctx);
  assert.ok(html.includes("Level by level") && html.includes("Add to Rowan") && html.includes("Weapon Specialisation"));
  assert.ok(!html.includes('data-action="sheet"'), "players don't get the editing sheet button");
  const book = render("templates/apps/class-info.hbs", { ...ctx, tab: "handbook", canAdd: false });
  assert.ok(book.includes("Book text") && !book.includes("Add to"));
  for (const t of [html, book]) assert.ok(!t.includes("—"), "no em dashes in the window");
  // Foundry 14 handles data-action="tab" itself: the window's tabs must use their own action, or clicks do nothing.
  assert.ok(html.includes('data-action="ciTab"') && !html.includes('data-action="tab"'));
  assert.ok(C.ArneyanClassInfo.DEFAULT_OPTIONS.actions.ciTab && !C.ArneyanClassInfo.DEFAULT_OPTIONS.actions.tab);
  const brTpl = fs.readFileSync(root + "templates/apps/browser.hbs", "utf8");
  assert.ok(brTpl.includes('data-action="brTab"') && !brTpl.includes('data-action="tab"'), "the Browser's tabs too");
}
console.log("OK class details");

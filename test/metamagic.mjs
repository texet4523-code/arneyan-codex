// R-F50 (K213, K221): Metamagic on the spell card.
import assert from "node:assert/strict";
import "./harness.mjs";
const M = await import("../arneyan/module/metamagic.mjs");
const feat = (name, acts = [], count = null) => ({ type: "ability", name, system: { activities: acts }, availableActivities: acts, usesCount: count });
const sorc = (lvl, surges, known) => ({ type: "character", uuid: "Actor.s", items: [{ type: "class", name: "Sorcerer", system: { levels: lvl } },
  feat("Metamagic", [{ name: "Spellburn", kind: "burn" }, { name: "Wild Surge", kind: "note", cost: 1 }, { name: "Corruption roll", kind: "roll" }], { value: surges, max: 2 }),
  feat("Metamagic Options", known.map(name => ({ name, text: `${name} text` }))), feat("Overchannel", [{ name: "Overchannel", kind: "burn", formula: "level" }])] });
const spell = level => ({ type: "spell", name: "Fire Bolt", system: { level } });

/* The options known (the picked ones are what availableActivities gives), the surges left, Overchannel for a levelled spell. */
let info = M.metamagicFor(sorc(8, 2, ["Twinned Spell", "Empowered Spell", "Quickened Spell"]), spell(3));
assert.deepEqual(info.options.map(o => o.name), ["Twinned Spell", "Empowered Spell", "Quickened Spell"]);
assert.equal(info.surges, 2); assert.equal(info.twice, false);
assert.doesNotMatch(M.metamagicHtml(sorc(8, 2, ["Twinned Spell"]), spell(3)), /Overchannel/, "Overchannel is for a spell with no slot left: its own feature");
assert.equal(M.metamagicFor({ type: "character", items: [] }, spell(1)), null, "not a Sorcerer");
assert.equal(M.metamagicHtml({ type: "character", items: [] }, spell(1)), "");

/* The card's row: Spellburn 2 and Wild Surge for each, Wild Surge off with none left. */
let html = M.metamagicHtml(sorc(3, 0, ["Distant Spell"]), spell(1));
assert.match(html, /data-pay="burn" data-option="Distant Spell"/);
assert.match(html, /data-pay="surge" data-option="Distant Spell" disabled/);
assert.match(html, /Wild Surge \(0 left\)/);

/* One option per spell; two at 20th. */
assert.equal(M.optionsLeft([], false), 1); assert.equal(M.optionsLeft(["Twinned Spell"], false), 0);
assert.equal(M.optionsLeft(["Twinned Spell"], true), 1); assert.equal(M.optionsLeft(["a", "b"], true), 0);
assert.equal(M.optionsLeft(["Twinned Spell"], true, true), 0, "the second option once a day");
assert.equal(M.optionsLeft([], true, true), 1);
console.log("metamagic: ok");

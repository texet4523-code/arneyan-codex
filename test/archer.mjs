// Jacob's Well feedback (8 Nov): bow-only rules, reminders only with the weapon they're for, no doubled labels.
import assert from "node:assert/strict";
import "./harness.mjs";
const E = await import("../arneyan/module/effects.mjs");

const w = name => ({ type: "weapon", name, _source: { name }, flags: {} });
const bow = w("Bow, Long Composite"), short = w("Shortbow"), xbow = w("Crossbow, Light"), axe = w("Axe, Two-Handed");
assert.ok(E.weaponMatches({ weapon: "bow" }, bow));
assert.ok(E.weaponMatches({ weapon: "bow" }, short), "Shortbow");
assert.ok(E.weaponMatches({ weapon: "bow" }, w("Bow, Short")));
assert.ok(!E.weaponMatches({ weapon: "bow" }, xbow), "a crossbow isn't a bow");
assert.ok(!E.weaponMatches({ weapon: "bow" }, axe));
assert.ok(E.weaponMatches({ weapon: "bow:remind" }, bow), "the :remind scope still knows its weapon");

const set = new E.ModSet([
  { key: "damage.ranged", value: "+2", when: "with bows", label: "Bow Mastery", weapon: "bow", data: {} },
  { key: "adv.attack.first", value: "1", when: "if you moved at least 10ft this turn first", label: "Running Shot", weapon: "bow:remind", data: {} },
  { key: "note.attack", value: "Bent Path: your first shot each round ignores Half Cover.", label: "Bent Path", weapon: "bow", data: {} },
  { key: "damage", value: "2", when: "with your Weapon Master weapon (Longbow)", label: "Weapon Master", weapon: "chosen", names: ["Bow, Long Composite"], data: {} },
  { key: "note.attack", value: "Lucky: reroll a 1.", label: "Lucky", data: {} },
  { key: "note.attack", value: "Steady: breathe.", label: "Steady", data: {} }
]);
const notesFor = item => { const fw = set.forWeapon(item); return [...new Set([...set.notesFor("attack").filter(t => !fw.drop.has(t)), ...fw.mods.notesFor("attack")])]; };
const withBow = notesFor(bow), withAxe = notesFor(axe);
assert.ok(withBow.some(n => n.startsWith("Running Shot")), "Running Shot reminds on a bow card");
assert.ok(!withAxe.some(n => n.startsWith("Running Shot")), "never on an axe card");
assert.ok(withBow.includes("Bent Path: your first shot each round ignores Half Cover."), "Bent Path once, not 'Bent Path: Bent Path:'");
assert.ok(!withAxe.some(n => n.startsWith("Bent Path")));
assert.ok(!withAxe.some(n => /Bow Mastery|Weapon Master/.test(n)), "no bow or Weapon Master reminders on the axe");
assert.ok(!withBow.some(n => /Bow Mastery|Weapon Master/.test(n)), "with the bow they apply instead of reminding");
assert.ok(withAxe.includes("Steady: Steady: breathe.") === false && withAxe.includes("Steady: breathe."));
const dmg = set.forWeapon(bow).mods.damage(["damage", "damage.ranged"]).map(t => `${t.label} ${t.value}`);
assert.deepEqual(dmg.sort(), ["Bow Mastery +2", "Weapon Master +2"].sort());
assert.deepEqual(set.forWeapon(axe).mods.damage(["damage", "damage.ranged"]), []);
assert.deepEqual(set.forWeapon(bow).mods.adv("adv.attack.first").values, [], "Running Shot is never applied by itself");
// Weapon Master not picked yet: its reminder stays everywhere, so the player knows to pick.
const unpicked = new E.ModSet([{ key: "damage", value: "2", when: "with your Weapon Master weapon", label: "Weapon Master", weapon: "chosen", names: [], data: {} }]);
const fw = unpicked.forWeapon(axe);
assert.ok(unpicked.notesFor("damage").filter(t => !fw.drop.has(t)).some(n => n.startsWith("Weapon Master")));
console.log("OK archer");

/* Descriptions: a lone "Effect:" bullet reads as a paragraph. */
const T = await import("../arneyan/module/text.mjs");
assert.equal(T.tidyDescription("<ul><li><strong>Effect:</strong> Moved <strong>10ft</strong>.</li></ul>"), "<p>Moved <strong>10ft</strong>.</p>");
assert.equal(T.tidyDescription("<ul><li><strong>Effect:</strong> Two.</li><li><strong>Fire:</strong> 1d6</li></ul><p>x</p>"), "<p>Two.</p><ul><li><strong>Fire:</strong> 1d6</li></ul><p>x</p>");
assert.equal(T.tidyDescription("<p>Plain.</p>"), "<p>Plain.</p>");
assert.equal(T.tidyDescription(null), "");
console.log("OK descriptions");

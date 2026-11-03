// 0.10.82: what the table sees. Bloodied is a token marker on a solo (solo.mjs), and the 20 Named Uniques
// (Monsters & Treasure v0.10.41) are weapons in the equipment compendium, with their own icons.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
for (const k of ["Actor", "Item", "Combatant", "ChatMessage"]) globalThis[k] ??= class {};

const S = await import("../arneyan/module/solo.mjs");
const T = await import("../arneyan/module/treasure.mjs");
const C = await import("../arneyan/module/config.mjs");
const root = p => new URL(`../${p}`, import.meta.url);

/* Bloodied: a condition with an icon, no counter and no rules; the marker survives the clean-up it marks. */
const b = C.ARNEYAN.conditions.bloodied;
assert.equal(b.counter, "none");
assert.deepEqual(b.rules, []);
assert.ok(fs.existsSync(root("arneyan/assets/conditions/bloodied.svg")), "its icon is built");
const solo = { uuid: "Actor.s", effects: [
  { name: "Bloodied", statuses: new Set(["bloodied"]), origin: "Actor.s", flags: { arneyan: { bloodied: true } } },
  { name: "Frightened", statuses: new Set(["frightened"]), origin: "Actor.foe" }
] };
assert.deepEqual(S.bloodiedEnds(solo, () => "foe").map(e => e.name), ["Frightened"], "Bloodied stays, the foe's condition ends");
const solo_src = fs.readFileSync(root("arneyan/module/solo.mjs"), "utf8");
assert.ok(/statuses: \["bloodied"\]/.test(solo_src), "put on at half HP");

/* The Named Uniques as items. */
const dir = root("packs-src/equipment/");
const items = fs.readdirSync(dir).map(f => JSON.parse(fs.readFileSync(new URL(f, dir), "utf8")));
const all = Object.entries(T.NAMED_UNIQUES).flatMap(([plus, names]) => names.map(n => [n, Number(plus)]));
assert.equal(all.length, 20);
for (const [name, plus] of all) {
  const it = items.find(i => i.name === name);
  assert.ok(it, `${name} is in the compendium`);
  assert.equal(it.type, "weapon", name);
  assert.equal(it.system.magic, plus, `${name} is +${plus}`);
  assert.equal(it.system.price, "Unique (never for sale)", name);
  assert.ok(it.system.damage, `${name} has its base weapon's damage`);
  assert.match(it.img, /assets\/icons\/unique-[a-z-]+\.svg$/, name);
  assert.ok(fs.existsSync(root(it.img.replace(/^systems\//, ""))), `${name}'s icon is built`);
  assert.ok(/<strong>Quirk \(/.test(it.system.description), `${name} has its quirk`);
  assert.ok(it.flags.arneyan.baseWeapon, `${name} knows its base weapon`);
}
assert.equal(new Set(all.map(([n]) => items.find(i => i.name === n).img)).size, 20, "each its own icon");
const wyrm = items.find(i => i.name === "Wyrmsbane");
assert.deepEqual(wyrm.system.bonusDamage.map(x => [x.formula, x.when]), [["2d6", "against dragons"]]);
assert.equal(items.find(i => i.name === "Gravebane").system.bonusDamage[0].type, "radiant");
assert.ok(!items.find(i => i.name === "Adder's Kiss").system.bonusDamage.length, "a once-a-day rider is not an always-on extra");
// Retort shares its name with the alchemist's glassware: the card links the weapon.
assert.ok(/weapons\.includes\(n\) && all\.find\(x => x\.type === "weapon"\)/.test(fs.readFileSync(root("arneyan/module/treasure.mjs"), "utf8")));
/* Review fixes: a Named Unique answers to its base weapon; Stonefather's quirk; the save line only where there's a save. */
const E = await import("../arneyan/module/effects.mjs");
const tide = items.find(i => i.name === "Tidecaller");
assert.equal(E.isTwoHanded(tide), false, "Tidecaller is a trident: one-handed (Kieran, 20 Oct)");
assert.equal(E.isTwoHanded(items.find(i => i.name === "Soulthief")), true, "Soulthief is a greatsword");
assert.equal(E.weaponMatches({ weapon: "chosen", names: ["Sword, Long"] }, wyrm), true, "a long sword pick counts for Wyrmsbane");
assert.equal(items.find(i => i.name === "Stonefather").system.slots, items.find(i => i.name === "Maul" && i.type === "weapon").system.slots + 1, "Heavy: 1 more slot");
assert.ok(!/Saves use/.test(items.find(i => i.name === "Retort").system.description), "no save, no save line");
assert.ok(/Saves use/.test(items.find(i => i.name === "Hillfeller").system.description));
/* The marker comes off by its status, whoever put it on, and after a heal that beat the marker. */
assert.ok(/statuses\?\.has\?\.\("bloodied"\)\)\.map/.test(solo_src) && /if \(!actor\.getFlag\(SYS, "bloodied"\)\) await removeBloodied/.test(solo_src));
/* Foundry v14 hides an icon without a duration unless it shows always: a status effect made by hand shows always. */
const K = await import("../arneyan/module/counters.mjs");
const SHOW = { NONE: 0, CONDITIONAL: 1, ALWAYS: 2 };
assert.equal(K.showIconFor({ name: "Bloodied", statuses: ["bloodied"] }, SHOW), 2);
assert.equal(K.showIconFor({ name: "Bless" }, SHOW), null, "no status: Foundry's own rule");
assert.equal(K.showIconFor({ statuses: ["frightened"], showIcon: 1 }, SHOW), null, "its own setting stays");
assert.equal(K.showIconFor({ statuses: ["bloodied"] }, undefined), null, "v13: no such field");
const read = p => fs.readFileSync(root(`arneyan/module/${p}`), "utf8");
assert.ok(/Hooks\.on\("preCreateActiveEffect", \(effect, data\) => \{\s*const v = showIconFor\(data\)/.test(read("counters.mjs")), "the hook is wired");
assert.ok(/showIcon: CONST\.ACTIVE_EFFECT_SHOW_ICON\.ALWAYS/.test(read("transform.mjs")), "a form's Paralysed, made inside the new actor");
console.log("visuals0182: ok");

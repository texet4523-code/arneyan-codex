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
assert.ok(/statuses: \["bloodied"\]/.test(solo_src) && /flags\?\.\[SYS\]\?\.bloodied/.test(solo_src), "put on at half HP, taken off at full");

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
  assert.ok(/<em>Quirk|Quirk/.test(it.system.description), `${name} has its quirk`);
}
assert.equal(new Set(all.map(([n]) => items.find(i => i.name === n).img)).size, 20, "each its own icon");
const wyrm = items.find(i => i.name === "Wyrmsbane");
assert.deepEqual(wyrm.system.bonusDamage.map(x => [x.formula, x.when]), [["2d6", "against dragons"]]);
assert.equal(items.find(i => i.name === "Gravebane").system.bonusDamage[0].type, "radiant");
assert.ok(!items.find(i => i.name === "Adder's Kiss").system.bonusDamage.length, "a once-a-day rider is not an always-on extra");
console.log("visuals0182: ok");

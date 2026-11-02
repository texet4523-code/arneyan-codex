// Books v0.10.40 (K47; board B-F27) in the system (0.10.81): Legendary Resistance leaves the game; solos get a second
// turn, Shaking it off and Bloodied (solo.mjs).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
for (const k of ["Actor", "Item", "Combatant", "ChatMessage"]) globalThis[k] ??= class {};

const S = await import("../arneyan/module/solo.mjs");
const M = await import("../arneyan/module/migrate.mjs");
const read = (dir, prefix) => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith(prefix))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const monsters = read("monsters", "actors_");
const solos = monsters.filter(m => m.system.details.isSolo);

/* The Bestiary: no Legendary Resistance anywhere; each solo's description has the solo rules. */
assert.equal(solos.length, 53, "53 marked solo; the Rakshasa had Legendary Resistance but no solo tag");
assert.ok(!monsters.some(m => m.items.some(i => i.name === "Legendary Resistance")));
assert.ok(solos.every(m => m.system.details.description.includes("<strong>Solo:</strong>")));
assert.ok(!monsters.filter(m => !m.system.details.isSolo).some(m => m.system.details.description.includes("<strong>Solo:</strong>")));
const maze = read("spells", "items_").find(s => s.name === "Maze");
assert.ok(!/Legendary Resistance/.test(maze.system.description));
const book4 = read("rules", "journal_").find(j => j.name === "Book IV: Spellcasting");
assert.equal(book4.pages.find(p => p.name === "Solo Creatures")?._id, "WeB56u4ggrXEjqDY", "the old page's id");

/* Second turn: 10 lower, or last in the round. */
assert.equal(S.secondInitiative(18, [12, 5]), 8);
assert.equal(S.secondInitiative(11, [12, 5]), 1);
assert.equal(S.secondInitiative(9, [12, 5]), 0, "below 1: last (0, under everyone at 1 or more)");
assert.equal(S.secondInitiative(6, [12, -2]), -3, "under a negative initiative too");

/* Shaking it off: two of its turns under it. */
let r = S.shakeOff({}, ["stunned", "prone"]);
assert.deepEqual([r.counts, r.off], [{ stunned: 1 }, []], "prone isn't one of them");
r = S.shakeOff(r.counts, ["stunned", "charmed"]);
assert.deepEqual([r.counts, r.off], [{ charmed: 1 }, ["stunned"]]);
r = S.shakeOff(r.counts, []);
assert.deepEqual(r.counts, {}, "a condition gone resets its count");
assert.ok(S.CONTROL.includes("petrified") && S.CONTROL.includes("dominated") && !S.CONTROL.includes("frightened"));

/* Bloodied ends conditions and others' effects, not its own buffs or concentration. */
{
  const actor = { uuid: "Actor.troll", effects: [
    { id: "a", name: "Held", statuses: new Set(["paralysed"]), origin: "Actor.wiz.Item.hold" },
    { id: "b", name: "Bane", statuses: new Set(), origin: "Actor.cleric.Item.bane" },
    { id: "c", name: "Its own rage", statuses: new Set(), origin: "Actor.troll.Item.rage" },
    { id: "d", name: "Prone", statuses: new Set(["prone"]), origin: null },
    { id: "e", name: "Concentrating", statuses: new Set(["concentrating"]), origin: "Actor.troll.Item.x", flags: { arneyan: { concentration: true } } }
  ] };
  assert.deepEqual(S.bloodiedEnds(actor).map(e => e.id), ["a", "b", "d"]);
}

/* The migration takes the Bestiary's Legendary Resistance off world solos, not a GM's own ability of that name. */
assert.equal(M.SOLO_REWORK, "0.10.81");
assert.deepEqual(M.dropLegendary([
  { id: "x", type: "ability", name: "Legendary Resistance", system: { description: "<p>3 times per encounter, when it fails a save it may succeed instead.</p>" } },
  { id: "y", type: "ability", name: "Legendary Resistance", system: { description: "<p>My homebrew: once a day, reroll a save.</p>" } },
  { id: "z", type: "ability", name: "Regeneration", system: { description: "" } }
]), ["x"]);

/* The tracker counts a solo once, and its morale group leaves the second turn out. */
const src = p => fs.readFileSync(new URL(`../arneyan/module/${p}`, import.meta.url), "utf8");
assert.ok(src("encounter.mjs").includes("!c.flags?.arneyan?.soloOf"));
assert.ok(src("combat.mjs").includes("!o.flags?.arneyan?.soloOf"));
assert.ok(src("arneyan.mjs").includes("registerSolo();"));
console.log("OK books v0.10.40");

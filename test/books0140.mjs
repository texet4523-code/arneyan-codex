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
const src = p => fs.readFileSync(new URL(`../arneyan/module/${p}`, import.meta.url), "utf8");
const solos = monsters.filter(m => m.system.details.isSolo);

/* The Bestiary: no Legendary Resistance anywhere; each solo's description has the solo rules. */
assert.ok(solos.length >= 53, "53 solos in v0.10.40; v0.10.41 re-levels the Archmage as a solo");
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
// Every key written (a flag update merges: a key left out would keep its old count).
const zero = S.noCounts();
let r = S.shakeOff({}, ["stunned", "prone"]);
assert.deepEqual([r.counts, r.off], [{ ...zero, stunned: 1 }, []], "prone isn't one of them");
r = S.shakeOff(r.counts, ["stunned", "charmed"]);
assert.deepEqual([r.counts, r.off], [{ ...zero, charmed: 1 }, ["stunned"]], "shaken off: its count back to 0");
r = S.shakeOff(r.counts, []);
assert.deepEqual(r.counts, zero, "a condition gone resets its count");
assert.equal(S.shakeOff({ ...zero }, ["stunned"]).counts.stunned, 1, "stunned again later: two more turns");
// M&T v0.10.41 (K48): the wider list, Feeblemind and Polymorph effects by name, and one turn the second time.
assert.ok(["petrified", "dominated", "frightened", "slowed", "restrained", "blinded"].every(id => S.CONTROL.includes(id)) && !S.CONTROL.includes("prone"));
assert.deepEqual(S.shakeOff({}, ["feeblemind"], 1).off, ["feeblemind"], "the second time in a fight: after one turn");
assert.deepEqual(S.shakeOff({}, ["stunned"], 2).off, [], "the first time: two turns");
assert.ok("polymorph" in S.noCounts() && "feeblemind" in S.noCounts());
{
  // The Feeblemind spell's effect is "Feebleminded"; a solo turned into another creature counts as Polymorph.
  const fm = { effects: [{ name: "Feebleminded", disabled: false, statuses: new Set(), flags: {} }] };
  assert.deepEqual(S.controlOn(fm), ["feeblemind"]);
  assert.deepEqual(S.controlOn({ effects: [] }, { form: true }), ["polymorph"]);
  // A condition running out at this turn change isn't shaken off: Stunned 1 ticking off, or its rounds reached.
  const combat = { id: "c1", round: 3, turn: 2 };
  const ticking = { effects: [{ name: "Stunned", disabled: false, statuses: new Set(["stunned"]), flags: { arneyan: { value: 1 } } }] };
  assert.deepEqual(S.controlOn(ticking, { combat }), []);
  const timed = { effects: [{ name: "Held", disabled: false, statuses: new Set(["paralysed"]), flags: { arneyan: { expires: { combat: "c1", round: 3, turn: 1 } } } }] };
  assert.deepEqual(S.controlOn(timed, { combat }), []);
  const lasting = { effects: [{ name: "Held", disabled: false, statuses: new Set(["paralysed"]), flags: { arneyan: { expires: { combat: "c1", round: 5, turn: 1 } } } }] };
  assert.deepEqual(S.controlOn(lasting, { combat }), ["paralysed"]);
}
assert.equal(M.CLASS_REWORK, "0.10.81", "worlds at 0.10.79 and 0.10.80 take the new class features");
{
  const actor = { effects: [{ name: "Feeblemind", disabled: false, statuses: new Set() }, { name: "Prone", disabled: false, statuses: new Set(["prone"]) }, { name: "Slow", disabled: false, statuses: new Set(["slowed"]) }] };
  assert.deepEqual(S.controlOn(actor).sort(), ["feeblemind", "slowed"]);
}

/* Bloodied ends conditions and foes' effects; not its own buffs, area or aura, allies' buffs, or concentration. */
{
  const actor = { uuid: "Actor.troll", effects: [
    { id: "a", name: "Held", statuses: new Set(["paralysed"]), origin: "Actor.wiz.Item.hold" },
    { id: "b", name: "Bane", statuses: new Set(), origin: "Actor.cleric.Item.bane" },
    { id: "c", name: "Its own rage", statuses: new Set(), origin: "Actor.troll.Item.rage" },
    { id: "d", name: "Prone", statuses: new Set(["prone"]), origin: null },
    { id: "e", name: "Concentrating", statuses: new Set(["concentrating"]), origin: "Actor.troll.Item.x", flags: { arneyan: { concentration: true } } },
    { id: "f", name: "Its own Darkness area", statuses: new Set(), origin: null },
    { id: "g", name: "Bless from the hag", statuses: new Set(), origin: "Actor.hag.Item.bless" },
    { id: "h", name: "Shook off Stunned", statuses: new Set(), origin: "Actor.troll", flags: { arneyan: { shookOff: { id: "stunned", turns: 1 } } } },
    { id: "i", name: "Its own invisibility", statuses: new Set(["invisible"]), origin: "Actor.troll.Item.inv" }
  ] };
  const side = o => (o.startsWith("Actor.hag.") ? "ally" : "foe");
  assert.deepEqual(S.bloodiedEnds(actor, side).map(e => e.id), ["a", "b", "d"]);
}
{
  const solo = fs.readFileSync(new URL("../arneyan/module/solo.mjs", import.meta.url), "utf8");
  assert.ok(solo.includes("encounter: combat?.id") && solo.includes("round: round + 2, turn: 0"), "the immunity ends at the end of the following round, or with the fight");
  assert.ok(!/expires\.round`\]: Number/.test(solo), "durations in rounds run as normal on a solo (F-R5)");
}
// Once a round (M&T v0.10.41): ongoing, aura and area damage and regeneration only on its first turn; no Exhaustion Max HP loss.
for (const f of ["chat.mjs", "auras.mjs", "areas.mjs", "qol.mjs"]) assert.ok(src(f).includes("soloOf"), f);
assert.ok(src("effects.mjs").includes('filter(r => r.key !== "hp.mult")'));

/* The migration takes the Bestiary's Legendary Resistance off world solos, not a GM's own ability of that name. */
assert.equal(M.SOLO_REWORK, "0.10.81");
assert.deepEqual(M.dropLegendary([
  { id: "x", type: "ability", name: "Legendary Resistance", system: { description: "<p>3 times per encounter, when it fails a save it may succeed instead.</p>" } },
  { id: "y", type: "ability", name: "Legendary Resistance", system: { description: "<p>My homebrew: once a day, reroll a save.</p>" } },
  { id: "z", type: "ability", name: "Regeneration", system: { description: "" } }
]), ["x"]);

/* The tracker counts a solo once, and its morale group leaves the second turn out. */
assert.ok(src("encounter.mjs").includes("!c.flags?.arneyan?.soloOf"));
assert.ok(src("combat.mjs").includes("!o.flags?.arneyan?.soloOf"));
assert.ok(src("arneyan.mjs").includes("registerSolo();"));
assert.ok(src("qol.mjs").includes("!c.flags?.[SYS]?.soloOf") && src("qol.mjs").includes("secondInitiative(init"), "the second turn isn't rolled: it follows");
assert.ok(src("migrate.mjs").includes("!t.actorLink"), "unlinked tokens too");
assert.ok(src("solo.mjs").includes("done.has(key)"), "a re-sent turn isn't counted twice");
/* Books v0.10.41 to v0.10.43, module side. */
{
  const { ARNEYAN } = await import("../arneyan/module/config.mjs");
  assert.deepEqual([12, 13, 24].map(l => ARNEYAN.bth("rogue", l)), [2, 7, 15], "the Rogue and the Assassin join the Knight track from 13th");
  const E = await import("../arneyan/module/effects.mjs");
  assert.ok(E.weaponMatches({ weapon: "unarmed" }, { type: "weapon", name: "Unarmed Strike" }) && !E.weaponMatches({ weapon: "unarmed" }, { type: "weapon", name: "Quarterstaff" }), "Iron Fists counts on Unarmed Strike only");
  assert.ok(E.weaponMatches({ weapon: "unarmed" }, { type: "weapon", name: "Fist" }), "and on the Catalogue's Fist (Sarrix carries it)");
  assert.ok(src("transform.mjs").includes("form's HP can't exceed the druid's own Max HP"));
  assert.deepEqual(M.RENAMED_FEATURES["Compendium.arneyan.spells.Item.0zqPnCOdDm0Tb4IW"], ["Hex", "Malediction"]);
  const T = await import("../arneyan/module/treasure.mjs");
  assert.deepEqual(Object.values(T.NAMED_UNIQUES).map(l => l.length), [8, 8, 4], "the 20 Named Uniques by bonus");
}

console.log("OK books v0.10.40");

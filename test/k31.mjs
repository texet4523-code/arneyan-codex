// K31 (Kieran, 29 Oct 2026): no generic +1 weapons. The Broken Anvil Veterans' magic weapons each have a name, a line
// of who they belong to and one thing of their own, and still answer to the Catalogue weapon they're made from.
import assert from "node:assert/strict";
import fs from "node:fs";

const dir = new URL("../packs-src/pregens/", import.meta.url);
const actors = fs.readdirSync(dir).filter(f => f.startsWith("actors_")).map(f => JSON.parse(fs.readFileSync(new URL(f, dir), "utf8")));
const want = { "Kavra Skyhewn": "Thunderbite", "Liriel Vance": "Opal Hush", "Sister Aurelle Dawnward": "Dawnmercy", "Marten Halloway": "Halloway's Oath", "Sarrix Stormscale": "Ascendant's Spine" };
for (const a of actors) {
  for (const w of a.items.filter(i => i.type === "weapon" && i.system.magic)) {
    assert.equal(w.name, want[a.name], `${a.name}'s magic weapon is named`);
    assert.ok(w._stats.compendiumSource.startsWith("Compendium.arneyan.equipment."), "still linked to its Catalogue weapon");
    assert.ok(/<em>/.test(w.system.description), "a line of who it belongs to");
    const own = (w.system.bonusDamage ?? []).length || (w.system.rules ?? []).length || w.flags?.arneyan?.misfire !== undefined;
    assert.ok(own, `${w.name} has something of its own beyond +${w.system.magic}`);
  }
}
const oath = actors.find(a => a.name === "Marten Halloway").items.find(i => i.name === "Halloway's Oath");
assert.equal(oath.flags.arneyan.misfire, 1);
console.log("OK K31 named weapons");

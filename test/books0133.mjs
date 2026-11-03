// Books v0.10.33 (R-B14, K30; board B-F20) in the system (0.10.76): Guardian's Reach once per round, Sorcerer's Spark
// twice a day from its 20th-level improvement, the Bestiary Imp's sting applies Poisoned.
import assert from "node:assert/strict";
import fs from "node:fs";

const packDocs = (dir, prefix = "items_") => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith(prefix))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const features = packDocs("class-features");
// Books v0.10.38 (Fable M5): Sorcerer's Spark gave way to Wild Surge improves (5th and 20th), keeping its ids.
const surge = features.filter(f => f.name === "Wild Surge improves" && f.system.className === "Sorcerer");
// Books v0.10.41 adds a third at 13th (a new id); the 5th and 20th keep the Spark's.
assert.deepEqual(surge.map(f => f._id).sort(), ["UTIrytRZu4fYc46O", "htfHPooYPhlXxkWY", "oJxxsvpo4WgI1u92"]);
assert.ok(!features.some(f => /^Sorcerer's Spark/.test(f.name)));
const guard = packDocs("kits").find(k => k.name === "Mournas Liberator (Fighter)").system.features[0];
assert.ok(/^<p>Once per round/.test(guard.description), guard.description);
assert.equal(guard.applies[0].rules[0].key, "adv.against");
const imp = packDocs("monsters", "actors_").find(m => m.name === "Imp");
const sting = imp.items.find(i => i.name === "Poison Sting").system;
assert.ok(sting.description.includes("@Condition[poisoned|1]") && !/4 rounds/.test(sting.description), "the link puts Poisoned on as a venom");
assert.deepEqual([sting.damage, sting.damageType], ["", ""], "no Roll damage: the 1d6 is Poisoned's own each turn (and a Tier 1 pact Imp doesn't double it)");
const hound = packDocs("monsters", "actors_").find(m => m.name === "Hell Hound");
assert.ok(hound.items.some(i => /Once per <strong>3 rounds<\/strong>/.test(i.system.description ?? "")), "the Bestiary keeps once per 3 rounds");
console.log("OK 0.10.76 books v0.10.33");

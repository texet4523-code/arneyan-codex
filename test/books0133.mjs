// Books v0.10.33 (R-B14, K30; board B-F20) in the system (0.10.76): Guardian's Reach once per round, Sorcerer's Spark
// twice a day from its 20th-level improvement, the Bestiary Imp's sting applies Poisoned.
import assert from "node:assert/strict";
import fs from "node:fs";

const packDocs = (dir, prefix = "items_") => fs.readdirSync(new URL(`../packs-src/${dir}/`, import.meta.url)).filter(f => f.startsWith(prefix))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${dir}/${f}`, import.meta.url), "utf8")));
const features = packDocs("class-features");
const spark = features.find(f => f.name === "Sorcerer's Spark" && f.system.className === "Sorcerer").system;
assert.deepEqual([spark.uses.per, spark.uses.formula], ["day", "1:1, 20:2"], "twice a day from 20th");
const improved = features.find(f => f.name === "Sorcerer's Spark (Improved)").system;
assert.ok(/twice per day/.test(improved.description) && !/10 minutes/.test(improved.description));
const guard = packDocs("kits").find(k => k.name === "Mournas Liberator (Fighter)").system.features[0];
assert.ok(/^<p>Once per round/.test(guard.description), guard.description);
assert.equal(guard.applies[0].rules[0].key, "adv.against");
const imp = packDocs("monsters", "actors_").find(m => m.name === "Imp");
const sting = imp.items.find(i => i.name === "Poison Sting").system;
assert.ok(sting.description.includes("@Condition[poisoned]") && !/4 rounds/.test(sting.description));
assert.deepEqual([sting.damage, sting.damageType], ["1d6", "poison"]);
const hound = packDocs("monsters", "actors_").find(m => m.name === "Hell Hound");
assert.ok(hound.items.some(i => /Once per <strong>3 rounds<\/strong>/.test(i.system.description ?? "")), "the Bestiary keeps once per 3 rounds");
console.log("OK 0.10.76 books v0.10.33");

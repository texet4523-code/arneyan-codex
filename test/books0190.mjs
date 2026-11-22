// HB v0.10.90 (S-F5, R-S6, K294): the Armourer's Toolkit; Shattered Glass at 10th only; the Armourer in Kit Variance.
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
const dir = new URL("../packs-src/", import.meta.url);
const docs = pack => fs.readdirSync(new URL(pack, dir)).filter(f => f.startsWith("items_") || f.startsWith("journal_"))
  .map(f => JSON.parse(fs.readFileSync(new URL(`${pack}/${f}`, dir), "utf8")));
const plain = h => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/* The Armourer's own toolkit, at 35 sp, free to an Armourer Artificer. */
const kit = docs("equipment").find(i => i.name === "Armourer's Toolkit");
assert.ok(kit, "Armourer's Toolkit in the Catalogue");
assert.equal(kit.system.price, "35 sp");
assert.match(plain(kit.system.description), /riveting hammer and punches, plate shears, a hand anvil/);
const { KIT_TOOLKITS } = await import("../arneyan/module/starting.mjs");
assert.equal(KIT_TOOLKITS.Armourer, "Armourer's Toolkit");
// The artisan's Armourer's Tools (the Armourer skill's) are still there, apart from it.
assert.ok(docs("equipment").some(i => i.name === "Armourer's Tools"));

/* Shattered Glass: one feature at 10th, with no 15th-level copy of its text. */
const sg = docs("class-features").filter(f => f.name === "Shattered Glass" && f.system.className === "Illusionist");
assert.equal(sg.length, 1);
assert.equal(sg[0].system.level, 10);
assert.doesNotMatch(sg[0].system.description, /15th level/);
const ill = docs("classes").find(c => c.name === "Illusionist");
assert.deepEqual(ill.system.features.filter(f => f.name === "Shattered Glass").map(f => f.level), [10]);

/* Kit Variance names the Armourer with the kits that need manufactured parts. */
assert.match(plain(docs("classes").find(c => c.name === "Artificer").system.description), /Infuser, Construct Engineer, Gadgeteer, Armourer: need manufactured components/);

/* The site's layout markers (<!-- NARROW --> and the like) don't show in the Character Creation journal. */
const cc = docs("rules").find(j => j.name === "Book II: Character Creation") ?? docs("rules").find(j => /Character Creation/.test(j.name));
assert.ok(cc);
assert.doesNotMatch(JSON.stringify(cc), /&lt;!--|<!--\s*(NARROW|WIDE|PAGEBREAK)/);

console.log("books0190: ok");

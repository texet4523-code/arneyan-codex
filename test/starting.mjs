// Starting Equipment & Gear: every class has a gold roll, every pack item and freebie is in the Catalogue.
import fs from "node:fs";
import assert from "node:assert/strict";
import "./harness.mjs";
const S = await import("../arneyan/module/starting.mjs");
const read = p => fs.readdirSync(new URL(`../packs-src/${p}/`, import.meta.url)).filter(f => f.startsWith("items_")).map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${p}/${f}`, import.meta.url))));
const classes = read("classes").map(d => d.name.replace(/\s*\(.*\)$/, ""));
for (const c of classes) assert.ok(S.goldFormulaFor(c), `no starting gold for ${c}`);
assert.equal(S.goldFormulaFor("Fighter"), "3d6");
assert.equal(S.goldCoinFor("Fighter"), "gp");
assert.equal(S.goldFormulaFor("Monk"), "5d4");
assert.equal(S.goldCoinFor("Monk"), "sp");
// Books v0.10.59 (K103): Book II's Starting Wealth table rolls gold (a Monk silver); the packs cost what Book II says (v0.10.60, K107).
const rules = fs.readdirSync(new URL("../packs-src/rules/", import.meta.url)).map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/rules/${f}`, import.meta.url))));
const book2 = rules.find(d => d.name.includes("Character Creation")).pages.map(p => p.text?.content ?? "").join("\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
for (const [cls, f] of Object.entries(S.STARTING_GOLD)) {
  if (cls === "Magus") continue;
  const coin = S.goldCoinFor(cls);
  assert.ok(new RegExp(`${cls}[^|]*?${f.replace("d", "d")} ${coin}`).test(book2) || book2.includes(`${f} ${coin}`), `${cls}: ${f} ${coin} not in Book II`);
}
for (const p of S.STARTING_PACKS) assert.ok(book2.includes(`${p.name} — ${p.sp} sp`), `${p.name} is not ${p.sp} sp in Book II`);
assert.ok(book2.includes("costing 30 gp or less"), "Gunslinger's free firearm limit");
const { priceText: coinText } = await import("../arneyan/module/money.mjs");
assert.equal(coinText(150), "15 gp"); assert.equal(coinText(15), "15 sp"); assert.equal(coinText(10000), "1,000 gp");
assert.equal(coinText(0.2), "2 cp"); assert.equal(coinText(5), "5 sp"); assert.equal(coinText(12.5), "12 sp 5 cp");
const names = new Set(read("equipment").map(d => d.name));
for (const p of S.STARTING_PACKS) for (const [n] of p.items) assert.ok(names.has(n), `${p.name}: ${n} not in the Catalogue`);
for (const n of [...S.FREE_FIREARMS, ...Object.values(S.KIT_TOOLKITS)]) assert.ok(names.has(n), `${n} not in the Catalogue`);
const kits = read("kits").filter(d => d.system.className === "Artificer").map(d => d.name.replace(/\s*\(.*\)$/, ""));
for (const k of kits) assert.ok(S.KIT_TOOLKITS[k], `no toolkit for Artificer kit ${k}`);
console.log("OK starting");

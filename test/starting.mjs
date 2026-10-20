// Starting Equipment & Gear: every class has a gold roll, every pack item and freebie is in the Catalogue.
import fs from "node:fs";
import assert from "node:assert/strict";
import "./harness.mjs";
const S = await import("../arneyan/module/starting.mjs");
const read = p => fs.readdirSync(new URL(`../packs-src/${p}/`, import.meta.url)).filter(f => f.startsWith("items_")).map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/${p}/${f}`, import.meta.url))));
const classes = read("classes").map(d => d.name.replace(/\s*\(.*\)$/, ""));
for (const c of classes) assert.ok(S.goldFormulaFor(c), `no starting gold for ${c}`);
assert.equal(S.goldFormulaFor("Fighter"), "3d6*10");
assert.equal(S.goldFormulaFor("Monk"), "5d4");
const names = new Set(read("equipment").map(d => d.name));
for (const p of S.STARTING_PACKS) for (const [n] of p.items) assert.ok(names.has(n), `${p.name}: ${n} not in the Catalogue`);
for (const n of [...S.FREE_FIREARMS, ...Object.values(S.KIT_TOOLKITS)]) assert.ok(names.has(n), `${n} not in the Catalogue`);
const kits = read("kits").filter(d => d.system.className === "Artificer").map(d => d.name.replace(/\s*\(.*\)$/, ""));
for (const k of kits) assert.ok(S.KIT_TOOLKITS[k], `no toolkit for Artificer kit ${k}`);
console.log("OK starting");

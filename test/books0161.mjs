// Books HB v0.10.61 (B-F53; K110, F-B13 and F-B14): ranged Martial feats, feats shared by two Paths (0.10.98).
import assert from "node:assert/strict";
import fs from "node:fs";
import "./harness.mjs";
for (const k of ["Actor", "Item", "Combatant", "ChatMessage"]) globalThis[k] ??= class {};

const P = await import("../arneyan/module/progression.mjs");
const feats = fs.readdirSync(new URL("../packs-src/feats/", import.meta.url)).filter(f => f.startsWith("items_"))
  .map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/feats/${f}`, import.meta.url), "utf8")));
const feat = n => { const r = feats.filter(d => d.name === n); assert.equal(r.length, 1, `one ${n}`); return r[0]; };

// Shared feats: one item (its old id), its Path plus the other Path that lists it, both "Available to" notes.
for (const [n, id] of [["Point-Blank Terror", "haGhp1pKRchF3fjE"], ["Steady Aim", "G8CxMGRm91vwyMVN"], ["Two-Weapon Fighting", "nJEPPwmAmkDCnXwZ"]]) {
  const d = feat(n);
  assert.equal(d._id, id, `${n} keeps its id`);
  assert.equal(d.system.path, "Specialist Path");
  assert.deepEqual(d.system.alsoPaths, ["Martial Path"], `${n} is also a Martial feat`);
  assert.ok(d.system.description.includes("Fighters") && d.system.description.includes("Artificers"), `${n}: both Paths' classes named`);
}
// A Fighter (Martial only) can take them; a Wizard (Arcane & Devout) can't.
const martial = new Set(["General Path", "Martial Path"]), arcane = new Set(["General Path", "Arcane & Devout Path"]);
assert.ok(P.featOpen(feat("Steady Aim"), martial));
assert.ok(!P.featOpen(feat("Steady Aim"), arcane));
assert.ok(feats.filter(d => d.system.path).every(d => Array.isArray(d.system.alsoPaths)), "every Path feat has the field (The Last Form, a Secret, has no Path)");

// The three new Martial feats (K110), with their buttons.
for (const n of ["Felling Shot", "Covering Fire", "Practised Thrower"]) assert.equal(feat(n).system.path, "Martial Path", n);
const felling = feat("Felling Shot").system.activities ?? [];
assert.ok(felling.some(a => a.kind === "save" && a.save === "fort"), "Felling Shot: a Fortitude save button");
assert.ok((feat("Covering Fire").system.activities ?? []).some(a => a.per === "round"), "Covering Fire: once per round");
assert.ok(feat("Mighty Deed of Arms").system.description.replace(/<[^>]+>/g, "").includes("5ft with a ranged attack"), "Mighty Deed at range");
assert.ok((feat("Mighty Deed of Arms").system.activities ?? []).some(a => /5ft with a ranged attack/.test(a.text)));

// F-B14: Book II's Starting Money line in sp and gp.
const rules = fs.readdirSync(new URL("../packs-src/rules/", import.meta.url)).map(f => JSON.parse(fs.readFileSync(new URL(`../packs-src/rules/${f}`, import.meta.url), "utf8")));
const book2 = rules.find(d => d.name.includes("Character Creation")).pages.map(p => p.text?.content ?? "").join(" ");
assert.ok(book2.includes("5d4 sp for a Monk up to 3d6 gp"), "F-B14");
console.log("OK books0161");
